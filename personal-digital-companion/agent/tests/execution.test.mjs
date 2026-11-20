import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createTaskExecutor } from '../execution/runner.mjs';
import { encodeJson } from '../execution/json.mjs';

const deviceId = 'pc-12345678-1234-4123-8123-123456789abc';
const task = (task_id = 't001') => ({ task_id, type: 'mock.unit', target_device_id: deviceId, params: { value: 'example' } });
function handlers(execute) {
  return { 'mock.unit': { risk: 'L1', validate(params) {
    if (Object.keys(params).length !== 1 || typeof params.value !== 'string') throw new Error('测试参数无效');
  }, execute } };
}
function fixture(t, execute = async params => ({ echoed: params.value })) {
  const directory = mkdtempSync(join(tmpdir(), 'companion-execution-'));
  const databasePath = join(directory, 'execution.sqlite');
  let runner = createTaskExecutor({ databasePath, deviceId, handlers: handlers(execute) });
  t.after(() => { runner?.close(); rmSync(directory, { recursive: true, force: true }); });
  return {
    get runner() { return runner; }, databasePath,
    reopen(nextExecute = execute) {
      runner.close(); runner = null;
      runner = createTaskExecutor({ databasePath, deviceId, handlers: handlers(nextExecute) });
      return runner;
    },
  };
}

test('E01：通用模拟任务prepare不执行，成功落盘重开不重复', async t => {
  let calls = 0;
  const f = fixture(t, async params => { calls++; return { echoed: params.value }; });
  assert.equal(f.runner.prepare(task()).status, 'PENDING');
  assert.equal(calls, 0);
  const result = await f.runner.execute(task());
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.attempt_count, 1);
  assert.deepEqual(result.result, { echoed: 'example' });
  assert.equal(result.executions.length, 1);
  assert.equal(result.executions[0].status, 'COMPLETED');
  assert.ok(result.executions[0].finished_at.endsWith('Z'));
  assert.deepEqual(await f.reopen().execute(task()), result);
  assert.equal(calls, 1);
  assert.equal(f.runner.getTask('missing'), null);
});

test('E02：首次失败立即同参数重试，处理函数修改副本不污染第二次', async t => {
  const received = [];
  const f = fixture(t, async params => {
    received.push(params.value);
    params.value = 'mutated';
    if (received.length === 1) throw new Error('raw-secret-test-marker');
    const check = new DatabaseSync(f.databasePath);
    try {
      const row = check.prepare('SELECT status, attempt_count FROM local_tasks').get();
      assert.equal(row.status, 'RUNNING'); assert.equal(row.attempt_count, 2);
      assert.equal(check.prepare('SELECT status FROM executions WHERE attempt_no=1').get().status, 'FAILED');
    } finally { check.close(); }
    return { ok: true };
  });
  const result = await f.runner.execute(task());
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.attempt_count, 2);
  assert.deepEqual(received, ['example', 'example']);
  assert.deepEqual(result.params, { value: 'example' });
  assert.deepEqual(result.executions.map(r => r.status), ['FAILED', 'COMPLETED']);
  assert.notEqual(result.executions[0].execution_id, result.executions[1].execution_id);
  assert.equal(JSON.stringify(result).includes('raw-secret-test-marker'), false);
  assert.equal(result.error, null);
});

test('本地复盘跨东京午夜读取旧执行明细，保留失败和重试，重复补传只有一条回执',async t=>{
  let attempt=0;
  const f=fixture(t,async()=>{if(!attempt++)throw Error('failed');return {message:'已整理两份资料'};});
  const input={...task(),definition:{name:'整理资料'}};
  f.runner.prepare(input);await f.runner.execute(input);
  const seed=new DatabaseSync(f.databasePath);
  seed.prepare('UPDATE executions SET started_at=?,finished_at=? WHERE attempt_no=1')
    .run('2026-11-19T14:59:58.000Z','2026-11-19T14:59:59.000Z');
  seed.prepare('UPDATE executions SET started_at=?,finished_at=? WHERE attempt_no=2')
    .run('2026-11-19T14:59:59.500Z','2026-11-19T15:00:01.000Z');
  seed.close();
  const runner=f.reopen();
  assert.deepEqual(runner.review.read('2026-11-19').map(e=>e.action),['第 1 次开始执行','第 1 次执行失败','第 2 次开始执行']);
  const [done]=runner.review.read('2026-11-20');
  assert.equal(done.title,'整理资料');assert.equal(done.detail,'说明：已整理两份资料');
  runner.markUploaded(input.task_id);runner.markUploaded(input.task_id);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(Date.now());
  assert.equal(runner.review.read(today).filter(e=>e.action.includes('收到')).length,1);
});

