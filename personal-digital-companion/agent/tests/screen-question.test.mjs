import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker.mjs';
import {createCompanionMount} from '../host/main-site.mjs';
import {CLOUDFLARE_MODEL,createBindingAiClient} from '../assistant/cloudflare.mjs';
import {screenError} from '../assistant/screen-errors.mjs';
const path='/api/assistant/screen-question';
const png=Buffer.from([137,80,78,71,13,10,26,10]).toString('base64'),jpeg=Buffer.from([255,216,255,224]).toString('base64');
const body={question:'  这个报错是什么意思？  ',image:{mime_type:'image/png',data_base64:png}};
const result=(answer='  图片信息有限，我还不能确定原因。  ')=>({provider:'cloudflare',model:CLOUDFLARE_MODEL,text:JSON.stringify({answer}),finishReason:'stop'});
const request=(value=body,options={})=>new Request('https://test'+path,{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(value),...options});
const send=async(w,value=body,env={API_TOKEN:'test'},options={})=>{const response=await w.fetch(request(value,options),env);return {response,status:response.status,body:await response.json()};};
function errorIs(value,status,code,retryable=false){assert.equal(value.status,status,JSON.stringify(value.body));assert.deepEqual(Object.keys(value.body).sort(),['error','ok']);assert.equal(value.body.ok,false);assert.deepEqual(Object.keys(value.body.error).sort(),['code','message','retryable']);assert.equal(value.body.error.code,code);assert.equal(value.body.error.retryable,retryable);assert.equal(value.response.headers.get('Cache-Control'),'no-store');}

