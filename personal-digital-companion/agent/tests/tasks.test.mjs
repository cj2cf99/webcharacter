import { seedMockTask, withTaskSubmission } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import worker from '../worker.mjs';
import { openTestDatabase, initializeDatabase } from './sqlite-d1.mjs';

const token = `test-${crypto.randomUUID()}`;
const device = 'pc-955e4ecf-0dd0-4f11-b9aa-9b5ac7f12a71';
const valid = () => ({ type: 'mock.echo', target_device_id: device, params: { drive: 'C:' } });
function fixture(t, file) {
  const database = openTestDatabase(file);
  initializeDatabase(database.sqlite); seedMockTask(database.sqlite);
  database.sqlite.prepare('INSERT OR IGNORE INTO devices VALUES (?, ?, NULL, ?)').run(device, 'TEST-PC', new Date().toISOString());
  t.after(() => database.close());
  return database;
}
async function request(DB, path, { method = 'GET', body, auth = token, envToken = token } = {}) {
  if (path === '/api/tasks' && method === 'POST' && body && typeof body === 'object' && !Array.isArray(body) && auth === token && envToken === token) {
    body = await withTaskSubmission((url, value) => request(DB, url, { method: 'POST', body: value }), body);
  }
  const headers = {};
  if (auth !== null) headers.Authorization = `Bearer ${auth}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return worker.fetch(new Request(`http://localhost${path}`, {
    method, headers, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }), { DB, API_TOKEN: envToken });
}

test('A01/A02 类型来自数据库，创建与查询保留JSON和说明，不伪造执行', async t => {
  const { DB, sqlite } = fixture(t);
  const list = await request(DB, '/api/tasklist');
  assert.equal(list.status, 200);
  const { tasklist } = await list.json();
  assert.equal(tasklist.length, 1);
  assert.equal(tasklist[0].parameter_spec.drive.required, true);
  assert.match(tasklist[0].procedure, /目标 Windows PC/);
  assert.ok(tasklist[0].report_spec);
  sqlite.prepare('UPDATE tasklist SET name = ? WHERE type = ?').run('从D1读取的名称', 'mock.echo');
  const response = await request(DB, '/api/tasks', { method: 'POST', body: valid() });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.status, 'PENDING');
  assert.equal(created.attempt_count, 0);
  assert.equal(created.result, null);
  assert.equal(created.error, null);
  assert.deepEqual(created.params, { drive: 'C:' });
  assert.equal(created.definition.name, '从D1读取的名称');
  assert.equal(created.target_device.display_name, device);
  assert.match(created.created_at, /Z$/);
  initializeDatabase(sqlite);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 1);
  const queried = await request(DB, `/api/tasks/${created.task_id}`);
  assert.deepEqual(await queried.json(), created);
});

