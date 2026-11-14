const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');
const { parseDeepLink } = require('../common/deep-link');
const { getMainWindow, showMainWindow } = require('./window');
const settingsService = require('./services/settings-service');

const desktopEntry = path.resolve(__dirname, '../../desktop.html');
const roomWindows = new Map();
const roomContexts = new Map();
const safeExternalProtocols = new Set(['http:', 'https:', 'mailto:']);
let observingLifecycle = false;

function isDesktopDocument(rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== 'file:') return false;
        const target = path.resolve(fileURLToPath(url));
        return process.platform === 'win32'
            ? target.toLowerCase() === desktopEntry.toLowerCase()
            : target === desktopEntry;
    } catch (_) {
        return false;
    }
}

function isTrustedDesktopSender(sender) {
    if (!sender || sender.isDestroyed() || !isDesktopDocument(sender.getURL())) return false;
    const window = BrowserWindow.fromWebContents(sender);
    return !!window && !window.isDestroyed()
        && (window === getMainWindow() || roomContexts.has(sender.id));
}

function normalizeRoomContext(payload = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('房间信息不完整，请重新打开房间后重试');
    }
    const id = value => /^[1-9]\d{0,31}$/.test(String(value || '')) ? String(value) : '';
    const context = {
        ownerName: String(payload.ownerName || '成员房间').trim().slice(0, 100) || '成员房间',
        channelId: id(payload.channelId),
        serverId: id(payload.serverId),
        mainChannelId: id(payload.mainChannelId || payload.channelId),
        smallChannelId: id(payload.smallChannelId),
        roomType: payload.roomType === 'small' ? 'small' : 'big',
        memberId: id(payload.memberId),
        avatarUrl: /^https?:\/\//i.test(String(payload.avatarUrl || ''))
            ? String(payload.avatarUrl).slice(0, 2048) : '',
        allMessages: payload.allMessages === true
    };
    if (!context.channelId || !context.serverId || !context.mainChannelId) {
        throw new Error('房间信息不完整，请重新打开房间后重试');
    }
    return context;
}

function closeAllRoomWindows() {
    for (const window of [...roomWindows.values()]) {
        if (!window.isDestroyed()) window.destroy();
    }
    roomWindows.clear();
    roomContexts.clear();
}

function observeLifecycle() {
    if (observingLifecycle) return;
    observingLifecycle = true;
    settingsService.onAuthChange(closeAllRoomWindows);
    app.on('before-quit', closeAllRoomWindows);
}

function openLink(rawUrl) {
    const route = parseDeepLink(rawUrl);
    if (route) {
        const mainWindow = showMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            const send = () => {
                if (!mainWindow.isDestroyed()) mainWindow.webContents.send('deep-link-open', route);
            };
            if (mainWindow.webContents.isLoadingMainFrame()) mainWindow.webContents.once('did-finish-load', send);
            else send();
        }
        return;
    }
    try {
        if (safeExternalProtocols.has(new URL(rawUrl).protocol)) {
            void shell.openExternal(rawUrl).catch(() => {});
        }
    } catch (_) {                                              }
}

async function openRoomWindow(payload, options = {}) {
    const context = normalizeRoomContext(payload);
    return openDetachedWindow(context, `${context.serverId}:${context.mainChannelId}`, options);
}

async function openLiveWindow(payload = {}) {
    const liveId = String(payload.liveId || '');
    const mode = String(payload.mode || 'live');
    if (!/^[1-9]\d{0,31}$/.test(liveId) || !['live', 'vod', 'meet-live', 'meet-vod'].includes(mode)) {
        throw new Error('直播信息不完整，请打开直播后重试');
    }
    const context = { kind: 'live', liveId, mode,
        ownerName: String(payload.ownerName || '').trim().slice(0, 100),
        title: String(payload.title || '直播').slice(0, 300) };
    return openDetachedWindow(context, `live:${mode}:${liveId}`);
}

