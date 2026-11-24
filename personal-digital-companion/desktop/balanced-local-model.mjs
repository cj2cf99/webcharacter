import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join} from 'node:path';
import {freemem} from 'node:os';
import {createLocalModel} from './local-model.mjs';
import {chatTotalMs,untilAbort} from './chat-budget.mjs';

const run=promisify(execFile);
// 本地只使用 Qwen3.5 4B（上下文 4K）：显存够用走 GPU，否则 CPU。
const minFreeMiB=3840;
const modelFile='Qwen3.5-4B-Q4_K_M.gguf';

export async function readGpuLoad(){
  try{
    const exe=process.platform==='win32'?join(process.env.SystemRoot,'System32','nvidia-smi.exe'):'nvidia-smi';
    const {stdout}=await run(exe,['--query-gpu=utilization.gpu,memory.free','--format=csv,noheader,nounits'],
      {windowsHide:true,timeout:1800,maxBuffer:4096});
    const match=/^(\d+)\s*,\s*(\d+)$/u.exec(stdout.trim());
    if(match && Number(match[1])<=100)return {utilization:Number(match[1]),freeMiB:Number(match[2])};
  }catch{/* 无法取得可靠读数时，本轮用 CPU。 */}
  return null;
}

export function correctionTurn(text,previous){
  const input=text.replace(/[“「『"][^”」』"\n]*[”」』"]/gu,'').trim();
  if(/(?:你(?:刚才|刚刚|上次|又|还是)?(?:答错|说错|理解错|弄错|搞错|说反|搞反|弄反|没(?:有)?(?:理解|听懂|明白|说清))|(?:你|上一轮|上次)(?:的)?(?:理解|回答|答复|回复|意思).{0,5}(?:错|不对|有误)|不是(?:我|这个|那个)(?:的)?意思|我(?:要|想)?纠正(?:你|一下)|你再(?:想想|想一下|仔细看看))/u.test(input))return true;
  if(!previous)return false;
  return /^(?:我说的是|我问的是|我指的是|我的意思是|我是说|我不是让你|不是让你|重答|重新回答|再答一次|纠正一下|你说的不对)|^(?:不对|错了|搞反了|说反了|理解反了|应该是|还是没懂|还是不对)(?:[呀哦吧了，。！？、：:\s]|$)/u.test(input);
}

export function modelChoices(gpu,residentMiB=0){
  const choices=[];
  if(gpu&&gpu.utilization<80&&gpu.freeMiB+residentMiB>=minFreeMiB)choices.push({size:'4',device:'gpu'});
  choices.push({size:'4',device:'cpu'});
  return choices;
}

export function createBalancedLocalModel({utilityProcess,modelPath,log,readGpu=readGpuLoad,create=createLocalModel,localFirst=false,taskDevice}){
  let current,chosen,initializing,warmController,exiting,busy=false,closed=false,suspended=false,failedText='',failures=0,lastUsed,lastWork;
  let preheated,idleTimer;
  function release(){
    clearTimeout(idleTimer);
    const worker=current;
    current=chosen=undefined;
    lastWork=preheated=undefined;
    if(worker)exiting=worker.close();
    return exiting;
  }
  function releaseWhenIdle(){
    clearTimeout(idleTimer);
    if(!current||initializing||busy||workSession)return;
    idleTimer=setTimeout(()=>{
      if(!busy&&!workSession&&!initializing)void release();
    },5*60_000).unref();
  }
  let memoryTurn;
  const canLoadTask=()=>taskDevice!=='cpu'||current?.snapshot().state==='ready'||freemem()>=minFreeMiB*1024*1024;
  async function prepare(signal,{gpuOnly=false,skipGpuCheck=false}={}){
    if(!current)await untilAbort(exiting,signal);
    const ready=current?.snapshot();
    const usable=ready?.state==='ready'&&(chosen.device==='cpu'?!gpuOnly:ready.gpuLayers>0);
    if(usable&&(taskDevice!=='cpu'||chosen.device==='cpu'))return true;
    const gpu=skipGpuCheck?{utilization:0,freeMiB:Infinity}:taskDevice==='cpu'?null:await untilAbort(readGpu(),signal);
    const resident=chosen?.device==='gpu'?ready?.vramMiB??0:0;
    let choices=modelChoices(gpu,resident);
    if(taskDevice==='cpu')choices=choices.filter(choice=>choice.device==='cpu');
    if(gpuOnly)choices=choices.filter(choice=>choice.device==='gpu');
    if(!choices.length)return false;
    for(const choice of choices){
      signal?.throwIfAborted();
      if(closed)return false;
      await untilAbort(release(),signal);
      signal?.throwIfAborted();
      if(closed)return false;
      chosen=choice;
      const worker=current=create({utilityProcess,modelPath:join(dirname(modelPath),modelFile),
        device:choice.device,loadTimeout:chatTotalMs,log});
      await untilAbort(worker.start(),signal);
      if(closed)return false;
      const state=worker.snapshot();
      if(state.state==='ready'&&(choice.device==='cpu'||state.gpuLayers>0))return true;
      lastUsed=state;
    }
    await release();
    return false;
  }
  let workSession;
  async function waitForWorkSession(signal){
    while(workSession){if(signal?.aborted)signal.throwIfAborted();await untilAbort(workSession.done,signal);}
  }
  async function withWorkSession(id,signal,run){
    await waitForWorkSession(signal);
    signal?.throwIfAborted();
    if(closed||suspended||busy||workSession)throw Object.assign(Error('本地模型正在使用'),{code:'LOCAL_AI_BUSY'});
    const lease=Promise.withResolvers();
    workSession={id,done:lease.promise};
    try{return await run((text,options)=>runWork(text,{...options,session:id,signal}));}
    finally{workSession=null;releaseWhenIdle();lease.resolve();}
  }
  function start(){
    if(closed || suspended || busy || workSession || current?.snapshot().state==='ready')return initializing;
    if(!initializing){
      warmController=new AbortController();
      initializing=prepare(warmController.signal)
        .catch(()=>false).finally(()=>{initializing=undefined;warmController=undefined;releaseWhenIdle();});
    }
    return initializing;
  }
  async function preheatConversation(route,signal){
    if(memoryTurn){memoryTurn.controller.abort();await untilAbort(memoryTurn.done,signal);}
    if(closed||suspended||busy||workSession)return {error:'对话模型正在使用或暂停，请稍后重试。'};
    busy=true;
    try{
      await untilAbort(initializing,signal);
      const ready=await prepare(signal,{gpuOnly:true});
      if(!ready)return {error:'GPU 加载失败，请检查显存后重试。'};
      const state=current.snapshot();
      preheated=route;
      return {ready:true,size:chosen.size,backend:state.backend};
    }finally{busy=false;releaseWhenIdle();}
  }
  async function analyze(text,options={}){
    if(workSession)await waitForWorkSession(options.signal);
    if(memoryTurn){memoryTurn.controller.abort();await memoryTurn.done;}
    if(closed||suspended)return {error:'LOCAL_AI_STOPPED'};
    if(busy)return {error:'LOCAL_AI_BUSY'};
    busy=true;
    const prompt=text.trim();
    const direct=options.hint==='direct';
    const conversation=options.hint==='auto'||direct;
    const signal=options.signal;
    async function phase(){
      await untilAbort(initializing,signal);
      signal?.throwIfAborted();
      if(!await prepare(signal))
        return {error:closed?'LOCAL_AI_STOPPED':lastUsed?.error??'LOCAL_AI_NOT_READY'};
      signal?.throwIfAborted();
      const state=lastUsed=current.snapshot();
      options.onProgress?.('本地思索 · '+state.model+' · '+state.backend);
      return await current.analyze(text,{...options,signal});
    }
    try{
      let result=await phase();
      if(options.hint==='auto'){
        const failed=Boolean(result.error)||result.kind==='uncertain';
        failures=failed?(prompt===failedText?failures+1:1):0;
        failedText=failed?prompt:'';
      }
      return result;
    }finally{
      busy=false;
      releaseWhenIdle();
    }
  }
  async function memory(text,instruction,schema,signal,skill,meter){
    if(workSession)await waitForWorkSession(signal);
    if(busy||closed||suspended||memoryTurn)throw Object.assign(Error('本地模型忙碌'),{code:'LOCAL_AI_BUSY'});
    const controller=new AbortController(),done=Promise.withResolvers();
    const refinement=skill?.name==='memory-refinement';
    let worker;
    signal=AbortSignal.any([controller.signal,signal]);
    memoryTurn={controller,done:done.promise};busy=true;
    try{
      await untilAbort(initializing,signal);
      if(skill?.aiTier&&!canLoadTask())throw Object.assign(Error('辅助模型等待可用内存'),{code:'LOCAL_AI_TIER_WAIT'});
      if(!await prepare(signal,{skipGpuCheck:skill?.backgroundBudget}))
        throw Object.assign(Error(skill?.aiTier?'本机 '+skill.aiTier+'B 未达到当前阶段的装载条件':
          '本机 4B 未就绪'),skill?.aiTier?{code:'LOCAL_AI_TIER_WAIT'}:{});
      worker=current;
      meter?.begin();
      let result;
      try{result=await worker.analyze(text,{hint:'personalityMemory',signal,skillInstruction:{...skill,instruction,schema}});}
      finally{meter?.end();}
      signal.throwIfAborted();
      if(result.error)throw Object.assign(Error(result.error),{code:result.error});
      return result;
    }finally{
      if(signal.aborted&&(!(refinement||skill?.aiTier)||worker?.snapshot().state!=='ready'))await release();
      busy=false;memoryTurn=null;releaseWhenIdle();done.resolve();
    }
  }
  async function work(text,options){
    if(workSession)await waitForWorkSession(options.signal);
    return runWork(text,options);
  }
  async function runWork(text,{instruction,schema,skill,signal,tier='main',onProgress,maxTokens,session}){
    signal?.throwIfAborted();
    if(memoryTurn){memoryTurn.controller.abort();await untilAbort(memoryTurn.done,signal);}
    if(closed||suspended)return {error:'LOCAL_AI_STOPPED'};
    if(busy)return {error:'LOCAL_AI_BUSY'};
    busy=true;
    try{
      await untilAbort(initializing,signal);
      const ready=lastWork?.session===session&&lastWork?.tier===tier&&current?.snapshot().state==='ready'&&(!taskDevice||chosen.device===taskDevice&&true);
      if(workSession?.id===session&&lastWork?.session===session&&!ready)return {error:'LOCAL_AI_PROCESS_EXITED'};
      if(!ready&&!await prepare(signal))return {error:lastUsed?.error??'LOCAL_AI_NOT_READY'};
      lastWork={session,tier};
      const model=lastUsed=current.snapshot();
      onProgress?.('本地思索 · '+model.model+' · '+model.backend);
      return await current.analyze(text,{hint:'interactionWork',signal,skillInstruction:{...skill,instruction,schema,maxTokens}});
    }finally{
      if(signal?.aborted){warmController?.abort();await release();}
      busy=false;
      releaseWhenIdle();
    }
  }
  async function suspend(){
    if(closed||workSession||busy&&!memoryTurn)return false;
    suspended=true;
    warmController?.abort();
    memoryTurn?.controller.abort();
    await Promise.allSettled([initializing,memoryTurn?.done]);
    await release();
    return true;
  }
  return {start,preheatConversation,analyze,memory,work,withWorkSession,reportsInference:true,
    canLoadTask,
    isBusy:()=>Boolean(busy||workSession||suspended||closed),suspend,resume(){suspended=false;},
    close(){closed=true;memoryTurn?.controller.abort();warmController?.abort();return release();},
    snapshot:()=>current?.snapshot()??(closed?{state:'stopped'}:{...lastUsed,state:'idle'})};
}
