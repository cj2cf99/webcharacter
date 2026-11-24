import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';
import {createConversationThreads} from '../../desktop/conversation-threads.mjs';
import {createThreadReplies} from '../../desktop/conversation-thread-replies.mjs';
import {createPersonalityDiary} from '../../desktop/personality-diary.mjs';
import {createPersonalityNags} from '../../desktop/personality-nags.mjs';
import {createThreadReference} from '../../desktop/conversation-thread-reference.mjs';
import {createConversationTranscription} from '../../desktop/conversation-transcription.mjs';
import {generateDeepSeekDraft} from '../../desktop/transcription-deepseek.mjs';
import {createAiWorkflowModel} from '../../desktop/ai-workflow-model.mjs';
import {createScreenQuestionClient} from '../../desktop/screen-question-client.mjs';
import {createMemoryArchive} from '../../desktop/memory-archive.mjs';
import {createTaskTrafficLog} from '../../desktop/task-traffic-log.mjs';
import {planLocalOutput} from '../../desktop/local-output-budget.mjs';
import {tokyoDay} from '../../desktop/conversation-history.mjs';
import {deferredNagReply,explicitRoleCorrection,nagCorrectionAfterword} from '../../desktop/nag-reply-check.mjs';

const codec={encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()};
async function wait(check){
  for(let i=0;i<250;i++){const value=check();if(value)return value;await delay(15);}
  throw Error('等待隔离测试的完成条件超时');
}
function fixture(t,now){
  const profile=mkdtempSync(join(tmpdir(),'feiyue-line-'));
  let store=createConversationThreads(profile,codec,now);
  const cleanup=[];
  t.after(async()=>{
    for(const close of cleanup.reverse())await close();
    store.close();rmSync(profile,{recursive:true,force:true});
  });
  return {get store(){return store;},reopen(){store.close();return store=createConversationThreads(profile,codec,now);},profile,cleanup};
}

test('普通对话审核退回后只交 DeepSeek 当前发言和本线最近五轮，跳过简单及本机内容',async t=>{
  const {store,cleanup}=fixture(t),sent=[],settings=[];
  const line=store.create(),other=store.create(),sourced=store.create({source:{text:'本机来源'}});
  function exchange(id,text,meta,extra){
    store.submit(id,{text,...meta});
    store.finish(id,store.pending(id).map(message=>message.id),'已答 '+text,false,extra);
  }
  for(let i=1;i<=6;i++)exchange(line.id,'历史'+i);
  exchange(line.id,'本机直连',{mode:'direct'});
  exchange(line.id,'知识正文',{knowledgePrivate:true},{knowledgePrivate:true});
  exchange(line.id,'登记确认',{handled:true});
  exchange(other.id,'另一条对话线');
  assert.deepEqual(store.archiveTurns(tokyoDay(Date.now())).filter(turn=>turn.localOnly).map(turn=>turn.question),['本机直连']);
  const replies=createThreadReplies({store,model:{memory(input,_rules,_schema,_signal,options){
    const latest=JSON.parse(input).最新发言[0].原话;
    settings.push([latest,options.aiReview]);
    if(latest==='谢谢')return {reply:'不客气',next:'回应'};
    throw Object.assign(Error('未通过'),{code:'AI_REVIEW_REJECTED'});
  }},deepseekReply:async input=>{
    sent.push(input);
    return {state:'answer',text:'我重新理清了这件事。'};
  },cloud:()=>assert.fail('审核退回不能走普通云端')});
  cleanup.push(replies.close);
  store.submit(line.id,{text:'请帮我理清这些事'});
  await replies.run(line.id,{foreground:true});
  assert.deepEqual(sent,[{messages:['请帮我理清这些事'],history:[2,3,4,5,6].map(i=>({用户:['历史'+i],绯月:'已答 历史'+i}))}]);
  assert.equal(store.detail(line.id).messages.at(-1).text,'我重新理清了这件事。');
  store.submit(line.id,{text:'谢谢'});
  await replies.run(line.id,{foreground:true});
  store.submit(sourced.id,{text:'解释这份材料'});
  await replies.run(sourced.id,{foreground:true});
  assert.equal(store.get(sourced.id).pending,1);
  assert.equal(sent.length,1);
  assert.deepEqual(settings,[['请帮我理清这些事',true],['谢谢',false],['解释这份材料',true]]);
});

test('DeepSeek 拒绝或超时时保留原话，失败回复不会变成历史',async t=>{
  const {store,cleanup}=fixture(t),line=store.create();
  let calls=0;
  const replies=createThreadReplies({store,model:{memory(){
    throw Object.assign(Error('审核未通过'),{code:'AI_REVIEW_REJECTED'});
  }},deepseekReply:async({history})=>{
    assert.deepEqual(history,[]);
    if(++calls===1)throw Object.assign(Error('DeepSeek 超时'),{code:'DEEPSEEK_TIMEOUT'});
    return {state:'answer',text:'整理后的结果'};
  },cloud:()=>assert.fail('不能继续调旧云端')});
  cleanup.push(replies.close);
  store.submit(line.id,{text:'请概括今天的安排'});
  await replies.run(line.id);
  assert.equal(store.get(line.id).pending,1);
  assert.equal(store.detail(line.id).messages.length,1);
  await replies.run(line.id);
  assert.equal(store.get(line.id).pending,0);
  assert.equal(store.detail(line.id).messages.at(-1).text,'整理后的结果');
  assert.equal(calls,2);
});

