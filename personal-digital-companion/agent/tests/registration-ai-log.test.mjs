import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createWorker} from '../worker.mjs';
import {createRegistrationAiGateway} from '../host/registration-ai.mjs';
import {handleCompanion} from '../host/subscriptions.mjs';
import {createTaskTrafficLog} from '../../desktop/task-traffic-log.mjs';
import {openTestDatabase, initializeDatabase} from './sqlite-d1.mjs';

async function fixture(t, pool, authorize) {
  const db = openTestDatabase();
  t.after(db.close);
  initializeDatabase(db.sqlite);
  db.sqlite.exec(await readFile(new URL('../seeds/tasklist-hu-shi.sql', import.meta.url), 'utf8'));
  const env = {DB: db.DB, REGISTRATION_AI: pool, API_TOKEN: 'fixture'};
  return (path, options) => createWorker({authorize}).fetch(new Request('https://worker.test' + path, {
    ...options, headers: {...options.headers, Authorization: 'Bearer fixture'},
  }), env);
}

const isProbe=input=>input.messages.length===1&&input.messages[0].role==='user'&&input.messages[0].content==='请直接恢复你好，我在';
const greeting=(provider,text='你好，我在')=>({value:{provider,model:provider+'-test',text,finishReason:'stop'}});

const food = {type: 'hu-shi.food.create', params: {body: '隔离结果'}};
const generated = (provider, output = {actions: [food], pending: []}) =>
  ({value: {provider, model: provider + '-test', text: JSON.stringify(output), finishReason: 'stop'}});

test('限流、探测答非所问及供应商取消后切换，默认可到付费 DeepSeek，失败发送给客户端并本地记录', async t => {
  const providerCalls = [];
  const pool = {
    providers: () => ['cloudflare', 'gemini', 'groq', 'deepseek'],
    attempt(provider,input) {
      providerCalls.push(provider);
      if(isProbe(input)&&provider==='deepseek')return greeting(provider);
      if (provider === 'cloudflare') return {error: 'RATE_LIMITED', upstream_status: 429};
      if (provider === 'gemini') return generated(provider, {actions: [{...food, after: 2}, {...food, after: 1}], pending: []});
      if (provider === 'groq') return {error: 'CANCELLED'};
      return generated(provider);
    },
  };
  const cloudLog = t.mock.method(console, 'info', () => {});
  const profile = await mkdtemp(join(tmpdir(), 'feiyue-task-log-'));
  t.after(() => rm(profile, {recursive: true, force: true}));
  const traffic = createTaskTrafficLog(profile);
  const call = traffic.wrap(await fixture(t, pool));
  const {ai, chain} = await (await call('/api/assistant/recording-plan', {method: 'POST',
    headers: {Authorization: 'do-not-log'}, body: JSON.stringify({text: '私密用例文本'})})).json();
  assert.equal(chain.nodes.length, 1);
  assert.deepEqual(providerCalls, ['cloudflare', 'gemini', 'groq', 'deepseek','deepseek']);
  assert.deepEqual(ai.attempts.filter(row=>row.stage==='probe').map(row=>row.code).sort(), ['CANCELLED','OK','PROBE_MISMATCH']);
  assert.deepEqual(ai.attempts.filter(row=>row.stage==='request').map(row=>row.code),['RATE_LIMITED','OK']);
  assert.equal(ai.attempts[0].upstream_status, 429);
  assert.deepEqual(cloudLog.mock.calls.map(call => call.arguments[0].trace_id), Array(5).fill(ai.trace_id));
  await traffic.flush();
  const written = await readFile(traffic.file, 'utf8');
  assert.doesNotMatch(written, /私密用例文本|隔离结果|do-not-log/);
  const events = written.trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(event => event.direction), ['send', 'receive']);
  assert.equal(events[0].request_id, events[1].request_id);
  assert.equal(events[1].status, 200);
  assert.deepEqual(events[1].ai, ai);
  assert.match(events[0].time, /\+09:00$/);
});

