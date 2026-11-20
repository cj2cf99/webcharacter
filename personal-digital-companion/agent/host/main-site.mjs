import {createWorker} from '../worker.mjs';
import {createBindingVisionClient} from '../assistant/cloudflare.mjs';
// 主站接线候选：宿主导入其真实authorizer/共享AI，不复制源码、不复用浏览器登录态。
export function createCompanionMount({authorizeMarket,createEnvAiClient,createVisionClient=createBindingVisionClient,handleRecords}={}) {
  if(typeof authorizeMarket!=='function'||typeof createEnvAiClient!=='function')throw new TypeError('必须注入主站身份验证和共享AI客户端');
  // 主站已有记录路由继续负责 Access、类别校验、附件和冷却。
  const writeHuShiEntry=typeof handleRecords==='function' ? async (original,env,path,body)=>{
    const headers=new Headers(original.headers);
    headers.delete('Content-Length');
    headers.set('Content-Type','application/json');
    const request=new Request(new URL(path,original.url),{method:'POST',headers,body:JSON.stringify(body),signal:original.signal});
    const response=await handleRecords(request,env);
    if(response?.status>=400&&response.status<500&&response.status!==408) {
      throw Object.assign(new Error('主站明确拒绝登记'),{code:'RECORDS_REJECTED',status:response.status});
    }
    if(response?.status!==201)throw new Error('主站登记结果未知');
    return response.json();
  } : undefined;
  const worker=createWorker({authorize:authorizeMarket,authorizeDailyLogs:authorizeMarket,sameOriginWrites:true,writeHuShiEntry,
    createVisionClient,
    createAiClient:env=>createEnvAiClient(env,{textProvider:'cloudflare'})});
  return async function handleCompanion(request,env) {
    const url=new URL(request.url),prefix='/api/companion';
    if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return null;
    url.pathname='/api'+url.pathname.slice(prefix.length);
    return worker.fetch(new Request(url,request),{...env,DB:env.COMPANION_DB});
  };
}
