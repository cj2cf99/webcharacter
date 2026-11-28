// 半岛冷却分支：用内存桩替换网络线程池，不访问网络、不调用 AGY CLI。
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createTaskTrafficLog} from '../../desktop/task-traffic-log.mjs';

const stub='data:text/javascript,export const createAiNetworkPool=()=>({dispatch:args=>globalThis.stubDispatch(args)});';
registerHooks({resolve:(specifier,context,next)=>specifier.endsWith('/ai-network-pool.mjs')?
  {url:stub,shortCircuit:true}:next(specifier,context)});
process.env.bandao_api_key=process.env.gemini_aoxing_API_KEY='fixture-key';
const {askBandaoJson,requestBandao,resetBandaoCooldown,setCloudTaskAudit,setCloudFallbackLog}=await import('../../desktop/ai-gateway.mjs');
const {createConversationThreads}=await import('../../desktop/conversation-threads.mjs');
const {createConversationTranscription}=await import('../../desktop/conversation-transcription.mjs');
const {generateDeepSeekDraft}=await import('../../desktop/transcription-deepseek.mjs');

test('连续 3 次故障后冷却直走兜底，冷却期的恢复记录不抵消更早的真实失败',async t=>{
  resetBandaoCooldown();
  t.after(resetBandaoCooldown);
  const dir=await mkdtemp(join(tmpdir(),'feiyue-cooldown-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const logs=createTaskTrafficLog(dir,{safeStorage:{isAsyncEncryptionAvailable:async()=>true,
    encryptStringAsync:async text=>Buffer.from(text)}});
  setCloudTaskAudit(logs.beginDeepSeek);
  setCloudFallbackLog(logs.write);
  t.after(()=>{setCloudTaskAudit(undefined);setCloudFallbackLog(undefined);});
  let calls,geminiStatus=200;
  globalThis.stubDispatch=async({endpoint})=>{
    const main=endpoint.includes('sub.bandaoapi.com');
    calls.push(main?'半岛':'Gemini');
    const status=main?502:geminiStatus;
    return {ok:true,status,responseOk:status===200,raw:'',
      body:status===200?{choices:[{finish_reason:'stop',message:{content:'好的'}}]}:{}};
  };
  const ask=()=>{
    calls=[];
    return requestBandao({messages:[{role:'user',content:'你好'}]},{purpose:'公开问答',agyReady:()=>false});
  };
  const from=Date.now()-1000;
  await ask();
  await ask();
  geminiStatus=502;
  await assert.rejects(ask(),{code:'DEEPSEEK_HTTP_502'});
  assert.deepEqual(calls,['半岛','Gemini']);
  geminiStatus=200;
  await ask();
  assert.deepEqual(calls,['Gemini']);

  const events=(await logs.readPage()).lines.map(line=>JSON.parse(line));
  const cooled=events.find(row=>row.route==='DeepSeek 兜底'&&row.cooldown);
  assert.equal(cooled.ai_step_id,null);
  const {failed,top}=await logs.inspectRecent(from,Date.now()+2000,new AbortController().signal);
  assert.equal(failed,3);
  assert.deepEqual(Object.fromEntries(top),
    {DEEPSEEK_HTTP_502:1,GEMINI_HTTP_502:1,DEEPSEEK_FALLBACK_FAILED:1});

  calls=[];
  const signal=AbortSignal.abort();
  let cancelledFallbacks=0;
  const geminiRequest=async()=>{cancelledFallbacks++;return {content:'取消后不应请求模型',finishReason:'stop'};};
  const cancelled={signal,geminiRequest,agyReady:()=>false};
  await assert.rejects(requestBandao({},cancelled),error=>error===signal.reason);
  await assert.rejects(askBandaoJson({input:'hi',schema:{type:'object'},...cancelled}),error=>error===signal.reason);
  assert.equal(cancelledFallbacks,0);
  await assert.rejects(requestBandao({}, {key:'',agyReady:()=>false}),{code:'DEEPSEEK_KEY_MISSING'});
  const key=process.env.bandao_api_key;
  delete process.env.bandao_api_key;
  try{
    await assert.rejects(askBandaoJson({input:'hi',schema:{type:'object'},agyReady:()=>false}),{code:'DEEPSEEK_KEY_MISSING'});
  }finally{process.env.bandao_api_key=key;}
  assert.deepEqual(calls,[]);
});

