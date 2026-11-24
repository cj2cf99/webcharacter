import test from 'node:test';
import {bucketFixture} from './txt-test-bucket.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openTestDatabase} from './sqlite-d1.mjs';
import {createPersonalityDiary} from '../../desktop/personality-diary.mjs';
import {createPersonalityNags} from '../../desktop/personality-nags.mjs';
import {personalityMemory} from '../assistant/personality-memory.mjs';
import {fixture as screenFixture} from './screen-question-fixture.mjs';
import {attachScreenQuestion} from '../../desktop/screen-question-host.mjs';
import {createDesktopTasks} from '../../desktop/task-lifecycle.mjs';
import {createReminderChecks} from '../../desktop/reminder-checks.mjs';

const start=Date.parse('2026-11-21T12:00:00+09:00'),minute=60_000;
const signal=new AbortController().signal;
async function fixture(t,{withTaskRuntime=false}={}){
  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(readFileSync(new URL('../migrations/016-personality-memory.sql',import.meta.url),'utf8'));
  const myMainStorage=bucketFixture();
  const req=(path,options)=>personalityMemory(new Request('https://test/api/memory/'+path,options),{DB,myMainStorage},'fixture');
  const post=(path,body)=>req(path,{method:'POST',body:JSON.stringify(body)});
  async function diary(day,body,batch='one'){
    assert((await post('diaries',{day,batch,body,summary:body.slice(0,60),mood:'好奇',tags:[],weather:'晴',threads:[]})).ok);
  }
  await diary('2026-11-21','花园部署在周三首次上线。');
  await diary('2026-11-15','同一版花园部署在周一首次上线。');
  await diary('2026-11-14','窗口之外的内容。');
  const profile=mkdtempSync(join(tmpdir(),'feiyue-audit-'));
  const f={time:start,busy:false,show:true,complete:false,found:true,explained:false,generated:0,calls:[],requests:[],notices:[]};
  const model={memory:async(input,_prompt,s,_signal,skill)=>{
    if(skill.name==='original-summary')return {text:input.includes('周一是测试环境')?'周一是测试环境':'回答片段'};
    if(s.required.includes('evaluation')){
      if(f.failBasic)throw Error('回答推理中断');
      return {reply:'我记下来了。',evaluation:'已经明白了。',mood:'释然',next:''};
    }
    assert.equal(skill.name,'diary-audit');
    if(['extract','compare','verify'].includes(skill.stage))assert.equal(skill.aiBudget,undefined);
    const data=JSON.parse(input);f.calls.push(data);
    if(s.required.includes('a'))return {a:data.slice(0,36),b:'',c:''};
    if(s.required.includes('score')){
      f.generated++;assert(data.every(r=>r.page>='2026-11-15'));
      f.compareEntered?.resolve();
      await f.holdCompare;
      return {score:f.found?'5':'0',refs:data.length>1?'1,2':'1',summary:'同一版首次上线日期不一致',points:'周三与周一不能同时是首次上线',question:'首次上线是哪天？',keywords:'花园,上线'};
    }
    if(s.required.includes('keep')){
      f.verifyEntered?.resolve();
      await f.holdVerify;
      if(f.verifyTimeout)throw Object.assign(Error('本机推理超时'),{code:'LOCAL_AI_TIMEOUT'});
      if(f.verifyOutputLimit)throw Object.assign(Error('本机输出超限'),{code:'LOCAL_AI_OUTPUT_BUDGET'});
      assert(data.本机线索.some(r=>r.snippet.includes('仅本地检索的材料')));
      return {keep:f.explained?'0':'1',question:'首次上线是哪天？'};
    }
    if(s.required.includes('keywords'))return {keywords:'花园'};
    if(s.required.includes('complete')){
      f.replyEntered?.resolve();
      await f.holdReply;
      return {complete:f.complete?'1':'0',next:f.follow??(data.问答.length===2?'哪天完成验收？':'哪天收到回执？')};
    }
    if(s.required[0]==='text'&&data.回答片段)return {text:(data.此前摘要+data.回答片段).includes('周一是测试环境')?'周一是测试环境':'尚不明确'};
    assert.fail('收笔直接使用已保存的回答');
  }};
  const options={profile,model,now:()=>f.time,weather:()=>[],memory:{archiveDays:()=>['2026-11-10'],
    read:()=>[{question:'花园：仅本地检索的材料',text:'不知道是否同批'}],readTasks:()=>[{title:'花园部署',detail:'待核实'}]},
    request:(url,options)=>{
      f.requests.push(url);if(options.method==='POST'&&url==='/api/memory/nags')f.writes=(f.writes??0)+1;
      if(f.offline)throw Error('隔离测试断网');
      return req(url.slice('/api/memory/'.length),options);
    }};
  let tasks;
  if(withTaskRuntime){
    const request=options.request;
    tasks=await createDesktopTasks({profile,request:async(url,opts)=>{
      if(url==='/api/memory/nags'&&opts.method==='POST')await f.holdNagWrite;
      return request(url,opts);
    }});
    options.request=tasks.weatherRequest;
  }
  function init(){
    f.store=createPersonalityDiary(options);
    f.nags=createPersonalityNags({store:f.store,now:()=>f.time,idle:()=>true,canContinue:()=>!f.busy&&(!tasks||tasks.tasksIdle({allowPendingRequests:true})),
      notify:(...args)=>f.notices.push(args),
      show:async s=>{if(!f.show)return false;f.session=s;s.visible();return true;}});
  }
  init();
  f.poll=(outer=signal,progress)=>f.nags.pollAudit(outer,progress);
  f.resume=(id=f.nags.pending()?.id)=>f.nags.resume(id,signal);
  f.restart=async()=>{await f.nags.flush();await f.nags.close();f.store.close();init();};
  Object.assign(f,{req,post,diary,tasks});
  t.after(async()=>{await f.nags.flush();await f.nags.close();f.store.close();await tasks?.stop();close();rmSync(profile,{recursive:true,force:true});});
  f.original=async id=>(await req('nags/'+id+'/original')).text();
  return f;
}
test('长手记每批最多投入两次推理，气泡只报告阶段，保存步数可跨重启续办',async t=>{
  const f=await fixture(t),progress=[];
  await f.diary('2026-11-20',Array.from({length:16},(_,i)=>`第${i+1}段记录了当天不同的整理动作。${'资料已经核对，余项继续准备。'.repeat(14)}`).join('\n'));
  const first=await f.poll(signal,value=>progress.push(value.stage));
  assert.equal(first.nextBatch,true);
  assert.equal(first.deferred,undefined);
  assert.equal(f.calls.length,2);
  assert.match(first.detail,/已保存 2 步/);
  assert.deepEqual(progress,['提取手记线索','提取手记线索']);
  assert.equal(Object.keys(f.store.auditState().run.steps).length,2);
  const prior=[...f.calls];
  await f.restart();
  const second=await f.poll(signal,value=>progress.push(value.stage));
  assert.equal(second.nextBatch,true);
  assert.equal(f.calls.length,4);
  assert.match(second.detail,/已保存 4 步/);
  assert.ok(f.calls.slice(2).every(input=>!prior.includes(input)));
  assert.equal(Object.keys(f.store.auditState().run.steps).length,4);
});
test('回答和追问结束之前没有写请求，补传在途也能完成同一回合',async t=>{
  const f=await fixture(t,{withTaskRuntime:true});
  assert.deepEqual(await f.poll(),{detail:'已新增 1 个手记质问'});
  await f.nags.flush();assert.equal(f.writes,undefined);
  assert(!f.session);await f.resume();
  const hold=Promise.withResolvers();
  f.holdNagWrite=hold.promise;f.complete=true;
  try{
    const result=await f.session.reply('周一是测试环境。');
    assert.equal(f.tasks.tasksIdle(),false);
    assert(result.done);assert.equal(f.store.nags()[0].status,'已解释');
  }finally{hold.resolve();}
});
test('质问核对超时后保留比对结果，重启后仅重试未完成的步骤',async t=>{
  const f=await fixture(t);
  f.verifyTimeout=true;
  await assert.rejects(f.poll(),/本机推理超时/);
  assert.equal(f.generated,1);
  assert.equal(f.nags.pendingQuestions().length,0);
  await f.restart();
  assert(f.nags.recoverAudit());
  f.verifyTimeout=false;
  assert.deepEqual(await f.poll(),{detail:'已新增 1 个手记质问'});
  assert.equal(f.generated,1);
  assert(!f.nags.recoverAudit());
});
test('拟出问题但待确认拒绝写入时，如实反馈未加入',async t=>{
  const f=await fixture(t);
  f.store.queueQuestion=()=>false;
  assert.deepEqual(await f.poll(),{detail:'已拟出手记质问，本轮未能加入待确认'});
  assert.equal(f.nags.pendingQuestions().length,0);
});
test('质问输出超限仍保存前序核对，跨重启只续办未完成阶段',async t=>{
  const f=await fixture(t);
  f.verifyOutputLimit=true;
  await assert.rejects(f.poll(),/本机输出超限/);
  await f.restart();
  f.verifyOutputLimit=false;
  assert.deepEqual(await f.poll(),{detail:'已新增 1 个手记质问'});
  assert.equal(f.generated,1);
});
test('七天多篇引文、单一主对象、关键词只读本机；稍后跨重启，忙时保留回答，两轮结束',async t=>{
  const f=await fixture(t);
  await f.poll();const id=f.nags.pending().id;
  assert(!f.session);assert.match(f.notices[0][0],/新质问/);assert(!f.notices[0][0].includes('首次上线'));
  assert.equal((await f.req('nags/'+id)).status,404);
  await f.resume(id);
  assert.match(f.session.prompt,/日记源头.*主篇[\s\S]+矛盾简述[\s\S]+1\. 2026-11-21\.1[\s\S]+2\. 2026-11-15\.1[\s\S]+矛盾点[\s\S]+首次上线是哪天？/);
  assert.equal((f.session.prompt.match(/？/g)??[]).length,1);
  f.session.leave('later');f.time+=minute;
  await f.restart();
  assert.equal(f.nags.pending().status,'等待回应');
  await f.resume(id);assert.equal(f.nags.pending().questions,1);
  f.busy=true;assert((await f.session.reply('先部署了测试版本。')).done);
  await f.restart();assert.equal(f.nags.pending().talk.at(-1).text,'先部署了测试版本。');
  f.busy=false;await f.resume(id);
  assert.match(f.session.prompt,/追问 1 \/ 2/);
  assert.equal((await f.session.reply('周三验收。')).text,'哪天收到回执？');
  assert((await f.session.reply('回执在周四。')).done);
  await f.nags.flush();
  const remote=await (await f.req('nags/'+id)).json();
  assert.equal(remote.id,id);assert.equal(remote.source_id,'2026-11-21.1');
  assert.equal(remote.status,'回合结束');assert.equal(remote.mood,'好奇');assert.equal(remote.questions,3);
  assert.equal(remote.talk.filter(t=>t.who==='你').length,3);assert.match(remote.afterEvaluation,/好奇/);
  assert(!JSON.stringify(remote).includes('仅本地检索'));assert(!f.requests.some(p=>p.includes('q=')||p.includes('/sources')||p.includes('/expenses')));
  await f.diary('2026-11-15','补写了花园验收。','two');
  await f.poll();assert.equal(f.generated,2);assert.equal(f.nags.pending().source_id,'2026-11-15.1');
  const conflicting={...remote,id:'another',revision:1};
  assert.equal((await f.post('nags',conflicting)).status,409);
  assert.equal((await (await f.req('nags')).json()).total,1);
});
test('气泡未显示仍保留原题，期限内继续或拒答复用同一记录',async t=>{
  const f=await fixture(t);f.show=false;
  await f.poll();assert((await f.resume()).deferred);
  assert.equal(f.nags.pending().status,'等待回应');f.show=true;await f.resume();
  f.session.leave('later');await f.resume();f.session.leave('refuse');await f.nags.flush();
  const [n]=f.store.nags();assert.equal(n.status,'用户结束');assert.equal(n.questions,1);assert.equal(n.talk.at(-1).who,'结束记录');
  assert(!n.talk.some(t=>t.who==='你'));assert.match(n.afterEvaluation,/拒|选择不再回答/);
  assert.equal((await f.req('nags/'+n.id)).status,404);
});
test('两条质问同时引用同一篇，只保留一条；篇号按原篇登记',async t=>{
  const f=await fixture(t),at=new Date(start).toISOString();
  const a={page:'2026-11-21.1',quote:'花园部署在周三首次上线。'};
  const b={page:'2026-11-15.1',quote:'同一版花园部署在周一首次上线。'};
  const packet=(id,refs)=>({id,source:'audit',source_id:refs[0].page,revision:1,created_at:at,
    refs,points:['周一与周三冲突'],reason:'上线日期不一致',title:'是哪天？',next:'是哪天？',questions:1,
    interruptions:0,mood:'好奇',status:'用户结束',talk:[{who:'绯月',text:'是哪天？',at} ]});
  const first=packet('primary-a',[a,b]),second=packet('primary-b',[b]);
  assert.equal((await f.post('nags',{...first,refs:[a,{...b,page:'2026-11-15.01'}]})).status,400);
  const result=await Promise.all([f.post('nags',first),f.post('nags',second)]);
  assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
  const winner=result[0].ok?first:second;
  assert((await f.post('nags',winner)).ok);
  const legacy={...first,id:'legacy',source:'diary',source_id:'2026-11-15.01/1'};
  assert.equal((await f.post('nags',legacy)).status,409);
  assert.equal((await (await f.req('nags')).json()).total,1);
  assert((await f.post('nags',{...legacy,source_id:'2026-11-14.01/1'})).ok);
  assert.equal((await f.post('nags',packet('old-page',[{page:'2026-11-14.1',quote:'窗口之外的内容。'}]))).status,409);
});
test('足够的首答直接收笔；无疑点和本机已有解释可在下一轮立即重新检查',async t=>{
  const f=await fixture(t);f.found=false;await f.poll();await f.poll();assert.equal(f.generated,2);assert(!f.nags.pending());
  await f.diary('2026-11-21','后来有新证据。','new');f.found=true;f.explained=true;await f.poll();assert(!f.nags.pending());
  f.explained=false;await f.poll();f.complete=true;await f.resume();
  assert((await f.session.reply('周一是测试，周三对外。')).done);
  assert.equal(f.store.nags()[0].questions,1);assert.equal(f.store.nags()[0].status,'已解释');assert(f.store.nags()[0].mood);
});
test('长回答中间的解释参与完整度判定，原文保存在同一念叨',async t=>{
  const f=await fixture(t);await f.poll();await f.resume();f.complete=true;
  const answer='甲'.repeat(800)+'周一是测试环境'+'乙'.repeat(800);
  assert((await f.session.reply(answer)).done);
  assert(f.calls.some(row=>row.问答?.some(turn=>turn[1]==='周一是测试环境')));
  assert.equal(f.store.nags()[0].talk.at(-1).text,answer);
  await f.nags.flush();
  assert((await f.original(f.store.nags()[0].id)).includes(answer));
});
test('模型判断尚缺细节却重复原问题，停止追问并如实记录结束原因',async t=>{
  const f=await fixture(t);await f.poll();await f.resume();f.follow=f.nags.pending().title;
  assert((await f.session.reply('日期我记不准了。'.repeat(100))).done);
  const [n]=f.store.nags();assert.equal(n.status,'回合结束');assert.equal(n.questions,1);
  assert.equal(n.talk.filter(row=>row.who==='绯月').length,1);
  assert.equal(Array.from(n.afterEvaluation).length,600);
  assert(n.afterEvaluation.endsWith('我带着这份好奇把这件事记在这里。'));
});
test('离线稍后、重启、续答、再次重启后，恢复连接只补传同一条收笔',async t=>{
  const f=await fixture(t);await f.poll();await f.resume();await f.nags.flush();const id=f.nags.pending().id;
  f.offline=true;f.session.leave('later');await f.restart();f.time+=minute;
  assert.equal(f.nags.pending().id,id);
  await f.resume(id);f.complete=true;assert((await f.session.reply('周一是测试。')).done);
  await f.restart();assert(!f.nags.pending());f.offline=false;await f.nags.flush();await f.nags.flush();
  const n=await (await f.req('nags/'+id)).json();assert.equal(n.status,'已解释');
  assert.equal(n.talk.filter(t=>t.who==='你').length,1);assert.equal((await (await f.req('nags')).json()).total,1);
});

