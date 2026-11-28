// X 长文与媒体归档（纯 Node 工具 + Electron 隐藏窗页面抓取器）。
import {randomBytes} from 'node:crypto';

export const DEFAULT_REPLIES=2;
export const MIN_REPLIES=0;
export const MAX_REPLIES=10;
export const ARTICLE_LIMIT_MS=3*60_000;

export function validateReplies(raw){
  if(raw===undefined||raw===null||raw==='')return DEFAULT_REPLIES;
  const text=String(raw).trim();
  if(!/^\d+$/.test(text))throw Error(`回复数必须是 ${MIN_REPLIES}～${MAX_REPLIES} 的整数`);
  const n=Number(text);
  if(!Number.isInteger(n)||n<MIN_REPLIES||n>MAX_REPLIES)throw Error(`回复数必须在 ${MIN_REPLIES}～${MAX_REPLIES} 之间`);
  return n;
}

export function formatJstIso(input=Date.now()){
  const ms=input instanceof Date?input.getTime():typeof input==='number'?input:Date.parse(String(input));
  if(!Number.isFinite(ms))return '';
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(ms);
  return parts.replace(' ','T')+'+09:00';
}

export function normalizeImageUrl(raw){
  try{
    const url=new URL(String(raw??'').trim());
    if(!/^https?:$/.test(url.protocol))return '';
    if(url.hostname==='pbs.twimg.com'&&url.pathname.startsWith('/media/')){
      url.searchParams.set('name','orig');
    }
    return url.href;
  }catch{return '';}
}

