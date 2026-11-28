const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('quickLinks',{
  list:()=>ipcRenderer.invoke('quick-links:list'),
  reload:()=>ipcRenderer.invoke('quick-links:reload'),
  create:input=>ipcRenderer.invoke('quick-links:create',input),
  update:(id,input)=>ipcRenderer.invoke('quick-links:update',id,input),
  remove:id=>ipcRenderer.invoke('quick-links:remove',id),
  reorder:ids=>ipcRenderer.invoke('quick-links:reorder',ids),
  open:url=>ipcRenderer.invoke('quick-links:open',url),
});
