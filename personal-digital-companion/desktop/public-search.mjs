import {publicQuery} from './conversation-routing.mjs';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';

async function runReader(request,signal) {
  const script=fileURLToPath(new URL('../workflows/comfyui/public_images.py',import.meta.url));
  return new Promise((resolve,reject)=>{
    const child=execFile('python',['-B',script],{signal,windowsHide:true,timeout:60000,maxBuffer:1024*1024},(error,stdout)=>{
      try {
        const row=JSON.parse(stdout);
        if(error||!row.sources?.length)throw Error(row.error||'公开来源暂不可用');
        resolve(row.sources);
      }catch(err){reject(err);}
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(JSON.stringify(request));
  });
}

export async function searchPublicWeb(query,signal,read=runReader,{mode='web',page}={}) {
  if(page){
    try{
      const u=new URL(page);
      if(u.protocol!=='https:'||u.username||u.password||u.port||page.length>2048||
        [...u.searchParams.keys()].some(k=>/token|secret|signature|credential|api.?key|password|session/i.test(k)))throw Error();
    }catch{return {state:'error',text:'请输入不含登录凭据的公开 HTTPS 网页地址。'};}
  }else if(!publicQuery(query))return {state:'answer',text:'请提供明确的公开关键词。'};
  try{
    const sources=await read({mode,query,page},signal);
    const text=mode==='images'?sources.map((s,i)=>(i+1)+'. '+s.title).join('\n')+'\n点「查看来源」可翻看图片和原页。'+(sources[0]?.file?'\n本机素材：'+sources[0].file.replace(/[\\/][^\\/]+$/,''):'')
      :sources.map((s,i)=>'['+(i+1)+'] '+s.title+'\n'+s.snippet.slice(0,280)).join('\n\n');
    return {state:'answer',text,sources};
  }catch(err){
    const tavilyErrors={
      TAVILY_NOT_CONFIGURED:'公开搜索需要在本机设置 TAVILY_API_KEY，也可以直接提供公开网页地址。',
      TAVILY_QUOTA:'Tavily 免费额度已用完，本次查询已停止。',
      TAVILY_FREE_UNVERIFIED:'无法确认 Tavily 免费账户额度，请核对 Researcher 套餐及按量付费设置。',
      TAVILY_NO_POSTS:'Tavily 暂未收录匹配的 X 帖子。',
      TAVILY_HTTP_401:'Tavily 拒绝了本机密钥，请核对 TAVILY_API_KEY。',
      TAVILY_HTTP_429:'Tavily 请求过于频繁，请稍后再查。'
    };
    if(tavilyErrors[err.message])return {state:err.message==='TAVILY_NO_POSTS'?'answer':'error',code:err.message,text:tavilyErrors[err.message]};
    throw err;
  }
}

export const searchPublicImages=(query,signal,page)=>searchPublicWeb(query,signal,undefined,{mode:'images',page});

export async function askDeepSeek(query,signal,fetcher=fetch){
  if(!publicQuery(query)||/https?:|(?:我|我的)(?:的)?(?:日记|病历|账单|住址|电话|对话|记录)/u.test(query))return {state:'error',text:'请单独提供可以发给 DeepSeek 的公开问题。'};
  const key=process.env.DEEPSEEK_API_KEY;
  if(!key)return {state:'answer',text:'本机尚未配置 DEEPSEEK_API_KEY，这个问题尚未发出。'};
  const res=await fetcher('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',
    signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]),
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model:process.env.FEIYUE_DEEPSEEK_MODEL||'deepseek-flash',max_tokens:600,
      messages:[{role:'user',content:query}]})});
  if(!res.ok)throw Error('DeepSeek 暂不可用');
  const reply=(await res.json()).choices?.[0]?.message?.content;
  if(!reply?.trim())throw Error('DeepSeek 未返回答案');
  return {state:'answer',text:'向 DeepSeek 提交的公开问题：'+query+'\n\n'+reply};
}
