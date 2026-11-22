import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReminderChecks,checkDueItems} from '../desktop/reminder-checks.mjs';
import {tokyoDay} from '../desktop/conversation-history.mjs';
import {weatherBrief,parseUpcomingPrecipitation} from '../desktop/weather-brief.mjs';

const HOUR=3600_000;
const weatherStart=Date.parse('2026-11-23T10:00:00+09:00');
const ready=value=>({state:'ready',value});
const forecast=(at,type,probability)=>({forecastTime:new Date(at).toISOString(),precipitation:{type,probability}});
const weatherRow=()=>({id:'weiyang',name:'未央区',current:ready({text:'晴',temperature:20,wind:2}),
  minimum:ready({temperature:5,maximum:21,below:false}),hourly:ready([]),alerts:ready({values:[]})});

test('东京每日首封汇报每个地点，普通变化及 18 点固定简报静默',()=>{
  const row=weatherRow();
  const other={...weatherRow(),id:'yongshou',name:'永寿县',alerts:ready({values:[{title:'暴雨橙色预警'}]})};
  const brief=(old,at,reasons=new Map())=>weatherBrief([row,other],reasons,old,at);
  const initial=brief({},weatherStart,new Map([['yongshou',['暴雨橙色预警']]]));
  assert.equal(initial.title,'天气简报');
  assert.equal(initial.body,'未央区：晴，5～21°C，暂无生效预警\n永寿县：晴，5～21°C，暴雨橙色预警');
  row.current=ready({text:'多云',temperature:19,wind:8});
  row.minimum=ready({temperature:6,maximum:22,below:false});
  assert.equal(brief(initial.state,weatherStart+8*HOUR).body,undefined);
  assert.equal(brief({at:weatherStart,places:{weiyang:{sky:'晴',range:'5～21°C'}}},weatherStart+8*HOUR).body,undefined);
  const midnight=Date.parse('2026-11-24T00:00:00+09:00');
  assert.equal(brief(initial.state,midnight-1).body,undefined);
  assert.equal(brief(initial.state,midnight).title,'天气简报');
});

test('已报低温当日不重发，首次跌破门槛和新发或升级预警立即合成一条',()=>{
  const row=weatherRow();
  const brief=(old,h,reasons=new Map())=>weatherBrief([row],reasons,old,weatherStart+h*HOUR);
  const initial=brief({},0);
  row.minimum=ready({temperature:4.9,maximum:20,below:true});
  const warning=brief(initial.state,1,new Map([['weiyang',['暴雨橙色预警']]]));
  assert.equal(warning.body,'未央区：低温，最低 4.9°C，暴雨橙色预警');
  assert.equal(warning.title,'天气提醒');
  row.minimum=ready({temperature:3,maximum:19,below:true});
  assert.equal(brief(warning.state,2).body,undefined);
  row.minimum=ready({temperature:5,maximum:19,below:false});
  const warm=brief(warning.state,3);
  row.minimum=ready({temperature:4,maximum:19,below:true});
  assert.equal(brief(warm.state,4).body,undefined);
  const nextDay=brief(warning.state,24);
  assert.match(nextDay.body,/4～19°C/);
  assert.match(nextDay.body,/留意低温/);
  assert.equal(brief(nextDay.state,25).body,undefined);
});

test('短时预报只报新增的明确雨雪，同一场雨雪和概率反复去重',()=>{
  const row=weatherRow();
  const poll=(old,h,slots)=>{
    const now=weatherStart+h*HOUR;
    row.hourly=slots ? ready(parseUpcomingPrecipitation({hours:slots.map(([lead,type,probability])=>forecast(weatherStart+lead*HOUR,type,probability))},now)) : {state:'error'};
    return weatherBrief([row],new Map(),old,now);
  };
  const initial=poll({},0,[[1,'rain',0.59],[7,'rain',0.9]]);
  assert.doesNotMatch(initial.body,/降雨/);
  const rain=poll(initial.state,1,[[3,'rain',0.6],[4,'rain',0.8]]);
  assert.equal(rain.body,'未央区：预计 13:00 左右有降雨');
  const failed=poll(rain.state,2,null);
  assert.equal(failed.body,undefined);
  const cleared=poll(failed.state,2,[[3,'none']]);
  assert.equal(cleared.body,undefined);
  const resumed=poll(cleared.state,3,[[4,'rain',0.8],[5,'rain',0.9],[6,'mixed',0.7]]);
  assert.equal(resumed.body,'未央区：预计 16:00 左右有雨夹雪');
  const delayed=poll(resumed.state,5,[[8,'rain',0.7]]);
  assert.equal(delayed.body,undefined,'同类雨雪连续在预报中出现，推迟时间不重发');
  const dry=poll(delayed.state,9,[[10,'none']]);
  assert.equal(dry.body,undefined);
  assert.equal(poll(dry.state,10,[[11,'rain',0.7]]).body,'未央区：预计 21:00 左右有降雨');
  assert.throws(()=>parseUpcomingPrecipitation({hours:[forecast(weatherStart+HOUR,'unknown')]},weatherStart),/不可用/);
});

