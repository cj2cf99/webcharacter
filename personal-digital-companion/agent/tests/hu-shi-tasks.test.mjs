import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeDatabase, openTestDatabase } from './sqlite-d1.mjs';
import { createCompanionMount } from '../host/main-site.mjs';

const seed = readFileSync(new URL('../seeds/tasklist-hu-shi.sql', import.meta.url), 'utf8');
const types = ['food', 'exercise', 'event'].map(kind => `hu-shi.${kind}.create`);
const domain = 'https://fixture.test';
const time = 1795053600000;

function fixture(t, handleRecords, extraEnv = {}) {
  const { DB, sqlite, close } = openTestDatabase();
  t.after(close);
  initializeDatabase(sqlite);
  sqlite.exec(seed);
  sqlite.exec(seed);
  const mount = createCompanionMount({
    authorizeMarket: request => ({ ownerId: request.headers.get('x-fixture-owner') }),
    createEnvAiClient: () => ({}),
    handleRecords,
  });
  async function call(path, body, { owner = 'self', origin = domain } = {}) {
    const response = await mount(new Request(domain + '/api/companion' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, 'x-fixture-owner': owner, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { ...extraEnv, COMPANION_DB: DB });
    return { status: response.status, body: await response.json() };
  }
  async function submit(type, params) {
    const { body } = await call('/task-submissions', {});
    return call('/tasks', { type, params, submission_id: body.submission_id });
  }
  async function create(type, params) {
    const result = await submit(type, params);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.task_id;
  }
  return { call, submit, create, execute: (id, options) => call(`/tasks/${id}/execute`, {}, options) };
}

test('三个模板使用同一任务入口，按类别发送主站参数并保存业务回执', async t => {
  const sent = [];
  const app = fixture(t, async (request, env) => {
    assert.equal(request.headers.get('x-fixture-owner'), 'self');
    assert.equal(request.headers.get('Origin'), domain);
    assert.ok(env.mymaindb.fixture);
    sent.push({ path: new URL(request.url).pathname, params: await request.json() });
    return Response.json({ id: `receipt-${sent.length}`, created_at: time }, { status: 201 });
  }, { mymaindb: { fixture: true } });
  assert.deepEqual((await app.call('/tasklist')).body.tasklist.map(entry => entry.type), [...types].sort());
  for (const [index, type] of types.entries()) {
    const params = index === 0
      ? { body: ' 午饭 ', reflection: ' 满意 ', tag_ids: ['food-tag'], photos: ['https://fixture.test/photo.png'] }
      : index === 1 ? { body: ' 步行 ' } : {};
    const id = await app.create(type, params);
    const result = await app.execute(id);
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'COMPLETED');
    assert.deepEqual(result.body.result, { record_id: `receipt-${index + 1}`, created_at: time });
    assert.equal(result.body.executions.length, 1);
    assert.equal((await app.execute(id)).body.result.record_id, `receipt-${index + 1}`);
  }
  assert.deepEqual(sent, [
    { path: '/api/records/hu-shi/food/entries', params: { body: '午饭', reflection: '满意', tag_ids: ['food-tag'], photos: ['https://fixture.test/photo.png'] } },
    { path: '/api/records/hu-shi/exercise/entries', params: { body: '步行', reflection: null, tag_ids: [], photos: [] } },
    { path: '/api/records/hu-shi/event/entries', params: {} },
  ]);
});

