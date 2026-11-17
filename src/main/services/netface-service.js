'use strict';

const { createNimCommonlinkChatroomClient } = require('../../common/nim-commonlink-chatroom');
const pocketService = require('./pocket-service');
const settingsService = require('./settings-service');
const { events, signal } = require('../../common/netface-model');
const { writeNetfaceLog, traceNetfaceRequest } = require('./netface-log');
const { createNetfaceNotificationClient } = require('./netface-notification-client');

function createNetfaceService({ invoke = pocketService.invoke, getToken = settingsService.getToken,
    createClient = createNimCommonlinkChatroomClient, createNotifications = createNetfaceNotificationClient, log = writeNetfaceLog } = {}) {
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
        if (current) log({ event: 'connection-closed', source: 'main', connectionId: current.connectionId });
        destroyClient(current?.client);
        destroyClient(current?.previousClient);
        destroyClient(current?.notifications);
        return Boolean(current);
    }
    async function connect(sender, { ticketId = '0', eventId = '', connectionId } = {}) {
        if (!/^[\w-]{1,96}$/.test(String(connectionId || ''))) throw new Error('无效的云握手连接');
        const context = { source: 'main', connectionId, ticketId, eventId };
        log({ ...context, event: 'connection-start', request: { ticketId, eventId, connectionId } });
        disconnect(sender.id);
        const generation = generations.get(sender.id);
        const token = getToken();
        if (!token) throw new Error('请先登录口袋48账号');
        const [credentials, result] = await Promise.all([
            traceNetfaceRequest('get-nim-login-info', { token }, () => invoke('get-nim-login-info', { token }), { ...context, log, boundary: 'notification' }),
            traceNetfaceRequest('fetch-netface-events', { token, ticketId }, () => invoke('fetch-netface-events', { token, ticketId }), { ...context, log, boundary: 'notification' })
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
        const connection = { connectionId, client: null, previousClient: null, notifications: null };
        const channels = ['chatroom', 'notification'];
        const callbacks = source => ({
            onDiagnostic: details => log({ ...context, event: 'transport-diagnostic', channel: source, ...details }),
            onConnected: details => {
                log({ ...context, event: 'channel-connected', channel: source, details });
                ready.add(source);
                emit('netface-signal-status', { status: channels.every(v => ready.has(v)) ? 'connected' : 'connecting' });
            },
            onReconnecting: details => { log({ ...context, event: 'channel-reconnecting', channel: source, details }); ready.delete(source); emit('netface-signal-status', { status: 'reconnecting' }); },
            onDisconnected: details => { log({ ...context, event: 'channel-disconnected', channel: source, transport: details?.source, code: details?.code, reason: details?.reason, details }); ready.delete(source); emit('netface-signal-status', { status: 'reconnecting' }); },
            onError: error => { log({ ...context, event: 'channel-error', channel: source, code: error?.code, reason: error?.reason, errorName: error?.name, error }); ready.delete(source); emit('netface-signal-status', { status: 'disconnected' }); },
            onMessage: message => {
                const parsed = signal(message);
                log({ ...context, event: 'signal-received', channel: source, messageType: parsed?.messageType, eventId: parsed?.eventId || parsed?.sourceId || eventId, message, parsed, accepted: Boolean(parsed) });
                emit('netface-signal', { message });
            }
        });
        const credentialsOptions = {
            appKey: '632feff1f4c838541ab75195d1ceb3fa',
            account: credentials.account || credentials.accid, token: credentials.token
        };
        log({ ...context, event: 'connection-config', roomId, credentials: credentialsOptions,
            clientProfile: settingsService.readSettings?.().p48ClientProfile || 'pocket48', platform: process.platform, arch: process.arch, nodeVersion: process.versions.node });
        function createChatroom(imRoomId) {
            let chatroom;
            const handlers = callbacks('chatroom');
            for (const [name, handler] of Object.entries(handlers)) {
                handlers[name] = (...args) => { if (connection.client === chatroom) handler(...args); };
            }
            chatroom = createClient({ ...credentialsOptions, roomId: String(imRoomId), ...handlers });
            return chatroom;
        }
        const client = createChatroom(roomId);
        const notifications = createNotifications({ ...credentialsOptions, ...callbacks('notification') });
        connection.client = client;
        connection.notifications = notifications;
        connection.switchRoom = async ({ eventId: nextEventId, imRoomId }) => {
            if (!/^\d{1,32}$/.test(String(nextEventId || '')) || !/^\d{1,32}$/.test(String(imRoomId || ''))) throw new Error('口袋入场响应没有返回有效的成员聊天室');
            if (connection.previousClient) throw new Error('正在连接成员聊天室，请稍候');
            if (token !== getToken()) throw new Error('云握手账号已切换');
            const previousClient = connection.client;
            const wasReady = ready.has('chatroom');
            const nextClient = createChatroom(imRoomId);
            connection.previousClient = previousClient;
            connection.client = nextClient;
            context.eventId = String(nextEventId);
            ready.delete('chatroom');
            log({ ...context, event: 'room-switch-start', roomId: imRoomId });
            emit('netface-signal-status', { status: 'connecting' });
            try {
                await nextClient.connect();
                if (connections.get(sender.id) !== connection || token !== getToken() || sender.isDestroyed()) throw new Error('成员聊天室连接已取消');
                if (!channels.every(channel => ready.has(channel))) throw new Error('云握手通知连接已中断');
                connection.previousClient = null;
                destroyClient(previousClient);
                log({ ...context, event: 'room-switch-success' });
                return { success: true, connectionId };
            } catch (error) {
                destroyClient(nextClient);
                if (connections.get(sender.id) === connection) {
                    connection.client = previousClient;
                    connection.previousClient = null;
                    ready.delete('chatroom');
                    if (wasReady) ready.add('chatroom');
                    emit('netface-signal-status', { status: channels.every(channel => ready.has(channel)) ? 'connected' : 'disconnected' });
                } else destroyClient(previousClient);
                log({ ...context, event: 'room-switch-failed', code: error.code, errorName: error.name, error });
                throw error;
            }
        };
        connections.set(sender.id, connection);
        if (!observed.has(sender)) {
            observed.add(sender);
            sender.once('destroyed', () => { disconnect(sender.id); generations.delete(sender.id); });
        }
        try {
            await Promise.all([client.connect(), notifications.connect()]);
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
    function switchRoom(sender, payload = {}) {
        const connection = connections.get(sender.id);
        if (!connection || connection.connectionId !== payload.connectionId || sender.isDestroyed()) throw new Error('云握手通知连接已失效，请重试入场');
        return connection.switchRoom(payload);
    }
    return { connect, disconnect, switchRoom, closeAll: () => { for (const id of generations.keys()) disconnect(id); } };
}

module.exports = { createNetfaceService, netfaceService: createNetfaceService() };
