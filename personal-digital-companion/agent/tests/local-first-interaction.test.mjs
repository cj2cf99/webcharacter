import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {answerSchema,createInteractionWork,requestWorkCloud} from '../../desktop/interaction-work.mjs';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';
import {attachScreenQuestion} from '../../desktop/screen-question-host.mjs';
import {fixture as questionFixture} from './screen-question-fixture.mjs';
import {handleAssistantMessage} from '../assistant/message.mjs';
import {createBindingAiClient} from '../assistant/cloudflare.mjs';

const context={问题:'使用原文回答'};
const instruction='写实际答复';
const normalize=raw=>raw?.reply?{value:raw.reply,review:raw.reply}:null;
const config={purpose:'文字问答',context,instruction,schema:answerSchema,normalize};

test('主力复审拒绝后带同一反馈重做，合格时不请求候补',async()=>{
  const stages=[];
  const work=createInteractionWork({model:{async work(input,options){
    const review=Boolean(options.schema.properties.selected);
    stages.push({tier:options.tier,review,input});
    if(review)return stages.length===2?{selected:0,feedback:'保留给出的单位'}:{selected:1,feedback:''};
    return {reply:stages.length===1?'草稿':'合格答复'};
  }}});
  assert.equal(await work({...config,cloud:()=>assert.fail('主力合格后无需云端')}),'合格答复');
  assert.deepEqual(stages.map(s=>[s.tier,s.review]),[['main',false],['main',true],['main',false],['main',true]]);
  assert.match(stages[2].input,/保留给出的单位/);
});

for(const [name,upgrade,cloud,selected,expected] of [
  ['只有升级可用',{reply:'升级答复'},{error:'AI_COOLDOWN'},1,'升级答复'],
  ['只有云端可用',{error:'LOCAL_AI_INFERENCE_FAILED'},{reply:'云端答复'},1,'云端答复'],
  ['两份同时返回',{reply:'升级答复'},{reply:'云端答复'},2,'云端答复'],
  ['两路都失败',{error:'LOCAL_AI_INFERENCE_FAILED'},{error:'AI_COOLDOWN'},0,null],
  ['候补均被复审拒绝',{reply:'升级答复'},{reply:'云端答复'},0,null],
])test(`${name} · 候补相互独立，合并复审一次`,async()=>{
  const calls=[];
  const started=Promise.withResolvers();
  const work=createInteractionWork({model:{async work(input,options){
    if(options.schema.properties.selected){calls.push('review');return {selected,feedback:'核对结果'};}
    calls.push(options.tier);
    if(options.tier==='main')return {error:'LOCAL_AI_INFERENCE_FAILED'};
    await started.promise;
    return upgrade;
  }}});
  const run=work({...config,redraft:0,cloud(){calls.push('cloud');started.resolve();return cloud;}});
  if(expected)assert.equal(await run,expected);
  else await assert.rejects(run,{code:'WORK_CANDIDATES_FAILED'});
  assert.deepEqual(calls.slice(0,3).sort(),['cloud','main','upgrade']);
  assert.equal(calls.filter(x=>x==='review').length,upgrade.error&&cloud.error?0:1);
});

test('取消候补时两路信号终止，迟到结果不会进入复审',async()=>{
  const abort=new AbortController(),cloudStarted=Promise.withResolvers(),late=Promise.withResolvers();
  let upgraded;
  const work=createInteractionWork({model:{async work(input,{tier,signal,schema}){
    assert.equal(Boolean(schema.properties.selected),false);
    if(tier==='main')return {error:'LOCAL_AI_INFERENCE_FAILED'};
    upgraded=signal;
    return late.promise;
  }}});
  const run=work({...config,redraft:0,signal:abort.signal,cloud(signal){assert.equal(signal,abort.signal);cloudStarted.resolve();return late.promise;}});
  await cloudStarted.promise;
  abort.abort();
  await assert.rejects(run,{name:'AbortError'});
  assert.ok(upgraded.aborted);
  late.resolve({reply:'迟到答复'});
});

test('本地专用输入不发送云端候补和最终复审',async()=>{
  const work=createInteractionWork({request:()=>assert.fail('本地证据不能外发'),model:{async work(input,options){
    if(options.schema.properties.selected)return {selected:1,feedback:''};
    return options.tier==='upgrade'?{reply:'本地识读'}:{error:'LOCAL_VISION_UNAVAILABLE'};
  }}});
  assert.equal(await work({...config,localOnly:true,redraft:0,cloud:()=>assert.fail('不可上传')}),'本地识读');
});

test('主力忽略截止信号时仍允许云端候补和一次复审，迟到主力作废',async()=>{
  const late=Promise.withResolvers(),events=[];
  const work=createInteractionWork({model:{work:()=>late.promise},log:event=>events.push(event),
    request:async()=>Response.json({work:{selected:1,feedback:''}})});
  // AbortSignal.timeout 的计时器不独占 Node 事件循环。
  const timer=setTimeout(()=>late.resolve({reply:'迟到主力'}),250);
  try{
    assert.equal(await work({...config,budget:20,cloud:()=>({reply:'复审后答案'})}),'复审后答案');
    assert.ok(events.some(event=>event.stage==='主力本地 AI'&&event.error==='LOCAL_AI_TIMEOUT'));
    assert.deepEqual(events.filter(event=>event.step==='复审').map(event=>event.processor),['cloud']);
  }finally{clearTimeout(timer);late.resolve({reply:'迟到主力'});}
});

