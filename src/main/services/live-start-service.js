'use strict';

const { createRoomNotificationService } = require('./room-notification-service');

function parseLivePush(message) {
    let content = message.attachment;
    try {
        for (let depth = 0; depth < 2 && typeof content === 'string'; depth++) {
            content = JSON.parse(content.replace(/([:\[,]\s*)(\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
        }
    } catch (_) { return null; }
    if (!['LIVEPUSH', 'LIVE_PUSH'].includes(String(content?.messageType || '').toUpperCase())) return null;
    const liveId = String(content.livePushInfo?.liveId || content.liveId || '');
    if (!/^\d{1,32}$/.test(liveId)) return null;
    return { serverId: message.serverId, channelId: message.channelId, liveId, time: message.time };
}

module.exports = createRoomNotificationService({ prefix: 'live-start', mapMessage: parseLivePush });
