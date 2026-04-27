const fs = require('fs');
const axios = require('axios');
const QRCode = require('qrcode');
const { ensureStoragePaths } = require('../../common/storage-paths');

const BILIBILI_COOKIE_SETTING_KEY = 'bilibiliCookie';
const BILIBILI_USER_SETTING_KEY = 'bilibiliUserInfo';
const BILIBILI_LOGIN_POLL_MESSAGES = {
    0: '登录成功',
    86038: '二维码已过期',
    86090: '已扫码，请在手机上确认登录',
    86101: '等待扫码'
};

const BILIBILI_HEADERS = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    Referer: 'https://live.bilibili.com/',
    Origin: 'https://live.bilibili.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
};

function normalizeRoomId(input) {
    const digits = String(input || '').trim().replace(/[^\d]/g, '');
    if (!digits) {
        throw new Error('请输入有效的 B 站直播间号');
    }
    return digits;
}

function normalizeBilibiliRequestError(error) {
    const status = Number(error?.response?.status || 0);
    const apiCode = Number(error?.response?.data?.code);
    const apiMessage = String(error?.response?.data?.message || '').trim();

    if (status === 412 || apiCode === -412 || /request was banned/i.test(apiMessage)) {
        return new Error('B站接口请求被拦截，请稍后再试或检查代理/IP环境');
    }

    if (error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))) {
        return new Error('B站接口请求超时，请稍后重试');
    }

    if (status) {
        return new Error(apiMessage || `B站接口请求失败，状态码 ${status}`);
    }

    return new Error(error?.message || 'B站接口请求失败');
}

function assertBilibiliResponseAllowed(data) {
    const apiCode = Number(data?.code);
    const apiMessage = String(data?.message || '').trim();

    if (apiCode === -412 || /request was banned/i.test(apiMessage)) {
        throw new Error('B站接口请求被拦截，请稍后再试或检查代理/IP环境');
    }
}

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
    const tempFilePath = `${filePath}.tmp`;
    fs.writeFileSync(tempFilePath, JSON.stringify(value, null, 2), 'utf8');
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    fs.renameSync(tempFilePath, filePath);
}

function readSettingsSafe() {
    return readJsonFileSafe(ensureStoragePaths().settingsFile, {});
}

function updateSettingsSafe(updater) {
    const storagePaths = ensureStoragePaths();
    const current = readJsonFileSafe(storagePaths.settingsFile, {});
    const next = typeof updater === 'function' ? updater({ ...current }) || current : current;
    writeJsonFileSafe(storagePaths.settingsFile, next);
    return next;
}

function getStoredBilibiliCookie() {
    const settings = readSettingsSafe();
    return typeof settings[BILIBILI_COOKIE_SETTING_KEY] === 'string'
        ? settings[BILIBILI_COOKIE_SETTING_KEY].trim()
        : '';
}

function buildBilibiliHeaders(referer = BILIBILI_HEADERS.Referer, includeCookie = true) {
    const headers = {
        ...BILIBILI_HEADERS,
        Referer: referer
    };
    const cookie = includeCookie ? getStoredBilibiliCookie() : '';
    if (cookie) {
        headers.Cookie = cookie;
    }
    return headers;
}

function buildCookieMapFromSetCookie(setCookieHeader = []) {
    const cookieMap = {};
    const cookieRows = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    cookieRows.forEach((row) => {
        const [pair] = String(row || '').split(';');
        const separatorIndex = pair.indexOf('=');
        if (separatorIndex <= 0) return;
        const name = pair.slice(0, separatorIndex).trim();
        const value = pair.slice(separatorIndex + 1).trim();
        if (name && value) {
            cookieMap[name] = value;
        }
    });
    return cookieMap;
}

function buildCookieMapFromLoginUrl(rawUrl = '') {
    const cookieMap = {};
    try {
        const url = new URL(rawUrl);
        ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid'].forEach((key) => {
            const value = url.searchParams.get(key);
            if (value) {
                cookieMap[key] = encodeURIComponent(value);
            }
        });
    } catch (error) {
    }
    return cookieMap;
}

