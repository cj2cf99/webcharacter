// Run with desktop/node_modules/electron/dist/electron.exe <this file> ROUND OUTPUT.json.
// This probe only plans tasks. It has no tool for submitting, capturing, or accessing the network.
import * as electron from 'electron';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {menuEntry,readInteractionSkill} from '../desktop/interaction-skills.mjs';
import {createServerTaskCommand} from '../desktop/server-task-command.mjs';
import {createLocalModel,LOCAL_MODEL_FILE} from '../desktop/local-model.mjs';
import {attachScreenQuestion} from '../desktop/screen-question-host.mjs';
import {fixture} from '../agent/tests/screen-question-fixture.mjs';
import {imageRequest,literalPlan} from '../desktop/image-tasks.mjs';

const prior={用户:'我把集合时间定在七点半。',绯月:'好呀，我知道了。'};
const edit={text:'保留脸，换成图2的雨衣，最后高清放大',count:2,keep:['保留脸','图2的雨衣'],ops:[['edit',[2]],['upscale',[]]]};
const missing={text:'把图1里的衬衣换成图3的外套',count:2,clarify:true};
const rounds=[
  [edit,missing,{text:'我刚才说的集合时间是几点？',previous:prior,match:/七点半/}],
  [missing,{text:'用图2的姿势修改图1，别放大',count:2,ops:[['edit',[2]]]},
    {text:'把今天步行二十分钟登记为运动',hint:'registration',kind:'task'}],
  [{text:'用图2的姿势修改图1，别放大',count:2,ops:[['edit',[2]]]},
    {text:'给我画一幅雪地小屋，不要高清放大',count:0,ops:[['generate',[]]]},
    {text:'把刚才那张图的背景改成雨夜，然后放大',count:0,hasBase:true,ops:[['edit',[]],['upscale',[]]]},
    {text:'我忙了一天，只想你陪我聊一会儿。',match:/陪|听|聊/}],
  [edit,missing,{text:'把图1的上衣换成图2的夹克，保留脸和背景',count:2,keep:['夹克','保留脸和背景'],ops:[['edit',[2]]]},
    {text:'给我画一幅雪地小屋，不要高清放大',count:0,keep:['画一幅雪地小屋'],ops:[['generate',[]]]},
    {text:'把刚才那张图的背景改成雨夜，然后放大',count:0,hasBase:true,keep:['背景改成雨夜','放大'],ops:[['edit',[]],['upscale',[]]]},
    {text:'把这张照片重绘为铅笔素描',count:1,keep:['铅笔素描'],ops:[['img2img',[]]]},
    {text:'我刚才定的是哪个时间？',previous:prior,match:/七点半/},
    {text:'查一下东京明天的天气',hint:'weather',kind:'external'}]
];

async function testDesktop(model,profile,round){
  const f=fixture(),calls=[],drafts=[];
  const client={forget(){},async askText(){calls.push('文字');return {state:'answer',text:'模拟文字回执'};},
    async captureAndAsk(){calls.push('截图');return {state:'answer',text:'模拟屏幕回执'};}};
  const localModel={async analyze(text,options){
      const value=await model.analyze(text,options);
      const menu=options.hint==='auto'&&menuEntry(text);
      const selected=menu?await readInteractionSkill(menu.action,'menu'):await readInteractionSkill(options.hint);
      const loaded=typeof options.skillInstruction==='string'?selected.instruction===options.skillInstruction:
        options.skillInstruction?.name===selected.skill&&options.skillInstruction.version===selected.version;
      drafts.push({hint:options.hint,skill:selected.skill,version:selected.version,loaded,value});
      return value;
  }};
  const serverTask=createServerTaskCommand({profile,localModel,tasks:{
    identity:{device_id:'mock-pc'},supportsTask:type=>type==='mock.echo',
    async weatherRequest(path,opts){
      calls.push(opts.method+' '+path);
      if(path!=='/api/tasklist'||opts.method!=='GET')throw Error('测试只允许读取模拟模板');
      return {ok:true,json:async()=>({tasklist:[{type:'mock.echo',executor:'pc',name:'原文回显',
        description:'返回指定文字',parameter_spec:{value:{type:'string',required:true}}}]})};
    }
  },dialog:{async showMessageBox(options){calls.push('取消 '+JSON.parse(options.detail.slice(options.detail.indexOf('{'))).value);return {response:0};}}});
  const host=attachScreenQuestion(f.electron,{win:f.win,root:profile,profile,bundle:profile,history:f.history,client,visible:false,
    localModel,serverTask,search:async()=>{calls.push('搜索');throw Error('模拟服务离线');}});
  const image={kind:'image',name:'底图.jpg',data:'data:image/jpeg;base64,AA=='};
  const cases=round===3?[
    [{text:'本地复盘怎么打开'},/任务 → 本地复盘/,[], 'answer'],
    [{text:'把图1的衣服换成图3的外套',attachment:image,references:[image]},/收到 2 张.*找不到图3/,[], 'error'],
    [{text:'屏幕中是什么颜色？',withScreen:true},/模拟屏幕回执/,['截图'], 'answer'],
  ]:[
    [{text:'想看上次聊天',mode:'memory'},/暂未开放/,[], 'error'],
    [{text:'罗马古建筑',mode:'web'},/暂时没有可用结果/,['搜索'], 'error'],
    [{text:'这个文件说了什么？',attachment:{kind:'text',name:'示例.txt',data:'示例原文：确认提交。'}},/模拟文字回执/,['文字'], 'answer'],
    [{text:'把图1的上衣换成图4的夹克',attachment:image},/收到 1 张.*找不到图4/,[], 'error'],
    [{text:'接取任务与任务链怎么打开'},/任务 → 接取任务与任务链/,[], 'answer'],
    [{text:'动画与声音怎么打开'},/设置与维护 → 动画与声音/,[], 'answer'],
    [{text:'提醒检查 · 待执行怎么打开'},/提醒检查 · 待执行/,[], 'answer'],
    [{text:'服务器任务：请原文回显「海风」'},/已取消服务器任务/,['GET /api/tasklist','取消 海风'], 'answer'],
  ];
  const rows=[];
  try{
    await host.open();
    const ask=f.handlers.get('screen-qa:ask'),event=f.event(host.panel);
    for(const [args,match,expected,state] of cases){
      calls.length=0;drafts.length=0;
      const value=await ask(event,args);
      rows.push({text:args.text,reply:value.text,state:value.state,calls:[...calls],drafts:[...drafts],
        passed:value.state===state&&match.test(value.text)&&isDeepStrictEqual(calls,expected)&&drafts.every(d=>d.loaded)});
    }
    return rows;
  }finally{host.close();}
}

