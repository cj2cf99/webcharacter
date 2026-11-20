import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {taskReview} from '../agent/execution/review.mjs';
import {atomicFile,optional} from './memory-archive.mjs';

// 只读旧档。预迁移不封存游标，旧进程退出后首次正常启动再补录一次。
export async function migrateMemory(profile,memory,safeStorage,{preview=false}={}){
  const marker=join(memory.root,'归档管理','旧记录导入.json');
  const completed=await optional(readFile(marker,'utf8'));
  if(completed)return JSON.parse(completed);
  const checkpoint=join(memory.root,'归档管理','旧记录导入进度.json');
  const prior=JSON.parse(await optional(readFile(checkpoint,'utf8'))??'{}'),next={...prior};
  const dirty=new Set();
  function changed(key,content){
    next[key]=createHash('sha256').update(content).digest('hex');
    return next[key]!==prior[key];
  }
  let turns=0,logs=0,taskEvents=0;
  const conversations=join(profile,'conversations.sqlite');
  if(existsSync(conversations)){
    const db=new DatabaseSync(conversations,{readOnly:true});
    try{
      for(const row of db.prepare('SELECT id,at,day,payload FROM turns ORDER BY at').all()){
        turns++;
        if(!changed('turn:'+row.id,row.payload))continue;
        const decoded=await safeStorage.decryptStringAsync(Buffer.from(row.payload));
        await memory.save({...JSON.parse(decoded.result),id:row.id,at:row.at},{index:false});
        dirty.add(row.day);
      }
    }finally{db.close();}
  }
  const files=['task-traffic.previous.jsonl','task-traffic.jsonl'],groups=new Map();
  for(const name of files){
    const raw=await optional(readFile(join(profile,name),'utf8'));
    for(const line of (raw??'').split(/\r?\n/)){
      if(!line)continue;
      const day=JSON.parse(line).time.slice(0,10);
      if(!groups.has(day))groups.set(day,[]);
      groups.get(day).push(line);logs++;
    }
  }
  for(const [day,lines] of groups){
    if(!changed('log:'+day,lines.join('\n')))continue;
    const file=join(memory.folder(day),'日志','历史通信.jsonl');
    // 两次取样间旧日志可能已轮转，保留前一次独有的行及同内容行的出现次数。
    const previous=(await optional(readFile(file,'utf8'))??'').split(/\r?\n/).filter(Boolean);
    const counts=new Map();
    for(const line of previous)counts.set(line,(counts.get(line)??0)+1);
    for(const line of lines){
      if(counts.get(line)>0)counts.set(line,counts.get(line)-1);
      else previous.push(line);
    }
    await atomicFile(file,previous.join('\n')+'\n');
    dirty.add(day);
  }
  const tasks=join(profile,'tasks.sqlite');
  if(existsSync(tasks)){
    const db=new DatabaseSync(tasks,{readOnly:true});
    try{
      const review=taskReview(db,{readOnly:true});
      const days=db.prepare(`SELECT date(at,'+9 hours') AS day FROM task_review_events
        UNION SELECT date(started_at,'+9 hours') FROM executions
        UNION SELECT date(finished_at,'+9 hours') FROM executions WHERE finished_at IS NOT NULL`).all();
      for(const {day} of days){
        const rows=review.read(day);taskEvents+=rows.length;
        if(changed('task:'+day,JSON.stringify(rows))){await memory.saveTasks(day,rows,{index:false});dirty.add(day);}
      }
    }finally{db.close();}
  }
  const result={turns,logs,taskEvents,at:new Date().toISOString()};
  for(const day of dirty)await memory.refreshIndex(day);
  await atomicFile(checkpoint,JSON.stringify(next,null,2));
  if(!preview)await atomicFile(marker,JSON.stringify(result,null,2));
  return result;
}
