import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createConversationThreads} from '../../desktop/conversation-threads.mjs';
import {createThreadReplies} from '../../desktop/conversation-thread-replies.mjs';
import {createPersonalityDiary} from '../../desktop/personality-diary.mjs';
import {createPersonalityNags} from '../../desktop/personality-nags.mjs';

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

test('两次仍复述则保留旧气泡原话，同线重试后只收尾一轮',async t=>{
  const at=Date.parse('2026-11-23T03:00:00+09:00'),f=fixture(t,()=>at);
  const opening='几点到？',user='今天堵车，最迟九点。',response='那我晚些再出门，路上慢点。';
  let calls=0;
  const diary=createPersonalityDiary({profile:f.profile,now:()=>at,model:{async memory(text,_prompt,_schema,_signal,skill){
    assert.deepEqual(JSON.parse(text).最新发言.map(row=>row.原话),[user]);
    assert.equal(skill.aiTier,'4');
    assert.equal(skill.aiBudget,25000);
    return {reply:++calls<=2?'知道啦。'+opening:response,evaluation:'九点前到',mood:'安心',next:''};
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
  assert.equal(kept.talk.at(-1).threadMessage,'legacy-time');
  assert.equal(kept.talk.length,2);
  assert.equal(kept.localThreadReceipts,undefined);
  assert.match(f.store.get(line.id).error.text,/原话已保存/);
  assert.equal(f.store.get(line.id).rounds,0);
  await replies.run(line.id);
  assert.equal(calls,3);
  assert.deepEqual(diary.nags()[0].talk.map(turn=>turn.text),[opening,user,response]);
  assert.equal(f.store.detail(line.id).messages.at(-1).covers[0],'legacy-time');
  assert.equal(f.store.get(line.id).rounds,1);
});
