import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {readFile, readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {resolve} from 'node:path';

const main = process.env.FEIYUE_MAIN_DIR || 'G:/cloudflare/myapp';
const api = process.env.FEIYUE_API_DIR || 'G:/selftool/informationManage/api-worker';
const require = createRequire(main + '/package.json');
const {build} = require('esbuild');
const {Miniflare, convertV4MiniflareOptions} = require('miniflare');
const serve = process.argv.includes('--serve');
const visual = process.argv.includes('--visual-check');
const input = '  今天整理了项目资料。\n明天再核对结果。  ';
const ownerSub = 'local-review-owner', issuer = 'https://review-access.example.test';
const previewOwner = 'own_' + createHash('sha256').update(issuer + '|' + ownerSub).digest('hex').slice(0, 32);
const desktop = new URL('../desktop/', import.meta.url);
const previewHtml = (await readFile(new URL('reminder-review.html', desktop), 'utf8'))
  .replace("script-src 'self'", "script-src 'self'; connect-src 'self'")
  .replace('src="reminder-review-ui.mjs"', 'src="bridge.mjs"');
const previewBridge = `
import {createReminderReviewFlow} from './reminder-review-flow.mjs';
const flow=createReminderReviewFlow({request:async (path,options)=>fetch('/api/companion'+path.slice('/api'.length),options)});
window.reminderReview={load:flow.load,apply:flow.apply};
await import('./reminder-review-ui.mjs');`;
const previewAssets = {
  '/preview/today/': ['text/html; charset=utf-8', previewHtml],
  '/preview/today/bridge.mjs': ['text/javascript; charset=utf-8', previewBridge],
  '/preview/today/reminder-review.css': ['text/css; charset=utf-8', await readFile(new URL('reminder-review.css', desktop), 'utf8')],
  '/preview/today/reminder-review-ui.mjs': ['text/javascript; charset=utf-8', await readFile(new URL('reminder-review-ui.mjs', desktop), 'utf8')],
  '/preview/today/reminder-review-flow.mjs': ['text/javascript; charset=utf-8',
    await readFile(new URL('reminder-review-flow.mjs', desktop), 'utf8')],
  '/preview/agent/host/reminder-review.mjs': ['text/javascript; charset=utf-8',
    await readFile(new URL('../agent/host/reminder-review.mjs', desktop), 'utf8')],
};
const actions = [
  {type:'hu-shi.food.create', params:{body:'午餐面条'}},
  {type:'hu-shi.exercise.create', params:{body:'散步半小时'}},
  {type:'hu-shi.event.create', params:{}},
  {type:'diaries.create', params:{}},
  {type:'records.create', params:{body:'合成资源 https://example.test', category_id:'fixture-resource'}},
  {type:'reminders.create', params:{content:'检查资料',deadline:'tomorrow'}},
];
async function bundle(contents, resolveDir) {
  return (await build({stdin:{contents,resolveDir}, bundle:true,write:false,format:'esm',platform:'browser',
    external:['cloudflare:workers']})).outputFiles[0].text;
}
const client = await readFile(main + '/src/client/companion/chains.js','utf8');
const style = await readFile(main + '/src/client/companion/chains.css','utf8');
const shellAssets = Object.fromEntries(await Promise.all([
  ['styles/shell.css','text/css'], ['styles/theme.css','text/css'],
  ['shell/theme.js','text/javascript'],['shell/navigation.js','text/javascript'],
].map(async ([path,mime])=>['/assets/'+path,[mime,await readFile(main+'/src/client/'+path,'utf8')]])));
const mainScript = await bundle(`
import {WorkerEntrypoint} from 'cloudflare:workers';
import {companionGateway} from './src/features/companion/gateway.js';
import {companionReminderReview} from './src/features/companion/reminder-review-gateway.js';
import {createChainPage} from './src/features/companion/vendor/chain-page.mjs';
import {shell} from './src/pages/navigation.js';
function gateway(env) {
  return companionGateway(env,{fetcher: async url => {
    if (url !== 'https://api.deepseek.com/chat/completions') return new Response(null,{status:503});
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({actions:${JSON.stringify(actions)},pending:[]})}}]});
  }});
}
export class CompanionHost extends WorkerEntrypoint {
  providers(){return gateway(this.env).providers()}
  attempt(provider,input){return gateway(this.env).attempt(provider,input)}
  categories(){return gateway(this.env).categories()}
  lookup(key,path){return gateway(this.env).lookup(key,path)}
  reviewReminders(){return companionReminderReview(this.env,'list')}
  reviewReminderStatus(id){return companionReminderReview(this.env,'status',id)}
  changeReviewReminder(id,command){return companionReminderReview(this.env,'change',id,command)}
  async register(operation){
    const data=gateway(this.env);
    const [result,replayed]=await Promise.all([data.register(operation),data.register(operation)]);
    if(JSON.stringify(result)!==JSON.stringify(replayed))throw Error('Concurrent receipts differ');
    return operation.path.includes('/food/') && result.receipt ? {unknown:true} : result;
  }
}
const page=createChainPage({shell,script:${JSON.stringify(client)},style:${JSON.stringify(style)},
  authorize:request=> ${serve || visual} || request.headers.get('x-fixture-owner')==='yes' ? {sub:'fixture-user'} : null});
const assets=${JSON.stringify(shellAssets)};
const reviewAssets=${JSON.stringify(previewAssets)};
export default {async fetch(request,env) {
  const path=new URL(request.url).pathname;
  if(reviewAssets[path])return new Response(reviewAssets[path][1],{headers:{'Content-Type':reviewAssets[path][0]}});
  if(path==='/api/companion/reminder-review'||path.startsWith('/api/companion/reminder-review/')) {
    const headers=new Headers(request.headers);
    headers.set('x-fixture-machine','yes');
    return env.SUBSCRIPTIONS_PREVIEW.fetch(new Request(request,{headers}));
  }
  const asset=assets[path];
  if(asset)return new Response(asset[1],{headers:{'Content-Type':asset[0]}});
  return await page(request,env) ?? new Response(null,{status:404});
}};`, main);
const apiScript = await bundle(`
import application from './src/index.js';
export {OwnerGateway} from './src/entrypoint.js';
export default {fetch(request,env) {
  const access=request.headers.get('x-fixture-machine')==='yes'?{
    aud:'fixture-aud',getIdentity:()=>({service_token_status:true,common_name:'fixture-machine'})
  }:undefined;
  return application.fetch(request,env,{access});
}};`, api);
const runtime = new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:serve?8788:0,cf:false,workers:[
  {name:'main-isolated',modules:true,compatibilityDate:'2026-10-27',script:mainScript,
    d1Databases:{mymaindb:'isolated-main-paid-fallback'},d1Persist:false,
    bindings:{COMPANION_ENABLED:'true',deepseekLanguage:'fixture-no-real-key',
      APP_ENV:'test',ACCESS_MODE:'mock',ACCESS_ISSUER:issuer,ACCESS_AUD:'fixture-aud',ALLOWED_OWNER_SUBS:ownerSub},
    serviceBindings:{SUBSCRIPTIONS_API:{name:'subscriptions-isolated',entrypoint:'OwnerGateway'},
      SUBSCRIPTIONS_PREVIEW:'subscriptions-isolated'}},
  {name:'subscriptions-isolated',modules:true,compatibilityDate:'2026-10-27',script:apiScript,
    d1Databases:{COMPANION_DB:'isolated-tasks'},d1Persist:false,bindings:{ACCESS_AUD:'fixture-aud'},
    serviceBindings:{COMPANION_HOST:{name:'main-isolated',entrypoint:'CompanionHost'}}},
]}));

