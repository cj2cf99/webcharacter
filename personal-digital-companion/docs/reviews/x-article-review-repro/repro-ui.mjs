// 复审复现（真实 Electron 小窗，抓取器与剪贴板用替身）：「更新重抓」按钮在改过地址后是否仍然生效；视频移出 archive 是否恢复。
import * as electron from 'electron';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const repo=new URL('../../../desktop/',import.meta.url).href;
const {attachXVideo}=await import(repo+'x-video-host.mjs');
const root=fileURLToPath(new URL('../../../',import.meta.url)),profile=mkdtempSync(join(tmpdir(),'xv-review-ui-')),dl=join(profile,'dl');
electron.app.setPath('userData',profile);electron.app.on('window-all-closed',()=>{});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<300;i++){if(await check())return true;await wait(20);}throw Error('timeout '+check);}
class Hidden extends electron.BrowserWindow{constructor(o){super({...o,show:false,x:-6000});}show(){this.showInactive();}focus(){}}
electron.app.whenReady().then(async()=>{
  let version=1;
  const host=attachXVideo({...electron,BrowserWindow:Hidden,clipboard:{readText:()=>''}},{root,bundle:join(root,'output/desktop-bundle'),profile,downloadRoot:dl,notify(){},
    overrides:{tools:()=>({ytDlp:'',ffmpeg:''}),spawn:()=>{throw Error('no spawn');},fetchArticle:async({url})=>({type:'tweet',title:'t'+url.slice(-3),text:'第'+version+'版 '+url,media:[],replies:[]})}});
  const core=host.core,done=()=>until(()=>core.snapshot().tasks.length===0&&core.snapshot().occupied===0);
  const A='https://x.com/a/status/111',B='https://x.com/b/status/222';
  // 无 ffmpeg/yt-dlp 时纯文字文章可完成
  for(const url of [A,B]){await core.enqueue({url,kind:'article'});await done();}
  const read=url=>{const item=core.library({}).items.find(i=>i.url===url);return readFileSync(join(dl,item.dir,'article.md'),'utf8');};
  version=2;
  await host.openQuick();
  const q=c=>host.quickPanel.webContents.executeJavaScript(c);
  await until(()=>q("Boolean(window.xVideo)&&document.getElementById('where').textContent.length>0"));
  await q(`document.querySelector('[data-kind=article]').click();document.getElementById('url').value='${A}';document.getElementById('download').click()`);
  await until(()=>q("!document.getElementById('overwriteBtn').hidden"));
  // 用户改成另一条链接，按钮还在
  await q(`const u=document.getElementById('url');u.value='${B}';u.dispatchEvent(new Event('input'))`);
  const visible=await q("!document.getElementById('overwriteBtn').hidden&&!document.getElementById('jump').hidden");
  await q("document.getElementById('overwriteBtn').click()");
  await wait(600);await done();
  console.log(visible&&read(B).includes('第2版')?'[复现]':'[未复现]','M-overwrite-stale','改地址后按钮仍可见='+visible+'；B 未经“已存在”提示即被覆盖='+read(B).includes('第2版')+'；A 保持原版='+read(A).includes('第1版'));
  host.close();electron.app.exit(0);
}).catch(error=>{console.error(error);electron.app.exit(1);});