async function resolveOneTco(shortUrl,fetcher,signal){
  let current=shortUrl;
  for(let hop=0;hop<3;hop++){
    if(signal?.aborted)break;
    let res;
    try{
      const reqSig=signal?AbortSignal.any([signal,AbortSignal.timeout(6000)]):AbortSignal.timeout(6000);
      res=await fetcher(current,{method:'HEAD',redirect:'manual',signal:reqSig});
      if(res.status===405&&!signal?.aborted){
        const reqSig2=signal?AbortSignal.any([signal,AbortSignal.timeout(6000)]):AbortSignal.timeout(6000);
        res=await fetcher(current,{method:'GET',redirect:'manual',signal:reqSig2});
      }
    }catch{break;}
    const location=res.headers?.get?.('location');
    if(res.status>=300&&res.status<400&&location){
      try{
        const next=new URL(location,current).href;
        current=next;
        if(!/^https?:\/\/t\.co\//i.test(next))return next;
      }catch{break;}
    }else{
      if(res.url&&!/^https?:\/\/t\.co\//i.test(res.url))return res.url;
      break;
    }
  }
  return current;
}

export async function resolveTcoLinks(text,links={},fetcher=fetch,signal){
  const source=String(text??'');
  const matches=source.match(/https?:\/\/t\.co\/[A-Za-z0-9]+/g);
  if(!matches?.length)return source;
  const resolved=new Map();
  for(const short of new Set(matches)){
    if(signal?.aborted)break;
    const mapped=links?.[short];
    if(mapped&&/^https?:\/\/\S+$/i.test(mapped)&&!/^https?:\/\/t\.co\//i.test(mapped)&&!mapped.includes('…')&&!mapped.endsWith('...')){
      resolved.set(short,mapped);continue;
    }
    resolved.set(short,await resolveOneTco(short,fetcher,signal));
  }
  return source.replace(/https?:\/\/t\.co\/[A-Za-z0-9]+/g,match=>resolved.get(match)??match);
}

const yamlScalar=value=>JSON.stringify(value??'');
function yamlList(lines,key,values){
  if(!values?.length){lines.push(`${key}: []`);return;}
  lines.push(`${key}:`);
  for(const item of values)lines.push(`  - ${yamlScalar(item)}`);
}
function renderQuote(quote){
  if(!quote)return '';
  const head=`> 引用 ${quote.author||'@unknown'}${quote.url?` ([原链](${quote.url}))`:''}`;
  const body=String(quote.text||'').split(/\r?\n/).map(line=>'> '+line).join('\n');
  const media=(quote.localMedia??[]).map(m=>m.type==='video'?`> [引用视频](${m.rel})`:`> ![引用图片](${m.rel})`).join('\n');
  return [head,body,media].filter(Boolean).join('\n');
}

export function renderArticleMarkdown(doc){
  const lines=['---',
    `id: ${yamlScalar(doc.id)}`,
    `type: ${yamlScalar(doc.type||'tweet')}`,
    `title: ${yamlScalar(doc.title||'')}`,
    `author: ${yamlScalar(doc.author||'')}`,
    `url: ${yamlScalar(doc.url||'')}`,
    `published_at: ${yamlScalar(doc.publishedAt||'')}`,
    `saved_at: ${yamlScalar(doc.savedAt||'')}`,
    `replies_limit: ${Number(doc.repliesLimit??DEFAULT_REPLIES)}`,
    `replies_collected: ${Number(doc.repliesCollected??0)}`];
  yamlList(lines,'media',doc.media??[]);
  yamlList(lines,'failed_media',(doc.failedMedia??[]).map(f=>`${f.url} (${f.error})`));
  lines.push('---','');

  const blocks=[`# ${doc.title||doc.author||'X 长文归档'}`];
  const metaLine=[doc.author,doc.publishedAt?`发布：${doc.publishedAt}`:'',doc.url?`[原帖](${doc.url})`:''].filter(Boolean).join(' · ');
  if(metaLine)blocks.push(metaLine);
  if(doc.text)blocks.push(doc.text);
  for(const m of doc.localMedia??[])blocks.push(m.type==='video'?`[视频](./${m.file})`:`![配图](./${m.file})`);
  if(doc.quote)blocks.push(renderQuote(doc.quote));

  if(doc.replies?.length){
    blocks.push('## 回复');
    doc.replies.forEach((reply,index)=>{
      const parts=[`### ${index+1}. ${reply.author||'@unknown'}`+(reply.publishedAt?` · ${reply.publishedAt}`:'')];
      if(reply.text)parts.push(reply.text);
      for(const m of reply.localMedia??[])parts.push(m.type==='video'?`[视频](./${m.file})`:`![配图](./${m.file})`);
      if(reply.quote)parts.push(renderQuote(reply.quote));
      blocks.push(parts.join('\n\n'));
    });
  }
  if(doc.failedMedia?.length){
    blocks.push('## 未下载媒体\n'+doc.failedMedia.map(f=>`- ${f.url}（${f.error}）`).join('\n'));
  }
  return lines.join('\n')+'\n'+blocks.filter(Boolean).join('\n\n')+'\n';
}

// 轻量读取 article.md 头部 frontmatter，供目录同步重建索引（不依赖第三方 YAML 库）。
export function parseArticleFrontmatter(markdown){
  const match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(String(markdown??'').replace(/^\uFEFF/,''));
  if(!match)return null;
  const out={};let listKey='';
  const unquote=raw=>{
    const s=raw.trim();
    if(s.startsWith('"')&&s.endsWith('"')){try{return JSON.parse(s);}catch{return s.slice(1,-1);}}
    if(s.startsWith("'")&&s.endsWith("'"))return s.slice(1,-1);
    if(s==='[]')return [];
    if(/^-?\d+$/.test(s))return Number(s);
    return s;
  };
  for(const line of match[1].split(/\r?\n/)){
    const item=/^\s*-\s+(.*)$/.exec(line);
    if(item&&listKey){
      if(!Array.isArray(out[listKey]))out[listKey]=[];
      out[listKey].push(unquote(item[1]));
      continue;
    }
    const kv=/^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if(!kv){listKey='';continue;}
    listKey=kv[2]===''?kv[1]:'';
    out[kv[1]]=kv[2]===''?[]:unquote(kv[2]);
  }
  return out.id?out:null;
}

// 注入到隐藏 Electron 页面中的抓取脚本：展开显示更多，滚动收集主贴/X Article、引用与前 N 条可见非广告回复。
export function buildExtractionScript(repliesLimit){
  return `(async () => {
    const LIMIT = ${Number(repliesLimit)};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const urlNow = location.href;
    const bodyText = (document.body?.innerText || '').trim();
    const listTweets = () => [...document.querySelectorAll('article[data-testid="tweet"]')];
    const articleView = document.querySelector('[data-testid="twitterArticleReadView"], [data-testid="article-content"]');
    const hasContent = Boolean(articleView || listTweets().length);
    if (/\\/i\\/flow\\/login/.test(urlNow) || /Sign in to X|登录 X|Log in/i.test(bodyText) && !hasContent) {
      return { blocked: 'login', message: 'X 登录态失效或未登录，请通过插件重新导入 Cookie。' };
    }
    if (/Are you a robot|Verify you are human|Something went wrong|arkoselabs|captcha/i.test(bodyText) && !hasContent) {
      return { blocked: 'captcha', message: '触发 X 人机校验或风控，请在 Chrome 手动处理后再试。' };
    }
    const tweets = listTweets();
    if (!tweets.length && !articleView) {
      return { blocked: 'not_found', message: '未加载到帖子内容（可能已删除、受保护或需要登录）。' };
    }

    function findQuote(el) {
      const qt = el.querySelector('[data-testid="quoteTweet"]');
      if (qt) return qt;
      return [...el.querySelectorAll('[role="link"][tabindex="0"]')].find(node =>
        Boolean(node.querySelector('[data-testid="tweetText"], [data-testid="tweetPhoto"], [data-testid="videoPlayer"], video, time[datetime]'))
      ) || null;
    }
    function ownTimeEl(el, quoteEl) {
      return [...el.querySelectorAll('time[datetime]')].find(t => !quoteEl || !quoteEl.contains(t)) || null;
    }
    function tweetStatusId(el) {
      const quoteEl = findQuote(el);
      const timeHref = ownTimeEl(el, quoteEl)?.closest('a')?.getAttribute('href') || '';
      const m1 = /\\/status\\/(\\d+)(?:\\/|\\?|$)/.exec(timeHref);
      if (m1) return m1[1];
      for (const a of el.querySelectorAll('a[href*="/status/"]')) {
        if (quoteEl && quoteEl.contains(a)) continue;
        const m = /\\/status\\/(\\d+)(?:\\/|\\?|$)/.exec(a.getAttribute('href') || a.href || '');
        if (m) return m[1];
      }
      return '';
    }

    const statusMatch = /status\\/(\\d+)/.exec(urlNow);
    const targetId = statusMatch ? statusMatch[1] : '';
    let mainIdx = 0;
    if (targetId && !articleView) {
      mainIdx = tweets.findIndex(el => tweetStatusId(el) === targetId);
      if (mainIdx < 0) {
        return { blocked: 'not_found', message: '未找到目标帖子（可能已删除、受保护或未加载完成）。' };
      }
    }

    const spamRe = /Show probable spam|显示可能包含冒犯|Additional replies|不適切な可能性のある返信|スパムの可能性|さらに返信を表示/i;
    const isAd = el => Boolean(el.querySelector('[data-testid="placementTracking"]')) || /^(?:Ad|广告|プロモーション|広告)$/m.test((el.innerText || '').slice(0, 120));
    const isNavHref = href => Boolean(href && !href.startsWith('#') && !/^javascript:/i.test(href));
    const expandMore = async el => {
      const more = el.querySelector('a[data-testid="tweet-text-show-more-link"]')
        || [...el.querySelectorAll('button, [role="button"], a[href]')].find(b => /Show more|显示更多|さらに表示/i.test(b.textContent || ''));
      if (!more) return false;
      if (more.tagName === 'A' && isNavHref(more.getAttribute('href') || '')) return 'truncated';
      try { more.click(); await sleep(180); } catch {}
      return true;
    };
    function extractLinks(root) {
      const map = {};
      for (const a of root?.querySelectorAll('a[href]') || []) {
        if (/^https?:\\/\\/t\\.co\\//i.test(a.href)) {
          const cand = (a.getAttribute('title') || a.innerText || '').trim();
          if (/^https?:\\/\\/\\S+$/i.test(cand) && !cand.includes('…') && !cand.endsWith('...')) map[a.href] = cand;
        }
      }
      return map;
    }
    function extractMedia(root, statusHref, exclude) {
      const media = [];
      for (const img of root?.querySelectorAll('[data-testid="tweetPhoto"] img, [data-testid="article-cover-image"] img, [data-testid="twitterArticleReadView"] img') || []) {
        if (exclude && exclude.contains(img)) continue;
        if (img.src && !img.src.includes('profile_images') && !img.src.includes('emoji')) media.push({ type: 'image', url: img.src });
      }
      const hasVideo = [...(root?.querySelectorAll('[data-testid="videoPlayer"], video') || [])].some(v => !exclude || !exclude.contains(v));
      if (hasVideo && statusHref) media.push({ type: 'video', url: statusHref });
      return media;
    }
    function extractTweet(el) {
      const userLinks = [...el.querySelectorAll('[data-testid="User-Name"] a[href^="/"]')];
      const handleLink = userLinks.find(a => /^\\/[A-Za-z0-9_]+$/.test(a.getAttribute('href') || ''));
      const author = handleLink ? '@' + handleLink.getAttribute('href').slice(1) : '';
      const quoteEl = findQuote(el);
      const timeEl = ownTimeEl(el, quoteEl);
      const postHref = timeEl?.closest('a')?.href || urlNow;
      const cloneText = (node, exclude) => {
        if (!node) return '';
        const textEl = [...node.querySelectorAll('[data-testid="tweetText"]')].find(n => !exclude || !exclude.contains(n));
        return textEl ? (textEl.innerText || '').trim() : '';
      };
      const quoteText = quoteEl ? cloneText(quoteEl) : '';
      const quoteTimeHref = quoteEl?.querySelector('time')?.closest('a')?.href || '';
      const quoteMedia = quoteEl ? extractMedia(quoteEl, quoteTimeHref || postHref, null) : [];
      const quote = quoteEl && (quoteText || quoteMedia.length) ? {
        author: (() => {
          const qh = [...quoteEl.querySelectorAll('a[href^="/"]')].find(a => /^\\/[A-Za-z0-9_]+$/.test(a.getAttribute('href') || ''));
          return qh ? '@' + qh.getAttribute('href').slice(1) : '';
        })(),
        text: quoteText,
        url: quoteTimeHref,
        media: quoteMedia
      } : null;

      return {
        author,
        publishedAt: timeEl?.getAttribute('datetime') || '',
        url: postHref,
        text: cloneText(el, quoteEl),
        links: extractLinks(el),
        media: extractMedia(el, postHref, quoteEl),
        quote
      };
    }

    const mainEl = tweets[mainIdx] || null;
    const mainExpanded = mainEl ? await expandMore(mainEl) : false;
    const mainTweet = mainEl ? extractTweet(mainEl) : { author: '', publishedAt: '', url: urlNow, text: '', links: {}, media: [], quote: null };
    if (mainExpanded === 'truncated' && mainTweet.text) mainTweet.text += '\\n\\n（正文已截断，完整内容见原帖）';
    let type = 'tweet', title = '';
    if (articleView) {
      type = 'article';
      const h = document.querySelector('[data-testid="twitter-article-title"], h1');
      title = (h?.innerText || '').trim();
      const articleBody = (articleView.innerText || '').trim();
      if (articleBody && articleBody.length > mainTweet.text.length) mainTweet.text = articleBody;
      const articleMedia = extractMedia(articleView, mainTweet.url, null);
      const seen = new Set(mainTweet.media.map(m => m.url));
      for (const m of articleMedia) if (!seen.has(m.url)) mainTweet.media.push(m);
    }
    if (!mainTweet.author || (!mainTweet.text && !mainTweet.media.length && !mainTweet.quote)) {
      return { blocked: 'empty', message: '未提取到有效帖子内容（缺少作者或正文/媒体为空），已中止保存。' };
    }
    if (!title && mainTweet.text) title = mainTweet.text.split(/\\r?\\n/)[0].slice(0, 60).trim();

    const waitMore = async (prevCount, maxMs) => {
      const deadline = Date.now() + maxMs;
      while (Date.now() < deadline) {
        await sleep(200);
        if (listTweets().length > prevCount) return true;
      }
      return listTweets().length > prevCount;
    };

    const replies = [];
    if (LIMIT > 0 && mainEl) {
      const seenKeys = new Set();
      let prevCell = mainEl.closest('[data-testid="cellInnerDiv"]') || null;
      let hitSpam = false, idleRounds = 0;
      for (let round = 0; round < 12 && replies.length < LIMIT && !hitSpam; round++) {
        let cur = listTweets();
        let mPos = cur.indexOf(mainEl);
        let start = mPos >= 0 ? mPos + 1 : 0;
        if (round === 0 && cur.length <= start) {
          await waitMore(cur.length, 2500);
          cur = listTweets();
          mPos = cur.indexOf(mainEl);
          start = mPos >= 0 ? mPos + 1 : 0;
        }
        let added = 0;
        for (let i = start; i < cur.length && replies.length < LIMIT; i++) {
          const el = cur[i];
          const sid = tweetStatusId(el);
          if (targetId && sid === targetId) continue;
          const cell = el.closest('[data-testid="cellInnerDiv"]');
          for (let p = cell?.previousElementSibling; p && p !== prevCell; p = p.previousElementSibling) {
            if (!p.querySelector('article') && spamRe.test(p.innerText || '')) { hitSpam = true; break; }
          }
          if (hitSpam || (cell && spamRe.test((cell.innerText || '').replace(el.innerText || '', '')))) { hitSpam = true; break; }
          prevCell = cell || prevCell;
          if (isAd(el)) continue;
          const key = sid || (el.innerText || '').trim().slice(0, 80);
          if (!key || seenKeys.has(key)) continue;
          seenKeys.add(key);
          const exp = await expandMore(el);
          const item = extractTweet(el);
          if (exp === 'truncated' && item.text) item.text += '\\n\\n（正文已截断，完整内容见原帖）';
          if (!item.text && !item.media.length && !item.quote) continue;
          replies.push(item);
          added++;
        }
        if (replies.length >= LIMIT || hitSpam) break;
        const prevCount = cur.length;
        window.scrollBy(0, Math.max(window.innerHeight || 900, 900));
        const grew = await waitMore(prevCount, 2000);
        idleRounds = (added || grew) ? 0 : idleRounds + 1;
        if (idleRounds >= 2) break;
      }
    }
    return { type, title, ...mainTweet, replies };
  })()`;
}

export function createElectronArticleFetcher({BrowserWindow,session}){
  return async function fetchArticle({url,repliesLimit=DEFAULT_REPLIES,cookiesText='',signal}){
    if(!BrowserWindow||!session)throw Error('当前环境不支持隐藏窗口抓取 X 长文');
    const partition='x-article-'+randomBytes(6).toString('hex');
    const ses=session.fromPartition(partition,{cache:false});
    ses.setPermissionRequestHandler?.((_wc,_perm,cb)=>cb(false));
    if(cookiesText){
      for(const raw of String(cookiesText).split(/\r?\n/)){
        const line=raw.replace(/^\uFEFF/,'');
        if(!line.trim()||line.startsWith('#')&&!line.startsWith('#HttpOnly_'))continue;
        const fields=line.split('\t');
        if(fields.length!==7)continue;
        const domain=fields[0].replace(/^#HttpOnly_/,'');
        const host=domain.replace(/^\./,'').toLowerCase();
        if(!['x.com','twitter.com'].some(h=>host===h||host.endsWith('.'+h)))continue;
        const secure=fields[3]==='TRUE';
        const expires=Number(fields[4]);
        try{
          await ses.cookies.set({
            url:`https://${host}${fields[2]||'/'}`,
            name:fields[5],
            value:fields[6],
            domain,
            path:fields[2]||'/',
            secure,
            httpOnly:line.startsWith('#HttpOnly_'),
            ...(expires>0&&{expirationDate:expires})
          });
        }catch{}
      }
    }

    const win=new BrowserWindow({
      width:1280,height:900,show:false,autoHideMenuBar:true,
      webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}
    });
    win.webContents.setAudioMuted?.(true);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    const onAbort=()=>{if(!win.isDestroyed())win.destroy();};
    signal?.addEventListener('abort',onAbort,{once:true});
    try{
      if(signal?.aborted)throw Error('文章抓取已中止');
      await win.loadURL(url);
      for(let i=0;i<50;i++){
        if(signal?.aborted)throw Error('文章抓取已中止');
        const ready=await win.webContents.executeJavaScript(
          `Boolean(document.querySelector('article[data-testid="tweet"], [data-testid="twitterArticleReadView"], [data-testid="article-content"]') || /\\/i\\/flow\\/login/.test(location.href))`
        ).catch(()=>false);
        if(ready)break;
        await new Promise(r=>setTimeout(r,450));
      }
      await new Promise(r=>setTimeout(r,800));
      if(signal?.aborted)throw Error('文章抓取已中止');
      const data=await win.webContents.executeJavaScript(buildExtractionScript(repliesLimit));
      if(data?.blocked)throw Error(data.message||'无法访问该 X 帖子');
      return data;
    }finally{
      signal?.removeEventListener('abort',onAbort);
      if(!win.isDestroyed())win.destroy();
      try{await ses.clearStorageData();}catch{}
    }
  };
}
