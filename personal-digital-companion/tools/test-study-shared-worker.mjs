// 本机 Workerd 集成验收。仅使用合成资料、临时 D1/R2 和回环地址。
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createStudyRelay} from '../desktop/study-relay.mjs';
import {createStudyStore} from '../desktop/study-store.mjs';

const webRoot=process.env.FEIYUE_STUDY_WEB_ROOT||'G:/cloudflare/myapp';
const apiRoot=process.env.FEIYUE_API_DIR||'G:/selftool/informationManage/api-worker';
const requireWeb=createRequire(join(webRoot,'package.json'));
const {build}=requireWeb('esbuild');
const {Miniflare,convertV4MiniflareOptions}=requireWeb('miniflare');
const {signMockAccessJwt,MOCK_CLAIMS}=await import(pathToFileURL(join(webRoot,'tests/helpers/expenses/mock-access.mjs')));
const owner=MOCK_CLAIMS.sub, gate=randomUUID();
const entry=JSON.stringify(join(apiRoot,'src/index.js').replaceAll('\\','/'));
const bundle=await build({stdin:{resolveDir:webRoot,contents:`
  import gateway from ${entry};
  import {handleSelfExam} from './src/features/selfexam/routes.js';
  export default {fetch(req,env){
    if(req.headers.get('x-test-gate')!==${JSON.stringify(gate)})return new Response(null,{status:403});
    if(new URL(req.url).pathname.startsWith('/api/companion/')){
      const settings={APIDB:env.DB,myR2:env.R2,API_ENABLED:'true',ACCESS_AUD:'local-aud',
        STUDY_DESKTOP_SERVICE_NAME:'local-study',STUDY_OWNER_ACCESS_SUB:${JSON.stringify(owner)}};
      return gateway.fetch(req,settings,{access:{aud:'local-aud',getIdentity:async()=>({
        service_token_status:true,common_name:req.headers.get('x-test-service')})}});
    }
    return handleSelfExam(req,{mymaindb:env.DB,APP_ENV:'test',ACCESS_MODE:'mock'});
  }}`},bundle:true,format:'esm',write:false,platform:'neutral',external:['cloudflare:*','node:*']});
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,cf:false,
  host:'127.0.0.1',port:0,compatibilityDate:'2026-10-27',compatibilityFlags:['nodejs_compat'],
  d1Databases:{DB:'local-study'},r2Buckets:['R2'],d1Persist:false,r2Persist:false}));
