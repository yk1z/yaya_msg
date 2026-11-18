const { ipcMain } = require('electron');
const { handleDesktop } = require('./desktop-sender');
const {
    resolveBilibiliLive,
    getBilibiliLiveStatuses,
    createBilibiliLoginQrcode,
    pollBilibiliLoginQrcode,
    getBilibiliLoginStatus,
    logoutBilibili
} = require('../services/bilibili-service');

function registerBilibiliIpc() {
    handleDesktop(ipcMain, 'resolve-bilibili-live', async (event, roomId) => {
        try {
            return await resolveBilibiliLive(roomId);
        } catch (error) {
            return {
                success: false,
                msg: error?.message || 'B站直播解析失败'
            };
        }
    });
    handleDesktop(ipcMain, 'get-bilibili-live-statuses', async (event, roomIds) => getBilibiliLiveStatuses(roomIds));
    handleDesktop(ipcMain, 'bilibili-login-create-qrcode', () => createBilibiliLoginQrcode());
    handleDesktop(ipcMain, 'bilibili-login-poll', (event, payload) => pollBilibiliLoginQrcode(payload?.qrcodeKey));
    handleDesktop(ipcMain, 'bilibili-login-status', () => getBilibiliLoginStatus());
    handleDesktop(ipcMain, 'bilibili-logout', () => logoutBilibili());
}

module.exports = {
    registerBilibiliIpc
};
