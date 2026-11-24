import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {answerSchema,createInteractionWork,requestWorkCloud} from '../../desktop/interaction-work.mjs';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';
import {attachScreenQuestion} from '../../desktop/screen-question-host.mjs';
import {fixture as questionFixture} from './screen-question-fixture.mjs';
import {handleAssistantMessage} from '../assistant/message.mjs';
import {createBindingAiClient} from '../assistant/cloudflare.mjs';
import {writeDeepSeekReply} from '../../desktop/chat-deepseek.mjs';

const context={问题:'使用原文回答'};
const instruction='写实际答复';
const normalize=raw=>raw?.reply?{value:raw.reply,review:raw.reply}:null;
const config={purpose:'文字问答',context,instruction,schema:answerSchema,normalize};



test('本机路径只生成一次，不复审；失败直接报未取得结果',async()=>{
  let calls=0;
  const work=createInteractionWork({model:{async work(_input,{schema}){
    calls++;assert.equal(schema.properties.selected,undefined);return {reply:'本机答复'};
  }}});
  assert.equal(await work({...config,localOnly:true,cloud:()=>assert.fail('私密输入不发服务器')}),'本机答复');
  assert.equal(calls,1);
  const failing=createInteractionWork({model:{work:async()=>({error:'LOCAL_AI_MODEL_MISSING'})}});
  await assert.rejects(failing({...config,localOnly:true}),{code:'WORK_CANDIDATES_FAILED'});
});

test('文字单次交给半岛；半岛失败才退回服务器候补，私密资料不外发',async t=>{
  const key=process.env.bandao_api_key,realFetch=globalThis.fetch,seen=[];
  process.env.bandao_api_key='fixture-key';
  let mode='ok';
  globalThis.fetch=async(url,options)=>{
    seen.push(JSON.parse(options.body));
    return mode==='ok'?Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'云端答复'})}}]}):new Response(null,{status:500});
  };
  t.after(()=>{globalThis.fetch=realFetch;if(key===undefined)delete process.env.bandao_api_key;else process.env.bandao_api_key=key;});
  const work=createInteractionWork({model:{work:()=>assert.fail('有半岛时不占本机')}});
  assert.equal(await work(config),'云端答复');
  assert.equal(seen.length,1);assert.equal(seen[0].model,'deepseek-v4.1-flash');assert.equal(seen[0].reasoning_effort,'low');
  assert.deepEqual(JSON.parse(seen[0].messages[1].content.split('\n\n（')[0]),{原始输入:context});
  mode='down';
  assert.equal(await work({...config,cloud:()=>({reply:'服务器答复'})}),'服务器答复');
  await assert.rejects(work({...config,localOnly:true}),{code:'WORK_CANDIDATES_FAILED'});
});