function cookieMapToString(cookieMap = {}) {
    const preferredOrder = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid', 'buvid3', 'buvid4', 'b_nut'];
    const keys = [
        ...preferredOrder.filter(key => cookieMap[key]),
        ...Object.keys(cookieMap).filter(key => !preferredOrder.includes(key))
    ];
    return keys.map(key => `${key}=${cookieMap[key]}`).join('; ');
}

function saveBilibiliLogin(cookie, userInfo = null) {
    const normalizedCookie = String(cookie || '').trim();
    if (!normalizedCookie) {
        throw new Error('B站登录 Cookie 为空');
    }

    updateSettingsSafe((settings) => {
        settings[BILIBILI_COOKIE_SETTING_KEY] = normalizedCookie;
        if (userInfo) {
            settings[BILIBILI_USER_SETTING_KEY] = userInfo;
        }
        return settings;
    });
}

function clearBilibiliLogin() {
    updateSettingsSafe((settings) => {
        delete settings[BILIBILI_COOKIE_SETTING_KEY];
        delete settings[BILIBILI_USER_SETTING_KEY];
        return settings;
    });
}

function normalizeBilibiliUser(navData = {}) {
    const data = navData?.data || {};
    return {
        mid: String(data.mid || ''),
        uname: String(data.uname || '').trim(),
        face: String(data.face || '').trim(),
        vipStatus: Number(data.vipStatus || 0),
        vipType: Number(data.vipType || 0)
    };
}

async function fetchBilibiliNav(cookie = getStoredBilibiliCookie()) {
    if (!cookie) {
        return { success: false, msg: '未登录B站' };
    }

    try {
        const response = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
            headers: {
                ...buildBilibiliHeaders('https://www.bilibili.com/', false),
                Cookie: cookie
            },
            timeout: 15000
        });

        if (response.data?.code === 0 && response.data?.data?.isLogin) {
            const userInfo = normalizeBilibiliUser(response.data);
            saveBilibiliLogin(cookie, userInfo);
            return { success: true, userInfo };
        }

        return { success: false, msg: response.data?.message || 'B站登录状态已失效' };
    } catch (error) {
        return { success: false, msg: normalizeBilibiliRequestError(error).message };
    }
}

async function createBilibiliLoginQrcode() {
    try {
        const response = await axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/generate', {
            headers: buildBilibiliHeaders('https://passport.bilibili.com/', false),
            timeout: 15000
        });
        const data = response.data?.data || {};
        if (response.data?.code === 0 && data.url && data.qrcode_key) {
            const qrDataUrl = await QRCode.toDataURL(data.url, {
                errorCorrectionLevel: 'M',
                margin: 2,
                width: 180
            });
            return {
                success: true,
                url: data.url,
                qrcodeKey: data.qrcode_key,
                qrDataUrl
            };
        }

        return { success: false, msg: response.data?.message || 'B站二维码生成失败' };
    } catch (error) {
        return { success: false, msg: normalizeBilibiliRequestError(error).message };
    }
}

async function pollBilibiliLoginQrcode(qrcodeKey) {
    const normalizedKey = String(qrcodeKey || '').trim();
    if (!normalizedKey) {
        return { success: false, msg: '缺少二维码登录凭证' };
    }

    try {
        const response = await axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/poll', {
            params: { qrcode_key: normalizedKey },
            headers: buildBilibiliHeaders('https://passport.bilibili.com/', false),
            timeout: 15000
        });
        const data = response.data?.data || {};
        const code = Number(data.code);
        const message = BILIBILI_LOGIN_POLL_MESSAGES[code] || data.message || response.data?.message || '登录状态未知';

        if (code !== 0) {
            return {
                success: true,
                loggedIn: false,
                code,
                expired: code === 86038,
                confirmed: code === 86090,
                msg: message
            };
        }

        const cookieMap = {
            ...buildCookieMapFromLoginUrl(data.url),
            ...buildCookieMapFromSetCookie(response.headers['set-cookie'])
        };
        const cookie = cookieMapToString(cookieMap);
        if (!cookie || !cookie.includes('SESSDATA')) {
            return { success: false, msg: 'B站登录成功但未获取到有效 Cookie' };
        }

        const navResult = await fetchBilibiliNav(cookie);
        if (!navResult.success) {
            saveBilibiliLogin(cookie);
        }

        return {
            success: true,
            loggedIn: true,
            code,
            msg: '登录成功',
            userInfo: navResult.userInfo || null
        };
    } catch (error) {
        return { success: false, msg: normalizeBilibiliRequestError(error).message };
    }
}

