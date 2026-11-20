import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join} from 'node:path';
import {createLocalModel} from './local-model.mjs';
function untilAbort(work,signal){
  if(!signal)return work;
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);
    if(signal.aborted)abort();
    else signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(work).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}

const run=promisify(execFile);
const fourModelMiB=3840;

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

export function createBalancedLocalModel({utilityProcess,modelPath,log,readGpu=readGpuLoad,create=createLocalModel}){
  let current,chosen,initializing,warmController,exiting,busy=false,closed=false,lastUsed;
  function release(){
    const worker=current;
    current=chosen=undefined;
    if(worker)exiting=worker.close();
    return exiting;
  }
  let memoryTurn;
  async function prepare(signal,fixedFour=false){
    if(!current)await untilAbort(exiting,signal);
    const gpu=fixedFour?await untilAbort(readGpu(),signal):null;
    const resident=chosen?.device==='gpu'?current?.snapshot().vramMiB??0:0;
    const choices=fixedFour?[...(gpu&&gpu.utilization<80&&gpu.freeMiB+resident>=fourModelMiB?[{size:'4',device:'gpu'}]:[]),{size:'4',device:'cpu'}]:[{size:'0.8',device:'cpu'}];
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
        device,loadTimeout:fixedFour?45000:15000,log});
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
      initializing=prepare(warmController.signal).catch(()=>false).finally(()=>{initializing=undefined;warmController=undefined;});
    }
    return initializing;
  }
  async function analyze(text,options={}){
    if(memoryTurn){memoryTurn.controller.abort();await memoryTurn.done;}
    if(closed)return {error:'LOCAL_AI_STOPPED'};
    if(busy)return {error:'LOCAL_AI_BUSY'};
    busy=true;
    try{
      await untilAbort(initializing,options.signal);
      if(!await prepare(options.signal))return {error:lastUsed?.error??'LOCAL_AI_NOT_READY'};
      return await current.analyze(text,options);
    }finally{busy=false;}
  }
  async function memory(text,instruction,schema,signal){
    if(busy||closed||memoryTurn)throw Error('本地模型忙碌');
    const controller=new AbortController(),done=Promise.withResolvers();
    signal=AbortSignal.any([controller.signal,signal]);
    memoryTurn={controller,done:done.promise};busy=true;
    try{
      await untilAbort(initializing,signal);
      if(!await prepare(signal,true))throw Error('本机 Qwen3.5 4B 未就绪');
      const result=await current.analyze(text,{hint:'personalityMemory',signal,skillInstruction:{instruction,schema}});
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
