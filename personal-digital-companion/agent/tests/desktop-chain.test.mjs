import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import worker from '../worker.mjs';
import {openTestDatabase,initializeDatabase} from './sqlite-d1.mjs';
import {seedMockTask} from './fixtures.mjs';
import {getDeviceIdentity} from '../devices/identity.mjs';
import {createDesktopTasks} from '../../desktop/task-lifecycle.mjs';
const handlerModule=new URL('./fixtures/thread-handlers.mjs',import.meta.url).href;
const tick=()=>new Promise(setImmediate);
async function setup(t){
  const db=openTestDatabase();initializeDatabase(db.sqlite);
  seedMockTask(db.sqlite,{type:'mock.unit',spec:{value:{type:'string',required:true},mode:{type:'string',required:false}}});
  const profiles=[],runtimes=[],prompts=[];
  const request=(path,options={})=>worker.fetch(new Request(`https://test.invalid${path}`,{...options,headers:{Authorization:'Bearer test',...options.headers}}),{DB:db.DB,API_TOKEN:'test'});
  for(let i=0;i<2;i++){
    const profile=mkdtempSync(join(tmpdir(),'desktop-chain-'));profiles.push(profile);
    const identity=await getDeviceIdentity(profile);
    db.sqlite.prepare('INSERT INTO devices VALUES (?,?,NULL,?)').run(identity.device_id,`PC${i}`,new Date().toISOString());
    runtimes.push(await createDesktopTasks({profile,request,handlerModule,dialog:{async showMessageBox(p){prompts.push(p);return {response:0};}}}));
  }
  t.after(async()=>{for(const runtime of runtimes)await runtime.stop();db.close();for(const p of profiles)rmSync(p,{recursive:true});});
  return {db,request,runtimes,prompts};
}
test('DT01：真实桌面显式执行→另一终端强制重做→终端切换与旧轮保留',async t=>{
  const {request,runtimes:[first,second]}=await setup(t);
  const response=await request('/api/chains',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodes:[{key:'a',type:'mock.unit',target_device_id:first.identity.device_id,params:{value:'x'}}]})});
  assert.equal(response.status,201);const created=await response.json(),old=created.nodes[0].current_task.task_id;
  assert.deepEqual((await first.taskInbox.chains()).chains.map(chain=>chain.chain_id),[created.chain_id]);
  const detail=await first.taskInbox.detail(created.chain_id);
  assert.equal(detail.name,created.name);
  assert.deepEqual(detail.nodes,[{node_id:created.nodes[0].node_id,depends_on:null,
    task_id:old,name:created.nodes[0].current_task.definition.name,status:'PENDING',params:{value:'x'},
    progress:undefined,can_claim:true}]);
  const tasksPath='/api/devices/'+first.identity.device_id+'/tasks';
  assert.ok((await (await request(tasksPath)).json()).tasks.some(task=>task.task_id===old));
  const inbox=await first.taskInbox.tasks();
  assert.equal(inbox.standalone,true);
  assert.deepEqual(inbox.tasks,[]);
  assert.ok((await (await request(tasksPath.replace(/\/tasks$/,'/pending'))).json()).tasks.some(task=>task.task_id===old));
  await first.runTask(old);
  assert.deepEqual((await first.taskInbox.chains()).chains,[]);
  const before=await second.chainClient.get(created.chain_id);assert.equal(before.nodes[0].current_task.status,'COMPLETED');
  await second.chainClient.decide(created.chain_id,before.nodes[0],'force');
  const after=await second.chainClient.get(created.chain_id),fresh=after.nodes[0].current_task;
  assert.equal(fresh.status,'COMPLETED');assert.notEqual(fresh.task_id,old);assert.equal(fresh.target_device_id,second.identity.device_id);
  assert.equal(after.history.filter(h=>h.action==='force').length,1);assert.equal(first.executor.getTask(old).status,'COMPLETED');
  assert.equal(second.executor.getTask(fresh.task_id).attempt_count,1);assert.equal(second.chainClient.pending().length,0);
});
test('DT02：最终两次失败会报告并展开全链，不自动继续后继',async t=>{
  const {request,runtimes:[runtime],prompts}=await setup(t);
  const response=await request('/api/chains',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodes:[
    {key:'a',type:'mock.unit',target_device_id:runtime.identity.device_id,params:{value:'x',mode:'fail'}},
    {key:'b',type:'mock.unit',target_device_id:runtime.identity.device_id,params:{value:'y'},depends_on:'a'}]})});
  const chain=await response.json();await runtime.runTask(chain.nodes[0].current_task.task_id);
  for(let i=0;i<20&&!prompts.some(p=>p.title==='完整任务链');i++)await tick();
  assert.ok(prompts.some(p=>p.message==='任务最终失败，本轮已结束'));
  assert.ok(prompts.some(p=>p.title==='完整任务链'&&p.detail.includes('FAILED')&&p.detail.includes('等待前置')));
  const after=await runtime.chainClient.get(chain.chain_id);assert.equal(after.nodes[0].current_task.attempt_count,2);
  assert.equal(after.nodes[1].current_task.status,'PENDING');assert.equal(after.nodes[1].eligibility.claim,false);
});
test('DT03：中断后显式放弃即跳过，后继可选但不自动执行，旧本地操作已确认',async t=>{
  const {request,runtimes:[runtime]}=await setup(t);
  const response=await request('/api/chains',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodes:[
    {key:'a',type:'mock.unit',target_device_id:runtime.identity.device_id,params:{value:'x',mode:'crash'}},
    {key:'b',type:'mock.unit',target_device_id:runtime.identity.device_id,params:{value:'y'},depends_on:'a'}]})});
  const chain=await response.json(),id=chain.nodes[0].current_task.task_id;
  await assert.rejects(runtime.runTask(id));
  assert.equal(runtime.executor.getTask(id).status,'RUNNING');
  assert.deepEqual(runtime.taskInbox.local(),[],'上次中断的任务需要核对，不表示本机仍在执行');
  await runtime.decide(id,'abandon');
  const after=await runtime.chainClient.get(chain.chain_id);
  assert.equal(after.nodes[0].current_task.status,'CANCELLED');assert.equal(after.nodes[0].skipped,true);
  assert.equal(after.nodes[1].eligibility.claim,true);assert.equal(after.nodes[1].current_task.status,'PENDING');
  assert.equal(runtime.executor.getRecovery(id).acknowledged,true);assert.equal(runtime.chainClient.pending().length,0);
});
