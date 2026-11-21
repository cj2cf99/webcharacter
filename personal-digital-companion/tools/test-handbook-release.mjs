import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const main=process.env.FEIYUE_MAIN_DIR||'G:/cloudflare/myapp';
const api=process.env.FEIYUE_API_DIR||'G:/selftool/informationManage/api-worker';
const {signMockAccessJwt}=await import(pathToFileURL(resolve(main,'tests/helpers/expenses/mock-access.mjs')));
const require=createRequire(resolve(main,'package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {build}=require('esbuild');
async function bundle(path){
  const result=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'browser',
    loader:{'.html':'text','.css':'text'},external:['cloudflare:*','node:*'],
    plugins:[{name:'worker-text-rules',setup(b){b.onLoad({filter:/[\\/]src[\\/]client[\\/].*\.js$/},async({path})=>({contents:await readFile(path,'utf8'),loader:'text'}));}}]});
  return result.outputFiles[0].text;
}
const opts={modules:true,compatibilityDate:'2026-10-27',compatibilityFlags:['nodejs_compat']};
const runtime=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,workers:[
  {...opts,name:'site',script:await bundle(resolve(main,'src/companion-entrypoint.js')),bindings:{APP_ENV:'test',ACCESS_MODE:'mock',COMPANION_ENABLED:'true',ALLOWED_OWNER_SUBS:'mock-owner-sub'},d1Databases:{mymaindb:'isolated-expenses'},serviceBindings:{SUBSCRIPTIONS_API:{name:'api',entrypoint:'OwnerGateway'}}},
  {...opts,name:'api',script:await bundle(resolve(api,'src/entrypoint.js')),d1Databases:{COMPANION_DB:'isolated-memory'},serviceBindings:{COMPANION_HOST:{name:'site',entrypoint:'CompanionHost'}}}
]}));
try{
 const db=await runtime.getD1Database('COMPANION_DB','api');
 const schema=await readFile(resolve(api,'src/companion/agent/migrations/016-personality-memory.sql'),'utf8');
 await db.batch(schema.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
 await db.prepare("INSERT INTO companion_diary VALUES('companion-owner','2026-11-20',1,1,'隔离正文','隔离索引','[]','平静','无记录','[]','{}','2026-11-20T01:00:00Z')").run();
 const headers={'Cf-Access-Jwt-Assertion':await signMockAccessJwt()};
 const get=(path,method='GET')=>runtime.dispatchFetch('http://isolated.test'+path,{headers,method});
 assert.match(await (await get('/companion/memory/')).text(),/id="reader"/);
 assert.equal((await get('/assets/companion/memory.js')).status,200);
 assert.equal((await get('/assets/companion/memory.css')).status,200);
 const index=await (await get('/api/companion/memory/diaries')).json();
 assert.equal(index.total,1);assert.equal(index.items[0].summary,'隔离索引');assert(!('body' in index.items[0]));
 assert.equal((await (await get('/api/companion/memory/diaries/2026-11-20.1')).json()).body,'隔离正文');
 assert.equal((await get('/api/companion/memory/diaries','POST')).status,405);
 assert.equal((await get('/companion/tasks')).status,200);
 console.log('PASS actual site and API bundles: authenticated page, assets, RPC index/detail, read-only gate and existing task page.');
}finally{await runtime.dispose();}