test('关窗切线的回复归原线，三条便签一次应答，失败时取到重新提交的更正',async t=>{
  const {store,cleanup}=fixture(t);
  const a=store.create(),b=store.create();
  const held=Promise.withResolvers();
  const seen=[];
  const model={async memory(text){
    const input=JSON.parse(text);seen.push(input);
    const raw=input.最新发言.map(row=>row.原话).join('/');
    if(raw==='A首句')return held.promise;
    if(raw==='旧安排')throw Error('模型退出');
    return {reply:'回应 '+raw,next:'回应'};
  }};
  const replies=createThreadReplies({store,model});
  cleanup.push(replies.close);
  store.submit(a.id,{text:'A首句',messageId:'a1'});
  const original=replies.run(a.id,{foreground:true});
  for(const text of ['B便签一','B便签二','B便签三'])store.submit(b.id,{text});
  await replies.run(b.id,{foreground:true});
  held.resolve({reply:'保留 A 的结果',next:'回应'});await original;
  assert.deepEqual(store.detail(a.id).messages.map(item=>item.text),['A首句','保留 A 的结果']);
  assert.equal(store.detail(b.id).messages.at(-1).covers.length,3);
  assert.equal(store.get(b.id).rounds,1);
  store.submit(a.id,{text:'旧安排',messageId:'a2'});
  await replies.run(a.id);
  assert.equal(store.get(a.id).error.canCloud,true);
  store.submit(a.id,{text:'改成周日下午',messageId:'a3'});
  store.submit(a.id,{text:'改成周日下午',messageId:'a3'});
  await replies.run(a.id);
  const context=seen.at(-1);
  assert.deepEqual(context.最新发言.map(row=>row.原话),['旧安排','改成周日下午']);
  assert.deepEqual(context.之前发言.map(row=>row.原话),['A首句','保留 A 的结果']);
  assert.equal(store.detail(a.id).messages.filter(message=>message.id==='a3').length,1);
  assert.equal(replies.run(a.id),null);
});

test('主动质问拒绝复述，同轮仅改写一次，成功后两库可回读',async t=>{
  const at=Date.parse('2026-11-23T03:00:00+09:00'),f=fixture(t,()=>at);
  const opening='夫君，你刚才看着那箱积木，是不是想把它留给周末再拼？';
  const user='我怕零件会弄丢，想先把它们分开放。';
  const response='先分盒放好会放心些，我也想和你一起慢慢拼。';
  const drafts=['我懂。'+opening.slice(3).replace('，',' ').replace('？','?'),response];
  const calls=[];
  const options={profile:f.profile,now:()=>at,model:{async memory(text,prompt,schema){
    calls.push({input:JSON.parse(text),prompt});
    assert.equal(schema.properties.reply.maxLength,150);
    return {reply:drafts.shift(),evaluation:'想先收好零件',mood:'关心',next:opening.replace('，','， ')};
  }}};
  let diary=createPersonalityDiary(options);
  const engine=createPersonalityNags({store:diary,now:()=>at});
  const replies=createThreadReplies({store:f.store,activeQuestion:engine.threadAnswer});
  f.cleanup.push(()=>diary.close(),engine.close,replies.close);
  const line=f.store.create({id:'question-blocks',kind:'question',purpose:opening,first:[{who:'绯月',text:opening,at}]});
  assert.ok(diary.queueQuestion({id:line.id,source:'diary',source_id:'test',title:'周末积木',localOnly:true,revision:0,
    status:'等待回应',next:opening,questions:1,turns:1,talk:[{who:'绯月',text:opening,at:new Date(at).toISOString()}]}));
  const message=f.store.submit(line.id,{messageId:'blocks-answer',text:user});
  await replies.run(line.id,{foreground:true});
  assert.deepEqual(calls.map(({input})=>Boolean(input.改写要求)),[false,true]);
  for(const {input,prompt} of calls){
    assert.deepEqual(input.最新发言.map(row=>row.原话),[user]);
    assert.equal(input.旧问题,undefined);
    assert.equal(input.同线依据?.最新发言,undefined);
    if(input.改写要求)assert.equal(input.同线依据,undefined);
    else{
      assert.equal(input.同线依据.目的,undefined);
      assert.deepEqual(input.同线依据.之前发言.map(row=>row.原话),[opening]);
    }
    assert.match(prompt,/先回应「最新发言」/);
  }
  diary.close();diary=createPersonalityDiary(options);
  const saved=diary.nags()[0],readback=f.reopen().detail(line.id);
  assert.deepEqual(saved.talk.map(row=>row.text),[opening,user,response]);
  assert.equal(saved.status,'已解释');
  assert.equal(saved.next,'');
  assert.equal(saved.remaining,undefined);
  assert.deepEqual(readback.messages.map(row=>row.text),[opening,user,response+'\n这件事我先记到这里啦。']);
  assert.deepEqual(readback.messages.at(-1).covers,[message.id]);
  assert.equal(readback.preview.text,saved.localThreadReceipts[message.id].reply);
  assert.equal(readback.rounds,1);
  assert.equal(readback.pending,0);
  assert.notEqual(readback.closed,null);
});

