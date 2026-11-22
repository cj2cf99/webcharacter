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
const batch={day,batch:'initial',body:'你说：装好了。\n原先的描述需要整理。',summary:'安装',mood:'平静',tags:[],weather:'晴',threads:['结果如何？']};
const nag={id:'closed',revision:1,created_at:at,source:'diary',source_id:day+'.1/1',title:'结果如何？',reason:'记下了这件事',
  status:'回合结束',mood:'平静',talk:[{who:'你',text:'已经装好。',at}],afterEvaluation:'我记下了。'};
const signal=new AbortController().signal;
const migration=readFileSync(new URL('../migrations/016-personality-memory.sql',import.meta.url),'utf8');
const schemas=JSON.parse(readFileSync(new URL('../../skills/memory-refinement/source/schemas.json',import.meta.url),'utf8'));
const localAi=JSON.parse(readFileSync(new URL('../../skills/memory-refinement/source/local-ai.json',import.meta.url),'utf8'));

function fixture(t){
  let time=Date.parse(at);
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
  return {sqlite,request,api,advance:ms=>{time+=ms;}};
}

test('两次修订保留云端最初和最新稿，原话、引用、追加、七天边界与幂等',async t=>{
  const {sqlite,api,request,advance}=fixture(t);
  await api('diaries',batch);
  const quoted='原先的描述需要整理。';
  const audit={id:'audit-one',revision:1,created_at:at,source:'audit',source_id:day+'.1',title:'如何整理？',reason:'希望看清楚',
    status:'等待回应',mood:'平静',talk:[{who:'绯月',text:'如何整理？',at}],refs:[{page:day+'.1',quote:quoted}],points:['旧描述不清楚'],questions:1,next:'如何整理？'};
  await api('nags',audit);
  assert.deepEqual((await api(refinePath)).quotes,[quoted]);
  const first={baseRevision:1,refineId:'first-refine',fields:{body:batch.body+'\n绯月后记：这次顺利完成。',summary:'安装完成'}};
  assert.equal((await request(refinePath,{...first,fields:{...first.fields,body:'改掉原话'}})).status,400);
  assert.equal((await request(refinePath,{...first,fields:{...first.fields,summary:'第一行\n【情绪】第二行'}})).status,400);
  assert.equal((await request(refinePath,{...first,fields:{...first.fields,body:'你说：装好了。'}})).status,409);
  assert.equal((await request(refinePath,{...first,note:'只存本地'})).status,400);
  assert.equal((await request(refinePath,first,'other')).status,404);
  assert.equal((await request(refinePath,first,'owner',{companionBrowser:true})).status,405);
  const [one,two]=await Promise.all([api(refinePath,first),api(refinePath,first)]);
  assert.deepEqual(one,two);
  await api('diaries',{...batch,batch:'append',body:'你说：后来又装好了一样东西。',threads:[]});
  await api(recordPath+'/threads/1',{field:'resolved'});
  const current=await api(refinePath);
  assert.equal(current.record.revision,4);assert.equal(current.record.threads[0].resolved,true);
  assert.deepEqual(current.receipt,one);assert.deepEqual(await api(refinePath,first),one);
  assert.equal((await request(refinePath,{...first,fields:{...first.fields,summary:'同号不同文字'}})).status,409);
  const second={baseRevision:4,refineId:'second-refine',fields:{summary:'安装与后续',body:current.record.body+'\n此处记录已核对。'}};
  advance(refinementInterval-1);
  assert.equal((await request(refinePath,second)).status,409);
  advance(1);
  assert.equal((await api(refinePath,second)).revision,5);
  const stored=sqlite.prepare('SELECT body,batches FROM companion_diary').get();
  const metadata=JSON.parse(stored.batches);
  assert.deepEqual(metadata['@refineOriginal'],{body:batch.body,summary:batch.summary});
  assert.equal(stored.body,second.fields.body);
  assert.equal(metadata['@refineReceipt'].refineId,'second-refine');
});

test('旧记录备份只能固定一次，已结束唠叨只改评价，空日记跳过',async t=>{
  const {api,request,sqlite}=fixture(t);
  await api('nags',nag);
  sqlite.exec("UPDATE companion_nags SET payload=json_remove(payload,'$._refinement')");
  const body={baseRevision:1,refineId:'nag-first',fields:{beforeEvaluation:'',afterEvaluation:'绯月后记：我确认安装完成。'}};
  assert.equal((await request('nags/closed/refine',{...body,fields:{...body.fields,talk:'不允许'}})).status,400);
  await api('nags/closed/refine',body);
  const record=await api('nags/closed');
  assert.equal(record.afterEvaluation,body.fields.afterEvaluation);assert.deepEqual(record.talk,nag.talk);
  assert.equal(record.status,nag.status);assert(!Object.hasOwn(record,'_refinement'));
  const raw=JSON.parse(sqlite.prepare('SELECT payload FROM companion_nags').get().payload);
  assert.equal(raw._refinement.original.afterEvaluation,nag.afterEvaluation);
  await api('diaries',{...batch,body:'无所事事的一天'});
  assert.equal((await request(refinePath,{baseRevision:1,refineId:'empty',fields:{body:'假补写',summary:'测试'}})).status,409);
});