test('全组失败仍保留尝试历史，提前成功及用户取消不触发付费回退', async t => {
  t.mock.method(console, 'info', () => {});
  const providers = ['cloudflare', 'deepseek'];
  const body = JSON.stringify({text: '登记测试'});
  const fail = await fixture(t, {
    providers: () => providers, attempt: provider => ({error: provider === 'cloudflare' ? 'TIMEOUT' : 'NOT_CONFIGURED'}),
  });
  const missing = await fail('/api/assistant/recording-plan', {method: 'POST', body});
  assert.equal(missing.status, 504);
  assert.equal((await missing.json()).ai.attempts.length, 2);
  let calls = 0;
  const stop = await fixture(t, {providers: () => providers, attempt: provider => {calls++; return generated(provider);}});
  assert.equal((await stop('/api/assistant/recording-plan', {method: 'POST', body})).status, 200);
  const cancelled = AbortSignal.abort();
  assert.equal((await stop('/api/assistant/recording-plan', {method: 'POST', body, signal: cancelled})).status, 408);
  assert.equal(calls, 1);
});

test('任务、决定与上传结果的请求回执包含标识，离线也留下成对记录', async t => {
  const profile = await mkdtemp(join(tmpdir(), 'feiyue-task-log-'));
  t.after(() => rm(profile, {recursive: true, force: true}));
  const log = createTaskTrafficLog(profile);
  const request = log.wrap(async path => {
    if (path.startsWith('/api/devices/')) throw Object.assign(Error('hidden network details'), {code: 'TIMEOUT'});
    return Response.json({task: {task_id: 'task-1', type: 'test.type', status: 'COMPLETED', params: {body: 'hidden params'}}});
  });
  await request('/api/tasks/task-1/result?auth=hidden', {method: 'POST', body: JSON.stringify({status: 'COMPLETED'})});
  await assert.rejects(request('/api/devices/device-1/pending'), {code: 'TIMEOUT'});
  await log.flush();
  const written = await readFile(log.file, 'utf8');
  assert.doesNotMatch(written, /hidden/);
  const [sent, received, offlineSend, offlineResult] = written.trim().split('\n').map(JSON.parse);
  assert.equal(sent.task_status, 'COMPLETED');
  assert.equal(received.task.task_id, 'task-1');
  assert.equal(offlineSend.request_id, offlineResult.request_id);
  assert.equal(offlineResult.error, 'TIMEOUT');
});

test('文字与登记共用五小时冷却，跨请求、跨入口跳过；到期先探测；账户隔离',async t=>{
  t.mock.method(console,'info',()=>{});
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-19T12:00:00Z')});
  const calls=[];
  let broken=true;
  const request=await fixture(t,{
    providers:()=>['cloudflare','gemini'],
    attempt(provider,input){
      const probe=isProbe(input);calls.push([provider,probe?'probe':'request']);
      if(provider==='cloudflare'&&broken)return {error:'RATE_LIMITED'};
      if(probe)return greeting(provider);
      return input.maxOutputTokens===512?generated(provider,{reply:'罗马',proposal:null}):generated(provider);
    }
  },r=>({ownerId:r.headers.get('x-test-owner')}));
  async function ask(chat=false,owner='one'){
    calls.length=0;
    const response=await request('/api/assistant/'+(chat?'message':'recording-plan'),{method:'POST',
      headers:{'x-test-owner':owner},body:JSON.stringify(chat?{messages:[{role:'user',content:'介绍罗马'}]}:{text:'登记用例'})});
    assert.equal(response.status,200);return [...calls];
  }
  assert.deepEqual(await ask(),[['cloudflare','request'],['gemini','probe'],['gemini','request']]);
  assert.deepEqual(await ask(true),[['gemini','request']]);
  broken=false;
  assert.deepEqual(await ask(true,'two'),[['cloudflare','request']]);
  t.mock.timers.tick(5*3600000-1);
  assert.deepEqual(await ask(true),[['gemini','probe'],['gemini','request']]);
  // 一小时首选仍然有效。两小时后它到期，同时五小时冷却也已结束。
  t.mock.timers.tick(2*3600000);
  const recovered=await ask();
  assert.deepEqual(recovered.slice(0,2),[['cloudflare','probe'],['gemini','probe']]);
  assert.equal(recovered[2][1],'request');
});

