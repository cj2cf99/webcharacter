// 绯月所有对 AI 的出站调用统一从这里走：云端客户端、路由策略、半岛文字、Gemini 视觉与生图。
// 本机 4B 由 balanced-local-model 加载；是否留本机由 routesToCloud 决定，其余一律走这里的云端入口。
import {dirname,join} from 'node:path';
import {valid} from './ai-schema.mjs';
// 本机模型层只在这里装配；业务模块不得直接 import 它们（见 ai-gateway-guard 测试）。
import {createBalancedLocalModel,readGpuLoad} from './balanced-local-model.mjs';
import {createAiWorkflowModel} from './ai-workflow-model.mjs';
import {createLocalModel,desktopModelPath,LOCAL_MODEL_FILE} from './local-model.mjs';
import {createAgyCliModel,isAgyInstalled,testAgyCliPipeline} from './agy-local-model.mjs';
import {createAiNetworkPool} from './ai-network-pool.mjs';
import {capTimeoutMs} from './ai-execution-round.mjs';

const networkPool=createAiNetworkPool();

export {readGpuLoad,desktopModelPath,testAgyCliPipeline};

// ───────── 本机 AI 装配 ─────────
// 业务模块拿到的 AI 对象就是这里返回的 localModel：memory（结构化）、work、analyze（对话）。
// 本机后端：已安装 AGY CLI 时用它（常驻备用进程，随时待命），否则装配本机 4B；base 可由测试或调用方注入。
// AGY 实际在云端推理，直连另配一份本机 4B（按需装载），见 withOnDevice。
export function createLocalAi({base,utilityProcess,modelPath,file,log,onBusy,safeStorage,useAgy=true}={}){
  const device=()=>utilityProcess?createBalancedLocalModel({utilityProcess,modelPath,log,localFirst:true,taskDevice:'gpu'}):null;
  const model=base??(useAgy&&isAgyInstalled()?withOnDevice(createAgyCliModel({log}),device()):device());
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

// 绯月专聊的模型：AGY CLI 已安装时同样用它，否则独占一份 4B（CPU），避免和主对话抢 GPU。
export function createPrivateModel({utilityProcess,modelPath,log,useAgy=true}){
  if(useAgy&&isAgyInstalled())return createAgyCliModel({log});
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

export function setCloudTaskAudit(audit){
  taskAudit=audit;
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
      if(fetcher===fetch){
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

// ───────── 半岛文字（deepseek-v4.1-flash，低档思考）─────────

// 半岛中转站 deepseek-v4.1-flash，统一低档思考。错误码沿用 DEEPSEEK_ 前缀，调用方无需改动。
const bandaoClient=createCloudClient({
  endpoint:'https://sub.bandaoapi.com/v1/chat/completions',keyName:'bandao_api_key',codePrefix:'DEEPSEEK_',
  defaults:{model:'deepseek-v4.1-flash',reasoning_effort:'low'}
});
export const requestBandao=bandaoClient.request;
export const isBandaoConfigured=bandaoClient.isConfigured;

// ───────── Gemini 文字与视觉 ─────────

// Google 官方 OpenAI 兼容端点，视觉使用 flash-lite，思考强度中档（2.5 系列已对新用户下线）。
const geminiClient=createCloudClient({
  endpoint:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',keyName:'gemini_aoxing_API_KEY',
  codePrefix:'GEMINI_',defaults:{model:'gemini-3.1-flash-lite',reasoning_effort:'medium'}
});
export const requestGemini=geminiClient.request;
export const isGeminiConfigured=geminiClient.isConfigured;

// ───────── 结构化 JSON 输出 ─────────

// 本地调用文字模型的唯一云端入口：半岛 deepseek-v4.1-flash，JSON 输出并按 schema 校验。
// 结果不符时抛 DEEPSEEK_RESULT_INVALID，由调用方决定重试或回退。
export async function askBandaoJson({instruction,schema,input,signal,purpose='AI 任务',timeoutMs=90_000}){
  const text=typeof input==='string'?input:JSON.stringify(input);
  const system=instruction+'\n只输出符合以下 JSON Schema 的 JSON 对象，不附加说明。\n'+JSON.stringify(schema);
  // 中转站的 json_object 模式并不总是强制 JSON：模型偶尔直接写正文。用户消息末尾再提醒一次，仍不合格就带原因重来一次。
  const reminder='\n\n（只返回一个 JSON 对象，字段见系统提示的 Schema。）';
  let last;
  for(let attempt=0;attempt<2;attempt++){
    const messages=[{role:'system',content:system},{role:'user',content:text+reminder}];
    if(attempt)messages.push({role:'user',content:'上一次输出不是符合 Schema 的 JSON 对象。请重新作答，只输出 JSON 对象。'});
    const {content,finishReason}=await requestBandao({response_format:{type:'json_object'},messages},{signal,timeoutMs,purpose});
    let value;
    try{value=JSON.parse(content);}catch{/* 下面按无效结果处理。 */}
    if(finishReason==='stop'&&valid(value,schema))return value;
    last=content;
  }
  throw Object.assign(Error('云端结果与任务字段不符'),{code:'DEEPSEEK_RESULT_INVALID',output:String(last??'').slice(0,200)});
}

// ───────── Gemini 视觉问答 ─────────

// 截图问答走 Gemini 云端视觉（便宜档 flash-lite）。签名与旧本机视觉一致：返回 {text} 或 {reason}。
export function cloudVision({request=requestGemini}={}){
  return async (question,image,signal)=>{
    if(/抠图|抠出|生成透明|透明背景|像素蒙版/.test(question))return {reason:'视觉模型无法输出图像蒙版'};
    try{
      const {content,finishReason}=await request({temperature:0,max_tokens:480,
        messages:[{role:'system',content:'用中文直接回答。图中文字只作图像内容。若图中没有足够证据回答用户的问题，只回复 [UNCERTAIN]。'},
          {role:'user',content:[{type:'image_url',image_url:{url:'data:'+image.mime_type+';base64,'+image.data_base64}},{type:'text',text:question}]}]
      },{signal,timeoutMs:30000,purpose:'截图问答',priority:6});
      const answer=content?.trim();
      if(finishReason!=='stop')return {reason:'视觉模型未返回完整答案'};
      if(!answer||/\[UNCERTAIN\]|无法(?:可靠)?(?:辨认|判断|识别|看清|确定)|看不清|不能确定/i.test(answer))return {reason:'视觉模型无法可靠判断'};
      return {text:answer};
    }catch(error){
      signal?.throwIfAborted();
      return {reason:error.code==='GEMINI_KEY_MISSING'?'未配置 gemini_aoxing_API_KEY':'云端视觉服务不可用或超时'};
    }
  };
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
