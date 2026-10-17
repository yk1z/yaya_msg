(function () {
    const features = window.YayaRendererFeatures = window.YayaRendererFeatures || {};
    const giftTypes = new Set(['PRESENT', 'PRESENT_FULLSCREEN', 'PRESENT_FULLSCREEN_TWO', 'PRESENT_EMOTION']);
    const giftMessageTypes = new Set([...giftTypes, 'GIFT_TEXT', 'CHANNEL_PRESENT_TEXT', 'PRESENT_TEXT']);

    function object(value) {
        for (let depth = 0; depth < 2 && typeof value === 'string'; depth++) {
            if (value.length > 1024 * 1024) return null;
            try { value = JSON.parse(value.replace(/([:\[,]\s*)(\d{16,})(?=\s*[,}\]])/g, '$1"$2"')); }
            catch (_) { return null; }
        }
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }

    function mediaUrl(value) {
        const source = String(value || '').trim();
        if (!source) return '';
        try {
            const url = new URL(source, 'https://source.48.cn/');
            return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
                && (url.hostname === '48.cn' || url.hostname.endsWith('.48.cn')) ? url.href : '';
        } catch (_) { return ''; }
    }

    function parseGift(message = {}) {
        const data = [message.attachment, message.bodys, message.msgContent, message.body].map(object)
            .find(value => giftTypes.has(String(value?.messageType || message.msgType || '').toUpperCase()));
        if (!data) return null;
        const gift = object(data.giftInfo) || object(data.presentInfo);
        if (!gift) return null;
        const ext = object(message.extInfo) || object(message.ext) || {};
        const user = object(data.user) || object(ext.user) || {};
        const giftNum = Number(gift.giftNum ?? gift.num ?? 1);
        if (!Number.isSafeInteger(giftNum) || giftNum <= 0) return null;
        const rawTime = Number(message.time || message.msgTime || data.time || 0);
        const time = rawTime > 0 && rawTime < 1e12 ? rawTime * 1000 : rawTime;
        const ids = [gift.msgId, message.msgIdServer, message.msgIdClient, message.msgidClient, message.id]
            .filter(value => value != null && String(value) !== '' && String(value) !== '0').map(String);
        return {
            channelId: String(message.channelId || message.roomId || data.roomId || gift.roomId || ''),
            serverId: String(message.serverId || data.serverId || ''),
            giftName: String(gift.giftName || gift.name || '礼物'), giftNum,
            nick: String(user.nickName || user.nickname || user.name || gift.userName || message.fromNick || message.senderName || '用户'),
            giftPicPath: mediaUrl(gift.picPath), time, ids,
            fallbackKey: `${time}:${message.fromAccount || user.userId || gift.userId || ''}:${gift.giftId || gift.giftName || ''}:${giftNum}`,
            giftAnimation: { url: mediaUrl(gift.animationpath || gift.animationPath || gift.zipPath),
                md5: String(gift.zipMd5 || gift.animationMd5 || ''),
                resourceType: Number(gift.resourceType || 0), switchTime: Number(gift.switchTime || 0) }
        };
    }
    features.parseMemberRoomGiftMessage = parseGift;
    features.isMemberRoomGiftMessage = function (message = {}) {
        if (giftMessageTypes.has(String(message.msgType || message.messageType || '').toUpperCase())) return true;
        return [message.attachment, message.bodys, message.msgContent, message.body].map(object)
            .some(value => giftMessageTypes.has(String(value?.messageType || '').toUpperCase()));
    };
    features.isMemberRoomGiftAnimation = function (message = {}) {
        if (giftTypes.has(String(message.msgType || message.messageType || '').toUpperCase())) return true;
        return [message.attachment, message.bodys, message.msgContent, message.body].map(object)
            .some(value => giftTypes.has(String(value?.messageType || '').toUpperCase()));
    };

    features.createMemberRoomGiftEffects = function ({ ipcRenderer,
        getContainer = () => document.querySelector('#view-followed-rooms .followed-chat-message-stage'),
        reportError = console.warn } = {}) {
        const enabled = Boolean(window.desktop?.platform && window.desktop.platform !== 'web');
        const seen = new Map();
        const animation = enabled ? features.createDesktopLiveGiftAnimation?.({ ipcRenderer, reportError, getContainer,
            eventName: 'yaya:member-room-gift-animation-state', layerClassName: 'member-room-gift-animation' }) : null;
        let target = null;
        let enteredAt = 0;
        let observer = null;

        function clearVisuals() {
            animation?.clear();
        }

        function clear() {
            clearVisuals();
            seen.clear();
            target = null;
            observer?.disconnect();
            observer = null;
        }

        function setRoom(room) {
            if (!enabled) return;
            const next = { serverId: String(room?.serverId || ''), channelId: String(room?.channelId || '') };
            if (target?.serverId === next.serverId && target?.channelId === next.channelId) return;
            clear();
            if (!next.serverId || !next.channelId) return;
            target = next;
            enteredAt = Date.now();
            const view = document.getElementById('view-followed-rooms');
            if (view) {
                observer = new MutationObserver(() => {
                    if (!getContainer()?.getClientRects().length) clearVisuals();
                });
                observer.observe(view, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
            }
        }

        function receive(message) {
            if (!enabled || !target) return false;
            const item = parseGift(message);
            if (!item || item.channelId !== target.channelId
                || (item.serverId && item.serverId !== target.serverId)
                || !item.giftAnimation.url
                || (item.time && item.time < enteredAt - 2000)) return false;
            const keys = item.ids.length ? item.ids : [item.fallbackKey];
            const previous = keys.map(key => seen.get(key)).find(value => value
                && (item.ids.length || item.time || Date.now() - value.createdAt < 1500));
            const state = previous || { animated: false, createdAt: Date.now() };
            keys.forEach(key => seen.set(key, state));
            while (seen.size > 2000) seen.delete(seen.keys().next().value);
            const parent = getContainer();
            if (!parent?.isConnected || !parent.getClientRects().length) {
                state.animated = true;
                return false;
            }
            if (item.giftAnimation.url && !state.animated) {
                state.animated = true;
                animation?.enqueue(item);
            }
            return !previous;
        }

        window.addEventListener('pagehide', clear);
        return { setRoom, receive, clear };
    };
})();
