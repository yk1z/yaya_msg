(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createOfficialMediaFeature = function createOfficialMediaFeature(deps) {
        const {
            escapeHtml,
            fetchPocketAPI,
            getCurrentViewMode,
            getCurrentViewName,
            getCurrentPlayingVideo,
            getPlaybackViewToken,
            loadMusicLyrics,
            showToast,
            syncMusicLyrics,
            toggleMusicLyricsPanel,
            updateMusicLyricsToggleButton
        } = deps;

        const PLAYER_MODE_ORDER = ['sequence', 'loop-one', 'shuffle'];
        const PLAYER_MODE_LABELS = {
            'sequence': '顺序',
            'loop-one': '单曲',
            'shuffle': '随机'
        };

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

        function escapeMediaHtml(value) {
            return escapeHtml(String(value ?? ''));
        }

        function readAudioProgramPlayerState() {
            try {
                const parsed = JSON.parse(readStringSetting(AUDIO_PROGRAM_PLAYER_STATE_KEY, '{}') || '{}');
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (_) {
                return {};
            }
        }

        function getCurrentAudioProgramPlaylistItem() {
            if (!currentAudioProgramTalkId) return null;
            return audioProgramPlaylist.find(item => String(item.talkId) === String(currentAudioProgramTalkId)) || null;
        }

        function saveAudioProgramPlayerState(options = {}) {
            const audioEl = document.getElementById('native-audio-player');
            const currentItem = getCurrentAudioProgramPlaylistItem();
            const existingState = currentItem ? {} : readAudioProgramPlayerState();
            const currentTime = Number.isFinite(Number(options.currentTime))
                ? Number(options.currentTime)
                : (audioEl && Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : Number(existingState.currentTime) || 0);
            const payload = {
                talkId: currentItem ? currentItem.talkId : (currentAudioProgramTalkId || existingState.talkId || ''),
                title: currentItem ? currentItem.title : String(existingState.title || ''),
                coverUrl: currentItem ? currentItem.coverUrl : String(existingState.coverUrl || ''),
                subTitle: currentItem ? currentItem.subTitle : String(existingState.subTitle || ''),
                currentTime: Math.max(0, currentTime || 0),
                playMode: PLAYER_MODE_ORDER.includes(currentAudioProgramPlayMode) ? currentAudioProgramPlayMode : 'sequence',
                volume: audioEl ? audioEl.volume : Number(existingState.volume) || 1,
                muted: audioEl ? Boolean(audioEl.muted) : Boolean(existingState.muted),
                updatedAt: Date.now()
            };
            writeStringSetting(AUDIO_PROGRAM_PLAYER_STATE_KEY, JSON.stringify(payload));
            audioProgramLastStateSavedAt = Date.now();
        }

        function requestAudioProgramPlayerStateSave() {
            const now = Date.now();
            const elapsed = now - audioProgramLastStateSavedAt;
            if (elapsed >= 2000) {
                saveAudioProgramPlayerState();
                return;
            }
            if (audioProgramStateSaveTimer) return;
            audioProgramStateSaveTimer = setTimeout(() => {
                audioProgramStateSaveTimer = null;
                saveAudioProgramPlayerState();
            }, Math.max(250, 2000 - elapsed));
        }

        let currentAudioCtime = 0;
        let isAudioLoading = false;
        let audioProgramPlaylist = [];
        let currentAudioProgramTalkId = null;
        let currentAudioProgramPlayMode = readStringSetting('yaya_audio_program_play_mode', 'sequence');
        let currentAudioPlayRequestId = 0;
        const AUDIO_PROGRAM_PLAYER_STATE_KEY = 'yaya_audio_program_player_state';
        let audioProgramStateSaveTimer = null;
        let audioProgramLastStateSavedAt = 0;
        let audioProgramRestoring = false;

        let musicPlaylist = [];
        let currentMusicPlayMode = readStringSetting('yaya_music_play_mode', 'sequence');
        let currentVideoPlayRequestId = 0;

        function capturePlaybackViewContext() {
            return {
                token: typeof getPlaybackViewToken === 'function' ? getPlaybackViewToken() : 0,
                viewName: typeof getCurrentViewName === 'function' ? getCurrentViewName() : '',
                viewMode: typeof getCurrentViewMode === 'function' ? getCurrentViewMode() : null
            };
        }

        function isPlaybackViewContextActive(context, expectedViewName = null, expectedViewMode = null) {
            if (!context) return false;
            if (typeof getPlaybackViewToken === 'function' && context.token !== getPlaybackViewToken()) return false;
            if (typeof getCurrentViewName === 'function' && context.viewName !== getCurrentViewName()) return false;
            if (typeof getCurrentViewMode === 'function' && context.viewMode !== getCurrentViewMode()) return false;
            if (expectedViewName !== null && typeof getCurrentViewName === 'function' && getCurrentViewName() !== expectedViewName) return false;
            if (expectedViewMode !== null && typeof getCurrentViewMode === 'function' && getCurrentViewMode() !== expectedViewMode) return false;
            return true;
        }

        function getPlayerModeLabel(mode) {
            return PLAYER_MODE_LABELS[mode] || PLAYER_MODE_LABELS.sequence;
        }

        function getPlayerModeIconSvg(mode) {
            if (mode === 'loop-one') {
                return `
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M17 17H7a4 4 0 0 1-4-4" />
                        <path d="M7 7h10a4 4 0 0 1 4 4" />
                        <path d="M17 4l3 3-3 3" />
                        <path d="M7 14l-3 3 3 3" />
                        <path d="M12 9v6" />
                        <path d="M10.5 10.5L12 9l1.5 1.5" />
                    </svg>`;
            }
            if (mode === 'shuffle') {
                return `
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M16 3h5v5" />
                        <path d="M4 20l6.5-6.5" />
                        <path d="M14 7l2-2h5" />
                        <path d="M4 4l16 16" />
                    </svg>`;
            }
            return `
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h14" />
                    <path d="M15 4l3 3-3 3" />
                    <path d="M20 17H6" />
                    <path d="M9 14l-3 3 3 3" />
                </svg>`;
        }

        function getNextPlayMode(mode) {
            const index = PLAYER_MODE_ORDER.indexOf(mode);
            return PLAYER_MODE_ORDER[(index + 1) % PLAYER_MODE_ORDER.length];
        }

        function getSearchPinyinPayload(value) {
            const raw = String(value || '').trim().toLowerCase();
            const payload = {
                raw,
                full: raw,
                initials: raw
            };

            if (!window.pinyinPro || !raw) {
                return payload;
            }

            const pinyinArray = pinyinPro.pinyin(raw, {
                toneType: 'none',
                type: 'array'
            }).map(item => String(item || '').toLowerCase());

            payload.full = pinyinArray.join('');
            payload.initials = pinyinArray.map(item => item.charAt(0)).join('');
            return payload;
        }

        function ensureCardSearchCache(card, text) {
            if (!card) return { text: '', full: '', initials: '' };

            if (card._searchCache) {
                return card._searchCache;
            }

            const normalizedText = String(text || '').toLowerCase();
            const cache = {
                text: normalizedText,
                full: normalizedText,
                initials: normalizedText
            };

            if (window.pinyinPro && normalizedText) {
                const pinyinArray = pinyinPro.pinyin(normalizedText, {
                    toneType: 'none',
                    type: 'array'
                }).map(item => String(item || '').toLowerCase());

                cache.full = pinyinArray.join('');
                cache.initials = pinyinArray.map(item => item.charAt(0)).join('');
            }

            card._searchCache = cache;
            return cache;
        }

        function matchesSearchKeyword(card, keyword) {
            const term = getSearchPinyinPayload(keyword);
            if (!term.raw) return true;

            const cache = ensureCardSearchCache(card, card?.textContent || '');
            if (cache.text.includes(term.raw)) return true;
            if (!window.pinyinPro) return false;
            if (!/^[a-z]+$/.test(term.raw)) return false;
            if (cache.full.includes(term.full)) return true;
            if (cache.initials.includes(term.raw) || cache.initials.includes(term.initials)) return true;
            return false;
        }

        function updateAudioProgramPlayModeButton() {
            const btn = document.getElementById('audio-play-mode-btn');
            if (!btn) return;
            btn.innerHTML = getPlayerModeIconSvg(currentAudioProgramPlayMode);
            btn.title = `当前模式：${getPlayerModeLabel(currentAudioProgramPlayMode)}`;
            btn.classList.toggle('active', currentAudioProgramPlayMode !== 'sequence');
        }

        function updateMusicPlayModeButton() {
            const btn = document.getElementById('music-play-mode-btn');
            if (!btn) return;
            btn.innerHTML = getPlayerModeIconSvg(currentMusicPlayMode);
            btn.title = `当前模式：${getPlayerModeLabel(currentMusicPlayMode)}`;
            btn.classList.toggle('active', currentMusicPlayMode !== 'sequence');
        }

        function cycleAudioProgramPlayMode() {
            currentAudioProgramPlayMode = getNextPlayMode(currentAudioProgramPlayMode);
            writeStringSetting('yaya_audio_program_play_mode', currentAudioProgramPlayMode);
            saveAudioProgramPlayerState();
            updateAudioProgramPlayModeButton();
            showToast(`电台播放模式：${getPlayerModeLabel(currentAudioProgramPlayMode)}`);
        }

        function cycleMusicPlayMode() {
            currentMusicPlayMode = getNextPlayMode(currentMusicPlayMode);
            writeStringSetting('yaya_music_play_mode', currentMusicPlayMode);
            updateMusicPlayModeButton();
            showToast(`音乐播放模式：${getPlayerModeLabel(currentMusicPlayMode)}`);
        }

        function closeAudioProgramQueue() {
            const panel = document.getElementById('audio-player-queue');
            if (panel) panel.style.display = 'none';
            document.removeEventListener('click', handleAudioProgramQueueOutsideClick);
        }

        function handleAudioProgramQueueOutsideClick(event) {
            const panel = document.getElementById('audio-player-queue');
            const button = document.getElementById('audio-playlist-btn');
            const target = event.target;
            if (!panel || panel.style.display === 'none') {
                document.removeEventListener('click', handleAudioProgramQueueOutsideClick);
                return;
            }
            if ((panel && panel.contains(target)) || (button && button.contains(target))) return;
            closeAudioProgramQueue();
        }

        function toggleAudioProgramQueue() {
            const panel = document.getElementById('audio-player-queue');
            if (!panel) return;
            const shouldOpen = panel.style.display === 'none' || !panel.style.display;
            if (!shouldOpen) {
                closeAudioProgramQueue();
                return;
            }
            panel.style.display = 'block';
            setTimeout(() => {
                document.addEventListener('click', handleAudioProgramQueueOutsideClick);
            }, 0);
            renderAudioProgramQueue();
        }

        function toggleMusicQueue() {
            const panel = document.getElementById('music-player-queue');
            if (!panel) return;
            const shouldOpen = panel.style.display === 'none' || !panel.style.display;
            panel.style.display = shouldOpen ? 'block' : 'none';
            if (shouldOpen) {
                toggleMusicLyricsPanel(false);
            }
        }

        function renderAudioProgramQueue() {
            const listEl = document.getElementById('audio-player-queue-list');
            const countEl = document.getElementById('audio-player-queue-count');
            if (!listEl || !countEl) return;

            countEl.innerText = `${audioProgramPlaylist.length} 首`;

            if (!audioProgramPlaylist.length) {
                listEl.innerHTML = '<div class="empty-state" style="padding:20px;">暂无播放列表</div>';
                return;
            }

            listEl.innerHTML = audioProgramPlaylist.map((item, index) => `
                <button class="player-queue-item ${String(item.talkId) === String(currentAudioProgramTalkId) ? 'active' : ''}" onclick="event.stopPropagation(); playAudioProgram(${item.talkId})">
                    <span class="player-queue-item-index">${index + 1}</span>
                    <div class="player-queue-item-main">
                        <div class="player-queue-item-title">${escapeMediaHtml(item.title || '未命名节目')}</div>
                        <div class="player-queue-item-sub">${escapeMediaHtml(item.subTitle || '口袋电台')}</div>
                    </div>
                    <span class="player-queue-item-time">${escapeMediaHtml(item.dateStr || '')}</span>
                </button>
            `).join('');
        }

        function updateAudioProgramRows() {
            document.querySelectorAll('.audio-program-row').forEach(row => {
                row.classList.toggle('is-playing', String(row.dataset.id) === String(currentAudioProgramTalkId));
            });
        }

        function renderMusicQueue() {
            const listEl = document.getElementById('music-player-queue-list');
            const countEl = document.getElementById('music-player-queue-count');
            if (!listEl || !countEl) return;

            countEl.innerText = `${musicPlaylist.length} 首`;

            if (!musicPlaylist.length) {
                listEl.innerHTML = '<div class="empty-state" style="padding:20px;">暂无播放列表</div>';
                return;
            }

            listEl.innerHTML = musicPlaylist.map((item, index) => `
                <button class="player-queue-item ${String(item.musicId) === String(currentPlayingMusicId) ? 'active' : ''}" onclick="playOfficialMusic(${item.musicId})">
                    <span class="player-queue-item-index">${index + 1}</span>
                    <div class="player-queue-item-main">
                        <div class="player-queue-item-title">${escapeMediaHtml(item.title || '未命名歌曲')}</div>
                        <div class="player-queue-item-sub">${escapeMediaHtml(item.subTitle || item.joinMemberNames || '官方单曲')}</div>
                    </div>
                    <span class="player-queue-item-time">${escapeMediaHtml(item.dateStr || '')}</span>
                </button>
            `).join('');
        }

        function getNextAudioProgramItem(options = {}) {
            const { ignoreLoopOne = false } = options;
            if (!audioProgramPlaylist.length) return null;
            const currentIndex = audioProgramPlaylist.findIndex(item => String(item.talkId) === String(currentAudioProgramTalkId));
            if (currentIndex === -1) return audioProgramPlaylist[0];

            if (currentAudioProgramPlayMode === 'loop-one' && !ignoreLoopOne) {
                return audioProgramPlaylist[currentIndex];
            }
            if (currentAudioProgramPlayMode === 'shuffle') {
                if (audioProgramPlaylist.length === 1) return audioProgramPlaylist[0];
                let nextIndex = currentIndex;
                while (nextIndex === currentIndex) {
                    nextIndex = Math.floor(Math.random() * audioProgramPlaylist.length);
                }
                return audioProgramPlaylist[nextIndex];
            }
            if (currentIndex + 1 >= audioProgramPlaylist.length) return null;
            return audioProgramPlaylist[currentIndex + 1];
        }

        function getPreviousAudioProgramItem(options = {}) {
            const { ignoreLoopOne = false } = options;
            if (!audioProgramPlaylist.length) return null;
            const currentIndex = audioProgramPlaylist.findIndex(item => String(item.talkId) === String(currentAudioProgramTalkId));
            if (currentIndex === -1) return audioProgramPlaylist[0];

            if (currentAudioProgramPlayMode === 'loop-one' && !ignoreLoopOne) {
                return audioProgramPlaylist[currentIndex];
            }
            if (currentAudioProgramPlayMode === 'shuffle') {
                if (audioProgramPlaylist.length === 1) return audioProgramPlaylist[0];
                let prevIndex = currentIndex;
                while (prevIndex === currentIndex) {
                    prevIndex = Math.floor(Math.random() * audioProgramPlaylist.length);
                }
                return audioProgramPlaylist[prevIndex];
            }
            if (currentIndex - 1 < 0) return null;
            return audioProgramPlaylist[currentIndex - 1];
        }

        function getNextMusicItem(options = {}) {
            const { ignoreLoopOne = false } = options;
            if (!musicPlaylist.length) return null;
            const currentIndex = musicPlaylist.findIndex(item => String(item.musicId) === String(currentPlayingMusicId));
            if (currentIndex === -1) return musicPlaylist[0];

            if (currentMusicPlayMode === 'loop-one' && !ignoreLoopOne) {
                return musicPlaylist[currentIndex];
            }
            if (currentMusicPlayMode === 'shuffle') {
                if (musicPlaylist.length === 1) return musicPlaylist[0];
                let nextIndex = currentIndex;
                while (nextIndex === currentIndex) {
                    nextIndex = Math.floor(Math.random() * musicPlaylist.length);
                }
                return musicPlaylist[nextIndex];
            }
            if (currentIndex + 1 >= musicPlaylist.length) return null;
            return musicPlaylist[currentIndex + 1];
        }

        function getPreviousMusicItem(options = {}) {
            const { ignoreLoopOne = false } = options;
            if (!musicPlaylist.length) return null;
            const currentIndex = musicPlaylist.findIndex(item => String(item.musicId) === String(currentPlayingMusicId));
            if (currentIndex === -1) return musicPlaylist[0];

            if (currentMusicPlayMode === 'loop-one' && !ignoreLoopOne) {
                return musicPlaylist[currentIndex];
            }
            if (currentMusicPlayMode === 'shuffle') {
                if (musicPlaylist.length === 1) return musicPlaylist[0];
                let prevIndex = currentIndex;
                while (prevIndex === currentIndex) {
                    prevIndex = Math.floor(Math.random() * musicPlaylist.length);
                }
                return musicPlaylist[prevIndex];
            }
            if (currentIndex - 1 < 0) return null;
            return musicPlaylist[currentIndex - 1];
        }

        function playPreviousAudioProgram() {
            const previousItem = getPreviousAudioProgramItem({ ignoreLoopOne: true });
            if (!previousItem) {
                showToast('已经是第一期了');
                return;
            }
            playAudioProgram(previousItem.talkId);
        }

        function playNextAudioProgram() {
            const nextItem = getNextAudioProgramItem({ ignoreLoopOne: true });
            if (!nextItem) {
                showToast('已经是最后一期了');
                return;
            }
            playAudioProgram(nextItem.talkId);
        }

        function playPreviousMusic() {
            const previousItem = getPreviousMusicItem({ ignoreLoopOne: true });
            if (!previousItem) {
                showToast('已经是第一首了');
                return;
            }
            playOfficialMusic(previousItem.musicId);
        }

        function playNextMusic() {
            const nextItem = getNextMusicItem({ ignoreLoopOne: true });
            if (!nextItem) {
                showToast('已经是最后一首了');
                return;
            }
            playOfficialMusic(nextItem.musicId);
        }

        async function loadAudioPrograms(startCtime = 0) {
            if (isAudioLoading) return;
            isAudioLoading = true;

            const container = document.getElementById('audio-programs-list');
            const statusEl = document.getElementById('audio-programs-status');

            if (startCtime === 0) {
                container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">正在连接服务器...</div>';
            }

            let currentCtime = startCtime;
            let totalCount = 0;
            let hasMore = true;

            try {
                if (startCtime === 0) {
                    container.innerHTML = '';
                    audioProgramPlaylist = [];
                    renderAudioProgramQueue();
                }

                while (hasMore) {

                    const res = await fetchPocketAPI('/media/api/media/v1/talk/list', JSON.stringify({
                        ctime: currentCtime,
                        groupId: 0,
                        limit: 20
                    }));

                    if (res && res.success && res.content) {
                        const data = res.content.data || [];

                        if (data.length === 0) {
                            hasMore = false;
                            if (totalCount === 0) {
                                container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">暂无节目</div>';
                            }
                            break;
                        }

                        totalCount += data.length;

                        if (!container.querySelector('.audio-program-table-head')) {
                            const tableHead = document.createElement('div');
                            tableHead.className = 'audio-program-table-head';
                            tableHead.innerHTML = `
                                <span>#</span>
                                <span>标题</span>
                                <span>节目</span>
                                <span>日期</span>
                            `;
                            container.appendChild(tableHead);
                        }

                        data.forEach(item => {
                            const coverUrl = item.thumbPath ? `https://source.48.cn${item.thumbPath}` : '';
                            const dateStr = formatFullTime(item.ctime).split(' ')[0];
                            const playlistItem = {
                                talkId: item.talkId,
                                title: item.title,
                                coverUrl,
                                subTitle: item.subTitle || item.guest || '口袋电台',
                                dateStr
                            };
                            if (!audioProgramPlaylist.some(existing => String(existing.talkId) === String(item.talkId))) {
                                audioProgramPlaylist.push(playlistItem);
                            }

                            const realSubtitle = item.subTitle || '口袋电台';
                            const guestText = item.guest || '';
                            const rowIndex = audioProgramPlaylist.findIndex(existing => String(existing.talkId) === String(item.talkId)) + 1;

                            const card = document.createElement('button');
                            card.type = 'button';
                            card.className = 'audio-program-row';
                            card.dataset.id = item.talkId;
                            card.innerHTML = `
                                <span class="audio-program-row-index">${String(rowIndex).padStart(2, '0')}</span>
                                <span class="audio-program-title-cell">
                                    <span class="audio-program-cover${coverUrl ? '' : ' is-empty'}">
                                        ${coverUrl ? `<img src="${escapeMediaHtml(coverUrl)}" loading="lazy" alt="">` : '电台'}
                                    </span>
                                    <span class="audio-program-title-group">
                                        <span class="audio-program-title">${escapeMediaHtml(item.title || '未命名节目')}</span>
                                        <span class="audio-program-subtitle">${escapeMediaHtml(guestText || realSubtitle)}</span>
                                    </span>
                                </span>
                                <span class="audio-program-table-text">${escapeMediaHtml(realSubtitle)}</span>
                                <span class="audio-program-table-date">${escapeMediaHtml(dateStr)}</span>
                            `;

                            card.onclick = () => playAudioProgram(item.talkId);
                            container.appendChild(card);
                        });
                        renderAudioProgramQueue();
                        currentCtime = data[data.length - 1].ctime;

                        const searchInput = document.getElementById('audio-inner-search');
                        if (searchInput && searchInput.value.trim() !== '') {
                            handleAudioSearch(searchInput.value);
                        }

                        await new Promise(resolve => setTimeout(resolve, 300));

                    } else {
                        hasMore = false;
                        const errorMsg = document.createElement('div');
                        errorMsg.className = 'empty-state';
                        errorMsg.style.cssText = 'grid-column: 1 / -1; color: #ff4d4f;';
                        errorMsg.innerText = `加载中断: ${res ? res.message : '网络错误'}`;
                        container.appendChild(errorMsg);
                    }
                }
            } catch (e) {
                const errorMsg = document.createElement('div');
                errorMsg.className = 'empty-state';
                errorMsg.style.cssText = 'grid-column: 1 / -1; color: #ff4d4f;';
                errorMsg.innerText = `请求出错: ${e.message}`;
                container.appendChild(errorMsg);
            } finally {
                isAudioLoading = false;
                if (statusEl) statusEl.innerText = ``;
            }
        }

        async function playAudioProgram(talkId, title, coverUrl, subTitle, options = {}) {
            const requestId = ++currentAudioPlayRequestId;
            const playContext = capturePlaybackViewContext();
            const shouldAutoplay = options.autoplay !== false;
            const resumeTime = Math.max(0, Number(options.resumeTime) || 0);
            try {
                const playlistItem = audioProgramPlaylist.find(item => String(item.talkId) === String(talkId));
                if (playlistItem) {
                    title = playlistItem.title;
                    coverUrl = playlistItem.coverUrl;
                    subTitle = playlistItem.subTitle;
                }

                const res = await fetchPocketAPI('/media/api/media/v1/talk', JSON.stringify({ resId: talkId.toString() }));
                if (requestId !== currentAudioPlayRequestId) return;
                if (!isPlaybackViewContextActive(playContext, 'audio-programs')) return;

                if (res && res.success && res.content) {
                    const filePath = (res.content.data && res.content.data.filePath) || res.content.filePath;
                    if (!filePath) return showToast('❌ 未找到该节目的音频文件');
                    currentAudioProgramTalkId = talkId;
                    updateAudioProgramRows();

                    document.getElementById('audio-player-bar').style.display = 'flex';
                    document.getElementById('audio-player-cover').src = coverUrl;
                    document.getElementById('audio-player-title').innerText = title;
                    const subTitleEl = document.getElementById('audio-player-subtitle');
                    subTitleEl.innerText = '正在解析地址...';

                    const cleanPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;

                    const tryUrls = filePath.startsWith('http') ? [filePath] : [
                        `https://mp4.48.cn/nightwords/${cleanPath}`,
                        `https://mp4.48.cn/${cleanPath}`,
                        `https://source.48.cn/audio/${cleanPath}`,
                        `https://source.48.cn/${cleanPath}`
                    ];

                    const audioEl = document.getElementById('native-audio-player');
                    const coverEl = document.getElementById('audio-player-cover');
                    const dotEl = document.getElementById('audio-status-dot');
                    let currentUrlIndex = 0;

                    if (typeof initCustomAudioUI === 'function') {
                        initCustomAudioUI();
                        updateAudioProgramPlayModeButton();
                        renderAudioProgramQueue();

                        const progressBar = document.getElementById('custom-progress-bar');
                        if (progressBar) {
                            progressBar.value = 0;
                        }
                        const progressFill = document.getElementById('audio-program-progress-fill');
                        if (progressFill) {
                            progressFill.style.setProperty('--progress-scale', '0');
                        }
                        const timeCurrent = document.getElementById('custom-time-current');
                        if (timeCurrent) timeCurrent.innerText = "00:00";
                        const timeDuration = document.getElementById('custom-time-duration');
                        if (timeDuration) timeDuration.innerText = "00:00";
                    }

                    audioEl.onerror = null;
                    audioEl.onplaying = null;
                    audioEl.onpause = null;

                    if (dotEl) {
                        dotEl.style.background = '#17a2b8';
                        dotEl.style.boxShadow = '0 0 6px #17a2b8';
                    }
                    if (coverEl) coverEl.classList.add('vinyl-pause');

                    audioEl.onplaying = () => {
                        if (requestId !== currentAudioPlayRequestId) return;
                        subTitleEl.innerText = subTitle || '正在播放';

                        if (coverEl) coverEl.classList.remove('vinyl-pause');
                        if (dotEl) {
                            dotEl.style.background = '#28a745';
                            dotEl.style.boxShadow = '0 0 6px #28a745';
                        }
                    };

                    audioEl.onpause = () => {
                        if (requestId !== currentAudioPlayRequestId) return;
                        if (coverEl) coverEl.classList.add('vinyl-pause');
                        if (dotEl) {
                            dotEl.style.background = '#ffc107';
                            dotEl.style.boxShadow = '0 0 6px #ffc107';
                        }
                    };

                    audioEl.onerror = () => {
                        if (requestId !== currentAudioPlayRequestId) return;
                        currentUrlIndex++;
                        if (currentUrlIndex < tryUrls.length) {
                            console.log(`[电台播放] 节点失效，尝试备用线路 (${currentUrlIndex + 1}/${tryUrls.length})`);
                            subTitleEl.innerText = `切换线路 (${currentUrlIndex + 1}/${tryUrls.length})...`;

                            if (dotEl) {
                                dotEl.style.background = '#ffc107';
                                dotEl.style.boxShadow = '0 0 6px #ffc107';
                            }

                            audioEl.src = tryUrls[currentUrlIndex];
                            if (shouldAutoplay) {
                                audioEl.play().catch(e => { });
                            } else {
                                audioEl.load();
                            }
                        } else {
                            showToast('❌ 无法播放，该节目文件可能已在服务器下线');
                            subTitleEl.innerText = '加载失败 (文件已失效)';

                            if (dotEl) {
                                dotEl.style.background = '#dc3545';
                                dotEl.style.boxShadow = '0 0 6px #dc3545';
                            }
                            if (coverEl) coverEl.classList.add('vinyl-pause');
                        }
                    };

                    audioEl.src = tryUrls[0];
                    const applyResumeTime = () => {
                        if (requestId !== currentAudioPlayRequestId) return;
                        if (resumeTime > 0) {
                            try {
                                if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
                                    audioEl.currentTime = Math.min(resumeTime, Math.max(0, audioEl.duration - 0.2));
                                } else {
                                    audioEl.currentTime = resumeTime;
                                }
                            } catch (_) { }
                        }
                        saveAudioProgramPlayerState({ currentTime: resumeTime });
                        if (!shouldAutoplay) {
                            subTitleEl.innerText = subTitle || '已暂停';
                        }
                    };
                    if (audioEl.readyState >= 1) {
                        applyResumeTime();
                    } else {
                        audioEl.addEventListener('loadedmetadata', applyResumeTime, { once: true });
                        audioEl.load();
                    }
                    if (shouldAutoplay) {
                        audioEl.play().catch(e => {
                            if (requestId !== currentAudioPlayRequestId) return;
                            console.warn('浏览器可能拦截了自动播放，需用户手动点击播放键', e);
                        });
                    }

                } else {
                    showToast('获取音频详情失败');
                }
            } catch (e) {
                showToast('获取详情出错: ' + e.message);
            }
        }

        function formatFullTime(timestamp) {
            if (!timestamp) return "未知时间";
            const d = new Date(Number(timestamp));
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }

        let isCustomAudioUISetup = false;

        function initCustomAudioUI() {
            if (isCustomAudioUISetup) return;
            isCustomAudioUISetup = true;

            const audioEl = document.getElementById('native-audio-player');
            const playBtn = document.getElementById('custom-play-btn');
            const progressBar = document.getElementById('custom-progress-bar');
            const progressFill = document.getElementById('audio-program-progress-fill');
            const progressTooltip = document.getElementById('audio-program-progress-tooltip');
            const timeCurrent = document.getElementById('custom-time-current');
            const timeDuration = document.getElementById('custom-time-duration');

            const volumeIcon = document.getElementById('audio-volume-icon');
            const volumeBar = document.getElementById('audio-volume-bar');

            const getAudioProgramVolumeIconSvg = (level) => {
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
            };

            updateAudioProgramPlayModeButton();

            const formatTime = (seconds) => {
                if (!seconds || isNaN(seconds)) return "00:00";
                const m = Math.floor(seconds / 60).toString().padStart(2, '0');
                const s = Math.floor(seconds % 60).toString().padStart(2, '0');
                return `${m}:${s}`;
            };
            let audioProgramProgressFrame = null;
            let audioProgramProgressAnchorTime = 0;
            let audioProgramProgressAnchorStamp = 0;

            const syncAudioProgramProgressAnchor = () => {
                audioProgramProgressAnchorTime = audioEl ? (audioEl.currentTime || 0) : 0;
                audioProgramProgressAnchorStamp = performance.now();
            };

            const getAudioProgramProgressDisplayTime = () => {
                if (!audioEl) return 0;
                const duration = Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : Infinity;
                if (audioEl.paused || audioEl.ended || audioProgramProgressAnchorStamp <= 0) {
                    return Math.max(0, Math.min(duration, audioEl.currentTime || 0));
                }
                const elapsed = (performance.now() - audioProgramProgressAnchorStamp) / 1000;
                const rate = Number.isFinite(audioEl.playbackRate) && audioEl.playbackRate > 0 ? audioEl.playbackRate : 1;
                return Math.max(0, Math.min(duration, audioProgramProgressAnchorTime + elapsed * rate));
            };

            const updateAudioProgramProgressTooltip = () => {
                if (!audioEl || !progressBar || !progressTooltip || !Number.isFinite(audioEl.duration) || audioEl.duration <= 0) {
                    if (progressTooltip) progressTooltip.classList.remove('is-visible');
                    return;
                }
                const playerBar = document.getElementById('audio-player-bar');
                if (!playerBar) return;
                const playerRect = playerBar.getBoundingClientRect();
                const progressRect = progressBar.getBoundingClientRect();
                const displayTime = getAudioProgramProgressDisplayTime();
                const ratio = Math.max(0, Math.min(1, displayTime / audioEl.duration));
                const pointX = progressRect.left - playerRect.left + (progressRect.width * ratio);
                const left = Math.max(34, Math.min(playerRect.width - 34, pointX));
                progressTooltip.textContent = `${formatTime(displayTime)} / ${formatTime(audioEl.duration)}`;
                progressTooltip.style.left = `${left}px`;
                progressTooltip.classList.add('is-visible');
            };

            const updateAudioProgramProgressVisual = (displayTime = null) => {
                if (!audioEl || !progressBar) return;
                const duration = Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : 0;
                const visualTime = displayTime === null ? audioEl.currentTime : displayTime;
                if (!progressBar.matches(':active')) {
                    progressBar.max = duration > 0 ? String(duration) : '100';
                    progressBar.value = String(visualTime || 0);
                }
                if (timeCurrent) timeCurrent.innerText = formatTime(visualTime);
                if (timeDuration) timeDuration.innerText = formatTime(duration);
                const percent = duration > 0 ? (visualTime / duration) * 100 : 0;
                if (progressFill) {
                    progressFill.style.setProperty('--progress-scale', String(Math.max(0, Math.min(1, percent / 100))));
                }
                if (progressBar.matches(':hover')) updateAudioProgramProgressTooltip();
            };

            const stopAudioProgramProgressAnimation = () => {
                if (audioProgramProgressFrame !== null) {
                    cancelAnimationFrame(audioProgramProgressFrame);
                    audioProgramProgressFrame = null;
                }
            };

            const startAudioProgramProgressAnimation = () => {
                if (!audioEl || audioEl.paused || audioEl.ended) {
                    stopAudioProgramProgressAnimation();
                    return;
                }
                stopAudioProgramProgressAnimation();
                const tick = () => {
                    updateAudioProgramProgressVisual(getAudioProgramProgressDisplayTime());
                    if (!audioEl.paused && !audioEl.ended) {
                        audioProgramProgressFrame = requestAnimationFrame(tick);
                    } else {
                        audioProgramProgressFrame = null;
                    }
                };
                audioProgramProgressFrame = requestAnimationFrame(tick);
            };

            playBtn.onclick = () => {
                if (audioEl.paused) audioEl.play();
                else audioEl.pause();
            };

            audioEl.addEventListener('play', () => {
                syncAudioProgramProgressAnchor();
                playBtn.classList.remove('is-play');
                playBtn.classList.add('is-pause');
                startAudioProgramProgressAnimation();
                saveAudioProgramPlayerState();
            });
            audioEl.addEventListener('playing', () => {
                syncAudioProgramProgressAnchor();
                startAudioProgramProgressAnimation();
                saveAudioProgramPlayerState();
            });
            audioEl.addEventListener('pause', () => {
                syncAudioProgramProgressAnchor();
                playBtn.classList.remove('is-pause');
                playBtn.classList.add('is-play');
                stopAudioProgramProgressAnimation();
                updateAudioProgramProgressVisual();
                saveAudioProgramPlayerState();
            });
            audioEl.addEventListener('ended', () => {
                syncAudioProgramProgressAnchor();
                stopAudioProgramProgressAnimation();
                updateAudioProgramProgressVisual();
                const nextItem = getNextAudioProgramItem();
                if (!nextItem) return;
                if (currentAudioProgramPlayMode === 'loop-one') {
                    audioEl.currentTime = 0;
                    audioEl.play().catch(() => { });
                    return;
                }
                playAudioProgram(nextItem.talkId);
            });

            audioEl.addEventListener('loadedmetadata', () => {
                syncAudioProgramProgressAnchor();
                progressBar.max = audioEl.duration;
                timeDuration.innerText = formatTime(audioEl.duration);
                updateAudioProgramProgressVisual();
                saveAudioProgramPlayerState();
            });

            audioEl.addEventListener('timeupdate', () => {
                syncAudioProgramProgressAnchor();
                updateAudioProgramProgressVisual();
                requestAudioProgramPlayerStateSave();
            });
            audioEl.addEventListener('waiting', () => {
                syncAudioProgramProgressAnchor();
                stopAudioProgramProgressAnimation();
                updateAudioProgramProgressVisual();
            });
            audioEl.addEventListener('seeking', syncAudioProgramProgressAnchor);
            audioEl.addEventListener('seeked', syncAudioProgramProgressAnchor);
            audioEl.addEventListener('ratechange', syncAudioProgramProgressAnchor);

            progressBar.addEventListener('input', () => {
                audioEl.currentTime = progressBar.value;
                syncAudioProgramProgressAnchor();
                updateAudioProgramProgressVisual();
                updateAudioProgramProgressTooltip();
                saveAudioProgramPlayerState({ currentTime: Number(progressBar.value) || 0 });
            });

            progressBar.addEventListener('mouseenter', updateAudioProgramProgressTooltip);
            progressBar.addEventListener('mousemove', updateAudioProgramProgressTooltip);
            progressBar.addEventListener('mouseleave', () => {
                if (progressTooltip) progressTooltip.classList.remove('is-visible');
            });

            const savedVolume = readStringSetting('yaya_music_volume', '');
            if (savedVolume !== null) {
                const vol = parseFloat(savedVolume);
                audioEl.volume = vol;
                if (volumeBar) volumeBar.value = vol;
            }

            const updateVolumeUI = (vol) => {
                if (!volumeIcon || !volumeBar) return;
                if (vol === 0 || audioEl.muted) {
                    volumeIcon.innerHTML = getAudioProgramVolumeIconSvg('muted');
                } else if (vol < 0.5) {
                    volumeIcon.innerHTML = getAudioProgramVolumeIconSvg('low');
                } else {
                    volumeIcon.innerHTML = getAudioProgramVolumeIconSvg('high');
                }
                const percent = vol * 100;
                volumeBar.style.background = `linear-gradient(to right, var(--primary) ${percent}%, rgba(0,0,0,0.08) ${percent}%)`;
            };

            updateVolumeUI(audioEl.volume);

            if (volumeBar) {
                volumeBar.addEventListener('input', (e) => {
                    const vol = parseFloat(e.target.value);
                    audioEl.volume = vol;
                    audioEl.muted = false;
                    writeStringSetting('yaya_music_volume', String(vol));
                    saveAudioProgramPlayerState();
                    updateVolumeUI(vol);
                });
                volumeBar.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const step = e.deltaY < 0 ? 0.05 : -0.05;
                    const nextVol = Math.max(0, Math.min(1, (audioEl.muted ? 0 : audioEl.volume) + step));
                    audioEl.volume = nextVol;
                    audioEl.muted = false;
                    volumeBar.value = String(nextVol);
                    writeStringSetting('yaya_music_volume', String(nextVol));
                    saveAudioProgramPlayerState();
                    updateVolumeUI(nextVol);
                }, { passive: false });
            }

            if (volumeIcon) {
                volumeIcon.addEventListener('click', () => {
                    audioEl.muted = !audioEl.muted;
                    if (audioEl.muted) {
                        volumeIcon.innerHTML = getAudioProgramVolumeIconSvg('muted');
                        volumeBar.value = 0;
                        volumeBar.style.background = `rgba(0,0,0,0.08)`;
                    } else {
                        volumeBar.value = audioEl.volume;
                        updateVolumeUI(audioEl.volume);
                    }
                    saveAudioProgramPlayerState();
                });
            }
        }

        function suspendAudioProgramForViewSwitch() {
            const audioEl = document.getElementById('native-audio-player');
            if (audioProgramStateSaveTimer) {
                clearTimeout(audioProgramStateSaveTimer);
                audioProgramStateSaveTimer = null;
            }
            saveAudioProgramPlayerState();
            if (audioEl && !audioEl.paused && !audioEl.ended) {
                audioEl.pause();
            }
        }

        function restoreAudioProgramPlayerState() {
            const savedState = readAudioProgramPlayerState();
            const talkId = savedState.talkId;
            if (!talkId) return;
            initCustomAudioUI();

            const audioEl = document.getElementById('native-audio-player');
            const resumeTime = Math.max(0, Number(savedState.currentTime) || 0);
            const playlistItem = audioProgramPlaylist.find(item => String(item.talkId) === String(talkId));
            const title = (playlistItem && playlistItem.title) || savedState.title || '未命名节目';
            const coverUrl = (playlistItem && playlistItem.coverUrl) || savedState.coverUrl || './icon.png';
            const subTitle = (playlistItem && playlistItem.subTitle) || savedState.subTitle || '已暂停';

            if (PLAYER_MODE_ORDER.includes(savedState.playMode)) {
                currentAudioProgramPlayMode = savedState.playMode;
                updateAudioProgramPlayModeButton();
            }
            if (audioEl && Number.isFinite(Number(savedState.volume))) {
                audioEl.volume = Math.max(0, Math.min(1, Number(savedState.volume)));
                audioEl.muted = Boolean(savedState.muted);
            }

            if (audioEl && String(currentAudioProgramTalkId) === String(talkId) && audioEl.src) {
                try {
                    if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
                        audioEl.currentTime = Math.min(resumeTime, Math.max(0, audioEl.duration - 0.2));
                    } else {
                        audioEl.currentTime = resumeTime;
                    }
                } catch (_) { }
                audioEl.pause();
                saveAudioProgramPlayerState({ currentTime: resumeTime });
                return;
            }

            if (audioProgramRestoring) return;
            audioProgramRestoring = true;
            playAudioProgram(talkId, title, coverUrl, subTitle, {
                autoplay: false,
                resumeTime
            }).finally(() => {
                audioProgramRestoring = false;
            });
        }

        function stopAudioProgram() {
            currentAudioPlayRequestId += 1;
            const audioEl = document.getElementById('native-audio-player');
            const titleEl = document.getElementById('audio-player-title');
            const subtitleEl = document.getElementById('audio-player-subtitle');
            const coverEl = document.getElementById('audio-player-cover');
            const dotEl = document.getElementById('audio-status-dot');
            const playBtn = document.getElementById('custom-play-btn');
            const progressBar = document.getElementById('custom-progress-bar');
            const progressFill = document.getElementById('audio-program-progress-fill');
            const timeCurrent = document.getElementById('custom-time-current');
            const timeDuration = document.getElementById('custom-time-duration');

            if (audioEl) {
                audioEl.onerror = null;
                audioEl.onplaying = null;
                audioEl.onpause = null;

                audioEl.pause();
                audioEl.src = "";
                try { audioEl.load(); } catch (e) { }
            }

            if (titleEl) {
                titleEl.classList.remove('is-scrolling');
                titleEl.innerText = "未播放";
            }
            if (subtitleEl) subtitleEl.innerText = "准备就绪";
            if (coverEl) {
                coverEl.src = "./icon.png";
                coverEl.classList.add('vinyl-pause');
            }
            if (dotEl) {
                dotEl.style.background = '#ccc';
                dotEl.style.boxShadow = '0 0 4px #ccc';
            }
            if (playBtn) {
                playBtn.classList.remove('is-pause');
                playBtn.classList.add('is-play');
            }
            if (progressBar) {
                progressBar.value = 0;
            }
            if (progressFill) {
                progressFill.style.setProperty('--progress-scale', '0');
            }
            if (timeCurrent) timeCurrent.innerText = "00:00";
            if (timeDuration) timeDuration.innerText = "00:00";
            currentAudioProgramTalkId = null;
            updateAudioProgramRows();
        }

        let musicNextCtime = 0;
        let musicHasMore = true;
        let isMusicLoading = false;
        let isMusicAutoLoading = false;
        let currentPlayingMusicId = null;
        let currentMusicPlayRequestId = 0;

        async function fetchAllMusicLibrary() {
            if (isMusicAutoLoading) return;
            isMusicAutoLoading = true;

            const grid = document.getElementById('music-list-grid');

            if (!grid || grid.innerHTML.trim() === '') {
                await loadMusicLibrary(true);
            }

            while (isMusicAutoLoading && musicHasMore) {
                await loadMusicLibrary(false);
                await new Promise(r => setTimeout(r, 100));
            }

            isMusicAutoLoading = false;
        }

        async function loadMusicLibrary(isNew = false) {
            if (isMusicLoading || (!musicHasMore && !isNew)) return;

            isMusicLoading = true;
            const grid = document.getElementById('music-list-grid');

            if (isNew) {
                musicNextCtime = 0;
                musicHasMore = true;
                musicPlaylist = [];
                renderMusicQueue();
                if (grid) grid.innerHTML = '';
            }

            try {
                const res = await fetchPocketAPI('/media/api/media/v1/music/list', JSON.stringify({
                    ctime: musicNextCtime,
                    limit: 20
                }));

                if (res && res.success && res.content) {
                    const data = res.content.data || [];
                    if (data.length === 0) {
                        musicHasMore = false;
                    } else {
                        data.forEach(item => {
                            const coverUrl = item.thumbPath ? `https://source.48.cn${item.thumbPath}` : './icon.png';
                            const isCurrent = currentPlayingMusicId === item.musicId;

                            const singerText = item.joinMemberNames || item.subTitle || '官方单曲';
                            const lyricMeta = {
                                歌曲名: item.title || '',
                                分团: item.groupName || item.group || singerText,
                                专辑: item.albumName || item.album || item.specialTitle || item.subTitle || '',
                                类型: item.typeName || item.type || '',
                                专辑序号: item.serialNo || item.albumSeq || item.seq || '',
                                lrcPath: item.lrcPath || item.lyricPath || item.lyricsPath || ''
                            };
                            const playlistItem = {
                                musicId: item.musicId,
                                title: item.title,
                                subTitle: singerText,
                                thumbPath: item.thumbPath,
                                dateStr: formatFullTime(item.ctime).split(' ')[0],
                                lyricMeta
                            };
                            if (!musicPlaylist.some(existing => String(existing.musicId) === String(item.musicId))) {
                                musicPlaylist.push(playlistItem);
                            }

                            const card = document.createElement('div');
                            card.className = `music-card ${isCurrent ? 'is-playing' : ''}`;
                            card.dataset.id = item.musicId;

                            card.innerHTML = `
    <div class="music-cover-wrapper" style="width: 100%; aspect-ratio: 1 / 1; overflow: hidden; position: relative; border-radius: 6px; background: #111;">
        <img src="${coverUrl}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; display: block;">
    </div>

    <div style="padding: 8px 8px 6px 8px;">
        <div class="music-title" style="font-weight: 700; font-size: 13px; color: var(--text); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${item.title}
        </div>
        
        <div style="font-size: 11px; color: var(--text-sub); margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${singerText}">
            ${singerText}
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 6px; margin-top: 4px; opacity: 0.8;">
            <div style="display: flex; gap: 8px; font-size: 11px; color: var(--text-sub);">
                <span>❤️ ${item.praise || 0}</span>
            </div>
            <span style="font-size: 11px; color: var(--text-sub);">
                ${formatFullTime(item.ctime).split(' ')[0]}
            </span>
        </div>
    </div>
`;

                            card.onclick = () => {
                                document.querySelectorAll('.music-card').forEach(c => c.classList.remove('is-playing'));
                                card.classList.add('is-playing');
                                currentPlayingMusicId = item.musicId;
                                playOfficialMusic(item.musicId);
                            };

                            if (grid) grid.appendChild(card);
                        });
                        renderMusicQueue();

                        musicNextCtime = data[data.length - 1].ctime;
                        if (data.length < 20) musicHasMore = false;

                        const searchInput = document.getElementById('music-inner-search');
                        if (searchInput && searchInput.value.trim() !== '') {
                            handleMusicSearch(searchInput.value);
                        }
                    }
                } else {
                    musicHasMore = false;
                }
            } catch (e) {
                console.error("加载音乐失败", e);
                musicHasMore = false;
            } finally {
                isMusicLoading = false;
            }
        }

        let musicSearchTimeout = null;

        function debouncedMusicSearch(keyword) {
            if (musicSearchTimeout) clearTimeout(musicSearchTimeout);
            musicSearchTimeout = setTimeout(() => {
                handleMusicSearch(keyword);
            }, 300);
        }

        function handleMusicSearch(keyword) {
            const grid = document.getElementById('music-list-grid');
            if (!grid) return;

            const kw = keyword.toLowerCase().trim();

            const cards = grid.querySelectorAll('.music-card');
            let visibleCount = 0;

            cards.forEach(card => {
                const isMatch = matchesSearchKeyword(card, kw);

                card.style.display = isMatch ? '' : 'none';
                if (isMatch) visibleCount++;
            });

            let emptyTip = document.getElementById('music-empty-tip');
            if (visibleCount === 0 && kw !== '') {
                if (!emptyTip) {
                    emptyTip = document.createElement('div');
                    emptyTip.id = 'music-empty-tip';
                    emptyTip.style.cssText = `grid-column: 1 / -1; width: 100%; text-align: center; padding: 80px 0; color: var(--text-sub); display: flex; flex-direction: column; align-items: center; opacity: 0.8;`;
                    emptyTip.innerHTML = `<div style="font-size: 40px; margin-bottom: 15px; opacity: 0.2;">🎵</div><div style="font-weight: 500;">未找到相关歌曲</div>`;
                    grid.appendChild(emptyTip);
                }
                emptyTip.style.display = 'flex';
            } else {
                if (emptyTip) emptyTip.style.display = 'none';
            }
        }

        let videoSearchTimeout = null;
        function debouncedVideoSearch(keyword) {
            if (videoSearchTimeout) clearTimeout(videoSearchTimeout);
            videoSearchTimeout = setTimeout(() => {
                handleVideoSearch(keyword);
            }, 300);
        }

        function handleVideoSearch(keyword) {
            const grid = document.getElementById('video-list-grid');
            if (!grid) return;

            const kw = keyword.toLowerCase().trim();

            const children = grid.children;
            let visibleCount = 0;

            for (let i = 0; i < children.length; i++) {
                const card = children[i];

                if (card.id === 'video-loading-tip') continue;

                const isMatch = matchesSearchKeyword(card, kw);

                card.style.display = isMatch ? 'block' : 'none';
                if (isMatch) visibleCount++;
            }

            let emptyTip = document.getElementById('video-empty-tip');
            if (visibleCount === 0 && kw !== '') {
                if (!emptyTip) {
                    emptyTip = document.createElement('div');
                    emptyTip.id = 'video-empty-tip';
                    emptyTip.style.cssText = `grid-column: 1 / -1; width: 100%; text-align: center; padding: 80px 0; color: var(--text-sub); display: flex; flex-direction: column; align-items: center; opacity: 0.8;`;
                    emptyTip.innerHTML = `<div style="font-size: 40px; margin-bottom: 15px; opacity: 0.2;">🎬</div><div style="font-weight: 500;">未找到匹配视频</div>`;
                    grid.appendChild(emptyTip);
                }
                emptyTip.style.display = 'flex';
            } else {
                if (emptyTip) emptyTip.style.display = 'none';
            }
        }

        let audioSearchTimeout = null;

        function debouncedAudioSearch(keyword) {
            if (audioSearchTimeout) clearTimeout(audioSearchTimeout);

            audioSearchTimeout = setTimeout(() => {
                handleAudioSearch(keyword);
            }, 300);
        }

        function handleAudioSearch(keyword) {
            const grid = document.getElementById('audio-programs-list');
            if (!grid) return;

            const kw = keyword.toLowerCase().trim();

            let visibleCount = 0;
            const children = grid.children;

            for (let i = 0; i < children.length; i++) {
                const card = children[i];

                if (card.id === 'audio-empty-tip' || card.classList.contains('audio-program-table-head')) {
                    continue;
                }

                const isMatch = matchesSearchKeyword(card, kw);

                card.style.display = isMatch ? '' : 'none';

                if (isMatch) visibleCount++;
            }

            let emptyTip = document.getElementById('audio-empty-tip');
            if (visibleCount === 0 && kw !== '') {
                if (!emptyTip) {
                    emptyTip = document.createElement('div');
                    emptyTip.id = 'audio-empty-tip';
                    emptyTip.style.cssText = `grid-column: 1 / -1; width: 100%; text-align: center; padding: 80px 0; color: var(--text-sub); display: flex; align-items: center; justify-content: center; opacity: 0.8;`;
                    emptyTip.innerHTML = `<div style="font-weight: 500;">没有找到匹配的电台</div>`;
                    grid.appendChild(emptyTip);
                }
                emptyTip.style.display = 'flex';
            } else {
                if (emptyTip) emptyTip.style.display = 'none';
            }
        }

        let isMusicPlayerSetup = false;

        function initMusicPlayerUI() {
            if (isMusicPlayerSetup) return;
            isMusicPlayerSetup = true;

            const audioEl = document.getElementById('music-native-audio');
            const playBtn = document.getElementById('music-play-btn');
            const progressBar = document.getElementById('music-progress-bar');
            const timeCurrent = document.getElementById('music-time-current');
            const timeDuration = document.getElementById('music-time-duration');

            const volumeIcon = document.getElementById('music-volume-icon');
            const volumeBar = document.getElementById('music-volume-bar');

            updateMusicPlayModeButton();
            updateMusicLyricsToggleButton();

            const formatTime = (seconds) => {
                if (!seconds || isNaN(seconds) || seconds === Infinity) return "00:00";
                const m = Math.floor(seconds / 60).toString().padStart(2, '0');
                const s = Math.floor(seconds % 60).toString().padStart(2, '0');
                return `${m}:${s}`;
            };

            playBtn.onclick = () => {
                if (audioEl.paused) audioEl.play();
                else audioEl.pause();
            };

            audioEl.addEventListener('play', () => {
                playBtn.classList.remove('is-play');
                playBtn.classList.add('is-pause');
            });
            audioEl.addEventListener('pause', () => {
                playBtn.classList.remove('is-pause');
                playBtn.classList.add('is-play');
            });
            audioEl.addEventListener('ended', () => {
                const nextItem = getNextMusicItem();
                if (!nextItem) return;
                if (currentMusicPlayMode === 'loop-one') {
                    audioEl.currentTime = 0;
                    audioEl.play().catch(() => { });
                    return;
                }
                playOfficialMusic(nextItem.musicId);
            });

            audioEl.addEventListener('loadedmetadata', () => {
                if (audioEl.duration && audioEl.duration !== Infinity && !isNaN(audioEl.duration)) {
                    progressBar.max = audioEl.duration;
                    timeDuration.innerText = formatTime(audioEl.duration);
                }
                syncMusicLyrics(audioEl.currentTime || 0, true);
            });

            audioEl.addEventListener('timeupdate', () => {
                if (progressBar.max === "100" && audioEl.duration && audioEl.duration !== Infinity) {
                    progressBar.max = audioEl.duration;
                    timeDuration.innerText = formatTime(audioEl.duration);
                }
                if (!progressBar.matches(':active')) {
                    progressBar.value = audioEl.currentTime;
                }
                timeCurrent.innerText = formatTime(audioEl.currentTime);
                const percent = (audioEl.currentTime / audioEl.duration) * 100 || 0;
                progressBar.style.background = `linear-gradient(to right, var(--primary) ${percent}%, rgba(0,0,0,0.08) ${percent}%)`;
                syncMusicLyrics(audioEl.currentTime || 0);
            });

            progressBar.addEventListener('input', () => {
                audioEl.currentTime = progressBar.value;
                timeCurrent.innerText = formatTime(progressBar.value);
                const percent = (progressBar.value / audioEl.duration) * 100 || 0;
                progressBar.style.background = `linear-gradient(to right, var(--primary) ${percent}%, rgba(0,0,0,0.08) ${percent}%)`;
            });


            const savedVolume = readStringSetting('yaya_music_volume', '');
            if (savedVolume !== null) {
                const vol = parseFloat(savedVolume);
                audioEl.volume = vol;
                volumeBar.value = vol;
            }

            const updateVolumeUI = (vol) => {
                if (vol === 0 || audioEl.muted) {
                    volumeIcon.innerText = '🔇';
                } else if (vol < 0.5) {
                    volumeIcon.innerText = '🔉';
                } else {
                    volumeIcon.innerText = '🔊';
                }
                const percent = vol * 100;
                volumeBar.style.background = `linear-gradient(to right, var(--primary) ${percent}%, rgba(0,0,0,0.08) ${percent}%)`;
            };

            updateVolumeUI(audioEl.volume);

            volumeBar.addEventListener('input', (e) => {
                const vol = parseFloat(e.target.value);
                audioEl.volume = vol;
                audioEl.muted = false;
                writeStringSetting('yaya_music_volume', String(vol));
                updateVolumeUI(vol);
            });
            volumeBar.addEventListener('wheel', (e) => {
                e.preventDefault();
                const step = e.deltaY < 0 ? 0.05 : -0.05;
                const nextVol = Math.max(0, Math.min(1, (audioEl.muted ? 0 : audioEl.volume) + step));
                audioEl.volume = nextVol;
                audioEl.muted = false;
                volumeBar.value = String(nextVol);
                writeStringSetting('yaya_music_volume', String(nextVol));
                updateVolumeUI(nextVol);
            }, { passive: false });

            volumeIcon.addEventListener('click', () => {
                audioEl.muted = !audioEl.muted;
                if (audioEl.muted) {
                    volumeIcon.innerText = '🔇';
                    volumeBar.value = 0;
                    volumeBar.style.background = `rgba(0,0,0,0.08)`;
                } else {
                    volumeBar.value = audioEl.volume;
                    updateVolumeUI(audioEl.volume);
                }
            });
        }

        async function playOfficialMusic(musicId, title, subTitle, thumbPath) {
            const requestId = ++currentMusicPlayRequestId;
            const playContext = capturePlaybackViewContext();
            try {
                const playlistItem = musicPlaylist.find(item => String(item.musicId) === String(musicId));
                if (playlistItem) {
                    title = playlistItem.title;
                    subTitle = playlistItem.subTitle;
                    thumbPath = playlistItem.thumbPath;
                }

                const res = await fetchPocketAPI('/media/api/media/v1/music', JSON.stringify({ resId: String(musicId) }));
                if (requestId !== currentMusicPlayRequestId) return;
                if (!isPlaybackViewContextActive(playContext, 'music-library')) return;
                if (res && res.success && res.content) {
                    const data = res.content.data || res.content;
                    const path = data.filePath || data.musicPath || data.playStreamPath || data.audioPath || data.url;

                    if (!path) return showToast('播放失败：API未返回音频地址');
                    const fullUrl = path.startsWith('http') ? path : `https://mp4.48.cn${path}`;

                    const audioEl = document.getElementById('music-native-audio');
                    const titleEl = document.getElementById('music-player-title');
                    const subTitleEl = document.getElementById('music-player-subtitle');
                    const coverEl = document.getElementById('music-player-cover');
                    const playerBar = document.getElementById('music-player-bar');
                    const dotEl = document.getElementById('music-status-dot');
                    const playBtn = document.getElementById('music-play-btn');
                    const progressBar = document.getElementById('music-progress-bar');
                    const timeCurrent = document.getElementById('music-time-current');
                    const timeDuration = document.getElementById('music-time-duration');

                    if (audioEl && playerBar) {
                        currentPlayingMusicId = musicId;
                        initMusicPlayerUI();
                        updateMusicPlayModeButton();
                        updateMusicLyricsToggleButton();
                        renderMusicQueue();

                        const radioEl = document.getElementById('native-audio-player');
                        if (radioEl) radioEl.pause();
                        const currentPlayingVideo = getCurrentPlayingVideo();
                        if (currentPlayingVideo) currentPlayingVideo.pause();

                        audioEl.onerror = null;
                        audioEl.onplaying = null;
                        audioEl.onpause = null;

                        audioEl.pause();
                        audioEl.currentTime = 0;
                        audioEl.removeAttribute('src');
                        try { audioEl.load(); } catch (e) { }

                        if (playBtn) {
                            playBtn.classList.remove('is-pause');
                            playBtn.classList.add('is-play');
                        }
                        if (progressBar) {
                            progressBar.max = 100;
                            progressBar.value = 0;
                            progressBar.style.background = 'rgba(0,0,0,0.08)';
                        }
                        if (timeCurrent) timeCurrent.innerText = '00:00';
                        if (timeDuration) timeDuration.innerText = '00:00';

                        audioEl.src = fullUrl;
                        titleEl.innerText = title;
                        subTitleEl.innerText = '正在加载音频...';
                        coverEl.src = thumbPath ? `https://source.48.cn${thumbPath}` : './icon.png';

                        playerBar.style.display = 'flex';
                        loadMusicLyrics(playlistItem?.lyricMeta || {
                            歌曲名: title || '',
                            分团: subTitle || '',
                            专辑: '',
                            类型: '',
                            专辑序号: '',
                            lrcPath: ''
                        }).catch(err => console.warn('歌词加载失败', err));

                        if (dotEl) {
                            dotEl.style.background = '#17a2b8';
                            dotEl.style.boxShadow = '0 0 6px #17a2b8';
                        }
                        if (coverEl) coverEl.classList.add('vinyl-pause');

                        audioEl.onplaying = () => {
                            if (requestId !== currentMusicPlayRequestId) return;
                            subTitleEl.innerText = subTitle || '官方单曲';
                            if (coverEl) coverEl.classList.remove('vinyl-pause');
                            if (dotEl) {
                                dotEl.style.background = '#28a745';
                                dotEl.style.boxShadow = '0 0 6px #28a745';
                            }
                        };

                        audioEl.onpause = () => {
                            if (requestId !== currentMusicPlayRequestId) return;
                            if (coverEl) coverEl.classList.add('vinyl-pause');
                            if (dotEl) {
                                dotEl.style.background = '#ffc107';
                                dotEl.style.boxShadow = '0 0 6px #ffc107';
                            }
                        };

                        audioEl.play().catch(e => {
                            if (requestId !== currentMusicPlayRequestId) return;
                            console.warn('自动播放拦截', e);
                            subTitleEl.innerText = '已就绪，请点击播放 ▶';
                        });

                        document.querySelectorAll('.music-card').forEach(card => {
                            card.classList.toggle('is-playing', String(card.dataset.id) === String(musicId));
                        });
                    }
                } else {
                    showToast('无法解析音乐地址');
                }
            } catch (e) {
                showToast('获取音乐失败');
            }
        }

        function initMusicScrollListener() {
            const container = document.getElementById('music-scroll-area');
            if (!container) return;
            container.onscroll = () => {
                if (container.scrollTop + container.clientHeight >= container.scrollHeight - 150) {
                    loadMusicLibrary(false);
                }
            };
        }

        let videoNextCtime = 0;
        let videoHasMore = true;
        let isVideoLoading = false;
        let videoCurrentTypeId = 0;
        let isCategoriesRendered = false;

        let isVideoAutoLoading = false;

        async function fetchAllVideoLibrary() {
            if (isVideoAutoLoading) return;
            isVideoAutoLoading = true;

            const grid = document.getElementById('video-list-grid');

            if (!grid || grid.innerHTML.trim() === '') {
                await loadVideoLibrary(true);
            }

            while (isVideoAutoLoading && videoHasMore) {
                await loadVideoLibrary(false);
                await new Promise(r => setTimeout(r, 100));
            }

            isVideoAutoLoading = false;
        }

        function selectVideoCategory(typeId) {
            if (videoCurrentTypeId === typeId) return;

            videoCurrentTypeId = typeId;
            isVideoAutoLoading = false;

            document.querySelectorAll('.video-tag').forEach(tag => {
                tag.classList.toggle('active', parseInt(tag.dataset.id) === typeId);
            });

            setTimeout(() => {
                const grid = document.getElementById('video-list-grid');
                if (grid) grid.innerHTML = '';
                fetchAllVideoLibrary();
            }, 150);
        }

        async function loadVideoLibrary(isNew = false) {
            if (isVideoLoading || (!videoHasMore && !isNew)) return;

            isVideoLoading = true;
            const grid = document.getElementById('video-list-grid');
            const categoryBar = document.getElementById('video-category-bar');

            if (isNew) {
                videoNextCtime = 0;
                videoHasMore = true;
                grid.innerHTML = '';
                const container = document.getElementById('view-video-library');
                if (container) container.scrollTop = 0;
            }

            let loadingTip = document.getElementById('video-loading-tip');
            if (!loadingTip) {
                loadingTip = document.createElement('div');
                loadingTip.id = 'video-loading-tip';
                loadingTip.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--text-sub); font-size: 13px;';
                grid.appendChild(loadingTip);
            }

            loadingTip.style.display = 'none';
            loadingTip.innerText = '';

            try {
                const res = await fetchPocketAPI('/media/api/media/v1/video/list', JSON.stringify({
                    ctime: videoNextCtime,
                    typeId: videoCurrentTypeId,
                    groupId: 0,
                    limit: 20
                }));

                if (res && res.success && res.content) {
                    if (!isCategoriesRendered && res.content.type && categoryBar) {
                        categoryBar.innerHTML = '';
                        res.content.type.forEach(cat => {
                            const tag = document.createElement('div');
                            tag.className = `video-tag ${cat.typeId === videoCurrentTypeId ? 'active' : ''}`;
                            tag.innerText = cat.typeName;
                            tag.dataset.id = cat.typeId;
                            tag.onclick = () => selectVideoCategory(cat.typeId);
                            categoryBar.appendChild(tag);
                        });
                        isCategoriesRendered = true;
                    }

                    const data = res.content.data || [];

                    if (data.length === 0) {
                        videoHasMore = false;
                        loadingTip.innerText = '— 已经到底啦 —';
                    } else {
                        data.forEach(item => {
                            const coverUrl = item.thumbPath ? `https://source.48.cn${item.thumbPath}` : '';
                            const dateStr = formatFullTime(item.ctime).split(' ')[0];
                            const card = document.createElement('div');

                            card.style.cssText = `
                                background: var(--input-bg); 
                                border-radius: 12px; 
                                overflow: hidden; 
                                border: 1px solid var(--border); 
                                cursor: pointer; 
                                transition: transform 0.3s ease, border-color 0.3s ease;
                                transform: translateZ(0);
                            `;

                            card.onmouseover = () => { card.style.transform = 'translateY(-5px)'; card.style.borderColor = 'var(--primary)'; };
                            card.onmouseout = () => { card.style.transform = 'translateY(0)'; card.style.borderColor = 'var(--border)'; };

                            card.innerHTML = `
    <div style="width: 100%; aspect-ratio: 16 / 9; overflow: hidden; position: relative; background: #111; border-radius: 6px;">
        <img src="${coverUrl}" loading="lazy" decoding="async" style="width: 100%; height: 100%; object-fit: cover; display: block;">
        
        <div style="position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.6); color: white; font-size: 9px; padding: 1px 4px; border-radius: 3px; backdrop-filter: blur(2px);">
            ${item.typeName || '视频'}
        </div>
    </div>

    <div style="padding: 8px 8px 6px 8px;">
        <div style="font-weight: 600; font-size: 12.5px; color: var(--text); margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; height: 32px;">
            ${item.title}
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-sub); opacity: 0.8;">
            <span style="color: #fa8c16; font-weight: 500;">▶ ${item.play || 0}</span>
            <span>${dateStr}</span>
        </div>
    </div>
`;
                            card.onclick = () => playOfficialVideo(item.videoId, item.title, item.subTitle);
                            grid.insertBefore(card, loadingTip);
                            const vSearchInput = document.getElementById('video-inner-search');
                            if (vSearchInput && vSearchInput.value.trim() !== '') {
                                handleVideoSearch(vSearchInput.value);
                            }
                        });

                        videoNextCtime = data[data.length - 1].ctime;
                        if (data.length < 20) {
                            videoHasMore = false;
                            loadingTip.innerText = '— 已经到底啦 —';
                        }
                    }
                }
            } catch (e) {
                console.error("加载失败", e);
                if (loadingTip) loadingTip.innerText = '加载出错，请重试';
            } finally {
                isVideoLoading = false;
            }
        }

        function initVideoScrollListener() {
            const container = document.getElementById('view-video-library');
            if (!container) return;

            container.onscroll = () => {
                if (container.scrollTop + container.clientHeight >= container.scrollHeight - 100) {
                    loadVideoLibrary(false);
                }
            };
        }

        async function playOfficialVideo(videoId, title, subTitle) {
            const requestId = ++currentVideoPlayRequestId;
            const playContext = capturePlaybackViewContext();
            try {
                const res = await fetchPocketAPI('/media/api/media/v1/video', JSON.stringify({ resId: videoId.toString() }));
                if (requestId !== currentVideoPlayRequestId) return;
                if (!isPlaybackViewContextActive(playContext, 'video-library')) return;
                if (res && res.success && res.content) {
                    const filePath = res.content.data.filePath || res.content.filePath;
                    const fullUrl = `https://mp4.48.cn${filePath}`;

                    const modal = document.getElementById('video-player-modal');
                    const video = document.getElementById('main-video-player');

                    document.getElementById('video-playing-title').innerText = title;
                    document.getElementById('video-playing-subtitle').innerText = subTitle || '';

                    video.src = fullUrl;
                    modal.style.display = 'flex';
                    video.play().catch(() => { });

                    if (typeof stopAudioProgram === 'function') stopAudioProgram();
                }
            } catch (e) {
                showToast('视频地址解析失败');
            }
        }

        function closeVideoPlayer() {
            currentVideoPlayRequestId += 1;
            const modal = document.getElementById('video-player-modal');
            const video = document.getElementById('main-video-player');
            if (!modal || !video) return;
            video.pause();
            video.src = "";
            modal.style.display = 'none';
        }


        window.addEventListener('beforeunload', () => {
            if (audioProgramStateSaveTimer) {
                clearTimeout(audioProgramStateSaveTimer);
                audioProgramStateSaveTimer = null;
            }
            saveAudioProgramPlayerState();
        });

        return {
            closeVideoPlayer,
            cycleAudioProgramPlayMode,
            cycleMusicPlayMode,
            debouncedAudioSearch,
            debouncedMusicSearch,
            debouncedVideoSearch,
            fetchAllMusicLibrary,
            fetchAllVideoLibrary,
            initMusicScrollListener,
            initVideoScrollListener,
            loadAudioPrograms,
            playAudioProgram,
            playNextAudioProgram,
            playNextMusic,
            playOfficialMusic,
            playOfficialVideo,
            playPreviousAudioProgram,
            playPreviousMusic,
            restoreAudioProgramPlayerState,
            suspendAudioProgramForViewSwitch,
            stopAudioProgram,
            toggleAudioProgramQueue,
            toggleMusicQueue
        };
    };
})();
