import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';
import {createConversationThreads} from '../../desktop/conversation-threads.mjs';
import {createThreadReplies} from '../../desktop/conversation-thread-replies.mjs';
import {createThreadReference} from '../../desktop/conversation-thread-reference.mjs';
import {createConversationTranscription} from '../../desktop/conversation-transcription.mjs';
import {createAiWorkflowModel} from '../../desktop/ai-workflow-model.mjs';
import {createScreenQuestionClient} from '../../desktop/screen-question-client.mjs';
import {createMemoryArchive} from '../../desktop/memory-archive.mjs';
import {createTaskTrafficLog} from '../../desktop/task-traffic-log.mjs';

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
  store.submit(b.id,{text:'必失败'});
  store.submit(c.id,{text:'昨天我跑了五公里。'});
  const batches=[a,b,c].map(line=>store.organization(line.id));
  for(const batch of batches)transcription.fromThread(batch);
  await wait(()=>batches.every(batch=>['ready','failed','empty'].includes(transcription.detail(batch.id).state)));
  const [long,failed,later]=batches.map(batch=>transcription.detail(batch.id));
  assert.equal(long.state,'ready');
  assert.equal(long.result.rows[0].params.content.includes('隔离长段。'.repeat(105)),true);
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
  await log.write({route:'分析专家巡检',stage:'失败',error:'LOCAL_AI_TIMEOUT'});
  const summary=await log.inspectRecent(at,at+5000,new AbortController().signal);
  assert.deepEqual(summary,{scanned:2,completed:1,failed:1,top:[['LOCAL_AI_OUTPUT_BUDGET',1]]});
});
