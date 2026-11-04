import { AsyncLocalStorage } from 'node:async_hooks';
import profiles from './pocket-client-profile.js';

const requests = new AsyncLocalStorage();

export function withPocketClient(payload, callback) {
    return requests.run({
        clientProfile: profiles.normalizePocketClientProfile(payload?.clientProfile),
        deviceId: String(payload?.deviceId || '')
    }, callback);
}

export function applyPocketClientHeaders(headers) {
    const context = requests.getStore();
    if (!context?.clientProfile) return headers;
    let previous = {};
    try { previous = JSON.parse(headers.appInfo || '{}'); } catch {                              }
    const deviceId = /^[a-f0-9]{16}$/i.test(context.deviceId)
        ? context.deviceId.toLowerCase()
        : String(previous.deviceId || '').replace(/[^a-f0-9]/gi, '').slice(0, 16).toLowerCase();
    const next = { ...headers };
    delete next['X-Custom-Device-Type'];
    return { ...next, ...profiles.createPocketClientHeaders({ ...context, deviceId }) };
}
