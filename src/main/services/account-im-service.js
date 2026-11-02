'use strict';

const APP_KEY = '632feff1f4c838541ab75195d1ceb3fa';

function createAccountImService({ readAuth, resolveCredentials, createClient, onReset = () => {},
    setTimer = setTimeout, clearTimer = clearTimeout }) {
    const owners = new Map();
    const observed = new WeakSet();
    let current = null;

    function keyOf(auth) {
        return JSON.stringify([auth.token || '', auth.clientProfile || '', auth.deviceId || '']);
    }

    function isCurrent(state) {
        return current === state && owners.size > 0 && keyOf(readAuth()) === state.key;
    }

    function emit(state, status) {
        if (!isCurrent(state)) return;
        state.status = status;
        for (const sender of owners.values()) {
            if (!sender.isDestroyed()) sender.send('account-im-status', { status });
        }
    }

    function stopCurrent() {
        const previous = current;
        current = null;
        if (!previous) return;
        clearTimer(previous.timer);
        previous.client?.destroy();
        previous.client = null;
    }

    function closeAll() {
        stopCurrent();
        owners.clear();
        onReset();
    }

    function scheduleRetry(state) {
        if (!isCurrent(state) || state.timer) return;
        const delay = [3000, 10000, 30000, 60000][Math.min(state.attempt++, 3)];
        emit(state, 'reconnecting');
        state.timer = setTimer(() => {
            state.timer = null;
            if (isCurrent(state)) void connectState(state);
        }, delay);
        state.timer?.unref?.();
    }

    function connectState(state) {
        if (state.pending) return state.pending;
        const pending = (async () => {
            let client;
            try {
                if (!isCurrent(state)) return { success: false, status: 'cancelled' };
                emit(state, 'connecting');
                const credentials = await resolveCredentials(state.auth);
                if (!isCurrent(state)) return { success: false, status: 'cancelled' };
                if (!credentials?.success || !credentials.token || !(credentials.account || credentials.accid)) {
                    throw new Error('云信登录凭证暂不可用');
                }
                client = createClient({
                    appKey: APP_KEY,
                    account: String(credentials.account || credentials.accid),
                    token: credentials.token,
                    clientProfile: state.auth.clientProfile,
                    deviceId: state.auth.deviceId,
                    // A zero-room consumer keeps the shared login alive, without
                    // entering a member room or consuming a channel subscription.
                    rooms: [],
                    onDisconnected() {
                        if (!isCurrent(state) || state.client !== client) return;
                        state.client = null;
                        client.destroy();
                        scheduleRetry(state);
                    }
                });
                state.client = client;
                await client.connect();
                if (!isCurrent(state) || state.client !== client) {
                    client.destroy();
                    return { success: false, status: 'cancelled' };
                }
                clearTimer(state.timer);
                state.timer = null;
                state.attempt = 0;
                emit(state, 'connected');
                return { success: true, status: 'connected' };
            } catch (_) {
                client?.destroy();
                if (!isCurrent(state)) return { success: false, status: 'cancelled' };
                state.client = null;
                scheduleRetry(state);
                return { success: false, status: 'reconnecting', msg: '云信连接暂时不可用，正在重试' };
            }
        })();
        state.pending = pending;
        void pending.finally(() => {
            if (state.pending === pending) state.pending = null;
            if (isCurrent(state) && !state.client && !state.timer) scheduleRetry(state);
        });
        return pending;
    }

    function connect(sender) {
        const auth = readAuth();
        if (!auth.token || sender.isDestroyed()) {
            if (!auth.token) closeAll();
            return Promise.resolve({ success: false, status: 'disconnected' });
        }
        const key = keyOf(auth);
        if (current && current.key !== key) closeAll();
        owners.set(sender.id, sender);
        if (!observed.has(sender)) {
            observed.add(sender);
            sender.once('destroyed', () => {
                owners.delete(sender.id);
                if (!owners.size) stopCurrent();
            });
        }
        if (!current) current = { key, auth: { ...auth }, client: null, pending: null, timer: null, attempt: 0 };
        if (current.client?.connected) return Promise.resolve({ success: true, status: 'connected' });
        if (current.timer) return Promise.resolve({ success: false, status: 'reconnecting' });
        return connectState(current);
    }

    return { connect, closeAll };
}

let shared;
function accountImService() {
    if (shared) return shared;
    const settings = require('./settings-service');
    const pocket = require('./pocket-service');
    const wasm = require('./wasm-service');
    const transport = require('./member-room-transport');
    shared = createAccountImService({
        readAuth() {
            const saved = settings.readSettings();
            return { token: saved.p48Token || '', clientProfile: saved.p48ClientProfile || '', deviceId: saved.p48ClientDeviceId || '' };
        },
        async resolveCredentials(auth) {
            await wasm.ensureWasmLoaded();
            return pocket.invoke('get-nim-login-info', { ...auth, pa: wasm.generatePa() || '' });
        },
        createClient: transport.createSharedMemberRoomClient,
        onReset() {
            require('./member-room-service').closeAllMemberRoomConnections();
            require('./room-notification-service').closeAll();
            require('./danmaku-service').closeAllLiveDanmakuConnections();
            transport.closeMemberRoomTransport();
        }
    });
    settings.onAuthChange(() => shared.closeAll());
    return shared;
}

module.exports = {
    createAccountImService,
    initialize: accountImService,
    connect: sender => accountImService().connect(sender),
    closeAll: () => { shared?.closeAll(); }
};