test('A03 文件数据库关闭重开后任务存在，设备改名不改变归属', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'companion-task-test-'));
  const path = join(directory, 'tasks.sqlite');
  let database;
  try {
    database = openTestDatabase(path);
    initializeDatabase(database.sqlite); seedMockTask(database.sqlite);
    database.sqlite.prepare('INSERT INTO devices VALUES (?, ?, NULL, ?)').run(device, 'TEST-PC', new Date().toISOString());
    const created = await (await request(database.DB, '/api/tasks', { method: 'POST', body: valid() })).json();
    database.close();
    database = openTestDatabase(path);
    database.sqlite.prepare('UPDATE devices SET alias = ? WHERE device_id = ?').run('homepc', device);
    const found = await (await request(database.DB, `/api/tasks/${created.task_id}`)).json();
    assert.equal(found.task_id, created.task_id);
    assert.equal(found.target_device_id, device);
    assert.equal(found.target_device.display_name, 'homepc');
    assert.deepEqual(found.params, { drive: 'C:' });
  } finally {
    database?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('A04 无效JSON、参数、类型、目标与状态注入不新增任务', async t => {
  const { DB, sqlite } = fixture(t);
  const cases = [
    ['{', 400], [null, 400], [[], 400], [{}, 400],
    [{ ...valid(), params: [] }, 400], [{ ...valid(), params: {} }, 400],
    [{ ...valid(), params: { drive: 'C:/Windows' } }, 400],
    [{ ...valid(), params: { drive: 'C:', extra: true } }, 400],
    [{ ...valid(), type: 'unknown' }, 404],
    [{ ...valid(), target_device_id: null }, 400],
    [{ ...valid(), target_device_id: 'unknown' }, 404],
    [{ ...valid(), status: 'COMPLETED' }, 400],
    [{ ...valid(), attempt_count: 2 }, 400],
    [{ ...valid(), result: { success: true } }, 400],
  ];
  for (const [body, status] of cases) {
    const response = await request(DB, '/api/tasks', { method: 'POST', body });
    assert.equal(response.status, status, JSON.stringify(body));
  }
  sqlite.prepare(`INSERT INTO tasklist SELECT 'future.tool', name, description, executor,
    parameter_spec_json, procedure, report_spec FROM tasklist WHERE type = 'mock.echo'`).run();
  sqlite.prepare('UPDATE tasklist SET parameter_spec_json = ? WHERE type = ?').run('{"drive":{"type":"object"}}', 'future.tool');
  assert.equal((await request(DB, '/api/tasks', { method: 'POST', body: { ...valid(), type: 'future.tool' } })).status, 500);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 0);
});

test('A04 云端类型不能携带PC目标', async t => {
  const { DB, sqlite } = fixture(t);
  sqlite.prepare("UPDATE tasklist SET executor = 'cloud' WHERE type = 'mock.echo'").run();
  assert.equal((await request(DB, '/api/tasks', { method: 'POST', body: valid() })).status, 400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 0);
});

test('A05 API未认证和缺配置均拒绝，不泄露秘密', async t => {
  const { DB } = fixture(t);
  for (const path of ['/api/tasklist', '/api/tasks', '/api/tasks/missing', '/api/devices', '/api/unknown']) {
    for (const config of [{ auth: null }, { auth: 'wrong' }, { envToken: '' }, { envToken: '   ' }]) {
      const response = await request(DB, path, config);
      assert.equal(response.status, 401);
      assert.equal((await response.text()).includes(token), false);
    }
  }
  const response = await worker.fetch(new Request('http://localhost/api/tasklist'), { DB });
  assert.equal(response.status, 401);
});

test('A06 不存在任务、错误方法和内部错误返回明确安全响应', async t => {
  const { DB } = fixture(t);
  assert.equal((await request(DB, '/api/tasks/missing')).status, 404);
  for (const [path, method, allow] of [
    ['/api/tasklist', 'POST', 'GET'], ['/api/tasks', 'GET', 'POST'], ['/api/tasks/id', 'DELETE', 'GET'],
  ]) {
    const response = await request(DB, path, { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), allow);
  }
  const response = await request({ prepare() { throw new Error(`SQL sensitive ${token}`); } }, '/api/tasklist');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: '处理失败，请稍后重试' } });
});

test('A07 正式SQL拒绝无效外键、JSON和执行次数', t => {
  const { sqlite } = fixture(t);
  const insert = sqlite.prepare(`INSERT INTO tasks
    (task_id, type, target_device_id, params_json, status, attempt_count, created_at, result_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const base = () => [crypto.randomUUID(), 'mock.echo', device, '{"drive":"C:"}', 'PENDING', 0, new Date().toISOString(), null];
  for (const [index, value] of [[1, 'missing'], [2, 'missing'], [3, '{'], [4, 'MADE_UP'], [5, 3], [5, -1], [5, 1.5], [7, '{']]) {
    const args = base(); args[index] = value;
    assert.throws(() => insert.run(...args));
  }
  for (const attempts of [0, 1, 2]) {
    const args = base(); args[5] = attempts; insert.run(...args);
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 3);
});