test('旧气泡的原答只保存一次，改写超时后明确留待事后核对',async t=>{
  const at=Date.parse('2026-11-23T03:00:00+09:00'),f=fixture(t,()=>at);
  const opening='几点到？',user='今天堵车，最迟九点。';
  let calls=0;
  const diary=createPersonalityDiary({profile:f.profile,now:()=>at,model:{async memory(text){
    assert.deepEqual(JSON.parse(text).最新发言.map(row=>row.原话),[user]);
    if(++calls===2)throw Object.assign(Error('模型超时'),{code:'LOCAL_AI_TIMEOUT'});
    return {reply:'知道啦。'+opening,evaluation:'九点前到',mood:'安心',next:''};
  }}});
  const engine=createPersonalityNags({store:diary,now:()=>at});
  const replies=createThreadReplies({store:f.store,activeQuestion:engine.threadAnswer});
  f.cleanup.push(diary.close,engine.close,replies.close);
  const line=f.store.create({id:'legacy-arrival',kind:'question',first:[{who:'绯月',text:opening,at},
    {id:'legacy-time',who:'你',text:user,at,legacyPending:true}]});
  const time=new Date(at).toISOString();
  assert.ok(diary.queueQuestion({id:line.id,source:'diary',source_id:'legacy',title:'到达时间',localOnly:true,revision:0,
    status:'意外中断',next:opening,questions:1,turns:1,talk:[{who:'绯月',text:opening,at:time},{who:'你',text:user,at:time}]}));
  await replies.run(line.id);
  const kept=diary.nags()[0];
  assert.equal(kept.talk[1].threadMessage,'legacy-time');
  await replies.run(line.id);
  assert.deepEqual(diary.nags()[0],kept);
  assert.equal(calls,2);
  assert.deepEqual(kept.talk.map(turn=>turn.text),[opening,user,deferredNagReply]);
  assert.equal(kept.status,'回合结束');
  assert.equal(kept.remaining,undefined);
  assert.equal(f.store.detail(line.id).messages.at(-1).covers[0],'legacy-time');
  assert.equal(f.store.get(line.id).rounds,1);
});

test('人物归属冲突由原话直接纠正，无需另一次模型复审',async t=>{
  const at=Date.parse('2026-11-23T03:00:00+09:00'),f=fixture(t,()=>at);
  const opening='你想怎么安排？',answer='我给你讲故事，你可以选一本书。';
  const fixed='好呀，我听你讲故事。';
  const stages=[];
  const diary=createPersonalityDiary({profile:f.profile,now:()=>at,model:{async memory(text,_prompt,_schema,_signal,skill){
    const input=JSON.parse(text);
    stages.push(skill.stage);
    assert.equal(input.最新发言[0].原话,answer);
    return {reply:'我挑一本再给你讲故事。',evaluation:'有个讲故事的约定',mood:'期待',next:'“ ”？'};
  }}});
  const engine=createPersonalityNags({store:diary,now:()=>at});
  const replies=createThreadReplies({store:f.store,activeQuestion:engine.threadAnswer});
  f.cleanup.push(diary.close,engine.close,replies.close);
  const line=f.store.create({id:'role-check',kind:'question',first:[{who:'绯月',text:opening,at}]});
  assert.ok(diary.queueQuestion({id:line.id,source:'diary',source_id:'case',title:'讲故事',localOnly:true,revision:0,
    status:'等待回应',next:opening,questions:1,turns:1,talk:[{who:'绯月',text:opening,at:new Date(at).toISOString()}]}));
  f.store.submit(line.id,{messageId:'story',text:answer});
  await replies.run(line.id,{foreground:true});
  assert.deepEqual(stages,['reply']);
  assert.deepEqual(diary.nags()[0].talk.map(turn=>turn.text),[opening,answer,fixed]);
  assert.equal(f.store.detail(line.id).messages.at(-1).text,fixed+'\n这件事我先记到这里啦。');
});

test('归属明确、引文、否定和双方参与的正常回复不纠正',()=>{
  const answer='我给你讲故事。';
  for(const reply of ['你来讲故事，我听着。','你刚才说「我给你讲故事」，我记住了。','你说‘我给你讲故事’，我很期待。','不是我来讲故事。','我给你讲故事，你也给我讲故事。','下次换成我来讲故事好吗？','好呀。']){
    assert.equal(explicitRoleCorrection(answer,reply),'',reply);
  }
  assert.equal(explicitRoleCorrection('还会记录你做过的事。','也会把你做的每一件事记下来。'),'这样也能记下我做过的事。');
  assert.equal(explicitRoleCorrection('如果我来讲故事，你会听吗？','好呀，我来讲故事。'),'');
  assert.equal(explicitRoleCorrection('我想把你做过的事记下来。','我也可以把你做过的事记下来。'),'');
  const talk=[{who:'绯月',text:'几点到？'},...[1,2].flatMap(()=>[
    {who:'你',text:'九点。'},{who:'绯月',text:'我记下九点到，到了发我个消息。'}])];
  assert.equal(nagCorrectionAfterword({talk},String),'');
});

test('同一原答下重复使用正常确认语只生成一次',async t=>{
  const at=Date.parse('2026-11-23T03:00:00+09:00'),f=fixture(t,()=>at);
  const opening='几点到？',user='最迟九点。',response='我记下最迟九点到，到了发我个消息。';
  const follow='九点是今晚吗？',time=new Date(at).toISOString();
  const talk=[{who:'绯月',text:opening,at:time},{who:'你',text:user,at:time},
    {who:'绯月',text:response,at:time},{who:'绯月',text:follow,at:time}];
  let calls=0;
  const diary=createPersonalityDiary({profile:f.profile,now:()=>at,model:{async memory(){
    calls++;return {reply:response,evaluation:'确认时间',mood:'安心',next:''};
  }}});
  const engine=createPersonalityNags({store:diary,now:()=>at});
  const replies=createThreadReplies({store:f.store,activeQuestion:engine.threadAnswer});
  f.cleanup.push(diary.close,engine.close,replies.close);
  const line=f.store.create({id:'same-meaning',kind:'question',first:talk.map(turn=>({...turn,at}))});
  assert.ok(diary.queueQuestion({id:line.id,source:'diary',source_id:'same',title:'到达时间',localOnly:true,revision:0,
    status:'等待回应',next:follow,questions:2,turns:2,talk}));
  f.store.submit(line.id,{messageId:'repeat-time',text:user});
  await replies.run(line.id,{foreground:true});
  assert.equal(calls,1);
  assert.equal(diary.nags()[0].talk.at(-1).text,response);
});

