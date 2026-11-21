import test from 'node:test';
import assert from 'node:assert/strict';
import {createReminderReviewFlow} from '../../desktop/reminder-review-flow.mjs';
import {createReminderReview} from '../host/reminder-review.mjs';
import {openTestDatabase} from './sqlite-d1.mjs';

test('主站查询按提醒定位计划派发，已登记的小数工时刷新后仍能读到',async t=>{
  const {DB,sqlite,close}=openTestDatabase();t.after(close);
  const dates={today:'2026-11-20',tomorrow:'2026-11-21'};
  sqlite.exec("CREATE TABLE reminders(seq,title,content,deadline,level,regDatetime,isFinished,recurrence,recurrenceNextSeq,planner_dispatch_id);CREATE TABLE reminder_links(target_todo_id);INSERT INTO reminders VALUES(71,'其他service','','2026-11-20','中','登记时间',0,NULL,NULL,'d71')");
  const entry={id:'d71',kind:'task',recordable:true,business_date:dates.today,status:'active',revision:1,plannedHours:3};
  const host=createReminderReview({db:DB,visible:()=>DB,getDates:()=>dates,present:r=>r,memberDays:()=>[],planner:{
    lookup:async()=>entry,record:async(e,h)=>{assert.equal(e.id,'d71');Object.assign(e,{recordable:false,actualHours:h,recordedAt:'2026-11-20T13:00:00+09:00'});sqlite.exec('UPDATE reminders SET isFinished=1 WHERE seq=71');}
  }});
  const row=(await host.list()).items[0],s=await host.status(71);
  assert.equal(s.version,row.version);assert.notEqual(s.reminderVersion,s.version);
  assert.deepEqual(s.plannerWork,row.plannerWork);
  await host.change(71,{version:s.version,today:dates.today,action:'record-hours',actualHours:1.5});
  const refreshed=await host.list();
  assert.equal(refreshed.items.length,0);assert.equal(refreshed.recordedHours[0].plannerRecord.actualHours,1.5);
  assert.deepEqual(refreshed.recordedHours[0].plannerRecord,(await host.status(71)).plannerRecord);
  assert.equal(refreshed.dailyStudyComplete,false,'缺少多邻国记录不能视为完成');
  sqlite.exec("INSERT INTO reminders VALUES(72,'多邻国一节课','','2026-11-20','中','登记时间',0,NULL,NULL,NULL)");
  assert.equal((await host.list()).dailyStudyComplete,false);
  sqlite.exec('UPDATE reminders SET isFinished=1 WHERE seq=72');
  const both=await host.list();
  assert.equal(both.dailyStudyComplete,true);assert.deepEqual(both.items,[]);
  sqlite.exec('UPDATE reminders SET isFinished=0 WHERE seq=71');
  assert.equal((await host.list()).dailyStudyComplete,false,'当天长期任务未完成');
});

test('列表仅含“由长期计划管理”时按编号解析主站派发，再登记并读回；拒绝陈旧、里程碑和不支持的接口',async()=>{
  const today='2026-11-20',row={id:71,title:'其他service',group:'locked',reason:'由长期计划管理',identity:'r71',version:'旧快照',deadline:today};
  const details={id:71,today,identity:row.identity,finished:false,version:'当天计划版本',reminderVersion:row.version,
    plannerWork:{dispatchId:'实际派发',plannedHours:2}};
  let status,recorded=false;
  const writes=[];
  const taskId=crypto.randomUUID();
  const flow=createReminderReviewFlow({request:async(url,options)=>{
    if(url.endsWith('review'))return Response.json({today,tomorrow:'2026-11-21',items:recorded?[]:[row],recordedHours:recorded?[{...row,plannerRecord:status.plannerRecord}]:[]});
    if(url==='/api/task-submissions')return Response.json({submission_id:crypto.randomUUID()});
    if(url==='/api/tasks'){writes.push(JSON.parse(options.body).params);return Response.json({task_id:taskId});}
    if(url==='/api/tasks/'+taskId+'/execute'){recorded=true;
      status={identity:row.identity,finished:true,plannerRecord:{dispatchId:'实际派发',actualHours:0,recordedAt:today+'T18:00:00+09:00'}};
      return Response.json({status:'COMPLETED',result:{...status.plannerRecord,record_id:'实际派发'}});}
    return Response.json(status);
  }});
  const input=[{id:row.id,action:'record-hours',actualHours:0}];
  for(const invalid of [{identity:row.identity},{...details,plannerUnavailable:'里程碑无需登记工时。'},
    {...details,identity:'other'},{...details,today:'2026-11-21'},{...details,reminderVersion:'另一个版本'}]){
    status=invalid;
    assert.equal((await flow.load()).items[0].resolvePlannerWork,true);
    assert.equal((await flow.apply(input)).results[0].result,'failed');
  }
  assert.equal(writes.length,0);
  status=details;await flow.load();
  assert.equal((await flow.apply(input)).results[0].result,'recorded');
  assert.deepEqual(writes,[{reminderId:row.id,dispatchId:'实际派发',today,version:details.version,actualHours:0}]);
  assert.equal((await flow.load()).recordedHours[0].plannerRecord.actualHours,0);
});

