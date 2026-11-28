const {contextBridge,ipcRenderer}=require('electron');
const call=name=>(...args)=>ipcRenderer.invoke('x-video:'+name,...args);
contextBridge.exposeInMainWorld('xVideo',{
  snapshot:call('snapshot'),
  submit:call('submit'),
  checkUpdate:call('check-update'),
  update:call('update'),
  task:call('task'),
  library:call('library'),
  thumb:call('thumb'),
  play:call('play'),
  reveal:call('reveal'),
  archive:call('archive'),
  clipboard:call('clipboard'),
  importCookies:call('cookie-import'),
  importCookieFile:call('cookie-file'),
  clearCookies:call('cookie-clear'),
  openManage:call('open-manage'),
  takeTab:call('take-tab'),
  onChanged:callback=>ipcRenderer.on('x-video:changed',()=>callback()),
  onTab:callback=>ipcRenderer.on('x-video:tab',()=>callback()),
});
