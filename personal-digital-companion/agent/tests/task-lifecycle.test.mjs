import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker.mjs';
import { openTestDatabase, initializeDatabase } from './sqlite-d1.mjs';
import { seedMockTask, withTaskSubmission } from './fixtures.mjs';
import { createTaskExecutor } from '../execution/runner.mjs';
import { createTaskSync } from '../execution/sync.mjs';
import { DEADLINE_GRACE_MS } from '../tasks/deadline.mjs';

const device = 'pc-12345678-1234-4123-8123-123456789abc';
const token = `test-${crypto.randomUUID()}`;
const deadlineJst = '2026-11-18T18:00:00+09:00';
const deadlineUtc = '2026-11-18T09:00:00.000Z';
const cutoff = Date.parse(deadlineUtc) + DEADLINE_GRACE_MS;
function setup(t) {
  const db = openTestDatabase(); initializeDatabase(db.sqlite);
  seedMockTask(db.sqlite, { type: 'mock.unit', spec: { value: { type: 'string', required: true } } });
  db.sqlite.prepare('INSERT INTO devices VALUES (?, ?, NULL, ?)').run(device, 'TEST-PC', new Date().toISOString());
  t.after(() => db.close()); return db;
}
async function call(DB, path, body, method = body === undefined ? 'GET' : 'POST', authenticated = true) {
  if (path === '/api/tasks' && method === 'POST' && authenticated) {
    body = await withTaskSubmission((url, value) => call(DB, url, value), body);
  }
  return worker.fetch(new Request(`https://example.test${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { DB, API_TOKEN: token });
}
async function create(DB, extra = {}) {
  const response = await call(DB, '/api/tasks', { type: 'mock.unit', target_device_id: device, params: { value: 'example' }, ...extra });
  assert.equal(response.status, 201); return response.json();
}
const cancel = (DB, id) => call(DB, `/api/tasks/${id}/cancel`, {});
const claim = (DB, id) => call(DB, `/api/tasks/${id}/claim`, { device_id: device });
const snapshot = sqlite => ['tasks', 'executions', 'task_activity'].map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY task_id`).all());

test('C01：只取消PENDING，重复取消成功且保留历史，cloud同样可取消', async t => {
  const { DB, sqlite } = setup(t); const task = await create(DB);
  const response = await cancel(DB, task.task_id);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.cancelled, true); assert.equal(body.task.status, 'CANCELLED');
  assert.equal(body.task.can_claim, false); assert.deepEqual(body.task.params, task.params);
  assert.equal(body.task.activity, null); assert.deepEqual(body.task.executions, []);
  const unchanged = snapshot(sqlite);
  assert.equal((await cancel(DB, task.task_id)).status, 200); assert.deepEqual(snapshot(sqlite), unchanged);
  assert.equal((await cancel(DB, 'missing')).status, 404);
  for (const value of [null, [], { device_id: device }, { reason: 'wrong' }]) {
    assert.equal((await call(DB, `/api/tasks/${task.task_id}/cancel`, value)).status, 400);
  }
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/cancel`)).status, 405);
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/cancel`, {}, 'POST', false)).status, 401);
  const malformed = await worker.fetch(new Request(`https://example.test/api/tasks/${task.task_id}/cancel`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{',
  }), { DB, API_TOKEN: token });
  assert.equal(malformed.status, 400);
  for (const state of ['RUNNING', 'COMPLETED', 'FAILED', 'EXPIRED']) {
    const other = await create(DB); sqlite.prepare('UPDATE tasks SET status=? WHERE task_id=?').run(state, other.task_id);
    const before = snapshot(sqlite); assert.equal((await cancel(DB, other.task_id)).status, 409); assert.deepEqual(snapshot(sqlite), before);
  }
  seedMockTask(sqlite, { type: 'mock.cloud', executor: 'cloud', spec: { value: { type: 'string', required: true } } });
  const cloud = await create(DB, { type: 'mock.cloud', target_device_id: null });
  assert.equal((await cancel(DB, cloud.task_id)).status, 200);
});

