import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setImmediate as flush} from 'node:timers/promises';
import {test} from 'node:test';
import {createPrivateChat} from '../desktop/private-chat.mjs';
import voices from '../assets/voice/private-chat/manifest.json' with {type:'json'};

const wav=Uint8Array.from(readFileSync(new URL('../assets/voice/private-chat/accepted.wav',import.meta.url)));
const passage='今天我想把窗外看到的几件小事慢慢讲给你听。早晨走到窗边的时候，路上刚下完雨。'
  +'楼下有人牵着一只毛绒绒的小狗散步。它走几步就停下来看看我，像在等人和它打招呼。'
  +'我也想知道你今天有没有遇到什么有意思的事，等你有空了就和我说说。'.repeat(3);
function setup(random){
  const profile=mkdtempSync(join(tmpdir(),'feiyue-private-test-'));
  const state={utilization:39,freeMiB:4200,idle:true,clock:1000,phases:[],renders:[],analysis:[],resume:0,opened:0,modelsClosed:0};
  function create(){
    return createPrivateChat({profile,readGpu:async()=>({utilization:state.utilization,freeMiB:state.freeMiB}),
      idle:()=>state.idle,prepare:async()=>{state.opened++;},resume:()=>state.resume++,now:()=>state.clock,random,
      createModel:()=>({start:async()=>{state.modelStarted=true;},snapshot:()=>({state:'ready',backend:'cpu',gpuLayers:0}),
        analyze:async input=>{
          const turn=JSON.parse(input);
          state.analysis.push(turn);
          return {reply:state.analyze?.(turn)??state.reply??(turn.round===1?passage:String.fromCodePoint(0x4e00+turn.round).repeat(58)+'。'),done:false};
        },close(){state.modelsClosed++;}}),
      createVoice:()=>({preheat(){state.asrStarted=true;return state.asr?.()??{ready:true};},
        preheatSpeaking(){state.ttsStarted=true;return state.tts?.()??{ready:true};},
        render(text){state.renders.push(text);return state.render?.()??{wav};},close(){}}),
      view:{show(next){state.phases.push(next);return !state.viewFails;},update(next){state.phases.push(next);},close(){state.phases.push({phase:'closed'});},focus(){}},
    });
  }
  const queue=(chat,id)=>chat.plan({id,topics:['今天的晚饭','喜欢的小动物','周末去哪儿']});
  const current=()=>state.phases.at(-1);
  async function play(chat){
    const {id,turn,segments}=current();
    for(let i=0;i<segments;i++)assert.deepEqual(await chat.segment(id,turn,i),wav);
    await chat.played(id,turn);
  }
  return {create,queue,state,current,play};
}

test('each startup clip in the pool can be selected with its matching caption',async()=>{
  assert.equal(voices.startup.length,7);
  for(const [index,key] of voices.startup.entries()){
    const {create,queue,state}=setup(()=>(index+0.5)/voices.startup.length);
    const chat=create();
    try{
      queue(chat,'one');
      assert.deepEqual(await chat.accept(chat.waiting.id),{});
      const opening=state.phases.find(phase=>phase.phase==='preparing');
      assert.equal(opening.startupFile,voices.lines[key].file);
      assert.equal(opening.text,voices.lines[key].text);
    }finally{await chat.close();}
  }
});

test('same pending chat, updated topics, persisted reminder and strict GPU gate',async()=>{
  const {create,queue,state,current}=setup();
  const chat=create();
  queue(chat,'one');
  const {id}=chat.waiting;
  queue(chat,'two');
  assert.equal(chat.waiting.id,id);
  assert.equal(chat.planned('one'),true);
  state.utilization=40;
  await chat.tick();
  assert.equal(state.phases.length,0);
  assert.ok((await chat.accept(id)).error);
  state.utilization=39;
  await chat.tick();
  assert.equal(current().phase,'invite');
  assert.equal(state.opened,1);
  assert.equal(state.renders.length,1);
  await chat.stop();
  const originalCount=state.phases.length;
  const restarted=create();
  state.clock+=7200000-1;
  await restarted.tick();
  assert.equal(state.phases.length,originalCount);
  state.clock+=1;
  await Promise.all([restarted.tick(),restarted.tick()]);
  assert.equal(state.phases.length,originalCount+1);
  assert.equal(restarted.waiting.id,id);
  assert.equal(current().reminderAt,state.clock);
  await restarted.close();
  await chat.close();
});

test('automatic invitation waits for warm text, TTS, ASR and a complete opening clip',async()=>{
  const {create,queue,state,current}=setup();
  const chat=create();
  try{
    queue(chat,'warm');
    const asr=Promise.withResolvers(),tts=Promise.withResolvers(),opening=Promise.withResolvers();
    state.asr=()=>asr.promise;
    state.tts=()=>tts.promise;
    state.render=()=>opening.promise;
    const warming=chat.tick();
    await flush();
    assert.ok(state.asrStarted&&state.ttsStarted&&state.modelStarted);
    assert.equal(state.analysis.length,1);
    assert.equal(state.renders.length,0);
    assert.equal(current(),undefined);
    tts.resolve({ready:true});
    await flush();
    assert.equal(state.renders.length,1);
    opening.resolve({wav});
    await flush();
    assert.equal(current(),undefined);
    asr.resolve({ready:true});
    await warming;
    assert.equal(current().phase,'invite');
    assert.ok(chat.dictationVoice(chat.waiting.id));
    assert.equal(state.renders.length,1);
    await chat.accept(chat.waiting.id);
    assert.equal(current().phase,'speaking');
    assert.equal(state.renders.length,1);
    assert.equal(state.analysis.length,1);
  }finally{await chat.close();}
});

