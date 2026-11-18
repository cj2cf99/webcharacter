import { seedMockTask, withTaskSubmission } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import worker from '../worker.mjs';
import { createTerminalClient } from '../terminals/client.mjs';
import { TERMINAL_COOKIE } from '../terminals/api.mjs';
import { openTestDatabase, initializeDatabase } from './sqlite-d1.mjs';

const pcId = 'pc-12345678-1234-4123-8123-123456789abc';
const missing = 'web-22345678-1234-4123-8123-123456789abc';
const token = `test-${crypto.randomUUID()}`;
function setup(t) {
  const db = openTestDatabase();
  initializeDatabase(db.sqlite); seedMockTask(db.sqlite);
  t.after(() => db.close());
  return db;
}
async function call(DB, path, { method = 'GET', value, raw, cookie, authorized = true, protocol = 'https:' } = {}) {
  if (path === '/api/tasks' && method === 'POST' && authorized) {
    value = await withTaskSubmission((url, body) => call(DB, url, { method: 'POST', value: body, cookie, protocol }), value);
  }
  const headers = { 'Content-Type': 'application/json' };
  if (authorized) headers.Authorization = `Bearer ${token}`;
  if (cookie !== undefined) headers.Cookie = cookie;
  return worker.fetch(new Request(`${protocol}//example.test${path}`, {
    method, headers, ...(raw !== undefined ? { body: raw } : value === undefined ? {} : { body: JSON.stringify(value) }),
  }), { DB, API_TOKEN: token });
}
const size = sqlite => sqlite.prepare('SELECT COUNT(*) AS n FROM devices').get().n;
const cookieValue = response => response.headers.get('Set-Cookie')?.split(';')[0];
const register = (DB, options = {}) => call(DB, '/api/terminal/register', { method: 'POST', value: { accepted: true }, ...options });

