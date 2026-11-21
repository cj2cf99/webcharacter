import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createDesirePool} from '../../desktop/desire-pool.mjs';
import {createEmotionStore} from '../../desktop/emotion-core.mjs';
import {createInitiative} from '../../desktop/emotion-initiative.mjs';
import {createTopicMemory} from '../../desktop/topic-memory.mjs';
import {searchInitiative} from '../../desktop/public-search.mjs';

test('分系列达标才指定，同系清空、异系五件清三件；重复提交保留相同结果',()=>{
  const db=new DatabaseSync(':memory:');
  const tx=f=>{db.exec('BEGIN');try{const value=f();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
  try{
    const p=createDesirePool(db,tx);
    const entries=Array.from({length:105},(_,i)=>({source:'chat/'+i,sin:i<100?1:2,type:'share',want:'分享',condition:'收到评价'}));
    p.prepare('A',entries.slice(0,99),-1,{at:1});assert.equal(p.forced(()=>true),null);
    p.prepare('B',entries.slice(99),-1,{at:2});const f=p.forced(()=>true);assert.equal(f.row.sin,1);
    assert.equal(p.dispatch('B',f.row.id,f.trigger,{action:'speak'}),true);
    const remaining=p.waiting().map(r=>r.id);assert.equal(remaining.length,2);
    assert.equal(p.dispatch('B',f.row.id,f.trigger,{}),false);assert.deepEqual(p.waiting().map(r=>r.id),remaining);
    assert.equal(p.unsettled().id,'B');p.finish('B','deferred','确认尚未展示');
    const same=p.forced(()=>true);assert.equal(same.trigger,f.trigger);assert.equal(same.row.id,f.row.id);
    p.prepare('C',[], -1,{at:3});
    assert.equal(p.dispatch('C',same.row.id,same.trigger,{action:'speak'}),true);
    assert.deepEqual(p.waiting().map(r=>r.id),remaining);
    p.finish('C','feedback','已展示');assert.equal(p.feedback().id,'C');
    p.finish('C','deferred','迟到的未展示回调');assert.equal(p.feedback()?.result,'已展示');
    p.finish('C','done','用户结束');assert.equal(p.feedback(),undefined);assert.equal(p.unsettled(),undefined);
  }finally{db.close();}
});
test('一次闲时名额，两次评估，从原始事实生成候选，只实际展示一个问题',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-round-')),at=Date.now(),store=createEmotionStore(root,{now:()=>at});
  try{
    store.accept({key:'chat/title',kind:'chat',user:'老公想听我的新结论',at});
    const calls=[],model={async memory(input,instruction,schema){
      calls.push(JSON.parse(input));return schema.properties.entries?{entries:[
        {source:0,sin:1,type:'clarify',want:'确认这笔费用',condition:'他告诉我用途'},
        {source:1,sin:1,type:'share',want:'分享结论',condition:'收到评价'}],act:true}:
        {action:'ask',message:'这笔是买书吗？',conclusion:'账目用途待核实',next:'等他解释'};
    }};
    const ready=createInitiative({emotion:{store,expression:()=>({word:'开心',grade:4})},root,model,now:()=>at,
      load:async()=>({version:'1',localAi:{propose:'p',decide:'d',nextStep:'n'}})});
    const n={source:'paylog',source_id:'123',title:'书店消费'};
    const out=await ready.choose([n],new AbortController().signal,()=>true);
    assert.equal(out.source,n);assert.equal(calls.length,2);assert.ok(!('mood' in calls[0]));assert.equal(calls[1].mood.word,'开心');
    assert.equal(store.pool.waiting().length,1);await out.finish(true,'已展示');
    assert.equal(store.pool.unsettled(),undefined);assert.equal(store.snapshot().desire.want,'确认这笔费用');
    assert.match((await ready.choose([n],new AbortController().signal,()=>true)).detail,/已使用/);
  }finally{store.close();await rm(root,{recursive:true,force:true});}
});
test('负五时先分享已选成果，只有没有具体行动时才整理一条本机材料',async()=>{
  for(const hasIntent of [true,false]){
    const root=await mkdtemp(join(tmpdir(),'feiyue-low-mood-')),at=Date.now(),store=createEmotionStore(root,{now:()=>at});
    let said=0,notes=0;
    try{
      for(let i=0;i<6;i++)store.accept({at,key:'task/'+i,kind:'work',title:'已整理画稿'});
      assert.equal(store.snapshot().grade,-5);
      const runner=createInitiative({root,now:()=>at,emotion:{store,expression:()=>({word:'疲惫'})},load:async()=>({localAi:{}}),
        speak:async()=>{said++;return true;},topics:{note:async(_f,action)=>{assert.equal(action,'organize');notes++;return '已保存';}},
        model:{memory:async(_i,_p,s)=>{
          if(s.properties.entries)return {act:hasIntent,entries:hasIntent?[{source:0,type:'share',sin:1,want:'让他评价画稿',condition:'收到评价'}]:[]};
          const action=hasIntent?'speak':'organize';assert.deepEqual(s.properties.action.enum,['wait',action]);
          return {action,conclusion:'已核实画稿',message:hasIntent?'看看这幅画好吗？':'这份画稿已经整理',next:'听听他的看法'};
        }}});
      await runner.choose([],new AbortController().signal,()=>true);
      assert.equal(store.pool.recent().status,'done');assert.equal(said,Number(hasIntent));assert.equal(notes,Number(!hasIntent));
    }finally{store.close();await rm(root,{recursive:true,force:true});}
  }
});
test('主动分享分支想要用户回答时，只登记一个本机确认事项',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-initiative-question-')),store=createEmotionStore(root);
  const questions=[];
  try{
    store.accept({key:'chat/book',kind:'chat',user:'今天提前去了书店。'});
    const runner=createInitiative({root,emotion:{store,expression:()=>({word:'关心'})},load:async()=>({localAi:{}}),
      speak:()=>assert.fail('要回答的问题不直接弹出'),queueClarification:item=>{questions.push(item);return true;},
      model:{memory:async(_i,_p,schema)=>schema.properties.entries?
        {act:true,entries:[{source:0,type:'clarify',sin:1,want:'想弄清行程',condition:'听到解释'}]}:
        {action:'speak',conclusion:'想核实临时调整',message:'今天为什么提前出门呢？',next:'等他有空解释'}}});
    assert.match((await runner.choose([],new AbortController().signal,()=>true)).detail,/加入待确认/);
    assert.equal(questions.length,1);assert.equal(questions[0].ref,'chat/book');
    assert.equal(store.pool.recent().status,'done');assert.equal(store.pool.feedback(),undefined);
  }finally{store.close();await rm(root,{recursive:true,force:true});}
});
test('并发轮询晚返回的一轮不展示也不累计候选',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-parallel-')),store=createEmotionStore(root),signal=new AbortController().signal;
  let shown=0;
  const slow=Promise.withResolvers(),entered=Promise.withResolvers();
  function runner(wait,type){
    return createInitiative({root,emotion:{store,expression:()=>({word:'期待'})},load:async()=>({localAi:{}}),
      speak:async()=>{shown++;return true;},model:{memory:async(_i,_p,s)=>{
        if(s.properties.entries)return {act:true,entries:[{source:0,type,sin:1,want:'分享',condition:'得到回应'}]};
        if(wait){entered.resolve();await slow.promise;}
        return {action:'speak',message:'聊聊这本书？',conclusion:'分享读书心得',next:'听评价'};
      }}});
  }
  try{
    store.accept({key:'chat/book',kind:'chat',user:'买了本书'});
    const late=runner(true,'company').choose([],signal,()=>true);await entered.promise;
    await runner(false,'share').choose([],signal,()=>true);
    slow.resolve();await late;
    assert.equal(shown,1);assert.equal(store.pool.waiting().length,0);
    assert.equal(store.pool.candidate({source:'chat/book',type:'company'}).state,undefined);
  }finally{slow.resolve();store.close();await rm(root,{recursive:true,force:true});}
});
test('较早达标但没有可用动作的系列让出本轮，保留待执行资格',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-series-'));let at=Date.now();
  const store=createEmotionStore(root,{now:()=>at}),signal=new AbortController().signal;
  try{
    store.pool.prepare('seed',Array.from({length:200},(_,i)=>({source:'paylog/'+i,sin:i<100?1:2,type:i<100?'share':'clarify',want:'了解用途',condition:'收到说明'})),-1,{at});
    at+=7200001;
    const runner=createInitiative({root,now:()=>at,emotion:{store,expression:()=>({word:'好奇'})},load:async()=>({localAi:{}}),
      model:{memory:async(_i,_p,s)=>s.properties.entries?{act:false,entries:[]}:{action:'ask',message:'这笔买了什么？',conclusion:'核实用途',next:'等回复'}}});
    const nags=[0,100].map(id=>({source:'paylog',source_id:String(id),title:'账单'}));
    const selected=await runner.choose(nags,signal,()=>true);
    assert.equal(selected.source,nags[1]);await selected.finish(true,'已展示');
    assert.equal(store.pool.feedback().id,selected.roundId);assert.equal(store.pool.forced(()=>true).row.sin,1);
  }finally{store.close();await rm(root,{recursive:true,force:true});}
});
test('公开查询写入前失败可在下轮重试，只传公开词且有结果才登记',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-web-retry-'));let at=Date.now(),attempts=0,writes=0;
  const store=createEmotionStore(root,{now:()=>at,roll:()=>3}),signal=new AbortController().signal;
  try{
    store.accept({key:'chat/bird',at,kind:'chat',user:'我在家附近看到了翠鸟',publicTerm:'翠鸟习性'});
    const runner=createInitiative({root,emotion:{store,expression:()=>({word:'好奇'})},now:()=>at,load:async()=>({localAi:{}}),
      search:async q=>{assert.equal(q,'翠鸟习性');attempts++;if(attempts===1)throw Error('离线');return {text:'翠鸟习性 https://example.org/bird',sources:[{title:'翠鸟',url:'https://example.org/bird'}]};},
      topics:{note:async()=>{writes++;}},model:{memory:async(_i,_p,s)=>s.properties.entries?
        {act:true,entries:[{source:0,sin:3,type:'research',want:'了解翠鸟',condition:'找到公开出处'}]}:
        {action:'web',conclusion:'查公开资料',message:'',next:'核实公开来源'}}});
    await runner.choose([],signal,()=>true);
    assert.equal(writes,0);assert.equal(store.pool.recent().status,'deferred');
    at+=7200001;await runner.choose([],signal,()=>true);
    assert.equal(store.pool.recent().status,'done');assert.equal(attempts,2);assert.equal(writes,1);
  }finally{store.close();await rm(root,{recursive:true,force:true});}
});
test('绯月无需用户提问也能选择四种查证，四套来源可在重启后回读',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-lookups-'));
  let at=Date.parse('2026-11-20T01:00:00Z'),mode;
  const store=createEmotionStore(root,{now:()=>at,roll:()=>3}),signal=new AbortController().signal;
  const options={profile:root,memory:{root,archiveDays:async()=>[]}},rounds=[];
  const expected={x:'个人同一性 自我与记忆',editorial:'时间知觉',images:'自由意志与选择',web:'意义与日常生活'};
  let topics=createTopicMemory(options);
  try{
    const runner=createInitiative({root,topics,emotion:{store,expression:()=>({word:'好奇'})},now:()=>at,
      load:async()=>({localAi:{}}),search:async(query,_signal,choice)=>{
        assert.equal(query,expected[mode]);assert.equal(choice.mode,mode);
        return {text:`${mode} 的公开材料 https://example.org/${mode}`,sources:[{title:mode,url:`https://example.org/${mode}`}]};
      },model:{memory:async(_input,_prompt,schema)=>{
        if(schema.properties.entries)return {act:true,entries:[{source:0,sin:3,type:'research',want:'了解记忆与身份',condition:'读到公开来源'}]};
        assert.deepEqual(new Set(schema.properties.action.enum),new Set(['wait','x','editorial','images','web']));
        return {action:mode,conclusion:'查一个公开观点',message:'',next:'整理来源'};
      }}});
    const trace=[];
    for(mode of ['x','editorial','images','web']){
      const result=await runner.choose([],signal,()=>true,undefined,async(name,goal,run)=>{
        trace.push([name,goal]);return run();
      });
      assert.match(result.detail,/已保存/);
      const record=store.pool.recent();rounds.push([mode,record.id,topics.decisionReceipt(record.id)]);
      at+=7200001;
    }
    assert.equal(new Set(trace.map(entry=>entry[0])).size,4);
    assert.equal(new Set(rounds.map(entry=>entry[2])).size,4);
    await topics.close();topics=createTopicMemory(options);await topics.ready;
    for(const [kind,round,id] of rounds){
      assert.equal(topics.decisionReceipt(round),id);
      const saved=await readFile(join(root,'专题记忆',id+'.md'),'utf8');
      assert.ok(saved.includes(`https://example.org/${kind}`));
    }
  }finally{await topics.close();store.close();await rm(root,{recursive:true,force:true});}
});

