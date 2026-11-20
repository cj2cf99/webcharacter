import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import worker from '../worker.mjs';
import { openTestDatabase, initializeDatabase } from './sqlite-d1.mjs';
import { seedMockTask } from './fixtures.mjs';
import { getDeviceIdentity } from '../devices/identity.mjs';
import { createTaskExecutor } from '../execution/runner.mjs';
import { createTaskPoller } from '../../desktop/task-poller.mjs';
import { createDesktopTasks } from '../../desktop/task-lifecycle.mjs';

const device = 'pc-12345678-1234-4123-8123-123456789abc';
const other = 'pc-22345678-1234-4123-8123-123456789abc';
const tick = () => new Promise(setImmediate);
test('桌面半小时心跳不重入，不阻塞重启，退出取消在途请求并清除定时器',{timeout:5000},async t => {
  t.mock.timers.enable({apis:['setInterval']});
  const profile=mkdtempSync(join(tmpdir(),'companion-heartbeat-'));
  t.after(()=>rmSync(profile,{recursive:true,force:true}));
  const beats=[];
  const tasks=await createDesktopTasks({profile,dialog:{},request:async(path,options)=>{
    if(path==='/api/assistant/heartbeat'){
      const pending=Promise.withResolvers();
      beats.push({options,pending});
      return pending.promise;
    }
    return Response.json(options.method==='PUT'?{device:{device_id:path.split('/').at(-1)}}:{tasks:[],next_after:null});
  }});
  tasks.startPolling();
  tasks.startPolling();
  t.mock.timers.tick(1800000-1);
  await tick();
  assert.equal(beats.length,0);
  t.mock.timers.tick(1);
  await tick();
  assert.equal(beats.length,1);
  assert.equal(beats[0].options.method,'POST');
  assert.equal(beats[0].options.body,undefined);
  t.mock.timers.tick(1800000);
  await tick();
  assert.equal(beats.length,1);
  beats[0].pending.resolve(Response.json({status:'healthy'}));
  await tick();
  t.mock.timers.tick(1800000);
  await tick();
  assert.equal(beats.length,2);
  await tasks.drainForRestart();
  t.mock.timers.tick(1800000);
  await tick();
  assert.equal(beats.length,2);
  await tasks.stop();
  assert.ok(beats[1].options.signal.aborted);
  t.mock.timers.tick(1800000);
  await tick();
  assert.equal(beats.length,2);
});
function fixture(t) {
  const db = openTestDatabase(); initializeDatabase(db.sqlite);
  seedMockTask(db.sqlite, { type: 'mock.unit', spec: { value: { type: 'string', required: true } } });
  for (const id of [device, other]) db.sqlite.prepare('INSERT INTO devices VALUES (?,?,NULL,?)').run(id, 'TEST', '2026-11-18T00:00:00.000Z');
  t.after(() => db.close());
  const request = (path, options = {}) => worker.fetch(new Request(`https://test.invalid${path}`, {
    ...options, headers: { Authorization: 'Bearer test', ...options.headers },
  }), { DB: db.DB, API_TOKEN: 'test' });
  return { ...db, request };
}
test('P01：待领取清单过滤目标/状态/截止/暂停，查询不写活动，鉴权有效', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-25T09:00:00.000Z') });
  const { sqlite, DB, request } = fixture(t);
  seedMockTask(sqlite, { type: 'disk.query' });
  const insert = sqlite.prepare(`INSERT INTO tasks(task_id,type,target_device_id,params_json,status,created_at,deadline_at)
    VALUES (?,?,?,'{"value":"x"}',?,'2026-11-18T00:00:00.000Z',?)`);
  insert.run('forever', 'mock.unit', device, 'PENDING', null);
  insert.run('grace', 'mock.unit', device, 'PENDING', '2026-11-18T09:00:00.001Z');
  insert.run('expired', 'mock.unit', device, 'PENDING', '2026-11-18T09:00:00.000Z');
  insert.run('cancelled', 'mock.unit', device, 'CANCELLED', null);
  insert.run('running', 'mock.unit', device, 'RUNNING', null);
  insert.run('other', 'mock.unit', other, 'PENDING', null);
  insert.run('disk', 'disk.query', device, 'PENDING', null);
  const page = await (await request(`/api/devices/${device}/pending`)).json();
  assert.deepEqual(page, { tasks: [{ task_id: 'forever', type: 'mock.unit' }, { task_id: 'grace', type: 'mock.unit' }], next_after: null });
  assert.equal(sqlite.prepare('SELECT count(*) n FROM task_activity').get().n, 0);
  assert.equal((await worker.fetch(new Request(`https://test.invalid/api/devices/${device}/pending`), { DB, API_TOKEN: 'test' })).status, 401);
  for (const query of ['?after=', '?after=x&after=y', '?offset=0', '?after=%2F']) assert.equal((await request(`/api/devices/${device}/pending${query}`)).status, 400);
  assert.equal((await request(`/api/devices/${device}/pending`, { method: 'POST' })).status, 405);
  assert.equal((await request('/api/devices/pc-33333333-3333-4333-8333-333333333333/pending')).status, 404);
});

