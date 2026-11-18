import { createHash, randomUUID } from 'node:crypto';
import { formatPocketPa } from './pocket-pa-format.js';

function md5Hex(value) {
    return createHash('md5').update(value).digest('hex');
}

export function generatePa() {
    const timestamp = Date.now();
    const uuid = randomUUID().replaceAll('-', '');
    return Buffer.from(formatPocketPa(timestamp, uuid, md5Hex), 'utf8').toString('base64');
}
