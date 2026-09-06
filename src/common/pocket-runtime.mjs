import pocketChannelConfig from './pocket-channel-config.js';
import errorUtils from './error-utils.js';

const { POCKET_CHANNEL_METHODS } = pocketChannelConfig;
const { reportIgnoredError } = errorUtils;

const APP_VERSION = '7.0.41';
const APP_BUILD = '24011601';
const MEET48_APP_VERSION = '2.0.3';
const MEET48_APP_BUILD = '2602062';
const MEET48_BUNDLE_ID = 'com.dapp.meet48';
const MEET48_APP_ID = '2e63a31eac9d056755b0f83b89ef6674';
const INVOICE_UPSTREAM_TIMEOUT_MS = 15 * 1000;

let deviceId = '';
const live48QrLoginSessions = new Map();
const runtimeHooks = {
    saveLive48Login: null,
    getLive48LoginStatus: null
};

export function configurePocketRuntime(hooks = {}) {
    runtimeHooks.saveLive48Login = typeof hooks.saveLive48Login === 'function' ? hooks.saveLive48Login : null;
    runtimeHooks.getLive48LoginStatus = typeof hooks.getLive48LoginStatus === 'function' ? hooks.getLive48LoginStatus : null;
}

function createDeviceId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID().toUpperCase();
    }
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return `WEB-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function getDeviceId() {
    if (!deviceId) {
        deviceId = createDeviceId();
    }
    return deviceId;
}

function createLive48BrowserId() {
    const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz012345678_@';
    const randomBytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(randomBytes);
    let value = 'liveweb';
    for (let i = 0; i < 8; i += 1) {
        value += chars[randomBytes[i] % chars.length];
    }
    return value;
}

function getSetCookieList(headers) {
    if (typeof headers.getSetCookie === 'function') {
        return headers.getSetCookie();
    }
    const value = headers.get('set-cookie');
    return value ? [value] : [];
}

function mergeCookieHeader(currentCookie = '', setCookies = [], extraCookies = {}) {
    const cookieMap = new Map();
    String(currentCookie || '').split(';').forEach(part => {
        const trimmed = part.trim();
        if (!trimmed) return;
        const index = trimmed.indexOf('=');
        if (index <= 0) return;
        cookieMap.set(trimmed.slice(0, index), trimmed.slice(index + 1));
    });

    Object.entries(extraCookies || {}).forEach(([key, value]) => {
        if (key && value != null) cookieMap.set(key, String(value));
    });

    const list = Array.isArray(setCookies) ? setCookies : (setCookies ? [setCookies] : []);
    list.forEach(cookie => {
        const firstPart = String(cookie || '').split(';')[0].trim();
        const index = firstPart.indexOf('=');
        if (index <= 0) return;
        cookieMap.set(firstPart.slice(0, index), firstPart.slice(index + 1));
    });

    return Array.from(cookieMap.entries()).map(([key, value]) => `${key}=${value}`).join('; ');
}

function stripHtml(value = '') {
    return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value = '') {
    return String(value || '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code) || 0))
        .trim();
}

function parseLive48AccountInfoFromHtml(html = '') {
    const text = String(html || '');
    const nickname = decodeHtmlEntities(stripHtml(text.match(/class=["']signin["'][^>]*>([\s\S]*?)<\/b>/i)?.[1] || ''));
    const avatarUrl = text.match(/class=["']headimg["'][\s\S]*?<img[^>]+src=["']([^"']+)/i)?.[1]
        || text.match(/https:\/\/uc\.48\.cn\/avatar\.php\?uid=\d+/i)?.[0]
        || '';
    const userId = avatarUrl.match(/[?&]uid=(\d+)/i)?.[1] || '';

    if (!nickname && !avatarUrl && !userId) return null;
    return {
        nickname: nickname || 'live.48.cn 用户',
        userId,
        avatarUrl
    };
}

async function fetchLive48AccountInfo(cookie) {
    if (!cookie) return null;
    const response = await fetch('https://live.48.cn/', {
        headers: {
            Cookie: cookie,
            Referer: 'https://live.48.cn/'
        }
    });
    if (!response.ok) return null;
    return parseLive48AccountInfoFromHtml(await response.text());
}

function createHeaders(token, pa) {
    const headers = {
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': `PocketFans201807/${APP_VERSION} (iPhone; iOS 16.3.1; Scale/2.00)`,
        'Accept-Language': 'zh-Hans-CN;q=1',
        appInfo: JSON.stringify({
            vendor: 'apple',
            deviceId: getDeviceId(),
            appVersion: APP_VERSION,
            appBuild: APP_BUILD,
            osVersion: '16.3.1',
            osType: 'ios',
            deviceName: 'iPhone XR',
            os: 'ios'
        })
    };
    if (token) headers.token = token;
    if (pa) headers.pa = pa;
    return headers;
}

function createModernHeaders(token, pa) {
    const headers = createHeaders(token, pa);
    headers.appInfo = JSON.stringify({
        vendor: 'apple',
        deviceId: '7B93DFD0-472F-4736-A628-E85FAE086486',
        appVersion: '7.1.35',
        appBuild: '25101021',
        osVersion: '16.3.0',
        osType: 'ios',
        deviceName: 'iPhone 14 Pro',
        os: 'ios'
    });
    headers['User-Agent'] = 'PocketFans201807/7.1.35 (iPhone; iOS 16.3; Scale/3.00)';
    return headers;
}

function createPocketAndroidHeaders(token, pa) {
    const deviceId = getDeviceId().replace(/[^a-f0-9]/gi, '').slice(0, 16).toLowerCase()
        || '0000000000000000';
    const headers = createHeaders(token, pa);
    headers.appInfo = JSON.stringify({
        IMEI: deviceId,
        appBuild: '26070701',
        appName: 'pocket48',
        appVersion: '7.1.43',
        deviceId,
        deviceName: 'SM-G9730',
        osType: 'android',
        osVersion: '12',
        phoneName: 'SM-G9730',
        phoneSystemVersion: '12',
        vendor: 'Samsung'
    });
    headers['User-Agent'] = 'PocketFans201807/7.1.43_26070701 (SM-G9730:Android 12;Samsung V417IR release-keys)';
    headers['Content-Type'] = 'application/json; charset=UTF-8';
    return headers;
}

function createSeineHeaders(token, pa) {
    const deviceId = getDeviceId().replace(/[^a-f0-9]/gi, '').slice(0, 16).toLowerCase()
        || '0000000000000000';
    const headers = createHeaders(token, pa);
    headers.appInfo = JSON.stringify({
        appVersion: '1.0.0',
        appBuild: 26061101,
        osType: 'android',
        appName: 'seine48',
        deviceId,
        deviceName: 'SM-G9730',
        osVersion: '12',
        vendor: 'Samsung',
        IMEI: deviceId,
        phoneName: 'SM-G9730',
        phoneSystemVersion: '12'
    });
    headers['X-Custom-Device-Type'] = 'ANDROID';
    headers['User-Agent'] = 'PocketFans201807/1.0.0_26061101 (SM-G9730:Android 12;Samsung V417IR release-keys)';
    headers['Content-Type'] = 'application/json; charset=UTF-8';
    return headers;
}

function createFriendshipHeaders(token, pa) {
    const headers = createHeaders(token, pa);
    headers.Accept = '*/*';
    headers.appInfo = JSON.stringify({
        vendor: 'apple',
        deviceId: getDeviceId(),
        appVersion: '7.1.43',
        appBuild: '26082801',
        osVersion: '27.0.0',
        osType: 'ios',
        deviceName: 'iPhone17,1',
        os: 'ios'
    });
    headers['User-Agent'] = 'PocketFans201807/7.1.43 (iPhone; iOS 27.0; Scale/3.00)';
    headers['P-Sign-Type'] = 'V0';
    return headers;
}

function createSeineIosHeaders(token, pa) {
    const headers = createHeaders(token, pa);
    headers.appInfo = JSON.stringify({
        deviceId: getDeviceId(),
        appVersion: '1.2.0',
        deviceName: 'iPhone 16 Pro',
        osType: 'ios',
        appBuild: '26072902',
        osVersion: '27.0',
        appName: 'seine48',
        vendor: 'apple'
    });
    headers['User-Agent'] = 'Seina/1.2.0 (com.seine48.app; build:26072902; iOS 27.0.0) Alamofire/5.8.0';
    return headers;
}

function createArea48Headers(token, pa) {
    const sourceDeviceId = `area48:${getDeviceId()}`;
    const deviceId = Array.from(sourceDeviceId).reduce((acc, char) => {
        const next = ((acc << 5) - acc + char.charCodeAt(0)) >>> 0;
        return next;
    }, 0).toString(16).padStart(16, '0').slice(0, 16);
    const headers = createHeaders(token, pa);
    headers.appInfo = JSON.stringify({
        IMEI: deviceId,
        appBuild: '201128',
        appVersion: '6.0.22',
        deviceId,
        deviceName: 'SM-G9730',
        osType: 'android',
        osVersion: '12',
        phoneName: 'SM-G9730',
        phoneSystemVersion: '12',
        vendor: 'Samsung'
    });
    headers['User-Agent'] = 'PocketFans201807/6.0.22_201128 (SM-G9730:Android 12;Samsung V417IR release-keys)';
    headers['Content-Type'] = 'application/json; charset=UTF-8';
    return headers;
}

function createCheckinHeaders(token, pa) {
    return { ...createModernHeaders(token, pa), 'P-Sign-Type': 'V0' };
}

function createWeiboHeaders(token, pa) {
    const headers = createModernHeaders(token, pa);
    headers.appInfo = JSON.stringify({
        vendor: 'apple',
        deviceId: '7B93DFD0-472F-4736-A628-E85FAE086487',
        appVersion: '7.1.38',
        appBuild: '26042402',
        osVersion: '26.5.0',
        osType: 'ios',
        deviceName: 'iPhone17,1',
        os: 'ios'
    });
    headers['User-Agent'] = 'PocketFans201807/7.1.38 (iPhone; iOS 26.5; Scale/3.00)';
    headers['P-Sign-Type'] = 'V0';
    return headers;
}

function createPfileHeaders(token, pa) {
    const headers = createModernHeaders(token, pa);
    delete headers['Content-Type'];
    delete headers.Host;
    return headers;
}

function createPfileImageHeaders(token, pa) {
    const headers = createArea48Headers(token, pa);
    delete headers['Content-Type'];
    delete headers.Host;
    return headers;
}

function createInvoiceHeaders(token, options = {}) {
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json, text/plain, */*',
        Host: 'pocketapi.48.cn',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
    };
    if (options.tokenHeader && token) {
        headers.token = token;
    }
    return headers;
}

function getElectionVoteToken(payload = {}) {
    return String(
        payload.voteToken
        || payload.electionToken
        || payload.authToken
        || payload.bearerToken
        || payload.authorization
        || payload.electionAuthorization
        || ''
    ).replace(/^Bearer\s+/i, '').trim();
}

function getElectionAppToken(payload = {}) {
    return String(payload.appToken || payload.pocketToken || payload.token || '').trim();
}

function createElectionVoteHeaders(payload = {}, options = {}) {
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://ceremony.ckg48.com',
        Referer: 'https://ceremony.ckg48.com/',
        Host: 'voteapi.48.cn',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
    };
    if (options.appToken) {
        const appToken = getElectionAppToken(payload);
        if (appToken) headers['X-APP-TOKEN'] = appToken;
    }
    if (options.auth !== false) {
        const voteToken = getElectionVoteToken(payload);
        if (voteToken) headers.Authorization = `Bearer ${voteToken}`;
    }
    return headers;
}

function createPageantryHeaders(token, pa) {
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json, text/plain, */*',
        Origin: 'http://h5.snh48.com',
        Referer: 'http://h5.snh48.com/',
        Host: 'pocketapi.48.cn',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        appInfo: encodeURIComponent(JSON.stringify({
            build: '26042402',
            phoneSystemVersion: 'iOS',
            schema: 'com.DuYi.SNH48',
            appName: 'pocket48',
            IMEI: '7B93DFD0-472F-4736-A628-E85FAE086487',
            osType: 'ios',
            version: '7.1.38',
            phoneName: 'iPhone17,1'
        }))
    };
    if (token) headers.token = token;
    if (pa) headers.pa = pa;
    return headers;
}

function normalizeMeet48ClientAuth(auth) {
    if (!auth || typeof auth !== 'object' || Array.isArray(auth)) {
        return {};
    }

    return {
        token: String(auth.token || '').trim(),
        cookie: String(auth.cookie || '').trim(),
        deviceId: String(auth.deviceId || '').trim()
    };
}

function createMeet48Headers(env = {}, auth = {}) {
    const clientAuth = normalizeMeet48ClientAuth(auth);
    const meetDeviceId = clientAuth.deviceId || env.MEET48_DEVICE_ID || createDeviceId();
    const headers = {
        'content-type': 'application/json',
        accept: '*/*',
        'accept-language': 'zh_TW',
        'user-agent': `Meet48/${MEET48_APP_VERSION} (${MEET48_BUNDLE_ID}; build:${MEET48_APP_BUILD}; iOS 26.4.2) Alamofire/5.8.0`,
        'x-versioncode': MEET48_APP_VERSION,
        'x-app-id': MEET48_APP_ID,
        'x-device-info': JSON.stringify({
            appVersion: MEET48_APP_VERSION,
            deviceId: meetDeviceId,
            osType: 'ios',
            appName: 'Meet48',
            vendor: 'apple',
            osVersion: '26.4.2',
            appBuildId: MEET48_APP_BUILD,
            osLoginType: 'common',
            bundleId: MEET48_BUNDLE_ID,
            deviceName: 'iPhone17,1'
        }),
        'x-web-type': '1',
        'x-deviceid': meetDeviceId,
        'x-custom-device-type': 'IOS'
    };
    const token = clientAuth.token || env.MEET48_TOKEN || '';
    const cookie = clientAuth.cookie || env.MEET48_COOKIE || '';
    if (token) {
        headers.token = token;
    }
    if (cookie) {
        headers.cookie = cookie;
    }
    return headers;
}

function missingToken() {
    return { success: false, msg: '缺少 Token' };
}

function getApiMessage(data) {
    if (!data || typeof data !== 'object') return '';
    const message = data.message
        || data.msg
        || data.error
        || data.errMsg
        || data.errmsg
        || '';
    const normalized = String(message || '').trim();
    return normalized && normalized !== 'No message available' ? normalized : '';
}

function formatApiFailure(fallback, { apiStatus = '', httpStatus = '', message = '' } = {}) {
    if (message) return message;
    const status = httpStatus || apiStatus;
    if (Number(status) === 403) return `${fallback}：请求被口袋拒绝 (403)`;
    return status ? `${fallback} (${status})` : fallback;
}

function apiError(response, fallback = 'API 错误') {
    const data = response?.data;
    const apiStatus = data && typeof data === 'object' && (data.status || data.code || data.errCode);
    return {
        success: false,
        msg: formatApiFailure(fallback, {
            apiStatus,
            httpStatus: response?.status,
            message: getApiMessage(data)
        }),
        data
    };
}

async function postPocketContent(url, payload, options = {}) {
    const {
        token,
        pa,
        headersFactory = createHeaders,
        errorMessage = 'API 错误',
        largeNumbers = false
    } = options;
    const response = await postJson(
        url,
        payload || {},
        headersFactory(token, pa),
        { largeNumbers }
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content, data: response.data };
    }
    return apiError(response, errorMessage);
}

function parseJsonPreservingLargeNumbers(text) {
    const fixed = String(text || '').replace(/:\s*([0-9]{15,})/g, ':"$1"');
    return JSON.parse(fixed);
}

async function postJson(url, payload, headers, options = {}) {
    const timeoutMs = Math.max(0, Number(options.timeoutMs) || 0);
    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    let text;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload || {}),
            ...(controller ? { signal: controller.signal } : {})
        });
        text = await response.text();
    } catch (error) {
        if (controller?.signal.aborted) {
            throw new Error(options.timeoutMessage || '口袋 API 请求超时，请稍后重试');
        }
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
    let data = null;
    if (text) {
        try {
            data = options.largeNumbers ? parseJsonPreservingLargeNumbers(text) : JSON.parse(text);
        } catch (error) {
            const isHtml = /^\s*</.test(text);
            const preview = text.replace(/\s+/g, ' ').slice(0, 160);
            throw new Error(isHtml
                ? `口袋 API 返回了 HTML 页面 (${response.status})，可能请求被拦截`
                : `口袋 API 返回内容不是 JSON (${response.status}): ${preview}`);
        }
    }
    return { status: response.status, data };
}

async function getText(url, headers) {
    const response = await fetch(url, { headers });
    return response.text();
}

function parseMaskWordsText(text) {
    return String(text || '')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map(word => word.trim())
        .filter(Boolean);
}

async function fetchPocketMaskWords({ token, pa, clientTime = 0 } = {}) {
    const fallbackUrl = 'https://source.48.cn/app_mask_words/2023110101.utf8';
    if (!token) {
        const text = await getText(fallbackUrl);
        const words = parseMaskWordsText(text);
        return {
            success: true,
            content: {
                needUpdate: false,
                time: '',
                url: fallbackUrl,
                words,
                count: words.length
            }
        };
    }

    const url = new URL('https://pocketapi.48.cn/home/api/check/maskword');
    url.searchParams.set('clientTime', String(Number(clientTime) || 0));
    const response = await fetch(url.toString(), { headers: createArea48Headers(token, pa) });
    const data = await response.json();
    if (!(response.status === 200 && (data?.status === 200 || data?.success))) {
        return apiError({ status: response.status, data }, '获取屏蔽词配置失败');
    }

    const content = data.content || {};
    const wordUrl = String(content.url || content.ordinaryUrl || content.starUrl || '').trim();
    if (!wordUrl) return { success: true, content: { ...content, words: [], count: 0 } };

    const text = await getText(wordUrl);
    const words = parseMaskWordsText(text);
    return {
        success: true,
        content: {
            ...content,
            url: wordUrl,
            words,
            count: words.length
        }
    };
}

async function resolveServerId(channelId, headers) {
    try {
        const response = await postJson(
            'https://pocketapi.48.cn/im/api/v1/im/team/room/info',
            { channelId: String(channelId) },
            headers
        );
        if (response.data?.success) return response.data.content.serverId;
    } catch (error) { reportIgnoredError(error, 'src/common/pocket-runtime.mjs'); }
    return null;
}

function getLoginRequestPa(pa) {
    const clientPa = String(pa || '').trim();
    if (clientPa) return clientPa;
    try {
        if (typeof globalThis.__yayaGeneratePa === 'function') {
            return String(globalThis.__yayaGeneratePa() || '').trim();
        }
    } catch (error) { reportIgnoredError(error, 'src/common/pocket-runtime.mjs'); }
    return '';
}

async function loginSendSms({ mobile, area, answer, pa }) {
    const payload = { mobile, area: area || '86' };
    if (answer) payload.answer = answer;
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/sms/send2',
        payload,
        createHeaders(null, getLoginRequestPa(pa))
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true };
    if (response.data?.status === 2001) {
        try {
            const verificationData = JSON.parse(response.data.message);
            return { success: false, needVerification: true, question: verificationData.question, options: verificationData.answer };
        } catch (error) {
            return { success: false, msg: `验证数据解析失败: ${response.data.message}` };
        }
    }
    return { success: false, msg: response.data?.message || '发送失败' };
}

async function loginByCode({ mobile, code, pa }) {
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/login/app/mobile/code',
        { mobile, code },
        createHeaders(null, getLoginRequestPa(pa))
    );
    return response.data;
}

async function loginCheckToken({ token, pa }) {
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/info/reload',
        { from: 'appstart' },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.success) {
        const content = response.data.content;
        const finalInfo = content.userInfo || content;
        if (content.bigSmallInfo) finalInfo.bigSmallInfo = content.bigSmallInfo;
        return { success: true, userInfo: finalInfo };
    }
    return { success: false, msg: response.data?.message || 'Token 无效' };
}

async function loginCreateQr() {
    const browserId = createLive48BrowserId();
    const initialCookie = mergeCookieHeader('', [], { browser: browserId });
    const response = await fetch('https://live.48.cn/Public/create_code/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: 'https://live.48.cn/',
            Cookie: initialCookie
        },
        body: new URLSearchParams({
            data: browserId,
            timestamp: String(Date.now())
        }).toString()
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.status !== '00' || !data.code || !data.desc) {
        return {
            success: false,
            msg: stripHtml(data?.desc) || data?.message || `创建二维码失败: HTTP ${response.status}`
        };
    }

    const cookie = mergeCookieHeader(initialCookie, getSetCookieList(response.headers));
    const qrImage = String(data.desc || '').match(/src=["']([^"']+)["']/i)?.[1] || '';
    const code = String(data.code);
    live48QrLoginSessions.set(code, {
        code,
        browserId,
        cookie,
        createdAt: Date.now()
    });

    return {
        success: true,
        code,
        qrImage,
        expiresInSeconds: 300
    };
}

async function loginPollQr({ code } = {}) {
    const normalizedCode = String(code || '').trim();
    const session = live48QrLoginSessions.get(normalizedCode);
    if (!normalizedCode || !session) {
        return { success: false, loggedIn: false, expired: true, msg: '二维码已过期，请重新生成' };
    }

    const response = await fetch('https://live.48.cn/Base/checklogin/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: 'https://live.48.cn/',
            Cookie: session.cookie
        },
        body: new URLSearchParams({ data: normalizedCode }).toString()
    });

    const data = await response.json().catch(() => null);
    session.cookie = mergeCookieHeader(session.cookie, getSetCookieList(response.headers));
    if (response.ok && data && data.status === '00') {
        const accountInfo = await fetchLive48AccountInfo(session.cookie)
            .catch(() => null)
            || parseLive48AccountInfoFromHtml(data.desc);
        const cookieSaved = runtimeHooks.saveLive48Login
            ? await runtimeHooks.saveLive48Login({
                cookie: session.cookie,
                accountInfo,
                loginAt: new Date().toISOString()
            }) !== false
            : false;
        live48QrLoginSessions.delete(normalizedCode);
        return {
            success: true,
            loggedIn: true,
            msg: stripHtml(data.desc) || '扫码登录成功',
            accountInfo,
            cookieSaved
        };
    }

    return {
        success: true,
        loggedIn: false,
        status: data?.status || String(response.status),
        msg: stripHtml(data?.desc) || data?.message || '等待 App 确认'
    };
}

async function loginCancelQr({ code } = {}) {
    const normalizedCode = String(code || '').trim();
    if (normalizedCode) live48QrLoginSessions.delete(normalizedCode);
    return { success: true };
}

async function loginQrStatus() {
    if (runtimeHooks.getLive48LoginStatus) {
        return runtimeHooks.getLive48LoginStatus({ fetchLive48AccountInfo });
    }
    return { success: true, loggedIn: false };
}

async function checkIn({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson('https://pocketapi.48.cn/user/api/v1/checkin', {}, createCheckinHeaders(token, pa));
    if (response.status === 200 && (response.data?.success || response.data?.status === 200)) {
        return { success: true, msg: response.data.message || '签到成功', content: response.data.content || null };
    }
    return { success: false, msg: response.data?.message || '签到失败', status: response.data?.status };
}

async function switchBigSmall({ token, pa, targetUserId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/bigsmall/switch/user',
        { toUserId: targetUserId },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchRoomMessages({ channelId, serverId, token, pa, nextTime = 0, fetchAll = false }) {
    if (!token) return missingToken();
    const headers = createHeaders(token, pa);
    let finalServerId = serverId;
    if (!finalServerId || finalServerId === 0) {
        finalServerId = await resolveServerId(channelId, headers);
    }
    const response = await postJson(
        fetchAll
            ? 'https://pocketapi.48.cn/im/api/v1/team/message/list/all'
            : 'https://pocketapi.48.cn/im/api/v1/team/message/list/homeowner',
        { channelId: parseInt(channelId, 10), serverId: parseInt(finalServerId, 10), nextTime, limit: 50 },
        headers
    );
    if (response.status === 200 && response.data?.status === 200) {
        return { success: true, data: response.data, usedServerId: finalServerId };
    }
    return apiError(response);
}

async function fetchPrivateMessageList({ token, pa, lastTime }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/message/api/v1/user/message/list',
        { lastTime: Number(lastTime) || Date.now() },
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response, '获取私信列表失败');
}

async function fetchPrivateMessageInfo({ token, pa, targetUserId, lastTime = 0 }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/message/api/v1/user/message/info',
        { lastTime: Number(lastTime) || 0, targetUserId: String(targetUserId) },
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response, '获取私信详情失败');
}

async function deletePrivateMessage({ token, pa, msgId }) {
    if (!token) return missingToken();
    const normalizedMsgId = String(msgId || '').trim();
    if (!normalizedMsgId) return { success: false, msg: '缺少消息 ID' };

    return postPocketContent(
        'https://pocketapi.48.cn/message/api/v1/user/message/delete/msg',
        { msgId: normalizedMsgId },
        {
            token,
            pa,
            headersFactory: createPocketAndroidHeaders,
            errorMessage: '删除私信失败'
        }
    );
}

async function sendPrivateMessageReply({ token, pa, targetUserId, text, messageType = 'TEXT', image = null }) {
    if (!token) return missingToken();
    const type = String(messageType || 'TEXT').toUpperCase();
    const payload = type === 'IMAGE'
        ? {
            messageType: 'IMAGE',
            imgUrl: String(image?.imgUrl || image?.path || ''),
            imgWidth: Number(image?.imgWidth || image?.width || 0),
            imgHeight: Number(image?.imgHeight || image?.height || 0),
            imgSize: Number(image?.imgSize || image?.size || 0),
            targetUserId: String(targetUserId),
            text: String(text || '')
        }
        : {
            messageType: 'TEXT',
            text: String(text || ''),
            targetUserId: String(targetUserId)
        };
    if (type === 'IMAGE' && !payload.imgUrl) return { success: false, msg: '缺少图片地址' };

    const response = await postJson(
        'https://pocketapi.48.cn/message/api/v1/user/message/reply',
        payload,
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response, '发送私信失败');
}

async function fetchFlipList({ token, pa, beginLimit = 0, limit = 20 }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question/list',
        { status: 0, beginLimit, limit, memberId: '' },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchStarArchives({ token, pa, memberId }) {
    if (!token) return missingToken();
    if (!memberId || memberId === 'undefined') return { success: false, msg: '未获取到有效的成员ID，请重新搜索选择' };
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/star/archives',
        { memberId: Number(memberId) },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchStarHistory({ token, pa, memberId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/star/history',
        { memberId: Number(memberId), limit: 100, lastTime: 0 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchOpenLive({ token, pa, memberId, nextTime }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/chatroom/msg/list/aim/type',
        { extMsgType: 'OPEN_LIVE', roomId: '', ownerId: String(memberId), nextTime: nextTime || 0 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchOpenLiveOne({ token, pa, liveId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/live/api/v1/live/getOpenLiveOne',
        { liveId: String(liveId) },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchOpenLivePublicList({ token, pa, groupId = 0, next = 0, record = false, debug = false }) {
    if (!token) return missingToken();

    const response = await postJson(
        'https://pocketapi.48.cn/live/api/v1/live/getOpenLiveList',
        { groupId, debug: !!debug, next, record: !!record },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchSeinePerformanceList({ token, pa, groupId = 0, next = 0 } = {}) {
    if (!token) return missingToken();

    return postPocketContent(
        'https://snhapi-v1.ckg48.cn/home/api/seine/home/interaction/list',
        {
            type: 2,
            groupId: String(groupId || 0),
            next: String(next || 0)
        },
        {
            token,
            pa,
            headersFactory: createSeineIosHeaders,
            errorMessage: '获取公演列表失败',
            largeNumbers: true
        }
    );
}

async function fetchMeet48LiveList({ next = 0, record = false, meet48Auth = null } = {}, env = {}) {
    const response = await postJson(
        'https://meetapi-v2.meet48.xyz/meet48-api/live/api/v1/live/getLiveList',
        { title: null, next: next || 0, record: !!record },
        createMeet48Headers(env, meet48Auth)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.code === 0 || response.data?.success)) {
        return { success: true, content: response.data.content || response.data.data };
    }
    return apiError(response, 'Meet48 API 错误');
}

async function fetchMeet48LiveOne({ liveId, meet48Auth = null }, env = {}) {
    const response = await postJson(
        'https://meetapi-v2.meet48.xyz/meet48-api/live/api/v1/live/getLiveOne',
        { liveId: String(liveId || ''), streamProtocol: 'RTMP' },
        createMeet48Headers(env, meet48Auth)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.code === 0 || response.data?.success)) {
        return { success: true, content: response.data.content || response.data.data };
    }
    return apiError(response, 'Meet48 API 错误');
}

function extractInputValue(html, inputId) {
    const pattern = new RegExp(`<input[^>]+id=["']${inputId}["'][^>]+value=["']([^"']*)["']`, 'i');
    const match = String(html || '').match(pattern);
    return match ? String(match[1] || '').trim() : '';
}

function extractParticipantNames(html) {
    const names = [];
    const matches = String(html || '').matchAll(/<p class="listname">\s*([^<\r\n]+?)\s*(?:<em|<\/p>)/gi);
    for (const match of matches) {
        const name = String(match[1] || '').replace(/\s+/g, ' ').trim();
        if (name && !names.includes(name)) names.push(name);
    }
    return names;
}

async function fetchOpenLivePageHtml(url, headers) {
    return getText(url, headers);
}

function normalizeOpenLiveTitleForMatch(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/&nbsp;|&#160;/gi, '')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;|&#34;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[《》“”"'‘’·•…\s\-_:：,.，。!！?？()（）[\]【】]/g, '')
        .trim();
}

function formatReplayDateHint(value) {
    if (!value && value !== 0) return '';
    const raw = String(value || '').trim();
    const explicitDate = raw.match(/(\d{4})[-/.年]?(\d{1,2})[-/.月]?(\d{1,2})(?:日)?/);
    if (explicitDate && (/[\-/.年月日]/.test(raw) || /^\d{8}$/.test(raw))) {
        return `${explicitDate[1]}.${String(explicitDate[2]).padStart(2, '0')}.${String(explicitDate[3]).padStart(2, '0')}`;
    }

    if (typeof value === 'number' || /^\d+$/.test(raw)) {
        let numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) {
            if (numeric < 1e12) numeric *= 1000;
            const date = new Date(numeric);
            if (!Number.isNaN(date.getTime())) {
                const parts = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                }).formatToParts(date);
                const part = type => parts.find(item => item.type === type)?.value || '';
                return `${part('year')}.${part('month')}.${part('day')}`;
            }
        }
    }
    return '';
}

