'use strict';

const { createDecipheriv } = require('node:crypto');

function decryptLiveCrm(crm) {
    const encoded = String(crm || '').replace(/\s/g, '');
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return '';
    try {
        const key = Buffer.from('TT^3m$b#', 'utf8');
        const decipher = createDecipheriv('des-ede3', Buffer.concat([key, key, key]), null);
        const roomId = Buffer.concat([decipher.update(Buffer.from(encoded, 'base64')), decipher.final()]).toString('utf8');
        return /^\d{1,32}$/.test(roomId) ? roomId : '';
    } catch (_error) {
        return '';
    }
}

function withDesktopLiveRoom(result) {
    if (!result?.success || !result.content || typeof result.content !== 'object') return result;
    const content = result.content;
    const roomId = decryptLiveCrm(content.crm)
        || [content.chatroomId, content.roomId].map(value => String(value || '').trim()).find(value => /^\d{1,32}$/.test(value));
    if (!roomId) return result;
    return { ...result, content: { ...content, chatroomId: roomId, roomId } };
}

module.exports = { decryptLiveCrm, withDesktopLiveRoom };
