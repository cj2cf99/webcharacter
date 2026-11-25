// 绯月所有对 AI 的出站调用统一从这里走：云端客户端、路由策略、半岛文字、Gemini 视觉与生图。
// 本机 4B 由 balanced-local-model 加载；是否留本机由 routesToCloud 决定，其余一律走这里的云端入口。
import {dirname,join} from 'node:path';
import {valid} from './ai-schema.mjs';
// 本机模型层只在这里装配；业务模块不得直接 import 它们（见 ai-gateway-guard 测试）。
import {createBalancedLocalModel,readGpuLoad} from './balanced-local-model.mjs';
import {createAiWorkflowModel} from './ai-workflow-model.mjs';
import {createLocalModel,desktopModelPath,LOCAL_MODEL_FILE} from './local-model.mjs';
import {createAgyCliModel,testAgyCliPipeline} from './agy-local-model.mjs';
import {extractJson,isAgyInstalled,isAgyResourceExhausted,runAgyPrompt,standbyDir} from './agy-cli-client.mjs';
import {createAgyVision,normalizeImageList,normalizeVisionAnswer,parseVisionJson,rejectCutoutQuestion,VISION_SYSTEM_PROMPT} from './vision-client.mjs';
import {createAiNetworkPool} from './ai-network-pool.mjs';
import {capTimeoutMs} from './ai-execution-round.mjs';

const networkPool=createAiNetworkPool();
const nativeFetch=globalThis.fetch;

export {readGpuLoad,desktopModelPath,testAgyCliPipeline};

// ───────── 本机 AI 装配 ─────────
// 半岛文字兜底：AGY CLI 访问失败（例如额度耗尽）时接管文字与结构化推理。
function createBandaoFallback(){
  return async ({instruction,input,prompt,schema,signal,purpose})=>{
    if(!isBandaoConfigured())return {success:false,error:'DEEPSEEK_KEY_MISSING'};
    try{
      if(schema){
        const structuredOutput=await askBandaoJson({
          instruction:instruction||'请按要求输出结果。',
          schema,
          input:input??prompt??'',
          signal,
          purpose:purpose||'AGY 兜底',
          allowAgyFallback:false
        });
        return {success:true,structuredOutput,response:JSON.stringify(structuredOutput),fallback:'bandao'};
      }
      const messages=instruction
        ?[{role:'system',content:instruction},{role:'user',content:String(input??prompt??'')}]
        :[{role:'user',content:String(prompt??input??'')}];
      const {content}=await requestBandao({messages},{signal,purpose:purpose||'AGY 兜底',allowAgyFallback:false});
      return {success:true,response:content,fallback:'bandao'};
    }catch(error){
      signal?.throwIfAborted?.();
      return {success:false,error:error?.code||error?.message||'DEEPSEEK_UNAVAILABLE'};
    }
  };
}

// 业务模块拿到的 AI 对象就是这里返回的 localModel：memory（结构化）、work、analyze（对话）。
// 本机后端：已安装 AGY CLI 时用它（常驻备用进程，随时待命；访问失败时由半岛文字兜底），否则装配本机 4B；base 可由测试或调用方注入。
// AGY 实际在云端推理，直连另配一份本机 4B（按需装载），见 withOnDevice。
export function createLocalAi({base,utilityProcess,modelPath,file,log,onBusy,safeStorage,useAgy=true,agyFallback}={}){
  const fallback=agyFallback===undefined?createBandaoFallback():agyFallback;
  const device=()=>utilityProcess?createBalancedLocalModel({utilityProcess,modelPath,log,localFirst:true,taskDevice:'gpu'}):null;
  const model=base??(useAgy&&isAgyInstalled()?withOnDevice(createAgyCliModel({log,fallback}),device()):device());
  if(!model)return null;
  try{return createAiWorkflowModel({model,file,log,onBusy,safeStorage});}
  catch(error){
    void log?.({direction:'local',route:'AI 询问池',stage:'本机队列暂不可用',error:error.code??error.name});
    return model;
  }
}

