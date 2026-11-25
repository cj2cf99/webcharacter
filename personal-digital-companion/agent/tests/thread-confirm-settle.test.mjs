import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {createConversationThreads} from '../../desktop/conversation-threads.mjs';
import {createConversationTranscription} from '../../desktop/conversation-transcription.mjs';
import {createPersonalityNags} from '../../desktop/personality-nags.mjs';
import {attachScreenQuestion} from '../../desktop/screen-question-host.mjs';
import {fixture} from './screen-question-fixture.mjs';

const codec={encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()};
const closing='这条我先收起来啦。';

function folder(t,cleanup){
  const profile=mkdtempSync(join(tmpdir(),'feiyue-settle-'));
  t.after(async()=>{for(const close of cleanup)await close();rmSync(profile,{recursive:true,force:true});});
  return profile;
}

test('确认结果留言：只结束没有未回复、未整理发言的待确认线',t=>{
  const cleanup=[];
  const profile=folder(t,cleanup);
  const store=createConversationThreads(profile,codec);
  cleanup.push(()=>store.close());
  const settle=id=>store.notice(id,'已登记 1 项。',{},{result:true,closing});

  const question=store.create({kind:'question',first:[{who:'绯月',text:'晚饭吃了什么？'}]});
  assert.equal(settle(question.id).closed,true);
  const ended=store.get(question.id);
  assert.notEqual(ended.closed,null);
  assert.equal(ended.endedBy,'绯月');
  assert.equal(store.detail(question.id).messages.at(-1).text,'已登记 1 项。'+closing);
  assert.equal(ended.preview.transcriptId,undefined,'结果留言不再让预览显示待核对');

  // 已结束的线仍记下确认结果，“整理完成”提示照旧不追加。
  assert.equal(settle(question.id).text,'已登记 1 项。');
  assert.equal(store.notice(question.id,'已整理出 1 项待确认'),null);

  const ordinary=store.create();
  assert.equal(settle(ordinary.id).closed,false);
  assert.equal(store.get(ordinary.id).closed,null);

  const waiting=store.create({kind:'question'});
  store.submit(waiting.id,{text:'还有一句',organize:false});
  store.fail(waiting.id,{text:'本机暂未答复'});
  assert.equal(settle(waiting.id).closed,false);
  assert.equal(store.get(waiting.id).error.text,'本机暂未答复','留言不清掉可重试状态');

  const unorganized=store.create({kind:'question'});
  const message=store.submit(unorganized.id,{text:'再记一条'});
  store.finish(unorganized.id,[message.id],'好');
  assert.equal(settle(unorganized.id).closed,false,'还有待整理发言，可能再出一张卡');
});

const row=(id,title,extra={})=>({id,type:'diaries.create',label:'日记',params:{title,content:title},conditions:[],
  dependsOn:[],missing:[],sources:[],evidence:[{sourceId:id,quote:title}],...extra});

function jobs(t,{result='completed',skipped=[],prepare,error}={}){
  const cleanup=[],notes=[];
  const profile=folder(t,cleanup);
  const store=createConversationTranscription({profile,safeStorage:codec,model:{},
    prepareBatch:prepare??(async rows=>({plan:{ids:rows.map(item=>item.id)}})),
    registration:{async submitBatch(_id,plan,_submission,issued){
      issued('submission');
      if(error)throw Error(error);
      return {status:result,chain:{nodes:plan.ids.map(key=>({key,skipped:skipped.includes(key),
        current_task:{status:result==='completed'?'COMPLETED':'PENDING'}}))}};
    }}});
  cleanup.unshift(()=>store.close());
  store.onThreadSettled(note=>notes.push(note));
  const add=(id,rows,thread='line')=>{
    const db=new DatabaseSync(join(profile,'conversation-transcription.sqlite'));
    db.prepare('INSERT INTO transcriptions VALUES(?,?,?,?,?)').run(id,'ready',Date.now(),
      codec.encryptString(JSON.stringify({line:{thread},result:{rows,notes:[],summaries:[]}})),JSON.stringify({thread}));
    db.close();
  };
  const next=async count=>{
    for(let i=0;i<200&&notes.length<count;i++)await delay(15);
    assert.equal(notes.length,count);
    return notes.at(-1);
  };
  return {store,add,next,notes};
}

test('全部生成与全部不生成都了结这次确认',async t=>{
  const {store,add,next}=jobs(t);
  add('a',[row('r1','晚饭'),row('r2','跑步')]);
  store.decide({id:'a',selected:['r1','r2']});
  assert.deepEqual(await next(1),{thread:'line',id:'a',final:true,text:'已登记 2 项。'});
  add('b',[row('r1','午饭')]);
  store.decide({id:'b',selected:[]});
  assert.deepEqual(await next(2),{thread:'line',id:'b',final:true,text:'好，这次不登记了。'});
  store.decide({id:'b',selected:[]});
  await next(2);
});

