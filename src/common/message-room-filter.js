(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.YayaMessageRoomFilter = api;
})(typeof window !== 'undefined' ? window : null, function () {
    const cachedIds = new WeakMap();
    function normalizeMessageRoomIds(values) {
        return [...new Set((Array.isArray(values) ? values : []).map(String)
            .filter(value => /^[1-9]\d{0,31}$/.test(value)))];
    }
    function mergeMessageRoomHistory(history = {}, members = []) {
        const result = {};
        for (const type of ['big', 'small']) {
            const keys = type === 'small' ? ['yklzId', 'smallRoomId', 'smallChannelId'] : ['channelId', 'roomId', 'channel_id'];
            result[type] = normalizeMessageRoomIds([...(Array.isArray(history[type]) ? history[type] : []),
                ...(Array.isArray(members) ? members : []).filter(Boolean).flatMap(member => keys.map(key => member[key]))]);
        }
        return result;
    }
    function getMessageRoomChannelIds(members, roomType, history = {}) {
        const merged = mergeMessageRoomHistory(history, members);
        const opposite = new Set(merged[roomType === 'small' ? 'big' : 'small']);
        return merged[roomType === 'small' ? 'small' : 'big'].filter(id => !opposite.has(id));
    }
    function getMessageRoomMetadata(record = {}, sourceFile = '') {
        const roomType = [record.roomType, record.source?.roomType].find(value => value === 'big' || value === 'small') || '';
        const file = String(sourceFile || record.sourceFile || record.fileName || record.sourcePath || '');
        const channelId = normalizeMessageRoomIds([record.channelId, record.source?.channelId])[0]
            || file.match(/-([1-9]\d{0,31})\.(?:jsonl|json)$/i)?.[1] || '';
        return { roomType, channelId };
    }
    function matchesMessageRoom(record, filters = {}) {
        if (filters.roomType !== 'big' && filters.roomType !== 'small') return true;
        const source = getMessageRoomMetadata(record);
        if (source.roomType) return source.roomType === filters.roomType;
        let ids = cachedIds.get(filters);
        if (!ids) { ids = new Set(normalizeMessageRoomIds(filters.channelIds)); cachedIds.set(filters, ids); }
        return !!source.channelId && ids.has(source.channelId);
    }
    return { normalizeMessageRoomIds, getMessageRoomChannelIds, matchesMessageRoom, getMessageRoomMetadata, mergeMessageRoomHistory };
});