test('旧服务的修订读取返回 404 时跳过，入口上线后继续原记录',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-refine-legacy-'));
  const requests=[];
  let missing=true;
  const archived={...nag,talk:[{who:'绯月',text:'你愿意听我讲故事吗？',at},
    {who:'你',text:'我给你讲故事。',at},{who:'绯月',text:'我给你讲故事，你听。',at}]};
  const {api,request}=fixture(t);
  await api('nags',archived);
  const diary=createPersonalityDiary({profile,now:()=>Date.parse(at),
    model:{memory:()=>assert.fail('可证的更正不需要模型')},
    request(path,options){
      const target=path.slice('/api/memory/'.length);
      requests.push([target,options.method]);
      if(missing&&target.endsWith('/refine'))return Response.json({error:'原记录不可用'},{status:404});
      return request(target,options.body&&JSON.parse(options.body));
    }});
  t.after(()=>{diary.close();rmSync(profile,{recursive:true,force:true});});
  await diary.refine(signal);
  assert.equal(await diary.refine(signal),'本轮没有符合条件的修订');
  assert.ok(requests.some(([path])=>path==='nags/closed/refine'));
  assert.ok(requests.every(([,method])=>method==='GET'));
  missing=false;
  await diary.refine(signal);
  assert.match(await diary.refine(signal),/已修订唠叨/);
  const saved=(await api('nags/closed/refine')).record;
  assert.deepEqual(saved.talk,archived.talk);
  assert.match(saved.afterEvaluation,/我听你讲故事/);
});

test('事后修订移除历史空占位，保留来源摘要和原话，唠叨只追加更正',async t=>{
  const {api}=fixture(t);
  const body='你说：已经装好了。\n\n我等到了最新的结果。';
  const summary='你的日记：安装顺利\n当日消费：配件 480 日元';
  await api('diaries',{...batch,body:'无所事事的一天\n\n'+body,summary:'无所事事的一天\n'+summary});
  const archived={...nag,talk:[{who:'绯月',text:'好了吗？',at},{who:'你',text:'已经装好。',at},
    {who:'绯月',text:'还没动工就慢慢准备吧。',at}]};
  await api('nags',archived);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const runner=createMemoryRefinement({db,api,clean:text=>text.trim(),
    loadSkill:async name=>name==='memoryRefinement'?{skill:'memory-refinement',version:'1.0',content:'固定复审',schemas,localAi}:
      {version:'1.0',content:'现行格式'},
    model:{async memory(text,prompt,_schema,_signal,skill){
      const data=JSON.parse(text);
      if(skill.stage==='plan')return {organize:data.record.kind==='唠叨'?'纠正把已完成误写成未动工':'',additions:'',format:''};
      if(skill.stage==='draft'){
        const {part}=data;
        return {text:part.field==='afterEvaluation'?part.text+'\n绯月后记：我当时把已经装好听成尚未动工。':part.text,note:''};
      }
      assert.match(prompt,/固定复审/);
      return {decision:'accept',part:'',reason:''};
    }}
  });
  assert.match(await runner.run(signal),/已修订日记/);
  const diary=await api(recordPath);
  assert.equal(diary.body,body);
  assert.equal(diary.summary,summary);
  assert.match(await runner.run(signal),/已修订唠叨/);
  const corrected=await api('nags/closed');
  assert.deepEqual(corrected.talk,archived.talk);
  assert.match(corrected.afterEvaluation,/绯月后记：我当时把已经装好听成尚未动工/);
});

