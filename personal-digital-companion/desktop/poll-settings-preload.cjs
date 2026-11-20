const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('pollSettings',{
  get:()=>ipcRenderer.invoke('poll-settings:get'),
  save:(id,settings)=>ipcRenderer.invoke('poll-settings:set',id,settings),
  onChange:fn=>ipcRenderer.on('poll-settings:changed',(_event,rows)=>fn(rows)),
  onQueue:fn=>ipcRenderer.on('poll-settings:queue',()=>fn()),
});
