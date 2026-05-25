const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('liveDanmuGui', {
    loadMembers: () => ipcRenderer.invoke('live-danmu:load-members'),
    startFetch: (payload) => ipcRenderer.invoke('live-danmu:start', payload),
    stopFetch: () => ipcRenderer.invoke('live-danmu:stop'),
    openOutputDir: () => ipcRenderer.invoke('live-danmu:open-output-dir'),
    selectOutputDir: () => ipcRenderer.invoke('live-danmu:select-output-dir'),
    onProgress: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('live-danmu:progress', listener);
        return () => ipcRenderer.removeListener('live-danmu:progress', listener);
    }
});
