import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createAiWorkflowModel} from '../../desktop/ai-workflow-model.mjs';
import {aiPoolLimit} from '../../desktop/ai-request-queue.mjs';
import {createInteractionWork} from '../../desktop/interaction-work.mjs';
import {createNewsEditor} from '../../desktop/news-editor.mjs';
import {createPersonalityDiary,rateDiaryMaterial} from '../../desktop/personality-diary.mjs';
import {readDiarySources} from '../../desktop/diary-sources.mjs';
import {createServerTaskCommand} from '../../desktop/server-task-command.mjs';
import {personalityMemory} from '../assistant/personality-memory.mjs';
import {openTestDatabase} from './sqlite-d1.mjs';

const signal=()=>AbortSignal.timeout(5000);
const textSchema={type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false};
const review=(schema,decision='accept',extra={})=>({decision,reason:decision==='accept'?'':'需保留原话',
  ...(schema.required.includes('field')?{field:'',replacement:''}:{}),...extra});
const isReviewer=schema=>schema.required?.includes('decision')&&!schema.required.includes('part');
const day='2026-11-20',at=Date.parse(day+'T12:00:00+09:00');
const migration=readFileSync(new URL('../migrations/016-personality-memory.sql',import.meta.url),'utf8');
function fixture(t){
  const root=resolve(tmpdir()),profile=mkdtempSync(join(root,'feiyue-workflow-'));
  const teardown=[];
  t.after(async()=>{
    for(const close of teardown.reverse())await close();
    if(/^feiyue-workflow-[a-z0-9]+$/iu.test(relative(root,resolve(profile))))
      rmSync(profile,{recursive:true,force:true,maxRetries:3});
  });
  return {profile,file:join(profile,'ai-requests.sqlite'),after:close=>teardown.push(close)};
}
function model(options={}){
  return {memory:async value=>({text:value}),analyze:async()=>({reply:'问答结果'}),close:async()=>{},...options};
}
function dualFixtureModel(options){return createAiWorkflowModel({...options,assistant:options.model});}

test('严格审核下单路可明确接受或退回，审核格式无效不会交付或误判为退回',async()=>{
  for(const [decision,expected] of [['accept','合格正文'],['revise','AI_REVIEW_REJECTED'],[null,'AI_REVIEW_UNAVAILABLE']]){
    const steps=[];
    const ai=createAiWorkflowModel({file:':memory:',model:model({async memory(_text,_instruction,schema){
      if(isReviewer(schema)){steps.push('review');return decision?review(schema,decision):{};}
      steps.push('draft');return {text:'合格正文'};
    }})});
    try{
      const call=ai.memory('用户原话','审核写作结果',textSchema,signal(),{aiReview:true,aiStrictReview:true,aiPrivate:true});
      if(decision==='accept')assert.deepEqual(await call,{text:expected});
      else await assert.rejects(call,{code:expected});
      assert.deepEqual(steps,['draft','review']);
    }finally{await ai.close();}
  }
});

test('公开新闻摘要被退回后只带公开材料重写，交付前继续核实数字',async()=>{
  const summary='该公司表示，目前正在重新核对工厂的生产计划，将根据材料供应和客户需求调整排期。具体恢复时间仍有待确认，公司会在核对后通报进展。';
  const calls=[];
  const editor=createNewsEditor({async memory(_input,_prompt,_schema,_signal,options){
    assert.equal(options.aiStrictReview,true);
    throw Object.assign(Error('审核退回'),{code:'AI_REVIEW_REJECTED'});
  }},undefined,async input=>{
    calls.push(input);
    return {text:calls.length===1?summary:'已恢复了100家工厂。'+summary};
  });
  const details={nodes:[{at,title:'工厂重新核对生产计划',evidence:summary}]};
  assert.equal(await editor(details,signal()),summary);
  assert.equal(await editor(details,signal()),summary);
  assert.equal(calls.length,2);
  assert.equal(calls[0].style,'tool');
  assert.equal(calls[0].sources[0].title,details.nodes[0].title);
});

test('空闲时提交的手动手记可进入已满的后台询问池并优先推理',async t=>{
  const {file,after}=fixture(t);
  const seen=[];
  const controller=new AbortController();
  const entered=Promise.withResolvers(),release=Promise.withResolvers();
  const ai=createAiWorkflowModel({file,model:model({
    async analyze(){entered.resolve();await release.promise;return {reply:'前台完成'};},
    async memory(text){seen.push(text);return {text};}
  })});
  after(()=>ai.close());
  const foreground=ai.analyze('占用模型');
  await entered.promise;
  const queued=Array.from({length:aiPoolLimit},(_,i)=>ai.memory('后台 '+i,'x',textSchema,controller.signal,
    {aiDeferred:true,aiCheckpoint:'background-'+i}));
  const settled=Promise.allSettled(queued);
  try{
    const db=new DatabaseSync(file,{readOnly:true});
    try{
      const count=db.prepare("SELECT count(*) AS n FROM ai_requests WHERE state='ready'");
      for(let i=0;i<100&&count.get().n<aiPoolLimit;i++)await delay(10);
      assert.equal(count.get().n,aiPoolLimit);
      assert.deepEqual(seen,[]);
      const manual=ai.memory('手动手记','x',textSchema,controller.signal,{name:'diary-writing',stage:'narrate',aiManual:true,aiPriority:6});
      void manual.catch(()=>{});
      for(let i=0;i<100&&count.get().n===aiPoolLimit;i++)await delay(10);
      assert.equal(count.get().n,aiPoolLimit+1);
      release.resolve();
      assert.deepEqual(await manual,{text:'手动手记'});
      assert.equal(seen[0],'手动手记');
    }finally{db.close();}
  }finally{release.resolve();controller.abort();await foreground;await settled;}
});

