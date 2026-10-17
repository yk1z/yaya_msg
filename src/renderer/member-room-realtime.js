(function () {
    const features = window.YayaRendererFeatures = window.YayaRendererFeatures || {};
    const hiddenTypes = new Set(['PRESENT', 'PRESENT_FULLSCREEN', 'PRESENT_FULLSCREEN_TWO', 'PRESENT_EMOTION']);
    const giftTextTypes = new Set(['GIFT_TEXT', 'CHANNEL_PRESENT_TEXT', 'PRESENT_TEXT']);
    const supportedTypes = new Set(['TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'REPLY', 'GIFTREPLY', 'EXPRESSIMAGE', 'GIFT_TEXT']);

    function parse(value) {
        if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        try {
            for (let i = 0; i < 2 && typeof value === 'string'; i++) value = JSON.parse(value.replace(/([:\[,]\s*)(\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
            return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
        } catch (_) { return null; }
    }

    function mediaUrl(value, base = 'https://source.48.cn/') {
        if (!String(value || '').trim()) return '';
        try {
            const url = new URL(String(value), base);
            return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
        } catch (_) { return ''; }
    }

    function aliases(message = {}) {
        return [...new Set([message.msgIdClient, message.msgidClient, message.msgIdServer, message.msgId, message.id]
            .filter(value => value != null && String(value) !== '' && String(value) !== '0').map(String))];
    }

    function normalize(message = {}) {
        const ext = parse(message.ext || message.extInfo) || {};
        const user = parse(ext.user) || {};
        let content = parse(message.attachment);
        let type = String(content?.messageType || message.msgType || '').toUpperCase();
        if (type === 'TEXT' && !content) content = { text: String(message.body ?? '') };
        const wireType = Number(message.type);
        if (hiddenTypes.has(type)) return { handled: true, record: null };
        if (giftTextTypes.has(type)) type = 'GIFT_TEXT';
        if (!type && (wireType === 0 || message.type === 'text')) {
            type = 'TEXT';
            content = { text: String(message.body ?? '') };
        } else if (!type && [1, 2, 3].includes(wireType)) {
            type = ({ 1: 'IMAGE', 2: 'AUDIO', 3: 'VIDEO' })[wireType];
            content = parse(message.attachment);
        }
        if (!supportedTypes.has(type) || !content) return { handled: false, record: null };
        content = { ...content };
        if (type === 'GIFT_TEXT' && content.giftInfo) content.giftInfo = parse(content.giftInfo) || {};
        if (type === 'IMAGE' || type === 'AUDIO' || type === 'VIDEO') {
            content.url = mediaUrl(content.url, type === 'IMAGE' ? 'https://source3.48.cn/' : 'https://mp4.48.cn/');
            if (!content.url) return { handled: false, record: null };
        }
        if (type === 'EXPRESSIMAGE') {
            const url = mediaUrl(content.expressImgInfo?.emotionRemote || content.url, 'https://source3.48.cn/');
            if (!url) return { handled: false, record: null };
            content = { ...content, url, expressImgInfo: { ...content.expressImgInfo, emotionRemote: url } };
        }
        if (type === 'REPLY' || type === 'GIFTREPLY') {
            const info = parse(content.replyInfo || content.giftReplyInfo);
            if (!info) return { handled: false, record: null };
            content[type === 'REPLY' ? 'replyInfo' : 'giftReplyInfo'] = info;
        }
        const ids = aliases(message);
        let time = Number(message.time || message.msgTime);
        if (!ids.length || !Number.isFinite(time) || time <= 0) return { handled: false, record: null };
        if (time < 1e12) time *= 1000;
        const safeUser = { ...user, avatar: mediaUrl(user.avatar) };
        return { handled: true, record: {
            serverId: String(message.serverId || ''), channelId: String(message.channelId || ''),
            msgIdClient: String(message.msgIdClient || message.msgidClient || ''), msgIdServer: String(message.msgIdServer || ''),
            msgId: ids[0], msgTime: time, msgType: type,
            senderName: String(user.nickName || user.nickname || message.fromNick || '用户'),
            senderUserId: String(user.userId || user.id || ''), senderId: String(message.fromAccount || ''),
            extInfo: { ...ext, user: safeUser }, bodys: content
        } };
    }

    features.memberRoomRealtime = { normalize, aliases };
})();
