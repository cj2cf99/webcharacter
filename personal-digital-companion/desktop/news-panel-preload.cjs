const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('newsPanel',{
  list:()=>ipcRenderer.invoke('news:list'),
  image:(id,full=false)=>ipcRenderer.invoke('news:image',id,full),
  detail:id=>ipcRenderer.invoke('news:detail',id),
  context:id=>ipcRenderer.invoke('news:context',id),
  wind:id=>ipcRenderer.invoke('news:wind',id),
  cancelContext:()=>ipcRenderer.invoke('news:cancelContext'),
  translate:(id,url,field)=>ipcRenderer.invoke('news:translate',id,url,field),
  source:(id,url)=>ipcRenderer.invoke('news:source',id,url),
  archive:()=>ipcRenderer.invoke('news:archive'),
  onNew:fn=>ipcRenderer.on('news:new',()=>fn())
});
