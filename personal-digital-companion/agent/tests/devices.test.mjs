import { seedMockTask, withTaskSubmission } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDeviceIdentity, DEVICE_ID_PATTERN, parseDeviceBinding, restoreDeviceIdentity } from '../devices/identity.mjs';
import { handleDeviceRequest } from '../devices/api.mjs';
import { openTestDatabase, initializeDatabase } from './sqlite-d1.mjs';

const first = 'pc-12345678-1234-4123-8123-123456789abc';
const second = 'pc-22345678-1234-4123-8123-123456789abc';
const third = 'pc-32345678-1234-4123-8123-123456789abc';
function request(path, method = 'GET', value) {
  return new Request(`http://localhost${path}`, { method,
    ...(value === undefined ? {} : { body: JSON.stringify(value), headers: { 'content-type': 'application/json' } }) });
}
function setup(t) {
  const database = openTestDatabase();
  initializeDatabase(database.sqlite); seedMockTask(database.sqlite);
  t.after(() => database.close());
  return database;
}

test('D01/D02：身份持久化，损坏不覆盖', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-identity-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = await getDeviceIdentity(directory);
  assert.match(original.device_id, DEVICE_ID_PATTERN);
  assert.ok(original.computer_name);
  assert.deepEqual(await getDeviceIdentity(directory), original);
  const file = join(directory, 'device-identity.json');
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { device_id: original.device_id });
  for (const corrupted of ['{broken', '{"device_id":"bad"}']) {
    await writeFile(file, corrupted);
    await assert.rejects(getDeviceIdentity(directory), /身份文件/);
    assert.equal(await readFile(file, 'utf8'), corrupted);
  }
});

test('恢复网页导出的电脑 ID 后可读回原 ID，并可用上一个绑定文件恢复',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'feiyue-terminal-restore-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const original=await getDeviceIdentity(directory);
  const path=join(directory,'device-identity.json');
  const backup=join(directory,'device-identity.previous.json');
  const candidate=parseDeviceBinding('\uFEFF'+JSON.stringify({device_id:first}));
  await assert.rejects(restoreDeviceIdentity(directory,'bad-id'),/ID 无效/);
  for(const data of ['bad JSON',JSON.stringify({device_id:first,alias:'名称'}),JSON.stringify({device_id:first.replace('pc-','web-')})]){
    assert.throws(()=>parseDeviceBinding(data),/绑定文件/);
  }
  assert.equal(JSON.parse(await readFile(path,'utf8')).device_id,original.device_id);
  await restoreDeviceIdentity(directory,candidate);
  assert.equal((await getDeviceIdentity(directory)).device_id,first);
  assert.equal(parseDeviceBinding(await readFile(backup,'utf8')),original.device_id);
  await restoreDeviceIdentity(directory,first);
  assert.equal(parseDeviceBinding(await readFile(backup,'utf8')),original.device_id);
  await restoreDeviceIdentity(directory,parseDeviceBinding(await readFile(backup,'utf8')));
  assert.equal((await getDeviceIdentity(directory)).device_id,original.device_id);
});

test('D03/D04：登记、标注、系统名称更新、重复名与取消', async t => {
  const { DB } = setup(t);
  let response = await handleDeviceRequest(request(`/api/devices/${first}`, 'PUT', { computer_name: ' DESKTOP-A ' }), DB);
  assert.equal(response.status, 201);
  const original = (await response.json()).device;
  assert.equal(original.display_name, first);
  assert.equal(original.computer_name, 'DESKTOP-A');
  response = await handleDeviceRequest(request(`/api/devices/${first}`, 'PATCH', { alias: ' homepc ' }), DB);
  assert.equal((await response.json()).device.display_name, 'homepc');
  response = await handleDeviceRequest(request(`/api/devices/${first}`, 'PUT', { computer_name: 'RENAMED-PC' }), DB);
  assert.equal(response.status, 200);
  const updated = (await response.json()).device;
  assert.equal(updated.alias, 'homepc');
  assert.equal(updated.created_at, original.created_at);
  await handleDeviceRequest(request(`/api/devices/${second}`, 'PUT', { computer_name: 'LAPTOP' }), DB);
  response = await handleDeviceRequest(request(`/api/devices/${second}`, 'PATCH', { alias: 'HOMEPC' }), DB);
  assert.equal(response.status, 409);
  let list = await (await handleDeviceRequest(request('/api/devices'), DB)).json();
  assert.equal(list.devices.length, 2);
  assert.equal(list.devices.find(d => d.device_id === second).alias, null);
  response = await handleDeviceRequest(request(`/api/devices/${first}`, 'PATCH', { alias: '  ' }), DB);
  assert.equal((await response.json()).device.display_name, first);
  // 带引号的用户名称必须作为数据，不拼接SQL。
  const quoted = "desk'; DROP TABLE devices; --";
  response = await handleDeviceRequest(request(`/api/devices/${first}`, 'PATCH', { alias: quoted }), DB);
  assert.equal((await response.json()).device.alias, quoted);
  list = await (await handleDeviceRequest(request('/api/devices'), DB)).json();
  assert.equal(list.devices.length, 2);
});

