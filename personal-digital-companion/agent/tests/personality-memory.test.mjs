import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {openTestDatabase} from './sqlite-d1.mjs';
import {personalityMemory} from '../assistant/personality-memory.mjs';
import {createPersonalityDiary,cleanMemory} from '../../desktop/personality-diary.mjs';
import {createPersonalityNags} from '../../desktop/personality-nags.mjs';
import {createMemoryPage} from '../host/memory-route.mjs';
import {handleCompanion} from '../host/subscriptions.mjs';
import {bucketFixture} from './txt-test-bucket.mjs';

import {fixture as screenFixture} from './screen-question-fixture.mjs';
import {attachScreenQuestion} from '../../desktop/screen-question-host.mjs';
import {createBalancedLocalModel} from '../../desktop/balanced-local-model.mjs';
import {memoryExpenses} from '../host/memory-expenses.mjs';
import {memorySources} from '../host/memory-sources.mjs';
import {readDiarySources} from '../../desktop/diary-sources.mjs';

const day='2026-11-20',start=Date.parse(day+'T12:00:00+09:00');
const packet={day,batch:'one',body:'老公说下午去书店。\n绯月私语：等他回来。',summary:'去书店',tags:['书店'],mood:'期待',weather:'无记录',threads:['买了哪本？']};
test('按东京日期读取个人日记和各项目部署明细，跨日与分页准确',async t=>{
  const {DB,sqlite,close}=openTestDatabase();t.after(close);
  sqlite.exec(`CREATE TABLE diaries(seq INTEGER PRIMARY KEY,regDatetime,title,content);
    CREATE TABLE garden_project(id,name); CREATE TABLE garden_deploy(id,deployed_at);
    CREATE TABLE garden_deploy_item(id INTEGER,deploy_id,project_id,flower_name,version_before,version_after,note);
    INSERT INTO garden_project VALUES(1,'花园'),(2,'绘图'); INSERT INTO garden_deploy VALUES(3,'2026-11-19T15:00:00Z');
    INSERT INTO garden_deploy_item VALUES(4,3,1,'版本记录','1','2','修复查询'),(5,3,2,'图片','2','3','改版');`);
  const insert=sqlite.prepare('INSERT INTO diaries VALUES(?,?,?,?)');
  for(let i=1;i<=21;i++)insert.run(i,'2026-11-20T23:59:59+09:00','书店','买书');
  insert.run(22,'2026-11-20T15:00:00Z','次日','不在当日');
  const env={mymaindb:DB};
  const first=await memorySources(env,{kind:'journal',day});
  assert.equal(first.records.length,20);
  assert.deepEqual((await memorySources(env,{kind:'journal',day,after:first.nextCursor})).records.map(r=>r.id),[21]);
  assert.deepEqual((await memorySources(env,{kind:'deploy',day})).records.map(r=>r.project),['花园','绘图']);
  await assert.rejects(memorySources(env,{kind:'journal',day:'2026-02-30'}));
});
test('三个可选来源的八种组合，消费退款、同日分页和部分来源失败',async()=>{
  const signal=new AbortController().signal;
  for(let mask=0;mask<8;mask++){
    const {items,errors}=await readDiarySources(async path=>{
      const q=new URLSearchParams(path.split('?')[1]),kind=q.get('kind');
      if(kind==='journal')return {records:mask&1?[{id:1,at:new Date(start).toISOString(),title:'我的日记',content:'读书'}]:[]};
      if(kind==='deploy')return {records:mask&2?[{id:1,at:new Date(start).toISOString(),project:'项目甲',note:'上线'}]:[]};
      assert.equal(q.get('from'),day);assert.equal(q.get('to'),day);
      return {records:mask&4?[{id:'P1',amount:-200,spendDate:day,description:'退款'}]:[],complete:true,nextCursor:q.get('cursor')?'':'next'};
    },day,signal);
    assert.deepEqual(errors,[]);assert.deepEqual(items.map(i=>i.label),['你的日记','花园部署','当日消费'].filter((_,i)=>mask&(1<<i)));
  }
  const {items,errors}=await readDiarySources(async path=>{
    if(path.includes('kind=journal'))throw Error('503');
    return path.startsWith('expenses')?{records:[{id:'p',spendDate:day,amount:5}],complete:false}:{records:[]};
  },day,signal);
  assert.equal(items.length,1);assert.equal(errors.length,2);
});
test('外部事实先参与定情绪，再按同一情绪写入；来源恢复只补缺项',async t=>{
  const {req}=fixture(t),profile=mkdtempSync(join(tmpdir(),'feiyue-diary-sources-'));
  const calls=[];let failed=true;
  const store=createPersonalityDiary({profile,now:()=>start,weather:()=>[],memory:{read:()=>[],readTasks:()=>[]},
    request:(url,options)=>{
      const path=url.slice('/api/memory/'.length);
      const q=new URLSearchParams(path.split('?')[1]);
      if(q.get('day')===day&&q.get('kind')==='journal')return Response.json({records:[{id:12,at:new Date(start).toISOString(),title:'还书',content:'今天读完了。'}]});
      if(q.get('day')===day&&q.get('kind')==='deploy')return failed?new Response(null,{status:503}):Response.json({records:[{id:13,at:new Date(start).toISOString(),note:'更新检索'}]});
      if(q.get('from')===day)return Response.json({records:[{id:'P',spendDate:day,amount:150}],complete:true});
      return req(path,options.body&&JSON.parse(options.body));
    },model:{memory:async(text,prompt,s)=>{
      const input=JSON.parse(text);calls.push([s.required,input]);
      if(s.required.includes('review'))return {review:'读到'+input.来源};
      if(s.required.length===1)return {mood:'牵挂'};
      return {text:'读到这件事，我记在心上。',summary:'手记',comment:'还惦记着。',tags:'生活',thread:''};
    }}});
  t.after(()=>{store.close();rmSync(profile,{recursive:true,force:true});});
  const run=()=>store.run('diary',new AbortController().signal);
  await assert.rejects(run,/花园部署读取失败/);
  const before=store.pages().find(p=>p.day===day);
  assert.equal(before.mood,'牵挂');assert.match(before.body,/【你的日记】/);assert.match(before.body,/【当日消费】/);assert.doesNotMatch(before.body,/花园部署/);
  const moodCall=calls.findIndex(([s])=>s.length===1&&s[0]==='mood');
  assert.equal(calls[moodCall][1].当时的评价.length,2);
  assert(calls.slice(moodCall+1).filter(([s])=>s.includes('comment')).every(([,i])=>i.基础情绪==='牵挂'));
  failed=false;await run();const after=store.pages().find(p=>p.day===day);
  assert(after.body.startsWith(before.body));assert.match(after.body,/【花园部署】/);
  const count=calls.length;await run();assert.equal(calls.length,count);
});
function fixture(t){
  const {DB,sqlite,close}=openTestDatabase();t.after(close);
  sqlite.exec(readFileSync(new URL('../migrations/016-personality-memory.sql',import.meta.url),'utf8'));
  const req=(path,body,owner='me')=>/^(expenses|sources)\?/.test(path)?Response.json({records:[],complete:true}):personalityMemory(new Request('https://unit.test/api/memory/'+path,body?{method:'POST',body:JSON.stringify(body)}:{}),{DB},owner);
  return {DB,sqlite,req};
}
test('并发重传只追加一次，5000 字按字符计，检索只看篇首，账户隔离',async t=>{
  const {req}=fixture(t);
  const responses=await Promise.all(Array.from({length:4},()=>req('diaries',packet)));
  assert(responses.every(r=>r.ok));
  assert.equal((await (await req('diaries/'+day+'.1')).json()).body,packet.body);
  assert.equal((await req('diaries',{...packet,body:'变化'})).status,409);
  const large={...packet,body:'🌙'.repeat(5000),batch:'two'};
  assert.equal((await (await req('diaries',large)).json()).part,2);
  const next=await (await req('diaries',{...packet,batch:'three'})).json();assert.equal(next.part,3);
  assert.equal((await req('diaries',{...packet,body:'🌙'.repeat(5001)})).status,400);
  const index=await (await req('diaries?q=@%23书店')).json();assert.equal(index.items.length,3);assert(!('body' in index.items[0]));assert(!('threads' in index.items[0]));
  assert.equal((await (await req('diaries?q=等他回来')).json()).total,0);
  assert.equal((await req('diaries/'+day+'.1',null,'other')).status,404);
});
test('补评和日记共用有效正文，历史与新空正文都跳过，重复扫描保留结果',async t=>{
  const {req}=fixture(t),profile=mkdtempSync(join(tmpdir(),'feiyue-empty-clean-'));
  const tasks=[
    {at:start,task_id:'a',title:'提醒',action:'已核实顺延',detail:'明天交书'},
    {at:start+1,task_id:'a',title:'提醒',action:'云端已确认收到本机执行结果',detail:''},
    {at:start+2,task_id:'b',title:'画图',action:'已完成',detail:'画好一只猫'},
    {at:start+4,task_id:'a',title:'提醒',action:'已核实工时',detail:'读书一小时'},
    {at:start+5,task_id:'c',title:'缺少正文的旧记录',action:'已完成',detail:''},
  ];
  const inspected=[];
  const signal=new AbortController().signal;
  const store=createPersonalityDiary({profile,now:()=>start+5,weather:()=>[],
    memory:{archiveDays:async()=>[day],readTasks:async d=>d===day?tasks:[],
      read:async d=>d===day?[{at:start+3,id:'chat',question:'明天一起还书',text:'我记下了。'}]:[]},
    model:{memory:async (text,_prompt,s)=>{
      if(!s.required.includes('review'))return {text:'今天记下这件事。',comment:'我会留心。',summary:'手记',mood:'平静',tags:'',thread:''};
      inspected.push(text);
      return text.includes('云端已确认')?{text:' \n　',review:''}:{text,review:'记好这件事'};
    }},
    request:(url,options)=>req(url.slice('/api/memory/'.length),options.body&&JSON.parse(options.body))});
  const db=new DatabaseSync(join(profile,'personality-memory.sqlite'));
  t.after(()=>{db.close();store.close();rmSync(profile,{recursive:true,force:true});});
  const old=tasks[0],source='task:a',content=[old.title,old.action,old.detail].join(' · ');
  const id=createHash('sha256').update([day,source,old.at,0,content].join('|')).digest('hex');
  db.prepare('INSERT INTO materials VALUES(?,?,?,0)').run(id,day,'旧评价：明天要还书');
  db.prepare('INSERT INTO material_sources VALUES(?,?,?)').run(id,source,old.at);
  db.prepare('INSERT INTO cleaned VALUES(?,?)').run(id,'　 ');
  const missing=tasks.at(-1);
  const missingId=createHash('sha256').update([day,'task:c',missing.at,0,[missing.title,missing.action,missing.detail].join(' · ').trim()].join('|')).digest('hex');
  db.prepare('INSERT INTO materials VALUES(?,?,?,0)').run(missingId,day,'旧评价没有清洗记录');
  assert.match(await store.run('task-review',signal),/已有 0 条评价，补写 2 条执行评价，空正文跳过 3 条/);
  assert.match(await store.run('task-review',signal),/已有 2 条评价，补写 0 条执行评价，空正文跳过 3 条/);
  assert.equal(inspected.length,3);
  assert.equal(db.prepare('SELECT count(*) AS n FROM materials').get().n,4);
  assert.equal(db.prepare('SELECT count(*) AS n FROM material_sources').get().n,3);
  assert.equal(db.prepare('SELECT content FROM cleaned WHERE id=?').get(id).content,'　 ');
  assert.match(await store.run('review',signal),/补写 1 条行动评价/);
  assert.match(await store.run('review',signal),/补写 0 条行动评价/);
  assert.equal((await (await req('diaries')).json()).total,0);
  await store.run('diary',signal);
  const page=await (await req('diaries/'+day+'.1')).json();
  for(const fact of ['画好一只猫','读书一小时','明天一起还书','我记下了。'])assert.ok(page.body.includes(fact),fact);
  for(const skipped of ['明天交书','旧评价：明天要还书','云端已确认收到','缺少正文的旧记录'])assert.ok(!page.body.includes(skipped),skipped);
  assert.equal(page.revision,3);
  assert.match(await store.run('diary',signal),/本轮上传 0 段/);
  assert.equal((await (await req('diaries/'+day+'.1')).json()).revision,3);
  assert.equal(inspected.length,4);
});
test('清洗字段缺失或有正文无评价时可重试，明确空正文不会保存模型附带的评价',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-review-retry-'));
  const answers=[{review:'只返回评价'},{text:'生成了图片',review:'　'},{text:'',review:'完成了'}];
  const store=createPersonalityDiary({profile,
    memory:{archiveDays:()=>[day],readTasks:()=>[{at:start,task_id:'a',title:'画图',action:'已完成'}]},
    model:{memory:async()=>answers.shift()}});
  const db=new DatabaseSync(join(profile,'personality-memory.sqlite'));
  t.after(()=>{db.close();store.close();rmSync(profile,{recursive:true,force:true});});
  const run=()=>store.run('task-review',new AbortController().signal);
  await assert.rejects(run,/缺少清洗正文/);
  await assert.rejects(run,/行动评价为空/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM cleaned').get().n,0);
  for(let i=0;i<2;i++)assert.match(await run(),/已有 0 条评价，补写 0 条执行评价，空正文跳过 1 条/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM materials').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM material_sources').get().n,0);
});
test('已问和已解独立；旧正文与私语原样保留',async t=>{
  const {req}=fixture(t);
  await req('diaries',packet);
  const path='diaries/'+day+'.1';
  await req(path+'/threads/1',{field:'asked'});
  const first=await (await req(path)).json();assert.deepEqual(first.threads,[{no:1,text:'买了哪本？',asked:true,resolved:false}]);
  await req(path+'/threads/1',{field:'resolved'});
  const after=await (await req(path)).json();assert(after.threads[0].resolved);assert.equal(after.body,packet.body);
  assert.equal((await req(path+'/threads/2',{field:'resolved'})).status,404);
});
test('写接口返回成功但独立读回缺段时，保留原草稿和未覆盖状态，恢复后只追加一次',async t=>{
  const {req}=fixture(t),profile=mkdtempSync(join(tmpdir(),'feiyue-readback-'));
  let wrong=true;
  const signal=new AbortController().signal;
  const store=createPersonalityDiary({profile,now:()=>start,weather:()=>[],
    memory:{read:async()=>[],readTasks:async d=>d==='2026-11-19'?[{task_id:'audit',at:start-86400000,title:'归还图书',action:'已完成'}]:[]},
    model:{memory:async (_t,_p,s)=>s.required.includes('review')?{text:'归还图书',review:'记得及时还书'}:{text:'已经还书。',comment:'松了口气。',summary:'还书',tags:'',mood:'放心',thread:''}},
    request:async(url,opts)=>{
      const response=await req(url.slice('/api/memory/'.length),opts.body&&JSON.parse(opts.body));
      if(wrong&&opts.method==='GET'&&url.endsWith('/2026-11-19.1'))return Response.json({...await response.json(),body:'同一天的其他事情'});
      return response;
    }});
  const db=new DatabaseSync(join(profile,'personality-memory.sqlite'));
  t.after(()=>{db.close();store.close();rmSync(profile,{recursive:true,force:true});});
  await assert.rejects(store.run('diary',signal),/云端正文未找到/);
  assert.equal(db.prepare("select count(*) n from drafts where day='2026-11-19'").get().n,1);
  assert.equal(db.prepare('select sum(covered) n from materials').get().n,0);
  wrong=false;await store.run('diary',signal);
  assert.equal(db.prepare('select count(*) n from drafts').get().n,0);
  assert.equal(db.prepare('select sum(covered) n from materials').get().n,1);
  assert.equal((await (await req('diaries/2026-11-19.1')).json()).revision,1);
});
test('离线草稿恢复，空日记复用；跨日后续与旧篇标记；读取错误不写空篇',async t=>{
  const {req}=fixture(t),profile=mkdtempSync(join(tmpdir(),'feiyue-diary-test-'));

  let offline=true,failedDay='',turns=[{id:'q1',at:start-3*86400000,state:'answer',question:'下午去书店',text:'回来告诉我吧'}];
  const model={memory:async(text,_,schema)=>{
    const keys=schema.required;
    if(keys.includes('review'))return {review:'记得约定',text};
    if(keys.includes('match'))return {match:text.includes('买了散文集')?'1':'0',text:'老公买了散文集。',comment:'书名记好了。'};
    return {text:'记下今天的事。',comment:'我会记得。',summary:'书店约定',tags:'书店',mood:'期待',thread:text.includes('下午去书店')?'买了哪本？':''};
  }};
  const options={profile,model,now:()=>start,weather:()=>[],memory:{read:async d=>{
    if(d===failedDay)throw Error('归档打不开');
    return turns.filter(r=>new Date(r.at+32400000).toISOString().startsWith(d));
  },readTasks:async()=>[]},request:async(path,options)=>{if(offline)throw Error('离线');return req(path.slice('/api/memory/'.length),options.body&&JSON.parse(options.body));}};
  let store=createPersonalityDiary(options);const signal=new AbortController().signal;
  await assert.rejects(store.run('diary',signal),/离线/);store.close();
  offline=false;store=createPersonalityDiary(options);t.after(()=>{store.close();rmSync(profile,{recursive:true,force:true});});
  await store.run('diary',signal);
  const old=(await (await req('diaries/2026-11-17.1')).json()).body;
  turns.push({at:start,id:'q2',state:'answer',question:'我买了散文集',text:'知道啦'});
  assert.match(await store.run('diary',signal),/已同步 [1-9]\d* 段绯月的手记/);
  assert.match(await store.run('diary',signal),/没有需要补写的内容/);
  const prior=await (await req('diaries/2026-11-17.1')).json();
  assert.equal(prior.body,old);assert(prior.threads[0].resolved);
  const today=await (await req('diaries/'+day+'.1')).json();assert(today.body.includes('接 2026-11-17 的悬念'));assert.equal(today.revision,3);
  assert.equal((await (await req('diaries/2026-11-19.1')).json()).body,'无所事事的一天');
  assert.equal((await (await req('diaries')).json()).total,7);
  failedDay='2026-11-19';await assert.rejects(store.run('diary',signal),/归档打不开/);
});
test('一轮一件、两日消费与相邻周；超时续同条、意外中断、按钮结束及用尽回合',async t=>{
  const {req}=fixture(t);let at=start,session;
  const raw=[['y','2026-11-19',3500],['high','2026-11-20',9000],['old','2026-11-18',99999],['prior','2026-11-08',7000],['refund',day,-10000]];
  const local=new Map(),schedule=new Map(),signal=new AbortController().signal;
  const store={nags:()=>[...local.values()].map(structuredCloneSafe),pages:()=>[],mark:(k,v)=>schedule.set(k,v),last:k=>schedule.get(k),
    saveNag:n=>{n.revision++;local.set(n.id,structuredClone(n));},syncNags:async()=>{},
    api:async()=>({records:raw.map(([id,spendDate,amount])=>({id,spendDate,amount,category:'图书'})),complete:true}),
    think:async(_d,_p,keys)=>keys.includes('question')?{question:'这笔是买什么呀？',evaluation:'惦记这笔消费',mood:'担心'}:{reply:'原来如此。',next:'还有后续吗？',evaluation:'听到了理由',mood:'释然'}};
  function structuredCloneSafe(r){return structuredClone(r);}
  const n=createPersonalityNags({store,now:()=>at,random:()=>0,idle:()=>true,show:async s=>{session=s;s.visible();return true;}});t.after(()=>n.close());
  await n.poll(signal);let current=n.pending();assert.equal(current.source_id,'high');assert(current.stats.includes('2 笔、103499 日元'));assert(current.stats.includes('1 笔、7000 日元'));
  session.leave('idle');assert.equal(n.pending().status,'等待回应');
  at+=7200000;await n.poll(signal);assert.equal(n.pending().id,current.id);
  session.leave('interrupted');await n.poll(signal);session.leave('interrupted');await n.poll(signal);
  assert.equal(n.pending().interruptions,2);assert(session.prompt.includes('一起说完'));session.leave('button');
  current=[...local.values()][0];assert.equal(current.status,'用户结束');assert.equal(current.talk.at(-1).text,'老公闷闷的不理我了');
  assert((await req('nags',current)).ok);assert.equal((await req('nags',{...current,revision:99,status:'提问中'})).status,409);
  assert.equal((await req('nags',{...current,id:'duplicate'})).status,409);
  at+=7200000;await n.poll(signal);assert.equal(n.pending().source_id,'y');
  for(let i=0;i<3;i++){const reply=await session.reply('买了一本书');reply.shown?.();}
  assert.equal(n.pending(),undefined);const end=[...local.values()].at(-1);assert.equal(end.status,'回合结束');assert.equal(end.questions,3);assert(end.remaining);assert(!end.talk.some(l=>l.text==='老公闷闷的不理我了'));
});
test('网页只读，列表和详情经身份接线，拒绝跨来源改写',async t=>{
  const {DB}=fixture(t),env={COMPANION_ENABLED:'true',COMPANION_DB:DB,COMPANION_HOST:{}};
  env.SUBSCRIPTIONS_API={fetchOwner:(r,owner)=>handleCompanion(r,env,owner,true)};
  const route=createMemoryPage({shell:s=>s,authorize:()=>({sub:'owner'}),script:'',style:''});
  const url='https://unit.test/api/companion/memory/diaries';
  assert.equal((await route(new Request(url,{method:'POST'}),env)).status,405);
  const write=()=>new Request(url,{method:'POST',body:JSON.stringify(packet)});
  assert.equal((await handleCompanion(write(),env,{id:'owner',role:'owner'},false)).status,403);
  assert.equal((await handleCompanion(write(),env,{id:'bot:desktop',role:'bot'},false)).status,200);
  assert.equal((await route(new Request(url),{...env,ALLOWED_OWNER_SUBS:'owner,another'})).status,403);
  assert.equal((await route(new Request(url),{...env,ALLOWED_OWNER_SUBS:'another'})).status,403);
  const sourceUrl=url.replace('/diaries','/sources?kind=journal&day='+day);
  env.COMPANION_HOST.memorySources=async q=>({records:[{title:q.day}],nextCursor:null});
  assert.equal((await handleCompanion(new Request(sourceUrl),env,{id:'owner',role:'owner'},false)).status,403);
  assert.equal((await handleCompanion(new Request(sourceUrl),env,{id:'owner'},true)).status,404);
  const privateRead=await handleCompanion(new Request(sourceUrl),env,{id:'bot:desktop',role:'bot'},false);
  assert.equal(privateRead.status,200);assert.equal((await privateRead.json()).records[0].title,day);
  assert.equal((await (await route(new Request(url),env)).json()).total,1);
  const both=await route(new Request('https://unit.test/companion/memory/'),env);assert((await both.text()).includes('id="origin"'));
  const denied=createMemoryPage({shell:s=>s,authorize:()=>null});assert.equal((await denied(new Request(url),env)).status,403);
});