test('并行三路中最快的正确回复立即触发一次原问题，慢探测和错误问候均不接收正文',async t=>{
  t.mock.method(console,'info',()=>{});
  let finishSlow,showStarted;
  const businessStarted=new Promise(resolve=>showStarted=resolve), calls=[];
  const request=await fixture(t,{
    providers:()=>['a','b','c','d','e'],
    async attempt(provider,input){
      calls.push([provider,isProbe(input)?'probe':'request']);
      if(provider==='a')return {error:'TIMEOUT'};
      if(isProbe(input)){
        if(provider==='b')await new Promise(resolve=>finishSlow=resolve);
        return greeting(provider,provider==='c'?'你好，我在。':'你好，我在');
      }
      showStarted(provider);return generated(provider,{reply:'罗马',proposal:null});
    }
  });
  const result=request('/api/assistant/message',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'私密的原问题'}]})});
  assert.equal(await businessStarted,'d');
  assert.deepEqual(calls,[['a','request'],['b','probe'],['c','probe'],['d','probe'],['d','request']]);
  finishSlow();assert.equal((await result).status,200);
});

test('全组失败分批探测，五小时内再次询问零模型调用，取消请求不误封',async t=>{
  t.mock.method(console,'info',()=>{});
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-20T00:00:00Z')});
  const calls=[];
  const request=await fixture(t,{providers:()=>['a','b','c','d','e'],
    attempt(p,input){calls.push([p,isProbe(input)]);return {error:'TIMEOUT'};}});
  async function ask(signal){return request('/api/assistant/message',{method:'POST',signal,body:JSON.stringify({messages:[{role:'user',content:'你好'}]})});}
  assert.equal((await ask(AbortSignal.abort())).status,408);
  assert.equal(calls.length,0);
  assert.equal((await ask()).status,504);
  assert.deepEqual(calls,[['a',false],['b',true],['c',true],['d',true],['e',true]]);
  calls.length=0;t.mock.timers.tick(5*3600000-1);
  assert.equal((await (await ask()).json()).error.code,'AI_COOLDOWN');assert.equal(calls.length,0);
  t.mock.timers.tick(1);assert.equal((await ask()).status,504);
  assert.deepEqual(calls,[['a',true],['b',true],['c',true],['d',true],['e',true]]);
});

test('提问中途取消，已发出的独立探针仍记录明确故障，两个入口共享直到复探通过', async t => {
  t.mock.method(console, 'info', () => {});
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-20T00:00:00Z')});
  const fiveHours = 5 * 3600000;
  const started = Promise.withResolvers(), pending = Promise.withResolvers(), calls = [];
  let attempts = 0;
  const request = await fixture(t, {
    providers: () => ['first', 'backup'],
    async attempt(provider, input) {
      const probe = isProbe(input);
      calls.push([provider, probe ? 'probe' : 'request']);
      if (provider === 'first') return {error: 'TIMEOUT'};
      if (!probe) return generated(provider);
      attempts++;
      if (attempts === 1) {
        started.resolve();
        return pending.promise;
      }
      return attempts === 2 ? {error: 'RATE_LIMITED', upstream_status: 429} : greeting(provider);
    },
  });
  const controller = new AbortController();
  const chat = request('/api/assistant/message', {method: 'POST', signal: controller.signal,
    headers: {'X-Feiyue-AI-Trace': '1'}, body: JSON.stringify({messages: [{role: 'user', content: '问答测试'}]})});
  await started.promise;
  controller.abort();
  pending.resolve(greeting('backup', '晚安'));
  const cancelled = await chat;
  assert.equal(cancelled.status, 408);
  assert.deepEqual((await cancelled.json()).ai.attempts.map(a => [a.stage, a.code]),
    [['request', 'TIMEOUT'], ['probe', 'PROBE_MISMATCH']]);
  const register = () => request('/api/assistant/recording-plan', {method: 'POST', body: JSON.stringify({text: '登记测试'})});
  for (let cycle = 0; cycle < 2; cycle++) {
    calls.length = 0;
    t.mock.timers.tick(fiveHours - 1);
    assert.equal((await (await register()).json()).error.code, 'AI_COOLDOWN');
    assert.deepEqual(calls, []);
    t.mock.timers.tick(1);
    const response = await register();
    const probes = [['first', 'probe'], ['backup', 'probe']];
    if (cycle === 0) {
      assert.deepEqual(calls, probes);
      assert.ok((await response.json()).ai.attempts.some(a => a.provider === 'backup' && a.code === 'RATE_LIMITED'));
    } else {
      assert.equal(response.status, 200);
      assert.deepEqual(calls, [...probes, ['backup', 'request']]);
    }
  }
});

