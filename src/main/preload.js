const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { fileURLToPath, pathToFileURL } = require('url');
const { contextBridge, ipcRenderer, shell, webFrame } = require('electron');
const { ensureStoragePaths } = require('../common/storage-paths');
const { reportIgnoredError } = require('../common/error-utils');
const { POCKET_CHANNEL_METHODS } = require('../common/pocket-channel-config');
const { createNetfaceLogSanitizer } = require('../common/netface-log-data');
const { invokeChannels, sendChannels, eventChannels } = require('./desktop-ipc-channels');

const appDir = path.join(__dirname, '../../');
const platform = process.platform;
const CUSTOM_BACKGROUND_PREFIX = 'custom_background';

function isDesktopPage() {
    if (!process.isMainFrame || location.protocol !== 'file:') return false;
    try {
        const current = path.resolve(fileURLToPath(location.href));
        const entry = path.join(appDir, 'desktop.html');
        return platform === 'win32' ? current.toLowerCase() === entry.toLowerCase() : current === entry;
    } catch (error) {
        return false;
    }
}

if (!isDesktopPage()) return;
const storagePaths = ensureStoragePaths();

function readJsonFileSafe(filePath, fallbackValue) {
    try {
        if (!fs.existsSync(filePath)) {
            return fallbackValue;
        }

        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return fallbackValue;
    }
}

function writeJsonFileSafe(filePath, value) {
    const targetDir = path.dirname(filePath);
    const tempFilePath = `${filePath}.tmp`;

    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(tempFilePath, JSON.stringify(value, null, 2), 'utf8');
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    fs.renameSync(tempFilePath, filePath);
}

function invokeSettingsSync(action, payload = {}) {
    const result = ipcRenderer.sendSync('settings-sync', { action, payload });
    if (!result || !result.success) {
        throw new Error(result?.msg || '设置读写失败');
    }

    return result.data;
}

function readSettingsSync() {
    return invokeSettingsSync('read');
}

function sanitizeBackgroundExt(extName) {
    const lowered = String(extName || '').toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(lowered) ? lowered : '.png';
}

function getBackgroundFilePath(fileName) {
    if (!/^custom_background\.[a-z0-9]{1,8}$/i.test(fileName || '')) return '';
    return path.join(storagePaths.internalDataDir, fileName);
}

function getBackgroundFileUrl(filePath, version = '') {
    const fileUrl = pathToFileURL(filePath).href;
    const safeVersion = String(version || '').trim();
    return safeVersion ? `${fileUrl}?v=${encodeURIComponent(safeVersion)}` : fileUrl;
}

function removeFileIfExists(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) { reportIgnoredError(error, 'src/main/preload.js'); }
}

function removeManagedBackgroundFiles(exceptFileName = '') {
    try {
        const entries = fs.readdirSync(storagePaths.internalDataDir, { withFileTypes: true });
        entries.forEach((entry) => {
            if (!entry.isFile()) return;
            if (!entry.name.startsWith(CUSTOM_BACKGROUND_PREFIX)) return;
            if (exceptFileName && entry.name === exceptFileName) return;
            removeFileIfExists(path.join(storagePaths.internalDataDir, entry.name));
        });
    } catch (error) { reportIgnoredError(error, 'src/main/preload.js'); }
}

function persistBackgroundFileSync(bufferLike, extName) {
    const normalizedExt = sanitizeBackgroundExt(extName);
    const targetFileName = `${CUSTOM_BACKGROUND_PREFIX}${normalizedExt}`;
    const targetFilePath = getBackgroundFilePath(targetFileName);

    fs.mkdirSync(storagePaths.internalDataDir, { recursive: true });
    fs.writeFileSync(targetFilePath, bufferLike);
    removeManagedBackgroundFiles(targetFileName);
    invokeSettingsSync('set', { key: 'customBackgroundFile', value: targetFileName });

    return getBackgroundFileUrl(targetFilePath, Date.now());
}

function inferExtFromMimeType(mimeType) {
    switch (String(mimeType || '').toLowerCase()) {
        case 'image/jpeg':
        case 'image/jpg':
            return '.jpg';
        case 'image/gif':
            return '.gif';
        case 'image/webp':
            return '.webp';
        case 'image/bmp':
            return '.bmp';
        case 'image/svg+xml':
            return '.svg';
        case 'image/png':
        default:
            return '.png';
    }
}

function getBackgroundUrlSync() {
    const settings = readSettingsSync();
    const fileName = settings.customBackgroundFile;
    if (!fileName) {
        return '';
    }

    const filePath = getBackgroundFilePath(fileName);
    if (!fs.existsSync(filePath)) {
        invokeSettingsSync('remove', { key: 'customBackgroundFile' });
        return '';
    }

    return getBackgroundFileUrl(filePath, fs.statSync(filePath).mtimeMs);
}