function extractReplayCardsFromHtml(html) {
    return [...String(html || '').matchAll(/<li class="videos">([\s\S]*?)<\/li>/gi)].map(match => {
        const block = match[1] || '';
        const hrefMatch = block.match(/href="\/Index\/invideo\/club\/(\d+)\/id\/(\d+)"/i);
        const titleMatch = block.match(/<h4>([^<]+)<\/h4>/i);
        const dateMatch = block.match(/(\d{4}\.\d{2}\.\d{2})/);
        return {
            clubId: hrefMatch?.[1] || '',
            replayId: hrefMatch?.[2] || '',
            title: String(titleMatch?.[1] || '').trim(),
            date: dateMatch?.[1] || ''
        };
    }).filter(item => item.replayId && item.title);
}

const REPLAY_CLUB_IDS = Object.freeze(['1', '2', '3', '5', '6']);
const REPLAY_GROUP_CLUB_IDS = Object.freeze({
    snh: '1',
    snh48: '1',
    bej: '2',
    bej48: '2',
    gnz: '3',
    gnz48: '3',
    ckg: '5',
    ckg48: '5',
    cgt: '6',
    cgt48: '6'
});
const MAX_REPLAY_SEARCH_PAGE = 512;

function getReplayClubSearchOrder(groupHint, title) {
    const source = `${groupHint || ''} ${title || ''}`.toLowerCase();
    let preferred = '';
    for (const [group, clubId] of Object.entries(REPLAY_GROUP_CLUB_IDS)) {
        if (source.includes(group)) {
            preferred = clubId;
            break;
        }
    }
    const numericHint = String(groupHint || '').trim();
    if (!preferred && REPLAY_CLUB_IDS.includes(numericHint)) preferred = numericHint;
    return preferred
        ? [preferred, ...REPLAY_CLUB_IDS.filter(clubId => clubId !== preferred)]
        : REPLAY_CLUB_IDS.slice();
}

