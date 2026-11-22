import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createAiWorkflowModel} from '../../desktop/ai-workflow-model.mjs';
import {createNewsEditor} from '../../desktop/news-editor.mjs';
import {createPersonalityDiary} from '../../desktop/personality-diary.mjs';
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
async function eventually(check){
  const deadline=Date.now()+2000;
  while(!check()){
    if(Date.now()>deadline)throw Error('等待本地状态超时');
    await delay(5);
  }
}

test('模型时限和前台让行保存可区分的回执，取消后前台先拿到时隙',async t=>{
  const {file,after}=fixture(t),logs=[],started=Promise.withResolvers(),order=[];
  const ai=createAiWorkflowModel({file,log:event=>logs.push(event),safeStorage:{
    encryptString:value=>Buffer.from(value),decryptString:value=>Buffer.from(value).toString(),
  },model:model({async memory(text,_instruction,_schema,wait){
    order.push(text);
    if(text==='让行')started.resolve();
    try{await delay(500,undefined,{signal:wait});}catch{wait.throwIfAborted();}
    return {text};
  },async analyze(){order.push('前台');return {reply:'收到'};}})});
  after(()=>ai.close());
  const run=(text,wait,options)=>ai.memory(text,'整理',textSchema,wait,options);
  await assert.rejects(run('时限',signal(),{aiBudget:15}),{code:'TimeoutError'});
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
  assert.equal(logs[0].error,'TimeoutError');
  assert.equal(logs[1].error,'AbortError');
  assert.equal(logs[1].stage,'取消');
  assert.equal(ai.readAiStep(logs[1].ai_step_id).status,'cancelled');
});