function accepted(c,value){
  if(!value||value.error)return false;
  if(c.kind)return value.kind===c.kind&&value.reply==='';
  if(c.match)return value.kind==='chat'&&c.match.test(value.reply??'');
  if(c.clarify)return value.steps?.length===0&&Boolean(value.question?.trim());
  if(value.question!==''||!Array.isArray(value.steps))return false;
  let end=0;
  for(const s of value.steps){
    const pos=c.text.indexOf(s.quote,end);
    if(!s.quote||pos<0)return false;
    end=pos+s.quote.length;
  }
  return isDeepStrictEqual(value.steps.map(s=>[s.op,s.refs]),c.ops)
    &&(c.keep??[]).every(term=>value.steps.some(s=>s.quote.includes(term)));
}

async function checkImageRoutes(cases,profile,root){
  const path=join(profile,'mock.png');
  // Only the check command is used. No image decoding or execution occurs.
  await writeFile(path,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2S8AAAAASUVORK5CYII=','base64'));
  const results=[];
  for(const c of cases.filter(c=>c.ops)){
    const steps=literalPlan(c.text,c.count,c.hasBase);
    const route=imageRequest(c.text,c.count);
    if(!steps){results.push({text:c.text,route,via:'model'});continue;}
    const args=['-B',join(root,'workflows','comfyui','image_chain.py'),'check'];
    if(c.hasBase)args.push('--base',path);
    for(let n=0;n<c.count;n++)args.push('--image',path);
    const compiled=JSON.parse(execFileSync('python',args,{input:JSON.stringify({original:c.text,steps}),encoding:'utf8',windowsHide:true}));
    results.push({text:c.text,route,via:'literalPlan',compiled,passed:route&&accepted(c,{steps:compiled.steps,question:''})});
  }
  return results;
}

async function run(){
  const round=Number(process.argv[2]),output=process.argv[3];
  if(!rounds[round-1]||!output)throw Error('需要轮次 1–4 和独立输出路径');
  const root=fileURLToPath(new URL('../',import.meta.url));
  const profile=await mkdtemp(join(tmpdir(),'feiyue-skill-test-'));
  electron.app.setPath('userData',profile);
  electron.app.disableHardwareAcceleration();
  await electron.app.whenReady();
  const model=createLocalModel({utilityProcess:electron.utilityProcess,modelPath:join(root,'desktop','models',LOCAL_MODEL_FILE)});
  const rows=[];
  let desktop=[];
  try{
    await model.start();
    if(model.snapshot().state!=='ready')throw Error(JSON.stringify(model.snapshot()));
    for(const [i,c] of rounds[round-1].entries()){
      const image=c.count!==undefined,hint=image?'image-plan':c.hint??'auto';
      const selected=image?JSON.parse(execFileSync('python',['-B',join(root,'workflows','comfyui','image_chain.py'),'describe'],{encoding:'utf8',windowsHide:true})):await readInteractionSkill(hint);
      // Alternate order so the enabled condition does not always get the warm cache.
      for(const enabled of ((i+round)%2?[false,true]:[true,false])){
        const instruction=selected.localAi?{...selected.localAi,name:selected.skill,version:selected.version}:selected.instruction;
        const options=image?{imageSkill:{count:c.count,hasBase:Boolean(c.hasBase),instruction:enabled?instruction:''}}:
          {previous:c.previous,skillInstruction:enabled?instruction:undefined};
        const value=await model.analyze(c.text,{hint,...options});
        rows.push({text:c.text,skill:selected.skill??'image-task-chain',version:selected.version,enabled,value,passed:accepted(c,value)});
        await writeFile(output,JSON.stringify({round,model:LOCAL_MODEL_FILE,rows},null,2)+'\n');
      }
    }
    if(round>=3)desktop=await testDesktop(model,profile,round);
    const imageChecks=await checkImageRoutes(rounds[round-1],profile,root);
    await writeFile(output,JSON.stringify({round,model:LOCAL_MODEL_FILE,rows,desktop,imageChecks},null,2)+'\n');
    if(imageChecks.some(v=>v.passed===false))process.exitCode=1;
  }finally{model.close();}
  electron.app.exit(rows.some(r=>r.enabled&&!r.passed)||desktop.some(r=>!r.passed)?1:process.exitCode??0);
}
run().catch(e=>{console.error(e);electron.app.exit(2);});
