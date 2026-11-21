const {contextBridge,ipcRenderer}=require('electron');
if(process.isMainFrame){
  contextBridge.exposeInMainWorld('feiyueDictation',{
    available:()=>ipcRenderer.invoke('dictation:available'),
    start:()=>ipcRenderer.invoke('dictation:start'),
    transcribe:audio=>ipcRenderer.invoke('dictation:transcribe',audio),
    correct:text=>ipcRenderer.invoke('dictation:correct',text),
    end:cancel=>ipcRenderer.invoke('dictation:end',cancel===true),
  });
}
