const { ipcMain, BrowserWindow } = require('electron');
const { getMainWindow, requestWindowClose } = require('../window');
const { openRoomWindow, openLiveWindow, openRoomWindowFromDrag, getRoomWindowContext, isTrustedDesktopSender } = require('../room-window');

function getSenderWindow(event) {
    if (!isTrustedDesktopSender(event.sender)) return null;
    if (event.senderFrame && event.senderFrame !== event.sender.mainFrame) return null;
    return BrowserWindow.fromWebContents(event.sender);
}

function registerWindowIpc() {
    ipcMain.on('window-min', event => {
        const window = getSenderWindow(event);
        if (window) {
            window.minimize();
        }
    });

    ipcMain.on('window-max', event => {
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

    ipcMain.on('window-close', event => {
        const window = getSenderWindow(event);
        if (!window) return;
        if (window === getMainWindow()) requestWindowClose();
        else window.close();
    });

    ipcMain.handle('open-room-window', async (event, payload) => {
        if (!getSenderWindow(event)) return { success: false, msg: '当前页面不能打开独立窗口' };
        try {
            return await openRoomWindow(payload);
        } catch (error) {
            return { success: false, msg: error.message || '打开独立窗口失败' };
        }
    });
    ipcMain.handle('open-live-window', async (event, payload) => {
        if (!getSenderWindow(event)) return { success: false, msg: '当前页面不能打开独立窗口' };
        try { return await openLiveWindow(payload); }
        catch (error) { return { success: false, msg: error.message || '直播窗口打开失败' }; }
    });
    ipcMain.handle('get-room-window-context', event => {
        if (!getSenderWindow(event)) return null;
        return getRoomWindowContext(event.sender);
    });
    ipcMain.handle('open-room-window-from-drag', async (event, payload) => {
        if (!getSenderWindow(event)) return { success: false, msg: '当前页面不能打开独立窗口' };
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
