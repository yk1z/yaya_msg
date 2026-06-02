const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const settingsService = require('./settings-service');
const { ensureWasmLoaded, generatePa } = require('./wasm-service');

const APP_VERSION = '7.0.41';
const APP_BUILD = '24011601';
const DEVICE_ID = createDeviceId();
const MEET48_APP_VERSION = '2.0.3';
const MEET48_APP_BUILD = '2602062';
const MEET48_BUNDLE_ID = 'com.dapp.meet48';
const MEET48_APP_ID = '2e63a31eac9d056755b0f83b89ef6674';

function createDeviceId() {
    const chars = 'QWERTYUIOPASDFGHJKLZXCVBNM1234567890';
    const randomString = (length) => {
        let result = '';
        for (let i = 0; i < length; i += 1) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    };

    return `${randomString(8)}-${randomString(4)}-${randomString(4)}-${randomString(4)}-${randomString(12)}`;
}

function createHeaders(token, pa) {
    const headers = {
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': `PocketFans201807/${APP_VERSION} (iPhone; iOS 16.3.1; Scale/2.00)`,
        Host: 'pocketapi.48.cn',
        'Accept-Language': 'zh-Hans-CN;q=1',
        appInfo: JSON.stringify({
            vendor: 'apple',
            deviceId: DEVICE_ID,
            appVersion: APP_VERSION,
            appBuild: APP_BUILD,
            osVersion: '16.3.1',
            osType: 'ios',
            deviceName: 'iPhone XR',
            os: 'ios'
        })
    };

    if (token) {
        headers.token = token;
    }

    if (pa) {
        headers.pa = pa;
    }

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
    headers['Content-Type'] = 'application/json;charset=utf-8';

    delete headers.Origin;
    delete headers.Referer;

    return headers;
}

function createCheckinHeaders(token, pa) {
    const headers = createModernHeaders(token, pa);
    headers['P-Sign-Type'] = 'V0';
    return headers;
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

function createInvoiceHeaders(token, pa) {
    const options = pa && typeof pa === 'object' ? pa : {};
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

function createMeet48Headers() {
    const storedAuth = settingsService.readSettings().meet48Auth || {};
    const authDisabled = storedAuth.disabled === true;
    const deviceId = (!authDisabled && storedAuth.deviceId) || process.env.MEET48_DEVICE_ID || createDeviceId();
    const headers = {
        'content-type': 'application/json',
        accept: '*/*',
        'accept-language': 'zh_TW',
        'user-agent': `Meet48/${MEET48_APP_VERSION} (${MEET48_BUNDLE_ID}; build:${MEET48_APP_BUILD}; iOS 26.4.2) Alamofire/5.8.0`,
        'x-versioncode': MEET48_APP_VERSION,
        'x-app-id': MEET48_APP_ID,
        'x-device-info': JSON.stringify({
            appVersion: MEET48_APP_VERSION,
            deviceId,
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
        'x-deviceid': deviceId,
        'x-custom-device-type': 'IOS'
    };
    const token = authDisabled ? '' : (storedAuth.token || process.env.MEET48_TOKEN || '');
    const cookie = authDisabled ? '' : (storedAuth.cookie || process.env.MEET48_COOKIE || '');
    if (token) {
        headers.token = token;
    }
    if (cookie) {
        headers.cookie = cookie;
    }
    return headers;
}

async function createLoginHeaders() {
    await ensureWasmLoaded();

    const headers = createHeaders();
    const pa = generatePa();
    if (pa) {
        headers.pa = pa;
    }

    return headers;
}

function missingToken() {
    return { success: false, msg: '缺少 Token' };
}

function apiError(response, fallback = 'API 错误') {
    const data = response && response.data;
    const message = data && (
        data.message
        || data.msg
        || data.error
        || data.errMsg
        || data.errmsg
    );
    const status = data && (data.status || data.code || data.errCode);
    return {
        success: false,
        msg: message || (status ? `${fallback} (${status})` : fallback),
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

    try {
        const config = { headers: headersFactory(token, pa) };
        if (largeNumbers) {
            config.transformResponse = [transformLargeNumberResponse];
        }

        const response = await axios.post(url, payload || {}, config);
        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.success)) {
            return { success: true, content: response.data.content, data: response.data };
        }

        return apiError(response, errorMessage);
    } catch (error) {
        const data = error && error.response && error.response.data;
        const message = data && (
            data.message
            || data.msg
            || data.error
            || data.errMsg
            || data.errmsg
        );
        return {
            success: false,
            msg: message || (error && error.message) || errorMessage,
            data
        };
    }
}

async function resolveServerId(channelId, headers, warningMessage) {
    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/im/api/v1/im/team/room/info',
            { channelId: String(channelId) },
            { headers }
        );

        if (response.data.success) {
            return response.data.content.serverId;
        }
    } catch (error) {
        console.warn(warningMessage);
    }

    return null;
}

function transformLargeNumberResponse(data) {
    if (typeof data !== 'string') {
        return data;
    }

    const fixedData = data.replace(/:\s*([0-9]{15,})/g, ':"$1"');
    try {
        return JSON.parse(fixedData);
    } catch (error) {
        return data;
    }
}

async function loginSendSms({ mobile, area, answer }) {
    try {
        const payload = {
            mobile,
            area: area || '86'
        };

        if (answer) {
            payload.answer = answer;
        }

        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/sms/send2',
            payload,
            { headers: createHeaders() }
        );

        if (response.status === 200 && response.data.status === 200) {
            return { success: true };
        }

        if (response.data.status === 2001) {
            try {
                const verificationData = JSON.parse(response.data.message);
                return {
                    success: false,
                    needVerification: true,
                    question: verificationData.question,
                    options: verificationData.answer
                };
            } catch (error) {
                return { success: false, msg: `验证数据解析失败: ${response.data.message}` };
            }
        }

        return { success: false, msg: response.data.message || '发送失败' };
    } catch (error) {
        return { success: false, msg: `网络错误: ${error.message}` };
    }
}