function replayDateKey(value) {
    const match = String(value || '').match(/(\d{4})\.(\d{2})\.(\d{2})/);
    return match ? Number(`${match[1]}${match[2]}${match[3]}`) : 0;
}

function getReplayPageDateBounds(cards) {
    const dates = cards.map(card => replayDateKey(card.date)).filter(Boolean);
    if (!dates.length) return null;
    return { newest: Math.max(...dates), oldest: Math.min(...dates) };
}

function getTitleBigrams(value) {
    const result = new Set();
    for (let index = 0; index < value.length - 1; index += 1) {
        result.add(value.slice(index, index + 2));
    }
    return result;
}

function scoreReplayTitleMatch(target, candidate) {
    if (!target || !candidate) return 0;
    if (target === candidate) return 1;
    const shorter = target.length <= candidate.length ? target : candidate;
    const longer = shorter === target ? candidate : target;
    if (shorter.length >= 4 && longer.includes(shorter)) {
        return 0.6 + (0.4 * shorter.length / longer.length);
    }

    let prefixLength = 0;
    while (prefixLength < shorter.length && target[prefixLength] === candidate[prefixLength]) {
        prefixLength += 1;
    }
    const targetBigrams = getTitleBigrams(target);
    const candidateBigrams = getTitleBigrams(candidate);
    let sharedBigrams = 0;
    targetBigrams.forEach(value => {
        if (candidateBigrams.has(value)) sharedBigrams += 1;
    });
    const dice = targetBigrams.size + candidateBigrams.size
        ? (2 * sharedBigrams) / (targetBigrams.size + candidateBigrams.size)
        : 0;
    return Math.max(dice, prefixLength / Math.max(shorter.length, 1));
}