test('计划工时只按当日派发与实际小时核实；只读来源、空值、过时回执不能登记',async()=>{
  const date={today:'2026-11-20',tomorrow:'2026-11-21'};
  const row={id:7,title:'其他service',group:'locked',reason:'由长期计划管理',version:'v1',identity:'r7',plannerWork:{dispatchId:'dispatch-7',plannedHours:3}};
  const items=[row,{id:8,group:'locked',reason:'超市会员日'}],requests=[],events=[];
  const taskId=crypto.randomUUID();
  let actual=1.5,dispatchId='yesterday';
  const flow=createReminderReviewFlow({record:e=>events.push(e),request:async(path,options)=>{
    if(path.endsWith('review'))return Response.json({...date,items});
    if(path==='/api/task-submissions')return Response.json({submission_id:crypto.randomUUID()});
    if(path==='/api/tasks'){requests.push(JSON.parse(options.body).params);return Response.json({task_id:taskId});}
    if(path==='/api/tasks/'+taskId+'/execute')throw Error('响应丢失');
    assert.equal(path,'/api/tasks/'+taskId+'/receipt');
    return Response.json({status:'COMPLETED',result:{actualHours:actual,record_id:dispatchId,recordedAt:'2026-11-20T14:00:00+09:00'}});
  }});
  await flow.load();
  for(const choice of [{id:7,action:'complete'},{id:8,action:'record-hours',actualHours:2},...[null,'',-1,25].map(actualHours=>({id:7,action:'record-hours',actualHours}))]){
    await assert.rejects(flow.apply([choice]),/所选操作无效/);
  }
  const choice={id:7,action:'record-hours',actualHours:1.5};
  assert.equal((await flow.apply([choice])).results[0].result,'unknown');
  dispatchId='dispatch-7';actual=2;
  assert.equal((await flow.load()).report.results[0].result,'unknown');
  actual=1.5;
  const item=(await flow.load()).report.results[0];
  assert.deepEqual([item.result,item.actualHours],['recorded',1.5]);
  assert.deepEqual(requests,[{reminderId:row.id,dispatchId:'dispatch-7',today:date.today,version:'v1',actualHours:1.5}]);
  assert.match(events.at(-1).detail,/1.5 小时/);
});

test('复盘保存逐条提醒操作，丢回执后刷新记录核实结果',async()=>{
  const events=[], rows=[1,2].map(id=>({id,title:'资料 '+id,identity:'r'+id,version:'v',deadline:'2026-11-20'}));
  let reads=0,writes=0;
  const flow=createReminderReviewFlow({record:event=>events.push(event),request:async(path,options)=>{
    if(path.endsWith('review'))return Response.json({today:'2026-11-20',tomorrow:'2026-11-21',items:rows});
    if(options.method==='POST'){
      writes++;
      if(path.endsWith('/2'))return Response.json({error:{message:'提醒已变更'}},{status:409});
      throw Error('回执丢失');
    }
    if(reads++===0)throw Error('暂时离线');
    return Response.json({identity:'r1',finished:false,deadline:'2026-11-21'});
  }});
  await flow.load();
  await flow.apply([{id:1,action:'tomorrow'},{id:2,action:'complete'}]);
  await flow.load();
  assert.equal(writes,2);
  assert.deepEqual(events.map(x=>[x.title,x.action]),[
    ['资料 1','顺延提醒 · 已发起'],['资料 1','顺延提醒 · 结果待核对'],
    ['资料 2','完成提醒 · 已发起'],['资料 2','完成提醒 · 请求被拒绝'],['资料 1','顺延提醒 · 已核实顺延']]);
  assert.match(events.at(-1).detail,/2026-11-21/);
});