test('查询中断后跨重启续原轮次，已完成比较不重复，问题就绪后可慢慢答',async t=>{
  const f=await fixture(t),hold=Promise.withResolvers(),entered=Promise.withResolvers(),stop=new AbortController();
  f.holdVerify=hold.promise;f.verifyEntered=entered;
  const first=f.poll(stop.signal);
  await entered.promise;stop.abort();
  await assert.rejects(first,{name:'AbortError'});
  assert.equal(f.generated,1);
  f.time+=25*minute;await f.restart();assert(f.nags.recoverAudit());
  f.holdVerify=undefined;await f.poll();assert.equal(f.generated,1);
  hold.resolve();
  f.time+=12*minute;f.complete=true;await f.resume();
  assert((await f.session.reply('周一是测试环境。')).done);
  assert(!f.nags.pending());
  const [n]=f.store.nags();
  assert.equal(n.status,'已解释');assert.equal(n.talk.at(-1).text,'周一是测试环境。');
});

test('准备超过十分钟保持运行，执行轮发出中断后保存续查状态',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture(t),hold=Promise.withResolvers(),entered=Promise.withResolvers();
  f.holdCompare=hold.promise;f.compareEntered=entered;
  const events=[],round=new AbortController(),profile=mkdtempSync(join(tmpdir(),'feiyue-audit-idle-limit-'));
  const checks=createReminderChecks({profile,now:()=>f.time,isBusy:()=>false,
    log:row=>{events.push(row);return true;},handlers:{diaryAudit:async active=>{
      try{await f.poll(AbortSignal.any([active,round.signal]));}catch(error){if(!round.signal.aborted)throw error;}
      return {roundPaused:round.signal.aborted,detail:'已保存续查状态'};
    }}});
  t.after(()=>{checks.close();rmSync(profile,{recursive:true,force:true});});
  checks.start();f.time+=minute;t.mock.timers.tick(minute);await entered.promise;
  f.time+=4*minute;t.mock.timers.tick(4*minute);
  assert(!events.some(e=>e.route==='手记质问'&&['查询失败','已暂停'].includes(e.stage)));
  assert(!f.nags.pending());
  f.time+=6*minute;t.mock.timers.tick(6*minute);
  assert(!events.some(e=>e.route==='手记质问'&&e.stage==='已暂停'));
  round.abort();
  await new Promise(resolve=>setImmediate(resolve));
  assert(events.some(e=>e.route==='手记质问'&&e.stage==='已暂停'));
  assert(f.nags.recoverAudit());assert(!f.session);assert(!f.nags.pending());
  hold.resolve();
});

