const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { ensureWasmLoaded, generatePa } = require('./wasm-service');

const APP_VERSION = '7.0.41';
const APP_BUILD = '24011601';
const DEVICE_ID = createDeviceId();

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
    return { success: false, msg: response && response.data ? response.data.message : fallback };
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

module.exports = {
    loginSendSms,
    loginByCode,
    loginCheckToken,
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
    fetchFlipPrices,
    sendFlipQuestion,
    operateFlipQuestion,
    fetchMemberPhotos,
    fetchUserMoney,
    sendLiveGift,
    fetchGiftList,
    getNimLoginInfo,
    fetchRoomAlbum,
    fetchRoomRadio,
    fetchLiveRank,
    fetchFriendsIds,
    fetchLastMessages,
    followMember,
    unfollowMember
};
