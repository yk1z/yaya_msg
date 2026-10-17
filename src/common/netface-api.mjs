export function createNetfaceMethods({ postJson, createHeaders, apiError }) {
    const base = 'https://pocketapi.48.cn/netface/api/v1/';
    const id = (value, name) => {
        const result = String(value ?? '').trim();
        if (!/^\d{1,32}$/.test(result)) throw new Error(`无效的${name}`);
        return result;
    };
    async function request(path, payload, body, method = 'POST', attachAppInfo = false) {
        if (!payload.token) return { success: false, msg: '请先登录口袋48账号' };
        const headers = createHeaders(payload.token, payload.pa);
        headers.token = payload.token;
        if (attachAppInfo) body = { ...body, appInfo: headers.appInfo };
        let response;
        if (method === 'GET') {
            const res = await fetch(base + path, { headers, signal: AbortSignal.timeout(15000) });
            response = { status: res.status, data: await res.json() };
        } else {
            response = await postJson(base + path, body, headers, { largeNumbers: true, timeoutMs: 15000 });
        }
        if (response.status === 200 && response.data?.status === 200) {
            return { success: true, content: response.data.content };
        }
        return apiError(response, '云握手请求失败');
    }
    return {
        fetchNetfaceActivities: (p = {}) => request('user/tp/ticket_info', p, {}),
        fetchNetfaceEvents: (p = {}) => request('user/reservation/info', p, { ticketId: id(p.ticketId ?? '0', '活动 ID') }),
        fetchNetfaceBalance: (p = {}) => request('user/tp/balance', p, { ticketId: id(p.ticketId ?? '0', '活动 ID') }),
        fetchNetfaceWait: (p = {}) => {
            if (!Array.isArray(p.eventIds) || !p.eventIds.length || p.eventIds.length > 100) throw new Error('请选择有效的预约');
            return request('user/batch/balancetime', p, { eventIds: p.eventIds.map(v => id(v, '场次 ID')) });
        },
        reserveNetface: (p = {}) => {
            if (!Number.isInteger(p.tpNum) || p.tpNum < 1 || p.tpNum > 999) throw new Error('握手资格数量须为 1–999 的整数');
            return request('user/reservation', p, { eventId: id(p.eventId, '场次 ID'), tpNum: p.tpNum });
        },
        cancelNetface: (p = {}) => request('user/reservation/cancel', p, { eventId: id(p.eventId, '场次 ID') }),
        joinNetface: (p = {}) => request('user/join/room', p, { eventId: id(p.eventId, '场次 ID') }),
        quitNetface: (p = {}) => request('user/quit', p, { eventId: id(p.eventId, '场次 ID') }),
        activateNetfaceKey: (p = {}) => {
            const tpKey = String(p.tpKey || '').trim();
            if (!tpKey || tpKey.length > 256) throw new Error('请输入有效的兑换码');
            return request('user/act/key', p, { ticketId: id(p.ticketId ?? '0', '活动 ID'), tpKey }, 'POST', true);
        },
        fetchNetfaceHistory: (p = {}) => request('user/act/log', p, { ticketId: id(p.ticketId ?? '0', '活动 ID'), next: Math.max(0, Math.trunc(Number(p.next) || 0)) }),
        fetchNetfaceRtcConfig: (p = {}) => request('zego/config?sdkVer=v2', p, null, 'GET')
    };
}