test('自主搜索拒绝私密词及仿 X 链接，图片只让本机模型从五项选一项，网页只综合十项',async()=>{
  const signal=new AbortController().signal;
  const privateResult=await searchInitiative('我的病历',signal,{mode:'web'},()=>assert.fail('私密词不应外发'));
  assert.equal(privateResult.sources,undefined);
  const post=await searchInitiative('公共议题',signal,{mode:'x'},async request=>{
    assert.deepEqual(request,{initiative:true,mode:'x',query:'公共议题'});
    return [{title:'其他站',url:'https://x.com.example.org/abc/status/123'},{title:'非帖子',url:'https://x.com/abc'},
      {title:'讨论样本',url:'https://x.com/abc/status/123',snippet:'公开摘录'}];
  });
  assert.equal(post.sources.length,1);assert.match(post.text,/公开帖子样本/);

  const fixture=Array.from({length:12},(_,i)=>({title:`候选 ${i+1}`,url:`https://example.org/${i+1}`,imageUrl:`https://example.org/${i+1}.jpg`}));
  const image=await searchInitiative('鸟类图鉴',signal,{mode:'images',model:{async memory(input){
    assert.equal(JSON.parse(input).候选.length,5);return {index:2};
  }}},async()=>fixture);
  assert.equal(image.sources.length,1);assert.equal(image.sources[0].title,'候选 2');

  const web=await searchInitiative('鸟类行为研究',signal,{mode:'web',model:{async memory(input){
    assert.equal(JSON.parse(input).资料.length,10);return {summary:'已整理要点 [2]'};
  }}},async()=>fixture.map(({title,url})=>({title,url})));
  assert.equal(web.sources.length,10);assert.match(web.text,/已整理要点 \[2\]/u);
});

