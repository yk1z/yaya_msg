'use strict';

const crypto = require('node:crypto');
const { normalizePocketClientProfile } = require('./pocket-client-profile');

function createNimClientIdentity({ clientProfile, deviceId } = {}) {
    const profile = normalizePocketClientProfile(clientProfile) || 'seine48';
    const pocket = profile === 'pocket48';
    const digest = deviceId ? crypto.createHash('sha256')
        .update(JSON.stringify(['yaya-nim-device-v1', profile, String(deviceId)]))
        .digest('hex').slice(0, 32).split('') : null;
    if (digest) {
        digest[12] = '4';
        digest[16] = ((parseInt(digest[16], 16) & 3) | 8).toString(16);
    }
    const hex = digest?.join('');
    return Object.freeze({
        clientProfile: profile,
        packageName: pocket ? 'com.pocket.snh48.activity' : 'com.seine48.app',
        sdkVersion: pocket ? 92012 : 92110,
        sdkHumanVersion: pocket ? '9.20.12' : '9.21.10',
        userAgent: pocket ? 'Native/9.20.12.13893' : 'Native/9.21.10.14184',
        deviceId: hex ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` : crypto.randomUUID()
    });
}

module.exports = { createNimClientIdentity };