test('P02：前页完成移出清单后仍可完整读取后页，不使用变化中的offset', async t => {
  const { sqlite, request } = fixture(t);
  const insert = sqlite.prepare(`INSERT INTO tasks(task_id,type,target_device_id,params_json,status,created_at)
    VALUES (?,'mock.unit',?,'{"value":"x"}','PENDING','2026-11-18T00:00:00.000Z')`);
  for (let i = 0; i < 105; i++) insert.run(`t-${String(i).padStart(3, '0')}`, device);
  const ids = []; let after = null;
  do {
    const page = await (await request(`/api/devices/${device}/pending${after ? `?after=${after}` : ''}`)).json();
    for (const task of page.tasks) {
      ids.push(task.task_id);
      sqlite.prepare("UPDATE tasks SET status='COMPLETED' WHERE task_id=?").run(task.task_id);
    }
    after = page.next_after;
  } while (after);
  assert.equal(ids.length, 105); assert.equal(new Set(ids).size, 105);
});

test('P03：单计时器只刷新清单，不自动领取；退出检查暂停并恢复', async () => {
  let timer, scans = 0, registration = 0, allowed = true, release;
  const runs = [], pages=[];
  const request = async (path, options) => {
    if (options?.method === 'PUT') { registration++; return Response.json({ device: { device_id: device } }); }
    scans++;
    return Response.json({ tasks: [{ task_id: 'a', type: 'mock.unit' }, ...(scans > 1 ? [{ task_id: 'b', type: 'mock.unit' }] : []), { task_id: 'unsupported', type: 'other' }], next_after: null });
  };
  const poller = createTaskPoller({ request, identity: { device_id: device, computer_name: 'TEST' },
    canStart: () => allowed, supports: task => task.type === 'mock.unit',
    runTask: id => { runs.push(id); },onTasks:tasks=>pages.push(tasks), setTimer: (callback,ms) => { assert.equal(ms,900_000); assert.equal(timer, undefined); timer = callback; return 1; }, clearTimer: () => { timer = undefined; } });
  const fire = async () => { const fn = timer; timer = undefined; fn(); await tick(); };
  poller.start(); poller.start(); await tick(); assert.deepEqual(runs, []);assert.equal(pages[0].length,2);
  await fire(); assert.deepEqual(runs, []); assert.equal(registration, 1);assert.equal(pages[1].length,3);
  allowed = false; await fire(); assert.equal(scans, 2);
  allowed = true; await fire(); assert.equal(scans, 3); assert.deepEqual(runs, []);
  poller.stop(); assert.equal(timer, undefined); await tick(); assert.equal(scans, 3);
});

test('P04：停止后的迟到清单不执行，失败仅等下一普通周期', async () => {
  let resolvePage, scheduled = 0, runs = 0, round = 0, timer;
  const poller = createTaskPoller({ identity: { device_id: device, computer_name: 'TEST' }, canStart: () => true, supports: () => true,
    request: async (_path, options) => {
      if (options?.method === 'PUT') return Response.json({ device: { device_id: device } });
      if (round++ === 0) throw new Error('offline');
      return new Promise(resolve => { resolvePage = resolve; });
    }, runTask: () => { runs++; }, setTimer: fn => { scheduled++; timer = fn; return 1; }, clearTimer() {} });
  poller.start(); await tick(); assert.equal(scheduled, 1); assert.equal(runs, 0);
  timer(); await tick(); poller.stop(); resolvePage(Response.json({ tasks: [{ task_id: 'a', type: 'mock.unit' }], next_after: null }));
  await tick(); assert.equal(runs, 0); assert.equal(scheduled, 1);
});

