const { ipcMain } = require('electron');
const mediaService = require('../services/media-service');

function registerMediaIpc() {
    ipcMain.on('start-record', (event, payload) => mediaService.startRecord(event, payload));
    ipcMain.on('stop-record', (event, payload) => mediaService.stopRecord(event, payload));
    ipcMain.on('finalize-live-record-session', (event, payload) => mediaService.finalizeLiveRecordSession(event, payload));
    ipcMain.on('cancel-download', (event, payload) => mediaService.cancelDownload(event, payload));
    ipcMain.on('clip-vod', (event, payload) => mediaService.clipVod(event, payload));
    ipcMain.on('download-vod', (event, payload) => mediaService.downloadVod(event, payload));
    ipcMain.on('download-danmu', (event, payload) => mediaService.downloadDanmu(event, payload));

    ipcMain.handle('start-live-proxy', (event, remoteUrl) => mediaService.startLiveProxy(remoteUrl));
    ipcMain.handle('stop-live-proxy', () => mediaService.stopLiveProxy());
    ipcMain.handle('start-radio-proxy', (event, remoteUrl) => mediaService.startRadioProxy(remoteUrl));
    ipcMain.handle('prepare-compat-vod', (event, remoteUrl) => mediaService.prepareCompatVod(remoteUrl));
    ipcMain.handle('save-room-radio-recording', (event, payload) => mediaService.saveRoomRadioRecording(payload));
    ipcMain.handle('start-room-radio-recording', (event, payload) => mediaService.startRoomRadioRecording(payload));
    ipcMain.handle('append-room-radio-recording-chunk', (event, payload) => mediaService.appendRoomRadioRecordingChunk(payload));
    ipcMain.handle('finish-room-radio-recording', (event, payload) => mediaService.finishRoomRadioRecording(payload));
    ipcMain.handle('abort-room-radio-recording', (event, payload) => mediaService.abortRoomRadioRecording(payload));
}

module.exports = {
    registerMediaIpc
};
