import {execFile} from 'node:child_process';
import {mkdir,mkdtemp,readFile,readdir,rename,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {validAttachment} from './question-attachment.mjs';

const patterns = {
  generate: /(?:生图|文生图|画(?:一?[张幅个只朵条头座]|出|个|一)|绘制|生成.{0,10}(?:图片|图像|插画|照片|海报|头像|壁纸|张|幅)|生成(?=.{0,35}(?:女孩|男孩|人物|风景|猫|狗)))/u,
  img2img: /(?:图生图|重绘|重画|重新绘制|(?:转|变|改|换)成.{0,12}(?:画风|风格|水彩|油画|动漫|素描))/u,
  edit: /(?:改图|修图|编辑.{0,4}图|换(?:上|成|装|人|衣|背景|服装|姿势|动作)|(?:背景|衣服|服装|姿势|人物|颜色).{0,8}(?:替换|换|改)|(?:把|将).{0,32}(?:换成|改成|改为|替换)|让.{0,8}(?:举手|转身|坐下))/u,
  upscale: /(?:高清(?:化|放大|处理)|超分(?:辨率)?|放大)/u
};
const inquiry = /(?:怎么|如何|教程|为什么|是否支持|支持.{0,8}吗|有(?:什么|哪些)区别|什么意思|有哪些(?:功能|模型)|(?:是什么|有什么用)[？?]?$)/u;
const previousImage = /(?:刚才|上次|上一张|刚生成|刚画|刚做|刚改|前一张)/u;
const imageContext = /(?:图|照片|海报|头像|壁纸|插画|画面|画作|封面|背景|换装|姿势|换人)/u;
export function imageRequest(text,count=0){
  if(!text||inquiry.test(text)||/^(?:请)?(?:解释|介绍|分析|讨论|翻译|总结|记下|提醒我)|(?:生成|写).{0,5}(?:生图)?(?:提示词|教程|说明文档)/u.test(text.trim()))return false;
  return activeClauses(text).some(part=>patterns.generate.test(part)||patterns.img2img.test(part)||
    ((count>0||imageContext.test(text)||previousImage.test(text))&&(patterns.edit.test(part)||patterns.upscale.test(part))));
}
const labels={generate:'文字生图',img2img:'图生图',edit:'定向编辑',upscale:'高清放大'};
function activeClauses(text){
  return text.split(/[；;。\n]|[，,、]?\s*(?:然后|接着|最后|之后再|再(?=换|放大|改|重绘|高清))|[，,](?=\s*(?:高清放大|放大|不用|不要|无需|别))/u)
    .map(s=>s.trim()).filter(s=>s&&!/^(?:请|先)?(?:不要|不用|无需|别)/u.test(s));
}
export function literalPlan(text,count,hasBase=false){
  const steps=[];
  for(const quote of activeClauses(text)){
    const ops=Object.keys(patterns).filter(op=>patterns[op].test(quote));
    if(ops.length!==1)return null;
    const op=ops[0];
    const refs=[...new Set([...quote.matchAll(/图\s*([1-9]\d*)/gu)].map(m=>Number(m[1])))];
    if(op==='edit'&&count>1&&!refs.length)return null;
    steps.push({op,quote,refs:op==='edit'?refs.filter(n=>hasBase||steps.length||n!==1):[]});
  }
  return steps.length?steps:null;
}

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

export function createImageTasks({root,profile,localModel,onChange,onFinish}){
  const cli=resolve(root,'workflows/comfyui/image_chain.py'), waitCli=resolve(root,'../tools/comfy_job.py');
  const receipts=join(profile,'image-tasks'),jobs=new Map();
  let closed=false;
  const save=async row=>{
    const path=join(receipts,row.job+'.json');
    await writeFile(path+'.tmp',JSON.stringify(row,null,2));
    await rename(path+'.tmp',path);
    jobs.set(row.job,row);
    if(!closed)onChange?.();
  };
  async function monitor(start){
    let terminal;
    try{terminal=await python(waitCli,['wait',start.job]);}
    catch(error){terminal={state:'failed',error:error.message};}
    if(closed)return;
    const row={...start,...terminal};
    const label=labels[row.operation]??'图像任务';
    row.text=row.state==='done'?`已完成 ${row.width}×${row.height} 图片。`:
      `${row.step?'第 '+row.step+' 步「'+label+'」':'图像任务'}失败：${row.error??'未收到结果'}`;
    await save(row);
    await onFinish?.(row);
  }
  const monitorJob=row=>{void monitor(row).catch(error=>{if(!closed)onFinish?.({...row,state:'failed',text:'图像回执写入失败：'+error.message});});};
  const ready=(async()=>{
    let names;
    try{names=await readdir(receipts);}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const name of names.filter(s=>/^[a-f0-9]{32}\.json$/u.test(s))){
      const row=JSON.parse(await readFile(join(receipts,name),'utf8'));
      jobs.set(row.job,row);
      if(!['done','failed'].includes(row.state))monitorJob(row);
    }
  })();
  const ordered=()=>[...jobs.values()].sort((a,b)=>b.at-a.at);
  return {
    async list(){await ready;return ordered().map(({job,text,state,original,width,height})=>({job,text,state,original,width,height}));},
    async result(job){await ready;const row=jobs.get(job);return row?.state==='done'?row.output:row?.completed?.at(-1)?.output;},
    async submit(text,attachments){
      await ready;
      if(text.length>2000)throw Error('图像指令最多 2000 字。');
      if(attachments.length>16||attachments.some(a=>!validAttachment(a)||a.kind!=='image'))throw Error('图片任务仅支持最多 16 张图片。');
      const prior=previousImage.test(text)?ordered().find(r=>r.state==='done'||r.completed?.length):null;
      if(previousImage.test(text)&&!prior)throw Error('没有可继续编辑的本地结果，请附上底图。');
      const old=prior?.output??prior?.completed?.at(-1)?.output;
      const count=attachments.length;
      const skill=await python(cli,['describe']);
      if(!skill.instruction)throw Error(skill.error??'无法读取图像 skill。');
      let steps=literalPlan(text,count,Boolean(old));
      if(!steps){
        const plan=await localModel?.analyze(text,{hint:'image-plan',imageSkill:{count,hasBase:Boolean(old),instruction:skill.instruction}});
        if(plan?.question||!plan?.steps?.length)throw Error(plan?.question||'请指明需要生成、修改或放大的内容，以及参考哪张图。');
        steps=plan.steps;
        for(const step of steps){
          if(!Object.hasOwn(patterns,step.op)||!activeClauses(text).some(part=>part.includes(step.quote)&&patterns[step.op].test(step.quote)))
            throw Error('步骤与原指令未能对应，请分句说明需要的图像操作。');
        }
        const covered=new Set(steps.map(s=>s.op));
        if(activeClauses(text).some(part=>Object.keys(patterns).some(op=>patterns[op].test(part)&&!covered.has(op))))
          throw Error('还有未识别的图像步骤，请分别说明各步要做什么。');
      }
      if(steps[0].op!=='generate'&&!count&&!old)throw Error('请拖入或粘贴待处理的底图。');
      if(steps[0].op==='generate'&&count&&!steps.some(s=>s.refs.length))throw Error('请说明上传的图用作底图，还是用来参考人物、服装或姿势。');
      await mkdir(receipts,{recursive:true});
      const temp=await mkdtemp(join(receipts,'input-'));
      try{
        const args=['submit','--version',skill.version,'--workflow-version',skill.workflowVersion];
        if(old)args.push('--base',old);
        for(const [i,image] of attachments.entries()){
          const path=join(temp,i+'.jpg');
          await writeFile(path,Buffer.from(image.data.split(',')[1],'base64'));
          args.push('--image',path);
        }
        const row=await python(cli,args,{original:text,steps});
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
