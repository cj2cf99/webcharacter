import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createPersonalityDiary} from '../../desktop/personality-diary.mjs';
import {createPersonalityNags} from '../../desktop/personality-nags.mjs';
import {createReminderChecks} from '../../desktop/reminder-checks.mjs';
import {createAutonomousAudit} from '../../desktop/autonomous-audit.mjs';
import {createTaskTrafficLog} from '../../desktop/task-traffic-log.mjs';
import {tokyoDay} from '../../desktop/conversation-history.mjs';
import {openTestDatabase} from './sqlite-d1.mjs';
import {personalityMemory} from '../assistant/personality-memory.mjs';
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('跨日重启回读任务日志，已写入的回执不重复，未落盘的回执补写一次',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-audit-receipt-'));
  const file=join(profile,'checks.sqlite');
  let at=Date.parse('2026-11-21T23:59:58+09:00');
  const memory={folder:day=>join(profile,day),refreshIndex:async()=>{}};
  const log=createTaskTrafficLog(profile,{clock:()=>at,memory});
  let db=new DatabaseSync(file);
  const audit=createAutonomousAudit(db,(event,options)=>
    event.result==='等待补写'?Promise.resolve(false):log.write(event,options),()=>at);
  audit.begin('写日记','测试已落盘').finish('完成','已写入');
  audit.begin('本地整理','测试未落盘').finish('完成','等待补写');
  audit.close();db.close();await log.flush();
  for(let i=0;i<16;i++)await log.write({direction:'local',route:'其它记录'});
  at+=5000;
  db=new DatabaseSync(file);
  const recovered=createAutonomousAudit(db,log.write,()=>at);
  t.after(()=>{recovered.close();db.close();rmSync(profile,{recursive:true,force:true});});
  await log.flush();await settle();
  const results=[];
  let cursor=null;
  do{
    const page=await log.readPage(cursor,'2026-11-21');
    results.push(...page.lines.map(JSON.parse).filter(row=>row.stage==='完成').map(row=>row.result));
    cursor=page.next;
  }while(cursor);
  assert.deepEqual(results.sort(),['已写入','等待补写'].sort());
  assert.equal(db.prepare('SELECT count(*) AS n FROM active_autonomous_actions').get().n,0);
});

test('同一悬念遇到多条新事实只比对一次；下个东京日继续未比较的事实',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-follow-once-'));
  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(readFileSync(new URL('../migrations/016-personality-memory.sql',import.meta.url),'utf8'));
  const request=(path,options)=>/\/(?:expenses|sources)\?/.test(path)?Response.json({records:[],complete:true}):
    personalityMemory(new Request('https://unit.test'+path,options),{DB},'me');
  await request('/api/memory/diaries',{method:'POST',body:JSON.stringify({day:'2026-11-19',batch:'first',body:'今天种下一颗种子。',summary:'种子',tags:[],mood:'平静',weather:'晴',threads:['发芽了吗？']})});
  const start=Date.parse('2026-11-20T12:00:00+09:00');let at=start+10;
  const compared=[],results=[];
  const opts={profile,now:()=>at,weather:()=>[],request,memory:{readTasks:()=>[],
    read:day=>day==='2026-11-20'?[1,2,3].map(i=>({id:'q'+i,at:start+i,question:'新资料'+i,text:'收到了'})):[]},
    model:{memory:async(input,p,schema)=>{
      if(schema.required.includes('match')){compared.push(input);return {match:'0',text:'',comment:''};}
      return {text:input,review:'我记下了。',comment:'我想再看看。',summary:'记下事情',mood:'平静',tags:'素材',thread:''};
    }}};
  let diary=createPersonalityDiary(opts);const signal=new AbortController().signal;
  t.after(()=>{diary.close();close();rmSync(profile,{recursive:true,force:true});});
  const run=()=>diary.run('diary',signal,()=>{},async(name,goal,work)=>{results.push([name,goal,await work()]);});
  await run();assert.equal(compared.length,1);assert.match(compared[0],/新资料3/);
  diary.close();diary=createPersonalityDiary(opts);await run();assert.equal(compared.length,1);
  at+=86400000;await run();assert.equal(compared.length,2);assert.match(compared[1],/新资料2/);
  assert.match(results[0].join(' '),/悬念跟进.*2026-11-19\.1\/1.*未解/);
});

