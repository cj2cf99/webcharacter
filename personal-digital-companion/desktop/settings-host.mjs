import {SettingsStore} from './settings-store.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function attachSettings(electron,{win,profile,bundle,root,legacySound,onDisplayChange}){
 const {BrowserWindow,ipcMain,dialog}=electron;const store=new SettingsStore(profile,bundle,legacySound);let panel=null,lastRuntime=null;
 const trusted=e=>[win,panel].some(w=>w&&!w.isDestroyed()&&e.sender===w.webContents&&e.senderFrame===w.webContents.mainFrame);
 const notify=kind=>{const value={...store.snapshot(),kind};win.webContents.send('pc:changed',value);panel?.webContents.send('pc:changed',value);};
 const handlers={
  'pc:get':()=>store.snapshot(),
  'pc:save':(_e,{config,domain})=>{const result=store.save(config,domain);if(domain==='display')onDisplayChange?.(result.config.confineToScreen);notify(domain);return result;},
  'pc:import':async(_e,kind)=>{if(!['audio','video'].includes(kind))throw Error('资源类型无效');const result=await dialog.showOpenDialog(panel,{properties:['openFile'],filters:[{name:kind==='video'?'WebM动画':'语音',extensions:kind==='video'?['webm']:['wav','mp3','ogg','m4a','flac']}]});if(result.canceled)return null;const value=store.importFile(result.filePaths[0],kind);notify('resources');return value;},
  'pc:rename':(_e,{id,name})=>{const value=store.rename(id,name);notify('resources');return value;},
  'pc:runtime':()=>lastRuntime
 };
 for(const [channel,fn]of Object.entries(handlers))ipcMain.handle(channel,async(e,arg)=>{if(!trusted(e))throw Error('仅本地可信窗口可修改');return fn(e,arg);});
 const runtime=(e,value)=>{if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)return;lastRuntime=value;panel?.webContents.send('pc:runtime',value);};ipcMain.on('pc:runtime',runtime);
 function open(){if(panel&&!panel.isDestroyed()){panel.show();panel.focus();return;}panel=new BrowserWindow({width:1200,height:850,minWidth:700,minHeight:550,autoHideMenuBar:true,title:'绯月设置 · 本地 PC',webPreferences:{preload:resolve(root,'desktop/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});const entry=resolve(bundle,'settings.html'),url=pathToFileURL(entry).href;panel.webContents.setWindowOpenHandler(()=>({action:'deny'}));panel.webContents.on('will-navigate',(e,u)=>{if(u!==url)e.preventDefault();});panel.on('closed',()=>{panel=null;});panel.loadFile(entry);}
 function close(){for(const name of Object.keys(handlers))ipcMain.removeHandler(name);ipcMain.removeListener('pc:runtime',runtime);panel?.destroy();}
 return {open,close,store,get panel(){return panel}};
}
