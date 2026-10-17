'use strict';

const RETRY_DELAYS_MS = [350, 900];
const LIVE_READ_PATHS = new Set(['/live/api/v1/live/getLiveList', '/live/api/v1/live/getLiveOne']);

function readPayload(value) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(String(value || '{}')); } catch { return {}; }
}

async function runLiveReadRequest(apiPath, payload, execute, options = {}) {
    if (!LIVE_READ_PATHS.has(apiPath)) return execute(0);
    const request = readPayload(payload) || {};
    const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const warn = options.warn || ((...args) => console.warn(...args));
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        const result = await execute(attempt);
        const failed = result?.success === false || (result?.status !== undefined && Number(result.status) !== 200);
        if (!failed) return result;
        const message = String(result?.msg || result?.message || '');
        const retry = /^参数错误[。.!！]?$/.test(message.trim()) && attempt < RETRY_DELAYS_MS.length;
        const parameters = Object.fromEntries(['liveId', 'next', 'groupId', 'record'].filter(key => request[key] !== undefined).map(key => [key, request[key]]));
        warn('[口袋直播] 只读查询失败:', {
            path: apiPath, parameters, attempt: attempt + 1,
            apiStatus: result?.data?.status ?? result?.data?.code ?? result?.status ?? null,
            message, retry
        });
        if (!retry) return result;
        await wait(RETRY_DELAYS_MS[attempt]);
    }
}

module.exports = { runLiveReadRequest };
