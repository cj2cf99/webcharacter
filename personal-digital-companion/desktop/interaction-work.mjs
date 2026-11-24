import {askBandaoJson,routesToCloud} from './ai-gateway.mjs';

export const answerSchema={type:'object',properties:{reply:{type:'string'}},required:['reply'],additionalProperties:false};

export async function requestWorkCloud(request,purpose,input,signal){
  if(!request)throw Object.assign(Error('云端连接未配置'),{code:'CONFIG_NOT_CONFIGURED'});
  const response=await request('/api/assistant/message',{method:'POST',cache:'no-store',signal,
    headers:{'Content-Type':'application/json','X-Feiyue-AI-Trace':'1'},body:JSON.stringify({work:{purpose,...input}})});
  const result=await response.json();
  if(!response.ok)throw Object.assign(Error('云端候补不可用'),{code:result?.error?.code??'AI_UNAVAILABLE'});
  return result.work;
}

// 交互处理：文字交给半岛，图片（mainCandidate）交给 Gemini 视觉，各一次，不再起草后复审。
// localOnly（私密资料）和未配置半岛时用本机 4B 一次。半岛失败时仍可退回服务器候补（cloud）。
export function createInteractionWork({model,log}={}){
  return async function run({purpose,context,instruction,schema,normalize,cloud,mainCandidate,signal,skill,onTiming,maxTokens,localOnly=false}){
    async function step(label,remote,call){
      signal?.throwIfAborted();
      const began=performance.now();
      let result;
      try{
        const value=await call();
        const normalized=value?.error?{error:value.error}:await normalize(value,remote&&label==='服务器候补'?'cloud':'main');
        result=normalized?.error?{...normalized,retry:true}:normalized?{value:normalized.value}:{error:'INVALID_AI_RESPONSE',retry:true};
      }catch(error){
        signal?.throwIfAborted();
        const code=typeof error?.code==='string'?error.code:error?.name==='TimeoutError'?'TIMEOUT':'AI_UNAVAILABLE';
        result={error:code,retry:code==='DEEPSEEK_RESULT_INVALID'};
      }
      const duration=performance.now()-began;
      onTiming?.(remote?'cloudMs':'localMs',duration);
      void log?.({direction:'local',route:'交互处理',operation:purpose,stage:label,processor:remote?'cloud':'local',
        duration_ms:Math.round(duration),error:result.error});
      return result;
    }
    if(mainCandidate){
      const image=await step('云端视觉',true,()=>mainCandidate(signal));
      if(image.value!==undefined)return image.value;
      throw Object.assign(new Error('未取得可交付结果 · 视觉 '+image.error),{code:'WORK_CANDIDATES_FAILED'});
    }
    const local=!routesToCloud({private:localOnly});
    let feedback,error;
    for(let attempt=0;attempt<2;attempt++){
      const input={原始输入:context,...(feedback?{上轮反馈:feedback}:{})};
      const guide=feedback?instruction+'\n输入里的“上轮反馈”指出了上一次结果的问题，请据此改正后重新作答，仍按原来的输出字段。':instruction;
      const result=local?
        await step('本机 4B',false,()=>model?.memory?model.memory(JSON.stringify(input),guide,schema,signal,{...skill,maxTokens,aiPrivate:true}):
          model?.work?.(JSON.stringify(input),{instruction:guide,schema,skill,signal,maxTokens})):
        await step('半岛',true,()=>askBandaoJson({instruction:guide,schema,input,signal,purpose,timeoutMs:60_000}).then(value=>value));
      if(result.value!==undefined)return result.value;
      error=result.error;
      // 结果无效（格式或校验不过）才带上原因重来一次；服务不可用不重试。
      if(!result.retry)break;
      feedback=result.feedback??'上一轮结果无效，原因 '+result.error+'。请核对格式和必需字段。';
    }
    if(!local&&!localOnly&&cloud){
      const fallback=await step('服务器候补',true,()=>cloud(signal));
      if(fallback.value!==undefined)return fallback.value;
      error=fallback.error??error;
    }
    throw Object.assign(new Error('未取得可交付结果 · '+(error??'无有效结果')),{code:'WORK_CANDIDATES_FAILED'});
  };
}