// 直连只走本机：hint 为 direct 的对话、带 onDevice 的任务和直连预热交给 device，其余照走 cloud。
// 没有本机模型时报错，不回落到云端。
export function withOnDevice(cloud,device){
  const unavailable=()=>Object.assign(Error('直连需要本机模型，当前未就绪'),{code:'LOCAL_AI_NOT_READY'});
  const local=()=>{if(!device)throw unavailable();return device;};
  return {...cloud,
    analyze:async(text,options={})=>options.hint!=='direct'?cloud.analyze(text,options):
      device?device.analyze(text,options):{error:unavailable().code},
    preheatConversation:async(route,signal)=>route!=='direct'?cloud.preheatConversation(route,signal):
      device?device.preheatConversation(route,signal):{error:unavailable().message},
    memory:async(text,instruction,schema,signal,skill,meter)=>
      (skill?.onDevice?local():cloud).memory(text,instruction,schema,signal,skill,meter),
    isBusy:()=>Boolean(cloud.isBusy?.()||device?.isBusy()),
    // 让出显卡时两边一起停；任一边正忙就都不停。
    async suspend(){
      if(!await cloud.suspend())return false;
      if(device&&!await device.suspend()){cloud.resume();return false;}
      return true;
    },
    resume(){cloud.resume();device?.resume();},
    async close(){await Promise.all([cloud.close(),device?.close()]);}};
}

// 绯月专聊的模型：AGY CLI 已安装时同样用它（失败时由半岛兜底），否则独占一份 4B（CPU），避免和主对话抢 GPU。
export function createPrivateModel({utilityProcess,modelPath,log,useAgy=true,agyFallback}){
  const fallback=agyFallback===undefined?createBandaoFallback():agyFallback;
  if(useAgy&&isAgyInstalled())return createAgyCliModel({log,fallback});
  return createLocalModel({utilityProcess,modelPath:join(dirname(modelPath),LOCAL_MODEL_FILE),device:'cpu',log});
}

// ───────── 路由策略 ─────────
// 判断、复核留本机；私密任务留本机；其余交云端。云端未配置时一律本机。
export const localKinds=['judgment','review'];
export function routesToCloud({kind,private:isPrivate=false,short=false}={}){
  return !isPrivate&&!short&&!localKinds.includes(kind)&&isBandaoConfigured();
}

// 云端 OpenAI 兼容接口的公用客户端：鉴权、超时、取消、密钥脱敏和任务日志审计。
// 各供应商只在 本文件下面各供应商段声明端点、密钥变量和默认参数。
let taskAudit;
let cloudFallbackLog;

export function setCloudTaskAudit(audit){
  taskAudit=audit;
}

export function setCloudFallbackLog(log){
  cloudFallbackLog=log;
}