test('C02：取消与领取竞争、读后状态变化，不能同时成功', async t => {
  const { DB } = setup(t);
  let task = await create(DB);
  assert.equal((await cancel(DB, task.task_id)).status, 200); assert.equal((await claim(DB, task.task_id)).status, 409);
  task = await create(DB);
  assert.equal((await claim(DB, task.task_id)).status, 200); assert.equal((await cancel(DB, task.task_id)).status, 409);
  task = await create(DB);
  assert.deepEqual((await Promise.all([cancel(DB, task.task_id), claim(DB, task.task_id)])).map(r => r.status).sort(), [200, 409]);
  task = await create(DB);
  const cancelAfterRead = { ...DB, prepare(sql) {
    const prepared = DB.prepare(sql);
    if (!sql.startsWith("UPDATE tasks SET status = 'CANCELLED'")) return prepared;
    return { bind(...args) {
      const bound = prepared.bind(...args);
      return { ...bound, async run() { assert.equal((await claim(DB, task.task_id)).status, 200); return bound.run(); } };
    } };
  } };
  assert.equal((await cancel(cancelAfterRead, task.task_id)).status, 409);
  task = await create(DB);
  const claimAfterRead = { ...DB, async batch(statements) {
    assert.equal((await cancel(DB, task.task_id)).status, 200); return DB.batch(statements);
  } };
  assert.equal((await claim(claimAfterRead, task.task_id)).status, 409);
});

test('D01：可选截止、JST/显式偏移规范UTC，非法日期与无时区拒绝', async t => {
  const { DB, sqlite } = setup(t);
  assert.equal((await create(DB)).deadline_at, null);
  assert.equal((await create(DB, { deadline_at: null })).deadline_at, null);
  for (const value of [deadlineJst, '2026-11-18T18:00+09:00', deadlineUtc, '2026-11-18T04:00:00-05:00']) {
    assert.equal((await create(DB, { deadline_at: value })).deadline_at, deadlineUtc);
  }
  assert.equal((await create(DB, { deadline_at: '2024-02-29T23:59:59.9+09:00' })).deadline_at, '2024-02-29T14:59:59.900Z');
  const count = sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;
  for (const value of ['', 0, true, {}, '2026-11-18', '2026-11-18T18:00:00', '2026-02-29T18:00:00+09:00',
    '2026-04-31T18:00:00Z', '2026-00-18T18:00:00Z', '2026-13-18T18:00:00Z', '2026-11-00T18:00:00Z',
    '2026-11-18T24:00:00Z', '2026-11-18T18:60:00Z', '2026-11-18T18:00:60Z', '2026-11-18T18:00:00+24:00',
    '2026-11-18T18:00:00+09:60', '2026-11-18 18:00:00+09:00', ' 2026-11-18T18:00:00Z']) {
    const response = await call(DB, '/api/tasks', { type: 'mock.unit', target_device_id: device, params: { value: 'example' }, deadline_at: value });
    assert.equal(response.status, 400, String(value));
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, count);
});

test('D02：截止/宽限前1ms/恰好7天/之后，SQL与详情列表一致且查询不写库', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(deadlineUtc) });
  const { DB, sqlite } = setup(t);
  for (const [now, allowed] of [[Date.parse(deadlineUtc), true], [cutoff - 1, true], [cutoff, false], [cutoff + 1, false]]) {
    t.mock.timers.setTime(now);
    const task = await create(DB, { deadline_at: deadlineJst });
    assert.equal(task.can_claim, allowed);
    const before = snapshot(sqlite);
    assert.equal((await (await call(DB, `/api/tasks/${task.task_id}`)).json()).can_claim, allowed);
    const list = await (await call(DB, `/api/devices/${device}/tasks`)).json();
    assert.equal(list.tasks.find(row => row.task_id === task.task_id).can_claim, allowed);
    assert.deepEqual(snapshot(sqlite), before);
    assert.equal((await claim(DB, task.task_id)).status, allowed ? 200 : 409);
    if (!allowed) assert.deepEqual(snapshot(sqlite), before);
  }
  const forever = await create(DB); assert.equal(forever.can_claim, false); assert.equal((await claim(DB, forever.task_id)).status, 409); // 两个已领取占满名额。
  seedMockTask(sqlite, { type: 'disk.query' });
  sqlite.prepare(`INSERT INTO tasks (task_id,type,target_device_id,params_json,status,created_at)
    VALUES ('old-disk','disk.query',?,'{"drive":"C:"}','PENDING',?)`).run(device, new Date().toISOString());
  assert.equal((await (await call(DB, '/api/tasks/old-disk')).json()).can_claim, false);
  const overview = (await (await call(DB, '/api/devices')).json()).devices.find(row => row.device_id === device);
  assert.equal(overview.task_summary.active_count, 6); // 仍是PENDING+RUNNING，不是可领取数。
});

