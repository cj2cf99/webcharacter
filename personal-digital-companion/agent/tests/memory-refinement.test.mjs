import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {openTestDatabase} from './sqlite-d1.mjs';
import {personalityMemory} from '../assistant/personality-memory.mjs';
import {refinementInterval} from '../assistant/memory-refinement.mjs';
import {createMemoryRefinement} from '../../desktop/memory-refinement.mjs';
import {createReminderChecks} from '../../desktop/reminder-checks.mjs';
import {createPersonalityDiary} from '../../desktop/personality-diary.mjs';

const day='2026-11-22', at='2026-11-22T02:00:00.000Z';
const recordPath=`diaries/${day}.1`,refinePath=recordPath+'/refine';
const batch={day,batch:'initial',body:'你说：装好了，然后把日志里的每一步也都念了一遍。\n原先的描述需要整理。',summary:'安装过程与详细记录',mood:'平静',tags:['日常','安装'],weather:'晴',threads:['结果如何？','明天还要干嘛？']};
const nag={id:'closed',revision:1,created_at:at,source:'diary',source_id:day+'.1/1',title:'结果如何？',reason:'记下了这件事',
  status:'回合结束',mood:'平静',
  talk:[{who:'绯月',text:'好了吗？',at:'2026-11-22T01:55:00.000Z'},{who:'你',text:'嗯，等等我看看。',at:'2026-11-22T01:58:00.000Z'},{who:'你',text:'已经装好了。',at}],
  beforeEvaluation:'用户刚说要安装。',afterEvaluation:'我记下了。'};
const signal=new AbortController().signal;
const migration=readFileSync(new URL('../migrations/016-personality-memory.sql',import.meta.url),'utf8');
const schemas=JSON.parse(readFileSync(new URL('../../skills/memory-refinement/source/schemas.json',import.meta.url),'utf8'));
const localAi=JSON.parse(readFileSync(new URL('../../skills/memory-refinement/source/local-ai.json',import.meta.url),'utf8'));
const fakeSkill=(version='2.0')=>async name=>name==='memoryRefinement'?{skill:'memory-refinement',version,content:'整篇重写指引',schemas,localAi}:{version:'1.0',content:'现行格式'};

function fixture(t,nowIso=at){
  let time=Date.parse(nowIso);
  t.mock.method(Date,'now',()=>time);
  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(migration);t.after(close);
  function request(path,body,owner='owner',options={}){
    const props=body?{method:'POST',body:JSON.stringify(body)}:{};
    return personalityMemory(new Request('https://fixture.test/api/memory/'+path,props),{DB,...options},owner);
  }
  async function api(path,body){
    const response=await request(path,body);
    assert.equal(response.status,200,await response.clone().text());
    return response.json();
  }
  return {sqlite,request,api,advance:ms=>{time+=ms;},now:()=>time};
}

