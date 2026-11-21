const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('feiyueMenu',{
  read:()=>ipcRenderer.invoke('menu:read'),
  size:height=>ipcRenderer.send('menu:size',height),
  choose:path=>ipcRenderer.send('menu:choose',path),
  close:()=>ipcRenderer.send('menu:close'),
  onShow:fn=>ipcRenderer.on('menu:show',(_event,cycle)=>fn(cycle)),
});
