// 第二次复审：改造后的抓取器接入核心，匿名抓一条公开帖，看最终落盘与提醒。临时目录；yt-dlp 置空，不下载任何媒体文件。
import * as electron from 'electron';
import {mkdirSync,mkdtempSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const repo=new URL('../../../desktop/',import.meta.url).href;
const {createElectronArticleFetcher}=await import(repo+'x-article.mjs');
const {createXVideo}=await import(repo+'x-video.mjs');
const base=mkdtempSync(join(tmpdir(),'xv-review2-e2e-'));
electron.app.setPath('userData',base);electron.app.on('window-all-closed',()=>{});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
electron.app.whenReady().then(async()=>{
  const real=createElectronArticleFetcher(electron),dl=join(base,'dl'),notices=[],url='https://x.com/jack/status/20';
  let good=true;
  // 第一次用替身得到一份完好归档，第二次用真实抓取器“更新重抓”。
  const core=createXVideo({profile:join(base,'p'),downloadRoot:dl,tools:()=>({ytDlp:'',ffmpeg:''}),safeStorage:null,notify:n=>notices.push(n),
    openPath:async()=>'',showItem(){},fetchArticle:async req=>good?{type:'tweet',title:'完好旧归档',author:'@jack',text:'完好的旧正文',media:[],replies:[]}:real(req)});
  const done=async()=>{for(let i=0;i<600;i++){const s=core.snapshot();if(!s.occupied&&s.tasks.every(t=>t.state!=='queued'))return s;await wait(150);}};
  await core.enqueue({url,kind:'article',name:'试验'});await done();
  good=false;
  await core.enqueue({url,kind:'article',name:'试验',overwrite:true,replies:3});
  const snap=await done();
  console.log('E2E tasks',JSON.stringify(snap.tasks.map(t=>[t.state,t.error])));
  console.log('E2E notice',notices.at(-1)?.title,'|',notices.at(-1)?.body.replace(dl,'<下载目录>'));
  const item=core.library({}).items[0];
  console.log('E2E list',item.name,item.repliesCollected,item.mediaCount);
  console.log('E2E new article.md >>>\n'+readFileSync(join(dl,item.dir,'article.md'),'utf8'));
  console.log('E2E archive',JSON.stringify(readdirSync(join(dl,'archive'))));
  core.close();
  // 视频索引条目里的缩略图字段与编号是否受限
  const dl2=join(base,'dl2'),victimDir=join(base,'p3');mkdirSync(dl2,{recursive:true});mkdirSync(victimDir,{recursive:true});
  const victim=join(victimDir,'victim.txt');writeFileSync(victim,'keep me');writeFileSync(join(dl2,'a.mp4'),'v');
  writeFileSync(join(dl2,'catalog.json'),JSON.stringify({version:1,items:[{id:'z',kind:'video',url:'https://x.com/a/status/1',name:'a',finishedAt:1,thumb:'../../victim.txt',files:[{name:'a.mp4'}]}]}));
  const c3=createXVideo({profile:victimDir,downloadRoot:dl2,tools:()=>({ytDlp:'',ffmpeg:''}),safeStorage:null});
  c3.archive('z');
  let gone=false;try{readFileSync(victim);}catch{gone=true;}
  console.log(gone?'[复现]':'[未复现]','T1 索引里的 thumb 路径导致归档时删除资料目录外层文件',gone);
  c3.close();
  // 换下载根 A→空目录B→A
  const A=join(base,'rootA'),B=join(base,'rootB'),prof=join(base,'p4');mkdirSync(A,{recursive:true});mkdirSync(B,{recursive:true});
  writeFileSync(join(A,'k.mp4'),'v');writeFileSync(join(A,'catalog.json'),JSON.stringify({version:1,items:[{id:'k',kind:'video',url:'https://x.com/a/status/2',name:'k',finishedAt:1,files:[{name:'k.mp4'}]}]}));
  const counts=[];
  for(const root of [A,B,A]){const c=createXVideo({profile:prof,downloadRoot:root,tools:()=>({ytDlp:'',ffmpeg:''}),safeStorage:null});counts.push(c.library({}).total);c.close();}
  console.log(counts[2]!==1?'[复现]':'[未复现]','T2 换根再换回后记录丢失',JSON.stringify(counts));
  // 迁移后的视频缩略图真能生成
  const ff=JSON.parse(readFileSync(new URL('../../../.local-tools.json',import.meta.url),'utf8')).ffmpeg;
  const {execFileSync}=await import('node:child_process');
  const dl5=join(base,'dl5');mkdirSync(dl5,{recursive:true});
  execFileSync(ff,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=320x180:rate=5','-t','1',join(dl5,'t.mp4')]);
  writeFileSync(join(dl5,'catalog.json'),JSON.stringify({version:1,items:[{id:'t',kind:'video',url:'https://x.com/a/status/3',name:'t',finishedAt:1,files:[{name:'t.mp4'}]}]}));
  const c5=createXVideo({profile:join(base,'p5'),downloadRoot:dl5,tools:()=>({ytDlp:'',ffmpeg:ff}),safeStorage:null});
  c5.library({});
  const [a,b]=await Promise.all([c5.thumbnail('t'),c5.thumbnail('t')]);
  const again=await c5.thumbnail('t');
  console.log('T3 迁移缩略图：首个请求',Boolean(a),'同时第二个请求',Boolean(b),'之后',Boolean(again));
  c5.close();
  electron.app.exit(0);
}).catch(error=>{console.error(error);electron.app.exit(1);});
