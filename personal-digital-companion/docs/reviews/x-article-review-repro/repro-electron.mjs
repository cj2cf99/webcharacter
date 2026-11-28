// 复审复现（真实 Electron）：抓取器中止是否能结束；页面提取脚本在本地夹具上的行为。仅访问 127.0.0.1。
import * as electron from 'electron';
import http from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {createElectronArticleFetcher,buildExtractionScript}=await import(new URL('../../../desktop/x-article.mjs',import.meta.url).href);
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'xv-review-el-')));
electron.app.on('window-all-closed',()=>{});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const report=(id,confirmed,detail)=>console.log(`${confirmed?'[复现]':'[未复现]'} ${id} ${detail}`);

const tweet=(id,handle,text,extra='')=>`<div data-testid="cellInnerDiv"><article data-testid="tweet"><div data-testid="User-Name"><a href="/${handle}">@${handle}</a></div>
<a href="/${handle}/status/${id}"><time datetime="2026-11-28T01:00:00.000Z">t</time></a><div data-testid="tweetText">${text}</div>${extra}</article></div>`;
const pages={
  // 目标帖没有渲染出来，页面上只有别人的帖子
  '/other/status/222':tweet(111,'stranger','无关内容'),
  // 回复按滚动加载（时间线虚拟列表的最小模拟）
  '/lazy/status/1':`<div id="list">${tweet(1,'lazy','主贴')}${tweet(2,'r1','回复1')}</div><div style="height:3000px"></div>
<script>let n=3;addEventListener('scroll',()=>{while(n<8){document.getElementById('list').insertAdjacentHTML('beforeend',${JSON.stringify(tweet('N','rN','回复N'))}.replaceAll('N',n));n++;}});</script>`,
  // 主贴自己没有视频，只引用了一条带视频的帖子
  '/q/status/5':tweet(5,'q','看这个',`<div role="link" tabindex="0"><a href="/v">@v</a><a href="/v/status/6"><time datetime="2026-11-27T00:00:00Z">t</time></a><div data-testid="tweetText">带视频原帖</div><div data-testid="videoPlayer"><video></video></div></div>`),
  // 引用框前面有一张链接卡片（同样是 role=link）
  '/c/status/7':tweet(7,'c','带卡片和引用',`<div role="link" tabindex="0">链接卡片</div><div role="link" tabindex="0"><a href="/w">@w</a><div data-testid="tweetText">被引用内容</div></div>`),
  // 日语界面：广告与垃圾回复分隔
  '/ja/status/8':tweet(8,'ja','主贴')+`<div data-testid="cellInnerDiv"><article data-testid="tweet"><div>プロモーション</div><div data-testid="tweetText">日语广告</div></article></div>
<div data-testid="cellInnerDiv"><span>不適切な可能性のある返信を表示</span></div>${tweet(9,'spam','垃圾区内容')}`,
  // 长推的“显示更多”是链接而不是按钮
  '/m/status/10':tweet(10,'m','主贴')+tweet(11,'more','截断…<a data-testid="tweet-text-show-more-link" href="#" onclick="this.parentNode.textContent=\'完整正文\';return false">显示更多</a>'),
};
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/hang-load'))return;// 永不响应
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url.startsWith('/hang-script'))return res.end(tweet(1,'a','x')+`<script>Object.defineProperty(document,'body',{get(){const t=Date.now();while(Date.now()-t<60000){}}})</script>`);
  res.end('<!doctype html><meta charset="utf-8"><body>'+(pages[req.url.split('?')[0]]??'')+'</body>');
});
async function settle(promise,ms){
  return Promise.race([promise.then(()=>'resolved',e=>'rejected: '+e.message.slice(0,80)),wait(ms).then(()=>'PENDING')]);
}
async function main(){
  await electron.app.whenReady();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const fetchArticle=createElectronArticleFetcher(electron);
  // 1 页面一直不返回时中止
  for(const [label,path,delay] of [['loadURL 中中止','/hang-load',1500],['脚本执行中中止','/hang-script',4000]]){
    const abort=new AbortController();
    const promise=fetchArticle({url:base+path,repliesLimit:2,signal:abort.signal});
    await wait(delay);abort.abort();
    const state=await settle(promise,8000);
    report('E1 '+label,state==='PENDING','中止 8 秒后 fetchArticle 状态：'+state);
  }
  // 2 提取脚本
  const win=new electron.BrowserWindow({show:false,webPreferences:{sandbox:true}});
  const run=async(path,limit=5)=>{await win.loadURL(base+path);return win.webContents.executeJavaScript(buildExtractionScript(limit));};
  let data=await run('/other/status/222');
  report('E2 目标帖缺失',!data.blocked&&data.author==='@stranger',`URL 是 222，返回 blocked=${data.blocked} author=${data.author} text=${data.text}`);
  data=await run('/lazy/status/1',6);
  report('E3 不滚动',data.replies.length<6,`页面滚动后共有 6 条回复，要求 6 条，实际取到 ${data.replies.length} 条`);
  data=await run('/q/status/5');
  report('E4 引用视频误记到主贴',data.media.some(m=>m.type==='video'),`主贴 media=${JSON.stringify(data.media.map(m=>[m.type,m.url.split('/').slice(-3).join('/')]))} 引用 media=${data.quote?.media.length}`);
  data=await run('/c/status/7');
  report('E5 卡片挡住引用',!data.quote,`quote=${JSON.stringify(data.quote)?.slice(0,60)}，正文=${data.text}`);
  data=await run('/ja/status/8');
  report('E6 日语界面',data.replies.length>0,`取到回复：${data.replies.map(r=>r.text).join(' / ')}`);
  data=await run('/m/status/10');
  report('E7 显示更多链接',data.replies[0]?.text!=='完整正文',`回复正文：${data.replies[0]?.text}`);
  win.destroy();
}
main().then(()=>{server.close();electron.app.exit(0);},error=>{console.error(error);electron.app.exit(1);});
