import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
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
