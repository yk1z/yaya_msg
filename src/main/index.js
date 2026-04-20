const { app } = require('electron');
const { createWindow } = require('./window');
const { ensureWasmLoaded } = require('./services/wasm-service');
const { registerWindowIpc } = require('./ipc/window-ipc');
const { registerMediaIpc } = require('./ipc/media-ipc');
const { registerPocketIpc } = require('./ipc/pocket-ipc');
const { registerSystemIpc } = require('./ipc/system-ipc');
const { ensureStoragePaths } = require('../common/storage-paths');

registerWindowIpc();
registerMediaIpc();
registerPocketIpc();
registerSystemIpc();

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
