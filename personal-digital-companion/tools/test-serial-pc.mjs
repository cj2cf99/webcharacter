// 隔离主站、Worker 和两个桌面客户端，使用真实业务表与任务回执。
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {initializeDatabase,openTestDatabase} from '../agent/tests/sqlite-d1.mjs';
import {handleCompanion as sourceWorker} from '../agent/host/subscriptions.mjs';
import {createDesktopTasks} from '../desktop/task-lifecycle.mjs';
import {createServerTaskCommand} from '../desktop/server-task-command.mjs';
import {businessDate} from '../desktop/server-registration-plan.mjs';

const main=process.env.FEIYUE_MAIN_DIR??'G:/cloudflare/myapp';
const moduleAt=(root,path)=>import(pathToFileURL(join(root,path)).href);
const worker=process.argv.includes('--integrated')?(await moduleAt(process.env.FEIYUE_API_DIR??'G:/selftool/informationManage/api-worker','src/companion/agent/host/subscriptions.mjs')).handleCompanion:sourceWorker;
const {fixture}=await moduleAt(main,'tests/helpers/worker.mjs');
const {companionGateway}=await moduleAt(main,'src/features/companion/gateway.js');
const {companionReminderReview}=await moduleAt(main,'src/features/companion/reminder-review-gateway.js');
const {createPlannerHandler}=await moduleAt(main,'src/features/planner/routes.js');
const {ownerIdFor}=await moduleAt(main,'src/features/expenses/identity.js');
const f=fixture(),td=openTestDatabase(),profiles=mkdtempSync(join(tmpdir(),'feiyue-serial-')),pcs=[];
try{
  initializeDatabase(td.sqlite);td.sqlite.exec(readFileSync(new URL('../agent/seeds/tasklist-pc.sql',import.meta.url),'utf8'));
  const issuer='https://isolated.test',sub='pc-test';
  const env={...f.env,PLANNER_REDESIGN:'execution',APP_ENV:'test',ACCESS_MODE:'mock',ACCESS_ISSUER:issuer,ACCESS_AUD:'fixture',ALLOWED_OWNER_SUBS:sub};
  const host={...companionGateway(env),reviewReminders:()=>companionReminderReview(env,'list'),
    reviewReminderStatus:id=>companionReminderReview(env,'status',id),changeReviewReminder:(id,p)=>companionReminderReview(env,'change',id,p),
    findEditReminders:p=>companionReminderReview(env,'find',p),applyReminderEdit:(id,p)=>companionReminderReview(env,'apply',id,p)};
  const owner={sub,ownerId:await ownerIdFor(issuer,sub)},handler=createPlannerHandler({authenticate:()=>owner});
  async function setup(path,body,method='POST'){
    const resp=await handler(new Request(issuer+'/api/plans'+path,{method,headers:{Origin:issuer,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)}),env);
    const data=await resp.json();assert.ok(resp.ok,JSON.stringify(data));return data;
  }
  const {today,tomorrow}=await host.reviewReminders();
  assert.equal(businessDate('今天',new Date('2026-12-31T15:01:00Z')),'2027-01-01');
  assert.equal(businessDate('明天',new Date('2026-12-31T14:59:00Z')),'2027-01-01');
  assert.throws(()=>businessDate('2026-02-30',new Date()));
  await setup('/availability',{expectedRevision:0,weekly:Array(7).fill(3),overrides:{}},'PUT');
  const {planId}=await setup('',{title:'验收计划'}),base='/'+planId;
  await setup(base+'/structure',{expectedRevision:1,structure:{phases:[{id:'phase',title:'阶段',kind:'phase',
    children:[{id:'task',title:'串行验收',kind:'task',children:[],estimateHours:6}],tail:{id:'tail',title:'结束',kind:'milestone',children:[]}}]}},'PUT');
  const start={expectedRevision:2,mode:'hours',start:today,priority:3};
  const {previewToken}=await setup(base+'/allocation-preview',start);
  await setup(base+'/start',{...start,previewToken});await setup('/dispatch-today',{});
  f.sqlite.prepare('INSERT INTO ra_categories(id,name) VALUES (?,?)').run('serial-test','测试分类');
  const send=(path,opts={})=>worker(new Request(issuer+path.replace('/api/','/api/companion/'),opts),{COMPANION_HOST:host,COMPANION_DB:td.DB},'fixture',false);
  const post=(path,body)=>send(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const get=async path=>(await send(path)).json();
  const pending=async id=>(await get('/api/devices/'+id+'/pending')).tasks.map(t=>t.task_id);
  let chainId,nodeIds=[],blocked=0,checking=true;
  for(let i=0;i<2;i++){
    const profile=join(profiles,String(i));mkdirSync(profile);
    const pc=await createDesktopTasks({profile,dialog:{async showMessageBox(){return {response:0};}},
      async request(path,opts){
        if(path==='/api/chains'&&opts.method==='POST'){
          const response=await send(path,opts);const data=await response.clone().json();
          assert.equal(response.status,201,JSON.stringify(data));chainId=data.chain_id;nodeIds=data.nodes.map(n=>n.current_task.task_id);return response;
        }
        // 业务已返回，本节点还没回传终态。另一台在这个窗口不能领后继。
        if(checking&&path.endsWith('/result')){
          const idx=nodeIds.indexOf(path.split('/')[3]);
          if(idx>=0){
            const task=await get('/api/tasks/'+nodeIds[idx]);
            const repeated=await post('/api/tasks/'+nodeIds[idx]+'/pc-registration',
              {device_id:task.target_device_id,request_id:task.claim_request_id});
            assert.deepEqual(await repeated.json(),JSON.parse(opts.body).result);
          }
          if(idx>=0&&idx+1<nodeIds.length){
            const other=pcs[1-i].identity.device_id;
            assert.deepEqual(await pending(other),[]);
            assert.equal((await post('/api/tasks/'+nodeIds[idx+1]+'/claim',{device_id:other,request_id:crypto.randomUUID()})).status,409);
            blocked++;
          }
        }
        return send(path,opts);
      }});
    pc.startPolling({managed:true});
    pcs.push(pc);
    await send('/api/devices/'+pc.identity.device_id,{method:'PUT',body:JSON.stringify({computer_name:'PC-'+i})});
  }
  const dialog={async showMessageBox({detail}){assert.match(detail,/9\. /);return {response:1};}};
  const submit=createServerTaskCommand({profile:join(profiles,'0'),tasks:pcs[0],dialog});
  const explicit='2027-03-24';
  const command='服务器任务：派给 all，串行：写日记「串行日记」正文「先散步；然后读书」；'+
    '登记随手记分类「测试分类」正文「测试笔记」；登记吃喝「午餐」；登记一次撸管；创建提醒「串行提醒」；'+
    '把提醒「串行提醒」移到今天；把提醒「串行提醒」移到明天；把提醒「串行提醒」移到'+explicit+'；给长期任务「串行验收」登记投入90分钟';
  assert.match(await submit(command),/9 项/);
  async function poll(i){
    assert.equal(pcs[i].canPoll(),true);
    await pcs[i].pollOnce();
  }
  const rows=[];
  for(let i=0;i<nodeIds.length;i++){
    assert.deepEqual(await pending(pcs[i%2].identity.device_id),[nodeIds[i]]);
    await poll(i%2);
    const task=await get('/api/tasks/'+nodeIds[i]);assert.equal(task.status,'COMPLETED',JSON.stringify(task));assert.equal(task.attempt_count,1);
    assert.equal(task.target_device_id,pcs[i%2].identity.device_id);
    rows.push(task.result);
    if(i>=5&&i<=7)assert.equal(f.sqlite.prepare("SELECT deadline FROM reminders WHERE title='串行提醒'").get().deadline,[today,tomorrow,explicit][i-5]);
  }
  checking=false;
  assert.equal(blocked,8);assert.equal((await get('/api/chains/'+chainId)).status,'COMPLETED');
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM diaries WHERE title='串行日记' AND content='先散步；然后读书'").get().n,1);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM ra_records WHERE body='测试笔记' AND category_id='serial-test'").get().n,1);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM ra_hushi_records WHERE kind='food' AND body='午餐'").get().n,1);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM ra_hushi_records WHERE kind='event'").get().n,1);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM reminders WHERE title='串行提醒'").get().n,1);
  assert.equal(f.sqlite.prepare("SELECT actual_hours FROM plan_dispatches WHERE lifecycle='recorded'").get().actual_hours,1.5);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM plan_run_events WHERE kind='record'").get().n,1);
  // 重名移动失败必须阻断后项；来源锁定和旧回执均不能推进。
  const add=await host.register({path:'/api/reminders',body:{title:'串行提醒',content:'同名项',deadline:null,level:'中'},idempotencyKey:'duplicate'});
  assert.ok(add.receipt);
  const {submission_id}=await (await post('/api/task-submissions',{})).json();
  const failureBody={serial_pc:true,submission_id,nodes:[
    {key:'move',type:'pc.reminders.move',target_device_id:'all',params:{title:'串行提醒',deadline:tomorrow}},
    {key:'later',type:'pc.event.create',target_device_id:'all',params:{}}]};
  const failureChain=await (await post('/api/chains',failureBody)).json();
  const [first,last]=failureChain.nodes;
  const pc=pcs[0],other=pcs[1],failing=first.current_task.task_id,next=last.current_task.task_id;
  const failed=await pc.runTask(failing);
  assert.equal(failed.task.status,'FAILED');
  const after=await get('/api/chains/'+failureChain.chain_id);
  assert.equal(after.nodes[1].current_task.status,'PENDING');
  assert.ok(!after.nodes[0].eligibility.skip);
  assert.equal((await post('/api/chains/'+after.chain_id+'/nodes/'+first.node_id+'/decision',{
    action:'skip',device_id:pc.identity.device_id,expected_task_id:failing,request_id:crypto.randomUUID()})).status,409);
  assert.equal((await post('/api/tasks/'+next+'/claim',{device_id:other.identity.device_id,request_id:crypto.randomUUID()})).status,409);
  assert.deepEqual(f.sqlite.prepare("SELECT deadline FROM reminders WHERE title='串行提醒' ORDER BY seq").all().map(r=>r.deadline),[explicit,null]);
  assert.equal((await (await post('/api/chains',failureBody)).json()).chain_id,after.chain_id);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM ra_hushi_records WHERE kind='event'").get().n,1);
  // 五项独立任务并发竞争同一设备的两个名额（与链的逐项互斥独立）。
  const device=pcs[0].identity.device_id,ids=[];
  for(let i=0;i<5;i++){
    const {submission_id}=await (await post('/api/task-submissions',{})).json();
    const t=await (await post('/api/tasks',{submission_id,target_device_id:device,type:'pc.echo',params:{text:String(i)}})).json();
    ids.push(t.task_id);
  }
  await poll(0);
  const independent=await Promise.all(ids.map(id=>get('/api/tasks/'+id)));
  assert.equal(independent.filter(t=>t.status==='COMPLETED').length,1);
  assert.equal(independent.filter(t=>t.status==='PENDING').length,4);
  const {submission_id:extra}=await (await post('/api/task-submissions',{})).json();
  const fresh=await (await post('/api/tasks',{submission_id:extra,target_device_id:device,type:'pc.echo',params:{text:'替补'}})).json();
  ids.splice(0,ids.length,...independent.filter(t=>t.status==='PENDING').map(t=>t.task_id),fresh.task_id);
  const claims=await Promise.all(ids.map(id=>post('/api/tasks/'+id+'/claim',{device_id:device,request_id:crypto.randomUUID()})));
  assert.deepEqual(claims.map(r=>r.status).sort(),[200,200,409,409,409]);
  assert.equal(td.sqlite.prepare("SELECT count(*) n FROM tasks WHERE status='RUNNING' AND target_device_id=?").get(device).n,2);
  assert.deepEqual(await pending(device),[]);assert.deepEqual(await pending(pcs[1].identity.device_id),[]);
  console.log(JSON.stringify({nodes:rows,blockedEarlyClaims:blocked,competingClaims:claims.map(r=>r.status)}));
}finally{await Promise.all(pcs.map(p=>p.stop()));td.close();f.close();rmSync(profiles,{recursive:true,force:true});}
