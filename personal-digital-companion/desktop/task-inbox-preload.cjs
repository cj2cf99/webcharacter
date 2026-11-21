const {contextBridge,ipcRenderer}=require('electron');
const methods=['local','tasks','chains','detail','receipts','claim','inspect','resume','transcripts','transcript','transcriptDecision','transcriptRetry'];
contextBridge.exposeInMainWorld('taskInbox',{
  ...Object.fromEntries(methods.map(method=>[method,value=>ipcRenderer.invoke('task-inbox:'+method,value)])),
  onTranscript:callback=>ipcRenderer.on('task-inbox:show-transcript',(_event,id)=>callback(id)),
});