test('验证拟问失败时，轮询报告记录原对象、拟问及失败原因',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture(t),hold=Promise.withResolvers(),entered=Promise.withResolvers(),events=[];
  f.holdVerify=hold.promise;f.verifyEntered=entered;
  const profile=mkdtempSync(join(tmpdir(),'feiyue-audit-timeout-log-'));
  const checks=createReminderChecks({profile,now:()=>f.time,isBusy:()=>false,
    log:row=>{events.push(row);return true;},handlers:{diaryAudit:active=>f.poll(active)}});
  t.after(()=>{checks.close();rmSync(profile,{recursive:true,force:true});});
  checks.start();f.time+=minute;t.mock.timers.tick(minute);await entered.promise;
  hold.reject(Error('隔离模型失败'));
  await new Promise(resolve=>setImmediate(resolve));
  const row=events.find(e=>e.route==='手记质问'&&e.stage==='查询失败');
  assert.match(row?.result,/验证拟问.*2026-11-21\.1.*2026-11-15\.1.*首次上线是哪天？.*隔离模型失败/);
  assert(!f.session);assert(!f.nags.pending());
});

test('回答与追问可以跨过十分钟；追问期间服务端仍没有记录',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture(t),hold=Promise.withResolvers(),entered=Promise.withResolvers();
  await f.poll();await f.resume();
  f.time+=11*minute;t.mock.timers.tick(11*minute);
  assert.equal(f.nags.pending().status,'提问中');
  f.holdReply=hold.promise;f.replyEntered=entered;
  const reply=f.session.reply('慢慢打完的回答。');await entered.promise;
  f.time+=4*minute;t.mock.timers.tick(4*minute);
  hold.resolve();assert.match((await reply).text,/哪天完成验收/);
  await f.nags.flush();
  const [n]=f.store.nags();
  assert.equal(n.status,'提问中');assert.equal(n.questions,2);
  assert.equal(n.talk.at(-2).text,'慢慢打完的回答。');
  assert.equal((await f.req('nags/'+n.id)).status,404);
});

