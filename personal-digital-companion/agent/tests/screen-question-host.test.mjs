import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import worker from '../worker.mjs';
import {openTestDatabase,initializeDatabase} from './sqlite-d1.mjs';
import {seedMockTask} from './fixtures.mjs';
import {getDeviceIdentity} from '../devices/identity.mjs';
import {createDesktopTasks} from '../../desktop/task-lifecycle.mjs';
import {createServerTaskCommand} from '../../desktop/server-task-command.mjs';
import {fixture} from './screen-question-fixture.mjs';
import {checkEditConstraints,imageRequest,literalPlan} from '../../desktop/image-tasks.mjs';
import {attachmentRegistration,menuGuidance,validatePreview} from '../../desktop/interaction-skills.mjs';
import {attachScreenQuestion,questionBounds} from '../../desktop/screen-question-host.mjs';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';

test('仅有效提交问答打断自主任务，开窗、空输入和阅读缓存新闻不打断',async t=>{
  const f=fixture();
  let interrupts=0,news=0,study=0;
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:'unused',
    onForeground:()=>{interrupts++;},openNews:()=>{news++;},openStudy:()=>{study++;},
    localModel:{async analyze(){return {kind:'chat',reply:'收到问题'};}}});
  t.after(()=>host.close());
  await host.open();
  const ask=(text,mode)=>f.handlers.get('screen-qa:ask')(f.event(host.panel),{text,mode});
  assert.equal(interrupts,0);
  assert.equal((await ask(' ')).state,'error');
  assert.equal((await ask('打开新闻简报')).state,'answer');
  assert.equal(news,1);
  assert.equal((await ask('打开学习面板')).state,'answer');
  assert.equal(study,1);
  assert.equal(interrupts,0);
  assert.equal((await ask('请解释这句话','direct')).state,'answer');
  assert.equal(interrupts,1);
});

test('确认窗等用户填写时释放后台，提交补充后再让位',async t=>{
  const f=fixture(),resumed=Promise.withResolvers(),finish=Promise.withResolvers();
  let interrupts=0;
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:join(import.meta.dirname,'../..'),
    onForeground:()=>{interrupts++;},client:{forget(){},async askText(_text,opts){
      if(!opts.grounded)return {state:'answer',text:'请补充是哪一天。',askUser:true};
      resumed.resolve();await finish.promise;return {state:'answer',text:'已记下日期'};
    }}});
  t.after(()=>host.close());await host.open();
  await f.handlers.get('screen-qa:image-list')(f.event(host.panel));
  const work=f.handlers.get('screen-qa:ask')(f.event(host.panel),{text:'帮我看看这项安排'});
  for(let i=0;i<50&&!host.inquiryPanel;i++)await new Promise(r=>setImmediate(r));
  assert.ok(host.inquiryPanel);
  const event=f.event(host.inquiryPanel);
  const draft=await f.handlers.get('registration-review:get')(event);
  assert.equal(host.executing,false);
  const submitted=f.handlers.get('registration-review:decide')(event,draft.id,{action:'send',text:'明天'});
  await resumed.promise;
  assert.equal(host.executing,true);assert.equal(interrupts,2);
  finish.resolve();await submitted;await work;
  assert.equal(host.executing,false);
});