test('严格连续故障才冷却；到期回到主通道，冷却中兜底全挂则回探主通道',async t=>{
  resetBandaoCooldown();
  t.after(resetBandaoCooldown);
  let now=1_795_900_000_000;
  t.mock.method(Date,'now',()=>now);
  let calls=[],bandaoPlan=[],geminiStatus=200;
  globalThis.stubDispatch=async({endpoint})=>{
    const main=endpoint.includes('sub.bandaoapi.com');
    calls.push(main?'半岛':'Gemini');
    const status=main?(bandaoPlan.shift()??200):geminiStatus;
    const text=JSON.stringify({reply:'ok'});
    return {ok:true,status,responseOk:status===200,raw:'',
      body:status===200?{choices:[{finish_reason:'stop',message:{content:text}}]}:{}};
  };
  const ask=()=>{
    calls=[];
    return askBandaoJson({instruction:'回复',schema:{type:'object',properties:{reply:{type:'string'}},required:['reply']},input:'hi',agyReady:()=>false});
  };
  // 502, 502, 400, 502：中间被 400 打断，计数清零，不应冷却
  bandaoPlan=[502,502,400,502];
  await ask();await ask();await ask();await ask();
  assert.deepEqual(calls,['半岛','Gemini']);
  calls=[];await ask();
  assert.deepEqual(calls,['半岛']); // 仍先走主通道

  // 再连续 3 次 502 进入冷却
  bandaoPlan=[502,502,502];
  await ask();await ask();await ask();
  await ask();
  assert.deepEqual(calls,['Gemini']);

  // 冷却中兜底全挂 -> 清零冷却并回探主通道一次，成功恢复
  geminiStatus=502;bandaoPlan=[200];
  assert.deepEqual(await ask(),{reply:'ok'});
  assert.deepEqual(calls,['Gemini','半岛']);

  // 再次进入冷却后推进 180s+ 到期，自动回到主通道
  geminiStatus=200;bandaoPlan=[502,502,502];
  await ask();await ask();await ask();
  now+=180_001;
  bandaoPlan=[200];
  await ask();
  assert.deepEqual(calls,['半岛']);
});

test('转录补拟主通道超时不误判为取消，可正常兜底成功并在失败日志保留错误码',async t=>{
  resetBandaoCooldown();
  t.after(resetBandaoCooldown);
  const dir=await mkdtemp(join(tmpdir(),'feiyue-tr-timeout-'));
  const codec={encryptString:v=>Buffer.from(v),decryptString:v=>v.toString()};
  const store=createConversationThreads(dir,codec);
  const logs=createTaskTrafficLog(dir,{safeStorage:{isAsyncEncryptionAvailable:async()=>true,
    encryptStringAsync:async text=>Buffer.from(text)}});
  setCloudTaskAudit(logs.beginDeepSeek);
  setCloudFallbackLog(logs.write);
  let mode='timeout';
  globalThis.stubDispatch=async({endpoint,timeoutMs})=>{
    const main=endpoint.includes('sub.bandaoapi.com');
    if(main){
      if(mode==='timeout')return {ok:false,aborted:false,timedOut:true};
      return {ok:true,status:502,responseOk:false,raw:'',body:{}};
    }
    if(mode==='fail')return {ok:true,status:502,responseOk:false,raw:'',body:{}};
    const content=JSON.stringify({candidates:[{id:'d1',type:'diaries.create',matterIds:['m1'],params:{content:'记录'},fieldSources:[],conditions:[],dependsOn:[],missing:[]}],notes:[]});
    return {ok:true,status:200,responseOk:true,raw:'',body:{choices:[{finish_reason:'stop',message:{content}}]}};
  };
  const model={async memory(raw,_i,_s,_sig,skill){
    const turn=JSON.parse(raw).turns[0];
    if(skill.stage==='organize')return {summary:'x',actions:[],requests:[{id:'m1',summary:'记下',subject:'user',state:'planned',intent:'explicit',timeText:'',conditions:[],evidence:[{sourceId:turn.sourceId,quote:turn.text}]}],signals:[],recentFactIds:[]};
    return {candidates:[],notes:[]};
  },close(){}};
  const tr=createConversationTranscription({profile:dir,safeStorage:codec,model,log:logs.write,
    generateRemoteDraft:(input,instruction,schema,signal)=>generateDeepSeekDraft(input,instruction,schema,signal,{timeoutMs:30,agyReady:()=>false})});
  t.after(async()=>{setCloudTaskAudit(undefined);setCloudFallbackLog(undefined);await tr.close();store.close();await rm(dir,{recursive:true,force:true});});

  const runBatch=async text=>{
    const line=store.create();
    store.submit(line.id,{text,backgroundRegistration:true,handled:true});
    const batch=store.organization(line.id);
    tr.fromThread(batch);
    for(let i=0;i<200;i++){
      const d=tr.detail(batch.id);
      if(['ready','failed','empty'].includes(d.state))return d;
      await delay(15);
    }
    throw Error('timeout waiting transcription');
  };
  const ok=await runBatch('帮我记下今天调试。');
  assert.equal(ok.state,'ready');

  mode='fail';
  const bad=await runBatch('帮我记下失败场景。');
  assert.equal(bad.state,'failed');
  const events=(await logs.readPage()).lines.map(l=>JSON.parse(l));
  const failedTask=events.find(e=>e.route==='对话内容转录'&&e.stage==='失败');
  assert.equal(failedTask?.error,'TRANSCRIPTION_DEEPSEEK_FAILED');
});