test('分页中途出现本地任务时丢弃本轮清单，下一次空闲周期重新读取',async()=>{
  let busy=false,scheduled,reads=0;
  const pages=[],first=Promise.withResolvers();
  const poller=createTaskPoller({identity:{device_id:device,computer_name:'TEST'},canStart:()=>!busy,
    request:async(path,opts)=>{
      if(opts.method==='PUT')return Response.json({device:{device_id:device}});
      reads++;
      assert.ok(path.endsWith('/pending'));
      if(reads===1)return first.promise;
      return Response.json({tasks:[],next_after:null});
    },onTasks:tasks=>pages.push(tasks),setTimer:(fn,ms)=>{assert.equal(ms,900_000);scheduled=fn;return 1;},clearTimer(){}});
  poller.start();await tick();
  busy=true;first.resolve(Response.json({tasks:[{task_id:'a',type:'mock.unit'}],next_after:'a'}));await tick();
  assert.equal(reads,1);assert.deepEqual(pages,[]);
  scheduled();await tick();assert.equal(reads,1);
  busy=false;scheduled();await tick();assert.equal(reads,2);assert.deepEqual(pages,[[]]);poller.stop();
});

test('启动时有桌面工作或上次执行结果待补传，自动轮询按原间隔跳过',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'companion-poll-idle-'));
  t.after(()=>rmSync(profile,{recursive:true,force:true}));
  const identity=await getDeviceIdentity(profile);
  const executor=createTaskExecutor({databasePath:join(profile,'tasks.sqlite'),deviceId:identity.device_id,
    handlers:{'mock.unit':{risk:'L1',validate(){},execute(){return {ok:true};}}}});
  await executor.execute({task_id:'prior',type:'mock.unit',target_device_id:identity.device_id,params:{}});
  executor.close();
  let busy=false,next;
  const calls=[];
  const runtime=await createDesktopTasks({profile,dialog:{},desktopBusy:()=>busy,
    request:async(path,opts)=>{calls.push(path);return Response.json(opts.method==='PUT'?{device:identity}:{tasks:[],next_after:null});},
    pollerOptions:{setTimer:(fn,ms)=>{assert.equal(ms,900_000);next=fn;return 1;},clearTimer(){}}});
  try{
    runtime.startPolling();await tick();assert.deepEqual(calls,[]);
    runtime.executor.markUploaded('prior');
    busy=true;next();await tick();assert.deepEqual(calls,[]);
    busy=false;runtime.cancelRestart();runtime.cancelQuitCheck();await tick();assert.deepEqual(calls,[]);
    next();await tick();
    assert.deepEqual(calls,[`/api/devices/${identity.device_id}`,`/api/devices/${identity.device_id}/pending`]);
  }finally{await runtime.stop();}
});

