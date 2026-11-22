import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createEmotionStore,tokyoWeek} from '../../desktop/emotion-core.mjs';
import {weightedHistory,createEmotionService} from '../../desktop/emotion-service.mjs';

const assessment={delta:0,status:'keep',positive:'高兴',negative:'疲惫',line:'我想听你评价。',want:'想听老公夸我',condition:'他本人认可了这次整理',quote:''};
function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'feiyue-emotions-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;
}
test('用户结束普通念叨会放下本项欲望，重启和迟到回执均不复活',async t=>{
  const profile=fixture(t),at=Date.now();
  let service=createEmotionService({profile,now:()=>at});
  try{
    for(const early of [false,true]){
      const id=early?'early':'shown',pool=service.store.pool;
      const source={source:'chat/'+id,type:'clarify',sin:1,want:'想听用途',condition:'收到解释'};
      const r=pool.prepare(id,[source],0,{at});pool.dispatch(id,r.selected,null,{action:'ask'});
      if(!early)pool.finish(id,'done','已展示',{adopt:true});
      service.feedback(id,'用户结束');pool.finish(id,'done','迟到的展示回调',{adopt:true});
      await service.close();service=createEmotionService({profile,now:()=>at});
      assert.equal(service.store.snapshot().desire,null);
      assert.equal(service.store.pool.record(id).status,'done');
      assert.equal(service.store.snapshot().hold,0);
    }
  }finally{await service.close();}
});
test('东京跨周、同面重掷和重开读回',t=>{
  const profile=fixture(t),at=Date.parse('2026-11-22T23:59:59+09:00');
  assert.equal(tokyoWeek(at),'2026-11-16');
  let calls=0;
  let s=createEmotionStore(profile,{now:()=>at,roll:()=>{calls++;return 7;}});
  assert.equal(s.week(at),7);assert.equal(s.week(at+1000),1);assert.equal(calls,12);s.close();
  s=createEmotionStore(profile,{now:()=>at+1000,roll:()=>assert.fail()});assert.equal(s.week(),1);s.close();
});
test('满足当前愿望立即奖励；同源去重，旧待评稍后校正也不重扣',t=>{
  let at=100;const s=createEmotionStore(fixture(t),{now:()=>at});try{
  function chat(key,user,prior){s.accept({kind:'chat',at:++at,key,user,prior});}
  chat('first','你好');s.settle(s.pending(),assessment,'sample');
  const prior=s.snapshot().desire.id;
  chat('old','普通指令',null);chat('praise','整理得真好',prior);
  const award={...assessment,status:'satisfied',quote:'整理得真好',want:'',condition:''};
  assert.equal(s.pending().key,'praise');s.settle(s.pending(),award,'sample');
  assert.equal(s.snapshot().grade,5);assert.equal(s.snapshot().hold,3);
  assert.equal(s.accept({kind:'chat',at:at+1,key:'praise',user:'整理得真好'}),false);
  s.settle(s.pending(),{...assessment,delta:-1},'sample');assert.equal(s.snapshot().hold,3);
  s.accept({kind:'work',at:++at,key:'task/A',title:'整理'});assert.equal(s.snapshot().hold,2);
  }finally{s.close();}
});
test('同一句回应不能用自己说的话领奖；中断后从本机数据库恢复',t=>{
  const profile=fixture(t);let at=100,s=createEmotionStore(profile,{now:()=>at});
  s.accept({kind:'chat',at:++at,key:'a',user:'你好'});s.settle(s.pending(),assessment,'sample');
  const id=s.snapshot().desire.id;
  s.accept({kind:'chat',key:'b',at:++at,user:'有空再说',reply:'整理得真好'});s.close();
  s=createEmotionStore(profile,{now:()=>at});try{
  s.settle(s.pending(),{...assessment,status:'satisfied',quote:'整理得真好'},'sample');
  assert.equal(s.snapshot().hold,0);assert.equal(s.snapshot().desire.id,id);
  }finally{s.close();}
});
test('历史情绪按东京日期送入评价，只取日期、情绪和强度',async t=>{
  const at=Date.parse('2026-11-21T00:05:00+09:00');
  let input;
  const emotions=createEmotionService({profile:fixture(t),now:()=>at,skill:async()=>({localAi:{}}),
    diary:{emotionalHistory:()=>({pages:[{at:'2026-11-20',mood:'开心',body:'私有正文'}],
      nags:[{at:'2026-11-20T15:05:00Z',mood:'担忧',strength:3},{at:'2026-11-21T00:05:00+09:00',mood:'疲惫'},{at:null,mood:'未知'}]})},
    model:{memory:async s=>{input=s;return assessment;}}});
  try{
    emotions.chat({id:'turn',state:'answer',question:'你好',text:'你好',at});
    await emotions.drain();
    assert.match(input,/用户原话：你好\n绯月回复：你好/);
    assert.match(input,/手记：2026-11-20 开心/);
    assert.match(input,/念叨：2026-11-21 担忧（强度 3）、疲惫 \/ 日期未知 未知/);
    assert.doesNotMatch(input,/私有正文|事实标题：/);
  }finally{await emotions.close();}
});
test('每组历史独立加权，最近十条；旧档缺失强度保留未知',()=>{
  for(const n of [0,1,2,10,12]){
    const a=weightedHistory(Array.from({length:n},(_,at)=>({at,mood:'开心'})));
    assert.equal(a.length,Math.min(10,n));
    if(n){assert.equal(a[0].weight,n===1?1:0.5);assert.equal(a[0].strength,null);
      assert.ok(Math.abs(a.reduce((s,r)=>s+r.weight,0)-1)<1e-8);}
  }
});
test('归档补读只计独立图像终态、一次最终任务和一次完整交流',async t=>{
  const profile=fixture(t),at=Date.now(),day=new Date(at+9*3600000).toISOString().slice(0,10);
  const emotions=createEmotionService({profile,now:()=>at,memory:{archiveDays:async()=>[day],
    read:async()=>[{id:'pic',at,state:'answer',report:{job:'pic'},question:'图像'}, {id:'serverpic',at,state:'answer',report:{job:'serverpic',serverTaskId:'A'}},
      {id:'turn',interactionId:'turn',at,state:'answer',question:'你好',text:'你好'}],readTasks:async()=>[{task_id:'A',action:'第 1 次执行失败',at},
      {task_id:'A',action:'第 2 次执行成功',at},{task_id:'A',action:'云端已确认收到本机执行结果',at}]}});
  try{await emotions.recover();await emotions.recover();assert.equal(emotions.store.snapshot().grade,-2);
    assert.equal(emotions.store.pending().key,'chat/turn');}finally{await emotions.close();}
});