async function loginByCode({ mobile, code }) {
    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/login/app/mobile/code',
            { mobile, code },
            { headers: await createLoginHeaders() }
        );

        return response.data;
    } catch (error) {
        console.error('登录错误:', error);
        return { status: 500, message: error.message };
    }
}

async function loginCheckToken({ token, pa }) {
    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/user/info/reload',
            { from: 'appstart' },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data.success) {
            const content = response.data.content;
            const finalInfo = content.userInfo || content;

            if (content.bigSmallInfo) {
                finalInfo.bigSmallInfo = content.bigSmallInfo;
            }

            return { success: true, userInfo: finalInfo };
        }

        return { success: false, msg: response.data.message || 'Token 无效' };
    } catch (error) {
        return { success: false, msg: `验证失败: ${error.message}` };
    }
}

async function checkIn({ token, pa }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/checkin',
            {},
            { headers: createCheckinHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && (response.data.success || response.data.status === 200)) {
            return {
                success: true,
                msg: response.data.message || '签到成功',
                content: response.data.content || null
            };
        }

        return {
            success: false,
            msg: response?.data?.message || '签到失败',
            status: response?.data?.status
        };
    } catch (error) {
        const responseMessage = error?.response?.data?.message;
        const responseStatus = error?.response?.data?.status;

        return {
            success: false,
            msg: responseMessage || error.message,
            status: responseStatus
        };
    }
}