test('直连只走本地文字对话，传递同模式上一轮，退出后恢复自动识别',async t=>{
  const f=fixture(),calls=[],transcripts=[];
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:'unused',
    localModel:{async analyze(text,options){calls.push({text,...options});return {kind:'chat',reply:'这一轮的回复'};}},
    transcription:{turn(_session,value){transcripts.push(value.text);},reply(){},seal(){}},
    client:{forget(){},async askText(text){
      assert.equal(text,'你好','直连不应调用云端');return {state:'answer',text:'云端答复'};
    }}});
  t.after(()=>host.close());await host.open();
  const submit=(text,mode,extra={})=>f.handlers.get('screen-qa:ask')(f.event(host.panel),{text,mode,...extra});
  const first=' 不去床上亲热吗\n';
  assert.equal((await submit(first,'direct')).text,'这一轮的回复');
  assert.equal((await submit('确认登记','direct')).text,'这一轮的回复');
  assert.deepEqual(calls.map(x=>x.hint),['direct','direct']);
  assert.ok(calls.every(x=>x.replyMode==='speech'&&x.skillInstruction.name==='personal-conversation'));
  await submit('汇总这篇文章','direct');
  assert.equal(calls.at(-1).replyMode,'tool');
  assert.equal(calls.at(-1).skillInstruction.name,'tool-response');
  await submit('写一段关于这件事的评论','direct');
  assert.deepEqual(transcripts,[]);
  assert.equal(calls.at(-1).skillInstruction.name,'diary-writing');
  assert.deepEqual(calls[1].previous,{用户:first,绯月:'这一轮的回复'});
  assert.equal((await submit('截图','direct',{withScreen:true})).state,'error');
  const direct=calls.length;
  assert.equal((await submit('你好','auto')).text,'云端答复');
  assert.deepEqual(transcripts,['你好']);
  assert.equal(calls.length,direct,'自动模式不再先做本机思索');
});

test('两次真实措辞走登记技能，引用原文，先核对无日期草案，确认一次才写入',async t=>{
  const original='加个没时间的提醒，内容是关注Qwen4的量化模型发布，目前在使用qwen3.5的0.8到9b版本，需要关注qwen4的2b,4b版本的发布';
  const followup='上面那个需要提交为事项提醒哦';
  for(const q of [original,followup,'提醒我查看账单','关注 Qwen4 发布，作为事项提醒'])assert.equal(conversationRoute(q).kind,'registration',q);
  for(const q of ['不用提醒我','提醒怎么打开','如何设置提醒？','别把这条登记为提醒'])assert.equal(conversationRoute(q).kind,'question',q);
  for(const q of ['查一下今天的提醒','看看已设置的提醒','把周报提醒的日期改为明天'])assert.equal(conversationRoute(q).kind,'reminders',q);
  const f=fixture(),plans=[],writes=[],saved=new Map();
  const history={save:row=>saved.set(row.id,row),read:()=>[...saved.values()].reverse()};
  const registration={
    preview:async input=>{
      const plan={pending:[],chain:{nodes:[{type:'reminders.create',target_device_id:null,params:{title:'关注 Qwen4 2B、4B 量化模型发布',deadline:'2026-12-01'}}]}};
      plans.push({input,plan});return plan;
    },
    submit:()=>assert.fail('未确认直接登记'),
    submitReviewed:async(input,plan)=>{
      writes.push({input,plan});return {chain:{nodes:[{current_task:{status:'COMPLETED',type:'reminders.create',params:plan.chain.nodes[0].params,result:{record_id:9}}}]}};
    }};
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',root:join(import.meta.dirname,'../..'),bundle:'unused',history,registration,
    localModel:{analyze:()=>assert.fail('提醒登记直接进核对流程')}});
  t.after(()=>host.close());await host.open();
  const event=f.event(host.panel),ask=text=>f.handlers.get('screen-qa:ask')(event,{text});
  const decide=(id,approve)=>f.handlers.get('screen-qa:attachment-review')(event,{id,approve});
  const first=await ask(original);assert.match(first.text,/要登记.*提醒吗/);assert.match(first.fields,/不设日期/);
  const second=await ask(followup);assert.match(second.fields,/Qwen4 2B、4B/);
  assert.ok(plans[1].input.includes(original));assert.equal(plans[1].input.includes('已记入'),false);
  assert.equal((await decide(first.reviewId,true)).state,'error');
  assert.match((await ask('取消登记')).text,/已放弃/);assert.equal(writes.length,0);
  const last=await ask(followup);assert.ok(last.reviewId);assert.ok(plans.at(-1).input.includes(original));
  const receipts=await Promise.all([ask('确认登记'),decide(last.reviewId,true)]);
  assert.ok(receipts.some(r=>r.text.includes('已登记')));assert.equal(writes.length,1);
  assert.equal(writes[0].plan,plans.at(-1).plan);
  assert.equal(Object.hasOwn(writes[0].plan.chain.nodes[0].params,'deadline'),false);
});

