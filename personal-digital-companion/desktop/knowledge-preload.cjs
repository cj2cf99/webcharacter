const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('feiyueKnowledge',{
  run:(action,args)=>ipcRenderer.invoke('knowledge:action',action,args),
  onSelect:callback=>ipcRenderer.on('knowledge:select',(_event,id)=>callback(id)),
});
