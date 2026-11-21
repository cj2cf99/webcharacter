import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRegistrationFlow } from '../../desktop/registration-flow.mjs';
import { prepareConversationBatch } from '../../desktop/conversation-transcription.mjs';
import {createInteractionWork} from '../../desktop/interaction-work.mjs';
import {attachScreenQuestion} from '../../desktop/screen-question-host.mjs';
import {fixture as questionFixture} from './screen-question-fixture.mjs';
import { createWorker } from '../worker.mjs';
import { initializeDatabase, openTestDatabase } from './sqlite-d1.mjs';

const all = [
  { type: 'reminders.create', params: { title: '检查资料', deadline: 'tomorrow' }, after: 6 },
  { type: 'hu-shi.food.create', params: { body: '午餐面条' } },
  { type: 'hu-shi.exercise.create', params: { body: '散步半小时' } },
  { type: 'hu-shi.event.create', params: {} },
  { type: 'diaries.create', params: { title: '今天', content: '整理了资料' } },
  { type: 'records.create', params: { body: '模型参考 https://example.test/reference', category_id: 'resource' } },
];

async function fixture(t, { actions = all, register, fault, pending = [] } = {}) {
  const db = openTestDatabase();
  t.after(db.close);
  initializeDatabase(db.sqlite);
  for (const seed of ['tasklist-hu-shi.sql', 'tasklist-registration.sql']) {
    db.sqlite.exec(readFileSync(new URL(`../seeds/${seed}`, import.meta.url), 'utf8'));
  }
  const profile = await mkdtemp(join(tmpdir(), 'companion-registration-'));
  t.after(() => rm(profile, { recursive: true, force: true }));
  const writes = [], calls = [];
  const env = {
    DB: db.DB,
    clouflareai: {
      async run(_model, { messages }) {
        env.input = JSON.parse(messages[1].content);
        return { choices: [{ message: { content: JSON.stringify({ actions, pending }) }, finish_reason: 'stop' }] };
      },
    },
  };
  const worker = createWorker({
    authorize: request => ({ ownerId: request.headers.get('x-isolated-owner') }),
    loadRegistrationCategories: async () => [{ id: 'resource', name: '资源' }],
    async writeRegistrationEntry(operation) {
      const { path, body, idempotencyKey } = operation;
      writes.push({ path, body, idempotencyKey });
      if (register) return register(operation, writes.length);
      if (['/api/reminders', '/api/diaries'].includes(path)) return { item: { seq: writes.length } };
      return { id: 'test-' + writes.length, created_at: Date.now() };
    },
  });
  function request(owner = 'owner') {
    return async (path, options = {}) => {
      calls.push({ path, method: options.method });
      const response = await worker.fetch(new Request('https://isolated.test' + path,
        { ...options, headers: { 'x-isolated-owner': owner, ...options.headers } }), env);
      if (fault) await fault(path, response);
      return response;
    };
  }
  async function call(path, body, owner) {
    const response = await request(owner)(path, {
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  async function create(nodes, { temporary = true } = {}) {
    const issued = await call('/api/task-submissions', {});
    return call('/api/chains', { nodes, temporary_registration: temporary, submission_id: issued.body.submission_id });
  }
  const savedFile = join(profile, 'registration-submission.json');
  const events=new Map();
  return { db, env, writes, calls, create, call, savedFile,events,
    desktop: (options={}) => createRegistrationFlow({ profile, request: request(),record:event=>events.set(event.key,event),...options }) };
}

test('这周日看手顺书：确认前只有草稿，跨日确认仍只写原日期和完整条件',async t=>{
  const f=await fixture(t);
  let now=Date.parse('2026-11-20T18:00:00+09:00');
  const flow=f.desktop({now:()=>now});
  const text='宝贝，加个提醒，这周日看手顺书，rene的手顺书工作至少推进3个才行';
  const expected={deadline:'2026-11-22',title:'看手顺书',content:'rene的手顺书工作至少推进3个才行'};
  const ui=questionFixture();
  const host=attachScreenQuestion(ui.electron,{win:ui.win,root:join(import.meta.dirname,'../..'),bundle:'unused',profile:'unused',history:ui.history,registration:flow,visible:false});
  t.after(()=>host.close());await host.open();
  const ask=text=>ui.handlers.get('screen-qa:ask')(ui.event(host.panel),{text});
  const review=await ask(text);
  assert.ok(review.reviewId);
  for(const value of Object.values(expected))assert.ok(review.fields.includes(value),review.fields);
  assert.deepEqual(f.calls,[]);
  now=Date.parse('2026-11-23T00:01:00+09:00');
  assert.match((await ask('确认登记')).text,/已登记/);
  assert.deepEqual(f.writes.map(w=>w.body),[{...expected,level:'中'}]);
});

test('新增随手记只有确认时提供的图库回执进入业务记录',async t=>{
  const f=await fixture(t,{actions:[{type:'records.create',params:{body:'测试',category_id:'resource',photos:['https://fixture.test/unconfirmed']}}]});
  const flow=f.desktop(),plan=await flow.preview('新增随手记');
  const params=plan.chain.nodes[0].params;
  assert.equal(params.photos,undefined);
  params.photos=['https://fixture.test/photos/confirmed.png'];
  assert.equal((await flow.submitReviewed('新增随手记',plan)).status,'completed');
  assert.deepEqual(f.writes.map(w=>w.body.photos),[params.photos]);
});

const node = (key, type = 'hu-shi.event.create', params = {}) => ({ key, type, params, target_device_id: null });

test('转录作业按自己的提交号恢复，已完成批次重放不会重复写入',async t=>{
  const f=await fixture(t);
  const {plan,missing}=await prepareConversationBatch([
    {id:'1-1',type:'hu-shi.exercise.create',params:{body:'昨天跑了五公里'},dependsOn:[]},
    {id:'1-2',type:'reminders.create',params:{title:'交材料',deadline:'2099-05-12T15:00',content:'先核对发票。',level:'中'},dependsOn:[]},
  ],async path=>{
    const response=await f.call(path);
    return Response.json(response.body,{status:response.status});
  });
  assert.deepEqual(missing,[]);
  assert.equal(f.writes.length,0);
  let submission;
  const issued=id=>{submission=id;};
  assert.equal((await f.desktop().submitBatch('transcription',plan,undefined,issued)).status,'completed');
  assert.ok(submission);
  assert.equal((await f.desktop().submitBatch('transcription',plan,submission,issued)).status,'completed');
  assert.equal(f.calls.filter(call=>call.path==='/api/task-submissions').length,1);
  assert.deepEqual(f.writes.map(({path})=>path),['/api/records/hu-shi/exercise/entries','/api/reminders']);
  assert.equal(f.writes[0].body.body,'昨天跑了五公里');
  assert.deepEqual(f.writes[1].body,{title:'交材料',deadline:'2099-05-12T15:00',content:'先核对发票。',level:'中'});
});

test('日记登记从气泡在本机生成并复审，云端只读模板，确认后登记一次',async t=>{
  const f=await fixture(t);
  const stages=[],logs=[];
  const interactionWork=createInteractionWork({model:{async work(input,options){
    stages.push(options.tier);
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.match(input,/江边看见银杏/);
    return options.schema.properties.selected?{selected:1,feedback:'原文完整'}:
      {actions:[{type:'diaries.create',params:{}}],pending:[]};
  }}});
  const ui=questionFixture();
  const host=attachScreenQuestion(ui.electron,{win:ui.win,root:join(import.meta.dirname,'../..'),bundle:'unused',profile:'unused',
    history:ui.history,registration:f.desktop(),interactionWork,log:event=>logs.push(event),visible:false});
  t.after(()=>host.close());await host.open();
  const ask=text=>ui.handlers.get('screen-qa:ask')(ui.event(host.panel),{text});
  const text='帮我登记日记：同事提醒我不要登记重复资料，今天在江边看见银杏。';
  assert.match((await ask('帮我登记日记')).text,/想记下什么事/);
  assert.deepEqual(f.calls,[]);
  const draft=await ask(text);
  assert.ok(draft.reviewId);
  assert.match(draft.fields,/标题：绯月助记/);
  assert.ok(draft.fields.includes(text));
  assert.deepEqual(stages,['main','main']);
  assert.ok(logs.at(-1).local_ms>0);
  assert.equal(logs.at(-1).cloud_ms,0);
  assert.deepEqual(f.calls,[{path:'/api/assistant/recording-plan',method:'GET'}]);
  assert.equal(f.env.input,undefined);
  assert.equal(f.writes.length,0);
  assert.match((await ask('确认登记')).text,/已登记/);
  assert.match((await ask('确认登记')).text,/没有待确认/);
  assert.deepEqual(f.writes.map(write=>[write.path,write.body.content]),[['/api/diaries',text+'❤️']]);
});

test('明确的两项混合登记限制在原文的事项、顺序与东京日期',async t=>{
  const f=await fixture(t);
  const work=createInteractionWork({model:{async work(input,{schema}){
    if(schema.properties.selected)return {selected:1,feedback:''};
    const {明确事项:actions}=JSON.parse(input).原始输入;
    assert.equal(schema.properties.actions.maxItems,2);
    return {actions,pending:[]};
  }}});
  const plan=await f.desktop().preview('帮我登记两项：午餐吃了一碗荞麦面。另外提醒我 明天 检查资料。',
    {work,submittedAt:Date.parse('2026-11-21T23:59:59+09:00')});
  const [food,reminder]=plan.chain.nodes;
  assert.equal(food.type,'hu-shi.food.create');
  assert.match(food.params.body,/午餐吃了一碗荞麦面/);
  assert.equal(reminder.type,'reminders.create');
  assert.equal(reminder.params.deadline,'2026-11-22');
  assert.equal(reminder.depends_on,undefined);
  assert.deepEqual(f.calls,[{path:'/api/assistant/recording-plan',method:'GET'}]);
  assert.equal(f.writes.length,0);
});

test('只说登记日记时保留正文输入，字段里的其他指令仍只是日记内容',async t=>{
  const f=await fixture(t),ui=questionFixture(),stages=[];
  const work=createInteractionWork({model:{async work(input,{schema}){
    if(schema.properties.selected){stages.push('复审');return {selected:1,feedback:''};}
    stages.push('生成');
    assert.equal(schema.properties.actions.maxItems,1);
    return {actions:[{type:'diaries.create',params:{}}],pending:[]};
  }}});
  const host=attachScreenQuestion(ui.electron,{win:ui.win,root:join(import.meta.dirname,'../..'),bundle:'unused',profile:'unused',
    history:ui.history,registration:f.desktop(),interactionWork:work,visible:false});
  t.after(()=>host.close());await host.open();
  const ask=text=>ui.handlers.get('screen-qa:ask')(ui.event(host.panel),{text});
  const missing=await ask('帮我登记日记：');
  assert.ok(missing.reviewId);
  assert.deepEqual(f.calls,[]);
  const body='今天整理了资料。另外提醒我明天带伞。';
  const event=ui.event(host.inquiryPanel);
  const response=await ui.handlers.get('registration-review:decide')(event,missing.reviewId,{action:'send',values:[body]});
  assert.equal(response.state,'answer');
  const draft=ui.handlers.get('registration-review:get')(event);
  assert.ok(draft.canConfirm);
  assert.ok(draft.fields.includes(body));
  assert.deepEqual(stages,['生成','复审']);
  assert.equal(f.writes.length,0);
  await ask('确认登记');
  assert.deepEqual(f.writes.map(w=>[w.path,w.body.content]),[['/api/diaries','帮我登记日记：'+body+'❤️']]);
});

test('混合计划中的第三条独立委托仍可由主力生成并复审',async t=>{
  const f=await fixture(t);
  const actions=[all[1],{type:'reminders.create',params:{content:'检查资料',deadline:'tomorrow'}},all[2]];
  let drafts=0;
  const work=createInteractionWork({model:{async work(input,{schema}){
    if(schema.properties.selected)return {selected:1,feedback:''};
    assert.equal(schema.properties.actions.maxItems,undefined);
    if(++drafts===1)return {actions:actions.slice(0,2),pending:[]};
    assert.match(input,/REGISTRATION_COUNT_MISMATCH/);
    return {actions,pending:[]};
  }}});
  const result=await f.desktop().preview('帮我登记三项：午餐吃了面条。另外提醒我明天检查资料。帮我登记运动，散步半小时。',{work});
  assert.deepEqual(result.chain.nodes.map(node=>node.type),actions.map(action=>action.type));
  assert.equal(drafts,2);
  assert.equal(f.calls.length,1);
  assert.equal(f.writes.length,0);
});

test('登记候补的最终复审暂时不可用，主动重试只复审原候选，确认后一次写入',async t=>{
  const f=await fixture(t,{actions:[{type:'diaries.create',params:{}}]});
  const ui=questionFixture(),stages=[];
  let online=false;
  const work=createInteractionWork({model:{async work(_input,options){
    stages.push(options.tier);
    return {error:'LOCAL_AI_MODEL_MISSING'};
  }},request:async()=>{
    stages.push('review');
    return online?Response.json({work:{selected:1,feedback:''}}):Response.json({error:{code:'AI_COOLDOWN'}},{status:503});
  }});
  const host=attachScreenQuestion(ui.electron,{win:ui.win,root:join(import.meta.dirname,'../..'),bundle:'unused',profile:'unused',
    history:ui.history,registration:f.desktop(),interactionWork:work,visible:false});
  t.after(()=>host.close());await host.open();
  const event=ui.event(host.panel),ask=text=>ui.handlers.get('screen-qa:ask')(event,{text});
  const pending=await ask('帮我登记日记：今天一起看银杏。');
  assert.equal(pending.code,'WORK_REVIEW_PENDING');
  assert.equal(pending.retryable,true);
  assert.equal(f.writes.length,0);
  online=true;
  const draft=await ui.handlers.get('screen-qa:retry')(event);
  assert.ok(draft.reviewId,draft.text);
  assert.deepEqual(stages,['main','upgrade','review','review']);
  assert.equal(f.calls.filter(row=>row.method==='POST').length,1);
  assert.equal(f.writes.length,0);
  assert.match((await ask('确认登记')).text,/已登记/);
  assert.equal(f.writes.length,1);
});

test('空云端候补按无效响应报告，旧登记协议仍兼容',async t=>{
  const f=await fixture(t,{actions:[]});
  const path='/api/assistant/recording-plan',text='登记隔离用例';
  const empty=await f.call(path,{text,submittedAt:Date.now()});
  assert.equal(empty.status,502);
  assert.equal(empty.body.error.code,'INVALID_AI_RESPONSE');
  assert.equal((await f.call(path,{text})).status,200);
  assert.equal(f.writes.length,0);
});

test('附件草案预览零业务写入，确认后复用原计划和提交号机制',async t=>{
  const f=await fixture(t),flow=f.desktop();
  const plan=await flow.preview('登记隔离用例');
  assert.equal(f.writes.length,0);
  assert.equal(f.calls.filter(x=>x.path==='/api/task-submissions').length,0);
  const result=await flow.submitReviewed('登记隔离用例',plan);
  assert.equal(result.status,'completed');
  assert.equal(f.writes.length,plan.chain.nodes.length);
  assert.equal(f.calls.filter(x=>x.path==='/api/assistant/recording-plan').length,1);
});

test('桌面提交一次后建一链，主动领取六类节点并等待显式前置', async t => {
  const f = await fixture(t);
  const desktop = f.desktop();
  const first = desktop.submit('登记隔离用例');
  assert.equal(desktop.submit('登记隔离用例'), first);
  const result = await first;
  assert.equal(result.status, 'completed');
  assert.equal(result.chain.nodes.length, 6);
  assert.equal([...f.events.values()].filter(event=>event.action==='已核实登记成功').length,6);
  assert.ok([...f.events.values()].some(event=>event.title==='运动记录'&&event.detail.includes('散步半小时')&&event.action==='发起云端登记'));
  assert.deepEqual(f.writes.map(write => write.path), [
    '/api/records/hu-shi/food/entries', '/api/records/hu-shi/exercise/entries', '/api/records/hu-shi/event/entries',
    '/api/diaries', '/api/records', '/api/reminders',
  ]);
  assert.equal(f.writes.at(-1).body.deadline, f.env.input.dates.tomorrow);
  assert.equal(f.writes[4].body.body, all[5].params.body+'❤️'); // 生产版登记计划在正文末尾加红心
  assert.deepEqual(new Set(f.writes.map(write => write.idempotencyKey)),
    new Set(result.chain.nodes.map(entry => entry.node_id)));
  assert.ok(result.chain.nodes.every(entry => entry.current_task.result?.record_id));
  assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS count FROM chains').get().count, 1);
  await assert.rejects(readFile(f.savedFile, 'utf8'), { code: 'ENOENT' });
});

test('建链和登记回执先后丢失，重启取回原链且已登记节点不重做', async t => {
  let inject = 'chain';
  const f = await fixture(t, {
    actions: all.slice(1, 3),
    fault(path, response) {
      if (path === '/api/chains' && response.status === 201 && inject === 'chain') {
        inject = 'execute'; throw Error('建链回执丢失');
      }
      if (path.endsWith('/execute') && response.ok && inject === 'execute') {
        inject = null; throw Error('执行回执丢失');
      }
    },
  });
  await assert.rejects(f.desktop().submit('登记两个隔离条目'), /建链回执丢失/);
  const created = JSON.parse(await readFile(f.savedFile, 'utf8'));
  await assert.rejects(f.desktop().resume(), /执行回执丢失/);
  assert.equal(JSON.parse(await readFile(f.savedFile, 'utf8')).submissionId, created.submissionId);
  const result = await f.desktop().resume();
  assert.equal(result.status, 'completed');
  assert.equal(result.chain.chain_id, created.submissionId);
  assert.equal(f.writes.length, 2);
  assert.equal(f.calls.filter(call => call.path === '/api/assistant/recording-plan').length, 1);
  assert.equal(f.calls.filter(call => call.path === '/api/task-submissions').length, 1);
});

test('服务器原子领取，前置未完成和其他账户的执行请求被拒绝', async t => {
  const entered = Promise.withResolvers();
  const barrier = Promise.withResolvers();
  const f = await fixture(t, { register: async () => {
    entered.resolve();
    await barrier.promise;
    return { id: 'test', created_at: 1 };
  } });
  const { body: chain } = await f.create([node('first'), { ...node('second'), depends_on: 'first' }]);
  const path = id => `/api/tasks/${id}/execute`;
  const [first, second] = chain.nodes.map(entry => entry.current_task.task_id);
  assert.equal((await f.call(path(first), {}, 'other')).status, 404);
  assert.equal((await f.call(`/api/chains/${chain.chain_id}`, undefined, 'other')).status, 404);
  assert.equal((await f.call(path(second), {})).body.error.code, 'REGISTRATION_BLOCKED');
  const executing = f.call(path(first), {});
  try {
    await Promise.race([entered.promise, executing.then(result => assert.fail(JSON.stringify(result)))]);
    assert.equal((await f.call(path(first), {})).status, 202);
    assert.equal((await f.call(path(second), {})).status, 409);
    assert.equal(f.writes.length, 1);
  } finally { barrier.resolve(); }
  assert.equal((await executing).body.status, 'COMPLETED');
  assert.equal((await f.call(path(first), {})).body.status, 'COMPLETED');
  assert.equal((await f.call(path(second), {})).body.status, 'COMPLETED');
  assert.equal(f.writes.length, 2);
});

test('最终失败等待决定，继续新轮保留同一业务编号并可跳过', async t => {
  let loseDecisionResponse = true;
  const f = await fixture(t, {
    actions: all.slice(1, 3),
    register: async operation => {
      if (operation.path.includes('/food/')) throw Object.assign(Error('拒绝'), { code: 'RECORDS_REJECTED' });
      return { id: 'test', created_at: 1 };
    },
    fault(path, response) {
      if (path.endsWith('/decision') && response.ok && loseDecisionResponse) {
        loseDecisionResponse = false;
        throw Error('继续回执丢失');
      }
    },
  });
  const initial = await f.desktop().submit('登记失败隔离用例');
  assert.equal(initial.status, 'needs_decision');
  assert.equal(f.writes.length, 2);
  const failed = initial.node;
  await assert.rejects(f.desktop().decide('continue'), /继续回执丢失/);
  const { body: continuation } = JSON.parse(await readFile(f.savedFile, 'utf8')).decision;
  const newTaskId = continuation.new_task_id;
  assert.notEqual(newTaskId, failed.current_task.task_id);
  assert.equal((await f.call(`/api/chains/${initial.chain.chain_id}`)).body.nodes[0].current_task.status, 'PENDING');
  const second = await f.desktop().resume();
  assert.equal(second.status, 'needs_decision');
  assert.equal(second.node.current_task.task_id, newTaskId);
  assert.deepEqual(new Set(f.writes.map(write => write.idempotencyKey)), new Set([failed.node_id]));
  assert.equal((await f.desktop().decide('skip')).status, 'completed');
  assert.equal(f.writes.length, 5);
});

test('登记结果未知时停在原节点，可停止原链，恢复不重写', async t => {
  const f = await fixture(t, { actions: all.slice(1, 3), register() { throw Error('业务提交后连接中断'); } });
  const result = await f.desktop().submit('验证未知回执');
  assert.equal(result.status, 'waiting');
  assert.match(result.node.current_task.activity.progress_message, /待核对/);
  assert.equal((await f.desktop().resume()).status, 'waiting');
  assert.equal(f.writes.length, 1);
  assert.equal((await f.desktop().decide('stop')).status, 'stopped');
  assert.equal(f.writes.length, 1);
});

test('解析保留待确认项，旧临时链同号重放后仍可领到原节点', async t => {
  const f = await fixture(t, {
    actions: [all[1]],
    pending: [{ type: 'records.create', question: '请选择分类' }],
  });
  const parsed = await f.call('/api/assistant/recording-plan', { text: '一项需要补分类' });
  assert.equal(parsed.status, 200);
  assert.equal(parsed.body.pending[0].type, 'records.create');
  const data = { ...parsed.body.chain, temporary_registration: true, submission_id: (await f.call('/api/task-submissions', {})).body.submission_id };
  const { body: legacy } = await f.call('/api/chains', data);
  f.db.sqlite.prepare('UPDATE chains SET temporary_registration=0 WHERE chain_id=?').run(legacy.chain_id);
  const replayed = await f.call('/api/chains', data);
  assert.equal(replayed.status, 200);
  assert.equal(replayed.body.temporary_registration, true);
  assert.equal((await f.call(`/api/tasks/${legacy.nodes[0].current_task.task_id}/execute`, {})).status, 200);
  assert.equal(f.writes.length, 1);
});

test('鱼与熊掌：确认前展示四栏，标题与完整正文写入真实接口对应字段',async t=>{
  const url='https://posewear.pages.dev/#portrait';
  const text='我要登记一个资源：['+url+']('+url+') ，这是个包含成人要素的姿势服装参考网站，后面可以拿来用。';
  const title='成人向姿势与服装参考网站';
  const f=await fixture(t,{actions:[{type:'resources.create',params:{title,body:'摘要',url:'https://model.invalid/'}}]});
  const ui=questionFixture(),flow=f.desktop();
  const host=attachScreenQuestion(ui.electron,{win:ui.win,root:join(import.meta.dirname,'../..'),bundle:'unused',profile:'unused',history:ui.history,registration:flow,visible:false});
  t.after(()=>host.close());await host.open();
  const ask=text=>ui.handlers.get('screen-qa:ask')(ui.event(host.panel),{text});
  const review=await ask(text);
  assert.ok(review.reviewId,review.text);
  for(const field of ['标题：'+title,'正文：'+text,'分类：其他','网址：'+url])assert.ok(review.fields.includes(field),review.fields);
  assert.equal(f.writes.length,0);
  assert.match((await ask('确认登记')).text,/已登记/);
  assert.deepEqual(f.writes.map(({path,body})=>({path,body})),[{path:'/api/resources',body:{body:title,note:text,url,category_id:'other'}}]);
});