test('P05：空闲轮询自动领取，真实线程执行回传，未知类型保持待执行', async t => {
  const { sqlite, request } = fixture(t);
  const profile = mkdtempSync(join(tmpdir(), 'companion-poll-'));
  const identity = await getDeviceIdentity(profile);
  sqlite.prepare('INSERT INTO devices VALUES (?,?,NULL,?)').run(identity.device_id, 'OLD', new Date().toISOString());
  seedMockTask(sqlite, { type: 'not.installed', spec: {} });
  const insert = sqlite.prepare(`INSERT INTO tasks(task_id,type,target_device_id,params_json,status,created_at)
    VALUES (?,?,?,?,'PENDING',?)`);
  insert.run('auto', 'mock.unit', identity.device_id, '{"value":"x"}', new Date().toISOString());
  insert.run('unknown', 'not.installed', identity.device_id, '{}', new Date().toISOString());
  let nextTimer,polls=0;
  const reading=Promise.withResolvers(),release=Promise.withResolvers();
  const runtime = await createDesktopTasks({ profile, request:async(path,options)=>{
    if(path.endsWith('/pending'))polls++;
    if(path==='/api/tasks/auto'&&options.method==='GET'){reading.resolve();await release.promise;}
    return request(path,options);
  }, dialog: { async showMessageBox() { return { response: 0 }; } },
    handlerModule: new URL('./fixtures/thread-handlers.mjs', import.meta.url).href,
    pollerOptions: { setTimer: fn => { nextTimer = fn; return 1; }, clearTimer: () => { nextTimer = null; } } });
  try {
    runtime.startPolling();
    await reading.promise;
    assert.equal(sqlite.prepare("SELECT status FROM tasks WHERE task_id='auto'").get().status, 'PENDING');
    assert.equal(runtime.executor.getTask('auto'),null);
    runtime.startPolling();await tick();assert.equal(polls,1);
    release.resolve();
    for(let i=0;i<400&&!nextTimer;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.ok(nextTimer);
    nextTimer();await tick();assert.equal(polls,2);
    assert.equal(sqlite.prepare("SELECT status FROM tasks WHERE task_id='auto'").get().status, 'COMPLETED');
    assert.equal(sqlite.prepare("SELECT status FROM tasks WHERE task_id='unknown'").get().status, 'PENDING');
    assert.equal(sqlite.prepare('SELECT computer_name FROM devices WHERE device_id=?').get(identity.device_id).computer_name, identity.computer_name);
    assert.equal(runtime.executor.getTask('auto').attempt_count, 1);
  } finally { release.resolve();await runtime.stop(); assert.equal(nextTimer, null); rmSync(profile, { recursive: true }); }
});

test('P06：自动获取不能绕过中断重做的继续执行选择，无配置不启动网络', async t => {
  const { sqlite, request } = fixture(t);
  const profile = mkdtempSync(join(tmpdir(), 'companion-poll-redo-'));
  const identity = await getDeviceIdentity(profile);
  sqlite.prepare('INSERT INTO devices VALUES (?,?,NULL,?)').run(identity.device_id, 'TEST', new Date().toISOString());
  const saved = createTaskExecutor({ databasePath: join(profile, 'tasks.sqlite'), deviceId: identity.device_id,
    handlers: { 'mock.unit': { risk: 'L1', validate() {}, execute() { throw Object.assign(new Error('interrupt'), { code: 'INTERRUPTED' }); } } } });
  await assert.rejects(saved.execute({ task_id: 'old', type: 'mock.unit', target_device_id: identity.device_id, params: { value: 'x' } }), { code: 'INTERRUPTED' });
  const replacement = saved.decideRecovery('old', 'redo').payload.replacement_task_id;
  saved.acknowledgeRecovery('old'); saved.close();
  sqlite.prepare(`INSERT INTO tasks(task_id,type,target_device_id,params_json,status,created_at)
    VALUES (?,'mock.unit',?,'{"value":"x"}','PENDING',?)`).run(replacement, identity.device_id, new Date().toISOString());
  let timer, polls = 0;
  const options = { profile, dialog: { async showMessageBox() { return { response: 0 }; } },
    handlerModule: new URL('./fixtures/thread-handlers.mjs', import.meta.url).href,
    pollerOptions: { setTimer: fn => { timer = fn; return 1; }, clearTimer: () => { timer = null; } } };
  let runtime = await createDesktopTasks({ ...options, request: (path, opts) => { if (path.endsWith('/pending')) polls++; return request(path, opts); } });
  try {
    runtime.startPolling();
    for (let i = 0; i < 50 && !timer; i++) await tick();
    assert.equal(polls, 1); assert.equal(runtime.executor.getTask(replacement), null);
    assert.equal(sqlite.prepare('SELECT status FROM tasks WHERE task_id=?').get(replacement).status, 'PENDING');
    await runtime.stop(); runtime = await createDesktopTasks({ ...options, request: null });
    runtime.startPolling(); await tick(); assert.equal(timer, null); assert.equal(polls, 1);
  } finally { await runtime.stop(); rmSync(profile, { recursive: true }); }
});

test('P07：本机配置可映射主站扩展前缀，不需要改内部任务接口', async t => {
  const profile = mkdtempSync(join(tmpdir(), 'companion-prefix-'));
  writeFileSync(join(profile, 'task-config.json'), JSON.stringify({ base_url: 'https://example.test/', api_token: 'isolated-test-only', api_prefix: '/api/companion' }));
  const identity = await getDeviceIdentity(profile), paths = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    paths.push(url.pathname);
    assert.equal(url.origin, 'https://example.test'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer isolated-test-only');
    if (options.method === 'PUT') return Response.json({ device: { device_id: identity.device_id } });
    return Response.json({ tasks: [], next_after: null });
  });
  let scheduled = false;
  const runtime = await createDesktopTasks({ profile, dialog: { async showMessageBox() { return { response: 0 }; } },
    pollerOptions: { setTimer: () => { scheduled = true; return 1; }, clearTimer() {} } });
  try {
    runtime.startPolling();
    for (let i = 0; i < 50 && !scheduled; i++) await tick();
    assert.deepEqual(paths, [`/api/companion/devices/${identity.device_id}`, `/api/companion/devices/${identity.device_id}/pending`]);
  } finally { await runtime.stop(); rmSync(profile, { recursive: true }); }
});

