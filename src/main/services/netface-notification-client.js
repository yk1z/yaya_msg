'use strict';

const { createSharedMemberRoomClient } = require('./member-room-transport');
const { signal } = require('../../common/netface-model');

function createNetfaceNotificationClient(options, { createClient = createSharedMemberRoomClient } = {}) {
    let client;
    let rejectConnect;
    let stopped = false;

    function destroy() {
        if (stopped) return;
        stopped = true;
        rejectConnect?.(new Error('云握手通知连接已取消'));
        rejectConnect = null;
        try { Promise.resolve(client?.destroy()).catch(() => {}); } catch {}
        client = null;
    }

    async function connect() {
        if (stopped || client) throw new Error('云握手通知连接不可重复使用');
        const cancelled = new Promise((_resolve, reject) => { rejectConnect = reject; });
        try {
            client = createClient({
                appKey: options.appKey, account: options.account, token: options.token,
                clientProfile: options.clientProfile, deviceId: options.deviceId, rooms: [],
                onConnected: details => { if (!stopped) options.onConnected?.(details); },
                onDisconnected: details => { if (!stopped) options.onDisconnected?.(details); },
                onDiagnostic: details => { if (!stopped) options.onDiagnostic?.(details); },
                onError: cause => {
                    if (!stopped) options.onError?.(Object.assign(new Error('云信通知数据接收异常'), { code: cause?.code, reason: cause?.reason, cause }));
                },
                onCustomNotification: notification => {
                    if (!stopped && signal({ custom: notification.content })) options.onMessage?.({ ...notification, custom: notification.content });
                    else if (!stopped && String(notification.content || '').includes('NETFACE_')) options.onDiagnostic?.({ phase: 'notification-rejected', notification });
                }
            });
            await Promise.race([client.connect(), cancelled]);
            if (stopped) throw new Error('云握手通知连接已取消');
        } catch (cause) {
            const cancelledByUser = stopped;
            const code = Number.isInteger(cause?.code) || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNABORTED'].includes(cause?.code) ? cause.code : undefined;
            const error = new Error(cancelledByUser ? '云握手通知连接已取消' : `云信自定义通知连接失败${code ? ` (${code})` : ''}`);
            error.code = code;
            error.cause = cause;
            rejectConnect = null;
            destroy();
            if (!cancelledByUser) options.onError?.(error);
            throw error;
        } finally {
            rejectConnect = null;
        }
    }

    return { connect, destroy };
}

module.exports = { createNetfaceNotificationClient };
