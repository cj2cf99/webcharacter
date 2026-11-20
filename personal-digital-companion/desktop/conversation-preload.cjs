const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('conversations',{
  read:(day,view,cursor)=>ipcRenderer.invoke('conversation:read',day,view,cursor),
  decide:input=>ipcRenderer.invoke('conversation:reminder-decision',input),
  reviewed:token=>ipcRenderer.send('conversation:reviewed',token),
  onPending:callback=>ipcRenderer.on('conversation:pending-changed',()=>callback()),
  onChecks:callback=>ipcRenderer.on('conversation:checks-changed',()=>callback()),
  markNoticeRead:id=>ipcRenderer.invoke('conversation:read-notices',id),
  openSource:url=>ipcRenderer.invoke('conversation:source',url),
  image:(day,id,open=false)=>ipcRenderer.invoke('conversation:image',day,id,open),
  report:(day,id)=>ipcRenderer.invoke('conversation:report',day,id),
  reportImage:(day,id,step,full=false)=>ipcRenderer.invoke('conversation:report-image',day,id,step,full),
  reportFullscreen:enable=>ipcRenderer.invoke('conversation:report-fullscreen',enable),
  onTasks:callback=>ipcRenderer.on('conversation:tasks-changed',()=>callback()),
  onSelect:callback=>ipcRenderer.on('conversation:select',()=>callback()),
});