test('明确待复核的唠叨按原话补记，保留整段发言和原评价',async t=>{
  const {api}=fixture(t);
  const archived={...nag,talk:[{who:'绯月',text:'什么时候到？',at},{who:'你',text:'最迟九点。',at},
    {who:'绯月',text:'这句我先记下，之后我会按你的原话再核对。',at}],
    afterEvaluation:'已保存原话，待复核这轮回应。'};
  await api('nags',archived);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const runner=createMemoryRefinement({db,api,clean:text=>text.trim(),
    loadSkill:async name=>name==='memoryRefinement'?{skill:'memory-refinement',version:'1.0',content:'固定复审',schemas,localAi}:
      {version:'1.0',content:'现行格式'},
    model:{memory(){assert.fail('证据明确的更正不需要额外推理');}}
  });
  await runner.run(signal);
  assert.match(await runner.run(signal),/已修订唠叨/u);
  const {record,receipt}=await api('nags/closed/refine');
  assert.deepEqual(record.talk,archived.talk);
  assert.equal(record.afterEvaluation,archived.afterEvaluation+'\n绯月后记：重新核对这轮，你当时说的是「最迟九点。」');
  assert.equal(receipt.revision,archived.revision+1);
  await runner.run(signal);await runner.run(signal);
  assert.equal((await api('nags/closed/refine')).record.revision,receipt.revision);
});

test('两条旧私密唠叨离线逐条补记，重开数据库后不重复也不外发',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-nag-private-'));
  let requests=0;
  const model={memory(){assert.fail('本机可证的补记不需要模型');}};
  const offline=()=>{requests++;assert.fail('私密唠叨不应走网络');};
  let diary=createPersonalityDiary({profile,model,request:offline,now:()=>Date.parse(at)});
  t.after(()=>{diary.close();rmSync(profile,{recursive:true,force:true});});
  const sample=id=>({...nag,id,localOnly:true,revision:0,talk:[{who:'你',text:'最迟九点。',at},
    {who:'绯月',text:'这句我先记下，之后我会按你的原话再核对。',at}]});
  const first=sample('private-one');
  first.talk.push({who:'你',text:'我给你讲故事。',at},{who:'绯月',text:'我给你讲故事。',at});
  diary.saveNag(first);
  diary.saveNag(sample('private-two'));
  const before=diary.nags();
  await diary.syncNags(signal);
  assert.match(await diary.refine(signal),/已修订本机唠叨 private-one/u);
  assert.equal(diary.nags().filter(n=>n.afterEvaluation.includes('绯月后记')).length,1);
  diary.close();
  diary=createPersonalityDiary({profile,model,now:()=>Date.parse(at)});
  assert.match(await diary.refine(signal),/已修订本机唠叨 private-two/u);
  assert.match(await diary.refine(signal),/本轮没有符合条件/u);
  const corrected=diary.nags();
  for(const record of before){
    const next=corrected.find(row=>row.id===record.id);
    assert.deepEqual(next.talk,record.talk);
    assert.ok(next.afterEvaluation.startsWith(record.afterEvaluation+'\n绯月后记：重新核对这轮，你当时说的是「最迟九点。」'));
    assert.equal(next.afterEvaluation.includes('我听你讲故事。'),record.id===first.id);
    assert.equal(next.revision,record.revision+1);
  }
  assert.equal(requests,0);
  const db=new DatabaseSync(join(profile,'personality-memory.sqlite'),{readOnly:true});
  try{
    const rows=db.prepare('SELECT data FROM memory_refinements WHERE active=0').all().map(row=>JSON.parse(row.data));
    assert.equal(rows.length,2);
    assert.ok(rows.every(row=>row.localOnly&&row.previous.afterEvaluation===nag.afterEvaluation));
  }finally{db.close();}

  diary.close();
  const listCalls=[];
  const request=async (path,{method})=>{
    listCalls.push([path,method]);
    assert.match(path,/^\/api\/memory\/(?:diaries|nags)\?page=0$/u);
    return Response.json(path.includes('/nags')?{items:[{...sample(first.id),revision:20}],total:1}:{items:[],total:0});
  };
  diary=createPersonalityDiary({profile,model,request,now:()=>Date.parse(at)});
  await diary.refresh(signal);
  await diary.refine(signal);await diary.refine(signal);
  assert.deepEqual(diary.nags(),corrected);
  assert.equal(listCalls.length,4);
  assert.ok(listCalls.every(([,method])=>method==='GET'));
});

test('远端修订准备好后改成私密，放弃待提交稿且不发写请求',async t=>{
  const {api}=fixture(t);
  const before={...nag,talk:[{who:'你',text:'最迟九点。',at},
    {who:'绯月',text:'这句我先记下，之后我会按你的原话再核对。',at}]};
  await api('nags',before);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  let privateNow=false,reads=0,writes=0;
  const runner=createMemoryRefinement({db,clean:text=>text.trim(),isLocalNag:()=>privateNow,
    async api(path,body){
      if(body)writes++;
      const result=await api(path,body);
      if(path==='nags/closed/refine'&&++reads===2)privateNow=true;
      return result;
    },
    loadSkill:async name=>name==='memoryRefinement'?{skill:'memory-refinement',version:'1.0',content:'固定复审',schemas,localAi}:
      {version:'1.0',content:'现行格式'},
    model:{memory(){assert.fail('此用例应在调用模型前结束');}}
  });
  await runner.run(signal);
  assert.match(await runner.run(signal),/已停止远端修订/u);
  assert.equal(writes,0);
  assert.deepEqual(await api('nags/closed'),before);
  const row=db.prepare('SELECT active,data FROM memory_refinements').get();
  assert.equal(row.active,0);
  assert.equal(JSON.parse(row.data).cancelled,true);
});

