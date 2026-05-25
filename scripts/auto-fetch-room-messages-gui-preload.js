const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('roomFetchGui', {
    loadMembers: () => ipcRenderer.invoke('room-fetch:load-members'),
    startFetch: (payload) => ipcRenderer.invoke('room-fetch:start', payload),
    stopFetch: () => ipcRenderer.invoke('room-fetch:stop'),
    openOutputDir: () => ipcRenderer.invoke('room-fetch:open-output-dir'),
    onProgress: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('room-fetch:progress', listener);
        return () => ipcRenderer.removeListener('room-fetch:progress', listener);
    }
});