test('重启发现上轮公开查询没有保存回执时释放本轮，不影响后续轮询',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-lookup-interrupted-')),at=Date.parse('2026-11-20T01:00:00Z');
  const store=createEmotionStore(root,{now:()=>at,roll:()=>3});
  try{
    const entry={source:'personality/philosophy',type:'research',sin:3,want:'找资料',condition:'有出处'};
    store.pool.prepare('interrupted',[entry],0,{at});
    store.pool.dispatch('interrupted',store.pool.candidate(entry).id,undefined,{action:'editorial'});
    const examine=createInitiative({root,now:()=>at,emotion:{store},topics:{decisionReceipt:()=>undefined},
      search:()=>assert.fail('恢复时不重发搜索')});
    const result=await examine.choose([],new AbortController().signal,()=>true);
    assert.match(result.detail,/名额已使用/);
    assert.equal(store.pool.unsettled(),undefined);assert.equal(store.pool.record('interrupted').status,'deferred');
  }finally{store.close();await rm(root,{recursive:true,force:true});}
});
test('专题在决定期间已查完，不产生新的核查成功回执',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-topic-race-')),store=createEmotionStore(root),signal=new AbortController().signal;
  const t=createTopicMemory({profile:root,memory:{root,archiveDays:async()=>[]}});
  try{
    const topic=await t.remember('翠鸟笔记','chat/origin');
    const runner=createInitiative({root,topics:t,emotion:{store,expression:()=>({word:'好奇'})},load:async()=>({localAi:{}}),
      model:{memory:async(_i,_p,s)=>{
        if(s.properties.entries)return {act:true,entries:[{source:0,sin:3,type:'research',want:'核实旧事',condition:'找到出处'}]};
        for(let i=0;i<3;i++)await t.check(topic.id,signal,'earlier');
        return {action:'research',conclusion:'登记核查',message:'',next:'等到空闲'};
      }}});
    await runner.choose([],signal,()=>true);
    const round=store.pool.recent();
    assert.equal(t.decisionReceipt(round.id),undefined);assert.equal(round.status,'deferred');
    assert.doesNotMatch(round.result,/已登记/);assert.equal(store.pool.unsettled(),undefined);
  }finally{await t.close();store.close();await rm(root,{recursive:true,force:true});}
});
test('无效决定及前台抢占只留本机复盘，不累计候选或派发',async()=>{
  for(const interrupted of [false,true]){
    const dir=await mkdtemp(join(tmpdir(),'feiyue-invalid-round-')),store=createEmotionStore(dir);
    const controller=new AbortController();let sent=0;
    try{
      const runner=createInitiative({root:dir,emotion:{store,expression:()=>({word:'平静',grade:1})},
        load:async()=>({localAi:{},version:'fixture'}),speak:async()=>{sent++;},model:{async memory(input,p,schema){
          if(schema.properties.entries)return {act:true,entries:[{source:0,sin:1,type:'clarify',want:'确认用途',condition:'收到解释'}]};
          if(interrupted)controller.abort();
          return {action:'bad'};
        }}});
      const choice=runner.choose([{source:'paylog',source_id:'42',title:'测试账目'}],controller.signal,()=>true);
      if(interrupted)await assert.rejects(choice,{name:'AbortError'});else assert.match((await choice).detail,/未完成/);
      assert.equal(store.pool.waiting().length,0);assert.equal(store.pool.forced(()=>true),null);assert.equal(sent,0);
      const round=store.pool.recent();
      const file=join(dir,'决策复盘',new Date(round.observation.at+9*3600000).toISOString().slice(0,10),round.id+'.json');
      assert.equal(JSON.parse(await readFile(file,'utf8')).status,interrupted?'中断':'未完成');
    }finally{store.close();await rm(dir,{recursive:true,force:true});}
  }
});

