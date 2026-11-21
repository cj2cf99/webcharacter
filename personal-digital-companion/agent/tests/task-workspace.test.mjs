import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChainPage} from '../host/chain-page.mjs';
import {handleCompanion} from '../host/subscriptions.mjs';
import {initializeDatabase, openTestDatabase} from './sqlite-d1.mjs';

function fixture(t) {
  const {DB, sqlite, close} = openTestDatabase();
  t.after(close);
  initializeDatabase(sqlite);
  for (const name of ['tasklist-hu-shi','tasklist-registration','tasklist-pc']) {
    sqlite.exec(readFileSync(new URL('../seeds/' + name + '.sql', import.meta.url), 'utf8'));
  }
  const env = {COMPANION_DB:DB, COMPANION_HOST:{}};
  const site = 'https://task-preview.test';
  const request = (path, body, origin = site, method = body === undefined ? 'GET' : 'POST', headers = {}) => new Request(site + path, {
    method, headers:{Origin:origin, 'Content-Type':'application/json',...headers},
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const api = (path, body, browser = true) => handleCompanion(request('/api/companion' + path, body), env, 'fixture', browser);
  const page = createChainPage({shell:html => html, authorize:(_req, options) => options.owner ? {sub:'fixture'} : null, script:'', style:''});
  const pageEnv = {COMPANION_ENABLED:'true', owner:true, SUBSCRIPTIONS_API:{
    fetchOwner:(req, owner) => handleCompanion(req, env, owner, true),
  }};
  return {api, page, request, pageEnv, sqlite};
}

test('网页入口兼容旧链接，读取和写入经过 Access 与同源门禁', async t => {
  const {page, request, pageEnv, api} = fixture(t);
  for (const path of ['/companion/tasks', '/companion/chains/']) {
    const response = await page(request(path), pageEnv);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /单条任务[\s\S]+任务模板/);
    assert.equal((await page(request(path), {...pageEnv, owner:false})).status, 403);
    assert.equal((await page(request(path), {...pageEnv, COMPANION_ENABLED:'false'})).status, 503);
  }
  assert.equal((await page(request('/api/companion/task-submissions', {}, 'https://other.test'), pageEnv)).status, 403);
  assert.equal((await page(request('/api/companion/task-overview'), pageEnv)).status, 200);
  assert.equal((await api('/tasks/pc-fixture/claim', {})).status, 404);
  assert.equal((await api('/task-overview', undefined, false)).status, 404);
});

test('终端管理可同源改名和读回浏览器绑定，原电脑 ID 仍是单条任务目标',async t=>{
  const {api,page,request,pageEnv,sqlite}=fixture(t);
  const pc='pc-10000000-0000-4000-8000-000000000001';
  const web='web-10000000-0000-4000-8000-000000000002';
  const seed=sqlite.prepare("INSERT INTO devices(device_id,computer_name,created_at) VALUES(?,?,'2026-11-20T00:00:00.000Z')");
  seed.run(pc,'测试电脑');seed.run(web,'浏览器');
  const devicePath='/api/companion/devices/'+pc;
  const alias={alias:'主力电脑'};
  assert.equal((await page(request(devicePath,alias,'https://other.test','PATCH'),pageEnv)).status,403);
  assert.equal((await page(request(devicePath,alias,undefined,'PATCH'),{...pageEnv,owner:false})).status,403);
  const renamed=await page(request(devicePath,alias,undefined,'PATCH'),pageEnv);
  assert.equal(renamed.status,200);
  assert.equal((await renamed.json()).device.display_name,'主力电脑');
  const {submission_id}=await (await api('/task-submissions',{})).json();
  const created=await api('/tasks',{submission_id,type:'pc.echo',target_device_id:pc,params:{text:'指定电脑'}});
  assert.equal(created.status,201);
  const task=await created.json();
  assert.equal(task.target_device_id,pc);
  assert.equal(task.target_device.display_name,'主力电脑');
  const claim=await page(request('/api/companion/terminal/claim',{device_id:web}),pageEnv);
  assert.equal(claim.status,200);
  const cookie=claim.headers.get('Set-Cookie');
  assert.match(cookie,/; HttpOnly; SameSite=Lax; Path=\/; Max-Age=31536000; Secure/);
  const current=await page(request('/api/companion/terminal',undefined,undefined,'GET',{Cookie:'unrelated=private; '+cookie.split(';')[0]}),pageEnv);
  assert.equal((await current.json()).terminal.device_id,web);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM devices').get().count,2);
});

test('任务列表可分页和筛选，包含旧任务并隐藏其他账户的单条及任务链节点', async t => {
  const {api, sqlite} = fixture(t);
  const add = sqlite.prepare("INSERT INTO tasks(task_id,type,params_json,status,created_at) VALUES(?,'pc.echo','{}',?,'2026-11-20T00:00:00.000Z')");
  for (let i = 0; i < 34; i++) add.run('legacy-' + String(i).padStart(2,'0'), i === 0 ? 'COMPLETED' : 'PENDING');
  add.run('other-task','PENDING');
  add.run('other-node','PENDING');
  sqlite.exec(`
    INSERT INTO task_submissions VALUES ('other-submit','other-owner'),('other-chain','other-owner');
    UPDATE tasks SET submission_id='other-submit' WHERE task_id='other-task';
    INSERT INTO chains(chain_id,name,created_at,temporary_registration) VALUES ('other-chain','另一账户','2026-11-20T00:00:00.000Z',1);
    INSERT INTO chain_nodes(node_id,chain_id,node_key,position,current_task_id) VALUES ('node','other-chain','node',0,'other-node');
    UPDATE tasks SET chain_node_id='node' WHERE task_id='other-node';
  `);
  const first = await (await api('/task-overview')).json();
  assert.equal(first.tasks.length,30);
  assert.equal(first.tasks[0].task_id,'legacy-33');
  assert.equal(Object.hasOwn(first.tasks[0],'params'),false);
  const next = await (await api('/task-overview?after=' + first.next_after)).json();
  assert.deepEqual(next.tasks.map(row => row.task_id), ['legacy-03','legacy-02','legacy-01','legacy-00']);
  assert.equal(next.next_after,null);
  assert.deepEqual((await (await api('/task-overview?status=COMPLETED')).json()).tasks.map(row => row.task_id),['legacy-00']);
  assert.equal((await api('/task-overview?after=other-task')).status,400);
  assert.equal((await api('/task-overview?status=FAILED&status=COMPLETED')).status,400);
  for (const id of ['other-task','other-node']) {
    assert.equal((await api('/tasks/' + id)).status,404);
    assert.equal((await api('/tasks/' + id + '/cancel', {})).status,404);
  }
  assert.equal((await api('/tasks/legacy-00')).status,200);
});

test('从模板新建复用提交号，网页取消只适用于未领取的单条任务', async t => {
  const {api, sqlite} = fixture(t);
  const {tasklist} = await (await api('/tasklist')).json();
  assert.equal(tasklist.find(row => row.type === 'pc.echo').standalone,true);
  assert.equal(tasklist.find(row => row.type === 'diaries.create').standalone,false);
  sqlite.exec("INSERT INTO tasks(task_id,type,params_json,status,created_at) VALUES('legacy-cloud','hu-shi.food.create','{}','PENDING','2026-11-20T00:00:00.000Z')");
  assert.equal((await api('/tasks/legacy-cloud')).status,200);
  const {submission_id} = await (await api('/task-submissions', {})).json();
  assert.equal((await api('/tasks', {submission_id, type:'diaries.create', params:{title:'测试',content:'测试'}})).status,409);
  const manualCloud={submission_id,type:'hu-shi.food.create',params:{body:'验收记录'}};
  assert.equal((await api('/tasks',manualCloud)).status,409);
  const machineCloud=await api('/tasks',{...manualCloud,submission_id:(await (await api('/task-submissions',{})).json()).submission_id},false);
  assert.equal(machineCloud.status,201);
  assert.equal((await api('/tasks/'+(await machineCloud.json()).task_id+'/execute',{})).status,409);
  const body = {submission_id, type:'pc.echo', target_device_id:'all', params:{text:'隔离任务'}};
  const created = await api('/tasks', body);
  assert.equal(created.status,201);
  const {task_id} = await created.json();
  assert.equal((await (await api('/tasks', body)).json()).task_id, task_id);
  const cancelled = await api('/tasks/' + task_id + '/cancel', {});
  assert.equal((await cancelled.json()).task.status, 'CANCELLED');
  const chain = await (await api('/chains', {name:'旧链',nodes:[{key:'one',type:'pc.echo',target_device_id:'all',params:{text:'旧链'}}]}, false)).json();
  const node = chain.nodes[0].current_task.task_id;
  assert.equal((await api('/tasks/' + node + '/cancel', {})).status,409);
  assert.equal(sqlite.prepare('SELECT status FROM tasks WHERE task_id=?').get(node).status,'PENDING');
});

test('网页只能新建电脑链，自动登记原路径仍可建链，列表过滤保持兼容', async t => {
  const {api,sqlite} = fixture(t);
  const issue = async () => (await (await api('/task-submissions',{})).json()).submission_id;
  const pc = (key,depends_on = null) => ({key,depends_on,type:'pc.echo',target_device_id:'all',params:{text:'测试'}});
  const cloud = {key:'entry',type:'diaries.create',target_device_id:null,params:{title:'样本',content:'样本'}};
  assert.equal((await api('/chains',{nodes:[pc('first')]})).status,400);
  assert.equal((await api('/chains',{submission_id:await issue(),nodes:[cloud]})).status,400);
  assert.equal((await api('/chains',{submission_id:await issue(),nodes:Array.from({length:6},(_,index)=>pc('step'+index))})).status,400);
  const draft = {name:'前置步骤',submission_id:await issue(),nodes:[pc('first'),pc('next','first')]};
  const first = await api('/chains',draft);
  assert.equal(first.status,201);
  const chain = await first.json();
  assert.equal(chain.nodes[1].depends_on,chain.nodes[0].node_id);
  assert.equal((await (await api('/chains',draft)).json()).chain_id,chain.chain_id);
  const automatic={submission_id:await issue(),temporary_registration:true,nodes:[cloud]};
  assert.equal((await api('/chains',automatic)).status,400);
  assert.equal((await api('/chains',automatic,false)).status,201);
  const active = await (await api('/chains?status=ACTIVE')).json();
  assert.equal(active.chains.length,2);
  assert.equal((await (await api('/task-overview?status=ACTIVE')).json()).tasks.length,0);
  assert.equal((await api('/task-overview?after='+chain.nodes[0].current_task.task_id)).status,400);
  assert.equal((await (await api('/task-template-overview?status=ACTIVE')).json()).tasklist.find(row=>row.type==='pc.echo').active_count,2);
  assert.equal((await api('/chains/' + chain.chain_id + '/stop',{request_id:'stop-web-1'})).status,200);
  assert.equal((await (await api('/chains?status=ACTIVE')).json()).chains.length,1);
  assert.equal((await (await api('/task-overview?status=ACTIVE')).json()).tasks.length,0);
  assert.equal((await (await api('/task-template-overview?status=ACTIVE')).json()).tasklist.some(row=>row.type==='pc.echo'),false);
  for(let index=0;index<22;index++){
    sqlite.prepare("INSERT INTO chains(chain_id,name,created_at) VALUES(?,?,'2000-01-01T00:00:00.000Z')")
      .run('legacy-'+String(index).padStart(2,'0'),'旧任务链');
  }
  const completed = await (await api('/chains?status=COMPLETED')).json();
  assert.equal(completed.chains.length,20);
  assert.equal((await (await api('/chains?status=COMPLETED&after='+completed.next_after)).json()).chains.length,2);
});
