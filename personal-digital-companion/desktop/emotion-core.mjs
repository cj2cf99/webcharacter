import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {randomInt,randomUUID} from 'node:crypto';
import {tokyoDay} from './conversation-history.mjs';
import {createDesirePool} from './desire-pool.mjs';

const grades=[-5,-4,-3,-2,-1,1,2,3,4,5];
export const inclinations=['贪婪：分享结论求评价','色欲：亲密陪伴','傲慢：求证猜想','暴怒：敏感、直率，想被安抚','嫉妒：想被主动关心','怠惰：整理反省','暴食：好奇他的往事'];
const initial={grade:1,hold:0,word:'平静',line:'我在这儿。',desire:null,expressionAt:0};
export function tokyoWeek(at){
  const monday=new Date(tokyoDay(at)+'T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  return monday.toISOString().slice(0,10);
}
function step(grade,hold,kind,delta){
  if(kind==='reward')return [5,hold+3];
  if(hold)return [5,hold-Number(kind==='chat'||kind==='work')];
  return [grades[Math.max(0,Math.min(9,grades.indexOf(grade)+delta))],0];
}
export function createEmotionStore(profile,{now=Date.now,roll=()=>randomInt(1,8)}={}){
  const db=new DatabaseSync(join(profile,'emotions.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS weeks(week TEXT PRIMARY KEY,face INTEGER NOT NULL,at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,key TEXT NOT NULL UNIQUE,at INTEGER NOT NULL,kind TEXT NOT NULL,delta INTEGER NOT NULL,
      prior TEXT, payload TEXT, status TEXT NOT NULL, claimed TEXT UNIQUE, evidence TEXT UNIQUE, grade INTEGER, hold INTEGER, audit TEXT);
    CREATE INDEX IF NOT EXISTS emotion_order ON events(at,seq);
    CREATE INDEX IF NOT EXISTS emotion_pending ON events(status,seq);`);
  db.prepare('INSERT OR IGNORE INTO state VALUES(1,?,?)').run(now(),JSON.stringify(initial));
  const one=(query,...args)=>db.prepare(query).get(...args);
  const write=(query,...args)=>db.prepare(query).run(...args);
  const snapshot=()=>JSON.parse(one('SELECT data FROM state').data);
  const enabled=one('SELECT enabled FROM state').enabled;
  const save=s=>write('UPDATE state SET data=?',JSON.stringify(s));
  function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
  function week(at=now()){
    const key=tokyoWeek(at),stored=one('SELECT face FROM weeks WHERE week=?',key);
    if(stored)return stored.face;
    const prev=one('SELECT face FROM weeks WHERE week<? ORDER BY week DESC LIMIT 1',key)?.face;
    let face=roll();for(let i=0;i<10&&face===prev;i++)face=roll();
    if(face===prev)face=prev%7+1;
    write('INSERT INTO weeks VALUES(?,?,?)',key,face,at);return face;
  }
  function fold(row,s){
    const prev=one('SELECT grade,hold FROM events WHERE (at,seq)<(?,?) ORDER BY at DESC,seq DESC LIMIT 1',row.at,row.seq);
    let grade=prev?.grade??initial.grade,hold=prev?.hold??0;
    for(const e of db.prepare('SELECT seq,kind,delta,status FROM events WHERE (at,seq)>=(?,?) ORDER BY at,seq').all(row.at,row.seq)){
      if(e.status!=='replaced')[grade,hold]=step(grade,hold,e.kind,e.delta);
      write('UPDATE events SET grade=?,hold=? WHERE seq=?',grade,hold,e.seq);
    }
    Object.assign(s,{grade,hold});
  }
  function accept({key,at=now(),kind,user='',reply='',title='',publicTerm='',prior,onDevice=false}){
    if(!key||!Number.isFinite(at)||at<enabled||!['chat','work','gain','loss'].includes(kind))return false;
    return transaction(()=>{
      const s=snapshot(),id=prior===undefined&&s.desire?.at<=at?s.desire.id:prior;
      const delta={chat:0,work:-1,gain:1,loss:-1}[kind];
      const needs=kind==='chat'||Boolean(id);
      const added=write('INSERT OR IGNORE INTO events(key,at,kind,delta,prior,payload,status) VALUES(?,?,?,?,?,?,?)',
        key,at,kind,delta,id??null,JSON.stringify({user:user.slice(0,480),reply:reply.slice(0,240),title:title.slice(0,180),publicTerm:publicTerm.slice(0,120),...(onDevice?{onDevice:true}:{})}),needs?'pending':'done');
      if(!added.changes)return false;
      const old=s.grade;
      fold({at,seq:added.lastInsertRowid},s);
      if(s.grade!==old&&at>=s.expressionAt){
        s.expressionAt=at;
        s.word=s.grade<0?(kind==='work'?'疲惫':'担忧'):(s.grade===5?'开心':'平静');
        s.line=(kind==='work'?'刚忙完一件事。':'我记下这件事了。')+(s.desire?.want??'');
      }
      save(s);return true;
    });
  }
  function pending(skip=[]){
    const marks=skip.map(()=>'?').join(',');
    return one("SELECT * FROM events WHERE status='pending' "+(marks?'AND seq NOT IN ('+marks+') ':'')+
      'ORDER BY CASE WHEN prior IS NOT NULL AND prior=? THEN 0 ELSE 1 END,seq LIMIT 1',...skip,snapshot().desire?.id??null);
  }
  function settle(event,a,version){
    return transaction(()=>{
      const e=one('SELECT * FROM events WHERE seq=?',event.seq);
      if(e?.status!=='pending')return false;
      const s=snapshot(),active=Boolean(s.desire&&e.prior===s.desire.id&&s.desire.at<=e.at);
      const matched=active&&a.status==='satisfied'&&a.quote.trim()&&[JSON.parse(e.payload).user,JSON.parse(e.payload).title].some(t=>t?.includes(a.quote));
      let rewarded=false;
      if(matched){
        const grant=write("INSERT OR IGNORE INTO events(key,at,kind,delta,status,claimed,evidence) VALUES(?,?,'reward',0,'done',?,?)",
          'reward/'+e.prior,Math.max(e.at,now()),e.prior,e.key);
        rewarded=Boolean(grant.changes);
      }
      write('UPDATE events SET status=?,delta=?,audit=? WHERE seq=?',rewarded?'replaced':'done',e.kind==='chat'?a.delta:e.delta,
        JSON.stringify({version,assessment:a,previousGrade:e.grade,previousHold:e.hold}),e.seq);
      fold(e,s);
      const current=e.at>=s.expressionAt;
      if(rewarded||(active&&current&&a.status==='release'))s.desire=null;
      if(!s.desire&&s.suspended){s.desire=s.suspended;delete s.suspended;}
      if(current&&!s.desire&&a.want&&a.condition)s.desire={id:randomUUID(),want:a.want,condition:a.condition,at:now()};
      if(current||rewarded){
        s.expressionAt=Math.max(s.expressionAt,e.at);
        s.word=rewarded?'开心':s.grade<0?a.negative:a.positive;
        s.line=rewarded&&!current?'你记得我盼的那件事，我好开心。':a.line;
      }
      save(s);return true;
    });
  }
  function fact(ref){
    const e=one('SELECT at,kind,payload FROM events WHERE key=? AND payload IS NOT NULL',ref);
    if(!e)return null;const f=JSON.parse(e.payload);
    return f.onDevice?null:{ref,at:e.at,publicTerm:f.publicTerm,title:(f.user||f.title).slice(0,120)};
  }
  function recentFacts(limit=4){
    return db.prepare("SELECT key,at,kind,payload FROM events WHERE kind<>'reward' ORDER BY at DESC,seq DESC LIMIT ?").all(limit).map(e=>{
      const f=JSON.parse(e.payload);return {ref:e.key,at:e.at,publicTerm:f.publicTerm,text:f.onDevice?'':(f.user||f.title).slice(0,120)};
    }).filter(f=>f.text);
  }
  function release(id){
    const s=snapshot();
    if(s.desire?.id!==id)return;
    s.desire=s.suspended??null;delete s.suspended;save(s);
  }
  function adopt(item,forced=false){
    const s=snapshot();
    if(item&&(forced||!s.desire)){if(forced&&s.desire&&s.desire.id!==item.id)s.suspended=s.desire;s.desire={id:item.id,want:item.want,condition:item.condition,at:now()};save(s);}
  }
  week();
  return {pool:createDesirePool(db,transaction,adopt,release),snapshot,enabled,week,accept,pending,settle,recentFacts,fact,adopt,release,close:()=>db.close()};
}