function findBestReplayCard(cards, normalizedTargetTitle, normalizedTargetDate) {
    const candidates = cards
        .filter(card => card.date === normalizedTargetDate)
        .map(card => ({
            card,
            score: scoreReplayTitleMatch(
                normalizedTargetTitle,
                normalizeOpenLiveTitleForMatch(card.title)
            )
        }))
        .sort((left, right) => right.score - left.score);
    return candidates[0]?.score >= 0.38 ? candidates[0].card : null;
}

async function findReplayMatchInClub({ clubId, normalizedTargetTitle, normalizedTargetDate, headers }) {
    const targetDateKey = replayDateKey(normalizedTargetDate);
    const pageCache = new Map();
    const loadPage = async page => {
        if (!pageCache.has(page)) {
            const pageUrl = page === 1
                ? `https://live.48.cn/Index/main/club/${clubId}`
                : `https://live.48.cn/Index/main/club/${clubId}/p/${page}.html`;
            pageCache.set(page, fetchOpenLivePageHtml(pageUrl, headers)
                .then(extractReplayCardsFromHtml)
                .catch(() => []));
        }
        return pageCache.get(page);
    };
    const inspectPage = async page => {
        const cards = await loadPage(page);
        return {
            cards,
            match: findBestReplayCard(cards, normalizedTargetTitle, normalizedTargetDate),
            bounds: getReplayPageDateBounds(cards)
        };
    };

    const first = await inspectPage(1);
    if (first.match) return first.match;
    if (!first.cards.length || !first.bounds || targetDateKey > first.bounds.newest) return null;
    if (targetDateKey >= first.bounds.oldest) {
        const second = await inspectPage(2);
        return second.match;
    }

    let newerPage = 1;
    let olderPage = 2;
    while (olderPage <= MAX_REPLAY_SEARCH_PAGE) {
        const inspected = await inspectPage(olderPage);
        if (inspected.match) return inspected.match;
        if (!inspected.cards.length || !inspected.bounds || targetDateKey >= inspected.bounds.oldest) break;
        newerPage = olderPage;
        olderPage *= 2;
    }
    olderPage = Math.min(olderPage, MAX_REPLAY_SEARCH_PAGE);

    let low = newerPage + 1;
    let high = olderPage - 1;
    while (low <= high) {
        const page = Math.floor((low + high) / 2);
        const inspected = await inspectPage(page);
        if (inspected.match) return inspected.match;
        if (!inspected.cards.length || !inspected.bounds) {
            high = page - 1;
            continue;
        }
        if (targetDateKey < inspected.bounds.oldest) {
            low = page + 1;
        } else if (targetDateKey > inspected.bounds.newest) {
            high = page - 1;
        } else {
            for (const adjacentPage of [page - 1, page + 1]) {
                if (adjacentPage < 1) continue;
                const adjacent = await inspectPage(adjacentPage);
                if (adjacent.match) return adjacent.match;
            }
            return null;
        }
    }

    for (const boundaryPage of [low - 1, low, low + 1]) {
        if (boundaryPage < 1 || boundaryPage > MAX_REPLAY_SEARCH_PAGE) continue;
        const inspected = await inspectPage(boundaryPage);
        if (inspected.match) return inspected.match;
    }
    return null;
}

async function findReplayPageMatchByTitleDate({ title, dateHint, groupHint = '', headers }) {
    const normalizedTargetTitle = normalizeOpenLiveTitleForMatch(title);
    const normalizedTargetDate = formatReplayDateHint(dateHint);
    if (!normalizedTargetTitle || !normalizedTargetDate) return null;

    for (const clubId of getReplayClubSearchOrder(groupHint, title)) {
        const matched = await findReplayMatchInClub({
            clubId,
            normalizedTargetTitle,
            normalizedTargetDate,
            headers
        });
        if (matched) return matched;
    }
    return null;
}

function toParticipantList(names) {
    return names.map(name => ({ name, memberId: '', avatar: '', hot: '' }));
}

const openLiveParticipantsCache = new Map();
const openLiveParticipantsPending = new Map();
const OPEN_LIVE_PARTICIPANTS_CACHE_TTL = 30 * 60 * 1000;
const OPEN_LIVE_PARTICIPANTS_CACHE_LIMIT = 200;

function cacheOpenLiveParticipants(liveId, result) {
    openLiveParticipantsCache.delete(liveId);
    openLiveParticipantsCache.set(liveId, {
        expiresAt: Date.now() + OPEN_LIVE_PARTICIPANTS_CACHE_TTL,
        result
    });
    while (openLiveParticipantsCache.size > OPEN_LIVE_PARTICIPANTS_CACHE_LIMIT) {
        const oldestKey = openLiveParticipantsCache.keys().next().value;
        openLiveParticipantsCache.delete(oldestKey);
    }
}

