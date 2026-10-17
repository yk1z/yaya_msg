const path = require('path');
const { pathToFileURL } = require('url');
const settingsService = require('./settings-service');
const { ensureWasmLoaded, generatePa } = require('./wasm-service');
const { runLiveReadRequest } = require('./live-read-request');
const { withDesktopLiveRoom } = require('./live-room-routing');

const LIVE48_LOGIN_COOKIE_KEY = 'live48LoginCookie';
const LIVE48_LOGIN_AT_KEY = 'live48LoginAt';
const LIVE48_USER_INFO_KEY = 'live48UserInfo';
const MEET48_CHANNELS = new Set([
    'fetch-meet48-live-list',
    'fetch-meet48-live-one'
]);

let pocketRuntimePromise = null;

function readMeet48Auth() {
    const storedAuth = settingsService.readSettings().meet48Auth || {};
    if (storedAuth.disabled === true) return {};
    return {
        token: String(storedAuth.token || process.env.MEET48_TOKEN || ''),
        cookie: String(storedAuth.cookie || process.env.MEET48_COOKIE || ''),
        deviceId: String(storedAuth.deviceId || process.env.MEET48_DEVICE_ID || '')
    };
}

async function getLive48LoginStatus({ fetchLive48AccountInfo }) {
    const settings = settingsService.readSettings();
    const cookie = String(settings[LIVE48_LOGIN_COOKIE_KEY] || '').trim();
    const savedInfo = settings[LIVE48_USER_INFO_KEY] || null;
    if (!cookie) return { success: true, loggedIn: false };

    const accountInfo = await fetchLive48AccountInfo(cookie).catch(() => null);
    if (!accountInfo) {
        return {
            success: true,
            loggedIn: false,
            accountInfo: savedInfo,
            msg: 'live.48.cn 登录状态可能已失效'
        };
    }

    settingsService.setSettingValue(LIVE48_USER_INFO_KEY, accountInfo);
    return {
        success: true,
        loggedIn: true,
        accountInfo,
        loginAt: settings[LIVE48_LOGIN_AT_KEY] || ''
    };
}

function saveLive48Login({ cookie, accountInfo, loginAt }) {
    settingsService.setSettingValue(LIVE48_LOGIN_COOKIE_KEY, cookie);
    settingsService.setSettingValue(LIVE48_LOGIN_AT_KEY, loginAt);
    if (accountInfo) settingsService.setSettingValue(LIVE48_USER_INFO_KEY, accountInfo);
    return true;
}

async function loadPocketRuntime() {
    if (!pocketRuntimePromise) {
        const runtimeUrl = pathToFileURL(path.join(__dirname, '..', '..', 'common', 'pocket-runtime.mjs')).href;
        pocketRuntimePromise = import(runtimeUrl).then((runtime) => {
            runtime.configurePocketRuntime({
                saveLive48Login,
                getLive48LoginStatus
            });
            return runtime;
        });
    }
    return pocketRuntimePromise;
}

async function preparePayload(channel, payload) {
    const prepared = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? { ...payload }
        : {};

    if (MEET48_CHANNELS.has(channel) && !prepared.meet48Auth) {
        const meet48Auth = readMeet48Auth();
        if (meet48Auth.token || meet48Auth.cookie || meet48Auth.deviceId) {
            prepared.meet48Auth = meet48Auth;
        }
    }

    if ((channel === 'login-send-sms' || channel === 'login-by-code' || channel === 'send-live-gift') && !prepared.pa) {
        await ensureWasmLoaded();
        prepared.pa = generatePa() || '';
    }

    return prepared;
}

async function invoke(channel, payload = {}) {
    try {
        const [runtime, preparedPayload] = await Promise.all([
            loadPocketRuntime(),
            preparePayload(channel, payload)
        ]);
        if (channel === 'fetch-live-one') {
            return withDesktopLiveRoom(await runLiveReadRequest('/live/api/v1/live/getLiveOne', preparedPayload, async attempt => {
                const requestPayload = { ...preparedPayload };
                if (attempt > 0) {
                    await ensureWasmLoaded();
                    requestPayload.pa = generatePa() || requestPayload.pa;
                }
                return runtime.invokePocketChannel(channel, requestPayload);
            }));
        }
        return await runtime.invokePocketChannel(channel, preparedPayload, {
            desktopLiveGift: channel === 'send-live-gift'
        });
    } catch (error) {
        return {
            success: false,
            msg: error?.message || 'Pocket API 请求失败'
        };
    }
}

async function deleteMemberRoomMessage(payload = {}) {
    try {
        const runtime = await loadPocketRuntime();
        return await runtime.deleteMemberRoomMessage(payload);
    } catch (error) {
        return {
            success: false,
            msg: error?.message || '删除成员房间消息失败'
        };
    }
}

function normalizePocketApiPath(value) {
    const apiPath = String(value || '').trim();
    if (!apiPath.startsWith('/') || apiPath.includes('://') || apiPath.includes('..')) {
        throw new Error('无效的 Pocket API 路径');
    }
    return apiPath;
}

function normalizePocketApiPostData(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(String(value || '{}'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

async function fetchPocketApiPath({ path: apiPath, postData } = {}) {
    try {
        const normalizedPath = normalizePocketApiPath(apiPath);
        const requestPayload = normalizePocketApiPostData(postData);
        return await runLiveReadRequest(normalizedPath, requestPayload, async () => {
            const response = await fetch(`https://pocketapi.48.cn${normalizedPath}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=utf-8',
                    'User-Agent': 'PocketFans201807/7.1.35 (iPhone; iOS 16.3; Scale/3.00)',
                    'Accept-Language': 'zh-Hans-CN;q=1',
                    appInfo: JSON.stringify({
                        vendor: 'apple',
                        deviceId: '7B93DFD0-472F-4736-A628-E85FAE086486',
                        appVersion: '7.1.35',
                        appBuild: '25101021',
                        osVersion: '16.3.0',
                        osType: 'ios',
                        deviceName: 'iPhone 14 Pro',
                        os: 'ios'
                    })
                },
                body: JSON.stringify(requestPayload)
            });
            const text = await response.text();
            if (!text) return { status: response.status || 500, content: {}, message: 'Pocket API 返回为空' };
            return JSON.parse(text);
        });
    } catch (error) {
        return {
            status: 500,
            content: {},
            message: error?.message || 'Pocket API 请求失败'
        };
    }
}

module.exports = {
    invoke,
    deleteMemberRoomMessage,
    fetchPocketApiPath
};
