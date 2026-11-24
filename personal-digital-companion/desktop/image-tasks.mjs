import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,readFile,readdir,rename,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {validAttachment} from './question-attachment.mjs';
import {requestGeminiImage,isGeminiImageConfigured,imageSize} from './ai-gateway.mjs';
import {warnLiveUpdate} from './live-files.mjs';

import {imageSlots,resolveImageChoices,checkEditConstraints,previousImage,tourDestination} from './image-planning.mjs';
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

const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const mimes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};

export function createImageTasks({root,profile,interactionWork,onChange,onFinish,archive,log,runPython=python,generateImage=requestGeminiImage,geminiEnabled=isGeminiImageConfigured}){
  const cli=resolve(root,'workflows/comfyui/image_chain.py'), waitCli=resolve(root,'../tools/comfy_job.py');
  const receipts=join(profile,'image-tasks'),jobs=new Map();
  let closed=false,restoring=true;
  const life=new AbortController();
  const monitors=new Map();
  const save=async row=>{
    const path=join(receipts,row.job+'.json');
    await writeFile(path+'.tmp',JSON.stringify(row,null,2));
    await rename(path+'.tmp',path);
    jobs.set(row.job,row);
    if(!closed)onChange?.();
  };
  async function archiveResult(row){
    if(!archive||row.archiveComplete||row.sceneDrawing)return;
    try{
      const result=await archive(row);
      row.archiveComplete=result.complete;
      row.archivedOutput=result.output;
      row.archiveWarning=result.complete?'':'部分图片未能归档，下次启动将重试。';
    }catch{row.archiveWarning='对话归档写入失败，下次启动将重试。';}
  }
  async function monitor(start,custom){
    let terminal;
    try{
      if(custom)terminal=await custom(start);
      else if(start.backend==='gemini'&&!start.localJob)terminal={state:'failed',error:'应用重启，Gemini 生图任务已中断。'};
      else terminal=await runPython(waitCli,['wait',start.localJob??start.job]);
    }
    catch(error){terminal={state:'failed',error:error.message};}
    if(closed)throw Object.assign(Error('图像任务等待恢复'),{code:'INTERRUPTED'});
    const row={...start,...terminal,job:start.job};
    const label=labels[row.operation]??'图像任务';
    const via=row.backend==='gemini'?'（Gemini）':'';
    row.text=row.state==='done'?[row.note,`已完成 ${row.width}×${row.height} 图片${via}。`].filter(Boolean).join(''):
      `${row.step?'第 '+row.step+' 步「'+label+'」':'图像任务'}失败：${row.error??'未收到结果'}`;
    if(row.tour&&row.state==='done')row.text=`绯月环球之旅 · ${row.tour.destination}，已完成 ${row.width}×${row.height} 写实合成照。`;
    await archiveResult(row);
    await save(row);
    await onFinish?.(row);
    return row;
  }
  function monitorJob(row,custom){
    if(monitors.has(row.job))return monitors.get(row.job);
    const pending=monitor(row,custom).finally(()=>monitors.delete(row.job));
    monitors.set(row.job,pending);
    void pending.catch(error=>{if(!closed)return onFinish?.({...row,state:'failed',text:'图像回执写入失败：'+error.message});}).catch(()=>{});
    return pending;
  }
  async function queued(row,original,label){
    if(row.state!=='queued')throw Error(row.error??'提交失败');
    Object.assign(row,{at:Date.now(),original,text:'已排队 · '+label});
    await save(row);
    monitorJob(row);
    return row;
  }
  // 生图默认走 Gemini：每个任务最多试 2 次，失败原因写入回执并通知；2 次都失败再转本地 ComfyUI。
  async function generateSteps(row,ctx){
    const dir=join(receipts,'gemini-'+row.job);
    await mkdir(dir,{recursive:true});
    const completed=[];
    let previous=ctx.base;
    for(const [i,step] of ctx.steps.entries()){
      const started=new Date().toISOString();
      const images=[...(step.op==='generate'?[]:[i?previous:ctx.base]),...step.refs.map(n=>ctx.attachments[n-1])];
      const prompt={generate:step.quote,img2img:'以第一张图为底图重绘，保持主体与构图：'+step.quote,
        edit:'编辑第一张图：'+step.quote+'。其余图片只作参考，未提到的部分保持原样。'}[step.op];
      const image=await generateImage({prompt,images,signal:life.signal});
      const path=join(dir,`step-${String(i+1).padStart(2,'0')}.${extensions[image.mime]??'png'}`);
      await writeFile(path,image.bytes);
      completed.push({step:i+1,operation:step.op,started,finished:new Date().toISOString(),seed:null,output:path,...imageSize(image.bytes)});
      previous={mime:image.mime,bytes:image.bytes};
    }
    const last=completed.at(-1);
    return {completed,output:last.output,width:last.width,height:last.height};
  }
  async function runGemini(row,ctx){
    const failures=[];
    for(let attempt=1;attempt<=2;attempt++){
      try{
        return {state:'done',...await generateSteps(row,ctx),backend:'gemini',geminiFailures:failures,updated:new Date().toISOString()};
      }catch(error){
        if(closed||life.signal.aborted)throw error;
        failures.push({attempt,code:error.code??'GEMINI_FAILED',message:error.message});
        Object.assign(row,{geminiFailures:failures,text:`Gemini 生图失败（${attempt}/2）：${error.message}${attempt<2?'，正在重试…':''}`});
        await save(row);
        void log?.({direction:'local',route:'图像任务',stage:'Gemini 生图失败',attempt,error:error.code??error.name,job:row.job});
      }
    }
    const reason=`Gemini 生图连续失败 2 次（${failures.at(-1).message}）`;
    let local;
    try{
      if(!ctx.localSubmit||!(await runPython(cli,['availability']).catch(()=>({}))).available)throw Error('本地 ComfyUI 不可用');
      Object.assign(row,{text:reason+'，已转本地 ComfyUI…'});
      await save(row);
      local=await ctx.localSubmit();
      if(local.state!=='queued')throw Error(local.error??'本地提交失败');
    }catch(error){
      return {state:'failed',backend:'gemini',geminiFailures:failures,error:reason+'；'+error.message};
    }
    Object.assign(row,{backend:'local-fallback',localJob:local.job,version:local.version,workflowVersion:local.workflowVersion});
    await save(row);
    const terminal=await runPython(waitCli,['wait',local.job]);
    return {...terminal,backend:'local-fallback',geminiFailures:failures,note:reason+'，已改用本地 ComfyUI。'};
  }
  async function startGemini({job=randomUUID().replaceAll('-',''),original,steps,attachments=[],base,localSubmit,label,extra={}}){
    const row={job,state:'queued',backend:'gemini',submitted:new Date().toISOString(),at:Date.now(),completed:[],original,
      text:'已排队 · Gemini 生图 · '+label,...extra};
    await mkdir(receipts,{recursive:true});
    await save(row);
    monitorJob(row,start=>runGemini(start,{steps,attachments,base,localSubmit}));
    return row;
  }
  const ready=(async()=>{
    let names;
    try{names=await readdir(receipts);}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const name of names.filter(s=>/^[a-f0-9]{32}\.json$/u.test(s))){
      const row=JSON.parse(await readFile(join(receipts,name),'utf8'));
      jobs.set(row.job,row);
      if(!['done','failed'].includes(row.state))monitorJob(row);
      else if(archive&&!row.archiveComplete&&!row.sceneDrawing){await archiveResult(row);await save(row);}
    }
  })().finally(()=>{restoring=false;});
  const ordered=()=>[...jobs.values()].sort((a,b)=>b.at-a.at);
  return {
    get busy(){return restoring||monitors.size>0;},
    async generateServerImage(prompt,taskId,sceneDrawing=false){
      await ready;
      if(!archive&&!sceneDrawing)throw Error('本地图片归档未就绪。');
      const job=taskId.replaceAll('-','');
      let row=jobs.get(job);
      if(row&&(Boolean(row.sceneDrawing)!==sceneDrawing||row.serverTaskId!==taskId||row.original!==prompt))throw Error('已有图像任务与本次提交不符。');
      if(!row&&geminiEnabled()){
        const steps=[{op:'generate',quote:prompt,refs:[]}];
        row=await startGemini({job,original:prompt,steps,label:sceneDrawing?'绯月画作':'服务器文字生图',extra:{sceneDrawing,serverTaskId:taskId},
          localSubmit:()=>runPython(cli,['submit','--server-task-id',taskId],{original:prompt,steps})});
        row=await monitorJob(row);
      }else if(!row){
        const queued=await runPython(cli,['submit','--server-task-id',taskId],{original:prompt,steps:[{op:'generate',quote:prompt,refs:[]}]});
        if(queued.job!==job){
          const failure={job,sceneDrawing,serverTaskId:taskId,original:prompt,at:Date.now(),state:'failed',completed:[],
            error:queued.error??'图像作业提交回执不匹配。'};
          failure.text='服务器生图提交失败：'+failure.error;
          await mkdir(receipts,{recursive:true});
          await archiveResult(failure);await save(failure);
          throw Error(failure.text);
        }
        row={...queued,sceneDrawing,serverTaskId:taskId,original:prompt,at:Date.parse(queued.submitted)||Date.now(),text:sceneDrawing?'已排队 · 绯月画作':'已排队 · 服务器文字生图'};
        await mkdir(receipts,{recursive:true});
        await save(row);
        row=await monitorJob(row);
      }else if(!['done','failed'].includes(row.state)){
        row=await monitorJob(row);
      }
      if(row.state!=='done')throw Error(row.text);
      if(sceneDrawing)return row.output??row.completed?.at(-1)?.output;
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
    async submit(text,attachments,{signal,onProgress}={}){
      await ready;
      signal?.throwIfAborted();
      if(text.length>2000)throw Error('图像指令最多 2000 字。');
      const destination=tourDestination(text);
      if(destination!==null){
        if(attachments.length||destination.length>80)throw Error('请用“绯月环球之旅：目的地”启动，参考图由绯月挑选。');
        await mkdir(receipts,{recursive:true});
        signal?.throwIfAborted();
        const row=await runPython(cli,['submit','--tour'],{original:text,destination});
        return queued(row,text,'绯月环球之旅');
      }
      if(attachments.length>16||attachments.some(a=>!validAttachment(a)||a.kind!=='image'))throw Error('图片任务仅支持最多 16 张图片。');
      const prior=previousImage.test(text)?ordered().find(r=>r.state==='done'||r.completed?.length):null;
      if(previousImage.test(text)&&!prior)throw Error('没有可继续编辑的本地结果，请附上底图。');
      const old=prior?.archivedOutput??prior?.output??prior?.completed?.at(-1)?.output;
      const count=attachments.length;
      const {slots,question}=imageSlots(text,count,Boolean(old));
      if(question)throw Error(question);
      const skill=await runPython(cli,['describe','--profile',profile]);
      if(!skill.instruction)throw Error(skill.error??'无法读取图像 skill。');
      for(const warning of skill.warnings??[])warnLiveUpdate('绯月技能',warning);
      let choices=slots.map(s=>s.ops[0]);
      if(slots.some(s=>s.ops.length>1)){
        const allowed=slots.map(({quote,ops})=>({quote,ops}));
        const schema={oneOf:[{type:'object',properties:{choices:{type:'array',prefixItems:slots.map(slot=>({enum:slot.ops})),
          minItems:slots.length,maxItems:slots.length}},required:['choices'],additionalProperties:false},
          {type:'object',properties:{question:{type:'string'}},required:['question'],additionalProperties:false}]};
        const plan=interactionWork?await interactionWork({purpose:'图像编排',context:allowed,
          instruction:skill.instruction+'\n仅为每项原文选择一个可用操作，或返回具体澄清问题。',schema,signal,onProgress,
          skill:{name:'image-task-chain',version:skill.promptVersion??skill.version},
          maxTokens:Math.max(80,slots.length*12+24),normalize(raw){
            if(raw?.question?.trim())return {value:{question:raw.question},review:raw};
            const steps=resolveImageChoices(slots,raw?.choices);
            if(!steps)return null;
            checkEditConstraints(text,steps);
            return {value:{steps},review:steps};
          }}):null;
        if(!plan)throw Error('图像编排服务不可用，请稍后再试或分句说明。');
        if(plan?.question||!Array.isArray(plan?.steps))throw Error(plan?.question||'请说明每一步要做什么。');
        choices=plan.steps.map(s=>s.op);
      }
      const steps=resolveImageChoices(slots,choices);
      if(!steps)throw Error('操作与本轮原文不符，请分句说明。');
      if(steps[0].op!=='generate'&&!count&&!old)throw Error('请拖入或粘贴待处理的底图。');
      checkEditConstraints(text,steps);
      if(steps[0].op==='generate'&&count&&!steps.some(s=>s.refs.length))throw Error('请说明上传的图用作底图，还是用来参考人物、服装或姿势。');
      const prepared=attachments.map(image=>{
        let bytes=Buffer.from(image.data.split(',')[1],'base64'),suffix='jpg';
        if(image.originalBytes){
          if(!ArrayBuffer.isView(image.originalBytes)||image.originalBytes.byteLength>20*1024*1024)throw Error('原始图片数据无效。');
          bytes=Buffer.from(image.originalBytes);
          if(bytes.readUInt32BE(0)===0x89504e47)suffix='png';
          else if(bytes.toString('ascii',8,12)==='WEBP')suffix='webp';
          else if(bytes[0]!==255||bytes[1]!==216)throw Error('原始图片格式不符。');
        }
        return {bytes,suffix,mime:mimes[suffix]};
      });
      await mkdir(receipts,{recursive:true});
      const localSubmit=async()=>{
        const temp=await mkdtemp(join(receipts,'input-'));
        try{
          const args=['submit','--version',skill.version,'--workflow-version',skill.workflowVersion];
          if(old)args.push('--base',old);
          for(const [i,image] of prepared.entries()){
            const path=join(temp,i+'.'+image.suffix);
            await writeFile(path,image.bytes);
            args.push('--image',path);
          }
          signal?.throwIfAborted();
          return await runPython(cli,args,{original:text,steps});
        }finally{await rm(temp,{recursive:true,force:true});}
      };
      const label=steps.map(s=>labels[s.op]).join(' → ');
      if(geminiEnabled()&&steps.every(step=>step.op!=='upscale')){
        let base;
        if(steps[0].op!=='generate'){
          if(old){const ext=old.split('.').pop().toLowerCase();base={bytes:await readFile(old),mime:mimes[ext]??'image/png'};}
          else base=prepared[0];
        }
        return startGemini({original:text,steps,attachments:prepared,base,localSubmit,label});
      }
      return queued(await localSubmit(),text,label);
    },
    close(){closed=true;life.abort();}
  };
}