async function fetchOpenLiveParticipantsUncached({ liveId, title = '', dateHint = '', groupHint = '' }) {
    const normalizedLiveId = String(liveId || '').trim();
    if (!normalizedLiveId) return { success: false, msg: '缺少 liveId' };
    const pageHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36',
        Referer: 'https://live.48.cn/'
    };

    try {
        const livePageUrl = `https://live.48.cn/Index/inlive/id/${encodeURIComponent(normalizedLiveId)}`;
        try {
            const html = await fetchOpenLivePageHtml(livePageUrl, pageHeaders);
            const videoId = extractInputValue(html, 'vedio_id');
            const clubId = extractInputValue(html, 'club_id');
            const pageToken = extractInputValue(html, 'param');
            if (videoId && clubId && pageToken) {
                try {
                    const memberResponse = await fetch('https://live.48.cn/Index/ajax_getmemberhot/', {
                        method: 'POST',
                        headers: {
                            ...pageHeaders,
                            Origin: 'https://live.48.cn',
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        body: new URLSearchParams({
                            act: 'default',
                            video_id: videoId,
                            token: pageToken,
                            club_id: clubId
                        }).toString()
                    });
                    const memberData = await memberResponse.json().catch(() => null);
                    const participants = (Array.isArray(memberData?.desc) ? memberData.desc : [])
                        .map(item => ({
                            name: String(item?.memberName || '').trim(),
                            memberId: String(item?.memberId || '').trim(),
                            avatar: String(item?.avatar || '').trim(),
                            hot: item?.hot ?? ''
                        }))
                        .filter(item => item.name);
                    if (participants.length) {
                        return { success: true, content: { participants, source: 'memberhot' } };
                    }
                } catch (error) {
                }
            }

            const participants = toParticipantList(extractParticipantNames(html));
            if (participants.length) {
                return { success: true, content: { participants, source: 'html-live' } };
            }
        } catch (error) {
        }

        for (const clubId of getReplayClubSearchOrder(groupHint, title)) {
            try {
                const replayUrl = `https://live.48.cn/Index/invideo/club/${clubId}/id/${encodeURIComponent(normalizedLiveId)}`;
                const participants = toParticipantList(extractParticipantNames(
                    await fetchOpenLivePageHtml(replayUrl, pageHeaders)
                ));
                if (participants.length) {
                    return { success: true, content: { participants, source: `html-replay-club-${clubId}` } };
                }
            } catch (error) {
            }
        }

        const matchedReplay = await findReplayPageMatchByTitleDate({
            title,
            dateHint,
            groupHint,
            headers: pageHeaders
        });
        if (matchedReplay?.replayId && matchedReplay?.clubId) {
            const replayUrl = `https://live.48.cn/Index/invideo/club/${matchedReplay.clubId}/id/${matchedReplay.replayId}`;
            const participants = toParticipantList(extractParticipantNames(
                await fetchOpenLivePageHtml(replayUrl, pageHeaders)
            ));
            if (participants.length) {
                return {
                    success: true,
                    content: {
                        participants,
                        source: `replay-match-club-${matchedReplay.clubId}`,
                        matchedReplayId: matchedReplay.replayId
                    }
                };
            }
        }

        return { success: false, msg: '未找到参与成员' };
    } catch (error) {
        return { success: false, msg: error?.message || '获取参与成员失败' };
    }
}

async function fetchOpenLiveParticipants({ liveId, title = '', dateHint = '', groupHint = '' }) {
    const normalizedLiveId = String(liveId || '').trim();
    if (!normalizedLiveId) return { success: false, msg: '缺少 liveId' };

    const cached = openLiveParticipantsCache.get(normalizedLiveId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
    }
    if (cached) openLiveParticipantsCache.delete(normalizedLiveId);

    const pending = openLiveParticipantsPending.get(normalizedLiveId);
    if (pending) return pending;

    const request = fetchOpenLiveParticipantsUncached({
        liveId: normalizedLiveId,
        title,
        dateHint,
        groupHint
    }).then(result => {
        const participants = result?.content?.participants;
        if (result?.success && Array.isArray(participants) && participants.length > 0) {
            cacheOpenLiveParticipants(normalizedLiveId, result);
        }
        return result;
    }).finally(() => {
        openLiveParticipantsPending.delete(normalizedLiveId);
    });

    openLiveParticipantsPending.set(normalizedLiveId, request);
    return request;
}

async function fetchFlipPrices({ token, pa, memberId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v2/custom/index',
        { memberId: String(memberId) },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function sendFlipQuestion({ token, pa, payload }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question',
        payload,
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, msg: '发送成功' };
    return { success: false, msg: response.data?.message || '发送失败' };
}

async function operateFlipQuestion({ token, pa, questionId, operateType }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question/operate',
        { questionId: String(questionId), operateType: operateType || 1 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, msg: '操作成功' };
    return apiError(response);
}

async function fetchMemberPhotos({ token, pa, memberId, page, size }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/nft/user_nft_list',
        { starId: parseInt(memberId, 10), size: size || 20, page: page || 0 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchUserMoney({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson('https://pocketapi.48.cn/user/api/v1/user/money', { token }, createHeaders(token, pa));
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return { success: false, msg: response.data?.message || '接口返回错误' };
}

async function fetchCheckinToday({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/checkin/check/today',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取签到状态失败');
}

async function fetchUnreadMessageCount({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/message/api/v1/unread/message/num',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取未读消息数失败');
}

async function editUserInfo({ token, pa, key, value }) {
    if (!token) return missingToken();
    if (!key) return { success: false, msg: '缺少修改字段' };
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/info/edit',
        { key, value },
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content, msg: response.data.message };
    }
    return apiError(response, '修改资料失败');
}

async function uploadPocketImage({ token, pa, fileName, mimeType, dataBase64, fromType = 'avatar', headersFactory = createPfileHeaders } = {}) {
    if (!token) return missingToken();
    const base64Body = String(dataBase64 || '').replace(/^data:[^;,]+;base64,/, '');
    if (!base64Body) return { success: false, msg: '缺少图片数据' };

    const binary = Uint8Array.from(atob(base64Body), char => char.charCodeAt(0));
    const finalMimeType = mimeType || 'image/jpeg';
    const finalFileName = fileName || `image-${Date.now()}.${finalMimeType.includes('png') ? 'png' : 'jpg'}`;
    const formData = new FormData();
    if (fromType) {
        formData.append('fromType', String(fromType));
    }
    formData.append('file', new Blob([binary], { type: finalMimeType }), finalFileName);

    const response = await fetch('https://pfile.48.cn/filesystem/upload/image', {
        method: 'POST',
        headers: headersFactory(token, pa),
        body: formData
    });
    const data = await response.json();
    if (response.ok && data?.status === 200) {
        const item = Array.isArray(data.content) ? data.content[0] : data.content;
        return { success: true, content: item, path: item?.path || '' };
    }
    return { success: false, msg: data?.message || '上传图片失败' };
}

async function uploadUserAvatar(payload = {}) {
    return uploadPocketImage({ ...payload, fromType: payload.fromType || 'avatar' });
}

async function uploadPrivateMessageImage(payload = {}) {
    return uploadPocketImage({
        ...payload,
        fromType: payload.fromType || '',
        headersFactory: createPfileImageHeaders
    });
}

async function fetchUserRenameCount({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/rename/count',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取改名次数失败');
}

async function fetchUserPictureFrames({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/get/picture/frame',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取头像框失败');
}

async function fetchClientGroupTeamStarUpdate({ token, pa, payload }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/client/update/group_team_star',
        payload || {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取成员基础数据更新失败');
}

async function fetchStarServerMap({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/team/star/server/map/get',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取成员房间映射失败');
}

async function fetchMediaCollectionTotalCount({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/media/api/media/v1/getCollectionTotalCount',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取收藏统计失败');
}

async function sendLiveGift({ token, pa, giftId, liveId, acceptUserId, giftNum }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/gift/api/v1/gift/send',
        {
            giftId: String(giftId),
            businessId: String(liveId),
            acceptUserId: String(acceptUserId),
            giftNum: Number(giftNum) || 1,
            isPocketGift: 0,
            businessCode: 0,
            zip: 0,
            isCombo: 0,
            ruleId: 0,
            giftType: 1,
            crm: globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now())
        },
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) {
        return { success: true, msg: response.data.message || '送礼成功', content: response.data.content };
    }
    return { success: false, msg: response.data?.message || '送礼失败' };
}

async function fetchGiftList({ token, pa, liveId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/gift/api/v1/gift/list',
        { businessId: String(liveId), giftType: 1 },
        createHeaders(token, pa),
        { largeNumbers: true }
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return { success: false, msg: response.data?.message || '获取礼物列表失败' };
}

async function getNimLoginInfo({ token, pa }) {
    if (!token) return { success: false, msg: '未登录' };
    const headers = createModernHeaders(token, pa);
    headers['P-Sign-Type'] = 'V0';
    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/im/userinfo',
        {},
        headers
    );
    const content = response.data?.content || {};
    const accid = String(content.accid || content.accId || content.imUserId || '').trim();
    const nimToken = String(content.pwd || content.token || content.imPwd || '').trim();
    if (response.status === 200
        && (response.data?.success || response.data?.status === 200)
        && accid
        && nimToken) {
        return {
            success: true,
            accid,
            account: accid,
            token: nimToken,
            userId: String(content.userId || '').trim()
        };
    }
    return {
        success: false,
        msg: response.data?.message || '口袋48没有返回完整的云信账号凭证'
    };
}

async function fetchRoomAlbum({ token, pa, channelId, nextTime }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/team/msg/list/img',
        { channelId: String(channelId), nextTime: nextTime || 0 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchRoomRadio({ token, pa, channelId, serverId }) {
    if (!token) return missingToken();
    const headers = createHeaders(token, pa);
    let finalServerId = serverId;
    if (!finalServerId || finalServerId === 0) {
        finalServerId = await resolveServerId(channelId, headers);
    }
    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/team/voice/operate',
        { channelId: parseInt(channelId, 10), serverId: parseInt(finalServerId, 10), operateCode: 2 },
        headers,
        { timeoutMs: 12000 }
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return { success: false, msg: response.data?.message || '电台未开启或获取失败' };
}

async function fetchSeineServerDetail({ token, pa, serverId }) {
    if (!token) return missingToken();
    if (!serverId) return { success: false, msg: '缺少 Server ID' };
    return postPocketContent(
        'https://pocketapi.48.cn/im/api/seine/server/detail',
        { serverId: Number(serverId) },
        { token, pa, headersFactory: createSeineHeaders, errorMessage: '获取频道详情失败' }
    );
}

async function fetchLiveRank({ token, pa, liveId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/live/api/v2/live/getLiveRank',
        { type: 1, liveId: String(liveId) },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return { success: false, msg: response.data?.message || '获取榜单失败' };
}

async function fetchFriendsIds({ token, pa }) {
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/friendships/friends/id',
        {},
        createFriendshipHeaders(token, pa)
    );
    return response.data;
}

async function fetchTeamFollowState({ token, pa, teamId, starId, channelId }) {
    const normalizedTeamId = parseInt(teamId, 10);
    let normalizedStarId = parseInt(starId, 10);
    const normalizedChannelId = parseInt(channelId, 10);
    if (!normalizedTeamId) {
        return { success: false, msg: '缺少队伍 ID' };
    }

    if (!normalizedStarId && normalizedChannelId) {
        const roomResponse = await postJson(
            'https://pocketapi.48.cn/im/api/v1/im/team/room/info',
            { channelId: String(normalizedChannelId) },
            createFriendshipHeaders(token, pa)
        );
        if (roomResponse.status !== 200 || roomResponse.data?.status !== 200 || roomResponse.data?.success !== true) {
            return apiError(roomResponse);
        }
        normalizedStarId = parseInt(roomResponse.data?.content?.channelInfo?.ownerId, 10);
    }

    if (!normalizedStarId) {
        return { success: false, msg: '缺少队伍服务器所有者 ID' };
    }

    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/im/server/jump',
        { starId: normalizedStarId, tabId: normalizedTeamId, targetType: 2 },
        createFriendshipHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200 && response.data?.success === true) {
        return {
            success: true,
            content: {
                ...(response.data.content || {}),
                serverOwner: normalizedStarId
            }
        };
    }
    return apiError(response);
}

async function fetchLastMessages({ token, pa, serverIdList }) {
    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/team/classic/last/message/get',
        { serverIdList: Array.isArray(serverIdList) ? serverIdList.map(Number) : [Number(serverIdList)] },
        createHeaders(token, pa)
    );
    return response.data;
}

function normalizeFollowSourceId({ memberId, sourceId, toSourceId }) {
    const value = toSourceId ?? sourceId ?? memberId;
    const normalized = parseInt(value, 10);
    return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeFollowSourceType(toType) {
    return Number(toType) === 0 ? 0 : 1;
}

async function followMember({ token, pa, memberId, sourceId, toSourceId, toType = 1 }) {
    const normalizedSourceId = normalizeFollowSourceId({ memberId, sourceId, toSourceId });
    if (!normalizedSourceId) return { success: false, msg: '缺少关注目标 ID' };
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v2/friendships/friends/add',
        { toSourceId: normalizedSourceId, toType: normalizeFollowSourceType(toType) },
        createFriendshipHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200 && response.data?.success === true) {
        return { success: true, content: response.data.content || null };
    }
    return apiError(response);
}

async function unfollowMember({ token, pa, memberId, sourceId, toSourceId, toType = 1 }) {
    const normalizedSourceId = normalizeFollowSourceId({ memberId, sourceId, toSourceId });
    if (!normalizedSourceId) return { success: false, msg: '缺少取关目标 ID' };
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v2/friendships/friends/remove',
        { toSourceId: normalizedSourceId, toType: normalizeFollowSourceType(toType) },
        createFriendshipHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200 && response.data?.success === true) {
        return { success: true, content: response.data.content || null };
    }
    return apiError(response);
}

