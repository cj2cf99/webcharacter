import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker.mjs';
import { openTestDatabase, initializeDatabase } from './sqlite-d1.mjs';
import { createTaskExecutor } from '../execution/runner.mjs';
import { createTaskSync } from '../execution/sync.mjs';
import { withTaskSubmission } from './fixtures.mjs';

const deviceId = 'pc-12345678-1234-4123-8123-123456789abc';
function fixture(t, execute) {
  const directory = mkdtempSync(join(tmpdir(), 'companion-sync-'));
  const localPath = join(directory, 'local.sqlite');
  const cloudPath = join(directory, 'cloud.sqlite');
  let cloud = openTestDatabase(cloudPath);
  initializeDatabase(cloud.sqlite);
  cloud.sqlite.prepare('INSERT INTO devices VALUES (?,?,NULL,?)').run(deviceId, 'TEST-PC', new Date().toISOString());
  cloud.sqlite.prepare('INSERT INTO tasklist VALUES (?,?,?,?,?,?,?)').run('mock.unit', '仅测试任务', '无业务副作用', 'pc',
    '{"value":{"type":"string","required":true}}', '仅在测试代码模拟执行', '测试结果');
  let count = 0;
  const makeExecutor = () => createTaskExecutor({ databasePath: localPath, deviceId,
    handlers: { 'mock.unit': { risk: 'L1', validate(params) { assert.equal(typeof params.value, 'string'); },
      async execute(params) { count++; return execute ? execute(params, count) : { echoed: params.value }; } } },
  });
  let executor = makeExecutor();
  const token = 'test-only-sync-token';
  let hook = null;
  const request = async (path, options = {}) => {
    const invoke = () => worker.fetch(new Request(`https://test.invalid${path}`, {
      ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` },
    }), { DB: cloud.DB, API_TOKEN: token });
    return hook ? hook(path, options, invoke) : invoke();
  };
  let sync = createTaskSync({ request, executor, deviceId });
  t.after(() => { executor?.close(); cloud?.close(); rmSync(directory, { recursive: true, force: true }); });
  return {
    request, localPath,
    get cloud() { return cloud; }, get executor() { return executor; }, get sync() { return sync; },
    get calls() { return count; }, setHook(value) { hook = value; },
    async create() {
      const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
      const response = await post('/api/tasks', await withTaskSubmission(post, { type: 'mock.unit', target_device_id: deviceId, params: { value: 'example' } }));
      assert.equal(response.status, 201); return response.json();
    },
    reopen() {
      executor.close(); executor = null; cloud.close(); cloud = null;
      cloud = openTestDatabase(cloudPath); executor = makeExecutor();
      sync = createTaskSync({ request, executor, deviceId });
    },
  };
}

test('S01：mock任务创建→落盘→领取→成功上报，无具体业务调用', async t => {
  const f = fixture(t);
  const task = await f.create();
  f.setHook(async (path, options, invoke) => {
    if (path.endsWith('/claim')) {
      assert.equal(f.executor.getTask(task.task_id).status, 'PENDING');
      assert.equal(f.calls, 0);
    }
    if (path.endsWith('/result')) assert.equal(f.executor.getTask(task.task_id).status, 'COMPLETED');
    return invoke();
  });
  const result = await f.sync.syncTask(task.task_id);
  assert.equal(result.acknowledged, true);
  assert.equal(result.task.status, 'COMPLETED');
  assert.equal(result.task.attempt_count, 1);
  assert.deepEqual(result.task.result, { echoed: 'example' });
  assert.equal(f.calls, 1);
  assert.equal(f.cloud.sqlite.prepare('SELECT COUNT(*) AS n FROM executions').get().n, 1);
  f.setHook(null); f.reopen();
  assert.equal((await f.sync.syncTask(task.task_id)).acknowledged, true);
  assert.equal(f.calls, 1);
});

test('S02：两次失败正确回传终态与两条尝试', async t => {
  const f = fixture(t, async () => { throw new Error('do-not-store-secret'); });
  const task = await f.create();
  const result = await f.sync.syncTask(task.task_id);
  assert.equal(result.task.status, 'FAILED');
  assert.equal(result.task.attempt_count, 2);
  assert.equal(result.task.executions.length, 2);
  assert.equal(result.task.error, '任务执行失败');
  assert.equal(JSON.stringify(result).includes('do-not-store-secret'), false);
  await f.sync.syncTask(task.task_id);
  assert.equal(f.calls, 2);
});

test('S03：领取回执丢失后重开，只执行一次', async t => {
  const f = fixture(t);
  const task = await f.create();
  let dropped = false;
  f.setHook(async (path, options, invoke) => {
    const response = await invoke();
    if (path.endsWith('/claim') && !dropped) { dropped = true; throw new Error('模拟领取回执丢失'); }
    return response;
  });
  await assert.rejects(f.sync.syncTask(task.task_id), /回执丢失/);
  assert.equal(f.executor.getTask(task.task_id).status, 'PENDING');
  assert.equal(f.calls, 0);
  assert.equal(f.cloud.sqlite.prepare('SELECT status FROM tasks').get().status, 'RUNNING');
  f.setHook(null); f.reopen();
  assert.equal((await f.sync.syncTask(task.task_id)).task.status, 'COMPLETED');
  assert.equal(f.calls, 1);
});

for (const phase of ['before', 'after']) {
  test(`S04：结果${phase === 'before' ? '请求断网' : '保存后回执丢失'}，重开仅补传`, async t => {
    const f = fixture(t);
    const task = await f.create();
    f.setHook(async (path, options, invoke) => {
      if (path.endsWith('/result')) {
        if (phase === 'after') await invoke();
        throw new Error('模拟结果传输断开');
      }
      return invoke();
    });
    await assert.rejects(f.sync.syncTask(task.task_id), /断开/);
    assert.equal(f.executor.getTask(task.task_id).status, 'COMPLETED');
    assert.equal(f.calls, 1);
    f.setHook(null); f.reopen();
    const result = await f.sync.syncTask(task.task_id);
    assert.equal(result.acknowledged, true);
    assert.equal(f.calls, 1);
    assert.equal(f.cloud.sqlite.prepare('SELECT COUNT(*) AS n FROM executions').get().n, 1);
  });
}

test('S05：云端RUNNING而本地无记录不盲目重跑', async t => {
  const f = fixture(t);
  const task = await f.create();
  await f.request(`/api/tasks/${task.task_id}/claim`, { method: 'POST', body: JSON.stringify({ device_id: deviceId }) });
  await assert.rejects(f.sync.syncTask(task.task_id), /待核对/);
  assert.equal(f.calls, 0);
  assert.equal(f.executor.getTask(task.task_id), null);
});

test('S06：保存的未结束执行记录不重跑，内容不一致也停止', async t => {
  const f = fixture(t);
  const task = await f.create();
  f.executor.prepare(task);
  await f.request(`/api/tasks/${task.task_id}/claim`, { method: 'POST', body: JSON.stringify({ device_id: deviceId }) });
  const local = new DatabaseSync(f.localPath);
  local.prepare("UPDATE local_tasks SET status='RUNNING',attempt_count=1").run();
  local.prepare("INSERT INTO executions (execution_id,task_id,attempt_no,status,started_at) VALUES (?,?,1,'RUNNING',?)")
    .run(crypto.randomUUID(), task.task_id, new Date().toISOString());
  local.close(); f.reopen();
  await assert.rejects(f.sync.syncTask(task.task_id), /待核对/);
  assert.equal(f.calls, 0);
  f.cloud.sqlite.prepare('UPDATE tasks SET params_json=?').run('{"value":"changed"}');
  await assert.rejects(f.sync.syncTask(task.task_id), /内容冲突/);
  assert.equal(f.calls, 0);
});

test('S07：终态冲突或缺确认不覆盖本地、不重新执行', async t => {
  const f = fixture(t);
  const task = await f.create();
  await f.sync.syncTask(task.task_id);
  const original = f.executor.getTask(task.task_id);
  f.cloud.sqlite.prepare('UPDATE tasks SET result_json=?').run('{"echoed":"other"}');
  f.cloud.sqlite.prepare('UPDATE executions SET result_json=?').run('{"echoed":"other"}');
  await assert.rejects(f.sync.syncTask(task.task_id), { status: 409 });
  assert.deepEqual(f.executor.getTask(task.task_id), original);
  assert.equal(f.calls, 1);
  f.setHook(async (path, options, invoke) => {
    if (path.endsWith('/result')) return Response.json({ acknowledged: false, task: { ...task, status: 'COMPLETED' } });
    return invoke();
  });
  await assert.rejects(f.sync.syncTask(task.task_id), /确认与本地结果不一致/);
  assert.equal(f.calls, 1);
});

test('S08：无认证/取消/错误目标不执行，终态无本地副本只读返回', async t => {
  const f = fixture(t);
  const task = await f.create();
  f.setHook(async () => Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }));
  await assert.rejects(f.sync.syncTask(task.task_id), { status: 401 });
  assert.equal(f.executor.getTask(task.task_id), null);
  f.setHook(null);
  f.cloud.sqlite.prepare("UPDATE tasks SET status='CANCELLED'").run();
  await assert.rejects(f.sync.syncTask(task.task_id), /不可执行/);
  f.cloud.sqlite.prepare("UPDATE tasks SET status='COMPLETED',attempt_count=1,result_json='null'").run();
  assert.equal((await f.sync.syncTask(task.task_id)).task.status, 'COMPLETED');
  assert.equal(f.executor.getTask(task.task_id), null);
  assert.equal(f.calls, 0);
});