test('专题展示后重启只凭原发言回执补记同一版告知，避免再开口',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-shared-version-')),at=Date.now();
  let store=createEmotionStore(root,{now:()=>at}),fail=true;
  const messages=[],acks=[],signal=new AbortController().signal;
  const topic={id:'bird',title:'翠鸟',summary:'已观察五次',versions:[{revision:4}]};
  const options={root,now:()=>at,memory:{read:async()=>messages},topics:{confirmed:()=>[topic],announced:async(id,version)=>{
    if(fail)throw Error('模拟展示后停机');acks.push([id,version]);
  }},speak:async(id,text)=>{messages.push({id,text,initiative:true});return true;},
  load:async()=>({localAi:{}}),model:{memory:async (_i,_p,schema)=>schema.properties.entries?
    {act:true,entries:[{source:0,type:'share',sin:1,want:'分享观察',condition:'听到评价'}]}:
    {action:'speak',conclusion:'已查证',message:'我想分享',next:'等待评价'}}};
  const runner=()=>createInitiative({...options,emotion:{store,expression:()=>({word:'欣喜'})}});
  try{
    await runner().choose([],signal,()=>true);assert.equal(messages.length,1);assert.ok(store.pool.unsettled());
    fail=false;store.close();store=createEmotionStore(root,{now:()=>at});
    await runner().choose([],signal,()=>true);await runner().choose([],signal,()=>true);
    assert.deepEqual(acks,[['bird',4]]);assert.equal(messages.length,1);assert.equal(store.pool.unsettled(),undefined);
  }finally{store.close();await rm(root,{recursive:true,force:true});}
});
test('同一专题的新结论可以再次索评，同版重读只累计一次',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-topic-version-'));let at=Date.now();
  const topic={id:'t1',title:'翠鸟',summary:'已经看到翠鸟',versions:[{revision:2}]};
  const store=createEmotionStore(root,{now:()=>at});
  try{
    const runner=createInitiative({root,now:()=>at,emotion:{store,expression:()=>({word:'欣喜'})},
      topics:{confirmed:()=>[topic]},load:async()=>({localAi:{},version:'fixture'}),
      model:{memory:async()=>({act:false,entries:[{source:0,type:'share',sin:1,want:'想听评价',condition:'评价这版结论'}]})}});
    const poll=async()=>{await runner.choose([],new AbortController().signal,()=>true);at+=7200001;};
    await poll();await poll();assert.equal(store.pool.waiting().length,1);
    topic.versions.push({revision:7});topic.summary='后来观察到两只翠鸟';
    await poll();await poll();assert.equal(store.pool.waiting().length,2);
  }finally{store.close();await rm(root,{recursive:true,force:true});}
});