async function fetchLiveList({ token, pa, groupId = 0, userId = '', next = 0, record = false, debug = false }) {
    const payload = {
        debug: !!debug,
        next: Number(next) || 0,
        record: !!record
    };
    if (userId !== undefined && userId !== null && userId !== '') {
        payload.userId = Number(userId) || String(userId);
    } else {
        payload.groupId = Number(groupId) || 0;
    }

    return postPocketContent(
        'https://pocketapi.48.cn/live/api/v1/live/getLiveList',
        payload,
        { token, pa, headersFactory: createModernHeaders, errorMessage: '获取直播列表失败', largeNumbers: true }
    );
}

async function fetchLiveOne({ token, pa, liveId }) {
    return postPocketContent(
        'https://pocketapi.48.cn/live/api/v1/live/getLiveOne',
        { liveId: String(liveId || '') },
        { token, pa, errorMessage: '获取直播详情失败' }
    );
}

async function fetchLiveResult({ token, pa, liveId }) {
    return postPocketContent(
        'https://pocketapi.48.cn/live/api/v1/live/result',
        { liveId: String(liveId || '') },
        { token, pa, errorMessage: '获取直播结果失败' }
    );
}

async function fetchTripList({ token, pa, groupId = 0, memberId = '', userId = '', lastTime = '0', isMore = false }) {
    const payload = {
        lastTime: String(lastTime || '0'),
        groupId: Number(groupId) || 0,
        isMore: !!isMore
    };
    if (memberId !== undefined && memberId !== null && memberId !== '') payload.memberId = String(memberId);
    if (userId !== undefined && userId !== null && userId !== '') payload.userId = String(userId);

    return postPocketContent(
        'https://pocketapi.48.cn/trip/api/trip/v1/list',
        payload,
        { token, pa, errorMessage: '获取行程失败' }
    );
}

async function fetchAlbumList({ token, pa, ctime = 0, groupId = 0, limit = 20 }) {
    return postPocketContent(
        'https://pocketapi.48.cn/media/api/media/v1/album/list',
        { ctime: Number(ctime) || 0, groupId: Number(groupId) || 0, limit: Number(limit) || 20 },
        { token, pa, errorMessage: '获取专辑列表失败' }
    );
}

async function fetchMeleeWeekRank({ token, pa, rankId, nextId }) {
    const payload = { rankId: Number(rankId) || 0 };
    if (nextId !== undefined && nextId !== null && nextId !== '') payload.nextId = nextId;
    return postPocketContent(
        'https://pocketapi.48.cn/gift/api/v1/melee/rank/getMeleeWeekRank',
        payload,
        { token, pa, errorMessage: '获取乱斗周榜失败', largeNumbers: true }
    );
}

async function fetchMeleeRankPage({ token, pa, rankId, nextId }) {
    const payload = { rankid: Number(rankId) || 0 };
    if (nextId !== undefined && nextId !== null && nextId !== '') payload.nextId = nextId;
    return postPocketContent(
        'https://pocketapi.48.cn/gift/api/v1/melee/rank/getMeleeRankPage',
        payload,
        { token, pa, errorMessage: '获取乱斗榜单失败', largeNumbers: true }
    );
}

async function fetchMeleeYearRankPage({ token, pa, rankId, nextId }) {
    const payload = {};
    if (rankId !== undefined && rankId !== null && rankId !== '') payload.rankid = Number(rankId) || 0;
    if (nextId !== undefined && nextId !== null && nextId !== '') payload.nextId = nextId;
    return postPocketContent(
        'https://pocketapi.48.cn/gift/api/v1/melee/rank/getMeleeYearRankPage',
        payload,
        { token, pa, errorMessage: '获取乱斗年榜失败', largeNumbers: true }
    );
}

async function fetchPersonMeleeRankPage({ token, pa, resId }) {
    return postPocketContent(
        'https://pocketapi.48.cn/gift/api/v1/melee/rank/getPersonMeleeRankPage',
        { resId: Number(resId) || 0 },
        { token, pa, errorMessage: '获取成员鸡腿贡献榜失败', largeNumbers: true }
    );
}

async function fetchPostImageList({ token, pa, userId, nextId = 0, nextTime = 0, limit = 20 }) {
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/v1/posts/img/list',
        {
            nextId: Number(nextId || nextTime) || 0,
            limit: Number(limit) || 20,
            userId: Number(userId) || 0
        },
        { token, pa, headersFactory: createPocketAndroidHeaders, errorMessage: '获取主页相册失败', largeNumbers: true }
    );
}

async function fetchPostVideoList({ token, pa, userId, nextId = 0, limit = 20 }) {
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/v2/posts/video/list',
        {
            nextId: Number(nextId) || 0,
            limit: Number(limit) || 20,
            userId: Number(userId) || 0
        },
        { token, pa, headersFactory: createPocketAndroidHeaders, errorMessage: '获取主页视频失败', largeNumbers: true }
    );
}

async function fetchPostTimelineHome({ token, pa, userId, nextId = 0, limit = 20 }) {
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/v1/posts/timeline/home',
        {
            nextId: Number(nextId) || 0,
            limit: Number(limit) || 20,
            userId: Number(userId) || 0
        },
        { token, pa, headersFactory: createPocketAndroidHeaders, errorMessage: '获取主页动态失败', largeNumbers: true }
    );
}

async function fetchPostTimelineHomeNew({ token, pa, userId, nextId = 0 }) {
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/v1/posts/timeline/home/new',
        {
            nextId: String(nextId || 0),
            userId: Number(userId) || String(userId || '')
        },
        { token, pa, headersFactory: createModernHeaders, errorMessage: '获取成员动态失败', largeNumbers: true }
    );
}

async function fetchChatroomHomeownerMessages({ token, pa, roomId, ownerId, nextTime = 0, needTop1Msg = false }) {
    return postPocketContent(
        'https://pocketapi.48.cn/im/api/v1/chatroom/msg/list/homeowner',
        {
            needTop1Msg: String(!!needTop1Msg),
            roomId: String(roomId || ''),
            ownerId: String(ownerId || ''),
            nextTime: String(nextTime || 0)
        },
        { token, pa, errorMessage: '获取成员房间消息失败' }
    );
}

async function fetchMemberWeiboMessages({ token, pa, ownerId, nextTime = 0, roomId = '' }) {
    return postPocketContent(
        'https://pocketapi.48.cn/im/api/v1/chatroom/msg/list/aim/type',
        {
            extMsgType: 'WEI_BO',
            roomId: String(roomId || ''),
            ownerId: String(ownerId || ''),
            nextTime: Number(nextTime) || 0
        },
        { token, pa, headersFactory: createWeiboHeaders, errorMessage: '获取成员微博失败' }
    );
}

async function fetchMemberDynamicMessages({ token, pa, ownerId, nextTime = 0, roomId = '' }) {
    return postPocketContent(
        'https://pocketapi.48.cn/im/api/v1/chatroom/msg/list/aim/type',
        {
            extMsgType: 'POST_INFO',
            roomId: String(roomId || ''),
            ownerId: String(ownerId || ''),
            nextTime: Number(nextTime) || 0
        },
        { token, pa, headersFactory: createWeiboHeaders, errorMessage: '获取成员动态失败' }
    );
}

