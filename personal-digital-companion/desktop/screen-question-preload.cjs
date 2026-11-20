const {contextBridge,ipcRenderer}=require('electron');
function subscribe(channel,callback){if(typeof callback!=='function')throw new TypeError('callback required');const listener=(_event,value)=>callback(value);ipcRenderer.on(channel,listener);return()=>ipcRenderer.removeListener(channel,listener);}
contextBridge.exposeInMainWorld('screenQuestion',{
  state:()=>ipcRenderer.invoke('screen-qa:state'),
  ask:(text,withScreen=false,mode='auto',attachment=null,references=[])=>ipcRenderer.invoke('screen-qa:ask',{text,withScreen:withScreen===true,mode,attachment,references}),
  imageList:()=>ipcRenderer.invoke('screen-qa:image-list'),
  reviewAttachment:(id,approve)=>ipcRenderer.invoke('screen-qa:attachment-review',{id,approve}),
  openImage:job=>ipcRenderer.invoke('screen-qa:image-open',job),
  onImages:callback=>subscribe('screen-qa:images-changed',callback),
  attachmentInput:true,
  details:full=>ipcRenderer.invoke('screen-qa:details',full),
  pending:empty=>ipcRenderer.invoke('screen-qa:pending',empty===true),
  decide:action=>ipcRenderer.invoke('screen-qa:decision',action),
  onMode:callback=>subscribe('screen-qa:mode',callback),
  retry:()=>ipcRenderer.invoke('screen-qa:retry'),
  close:reason=>ipcRenderer.send('screen-qa:close',{reason:['button','later','refuse'].includes(reason)?reason:'interrupted'}),
  idleClose:draft=>ipcRenderer.send('screen-qa:close',{reason:'idle',draft}),
  fit:height=>ipcRenderer.send('screen-qa:fit',height),
  onState:callback=>subscribe('screen-qa:changed',callback),
  onPending:callback=>subscribe('screen-qa:pending-changed',callback),
  onLayout:callback=>subscribe('screen-qa:layout',callback),
});
