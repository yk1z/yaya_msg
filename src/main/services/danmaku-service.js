'use strict';

const { createNimCommonlinkChatroomClient } = require('../../common/nim-commonlink-chatroom');
const { applyCustomSenderProfile, applyCustomLiveExtensions } = require('../../common/sender-profile');
const pocketService = require('./pocket-service');
const settingsService = require('./settings-service');
const { ensureWasmLoaded, generatePa } = require('./wasm-service');

const CHATROOM_APP_KEY = '632feff1f4c838541ab75195d1ceb3fa';
const connections = new Map();
const observedSenders = new WeakSet();
const SEND_INTERVAL_MS = 2000;
const ONLINE_REFRESH_INTERVAL_MS = 10_000;

function normalizeId(value, label) {
    const normalized = String(value || '').trim();
    if (!/^\d{1,32}$/.test(normalized)) throw new Error(`缺少有效的${label}`);
    return normalized;
}

function isCurrentConnection(senderId, connectionId) {
    return connections.get(senderId)?.connectionId === connectionId;
}

function sendToRenderer(sender, channel, connectionId, payload = {}) {
    if (!sender || sender.isDestroyed() || !isCurrentConnection(sender.id, connectionId)) return;
    sender.send(channel, { connectionId, ...payload });
}

function disconnectLiveDanmaku(senderId, connectionId = '') {
    const current = connections.get(senderId);
    if (!current || (connectionId && current.connectionId !== connectionId)) return false;
    connections.delete(senderId);
    clearInterval(current.onlineRefreshTimer);
    current.client.destroy();
    return true;
}

async function connectLiveDanmaku(sender, payload = {}) {
    const liveId = normalizeId(payload.liveId, '直播 ID');
    const requestedRoomId = normalizeId(payload.roomId, '聊天室 ID');
    const connectionId = String(payload.connectionId || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,96}$/.test(connectionId)) throw new Error('缺少有效的弹幕连接 ID');

    disconnectLiveDanmaku(sender.id);
    const pocketToken = settingsService.getToken();
    if (!pocketToken) throw new Error('请先登录口袋48账号后再连接实时弹幕');

    await ensureWasmLoaded();
    const pa = generatePa() || '';
    const [credentials, liveResult, accountResult] = await Promise.all([
        pocketService.invoke('get-nim-login-info', { token: pocketToken, pa }),
        pocketService.invoke('fetch-live-one', { token: pocketToken, pa, liveId }),
        pocketService.invoke('login-check-token', { token: pocketToken, pa })
    ]);
    if (!credentials?.success) throw new Error(credentials?.msg || '获取直播聊天室凭证失败');
    if (!liveResult?.success) {
        console.warn('[直播弹幕] 连接前直播详情查询失败:', {
            liveId,
            requestedRoomId,
            apiStatus: liveResult?.data?.status ?? liveResult?.data?.code ?? null,
            message: liveResult?.msg || '获取直播详情失败'
        });
        throw new Error(liveResult?.msg || '获取直播详情失败');
    }

    const verifiedRoomId = normalizeId(
        liveResult.content?.chatroomId || liveResult.content?.roomId,
        '聊天室 ID'
    );
    if (requestedRoomId !== verifiedRoomId) {
        console.warn('[直播弹幕] 页面聊天室 ID 已过期，使用直播详情中的最新 ID');
    }

    const client = createNimCommonlinkChatroomClient({
        appKey: CHATROOM_APP_KEY,
        account: credentials.account || credentials.accid,
        token: credentials.token,
        roomId: verifiedRoomId,
        onConnected() {
            sendToRenderer(sender, 'live-danmaku-status', connectionId, {
                liveId,
                roomId: verifiedRoomId,
                status: 'connected'
            });
            void refreshOnlineMemberNum();
        },
        onReconnecting() {
            sendToRenderer(sender, 'live-danmaku-status', connectionId, {
                liveId,
                roomId: verifiedRoomId,
                status: 'reconnecting'
            });
        },
        onDisconnected() {
            sendToRenderer(sender, 'live-danmaku-status', connectionId, {
                liveId,
                roomId: verifiedRoomId,
                status: 'reconnecting'
            });
        },
        onError(error) {
            sendToRenderer(sender, 'live-danmaku-status', connectionId, {
                liveId,
                roomId: verifiedRoomId,
                status: client.connected ? 'reconnecting' : 'disconnected',
                message: String(error?.message || '')
            });
        },
        onMessage(message) {
            sendToRenderer(sender, 'live-danmaku-message', connectionId, {
                liveId,
                roomId: verifiedRoomId,
                messages: [message]
            });
        }
    });

    connections.set(sender.id, {
        connectionId,
        client,
        liveId,
        roomId: verifiedRoomId,
        userInfo: accountResult?.success ? accountResult.userInfo || {} : {},
        lastSentAt: 0,
        onlineRefreshTimer: null
    });

    async function refreshOnlineMemberNum() {
        if (!isCurrentConnection(sender.id, connectionId) || !client.connected) return;
        try {
            const info = await client.getChatroomInfo();
            sendToRenderer(sender, 'live-danmaku-online', connectionId, {
                liveId,
                roomId: verifiedRoomId,
                onlineMemberNum: info.onlineMemberNum
            });
        } catch (error) {
            console.warn('[直播弹幕] 读取聊天室在线人数失败:', error?.message || error);
        }
    }
    if (!observedSenders.has(sender)) {
        observedSenders.add(sender);
        sender.once('destroyed', () => disconnectLiveDanmaku(sender.id));
    }

    try {
        await client.connect();
        const current = connections.get(sender.id);
        if (current?.connectionId === connectionId) {
            current.onlineRefreshTimer = setInterval(refreshOnlineMemberNum, ONLINE_REFRESH_INTERVAL_MS);
            current.onlineRefreshTimer.unref?.();
        }
        return { success: true, connectionId, liveId, roomId: verifiedRoomId };
    } catch (error) {
        if (isCurrentConnection(sender.id, connectionId)) connections.delete(sender.id);
        client.destroy();
        throw error;
    }
}

