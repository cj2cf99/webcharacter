import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createImageTasks} from '../../desktop/image-tasks.mjs';
import {requestGeminiImage,imageSize} from '../../desktop/ai-gateway.mjs';

const png=Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452','hex'),Buffer.from([0,0,0,8,0,0,0,6]),Buffer.alloc(8)]);

async function setup(t,{generate,gemini=true,local={}}={}){
  const profile=await mkdtemp(join(tmpdir(),'feiyue-image-gemini-'));
  t.after(()=>rm(profile,{recursive:true,force:true}));
  const calls=[],finished=Promise.withResolvers(),logs=[];
  const runPython=async(_script,args,input)=>{
    calls.push(args[0]);
    if(args[0]==='availability')return {available:local.available!==false};
    if(args[0]==='describe')return {instruction:'图像规则',version:'1',workflowVersion:'1'};
    if(args[0]==='submit')return {job:'a'.repeat(32),version:'1',workflowVersion:'1',state:'queued',completed:[]};
    if(args[0]==='wait')return {state:'done',output:join(profile,'local.png'),width:512,height:512,
      completed:[{step:1,operation:'generate',output:join(profile,'local.png'),width:512,height:512}]};
    throw Error('未预期的调用 '+args[0]);
  };
  const tasks=createImageTasks({root:'unused',profile,interactionWork:()=>assert.fail('单操作无需编排'),runPython,
    generateImage:generate,geminiEnabled:()=>gemini,log:event=>logs.push(event),onFinish:row=>finished.resolve(row)});
  t.after(()=>tasks.close());
  return {tasks,calls,logs,finished:finished.promise};
}

test('生图默认走 Gemini：成功时写入图片和回执，不碰本地 ComfyUI',async t=>{
  const seen=[];
  const {tasks,calls,finished}=await setup(t,{generate:async input=>{seen.push(input);return {mime:'image/png',bytes:png};}});
  const queued=await tasks.submit('画一只猫',[],{});
  assert.match(queued.text,/Gemini/);
  const row=await finished;
  assert.equal(row.state,'done');assert.equal(row.backend,'gemini');
  assert.deepEqual([row.width,row.height],[8,6]);
  assert.equal(seen.length,1);assert.match(seen[0].prompt,/画一只猫/);
  assert.deepEqual(await readFile(row.output),png);
  assert.deepEqual(row.geminiFailures,[]);
  assert.ok(!calls.includes('submit')&&!calls.includes('wait'));
});

test('Gemini 失败一次会记录并重试，第二次成功',async t=>{
  let n=0;
  const {tasks,finished,logs}=await setup(t,{generate:async()=>{if(++n===1)throw Object.assign(Error('Gemini 没有返回图片（SAFETY）'),{code:'GEMINI_NO_IMAGE'});return {mime:'image/png',bytes:png};}});
  await tasks.submit('画一只猫',[],{});
  const row=await finished;
  assert.equal(row.state,'done');assert.equal(row.backend,'gemini');
  assert.equal(row.geminiFailures.length,1);assert.equal(row.geminiFailures[0].code,'GEMINI_NO_IMAGE');
  assert.equal(logs.filter(l=>l.stage==='Gemini 生图失败').length,1);
});

test('Gemini 连续失败 2 次后交给本地 ComfyUI，回执说明原因',async t=>{
  let n=0;
  const {tasks,finished,calls}=await setup(t,{generate:async()=>{n++;throw Object.assign(Error('Gemini 生图失败（HTTP 503）'),{code:'GEMINI_HTTP_503'});}});
  await tasks.submit('画一只猫',[],{});
  const row=await finished;
  assert.equal(n,2);
  assert.equal(row.state,'done');assert.equal(row.backend,'local-fallback');
  assert.match(row.text,/Gemini 生图连续失败 2 次.*HTTP 503.*本地 ComfyUI/u);
  assert.equal(row.geminiFailures.length,2);
  assert.ok(calls.includes('submit')&&calls.includes('wait'));
});

test('Gemini 两次失败且本地不可用时任务失败并写明两处原因',async t=>{
  const {tasks,finished}=await setup(t,{local:{available:false},generate:async()=>{throw Object.assign(Error('超时'),{code:'GEMINI_TIMEOUT'});}});
  await tasks.submit('画一只猫',[],{});
  const row=await finished;
  assert.equal(row.state,'failed');assert.match(row.text,/连续失败 2 次.*本地 ComfyUI 不可用/u);
});

test('未配置 Gemini 时直接走本地 ComfyUI',async t=>{
  const {tasks,calls,finished}=await setup(t,{gemini:false,generate:()=>assert.fail('不应调用 Gemini')});
  const queued=await tasks.submit('画一只猫',[],{});
  assert.doesNotMatch(queued.text,/Gemini/);
  assert.equal((await finished).state,'done');assert.ok(calls.includes('submit'));
});

test('Gemini 客户端用原生接口发送文字和参考图，无图时报 GEMINI_NO_IMAGE',async()=>{
  let seen;
  const fetcher=content=>async(url,init)=>{seen={url,key:init.headers['x-goog-api-key'],body:JSON.parse(init.body)};
    return Response.json({candidates:[{content:{parts:content},finishReason:'STOP'}]});};
  const image=await requestGeminiImage({prompt:'猫',images:[{mime:'image/png',bytes:png}],key:'k',
    fetcher:fetcher([{inlineData:{mimeType:'image/png',data:png.toString('base64')}}])});
  assert.equal(seen.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent');
  assert.equal(seen.key,'k');assert.equal(seen.body.contents[0].parts[0].text,'猫');
  assert.equal(seen.body.contents[0].parts[1].inlineData.mimeType,'image/png');
  assert.deepEqual(image.bytes,png);assert.deepEqual(imageSize(png),{width:8,height:6});
  await assert.rejects(requestGeminiImage({prompt:'猫',key:'k',fetcher:fetcher([{text:'无法生成'}])}),{code:'GEMINI_NO_IMAGE'});
  await assert.rejects(requestGeminiImage({prompt:'猫',key:'',fetcher:fetcher([])}),{code:'GEMINI_KEY_MISSING'});
});