test('图像确定性步骤、附件角色与负面指令',()=>{
  const input='生成车站女孩，再换上图1的风衣，最后放大';
  assert.deepEqual(literalPlan(input,1).map(s=>[s.op,s.refs]),[['generate',[]],['edit',[1]],['upscale',[]]]);
  assert.deepEqual(literalPlan('画一只猫，不用放大',0).map(s=>s.op),['generate']);
  assert.deepEqual(literalPlan('保留图1的脸，换成图2的外套',2)[0].refs,[2]);
  const keep='保留脸，换成图2的雨衣，最后高清放大';
  assert.doesNotThrow(()=>checkEditConstraints(keep,literalPlan(keep,2)));
  assert.throws(()=>checkEditConstraints(keep,[{op:'edit',quote:'换成图2的雨衣'}]),/漏掉了「保留脸」/);
  for(const q of ['怎么画一只猫','不要生图','生成一份生图提示词','帮我记录今天吃了什么'])assert.equal(imageRequest(q),false);
  assert.equal(imageRequest('放大这张照片',1),true);
  assert.equal(imageRequest('绯月环球之旅'),true);
  assert.equal(imageRequest('绯月环球之旅：京都'),true);
  assert.equal(imageRequest('绯月环球之旅怎么用？'),false);
  assert.equal(attachmentRegistration('把图里的会议记成提醒'),true);
  assert.equal(attachmentRegistration('请描述这张图片'),false);
  assert.match(menuGuidance('本地复盘怎么打开'),/选择「本地复盘」/);
  assert.match(menuGuidance('知识库怎么打开'),/阅读与学习 → 知识库/);
  assert.match(menuGuidance('看绯月写日记在哪'),/任务 → 看绯月写日记/);
  assert.match(menuGuidance('补写本机任务执行评价在哪'),/任务 → 补写本机任务执行评价/);
  assert.match(menuGuidance('任务日志在哪'),/任务 → 任务日志/);
  assert.match(menuGuidance('提醒检查 · 待执行怎么打开'),/选择「提醒检查 · 待执行」/);
  assert.match(menuGuidance('要怎么才能登记日记？'),/问绯月.*帮我登记日记/);
});

