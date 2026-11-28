// 复审诊断（只读浏览，不登录）：隐藏窗打开公开帖子后页面上到底有什么。
import * as electron from 'electron';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'xv-review-diag-')));
electron.app.on('window-all-closed',()=>{});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
electron.app.whenReady().then(async()=>{
  const ses=electron.session.fromPartition('review-diag',{cache:false});
  const win=new electron.BrowserWindow({width:1280,height:900,show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true}});
  try{await win.loadURL('https://x.com/captainamerica/status/719944021058060289');console.log('DIAG loaded');}catch(e){console.log('DIAG loadURL error',e.message.slice(0,200));}
  for(const at of [3,10,25]){
    await wait((at===3?3:at===10?7:15)*1000);
    const info=await win.webContents.executeJavaScript(`({url:location.href,title:document.title,hidden:document.hidden,
      tweets:document.querySelectorAll('article[data-testid="tweet"]').length,articles:document.querySelectorAll('article').length,
      testids:[...new Set([...document.querySelectorAll('[data-testid]')].map(n=>n.dataset.testid))].slice(0,30),
      text:(document.body?.innerText||'').replace(/\\s+/g,' ').slice(0,300)})`);
    console.log('DIAG',at+'s',JSON.stringify(info));
  }
  const shot=join(mkdtempSync(join(tmpdir(),'xv-review-shot-')),'live-diag.png');console.log('DIAG screenshot',shot);
  writeFileSync(shot,(await win.webContents.capturePage()).toPNG());
  console.log('DIAG ua',win.webContents.getUserAgent());
  electron.app.exit(0);
});
