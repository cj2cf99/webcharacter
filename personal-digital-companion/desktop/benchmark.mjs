// 专用性能运行模式：自身场景切换和指标采样；常规启动不创建计时器或诊断桥。
import {availableParallelism,cpus} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function benchmark(electron,shell,path){
  const {app,ipcMain}=electron,cores=availableParallelism();
  let renderer=null;
  const listener=(event,value)=>{if(event.sender===shell.win.webContents&&event.senderFrame===shell.win.webContents.mainFrame)renderer=value;};
  ipcMain.on('desktop:perf-response',listener);
  const rows=[],phases=[['idle',20,6000],['work',20,16000],['hidden',15,2000]];
  for(let i=0;i<100&&!shell.getStats().ready;i++)await delay(100);
  if(!shell.getStats().ready)throw Error('桌宠未就绪，不能测量');
  const started=new Date().toISOString();
  for(const [phase,seconds,warmup]of phases){
    if(phase==='work')shell.setWork(true);if(phase==='hidden')shell.hide();
    console.log(`性能场景 ${phase}：预热 ${warmup/1000}s，采样 ${seconds}s`);
    await delay(warmup);
    let previous=app.getAppMetrics(),last=performance.now();
    for(let i=0;i<seconds;i++){
      shell.win.webContents.send('desktop:perf-request',true);
      await delay(1000);
      const now=performance.now(),metrics=app.getAppMetrics(),wall=(now-last)/1000;
      let delta=0;for(const item of metrics){const old=previous.find(p=>p.pid===item.pid&&p.creationTime===item.creationTime);if(old&&Number.isFinite(item.cpu.cumulativeCPUUsage)&&Number.isFinite(old.cpu.cumulativeCPUUsage))delta+=Math.max(0,item.cpu.cumulativeCPUUsage-old.cpu.cumulativeCPUUsage);}
      rows.push({phase,sample:i+1,cpuMachinePercent:100*delta/wall/cores,
        workingSetMiB:metrics.reduce((n,p)=>n+p.memory.workingSetSize,0)/1024,
        privateMiB:metrics.reduce((n,p)=>n+(p.memory.privateBytes||0),0)/1024,
        renderer:renderer?{...renderer}:null,host:shell.getStats(),processes:metrics});
      previous=metrics;last=now;
    }
  }
  const summaries=phases.map(([phase])=>{
    const data=rows.filter(r=>r.phase===phase),mean=k=>data.reduce((sum,r)=>sum+r[k],0)/data.length;
    const first=data[0],last=data.at(-1);
    return {phase,seconds:data.length,cpuMachinePercent:mean('cpuMachinePercent'),workingSetMiB:mean('workingSetMiB'),privateMiB:mean('privateMiB'),
      frameDelta:(last.renderer?.frames||0)-(first.renderer?.frames||0),
      pointerMessageDelta:last.host.pointerMessages-first.host.pointerMessages,
      canvas:last.renderer?.canvas,heapMiB:(last.renderer?.heapBytes||0)/1048576};
  });
  mkdirSync(resolve(path,'..'),{recursive:true});
  writeFileSync(path,JSON.stringify({started,cores,cpu:cpus()[0]?.model,electron:process.versions.electron,
    gpuFeatures:app.getGPUFeatureStatus(),summaries,rows},null,2));
  ipcMain.removeListener('desktop:perf-response',listener);
  console.log(JSON.stringify({result:path,summaries},null,2));app.quit();
}
