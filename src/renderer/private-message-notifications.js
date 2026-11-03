(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};
    window.YayaRendererFeatures.createPrivateMessageNotifications = function (deps) {
        if (!window.desktop || window.desktop.platform === 'web' || window.desktop.isRoomWindow) return null;
        const { ipcRenderer, getToken, getAccountGeneration, getActiveTarget, conversationKey,
            messageKey, displayName, avatarUrl, messageText, preview, openConversation } = deps;
        let state = null;
        let timer = null;
        let loggedIn = false;
        let disposed = false;
        const enabled = () => window.desktop.appSettings?.getSettingValueSync?.('privateMessageNotificationsEnabled', false) === true;
        const timeOf = value => {
            const number = Number(value) || 0;
            return number > 0 && number < 1e12 ? number * 1000 : number;
        };
        const current = snapshot => !disposed && snapshot && state === snapshot && loggedIn && enabled()
            && snapshot.token === String(getToken() || '') && snapshot.generation === getAccountGeneration();
        const viewing = id => document.visibilityState !== 'hidden' && document.hasFocus()
            && document.body.dataset.desktopView === 'private-messages' && String(getActiveTarget() || '') === id;

        function stop() {
            clearTimeout(timer);
            timer = null;
            state = null;
        }

        async function poll() {
            const snapshot = state;
            if (!current(snapshot)) return false;
            if (snapshot.pending) return snapshot.pending;
            const pending = (async () => {
                const pa = window.getPA?.() || null;
                const response = await ipcRenderer.invoke('fetch-private-message-list', { token: snapshot.token, pa, lastTime: Date.now() });
                if (!current(snapshot) || !response?.success || !Array.isArray(response.content?.data)) return false;
                const items = response.content.data;
                const initial = !snapshot.initialized;
                for (const item of items) {
                    if (!current(snapshot)) return false;
                    const id = String(conversationKey(item) || '');
                    if (!id) continue;
                    const nextTime = timeOf(item.newestMessagetime);
                    const unread = Math.max(0, Number(item.noreadNum) || 0);
                    const previous = snapshot.cursors.get(id);
                    if (initial || unread === 0 || (previous && nextTime <= previous.time && unread <= previous.unread)) {
                        snapshot.cursors.set(id, { time: Math.max(nextTime, previous?.time || 0), unread, keys: previous?.keys || new Set() });
                        continue;
                    }
                    // Verify direction from message details: the list preview can be our own last reply.
                    let details;
                    try {
                        details = await ipcRenderer.invoke('fetch-private-message-info', { token: snapshot.token, pa, targetUserId: id, lastTime: 0 });
                    } catch (_) { continue; }
                    if (!current(snapshot)) return false;
                    if (!details?.success || !Array.isArray(details.content?.data)) continue;
                    const floor = Math.max(snapshot.startedAt, previous?.time || 0);
                    const known = previous?.keys || new Set();
                    const incoming = details.content.data.filter(message => {
                        const sender = String(message.user?.userId || message.fromUserId || message.senderId || '');
                        return sender === id && timeOf(message.timestamp || message.sendTime || message.createTime) > floor
                            && !known.has(messageKey(message, id));
                    }).sort((a, b) => timeOf(a.timestamp || a.sendTime || a.createTime) - timeOf(b.timestamp || b.sendTime || b.createTime));
                    const keys = new Set([...known, ...details.content.data.map(message => messageKey(message, id))].slice(-300));
                    snapshot.cursors.set(id, { time: Math.max(nextTime, previous?.time || 0), unread, keys });
                    if (!incoming.length || viewing(id)) continue;
                    const latest = incoming[incoming.length - 1];
                    const user = latest.user || item.user || {};
                    const name = displayName(user) || '私信';
                    if (!current(snapshot)) return false;
                    await ipcRenderer.invoke('show-system-notification', {
                        kind: 'private-message', targetUserId: id, memberName: name,
                        accountGeneration: snapshot.generation,
                        title: name, body: preview(messageText(latest)),
                        iconUrl: avatarUrl(user.avatar || item.user?.avatar || ''),
                        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
                    });
                }
                snapshot.initialized = true;
                return true;
            })().catch(() => false);
            snapshot.pending = pending;
            try { return await pending; }
            finally { if (snapshot.pending === pending) snapshot.pending = null; }
        }

        function schedule(snapshot, delay = 5000) {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                await poll();
                if (current(snapshot)) schedule(snapshot);
            }, delay);
        }

        function start() {
            if (disposed || !loggedIn || !enabled() || !getToken()) { stop(); return; }
            if (current(state)) return;
            stop();
            state = { token: String(getToken()), generation: getAccountGeneration(), startedAt: Date.now(), cursors: new Map(), initialized: false, pending: null };
            schedule(state, 0);
        }
        const onAccount = event => { loggedIn = event.detail?.loggedIn === true; if (loggedIn) start(); else stop(); };
        const onSetting = () => { if (enabled()) start(); else stop(); };
        const onOpen = (_event, payload = {}) => {
            const id = String(payload.targetUserId || '');
            if (!loggedIn || !/^\d{1,32}$/.test(id) || !getToken()
                || payload.accountGeneration !== getAccountGeneration()) return;
            void openConversation(id, payload);
        };
        window.addEventListener('yaya:account-state-changed', onAccount);
        window.addEventListener('yaya:private-message-notifications-setting-changed', onSetting);
        const unsubscribe = ipcRenderer.on?.('open-private-message-from-notification', onOpen);
        function destroy() {
            disposed = true; stop();
            window.removeEventListener('yaya:account-state-changed', onAccount);
            window.removeEventListener('yaya:private-message-notifications-setting-changed', onSetting);
            window.removeEventListener('pagehide', destroy);
            if (typeof unsubscribe === 'function') unsubscribe();
        }
        window.addEventListener('pagehide', destroy);
        return { poll, destroy };
    };
})();