export function createCloudClient({endpoint,keyName,codePrefix,defaults={}}){
  const unavailable=code=>Object.assign(Error(code),{code});
  const isConfigured=()=>Boolean(process.env[keyName]?.trim());
  async function request(payload,{signal,timeoutMs=30000,fetcher=fetch,key=process.env[keyName],audit=taskAudit,purpose='模型调用',priority=1}={}){
    payload={...defaults,...payload};
    const secret=key?.trim();
    const scrub=value=>!secret||value===undefined?value:JSON.parse(JSON.stringify(value,(_key,entry)=>
      typeof entry==='string'?entry.replaceAll(secret,'[已隐藏 API 密钥]'):entry));
    let finish;
    try{
      finish=await audit?.({purpose,input:scrub(payload)});
    }catch{
      throw unavailable(codePrefix+'AUDIT_FAILED');
    }
    const start=performance.now();
    const effectiveTimeoutMs=capTimeoutMs(timeoutMs,30_000);
    const deadline=AbortSignal.timeout(effectiveTimeoutMs);
    const active=signal?AbortSignal.any([signal,deadline]):deadline;
    let status,output,errorCode;
    try{
      if(!secret)throw unavailable(codePrefix+'KEY_MISSING');
      active.throwIfAborted();
      let responseOk,raw,body;
      if(fetcher===nativeFetch){
        const res=await networkPool.dispatch({
          endpoint,
          headers:{authorization:'Bearer '+secret,'content-type':'application/json'},
          body:JSON.stringify(payload),
          timeoutMs:effectiveTimeoutMs,
          signal,
          priority
        });
        if(!res.ok){
          signal?.throwIfAborted();
          throw unavailable(res.timedOut?codePrefix+'TIMEOUT':codePrefix+'UNAVAILABLE');
        }
        status=res.status;responseOk=res.responseOk;raw=res.raw;body=res.body;
      }else{
        let response;
        try{
          response=await fetcher(endpoint,{
            method:'POST',redirect:'error',signal:active,
            headers:{authorization:'Bearer '+secret,'content-type':'application/json'},
            body:JSON.stringify(payload)
          });
          status=response.status;responseOk=response.ok;
          raw=await response.text();
        }catch{
          signal?.throwIfAborted();
          throw unavailable(deadline.aborted?codePrefix+'TIMEOUT':codePrefix+'UNAVAILABLE');
        }
        try{body=JSON.parse(raw);}catch{/* 非 JSON 错误回执仍可在本地查看。 */}
      }
      if(!responseOk){
        output=body?.error??body??raw;
        throw unavailable(codePrefix+'HTTP_'+status);
      }
      const choice=body?.choices?.[0];
      output=choice?{content:choice.message?.content,finishReason:choice.finish_reason,model:body.model,usage:body.usage}
        :body?.error??body??raw;
      active.throwIfAborted();
      if(typeof choice?.message?.content!=='string'||!choice.message.content.trim())throw Error();
      return {content:choice.message.content,finishReason:choice.finish_reason};
    }catch(error){
      errorCode=signal?.aborted?codePrefix+'CANCELLED':deadline.aborted?codePrefix+'TIMEOUT':
        typeof error.code==='string'?error.code:codePrefix+'RESULT_INVALID';
      signal?.throwIfAborted();
      throw unavailable(errorCode);
    }finally{
      if(finish)try{
        await finish({output:scrub(output),error:errorCode,httpStatus:status,durationMs:Math.round(performance.now()-start)});
      }catch{
        throw unavailable(codePrefix+'AUDIT_FAILED');
      }
    }
  }
  return {request,isConfigured};
}

// ───────── 半岛文字（deepseek-v4.1-flash，低档思考；失败时依次兜底 Gemini → AGY CLI）─────────

// 半岛中转站 deepseek-v4.1-flash，统一低档思考。错误码沿用 DEEPSEEK_ 前缀，调用方无需改动。
const bandaoClient=createCloudClient({
  endpoint:'https://sub.bandaoapi.com/v1/chat/completions',keyName:'bandao_api_key',codePrefix:'DEEPSEEK_',
  defaults:{model:'deepseek-v4.1-flash',reasoning_effort:'low'}
});
export const isBandaoConfigured=bandaoClient.isConfigured;

// ───────── Gemini 文字与视觉 ─────────

// Google 官方 OpenAI 兼容端点，视觉使用 flash-lite，思考强度中档（2.5 系列已对新用户下线）。
const geminiClient=createCloudClient({
  endpoint:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',keyName:'gemini_aoxing_API_KEY',
  codePrefix:'GEMINI_',defaults:{model:'gemini-3.1-flash-lite',reasoning_effort:'medium'}
});
export const requestGemini=geminiClient.request;
export const isGeminiConfigured=geminiClient.isConfigured;

