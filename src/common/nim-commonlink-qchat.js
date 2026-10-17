'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const zlib = require('node:zlib');

const DEFAULT_LBS_URL = 'https://lbs.netease.im/lbs/conf.jsp';
const ANDROID_SDK_VERSION = 91701;
const ANDROID_SDK_HUMAN_VERSION = '9.17.1';
const ANDROID_USER_AGENT = 'Native/9.17.1.13231';
const ANDROID_PACKAGE_NAME = 'com.seine48.app';
const RSA_KEY_VERSION = 0;
const RSA_PUBLIC_KEY = crypto.createPublicKey({
    key: Buffer.from(
        'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCBxLuL8+xpQSddSnSvPkvNOHdcr5Euqw+kkOSzO/buDMheCfFILRC/v5+nv8BsL7/YZWVpDA8sIBTxfNRqSCu0uLjlbJqT/sMnPT1xxdQrkb1HSnuSyTbZbqaInQ13tBE2SfcAhsQZJJ1hKQSE2QyKOMxQPhP583qcsIhDbdExvwIDAQAB',
        'base64'
    ),
    format: 'der',
    type: 'spki'
});

function encodeVarint(input) {
    const bytes = [];
    let value = Number(input) >>> 0;
    do {
        let byte = value & 0x7f;
        value = Math.floor(value / 128);
        if (value) byte |= 0x80;
        bytes.push(byte);
    } while (value);
    return Buffer.from(bytes);
}

function readVarint(buffer, offset = 0) {
    let value = 0;
    let scale = 1;
    for (let index = offset; index < buffer.length && index < offset + 5; index += 1) {
        const byte = buffer[index];
        value += (byte & 0x7f) * scale;
        if ((byte & 0x80) === 0) return { value, size: index - offset + 1 };
        scale *= 128;
    }
    return null;
}

function encodeBytes(input) {
    const value = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
    return Buffer.concat([encodeVarint(value.length), value]);
}

function encodeProperties(input) {
    const entries = Object.entries(input)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => [Number(key), value])
        .sort(([left], [right]) => left - right);
    const chunks = [encodeVarint(entries.length)];
    for (const [key, value] of entries) {
        chunks.push(encodeVarint(key), encodeBytes(value));
    }
    return Buffer.concat(chunks);
}

function decodeProperties(buffer) {
    let offset = 0;
    const count = readVarint(buffer, offset);
    if (!count) throw new Error('QChat 消息属性数量无效');
    offset += count.size;
    const properties = new Map();
    for (let index = 0; index < count.value; index += 1) {
        const key = readVarint(buffer, offset);
        if (!key) throw new Error('QChat 消息属性编号无效');
        offset += key.size;
        const length = readVarint(buffer, offset);
        if (!length) throw new Error('QChat 消息属性长度无效');
        offset += length.size;
        if (offset + length.value > buffer.length) throw new Error('QChat 消息属性不完整');
        properties.set(key.value, buffer.subarray(offset, offset + length.value).toString('utf8'));
        offset += length.value;
    }
    return properties;
}

function decodeStringArray(buffer) {
    let offset = 0;
    const count = readVarint(buffer, offset);
    if (!count) throw new Error('QChat 地址数量无效');
    offset += count.size;
    const values = [];
    for (let index = 0; index < count.value; index += 1) {
        const length = readVarint(buffer, offset);
        if (!length) throw new Error('QChat 地址长度无效');
        offset += length.size;
        if (offset + length.value > buffer.length) throw new Error('QChat 地址数据不完整');
        values.push(buffer.subarray(offset, offset + length.value).toString('utf8'));
        offset += length.value;
    }
    return values;
}

function makePacket(serviceId, commandId, serial, body = Buffer.alloc(0), tag = 0) {
    const header = Buffer.allocUnsafe(5);
    header[0] = serviceId;
    header[1] = commandId;
    header.writeInt16LE(serial, 2);
    header[4] = tag;
    return Buffer.concat([encodeVarint(header.length + body.length), header, body]);
}