test('拟稿断点、技能版本、丢失回执、追加与本机单任务归档',async t=>{
  const {api,sqlite}=fixture(t);
  await api('diaries',batch);await api('nags',nag);
  const folder=mkdtempSync(join(tmpdir(),'fy-refine-')),file=join(folder,'memory.sqlite');
  let db=new DatabaseSync(file),runner;
  t.after(()=>{db.close();rmSync(folder,{recursive:true,force:true});});
  let calls=[],posted=0,drop=true,abort=new AbortController(),failCache=true;
  const model={async memory(text,instruction,_schema,_signal,skill){
    assert.equal(skill.name,'memory-refinement');assert.equal(skill.version,'1.0');
    const input=JSON.parse(text);
    if(instruction.includes(localAi.plan)){calls.push('plan');return {organize:'把描述理顺',additions:'',format:''};}
    if(instruction.includes(localAi.draft)){
      calls.push('draft:'+input.part.id);
      return input.part.field==='body'?{text:input.part.text+'\n绯月后记：我看清了这一步。',note:'我补充了安装后的感受。'}:
        {text:input.part.text,note:''};
    }
    assert(instruction.includes(localAi.review));calls.push('review');
    if(!abort.signal.aborted)abort.abort();
    return {decision:'accept',part:'',reason:''};
  }};
  const setup=()=>createMemoryRefinement({db,model,clean:text=>text.trim(),
    cache(){if(failCache)throw Error('模拟本机归档失败');},
    async api(path,body){
      const result=await api(path,body);
      if(body){posted++;if(drop){drop=false;throw Error('模拟回执丢失');}}
      return result;
    },
    loadSkill:async name=>name==='memoryRefinement'?{skill:'memory-refinement',version:'1.0',content:'测试指引',schemas,localAi}:
      {version:'1.0',content:'现行格式'}
  });
  runner=setup();
  await assert.rejects(runner.run(abort.signal),{name:'AbortError'});
  assert.deepEqual(calls,['plan','draft:body-2','draft:summary-1','review']);
  assert.equal((await api(recordPath)).body,batch.body);
  const checkpoint=JSON.parse(db.prepare('SELECT data FROM memory_refinements WHERE active=1').get().data);
  assert.deepEqual(Object.keys(checkpoint.drafts),['body-1','body-2','summary-1']);
  assert.equal(checkpoint.drafts['body-1'].text,'你说：装好了。\n');
  db.close();db=new DatabaseSync(file);runner=setup();calls=[];
  await assert.rejects(runner.run(signal),/模拟回执丢失/);
  assert.deepEqual(calls,['review']);assert.equal(posted,1);
  await api('diaries',{...batch,batch:'after',body:'随后追加了一条。',threads:[]});
  await assert.rejects(runner.run(signal),/模拟本机归档失败/);
  assert.equal(db.prepare('SELECT count(*) AS count FROM memory_refinements WHERE active=1').get().count,1);
  failCache=false;
  assert.match(await runner.run(signal),/已修订日记/);
  assert.equal(posted,1);
  const historical=JSON.parse(db.prepare('SELECT data FROM memory_refinements WHERE active=0').get().data);
  assert.equal(historical.previous.body,batch.body);
  assert.match(historical.fields.body,/绯月后记/);
  assert.match(historical.note,/我补充/);
  assert(historical.receipt.refineDatetime);
  assert.equal(sqlite.prepare('SELECT revision FROM companion_nags').get().revision,1);
});