function saveBackgroundFromDataUrlSync(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/);
    if (!match) {
        throw new Error('无效的背景图片数据');
    }

    const mimeType = match[1] || 'image/png';
    const base64Body = match[2] || '';
    const buffer = Buffer.from(base64Body, 'base64');
    return persistBackgroundFileSync(buffer, inferExtFromMimeType(mimeType));
}

function clearBackgroundSync() {
    const settings = readSettingsSync();
    if (settings.customBackgroundFile) {
        removeFileIfExists(getBackgroundFilePath(settings.customBackgroundFile));
    }
    removeManagedBackgroundFiles();
    invokeSettingsSync('remove', { key: 'customBackgroundFile' });
    return '';
}

function getTokenSync() {
    return invokeSettingsSync('get-token') || '';
}

function setTokenSync(token) {
    return invokeSettingsSync('set-token', { token });
}

function clearTokenSync() {
    return invokeSettingsSync('clear-token') || '';
}

function getSettingValueSync(key, fallbackValue) {
    const result = invokeSettingsSync('get', { key });
    if (result && result.found) {
        return result.value;
    }

    return arguments.length >= 2 ? fallbackValue : '';
}

function setSettingValueSync(key, value) {
    return invokeSettingsSync('set', { key, value });
}

function removeSettingValueSync(key) {
    invokeSettingsSync('remove', { key });
}

function readRuntimeCacheSync() {
    const rawCache = readJsonFileSafe(storagePaths.runtimeCacheFile, {});
    return rawCache && typeof rawCache === 'object' && !Array.isArray(rawCache)
        ? rawCache
        : {};
}

function writeRuntimeCacheSync(nextCache) {
    const normalized = nextCache && typeof nextCache === 'object' && !Array.isArray(nextCache)
        ? nextCache
        : {};
    writeJsonFileSafe(storagePaths.runtimeCacheFile, normalized);
    return normalized;
}

function updateRuntimeCacheSync(updater) {
    const current = readRuntimeCacheSync();
    const next = typeof updater === 'function'
        ? updater({ ...current }) || current
        : { ...current, ...(updater || {}) };
    return writeRuntimeCacheSync(next);
}

function getCacheValueSync(key, fallbackValue) {
    const cache = readRuntimeCacheSync();
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
        return cache[key];
    }
    return arguments.length >= 2 ? fallbackValue : '';
}

function setCacheValueSync(key, value) {
    updateRuntimeCacheSync((current) => {
        current[key] = value;
        return current;
    });
    return value;
}

function removeCacheValueSync(key) {
    updateRuntimeCacheSync((current) => {
        delete current[key];
        return current;
    });
}

function getCachedImageThumbnailUrlSync(url, width = 520) {
    const remoteUrl = String(url || '').trim();
    if (!/^https?:\/\//i.test(remoteUrl)) return '';

    const targetWidth = Math.max(160, Math.min(900, Math.round(Number(width) || 520)));
    const key = crypto.createHash('sha1').update(`${targetWidth}:${remoteUrl}`).digest('hex');
    const filePath = path.join(storagePaths.internalDataDir, 'image-thumb-cache', `${key}.jpg`);
    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 128) {
            return pathToFileURL(filePath).href;
        }
    } catch (error) { reportIgnoredError(error, 'src/main/preload.js'); }
    return '';
}

let pendingLegacyMigration = null;
function migrateLegacyHtml() {
    if (process.argv.includes('--yaya-room-window')) return;
    if (!pendingLegacyMigration) {
        const { migrateLegacyMessageHtml } = require('./services/legacy-message-html');
        pendingLegacyMigration = migrateLegacyMessageHtml(storagePaths.htmlDir)
            .finally(() => { pendingLegacyMigration = null; });
    }
    return pendingLegacyMigration;
}

async function readDatabaseStyles() {
    const directory = path.join(appDir, 'src', 'renderer', 'database');
    const styles = await Promise.all(['tailwind.css', 'styles.css']
        .map(file => fs.promises.readFile(path.join(directory, file), 'utf8')));
    return styles.join('\n');
}

function readOfficialMusicCatalog(rawUrl, redirects = 0) {
    const url = new URL(rawUrl);
    if (url.origin !== 'https://www.snh48.com' || url.username || url.password
        || !/^\/js\/json_data_(snh|gnz|bej|ckg|cgt)\.js$/.test(url.pathname)) {
        return Promise.reject(new Error('无效的官网音乐目录地址'));
    }
    return new Promise((resolve, reject) => {
        const request = require('node:https').get(url, { signal: AbortSignal.timeout(12000) }, async response => {
            try {
                const { statusCode, headers } = response;
                if (statusCode >= 300 && statusCode < 400 && headers.location && redirects < 4) {
                    response.resume();
                    resolve(await readOfficialMusicCatalog(new URL(headers.location, url), redirects + 1));
                    return;
                }
                if (statusCode < 200 || statusCode >= 300) {
                    response.resume();
                    throw new Error(`官网返回 ${statusCode}`);
                }
                response.setEncoding('utf8');
                let text = '';
                for await (const chunk of response) text += chunk;
                resolve(text);
            } catch (error) {
                reject(error);
            }
        });
        request.on('error', reject);
    });
}