test('JST 跨日卡片显示整线最新、主动首问归绯月、50 和 100 轮边界',async t=>{
  let now=Date.parse('2026-11-21T23:55:00+09:00');
  const f=fixture(t,()=>now);
  const a=f.store.create({kind:'question',first:[{who:'绯月',text:'下次一起听雨？',at:now}]});
  assert.deepEqual(f.store.pending(a.id),[]);
  assert.deepEqual(f.store.organizationLinks(),[]);
  now+=600000;
  f.store.submit(a.id,{text:'好啊'});
  assert.equal(f.store.list('history','2026-11-21').rows[0].preview.text,'好啊');
  assert.equal(f.store.list('history','2026-11-22').rows[0].preview.text,'好啊');
  f.reopen();
  assert.equal(f.store.pending(a.id)[0].text,'好啊');
  const seed=count=>Array.from({length:count*2},(_,i)=>({at:now,who:i%2?'绯月':'你',text:'旧线专有 '+i}));
  const fifty=f.store.create({first:seed(49)}),hundred=f.store.create({first:seed(100)}),old=f.store.create({first:seed(101)});
  const oldClosed=f.store.create({first:seed(101),legacyClosed:true});
  assert.throws(()=>f.store.submit(old.id,{text:'旧视图提交'}),/只能回看/);
  assert.throws(()=>f.store.submit(oldClosed.id,{text:'旧视图提交'}),/只能回看/);
  const modelCalls=[];
  const replies=createThreadReplies({store:f.store,model:{async memory(input){
    modelCalls.push(JSON.parse(input));return {reply:'正常回复',next:'回应'};
  }}});
  f.cleanup.push(replies.close);
  for(const text of ['第50轮一','第50轮二'])f.store.submit(fifty.id,{text});
  await replies.run(fifty.id);
  assert.equal(f.store.get(fifty.id).rounds,50);
  assert.equal(f.store.get(fifty.id).closed,null);
  f.store.submit(fifty.id,{text:'超50轮'});
  f.store.submit(hundred.id,{text:'恰好100轮'});
  await replies.run(fifty.id);
  await replies.run(hundred.id);
  assert.equal(modelCalls.length,1);
  assert.match(f.store.detail(hundred.id).messages.at(-1).text,/换个话题/);
  assert.equal(f.store.get(fifty.id).endedBy,'绯月');
  assert.equal(replies.run(old.id),null);
  assert.equal(replies.run(oldClosed.id),null);
  assert.equal(f.store.detail(old.id).messages.length,202);
});

test('迟到收尾不能覆盖更新发言；明确结束后结果不会重开',async t=>{
  const {store,cleanup}=fixture(t);
  const a=store.create(),held=Promise.withResolvers();
  let calls=0;
  const replies=createThreadReplies({store,model:{memory:()=>++calls===1?held.promise:{reply:'接住新增话题',next:'回应'}}});
  cleanup.push(replies.close);
  store.submit(a.id,{text:'我等下回来'});
  const first=replies.run(a.id);
  await wait(()=>calls===1);
  store.submit(a.id,{text:'先补充一句'});
  held.resolve({reply:'旧结果，先收尾啦',next:'结束'});await first;
  await replies.run(a.id);
  assert.equal(store.get(a.id).closed,null);
  assert.equal(store.detail(a.id).messages.at(-1).covers.length,2);
  store.submit(a.id,{text:'这个话题到此为止。'});
  assert.equal(store.get(a.id).endedBy,'你');
  assert.equal(replies.run(a.id),null);
});

test('旧话先问线索，跨午夜按原话日期，改期使用改期时间',async t=>{
  let now=Date.parse('2026-11-21T23:55:00+09:00');
  const {store}=fixture(t,()=>now);
  const a=store.create(),b=store.create();
  store.submit(a.id,{text:'明天还书'});
  store.finish(a.id,store.pending(a.id).map(row=>row.id),'记住了');
  now+=600000;
  store.submit(b.id,{text:'今天买灯泡'});
  const read=[],previews=[];
  const reference=createThreadReference({store,archive:{read:async date=>{read.push(date);return [];}},
    transcription:{referencedReminder:item=>previews.push(item)}});
  async function ask(text){
    store.submit(a.id,{text,reference:true});
    const pending=store.pending(a.id),answer=await reference(a.id,pending,new AbortController().signal);
    if(answer)store.finish(a.id,pending.map(row=>row.id),answer.reply,false,answer.extra);
    return answer;
  }
  assert.match((await ask('把上一条设为提醒')).reply,/哪一次/);
  assert.equal(read.length+previews.length,0);
  assert.match((await ask('昨晚说还书的那次')).reply,/2026-11-22/);
  assert.match((await ask('改成明天')).reply,/2026-11-23/);
  assert.equal(previews[0].id,previews[1].id);
  assert.equal(read.length,0);
});

