'use strict';

const { createNimCommonlinkQChatClient } = require('../../common/nim-commonlink-qchat');

function createMemberRoomTransport(createClient = createNimCommonlinkQChatClient) {
    const sessions = new Map();
    const keyOf = room => `${room.serverId}:${room.channelId}`;

    async function prune(current) {
        const desired = new Set([...current.consumers].flatMap(item => item.rooms.map(keyOf)));
        for (const [roomKey, subscription] of current.subscriptions) {
            if (desired.has(roomKey)) continue;
            await current.client.unsubscribeChannel(subscription.serverId, subscription.channelId, subscription.visitor);
            current.subscriptions.delete(roomKey);
        }
        const servers = new Set([...current.consumers].filter(item => item.options.voiceEvents)
            .flatMap(item => item.rooms.map(room => room.serverId)));
        for (const [serverId, subscription] of current.voiceServers) {
            if (servers.has(serverId)) continue;
            await current.client.unsubscribeVoiceServer(serverId, subscription.visitor);
            current.voiceServers.delete(serverId);
        }
    }

    function retire(session, notify = false) {
        if (session.closed) return;
        session.closed = true;
        if (sessions.get(session.key) === session) sessions.delete(session.key);
        session.client.destroy();
        if (notify) for (const consumer of session.consumers) consumer.options.onDisconnected?.();
    }

    function create(options) {
        const rooms = options.rooms || [{ serverId: options.serverId, channelId: options.channelId }];
        let session;
        let disposed = false;
        const consumer = { options, rooms, requested: new Set(rooms.map(keyOf)), accepted: new Set(),
            voiceAccepted: new Set(), voiceStartAccepted: new Set() };
        const facade = {
            get connected() { return !disposed && !!session?.client.connected && !session.closed; },
            async connect() {
                if (disposed) throw new Error('成员房间连接已取消');
                const key = JSON.stringify([options.appKey, options.account, options.clientProfile || 'seine48', options.deviceId || '']);
                session = sessions.get(key);
                if (!session) {
                    session = { key, consumers: new Set(), subscriptions: new Map(), voiceServers: new Map(), closed: false, queue: Promise.resolve() };
                    const current = session;
                    current.client = createClient({
                        appKey: options.appKey, account: options.account, token: options.token,
                        clientProfile: options.clientProfile, deviceId: options.deviceId,
                        onDisconnected: () => retire(current, true),
                        onError: error => {
                            for (const item of current.consumers) item.options.onError?.(error);
                        },
                        onMessage: message => {
                            if (current.closed) return;
                            const roomKey = keyOf(message);
                            for (const item of current.consumers) {
                                if (item.accepted.has(roomKey)) item.options.onMessage?.(message);
                            }
                        },
                        onVoiceEvent: event => {
                            if (current.closed) return;
                            const roomKey = keyOf(event);
                            for (const item of current.consumers) {
                                const systemEvent = event.source === 'system';
                                if (item.requested.has(roomKey) && (systemEvent
                                    ? item.voiceStartAccepted.has(roomKey) : item.accepted.has(roomKey))) {
                                    item.options.onVoiceEvent?.(event);
                                }
                            }
                        }
                    });
                    sessions.set(key, current);
                    current.ready = Promise.resolve().then(() => {
                        if (current.closed) throw new Error('成员房间连接已取消');
                        return current.client.connect();
                    }).catch(error => {
                        retire(current, true);
                        throw error;
                    });
                }
                const current = session;
                current.consumers.add(consumer);
                try {
                    await current.ready;
                    if (disposed || current.closed) throw new Error('成员房间连接已取消');
                    const enqueue = work => {
                        const pending = current.queue.catch(() => {}).then(work);
                        current.queue = pending;
                        return pending;
                    };
                    await enqueue(async () => {
                        if (disposed || current.closed) throw new Error('成员房间连接已取消');
                        await prune(current);
                    });
                    const failed = [];
                    const serverFailures = new Map();
                    if (options.voiceEvents) {
                        for (const serverId of new Set(rooms.map(room => room.serverId))) {
                            try {
                                await enqueue(async () => {
                                    if (disposed || current.closed) throw new Error('成员房间连接已取消');
                                    if (!current.voiceServers.has(serverId)) {
                                        const subscription = await current.client.subscribeVoiceServer(serverId);
                                        if (current.closed) throw new Error('成员房间连接已取消');
                                        current.voiceServers.set(serverId, subscription);
                                        if (disposed) throw new Error('成员房间连接已取消');
                                    }
                                    for (const room of rooms) {
                                        if (room.serverId === serverId) consumer.voiceStartAccepted.add(keyOf(room));
                                    }
                                });
                            } catch (error) {
                                if (disposed || current.closed) throw error;
                                serverFailures.set(serverId, { message: error.message, code: error.code });
                                if (![403, 404].includes(Number(error.code))) break;
                            }
                        }
                    }
                    for (const room of rooms) {
                        if (disposed || current.closed) throw new Error('成员房间连接已取消');
                        const roomKey = keyOf(room);
                        try {
                            await enqueue(async () => {
                                if (disposed || current.closed) throw new Error('成员房间连接已取消');
                                if (!current.subscriptions.has(roomKey)) {
                                    const result = await current.client.subscribeChannel(room.serverId, room.channelId);
                                    if (current.closed) throw new Error('成员房间连接已断开');
                                    current.subscriptions.set(roomKey, { ...room, visitor: result.visitor });
                                }
                                consumer.accepted.add(roomKey);
                            });
                        } catch (error) {
                            failed.push({ ...room, message: error.message });
                            if (!options.allowPartial) throw error;
                            if (![403, 404].includes(Number(error.code))) break;
                        }
                    }
                    if (options.voiceEvents) {
                        for (const room of rooms) {
                            const roomKey = keyOf(room);
                            if (consumer.accepted.has(roomKey) && consumer.voiceStartAccepted.has(roomKey)) consumer.voiceAccepted.add(roomKey);
                        }
                    }
                    const result = { accepted: rooms.filter(room => consumer.accepted.has(keyOf(room))),
                        voiceAccepted: rooms.filter(room => consumer.voiceAccepted.has(keyOf(room))),
                        voiceStartAccepted: rooms.filter(room => consumer.voiceStartAccepted.has(keyOf(room))),
                        failed: rooms.filter(room => !consumer.accepted.has(keyOf(room))).map(room =>
                            failed.find(item => keyOf(item) === keyOf(room)) || { ...room, message: '等待重新订阅' }),
                        voiceFailed: options.voiceEvents ? rooms.filter(room => !consumer.voiceAccepted.has(keyOf(room))).map(room => ({
                            ...room, ...(serverFailures.get(room.serverId)
                                || failed.find(item => keyOf(item) === keyOf(room)) || { message: '等待重新订阅频道消息' })
                        })) : [] };
                    if (disposed || current.closed) throw new Error('成员房间连接已取消');
                    options.onConnected?.(result);
                    return result;
                } catch (error) {
                    facade.destroy();
                    throw error;
                }
            },
            sendMessage(payload) {
                if (!facade.connected || !consumer.accepted.has(keyOf(payload))) throw new Error('成员房间连接已失效');
                return session.client.sendMessage(payload);
            },
            destroy() {
                if (disposed) return;
                disposed = true;
                consumer.accepted.clear();
                consumer.voiceAccepted.clear();
                consumer.voiceStartAccepted.clear();
                if (!session) return;
                const current = session;
                current.consumers.delete(consumer);
                if (!current.consumers.size) { retire(current); return; }
                current.queue = current.queue.catch(() => {}).then(async () => {
                    if (current.closed) return;
                    await prune(current);
                }).catch(() => retire(current, true));
            }
        };
        return facade;
    }
    return { create, close() { for (const session of sessions.values()) retire(session); } };
}

const shared = createMemberRoomTransport();
module.exports = { createMemberRoomTransport, createSharedMemberRoomClient: options => {
    const settings = require('./settings-service').readSettings();
    return shared.create({
        ...options,
        clientProfile: options.clientProfile || settings.p48ClientProfile || 'pocket48',
        deviceId: options.deviceId || settings.p48ClientDeviceId || ''
    });
}, closeMemberRoomTransport: shared.close };
