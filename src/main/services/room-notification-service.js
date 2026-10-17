'use strict';

const { createSharedMemberRoomClient } = require('./member-room-transport');
const pocketService = require('./pocket-service');
const settingsService = require('./settings-service');
const { ensureWasmLoaded, generatePa } = require('./wasm-service');
const states = new Map();
const observed = new WeakSet();
const APP_KEY = '632feff1f4c838541ab75195d1ceb3fa';

function isCurrent(state) {
    return states.get(state.sender.id) === state && !state.sender.isDestroyed()
        && !!state.token && settingsService.getToken() === state.token;
}

function emit(state, channel, payload) {
    if (isCurrent(state)) state.sender.send(channel, { requestId: state.requestId, ...payload });
}

function stop(senderId, requestId) {
    const state = states.get(senderId);
    if (!state || (requestId && requestId !== state.requestId)) return false;
    states.delete(senderId);
    clearTimeout(state.timer);
    state.client?.destroy();
    return true;
}

function retry(state, delay) {
    clearTimeout(state.timer);
    if (!isCurrent(state)) { stop(state.sender.id, state.requestId); return; }
    state.timer = setTimeout(() => { void connect(state); }, delay);
    state.timer.unref?.();
}

async function connect(state) {
    if (!isCurrent(state)) { stop(state.sender.id, state.requestId); return; }
    if (state.client?.connected && state.complete) { state.attempt = 0; retry(state, 60000); return; }
    emit(state, 'room-notification-status', { status: 'connecting', accepted: [] });
    state.client?.destroy();
    state.client = null;
    try {
        await ensureWasmLoaded();
        if (!isCurrent(state)) return;
        const credentials = await pocketService.invoke('get-nim-login-info', { token: state.token, pa: generatePa() || '' });
        if (!isCurrent(state)) return;
        if (!credentials?.success) throw new Error(credentials?.msg || '获取云信登录凭证失败');
        const client = createSharedMemberRoomClient({
            appKey: APP_KEY, account: String(credentials.account || credentials.accid || ''), token: credentials.token,
            rooms: state.rooms.slice(0, 99), allowPartial: true,
            onMessage: message => emit(state, 'room-notification-message', { message }),
            onDisconnected() {
                if (state.client !== client) return;
                emit(state, 'room-notification-status', { status: 'disconnected', accepted: [] });
                retry(state, [3000, 10000, 30000, 60000][Math.min(state.attempt++, 3)]);
            }
        });
        state.client = client;
        const result = await client.connect();
        if (!isCurrent(state)) { client.destroy(); return; }
        state.complete = result.accepted.length === Math.min(state.rooms.length, 99);
        emit(state, 'room-notification-status', {
            status: 'connected', accepted: result.accepted,
            failed: [...result.failed, ...state.rooms.slice(99).map(room => ({ ...room, message: '超出实时订阅范围，使用 API 补查' }))]
        });
        retry(state, 60000);
    } catch (_) {
        if (!isCurrent(state)) return;
        state.client?.destroy();
        state.client = null;
        emit(state, 'room-notification-status', { status: 'disconnected', accepted: [] });
        retry(state, [3000, 10000, 30000, 60000][Math.min(state.attempt++, 3)]);
    }
}

function configure(sender, payload = {}) {
    const requestId = String(payload.requestId || '');
    if (!/^[a-zA-Z0-9_-]{1,96}$/.test(requestId)) throw new Error('无效的消息提醒连接 ID');
    if (!Array.isArray(payload.rooms) || payload.rooms.length > 5000) throw new Error('无效的消息提醒房间列表');
    const rooms = [...new Map(payload.rooms.map(room => {
        const serverId = String(room.serverId || '');
        const channelId = String(room.channelId || '');
        if (!/^\d{1,32}$/.test(serverId) || !/^\d{1,32}$/.test(channelId)) throw new Error('无效的消息提醒房间 ID');
        return [`${serverId}:${channelId}`, { serverId, channelId }];
    })).values()];
    stop(sender.id);
    if (!rooms.length) return { success: true };
    const token = settingsService.getToken();
    if (!token) throw new Error('请先登录口袋48账号');
    const state = { sender, requestId, token, rooms, timer: null, client: null, attempt: 0 };
    states.set(sender.id, state);
    if (!observed.has(sender)) {
        observed.add(sender);
        sender.once('destroyed', () => stop(sender.id));
    }
    void connect(state);
    return { success: true };
}

function closeAll() { for (const id of states.keys()) stop(id); }
module.exports = { configure, stop, closeAll };