test('附件登记核对同一份计划，放弃、旧令牌和重复确认都不提交',async t=>{
  const f=fixture(),plans=[],writes=[];
  const original=' 把附件记成提醒\n',history=[];
  f.history.save=row=>history.push(row);
  const plan={pending:[],chain:{nodes:[{key:'entry-1',type:'reminders.create',target_device_id:null,params:{title:'会议',deadline:'2026-11-24'}}]}};
  assert.throws(()=>validatePreview(plan,'登记成运动'),/类型/);
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:join(import.meta.dirname,'../..'),
    client:{forget(){},async askText(_text,opts){assert.equal(opts.document.name,'会议.txt');return {state:'answer',text:'会议，2026-11-24'};}},
    registration:{preview:async input=>{plans.push(input);return plan;},submitReviewed:async(input,exact)=>{
      assert.equal(exact,plan);writes.push(input);return {status:'completed',chain:{nodes:[]}};
    }}});
  t.after(()=>host.close());await host.open();
  const event=f.event(host.panel);
  const ask=()=>f.handlers.get('screen-qa:ask')(event,{text:original,attachment:{name:'会议.txt',kind:'text',data:'会议，2026-11-24'}});
  const decide=(id,approve)=>f.handlers.get('screen-qa:attachment-review')(event,{id,approve});
  const first=await ask();assert.match(first.fields,/2026-11-24/);assert.equal(writes.length,0);
  assert(history.some(row=>row.originalQuestion===original&&row.question.endsWith('会议.txt')));
  assert.equal((await decide(first.reviewId,false)).state,'answer');
  const second=await ask();assert.equal((await decide(first.reviewId,true)).state,'error');assert.equal(writes.length,0);
  assert.equal((await decide(second.reviewId,true)).state,'answer');
  assert.equal((await decide(second.reviewId,true)).state,'error');assert.deepEqual(writes,[plans[1]]);
});
test('云端任务和服务器任务从问绯月按本机模板确认、创建、领取并回传',async t=>{
  const f=fixture(),db=openTestDatabase();initializeDatabase(db.sqlite);
  seedMockTask(db.sqlite,{type:'mock.unit',spec:{value:{type:'string',required:true}}});
  const profile=await mkdtemp(join(tmpdir(),'feiyue-server-command-'));
  const identity=await getDeviceIdentity(profile);
  db.sqlite.prepare('INSERT INTO devices VALUES (?,?,NULL,?)').run(identity.device_id,'本机测试',new Date().toISOString());
  const posts=[];let loseResponse=false;
  const request=async(path,options={})=>{
    if(options.method==='POST')posts.push(path);
    const response=await worker.fetch(new Request('https://test.invalid'+path,{...options,
      headers:{...options.headers,Authorization:'Bearer test'}}),{DB:db.DB,API_TOKEN:'test'});
    if(path==='/api/tasks'&&loseResponse){loseResponse=false;throw Error('模拟创建回执丢失');}
    return response;
  };
  const dialog={async showMessageBox(){return {response:0};}};
  const tasks=await createDesktopTasks({profile,request,dialog,handlerModule:new URL('./fixtures/thread-handlers.mjs',import.meta.url).href});
  const work=async(input,{skill})=>{
    const parsed=JSON.parse(input).原始输入;
    assert.equal(skill.name,'server-pc-task');
    assert.match(parsed.指令,/春天/);assert.deepEqual(parsed.模板.map(t=>t.type),['mock.unit']);
    return {type:'mock.unit',params:{value:'春天'},deadline_at:'2024-01-01T00:00:00Z'};
  };
  const serverTask=createServerTaskCommand({profile,tasks,localModel:{work},dialog});
  const h=attachScreenQuestion(f.electron,{win:f.win,profile,history:f.history,bundle:'unused',root:'unused',serverTask});
  t.after(async()=>{h.close();await tasks.stop();db.close();await rm(profile,{recursive:true,force:true});});
  await h.open();const ask=text=>f.handlers.get('screen-qa:ask')(f.event(h.panel),{text});
  assert.match((await ask('云端任务有哪些？')).text,/mock.unit/);
  assert.match((await ask('服务器任务：回显春天')).text,/已取消/);assert.deepEqual(posts,[]);
  dialog.showMessageBox=async options=>{
    assert.match(options.detail,/春天/);assert.ok(options.detail.includes(identity.device_id));return {response:1};
  };
  loseResponse=true;
  assert.match((await ask('提交一个云端任务：回显春天')).text,/原提交号/);
  assert.match((await ask('服务器任务：回显春天')).text,/待核对/);
  const answer=await ask('服务器任务：恢复上次提交');
  assert.match(answer.text,/已执行完成/);
  assert.equal(posts.filter(path=>path==='/api/task-submissions').length,1);
  assert.equal(posts.filter(path=>path.endsWith('/claim')).length,1);
  const rows=db.sqlite.prepare('SELECT * FROM tasks').all();
  assert.equal(rows.length,1);assert.equal(rows[0].deadline_at,null);assert.equal(rows[0].target_device_id,identity.device_id);
  assert.equal(rows[0].attempt_count,1);assert.equal(rows[0].status,'COMPLETED');assert.equal(JSON.parse(rows[0].result_json).value,'春天');
  assert.match(answer.text,new RegExp(rows[0].task_id));
  assert.match((await ask('云端任务：恢复上次提交')).text,/没有待恢复/);
  assert.match((await ask('服务器任务：回显春天，任务截止明天')).text,/截止日期和时间/);
  assert.match((await ask('服务器任务：回显春天，任务截止 2099-02-03 12:00')).text,/已执行完成/);
  assert.equal(db.sqlite.prepare('SELECT deadline_at FROM tasks WHERE deadline_at IS NOT NULL').get().deadline_at,'2099-02-03T03:00:00.000Z');
  db.sqlite.prepare("UPDATE tasklist SET executor='cloud' WHERE type='mock.unit'").run();
  assert.match((await ask('云端任务：回显春天')).text,/没有本机可领取/);
});

