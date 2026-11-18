import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createScreenQuestionClient} from '../../desktop/screen-question-client.mjs';
const good=()=>Response.json({ok:true,answer:'客观回答'});
function native(size=12,width=2000,height=1000){return {isEmpty:()=>false,getSize:()=>({width,height}),toJPEG(){const bytes=Buffer.alloc(size);bytes.set([255,216,255]);return bytes;},resize(){return native(12,Math.floor(width*.75),Math.floor(height*.75));}};}
function dependencies(request=async()=>good()){
  const log={captures:0,bodies:[],sources:[]};
  return {log,screen:{getCursorScreenPoint:()=>({x:-100,y:50}),getDisplayNearestPoint(point){assert.equal(point.x,-100);return {id:2,size:{width:1600,height:900},scaleFactor:1.5};}},
    desktopCapturer:{async getSources(options){log.captures++;log.options=options;return log.sources.length?log.sources:[{display_id:'1',thumbnail:{isEmpty(){throw new Error('不能取错屏幕');}}},{display_id:'2',thumbnail:native()}];}},
    request:async(path,options)=>{log.path=path;log.bodies.push(options.body);return request(path,options);}};
}
test('DSQ01：鼠标屏幕严格匹配、按缩放取整屏、capture后才waiting且状态无图',async()=>{
  const dep=dependencies(),client=await createScreenQuestionClient(dep),states=[];
  const result=await client.captureAndAsk('  问题  ',{onState(value){assert.equal(dep.log.captures,1);states.push(value);}});
  assert.deepEqual(result,{state:'answer',text:'客观回答'});assert.deepEqual(dep.log.options,{types:['screen'],thumbnailSize:{width:2400,height:1350}});
  assert.equal(dep.log.path,'/api/assistant/screen-question');assert.equal(JSON.parse(dep.log.bodies[0]).question,'问题');assert.equal(states[0].state,'waiting');assert.doesNotMatch(JSON.stringify(states),/data_base64|api_token|Bearer/);
  dep.log.sources=[{display_id:'1',thumbnail:native()}];assert.equal((await client.captureAndAsk('新问题')).code,'DISPLAY_NOT_FOUND');assert.equal(dep.log.bodies.length,1);
});
test('DSQ02：NativeImage过大依次质量与resize，不空图、不落盘',async()=>{
  const dep=dependencies();dep.log.sources=[{display_id:'2',thumbnail:native(4*1024*1024+1)}];
  const client=await createScreenQuestionClient(dep);assert.equal((await client.captureAndAsk('问题')).state,'answer');
  assert.ok(Buffer.from(JSON.parse(dep.log.bodies[0]).image.data_base64,'base64').length<=4*1024*1024);
  dep.log.sources=[{display_id:'2',thumbnail:{isEmpty:()=>true}}];assert.equal((await client.captureAndAsk('问题')).code,'CAPTURE_EMPTY');assert.equal(dep.log.bodies.length,1);
});
test('DSQ03：一次自动重试及手动重试同图同问题，新提交才重新截图',async()=>{
  let calls=0;const dep=dependencies(async()=>{calls++;return calls===1?Response.json({ok:false,error:{code:'AI_TIMEOUT',message:'超时',retryable:true}},{status:504}):good();});
  const client=await createScreenQuestionClient(dep);assert.equal((await client.captureAndAsk('问题')).state,'answer');assert.equal(dep.log.captures,1);assert.equal(calls,2);assert.equal(dep.log.bodies[0],dep.log.bodies[1]);
  await client.retryLast();assert.equal(dep.log.captures,1);assert.equal(dep.log.bodies[2],dep.log.bodies[0]);
  await client.captureAndAsk('新问题');assert.equal(dep.log.captures,2);assert.notEqual(dep.log.bodies[3],dep.log.bodies[0]);
  client.forget();assert.equal((await client.retryLast()).code,'NO_CAPTURE');
});
test('DSQ04：非JSON/坏回执/网络失败最多两次，认证与配置不可重试',async()=>{
  for(const response of [()=>new Response('<html>Access</html>'),()=>Response.json({ok:true}),()=>{throw null;},()=>Response.json({ok:false,error:{code:'AI_UNAVAILABLE',message:'secret',retryable:true}},{status:502})]){
    const dep=dependencies(response),client=await createScreenQuestionClient(dep),r=await client.captureAndAsk('问题');assert.equal(r.state,'error');assert.equal(r.retryable,true);assert.equal(dep.log.bodies.length,2);assert.equal(dep.log.bodies[0],dep.log.bodies[1]);assert.doesNotMatch(r.text,/html|secret/);
  }
  for(const status of [400,401,403,413,503]){const dep=dependencies(()=>new Response('not json',{status})),client=await createScreenQuestionClient(dep);assert.equal((await client.captureAndAsk('问题')).retryable,false);assert.equal(dep.log.bodies.length,1);}
  const dep=dependencies(()=>Response.json({ok:false,error:{code:'UNAUTHORIZED',message:'secret',retryable:false}},{status:401}));assert.equal((await (await createScreenQuestionClient(dep)).captureAndAsk('问题')).code,'UNAUTHORIZED');assert.equal(dep.log.bodies.length,1);
});
test('DSQ05：BUSY不截图；forget或signal取消抑制迟到状态与自动重试',async()=>{
  let release,entered;const ready=new Promise(resolve=>entered=resolve),dep=dependencies(async()=>{entered();await new Promise(resolve=>release=resolve);return good();});
  const client=await createScreenQuestionClient(dep),states=[],pending=client.captureAndAsk('问题',{onState:v=>states.push(v)});await ready;
  assert.equal((await client.captureAndAsk('新问题')).code,'BUSY');assert.equal(dep.log.captures,1);client.forget();assert.equal((await pending).code,'REQUEST_CANCELLED');release();await Promise.resolve();assert.deepEqual(states.map(x=>x.state),['waiting']);assert.equal(dep.log.bodies.length,1);assert.equal((await client.retryLast()).code,'NO_CAPTURE');
  const abort=new AbortController();abort.abort();assert.equal((await client.captureAndAsk('问题',{signal:abort.signal})).code,'REQUEST_CANCELLED');assert.equal(dep.log.captures,1);
});
test('DSQ06：截图进行中取消不发送、不保存，拒绝问题也不截取',async()=>{
  let release;const dep=dependencies();dep.desktopCapturer.getSources=()=>new Promise(resolve=>release=resolve);
  const client=await createScreenQuestionClient(dep);assert.equal((await client.captureAndAsk('😀'.repeat(2001))).code,'INVALID_QUESTION');
  const controller=new AbortController(),states=[],p=client.captureAndAsk('问题',{signal:controller.signal,onState:v=>states.push(v)});await Promise.resolve();controller.abort();assert.equal((await p).code,'REQUEST_CANCELLED');release([{display_id:'2',thumbnail:native()}]);await Promise.resolve();assert.equal(dep.log.bodies.length,0);assert.equal(states.length,0);assert.equal((await client.retryLast()).code,'NO_CAPTURE');
});
test('DSQ07：35秒覆盖body读取并至多重试一次',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let notify;let ready=new Promise(resolve=>notify=resolve);let calls=0;
  const dep=dependencies(async()=>{calls++;notify();return {status:200,json:()=>new Promise(()=>{})};}),client=await createScreenQuestionClient(dep);
  const p=client.captureAndAsk('问题');await ready;ready=new Promise(resolve=>notify=resolve);t.mock.timers.tick(35000);await ready;assert.equal(calls,2);t.mock.timers.tick(35000);assert.equal((await p).code,'CLIENT_TIMEOUT');assert.equal(calls,2);
});
test('DSQ08：配置读取、默认fetch前缀/Origin/令牌与禁止redirect，坏配置不截屏',async t=>{
  const profile=await mkdtemp(join(tmpdir(),'screen-client-'));t.after(()=>rm(profile,{recursive:true,force:true}));
  const dep=dependencies();delete dep.request;
  const missing=await createScreenQuestionClient({...dep,profile});assert.equal((await missing.captureAndAsk('问题')).code,'CONFIG_NOT_CONFIGURED');assert.equal(dep.log.captures,0);
  await writeFile(join(profile,'task-config.json'),JSON.stringify({base_url:'http://remote.test',api_token:'secret'}));
  const bad=await createScreenQuestionClient({...dep,profile});assert.equal((await bad.captureAndAsk('问题')).code,'CONFIG_INVALID');assert.equal(dep.log.captures,0);
  await writeFile(join(profile,'task-config.json'),JSON.stringify({base_url:'https://host.test',api_token:'secret',api_prefix:'/api/companion'}));
  let seen;t.mock.method(globalThis,'fetch',async(url,options)=>{seen={url:String(url),options};return good();});
  const client=await createScreenQuestionClient({...dep,profile});assert.equal((await client.captureAndAsk('问题')).state,'answer');assert.equal(seen.url,'https://host.test/api/companion/assistant/screen-question');assert.equal(seen.options.headers.Origin,'https://host.test');assert.equal(seen.options.headers.Authorization,'Bearer secret');assert.equal(seen.options.redirect,'error');
});
