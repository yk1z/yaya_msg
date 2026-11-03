(function () {
    if (!window.desktop || window.desktop.platform === 'web') return;
    const ipc = window.desktop.ipcRenderer;
    let revision = 0;
    let waitingForLogin = null;
    let queued = null;
    let applyingRoute = false;
    function switchTo(view, mode) {
        applyingRoute = true;
        try { window.switchView(view, mode); } finally { applyingRoute = false; }
    }
    const loginViews = new Set(['fetch', 'flip', 'send-flip', 'profile', 'performance', 'photos', 'room-album',
        'member-dynamic', 'member-weibo', 'trip', 'room-radio', 'invoice', 'private-messages', 'followed-rooms', 'community']);
    const notify = message => { if (typeof window.showToast === 'function') window.showToast(message); };
    async function navigate(route) {
        const request = ++revision;
        waitingForLogin = null;
        if (loginViews.has(route.view) && !window.getAppToken?.()) {
            waitingForLogin = route;
            switchTo('login');
            notify('请先登录，登录后将打开目标页面');
            return;
        }
        try {
            if (['room', 'album', 'voice'].includes(route.action)) {
                try { await window.YayaMemberDataStore?.loadMemberData(); } catch (_) { /* Direct IDs can still resolve without the catalogue. */ }
                if (request !== revision) return;
            }
            if (route.action === 'send') window.suppressNextFlipMemberAutofocus = true;
            switchTo(route.view, route.mode);
            if (route.action === 'media') {
                await window.playLiveStream({ liveId: route.id, userInfo: { nickname: '直播/回放' }, title: '直播/回放', startTime: 0, ctime: 0 }, route.mode);
            } else if (route.action === 'room') {
                if (!window.openFollowedRoomByChannelId(route.id)) {
                    const response = await ipc.invoke('fetch-pocket-api', {
                        path: '/im/api/v1/im/team/room/info', postData: JSON.stringify({ channelId: route.id })
                    });
                    if (request !== revision) return;
                    const content = response?.content || {};
                    const info = content.channelInfo || content;
                    const serverId = String(info.serverId || content.serverId || '');
                    if (response?.success !== false && (response?.success || response?.status === 200) && /^[1-9]\d{0,31}$/.test(serverId)
                        && (!info.channelId || String(info.channelId) === route.id)) {
                        window.openFollowedChat(info.ownerName || content.ownerInfo?.nickname || '房间', route.id, serverId,
                            { memberId: String(info.ownerId || '') });
                    } else notify('未找到对应房间，或当前账号无权访问');
                }
            } else if (route.action === 'voice') {
                if (window.openRoomRadioByChannelId(route.id)) {
                    await window.connectRoomRadio({ isCurrent: () => request === revision });
                }
            } else if (route.action === 'user') {
                await window.openFollowedUserProfile(route.id, '口袋用户', '', false);
            } else if (route.action === 'music') {
                window.applyOfficialSiteMusicRouteFilter(route.musicFilter, route.albumTitle, route.albumGroup);
            } else if (route.action) {
                const actions = { message: 'openPrivateMessageDetail', album: 'openRoomAlbumByChannelId', stage: 'openPerformanceById',
                    post: 'openMemberDynamicById', weibo: 'openMemberWeiboById', profile: 'openProfileById', trip: 'openTripById',
                    send: 'openFlipSendByMemberId', nft: 'openMemberPhotosById', community: 'openCommunityTopic' };
                const handler = window[actions[route.action]];
                if (typeof handler === 'function') await handler(route.id);
                else notify('当前版本暂不能打开该详情页');
            }
        } catch (_) { if (request === revision) notify('打开链接失败，请稍后重试'); }
    }
    function ready() {
        if (!window.__appStartupComplete) return;
        ipc.send('deep-link-ready');
        if (queued) { const route = queued; queued = null; void navigate(route); }
    }
    function acceptRoute(route) {
        // The main process validates links; recheck the route before selecting a view.
        if (!route || !window.YayaDeepLink.views.includes(route.view)) return;
        if (!window.__appStartupComplete) { queued = route; return; }
        void navigate(route);
    }
    ipc.on('deep-link-open', (_event, route) => acceptRoute(route));
    window.addEventListener('yaya:cloud-home-link', event => acceptRoute(window.YayaDeepLink.parseDeepLink(event.detail?.url)));
    window.addEventListener('yaya:app-startup-complete', ready);
    window.addEventListener('yaya:view-changed', event => {
        if (applyingRoute) return;
        revision++;
        if (event.detail?.view !== 'login') waitingForLogin = null;
    });
    window.addEventListener('yaya:account-state-changed', event => {
        if (!event.detail?.loggedIn) { revision++; return; }
        if (!event.detail?.loggedIn || !waitingForLogin) return;
        const route = waitingForLogin;
        waitingForLogin = null;
        const request = revision;
        setTimeout(() => { if (request === revision) void navigate(route); }, 0);
    });
    if (window.__appStartupComplete) ready();
})();