test('an unanswered warm invitation releases its processes and keeps the two-hour reminder',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {create,queue,state,current}=setup();
  const chat=create();
  try{
    queue(chat,'expires');
    const {id}=chat.waiting;
    await chat.tick();
    assert.equal(current().phase,'invite');
    t.mock.timers.tick(60_000);
    await flush();
    assert.equal(current().phase,'closed');
    assert.equal(chat.active,null);
    assert.equal(chat.waiting.id,id);
    assert.equal(state.modelsClosed,1);
    assert.equal(state.resume,1);
    state.clock+=60_000;
    await chat.tick();
    assert.equal(current().phase,'closed');
  }finally{await chat.close();}
});

test('rewrites a recycled question, advances the topic and rotates repeated plans after restart',async()=>{
  const {create,queue,state,current,play}=setup();
  const chat=create();
  const recycled='老公今天过得怎么样呀？花园刚补登完角色组件，正等着语音转文字功能，这样就能多陪你聊天了。你愿意现在就试试语音输入吗？';
  state.analyze=turn=>turn.rewrite&&turn.round===2
    ?'你刚才提到窗外的小狗，听起来很可爱。说到小动物，我也很好奇，你喜欢安静地陪在旁边的小猫，还是一出门就想跑起来的小狗呀？'
    :turn.round===2?'我听见你说起了窗外的小狗，感觉它很活泼。我也想多听听，但还是想问问，你愿意现在就试试语音输入吗？':recycled;
  try{
    queue(chat,'first');
    await chat.accept(chat.waiting.id);
    await flush();
    await play(chat);
    const {id}=current();
    chat.reply(id,'窗外有只小狗');
    await flush();
    assert.equal(state.analysis.at(-1).topic,'喜欢的小动物');
    assert.ok(state.analysis.at(-1).rewrite);
    assert.doesNotMatch(current().text,/语音输入/);
    await play(chat);
    chat.reply(id,'我喜欢小狗');
    await flush();
    assert.equal(state.analysis.at(-1).topic,'周末去哪儿');
    assert.ok(state.analysis.at(-1).rewrite);
    assert.doesNotMatch(current().text,/语音输入/);
    await play(chat);
    assert.equal(chat.active,null);
    const restarted=create();
    try{
      queue(restarted,'second');
      await restarted.accept(restarted.waiting.id);
      await flush();
      assert.equal(state.analysis.at(-1).topic,'周末去哪儿');
    }finally{await restarted.close();}
  }finally{await chat.close();}
});

test('waits for a complete first WAV, prefetches one segment and releases after ten full turns',async()=>{
  const {create,queue,state,current,play}=setup();
  const chat=create();
  queue(chat,'one');
  const {id}=chat.waiting;
  state.idle=false;
  assert.ok((await chat.accept(id)).error);
  state.idle=true;
  const first=Promise.withResolvers();
  state.render=()=>state.renders.length===1?first.promise:{wav};
  const requests=await Promise.all([chat.accept(id),chat.accept(id)]);
  assert.equal(requests.filter(result=>!result.error).length,1);
  await flush();
  assert.equal(current().phase,'preparing');
  assert.equal(state.renders.length,1);
  first.resolve({wav});
  await flush();
  assert.equal(current().phase,'speaking');
  assert.equal(state.renders.length,1);
  const opening=current();
  assert.equal(await chat.segment(opening.id,opening.turn,1),null);
  await play(chat);
  assert.equal(current().phase,'reply');
  assert.ok(chat.active);
  assert.equal(chat.waiting,null);
  for(let round=2;round<=10;round++){
    assert.equal(chat.reply(opening.id,'聊聊窗外的小狗'),true);
    assert.equal(chat.reply(opening.id,'重复提交'),false);
    await flush();
    assert.equal(current().number,round);
    assert.ok(chat.active);
    await play(chat);
  }
  assert.equal(state.opened,1);
  assert.equal(state.modelsClosed,1);
  assert.equal(state.resume,1);
  assert.equal(state.analysis.at(-1).requiredFinish,true);
  assert.deepEqual(state.analysis.map(turn=>turn.topic).slice(0,4),['今天的晚饭','喜欢的小动物','周末去哪儿',null]);
  assert.equal(chat.active,null);
  assert.equal(current().phase,'closed');
});

test('spoken body is limited to 50–200 Unicode characters before segmentation',async()=>{
  for(const length of [49,50,200,201]){
    const {create,queue,state,current}=setup();
    const chat=create();
    queue(chat,'one');
    state.reply='小花。'.repeat(70).slice(0,length-1)+'🌙';
    assert.deepEqual(await chat.accept(chat.waiting.id),{});
    await flush();
    if(length<50){
      assert.equal(current().phase,'error');
      assert.equal(state.renders.length,0);
    }else{
      assert.equal(current().phase,'speaking');
      assert.equal(Array.from(current().text).length,Math.min(200,length));
    }
    await chat.close();
  }
});

test('stop, close, renderer failure and unavailable VRAM release the slot and preserve unfinished topics',async()=>{
  for(const reason of ['stop','close','panel','vram','wav']){
    const {create,queue,state,current}=setup();
    const chat=create();
    queue(chat,'one');
    const first=Promise.withResolvers(),id=chat.waiting.id;
    state.render=()=>reason==='wav'?{wav:new Uint8Array(50)}:first.promise;
    if(reason==='panel')state.viewFails=true;
    if(reason==='vram')state.freeMiB=3600;
    assert.deepEqual(await chat.accept(id),{});
    await flush();
    if(reason==='stop')await chat.stop();
    if(reason==='close')await chat.close();
    first.resolve({wav});
    await flush();
    assert.equal(chat.active,null,reason);
    assert.equal(chat.waiting.id,id,reason);
    assert.equal(state.resume,1,reason);
    assert.notEqual(current().phase,'speaking');
  }
});