test('D02：预查询后截止改变仍由UPDATE中的原子条件拒绝', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: cutoff });
  const { DB, sqlite } = setup(t); const task = await create(DB);
  const staleReadDB = { ...DB, async batch(statements) {
    sqlite.prepare('UPDATE tasks SET deadline_at=? WHERE task_id=?').run(deadlineUtc, task.task_id);
    return DB.batch(statements);
  } };
  assert.equal((await claim(staleReadDB, task.task_id)).status, 409);
  assert.equal(sqlite.prepare('SELECT status FROM tasks WHERE task_id=?').get(task.task_id).status, 'PENDING');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM task_activity').get().n, 0);
});

test('D03：已RUNNING越过7天仍可核对/进度/结果及补传', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: cutoff - 1 });
  const { DB, sqlite } = setup(t); const task = await create(DB, { deadline_at: deadlineJst });
  const firstClaim = await (await claim(DB, task.task_id)).json();
  t.mock.timers.setTime(cutoff + 1000);
  const checked = await (await call(DB, `/api/tasks/${task.task_id}/claim`, {device_id:device,request_id:firstClaim.claimReceipt.request_id})).json();
  assert.equal(checked.claimed, true); assert.equal(checked.task.can_claim, false);
  assert.equal((await claim(DB, task.task_id)).status,409);
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/progress`, { device_id: device, message: '继续处理中' })).status, 200);
  const execution = { execution_id: crypto.randomUUID(), task_id: task.task_id, attempt_no: 1, status: 'COMPLETED',
    started_at: new Date(cutoff - 1).toISOString(), finished_at: new Date().toISOString(), result: { ok: true }, error: null };
  const body = { device_id: device, status: 'COMPLETED', attempt_count: 1, result: execution.result, error: null, executions: [execution] };
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/result`, body)).status, 200);
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/result`, body)).status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM executions').get().n, 1);
});

test('D04：sync对取消/宽限已满不执行handler，其他任务仍正常', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: cutoff });
  const { DB } = setup(t); let runs = 0;
  const executor = createTaskExecutor({ databasePath: ':memory:', deviceId: device,
    handlers: { 'mock.unit': { risk: 'L1', validate() {}, async execute(params) { runs++; return { value: params.value }; } } } });
  t.after(() => executor.close());
  const request = (path, options = {}) => worker.fetch(new Request(`https://example.test${path}`, {
    ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` },
  }), { DB, API_TOKEN: token });
  const sync = createTaskSync({ request, executor, deviceId: device });
  const cancelled = await create(DB); await cancel(DB, cancelled.task_id);
  await assert.rejects(sync.syncTask(cancelled.task_id), /不可执行/);
  const expired = await create(DB, { deadline_at: deadlineJst });
  await assert.rejects(sync.syncTask(expired.task_id), { status: 409, code: 'TASK_DEADLINE_PASSED' });
  assert.equal(runs, 0); assert.equal(executor.getTask(expired.task_id).attempt_count, 0);
  const normal = await create(DB); assert.equal((await sync.syncTask(normal.task_id)).task.status, 'COMPLETED');
  assert.equal(runs, 1);
});

test('R01：001至003旧数据单次升级004，无截止NULL且重复初始化不重复ALTER', t => {
  const db = openTestDatabase(); t.after(() => db.close());
  for (const migration of ['001-task-units.sql', '002-executions.sql', '003-task-activity.sql']) {
    db.sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  seedMockTask(db.sqlite);
  db.sqlite.prepare('INSERT INTO devices VALUES (?, ?, NULL, ?)').run(device, 'OLD-PC', deadlineUtc);
  db.sqlite.prepare(`INSERT INTO tasks (task_id,type,target_device_id,params_json,status,created_at)
    VALUES ('old-task','mock.echo',?,'{"drive":"C:"}','PENDING',?)`).run(device, deadlineUtc);
  const sql = readFileSync(new URL('../migrations/004-task-deadline.sql', import.meta.url), 'utf8');
  db.sqlite.exec(sql);
  const row = db.sqlite.prepare("SELECT * FROM tasks WHERE task_id='old-task'").get();
  assert.equal(row.deadline_at, null); assert.equal(row.status, 'PENDING');
  assert.throws(() => db.sqlite.exec(sql), /duplicate column/);
  initializeDatabase(db.sqlite);
  assert.deepEqual({...db.sqlite.prepare("SELECT * FROM tasks WHERE task_id='old-task'").get()}, {...row,chain_node_id:null,superseded_by_task_id:null,claim_request_id:null,submission_id:null,dispatch_all:0});
});
