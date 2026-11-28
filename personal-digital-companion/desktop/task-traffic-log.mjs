import {appendFile, mkdir, open, readFile, rename, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tokyoDay} from './conversation-history.mjs';
import {refusalExcerpt} from '../agent/host/refusal-response.mjs';

const timestamp = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'medium'});
const id = value => typeof value === 'string' && /^[a-z0-9_-]{1,128}$/i.test(value) ? value : undefined;
const word = value => typeof value === 'string' && /^[a-z0-9_./@:-]{1,128}$/i.test(value) ? value : undefined;
const recoveryCodes=new Set(['LOCAL_AI_BATCH_BUDGET','LOCAL_AI_ADAPTIVE_OUTPUT_BUDGET','LOCAL_AI_GPU_DEFERRED','AbortError']);
const diaryFailures=new Map([['写日记','diary-writing'],['补行动评价','diary-writing'],['手记质问','diary-audit'],['核对手记','diary-audit']]);
const peek = value => {
  if(typeof value!=='string')return null;
  try { return JSON.parse(value); } catch { return null; }
};
function taskSummary(task) {
  const record = task?.result?.record_id;
  return {task_id: id(task?.task_id), type: word(task?.type), status: word(task?.status),
    chain_id: id(task?.chain?.chain_id), attempt_count: Number.isSafeInteger(task?.attempt_count) ? task.attempt_count : undefined,
    record_id: Number.isSafeInteger(record) ? record : id(record)};
}
function responseSummary(body) {
  const chain = body?.chain ?? body;
  const tasks = body?.tasks ?? body?.items ?? (Array.isArray(chain?.nodes) ? chain.nodes.map(node => node.current_task) : undefined);
  return {
    task: body?.task?.task_id || body?.task_id ? taskSummary(body.task ?? body) : undefined,
    chain_id: id(chain?.chain_id), submission_id: id(body?.submission_id), operation_id: id(body?.operation?.request_id),
    task_count: Array.isArray(tasks) ? tasks.length : undefined,
    tasks: Array.isArray(tasks) ? tasks.slice(0, 64).map(taskSummary) : undefined,
    error: word(body?.error?.code),
    ai: Array.isArray(body?.ai?.attempts) ? {trace_id: id(body.ai.trace_id),
      preferred_provider: word(body.ai.preferred_provider),
      preference_saved: body.ai.preference_saved === false ? false : undefined,
      attempts: body.ai.attempts.slice(0, 32).map(attempt => ({
        provider: word(attempt?.provider), model: word(attempt?.model), code: word(attempt?.code),
        refusal_response: attempt?.code!=='OK' ? refusalExcerpt(attempt?.refusal_response) : undefined,
        reply_check: ['matched','mismatch'].includes(attempt?.reply_check) ? attempt.reply_check : undefined,
        stage:word(attempt?.stage),at:Number.isSafeInteger(attempt?.at)?attempt.at:undefined,
        upstream_status: Number.isSafeInteger(attempt?.upstream_status) ? attempt.upstream_status : undefined,
        provider_code: Number.isSafeInteger(attempt?.provider_code) ? attempt.provider_code : undefined,
        duration_ms: Number.isSafeInteger(attempt?.duration_ms) ? attempt.duration_ms : undefined,
      }))} : undefined,
  };
}