async function getBilibiliLoginStatus() {
    const cookie = getStoredBilibiliCookie();
    if (!cookie) {
        return { success: true, loggedIn: false, msg: '未登录B站' };
    }

    const navResult = await fetchBilibiliNav(cookie);
    if (navResult.success) {
        return { success: true, loggedIn: true, userInfo: navResult.userInfo };
    }

    return { success: true, loggedIn: false, msg: navResult.msg || 'B站登录状态已失效' };
}

function logoutBilibili() {
    clearBilibiliLogin();
    return { success: true };
}

async function requestBilibili(url, params, referer = BILIBILI_HEADERS.Referer) {
    try {
        const response = await axios.get(url, {
            params,
            headers: buildBilibiliHeaders(referer, true),
            timeout: 15000
        });
        assertBilibiliResponseAllowed(response.data);
        return response.data;
    } catch (error) {
        if (error && !error.isAxiosError) {
            throw error;
        }
        throw normalizeBilibiliRequestError(error);
    }
}

function buildCandidateUrl(stream = {}, format = {}, codec = {}) {
    const baseUrl = String(codec.base_url || '').trim();
    if (!baseUrl) return [];

    return (codec.url_info || [])
        .map(info => {
            const host = String(info.host || '').trim();
            const extra = String(info.extra || '').trim();
            if (!host) return null;
            return {
                url: `${host}${baseUrl}${extra}`,
                host,
                protocolName: String(stream.protocol_name || '').trim(),
                formatName: String(format.format_name || '').trim(),
                codecName: codec.codec_name || '',
                currentQn: Number(codec.current_qn || 0),
                acceptQn: Array.isArray(codec.accept_qn) ? codec.accept_qn.map(item => Number(item || 0)) : []
            };
        })
        .filter(Boolean);
}

function scoreCandidate(candidate) {
    let score = 0;
    if (candidate.formatName === 'flv') score += 1000;
    else if (candidate.formatName === 'fmp4') score += 600;
    else if (candidate.formatName === 'ts') score += 400;

    if (candidate.protocolName === 'http_stream') score += 80;
    else if (candidate.protocolName === 'http_hls') score += 40;

    if (candidate.codecName === 'avc') score += 100;
    else if (candidate.codecName === 'hevc') score += 60;

    score += candidate.currentQn || 0;
    if (candidate.acceptQn.includes(10000)) score += 20;
    if (/gotcha/i.test(candidate.host || '')) score += 5;
    return score;
}

function pickLiveCandidates(playurl = {}) {
    const candidates = [];

    (playurl.stream || []).forEach(stream => {
        (stream.format || []).forEach(format => {
            (format.codec || []).forEach(codec => {
                candidates.push(...buildCandidateUrl(stream, format, codec));
            });
        });
    });

    if (!candidates.length) return [];

    candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

    const seen = new Set();
    return candidates.filter(candidate => {
        if (!candidate?.url || seen.has(candidate.url)) return false;
        seen.add(candidate.url);
        return true;
    });
}

