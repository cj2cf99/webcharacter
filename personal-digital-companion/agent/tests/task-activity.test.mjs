import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import worker from '../worker.mjs';
import { openTestDatabase, initializeDatabase } from './sqlite-d1.mjs';
import { seedMockTask, withTaskSubmission } from './fixtures.mjs';

const device = 'pc-12345678-1234-4123-8123-123456789abc';
const other = 'pc-22345678-1234-4123-8123-123456789abc';
const web = 'web-32345678-1234-4123-8123-123456789abc';
const token = `test-${crypto.randomUUID()}`;
const oldTime = '2000-01-01T00:00:00.000Z';
function setup(t) {
  const db = openTestDatabase(); initializeDatabase(db.sqlite);
  seedMockTask(db.sqlite, { type: 'mock.unit', spec: { value: { type: 'string', required: true } } });
  for (const id of [device, other, web]) db.sqlite.prepare('INSERT INTO devices VALUES (?, ?, NULL, ?)').run(id, 'TEST', oldTime);
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
async function create(DB) {
  const response = await call(DB, '/api/tasks', { type: 'mock.unit', target_device_id: device, params: { value: 'test' } });
  assert.equal(response.status, 201); return response.json();
}
const claim = (DB, id) => call(DB, `/api/tasks/${id}/claim`, { device_id: device });
const progress = (DB, id, message = '已读取输入') => call(DB, `/api/tasks/${id}/progress`, { device_id: device, message });
const activity = (sqlite, id) => sqlite.prepare('SELECT * FROM task_activity WHERE task_id=?').get(id);
const snapshot = sqlite => ['tasks', 'executions', 'task_activity'].map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY task_id`).all());
function outcome(id) {
  const execution = { execution_id: crypto.randomUUID(), task_id: id, attempt_no: 1,
    status: 'COMPLETED', started_at: '2026-11-18T00:00:00.000Z', finished_at: '2026-11-18T00:00:00.100Z', result: { ok: true }, error: null };
  return { device_id: device, status: 'COMPLETED', attempt_count: 1, result: execution.result, error: null, executions: [execution] };
}

test('R01/R04：无activity不造历史，多任务与改名归属不变', async t => {
  const { DB, sqlite } = setup(t);
  const empty = await (await call(DB, '/api/devices')).json();
  assert.ok(empty.devices.every(d => d.task_summary.active_count === 0 && d.task_summary.last_task_update === null));
  const a = await create(DB); const b = await create(DB);
  assert.equal(a.activity, null); assert.equal(b.activity, null);
  const before = snapshot(sqlite); initializeDatabase(sqlite); assert.deepEqual(snapshot(sqlite), before);
  await call(DB, `/api/devices/${device}`, { alias: 'homepc' }, 'PATCH');
  let list = await (await call(DB, `/api/devices/${device}/tasks`)).json();
  assert.equal(list.device.display_name, 'homepc');
  assert.deepEqual(new Set(list.tasks.map(task => task.task_id)), new Set([a.task_id, b.task_id]));
  assert.ok(list.tasks.every(task => task.updated_at === null && task.progress_message === null));
  await claim(DB, a.task_id); await claim(DB, b.task_id);
  list = await (await call(DB, `/api/devices/${device}/tasks`)).json();
  assert.equal(list.tasks.filter(task => task.status === 'RUNNING').length, 2);
  const overview = (await (await call(DB, '/api/devices')).json()).devices.find(d => d.device_id === device);
  assert.equal(overview.task_summary.active_count, 2);
  assert.equal(overview.task_summary.last_task_update, sqlite.prepare('SELECT MAX(updated_at) AS t FROM task_activity').get().t);
});

test('R02：claim/progress/result与重复回执更新，GET/改名/认领不刷新', async t => {
  const { DB, sqlite } = setup(t);
  const task = await create(DB);
  assert.equal((await claim(DB, task.task_id)).status, 200);
  assert.equal(activity(sqlite, task.task_id).event, 'claim');
  sqlite.prepare('UPDATE task_activity SET updated_at=?').run(oldTime);
  const update = await progress(DB, task.task_id, ' 已读取输入 ');
  assert.equal(update.status, 200);
  const body = await update.json();
  assert.match(body.updated_at, /Z$/); assert.notEqual(body.updated_at, oldTime);
  assert.equal(body.progress_message, '已读取输入');
  let detail = await (await call(DB, `/api/tasks/${task.task_id}`)).json();
  assert.equal(detail.status, 'RUNNING'); assert.equal(detail.attempt_count, 0); assert.deepEqual(detail.executions, []);
  assert.equal(detail.activity.event, 'progress');
  const unchanged = activity(sqlite, task.task_id);
  await call(DB, '/api/devices'); await call(DB, `/api/devices/${device}/tasks`);
  await call(DB, `/api/devices/${device}`, { alias: 'homepc' }, 'PATCH');
  await call(DB, '/api/terminal/claim', { device_id: device });
  assert.deepEqual(activity(sqlite, task.task_id), unchanged);
  sqlite.prepare('UPDATE task_activity SET updated_at=?').run(oldTime);
  assert.equal((await claim(DB, task.task_id)).status,409);
  assert.equal(activity(sqlite, task.task_id).updated_at, oldTime);
  assert.equal(activity(sqlite, task.task_id).progress_message, '已读取输入');
  const result = outcome(task.task_id);
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/result`, result)).status, 200);
  assert.equal(activity(sqlite, task.task_id).event, 'result');
  sqlite.prepare('UPDATE task_activity SET updated_at=?').run(oldTime);
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/result`, result)).status, 200);
  assert.notEqual(activity(sqlite, task.task_id).updated_at, oldTime);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM executions').get().n, 1);
  detail = await (await call(DB, `/api/tasks/${task.task_id}`)).json();
  assert.equal(detail.status, 'COMPLETED');
  const list = await (await call(DB, `/api/devices/${device}/tasks`)).json();
  assert.equal(list.tasks[0].status, 'COMPLETED');
  assert.equal(list.tasks[0].progress_message, null);
  assert.equal((await (await call(DB, '/api/devices')).json()).devices.find(d => d.device_id === device).task_summary.active_count, 0);
});

test('R03：无效进度、错误目标与终态拒绝且快照不变', async t => {
  const { DB, sqlite } = setup(t); const task = await create(DB);
  assert.equal((await progress(DB, task.task_id)).status, 409);
  assert.equal(activity(sqlite, task.task_id), undefined);
  await claim(DB, task.task_id); await progress(DB, task.task_id);
  const before = snapshot(sqlite);
  for (const body of [null, {}, { device_id: device, message: '' }, { device_id: device, message: ' '.repeat(5) },
    { device_id: device, message: '\n' }, { device_id: device, message: '字'.repeat(201) },
    { device_id: device, message: 'ok', updated_at: oldTime }, { device_id: device, message: 'ok', status: 'COMPLETED' },
    { device_id: device, message: 42 }, { device_id: web, message: 'ok' }, { device_id: other, message: 'ok' }]) {
    const response = await call(DB, `/api/tasks/${task.task_id}/progress`, body);
    assert.ok([400, 409].includes(response.status)); assert.deepEqual(snapshot(sqlite), before);
  }
  const badJSON = await worker.fetch(new Request(`https://example.test/api/tasks/${task.task_id}/progress`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{',
  }), { DB, API_TOKEN: token });
  assert.equal(badJSON.status, 400); assert.deepEqual(snapshot(sqlite), before);
  assert.equal((await progress(DB, 'missing')).status, 404);
  assert.equal((await progress(DB, task.task_id, '😀'.repeat(200))).status, 200);
  const result = outcome(task.task_id); await call(DB, `/api/tasks/${task.task_id}/result`, result);
  const final = snapshot(sqlite);
  assert.equal((await progress(DB, task.task_id)).status, 409);
  const conflict = structuredClone(result); conflict.executions[0].execution_id = crypto.randomUUID();
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/result`, conflict)).status, 409);
  assert.deepEqual(snapshot(sqlite), final);
});

test('R05：摘要MAX与50条分页稳定，无静态遗漏或全部详情负载', async t => {
  const { DB, sqlite } = setup(t);
  const insert = sqlite.prepare(`INSERT INTO tasks (task_id,type,target_device_id,params_json,status,created_at)
    VALUES (?,'mock.unit',?,'{"value":"test"}',?,?)`);
  for (let i = 0; i < 105; i++) insert.run(`t-${String(i).padStart(3, '0')}`, device, i < 65 ? (i % 2 ? 'PENDING' : 'RUNNING') : 'COMPLETED', `2026-11-18T00:00:${String(i % 60).padStart(2, '0')}.000Z`);
  sqlite.prepare("INSERT INTO task_activity VALUES (? ,?,'progress',?)").run('t-001', '2026-11-18T01:00:00.000Z', '最后更新');
  const overview = (await (await call(DB, '/api/devices')).json()).devices.find(d => d.device_id === device);
  assert.deepEqual(overview.task_summary, { active_count: 65, last_task_update: '2026-11-18T01:00:00.000Z' });
  const items = []; let offset = 0;
  const sizes = [];
  while (offset !== null) {
    const page = await (await call(DB, `/api/devices/${device}/tasks?offset=${offset}`)).json();
    sizes.push(page.tasks.length); items.push(...page.tasks); offset = page.next_offset;
  }
  assert.deepEqual(sizes, [50, 50, 5]); assert.equal(new Set(items.map(row => row.task_id)).size, 105);
  assert.equal(items[0].task_id, 't-001');
  assert.ok(items.slice(0, 65).every(row => ['PENDING', 'RUNNING'].includes(row.status)));
  assert.ok(items.slice(65).every(row => row.status === 'COMPLETED'));
  assert.ok(items.every(row => !Object.hasOwn(row, 'params') && !Object.hasOwn(row, 'result') && !Object.hasOwn(row, 'executions')));
  const emptyWeb = await (await call(DB, `/api/devices/${web}/tasks`)).json();
  assert.deepEqual(emptyWeb.tasks, []); assert.equal(emptyWeb.next_offset, null);
  for (const suffix of ['?offset=-1', '?offset=1.5', '?offset=', '?offset=NaN', '?offset=9007199254740992', '?offset=1&offset=2', '?extra=x']) {
    assert.equal((await call(DB, `/api/devices/${device}/tasks${suffix}`)).status, 400);
  }
  const unknown = 'pc-42345678-1234-4123-8123-123456789abc';
  assert.equal((await call(DB, `/api/devices/${unknown}/tasks`)).status, 404);
  assert.equal((await call(DB, `/api/devices/${device}/tasks`, {}, 'POST')).status, 405);
});

test('R06：activity写失败使领取及结果整批回滚', async t => {
  const { DB, sqlite } = setup(t); const task = await create(DB);
  sqlite.exec("CREATE TRIGGER reject_activity BEFORE INSERT ON task_activity BEGIN SELECT RAISE(ABORT, 'injected'); END;");
  const beforeClaim = snapshot(sqlite);
  assert.equal((await claim(DB, task.task_id)).status, 409);
  assert.deepEqual(snapshot(sqlite), beforeClaim);
  sqlite.exec('DROP TRIGGER reject_activity'); await claim(DB, task.task_id);
  const beforeResult = snapshot(sqlite);
  sqlite.exec("CREATE TRIGGER reject_activity BEFORE INSERT ON task_activity BEGIN SELECT RAISE(ABORT, 'injected'); END;");
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/result`, outcome(task.task_id))).status, 500);
  assert.deepEqual(snapshot(sqlite), beforeResult);
});