function decodePacket(raw, options = {}) {
    const frameLength = readVarint(raw);
    if (!frameLength
        || (!options.embedded && raw.length < frameLength.size + frameLength.value)
        || (!options.embedded && frameLength.value < 5)
        || (options.embedded && raw.length < frameLength.size + 5)) {
        throw new Error('QChat 数据包不完整');
    }
    let offset = frameLength.size;
    const serviceId = raw[offset];
    const commandId = raw[offset + 1];
    const serial = raw.readInt16LE(offset + 2);
    const tag = raw[offset + 4];
    offset += 5;
    let resultCode = 200;
    if (tag & 2) {
        if (offset + 2 > raw.length) throw new Error('QChat 响应状态不完整');
        resultCode = raw.readInt16LE(offset);
        offset += 2;
    }
    const packetEnd = options.embedded ? raw.length : Math.min(raw.length, frameLength.size + frameLength.value);
    let body = raw.subarray(offset, packetEnd);
    if (tag & 1) {
        if (body.length < 4) throw new Error('QChat 压缩数据不完整');
        const expectedLength = body.readInt32LE(0);
        body = zlib.inflateSync(body.subarray(4));
        if (body.length !== expectedLength) throw new Error('QChat 压缩数据长度不一致');
    }
    return { serviceId, commandId, serial, resultCode, body };
}

function decodeEmbeddedPacket(raw) {
    const frameLength = readVarint(raw);
    if (!frameLength || raw.length < frameLength.size + 5) return null;
    return decodePacket(raw, { embedded: true });
}

class Rc4Stream {
    constructor(key) {
        this.state = Uint8Array.from({ length: 256 }, (_, index) => index);
        this.x = 0;
        this.y = 0;
        let cursor = 0;
        for (let index = 0; index < 256; index += 1) {
            cursor = (cursor + this.state[index] + key[index % key.length]) & 0xff;
            [this.state[index], this.state[cursor]] = [this.state[cursor], this.state[index]];
        }
    }

    apply(input) {
        const output = Buffer.allocUnsafe(input.length);
        for (let index = 0; index < input.length; index += 1) {
            this.x = (this.x + 1) & 0xff;
            this.y = (this.y + this.state[this.x]) & 0xff;
            [this.state[this.x], this.state[this.y]] = [this.state[this.y], this.state[this.x]];
            output[index] = input[index] ^ this.state[(this.state[this.x] + this.state[this.y]) & 0xff];
        }
        return output;
    }
}

function encryptHandshakePayload(payload) {
    const blocks = [];
    for (let offset = 0; offset < payload.length; offset += 117) {
        blocks.push(crypto.publicEncrypt({
            key: RSA_PUBLIC_KEY,
            padding: crypto.constants.RSA_PKCS1_PADDING
        }, payload.subarray(offset, offset + 117)));
    }
    return Buffer.concat(blocks);
}

function littleEndianInt32(value) {
    const buffer = Buffer.allocUnsafe(4);
    buffer.writeInt32LE(value);
    return buffer;
}

function parseTcpAddress(value) {
    const address = String(value || '').trim();
    const separator = address.lastIndexOf(':');
    const host = address.slice(0, separator).replace(/^\[|\]$/g, '');
    const port = Number(address.slice(separator + 1));
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('云信没有返回有效的 TCP 地址');
    }
    return { host, port };
}

function protocolError(message, code) {
    const error = new Error(`${message}：${code}`);
    error.code = code;
    return error;
}

class CommonlinkSession {
    constructor(options) {
        this.address = options.address;
        this.loginPacket = options.loginPacket;
        this.loginServiceId = options.loginServiceId;
        this.loginCommandId = options.loginCommandId;
        this.onPacket = options.onPacket;
        this.onClose = options.onClose;
        this.serial = 2;
        this.pendingRequests = new Map();
        this.connected = false;
    }

