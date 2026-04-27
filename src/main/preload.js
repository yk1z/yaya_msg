const path = require('path');
const fs = require('fs');
const https = require('https');
const readline = require('readline');
const { pathToFileURL } = require('url');
const { ipcRenderer, shell } = require('electron');
const { ensureStoragePaths } = require('../common/storage-paths');

const appDir = path.join(__dirname, '../../');
const platform = process.platform;
const storagePaths = ensureStoragePaths();
const CUSTOM_BACKGROUND_PREFIX = 'custom_background';

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
    return path.join(storagePaths.internalDataDir, fileName);
}

function removeFileIfExists(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
    }
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
    } catch (error) {
    }
}

function persistBackgroundFileSync(bufferLike, extName) {
    const normalizedExt = sanitizeBackgroundExt(extName);
    const targetFileName = `${CUSTOM_BACKGROUND_PREFIX}${normalizedExt}`;
    const targetFilePath = getBackgroundFilePath(targetFileName);

    fs.mkdirSync(storagePaths.internalDataDir, { recursive: true });
    fs.writeFileSync(targetFilePath, bufferLike);
    removeManagedBackgroundFiles(targetFileName);
    invokeSettingsSync('set', { key: 'customBackgroundFile', value: targetFileName });

    return pathToFileURL(targetFilePath).href;
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

    return pathToFileURL(filePath).href;
}

function saveBackgroundFromFileSync(sourcePath) {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
        throw new Error('背景图片源文件不存在');
    }

    const extName = sanitizeBackgroundExt(path.extname(sourcePath) || '.png');
    const targetFileName = `${CUSTOM_BACKGROUND_PREFIX}${extName}`;
    const targetFilePath = getBackgroundFilePath(targetFileName);

    fs.mkdirSync(storagePaths.internalDataDir, { recursive: true });
    fs.copyFileSync(sourcePath, targetFilePath);
    removeManagedBackgroundFiles(targetFileName);
    invokeSettingsSync('set', { key: 'customBackgroundFile', value: targetFileName });

    return pathToFileURL(targetFilePath).href;
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

window.desktop = {
    appDir,
    platform,
    storagePaths,
    fs,
    path,
    https,
    readline,
    ipcRenderer: {
        send(channel, payload) {
            ipcRenderer.send(channel, payload);
        },
        invoke(channel, payload) {
            return ipcRenderer.invoke(channel, payload);
        },
        on(channel, listener) {
            ipcRenderer.on(channel, listener);
            return () => ipcRenderer.removeListener(channel, listener);
        }
    },
    openExternal(url) {
        return shell.openExternal(url);
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
        getBackgroundUrlSync,
        saveBackgroundFromFileSync,
        saveBackgroundFromDataUrlSync,
        clearBackgroundSync
    },
    appCache: {
        readSync: readRuntimeCacheSync,
        getCacheValueSync,
        setCacheValueSync,
        removeCacheValueSync
    }
};

window.ipcRenderer = window.desktop.ipcRenderer;
