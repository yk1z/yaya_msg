const { ipcMain } = require('electron');
const mediaService = require('../services/media-service');

function registerMediaIpc() {
    ipcMain.on('start-record', (event, payload) => mediaService.startRecord(event, payload));
    ipcMain.on('stop-record', (event, payload) => mediaService.stopRecord(event, payload));
    ipcMain.on('cancel-download', (event, payload) => mediaService.cancelDownload(event, payload));
    ipcMain.on('clip-vod', (event, payload) => mediaService.clipVod(event, payload));
    ipcMain.on('download-vod', (event, payload) => mediaService.downloadVod(event, payload));
    ipcMain.on('download-danmu', (event, payload) => mediaService.downloadDanmu(event, payload));

    ipcMain.handle('start-live-proxy', (event, remoteUrl) => mediaService.startLiveProxy(remoteUrl));
    ipcMain.handle('stop-live-proxy', () => mediaService.stopLiveProxy());
    ipcMain.handle('start-radio-proxy', (event, remoteUrl) => mediaService.startRadioProxy(remoteUrl));
    ipcMain.handle('save-room-radio-recording', (event, payload) => mediaService.saveRoomRadioRecording(payload));
}

module.exports = {
    registerMediaIpc
};
