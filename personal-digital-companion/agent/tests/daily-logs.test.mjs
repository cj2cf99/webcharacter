import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker.mjs';
import { createCompanionMount } from '../host/main-site.mjs';
import { CLOUDFLARE_MODEL } from '../assistant/cloudflare.mjs';
import { openTestDatabase } from './sqlite-d1.mjs';

const token = 'a'.repeat(64);
const auth = { Authorization: `Bearer ${token}` };
const path = '/api/daily-logs';
const range = '?from=2026-11-19&to=2026-11-20';
const summary = { title: '学习记录', content: '完成了一节模拟练习。' };

function fixture(t, run = async () => ({ response: JSON.stringify(summary) })) {
  const database = openTestDatabase();
  t.after(database.close);
  database.sqlite.exec(readFileSync(new URL('../migrations/008-daily-logs.sql', import.meta.url), 'utf8'));
  const env = { DB: database.DB, API_TOKEN: 'development', DAILY_LOG_API_TOKEN: token, clouflareai: { run } };
  const request = (target = path + range, options = {}, origin = 'https://worker.test') =>
    worker.fetch(new Request(origin + target, { ...options, headers: { ...auth, ...options.headers } }), env);
  const post = body => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { request, post, env, sqlite: database.sqlite };
}

test('仅通过 HTTPS 和日志专用令牌访问，令牌不能调用任务接口', async t => {
  const { request, env } = fixture(t);
  assert.equal((await request(path + range, {}, 'http://worker.test')).status, 403);
  assert.equal((await request(path + range, { headers: { Authorization: 'Bearer development' } })).status, 401);
  assert.equal((await request(path + range, { headers: { Authorization: `Bearer ${'b'.repeat(64)}` } })).status, 401);
  assert.equal((await request('/api/tasklist')).status, 401);
  assert.equal((await request(path + '/search', { headers: { Authorization: 'Bearer development' } })).status, 404);
  delete env.DAILY_LOG_API_TOKEN;
  assert.equal((await request()).status, 503);
});

test('生成只收正文，读取只收有效日期范围，超长请求在调用模型前拒绝', async t => {
  const { request, post } = fixture(t, async () => assert.fail('无效请求调用了模型'));
  assert.equal((await post({ content: '测试', date: '2026-11-19' })).status, 400);
  assert.equal((await post({ content: ' ' })).status, 400);
  assert.equal((await post({ content: '一'.repeat(12_001) })).status, 413);
  assert.equal((await post({ content: '一'.repeat(24_000) })).status, 413);
  assert.equal((await request(path, { method: 'POST', body: '普通文字' })).status, 415);
  assert.equal((await request(path + '?from=2026-11-19')).status, 400);
  assert.equal((await request(path + '?from=2026-02-30&to=2026-03-01')).status, 400);
  assert.equal((await request(path + '?from=2026-11-20&to=2026-11-19')).status, 400);
  assert.equal((await request(path + '?from=2026-11-19&to=2027-11-20')).status, 400);
  assert.equal((await request(path + range + '&q=test')).status, 400);
  assert.deepEqual(await (await request()).json(), { items: [] });
});

test('按东京时间跨午夜归档，读取不调用模型，也不保存提交材料', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-19T14:59:59Z') });
  let calls = 0;
  const { request, post, sqlite } = fixture(t, async (model, input) => {
    calls++;
    assert.equal(model, CLOUDFLARE_MODEL);
    assert.equal(input.messages.at(-1).content, '模拟的两日材料');
    return { response: JSON.stringify(summary) };
  });
  const first = await post({ content: '模拟的两日材料' });
  assert.equal(first.status, 201);
  assert.equal(first.headers.get('Cache-Control'), 'no-store');
  const firstItem = { ...summary, date: '2026-11-19', generated_at: '2026-11-19T14:59:59.000Z' };
  assert.deepEqual(await first.json(), { item: firstItem });
  const repeat = await post({ content: '另一批材料' });
  assert.equal(repeat.status, 200);
  assert.deepEqual(await repeat.json(), { item: firstItem });

  t.mock.timers.setTime(new Date('2026-11-19T15:00:00Z').getTime());
  const second = await post({ content: '模拟的两日材料' });
  assert.equal(second.status, 201);
  assert.equal((await second.json()).item.date, '2026-11-20');
  const list = await request();
  assert.equal(list.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual((await list.json()).items.map(item => item.date), ['2026-11-19', '2026-11-20']);
  assert.deepEqual(await (await request(path + '?from=2026-11-19&to=2026-11-19')).json(), { items: [firstItem] });
  assert.equal(calls, 2);
  assert.doesNotMatch(JSON.stringify(sqlite.prepare('SELECT * FROM daily_logs').all()), /模拟的两日材料|另一批材料/);
});

