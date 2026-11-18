const { ipcMain } = require('electron');
const { handleDesktop, onDesktop } = require('./desktop-sender');
const mediaService = require('../services/media-service');

function registerMediaIpc() {
    const observedProxyOwners = new WeakSet();
    const proxyOwner = event => {
        const sender = event.sender;
        if (!observedProxyOwners.has(sender)) {
            observedProxyOwners.add(sender);
            sender.once('destroyed', () => mediaService.stopLiveProxy(sender.id));
        }
        return sender.id;
    };
    onDesktop(ipcMain, 'start-record', (event, payload) => mediaService.startRecord(event, payload));
    onDesktop(ipcMain, 'stop-record', (event, payload) => mediaService.stopRecord(event, payload));
    onDesktop(ipcMain, 'finalize-live-record-session', (event, payload) => mediaService.finalizeLiveRecordSession(event, payload));
    onDesktop(ipcMain, 'cancel-download', (event, payload) => mediaService.cancelDownload(event, payload));
    onDesktop(ipcMain, 'clip-vod', (event, payload) => mediaService.clipVod(event, payload));
    onDesktop(ipcMain, 'download-vod', (event, payload) => mediaService.downloadVod(event, payload));
    onDesktop(ipcMain, 'download-danmu', (event, payload) => mediaService.downloadDanmu(event, payload));

    handleDesktop(ipcMain, 'start-live-proxy', (event, remoteUrl) => mediaService.startLiveProxy(remoteUrl, proxyOwner(event)));
    handleDesktop(ipcMain, 'stop-live-proxy', event => mediaService.stopLiveProxy(event.sender.id));
    handleDesktop(ipcMain, 'start-radio-proxy', (event, remoteUrl) => mediaService.startRadioProxy(remoteUrl, proxyOwner(event)));
    handleDesktop(ipcMain, 'prepare-compat-vod', (event, remoteUrl) => mediaService.prepareCompatVod(remoteUrl));
    handleDesktop(ipcMain, 'save-room-radio-recording', (event, payload) => mediaService.saveRoomRadioRecording(payload));
    handleDesktop(ipcMain, 'start-room-radio-recording', (event, payload) => mediaService.startRoomRadioRecording(payload));
    handleDesktop(ipcMain, 'append-room-radio-recording-chunk', (event, payload) => mediaService.appendRoomRadioRecordingChunk(payload));
    handleDesktop(ipcMain, 'finish-room-radio-recording', (event, payload) => mediaService.finishRoomRadioRecording(payload));
    handleDesktop(ipcMain, 'abort-room-radio-recording', (event, payload) => mediaService.abortRoomRadioRecording(payload));
}

module.exports = {
    registerMediaIpc
};
