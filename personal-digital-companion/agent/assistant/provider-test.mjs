import {matchesProbeReply} from './probe-reply.mjs';
import {refusalExcerpt} from '../host/refusal-response.mjs';

const timestamp=new Intl.DateTimeFormat('zh-CN',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
});
const providerName=/^[a-z][a-z0-9-]{0,31}$/;
const modelName=/^[@a-z0-9_./:-]{1,96}$/i;
const safeCode=code=>typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(code)&&code!=='OK'?code:'PROVIDER_ERROR';
const fault=code=>Object.assign(new Error(code),{code});

async function timedCall(work,signal){
  signal.throwIfAborted();
  const timeout=AbortSignal.timeout(12000);
  const stop=AbortSignal.any([signal,timeout]);
  let onAbort;
  const interrupted=new Promise((_,reject)=>{
    onAbort=()=>reject(fault(signal.aborted?'CANCELLED':'TIMEOUT'));
    stop.addEventListener('abort',onAbort,{once:true});
  });
  try{return await Promise.race([interrupted,work(stop)]);}
  finally{stop.removeEventListener('abort',onAbort);}
}

export async function testAiProviders(request,env,createAiClient){
  const ai={trace_id:crypto.randomUUID(),attempts:[]};
  const reply=(body,status=200)=>Response.json({...body,ai},{status,headers:{'Cache-Control':'no-store'}});
  const incomplete=code=>reply({status:'incomplete',error:{code}},code==='CANCELLED'?408:503);
  if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
  const pool=env.REGISTRATION_AI,signal=request.signal;
  let providers;
  try{
    const list=pool?await timedCall(()=>pool.providers(),signal):['cloudflare'];
    if(!Array.isArray(list)||!list.length||list.length>16||list.some(p=>typeof p!=='string'||!providerName.test(p)))return incomplete('INVALID_PROVIDER_LIST');
    providers=[...new Set(list)];
  }catch(error){return incomplete(signal.aborted?'CANCELLED':safeCode(error?.code));}
  for(const provider of providers){
    if(signal.aborted)return incomplete('CANCELLED');
    const started=Date.now(),row={provider,stage:'request',code:'OK'};
    const t=Object.fromEntries(timestamp.formatToParts(started).map(p=>[p.type,p.value]));
    const expected=`你好！现在是：${t.year}年${t.month}月${t.day}日${t.hour}时${t.minute}分${t.second}秒。`;
    const prompt={version:1,route:'text',maxOutputTokens:512,messages:[{role:'user',content:'请只回复下面这一句，照抄给出的东京时间，精确到秒。\n'+expected}]};
    let answer;
    try{
      const result=await timedCall(stop=>pool?pool.attempt(provider,prompt):
        createAiClient(env).generate(prompt,{signal:stop,enableThinking:false}).then(value=>({value})),signal);
      const generated=result?.value,model=generated?.model??result?.model;
      if(typeof model==='string'&&modelName.test(model))row.model=model;
      if(Number.isInteger(result?.upstream_status))row.upstream_status=result.upstream_status;
      if(Number.isSafeInteger(result?.provider_code))row.provider_code=result.provider_code;
      if(result?.error){
        if(result.refusal_response)row.refusal_response=refusalExcerpt(result.refusal_response);
        throw fault(safeCode(result.error));
      }
      if(generated?.provider!==provider||!row.model||typeof generated.text!=='string')throw fault('INVALID_AI_RESPONSE');
      if(!generated.text.trim())throw fault('EMPTY_RESPONSE');
      row.reply_check=matchesProbeReply(generated.text,expected)?'matched':'mismatch';
      if(row.reply_check==='matched')answer=generated.text.trim();
    }catch(error){row.code=signal.aborted?'CANCELLED':safeCode(error?.code);}
    row.at=Date.now();row.duration_ms=Math.max(0,row.at-started);ai.attempts.push(row);
    if(signal.aborted)return incomplete('CANCELLED');
    if(row.code==='OK')return reply({status:'success',provider,model:row.model,answer});
  }
  return reply({status:'all_failed',error:{code:'ALL_PROVIDERS_FAILED'}},503);
}
