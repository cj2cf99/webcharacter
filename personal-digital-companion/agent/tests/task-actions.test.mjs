import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';
import { openTestDatabase, initializeDatabase } from './sqlite-d1.mjs';
import { seedMockTask, withTaskSubmission } from './fixtures.mjs';

const device = 'pc-12345678-1234-4123-8123-123456789abc';
const otherDevice = 'pc-22345678-1234-4123-8123-123456789abc';
const token = `test-${crypto.randomUUID()}`;
function setup(t, seed = true) {
  const db = openTestDatabase(); initializeDatabase(db.sqlite);
  if (seed) seedMockTask(db.sqlite, { type: 'mock.unit', spec: { value: { type: 'string', required: true } } });
  db.sqlite.prepare('INSERT INTO devices VALUES (?, ?, NULL, ?)').run(device, 'TEST-PC', new Date().toISOString());
  t.after(() => db.close()); return db;
}
async function call(DB, path, body, method = body === undefined ? 'GET' : 'POST', authorized = true) {
  if (path === '/api/tasks' && method === 'POST' && authorized) {
    body = await withTaskSubmission((url, value) => call(DB, url, value), body);
  }
  return worker.fetch(new Request(`https://example.test${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { DB, API_TOKEN: token });
}
async function create(DB, extra = {}) {
  const response = await call(DB, '/api/tasks', { type: 'mock.unit', target_device_id: device, params: { value: 'hello' }, ...extra });
  assert.equal(response.status, 201); return response.json();
}
const claim = (DB, id, body = { device_id: device }) => call(DB, `/api/tasks/${id}/claim`, body);
const report = (DB, id, body) => call(DB, `/api/tasks/${id}/result`, body);
function result(id, outcome = 'COMPLETED', attempts = 1) {
  const executions = Array.from({ length: attempts }, (_, index) => {
    const status = index < attempts - 1 ? 'FAILED' : outcome;
    return { execution_id: crypto.randomUUID(), task_id: id, attempt_no: index + 1, status,
      started_at: `2026-11-18T00:00:0${index}.000Z`, finished_at: `2026-11-18T00:00:0${index}.100Z`,
      result: status === 'COMPLETED' ? { value: 'hello', nested: [true, null, 2] } : null,
      error: status === 'FAILED' ? '任务执行失败' : null };
  });
  const last = executions.at(-1);
  return { device_id: device, status: outcome, attempt_count: attempts, result: last.result, error: last.error, executions };
}

test('B01：默认空业务种子；暂停disk不新建/领取，不删除旧记录', async t => {
  const { DB, sqlite } = setup(t, false);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM tasklist').get().n, 0);
  seedMockTask(sqlite, { type: 'disk.query' });
  sqlite.prepare(`INSERT INTO tasks (task_id,type,target_device_id,params_json,status,created_at)
    VALUES ('old-disk','disk.query',?,'{"drive":"C:"}','PENDING',?)`).run(device, new Date().toISOString());
  initializeDatabase(sqlite);
  assert.deepEqual((await (await call(DB, '/api/tasklist')).json()).tasklist, []);
  assert.equal((await (await call(DB, '/api/tasks/old-disk')).json()).type, 'disk.query');
  assert.equal((await call(DB, '/api/tasks', { type: 'disk.query', target_device_id: device, params: { drive: 'C:' } })).status, 409);
  assert.equal((await claim(DB, 'old-disk')).status, 409);
  assert.equal(sqlite.prepare('SELECT status FROM tasks WHERE task_id=?').get('old-disk').status, 'PENDING');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM tasklist').get().n, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 1);
});

test('B02：条件领取同时请求仅一次true，目标/状态/认证校验不改任务', async t => {
  const { DB, sqlite } = setup(t);
  const task = await create(DB);
  for (const body of [{ device_id: otherDevice }, { device_id: device, extra: true }, { device_id: 'web-bad' }]) {
    assert.ok([400, 409].includes((await claim(DB, task.task_id, body)).status));
  }
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/claim`, { device_id: device }, 'POST', false)).status, 401);
  assert.equal(sqlite.prepare('SELECT status FROM tasks WHERE task_id=?').get(task.task_id).status, 'PENDING');
  const both = await Promise.all([claim(DB, task.task_id), claim(DB, task.task_id)]);
  const values = await Promise.all(both.map(response => response.json()));
  assert.deepEqual(both.map(v => v.status).sort(), [200, 409]);
  assert.equal(values.filter(v => v.claimed && v.task.status === 'RUNNING').length, 1);
  assert.equal((await claim(DB, 'missing')).status, 404);
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/claim`)).status, 405);
  sqlite.prepare("UPDATE tasks SET status='CANCELLED' WHERE task_id=?").run(task.task_id);
  assert.equal((await claim(DB, task.task_id)).status, 409);
});

test('B03/B04：首次成功、第二次成功和两次失败保存；同回执只ack不重复', async t => {
  const { DB, sqlite } = setup(t);
  for (const [outcome, attempts] of [['COMPLETED', 1], ['COMPLETED', 2], ['FAILED', 2]]) {
    const task = await create(DB); await claim(DB, task.task_id);
    const body = result(task.task_id, outcome, attempts);
    const [first, duplicate] = await Promise.all([report(DB, task.task_id, body), report(DB, task.task_id, body)]);
    for (const response of [first, duplicate]) {
      assert.equal(response.status, 200);
      const saved = await response.json();
      assert.equal(saved.acknowledged, true);
      assert.equal(saved.task.status, outcome);
      assert.equal(saved.task.attempt_count, attempts);
      assert.deepEqual(saved.task.executions, body.executions);
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM executions WHERE task_id=?').get(task.task_id).n, attempts);
    const conflicting = structuredClone(body);
    conflicting.executions[0].execution_id = crypto.randomUUID();
    assert.equal((await report(DB, task.task_id, conflicting)).status, 409);
    const original = await (await call(DB, `/api/tasks/${task.task_id}`)).json();
    assert.deepEqual(original.executions, body.executions);
  }
});

test('B03：非法结果、次数、顺序、时间、目标与秘密错误全部拒绝', async t => {
  const { DB, sqlite } = setup(t);
  const task = await create(DB);
  assert.equal((await report(DB, task.task_id, result(task.task_id))).status, 409);
  await claim(DB, task.task_id);
  const mutations = [
    b => { b.attempt_count = 3; }, b => { b.attempt_count = 1; },
    b => { b.status = 'PENDING'; }, b => { b.extra = true; },
    b => { b.executions[0].attempt_no = 2; }, b => { b.executions[1].execution_id = b.executions[0].execution_id; },
    b => { b.executions[0].task_id = 'other'; }, b => { b.executions[0].finished_at = '2026-11-17T00:00:00.000Z'; },
    b => { b.executions[0].started_at = '2026-11-18T00:00:00+00:00'; },
    b => { b.executions[1].started_at = '2026-11-18T00:00:00.000Z'; },
    b => { b.executions[0].error = 'raw secret'; }, b => { b.error = null; },
    b => { b.executions[0].result = { hidden: true }; }, b => { b.result = 'wrong'; },
    b => { b.executions[0].status = 'COMPLETED'; b.executions[0].error = null; },
  ];
  for (const mutate of mutations) {
    const body = result(task.task_id, 'FAILED', 2); mutate(body);
    assert.equal((await report(DB, task.task_id, body)).status, 400);
  }
  const wrong = result(task.task_id); wrong.device_id = otherDevice;
  assert.equal((await report(DB, task.task_id, wrong)).status, 409);
  const nonfinite = JSON.stringify(result(task.task_id)).replace('"hello"', '1e400');
  const bad = await worker.fetch(new Request(`https://example.test/api/tasks/${task.task_id}/result`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: nonfinite,
  }), { DB, API_TOKEN: token });
  assert.equal(bad.status, 400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM executions').get().n, 0);
  assert.equal(sqlite.prepare('SELECT status FROM tasks WHERE task_id=?').get(task.task_id).status, 'RUNNING');
});

