import {copyFile,mkdir,readFile,readdir,rename,stat,writeFile,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {tokyoDay} from './conversation-history.mjs';

export const memoryRoot='F:/feiyuememory';
const idPattern=/^[a-z0-9_-]{1,128}$/i, dayPattern=/^\d{4}-\d\d-\d\d$/;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function atomicFile(file,bytes){
  await mkdir(dirname(file),{recursive:true});
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{
    await writeFile(tmp,bytes,{mode:0o600});
    for(let attempt=0;;attempt++){
      try{await rename(tmp,file);break;}
      catch(error){
        if(process.platform!=='win32'||!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=6)throw error;
        await delay(15*2**attempt);
      }
    }
  }
  catch(error){await optional(unlink(tmp));throw error;}
}
export const optional=async work=>{try{return await work;}catch(e){if(e.code!=='ENOENT')throw e;return null;}};

export function createMemoryArchive(root=memoryRoot){
  function folder(day){
    if(!dayPattern.test(day))throw Error('归档日期无效');
    return join(root,day.slice(0,4),day.slice(0,7),day);
  }
  function imageRef(turn){
    if(typeof turn.id!=='string'||!idPattern.test(turn.id))throw Error('归档编号无效');
    return {day:tokyoDay(turn.at),id:turn.id,original:'图片/'+turn.id+'.png',thumbnail:'缩略图/'+turn.id+'.jpg'};
  }
  async function save(turn,{index=true}={}){
    const ref=imageRef(turn),base=folder(ref.day);
    const record={...turn,time:new Date(turn.at+9*3600000).toISOString().replace('Z','+09:00')};
    await atomicFile(join(base,'对话',ref.id+'.json'),JSON.stringify(record,null,2)+'\n');
    if(turn.image){
      const page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>绯月图片问答</title>'
        +'<style>body{font:16px/1.6 system-ui;max-width:48rem;margin:2rem auto}p{white-space:pre-wrap}img{max-width:240px;height:auto}</style>'
        +'<time>'+esc(record.time)+'</time><h1>'+esc(turn.question)+'</h1><a href="../'+ref.original+'"><img alt="截图缩略图" src="../'+ref.thumbnail+'"></a>'
        +'<p>'+esc(turn.image.route??'处理中')+'</p><p>'+esc(turn.text)+'</p></html>';
      await atomicFile(join(base,'图片问答',ref.id+'.html'),page);
    }
    if(index)await refreshIndex(ref.day);
  }
  async function read(day){
    const dir=join(folder(day),'对话');
    const names=await optional(readdir(dir))??[];
    const rows=await Promise.all(names.filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await readFile(join(dir,name),'utf8'))));
    return rows.sort((a,b)=>b.at-a.at);
  }
  async function storeImage(turn,image){
    const ref=imageRef(turn),base=folder(ref.day),bytes=image.toPNG();
    if(!bytes.length)throw Error('原图为空');
    const {width}=image.getSize();
    const thumb=image.resize({width:Math.min(240,width)}).toJPEG(75);
    if(!thumb.length)throw Error('缩略图为空');
    await atomicFile(join(base,ref.original),bytes);
    await atomicFile(join(base,ref.thumbnail),thumb);
    await save({...turn,image:ref,state:'waiting',text:'图片已保存，等待本地处理。'});
    return ref;
  }
  async function thumbnail(day,id){
    if(typeof id!=='string'||!idPattern.test(id))throw Error('缩略图编号无效');
    const bytes=await optional(readFile(join(folder(day),'缩略图',id+'.jpg')));
    return bytes?'data:image/jpeg;base64,'+bytes.toString('base64'):null;
  }
  function original(day,id){
    if(typeof id!=='string'||!idPattern.test(id))throw Error('图片编号无效');
    return join(folder(day),'图片',id+'.png');
  }
  function outputName(job,step){
    if(typeof job!=='string'||!/^[a-f0-9]{32}$/.test(job)||!Number.isSafeInteger(step)||step<1)throw Error('任务图片编号无效');
    return '对话/图片/'+job+'/step-'+String(step).padStart(2,'0')+'.png';
  }
  const taskImage=(day,job,step)=>join(folder(day),outputName(job,step));
  async function archiveImageTask(row){
    const day=tokyoDay(row.at),steps=[],problems=[];
    const outcomes=row.completed?.length?row.completed:row.output?[{step:1,output:row.output,width:row.width,height:row.height}]:[];
    for(const item of outcomes){
      const {step,operation,started,finished,width,height,seed}=item;
      const entry={step,operation,started,finished,width,height,seed};
      const dest=taskImage(day,row.job,step);
      try{
        if(!(await optional(stat(dest)))?.size){
          await mkdir(dirname(dest),{recursive:true});
          const tmp=dest+'.'+randomUUID()+'.tmp';
          try{await copyFile(item.output,tmp);await rename(tmp,dest);}
          finally{await optional(unlink(tmp));}
        }
        entry.image=outputName(row.job,step);
      }catch{entry.error='原图未能归档';problems.push('第 '+step+' 步原图未能归档');}
      steps.push(entry);
    }
    const report={job:row.job,...(row.serverTaskId?{serverTaskId:row.serverTaskId}:{}),version:row.version,workflowVersion:row.workflowVersion,steps,state:row.state,error:row.error};
    const at=Date.parse(row.updated)||Date.parse(steps.at(-1)?.finished)||row.at;
    const turn={id:row.job,at:row.at,answeredAt:at,question:row.original,state:row.state==='done'?'answer':'error',
      text:[row.serverTaskId&&'服务器任务 '+row.serverTaskId,row.text,...problems].filter(Boolean).join('\n'),report};
    await save(turn);
    const last=steps.at(-1);
    return {complete:!problems.length,output:last?.image?taskImage(day,row.job,last.step):undefined,turn};
  }
  const readEvents=async day=>JSON.parse(await optional(readFile(join(folder(day),'任务','执行记录.json'),'utf8'))??'[]');
  const imageEvents=turns=>turns.filter(t=>t.report?.job===t.id).map(t=>({at:t.answeredAt??t.at,task_id:t.id,title:'ComfyUI 图像任务',
    action:t.state==='answer'?'已完成':'执行失败',detail:t.question,report:true}));
  async function readTasks(day){
    const files=await optional(readdir(join(folder(day),'对话')))??[];
    const jobs=files.filter(f=>/^[a-f0-9]{32}\.json$/.test(f));
    const turns=await Promise.all(jobs.map(f=>readImageReport(day,f.slice(0,-5))));
    return [...await readEvents(day),...imageEvents(turns.filter(Boolean))].sort((a,b)=>a.at-b.at);
  }
  async function readImageReport(day,job){
    if(typeof job!=='string'||!/^[a-f0-9]{32}$/.test(job))return null;
    const raw=await optional(readFile(join(folder(day),'对话',job+'.json'),'utf8'));
    const turn=raw&&JSON.parse(raw);
    return turn?.report?.job===job?turn:null;
  }
  async function taskHistory(taskId){
    const dates=[];
    for(const year of await optional(readdir(root))??[]){
      if(!/^\d{4}$/.test(year))continue;
      for(const month of await optional(readdir(join(root,year)))??[]){
        if(!/^\d{4}-\d\d$/.test(month)||!month.startsWith(year+'-'))continue;
        for(const day of await optional(readdir(join(root,year,month)))??[]){
          if(dayPattern.test(day)&&day.startsWith(month+'-'))dates.push(day);
        }
      }
    }
    const rows=[];
    for(const date of dates)rows.push(...(await readEvents(date)).filter(row=>row.task_id===taskId));
    return rows.sort((a,b)=>a.at-b.at);
  }
  const writing=new Map();
  function refreshIndex(day){
    // 同期回执可能同时落盘，最后一次重建总能看到已写完的记录。
    const work=(writing.get(day)??Promise.resolve()).catch(()=>{}).then(async()=>{
      const base=folder(day),turns=await read(day),tasks=[...await readEvents(day),...imageEvents(turns)].sort((a,b)=>a.at-b.at);
      const logs=(await optional(readdir(join(base,'日志')))??[]).filter(f=>['任务通信.jsonl','历史通信.jsonl'].includes(f));
      const entries=turns.map(t=>{
        const ref=imageRef(t);
        const photo=t.image?'<a href="'+ref.original+'"><img loading="lazy" alt="截图缩略图" src="'+ref.thumbnail+'"></a>':'';
        const results=(t.report?.steps??[]).filter(s=>s.image).map(s=>'<a href="'+esc(s.image)+'"><img loading="lazy" alt="第 '+esc(s.step)+' 步结果" src="'+esc(s.image)+'"></a>').join('');
        return '<article id="turn-'+esc(t.id)+'"><time>'+esc(t.time)+'</time><h3>'+esc(t.question)+'</h3>'+photo+results+'<p>'+esc(t.text)+'</p>'
          +(t.image?'<small>'+esc([t.image.route,t.image.reason].filter(Boolean).join(' · '))+'</small>':'')+'</article>';
      });
      const events=tasks.map(t=>'<p>'+esc(new Date(t.at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Tokyo',hour12:false}))+' · '+esc(t.title)+' · '+esc(t.action)+' '+esc(t.detail)+(t.report?' <a href="#turn-'+esc(t.task_id)+'">查看结果</a>':'')+'</p>');
      await atomicFile(join(base,'复盘.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>'+day+' 绯月复盘</title>'
        +'<style>body{font:16px/1.55 system-ui;max-width:52rem;margin:2rem auto;padding:0 1rem}article{border-top:1px solid #aaa;padding:1rem 0}p{white-space:pre-wrap}img{max-width:240px;height:auto}time,small{color:#65545c}</style>'
        +'<h1>'+day+' · 绯月复盘</h1><small>东京时间 JST</small><p>'+logs.map(f=>'<a href="日志/'+f+'">'+f+'</a>').join(' · ')+'</p>'
        +(entries.length?'<h2>对话</h2>'+entries.join(''):'')+(events.length?'<h2>任务</h2>'+events.join(''):'')+'</html>');
    });
    writing.set(day,work);
    return work.finally(()=>{if(writing.get(day)===work)writing.delete(day);});
  }
  return {root,folder,save,read,latest:async day=>(await read(day))[0],storeImage,thumbnail,original,archiveImageTask,readImageReport,taskImage,
    readTasks,taskHistory,refreshIndex,async saveTasks(day,rows,{index=true}={}){
      await atomicFile(join(folder(day),'任务','执行记录.json'),JSON.stringify(rows,null,2)+'\n');
      if(index)await refreshIndex(day);
    }};
}
