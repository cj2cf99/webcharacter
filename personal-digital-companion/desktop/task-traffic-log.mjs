import {appendFile, mkdir, open, rename, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tokyoDay} from './conversation-history.mjs';

const timestamp = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'medium'});
const id = value => typeof value === 'string' && /^[a-z0-9_-]{1,128}$/i.test(value) ? value : undefined;
const word = value => typeof value === 'string' && /^[a-z0-9_./@:-]{1,128}$/i.test(value) ? value : undefined;
const peek = value => {
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
        reply_check: ['matched','mismatch'].includes(attempt?.reply_check) ? attempt.reply_check : undefined,
        stage:word(attempt?.stage),at:Number.isSafeInteger(attempt?.at)?attempt.at:undefined,
        upstream_status: Number.isSafeInteger(attempt?.upstream_status) ? attempt.upstream_status : undefined,
        provider_code: Number.isSafeInteger(attempt?.provider_code) ? attempt.provider_code : undefined,
        duration_ms: Number.isSafeInteger(attempt?.duration_ms) ? attempt.duration_ms : undefined,
      }))} : undefined,
  };
}

export function createTaskTrafficLog(profile, {maxBytes = 2 * 1024 * 1024, clock = Date.now,memory} = {}) {
  const file = join(profile, 'task-traffic.jsonl');
  const previous = join(profile,'task-traffic.previous.jsonl');
  let pending = Promise.resolve();
  let failed = false;
  let indexedDay;
  function write(event) {
    const time = timestamp.format(clock()).replace(' ', 'T') + '+09:00';
    pending = pending.then(async () => {
      const row={time,...await event},line=JSON.stringify(row)+'\n';
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
    }).catch(() => { failed = true; });
    return pending;
  }
  // 游标只保留文件标识和字节位置。追加日志不改变已打开阅读的分页边界。
  async function readPage(cursor,day=tokyoDay(clock())) {
    await pending;
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
      let offset=end,remaining=40;
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
    write, readPage, flush: () => pending, failed: () => failed,
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
