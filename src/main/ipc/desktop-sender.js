const { isDesktopDocument, isMainFrameSender } = require('../desktop-document');
const { isTrustedDesktopSender } = require('../room-window');

function isDesktopSender(event) {
    return isTrustedDesktopSender(event.sender) && isMainFrameSender(event)
        && isDesktopDocument(event.senderFrame.url);
}

function requireDesktopSender(event) {
    if (!isDesktopSender(event)) throw new Error('当前页面不能使用桌面功能');
}

function handleDesktop(ipcMain, channel, listener) {
    ipcMain.handle(channel, (event, ...args) => {
        requireDesktopSender(event);
        return listener(event, ...args);
    });
}

function onDesktop(ipcMain, channel, listener) {
    ipcMain.on(channel, (event, ...args) => {
        if (isDesktopSender(event)) listener(event, ...args);
    });
}

function onDesktopSync(ipcMain, channel, listener) {
    ipcMain.on(channel, (event, ...args) => {
        try {
            requireDesktopSender(event);
            event.returnValue = { success: true, data: listener(event, ...args) };
        } catch (error) {
            event.returnValue = { success: false, msg: error.message };
        }
    });
}

module.exports = { handleDesktop, onDesktop, onDesktopSync };