test('同一线路已有两个在途探针时，从最后一次确认失败起计满五小时', async t => {
  t.mock.method(console, 'info', () => {});
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-20T00:00:00Z')});
  const started = [Promise.withResolvers(), Promise.withResolvers()];
  const pending = [Promise.withResolvers(), Promise.withResolvers()];
  let backupProbes = 0;
  const request = await fixture(t, {
    providers: () => ['first', 'backup'],
    async attempt(provider, input) {
      if (provider === 'first') return {error: 'TIMEOUT'};
      assert.ok(isProbe(input));
      const index = backupProbes++;
      started[index]?.resolve();
      return pending[index]?.promise ?? {error: 'TIMEOUT'};
    },
  });
  const ask = () => request('/api/assistant/recording-plan', {method: 'POST', body: JSON.stringify({text: '测试'})});
  const one = ask();
  await started[0].promise;
  const two = ask();
  await started[1].promise;
  pending[0].resolve({error: 'TIMEOUT'});
  await one;
  t.mock.timers.tick(1000);
  pending[1].resolve({error: 'TIMEOUT'});
  await two;
  t.mock.timers.tick(5 * 3600000 - 1);
  await ask();
  assert.equal(backupProbes, 2);
  t.mock.timers.tick(1);
  await ask();
  assert.equal(backupProbes, 3);
});

