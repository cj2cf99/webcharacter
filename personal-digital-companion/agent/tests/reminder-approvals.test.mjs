import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createWorker} from '../worker.mjs';
import {createReminderEdits} from '../host/reminder-edits.mjs';
import {openTestDatabase} from './sqlite-d1.mjs';
import {createReminderApprovals} from '../../desktop/reminder-approvals.mjs';
import {parseReminderCommand} from '../../desktop/reminder-command.mjs';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';
import {tokyoDay} from '../../desktop/conversation-history.mjs';

function fixture(t) {
  const profile=mkdtempSync(join(tmpdir(),'feiyue-reminder-')), {sqlite,DB,close}=openTestDatabase();
  let time=Date.parse('2026-11-20T10:00:00+09:00'),writes=0;
  sqlite.exec("CREATE TABLE reminders(seq INTEGER PRIMARY KEY,title,content,deadline,level,regDatetime,recurrence,isFinished,planner_dispatch_id);CREATE TABLE reminder_links(target_todo_id);");
  const insert=sqlite.prepare("INSERT INTO reminders VALUES(?,?,'原内容','2026-11-20T09:30:00+09:00','中','2026-11-19',NULL,0,NULL)");
  insert.run(1,'周报甲');insert.run(2,'周报乙');insert.run(3,'体检');
  const edits=createReminderEdits({visible:()=>DB,today:()=>tokyoDay(time),now:()=>time,
    present:r=>({...r,recurrence:JSON.parse(r.recurrence)}),patch(row,changes){
      writes++;
      for(const [k,v] of Object.entries(changes))sqlite.prepare('UPDATE reminders SET '+k+'=? WHERE seq=?').run(k==='recurrence'?JSON.stringify(v):v,row.seq);
      return Response.json({ok:true});
    }});
  const wrap=fn=>async(...args)=>{try{return await fn(...args);}catch(e){return {error:e.message,status:e.status};}};
  const worker=createWorker({authorize:()=>({ownerId:'test'})});
  const request=(path,options)=>worker.fetch(new Request('https://test'+path,{...options,headers:{...options.headers,Origin:'https://test'}}),
    {COMPANION_HOST:{findEditReminders:wrap(edits.find),applyReminderEdit:wrap(edits.apply)}});
  const options={request,profile,now:()=>time,safeStorage:{encryptStringAsync:s=>Buffer.from(s),decryptStringAsync:b=>({result:b.toString()})}};
  const open=()=>createReminderApprovals(options);
  let flow=open();
  t.after(async()=>{flow.close();await new Promise(r=>setImmediate(r));close();rmSync(profile,{recursive:true,force:true});});
  return {get f(){return flow;},writes:()=>writes,advance:ms=>time+=ms,sqlite,
    async restart(){flow.close();await new Promise(r=>setImmediate(r));flow=open();}};
}
test('单条、查询和歧义多选；重开后并入同一份同意，旧预览不得执行',async t=>{
  const x=fixture(t);
  assert.match(await x.f.submit('查询今天的提醒'),/周报甲[\s\S]*体检/);
  await x.f.submit('把体检移动到明天');
  const first=await x.f.view();
  assert.equal(first.entries.length,1);
  await x.f.submit('把周报的内容改为本周总结');
  assert.equal(x.writes(),0);
  let {choices}=await x.f.view();assert.equal(choices[0].candidates.length,2);
  await x.f.decide({action:'select',id:choices[0].id,ids:[1,2]});
  await x.restart();
  await assert.rejects(x.f.decide({action:'approve',token:first.token}),/变化/);
  await x.f.submit('把体检的时间改为下午三点半');
  const group=await x.f.view();
  assert.equal(group.entries.length,3);assert.equal(group.entries[0].patch.deadline,'2026-11-21T15:30:00+09:00');
  assert.match(group.entries.find(e=>e.id===1).diff[0],/原内容 → 本周总结/);
  assert.equal(x.writes(),0);
  const input={action:'approve',token:group.token};
  const [a,b]=await Promise.allSettled([x.f.decide(input),x.f.decide(input)]);
  assert.match(a.value,/已更新/);assert.equal(b.status,'rejected');assert.equal(x.writes(),3);
});
test('单项拒绝、等待中变更、仅选一个、一个小时精确失效且合组不续时',async t=>{
  const x=fixture(t);
  await x.f.submit('把体检的循环周期改为每周五');
  const first=await x.f.view();await x.f.decide({action:'reject',token:first.token});
  assert.equal(x.writes(),0);
  await x.f.submit('把周报移动到今天下午两点');
  const choice=(await x.f.view()).choices[0];
  await x.f.decide({action:'select',id:choice.id,ids:[2]});
  let group=await x.f.view();assert.deepEqual(group.entries.map(x=>x.id),[2]);
  x.sqlite.exec("UPDATE reminders SET content='外部改动' WHERE seq=2");
  assert.match(await x.f.decide({action:'approve',token:group.token}),/事项已变化/);
  assert.equal(x.writes(),0);
  await x.f.submit('把体检的标题改为体检预约');await x.f.submit('把周报移到明天');
  x.advance(3599999);await x.f.submit('把编号1的标题改成周报归档');
  group=await x.f.view();assert.equal(group.choices.length,1);assert.equal(group.entries.length,2);
  x.advance(1);await x.restart();await assert.rejects(x.f.decide({action:'approve',token:group.token}),/变化/);
  group=await x.f.view();assert.equal(group.choices.length,0);assert.deepEqual(group.entries.map(e=>e.id),[1]);assert.equal(x.writes(),0);
});
test('日期以东京为准；多字段解析、创建和普通提问路由保持可区分',()=>{
  const today=tokyoDay(Date.parse('2026-11-20T16:00:00Z'));
  assert.equal(today,'2026-11-21');
  const cmd=parseReminderCommand('把提醒“体检”的标题改成年度体检，内容改为带证件，日期改为明天，时间改为09:30，循环周期改为每年11月22日',today);
  assert.equal(cmd.filter.q,'体检');assert.equal(cmd.changes.title,'年度体检');assert.equal(cmd.changes.date,'2026-11-22');assert.equal(cmd.changes.recurrence.mode,'annual');
  assert.throws(()=>parseReminderCommand('把体检移到2026-02-31',today));
  for(const [s,route] of [['明天提醒我体检','registration'],['天气怎么样','question'],['把周报移到今天','reminders'],['展示明天的事项提醒','reminders']])
    assert.equal(conversationRoute(s).kind,route);
});