test('120 秒在原材料的分片、重做和重启间累计，装载等待不计时',async t=>{
  const {file,after}=fixture(t);
  let at=0,calls=0;
  const worker=model({reportsInference:true,async memory(text,_prompt,_schema,_signal,_skill,meter){
    at+=300_000;meter.begin();calls++;at+=Number(text);meter.end();return {text};
  }});
  const open=()=>createAiWorkflowModel({file,model:worker,executionPolicy:{now:()=>at,taskMs:120_000}});
  let ai=open();after(()=>ai.close());
  const run=(id,ms)=>ai.memory(String(ms),'x',textSchema,signal(),{aiCheckpoint:'diary:v1:'+id+':reviewSource:digest'});
  await run('material',50000);await ai.close();ai=open();
  await run('material-part-0',40000);
  await assert.rejects(run('material-part-1',30000),{code:'LOCAL_AI_TASK_DISCARDED'});
  await assert.rejects(run('material-part-1',1),{code:'LOCAL_AI_TASK_DISCARDED'});
  await assert.rejects(run('material-part-2',1),{code:'LOCAL_AI_TASK_DISCARDED'});
  await run('other',1000);assert.equal(calls,4);
});

test('只累计主力推理，30 分钟停止接件，继续已接工作，下一轮恢复',async t=>{
  const {file,after}=fixture(t);
  let at=0;
  const phases=[],busy=[],primary=model({reportsInference:true,async memory(text,_prompt,schema,_signal,skill,meter){
    at+=5_000_000;meter.begin();at+=30;meter.end();phases.push(skill.aiKind);
    return isReviewer(schema)?review(schema):{text};
  }});
  const ai=createAiWorkflowModel({file,model:primary,assistant:model({memory:async(_text,_prompt,schema)=>{
    at+=1000;return isReviewer(schema)?review(schema):{text:'是'};
  }}),onBusy:state=>busy.push(state),executionPolicy:{now:()=>at,softMs:30,hardMs:100}});
  after(()=>ai.close());
  const lease=ai.beginAiRound(),run=(text,options)=>ai.memory(text,'x',textSchema,signal(),options);
  await run('判定',{aiKind:'judgment'});
  busy.length=0;
  assert.deepEqual(await run('任务',{aiReview:true}),{text:'任务'});
  assert.deepEqual(busy,[true,false]);
  await assert.rejects(run('下一项'),{code:'LOCAL_AI_ROUND_PAUSED'});
  assert.deepEqual(phases,['draft','finalize']);
  lease.release();
  assert.deepEqual(await run('下一项'),{text:'下一项'});
});

test('整轮硬截止同时打断双路，原检查点可在下一轮恢复',async t=>{
  const {file,after}=fixture(t),started=new Set();
  let hold=true;
  const worker=model({async memory(text,_prompt,_schema,signal,skill){
    started.add(skill.aiTier);
    if(hold)await delay(5000,undefined,{signal});
    return {text};
  }});
  const ai=createAiWorkflowModel({file,model:worker,assistant:worker,executionPolicy:{softMs:35,hardMs:80}});
  after(()=>ai.close());
  const run=(id,kind)=>ai.memory(id,'x',textSchema,signal(),{aiKind:kind,aiCheckpoint:id});
  const lease=ai.beginAiRound();
  const results=await Promise.allSettled([run('主','task'),run('辅','judgment')]);
  assert.deepEqual(started,new Set(['2','4']));
  assert(results.every(r=>r.reason?.code==='LOCAL_AI_ROUND_PAUSED'));
  assert(lease.signal.aborted);lease.release();hold=false;
  assert.deepEqual(await run('主','task'),{text:'主'});
  assert.deepEqual(await run('辅','judgment'),{text:'辅'});
});

test('单项硬截止取消推理，超时回包不进入审核，同批下一项继续',async t=>{
  const {file,after}=fixture(t),seen=[];
  const ai=createAiWorkflowModel({file,model:model({async memory(text,_p,_s,signal){
    seen.push(text);
    if(text==='慢'){await new Promise(ok=>signal.addEventListener('abort',ok,{once:true}));}
    return {text};
  }}),executionPolicy:{taskMs:30}});
  after(()=>ai.close());
  const run=(text,aiReview)=>ai.memory(text,'x',textSchema,signal(),{aiReview,aiCheckpoint:text});
  const [slow,fast]=await Promise.allSettled([run('慢',true),run('快',false)]);
  assert.equal(slow.reason.code,'LOCAL_AI_TASK_DISCARDED');assert.deepEqual(fast.value,{text:'快'});
  assert.deepEqual(seen,['慢','快']);
});