test('绯月以桌宠身份上传并关联日记及唠叨 TXT，只读详情区分已有和空附件',async t=>{
  const {DB,sqlite}=fixture(t),myMainStorage=bucketFixture();
  sqlite.exec(`CREATE TABLE txt_record_files(subject TEXT,id TEXT,object_key TEXT,name TEXT,bytes INTEGER,charset TEXT,PRIMARY KEY(subject,id))`);
  const env={COMPANION_ENABLED:'true',COMPANION_DB:DB,COMPANION_HOST:{},mymaindb:DB,myMainStorage};
  env.SUBSCRIPTIONS_API={fetchOwner:(r,owner)=>handleCompanion(r,env,owner,true)};
  const page=createMemoryPage({shell:s=>s,authorize:()=>({sub:'owner'})});
  const origin='https://unit.test',base=origin+'/api/companion/memory/';
  const read=path=>page(new Request(base+path),env);
  const post=(path,body,role='bot')=>handleCompanion(new Request(base+path,{method:'POST',body}),env,{id:'fixture',role},false);
  const note='模拟完整原文',id='1'.repeat(32),marker='〔附件原文 '+id+'〕';
  const nag={id:'txt-test',source:'curiosity',source_id:'fixture',revision:1,title:'测试唠叨',reason:'验证附件',
    created_at:new Date(start).toISOString(),status:'已解释',mood:'好奇',talk:[{who:'你',text:marker,at:new Date(start).toISOString()}]};
  assert.equal((await post('diaries',JSON.stringify(packet))).status,200);
  assert.equal((await post('nags',JSON.stringify({...nag,id:'no-file',source_id:'fixture-empty'}))).status,200);
  const upload=()=>{const form=new FormData();form.set('file',new File([note],'原文.txt'));return form;};
  for(const [kind,recordId] of [['diaries',day+'.1'],['nags',nag.id]]){
    const path=kind+'/'+recordId;
    assert.equal((await post(path+'/original',upload(),'owner')).status,403);
    assert.equal((await page(new Request(base+path+'/original',{method:'POST',body:upload()}),env)).status,405);
    const staged=await post(path+'/original',upload());assert.equal(staged.status,200);
    const {hash}=await staged.json(),head={hash,ids:[id]};
    assert.equal((await read(path+'/original')).status,404);
    const submission=kind==='diaries'?{...packet,batch:'txt-test',body:marker,txtUpdate:{part:1,revision:1,head}}:{...nag,automaticTxt:head};
    assert.equal((await post(kind,JSON.stringify(submission))).status,200);
    assert.deepEqual((await (await read(path)).json()).automaticTxt,head);
    assert.equal(await (await read(path+'/original')).text(),note);
    await myMainStorage.put(path,new TextEncoder().encode(note));
    sqlite.prepare('INSERT INTO txt_record_files VALUES (?,?,?,?,?,?)')
      .run(JSON.stringify(['owner',kind,recordId]),'fixture',path,'已附.txt',new TextEncoder().encode(note).length,'utf-8');
    const detail=await (await read(kind+'/'+(kind==='diaries'?day+'.01':recordId))).json();
    assert.deepEqual(detail.txtFiles.map(file=>[file.id,file.name]),[['fixture','已附.txt']]);
    assert.equal(await (await read(path+'/txt?file=fixture')).text(),note);
  }
  assert.deepEqual((await (await read('nags/no-file')).json()).txtFiles,[]);
  assert.equal((await read('nags/no-file/txt?file=fixture')).status,404);
  assert(!(await (await read('diaries')).json()).items.some(r=>'txtFiles' in r));
});