test('QH01：头顶跟随及负坐标/边缘时仍在屏内，不改角色尺寸',()=>{
  for(const [pet,area]of [[{x:600,y:500,width:240,height:360},{x:0,y:0,width:1280,height:900}],[{x:-1700,y:0,width:240,height:360},{x:-1920,y:0,width:1920,height:1080}],[{x:1100,y:10,width:180,height:360},{x:0,y:0,width:1280,height:900}]]){
    const {bounds:b}=questionBounds(pet,area);assert.ok(b.x>=area.x&&b.y>=area.y);assert.ok(b.x+b.width<=area.x+area.width);assert.ok(b.y+b.height<=area.y+area.height);
  }
});
test('气泡超时请求在查询中被拒绝，空闲关闭保留草稿且手动关闭清除',async t=>{
  const f=fixture();
  let release,entered;
  const started=new Promise(resolve=>entered=resolve);
  const client={forget(){},askText(){entered();return new Promise(resolve=>release=resolve);}};
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:'unused',client});
  t.after(()=>host.close());
  await host.open();
  const before=host.panel,event=f.event(before);
  const draft={text:'  尚未发送  ',mode:'registration',withScreen:false};
  const idle={reason:'idle',draft};
  const run=f.handlers.get('screen-qa:ask')(event,{text:'查询期间'});
  await started;
  assert.equal(host.hasLocalWork,true);
  f.ipcMain.emit('screen-qa:close',event,idle);
  assert.equal(host.panel,before);
  release({state:'answer',text:'查询结束'});
  await run;
  await f.handlers.get('screen-qa:image-list')(event);
  assert.equal(host.hasLocalWork,false);
  f.ipcMain.emit('screen-qa:close',{sender:before.webContents,senderFrame:{}},idle);
  assert.equal(host.panel,before);
  f.ipcMain.emit('screen-qa:close',event,idle);
  assert.equal(host.panel,null);
  await host.open();
  const state=()=>f.handlers.get('screen-qa:state')(f.event(host.panel));
  assert.deepEqual(state().idleDraft,draft);
  assert.equal(state().mode,'registration');
  f.ipcMain.emit('screen-qa:close',f.event(host.panel));
  await host.open();
  assert.equal(state().idleDraft,null);
});
test('QH02：可信主frame才可提问；采集时保留原窗，回执只发文本，关闭清理',async()=>{
  const f=fixture(),archived=[];let calls=0,forgot=0,host;
  f.history.save=turn=>archived.push(turn);
  const client={async captureAndAsk(q,{onState}){calls++;assert.equal(host.panel.visible,true);assert.equal(q,'问题');onState({state:'waiting',text:'正在看'});return {state:'answer',text:'答案'};},forget(){forgot++;}};
  host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:'unused',client,
    transcription:{turn(){assert.fail('截图问答不能进入自动转录');},seal(){}}});
  await host.open();const panel=host.panel,e=f.event(panel);
  assert.equal(panel.options.webPreferences.sandbox,true);assert.equal(panel.popup().action,'deny');
  assert.throws(()=>f.handlers.get('screen-qa:ask')({sender:panel.webContents,senderFrame:{}},'问题'),/仅问答/);
  assert.deepEqual(await f.handlers.get('screen-qa:ask')(e,{text:'问题',withScreen:true}),{state:'answer',text:'答案',question:'问题'});assert.equal(calls,1);assert.equal(panel.visible,true);
  assert(archived.length&&archived.every(turn=>turn.localOnly===true));
  assert.deepEqual(f.win.getBounds(),{x:600,y:500,width:240,height:360});
  host.close();await Promise.resolve();assert.equal(forgot,1);assert.equal(f.handlers.size,0);assert.equal(panel.destroyed,true);assert.equal(f.win.listenerCount('move'),0);
});
test('QH03：关闭取消在途，无迟到结果；重复提交不启动第二次采集',async()=>{
  const f=fixture();let release,started;const entered=new Promise(resolve=>started=resolve);
  const client={captureAndAsk(_q,{signal,onState}){started();return new Promise(resolve=>{release=()=>{assert.ok(signal.aborted);onState({state:'answer',text:'迟到'});resolve({state:'answer',text:'迟到'});};});},forget(){}};
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:'unused',client});await host.open();
  const panel=host.panel,event=f.event(panel),run=f.handlers.get('screen-qa:ask')(event,{text:'问题',withScreen:true});await entered;
  assert.equal((await f.handlers.get('screen-qa:ask')(event,'另一个')).code,'BUSY');
  host.hide();release();assert.equal((await run).code,'REQUEST_CANCELLED');assert.ok(!panel.sent.some(([,v])=>v.text==='迟到'));
  host.close();
});