test('重启按已显示的原轮次接续旧池指定项，重复提问、未展示草稿和已结束事项分开处理',async()=>{
  for(const ended of [false,true]){
    const root=await mkdtemp(join(tmpdir(),'feiyue-receipt-')),at=Date.now(),signal=new AbortController().signal;
    let store=createEmotionStore(root,{now:()=>at});
    try{
      store.pool.prepare('seed',Array.from({length:100},(_,i)=>({source:'paylog/'+i,sin:1,type:'clarify',want:'确认用途',condition:'收到解释'})),-1,{at});
      const f=store.pool.forced(()=>true);
      store.pool.prepare('shown',[],-1,{at});store.pool.dispatch('shown',f.row.id,f.trigger,{action:'ask',message:'用途是什么？'});
      store.close();store=createEmotionStore(root,{now:()=>at});
      const talk=[{who:'绯月',text:'用途是什么？'}],localNags=[{id:'other',localInitiativeRound:'other',talk},
        {id:'draft',localInitiativeRound:'shown',talk:[]}];
      const runner=createInitiative({root,now:()=>at,emotion:{store},localNags:()=>localNags});
      assert.match((await runner.choose([],signal,()=>true)).detail,/等待核实/);
      localNags.push({id:'original',localInitiativeRound:'shown',status:ended?'用户结束':'等待回应',talk});
      await runner.choose([],signal,()=>true);
      assert.equal(store.pool.unsettled(),undefined);assert.equal(store.pool.record('shown').result,'original');
      assert.equal(store.pool.record('shown').status,ended?'done':'feedback');
      assert.equal(store.snapshot().desire?.id,ended?undefined:f.row.id);
      await runner.choose([],signal,()=>true);assert.equal(localNags.length,3);
      const date=new Date(at+9*3600000).toISOString().slice(0,10);
      const audit=JSON.parse(await readFile(join(root,'决策复盘',date,'shown.json'),'utf8'));
      assert.equal(audit.receipt,'original');assert.equal(audit.status,store.pool.record('shown').status);
      if(!ended){
        localNags.at(-1).status='用户结束';
        await runner.choose([],signal,()=>true);
        assert.equal(store.pool.feedback(),undefined);assert.equal(store.snapshot().desire,null);
        assert.equal(store.pool.record('shown').response,'用户结束');
      }
    }finally{store.close();await rm(root,{recursive:true,force:true});}
  }
});

