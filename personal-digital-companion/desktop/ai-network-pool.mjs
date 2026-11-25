import {Worker} from 'node:worker_threads';
import {capTimeoutMs} from './ai-execution-round.mjs';

const workerUrl=new URL('./ai-network-worker.mjs',import.meta.url);

export function createAiNetworkPool({maxWorkers=2}={}){
  const workers=[];
  const pending=new Map();
  const receipts=[];
  let nextWorker=0,nextId=0,draining=false,closed=false;

  function scheduleDrain(){
    if(draining||!receipts.length)return;
    draining=true;
    queueMicrotask(()=>{
      draining=false;
      // 优先投递高优先度线程回执，再处理普通后台回执。
      receipts.sort((a,b)=>b.priority-a.priority||a.seq-b.seq);
      while(receipts.length){
        const item=receipts.shift();
        item.resolve(item.result);
      }
    });
  }

  function spawnWorker(){
    const worker=new Worker(workerUrl);
    worker.unref();
    worker.on('message',msg=>{
      const entry=pending.get(msg?.id);
      if(!entry)return;
      pending.delete(msg.id);
      entry.cleanup();
      receipts.push({priority:entry.priority,seq:entry.seq,resolve:entry.resolve,result:msg});
      scheduleDrain();
    });
    worker.on('error',error=>{
      for(const [id,entry] of pending){
        if(entry.worker!==worker)continue;
        pending.delete(id);
        entry.cleanup();
        entry.reject(error);
      }
      const index=workers.indexOf(worker);
      if(index>=0)workers.splice(index,1);
    });
    workers.push(worker);
    return worker;
  }

  function pickWorker(){
    if(workers.length<maxWorkers)return spawnWorker();
    const worker=workers[nextWorker%workers.length];
    nextWorker++;
    return worker;
  }

  function dispatch({endpoint,headers,body,timeoutMs=30_000,signal,priority=1}){
    if(closed)return Promise.reject(Object.assign(Error('AI 网络线程池已关闭'),{code:'AI_NETWORK_POOL_CLOSED'}));
    if(signal?.aborted)return Promise.reject(signal.reason);
    const id=++nextId;
    const worker=pickWorker();
    const deferred=Promise.withResolvers();
    const onAbort=()=>{
      try{worker.postMessage({type:'abort',id});}catch{/* worker 已退出时忽略。 */}
    };
    const cleanup=()=>{
      signal?.removeEventListener('abort',onAbort);
    };
    signal?.addEventListener('abort',onAbort,{once:true});
    pending.set(id,{
      worker,
      priority,
      seq:id,
      resolve:deferred.resolve,
      reject:deferred.reject,
      cleanup
    });
    const effectiveTimeoutMs=capTimeoutMs(timeoutMs,30_000);
    worker.postMessage({type:'request',id,endpoint,headers,body,timeoutMs:effectiveTimeoutMs});
    return deferred.promise;
  }

  async function close(){
    if(closed)return;
    closed=true;
    for(const [id,entry] of pending){
      pending.delete(id);
      entry.cleanup();
      entry.reject(Object.assign(Error('AI 网络线程池已关闭'),{code:'AI_NETWORK_POOL_CLOSED'}));
    }
    await Promise.allSettled(workers.splice(0).map(worker=>worker.terminate()));
  }

  return {
    dispatch,
    close,
    stats:()=>({workers:workers.length,inflight:pending.size,queuedReceipts:receipts.length})
  };
}
