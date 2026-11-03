(function () {
    let pending, lastAttempt = 0;
    window.syncGiftPrices = async function ({ force = true, notify = true } = {}) {
        if (pending) return pending;
        if (!force && Date.now() - lastAttempt < 3600000) return;
        lastAttempt = Date.now();
        pending = (async () => {
            try {
                let result;
                if (window.desktop?.platform !== 'web' && window.desktop?.ipcRenderer) {
                    result = await window.desktop.ipcRenderer.invoke('sync-gift-prices', { force });
                } else {
                    const response = await fetch('/api/gift/prices', { credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(8000) });
                    if (!response.ok) throw new Error('暂未连接到价格同步服务，已使用本地价格库');
                    result = { success: true, online: true, snapshot: await response.json() };
                }
                if (!result?.success || !result.snapshot) throw new Error('价格同步暂不可用');
                const candidate = Date.parse(result.snapshot.updatedAt) < Date.parse(window.YayaGiftPriceSnapshot.updatedAt)
                    ? window.YayaGiftPriceSnapshot : result.snapshot;
                const snapshot = window.YayaGiftPricing.mergeSnapshot(POCKET_GIFT_DATA, candidate);
                window.YayaGiftPriceSnapshot = snapshot;
                const cache = window.desktop?.appCache;
                if (cache?.setCacheValueSync) cache.setCacheValueSync('YAYA_GIFT_PRICE_SNAPSHOT', snapshot);
                else localStorage.setItem('YAYA_GIFT_PRICE_SNAPSHOT', JSON.stringify(snapshot));
                window.dispatchEvent(new CustomEvent('yaya:gift-prices-updated'));
                if (notify && typeof showToast === 'function') showToast(result.online ? `礼物价格已同步，共 ${snapshot.prices.length} 条` : result.msg);
                return result;
            } catch (error) {
                if (notify && typeof showToast === 'function') showToast(error.message || '价格同步失败，已保留本地价格库');
                return { success: false };
            }
        })();
        try { return await pending; } finally { pending = null; }
    };
    const syncInMainWindow = () => {
        if (!window.desktop?.isRoomWindow) void window.syncGiftPrices({ force: false, notify: false });
    };
    window.addEventListener('DOMContentLoaded', syncInMainWindow);
    window.addEventListener('focus', syncInMainWindow);
})();
