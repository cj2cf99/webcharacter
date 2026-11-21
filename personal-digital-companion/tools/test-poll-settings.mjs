import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createReminderChecks} from '../desktop/reminder-checks.mjs';
import {tokyoDay} from '../desktop/conversation-history.mjs';

const minute=60_000;
function fixture(t){
  let time=Date.parse('2026-11-20T01:00Z');
  const timers=new Map(),log=[],busy=new Set(),actions={};
  const profile=mkdtempSync(join(tmpdir(),'feiyue-polls-'));
  const options={profile,now:()=>time,isBusy:id=>busy.has(id),
    setTimer(fn,delay){const key=Symbol();timers.set(key,{fn,at:time+delay});return key;},
    clearTimer:key=>timers.delete(key),
    handlers:Object.fromEntries(['tasks','due','weather'].map(id=>[id,()=>{log.push(id);return actions[id]?.()??'完成';}]))};
  let store=createReminderChecks(options);
  t.after(()=>store.close());
  return {busy,log,actions,profile,get store(){return store;},get now(){return time;},
    row(id){return store.polls().find(row=>row.id===id);},
    set(id,values){return store.configure(id,{...this.row(id),...values});},
    reopen(edit){store.close();edit?.();store=createReminderChecks(options);},
    async advance(ms){
      time+=ms;
      for(const [key,timer] of [...timers]){
        if(timer.at<=time&&timers.delete(key))timer.fn();
      }
      await new Promise(done=>setImmediate(done));
    }};
}

test('三项分别保存设置，校验两端边界，重启恢复；停用和重新启用重设下次时间',async t=>{
  const f=fixture(t);
  assert.deepEqual(f.store.polls().map(j=>[j.id,j.enabled,j.minutes,j.maximum]),
    [['tasks',true,15,3],['due',true,20,3],['weather',true,60,3]]);
  for(const values of [{minutes:9},{minutes:301},{minutes:10.1},{minutes:'15'},{maximum:-1},{maximum:101},{maximum:1.5},{enabled:1}])
    assert.throws(()=>f.set('due',values));
  f.set('tasks',{minutes:10,maximum:0});f.set('weather',{enabled:false,minutes:300,maximum:100});
  f.reopen();f.store.start();
  assert.equal(f.row('weather').nextAt,null);assert.equal(f.row('tasks').nextAt,f.now);
  assert.equal(f.row('due').nextAt,f.now+minute);assert.equal(f.row('due').minutes,20);
  f.set('weather',{enabled:true});assert.equal(f.row('weather').nextAt,f.now+300*minute);
  await f.advance(minute);assert.deepEqual(f.log,['tasks','due']);
  f.set('due',{minutes:123});assert.equal(f.row('due').nextAt,f.now+123*minute);
});

test('达到阈值入队，连续忙以及重启不产生重复任务，空闲后逐项执行',async t=>{
  const f=fixture(t);
  for(const id of ['tasks','due','weather']){f.busy.add(id);f.set(id,{minutes:10,maximum:id==='tasks'?0:2});}
  f.store.start();await f.advance(0);const first=f.row('tasks').queuedAt;
  assert.equal(first,f.now);await f.advance(minute);
  assert.equal(f.row('due').misses,1);assert.equal(f.row('due').queuedAt,null);
  await f.advance(10*minute);assert.ok(f.row('due').queuedAt);assert.ok(f.row('weather').queuedAt);
  await f.advance(10*minute);assert.equal(f.row('tasks').queuedAt,first);
  f.reopen();f.store.start();await f.advance(minute);
  assert.equal(f.store.polls().filter(j=>j.queuedAt!==null).length,3);
  f.set('weather',{enabled:false});assert.equal(f.row('weather').queuedAt,null);
  f.busy.clear();
  let complete;f.actions.tasks=()=>new Promise(done=>{complete=done;});
  await f.advance(15_000);await f.advance(15_000);assert.deepEqual(f.log,['tasks']);
  complete('完成');await f.advance(15_000);await f.advance(15_000);
  assert.deepEqual(f.log,['tasks','due']);assert.equal(f.store.pending,false);
});

test('最大值允许累计 100 次，降低上限可立即显示已推延的任务',async t=>{
  const f=fixture(t);f.set('tasks',{minutes:10,maximum:100});f.set('weather',{enabled:false});
  f.set('due',{minutes:300,maximum:100});f.busy.add('tasks');f.busy.add('due');
  f.store.start();await f.advance(0);
  for(let i=1;i<99;i++)await f.advance(10*minute);
  assert.equal(f.row('tasks').misses,99);assert.equal(f.row('tasks').queuedAt,null);
  await f.advance(10*minute);assert.equal(f.row('tasks').queuedAt,f.now);
  f.set('due',{maximum:1});assert.equal(f.row('due').queuedAt,f.now);
  f.set('due',{enabled:false});assert.equal(f.row('due').misses,0);assert.equal(f.store.pending,true);
});

test('执行中被本地任务抢占时一轮只记一次；失败留痕且不计为占用',async t=>{
  const f=fixture(t);f.actions.tasks=()=>({deferred:true});
  f.store.start();await f.advance(0);
  const history=()=>f.store.read(tokyoDay(f.now)).events.filter(row=>row.project==='任务轮询');
  assert.equal(history().length,1);assert.equal(f.row('tasks').misses,1);
  f.actions.tasks=()=>{throw Error('网络错误');};
  await f.advance(15*minute);assert.equal(history().length,2);assert.equal(history()[0].status,'查询失败');
  assert.equal(f.row('tasks').misses,0);assert.equal(f.row('tasks').queuedAt,null);
});

test('已有提醒检查的待执行记录迁入队列一次',t=>{
  const f=fixture(t);
  f.reopen(()=>{
    const db=new DatabaseSync(join(f.profile,'reminder-checks.sqlite'));
    db.exec('DROP TABLE local_polls');
    db.prepare('INSERT INTO checks(day,at,due,project,status,detail,misses) VALUES(?,?,?,?,?,?,?)')
      .run(tokyoDay(f.now),f.now,f.now,'到期事项','待执行','本地任务占用',3);
    db.close();
  });
  assert.equal(f.row('due').queuedAt,f.now);f.set('due',{enabled:false});f.reopen();
  assert.equal(f.store.pending,false);
});