async function fetchConversationPage({ token, pa, nextTime = 0, limit = 20 }) {
    if (!token) return missingToken();
    return postPocketContent(
        'https://pocketapi.48.cn/im/api/v1/conversation/page',
        { nextTime: Number(nextTime) || 0, limit: Number(limit) || 20 },
        { token, pa, headersFactory: createModernHeaders, errorMessage: '获取会话列表失败' }
    );
}

async function fetchUserHomeInfo({ token, pa, userId }) {
    const payload = {};
    if (userId !== undefined && userId !== null && userId !== '') payload.userId = String(userId);
    return postPocketContent(
        'https://pocketapi.48.cn/user/api/v1/user/info/home',
        payload,
        { token, pa, headersFactory: createModernHeaders, errorMessage: '获取用户主页信息失败' }
    );
}

async function fetchFlipCustomIndexV1({ token, pa, memberId }) {
    return postPocketContent(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/custom/index',
        { memberId: String(memberId || '') },
        { token, pa, errorMessage: '获取翻牌配置失败' }
    );
}

async function fetchInvoiceTips({ token } = {}) {
    if (!token) return missingToken();
    const response = await fetch('https://pocketapi.48.cn/invoice/api/v1/invoice/tips', {
        headers: createInvoiceHeaders()
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (response.status === 200 && data?.status === 200) {
        return { success: true, content: data.content };
    }
    return { success: false, msg: data?.message || '获取开票提示失败' };
}

async function fetchInvoiceConfig({ token } = {}) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/invoice/api/v1/invoice/config',
        {},
        createInvoiceHeaders(token, { tokenHeader: true }),
        {
            timeoutMs: INVOICE_UPSTREAM_TIMEOUT_MS,
            timeoutMessage: '获取开票配置超时，请稍后重试'
        }
    );
    if (response.status === 200 && response.data?.status === 200) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取开票配置失败');
}

async function fetchInvoiceOrderList({ token, nextTime = '', yearMonth = '' } = {}) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/invoice/api/v1/order/list',
        {
            nextTime: String(nextTime || '0'),
            token,
            yearMonth: String(yearMonth || '')
        },
        createInvoiceHeaders(),
        {
            timeoutMs: INVOICE_UPSTREAM_TIMEOUT_MS,
            timeoutMessage: '获取可开票订单超时，请稍后重试'
        }
    );
    if (response.status === 200 && response.data?.status === 200) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取可开票订单失败');
}

async function applyElectronicInvoice({
    token,
    buyerType = 0,
    buyerName = '',
    buyerTaxNo = '',
    buyerAddress = '',
    buyerPhone = '',
    buyerBankName = '',
    buyerBankAccount = '',
    notifyEmail = '',
    notifyMobile = '',
    orderDataId = []
} = {}) {
    if (!token) return missingToken();

    const ids = Array.isArray(orderDataId)
        ? orderDataId.map(item => String(item || '').trim()).filter(Boolean)
        : [];
    if (!ids.length) return { success: false, msg: '请选择要开票的订单' };
    if (!String(buyerName || '').trim()) return { success: false, msg: '请填写发票抬头' };
    if (!String(notifyEmail || '').trim()) return { success: false, msg: '请填写接收邮箱' };
    if (!String(notifyMobile || '').trim()) return { success: false, msg: '请填写手机号' };

    const normalizedBuyerType = Number(buyerType) === 1 ? 1 : 0;
    if (normalizedBuyerType === 1) {
        const taxNo = String(buyerTaxNo || '').trim();
        if (!/^[A-Z0-9]{6,20}$/.test(taxNo)) {
            return { success: false, msg: '请填写正确的纳税人识别号' };
        }
        if (
            !String(buyerAddress || '').trim()
            || !String(buyerPhone || '').trim()
            || !String(buyerBankName || '').trim()
            || !String(buyerBankAccount || '').trim()
        ) {
            return { success: false, msg: '请填写完整的企业开票信息' };
        }
    }

    const requestPayload = {
        buyerType: normalizedBuyerType,
        buyerName: String(buyerName || '').trim(),
        notifyEmail: String(notifyEmail || '').trim(),
        notifyMobile: String(notifyMobile || '').trim(),
        orderDataId: ids,
        token
    };
    if (normalizedBuyerType === 1) {
        Object.assign(requestPayload, {
            buyerAddress: String(buyerAddress || '').trim(),
            buyerBankAccount: String(buyerBankAccount || '').trim(),
            buyerBankName: String(buyerBankName || '').trim(),
            buyerPhone: String(buyerPhone || '').trim(),
            buyerTaxNo: String(buyerTaxNo || '').trim()
        });
    }

    const response = await postJson(
        'https://pocketapi.48.cn/invoice/api/v1/invoice/apply/electronic',
        requestPayload,
        createInvoiceHeaders()
    );
    if (response.status === 200 && response.data?.status === 200) {
        return {
            success: true,
            content: response.data.content,
            msg: response.data.message || '提交成功'
        };
    }
    return apiError(response, '提交开票申请失败');
}

async function requestElectionVoteApi(method, path, payload = {}, body = {}, options = {}) {
    const response = await fetch(`https://voteapi.48.cn/election-vote/api/v1${path}`, {
        method,
        headers: createElectionVoteHeaders(payload, options),
        body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });
    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (_) {
            return { success: false, msg: `计分 API 返回内容不是 JSON: ${text.replace(/\s+/g, ' ').slice(0, 120)}` };
        }
    }
    if (response.status === 200 && (data?.status === 200 || data?.success)) {
        return { success: true, content: data.content, data };
    }
    return { success: false, msg: data?.message || '计分 API 错误', data };
}

async function loginElectionVote(payload = {}) {
    const appToken = getElectionAppToken(payload);
    if (!appToken) return missingToken();
    return requestElectionVoteApi('POST', '/login/app', payload, {
        appToken,
        nickName: String(payload.nickName || payload.nickname || ''),
        avatar: String(payload.avatar || ''),
        device: String(payload.device || 'iOS;iPhone17,1;7.1.38;26042402'),
        platform: String(payload.platform || 'IOS')
    }, { auth: false, appToken: true });
}

async function fetchElectionVoteStatus(payload = {}) {
    return requestElectionVoteApi('GET', '/vote/status', payload, null, { auth: false });
}

async function fetchElectionActStatus(payload = {}) {
    return requestElectionVoteApi('GET', '/act/status', payload, null, { auth: false });
}

async function fetchElectionUserInfo(payload = {}) {
    if (!getElectionVoteToken(payload)) return missingToken();
    return requestElectionVoteApi('POST', '/userinfo/get', payload, {}, { auth: true });
}

async function fetchElectionVoteHistory(payload = {}) {
    if (!getElectionVoteToken(payload)) return missingToken();
    return requestElectionVoteApi('POST', '/vote/history/list', payload, {
        limit: Number(payload.limit) || 10,
        lastTime: Number(payload.lastTime) || 0
    }, { auth: true });
}

async function fetchElectionCodeActHistory(payload = {}) {
    if (!getElectionVoteToken(payload)) return missingToken();
    return requestElectionVoteApi('POST', '/code/act/history/list', payload, {
        limit: Number(payload.limit) || 10,
        lastTime: Number(payload.lastTime) || 0
    }, { auth: true });
}

async function fetchElectionSgBindStatus(payload = {}) {
    if (!getElectionVoteToken(payload)) return missingToken();
    return requestElectionVoteApi('POST', '/userinfo/check/bind/sg', payload, {}, { auth: true });
}

async function bindElectionSg(payload = {}) {
    if (!getElectionVoteToken(payload)) return missingToken();
    return requestElectionVoteApi('POST', '/bind/sg', payload, {
        clientId: String(payload.clientId || '20260518001'),
        platform: String(payload.platform || 'IOS'),
        code: String(payload.code || ''),
        device: String(payload.device || 'iOS;iPhone17,1;7.1.38;26042402')
    }, { auth: true, appToken: true });
}

async function fetchPageantryRareTreasures({ token, pa } = {}) {
    if (!token) return missingToken();
    return postPocketContent(
        'https://pocketapi.48.cn/ai-fairyland/api/pageantry/2026/v1/rare_treasure/list',
        {},
        { token, pa, headersFactory: createPageantryHeaders, errorMessage: '获取稀有宝物列表失败' }
    );
}

async function fetchPageantryBuyStarList({ token, pa, starId = '', starName = '' } = {}) {
    if (!token) return missingToken();
    return postPocketContent(
        'https://pocketapi.48.cn/ai-fairyland/api/pageantry/2026/v1/get/buy_star/list',
        { starId: String(starId || ''), starName: String(starName || '') },
        { token, pa, headersFactory: createPageantryHeaders, errorMessage: '获取计分成员列表失败' }
    );
}

async function fetchPageantryHonorCardInfo({ token, pa, userId, sortType = 0 } = {}) {
    if (!token) return missingToken();
    if (!userId) return { success: false, msg: '缺少用户 ID' };
    return postPocketContent(
        'https://pocketapi.48.cn/ai-fairyland/api/pageantry/2026/v1/user/honor/card/info',
        {
            sortType: Number(sortType) || 0,
            userId: String(userId)
        },
        { token, pa, headersFactory: createPocketAndroidHeaders, errorMessage: '获取荣耀卡失败', largeNumbers: true }
    );
}

async function fetchArea48Newest({ token, pa, nextId = 0 } = {}) {
    if (!token) return missingToken();
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/v1/area48/data/newest/new',
        { nextId: Number(nextId) || 0 },
        {
            token,
            pa,
            headersFactory: createArea48Headers,
            errorMessage: '获取社区动态失败',
            largeNumbers: true
        }
    );
}

async function fetchArea48Recommend({ token, pa, nextId = 0 } = {}) {
    if (!token) return missingToken();
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/v1/area48/data/recommend/new',
        { nextId: Number(nextId) || 0 },
        {
            token,
            pa,
            headersFactory: createArea48Headers,
            errorMessage: '获取社区推荐失败',
            largeNumbers: true
        }
    );
}

