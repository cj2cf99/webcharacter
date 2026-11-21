const {ipcRenderer,contextBridge}=require('electron');
contextBridge.exposeInMainWorld('feiyueScene',{get:()=>ipcRenderer.invoke('scene:get'),finish:(id,text)=>ipcRenderer.invoke('scene:finish',id,text)});
