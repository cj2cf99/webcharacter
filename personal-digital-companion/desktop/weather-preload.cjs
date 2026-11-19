const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('feiyueWeather', {
  get: () => ipcRenderer.invoke('weather:get'),
  refresh: () => ipcRenderer.invoke('weather:refresh'),
  openJma: page => ipcRenderer.invoke('weather:jma', page),
  onChange: callback => ipcRenderer.on('weather:changed', (_event, data) => callback(data)),
});