const nonFallbackBandaoCodes=new Set(['DEEPSEEK_KEY_MISSING','DEEPSEEK_AUDIT_FAILED','DEEPSEEK_CANCELLED']);
const canFallbackBandaoError=error=>!nonFallbackBandaoCodes.has(error?.code);
const FALLBACK_TIMEOUT_CAP_MS=30_000;
const fallbackTimeoutMs=(timeoutMs,fallback=30_000)=>Math.min(capTimeoutMs(timeoutMs,fallback),FALLBACK_TIMEOUT_CAP_MS);
const isAgyFallbackReady=()=>(globalThis.fetch===nativeFetch||Boolean(process.env.FEIYUE_AGY_PATH))&&isAgyInstalled()&&!isAgyResourceExhausted();

function toGeminiPayload(payload){
  const {model:_model,reasoning_effort:_effort,...rest}=payload??{};
  return rest;
}

function messagesToAgyPrompt(messages,jsonObject=false){
  const parts=[];
  for(const msg of messages??[]){
    const text=typeof msg?.content==='string'?msg.content:JSON.stringify(msg?.content??'');
    if(!text.trim())continue;
    parts.push(msg.role==='assistant'?'【此前回复】\n'+text:text);
  }
  if(jsonObject)parts.push('只输出一个合法的 JSON 对象，不要附加说明或代码块。');
  return parts.join('\n\n');
}

async function runAgyWithTimeout(agyRun,{prompt,schema,signal,timeoutMs}){
  const limitMs=fallbackTimeoutMs(timeoutMs,30_000);
  const deadline=AbortSignal.timeout(limitMs);
  const active=signal?AbortSignal.any([signal,deadline]):deadline;
  try{
    return await agyRun({prompt,schema,signal:active,timeoutMs:limitMs});
  }catch{
    signal?.throwIfAborted?.();
    return {success:false,error:deadline.aborted?'TIMEOUT':'AGY_CLI_FAILED'};
  }
}

function parseJsonObject(text){
  const parsed=extractJson(text);
  return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:undefined;
}

function stripCodeFence(text){
  return String(text??'').trim().replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,'');
}

function logCloudFallback({log=cloudFallbackLog,purpose='模型调用',primaryError,fallback,outcome,error}={}){
  if(typeof log!=='function')return;
  const code=primaryError?.code??primaryError?.name??'DEEPSEEK_FAILED';
  void log({
    direction:'local',
    route:'DeepSeek 兜底',
    operation:purpose,
    stage:outcome==='ok'?`主请求失败（${code}），已由 ${fallback} 兜底成功`:`主请求失败（${code}），兜底均失败`,
    primary_error:code,
    ...(fallback?{fallback}:{}),
    result:outcome==='ok'?'已兜底恢复':'兜底失败',
    ...(error?{error}:{})
  });
}

