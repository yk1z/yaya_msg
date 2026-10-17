'use strict';

(function installMemberRoomMessageFactory(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.YayaMemberRoomMessage = api;
})(typeof window !== 'undefined' ? window : globalThis, function createMemberRoomMessageApi() {
    function normalizeText(value) {
        const text = String(value || '')
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
            .trim();
        if (!text) throw new Error('请输入消息内容');
        return text;
    }

    function normalizeId(value, label) {
        const normalized = String(value || '').trim();
        if (!/^\d{1,32}$/.test(normalized)) throw new Error(`缺少有效的${label}`);
        return normalized;
    }

    function normalizeNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function normalizeUserId(value) {
        const normalized = String(value || '').trim();
        const number = Number(normalized);
        return Number.isSafeInteger(number) ? number : normalized;
    }

    function buildExtension(userInfo = {}, bubbleId = '0', channelRole = '0', monthCardBadge = null) {
        return {
            module: 'QCHAT',
            channelRole: String(channelRole ?? '0'),
            user: {
                userId: normalizeUserId(userInfo.userId || userInfo.id),
                nickName: String(userInfo.nickname || userInfo.nickName || ''),
                teamLogo: userInfo.teamLogo || '',
                avatar: String(userInfo.avatar || ''),
                level: normalizeNumber(userInfo.level),
                roleId: normalizeNumber(userInfo.roleId),
                vip: userInfo.vip === true,
                pfUrl: String(userInfo.pfUrl || ''),
                ...(Array.isArray(userInfo.badge) ? { badge: [...userInfo.badge] } : {})
            },
            ...(monthCardBadge ? { monthCardBadge: { ...monthCardBadge } } : {}),
            bubbleId: String(bubbleId || '0')
        };
    }

    function buildSendOptions({ serverId, channelId, text, userInfo, bubbleId = '0', channelRole = '0', monthCardBadge = null } = {}) {
        const normalizedText = normalizeText(text);
        return {
            serverId: normalizeId(serverId, 'Server ID'),
            channelId: normalizeId(channelId, 'Channel ID'),
            type: 'text',
            body: normalizedText,
            ext: JSON.stringify(buildExtension(userInfo, bubbleId, channelRole, monthCardBadge)),
            env: 'QChat',
            historyEnable: true,
            pushEnable: true,
            needBadge: true,
            needPushNick: true,
            routeEnable: true
        };
    }

    function buildReplyOptions({ serverId, channelId, text, reply, userInfo, bubbleId = '0', channelRole = '0', monthCardBadge = null } = {}) {
        const normalizedText = normalizeText(text);
        const replyMessageId = String(reply?.msgIdClient || '').trim();
        if (!replyMessageId) throw new Error('缺少被回复消息 ID');
        const replyName = String(reply?.senderName || '').trim() || '用户';
        const replyText = normalizeText(reply?.text);
        const hasGift = reply?.giftInfo && typeof reply.giftInfo === 'object';
        const replyInfo = {
            replyName,
            replyText,
            replyMessageId,
            ...(hasGift ? { giftInfo: reply.giftInfo } : {}),
            text: normalizedText
        };
        return {
            serverId: normalizeId(serverId, 'Server ID'),
            channelId: normalizeId(channelId, 'Channel ID'),
            type: 'custom',
            attachment: JSON.stringify(hasGift
                ? { giftReplyInfo: replyInfo, messageType: 'GIFTREPLY' }
                : { replyInfo, messageType: 'REPLY' }),
            ext: JSON.stringify(buildExtension(userInfo, bubbleId, channelRole, monthCardBadge)),
            env: 'QChat',
            historyEnable: true,
            pushEnable: true,
            needBadge: true,
            needPushNick: true,
            routeEnable: true
        };
    }

    function buildDeletePayload({ channelId, msgIdClient, msgTime } = {}) {
        const normalizedMessageId = String(msgIdClient || '').trim();
        const normalizedTime = Number(msgTime);
        if (!normalizedMessageId || normalizedMessageId.length > 128) throw new Error('缺少有效的消息 ID');
        if (!Number.isFinite(normalizedTime) || normalizedTime <= 0) throw new Error('缺少有效的消息时间');
        return {
            channelId: normalizeId(channelId, 'Channel ID'),
            msgIdClient: normalizedMessageId,
            msgTime: normalizedTime
        };
    }

    return {
        buildExtension,
        buildDeletePayload,
        buildReplyOptions,
        buildSendOptions,
        normalizeText
    };
});
