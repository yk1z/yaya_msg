'use strict';

const { ipcMain } = require('electron');
const danmakuService = require('../services/danmaku-service');
const { liveGiftAssetsService, readGiftPlayerWasm } = require('../services/live-gift-assets-service');

function registerDanmakuIpc() {
    ipcMain.handle('load-live-gift-animation', (_event, payload) => liveGiftAssetsService.load(payload));
    ipcMain.handle('read-live-gift-player-wasm', () => readGiftPlayerWasm());
    ipcMain.handle('connect-live-danmaku', (event, payload) => (
        danmakuService.connectLiveDanmaku(event.sender, payload)
    ));
    ipcMain.handle('disconnect-live-danmaku', (event, payload = {}) => ({
        success: true,
        disconnected: danmakuService.disconnectLiveDanmaku(event.sender.id, payload.connectionId)
    }));
    ipcMain.handle('send-live-danmaku', (event, payload) => (
        danmakuService.sendLiveDanmaku(event.sender.id, payload)
    ));
    ipcMain.handle('send-live-gift-event', (event, payload) => (
        danmakuService.sendLiveGiftEvent(event.sender.id, payload)
    ));
}

module.exports = {
    registerDanmakuIpc
};
