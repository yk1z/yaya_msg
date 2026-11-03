const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { reportIgnoredError } = require('../common/error-utils');
const settingsService = require('./services/settings-service');

let mainWindow = null;
let mainWindowReady = false;
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
    mainWindowReady = false;

    mainWindow = new BrowserWindow({
        show: false,
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

    const window = mainWindow;
    const onWorkspaceReady = event => {
        if (event.sender !== window.webContents || window.isDestroyed() || mainWindow !== window) return;
        mainWindowReady = true;
        showMainWindow();
    };
    ipcMain.on('desktop-workspace-ready', onWorkspaceReady);
    window.once('ready-to-show', () => {
        if (window.isDestroyed() || mainWindow !== window) return;
        showMainWindow();
    });
    window.webContents.on('dom-ready', () => {
        if (window.isDestroyed() || mainWindow !== window) return;
        // Page loading must still reveal the app if the renderer signal is lost.
        mainWindowReady = true;
        showMainWindow();
    });
    window.webContents.on('did-start-navigation', details => {
        if (!details.isMainFrame || details.isSameDocument || mainWindow !== window) return;
        mainWindowReady = false;
        if (window.isVisible()) window.hide();
    });
    window.webContents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
        if (!isMainFrame || mainWindow !== window || window.isDestroyed()) return;
        mainWindowReady = true;
        showMainWindow();
    });

    const desktopEntry = app.isPackaged
        ? path.join(__dirname, '../../desktop.html')
        : require('../common/desktop-document').buildDesktopShell();
    mainWindow.loadFile(desktopEntry);
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
        ipcMain.removeListener('desktop-workspace-ready', onWorkspaceReady);
        if (mainWindow === window) {
            mainWindow = null;
            mainWindowReady = false;
        }
    });
    return mainWindow;
}

function showMainWindow() {
    if (isAppQuitting) return;
    if (!mainWindow || mainWindow.isDestroyed()) return createWindow();
    if (!mainWindowReady) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
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
    showMainWindow,
    markAppQuitting,
    setDeepLinkHandler,
    requestWindowClose
};
