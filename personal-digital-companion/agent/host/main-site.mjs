import {createWorker} from '../worker.mjs';
import {createBindingVisionClient} from '../assistant/cloudflare.mjs';
// 主站接线候选：宿主导入其真实authorizer/共享AI，不复制源码、不复用浏览器登录态。
export function createCompanionMount({authorizeMarket,createEnvAiClient,createVisionClient=createBindingVisionClient}={}) {
  if(typeof authorizeMarket!=='function'||typeof createEnvAiClient!=='function')throw new TypeError('必须注入主站身份验证和共享AI客户端');
  const worker=createWorker({authorize:authorizeMarket,sameOriginWrites:true,
    createVisionClient,
    createAiClient:env=>createEnvAiClient(env,{textProvider:'cloudflare'})});
  return async function handleCompanion(request,env) {
    const url=new URL(request.url),prefix='/api/companion';
    if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return null;
    url.pathname='/api'+url.pathname.slice(prefix.length);
    return worker.fetch(new Request(url,request),{...env,DB:env.COMPANION_DB});
  };
}
