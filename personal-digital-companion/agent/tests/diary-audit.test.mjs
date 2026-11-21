import test from 'node:test';
import {bucketFixture} from './txt-test-bucket.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openTestDatabase} from './sqlite-d1.mjs';
import {createPersonalityDiary} from '../../desktop/personality-diary.mjs';
import {createPersonalityNags} from '../../desktop/personality-nags.mjs';
import {personalityMemory} from './fixtures/personality-memory.mjs';
import {fixture as screenFixture} from './screen-question-fixture.mjs';
import {attachScreenQuestion} from '../../desktop/screen-question-host.mjs';
import {createDesktopTasks} from '../../desktop/task-lifecycle.mjs';

const start=Date.parse('2026-11-21T12:00:00+09:00'),hour=3600000,minute=60_000;
const signal=new AbortController().signal;
async function fixture(t,{withTaskRuntime=false}={}){
  const {DB,sqlite,close}=openTestDatabase();
  sqlite.exec(readFileSync(new URL('./fixtures/personality-memory.sql',import.meta.url),'utf8'));
  const myMainStorage=bucketFixture();
  const req=(path,options)=>personalityMemory(new Request('https://test/api/memory/'+path,options),{DB,myMainStorage},'fixture');
  const post=(path,body)=>req(path,{method:'POST',body:JSON.stringify(body)});
  async function diary(day,body,batch='one'){
    assert((await post('diaries',{day,batch,body,summary:body,mood:'好奇',tags:[],weather:'晴',threads:[]})).ok);
  }
  await diary('2026-11-21','花园部署在周三首次上线。');
  await diary('2026-11-15','同一版花园部署在周一首次上线。');
  await diary('2026-11-14','窗口之外的内容。');
  const profile=mkdtempSync(join(tmpdir(),'feiyue-audit-'));
  const f={time:start,busy:false,show:true,complete:false,found:true,explained:false,generated:0,calls:[],requests:[]};
  const model={memory:async(input,_prompt,s,_signal,skill)=>{
    if(skill.name==='original-summary')return {text:input.includes('周一是测试环境')?'周一是测试环境':'回答片段'};
    assert.equal(skill.name,'diary-audit');
    const data=JSON.parse(input);f.calls.push(data);
    if(s.required.includes('score')){
      f.generated++;assert(data.every(r=>r.page>='2026-11-15'));
      f.compareEntered?.resolve();
      await f.holdCompare;
      return {score:f.found?'5':'0',refs:data.length>1?'1,2':'1',summary:'同一版首次上线日期不一致',points:'周三与周一不能同时是首次上线',question:'首次上线是哪天？',keywords:'花园,上线'};
    }
    if(s.required.includes('keep')){
      f.verifyEntered?.resolve();
      await f.holdVerify;
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
    assert.deepEqual(s.required,['text']);return {text:'我带着'+data.情绪+'记下他的解释。'};
  }};
  const options={profile,model,now:()=>f.time,weather:()=>[],memory:{archiveDays:()=>['2026-11-10'],
    read:()=>[{question:'花园：仅本地检索的材料',text:'不知道是否同批'}],readTasks:()=>[{title:'花园部署',detail:'待核实'}]},
    request:(url,options)=>{
      f.requests.push(url);if(f.offline)throw Error('隔离测试断网');
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
      show:async s=>{if(!f.show)return false;f.session=s;s.visible();return true;}});
  }
  init();
  f.poll=(manual=false,outer=signal)=>f.nags.pollAudit(outer,{manual});
  f.restart=async()=>{await f.nags.flush();await f.nags.close();f.store.close();init();};
  Object.assign(f,{req,post,diary,tasks});
  t.after(async()=>{await f.nags.flush();await f.nags.close();f.store.close();await tasks?.stop();close();rmSync(profile,{recursive:true,force:true});});
  f.original=async id=>(await req('nags/'+id+'/original')).text();
  return f;
}
test('回答自己的质问时，念叨补传仍在途也能完成同一回合',async t=>{
  const f=await fixture(t,{withTaskRuntime:true});
  await f.poll();await f.nags.flush();
  const hold=Promise.withResolvers();
  f.holdNagWrite=hold.promise;f.complete=true;
  try{
    const result=await f.session.reply('周一是测试环境。');
    assert.equal(f.tasks.tasksIdle(),false);
    assert(result.done);assert.equal(f.store.nags()[0].status,'已解释');
  }finally{hold.resolve();}
});
test('七天多篇引文、单一主对象、关键词只读本机；稍后跨重启，忙时保留回答，两轮结束',async t=>{
  const f=await fixture(t);
  await f.poll();const id=f.nags.pending().id;
  assert.match(f.session.prompt,/日记源头.*主篇[\s\S]+矛盾简述[\s\S]+1\. 2026-11-21\.1[\s\S]+2\. 2026-11-15\.1[\s\S]+矛盾点[\s\S]+首次上线是哪天？/);
  assert.equal((f.session.prompt.match(/？/g)??[]).length,1);
  f.session.leave('later');f.time+=minute;
  await f.restart();assert.match((await f.poll()).detail,/待确认/);
  assert.equal(f.nags.pending().status,'等待回应');
  await f.poll(true);assert.equal(f.nags.pending().questions,1);
  f.busy=true;assert((await f.session.reply('先部署了测试版本。')).done);
  await f.restart();assert.equal(f.nags.pending().talk.at(-1).text,'先部署了测试版本。');
  f.busy=false;await f.poll();
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
  await f.poll();assert.equal(f.generated,1);assert(!f.nags.pending());
  const conflicting={...remote,id:'another',source_id:'2026-11-15.1',revision:1,refs:[remote.refs[1]],status:'等待回应'};
  assert.equal((await f.post('nags',conflicting)).status,409);
  assert.equal((await (await f.req('nags')).json()).total,1);
});
test('气泡未显示仍保留原题，期限内继续或拒答复用同一记录',async t=>{
  const f=await fixture(t);f.show=false;
  assert((await f.poll()).deferred);
  assert.equal(f.nags.pending().status,'等待回应');f.show=true;await f.poll();
  f.session.leave('later');await f.poll(true);f.session.leave('refuse');await f.nags.flush();
  const [n]=f.store.nags();assert.equal(n.status,'用户结束');assert.equal(n.questions,1);assert.equal(n.talk.at(-1).who,'结束记录');
  assert(!n.talk.some(t=>t.who==='你'));assert.match(n.afterEvaluation,/拒|选择不再回答/);await f.poll();assert.equal(f.generated,1);
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
test('足够的首答直接收笔，没有当天情绪时抽取；无疑点与本机已有解释均不弹窗',async t=>{
  const f=await fixture(t);f.found=false;await f.poll();await f.poll();assert.equal(f.generated,1);assert(!f.nags.pending());
  await f.diary('2026-11-21','后来有新证据。','new');f.found=true;f.explained=true;await f.poll();assert(!f.nags.pending());
  f.time+=5*hour;await f.poll();assert(!f.nags.pending());assert.equal(f.generated,2);
  f.time+=5*hour;f.explained=false;await f.poll();f.complete=true;
  assert((await f.session.reply('周一是测试，周三对外。')).done);
  assert.equal(f.store.nags()[0].questions,1);assert.equal(f.store.nags()[0].status,'已解释');assert(f.store.nags()[0].mood);
});
test('长回答中间的解释参与完整度判定，原文保存在同一念叨',async t=>{
  const f=await fixture(t);await f.poll();f.complete=true;
  const answer='甲'.repeat(800)+'周一是测试环境'+'乙'.repeat(800);
  assert((await f.session.reply(answer)).done);
  assert(f.calls.some(row=>row.问答?.some(turn=>turn[1]==='周一是测试环境')));
  assert.equal(f.store.nags()[0].talk.at(-1).text,answer);
  await f.nags.flush();
  assert((await f.original(f.store.nags()[0].id)).includes(answer));
});
test('模型判断尚缺细节却重复原问题，停止追问并如实记录结束原因',async t=>{
  const f=await fixture(t);await f.poll();f.follow=f.nags.pending().title;
  assert((await f.session.reply('日期我记不准了。')).done);
  const [n]=f.store.nags();assert.equal(n.status,'回合结束');assert.equal(n.questions,1);
  assert.equal(n.talk.filter(row=>row.who==='绯月').length,1);
});
test('离线稍后、重启、续答、再次重启后，恢复连接只补传同一条收笔',async t=>{
  const f=await fixture(t);await f.poll();await f.nags.flush();const id=f.nags.pending().id;
  f.offline=true;f.session.leave('later');await f.restart();f.time+=minute;
  assert.match((await f.poll()).detail,/待确认/);
  await f.poll(true);f.complete=true;assert((await f.session.reply('周一是测试。')).done);
  await f.restart();assert(!f.nags.pending());f.offline=false;await f.nags.flush();await f.nags.flush();
  const n=await (await f.req('nags/'+id)).json();assert.equal(n.status,'已解释');
  assert.equal(n.talk.filter(t=>t.who==='你').length,1);assert.equal((await (await f.req('nags')).json()).total,1);
});

test('五小时按稳定篇号分别计，无结果和同篇追加都占用名额，新对象正常检查',async t=>{
  const f=await fixture(t);f.found=false;
  await f.poll();assert.equal(f.generated,1);
  await f.diary('2026-11-21','同一篇追加内容。','update');
  await f.diary('2026-11-20','另一个尚未检查的对象。');
  f.time+=minute;await f.restart();await f.poll();
  const compared=()=>f.calls.filter(Array.isArray);
  assert.deepEqual(compared().at(-1).map(row=>row.page),['2026-11-20.1']);
  f.time=start+5*hour-1;await f.poll();assert.equal(f.generated,2);
  f.time++;await f.poll();
  assert.deepEqual(compared().at(-1).map(row=>row.page),['2026-11-21.1','2026-11-15.1']);
  assert.equal(f.generated,3);
});

test('查询中断后跨重启续原轮次，已完成比较不重复，三分钟后不能质询',async t=>{
  const f=await fixture(t),hold=Promise.withResolvers(),entered=Promise.withResolvers(),stop=new AbortController();
  f.holdVerify=hold.promise;f.verifyEntered=entered;
  const first=f.poll(false,stop.signal);
  await entered.promise;stop.abort();
  await assert.rejects(first,{name:'AbortError'});
  assert.equal(f.generated,1);
  f.time+=2*minute;await f.restart();assert(f.nags.recoverAudit());
  f.holdVerify=undefined;await f.poll();assert.equal(f.generated,1);
  hold.resolve();
  const current=f.session,deadline=current.deadline;
  f.time=start+3*minute;
  assert.match((await current.reply('到点之后的回答。')).text,/三分钟/);
  assert(deadline.aborted);assert(!f.nags.pending());
  const [n]=f.store.nags();
  assert.equal(n.status,'回合结束');assert.equal(n.talk.length,1);
});

test('三分钟主动取消未完成的查询，丢弃迟到生成，已启动对象仍受五小时限制',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture(t),hold=Promise.withResolvers(),entered=Promise.withResolvers();
  f.holdCompare=hold.promise;f.compareEntered=entered;
  const check=f.poll();await entered.promise;
  f.time=start+3*minute;t.mock.timers.tick(3*minute);
  assert.match(await check,/三分钟/);
  hold.resolve();f.holdCompare=undefined;
  await f.poll();assert.equal(f.generated,1);assert(!f.session);assert(!f.nags.pending());
});

test('质询中达到三分钟保留已落盘回答，终止迟到的追问',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture(t),hold=Promise.withResolvers(),entered=Promise.withResolvers();
  await f.poll();
  f.time=start+3*minute-1;f.holdReply=hold.promise;f.replyEntered=entered;
  const reply=f.session.reply('已在时限前回答。');await entered.promise;
  f.time++;t.mock.timers.tick(3*minute);
  assert.match((await reply).text,/三分钟/);hold.resolve();
  await f.nags.flush();
  const [n]=f.store.nags();
  assert.equal(n.status,'回合结束');assert.equal(n.questions,1);
  assert.equal(n.talk.at(-1).text,'已在时限前回答。');
});
test('实际气泡与待确认入口验证 ID，稍后和拒绝分开，附件不会转为普通问答',async t=>{
  const f=screenFixture();f.electron.BrowserWindow.prototype.isVisible=function(){return this.visible;};
  const profile=mkdtempSync(join(tmpdir(),'feiyue-audit-panel-'));
  const root=join(import.meta.dirname,'../..');
  const item={id:'audit-1',title:'发生在什么时候？',status:'等待回应'};
  const host=attachScreenQuestion(f.electron,{root,bundle:root,profile,win:f.win,history:f.history,auditPending:()=>item,resumeAudit:()=>'继续了'});
  t.after(()=>{host.close();rmSync(profile,{recursive:true,force:true});});
  await host.openReview('pending');
  const event=f.event(host.details);const data=await f.handlers.get('conversation:read')(event,null,'pending');
  assert.deepEqual(data.audit,item);assert.throws(()=>f.handlers.get('conversation:resume-audit')(event,'wrong'));
  assert.equal(await f.handlers.get('conversation:resume-audit')(event,item.id),'继续了');
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
  const expiry=new AbortController();
  let leftAfterExpiry=false;
  await host.showNag({audit:true,signal,deadline:expiry.signal,timeoutText:'质询已结束',prompt:item.title,visible(){},leave(){leftAfterExpiry=true;}});
  expiry.abort();
  const ended=await f.handlers.get('screen-qa:state')(f.event(host.panel));
  assert.equal(ended.text,'质询已结束');assert(!ended.audit);
  f.ipcMain.emit('screen-qa:close',f.event(host.panel),{reason:'later'});
  assert.equal(leftAfterExpiry,false);
});