test('气泡真实入口只在显示后记已问，闲置、Esc 和结束按钮传达不同原因',async t=>{
  const f=screenFixture();f.electron.BrowserWindow.prototype.isVisible=function(){return this.visible;};
  const profile=mkdtempSync(join(tmpdir(),'feiyue-bubble-'));
  const host=attachScreenQuestion(f.electron,{win:f.win,history:f.history,root:'.',bundle:'.',profile});
  t.after(()=>{host.close();rmSync(profile,{recursive:true,force:true});});
  const seen=[],signal=new AbortController().signal;
  const session={prompt:'这本书喜欢吗？',signal,visible:()=>seen.push('shown'),leave:r=>seen.push(r),reply:async()=>({text:'知道了。',done:true})};
  for(const [args,why] of [[{reason:'idle',draft:{text:''}},'idle'],[{reason:'interrupted'},'interrupted'],[{reason:'button'},'button']]){
    assert(await host.showNag(session));assert(!await host.showNag(session));
    assert(host.panel.sent.some(([channel,v])=>channel==='screen-qa:changed'&&v.nag===true));
    f.ipcMain.emit('screen-qa:close',f.event(host.panel),args);
    assert.deepEqual(seen.splice(0),['shown',why]);
  }
  assert(await host.showNag(session));
  const reply=await f.handlers.get('screen-qa:ask')(f.event(host.panel),{text:'喜欢。'});
  assert.equal(reply.text,'知道了。');f.ipcMain.emit('screen-qa:close',f.event(host.panel),{reason:'button'});assert.deepEqual(seen,['shown']);
});
test('先处理今天再补出旧篇，仍能按序号追到两条旧悬念；来源错误不占空日记',async t=>{
  const {req}=fixture(t),profile=mkdtempSync(join(tmpdir(),'feiyue-follow-'));
  const store=createPersonalityDiary({profile,now:()=>start,weather:()=>[],memory:{read:async d=>{
    if(d==='2026-11-19')throwErrorIfUnavailable();
    if(!['2026-11-17',day].includes(d))return [];
    return [{id:d,at:d===day?start:start-3*86400000,question:d===day?'书到了。':'书何时到？',text:'记住了。'}];
  },readTasks:async()=>[]},model:{memory:async(text,_p,schema)=>{
    if(schema.required.includes('review'))return {review:'记住约定',text};
    if(schema.required.includes('match'))return {match:'1',text:'今天已到。',comment:'安心了。'};
    return {text:'记下约定。',summary:'书',tags:'书',mood:'期待',comment:'我惦记着。',thread:text.includes('何时到')?'书何时到？':''};
  }},request:(path,options)=>req(path.slice('/api/memory/'.length),options.body&&JSON.parse(options.body))});
  t.after(()=>{store.close();rmSync(profile,{recursive:true,force:true});});
  let unavailable=true;function throwErrorIfUnavailable(){if(unavailable)throw Error('记录盘无法读取');}
  const sig=new AbortController().signal;await assert.rejects(store.run('diary',sig));assert.equal((await (await req('diaries')).json()).total,0);
  await req('diaries',{...packet,day:'2026-11-16',threads:['收到了吗？']});
  unavailable=false;await store.run('diary',sig);
  for(const d of ['2026-11-16','2026-11-17'])assert((await (await req('diaries/'+d+'.1')).json()).threads[0].resolved);
  const today=await (await req('diaries/'+day+'.1')).json();assert(today.body.includes('接 2026-11-17 的悬念'));
});
test('消费 RPC 复用同一 owner 的 GET 处理函数，保留快照游标和覆盖缺口',async()=>{
  const deps={createContext:()=>({cfg:{},with:({owner})=>({owner})}),configuredOwners:()=>[{ownerId:'owner-A'}],
    getExpenses:(ctx,req,_m,url)=>{
      assert.equal(ctx.owner.ownerId,'owner-A');assert.equal(req.method,'GET');assert.equal(url.pathname,'/api/v1/expenses');
      assert.equal(url.searchParams.get('cursor'),'page2');return {data:{records:[],coverage:{complete:false},nextCursor:null}};
    }};
  const q={from:'2026-11-06',to:day,cursor:'page2'};
  assert.deepEqual(await memoryExpenses({},q,deps),{records:[],complete:false,nextCursor:null});
  await assert.rejects(memoryExpenses({},q,{...deps,configuredOwners:()=>[]}));
  await assert.rejects(memoryExpenses({},{...q,from:'2026-10-01'},deps));
});