test('B03：第二条尝试写入失败或execution_id冲突时全部回滚', async t => {
  const { DB, sqlite } = setup(t);
  const task = await create(DB); await claim(DB, task.task_id);
  sqlite.exec("CREATE TRIGGER fail_second BEFORE INSERT ON executions WHEN NEW.attempt_no = 2 BEGIN SELECT RAISE(ABORT, 'injected'); END;");
  assert.equal((await report(DB, task.task_id, result(task.task_id, 'FAILED', 2))).status, 500);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM executions').get().n, 0);
  assert.equal(sqlite.prepare('SELECT status FROM tasks WHERE task_id=?').get(task.task_id).status, 'RUNNING');
  sqlite.exec('DROP TRIGGER fail_second');
  const other = await create(DB); await claim(DB, other.task_id);
  const otherReport = result(other.task_id);
  assert.equal((await report(DB, other.task_id, otherReport)).status, 200);
  const collision = result(task.task_id, 'FAILED', 2);
  collision.executions[1].execution_id = otherReport.executions[0].execution_id;
  assert.equal((await report(DB, task.task_id, collision)).status, 500);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM executions WHERE task_id=?').get(task.task_id).n, 0);
  assert.equal(sqlite.prepare('SELECT status FROM tasks WHERE task_id=?').get(task.task_id).status, 'RUNNING');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM executions').get().n, 1);
});

