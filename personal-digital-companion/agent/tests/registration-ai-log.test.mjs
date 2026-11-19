import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createWorker} from '../worker.mjs';
import {createRegistrationAiGateway} from '../host/registration-ai.mjs';
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

const food = {type: 'hu-shi.food.create', params: {body: '隔离结果'}};
const generated = (provider, output = {actions: [food], pending: []}) =>
  ({value: {provider, model: provider + '-test', text: JSON.stringify(output), finishReason: 'stop'}});

test('限流、无效方案及供应商取消逐个切换，默认可到付费 DeepSeek，失败发送给客户端并本地记录', async t => {
  const providerCalls = [];
  const pool = {
    providers: () => ['cloudflare', 'gemini', 'groq', 'deepseek'],
    attempt(provider) {
      providerCalls.push(provider);
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
  assert.deepEqual(providerCalls, ['cloudflare', 'gemini', 'groq', 'deepseek']);
  assert.deepEqual(ai.attempts.map(row => row.code), ['RATE_LIMITED', 'INVALID_AI_RESPONSE', 'CANCELLED', 'OK']);
  assert.equal(ai.attempts[0].upstream_status, 429);
  assert.deepEqual(cloudLog.mock.calls.map(call => call.arguments[0].trace_id), Array(4).fill(ai.trace_id));
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

test('一小时优先按账户持久保存，命中不续期，到期回原顺序，首选失败换路', async t => {
  t.mock.method(console, 'info', () => {});
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-19T12:00:00Z')});
  let successful = 'gemini';
  const request = await fixture(t, {
    providers: () => ['cloudflare', 'gemini', 'deepseek'],
    attempt: provider => provider === successful ? generated(provider) : {error: 'RATE_LIMITED'},
  }, request => ({ownerId: request.headers.get('x-test-owner')}));
  async function plan(owner = 'one') {
    const response = await request('/api/assistant/recording-plan', {method: 'POST',
      headers: {'x-test-owner': owner}, body: JSON.stringify({text: '登记测试'})});
    assert.equal(response.status, 200);
    const {ai} = await response.json();
    return [ai.preferred_provider, ai.attempts.map(attempt => attempt.provider)];
  }
  assert.deepEqual(await plan(), [undefined, ['cloudflare', 'gemini']]);
  t.mock.timers.tick(59 * 60_000);
  assert.deepEqual(await plan(), ['gemini', ['gemini']]);
  assert.deepEqual(await plan('two'), [undefined, ['cloudflare', 'gemini']]);
  t.mock.timers.tick(60_000);
  successful = 'cloudflare';
  assert.deepEqual(await plan(), [undefined, ['cloudflare']]);
  assert.deepEqual(await plan('two'), ['gemini', ['gemini', 'cloudflare']]);
  successful = 'deepseek';
  assert.deepEqual(await plan(), ['cloudflare', ['cloudflare', 'gemini', 'deepseek']]);
  assert.deepEqual(await plan(), ['deepseek', ['deepseek']]);
});

const main = process.env.COMPANION_HU_SHI_MAIN_SOURCE;
test('复用主站真实供应商客户端，顺序覆盖全部已定义接口且默认允许付费 DeepSeek', {skip: !main}, async () => {
  const root = resolve(main, 'src/features/ai-check/ai');
  const shared = await import(pathToFileURL(resolve(root, 'index.mjs')));
  const {runPaidProbe} = await import(pathToFileURL(resolve(root, 'paid-probe.mjs')));
  const outbound = [];
  const gateway = createRegistrationAiGateway({deepseekLanguage: 'synthetic-only'}, {...shared, runPaidProbe}, {
    fetcher: async (url, options) => {
      outbound.push([url, JSON.parse(options.body).max_tokens]);
      return Response.json({choices: [{finish_reason: 'stop', message: {content: JSON.stringify({actions: [food], pending: []})}}]});
    },
  });
  assert.deepEqual(gateway.providers().slice(0, shared.AI_PRIORITY.length), shared.AI_PRIORITY);
  assert.ok(Object.keys(shared.AI_MODELS).every(provider => gateway.providers().includes(provider)));
  assert.equal(gateway.providers().at(-1), 'deepseek');
  const input = {version: 1, route: 'text', maxOutputTokens: 2048, messages: [{role: 'user', content: 'test'}]};
  assert.equal((await gateway.attempt('cloudflare', input)).error, 'NOT_CONFIGURED');
  assert.equal((await gateway.attempt('deepseek', input)).value.provider, 'deepseek');
  assert.deepEqual(outbound, [['https://api.deepseek.com/chat/completions', 2048]]);
});
