import * as electron from 'electron';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {attachSettings} from '../desktop/settings-host.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const root=resolve(import.meta.dirname,'..'),profile=mkdtempSync(join(tmpdir(),'pet-hidden-idle-'));electron.app.setPath('userData',profile);await electron.app.whenReady();
 const win=new electron.BrowserWindow({show:false,width:480,height:432,webPreferences:{preload:resolve(root,'desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 const settings=attachSettings(electron,{win,profile,root,bundle:resolve(root,'output/desktop-bundle'),legacySound:{enabled:false,volume:50}});
 let ready=false,finished=false;
 const send=special=>win.webContents.send('desktop:attachment',{asset:special?'attachment-sit':'attachment-sit-idle',label:'坐姿',side:'outside',placeholder:false,transition:null,special,width:480,height:432});
 const onReady=e=>{if(e.sender===win.webContents)ready=true;};electron.ipcMain.on('desktop:ready',onReady);
 const onDone=(e,value)=>{if(e.sender!==win.webContents)return;if(value==='special-done:attachment-sit'){finished=true;send(false);}};electron.ipcMain.on('desktop:attachment-done',onDone);
 const wait=async(fn,limit=24000)=>{const end=Date.now()+limit;while(Date.now()<end){if(await fn())return;await delay(50);}throw Error('hidden idle timeout');};
 try{
  await win.loadFile(resolve(root,'output/desktop-bundle/index.html'));await wait(()=>ready,10000);
  const runtime=()=>win.webContents.executeJavaScript('window.desktopHost.getRuntime()');
  await wait(async()=>(await runtime())?.state==='idle',4000);
  win.webContents.send('desktop:idle-special',true);
  await wait(async()=>(await runtime())?.state==='special',4000);
  await wait(async()=>(await runtime())?.state==='idle');
  win.webContents.send('desktop:move','roam');
  await wait(async()=>(await runtime())?.state==='walk',4000);
  win.webContents.send('desktop:move','interrupt');
  await wait(async()=>(await runtime())?.state==='idle',4000);
  send(false);
  await wait(async()=>(await runtime())?.resource==='attachment-sit-idle',4000);
  send(true);
  await wait(()=>finished,10000);await wait(async()=>{const v=await win.webContents.executeJavaScript('window.desktopHost.getRuntime()');return v?.resource==='attachment-sit-idle'&&!v.special;},4000);
  win.webContents.send('desktop:attachment',null);console.log('PASS HIDDEN：窗口全程隐藏；收到宿主指令播放特殊动作，播完回待机，解除依附。');
 }catch(e){console.error(e.stack);process.exitCode=1;}finally{electron.ipcMain.removeListener('desktop:ready',onReady);electron.ipcMain.removeListener('desktop:attachment-done',onDone);settings.close();win.destroy();electron.app.exit(process.exitCode||0);}
}
run().catch(e=>{console.error(e.stack);electron.app.exit(1)});