// 半岛文字统一入口：半岛失败时先兜底 Gemini，再兜底 AGY CLI；单条兜底超时自动停止并跳过，全部失败保留半岛原始错误码。
export async function requestBandao(payload,options={}){
  const {
    signal,timeoutMs=30000,fetcher=fetch,audit=taskAudit,purpose='模型调用',priority=1,
    fallback,allowAgyFallback=true,fallbackLog=cloudFallbackLog,
    geminiRequest=requestGemini,agyRun=runAgyPrompt,
    geminiReady=isGeminiConfigured,agyReady=isAgyFallbackReady
  }=options;
  // 调用方显式注入测试 fetcher 时默认仅测半岛本身，除非显式开启 fallback:true。
  const useFallback=fallback===undefined?fetcher===fetch:Boolean(fallback);
  let primaryError;
  try{
    return await bandaoClient.request(payload,options);
  }catch(error){
    signal?.throwIfAborted?.();
    primaryError=error;
    if(!useFallback||!canFallbackBandaoError(error))throw error;
  }
  const fbTimeoutMs=fallbackTimeoutMs(timeoutMs,30_000);
  const jsonMode=payload?.response_format?.type==='json_object';
  let attempted=false;
  if(geminiReady()){
    attempted=true;
    try{
      const gemRes=await geminiRequest(toGeminiPayload(payload),{
        signal,timeoutMs:fbTimeoutMs,audit,priority,purpose:`${purpose}（Gemini 兜底）`
      });
      if(!jsonMode){
        logCloudFallback({log:fallbackLog,purpose,primaryError,fallback:'Gemini',outcome:'ok'});
        return gemRes;
      }
      if(gemRes?.finishReason==='stop'){
        const parsed=parseJsonObject(gemRes.content);
        if(parsed){
          logCloudFallback({log:fallbackLog,purpose,primaryError,fallback:'Gemini',outcome:'ok'});
          return {content:JSON.stringify(parsed),finishReason:'stop'};
        }
      }
    }catch(error){
      signal?.throwIfAborted?.();
    }
  }
  if(allowAgyFallback&&agyReady()){
    const agyPrompt=messagesToAgyPrompt(payload?.messages,jsonMode);
    if(agyPrompt){
      attempted=true;
      const agyRes=await runAgyWithTimeout(agyRun,{prompt:agyPrompt,signal,timeoutMs:fbTimeoutMs});
      signal?.throwIfAborted?.();
      if(agyRes?.success){
        if(jsonMode){
          const parsed=parseJsonObject(agyRes.response);
          if(parsed){
            logCloudFallback({log:fallbackLog,purpose,primaryError,fallback:'AGY CLI',outcome:'ok'});
            return {content:JSON.stringify(parsed),finishReason:'stop'};
          }
        }else{
          const text=String(agyRes.response??'').trim();
          if(text){
            logCloudFallback({log:fallbackLog,purpose,primaryError,fallback:'AGY CLI',outcome:'ok'});
            return {content:text,finishReason:'stop'};
          }
        }
      }
    }
  }
  if(attempted)logCloudFallback({log:fallbackLog,purpose,primaryError,outcome:'failed',error:'DEEPSEEK_FALLBACK_FAILED'});
  throw primaryError;
}

// ───────── 结构化 JSON 输出 ─────────

// 本地调用文字模型的唯一云端入口：半岛 deepseek-v4.1-flash，JSON 输出并按 schema 校验。
// 半岛失败（含 HTTP 502/超时或连续两次非 JSON）时依次兜底 Gemini → AGY CLI；单条兜底超时自动停止并跳过，全部失败抛半岛原始错误。
export async function askBandaoJson({instruction,schema,input,signal,purpose='AI 任务',timeoutMs=90_000,
  fallback=true,allowAgyFallback=true,fallbackLog=cloudFallbackLog,geminiRequest=requestGemini,agyRun=runAgyPrompt,
  geminiReady=isGeminiConfigured,agyReady=isAgyFallbackReady}={}){
  const text=typeof input==='string'?input:JSON.stringify(input);
  const system=instruction+'\n只输出符合以下 JSON Schema 的 JSON 对象，不附加说明。\n'+JSON.stringify(schema);
  // 中转站的 json_object 模式并不总是强制 JSON：模型偶尔直接写正文。用户消息末尾再提醒一次，仍不合格就带原因重来一次。
  const reminder='\n\n（只返回一个 JSON 对象，字段见系统提示的 Schema。）';
  async function runJsonClient(clientRequest,tag,stepTimeoutMs,allowFence=false){
    let last;
    for(let attempt=0;attempt<2;attempt++){
      const messages=[{role:'system',content:system},{role:'user',content:text+reminder}];
      if(attempt)messages.push({role:'user',content:'上一次输出不是符合 Schema 的 JSON 对象。请重新作答，只输出 JSON 对象。'});
      const {content,finishReason}=await clientRequest({response_format:{type:'json_object'},messages},{signal,timeoutMs:stepTimeoutMs,purpose:tag?`${purpose}（${tag}）`:purpose});
      let value;
      try{value=JSON.parse(allowFence?stripCodeFence(content):content);}catch{/* 下面按无效结果处理。 */}
      if(finishReason==='stop'&&valid(value,schema))return value;
      last=content;
    }
    throw Object.assign(Error('云端结果与任务字段不符'),{code:'DEEPSEEK_RESULT_INVALID',output:String(last??'').slice(0,200)});
  }
  let primaryError;
  try{
    return await runJsonClient(bandaoClient.request,undefined,timeoutMs);
  }catch(error){
    signal?.throwIfAborted?.();
    primaryError=error;
    if(!fallback||!canFallbackBandaoError(error))throw error;
  }
  const fbTimeoutMs=fallbackTimeoutMs(timeoutMs,30_000);
  let attempted=false;
  if(geminiReady()){
    attempted=true;
    try{
      const value=await runJsonClient(geminiRequest,'Gemini 兜底',fbTimeoutMs,true);
      logCloudFallback({log:fallbackLog,purpose,primaryError,fallback:'Gemini',outcome:'ok'});
      return value;
    }catch(error){
      signal?.throwIfAborted?.();
    }
  }
  if(allowAgyFallback&&agyReady()){
    attempted=true;
    const agyRes=await runAgyWithTimeout(agyRun,{prompt:instruction+'\n\n'+text,schema,signal,timeoutMs:fbTimeoutMs});
    signal?.throwIfAborted?.();
    if(agyRes?.success){
      const value=agyRes.structuredOutput!==undefined?agyRes.structuredOutput:extractJson(agyRes.response);
      if(valid(value,schema)){
        logCloudFallback({log:fallbackLog,purpose,primaryError,fallback:'AGY CLI',outcome:'ok'});
        return value;
      }
    }
  }
  if(attempted)logCloudFallback({log:fallbackLog,purpose,primaryError,outcome:'failed',error:'DEEPSEEK_FALLBACK_FAILED'});
  throw primaryError;
}

