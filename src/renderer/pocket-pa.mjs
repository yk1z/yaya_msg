import { md5 } from '@noble/hashes/legacy';
import { bytesToHex } from '@noble/hashes/utils';
import pocketPaFormat from '../common/pocket-pa-format.js';

function md5Hex(value) {
    return bytesToHex(md5(value));
}

export function generatePa() {
    const timestamp = Date.now();
    const uuid = crypto.getRandomValues(new Uint8Array(16));
    uuid[6] = (uuid[6] & 0x0f) | 0x40;
    uuid[8] = (uuid[8] & 0x3f) | 0x80;
    return btoa(pocketPaFormat.formatPocketPa(timestamp, bytesToHex(uuid), md5Hex));
}
