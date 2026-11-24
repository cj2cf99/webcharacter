export const taskLimitMs=Infinity;
export const roundPause=()=>Object.assign(Error('本轮 4B 执行预算已到，待下一轮继续'),{code:'LOCAL_AI_ROUND_PAUSED'});
export const taskDiscard=()=>Object.assign(Error('单项任务累计执行已达上限，已丢弃'),{code:'LOCAL_AI_TASK_DISCARDED'});

// 只有主力模型进入推理后才启动整轮时钟。CPU 审核和准备模型都不会推进它。
export function createExecutionRound({now=()=>performance.now(),softMs=Infinity,hardMs=Infinity}={}){
  const controller=new AbortController(),accepted=new Set();
  let used=0,start=null,timer,denied=false;
  const elapsed=()=>used+(start===null?0:Math.max(0,now()-start));
  function check(){
    if(elapsed()>=hardMs&&!controller.signal.aborted)controller.abort(roundPause());
  }
  return {signal:controller.signal,get paused(){return denied||controller.signal.aborted;},
    admit(key){
      if(!Number.isFinite(hardMs)&&!Number.isFinite(softMs))return true;
      check();
      if(controller.signal.aborted||(!accepted.has(key)&&elapsed()>=softMs)){denied=true;return false;}
      accepted.add(key);return true;
    },
    startMain(){
      check();controller.signal.throwIfAborted();
      if(!Number.isFinite(hardMs)&&!Number.isFinite(softMs))return;
      start=now();
      if(Number.isFinite(hardMs))timer=setTimeout(()=>controller.abort(roundPause()),Math.max(1,Math.ceil(hardMs-used)));
    },
    stopMain(){
      if(start===null)return;
      check();used=elapsed();start=null;clearTimeout(timer);
    }};
}
