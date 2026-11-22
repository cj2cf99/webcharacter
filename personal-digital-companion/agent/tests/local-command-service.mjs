import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openTestDatabase,initializeDatabase} from './sqlite-d1.mjs';
import {createCompanionMount} from '../host/main-site.mjs';
import {executeMainSiteTask} from '../host/main-site-task-adapter.mjs';
import {createBindingAiClient,CLOUDFLARE_MODEL} from '../assistant/cloudflare.mjs';

const category='qa-life';
const noteType='records.create',diaryType='diaries.create';
const requiredText = {type:'string',required:true,pattern:'\\S'};
const templates=[
 [noteType,'新增随手记',{body:requiredText,category_id:requiredText}],
 [diaryType,'新增日记',{title:requiredText,content:requiredText}]
];
export async function startLocalAcceptance({profile,mainSite}){
 const {api:records}=await import(pathToFileURL(join(mainSite,'src/features/records/api.js')).href);
 const {handleDiaries:diaries}=await import(pathToFileURL(join(mainSite,'src/features/diaries/routes.js')).href);
 const taskPath=join(profile,'acceptance-tasks.sqlite'),businessPath=join(profile,'acceptance-business.sqlite');
 const taskDB=openTestDatabase(taskPath),business=openTestDatabase(businessPath);
 initializeDatabase(taskDB.sqlite);
 for(const [type,name,params]of templates){
  taskDB.sqlite.prepare('INSERT INTO tasklist (type,name,description,executor,parameter_spec_json,procedure,report_spec) VALUES (?,?,?,?,?,?,?)')
   .run(type,name,name,'cloud',JSON.stringify(params),'已确认后登记','记录编号');
 }
 const read=path=>readFileSync(join(mainSite,path),'utf8');
 business.sqlite.exec(read('migrations/0020_records.sql'));
 business.sqlite.exec(read('migrations/0022_records_parent.sql'));
 const tables=read('docs/design/database/schema.sql');
 const diaryTable=tables.match(/CREATE TABLE IF NOT EXISTS "diaries"\([\s\S]+?;/)?.[0];
 assert(diaryTable,'主站日记表定义未找到');
 business.sqlite.exec(diaryTable);
 business.sqlite.exec('CREATE TABLE qa_receipts (task_id TEXT PRIMARY KEY,response TEXT NOT NULL)');
 business.sqlite.prepare('INSERT INTO ra_categories (id,name) VALUES (?,?)').run(category,'生活');

 const token=crypto.randomUUID();
 const log={http:[],textCalls:0,visionCalls:0,visionImage:null};
 let origin,dropNextSubmission=false,visionFailure=true;
 const worker=createCompanionMount({
  authorizeMarket(request){
   if(request.headers.get('authorization')!==('Bearer '+token))throw Object.assign(new Error('本地验收认证失败'),{status:401});
   return {ownerId:'local-command-acceptance'};
  },
  createEnvAiClient:env=>createBindingAiClient(env)
 });
 const environment={COMPANION_DB:taskDB.DB,clouflareai:{async run(model,input){
  const result=await fetch(origin+'/__mock/ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({model,input})});
  if(!result.ok)throw new Error('模拟 AI 暂时不可用');
  return result.json();
 }}};
 const businessEnv={DB:business.DB,mymaindb:business.DB};
 async function businessRoute(request){
  const url=new URL(request.url);
  if(url.pathname==='/api/records'||url.pathname.startsWith('/api/records/'))return records(request,businessEnv);
  if(/^\/api\/diaries(?:\/\d+)?$/.test(url.pathname))return diaries(request,businessEnv,url);
  return Response.json({error:'验收业务路径不存在'},{status:404});
 }
 async function writeOnce({path,body,idempotencyKey}){
  const db=business.sqlite;
  db.exec('BEGIN IMMEDIATE');
  try{
   const previous=db.prepare('SELECT response FROM qa_receipts WHERE task_id=?').get(idempotencyKey);
   let receipt;
   if(previous)receipt=JSON.parse(previous.response);
   else{
    const response=await businessRoute(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));
    if(response.status!==201)throw new Error('登记接口拒绝了任务参数');
    receipt=await response.json();
    db.prepare('INSERT INTO qa_receipts VALUES (?,?)').run(idempotencyKey,JSON.stringify(receipt));
   }
   db.exec('COMMIT');
   return receipt;
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 // 只在验收服务器执行任务，复用正式业务适配器与真实数据库。
 async function execute(task){
  const db=taskDB.sqlite;
  if(!db.prepare("UPDATE tasks SET status='RUNNING' WHERE task_id=? AND status='PENDING'").run(task.task_id).changes)return;
  const started=new Date().toISOString();
  let result=null,status='FAILED',error=null;
  try{
   result=JSON.stringify(await executeMainSiteTask(task,writeOnce));status='COMPLETED';
  }catch{error='本地业务接口拒绝登记';}
  db.exec('BEGIN');
  try{
   db.prepare('INSERT INTO executions VALUES (?,?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(),task.task_id,1,status,started,new Date().toISOString(),result,error);
   db.prepare('UPDATE tasks SET status=?,attempt_count=1,result_json=?,error=? WHERE task_id=?')
    .run(status,result,error,task.task_id);
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 async function mockAI(request){
  const {model,input}=await request.json();
  assert.equal(model,CLOUDFLARE_MODEL);
  const last=input.messages.at(-1).content;
  if(Array.isArray(last)){
   log.visionCalls++;
   const url=last.find(item=>item.type==='image_url').image_url.url;
   assert.match(url,/^data:image\/jpeg;base64,/);
   if(log.visionImage)assert.equal(url,log.visionImage,'截图重试复用同一张图');
   log.visionImage=url;
   if(visionFailure){visionFailure=false;return Response.json({error:'temporary'},{status:503});}
   return Response.json({response:JSON.stringify({answer:'本地模拟收到截图，图片提交成功。'})});
  }
  log.textCalls++;
  const catalog=JSON.parse(input.messages[1].content).available_tasks;
  let proposal=null;
  const note=last.match(/随手记[^。]*?(?:正文|内容)(?:是|为|[:：])?\s*[“「]([^”」]+)[”」]/);
  const diary=last.match(/日记[^。]*?标题(?:叫|是|为|[:：])?\s*[“「]([^”」]+)[”」][，,]\s*(?:正文|内容)(?:是|为|[:：])?\s*[“「]([^”」]+)[”」]/);
  if(note&&catalog.some(t=>t.type===noteType)){
   proposal={type:noteType,target_device_id:null,params:{body:note[1],category_id:last.includes('不存在分类')?'missing-category':category}};
  }else if(diary&&catalog.some(t=>t.type===diaryType)){
   proposal={type:diaryType,target_device_id:null,params:{title:diary[1],content:diary[2]}};
  }
  const reply=proposal?(proposal.type===noteType?'建议新增随手记。请核对内容。':'建议新增日记。请核对内容。'):'请说明要登记的内容，日记需要标题。';
  return Response.json({response:JSON.stringify({reply,proposal})});
 }
 const server=createServer(async (incoming,outgoing)=>{
  try{
   if(incoming.headers.authorization!==('Bearer '+token)){outgoing.writeHead(401).end();return;}
   if(!incoming.url?.startsWith('/')||incoming.url.startsWith('//')){outgoing.writeHead(404).end();return;}
   const chunks=[];
   for await(const chunk of incoming)chunks.push(chunk);
   const body=Buffer.concat(chunks),method=incoming.method;
   const req=new Request(origin+incoming.url,{method,headers:incoming.headers,
    ...(['GET','HEAD'].includes(method)?{}:{body})});
   let response;
   const path=new URL(req.url).pathname;
   if(path==='/__mock/ai')response=await mockAI(req);
   else if(path.startsWith('/api/companion/')){
    response=await worker(req,environment);
    if(path==='/api/companion/tasks'&&method==='POST'&&response.status===201){
     await execute(await response.clone().json());
     if(dropNextSubmission){
      dropNextSubmission=false;outgoing.destroy();return;
     }
    }
   }else response=await businessRoute(req);
   log.http.push({method,path,status:response.status});
   outgoing.writeHead(response.status,Object.fromEntries(response.headers)).end(Buffer.from(await response.arrayBuffer()));
  }catch(error){
   console.error(error.stack);
   if(!outgoing.headersSent)outgoing.writeHead(500);
   outgoing.end();
  }
 });
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 origin='http://127.0.0.1:'+server.address().port;
 const request=(path,options={})=>fetch(origin+path,{...options,redirect:'error',
  headers:{...options.headers,Origin:origin,Authorization:'Bearer '+token},signal:options.signal??AbortSignal.timeout(10000)});
 return {request,taskPath,businessPath,log,
  dropSubmissionResponse(){dropNextSubmission=true;},
  async close(){
   await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
   taskDB.close();business.close();
  }
 };
}