const desktopIpc = {
    send(channel, payload) {
        if (sendChannels.has(channel)) ipcRenderer.send(channel, payload);
    },
    invoke(channel, payload) {
        const isPocketChannel = Object.hasOwn(POCKET_CHANNEL_METHODS, channel);
        if (!isPocketChannel && !invokeChannels.has(channel)) {
            return Promise.reject(new Error('当前页面不支持该操作'));
        }
        if (isPocketChannel || channel === 'fetch-pocket-api' || channel === 'pocket-social-login-start') {
            payload = { ...payload };
            if (payload.clientProfile == null) payload.clientProfile = getSettingValueSync('p48ClientProfile', '');
            let deviceId = getSettingValueSync('p48ClientDeviceId', '');
            if (!/^[a-f0-9]{16}$/.test(deviceId)) {
                deviceId = crypto.randomBytes(8).toString('hex');
                setSettingValueSync('p48ClientDeviceId', deviceId);
            }
            payload.deviceId = deviceId;
        }
        return ipcRenderer.invoke(channel, payload);
    },
    on(channel, listener) {
        if (!eventChannels.has(channel) || typeof listener !== 'function') return;
        const wrapped = (_event, payload) => listener(null, payload);
        ipcRenderer.on(channel, wrapped);
        return () => ipcRenderer.removeListener(channel, wrapped);
    }
};

contextBridge.exposeInMainWorld('desktop', {
    platform,
    isRoomWindow: process.argv.includes('--yaya-room-window'),
    isLiveWindow: process.argv.includes('--yaya-live-window'),
    ipcRenderer: desktopIpc,
    messageArchive: { migrateLegacyHtml },
    database: { readStyles: readDatabaseStyles },
    officialMusic: { readCatalog: url => readOfficialMusicCatalog(url) },
    mediaDownloads: {
        save: payload => ipcRenderer.invoke('save-media-download', payload),
        begin: payload => ipcRenderer.invoke('begin-media-download', payload),
        append: payload => ipcRenderer.invoke('append-media-download', payload),
        finish: payload => ipcRenderer.invoke('finish-media-download', payload),
        abort: payload => ipcRenderer.invoke('abort-media-download', payload)
    },
    async openExternal(rawUrl) {
        const url = new URL(rawUrl);
        if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error('不支持此链接类型');
        return shell.openExternal(url.href);
    },
    openExternalPlayer(url) {
        return ipcRenderer.invoke('open-external-player', { url });
    },
    appSettings: {
        readSync: readSettingsSync,
        getSettingValueSync,
        setSettingValueSync,
        removeSettingValueSync,
        getTokenSync,
        setTokenSync,
        clearTokenSync,
        listPocketAccountsSync: () => invokeSettingsSync('list-pocket-accounts'),
        rememberPocketAccountSync: account => invokeSettingsSync('remember-pocket-account', account),
        getPocketAccountSync: userId => invokeSettingsSync('get-pocket-account', { userId }),
        activatePocketAccountSync: session => invokeSettingsSync('activate-pocket-account', session),
        forgetPocketAccountSync: userId => invokeSettingsSync('forget-pocket-account', { userId }),
        getBackgroundUrlSync,
        saveBackgroundFromDataUrlSync,
        clearBackgroundSync
    },
    appCache: {
        readSync: readRuntimeCacheSync,
        getCacheValueSync,
        setCacheValueSync,
        removeCacheValueSync
    },
    imageCache: {
        getCachedThumbnailUrlSync: getCachedImageThumbnailUrlSync
    }
});

contextBridge.exposeInMainWorld('ipcRenderer', desktopIpc);
contextBridge.exposeInMainWorld('getNetfaceRtcEngine', () => require('./netface-rtc-bridge').getRtcApi());
contextBridge.exposeInMainWorld('sanitizeNetfaceLog', createNetfaceLogSanitizer());
function resetRendererPageZoom() {
    try {
        webFrame.setZoomLevel(0);
        webFrame.setZoomFactor(1);
    } catch (error) { reportIgnoredError(error, 'src/main/preload.js'); }
}

resetRendererPageZoom();

window.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    resetRendererPageZoom();
}, { passive: false, capture: true });

window.addEventListener('keydown', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;

    const key = String(event.key || '').toLowerCase();
    if (key === '+' || key === '=' || key === '-' || key === '_' || key === '0') {
        event.preventDefault();
        resetRendererPageZoom();
    }
}, { capture: true });

window.addEventListener('DOMContentLoaded', resetRendererPageZoom, { once: true });
window.addEventListener('pageshow', resetRendererPageZoom);
window.addEventListener('focus', resetRendererPageZoom);
