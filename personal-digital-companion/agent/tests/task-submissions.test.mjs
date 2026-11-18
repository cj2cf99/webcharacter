import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';
import { initializeDatabase, openTestDatabase } from './sqlite-d1.mjs';
import { seedMockTask } from './fixtures.mjs';

const payload = {
  type: 'mock.note', params: { subject: '提醒', text: '明天取件' },
  deadline_at: '2099-01-01T18:00:00+09:00',
};

function setup(t) {
  const { DB, sqlite, close } = openTestDatabase();
  t.after(close);
  initializeDatabase(sqlite);
  seedMockTask(sqlite, {
    executor: 'cloud', type: payload.type,
    spec: { subject: { type: 'string', required: true }, text: { type: 'string', required: true } },
  });
  const worker = createWorker({
    sameOriginWrites: true,
    authorize: request => ({ ownerId: request.headers.get('x-test-owner') }),
  });
  async function post(path, value, owner = 'owner-a', origin = 'https://fixture.test') {
    const response = await worker.fetch(new Request('https://fixture.test' + path, {
      method: 'POST', headers: { Origin: origin, 'x-test-owner': owner }, body: JSON.stringify(value),
    }), { DB });
    return { status: response.status, body: await response.json() };
  }
  async function issue(owner) {
    const response = await post('/api/task-submissions', {}, owner);
    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(response.body), ['submission_id']);
    return response.body.submission_id;
  }
  const submit = (submission_id, data = payload, owner) => post('/api/tasks', { ...data, submission_id }, owner);
  const count = () => sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;
  return { post, issue, submit, count, sqlite };
}

test('提交号只向已认证同源入口签发，任务拒绝缺号、伪造号和另一账户的号', async t => {
  const { post, issue, submit, count } = setup(t);
  assert.equal((await post('/api/task-submissions', {}, '')).status, 401);
  assert.equal((await post('/api/task-submissions', {}, 'owner-a', 'https://other.test')).status, 403);
  assert.equal((await post('/api/tasks', payload)).body.error.code, 'INVALID_SUBMISSION_ID');
  assert.equal((await submit('123')).body.error.code, 'INVALID_SUBMISSION_ID');
  assert.equal((await submit(crypto.randomUUID())).body.error.code, 'SUBMISSION_UNAVAILABLE');
  const id = await issue();
  assert.equal((await submit(id, payload, 'owner-b')).body.error.code, 'SUBMISSION_UNAVAILABLE');
  assert.equal(count(), 0);
  assert.equal((await submit(id)).status, 201);
  assert.equal((await submit(id, payload, 'owner-b')).body.error.code, 'SUBMISSION_UNAVAILABLE');
  assert.equal(count(), 1);
});

test('同号并发只建一次，同号换参数冲突，不同提交号允许相同内容各创建一次', async t => {
  const { issue, submit, count } = setup(t);
  const first = await issue();
  const second = await issue();
  assert.notEqual(first, second);
  const responses = await Promise.all([submit(second), submit(second), submit(second)]);
  assert.deepEqual(responses.map(item => item.status).sort(), [200, 200, 201]);
  assert.equal(new Set(responses.map(item => item.body.task_id)).size, 1);
  const equivalent = await submit(second, {
    ...payload, params: { text: '明天取件', subject: '提醒' }, target_device_id: null,
    deadline_at: '2099-01-01T09:00:00Z',
  });
  assert.equal(equivalent.status, 200);
  assert.equal(equivalent.body.submission_id, second);
  const conflict = await submit(second, { ...payload, params: { ...payload.params, text: '后天取件' } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'SUBMISSION_CONFLICT');
  const distinct = await submit(first);
  assert.equal(distinct.status, 201);
  assert.notEqual(distinct.body.task_id, equivalent.body.task_id);
  assert.equal(count(), 2);
});

test('提交号没有有效期，参数错误不占号，已使用的号仍可核对原任务', async t => {
  const { issue, submit, count } = setup(t);
  let now = Date.parse('2026-11-18T00:00:00Z');
  t.mock.method(Date, 'now', () => now);
  const unused = await issue();
  const used = await issue();
  assert.equal((await submit(used, { ...payload, params: {} })).body.error.code, 'INVALID_PARAMS');
  const created = await submit(used);
  assert.equal(created.status, 201);
  now += 365 * 24 * 60 * 60 * 1000;
  await issue();
  assert.equal((await submit(unused)).status, 201);
  const replay = await submit(used);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.task_id, created.body.task_id);
  assert.equal(count(), 2);
});