test('手记评价只保留有原文支持的动机和受赠关系，失据时仍有绯月自己的评价',async t=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-attribution-'));let review;
  const store=createPersonalityDiary({profile,model:{memory:async()=>({review})}});
  t.after(()=>{store.close();rmSync(profile,{recursive:true,force:true});});
  const evaluate=async record=>(await store.think(JSON.stringify({来源:'你的日记',记录:record}),'写感受',['review'],new AbortController().signal,{name:'diary-writing'})).review;
  review='他特意为我挑了一本书，肯定是想让我开心。';
  assert.doesNotMatch(await evaluate('买了一本散文集。'),/特意|为我|肯定/);
  review='送给朋友的书选好了，我也替你高兴。';assert.equal(await evaluate('这是送给朋友的书。'),review);
  review='我很好奇哪篇最吸引你。';assert.equal(await evaluate('买了一本散文集。'),review);
});
test('凭据、代码和错误堆栈从材料中清理，保留用户纠正',()=>{
  const text=cleanMemory('你昨天说错了，书是送朋友的。\nconst fake = 123;\n```js\nconsole.log(123)\n```\n密码：示例口令，记下修正。');
  assert(text.includes('书是送朋友的'));assert(text.includes('记下修正'));assert(!/fake|console|示例口令/.test(text));
  assert.equal(cleanMemory('密码：“示例 后半段”，决定买书。'),'〔凭据略〕，决定买书。');
});