// ───────── 视觉问答（AGY CLI 为主，Gemini 云端视觉为备用）─────────

// 截图问答走 Gemini 云端视觉（便宜档 flash-lite）。签名与本机视觉一致：返回 {text} 或 {reason}。
export function cloudVision({request=requestGemini}={}){
  return async (question,imageOrImages,signal,options={})=>{
    const rejected=rejectCutoutQuestion(question);
    if(rejected)return {reason:rejected};
    const images=normalizeImageList(imageOrImages);
    if(!images.length)return {reason:'未提供可识别的图片'};
    const schema=options?.schema;
    try{
      const system=schema?VISION_SYSTEM_PROMPT+'\n只输出符合以下 JSON Schema 的 JSON 对象，不附加说明：\n'+JSON.stringify(schema):VISION_SYSTEM_PROMPT;
      const {content,finishReason}=await request({temperature:0,max_tokens:schema?800:480,
        messages:[{role:'system',content:system},
          {role:'user',content:[...images.map(image=>({type:'image_url',image_url:{url:'data:'+image.mime_type+';base64,'+image.data_base64}})),{type:'text',text:question}]}]
      },{signal,timeoutMs:30000,purpose:'截图问答',priority:6});
      if(finishReason!=='stop')return {reason:'视觉模型未返回完整答案'};
      if(schema){
        const data=parseVisionJson(content);
        return data!==undefined&&valid(data,schema)?{data,text:content}:{reason:'视觉模型返回格式无效'};
      }
      return normalizeVisionAnswer(content);
    }catch(error){
      signal?.throwIfAborted();
      return {reason:error.code==='GEMINI_KEY_MISSING'?'未配置 gemini_aoxing_API_KEY':'云端视觉服务不可用或超时'};
    }
  };
}

