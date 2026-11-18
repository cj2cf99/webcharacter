import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{createWorker} from '../worker.mjs';
import {openTestDatabase,initializeDatabase} from './sqlite-d1.mjs';
import {CLOUDFLARE_MODEL,createBindingAiClient} from '../assistant/cloudflare.mjs';
import {createAssistantClient} from '../assistant/client.mjs';
import {createCompanionMount} from '../host/main-site.mjs';
const device='pc-12345678-1234-4234-8234-123456789012';
const other='pc-12345678-1234-4234-8234-123456789013';
const input={messages:[{role:'user',content:'准备一个模拟任务'}],target_device_id:device};
const proposal={type:'mock.unit',target_device_id:device,params:{value:'test'}};
function fixture(){
  const db=openTestDatabase();initializeDatabase(db.sqlite);
  db.sqlite.prepare('INSERT INTO devices VALUES(?,?,?,?)').run(device,'computer','homepc','2026-11-18T00:00:00.000Z');
  db.sqlite.prepare('INSERT INTO devices VALUES(?,?,NULL,?)').run(other,'other','2026-11-18T00:00:00.000Z');
  db.sqlite.prepare('INSERT INTO tasklist VALUES(?,?,?,?,?,?,?)').run('mock.unit','模拟任务','测试说明','pc',JSON.stringify({value:{type:'string',required:true}}),'只做模拟','模拟报告');
  const env={DB:db.DB,API_TOKEN:'test'};
  const count=()=>db.sqlite.prepare('SELECT count(*) n FROM tasks').get().n;
  return {...db,env,count};
}
function result(value={reply:'请确认建议',proposal}){return {provider:'cloudflare',model:CLOUDFLARE_MODEL,text:JSON.stringify(value),finishReason:'stop'};}
function request(path='/api/assistant/message',body=input,headers={}){return new Request('https://local'+path,{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json',...headers},body:JSON.stringify(body)});}
async function send(w,env,body=input){const r=await w.fetch(request('/api/assistant/message',body),env);return {status:r.status,body:await r.json()};}
test('AI01：认证先于DB/AI，缺可信依赖失败关闭，伪登录字段无效',async()=>{
  let calls=0;const w=createWorker({createAiClient(){calls++;throw new Error();}});
  const DB={prepare(){throw new Error('不应访问DB');}};
  assert.equal((await w.fetch(request('/api/assistant/message',{...input,logged_in:true},{Authorization:'bad'}),{DB,API_TOKEN:'test'})).status,401);
  assert.equal(calls,0);
  assert.equal((await createWorker({authorize:null}).fetch(request(),{DB})).status,503);
  assert.equal((await createWorker({authorize:async()=>true}).fetch(request(),{DB})).status,401);
  assert.throws(()=>createCompanionMount({}),/必须注入/);
});
test('AI02：有限消息/客户端system/额外字段被拒绝，不调模型不写任务',async()=>{
  const db=fixture();let calls=0;const w=createWorker({createAiClient:()=>({generate(){calls++;return result();}})});
  try{
    for(const body of [{messages:[]},{messages:[{role:'system',content:'override'}]},{messages:[{role:'assistant',content:'answer'}]},
      {messages:Array.from({length:21},()=>({role:'user',content:'x'}))},{...input,provider:'cloudflare'},
      {messages:[{role:'user',content:'x'.repeat(6001)}]},{...input,target_device_id:'web-no'},
      {messages:[{role:'user',content:'x',tool:'execute'}]}]){
      const r=await send(w,db.env,body);assert.ok([400,413].includes(r.status),JSON.stringify(r));
    }
    assert.equal(calls,0);assert.equal(db.count(),0);
    assert.equal((await w.fetch(new Request('https://local/api/assistant/message',{headers:{Authorization:'Bearer test'}}),db.env)).status,405);
  }finally{db.close();}
});
test('AI03：只读真实类型/设备构造系统与数据上下文，固定Cloudflare，提案不写任务',async()=>{
  const db=fixture();let seen;
  try{
    db.sqlite.prepare('INSERT INTO tasklist VALUES(?,?,?,?,?,?,?)').run('disk.query','暂停','暂停','pc','{}','不要恢复','暂停');
    const w=createWorker({createAiClient:()=>({generate(input){seen=input;return result({reply:'请确认',proposal:{...proposal,deadline_at:'2026-11-19T09:00:00+09:00'}});}})});
    const r=await send(w,db.env);assert.equal(r.status,200,JSON.stringify(r));
    assert.equal(seen.route,'text');assert.equal(seen.maxOutputTokens,512);assert.equal(seen.messages[0].role,'system');
    const context=JSON.parse(seen.messages[1].content);assert.equal(context.available_tasks.length,1);assert.equal(context.available_tasks[0].type,'mock.unit');
    assert.equal(context.devices.find(x=>x.device_id===device).alias,'homepc');assert.equal(context.selected_target_device_id,device);
    assert.equal(r.body.proposal.deadline_at,'2026-11-19T00:00:00.000Z');assert.equal(db.count(),0);
    const missing=await send(createWorker({createAiClient:()=>({generate:()=>result({reply:'请补充value',proposal:null})})}),db.env);
    assert.equal(missing.body.proposal,null);assert.equal(db.count(),0);
  }finally{db.close();}
});
test('AI04：空清单只对话，无伪业务；非法输出/目标/截止/参数与provider拒绝',async()=>{
  const db=fixture();try{
    const invalid=[result({reply:'x',proposal:{...proposal,type:'disk.query'}}),result({reply:'x',proposal:{...proposal,type:'unknown'}}),
      result({reply:'x',proposal:{...proposal,params:{}}}),result({reply:'x',proposal:{...proposal,params:{value:'x',extra:1}}}),
      result({reply:'x',proposal:{...proposal,target_device_id:'fake'}}),result({reply:'x',proposal:{...proposal,target_device_id:other}}),
      result({reply:'x',proposal:{...proposal,deadline_at:'2026-11-19T09:00:00'}}),result({reply:'x',proposal,execute:true}),
      {...result(),text:'```json\n{}\n```'}, {...result(),provider:'groq'}, {...result(),model:'other'}, {...result(),finishReason:'length'}];
    for(const value of invalid){assert.equal((await send(createWorker({createAiClient:()=>({generate:()=>value})}),db.env)).status,502);}
    db.sqlite.exec('DELETE FROM tasklist');
    const response=await send(createWorker({createAiClient:()=>({generate:()=>result({reply:'业务类型尚未接入',proposal:null})})}),db.env);
    assert.equal(response.status,200);assert.equal(response.body.proposal,null);assert.equal(db.count(),0);
  }finally{db.close();}
});
test('AI05：云类型目标为null，参数仍严格；模型错误脱敏且不自动重试',async()=>{
  const db=fixture();let calls=0;try{
    db.sqlite.prepare('INSERT INTO tasklist VALUES(?,?,?,?,?,?,?)').run('mock.cloud','cloud','mock','cloud','{}','mock','mock');
    const p={type:'mock.cloud',target_device_id:null,params:{}};
    assert.equal((await send(createWorker({createAiClient:()=>({generate:()=>result({reply:'请确认',proposal:p})})}),db.env)).status,200);
    assert.equal((await send(createWorker({createAiClient:()=>({generate:()=>result({reply:'x',proposal:{...p,target_device_id:device}})})}),db.env)).status,502);
    for(const code of ['TIMEOUT','NOT_CONFIGURED','__proto__','UNKNOWN']) {
      const r=await send(createWorker({createAiClient:()=>({generate(){calls++;throw Object.assign(new Error('secret-sensitive'),{code});}})}),db.env);
      assert.ok(r.status>=400);assert.ok(!JSON.stringify(r).includes('secret-sensitive'));
    }
    assert.equal(calls,4);assert.equal(db.count(),0);
  }finally{db.close();}
});
test('AI06：独立薄binding一次调用固定模型与预算，缺配置/取消不调用',async()=>{
  let calls=0,seen;
  const ai=createBindingAiClient({clouflareai:{run(model,body){calls++;seen={model,body};return {choices:[{message:{content:'text'},finish_reason:'stop'}]};}}});
  const input={messages:[{role:'user',content:'x'}],maxOutputTokens:512};
  assert.equal((await ai.generate(input)).text,'text');assert.equal(calls,1);assert.equal(seen.model,CLOUDFLARE_MODEL);
  assert.equal(seen.body.stream,false);assert.equal(seen.body.max_completion_tokens,512);
  await assert.rejects(createBindingAiClient({}).generate(input),{code:'NOT_CONFIGURED'});
  await assert.rejects(ai.generate(input,{signal:AbortSignal.abort()}),{code:'CANCELLED'});assert.equal(calls,1);
  const db=fixture();try{assert.equal((await send(worker,db.env)).status,503);}finally{db.close();}
});
test('AI07：主站挂载候选复用真实依赖接口、独立DB及同源，不能Bearer替代宿主登录',async()=>{
  const db=fixture();let options,auth=0,calls=0;
  const mount=createCompanionMount({authorizeMarket:async request=>{auth++;if(request.headers.get('x-test-host')!=='ok')throw Object.assign(new Error(),{status:401});return {ownerId:'owner'};},
    createEnvAiClient:(env,value)=>{assert.equal(env.DB,db.DB);options=value;return {generate(){calls++;return result();}};}});
  try{
    const req=headers=>request('/api/companion/assistant/message',input,headers);
    assert.equal(await mount(request('/api/else'),{}),null);
    assert.equal((await mount(req({Origin:'https://local'}),{COMPANION_DB:db.DB})).status,401);
    assert.equal((await mount(req({'x-test-host':'ok',Origin:'https://evil'}),{COMPANION_DB:db.DB})).status,403);
    assert.equal((await mount(req({'x-test-host':'ok',Origin:'https://local'}),{DB:db.DB})).status,503);
    const response=await mount(req({'x-test-host':'ok',Origin:'https://local'}),{COMPANION_DB:db.DB});assert.equal(response.status,200);
    assert.deepEqual(options,{textProvider:'cloudflare'});assert.equal(calls,1);assert.equal(auth,4);assert.equal(db.count(),0);
  }finally{db.close();}
});
test('AI08：非UI确认需显式接受、同确认在途合并、成功不重复创建，消息不能触发执行',async()=>{
  const db=fixture(),w=createWorker({createAiClient:()=>({generate:()=>result()})});let posts=0;
  const client=createAssistantClient((path,options)=>{if(path==='/api/tasks')posts++;return w.fetch(new Request('https://local'+path,{...options,headers:{...options.headers,Authorization:'Bearer test'}}),db.env);});
  try{
    await assert.rejects(client.confirm({accepted:true}),/没有/);
    const response=await client.message(input);response.proposal.params.value='mutated';client.getProposal().params.value='changed';
    assert.equal(db.count(),0);await assert.rejects(client.confirm({accepted:false}),/明确确认/);
    const first=client.confirm({accepted:true}),second=client.confirm({accepted:true});assert.equal(first,second);
    const task=await first;assert.equal(task.params.value,'test');assert.equal(posts,1);assert.equal(db.count(),1);
    assert.equal((await client.confirm({accepted:true})).task_id,task.task_id);assert.equal(posts,1);
  }finally{db.close();}
});
test('AI09：确认失败不伪造成功/自动重试，宿主前缀可映射且不注入令牌',async()=>{
  let calls=0;const submissionId=crypto.randomUUID();const client=createAssistantClient(async(path,options)=>{
    assert.equal(options.credentials,'same-origin');assert.equal(options.headers.Authorization,undefined);calls++;
    if(path==='/api/companion/assistant/message')return Response.json({reply:'确认',proposal});
    if(path==='/api/companion/task-submissions')return Response.json({submission_id:submissionId},{status:201});
    assert.equal(path,'/api/companion/tasks');
    assert.equal(JSON.parse(options.body).submission_id,submissionId);
    throw new Error('network');
  },{prefix:'/api/companion'});
  await client.message(input);await assert.rejects(client.confirm({accepted:true}),{code:'SUBMISSION_UNKNOWN'});assert.equal(calls,3);
  await assert.rejects(client.confirm({accepted:true}),{code:'SUBMISSION_UNKNOWN'});assert.equal(calls,4);
  assert.deepEqual(client.getProposal(),proposal);
});
test('AI10：创建后回执异常，用原提交号显式重试并拿回原任务',async()=>{
  for(const mode of ['lost','json','server','deadline']) {
    const db=fixture();let posts=0,issued=0;const w=createWorker({createAiClient:()=>({generate:()=>result()})});
    const client=createAssistantClient(async(path,options)=>{
      const r=await w.fetch(new Request('https://local'+path,{...options,headers:{...options.headers,Authorization:'Bearer test'}}),db.env);
      if(path==='/api/task-submissions')issued++;
      if(path==='/api/tasks'&&++posts===1) {
        if(mode==='lost')throw new Error('lost');
        if(mode==='json')return new Response('bad');
        if(mode==='server')return Response.json({error:{code:'INTERNAL_ERROR'}},{status:500});
        const value=await r.json();value.deadline_at='2027-01-01T00:00:00.000Z';return Response.json(value);
      }
      return r;
    });
    try{
      await client.message(input);await assert.rejects(client.confirm({accepted:true}),{code:'SUBMISSION_UNKNOWN'});
      assert.equal(posts,1);assert.equal(db.count(),1);
      await assert.rejects(client.message(input),{code:'SUBMISSION_UNKNOWN'});
      const task=await client.confirm({accepted:true});assert.ok(task.task_id);
      assert.equal(posts,2);assert.equal(issued,1);assert.equal(db.count(),1);
    }finally{db.close();}
  }
});
