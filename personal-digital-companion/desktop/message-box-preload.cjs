const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('messageBox',{
  read:()=>ipcRenderer.invoke('message-box:read'),
  ready:height=>ipcRenderer.send('message-box:ready',height),
  choose:index=>ipcRenderer.send('message-box:choose',index),
});