test('桌宠自动领取任一电脑和指定本机的任务，完成后从云端清单移除',async t=>{
  const {request}=fixture(t);
  const profile=mkdtempSync(join(tmpdir(),'companion-inbox-'));
  let legacy=false,reads=[];
  const runtime=await createDesktopTasks({profile,request:(path,options)=>{
    if(path.includes('/tasks?')){
      reads.push(new URLSearchParams(path.split('?')[1]).get('scope'));
      if(legacy&&reads.at(-1)==='standalone')return Response.json({error:{code:'INVALID_OFFSET'}},{status:400});
    }
    return request(path,options);
  },dialog:{},
    handlerModule:new URL('./fixtures/thread-handlers.mjs',import.meta.url).href});
  t.after(async()=>{await runtime.stop();rmSync(profile,{recursive:true});});
  const deviceId=runtime.identity.device_id;
  await request('/api/devices/'+deviceId,{method:'PUT',body:JSON.stringify({computer_name:'INBOX TEST'})});
  async function create(target_device_id){
    const {submission_id}=await (await request('/api/task-submissions',{method:'POST'})).json();
    const response=await request('/api/tasks',{method:'POST',body:JSON.stringify({
      submission_id,type:'mock.unit',target_device_id,params:{value:'test'},
    })});
    assert.equal(response.status,201);
    return (await response.json()).task_id;
  }
  const fixed=await create(deviceId),pool=await create('all'),elsewhere=await create(other);
  const before=await runtime.taskInbox.tasks(null);
  assert.equal(before.standalone,true);
  assert.deepEqual(reads,['standalone']);
  assert.deepEqual(new Set(before.tasks.map(task=>task.task_id)),new Set([fixed,pool]));
  assert.ok(before.tasks.every(task=>task.can_claim));
  legacy=true;
  const older=await runtime.taskInbox.tasks();
  assert.equal(older.standalone,false);
  assert.deepEqual(older.tasks,before.tasks);
  assert.deepEqual(reads,['standalone','standalone',null]);
  legacy=false;
  await runtime.pollOnce();
  const remote=id=>request('/api/tasks/'+id).then(response=>response.json());
  assert.equal((await Promise.all([fixed,pool].map(remote))).filter(task=>task.status==='COMPLETED').length,1);
  await runtime.pollOnce();
  for(const id of [fixed,pool]){
    const task=await remote(id);
    assert.equal(task.status,'COMPLETED');
    assert.equal(task.target_device_id,deviceId);
    assert.equal(runtime.executor.getTask(id).attempt_count,1);
  }
  assert.equal((await remote(elsewhere)).status,'PENDING');
  assert.deepEqual((await runtime.taskInbox.tasks()).tasks,[]);
  assert.deepEqual(runtime.taskInbox.local(),[]);
});