// 截图与附件识读统一走本机 AGY CLI，通过公用 vision-client 模块将图片临时写入 AGY 工作目录并清理。
// 当 AGY 处于 RESOURCE_EXHAUSTED 20 分钟熔断期时直接内部跳过，不写临时图、不访问 AGY CLI，按访问失败走备用视觉。
export function agyVision({runAgy=runAgyPrompt,isAvailable=isAgyInstalled,tempDir=standbyDir,model,timeoutMs,fallback}={}){
  const base=createAgyVision({runAgy,isAvailable,tempDir,model,timeoutMs,fallback});
  return async (question,imageOrImages,signal,options={})=>{
    if(runAgy===runAgyPrompt&&isAgyResourceExhausted()){
      signal?.throwIfAborted?.();
      const rejected=rejectCutoutQuestion(question);
      if(rejected)return {reason:rejected};
      const images=normalizeImageList(imageOrImages);
      if(!images.length||images.some(img=>!img?.data_base64))return {reason:'AGY CLI 识图参数无效'};
      return typeof fallback==='function'?await fallback(question,imageOrImages,signal,options):{reason:'AGY CLI 识图失败'};
    }
    return base(question,imageOrImages,signal,options);
  };
}

// 桌面端默认视觉入口：优先使用本机 AGY CLI；未安装 AGY 且已配置 Gemini Key 时自动回退到云端视觉。
export function createVision(options={}){
  return agyVision({fallback:isGeminiConfigured()?cloudVision():undefined,...options});
}

// ───────── Gemini 生图 ─────────
// Gemini 生图：官方 generateContent 原生接口（兼容层不支持图像模型）。文字加最多若干参考图，返回一张图。
const keyName='gemini_aoxing_API_KEY';
export const geminiImageModel='gemini-3.1-flash-image';
export const isGeminiImageConfigured=()=>Boolean(process.env[keyName]?.trim());

const fail=(code,message)=>Object.assign(Error(message??code),{code});

export async function requestGeminiImage({prompt,images=[],signal,timeoutMs=120_000,fetcher=fetch,key=process.env[keyName],model=geminiImageModel}){
  const secret=key?.trim();
  if(!secret)throw fail('GEMINI_KEY_MISSING','未配置 gemini_aoxing_API_KEY');
  const deadline=AbortSignal.timeout(capTimeoutMs(timeoutMs,120_000));
  const active=signal?AbortSignal.any([signal,deadline]):deadline;
  let response,raw;
  try{
    response=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
      method:'POST',redirect:'error',signal:active,headers:{'x-goog-api-key':secret,'content-type':'application/json'},
      body:JSON.stringify({contents:[{parts:[{text:prompt},...images.map(image=>({inlineData:{mimeType:image.mime,data:Buffer.from(image.bytes).toString('base64')}}))]}],
        generationConfig:{responseModalities:['IMAGE','TEXT']}})});
    raw=await response.text();
  }catch{
    signal?.throwIfAborted();
    throw fail(deadline.aborted?'GEMINI_TIMEOUT':'GEMINI_UNAVAILABLE',deadline.aborted?'Gemini 生图超时':'无法连接 Gemini');
  }
  let body;
  try{body=JSON.parse(raw);}catch{/* 非 JSON 回执按错误处理。 */}
  if(!response.ok)throw fail('GEMINI_HTTP_'+response.status,'Gemini 生图失败（HTTP '+response.status+'）'+(body?.error?.message?'：'+String(body.error.message).slice(0,120):''));
  const candidate=body?.candidates?.[0];
  const image=candidate?.content?.parts?.find(part=>part.inlineData?.data);
  if(!image)throw fail('GEMINI_NO_IMAGE','Gemini 没有返回图片（'+(candidate?.finishReason??body?.promptFeedback?.blockReason??'无原因')+'）');
  return {mime:image.inlineData.mimeType??'image/png',bytes:Buffer.from(image.inlineData.data,'base64')};
}

// 读取 PNG/JPEG 头部尺寸，供回执显示。
export function imageSize(bytes){
  if(bytes.length>24&&bytes.readUInt32BE(0)===0x89504e47)return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(bytes[0]===0xff&&bytes[1]===0xd8){
    for(let i=2;i+9<bytes.length;){
      if(bytes[i]!==0xff){i++;continue;}
      const marker=bytes[i+1];
      if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))return {height:bytes.readUInt16BE(i+5),width:bytes.readUInt16BE(i+7)};
      i+=2+bytes.readUInt16BE(i+2);
    }
  }
  return {width:0,height:0};
}
