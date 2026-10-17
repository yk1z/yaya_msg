'use strict';

const { createSharedMemberRoomClient } = require('./member-room-transport');
const { buildDeletePayload, buildReplyOptions, buildSendOptions } = require('../../common/member-room-message');
const { applyCustomSenderProfile } = require('../../common/sender-profile');
const pocketService = require('./pocket-service');
const settingsService = require('./settings-service');
const { ensureWasmLoaded, generatePa } = require('./wasm-service');

const MEMBER_ROOM_APP_KEY = '632feff1f4c838541ab75195d1ceb3fa';
const SEND_INTERVAL_MS = 1500;
const connections = new Map();
const pendingConnectionIds = new Map();
const observedSenders = new WeakSet();

function normalizeId(value, label) {
    const normalized = String(value || '').trim();
    if (!/^\d{1,32}$/.test(normalized)) throw new Error(`缺少有效的${label}`);
    return normalized;
}

function normalizeConnectionId(value) {
    const normalized = String(value || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,96}$/.test(normalized)) throw new Error('缺少有效的成员房间连接 ID');
    return normalized;
}

function isCurrentConnection(senderId, connectionId) {
    return connections.get(senderId)?.connectionId === connectionId;
}

function sendToRenderer(sender, channel, connectionId, payload = {}) {
    if (!sender || sender.isDestroyed() || !isCurrentConnection(sender.id, connectionId)) return;
    if (connections.get(sender.id)?.pocketToken !== settingsService.getToken()) return;
    sender.send(channel, { connectionId, ...payload });
}

function disconnectMemberRoom(senderId, connectionId = '') {
    const pendingConnectionId = pendingConnectionIds.get(senderId);
    if (!connectionId || pendingConnectionId === connectionId) {
        pendingConnectionIds.delete(senderId);
    }
    const current = connections.get(senderId);
    if (!current || (connectionId && current.connectionId !== connectionId)) return false;
    connections.delete(senderId);
    current.client.destroy();
    return true;
}

async function connectMemberRoom(sender, payload = {}) {
    const connectionId = normalizeConnectionId(payload.connectionId);
    const serverId = normalizeId(payload.serverId, '成员房间服务器 ID');
    const channelId = normalizeId(payload.channelId, '成员房间频道 ID');
    disconnectMemberRoom(sender.id);
    pendingConnectionIds.set(sender.id, connectionId);
    if (!observedSenders.has(sender)) {
        observedSenders.add(sender);
        sender.once('destroyed', () => disconnectMemberRoom(sender.id));
    }

    function assertConnectionStillRequested() {
        if (pendingConnectionIds.get(sender.id) !== connectionId || sender.isDestroyed()) {
            const error = new Error('成员房间连接已取消');
            error.code = 'MEMBER_ROOM_CONNECT_CANCELLED';
            throw error;
        }
    }

    let pocketToken;
    let credentials;
    let accountResult;
    try {
        pocketToken = settingsService.getToken();
        if (!pocketToken) throw new Error('请先登录口袋48账号');
        await ensureWasmLoaded();
        assertConnectionStillRequested();
        const pa = generatePa() || '';
        [credentials, accountResult] = await Promise.all([
            pocketService.invoke('get-nim-login-info', { token: pocketToken, pa }),
            pocketService.invoke('login-check-token', { token: pocketToken, pa })
        ]);
        assertConnectionStillRequested();
    } catch (error) {
        if (pendingConnectionIds.get(sender.id) === connectionId) {
            pendingConnectionIds.delete(sender.id);
        }
        throw error;
    }
    if (!credentials?.success) throw new Error(credentials?.msg || '获取云信登录凭证失败');

    const userInfo = accountResult?.success ? accountResult.userInfo || {} : {};
    if (!userInfo.userId) userInfo.userId = credentials.userId || '';
    const account = String(credentials.account || credentials.accid || '').trim();
    assertConnectionStillRequested();
    const client = createSharedMemberRoomClient({
        appKey: MEMBER_ROOM_APP_KEY,
        account,
        token: credentials.token,
        serverId,
        channelId,
        onConnected() {
            sendToRenderer(sender, 'member-room-status', connectionId, {
                status: 'connected',
                serverId,
                channelId,
                accountName: String(userInfo.nickname || account)
            });
        },
        onDisconnected() {
            sendToRenderer(sender, 'member-room-status', connectionId, {
                status: 'disconnected',
                serverId,
                channelId,
                message: '成员房间连接已断开'
            });
        },
        onError(error) {
            sendToRenderer(sender, 'member-room-status', connectionId, {
                status: client.connected ? 'connected' : 'disconnected',
                serverId,
                channelId,
                message: String(error?.message || '')
            });
        },
        onMessage(message) {
            sendToRenderer(sender, 'member-room-message', connectionId, { message });
        }
    });

    connections.set(sender.id, {
        connectionId,
        serverId,
        channelId,
        pocketToken,
        account,
        userInfo,
        client,
        lastSentAt: 0
    });
    try {
        await client.connect();
        assertConnectionStillRequested();
        if (pendingConnectionIds.get(sender.id) === connectionId) {
            pendingConnectionIds.delete(sender.id);
        }
        return {
            success: true,
            connectionId,
            serverId,
            channelId,
            accountId: account,
            userId: String(userInfo.userId || ''),
            accountName: String(userInfo.nickname || account)
        };
    } catch (error) {
        if (pendingConnectionIds.get(sender.id) === connectionId) {
            pendingConnectionIds.delete(sender.id);
        }
        if (isCurrentConnection(sender.id, connectionId)) connections.delete(sender.id);
        client.destroy();
        throw error;
    }
}

