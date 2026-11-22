import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPanelWindow,showPanel} from './panel-window.mjs';

export function attachPollSettings(electron,{root,bundle,checks}){
  let panel,loading;
  const entry=resolve(bundle,'poll-settings.html');
  function trusted(event){
    if(!panel||panel.isDestroyed()||event.sender!==panel.webContents||event.senderFrame!==panel.webContents.mainFrame)
      throw Error('请从绯月的轮询设定页面操作');
  }
  electron.ipcMain.handle('poll-settings:get',event=>{trusted(event);return checks.polls();});
  electron.ipcMain.handle('poll-settings:set',(event,id,input)=>{trusted(event);return checks.configure(id,input);});
  async function open(queue=false){
    if(!panel||panel.isDestroyed()){
      const win=createPanelWindow(electron,{title:'绯月 · 轮询设定',width:580,height:500,minWidth:340,minHeight:300,
        show:false,autoHideMenuBar:true,webPreferences:{preload:resolve(root,'desktop/poll-settings-preload.cjs'),sandbox:true,
          contextIsolation:true,nodeIntegration:false}},root);
      panel=win;
      win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(entry).href)event.preventDefault();});
      win.once('closed',()=>{if(panel===win)panel=null;});
      loading=win.loadFile(entry).catch(error=>{if(!win.isDestroyed())win.destroy();throw error;});
    }
    const current=panel;await loading;
    if(current!==panel||current.isDestroyed())return;
    showPanel(current);current.focus();
    if(queue)current.webContents.send('poll-settings:queue');
  }
  return {open,get panel(){return panel;},
    update(){panel?.webContents.send('poll-settings:changed',checks.polls());},
    close(){electron.ipcMain.removeHandler('poll-settings:get');electron.ipcMain.removeHandler('poll-settings:set');panel?.destroy();}};
}