test('R06：读取RUNNING后才到达的进度不能覆盖已提交终态', async t => {
  const { DB, sqlite } = setup(t); const task = await create(DB); await claim(DB, task.task_id);
  const result = outcome(task.task_id); let finished;
  const lateDB = { ...DB, prepare(sql) {
    const prepared = DB.prepare(sql);
    if (!sql.startsWith('INSERT INTO task_activity')) return prepared;
    return { bind(...args) {
      const bound = prepared.bind(...args);
      return { ...bound, async run() {
        assert.equal((await call(DB, `/api/tasks/${task.task_id}/result`, result)).status, 200);
        finished = snapshot(sqlite);
        return bound.run();
      } };
    } };
  } };
  assert.equal((await progress(lateDB, task.task_id, '迟到说明')).status, 409);
  assert.deepEqual(snapshot(sqlite), finished);
  assert.equal(activity(sqlite, task.task_id).event, 'result');
  assert.equal(activity(sqlite, task.task_id).progress_message, null);
});

test('R07：新接口仍认证，无接收开关/心跳/凭据接口与活动依赖', async t => {
  const { DB, sqlite } = setup(t); const task = await create(DB);
  assert.equal((await call(DB, `/api/devices/${device}/tasks`, undefined, 'GET', false)).status, 401);
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/progress`, { device_id: device, message: 'ok' }, 'POST', false)).status, 401);
  assert.equal((await call(DB, `/api/tasks/${task.task_id}/progress`)).status, 405);
  assert.equal((await call(DB, '/api/device/heartbeat', { capabilities: [] })).status, 404);
  assert.equal((await call(DB, `/api/devices/${device}`, { accept_tasks: false }, 'PATCH')).status, 400);
  assert.equal((await call(DB, `/api/devices/${device}/credential`, {})).status >= 400, true);
  assert.equal(sizeOfActivity(sqlite), 0);
  const deviceRow = (await (await call(DB, '/api/devices')).json()).devices.find(d => d.device_id === device);
  for (const key of ['online', 'last_seen_at', 'accept_tasks', 'current_task_id', 'connection']) assert.equal(Object.hasOwn(deviceRow, key), false);
  for (const file of ['../worker.mjs', '../tasks/actions.mjs', '../devices/api.mjs', '../execution/sync.mjs', '../execution/runner.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /import[^\n]*(credential-store|devices\/request|auth\/)/);
  }
  assert.equal(existsSync(new URL('../migrations/003-device-credentials.sql', import.meta.url)), false);
});

const sizeOfActivity = sqlite => sqlite.prepare('SELECT COUNT(*) AS n FROM task_activity').get().n;