test('云端补充按确认原文单条发送，历史和后到消息均不会外发',async t=>{
  const {store,cleanup}=fixture(t);
  const a=store.create({source:{excerpt:'隔离手记内容'}});
  const calls=[];
  const client=await createScreenQuestionClient({request:async(path,options)=>{
    calls.push([path,JSON.parse(options.body)]);
    return Response.json({reply:'云端回复',proposal:null});
  }});
  const replies=createThreadReplies({store,cloud:client.askStandalone,model:{memory:()=>{throw Error('本机失败');}}});
  cleanup.push(replies.close);
  store.submit(a.id,{text:'解释手记'});
  await replies.run(a.id);
  const first=replies.preview(a.id,'第一个独立问题');
  store.submit(a.id,{text:'更正内容'});
  assert.throws(()=>replies.confirm(a.id,first.id),/新进展/);
  assert.equal(calls.length,0);
  await replies.run(a.id);
  const second=replies.preview(a.id,'最终独立问题');
  await replies.confirm(a.id,second.id);
  assert.deepEqual(calls,[['/api/assistant/message',{messages:[{role:'user',content:'最终独立问题'}]}]]);
  assert.equal(store.detail(a.id).messages.at(-1).covers.length,2);
});

test('有界转录拆除截断分片，单批重排后后续作业仍产出',async t=>{
  const {profile,store,cleanup}=fixture(t);
  let now=Date.now();
  const seen=[],notices=[];
  const model={async memory(raw,_instruction,_schema,_signal,options){
    const input=JSON.parse(raw);
    seen.push({stage:options.stage,input});
    const text=input.turns.map(turn=>turn.text).join('');
    if(text.includes('必失败'))throw Object.assign(Error('LOCAL_AI_OUTPUT_BUDGET'),{code:'LOCAL_AI_OUTPUT_BUDGET'});
    if(text.length>400)throw Object.assign(Error('LOCAL_AI_CONTEXT_BUDGET'),{code:'LOCAL_AI_CONTEXT_BUDGET'});
    if(options.stage==='classify')return {candidates:[],notes:[]};
    return {actions:[],requests:[],signals:[],recentFactIds:[]};
  }};
  const transcription=createConversationTranscription({profile,safeStorage:codec,model,notify:value=>notices.push(value),now:()=>now});
  cleanup.push(transcription.close);
  transcription.onThreadFinished(batch=>store.organizationComplete(batch));
  const a=store.create(),b=store.create(),c=store.create();
  store.submit(a.id,{text:'隔离长段。'.repeat(105),registration:true});
  store.submit(a.id,{text:'保留第二段原话。',registration:true});
  store.submit(b.id,{text:'必失败'});
  store.submit(c.id,{text:'昨天我跑了五公里。'});
  const batches=[a,b,c].map(line=>store.organization(line.id));
  for(const batch of batches)transcription.fromThread(batch);
  await wait(()=>batches.every(batch=>['ready','failed','empty'].includes(transcription.detail(batch.id).state)));
  const [long,failed,later]=batches.map(batch=>transcription.detail(batch.id));
  assert.equal(long.state,'ready');
  assert.equal(long.result.rows[0].params.content.includes('隔离长段。'.repeat(105)),true);
  assert.ok(long.result.rows[0].params.content.includes('隔离长段。\n\n保留第二段原话。'));
  assert.equal(later.state,'ready');
  assert.equal(failed.state,'failed');
  assert.equal(notices.length,2);
  assert.ok(long.steps.some(step=>step.state==='split'));
  assert.ok(long.steps.some(step=>step.state==='done'));
  assert.ok(seen.find(item=>item.stage==='classify'));
  for(let i=0;i<2;i++){
    now+=61000;transcription.fromThread(batches[1]);
    await wait(()=>transcription.detail(batches[1].id).state==='failed');
  }
  assert.equal(transcription.detail(batches[1].id).needsReview,true);
  now+=61000;transcription.fromThread(batches[1]);
  assert.equal(transcription.detail(batches[1].id).state,'failed');
  assert.deepEqual(store.organizationLinks(),[b.id]);
});