test('转录默认 150s 外层预算在主通道 60s 耗尽后仍允许 Gemini 兜底完成（若退回 60s 则必败）',async t=>{
  resetBandaoCooldown();
  t.after(resetBandaoCooldown);
  const dir=await mkdtemp(join(tmpdir(),'feiyue-tr-budget-'));
  const codec={encryptString:v=>Buffer.from(v),decryptString:v=>v.toString()};
  const store=createConversationThreads(dir,codec);
  const logs=createTaskTrafficLog(dir,{safeStorage:{isAsyncEncryptionAvailable:async()=>true,
    encryptStringAsync:async text=>Buffer.from(text)}});
  setCloudTaskAudit(logs.beginDeepSeek);
  setCloudFallbackLog(logs.write);
  let elapsed=0;
  const deadlines=[];
  t.mock.method(AbortSignal,'timeout',ms=>{
    const controller=new AbortController();
    deadlines.push({ms,at:elapsed+ms,controller});
    return controller.signal;
  });
  function advance(ms){
    elapsed+=ms;
    for(const {at,controller} of deadlines){
      if(at<=elapsed)controller.abort(new DOMException('模拟转录超时','TimeoutError'));
    }
  }
  globalThis.stubDispatch=async({endpoint,timeoutMs,signal})=>{
    const main=endpoint.includes('sub.bandaoapi.com');
    if(main){
      advance(timeoutMs);
      return {ok:false,aborted:signal.aborted,timedOut:!signal.aborted};
    }
    advance(15_000);
    const content=JSON.stringify({candidates:[{id:'d1',type:'diaries.create',matterIds:['m1'],params:{content:'虚拟预算记录'},fieldSources:[],conditions:[],dependsOn:[],missing:[]}],notes:[]});
    return {ok:true,status:200,responseOk:true,raw:'',body:{choices:[{finish_reason:'stop',message:{content}}]}};
  };
  const model={async memory(raw,_i,_s,_sig,skill){
    const turn=JSON.parse(raw).turns[0];
    if(skill.stage==='organize')return {summary:'x',actions:[],requests:[{id:'m1',summary:'记下',subject:'user',state:'planned',intent:'explicit',timeText:'',conditions:[],evidence:[{sourceId:turn.sourceId,quote:turn.text}]}],signals:[],recentFactIds:[]};
    return {candidates:[],notes:[]};
  },close(){}};
  const tr=createConversationTranscription({profile:dir,safeStorage:codec,model,log:logs.write,
    generateRemoteDraft:(input,instruction,schema,signal)=>generateDeepSeekDraft(input,instruction,schema,signal,{agyReady:()=>false})});
  t.after(async()=>{setCloudTaskAudit(undefined);setCloudFallbackLog(undefined);await tr.close();store.close();await rm(dir,{recursive:true,force:true});});

  const line=store.create();
  store.submit(line.id,{text:'帮我记下虚拟时钟下的 150 秒外层预算。',backgroundRegistration:true,handled:true});
  const batch=store.organization(line.id);
  tr.fromThread(batch);
  let detail;
  for(let i=0;i<200;i++){
    const d=tr.detail(batch.id);
    if(['ready','failed','empty'].includes(d.state)){detail=d;break;}
    await delay(15);
  }
  assert.equal(detail?.state,'ready',detail?.error);
  assert.equal(elapsed,75_000);
  assert.ok(deadlines.some(({ms})=>ms===150_000),'外层转录补拟必须使用 150_000ms 时限');
});
