'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const settingsService = require('./settings-service');
const { ensureWasmLoaded, generatePa } = require('./wasm-service');
const sending = new Set();
let runtimePromise;

async function invoke(method, payload) {
    try {
        const token = settingsService.getToken();
        if (!token) return { success: false, msg: '请先登录口袋48账号' };
        await ensureWasmLoaded();
        runtimePromise ||= import(pathToFileURL(path.join(__dirname, '../../common/pocket-runtime.mjs')).href);
        const runtime = await runtimePromise;
        return await runtime[method]({ ...payload, token, pa: generatePa() || '' });
    } catch (error) {
        return { success: false, msg: error.message || '房间送礼暂不可用' };
    }
}

function fetchMemberRoomGifts(payload = {}) {
    return invoke('fetchMemberRoomGiftContext', payload);
}

async function sendMemberRoomGift(senderId, payload = {}) {
    if (sending.has(senderId)) return { success: false, msg: '上一笔送礼尚未结束，请稍候' };
    sending.add(senderId);
    try {
        return await invoke('sendMemberRoomGift', payload);
    } finally {
        sending.delete(senderId);
    }
}

module.exports = { fetchMemberRoomGifts, sendMemberRoomGift };
