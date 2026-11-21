import {randomUUID} from 'node:crypto';
import {tokyoDay} from './conversation-history.mjs';

// SQLite 留下正在执行的编号；任务日志保留按开始日期归档的完整经过。
export function createAutonomousAudit(db,write,now){
  db.exec('CREATE TABLE IF NOT EXISTS active_autonomous_actions(id TEXT PRIMARY KEY,event TEXT NOT NULL)');
  let closed=false;
  const active=db.prepare('SELECT event FROM active_autonomous_actions');
  const remove=db.prepare('DELETE FROM active_autonomous_actions WHERE id=?');
  function deliver(event,recover=false){
    void Promise.resolve(write(event,{recover})).then(ok=>{
      if(!closed&&ok!==false)remove.run(event.action_id);
    }).catch(()=>{});
  }
  function end(event,stage,result,finished){
    if(closed)return;
    const final={...event,stage,result,finished_at:finished,duration_ms:finished==null?null:Math.max(0,finished-event.started_at)};
    db.prepare('UPDATE active_autonomous_actions SET event=? WHERE id=?').run(JSON.stringify(final),event.action_id);
    deliver(final);
  }
  for(const r of active.all()){
    const event=JSON.parse(r.event);
    if(event.stage)deliver(event,true);
    else end(event,'中断','上次退出前未留下完成回执，结束时间和耗时未知',null);
  }
  function begin(action,goal,parent_id){
    const started_at=now(),action_id=randomUUID();
    const event={direction:'local',category:'绯月自主行动',route:action,goal,action_id,parent_id,started_at,archive_day:tokyoDay(started_at)};
    db.prepare('INSERT INTO active_autonomous_actions VALUES(?,?)').run(action_id,JSON.stringify(event));
    write({...event,stage:'开始'});
    return {
      finish:(stage,result)=>end(event,stage,String(result),now()),
      async step(name,target,work){
        const child=begin(name,target,action_id);
        try{const result=await work();child.finish('完成',result);return result;}
        catch(error){child.finish(['AbortError','TimeoutError'].includes(error.name)?'中断':'失败',error.message);throw error;}
      }
    };
  }
  return {begin,skip(action,goal,reason,due){
    const at=now();
    write({direction:'local',category:'绯月自主行动',route:action,goal,action_id:randomUUID(),stage:'未执行',scheduled_at:due,
      started_at:at,finished_at:at,duration_ms:0,result:reason,archive_day:tokyoDay(at)});
  },close(){
    for(const r of active.all()){
      const event=JSON.parse(r.event);
      if(!event.stage)end(event,'中断','绯月退出，未收到完成回执',now());
    }
    closed=true;
  }};
}
