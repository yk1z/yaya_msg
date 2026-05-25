const { ipcMain } = require('electron');
const systemService = require('../services/system-service');
const settingsService = require('../services/settings-service');
const { getMainWindow } = require('../window');

function registerSystemIpc() {
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
    ipcMain.handle('save-export-html', (event, payload) => systemService.saveExportHtml(payload));
    ipcMain.handle('dialog-open-directory', () => systemService.openDirectoryDialog(getMainWindow()));
    ipcMain.handle('open-message-data-folder', () => systemService.openMessageDataFolder());
    ipcMain.handle('fetch-remote-image-data-url', (event, payload) => systemService.fetchRemoteImageDataUrl(payload));
    ipcMain.handle('cache-image-thumbnail', (event, payload) => systemService.createCachedImageThumbnail(payload));
    ipcMain.handle('check-ip-info', () => systemService.checkIpInfo());
    ipcMain.handle('check-ip-domestic', () => systemService.checkIpDomestic());
    ipcMain.handle('check-ip-foreign', () => systemService.checkIpForeign());
    ipcMain.handle('check-ip-google', () => systemService.checkIpGoogle());
    ipcMain.handle('open-external-player', (event, payload) => systemService.openExternalPlayer(payload));
}

module.exports = {
    registerSystemIpc
};
