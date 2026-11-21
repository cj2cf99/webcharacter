import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReminderChecks,checkDueItems} from '../desktop/reminder-checks.mjs';
import {tokyoDay} from '../desktop/conversation-history.mjs';
import {weatherBrief,WEATHER_HOUR} from '../desktop/weather-brief.mjs';

test('三地简报：持续晴天与不变日温差不重发；四小时变化与新预警独立',()=>{
  const row={id:'weiyang',name:'未央区',current:{state:'ready',value:{text:'晴',temperature:20}},
    minimum:{state:'ready',value:{temperature:9,maximum:21}}};
  const triggers=new Map(),start=1000;
  const brief=(old,hr,reasons=triggers)=>weatherBrief([row],reasons,old,start+hr*WEATHER_HOUR);
  const initial=brief({},0);assert.equal(initial.body,'未央区：晴，9～21°C');
  row.current.value.temperature=16;
  assert.equal(brief(initial.state,5).body,undefined);
  row.current.value.text='小雨';
  assert.equal(brief(initial.state,3).body,undefined);
  const changed=brief(initial.state,4);assert.equal(changed.body,'未央区：小雨');
  row.minimum.value.maximum=22;
  assert.equal(brief(changed.state,5).body,undefined);
  const danger=brief(changed.state,5,new Map([['weiyang',['暴雨橙色预警']]]));
  assert.equal(danger.body,'未央区：暴雨橙色预警');
  assert.equal(brief(danger.state,8).body,'未央区：9～22°C');
  row.minimum.state='error';assert.equal(brief(changed.state,9).body,undefined);
});

test('天气简报和比较基线一起提交，重开后未读、逐条已读与一键已读一致',()=>{
  const options={profile:mkdtempSync(join(tmpdir(),'feiyue-brief-')),isBusy:()=>false};
  let store=createReminderChecks(options);
  try{
    store.saveWeather({lastCheck:1},{title:'天气提醒',body:'未央区：大雨预警'},42);
    store.saveWeather({lastCheck:2},{},43);
    store.close();store=createReminderChecks(options);
    assert.equal(store.weatherState().lastCheck,2);assert.equal(store.unread,1);
    const [item]=store.notices().events;store.markRead(item.id);
    assert.equal(store.unread,0);assert.equal(store.notices('read').events[0].body,item.body);
    store.saveWeather({lastCheck:3},{title:'天气简报',body:'小仓北区：转晴'},44);
    store.markRead('all');assert.equal(store.notices().events.length,0);assert.equal(store.notices('all').events.length,2);
  }finally{store.close();}
});

test('真实计时状态、忙时顺延、第三次保留一个任务与重启恢复',async()=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-checks-'));
  let now=Date.parse('2026-11-20T14:55:00Z'),busy=true,calls=0;
  const timers=new Map();
  const options={profile,now:()=>now,isBusy:()=>busy,check:async()=>{calls++;return '没有到期未完成事项';},
    setTimer:(fn,ms)=>{const key=Symbol();timers.set(key,{fn,at:now+ms});return key;},clearTimer:key=>timers.delete(key)};
  function advance(ms){
    now+=ms;
    for(const [key,timer] of [...timers])if(timers.has(key)&&timer.at<=now){timers.delete(key);timer.fn();}
  }
  let checks=createReminderChecks(options);
  try{
    checks.start();checks.start();
    const read=()=>checks.read(tokyoDay(now));
    assert.equal(read().nextAt,now+60_000);assert.equal(timers.size,1);
    advance(59_999);assert.equal(read().events.length,0);
    advance(1);assert.equal(read().events[0].status,'未执行');
    advance(20*60_000);assert.match(read().events[0].detail,/第 2 次/);
    advance(20*60_000);assert.equal(checks.pending,true);assert.equal(calls,0);
    advance(20*60_000);assert.equal(checks.pending,true);assert.equal(timers.size,2);
    checks.close();checks=createReminderChecks(options);checks.start();
    assert.equal(checks.pending,true);advance(60_000);assert.equal(calls,0);
    busy=false;advance(15_000);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(checks.pending,false);assert.equal(calls,1);assert.equal(read().events[0].status,'已检查');
    assert.equal(read().nextAt,now+20*60_000-15_000);
    assert.equal(checks.read('2026-11-20').events.length,1,'东京跨日后仍可查看旧记录');
    for(let i=0;i<23;i++)checks.record('三地天气','查询失败','接口暂不可用');
    assert.equal(read().events.length,8);assert.ok(read().pages>=3);assert.ok(checks.read(tokyoDay(now),1).events.length>0);
    assert.equal(timers.size,1);
  }finally{checks.close();}
  assert.equal(timers.size,0);
});

test('晚间学习只接受当日双完成证据，21 点开始，重开后也不重播',async()=>{
  let at=Date.parse('2026-11-20T20:59:59+09:00');
  const observed=[],day='2026-11-20',profile=mkdtempSync(join(tmpdir(),'feiyue-study-'));
  let checks=createReminderChecks({profile,now:()=>at});
  const inspect=flag=>checkDueItems(async()=>Response.json({items:[],today:day,dailyStudyComplete:flag}),undefined,
    date=>{if(checks.takeEveningPraise(date))observed.push(date);});
  await inspect(true);at+=1000;await inspect(false);await inspect(undefined);
  assert.deepEqual(observed,[]);await inspect(true);checks.close();
  checks=createReminderChecks({profile,now:()=>at});await inspect(true);
  assert.equal(checks.takeEveningPraise('2026-11-19'),false);checks.close();
  assert.deepEqual(observed,[day]);
});

test('事项实际走只读接口；失败和空清单分别留痕',async()=>{
  const data={today:'2026-11-20',items:[{title:'多邻国一节课',deadline:'2026-11-20'},{title:'周报',deadline:'2026-11-18'}]};
  const result=await checkDueItems(async(path,options)=>{
    assert.equal(path,'/api/reminder-review');assert.equal(options.method,'GET');return Response.json(data);
  });
  assert.match(result,/今日 1 项，逾期 1 项/);assert.match(result,/多邻国一节课/);
  await assert.rejects(checkDueItems(async()=>new Response(null,{status:503})),/503/);
  await assert.rejects(checkDueItems(null),/未配置/);
  await assert.rejects(checkDueItems(async()=>Response.json({})),/格式/);
  let tick;
  const checks=createReminderChecks({profile:mkdtempSync(join(tmpdir(),'feiyue-check-failure-')),
    check:()=>checkDueItems(async()=>new Response(null,{status:503})),isBusy:()=>false,setTimer:fn=>{tick=fn;return 1;},clearTimer(){}});
  try{
    checks.start();tick();await new Promise(resolve=>setImmediate(resolve));
    assert.match(checks.read(tokyoDay(Date.now())).events[0].detail,/503/);
    assert.equal(checks.read(tokyoDay(Date.now())).events[0].status,'查询失败');
  }finally{checks.close();}
});
