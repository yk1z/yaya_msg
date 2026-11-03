const { app, ipcMain, shell } = require('electron');
const systemService = require('../services/system-service');
const settingsService = require('../services/settings-service');
const { checkForUpdates, createUpdateDownloader } = require('../services/app-update-service');
const { createUpdateInstaller } = require('../services/app-update-installer');
const { getMainWindow } = require('../window');

function registerSystemIpc() {
    const installer = createUpdateInstaller({ app, shell });
    const updater = createUpdateDownloader({
        getLatest: () => checkForUpdates(app.getVersion()),
        directory: () => app.getPath('downloads'),
        onProgress: progress => {
            const window = getMainWindow();
            if (window && !window.isDestroyed()) window.webContents.send('app-update-download-progress', progress);
        }
    });
    ipcMain.on('settings-sync', (event, payload) => {
        try {
            event.returnValue = {
                success: true,
                data: settingsService.handleSyncRequest(payload)
            };
        } catch (error) {
            event.returnValue = {
                success: false,
                msg: error.message
            };
        }
    });
    ipcMain.handle('save-export-jsonl', (event, payload) => systemService.saveExportJsonl(payload));
    ipcMain.handle('dialog-open-directory', () => systemService.openDirectoryDialog(getMainWindow()));
    ipcMain.handle('get-default-download-path', () => app.getPath('downloads'));
    ipcMain.handle('check-app-updates', async () => ({ ...await checkForUpdates(app.getVersion()), installFailed: await installer.hadLastFailure() }));
    ipcMain.handle('download-app-update', () => updater.download());
    ipcMain.handle('open-app-update-installer', () => installer.install(updater.getDownloadedInfo()));
    ipcMain.handle('open-message-data-folder', () => systemService.openMessageDataFolder());
    ipcMain.handle('fetch-remote-image-data-url', (event, payload) => systemService.fetchRemoteImageDataUrl(payload));
    ipcMain.handle('cache-image-thumbnail', (event, payload) => systemService.createCachedImageThumbnail(payload));
    ipcMain.handle('show-system-notification', (event, payload) => systemService.showSystemNotification(payload, getMainWindow()));
    ipcMain.handle('check-ip-info', () => systemService.checkIpInfo());
    ipcMain.handle('check-ip-domestic', () => systemService.checkIpDomestic());
    ipcMain.handle('check-ip-foreign', () => systemService.checkIpForeign());
    ipcMain.handle('check-ip-google', () => systemService.checkIpGoogle());
    ipcMain.handle('open-external-player', (event, payload) => systemService.openExternalPlayer(payload));
}

module.exports = {
    registerSystemIpc
};