async function sendMemberRoomMessage(senderId, payload = {}) {
    const connectionId = normalizeConnectionId(payload.connectionId);
    const current = connections.get(senderId);
    if (!current || current.connectionId !== connectionId || !current.client.connected
        || current.pocketToken !== settingsService.getToken()) {
        throw new Error('成员房间连接已失效');
    }
    const serverId = normalizeId(payload.serverId, '成员房间服务器 ID');
    const channelId = normalizeId(payload.channelId, '成员房间频道 ID');
    if (serverId !== current.serverId || channelId !== current.channelId) {
        throw new Error('成员房间发送目标已变化，请重新连接');
    }
    const now = Date.now();
    if (now - current.lastSentAt < SEND_INTERVAL_MS) throw new Error('发送太快，请稍后再试');
    const buildOptions = payload.reply ? buildReplyOptions : buildSendOptions;
    const customSenderProfile = settingsService.getCustomSenderProfile();
    const senderProfile = applyCustomSenderProfile(
        current.userInfo,
        customSenderProfile
    );
    const options = buildOptions({
        serverId,
        channelId,
        text: payload.text,
        reply: payload.reply,
        userInfo: senderProfile,
        channelRole: customSenderProfile.enabled && customSenderProfile.channelRole !== null
            ? String(customSenderProfile.channelRole)
            : '0',
        bubbleId: customSenderProfile.enabled ? customSenderProfile.bubbleId || '0' : '0',
        monthCardBadge: customSenderProfile.enabled ? customSenderProfile.monthCardBadge : null
    });
    current.lastSentAt = now;
    try {
        const result = await current.client.sendMessage(options);
        return { ...result, message: {
            serverId, channelId, fromAccount: current.account,
            fromNick: String(senderProfile.nickname || senderProfile.nickName || ''),
            type: options.type === 'custom' ? 100 : 0,
            body: options.body || '', attachment: options.attachment || '', ext: options.ext || '',
            msgIdClient: result.msgIdClient || '', msgIdServer: result.msgIdServer || '', time: result.time
        } };
    } catch (error) {
        current.lastSentAt = 0;
        throw error;
    }
}

async function deleteMemberRoomMessage(senderId, payload = {}) {
    const connectionId = normalizeConnectionId(payload.connectionId);
    const current = connections.get(senderId);
    if (!current || current.connectionId !== connectionId || !current.client.connected
        || current.pocketToken !== settingsService.getToken()) {
        throw new Error('成员房间连接已失效');
    }
    const targetUserId = String(payload.senderUserId || '').trim();
    const currentIdentityIds = new Set([
        current.userInfo?.userId,
        current.account
    ].map(value => String(value || '').trim()).filter(Boolean));
    if (!targetUserId || !currentIdentityIds.has(targetUserId)) {
        throw new Error('只能删除当前账号自己发送的消息');
    }
    const deletePayload = buildDeletePayload({
        channelId: payload.channelId,
        msgIdClient: payload.msgIdClient,
        msgTime: payload.msgTime
    });
    if (deletePayload.channelId !== current.channelId) throw new Error('成员房间删除目标已变化，请重新连接');
    const pocketToken = settingsService.getToken();
    if (!pocketToken) throw new Error('请先登录口袋48账号');
    await ensureWasmLoaded();
    const result = await pocketService.deleteMemberRoomMessage({
        token: pocketToken,
        pa: generatePa() || '',
        accId: current.account,
        ...deletePayload
    });
    if (!result?.success) throw new Error(result?.msg || '删除成员房间消息失败');
    return result;
}

function closeAllMemberRoomConnections() {
    for (const { client } of connections.values()) client.destroy();
    connections.clear();
    pendingConnectionIds.clear();
}

module.exports = {
    closeAllMemberRoomConnections,
    connectMemberRoom,
    deleteMemberRoomMessage,
    disconnectMemberRoom,
    sendMemberRoomMessage
};