test('T01/T02：先询问不写库，接受生成web-ID及cookie，重复访问复用', async t => {
  const { DB, sqlite } = setup(t);
  let response = await call(DB, '/api/terminal');
  assert.deepEqual(await response.json(), { terminal: null, registration_required: true });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(size(sqlite), 0);
  response = await register(DB);
  assert.equal(response.status, 201);
  const { terminal } = await response.json();
  assert.match(terminal.device_id, /^web-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(terminal.display_name, terminal.device_id);
  assert.equal(terminal.computer_name, '网页终端');
  const header = response.headers.get('Set-Cookie');
  for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=31536000', 'Secure']) assert.ok(header.includes(attribute));
  const cookie = cookieValue(response);
  response = await call(DB, '/api/terminal', { cookie });
  assert.deepEqual(await response.json(), { terminal, registration_required: false });
  response = await register(DB, { cookie, value: { accepted: true, browser_label: '不应覆盖已有资料' } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).terminal, terminal);
  assert.equal(size(sqlite), 1);
  response = await register(DB, { protocol: 'http:', value: { accepted: true, browser_label: ' 手机浏览器 ' } });
  assert.equal(response.headers.get('Set-Cookie').includes('Secure'), false);
  assert.equal((await response.json()).terminal.computer_name, '手机浏览器');
});

test('T03：非明确接受和非法参数不登记也不改关联', async t => {
  const { DB, sqlite } = setup(t);
  const existing = await register(DB);
  const cookie = cookieValue(existing);
  const rows = sqlite.prepare('SELECT * FROM devices').all();
  for (const value of [null, [], {}, { accepted: false }, { accepted: 'true' },
    { accepted: true, device_id: pcId }, { accepted: true, browser_label: '' },
    { accepted: true, browser_label: 7 }, { accepted: true, browser_label: 'a'.repeat(256) },
    { accepted: true, browser_label: '\n' }]) {
    const response = await register(DB, { value, cookie });
    assert.equal(response.status, 400, JSON.stringify(value));
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
  assert.equal((await register(DB, { raw: '{', cookie })).status, 400);
  assert.deepEqual(sqlite.prepare('SELECT * FROM devices').all(), rows);
});

test('T05/T08：认领保留资料与任务，web可改名但不能PUT或执行PC任务', async t => {
  const { DB, sqlite } = setup(t);
  await call(DB, `/api/devices/${pcId}`, { method: 'PUT', value: { computer_name: 'HOME-PC' } });
  const task = await (await call(DB, '/api/tasks', { method: 'POST', value: { type: 'mock.echo', target_device_id: pcId, params: { drive: 'C:' } } })).json();
  const web = (await (await register(DB)).json()).terminal;
  const patch = await call(DB, `/api/devices/${web.device_id}`, { method: 'PATCH', value: { alias: 'myphone' } });
  assert.equal(patch.status, 200);
  const before = sqlite.prepare('SELECT * FROM devices ORDER BY device_id').all();
  for (const id of [web.device_id, pcId]) {
    const response = await call(DB, '/api/terminal/claim', { method: 'POST', value: { device_id: id } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).terminal.device_id, id);
    const current = await (await call(DB, '/api/terminal', { cookie: cookieValue(response) })).json();
    assert.equal(current.terminal.device_id, id);
  }
  assert.deepEqual(sqlite.prepare('SELECT * FROM devices ORDER BY device_id').all(), before);
  assert.equal((await (await call(DB, `/api/tasks/${task.task_id}`)).json()).target_device_id, pcId);
  assert.equal((await call(DB, `/api/devices/${web.device_id}`, { method: 'PUT', value: { computer_name: 'pretend-pc' } })).status, 400);
  assert.equal((await call(DB, '/api/tasks', { method: 'POST', value: { type: 'mock.echo', target_device_id: web.device_id, params: { drive: 'C:' } } })).status, 400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 1);
  assert.deepEqual(sqlite.prepare('SELECT * FROM devices ORDER BY device_id').all(), before);
});

test('T06：清理/失效/错误编码cookie回到询问，认领未知记录不覆盖原关联', async t => {
  const { DB, sqlite } = setup(t);
  const response = await register(DB);
  const cookie = cookieValue(response);
  const original = (await response.json()).terminal;
  for (const bad of [undefined, `${TERMINAL_COOKIE}=`, `${TERMINAL_COOKIE}=%E0%A4%A`,
    `${TERMINAL_COOKIE}=bad`, `${TERMINAL_COOKIE}=${missing}`, `${cookie}; ${cookie}`]) {
    const read = await call(DB, '/api/terminal', { cookie: bad });
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), { terminal: null, registration_required: true });
    if (bad !== undefined) assert.match(read.headers.get('Set-Cookie'), /Max-Age=0/);
  }
  const failed = await call(DB, '/api/terminal/claim', { method: 'POST', value: { device_id: missing }, cookie });
  assert.equal(failed.status, 404);
  assert.equal(failed.headers.get('Set-Cookie'), null);
  assert.deepEqual((await (await call(DB, '/api/terminal', { cookie })).json()).terminal, original);
  assert.equal(size(sqlite), 1);
  sqlite.prepare('DELETE FROM devices WHERE device_id = ?').run(original.device_id);
  const gone = await call(DB, '/api/terminal', { cookie });
  assert.deepEqual(await gone.json(), { terminal: null, registration_required: true });
  assert.match(gone.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal(size(sqlite), 0);
});

test('T07：新路由先认证，方法及内部错误不泄露秘密', async t => {
  const { DB, sqlite } = setup(t);
  for (const [path, method, value, allowed] of [
    ['/api/terminal', 'GET', undefined, 'GET'],
    ['/api/terminal/register', 'POST', { accepted: true }, 'POST'],
    ['/api/terminal/claim', 'POST', { device_id: pcId }, 'POST'],
  ]) {
    const unauthorized = await call(DB, path, { method, value, authorized: false, cookie: `${TERMINAL_COOKIE}=${pcId}` });
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get('Set-Cookie'), null);
    assert.equal((await unauthorized.text()).includes(token), false);
    const wrongMethod = await call(DB, path, { method: 'DELETE' });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('Allow'), allowed);
    assert.equal(wrongMethod.headers.get('Cache-Control'), 'no-store');
  }
  const failure = await register({ prepare() { throw new Error(`SQL ${token}`); } });
  assert.equal(failure.status, 500);
  assert.equal((await failure.text()).includes(token), false);
  assert.equal(failure.headers.get('Set-Cookie'), null);
  assert.equal(size(sqlite), 0);
});

