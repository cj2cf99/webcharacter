export const chatPhaseMs=15000;
export const chatTotalMs=2*chatPhaseMs;

// 文件读取和部分第三方接口没有原生取消参数；丢弃迟到的结果。
export function untilAbort(work,signal){
  if(!signal)return work;
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);
    if(signal.aborted)abort();
    else signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(work).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
