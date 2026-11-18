import {movementGrid,snapMovement} from '../desktop/movement.mjs';
import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';import {tmpdir} from 'node:os';
import {attachSettings} from '../desktop/settings-host.mjs';
async function run(){
const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'pc-settings-electron-'));
electron.app.setPath('userData',profile);await electron.app.whenReady();
let host,win;
try{
 const display=electron.screen.getPrimaryDisplay(),area=display.workArea,grid=movementGrid(display.scaleFactor),probes=[];
 for(const method of ['readback','fixed','aligned']){
  const probe=new electron.BrowserWindow({x:area.x+20,y:area.y+20,width:243,height:360,show:false,frame:false,transparent:true,resizable:false});
  probes.push(probe);const sizes=[];
  for(let i=0;i<120;i++){const base=method==='readback'?probe.getBounds():{width:method==='aligned'?snapMovement(243,grid):243,height:360};const x=area.x+20+i%8*5,y=area.y+20+i%6*5;probe.setBounds({...base,x:method==='aligned'?snapMovement(x,grid):x,y:method==='aligned'?snapMovement(y,grid):y},false);await new Promise(r=>setTimeout(r,4));sizes.push(probe.getBounds());}
  if(method==='aligned'){assert.equal(new Set(sizes.map(b=>b.width)).size,1);assert.equal(new Set(sizes.map(b=>b.height)).size,1);}
  console.log('NATIVE SIZE',method,JSON.stringify({minW:Math.min(...sizes.map(b=>b.width)),maxW:Math.max(...sizes.map(b=>b.width)),minH:Math.min(...sizes.map(b=>b.height)),maxH:Math.max(...sizes.map(b=>b.height))}));
 }
 win=new electron.BrowserWindow({width:243,height:360,show:false,webPreferences:{preload:resolve(root,'desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 probes.forEach(w=>w.destroy());
 win.webContents.on('console-message',(_e,...args)=>console.log('renderer',args));
 host=attachSettings(electron,{win,profile,bundle:resolve(root,'output/desktop-bundle'),root,legacySound:{enabled:false,volume:50}});
 await win.loadFile(resolve(root,'output/desktop-bundle/index.html'));host.open();
 const panel=host.panel;await new Promise(r=>panel.webContents.once('did-finish-load',r));
 const wait=async(fn)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('timed out');};
 await wait(()=>panel.webContents.executeJavaScript("Boolean(document.querySelector('#states button'))"));
 win.webContents.send('desktop:posture','left');await wait(()=>win.webContents.executeJavaScript("document.querySelector('#character').style.transform==='scaleX(-1)'"));
 win.webContents.send('desktop:posture','right');await wait(()=>win.webContents.executeJavaScript("document.querySelector('#character').style.transform==='none'"));console.log('PASS POSTURE：真实renderer收到左右姿态后应用/取消水平镜像。');

 win.setAlwaysOnTop(true);win.showInactive();
 const startReports=[];const trackStart=(e,v)=>{if(e.sender===win.webContents&&v?.state==='walk')startReports.push({...v,time:Date.now()});};electron.ipcMain.on('pc:runtime',trackStart);
 win.webContents.send('desktop:move',true);
 await wait(async()=>{const v=await panel.webContents.executeJavaScript('window.desktopHost.getRuntime()');return v?.state==='walk'&&v.phase==='loop';});
 electron.ipcMain.removeListener('pc:runtime',trackStart);const early=startReports.find(v=>v.phase==='enter'&&v.frame?.time>=3/24),loop=startReports.find(v=>v.phase==='loop');assert(early&&loop&&early.time<loop.time,'进入迈腿帧通知开始位移');assert(early.frame.time<.3,'首次移动信号必须在进入前半段');console.log('PASS EARLY START：提前通知到循环间隔(ms)',loop.time-early.time);
 win.webContents.send('desktop:move','finish');
 await wait(async()=>{const v=await panel.webContents.executeJavaScript('window.desktopHost.getRuntime()');return v?.state==='walk'&&v.phase==='exit';});
 await wait(async()=>{const v=await panel.webContents.executeJavaScript('window.desktopHost.getRuntime()');return v?.state==='idle';});
 assert(await panel.webContents.executeJavaScript("[...document.querySelectorAll('#states button')].some(b=>b.textContent.includes('行走'))"));
 console.log('PASS WALK：真实视频进入→循环→退出→待机，行走设置节点可见。');
 const alphaOK=await win.webContents.executeJavaScript(`(()=>{const c=document.createElement('canvas'),s=document.createElement('canvas');c.width=s.width=4;c.height=s.height=4;const ctx=c.getContext('2d'),src=s.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,4,4);src.fillStyle='blue';src.fillRect(0,0,2,4);ctx.globalCompositeOperation='copy';ctx.drawImage(s,0,0);ctx.globalCompositeOperation='source-over';return ctx.getImageData(3,1,1,1).data[3]===0&&ctx.getImageData(1,1,1,1).data[3]===255;})()`);assert(alphaOK);console.log('PASS COPY：覆盖整帧保留透明边缘，不遗留上一帧。');
 if(process.argv.includes('--walk-only'))return;
 await panel.webContents.executeJavaScript("document.querySelector('#states button').click();var s=document.querySelector('#phases select');s.value='click';s.dispatchEvent(new Event('change'));document.querySelector('#save').click();");
 await wait(()=>host.store.snapshot().config.states.idle.slots.single==='click');
 await wait(async()=>{const state=await panel.webContents.executeJavaScript('window.desktopHost.getRuntime()');return state?.state==='idle'&&state?.resource==='click';});
 assert.equal(JSON.parse(readFileSync(join(profile,'pc-behavior-settings.json'),'utf8')).config.states.idle.slots.single,'click');
 await panel.webContents.executeJavaScript("var s=document.querySelector('#masterVolume');s.value=37;s.dispatchEvent(new Event('input')); ");
 await wait(()=>host.store.snapshot().config.master.volume===37);
 const image=await panel.webContents.capturePage();writeFileSync(resolve(root,'output/pc-settings-qa.png'),image.toPNG());
 await panel.webContents.executeJavaScript("document.querySelector('#reset').click()");
 await wait(()=>panel.webContents.executeJavaScript("document.querySelector('#masterVolume').value==='37'&&document.querySelector('#phases select').value==='click'"));
 await panel.webContents.executeJavaScript("document.querySelectorAll('#states button')[2].click();document.querySelector('#force').checked=true;document.querySelector('#force').dispatchEvent(new Event('change'));document.querySelector('#effectPlay').click();document.querySelector('.effect').scrollIntoView({block:'center'});");
 await wait(()=>panel.webContents.executeJavaScript("document.querySelector('#effectStatus').textContent.includes('循环')"));
 const effectImage=await panel.webContents.capturePage();writeFileSync(resolve(root,'output/effect-preview-qa.png'),effectImage.toPNG());
 await panel.webContents.executeJavaScript("document.querySelector('#effectFinish').click()");
 await wait(()=>panel.webContents.executeJavaScript("document.querySelector('#effectStatus').textContent==='播放完成'"));
 assert.equal(host.store.snapshot().config.states.hover.force,false,'最终效果不保存动画草稿');
 await panel.webContents.executeJavaScript("document.querySelector('#effectPlay').click();document.querySelector('#effectStop').click()");
 await wait(()=>panel.webContents.executeJavaScript("document.querySelector('#effectStatus').textContent==='已停止'"));
 console.log('PASS EFFECT：三段进入/循环/强制退出/完成、停止取消晚到加载、未保存动画草稿不写入。');
 await panel.webContents.executeJavaScript("document.querySelector('#tabResources').click();document.querySelectorAll('#cards button')[1].click();document.querySelector('#videoPlay').click()");
 await wait(()=>panel.webContents.executeJavaScript("Boolean(document.querySelector('#videoPreview video'))"));
 assert(await panel.webContents.executeJavaScript("document.querySelectorAll('#videoPreview video').length===1&&document.querySelectorAll('#cards video').length===0"));
 writeFileSync(resolve(root,'output/library-layout-qa.png'),(await panel.webContents.capturePage()).toPNG());
 await panel.webContents.executeJavaScript("document.querySelector('#tabAudios').click();document.querySelector('#audioPlay').click()");
 await wait(()=>panel.webContents.executeJavaScript("Boolean(document.querySelector('#audioPreview audio'))"));
 assert(await panel.webContents.executeJavaScript("document.querySelectorAll('video').length===0&&document.querySelectorAll('#audioCards audio').length===0"));
 await panel.webContents.executeJavaScript("document.querySelector('#theme').click();var q=document.querySelector('#audioSearch');q.value='不存在的语音';q.dispatchEvent(new Event('input'));");
 assert(await panel.webContents.executeJavaScript("document.querySelector('#audioPlay').disabled&&document.querySelector('#audioCards').textContent.includes('没有匹配')"));
 await panel.webContents.executeJavaScript("var q=document.querySelector('#audioSearch');q.value='';q.dispatchEvent(new Event('input'));");
 panel.setSize(740,850);await new Promise(r=>setTimeout(r,200));
 writeFileSync(resolve(root,'output/library-light-narrow-qa.png'),(await panel.webContents.capturePage()).toPNG());
 assert(await panel.webContents.executeJavaScript("document.documentElement.scrollWidth<=window.innerWidth"));
 console.log('PASS LIBRARY：动画/声音左列表右共用预览、切换释放、搜索空状态、窄窗无横向溢出。');
 await new Promise(r=>{panel.once('closed',r);panel.close();});host.open();await new Promise(r=>host.panel.webContents.once('did-finish-load',r));
 await wait(()=>host.panel.webContents.executeJavaScript("document.querySelector('#masterVolume').value==='37'"));
 const refused=await host.panel.webContents.executeJavaScript("(async()=>{const d=await window.desktopHost.getSettings();d.config.target='web';try{await window.desktopHost.saveSettings(d.config,'animation');return false}catch{return true}})()");assert(refused);
 console.log('PASS REAL ELECTRON：界面点击保存→磁盘配置→运行renderer资源切换；声音即时保存37%；重新读取和重开保留；Web目标拒绝。');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{host?.close();win?.destroy();electron.app.exit(process.exitCode||0);}

}
run().catch(e=>{console.error(e);electron.app.exit(1)});