test('按清洗结果和固定段尾入册，归档根目录缺失时不产生空篇，旧念叨草稿可补传',async t=>{
  const {req}=fixture(t),profile=mkdtempSync(join(tmpdir(),'feiyue-material-'));
  const memory={root:join(profile,'missing'),read:async d=>d===day?[{id:'turn',at:start,question:'嗯嗯，散纹集',text:'我之前说错了。'}]:[],readTasks:async()=>[]};
  const mood='🌙'.repeat(50),signal=new AbortController().signal;
  const model={memory:async (_text,_job,schema)=>schema.required.includes('review')
    ?{review:'记住这次纠正',text:'你说：散文集\n绯月当时回复：我之前说错了。'}
    :{text:'记下书名。',comment:'我会记住。',summary:'书名',tags:'书',mood,thread:''}};
  const store=createPersonalityDiary({profile,memory,model,weather:()=>[],now:()=>start,
    request:(path,options)=>req(path.slice('/api/memory/'.length),options.body&&JSON.parse(options.body))});
  t.after(()=>{store.close();rmSync(profile,{recursive:true,force:true});});
  await assert.rejects(store.run('diary',signal),{code:'ENOENT'});
  assert.equal((await (await req('diaries')).json()).total,0);
  memory.root=profile;
  await store.run('diary',signal);
  const page=await (await req('diaries/'+day+'.1')).json();
  assert.equal(page.body,'你说：散文集\n绯月当时回复：我之前说错了。\n记下书名。\n当时的评价：记住这次纠正\n绯月私语：我会记住。');
  assert.equal(Array.from((await store.think('心情','记录情绪',['mood'],signal)).mood).length,40);
  store.saveNag({id:'legacy',revision:0,source:'paylog',source_id:'P1',source_day:day,title:'书店',reason:'大额消费',mood,
    created_at:new Date(start).toISOString(),status:'等待回应',talk:[{at:new Date(start).toISOString(),who:'绯月',text:'买书了吗？'}]});
  await store.syncNags(signal);
  const local=store.nags().find(n=>n.id==='legacy');
  local.localInitiativeRound='private-round';store.saveNag(local);await store.syncNags(signal);
  const published=await (await req('nags/legacy')).json();
  assert.equal(published.mood,'🌙'.repeat(40));assert.equal(published.localInitiativeRound,undefined);
  const updated=await req('nags',{...published,revision:published.revision+1,status:'用户结束'});assert.equal(updated.ok,true);
  await store.refresh(signal);
  const refreshed=store.nags().find(n=>n.id==='legacy');
  assert.equal(refreshed.status,'用户结束');assert.equal(refreshed.localInitiativeRound,'private-round');
});
test('气泡没显示不登记，候选先排除已问和退款，再从金额前五和悬念中随机选一件',async()=>{
  const records=Array.from({length:9},(_,i)=>({id:'P'+i,spendDate:day,amount:9000-i*100,description:'书'+i,category:'图书'}));
  records[1].description='退款';records[2].spendDate='2026-11-18';
  const archive=[{id:'done',source:'paylog',source_id:'P0',status:'已解释'}];
  let displayed=false,stored=0;
  const s={nags:()=>archive,handledThread:()=>false,pages:()=>[{day,part:1,threads:[{no:1,text:'已问',asked:true},{no:2,text:'待问',asked:false,resolved:false}]}],
    last:()=>null,mark(){},saveNag(n){stored++;n.revision++;},syncNags:async()=>{},think:async()=>({question:'书买好了？',evaluation:'惦记着',mood:'好奇'}),
    api:async()=>({records,nextCursor:null,complete:false})};
  let opened;
  const n=createPersonalityNags({store:s,idle:()=>true,now:()=>start,random:()=>0.999,show:async session=>{opened=session;if(displayed)session.visible();return displayed;}});
  await n.poll(new AbortController().signal);assert.equal(stored,0);
  const original=s.saveNag;s.saveNag=r=>{original(r);archive.push(structuredClone(r));};
  displayed=true;await n.poll(new AbortController().signal);
  assert.equal(archive.at(-1).source_id,'P7');assert(archive.at(-1).stats.includes('资料不全'));assert.equal(stored,1);
  opened.leave('idle');await n.close();
});
test('等待期间留下解释但推理中断，恢复后用已存原话收尾',async()=>{
  const n={id:'test',source:'paylog',source_id:'1',status:'意外中断',revision:3,turns:1,questions:1,interruptions:1,next:'买了什么？',mood:'好奇',
    talk:[{who:'绯月',text:'买了什么？'},{who:'你',text:'一本书。'}]};
  let saved;
  const s={nags:()=>[n],last:()=>null,saveNag:r=>{saved=r;},syncNags:async()=>{},think:async text=>{
    assert(text.includes('一本书。'));return {next:'',evaluation:'明白用途了。',reply:'记下了。',mood:'开心'};
  }};
  const engine=createPersonalityNags({store:s,idle:()=>true,show:()=>assert.fail('重复弹出旧问题')});
  await engine.poll(new AbortController().signal);assert.equal(saved.status,'已解释');assert.equal(saved.afterEvaluation,'明白用途了。');await engine.close();
});

test('记忆锁定 Aggressive 9B，显存不足走 CPU，前台对话抢占后回到普通模型',async()=>{
  const started=Promise.withResolvers(),chosen=[];
  const model=createBalancedLocalModel({modelPath:'models/base.gguf',readGpu:async()=>({freeMiB:100,utilization:99}),
    create:({modelPath,device})=>{
      chosen.push([modelPath,device]);
      return {start:async()=>{},close:async()=>{},snapshot:()=>({state:'ready',model:modelPath,backend:device}),
        analyze:async(_input,{hint,signal})=>{
          if(hint!=='personalityMemory')return {kind:'chat',reply:'我在。'};
          started.resolve();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('已让出')),{once:true}));
        }};
    }});
  const waiting=model.memory('旧事','提取信息',{},new AbortController().signal);
  await started.promise;
  const checked=assert.rejects(waiting);
  const reply=await model.analyze('你好',{hint:'auto'});await checked;
  assert.equal(reply.reply,'我在。');assert.match(chosen[0][0],/9B-Uncensored-HauhauCS-Aggressive/);assert.equal(chosen[0][1],'cpu');assert.match(chosen[1][0],/0.8B/);await model.close();
});