    async connect() {
        const encryptionKey = crypto.randomBytes(16);
        const handshake = makePacket(1, 1, 0, Buffer.concat([
            littleEndianInt32(RSA_KEY_VERSION),
            encryptHandshakePayload(Buffer.concat([encodeBytes(encryptionKey), this.loginPacket]))
        ]));
        this.encryptor = new Rc4Stream(encryptionKey);
        this.decryptor = new Rc4Stream(encryptionKey);
        this.receiveBuffer = Buffer.alloc(0);

        await new Promise((resolve, reject) => {
            let loginSent = false;
            let settled = false;
            const timer = setTimeout(() => {
                const error = new Error('云信连接超时');
                if (!settled) reject(error);
                this.socket?.destroy();
            }, 20_000);
            timer.unref?.();

            this.socket = net.createConnection(parseTcpAddress(this.address));
            this.socket.setKeepAlive(true, 15_000);
            this.socket.setTimeout(45_000, () => this.socket?.destroy(new Error('云信心跳超时')));
            this.socket.on('connect', () => this.socket.write(handshake));
            this.socket.on('data', chunk => {
                try {
                    this.receiveBuffer = Buffer.concat([this.receiveBuffer, this.decryptor.apply(chunk)]);
                    while (this.receiveBuffer.length) {
                        const length = readVarint(this.receiveBuffer);
                        if (!length) break;
                        const packetLength = length.size + length.value;
                        if (this.receiveBuffer.length < packetLength) break;
                        const raw = this.receiveBuffer.subarray(0, packetLength);
                        this.receiveBuffer = this.receiveBuffer.subarray(packetLength);
                        let response = decodePacket(raw);
                        if (response.serviceId === 4 && [1, 2, 10, 11].includes(response.commandId) && response.body.length > 8) {
                            const embedded = decodeEmbeddedPacket(response.body.subarray(8));
                            if (!embedded) continue;
                            response = embedded;
                        }
                        if (response.serviceId === 1 && response.commandId === 1) {
                            if (response.resultCode !== 200) throw protocolError('云信握手失败', response.resultCode);
                            if (!loginSent) {
                                loginSent = true;
                                this.socket.write(this.encryptor.apply(this.loginPacket));
                            }
                            continue;
                        }
                        if (response.serviceId === this.loginServiceId && response.commandId === this.loginCommandId) {
                            if (response.resultCode !== 200) throw protocolError('云信登录失败', response.resultCode);
                            if (!settled) {
                                settled = true;
                                clearTimeout(timer);
                                this.connected = true;
                                this.#startHeartbeat();
                                resolve();
                            }
                            continue;
                        }
                        const pending = this.pendingRequests.get(response.serial);
                        if (pending) {
                            this.pendingRequests.delete(response.serial);
                            clearTimeout(pending.timer);
                            if (response.resultCode === 200) pending.resolve(response);
                            else pending.reject(protocolError(pending.failureMessage, response.resultCode));
                            continue;
                        }
                        this.onPacket?.(response);
                    }
                } catch (error) {
                    if (!settled) reject(error);
                    this.socket?.destroy(error);
                }
            });
            this.socket.on('error', error => {
                if (!settled) reject(error);
            });
            this.socket.on('close', () => {
                clearTimeout(timer);
                clearInterval(this.heartbeatTimer);
                const wasConnected = this.connected;
                this.connected = false;
                this.#rejectPending(errorFromClose());
                if (!settled) reject(errorFromClose());
                if (wasConnected) this.onClose?.();
            });
        });
    }

