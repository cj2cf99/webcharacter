// 本机隔离 Worker。无云端绑定、生产凭据或真实账单。
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const root=resolve(import.meta.dirname,'..'),main=process.env.FEIYUE_MAIN_DIR||'G:/cloudflare/myapp';
const require=createRequire(join(main,'package.json'));
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const assets={};
for(const [path,file,mime] of [['/assets/styles/shell.css','src/client/styles/shell.css','text/css'],['/assets/styles/theme.css','src/client/styles/theme.css','text/css'],['/assets/shell/theme.js','src/client/shell/theme.js','text/javascript'],['/assets/shell/navigation.js','src/client/shell/navigation.js','text/javascript'],['/assets/icons/anim/feiyue.svg','public/assets/icons/anim/feiyue.svg','image/svg+xml']]){
  assets[path]=[await readFile(join(main,file),'utf8'),mime];
}
const fixture={id:'P-BOOK',spendDate:'2026-11-20',amount:3500,merchant:'街角书店',category:'图书',description:'散文集'};
const expenseModule=file=>JSON.stringify(join(main,'src/features/expenses',file).replaceAll('\\','/'));
const bundle=await build({stdin:{resolveDir:root,contents:
  "import {createMemoryPage} from './agent/host/memory-route.mjs';\n"+
  "import {handleCompanion} from './agent/host/subscriptions.mjs';\n"+
  "import {shell} from "+JSON.stringify(join(main,'src/pages/navigation.js').replaceAll('\\','/'))+";\n"+
  "import {memoryExpenses} from './agent/host/memory-expenses.mjs';\n"+
  "import {getExpenses} from "+expenseModule('routes.js')+";\n"+
  "import {configuredOwners} from "+expenseModule('identity.js')+";\n"+
  "import {createContext} from "+expenseModule('context.js')+";\n"+
  "const assets="+JSON.stringify(assets)+";\n"+
  "const bill="+JSON.stringify(fixture)+";\n"+
  `const route=createMemoryPage({shell,authorize:()=>({sub:'local-preview'})});
  export default {async fetch(request,bindings){
    const env={...bindings,COMPANION_ENABLED:'true',ALLOWED_OWNER_SUBS:'local-preview',COMPANION_HOST:{memoryExpenses:q=>memoryExpenses(env,q,{createContext,configuredOwners,getExpenses})}};
    env.SUBSCRIPTIONS_API={fetchOwner:(r,owner)=>handleCompanion(r,env,owner,true)};
    const url=new URL(request.url);
    if(assets[url.pathname]){const [body,type]=assets[url.pathname];return new Response(body,{headers:{'Content-Type':type}});}
    if(url.pathname==='/api/v1/expenses'){const ctx=createContext(env),[owner]=await configuredOwners(ctx.cfg);return Response.json(await getExpenses(ctx.with({owner}),request,null,url));}
    if(request.headers.get('x-fixture')==='1')return handleCompanion(request,env,{id:'bot:local-preview',role:'bot'},false);
    return await route(request,env)??new Response(null,{status:404});
  }};`},bundle:true,write:false,format:'esm',platform:'browser',plugins:[{
  name:'pending-expense-read-export',setup(builder){builder.onLoad({filter:/[\\/]features[\\/]expenses[\\/]routes\.js$/},async({path})=>{
    const source=await readFile(path,'utf8');return {contents:source.includes('export async function getExpenses(')?source:source+'\nexport {getExpenses};',loader:'js'};
  });}
}]});
const serve=process.argv.includes('--serve');
const runtime=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:serve?8796:0,cf:false,modules:true,compatibilityDate:'2026-10-27',
  script:bundle.outputFiles[0].text,d1Databases:{COMPANION_DB:'memory-preview-only',mymaindb:'expense-preview-only'},d1Persist:false}));