async function switchBigSmall({ token, pa, targetUserId }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/bigsmall/switch/user',
            { toUserId: targetUserId },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response);
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchRoomMessages({ channelId, serverId, token, pa, nextTime = 0, fetchAll = false }) {
    if (!token) {
        return missingToken();
    }

    try {
        const headers = createHeaders(token, pa);
        let finalServerId = serverId;

        if (!finalServerId || finalServerId === 0) {
            const resolvedServerId = await resolveServerId(channelId, headers, 'ServerID 自动获取失败');
            if (resolvedServerId) {
                finalServerId = resolvedServerId;
            }
        }

        const url = fetchAll
            ? 'https://pocketapi.48.cn/im/api/v1/team/message/list/all'
            : 'https://pocketapi.48.cn/im/api/v1/team/message/list/homeowner';

        const response = await axios.post(
            url,
            {
                channelId: parseInt(channelId, 10),
                serverId: parseInt(finalServerId, 10),
                nextTime,
                limit: 50
            },
            { headers }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, data: response.data, usedServerId: finalServerId };
        }

        return apiError(response);
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchPrivateMessageList({ token, pa, lastTime }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/message/api/v1/user/message/list',
            {
                lastTime: Number(lastTime) || Date.now()
            },
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取私信列表失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchPrivateMessageInfo({ token, pa, targetUserId, lastTime = 0 }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/message/api/v1/user/message/info',
            {
                lastTime: Number(lastTime) || 0,
                targetUserId: String(targetUserId)
            },
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取私信详情失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function sendPrivateMessageReply({ token, pa, targetUserId, text }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/message/api/v1/user/message/reply',
            {
                messageType: 'TEXT',
                text: String(text || ''),
                targetUserId: String(targetUserId)
            },
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '发送私信失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchFlipList({ token, pa, beginLimit = 0, limit = 20 }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question/list',
            {
                status: 0,
                beginLimit,
                limit,
                memberId: ''
            },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response);
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchStarArchives({ token, pa, memberId }) {
    if (!token) {
        return missingToken();
    }

    if (!memberId || memberId === 'undefined') {
        return { success: false, msg: '未获取到有效的成员ID，请重新搜索选择' };
    }

    try {
        console.log(`正在查询档案, MemberID: ${Number(memberId)}`);

        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/user/star/archives',
            { memberId: Number(memberId) },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response);
    } catch (error) {
        console.error('Fetch Archives Error:', error);
        return { success: false, msg: error.message };
    }
}

async function fetchStarHistory({ token, pa, memberId }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/user/star/history',
            {
                memberId: Number(memberId),
                limit: 100,
                lastTime: 0
            },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response);
    } catch (error) {
        console.error('Fetch History Error:', error);
        return { success: false, msg: error.message };
    }
}

async function fetchOpenLive({ token, pa, memberId, nextTime }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/im/api/v1/chatroom/msg/list/aim/type',
            {
                extMsgType: 'OPEN_LIVE',
                roomId: '',
                ownerId: String(memberId),
                nextTime: nextTime || 0
            },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response);
    } catch (error) {
        console.error('Fetch Open Live Error:', error);
        return { success: false, msg: error.message };
    }
}

async function fetchOpenLiveOne({ token, pa, liveId }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/live/api/v1/live/getOpenLiveOne',
            { liveId: String(liveId) },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response);
    } catch (error) {
        console.error('Fetch Open Live One Error:', error);
        return { success: false, msg: error.message };
    }
}

async function fetchOpenLivePublicList({ token, pa, groupId = 0, next = 0, record = false, debug = false }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/live/api/v1/live/getOpenLiveList',
            {
                groupId,
                debug: !!debug,
                next,
                record: !!record
            },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response);
    } catch (error) {
        console.error('Fetch Open Live Public List Error:', error);
        return { success: false, msg: error.message };
    }
}

async function fetchMeet48LiveList({ next = 0, record = false } = {}) {
    try {
        const response = await axios.post(
            'https://meetapi-v2.meet48.xyz/meet48-api/live/api/v1/live/getLiveList',
            {
                title: null,
                next: next || 0,
                record: !!record
            },
            { headers: createMeet48Headers() }
        );

        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.code === 0 || response.data.success)) {
            return { success: true, content: response.data.content || response.data.data };
        }

        return apiError(response, 'Meet48 API 错误');
    } catch (error) {
        console.error('Fetch Meet48 Live List Error:', error.response?.status || error.message);
        return { success: false, msg: error.message };
    }
}

async function fetchMeet48LiveOne({ liveId }) {
    try {
        const response = await axios.post(
            'https://meetapi-v2.meet48.xyz/meet48-api/live/api/v1/live/getLiveOne',
            {
                liveId: String(liveId || ''),
                streamProtocol: 'RTMP'
            },
            { headers: createMeet48Headers() }
        );

        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.code === 0 || response.data.success)) {
            return { success: true, content: response.data.content || response.data.data };
        }

        return apiError(response, 'Meet48 API 错误');
    } catch (error) {
        console.error('Fetch Meet48 Live One Error:', error.response?.status || error.message);
        return { success: false, msg: error.message };
    }
}

function extractLivePageInputValue(html, inputId) {
    const pattern = new RegExp(`<input[^>]+id=["']${inputId}["'][^>]+value=["']([^"']*)["']`, 'i');
    const match = String(html || '').match(pattern);
    return match ? String(match[1] || '').trim() : '';
}

