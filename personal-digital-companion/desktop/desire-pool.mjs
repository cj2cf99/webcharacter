import {createHash} from 'node:crypto';

const keyOf=(ref,type)=>createHash('sha256').update(JSON.stringify([ref,type])).digest('hex');
export function createDesirePool(db,transaction,onDelivered,onRefused){
  db.exec(`CREATE TABLE IF NOT EXISTS desires(id TEXT PRIMARY KEY,sin INTEGER NOT NULL,source TEXT NOT NULL,type TEXT NOT NULL,want TEXT NOT NULL,condition TEXT NOT NULL,state TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS desire_series ON desires(state,sin);
    CREATE TABLE IF NOT EXISTS triggers(id INTEGER PRIMARY KEY,sin INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,receipt TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS pending_series ON triggers(sin) WHERE active=1;
    CREATE TABLE IF NOT EXISTS rounds(id TEXT PRIMARY KEY,record TEXT NOT NULL);`);
  const run=(sql,...args)=>db.prepare(sql).run(...args);
  const all=(sql,...args)=>db.prepare(sql).all(...args);
  const record=id=>{const r=db.prepare('SELECT record FROM rounds WHERE id=?').get(id);return r&&JSON.parse(r.record);};
  function candidate(entry){
    if(!entry)return null;
    const id=keyOf(entry.source,entry.type);
    const prior=db.prepare('SELECT * FROM desires WHERE id=?').get(id);
    return prior?(prior.state==='pool'?prior:null):{...entry,id};
  }
  function prepare(id,entries,selected,observation){
    return transaction(()=>{
      const previous=record(id);if(previous)return previous;
      if(Object.hasOwn(observation,'previous')&&(observation.previous!==(recent()?.id??null)||unsettled()||feedback()))return null;
      for(const r of entries){
        r.id=keyOf(r.source,r.type);
        run("INSERT INTO desires VALUES(?,?,?,?,?,?,'pool') ON CONFLICT(id) DO NOTHING",r.id,r.sin,r.source,r.type,r.want,r.condition);
      }
      const item=entries[selected];
      const pick=item&&db.prepare("SELECT * FROM desires WHERE id=? AND state='pool'").get(item.id);
      const data={id,observation,entries,selected:pick?.id??null,status:'prepared'};
      run('INSERT INTO rounds VALUES(?,?)',id,JSON.stringify(data));
      for(const {sin} of all("SELECT sin FROM desires WHERE state='pool' AND id<>? GROUP BY sin HAVING COUNT(*)>=100",pick?.id??''))
        run('INSERT OR IGNORE INTO triggers(sin) VALUES(?)',sin);
      return data;
    });
  }
  function forced(canAct){
    for(const t of all('SELECT * FROM triggers WHERE active=1 ORDER BY id')){
      const prior=t.receipt&&db.prepare("SELECT json_extract(record,'$.item') AS item FROM rounds WHERE json_extract(record,'$.trigger')=? ORDER BY rowid DESC LIMIT 1").get(t.id);
      const row=all("SELECT * FROM desires WHERE sin=? AND state='pool' ORDER BY rowid",t.sin).find(r=>(!prior||r.id===prior.item)&&canAct(r));
      if(row)return {trigger:t.id,row};
    }
    return null;
  }
  function dispatch(id,item,trigger,decision){
    return transaction(()=>{
      const r=record(id);
      if(!r||r.status!=='prepared')return false;
      if(unsettled()||feedback())return false;
      if(item&&!run("UPDATE desires SET state='executing' WHERE id=? AND state='pool'",item).changes)return false;
      if(trigger){
        const t=db.prepare('SELECT sin,receipt FROM triggers WHERE id=? AND active=1').get(trigger);
        if(!t||!db.prepare('SELECT 1 FROM desires WHERE id=? AND sin=?').get(item,t.sin))throw Error('强制欲望归属已变化');
        if(t.receipt){run('UPDATE triggers SET active=0 WHERE id=?',trigger);}
        else {
        const count=db.prepare("SELECT count(*) AS n FROM desires WHERE state='pool' AND sin<>?").get(t.sin).n;
        const cleared=all("SELECT id FROM desires WHERE state='pool' AND sin=? ORDER BY rowid",t.sin).concat(
          all("SELECT id FROM desires WHERE state='pool' AND sin<>? ORDER BY random() LIMIT ?",t.sin,Math.ceil(count/2)));
        for(const row of cleared)run("UPDATE desires SET state='cleared' WHERE id=?",row.id);
        run('UPDATE triggers SET active=0,receipt=? WHERE id=?',JSON.stringify(cleared.map(x=>x.id)),trigger);
        }
      }
      r.status='dispatching';r.item=item;r.trigger=trigger;r.decision=decision;
      run('UPDATE rounds SET record=? WHERE id=?',JSON.stringify(r),id);return true;
    });
  }
  function finish(id,status,result,{adopt=false}={}){
    return transaction(()=>{
      const r=record(id);if(!r||!['prepared','dispatching','feedback'].includes(r.status))return;
      if(r.status==='feedback'&&status!=='done')return;
      if(r.item&&['dispatching','feedback'].includes(r.status))run('UPDATE desires SET state=? WHERE id=?',status==='feedback'?'executing':status==='done'?'done':'pool',r.item);
      if(adopt&&r.status==='dispatching')onDelivered?.(db.prepare('SELECT * FROM desires WHERE id=?').get(r.item),Boolean(r.trigger));
      if(status==='deferred'&&r.trigger)run('UPDATE triggers SET active=1 WHERE id=?',r.trigger);
      Object.assign(r,{status,result});run('UPDATE rounds SET record=? WHERE id=?',JSON.stringify(r),id);
      return r;
    });
  }
  function respond(id,receipt){
    return transaction(()=>{
      const r=record(id);
      if(!r||!['ask','speak'].includes(r.decision?.action)||!['dispatching','feedback','done'].includes(r.status))return;
      if(r.status==='done'&&r.response&&(r.response==='用户结束'||receipt!=='用户结束'))return;
      if(r.status!=='done'){
        run("UPDATE desires SET state='done' WHERE id=?",r.item);
        r.status='done';r.result=receipt;
      }
      if(receipt==='用户结束')onRefused?.(r.item);
      if(!r.response||receipt==='用户结束')r.response=receipt;
      run('UPDATE rounds SET record=? WHERE id=?',JSON.stringify(r),id);
    });
  }
  function closeSources(refs){
    for(const ref of refs)run("UPDATE desires SET state='ended' WHERE source=? AND state='pool'",ref);
  }
  function stopped(id,observation,reason){
    transaction(()=>{
      if(Object.hasOwn(observation,'previous')&&observation.previous!==(recent()?.id??null))return;
      run('INSERT OR IGNORE INTO rounds VALUES(?,?)',id,JSON.stringify({id,observation,status:'stopped',result:reason}));
    });
  }
  function recent(){return all("SELECT record FROM rounds ORDER BY rowid DESC LIMIT 1").map(r=>JSON.parse(r.record))[0];}
  const waiting=()=>all("SELECT * FROM desires WHERE state='pool' ORDER BY rowid LIMIT 20");
  const unsettled=()=>all("SELECT record FROM rounds WHERE json_extract(record,'$.status')='dispatching' ORDER BY rowid LIMIT 1").map(r=>JSON.parse(r.record))[0];
  const feedback=()=>all("SELECT record FROM rounds WHERE json_extract(record,'$.status')='feedback' ORDER BY rowid LIMIT 1").map(r=>JSON.parse(r.record))[0];
  return {candidate,stopped,waiting,feedback,unsettled,prepare,forced,dispatch,finish,respond,record,recent,closeSources};
}
