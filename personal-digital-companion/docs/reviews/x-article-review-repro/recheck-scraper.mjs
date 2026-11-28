// 第二次复审：新抓取代码的边界实测。本地夹具走 127.0.0.1；LIVE 段匿名只读打开公开帖子（不带 Cookie、不下载媒体文件）。
import * as electron from 'electron';
import http from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {createElectronArticleFetcher,buildExtractionScript,renderArticleMarkdown}=await import(new URL('../../../desktop/x-article.mjs',import.meta.url).href);
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'xv-review2-el-')));
electron.app.on('window-all-closed',()=>{});
const report=(id,yes,detail)=>console.log(`${yes?'[复现]':'[未复现]'} ${id} ${detail}`);
const cell=html=>`<div data-testid="cellInnerDiv">${html}</div>`;
const tweet=(id,handle,text,extra='')=>cell(`<article data-testid="tweet"><div data-testid="User-Name"><a href="/${handle}">@${handle}</a></div>
<a href="/${handle}/status/${id}"><time datetime="2026-11-28T01:00:00.000Z">t</time></a><div data-testid="tweetText">${text}</div>${extra}</article>`);
// 焦点帖的常见版式：正文、引用卡片在前，本帖时间戳链接在最后。
const focal=(quoteTime)=>cell(`<article data-testid="tweet"><div data-testid="User-Name"><a href="/main">@main</a></div><div data-testid="tweetText">主贴正文</div>
<div role="link" tabindex="0"><div><a href="/old">@old</a></div>${quoteTime}<div data-testid="tweetText">被引用旧帖</div></div>
<a href="/main/status/500"><time datetime="2026-11-28T03:00:00.000Z">本帖时间</time></a></article>`);
const later=(ms,html)=>`<script>setTimeout(()=>document.getElementById('list').insertAdjacentHTML('beforeend',${JSON.stringify(html)}),${ms})</script>`;
const pages={
  '/main/status/500':focal('<time datetime="2020-01-01T00:00:00.000Z">引用时间</time>'),
  '/main/status/500x':'',
  // 回复比主贴晚 1.5 秒到达
  '/late/status/1':`<div id="list">${tweet(1,'late','主贴')}</div>${later(1500,tweet(2,'r1','晚到回复1')+tweet(3,'r2','晚到回复2'))}`,
  // 首屏一条回复，滚动后下一批要 900ms 网络时间
  '/page/status/1':`<div id="list">${tweet(1,'page','主贴')}${tweet(2,'r1','回复1')}</div><div style="height:3000px"></div><script>let asked=false;addEventListener('scroll',()=>{if(asked)return;asked=true;setTimeout(()=>document.getElementById('list').insertAdjacentHTML('beforeend',${JSON.stringify(tweet(3,'r2','回复2')+tweet(4,'r3','回复3'))}),900)})</script>`,
  // 回复里的“显示更多”是跳转到该回复详情页的链接（单页应用换内容）
  '/nav/status/1':`<div id="list">${tweet(1,'nav','主贴')}${tweet(2,'long','截断…<a data-testid="tweet-text-show-more-link" href="/long/status/2" onclick="history.pushState(0,\'\',\'/long/status/2\');document.getElementById(\'list\').innerHTML=window.other;return false">显示更多</a>')}${tweet(3,'r2','原页第二条回复')}${tweet(4,'r3','原页第三条回复')}</div><div style="height:2000px"></div><script>window.other=${JSON.stringify(tweet(1,'nav','主贴')+tweet(2,'long','完整长回复')+tweet(90,'stranger','别人对长回复的子回复')+tweet(91,'stranger2','另一条子回复'))}</script>`,
  // 引用的帖子只有图片没有文字
  '/pic/status/7':tweet(7,'pic','看图',`<div role="link" tabindex="0"><a href="/w">@w</a><time datetime="2026-11-01T00:00:00Z">t</time><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/QUOTED?format=jpg"></div></div>`),
  // 线上匿名页实测形态：有 <article> 但整页没有任何 data-testid
  '/bare/status/8':`<article><div><span>Captain</span><a href="/cap">@cap</a></div><div lang="en">这是页面上看得见的正文</div><img src="https://pbs.twimg.com/media/VISIBLE?format=jpg"><a href="/cap/status/8"><time datetime="2026-04-13T00:00:00Z">t</time></a></article>`,
};
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><body>'+(pages[req.url.split('?')[0]]??'')+'</body>');});
async function main(){
  await electron.app.whenReady();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const win=new electron.BrowserWindow({width:1280,height:900,show:false,webPreferences:{sandbox:true}});
  const run=async(path,limit=3)=>{await win.loadURL(base+path);return win.webContents.executeJavaScript(buildExtractionScript(limit));};
  let d=await run('/main/status/500');
  report('P1 引用在本帖时间戳之前',d.publishedAt!=='2026-11-28T03:00:00.000Z'||!String(d.url).includes('/status/500'),`blocked=${d.blocked} publishedAt=${d.publishedAt}（应为 2026-11-28T03:00）url=${String(d.url).slice(-24)}`);
  pages['/main/status/500']=focal('<a href="/old/status/9"><time datetime="2020-01-01T00:00:00.000Z">引用时间</time></a>');
  d=await run('/main/status/500');
  report('P2 引用时间带链接时找不到本帖',Boolean(d.blocked)||!String(d.url).includes('/status/500'),`blocked=${d.blocked} url=${d.url?.slice(-24)}`);
  d=await run('/late/status/1',2);
  report('Q1 回复晚到 1.5 秒',(d.replies?.length??0)<2,`页面最终有 2 条回复，取到 ${d.replies?.length}`);
  d=await run('/page/status/1',3);
  report('Q2 滚动后下一批需 900ms',(d.replies?.length??0)<3,`页面最终有 3 条回复，取到 ${d.replies?.length}`);
  d=await run('/nav/status/1',3);
  report('Q3 显示更多跳页',d.replies?.some(r=>/子回复/.test(r.text))||d.replies?.[0]?.text!=='完整长回复',`回复：${d.replies?.map(r=>r.author+':'+r.text).join(' | ')}`);
  d=await run('/pic/status/7');
  report('R1 纯图片引用丢失',!d.quote&&!d.media.some(m=>m.url.includes('QUOTED')),`quote=${JSON.stringify(d.quote)} media=${d.media.length}`);
  d=await run('/bare/status/8');
  report('S1 无 data-testid 页面存成空内容',!d.blocked&&!d.text,`blocked=${d.blocked} type=${d.type} title="${d.title}" author="${d.author}" text="${d.text}" media=${d.media?.length}（页面上可见正文与图片）`);
  win.destroy();
  // LIVE：改造后的抓取器匿名打开公开帖子
  const fetchArticle=createElectronArticleFetcher(electron);
  for(const url of ['https://x.com/captainamerica/status/719944021058060289','https://x.com/UltimaShadowX/status/1577719286659006464','https://x.com/jack/status/20']){
    try{
      const data=await fetchArticle({url,repliesLimit:3,signal:AbortSignal.timeout(60_000)});
      console.log('LIVE ok',url,JSON.stringify({type:data.type,author:data.author,title:data.title,publishedAt:data.publishedAt,textLength:data.text?.length,text:data.text?.slice(0,60),media:data.media?.map(m=>[m.type,m.url.slice(0,60)]),replies:data.replies?.length}));
    }catch(error){console.log('LIVE fail',url,error.message.slice(0,160));}
  }
}
main().then(()=>{server.close();electron.app.exit(0);},error=>{console.error(error);electron.app.exit(1);});
