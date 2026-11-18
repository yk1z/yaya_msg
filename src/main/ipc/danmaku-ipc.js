'use strict';
const { handleDesktop } = require('./desktop-sender');

const { ipcMain } = require('electron');
const danmakuService = require('../services/danmaku-service');
const { liveGiftAssetsService, readGiftPlayerWasm } = require('../services/live-gift-assets-service');

function registerDanmakuIpc() {
    handleDesktop(ipcMain, 'load-live-gift-animation', (_event, payload) => liveGiftAssetsService.load(payload));
    handleDesktop(ipcMain, 'read-live-gift-player-wasm', () => readGiftPlayerWasm());
    handleDesktop(ipcMain, 'connect-live-danmaku', (event, payload) => (
        danmakuService.connectLiveDanmaku(event.sender, payload)
    ));
    handleDesktop(ipcMain, 'disconnect-live-danmaku', (event, payload = {}) => ({
        success: true,
        disconnected: danmakuService.disconnectLiveDanmaku(event.sender.id, payload.connectionId)
    }));
    handleDesktop(ipcMain, 'send-live-danmaku', (event, payload) => (
        danmakuService.sendLiveDanmaku(event.sender.id, payload)
    ));
    handleDesktop(ipcMain, 'send-live-gift-event', (event, payload) => (
        danmakuService.sendLiveGiftEvent(event.sender.id, payload)
    ));
}

module.exports = {
    registerDanmakuIpc
};
