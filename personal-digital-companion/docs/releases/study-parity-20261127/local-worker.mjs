// 本机验收网关：候选 subscriptions-api 加知序网页端，合成数据、临时 D1，只听回环地址。
// 加 --serve 保持运行，Ctrl+C 退出即清空。不加时只做自检。
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const web='G:/cloudflare/myapp';
const api=resolve(import.meta.dirname,'gateway/api-worker/src/index.js').replaceAll('\\','/');
const requireWeb=createRequire(join(web,'package.json'));
const {build}=requireWeb('esbuild');
const {Miniflare,convertV4MiniflareOptions}=requireWeb('miniflare');
const {signMockAccessJwt,MOCK_CLAIMS}=await import(pathToFileURL(join(web,'tests/helpers/expenses/mock-access.mjs')));
const jwt=await signMockAccessJwt({expiresInSec:7200});
const pages=Object.fromEntries(['app.js','style.css','index.html'].map(name=>[name,readFileSync(join(web,'public/study',name),'utf8')]));
const content=`
import gateway from ${JSON.stringify(api)};
import {handleSelfExam} from './src/features/selfexam/routes.js';
const assets=${JSON.stringify(pages)};
const types={'app.js':'text/javascript','style.css':'text/css','index.html':'text/html; charset=utf-8'};
const files={fetch(req){const name=new URL(req.url).pathname.split('/').at(-1);
  return new Response(assets[name],{headers:{'Content-Type':types[name]}});}};
export default {async fetch(req,env){
  const url=new URL(req.url);
  if(url.hostname!=='127.0.0.1'||!['GET','HEAD'].includes(req.method)&&req.headers.get('Origin')!==url.origin)return new Response(null,{status:403});
  if(url.pathname==='/'){
    const q=await env.DB.prepare('SELECT id FROM study_questions LIMIT 1').first();
    return new Response('<meta charset="utf-8"><h1>绯月学习网关 · 本机验收</h1><p><a href="/study/">知序网页端（模拟账户）</a></p>'
      +'<p><a href="/api/companion/study/v1/banks">绯月接口 · 题库目录</a></p>'
      +'<p><a href="/api/companion/study/v1/questions/'+q.id+'/comments">绯月接口 · 本题评论</a></p>'
      +'<p>在网页端考试、复盘或评论后，刷新绯月接口链接核对同一份数据。</p>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }
  if(url.pathname.startsWith('/api/companion/'))return gateway.fetch(req,{APIDB:env.DB,API_ENABLED:'true',ACCESS_AUD:'preview',
    STUDY_OWNER_ACCESS_SUB:${JSON.stringify(MOCK_CLAIMS.sub)},STUDY_DESKTOP_SERVICE_NAME:'preview-bot'},
    {access:{aud:'preview',getIdentity:async()=>({service_token_status:true,common_name:'preview-bot'})}});
  const local=new Request(req);local.headers.set('Cf-Access-Jwt-Assertion',${JSON.stringify(jwt)});
  return await handleSelfExam(local,{mymaindb:env.DB,APP_ENV:'test',ACCESS_MODE:'mock',STOCKCHECK_ASSETS:files})??new Response(null,{status:404});
}}`;
const built=await build({stdin:{resolveDir:web,contents:content},bundle:true,platform:'neutral',format:'esm',write:false,external:['cloudflare:*','node:*']});
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,host:'127.0.0.1',port:0,cf:false,
  compatibilityDate:'2026-10-27',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'local'},d1Persist:false}));
try{
  const db=await mf.getD1Database('DB'),schema=new DatabaseSync(':memory:');
  try{
    schema.exec(readFileSync(join(web,'docs/design/database/schema.sql'),'utf8'));
    for(const {sql} of schema.prepare("SELECT sql FROM sqlite_schema WHERE substr(tbl_name,1,6)='study_' AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,rowid").all())await db.prepare(sql).run();
  }finally{schema.close();}
  await db.prepare('INSERT INTO study_meta(id,revision) VALUES(1,0)').run();
  const base=(await mf.ready).origin;
  async function call(path,method='GET',data,revision){
    const res=await fetch(base+path,{method,body:data&&JSON.stringify(data),headers:{Origin:base,'Content-Type':'application/json',
      'Idempotency-Key':randomUUID(),...(revision?{'If-Match':String(revision)}:{})}});
    assert(res.ok,method+' '+path+' '+res.status);
    return res.status===204?null:res.json();
  }
  const bank=await call('/api/study/v1/banks','POST',{name:'本机验收题库',description:'仅本次本地运行'});
  const question=await call('/api/study/v1/banks/'+bank.id+'/questions','POST',{external_id:'local-example',title:'选择题',type:'single',stem:'请选择甲',
    options:[{id:'a',text:'甲'},{id:'b',text:'乙'}],answer_option_ids:['a'],tag_ids:[],status:'active',explanation:'答案为甲',source:'local',shuffle_policy:'preserve'});
  const prefix='/api/companion/study/v1',comments=prefix+'/questions/'+question.id+'/comments';
  await call('/api/study/v1/questions/'+question.id+'/comments','POST',{body:'网页端种子评论'});
  const added=await call(comments,'POST',{body:'绯月接口自检'});
  const changed=await call(prefix+'/comments/'+added.id,'PATCH',{body:'绯月接口自检改'},added.revision);
  await call(prefix+'/comments/'+added.id,'DELETE',undefined,changed.revision);
  assert.equal((await call(comments)).items.length,1);
  assert.equal((await call(prefix+'/banks/'+bank.id+'/questions')).items[0].attempted,false);
  assert((await (await fetch(base+'/study/')).text()).includes('app.js'));
  console.log('PASS 本机网关自检：网页端、评论读写删、已做题标记。');
  if(process.argv.includes('--serve')){
    console.log(base+'/');
    await new Promise(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);});
  }
}finally{await mf.dispose();}
