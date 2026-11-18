const {contextBridge,ipcRenderer}=require('electron');
function subscribe(channel,callback){if(typeof callback!=='function')throw new TypeError('callback required');const listener=(_event,value)=>callback(value);ipcRenderer.on(channel,listener);return()=>ipcRenderer.removeListener(channel,listener);}
contextBridge.exposeInMainWorld('screenQuestion',{
  state:()=>ipcRenderer.invoke('screen-qa:state'),
  ask:question=>ipcRenderer.invoke('screen-qa:ask',question),
  retry:()=>ipcRenderer.invoke('screen-qa:retry'),
  close:()=>ipcRenderer.send('screen-qa:close'),
  fit:height=>ipcRenderer.send('screen-qa:fit',height),
  onState:callback=>subscribe('screen-qa:changed',callback),
  onLayout:callback=>subscribe('screen-qa:layout',callback),
});
