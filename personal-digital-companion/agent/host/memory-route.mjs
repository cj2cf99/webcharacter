import {memoryHtml,memoryScript,memoryStyle} from './memory-page.mjs';
export function createMemoryPage({shell,authorize}){
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'"};
  return async function handle(request,env){
    const path=new URL(request.url).pathname;
    const page=/^\/companion\/memory\/?$/.test(path);
    const api=/^\/api\/companion\/memory\/(?:diaries|nags)(?:\/[\w.-]+)?$/.test(path);
    const script=path==='/assets/companion/memory.js',style=path==='/assets/companion/memory.css';
    if(!page&&!api&&!script&&!style)return null;
    const fail=(status,message)=>Response.json({error:{message}},{status,headers});
    if(env.COMPANION_ENABLED!=='true')return fail(503,'手记尚未启用');
    if(!['GET','HEAD'].includes(request.method)||api&&request.method==='HEAD')return fail(405,'手记页面只读');
    let owner;
    try{owner=await authorize(request,env);}catch(e){return fail(e.status??403,'访问未授权');}
    if(!owner?.sub)return fail(403,'访问未授权');
    // 桌宠服务身份关联一个人的手记，不能向主站的其他允许账户共享。
    const subjects=String(env.ALLOWED_OWNER_SUBS??'').split(',').map(s=>s.trim()).filter(Boolean);
    if((subjects.length||env.APP_ENV==='production')&&(subjects.length!==1||subjects[0]!==owner.sub))return fail(403,'无法确定手记所属账户');
    if(api){
      try{return await env.SUBSCRIPTIONS_API.fetchOwner(new Request(request.url),owner.sub);}
      catch{return fail(503,'暂时无法读取手记');}
    }
    const body=page?shell(memoryHtml,path,env):style?memoryStyle:memoryScript;
    return new Response(request.method==='HEAD'?null:body,{headers:{...headers,'Content-Type':(page?'text/html':style?'text/css':'text/javascript')+'; charset=utf-8'}});
  };
}