test('悬念质问续答不受旧的逐日处理标记影响',async t=>{
  let at=Date.parse('2026-11-21T23:59:59+09:00');
  const profile=mkdtempSync(join(tmpdir(),'fy-thread-day-'));
  const options={profile,now:()=>at},source='2026-11-19.1/2';
  let diary=createPersonalityDiary(options);
  assert(diary.claimThread(source));diary.close();diary=createPersonalityDiary(options);
  const nag={id:'fixture',source:'diary',source_id:source,status:'意外中断',interruptions:1,talk:[],revision:1,turns:1,questions:1,next:'有下文吗？'};
  const store={...diary,nags:()=>[nag],syncNags:async()=>{}};
  let shown=0;
  const nags=createPersonalityNags({store,now:()=>at,idle:()=>true,show:async()=>{shown++;return false;}});
  t.after(async()=>{await nags.close();diary.close();rmSync(profile,{recursive:true,force:true});});
  const signal=new AbortController().signal;
  await nags.poll(signal);assert.equal(shown,0);
  await nags.resume('fixture',signal);assert.equal(shown,1);
  at+=1000;await nags.poll(signal);assert.equal(shown,1);
  await nags.resume('fixture',signal);assert.equal(shown,2);
});

test('执行期间冻结轮询和等待队列，恢复时保留剩余间隔',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-idle-round-')),timers=new Map();
  let at=1000000,calls=0;
  const checks=createReminderChecks({profile,now:()=>at,isBusy:()=>false,
    setTimer(fn,ms){const key=Symbol();timers.set(key,{fn,at:at+ms});return key;},clearTimer:key=>timers.delete(key),
    handlers:{review:async()=>{calls++;return '已核对';}}});
  t.after(()=>{checks.close();rmSync(profile,{recursive:true,force:true});});
  async function advance(ms){
    at+=ms;
    for(const [key,timer] of [...timers])if(timers.has(key)&&timer.at<=at){timers.delete(key);timer.fn();}
    await settle();
  }
  checks.start();await advance(20_000);checks.setExecutionBusy(true);
  checks.enqueue('review');await advance(2*3600_000);
  const review=()=>checks.polls().find(j=>j.id==='review');
  assert.equal(calls,0);assert.equal(review().misses,0);assert.equal(review().nextAt-at,40_000);
  checks.setExecutionBusy(false);await advance(39_999);assert.equal(calls,0);
  await advance(1);await advance(15_000);assert.equal(calls,1);
});

test('集中处理超过二十分钟仍有可执行 AI 工作时保持本轮，清空后正常结束',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-drain-round-')),timers=new Map(),release=Promise.withResolvers();
  let at=Date.parse('2026-11-23T06:00:00+09:00'),active,leases=0;
  const checks=createReminderChecks({profile,now:()=>at,isBusy:()=>false,
    beginAiRound:()=>{leases++;return {signal:new AbortController().signal,release:()=>{leases--;}};},
    setTimer(fn,ms){const id=Symbol();timers.set(id,{fn,at:at+ms});return id;},clearTimer:id=>timers.delete(id),
    handlers:{review:async signal=>{active=signal;await release.promise;active=null;return '本轮评价已收尾';}}});
  t.after(()=>{release.resolve();checks.close();rmSync(profile,{recursive:true,force:true});});
  async function advance(ms){
    at+=ms;
    for(const [id,timer] of [...timers])if(timers.has(id)&&timer.at<=at){timers.delete(id);timer.fn();}
    await settle();
  }
  checks.start();checks.enqueue('review');await advance(60_000);
  assert.ok(active);
  for(let i=0;i<3;i++){await advance(10*60_000);assert.equal(active.aborted,false);assert.equal(leases,1);}
  release.resolve();await settle();assert.equal(checks.pending,false);assert.equal(leases,0);
});