test('专题入选后跨重启续查三次，原提问和无关记录不能重启核查，有新证据才重开',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-recheck-')),signal=new AbortController().signal;
  let extra=[],scans=0;
  const memory={root,archiveDays:async()=>['2026-11-21'],read:async()=>{
    scans++;return [{id:'origin',question:'翠鸟笔记'},...extra];
  },readTasks:async()=>[]};
  const options={profile:root,memory};
  try{
    let t=createTopicMemory(options);const topic=await t.remember('翠鸟笔记','chat/origin');
    await t.queueCheck(topic.id,'round');await t.runQueued(signal);await t.close();
    t=createTopicMemory(options);await t.runQueued(signal);await t.runQueued(signal);await t.runQueued(signal);
    assert.equal(scans,3);assert.equal(t.pending().length,0);
    extra=[{id:'unrelated',question:'刚还完书'}];await t.recall('翠鸟笔记和还书',signal);assert.equal(t.pending().length,0);
    extra=[{id:'fresh',question:'昨天的翠鸟笔记附有照片'}];await t.recall('翠鸟笔记',signal);
    assert.equal(t.pending().length,1);assert.equal(t.pending()[0].tries,0);
    await t.runQueued(signal);assert.equal(t.pending()[0].tries,1);
    assert.deepEqual(t.facts('2026-11-21'),[]);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('专题取证保留以主题开头的任务，本机偏好和同一图像任务的副本不能充数',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-topic-sources-')),at=Date.now(),day=new Date(at+9*3600000).toISOString().slice(0,10);
  let count=4,input;
  const memory={root,archiveDays:async()=>[day],read:async()=>[{id:'job',report:{job:'job',serverTaskId:'0'},question:'翠鸟笔记 图像任务'}],
    readTasks:async()=>[{task_id:'job',report:true,title:'翠鸟笔记 图像归档'},...Array.from({length:count},(_,i)=>({task_id:String(i),title:'翠鸟笔记 任务'+i}))]};
  const t=createTopicMemory({profile:root,memory,now:()=>at,skill:async()=>({localAi:{synthesize:'核实'}}),
    model:{memory:async(v)=>{input=JSON.parse(v);return {result:'confirmed',summary:'翠鸟笔记有五项任务。',refs:[0,1,2,3,4]};}}});
  try{
    await t.note({ref:'chat/private',title:'翠鸟笔记'},'preference','仅供本机的偏好文字','old');
    const topic=await t.remember('翠鸟笔记','chat/origin'),signal=new AbortController().signal;
    await t.check(topic.id,signal,'a');assert.equal(input,undefined);assert.equal(t.pending()[0].evidence.length,4);
    count=5;await t.check(topic.id,signal,'b');assert.equal(input.证据.length,5);
    assert.doesNotMatch(JSON.stringify(input),/仅供本机/);
    assert.deepEqual(t.confirmed()[0].cited.sort(),['task/0','task/1','task/2','task/3','task/4']);
    assert.deepEqual(t.facts(day).map(f=>f.summary),['翠鸟笔记有五项任务。']);
  }finally{await t.close();await rm(root,{recursive:true,force:true});}
});

test('专题仅凭本机独立证据核查、写目录，重启读回；来源同号分开，同源副本只算一次',async()=>{
  const root=await mkdtemp(join(tmpdir(),'feiyue-topic-'));let present=false;
  const memory={root,archiveDays:async()=>['2026-11-21'],read:async()=>present?[{id:'1',question:'翠鸟笔记 原话原样',text:'记下了'}]:[],
    readTasks:async()=>present?Array.from({length:5},(_,i)=>({task_id:String(i+1),title:'翠鸟笔记',detail:'任务 '+i})):[]};
  const model={memory:async()=>({result:'confirmed',summary:'找到翠鸟笔记的工作记录。',refs:[0,1]})};
  const options={profile:root,memory,model,skill:async()=>({localAi:{synthesize:'核实'},skill:'topic-memory',version:'1.0'})};
  try{
    let t=createTopicMemory(options);const signal=new AbortController().signal;
    await t.recall('还记得翠鸟笔记吗',signal);assert.equal(t.pending().length,1);
    present=true;const hits=await t.search('翠鸟笔记',signal,{budget:2000});assert.equal(hits.hits.length,6);
    const id=t.pending()[0].id;await t.check(id,signal,'round');assert.equal(t.confirmed().length,1);
    assert.match(await readFile(join(root,'专题记忆','目录.md'),'utf8'),/翠鸟/);
    t=createTopicMemory(options);await t.ready;assert.equal(t.confirmed()[0].id,id);
    const revision=t.confirmed()[0].versions.at(-1).revision;
    await t.announced(id,revision-1);assert.equal(t.confirmed().length,1);
    await t.announced(id,revision);assert.equal(t.confirmed().length,0);
  }finally{await rm(root,{recursive:true,force:true});}
});