try{
  const db=await runtime.getD1Database('COMPANION_DB');
  const expenseDb=await runtime.getD1Database('mymaindb');
  const owner='own_'+createHash('sha256').update('https://mock-team.cloudflareaccess.com|local-preview').digest('hex').slice(0,32);
  const schemas=(await Promise.all(['0005_expense_billing.sql','0006_expense_tags.sql'].map(file=>readFile(join(main,'migrations',file),'utf8')))).join('\n');
  for(const table of ['sync_runs','expense_snapshots','active_snapshots','expense_records','expense_tags','expense_tag_rules','expense_record_tags']){
    const ddl=new RegExp('CREATE TABLE (?:IF NOT EXISTS )?'+table+' \\([\\s\\S]*?\\n\\);','i').exec(schemas);
    assert(ddl,table);await expenseDb.prepare(ddl[0]).run();
  }
  const at='2026-11-20T00:00:00.000Z';
  await expenseDb.batch([
    expenseDb.prepare("INSERT INTO sync_runs(id,owner_id,source_mode,trigger,status,updated_at) VALUES('local-run',?,'mock','test','success',?)").bind(owner,at),
    expenseDb.prepare("INSERT INTO expense_snapshots(id,owner_id,run_id,created_at,coverage_json,record_count,status) VALUES('local-snap',?,'local-run',?,?,1,'active')").bind(owner,at,JSON.stringify({from:'2026-11-06',to:'2026-11-20'})),
    expenseDb.prepare("INSERT INTO active_snapshots VALUES(?,'local-snap',?)").bind(owner,at),
    expenseDb.prepare("INSERT INTO expense_records(owner_id,snapshot_id,source_id,spend_date,amount,category,description,merchant,source_hash) VALUES(?,'local-snap',?,?,?,?,?,?,'fixture')").bind(owner,fixture.id,fixture.spendDate,fixture.amount,fixture.category,fixture.description,fixture.merchant),
  ]);
  const bills=await runtime.dispatchFetch('http://preview.test/api/companion/memory/expenses?from=2026-11-06&to=2026-11-20',{headers:{'x-fixture':'1'}});
  assert(bills.ok);const billPage=await bills.json();assert.equal(billPage.records[0].id,fixture.id);assert(billPage.complete);
  const sql=await readFile(join(root,'agent/migrations/016-personality-memory.sql'),'utf8');
  await db.batch(sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
  async function seed(path,data){
    const r=await runtime.dispatchFetch('http://preview.test/api/companion/memory/'+path,{method:'POST',body:JSON.stringify(data),headers:{'x-fixture':'1'}});
    assert.equal(r.status,200,await r.text());
  }
  await seed('diaries',{day:'2026-11-19',batch:'preview-one',summary:'等书店的消息',body:'老公要去书店。\n绯月私语：等他回来再问。',tags:['书店'],mood:'期待',weather:'无记录',threads:['买了哪本书？']});
  await seed('diaries',{day:'2026-11-20',batch:'preview-two',summary:'记下书名',body:'接 2026-11-19 的悬念：买的是散文集。\n绯月私语：这个答案我记住了。',tags:['书店'],mood:'开心',weather:'无记录',threads:[]});
  await seed('diaries/2026-11-19.1/threads/1',{field:'resolved'});
  for(const [i,source,source_id] of [[0,'diary','2026-11-19.1/1'],[1,'paylog','P-BOOK']]){
    await seed('nags',{id:'preview-'+i,revision:1,created_at:'2026-11-20T0'+i+':00:00.000Z',source,source_id,source_day:i?'2026-11-19':fixture.spendDate,
      reason:i?'大额消费':'未解的书名',title:i?'书店的消费':'想知道书名',mood:'释然',status:'已解释',before:'好奇',afterEvaluation:'听清楚啦。',
      talk:[{at:'2026-11-20T01:10:00.000Z',who:'你',text:'是一本散文集。'}]});
  }
  const url=new URL('/companion/memory/',await runtime.ready);
  const res=await fetch(url);assert.equal(res.status,200);assert((await res.text()).includes('绯月手记'));
  assert.equal((await (await fetch(new URL('/api/companion/memory/diaries',url))).json()).total,2);
  if(process.argv.includes('--visual')){
    const child=spawn(join(root,'desktop/node_modules/electron/dist/electron.exe'),[join(root,'tools/test-personality-reader-electron.mjs'),url.href],{windowsHide:true,stdio:'inherit'});
    const [code]=await once(child,'exit');assert.equal(code,0);
  }
  console.log('PASS 本地 workerd、D1、主站外壳及读写路由。');
  if(serve){console.log('隔离验收 '+url);await once(process,'SIGINT');}
}finally{await runtime.dispose();}