test('手记分批成功单独计时，遇忙才入重试队列，进度归入自主行动',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-audit-yield-')),timers=new Map(),first=Promise.withResolvers();
  let at=Date.parse('2026-11-23T00:23:53+09:00'),auditCalls=0,inspections=0;
  let busy=false,leases=0;
  const log=[],bubble=[];
  const checks=createReminderChecks({profile,now:()=>at,isBusy:id=>id==='diaryAudit'&&busy,
    setTimer(fn,ms){const key=Symbol();timers.set(key,{fn,at:at+ms});return key;},clearTimer:key=>timers.delete(key),
    handlers:{diaryAudit:async()=>++auditCalls===1?first.promise:'下一批已处理',refinement:()=>null},
    log:row=>{log.push(row);return true;},onIdleResult:row=>bubble.push(row),
    beginAiRound(){leases++;return {signal:new AbortController().signal,release(){leases--;}};},
    inspectRecent:async()=>{inspections++;return {scanned:4,completed:1,failed:0,top:[]};}});
  t.after(()=>{checks.close();rmSync(profile,{recursive:true,force:true});});
  async function advance(ms){
    at+=ms;
    for(const [key,timer] of [...timers])if(timers.has(key)&&timer.at<=at){timers.delete(key);timer.fn();}
    await settle();
  }
  checks.enqueue('diaryAudit');checks.start();
  await advance(60_000);
  assert.equal(auditCalls,1);
  assert.equal(inspections,1);
  assert.equal(checks.polls().find(j=>j.id==='diaryAudit').running,true);
  assert.ok(checks.read(tokyoDay(at)).events.some(r=>r.project==='分析专家巡检'&&r.status==='已检查'));
  checks.record('手记质问','已暂停','旧手记回执',at);
  checks.record('修订手记与唠叨','待执行','旧修订回执',at);
  first.resolve({nextBatch:true,detail:'已保存 2 步'});
  await settle();await advance(14_999);
  const auditPoll=()=>checks.polls().find(j=>j.id==='diaryAudit');
  assert.equal(auditCalls,1);
  assert.equal(auditPoll().queuedAt,null);
  assert.equal(auditPoll().nextAt,at+1);
  assert.deepEqual(checks.diaryWork(),[{name:'手记质问',state:'等待续跑',at:at+1}]);
  assert.equal(leases,1,'批间等候仍沿用同一轮模型预算');
  assert.ok(log.some(r=>r.route==='手记质问'&&r.stage==='本批完成'&&r.result.includes('已保存 2 步')));
  assert.deepEqual(bubble,[]);
  busy=true;
  await advance(1);
  assert.equal(auditCalls,1);
  assert.equal(auditPoll().queuedAt,at);
  assert.deepEqual(checks.diaryWork(),[{name:'手记质问',state:'等待空闲'}]);
  assert.equal(checks.pending,false);
  const reminders=checks.read(tokyoDay(at));
  assert.deepEqual(reminders.queue,[]);
  assert.ok(reminders.events.every(r=>!['手记质问','修订手记与唠叨'].includes(r.project)));
  busy=false;
  await advance(15_000);
  assert.equal(auditCalls,2);
  assert.deepEqual(checks.diaryWork(),[]);
  assert.equal(leases,0);
  assert.deepEqual(bubble.map(r=>r.status),['已检查']);
});

test('其他自主任务用完本轮预算时，等待续跑的手记顺延，重启也沿用该时间',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-audit-round-pause-')),timers=new Map();
  const minute=60_000;
  let at=Date.parse('2026-11-23T03:00:00+09:00'),auditCalls=0,reviewCalls=0;
  const options={profile,now:()=>at,isBusy:()=>false,lastRun:id=>id==='review'?at:undefined,
    setTimer(fn,ms){const key=Symbol();timers.set(key,{fn,at:at+ms});return key;},clearTimer:key=>timers.delete(key),
    handlers:{diaryAudit(){auditCalls++;return {nextBatch:true};},review(){reviewCalls++;return {roundPaused:true};}}};
  let checks=createReminderChecks(options);
  t.after(()=>{checks.close();rmSync(profile,{recursive:true,force:true});});
  async function advance(ms){
    at+=ms;
    for(const [key,timer] of [...timers])if(timers.has(key)&&timer.at<=at){timers.delete(key);timer.fn();}
    await settle();
  }
  const auditPoll=()=>checks.polls().find(row=>row.id==='diaryAudit');
  checks.start();await advance(minute);
  assert.equal(auditCalls,1);
  checks.enqueue('review');await advance(15_000);
  assert.equal(reviewCalls,1);
  assert.equal(auditCalls,1);
  const resumeAt=at+60*minute;
  assert.equal(auditPoll().nextAt,resumeAt);
  checks.close();checks=createReminderChecks(options);checks.start();
  assert.equal(auditPoll().nextAt,resumeAt);
  await advance(minute);
  assert.equal(auditCalls,1);
});

