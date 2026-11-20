const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('conversations',{
  read:(day,view,cursor)=>ipcRenderer.invoke('conversation:read',day,view,cursor),
  decide:input=>ipcRenderer.invoke('conversation:reminder-decision',input),
  reviewed:token=>ipcRenderer.send('conversation:reviewed',token),
  onPending:callback=>ipcRenderer.on('conversation:pending-changed',()=>callback()),
  openSource:url=>ipcRenderer.invoke('conversation:source',url),
  image:(day,id,open=false)=>ipcRenderer.invoke('conversation:image',day,id,open),
  onSelect:callback=>ipcRenderer.on('conversation:select',()=>callback()),
});
