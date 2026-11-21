import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join} from 'node:path';
import {createLocalModel} from './local-model.mjs';
import {chatTotalMs,untilAbort} from './chat-budget.mjs';

const run=promisify(execFile);
const minFreeMiB={'0.8':1280,'2':2304,'4':3840,'9':6656};
const primaryChatFile='Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf';

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

function aggressiveChoices(gpu,residentMiB,primaryResident){
  const choices=[];
  if(gpu && gpu.utilization<80 && (primaryResident || gpu.freeMiB+residentMiB>=minFreeMiB['9'])){
    choices.push({size:'9',device:'gpu',file:primaryChatFile});
  }
  choices.push({size:'9',device:'cpu',file:primaryChatFile});
  return choices;
}

export function modelChoices(gpu,correcting,residentMiB=0,primaryChat=false,primaryResident=false){
  if(correcting){
    const choices=aggressiveChoices(gpu,residentMiB,primaryResident);
    if(gpu && gpu.utilization<50 && gpu.freeMiB+residentMiB>=minFreeMiB['9'])choices.unshift({size:'9',device:'gpu'});
    return choices;
  }
  const choices=[];
  if(gpu && gpu.utilization<80){
    const free=gpu.freeMiB+residentMiB;
    if(primaryChat && gpu.utilization<50 && (primaryResident || free>=minFreeMiB['9']))choices.push({size:'9',device:'gpu',file:primaryChatFile});
    if(gpu.utilization<50 && free>=minFreeMiB['2'])choices.push({size:'2',device:'gpu'});
    if(free>=minFreeMiB['0.8'])choices.push({size:'0.8',device:'gpu'});
  }
  choices.push({size:'0.8',device:'cpu'});
  return choices;
}

function workChoices(gpu,residentMiB,primaryResident,tier){
  const choices=[];
  const upgrade=tier==='upgrade';
  if(gpu&&gpu.utilization<80){
    const free=gpu.freeMiB+residentMiB;
    if(upgrade){
      if(free>=minFreeMiB['9'])choices.push({size:'9',device:'gpu'});
    }else{
      if(primaryResident||free>=minFreeMiB['9'])choices.push({size:'9',device:'gpu',file:primaryChatFile});
      for(const size of ['4','2'])if(free>=minFreeMiB[size])choices.push({size,device:'gpu'});
    }
  }
  choices.push({size:upgrade?'9':'2',device:'cpu'});
  return choices;
}

