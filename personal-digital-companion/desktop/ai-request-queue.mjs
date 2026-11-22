import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

export const aiPoolLimit=40;
export const aiWakeCount=20;
const unavailable=(message,code)=>Object.assign(Error(message),{code});
const busy=error=>Number.isInteger(error?.errcode)&&(error.errcode&255)===5;
const errorCode=error=>typeof error?.code==='string'?error.code:error?.name??'Error';
const snapshotStatus=({cancelled,outcome})=>!outcome.failure?'done':
  cancelled&&outcome.failure.code==='AbortError'?'cancelled':'failed';

export function createAiRequestQueue({file,execute,interpret,log,safeStorage}){
  const db=new DatabaseSync(file);
  try{db.exec(`PRAGMA busy_timeout=0;
    PRAGMA synchronous=FULL;
    PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS ai_requests (
      seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, group_id TEXT NOT NULL,
      checkpoint TEXT UNIQUE, priority INTEGER NOT NULL, state TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 0, input TEXT NOT NULL, output TEXT
    );
    CREATE TABLE IF NOT EXISTS ai_attempt_snapshots (
      id TEXT PRIMARY KEY, started INTEGER NOT NULL, finished INTEGER, status TEXT NOT NULL,
      input BLOB, output BLOB
    );
    CREATE INDEX IF NOT EXISTS ai_attempt_snapshot_time ON ai_attempt_snapshots(finished);
    UPDATE ai_attempt_snapshots SET status='unknown' WHERE finished IS NULL AND status='running';
    DELETE FROM ai_requests WHERE group_id NOT IN (SELECT group_id FROM ai_requests WHERE checkpoint IS NOT NULL);
    UPDATE ai_requests SET state='parked' WHERE state IN ('ready','running');
    UPDATE ai_requests SET state='saved' WHERE state='raw';`);}
  catch(error){db.close();throw error;}
  const add=db.prepare("INSERT INTO ai_requests(id,group_id,checkpoint,priority,state,input) VALUES(?,?,?,?,'ready',?)");
  const size=db.prepare("SELECT count(*) AS n FROM ai_requests WHERE state IN ('ready','running','raw')");
  const readyCount=db.prepare("SELECT count(*) AS n FROM ai_requests WHERE state='ready'");
  const raw=db.prepare("SELECT * FROM ai_requests WHERE state='raw' ORDER BY seq LIMIT 1");
  const claim=db.prepare("UPDATE ai_requests SET state='running',attempt=attempt+1 WHERE id=(SELECT id FROM ai_requests WHERE state='ready' ORDER BY priority DESC,seq LIMIT 1) RETURNING *");
  const prioritize=db.prepare("UPDATE ai_requests SET priority=? WHERE group_id=? AND state='ready' AND priority<>?");
  const record=db.prepare("UPDATE ai_requests SET state='raw',output=? WHERE id=? AND state='running' AND attempt=?");
  const complete=db.prepare("UPDATE ai_requests SET state=?,output=?,checkpoint=? WHERE id=? AND state='raw' AND attempt=?");
  const recover=db.prepare('SELECT * FROM ai_requests WHERE checkpoint=?');
  const resume=db.prepare("UPDATE ai_requests SET state=CASE state WHEN 'saved' THEN 'raw' ELSE 'ready' END WHERE id=? AND state IN ('parked','saved')");
  const park=db.prepare("UPDATE ai_requests SET state=CASE state WHEN 'raw' THEN 'saved' ELSE 'parked' END WHERE group_id=? AND checkpoint IS NOT NULL AND state IN ('ready','running','raw')");
  const retry=db.prepare("UPDATE ai_requests SET state='parked',output=NULL WHERE id=? AND state='raw'");
  const erase=db.prepare('DELETE FROM ai_requests WHERE group_id=?');
  const findGroup=db.prepare("SELECT group_id FROM ai_requests WHERE checkpoint=? AND state='output'");
  const groups=new Map(), waiting=[], foreground=[], acknowledgements=new Set();
  const lifetime=new AbortController();
  const pack=value=>safeStorage?safeStorage.encryptString(JSON.stringify(value)):JSON.stringify(value);
  const unpack=value=>JSON.parse(typeof value==='string'?value:safeStorage.decryptString(Buffer.from(value)));
  const beginSnapshot=db.prepare("INSERT OR IGNORE INTO ai_attempt_snapshots VALUES(?,?,NULL,'running',?,NULL)");
  const endSnapshot=db.prepare('UPDATE ai_attempt_snapshots SET finished=?,status=?,output=? WHERE id=?');
  const pruneSnapshots=db.prepare("UPDATE ai_attempt_snapshots SET input=NULL,output=NULL WHERE status IN ('done','cancelled') AND finished<? AND input IS NOT NULL");
  const findSnapshot=db.prepare('SELECT * FROM ai_attempt_snapshots WHERE id=?');
  let running,buffer,armed=false,scheduled=false,retryTimer,closed=false,sequence=0;

  function write(operation){
    db.exec('BEGIN IMMEDIATE');
    try{
      const result=operation();
      db.exec('COMMIT');
      return result;
    }catch(error){
      if(db.isTransaction)db.exec('ROLLBACK');
      throw error;
    }
  }

  function schedule(){
    if(closed||scheduled)return;
    scheduled=true;
    setImmediate(tick);
  }
  function pulse(){armed=true;schedule();}
  function settle(job,result,error){
    groups.delete(job.id);
    job.signal?.removeEventListener('abort',job.abort);
    if(error)job.reject(error);
    else job.resolve(result);
  }
  function start(callback,signal,finished){
    const task=Promise.resolve().then(()=>{
      signal?.throwIfAborted();
      return callback();
    });
    running=task.then(value=>finished({value}),error=>finished({failure:{
      message:error?.message??String(error),code:errorCode(error)}})).finally(()=>{
      running=null;
      schedule();
    });
  }

  function admit(){
    waiting.sort((a,b)=>(b.currentPriority?.()??b.priority)-(a.currentPriority?.()??a.priority)||a.sequence-b.sequence);
    while(waiting.length){
      const job=waiting[0];
      const result=write(()=>{
        const saved=job.checkpoint?recover.get(job.checkpoint):null;
        if(saved?.state==='output')return {saved,output:true};
        // 前台只占用模型时隙，等待池已有 40 条后台任务时仍可进入。
        const priority=job.currentPriority?.()??job.priority;
        if(priority<6&&size.get().n>=aiPoolLimit)return null;
        if(saved){
          resume.run(saved.id);
          return {saved};
        }
        add.run(job.id,job.id,job.checkpoint,priority,job.input);
        return {};
      });
      if(!result)break;
      waiting.shift();
      if(result.saved){
        if(groups.has(result.saved.group_id)){
          settle(job,undefined,unavailable('本机 AI 步骤已被领取','AI_CHECKPOINT_BUSY'));
          continue;
        }
        job.id=result.saved.group_id;
      }
      if(result.output){
        settle(job,unpack(result.saved.output));
        continue;
      }
      groups.set(job.id,job);
    }
  }

  function processRaw(row){
    const job=groups.get(row.group_id);
    if(!job){
      if(row.checkpoint)park.run(row.group_id);
      else erase.run(row.group_id);
      return;
    }
    let result;
    try{result=interpret(unpack(row.input),unpack(row.output));}
    catch(error){result={output:{failure:{message:error.message,code:errorCode(error)}}};}
    const nextInput=result.next?pack(result.next):null;
    const output=result.output?pack(result.output):null;
    write(()=>{
      if(result.next){
        if(!complete.run('done',row.output,null,row.id,row.attempt).changes)throw Error('AI 阶段已变化');
        add.run(randomUUID(),row.group_id,row.checkpoint,row.priority,nextInput);
      }else if(result.retry&&row.checkpoint){
        retry.run(row.id);
      }else if(row.checkpoint){
        if(!complete.run('output',output,row.checkpoint,row.id,row.attempt).changes)throw Error('AI 阶段已变化');
      }
      else erase.run(row.group_id);
    });
    if(!result.next)settle(job,result.retry??result.output);
  }
  function acknowledgeOutputs(){
    for(const key of acknowledgements){
      const group=findGroup.get(key);
      if(group)erase.run(group.group_id);
      acknowledgements.delete(key);
    }
  }

  function tick(){
    scheduled=false;
    if(closed)return;
    // Foreground dialogue can take the next model slot even if SQLite is busy.
    while(!running&&foreground.length){
      const job=foreground.shift();
      job.signal?.removeEventListener('abort',job.abort);
      if(job.signal?.aborted){job.reject(job.signal.reason);continue;}
      const signal=job.signal?AbortSignal.any([lifetime.signal,job.signal]):lifetime.signal;
      start(()=>job.run(signal),signal,outcome=>outcome.failure?
        job.reject(unavailable(outcome.failure.message,outcome.failure.code)):job.resolve(outcome.value));
    }
    if(retryTimer)return;
    try{
      for(const job of waiting.filter(job=>job.signal?.aborted)){
        waiting.splice(waiting.indexOf(job),1);
        settle(job,undefined,job.signal.reason);
      }
      if(buffer){
        if(buffer.cancelled){
          if(buffer.row.checkpoint)park.run(buffer.row.group_id);
          else erase.run(buffer.row.group_id);
        }else record.run(pack(buffer.outcome),buffer.row.id,buffer.attempt);
        if(buffer.snapshot)endSnapshot.run(Date.now(),snapshotStatus(buffer),pack(buffer.outcome),buffer.snapshot);
        buffer=null;
      }
      acknowledgeOutputs();
      for(const job of groups.values()){
        if(!job.signal?.aborted||job.active)continue;
        if(job.checkpoint)park.run(job.id);
        else erase.run(job.id);
        settle(job,undefined,job.signal.reason);
      }
      admit();
      if(!armed&&readyCount.get().n>=aiWakeCount)armed=true;
      const ready=raw.get();
      if(ready){
        processRaw(ready);
        admit();
        schedule();
      }
      if(!running&&!foreground.length&&armed){
        const row=write(()=>{
          for(const job of groups.values())if(job.currentPriority){
            const priority=job.currentPriority();prioritize.run(priority,job.id,priority);
          }
          const result=claim.get();
          if(result&&safeStorage)beginSnapshot.run(result.id+'-'+result.attempt,Date.now(),result.input);
          return result;
        });
        if(row){
          const job=groups.get(row.group_id);
          if(!job){
            if(row.checkpoint)park.run(row.group_id);
            else erase.run(row.group_id);
            schedule();
            return;
          }
          let input;
          try{input=unpack(row.input);}
          catch(error){
            park.run(row.group_id);
            if(!row.checkpoint)erase.run(row.group_id);
            settle(job,undefined,unavailable('本机 AI 快照暂不可读取','AI_SNAPSHOT_UNREADABLE'));
            schedule();return;
          }
          const {attempt}=row;
          const timers=[lifetime.signal,AbortSignal.timeout(job.budget)];
          if(job.signal)timers.push(job.signal);
          const signal=AbortSignal.any(timers);
          job.active=true;
          const started=performance.now(),attemptId=row.id+'-'+attempt,snapshot=safeStorage?attemptId:undefined;
          start(()=>execute(input,signal,job.progress,attemptId),signal,outcome=>{
            job.active=false;
            buffer={row,attempt,outcome,snapshot,cancelled:outcome.failure&&(job.signal?.aborted||lifetime.signal.aborted)};
            void log?.({direction:'local',route:'AI 询问池',stage:snapshotStatus(buffer)==='cancelled'?'取消':input.phase==='simple'?input.skill?.stage??'处理':input.phase,
              skill:input.skill?.name,ai_attempt_id:attemptId,ai_step_id:snapshot,duration_ms:Math.round(performance.now()-started),error:outcome.failure?.code});
          });
        }else if(!raw.get())armed=false;
      }
    }catch(error){
      if(busy(error)){
        retryTimer=setTimeout(()=>{retryTimer=null;schedule();},80);
      }else{
        void log?.({direction:'local',route:'AI 询问池',stage:'写入暂停',error:error.code??error.name});
        for(const job of waiting.splice(0))settle(job,undefined,error);
        for(const job of [...groups.values()])if(!job.active)settle(job,undefined,error);
        armed=false;
      }
    }
  }

  function submit(input,{priority=1,currentPriority,immediate=true,signal,checkpoint,progress,budget=15000}={}){
    if(closed)return Promise.reject(unavailable('AI 询问池已关闭','LOCAL_AI_STOPPED'));
    signal?.throwIfAborted();
    const pending=Promise.withResolvers();
    const job={...pending,id:randomUUID(),checkpoint:checkpoint??null,priority,currentPriority,input:pack(input),signal,progress,budget,sequence:++sequence,
      abort:schedule};
    signal?.addEventListener('abort',job.abort,{once:true});
    waiting.push(job);
    if(immediate)pulse();
    else schedule();
    return pending.promise;
  }
  function front(run,signal){
    if(closed)return Promise.reject(unavailable('AI 询问池已关闭','LOCAL_AI_STOPPED'));
    signal?.throwIfAborted();
    const pending=Promise.withResolvers();
    const job={...pending,run,signal,abort(){
      const index=foreground.indexOf(job);
      if(index>=0)foreground.splice(index,1);
      pending.reject(signal.reason);
    }};
    signal?.addEventListener('abort',job.abort,{once:true});
    foreground.push(job);
    pulse();
    return pending.promise;
  }
  function ack(checkpoint){
    if(closed||!checkpoint)return;
    acknowledgements.add(checkpoint);
    schedule();
  }
  async function close(){
    if(closed)return;
    closed=true;
    lifetime.abort();
    clearTimeout(retryTimer);
    const error=unavailable('AI 询问池已关闭','LOCAL_AI_STOPPED');
    for(const job of waiting)settle(job,undefined,error);
    for(const job of foreground){
      job.signal?.removeEventListener('abort',job.abort);
      job.reject(error);
    }
    for(const job of groups.values())settle(job,undefined,error);
    await running;
    if(buffer)try{
      const output=pack(buffer.outcome);
      if(!buffer.cancelled)record.run(output,buffer.row.id,buffer.attempt);
      if(buffer.snapshot)endSnapshot.run(Date.now(),snapshotStatus(buffer),output,buffer.snapshot);
    }catch{/* 恢复时由检查点续办。 */}
    try{acknowledgeOutputs();}catch{/* 业务检查点仍保留。 */}
    db.close();
  }
  let lastPrune=0;
  function pulseAndPrune(){
    if(safeStorage&&!closed&&Date.now()-lastPrune>3600000){
      try{pruneSnapshots.run(Date.now()-7*86400000);lastPrune=Date.now();}catch{}
    }
    pulse();
  }
  function readSnapshot(id){
    if(typeof id!=='string'||!/^[\da-f-]{36}-\d+$/u.test(id))return null;
    const row=findSnapshot.get(id);
    if(!row)return null;
    return {started:row.started,finished:row.finished,status:row.status,input:row.input&&unpack(row.input),output:row.output&&unpack(row.output)};
  }
  return {submit,front,pulse:pulseAndPrune,ack,close,readSnapshot,snapshot:()=>({queued:size.get().n,awake:armed,running:Boolean(running)})};
}
