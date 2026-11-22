import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createConversationThreads} from '../../desktop/conversation-threads.mjs';
import {createThreadReplies} from '../../desktop/conversation-thread-replies.mjs';
import {createPersonalityDiary} from '../../desktop/personality-diary.mjs';
import {createPersonalityNags} from '../../desktop/personality-nags.mjs';
import {deferredNagReply,explicitRoleCorrection,nagCorrectionAfterword} from '../../desktop/nag-reply-check.mjs';

const codec={encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()};
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
