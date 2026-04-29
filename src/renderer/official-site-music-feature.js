(function () {
    const OFFICIAL_SITE_ORIGIN = 'https://www.snh48.com';
    const OFFICIAL_SITE_SCRIPT_BASE = `${OFFICIAL_SITE_ORIGIN}/js`;
    const DATA_BASE_URL = 'https://yaya-data.pages.dev';
    const MUSIC_LYRICS_BASE_URL = `${DATA_BASE_URL}/lyrics`;
    const MUSIC_LYRICS_INDEX_URL = `${DATA_BASE_URL}/lyrics-index.json`;
    const FAVORITES_STORAGE_KEY = 'yaya_official_site_music_favorites';
    const PLAYER_STATE_STORAGE_KEY = 'yaya_official_site_music_player_state';
    const GROUPS = [
        { key: 'SNH', label: 'SNH48', script: 'json_data_snh.js', listVar: 'ix_mp3list_snh', recordsVar: 'records_snh', songsVar: 'ix_songs_snh' },
        { key: 'GNZ', label: 'GNZ48', script: 'json_data_gnz.js', listVar: 'ix_mp3list_gnz', recordsVar: 'records_gnz', songsVar: 'ix_songs_gnz' },
        { key: 'BEJ', label: 'BEJ48', script: 'json_data_bej.js', listVar: 'ix_mp3list_bej', recordsVar: 'records_bej', songsVar: 'ix_songs_bej' },
        { key: 'CKG', label: 'CKG48', script: 'json_data_ckg.js', listVar: 'ix_mp3list_ckg', recordsVar: 'records_ckg', songsVar: 'ix_songs_ckg' },
        { key: 'CGT', label: 'CGT48', script: 'json_data_cgt.js', listVar: 'ix_mp3list_cgt', recordsVar: 'records_cgt', songsVar: 'ix_songs_cgt' }
    ];

    const state = {
        allTracks: [],
        filteredTracks: [],
        currentTrackId: null,
        groupFilter: 'ALL',
        favoritesOnly: false,
        favoriteTrackKeys: new Set(),
        searchTerm: '',
        sortKey: 'source',
        sortDirection: 'asc',
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
        progressAnimationFrame: null,
        progressAnchorTime: 0,
        progressAnchorStamp: 0,
        playerStateSaveTimer: null,
        lastPlayerStateSavedAt: 0,
        restoredPlayerState: false,
        suspendedPlaybackIntent: false,
        suppressNextPauseStateSave: false,
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
        ['奔跑的少女', ['奔跑吧少女']]
    ]);

    const SNH_LYRIC_PATH_BY_AUDIO_GROUP_AND_TITLE = new Map([
        ['10th:gravity', 'SNH48/专辑2 绝无仅有的感动/GNZ48 Team G - 重力 (Gravity).lrc'],
        ['10th:remenberyou', 'SNH48/专辑2 绝无仅有的感动/CKG48 - 记得你.lrc'],
        ['tianmi:新的帷幕(ckg48)', 'CKG48/EP1 甜蜜盛典/CKG48 - 新的帷幕.lrc']
    ]);

    function $(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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

    function setStatus(text) {
        const status = $('official-site-music-status');
        if (status) status.textContent = text;
    }

    function setEmpty(text) {
        const list = $('official-site-music-list');
        if (!list) return;
        list.classList.add('is-empty');
        list.innerHTML = `<div class="official-site-music-empty">${escapeHtml(text)}</div>`;
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
        const existingState = track ? {} : readOfficialSiteMusicPlayerState();
        const currentTime = Number.isFinite(Number(options.currentTime))
            ? Number(options.currentTime)
            : (track && audio && Number.isFinite(audio.currentTime) ? audio.currentTime : Number(existingState.currentTime) || 0);
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
            volume: audio ? audio.volume : 1,
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

    function getCurrentOfficialSiteTrack() {
        return state.allTracks.find((item) => item.id === state.currentTrackId) || null;
    }

    function formatDuration(seconds) {
        const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
        const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
        const remainSeconds = String(safeSeconds % 60).padStart(2, '0');
        return `${minutes}:${remainSeconds}`;
    }

    function parseTrackDuration(durationText) {
        const parts = String(durationText || '').split(':').map((part) => Number(part));
        if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return Number.POSITIVE_INFINITY;
        return parts[0] * 60 + parts[1];
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
            .replace(/[<>]/g, '')
            .replace(/[‐‑‒–—―-]/g, '')
            .replace(/\s+/g, '')
            .toLowerCase();
    }

    function isRemovableMusicTitleParenthetical(content) {
        const text = String(content || '').trim();
        if (!text || text.includes('重填词')) return false;
        if (/^(?:SNH48(?:\s+GROUP)?|BEJ48|GNZ48|SHY48|CKG48|CGT48|IDOLS\s*FT)$/i.test(text)) return true;
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
            .replace(/\s*[–—-]\s*(?:[A-Z]+队|TEAM\s*[A-Z0-9]+|SNH48(?:\s+GROUP)?|BEJ48|GNZ48|SHY48|CKG48|CGT48|IDOLS\s*FT)\s*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getOfficialSiteTrackDisplayTitle(track) {
        if (!track) return '';
        const title = stripMusicLyricParenthetical(track.title, { preserveEnglish: true }) || track.title || '未命名歌曲';
        return title.replace(/\bremenber\b/ig, 'Remember');
    }

    function getOfficialSiteAlbumDisplayName(album) {
        return String(album || '')
            .replace(/\s*【蓝版】\s*/g, '')
            .replace(/\s+B版\s*$/i, '')
            .trim();
    }

    function getOfficialSiteMusicPinyinParts(value) {
        const raw = String(value || '').trim().toLowerCase();
        const fallback = { text: raw, full: raw.replace(/\s+/g, ''), initials: raw.replace(/\s+/g, '') };
        const pinyinTool = window.pinyinPro && window.pinyinPro.pinyin;
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
        if (track._searchCache) return track._searchCache;

        const fields = [
            track.title,
            getOfficialSiteTrackDisplayTitle(track),
            track.album,
            track.artist,
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
            compactInitials: pinyinParts.map((item) => item.initials).join('')
        };
        return track._searchCache;
    }

    function matchesOfficialSiteMusicSearch(track, keyword) {
        const term = getOfficialSiteMusicSearchPayload(keyword);
        if (!term.raw) return true;
        const cache = getOfficialSiteMusicTrackSearchCache(track);
        if (cache.text.includes(term.raw) || cache.compactText.includes(term.compact)) return true;
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
            const matched = text.match(/\b(SNH48|BEJ48|GNZ48|CKG48|CGT48)\b/i);
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
        if (typeof fetch === 'function') {
            try {
                const response = await fetch(url, { cache: 'no-store' });
                if (response.ok) {
                    return response.text();
                }
            } catch (error) {
                console.warn('[official-site-music] browser fetch failed, fallback to node https', error);
            }
        }
        return requestOfficialTextWithNode(url);
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

    function getFilteredTracks() {
        const term = state.searchTerm.trim();
        const filtered = state.allTracks.filter((track) => {
            if (state.favoritesOnly && !isOfficialSiteTrackFavorite(track)) return false;
            if (!state.favoritesOnly && state.groupFilter !== 'ALL' && track.groupKey !== state.groupFilter) return false;
            return matchesOfficialSiteMusicSearch(track, term);
        });
        const direction = state.sortDirection === 'desc' ? -1 : 1;
        const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
        return filtered.sort((a, b) => {
            let result = 0;
            if (state.sortKey === 'source') {
                result = a.groupKey === b.groupKey
                    ? a.sourceIndex - b.sourceIndex
                    : collator.compare(a.groupKey, b.groupKey);
            } else if (state.sortKey === 'title') {
                result = collator.compare(a.title || '', b.title || '');
            } else if (state.sortKey === 'group') {
                result = collator.compare(a.groupLabel || '', b.groupLabel || '') || (a.sourceIndex - b.sourceIndex);
            } else if (state.sortKey === 'album') {
                result = collator.compare(a.album || '', b.album || '') || collator.compare(a.title || '', b.title || '');
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
        const dot = $('official-site-music-status-dot');
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
        if (dot) {
            dot.classList.toggle('is-playing', isPlaying);
        }
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
        button.classList.toggle('active', state.playMode !== 'sequence');
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
        linesEl.innerHTML = '';
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

        const lineEls = Array.from(linesEl.children);
        lineEls.forEach((el, index) => {
            el.classList.toggle('active', index === activeIndex);
            el.classList.toggle('past', index < activeIndex);
            el.classList.toggle('near', Math.abs(index - activeIndex) === 1);
            el.classList.toggle('mid', Math.abs(index - activeIndex) === 2);
            el.classList.toggle('far', Math.abs(index - activeIndex) >= 3);
        });

        const activeEl = lineEls[activeIndex];
        if (!activeEl) return;
        if (!force && state.lyricsUserScrolling) return;
        const targetTop = activeEl.offsetTop - (scrollEl.clientHeight / 2) + (activeEl.offsetHeight / 2);
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
        renderOfficialSiteQueue();
        updateFavoriteButton();
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
            cover.src = track && track.coverUrl ? track.coverUrl : './icon.png';
        }
        updateFavoriteButton();
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
        if (Number.isFinite(Number(savedState.volume))) {
            audio.volume = Math.max(0, Math.min(1, Number(savedState.volume)));
        }
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
        updatePlayerProgress();

        const applyTimeAndMaybePlay = () => {
            try {
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                    audio.currentTime = Math.min(resumeTime, Math.max(0, audio.duration - 0.2));
                } else {
                    audio.currentTime = resumeTime;
                }
            } catch (_) { }
            syncOfficialSiteProgressAnchor();
            updatePlayerProgress();
            state.suspendedPlaybackIntent = false;
            saveOfficialSiteMusicPlayerState({ currentTime: resumeTime, wasPlaying: false });
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
            try {
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                    audio.currentTime = Math.min(resumeTime, Math.max(0, audio.duration - 0.2));
                } else {
                    audio.currentTime = resumeTime;
                }
            } catch (_) { }
            syncOfficialSiteProgressAnchor();
            updatePlayerProgress();
            state.suspendedPlaybackIntent = false;
            saveOfficialSiteMusicPlayerState({ currentTime: resumeTime, wasPlaying: false });
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

    function renderOfficialSiteMusic() {
        const list = $('official-site-music-list');
        if (!list) return;

        state.filteredTracks = getFilteredTracks();
        updateFilterButtons();
        setStatus(state.isLoaded
            ? `共 ${state.allTracks.length} 首，当前 ${state.filteredTracks.length} 首`
            : '未加载');

        if (state.isLoading) {
            setEmpty('');
            return;
        }

        if (!state.isLoaded) {
            setStatus(state.errorMessage ? '加载失败' : '未加载');
            setEmpty(state.errorMessage || '');
            return;
        }

        if (state.filteredTracks.length === 0) {
            const emptyText = state.favoritesOnly
                ? (state.searchTerm.trim() ? '没有找到匹配的收藏歌曲' : '还没有收藏歌曲')
                : '没有找到匹配的歌曲';
            list.classList.remove('is-empty');
            list.innerHTML = `
                <div class="official-site-music-table">
                    ${renderOfficialSiteMusicTableHead()}
                    <div class="official-site-music-table-empty">${escapeHtml(emptyText)}</div>
                </div>
            `;
            renderOfficialSiteQueue();
            return;
        }

        list.classList.remove('is-empty');
        list.innerHTML = `
            <div class="official-site-music-table">
                ${renderOfficialSiteMusicTableHead()}
                ${state.filteredTracks.map((track, index) => `
                    <button type="button" class="official-site-music-card${track.id === state.currentTrackId ? ' is-playing' : ''}${isOfficialSiteTrackFavorite(track) ? ' is-favorite' : ''}"
                        data-track-id="${escapeHtml(track.id)}" onclick="playOfficialSiteTrack('${escapeHtml(track.id)}')">
                        <span class="official-site-music-row-index">${String(index + 1).padStart(2, '0')}</span>
                        <span class="official-site-music-song-cell">
                            <span class="official-site-music-index${track.coverUrl ? ' has-cover' : ''}">
                                ${track.coverUrl
                    ? `<img src="${escapeHtml(track.coverUrl)}" alt="">`
                    : `${escapeHtml(track.groupKey)}`}
                            </span>
                            <span class="official-site-music-card-body">
                                <span class="official-site-music-title">${escapeHtml(getOfficialSiteTrackDisplayTitle(track))}</span>
                            </span>
                        </span>
                        <span class="official-site-music-table-text${track.album ? '' : ' is-empty'}">${escapeHtml(getOfficialSiteAlbumDisplayName(track.album) || '-')}</span>
                        <span class="official-site-music-table-text">${escapeHtml(track.groupLabel)}</span>
                        <span class="official-site-music-table-time">${escapeHtml(track.duration || '--:--')}</span>
                    </button>
                `).join('')}
            </div>
        `;
        renderOfficialSiteQueue();
    }

    function renderOfficialSiteMusicTableHead() {
        return `
            <div class="official-site-music-table-head">
                ${renderSortHeader('source', '#')}
                ${renderSortHeader('title', '标题')}
                ${renderSortHeader('album', '专辑')}
                ${renderSortHeader('group', '分团')}
                ${renderSortHeader('duration', '时长')}
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
        if (!listEl || !countEl) return;

        countEl.innerText = `${state.filteredTracks.length} 首`;
        if (!state.filteredTracks.length) {
            listEl.innerHTML = '<div class="empty-state" style="padding:20px;">暂无播放列表</div>';
            return;
        }

        listEl.innerHTML = state.filteredTracks.map((track, index) => `
            <button class="player-queue-item ${track.id === state.currentTrackId ? 'active' : ''}"
                onclick="event.stopPropagation(); playOfficialSiteTrack('${escapeHtml(track.id)}')">
                <span class="player-queue-item-index">${index + 1}</span>
                <div class="player-queue-item-main">
                    <div class="player-queue-item-title">${escapeHtml(getOfficialSiteTrackDisplayTitle(track))}</div>
                    <div class="player-queue-item-sub">${escapeHtml(getTrackSubtitle(track))}</div>
                </div>
                <span class="player-queue-item-time">${escapeHtml(getOfficialSiteAlbumDisplayName(track.album) || '-')}</span>
            </button>
        `).join('');
    }

    async function loadOfficialSiteMusic(options = {}) {
        if (state.isLoading) return;
        if (state.isLoaded && !options.force) {
            renderOfficialSiteMusic();
            restoreOfficialSiteMusicCurrentPosition();
            return;
        }

        state.isLoading = true;
        state.errorMessage = '';
        setStatus('');
        setEmpty('');

        try {
            const results = await Promise.all(GROUPS.map(async (group) => {
                const payload = await loadOfficialPayload(group);
                return buildTracks(group, payload.list, payload.recordsMap, payload.songRecordMap);
            }));
            state.allTracks = results.flat();
            state.isLoaded = true;
            restoreOfficialSiteMusicPlayerState();
            if (state.allTracks.length === 0) {
                setStatus('未读取到曲目');
            }
        } catch (error) {
            console.error('[official-site-music] load failed', error);
            state.isLoaded = false;
            state.errorMessage = error && error.message ? error.message : '官网歌单加载失败';
            setEmpty(state.errorMessage);
            setStatus('加载失败');
            showOfficialMusicToast('音乐源加载失败');
        } finally {
            state.isLoading = false;
            renderOfficialSiteMusic();
        }
    }

    function playOfficialSiteTrack(trackId) {
        const track = state.allTracks.find((item) => item.id === trackId);
        const audio = $('official-site-music-audio');
        if (!track || !audio) return;

        state.currentTrackId = track.id;
        audio.src = track.mp3;
        syncOfficialSiteProgressAnchor();
        updatePlayerProgress();
        saveOfficialSiteMusicPlayerState({ currentTime: 0, wasPlaying: true });
        audio.play().catch((error) => {
            console.warn('[official-site-music] play blocked', error);
            showOfficialMusicToast('播放失败，请稍后重试');
        }).finally(updatePlayerButton);

        updateCurrentTrackDisplay(track);
        updateActiveTrack();
        loadOfficialSiteMusicLyrics(track).catch((error) => {
            console.warn('[official-site-music] 歌词加载失败', error);
        });
    }

    function getCurrentFilteredIndex() {
        return state.filteredTracks.findIndex((track) => track.id === state.currentTrackId);
    }

    function playByOffset(offset) {
        if (!state.filteredTracks.length) return;
        if (state.playMode === 'shuffle' && state.filteredTracks.length > 1) {
            const currentIndex = getCurrentFilteredIndex();
            let nextIndex = currentIndex;
            while (nextIndex === currentIndex) {
                nextIndex = Math.floor(Math.random() * state.filteredTracks.length);
            }
            playOfficialSiteTrack(state.filteredTracks[nextIndex].id);
            return;
        }
        const currentIndex = getCurrentFilteredIndex();
        const baseIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = (baseIndex + offset + state.filteredTracks.length) % state.filteredTracks.length;
        playOfficialSiteTrack(state.filteredTracks[nextIndex].id);
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

        if (!state.currentTrackId && state.filteredTracks.length) {
            playOfficialSiteTrack(state.filteredTracks[0].id);
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
        saveOfficialSiteMusicPlayerState({ currentTime: nextTime });
    }

    function cycleOfficialSiteMusicPlayMode() {
        state.playMode = getNextPlayMode(state.playMode);
        updatePlayModeButton();
        saveOfficialSiteMusicPlayerState();
        showOfficialMusicToast(`音乐播放模式：${PLAYER_MODE_LABELS[state.playMode]}`);
    }

    function closeOfficialSiteMusicQueue() {
        const panel = $('official-site-music-player-queue');
        if (panel) panel.style.display = 'none';
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
        panel.style.display = 'block';
        setTimeout(() => {
            document.addEventListener('click', handleOfficialSiteMusicQueueOutsideClick);
        }, 0);
        if (shouldOpen) {
            renderOfficialSiteQueue();
        }
    }

    function setOfficialSiteMusicVolume(value) {
        const audio = $('official-site-music-audio');
        if (!audio) return;
        const volume = Math.max(0, Math.min(1, Number(value)));
        audio.volume = Number.isFinite(volume) ? volume : 1;
        audio.muted = audio.volume === 0;
        if (audio.volume > 0) state.previousVolume = audio.volume;
        writeStringSetting('yaya_music_volume', String(audio.volume));
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
            audio.volume = state.previousVolume || 1;
        }
        writeStringSetting('yaya_music_volume', String(audio.volume));
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
        renderOfficialSiteMusic();
    }

    function setOfficialSiteMusicGroupFilter(groupKey) {
        state.groupFilter = groupKey || 'ALL';
        state.favoritesOnly = false;
        renderOfficialSiteMusic();
    }

    function toggleOfficialSiteMusicFavoritesFilter() {
        state.favoritesOnly = !state.favoritesOnly;
        if (!state.favoritesOnly) {
            state.groupFilter = 'ALL';
        }
        renderOfficialSiteMusic();
    }

    function toggleOfficialSiteMusicFavorite() {
        const track = getCurrentOfficialSiteTrack();
        if (!track) {
            showOfficialMusicToast('请先选择一首歌曲');
            return;
        }

        const key = getOfficialSiteTrackFavoriteKey(track);
        if (!key) return;

        if (state.favoriteTrackKeys.has(key)) {
            state.favoriteTrackKeys.delete(key);
            showOfficialMusicToast('已取消收藏');
        } else {
            state.favoriteTrackKeys.add(key);
            showOfficialMusicToast('已收藏');
        }

        saveOfficialSiteMusicFavorites();
        updateFavoriteUi();
        renderOfficialSiteMusic();
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
        const volumeBar = $('official-site-music-volume-bar');
        const progressBar = $('official-site-music-progress');
        const lyricsScroll = $('official-site-music-lyrics-scroll');
        const savedVolume = readStringSetting('yaya_music_volume', '');
        if (savedVolume !== '') {
            const volume = parseFloat(savedVolume);
            if (Number.isFinite(volume)) {
                audio.volume = Math.max(0, Math.min(1, volume));
            }
        }
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
        });
        audio.addEventListener('waiting', () => {
            syncOfficialSiteProgressAnchor();
            stopOfficialSiteProgressAnimation();
            updatePlayerProgress(false);
        });
        audio.addEventListener('seeking', syncOfficialSiteProgressAnchor);
        audio.addEventListener('seeked', syncOfficialSiteProgressAnchor);
        audio.addEventListener('ratechange', syncOfficialSiteProgressAnchor);
        audio.addEventListener('volumechange', () => {
            updateVolumeUI();
            requestOfficialSiteMusicPlayerStateSave();
        });
        audio.addEventListener('ended', () => {
            updatePlayerButton();
            stopOfficialSiteProgressAnimation();
            updatePlayerProgress();
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
                const step = event.deltaY < 0 ? 0.05 : -0.05;
                const nextVolume = Math.max(0, Math.min(1, (audio.muted ? 0 : audio.volume) + step));
                audio.volume = nextVolume;
                audio.muted = false;
                volumeBar.value = String(nextVolume);
                state.previousVolume = nextVolume || state.previousVolume;
                writeStringSetting('yaya_music_volume', String(nextVolume));
                updateVolumeUI();
            }, { passive: false });
        }
        if (lyricsScroll) {
            lyricsScroll.addEventListener('wheel', handleOfficialSiteLyricsUserScroll, { passive: true });
        }
    }

    function initWhenReady() {
        state.favoriteTrackKeys = readOfficialSiteMusicFavorites();
        const savedState = readOfficialSiteMusicPlayerState();
        if (PLAYER_MODE_ORDER.includes(savedState.playMode)) {
            state.playMode = savedState.playMode;
        }
        initOfficialSiteMusicAudio();
        updatePlayModeButton();
        updateVolumeUI();
        updateOfficialSiteMusicLyricsButton();
        renderOfficialSiteMusic();
        window.addEventListener('beforeunload', () => {
            if (state.playerStateSaveTimer) {
                clearTimeout(state.playerStateSaveTimer);
                state.playerStateSaveTimer = null;
            }
            const audio = $('official-site-music-audio');
            if (!state.currentTrackId && !audio?.src && !state.suspendedPlaybackIntent) return;
            saveOfficialSiteMusicPlayerState({
                wasPlaying: state.suspendedPlaybackIntent || Boolean(audio && !audio.paused && !audio.ended)
            });
        });
    }

    window.loadOfficialSiteMusic = loadOfficialSiteMusic;
    window.playOfficialSiteTrack = playOfficialSiteTrack;
    window.playOfficialSiteNext = playOfficialSiteNext;
    window.playOfficialSitePrevious = playOfficialSitePrevious;
    window.toggleOfficialSiteMusicPlay = toggleOfficialSiteMusicPlay;
    window.seekOfficialSiteMusic = seekOfficialSiteMusic;
    window.cycleOfficialSiteMusicPlayMode = cycleOfficialSiteMusicPlayMode;
    window.toggleOfficialSiteMusicQueue = toggleOfficialSiteMusicQueue;
    window.setOfficialSiteMusicVolume = setOfficialSiteMusicVolume;
    window.toggleOfficialSiteMusicMute = toggleOfficialSiteMusicMute;
    window.suspendOfficialSiteMusicForViewSwitch = suspendOfficialSiteMusicForViewSwitch;
    window.toggleOfficialSiteMusicLyricsPanel = toggleOfficialSiteMusicLyricsPanel;
    window.seekOfficialSiteMusicLyricLine = seekOfficialSiteMusicLyricLine;
    window.handleOfficialSiteMusicSearch = handleOfficialSiteMusicSearch;
    window.setOfficialSiteMusicGroupFilter = setOfficialSiteMusicGroupFilter;
    window.toggleOfficialSiteMusicFavoritesFilter = toggleOfficialSiteMusicFavoritesFilter;
    window.toggleOfficialSiteMusicFavorite = toggleOfficialSiteMusicFavorite;
    window.sortOfficialSiteMusic = sortOfficialSiteMusic;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWhenReady, { once: true });
    } else {
        initWhenReady();
    }
})();
