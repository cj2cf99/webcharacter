// 复审复现：视频移出 archive 不恢复；超时后 t.co 还原不受中止信号约束。临时目录，不联网。
import {mkdirSync,mkdtempSync,renameSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {createXVideo}=await import(new URL('../../../desktop/x-video.mjs',import.meta.url).href);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const report=(id,yes,detail)=>console.log(yes?'[复现]':'[未复现]',id,detail);
const base=mkdtempSync(join(tmpdir(),'xv-review-more-')),dl=join(base,'dl');mkdirSync(join(dl,'archive'),{recursive:true});
writeFileSync(join(dl,'archive','v.mp4'),'v');
writeFileSync(join(dl,'catalog.json'),JSON.stringify({version:1,items:[{id:'v',kind:'video',url:'https://x.com/a/status/1',name:'v',finishedAt:1,archivedAt:2,files:[{name:'v.mp4'}]}]}));
let core=createXVideo({profile:join(base,'p'),downloadRoot:dl,tools:()=>({ytDlp:'',ffmpeg:''}),safeStorage:null});
renameSync(join(dl,'archive','v.mp4'),join(dl,'v.mp4'));
report('N-video-unarchive',core.library({}).total===0,'视频文件移回根目录后列表 total='+core.library({}).total);
core.close();
let calls=0;
core=createXVideo({profile:join(base,'p2'),downloadRoot:join(base,'dl2'),tools:()=>({ytDlp:'',ffmpeg:''}),safeStorage:null,articleLimit:40,notify(){},
  fetcher:async()=>{calls++;await wait(150);return new Response('',{status:200});},
  fetchArticle:async()=>({type:'tweet',title:'t',text:Array.from({length:12},(_,i)=>'https://t.co/a'+i).join(' '),media:[],replies:[]})});
await core.enqueue({url:'https://x.com/a/status/2',kind:'article'});
await wait(700);
const snap=core.snapshot();
report('O-tco-after-timeout',snap.tasks[0]?.state==='paused'&&snap.occupied===1,`超时后 700ms：state=${snap.tasks[0]?.state} occupied=${snap.occupied} 已发请求 ${calls}`);
core.close();process.exit(0);