async function apply(db, text) {
  const triggers=[];
  const statements=text.replace(/^\s*--[^\r\n]*/gm,'').replace(/CREATE TRIGGER\b[\s\S]*?\nEND;/gi, trigger=>{
    triggers.push(trigger);
    return '';
  }).split(';').map(value=>value.trim()).filter(Boolean);
  if(statements.length || triggers.length)await db.batch([...statements,...triggers].map(statement=>db.prepare(statement)));
}
try {
  const db = await runtime.getD1Database('mymaindb','main-isolated');
  const taskDb = await runtime.getD1Database('COMPANION_DB','subscriptions-isolated');
  const migrationRoot = join(api,'src/companion/agent/migrations');
  const schema=await readFile(main+'/docs/design/database/schema.sql','utf8');
  for(const name of ['reminders','diaries']) {
    const sql=new RegExp('CREATE TABLE IF NOT EXISTS "'+name+'"\\([\\s\\S]*?\\);').exec(schema)?.[0];
    assert.ok(sql, name);
    await apply(db,sql);
  }
  await apply(db,`CREATE TABLE plan_dispatches(id TEXT PRIMARY KEY, owner_id TEXT, lifecycle TEXT, kind TEXT, business_date TEXT);
    CREATE TABLE reminder_links(target_todo_id TEXT);
    CREATE TABLE special_member_days(owner_id TEXT,id TEXT,data_json TEXT);`);
  for(const file of ['0020_records.sql','0022_records_parent.sql','0030_hu_shi.sql','0031_companion_registration_receipts.sql']) {
    await apply(db,await readFile(join(main,'migrations',file),'utf8'));
  }
  await db.prepare('INSERT INTO ra_categories(id,name) VALUES (?,?)').bind('fixture-resource','资源').run();
  for(const file of (await readdir(migrationRoot)).sort())await apply(taskDb,await readFile(join(migrationRoot,file),'utf8'));
  for(const file of ['tasklist-hu-shi.sql','tasklist-registration.sql']) {
    await apply(taskDb,await readFile(join(api,'src/companion/agent/seeds',file),'utf8'));
  }
  const w=await runtime.getWorker('subscriptions-isolated');
  const call=(path,body,auth=true)=>w.fetch('http://127.0.0.1/api/companion'+path,{
    method:body===undefined?'GET':'POST',
    headers:{'Content-Type':'application/json',...(auth?{'x-fixture-machine':'yes'}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
  assert.equal((await call('/health',undefined,false)).status,403);
  assert.equal((await call('/health')).status,200);
  const parsed=await call('/assistant/recording-plan',{text:input});
  const plan=await parsed.json();
  assert.equal(parsed.status,200,JSON.stringify(plan));
  assert.equal(plan.chain.nodes.length,6);
  assert.equal(plan.ai.attempts.at(-1).provider,'deepseek');
  const issue=await (await call('/task-submissions',{})).json();
  const request={...plan.chain,submission_id:issue.submission_id,temporary_registration:true};
  const result=await call('/chains',request);
  assert.equal(result.status,201);
  const chain=await result.json();
  assert.equal((await call('/chains',request)).status,200);
  const [first,...remaining]=chain.nodes.map(node=>'/tasks/'+node.current_task.task_id);
  const begin=await call(first+'/execute',{});
  assert.equal(begin.status,202,await begin.text());
  const recovered=await Promise.all([call(first+'/receipt',{}),call(first+'/receipt',{})]);
  for (const response of recovered) assert.equal((await response.json()).status,'COMPLETED');
  assert.equal((await call(first+'/execute',{})).status,200);
  for(const path of remaining){
    const response=await call(path+'/execute',{});
    const value=await response.json();
    assert.equal(response.status,200,JSON.stringify(value));
    assert.equal(value.status,'COMPLETED',JSON.stringify(value));
  }
  assert.equal((await db.prepare('SELECT count(*) AS n FROM companion_registration_receipts').first()).n,6);
  for(const [table,count] of [['ra_hushi_records',3],['ra_records',1],['diaries',1],['reminders',1]]) {
    assert.equal((await db.prepare('SELECT count(*) AS n FROM '+table).first()).n,count);
  }
  const diary = await db.prepare('SELECT title,content FROM diaries').first();
  assert.match(diary.title, /^绯月助记-\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(diary.content,input+'❤️');
  assert.deepEqual(await db.prepare('SELECT title,content FROM reminders').first(),{title:'检查资料 · 绯月助记',content:'检查资料❤️'});
  const emptyReview = await (await call('/reminder-review')).json();
  assert.ok(emptyReview.today);
  const {today, tomorrow} = emptyReview;
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0,10);
  const seedReminder = (seq,title,due,recurrence=null,dispatch=null) => db.prepare(`INSERT INTO reminders
    (seq,title,content,deadline,level,isPinned,isFinished,regDatetime,CloseDatetime,recurrence,planner_dispatch_id)
    VALUES (?,?,'',?,'中',0,0,'fixture-registration','',?,?)`).bind(seq,title,due,recurrence,dispatch);
  const member = {id:'fixture-member', name:'验收会员日', note:'', enabled:true,
    days:{all:[Number(today.slice(8))],odd:[],even:[]}};
  await db.batch([
    seedReminder(1000,'验收逾期',yesterday+'T10:10:00+09:00'),
    seedReminder(1001,'验收循环',today,JSON.stringify({v:1,mode:'interval',days:2})),
    seedReminder(1002,'验收保留',today), seedReminder(1003,'验收计划',today,null,'locked-plan'),
    seedReminder(1004,'验收缴费',today), seedReminder(1005,'验收其他账户',today,null,'other-plan'),
    db.prepare("INSERT INTO plan_dispatches VALUES ('locked-plan',?,'pending','task',?)").bind(previewOwner,today),
    db.prepare("INSERT INTO plan_dispatches VALUES ('other-plan','other-owner','pending','task',?)").bind(today),
    db.prepare("INSERT INTO reminder_links VALUES ('1004')"),
    db.prepare('INSERT INTO special_member_days VALUES (?,?,?)').bind(previewOwner,member.id,JSON.stringify(member)),
  ]);
  assert.equal((await call('/reminder-review',undefined,false)).status,403);
  const review = await (await call('/reminder-review')).json();
  assert.deepEqual(new Map(review.items.map(item=>[item.id,item.group])),new Map([
    [1000,'overdue'],[1001,'today'],[1002,'today'],[1003,'locked'],[1004,'locked'],[`member:${member.id}:${today}`,'locked'],
  ]));
  const change = (id, action) => call('/reminder-review/'+id,{action,today,version:review.items.find(item=>item.id===id).version});
  const guardedCommand={action:'complete',today,version:review.items.find(item=>item.id===1002).version};
  assert.equal((await w.fetch('http://127.0.0.1/api/companion/reminder-review/1002',{
    method:'POST',headers:{Origin:'https://unrelated.example.test','Content-Type':'application/json','x-fixture-machine':'yes'},
    body:JSON.stringify(guardedCommand),
  })).status,403);
  assert.equal((await db.prepare('SELECT isFinished FROM reminders WHERE seq=1002').first()).isFinished,0);
  assert.equal((await change(1003,'complete')).status,409);
  assert.equal((await change(1004,'tomorrow')).status,409);
  if (!serve && !visual) {
    assert.equal((await change(1000,'tomorrow')).status,200);
    const moved = await (await call('/reminder-review/1000')).json();
    assert.equal(moved.deadline,tomorrow+'T10:10:00+09:00');
    assert.equal((await change(1001,'complete')).status,200);
    const completed = await (await call('/reminder-review/1001')).json();
    assert.equal(completed.finished,true);
    assert.equal(completed.next.deadline,review.items.find(item=>item.id===1001).nextDeadline);
    assert.equal((await change(1001,'complete')).status,409);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM reminders WHERE title='验收循环'").first()).n,2);
    assert.equal((await db.prepare('SELECT isFinished FROM reminders WHERE seq=1002').first()).isFinished,0);
    await db.prepare("UPDATE reminders SET content='新版本' WHERE seq=1002").run();
    assert.equal((await change(1002,'complete')).status,409);
  }
  const reminderPage=await runtime.dispatchFetch('http://127.0.0.1/preview/today/');
  assert.match(await reminderPage.text(),/今日任务/);
  const reminderEndpoint=await runtime.dispatchFetch('http://127.0.0.1/api/companion/reminder-review');
  assert.equal(reminderEndpoint.status,200);
  assert.ok((await reminderEndpoint.json()).items.some(item=>item.group==='locked'));
  assert.equal((await taskDb.prepare("SELECT count(*) AS n FROM executions WHERE task_id=? AND status='COMPLETED'").bind(first.split('/').at(-1)).first()).n,1);
  if(!serve&&!visual)assert.equal((await runtime.dispatchFetch('http://127.0.0.1/companion/chains')).status,403);
  const siteHeaders={'x-fixture-owner':'yes'};
  const page=await runtime.dispatchFetch('http://127.0.0.1/companion/chains',{headers:siteHeaders});
  assert.equal(page.status,200);
  assert.match(await page.text(),/unified-header/);
  const fromSite=await runtime.dispatchFetch('http://127.0.0.1/api/companion/chains/'+chain.chain_id,{headers:siteHeaders});
  assert.equal((await fromSite.json()).status,'COMPLETED');
  assert.equal((await runtime.dispatchFetch('http://127.0.0.1/api/companion/chains/'+chain.chain_id+'/stop',{
    headers:{...siteHeaders,Origin:'https://cross.invalid'},method:'POST',body:'{}',
  })).status,403);
  console.log('PASS: real Worker handlers, six marked receipts and recovery, reminder locks, defer, recurrence and stale protection.');
  if(visual) {
    const page=new URL('/companion/chains/',await runtime.ready).href;
    assert.equal((await fetch(page)).status,200);
    const proc=spawn(process.execPath,[resolve(import.meta.dirname,'check-release-browser.mjs'),page],{windowsHide:true,stdio:'inherit'});
    const timeout=setTimeout(()=>proc.kill(),25000);
    try {const [code]=await once(proc,'exit');assert.equal(code,0);}
    finally {clearTimeout(timeout);}
  }
  if(serve) {
    console.log('本地隔离验收：http://127.0.0.1:8788/companion/chains/');
    console.log('今日任务验收：http://127.0.0.1:8788/preview/today/');
    await once(process,'SIGINT');
  }
} finally {await runtime.dispose();}
