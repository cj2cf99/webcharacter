import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {prepareMainSiteTask} from '../agent/host/main-site-task-adapter.mjs';
import {createConversationTranscription,prepareConversationBatch} from '../desktop/conversation-transcription.mjs';

const root = new URL('../', import.meta.url);
const cwd = fileURLToPath(root);
const read = path => readFileSync(new URL(path, root), 'utf8');
const readSkill = hint => JSON.parse(execFileSync('python', ['-B', 'skills/catalog.py', hint], {cwd, encoding: 'utf8'}));
const skill = readSkill('conversationTranscription');

test('转录通过绯月技能目录读取同版本资产，普通登记仍走原入口', () => {
  const reread = readSkill('conversationTranscription');
  assert.equal(skill.skill, 'conversation-transcription');
  assert.deepEqual(reread, skill);
  const version = skill.version.replace('.', '-');
  const directory = `skills/conversation-transcription/versions/conversation-transcription-v${version}/`;
  for (const [field, file] of [['localAi', 'local-ai.json'], ['schemas', 'schemas.json'], ['templates', 'templates.json']]) {
    assert.deepEqual(skill[field], JSON.parse(read(directory + file)));
  }
  assert.equal(readSkill('registration').skill, 'record-submission');
});

test('三阶段结构引用完整，写入和确认由宿主决定', () => {
  const {localAi, schemas, templates} = skill;
  assert.deepEqual(localAi.policy, {
    localOnly: true, interruptible: false, keepModelSession: true, timeBudgetMs: 600_000, maxCorrections: 1,
  });
  function checkReferences(value) {
    if (value === null || typeof value !== 'object') return;
    if (value.$ref) {
      assert.match(value.$ref, /^#\/\$defs\//u);
      assert.ok(Object.hasOwn(schemas.$defs, value.$ref.split('/').at(-1)));
    }
    for (const child of Object.values(value)) checkReferences(child);
  }
  for (const phase of ['organize', 'recover', 'classify', 'review']) {
    assert.ok(localAi[phase]?.trim());
    assert.equal(schemas[phase].additionalProperties, false);
    checkReferences(schemas[phase]);
  }
  checkReferences(schemas.$defs);
  const fields = schemas.$defs.candidate.properties;
  assert.deepEqual(new Set(fields.type.enum), new Set(Object.keys(templates.templates)));
  for (const field of ['approved', 'submissionId', 'path', 'cloudFallback']) assert.equal(Object.hasOwn(fields, field), false);
  for (const field of ['category_id', 'photos']) assert.equal(Object.hasOwn(fields.params.properties, field), false);
  assert.equal(fields.dependsOn.maxItems, 1);
});

const emptySummary={summary:'对话已读取',actions:[],requests:[],signals:[],recentFactIds:[]};
async function preview(t,text,steps){
  const profile=mkdtempSync(join(tmpdir(),'feiyue-transcript-test-'));
  let calls=0,sessions=0;
  const store=createConversationTranscription({profile,safeStorage:{encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()},
    model:{async withWorkSession(_id,_signal,run){
      sessions++;
      return run(async(value,options)=>steps[calls++](JSON.parse(value),options));
    }},loadSkill:async()=>skill,prepareBatch:()=>assert.fail('预览不提交')});
  t.after(async()=>{await store.close();rmSync(profile,{recursive:true,force:true});});
  store.turn('case',{id:'u',text,at:Date.parse('2026-11-22T21:30:00+09:00')});
  store.seal('case');
  const deadline=Date.now()+2000;
  while(Date.now()<deadline){
    const result=store.detail('case');
    if(['ready','empty','failed'].includes(result.state)){
      assert.equal(sessions,1);assert.equal(calls,steps.length);return result;
    }
    await delay(15);
  }
  assert.fail('本地模拟未完成');
}

test('长消息的空归纳会逐段补查，同日实际行为合为日记且保留专项和提醒',async t=>{
  const result=await preview(t,['我下午去市场，买了两盒牛奶，还买了 6 个橘子。','今天晚饭煮了一碗荞麦面。',
    '明天记得给乌龟喂一点。','接下来要迁移服务器。希望桌宠能陪我练英语，这个点子可以记下来。','同事提到的故障暂不处理。'].join('\n'),[
    ()=>emptySummary,
    (input,{schema})=>{
      assert.deepEqual(input.reviewIds,['u1','u1-2','u1-3','u1-4','u1-5']);
      assert.deepEqual(schema.required,input.reviewIds);
      return {u1:{kind:'fact',title:'逛市场',body:'下午去市场买了两盒牛奶。'},
        'u1-2':{kind:'fact',title:'荞麦面晚餐',body:'晚饭煮了一碗荞麦面。'},
        'u1-3':{kind:'reminder',title:'给乌龟喂食',body:'明天给乌龟喂一点。'},
        'u1-4':{kind:'note',title:'英语陪练',body:'让桌宠陪我练英语。'},'u1-5':{kind:'skip',title:'',body:''}};
    },
    input=>{
      assert.equal(input.candidates.length,4);
      return {issues:[]};
    },
  ]);
  assert.equal(result.state,'ready',result.error);
  const rows=new Map(result.result.rows.map(row=>[row.type,row]));
  assert.equal(result.result.rows.length,4);
  assert.equal(rows.get('diaries.create').params.title,'[逛市场、荞麦面晚餐]绯月助记-2026-11-22 21:30:00');
  assert.match(rows.get('diaries.create').params.content,/^记录\n[\s\S]+\n❤️$/u);
  assert.match(rows.get('diaries.create').params.content,/两盒牛奶，还买了 6 个橘子/u);
  assert.match(rows.get('hu-shi.food.create').params.body,/^吃喝\n.+一碗荞麦面.+\n❤️$/u);
  assert.equal(rows.get('reminders.create').params.deadline,'2026-11-23');
  assert.equal(rows.get('records.create').params.body,'事项\n让桌宠陪我练英语。\n❤️');
  assert.match(rows.get('records.create').evidence[0].quote,/迁移服务器/u);
  assert.ok(result.result.rows.every(row=>row.missing.length===0));
  assert.ok(result.result.rows.every(row=>row.evidence.every(ref=>ref.sourceId!=='u1-5')));
});

test('逐段核对明确跳过后仍可判定为无候选',async t=>{
  const result=await preview(t,'晚安呀，今天和你聊天很开心。',[
    ()=>emptySummary,()=>({u1:{kind:'skip',title:'',body:''}}),
  ]);
  assert.equal(result.state,'empty',result.error);
  assert.deepEqual(result.result.rows,[]);
});

test('提醒正文和日期与明确原话冲突时，模板保留原日期和明确前置',async t=>{
  const result=await preview(t,'明天提醒我给田中回信，回信前先看周报。',[
    ()=>emptySummary,
    ({organized})=>({candidates:[{id:'reminder',type:'reminders.create',
      matterIds:[organized.requests[0].id],params:{title:'给田中回信',deadline:'2026-11-24',content:'先打开邮箱。'}}],notes:[]}),
    ()=>({issues:[]}),
  ]);
  assert.equal(result.state,'ready',result.error);
  assert.equal(result.result.rows.length,1);
  const {params,missing}=result.result.rows[0];
  assert.deepEqual(missing,[]);
  assert.equal(params.title,'[给田中回信]绯月助记-2026-11-22 21:30:00');
  assert.equal(params.deadline,'2026-11-23');
  assert.equal(params.content,'事项\n给田中回信\n\n准备条件\n回信前先看周报\n❤️');
});

test('资源与运动使用固定版式，清除重复署名和尾心，一键事件维持空参数',async t=>{
  const result=await preview(t,['这个色板网站我很喜欢 https://example.invalid/palette ，以后做原型要参考色板。',
    '我昨天去游泳了。','我昨天撸管了。'].join('\n'),[
    ()=>emptySummary,
    ()=>({u1:{kind:'resource',title:'【色板\n参考网站灵感合集测试】绯月助记-2000-01-01 00:00:00',body:'资源说明：以后做原型参考。 ❤️\n❤'},
      'u1-2':{kind:'exercise',title:'游泳',body:'游泳了。'},'u1-3':{kind:'event',title:'事件',body:'昨天发生。'}}),
    ()=>({issues:[]}),
  ]);
  assert.equal(result.state,'ready',result.error);
  const rows=new Map(result.result.rows.map(row=>[row.type,row.params]));
  assert.deepEqual(rows.get('resources.create'),{title:'[色板 参考网站灵感合]绯月助记-2026-11-22 21:30:00',body:'资源说明\n以后做原型参考。\n❤️',url:'https://example.invalid/palette'});
  assert.equal(rows.get('hu-shi.exercise.create').body,'运动\n游泳了。\n❤️');
  assert.deepEqual(rows.get('hu-shi.event.create'),{});
});

test('提醒缺标题时从正文生成，正文加栏名和红心超限时留作待补',async t=>{
  const text='这个色板网站我很喜欢，希望以后参考。\n明天整理开发目录和旧的测试记录。\n这个资源也值得留存。';
  const long='用'.repeat(2000);
  const result=await preview(t,text,[()=>emptySummary,
    ()=>({u1:{kind:'resource',title:'色板参考',body:long},'u1-2':{kind:'reminder',title:'',body:'整理开发目录和旧的测试记录。'},
      'u1-3':{kind:'resource',title:'',body:'这个资源值得留存。'}}),
    ()=>({issues:[]}),
  ]);
  assert.equal(result.state,'ready',result.error);
  const rows=new Map(result.result.rows.map(row=>[row.type,row]));
  assert.equal(rows.get('reminders.create').params.title,'[整理开发目录和旧的测]绯月助记-2026-11-22 21:30:00');
  assert.deepEqual(rows.get('reminders.create').missing,[]);
  const resources=result.result.rows.filter(row=>row.type==='resources.create');
  assert.equal(resources[0].params.body,'资源说明\n'+long+'\n❤️');
  assert.deepEqual(resources[0].missing,['正文超出登记上限']);
  assert.equal(resources[1].params.title,undefined);
  assert.deepEqual(resources[1].missing,['title']);
});

test('七个本地草稿模板的字段兼容现有业务模板和适配器', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const path of ['migrations/001-task-units.sql', 'seeds/tasklist-hu-shi.sql', 'seeds/tasklist-registration.sql']) {
    db.exec(read('agent/' + path));
  }
  const examples = {
    'diaries.create': {title: '跑步与午饭', content: '昨天跑了 5 公里，午饭吃了荞麦面。'},
    'hu-shi.food.create': {body: '午饭吃了荞麦面。'},
    'hu-shi.exercise.create': {body: '昨天跑了 5 公里。'},
    'hu-shi.event.create': {},
    'records.create': {body: '想给示例项目增加导出功能。'},
    'reminders.create': {title: '给田中回信', content: '回信前先查看周报。', deadline: '2026-11-23'},
    'resources.create': {title: '色板参考网站', body: '以后做原型时参考其中的颜色搭配。', url: 'https://example.invalid/palette'},
  };
  const find = db.prepare('SELECT executor,parameter_spec_json FROM tasklist WHERE type=?');
  for (const [type, template] of Object.entries(skill.templates.templates)) {
    const row = find.get(type);
    assert.ok(row, type);
    const spec = JSON.parse(row.parameter_spec_json);
    const supported = new Set(Object.keys(spec));
    for (const field of [...template.required, ...Object.keys(template.defaults ?? {}),
      ...(template.suggested ?? []), ...(template.optional ?? []), ...(template.optionalFromSource ?? [])]) {
      assert.ok(supported.has(field), `${type}.${field}`);
    }
    const params = {...template.fixedParams, ...template.defaults, ...examples[type]};
    for (const [field, label] of Object.entries(template.catalogDefaults ?? {})) {
      assert.equal(label, 'AI登记内容');
      assert.ok(supported.has(field));
      params[field] = 'fixture-ai-registration';
    }
    assert.ok(template.required.every(field => Object.hasOwn(params, field)), type);
    const request = prepareMainSiteTask({task_id: 'test-draft', type, params, target_device_id: null,
      definition: {executor: row.executor, parameter_spec: spec}});
    assert.ok(request.path.startsWith('/api/'));
    if (type === 'hu-shi.event.create') assert.deepEqual(request.body, {});
    if (type === 'reminders.create') assert.equal(request.body.level, '中');
  }
});

