const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('feiyueCardDraw',{
  run:(action,args)=>ipcRenderer.invoke('card-draw:action',action,args),
  onChanged:callback=>ipcRenderer.on('card-draw:changed',()=>callback()),
});