test('查询网络先搜公开资料，再用 AI 按来源整理；记忆入口不发请求',async t=>{
  const f=fixture(), queries=[], summaries=[], history=[];
  let searchAvailable=false, aiAvailable=true;
  f.history.save=value=>history.push(value);
  const sources=[{title:'发布公告',snippet:'11 月 20 日发布。',url:'https://example.test/official'}];
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:'unused',
    client:{forget(){},captureAndAsk(){assert.fail('联网模式不能采图')},askText(){assert.fail('检索不能交给云端模型')}},
    localModel:{async analyze(text,options){
      assert.equal(options.hint,'direct');
      summaries.push(text);
      return aiAvailable?{reply:'公告显示 11 月 20 日发布。[1]'}:{error:'UNAVAILABLE'};
    }},
    registration:{submit:()=>assert.fail('显式联网不能登记')},
    search:async query=>{
      queries.push(query);
      if(!searchAvailable)throw Error('暂不可用');
      return {state:'answer',text:'原始摘要',sources};
    }});
  t.after(()=>host.close());
  await host.open();
  const e=f.event(host.panel),ask=(text,mode)=>f.handlers.get('screen-qa:ask')(e,{text,mode,withScreen:true});
  assert.equal(f.handlers.get('screen-qa:state')(e).webSearch,true);
  assert.equal((await ask('私有记录','memory')).code,'MEMORY_NOT_AVAILABLE');
  assert.deepEqual([queries.length,summaries.length,history.length],[0,0,0]);
  assert.equal((await ask('令牌：abcd','web')).state,'error');
  assert.equal(queries.length,0);
  assert.equal((await ask('发行版最新动向','web')).retryable,true);
  searchAvailable=true;
  const answer=await f.handlers.get('screen-qa:retry')(e);
  assert.deepEqual(queries,['发行版最新动向','发行版最新动向']);
  assert.match(summaries[0],/无法确认是最新情况/);
  assert.match(summaries[0],/11 月 20 日发布/);
  assert.doesNotMatch(summaries[0],/https:\/\//);
  assert.equal(answer.text,'公告显示 11 月 20 日发布。[1]');
  assert.deepEqual(answer.sources,sources);
  aiAvailable=false;
  assert.match((await ask('发行版最新动向','web')).text,/AI 暂未整理.*原始摘要/s);
});

test('自动问答直接走问答通道，不再先做本机思索；分段日志不含原文',async t=>{
  const f=fixture(),asked=[],logs=[];
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:join(import.meta.dirname,'../..'),
    localModel:{analyze:()=>assert.fail('自动问答不应调用本机对话')},log:event=>logs.push(event),
    client:{forget(){},async askText(text){asked.push(text);await new Promise(resolve=>setTimeout(resolve,12));return {state:'answer',text:'云端答复'};}}
  });
  t.after(()=>host.close());
  await host.open();
  const q='  罗马的历史是什么？  ';
  assert.equal((await f.handlers.get('screen-qa:ask')(f.event(host.panel),{text:q})).text,'云端答复');
  assert.deepEqual(asked,[q]);
  const end=logs.find(entry=>entry.stage==='处理结束');
  assert.equal(end.operation,'文字问答');
  assert.equal(end.local_ms,0);
  assert.ok(!JSON.stringify(logs).includes(q),'分段日志不含用户原文');
});
