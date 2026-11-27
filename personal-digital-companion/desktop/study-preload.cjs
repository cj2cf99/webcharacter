const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('feiyueStudy',{run:(action,args)=>ipcRenderer.invoke('study:action',action,args),
  synthesize:text=>ipcRenderer.invoke('study:voice',text)});
