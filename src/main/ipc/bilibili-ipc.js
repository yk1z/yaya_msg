const { ipcMain } = require('electron');
const { resolveBilibiliLive, getBilibiliLiveStatuses } = require('../services/bilibili-service');

function registerBilibiliIpc() {
    ipcMain.handle('resolve-bilibili-live', async (event, roomId) => resolveBilibiliLive(roomId));
    ipcMain.handle('get-bilibili-live-statuses', async (event, roomIds) => getBilibiliLiveStatuses(roomIds));
}

module.exports = {
    registerBilibiliIpc
};
