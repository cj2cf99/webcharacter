import {parentPort} from 'node:worker_threads';
import {capTimeoutMs} from './ai-execution-round.mjs';

const inflight=new Map();

parentPort.on('message',async message=>{
  if(!message||typeof message!=='object')return;
  if(message.type==='abort'){
    inflight.get(message.id)?.abort();
    return;
  }
  if(message.type!=='request')return;
  const {id,endpoint,headers,body,timeoutMs=30_000}=message;
  const controller=new AbortController();
  const deadline=AbortSignal.timeout(capTimeoutMs(timeoutMs,30_000));
  const active=AbortSignal.any([controller.signal,deadline]);
  inflight.set(id,controller);
  try{
    const response=await fetch(endpoint,{
      method:'POST',
      redirect:'error',
      signal:active,
      headers,
      body
    });
    const raw=await response.text();
    let parsed=null;
    try{parsed=JSON.parse(raw);}catch{/* 非 JSON 响应交由调用方按原文处理。 */}
    parentPort.postMessage({id,ok:true,status:response.status,responseOk:response.ok,raw,body:parsed});
  }catch{
    parentPort.postMessage({
      id,
      ok:false,
      aborted:controller.signal.aborted,
      timedOut:deadline.aborted&&!controller.signal.aborted
    });
  }finally{
    inflight.delete(id);
  }
});