test('主力耗尽整轮预算时保留另一条已完成的草稿，次轮从简审继续',async t=>{
  const {file,after}=fixture(t),entered=Promise.withResolvers(),phases=[];
  let clock=0,hold=true;
  const ai=createAiWorkflowModel({file,executionPolicy:{now:()=>clock,softMs:5000,hardMs:6000},
    model:model({async memory(text,_prompt,schema,_signal,skill){
      phases.push(skill.aiKind);
      clock+=text==='耗尽'?6000:1;
      return isReviewer(schema)?review(schema):{text};
    }}),
    assistant:model({async memory(_text,_prompt,schema,signal){
      entered.resolve();
      if(hold)await delay(10000,undefined,{signal});
      return review(schema);
    }})});
  after(()=>ai.close());
  const run=()=>ai.memory('原稿','核对',textSchema,signal(),{aiCheckpoint:'待简审',aiReview:true});
  const round=ai.beginAiRound(),original=run();await entered.promise;
  const other=ai.memory('耗尽','核对',textSchema,signal(),{aiCheckpoint:'长任务'});
  const results=await Promise.allSettled([original,other]);
  assert(results.every(r=>r.reason?.code==='LOCAL_AI_ROUND_PAUSED'));
  round.release();hold=false;
  assert.deepEqual(await run(),{text:'原稿'});assert.deepEqual(phases,['draft','task','finalize']);
});
async function eventually(check){
  const deadline=Date.now()+2000;
  while(!check()){
    if(Date.now()>deadline)throw Error('等待本地状态超时');
    await delay(5);
  }
}

test('旧单步时限不截断推理，前台让行仍保存取消回执',async t=>{
  const {file,after}=fixture(t),logs=[],started=Promise.withResolvers(),order=[];
  const ai=createAiWorkflowModel({file,log:event=>logs.push(event),safeStorage:{
    encryptString:value=>Buffer.from(value),decryptString:value=>Buffer.from(value).toString(),
  },model:model({async memory(text,_instruction,_schema,wait){
    order.push(text);
    if(text==='让行')started.resolve();
    try{await delay(40,undefined,{signal:wait});}catch{wait.throwIfAborted();}
    return {text};
  },async analyze(){order.push('前台');return {reply:'收到'};}})});
  after(()=>ai.close());
  const run=(text,wait,options)=>ai.memory(text,'整理',textSchema,wait,options);
  assert.deepEqual(await run('时限',signal(),{aiBudget:15}),{text:'时限'});
  const controller=new AbortController();
  const processing=run('让行',controller.signal);
  const rejected=assert.rejects(processing,{name:'AbortError'});
  await started.promise;
  const foreground=ai.analyze('前台',{signal:signal()});
  controller.abort();
  await rejected;
  assert.deepEqual(await foreground,{reply:'收到'});
  assert.deepEqual(order,['时限','让行','前台']);
  await eventually(()=>Boolean(ai.readAiStep(logs.at(-1).ai_step_id)?.finished));
  assert.equal(logs[0].error,undefined);
  assert.equal(logs[1].error,'AbortError');
  assert.equal(logs[1].stage,'取消');
  assert.equal(ai.readAiStep(logs[1].ai_step_id).status,'cancelled');
});

test('关闭询问池后迟到的模型回包不成为重启后的有效结果',async t=>{
  const {file,after}=fixture(t),entered=Promise.withResolvers(),late=Promise.withResolvers();
  const first=createAiWorkflowModel({file,model:model({async memory(){
    entered.resolve();return late.promise;
  }})});
  after(async()=>{late.resolve({text:'迟到'});await first.close();});
  const run=ai=>ai.memory('原任务','整理',textSchema,signal(),{aiCheckpoint:'cancelled-step'});
  const rejected=assert.rejects(run(first),{code:'LOCAL_AI_STOPPED'});
  await entered.promise;
  const closing=first.close();
  late.resolve({text:'迟到'});
  await rejected;
  await closing;
  const reopened=createAiWorkflowModel({file,model:model({async memory(){return {text:'续办结果'};}})});
  after(()=>reopened.close());
  assert.deepEqual(await run(reopened),{text:'续办结果'});
});

