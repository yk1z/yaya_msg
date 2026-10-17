'use strict';

const { createNimCommonlinkChatroomClient } = require('../../common/nim-commonlink-chatroom');
const pocketService = require('./pocket-service');
const settingsService = require('./settings-service');
const { events } = require('../../common/netface-model');
const { createNetfaceNotificationClient } = require('./netface-notification-client');

function createNetfaceService({ invoke = pocketService.invoke, getToken = settingsService.getToken,
    createClient = createNimCommonlinkChatroomClient, createNotifications = createNetfaceNotificationClient } = {}) {
    const connections = new Map();
    const generations = new Map();
    const observed = new WeakSet();
    function destroyClient(client) {
        try { Promise.resolve(client?.destroy()).catch(() => {}); } catch {                                          }
    }
    function disconnect(senderId, connectionId = '') {
        const current = connections.get(senderId);
        if (connectionId && current?.connectionId !== connectionId) return false;
        generations.set(senderId, (generations.get(senderId) || 0) + 1);
        connections.delete(senderId);
        destroyClient(current?.client);
        destroyClient(current?.notifications);
        return Boolean(current);
    }
    async function connect(sender, { ticketId = '0', eventId = '', connectionId } = {}) {
        if (!/^[\w-]{1,96}$/.test(String(connectionId || ''))) throw new Error('无效的云握手连接');
        disconnect(sender.id);
        const generation = generations.get(sender.id);
        const token = getToken();
        if (!token) throw new Error('请先登录口袋48账号');
        const [credentials, result] = await Promise.all([
            invoke('get-nim-login-info', { token }),
            invoke('fetch-netface-events', { token, ticketId })
        ]);
        if (generations.get(sender.id) !== generation || token !== getToken() || sender.isDestroyed()) throw new Error('云握手连接已取消');
        if (!credentials?.success || !result?.success) throw new Error(credentials?.msg || result?.msg || '连接失败');
        const info = result.content || {};
        const event = events(info).find(item => item.ordered && String(item.eventId) === String(eventId));
        const roomId = eventId ? event?.imRoomId : info.chatRoomId;
        if (!/^\d{1,32}$/.test(String(roomId || ''))) throw new Error('口袋没有返回有效的云握手聊天室');
        function emit(channel, payload) {
            if (connections.get(sender.id)?.connectionId !== connectionId || sender.isDestroyed()) return;
            if (token !== getToken()) { disconnect(sender.id); return; }
            sender.send(channel, { connectionId, ...payload });
        }
        const ready = new Set();
        const channels = eventId ? ['chatroom', 'notification'] : ['chatroom'];
        const callbacks = source => ({
            onConnected: () => {
                ready.add(source);
                emit('netface-signal-status', { status: channels.every(v => ready.has(v)) ? 'connected' : 'connecting' });
            },
            onReconnecting: () => { ready.delete(source); emit('netface-signal-status', { status: 'reconnecting' }); },
            onDisconnected: () => { ready.delete(source); emit('netface-signal-status', { status: 'reconnecting' }); },
            onError: () => { ready.delete(source); emit('netface-signal-status', { status: 'disconnected' }); },
            onMessage: message => emit('netface-signal', { message })
        });
        const credentialsOptions = {
            appKey: '632feff1f4c838541ab75195d1ceb3fa',
            account: credentials.account || credentials.accid, token: credentials.token
        };
        const client = createClient({ ...credentialsOptions, roomId: String(roomId), ...callbacks('chatroom') });
        const notifications = eventId ? createNotifications({ ...credentialsOptions, ...callbacks('notification') }) : null;
        connections.set(sender.id, { connectionId, client, notifications });
        if (!observed.has(sender)) {
            observed.add(sender);
            sender.once('destroyed', () => { disconnect(sender.id); generations.delete(sender.id); });
        }
        try {
            await Promise.all([client.connect(), notifications?.connect()]);
            if (connections.get(sender.id)?.connectionId !== connectionId || token !== getToken()) throw new Error('云握手连接已取消');
            if (!channels.every(v => ready.has(v))) throw new Error('云握手通知连接已中断');
            emit('netface-signal-status', { status: 'connected' });
            return { success: true, connectionId };
        } catch (error) {
            if (connections.get(sender.id)?.connectionId === connectionId) disconnect(sender.id);
            destroyClient(client);
            destroyClient(notifications);
            throw error;
        }
    }
    return { connect, disconnect, closeAll: () => { for (const id of generations.keys()) disconnect(id); } };
}

module.exports = { createNetfaceService, netfaceService: createNetfaceService() };
