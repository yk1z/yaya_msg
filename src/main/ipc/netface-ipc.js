'use strict';
const { ipcMain } = require('electron');
const { netfaceService } = require('../services/netface-service');
const { writeNetfaceLog } = require('../services/netface-log');

function registerNetfaceIpc() {
    ipcMain.handle('write-netface-log', (_event, payload) => ({ success: writeNetfaceLog({ ...payload, source: 'renderer' }) }));
    ipcMain.handle('connect-netface-signals', async (event, payload) => {
        try { return await netfaceService.connect(event.sender, payload); }
        catch (error) {
            writeNetfaceLog({ ...payload, event: 'connection-failed', source: 'main', code: error.code, errorName: error.name, error });
            return { success: false, msg: error.message || '云握手实时连接失败' };
        }
    });
    ipcMain.handle('disconnect-netface-signals', (event, payload = {}) => ({
        success: true, disconnected: netfaceService.disconnect(event.sender.id, payload.connectionId)
    }));
    ipcMain.handle('switch-netface-room', async (event, payload) => {
        try { return await netfaceService.switchRoom(event.sender, payload); }
        catch (error) {
            writeNetfaceLog({ ...payload, event: 'room-switch-failed', source: 'main', error });
            return { success: false, msg: error.message || '连接成员聊天室失败' };
        }
    });
}
module.exports = { registerNetfaceIpc };