test('知识核对共享模型时隙且正文不进入请求库或诊断快照',async t=>{
  const {file,after}=fixture(t),logs=[];
  const ai=createAiWorkflowModel({file,log:event=>logs.push(event),safeStorage:{
    encryptString:value=>Buffer.from(value),decryptString:value=>Buffer.from(value).toString(),
  },model:model({async memory(text,_instruction,_schema,_wait,skill){
    assert.equal(skill.aiTier,'4');
    return {text};
  }})});
  after(()=>ai.close());
  const secret='仅供知识推理的测试短语';
  assert.deepEqual(await ai.memory(secret,'整理',textSchema,signal(),{aiPrivate:true,aiTier:'4',aiBudget:500}),
    {text:secret});
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    assert.equal(db.prepare('SELECT count(*) AS n FROM ai_requests').get().n,0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM ai_attempt_snapshots').get().n,0);
  }finally{db.close();}
  assert.equal(logs.length,0);
});

test('少量积压立即唤醒，连续提交跨越池容量也全部完成',async t=>{
  const {file,after}=fixture(t),called=[];
  const ai=createAiWorkflowModel({file,model:model({async memory(text){called.push(text);return {text};}})});
  after(()=>ai.close());
  const send=text=>ai.memory(text,'整理',textSchema,signal(),{aiDeferred:true});
  assert.deepEqual(await send('单条'),{text:'单条'});
  await Promise.all(Array.from({length:45},()=>send('同一份材料')));
  assert.equal(called.length,46);
  await eventually(()=>!ai.aiSnapshot().awake);
});

test('判断标记直接交付；2B 排队有序，仅装载受限才切换 4B',async t=>{
  const {file,after}=fixture(t),calls=[],events=[];
  let fits=true,fails=false;
  const cpu=model({canLoadTask:()=>fits,async memory(text,_prompt,schema,_signal,skill){
    calls.push(skill.aiTier);
    if(fails)throw Object.assign(Error('内存不足'),{code:'LOCAL_AI_TIER_WAIT'});
    return schema.properties.approved?{approved:true}:{text};
  }});
  const ai=createAiWorkflowModel({file,assistant:cpu,log:event=>events.push(event),model:model({async memory(text,_prompt,_schema,_signal,skill){
    calls.push(skill.aiTier);return {text};
  }})});
  after(()=>ai.close());
  const judge=()=>ai.memory('是','判断是否已解释',textSchema,signal(),{name:'personal-conversation',stage:'explained',aiReview:true});
  assert.deepEqual(await judge(),{text:'是'});
  fits=false;assert.deepEqual(await judge(),{text:'是'});
  fits=true;fails=true;assert.deepEqual(await judge(),{text:'是'});
  fails=false;
  assert.deepEqual(await ai.memory('已核对','判断',{type:'object',properties:{approved:{type:'boolean'}},required:['approved']},
    signal(),{aiReview:true}),{approved:true});
  assert.deepEqual(calls,['2','4','2','4','2']);
  assert.ok(events.every(e=>e.ai_kind==='judgment'));
});

test('已装载的 2B 正在工作时判断留在 CPU 队列，空闲 4B 不重复作答',async t=>{
  const {file,after}=fixture(t),entered=Promise.withResolvers(),release=Promise.withResolvers(),order=[];
  const ai=createAiWorkflowModel({file,model:model({memory:()=>assert.fail('判断占用 4B')}),
    assistant:model({async memory(text){order.push(text);if(text==='已领取'){entered.resolve();await release.promise;}return {text};}})});
  after(async()=>{release.resolve();await ai.close();});
  const first=ai.memory('已领取','辅助',textSchema,signal(),{aiRole:'assist'});
  await entered.promise;
  const decision=ai.groupedWork('结论',{instruction:'给结论',schema:textSchema,skill:{aiKind:'judgment'},signal:signal()});
  await eventually(()=>ai.aiSnapshot().queued===2);
  assert.deepEqual(order,['已领取']);
  release.resolve();await first;assert.deepEqual(await decision,{text:'结论'});
});

test('40 个后台池位、SQLite 写锁和积压都允许 6 级问答取得下一个模型槽',async t=>{
  const {file,after}=fixture(t),entered=Promise.withResolvers(),release=Promise.withResolvers(),order=[];
  const ai=createAiWorkflowModel({file,model:model({
    async memory(text){
      order.push(text);
      if(text==='已开始'){entered.resolve();await release.promise;}
      return {text};
    },
    async analyze(){order.push('前台');return {reply:'问答结果'};}
  })});
  const locked=new DatabaseSync(file);
  after(async()=>{
    release.resolve();
    if(locked.isTransaction)locked.exec('ROLLBACK');
    locked.close();
    await ai.close();
  });
  const submit=(value,aiPriority)=>ai.memory(value,'整理',textSchema,signal(),{aiPriority});
  const first=submit('已开始',1);
  await entered.promise;
  const low=Array.from({length:42},(_,i)=>submit('本地 '+i,1));
  await eventually(()=>ai.aiSnapshot().queued===40);
  const high=submit('REST 合成请求',5);
  locked.exec('BEGIN IMMEDIATE');
  const front=ai.analyze('测试当前问答',{hint:'direct',signal:signal()});
  release.resolve();
  assert.deepEqual(await front,{reply:'问答结果'});
  assert.deepEqual(order,['已开始','前台']);
  locked.exec('ROLLBACK');
  await Promise.all([first,high,...low]);
  assert.deepEqual(order.slice(0,3),['已开始','前台','REST 合成请求']);
  assert.deepEqual(order.slice(3),Array.from({length:42},(_,i)=>'本地 '+i));
  assert.equal(ai.aiSnapshot().queued,0);
});

