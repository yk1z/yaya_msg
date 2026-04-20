const { ipcMain } = require('electron');
const systemService = require('../services/system-service');
const { getMainWindow } = require('../window');

function registerSystemIpc() {
    ipcMain.handle('save-export-html', (event, payload) => systemService.saveExportHtml(payload));
    ipcMain.handle('dialog-open-directory', () => systemService.openDirectoryDialog(getMainWindow()));
    ipcMain.handle('check-ip-info', () => systemService.checkIpInfo());
    ipcMain.handle('check-ip-domestic', () => systemService.checkIpDomestic());
    ipcMain.handle('check-ip-foreign', () => systemService.checkIpForeign());
    ipcMain.handle('check-ip-google', () => systemService.checkIpGoogle());
    ipcMain.handle('open-external-player', (event, payload) => systemService.openExternalPlayer(payload));
}

module.exports = {
    registerSystemIpc
};
