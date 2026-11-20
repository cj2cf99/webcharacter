import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {readFile, readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {resolve} from 'node:path';

const main = process.env.FEIYUE_MAIN_DIR || 'G:/cloudflare/myapp';
const api = process.env.FEIYUE_API_DIR || 'G:/selftool/informationManage/api-worker';
const require = createRequire(main + '/package.json');
const {build} = require('esbuild');
const {Miniflare, convertV4MiniflareOptions} = require('miniflare');
const serve = process.argv.includes('--serve');
const visual = process.argv.includes('--visual-check');
const input = '隔离验收文字';
const actions = [
  {type:'hu-shi.food.create', params:{body:'午餐面条'}},
  {type:'hu-shi.exercise.create', params:{body:'散步半小时'}},
  {type:'hu-shi.event.create', params:{}},
  {type:'diaries.create', params:{title:'验收日记',content:'整理资料'}},
  {type:'records.create', params:{body:'合成资源 https://example.test', category_id:'fixture-resource'}},
  {type:'reminders.create', params:{title:'检查资料',deadline:'tomorrow'}},
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
import {createChainPage} from './src/features/companion/vendor/chain-page.mjs';
import {shell} from './src/pages/navigation.js';
function gateway(env) {
  return companionGateway(env,{fetcher: async (url,options) => {
    if (url !== 'https://api.deepseek.com/chat/completions') return new Response(null,{status:503});
    const input=JSON.parse(options.body);
    if(input.messages.length===1 && input.messages[0].content==='请直接恢复你好，我在')return Response.json({choices:[{finish_reason:'stop',message:{content:'你好，我在'}}]});
    if(input.messages.at(-1).content==='介绍罗马')return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'罗马在台伯河畔。',proposal:null})}}]});
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({actions:${JSON.stringify(actions)},pending:[]})}}]});
  }});
}
export class CompanionHost extends WorkerEntrypoint {
  providers(){return gateway(this.env).providers()}
  attempt(provider,input){return gateway(this.env).attempt(provider,input)}
  categories(){return gateway(this.env).categories()}
  lookup(key,path){return gateway(this.env).lookup(key,path)}
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
export default {async fetch(request,env) {
  const path=new URL(request.url).pathname;
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
    bindings:{COMPANION_ENABLED:'true',deepseekLanguage:'fixture-no-real-key'},
    serviceBindings:{SUBSCRIPTIONS_API:{name:'subscriptions-isolated',entrypoint:'OwnerGateway'}}},
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
  assert.ok(plan.ai.attempts.some(row=>row.provider==='deepseek'&&row.stage==='probe'&&row.code==='OK'));
  assert.ok(plan.ai.attempts.some(row=>row.provider==='deepseek'&&row.stage==='request'&&row.code==='OK'));
  const chat=await call('/assistant/message',{messages:[{role:'user',content:'介绍罗马'}]});
  assert.equal(chat.status,200);assert.equal((await chat.json()).reply,'罗马在台伯河畔。');
  const skipped=await (await call('/assistant/heartbeat',{})).json();
  assert.equal(skipped.status,'skipped_paid');
  assert.deepEqual(skipped.ai.attempts,[]);
  await taskDb.prepare('DELETE FROM registration_ai_preference').run();
  const switched=await (await call('/assistant/heartbeat',{})).json();
  assert.equal(switched.status,'switched');
  assert.equal(switched.provider,'deepseek');
  assert.ok(switched.ai.attempts.length && switched.ai.attempts.every(row=>row.stage==='probe'));
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
  console.log('PASS: real Worker handlers, real business SQL, six receipts and recovery, same chain via private RPC.');
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
    await once(process,'SIGINT');
  }
} finally {await runtime.dispose();}
