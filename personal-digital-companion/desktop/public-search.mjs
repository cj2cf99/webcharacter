import {publicQuery} from './conversation-routing.mjs';

function plain(value) {
  const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return value.replace(/<[^>]+>/g,'').replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (raw, name) => {
    if (!name.startsWith('#')) return entities[name.toLowerCase()];
    const code = Number(name.replace(/^#x/i,'0x').replace(/^#/,''));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/\s+/g,' ').trim();
}
export async function searchPublicWeb(query, signal, fetcher = fetch) {
  if (!publicQuery(query)) return {state:'answer',text:'想查什么？请说“上网查”加公开名称或关键词。'};
  const url = new URL('https://search.yahoo.co.jp/search');
  url.searchParams.set('p',query);
  const response = await fetcher(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),redirect:'error'});
  if (!response.ok) throw Object.assign(Error('网络查询暂不可用。'),{status:response.status});
  const html = await response.text();
  const sources = [];
  for (const item of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const match=/^\s*<a\b[^>]*?\bhref="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<div\b[^>]*>([\s\S]*?)<\/div>/i.exec(item[1]);
    if(!match)continue;
    let link;
    try {link=new URL(plain(match[1]));} catch {continue;}
    if (!['http:','https:'].includes(link.protocol) || link.username || link.password) continue;
    const title=plain(match[2]),snippet=plain(match[3]);
    if (!title || !snippet || sources.some(item=>item.url===link.href)) continue;
    sources.push({title,snippet,url:link.href});
    if(sources.length===3)break;
  }
  if (!sources.length) throw Object.assign(Error('搜索服务没有返回可展示的结果，请换个关键词或稍后重试。'),{code:'SEARCH_EMPTY'});
  return {state:'answer',text:sources.map(item=>item.title+'\n'+item.snippet).join('\n\n'),sources};
}
