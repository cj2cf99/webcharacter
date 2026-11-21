// 隔离桥接：不将ipcRenderer或Node对象暴露给网页。
const {contextBridge,ipcRenderer}=require('electron');
function subscribe(channel,callback){
  if(typeof callback!=='function')throw new TypeError('callback required');
  const listener=(_event,value)=>callback(value);ipcRenderer.on(channel,listener);
  return ()=>ipcRenderer.removeListener(channel,listener);
}
const api={
  managedActions:process.argv.includes('--feiyue-actions'),
  onAction:callback=>subscribe('desktop:action',callback),
  finishAction:(ticket,ok)=>ipcRenderer.send('desktop:action-finished',{ticket,ok}),
  onIdleContext:callback=>subscribe('desktop:idle-context',callback),
  getSettings:()=>ipcRenderer.invoke('pc:get'),
  saveSettings:(config,domain)=>ipcRenderer.invoke('pc:save',{config,domain}),
  importResource:kind=>ipcRenderer.invoke('pc:import',kind),
  renameResource:(id,name)=>ipcRenderer.invoke('pc:rename',{id,name}),
  onSettings:callback=>subscribe('pc:changed',callback),
  onPageUpdate:callback=>subscribe('desktop:page-update',callback),
  reportRuntime:value=>ipcRenderer.send('pc:runtime',value),
  getRuntime:()=>ipcRenderer.invoke('pc:runtime'),
  onRuntime:callback=>subscribe('pc:runtime',callback),
  soundReady:()=>ipcRenderer.send('desktop:sound-ready'),
  setSound:value=>ipcRenderer.send('desktop:sound-change',value),
  previewSound:id=>{if(typeof id==='string')ipcRenderer.send('desktop:sound-preview',id);},
  onSound:callback=>subscribe('desktop:sound',callback),
  onSoundPreview:callback=>subscribe('desktop:sound-preview',callback),
  ready:()=>ipcRenderer.send('desktop:ready'),
  hit:value=>{if(typeof value==='boolean')ipcRenderer.send('desktop:hit',value);},
  toggleConversation:()=>ipcRenderer.send('desktop:toggle-conversation'),
  dragStart:(head=false)=>ipcRenderer.send('desktop:drag-start',head===true),
  dragEnd:(canceled=false)=>ipcRenderer.send('desktop:drag-end',canceled===true),
  attachmentDone:asset=>{if(typeof asset==='string')ipcRenderer.send('desktop:attachment-done',asset);},
  elevatorPlayback:value=>ipcRenderer.send('desktop:elevator-playback',value),
  onAttachmentNotice:callback=>subscribe('desktop:attachment-notice',callback),
  onAttachmentPending:callback=>subscribe('desktop:attachment-pending',callback),
  onAttachment:callback=>subscribe('desktop:attachment',callback),
  onIdleSpecial:callback=>subscribe('desktop:idle-special',callback),
  onMove:callback=>subscribe('desktop:move',callback),
  onScale:callback=>subscribe('desktop:scale',callback),
  onPosture:callback=>subscribe('desktop:posture',callback),
  onPointer:callback=>subscribe('desktop:pointer',callback),
  onVisible:callback=>subscribe('desktop:visible',callback),
  onThought:callback=>subscribe('desktop:thought',callback),
  onWork:callback=>subscribe('desktop:work',callback),
};
if(process.argv.includes('--feiyue-benchmark')){
  api.onPerfSnapshot=callback=>subscribe('desktop:perf-request',callback);
  api.perfSnapshot=value=>ipcRenderer.send('desktop:perf-response',value);
}
contextBridge.exposeInMainWorld('desktopHost',api);