test('日记修订放开正文精简、摘要、Tag(<=10)与悬念，锁死天气与心情，保护附件锚点、引用及已念叨悬念编号',async t=>{
  const {sqlite,api,request,advance}=fixture(t);
  const withAttach={...batch,body:batch.body+'\n〔附件原文 a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4〕'};
  await api('diaries',withAttach);
  await api(recordPath+'/threads/1',{field:'asked'});
  const quoted='原先的描述需要整理。';
  const audit={id:'audit-one',revision:1,created_at:at,source:'audit',source_id:day+'.1',title:'如何整理？',reason:'希望看清楚',
    status:'等待回应',mood:'平静',talk:[{who:'绯月',text:'如何整理？',at}],refs:[{page:day+'.1',quote:quoted}],points:['旧描述不清楚'],questions:1,next:'如何整理？'};
  await api('nags',audit);
  assert.deepEqual((await api(refinePath)).quotes,[quoted]);

  const goodFields={
    body:'老公确认已经装好了。原先的描述需要整理。\n〔附件原文 a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4〕\n绯月后记：这次顺利完成。',
    summary:'老公完成安装',
    tags:['安装','桌面精灵'],
    threads:[{no:1,text:'安装后的效果如何？',resolved:false,asked:true}]
  };
  const first={baseRevision:2,refineId:'first-refine',fields:goodFields};
  // 锁死 weather / mood，不允许传入
  assert.equal((await request(refinePath,{...first,fields:{...goodFields,weather:'雨'}})).status,400);
  assert.equal((await request(refinePath,{...first,fields:{...goodFields,mood:'开心'}})).status,400);
  // 摘要不允许换行
  assert.equal((await request(refinePath,{...first,fields:{...goodFields,summary:'第一行\n第二行'}})).status,400);
  // Tag 超过 10 个拒绝
  assert.equal((await request(refinePath,{...first,fields:{...goodFields,tags:Array.from({length:11},(_,i)=>'词'+i)}})).status,400);
  // 删掉附件锚点拒绝
  assert.equal((await request(refinePath,{...first,fields:{...goodFields,body:'老公确认已经装好了。原先的描述需要整理。'}})).status,400);
  // 删掉质问引用短句拒绝 (409)
  assert.equal((await request(refinePath,{...first,fields:{...goodFields,body:'老公确认已经装好了。\n〔附件原文 a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4〕'}})).status,409);
  // 删掉已念叨的悬念编号拒绝 (400)
  assert.equal((await request(refinePath,{...first,fields:{...goodFields,threads:[]}})).status,400);
  // 权限与只读保护
  assert.equal((await request(refinePath,first,'other')).status,404);
  assert.equal((await request(refinePath,first,'owner',{companionBrowser:true})).status,405);

  const [one,two]=await Promise.all([api(refinePath,first),api(refinePath,first)]);
  assert.deepEqual(one,two);
  const current=await api(refinePath);
  assert.equal(current.record.revision,3);
  assert.equal(current.record.weather,'晴');
  assert.equal(current.record.mood,'平静');
  assert.deepEqual(current.record.tags,['安装','桌面精灵']);
  assert.equal(current.record.threads.length,1);
  assert.equal(current.record.threads[0].no,1);
  assert.equal(current.record.threads[0].asked,true);
  // 冷却保护与第二次修订
  const second={baseRevision:3,refineId:'second-refine',fields:{...goodFields,summary:'老公完成安装与验收'}};
  advance(refinementInterval-1);
  assert.equal((await request(refinePath,second)).status,409);
  advance(1);
  assert.equal((await api(refinePath,second)).revision,4);
  const stored=sqlite.prepare('SELECT body,tags,threads,weather,mood,batches FROM companion_diary').get();
  const metadata=JSON.parse(stored.batches);
  assert.equal(metadata['@refineOriginal'].body,withAttach.body);
  assert.deepEqual(metadata['@refineOriginal'].threads,[
    {no:1,text:'结果如何？',resolved:false,asked:false},
    {no:2,text:'明天还要干嘛？',resolved:false,asked:false}
  ]);
  assert.equal(stored.weather,'晴');
  assert.equal(stored.mood,'平静');
  assert.equal(metadata['@refineReceipt'].refineId,'second-refine');
});

test('唠叨修订允许精简 talk 与重写评价，锁死 mood，校验原合法时间戳与结束记录保留',async t=>{
  const {api,request,sqlite}=fixture(t);
  const endedWithClose={...nag,status:'用户结束',talk:[...nag.talk,{who:'结束记录',text:'老公闷闷的不理我了',at}]};
  await api('nags',endedWithClose);
  const good={
    beforeEvaluation:'我惦记着老公的安装进度。',
    afterEvaluation:'老公确认已经装好了。',
    talk:[{who:'绯月',text:'装好了吗？',at:'2026-11-22T01:55:00.000Z'},{who:'你',text:'已经装好了。',at},{who:'结束记录',text:'老公闷闷的不理我了',at}]
  };
  const body={baseRevision:1,refineId:'nag-rewrite-1',fields:good};
  // 锁死 mood
  assert.equal((await request('nags/closed/refine',{...body,fields:{...good,mood:'开心'}})).status,400);
  // 编造时间戳拒绝
  assert.equal((await request('nags/closed/refine',{...body,fields:{...good,talk:[{who:'你',text:'装好了',at:'2026-11-22T09:00:00.000Z'},{who:'结束记录',text:'老公闷闷的不理我了',at}]}})).status,400);
  // 删掉结束记录拒绝
  assert.equal((await request('nags/closed/refine',{...body,fields:{...good,talk:[{who:'你',text:'已经装好了。',at}]}})).status,400);

  await api('nags/closed/refine',body);
  const saved=await api('nags/closed');
  assert.equal(saved.mood,'平静');
  assert.equal(saved.talk.length,3);
  assert.equal(saved.afterEvaluation,good.afterEvaluation);
  const raw=JSON.parse(sqlite.prepare('SELECT payload FROM companion_nags').get().payload);
  assert.equal(raw._refinement.original.talk.length,4);
  // 空日记跳过
  await api('diaries',{...batch,body:'无所事事的一天',threads:[]});
  assert.equal((await request(refinePath,{baseRevision:1,refineId:'empty',fields:{body:'假补写',summary:'测试',tags:[],threads:[]}})).status,409);
});