    request(serviceId, commandId, body, failureMessage = '云信请求失败') {
        if (!this.connected || !this.socket || this.socket.destroyed) {
            return Promise.reject(new Error('云信连接已断开'));
        }
        const serial = this.#nextSerial();
        const packet = makePacket(serviceId, commandId, serial, body);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(serial);
                reject(new Error(`${failureMessage}：请求超时`));
            }, 12_000);
            timer.unref?.();
            this.pendingRequests.set(serial, { resolve, reject, timer, failureMessage });
            this.socket.write(this.encryptor.apply(packet), error => {
                if (!error) return;
                const pending = this.pendingRequests.get(serial);
                if (!pending) return;
                this.pendingRequests.delete(serial);
                clearTimeout(pending.timer);
                reject(error);
            });
        });
    }

    destroy() {
        this.connected = false;
        clearInterval(this.heartbeatTimer);
        this.socket?.destroy();
        this.#rejectPending(new Error('云信连接已关闭'));
    }

    #nextSerial() {
        const value = this.serial;
        this.serial = value >= 32767 ? 2 : value + 1;
        return value;
    }

    #startHeartbeat() {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
            if (!this.connected || !this.socket || this.socket.destroyed) return;
            this.socket.write(this.encryptor.apply(makePacket(1, 2, this.#nextSerial())));
        }, 15_000);
        this.heartbeatTimer.unref?.();
    }

    #rejectPending(error) {
        for (const pending of this.pendingRequests.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pendingRequests.clear();
    }
}

function errorFromClose() {
    return new Error('云信连接已关闭');
}

function makeNimLoginPacket(appKey, account, token, deviceId) {
    return makePacket(2, 2, 1, encodeProperties({
        3: 1,
        4: '8.0.0',
        6: ANDROID_SDK_VERSION,
        8: 1,
        9: 1,
        13: deviceId,
        18: appKey,
        19: account,
        25: ANDROID_PACKAGE_NAME,
        40: ANDROID_SDK_HUMAN_VERSION,
        42: ANDROID_USER_AGENT,
        1000: token
    }));
}

function makeQChatLoginPacket(appKey, account, token, deviceId) {
    return makePacket(24, 2, 1, encodeProperties({
        1: appKey,
        2: account,
        3: 0,
        4: token,
        6: 1,
        8: deviceId,
        9: ANDROID_SDK_VERSION,
        10: 1,
        11: ANDROID_USER_AGENT,
        14: ANDROID_SDK_HUMAN_VERSION
    }));
}

function buildQChatMessageProperties(options) {
    const text = String(options.body || '').trim();
    const attachment = String(options.attachment || '').trim();
    const properties = {
        1: String(options.serverId || '').trim(),
        2: String(options.channelId || '').trim(),
        3: String(options.fromAccount || '').trim(),
        9: options.type === 'custom' ? 100 : 0,
        12: String(options.ext || ''),
        13: String(options.msgIdClient || crypto.randomUUID().replace(/-/g, '')),
        20: options.mentionAll ? 1 : 0,
        21: String(options.env || 'QChat'),
        100: options.historyEnable === false ? 0 : 1,
        101: options.pushEnable === false ? 0 : 1,
        102: options.needBadge === false ? 0 : 1,
        103: options.needPushNick === false ? 0 : 1,
        105: options.routeEnable === false ? 0 : 1
    };
    if (text) properties[10] = text;
    if (attachment) properties[11] = attachment;
    return properties;
}

function normalizeIncomingMessage(body) {
    const properties = decodeProperties(body);
    return {
        serverId: properties.get(1) || '',
        channelId: properties.get(2) || '',
        fromAccount: properties.get(3) || '',
        fromClientType: Number(properties.get(4) || 0),
        fromNick: properties.get(6) || '',
        time: Number(properties.get(7) || 0),
        type: Number(properties.get(9) || 0),
        body: properties.get(10) || '',
        attachment: properties.get(11) || '',
        ext: properties.get(12) || '',
        msgIdClient: properties.get(13) || '',
        msgIdServer: properties.get(14) || ''
    };
}