test('确认登记必须交回有原话证据的请求和草稿，撤回及闲聊可为空',async t=>{
  const {profile,store,cleanup}=fixture(t);
  const dinner='帮我记下晚餐吃了两个饭团。';
  const namedDinner='帮我记下吃喝：晚餐吃了两个饭团。';
  const calls=new Map();
  const blank={summary:'用户委托登记晚餐',actions:[],requests:[],signals:[],recentFactIds:[]};
  const transcription=createConversationTranscription({profile,safeStorage:codec,model:{
    async memory(raw,instruction,_schema,_signal,{stage}){
      const input=JSON.parse(raw);
      const turn=input.turns[0],text=turn.text;
      calls.set(stage+text,input);
      if(stage==='organize'){
        if(!instruction.includes('必须写出用户要登记的具体事项')||text.includes('空归纳'))return blank;
        assert.match(instruction,/必须写出用户要登记的具体事项/);
        return {...blank,requests:[{id:'meal',summary:'登记晚餐',subject:'user',state:'occurred',intent:'explicit',
          timeText:'晚餐',conditions:[],evidence:[{sourceId:turn.sourceId,quote:text.includes('错证据')?'虚构原句':text}]}]};
      }
      if(stage==='review')return {issues:[]};
      if(text.includes('空拟稿'))return {candidates:[],notes:[]};
      return {candidates:[{id:'meal-row',type:'hu-shi.food.create',matterIds:[input.organized.requests[0].id],params:{body:text},
        fieldSources:[],conditions:[],dependsOn:[],missing:[]}],notes:[]};
    }
  }});
  cleanup.push(transcription.close);
  const samples=[
    [[dinner],'ready'],[[dinner+'空归纳'],'ready'],[[dinner+'错证据'],'ready'],[[dinner+'空拟稿'],'failed'],
    [[namedDinner],'ready'],[['你好呀！'],'empty'],[[dinner,'别登记这顿晚餐。'],'empty']
  ];
  for(const [texts,state] of samples){
    calls.clear();
    const line=store.create();
    for(const text of texts)store.submit(line.id,{text,backgroundRegistration:text.startsWith('帮我'),handled:text.startsWith('帮我')});
    const batch=store.organization(line.id);
    transcription.fromThread(batch);
    const result=await wait(()=>{const current=transcription.detail(batch.id);return ['ready','empty','failed'].includes(current.state)?current:null;});
    assert.equal(result.state,state,result.error);
    if(state==='ready'){
      assert.equal(result.result.rows[0].type,'hu-shi.food.create');
      assert.equal(result.result.rows[0].evidence[0].quote,texts[0]);
      assert.equal(calls.get('organize'+texts[0]).turns[0].registrationRequested,true);
      if(texts[0]===namedDinner){
        assert.match(result.result.rows[0].params.body,/晚餐吃了两个饭团/);
        assert.equal(calls.has('classify'+texts[0]),false);
      }else assert.equal(calls.get('classify'+texts[0]).organized.requests[0].intent,'explicit');
    }
    if(state==='failed')assert.match(result.error,/已确认的登记/);
    if(state==='empty')assert.equal(calls.has('classify'+texts[0]),false);
  }
});

test('转录只在首轮本地拟稿无结果时经 DeepSeek 共用接口补拟一次',async t=>{
  const {profile,store,cleanup}=fixture(t);
  const seen=[];
  const candidate=id=>({candidates:[{id:'draft',type:'diaries.create',matterIds:[id],params:{content:'今天买文具花了 780 日元。'},
    fieldSources:[],conditions:[],dependsOn:[],missing:[]}],notes:[]});
  const empty={summary:'本轮对话',actions:[],requests:[],signals:[],recentFactIds:[]};
  const local=createAiWorkflowModel({file:join(profile,'ai.sqlite'),model:{async memory(raw,_instruction,_schema,_signal,skill){
    const input=JSON.parse(raw),turn=input.turns[0];
    assert.equal(Object.hasOwn(input,'history'),false,'转写不带历史对话');
    seen.push('local:'+skill.stage);
    if(skill.stage==='organize'){
      if(turn.text.includes('归纳超时'))throw Object.assign(Error('归纳超时'),{code:'LOCAL_AI_NOT_READY'});
      if(turn.text.includes('云端判断无任务'))return {summary:'本轮对话',actions:[],requests:[{id:'req-1',summary:'非登记指令',subject:'user',state:'planned',intent:'inferred',timeText:'',conditions:[],evidence:[{sourceId:turn.sourceId,quote:turn.text}]}],signals:[],recentFactIds:[]};
      return empty;
    }
    if(turn.text.includes('本地成功'))return candidate(input.organized.requests[0].id);
    if(turn.text.includes('本地超时'))throw Object.assign(Error('本地超时'),{code:'LOCAL_AI_TIMEOUT'});
    if(turn.text.includes('本地忙碌'))throw Object.assign(Error('本地忙碌'),{code:'LOCAL_AI_BUSY'});
    return {candidates:[],notes:[]};
  },async close(){}}});
  cleanup.push(local.close);
  const transcription=createConversationTranscription({profile,safeStorage:codec,model:local,
    generateRemoteDraft:(input,instruction,schema,signal)=>generateDeepSeekDraft(input,instruction,schema,signal,{
      key:'fixture-key',fetcher:async(url,options)=>{
        seen.push('remote:classify');
        assert.equal(url,'https://sub.bandaoapi.com/v1/chat/completions');
        assert.equal(options.headers.authorization,'Bearer fixture-key');
        const payload=JSON.parse(options.body);
        assert.equal(payload.reasoning_effort,'medium');
        assert.equal(payload.thinking,undefined);
        assert.deepEqual(payload.response_format,{type:'json_object'});
        const content=JSON.parse(payload.messages[1].content);
        assert.equal(content.history,undefined);
        assert.equal(content.turns.length,1);
        assert.equal(JSON.stringify(content).includes('无关旧历史'),false);
        if(content.turns[0].text.includes('云端失败'))return new Response(null,{status:429});
        if(content.turns[0].text.includes('云端判断无任务'))return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({candidates:[],notes:['会话控制，无须登记']})}}]});
        const result=candidate(content.organized.requests[0].id);
        return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
      }
    })});
  cleanup.push(transcription.close);
  const cases=[
    ['本地成功','ready',['local:organize','local:classify']],
    ['本地空结果','ready',['local:organize','local:classify','remote:classify']],
    ['本地超时','ready',['local:organize','local:classify','remote:classify']],
    ['云端失败','failed',['local:organize','local:classify','remote:classify']],
    ['旧本地直连','failed',['local:organize','local:classify']],
    ['本地忙碌','failed',['local:organize','local:classify']],
    ['归纳超时','failed',['local:organize']],
    ['闲聊','empty',['local:organize']],
    ['云端判断无任务','empty',['local:organize','local:classify','remote:classify']]
  ];
  for(const [label,state,expected] of cases){
    seen.length=0;
    const line=store.create(),at=Date.now(),confirmed=!['闲聊','云端判断无任务'].includes(label);
    store.submit(line.id,{text:confirmed?'给我记一笔，今天买文具花了 780 日元。'+label:label==='云端判断无任务'?'结束对话吧（云端判断无任务）':'你好。',backgroundRegistration:confirmed,handled:confirmed,
      mode:label==='旧本地直连'?'direct':'auto'});
    const batch=store.organization(line.id);
    batch.history=[{who:'你',text:'无关旧历史',at}];
    transcription.fromThread(batch);
    const result=await wait(()=>{const detail=transcription.detail(batch.id);return ['ready','failed','empty'].includes(detail.state)?detail:null;});
    assert.equal(result.state,state,result.error);
    assert.deepEqual(seen,expected);
    if(label==='云端失败')assert.equal(result.needsReview,true);
    if(state==='ready')assert.equal(result.result.rows[0].type,'diaries.create');
  }
});