test('验证参数、身份和配置时不登记，主站明确拒绝后最多再试一次', async t => {
  let calls = 0;
  const app = fixture(t, async () => {
    calls++;
    return Response.json({ error: '登记冷却中' }, { status: 429 });
  });
  for (const [type, params] of [
    [types[0], {}], [types[0], { body: '  ' }], [types[0], { body: '记录', tag_ids: [1] }],
    [types[0], { body: '记录', tag_ids: Array(51).fill('a') }],
    [types[1], { body: '记录', photos: 'https://fixture.test/p.png' }],
    [types[1], { body: '记录', photos: ['http://fixture.test/p.png'] }],
    [types[2], { created_at: time }], [types[2], { body: '额外正文' }],
  ]) assert.equal((await app.submit(type, params)).status, 400);
  const id = await app.create(types[2], {});
  assert.equal((await app.execute(id, { owner: 'other' })).status, 404);
  assert.equal((await app.execute(id, { origin: 'https://other.test' })).status, 403);
  assert.equal((await app.call(`/tasks/${id}/execute`, { kind: 'food' })).status, 400);
  assert.equal(calls, 0);
  const result = await app.execute(id);
  assert.equal(result.body.status, 'FAILED');
  assert.equal(result.body.attempt_count, 2);
  assert.match(result.body.error, /冷却/);
  assert.equal(calls, 2);

  const disconnected = fixture(t);
  const pending = await disconnected.create(types[2], {});
  assert.equal((await disconnected.execute(pending)).status, 503);
  assert.equal((await disconnected.call(`/tasks/${pending}`)).body.status, 'PENDING');
});

test('并发提交与主站回执丢失不会重复登记', async t => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  let writes = 0;
  const app = fixture(t, async () => {
    writes++;
    entered.resolve();
    await release.promise;
    throw new Error('模拟主站已写入但回执丢失');
  });
  const id = await app.create(types[0], { body: '测试' });
  const first = app.execute(id);
  try {
    await entered.promise;
    assert.equal((await app.execute(id)).status, 409);
  } finally { release.resolve(); }
  const result = await first;
  assert.equal(result.status, 202);
  assert.equal(result.body.status, 'RUNNING');
  assert.match(result.body.activity.progress_message, /待核对/);
  assert.equal((await app.execute(id)).status, 409);
  assert.equal(writes, 1);
});

const mainSource = process.env.COMPANION_HU_SHI_MAIN_SOURCE;
test('可选主站契约验证：用真实胡适业务代码和隔离 D1 读回三个类别', { skip: !mainSource }, async t => {
  const host = openTestDatabase();
  t.after(host.close);
  host.sqlite.exec(readFileSync(resolve(mainSource, 'migrations/0030_hu_shi.sql'), 'utf8'));
  const recordsSource = resolve(mainSource, 'src/features/records');
  const { api } = await import(pathToFileURL(resolve(recordsSource, 'api.js')).href);
  const { createRecordsHandler } = await import(pathToFileURL(resolve(recordsSource, 'routes.mjs')).href);
  const handleRecords = createRecordsHandler({
    authorize: request => assert.equal(request.headers.get('x-fixture-owner'), 'self'),
    api: (request, env) => api(request, env, time),
  });
  const app = fixture(t, handleRecords, { mymaindb: host.DB });
  host.sqlite.prepare('INSERT INTO ra_hushi_tags (id, kind, name) VALUES (?, ?, ?)').run('food-tag', 'food', '测试标签');
  for (const [index, type] of types.entries()) {
    const params = index === 0 ? { body: '测试', tag_ids: ['food-tag'] } : index === 1 ? { body: '测试' } : {};
    const id = await app.create(type, params);
    const result = await app.execute(id);
    assert.equal(result.body.status, 'COMPLETED');
    const row = host.sqlite.prepare('SELECT kind, created_at FROM ra_hushi_records WHERE id = ?').get(result.body.result.record_id);
    assert.equal(row.kind, ['food', 'exercise', 'event'][index]);
    assert.equal(row.created_at, time);
  }
  const tooSoon = await app.create(types[2], {});
  assert.match((await app.execute(tooSoon)).body.error, /冷却/);
  const wrongTag = await app.create(types[1], { body: '隔离测试', tag_ids: ['food-tag'] });
  assert.equal((await app.execute(wrongTag)).body.status, 'FAILED');
  assert.equal(host.sqlite.prepare('SELECT COUNT(*) AS n FROM ra_hushi_records').get().n, 3);
});
