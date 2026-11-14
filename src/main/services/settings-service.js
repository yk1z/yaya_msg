const fs = require('fs');
const path = require('path');
const { ensureStoragePaths } = require('../../common/storage-paths');
const { normalizeCustomSenderProfile } = require('../../common/sender-profile');
const authChangeListeners = new Set();
const AUTH_KEYS = ['p48Token', 'p48ClientProfile', 'p48ClientDeviceId'];
const SAVED_ACCOUNTS_KEY = 'p48SavedAccounts';

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

    if (Object.prototype.hasOwnProperty.call(safeSettings, 'meet48Auth')) {
        const auth = safeSettings.meet48Auth;
        if (!auth || typeof auth !== 'object' || Array.isArray(auth)) {
            delete safeSettings.meet48Auth;
        } else {
            safeSettings.meet48Auth = {
                token: String(auth.token || '').trim(),
                cookie: String(auth.cookie || '').trim(),
                deviceId: String(auth.deviceId || '').trim(),
                disabled: auth.disabled === true
            };
            if (!safeSettings.meet48Auth.token && !safeSettings.meet48Auth.cookie && !safeSettings.meet48Auth.deviceId && !safeSettings.meet48Auth.disabled) {
                delete safeSettings.meet48Auth;
            }
        }
    }

    if (Object.prototype.hasOwnProperty.call(safeSettings, 'useYayaApiProxy')) {
        safeSettings.useYayaApiProxy = safeSettings.useYayaApiProxy === true;
    }

    if (Object.prototype.hasOwnProperty.call(safeSettings, 'windowCloseBehavior')) {
        safeSettings.windowCloseBehavior = safeSettings.windowCloseBehavior === 'quit'
            ? 'quit'
            : 'minimize-to-tray';
    }

    if (Object.prototype.hasOwnProperty.call(safeSettings, 'yayaApiProxyBaseUrl')) {
        if (typeof safeSettings.yayaApiProxyBaseUrl !== 'string') {
            delete safeSettings.yayaApiProxyBaseUrl;
        } else {
            safeSettings.yayaApiProxyBaseUrl = safeSettings.yayaApiProxyBaseUrl.trim();
            if (!safeSettings.yayaApiProxyBaseUrl) {
                delete safeSettings.yayaApiProxyBaseUrl;
            }
        }
    }

    if (Object.prototype.hasOwnProperty.call(safeSettings, 'customSenderProfile')) {
        safeSettings.customSenderProfile = normalizeCustomSenderProfile(safeSettings.customSenderProfile);
    }

    return safeSettings;
}

function readSettings() {
    return normalizeSettings(readJsonFileSafe(ensureStoragePaths().settingsFile, {}));
}

function writeSettings(nextSettings) {
    const normalized = normalizeSettings(nextSettings);
    const previous = authChangeListeners.size ? readSettings() : null;
    writeJsonFileSafe(ensureStoragePaths().settingsFile, normalized);
    if (previous && AUTH_KEYS.some(key => previous[key] !== normalized[key])) {
        for (const listener of authChangeListeners) listener();
    }
    return normalized;
}

function onAuthChange(listener) {
    authChangeListeners.add(listener);
    return () => authChangeListeners.delete(listener);
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

function getCustomSenderProfile() {
    return normalizeCustomSenderProfile(readSettings().customSenderProfile);
}

function savedPocketAccounts(settings = readSettings()) {
    const accounts = settings[SAVED_ACCOUNTS_KEY];
    return Array.isArray(accounts) ? accounts.filter(account => account && typeof account.userId === 'string' && /^\d+$/.test(account.userId)
        && typeof account.encryptedToken === 'string' && account.encryptedToken) : [];
}

function getPocketAccountStorage() {
    const { safeStorage } = require('electron');
    if (!safeStorage?.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
        throw new Error('系统凭据存储不可用，无法保存或切换账号');
    }
    return safeStorage;
}

function rememberPocketAccount({ userId, nickname, avatarUrl, token }) {
    const id = String(userId || '').trim();
    const current = readSettings();
    if (!/^\d+$/.test(id) || !token || token !== current.p48Token) return;
    const account = {
        userId: id,
        nickname: String(nickname || '口袋用户'),
        avatarUrl: /^https?:\/\//i.test(avatarUrl) ? String(avatarUrl) : '',
        clientProfile: current.p48ClientProfile === 'seine48' ? 'seine48' : 'pocket48',
        encryptedToken: getPocketAccountStorage().encryptString(token).toString('base64')
    };
    current[SAVED_ACCOUNTS_KEY] = [account, ...savedPocketAccounts(current).filter(item => item.userId !== id)];
    writeSettings(current);
}

function getSavedPocketAccount(userId) {
    const account = savedPocketAccounts().find(item => item.userId === userId);
    if (!account) throw new Error('此账号已移除，请重新登录');
    const storage = getPocketAccountStorage();
    try {
        return { token: storage.decryptString(Buffer.from(account.encryptedToken, 'base64')), clientProfile: account.clientProfile };
    } catch (_) {
        throw new Error('无法读取此账号的登录记录，请重新登录');
    }
}

function activatePocketAccount({ previousToken, token, clientProfile }) {
    const current = readSettings();
    if ((current.p48Token || '') !== previousToken || typeof token !== 'string' || !token.trim()) {
        throw new Error('登录状态已变化，请重新切换');
    }
    current.p48Token = token.trim();
    current.p48ClientProfile = clientProfile === 'seine48' ? 'seine48' : 'pocket48';
    writeSettings(current);
}

function forgetPocketAccount(userId) {
    updateSettings(current => {
        current[SAVED_ACCOUNTS_KEY] = savedPocketAccounts(current).filter(item => item.userId !== userId);
        return current;
    });
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
        case 'list-pocket-accounts':
            return savedPocketAccounts().map(({ userId, nickname, avatarUrl, clientProfile }) => ({ userId, nickname, avatarUrl, clientProfile }));
        case 'remember-pocket-account':
            return rememberPocketAccount(payload);
        case 'get-pocket-account':
            return getSavedPocketAccount(payload.userId);
        case 'activate-pocket-account':
            return activatePocketAccount(payload);
        case 'forget-pocket-account':
            return forgetPocketAccount(payload.userId);
        default:
            throw new Error(`未知设置操作: ${action}`);
    }
}

module.exports = {
    onAuthChange,
    readSettings,
    writeSettings,
    updateSettings,
    getSettingValue,
    setSettingValue,
    removeSettingValue,
    getToken,
    getCustomSenderProfile,
    setToken,
    clearToken,
    handleSyncRequest
};
