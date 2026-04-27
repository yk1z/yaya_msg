const { ipcMain } = require('electron');
const {
    resolveBilibiliLive,
    getBilibiliLiveStatuses,
    createBilibiliLoginQrcode,
    pollBilibiliLoginQrcode,
    getBilibiliLoginStatus,
    logoutBilibili
} = require('../services/bilibili-service');

function registerBilibiliIpc() {
    ipcMain.handle('resolve-bilibili-live', async (event, roomId) => {
        try {
            return await resolveBilibiliLive(roomId);
        } catch (error) {
            return {
                success: false,
                msg: error?.message || 'B站直播解析失败'
            };
        }
    });
    ipcMain.handle('get-bilibili-live-statuses', async (event, roomIds) => getBilibiliLiveStatuses(roomIds));
    ipcMain.handle('bilibili-login-create-qrcode', () => createBilibiliLoginQrcode());
    ipcMain.handle('bilibili-login-poll', (event, payload) => pollBilibiliLoginQrcode(payload?.qrcodeKey));
    ipcMain.handle('bilibili-login-status', () => getBilibiliLoginStatus());
    ipcMain.handle('bilibili-logout', () => logoutBilibili());
}

module.exports = {
    registerBilibiliIpc
};
