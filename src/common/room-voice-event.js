'use strict';

function parseObject(value) {
    try {
        for (let i = 0; i < 2 && typeof value === 'string'; i++) {
            value = JSON.parse(value.replace(/([:\[,]\s*)(\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
        }
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch (_) { return null; }
}

function normalizeRoomVoiceEvent(message, system = false) {
    const content = parseObject(system ? message.attach : message.attachment);
    if (!content) return null;
    const operation = system ? content.operateInfo : content.voiceInfo;
    if (content.messageType !== (system ? 'VOICE_OPERATE' : 'TEAM_VOICE') || !operation) return null;
    const operateType = String(operation.operateType || '');
    if (!system && !['upVoice', 'downVoice', 'openVoice', 'closeVoice'].includes(operateType)) return null;
    const serverId = String(message.serverId || '');
    const channelId = String(system ? operation.targetChannel : message.channelId);
    if (!/^\d+$/.test(serverId) || !/^\d+$/.test(channelId) || !operateType) return null;
    const rawUsers = Array.isArray(operation.voiceStarInfoList) ? operation.voiceStarInfoList : [];
    const voiceUsers = rawUsers.filter(user => user && typeof user === 'object' && user.userId != null && String(user.userId).trim())
        .map(user => ({
            userId: String(user.userId).trim(), nickname: String(user.nickname || ''),
            avatar: String(user.avatar || ''), pfUrl: String(user.pfUrl || ''),
            micState: ![false, 0, '0', 'false'].includes(user.voiceStatus ?? user.micState ?? true)
        }));
    let streamUrl = '';
    try {
        const url = new URL(String(operation.streamUrl || ''));
        if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) streamUrl = url.href;
    } catch (_) {}
    let time = Number(message.time || 0);
    if (!Number.isFinite(time) || time < 0) time = 0;
    else if (time > 0 && time < 1e12) time *= 1000;
    const id = String(message.msgIdServer || message.msgIdClient || '');
    return {
        serverId, channelId, operateType, source: system ? 'system' : 'channel',
        time, id: id === '0' ? '' : id, streamUrl, voiceUsers,
        usersComplete: rawUsers.length > 0 && voiceUsers.length === rawUsers.length
    };
}

module.exports = { normalizeRoomVoiceEvent };