test('4B 首稿、2B 核对、4B 定稿，小修改及整篇修正均走三步',async t=>{
  const {file,after}=fixture(t),tiers=[];
  const ai=dualFixtureModel({file,model:model({async memory(input,_instruction,schema,_signal,skill){
    tiers.push(skill.aiTier);
    if(skill.aiKind==='draft')return {text:'初稿'};
    if(skill.aiKind==='rewrite')return {text:input.includes('好修')?'修正后':'经核对'};
    return review(schema,'revise',{reason:'text 措辞需要核对'});
  }})});
  after(()=>ai.close());
  const ask=text=>ai.memory(text,'整理',textSchema,signal(),{aiReview:true});
  assert.deepEqual(await ask('好修'),{text:'修正后'});
  assert.deepEqual(tiers,['4','2','4']);
  tiers.length=0;
  assert.deepEqual(await ask('需要查明'),{text:'经核对'});
  assert.deepEqual(tiers,['4','2','4']);
});

test('精确任务首稿缺失指定事实，2B 只指出缺项，4B 修正',async t=>{
  const {file,after}=fixture(t),tiers=[];
  const ai=dualFixtureModel({file,model:model({async memory(_text,_instruction,schema,_signal,skill){
    tiers.push(skill.aiTier);
    if(skill.aiKind==='draft'){assert.equal(skill.aiTier,'4');return {text:'回程还没买。'};}
    if(skill.aiTier==='2')return review(schema,'revise',{reason:'缺周六去程'});
    return {text:'星期六已买去程，回程还没买。'};
  }})});
  after(()=>ai.close());
  const result=await ai.memory('周六已买去程，回程还没买。','去重',textSchema,signal(),
    {aiReview:true,aiKeep:{text:['周六']}});
  assert.deepEqual(tiers,['4','2','4']);
  assert.match(result.text,/星期六已买去程/);
});

test('日记的独立资料请求同时开始，合并结果保持资料顺序',async()=>{
  const calls=[],release=Promise.withResolvers();
  const gathered=readDiarySources(async path=>{
    calls.push(path);
    await release.promise;
    if(path.includes('kind=journal'))return {records:[{id:'journal',at:new Date(at).toISOString(),title:'手记'}]};
    if(path.includes('kind=deploy'))return {records:[{id:'deploy',at:new Date(at).toISOString(),project:'项目'}]};
    return {records:[{id:'p',spendDate:day,amount:100}],complete:true};
  },day,signal());
  try{await eventually(()=>calls.length===3);}
  finally{release.resolve();}
  assert.deepEqual((await gathered).items.map(row=>row.label),['你的日记','花园部署','当日消费']);
});

test('4B 定稿资源延后后重启接着当前阶段，业务落盘后才清理结果',async t=>{
  const {file,after}=fixture(t),calls=[];
  const request=(ai)=>ai.memory('原话','修订',textSchema,signal(),{aiCheckpoint:'business-record/draft',aiReview:true});
  const first=dualFixtureModel({file,model:model({async memory(_text,_instruction,schema,_signal,skill){
    calls.push(skill.aiTier);
    if(skill.aiKind==='rewrite')throw Object.assign(Error('显存忙'),{code:'LOCAL_AI_TIER_WAIT'});
    return isReviewer(schema)?review(schema,'revise'):{text:'初稿'};
  }})});
  try{await assert.rejects(request(first),{code:'LOCAL_AI_TIER_WAIT'});}
  finally{await first.close();}
  assert.deepEqual(calls,['4','2','4']);
  calls.length=0;
  const second=dualFixtureModel({file,model:model({async memory(_text,_instruction,schema,_signal,skill){
    calls.push(skill.aiTier);return {text:'核对后'};
  }})});
  after(()=>second.close());
  assert.deepEqual(await request(second),{text:'核对后'});
  assert.deepEqual(await request(second),{text:'核对后'});
  assert.deepEqual(calls,['4']);
  second.aiAck('business-record/draft');
  const db=new DatabaseSync(file,{readOnly:true});
  try{await eventually(()=>db.prepare('SELECT count(*) AS n FROM ai_requests').get().n===0);}
  finally{db.close();}
});