test('选篇顺序：近 7 天从旧到新优先，再 8-30 天从旧到新，超 30 天跳过',async t=>{
  const {api,now}=fixture(t,'2026-11-25T10:00:00.000Z');
  // 40 天前（应跳过）、15 天前（第二梯队）、6 天前（第一梯队最旧）、2 天前（第一梯队较新）
  for(const d of ['2026-10-15','2026-11-10','2026-11-19','2026-11-23']){
    await api('diaries',{...batch,day:d,batch:'b-'+d,body:`用户今天在 ${d} 做了测试。`,threads:[]});
  }
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const visited=[];
  const runner=createMemoryRefinement({db,api,now,clean:s=>s.trim(),loadSkill:fakeSkill(),
    model:{async memory(text,_inst,_schema,_sig,skill){
      const data=JSON.parse(text);
      if(skill.stage==='diagnose'){visited.push(data.id);return {needsRewrite:'yes',issues:['修正人称与称呼'],plan:'把用户改成老公'};}
      if(skill.stage==='rewriteDiary')return {body:`老公在 ${data.context.date} 做了测试。`,summary:`${data.context.date} 测试`,tags:['测试'],threads:[],note:'修正了称呼'};
      return {decision:'accept',reason:''};
    }}
  });
  assert.match(await runner.run(signal),/已重写日记 2026-11-19\.1/);
  assert.match(await runner.run(signal),/已重写日记 2026-11-23\.1/);
  assert.match(await runner.run(signal),/已重写日记 2026-11-10\.1/);
  assert.equal(await runner.run(signal),'本轮没有符合条件的重写');
  assert.deepEqual(visited,['2026-11-19.1','2026-11-23.1','2026-11-10.1']);
});

test('整篇重写不拆 144 字分片、一次性复核、注入已有 Tag 库并向头顶气泡汇报篇号/问题/步数',async t=>{
  const {api,now}=fixture(t,'2026-11-25T10:00:00.000Z');
  const longBody='用户今天调试了很久。\n'+'你说：这里日志太长了需要精简。'.repeat(18)+'\n绯月当时回复：收到，我来记下来。';
  await api('diaries',{...batch,day:'2026-11-24',body:longBody,tags:['日常','聊天','调试']});
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const stages=[],bubbles=[];
  let seenTagPool=null;
  const runner=createMemoryRefinement({db,api,now,clean:s=>s.trim(),loadSkill:fakeSkill(),
    readTagPool:()=>['绯月桌面','调试','云端同步'],
    model:{async memory(text,_inst,_schema,_sig,skill){
      stages.push(skill.stage);
      const data=JSON.parse(text);
      if(skill.stage==='diagnose')return {needsRewrite:'yes',issues:['修正人称与称呼','精简冗长对话'],plan:'统一第一人称并精简对话'};
      if(skill.stage==='rewriteDiary'){
        seenTagPool=data.tagPool;
        return {body:'老公今天完成了长日志调试，要求精简记录。',summary:'老公完成日志调试',tags:['调试','绯月桌面'],threads:[{no:1,text:'日志精简后的效果如何？',resolved:false}],note:'精简了对话并复用已有Tag'};
      }
      return {decision:'accept',reason:''};
    }}
  });
  assert.match(await runner.run(signal,p=>bubbles.push(p)),/已重写日记 2026-11-24\.1/);
  // 只调用 3 次模型（体检 + 整篇重写 + 一次性整篇复核），无分片循环
  assert.deepEqual(stages,['diagnose','rewriteDiary','review']);
  assert.deepEqual(seenTagPool,['绯月桌面','调试','云端同步']);
  assert.equal(bubbles.length,4);
  assert.match(bubbles[0].stage,/重写 日记 11-24\.1 · 体检问题/);assert.equal(bubbles[0].done,1);assert.equal(bubbles[0].total,4);
  assert.match(bubbles[1].stage,/重写 日记 11-24\.1 · 修正人称与称呼/);assert.equal(bubbles[1].done,2);assert.equal(bubbles[1].total,4);
  assert.match(bubbles[2].stage,/重写 日记 11-24\.1 · 整篇复核/);assert.equal(bubbles[2].done,3);assert.equal(bubbles[2].total,4);
  assert.match(bubbles[3].stage,/重写 日记 11-24\.1 · 提交同步/);assert.equal(bubbles[3].done,4);assert.equal(bubbles[3].total,4);
});