export function createBalancedLocalModel({utilityProcess,modelPath,log,readGpu=readGpuLoad,create=createLocalModel,localFirst=false}){
  let current,chosen,initializing,warmController,exiting,busy=false,closed=false,suspended=false,failedText='',failures=0,lastUsed,lastWork;
  function release(){
    const worker=current;
    current=chosen=undefined;
    lastWork=undefined;
    if(worker)exiting=worker.close();
    return exiting;
  }
  let memoryTurn;
  async function prepare(signal,{correcting=false,fixedAggressive=false,primaryChat=false,workTier,refinement=false}={}){
    if(!current)await untilAbort(exiting,signal);
    if(refinement&&current?.snapshot().state==='ready'&&
        (chosen?.size==='2'||chosen?.size==='4'&&chosen.device==='gpu'))return true;
    const gpu=await untilAbort(readGpu(),signal);
    const resident=chosen?.device==='gpu'?current?.snapshot().vramMiB??0:0;
    const primaryResident=chosen?.file===primaryChatFile && chosen.device==='gpu' && current?.snapshot().state==='ready';
    const choices=refinement?[
      ...(gpu&&gpu.utilization<50&&gpu.freeMiB+resident>=minFreeMiB['4']?[{size:'4',device:'gpu'}]:[]),
      ...(gpu&&gpu.utilization<50&&gpu.freeMiB+resident>=minFreeMiB['2']?[{size:'2',device:'gpu'}]:[]),
      {size:'2',device:'cpu'}
    ]:workTier?workChoices(gpu,resident,primaryResident,workTier)
      :fixedAggressive?aggressiveChoices(gpu,resident,primaryResident)
        :modelChoices(gpu,correcting,resident,primaryChat,primaryResident);
    for(const choice of choices){
      signal?.throwIfAborted();
      if(closed)return false;
      if(current && chosen.size===choice.size && chosen.device===choice.device && chosen.file===choice.file && current.snapshot().state==='ready')return true;
      await untilAbort(release(),signal);
      signal?.throwIfAborted();
      if(closed)return false;
      chosen=choice;
      const {size,device}=choice;
      const worker=current=create({utilityProcess,modelPath:join(dirname(modelPath),choice.file??('Qwen3.5-'+size+'B-Q4_K_M.gguf')),
        device,loadTimeout:chatTotalMs,intentBudgetMs:correcting?45000:20000,log});
      await untilAbort(worker.start(),signal);
      if(closed)return false;
      const state=worker.snapshot();
      if(state.state==='ready' && (device==='cpu'||state.gpuLayers>0))return true;
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
    finally{workSession=null;lease.resolve();}
  }
  function start(){
    if(closed || suspended || busy || workSession || current?.snapshot().state==='ready')return initializing;
    if(!initializing){
      warmController=new AbortController();
      initializing=prepare(warmController.signal,localFirst?{workTier:'main'}:{primaryChat:true})
        .catch(()=>false).finally(()=>{initializing=undefined;warmController=undefined;});
    }
    return initializing;
  }
  async function analyze(text,options={}){
    if(workSession)await waitForWorkSession(options.signal);
    if(memoryTurn){memoryTurn.controller.abort();await memoryTurn.done;}
    if(closed||suspended)return {error:'LOCAL_AI_STOPPED'};
    if(busy)return {error:'LOCAL_AI_BUSY'};
    busy=true;
    const prompt=text.trim();
    const direct=options.hint==='direct';
    const correcting=!direct && !['image-plan','serverTask'].includes(options.hint) &&
      (correctionTurn(prompt,options.previous) || (options.hint==='auto' && failedText===prompt && failures>=2));
    const conversation=options.hint==='auto'||direct;
    const started=options.turnStart??performance.now();
    const remaining=started+chatTotalMs-performance.now();
    // 准备模型、生成和复核共用同一截止时间。
    const timer=conversation?AbortSignal.timeout(Math.max(0,Math.floor(remaining-75))):null;
    const signal=timer&&options.signal?AbortSignal.any([timer,options.signal]):timer??options.signal;
    async function phase(improved,revision){
      try{
        await untilAbort(initializing,signal);
        signal?.throwIfAborted();
        if(!await prepare(signal,{correcting:improved,fixedAggressive:direct,primaryChat:conversation}))
          return {error:closed?'LOCAL_AI_STOPPED':lastUsed?.error??'LOCAL_AI_NOT_READY'};
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
      if(conversation && remaining<=0)return {error:'LOCAL_CHAT_TIME_LIMIT'};
      let result=await phase(correcting);
      if(options.hint==='auto' && !correcting && !signal?.aborted && result.error==='LOCAL_AI_REPLY_REVIEW_REJECTED'){
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
    if(workSession)await waitForWorkSession(signal);
    if(busy||closed||suspended||memoryTurn)throw Error('本地模型忙碌');
    const controller=new AbortController(),done=Promise.withResolvers();
    const refinement=skill?.name==='memory-refinement';
    let worker;
    signal=AbortSignal.any([controller.signal,signal]);
    memoryTurn={controller,done:done.promise};busy=true;
    try{
      await untilAbort(initializing,signal);
      if(!await prepare(signal,{fixedAggressive:!refinement,refinement}))
        throw Error(refinement?'本机修订模型未就绪':'本机 Aggressive 9B 未就绪');
      worker=current;
      const result=await worker.analyze(text,{hint:'personalityMemory',signal,skillInstruction:{...skill,instruction,schema}});
      signal.throwIfAborted();
      if(result.error)throw Error(result.error);
      return result;
    }finally{
      if(signal.aborted&&(!refinement||worker?.snapshot().state!=='ready'))await release();
      busy=false;memoryTurn=null;done.resolve();
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
      const ready=lastWork?.session===session&&lastWork?.tier===tier&&current?.snapshot().state==='ready';
      if(workSession?.id===session&&lastWork?.session===session&&!ready)return {error:'LOCAL_AI_PROCESS_EXITED'};
      if(!ready&&!await prepare(signal,{workTier:tier}))return {error:lastUsed?.error??'LOCAL_AI_NOT_READY'};
      lastWork={session,tier};
      const model=lastUsed=current.snapshot();
      onProgress?.('本地思索 · '+model.model+' · '+model.backend);
      return await untilAbort(current.analyze(text,{hint:'interactionWork',signal,skillInstruction:{...skill,instruction,schema,maxTokens}}),signal);
    }finally{
      if(signal?.aborted){warmController?.abort();await release();}
      busy=false;
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
  return {start,analyze,memory,work,withWorkSession,isBusy:()=>Boolean(busy||workSession||suspended||closed),suspend,resume(){suspended=false;},
    close(){closed=true;memoryTurn?.controller.abort();warmController?.abort();return release();},
    snapshot:()=>current?.snapshot()??(closed?{state:'stopped'}:{...lastUsed,state:'idle'})};
}
