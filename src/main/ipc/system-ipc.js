const { app, ipcMain, shell } = require('electron');
const { handleDesktop, onDesktopSync } = require('./desktop-sender');
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
    onDesktopSync(ipcMain, 'settings-sync', (event, payload) => {
        if (['list-pocket-accounts', 'remember-pocket-account', 'get-pocket-account', 'activate-pocket-account', 'forget-pocket-account'].includes(payload?.action)
            && event.sender !== getMainWindow()?.webContents) {
            throw new Error('请从主窗口的账号页操作');
        }
        return settingsService.handleSyncRequest(payload);
    });
    handleDesktop(ipcMain, 'save-export-jsonl', (_event, payload) => systemService.saveExportJsonl(payload));
    handleDesktop(ipcMain, 'save-media-download', (_event, payload) => systemService.saveMediaDownload(payload));
    handleDesktop(ipcMain, 'begin-media-download', (event, payload) => systemService.beginMediaDownload(event.sender, payload));
    handleDesktop(ipcMain, 'append-media-download', (event, payload) => systemService.appendMediaDownload(event.sender, payload));
    handleDesktop(ipcMain, 'finish-media-download', (event, payload) => systemService.finishMediaDownload(event.sender, payload));
    handleDesktop(ipcMain, 'abort-media-download', (event, payload) => systemService.abortMediaDownload(event.sender, payload));
    handleDesktop(ipcMain, 'dialog-open-directory', () => systemService.openDirectoryDialog(getMainWindow()));
    handleDesktop(ipcMain, 'get-default-download-path', () => app.getPath('downloads'));
    handleDesktop(ipcMain, 'check-app-updates', async () => ({ ...await checkForUpdates(app.getVersion()), installFailed: await installer.hadLastFailure() }));
    handleDesktop(ipcMain, 'download-app-update', () => updater.download());
    handleDesktop(ipcMain, 'open-app-update-installer', () => installer.install(updater.getDownloadedInfo()));
    handleDesktop(ipcMain, 'open-message-data-folder', () => systemService.openMessageDataFolder());
    handleDesktop(ipcMain, 'fetch-remote-image-data-url', (event, payload) => systemService.fetchRemoteImageDataUrl(payload));
    handleDesktop(ipcMain, 'cache-image-thumbnail', (event, payload) => systemService.createCachedImageThumbnail(payload));
    handleDesktop(ipcMain, 'show-system-notification', (event, payload) => systemService.showSystemNotification(payload, getMainWindow()));
    handleDesktop(ipcMain, 'check-ip-info', () => systemService.checkIpInfo());
    handleDesktop(ipcMain, 'check-ip-domestic', () => systemService.checkIpDomestic());
    handleDesktop(ipcMain, 'check-ip-foreign', () => systemService.checkIpForeign());
    handleDesktop(ipcMain, 'check-ip-google', () => systemService.checkIpGoogle());
    handleDesktop(ipcMain, 'open-external-player', (event, payload) => systemService.openExternalPlayer(payload));
}

module.exports = {
    registerSystemIpc
};
