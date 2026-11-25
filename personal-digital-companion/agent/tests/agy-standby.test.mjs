import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runAgyPrompt,startAgyStandby,stopAgyStandby,agyStandbyReady} from '../../desktop/agy-cli-client.mjs';
import {createAgyCliModel} from '../../desktop/agy-local-model.mjs';

const fake=join(import.meta.dirname,'fixtures/fake-agy.mjs');
function withFake(t){
  const dir=mkdtempSync(join(tmpdir(),'fake-agy-'));
  

  const previous=process.env.FEIYUE_AGY_PATH;
  process.env.FEIYUE_AGY_PATH=fake;
  t.after(()=>{stopAgyStandby();if(previous===undefined)delete process.env.FEIYUE_AGY_PATH;else process.env.FEIYUE_AGY_PATH=previous;rmSync(dir,{recursive:true,force:true});});
}
const schema={type:'object',properties:{answer:{enum:['是','否']}},required:['answer'],additionalProperties:false};
async function until(check,message){for(let i=0;i<100&&!await check();i++)await new Promise(r=>setTimeout(r,50));assert.ok(await check(),message);}

test('未开启待命时每次冷启动，结构化输出走 --json-schema',async t=>{
  withFake(t);
  const result=await runAgyPrompt({prompt:'问',schema,timeoutMs:20000});
  assert.equal(result.success,true);assert.equal(result.warm,undefined);
  assert.deepEqual(result.structuredOutput,{answer:'是'});
});

test('开启待命后用预热进程应答，用完即弃并立刻预热下一个',async t=>{
  withFake(t);
  startAgyStandby();
  await until(()=>agyStandbyReady(),'备用进程未就绪');
  const first=await runAgyPrompt({prompt:'问',schema,timeoutMs:20000});
  assert.equal(first.warm,true);assert.deepEqual(first.structuredOutput,{answer:'是'});
  await until(()=>agyStandbyReady(),'用完后未预热下一个');
  const second=await runAgyPrompt({prompt:'你好',timeoutMs:20000});
  assert.equal(second.warm,true);assert.match(second.response,/第1轮/);
  assert.notEqual(first.conversationId,second.conversationId,'每轮必须是新进程，不能共享上下文');
});

test('待命结果不符合 Schema 时回到冷启动的 --json-schema',async t=>{
  withFake(t);
  startAgyStandby();
  await until(()=>agyStandbyReady(),'备用进程未就绪');
  const strict={type:'object',properties:{answer:{enum:['否']}},required:['answer'],additionalProperties:false};
  const result=await runAgyPrompt({prompt:'问',schema:strict,timeoutMs:20000});
  assert.equal(result.success,true);assert.equal(result.warm,undefined);
});

test('AGY 本机模型启动即预热，memory 失败时抛错而不是返回错误对象，关闭时停止待命',async t=>{
  withFake(t);
  const model=createAgyCliModel({});
  await model.start();
  assert.equal(model.snapshot().state,'ready');
  await until(()=>model.standbyReady(),'启动后应预热备用进程');
  assert.deepEqual(await model.memory('材料','判断',schema,undefined,{name:'t'}),{answer:'是'});
  process.env.FEIYUE_AGY_PATH=join(tmpdir(),'不存在的agy.exe');
  stopAgyStandby();
  await assert.rejects(model.memory('材料','判断',schema,undefined,{name:'t'}),error=>typeof error.code==='string'&&error.code.length>0);
  await model.close();
  assert.equal(model.standbyReady(),false);
});

test('对话会话保留同一个进程跨多轮，任务调用仍各用新进程',async t=>{
  withFake(t);
  const model=createAgyCliModel({});
  await model.start();
  await until(()=>model.standbyReady(),'备用进程未就绪');
  const pidOf=r=>/pid(\d+)/.exec(r.reply)[1];
  const a=await model.analyze('你好',{hint:'auto'});
  const b=await model.analyze('在吗',{hint:'auto',previous:{用户:'你好',绯月:'嗨'}});
  const c=await model.analyze('晚安',{hint:'direct'});
  assert.match(a.reply,/第1轮/);assert.match(b.reply,/第2轮/);
  assert.equal(pidOf(a),pidOf(b));
  assert.match(c.reply,/第3轮/);assert.equal(pidOf(c),pidOf(a),'direct 与 auto 共用同一会话');
  assert.equal(model.conversation.turns,3);
  // 任务调用不进会话
  assert.deepEqual(await model.memory('材料','判断',schema,undefined,{name:'t'}),{answer:'是'});
  assert.equal(model.conversation.turns,3);
  await model.close();
  assert.equal(model.conversation.active,false);
});

