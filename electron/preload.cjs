const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('molspecDesktop', {
  isElectron: true,
  platform: process.platform,
});
