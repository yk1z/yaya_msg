const fs = require('fs');
const path = require('path');
const { ensureStoragePaths } = require('../../common/storage-paths');

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
    fs.renameSync(tempFilePath, filePath);
}

function normalizeSettings(rawSettings) {
    const safeSettings = rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)
        ? { ...rawSettings }
        : {};

    if (Object.prototype.hasOwnProperty.call(safeSettings, 'p48Token')) {
        if (typeof safeSettings.p48Token !== 'string') {
            delete safeSettings.p48Token;
        } else {
            safeSettings.p48Token = safeSettings.p48Token.trim();
            if (!safeSettings.p48Token) {
                delete safeSettings.p48Token;
            }
        }
    }

    if (Object.prototype.hasOwnProperty.call(safeSettings, 'customBackgroundFile')) {
        if (typeof safeSettings.customBackgroundFile !== 'string') {
            delete safeSettings.customBackgroundFile;
        } else {
            safeSettings.customBackgroundFile = safeSettings.customBackgroundFile.trim();
            if (!safeSettings.customBackgroundFile) {
                delete safeSettings.customBackgroundFile;
            }
        }
    }

    return safeSettings;
}

function readSettings() {
    return normalizeSettings(readJsonFileSafe(ensureStoragePaths().settingsFile, {}));
}

function writeSettings(nextSettings) {
    const normalized = normalizeSettings(nextSettings);
    writeJsonFileSafe(ensureStoragePaths().settingsFile, normalized);
    return normalized;
}

function updateSettings(updater) {
    const current = readSettings();
    const next = typeof updater === 'function'
        ? updater({ ...current }) || current
        : { ...current, ...(updater || {}) };
    return writeSettings(next);
}

function getSettingValue(key) {
    const settings = readSettings();
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
        return { found: true, value: settings[key] };
    }

    return { found: false };
}

function setSettingValue(key, value) {
    updateSettings((current) => {
        current[key] = value;
        return current;
    });
    return value;
}

function removeSettingValue(key) {
    updateSettings((current) => {
        delete current[key];
        return current;
    });
}

function getToken() {
    return readSettings().p48Token || '';
}

function setToken(token) {
    const normalizedToken = String(token || '').trim();
    updateSettings((current) => {
        if (normalizedToken) {
            current.p48Token = normalizedToken;
        } else {
            delete current.p48Token;
        }
        return current;
    });
    return normalizedToken;
}

function clearToken() {
    updateSettings((current) => {
        delete current.p48Token;
        return current;
    });
    return '';
}

function handleSyncRequest(request = {}) {
    const { action, payload = {} } = request;

    switch (action) {
        case 'read':
            return readSettings();
        case 'get':
            return getSettingValue(payload.key);
        case 'set':
            return setSettingValue(payload.key, payload.value);
        case 'remove':
            return removeSettingValue(payload.key);
        case 'get-token':
            return getToken();
        case 'set-token':
            return setToken(payload.token);
        case 'clear-token':
            return clearToken();
        default:
            throw new Error(`未知设置操作: ${action}`);
    }
}

module.exports = {
    readSettings,
    writeSettings,
    updateSettings,
    getSettingValue,
    setSettingValue,
    removeSettingValue,
    getToken,
    setToken,
    clearToken,
    handleSyncRequest
};
