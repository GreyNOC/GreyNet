const { contextBridge, ipcRenderer } = require('electron');

// Expose ONLY these narrow, named wrappers — never `ipcRenderer` itself, and
// never a generic `invoke`/`send`/`on`. Each method maps to exactly one
// validated channel in main.js, so the renderer cannot reach arbitrary IPC.
contextBridge.exposeInMainWorld('greynetSecure', {
  getSettingsSummary: () => ipcRenderer.invoke('settings:summary'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getGoogleMapsApiKey: () => ipcRenderer.invoke('settings:gmaps-key'),
  callAi: (payload) => ipcRenderer.invoke('ai:call', payload),
  // Encrypted, main-process-owned autosave (see main.js). Keeps the at-rest
  // copy of sensitive diagrams off plaintext localStorage.
  autosaveStatus: () => ipcRenderer.invoke('autosave:status'),
  autosaveLoad: () => ipcRenderer.invoke('autosave:load'),
  autosaveSave: (json) => ipcRenderer.invoke('autosave:save', json),
  autosaveClear: () => ipcRenderer.invoke('autosave:clear'),
});