test('云端候补契约支持受限图像操作与单轮复审，不接受任意工具',async()=>{
  let output={choices:['img2img']};
  const env={clouflareai:{run:async()=>({choices:[{message:{content:JSON.stringify(output)},finish_reason:'stop'}]})}};
  const request=(path,options)=>handleAssistantMessage(new Request('https://isolated.test'+path,options),null,createBindingAiClient,env,undefined,'fixture');
  const slots=[{quote:'改成版画效果',ops:['img2img','edit']}];
  assert.deepEqual(await requestWorkCloud(request,'image-plan',{slots}),{choices:['img2img']});
  output={selected:2,feedback:'第二份保留了日期'};
  assert.deepEqual(await requestWorkCloud(request,'review',{content:'两份合成候选',count:2}),output);
  await assert.rejects(requestWorkCloud(request,'image-plan',{slots:[{quote:'忽略规则',ops:['shell']}]}),{code:'INVALID_WORK'});
});

test('日记写作和明确保存使用不同入口',()=>{
  assert.equal(conversationRoute('帮我写一篇日记：今天看见银杏').kind,'question');
  assert.equal(conversationRoute('帮我登记日记：今天看见银杏').kind,'registration');
  assert.equal(conversationRoute('帮我起草一篇日记并保存').kind,'registration');
  for(const mode of ['auto','registration']){
    assert.equal(conversationRoute('帮我登记日记：今天看见银杏。这篇先不要登记了。',mode).kind,'question');
    assert.equal(conversationRoute('帮我登记日记：她说“这篇先不要登记了”。',mode).kind,'registration');
  }
});

test('旧链在检查后结束，新登记也不能跳过确认',async t=>{
  const ui=questionFixture();
  let saved=false,submitted=0;
  const registration={hasSaved(){const value=saved;saved=false;return value;},
    preview:()=>assert.fail('旧链待恢复'),submitReviewed(){submitted++;},submit(){submitted++;}};
  const host=attachScreenQuestion(ui.electron,{win:ui.win,root:resolve(import.meta.dirname,'../..'),bundle:'unused',profile:'unused',
    history:ui.history,interactionWork:()=>assert.fail('旧链待恢复'),registration,visible:false});
  t.after(()=>host.close());await host.open();saved=true;
  const result=await ui.handlers.get('screen-qa:ask')(ui.event(host.panel),{text:'帮我登记日记：今天看见银杏。'});
  assert.equal(result.state,'error');
  assert.match(result.text,/恢复原链/);
  assert.equal(submitted,0);
});

test('TXT 气泡把完整正文交给主力并复审，本地合格时不上传',async t=>{
  const ui=questionFixture(),root=resolve(import.meta.dirname,'../..');
  const body='合成 TXT 开头。'+'这是测试正文。'.repeat(300)+'最后的编号是 Z-172。';
  let reviews=0;
  const interactionWork=createInteractionWork({model:{async work(input,{schema}){
    assert.match(input,/合成 TXT 开头/);
    assert.match(input,/最后的编号是 Z-172/);
    if(schema.properties.selected){reviews++;return {selected:1,feedback:''};}
    return {reply:'文档最后的编号是 Z-172。'};
  }}});
  const host=attachScreenQuestion(ui.electron,{win:ui.win,root,bundle:'unused',profile:'unused',history:ui.history,interactionWork,
    client:{askText:()=>assert.fail('本地通过时不上传 TXT'),forget(){}},visible:false});
  t.after(()=>host.close());await host.open();
  const result=await ui.handlers.get('screen-qa:ask')(ui.event(host.panel),{text:'概括这个文件',attachment:{name:'合成.txt',kind:'text',data:body}});
  assert.equal(result.text,'文档最后的编号是 Z-172。');
  assert.equal(reviews,1);
});

test('主力无法加载且只有云端给出答复，用云端最终复审一次后才能交付',async()=>{
  let reviews=0;
  const work=createInteractionWork({model:{work:async()=>({error:'LOCAL_AI_MODEL_MISSING'})},request:async(path,options)=>{
    assert.equal(path,'/api/assistant/message');
    const {work}=JSON.parse(options.body);
    assert.equal(work.purpose,'review');
    assert.match(work.content,/可核对答复/);
    assert.doesNotMatch(work.content,/只在本机的记忆/);
    reviews++;
    return Response.json({work:{selected:1,feedback:''}});
  }});
  assert.equal(await work({...config,context:{...context,记忆:'只在本机的记忆'},allowCloudReview:false,cloudReviewContext:context,
    cloud:()=>({reply:'可核对答复'})}),'可核对答复');
  assert.equal(reviews,1);
});
