const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('registration', {
  run: (action, text) => ipcRenderer.invoke('registration:run', action, text),
  getReview: () => ipcRenderer.invoke('registration-review:get'),
  decideReview: (id, approve) => ipcRenderer.invoke('registration-review:decide', id, approve),
  onReviewChange: fn => ipcRenderer.on('registration-review:changed', (_event, data) => fn(data)),
});