function extractOpenLiveParticipantNamesFromHtml(html) {
    const names = [];
    const matches = String(html || '').matchAll(/<p class="listname">\s*([^<\r\n]+?)\s*(?:<em|<\/p>)/gi);

    for (const match of matches) {
        const name = String(match[1] || '').replace(/\s+/g, ' ').trim();
        if (name && !names.includes(name)) {
            names.push(name);
        }
    }

    return names;
}

async function fetchOpenLivePageHtml(url, headers) {
    const response = await axios.get(url, {
        headers,
        responseType: 'text'
    });
    return String(response.data || '');
}

function normalizeOpenLiveTitleForMatch(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[《》“”"'‘’·•…\s\-_:：,.，。!！?？()（）[\]【】]/g, '')
        .trim();
}

function formatReplayDateHint(value) {
    if (!value && value !== 0) return '';

    if (typeof value === 'number' || /^\d+$/.test(String(value || ''))) {
        const numeric = Number(value);
        if (!Number.isNaN(numeric) && numeric > 0) {
            const date = new Date(numeric);
            const pad = (n) => String(n).padStart(2, '0');
            return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
        }
    }

    const match = String(value).match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (!match) return '';
    return `${match[1]}.${String(match[2]).padStart(2, '0')}.${String(match[3]).padStart(2, '0')}`;
}

function extractReplayCardsFromHtml(html) {
    return [...String(html || '').matchAll(/<li class="videos">([\s\S]*?)<\/li>/gi)].map(match => {
        const block = match[1] || '';
        const hrefMatch = block.match(/href="\/Index\/invideo\/club\/(\d+)\/id\/(\d+)"/i);
        const titleMatch = block.match(/<h4>([^<]+)<\/h4>/i);
        const dateMatch = block.match(/(\d{4}\.\d{2}\.\d{2})/);

        return {
            clubId: hrefMatch ? String(hrefMatch[1] || '') : '',
            replayId: hrefMatch ? String(hrefMatch[2] || '') : '',
            title: titleMatch ? String(titleMatch[1] || '').trim() : '',
            date: dateMatch ? String(dateMatch[1] || '').trim() : ''
        };
    }).filter(item => item.replayId && item.title);
}

async function findReplayPageMatchByTitleDate({ title, dateHint, headers }) {
    const normalizedTargetTitle = normalizeOpenLiveTitleForMatch(title);
    const normalizedTargetDate = formatReplayDateHint(dateHint);
    if (!normalizedTargetTitle || !normalizedTargetDate) {
        return null;
    }

    const replayClubIds = [1, 2, 3, 5, 6];
    const maxPagesPerClub = 6;

    for (const clubId of replayClubIds) {
        for (let page = 1; page <= maxPagesPerClub; page += 1) {
            try {
                const pageUrl = page === 1
                    ? `https://live.48.cn/Index/main/club/${clubId}`
                    : `https://live.48.cn/Index/main/club/${clubId}/p/${page}.html`;
                const html = await fetchOpenLivePageHtml(pageUrl, headers);
                const cards = extractReplayCardsFromHtml(html);
                if (!cards.length) {
                    break;
                }

                const matchedCard = cards.find(card => {
                    if (card.date !== normalizedTargetDate) {
                        return false;
                    }

                    const normalizedCardTitle = normalizeOpenLiveTitleForMatch(card.title);
                    return normalizedTargetTitle.includes(normalizedCardTitle)
                        || normalizedCardTitle.includes(normalizedTargetTitle);
                });

                if (matchedCard) {
                    return matchedCard;
                }
            } catch (error) {
                continue;
            }
        }
    }

    return null;
}

async function fetchOpenLiveParticipants({ liveId, title = '', dateHint = '' }) {
    const normalizedLiveId = String(liveId || '').trim();
    if (!normalizedLiveId) {
        return { success: false, msg: '缺少 liveId' };
    }

    const pageHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        Referer: 'https://live.48.cn/'
    };

    try {
        const livePageUrl = `https://live.48.cn/Index/inlive/id/${encodeURIComponent(normalizedLiveId)}`;
        try {
            const html = await fetchOpenLivePageHtml(livePageUrl, pageHeaders);

            const videoId = extractLivePageInputValue(html, 'vedio_id');
            const clubId = extractLivePageInputValue(html, 'club_id');
            const pageToken = extractLivePageInputValue(html, 'param');

            if (videoId && clubId && pageToken) {
                try {
                    const payload = new URLSearchParams({
                        act: 'default',
                        video_id: videoId,
                        token: pageToken,
                        club_id: clubId
                    }).toString();

                    const memberResponse = await axios.post(
                        'https://live.48.cn/Index/ajax_getmemberhot/',
                        payload,
                        {
                            headers: {
                                ...pageHeaders,
                                Origin: 'https://live.48.cn',
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'X-Requested-With': 'XMLHttpRequest'
                            },
                            responseType: 'json'
                        }
                    );

                    const rows = Array.isArray(memberResponse?.data?.desc) ? memberResponse.data.desc : [];
                    const participants = rows
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
                } catch (memberError) {
                    console.warn('[OpenLiveParticipants] memberhot fallback to html parse:', memberError.message);
                }
            }

            const names = extractOpenLiveParticipantNamesFromHtml(html);
            const participants = names.map(name => ({ name, memberId: '', avatar: '', hot: '' }));
            if (participants.length) {
                return { success: true, content: { participants, source: 'html-live' } };
            }
        } catch (livePageError) {
            console.warn('[OpenLiveParticipants] inlive page unavailable:', livePageError.message);
        }

        const replayClubIds = [1, 2, 3, 5, 6];
        for (const clubId of replayClubIds) {
            try {
                const replayUrl = `https://live.48.cn/Index/invideo/club/${clubId}/id/${encodeURIComponent(normalizedLiveId)}`;
                const html = await fetchOpenLivePageHtml(replayUrl, pageHeaders);
                const names = extractOpenLiveParticipantNamesFromHtml(html);
                const participants = names.map(name => ({ name, memberId: '', avatar: '', hot: '' }));
                if (participants.length) {
                    return { success: true, content: { participants, source: `html-replay-club-${clubId}` } };
                }
            } catch (replayError) {
                continue;
            }
        }

        const matchedReplay = await findReplayPageMatchByTitleDate({
            title,
            dateHint,
            headers: pageHeaders
        });
        if (matchedReplay?.replayId && matchedReplay?.clubId) {
            try {
                const replayUrl = `https://live.48.cn/Index/invideo/club/${matchedReplay.clubId}/id/${matchedReplay.replayId}`;
                const html = await fetchOpenLivePageHtml(replayUrl, pageHeaders);
                const names = extractOpenLiveParticipantNamesFromHtml(html);
                const participants = names.map(name => ({ name, memberId: '', avatar: '', hot: '' }));
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
            } catch (matchedReplayError) {
                console.warn('[OpenLiveParticipants] replay match fetch failed:', matchedReplayError.message);
            }
        }

        return { success: false, msg: '未找到参与成员' };
    } catch (error) {
        console.error('Fetch Open Live Participants Error:', error);
        return { success: false, msg: error.message };
    }
}

