const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('newsPanel',{
  list:()=>ipcRenderer.invoke('news:list'),
  image:(at,url)=>ipcRenderer.invoke('news:image',at,url),
  detail:(at,url)=>ipcRenderer.invoke('news:detail',at,url),
  translate:(at,url,field)=>ipcRenderer.invoke('news:translate',at,url,field),
  source:(at,url)=>ipcRenderer.invoke('news:source',at,url),
  onNew:fn=>ipcRenderer.on('news:new',()=>fn())
});