test('E03：两次失败即结束，重开不会第三次执行', async t => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; throw new Error('secret'); });
  const result = await f.runner.execute(task());
  assert.equal(result.status, 'FAILED');
  assert.equal(result.attempt_count, 2);
  assert.equal(result.executions.length, 2);
  assert.equal(result.result, null);
  assert.equal(result.error, '任务执行失败');
  await f.runner.execute(task());
  assert.deepEqual(await f.reopen().execute(task()), result);
  assert.equal(calls, 2);
});

test('E04：未知/暂停类型、无效参数和目标不得执行；同ID内容不能改变', async t => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; return { ok: true }; });
  for (const input of [null, {}, { ...task(), task_id: '' },
    { ...task(), type: 'shell.run', risk: 'L1' }, { ...task(), type: 'disk.query', params: { drive: 'C:' } },
    { ...task(), target_device_id: 'other' }, { ...task(), params: {} },
    { ...task(), params: { value: 'x', extra: true } }]) {
    await assert.rejects(f.runner.execute(input));
  }
  assert.equal(calls, 0);
  assert.equal(f.runner.getTask('t001'), null);
  const result = await f.runner.execute(task());
  await assert.rejects(f.runner.execute({ ...task(), params: { value: 'changed' } }), /不能更换内容/);
  assert.equal(calls, 1);
  assert.deepEqual(f.runner.getTask('t001'), result);
  assert.throws(() => createTaskExecutor({ databasePath: ':memory:', deviceId, handlers: { 'mock.bad': { execute() {}, validate() {} } } }), /L1/);
  assert.throws(() => createTaskExecutor({ databasePath: ':memory:', deviceId, handlers: { 'mock.bad': { risk: 'L2', execute() {}, validate() {} } } }), /L1/);
});

test('E05：调用前RUNNING已落盘，同任务在途不重复', async t => {
  let release;
  let calls = 0;
  const f = fixture(t, async () => {
    calls++;
    const check = new DatabaseSync(f.databasePath);
    try {
      assert.equal(check.prepare('SELECT status FROM local_tasks').get().status, 'RUNNING');
      assert.equal(check.prepare('SELECT status FROM executions').get().status, 'RUNNING');
    } finally { check.close(); }
    return new Promise(resolve => { release = () => resolve({ ok: true }); });
  });
  const pending = f.runner.execute(task());
  await assert.rejects(f.runner.execute(task()), /正在本进程/);
  assert.throws(() => f.runner.close(), /尚未完成/);
  release();
  assert.equal((await pending).status, 'COMPLETED');
  assert.equal(calls, 1);
});

test('E06：未知中断不盲目重跑；已知首次失败只补一次', async t => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; return { ok: true }; });
  const seed = new DatabaseSync(f.databasePath);
  const now = new Date().toISOString();
  for (const [id, status] of [['uncertain', 'RUNNING'], ['retryable', 'FAILED']]) {
    seed.prepare(`INSERT INTO local_tasks (task_id,type,target_device_id,params_json,status,attempt_count,created_at,updated_at)
      VALUES (?,'mock.unit',?,'{"value":"example"}','RUNNING',1,?,?)`).run(id, deviceId, now, now);
    seed.prepare(`INSERT INTO executions (execution_id,task_id,attempt_no,status,started_at,finished_at,error)
      VALUES (?,?,1,?,?,?,?)`).run(id, id, status, now, status === 'FAILED' ? now : null, status === 'FAILED' ? '任务执行失败' : null);
  }
  seed.close();
  f.reopen();
  await assert.rejects(f.runner.execute(task('uncertain')), /待核对/);
  assert.equal(calls, 0);
  assert.equal(f.runner.getTask('uncertain').attempt_count, 1);
  const recovered = await f.runner.execute(task('retryable'));
  assert.equal(recovered.status, 'COMPLETED');
  assert.equal(recovered.attempt_count, 2);
  assert.equal(calls, 1);
});

test('E07：JSON不静默丢字段，非法结果只记录固定失败', async t => {
  assert.equal(encodeJson({ b: 2, a: 1 }), encodeJson({ a: 1, b: 2 }));
  const cycle = {}; cycle.self = cycle;
  for (const value of [undefined, NaN, Infinity, 1n, new Date(), { x: undefined }, cycle, [, 1]]) assert.throws(() => encodeJson(value));
  const f = fixture(t, async () => ({ lost: undefined }));
  const result = await f.runner.execute(task());
  assert.equal(result.status, 'FAILED');
  assert.equal(result.attempt_count, 2);
  assert.equal(result.error, '任务执行失败');
});

test('E08：默认空处理表，没有磁盘或其它业务执行入口', async t => {
  const runner = createTaskExecutor({ databasePath: ':memory:', deviceId });
  t.after(() => runner.close());
  await assert.rejects(runner.execute(task()), /尚未配置/);
  await assert.rejects(runner.execute({ ...task(), type: 'disk.query', params: { drive: 'C:' } }), /暂缓/);
  assert.equal(runner.getTask('t001'), null);
});
