const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lilacDesktop', {
  windowControl: action => {
    if (['minimize', 'maximize', 'close'].includes(action)) ipcRenderer.send('window:control', action);
  },
  auth: {
    getState: () => ipcRenderer.invoke('auth:state'),
    login: () => ipcRenderer.invoke('auth:login'),
    refresh: () => ipcRenderer.invoke('auth:refresh'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    switchAccount: id => ipcRenderer.invoke('auth:switch', id),
    removeAccount: id => ipcRenderer.invoke('auth:remove', id),
    logoutAll: () => ipcRenderer.invoke('auth:logout-all'),
    cancel: () => ipcRenderer.invoke('auth:cancel'),
    onChanged: callback => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('auth:changed', listener);
      return () => ipcRenderer.removeListener('auth:changed', listener);
    }
  }
});