test('整篇复核退回时保留体检断点并带原因整篇返工一次，唠叨 talk 精简同步云端',async t=>{
  const {api,now}=fixture(t,'2026-11-22T03:00:00.000Z');
  await api('nags',nag);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  let reviewCount=0,feedbackSeen='';
  const runner=createMemoryRefinement({db,api,now,clean:s=>s.trim(),loadSkill:fakeSkill(),
    model:{async memory(text,_inst,_schema,_sig,skill){
      const data=JSON.parse(text);
      if(skill.stage==='diagnose')return {needsRewrite:'yes',issues:['修正人称与称呼','精简唠叨问答'],plan:'删掉无效过渡句'};
      if(skill.stage==='rewriteNag'){
        feedbackSeen=data.reviewFeedback??'';
        return {
          beforeEvaluation:'我惦记着老公的安装进度。',
          afterEvaluation:feedbackSeen?'老公确认已经装好了。':'记下了。',
          talk:[{who:'绯月',text:'装好了吗？',at:'2026-11-22T01:55:00.000Z'},{who:'你',text:'已经装好了。',at}],
          note:'精简了唠叨问答并收束结论'
        };
      }
      reviewCount++;
      return reviewCount===1?{decision:'revise',reason:'结论太敷衍，请写明结果'}:{decision:'accept',reason:''};
    }}
  });
  assert.match(await runner.run(signal),/整篇复核要求补正/);
  assert.match(await runner.run(signal),/已重写唠叨 closed/);
  assert.match(feedbackSeen,/结论太敷衍/);
  const saved=await api('nags/closed');
  assert.equal(saved.talk.length,2);
  assert.equal(saved.afterEvaluation,'老公确认已经装好了。');
});

test('断点恢复、丢失回执幂等续跑与无问题跳过',async t=>{
  const {api,now}=fixture(t,'2026-11-22T03:00:00.000Z');
  await api('diaries',batch);
  const folder=mkdtempSync(join(tmpdir(),'fy-refine-')),file=join(folder,'memory.sqlite');
  let db=new DatabaseSync(file);
  t.after(()=>{db.close();rmSync(folder,{recursive:true,force:true});});
  let posted=0,drop=true,calls=[];
  const makeRunner=()=>createMemoryRefinement({db,now,clean:s=>s.trim(),loadSkill:fakeSkill(),
    async api(path,body){
      const res=await api(path,body);
      if(body){posted++;if(drop){drop=false;throw Error('模拟回执丢失');}}
      return res;
    },
    model:{async memory(_text,_inst,_schema,_sig,skill){
      calls.push(skill.stage);
      if(skill.stage==='diagnose')return {needsRewrite:'yes',issues:['精简摘要骨架'],plan:'重写精简'};
      if(skill.stage==='rewriteDiary')return {body:'老公确认装好了。',summary:'老公完成安装',tags:['安装'],threads:[],note:'整篇精简'};
      return {decision:'accept',reason:''};
    }}
  });
  await assert.rejects(makeRunner().run(signal),/模拟回执丢失/);
  assert.deepEqual(calls,['diagnose','rewriteDiary','review']);
  assert.equal(posted,1);
  // 重开库后直接核对原回执并完成，不重跑模型、不重复 POST
  db.close();db=new DatabaseSync(file);calls=[];
  assert.match(await makeRunner().run(signal),/已重写日记 2026-11-22\.1/);
  assert.deepEqual(calls,[]);
  assert.equal(posted,1);
  // 再次运行应跳过（已检查且在冷却内）
  assert.equal(await makeRunner().run(signal),'本轮没有符合条件的重写');
});

test('当天第一条正文替换空日记，空批次重试沿用原篇',async t=>{
  const {api}=fixture(t);
  const empty={...batch,batch:'empty-'+day,body:'无所事事的一天',summary:'无所事事的一天',threads:[]};
  await api('diaries',empty);
  const fact={...batch,body:'你说：已经装好了。'.padEnd(5000,'字')};
  const saved=await api('diaries',fact);
  assert.deepEqual({part:saved.part,body:saved.body,revision:saved.revision},{part:1,body:fact.body,revision:2});
  assert.deepEqual(await api('diaries',empty),saved);
  assert.deepEqual(await api('diaries',fact),saved);
});