test('图片识读只调用传入的视觉候选一次，不经文字模型',async()=>{
  let calls=0;
  const work=createInteractionWork({model:{work:()=>assert.fail('图片不走文字模型')}});
  const answer=await work({...config,mainCandidate:async()=>{calls++;return {text:'一只猫'};},
    normalize:raw=>raw?.text?{value:raw.text,review:raw.text}:{error:'LOCAL_VISION_UNAVAILABLE'}});
  assert.equal(answer,'一只猫');assert.equal(calls,1);
  await assert.rejects(work({...config,mainCandidate:async()=>({reason:'看不清'}),
    normalize:raw=>raw?.text?{value:raw.text}:{error:'LOCAL_VISION_UNAVAILABLE'}}),{code:'WORK_CANDIDATES_FAILED'});
  assert.equal(calls,1);
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


test('TXT 气泡把完整正文一次交给本机 4B，不复审、不上传',async t=>{
  const ui=questionFixture(),root=resolve(import.meta.dirname,'../..');
  const body='合成 TXT 开头。'+'这是测试正文。'.repeat(300)+'最后的编号是 Z-172。';
    const interactionWork=createInteractionWork({model:{async work(input,{schema}){
    assert.match(input,/合成 TXT 开头/);
    assert.match(input,/最后的编号是 Z-172/);
    return {reply:'文档最后的编号是 Z-172。'};
  }}});
  const host=attachScreenQuestion(ui.electron,{win:ui.win,root,bundle:'unused',profile:'unused',history:ui.history,interactionWork,
    client:{askText:()=>assert.fail('本地通过时不上传 TXT'),forget(){}},visible:false});
  t.after(()=>host.close());await host.open();
  const result=await ui.handlers.get('screen-qa:ask')(ui.event(host.panel),{text:'概括这个文件',attachment:{name:'合成.txt',kind:'text',data:body}});
  assert.equal(result.text,'文档最后的编号是 Z-172。');
});

test('普通聊天保留上一轮上下文，拦截长段复述（带反馈重答一次）并完整归档长回复',async t=>{
  const ui=questionFixture(),root=resolve(import.meta.dirname,'../..');
  const oldReply='下雨时沿着有屋檐的商店街慢慢走，走到尽头就能从河边的玻璃窗看见车站对面那棵已经开始变红的枫树。';
  const copiedReply='好呀。'+oldReply.replace('，','。');
  const freshReply='要是太阳出来，我们可以改走河堤。顺着靠水的一侧往东走，转角有一块能坐下来休息的空地，风大的时候也可以到桥下面躲一躲。\n\n'
    +'记得带一件轻薄的外套，傍晚回来的路上会凉一点。要是不想走太远，我们就在桥头折返，还能顺便看看周末开的小摊有没有收摊。'
    +'等天色完全暗下来再坐车回家，路上的灯刚亮起来，正好能看见倒映在河里的那一排树影。回程也可以提前一站下车，绕到街角买杯热茶。';
  const at=Date.now(),saved=new Map([['previous',{id:'previous',at:at-1000,state:'answer',question:'下雨时到哪走走？',text:oldReply}]]);
  const drafts=[],events=[];
  const history={latest:()=>saved.get('previous'),read:()=>[...saved.values()].reverse(),save:turn=>saved.set(turn.id,turn)};
  const interactionWork=createInteractionWork({log:event=>events.push(event),model:{async work(input,{schema}){
    const data=JSON.parse(input);
    drafts.push(data);
    const question=data.原始输入.用户请求;
    const reply=question==='把上一轮的话原样复述一遍。'?freshReply
      : data.上轮反馈?question+'\n\n'+freshReply:copiedReply;
    const limit=schema.properties.reply.maxLength;
    return {reply:limit?reply.slice(0,limit):reply};
  }}});
  const host=attachScreenQuestion(ui.electron,{win:ui.win,root,bundle:'unused',profile:'unused',history,interactionWork,
    client:{askText:()=>assert.fail('本地通过时无需云端'),forget(){}},visible:false});
  t.after(()=>host.close());await host.open();
  const ask=text=>ui.handlers.get('screen-qa:ask')(ui.event(host.panel),{text});
  const actual=await ask('那太阳出来呢？');
  assert.ok([...freshReply].length>160);
  assert.equal(actual.text,freshReply);
  assert.equal(drafts[0].原始输入.最近对话.at(-1).绯月,oldReply);
  assert.match(drafts[1].上轮反馈,/复用了此前/);
  assert.deepEqual([...saved.values()].map(turn=>turn.text),[oldReply,freshReply]);
  assert.ok(events.some(event=>event.error==='CHAT_REPLY_REPEATED'));
  assert.equal((await ask('把上一轮的话原样复述一遍。')).text,freshReply);
  assert.equal(drafts.length,3);
});


test('普通对话带最近几轮（至多 4 轮、按时间顺序），转写与其他文种不带多轮历史',async t=>{
  const ui=questionFixture(),root=resolve(import.meta.dirname,'../..');
  const seen=[];
  const interactionWork=createInteractionWork({model:{async work(input,{instruction}){
    const data=JSON.parse(input).原始输入;seen.push({data,instruction});return {reply:'答：'+data.用户请求};
  }}});
  const host=attachScreenQuestion(ui.electron,{win:ui.win,root,bundle:'unused',profile:'unused',history:ui.history,interactionWork,
    client:{askText:()=>assert.fail('无需云端'),forget(){}},visible:false});
  t.after(()=>host.close());await host.open();
  const ask=text=>ui.handlers.get('screen-qa:ask')(ui.event(host.panel),{text});
  for(const text of ['话题甲','话题乙','话题丙','话题丁','话题戊','话题己'])assert.equal((await ask(text)).state,'answer');
  assert.equal(seen[0].data.最近对话,undefined);
  const last=seen.at(-1).data;
  assert.deepEqual(last.最近对话.map(round=>round.用户),['话题乙','话题丙','话题丁','话题戊']);
  assert.deepEqual(last.最近对话.map(round=>round.绯月),['答：话题乙','答：话题丙','答：话题丁','答：话题戊']);
  assert.match(seen.at(-1).instruction,/最近对话.*保持话题连贯/u);
  assert.match(seen.at(-1).instruction,/上轮反馈/);
});