test('已经排队的当前对话提权，压过普通后台请求，同时队列负载为受保护值',async t=>{
  const {profile,cleanup}=fixture(t);
  const gate=Promise.withResolvers(),seen=[],receipts=[];
  const file=join(profile,'ai.sqlite');
  let priority=3;
  const model=createAiWorkflowModel({file,safeStorage:codec,log:event=>receipts.push(event),model:{
    async memory(text){seen.push(text);if(text==='A')await gate.promise;return {reply:text};},close(){},
  }});
  cleanup.push(()=>model.close());
  const signal=new AbortController().signal;
  const first=model.memory('A','',{},signal);
  await wait(()=>seen.length);
  const background=model.memory('C','',{},signal,{aiPriority:4});
  const selected=model.memory('B','',{},signal,{aiPriority:3,aiCurrentPriority:()=>priority});
  await wait(()=>model.aiSnapshot().queued>=3);
  const db=new DatabaseSync(file,{readOnly:true});
  assert.equal(db.prepare('SELECT typeof(input) AS kind FROM ai_requests LIMIT 1').get().kind,'blob');db.close();
  priority=6;gate.resolve();
  await Promise.all([first,background,selected]);
  assert.deepEqual(seen,['A','B','C']);
  const details=model.readAiStep(receipts.find(event=>event.ai_step_id).ai_step_id);
  assert.equal(details.input.text,'A');
  assert.deepEqual(details.output,{value:{reply:'A'}});
});

test('只有未整理文字超过 24 小时才提醒，固定原批次，已完成和重复巡检均跳过',t=>{
  let now=100000;
  const {store}=fixture(t,()=>now);
  const a=store.create(),b=store.create();
  store.submit(a.id,{text:'待整理'});
  store.submit(b.id,{text:'已处理'});
  const original=store.organization(a.id);
  store.organizationComplete(store.organization(b.id));
  now+=86400000;
  assert.deepEqual(store.overdue(now-86400000),[]);
  now++;
  assert.deepEqual(store.overdue(now-86400000).map(row=>row.thread),[a.id]);
  assert.deepEqual(store.overdue(now-86400000),[]);
  assert.equal(store.organization(a.id).id,original.id);
});

test('旧归档静默跳过损坏 JSON，日志巡检只回看时间窗口内的状态',async t=>{
  const {profile}=fixture(t);
  const at=Date.parse('2026-11-22T01:00:00+09:00'),day='2026-11-22';
  const archive=createMemoryArchive(profile);
  for(const id of ['old-1','old-2'])await archive.save({id,at,question:'历史材料',text:'预览'},{index:false});
  writeFileSync(join(archive.folder(day),'对话','incomplete.json'),'{');
  assert.equal((await archive.read(day)).length,2);
  assert.equal((await archive.read(day)).length,2);
  let now=at-1000;
  const log=createTaskTrafficLog(profile,{clock:()=>now});
  await log.write({stage:'失败',error:'LOCAL_AI_CONTEXT_BUDGET'});
  now=at+1000;
  await log.write({stage:'完成',category:'绯月自主行动'});
  await log.write({stage:'失败',error:'LOCAL_AI_OUTPUT_BUDGET'});
  await log.write({route:'本地 AI',stage:'思索后继续处理',error:'LOCAL_AI_BATCH_BUDGET'});
  await log.write({route:'分析专家巡检',stage:'失败',error:'LOCAL_AI_TIMEOUT'});
  const summary=await log.inspectRecent(at,at+5000,new AbortController().signal);
  assert.deepEqual(summary,{scanned:3,completed:1,failed:1,top:[['LOCAL_AI_OUTPUT_BUDGET',1]]});
});

test('巡检合并同一手记的两条失败回执，保留独立失败及补评终态',async t=>{
  const {profile}=fixture(t),at=Date.parse('2026-11-22T23:46:08+09:00');
  const log=createTaskTrafficLog(profile,{clock:()=>at});
  const error='LOCAL_AI_INFERENCE_FAILED';
  await log.write({route:'本地 AI',skill:'diary-writing',error});
  await log.write({route:'写日记',category:'绯月自主行动',stage:'查询失败',result:error});
  await log.write({route:'补行动评价',category:'绯月自主行动',stage:'查询失败',result:error});
  await log.write({route:'本地 AI',skill:'conversation-transcription',error:'LOCAL_AI_ADAPTIVE_OUTPUT_BUDGET'});
  await log.write({route:'AI 询问池',skill:'emotion-appraisal',error:'TimeoutError'});
  await log.write({route:'AI 询问池',stage:'取消',error:'AbortError'});
  await log.write({route:'绯月情绪',stage:'这条材料待下次补评',error:'TimeoutError'});
  assert.deepEqual(await log.inspectRecent(at-1000,at+1000,new AbortController().signal),
    {scanned:7,completed:0,failed:3,top:[[error,2],['TimeoutError',1]]});
});