async function fetchArea48TopicInfo({ token, pa, topicId } = {}) {
    if (!token) return missingToken();
    if (!topicId) return { success: false, msg: '缺少话题 ID' };
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/topic/info',
        { topicId: String(topicId) },
        {
            token,
            pa,
            headersFactory: createArea48Headers,
            errorMessage: '获取话题信息失败',
            largeNumbers: true
        }
    );
}

async function fetchArea48TopicHotPosts({ token, pa, topicId } = {}) {
    if (!token) return missingToken();
    if (!topicId) return { success: false, msg: '缺少话题 ID' };
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/topic/posts/list/hot',
        { topicId: String(topicId) },
        {
            token,
            pa,
            headersFactory: createArea48Headers,
            errorMessage: '获取话题热门失败',
            largeNumbers: true
        }
    );
}

async function fetchArea48TopicNewestPosts({ token, pa, topicId, nextId = 0, limit = 20 } = {}) {
    if (!token) return missingToken();
    if (!topicId) return { success: false, msg: '缺少话题 ID' };
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/topic/posts/list/newest',
        {
            nextId: String(nextId || 0),
            topicId: String(topicId),
            limit: Number(limit) || 20
        },
        {
            token,
            pa,
            headersFactory: createArea48Headers,
            errorMessage: '获取话题最新失败',
            largeNumbers: true
        }
    );
}

async function fetchArea48Comments({ token, pa, resourceId, next = 0 } = {}) {
    if (!token) return missingToken();
    if (!resourceId) return { success: false, msg: '缺少帖子 ID' };
    return postPocketContent(
        'https://pocketapi.48.cn/comment/api/v1/comment/level1/getCommentList',
        {
            next: next ? String(next) : 0,
            resourceId: String(resourceId),
            resourceMd: 'md',
            resourceType: 1002
        },
        {
            token,
            pa,
            headersFactory: createArea48Headers,
            errorMessage: '获取评论失败',
            largeNumbers: true
        }
    );
}

async function fetchArea48PostDetails({ token, pa, postId } = {}) {
    if (!token) return missingToken();
    if (!postId) return { success: false, msg: '缺少帖子 ID' };
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/v1/posts/details',
        {
            needViewer: true,
            needComment: true,
            postId: String(postId)
        },
        {
            token,
            pa,
            headersFactory: createArea48Headers,
            errorMessage: '获取帖子详情失败',
            largeNumbers: true
        }
    );
}

async function addArea48Comment({ token, pa, resourceId, commentMsg, commentUrl = '' } = {}) {
    if (!token) return missingToken();
    if (!resourceId) return { success: false, msg: '缺少帖子 ID' };
    const normalizedMsg = String(commentMsg || '').trim();
    if (!normalizedMsg) return { success: false, msg: '请输入评论内容' };
    return postPocketContent(
        'https://pocketapi.48.cn/comment/api/v1/comment/addComment',
        {
            resourceId: String(resourceId),
            commentMsg: normalizedMsg,
            commentUrl: String(commentUrl || ''),
            resourceMd: 'md',
            resourceType: 1002
        },
        {
            token,
            pa,
            headersFactory: createArea48Headers,
            errorMessage: '发送评论失败',
            largeNumbers: true
        }
    );
}

async function deleteArea48Comment({ token, pa, resourceId } = {}) {
    if (!token) return missingToken();
    if (!resourceId) return { success: false, msg: '缺少评论 ID' };
    return postPocketContent(
        'https://pocketapi.48.cn/comment/api/v1/comment/delComment',
        {
            resourceId: String(resourceId),
            resourceMd: '',
            resourceType: 1003
        },
        {
            token,
            pa,
            headersFactory: createArea48Headers,
            errorMessage: '删除评论失败',
            largeNumbers: true
        }
    );
}

async function createArea48Post({ token, pa, title = '', content = '', topicArray = '', extInfo = '' } = {}) {
    if (!token) return missingToken();
    const normalizedContent = String(content || '').trim();
    if (!normalizedContent) return { success: false, msg: '请输入正文' };
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/v1/posts/create',
        {
            topicArray: String(topicArray || ''),
            postSource: '1',
            title: String(title || '').trim(),
            content: normalizedContent,
            extInfo: String(extInfo || '')
        },
        {
            token,
            pa,
            headersFactory: createArea48Headers,
            errorMessage: '发布动态失败',
            largeNumbers: true
        }
    );
}

async function fetchScoreOfficialBundle(payload = {}) {
    const actions = [
        ['voteStatus', () => fetchElectionVoteStatus(payload)],
        ['actStatus', () => fetchElectionActStatus(payload)],
        ['rareTreasures', () => fetchPageantryRareTreasures(payload)],
        ['buyStarList', () => fetchPageantryBuyStarList(payload)]
    ];
    if (getElectionVoteToken(payload)) {
        actions.push(
            ['userInfo', () => fetchElectionUserInfo(payload)],
            ['sgBindStatus', () => fetchElectionSgBindStatus(payload)],
            ['voteHistory', () => fetchElectionVoteHistory(payload)],
            ['codeActHistory', () => fetchElectionCodeActHistory(payload)]
        );
    }
    const content = {};
    await Promise.all(actions.map(async ([key, fn]) => {
        try {
            content[key] = await fn();
        } catch (error) {
            content[key] = { success: false, msg: error.message || '计分 API 错误' };
        }
    }));
    return { success: true, content };
}

async function runScoreOfficialAction(payload = {}) {
    const action = String(payload.action || payload.type || '').trim();
    const actionPayload = payload.payload && typeof payload.payload === 'object'
        ? { ...payload, ...payload.payload }
        : payload;
    const handlers = {
        'vote-login': loginElectionVote,
        'vote-status': fetchElectionVoteStatus,
        'act-status': fetchElectionActStatus,
        userinfo: fetchElectionUserInfo,
        'vote-history': fetchElectionVoteHistory,
        'code-act-history': fetchElectionCodeActHistory,
        'check-sg-bind': fetchElectionSgBindStatus,
        'bind-sg': bindElectionSg,
        'rare-treasure-list': fetchPageantryRareTreasures,
        'buy-star-list': fetchPageantryBuyStarList,
        bundle: fetchScoreOfficialBundle
    };
    const handler = handlers[action];
    if (!handler) return { success: false, msg: `未知计分动作: ${action || '-'}` };
    return handler(actionPayload);
}

const pocketMethods = Object.freeze({
    loginSendSms,
    loginByCode,
    loginCheckToken,
    loginCreateQr,
    loginPollQr,
    loginCancelQr,
    loginQrStatus,
    checkIn,
    switchBigSmall,
    fetchRoomMessages,
    fetchPrivateMessageList,
    fetchPrivateMessageInfo,
    deletePrivateMessage,
    sendPrivateMessageReply,
    fetchFlipList,
    fetchStarArchives,
    fetchStarHistory,
    fetchOpenLive,
    fetchOpenLiveOne,
    fetchOpenLivePublicList,
    fetchSeinePerformanceList,
    fetchMeet48LiveList,
    fetchMeet48LiveOne,
    fetchOpenLiveParticipants,
    fetchFlipPrices,
    sendFlipQuestion,
    operateFlipQuestion,
    fetchMemberPhotos,
    fetchUserMoney,
    fetchInvoiceTips,
    fetchInvoiceConfig,
    fetchInvoiceOrderList,
    applyElectronicInvoice,
    fetchCheckinToday,
    fetchUnreadMessageCount,
    editUserInfo,
    uploadUserAvatar,
    uploadPrivateMessageImage,
    fetchUserRenameCount,
    fetchUserPictureFrames,
    fetchClientGroupTeamStarUpdate,
    fetchStarServerMap,
    fetchMediaCollectionTotalCount,
    sendLiveGift,
    fetchGiftList,
    getNimLoginInfo,
    fetchRoomAlbum,
    fetchRoomRadio,
    fetchSeineServerDetail,
    fetchLiveRank,
    fetchFriendsIds,
    fetchTeamFollowState,
    fetchLastMessages,
    followMember,
    unfollowMember,
    fetchLiveList,
    fetchLiveOne,
    fetchLiveResult,
    fetchTripList,
    fetchAlbumList,
    fetchMeleeWeekRank,
    fetchMeleeRankPage,
    fetchMeleeYearRankPage,
    fetchPersonMeleeRankPage,
    fetchPostImageList,
    fetchPostVideoList,
    fetchPostTimelineHome,
    fetchPostTimelineHomeNew,
    fetchChatroomHomeownerMessages,
    fetchMemberWeiboMessages,
    fetchMemberDynamicMessages,
    fetchConversationPage,
    fetchUserHomeInfo,
    fetchFlipCustomIndexV1,
    fetchArea48Newest,
    fetchArea48Recommend,
    fetchArea48TopicInfo,
    fetchArea48TopicHotPosts,
    fetchArea48TopicNewestPosts,
    fetchArea48Comments,
    fetchArea48PostDetails,
    addArea48Comment,
    deleteArea48Comment,
    createArea48Post,
    fetchPocketMaskWords,
    loginElectionVote,
    fetchElectionVoteStatus,
    fetchElectionActStatus,
    fetchElectionUserInfo,
    fetchElectionVoteHistory,
    fetchElectionCodeActHistory,
    fetchElectionSgBindStatus,
    bindElectionSg,
    fetchPageantryRareTreasures,
    fetchPageantryBuyStarList,
    fetchPageantryHonorCardInfo,
    fetchScoreOfficialBundle,
    runScoreOfficialAction
});

export const pocketChannelMethods = POCKET_CHANNEL_METHODS;

export const pocketChannels = Object.freeze(Object.fromEntries(
    Object.entries(pocketChannelMethods).map(([channel, method]) => [channel, pocketMethods[method]])
));

export function hasPocketChannel(channel) {
    return Object.prototype.hasOwnProperty.call(pocketChannels, channel);
}

export async function invokePocketChannel(channel, payload = {}, env = {}) {
    const handler = pocketChannels[channel];
    if (!handler) {
        throw new Error(`不支持的 Pocket 通道: ${channel || '-'}`);
    }
    return handler(payload || {}, env || {});
}
