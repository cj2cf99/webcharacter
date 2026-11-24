import {createPanelWindow,showPanel} from './panel-window.mjs';
import {SettingsStore} from './settings-store.mjs';
import {watchFileChanges,warnLiveUpdate} from './live-files.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function attachSettings(electron,{win,profile,bundle,root,legacySound,onPositionSettingsChange}){
 const {ipcMain,dialog}=electron;const store=new SettingsStore(profile,bundle,legacySound);let panel=null,lastRuntime=null;
 const versions=new Map();let revision=0;
 function snapshot(){
   const value=store.snapshot();
   for(const asset of value.assets)for(const key of ['url','compact']){
     const version=versions.get(asset[key]);if(version)asset[key]+='?v='+version;
   }
   return value;
 }
 function mediaChanged(paths){revision++;for(const file of paths)versions.set(pathToFileURL(file).href,revision);notify('media',true);}
 const trusted=e=>[win,panel].some(w=>w&&!w.isDestroyed()&&e.sender===w.webContents&&e.senderFrame===w.webContents.mainFrame);
 const notify=(kind,external=false)=>{const value={...snapshot(),kind,external};win.webContents.send('pc:changed',value);panel?.webContents.send('pc:changed',value);};
 const reload=()=>{const kind=store.reload();if(kind){onPositionSettingsChange?.(store.data.config);notify(kind,true);}};
 function save(config,domain){
   reload();
   const result=store.save(config,domain);
   if(domain==='display'||domain==='movement')onPositionSettingsChange?.(result.config);
   notify(domain);
   return result;
 }
 const stopWatching=watchFileChanges(store.file,reload);
 const handlers={
  'pc:get':snapshot,
  'pc:save':(_e,{config,domain})=>save(config,domain),
  'pc:import':async(_e,kind)=>{if(!['audio','video'].includes(kind))throw Error('资源类型无效');const result=await dialog.showOpenDialog(panel,{properties:['openFile'],filters:[{name:kind==='video'?'WebM动画':'语音',extensions:kind==='video'?['webm']:['wav','mp3','ogg','m4a','flac']}]});if(result.canceled)return null;const value=store.importFile(result.filePaths[0],kind);notify('resources');return value;},
  'pc:rename':(_e,{id,name})=>{const value=store.rename(id,name);notify('resources');return value;},
  'pc:runtime':()=>lastRuntime
 };
 for(const [channel,fn]of Object.entries(handlers))ipcMain.handle(channel,async(e,arg)=>{if(!trusted(e))throw Error('仅本地可信窗口可修改');return fn(e,arg);});
 const runtime=(e,value)=>{if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)return;lastRuntime=value;panel?.webContents.send('pc:runtime',value);};ipcMain.on('pc:runtime',runtime);
 function open(){
   if(panel&&!panel.isDestroyed()){
     if(!panel.webContents.isLoadingMainFrame()){showPanel(panel);panel.focus();}
     return;
   }
   const created=createPanelWindow(electron,{width:1200,height:850,minWidth:700,minHeight:550,show:false,
     autoHideMenuBar:true,title:'绯月设置 · 本地 PC',webPreferences:{preload:resolve(root,'desktop/preload.cjs'),
       nodeIntegration:false,contextIsolation:true,sandbox:true}},root);
   panel=created;
   const entry=resolve(bundle,'settings.html'),url=pathToFileURL(entry).href;
   created.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   created.webContents.on('will-navigate',(e,u)=>{if(u!==url)e.preventDefault();});
   created.once('closed',()=>{if(panel===created)panel=null;});
   created.loadFile(entry).then(()=>{
     if(panel===created&&!created.isDestroyed()){showPanel(created);created.focus();}
   }).catch(error=>{
     if(!created.isDestroyed()){created.destroy();warnLiveUpdate('动画与声音',error);}
   });
 }
 function close(){stopWatching();for(const name of Object.keys(handlers))ipcMain.removeHandler(name);ipcMain.removeListener('pc:runtime',runtime);panel?.destroy();}
 return {open,close,store,save,mediaChanged,get panel(){return panel}};
}
