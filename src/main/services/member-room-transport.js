'use strict';

const { createNimCommonlinkQChatClient } = require('../../common/nim-commonlink-qchat');

function createMemberRoomTransport(createClient = createNimCommonlinkQChatClient) {
    const sessions = new Map();
    const keyOf = room => `${room.serverId}:${room.channelId}`;

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
        const consumer = { options, rooms, accepted: new Set() };
        const facade = {
            get connected() { return !disposed && !!session?.client.connected && !session.closed; },
            async connect() {
                if (disposed) throw new Error('成员房间连接已取消');
                const key = `${options.appKey}:${options.account}`;
                session = sessions.get(key);
                if (!session) {
                    session = { key, consumers: new Set(), subscriptions: new Map(), closed: false, queue: Promise.resolve() };
                    const current = session;
                    current.client = createClient({
                        appKey: options.appKey, account: options.account, token: options.token,
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
                        const desired = new Set([...current.consumers].flatMap(item => item.rooms.map(keyOf)));
                        for (const [roomKey, subscription] of current.subscriptions) {
                            if (desired.has(roomKey)) continue;
                            await current.client.unsubscribeChannel(subscription.serverId, subscription.channelId, subscription.visitor);
                            current.subscriptions.delete(roomKey);
                        }
                    });
                    const failed = [];
                    for (const room of rooms) {
                        if (disposed || current.closed) throw new Error('成员房间连接已取消');
                        const roomKey = keyOf(room);
                        try {
                            await enqueue(async () => {
                                if (disposed || current.closed) throw new Error('成员房间连接已取消');
                                if (!current.subscriptions.has(roomKey)) {
                                    if (current.subscriptions.size >= 100) throw new Error('云信频道订阅数已达上限');
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
                    const result = { accepted: rooms.filter(room => consumer.accepted.has(keyOf(room))),
                        failed: rooms.filter(room => !consumer.accepted.has(keyOf(room))).map(room =>
                            failed.find(item => keyOf(item) === keyOf(room)) || { ...room, message: '等待重新订阅' }) };
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
                if (!session) return;
                const current = session;
                current.consumers.delete(consumer);
                if (!current.consumers.size) { retire(current); return; }
                current.queue = current.queue.catch(() => {}).then(async () => {
                    if (current.closed) return;
                    const desired = new Set([...current.consumers].flatMap(item => item.rooms.map(keyOf)));
                    for (const [roomKey, subscription] of current.subscriptions) {
                        if (desired.has(roomKey)) continue;
                        await current.client.unsubscribeChannel(subscription.serverId, subscription.channelId, subscription.visitor);
                        current.subscriptions.delete(roomKey);
                    }
                }).catch(() => retire(current, true));
            }
        };
        return facade;
    }
    return { create, close() { for (const session of sessions.values()) retire(session); } };
}

const shared = createMemberRoomTransport();
module.exports = { createMemberRoomTransport, createSharedMemberRoomClient: shared.create, closeMemberRoomTransport: shared.close };