test('B04：不同回执竞争只保存一份，同结果不同JSON键顺序不冲突', async t => {
  const { DB, sqlite } = setup(t);
  const task = await create(DB); await claim(DB, task.task_id);
  const original = result(task.task_id);
  const changed = structuredClone(original);
  changed.result = { value: 'different' }; changed.executions[0].result = changed.result;
  const statuses = (await Promise.all([report(DB, task.task_id, original), report(DB, task.task_id, changed)])).map(r => r.status).sort();
  assert.deepEqual(statuses, [200, 409]);
  const saved = await (await call(DB, `/api/tasks/${task.task_id}`)).json();
  const body = { device_id: device, status: saved.status, attempt_count: saved.attempt_count,
    result: saved.result, error: saved.error, executions: saved.executions };
  body.result = Object.fromEntries(Object.entries(body.result).reverse());
  body.executions[0].result = Object.fromEntries(Object.entries(body.executions[0].result).reverse());
  assert.equal((await report(DB, task.task_id, body)).status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM executions').get().n, 1);
});

test('B01/B03：通用参数仅支持规定类型，坏定义明确报错', async t => {
  const { DB, sqlite } = setup(t, false);
  seedMockTask(sqlite, { type: 'mock.unit', spec: {
    value: { type: 'string', required: true, pattern: '^ok$' }, count: { type: 'number' }, flag: { type: 'boolean' },
  } });
  await create(DB, { params: { value: 'ok', count: 2, flag: false } });
  await create(DB, { params: { value: 'ok' } });
  for (const params of [{ value: 'bad' }, { value: 'ok', count: '2' }, { value: 'ok', flag: 0 }, { value: 'ok', extra: true }, {}]) {
    assert.equal((await call(DB, '/api/tasks', { type: 'mock.unit', target_device_id: device, params })).status, 400);
  }
  for (const spec of [[], null, { x: { type: 'object' } }, { x: { type: 'number', pattern: 'x' } },
    { x: { type: 'string', pattern: '[' } }, { x: { type: 'string', required: 'yes' } }, { x: { type: 'string', extra: true } }]) {
    sqlite.prepare('UPDATE tasklist SET parameter_spec_json=? WHERE type=?').run(JSON.stringify(spec), 'mock.unit');
    const response = await call(DB, '/api/tasks', { type: 'mock.unit', target_device_id: device, params: {} });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.code, 'TYPE_CONFIGURATION_ERROR');
  }
});
