import test from 'node:test';
import { withTaskSubmission } from './fixtures.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker.mjs';
import { encodeJson } from '../execution/json.mjs';
import { executeMainSiteTask, prepareMainSiteTask } from '../host/main-site-task-adapter.mjs';
import { initializeDatabase, openTestDatabase } from './sqlite-d1.mjs';

const seed = readFileSync(new URL('../seeds/tasklist-preview.sql', import.meta.url), 'utf8');
const records = { type: 'records.create', params: { body: '  模拟记录\n第二行  ', category_id: 'fixture-category' } };
const reminder = { type: 'reminders.create', params: { title: '模拟提醒', deadline: '2099-02-20' } };

function fixture(t) {
  const { DB, sqlite, close } = openTestDatabase();
  t.after(close);
  initializeDatabase(sqlite);
  sqlite.exec(seed);
  sqlite.exec(seed);
  async function call(path, body, cookie) {
    if (path === '/api/tasks') body = await withTaskSubmission((url, value) => call(url, value, cookie), body);
    return worker.fetch(new Request('https://companion.test' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { DB, API_TOKEN: 'fixture' });
  }
  async function create(body, cookie) {
    const response = await call('/api/tasks', body, cookie);
    assert.equal(response.status, 201);
    return response.json();
  }
  return { sqlite, call, create };
}

// 云端执行生命周期仅在隔离数据库中演练，未注册线上执行入口。
async function simulate(sqlite, task, writeOnce) {
  prepareMainSiteTask(task);
  const started = sqlite.prepare("UPDATE tasks SET status='RUNNING' WHERE task_id=? AND status='PENDING' AND target_device_id IS NULL").run(task.task_id);
  if (!started.changes) throw new Error('任务已开始或已结束');
  const attempts = [];
  let outcome;
  for (let number = 1; number <= 2; number++) {
    const startedAt = new Date().toISOString();
    try {
      outcome = { status: 'COMPLETED', result: await executeMainSiteTask(task, writeOnce), error: null };
    } catch (error) {
      outcome = { status: 'FAILED', result: null, error: error.message };
    }
    attempts.push({ ...outcome, number, startedAt, finishedAt: new Date().toISOString() });
    if (outcome.status === 'COMPLETED') break;
  }
  sqlite.exec('BEGIN');
  try {
    for (const attempt of attempts) {
      sqlite.prepare('INSERT INTO executions VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        crypto.randomUUID(), task.task_id, attempt.number, attempt.status, attempt.startedAt, attempt.finishedAt,
        attempt.result === null ? null : encodeJson(attempt.result), attempt.error);
    }
    sqlite.prepare('UPDATE tasks SET status=?, attempt_count=?, result_json=?, error=? WHERE task_id=?').run(
      outcome.status, attempts.length, outcome.result === null ? null : encodeJson(outcome.result), outcome.error, task.task_id);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

test('两个模板由同一个接口解析，新建与查询保留参数、说明，错误参数无法新建', async t => {
  const { call, create, sqlite } = fixture(t);
  const { tasklist } = await (await call('/api/tasklist')).json();
  assert.deepEqual(tasklist.map(task => task.type), [records.type, reminder.type]);
  for (const input of [records, reminder]) {
    const task = await create(input);
    const detail = await (await call('/api/tasks/' + task.task_id)).json();
    assert.deepEqual(detail.params, input.params);
    assert.equal(detail.status, 'PENDING');
    assert.equal(detail.target_device_id, null);
    assert.equal(detail.definition.executor, 'cloud');
    assert.ok(detail.definition.procedure && detail.definition.report_spec);
  }
  for (const invalid of [
    { ...records, params: { body: '没有分类' } },
    { ...records, params: { ...records.params, body: '   ' } },
    { ...records, params: { ...records.params, url: '/api/other' } },
    { ...reminder, params: { ...reminder.params, title: 'x'.repeat(301) } },
    { ...reminder, params: { ...reminder.params, deadline: '20/02/2099' } },
    { ...reminder, params: { ...reminder.params, level: 4 } },
    { ...reminder, target_device_id: 'pc-2e653f10-acbe-44d9-85bb-91942eca580f' },
  ]) {
    assert.equal((await call('/api/tasks', invalid)).status, 400);
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 2);
});

test('同账户两个浏览器终端看到同一执行结果，成功丢回执的重试不再写入', async t => {
  const { call, create, sqlite } = fixture(t);
  async function terminal() {
    const response = await call('/api/terminal/register', { accepted: true });
    assert.equal(response.status, 201);
    return response.headers.get('set-cookie').split(';')[0];
  }
  const a = await terminal(), b = await terminal();
  assert.notEqual(a, b);
  const receipts = new Map();
  const expected = {
    '/api/records': { body: '模拟记录\n第二行', category_id: 'fixture-category', tag_ids: [], photos: [] },
    '/api/reminders': { title: '模拟提醒', content: '', deadline: '2099-02-20', level: '中' },
  };
  for (const input of [records, reminder]) {
    const task = await create(input, a);
    const path = '/api/tasks/' + task.task_id;
    const read = () => call(path, undefined, b).then(response => response.json());
    assert.equal((await read()).status, 'PENDING');
    assert.equal((await call(path + '/claim', { device_id: 'pc-2e653f10-acbe-44d9-85bb-91942eca580f' }, b)).status, 409);
    const calls = [];
    const pause = Promise.withResolvers();
    const writeOnce = async ({ path: businessPath, body, idempotencyKey }) => {
      calls.push({ businessPath, body, idempotencyKey });
      if (calls.length === 1) await pause.promise;
      if (receipts.has(idempotencyKey)) return receipts.get(idempotencyKey);
      const response = businessPath === '/api/records' ? { id: 'fixture-record' } : { item: { seq: 17 } };
      receipts.set(idempotencyKey, response);
      if (businessPath === '/api/reminders') throw new Error('模拟：写入已完成但回执丢失');
      return response;
    };
    const work = simulate(sqlite, task, writeOnce);
    try {
      assert.equal((await read()).status, 'RUNNING');
      await assert.rejects(simulate(sqlite, task, writeOnce), /已开始/);
    } finally {
      pause.resolve();
      await work;
    }
    const finished = await read();
    assert.equal(finished.status, 'COMPLETED');
    assert.deepEqual(finished.result, { record_id: input === records ? 'fixture-record' : 17 });
    assert.deepEqual(finished.executions.map(item => item.status),
      input === records ? ['COMPLETED'] : ['FAILED', 'COMPLETED']);
    assert.equal(calls.length, input === records ? 1 : 2);
    for (const attempt of calls) {
      assert.equal(attempt.businessPath, input === records ? '/api/records' : '/api/reminders');
      assert.deepEqual(attempt.body, expected[attempt.businessPath]);
      assert.equal(attempt.idempotencyKey, task.task_id);
    }
  }
  assert.equal(receipts.size, 2);
});

test('无效业务日期先拦住，无有效回执两次后报告失败', async t => {
  const { create, call, sqlite } = fixture(t);
  const invalidDate = await create({ ...reminder, params: { title: '坏日期', deadline: '2099-02-29' } });
  let calls = 0;
  const write = async () => { calls++; return {}; };
  await assert.rejects(simulate(sqlite, invalidDate, write), /日期无效/);
  assert.equal(calls, 0);
  const task = await create(reminder);
  await simulate(sqlite, task, write);
  assert.equal(calls, 2);
  const result = await (await call('/api/tasks/' + task.task_id)).json();
  assert.equal(result.status, 'FAILED');
  assert.equal(result.result, null);
  assert.equal(result.attempt_count, 2);
  assert.match(result.error, /业务回执/);
});