test('已确认的草稿按业务目录核对分类和时分，前置关系从本机节点转换',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(read('agent/migrations/001-task-units.sql'));db.exec(read('agent/seeds/tasklist-registration.sql'));
  const catalog=db.prepare('SELECT type,parameter_spec_json FROM tasklist').all()
    .map(row=>({...row,parameter_spec:JSON.parse(row.parameter_spec_json)}));
  let reads=0;
  const request=async(path,options)=>{
    assert.equal(path,'/api/assistant/recording-plan');assert.equal(options.method,'GET');reads++;
    return Response.json({catalog,categories:[{id:'notes-ai',name:'AI登记内容'}],resourceCategories:[{id:'resource-ai',name:'AI登记内容'}]});
  };
  const clock=()=>Date.parse('2026-11-22T21:30:00+09:00');
  const rows=[{id:'note',type:'records.create',dependsOn:[],categoryLabel:'AI登记内容',params:{body:'项目想法'}},
    {id:'reminder',type:'reminders.create',dependsOn:['note'],params:{title:'回信',deadline:'2026-11-23T15:00'}},
    {id:'resource',type:'resources.create',dependsOn:[],categoryLabel:'AI登记内容',params:{title:'参考色板',body:'以后用'}}];
  const result=await prepareConversationBatch(rows,request,clock);
  assert.equal(reads,1);assert.deepEqual(result.missing,[]);
  assert.equal(result.plan.chain.nodes[0].params.category_id,'notes-ai');
  assert.equal(result.plan.chain.nodes[1].params.deadline,'2026-11-23T15:00');
  assert.equal(result.plan.chain.nodes[1].depends_on,'note');
  assert.equal(result.plan.chain.nodes[2].params.category_id,'resource-ai');
  const rejected=await prepareConversationBatch([{...rows[1],params:{title:'已过的提醒',deadline:'2026-11-22T20:30'}}],request,clock);
  assert.equal(rejected.missing[0].id,'reminder');assert.equal(rejected.plan.chain.nodes.length,0);
  const unavailable=await prepareConversationBatch([
    {...rows[0],id:'missing-category',categoryLabel:'不存在的分类'},
    {...rows[1],id:'missing-template',type:'model.created.type'},
    {...rows[1],id:'invalid-date',params:{title:'无效日期',deadline:'2026-11-31'}},
    {...rows[0],id:'unsupported-field',params:{body:'项目想法',photos:['fake','unsupported'],cloudFallback:true}},
  ],request,clock);
  assert.deepEqual(unavailable.missing.map(item=>item.id),['missing-category','missing-template','invalid-date','unsupported-field']);
  assert.equal(unavailable.plan.chain.nodes.length,0);
});
