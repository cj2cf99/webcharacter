import {execFile} from 'node:child_process';
import {mkdir,mkdtemp,readFile,readdir,rename,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {validAttachment} from './question-attachment.mjs';

import {imageSlots,resolveImageChoices,checkEditConstraints,previousImage} from './image-planning.mjs';
export {imageRequest,literalPlan,checkEditConstraints} from './image-planning.mjs';

const labels={generate:'文字生图',img2img:'图生图',edit:'定向编辑',upscale:'高清放大'};

function python(script,args,input){
  return new Promise((accept,reject)=>{
    const child=execFile('python',['-B',script,...args],{windowsHide:true,encoding:'utf8',maxBuffer:2*1024*1024},(err,stdout)=>{
      try{const row=JSON.parse(stdout);if(err&&row.state!=='failed')throw err;accept(row);}
      catch{reject(Error('本机 Python 图像工具未返回有效回执。'));}
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(input?JSON.stringify(input):undefined);
  });
}

export async function hasLocalImageBackend(root){
  try{return (await python(resolve(root,'workflows/comfyui/image_chain.py'),['availability'])).available===true;}
  catch{return false;}
}

export function createImageTasks({root,profile,localModel,onChange,onFinish,archive,runPython=python}){
  const cli=resolve(root,'workflows/comfyui/image_chain.py'), waitCli=resolve(root,'../tools/comfy_job.py');
  const receipts=join(profile,'image-tasks'),jobs=new Map();
  let closed=false,restoring=true;
  const monitors=new Map();
  const save=async row=>{
    const path=join(receipts,row.job+'.json');
    await writeFile(path+'.tmp',JSON.stringify(row,null,2));
    await rename(path+'.tmp',path);
    jobs.set(row.job,row);
    if(!closed)onChange?.();
  };
  async function archiveResult(row){
    if(!archive||row.archiveComplete)return;
    try{
      const result=await archive(row);
      row.archiveComplete=result.complete;
      row.archivedOutput=result.output;
      row.archiveWarning=result.complete?'':'部分图片未能归档，下次启动将重试。';
    }catch{row.archiveWarning='对话归档写入失败，下次启动将重试。';}
  }
  async function monitor(start){
    let terminal;
    try{terminal=await runPython(waitCli,['wait',start.job]);}
    catch(error){terminal={state:'failed',error:error.message};}
    if(closed)throw Object.assign(Error('图像任务等待恢复'),{code:'INTERRUPTED'});
    const row={...start,...terminal};
    const label=labels[row.operation]??'图像任务';
    row.text=row.state==='done'?`已完成 ${row.width}×${row.height} 图片。`:
      `${row.step?'第 '+row.step+' 步「'+label+'」':'图像任务'}失败：${row.error??'未收到结果'}`;
    await archiveResult(row);
    await save(row);
    await onFinish?.(row);
    return row;
  }
  function monitorJob(row){
    if(monitors.has(row.job))return monitors.get(row.job);
    const pending=monitor(row).finally(()=>monitors.delete(row.job));
    monitors.set(row.job,pending);
    void pending.catch(error=>{if(!closed)return onFinish?.({...row,state:'failed',text:'图像回执写入失败：'+error.message});}).catch(()=>{});
    return pending;
  }
  const ready=(async()=>{
    let names;
    try{names=await readdir(receipts);}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const name of names.filter(s=>/^[a-f0-9]{32}\.json$/u.test(s))){
      const row=JSON.parse(await readFile(join(receipts,name),'utf8'));
      jobs.set(row.job,row);
      if(!['done','failed'].includes(row.state))monitorJob(row);
      else if(archive&&!row.archiveComplete){await archiveResult(row);await save(row);}
    }
  })().finally(()=>{restoring=false;});
  const ordered=()=>[...jobs.values()].sort((a,b)=>b.at-a.at);
  return {
    get busy(){return restoring||monitors.size>0;},
    async generateServerImage(prompt,taskId){
      await ready;
      if(!archive)throw Error('本地图片归档未就绪。');
      const job=taskId.replaceAll('-','');
      let row=jobs.get(job);
      if(row&&(row.serverTaskId!==taskId||row.original!==prompt))throw Error('已有图像任务与本次提交不符。');
      if(!row){
        const queued=await runPython(cli,['submit','--server-task-id',taskId],{original:prompt,steps:[{op:'generate',quote:prompt,refs:[]}]});
        if(queued.job!==job){
          const failure={job,serverTaskId:taskId,original:prompt,at:Date.now(),state:'failed',completed:[],
            error:queued.error??'图像作业提交回执不匹配。'};
          failure.text='服务器生图提交失败：'+failure.error;
          await mkdir(receipts,{recursive:true});
          await archiveResult(failure);await save(failure);
          throw Error(failure.text);
        }
        row={...queued,serverTaskId:taskId,original:prompt,at:Date.parse(queued.submitted)||Date.now(),text:'已排队 · 服务器文字生图'};
        await mkdir(receipts,{recursive:true});
        await save(row);
        row=await monitorJob(row);
      }else if(!['done','failed'].includes(row.state)){
        row=await monitorJob(row);
      }
      if(row.state!=='done')throw Error(row.text);
      if(!row.archiveComplete){await archiveResult(row);await save(row);}
      if(!row.archiveComplete||!row.archivedOutput)throw Object.assign(Error('生成成功，PNG 尚未归档。'),{code:'IMAGE_ARCHIVE_FAILED'});
      return {job_id:row.job,format:'PNG',width:row.width,height:row.height,archived:true};
    },
    async list(selectedJob){
      await ready;
      const rows=selectedJob===undefined?ordered():[jobs.get(selectedJob)].filter(Boolean);
      return rows.map(({job,text,state,original,width,height,archiveWarning})=>({job,text:[text,archiveWarning].filter(Boolean).join(' '),state,original,width,height}));
    },
    async result(job){await ready;const row=jobs.get(job);return row?.archivedOutput??(row?.state==='done'?row.output:row?.completed?.at(-1)?.output);},
    async submit(text,attachments){
      await ready;
      if(text.length>2000)throw Error('图像指令最多 2000 字。');
      if(attachments.length>16||attachments.some(a=>!validAttachment(a)||a.kind!=='image'))throw Error('图片任务仅支持最多 16 张图片。');
      const prior=previousImage.test(text)?ordered().find(r=>r.state==='done'||r.completed?.length):null;
      if(previousImage.test(text)&&!prior)throw Error('没有可继续编辑的本地结果，请附上底图。');
      const old=prior?.archivedOutput??prior?.output??prior?.completed?.at(-1)?.output;
      const count=attachments.length;
      const {slots,question}=imageSlots(text,count,Boolean(old));
      if(question)throw Error(question);
      const skill=await runPython(cli,['describe']);
      if(!skill.instruction)throw Error(skill.error??'无法读取图像 skill。');
      let choices=slots.map(s=>s.ops[0]);
      if(slots.some(s=>s.ops.length>1)){
        const plan=await localModel?.analyze(text,{hint:'image-plan',imageSkill:{count,hasBase:Boolean(old),instruction:skill.instruction}});
        if(plan?.error)throw Error('本地图像规划未完成（'+plan.error+'），请重试或分句说明。');
        if(plan?.question||!Array.isArray(plan?.steps))throw Error(plan?.question||'请说明每一步要做什么。');
        choices=plan.steps.map(s=>s.op);
      }
      const steps=resolveImageChoices(slots,choices);
      if(!steps)throw Error('操作与本轮原文不符，请分句说明。');
      if(steps[0].op!=='generate'&&!count&&!old)throw Error('请拖入或粘贴待处理的底图。');
      checkEditConstraints(text,steps);
      if(steps[0].op==='generate'&&count&&!steps.some(s=>s.refs.length))throw Error('请说明上传的图用作底图，还是用来参考人物、服装或姿势。');
      await mkdir(receipts,{recursive:true});
      const temp=await mkdtemp(join(receipts,'input-'));
      try{
        const args=['submit','--version',skill.version,'--workflow-version',skill.workflowVersion];
        if(old)args.push('--base',old);
        for(const [i,image] of attachments.entries()){
          let bytes=Buffer.from(image.data.split(',')[1],'base64'),suffix='jpg';
          if(image.originalBytes){
            if(!ArrayBuffer.isView(image.originalBytes)||image.originalBytes.byteLength>20*1024*1024)throw Error('原始图片数据无效。');
            bytes=Buffer.from(image.originalBytes);
            if(bytes.readUInt32BE(0)===0x89504e47)suffix='png';
            else if(bytes.toString('ascii',8,12)==='WEBP')suffix='webp';
            else if(bytes[0]!==255||bytes[1]!==216)throw Error('原始图片格式不符。');
          }
          const path=join(temp,i+'.'+suffix);
          await writeFile(path,bytes);
          args.push('--image',path);
        }
        const row=await runPython(cli,args,{original:text,steps});
        if(row.state!=='queued')throw Error(row.error??'提交失败');
        Object.assign(row,{at:Date.now(),original:text,text:'已排队 · '+steps.map(s=>labels[s.op]).join(' → ')});
        await save(row);
        monitorJob(row);
        return row;
      }finally{await rm(temp,{recursive:true,force:true});}
    },
    close(){closed=true;}
  };
}
