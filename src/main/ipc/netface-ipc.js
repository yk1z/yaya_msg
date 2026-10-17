'use strict';
const { ipcMain } = require('electron');
const { netfaceService } = require('../services/netface-service');

function registerNetfaceIpc() {
    ipcMain.handle('connect-netface-signals', async (event, payload) => {
        try { return await netfaceService.connect(event.sender, payload); }
        catch (error) { return { success: false, msg: error.message || '云握手实时连接失败' }; }
    });
    ipcMain.handle('disconnect-netface-signals', (event, payload = {}) => ({
        success: true, disconnected: netfaceService.disconnect(event.sender.id, payload.connectionId)
    }));
}
module.exports = { registerNetfaceIpc };