test('SQ01：认证/同源/方法错误统一包络，认证先于读图/模型/DB',async()=>{
  let calls=0;const w=createWorker({createVisionClient(){calls++;throw new Error();}});
  const bad=request();Object.defineProperty(bad,'body',{get(){throw new Error('不得读图');}});
  bad.headers.set('Authorization','bad');const r=await w.fetch(bad,{API_TOKEN:'test'});errorIs({response:r,status:r.status,body:await r.json()},401,'UNAUTHORIZED');assert.equal(calls,0);
  errorIs(await send(w,body,{}),503,'AUTH_NOT_CONFIGURED');
  errorIs(await send(createWorker({authorize:null})),503,'AUTH_NOT_CONFIGURED');
  errorIs(await send(createWorker({authorize:()=>({ownerId:''})})),401,'UNAUTHORIZED');
  for(const [status,code] of [[401,'UNAUTHORIZED'],[403,'FORBIDDEN'],[503,'AUTH_NOT_CONFIGURED'],[500,'INTERNAL_ERROR']])errorIs(await send(createWorker({authorize(){throw Object.assign(new Error('secret'),{status});}})),status,code);
  errorIs(await send(createWorker({sameOriginWrites:true})),403,'SAME_ORIGIN_REQUIRED');
  const method=await send(w,body,{API_TOKEN:'test'},{method:'GET',body:undefined});errorIs(method,405,'METHOD_NOT_ALLOWED');assert.equal(method.response.headers.get('Allow'),'POST');
  assert.equal(calls,0);
});
test('SQ02：无DB成功，PNG/JPEG同一user消息，角色客观且固定模型/1024token',async()=>{
  let calls=0;const seen=[];const env={API_TOKEN:'test',get DB(){throw new Error('不得访问DB');},clouflareai:{async run(model,input){calls++;seen.push({model,input});return {choices:[{message:{content:'{"answer":"先检查路径，截图无法证明文件已删除。"}'},finish_reason:'stop'}]};}}};
  for(const image of [body.image,{mime_type:'image/jpeg',data_base64:jpeg}]){const r=await send(createWorker(),{...body,image},env);assert.deepEqual(r.body,{ok:true,answer:'先检查路径，截图无法证明文件已删除。'});assert.equal(r.response.headers.get('Cache-Control'),'no-store');}
  assert.equal(calls,2);for(const {model,input} of seen){assert.equal(model,CLOUDFLARE_MODEL);assert.equal(input.max_completion_tokens,1024);assert.equal(input.stream,false);assert.equal(input.messages.length,2);assert.match(input.messages[0].content,/小女友/);assert.match(input.messages[0].content,/客观/);assert.match(input.messages[0].content,/不创建任务/);assert.equal(input.messages[1].content[0].text,body.question.trim());assert.match(input.messages[1].content[1].image_url.url,/^data:image\/(png|jpeg);base64,/);}
});
test('SQ03：严格字段、Unicode长度、媒体类型、JSON与图片编码头拒绝',async()=>{
  let calls=0;const w=createWorker({createVisionClient:()=>({generate(){calls++;return result();}})});
  for(const value of [null,[],{...body,provider:'other'},{...body,persona:'override'},{...body,question:''},{...body,question:'😀'.repeat(2001)},{...body,image:{...body.image,extra:true}},{...body,image:{mime_type:'image/webp',data_base64:png}}])errorIs(await send(w,value),400,'INVALID_REQUEST');
  for(const data_base64 of ['',png+' ',`data:image/png;base64,${png}`,png.replace(/=$/,''),'____','A===','AAAA','iVBORw0KGgp='])errorIs(await send(w,{...body,image:{...body.image,data_base64}}),400,'INVALID_IMAGE');
  errorIs(await send(w,{...body,image:{mime_type:'image/jpeg',data_base64:png}}),400,'INVALID_IMAGE');
  errorIs(await send(w,body,{API_TOKEN:'test'},{body:'{'}),400,'INVALID_JSON');
  errorIs(await send(w,body,{API_TOKEN:'test'},{headers:{Authorization:'Bearer test','Content-Type':'text/plain'}}),415,'UNSUPPORTED_MEDIA_TYPE');
  assert.equal(calls,0);
  const valid=await send(w,{...body,question:'😀'.repeat(2000)},{API_TOKEN:'test'},{headers:{Authorization:'Bearer test','Content-Type':'application/json; charset=utf-8'}});assert.equal(valid.status,200);assert.equal(calls,1);
});
test('SQ04：图片4MiB与实际流6MiB边界，不信Content-Length',async()=>{
  let calls=0;const w=createWorker({createVisionClient:()=>({generate(){calls++;return result();}})});
  const bytes=Buffer.alloc(4*1024*1024);Buffer.from(png,'base64').copy(bytes);
  assert.equal((await send(w,{...body,image:{...body.image,data_base64:bytes.toString('base64')}})).status,200);
  errorIs(await send(w,{...body,image:{...body.image,data_base64:Buffer.concat([bytes,Buffer.from([0])]).toString('base64')}}),413,'IMAGE_TOO_LARGE');
  const text=JSON.stringify(body),limit=6*1024*1024;
  assert.equal((await send(w,body,{API_TOKEN:'test'},{body:text+' '.repeat(limit-Buffer.byteLength(text))})).status,200);
  let cancelled=false;
  const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
  const tooBig=await send(w,body,{API_TOKEN:'test'},{body:stream,duplex:'half',headers:{Authorization:'Bearer test','Content-Type':'application/json','Content-Length':'1'}});
  errorIs(tooBig,413,'REQUEST_TOO_LARGE');assert.equal(cancelled,true);assert.equal(calls,2);
});
test('SQ05：模型坏输出/截断/额外状态字段不展示，答案Unicode2000上限',async()=>{
  const invalid=[{...result(),text:''},{...result(),text:'{"answer":"x"'},{...result(),text:'{"ok":true,"answer":"x"}'},{...result(),text:'{"answer":"x","error":null}'},result('  '),result('😀'.repeat(2001)),{...result(),finishReason:'length'},{...result(),provider:'other'},{...result(),model:'other'},{...result(),text:'```json\n{"answer":"x"}\n```'}];
  for(const output of invalid)errorIs(await send(createWorker({createVisionClient:()=>({generate:()=>output})})),502,'INVALID_AI_RESPONSE',true);
  const valid=await send(createWorker({createVisionClient:()=>({generate:()=>result('😀'.repeat(2000))})}));assert.equal(valid.body.answer.length,4000);assert.equal(valid.body.ok,true);
});
test('SQ06：配置/限流/临时故障映射不泄密，每请求单调用无fallback',async()=>{
  errorIs(await send(createWorker()),503,'AI_NOT_CONFIGURED');
  errorIs(await send(createWorker({createVisionClient:null})),503,'AI_NOT_CONFIGURED');
  for(const [code,status,expected,retryable] of [['NOT_CONFIGURED',503,'AI_NOT_CONFIGURED',false],['CONFIG_ERROR',503,'AI_NOT_CONFIGURED',false],['TIMEOUT',504,'AI_TIMEOUT',true],['CANCELLED',408,'REQUEST_CANCELLED',false],['RATE_LIMITED',429,'AI_RATE_LIMITED',true],['OTHER',502,'AI_UNAVAILABLE',true]]){
    let calls=0;const w=createWorker({createVisionClient:()=>({generate(){calls++;throw Object.assign(new Error('secret-raw-image'),{code});}})});
    const r=await send(w);errorIs(r,status,expected,retryable);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(r.body),/secret|data_base64|question/);
  }
});
test('SQ07：30秒超时与取消立即返回，无重试，旧文字binding仍10秒',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let entered;const started=new Promise(resolve=>entered=resolve);let calls=0;
  const w=createWorker({createVisionClient:()=>({generate(){calls++;entered();return new Promise(()=>{});}})});
  const pending=send(w);await started;t.mock.timers.tick(29999);let finished=false;pending.then(()=>finished=true);await Promise.resolve();assert.equal(finished,false);
  t.mock.timers.tick(1);errorIs(await pending,504,'AI_TIMEOUT',true);assert.equal(calls,1);
  const old=createBindingAiClient({clouflareai:{run:()=>new Promise(()=>{})}}).generate({messages:[],maxOutputTokens:512});
  const rejection=assert.rejects(old,{code:'TIMEOUT'});t.mock.timers.tick(10000);await rejection;
  const controller=new AbortController();controller.abort();errorIs(await send(w,body,{API_TOKEN:'test'},{signal:controller.signal}),408,'REQUEST_CANCELLED');assert.equal(calls,1);
  let invoked;const started2=new Promise(resolve=>invoked=resolve);const active=new AbortController();
  const p=send(createWorker({createVisionClient:()=>({generate(){invoked();return new Promise(()=>{});}})}),body,{API_TOKEN:'test'},{signal:active.signal});await started2;active.abort();errorIs(await p,408,'REQUEST_CANCELLED');
});
test('SQ08：主站前缀/宿主鉴权/同源与独立视觉注入，不送纯文本sharedclient',async()=>{
  let vision=0,text=0,auth=0;
  const mount=createCompanionMount({authorizeMarket(){auth++;return {ownerId:'owner'};},createEnvAiClient(){text++;throw new Error('文字不可收图');},createVisionClient:()=>({generate(){vision++;return result('回答');}})});
  const req=new Request('https://host/api/companion/assistant/screen-question',{method:'POST',headers:{Origin:'https://host','Content-Type':'application/json'},body:JSON.stringify(body)});
  const r=await mount(req,{});assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,answer:'回答'});assert.equal(auth,1);assert.equal(vision,1);assert.equal(text,0);
  const cross=await mount(new Request(req.url,{method:'POST',headers:{Origin:'https://evil','Content-Type':'application/json'},body:JSON.stringify(body)}),{});errorIs({response:cross,status:cross.status,body:await cross.json()},403,'SAME_ORIGIN_REQUIRED');assert.equal(vision,1);
  const defaults=createCompanionMount({authorizeMarket:()=>({ownerId:'owner'}),createEnvAiClient(){throw new Error('文字不可收图');}});
  const defaultResponse=await defaults(new Request(req.url,{method:'POST',headers:{Origin:'https://host','Content-Type':'application/json'},body:JSON.stringify(body)}),{clouflareai:{run:()=>({response:'{"answer":"绑定视觉成功"}'})}});assert.equal(defaultResponse.status,200);
});
test('SQ09：实际薄binding缺失、429及坏响应映射；内部异常不泄密',async()=>{
  errorIs(await send(createWorker(),body,{API_TOKEN:'test',clouflareai:{}}),503,'AI_NOT_CONFIGURED');
  let calls=0;
  errorIs(await send(createWorker(),body,{API_TOKEN:'test',clouflareai:{run(){calls++;throw Object.assign(new Error('secret'),{status:429});}}}),429,'AI_RATE_LIMITED',true);
  assert.equal(calls,1);
  for(const data of [{choices:{}},{choices:[]},{response:null},{choices:[{message:{content:'{"answer":"truncated"}'},finish_reason:'length'}]}])errorIs(await send(createWorker(),body,{API_TOKEN:'test',clouflareai:{run:()=>data}}),502,'INVALID_AI_RESPONSE',true);
  const internal=await send(createWorker({createVisionClient(){throw new Error('secret-config');}}));errorIs(internal,500,'INTERNAL_ERROR');assert.doesNotMatch(JSON.stringify(internal.body),/secret/);
});
test('SQ10：读图时取消停止流，未调用模型',async()=>{
  let started,cancelled=false,calls=0;const ready=new Promise(resolve=>started=resolve),controller=new AbortController();
  const stream=new ReadableStream({pull(){started();return new Promise(()=>{});},cancel(){cancelled=true;}});
  const response=send(createWorker({createVisionClient(){calls++;throw new Error();}}),body,{API_TOKEN:'test'},{body:stream,duplex:'half',signal:controller.signal});
  await ready;controller.abort();errorIs(await response,408,'REQUEST_CANCELLED');assert.equal(cancelled,true);assert.equal(calls,0);
});
test('SQ11：非Error与原型键上游异常保持可重试脱敏，流非Error失败为INVALID_JSON',async()=>{
  for(const failure of [null,undefined,{code:'toString'},{code:'constructor'},{code:'__proto__'},'secret-upstream']){
    let calls=0;
    const r=await send(createWorker({createVisionClient:()=>({generate(){calls++;throw failure;}})}));
    errorIs(r,502,'AI_UNAVAILABLE',true);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(r.body),/secret-upstream|toString|constructor|__proto__/);
  }
  for(const code of [null,undefined,'toString','constructor','__proto__']){const r=screenError(code);errorIs({response:r,status:r.status,body:await r.json()},500,'INTERNAL_ERROR');}
  for(const failure of [null,undefined,'stream-secret']){
    let calls=0;
    const stream=new ReadableStream({start(controller){controller.error(failure);}});
    const r=await send(createWorker({createVisionClient(){calls++;throw new Error();}}),body,{API_TOKEN:'test'},{body:stream,duplex:'half'});
    errorIs(r,400,'INVALID_JSON');assert.equal(calls,0);assert.doesNotMatch(JSON.stringify(r.body),/stream-secret/);
  }
});