async function fetchFlipPrices({ token, pa, memberId }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/idolanswer/api/idolanswer/v2/custom/index',
            { memberId: String(memberId) },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response);
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function sendFlipQuestion({ token, pa, payload }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question',
            payload,
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, msg: '发送成功' };
        }

        return { success: false, msg: response.data ? response.data.message : '发送失败' };
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function operateFlipQuestion({ token, pa, questionId, operateType }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question/operate',
            {
                questionId: String(questionId),
                operateType: operateType || 1
            },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, msg: '操作成功' };
        }

        return apiError(response);
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchMemberPhotos({ token, pa, memberId, page, size }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/nft/user_nft_list',
            {
                starId: parseInt(memberId, 10),
                size: size || 20,
                page: page || 0
            },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response);
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchUserMoney({ token, pa }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/user/money',
            { token },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return { success: false, msg: response.data ? response.data.message : '接口返回错误' };
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchCheckinToday({ token, pa }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/checkin/check/today',
            {},
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.success)) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取签到状态失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchUnreadMessageCount({ token, pa }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/message/api/v1/unread/message/num',
            {},
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.success)) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取未读消息数失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function editUserInfo({ token, pa, key, value }) {
    if (!token) {
        return missingToken();
    }

    if (!key) {
        return { success: false, msg: '缺少修改字段' };
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/user/info/edit',
            { key, value },
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.success)) {
            return { success: true, content: response.data.content, msg: response.data.message };
        }

        return apiError(response, '修改资料失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function uploadUserAvatar({ token, pa, fileName, mimeType, dataBase64 }) {
    if (!token) {
        return missingToken();
    }

    const base64Body = String(dataBase64 || '').replace(/^data:[^;,]+;base64,/, '');
    if (!base64Body) {
        return { success: false, msg: '缺少头像图片数据' };
    }

    try {
        const buffer = Buffer.from(base64Body, 'base64');
        const finalMimeType = mimeType || 'image/jpeg';
        const finalFileName = fileName || `avatar-${Date.now()}.${finalMimeType.includes('png') ? 'png' : 'jpg'}`;
        const formData = new FormData();
        formData.append('fromType', 'avatar');
        formData.append('file', new Blob([buffer], { type: finalMimeType }), finalFileName);

        const response = await fetch('https://pfile.48.cn/filesystem/upload/image', {
            method: 'POST',
            headers: createPfileHeaders(token, pa),
            body: formData
        });

        const data = await response.json();
        if (response.ok && data && data.status === 200) {
            const item = Array.isArray(data.content) ? data.content[0] : data.content;
            return { success: true, content: item, path: item?.path || '' };
        }

        return { success: false, msg: data?.message || '上传头像失败' };
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchUserRenameCount({ token, pa }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/user/rename/count',
            {},
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.success)) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取改名次数失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchUserPictureFrames({ token, pa }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/user/get/picture/frame',
            {},
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.success)) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取头像框失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchClientGroupTeamStarUpdate({ token, pa, payload }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/client/update/group_team_star',
            payload || {},
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.success)) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取成员基础数据更新失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchStarServerMap({ token, pa }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/im/api/v1/team/star/server/map/get',
            {},
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.success)) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取成员房间映射失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchMediaCollectionTotalCount({ token, pa }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/media/api/media/v1/getCollectionTotalCount',
            {},
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.success)) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取收藏统计失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function sendLiveGift({ token, pa, giftId, liveId, acceptUserId, giftNum }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
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
                crm: crypto.randomUUID
                    ? crypto.randomUUID()
                    : `${Date.now()}${Math.random().toString().slice(2)}`
            },
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return {
                success: true,
                msg: response.data.message || '送礼成功',
                content: response.data.content
            };
        }

        return { success: false, msg: response.data ? response.data.message : '送礼失败' };
    } catch (error) {
        console.error('送礼请求失败:', error);
        return { success: false, msg: `网络错误: ${error.message}` };
    }
}