test('失败的查询不吞掉当天首封，紧急预警仍单独送达',()=>{
  const row=weatherRow();
  row.current=row.minimum=row.hourly={state:'error'};
  const failed=weatherBrief([row],new Map(),{},weatherStart);
  assert.equal(failed.body,undefined);
  const warning=weatherBrief([row],new Map([['weiyang',['暴雪红色预警']]]),failed.state,weatherStart+HOUR);
  assert.equal(warning.body,'未央区：暴雪红色预警');
  row.current=ready({text:'阴'});
  row.alerts={state:'error'};
  const partial=weatherBrief([row],new Map(),warning.state,weatherStart+2*HOUR);
  assert.equal(partial.body,'未央区：阴，当前预警暂不可用');
  row.hourly=ready([{key:'rain',at:weatherStart+4*HOUR,until:weatherStart+5*HOUR,label:'降雨'}]);
  assert.equal(weatherBrief([row],new Map(),partial.state,weatherStart+3*HOUR).body,undefined);
});

test('高低温纪录取当地前 14 天，平纪录和当日重复突破静默',()=>{
  const row=weatherRow();
  const temperatures=Object.fromEntries(Array.from({length:14},(_,i)=>[`2026-11-${String(i+9).padStart(2,'0')}`,
    {low:4+i/10,high:18+i}]));
  temperatures['2026-11-08']={low:-20,high:50};
  const previous={places:{weiyang:{temperatures}}};
  const check=(old,h)=>weatherBrief([row],new Map(),old,weatherStart+h*HOUR);
  row.minimum=ready({day:'2026-11-23',temperature:4,maximum:31,below:true});
  const first=check(previous,0);
  assert.match(first.body,/近14天预报最低 4°C，近14天预报最高 31°C/);
  assert.doesNotMatch(first.body,/新纪录/);
  assert.equal('2026-11-08' in first.state.places.weiyang.temperatures,false);
  row.minimum=ready({day:'2026-11-23',temperature:3,maximum:32,below:true});
  const broken=check(first.state,1);
  assert.equal(broken.body,'未央区：近14天预报最低温新纪录 3°C（原 4°C），近14天预报最高温新纪录 32°C（原 31°C）');
  row.minimum=ready({day:'2026-11-23',temperature:2,maximum:33,below:true});
  const latest=check(broken.state,2);
  assert.equal(latest.body,undefined);
  assert.deepEqual(latest.state.places.weiyang.temperatures['2026-11-23'],{low:2,high:33});
  row.minimum=ready({day:'2026-11-24',temperature:2,maximum:34,below:true});
  const next=check(latest.state,24);
  assert.match(next.body,/最高温新纪录 34°C（原 33°C）/);
  assert.doesNotMatch(next.body,/最低温新纪录/);
});

test('统计已知日期，某一方向不足 14 天时不称破纪录',()=>{
  const row=weatherRow();
  const temperatures=Object.fromEntries(Array.from({length:14},(_,i)=>[`2026-11-${String(i+9).padStart(2,'0')}`,
    i===0?{low:5}:{low:5,high:20}]));
  row.minimum=ready({day:'2026-11-23',temperature:4,maximum:25,below:true});
  const result=weatherBrief([row],new Map(),{places:{weiyang:{temperatures}}},weatherStart);
  assert.match(result.body,/最高 20°C（13天）/);
  assert.match(result.body,/最低温新纪录 4°C/);
  assert.doesNotMatch(result.body,/最高温新纪录/);
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

test('沿用本机旧天气检查记录回填每日预报，并按天气地点的日期归档',()=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-weather-history-'));
  const store=createReminderChecks({profile});
  try{
    const place={name:'未央区',timezone:'Asia/Shanghai'};
    const start=Date.parse('2026-11-23T00:00:00+09:00');
    const project='天气 · '+place.name;
    store.record(project,'已检查','1 个有效预警 · 实况 晴 13°C · 全天 -2.5～17°C · 本轮无新简报',start);
    store.record(project,'部分失败','最低 -3°C · 最高温未取得',start+5*60_000);
    store.record(project,'查询失败','当日气温未取得',start+10*60_000);
    store.record(project,'已检查','全天 -1～20°C · 本轮无新简报',start+HOUR);
    store.record('天气 · 永寿县','已检查','全天 -9～20°C',start);
    store.record(project,'已检查','全天 -12～45°C',start-16*24*HOUR);
    assert.deepEqual(store.weatherTemperatureHistory(place,start+2*HOUR),{
      '2026-11-22':{low:-3,high:17},'2026-11-23':{low:-1,high:20},
    });
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