test('巡检归并跨秒的新推理回执和旧版双记，同时保留独立失败',async t=>{
  const {profile}=fixture(t),at=Date.parse('2026-11-23T01:37:10+09:00');
  let now=at;
  const log=createTaskTrafficLog(profile,{clock:()=>now});
  const error='LOCAL_AI_OUTPUT_BUDGET';
  const skill='diary-writing';
  await log.write({route:'本地 AI',skill,error,ai_attempt_id:'sample-1'});
  now+=1000;
  await log.write({route:'AI 询问池',skill,error,ai_attempt_id:'sample-1'});
  await log.write({route:'本地 AI',skill,error,ai_attempt_id:'sample-2'});
  await log.write({route:'AI 询问池',skill,error,ai_attempt_id:'sample-3'});
  now+=1000;
  await log.write({route:'本地 AI',skill,error});
  await log.write({route:'AI 询问池',skill,error});
  await log.write({route:'AI 询问池',skill,error});
  await log.write({route:'AI 询问池',skill,error:'LOCAL_AI_TIER_WAIT'});
  await log.write({route:'本地 AI',skill,error:'LOCAL_AI_CONTEXT_BUDGET'});
  await log.write({route:'AI 询问池',skill,error:'LOCAL_AI_CONTEXT_BUDGET'});
  assert.deepEqual(await log.inspectRecent(at,now+1000,new AbortController().signal),
    {scanned:10,completed:0,failed:8,top:[[error,5],['LOCAL_AI_CONTEXT_BUDGET',2],['LOCAL_AI_TIER_WAIT',1]]});
  assert.deepEqual(await log.inspectRecent(at+1000,now+1000,new AbortController().signal),
    {scanned:9,completed:0,failed:7,top:[[error,4],['LOCAL_AI_CONTEXT_BUDGET',2],['LOCAL_AI_TIER_WAIT',1]]});
});

test('动态额度按实际待整理的新材料与事项数量计算，预估超限时拆分',()=>{
  const tokenize=text=>text.match(/\S+/gu)??[];
  const estimate=(stage,value,limit=1024,retry=false)=>planLocalOutput({text:JSON.stringify(value),stage,tokenize,limit,retry});
  const turn={text:'明天 提醒我 给田中回信'};
  const short=estimate('organize',{turns:[turn]});
  assert.equal(short.materialTokens,3);
  assert.ok(short.tokens<1024);
  assert.deepEqual(estimate('organize',{turns:[turn,{handled:true,text:'不生成新候选 '.repeat(1000)}],
    history:'只供参考 '.repeat(1000)}),short);
  const heavy={turns:Array.from({length:3},()=>({text:'分片内容 '.repeat(340)}))};
  assert.equal(estimate('organize',heavy).split,true);
  assert.equal(estimate('organize',heavy,2048).split,false);
  const items={organized:{requests:Array.from({length:7},()=>({summary:'新事项',conditions:['明天'],evidence:[{quote:'原话'}]}))},
    templates:'模板不能直接成为输出 '.repeat(1000)};
  assert.equal(estimate('classify',items).split,true);
  assert.equal(estimate('classify',items,2048).split,false);
  assert.deepEqual(estimate('organize',{turns:[turn]},1024,true),{tokens:1024,mode:'full-retry',materialTokens:3});
  assert.deepEqual(estimate('其它步骤',{}),{tokens:1024,mode:'fixed'});
});

test('动态额度截断后立即让行并用完整额度重试原步骤，保持同一作业',async t=>{
  const {profile,store,cleanup}=fixture(t);
  const calls=[],notices=[];
  const transcription=createConversationTranscription({profile,safeStorage:codec,notify:item=>notices.push(item),model:{
    async memory(text,_instruction,_schema,_signal,settings){
      const material=JSON.parse(text).turns[0].text;
      calls.push([material,settings.fullOutputBudget]);
      if(material==='先估一次'&&!settings.fullOutputBudget)
        throw Object.assign(Error('动态额度估低'),{code:'LOCAL_AI_ADAPTIVE_OUTPUT_BUDGET'});
      return {actions:[],requests:[],signals:[],recentFactIds:[]};
    },
  }});
  cleanup.push(transcription.close);
  const first=store.create(),second=store.create();
  store.submit(first.id,{text:'先估一次',registration:true});
  store.submit(second.id,{text:'继续其它任务'});
  const original=store.organization(first.id),later=store.organization(second.id);
  transcription.fromThread(original);transcription.fromThread(later);
  const result=await wait(()=>{const item=transcription.detail(original.id);return item.state==='ready'&&item;});
  assert.deepEqual(calls,[['先估一次',false],['继续其它任务',false],['先估一次',true]]);
  assert.equal(result.steps.length,1);
  assert.equal(result.steps[0].attempts[0].error,'LOCAL_AI_ADAPTIVE_OUTPUT_BUDGET');
  assert.equal(result.steps[0].attempts[1].state,'done');
  assert.deepEqual(notices.map(item=>item.id),[original.id]);
});
