import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker.mjs';
import {openTestDatabase,initializeDatabase} from './sqlite-d1.mjs';
import {seedMockTask,withTaskSubmission} from './fixtures.mjs';
import {createTaskExecutor} from '../execution/runner.mjs';
import {createTaskSync} from '../execution/sync.mjs';
const a='pc-12345678-1234-4123-8123-123456789abc',b='pc-22345678-1234-4123-8123-123456789abc';
function setup(t){
  const db=openTestDatabase();initializeDatabase(db.sqlite);t.after(()=>db.close());
  seedMockTask(db.sqlite,{type:'mock.unit',spec:{value:{type:'string',required:true}}});
  for(const id of [a,b])db.sqlite.prepare('INSERT INTO devices VALUES(?,?,NULL,?)').run(id,id,new Date().toISOString());
  const request=(path,options={})=>worker.fetch(new Request('https://test'+path,{...options,headers:{Authorization:'Bearer test',...options.headers}}),{DB:db.DB,API_TOKEN:'test'});
  const call=async(path,body)=>{if(path==='/api/tasks')body=await withTaskSubmission((url, value)=>request(url,{method:'POST',body:JSON.stringify(value)}),body);const r=await request(path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
  const node=(key,depends_on)=>({key,type:'mock.unit',target_device_id:a,params:{value:key},...(depends_on?{depends_on}:{})});
  const create=async(nodes=[node('a'),node('b','a')])=>{const r=await call('/api/chains',{nodes});assert.equal(r.status,201,JSON.stringify(r));return r.body;};
  const claim=(task,device=a,request_id=crypto.randomUUID())=>call(`/api/tasks/${task.task_id}/claim`,{device_id:device,request_id});
  const decide=(chain,index,action,device=a,extra={})=>call(`/api/chains/${chain.chain_id}/nodes/${chain.nodes[index].node_id}/decision`,{action,device_id:device,request_id:crypto.randomUUID(),expected_task_id:chain.nodes[index].current_task.task_id,...(action==='skip'?{}:{new_task_id:crypto.randomUUID()}),...extra});
  const view=async chain=>(await call(`/api/chains/${chain.chain_id}?device_id=${a}`)).body;
  const report=async(task,status='COMPLETED',device=a)=>{
    const executions=Array.from({length:status==='FAILED'?2:1},(_,i)=>({execution_id:crypto.randomUUID(),task_id:task.task_id,attempt_no:i+1,status,started_at:`2026-11-18T00:00:0${i*2}.000Z`,finished_at:`2026-11-18T00:00:0${i*2+1}.000Z`,result:status==='COMPLETED'?{ok:true}:null,error:status==='FAILED'?'任务执行失败':null}));
    const body={device_id:device,status,attempt_count:executions.length,result:executions.at(-1).result,error:executions.at(-1).error,executions};
    return {...await call(`/api/tasks/${task.task_id}/result`,body),payload:body};
  };
  return {...db,request,call,node,create,claim,decide,view,report};
}
test('CH01：1至5节点，同组单前置无循环，事务失败不留半组',async t=>{
  const db=setup(t);
  for(const nodes of [[],Array.from({length:6},(_,i)=>db.node(String(i))),[db.node('a','a')],[db.node('a','missing')],[db.node('a','b'),db.node('b','a')],[db.node('a'),db.node('a')]])assert.equal((await db.call('/api/chains',{nodes})).status,400);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM tasks').get().n,0);
  db.sqlite.exec("CREATE TRIGGER break_node BEFORE INSERT ON chain_nodes BEGIN SELECT RAISE(ABORT,'test'); END");
  assert.equal((await db.call('/api/chains',{nodes:[db.node('a')]})).status,500);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM chains').get().n,0);
});
test('任务链同号并发只建一次，回执丢失时同号取回原链',async t=>{
  const db=setup(t);
  const {body:{submission_id}}=await db.call('/api/task-submissions',{});
  const original={submission_id,name:'临时链',nodes:[
    {...db.node('a'),deadline_at:'2026-11-20T09:00:00+09:00'},db.node('b','a'),
  ]};
  const result=await Promise.all([db.call('/api/chains',original),db.call('/api/chains',original)]);
  assert.deepEqual(result.map(item=>item.status).sort(),[200,201]);
  assert.equal(result[0].body.chain_id,submission_id);
  assert.deepEqual(result[0].body,result[1].body);
  const same={...original,name:' 临时链 ',nodes:[
    {...original.nodes[0],deadline_at:'2026-11-20T00:00:00Z',depends_on:null},original.nodes[1],
  ]};
  assert.deepEqual(await db.call('/api/chains',same),{status:200,body:result[0].body});
  assert.equal((await db.call('/api/chains',{...original,name:'改变名称'})).body.error.code,'SUBMISSION_CONFLICT');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM chains').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM tasks').get().n,2);
  const {body:{submission_id:another}}=await db.call('/api/task-submissions',{});
  assert.equal((await db.call('/api/chains',{...original,submission_id:another})).status,201);
});
test('任务与链共用提交号时只能占用一次，链建失败可重试原号',async t=>{
  const db=setup(t);
  const issue=async()=>(await db.call('/api/task-submissions',{})).body.submission_id;
  const submitTask=async id=>db.request('/api/tasks',{method:'POST',body:JSON.stringify({
    submission_id:id,type:'mock.unit',target_device_id:a,params:{value:'standalone'},
  })});
  const original=await issue();
  const chainBody={submission_id:original,nodes:[db.node('a')]};
  db.sqlite.exec("CREATE TRIGGER break_once BEFORE INSERT ON chain_nodes BEGIN SELECT RAISE(ABORT,'test'); END");
  assert.equal((await db.call('/api/chains',chainBody)).status,500);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM chains').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM tasks').get().n,0);
  db.sqlite.exec('DROP TRIGGER break_once');
  assert.equal((await db.call('/api/chains',chainBody)).status,201);
  assert.equal((await submitTask(original)).status,409);

  const used=await issue();
  assert.equal((await submitTask(used)).status,201);
  assert.equal((await db.call('/api/chains',{...chainBody,submission_id:used})).status,409);

  const concurrent=await issue();
  const contested=await Promise.all([
    submitTask(concurrent),
    db.call('/api/chains',{...chainBody,submission_id:concurrent}),
  ]);
  assert.deepEqual(contested.map(result=>result.status).sort(),[201,409]);

  const foreign=crypto.randomUUID();
  db.sqlite.prepare('INSERT INTO task_submissions VALUES (?,?)').run(foreign,'another-owner');
  assert.equal((await db.call('/api/chains',{...chainBody,submission_id:foreign})).status,409);
  assert.equal((await db.call('/api/chains',{...chainBody,submission_id:crypto.randomUUID()})).status,409);
});
test('十一项临时登记保留原顺序并组成同一条链，模板仍最多五项',async t=>{
  const db=setup(t);
  seedMockTask(db.sqlite,{type:'mock.registration',executor:'cloud',spec:{value:{type:'string',required:true}}});
  const nodes=Array.from({length:11},(_,index)=>({
    key:`entry-${index+1}`,type:'mock.registration',target_device_id:null,params:{value:`登记${index+1}`},
  }));
  const {body:{submission_id}}=await db.call('/api/task-submissions',{});
  assert.equal((await db.call('/api/chains',{nodes})).status,400);
  assert.equal((await db.call('/api/chains',{nodes,temporary_registration:true})).body.error.code,'INVALID_SUBMISSION_ID');
  const payload={nodes,temporary_registration:true,submission_id};
  const created=await Promise.all([db.call('/api/chains',payload),db.call('/api/chains',payload)]);
  assert.deepEqual(created.map(result=>result.status).sort(),[200,201]);
  assert.deepEqual(created[0].body,created[1].body);
  assert.equal(created[0].body.chain_id,submission_id);
  assert.deepEqual(created[0].body.nodes.map(node=>node.key),nodes.map(node=>node.key));
  assert.deepEqual((await db.view(created[0].body)).nodes.map(node=>node.key),nodes.map(node=>node.key));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM chains').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM tasks').get().n,11);
  assert.equal((await db.call('/api/chains',{...payload,nodes:nodes.slice(0,-1)})).body.error.code,'SUBMISSION_CONFLICT');
});
test('长链写入失败会整条回滚，使用原提交号可以重试',async t=>{
  const db=setup(t);
  seedMockTask(db.sqlite,{type:'mock.registration',executor:'cloud',spec:{value:{type:'string',required:true}}});
  const {body:{submission_id}}=await db.call('/api/task-submissions',{});
  const nodes=Array.from({length:10},(_,index)=>({
    key:`entry-${index+1}`,type:'mock.registration',target_device_id:null,params:{value:'登记'},
  }));
  const payload={nodes,temporary_registration:true,submission_id};
  const withPc={...payload,nodes:[...nodes.slice(0,-1),db.node('pc-task')]};
  assert.equal((await db.call('/api/chains',withPc)).body.error.code,'INVALID_TARGET');
  db.sqlite.exec("CREATE TRIGGER break_long_chain BEFORE INSERT ON chain_nodes WHEN NEW.position=8 BEGIN SELECT RAISE(ABORT,'test'); END");
  assert.equal((await db.call('/api/chains',payload)).status,500);
  for(const table of ['chains','chain_nodes','tasks']){
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
  }
  db.sqlite.exec('DROP TRIGGER break_long_chain');
  const saved=await db.call('/api/chains',payload);
  assert.equal(saved.status,201);
  assert.equal(saved.body.nodes.length,10);
});
test('临时长链保留显式跨五节点前置，拒绝循环后可用原号提交',async t=>{
  const db=setup(t);
  seedMockTask(db.sqlite,{type:'mock.registration',executor:'cloud',spec:{}});
  const {body:{submission_id}}=await db.call('/api/task-submissions',{});
  const nodes=Array.from({length:11},(_,index)=>({
    key:`entry-${index+1}`,type:'mock.registration',target_device_id:null,params:{},
  }));
  nodes[0].depends_on='entry-6';
  nodes[10].depends_on='entry-1';
  const payload={nodes,temporary_registration:true,submission_id};
  const cycle=nodes.map((node,index)=>index===5?{...node,depends_on:'entry-11'}:node);
  const invalid=await db.call('/api/chains',{...payload,nodes:cycle});
  assert.equal(invalid.status,400);
  assert.equal(invalid.body.error.code,'CYCLIC_CHAIN');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM chains').get().n,0);
  const created=await db.call('/api/chains',payload);
  assert.equal(created.status,201);
  const saved=created.body.nodes;
  assert.equal(saved[0].depends_on,saved[5].node_id);
  assert.equal(saved[10].depends_on,saved[0].node_id);
  assert.ok(saved[10].reasons.claim.some(reason=>reason.code==='DEPENDENCY_PENDING'));
  assert.equal(saved[3].depends_on,null);
});
test('010迁移保留已有节点、前置关系及历史任务轮次',t=>{
  const db=openTestDatabase();t.after(db.close);
  for(const file of [
    '001-task-units.sql','002-executions.sql','003-task-activity.sql','004-task-deadline.sql','005-task-recoveries.sql',
    '006-chains.sql','007-task-submissions.sql','008-daily-logs.sql','009-chain-submissions.sql',
  ])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  seedMockTask(db.sqlite,{type:'mock.registration',executor:'cloud',spec:{}});
  db.sqlite.exec(`
    INSERT INTO chains (chain_id,name,created_at) VALUES ('legacy','旧链','2026-11-18T00:00:00Z');
    INSERT INTO tasks (task_id,type,params_json,status,created_at) VALUES
      ('initial','mock.registration','{}','CANCELLED','2026-11-18T00:00:00Z'),
      ('current','mock.registration','{}','COMPLETED','2026-11-18T00:00:00Z'),
      ('next','mock.registration','{}','PENDING','2026-11-18T00:00:00Z');
    INSERT INTO chain_nodes (node_id,chain_id,node_key,position,depends_on,current_task_id) VALUES
      ('first','legacy','a',0,NULL,'current'),('second','legacy','b',1,'first','next');
    UPDATE tasks SET chain_node_id='first',superseded_by_task_id='current' WHERE task_id='initial';
    UPDATE tasks SET chain_node_id='first' WHERE task_id='current';
    UPDATE tasks SET chain_node_id='second' WHERE task_id='next';
    UPDATE chain_nodes SET skipped_task_id='initial' WHERE node_id='first';
  `);
  const beforeNodes=db.sqlite.prepare('SELECT * FROM chain_nodes ORDER BY position').all();
  const beforeTasks=db.sqlite.prepare('SELECT * FROM tasks ORDER BY task_id').all();
  const sql=readFileSync(new URL('../migrations/010-temporary-chain-positions.sql',import.meta.url),'utf8');
  db.sqlite.exec(`BEGIN;\n${sql}\nCOMMIT;`);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM chain_nodes ORDER BY position').all(),beforeNodes);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM tasks ORDER BY task_id').all(),beforeTasks);
  assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.sqlite.prepare('PRAGMA quick_check').get().quick_check,'ok');
  assert.throws(()=>db.sqlite.exec("UPDATE chain_nodes SET position=-1 WHERE node_id='second'"),/CHECK constraint failed/);
});
test('CH02：主动领取，同请求回放/不同请求拒绝，全部任务共用两个名额',async t=>{
  const db=setup(t),chain=await db.create([db.node('a'),db.node('b'),db.node('c')]),task=chain.nodes[0].current_task;
  const request_id=crypto.randomUUID(),first=await db.claim(task,a,request_id);
  assert.equal(first.status,200);assert.deepEqual((await db.claim(task,a,request_id)).body,first.body);
  assert.equal((await db.claim(task)).status,409);
  const standalone=(await db.call('/api/tasks',{type:'mock.unit',target_device_id:a,params:{value:'standalone'}})).body;
  assert.equal((await db.claim(standalone)).status,200);
  assert.equal((await db.claim(chain.nodes[1].current_task)).body.error.code,'CAPACITY_FULL');
  const current=await db.view(chain);assert.equal(current.held_count,2);assert.equal(current.nodes[1].current_task.can_claim,false);
  assert.equal((await db.call(`/api/devices/${a}/pending`)).body.tasks.length,0);
  assert.equal((await db.report(task)).status,200);assert.equal((await db.claim(chain.nodes[1].current_task)).status,200);
});
test('CH03：失败继续新ID保留两次历史，skip放行，stop不取消已领取',async t=>{
  const db=setup(t);let chain=await db.create();const old=chain.nodes[0].current_task;
  assert.equal((await db.claim(chain.nodes[1].current_task)).body.error.code,'DEPENDENCY_PENDING');
  await db.claim(old);await db.report(old,'FAILED');
  const req=crypto.randomUUID(),next=crypto.randomUUID();const redo=await db.decide(chain,0,'continue',a,{request_id:req,new_task_id:next});
  assert.equal(redo.status,200,JSON.stringify(redo));assert.equal(redo.body.claimReceipt.task.task_id,next);
  assert.deepEqual((await db.decide(chain,0,'continue',a,{request_id:req,new_task_id:next})).body,redo.body);
  assert.equal((await db.call(`/api/tasks/${old.task_id}`)).body.executions.length,2);
  assert.equal(redo.body.claimReceipt.task.activity.event,'claim');
  chain=redo.body.chain;await db.report(chain.nodes[0].current_task,'FAILED');
  const skipped=await db.decide(chain,0,'skip');assert.equal(skipped.status,200);assert.equal(skipped.body.chain.nodes[1].eligibility.claim,true);
  const child=chain.nodes[1].current_task;await db.claim(child);
  assert.equal((await db.call(`/api/chains/${chain.chain_id}/stop`,{device_id:a,request_id:crypto.randomUUID()})).status,200);
  assert.equal((await db.report(child)).status,200);assert.equal((await db.view(chain)).status,'STOPPED');
});
test('CH04：force更新归属，旧终态归档不覆盖当前轮，旧未知记录可放弃',async t=>{
  const db=setup(t),chain=await db.create(),old=chain.nodes[0].current_task;await db.claim(old);
  const moved=await db.decide(chain,0,'force',b);assert.equal(moved.status,200,JSON.stringify(moved));
  assert.equal(moved.body.operation.from_device_id,a);assert.equal(moved.body.operation.to_device_id,b);
  const oldView=(await db.call(`/api/tasks/${old.task_id}`)).body;assert.equal(oldView.status,'CANCELLED');assert.equal(oldView.chain.current,false);
  const snapshot={...old,status:'RUNNING',attempt_count:1,result:null,error:null,executions:[{execution_id:'unknown',task_id:old.task_id,attempt_no:1,status:'RUNNING',started_at:'2026-11-18T00:00:00.000Z',finished_at:null,result:null,error:null}]};
  const {task_id,type,target_device_id,params,status,attempt_count,result,error,executions}=snapshot;
  const recovery={device_id:a,decision:'abandon',replacement_task_id:null,snapshot:{task_id,type,target_device_id,params,status,attempt_count,result,error,executions}};
  assert.equal((await db.call(`/api/tasks/${old.task_id}/recover`,{...recovery,decision:'redo',replacement_task_id:'new-id'})).body.error.code,'OLD_ROUND');
  assert.equal((await db.call(`/api/tasks/${old.task_id}/recover`,recovery)).status,200);
  const archived=await db.report(old);assert.equal(archived.status,200);assert.equal(archived.body.archived,true);
  assert.equal((await db.call(`/api/tasks/${old.task_id}/result`,archived.payload)).status,200);
  assert.equal((await db.view(chain)).nodes[0].current_task.status,'RUNNING');
  assert.equal((await db.view(chain)).nodes[1].eligibility.claim,false);
  assert.equal((await db.report(moved.body.claimReceipt.task,'COMPLETED',b)).status,200);
  assert.equal((await db.view(chain)).nodes[1].eligibility.claim,true);
});
test('CH05：重做祖先使未领取后代等待，已领取后代可完成且不自动重做',async t=>{
  const db=setup(t);let chain=await db.create([db.node('a'),db.node('b','a'),db.node('c','b')]);
  await db.claim(chain.nodes[0].current_task);await db.report(chain.nodes[0].current_task);
  const claimed=await db.claim(chain.nodes[1].current_task);
  const forced=await db.decide(chain,0,'force');assert.equal(forced.status,200);
  let runs=0;const executor=createTaskExecutor({databasePath:':memory:',deviceId:a,handlers:{'mock.unit':{risk:'L1',validate(){},async execute(){runs++;return {};}}}});t.after(()=>executor.close());
  const sync=createTaskSync({request:db.request,executor,deviceId:a});
  await sync.executeClaimed(claimed.body.claimReceipt);await sync.executeClaimed(claimed.body.claimReceipt);assert.equal(runs,1);
  chain=await db.view(chain);assert.equal(chain.nodes[1].current_task.status,'COMPLETED');assert.equal(chain.nodes[2].eligibility.claim,false);
  assert.equal((await db.claim(chain.nodes[2].current_task)).body.error.code,'DEPENDENCY_PENDING');
  await db.report(forced.body.claimReceipt.task);assert.equal((await db.view(chain)).nodes[2].eligibility.claim,true);
});
test('CH06：force仍受截止与名额约束，失败事务不改变旧归属',async t=>{
  const db=setup(t),chain=await db.create();const old=chain.nodes[0].current_task;await db.claim(old);
  db.sqlite.prepare('UPDATE tasks SET deadline_at=? WHERE task_id=?').run('2000-01-01T00:00:00.000Z',old.task_id);
  assert.equal((await db.decide(chain,0,'force')).body.error.code,'TASK_DEADLINE_PASSED');
  db.sqlite.prepare('UPDATE tasks SET deadline_at=NULL WHERE task_id=?').run(old.task_id);
  for(let i=0;i<2;i++){const fresh=(await db.call('/api/tasks',{type:'mock.unit',target_device_id:b,params:{value:String(i)}})).body;await db.claim(fresh,b);}
  assert.equal((await db.decide(chain,0,'force',b)).body.error.code,'CAPACITY_FULL');
  db.sqlite.exec("CREATE TRIGGER break_op BEFORE INSERT ON task_operations WHEN NEW.action='force' BEGIN SELECT RAISE(ABORT,'test'); END");
  const count=db.sqlite.prepare('SELECT COUNT(*) n FROM tasks').get().n;
  assert.equal((await db.decide(chain,0,'force')).status,409);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM tasks').get().n,count);assert.equal((await db.view(chain)).nodes[0].current_task.task_id,old.task_id);
});
test('CH07：中断redo不能绕过祖先；当前轮abandon明确skip且保留未知快照',async t=>{
  const db=setup(t),chain=await db.create(),parent=chain.nodes[0].current_task,child=chain.nodes[1].current_task;
  await db.claim(parent);await db.report(parent);await db.claim(child);
  const snapshot={task_id:child.task_id,type:child.type,target_device_id:a,params:child.params,status:'RUNNING',attempt_count:1,result:null,error:null,
    executions:[{execution_id:'unknown-child',task_id:child.task_id,attempt_no:1,status:'RUNNING',started_at:'2026-11-18T00:00:00.000Z',finished_at:null,result:null,error:null}]};
  const payload={device_id:a,decision:'redo',replacement_task_id:'recover-child',snapshot};
  const forced=await db.decide(chain,0,'force');assert.equal(forced.status,200);
  assert.equal((await db.call(`/api/tasks/${child.task_id}/recover`,payload)).body.error.code,'DEPENDENCY_PENDING');
  await db.report(forced.body.claimReceipt.task);
  const redo=await db.call(`/api/tasks/${child.task_id}/recover`,payload);assert.equal(redo.status,200,JSON.stringify(redo));
  assert.equal(redo.body.replacement.chain.current,true);assert.equal(redo.body.task.chain.current,false);
  assert.equal(redo.body.replacement.status,'PENDING');
  await db.claim(redo.body.replacement);
  const abandon={...payload,decision:'abandon',replacement_task_id:null,snapshot:{...snapshot,task_id:'recover-child',executions:[{...snapshot.executions[0],task_id:'recover-child',execution_id:'unknown-redo'}]}};
  assert.equal((await db.call('/api/tasks/recover-child/recover',abandon)).status,200);
  const repeated=await db.call('/api/tasks/recover-child/recover',abandon);assert.equal(repeated.status,200);
  assert.deepEqual(repeated.body.recovery.snapshot,abandon.snapshot);
  const view=await db.view(chain);assert.equal(view.nodes[1].skipped,true);assert.equal(view.nodes[1].current_task.status,'CANCELLED');assert.equal(view.status,'COMPLETED');
});
test('CH10：放弃中断节点放行后继，但不能越过正在重做的祖先',async t=>{
  const db=setup(t),chain=await db.create([db.node('a'),db.node('b','a'),db.node('c','b')]);
  const parent=chain.nodes[0].current_task,child=chain.nodes[1].current_task;
  await db.claim(parent);await db.report(parent);await db.claim(child);
  const forced=await db.decide(chain,0,'force');assert.equal(forced.status,200);
  const snapshot={task_id:child.task_id,type:child.type,target_device_id:a,params:child.params,status:'RUNNING',attempt_count:1,result:null,error:null,
    executions:[{execution_id:'unknown-child',task_id:child.task_id,attempt_no:1,status:'RUNNING',started_at:'2026-11-18T00:00:00.000Z',finished_at:null,result:null,error:null}]};
  assert.equal((await db.call(`/api/tasks/${child.task_id}/recover`,{device_id:a,decision:'abandon',replacement_task_id:null,snapshot})).status,200);
  const blocked=await db.view(chain);assert.equal(blocked.nodes[1].skipped,true);assert.equal(blocked.nodes[2].eligibility.claim,false);
  assert.equal((await db.claim(chain.nodes[2].current_task)).body.error.code,'DEPENDENCY_PENDING');
  await db.report(forced.body.claimReceipt.task);assert.equal((await db.view(chain)).nodes[2].eligibility.claim,true);
  assert.equal((await db.claim(chain.nodes[2].current_task)).status,200);
});
test('CH11：放弃读后force不能跳过新轮；skip写入失败整批回滚',async t=>{
  const db=setup(t),chain=await db.create(),old=chain.nodes[0].current_task;await db.claim(old);
  const snapshot={task_id:old.task_id,type:old.type,target_device_id:a,params:old.params,status:'RUNNING',attempt_count:1,result:null,error:null,
    executions:[{execution_id:'unknown-parent',task_id:old.task_id,attempt_no:1,status:'RUNNING',started_at:'2026-11-18T00:00:00.000Z',finished_at:null,result:null,error:null}]};
  const payload={device_id:a,decision:'abandon',replacement_task_id:null,snapshot};
  db.sqlite.exec("CREATE TRIGGER break_skip BEFORE UPDATE OF skipped_task_id ON chain_nodes WHEN NEW.skipped_task_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'test'); END");
  assert.equal((await db.call(`/api/tasks/${old.task_id}/recover`,payload)).status,409);
  assert.equal((await db.call(`/api/tasks/${old.task_id}`)).body.status,'RUNNING');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM task_recoveries').get().n,0);
  db.sqlite.exec('DROP TRIGGER break_skip');
  let changed=false,newId;
  const guarded={...db.DB,async batch(statements){if(!changed){changed=true;const moved=await db.decide(chain,0,'force',b);assert.equal(moved.status,200);newId=moved.body.claimReceipt.task.task_id;}return db.DB.batch(statements);}};
  const response=await worker.fetch(new Request(`https://test/api/tasks/${old.task_id}/recover`,{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(payload)}),{DB:guarded,API_TOKEN:'test'});
  assert.equal(response.status,409);
  assert.equal((await db.call(`/api/tasks/${old.task_id}/recover`,payload)).status,200);
  const view=await db.view(chain);assert.equal(view.nodes[0].current_task.task_id,newId);assert.equal(view.nodes[0].skipped,false);
  assert.equal(view.nodes[0].current_task.status,'RUNNING');assert.equal(view.nodes[1].eligibility.claim,false);
});
test('CH08：领取读后名额或祖先改变仍由事务条件拒绝；迁移006仅单次执行',async t=>{
  const db=setup(t),chain=await db.create(),parent=chain.nodes[0].current_task,child=chain.nodes[1].current_task;
  await db.claim(parent);await db.report(parent);
  let changed=false;
  const guarded={...db.DB,async batch(statements){if(!changed){changed=true;await db.decide(chain,0,'force');}return db.DB.batch(statements);}};
  const response=await worker.fetch(new Request(`https://test/api/tasks/${child.task_id}/claim`,{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({device_id:a,request_id:'atomic-child'})}),{DB:guarded,API_TOKEN:'test'});
  assert.equal(response.status,409);assert.equal((await db.call(`/api/tasks/${child.task_id}`)).body.status,'PENDING');
  const {readFileSync}=await import('node:fs');
  assert.throws(()=>db.sqlite.exec(readFileSync(new URL('../migrations/006-chains.sql',import.meta.url),'utf8')),/already exists/);
});
test('CH09：旧轮完成仅补传归档；新轮回执丢失重放后handler恰好一次',async t=>{
  const db=setup(t),chain=await db.create(),old=chain.nodes[0].current_task;
  const original=await db.claim(old);let runs=0;
  const executor=createTaskExecutor({databasePath:':memory:',deviceId:a,handlers:{'mock.unit':{risk:'L1',validate(){},async execute(){runs++;return {done:true};}}}});t.after(()=>executor.close());
  executor.prepare(original.body.claimReceipt.task);await executor.execute(old);
  const moved=await db.decide(chain,0,'force');assert.equal(moved.status,200);
  const sync=createTaskSync({request:db.request,executor,deviceId:a});
  assert.equal((await sync.syncTask(old.task_id)).archived,true);assert.equal(runs,1);
  const receipt=moved.body.claimReceipt;executor.prepare(receipt.task);
  await sync.executeClaimed(receipt);await sync.executeClaimed(receipt);assert.equal(runs,2);
  assert.equal((await db.view(chain)).nodes[0].current_task.status,'COMPLETED');
});
