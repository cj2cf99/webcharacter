// 使用真实主站计划命令和 API 路由。身份、计划、SQLite 都是隔离测试数据。
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {createReminderReviewFlow} from '../desktop/reminder-review-flow.mjs';
import {initializeDatabase, openTestDatabase} from '../agent/tests/sqlite-d1.mjs';
import {handleCompanion as sourceCompanion} from '../agent/host/subscriptions.mjs';

const main=process.env.FEIYUE_MAIN_DIR||'G:/cloudflare/myapp';
const api=process.env.FEIYUE_API_DIR||'G:/selftool/informationManage/api-worker';
const moduleAt=(dir,path)=>import(pathToFileURL(join(dir,path)).href);
const {fixture}=await moduleAt(main,'tests/helpers/worker.mjs');
const {companionReminderReview}=await moduleAt(main,'src/features/companion/reminder-review-gateway.js');
const {createPlannerHandler}=await moduleAt(main,'src/features/planner/routes.js');
const {ownerIdFor}=await moduleAt(main,'src/features/expenses/identity.js');
const handleCompanion=process.argv.includes('--source') ? sourceCompanion : (await moduleAt(api,'src/companion/agent/host/subscriptions.mjs')).handleCompanion;
const f=fixture(),issuer='https://isolated.test',sub='hours-fixture';
const tasks=openTestDatabase();
try{
  initializeDatabase(tasks.sqlite);
  const seeds=process.argv.includes('--source') ? new URL('../agent/seeds/tasklist-registration.sql',import.meta.url) :
    join(api,'src/companion/agent/seeds/tasklist-registration.sql');
  tasks.sqlite.exec(readFileSync(seeds,'utf8'));
  tasks.sqlite.exec(readFileSync(seeds,'utf8'));
  const env={...f.env,PLANNER_REDESIGN:'execution',APP_ENV:'test',ACCESS_MODE:'mock',ACCESS_ISSUER:issuer,ACCESS_AUD:'fixture',ALLOWED_OWNER_SUBS:sub};
  const owner={sub,ownerId:await ownerIdFor(issuer,sub)};
  const handler=createPlannerHandler({authenticate:()=>owner});
  async function plan(path,body,method='POST'){
    const request=new Request(issuer+'/api/plans'+path,{method,headers:{Origin:issuer,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)});
    const response=await handler(request,env);
    const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result;
  }
  let missReceipt=false, writes=0, receiptChecks=0;
  const host={reviewReminders:()=>companionReminderReview(env,'list'),
    reviewReminderStatus:id=>{
      if(missReceipt){missReceipt=false;throw Error('模拟首次回读断线');}
      return companionReminderReview(env,'status',id);
    },
    async changeReviewReminder(id,body){
      writes++;
      const response=await companionReminderReview(env,'change',id,body);
      if(response.accepted)missReceipt=true;
      return response;
    }};
  let legacy=false, created;
  async function request(path,options){
    const request=new Request(issuer+path.replace('/api/','/api/companion/'),{...options,headers:{...options.headers,Origin:issuer}});
    const response=await handleCompanion(request,{COMPANION_HOST:host,COMPANION_DB:tasks.DB},'fixture',false);
    if(path==='/api/tasks' && response.status===201) created=await response.clone().json();
    if(path.endsWith('/receipt'))receiptChecks++;
    if(!legacy||path!=='/api/reminder-review')return response;
    const data=await response.json();
    for(const row of data.items){
      if(row.plannerWork){
        row.version=(await host.reviewReminderStatus(row.id)).reminderVersion;
        delete row.plannerWork;
      }
    }
    return Response.json(data);
  }
  const flow=createReminderReviewFlow({request});
  const post=(route,body)=>request(route,{method:'POST',body:JSON.stringify(body)});
  const catalog=await (await request('/api/tasklist',{})).json();
  assert.equal(catalog.tasklist.filter(t=>t.type==='planner.hours.record'&&t.executor==='cloud').length,1);
  const {today}=await flow.load();
  await plan('/availability',{expectedRevision:0,weekly:Array(7).fill(3),overrides:{}},'PUT');
  const {planId}=await plan('',{title:'工时验收'}),base='/'+planId;
  await plan(base+'/structure',{expectedRevision:1,structure:{phases:[{id:'phase',title:'阶段',kind:'phase',
    children:[{id:'task',title:'其他service',kind:'task',children:[],estimateHours:6}],tail:{id:'tail',title:'阶段确认',kind:'milestone',children:[]}}]}},'PUT');
  const allocation={expectedRevision:2,mode:'hours',start:today,priority:3};
  const {previewToken}=await plan(base+'/allocation-preview',allocation);
  await plan(base+'/start',{...allocation,previewToken});await plan('/dispatch-today',{});
  legacy=true;
  const row=(await flow.load()).items.find(r=>r.title==='其他service');
  assert.equal(row.resolvePlannerWork,true);assert.equal(row.plannerWork,undefined);
  const receipt=await flow.apply([{id:row.id,action:'record-hours',actualHours:1.5}]);
  assert.equal(receipt.results[0].result,'recorded',JSON.stringify(receipt));
  assert.equal(receiptChecks,1);
  assert.equal(created.type,'planner.hours.record');
  const replay=await (await post('/api/tasks/'+created.task_id+'/execute',{})).json();
  assert.equal(replay.status,'COMPLETED');assert.equal(replay.result.actualHours,1.5);
  assert.equal(replay.executions.length,1);
  const original=created;
  const submit=async params=>post('/api/tasks',{type:original.type,params,
    submission_id:(await (await post('/api/task-submissions',{})).json()).submission_id});
  for(const value of [-1,24.5,'1.5',null]) assert.equal((await submit({...original.params,actualHours:value})).status,400);
  const stale=await (await submit({...original.params,actualHours:2})).json();
  const rejected=await (await post('/api/tasks/'+stale.task_id+'/execute',{})).json();
  assert.equal(rejected.status,'FAILED');assert.equal(rejected.executions.length,1);
  assert.equal(writes,1);
  const execution=await plan(base+'/execution',undefined,'GET');
  assert.equal(execution.plan.status,'active');assert.equal(execution.run.state.cursor,0);
  assert.equal(execution.run.state.actual.task,1.5);assert.equal(execution.dispatches[0].actual_hours,1.5);
  legacy=false;
  const reopened=await createReminderReviewFlow({request}).load();
  assert.equal(reopened.recordedHours.find(r=>r.id===row.id)?.plannerRecord.actualHours,1.5);
  assert.ok(!reopened.items.some(r=>r.id===row.id));
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM plan_run_events WHERE kind='record'").get().n,1);
  console.log('PASS：今日任务使用正式工时模板，旧列表登记 1.5 小时，两端读回；重复执行未重复累计，过期派发和超范围小时均被拒绝。');
}finally{tasks.close();f.close();}