test('4000 字符正文可以生成、保存和完整读取，JSON 转义不计入正文长度', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-19T02:00:00Z') });
  const content = '字'.repeat(3999) + '📒';
  const response = JSON.stringify({ ...summary, content }).replace(/[^ -~]/g, character =>
    '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
  const { request, post } = fixture(t, async (_model, input) => {
    assert.equal(input.max_completion_tokens, 8192);
    assert.match(input.messages[0].content, /最多 4000 字/);
    return { response };
  });
  const created = await post({ content: '较长的日志测试材料' });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).item.content, content);
  assert.equal((await (await request()).json()).items[0].content, content);
});

test('模型超长、截断或失败时不保存坏日志，回执不暴露模型异常', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-19T02:00:00Z') });
  const { env, request, post } = fixture(t);
  delete env.clouflareai;
  assert.equal((await post({ content: '测试' })).status, 503);
  env.clouflareai = { run: async () => ({ response: JSON.stringify({ ...summary, content: '字'.repeat(4001) }) }) };
  assert.equal((await post({ content: '测试' })).status, 502);
  env.clouflareai.run = async () => ({ response: JSON.stringify(summary), finish_reason: 'length' });
  assert.equal((await post({ content: '测试' })).status, 502);
  env.clouflareai.run = async () => { throw new Error('模拟私人正文'); };
  const failed = await post({ content: '测试' });
  assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), /模拟私人正文/);
  assert.deepEqual(await (await request()).json(), { items: [] });
});

test('同日并发只保存一份日志，双方获得同一份回执', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-19T02:00:00Z') });
  const pending = [];
  const { post, sqlite } = fixture(t, async () => new Promise(resolve => {
    pending.push(resolve);
    if (pending.length === 2) {
      pending[0]({ response: JSON.stringify(summary) });
      pending[1]({ response: JSON.stringify({ ...summary, title: '并发候选' }) });
    }
  }));
  const results = await Promise.all([post({ content: '甲' }), post({ content: '乙' })]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 201]);
  assert.deepEqual(await results[0].json(), await results[1].json());
  assert.equal(sqlite.prepare('SELECT count(*) AS total FROM daily_logs').get().total, 1);
});

test('主站挂载沿用 HTTPS、主站同源及身份校验，日志按身份读取', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-19T02:00:00Z') });
  const { env } = fixture(t);
  const mount = createCompanionMount({
    async authorizeMarket(request) {
      const ownerId = request.headers.get('X-Local-Test-Owner');
      if (!ownerId) throw Object.assign(new Error('拒绝访问'), { status: 401 });
      return { ownerId };
    },
    createEnvAiClient() { assert.fail('每日日志应使用 Workers AI 绑定'); },
  });
  const url = 'https://site.test/api/companion/daily-logs';
  const context = { ...env, COMPANION_DB: env.DB, DB: undefined };
  assert.equal((await mount(new Request(url + range, { headers: auth }), context)).status, 401);
  const headers = { 'Content-Type': 'application/json', 'X-Local-Test-Owner': 'account-a' };
  const init = { method: 'POST', body: JSON.stringify({ content: '测试材料' }) };
  assert.equal((await mount(new Request(url, { ...init, headers }), context)).status, 403);
  const saved = await mount(new Request(url, { ...init, headers: { ...headers, Origin: 'https://site.test' } }), context);
  assert.equal(saved.status, 201);
  const readable = await mount(new Request(url + range, { headers }), context);
  assert.equal((await readable.json()).items.length, 1);
  const other = await mount(new Request(url + range, { headers: { 'X-Local-Test-Owner': 'account-b' } }), context);
  assert.deepEqual(await other.json(), { items: [] });
});