test('填写长答后推理中断，重启原文仍可继续，已解释的悬念才补传已问和已解',async t=>{
  const f=await fixture(t);
  const day='2026-11-21',target=day+'.1/1';
  assert((await f.post('diaries',{day,batch:'thread',body:'后来继续等验收。',summary:'验收',tags:[],mood:'好奇',weather:'晴',
    threads:['是谁验收的？']})).ok);
  await f.poll();
  assert(f.nags.enqueue({source:'diary',source_id:target,title:'是谁验收的？',reason:'悬念'},{mood:'好奇'}));
  const question=f.nags.pendingQuestions().find(n=>n.source==='diary');
  const page=async()=>await (await f.req('diaries/'+day+'.1')).json();
  await f.resume(question.id);
  const raw='甲'.repeat(530)+'这个回答要保留';
  f.failBasic=true;
  await assert.rejects(f.session.reply(raw),/回答推理中断/);
  assert.equal(f.nags.pendingQuestions().find(n=>n.id===question.id).talk.at(-1).text,raw);
  assert.equal((await page()).threads[0].asked,false);
  assert.equal((await f.req('nags/'+question.id)).status,404);
  f.session.leave('interrupted');
  await f.restart();f.failBasic=false;
  await f.resume(question.id);await f.nags.flush();
  const stored=await (await f.req('nags/'+question.id)).json(),thread=(await page()).threads[0];
  assert.equal(stored.status,'已解释');assert.equal(stored.source_id,target);
  assert(thread.asked&&thread.resolved);
  assert((await f.original(question.id)).includes(raw));
});

