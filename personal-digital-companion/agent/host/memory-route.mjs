import {listTxtFiles,manualTxt} from './txt-files.mjs';
import {memoryHtml,memoryScript,memoryStyle} from './memory-page.mjs';
export function createMemoryPage({shell,authorize}){
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'"};
  return async function handle(request,env){
    const path=new URL(request.url).pathname;
    const page=/^\/companion\/memory\/?$/.test(path);
    const api=/^\/api\/companion\/memory\/(?:diaries|nags)(?:\/[\w.-]+(?:\/original)?)?$/.test(path);
    const detail=/^\/api\/companion\/memory\/(diaries|nags)\/([\w.-]+)$/.exec(path);
    const script=path==='/assets/companion/memory.js',style=path==='/assets/companion/memory.css';
    const portrait=path==='/assets/companion/journal-portrait.png';
    const files=/^(\/api\/companion\/memory\/(diaries|nags)\/([\w.-]+))\/txt$/.exec(path);
    if(!files&&!page&&!api&&!script&&!style&&!portrait)return null;
    const fail=(status,message)=>Response.json({error:{message}},{status,headers});
    if(env.COMPANION_ENABLED!=='true')return fail(503,'手记尚未启用');
    if(!files&&!['GET','HEAD'].includes(request.method)||api&&request.method==='HEAD')return fail(405,'手记页面只读');
    let owner;
    try{owner=await authorize(request,env);}catch(e){return fail(e.status??403,'访问未授权');}
    if(!owner?.sub)return fail(403,'访问未授权');
    // 桌宠服务身份关联一个人的手记，不能向主站的其他允许账户共享。
    const subjects=String(env.ALLOWED_OWNER_SUBS??'').split(',').map(s=>s.trim()).filter(Boolean);
    if((subjects.length||env.APP_ENV==='production')&&(subjects.length!==1||subjects[0]!==owner.sub))return fail(403,'无法确定手记所属账户');
    if(files){
      let record;
      try{record=await env.SUBSCRIPTIONS_API.fetchOwner(new Request(new URL(files[1],request.url)),owner.sub);}
      catch{return fail(503,'暂时无法核对原记录');}
      if(!record.ok)return fail(record.status,'原记录不可用');
      const id=files[2]==='diaries'?files[3].replace(/\.0+(?=\d+$)/u,'.'):files[3];
      return manualTxt(request,{db:env.mymaindb,bucket:env.myMainStorage,subject:JSON.stringify([owner.sub,files[2],id])});
    }
    if(portrait)return env.STOCKCHECK_ASSETS.fetch(request);
    if(api){
      try{
        const record=await env.SUBSCRIPTIONS_API.fetchOwner(new Request(request.url),owner.sub);
        if(!detail||!record.ok||!env.mymaindb)return record;
        const [,kind,recordId]=detail;
        const id=kind==='diaries'?recordId.replace(/\.0+(?=\d+$)/u,'.'):recordId;
        const txtFiles=await listTxtFiles(env.mymaindb,JSON.stringify([owner.sub,kind,id]));
        return Response.json({...await record.json(),txtFiles},{headers:{'Cache-Control':'private, no-store'}});
      }
      catch{return fail(503,'暂时无法读取手记');}
    }
    const body=page?shell(memoryHtml,path,env):style?memoryStyle:memoryScript;
    return new Response(request.method==='HEAD'?null:body,{headers:{...headers,'Content-Type':(page?'text/html':style?'text/css':'text/javascript')+'; charset=utf-8'}});
  };
}
