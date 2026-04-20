const { BrowserWindow, shell } = require('electron');
const path = require('path');

let mainWindow = null;
const preloadPath = path.join(__dirname, 'preload.js');

function createWindow() {
    const isMac = process.platform === 'darwin';

    mainWindow = new BrowserWindow({
        width: 1024,
        height: 800,
        minWidth: 1024,
        minHeight: 800,
        frame: isMac,
        titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
        trafficLightPosition: isMac ? { x: 14, y: 10 } : undefined,
        icon: path.join(__dirname, '../../icon.png'),
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: false,
            sandbox: false,
            webSecurity: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../../index.html'));
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
    return mainWindow;
}

function getMainWindow() {
    return mainWindow;
}

module.exports = {
    createWindow,
    getMainWindow
};