function normalizeBarrageText(value) {
    const text = String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (!text) throw new Error('请输入弹幕内容');
    if (Array.from(text).length > 100) throw new Error('弹幕最多 100 个字符');
    return text;
}

function buildLocalBarrageMessage(current, text, custom, result = {}, senderProfile = null) {
    const user = senderProfile || current.userInfo || {};
    return {
        uuid: String(result.idClient || ''),
        type: 'text',
        msg_type_: 0,
        msg_attach_: text,
        msg_setting_: { ext_: JSON.stringify(custom) },
        custom: JSON.stringify(custom),
        remoteExtension: custom,
        fromNick: String(user.nickname || ''),
        fromAvatar: String(user.avatar || ''),
        text,
        from: String(user.userId || ''),
        sessionId: current.roomId,
        fromClientType: 3,
        time: Number(result.time || Date.now())
    };
}

async function sendLiveDanmaku(senderId, payload = {}) {
    const connectionId = String(payload.connectionId || '').trim();
    const current = connections.get(senderId);
    if (!current || current.connectionId !== connectionId) throw new Error('直播弹幕连接已失效');
    const text = normalizeBarrageText(payload.text);
    const now = Date.now();
    if (now - current.lastSentAt < SEND_INTERVAL_MS) throw new Error('发送太快，请稍后再试');
    current.lastSentAt = now;

    const customSenderProfile = settingsService.getCustomSenderProfile();
    const user = applyCustomSenderProfile(
        current.userInfo,
        customSenderProfile
    );
    const custom = applyCustomLiveExtensions({
        sourceId: current.liveId,
        roomId: current.roomId,
        messageType: 'BARRAGE_NORMAL',
        module: 'live',
        fromApp: '201811',
        sessionRole: 0,
        inTop: false,
        bubbleId: '0',
        text,
        user: {
            userId: user.userId || '',
            nickName: String(user.nickname || ''),
            avatar: String(user.avatar || ''),
            level: Number(user.level || 0),
            roleId: Number(user.roleId || 0),
            vip: user.vip === true,
            pfUrl: String(user.pfUrl || ''),
            teamLogo: user.teamLogo || null,
            badge: Array.isArray(user.badge) ? user.badge : []
        },
        config: {
            version: '7.1.43',
            build: '26072201',
            phoneName: 'Yaya Desktop',
            phoneSystemVersion: process.platform
        }
    }, customSenderProfile);

    try {
        const result = await current.client.sendText({ text, custom });
        return {
            ...result,
            localMessage: buildLocalBarrageMessage(current, text, custom, result, user)
        };
    } catch (error) {
        current.lastSentAt = 0;
        throw error;
    }
}

