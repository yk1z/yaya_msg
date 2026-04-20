const { ipcMain } = require('electron');
const { getMainWindow } = require('../window');

function registerWindowIpc() {
    ipcMain.on('window-min', () => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
            mainWindow.minimize();
        }
    });

    ipcMain.on('window-max', () => {
        const mainWindow = getMainWindow();
        if (!mainWindow) {
            return;
        }

        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
            return;
        }

        mainWindow.maximize();
    });

    ipcMain.on('window-close', () => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
            mainWindow.close();
        }
    });
}

module.exports = {
    registerWindowIpc
};