async function fetchGiftList({ token, pa, liveId }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/gift/api/v1/gift/list',
            {
                businessId: String(liveId),
                giftType: 1
            },
            {
                headers: createHeaders(token, pa),
                transformResponse: [transformLargeNumberResponse]
            }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return { success: false, msg: response.data ? response.data.message : '获取礼物列表失败' };
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function getNimLoginInfo({ token, pa }) {
    if (!token) {
        return { success: false, msg: '未登录' };
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/user/info/home',
            {},
            { headers: createModernHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.success) {
            const userInfo = response.data.content.userInfo;
            return {
                success: true,
                accid: userInfo.accId,
                token
            };
        }

        return { success: false, msg: '获取用户信息失败' };
    } catch (error) {
        console.error('获取IM信息失败:', error);
        return { success: false, msg: error.message };
    }
}

async function fetchRoomAlbum({ token, pa, channelId, nextTime }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/im/api/v1/team/msg/list/img',
            {
                channelId: String(channelId),
                nextTime: nextTime || 0
            },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response);
    } catch (error) {
        console.error('Fetch Room Album Error:', error);
        return { success: false, msg: error.message };
    }
}

async function fetchRoomRadio({ token, pa, channelId, serverId }) {
    if (!token) {
        return missingToken();
    }

    try {
        const headers = createHeaders(token, pa);
        let finalServerId = serverId;

        if (!finalServerId || finalServerId === 0) {
            const resolvedServerId = await resolveServerId(channelId, headers, '电台 ServerID 自动获取失败');
            if (resolvedServerId) {
                finalServerId = resolvedServerId;
            }
        }

        const response = await axios.post(
            'https://pocketapi.48.cn/im/api/v1/team/voice/operate',
            {
                channelId: parseInt(channelId, 10),
                serverId: parseInt(finalServerId, 10),
                operateCode: 2
            },
            { headers }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return { success: false, msg: response.data ? response.data.message : '电台未开启或获取失败' };
    } catch (error) {
        console.error('Fetch Room Radio Error:', error);
        return { success: false, msg: error.message };
    }
}

async function fetchLiveRank({ token, pa, liveId }) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/live/api/v2/live/getLiveRank',
            {
                type: 1,
                liveId: String(liveId)
            },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return { success: false, msg: response.data ? response.data.message : '获取榜单失败' };
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchFriendsIds({ token, pa }) {
    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v1/friendships/friends/id',
            {},
            { headers: createHeaders(token, pa) }
        );

        return response.data;
    } catch (error) {
        return { status: 500, message: error.message };
    }
}