async function getBilibiliLiveStatus(roomIdInput) {
    const roomId = normalizeRoomId(roomIdInput);

    try {
        const initData = await requestBilibili('https://api.live.bilibili.com/room/v1/Room/room_init', {
            id: roomId
        });

        if (initData?.code !== 0 || !initData?.data?.room_id) {
            return {
                requestedRoomId: roomId,
                realRoomId: '',
                live: false,
                liveStatus: 0,
                error: initData?.message || '未找到直播间'
            };
        }

        return {
            requestedRoomId: roomId,
            realRoomId: String(initData.data.room_id || roomId),
            live: Number(initData.data.live_status) === 1,
            liveStatus: Number(initData.data.live_status || 0),
            error: ''
        };
    } catch (error) {
        return {
            requestedRoomId: roomId,
            realRoomId: '',
            live: false,
            liveStatus: 0,
            error: error.message || '状态获取失败'
        };
    }
}

async function getBilibiliLiveStatuses(roomIds = []) {
    const normalizedRoomIds = Array.from(
        new Set(
            (Array.isArray(roomIds) ? roomIds : [])
                .map(roomId => {
                    try {
                        return normalizeRoomId(roomId);
                    } catch (error) {
                        return '';
                    }
                })
                .filter(Boolean)
        )
    );

    const results = await Promise.all(normalizedRoomIds.map(roomId => getBilibiliLiveStatus(roomId)));
    return results;
}

async function resolveBilibiliLive(roomIdInput) {
    const roomId = normalizeRoomId(roomIdInput);

    const initData = await requestBilibili('https://api.live.bilibili.com/room/v1/Room/room_init', {
        id: roomId
    }, `https://live.bilibili.com/${roomId}`);

    if (initData?.code !== 0 || !initData?.data?.room_id) {
        throw new Error(initData?.message || '未找到对应的 B 站直播间');
    }

    const realRoomId = String(initData.data.room_id);
    if (Number(initData.data.live_status) !== 1) {
        throw new Error('该直播间当前未开播');
    }

    const playInfo = await requestBilibili(
        'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo',
        {
            room_id: realRoomId,
            protocol: '0,1',
            format: '0,1,2',
            codec: '0,1',
            qn: 10000,
            platform: 'web',
            ptype: 8
        },
        `https://live.bilibili.com/${realRoomId}`
    );

    if (playInfo?.code !== 0 || !playInfo?.data) {
        throw new Error(playInfo?.message || '获取 B 站直播流失败');
    }

    const streamCandidates = pickLiveCandidates(playInfo.data.playurl_info?.playurl);
    if (!streamCandidates.length) {
        throw new Error('未找到可用的直播播放地址');
    }

    const roomInfo = playInfo.data.room_info || {};
    const anchorInfo = playInfo.data.anchor_info?.base_info || {};

    return {
        requestedRoomId: roomId,
        realRoomId,
        title: String(roomInfo.title || '').trim() || `B站直播 ${realRoomId}`,
        uname: String(anchorInfo.uname || roomInfo.uname || '').trim(),
        face: String(anchorInfo.face || '').trim(),
        areaName: String(roomInfo.area_name || '').trim(),
        parentAreaName: String(roomInfo.parent_area_name || '').trim(),
        streamUrl: streamCandidates[0].url,
        streamCandidates: streamCandidates.map(item => ({
            url: item.url,
            host: item.host,
            protocolName: item.protocolName,
            formatName: item.formatName,
            codecName: item.codecName,
            currentQn: item.currentQn
        })),
        proxyHeaders: {
            'User-Agent': BILIBILI_HEADERS['User-Agent'],
            Referer: `https://live.bilibili.com/${realRoomId}`,
            Origin: BILIBILI_HEADERS.Origin,
            ...(getStoredBilibiliCookie() ? { Cookie: getStoredBilibiliCookie() } : {})
        }
    };
}

module.exports = {
    resolveBilibiliLive,
    getBilibiliLiveStatuses,
    createBilibiliLoginQrcode,
    pollBilibiliLoginQrcode,
    getBilibiliLoginStatus,
    logoutBilibili
};