const profile=mkdtempSync(join(tmpdir(),'study-workerd-'));
// 隔离夹具只含合成资料。DPAPI 由 Electron 验收覆盖。
const store=createStudyStore(profile,Date.now,{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()});
try{
  const db=await mf.getD1Database('DB'), bucket=await mf.getR2Bucket('R2');
  const schema=new DatabaseSync(':memory:');
  try{
    schema.exec(readFileSync(join(webRoot,'docs/design/database/schema.sql'),'utf8'));
    const ddl=schema.prepare("SELECT sql FROM sqlite_schema WHERE substr(tbl_name,1,6)='study_' AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,rowid").all();
    for(const {sql} of ddl)await db.prepare(sql).run();
  }finally{schema.close();}
  await db.prepare('INSERT INTO study_meta(id,revision) VALUES(1,0)').run();
  const origin=(await mf.ready).origin;
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const jwt=await signMockAccessJwt();
  const request=(path,init={},extra={})=>fetch(origin+path,{...init,redirect:'error',headers:{
    ...init.headers,Origin:origin,'x-test-gate':gate,...extra}});
  async function web(path,method='GET',body){
    const res=await request('/api/study/v1'+path,{method,body:body&&JSON.stringify(body),headers:{
      'Content-Type':'application/json','Idempotency-Key':randomUUID(),'Cf-Access-Jwt-Assertion':jwt}});
    const data=await res.json();
    assert(res.ok,`网页 ${path} ${res.status} ${data.error?.code}`);
    return data;
  }
  const relay=createStudyRelay(store,async()=>({request:(path,init)=>request(path.replace('/api/','/api/companion/'),init,{'x-test-service':'local-study'})}));
  const bank=await web('/banks','POST',{name:'隔离合成题库',description:''});
  await web('/banks/'+bank.id+'/questions','POST',{external_id:'local',title:'练习',type:'single',stem:'选择甲',
    options:[{id:'a',text:'甲'},{id:'b',text:'乙'}],answer_option_ids:['a'],tag_ids:[],status:'active',
    explanation:'甲',source:'local',shuffle_policy:'preserve'});
  const browser={device_id:'local-web',instance_id:'page'};
  const version=s=>({...browser,expected_revision:s.revision,writer_epoch:s.writer_epoch});
  let s=await web('/sessions','POST',{mode:'exam',bank_id:bank.id,...browser});
  let opened=await relay.open();
  assert.equal(opened.id,s.id);assert(!opened.writer);
  await relay.send(s.id,'takeover');
  relay.draft(s.id,0,'answer',['b']);
  s=await web('/sessions/'+s.id);
  s=await web('/sessions/'+s.id+'/takeover','POST',{...browser,expected_revision:s.revision});
  s=await web('/sessions/'+s.id+'/progress','PATCH',{...version(s),item_id:s.items[0].id,selected_ids:['a']});
  opened=await relay.refresh(s.id);
  assert(opened.reviewDrafts);assert.deepEqual(opened.items[0].serverAnswer,['a']);
  assert.deepEqual(opened.items[0].answer,['b']);
  await relay.send(s.id,'takeover');
  opened=await relay.send(s.id,'sync');
  assert(opened.reviewDrafts);
  assert((await relay.resolveDraft(s.id,'server',opened.revision-1)).reviewDrafts);
  await relay.resolveDraft(s.id,'server',opened.revision);
  const done=await relay.send(s.id,'finish');
  assert.equal(done.correct,1);assert.equal((await web('/sessions/'+s.id+'/result')).correct_count,1);
  assert.equal(store.formalRetry(s.id,0).retryStatus,'missing');
  const material=await relay.download(bank.id);
  assert(material.attemptsComplete);
  assert.throws(()=>store.create(material.id,{mode:'practice',scope:'unseen'}),/没有符合/);
  assert.equal(store.formalRetry(s.id,0).sourceTurn.id,s.id);
  let second=await relay.open(bank.id,true);
  s=await web('/sessions/'+second.id);
  s=await web('/sessions/'+s.id+'/takeover','POST',{...browser,expected_revision:s.revision});
  await web('/sessions/'+s.id+'/finish','POST',{...version(s),final_patch:[{item_id:s.items[0].id,selected_ids:['b']}]});
  second=await relay.refresh(s.id);
  assert.equal(second.correct,0);assert.equal(store.formalRetry(s.id,0).mode,'practice');
  assert.equal(store.history().filter(x=>x.mode==='formal').length,2);
  const third=await relay.open(bank.id,true);
  relay.draft(third.id,0,'answer',['a']);
  s=await web('/sessions/'+third.id);
  s=await web('/sessions/'+s.id+'/takeover','POST',{...browser,expected_revision:s.revision});
  s=await web('/sessions/'+s.id+'/progress','PATCH',{...version(s),item_id:s.items[0].id,selected_ids:['b']});
  await relay.refresh(s.id);
  opened=await relay.send(s.id,'takeover');
  assert(opened.reviewDrafts);
  opened=await relay.resolveDraft(s.id,'local',opened.revision);
  assert(opened.pending&&!opened.reviewDrafts);
  assert.equal((await relay.send(s.id,'finish')).correct,1);
  assert.equal((await web('/sessions/'+s.id+'/result')).correct_count,1);
  // 网关按账户标记已做题，桌面据此判断「未见」筛选是否完整。
  assert.equal((await relay.download(bank.id)).attemptsComplete,true);
  // 解题笔记、考后复盘和题目评论与网页版共用同一份数据。
  const noted=await relay.open(bank.id,true);
  relay.draft(noted.id,0,'note','先排除乙');
  let synced=await relay.send(noted.id,'sync');
  assert(!synced.pending);
  assert.equal((await web('/sessions/'+noted.id)).items[0].note,'先排除乙');
  await relay.send(noted.id,'pause');
  relay.draft(noted.id,0,'note','暂停时补记');
  synced=await relay.send(noted.id,'sync');
  assert(!synced.pending);
  await relay.send(noted.id,'resume');
  relay.draft(noted.id,0,'note','交卷笔记');
  let closed=await relay.send(noted.id,'finish');
  assert.equal(closed.items[0].note,'交卷笔记');assert(closed.items[0].canComment);
  const mine=await relay.reflect(noted.id,0,{value:'下次看清题干'});
  let result=await web('/sessions/'+noted.id+'/result');
  assert.deepEqual(result.reflections.map(row=>row.body),['下次看清题干']);
  const changed=await relay.reflect(noted.id,0,{ref:mine.id,revision:mine.revision,value:'下次先看限定词'});
  await assert.rejects(relay.reflect(noted.id,0,{ref:mine.id,revision:mine.revision,value:'旧版本覆盖'}),/revision/u);
  assert.equal((await relay.refresh(noted.id)).items[0].reflections[0].body,'下次先看限定词');
  await relay.reflect(noted.id,0,{ref:changed.id,revision:changed.revision,remove:true});
  assert.equal((await web('/sessions/'+noted.id+'/result')).reflections.length,0);
  const questionId=result.items[0].question_id;
  const fromWeb=await web('/questions/'+questionId+'/comments','POST',{body:'网页端写的评论'});
  const added=await relay.comment(questionId,{value:'绯月端写的评论'});
  assert.deepEqual((await relay.comments(questionId)).map(row=>row.body).sort(),[fromWeb.body,added.body].sort());
  const updated=await relay.comment(questionId,{ref:added.id,revision:added.revision,value:'改过的评论'});
  assert.equal(await relay.comment(questionId,{ref:updated.id,revision:updated.revision,remove:true}),null);
  assert.deepEqual((await web('/questions/'+questionId+'/comments')).items.map(row=>row.body),['网页端写的评论']);
  // 未放行的写接口仍被拒绝。
  const denied=await request('/api/companion/study/v1/questions/'+questionId,{method:'DELETE',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()}},{'x-test-service':'local-study'});
  assert.equal(denied.status,404);
  console.log('PASS Workerd：同库双向接续、草稿冲突选择、首次正确标记、正式卷回到本地练习；笔记、考后复盘、题目评论双端一致。');
}finally{
  store.close();unlinkSync(join(profile,'study.sqlite'));rmdirSync(profile);await mf.dispose();
}
