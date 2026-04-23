(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createMusicLyricsFeature = function createMusicLyricsFeature(deps) {
        const {
            MUSIC_LYRICS_BASE_URL,
            MUSIC_LYRICS_INDEX_URL,
            escapeHtml,
            parseMusicLrc
        } = deps;

        let musicLyricsIndexPromise = null;
        let currentMusicLyrics = [];
        let currentMusicLyricMeta = null;
        let currentMusicLyricActiveIndex = -1;
        let currentMusicLyricsVisible = false;
        let currentMusicLyricsRequestId = 0;

        function fetchMusicLyricsIndex() {
            if (!musicLyricsIndexPromise) {
                musicLyricsIndexPromise = fetch(MUSIC_LYRICS_INDEX_URL)
                    .then(res => {
                        if (!res.ok) throw new Error('Lyrics index not found');
                        return res.json();
                    })
                    .catch(err => {
                        musicLyricsIndexPromise = null;
                        throw err;
                    });
            }
            return musicLyricsIndexPromise;
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
                .replace(/[<>]/g, '')
                .replace(/\s+/g, '')
                .toLowerCase();
        }

        function buildMusicLyricNameVariants(name) {
            const raw = String(name || '').trim();
            if (!raw) return [];
            const variants = new Set([raw]);
            const push = value => value && variants.add(value);

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

            return [...variants];
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
            rawValues.forEach(value => {
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
            const titleSet = new Set(buildMusicLyricNameVariants(meta.歌曲名).map(normalizeMusicLyricToken));
            if (!titleSet.size) return [];

            const groupCandidates = new Set(getMusicGroupCandidates(meta));
            const normalizedAlbum = normalizeMusicLyricToken(meta.专辑);
            const normalizedType = normalizeMusicLyricToken(meta.类型);
            const normalizedSeq = normalizeMusicLyricToken(meta.专辑序号);

            const scored = index
                .filter(item => item && item.songTitle && titleSet.has(normalizeMusicLyricToken(item.songTitle)))
                .map(item => {
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

            return [...new Set(scored.map(item => item.path))];
        }

        function updateMusicLyricsToggleButton() {
            const btn = document.getElementById('music-lyrics-toggle-btn');
            if (!btn) return;
            btn.classList.toggle('active', currentMusicLyricsVisible);
            btn.title = currentMusicLyricsVisible ? '收起歌词' : '展开歌词';
            btn.setAttribute('aria-label', currentMusicLyricsVisible ? '收起歌词' : '展开歌词');
        }

        function setMusicLyricsPanelState(type, message = '') {
            const panel = document.getElementById('music-lyrics-panel');
            const emptyEl = document.getElementById('music-lyrics-empty');
            const scrollEl = document.getElementById('music-lyrics-scroll');
            const linesEl = document.getElementById('music-lyrics-lines');
            const subtitleEl = document.getElementById('music-lyrics-panel-subtitle');
            if (!panel || !emptyEl || !scrollEl || !linesEl || !subtitleEl) return;

            subtitleEl.innerText = '';
            if (type === 'lines') {
                emptyEl.style.display = 'none';
                scrollEl.style.display = 'block';
                return;
            }
            linesEl.innerHTML = '';
            scrollEl.style.display = 'none';
            emptyEl.style.display = 'block';
            emptyEl.innerText = message || '当前歌曲暂无歌词';
        }

        function renderMusicLyrics() {
            const linesEl = document.getElementById('music-lyrics-lines');
            if (!linesEl) return;
            if (!currentMusicLyrics.length) {
                setMusicLyricsPanelState('empty', '当前歌曲暂无歌词');
                return;
            }

            linesEl.innerHTML = currentMusicLyrics.map((item, index) => `
                <button class="music-lyric-line ${index === currentMusicLyricActiveIndex ? 'active' : ''} ${index < currentMusicLyricActiveIndex ? 'past' : ''}" type="button" data-index="${index}" onclick="seekMusicLyricLine(${index})">
                    ${escapeHtml(item.text)}
                </button>
            `).join('');
            setMusicLyricsPanelState('lines', currentMusicLyricMeta?.歌曲名 || '歌词');
        }

        function syncMusicLyrics(currentTime, force = false) {
            if (!currentMusicLyrics.length) return;
            const scrollEl = document.getElementById('music-lyrics-scroll');
            const linesEl = document.getElementById('music-lyrics-lines');
            if (!scrollEl || !linesEl) return;

            let activeIndex = 0;
            for (let i = 0; i < currentMusicLyrics.length; i++) {
                if (currentMusicLyrics[i].time <= currentTime + 0.08) activeIndex = i;
                else break;
            }
            if (!force && activeIndex === currentMusicLyricActiveIndex) return;
            currentMusicLyricActiveIndex = activeIndex;

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
            const targetTop = activeEl.offsetTop - (scrollEl.clientHeight / 2) + (activeEl.offsetHeight / 2);
            scrollEl.scrollTo({
                top: Math.max(targetTop, 0),
                behavior: force ? 'auto' : 'smooth'
            });
        }

        function seekMusicLyricLine(index) {
            const entry = currentMusicLyrics[index];
            const audioEl = document.getElementById('music-native-audio');
            if (!entry || !audioEl) return;
            audioEl.currentTime = Math.max(entry.time, 0);
            syncMusicLyrics(entry.time, true);
        }

        function toggleMusicLyricsPanel(forceVisible = null) {
            const panel = document.getElementById('music-lyrics-panel');
            const view = document.getElementById('view-music-library');
            const scrollArea = document.getElementById('music-scroll-area');
            if (!panel) return;
            currentMusicLyricsVisible = typeof forceVisible === 'boolean' ? forceVisible : !currentMusicLyricsVisible;
            panel.style.display = currentMusicLyricsVisible ? 'flex' : 'none';
            if (view) view.classList.toggle('lyrics-mode', currentMusicLyricsVisible);
            if (scrollArea) scrollArea.style.display = currentMusicLyricsVisible ? 'none' : 'block';
            updateMusicLyricsToggleButton();
            if (currentMusicLyricsVisible) {
                const queuePanel = document.getElementById('music-player-queue');
                if (queuePanel) queuePanel.style.display = 'none';
                if (currentMusicLyrics.length) {
                    syncMusicLyrics(document.getElementById('music-native-audio')?.currentTime || 0, true);
                }
            }
        }

        async function fetchTextWithTimeout(url, timeoutMs = 8000) {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

            try {
                const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
                if (!res.ok) return '';
                return await res.text();
            } catch (_) {
                return '';
            } finally {
                if (timer) clearTimeout(timer);
            }
        }

        async function loadMusicLyrics(meta) {
            const requestId = ++currentMusicLyricsRequestId;
            currentMusicLyricMeta = meta || null;
            currentMusicLyrics = [];
            currentMusicLyricActiveIndex = -1;
            setMusicLyricsPanelState('loading', '正在读取歌词...');

            if (!meta || !meta.歌曲名) {
                setMusicLyricsPanelState('empty', '当前歌曲暂无歌词');
                return;
            }

            const urls = [];
            if (meta.lrcPath) {
                urls.push(`${MUSIC_LYRICS_BASE_URL}/${encodeMusicLyricPath(meta.lrcPath)}`);
            }

            try {
                const index = await fetchMusicLyricsIndex();
                if (requestId !== currentMusicLyricsRequestId) return;
                buildMusicLyricIndexedPaths(meta, index).forEach(path => {
                    urls.push(`${MUSIC_LYRICS_BASE_URL}/${encodeMusicLyricPath(path)}`);
                });
            } catch (err) {
                console.warn('读取歌词索引失败', err);
            }

            const uniqueUrls = [...new Set(urls)];
            let lrcText = '';
            for (const url of uniqueUrls) {
                lrcText = await fetchTextWithTimeout(url);
                if (requestId !== currentMusicLyricsRequestId) return;
                if (lrcText) break;
            }

            if (requestId !== currentMusicLyricsRequestId) return;
            if (!lrcText) {
                setMusicLyricsPanelState('empty', '当前歌曲暂无歌词');
                return;
            }

            currentMusicLyrics = parseMusicLrc(lrcText);
            if (requestId !== currentMusicLyricsRequestId) return;
            if (!currentMusicLyrics.length) {
                setMusicLyricsPanelState('empty', '歌词格式暂不支持');
                return;
            }

            renderMusicLyrics();
            syncMusicLyrics(document.getElementById('music-native-audio')?.currentTime || 0, true);
        }

        return {
            updateMusicLyricsToggleButton,
            syncMusicLyrics,
            toggleMusicLyricsPanel,
            loadMusicLyrics,
            seekMusicLyricLine
        };
    };
})();