test('19 条延后等待，20 条唤醒，独立请求不按正文归并',async t=>{
  const {file,after}=fixture(t),called=[];
  const ai=createAiWorkflowModel({file,model:model({async memory(text){
    called.push(text);
    return {text};
  }})});
  after(()=>ai.close());
  const send=()=>ai.memory('同一份材料','整理',textSchema,signal(),{aiDeferred:true});
  const batch=Array.from({length:19},send);
  await eventually(()=>ai.aiSnapshot().queued===19);
  assert.equal(called.length,0);
  batch.push(send());
  assert.equal((await Promise.all(batch)).length,20);
  assert.equal(called.length,20);
  const sparse=send();
  await eventually(()=>ai.aiSnapshot().queued===1);
  ai.aiPulse();
  assert.deepEqual(await sparse,{text:'同一份材料'});
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

test('2B 审核可现场改字，难例走完整五步，4B 只判定',async t=>{
  const {file,after}=fixture(t),tiers=[];
  const ai=createAiWorkflowModel({file,model:model({async memory(input,_instruction,schema,_signal,skill){
    tiers.push(skill.aiTier);
    if(!isReviewer(schema))return {text:skill.aiTier==='9'?'经核对':'初稿'};
    if(input.includes('好修'))return review(schema,'edit',{field:'text',replacement:'修正后'});
    return review(schema,skill.aiTier==='4'?'accept':'revise');
  }})});
  after(()=>ai.close());
  const ask=text=>ai.memory(text,'整理',textSchema,signal(),{aiReview:true});
  assert.deepEqual(await ask('好修'),{text:'修正后'});
  assert.deepEqual(tiers,['2','2']);
  tiers.length=0;
  assert.deepEqual(await ask('需要查明'),{text:'经核对'});
  assert.deepEqual(tiers,['2','2','9','9','4']);
});

test('2B 漏掉指定事实时走补正，程序拒绝审核补丁删掉同一事实',async t=>{
  const {file,after}=fixture(t),tiers=[];
  const ai=createAiWorkflowModel({file,model:model({async memory(_text,_instruction,schema,_signal,skill){
    tiers.push(skill.aiTier);
    if(!isReviewer(schema))return {text:skill.aiTier==='2'?'回程还没买。':'星期六已买去程，回程还没买。'};
    return skill.aiTier==='9'?review(schema,'edit',{field:'text',replacement:'回程还没买。'}):review(schema);
  }})});
  after(()=>ai.close());
  const result=await ai.memory('周六已买去程，回程还没买。','去重',textSchema,signal(),
    {aiReview:true,aiKeep:{text:['周六']}});
  assert.deepEqual(tiers,['2','9','9','4']);
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

test('9B 资源延后后重启接着当前阶段，业务落盘后才清理结果',async t=>{
  const {file,after}=fixture(t),calls=[];
  const request=(ai)=>ai.memory('原话','修订',textSchema,signal(),{aiCheckpoint:'business-record/draft',aiReview:true});
  const first=createAiWorkflowModel({file,model:model({async memory(_text,_instruction,schema,_signal,skill){
    calls.push(skill.aiTier);
    if(skill.aiTier==='9')throw Object.assign(Error('显存忙'),{code:'LOCAL_AI_TIER_WAIT'});
    return isReviewer(schema)?review(schema,'revise'):{text:'初稿'};
  }})});
  try{await assert.rejects(request(first),{code:'LOCAL_AI_TIER_WAIT'});}
  finally{await first.close();}
  assert.deepEqual(calls,['2','2','9']);
  calls.length=0;
  const second=createAiWorkflowModel({file,model:model({async memory(_text,_instruction,schema,_signal,skill){
    calls.push(skill.aiTier);return isReviewer(schema)?review(schema):{text:'核对后'};
  }})});
  after(()=>second.close());
  assert.deepEqual(await request(second),{text:'核对后'});
  assert.deepEqual(await request(second),{text:'核对后'});
  assert.deepEqual(calls,['9','9']);
  second.aiAck('business-record/draft');
  const db=new DatabaseSync(file,{readOnly:true});
  try{await eventually(()=>db.prepare('SELECT count(*) AS n FROM ai_requests').get().n===0);}
  finally{db.close();}
});

test('行动评价截断后改走 9B 并保留原材料，资源等待跨重启，明确重试沿用最后阶段',async t=>{
  const {file,after}=fixture(t),calls=[],logs=[];
  const original='我把第二份通知撤销，明早仍按原计划发送第一份。';
  const schema={...textSchema,properties:{...textSchema.properties,review:{type:'string'}},required:['text','review']};
  const fail=code=>{throw Object.assign(Error(code),{code});};
  const ask=(ai,key)=>ai.memory(original,'保留行动与原话',schema,signal(),{
    name:'diary-writing',version:'1.9',stage:'reviewAction',aiReview:true,aiCheckpoint:key,maxTokens:450,
  });
  const start=(waiting,terminal=false)=>createAiWorkflowModel({file,log:event=>logs.push(event),model:model({
    async memory(text,prompt,schema,_signal,skill){
      calls.push([skill.aiTier,isReviewer(schema),skill.aiAttemptId]);
      if(terminal||skill.aiTier==='2')fail('LOCAL_AI_OUTPUT_BUDGET');
      if(waiting)fail('LOCAL_AI_TIER_WAIT');
      if(isReviewer(schema))return review(schema);
      assert.equal(JSON.parse(text).材料,original);
      assert.equal(schema.properties.review.maxLength,90);
      assert.ok(skill.maxTokens>=768);
      assert.match(prompt,/只返回指定 JSON/);
      return {text:original,review:'我记住两份通知的区别了。'};
    },
  })});
  const first=start(true);
  try{await assert.rejects(ask(first,'待续材料'),{code:'LOCAL_AI_TIER_WAIT'});}
  finally{await first.close();}
  assert.deepEqual(calls.map(call=>call[0]),['2','9']);
  assert.deepEqual(calls.map(call=>call[2]),logs.map(row=>row.ai_attempt_id));
  calls.length=0;
  const second=start(false);
  try{
    assert.equal((await ask(second,'待续材料')).text,original);
    assert.deepEqual(calls.map(call=>call.slice(0,2)),[['9',false],['9',true]]);
  }finally{await second.close();}
  calls.length=0;
  const third=start(false,true);after(()=>third.close());
  for(let times=0;times<2;times++)await assert.rejects(ask(third,'最终超限'),{code:'LOCAL_AI_DIARY_REVIEW_BUDGET'});
  assert.deepEqual(calls.map(call=>call[0]),['2','9','9']);
});

test('显卡忙时补评只试一个小批次，恢复后原材料可继续完成',async t=>{
  const {profile,file,after}=fixture(t);
  let unavailable=true,attempts=0;
  const tasks=Array.from({length:10},(_,i)=>({at,task_id:'fixture-'+i,title:'检查资料 '+i,action:'已完成',detail:'原件已收到 '+i}));
  const ai=createAiWorkflowModel({file,model:model({async memory(text,_prompt,schema){
    attempts++;
    if(unavailable)throw Object.assign(Error('等待显卡'),{code:'LOCAL_AI_GPU_DEFERRED'});
    return isReviewer(schema)?review(schema):{text,review:'我确认收到原件。'};
  }})});
  const diary=createPersonalityDiary({profile,model:ai,now:()=>at,weather:()=>[],
    memory:{archiveDays:()=>[day],read:d=>[],readTasks:d=>d===day?tasks:[]},request:()=>{throw Error('隔离测试不联网');}});
  after(async()=>{diary.close();await ai.close();});
  assert.match(await diary.run('task-review',signal()),/另有 10 条保留待核查/);
  assert.equal(attempts,4);
  unavailable=false;
  assert.match(await diary.run('task-review',signal()),/补写 10 条执行评价/);
  assert.equal(attempts,24);
});

test('补评升级后沿用原阶段和已开始的分片，已入库材料只确认旧队列',async t=>{
  const {profile,file,after}=fixture(t);
  const tasks=['领取整条','领取分片','已有评价'].map((title,i)=>({title,task_id:'resume-'+i,at,action:'完成',
    detail:i===1?'甲乙丙丁'.repeat(96):'核对原件'}));
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const shape={type:'object',properties:{text:{type:'string'},review:{type:'string'}},required:['text','review']};
  const material=tasks.map(task=>{
    const text=[task.title,task.action,task.detail].join(' · ');
    return {text,id:hash([day,'task:'+task.task_id,at,0,text].join('|'))};
  });
  const original=createAiWorkflowModel({file,model:model({async memory(text,_prompt,schema,_signal,skill){
    if(skill.aiTier==='9')throw Object.assign(Error('等待显存'),{code:'LOCAL_AI_TIER_WAIT'});
    return isReviewer(schema)?review(schema,'revise'):{text,review:'旧版草稿'};
  }})});
  const expected=new Set();
  try{
    for(const [i,item] of material.entries()){
      const part=i===1,text=part?item.text.slice(0,360):item.text;
      const key='diary:0.9:'+item.id+(part?'-part-0':'')+':reviewAction:'+hash(text);
      await assert.rejects(original.memory(text,'补评',shape,signal(),{name:'diary-writing',version:'0.9',stage:'reviewAction',
        aiReview:true,aiCheckpoint:key}),{code:'LOCAL_AI_TIER_WAIT'});
      const db=new DatabaseSync(file,{readOnly:true});
      try{
        const row=db.prepare('SELECT id,attempt FROM ai_requests WHERE checkpoint=?').get(key);
        if(i<2)expected.add(row.id+'-'+(row.attempt+1));
      }finally{db.close();}
    }
  }finally{await original.close();}
  const calls=[],logs=[];
  const ai=createAiWorkflowModel({file,log:row=>logs.push(row),model:model({async memory(text,_prompt,schema,_signal,skill){
    calls.push([text,skill.version]);
    assert(!text.includes('已有评价'));
    assert(!text.includes(material[1].text),'已拆分的材料重新整条推理');
    return isReviewer(schema)?review(schema):{text:'核对原件',review:'收到。'};
  }})});
  const diary=createPersonalityDiary({profile,model:ai,weather:()=>[],now:()=>at,
    memory:{archiveDays:()=>[day],read:()=>[],readTasks:()=>tasks}});
  const db=new DatabaseSync(join(profile,'personality-memory.sqlite'));
  after(async()=>{db.close();diary.close();await ai.close();});
  db.prepare('INSERT INTO cleaned VALUES(?,?)').run(material[2].id,'原有正文');
  db.prepare('INSERT INTO materials(id,day,review) VALUES(?,?,?)').run(material[2].id,day,'原有评价');
  assert.match(await diary.run('task-review',signal()),/补写 2 条执行评价/);
  assert(calls.some(([,v])=>v==='0.9'));
  for(const id of expected)assert(logs.some(row=>row.ai_attempt_id===id&&row.stage==='9-write'&&!row.error));
  const before=calls.length;
  assert.match(await diary.run('task-review',signal()),/补写 0 条执行评价/);
  assert.equal(calls.length,before);
  assert.equal(db.prepare('SELECT review FROM materials WHERE id=?').get(material[2].id).review,'原有评价');
  await eventually(()=>ai.aiReviewCheckpoints().length===0);
});

test('补评审核改写不能绕过短评限制或清空有正文的评价',async t=>{
  const {file,after}=fixture(t);
  const calls=[];
  const schema={...textSchema,properties:{...textSchema.properties,review:{type:'string'}},required:['text','review']};
  const draft={text:'原件已收到，补件还没有。',review:'我会记住补件还没到。'};
  let field='review',replacement;
  const ai=createAiWorkflowModel({file,model:model({async memory(_text,_prompt,schema,_signal,skill){
    calls.push(skill.aiTier);
    if(!isReviewer(schema))return draft;
    return skill.aiTier==='2'?review(schema,'edit',{field,replacement}):review(schema);
  }})});
  after(()=>ai.close());
  for(const value of ['较长的评价'.repeat(20),'   ']){
    replacement=value;
    calls.length=0;
    assert.deepEqual(await ai.memory(draft.text,'保留原文',schema,signal(),{
      name:'diary-writing',version:'1.9',stage:'reviewAction',aiReview:true,
    }),draft);
    assert.deepEqual(calls,['2','2','9','9']);
  }
  field='text';
  replacement='原件已收到，补件还未收到。收件人已确认缺件并登记处理时间，后续仍需按原要求取得补件。'.repeat(3);
  calls.length=0;
  assert.deepEqual(await ai.memory(draft.text,'保留原文',schema,signal(),{
    name:'diary-writing',version:'1.9',stage:'reviewAction',aiReview:true,
  }),{...draft,text:replacement});
  assert.deepEqual(calls,['2','2']);
});

test('旧版已保存的较长补评可经审核续办',async t=>{
  const {file,after}=fixture(t),calls=[];
  const shape={...textSchema,properties:{...textSchema.properties,review:{type:'string'}},required:['text','review']};
  const skill={name:'diary-writing',version:'1.9',stage:'reviewAction'};
  const candidate={text:'原件已收到。',review:'这是先前按旧版要求留下的评价。'.repeat(8)};
  const first=createAiWorkflowModel({file,model:model()});
  await first.close();
  const db=new DatabaseSync(file);
  try{
    db.prepare("INSERT INTO ai_requests(id,group_id,checkpoint,priority,state,input) VALUES('old','old','旧草稿',1,'parked',?)")
      .run(JSON.stringify({phase:'4-check',text:candidate.text,instruction:'保留原文',schema:shape,skill,candidate}));
  }finally{db.close();}
  const ai=createAiWorkflowModel({file,model:model({async memory(_text,_prompt,schema,_signal,skill){
    calls.push(skill.aiTier);
    return review(schema);
  }})});
  after(()=>ai.close());
  assert.deepEqual(await ai.memory(candidate.text,'保留原文',shape,signal(),{
    ...skill,aiReview:true,aiCheckpoint:'旧草稿',
  }),candidate);
  assert.deepEqual(calls,['4']);
});

test('单条补评最终被拒仍会留痕，同批和后续材料继续保存',async t=>{
  const {profile,file,after}=fixture(t);
  const tasks=Array.from({length:5},(_,i)=>({at,task_id:'fixture-'+i,title:i?'检查资料 '+i:'专门拒绝的资料',action:'已完成',detail:'原件已收到 '+i}));
  const ai=createAiWorkflowModel({file,model:model({async memory(text,_prompt,schema){
    if(isReviewer(schema))return review(schema,text.includes('专门拒绝的资料')?'revise':'accept');
    return {text:'原件已收到。',review:'我确认收到原件。'};
  }})});
  const diary=createPersonalityDiary({profile,model:ai,now:()=>at,weather:()=>[],
    memory:{archiveDays:()=>[day],read:()=>[],readTasks:d=>d===day?tasks:[]},request:()=>{throw Error('隔离测试不联网');}});
  after(async()=>{diary.close();await ai.close();});
  assert.match(await diary.run('task-review',signal()),/补写 4 条执行评价.*另有 1 条保留待核查/);
  const db=new DatabaseSync(join(profile,'personality-memory.sqlite'),{readOnly:true});
  try{
    assert.deepEqual(db.prepare('SELECT code,attempts FROM material_review_failures').all().map(row=>({...row})),
      [{code:'AI_REVIEW_REJECTED',attempts:3}]);
    assert.equal(db.prepare('SELECT count(*) AS n FROM materials').get().n,4);
  }finally{db.close();}
});

test('本地整理、服务器文本校对、本地评价、多阶段日记和旧唠叨共享单个模型时隙',async t=>{
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
  assert(seen.some(x=>x.endsWith(':narrate')));
  assert(seen.some(x=>x.endsWith(':summary')||x.endsWith(':header')));
  assert(seen.some(x=>x.startsWith('memory-refinement:review')));
});

test('手记成文用固定复审纠正来源归属，带反馈改写后才交付',async t=>{
  const {file,after}=fixture(t),seen=[];
  const ai=createAiWorkflowModel({file,model:model({async memory(text,prompt,schema,_signal,skill){
    seen.push([skill.aiTier,skill.stage,isReviewer(schema)]);
    if(isReviewer(schema)){
      assert.match(prompt,/按来源纠正行动者/);
      return seen.length===2?{decision:'revise',reason:'发布者是用户，绯月只读了登记',field:'',replacement:''}:review(schema);
    }
    if(seen.length===1)return {text:'我发布了绘图工具。',comment:'我很满意。',thread:''};
    assert.match(JSON.parse(text).上轮反馈,/发布者是用户/);
    return {text:'我看到你发布了绘图工具。',comment:'我也替你高兴。',thread:''};
  }})});
  after(()=>ai.close());
  const schema={type:'object',properties:Object.fromEntries(['text','comment','thread'].map(key=>[key,{type:'string'}])),
    required:['text','comment','thread'],additionalProperties:false};
  const result=await ai.memory('发布登记由用户完成','写这条手记',schema,signal(),
    {name:'diary-writing',stage:'narrate',aiReview:true,aiReviewGuidance:'按来源纠正行动者'});
  assert.equal(result.text,'我看到你发布了绘图工具。');
  assert.deepEqual(seen.map(([tier,,checking])=>[tier,checking]),[['2',false],['4',true],['9',false],['9',true]]);
});
