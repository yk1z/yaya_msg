(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.YayaDeepLink = api;
})(typeof window !== 'undefined' ? window : null, function () {
    const SCHEME = 'yayamsg';
    const views = ['home', 'followed-rooms', 'messages', 'media', 'login', 'downloads', 'invoice', 'database',
        'melee-rank', 'official-site-music', 'fetch', 'private-messages', 'bilibili-live', 'audio-programs',
        'community', 'pbc', 'ip-check', 'video-library', 'music-library', 'flip', 'netface', 'send-flip', 'room-album',
        'member-weibo', 'member-dynamic', 'trip', 'photos', 'profile', 'performance', 'open-live', 'room-radio', 'settings'];
    const aliases = { room: 'followed-rooms', message: 'private-messages', img: 'room-album', stage: 'performance',
        post: 'member-dynamic', weibo: 'member-weibo', send: 'send-flip', nft: 'photos', music: 'official-site-music',
        audio: 'audio-programs', video: 'video-library', melee: 'melee-rank', voice: 'room-radio', account: 'login',
        openlive: 'performance', 'open-live': 'performance' };
    const detailActions = { 'followed-rooms': 'room', 'private-messages': 'message', 'room-album': 'album',
        performance: 'stage', 'member-dynamic': 'post', 'member-weibo': 'weibo', profile: 'profile', trip: 'trip',
        'send-flip': 'send', photos: 'nft', community: 'community', 'room-radio': 'voice' };
    const mediaModes = ['live', 'vod', 'meet-live', 'meet-vod'];
    function parseDeepLink(raw) {
        if (typeof raw !== 'string' || raw.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(raw)) return null;
        let url;
        try { url = new URL(raw); } catch (_) { return null; }
        if (url.protocol !== SCHEME + ':' || url.username || url.password || url.port || url.hash) return null;
        let parts;
        try { parts = [url.hostname, ...url.pathname.split('/').filter(Boolean)].filter(Boolean).map(decodeURIComponent); }
        catch (_) { return null; }
        if (parts.some(part => !part || /[\u0000-\u001f\u007f\\]/.test(part) || part === '.' || part === '..')) return null;
        const slug = parts.shift() || 'home';
        const view = slug === 'user' ? 'followed-rooms' : mediaModes.includes(slug) ? 'media' : aliases[slug] || slug;
        if (!views.includes(view)) return null;
        const mode = view === 'media' ? (mediaModes.includes(slug) ? slug : url.searchParams.get('mode') || 'live') : null;
        if (mode && !mediaModes.includes(mode)) return null;
        const route = { slug, view, mode, action: '', id: '' };
        if (view === 'official-site-music') {
            if (parts.length) {
                const groups = ['ALL', 'SNH', 'GNZ', 'BEJ', 'CKG', 'CGT', 'SHY', 'AKB', 'TSH', 'TPE'];
                const filter = parts.shift();
                route.musicFilter = filter.toLowerCase() === 'favorite' ? 'favorite' : filter.toUpperCase().replace(/48$/, '');
                if (!groups.includes(route.musicFilter) && route.musicFilter !== 'favorite') return null;
                if (route.musicFilter === 'favorite' && parts.length === 1) return null;
                route.albumGroup = route.musicFilter === 'favorite'
                    ? (parts.length > 1 ? parts.shift().toUpperCase().replace(/48$/, '') : 'ALL') : route.musicFilter;
                if (route.albumGroup !== 'favorite' && !groups.includes(route.albumGroup)) return null;
                route.albumTitle = parts.join('/');
                if (route.albumTitle.length > 256) return null;
                route.action = 'music';
            }
        } else if (parts.length) {
            if (parts.length !== 1) return null;
            route.action = slug === 'user' ? 'user' : view === 'media' ? 'media' : detailActions[view] || '';
            if (!route.action) return null;
            route.id = parts[0];
            if (!(['stage', 'media'].includes(route.action) ? /^[a-z0-9_-]{1,128}$/i : /^[1-9]\d{0,31}$/).test(route.id)) return null;
        } else if (slug === 'user') return null;
        return route;
    }
    function findDeepLink(args) {
        return (Array.isArray(args) ? args : []).map(parseDeepLink).filter(Boolean).at(-1) || null;
    }
    return { SCHEME, views, parseDeepLink, findDeepLink };
});
