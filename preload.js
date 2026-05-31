const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('greynetSecure', {
  getSettingsSummary: () => ipcRenderer.invoke('settings:summary'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getGoogleMapsApiKey: () => ipcRenderer.invoke('settings:gmaps-key'),
  callAi: (payload) => ipcRenderer.invoke('ai:call', payload),
});
