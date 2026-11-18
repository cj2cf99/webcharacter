import * as electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {startDesktop,initialBounds} from '../desktop/shell.mjs';
import {watchWindows} from '../desktop/native-windows.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const profile=mkdtempSync(join(tmpdir(),'pet-attachment-')),root=resolve(import.meta.dirname,'..');electron.app.setPath('userData',profile);await electron.app.whenReady();
 const area=electron.screen.getPrimaryDisplay().workArea;
 const a=new electron.BrowserWindow({x:area.x+100,y:area.y+260,width:500,height:430,show:false,title:'Attachment QA A'});
 const b=new electron.BrowserWindow({x:area.x+650,y:area.y+260,width:500,height:430,show:false,title:'Attachment QA B'});
 await a.loadURL('data:text/html,<h1>Attachment fixture A</h1>');await b.loadURL('data:text/html,<h1>Attachment fixture B</h1>');a.showInactive();b.showInactive();
 const id=w=>w.getNativeWindowHandle().readBigUInt64LE().toString(),aid=id(a),bid=id(b);let latest=null,result,testForeground=bid;const nativeFocus=process.argv.includes('--native-focus');
 const wait=async fn=>{for(let i=0;i<700;i++){if(await fn())return;await delay(50);}throw Error('timeout');};
 const tasks={startup:async()=>{},retryPending:async()=>{},beginQuitCheck(){},activeCount:()=>0,stop:async()=>{}};
 try{
 result=await startDesktop(electron,{profile,bundle:resolve(root,'output/desktop-bundle'),tasks,windowSource:callbacks=>watchWindows({...callbacks,excludePid:0,onSnapshot:data=>{latest=data;callbacks.onSnapshot({...data,foreground:nativeFocus?data.foreground:testForeground,windows:data.windows.filter(w=>[aid,bid].includes(w.id))});}})});
 await wait(()=>result.getStats().ready&&latest?.windows.some(w=>w.id===aid));
 if(nativeFocus){b.focus();await wait(()=>latest.foreground===bid);a.focus();await wait(()=>latest.foreground===aid);}else{await wait(()=>result.attachment.history[0]===bid);testForeground=aid;await wait(()=>result.attachment.history[0]===aid);}
 result.startAttachment('sit','top',process.argv.includes('--continuous'));await wait(()=>result.attachment.active?.id===aid);
 await wait(async()=>{const v=await result.win.webContents.executeJavaScript('window.desktopHost.getRuntime()');return v?.resource==='attachment-sit-idle';});
 if(!process.argv.includes('--continuous'))result.startAttachment('lie','top');await wait(async()=>{const v=await result.win.webContents.executeJavaScript('window.desktopHost.getRuntime()');return v?.resource==='attachment-sit-to-lie';});
 await wait(async()=>{const v=await result.win.webContents.executeJavaScript('window.desktopHost.getRuntime()');return v?.resource==='attachment-lie-idle';});
 if(!process.argv.includes('--continuous'))result.startAttachment('sit','top');await wait(async()=>{const v=await result.win.webContents.executeJavaScript('window.desktopHost.getRuntime()');return v?.resource==='attachment-lie-to-sit';});
 await wait(async()=>{const v=await result.win.webContents.executeJavaScript('window.desktopHost.getRuntime()');return v?.resource==='attachment-sit-idle';});
 result.attachment.continuous=false;
 const ratio=await result.win.webContents.executeJavaScript("(()=>{const c=document.querySelector('#character');return c.width/c.height})()");assert(Math.abs(ratio-854/768)<.005,'真实比例画布不拉伸');console.log('PASS HUMAN：坐→卧→坐双向过渡结束后自动切主动作，画布比例正确。');
 const old=result.win.getBounds();a.setPosition(a.getBounds().x+40,a.getBounds().y+20);await wait(()=>Math.abs(result.win.getBounds().x-old.x-40)<=4);assert(Math.abs(result.win.getBounds().y-old.y-20)<=4);
 a.minimize();await wait(()=>result.attachment.active?.id===bid);
 b.maximize();await wait(()=>result.attachment.active===null);
 const home=initialBounds(area),got=result.win.getBounds();assert(Math.abs(home.x-got.x)<=2);assert(Math.abs(home.y-got.y)<=2);
 console.log('PASS NATIVE ATTACHMENT：真实窗口跟随、最小化转移、最大化回家、正式素材渲染。');
 b.unmaximize();await wait(()=>latest.windows.some(w=>w.id===bid&&!w.maximized));result.startAttachment('lie','top');await wait(()=>result.attachment.active?.id===bid);
 b.close();await wait(()=>result.attachment.active===null);console.log('PASS CLOSE：关闭无可用候选立即解除回家。');
 }finally{result?.hide();if(!a.isDestroyed())a.destroy();if(!b.isDestroyed())b.destroy();electron.app.quit();}
}
if(!process.argv.includes('--visible-fixtures')){console.error('此测试会显示临时窗口；仅显式传入 --visible-fixtures 时运行。后台检查使用 test-human-idle-hidden.mjs。');electron.app.exit(1);}else run().catch(e=>{console.error(e.stack);electron.app.exit(1)});
