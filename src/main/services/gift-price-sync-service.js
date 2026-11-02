'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bundled = require('../../common/gift-prices.snapshot');
const { validateSnapshot } = require('../../common/gift-pricing');
const SOURCE_URL = 'https://gnz.hk/api/gift/prices';

function createGiftPriceSyncService({ readLocal = () => bundled, readCache = () => null,
    writeCache = () => {}, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    let pending, lastAttempt = 0;
    async function sync({ force = false } = {}) {
        if (pending) return pending;
        pending = (async () => {
            const local = validateSnapshot(readLocal());
            let cache;
            try { cache = readCache(); if (cache) validateSnapshot(cache.snapshot); } catch (_) { cache = null; }
            let snapshot = cache && Date.parse(cache.snapshot.updatedAt) >= Date.parse(local.updatedAt) ? cache.snapshot : local;
            if (!force && (now() - Number(cache?.checkedAt || 0) < 86400000 || (lastAttempt && now() - lastAttempt < 3600000))) {
                return { success: true, snapshot, online: !!cache?.checkedAt, source: cache ? 'cache' : 'local' };
            }
            lastAttempt = now();
            try {
                const response = await fetchImpl(SOURCE_URL, { credentials: 'omit', redirect: 'error',
                    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
                if (!response.ok) throw new Error('价格同步接口暂不可用');
                const raw = await response.text();
                if (raw.length > 5000000) throw new Error('价格数据过大');
                const remote = validateSnapshot(JSON.parse(raw));
                // A stale server deployment must not roll back a newer local catalogue.
                if (Date.parse(remote.updatedAt) >= Date.parse(snapshot.updatedAt)) snapshot = remote;
                writeCache({ checkedAt: now(), snapshot });
                return { success: true, snapshot, online: true, source: 'remote' };
            } catch (_) {
                return { success: true, snapshot, online: false, source: cache ? 'cache' : 'local', msg: '暂未连接到价格同步服务，已使用本地价格库' };
            }
        })();
        try { return await pending; } finally { pending = null; }
    }
    return { sync };
}

let shared;
function syncGiftPrices(payload) {
    if (!shared) {
        const { internalDataDir } = require('../../common/storage-paths').ensureStoragePaths();
        const cacheFile = path.join(internalDataDir, 'gift-prices-v1.json');
        shared = createGiftPriceSyncService({
            readLocal() {
                const source = path.join(__dirname, '../../../server/gift/prices.json');
                if (!fs.existsSync(source)) return bundled;
                const prices = JSON.parse(fs.readFileSync(source, 'utf8')).map(row => ({ ...row, source: row.source || 'catalog' }));
                const rules = bundled.rules;
                const revision = crypto.createHash('sha256').update(JSON.stringify({ entries: prices, rules })).digest('hex');
                return revision === bundled.revision ? bundled : { ...bundled, prices, revision, updatedAt: fs.statSync(source).mtime.toISOString() };
            },
            readCache: () => fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : null,
            writeCache(value) { fs.writeFileSync(cacheFile + '.tmp', JSON.stringify(value)); fs.renameSync(cacheFile + '.tmp', cacheFile); }
        });
    }
    return shared.sync({ force: payload?.force === true });
}
module.exports = { createGiftPriceSyncService, syncGiftPrices, SOURCE_URL };