test('D05：无效输入和不存在设备不写入', async t => {
  const { DB } = setup(t);
  for (const value of [{}, { computer_name: '' }, { computer_name: '\n' }, { computer_name: 'a'.repeat(256) }, { computer_name: 'PC', alias: 'x' }]) {
    assert.equal((await handleDeviceRequest(request(`/api/devices/${first}`, 'PUT', value), DB)).status, 400);
  }
  assert.equal((await handleDeviceRequest(request('/api/devices/bad-id', 'PUT', { computer_name: 'PC' }), DB)).status, 400);
  assert.equal((await handleDeviceRequest(request(`/api/devices/${third}`, 'PATCH', { alias: 'x' }), DB)).status, 404);
  await handleDeviceRequest(request(`/api/devices/${first}`, 'PUT', { computer_name: 'PC' }), DB);
  for (const value of [{ alias: 7 }, { alias: '\n' }, { alias: 'a'.repeat(65) }, { alias: 'x', other: true }]) {
    assert.equal((await handleDeviceRequest(request(`/api/devices/${first}`, 'PATCH', value), DB)).status, 400);
  }
  const malformed = new Request(`http://localhost/api/devices/${first}`, { method: 'PATCH', body: '{' });
  assert.equal((await handleDeviceRequest(malformed, DB)).status, 400);
  assert.equal((await handleDeviceRequest(request('/api/devices', 'POST', {}), DB)).status, 405);
  assert.equal(await handleDeviceRequest(request('/api/tasks'), DB), null);
  const list = await (await handleDeviceRequest(request('/api/devices'), DB)).json();
  assert.equal(list.devices.length, 1);
  assert.equal(list.devices[0].alias, null);
});

test('D06/D07：Worker认证及改名后的任务归属', async t => {
  const { default: worker } = await import('../worker.mjs');
  const { DB } = setup(t);
  const env = { DB, API_TOKEN: 'test-only-device-token' };
  async function call(path, method = 'GET', value, authorized = true) {
    if (path === '/api/tasks' && method === 'POST' && authorized) {
      value = await withTaskSubmission((url, body) => call(url, 'POST', body), value);
    }
    const req = request(path, method, value);
    if (authorized) req.headers.set('authorization', `Bearer ${env.API_TOKEN}`);
    return worker.fetch(req, env);
  }
  for (const [path, method, value] of [['/api/devices', 'GET'], [`/api/devices/${first}`, 'PUT', { computer_name: 'PC' }], [`/api/devices/${first}`, 'PATCH', { alias: 'x' }]]) {
    assert.equal((await call(path, method, value, false)).status, 401);
  }
  assert.equal((await call(`/api/devices/${first}`, 'PUT', { computer_name: 'PC' })).status, 201);
  const created = await call('/api/tasks', 'POST', { type: 'mock.echo', target_device_id: first, params: { drive: 'C:' } });
  assert.equal(created.status, 201);
  // 与第一组响应契约对接：允许以task包裹或直接返回任务。
  const payload = await created.json();
  const task = payload.task ?? payload;
  assert.ok(task.task_id);
  assert.equal((await call(`/api/devices/${first}`, 'PATCH', { alias: 'homepc' })).status, 200);
  const found = await call(`/api/tasks/${task.task_id}`);
  assert.equal(found.status, 200);
  const queried = await found.json();
  assert.equal((queried.task ?? queried).target_device_id, first);
  const devices = await (await call('/api/devices')).json();
  assert.equal(devices.devices[0].display_name, 'homepc');
});