function normalizeGiftText(value, fallback, maxLength = 120) {
    const text = String(value || fallback || '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim();
    return Array.from(text).slice(0, maxLength).join('');
}

function buildLiveGiftAttachment(current, payload = {}) {
    const liveId = normalizeId(payload.liveId, '直播 ID');
    if (liveId !== current.liveId) throw new Error('当前聊天室与送礼直播不一致');

    const giftId = normalizeId(payload.giftId, '礼物 ID');
    const acceptUserId = normalizeId(payload.acceptUserId, '主播 ID');
    const giftNum = Math.floor(Number(payload.giftNum));
    if (!Number.isInteger(giftNum) || giftNum < 1 || giftNum > 999) throw new Error('礼物数量无效');
    const unitMoney = Number(payload.money);
    if (!Number.isFinite(unitMoney) || unitMoney < 0) throw new Error('礼物价格无效');

    const user = current.userInfo || {};
    const userName = normalizeGiftText(payload.acceptUserName, '成员', 80);
    const starName = normalizeGiftText(payload.acceptStarName, userName.replace(/^[A-Z0-9]+48[-－_]/i, ''), 80);
    return {
        giftInfo: {
            giftId,
            giftName: normalizeGiftText(payload.giftName, '礼物', 80),
            picPath: normalizeGiftText(payload.picPath, '', 500),
            switchTime: 0,
            click: true,
            special: false,
            giftNum,
            zipPath: '',
            sourceId: liveId,
            acceptUser: {
                userId: Number(acceptUserId),
                userAvatar: normalizeGiftText(payload.acceptUserAvatar, '', 500),
                userName,
                starName
            },
            effectStartTime: 0,
            money: unitMoney
        },
        liveBubbleId: '0',
        liveBubbleIosUrl: '',
        liveBubbleAndroidUrl: '',
        specialBadge: [],
        businessType: 0,
        monthCardBadge: {},
        nameplateList: [],
        liveRank: -1,
        fromApp: '201811',
        roomId: current.roomId,
        module: 'LIVE',
        sourceId: liveId,
        messageType: 'PRESENT_NORMAL',
        user: {
            userId: Number(user.userId || 0),
            nickName: normalizeGiftText(user.nickname || user.nickName, '', 80),
            teamLogo: normalizeGiftText(user.teamLogo, '', 500),
            avatar: normalizeGiftText(user.avatar, '', 500),
            badge: Array.isArray(user.badge) ? user.badge : [],
            seineBadge: Array.isArray(user.seineBadge) ? user.seineBadge : [],
            level: Number(user.level || 0),
            roleId: Number(user.roleId || 0),
            vip: user.vip === true,
            pfUrl: normalizeGiftText(user.pfUrl, '', 500),
            appBuild: '26082801'
        },
        sessionRole: '0'
    };
}

async function sendLiveGiftEvent(senderId, payload = {}) {
    const current = connections.get(senderId);
    if (!current) throw new Error('直播弹幕连接已失效，礼物已送出但无法同步到聊天室');
    const attachment = buildLiveGiftAttachment(current, payload);
    return current.client.sendCustom({ attachment });
}

function closeAllLiveDanmakuConnections() {
    for (const { client, onlineRefreshTimer } of connections.values()) {
        clearInterval(onlineRefreshTimer);
        client.destroy();
    }
    connections.clear();
}

module.exports = {
    buildLocalBarrageMessage,
    buildLiveGiftAttachment,
    connectLiveDanmaku,
    sendLiveDanmaku,
    sendLiveGiftEvent,
    disconnectLiveDanmaku,
    closeAllLiveDanmakuConnections
};
