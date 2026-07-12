(function () {
    if (!window.desktop || window.desktop.platform !== 'web') return;

    const APP_TITLE = '牙牙消息';
    const routeMap = {
        home: { view: 'home', mode: null, title: '' },
        live: { view: 'media', mode: 'live', title: '正在直播' },
        vod: { view: 'media', mode: 'vod', title: '直播回放' },
        'meet48-live': { view: 'media', mode: 'meet-live', title: '海外直播' },
        'meet48-vod': { view: 'media', mode: 'meet-vod', title: '海外回放' },
        replay: { view: 'media', mode: 'vod', title: '直播回放' },
        room: { view: 'followed-rooms', mode: null, title: '口袋房间' },
        'followed-rooms': { view: 'followed-rooms', mode: null, title: '口袋房间' },
        message: { view: 'private-messages', mode: null, title: '私信列表' },
        '48qu': { view: 'community', mode: null, title: '社区' },
        community: { view: 'community', mode: null, title: '社区' },
        pbc: { view: 'pbc', mode: null, title: '屏蔽词检测' },
        img: { view: 'room-album', mode: null, title: '房间相册' },
        dynamic: { view: 'member-dynamic', mode: null, title: '成员动态' },
        weibo: { view: 'member-weibo', mode: null, title: '成员微博' },
        openlive: { view: 'openlive', mode: null, title: '公演记录' },
        'send-flip': { view: 'send-flip', mode: null, title: '翻牌提问' },
        flip: { view: 'flip', mode: null, title: '翻牌记录' },
        nft: { view: 'photos', mode: null, title: '个人相册' },
        video: { view: 'video-library', mode: null, title: '视频' },
        music: { view: 'official-site-music', mode: null, title: '音乐' },
        'official-site-music': { view: 'official-site-music', mode: null, title: '音乐' },
        audio: { view: 'audio-programs', mode: null, title: '电台' },
        profile: { view: 'profile', mode: null, title: '成员档案' },
        database: { view: 'database', mode: null, title: '数据库' },
        invoice: { view: 'invoice', mode: null, title: '开具发票' },
        melee: { view: 'melee-rank', mode: null, title: '鸡腿榜' },
        trip: { view: 'trip', mode: null, title: '成员行程' },
        login: { view: 'login', mode: null, title: '账号登录' },
        settings: { view: 'settings', mode: null, title: '软件设置' },
        voice: { view: 'room-radio', mode: null, title: '房间上麦' }
    };

    const viewToSlug = new Map();
    Object.entries(routeMap).forEach(([slug, route]) => {
        const key = getViewKey(route.view, route.mode);
        if (!viewToSlug.has(key) || slug === route.view) {
            viewToSlug.set(key, slug);
        }
    });
    viewToSlug.set(getViewKey('media', 'live'), 'live');
    viewToSlug.set(getViewKey('media', 'vod'), 'vod');
    viewToSlug.set(getViewKey('media', 'meet-live'), 'meet48-live');
    viewToSlug.set(getViewKey('media', 'meet-vod'), 'meet48-vod');
    viewToSlug.set(getViewKey('private-messages', null), 'message');
    viewToSlug.set(getViewKey('community', null), '48qu');
    viewToSlug.set(getViewKey('pbc', null), 'pbc');
    viewToSlug.set(getViewKey('room-album', null), 'img');
    viewToSlug.set(getViewKey('member-dynamic', null), 'dynamic');
    viewToSlug.set(getViewKey('member-weibo', null), 'weibo');
    viewToSlug.set(getViewKey('photos', null), 'nft');
    viewToSlug.set(getViewKey('video-library', null), 'video');
    viewToSlug.set(getViewKey('audio-programs', null), 'audio');
    viewToSlug.set(getViewKey('room-radio', null), 'voice');
    viewToSlug.set(getViewKey('official-site-music', null), 'music');
    viewToSlug.set(getViewKey('melee-rank', null), 'melee');
    viewToSlug.set(getViewKey('trip', null), 'trip');
    viewToSlug.set(getViewKey('invoice', null), 'invoice');

    let applyingRoute = false;

    function getViewKey(viewName, mode) {
        return `${viewName || 'home'}:${mode || ''}`;
    }

    function getRouteTitle(viewName, mode) {
        const key = getViewKey(viewName, mode);
        const slug = viewToSlug.get(key);
        return slug && routeMap[slug] ? routeMap[slug].title : '';
    }

    function normalizeRouteSlug() {
        const hashRoute = String(window.location.hash || '').replace(/^#\/?/, '').trim()
            .split('?')[0]
            .split('&')[0];
        if (hashRoute) return hashRoute;

        const pathRoute = decodeURIComponent(String(window.location.pathname || '/'))
            .replace(/^\/+|\/+$/g, '')
            .split('/')[0];
        return pathRoute && pathRoute !== 'index.html' ? pathRoute : 'home';
    }

    function getCurrentRoute() {
        const slug = normalizeRouteSlug();
        return routeMap[slug] || routeMap.home;
    }

    function updateDocumentTitle(viewName, mode) {
        const title = getRouteTitle(viewName, mode);
        document.title = title ? `${APP_TITLE} - ${title}` : APP_TITLE;
        document.body.classList.toggle('web-secondary-page', !!title);
    }

    function updateUrl(viewName, mode, replace) {
        const title = getRouteTitle(viewName, mode);
        const key = getViewKey(viewName, mode);
        const slug = title ? (viewToSlug.get(key) || viewName) : 'home';
        const nextPath = slug === 'home' ? '/' : `/${encodeURIComponent(slug)}`;
        const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
        if (currentPath === nextPath && !window.location.hash) return;

        if (replace) {
            history.replaceState({ viewName, mode }, '', nextPath);
        } else {
            history.pushState({ viewName, mode }, '', nextPath);
        }
    }

    function installSwitchViewRouter() {
        const nativeSwitchView = window.switchView;
        if (typeof nativeSwitchView !== 'function' || nativeSwitchView.__webRouted) return false;

        const routedSwitchView = function (viewName, mode = null, options = {}) {
            const result = nativeSwitchView(viewName, mode);
            updateDocumentTitle(viewName, mode);

            if (!applyingRoute) {
                updateUrl(viewName, mode, !!options.replace);
            }

            return result;
        };

        routedSwitchView.__webRouted = true;
        routedSwitchView.native = nativeSwitchView;
        window.switchView = routedSwitchView;
        window.toggleSidebar = function () {
            window.switchView('home');
        };
        return true;
    }

    function applyRoute(replace = true) {
        if (!installSwitchViewRouter()) return;

        const route = getCurrentRoute();
        applyingRoute = true;
        try {
            window.switchView(route.view, route.mode, { replace });
            updateDocumentTitle(route.view, route.mode);
            updateUrl(route.view, route.mode, true);
        } finally {
            applyingRoute = false;
        }
    }

    function boot() {
        if (!installSwitchViewRouter()) {
            setTimeout(boot, 30);
            return;
        }

        applyRoute(true);
        window.addEventListener('popstate', () => applyRoute(true));
        window.addEventListener('hashchange', () => {
            if (!applyingRoute) applyRoute(true);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