test('核对手记到五分钟收完当前小批，按已设周期续跑，重启不会提前开工',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-audit-window-')),timers=new Map(),first=Promise.withResolvers();
  const minute=60_000,log=[];
  let at=Date.parse('2026-11-23T03:00:00+09:00'),auditCalls=0;
  const options={profile,now:()=>at,isBusy:()=>false,
    setTimer(fn,ms){const key=Symbol();timers.set(key,{fn,at:at+ms});return key;},clearTimer:key=>timers.delete(key),
    log:row=>{log.push(row);return true;},
    handlers:{diaryAudit(){return ++auditCalls===1?first.promise:'核对完成';}}};
  let checks=createReminderChecks(options);
  t.after(()=>{checks.close();rmSync(profile,{recursive:true,force:true});});
  async function advance(ms){
    at+=ms;
    for(const [key,timer] of [...timers])if(timers.has(key)&&timer.at<=at){timers.delete(key);timer.fn();}
    await settle();
  }
  const auditPoll=()=>checks.polls().find(row=>row.id==='diaryAudit');
  checks.configure('diaryAudit',{enabled:true,minutes:10,maximum:3});
  checks.start();await advance(minute);
  const startedAt=at;
  await advance(5*minute+1);
  assert.equal(auditPoll().running,true);
  first.resolve({nextBatch:true,detail:'已保存 2 步'});await settle();
  assert.match(log.find(row=>row.stage==='本批完成')?.result,/下个轮询周期继续/);
  assert.equal(auditPoll().nextAt,startedAt+10*minute);
  assert.equal(auditPoll().queuedAt,null);
  checks.close();checks=createReminderChecks(options);checks.start();checks.enqueue('diaryAudit');
  await advance(startedAt+10*minute-at-1);
  assert.equal(auditCalls,1);
  await advance(1);
  assert.equal(auditCalls,2);
});

test('日志巡检重启后沿用上次成功时间和已设间隔，过期只补查一次',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-inspection-restart-')),timers=new Map(),windows=[];
  const minute=60_000;
  let at=Date.parse('2026-11-23T04:03:00+09:00');
  const options={profile,now:()=>at,isBusy:()=>false,
    setTimer(fn,ms){const key=Symbol();timers.set(key,{fn,at:at+ms});return key;},clearTimer:key=>timers.delete(key),
    inspectRecent:async(from,through)=>{
      windows.push([from,through]);
      return {scanned:1,completed:0,failed:1,top:[['TEST',1]]};
    }};
  let checks=createReminderChecks(options);
  t.after(()=>{checks.close();rmSync(profile,{recursive:true,force:true});});
  async function advance(ms){
    at+=ms;
    for(const [key,timer] of [...timers])if(timers.has(key)&&timer.at<=at){timers.delete(key);timer.fn();}
    await settle();
  }
  function restart(){checks.close();checks=createReminderChecks(options);checks.start();}
  checks.start();await advance(minute);
  const first=at;
  assert.deepEqual(windows,[[first-24*60*minute,first]]);
  for(const gap of [18,5,6,4,9]){
    await advance((gap-1)*minute);restart();await advance(minute);
    assert.equal(checks.unread,1);
    assert.equal(checks.polls()[0].nextAt,first+60*minute);
  }
  await advance(first+60*minute-at);
  assert.deepEqual(windows[1],[first,at]);
  checks.configure('inspection',{enabled:true,minutes:30,maximum:3});
  restart();
  assert.equal(checks.polls()[0].nextAt,at+30*minute);
  checks.close();at+=100*minute;checks=createReminderChecks(options);checks.start();
  await advance(minute);
  assert.deepEqual(windows.slice(2),[[first+60*minute,at]]);
  assert.equal(checks.unread,3);
  assert.equal(checks.polls()[0].nextAt,at+30*minute);
});

test('异常退出后只把无回执的行动标记中断，耗时未知',async()=>{
  const db=new DatabaseSync(':memory:'),rows=[];
  const start=createAutonomousAudit(db,e=>rows.push(e),()=>1);
  start.begin('写日记','核对事实');
  const next=createAutonomousAudit(db,e=>rows.push(e),()=>999);
  assert.equal(rows[1].action_id,rows[0].action_id);assert.equal(rows[1].stage,'中断');assert.equal(rows[1].duration_ms,null);
  await settle();next.close();db.close();
});