test('修订轮询与启动时的手记核对错峰，仍沿用现有闲时调度',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-refinement-poll-')),timers=new Map();
  let clock=Date.parse(at),busy=false,refined=0;
  const audit=Promise.withResolvers();
  const checks=createReminderChecks({profile,now:()=>clock,isBusy:()=>busy,
    setTimer(fn,ms){const key=Symbol();timers.set(key,{fn,at:clock+ms});return key;},clearTimer:key=>timers.delete(key),
    handlers:{diaryAudit:async()=>{busy=true;checks.setExecutionBusy(true);await audit.promise;
      busy=false;checks.setExecutionBusy(false);return '完成核对';},refinement:async()=>{refined++;return '已完成';}}});
  t.after(()=>{checks.close();rmSync(profile,{recursive:true,force:true});});
  async function advance(ms){
    clock+=ms;
    for(const [key,timer] of [...timers])if(timers.has(key)&&timer.at<=clock){timers.delete(key);timer.fn();}
    await new Promise(resolve=>setImmediate(resolve));
  }
  checks.start();await advance(60000);assert(busy);
  await advance(600000);assert.equal(busy,true);assert.equal(refined,0);
  audit.resolve();await advance(0);
  await advance(659999);assert.equal(refined,0);
  await advance(1);assert.equal(refined,1);
});

test('取消时保留体检断点，推理没有固定截止，且直连记录标记 aiPrivate 仍允许提交云端',async t=>{
  const {api,now}=fixture(t,'2026-11-22T03:00:00.000Z');
  await api('diaries',batch);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  let calls=0;
  const controller=new AbortController(),entered=Promise.withResolvers();
  t.mock.method(AbortSignal,'timeout',()=>assert.fail('修订不应设置推理截止时间'));
  const runner=createMemoryRefinement({db,api,now,clean:s=>s.trim(),loadSkill:fakeSkill(),
    model:{async memory(){
      if(++calls===1)return {needsRewrite:'yes',issues:['精简冗长对话'],plan:'重写正文'};
      entered.resolve();
      return new Promise(()=>{});
    }}
  });
  const stopped=assert.rejects(runner.run(controller.signal),{name:'AbortError'});
  await entered.promise;
  controller.abort();
  await stopped;
  const job=JSON.parse(db.prepare('SELECT data FROM memory_refinements WHERE active=1').get().data);
  assert.equal(job.diagnosis.plan,'重写正文');
  assert.equal((await api(refinePath)).receipt,null);
});

test('旧版分片活跃任务平滑清理并重新按整篇重写；复核连续退回不误标已检',async t=>{
  const {api,now}=fixture(t,'2026-11-22T03:00:00.000Z');
  await api('diaries',batch);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  // 模拟升级前残留的旧版 144 字分片任务（无 ruleVersion / rawRecord）
  db.exec('CREATE TABLE memory_refinements (task_id TEXT PRIMARY KEY, active INTEGER NOT NULL, data TEXT NOT NULL);');
  db.prepare('INSERT INTO memory_refinements VALUES(?,1,?)').run('legacy-task',JSON.stringify({taskId:'legacy-task',kind:'diaries',id:day+'.1',parts:[{id:'body-1',text:'old'}]}));
  let rejectAll=true;
  const runner=createMemoryRefinement({db,api,now,clean:s=>s.trim(),loadSkill:fakeSkill(),
    model:{async memory(_text,_inst,_schema,_sig,skill){
      if(skill.stage==='diagnose')return {needsRewrite:'yes',issues:['精简冗长对话'],plan:'重写'};
      if(skill.stage==='rewriteDiary')return {body:'老公确认装好了。',summary:'老公完成安装',tags:['安装'],threads:[],note:'整篇精简'};
      return rejectAll?{decision:'revise',reason:'再精简一点'}:{decision:'accept',reason:''};
    }}
  });
  // 第 1 次：清理旧任务，跑完体检+重写+复核退回
  assert.match(await runner.run(signal),/整篇复核要求补正/);
  // 第 2 次：返工后仍被退回 -> 释放任务，但不写入 memory_refinement_checked
  assert.match(await runner.run(signal),/已放弃本轮留待后续重试/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM memory_refinement_checked').get().n,0);
  // 第 3 次：允许通过后，可重新接取并成功提交
  rejectAll=false;
  assert.match(await runner.run(signal),/已重写日记 2026-11-22\.1/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM memory_refinement_checked').get().n,1);
});
