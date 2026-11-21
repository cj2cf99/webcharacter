const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke('private-chat:'+name,...args);
contextBridge.exposeInMainWorld('feiyuePrivateChat',{
  onState:callback=>ipcRenderer.on('private-chat:state',(_event,data)=>callback(data)),
  accept:id=>invoke('accept',id),
  segment:(id,turn,index)=>invoke('segment',id,turn,index),
  played:(id,turn)=>invoke('played',id,turn),
  reply:(id,text)=>invoke('reply',id,text),
  dismiss:id=>invoke('dismiss',id),
  playbackError:id=>invoke('playback-error',id),
});
