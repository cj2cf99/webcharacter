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

test('排队的日记与整理共用十分钟，超时等待正式轮询；任务日志可回读目标、实际耗时和子动作',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-idle-round-')),timers=new Map(),receipts=[];
  let at=Date.parse('2026-11-21T11:00:00+09:00'),busy=false,complete,started=0,aborted=false;
  const traffic=createTaskTrafficLog(profile,{clock:()=>at});
  const options={profile,now:()=>at,isBusy:()=>busy,log:traffic.write,onIdleResult:result=>receipts.push(result),
    setTimer(fn,ms){const key=Symbol();timers.set(key,{fn,at:at+ms});return key;},clearTimer:key=>timers.delete(key),
    handlers:{diary:async(_s,step,goal)=>{assert.match(goal,/整理未入册的素材/);busy=true;await step('悬念跟进','比对悬念 1',async()=>'尚无下文');
      await new Promise(ok=>{complete=ok;});busy=false;return '已核对一条';},
    review:async signal=>{started++;busy=true;await new Promise(ok=>signal.addEventListener('abort',ok,{once:true}));aborted=true;busy=false;return {deferred:true};}}};
  async function advance(ms){
    at+=ms;
    for(const [key,timer] of [...timers])if(timers.has(key)&&timer.at<=at){timers.delete(key);timer.fn();}
    await settle();
  }
  let checks=createReminderChecks(options);
  t.after(async()=>{checks.close();await traffic.readPage();rmSync(profile,{recursive:true,force:true});});
  checks.start();await advance(60_000);
  await advance(4*60_000);complete();await settle();await advance(15_000);
  assert.equal(started,1);
  await advance(5*60_000+45_000);assert(aborted);assert.equal(checks.pending,false);
  const lines=(await traffic.readPage()).lines.map(JSON.parse);
  assert(lines.every(r=>r.category==='绯月自主行动'&&r.goal&&r.started_at));
  const pause=lines.find(r=>r.route==='补行动评价'&&r.stage==='已暂停');
  assert.equal(pause.duration_ms,345000);assert.match(pause.result,/10 分钟/);
  assert.deepEqual(receipts,[{id:'diary',status:'已检查',detail:'已核对一条',durationMs:240000},
    {id:'review',status:'已暂停',detail:pause.result,durationMs:pause.duration_ms}]);
  const child=lines.find(r=>r.route==='悬念跟进'&&r.stage==='完成');
  assert.equal(child.result,'尚无下文');
  assert(lines.some(r=>r.action_id===child.parent_id&&r.stage==='已检查'&&r.duration_ms===240000));
  checks.close();checks=createReminderChecks(options);checks.start();
  checks.enqueue('review');await advance(60_000);
  assert.equal(started,1);assert.equal(checks.pending,false);
});

test('手记占用模型时巡检照常运行，暂停的核对延后再取件',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-audit-yield-')),timers=new Map(),first=Promise.withResolvers();
  let at=Date.parse('2026-11-23T00:23:53+09:00'),auditCalls=0,inspections=0;
  const checks=createReminderChecks({profile,now:()=>at,isBusy:()=>false,
    setTimer(fn,ms){const key=Symbol();timers.set(key,{fn,at:at+ms});return key;},clearTimer:key=>timers.delete(key),
    handlers:{diaryAudit:async()=>++auditCalls===1?first.promise:'下一批已处理'},
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
  first.resolve({deferred:true,started:true,detail:'已保存 2 步，下批从原进度继续'});
  await settle();await advance(14_999);
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
