const { BrowserWindow, shell } = require('electron');
const path = require('path');

let mainWindow = null;
const preloadPath = path.join(__dirname, 'preload.js');
const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function isSafeExternalUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        return SAFE_EXTERNAL_PROTOCOLS.has(url.protocol);
    } catch (error) {
        return false;
    }
}

function createWindow() {
    const isMac = process.platform === 'darwin';

    mainWindow = new BrowserWindow({
        width: 1100,
        height: 790,
        minWidth: 1100,
        minHeight: 790,
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
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('file://')) {
            event.preventDefault();
        }
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) {
            shell.openExternal(url);
        }
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