function buildQChatSubscriptionBody(serverId, channelId, visitor = true, subscribe = true) {
    if (!/^\d{1,32}$/.test(String(serverId || '')) || !/^\d{1,32}$/.test(String(channelId || ''))) {
        throw new Error('缺少有效的云信订阅房间 ID');
    }
    return Buffer.concat([encodeProperties({ 1: visitor ? 6 : 1, 2: subscribe ? 1 : 2 }), encodeVarint(1),
        encodeProperties({ 1: String(serverId), 2: String(channelId) })]);
}

function readPropertyList(buffer, offset = 0) {
    const count = readVarint(buffer, offset);
    if (!count || count.value > 10000) throw new Error('云信订阅响应无效');
    offset += count.size;
    const values = [];
    for (let i = 0; i < count.value; i++) {
        const start = offset;
        const size = readVarint(buffer, offset);
        if (!size || size.value > 10000) throw new Error('云信订阅属性无效');
        offset += size.size;
        for (let n = 0; n < size.value; n++) {
            const key = readVarint(buffer, offset);
            if (!key) throw new Error('云信订阅属性无效');
            offset += key.size;
            const length = readVarint(buffer, offset);
            if (!length || offset + length.size + length.value > buffer.length) throw new Error('云信订阅响应不完整');
            offset += length.size + length.value;
        }
        values.push(decodeProperties(buffer.subarray(start, offset)));
    }
    return { values, offset };
}

class NimCommonlinkQChatClient {
    constructor(options = {}) {
        this.appKey = String(options.appKey || '').trim();
        this.account = String(options.account || '').trim();
        this.token = String(options.token || '').trim();
        this.lbsUrl = String(options.lbsUrl || DEFAULT_LBS_URL);
        this.fetchImpl = options.fetchImpl || globalThis.fetch;
        this.onConnected = options.onConnected;
        this.onDisconnected = options.onDisconnected;
        this.onMessage = options.onMessage;
        this.onError = options.onError;
        this.serverId = String(options.serverId || '');
        this.channelId = String(options.channelId || '');
        this.connected = false;
        this.destroyed = false;
    }

    async connect() {
        if (!this.appKey || !this.account || !this.token) throw new Error('缺少云信 AppKey、账号或令牌');
        if (typeof this.fetchImpl !== 'function') throw new Error('当前 Node.js 环境不支持云信地址请求');
        this.destroyed = false;
        const address = await this.#requestNimAddress();
        if (this.destroyed) throw new Error('成员房间连接已取消');
        const nimDeviceId = crypto.randomUUID();
        this.nimSession = new CommonlinkSession({
            address,
            loginPacket: makeNimLoginPacket(this.appKey, this.account, this.token, nimDeviceId),
            loginServiceId: 2,
            loginCommandId: 2,
            onClose: () => this.#handleClose('NIM')
        });
        await this.nimSession.connect();
        if (this.destroyed) throw new Error('成员房间连接已取消');
        const addressResponse = await this.nimSession.request(
            24,
            1,
            encodeProperties({ 1: 0 }),
            '获取 QChat 地址失败'
        );
        const qchatAddresses = decodeStringArray(addressResponse.body).filter(Boolean);
        if (this.destroyed) throw new Error('成员房间连接已取消');
        if (!qchatAddresses.length) throw new Error('云信没有返回 QChat 连接地址');

        const qchatDeviceId = crypto.randomUUID();
        this.qchatSession = new CommonlinkSession({
            address: qchatAddresses[0],
            loginPacket: makeQChatLoginPacket(this.appKey, this.account, this.token, qchatDeviceId),
            loginServiceId: 24,
            loginCommandId: 2,
            onClose: () => this.#handleClose('QChat'),
            onPacket: response => {
                if (response.serviceId !== 24 || response.commandId !== 11 || !response.body.length) return;
                try {
                    this.onMessage?.(normalizeIncomingMessage(response.body));
                } catch (error) {
                    this.#reportError(error);
                }
            }
        });
        await this.qchatSession.connect();
        if (this.destroyed) throw new Error('成员房间连接已取消');
        if (this.serverId && this.channelId) await this.subscribeChannel(this.serverId, this.channelId);
        if (this.destroyed) throw new Error('成员房间连接已取消');
        this.connected = true;
        this.onConnected?.();
    }

