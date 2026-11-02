const { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } = require('electron');
const path = require('path');
const { createWindow, getMainWindow } = require('./window');
const settingsService = require('./services/settings-service');

let tray = null;
let trayMenuWindow = null;
let trayMenuShowTimer = null;
let trayMenuReleaseTimer = null;
let trayMenuReady = false;
const TRAY_MENU_WIDTH = 136;
const TRAY_MENU_HEIGHT = 82;

function showMainWindow() {
    let mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createWindow();
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
}

function createTrayIcon() {
    const iconPath = path.join(
        __dirname,
        process.platform === 'win32' ? '../../icon.ico' : '../../icon.png'
    );
    const sourceIcon = nativeImage.createFromPath(iconPath);
    if (sourceIcon.isEmpty()) {
        console.warn(`[tray] icon not found: ${iconPath}`);
        return null;
    }
    if (process.platform === 'win32') return sourceIcon;

    const resizedIcon = sourceIcon.resize({ width: 18, height: 18 });
    if (process.platform === 'darwin') resizedIcon.setTemplateImage(true);
    return resizedIcon;
}

function getTrayMenuTheme() {
    try {
        return settingsService.readSettings().theme === 'dark' ? 'dark' : 'light';
    } catch (error) {
        return 'light';
    }
}

function concealTrayMenu() {
    if (trayMenuShowTimer) {
        clearTimeout(trayMenuShowTimer);
        trayMenuShowTimer = null;
    }
    if (!trayMenuWindow || trayMenuWindow.isDestroyed()) return;
    trayMenuWindow.setOpacity(0);
    trayMenuWindow.setIgnoreMouseEvents(true);
    if (trayMenuReleaseTimer) clearTimeout(trayMenuReleaseTimer);
    const menuWindow = trayMenuWindow;
    trayMenuReleaseTimer = setTimeout(() => {
        trayMenuReleaseTimer = null;
        if (trayMenuWindow === menuWindow && !menuWindow.isDestroyed()) menuWindow.destroy();
    }, 30_000);
    trayMenuReleaseTimer.unref?.();
}

function primeTrayMenuWindow(menuWindow) {
    if (!menuWindow || menuWindow.isDestroyed()) return;
    menuWindow.setOpacity(0);
    menuWindow.setIgnoreMouseEvents(true);
    if (!menuWindow.isVisible()) menuWindow.showInactive();
}

function createNativeTrayMenu() {
    return Menu.buildFromTemplate([
        {
            label: '显示主窗口',
            click: showMainWindow
        },
        { type: 'separator' },
        {
            label: '退出软件',
            click: () => app.quit()
        }
    ]);
}

function createTrayMenuWindow() {
    if (trayMenuWindow && !trayMenuWindow.isDestroyed()) return trayMenuWindow;

    trayMenuWindow = new BrowserWindow({
        width: TRAY_MENU_WIDTH,
        height: TRAY_MENU_HEIGHT,
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'tray-menu-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    trayMenuReady = false;
    trayMenuWindow.loadFile(path.join(__dirname, 'tray-menu.html'));
    trayMenuWindow.webContents.once('did-finish-load', () => {
        trayMenuReady = true;
        primeTrayMenuWindow(trayMenuWindow);
    });
    trayMenuWindow.on('blur', () => {
        concealTrayMenu();
    });
    trayMenuWindow.on('closed', () => {
        trayMenuWindow = null;
        trayMenuReady = false;
    });
    return trayMenuWindow;
}

function getTrayMenuPosition(bounds) {
    const display = screen.getDisplayNearestPoint({
        x: Math.round(bounds.x + bounds.width / 2),
        y: Math.round(bounds.y + bounds.height / 2)
    });
    const workArea = display.workArea;
    const desiredX = Math.round(bounds.x + bounds.width - 8);
    const aboveY = Math.round(bounds.y - TRAY_MENU_HEIGHT + 2);
    const belowY = Math.round(bounds.y + bounds.height + 6);
    const x = Math.min(
        Math.max(desiredX, workArea.x),
        workArea.x + workArea.width - TRAY_MENU_WIDTH
    );
    const y = aboveY >= workArea.y
        ? aboveY
        : Math.min(belowY, workArea.y + workArea.height - TRAY_MENU_HEIGHT);
    return { x, y };
}

function showTrayMenu(bounds) {
    if (trayMenuReleaseTimer) clearTimeout(trayMenuReleaseTimer);
    trayMenuReleaseTimer = null;
    const menuWindow = createTrayMenuWindow();
    const position = getTrayMenuPosition(bounds);
    menuWindow.setPosition(position.x, position.y, false);

    const reveal = () => {
        if (!trayMenuWindow || trayMenuWindow.isDestroyed()) return;
        trayMenuWindow.webContents.send('tray-menu-theme', getTrayMenuTheme());
        if (trayMenuShowTimer) clearTimeout(trayMenuShowTimer);
        trayMenuShowTimer = setTimeout(() => {
            trayMenuShowTimer = null;
            if (!trayMenuWindow || trayMenuWindow.isDestroyed()) return;
            if (!trayMenuWindow.isVisible()) primeTrayMenuWindow(trayMenuWindow);
            trayMenuWindow.setIgnoreMouseEvents(false);
            trayMenuWindow.setOpacity(1);
            trayMenuWindow.focus();
        }, 45);
    };

    if (!trayMenuReady || menuWindow.webContents.isLoading()) {
        menuWindow.webContents.once('did-finish-load', reveal);
    } else {
        reveal();
    }
}

ipcMain.on('tray-menu-action', (event, action) => {
    if (!trayMenuWindow || trayMenuWindow.isDestroyed() || event.sender !== trayMenuWindow.webContents) return;
    concealTrayMenu();
    if (action === 'show') {
        showMainWindow();
        return;
    }
    if (action === 'quit') app.quit();
});

function createTray() {
    if (tray && !tray.isDestroyed()) return tray;
    const icon = createTrayIcon();
    if (!icon) return null;

    tray = new Tray(icon);
    tray.setToolTip('牙牙消息');
    tray.on('click', showMainWindow);
    if (process.platform === 'linux') {
        tray.setContextMenu(createNativeTrayMenu());
    } else {
        tray.on('right-click', (_event, bounds) => showTrayMenu(bounds));
    }
    return tray;
}

function destroyTray() {
    if (trayMenuReleaseTimer) clearTimeout(trayMenuReleaseTimer);
    trayMenuReleaseTimer = null;
    if (trayMenuShowTimer) {
        clearTimeout(trayMenuShowTimer);
        trayMenuShowTimer = null;
    }
    if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
        trayMenuWindow.destroy();
        trayMenuWindow = null;
    }
    if (!tray || tray.isDestroyed()) return;
    tray.destroy();
    tray = null;
}

module.exports = {
    createTray,
    destroyTray
};
