const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('registration', {
  run: (action, text) => ipcRenderer.invoke('registration:run', action, text),
});