    async subscribeChannel(serverId, channelId) {
        const subscribe = async visitor => {
            const response = await this.qchatSession.request(visitor ? 25 : 24, visitor ? 9 : 15,
                buildQChatSubscriptionBody(serverId, channelId, visitor), '订阅成员房间实时消息失败');
            const list = readPropertyList(response.body);
            const failed = visitor ? list.values : (list.offset < response.body.length ? readPropertyList(response.body, list.offset).values : []);
            if (failed.some(item => item.get(2) === String(channelId))) throw protocolError('订阅成员房间被拒绝', 403);
            return { success: true, visitor };
        };
        try { return await subscribe(true); }
        catch (error) {
            if (![403, 404].includes(Number(error.code))) throw error;
            return subscribe(false);
        }
    }

    async unsubscribeChannel(serverId, channelId, visitor = true) {
        const response = await this.qchatSession.request(visitor ? 25 : 24, visitor ? 9 : 15,
            buildQChatSubscriptionBody(serverId, channelId, visitor, false), '取消成员房间订阅失败');
        const list = readPropertyList(response.body);
        const failed = visitor ? list.values : (list.offset < response.body.length ? readPropertyList(response.body, list.offset).values : []);
        if (failed.some(item => item.get(2) === String(channelId))) throw protocolError('取消成员房间订阅被拒绝', 403);
        return { success: true };
    }

    async sendMessage(options = {}) {
        if (!this.connected || !this.qchatSession?.connected) throw new Error('成员房间连接已断开');
        const message = buildQChatMessageProperties({ ...options, fromAccount: this.account });
        if (!message[1] || !message[2] || (!message[10] && !message[11])) throw new Error('成员房间消息参数不完整');
        const response = await this.qchatSession.request(
            24,
            10,
            encodeProperties(message),
            '发送成员房间消息失败'
        );
        const acknowledged = response.body.length ? normalizeIncomingMessage(response.body) : {};
        return {
            success: true,
            msgIdClient: acknowledged.msgIdClient || message[13],
            msgIdServer: acknowledged.msgIdServer || '',
            time: acknowledged.time || Date.now()
        };
    }

    destroy() {
        this.destroyed = true;
        this.connected = false;
        this.qchatSession?.destroy();
        this.nimSession?.destroy();
        this.qchatSession = null;
        this.nimSession = null;
    }

    async #requestNimAddress() {
        const url = new URL(this.lbsUrl);
        url.search = new URLSearchParams({
            k: this.appKey,
            id: this.account,
            v: String(ANDROID_SDK_VERSION),
            tp: '1',
            dt: '0'
        }).toString();
        const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`获取云信地址失败：HTTP ${response.status}`);
        const result = await response.json();
        const addresses = result?.common?.link;
        if (!Array.isArray(addresses) || !addresses.length) throw new Error('云信没有返回 NIM 连接地址');
        return addresses[0];
    }

    #handleClose(source) {
        if (this.destroyed) return;
        const wasConnected = this.connected;
        this.connected = false;
        if (wasConnected) this.onDisconnected?.({ source });
    }

    #reportError(error) {
        try {
            this.onError?.(error);
        } catch (_callbackError) {
        }
    }
}

function createNimCommonlinkQChatClient(options) {
    return new NimCommonlinkQChatClient(options);
}

module.exports = {
    NimCommonlinkQChatClient,
    buildQChatMessageProperties,
    buildQChatSubscriptionBody,
    createNimCommonlinkQChatClient,
    decodeProperties,
    encodeProperties
};
