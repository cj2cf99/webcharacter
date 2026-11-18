import test from 'node:test';
import { withTaskSubmission } from './fixtures.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker.mjs';
import {openTestDatabase,initializeDatabase} from './sqlite-d1.mjs';
import {createTaskExecutor} from '../execution/runner.mjs';
import {createThreadHandlers} from '../execution/thread-handlers.mjs';
import {createDesktopTasks,interruptionDetail} from '../../desktop/task-lifecycle.mjs';
import {getDeviceIdentity} from '../devices/identity.mjs';
import {recoverySnapshot} from '../execution/recovery-data.mjs';
const device='pc-12345678-1234-4234-8234-123456789012';
const module=new URL('./fixtures/thread-handlers.mjs',import.meta.url).href;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function setup(deviceId=device){
  const db=openTestDatabase();initializeDatabase(db.sqlite);
  db.sqlite.prepare('INSERT INTO devices VALUES(?,?,NULL,?)').run(deviceId,'test','2026-11-18T00:00:00.000Z');
  db.sqlite.prepare('INSERT INTO tasklist VALUES(?,?,?,?,?,?,?)').run('mock.unit','模拟任务','测试','pc',JSON.stringify({value:{type:'string',required:true},mode:{type:'string'},marker:{type:'string'}}),'模拟','模拟');
  const request=(path,options={})=>worker.fetch(new Request('https://test'+path,{...options,headers:{Authorization:'Bearer test',...options.headers}}),{DB:db.DB,API_TOKEN:'test'});
  const call=async(path,body)=>{if(path==='/api/tasks')body=await withTaskSubmission((url, value)=>request(url,{method:'POST',body:JSON.stringify(value)}),body);const r=await request(path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
  return {...db,request,call,deviceId};
}
async function task(db,extra={}){
  const created=await db.call('/api/tasks',{type:'mock.unit',target_device_id:db.deviceId,params:{value:'same'},...extra});
  assert.equal(created.status,201,JSON.stringify(created.body));
  await db.call(`/api/tasks/${created.body.task_id}/claim`,{device_id:db.deviceId});return created.body;
}
function payload(task,decision='redo'){
  return {device_id:task.target_device_id,decision,replacement_task_id:decision==='redo'?'new-task':null,
    snapshot:{task_id:task.task_id,type:task.type,target_device_id:task.target_device_id,params:task.params,status:'RUNNING',attempt_count:1,result:null,error:null,
      executions:[{execution_id:'exec1',task_id:task.task_id,attempt_no:1,status:'RUNNING',started_at:'2026-11-18T00:00:00.000Z',finished_at:null,result:null,error:null}]}};
}
test('R01：中断重做原子保留快照与截止，重复/回执丢失只一个新任务',async()=>{
  const db=setup();try{
    const original=await task(db,{deadline_at:new Date(Date.now()+100000).toISOString()}),p=payload(original),path=`/api/tasks/${original.task_id}/recover`;
    const first=await db.call(path,p);assert.equal(first.status,200,JSON.stringify(first));
    assert.equal(first.body.task.status,'CANCELLED');assert.equal(first.body.task.attempt_count,1);
    assert.deepEqual(first.body.task.executions,[]);assert.deepEqual(first.body.recovery.snapshot,p.snapshot);
    assert.equal(first.body.replacement.deadline_at,original.deadline_at);assert.equal(first.body.replacement.attempt_count,0);
    assert.deepEqual((await db.call(path,p)).body,first.body);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM tasks').get().n,2);
    assert.equal((await db.call(path,{...p,decision:'abandon',replacement_task_id:null})).status,409);
  }finally{db.close();}
});
test('R02：严格快照/目标/状态/认证，异常写入整批回滚',async()=>{
  const db=setup();try{
    const t=await task(db),p=payload(t),path=`/api/tasks/${t.task_id}/recover`;
    for(const alter of [x=>x.extra=true,x=>x.snapshot.params.value='changed',x=>x.snapshot.status='COMPLETED',x=>x.snapshot.executions[0].finished_at='bad',x=>x.snapshot.attempt_count=3,x=>x.snapshot.executions[0].result={x:1},x=>x.device_id='other']){
      const bad=structuredClone(p);alter(bad);assert.ok([400,409].includes((await db.call(path,bad)).status));
    }
    assert.equal((await db.request(path,{method:'POST',headers:{Authorization:'bad'},body:JSON.stringify(p)})).status,401);
    assert.equal((await db.request(path)).status,405);
    db.sqlite.exec("CREATE TRIGGER fail_recovery BEFORE INSERT ON task_recoveries BEGIN SELECT RAISE(ABORT,'test'); END");
    assert.equal((await db.call(path,p)).status,409);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM tasks').get().n,1);
    assert.equal((await db.call(`/api/tasks/${t.task_id}`)).body.status,'RUNNING');
    db.sqlite.exec('DROP TRIGGER fail_recovery');
    const abandoned=await db.call(path,payload(t,'abandon'));assert.equal(abandoned.status,200);
    assert.equal(abandoned.body.replacement,null);assert.equal(abandoned.body.task.error,null);
  }finally{db.close();}
});
test('R03：满7天首次重做不改变原任务，已成功决定跨截止仍返回原回执',async()=>{
  const db=setup();try{
    const t=await task(db),path=`/api/tasks/${t.task_id}/recover`,p=payload(t);
    db.sqlite.prepare('UPDATE tasks SET deadline_at=? WHERE task_id=?').run(new Date(Date.now()-8*86400000).toISOString(),t.task_id);
    assert.equal((await db.call(path,p)).body.error.code,'TASK_DEADLINE_PASSED');
    assert.equal((await db.call(`/api/tasks/${t.task_id}`)).body.status,'RUNNING');
    db.sqlite.prepare('UPDATE tasks SET deadline_at=NULL WHERE task_id=?').run(t.task_id);
    assert.equal((await db.call(path,p)).status,200);
    db.sqlite.prepare('UPDATE tasks SET deadline_at=? WHERE task_id=?').run('2020-01-01T00:00:00.000Z',t.task_id);
    assert.equal((await db.call(path,p)).status,200);
  }finally{db.close();}
});
test('L03：真实繁忙线程不阻塞主线程，停止保留RUNNING且不重试',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'thread-test-')),threads=await createThreadHandlers({module});
  const file=join(dir,'tasks.sqlite'), marker=join(dir,'started');
  const executor=createTaskExecutor({databasePath:file,deviceId:device,handlers:threads.handlers});
  try{
    const running=executor.execute({task_id:'busy',type:'mock.unit',target_device_id:device,params:{value:'x',mode:'busy',marker}});
    const rejected=assert.rejects(running,{code:'INTERRUPTED'});
    for(let i=0;i<150&&!existsSync(marker);i++)await pause(10);
    assert.ok(existsSync(marker));let responsive=false;await new Promise(resolve=>setTimeout(()=>{responsive=true;resolve();},5));assert.ok(responsive);
    executor.interrupt();await threads.stop();await rejected;
    assert.equal(executor.getTask('busy').attempt_count,1);assert.equal(executor.getTask('busy').executions[0].status,'RUNNING');
    executor.close();const reopened=createTaskExecutor({databasePath:file,deviceId:device});
    assert.equal(reopened.getTask('busy').status,'RUNNING');reopened.close();assert.equal(threads.activeCount(),0);
  }finally{await threads.stop();rmSync(dir,{recursive:true});}
});
test('L03：真实线程崩溃不重试，普通handler失败仍最多两次',async()=>{
  const threads=await createThreadHandlers({module}),executor=createTaskExecutor({databasePath:':memory:',deviceId:device,handlers:threads.handlers});
  try{
    await assert.rejects(executor.execute({task_id:'crash',type:'mock.unit',target_device_id:device,params:{value:'x',mode:'crash'}}),{code:'INTERRUPTED'});
    assert.equal(executor.getTask('crash').attempt_count,1);assert.equal(executor.getTask('crash').status,'RUNNING');
    const failed=await executor.execute({task_id:'fail',type:'mock.unit',target_device_id:device,params:{value:'x',mode:'fail'}});
    assert.equal(failed.status,'FAILED');assert.equal(failed.attempt_count,2);
  }finally{await threads.stop();executor.close();}
});
async function localInterrupted(profile,task){
  const executor=createTaskExecutor({databasePath:join(profile,'tasks.sqlite'),deviceId:task.target_device_id,
    handlers:{'mock.unit':{risk:'L1',validate(){},async execute(){throw Object.assign(new Error('stop'),{code:'INTERRUPTED'});}}}});
  executor.prepare({...task,definition:{name:'模拟登记'}});await assert.rejects(executor.execute(task),{code:'INTERRUPTED'});executor.close();
}
test('L01/R01：身份重开不变，无配置显示名称参数JST，稍后/离线决定保留',async()=>{
  const profile=mkdtempSync(join(tmpdir(),'desktop-recover-'));let lifecycle;
  try{
    const identity=await getDeviceIdentity(profile);await localInterrupted(profile,{task_id:'old',type:'mock.unit',target_device_id:identity.device_id,params:{value:'原参数'}});
    const prompts=[];lifecycle=await createDesktopTasks({profile,request:null,dialog:{async showMessageBox(p){prompts.push(p);return {response:0};}}});
    assert.equal(lifecycle.identity.device_id,identity.device_id);await lifecycle.startup();assert.equal(prompts.length,1);
    assert.match(prompts[0].detail,/模拟登记/);assert.match(prompts[0].detail,/原参数/);assert.match(prompts[0].detail,/JST/);
    assert.equal(lifecycle.executor.getRecovery('old'),null);
    await assert.rejects(lifecycle.decide('old','redo'),/待同步/);
    const saved=lifecycle.executor.getRecovery('old');assert.ok(saved.payload.replacement_task_id);assert.equal(saved.acknowledged,false);
    await lifecycle.stop();lifecycle=null;
    const reopened=createTaskExecutor({databasePath:join(profile,'tasks.sqlite'),deviceId:identity.device_id});
    assert.deepEqual(reopened.getRecovery('old'),saved);assert.equal(reopened.getTask('old').attempt_count,1);reopened.close();
  }finally{if(lifecycle)await lifecycle.stop();rmSync(profile,{recursive:true});}
});
test('R02：恢复回执丢失重开只重传决定，绝不自动执行新ID',async()=>{
  const profile=mkdtempSync(join(tmpdir(),'desktop-receipt-'));let lifecycle,db;
  try{
    const {device_id}=await getDeviceIdentity(profile);db=setup(device_id);const t=await task(db);await localInterrupted(profile,t);
    let lost=true;
    const request=async(path,options)=>{const response=await db.request(path,options);if(path.endsWith('/recover')&&lost){lost=false;throw new Error('lost');}return response;};
    const dialog={async showMessageBox(){return {response:0};}};
    lifecycle=await createDesktopTasks({profile,request,dialog,handlerModule:module});
    await assert.rejects(lifecycle.decide(t.task_id,'redo'),/连接失败/);const newId=lifecycle.executor.getRecovery(t.task_id).payload.replacement_task_id;
    await lifecycle.stop();lifecycle=await createDesktopTasks({profile,request:db.request,dialog,handlerModule:module});await lifecycle.startup();
    assert.equal(lifecycle.executor.getRecovery(t.task_id).acknowledged,true);assert.equal(lifecycle.executor.getTask(newId),null);
    assert.equal((await db.call(`/api/tasks/${newId}`)).body.status,'PENDING');assert.equal(db.sqlite.prepare('SELECT count(*) n FROM tasks').get().n,2);
    let choices=0;
    dialog.showMessageBox=async p=>({response:p.title==='重做任务待执行'&&choices++===0?1:0});
    await lifecycle.stop();lifecycle=await createDesktopTasks({profile,request:db.request,dialog,handlerModule:module});
    await lifecycle.showPending();
    assert.equal((await db.call(`/api/tasks/${newId}`)).body.status,'COMPLETED');
    assert.equal(lifecycle.executor.getTask(newId).attempt_count,1);
    await lifecycle.showPending();assert.equal(lifecycle.executor.getTask(newId).attempt_count,1);
    await assert.rejects(lifecycle.runTask(t.task_id),/未知/);
  }finally{if(lifecycle)await lifecycle.stop();db?.close();rmSync(profile,{recursive:true});}
});
test('L02：领取中退出gate阻止handler，取消后继续；确认退出则保持未知/待核对',async()=>{
  for(const cancel of [true,false]) {
    const profile=mkdtempSync(join(tmpdir(),'desktop-gate-'));let lifecycle,db;
    try{
      const {device_id}=await getDeviceIdentity(profile);db=setup(device_id);
      const created=await db.call('/api/tasks',{type:'mock.unit',target_device_id:device_id,params:{value:'x'}});
      let release,entered;const claimed=new Promise(resolve=>{entered=resolve;});
      const request=async(path,options)=>{
        const response=await db.request(path,options);
        if(path.endsWith('/claim')){entered();await new Promise(resolve=>{release=resolve;});}
        return response;
      };
      lifecycle=await createDesktopTasks({profile,request,handlerModule:module,dialog:{async showMessageBox(){return {response:0};}}});
      const running=lifecycle.runTask(created.body.task_id);const settled=running.catch(error=>error);
      await claimed;lifecycle.beginQuitCheck();release();await pause(20);
      assert.equal(lifecycle.executor.getTask(created.body.task_id).attempt_count,0);
      await assert.rejects(lifecycle.runTask('new'),/退出/);
      if(cancel){lifecycle.cancelQuitCheck();await running;assert.equal(lifecycle.executor.getTask(created.body.task_id).status,'COMPLETED');}
      else {await lifecycle.stop();lifecycle=null;assert.ok(await settled instanceof Error);}
    }finally{if(lifecycle)await lifecycle.stop();db?.close();rmSync(profile,{recursive:true});}
  }
});
test('L02：退出后启动/提示/重试不访问已关闭DB；未回传完成记录仍可告知',async()=>{
  const profile=mkdtempSync(join(tmpdir(),'desktop-stop-'));const prompts=[];
  try{
    const identity=await getDeviceIdentity(profile);await localInterrupted(profile,{task_id:'old',type:'mock.unit',target_device_id:identity.device_id,params:{value:'x'}});
    let respond;const lifecycle=await createDesktopTasks({profile,request:null,dialog:{showMessageBox(p){prompts.push(p);return new Promise(resolve=>{respond=resolve;});}}});
    const opening=lifecycle.showPending();await pause(0);await lifecycle.stop();respond({response:2});await opening;
    await lifecycle.startup();await lifecycle.showPending();await lifecycle.retryPending();assert.equal(prompts.length,1);
  }finally{rmSync(profile,{recursive:true});}
});
test('L01：默认无业务注册；两个不同任务可同时执行，不受单任务锁限制',async()=>{
  const profile=mkdtempSync(join(tmpdir(),'desktop-multi-'));let lifecycle,db;
  try{
    const {device_id}=await getDeviceIdentity(profile);db=setup(device_id);
    const first=(await db.call('/api/tasks',{type:'mock.unit',target_device_id:device_id,params:{value:'one',mode:'busy',marker:join(profile,'one')}})).body;
    const second=(await db.call('/api/tasks',{type:'mock.unit',target_device_id:device_id,params:{value:'two',mode:'busy',marker:join(profile,'two')}})).body;
    lifecycle=await createDesktopTasks({profile,request:db.request,handlerModule:module,dialog:{async showMessageBox(){return {response:0};}}});
    const one=lifecycle.runTask(first.task_id).catch(error=>error),two=lifecycle.runTask(second.task_id).catch(error=>error);
    for(let i=0;i<150&&(!existsSync(join(profile,'one'))||!existsSync(join(profile,'two')));i++)await pause(10);
    assert.ok(existsSync(join(profile,'one'))&&existsSync(join(profile,'two')));assert.equal(lifecycle.executor.activeCount(),2);
    await lifecycle.stop();lifecycle=null;await Promise.all([one,two]);
    const dbLocal=new DatabaseSync(join(profile,'tasks.sqlite'));assert.equal(dbLocal.prepare("SELECT count(*) n FROM local_tasks WHERE status='RUNNING' AND attempt_count=1").get().n,2);dbLocal.close();
  }finally{if(lifecycle)await lifecycle.stop();db?.close();rmSync(profile,{recursive:true});}
});
test('L01：已完成但回传断网，重开只补传，默认空handler亦可补传',async()=>{
  const profile=mkdtempSync(join(tmpdir(),'desktop-upload-'));let lifecycle,db;
  try{
    const {device_id}=await getDeviceIdentity(profile);db=setup(device_id);const t=await task(db);
    const executor=createTaskExecutor({databasePath:join(profile,'tasks.sqlite'),deviceId:device_id,handlers:{'mock.unit':{risk:'L1',validate(){},execute(){return {value:'same'};}}}});
    await executor.execute(t);const original=executor.getTask(t.task_id);executor.close();
    const oldDatabase=new DatabaseSync(join(profile,'tasks.sqlite'));oldDatabase.exec('DROP TABLE local_task_metadata');oldDatabase.close();
    let calls=0;const request=(...args)=>{calls++;return db.request(...args);};
    lifecycle=await createDesktopTasks({profile,request,dialog:{async showMessageBox(){return {response:0};}}});await lifecycle.startup();
    assert.deepEqual(lifecycle.executor.getTask(t.task_id),original);assert.equal((await db.call(`/api/tasks/${t.task_id}`)).body.status,'COMPLETED');
    assert.equal(lifecycle.executor.listTasks()[0].metadata.uploaded,1);
    const afterUpload=calls;await lifecycle.startup();assert.equal(calls,afterUpload,'旧库完成记录确认后不再重复补传');
    await assert.rejects(lifecycle.decide(t.task_id,'redo'),/未知/);
  }finally{if(lifecycle)await lifecycle.stop();db?.close();rmSync(profile,{recursive:true});}
});