export function createTaskTrafficLog(profile, {maxBytes = 2 * 1024 * 1024, clock = Date.now,memory,safeStorage} = {}) {
  const file = join(profile, 'task-traffic.jsonl');
  const previous = join(profile,'task-traffic.previous.jsonl');
  const deepSeekFolder=join(profile,'deepseek-call-snapshots');
  let pending = Promise.resolve();
  let failed = false;
  let indexedDay;
  function write(event,{recover=false}={}) {
    const time = timestamp.format(clock()).replace(' ', 'T') + '+09:00';
    pending = pending.then(async () => {
      const row={time,...await event},line=JSON.stringify(row)+'\n';
      if(recover&&await hasReceipt(row))return;
      if(memory){
        const day=row.archive_day??row.image?.day??time.slice(0,10),dir=join(memory.folder(day),'日志');
        await mkdir(dir,{recursive:true});
        await appendFile(join(dir,'任务通信.jsonl'),line,{encoding:'utf8',mode:0o600});
        if(indexedDay!==day){await memory.refreshIndex(day);indexedDay=day;}
        return;
      }
      const size = await stat(file).then(info => info.size, error => {
        if (error.code === 'ENOENT') return 0;
        throw error;
      });
      if (size && size + Buffer.byteLength(line) > maxBytes) await rename(file, previous);
      await appendFile(file, line, {encoding: 'utf8', mode: 0o600});
    }).catch(() => { failed = true; return false; });
    return pending;
  }
  async function readDeepSeekStep(id){
    if(typeof id!=='string'||!/^deepseek-[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u.test(id)||
      !await safeStorage?.isAsyncEncryptionAvailable?.())return null;
    const encrypted=await readFile(join(deepSeekFolder,id+'.bin')).catch(error=>{
      if(error.code!=='ENOENT')throw error;
      return null;
    });
    if(!encrypted)return null;
    const {result}=await safeStorage.decryptStringAsync(encrypted);
    return JSON.parse(result);
  }
  async function beginDeepSeek({purpose,input}){
    const id='deepseek-'+crypto.randomUUID(),started=clock();
    const event={route:'DeepSeek',operation:purpose,model:input.model,ai_step_id:id};
    if(!await safeStorage?.isAsyncEncryptionAvailable?.()){
      await write({...event,direction:'local',error:'DEEPSEEK_AUDIT_UNAVAILABLE'});
      throw Error('无法加密保存 DeepSeek 调用记录');
    }
    const snapshot={provider:'DeepSeek',started,input,status:'running'};
    const target=join(deepSeekFolder,id+'.bin');
    try{
      await mkdir(deepSeekFolder,{recursive:true});
      await writeFile(target,await safeStorage.encryptStringAsync(JSON.stringify(snapshot)),{flag:'wx',mode:0o600,flush:true});
    }catch(cause){
      await write({...event,direction:'local',error:'DEEPSEEK_AUDIT_FAILED'});
      throw cause;
    }
    if(await write({...event,direction:'send'})===false)throw Error('无法写入 DeepSeek 任务日志');
    const finish=async ({output,error,durationMs,httpStatus})=>{
      const finished=clock();
      const result={...snapshot,finished,status:error?'failed':'done',output,error,durationMs,httpStatus};
      const candidate=target+'.tmp';
      try{
        await writeFile(candidate,await safeStorage.encryptStringAsync(JSON.stringify(result)),{flag:'wx',mode:0o600,flush:true});
        await rename(candidate,target);
      }catch(cause){
        await write({...event,direction:'receive',status:httpStatus,error:'DEEPSEEK_AUDIT_FAILED',duration_ms:durationMs});
        throw cause;
      }
      await write({...event,direction:'receive',status:httpStatus,error,duration_ms:durationMs});
    };
    finish.stepId=id;
    return finish;
  }
  // 游标只保留文件标识和字节位置。追加日志不改变已打开阅读的分页边界。
  async function readPage(cursor,day=tokyoDay(clock())) {
    await pending;
    return readStoredPage(cursor,day);
  }
  async function inspectRecent(from,to,signal){
    await pending;
    const lookback=from-5000;
    const legacyFallbackWindow=180_000,legacyLookback=from-legacyFallbackWindow;
    const days=[...new Set([tokyoDay(legacyLookback),tokyoDay(from),tokyoDay(to)])];
    const files=memory?days.flatMap(day=>['任务通信.jsonl','历史通信.jsonl'].map(name=>join(memory.folder(day),'日志',name))):[previous,file];
    const counts=new Map(),paired=new Map(),attempts=new Map(),deepseekErrors=[],deepseekRecoveries=[];
    let scanned=0,completed=0,failed=0;
    function report(code,total=1){
      failed+=total;counts.set(code,(counts.get(code)??0)+total);
    }
    for(const path of files){
      signal.throwIfAborted();
      const log=await readFile(path,{encoding:'utf8',signal}).catch(error=>{if(error.code!=='ENOENT')throw error;return '';});
      for(const line of log.split('\n')){
        const row=peek(line);
        if(!row||row.route==='分析专家巡检')continue;
        const at=Date.parse(row.time);
        if(!Number.isFinite(at)||at<legacyLookback||at>=to)continue;
        if(at>=from){
          scanned++;
          if(row.category==='绯月自主行动'&&row.stage==='完成')completed++;
        }
        if(row.route==='DeepSeek 兜底'&&row.result==='已兜底恢复'&&word(row.primary_error)){
          // 新回执的 null 表示本次没有主通道错误。缺少字段的旧回执才尝试按时间配对。
          const stepId=id(row.ai_step_id);
          if(!row.cooldown&&at>=from&&(stepId||row.ai_step_id===undefined))
            deepseekRecoveries.push({at,op:String(row.operation??''),code:word(row.primary_error),stepId});
          continue;
        }
        const code=word(row.error??row.code??String(row.result??'').match(/\bLOCAL_AI_[A-Z_]+\b/u)?.[0]);
        if(recoveryCodes.has(code)||row.stage==='取消'||row.skill==='emotion-appraisal'&&['AI 询问池','本地 AI'].includes(row.route))continue;
        if(!code&&row.stage!=='失败')continue;
        if(row.route==='DeepSeek'&&code){
          deepseekErrors.push({at,op:String(row.operation??''),code,stepId:id(row.ai_step_id)});
          continue;
        }
        if(at<lookback)continue;
        const modelRoute=row.route==='本地 AI'||row.route==='AI 询问池';
        if(modelRoute&&code&&id(row.ai_attempt_id)){
          const key=JSON.stringify([row.ai_attempt_id,code]);
          if(!attempts.has(key)||attempts.get(key).at>at)attempts.set(key,{at,code});
          continue;
        }
        if(at<from)continue;
        const legacyModelReceipt=row.route==='本地 AI'||row.route==='AI 询问池'&&code==='LOCAL_AI_OUTPUT_BUDGET';
        const diaryModel=legacyModelReceipt&&['diary-writing','diary-audit'].includes(row.skill);
        const skill=diaryModel?row.skill:row.category==='绯月自主行动'&&['失败','查询失败'].includes(row.stage)?diaryFailures.get(row.route):undefined;
        if(skill&&code){
          // 旧手记回执没有共享编号，按同秒各层的记录数保留独立失败。
          const key=JSON.stringify([at,skill,code]),group=paired.get(key)??{code,model:0,queue:0,task:0};
          group[row.route==='本地 AI'?'model':row.route==='AI 询问池'?'queue':'task']++;
          paired.set(key,group);
        }else report(code??'自主任务失败');
      }
    }
    const stepKey=({stepId,code})=>JSON.stringify([stepId,code]);
    const stepErrors=new Map(deepseekErrors.filter(err=>err.stepId).map(err=>[stepKey(err),err]));
    for(const rec of deepseekRecoveries){
      if(!rec.stepId)continue;
      const err=stepErrors.get(stepKey(rec));
      if(err&&err.at<=rec.at)err.recovered=true;
    }
    // 旧回执只在候选唯一时抵消。同名请求交错时保留失败，避免错删另一笔故障。
    const legacyRecoveries=deepseekRecoveries.filter(rec=>!rec.stepId).sort((a,b)=>a.at-b.at);
    for(const rec of legacyRecoveries){
      const candidates=deepseekErrors.filter(err=>!err.recovered&&err.code===rec.code&&err.op===rec.op&&
        err.at<=rec.at&&rec.at-err.at<=legacyFallbackWindow);
      if(candidates.length===1)candidates[0].recovered=true;
    }
    for(const err of deepseekErrors)if(!err.recovered&&err.at>=from)report(err.code);
    for(const {at,code} of attempts.values())if(at>=from)report(code);
    for(const {code,model,queue,task} of paired.values())report(code,Math.max(model,queue,task));
    return {scanned,completed,failed,top:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5)};
  }
  // 恢复前读同一东京日的日志；在写入队列内核对，不能再等待队列自身。
  async function hasReceipt(row){
    let cursor=null;
    do{
      const page=await readStoredPage(cursor,row.archive_day);
      for(const line of page.lines){
        const saved=peek(line);
        if(saved?.action_id===row.action_id&&saved.category===row.category){
          if(saved.stage===row.stage)return true;
          if(saved.stage==='开始')return false;
        }
      }
      cursor=page.next;
    }while(cursor);
    return false;
  }
  async function readStoredPage(cursor,day){
    const opened=[];
    try {
      const paths=memory?['任务通信.jsonl','历史通信.jsonl'].map(name=>join(memory.folder(day),'日志',name)):[file,previous];
      for(const path of paths){
        const handle=await open(path,'r').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
        if(handle)opened.push({handle});
      }
      for(const entry of opened){
        const info=await entry.handle.stat({bigint:true});
        entry.key=[info.dev,info.ino,info.birthtimeNs].join('/');
        entry.end=Number(info.size);
      }
      const files=cursor??opened.filter((entry,i)=>entry.end>0&&opened.findIndex(f=>f.key===entry.key)===i).map(({key,end})=>({key,end}));
      if(!Array.isArray(files)||files.length>2)throw Error('日志页无效，请刷新。');
      if(!files.length)return {lines:[],next:null,failed};
      const [{key,end},...rest]=files,entry=opened.find(f=>f.key===key);
      if(!entry||!Number.isSafeInteger(end)||end<1||end>entry.end)throw Error('日志已轮转，请刷新后查看。');
      let offset=end,remaining=12; // 每页 12 行，由新到旧
      const chunks=[];
      while(offset>0&&remaining>0){
        const start=Math.max(0,offset-16384),chunk=Buffer.alloc(offset-start);
        const {bytesRead}=await entry.handle.read(chunk,0,chunk.length,start);
        if(bytesRead!==chunk.length)throw Error('日志已变化，请刷新后查看。');
        offset=start;
        let index=chunk.length-1;
        for(;index>=0;index--){
          if(chunk[index]===10 && start+index!==end-1 && --remaining===0){offset=start+index+1;break;}
        }
        chunks.push(chunk.subarray(index+1));
      }
      const lines=Buffer.concat(chunks.reverse()).toString('utf8').replace(/\r?\n$/,'').split(/\r?\n/).reverse();
      const next=offset?[{key,end:offset},...rest]:rest;
      return {lines,next:next.length?next:null,failed};
    } finally {await Promise.all(opened.map(f=>f.handle.close()));}
  }
  return {
    get file(){return memory?join(memory.folder(tokyoDay(clock())),'日志','任务通信.jsonl'):file;},
    write, readPage, inspectRecent, beginDeepSeek, readDeepSeekStep, flush: () => pending, failed: () => failed,
    wrap(request) {
      return async (path, options = {}) => {
        // The query can hold filters and headers carry credentials. Record identifiers and statuses only.
        const route = path.split('?')[0];
        if (!/^\/api\/(?:tasks(?:\/|$)|devices(?:\/|$)|chains(?:\/|$)|task-submissions$|assistant\/(?:recording-plan|heartbeat|provider-test)$|reminder-review(?:\/|$))/.test(route)) {
          return request(path, options);
        }
        const request_id = crypto.randomUUID();
        const start = clock();
        const requestBody = peek(options.body);
        const event = {request_id, route, method: options.method ?? 'GET'};
        void write({...event, direction: 'send', submission_id: id(requestBody?.submission_id),
          operation_id: id(requestBody?.request_id), task_status: word(requestBody?.status),
          task_id: id(requestBody?.expected_task_id), action: word(requestBody?.action)});
        let response;
        try { response = await request(path, options); }
        catch (error) {
          void write({...event, direction: 'receive', error: word(error?.code) ?? 'CONNECTION_ERROR', duration_ms: clock() - start});
          throw error;
        }
        const duration_ms = clock() - start;
        const summary = response.clone().json().catch(() => null).then(body => ({
          ...event, direction: 'receive', status: response.status, duration_ms, ...responseSummary(body),
          ...(route==='/api/assistant/heartbeat'?{heartbeat:word(body?.status),provider:word(body?.provider)}:{}),
        }));
        void write(summary);
        return response;
      };
    },
  };
}