test('部分生成列出没生成的项目；缺信息时不结束并写明缺什么',async t=>{
  const {store,add,next}=jobs(t);
  add('a',[row('r1','晚饭'),row('r2','一个标题特别特别长需要被截断的跑步记录条目')]);
  store.decide({id:'a',selected:['r1']});
  const chosen=await next(1);
  assert.equal(chosen.final,true);
  assert.equal(chosen.text,'已登记 1 项。这些没生成：《一个标题特别特别长需要被截断的…》。');
  add('b',[row('r1','晚饭'),row('r2','[看牙]绯月助记-2026-11-25 11:00:00',{missing:['deadline','内容待核对']})]);
  store.decide({id:'b',selected:['r1']});
  const incomplete=await next(2);
  assert.equal(incomplete.final,false);
  assert.equal(incomplete.text,'已登记 1 项。缺信息没生成：《看牙》（缺 截止日期、内容待核对）。要登记的话，把这一条完整再说一遍。');
});

test('同一条线还有别的待确认卡时只留言',async t=>{
  const {store,add,next}=jobs(t);
  add('a',[row('r1','晚饭')]);add('b',[row('r1','跑步')]);add('other',[row('r1','别的线')],'other-line');
  store.decide({id:'a',selected:['r1']});
  assert.equal((await next(1)).final,false);
  store.decide({id:'b',selected:['r1']});
  assert.equal((await next(2)).final,true);
});

test('跳过、停止、未完成、报错与登记前缺项各有留言',async t=>{
  const skip=jobs(t,{skipped:['r2']});
  skip.add('a',[row('r1','晚饭'),row('r2','跑步')]);
  skip.store.decide({id:'a',selected:['r1','r2']});
  assert.equal((await skip.next(1)).text,'已登记 1 项。登记时跳过了：《跑步》。');

  for(const [options,final,card,pattern] of [
    [{result:'stopped'},false,undefined,/^登记已停止，完成了 0 项。$/],
    [{result:'waiting'},false,true,/^登记还没全部完成。打开待确认卡点“重试”可以接着办。$/],
    [{error:'云端登记操作失败。'},false,true,/^登记还没全部完成。云端登记操作失败。打开/],
    [{prepare:async()=>({missing:[{id:'r1',message:'提醒日期已过，请另行确认新日期'}]})},false,true,
      /^还不能登记：《晚饭》提醒日期已过，请另行确认新日期。改好后再点生成。$/],
  ]){
    const run=jobs(t,options);
    run.add('a',[row('r1','晚饭')]);
    run.store.decide({id:'a',selected:['r1']});
    const note=await run.next(1);
    assert.equal(note.final,final);assert.equal(note.card,card);assert.match(note.text,pattern);
  }
});

test('引用原话生成的提醒卡确认后回到原对话线',async t=>{
  const {store,next}=jobs(t);
  await store.referencedReminder({id:'reference-1',at:Date.now(),text:'明天看牙',title:'看牙',deadline:'2099-01-01',thread:'line'});
  store.decide({id:'reference-1',selected:[]});
  assert.equal((await next(1)).thread,'line');
});

test('确认收尾的质问不留续问，也不记成用户结束',()=>{
  const saved=[];
  const nag={id:'n',source:'diary',status:'等待回应',next:'充值是哪一笔？',remaining:'旧续问',talk:[{who:'绯月',text:'充值是哪一笔？'}]};
  const nags=createPersonalityNags({store:{nags:()=>[nag],saveNag:value=>saved.push(structuredClone(value)),
    auditState:()=>({})},show:async()=>false,idle:()=>false});
  saved.length=0;
  nags.threadResolved('n');
  assert.equal(saved.at(-1).status,'回合结束');
  assert.equal(saved.at(-1).remaining,undefined);
  assert.equal(saved.at(-1).talk.length,1);
  const count=saved.length;
  nags.threadResolved('n');nags.threadResolved('missing');
  assert.equal(saved.length,count);
});

test('主程序接线：确认结果写进对话线，结束待确认线并结掉原质问',async t=>{
  const cleanup=[];
  const profile=folder(t,cleanup);
  const seed=createConversationThreads(profile,codec);
  const line=seed.create({kind:'question',first:[{who:'绯月',text:'晚饭吃了什么？'}]});
  seed.close();
  const {electron,win,history}=fixture(),resolved=[];
  let settled;
  const host=attachScreenQuestion({...electron,safeStorage:{...codec,isEncryptionAvailable:()=>true}},{win,profile,history,
    root:join(import.meta.dirname,'../..'),bundle:profile,visible:false,
    transcription:{onThreadSettled:callback=>{settled=callback;}},
    threadOptions:{questions:()=>[],resolveQuestion:id=>resolved.push(id)}});
  cleanup.push(async()=>{host.close();await delay(30);});
  settled({thread:line.id,id:'job',final:false,card:true,text:'登记还没全部完成。'});
  assert.deepEqual(resolved,[]);
  assert.equal(host.threadArchive('2000-01-01').length,0);
  settled({thread:line.id,id:'job',final:true,text:'已登记 1 项。'});
  assert.deepEqual(resolved,[line.id]);
  const view=createConversationThreads(profile,codec);
  const saved=view.detail(line.id);
  view.close();
  assert.notEqual(saved.closed,null);
  assert.deepEqual(saved.messages.slice(-2).map(message=>[message.text,message.transcriptId]),
    [['登记还没全部完成。','job'],['已登记 1 项。'+closing,undefined]]);
});
