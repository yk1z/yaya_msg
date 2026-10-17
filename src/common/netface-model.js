(function (root, factory) {
    if (typeof window === 'object') root.YayaNetfaceModel = factory();
    else if (typeof module === 'object' && module.exports) module.exports = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    const statusText = ['不可预约', '可预约', '排队中', '等待进入', '等待进入', '超时未入场'];
    function ticketId(input) {
        const value = String(input || '').trim();
        if (!value) return '0';
        if (/^\d{1,32}$/.test(value)) return value;
        let url;
        try { url = new URL(value); } catch { throw new Error('请输入口袋官方活动链接或活动编号'); }
        if (!((url.protocol === 'https:' && (url.hostname === 'h5.48.cn' || url.hostname === 'pocket.48.cn'))
            || (['pocket48:', 'snh48:'].includes(url.protocol) && (url.pathname.includes('netface') || url.hostname === 'netface')))) throw new Error('请使用口袋官方云握手活动链接');
        const result = url.searchParams.get('ticketId') || (url.pathname.includes('/netface/') ? url.searchParams.get('id') : null);
        if (!/^\d{1,32}$/.test(result || '')) throw new Error('该链接没有包含云握手活动编号');
        return result;
    }
    function events(info = {}) {
        const reservations = info.reservations || info.netfaceEventInfos || [];
        const alreadyReservations = info.alreadyReservations || info.orderedEventInfos || [];
        const ordered = new Set(alreadyReservations.map(v => String(v.eventId)));
        const queue = new Map((info.eventIds || []).map(v => [String(v.eventId), v]));
        const map = new Map();
        for (const item of [...reservations, ...alreadyReservations]) {
            if (item?.eventId == null) continue;
            const eventId = String(item.eventId);
            const merged = { ...map.get(eventId), ...item, eventId };
            merged.ordered = ordered.has(eventId) || Number(merged.status) >= 2;
            const position = queue.get(eventId);
            if (position?.queueNumber != null) merged.queneNumber = String(position.queueNumber);
            if (position?.duration != null) merged.orderedTime = position.duration;
            map.set(eventId, merged);
        }
        return [...map.values()];
    }
    function signal(message = {}) {
        let extension = message.custom || message.msg_setting_?.ext_ || message.remoteExtension || {};
        if (typeof extension === 'string') {
            try { extension = JSON.parse(extension.replace(/(:\s*)(\d{15,})(?=\s*[,}])/g, '$1"$2"')); } catch { return null; }
        }
        if (!extension || typeof extension !== 'object' || Array.isArray(extension)) return null;
        if (!String(extension.messageType || '').startsWith('NETFACE_')) return null;
        return extension;
    }
    function session(info = {}, now = Date.now()) {
        const started = Number(info.joinStatus) === 1;
        const value = Number(info.remainingTime);
        const remaining = Math.max(0, Number.isFinite(value) ? value : 0);
        const paused = started && Number(info.eventPauseStatus || 0) !== 0;
        return { started, paused, deadline: started ? now + remaining * 1000 : 0, remainingTime: remaining };
    }
    function room(info, account) {
        const starId = String(info.starInfo?.userId || '');
        const userId = String(account.userId || '');
        if (!/^\d+$/.test(starId) || !/^\d+$/.test(userId) || !info.reservationId) throw new Error('口袋没有返回完整的入场信息');
        return { roomId: `netface-${starId}`, streamId: `netface-${userId}-${starId}`,
            starStreamId: `netface-${starId}`, userId, userName: String(account.nickname || userId) };
    }
    function deviceConstraints(selection = {}) {
        const constraint = device => device?.id ? { deviceId: { exact: device.id } } : true;
        return { audio: constraint(selection.audio), video: constraint(selection.video) };
    }
    function deviceName(value) {
        return String(value || '').normalize('NFKC').replace(/^(default|communications|默认|通信)\s*[-–:]\s*/i, '')
            .replace(/\s*\([a-f\d]{4}:[a-f\d]{4}\)\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
    function rtcDeviceId(list, selection, label) {
        if (!selection?.id || selection.id === 'default') return '';
        const devices = Array.isArray(list) ? list : [];
        const exact = devices.find(device => device.deviceID === selection.id);
        if (exact) return exact.deviceID;
        const name = deviceName(selection.label);
        const matches = name ? devices.filter(device => deviceName(device.deviceName) === name && device.deviceID) : [];
        if (matches.length === 1) return matches[0].deviceID;
        throw new Error(`无法确定所选${label}，请在设备检查中重新选择`);
    }
    function applyRtcDevices(engine, selection = {}) {
        const audio = selection.audio?.id ? rtcDeviceId(engine.getAudioDeviceList(0), selection.audio, '麦克风') : '';
        const video = selection.video?.id ? rtcDeviceId(engine.getVideoDeviceList(), selection.video, '摄像头') : '';
        if (audio) engine.useAudioDevice(audio, 0);
        if (video) engine.useVideoDevice(video);
    }
    return { events, signal, session, room, statusText, ticketId, deviceConstraints, deviceName, rtcDeviceId, applyRtcDevices };
});