async function openDetachedWindow(context, key, { position } = {}) {
    const isLive = context.kind === 'live';
    const existing = roomWindows.get(key);
    if (existing && !existing.isDestroyed()) {
        if (existing.isMinimized()) existing.restore();
        existing.show();
        existing.focus();
        return { success: true, reused: true };
    }
    observeLifecycle();
    const isMac = process.platform === 'darwin';
    let backgroundColor = '#f7f8fa';
    try {
        if (settingsService.readSettings().theme === 'dark') backgroundColor = '#141a22';
    } catch (_) {                                                         }
    const placement = {};
    if (position) {
        const area = screen.getDisplayNearestPoint(position).workArea;
        const width = Math.min(900, area.width);
        const height = Math.min(760, area.height);
        Object.assign(placement, {
            width,
            height,
            minWidth: Math.min(isLive ? 320 : 640, width),
            minHeight: Math.min(520, height),
            x: Math.max(area.x, Math.min(position.x - 200, area.x + area.width - width)),
            y: Math.max(area.y, Math.min(position.y - 16, area.y + area.height - height))
        });
    }
    const window = new BrowserWindow({
        show: false,
        backgroundColor,
        title: context.ownerName ? `${context.ownerName} - 牙牙消息` : '牙牙消息',
        width: isLive ? 400 : 900,
        height: isLive ? 800 : 760,
        minWidth: isLive ? 320 : 640,
        minHeight: 520,
        ...placement,
        frame: isMac,
        titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
        trafficLightPosition: isMac ? { x: 14, y: 10 } : undefined,
        icon: path.join(__dirname, '../../icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            additionalArguments: ['--yaya-room-window', ...(isLive ? ['--yaya-live-window'] : [])],
            nodeIntegration: false,
            contextIsolation: false,
            sandbox: false,
            webSecurity: false,
            backgroundThrottling: false
        }
    });
    const senderId = window.webContents.id;
    roomWindows.set(key, window);
    roomContexts.set(senderId, context);
    window.setMenuBarVisibility(false);
    let revealed = false;
    const reveal = () => {
        if (revealed || window.isDestroyed()) return;
        revealed = true;
        window.show();
        window.focus();
    };
    const onWorkspaceReady = event => {
        if (event.sender === window.webContents) reveal();
    };
    ipcMain.on('desktop-workspace-ready', onWorkspaceReady);
    window.once('ready-to-show', reveal);
    window.webContents.once('dom-ready', reveal);
    window.once('closed', () => {
        ipcMain.removeListener('desktop-workspace-ready', onWorkspaceReady);
        if (roomWindows.get(key) === window) roomWindows.delete(key);
        roomContexts.delete(senderId);
    });
    window.webContents.on('will-navigate', (event, url) => {
        if (isDesktopDocument(url)) return;
        event.preventDefault();
        openLink(url);
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
        openLink(url);
        return { action: 'deny' };
    });
    window.webContents.on('render-process-gone', () => {
        if (!window.isDestroyed()) window.destroy();
    });
    try {
        const loading = window.loadFile(desktopEntry);
        reveal();
        await loading;
        return { success: true, reused: false };
    } catch (_) {
        if (!window.isDestroyed()) window.destroy();
        return { success: false, msg: '独立窗口加载失败，请重试' };
    }
}

async function openRoomWindowFromDrag(sender, payload) {
    if (!isTrustedDesktopSender(sender)) return { success: false, msg: '当前页面不能打开独立窗口' };
    if (payload?.dragOutsideHalf !== true) return { success: true, opened: false };
    const position = screen.getCursorScreenPoint();
    const result = await openRoomWindow(payload, { position });
    return { ...result, opened: result.success === true };
}

function getRoomWindowContext(sender) {
    if (!isTrustedDesktopSender(sender)) return null;
    const context = roomContexts.get(sender.id);
    return context ? { ...context } : null;
}

module.exports = {
    openRoomWindow,
    openLiveWindow,
    openRoomWindowFromDrag,
    getRoomWindowContext,
    closeAllRoomWindows,
    isTrustedDesktopSender
};
