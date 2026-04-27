const { app } = require('electron');
const { createWindow } = require('./window');
const { ensureWasmLoaded } = require('./services/wasm-service');
const { cleanupMediaTasks } = require('./services/media-service');
const { registerWindowIpc } = require('./ipc/window-ipc');
const { registerMediaIpc } = require('./ipc/media-ipc');
const { registerBilibiliIpc } = require('./ipc/bilibili-ipc');
const { registerPocketIpc } = require('./ipc/pocket-ipc');
const { registerSystemIpc } = require('./ipc/system-ipc');
const { ensureStoragePaths } = require('../common/storage-paths');

registerWindowIpc();
registerMediaIpc();
registerBilibiliIpc();
registerPocketIpc();
registerSystemIpc();

if (process.platform === 'linux') {
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-setuid-sandbox');
}

app.whenReady().then(() => {
    ensureStoragePaths();
    createWindow();
    ensureWasmLoaded();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    cleanupMediaTasks();
});