test('T03/T06：认领字段严格，不接受伪造/额外字段或非法JSON', async t => {
  const { DB, sqlite } = setup(t);
  for (const value of [null, {}, [], { device_id: 'bad' }, { device_id: 7 }, { device_id: pcId, alias: 'x' }]) {
    const response = await call(DB, '/api/terminal/claim', { method: 'POST', value });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
  assert.equal((await call(DB, '/api/terminal/claim', { method: 'POST', raw: '{' })).status, 400);
  assert.equal(size(sqlite), 0);
});

function browser(DB) {
  let cookie;
  const requests = [];
  return {
    requests,
    clearCookie() { cookie = undefined; },
    async request(path, options) {
      requests.push({ path, ...options });
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.mode, 'same-origin');
      assert.equal(options.headers.Authorization, undefined);
      const response = await call(DB, path, { method: options.method, raw: options.body, cookie });
      if (response.headers.has('Set-Cookie')) cookie = response.headers.get('Set-Cookie').includes('Max-Age=0') ? undefined : cookieValue(response);
      return response;
    },
  };
}

test('T04/T09：非界面适配完整登记、清cookie、拒绝、认领流程', async t => {
  const { DB, sqlite } = setup(t);
  const transport = browser(DB);
  const client = createTerminalClient(transport.request);
  assert.deepEqual(await client.check(), { state: 'registration' });
  assert.equal(size(sqlite), 0);
  const accepted = await client.accept('手机浏览器');
  assert.equal(accepted.state, 'ready');
  await call(DB, `/api/devices/${accepted.terminal.device_id}`, { method: 'PATCH', value: { alias: 'myphone' } });
  assert.equal((await client.check()).terminal.display_name, 'myphone');
  transport.clearCookie();
  assert.deepEqual(await client.check(), { state: 'registration' });
  const mark = transport.requests.length;
  const rejected = await client.decline();
  assert.equal(rejected.state, 'management');
  assert.equal(rejected.devices[0].display_name, 'myphone');
  assert.deepEqual(transport.requests.slice(mark).map(r => [r.path, r.method]), [['/api/devices', 'GET']]);
  assert.equal(size(sqlite), 1);
  const claimed = await client.claim(accepted.terminal.device_id);
  assert.equal(claimed.state, 'ready');
  assert.equal(claimed.terminal.display_name, 'myphone');
  assert.equal((await client.check()).terminal.device_id, accepted.terminal.device_id);
  assert.equal(size(sqlite), 1);
});

test('T09：适配认证/网络/服务错误交回调用方，可重试且不自动登记', async t => {
  const { DB } = setup(t);
  const transport = browser(DB);
  for (const mode of ['unauthorized', 'network', 'server', 'malformed']) {
    let failing = true;
    const paths = [];
    const client = createTerminalClient(async (path, options) => {
      paths.push(path);
      if (!failing) return transport.request(path, options);
      if (mode === 'network') throw new Error('网络断开');
      if (mode === 'malformed') return Response.json({ terminal: null, registration_required: false });
      return Response.json({ error: { code: mode, message: '请求失败' } }, { status: mode === 'unauthorized' ? 401 : 500 });
    });
    await assert.rejects(client.check(), mode === 'unauthorized' ? { status: 401 } : /网络断开|请求失败|缺少关联结果/);
    assert.deepEqual(paths, ['/api/terminal']);
    failing = false;
    assert.deepEqual(await client.check(), { state: 'registration' });
  }
});

test('T09：同一接受动作连点只有一个请求，其他动作不自动排队', async t => {
  const { DB, sqlite } = setup(t);
  const transport = browser(DB);
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const client = createTerminalClient(async (path, options) => { await barrier; return transport.request(path, options); });
  const first = client.accept();
  const second = client.accept();
  assert.equal(first, second);
  await assert.rejects(client.decline(), /尚未结束/);
  release();
  assert.equal((await first).state, 'ready');
  assert.equal(transport.requests.length, 1);
  assert.equal(size(sqlite), 1);
});

test('T10：网页登记及别名在真实SQLite关闭重开后保留', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-terminal-'));
  let db;
  try {
    const path = join(directory, 'devices.sqlite');
    db = openTestDatabase(path);
    initializeDatabase(db.sqlite); seedMockTask(db.sqlite);
    const response = await register(db.DB);
    const cookie = cookieValue(response);
    const terminal = (await response.json()).terminal;
    await call(db.DB, `/api/devices/${terminal.device_id}`, { method: 'PATCH', value: { alias: 'myphone' } });
    db.close(); db = null;
    db = openTestDatabase(path);
    const current = (await (await call(db.DB, '/api/terminal', { cookie })).json()).terminal;
    assert.equal(current.device_id, terminal.device_id);
    assert.equal(current.created_at, terminal.created_at);
    assert.equal(current.display_name, 'myphone');
  } finally {
    db?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