test('CPU 复核与下一份 GPU 首稿重叠，两路同时完成并遇到写锁仍各自续办',async t=>{
  const {file,after}=fixture(t);
  const cpuEntered=Promise.withResolvers(),gpuEntered=Promise.withResolvers(),release=Promise.withResolvers();
  const order=[],lock=new DatabaseSync(':memory:');
  lock.prepare('ATTACH DATABASE ? AS queue').run(file);
  const ai=createAiWorkflowModel({file,model:model({async memory(text,_prompt,_schema,_signal,skill){
    assert.equal(skill.aiTier,'4');
    if(isReviewer(_schema)){order.push('定稿'+JSON.parse(text).草稿.text);return review(_schema);}
    order.push('生成'+text);
    if(text==='乙'){gpuEntered.resolve();await release.promise;}
    return {text};
  }}),assistant:model({async memory(text,_prompt,schema,_signal,skill){
    assert.equal(skill.aiTier,'2');
    const draft=JSON.parse(text).草稿.text;
    order.push('审核'+draft);
    if(draft==='甲'){cpuEntered.resolve();await release.promise;}
    return review(schema);
  }})});
  after(async()=>{release.resolve();if(lock.isTransaction)lock.exec('ROLLBACK');lock.close();await ai.close();});
  const ask=text=>ai.memory(text,'保留原文',textSchema,signal(),{aiReview:true,aiCheckpoint:text});
  const first=ask('甲');
  await cpuEntered.promise;
  const next=ask('乙');
  await gpuEntered.promise;
  assert.deepEqual(new Set(ai.aiSnapshot().lanes),new Set(['main','assist']));
  lock.exec('BEGIN IMMEDIATE');
  release.resolve();
  await eventually(()=>!ai.aiSnapshot().running);
  lock.exec('ROLLBACK');
  assert.deepEqual(await Promise.all([first,next]),[{text:'甲'},{text:'乙'}]);
  assert.deepEqual(await ask('甲'),{text:'甲'});
  assert.deepEqual(order.slice(0,3),['生成甲','审核甲','生成乙']);
  assert.deepEqual(order.slice(3).toSorted(),['定稿甲','审核乙','定稿乙'].toSorted());
  assert.ok(order.indexOf('审核乙')<order.indexOf('定稿乙'));
});

test('短补评 CPU 暂不可用后可续办，每条只推理一次并保留原文',async t=>{
  const {profile,file,after}=fixture(t);
  let unavailable=true,attempts=0;
  const tasks=Array.from({length:10},(_,i)=>({at,task_id:'fixture-'+i,title:'检查资料 '+i,action:'已完成',detail:'原件已收到 '+i}));
  const ai=createAiWorkflowModel({file,model:model({async memory(){throw Error('补评应由 CPU 执行');}}),assistant:model({async memory(_text,_prompt,schema){
    attempts++;
    if(unavailable)throw Object.assign(Error('等待模型'),{code:'LOCAL_AI_TIER_WAIT'});
    assert.deepEqual(schema.required,['review']);
    return {review:'我确认收到原件。'};
  }})});
  const diary=createPersonalityDiary({profile,model:ai,now:()=>at,weather:()=>[],
    memory:{archiveDays:()=>[day],read:d=>[],readTasks:d=>d===day?tasks:[]},request:()=>{throw Error('隔离测试不联网');}});
  after(async()=>{diary.close();await ai.close();});
  assert.match(await diary.run('task-review',signal()),/另有 10 条保留待核查/);
  assert.equal(attempts,1);
  unavailable=false;
  assert.match(await diary.run('task-review',signal()),/补写 10 条执行评价/);
  assert.equal(attempts,11);
  const db=new DatabaseSync(join(profile,'personality-memory.sqlite'),{readOnly:true});
  try{assert(db.prepare('SELECT content FROM cleaned').all().some(row=>row.content==='检查资料 0 · 已完成 · 原件已收到 0'));}
  finally{db.close();}
});

test('补评超过旧的 120s 单项阈值但未超现行 5 分钟上限仍保存，超 5 分钟上限按现行规则丢弃，手动再扫不重复推理',async t=>{
  const {profile,file,after}=fixture(t),medium='四分钟材料',overLimit='超五分钟材料';
  let clock=0,mediumCalls=0,overLimitCalls=0;
  const tasks=[medium,overLimit,'正常材料'].map((title,i)=>({at,task_id:'budget-'+i,title,action:'已完成',detail:'检查原件'}));
  const ai=createAiWorkflowModel({file,executionPolicy:{now:()=>clock},model:model({async memory(text){
    if(text.includes(medium)){clock+=4*60_000;mediumCalls++;}
    else if(text.includes(overLimit)){clock+=6*60_000;overLimitCalls++;}
    return {review:'我记下了。'};
  }})});
  const diary=createPersonalityDiary({profile,model:ai,now:()=>at,weather:()=>[],
    memory:{archiveDays:()=>[day],read:()=>[],readTasks:()=>tasks}});
  after(async()=>{diary.close();await ai.close();});
  const first=await diary.run('task-review',signal());
  assert.match(first,/补写 2 条执行评价/);assert.match(first,/执行超时丢弃 1 条/);
  assert.match(await diary.run('task-review',signal()),/补写 0 条执行评价/);
  assert.equal(mediumCalls,1);assert.equal(overLimitCalls,1);
});

