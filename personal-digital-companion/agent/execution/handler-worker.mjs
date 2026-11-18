import { parentPort, workerData } from 'node:worker_threads';
// module仅来自可信主进程固定配置，不从任务/网络/渲染器接受路径。
try {
  const {handlers}=await import(workerData.module);
  const handler=handlers[workerData.type];
  if(!handler || handler.risk!=='L1')throw new Error('类型不可执行');
  const result=await handler.execute(workerData.params);
  parentPort.postMessage({ok:true,result});
} catch { parentPort.postMessage({ok:false}); }
