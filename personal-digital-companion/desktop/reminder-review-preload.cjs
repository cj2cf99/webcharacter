const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('reminderReview', {
  load: () => ipcRenderer.invoke('reminder-review:load'),
  apply: choices => ipcRenderer.invoke('reminder-review:apply', choices),
});
