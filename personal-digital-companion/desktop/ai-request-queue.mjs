import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createExecutionRound,roundPause,taskDiscard,taskLimitMs} from './ai-execution-round.mjs';

export const aiPoolLimit=40;
const unavailable=(message,code)=>Object.assign(Error(message),{code});
const busy=error=>Number.isInteger(error?.errcode)&&(error.errcode&255)===5;
const errorCode=error=>typeof error?.code==='string'?error.code:error?.name??'Error';
const snapshotStatus=({paused,cancelled,outcome})=>paused||cancelled?'cancelled':outcome.failure?'failed':'done';

export function createAiRequestQueue({file,execute,interpret,log,safeStorage,resumeInput,laneFor=()=>'main',kindFor=()=>undefined,
  executionPolicy={},reportsInference=false,onBusy}){
  const {now=()=>performance.now(),taskMs=taskLimitMs}=executionPolicy;
  const keyFor=(checkpoint,id)=>{
    const match=/^diary:[^:]+:([^:]+):(reviewAction|reviewSource):/.exec(checkpoint);
    return match?'diary:'+match[2]+':'+match[1].split('-part-')[0]:checkpoint??id;
  };
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
  if(!db.prepare('PRAGMA table_info(ai_requests)').all().some(row=>row.name==='execution_ms'))
    db.exec("BEGIN; ALTER TABLE ai_requests ADD COLUMN execution_ms REAL NOT NULL DEFAULT 0; ALTER TABLE ai_requests ADD COLUMN task_key TEXT; COMMIT;");
  db.exec('CREATE INDEX IF NOT EXISTS ai_task_execution ON ai_requests(task_key)');
  const charge=db.prepare('UPDATE ai_requests SET execution_ms=execution_ms+?,task_key=? WHERE id=?');
  const spent=db.prepare('SELECT COALESCE(sum(execution_ms),0) AS ms FROM ai_requests WHERE task_key=?');
  const add=db.prepare("INSERT INTO ai_requests(id,group_id,checkpoint,priority,state,input) VALUES(?,?,?,?,'ready',?)");
  const size=db.prepare("SELECT count(*) AS n FROM ai_requests WHERE state IN ('ready','running','raw')");
  const readyCount=db.prepare("SELECT count(*) AS n FROM ai_requests WHERE state='ready'");
  const raw=db.prepare("SELECT * FROM ai_requests WHERE state='raw' ORDER BY seq LIMIT 1");
  const readyRows=db.prepare("SELECT id,group_id,priority FROM ai_requests WHERE state='ready' ORDER BY priority DESC,seq");
  const claim=db.prepare("UPDATE ai_requests SET state='running',attempt=attempt+1 WHERE id=? AND state='ready' RETURNING *");
  const prioritize=db.prepare("UPDATE ai_requests SET priority=? WHERE group_id=? AND state='ready' AND priority<>?");
  const record=db.prepare("UPDATE ai_requests SET state='raw',output=? WHERE id=? AND state='running' AND attempt=?");
  const complete=db.prepare("UPDATE ai_requests SET state=?,output=?,checkpoint=? WHERE id=? AND state='raw' AND attempt=?");
  const recover=db.prepare('SELECT * FROM ai_requests WHERE checkpoint=?');
  const updateInput=db.prepare("UPDATE ai_requests SET input=? WHERE id=? AND state='parked'");
  const resume=db.prepare("UPDATE ai_requests SET state=CASE state WHEN 'saved' THEN 'raw' ELSE 'ready' END WHERE id=? AND state IN ('parked','saved')");
  const park=db.prepare("UPDATE ai_requests SET state=CASE state WHEN 'raw' THEN 'saved' ELSE 'parked' END WHERE group_id=? AND checkpoint IS NOT NULL AND state IN ('ready','running','raw')");
  const retry=db.prepare("UPDATE ai_requests SET state='parked',output=NULL,input=COALESCE(?,input) WHERE id=? AND state='raw'");
  const erase=db.prepare('DELETE FROM ai_requests WHERE group_id=?');
  const findGroup=db.prepare("SELECT group_id FROM ai_requests WHERE checkpoint=? AND state='output'");
  const reviewEntries=db.prepare("SELECT checkpoint,state FROM ai_requests WHERE checkpoint GLOB 'diary:*:reviewAction:*' OR checkpoint GLOB 'diary:*:reviewSource:*' ORDER BY seq DESC");
  const reviewedGroup=db.prepare("SELECT group_id FROM ai_requests WHERE checkpoint=? AND (checkpoint GLOB 'diary:*:reviewAction:*' OR checkpoint GLOB 'diary:*:reviewSource:*')");
  const groups=new Map(), waiting=[], foreground=[], acknowledgements=new Map();
  const lifetime=new AbortController();
  const pack=value=>safeStorage?safeStorage.encryptString(JSON.stringify(value)):JSON.stringify(value);
  const unpack=value=>JSON.parse(typeof value==='string'?value:safeStorage.decryptString(Buffer.from(value)));
  const beginSnapshot=db.prepare("INSERT OR IGNORE INTO ai_attempt_snapshots VALUES(?,?,NULL,'running',?,NULL)");
  const endSnapshot=db.prepare('UPDATE ai_attempt_snapshots SET finished=?,status=?,output=? WHERE id=?');
  const pruneSnapshots=db.prepare("UPDATE ai_attempt_snapshots SET input=NULL,output=NULL WHERE status IN ('done','cancelled') AND finished<? AND input IS NOT NULL");
  const findSnapshot=db.prepare('SELECT * FROM ai_attempt_snapshots WHERE id=?');
  const running=new Map(),buffers=[];
  const effectivePriority=(job,boost=job.boost??0)=>Math.min(6,(job.currentPriority?.()??job.priority)+boost);
  let armed=false,scheduled=false,retryTimer,closed=false,sequence=0,completed=0;
  let round,leases=0,executionBusy=false;
  function notifyBusy(busy){
    if(executionBusy===busy)return;
    executionBusy=busy;onBusy?.(busy);
  }
  const currentRound=()=>round??=createExecutionRound(executionPolicy);
  function releaseIdleRound(){if(!leases&&!groups.size&&!waiting.length&&!buffers.length&&!running.size)round=null;}
  function beginRound(){
    const active=currentRound();leases++;
    let released=false;
    return {signal:active.signal,get paused(){return active.paused;},release(){if(!released){released=true;leases--;releaseIdleRound();}}};
  }

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
    if(groups.get(job.id)===job)groups.delete(job.id);
    job.signal?.removeEventListener('abort',job.abort);
    if(error)job.reject(error);
    else job.resolve(result);
  }
  function start(lane,callback,signal,finished){
    const task=Promise.resolve().then(()=>{
      signal?.throwIfAborted();
      return callback();
    }).then(value=>{signal?.throwIfAborted();return value;});
    running.set(lane,task.then(value=>finished({value}),error=>finished({failure:{
      message:error?.message??String(error),code:errorCode(error)}})).finally(()=>{
      running.delete(lane);
      completed++;
      schedule();
    }));
    notifyBusy(true);
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
        if(!currentRound().admit(job.key))return {paused:true};
        if(saved){
          if(saved.state==='parked'&&resumeInput){
            let previous;
            try{previous=unpack(saved.input);}catch{return {unreadable:true};}
            const next=resumeInput(previous,unpack(job.input));
            if(next!==previous){saved.input=pack(next);updateInput.run(saved.input,saved.id);}
          }
          resume.run(saved.id);
          return {saved};
        }
        add.run(job.id,job.id,job.checkpoint,priority,job.input);
        return {};
      });
      if(!result)break;
      waiting.shift();
      if(result.paused){settle(job,undefined,roundPause());continue;}
      if(result.unreadable){
        settle(job,undefined,unavailable('本机 AI 快照暂不可读取','AI_SNAPSHOT_UNREADABLE'));
        continue;
      }
      if(result.saved){
        if(groups.has(result.saved.group_id)){
          settle(job,undefined,unavailable('本机 AI 步骤已被领取','AI_CHECKPOINT_BUSY'));
          continue;
        }
        job.id=result.saved.group_id;
        if(!result.output){
          try{
            const input=unpack(result.saved.input);
            job.lane=laneFor(input);job.boost=input.priorityBoost??0;
          }
          catch{
            park.run(job.id);
            settle(job,undefined,unavailable('本机 AI 快照暂不可读取','AI_SNAPSHOT_UNREADABLE'));
            continue;
          }
        }
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
    try{
      const outcome=unpack(row.output);
      result=outcome.failure?.code==='LOCAL_AI_TASK_DISCARDED'?{output:outcome}:interpret(unpack(row.input),outcome);
    }
    catch(error){result={output:{failure:{message:error.message,code:errorCode(error)}}};}
    const nextInput=result.next?pack(result.next):null;
    const output=result.output?pack(result.output):null;
    write(()=>{
      if(result.next){
        if(!complete.run('done',row.output,null,row.id,row.attempt).changes)throw Error('AI 阶段已变化');
        add.run(randomUUID(),row.group_id,row.checkpoint,effectivePriority(job,result.next.priorityBoost??0),nextInput);
      }else if(result.retry&&row.checkpoint){
        retry.run(result.retryInput?pack(result.retryInput):null,row.id);
      }else if(row.checkpoint){
        if(!complete.run('output',output,row.checkpoint,row.id,row.attempt).changes)throw Error('AI 阶段已变化');
      }
      else erase.run(row.group_id);
    });
    if(result.next){job.lane=laneFor(result.next);job.boost=result.next.priorityBoost??0;}
    else settle(job,result.retry??result.output);
  }
  function acknowledgeOutputs(){
    for(const [key,reviewed] of acknowledgements){
      const group=(reviewed?reviewedGroup:findGroup).get(key);
      if(group&&groups.has(group.group_id))continue;
      if(group)erase.run(group.group_id);
      acknowledgements.delete(key);
    }
  }
  function saveAttempt(buffer){
    write(()=>{
      charge.run(buffer.ms,buffer.key,buffer.row.id);
      if(buffer.cancelled){
        if(buffer.row.checkpoint)park.run(buffer.row.group_id);
        else erase.run(buffer.row.group_id);
      }else record.run(pack(buffer.outcome),buffer.row.id,buffer.attempt);
      if(buffer.snapshot)endSnapshot.run(Date.now(),snapshotStatus(buffer),pack(buffer.outcome),buffer.snapshot);
    });
  }

  function tick(){
    scheduled=false;
    if(closed)return;
    // Foreground dialogue can take the next model slot even if SQLite is busy.
    function startFront(job){
      foreground.splice(foreground.indexOf(job),1);
      job.signal?.removeEventListener('abort',job.abort);
      if(job.signal?.aborted){job.reject(job.signal.reason);return;}
      const signal=job.signal?AbortSignal.any([lifetime.signal,job.signal]):lifetime.signal;
      start(job.lane,()=>job.run(signal),signal,outcome=>outcome.failure?
        job.reject(unavailable(outcome.failure.message,outcome.failure.code)):job.resolve(outcome.value));
    }
    for(const job of [...foreground]){
      if(job.priority>=6&&!running.has(job.lane)&&(job.lane==='main'||job.review))startFront(job);
    }
    if(retryTimer)return;
    try{
      for(const job of waiting.filter(job=>job.signal?.aborted)){
        waiting.splice(waiting.indexOf(job),1);
        settle(job,undefined,job.signal.reason);
      }
      while(buffers.length){
        const buffer=buffers[0];
        saveAttempt(buffer);
        buffers.shift();
        if(buffer.paused)settle(buffer.job,undefined,roundPause());
      }
      acknowledgeOutputs();
      for(const job of groups.values()){
        if(!job.signal?.aborted||job.active)continue;
        if(job.checkpoint)park.run(job.id);
        else erase.run(job.id);
        settle(job,undefined,job.signal.reason);
      }
      admit();
      if(!armed&&readyCount.get().n>0)armed=true;
      let ready;
      while((ready=raw.get())){
        processRaw(ready);
        admit();
      }
      if(armed){
        const row=write(()=>{
          for(const job of groups.values()){
            const priority=effectivePriority(job);prioritize.run(priority,job.id,priority);
          }
          const ready=readyRows.all();
          const activeKeys=new Set([...groups.values()].filter(job=>job.active).map(job=>job.key));
          const first=route=>ready.find(row=>{
            const job=groups.get(row.group_id);
            return job?.lane===route&&!activeKeys.has(job.key);
          });
          let lane='main';
          let eligible=!running.has(lane)&&(first('main')??first('shared'));
          function localFor(lane,reviewOnly=false){
            return foreground.filter(job=>job.lane===lane&&(!reviewOnly||job.review)).sort((a,b)=>b.priority-a.priority)[0];
          }
          if(!running.has(lane)){
            const local=localFor(lane);
            if(local&&(!eligible||local.priority>=eligible.priority))return {local};
          }
          if(!eligible&&!running.has('assist')){
            lane='assist';
            eligible=first('review');
            const review=localFor(lane,true);
            if(review&&(!eligible||review.priority>=eligible.priority))return {local:review};
            if(!eligible){
              eligible=first('judgment')??first('assist')??first('shared');
              const local=localFor(lane);
              if(local&&(!eligible||local.priority>=eligible.priority))return {local};
            }
          }
          if(eligible){
            const job=groups.get(eligible.group_id);
            if(!currentRound().admit(job.key)){
              if(job.checkpoint)park.run(job.id);else erase.run(job.id);
              return {pausedJob:job};
            }
          }
          const result=eligible&&claim.get(eligible.id);
          if(result&&safeStorage)beginSnapshot.run(result.id+'-'+result.attempt,Date.now(),result.input);
          return result&&{...result,lane};
        });
        if(row?.pausedJob){settle(row.pausedJob,undefined,roundPause());schedule();}
        else if(row?.local){startFront(row.local);schedule();}
        else if(row){
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
          const active=currentRound();
          const spentMs=spent.get(job.key).ms;
          const remaining=taskMs-spentMs,deadline=new AbortController();
          const timers=[lifetime.signal,active.signal,deadline.signal];
          if(job.signal)timers.push(job.signal);
          const signal=AbortSignal.any(timers);
          job.active=true;
          const started=performance.now(),attemptId=row.id+'-'+attempt,snapshot=safeStorage?attemptId:undefined;
          let inferenceAt=null,ms=0,timer;
          function begin(){
            signal.throwIfAborted();
            if(row.lane==='main')active.startMain();
            inferenceAt=now();
            if(Number.isFinite(remaining))timer=setTimeout(()=>deadline.abort(taskDiscard()),Math.max(1,Math.ceil(remaining)));
            signal.addEventListener('abort',end,{once:true});
          }
          function end(){
            if(inferenceAt===null)return;
            ms=Math.max(0,now()-inferenceAt);inferenceAt=null;clearTimeout(timer);
            signal.removeEventListener('abort',end);
            if(row.lane==='main')active.stopMain();
            // 单步和整项可同时到期。保留外部让行与整轮中断的续办语义。
            if(ms>=remaining&&!active.signal.aborted&&!job.signal?.aborted&&!lifetime.signal.aborted)
              deadline.abort(taskDiscard());
          }
          start(row.lane,()=>{
            if(remaining<=0){deadline.abort(taskDiscard());deadline.signal.throwIfAborted();}
            if(!reportsInference)begin();
            return execute(input,signal,job.progress,attemptId,row.lane,{begin,end});
          },signal,outcome=>{
            end();
            const paused=active.signal.aborted&&!deadline.signal.aborted;
            if(deadline.signal.aborted||paused){
              const {message,code}=deadline.signal.aborted?taskDiscard():roundPause();
              outcome={failure:{message,code}};
            }
            job.active=false;
            if(outcome.failure)outcome.worker=row.lane;
            const buffer={row,attempt,outcome,snapshot,job,key:job.key,ms,paused,
              cancelled:paused||(!deadline.signal.aborted&&outcome.failure&&(job.signal?.aborted||lifetime.signal.aborted))};
            buffers.push(buffer);
            void log?.({direction:'local',route:'AI 询问池',stage:snapshotStatus(buffer)==='cancelled'?'取消':input.phase==='simple'?input.skill?.stage??'处理':input.phase,
              skill:input.skill?.name,ai_kind:kindFor(input),priority:row.priority,worker:row.lane,ai_attempt_id:attemptId,ai_step_id:snapshot,
              duration_ms:Math.round(performance.now()-started),inference_ms:Math.round(ms),task_execution_ms:Math.round(spentMs+ms),error:outcome.failure?.code});
          });
          schedule();
        }else if(!running.size&&!waiting.length&&!foreground.length&&!buffers.length&&!readyCount.get().n&&!raw.get())armed=false;
      }
      releaseIdleRound();
    }catch(error){
      if(busy(error)){
        retryTimer=setTimeout(()=>{retryTimer=null;schedule();},80);
      }else{
        void log?.({direction:'local',route:'AI 询问池',stage:'写入暂停',error:error.code??error.name});
        for(const job of waiting.splice(0))settle(job,undefined,error);
        for(const job of [...groups.values()])if(!job.active)settle(job,undefined,error);
        armed=false;
      }
    }finally{
      if(!running.size&&!groups.size&&!waiting.length&&!foreground.length&&!buffers.length)notifyBusy(false);
    }
  }

  function submit(input,{priority=1,currentPriority,immediate=true,signal,checkpoint,progress}={}){
    if(closed)return Promise.reject(unavailable('AI 询问池已关闭','LOCAL_AI_STOPPED'));
    signal?.throwIfAborted();
    const pending=Promise.withResolvers();
    const job={...pending,id:randomUUID(),checkpoint:checkpoint??null,priority,currentPriority,lane:laneFor(input),input:pack(input),signal,progress,sequence:++sequence,
      abort:schedule};
    job.key=keyFor(job.checkpoint,job.id);
    signal?.addEventListener('abort',job.abort,{once:true});
    waiting.push(job);
    if(immediate)pulse();
    else schedule();
    return pending.promise;
  }
  function front(run,signal,lane='main',review=false,priority=6){
    if(closed)return Promise.reject(unavailable('AI 询问池已关闭','LOCAL_AI_STOPPED'));
    signal?.throwIfAborted();
    const pending=Promise.withResolvers();
    const job={...pending,run,signal,lane,review,priority,abort(){
      const index=foreground.indexOf(job);
      if(index>=0)foreground.splice(index,1);
      pending.reject(signal.reason);
    }};
    signal?.addEventListener('abort',job.abort,{once:true});
    foreground.push(job);
    pulse();
    return pending.promise;
  }
  function ack(checkpoint,reviewed=false){
    if(closed||!checkpoint)return;
    acknowledgements.set(checkpoint,reviewed||acknowledgements.get(checkpoint)===true);
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
    await Promise.allSettled(running.values());
    for(const buffer of buffers)try{
      saveAttempt(buffer);
    }catch{/* 恢复时由检查点续办。 */}
    try{acknowledgeOutputs();}catch{/* 业务检查点仍保留。 */}
    notifyBusy(false);
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
  return {submit,front,beginRound,pulse:pulseAndPrune,ack,close,readSnapshot,
    reviewCheckpoints:()=>reviewEntries.all(),
    snapshot:()=>({queued:size.get().n,awake:armed,running:running.size>0,completed,lanes:[...running.keys()]})};
}