const main = process.env.COMPANION_HU_SHI_MAIN_SOURCE;
const heartbeat = request => request('/api/assistant/heartbeat', {method: 'POST'}).then(response => response.json());
test('心跳经桌面挂载入口鉴权，固定问候独立于请求数据，落盘仅含诊断',async t=>{
  const db=openTestDatabase();
  t.after(db.close);
  initializeDatabase(db.sqlite);
  const cloud=t.mock.method(console,'info',()=>{});
  const calls=[];
  const env={COMPANION_DB:db.DB,COMPANION_HOST:{
    providers:()=>['cloudflare'],
    attempt(provider,input){calls.push(input);return greeting(provider);},
  }};
  const origin='https://local.invalid';
  const mount=(options,actor,fromMain=false)=>handleCompanion(
    new Request(origin+'/api/companion/assistant/heartbeat',options),env,actor,fromMain);
  assert.equal((await mount({method:'POST'},null)).status,403);
  assert.equal((await mount({method:'POST',headers:{Origin:'https://other.invalid'}},'fixture')).status,403);
  assert.equal((await mount({method:'POST'},'fixture',true)).status,404);
  assert.equal((await mount({method:'GET'},'fixture')).status,405);
  assert.equal(calls.length,0);
  const dir=await mkdtemp(join(tmpdir(),'feiyue-heartbeat-log-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const log=createTaskTrafficLog(dir);
  const request=log.wrap((_path,options)=>mount(options,'fixture'));
  const response=await request('/api/assistant/heartbeat',{method:'POST',
    headers:{Origin:origin,Authorization:'fixture-secret-header'},body:JSON.stringify({text:'fixture-private-question'})});
  assert.equal(response.status,200);
  assert.deepEqual(calls.map(input=>input.messages),[[{role:'user',content:'请直接恢复你好，我在'}]]);
  await log.flush();
  const file=await readFile(log.file,'utf8');
  assert.doesNotMatch(file+JSON.stringify(cloud.mock.calls.map(call=>call.arguments)),/fixture-private-question|fixture-secret-header|请直接恢复你好，我在/);
  const [sent,received]=file.trim().split('\n').map(JSON.parse);
  assert.equal(sent.request_id,received.request_id);
  assert.equal(received.heartbeat,'healthy');
  assert.equal(received.provider,'cloudflare');
  assert.equal(received.ai.attempts[0].code,'OK');
  assert.match(received.time,/\+09:00$/);
});
test('半小时心跳仅检查当前免费接口，失败后先尝试其余免费接口，成功即供真实问答使用', async t => {
  t.mock.method(console, 'info', () => {});
  const calls = [];
  let healthy = 'cloudflare';
  const request = await fixture(t, {
    providers: () => ['cloudflare','gemini','groq','sakura','deepseek'],
    attempt(provider, input) {
      calls.push([provider,isProbe(input)]);
      if (!isProbe(input)) return generated(provider, {reply:'回答',proposal:null});
      return greeting(provider, provider === healthy ? '你好，我在' : '线路异常');
    },
  });
  assert.equal((await request('/api/assistant/heartbeat', {method:'GET'})).status,405);
  assert.equal((await heartbeat(request)).status, 'healthy');
  assert.deepEqual(calls.splice(0), [['cloudflare',true]]);
  healthy = 'groq';
  const switched = await heartbeat(request);
  assert.equal(switched.status,'switched');
  assert.equal(switched.provider,'groq');
  assert.deepEqual(calls.splice(0), [['cloudflare',true],['gemini',true],['groq',true]]);
  assert.equal((await heartbeat(request)).status, 'healthy');
  assert.deepEqual(calls.splice(0), [['groq',true]]);
  const reply = await request('/api/assistant/message', {method:'POST',
    body:JSON.stringify({messages:[{role:'user',content:'本次真实提问'}]})});
  assert.equal(reply.status,200);
  assert.deepEqual(calls,[['groq',false]]);
});

for (const paid of ['sakura','openai','deepseek']) {
  test('心跳正式探测可选中 '+paid+'，成为当前线路后停止定时模型调用', async t => {
    t.mock.method(console,'info',()=>{});
    t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-20T00:00:00Z')});
    const calls=[];
    const request=await fixture(t,{
      providers:()=>['cloudflare','gemini',paid],
      attempt(provider,input){
        calls.push([provider,isProbe(input)]);
        return provider===paid?greeting(provider):{error:'TIMEOUT'};
      },
    });
    assert.equal((await heartbeat(request)).provider,paid);
    assert.deepEqual(calls.splice(0),[['cloudflare',true],['gemini',true],[paid,true]]);
    for (const elapsed of [1800000,3600000]) {
      t.mock.timers.tick(elapsed);
      const skipped=await heartbeat(request);
      assert.equal(skipped.status,'skipped_paid');
      assert.deepEqual(skipped.ai.attempts,[]);
    }
    assert.deepEqual(calls,[]);
  });
}

test('在途心跳不覆盖真实提问刚选中的线路',async t=>{
  t.mock.method(console,'info',()=>{});
  const started=Promise.withResolvers(),business=[];
  const pending=new Map();
  const request=await fixture(t,{
    providers:()=>['cloudflare','gemini','groq'],
    async attempt(provider,input){
      if(provider==='cloudflare')return {error:'TIMEOUT'};
      if(isProbe(input)){
        if(!pending.has(provider)){
          const probe=Promise.withResolvers();
          pending.set(provider,probe);
          if(pending.size===2)started.resolve();
          return probe.promise;
        }
        return greeting(provider);
      }
      business.push(provider);return generated(provider,{reply:'回答',proposal:null});
    },
  });
  const background=heartbeat(request);
  await started.promise;
  const ask=()=>request('/api/assistant/message',{method:'POST',
    body:JSON.stringify({messages:[{role:'user',content:'测试'}]})});
  assert.equal((await ask()).status,200);
  pending.get('groq').resolve(greeting('groq'));
  await new Promise(setImmediate);
  pending.get('gemini').resolve(greeting('gemini'));
  assert.equal((await background).status,'superseded');
  assert.equal((await ask()).status,200);
  assert.deepEqual(business,['gemini','gemini']);
});

test('真实提问已选中收费接口，旧心跳的免费探针失败后不再发出收费探针',async t=>{
  t.mock.method(console,'info',()=>{});
  const started=Promise.withResolvers(), pending=Promise.withResolvers(), paid=[];
  const request=await fixture(t,{
    providers:()=>['cloudflare','openai'],
    attempt(provider,input){
      if(provider==='openai'){
        paid.push(isProbe(input)?'probe':'request');
        return isProbe(input)?greeting(provider):generated(provider,{reply:'已回答',proposal:null});
      }
      if(isProbe(input)){started.resolve();return pending.promise;}
      return {error:'TIMEOUT'};
    },
  });
  const old=heartbeat(request);
  await started.promise;
  const response=await request('/api/assistant/message',{method:'POST',
    body:JSON.stringify({messages:[{role:'user',content:'问答测试'}]})});
  assert.equal(response.status,200);
  pending.resolve({error:'TIMEOUT'});
  assert.equal((await old).status,'superseded');
  assert.deepEqual(paid,['probe','request']);
});

test('迟到的正确问候不能将已经进入五小时冷却的接口报告为健康',async t=>{
  t.mock.method(console,'info',()=>{});
  const started=Promise.withResolvers(), pending=Promise.withResolvers();
  let calls=0;
  const request=await fixture(t,{
    providers:()=>['cloudflare'],
    attempt(){
      if(++calls===1){started.resolve();return pending.promise;}
      return {error:'TIMEOUT'};
    },
  });
  const old=heartbeat(request);
  await started.promise;
  assert.equal((await heartbeat(request)).error.code,'TIMEOUT');
  pending.resolve(greeting('cloudflare'));
  assert.equal((await old).error.code,'AI_COOLDOWN');
  assert.equal((await heartbeat(request)).error.code,'AI_COOLDOWN');
  assert.equal(calls,2);
});

test('心跳探遍全部线路后停止，五小时冷却内没有模型调用', async t => {
  t.mock.method(console,'info',()=>{});
  const calls=[];
  const request=await fixture(t,{
    providers:()=>['cloudflare','gemini','openai'],
    attempt(provider,input){calls.push([provider,isProbe(input)]);return {error:'TIMEOUT'};},
  });
  assert.equal((await heartbeat(request)).error.code,'TIMEOUT');
  assert.deepEqual(calls.splice(0),[['cloudflare',true],['gemini',true],['openai',true]]);
  assert.equal((await heartbeat(request)).error.code,'AI_COOLDOWN');
  assert.deepEqual(calls,[]);
});

test('复用主站真实供应商客户端，顺序覆盖全部已定义接口且默认允许付费 DeepSeek', {skip: !main}, async () => {
  const root = resolve(main, 'src/features/ai-check/ai');
  const shared = await import(pathToFileURL(resolve(root, 'index.mjs')));
  const {runPaidProbe} = await import(pathToFileURL(resolve(root, 'paid-probe.mjs')));
  const outbound = [];
  const gateway = createRegistrationAiGateway({deepseekLanguage: 'synthetic-only', BIGMODEL_API_KEY: 'fixture', GEMINI_API_KEY: 'fixture'}, {...shared, runPaidProbe}, {
    fetcher: async (url, options) => {
      const payload=JSON.parse(options.body);
      outbound.push([url, payload.model, payload.max_tokens]);
      return Response.json({choices: [{finish_reason: 'stop', message: {content: JSON.stringify({actions: [food], pending: []})}}]});
    },
  });
  const expected = shared.AI_PRIORITY.filter(provider => provider !== 'bigmodel' && provider !== 'gemini');
  assert.deepEqual(gateway.providers().slice(0, expected.length), expected);
  assert.ok(Object.keys(shared.AI_MODELS).every(provider => gateway.providers().includes(provider) === (provider !== 'bigmodel' && provider !== 'gemini')));
  assert.equal(gateway.providers().at(-1), 'deepseek');
  const input = {version: 1, route: 'text', maxOutputTokens: 2048, messages: [{role: 'user', content: 'test'}]};
  for (const provider of ['bigmodel', 'gemini']) {
    assert.equal((await gateway.attempt(provider, input)).error, 'NOT_CONFIGURED');
  }
  assert.equal((await gateway.attempt('cloudflare', input)).error, 'NOT_CONFIGURED');
  assert.equal((await gateway.attempt('deepseek', input)).value.provider, 'deepseek');
  assert.deepEqual(outbound, [['https://api.deepseek.com/chat/completions', 'deepseek-flash', 2048]]);
});