async function fetchLastMessages({ token, pa, serverIdList }) {
    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/im/api/v1/team/classic/last/message/get',
            {
                serverIdList: Array.isArray(serverIdList)
                    ? serverIdList.map(Number)
                    : [Number(serverIdList)]
            },
            { headers: createHeaders(token, pa) }
        );

        return response.data;
    } catch (error) {
        return { status: 500, message: error.message };
    }
}

async function followMember({ token, pa, memberId }) {
    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v2/friendships/friends/add',
            {
                toSourceId: parseInt(memberId, 10),
                toType: 1
            },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.success) {
            return { success: true };
        }

        return apiError(response);
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function unfollowMember({ token, pa, memberId }) {
    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/user/api/v2/friendships/friends/remove',
            {
                toSourceId: parseInt(memberId, 10),
                toType: 1
            },
            { headers: createHeaders(token, pa) }
        );

        if (response.status === 200 && response.data && response.data.success) {
            return { success: true };
        }

        return apiError(response);
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchLiveList({ token, pa, groupId = 0, next = 0, record = false, debug = false }) {
    return postPocketContent(
        'https://pocketapi.48.cn/live/api/v1/live/getLiveList',
        {
            groupId: Number(groupId) || 0,
            debug: !!debug,
            next: Number(next) || 0,
            record: !!record
        },
        { token, pa, errorMessage: '获取直播列表失败' }
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
    if (memberId !== undefined && memberId !== null && memberId !== '') {
        payload.memberId = String(memberId);
    }
    if (userId !== undefined && userId !== null && userId !== '') {
        payload.userId = String(userId);
    }

    return postPocketContent(
        'https://pocketapi.48.cn/trip/api/trip/v1/list',
        payload,
        { token, pa, errorMessage: '获取行程失败' }
    );
}

async function fetchAlbumList({ token, pa, ctime = 0, groupId = 0, limit = 20 }) {
    return postPocketContent(
        'https://pocketapi.48.cn/media/api/media/v1/album/list',
        {
            ctime: Number(ctime) || 0,
            groupId: Number(groupId) || 0,
            limit: Number(limit) || 20
        },
        { token, pa, errorMessage: '获取专辑列表失败' }
    );
}

async function fetchMeleeWeekRank({ token, pa, rankId, nextId }) {
    const payload = { rankId: Number(rankId) || 0 };
    if (nextId !== undefined && nextId !== null && nextId !== '') {
        payload.nextId = nextId;
    }

    return postPocketContent(
        'https://pocketapi.48.cn/gift/api/v1/melee/rank/getMeleeWeekRank',
        payload,
        { token, pa, errorMessage: '获取乱斗周榜失败', largeNumbers: true }
    );
}

async function fetchMeleeRankPage({ token, pa, rankId, nextId }) {
    const payload = { rankid: Number(rankId) || 0 };
    if (nextId !== undefined && nextId !== null && nextId !== '') {
        payload.nextId = nextId;
    }

    return postPocketContent(
        'https://pocketapi.48.cn/gift/api/v1/melee/rank/getMeleeRankPage',
        payload,
        { token, pa, errorMessage: '获取乱斗榜单失败', largeNumbers: true }
    );
}

async function fetchMeleeYearRankPage({ token, pa, rankId, nextId }) {
    const payload = {};
    if (rankId !== undefined && rankId !== null && rankId !== '') {
        payload.rankid = Number(rankId) || 0;
    }
    if (nextId !== undefined && nextId !== null && nextId !== '') {
        payload.nextId = nextId;
    }

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

async function fetchPostImageList({ token, pa, userId, nextTime = 0 }) {
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/v1/posts/img/list',
        {
            userId: String(userId || ''),
            nextTime: Number(nextTime) || 0
        },
        { token, pa, errorMessage: '获取成员图片动态失败' }
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
    if (!token) {
        return missingToken();
    }

    return postPocketContent(
        'https://pocketapi.48.cn/im/api/v1/conversation/page',
        {
            nextTime: Number(nextTime) || 0,
            limit: Number(limit) || 20
        },
        { token, pa, headersFactory: createModernHeaders, errorMessage: '获取会话列表失败' }
    );
}

async function fetchUserHomeInfo({ token, pa, userId }) {
    const payload = {};
    if (userId !== undefined && userId !== null && userId !== '') {
        payload.userId = String(userId);
    }

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

async function fetchInvoiceTips({ token, pa } = {}) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.get(
            'https://pocketapi.48.cn/invoice/api/v1/invoice/tips',
            { headers: createInvoiceHeaders() }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取开票提示失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchInvoiceConfig({ token, pa } = {}) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/invoice/api/v1/invoice/config',
            {},
            { headers: createInvoiceHeaders(token, { tokenHeader: true }) }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取开票配置失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function fetchInvoiceOrderList({ token, pa, nextTime = '', yearMonth = '' } = {}) {
    if (!token) {
        return missingToken();
    }

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/invoice/api/v1/order/list',
            {
                nextTime: String(nextTime || '0'),
                token,
                yearMonth: String(yearMonth || '')
            },
            { headers: createInvoiceHeaders() }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content };
        }

        return apiError(response, '获取可开票订单失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function applyElectronicInvoice({
    token,
    pa,
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
    if (!token) {
        return missingToken();
    }

    const ids = Array.isArray(orderDataId)
        ? orderDataId.map(item => String(item || '').trim()).filter(Boolean)
        : [];
    if (!ids.length) {
        return { success: false, msg: '请选择要开票的订单' };
    }
    if (!String(buyerName || '').trim()) {
        return { success: false, msg: '请填写发票抬头' };
    }
    if (!String(notifyEmail || '').trim()) {
        return { success: false, msg: '请填写接收邮箱' };
    }
    if (!String(notifyMobile || '').trim()) {
        return { success: false, msg: '请填写手机号' };
    }
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

    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/invoice/api/v1/invoice/apply/electronic',
            requestPayload,
            { headers: createInvoiceHeaders() }
        );

        if (response.status === 200 && response.data && response.data.status === 200) {
            return { success: true, content: response.data.content, msg: response.data.message || '提交成功' };
        }

        return apiError(response, '提交开票申请失败');
    } catch (error) {
        return { success: false, msg: error.message };
    }
}

async function requestElectionVoteApi(method, path, payload = {}, body = {}, options = {}) {
    const url = `https://voteapi.48.cn/election-vote/api/v1${path}`;
    try {
        const response = await axios({
            method,
            url,
            data: method === 'GET' ? undefined : (body || {}),
            headers: createElectionVoteHeaders(payload, options)
        });
        if (response.status === 200 && response.data && (response.data.status === 200 || response.data.success)) {
            return { success: true, content: response.data.content, data: response.data };
        }
        return apiError(response, '计分 API 错误');
    } catch (error) {
        return { success: false, msg: error.response?.data?.message || error.message || '计分 API 错误', data: error.response?.data };
    }
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

module.exports = {
    loginSendSms,
    loginByCode,
    loginCheckToken,
    checkIn,
    switchBigSmall,
    fetchRoomMessages,
    fetchPrivateMessageList,
    fetchPrivateMessageInfo,
    sendPrivateMessageReply,
    fetchFlipList,
    fetchStarArchives,
    fetchStarHistory,
    fetchOpenLive,
    fetchOpenLiveOne,
    fetchOpenLivePublicList,
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
    fetchLiveRank,
    fetchFriendsIds,
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
    fetchChatroomHomeownerMessages,
    fetchMemberWeiboMessages,
    fetchMemberDynamicMessages,
    fetchConversationPage,
    fetchUserHomeInfo,
    fetchFlipCustomIndexV1,
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
    fetchScoreOfficialBundle,
    runScoreOfficialAction
};