test('20 条共享容量，按对象类型去重，满后只提醒优先级最高的一条',async t=>{
  const f=await fixture(t);
  const entry=(source,id,priority)=>({source,source_id:id,title:'这事有下文吗？',reason:'记录',priority});
  assert(f.nags.enqueue(entry('paylog','same',1)));
  assert(f.nags.enqueue(entry('nag','same',5)));
  assert(!f.nags.enqueue(entry('paylog','same',5)));
  for(let i=2;i<20;i++)assert(f.nags.enqueue(entry('paylog',String(i),3)));
  await f.restart();
  assert.equal(f.nags.pendingQuestions().length,20);
  await f.poll();assert.equal(f.generated,0);
  assert.match(f.notices.at(-1)[0],/20 个质问/);
  assert.equal(f.notices.at(-1)[1],f.nags.pending().id);
  assert.equal(f.nags.pending().source,'nag');
  assert(!f.nags.enqueue(entry('paylog','newoverflow',5)));
  assert.equal((await (await f.req('nags')).json()).total,0);
});
test('实际气泡与待确认入口验证 ID，稍后和拒绝分开，附件不会转为普通问答',async t=>{
  const f=screenFixture();f.electron.BrowserWindow.prototype.isVisible=function(){return this.visible;};
  const profile=mkdtempSync(join(tmpdir(),'feiyue-audit-panel-'));
  const item={id:'audit-1',title:'发生在什么时候？',status:'等待回应'};
  const second={id:'nag-1',title:'怎么安排的？',status:'意外中断'};
  const host=attachScreenQuestion(f.electron,{root:'.',bundle:'.',profile,win:f.win,history:f.history,auditPending:()=>[item,second],resumeAudit:id=>'继续了 '+id});
  t.after(()=>{host.close();rmSync(profile,{recursive:true,force:true});});
  await host.openReview('pending');
  const event=f.event(host.details);const data=await f.handlers.get('conversation:read')(event,null,'pending');
  assert.deepEqual(data.questions,[item,second]);assert.throws(()=>f.handlers.get('conversation:resume-audit')(event,'wrong'));
  assert.equal(await f.handlers.get('conversation:resume-audit')(event,second.id),'继续了 '+second.id);
  const raw=' '+'月'.repeat(499)+'\n';
  for(const audit of [false,true]){
    let received;
    assert(await host.showNag({audit,signal,prompt:item.title,visible(){},leave(){},reply:async value=>{
      received=value;return {text:'收到',done:true};
    }}));
    const answering=host.panel;
    f.ipcMain.emit('screen-qa:close',f.event(answering),{reason:'idle',draft:{text:raw}});
    assert.equal(host.panel,answering,'停下来想一想时应保留原来的回答窗口');
    await f.handlers.get('screen-qa:ask')(f.event(host.panel),{text:raw,mode:'auto'});
    assert.equal(received,raw);
    host.hide();
  }
  for(const reason of ['later','refuse']){
    let left;
    await host.showNag({audit:true,signal,prompt:item.title,visible(){},leave:r=>{left=r;}});
    const res=await f.handlers.get('screen-qa:ask')(f.event(host.panel),{text:'截图',withScreen:true});
    assert(res.audit);assert.equal(res.state,'error');
    f.ipcMain.emit('screen-qa:close',f.event(host.panel),{reason});
    assert.equal(left,reason);
  }
  let left=false;
  await host.showNag({audit:true,signal,prompt:item.title,visible(){},leave:reason=>{left=reason;}});
  f.ipcMain.emit('screen-qa:close',f.event(host.panel),{reason:'idle',draft:{text:''}});
  const waiting=await f.handlers.get('screen-qa:state')(f.event(host.panel));
  assert.equal(waiting.text,item.title);assert(waiting.audit);assert.equal(left,false);
  f.ipcMain.emit('screen-qa:close',f.event(host.panel),{reason:'later'});
  assert.equal(left,'later');
});
