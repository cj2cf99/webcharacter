import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {withOnDevice} from '../../desktop/ai-gateway.mjs';
import {createAiWorkflowModel} from '../../desktop/ai-workflow-model.mjs';
import {createConversationThreads} from '../../desktop/conversation-threads.mjs';
import {createThreadReplies} from '../../desktop/conversation-thread-replies.mjs';
import {createEmotionStore} from '../../desktop/emotion-core.mjs';

// 直连只走本机：AGY 和半岛都不应收到直连原话。
const codec={encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()};
function backend(name,seen,busy=false){
  let suspended=false;
  return {analyze:async(text,options)=>{seen.push([name,'analyze',options.hint,text]);return {kind:'chat',reply:name};},
    preheatConversation:async route=>{seen.push([name,'preheat',route]);return {ready:true,backend:name};},
    memory:async text=>{seen.push([name,'memory',text]);return {reply:name+'回复',next:'回应'};},
    isBusy:()=>false,suspend:async()=>busy?false:(suspended=true),resume(){suspended=false;},close:async()=>{},
    get suspended(){return suspended;}};
}

test('直连对话、预热和带 onDevice 的任务交给本机模型，其余照走云端后端',async()=>{
  const seen=[],model=withOnDevice(backend('cloud',seen),backend('device',seen));
  assert.equal((await model.analyze('悄悄话',{hint:'direct'})).reply,'device');
  assert.equal((await model.analyze('平常话',{hint:'auto'})).reply,'cloud');
  assert.equal((await model.preheatConversation('direct')).backend,'device');
  assert.equal((await model.preheatConversation('main')).backend,'cloud');
  await model.memory('悄悄话','指令',{},undefined,{onDevice:true});
  await model.memory('私密','指令',{},undefined,{});
  assert.deepEqual(seen.filter(row=>row[0]==='cloud').map(row=>row[1]),['analyze','preheat','memory']);
  assert.doesNotMatch(JSON.stringify(seen.filter(row=>row[0]==='cloud')),/悄悄话/);
});

test('没有本机模型时直连报错，不回落到云端',async()=>{
  const seen=[],model=withOnDevice(backend('cloud',seen),null);
  assert.deepEqual(await model.analyze('悄悄话',{hint:'direct'}),{error:'LOCAL_AI_NOT_READY'});
  assert.match((await model.preheatConversation('direct')).error,/本机模型/);
  await assert.rejects(model.memory('悄悄话','指令',{},undefined,{onDevice:true}),{code:'LOCAL_AI_NOT_READY'});
  assert.deepEqual(seen,[]);
});

test('让出显卡时两边一起停，本机正忙则云端恢复',async()=>{
  const cloud=backend('cloud',[]),device=backend('device',[],true);
  assert.equal(await withOnDevice(cloud,device).suspend(),false);
  assert.equal(cloud.suspended,false);
});

test('直连对话线交本机回复；原话不进入之后普通发言的模型请求',async t=>{
  // 不触网：直连阶段配着占位密钥但应走本机；普通发言阶段清掉密钥，落到云端后端的替身上。
  const key=process.env.bandao_api_key,seen=[];
  process.env.bandao_api_key='fixture-key';
  const root=mkdtempSync(join(tmpdir(),'direct-'));
  const store=createConversationThreads(root,codec);
  const model=createAiWorkflowModel({file:':memory:',model:withOnDevice(backend('cloud',seen),backend('device',seen))});
  const replies=createThreadReplies({store,model});
  t.after(async()=>{
    await replies.close();await model.close();store.close();rmSync(root,{recursive:true,force:true});
    if(key===undefined)delete process.env.bandao_api_key;else process.env.bandao_api_key=key;
  });
  const line=store.create({kind:'ordinary'});
  const answered=async()=>{
    await replies.run(line.id,{foreground:true});
    assert.deepEqual(store.pending(line.id),[]);
  };
  store.submit(line.id,{text:'只在本机说的悄悄话',mode:'direct',organize:false});
  await answered();
  assert.deepEqual([...new Set(seen.map(row=>row[0]))],['device']);
  delete process.env.bandao_api_key;
  seen.length=0;
  store.submit(line.id,{text:'谢谢',mode:'auto'});
  await answered();
  assert.deepEqual([...new Set(seen.map(row=>row[0]))],['cloud']);
  assert.match(JSON.stringify(seen),/谢谢/);
  assert.doesNotMatch(JSON.stringify(seen),/悄悄话|device回复/);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(Date.now());
  assert.equal(store.archiveTurns(today).filter(turn=>turn.direct).length,1);
});

test('本机模型在直连里选结束不会关掉对话线，用户仍可结束',async t=>{
  const root=mkdtempSync(join(tmpdir(),'direct-end-'));
  const store=createConversationThreads(root,codec);
  const replies=createThreadReplies({store,model:{memory:async()=>({reply:'那早点睡。',next:'结束'})}});
  t.after(async()=>{await replies.close();store.close();rmSync(root,{recursive:true,force:true});});
  const line=store.create({kind:'ordinary'});
  store.submit(line.id,{text:'好困啊',mode:'direct',organize:false});
  await replies.run(line.id,{foreground:true});
  assert.equal(store.get(line.id).pending,0);
  assert.equal(store.get(line.id).closed,null);
  store.submit(line.id,{text:'结束这条对话',mode:'direct',organize:false});
  assert.notEqual(store.get(line.id).closed,null);
});

test('直连情绪事件不作为之后主动行动的素材',t=>{
  const root=mkdtempSync(join(tmpdir(),'direct-emotion-'));
  const store=createEmotionStore(root);
  t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
  const at=Date.now()+1000;
  store.accept({key:'chat/a',at,kind:'chat',user:'只在本机说的悄悄话',reply:'嗯',onDevice:true});
  store.accept({key:'chat/b',at:at+1,kind:'chat',user:'今天晚饭想吃面',reply:'好'});
  assert.deepEqual(store.recentFacts().map(fact=>fact.ref),['chat/b']);
  assert.equal(store.fact('chat/a'),null);
  assert.equal(store.fact('chat/b').title,'今天晚饭想吃面');
});