test('会话进程中途退出后下一轮自动换新进程；轮数达上限也会换',async t=>{
  withFake(t);
  const {createAgyConversation}=await import('../../desktop/agy-cli-client.mjs');
  const talk=createAgyConversation({maxTurns:2});
  t.after(()=>talk.close());
  const pid=r=>/pid(\d+)/.exec(r.result.response)[1];
  const one=await talk.ask('你好',{timeoutMs:20000}),two=await talk.ask('再来',{timeoutMs:20000});
  assert.equal(one.fresh,true);assert.equal(two.fresh,false);assert.equal(pid(one),pid(two));
  const three=await talk.ask('第三句',{timeoutMs:20000});
  assert.equal(three.fresh,true);assert.notEqual(pid(three),pid(one),'达到轮数上限后应换新会话');
  process.kill(Number(pid(three)));
  await new Promise(r=>setTimeout(r,300));
  const four=await talk.ask('被杀之后',{timeoutMs:20000});
  assert.equal(four.fresh,true);assert.notEqual(pid(four),pid(three));
});

test('一次预热结束后一旦开始使用才立刻预热下一条，且新对话会话可直接复用预热进程',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'agy-preheat-order-'));
  const logFile=join(dir,'events.log');
  const script=join(dir,'slow-init-agy.mjs');
  writeFileSync(script,`
import {appendFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
appendFileSync(${JSON.stringify(logFile)}, 'spawn:'+process.pid+'\\n');
setTimeout(()=>{
  appendFileSync(${JSON.stringify(logFile)}, 'init:'+process.pid+'\\n');
  console.log(JSON.stringify({event:'init',conversation_id:'c-'+process.pid}));
  createInterface({input:process.stdin}).on('line',line=>{
    const msg=JSON.parse(line);
    appendFileSync(${JSON.stringify(logFile)}, 'turn:'+process.pid+'\\n');
    console.log(JSON.stringify({event:'result',result:{conversation_id:'c-'+process.pid,status:'SUCCESS',response:'ok pid'+process.pid+' '+msg.message.content,duration_seconds:0.01}}));
  });
}, 180);
`,'utf8');
  const previous=process.env.FEIYUE_AGY_PATH;
  process.env.FEIYUE_AGY_PATH=script;
  t.after(()=>{stopAgyStandby();if(previous===undefined)delete process.env.FEIYUE_AGY_PATH;else process.env.FEIYUE_AGY_PATH=previous;rmSync(dir,{recursive:true,force:true});});

  const events=()=>readFileSync(logFile,'utf8').trim().split('\n').filter(Boolean);
  startAgyStandby();
  // 在第 1 次预热尚未结束前立即发起调用：不应提前并发启动第 2 个预热进程
  await new Promise(r=>setTimeout(r,40));
  const pending=runAgyPrompt({prompt:'第一问',timeoutMs:10000});
  await new Promise(r=>setTimeout(r,40));
  const spawnsBeforeInit=events().filter(e=>e.startsWith('spawn:')).length;
  assert.equal(spawnsBeforeInit,1,'第 1 次预热尚未结束前不应提前启动下一条预热');

  const res=await pending;
  assert.equal(res.warm,true);
  await until(()=>events().filter(e=>e.startsWith('spawn:')).length>=2,'开始使用后应立刻启动第 2 条预热');
  const allAfterFirst=events();
  const firstInitIdx=allAfterFirst.findIndex(e=>e.startsWith('init:'));
  const secondSpawnIdx=allAfterFirst.findIndex((e,i)=>i>0&&e.startsWith('spawn:'));
  assert.ok(firstInitIdx>=0&&secondSpawnIdx>firstInitIdx,'应在第 1 条预热结束后开始使用时再启动第 2 条预热');

  // 等第 2 条预热就绪后，新对话会话应直接领用第 2 条，并立刻预热第 3 条
  await until(()=>agyStandbyReady(),'第 2 条预热未就绪');
  const {createAgyConversation}=await import('../../desktop/agy-cli-client.mjs');
  const talk=createAgyConversation();
  t.after(()=>talk.close());
  const secondPid=events().filter(e=>e.startsWith('init:'))[1].split(':')[1];
  const convRes=await talk.ask('对话首句',{timeoutMs:10000});
  assert.match(convRes.result.response,new RegExp('pid'+secondPid),'新对话会话应直接复用已预热进程');
  await until(()=>agyStandbyReady(),'对话开始使用后应立刻预热第 3 条');
  assert.ok(events().filter(e=>e.startsWith('spawn:')).length>=3);
});
