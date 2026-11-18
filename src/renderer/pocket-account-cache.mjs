import { readStoredJsonSetting, writeStoredJsonSetting } from './app-preferences.mjs';

export function createPocketAccountCache({ getCurrentAppToken, getCurrentUserId }) {
    const FLIP_HISTORY_CACHE_KEY = 'yaya_flip_history_cache_v1';

    function getSimpleCacheHash(value) {
        const text = String(value || '');
        let hash = 0;
        for (let i = 0; i < text.length; i += 1) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    function getCurrentFlipCacheUserKey() {
        const userId = getCurrentUserId();
        if (userId) {
            return `user:${userId}`;
        }

        const idText = String(document.getElementById('user-id-display')?.textContent || '');
        const idMatch = idText.match(/ID:\s*([^\s]+)/i);
        if (idMatch && idMatch[1] && idMatch[1] !== '--') {
            return `user:${idMatch[1]}`;
        }

        const token = getCurrentAppToken();
        return token ? `token:${getSimpleCacheHash(token)}` : '';
    }

    function getCurrentFlipTokenCacheKey() {
        const token = getCurrentAppToken();
        return token ? `token:${getSimpleCacheHash(token)}` : '';
    }

    function getFlipHistoryCacheApi() {
        return window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
    }

    function readFlipHistoryCache() {
        const fallback = { accounts: {} };
        const cacheApi = getFlipHistoryCacheApi();
        const value = cacheApi && typeof cacheApi.getCacheValueSync === 'function'
            ? cacheApi.getCacheValueSync(FLIP_HISTORY_CACHE_KEY, fallback)
            : readStoredJsonSetting(FLIP_HISTORY_CACHE_KEY, fallback);
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : fallback;
    }

    function writeFlipHistoryCache(value) {
        const cacheApi = getFlipHistoryCacheApi();
        if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
            cacheApi.setCacheValueSync(FLIP_HISTORY_CACHE_KEY, value);
            return value;
        }
        return writeStoredJsonSetting(FLIP_HISTORY_CACHE_KEY, value);
    }

    function loadCachedFlipDataForCurrentAccount() {
        const userKey = getCurrentFlipCacheUserKey();
        if (!userKey) return [];
        const cache = readFlipHistoryCache();
        const entry = cache.accounts && cache.accounts[userKey];
        if (entry && Array.isArray(entry.items)) {
            return entry.items;
        }

        const aliases = cache.aliases && typeof cache.aliases === 'object' && !Array.isArray(cache.aliases)
            ? cache.aliases
            : {};
        const aliasedKey = aliases[userKey];
        const aliasedEntry = aliasedKey && cache.accounts && cache.accounts[aliasedKey];
        if (aliasedEntry && Array.isArray(aliasedEntry.items)) {
            return aliasedEntry.items;
        }

        const accountKeys = cache.accounts && typeof cache.accounts === 'object' && !Array.isArray(cache.accounts)
            ? Object.keys(cache.accounts)
            : [];
        if (userKey.startsWith('token:') && accountKeys.length === 1) {
            const onlyEntry = cache.accounts[accountKeys[0]];
            return onlyEntry && Array.isArray(onlyEntry.items) ? onlyEntry.items : [];
        }

        return [];
    }

    function saveFlipDataForCurrentAccount(items) {
        const userKey = getCurrentFlipCacheUserKey();
        if (!userKey || !Array.isArray(items)) return;
        const tokenKey = getCurrentFlipTokenCacheKey();

        const cache = readFlipHistoryCache();
        const accounts = cache.accounts && typeof cache.accounts === 'object' && !Array.isArray(cache.accounts)
            ? cache.accounts
            : {};
        const aliases = cache.aliases && typeof cache.aliases === 'object' && !Array.isArray(cache.aliases)
            ? cache.aliases
            : {};

        accounts[userKey] = {
            updatedAt: Date.now(),
            items
        };
        if (tokenKey && tokenKey !== userKey && userKey.startsWith('user:')) {
            aliases[tokenKey] = userKey;
            delete accounts[tokenKey];
        }

        const orderedKeys = Object.keys(accounts)
            .sort((a, b) => Number(accounts[b]?.updatedAt || 0) - Number(accounts[a]?.updatedAt || 0));
        orderedKeys.slice(5).forEach((key) => delete accounts[key]);

        writeFlipHistoryCache({
            version: 1,
            updatedAt: Date.now(),
            accounts,
            aliases
        });
    }

    function getPocketAccountScopeKey() {
        const userId = String(getCurrentUserId() || '').trim();
        if (userId) return `user-${userId.replace(/[^a-z0-9_-]/gi, '_')}`;

        const token = String(getCurrentAppToken() || '').trim();
        if (!token) return 'signed-out';
        let hash = 2166136261;
        for (let index = 0; index < token.length; index += 1) {
            hash ^= token.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `token-${(hash >>> 0).toString(36)}`;
    }

    return { getPocketAccountScopeKey, loadCachedFlipDataForCurrentAccount, saveFlipDataForCurrentAccount };
}
