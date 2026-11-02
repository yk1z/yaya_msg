const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { reportIgnoredError } = require('../common/error-utils');
const settingsService = require('./services/settings-service');

let mainWindow = null;
let isAppQuitting = false;
let deepLinkHandler = null;
function setDeepLinkHandler(handler) { deepLinkHandler = handler; }
const preloadPath = path.join(__dirname, 'preload.js');
const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const PAGE_ZOOM_FACTOR = 1;

function getWindowCloseBehavior() {
    try {
        return settingsService.readSettings().windowCloseBehavior === 'quit'
            ? 'quit'
            : 'minimize-to-tray';
    } catch (error) {
        return 'minimize-to-tray';
    }
}

function resetPageZoom(webContents) {
    if (!webContents || webContents.isDestroyed()) return;

    try {
        webContents.setZoomLevel(0);
        webContents.setZoomFactor(PAGE_ZOOM_FACTOR);
    } catch (error) { reportIgnoredError(error, 'src/main/window.js'); }
}

function isPageZoomShortcut(input) {
    if (!input || (!input.control && !input.meta)) return false;

    const key = String(input.key || '').toLowerCase();
    return key === '+' || key === '=' || key === '-' || key === '_' || key === '0';
}

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
            webSecurity: false,
            backgroundThrottling: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../../index.html'));
    resetPageZoom(mainWindow.webContents);
    mainWindow.webContents.on('did-finish-load', () => {
        resetPageZoom(mainWindow.webContents);
    });
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (!isPageZoomShortcut(input)) return;

        event.preventDefault();
        resetPageZoom(mainWindow.webContents);
    });
    mainWindow.webContents.on('zoom-changed', (event) => {
        event.preventDefault();
        resetPageZoom(mainWindow.webContents);
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (deepLinkHandler && deepLinkHandler(url)) { event.preventDefault(); return; }
        if (!url.startsWith('file://')) {
            event.preventDefault();
        }
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (deepLinkHandler && deepLinkHandler(url)) return { action: 'deny' };
        if (isSafeExternalUrl(url)) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });
    mainWindow.on('close', (event) => {
        const supportsMinimizeToTray = process.platform === 'win32' || process.platform === 'linux';
        if (isAppQuitting || !supportsMinimizeToTray || mainWindow.webContents.isDestroyed()) return;
        event.preventDefault();
        if (getWindowCloseBehavior() === 'quit') {
            app.quit();
            return;
        }
        mainWindow.hide();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    return mainWindow;
}

function getMainWindow() {
    return mainWindow;
}

function markAppQuitting() {
    isAppQuitting = true;
}

function requestWindowClose() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.close();
}

module.exports = {
    createWindow,
    getMainWindow,
    markAppQuitting,
    setDeepLinkHandler,
    requestWindowClose
};
