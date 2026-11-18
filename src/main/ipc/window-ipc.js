const { ipcMain, BrowserWindow } = require('electron');
const { handleDesktop, onDesktop } = require('./desktop-sender');
const { getMainWindow, requestWindowClose } = require('../window');
const { openRoomWindow, openLiveWindow, openRoomWindowFromDrag, getRoomWindowContext } = require('../room-window');

function getSenderWindow(event) {
    return BrowserWindow.fromWebContents(event.sender);
}

function registerWindowIpc() {
    onDesktop(ipcMain, 'window-min', event => {
        const window = getSenderWindow(event);
        if (window) {
            window.minimize();
        }
    });

    onDesktop(ipcMain, 'window-max', event => {
        const window = getSenderWindow(event);
        if (!window) {
            return;
        }

        if (window.isMaximized()) {
            window.unmaximize();
            return;
        }

        window.maximize();
    });

    onDesktop(ipcMain, 'window-close', event => {
        const window = getSenderWindow(event);
        if (!window) return;
        if (window === getMainWindow()) requestWindowClose();
        else window.close();
    });

    handleDesktop(ipcMain, 'open-room-window', async (event, payload) => {
        try {
            return await openRoomWindow(payload);
        } catch (error) {
            return { success: false, msg: error.message || '打开独立窗口失败' };
        }
    });
    handleDesktop(ipcMain, 'open-live-window', async (event, payload) => {
        try { return await openLiveWindow(payload); }
        catch (error) { return { success: false, msg: error.message || '直播窗口打开失败' }; }
    });
    handleDesktop(ipcMain, 'get-room-window-context', event => {
        return getRoomWindowContext(event.sender);
    });
    handleDesktop(ipcMain, 'open-room-window-from-drag', async (event, payload) => {
        try {
            return await openRoomWindowFromDrag(event.sender, payload);
        } catch (error) {
            return { success: false, msg: error.message || '打开独立窗口失败' };
        }
    });
}

module.exports = {
    registerWindowIpc
};
