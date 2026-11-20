const {contextBridge,ipcRenderer}=require('electron');
const methods=['local','tasks','chains','detail','receipts','claim','inspect','resume'];
contextBridge.exposeInMainWorld('taskInbox',Object.fromEntries(
  methods.map(method=>[method,value=>ipcRenderer.invoke('task-inbox:'+method,value)]),
));
