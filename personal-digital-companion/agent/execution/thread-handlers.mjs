import { Worker } from 'node:worker_threads';
export async function createThreadHandlers({module=new URL('./handler-registry.mjs',import.meta.url).href}={}) {
  const {handlers:registry}=await import(module);
  const active=new Map(); let stopping=false;
  const handlers=Object.fromEntries(Object.entries(registry).map(([type,handler])=>[type,{
    risk:handler.risk,validate:handler.validate,
    execute(params) {
      if(stopping)return Promise.reject(Object.assign(new Error('执行已中断'),{code:'INTERRUPTED'}));
      return new Promise((resolve,reject)=>{
        const worker=new Worker(new URL('./handler-worker.mjs',import.meta.url),{workerData:{module,type,params}});
        let settled=false;
        function finish(error,result) {
          if(settled)return; settled=true;
          if(error)reject(error); else resolve(result);
        }
        active.set(worker,()=>finish(Object.assign(new Error('执行已中断'),{code:'INTERRUPTED'})));
        worker.once('message',message=>{
          finish(message.ok?null:new Error('任务执行失败'),message.result);
          void worker.terminate();
        });
        worker.once('error',()=>finish(Object.assign(new Error('执行线程异常，结果未知'),{code:'INTERRUPTED'})));
        worker.once('exit',()=>{active.delete(worker);finish(Object.assign(new Error('执行线程意外结束'),{code:'INTERRUPTED'}));});
      });
    },
  }]));
  return {handlers, async stop() {
    stopping=true;
    await Promise.all([...active].map(async([worker,interrupt])=>{interrupt();await worker.terminate();}));
  }, activeCount:()=>active.size};
}
