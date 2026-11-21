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
      createModel:()=>({start:async()=>{},snapshot:()=>({state:'ready',backend:'cpu',gpuLayers:0}),
        analyze:async input=>{state.analysis.push(JSON.parse(input));return {reply:state.reply??passage,done:false};},close(){state.modelsClosed++;}}),
      createVoice:()=>({render(text){state.renders.push(text);return state.render?.()??{wav};},close(){}}),
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
  assert.equal(state.opened,0);
  assert.equal(state.renders.length,0);
  const restarted=create();
  state.clock+=7200000-1;
  await restarted.tick();
  assert.equal(state.phases.length,1);
  state.clock+=1;
  await Promise.all([restarted.tick(),restarted.tick()]);
  assert.equal(state.phases.length,2);
  assert.equal(restarted.waiting.id,id);
  assert.equal(current().reminderAt,state.clock);
  await restarted.close();
  await chat.close();
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
