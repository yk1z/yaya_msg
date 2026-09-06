(function () {
    const isWebRuntime = window.desktop?.platform === 'web';
    const { escapeHtml } = window.YayaRendererUtils;
    const OFFICIAL_SITE_ORIGIN = 'https://www.snh48.com';
    const OFFICIAL_SITE_SCRIPT_BASE = `${OFFICIAL_SITE_ORIGIN}/js`;
    const DATA_BASE_URL = 'https://data.gnz.hk';
    const MUSIC_COVER_CACHE_WIDTH = 160;
    const MUSIC_COVER_CACHE_CONCURRENCY = 4;
    const WEB_MUSIC_COVER_CACHE_NAME = 'yaya-music-covers-v1';
    const MUSIC_LYRICS_BASE_URL = `${DATA_BASE_URL}/lyrics`;
    const MUSIC_LYRICS_INDEX_URL = `${DATA_BASE_URL}/lyrics-index.json`;
    const R2_MUSIC_PUBLIC_ORIGIN = 'https://gnz.hk';
    const R2_MUSIC_API_FALLBACK_ORIGIN = 'https://gnz.hk';
    const R2_MUSIC_OBJECT_ORIGIN = 'https://music.gnz.hk';
    const FAVORITES_STORAGE_KEY = 'yaya_official_site_music_favorites';
    const PLAY_QUEUE_STORAGE_KEY = 'yaya_official_site_music_play_queue_v1';
    const PLAYER_STATE_STORAGE_KEY = 'yaya_official_site_music_player_state';
    const DURATION_STORAGE_KEY = 'yaya_official_site_music_durations';
    const TRACKS_CACHE_STORAGE_KEY = 'yaya_official_site_music_tracks_cache_v10';
    const R2_TRACKS_CACHE_STORAGE_KEY = 'yaya_official_site_r2_music_tracks_cache_v10';
    const VOLUME_STORAGE_KEY = 'yaya_music_volume_v2';
    const VIEW_MODE_STORAGE_KEY = 'yaya_official_site_music_view_mode_v1';
    const TRACKS_CACHE_TTL = 24 * 60 * 60 * 1000;
    const DEFAULT_MUSIC_VOLUME = 0.43;
    const ALBUM_COVER_ELEMENT_CACHE_LIMIT = 320;
    const ALBUM_COVER_IMAGE_SELECTOR = '.official-site-music-album-cover img, .official-site-music-album-detail-cover img';
    const albumCoverElementCache = new Map();
    let activeR2MusicPublicOrigin = R2_MUSIC_PUBLIC_ORIGIN;
    const GROUPS = [
        { key: 'SNH', label: 'SNH48', script: 'json_data_snh.js', listVar: 'ix_mp3list_snh', recordsVar: 'records_snh', songsVar: 'ix_songs_snh' },
        { key: 'GNZ', label: 'GNZ48', script: 'json_data_gnz.js', listVar: 'ix_mp3list_gnz', recordsVar: 'records_gnz', songsVar: 'ix_songs_gnz' },
        { key: 'BEJ', label: 'BEJ48', script: 'json_data_bej.js', listVar: 'ix_mp3list_bej', recordsVar: 'records_bej', songsVar: 'ix_songs_bej' },
        { key: 'CKG', label: 'CKG48', script: 'json_data_ckg.js', listVar: 'ix_mp3list_ckg', recordsVar: 'records_ckg', songsVar: 'ix_songs_ckg' },
        { key: 'CGT', label: 'CGT48', script: 'json_data_cgt.js', listVar: 'ix_mp3list_cgt', recordsVar: 'records_cgt', songsVar: 'ix_songs_cgt' }
    ];
    const GROUP_SORT_ORDER = new Map([
        ['SNH', 0],
        ['GNZ', 1],
        ['BEJ', 2],
        ['CKG', 3],
        ['CGT', 4],
        ['SHY', 5],
        ['AKB', 6],
        ['TSH', 7],
        ['TPE', 8]
    ]);
    const MUSIC_ROUTE_GROUP_KEYS = new Set(GROUP_SORT_ORDER.keys());
    const MUSIC_ALBUM_DEDUP_ALIASES = new Map([
        ['foreveryoung无限青春', 'foreveryoung']
    ]);
    const MUSIC_ALBUM_SIGNATURE_ALIASES = new Map([
        ['gnz:甜蜜盛典', 'gnz:不见不散'],
        ['gnz:此刻到永远', 'snh:此刻到永远'],
        ['ckg:再见坏天气', 'snh:再见坏天气'],
        ['cgt:再见坏天气', 'snh:再见坏天气']
    ]);
    const MUSIC_GROUP_DEDUP_ALIASES = new Map([
        ['塞纳河组合', 'snh'],
        ['塞纳河', 'snh']
    ]);
    const MUSIC_ALBUM_GROUPING_ORDER = [
        'EP',
        '单曲',
        '专辑',
        '公演专辑',
        '毕业单曲',
        '乐曜曲计划',
        '周年主题曲',
        '总选主题曲',
        '偶像运动会主题曲',
        '影视主题曲',
        '游戏主题曲',
        '品牌宣传曲',
        '未分类'
    ];
    const MUSIC_ALBUM_GROUPING_LABELS = new Map([
        ['偶像运动会主题曲', '偶像运动会']
    ]);

    const state = {
        allTracks: [],
        filteredTracks: [],
        currentTrackId: null,
        groupFilter: 'ALL',
        albumGroupingFilter: 'ALL',
        favoritesOnly: false,
        favoriteTrackKeys: new Set(),
        playQueueKeys: [],
        searchTerm: '',
        sortKey: 'source',
        sortDirection: 'asc',
        viewMode: 'list',
        albumFocusKey: '',
        routeAlbumTitle: '',
        routeAlbumGroup: '',
        albumGalleryScrollTop: 0,
        playMode: 'sequence',
        previousVolume: 1,
        lyricsIndexPromise: null,
        currentLyrics: [],
        currentLyricMeta: null,
        currentLyricActiveIndex: -1,
        lyricsVisible: false,
        lyricsRequestId: 0,
        lyricsUserScrolling: false,
        lyricsScrollResumeTimer: null,
        lyricsScrollListenersBound: false,
        progressAnimationFrame: null,
        progressAnchorTime: 0,
        progressAnchorStamp: 0,
        playerStateSaveTimer: null,
        lastPlayerStateSavedAt: 0,
        restoredPlayerState: false,
        suspendedPlaybackIntent: false,
        suppressNextPauseStateSave: false,
        mediaSessionBound: false,
        durationCache: new Map(),
        coverRequestId: 0,
        playbackRequestId: 0,
        coverCachePromises: new Map(),
        coverCacheQueue: [],
        coverCacheActive: 0,
        errorMessage: '',
        isLoaded: false,
        isLoading: false
    };

    const PLAYER_MODE_ORDER = ['sequence', 'loop-one', 'shuffle'];
    const PLAYER_MODE_LABELS = {
        sequence: '顺序',
        'loop-one': '单曲',
        shuffle: '随机'
    };

    const GNZ_ALBUM_BY_TITLE = new Map([
        ['Brave Heart', '此刻到永远'],
        ['HERO', 'HERO'],
        ['抱紧处理', '抱紧处理'],
        ['不见不散', '甜蜜盛典'],
        ['SAY NO', 'SAY NO'],
        ['I Know', 'SAY NO'],
        ['就是现在', 'SAY NO'],
        ['未知方向', 'SAY NO'],
        ['蠢蠢', 'SAY NO'],
        ['蒲公英的脚印', 'I.F'],
        ['Miss Camellia', 'I.F'],
        ['向日葵约定', 'I.F'],
        ['粉红白玫瑰', 'I.F'],
        ['紫荆', 'I.F'],
        ['新年好', 'BOOM ! BOOM ! BOOM !'],
        ['拆封未来', 'BOOM ! BOOM ! BOOM !'],
        ['青春不败', 'BOOM ! BOOM ! BOOM !'],
        ['梦飞船', 'BOOM ! BOOM ! BOOM !'],
        ['回家', 'BOOM ! BOOM ! BOOM !'],
        ['你所不知道的我', '你所不知道的我'],
        ['LOVE', '你所不知道的我'],
        ['近未来', '你所不知道的我'],
        ['做自己的主宰', '你所不知道的我'],
        ['这样的我', '你所不知道的我']
    ]);

    const SNH_ALBUM_BY_AUDIO_GROUP = new Map([
        ['fly', 'F.L.Y成长三部曲'],
        ['wmlc', '我们的旅程'],
        ['newyear', '新年的钟声'],
        ['bluelight', '新年的钟声'],
        ['banoil', '新年的钟声'],
        ['dudubaby', '新年的钟声'],
        ['gogirl', '新年的钟声'],
        ['gayni', '新年的钟声'],
        ['kyt', '苦与甜'],
        ['myself', '盛夏好声音'],
        ['kissing', '盛夏好声音'],
        ['speedeye', '盛夏好声音'],
        ['philosophy', '盛夏好声音'],
        ['afterrain', '雨季之后'],
        ['diary', '雨季之后'],
        ['sha', '雨季之后'],
        ['planetreeh', '雨季之后'],
        ['wolf', '雨季之后'],
        ['gaobai', '青春的约定'],
        ['gravita', '青春的约定'],
        ['suki', '青春的约定'],
        ['dreamriver', '青春的约定'],
        ['planetree', '呜吒（UZA）'],
        ['rabit', '呜吒（UZA）'],
        ['miss', '呜吒（UZA）'],
        ['sunset', '呜吒（UZA）'],
        ['solong', '一心向前'],
        ['sakurasiori', '一心向前'],
        ['wind', '一心向前'],
        ['megami', '一心向前'],
        ['hr_n', '无尽旋转【蓝版】'],
        ['fg_n', '一心向前'],
        ['river_n', '一心向前'],
        ['boni_n', '一心向前'],
        ['down', '心电感应'],
        ['love', '心电感应'],
        ['sunrise', '心电感应'],
        ['blackwhite', '心电感应'],
        ['chrismas', '爱的幸运曲奇'],
        ['maybe', '爱的幸运曲奇'],
        ['beginner', '爱的幸运曲奇'],
        ['boni', '飞翔入手'],
        ['shitou', '飞翔入手'],
        ['river', '无尽旋转'],
        ['sakura', '无尽旋转']
    ]);

    const MUSIC_LYRIC_TITLE_ALIASES = new Map([
        ['奔跑的少女', ['奔跑吧少女']],
        ['Heavy Rotation', ['闪亮的幸运']],
        ['闪亮的幸运', ['Heavy Rotation']],
        ['最初的爱', ['最初的，最后的爱', '最初的，最后的爱 (Live)']],
        ['花火 ((Fire in the rA.I.n)', ['花火 (Fire in the rA.I.n)', '花火']],
        ['荊棘皇冠', ['荆棘皇冠']]
    ]);

    const SNH_LYRIC_PATH_BY_AUDIO_GROUP_AND_TITLE = new Map([
        ['10th:gravity', 'SNH48/专辑2 绝无仅有的感动/GNZ48 Team G - 重力 (Gravity).lrc'],
        ['10th:remenberyou', 'SNH48/专辑2 绝无仅有的感动/CKG48 - 记得你.lrc'],
        ['tianmi:新的帷幕(ckg48)', 'CKG48/EP1 甜蜜盛典/CKG48 - 新的帷幕.lrc']
    ]);

    function $(id) {
        return document.getElementById(id);
    }

    function normalizeMusicUrl(url) {
        const text = String(url || '').trim();
        if (!text) return '';
        if (text.startsWith('//')) return `https:${text}`;
        if (text.startsWith('http://')) return text.replace(/^http:/i, 'https:');
        if (text.startsWith('/')) return `${OFFICIAL_SITE_ORIGIN}${text}`;
        return text;
    }

    function normalizeOfficialAssetUrl(url) {
        const text = String(url || '').trim();
        if (!text) return '';
        if (text.startsWith('//')) return `https:${text}`;
        if (text.startsWith('http://')) return text.replace(/^http:/i, 'https:');
        if (text.startsWith('/')) return `${OFFICIAL_SITE_ORIGIN}${text}`;
        return text;
    }

    function normalizeLookupUrl(url) {
        return normalizeMusicUrl(url).toLowerCase();
    }

    function getCachedOfficialSiteMusicCoverUrl(remoteUrl) {
        if (isOfficialSiteMusicWebRuntime() || !/^https?:\/\//i.test(String(remoteUrl || ''))) return '';
        try {
            return window.desktop?.imageCache?.getCachedThumbnailUrlSync?.(
                remoteUrl,
                MUSIC_COVER_CACHE_WIDTH
            ) || '';
        } catch (error) {
            window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/official-site-music-feature.js');
            return '';
        }
    }

    function getOfficialSiteMusicCoverDisplayUrl(remoteUrl) {
        const normalizedUrl = String(remoteUrl || '').trim();
        if (!normalizedUrl) return '';
        return getCachedOfficialSiteMusicCoverUrl(normalizedUrl) || normalizedUrl;
    }

    async function cacheWebOfficialSiteMusicCover(remoteUrl) {
        if (!('caches' in window) || typeof window.fetch !== 'function') return '';
        const cache = await window.caches.open(WEB_MUSIC_COVER_CACHE_NAME);
        const cachedResponse = await cache.match(remoteUrl, { ignoreVary: true });
        if (cachedResponse) {
            document.documentElement.dataset.musicCoverCache = 'ready';
            return remoteUrl;
        }

        let response;
        try {
            response = await window.fetch(remoteUrl, {
                mode: 'cors',
                credentials: 'omit',
                cache: 'force-cache'
            });
        } catch (corsError) {
            window.YayaRendererUtils.reportIgnoredError(corsError, 'src/renderer/official-site-music-feature.js');
            response = await window.fetch(remoteUrl, {
                mode: 'no-cors',
                credentials: 'omit',
                cache: 'force-cache'
            });
        }
        if (!response || (!response.ok && response.type !== 'opaque')) return '';
        await cache.put(remoteUrl, response.clone());
        document.documentElement.dataset.musicCoverCache = 'ready';
        return remoteUrl;
    }

    function pumpOfficialSiteMusicCoverCacheQueue() {
        const isWeb = isOfficialSiteMusicWebRuntime();
        if (isWeb && (!('caches' in window) || typeof window.fetch !== 'function')) return;
        if (!isWeb && !window.desktop?.ipcRenderer?.invoke) return;
        while (state.coverCacheActive < MUSIC_COVER_CACHE_CONCURRENCY && state.coverCacheQueue.length) {
            const task = state.coverCacheQueue.shift();
            state.coverCacheActive += 1;
            const cacheTask = isWeb
                ? cacheWebOfficialSiteMusicCover(task.remoteUrl)
                : window.desktop.ipcRenderer.invoke('cache-image-thumbnail', {
                    url: task.remoteUrl,
                    width: MUSIC_COVER_CACHE_WIDTH
                }).then((result) => result?.success && result.url ? result.url : '');
            cacheTask.then((cachedUrl) => {
                task.resolve(cachedUrl || '');
            }).catch((error) => {
                window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/official-site-music-feature.js');
                task.resolve('');
            }).finally(() => {
                state.coverCacheActive -= 1;
                pumpOfficialSiteMusicCoverCacheQueue();
            });
        }
    }

    function cacheOfficialSiteMusicCover(remoteUrl) {
        const normalizedUrl = String(remoteUrl || '').trim();
        if (!/^https?:\/\//i.test(normalizedUrl)) {
            return Promise.resolve('');
        }
        if (!isOfficialSiteMusicWebRuntime()) {
            const cachedUrl = getCachedOfficialSiteMusicCoverUrl(normalizedUrl);
            if (cachedUrl) return Promise.resolve(cachedUrl);
        }
        if (state.coverCachePromises.has(normalizedUrl)) {
            return state.coverCachePromises.get(normalizedUrl);
        }

        let resolveTask;
        const promise = new Promise((resolve) => {
            resolveTask = resolve;
        });
        state.coverCachePromises.set(normalizedUrl, promise);
        state.coverCacheQueue.push({ remoteUrl: normalizedUrl, resolve: resolveTask });
        pumpOfficialSiteMusicCoverCacheQueue();
        return promise;
    }

    function warmOfficialSiteMusicCoverCache(tracks = state.allTracks) {
        if (isOfficialSiteMusicWebRuntime()) return;
        const coverUrls = new Set((Array.isArray(tracks) ? tracks : [])
            .map((track) => String(track?.coverUrl || '').trim())
            .filter((url) => /^https?:\/\//i.test(url)));
        coverUrls.forEach((url) => {
            cacheOfficialSiteMusicCover(url);
        });
    }

    function setStatus(text) {
        const status = $('official-site-music-status');
        if (status) status.textContent = text;
    }

    function getOfficialSiteMusicCoverElementKey(image) {
        const src = String(image?.getAttribute?.('src') || '').trim();
        if (!src) return '';
        try {
            return new URL(src, document.baseURI).href;
        } catch (_) {
            return src;
        }
    }

    function stashOfficialSiteMusicAlbumCoverElements(root) {
        if (!root?.querySelectorAll) return;
        root.querySelectorAll(ALBUM_COVER_IMAGE_SELECTOR).forEach((image) => {
            const key = getOfficialSiteMusicCoverElementKey(image);
            if (key && !albumCoverElementCache.has(key)) {
                albumCoverElementCache.set(key, image);
            }
        });
        while (albumCoverElementCache.size > ALBUM_COVER_ELEMENT_CACHE_LIMIT) {
            const oldestKey = albumCoverElementCache.keys().next().value;
            if (!oldestKey) break;
            albumCoverElementCache.delete(oldestKey);
        }
    }

    function restoreOfficialSiteMusicAlbumCoverElements(root) {
        if (!root?.querySelectorAll || albumCoverElementCache.size === 0) return;
        root.querySelectorAll(ALBUM_COVER_IMAGE_SELECTOR).forEach((nextImage) => {
            const key = getOfficialSiteMusicCoverElementKey(nextImage);
            const cachedImage = key ? albumCoverElementCache.get(key) : null;
            if (!cachedImage || cachedImage === nextImage) return;
            ['alt', 'loading', 'decoding', 'fetchpriority'].forEach((attribute) => {
                if (nextImage.hasAttribute(attribute)) {
                    cachedImage.setAttribute(attribute, nextImage.getAttribute(attribute));
                } else {
                    cachedImage.removeAttribute(attribute);
                }
            });
            nextImage.replaceWith(cachedImage);
            albumCoverElementCache.delete(key);
        });
    }

    function replaceOfficialSiteMusicListHtml(list, html) {
        stashOfficialSiteMusicAlbumCoverElements(list);
        list.innerHTML = html;
        restoreOfficialSiteMusicAlbumCoverElements(list);
    }

    function setEmpty(text) {
        const list = $('official-site-music-list');
        if (!list) return;
        list.classList.add('is-empty');
        replaceOfficialSiteMusicListHtml(list, `<div class="official-site-music-empty">${escapeHtml(text)}</div>`);
    }

    function showOfficialMusicToast(message) {
        if (typeof window.showToast === 'function') {
            window.showToast(message);
        }
    }

    function readStringSetting(key, fallbackValue = '') {
        if (typeof window.readStoredStringSetting === 'function') {
            return window.readStoredStringSetting(key, fallbackValue);
        }
        const legacyValue = localStorage.getItem(key);
        return legacyValue === null ? fallbackValue : String(legacyValue);
    }

    function writeStringSetting(key, value) {
        if (typeof window.writeStoredStringSetting === 'function') {
            return window.writeStoredStringSetting(key, value);
        }
        localStorage.setItem(key, value);
        return value;
    }

    function cleanupLegacyOfficialSiteMusicCaches() {
        const removeSetting = typeof window.removeStoredSetting === 'function'
            ? window.removeStoredSetting
            : (key) => localStorage.removeItem(key);
        for (let version = 1; version <= 8; version += 1) {
                try { removeSetting(`yaya_official_site_music_tracks_cache_v${version}`); } catch (_) {}
        }
        const cacheApi = window.desktop?.appCache;
        for (let version = 1; version <= 7; version += 1) {
            const key = `yaya_official_site_r2_music_tracks_cache_v${version}`;
            try {
                if (cacheApi && typeof cacheApi.removeCacheValueSync === 'function') {
                    cacheApi.removeCacheValueSync(key);
                } else {
                    localStorage.removeItem(key);
                }
            } catch (_) {}
        }
    }

    function clampOfficialSiteMusicVolume(value, fallback = DEFAULT_MUSIC_VOLUME) {
        const volume = Number(value);
        return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : fallback;
    }

    function readExplicitOfficialSiteMusicVolume() {
        const savedVolume = readStringSetting(VOLUME_STORAGE_KEY, '');
        if (savedVolume === '') return null;
        const volume = Number(savedVolume);
        return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : null;
    }

    function isOfficialSiteMusicWebRuntime() {
        return Boolean(
            window.desktop?.platform === 'web' ||
            document.documentElement?.dataset?.platform === 'web'
        );
    }

    function hasOfficialSiteMusicPinyinTool() {
        return typeof (window.pinyinPro && window.pinyinPro.pinyin) === 'function';
    }

    function readOfficialSiteMusicFavorites() {
        try {
            const rawValue = readStringSetting(FAVORITES_STORAGE_KEY, '[]');
            const parsed = JSON.parse(rawValue || '[]');
            return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : []);
        } catch (error) {
            return new Set();
        }
    }

    function saveOfficialSiteMusicFavorites() {
        writeStringSetting(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(state.favoriteTrackKeys)));
    }

    function getOfficialSiteTrackFavoriteKey(track) {
        if (!track) return '';
        return String(track.mp3 || `${track.groupKey}:${track.audioGroupKey}:${track.title}` || track.id || '');
    }

    function isOfficialSiteTrackFavorite(track) {
        const key = getOfficialSiteTrackFavoriteKey(track);
        return Boolean(key && state.favoriteTrackKeys.has(key));
    }

    function readOfficialSiteMusicPlayQueue() {
        try {
            const parsed = JSON.parse(readStringSetting(PLAY_QUEUE_STORAGE_KEY, '[]') || '[]');
            if (!Array.isArray(parsed)) return [];
            return [...new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean))];
        } catch (_) {
            return [];
        }
    }

    function saveOfficialSiteMusicPlayQueue() {
        writeStringSetting(PLAY_QUEUE_STORAGE_KEY, JSON.stringify(state.playQueueKeys));
    }

    function getOfficialSiteMusicQueueTracks() {
        if (!state.playQueueKeys.length || !state.allTracks.length) return [];
        const tracksByKey = new Map();
        state.allTracks.forEach((track) => {
            const key = getOfficialSiteTrackFavoriteKey(track);
            if (key && !tracksByKey.has(key)) tracksByKey.set(key, track);
        });
        return state.playQueueKeys.map((key) => tracksByKey.get(key)).filter(Boolean);
    }

    function setOfficialSiteMusicPlayQueue(tracks) {
        const nextKeys = [];
        const seen = new Set();
        (Array.isArray(tracks) ? tracks : []).forEach((track) => {
            const key = getOfficialSiteTrackFavoriteKey(track);
            if (!key || seen.has(key)) return;
            seen.add(key);
            nextKeys.push(key);
        });
        state.playQueueKeys = nextKeys;
        saveOfficialSiteMusicPlayQueue();
        renderOfficialSiteQueue();
    }

    function toggleOfficialSiteTrackInQueue(trackId) {
        const track = state.allTracks.find((item) => item.id === String(trackId || ''));
        const key = getOfficialSiteTrackFavoriteKey(track);
        if (!track || !key) return;
        if (state.playQueueKeys.includes(key)) {
            state.playQueueKeys = state.playQueueKeys.filter((item) => item !== key);
            saveOfficialSiteMusicPlayQueue();
            renderOfficialSiteQueue();
            showOfficialMusicToast('已移出播放列表');
            closeOfficialSiteMusicContextMenu();
            return;
        }
        state.playQueueKeys.push(key);
        saveOfficialSiteMusicPlayQueue();
        renderOfficialSiteQueue();
        showOfficialMusicToast('已添加到播放列表');
        closeOfficialSiteMusicContextMenu();
    }

    function clearOfficialSiteMusicQueue() {
        state.playQueueKeys = [];
        saveOfficialSiteMusicPlayQueue();
        renderOfficialSiteQueue();
        showOfficialMusicToast('播放列表已清空');
    }

    function readOfficialSiteMusicDurationCache() {
        try {
            const parsed = JSON.parse(readStringSetting(DURATION_STORAGE_KEY, '{}') || '{}');
            if (!parsed || typeof parsed !== 'object') return new Map();
            return new Map(Object.entries(parsed).filter(([, value]) => /^\d{1,3}:\d{2}$/.test(String(value || ''))));
        } catch (_) {
            return new Map();
        }
    }

    function saveOfficialSiteMusicDurationCache() {
        writeStringSetting(DURATION_STORAGE_KEY, JSON.stringify(Object.fromEntries(state.durationCache)));
    }

    function readOfficialSiteMusicTracksCache() {
        try {
            const parsed = JSON.parse(readStringSetting(TRACKS_CACHE_STORAGE_KEY, '{}') || '{}');
            return parsed && typeof parsed === 'object'
                ? {
                    updatedAt: Number(parsed.updatedAt) || 0,
                    tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
                    hasR2Tracks: Boolean(parsed.hasR2Tracks)
                }
                : { updatedAt: 0, tracks: [], hasR2Tracks: false };
        } catch (_) {
            return { updatedAt: 0, tracks: [], hasR2Tracks: false };
        }
    }

    function isOfficialSiteMusicTracksCacheFresh(cache = readOfficialSiteMusicTracksCache()) {
        return cache.updatedAt
            && Date.now() - cache.updatedAt < TRACKS_CACHE_TTL
            && cache.tracks.length > 0
            && !hasR2MusicTracks(cache.tracks);
    }

    function saveOfficialSiteMusicTracksCache(tracks) {
        const officialTracks = (Array.isArray(tracks) ? tracks : [])
            .filter((track) => !isR2MusicTrack(track))
            .map((track) => {
                const cachedTrack = { ...track };
                delete cachedTrack.grouping;
                delete cachedTrack.albumDate;
                return cachedTrack;
            });
        try {
            writeStringSetting(TRACKS_CACHE_STORAGE_KEY, JSON.stringify({
                updatedAt: Date.now(),
                tracks: officialTracks,
                hasR2Tracks: false
            }));
        } catch (error) {
            console.warn('[official-site-music] official cache skipped', error);
        }
    }

    function readR2MusicTracksCache() {
        const normalizeCache = (value) => {
            const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
            return parsed && typeof parsed === 'object'
                ? {
                    updatedAt: Number(parsed.updatedAt) || 0,
                    tracks: Array.isArray(parsed.tracks) ? parsed.tracks : []
                }
                : { updatedAt: 0, tracks: [] };
        };
        try {
            const cacheApi = window.desktop?.appCache;
            if (cacheApi && typeof cacheApi.getCacheValueSync === 'function') {
                const cached = cacheApi.getCacheValueSync(R2_TRACKS_CACHE_STORAGE_KEY, null);
                const normalized = normalizeCache(cached);
                if (normalized.tracks.length) return normalized;
            }
            return normalizeCache(readStringSetting(R2_TRACKS_CACHE_STORAGE_KEY, '{}'));
        } catch (_) {
            return { updatedAt: 0, tracks: [] };
        }
    }

    function saveR2MusicTracksCache(tracks) {
        const cachePayload = {
            updatedAt: Date.now(),
            tracks: Array.isArray(tracks) ? tracks : []
        };
        const cacheApi = window.desktop?.appCache;
        try {
            if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                cacheApi.setCacheValueSync(R2_TRACKS_CACHE_STORAGE_KEY, cachePayload);
                return;
            }
            writeStringSetting(R2_TRACKS_CACHE_STORAGE_KEY, JSON.stringify(cachePayload));
        } catch (error) {
            console.warn('[official-site-music] R2 cache skipped', error);
        }
    }

    function isR2MusicTrack(track) {
        if (!track) return false;
        if (track.source === 'r2-performance') return true;
        if (String(track.id || '').startsWith('R2-')) return true;
        return /\/r2-music\//i.test(String(track.mp3 || track.coverUrl || ''));
    }

    function hasR2MusicTracks(tracks) {
        return Array.isArray(tracks) && tracks.some(isR2MusicTrack);
    }

    function hasCurrentR2MusicMetadata(tracks) {
        if (!Array.isArray(tracks)) return false;
        const r2Tracks = tracks.filter(isR2MusicTrack);
        if (!r2Tracks.length) return false;
        const tshTracks = r2Tracks.filter((track) => String(track.groupKey || '').toUpperCase() === 'TSH');
        const hasAlbumGroupingMetadata = r2Tracks.every((track) => Object.prototype.hasOwnProperty.call(track, 'grouping'));
        return hasAlbumGroupingMetadata && (!tshTracks.length || tshTracks.some((track) => String(track.coverUrl || '').trim()));
    }

    function normalizeMusicDedupToken(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        const normalized = typeof text.normalize === 'function' ? text.normalize('NFKC') : text;
        return normalized.toLowerCase().replace(/[\s\p{P}\p{S}\p{M}\p{C}]+/gu, '');
    }

    function normalizeMusicDedupAlbumToken(value) {
        const album = String(value || '')
            .replace(/\s*【蓝版】\s*/gu, '')
            .replace(/\s+B版\s*$/iu, '')
            .trim();
        const token = normalizeMusicDedupToken(album);
        return MUSIC_ALBUM_DEDUP_ALIASES.get(token) || token;
    }

    function normalizeMusicDedupGroupToken(track) {
        const token = normalizeMusicDedupToken(track?.groupLabel || track?.groupKey).replace(/48$/u, '');
        return MUSIC_GROUP_DEDUP_ALIASES.get(token) || token;
    }

    function getMusicDedupTitleVariants(title) {
        const raw = String(title || '').trim();
        if (!raw) return [];
        const variants = new Set();
        const candidates = new Set([raw]);
        const withoutTeamSuffix = raw.replace(/\s*[–—-]\s*(?:team\s*)?[a-z0-9]+\s*队?\s*$/iu, '').trim();
        if (withoutTeamSuffix && withoutTeamSuffix !== raw) candidates.add(withoutTeamSuffix);
        const creditPattern = /\s*[\(（][^\(\)（）]*(?:snh48|gnz48|bej48|ckg48|cgt48|shy48|tsh48|group|team|选拔组|分团|成员|版|ver\.?)[^\(\)（）]*[\)）]\s*$/iu;
        let withoutCredits = raw;
        while (creditPattern.test(withoutCredits)) {
            withoutCredits = withoutCredits.replace(creditPattern, '').trim();
            if (!withoutCredits) break;
            candidates.add(withoutCredits);
        }

        candidates.forEach((candidate) => {
            variants.add(normalizeMusicDedupToken(candidate));
            const bilingualMatch = candidate.match(/^(.+?)\s*[\(（]([^\(\)（）]+)[\)）]\s*$/u);
            if (!bilingualMatch) return;
            const base = bilingualMatch[1].trim();
            const translated = bilingualMatch[2].trim();
            const baseHasCjk = /[\u3400-\u9fff]/u.test(base);
            const translatedHasCjk = /[\u3400-\u9fff]/u.test(translated);
            const isRecordingVariant = /(?:^|[\s._-])(?:live|acoustic|remix|demo|instrumental|off\s*vocal|ver\.?|version)(?:$|[\s._-])/iu.test(translated)
                || /(?:伴奏|现场|重混|版本)/u.test(translated);
            if (base && translated && baseHasCjk !== translatedHasCjk && !isRecordingVariant) {
                variants.add(normalizeMusicDedupToken(base));
                variants.add(normalizeMusicDedupToken(translated));
            }
        });
        return [...variants].filter(Boolean);
    }

    function getMusicDedupSignatures(track) {
        if (!track) return [];
        const albumSignature = getMusicDedupAlbumSignature(track);
        if (!albumSignature) return [];
        return getMusicDedupTitleVariants(track.title).map((title) => `${albumSignature}:${title}`);
    }

    function getMusicDedupGroupTitleSignatures(track) {
        if (!track) return [];
        const group = normalizeMusicDedupGroupToken(track);
        if (!group) return [];
        return getMusicDedupTitleVariants(track.title).map((title) => `${group}:${title}`);
    }

    function getMusicDedupAlbumSignature(track) {
        if (!track) return '';
        const group = normalizeMusicDedupGroupToken(track);
        const album = normalizeMusicDedupAlbumToken(track.album || track.artist);
        if (!group || !album) return '';
        const signature = `${group}:${album}`;
        return MUSIC_ALBUM_SIGNATURE_ALIASES.get(signature) || signature;
    }

    function isR2MusicMetadataCompatibleWithOfficial(trackOrMetadata) {
        const grouping = normalizeMusicDedupToken(trackOrMetadata?.grouping);
        return !grouping || grouping === 'ep' || grouping === '专辑';
    }

    function mergeR2MusicTracks(tracks, r2Tracks) {
        const baseTracks = (Array.isArray(tracks) ? tracks : []).filter((track) => !isR2MusicTrack(track));
        const extras = Array.isArray(r2Tracks) ? r2Tracks : [];
        baseTracks.forEach((track) => {
            if (normalizeMusicDedupAlbumToken(track.album || track.artist) === '苦与甜') {
                track.groupKey = '塞纳河组合';
                track.groupLabel = '塞纳河组合';
            }
            track.grouping = 'EP';
        });
        const r2AlbumMetadata = new Map(extras.map((track) => [getMusicDedupAlbumSignature(track), {
            grouping: String(track?.grouping || '').trim(),
            albumDate: String(track?.albumDate || '').trim(),
            albumToken: normalizeMusicDedupAlbumToken(track?.album || track?.artist),
            albumSignature: getMusicDedupAlbumSignature(track)
        }]).filter(([key]) => key));
        const r2MetadataByGroupTitle = new Map();
        extras.forEach((track) => {
            const metadata = r2AlbumMetadata.get(getMusicDedupAlbumSignature(track));
            if (!metadata) return;
            getMusicDedupGroupTitleSignatures(track).forEach((signature) => {
                if (!r2MetadataByGroupTitle.has(signature)) r2MetadataByGroupTitle.set(signature, []);
                r2MetadataByGroupTitle.get(signature).push(metadata);
            });
        });
        baseTracks.forEach((track) => {
            let metadata = r2AlbumMetadata.get(getMusicDedupAlbumSignature(track));
            const hasExactAlbumMetadata = Boolean(metadata);
            if (!metadata) {
                const officialAlbumToken = normalizeMusicDedupAlbumToken(track.album || track.artist);
                const titleTokens = new Set(getMusicDedupTitleVariants(track.title));
                const candidates = new Map();
                getMusicDedupGroupTitleSignatures(track).forEach((signature) => {
                    (r2MetadataByGroupTitle.get(signature) || []).forEach((candidate) => {
                        const isSafeAlbumMatch = candidate.albumToken === officialAlbumToken
                            || titleTokens.has(candidate.albumToken);
                        if (isSafeAlbumMatch && isR2MusicMetadataCompatibleWithOfficial(candidate)) {
                            candidates.set(candidate.albumSignature, candidate);
                        }
                    });
                });
                if (candidates.size === 1) metadata = candidates.values().next().value;
            }
            if (!metadata) return;
            if ((hasExactAlbumMetadata && String(metadata.grouping || '').trim())
                || normalizeMusicDedupToken(metadata.grouping) === '专辑'
                || !String(track.grouping || '').trim()) {
                track.grouping = metadata.grouping;
            }
            if (!String(track.albumDate || '').trim()) track.albumDate = metadata.albumDate;
        });
        const inheritedMetadataByAlbum = new Map();
        baseTracks.forEach((track) => {
            const signature = getMusicDedupAlbumSignature(track);
            if (!signature || (!track.grouping && !track.albumDate)) return;
            inheritedMetadataByAlbum.set(signature, {
                grouping: String(track.grouping || '').trim(),
                albumDate: String(track.albumDate || '').trim()
            });
        });
        baseTracks.forEach((track) => {
            const metadata = inheritedMetadataByAlbum.get(getMusicDedupAlbumSignature(track));
            if (!metadata) return;
            if (!String(track.grouping || '').trim()) track.grouping = metadata.grouping;
            if (!String(track.albumDate || '').trim()) track.albumDate = metadata.albumDate;
        });
        if (!extras.length) return baseTracks;
        const seen = new Set(baseTracks.map((track) => String(track?.id || track?.mp3 || '')));
        const officialAlbumTrackCounts = new Map();
        baseTracks.forEach((track) => {
            const signature = getMusicDedupAlbumSignature(track);
            if (signature) officialAlbumTrackCounts.set(signature, (officialAlbumTrackCounts.get(signature) || 0) + 1);
        });
        const r2AlbumTrackCounts = new Map();
        extras.forEach((track) => {
            const signature = getMusicDedupAlbumSignature(track);
            if (signature) r2AlbumTrackCounts.set(signature, (r2AlbumTrackCounts.get(signature) || 0) + 1);
        });
        const officialSignatures = new Set(baseTracks.flatMap(getMusicDedupSignatures));
        const officialGroupTitleSignatures = new Set(baseTracks.flatMap(getMusicDedupGroupTitleSignatures));
        const merged = baseTracks.slice();
        extras.forEach((track) => {
            const key = String(track?.id || track?.mp3 || '');
            if (!key || seen.has(key)) return;
            const grouping = normalizeMusicDedupToken(track?.grouping);
            const albumSignature = getMusicDedupAlbumSignature(track);
            if (grouping === '专辑'
                && officialAlbumTrackCounts.has(albumSignature)
                && officialAlbumTrackCounts.get(albumSignature) >= r2AlbumTrackCounts.get(albumSignature)) return;
            if (getMusicDedupSignatures(track).some((signature) => officialSignatures.has(signature))) return;
            if (isR2MusicMetadataCompatibleWithOfficial(track)) {
                if (grouping !== '专辑'
                    && getMusicDedupGroupTitleSignatures(track).some((signature) => officialGroupTitleSignatures.has(signature))) return;
            }
            seen.add(key);
            merged.push(track);
        });
        return merged;
    }

    function getOfficialSiteTrackDurationKey(track) {
        if (!track) return '';
        return String(track.mp3 || getOfficialSiteTrackFavoriteKey(track) || track.id || '');
    }

    function applyCachedOfficialSiteTrackDuration(track) {
        const key = getOfficialSiteTrackDurationKey(track);
        if (!track || track.duration || !key) return;
        const cached = state.durationCache.get(key);
        if (cached) track.duration = cached;
    }

    function readOfficialSiteMusicPlayerState() {
        try {
            const parsed = JSON.parse(readStringSetting(PLAYER_STATE_STORAGE_KEY, '{}') || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function findTrackBySavedPlayerState(savedState) {
        if (!savedState || !state.allTracks.length) return null;
        const savedKey = String(savedState.trackKey || savedState.mp3 || '').trim();
        const savedId = String(savedState.trackId || '').trim();
        if (savedKey) {
            const byKey = state.allTracks.find((track) => getOfficialSiteTrackFavoriteKey(track) === savedKey || track.mp3 === savedKey);
            if (byKey) return byKey;
        }
        if (savedId) {
            const byId = state.allTracks.find((track) => track.id === savedId);
            if (byId) return byId;
        }
        return null;
    }

    function saveOfficialSiteMusicPlayerState(options = {}) {
        const audio = $('official-site-music-audio');
        const track = getCurrentOfficialSiteTrack();
        const existingState = readOfficialSiteMusicPlayerState();
        const hasExplicitCurrentTime = Number.isFinite(Number(options.currentTime));
        let currentTime = hasExplicitCurrentTime
            ? Number(options.currentTime)
            : (track && audio && Number.isFinite(audio.currentTime) ? audio.currentTime : Number(existingState.currentTime) || 0);
        const savedTrackKey = String(existingState.trackKey || existingState.mp3 || '').trim();
        const savedTrackId = String(existingState.trackId || '').trim();
        const isSameSavedTrack = track && (
            (savedTrackKey && (getOfficialSiteTrackFavoriteKey(track) === savedTrackKey || track.mp3 === savedTrackKey)) ||
            (savedTrackId && track.id === savedTrackId)
        );
        const existingCurrentTime = Math.max(0, Number(existingState.currentTime) || 0);
        if (!hasExplicitCurrentTime && isSameSavedTrack && currentTime <= 0 && existingCurrentTime > 0 && !audio?.ended) {
            currentTime = existingCurrentTime;
        }
        const wasPlaying = typeof options.wasPlaying === 'boolean'
            ? options.wasPlaying
            : (track ? Boolean(state.suspendedPlaybackIntent || (audio && !audio.paused && !audio.ended)) : Boolean(existingState.wasPlaying));
        const payload = {
            trackKey: track ? getOfficialSiteTrackFavoriteKey(track) : String(existingState.trackKey || ''),
            trackId: track ? track.id : String(existingState.trackId || ''),
            mp3: track ? track.mp3 : String(existingState.mp3 || ''),
            title: track ? track.title : String(existingState.title || ''),
            currentTime: Math.max(0, currentTime || 0),
            wasPlaying,
            playMode: PLAYER_MODE_ORDER.includes(state.playMode) ? state.playMode : 'sequence',
            volume: audio ? audio.volume : DEFAULT_MUSIC_VOLUME,
            muted: audio ? Boolean(audio.muted) : false,
            updatedAt: Date.now()
        };
        writeStringSetting(PLAYER_STATE_STORAGE_KEY, JSON.stringify(payload));
        state.lastPlayerStateSavedAt = Date.now();
    }

    function requestOfficialSiteMusicPlayerStateSave() {
        const now = Date.now();
        const elapsed = now - state.lastPlayerStateSavedAt;
        if (elapsed >= 2000) {
            saveOfficialSiteMusicPlayerState();
            return;
        }
        if (state.playerStateSaveTimer) return;
        state.playerStateSaveTimer = setTimeout(() => {
            state.playerStateSaveTimer = null;
            saveOfficialSiteMusicPlayerState();
        }, Math.max(250, 2000 - elapsed));
    }

    function flushOfficialSiteMusicPlayerState(options = {}) {
        if (state.playerStateSaveTimer) {
            clearTimeout(state.playerStateSaveTimer);
            state.playerStateSaveTimer = null;
        }
        saveOfficialSiteMusicPlayerState(options);
    }

    function getCurrentOfficialSiteTrack() {
        return state.allTracks.find((item) => item.id === state.currentTrackId) || null;
    }

    function formatDuration(seconds) {
        const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
        const minutes = String(Math.floor(safeSeconds / 60));
        const remainSeconds = String(safeSeconds % 60).padStart(2, '0');
        return `${minutes}:${remainSeconds}`;
    }

    function parseTrackDuration(durationText) {
        const parts = String(durationText || '').split(':').map((part) => Number(part));
        if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return Number.POSITIVE_INFINITY;
        return parts[0] * 60 + parts[1];
    }

    function updateRenderedTrackDuration(track, durationText) {
        const cards = Array.from(document.querySelectorAll('.official-site-music-card[data-track-id]'));
        const currentCard = cards.find((card) => card.dataset.trackId === track.id);
        const durationCell = currentCard?.querySelector('.official-site-music-table-time');
        if (durationCell) durationCell.textContent = durationText;

        if (state.sortKey !== 'duration' || cards.length < 2) return;
        const table = $('official-site-music-list')?.querySelector('.official-site-music-table');
        if (!table) return;

        const cardByTrackId = new Map(cards.map((card) => [card.dataset.trackId, card]));
        state.filteredTracks = getFilteredTracks();
        state.filteredTracks.forEach((item, index) => {
            const card = cardByTrackId.get(item.id);
            if (!card) return;
            const indexCell = card.querySelector('.official-site-music-row-index');
            if (indexCell) indexCell.textContent = String(index + 1).padStart(2, '0');
            table.appendChild(card);
        });
    }

    function updateCurrentTrackDurationFromAudio() {
        if (isOfficialSiteMusicWebRuntime()) return false;
        const audio = $('official-site-music-audio');
        const track = getCurrentOfficialSiteTrack();
        if (!audio || !track || !Number.isFinite(audio.duration) || audio.duration <= 0) return false;
        const durationText = formatDuration(audio.duration);
        if (!durationText || durationText === track.duration) return false;
        track.duration = durationText;
        const key = getOfficialSiteTrackDurationKey(track);
        if (key) {
            state.durationCache.set(key, durationText);
            saveOfficialSiteMusicDurationCache();
        }
        updateRenderedTrackDuration(track, durationText);
        return true;
    }

    function resetOfficialSiteMusicSearchCaches() {
        state.allTracks.forEach((track) => {
            if (track) delete track._searchCache;
        });
    }

    function ensureOfficialSiteMusicPinyinReady() {
        if (!isOfficialSiteMusicWebRuntime() || hasOfficialSiteMusicPinyinTool() || typeof window.ensureYayaWebPinyin !== 'function') return;
        window.ensureYayaWebPinyin()
            .then(() => {
                resetOfficialSiteMusicSearchCaches();
                renderOfficialSiteMusic();
            })
            .catch((error) => {
                console.warn('[official-site-music] pinyin search helper failed', error);
            });
    }

    function getTrackSubtitle(track, options = {}) {
        if (!track) return '';
        return track.groupLabel;
    }

    function parseMusicLrc(text) {
        const lines = String(text || '').split(/\r?\n/);
        const entries = [];
        const timeReg = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

        lines.forEach((rawLine) => {
            const line = rawLine.replace(/\uFEFF/g, '');
            if (!line.trim()) return;
            if (/^\[(ti|ar|al|offset|tool|by|length):/i.test(line.trim())) return;

            const matches = [...line.matchAll(timeReg)];
            if (!matches.length) return;
            const content = line.replace(timeReg, '').trim();
            if (!content) return;
            if (window.YayaRendererUtils.isLyricCreditLine(content)) return;

            matches.forEach((match) => {
                const min = Number(match[1] || 0);
                const sec = Number(match[2] || 0);
                const fractionRaw = match[3] || '0';
                const fraction = fractionRaw.length === 3 ? Number(fractionRaw) / 1000 : Number(fractionRaw) / 100;
                entries.push({
                    time: min * 60 + sec + fraction,
                    text: content
                });
            });
        });

        return entries.sort((a, b) => a.time - b.time);
    }

    function fetchMusicLyricsIndex() {
        if (!state.lyricsIndexPromise) {
            state.lyricsIndexPromise = fetch(MUSIC_LYRICS_INDEX_URL)
                .then((res) => {
                    if (!res.ok) throw new Error('Lyrics index not found');
                    return res.json();
                })
                .catch((error) => {
                    state.lyricsIndexPromise = null;
                    throw error;
                });
        }
        return state.lyricsIndexPromise;
    }

    function encodeMusicLyricPath(path) {
        return String(path || '').split('/').map(encodeURIComponent).join('/');
    }

    function normalizeMusicLyricToken(value) {
        return String(value || '')
            .normalize('NFKC')
            .replace(/[’'＇]/g, "'")
            .replace(/[“”]/g, '"')
            .replace(/[（]/g, '(')
            .replace(/[）]/g, ')')
            .replace(/[《〈]/g, '<')
            .replace(/[》〉]/g, '>')
            .replace(/[！]/g, '!')
            .replace(/[？]/g, '?')
            .replace(/[：]/g, ':')
            .replace(/[·•・]/g, '·')
            .replace(/協/g, '协')
            .replace(/荊/g, '荆')
            .replace(/[<>]/g, '')
            .replace(/[‐‑‒–—―-]/g, '')
            .replace(/\s+/g, '')
            .toLowerCase();
    }

    function isRemovableMusicTitleParenthetical(content) {
        const text = String(content || '').trim();
        if (!text || text.includes('重填词')) return false;
        if (/^(?:SNH48(?:\s+GROUP)?|BEJ48|GNZ48|SHY48|CKG48|CGT48|TSH48|IDOLS\s*FT)$/i.test(text)) return true;
        if (/^team\s*[a-z0-9]+$/i.test(text)) return true;

        const parts = text.split(/[\s,，、/＋+&]+/).filter(Boolean);
        if (!parts.length) return false;
        return parts.every((part) => /^(?:SII|NII|HII|NIII|XII|X|B|E|J|G|Z|K|C|GII|FT)$/i.test(part));
    }

    function stripMusicLyricParenthetical(value, options = {}) {
        const preserveEnglish = options.preserveEnglish === true;
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s*[\(（]([^\(\)（）]*)[\)）]\s*/g, (match, content) => {
                const text = String(content || '');
                return !isRemovableMusicTitleParenthetical(text) && (text.includes('重填词') || (preserveEnglish && /[A-Za-z]/.test(text))) ? match : ' ';
            })
            .replace(/\s*[–—-]\s*(?:[A-Z]+队|TEAM\s*[A-Z0-9]+|SNH48(?:\s+GROUP)?|BEJ48|GNZ48|SHY48|CKG48|CGT48|TSH48|IDOLS\s*FT)\s*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function stripMusicDisplayCredits(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s*[\(（]([^\(\)（）]*)[\)）]\s*/g, (match, content) => (
                isRemovableMusicTitleParenthetical(content) ? ' ' : match
            ))
            .replace(/\s*[–—-]\s*(?:[A-Z]+队|TEAM\s*[A-Z0-9]+|SNH48(?:\s+GROUP)?|BEJ48|GNZ48|SHY48|CKG48|CGT48|TSH48|IDOLS\s*FT)\s*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getOfficialSiteTrackDisplayTitle(track) {
        if (!track) return '';
        const title = stripMusicDisplayCredits(track.title) || track.title || '未命名歌曲';
        return title
            .replace(/\bremenber\b/ig, 'Remember')
            .replace(/夏日協奏曲/g, '夏日协奏曲')
            .replace(/荊/g, '荆')
            .replace(/_\d{1,3}$/u, '')
            .trim();
    }

    function getOfficialSiteAlbumDisplayName(album) {
        return String(album || '')
            .replace(/\s*【蓝版】\s*/g, '')
            .replace(/\s+B版\s*$/i, '')
            .trim();
    }

    function getOfficialSiteAlbumDate(track) {
        const raw = String(track?.albumDate || '').trim();
        if (!raw) return '';
        const matched = raw.match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?$/u);
        if (!matched) return raw;
        const year = matched[1];
        const month = matched[2].padStart(2, '0');
        const day = matched[3] ? `-${matched[3].padStart(2, '0')}` : '';
        return `${year}-${month}${day}`;
    }

    function getOfficialSiteAlbumDateSortValue(track) {
        const normalized = getOfficialSiteAlbumDate(track);
        const matched = normalized.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/u);
        if (!matched) return 0;
        return Number(`${matched[1]}${matched[2] || '00'}${matched[3] || '00'}`) || 0;
    }

    function getOfficialSiteAlbumGrouping(track) {
        return String(track?.grouping || '').trim() || '未分类';
    }

    function getOfficialSiteAlbumGroupingDisplayLabel(grouping) {
        const value = String(grouping || '').trim() || '未分类';
        return MUSIC_ALBUM_GROUPING_LABELS.get(value) || value;
    }

    function getOfficialSiteAlbumKey(track) {
        const album = getOfficialSiteAlbumDisplayName(track?.album)
            || getOfficialSiteTrackDisplayTitle(track)
            || '未收录专辑';
        return `${String(track?.groupKey || 'OTHER')}::${album}`;
    }

    function buildOfficialSiteMusicAlbums(tracks) {
        const albumsByKey = new Map();
        tracks.forEach((track) => {
            const key = getOfficialSiteAlbumKey(track);
            let album = albumsByKey.get(key);
            if (!album) {
                album = {
                    key,
                    title: getOfficialSiteAlbumDisplayName(track.album) || getOfficialSiteTrackDisplayTitle(track),
                    groupKey: track.groupKey,
                    groupLabel: track.groupLabel,
                    grouping: getOfficialSiteAlbumGrouping(track),
                    albumDate: getOfficialSiteAlbumDate(track),
                    coverUrl: track.coverUrl || '',
                    tracks: []
                };
                albumsByKey.set(key, album);
            }
            album.tracks.push(track);
            if (!album.coverUrl && track.coverUrl) album.coverUrl = track.coverUrl;
            if (!album.albumDate && getOfficialSiteAlbumDate(track)) album.albumDate = getOfficialSiteAlbumDate(track);
        });

        const groupingOrder = new Map(MUSIC_ALBUM_GROUPING_ORDER.map((grouping, index) => [grouping, index]));
        const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
        const albums = [...albumsByKey.values()];
        albums.forEach((album) => album.tracks.sort(compareOfficialSiteMusicTrackOrder));
        albums.sort((a, b) => {
            const groupingResult = (groupingOrder.get(a.grouping) ?? 999) - (groupingOrder.get(b.grouping) ?? 999);
            if (groupingResult) return groupingResult;
            const aDate = getOfficialSiteAlbumDateSortValue({ albumDate: a.albumDate });
            const bDate = getOfficialSiteAlbumDateSortValue({ albumDate: b.albumDate });
            if (aDate !== bDate) {
                if (!aDate) return 1;
                if (!bDate) return -1;
                return aDate - bDate;
            }
            const groupResult = (GROUP_SORT_ORDER.get(a.groupKey) ?? 999) - (GROUP_SORT_ORDER.get(b.groupKey) ?? 999);
            if (groupResult) return groupResult;
            return collator.compare(a.title, b.title);
        });
        return albums;
    }

    function updateOfficialSiteMusicViewToggleButton() {
        const button = $('official-site-music-view-toggle');
        if (!button) return;
        const isAlbumView = state.viewMode === 'album';
        button.classList.remove('is-active');
        button.setAttribute('aria-pressed', String(isAlbumView));
        button.title = isAlbumView ? '切换到歌曲列表' : '切换到专辑视图';
        button.setAttribute('aria-label', button.title);
        button.innerHTML = isAlbumView
            ? `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.2"></rect><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"></rect><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"></rect><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"></rect></svg>`
            : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"></path><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle></svg>`;
    }

    function updateOfficialSiteAlbumGroupingFilter() {
        const filter = $('official-site-music-grouping-filter');
        const label = $('official-site-music-grouping-label');
        const menu = $('official-site-music-grouping-menu');
        if (!filter || !label || !menu) return;
        const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
        const groupingOrder = new Map(MUSIC_ALBUM_GROUPING_ORDER.map((grouping, index) => [grouping, index]));
        const unknownOrder = Math.max(0, MUSIC_ALBUM_GROUPING_ORDER.indexOf('未分类') - 0.5);
        const groupings = [...new Set(state.allTracks.map(getOfficialSiteAlbumGrouping).filter(Boolean))]
            .sort((a, b) => {
                const aOrder = groupingOrder.has(a) ? groupingOrder.get(a) : unknownOrder;
                const bOrder = groupingOrder.has(b) ? groupingOrder.get(b) : unknownOrder;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return collator.compare(a, b);
            });
        if (state.albumGroupingFilter !== 'ALL' && !groupings.includes(state.albumGroupingFilter)) {
            state.albumGroupingFilter = 'ALL';
        }
        const options = [
            { value: 'ALL', label: '全部' },
            ...groupings.map((grouping) => ({ value: grouping, label: getOfficialSiteAlbumGroupingDisplayLabel(grouping) }))
        ];
        const current = options.find((option) => option.value === state.albumGroupingFilter) || options[0];
        filter.dataset.value = current.value;
        label.textContent = current.label;
        const menuHtml = options.map((option) => `
            <button type="button" class="official-site-music-grouping-option${option.value === current.value ? ' is-selected' : ''}"
                role="option" aria-selected="${option.value === current.value ? 'true' : 'false'}"
                data-grouping-value="${escapeHtml(option.value)}"
                onclick="setOfficialSiteMusicAlbumGroupingFilter(this.dataset.groupingValue)">
                <span>${escapeHtml(option.label)}</span>
            </button>
        `).join('');
        if (menu.innerHTML !== menuHtml) menu.innerHTML = menuHtml;
    }

    function closeOfficialSiteMusicAlbumGroupingMenu() {
        const filter = $('official-site-music-grouping-filter');
        const trigger = $('official-site-music-grouping-trigger');
        const menu = $('official-site-music-grouping-menu');
        if (!filter || !trigger || !menu) return;
        filter.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
    }

    function toggleOfficialSiteMusicAlbumGroupingMenu(event) {
        event?.stopPropagation?.();
        const filter = $('official-site-music-grouping-filter');
        const trigger = $('official-site-music-grouping-trigger');
        const menu = $('official-site-music-grouping-menu');
        if (!filter || !trigger || !menu) return;
        const shouldOpen = menu.hidden;
        filter.classList.toggle('is-open', shouldOpen);
        trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        menu.hidden = !shouldOpen;
        if (shouldOpen) menu.querySelector('.is-selected')?.focus({ preventScroll: true });
    }

    function getWebApiUrl(path) {
        if (typeof window.yayaWebApiUrl === 'function') {
            return window.yayaWebApiUrl(path);
        }
        return path;
    }

    function getR2MusicPublicUrl(path) {
        const text = String(path || '').trim();
        if (!text) return '';
        if (/^https?:\/\//i.test(text)) return text;
        if (/^\/?r2-music\//i.test(text)) {
            return `${R2_MUSIC_OBJECT_ORIGIN}/${text.replace(/^\/?r2-music\//i, '')}`;
        }
        if (typeof window.yayaWebApiUrl === 'function') return window.yayaWebApiUrl(text);
        return `${activeR2MusicPublicOrigin}${text.startsWith('/') ? text : `/${text}`}`;
    }

    function normalizeR2MusicTrack(item, index) {
        if (!item || !item.mp3 || !item.title) return null;
        const groupLabel = String(item.groupLabel || '').trim() || '公演';
        const groupKey = String(item.groupKey || groupLabel.replace(/48$/i, '') || '').trim().toUpperCase();
        const coverUrl = String(item.coverUrl || '').trim();
        return {
            id: String(item.id || `R2-${item.key || index}`),
            title: String(item.title || '').trim(),
            groupKey,
            groupLabel,
            artist: String(item.artist || item.albumArtist || item.album || groupLabel || '').trim(),
            albumArtist: String(item.albumArtist || '').trim(),
            album: String(item.album || '').trim(),
            grouping: String(item.grouping || '').trim(),
            albumDate: String(item.albumDate || '').trim(),
            genre: String(item.genre || '').trim(),
            trackNumber: Number(item.trackNumber) > 0 ? Number(item.trackNumber) : 0,
            discNumber: Number(item.discNumber) > 0 ? Number(item.discNumber) : 1,
            coverUrl: coverUrl ? getR2MusicPublicUrl(coverUrl) : '',
            duration: String(item.duration || '').trim(),
            sourceIndex: Number.isFinite(Number(item.sourceIndex)) ? Number(item.sourceIndex) : 100000 + index,
            source: 'r2-performance',
            audioGroupKey: String(item.key || item.id || index),
            lrcPath: '',
            mp3: getR2MusicPublicUrl(item.mp3)
        };
    }

    async function fetchR2PerformanceMusicTracks(url) {
        const separator = String(url || '').includes('?') ? '&' : '?';
        const requestUrl = `${url}${separator}metadata_v=5`;
        const response = await fetch(requestUrl);
        if (!response.ok) throw new Error(`R2 music list failed: ${response.status}`);
        const data = await response.json();
        const tracks = Array.isArray(data.tracks) ? data.tracks : [];
        return tracks.map(normalizeR2MusicTrack).filter(Boolean);
    }

    async function loadR2PerformanceMusicTracks() {
        const origins = typeof window.yayaWebApiUrl === 'function'
            ? ['']
            : [...new Set([R2_MUSIC_PUBLIC_ORIGIN, R2_MUSIC_API_FALLBACK_ORIGIN])];
        const errors = [];

        for (const origin of origins) {
            activeR2MusicPublicOrigin = origin || R2_MUSIC_PUBLIC_ORIGIN;
            const apiUrl = origin ? `${origin}/api/r2-music` : getR2MusicPublicUrl('/api/r2-music');
            try {
                const tracks = await fetchR2PerformanceMusicTracks(apiUrl);
                saveR2MusicTracksCache(tracks);
                return tracks;
            } catch (error) {
                errors.push(`${apiUrl} ${error.message || 'failed'}`);
            }
        }

        const cache = readR2MusicTracksCache();
        if (cache.tracks.length) {
            console.warn('[official-site-music] R2 performance music using cached list', errors.join('; '));
            return cache.tracks;
        }

        throw new Error(`R2 music list failed: ${errors.join('; ') || 'unknown error'}`);
    }

    function getOfficialSiteMusicPinyinParts(value) {
        const raw = String(value || '').trim().toLowerCase();
        const fallback = { text: raw, full: raw.replace(/\s+/g, ''), initials: raw.replace(/\s+/g, '') };
        const pinyinTool = hasOfficialSiteMusicPinyinTool() ? window.pinyinPro.pinyin : null;
        if (!raw || typeof pinyinTool !== 'function') return fallback;

        try {
            const pinyinArray = pinyinTool(raw, {
                toneType: 'none',
                type: 'array'
            }).map((item) => String(item || '').toLowerCase());
            return {
                text: raw,
                full: pinyinArray.join(''),
                initials: pinyinArray.map((item) => item.charAt(0)).join('')
            };
        } catch (_) {
            return fallback;
        }
    }

    function getOfficialSiteMusicSearchPayload(keyword) {
        const raw = String(keyword || '').trim().toLowerCase();
        const compact = raw.replace(/\s+/g, '');
        const pinyin = getOfficialSiteMusicPinyinParts(raw);
        return {
            raw,
            compact,
            full: pinyin.full || compact,
            initials: pinyin.initials || compact
        };
    }

    function getOfficialSiteMusicTrackSearchCache(track) {
        if (!track) return { text: '', full: '', initials: '' };
        const pinyinReady = hasOfficialSiteMusicPinyinTool();
        if (track._searchCache && track._searchCache.pinyinReady === pinyinReady) return track._searchCache;

        const fields = [
            track.title,
            getOfficialSiteTrackDisplayTitle(track),
            track.album,
            track.artist,
            track.grouping,
            track.albumDate,
            track.groupLabel,
            track.groupKey,
            track.mp3
        ].filter(Boolean);
        const text = fields.join(' ').toLowerCase();
        const compactText = text.replace(/\s+/g, '');
        const pinyinParts = fields.map(getOfficialSiteMusicPinyinParts);
        track._searchCache = {
            text,
            compactText,
            full: pinyinParts.map((item) => item.full).join(' '),
            compactFull: pinyinParts.map((item) => item.full).join(''),
            initials: pinyinParts.map((item) => item.initials).join(' '),
            compactInitials: pinyinParts.map((item) => item.initials).join(''),
            pinyinReady
        };
        return track._searchCache;
    }

    function matchesOfficialSiteMusicSearch(track, keyword) {
        const term = getOfficialSiteMusicSearchPayload(keyword);
        if (!term.raw) return true;
        const cache = getOfficialSiteMusicTrackSearchCache(track);
        if (cache.text.includes(term.raw) || cache.compactText.includes(term.compact)) return true;
        if (/[㐀-鿿]/.test(term.compact)) {
            return Boolean(
                term.full
                && term.full !== term.compact
                && (cache.full.includes(term.full) || cache.compactFull.includes(term.full))
            );
        }
        if (!/^[a-z0-9]+$/.test(term.compact)) return false;
        return cache.full.includes(term.full)
            || cache.compactFull.includes(term.full)
            || cache.initials.includes(term.compact)
            || cache.compactInitials.includes(term.compact)
            || cache.compactInitials.includes(term.initials);
    }

    function buildMusicLyricNameVariants(name) {
        const raw = String(name || '').trim();
        if (!raw) return [];
        const variants = new Set([raw]);
        const push = (value) => value && variants.add(value);
        const pushAliases = (value) => {
            const aliases = MUSIC_LYRIC_TITLE_ALIASES.get(String(value || '').trim());
            if (aliases) aliases.forEach(push);
        };

        push(raw.replace(/[！]/g, '!'));
        push(raw.replace(/!/g, '！'));
        push(raw.replace(/[（]/g, '(').replace(/[）]/g, ')'));
        push(raw.replace(/\(/g, '（').replace(/\)/g, '）'));
        push(raw.replace(/[《〈]/g, '<').replace(/[》〉]/g, '>'));
        push(raw.replace(/[<>]/g, ''));
        push(raw.replace(/[《》〈〉]/g, ''));
        push(raw.replace(/[·•・]/g, '·'));
        push(raw.replace(/[·•・]/g, ''));
        push(raw.replace(/\s+/g, ''));
        push(raw.replace(/[‐‑‒–—―-]+/g, ' '));
        push(raw.replace(/[‐‑‒–—―-]+/g, ''));
        push(raw.replace(/\s*[‐‑‒–—―-]\s*[A-Za-z]+(?:\s+[A-Za-z]+)*\s*$/g, ''));
        push(raw.replace(/\s*[\(（][^\(\)（）]*重填词[^\(\)（）]*[\)）]\s*/g, ' '));
        push(raw.replace(/\bremenber\b/ig, 'Remember'));
        pushAliases(raw);
        [...raw.matchAll(/[\(（]([^\(\)（）]*[\u3400-\u9fff][^\(\)（）]*)[\)）]/g)].forEach((match) => {
            push(match[1].trim());
        });

        [...variants].forEach((value) => {
            pushAliases(value);
            const stripped = stripMusicLyricParenthetical(value);
            if (stripped && stripped !== value) {
                push(stripped);
                push(stripped.replace(/\s+/g, ''));
                push(stripped.replace(/[！]/g, '!'));
                push(stripped.replace(/!/g, '！'));
                pushAliases(stripped);
            }
        });

        return [...variants];
    }

    function getMusicLyricTitleTokens(title) {
        return new Set(buildMusicLyricNameVariants(title).map(normalizeMusicLyricToken).filter(Boolean));
    }

    function musicLyricTitleMatches(metaTitle, indexedTitle) {
        const metaTokens = getMusicLyricTitleTokens(metaTitle);
        if (!metaTokens.size) return false;
        return [...getMusicLyricTitleTokens(indexedTitle)].some((token) => metaTokens.has(token));
    }

    function getMusicGroupCandidates(meta = {}) {
        const rawValues = [
            meta.分团,
            meta.groupName,
            meta.group,
            meta.subTitle,
            meta.joinMemberNames
        ];
        const candidates = new Set();
        rawValues.forEach((value) => {
            const text = String(value || '').trim();
            if (!text) return;
            const matched = text.match(/\b(SNH48|BEJ48|GNZ48|SHY48|CKG48|CGT48|AKB48|TSH48|TPE48)\b/i);
            if (matched) {
                candidates.add(matched[1].toUpperCase());
            }
        });
        return [...candidates];
    }

    function buildMusicLyricIndexedPaths(meta, index) {
        if (!meta || !Array.isArray(index)) return [];
        const titleTokens = getMusicLyricTitleTokens(meta.歌曲名);
        if (!titleTokens.size) return [];

        const groupCandidates = new Set(getMusicGroupCandidates(meta));
        const normalizedAlbum = normalizeMusicLyricToken(meta.专辑);
        const normalizedType = normalizeMusicLyricToken(meta.类型);
        const normalizedSeq = normalizeMusicLyricToken(meta.专辑序号);

        const scored = index
            .filter((item) => item && item.songTitle && (item.path === meta.lrcPath || musicLyricTitleMatches(meta.歌曲名, item.songTitle)))
            .map((item) => {
                const folder = String(item.folder || '');
                const normalizedFolder = normalizeMusicLyricToken(folder);
                let score = 0;

                if (meta.lrcPath && item.path === meta.lrcPath) score += 1000;
                if (groupCandidates.size && groupCandidates.has(String(item.group || '').toUpperCase())) score += 400;
                if (normalizedAlbum && normalizedFolder.includes(normalizedAlbum)) score += 220;
                if (normalizedType && normalizedFolder.startsWith(normalizedType)) score += 80;
                if (normalizedSeq && normalizedFolder.includes(normalizedSeq)) score += 40;
                if (normalizeMusicLyricToken(item.file).includes(normalizeMusicLyricToken(`${item.group}-${meta.歌曲名}`))) score += 20;

                return { path: item.path, score };
            })
            .sort((a, b) => b.score - a.score);

        return [...new Set(scored.map((item) => item.path))];
    }

    function buildDirectMusicLyricPaths(meta = {}) {
        const group = getMusicGroupCandidates(meta)[0];
        if (!group || !meta.歌曲名) return [];
        return buildMusicLyricNameVariants(meta.歌曲名)
            .map((title) => title && `${group}/${group} - ${title}.lrc`)
            .filter(Boolean);
    }

    function getNextPlayMode(mode) {
        const index = PLAYER_MODE_ORDER.indexOf(mode);
        return PLAYER_MODE_ORDER[(index + 1) % PLAYER_MODE_ORDER.length] || 'sequence';
    }

    function getPlayerModeIconSvg(mode) {
        if (mode === 'loop-one') {
            return `
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M17 17H7a4 4 0 0 1-4-4" />
                    <path d="M7 7h10a4 4 0 0 1 4 4" />
                    <path d="M18 4l3 3-3 3" />
                    <path d="M6 20l-3-3 3-3" />
                    <path d="M12 10v5" />
                    <path d="M10.5 11.5L12 10l1.5 1.5" />
                </svg>
            `;
        }
        if (mode === 'shuffle') {
            return `
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h3a4 4 0 0 1 3 1.5l4 5A4 4 0 0 0 17 15h3" />
                    <path d="M17 12l3 3-3 3" />
                    <path d="M4 17h3a4 4 0 0 0 3-1.5l1-1.25" />
                    <path d="M14 8.5A4 4 0 0 1 17 7h3" />
                    <path d="M17 4l3 3-3 3" />
                </svg>
            `;
        }
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h14" />
                <path d="M15 4l3 3-3 3" />
                <path d="M20 17H6" />
                <path d="M9 14l-3 3 3 3" />
            </svg>
        `;
    }

    function getOfficialSiteVolumeIconSvg(level) {
        const waves = level === 'high'
            ? '<path d="M15 8.5a4.5 4.5 0 0 1 0 7" /><path d="M18 6a8 8 0 0 1 0 12" />'
            : level === 'low'
                ? '<path d="M15 9.5a3.5 3.5 0 0 1 0 5" />'
                : '<path d="M15.5 9l5 5" /><path d="M20.5 9l-5 5" />';
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 10v4h4l5 4V6L8 10H4z" />
                ${waves}
            </svg>
        `;
    }

    function requestOfficialTextWithNode(url, redirectCount = 0) {
        return new Promise((resolve, reject) => {
            const httpsModule = window.desktop && window.desktop.https;
            if (!httpsModule) {
                reject(new Error('缺少本地网络模块'));
                return;
            }

            const request = httpsModule.get(url, (response) => {
                const statusCode = response.statusCode || 0;
                const nextUrl = response.headers && response.headers.location;
                if (statusCode >= 300 && statusCode < 400 && nextUrl && redirectCount < 4) {
                    response.resume();
                    const redirectedUrl = new URL(nextUrl, url).toString();
                    requestOfficialTextWithNode(redirectedUrl, redirectCount + 1).then(resolve, reject);
                    return;
                }

                if (statusCode < 200 || statusCode >= 300) {
                    response.resume();
                    reject(new Error(`官网返回 ${statusCode}`));
                    return;
                }

                response.setEncoding('utf8');
                let text = '';
                response.on('data', (chunk) => {
                    text += chunk;
                });
                response.on('end', () => resolve(text));
            });

            request.setTimeout(12000, () => {
                request.destroy(new Error('官网请求超时'));
            });
            request.on('error', reject);
        });
    }

    async function fetchOfficialScriptText(url) {
        const freshUrl = `${url}${url.includes('?') ? '&' : '?'}adv=${Date.now()}`;
        if (typeof fetch === 'function') {
            try {
                const response = await fetch(freshUrl, { cache: 'no-store' });
                if (response.ok) {
                    return response.text();
                }
            } catch (error) {
                console.warn('[official-site-music] browser fetch failed, fallback to node https', error);
            }
        }
        return requestOfficialTextWithNode(freshUrl);
    }

    function extractAssignedValue(scriptText, variableName) {
        const assignmentIndex = scriptText.indexOf(variableName);
        if (assignmentIndex < 0) {
            throw new Error(`未找到 ${variableName}`);
        }

        const objectStart = scriptText.indexOf('{', assignmentIndex);
        const arrayStart = scriptText.indexOf('[', assignmentIndex);
        const valueStart = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)
            ? arrayStart
            : objectStart;
        if (valueStart < 0) {
            throw new Error(`${variableName} 格式异常`);
        }

        const stack = [];
        let inString = false;
        let escaped = false;

        for (let index = valueStart; index < scriptText.length; index += 1) {
            const char = scriptText[index];

            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (char === '\\') {
                    escaped = true;
                } else if (char === '"') {
                    inString = false;
                }
                continue;
            }

            if (char === '"') {
                inString = true;
            } else if (char === '[' || char === '{') {
                stack.push(char);
            } else if (char === ']' || char === '}') {
                stack.pop();
                if (stack.length === 0) {
                    return JSON.parse(scriptText.slice(valueStart, index + 1));
                }
            }
        }

        throw new Error(`${variableName} 没有完整结束`);
    }

    function normalizeAlbumName(name) {
        return String(name || '').toLowerCase().replace(/\s+/g, '');
    }

    function collectRecordItems(value, result = []) {
        if (Array.isArray(value)) {
            value.forEach((item) => collectRecordItems(item, result));
        } else if (value && typeof value === 'object') {
            if (value.title && value.image) {
                result.push(value);
            }
            Object.keys(value).forEach((key) => {
                if (key !== 'title' && key !== 'image') {
                    collectRecordItems(value[key], result);
                }
            });
        }
        return result;
    }

    function collectSongItems(value, result = []) {
        if (Array.isArray(value)) {
            value.forEach((item) => collectSongItems(item, result));
        } else if (value && typeof value === 'object') {
            if (value.url || value.songs_name) {
                result.push(value);
            }
            Object.keys(value).forEach((key) => {
                if (key !== 'url' && key !== 'songs_name') {
                    collectSongItems(value[key], result);
                }
            });
        }
        return result;
    }

    function buildRecordMap(recordsData) {
        const recordMap = new Map();
        const records = [];
        collectRecordItems(recordsData).forEach((record) => {
            const title = String(record.title || '').trim();
            if (!title) return;
            const recordInfo = {
                title,
                image: normalizeOfficialAssetUrl(record.image),
                url: normalizeOfficialAssetUrl(record.url)
            };
            records.push(recordInfo);
            recordMap.set(title, recordInfo);
            recordMap.set(normalizeAlbumName(title), recordInfo);
        });
        recordMap.set('__records', records);
        return recordMap;
    }

    function getAudioGroupKey(url, groupKey = '') {
        const fileName = String(url || '').split('/').pop() || '';
        const baseName = fileName.replace(/\.mp3$/i, '');
        const numericGroup = baseName.replace(/_?\d+$/i, '');
        if (numericGroup !== baseName) return numericGroup || baseName;
        if (groupKey === 'BEJ' && baseName.includes('_')) {
            return baseName.split('_')[0] || baseName;
        }
        return baseName || fileName;
    }

    function buildAudioGroups(list, groupKey = '') {
        const groups = new Map();
        let currentGroup = null;
        (Array.isArray(list) ? list : []).forEach((item) => {
            const audioGroupKey = getAudioGroupKey(item && item.mp3, groupKey);
            if (!currentGroup || currentGroup.groupKey !== audioGroupKey) {
                currentGroup = {
                    groupKey: audioGroupKey,
                    title: (item && item.title) || '',
                    count: 0
                };
                groups.set(audioGroupKey, currentGroup);
            }
            currentGroup.count += 1;
        });
        return groups;
    }

    function findRecordForAlbum(recordsMap, album) {
        if (!album) return null;
        const normalizedAlbum = normalizeAlbumName(album);
        const exact = recordsMap.get(album) || recordsMap.get(normalizedAlbum);
        if (exact) return exact;

        const records = recordsMap.get('__records') || [];
        return records.find((record) => {
            const normalizedTitle = normalizeAlbumName(record.title);
            return normalizedTitle && (
                normalizedAlbum.includes(normalizedTitle) ||
                normalizedTitle.includes(normalizedAlbum)
            );
        }) || null;
    }

    function buildSongRecordMap(songsData) {
        const songRecordMap = new Map();
        collectSongItems(songsData).forEach((song) => {
            const recordName = String(song.record_name || '').trim();
            if (!recordName && !song.songs_time) return;
            const meta = {
                recordName,
                duration: String(song.songs_time || '').trim()
            };
            const url = normalizeLookupUrl(song.url);
            const songName = normalizeAlbumName(song.songs_name);
            if (url) songRecordMap.set(url, meta);
            if (songName) songRecordMap.set(`title:${songName}`, meta);
        });
        return songRecordMap;
    }

    async function loadOfficialPayload(group) {
        const scriptText = await fetchOfficialScriptText(`${OFFICIAL_SITE_SCRIPT_BASE}/${group.script}`);
        const list = extractAssignedValue(scriptText, group.listVar);
        let recordsMap = new Map();
        let songRecordMap = new Map();
        try {
            recordsMap = buildRecordMap(extractAssignedValue(scriptText, group.recordsVar));
        } catch (error) {
            console.warn(`[official-site-music] ${group.recordsVar} parse skipped`, error);
        }
        try {
            songRecordMap = buildSongRecordMap(extractAssignedValue(scriptText, group.songsVar));
        } catch (error) {
            console.warn(`[official-site-music] ${group.songsVar} parse skipped`, error);
        }
        return { list, recordsMap, songRecordMap };
    }

    function buildTracks(group, list, recordsMap = new Map(), songRecordMap = new Map()) {
        const sourceList = [];
        const seenSourceKeys = new Set();
        (Array.isArray(list) ? list : []).forEach((item) => {
            const mp3 = normalizeLookupUrl(item && item.mp3);
            const title = String((item && item.title) || '').trim();
            const artist = String((item && item.artist) || '').trim();
            const sourceKey = `${mp3}|${title}|${artist}`;
            if (!mp3 || seenSourceKeys.has(sourceKey)) return;
            seenSourceKeys.add(sourceKey);
            sourceList.push(item);
        });

        const albumCounts = new Map();
        sourceList.forEach((item) => {
            const album = String((item && item.artist) || '').trim();
            if (album) albumCounts.set(album, (albumCounts.get(album) || 0) + 1);
        });
        const hasUsefulAlbumData = albumCounts.size > 1 || sourceList.length <= 10;
        const audioGroups = buildAudioGroups(sourceList, group.key);

        return sourceList
            .map((item, index) => {
                const mp3 = normalizeMusicUrl(item && item.mp3);
                if (!mp3) return null;
                const audioGroupKey = getAudioGroupKey(item && item.mp3, group.key);
                const audioGroup = audioGroups.get(audioGroupKey);
                const exactSongMeta = songRecordMap.get(normalizeLookupUrl(mp3))
                    || songRecordMap.get(`title:${normalizeAlbumName(item && item.title)}`)
                    || null;
                const exactRecordName = (exactSongMeta && exactSongMeta.recordName)
                    || (group.key === 'GNZ' ? GNZ_ALBUM_BY_TITLE.get((item && item.title) || '') : '')
                    || (group.key === 'SNH' ? SNH_ALBUM_BY_AUDIO_GROUP.get(audioGroupKey) : '')
                    || '';
                const titleRecord = findRecordForAlbum(recordsMap, item && item.title);
                let album = '';
                let record = null;
                if (exactRecordName) {
                    album = exactRecordName;
                    record = findRecordForAlbum(recordsMap, exactRecordName) || titleRecord;
                } else if (hasUsefulAlbumData) {
                    album = (item && item.artist) || '';
                    record = findRecordForAlbum(recordsMap, album) || titleRecord;
                } else if (group.key === 'GNZ' && titleRecord) {
                    album = titleRecord.title;
                    record = titleRecord;
                } else {
                    const inferredAlbum = (audioGroup && audioGroup.title) || '';
                    const inferredRecord = findRecordForAlbum(recordsMap, inferredAlbum) || titleRecord;
                    if (inferredRecord) {
                        album = inferredAlbum;
                        record = inferredRecord;
                    }
                }
                if (record && record.title) {
                    album = record.title;
                }
                return {
                    id: `${group.key}-${index}`,
                    sourceIndex: index + 1,
                    groupKey: group.key,
                    audioGroupKey,
                    groupLabel: group.label,
                    title: (item && item.title) || '未命名歌曲',
                    artist: album || group.label,
                    album,
                    coverUrl: record && record.image ? record.image : '',
                    recordUrl: record && record.url ? record.url : '',
                    duration: (exactSongMeta && exactSongMeta.duration) || '',
                    lrcPath: group.key === 'SNH'
                        ? SNH_LYRIC_PATH_BY_AUDIO_GROUP_AND_TITLE.get(`${audioGroupKey}:${normalizeMusicLyricToken((item && item.title) || '')}`) || ''
                        : '',
                    mp3
                };
            })
            .filter(Boolean);
    }

    function compareOfficialSiteMusicTrackOrder(a, b) {
        const discResult = (Number(a.discNumber) || 1) - (Number(b.discNumber) || 1);
        if (discResult) return discResult;
        const aTrackNumber = Number(a.trackNumber) || 0;
        const bTrackNumber = Number(b.trackNumber) || 0;
        if (aTrackNumber && bTrackNumber && aTrackNumber !== bTrackNumber) return aTrackNumber - bTrackNumber;
        if (aTrackNumber && !bTrackNumber) return -1;
        if (!aTrackNumber && bTrackNumber) return 1;
        return (Number(a.sourceIndex) || 0) - (Number(b.sourceIndex) || 0);
    }

    function getFilteredTracks() {
        const term = state.searchTerm.trim();
        const filtered = state.allTracks.filter((track) => {
            if (state.favoritesOnly && !isOfficialSiteTrackFavorite(track)) return false;
            if (!state.favoritesOnly && state.groupFilter !== 'ALL' && track.groupKey !== state.groupFilter) return false;
            if (state.albumGroupingFilter !== 'ALL' && getOfficialSiteAlbumGrouping(track) !== state.albumGroupingFilter) return false;
            return matchesOfficialSiteMusicSearch(track, term);
        });
        const direction = state.sortDirection === 'desc' ? -1 : 1;
        const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
        return filtered.sort((a, b) => {
            let result = 0;
            const sameAlbum = Boolean(a.album)
                && a.groupKey === b.groupKey
                && a.album === b.album;
            if (state.sortKey !== 'title' && state.sortKey !== 'duration' && sameAlbum) {
                return compareOfficialSiteMusicTrackOrder(a, b);
            }
            if (state.sortKey === 'source') {
                result = ((GROUP_SORT_ORDER.get(a.groupKey) ?? 999) - (GROUP_SORT_ORDER.get(b.groupKey) ?? 999))
                    || collator.compare(a.groupKey, b.groupKey)
                    || collator.compare(a.album || '', b.album || '')
                    || compareOfficialSiteMusicTrackOrder(a, b);
            } else if (state.sortKey === 'title') {
                result = collator.compare(a.title || '', b.title || '');
            } else if (state.sortKey === 'group') {
                result = collator.compare(a.groupLabel || '', b.groupLabel || '')
                    || collator.compare(a.album || '', b.album || '')
                    || compareOfficialSiteMusicTrackOrder(a, b);
            } else if (state.sortKey === 'album') {
                result = collator.compare(a.album || '', b.album || '')
                    || collator.compare(a.groupLabel || '', b.groupLabel || '')
                    || compareOfficialSiteMusicTrackOrder(a, b);
            } else if (state.sortKey === 'date') {
                const aDate = getOfficialSiteAlbumDateSortValue(a);
                const bDate = getOfficialSiteAlbumDateSortValue(b);
                if (!aDate && bDate) return 1;
                if (aDate && !bDate) return -1;
                result = aDate - bDate
                    || collator.compare(a.album || '', b.album || '')
                    || collator.compare(a.groupLabel || '', b.groupLabel || '')
                    || compareOfficialSiteMusicTrackOrder(a, b);
            } else if (state.sortKey === 'grouping') {
                result = collator.compare(getOfficialSiteAlbumGrouping(a), getOfficialSiteAlbumGrouping(b))
                    || collator.compare(a.album || '', b.album || '')
                    || collator.compare(a.groupLabel || '', b.groupLabel || '')
                    || compareOfficialSiteMusicTrackOrder(a, b);
            } else if (state.sortKey === 'duration') {
                result = parseTrackDuration(a.duration) - parseTrackDuration(b.duration);
            }
            return result * direction;
        });
    }

    function updateFilterButtons() {
        document.querySelectorAll('[data-group-filter]').forEach((button) => {
            button.classList.toggle('is-active', !state.favoritesOnly && button.dataset.groupFilter === state.groupFilter);
        });
        document.querySelectorAll('[data-favorites-filter]').forEach((button) => {
            button.classList.toggle('is-active', state.favoritesOnly);
        });
        updateOfficialSiteAlbumGroupingFilter();
        updateOfficialSiteMusicViewToggleButton();
    }

    function updateFavoriteButton() {
        const button = $('official-site-music-favorite-btn');
        if (!button) return;
        const track = getCurrentOfficialSiteTrack();
        const isFavorite = isOfficialSiteTrackFavorite(track);
        button.classList.toggle('active', isFavorite);
        button.classList.toggle('is-favorite', isFavorite);
        button.title = isFavorite ? '取消收藏当前歌曲' : '收藏当前歌曲';
        button.setAttribute('aria-label', button.title);
    }

    function updateFavoriteUi() {
        updateFilterButtons();
        updateFavoriteButton();
    }

    function updatePlayerButton() {
        const audio = $('official-site-music-audio');
        const button = $('official-site-music-play-btn');
        const cover = $('official-site-music-cover');
        if (!audio) return;

        const isPlaying = !audio.paused;
        if (button) {
            button.classList.toggle('is-play', !isPlaying);
            button.classList.toggle('is-pause', isPlaying);
            button.title = isPlaying ? '暂停' : '播放';
            button.setAttribute('aria-label', isPlaying ? '暂停' : '播放');
        }
        if (cover) {
            cover.classList.toggle('vinyl-pause', !isPlaying);
        }
        updateOfficialSiteMediaSessionPlaybackState();
    }

    function supportsOfficialSiteMediaSession() {
        return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
    }

    function getOfficialSiteMediaArtwork(track) {
        const artworkUrl = track && track.coverUrl ? String(track.coverUrl).trim() : '';
        if (!artworkUrl) return [];
        return [
            { src: artworkUrl, sizes: '96x96' },
            { src: artworkUrl, sizes: '128x128' },
            { src: artworkUrl, sizes: '192x192' },
            { src: artworkUrl, sizes: '256x256' },
            { src: artworkUrl, sizes: '512x512' }
        ];
    }

    function updateOfficialSiteMediaSessionMetadata(track = getCurrentOfficialSiteTrack()) {
        if (!supportsOfficialSiteMediaSession()) return;
        if (!track) {
            try {
                navigator.mediaSession.metadata = null;
            } catch (_) { window.YayaRendererUtils.reportIgnoredError(_, 'src/renderer/official-site-music-feature.js'); }
            updateOfficialSiteMediaSessionPlaybackState();
            return;
        }

        const metadata = {
            title: getOfficialSiteTrackDisplayTitle(track) || track.title || '未命名歌曲',
            artist: track.artist || track.groupLabel || 'SNH48 Group',
            album: getOfficialSiteAlbumDisplayName(track.album) || track.groupLabel || '牙牙消息',
            artwork: getOfficialSiteMediaArtwork(track)
        };
        try {
            navigator.mediaSession.metadata = typeof MediaMetadata === 'function'
                ? new MediaMetadata(metadata)
                : metadata;
        } catch (_) {
            try {
                navigator.mediaSession.metadata = metadata;
            } catch (_) { window.YayaRendererUtils.reportIgnoredError(_, 'src/renderer/official-site-music-feature.js'); }
        }
        updateOfficialSiteMediaSessionPlaybackState();
        updateOfficialSiteMediaSessionPosition();
    }

    function updateOfficialSiteMediaSessionPlaybackState() {
        if (!supportsOfficialSiteMediaSession()) return;
        const audio = $('official-site-music-audio');
        try {
            navigator.mediaSession.playbackState = audio && !audio.paused && !audio.ended ? 'playing' : 'paused';
        } catch (_) { window.YayaRendererUtils.reportIgnoredError(_, 'src/renderer/official-site-music-feature.js'); }
    }

    function updateOfficialSiteMediaSessionPosition() {
        if (!supportsOfficialSiteMediaSession() || typeof navigator.mediaSession.setPositionState !== 'function') return;
        const audio = $('official-site-music-audio');
        if (!audio) return;
        const duration = Number(audio.duration);
        if (!Number.isFinite(duration) || duration <= 0) return;
        const position = Math.max(0, Math.min(duration, Number(audio.currentTime) || 0));
        const playbackRate = Number.isFinite(audio.playbackRate) && audio.playbackRate > 0 ? audio.playbackRate : 1;
        try {
            navigator.mediaSession.setPositionState({ duration, playbackRate, position });
        } catch (_) { window.YayaRendererUtils.reportIgnoredError(_, 'src/renderer/official-site-music-feature.js'); }
    }

    function setupOfficialSiteMediaSession() {
        if (!supportsOfficialSiteMediaSession() || state.mediaSessionBound) return;
        state.mediaSessionBound = true;
        const handlers = {
            play: () => {
                const audio = $('official-site-music-audio');
                if (!audio) return;
                const queueTracks = getOfficialSiteMusicQueueTracks();
                if (!state.currentTrackId && queueTracks.length) {
                    playOfficialSiteTrack(queueTracks[0].id);
                    return;
                }
                audio.play().catch(() => showOfficialMusicToast('请先选择一首曲目'));
            },
            pause: () => {
                $('official-site-music-audio')?.pause();
            },
            previoustrack: () => playOfficialSitePrevious(),
            nexttrack: () => playOfficialSiteNext()
        };
        Object.entries(handlers).forEach(([action, handler]) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch (_) { window.YayaRendererUtils.reportIgnoredError(_, 'src/renderer/official-site-music-feature.js'); }
        });
    }

    function syncOfficialSiteProgressAnchor() {
        const audio = $('official-site-music-audio');
        state.progressAnchorTime = audio ? (audio.currentTime || 0) : 0;
        state.progressAnchorStamp = performance.now();
    }

    function getOfficialSiteProgressDisplayTime() {
        const audio = $('official-site-music-audio');
        if (!audio) return 0;
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Infinity;
        if (audio.paused || audio.ended || state.progressAnchorStamp <= 0) {
            return Math.max(0, Math.min(duration, audio.currentTime || 0));
        }
        const elapsed = (performance.now() - state.progressAnchorStamp) / 1000;
        const rate = Number.isFinite(audio.playbackRate) && audio.playbackRate > 0 ? audio.playbackRate : 1;
        return Math.max(0, Math.min(duration, state.progressAnchorTime + elapsed * rate));
    }

    function updatePlayerProgress(syncLyrics = true, displayTime = null) {
        const audio = $('official-site-music-audio');
        const progress = $('official-site-music-progress');
        const current = $('official-site-music-time-current');
        const duration = $('official-site-music-time-duration');
        if (!audio) return;

        const audioDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const visualTime = displayTime === null ? audio.currentTime : displayTime;
        const percent = audioDuration > 0 ? (visualTime / audioDuration) * 100 : 0;
        if (progress && !progress.matches(':active')) {
            progress.max = audioDuration > 0 ? String(audioDuration) : '100';
            progress.value = String(visualTime);
        }
        if (progress) updateRangeFill(progress, percent);
        if (progress?.matches(':hover')) {
            updateOfficialSiteMusicProgressTooltip();
        }
        if (current) current.textContent = formatDuration(visualTime);
        if (duration) duration.textContent = formatDuration(audioDuration);
        if (syncLyrics) {
            syncOfficialSiteMusicLyrics(audio.currentTime);
        }
        updateOfficialSiteMediaSessionPosition();
    }

    function stopOfficialSiteProgressAnimation() {
        if (state.progressAnimationFrame !== null) {
            cancelAnimationFrame(state.progressAnimationFrame);
            state.progressAnimationFrame = null;
        }
    }

    function startOfficialSiteProgressAnimation() {
        const audio = $('official-site-music-audio');
        if (!audio || audio.paused || audio.ended) {
            stopOfficialSiteProgressAnimation();
            return;
        }

        stopOfficialSiteProgressAnimation();
        const tick = () => {
            updatePlayerProgress(false, getOfficialSiteProgressDisplayTime());
            if (!audio.paused && !audio.ended) {
                state.progressAnimationFrame = requestAnimationFrame(tick);
            } else {
                state.progressAnimationFrame = null;
            }
        };
        state.progressAnimationFrame = requestAnimationFrame(tick);
    }

    function updatePlayModeButton() {
        const button = $('official-site-music-play-mode-btn');
        if (!button) return;
        button.innerHTML = getPlayerModeIconSvg(state.playMode);
        button.title = `当前模式：${PLAYER_MODE_LABELS[state.playMode] || PLAYER_MODE_LABELS.sequence}`;
        button.classList.remove('active');
    }

    function updateVolumeUI() {
        const audio = $('official-site-music-audio');
        const volumeBar = $('official-site-music-volume-bar');
        const volumeIcon = $('official-site-music-volume-icon');
        if (!audio) return;
        if (volumeBar) {
            volumeBar.value = String(audio.volume);
            updateRangeFill(volumeBar, (audio.muted ? 0 : audio.volume) * 100);
        }
        if (volumeIcon) {
            if (audio.muted || audio.volume === 0) {
                volumeIcon.innerHTML = getOfficialSiteVolumeIconSvg('muted');
                volumeIcon.setAttribute('aria-label', '已静音');
            } else if (audio.volume < 0.5) {
                volumeIcon.innerHTML = getOfficialSiteVolumeIconSvg('low');
                volumeIcon.setAttribute('aria-label', '低音量');
            } else {
                volumeIcon.innerHTML = getOfficialSiteVolumeIconSvg('high');
                volumeIcon.setAttribute('aria-label', '音量');
            }
        }
    }

    function updateRangeFill(rangeEl, percent) {
        if (!rangeEl) return;
        const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
        if (rangeEl.id === 'official-site-music-progress') {
            const fill = $('official-site-music-progress-fill');
            if (fill) fill.style.setProperty('--progress-scale', String(safePercent / 100));
            return;
        }
        rangeEl.style.background = `linear-gradient(to right, var(--primary) 0%, var(--primary) ${safePercent}%, var(--slider-empty, rgba(0, 0, 0, 0.08)) ${safePercent}%, var(--slider-empty, rgba(0, 0, 0, 0.08)) 100%)`;
    }

    function updateOfficialSiteMusicProgressTooltip() {
        const audio = $('official-site-music-audio');
        const progress = $('official-site-music-progress');
        const tooltip = $('official-site-music-progress-tooltip');
        const player = $('official-site-music-player');
        if (!audio || !progress || !tooltip || !player || !Number.isFinite(audio.duration) || audio.duration <= 0) {
            if (tooltip) tooltip.classList.remove('is-visible');
            return;
        }

        const playerRect = player.getBoundingClientRect();
        const duration = audio.duration;
        const displayTime = getOfficialSiteProgressDisplayTime();
        const ratio = duration > 0 ? Math.max(0, Math.min(1, displayTime / duration)) : 0;
        const progressRect = progress.getBoundingClientRect();
        const pointX = progressRect.left - playerRect.left + (progressRect.width * ratio);
        const left = Math.max(34, Math.min(playerRect.width - 34, pointX));
        tooltip.textContent = `${formatDuration(displayTime)} / ${formatDuration(audio.duration)}`;
        tooltip.style.left = `${left}px`;
        tooltip.classList.add('is-visible');
    }

    function updateOfficialSiteMusicLyricsButton() {
        const button = $('official-site-music-lyrics-toggle-btn');
        if (!button) return;
        button.classList.toggle('active', state.lyricsVisible);
        button.title = state.lyricsVisible ? '收起歌词' : '展开歌词';
        button.setAttribute('aria-label', state.lyricsVisible ? '收起歌词' : '展开歌词');
    }

    function setOfficialSiteLyricsPanelState(type, message = '') {
        const panel = $('official-site-music-lyrics-panel');
        const emptyEl = $('official-site-music-lyrics-empty');
        const scrollEl = $('official-site-music-lyrics-scroll');
        const linesEl = $('official-site-music-lyrics-lines');
        const subtitleEl = $('official-site-music-lyrics-panel-subtitle');
        if (!panel || !emptyEl || !scrollEl || !linesEl || !subtitleEl) return;

        subtitleEl.innerText = '';
        if (type === 'lines') {
            emptyEl.style.display = 'none';
            scrollEl.style.display = 'block';
            subtitleEl.innerText = state.currentLyricMeta?.歌曲名 || '歌词';
            return;
        }
        linesEl.replaceChildren();
        scrollEl.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.innerText = message || '当前歌曲暂无歌词';
    }

    function renderOfficialSiteLyrics() {
        const linesEl = $('official-site-music-lyrics-lines');
        if (!linesEl) return;
        if (!state.currentLyrics.length) {
            setOfficialSiteLyricsPanelState('empty', '当前歌曲暂无歌词');
            return;
        }

        linesEl.innerHTML = state.currentLyrics.map((item, index) => `
            <button class="music-lyric-line ${index === state.currentLyricActiveIndex ? 'active' : ''} ${index < state.currentLyricActiveIndex ? 'past' : ''}"
                type="button" data-index="${index}" onclick="seekOfficialSiteMusicLyricLine(${index})">
                ${escapeHtml(item.text)}
            </button>
        `).join('');
        setOfficialSiteLyricsPanelState('lines', state.currentLyricMeta?.歌曲名 || '歌词');
    }

    function getOfficialSiteMusicLyricActiveRange(activeIndex) {
        if (activeIndex < 0 || activeIndex >= state.currentLyrics.length) {
            return { start: activeIndex, end: activeIndex };
        }

        const activeTime = state.currentLyrics[activeIndex].time;
        let start = activeIndex;
        let end = activeIndex;
        while (start > 0 && Math.abs(state.currentLyrics[start - 1].time - activeTime) < 0.001) start -= 1;
        while (end + 1 < state.currentLyrics.length && Math.abs(state.currentLyrics[end + 1].time - activeTime) < 0.001) end += 1;
        return { start, end };
    }

    function syncOfficialSiteMusicLyrics(currentTime, force = false) {
        if (!state.currentLyrics.length) return;
        const scrollEl = $('official-site-music-lyrics-scroll');
        const linesEl = $('official-site-music-lyrics-lines');
        if (!scrollEl || !linesEl) return;

        let activeIndex = 0;
        for (let index = 0; index < state.currentLyrics.length; index += 1) {
            if (state.currentLyrics[index].time <= currentTime + 0.08) activeIndex = index;
            else break;
        }
        if (!force && activeIndex === state.currentLyricActiveIndex) return;
        state.currentLyricActiveIndex = activeIndex;

        const activeRange = getOfficialSiteMusicLyricActiveRange(activeIndex);

        const lineEls = Array.from(linesEl.children);
        lineEls.forEach((el, index) => {
            const isActive = index >= activeRange.start && index <= activeRange.end;
            const distance = index < activeRange.start
                ? activeRange.start - index
                : index > activeRange.end
                    ? index - activeRange.end
                    : 0;
            el.classList.toggle('active', isActive);
            el.classList.toggle('past', index < activeRange.start);
            el.classList.toggle('near', distance === 1);
            el.classList.toggle('mid', distance === 2);
            el.classList.toggle('far', distance >= 3);
        });

        const activeStartEl = lineEls[activeRange.start];
        const activeEndEl = lineEls[activeRange.end];
        if (!activeStartEl || !activeEndEl) return;
        if (!force && state.lyricsUserScrolling) return;
        const activeGroupTop = activeStartEl.offsetTop;
        const activeGroupBottom = activeEndEl.offsetTop + activeEndEl.offsetHeight;
        const targetTop = activeGroupTop - (scrollEl.clientHeight / 2) + ((activeGroupBottom - activeGroupTop) / 2);
        const safeTargetTop = Math.max(targetTop, 0);
        if (!force && Math.abs(scrollEl.scrollTop - safeTargetTop) < 8) return;
        requestAnimationFrame(() => {
            scrollEl.scrollTo({
                top: safeTargetTop,
                behavior: force ? 'auto' : 'smooth'
            });
        });
    }

    function handleOfficialSiteLyricsUserScroll() {
        state.lyricsUserScrolling = true;
        if (state.lyricsScrollResumeTimer) {
            clearTimeout(state.lyricsScrollResumeTimer);
        }
        state.lyricsScrollResumeTimer = setTimeout(() => {
            state.lyricsUserScrolling = false;
            state.lyricsScrollResumeTimer = null;
            if (!state.lyricsVisible) return;
            syncOfficialSiteMusicLyrics($('official-site-music-audio')?.currentTime || 0, true);
        }, 2000);
    }

    function bindOfficialSiteLyricsUserScroll(lyricsScroll) {
        if (!lyricsScroll || state.lyricsScrollListenersBound) return;
        state.lyricsScrollListenersBound = true;
        lyricsScroll.addEventListener('wheel', handleOfficialSiteLyricsUserScroll, { passive: true });
        lyricsScroll.addEventListener('touchstart', handleOfficialSiteLyricsUserScroll, { passive: true });
        lyricsScroll.addEventListener('touchmove', handleOfficialSiteLyricsUserScroll, { passive: true });
        lyricsScroll.addEventListener('scroll', () => {
            if (state.lyricsUserScrolling) handleOfficialSiteLyricsUserScroll();
        }, { passive: true });
    }

    function seekOfficialSiteMusicLyricLine(index) {
        const entry = state.currentLyrics[index];
        const audio = $('official-site-music-audio');
        if (!entry || !audio) return;
        audio.currentTime = Math.max(entry.time, 0);
        syncOfficialSiteMusicLyrics(entry.time, true);
    }

    async function fetchTextWithTimeout(url, timeoutMs = 8000) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

        try {
            const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
            if (!response.ok) return '';
            return await response.text();
        } catch (_) {
            return '';
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function loadOfficialSiteMusicLyrics(track) {
        const requestId = ++state.lyricsRequestId;
        state.currentLyrics = [];
        state.currentLyricActiveIndex = -1;
        state.lyricsUserScrolling = false;
        if (state.lyricsScrollResumeTimer) {
            clearTimeout(state.lyricsScrollResumeTimer);
            state.lyricsScrollResumeTimer = null;
        }
        state.currentLyricMeta = track ? {
            歌曲名: track.title,
            分团: track.groupLabel,
            groupName: track.groupLabel,
            group: track.groupLabel,
            专辑: track.album || '',
            类型: track.album ? 'EP' : '',
            专辑序号: '',
            lrcPath: track.lrcPath || ''
        } : null;
        setOfficialSiteLyricsPanelState('loading', '');

        if (!track || !track.title) {
            setOfficialSiteLyricsPanelState('empty', '当前歌曲暂无歌词');
            return;
        }

        const urls = [];
        buildDirectMusicLyricPaths(state.currentLyricMeta).forEach((path) => {
            urls.push(`${MUSIC_LYRICS_BASE_URL}/${encodeMusicLyricPath(path)}`);
        });
        try {
            const index = await fetchMusicLyricsIndex();
            if (requestId !== state.lyricsRequestId) return;
            buildMusicLyricIndexedPaths(state.currentLyricMeta, index).forEach((path) => {
                urls.push(`${MUSIC_LYRICS_BASE_URL}/${encodeMusicLyricPath(path)}`);
            });
        } catch (error) {
            console.warn('[official-site-music] 读取歌词索引失败', error);
        }

        let lrcText = '';
        for (const url of [...new Set(urls)]) {
            lrcText = await fetchTextWithTimeout(url);
            if (requestId !== state.lyricsRequestId) return;
            if (lrcText) break;
        }

        if (requestId !== state.lyricsRequestId) return;
        if (!lrcText) {
            setOfficialSiteLyricsPanelState('empty', '当前歌曲暂无歌词');
            return;
        }

        state.currentLyrics = parseMusicLrc(lrcText);
        if (!state.currentLyrics.length) {
            setOfficialSiteLyricsPanelState('empty', '歌词格式暂不支持');
            return;
        }

        renderOfficialSiteLyrics();
        syncOfficialSiteMusicLyrics($('official-site-music-audio')?.currentTime || 0, true);
    }

    function updateActiveTrack() {
        document.querySelectorAll('.official-site-music-card').forEach((card) => {
            card.classList.toggle('is-playing', card.dataset.trackId === state.currentTrackId);
        });
        const currentTrack = getCurrentOfficialSiteTrack();
        const currentAlbumKey = currentTrack ? getOfficialSiteAlbumKey(currentTrack) : '';
        document.querySelectorAll('.official-site-music-album-card[data-album-key]').forEach((card) => {
            card.classList.toggle('is-playing', Boolean(currentAlbumKey) && card.dataset.albumKey === currentAlbumKey);
        });
        document.querySelectorAll('.player-queue-item[data-track-id]').forEach((item) => {
            item.classList.toggle('active', item.dataset.trackId === state.currentTrackId);
        });
        const queuePanel = $('official-site-music-player-queue');
        if (queuePanel && queuePanel.style.display !== 'none') {
            window.requestAnimationFrame(() => centerOfficialSiteMusicQueueCurrent(true));
        }
        updateFavoriteButton();
    }

    function updateOfficialSiteMusicCover(cover, nextCoverUrl) {
        const requestId = ++state.coverRequestId;
        if (cover.getAttribute('src') === nextCoverUrl) return;

        const nextCover = new Image();
        const applyCover = () => {
            if (requestId !== state.coverRequestId) return;
            cover.src = nextCoverUrl;
        };
        nextCover.addEventListener('load', () => {
            if (typeof nextCover.decode !== 'function') {
                applyCover();
                return;
            }
            Promise.resolve(nextCover.decode()).catch(() => { }).then(applyCover);
        }, { once: true });
        nextCover.addEventListener('error', () => {
            if (requestId === state.coverRequestId && nextCoverUrl !== './icon.png') {
                updateOfficialSiteMusicCover(cover, './icon.png');
            }
        }, { once: true });
        nextCover.src = nextCoverUrl;
    }

    function updateCurrentTrackDisplay(track) {
        const title = $('official-site-music-current-title');
        const subtitle = $('official-site-music-current-subtitle');
        const cover = $('official-site-music-cover');
        const info = document.querySelector('.official-site-music-player-info');
        if (info) info.classList.toggle('has-track', Boolean(track));
        if (title) title.textContent = track ? getOfficialSiteTrackDisplayTitle(track) : '未播放';
        if (subtitle) {
            subtitle.textContent = getTrackSubtitle(track);
        }
        if (cover) {
            const nextCoverUrl = track && track.coverUrl
                ? getOfficialSiteMusicCoverDisplayUrl(track.coverUrl)
                : './icon.png';
            updateOfficialSiteMusicCover(cover, nextCoverUrl);
        }
        updateFavoriteButton();
        updateOfficialSiteMediaSessionMetadata(track);
    }

    function restoreOfficialSiteMusicPlayerState() {
        if (state.restoredPlayerState || !state.isLoaded || !state.allTracks.length) return;
        state.restoredPlayerState = true;

        const savedState = readOfficialSiteMusicPlayerState();
        const audio = $('official-site-music-audio');
        const track = findTrackBySavedPlayerState(savedState);
        if (!audio) return;

        if (PLAYER_MODE_ORDER.includes(savedState.playMode)) {
            state.playMode = savedState.playMode;
            updatePlayModeButton();
        }
        const explicitVolume = readExplicitOfficialSiteMusicVolume();
        audio.volume = explicitVolume === null ? DEFAULT_MUSIC_VOLUME : explicitVolume;
        audio.muted = Boolean(savedState.muted);
        if (audio.volume > 0) state.previousVolume = audio.volume;
        updateVolumeUI();

        if (!track) return;

        const resumeTime = Math.max(0, Number(savedState.currentTime) || 0);
        state.currentTrackId = track.id;
        audio.src = track.mp3;
        updateCurrentTrackDisplay(track);
        updateActiveTrack();
        syncOfficialSiteProgressAnchor();
        updatePlayerProgress(false, resumeTime);

        const applyTimeAndMaybePlay = () => {
            const targetTime = resumeTime;
            try {
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                    audio.currentTime = Math.min(targetTime, Math.max(0, audio.duration - 0.2));
                } else {
                    audio.currentTime = targetTime;
                }
            } catch (_) { window.YayaRendererUtils.reportIgnoredError(_, 'src/renderer/official-site-music-feature.js'); }
            syncOfficialSiteProgressAnchor();
            updatePlayerProgress();
            state.suspendedPlaybackIntent = false;
            saveOfficialSiteMusicPlayerState({ currentTime: targetTime, wasPlaying: false });
            updatePlayerButton();
        };

        if (audio.readyState >= 1) {
            applyTimeAndMaybePlay();
        } else {
            audio.addEventListener('loadedmetadata', applyTimeAndMaybePlay, { once: true });
            audio.load();
        }

        loadOfficialSiteMusicLyrics(track).catch((error) => {
            console.warn('[official-site-music] 歌词加载失败', error);
        });
    }

    function restoreOfficialSiteMusicCurrentPosition() {
        const savedState = readOfficialSiteMusicPlayerState();
        const audio = $('official-site-music-audio');
        if (!audio) return;
        const track = findTrackBySavedPlayerState(savedState) || getCurrentOfficialSiteTrack();
        if (!track) return;

        const resumeTime = Math.max(0, Number(savedState.currentTime) || 0);
        const applyResume = () => {
            const targetTime = resumeTime;
            try {
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                    audio.currentTime = Math.min(targetTime, Math.max(0, audio.duration - 0.2));
                } else {
                    audio.currentTime = targetTime;
                }
            } catch (_) { window.YayaRendererUtils.reportIgnoredError(_, 'src/renderer/official-site-music-feature.js'); }
            syncOfficialSiteProgressAnchor();
            updatePlayerProgress();
            state.suspendedPlaybackIntent = false;
            saveOfficialSiteMusicPlayerState({ currentTime: targetTime, wasPlaying: false });
            updatePlayerButton();
        };

        if (state.currentTrackId !== track.id || audio.src !== track.mp3) {
            state.currentTrackId = track.id;
            audio.src = track.mp3;
            updateCurrentTrackDisplay(track);
            updateActiveTrack();
            audio.addEventListener('loadedmetadata', applyResume, { once: true });
            audio.load();
            return;
        }

        if (audio.readyState >= 1) {
            applyResume();
        } else {
            audio.addEventListener('loadedmetadata', applyResume, { once: true });
            audio.load();
        }
    }

    function renderOfficialSiteMusicTrackRows(tracks) {
        return tracks.map((track, index) => `
            <button type="button" class="official-site-music-card${track.id === state.currentTrackId ? ' is-playing' : ''}${isOfficialSiteTrackFavorite(track) ? ' is-favorite' : ''}"
                data-track-id="${escapeHtml(track.id)}" onclick="playOfficialSiteTrackFromList(this.dataset.trackId)"
                oncontextmenu="openOfficialSiteMusicContextMenu(event, this.dataset.trackId)">
                <span class="official-site-music-row-index">${String(index + 1).padStart(2, '0')}</span>
                <span class="official-site-music-song-cell">
                    <span class="official-site-music-index${track.coverUrl ? ' has-cover' : ''}">
                        ${track.coverUrl
                ? `<img src="${escapeHtml(getOfficialSiteMusicCoverDisplayUrl(track.coverUrl))}" alt="" loading="${index < 24 ? 'eager' : 'lazy'}" decoding="async">`
                : `${escapeHtml(track.groupKey)}`}
                    </span>
                    <span class="official-site-music-card-body">
                        <span class="official-site-music-title">${escapeHtml(getOfficialSiteTrackDisplayTitle(track))}</span>
                    </span>
                </span>
                <span class="official-site-music-table-text official-site-music-album-cell${track.album ? '' : ' is-empty'}">${escapeHtml(getOfficialSiteAlbumDisplayName(track.album) || '-')}</span>
                <span class="official-site-music-table-text official-site-music-grouping-cell">${escapeHtml(getOfficialSiteAlbumGroupingDisplayLabel(getOfficialSiteAlbumGrouping(track)))}</span>
                <span class="official-site-music-table-text official-site-music-date-cell${track.albumDate ? '' : ' is-empty'}">${escapeHtml(getOfficialSiteAlbumDate(track) || '-')}</span>
                <span class="official-site-music-table-text official-site-music-group-cell">${escapeHtml(track.groupLabel)}</span>
            </button>
        `).join('');
    }

    function renderOfficialSiteMusicTrackTable(tracks, sortable = true) {
        return `
            <div class="official-site-music-table">
                ${renderOfficialSiteMusicTableHead(sortable)}
                ${renderOfficialSiteMusicTrackRows(tracks)}
            </div>
        `;
    }

    function renderOfficialSiteMusicAlbumGallery(albums) {
        const sections = new Map();
        albums.forEach((album) => {
            if (!sections.has(album.grouping)) sections.set(album.grouping, []);
            sections.get(album.grouping).push(album);
        });
        return `
            <div class="official-site-music-album-view">
                ${[...sections.entries()].map(([grouping, sectionAlbums]) => `
                    <section class="official-site-music-album-section">
                        <div class="official-site-music-album-section-heading">
                            <h3>${escapeHtml(getOfficialSiteAlbumGroupingDisplayLabel(grouping))}</h3>
                            <span>${sectionAlbums.length} 张</span>
                        </div>
                        <div class="official-site-music-album-grid">
                            ${sectionAlbums.map((album) => `
                                <button type="button" class="official-site-music-album-card${album.tracks.some((track) => track.id === state.currentTrackId) ? ' is-playing' : ''}"
                                    data-album-key="${escapeHtml(album.key)}" onclick="openOfficialSiteMusicAlbum(this.dataset.albumKey)">
                                    <span class="official-site-music-album-cover${album.coverUrl ? ' has-cover' : ''}">
                                        ${album.coverUrl
                ? `<img src="${escapeHtml(getOfficialSiteMusicCoverDisplayUrl(album.coverUrl))}" alt="" loading="lazy" decoding="async" fetchpriority="low">`
                : `<span>${escapeHtml(album.groupKey || '音乐')}</span>`}
                                    </span>
                                    <span class="official-site-music-album-title">${escapeHtml(album.title)}</span>
                                    <span class="official-site-music-album-meta">${escapeHtml(album.groupLabel || '')}</span>
                                    <span class="official-site-music-album-meta official-site-music-album-date">${escapeHtml(album.albumDate || '日期未知')}</span>
                                </button>
                            `).join('')}
                        </div>
                    </section>
                `).join('')}
            </div>
        `;
    }

    function renderOfficialSiteMusicAlbumDetail(album) {
        return `
            <div class="official-site-music-album-detail">
                <div class="official-site-music-album-detail-header">
                    <span class="official-site-music-album-detail-cover${album.coverUrl ? ' has-cover' : ''}">
                        ${album.coverUrl
                ? `<img src="${escapeHtml(getOfficialSiteMusicCoverDisplayUrl(album.coverUrl))}" alt="" decoding="async">`
                : `<span>${escapeHtml(album.groupKey || '音乐')}</span>`}
                    </span>
                    <div class="official-site-music-album-detail-copy">
                        <h3>${escapeHtml(album.title)}</h3>
                        <p>${escapeHtml([album.groupLabel, getOfficialSiteAlbumGroupingDisplayLabel(album.grouping)].filter(Boolean).join(' · '))}</p>
                        <p class="official-site-music-album-detail-date">${escapeHtml(album.albumDate || '日期未知')}</p>
                    </div>
                    <button type="button" class="official-site-music-album-back" onclick="closeOfficialSiteMusicAlbum()" aria-label="返回专辑视图">
                        <span>返回</span>
                    </button>
                </div>
                ${renderOfficialSiteMusicTrackTable(album.tracks, false)}
            </div>
        `;
    }

    function renderOfficialSiteMusic() {
        const list = $('official-site-music-list');
        if (!list) return;

        const matchingTracks = getFilteredTracks();
        const albums = state.viewMode === 'album' ? buildOfficialSiteMusicAlbums(matchingTracks) : [];
        if (state.routeAlbumTitle) {
            const routeAlbum = albums.find((album) => (
                album.groupKey === state.routeAlbumGroup
                && album.title.normalize().toLocaleLowerCase() === state.routeAlbumTitle.normalize().toLocaleLowerCase()
            ));
            if (routeAlbum) state.albumFocusKey = routeAlbum.key;
        }
        let focusedAlbum = state.albumFocusKey ? albums.find((album) => album.key === state.albumFocusKey) : null;
        if (state.albumFocusKey && !focusedAlbum) {
            state.albumFocusKey = '';
            focusedAlbum = null;
        }
        state.filteredTracks = focusedAlbum ? focusedAlbum.tracks : matchingTracks;
        updateFilterButtons();
        if (state.isLoaded) {
            if (focusedAlbum) {
                setStatus(`${focusedAlbum.title} · ${focusedAlbum.tracks.length} 首`);
            } else if (state.viewMode === 'album') {
                setStatus(`共 ${state.allTracks.length} 首，当前 ${albums.length} 张专辑`);
            } else {
                setStatus(`共 ${state.allTracks.length} 首，当前 ${state.filteredTracks.length} 首`);
            }
        } else {
            setStatus('未加载');
        }

        if (state.isLoading && !state.isLoaded) {
            setEmpty('正在加载音乐列表...');
            return;
        }

        if (!state.isLoaded) {
            setStatus(state.errorMessage ? '加载失败' : '未加载');
            setEmpty(state.errorMessage || '');
            return;
        }

        if (matchingTracks.length === 0) {
            const emptyText = state.favoritesOnly
                ? (state.searchTerm.trim() ? '没有找到匹配的收藏歌曲' : '还没有收藏歌曲')
                : (state.viewMode === 'album' ? '没有找到匹配的专辑' : '没有找到匹配的歌曲');
            list.classList.remove('is-empty');
            list.classList.toggle('is-album-view', state.viewMode === 'album');
            list.classList.remove('is-album-detail');
            replaceOfficialSiteMusicListHtml(list, state.viewMode === 'album'
                ? `<div class="official-site-music-album-empty">${escapeHtml(emptyText)}</div>`
                : `<div class="official-site-music-table">${renderOfficialSiteMusicTableHead()}<div class="official-site-music-table-empty">${escapeHtml(emptyText)}</div></div>`);
            renderOfficialSiteQueue();
            return;
        }

        list.classList.remove('is-empty');
        list.classList.toggle('is-album-view', state.viewMode === 'album');
        list.classList.toggle('is-album-detail', Boolean(focusedAlbum));
        replaceOfficialSiteMusicListHtml(list, focusedAlbum
            ? renderOfficialSiteMusicAlbumDetail(focusedAlbum)
            : state.viewMode === 'album'
                ? renderOfficialSiteMusicAlbumGallery(albums)
                : renderOfficialSiteMusicTrackTable(state.filteredTracks));
        renderOfficialSiteQueue();
    }

    function renderOfficialSiteMusicTableHead(sortable = true) {
        const cell = (key, label) => sortable
            ? renderSortHeader(key, label)
            : `<span class="official-site-music-sort">${escapeHtml(label)}</span>`;
        return `
            <div class="official-site-music-table-head">
                ${cell('source', '序号')}
                ${cell('title', '标题')}
                ${cell('album', '专辑')}
                ${cell('grouping', '类型')}
                ${cell('date', '发行日期')}
                ${cell('group', '分团')}
            </div>
        `;
    }

    function renderSortHeader(key, label) {
        const isActive = state.sortKey === key;
        const mark = isActive ? (state.sortDirection === 'asc' ? '↑' : '↓') : '';
        return `<button type="button" class="official-site-music-sort${isActive ? ' is-active' : ''}"
            onclick="sortOfficialSiteMusic('${key}')">${escapeHtml(label)}<span>${mark}</span></button>`;
    }

    function renderOfficialSiteQueue() {
        const listEl = $('official-site-music-player-queue-list');
        const countEl = $('official-site-music-player-queue-count');
        const clearButton = $('official-site-music-player-queue-clear');
        if (!listEl || !countEl) return;

        const queueTracks = getOfficialSiteMusicQueueTracks();

        countEl.innerText = `${queueTracks.length} 首`;
        if (clearButton) clearButton.disabled = queueTracks.length === 0;
        if (!queueTracks.length) {
            listEl.innerHTML = '<div class="empty-state" style="padding:20px;">暂无播放列表</div>';
            return;
        }

        listEl.innerHTML = queueTracks.map((track, index) => `
            <button class="player-queue-item ${track.id === state.currentTrackId ? 'active' : ''}"
                data-track-id="${escapeHtml(track.id)}" onclick="event.stopPropagation(); playOfficialSiteTrack(this.dataset.trackId)"
                oncontextmenu="openOfficialSiteMusicContextMenu(event, this.dataset.trackId)">
                <span class="player-queue-item-index">${index + 1}</span>
                <div class="player-queue-item-main">
                    <div class="player-queue-item-title">${escapeHtml(getOfficialSiteTrackDisplayTitle(track))}</div>
                    <div class="player-queue-item-sub">${escapeHtml(getTrackSubtitle(track))}</div>
                </div>
                <span class="player-queue-item-time">${escapeHtml(getOfficialSiteAlbumDisplayName(track.album) || '-')}</span>
            </button>
        `).join('');
        const queuePanel = $('official-site-music-player-queue');
        if (queuePanel && queuePanel.style.display !== 'none') {
            if (queuePanel.classList.contains('is-positioning')) {
                settleOfficialSiteMusicQueuePosition();
            } else {
                window.requestAnimationFrame(() => centerOfficialSiteMusicQueueCurrent(false));
            }
        }
    }

    function settleOfficialSiteMusicQueuePosition() {
        const queuePanel = $('official-site-music-player-queue');
        if (!queuePanel || queuePanel.style.display === 'none') return;
        window.requestAnimationFrame(() => {
            centerOfficialSiteMusicQueueCurrent(false);
            window.requestAnimationFrame(() => {
                centerOfficialSiteMusicQueueCurrent(false);
                window.requestAnimationFrame(() => {
                    centerOfficialSiteMusicQueueCurrent(false);
                    queuePanel.classList.remove('is-positioning');
                });
            });
        });
    }

    function centerOfficialSiteMusicQueueCurrent(smooth = false) {
        const listEl = $('official-site-music-player-queue-list');
        if (!listEl || !state.currentTrackId) return false;

        const currentItem = Array.from(listEl.querySelectorAll('.player-queue-item[data-track-id]'))
            .find(item => item.dataset.trackId === state.currentTrackId);
        if (!currentItem) return false;

        const listRect = listEl.getBoundingClientRect();
        const itemRect = currentItem.getBoundingClientRect();
        const targetTop = listEl.scrollTop
            + (itemRect.top + itemRect.height / 2)
            - (listRect.top + listRect.height / 2);
        const prefersReducedMotion = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const safeTargetTop = Math.max(0, targetTop);
        if (smooth && !prefersReducedMotion) {
            listEl.scrollTo({ top: safeTargetTop, behavior: 'smooth' });
        } else {
            listEl.scrollTop = safeTargetTop;
        }
        return true;
    }

    async function loadOfficialSiteMusic(options = {}) {
        ensureOfficialSiteMusicPinyinReady();
        if (state.isLoading) return;
        if (state.isLoaded && !options.force) {
            renderOfficialSiteMusic();
            restoreOfficialSiteMusicCurrentPosition();
            return;
        }

        state.isLoading = true;
        state.errorMessage = '';
        setStatus('');

        const existingTracks = state.allTracks.filter(isR2MusicTrack);
        const cachedTracks = existingTracks.length
            ? existingTracks
            : readR2MusicTracksCache().tracks.filter(isR2MusicTrack);
        if (cachedTracks.length) {
            state.allTracks = cachedTracks;
            if (!isOfficialSiteMusicWebRuntime()) {
                state.allTracks.forEach(applyCachedOfficialSiteTrackDuration);
            }
            state.isLoaded = true;
            restoreOfficialSiteMusicPlayerState();
        }
        renderOfficialSiteMusic();

        try {
            const r2Tracks = await loadR2PerformanceMusicTracks();
            state.allTracks = r2Tracks.filter(isR2MusicTrack);
            if (!isOfficialSiteMusicWebRuntime()) {
                state.allTracks.forEach(applyCachedOfficialSiteTrackDuration);
            }
            state.isLoaded = true;
            restoreOfficialSiteMusicPlayerState();
            if (state.allTracks.length === 0) {
                setStatus('未读取到曲目');
            }
        } catch (error) {
            console.error('[official-site-music] load failed', error);
            state.isLoaded = false;
            state.errorMessage = error && error.message ? error.message : '自有音乐源加载失败';
            setEmpty(state.errorMessage);
            setStatus('加载失败');
            showOfficialMusicToast('音乐源加载失败');
        } finally {
            state.isLoading = false;
            renderOfficialSiteMusic();
            if (state.isLoaded) warmOfficialSiteMusicCoverCache();
        }
    }

    function playOfficialSiteTrack(trackId) {
        const track = state.allTracks.find((item) => item.id === trackId);
        const audio = $('official-site-music-audio');
        if (!track || !audio) return;

        const playbackRequestId = ++state.playbackRequestId;
        const sameTrack = state.currentTrackId === track.id && Boolean(audio.src || audio.currentSrc);
        state.currentTrackId = track.id;
        if (!sameTrack) {
            audio.src = track.mp3;
        }
        syncOfficialSiteProgressAnchor();
        updatePlayerProgress(false, 0);
        updateOfficialSiteMediaSessionMetadata(track);

        const resetProgressToStart = () => {
            if (playbackRequestId !== state.playbackRequestId) return;
            try {
                audio.currentTime = 0;
            } catch (_) { window.YayaRendererUtils.reportIgnoredError(_, 'src/renderer/official-site-music-feature.js'); }
            syncOfficialSiteProgressAnchor();
            updatePlayerProgress();
            saveOfficialSiteMusicPlayerState({ currentTime: 0, wasPlaying: true });
        };

        if (audio.readyState >= 1) {
            resetProgressToStart();
        } else {
            audio.addEventListener('loadedmetadata', resetProgressToStart, { once: true });
        }

        saveOfficialSiteMusicPlayerState({ currentTime: 0, wasPlaying: true });
        audio.play().catch((error) => {
            if (playbackRequestId !== state.playbackRequestId || error?.name === 'AbortError') return;
            console.warn('[official-site-music] play blocked', error);
            showOfficialMusicToast('播放失败，请稍后重试');
        }).finally(() => {
            if (playbackRequestId === state.playbackRequestId) updatePlayerButton();
        });

        updateCurrentTrackDisplay(track);
        updateActiveTrack();
        loadOfficialSiteMusicLyrics(track).catch((error) => {
            console.warn('[official-site-music] 歌词加载失败', error);
        });
    }

    function playOfficialSiteTrackFromList(trackId) {
        setOfficialSiteMusicPlayQueue(state.filteredTracks);
        playOfficialSiteTrack(trackId);
    }

    function getCurrentQueueIndex(queueTracks = getOfficialSiteMusicQueueTracks()) {
        return queueTracks.findIndex((track) => track.id === state.currentTrackId);
    }

    function playByOffset(offset) {
        const queueTracks = getOfficialSiteMusicQueueTracks();
        if (!queueTracks.length) return;
        if (state.playMode === 'shuffle' && queueTracks.length > 1) {
            const currentIndex = getCurrentQueueIndex(queueTracks);
            let nextIndex = currentIndex;
            while (nextIndex === currentIndex) {
                nextIndex = Math.floor(Math.random() * queueTracks.length);
            }
            playOfficialSiteTrack(queueTracks[nextIndex].id);
            return;
        }
        const currentIndex = getCurrentQueueIndex(queueTracks);
        const baseIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = (baseIndex + offset + queueTracks.length) % queueTracks.length;
        playOfficialSiteTrack(queueTracks[nextIndex].id);
    }

    function playOfficialSiteNext() {
        playByOffset(1);
    }

    function playOfficialSitePrevious() {
        playByOffset(-1);
    }

    function toggleOfficialSiteMusicPlay() {
        const audio = $('official-site-music-audio');
        if (!audio) return;

        const queueTracks = getOfficialSiteMusicQueueTracks();
        if (!state.currentTrackId && queueTracks.length) {
            playOfficialSiteTrack(queueTracks[0].id);
            return;
        }

        if (audio.paused) {
            audio.play().catch(() => showOfficialMusicToast('请先选择一首曲目'));
        } else {
            audio.pause();
        }
        updatePlayerButton();
    }

    function seekOfficialSiteMusic(value) {
        const audio = $('official-site-music-audio');
        if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const nextTime = Math.max(0, Math.min(audio.duration, Number(value) || 0));
        audio.currentTime = nextTime;
        syncOfficialSiteProgressAnchor();
        updateRangeFill($('official-site-music-progress'), (nextTime / audio.duration) * 100 || 0);
        updatePlayerProgress();
        updateOfficialSiteMediaSessionPosition();
        saveOfficialSiteMusicPlayerState({ currentTime: nextTime });
    }

    function cycleOfficialSiteMusicPlayMode() {
        state.playMode = getNextPlayMode(state.playMode);
        updatePlayModeButton();
        saveOfficialSiteMusicPlayerState();
        showOfficialMusicToast(`音乐播放模式：${PLAYER_MODE_LABELS[state.playMode]}`);
    }

    function closeOfficialSiteMusicContextMenu() {
        const menu = $('official-site-music-context-menu');
        if (!menu) return;
        menu.hidden = true;
        menu.dataset.trackId = '';
    }

    function openOfficialSiteMusicContextMenu(event, trackId) {
        event?.preventDefault();
        event?.stopPropagation();
        const track = state.allTracks.find((item) => item.id === String(trackId || ''));
        const menu = $('official-site-music-context-menu');
        const addButton = $('official-site-music-context-add');
        const favoriteButton = $('official-site-music-context-favorite');
        if (!track || !menu || !addButton || !favoriteButton) return;

        const trackKey = getOfficialSiteTrackFavoriteKey(track);
        const isQueued = Boolean(trackKey && state.playQueueKeys.includes(trackKey));
        menu.dataset.trackId = track.id;
        addButton.disabled = false;
        addButton.textContent = isQueued ? '移出播放列表' : '添加到播放列表';
        favoriteButton.textContent = isOfficialSiteTrackFavorite(track) ? '取消收藏' : '收藏';
        menu.hidden = false;
        menu.style.left = '0px';
        menu.style.top = '0px';

        const menuRect = menu.getBoundingClientRect();
        const left = Math.max(8, Math.min(Number(event?.clientX) || 0, window.innerWidth - menuRect.width - 8));
        const top = Math.max(8, Math.min(Number(event?.clientY) || 0, window.innerHeight - menuRect.height - 8));
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    function closeOfficialSiteMusicQueue() {
        const panel = $('official-site-music-player-queue');
        if (panel) {
            panel.classList.remove('is-positioning');
            panel.style.display = 'none';
        }
        document.removeEventListener('click', handleOfficialSiteMusicQueueOutsideClick);
    }

    function handleOfficialSiteMusicQueueOutsideClick(event) {
        const panel = $('official-site-music-player-queue');
        const button = $('official-site-music-playlist-btn');
        const target = event.target;
        if (!panel || panel.style.display === 'none') {
            document.removeEventListener('click', handleOfficialSiteMusicQueueOutsideClick);
            return;
        }
        if ((panel && panel.contains(target)) || (button && button.contains(target))) return;
        closeOfficialSiteMusicQueue();
    }

    function toggleOfficialSiteMusicQueue() {
        const panel = $('official-site-music-player-queue');
        if (!panel) return;
        const shouldOpen = panel.style.display === 'none' || !panel.style.display;
        if (!shouldOpen) {
            closeOfficialSiteMusicQueue();
            return;
        }
        panel.classList.add('is-positioning');
        panel.style.display = 'block';
        setTimeout(() => {
            document.addEventListener('click', handleOfficialSiteMusicQueueOutsideClick);
        }, 0);
        if (shouldOpen) {
            const listEl = $('official-site-music-player-queue-list');
            if (listEl && listEl.childElementCount > 0) {
                settleOfficialSiteMusicQueuePosition();
            } else {
                renderOfficialSiteQueue();
            }
        }
    }

    function setOfficialSiteMusicVolume(value) {
        const audio = $('official-site-music-audio');
        if (!audio) return;
        audio.volume = clampOfficialSiteMusicVolume(value);
        audio.muted = audio.volume === 0;
        if (audio.volume > 0) state.previousVolume = audio.volume;
        writeStringSetting(VOLUME_STORAGE_KEY, String(audio.volume));
        saveOfficialSiteMusicPlayerState();
        updateVolumeUI();
    }

    function toggleOfficialSiteMusicMute() {
        const audio = $('official-site-music-audio');
        if (!audio) return;
        if (!audio.muted && audio.volume > 0) {
            state.previousVolume = audio.volume;
            audio.muted = true;
        } else {
            audio.muted = false;
            audio.volume = state.previousVolume || DEFAULT_MUSIC_VOLUME;
        }
        writeStringSetting(VOLUME_STORAGE_KEY, String(audio.volume));
        saveOfficialSiteMusicPlayerState();
        updateVolumeUI();
    }

    function suspendOfficialSiteMusicForViewSwitch() {
        const audio = $('official-site-music-audio');
        if (!audio) return;
        const wasPlaying = (!audio.paused && !audio.ended) || state.suspendedPlaybackIntent;
        state.suspendedPlaybackIntent = wasPlaying;
        if (state.playerStateSaveTimer) {
            clearTimeout(state.playerStateSaveTimer);
            state.playerStateSaveTimer = null;
        }
        saveOfficialSiteMusicPlayerState({ wasPlaying });
        if (!audio.paused && !audio.ended) {
            state.suppressNextPauseStateSave = true;
            audio.pause();
            setTimeout(() => {
                state.suppressNextPauseStateSave = false;
            }, 0);
        }
    }

    function toggleOfficialSiteMusicLyricsPanel() {
        const panel = $('official-site-music-lyrics-panel');
        if (!panel) return;
        state.lyricsVisible = !state.lyricsVisible;
        panel.style.display = state.lyricsVisible ? 'flex' : 'none';
        const view = $('view-official-site-music');
        if (view) view.classList.toggle('lyrics-mode', state.lyricsVisible);
        if (state.lyricsVisible) {
            const queuePanel = $('official-site-music-player-queue');
            if (queuePanel) queuePanel.style.display = 'none';
            const track = state.allTracks.find((item) => item.id === state.currentTrackId);
            if (!state.currentLyrics.length && track) {
                loadOfficialSiteMusicLyrics(track).catch((error) => {
                    console.warn('[official-site-music] 歌词加载失败', error);
                });
            } else if (state.currentLyrics.length) {
                syncOfficialSiteMusicLyrics($('official-site-music-audio')?.currentTime || 0, true);
            }
        }
        updateOfficialSiteMusicLyricsButton();
    }

    function handleOfficialSiteMusicSearch(value) {
        state.searchTerm = value || '';
        state.albumFocusKey = '';
        state.routeAlbumTitle = '';
        state.routeAlbumGroup = '';
        renderOfficialSiteMusic();
        syncOfficialSiteMusicRoute(state.favoritesOnly ? 'favorite' : state.groupFilter);
    }

    function toggleOfficialSiteMusicView() {
        state.viewMode = state.viewMode === 'album' ? 'list' : 'album';
        state.albumFocusKey = '';
        state.routeAlbumTitle = '';
        state.routeAlbumGroup = '';
        writeStringSetting(VIEW_MODE_STORAGE_KEY, state.viewMode);
        const list = $('official-site-music-list');
        if (list) list.scrollTop = 0;
        renderOfficialSiteMusic();
        syncOfficialSiteMusicRoute(state.favoritesOnly ? 'favorite' : state.groupFilter);
    }

    function openOfficialSiteMusicAlbum(albumKey) {
        const album = buildOfficialSiteMusicAlbums(getFilteredTracks())
            .find((item) => item.key === String(albumKey || ''));
        if (!album) return;
        state.viewMode = 'album';
        state.albumFocusKey = album.key;
        state.routeAlbumTitle = album.title;
        state.routeAlbumGroup = album.groupKey;
        writeStringSetting(VIEW_MODE_STORAGE_KEY, state.viewMode);
        const list = $('official-site-music-list');
        state.albumGalleryScrollTop = list ? Math.max(0, list.scrollTop) : 0;
        if (list) list.scrollTop = 0;
        renderOfficialSiteMusic();
        syncOfficialSiteMusicRoute(state.favoritesOnly ? 'favorite' : album.groupKey, {
            albumGroup: album.groupKey,
            albumTitle: album.title
        });
    }

    function closeOfficialSiteMusicAlbum() {
        const restoreScrollTop = Math.max(0, Number(state.albumGalleryScrollTop) || 0);
        state.albumFocusKey = '';
        state.routeAlbumTitle = '';
        state.routeAlbumGroup = '';
        const list = $('official-site-music-list');
        renderOfficialSiteMusic();
        syncOfficialSiteMusicRoute(state.favoritesOnly ? 'favorite' : state.groupFilter);
        if (!list) return;
        const restoreAlbumGalleryPosition = () => {
            const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
            list.scrollTop = Math.min(restoreScrollTop, maxScrollTop);
        };
        restoreAlbumGalleryPosition();
        requestAnimationFrame(restoreAlbumGalleryPosition);
    }

    function setOfficialSiteMusicAlbumGroupingFilter(grouping) {
        state.albumGroupingFilter = String(grouping || 'ALL');
        state.albumFocusKey = '';
        state.routeAlbumTitle = '';
        state.routeAlbumGroup = '';
        closeOfficialSiteMusicAlbumGroupingMenu();
        renderOfficialSiteMusic();
        syncOfficialSiteMusicRoute(state.favoritesOnly ? 'favorite' : state.groupFilter);
    }

    function normalizeOfficialSiteMusicRouteFilter(filter) {
        const normalized = String(filter || '').trim();
        if (!normalized || normalized.toLowerCase() === 'all') return 'ALL';
        if (normalized.toLowerCase() === 'favorite') return 'favorite';
        const groupKey = normalized.toUpperCase().replace(/48$/, '');
        return MUSIC_ROUTE_GROUP_KEYS.has(groupKey) ? groupKey : 'ALL';
    }

    function syncOfficialSiteMusicRoute(filter, options = {}) {
        if (typeof window.syncWebOfficialSiteMusicRoute === 'function') {
            window.syncWebOfficialSiteMusicRoute(filter, options);
        }
    }

    function applyOfficialSiteMusicRouteFilter(filter, albumTitle = '', albumGroup = '') {
        const normalized = normalizeOfficialSiteMusicRouteFilter(filter);
        const normalizedAlbumGroup = normalized === 'favorite'
            ? normalizeOfficialSiteMusicRouteFilter(albumGroup)
            : normalized;
        const isAlbumRoute = normalizedAlbumGroup !== 'ALL' && normalizedAlbumGroup !== 'favorite'
            && Boolean(String(albumTitle || '').trim());
        state.favoritesOnly = normalized === 'favorite';
        state.groupFilter = isAlbumRoute || state.favoritesOnly ? 'ALL' : normalized;
        state.albumFocusKey = '';
        state.routeAlbumTitle = isAlbumRoute ? String(albumTitle || '').trim() : '';
        state.routeAlbumGroup = isAlbumRoute ? normalizedAlbumGroup : '';
        if (state.routeAlbumTitle) {
            state.viewMode = 'album';
            state.albumGroupingFilter = 'ALL';
            state.searchTerm = '';
            const searchInput = $('official-site-music-search-input');
            if (searchInput) searchInput.value = '';
        }
        renderOfficialSiteMusic();
    }

    function setOfficialSiteMusicGroupFilter(groupKey) {
        state.groupFilter = normalizeOfficialSiteMusicRouteFilter(groupKey);
        if (state.groupFilter === 'favorite') state.groupFilter = 'ALL';
        state.favoritesOnly = false;
        state.albumFocusKey = '';
        state.routeAlbumTitle = '';
        state.routeAlbumGroup = '';
        renderOfficialSiteMusic();
        syncOfficialSiteMusicRoute(state.groupFilter);
    }

    function toggleOfficialSiteMusicFavoritesFilter() {
        state.favoritesOnly = !state.favoritesOnly;
        state.albumFocusKey = '';
        state.routeAlbumTitle = '';
        state.routeAlbumGroup = '';
        if (!state.favoritesOnly) {
            state.groupFilter = 'ALL';
        }
        renderOfficialSiteMusic();
        syncOfficialSiteMusicRoute(state.favoritesOnly ? 'favorite' : 'ALL');
    }

    function toggleOfficialSiteMusicTrackFavorite(track, options = {}) {
        const key = getOfficialSiteTrackFavoriteKey(track);
        if (!track || !key) return false;

        if (state.favoriteTrackKeys.has(key)) {
            state.favoriteTrackKeys.delete(key);
            if (options.notify !== false) showOfficialMusicToast('已取消收藏');
        } else {
            state.favoriteTrackKeys.add(key);
            if (options.notify !== false) showOfficialMusicToast('已收藏');
        }

        saveOfficialSiteMusicFavorites();
        updateFavoriteUi();
        renderOfficialSiteMusic();
        return true;
    }

    function toggleOfficialSiteMusicFavoriteByTrackId(trackId) {
        const track = state.allTracks.find((item) => item.id === String(trackId || ''));
        if (!track) return;
        toggleOfficialSiteMusicTrackFavorite(track);
        closeOfficialSiteMusicContextMenu();
    }

    function toggleOfficialSiteMusicFavorite() {
        const track = getCurrentOfficialSiteTrack();
        if (!track) {
            showOfficialMusicToast('请先选择一首歌曲');
            return;
        }
        toggleOfficialSiteMusicTrackFavorite(track);
    }

    function sortOfficialSiteMusic(key) {
        if (state.sortKey === key) {
            state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortKey = key || 'source';
            state.sortDirection = 'asc';
        }
        renderOfficialSiteMusic();
    }

    function initOfficialSiteMusicAudio() {
        const audio = $('official-site-music-audio');
        if (!audio || audio.dataset.officialSiteMusicBound === '1') return;
        audio.dataset.officialSiteMusicBound = '1';
        setupOfficialSiteMediaSession();
        const volumeBar = $('official-site-music-volume-bar');
        const progressBar = $('official-site-music-progress');
        const lyricsScroll = $('official-site-music-lyrics-scroll');
        const explicitVolume = readExplicitOfficialSiteMusicVolume();
        audio.volume = explicitVolume === null ? DEFAULT_MUSIC_VOLUME : explicitVolume;
        if (audio.volume > 0) state.previousVolume = audio.volume;
        audio.addEventListener('play', () => {
            state.suspendedPlaybackIntent = false;
            syncOfficialSiteProgressAnchor();
            updatePlayerButton();
            startOfficialSiteProgressAnimation();
            saveOfficialSiteMusicPlayerState({ wasPlaying: true });
        });
        audio.addEventListener('playing', () => {
            syncOfficialSiteProgressAnchor();
            startOfficialSiteProgressAnimation();
            updateOfficialSiteMediaSessionPlaybackState();
            updateOfficialSiteMediaSessionPosition();
            saveOfficialSiteMusicPlayerState({ wasPlaying: true });
        });
        audio.addEventListener('pause', () => {
            syncOfficialSiteProgressAnchor();
            updatePlayerButton();
            stopOfficialSiteProgressAnimation();
            updatePlayerProgress(false);
            if (!state.suppressNextPauseStateSave) {
                state.suspendedPlaybackIntent = false;
                saveOfficialSiteMusicPlayerState({ wasPlaying: false });
            }
        });
        audio.addEventListener('loadedmetadata', () => {
            syncOfficialSiteProgressAnchor();
            updatePlayerProgress();
            updateCurrentTrackDurationFromAudio();
            updateOfficialSiteMediaSessionPosition();
            saveOfficialSiteMusicPlayerState();
        });
        audio.addEventListener('timeupdate', () => {
            syncOfficialSiteProgressAnchor();
            updatePlayerProgress();
            requestOfficialSiteMusicPlayerStateSave();
        });
        audio.addEventListener('durationchange', () => {
            syncOfficialSiteProgressAnchor();
            updatePlayerProgress();
            updateCurrentTrackDurationFromAudio();
            updateOfficialSiteMediaSessionPosition();
        });
        audio.addEventListener('waiting', () => {
            syncOfficialSiteProgressAnchor();
            stopOfficialSiteProgressAnimation();
            updatePlayerProgress(false);
        });
        audio.addEventListener('seeking', syncOfficialSiteProgressAnchor);
        audio.addEventListener('seeked', () => {
            syncOfficialSiteProgressAnchor();
            updateOfficialSiteMediaSessionPosition();
        });
        audio.addEventListener('ratechange', () => {
            syncOfficialSiteProgressAnchor();
            updateOfficialSiteMediaSessionPosition();
        });
        audio.addEventListener('volumechange', () => {
            updateVolumeUI();
            requestOfficialSiteMusicPlayerStateSave();
        });
        audio.addEventListener('ended', () => {
            updatePlayerButton();
            stopOfficialSiteProgressAnimation();
            updatePlayerProgress();
            updateOfficialSiteMediaSessionPlaybackState();
            if (state.playMode === 'loop-one') {
                audio.currentTime = 0;
                audio.play().catch(() => showOfficialMusicToast('播放失败，请稍后重试'));
                return;
            }
            playOfficialSiteNext();
        });
        audio.addEventListener('error', () => {
            updatePlayerButton();
            stopOfficialSiteProgressAnimation();
            updatePlayerProgress();
            updateOfficialSiteMediaSessionPlaybackState();
            showOfficialMusicToast('当前音频无法播放');
        });
        if (progressBar) {
            progressBar.addEventListener('input', () => {
                seekOfficialSiteMusic(progressBar.value);
            });
            progressBar.addEventListener('mouseenter', updateOfficialSiteMusicProgressTooltip);
            progressBar.addEventListener('mousemove', updateOfficialSiteMusicProgressTooltip);
            progressBar.addEventListener('mouseleave', () => {
                $('official-site-music-progress-tooltip')?.classList.remove('is-visible');
            });
        }
        if (volumeBar) {
            volumeBar.addEventListener('wheel', (event) => {
                event.preventDefault();
                const step = event.deltaY < 0 ? 0.03 : -0.03;
                const nextVolume = Math.max(0, Math.min(1, (audio.muted ? 0 : audio.volume) + step));
                audio.volume = nextVolume;
                audio.muted = false;
                volumeBar.value = String(nextVolume);
                state.previousVolume = nextVolume || state.previousVolume;
                writeStringSetting(VOLUME_STORAGE_KEY, String(nextVolume));
                updateVolumeUI();
            }, { passive: false });
        }
        bindOfficialSiteLyricsUserScroll(lyricsScroll);
    }

    function persistOfficialSiteMusicPlayerStateForExit() {
        const audio = $('official-site-music-audio');
        if (!state.currentTrackId && !audio?.src && !state.suspendedPlaybackIntent) return;
        flushOfficialSiteMusicPlayerState({
            wasPlaying: state.suspendedPlaybackIntent || Boolean(audio && !audio.paused && !audio.ended)
        });
    }

    function initWhenReady() {
        cleanupLegacyOfficialSiteMusicCaches();
        state.viewMode = readStringSetting(VIEW_MODE_STORAGE_KEY, 'list') === 'album' ? 'album' : 'list';
        state.favoriteTrackKeys = readOfficialSiteMusicFavorites();
        state.playQueueKeys = readOfficialSiteMusicPlayQueue();
        state.durationCache = isOfficialSiteMusicWebRuntime() ? new Map() : readOfficialSiteMusicDurationCache();
        const savedState = readOfficialSiteMusicPlayerState();
        if (PLAYER_MODE_ORDER.includes(savedState.playMode)) {
            state.playMode = savedState.playMode;
        }
        initOfficialSiteMusicAudio();
        updatePlayModeButton();
        updateVolumeUI();
        updateOfficialSiteMusicLyricsButton();
        renderOfficialSiteMusic();
        document.addEventListener('click', (event) => {
            const filter = $('official-site-music-grouping-filter');
            if (filter && !filter.contains(event.target)) closeOfficialSiteMusicAlbumGroupingMenu();
            const contextMenu = $('official-site-music-context-menu');
            if (contextMenu && !contextMenu.contains(event.target)) closeOfficialSiteMusicContextMenu();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeOfficialSiteMusicAlbumGroupingMenu();
                closeOfficialSiteMusicContextMenu();
            }
        });
        window.addEventListener('blur', closeOfficialSiteMusicContextMenu);
        document.addEventListener('scroll', closeOfficialSiteMusicContextMenu, true);
        window.addEventListener('beforeunload', persistOfficialSiteMusicPlayerStateForExit);
        window.addEventListener('pagehide', persistOfficialSiteMusicPlayerStateForExit);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                persistOfficialSiteMusicPlayerStateForExit();
            }
        });
    }

    window.loadOfficialSiteMusic = loadOfficialSiteMusic;
    window.playOfficialSiteTrack = playOfficialSiteTrack;
    window.playOfficialSiteTrackFromList = playOfficialSiteTrackFromList;
    window.playOfficialSiteNext = playOfficialSiteNext;
    window.playOfficialSitePrevious = playOfficialSitePrevious;
    window.toggleOfficialSiteMusicPlay = toggleOfficialSiteMusicPlay;
    window.seekOfficialSiteMusic = seekOfficialSiteMusic;
    window.cycleOfficialSiteMusicPlayMode = cycleOfficialSiteMusicPlayMode;
    window.toggleOfficialSiteMusicQueue = toggleOfficialSiteMusicQueue;
    window.clearOfficialSiteMusicQueue = clearOfficialSiteMusicQueue;
    window.toggleOfficialSiteTrackInQueue = toggleOfficialSiteTrackInQueue;
    window.openOfficialSiteMusicContextMenu = openOfficialSiteMusicContextMenu;
    window.toggleOfficialSiteMusicFavoriteByTrackId = toggleOfficialSiteMusicFavoriteByTrackId;
    window.setOfficialSiteMusicVolume = setOfficialSiteMusicVolume;
    window.toggleOfficialSiteMusicMute = toggleOfficialSiteMusicMute;
    window.suspendOfficialSiteMusicForViewSwitch = suspendOfficialSiteMusicForViewSwitch;
    window.toggleOfficialSiteMusicLyricsPanel = toggleOfficialSiteMusicLyricsPanel;
    window.seekOfficialSiteMusicLyricLine = seekOfficialSiteMusicLyricLine;
    window.handleOfficialSiteMusicSearch = handleOfficialSiteMusicSearch;
    window.toggleOfficialSiteMusicAlbumGroupingMenu = toggleOfficialSiteMusicAlbumGroupingMenu;
    window.setOfficialSiteMusicAlbumGroupingFilter = setOfficialSiteMusicAlbumGroupingFilter;
    window.setOfficialSiteMusicGroupFilter = setOfficialSiteMusicGroupFilter;
    window.applyOfficialSiteMusicRouteFilter = applyOfficialSiteMusicRouteFilter;
    window.toggleOfficialSiteMusicView = toggleOfficialSiteMusicView;
    window.openOfficialSiteMusicAlbum = openOfficialSiteMusicAlbum;
    window.closeOfficialSiteMusicAlbum = closeOfficialSiteMusicAlbum;
    window.toggleOfficialSiteMusicFavoritesFilter = toggleOfficialSiteMusicFavoritesFilter;
    window.toggleOfficialSiteMusicFavorite = toggleOfficialSiteMusicFavorite;
    window.sortOfficialSiteMusic = sortOfficialSiteMusic;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWhenReady, { once: true });
    } else {
        initWhenReady();
    }
})();
