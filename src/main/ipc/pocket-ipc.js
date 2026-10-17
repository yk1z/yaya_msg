const { ipcMain } = require('electron');
const pocketService = require('../services/pocket-service');
const settingsService = require('../services/settings-service');
const { runLiveReadRequest } = require('../services/live-read-request');
const { withDesktopLiveRoom } = require('../services/live-room-routing');
const { POCKET_CHANNEL_METHODS } = require('../../common/pocket-channel-config');

const YAYA_API_PROXY_SETTING_KEY = 'useYayaApiProxy';
const DEFAULT_YAYA_API_BASE = 'https://api.gnz.hk';
const YAYA_API_RETRY_DELAYS_MS = [350, 900];
const MEET48_CHANNELS = new Set([
    'fetch-meet48-live-list',
    'fetch-meet48-live-one'
]);

function readYayaApiProxySettings() {
    const settings = settingsService.readSettings();
    return {
        enabled: settings[YAYA_API_PROXY_SETTING_KEY] === true,
        baseUrl: String(settings.yayaApiProxyBaseUrl || DEFAULT_YAYA_API_BASE).trim() || DEFAULT_YAYA_API_BASE
    };
}

function withLocalMeet48Auth(channel, payload) {
    if (!MEET48_CHANNELS.has(channel) || !payload || typeof payload !== 'object' || Array.isArray(payload) || payload.meet48Auth) {
        return payload;
    }

    const meet48Auth = settingsService.readSettings().meet48Auth || {};
    const hasAuth = meet48Auth.token || meet48Auth.cookie || meet48Auth.deviceId;
    if (!hasAuth) return payload;

    return {
        ...payload,
        meet48Auth: {
            token: String(meet48Auth.token || ''),
            cookie: String(meet48Auth.cookie || ''),
            deviceId: String(meet48Auth.deviceId || '')
        }
    };
}

function getYayaApiProxyUrl(baseUrl) {
    return new URL('/api/ipc', baseUrl).toString();
}

function getYayaPocketApiProxyUrl(baseUrl) {
    return new URL('/api/pocket', baseUrl).toString();
}

function waitForRetry(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isTransientYayaApiFailure(response, text, data, parseFailed) {
    const message = String(data?.msg || data?.message || '');
    const combined = `${String(text || '')}\n${message}`;
    return parseFailed
        || /^\s*</.test(text || '')
        || /<!doctype|unexpected token\s+['"]?<|not valid json|cloudflare|浏览器校验|返回了?网页内容/i.test(combined)
        || response.status === 429
        || response.status >= 500;
}

async function fetchYayaApiJson(url, options) {
    let lastNetworkError = null;

    for (let attempt = 0; attempt <= YAYA_API_RETRY_DELAYS_MS.length; attempt += 1) {
        let response;
        try {
            response = await fetch(url, options);
        } catch (error) {
            lastNetworkError = error;
            if (attempt < YAYA_API_RETRY_DELAYS_MS.length) {
                await waitForRetry(YAYA_API_RETRY_DELAYS_MS[attempt]);
                continue;
            }
            throw error;
        }

        const text = await response.text();
        let data = null;
        let parseFailed = false;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (error) {
            parseFailed = true;
        }

        const transientFailure = isTransientYayaApiFailure(response, text, data, parseFailed);
        if (transientFailure && attempt < YAYA_API_RETRY_DELAYS_MS.length) {
            await waitForRetry(YAYA_API_RETRY_DELAYS_MS[attempt]);
            continue;
        }

        return { response, text, data, parseFailed, transientFailure };
    }

    throw lastNetworkError || new Error('Yaya API 代理请求失败');
}

async function invokeYayaApiProxy(channel, payload, baseUrl) {
    const requestPayload = withLocalMeet48Auth(channel, payload);
    const result = await fetchYayaApiJson(getYayaApiProxyUrl(baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, payload: requestPayload || {} })
    });
    const { response, text, data, parseFailed, transientFailure } = result;

    if (parseFailed) {
        return {
            success: false,
            msg: /^\s*</.test(text || '')
                ? 'Yaya API 代理返回了网页内容，请稍后重试。'
                : 'Yaya API 代理返回内容不是 JSON'
        };
    }

    if (transientFailure) {
        return { success: false, msg: 'Yaya API 代理暂时不可用，请稍后重试。' };
    }

    if (!response.ok) {
        return data || { success: false, msg: `Yaya API 代理请求失败: ${response.status}` };
    }

    return data || { success: false, msg: 'Yaya API 代理返回为空' };
}

async function invokeYayaPocketApiProxy(payload, baseUrl) {
    const result = await fetchYayaApiJson(getYayaPocketApiProxyUrl(baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: payload?.path,
            postData: payload?.postData || {}
        })
    });
    const { response, text, data, parseFailed, transientFailure } = result;

    if (parseFailed) {
        return {
            status: 500,
            content: {},
            message: /^\s*</.test(text || '')
                ? 'Yaya API 代理返回了网页内容，请稍后重试。'
                : 'Yaya API 代理返回内容不是 JSON'
        };
    }

    if (transientFailure) {
        return {
            status: 503,
            content: {},
            message: 'Yaya API 代理暂时不可用，请稍后重试。'
        };
    }

    if (!response.ok) {
        return data || {
            status: response.status,
            content: {},
            message: `Yaya API 代理请求失败: ${response.status}`
        };
    }

    return data || { status: 500, content: {}, message: 'Yaya API 代理返回为空' };
}

async function handlePocketRequest(channel, payload, localHandler) {
    if (channel === 'send-live-gift' || channel.includes('netface')) return localHandler(payload);
    const proxySettings = readYayaApiProxySettings();
    if (proxySettings.enabled) {
        try {
            const proxyResult = await invokeYayaApiProxy(channel, payload, proxySettings.baseUrl);
            const proxyMessage = String(proxyResult?.msg || proxyResult?.message || '');
            if (!proxyResult?.success && proxyMessage.includes(`网页版暂不支持: ${channel}`)) {
                return localHandler(payload);
            }
            return proxyResult;
        } catch (error) {
            return {
                success: false,
                msg: `Yaya API 代理请求失败：${error.message || error}`
            };
        }
    }

    return localHandler(payload);
}

async function handlePocketApiPathRequest(payload) {
    const proxySettings = readYayaApiProxySettings();
    if (proxySettings.enabled) {
        try {
            return await runLiveReadRequest(payload?.path, payload?.postData, () => invokeYayaPocketApiProxy(payload, proxySettings.baseUrl));
        } catch (error) {
            return {
                status: 500,
                content: {},
                message: `Yaya API 代理请求失败：${error.message || error}`
            };
        }
    }

    return pocketService.fetchPocketApiPath(payload);
}

function registerPocketIpc() {
    const handle = (channel) => {
        ipcMain.handle(channel, async (event, payload) => {
            const result = await handlePocketRequest(channel, payload, preparedPayload => pocketService.invoke(channel, preparedPayload));
            return channel === 'fetch-live-one' ? withDesktopLiveRoom(result) : result;
        });
    };

    ipcMain.handle('fetch-pocket-api', (event, payload) => handlePocketApiPathRequest(payload));
    Object.keys(POCKET_CHANNEL_METHODS).forEach(handle);
}

module.exports = {
    registerPocketIpc
};