test('无改动只记检查结果，材料相同不重做，有新材料时重新核对',async t=>{
  const {api,advance}=fixture(t);
  await api('diaries',batch);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  let runs=0,sources=[];
  const runner=createMemoryRefinement({db,api,clean:text=>text.trim(),evidence:()=>sources,
    model:{memory:async()=>{runs++;return {organize:'',additions:'',format:''};}},
    loadSkill:async name=>name==='memoryRefinement'?{skill:'memory-refinement',version:'1.0',content:'测试指引',schemas,localAi}:
      {version:'1.0',content:'现行格式'}
  });
  assert.equal(await runner.run(signal),'本轮无改动');assert.equal(runs,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM memory_refinements').get().n,0);
  advance(refinementInterval);
  await runner.run(signal);await runner.run(signal);
  assert.equal(runs,1);
  sources=[{day:'2026-11-27',kind:'本机对话',snippet:'后来确认了配送日期。'}];
  await runner.run(signal);await runner.run(signal);
  assert.equal(runs,2);assert.equal((await api(refinePath)).receipt,null);
});

test('悬念状态推进版本时复用已复核正文，按新版本提交同一条',async t=>{
  const {api}=fixture(t);
  await api('diaries',batch);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  let modelCalls=0;
  const runner=createMemoryRefinement({db,api,clean:text=>text.trim(),
    loadSkill:async name=>name==='memoryRefinement'?{skill:'memory-refinement',version:'1.0',content:'测试指引',schemas,localAi}:
      {version:'1.0',content:'现行格式'},
    model:{async memory(text,instruction){
      modelCalls++;
      if(instruction.includes(localAi.plan))return {organize:'整理叙述',additions:'',format:''};
      if(instruction.includes(localAi.draft)){
        const {part}=JSON.parse(text);
        return part.field==='body'?{text:part.text+'\n绯月后记：我理解了。',note:''}:{text:part.text,note:''};
      }
      await api(recordPath+'/threads/1',{field:'asked'});
      return {decision:'accept',part:'',reason:''};
    }}
  });
  assert.match(await runner.run(signal),/记录版本已变化/);
  const before=JSON.parse(db.prepare('SELECT data FROM memory_refinements WHERE active=1').get().data);
  assert.equal(before.baseRevision,2);assert.equal(modelCalls,4);
  assert.match(await runner.run(signal),/已修订/);
  assert.equal(modelCalls,4);
  const after=await api(refinePath);
  assert.equal(after.record.revision,3);assert(after.record.threads[0].asked);
  assert.match(after.record.body,/绯月后记/);
  const archive=JSON.parse(db.prepare('SELECT data FROM memory_refinements WHERE active=0').get().data);
  assert.match(archive.note,/我补入了「绯月后记：我理解了。/);
});

test('修订轮询与启动时的手记核对错峰，仍沿用现有闲时调度',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'fy-refinement-poll-')),timers=new Map();
  let clock=Date.parse(at),busy=false,refined=0;
  const checks=createReminderChecks({profile,now:()=>clock,isBusy:()=>busy,
    setTimer(fn,ms){const key=Symbol();timers.set(key,{fn,at:clock+ms});return key;},clearTimer:key=>timers.delete(key),
    handlers:{diaryAudit:async signal=>{busy=true;await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
      busy=false;return {deferred:true};},refinement:async()=>{refined++;return '已完成';}}});
  t.after(()=>{checks.close();rmSync(profile,{recursive:true,force:true});});
  async function advance(ms){
    clock+=ms;
    for(const [key,timer] of [...timers])if(timers.has(key)&&timer.at<=clock){timers.delete(key);timer.fn();}
    await new Promise(resolve=>setImmediate(resolve));
  }
  checks.start();await advance(60000);assert(busy);
  await advance(600000);assert.equal(busy,false);assert.equal(refined,0);
  await advance(60000);assert.equal(refined,1);
});

test('单次推理含准备只有十五秒，超时保留原任务及已完成步骤',async t=>{
  const {api}=fixture(t);
  await api('diaries',batch);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  let calls=0;
  t.mock.method(AbortSignal,'timeout',ms=>{
    assert.equal(ms,15000);
    const deadline=new AbortController();
    if(calls)queueMicrotask(()=>deadline.abort());
    return deadline.signal;
  });
  const runner=createMemoryRefinement({db,api,clean:text=>text.trim(),
    loadSkill:async name=>name==='memoryRefinement'?{skill:'memory-refinement',version:'1.0',content:'测试指引',schemas,localAi}:
      {version:'1.0',content:'现行格式'},
    model:{async memory(){
      if(++calls===1)return {organize:'理顺原有描述',additions:'',format:''};
      return new Promise(()=>{});
    }}
  });
  await assert.rejects(runner.run(signal),{code:'LOCAL_AI_REFINEMENT_TIMEOUT'});
  const job=JSON.parse(db.prepare('SELECT data FROM memory_refinements WHERE active=1').get().data);
  assert.equal(job.plan.organize,'理顺原有描述');
  assert.equal(job.drafts['body-1'].text,'你说：装好了。\n');
  assert.equal((await api(refinePath)).receipt,null);
});