test('业务入口成批补评价时为审核保留 CPU，剩余零星短评允许代写',async t=>{
  const {profile,after}=fixture(t),allowed=[];
  const tasks=Array.from({length:5},(_,i)=>({at,task_id:'batch-'+i,title:'收件 '+i,action:'已完成',detail:'收到原文'}));
  const diary=createPersonalityDiary({profile,now:()=>at,model:{aiAck(){},async memory(text,_instruction,_schema,_signal,skill){
    allowed.push(skill.aiAllowAssistantDraft);return {text,review:'我记下了。'};
  }},memory:{archiveDays:()=>[day],read:()=>[],readTasks:()=>tasks}});
  after(()=>diary.close());
  assert.match(await diary.run('task-review',signal()),/补写 5 条执行评价/);
  assert.deepEqual(allowed,[false,false,false,false,true]);
});

test('单步补评格式失败后留痕，后续材料继续保存',async t=>{
  const {profile,file,after}=fixture(t);
  const tasks=Array.from({length:5},(_,i)=>({at,task_id:'fixture-'+i,title:i?'检查资料 '+i:'专门拒绝的资料',action:'已完成',detail:'原件已收到 '+i}));
  let invalid=0,reject=true;
  const ai=createAiWorkflowModel({file,model:model({async memory(text){
    if(reject&&text.includes('专门拒绝的资料')){invalid++;return {};}
    return {review:'我确认收到原件。'};
  }})});
  const diary=createPersonalityDiary({profile,model:ai,now:()=>at,weather:()=>[],
    memory:{archiveDays:()=>[day],read:()=>[],readTasks:d=>d===day?tasks:[]},request:()=>{throw Error('隔离测试不联网');}});
  after(async()=>{diary.close();await ai.close();});
  assert.match(await diary.run('task-review',signal()),/补写 4 条执行评价.*另有 1 条保留待核查/);
  const db=new DatabaseSync(join(profile,'personality-memory.sqlite'));
  try{
    assert.deepEqual(db.prepare('SELECT code,attempts FROM material_review_failures').all().map(row=>({...row})),
      [{code:'LOCAL_AI_RESULT_INVALID',attempts:1}]);
    assert.equal(invalid,1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM materials').get().n,4);
    db.prepare('UPDATE material_review_failures SET attempts=3,at=?').run(at-61_000);
    reject=false;
    assert.match(await diary.run('review',signal()),/本轮补写 1 条行动评价/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM material_review_failures').get().n,0);
  }finally{db.close();}
});

test('评价超时先续做，输出超限递归拆分，重开只补未完成的片段',async()=>{
  const content='甲乙😀丙'.repeat(100),saved=new Map(),seen=[],recovery=[];
  let paused=true;
  const timeout=()=>new DOMException('用时过长','TimeoutError');
  const rate=async(input,key)=>{
    if(saved.has(key))return saved.get(key);
    seen.push(key);
    if(key==='e')throw timeout();
    if([...input].length>120)throw Error('LOCAL_AI_OUTPUT_BUDGET');
    if(paused&&key==='e-part-0-part-1-part-0')throw Object.assign(Error(),{code:'LOCAL_AI_GPU_DEFERRED'});
    const value={text:input,review:'已核对'};saved.set(key,value);return value;
  };
  const run=()=>rateDiaryMaterial({id:'e',content,rate,signal:signal(),
    resumeParts:key=>[...saved.keys()].some(k=>k.startsWith(key+'-part-')),
    onRecovery:(action,key)=>recovery.push([action,key])});
  await assert.rejects(run(),{code:'LOCAL_AI_GPU_DEFERRED'});
  assert.deepEqual(recovery.slice(0,2),[['retry','e'],['split','e']]);
  const completed=[...saved.keys()];assert.ok(completed.length);
  seen.length=0;paused=false;
  assert.equal((await run()).text.replaceAll('\n',''),content);
  assert.ok(!seen.includes('e')&&completed.every(key=>!seen.includes(key)));
});

test('手记成文用固定复审纠正来源归属，带反馈改写后才交付',async t=>{
  const {file,after}=fixture(t),seen=[];
  const ai=dualFixtureModel({file,model:model({async memory(text,prompt,schema,_signal,skill){
    seen.push([skill.aiTier,skill.stage,skill.aiKind!=='draft']);
    if(skill.aiKind!=='draft'){
      assert.match(prompt,/按来源纠正行动者/);
      if(seen.length===2)return review(schema,'revise',{reason:'发布者是用户，绯月只读了登记'});
      assert.match(JSON.parse(text).上轮反馈,/发布者是用户/);
      return {text:'我看到你发布了绘图工具。',comment:'我也替你高兴。',thread:''};
    }
    return {text:'我发布了绘图工具。',comment:'我很满意。',thread:''};
  }})});
  after(()=>ai.close());
  const schema={type:'object',properties:Object.fromEntries(['text','comment','thread'].map(key=>[key,{type:'string'}])),
    required:['text','comment','thread'],additionalProperties:false};
  const result=await ai.memory('发布登记由用户完成','写这条手记',schema,signal(),
    {name:'diary-writing',stage:'narrate',aiReview:true,aiReviewGuidance:'按来源纠正行动者'});
  assert.equal(result.text,'我看到你发布了绘图工具。');
  assert.deepEqual(seen.map(([tier,,checking])=>[tier,checking]),[['4',false],['2',true],['4',true]]);
});

test('单模型注入时本地整理、服务器文本、评价、日记和唠叨仍串行',async t=>{
  const {profile,file,after}=fixture(t),seen=[],active={count:0};
  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(migration);
  function api(owner,path,options={}){
    const key=path.slice('/api/memory/'.length);
    if(key.startsWith('sources?'))return Response.json({records:[]});
    if(key.startsWith('expenses?'))return Response.json({records:[],complete:true});
    return personalityMemory(new Request('https://fixture.test'+path,options),{DB},owner);
  }
  const ai=createAiWorkflowModel({file,model:model({
    async memory(text,_prompt,schema,_signal,skill){
      assert.equal(++active.count,1);
      try{
        await delay(3);
        if(isReviewer(schema)){seen.push(skill.name+'校对');return review(schema);}
        seen.push(skill.name+':'+(skill.stage??''));
        if(skill.name==='server-pc-task')return {type:'pc.echo',params:{value:'已核对的示例文本'}};
        if(skill.stage==='shortDiary')return {review:'我想以后再看看进展。'};
        if(skill.name==='news-summary')return {summary:'本地资料显示，事项仍在按计划推进。相关团队已整理出下一步的清单和交接材料，当前公开内容只说明准备进度和已有事实。'};
        if(skill.name==='memory-refinement'){
          if(skill.stage==='plan')return {organize:'删去重复评价',additions:'',format:''};
          if(skill.stage==='review')return {decision:'accept',reason:'保留了核对事实',part:''};
          const part=JSON.parse(text).part;
          return {text:part.text.replace('重复。重复。','确认已核对。'),note:'我合并了重复评价'};
        }
        const values={text:schema.required.includes('review')?text:'我记下了这件事。',review:'我读后核实了原意。',
          mood:'平静',summary:'今日手记',tags:'',comment:'我想以后再看看进展。',thread:''};
        return Object.fromEntries(schema.required.map(key=>[key,values[key]??'']));
      }finally{active.count--;}
    }
  })});
  const stores=[];
  function store(owner,turns=[],tasks=[]){
    const local=join(profile,owner);
    mkdirSync(local);
    const diary=createPersonalityDiary({profile:local,model:ai,now:()=>at,weather:()=>[],
      memory:{archiveDays:()=>[day],read:d=>d===day?turns:[],readTasks:d=>d===day?tasks:[]},
      request:(path,options)=>api(owner,path,options)});
    stores.push(diary);
    return diary;
  }
  after(async()=>{await ai.close();for(const diary of stores)diary.close();close();});
  const today=store('diary',[{id:'talk',at,question:'今天把资料送到了。',text:'我记下了。'}]);
  const stats=store('evaluation',[],[{at,task_id:'example',title:'检查资料',action:'已完成',detail:'已收到原件。'}]);
  const nags=store('nag');
  await api('nag','/api/memory/nags',{method:'POST',body:JSON.stringify({
    id:'closed',revision:1,source:'diary',source_id:day+'.1/1',created_at:new Date(at).toISOString(),
    title:'核对记录',reason:'核对',status:'回合结束',mood:'平静',talk:[{who:'你',text:'已完成。',at:new Date(at).toISOString()}],
    afterEvaluation:'我已核对。重复。重复。'})});
  await nags.refine(signal()); // 首轮轮询没有日记，下一轮检查已结束唠叨。
  const news=createNewsEditor(ai);
  let prompts=0;
  const command=createServerTaskCommand({profile,localModel:ai,tasks:{identity:{device_id:'local-fixture'},
    supportsTask:()=>true,async weatherRequest(path,{method}){
      assert.equal(path,'/api/tasklist');assert.equal(method,'GET');
      return Response.json({tasklist:[{executor:'pc',type:'pc.echo',name:'回显',parameter_spec:{value:{type:'string',required:true}}}]});
    }},dialog:{async showMessageBox(options){
      assert.match(options.detail,/已核对的示例文本/);prompts++;return {response:0};
    }}});
  const [summary,server,evaluation,diary,nag]=await Promise.all([
    news({nodes:[{at,title:'资料整理',evidence:'事项按计划准备，团队已整理下一步的清单和交接材料。'}]},signal()),
    command('服务器任务：回显需要整理的示例内容',signal()),
    stats.run('task-review',signal()),today.run('diary',signal()),nags.refine(signal())
  ]);
  assert.match(summary,/事项仍在按计划推进/);
  assert.match(server,/取消/);assert.equal(prompts,1);
  assert.match(evaluation,/补写 1 条执行评价/);
  assert.match(diary,/已同步/);
  assert.match(nag,/已修订唠叨/);
  assert(seen.some(x=>x.endsWith(':shortDiary')));
  assert(seen.some(x=>x.startsWith('memory-refinement:review')));
});
