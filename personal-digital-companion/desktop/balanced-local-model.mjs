import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join} from 'node:path';
import {createLocalModel} from './local-model.mjs';
import {chatPhaseMs,chatTotalMs,untilAbort} from './chat-budget.mjs';

const run=promisify(execFile);
const minFreeMiB={'0.8':1280,'2':2304,'4':3840,'9':6656};

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

export function modelChoices(gpu,correcting,residentMiB=0){
  const small=correcting?'4':'0.8',large=correcting?'9':'2';
  const choices=[];
  if(gpu && gpu.utilization<80){
    const free=gpu.freeMiB+residentMiB;
    if(gpu.utilization<50 && free>=minFreeMiB[large])choices.push({size:large,device:'gpu'});
    if(free>=minFreeMiB[small])choices.push({size:small,device:'gpu'});
  }
  choices.push({size:small,device:'cpu'});
  return choices;
}

export function createBalancedLocalModel({utilityProcess,modelPath,log,readGpu=readGpuLoad,create=createLocalModel}){
  let current,chosen,initializing,warmController,exiting,busy=false,closed=false,failedText='',failures=0,lastUsed;
  function release(){
    const worker=current;
    current=chosen=undefined;
    if(worker)exiting=worker.close();
    return exiting;
  }
  let memoryTurn;
  async function prepare(correcting,signal,fixedFour=false){
    if(!current)await untilAbort(exiting,signal);
    const gpu=await untilAbort(readGpu(),signal);
    const resident=chosen?.device==='gpu'?current?.snapshot().vramMiB??0:0;
    const choices=fixedFour?[...(gpu&&gpu.utilization<80&&gpu.freeMiB+resident>=minFreeMiB['4']?[{size:'4',device:'gpu'}]:[]),{size:'4',device:'cpu'}]:modelChoices(gpu,correcting,resident);
    for(const choice of choices){
      signal?.throwIfAborted();
      if(closed)return false;
      if(current && chosen.size===choice.size && chosen.device===choice.device && current.snapshot().state==='ready')return true;
      await untilAbort(release(),signal);
      signal?.throwIfAborted();
      if(closed)return false;
      chosen=choice;
      const {size,device}=choice;
      const worker=current=create({utilityProcess,modelPath:join(dirname(modelPath),'Qwen3.5-'+size+'B-Q4_K_M.gguf'),
        device,loadTimeout:45000,intentBudgetMs:correcting?45000:20000,replyBudgetMs:correcting?90000:45000,log});
      await untilAbort(worker.start(),signal);
      if(closed)return false;
      const state=worker.snapshot();
      if(state.state==='ready' && (device==='cpu'||state.gpuLayers>0))return true;
      lastUsed=state;
    }
    await release();
    return false;
  }
  function start(){
    if(closed || busy || current?.snapshot().state==='ready')return initializing;
    if(!initializing){
      warmController=new AbortController();
      initializing=prepare(false,warmController.signal).catch(()=>false).finally(()=>{initializing=undefined;warmController=undefined;});
    }
    return initializing;
  }
  async function analyze(text,options={}){
    if(memoryTurn){memoryTurn.controller.abort();await memoryTurn.done;}
    if(closed)return {error:'LOCAL_AI_STOPPED'};
    if(busy)return {error:'LOCAL_AI_BUSY'};
    busy=true;
    const prompt=text.trim();
    const correcting=!['image-plan','serverTask'].includes(options.hint) &&
      (correctionTurn(prompt,options.previous) || (options.hint==='auto' && failedText===prompt && failures>=2));
    const conversation=options.hint==='auto';
    const started=options.turnStart??performance.now();
    async function phase(improved,revision){
      const now=performance.now();
      const end=improved&&!correcting?Math.min(started+chatTotalMs,now+chatPhaseMs):started+chatPhaseMs;
      // 给 Windows 定时器调度与 IPC 返回留出余量。
      const timer=conversation?AbortSignal.timeout(Math.max(0,Math.floor(end-now-75))):null;
      const signal=timer&&options.signal?AbortSignal.any([timer,options.signal]):timer??options.signal;
      try{
        if(conversation && now>=end)return {error:'LOCAL_AI_TIMEOUT'};
        await untilAbort(initializing,signal);
        signal?.throwIfAborted();
        if(!await prepare(improved,signal))return {error:closed?'LOCAL_AI_STOPPED':lastUsed?.error??'LOCAL_AI_NOT_READY'};
        signal?.throwIfAborted();
        const state=lastUsed=current.snapshot();
        options.onProgress?.('本地思索 · '+state.model+' · '+state.backend);
        return await untilAbort(current.analyze(text,{...options,signal,reviewLimit:improved?2:3,revision}),signal);
      }catch(error){
        options.signal?.throwIfAborted();
        if(!timer?.aborted)throw error;
        warmController?.abort();
        release();
        return {error:'LOCAL_AI_TIMEOUT'};
      }finally{
        if(improved)release();
      }
    }
    try{
      let result=await phase(correcting);
      if(conversation && !correcting && ['LOCAL_AI_REPLY_REVIEW_REJECTED','LOCAL_AI_TIMEOUT'].includes(result.error)){
        options.onProgress?.('本地思索 · 正在交给改进模型…');
        result=await phase(true,result.revision);
      }
      if(conversation && ['LOCAL_AI_TIMEOUT','LOCAL_AI_REPLY_REVIEW_REJECTED'].includes(result.error)){
        result={error:result.error==='LOCAL_AI_TIMEOUT'?'LOCAL_CHAT_TIME_LIMIT':'LOCAL_CHAT_REVIEW_FAILED'};
      }
      if(options.hint==='auto'){
        const failed=Boolean(result.error)||result.kind==='uncertain';
        failures=failed?(prompt===failedText?failures+1:1):0;
        failedText=failed?prompt:'';
      }
      return result;
    }finally{
      busy=false;
    }
  }
  async function memory(text,instruction,schema,signal,skill){
    if(busy||closed||memoryTurn)throw Error('本地模型忙碌');
    const controller=new AbortController(),done=Promise.withResolvers();
    signal=AbortSignal.any([controller.signal,signal]);
    memoryTurn={controller,done:done.promise};busy=true;
    try{
      await untilAbort(initializing,signal);
      if(!await prepare(false,signal,true))throw Error('本机 Qwen3.5 4B 未就绪');
      const result=await current.analyze(text,{hint:'personalityMemory',signal,skillInstruction:{...skill,instruction,schema}});
      signal.throwIfAborted();
      if(result.error)throw Error(result.error);
      return result;
    }finally{
      if(signal.aborted)await release();
      busy=false;memoryTurn=null;done.resolve();
    }
  }
  return {start,analyze,memory,close(){closed=true;memoryTurn?.controller.abort();warmController?.abort();return release();},
    snapshot:()=>current?.snapshot()??(closed?{state:'stopped'}:{...lastUsed,state:'idle'})};
}
