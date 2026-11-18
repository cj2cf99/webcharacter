export const CLOUDFLARE_MODEL='@cf/google/gemma-4-26b-a4b-it';
// 独立Worker的薄备用；主站挂载优先注入既有createEnvAiClient，不复制多供应商框架。
export function createBindingAiClient(env,{timeoutMs=10000}={}) {
  return {async generate(input,{signal}={}) {
    if(typeof env?.clouflareai?.run!=='function')throw Object.assign(new Error('AI未配置'),{code:'NOT_CONFIGURED'});
    if(signal?.aborted)throw Object.assign(new Error('请求取消'),{code:'CANCELLED'});
    let timer,onAbort;
    try {
      const stopped=new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(Object.assign(new Error('AI超时'),{code:'TIMEOUT'})),timeoutMs);
        onAbort=()=>reject(Object.assign(new Error('请求取消'),{code:'CANCELLED'}));
        signal?.addEventListener('abort',onAbort,{once:true});
      });
      const data=await Promise.race([env.clouflareai.run(CLOUDFLARE_MODEL,{
        messages:input.messages,max_completion_tokens:input.maxOutputTokens,stream:false,
      }),stopped]);
      if(data?.choices!==undefined&&!Array.isArray(data.choices))throw Object.assign(new Error('无效响应'),{code:'INVALID_RESPONSE'});
      const choice=data?.choices?.[0];
      return {provider:'cloudflare',model:CLOUDFLARE_MODEL,
        text:data?.choices!==undefined?choice?.message?.content:data?.response,
        finishReason:choice?.finish_reason??data?.finish_reason??'unknown'};
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
  }};
}
// 图片走独立视觉边界，不经过主站仅接受字符串的共享文字contract。
export const createBindingVisionClient=env=>createBindingAiClient(env,{timeoutMs:30000});
