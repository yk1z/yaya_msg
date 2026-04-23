(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createBilibiliLiveFeature = function createBilibiliLiveFeature(deps) {
        const {
            DEFAULT_BILIBILI_LIVE_CONFIG,
            BILIBILI_LIVE_CONFIG_URL,
            BILIBILI_LIVE_CONFIG_CACHE_KEY,
            escapePrivateMessageHtml,
            getAppToken,
            getCurrentViewName,
            ipcRenderer
        } = deps;

        let bilibiliLiveConfigPromise = null;
        let bilibiliDp = null;
        let bilibiliFlvPlayer = null;
        let bilibiliLiveStatusTimer = null;
        let bilibiliLiveStatusMap = {};
        let bilibiliCurrentRoomId = '';
        let bilibiliCurrentOpenLiveInfo = null;
        let bilibiliCurrentOpenLiveGroupKey = '';
        let bilibiliLiveAutoConnectPending = false;
        let bilibiliLiveRooms = DEFAULT_BILIBILI_LIVE_CONFIG.rooms.slice();
        const BILIBILI_LAST_ROOM_KEY = 'bilibili_live_last_room_id';

        function getBilibiliLiveRoomIds() {
            return bilibiliLiveRooms.map(item => String(item.roomId || '').trim()).filter(Boolean);
        }

        function getBilibiliLiveRoomName(roomId) {
            const normalizedRoomId = String(roomId || '').trim();
            const matchedRoom = bilibiliLiveRooms.find(item => item.roomId === normalizedRoomId);
            return matchedRoom?.title || normalizedRoomId || 'B站直播';
        }

        function getBilibiliLiveRoomConfig(roomId) {
            const normalizedRoomId = String(roomId || '').trim();
            return bilibiliLiveRooms.find(item => String(item?.roomId || '').trim() === normalizedRoomId) || null;
        }

        function readLastBilibiliLiveRoomId() {
            try {
                return String(localStorage.getItem(BILIBILI_LAST_ROOM_KEY) || '').trim();
            } catch (error) {
                return '';
            }
        }

        function writeLastBilibiliLiveRoomId(roomId) {
            try {
                const normalizedRoomId = String(roomId || '').trim();
                if (!normalizedRoomId) return;
                localStorage.setItem(BILIBILI_LAST_ROOM_KEY, normalizedRoomId);
            } catch (error) {
            }
        }

        function normalizeBilibiliOpenLiveGroupKey(value) {
            const normalized = String(value || '').trim().toUpperCase();
            if (normalized.includes('SNH48')) return 'SNH48';
            if (normalized.includes('GNZ48')) return 'GNZ48';
            if (normalized.includes('BEJ48')) return 'BEJ48';
            if (normalized.includes('CKG48')) return 'CKG48';
            if (normalized.includes('CGT48')) return 'CGT48';
            if (normalized.includes('IDFT')) return 'IDFT';
            return '';
        }

        function getBilibiliOpenLiveGroupInfo(roomId) {
            const room = getBilibiliLiveRoomConfig(roomId);
            const roomName = String(room?.title || roomId || '').trim();
            const groupKey = normalizeBilibiliOpenLiveGroupKey(roomName);
            const groupMap = {
                SNH48: { groupId: 10, label: 'SNH48' },
                BEJ48: { groupId: 11, label: 'BEJ48' },
                GNZ48: { groupId: 12, label: 'GNZ48' },
                CKG48: { groupId: 14, label: 'CKG48' },
                CGT48: { groupId: 21, label: 'CGT48' },
                IDFT: { groupId: 15, label: 'IDFT' }
            };

            if (!groupKey || !groupMap[groupKey]) {
                return null;
            }

            return {
                roomName,
                groupKey,
                groupId: groupMap[groupKey].groupId,
                label: groupMap[groupKey].label
            };
        }

        function normalizeBilibiliLiveRoomConfig(item) {
            if (!item || typeof item !== 'object') return null;

            const roomId = String(item.roomId || item.id || item.value || '').trim();
            const title = String(item.title || item.name || item.label || '').trim();
            if (!roomId || !title) return null;

            return { roomId, title };
        }

        function normalizeBilibiliLiveConfig(rawConfig) {
            const source = Array.isArray(rawConfig) ? { rooms: rawConfig } : (rawConfig && typeof rawConfig === 'object' ? rawConfig : {});
            const normalizedRooms = Array.isArray(source.rooms)
                ? source.rooms.map(normalizeBilibiliLiveRoomConfig).filter(Boolean)
                : [];

            return {
                rooms: normalizedRooms.length ? normalizedRooms : DEFAULT_BILIBILI_LIVE_CONFIG.rooms.slice()
            };
        }

        function readBilibiliLiveConfigCache() {
            try {
                const raw = localStorage.getItem(BILIBILI_LIVE_CONFIG_CACHE_KEY);
                if (!raw) return null;
                return normalizeBilibiliLiveConfig(JSON.parse(raw));
            } catch (error) {
                console.warn('读取 B站直播配置缓存失败:', error);
                return null;
            }
        }

        function writeBilibiliLiveConfigCache(config) {
            try {
                localStorage.setItem(BILIBILI_LIVE_CONFIG_CACHE_KEY, JSON.stringify(config));
            } catch (error) {
                console.warn('写入 B站直播配置缓存失败:', error);
            }
        }

        function fetchBilibiliLiveConfig() {
            if (!bilibiliLiveConfigPromise) {
                bilibiliLiveConfigPromise = fetch(`${BILIBILI_LIVE_CONFIG_URL}?t=${Date.now()}`, {
                    method: 'GET',
                    cache: 'no-store'
                })
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return res.json();
                    })
                    .then(normalizeBilibiliLiveConfig)
                    .then(config => {
                        writeBilibiliLiveConfigCache(config);
                        return config;
                    })
                    .catch(err => {
                        console.warn('加载 B站直播配置失败，使用默认房间:', err);
                        bilibiliLiveConfigPromise = Promise.resolve(normalizeBilibiliLiveConfig(DEFAULT_BILIBILI_LIVE_CONFIG));
                        return bilibiliLiveConfigPromise;
                    });
            }

            return bilibiliLiveConfigPromise;
        }

        function setBilibiliLiveSummary(message = '', isError = false) {
            const summaryEl = document.getElementById('bilibili-live-summary');
            if (!summaryEl) return;
            summaryEl.textContent = message || '';
            summaryEl.style.display = message ? 'block' : 'none';
            summaryEl.style.color = isError ? '#ff7b8b' : 'var(--text-sub)';
        }

        function setBilibiliLiveStatus(message = '', isError = false) {
            const statusEl = document.getElementById('bilibili-live-status');
            if (statusEl) {
                statusEl.textContent = '';
                statusEl.style.display = 'none';
            }
            setBilibiliLiveSummary(message, isError);
        }

        function setBilibiliLivePlaceholder(title = '等待连接', description = '点选上方直播间按钮后，将自动在软件内开始播放。') {
            const placeholderEl = document.getElementById('bilibili-live-player-placeholder');
            const titleEl = document.getElementById('bilibili-live-placeholder-title');
            const descEl = document.getElementById('bilibili-live-placeholder-desc');
            if (titleEl) titleEl.textContent = title || '';
            if (descEl) {
                descEl.textContent = description || '';
                descEl.style.display = description ? 'block' : 'none';
            }
            if (placeholderEl) placeholderEl.style.display = 'flex';
        }

        function setBilibiliLiveConnectingPlaceholder() {
            setBilibiliLivePlaceholder('正在连接直播', '正在切换直播流，请稍等...');
        }

        function syncBilibiliLivePlaceholderForSelection() {
            if (bilibiliDp || bilibiliFlvPlayer) return;

            const selectedRoomId = String(document.getElementById('bilibili-live-room-id')?.value || '').trim();
            if (!selectedRoomId) {
                setBilibiliLivePlaceholder();
                return;
            }

            const roomStatus = bilibiliLiveStatusMap[selectedRoomId];
            if (roomStatus && roomStatus.live === false) {
                setBilibiliLivePlaceholder('未开播', '');
                return;
            }

            if (roomStatus && roomStatus.live === true) {
                setBilibiliLiveConnectingPlaceholder();
                return;
            }

            setBilibiliLivePlaceholder();
        }

        function formatBilibiliLiveError(error, fallback = '操作失败，请稍后重试') {
            const rawMessage = String(error?.message || error || '').trim();
            if (!rawMessage) return fallback;

            const chineseSegments = rawMessage.match(/[\u4e00-\u9fa5][\u4e00-\u9fa5a-zA-Z0-9，。、“”‘’：:（）()《》〈〉【】·、\-\/\s]*/g);
            const normalizedChinese = Array.isArray(chineseSegments)
                ? chineseSegments.join(' ').replace(/\s+/g, ' ').trim()
                : '';

            if (normalizedChinese) {
                if (normalizedChinese.includes('当前未开播')) return '该直播间当前未开播';
                if (normalizedChinese.includes('未找到')) return '未找到对应直播间';
                if (normalizedChinese.includes('播放器容器不存在')) return '播放器初始化失败';
                if (normalizedChinese.includes('获取') && normalizedChinese.includes('失败')) return normalizedChinese;
                return normalizedChinese;
            }

            if (/not live|not streaming|offline/i.test(rawMessage)) return '该直播间当前未开播';
            if (/not found|no room/i.test(rawMessage)) return '未找到对应直播间';
            if (/timeout|network|fetch/i.test(rawMessage)) return '网络连接失败，请稍后重试';
            return fallback;
        }

        function shouldSuppressBilibiliLiveSummary() {
            const summaryText = String(document.getElementById('bilibili-live-summary')?.textContent || '').trim();
            return summaryText === '该直播间当前未开播' || summaryText === '未找到对应直播间';
        }

        function formatBilibiliOpenLiveTimeValue(value) {
            const timestamp = Number(value);
            if (!Number.isFinite(timestamp) || timestamp <= 0) {
                return '';
            }

            const date = new Date(timestamp);
            const pad = num => String(num).padStart(2, '0');
            return {
                date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
                time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
            };
        }

        function formatBilibiliOpenLiveTimeRange(openLiveInfo = null) {
            if (!openLiveInfo) {
                return '';
            }

            const startLabel = formatBilibiliOpenLiveTimeValue(openLiveInfo.stime || openLiveInfo.startTime);
            const endLabel = formatBilibiliOpenLiveTimeValue(openLiveInfo.endTime);
            if (startLabel && endLabel) {
                if (startLabel.date === endLabel.date) {
                    return `${startLabel.date} ${startLabel.time}-${endLabel.time}`;
                }

                return `${startLabel.date} ${startLabel.time} - ${endLabel.date} ${endLabel.time}`;
            }

            if (startLabel) {
                return `${startLabel.date} ${startLabel.time}`;
            }

            if (endLabel) {
                return `${endLabel.date} ${endLabel.time}`;
            }

            return '';
        }

        async function refreshBilibiliCurrentOpenLiveInfo(roomId = '') {
            const token = getAppToken ? getAppToken() : (localStorage.getItem('yaya_p48_token') || '');
            const pa = window.getPA ? window.getPA() : null;
            const groupInfo = getBilibiliOpenLiveGroupInfo(roomId || document.getElementById('bilibili-live-room-id')?.value || bilibiliCurrentRoomId);
            if (!token) {
                bilibiliCurrentOpenLiveInfo = null;
                bilibiliCurrentOpenLiveGroupKey = '';
                return null;
            }

            if (!groupInfo) {
                bilibiliCurrentOpenLiveInfo = null;
                bilibiliCurrentOpenLiveGroupKey = '';
                return null;
            }

            try {
                const result = await ipcRenderer.invoke('fetch-open-live-public-list', {
                    token,
                    pa,
                    groupId: groupInfo.groupId,
                    next: 0,
                    record: false,
                    debug: false
                });
                const liveList = Array.isArray(result?.content?.liveList) ? result.content.liveList : [];
                bilibiliCurrentOpenLiveInfo = liveList.find(item => Number(item?.status) === 2) || null;
                bilibiliCurrentOpenLiveGroupKey = groupInfo.groupKey;
                return bilibiliCurrentOpenLiveInfo;
            } catch (error) {
                bilibiliCurrentOpenLiveInfo = null;
                bilibiliCurrentOpenLiveGroupKey = '';
                return null;
            }
        }

        function applyBilibiliLiveConfig(config) {
            const normalizedConfig = normalizeBilibiliLiveConfig(config);
            bilibiliLiveRooms = normalizedConfig.rooms.slice();

            const roomInput = document.getElementById('bilibili-live-room-id');
            const roomIds = getBilibiliLiveRoomIds();
            const currentValue = String(roomInput?.value || '').trim();
            const rememberedRoomId = readLastBilibiliLiveRoomId();
            const nextValue = roomIds.includes(currentValue)
                ? currentValue
                : (roomIds.includes(rememberedRoomId) ? rememberedRoomId : (roomIds[0] || ''));
            if (roomInput) {
                roomInput.value = nextValue;
            }

            renderBilibiliLiveRoomButtons();
            syncBilibiliLivePlaceholderForSelection();
        }

        function initBilibiliLiveConfig() {
            const cachedConfig = readBilibiliLiveConfigCache();
            if (cachedConfig) {
                applyBilibiliLiveConfig(cachedConfig);
            } else {
                applyBilibiliLiveConfig(normalizeBilibiliLiveConfig(DEFAULT_BILIBILI_LIVE_CONFIG));
            }

            fetchBilibiliLiveConfig()
                .then(config => {
                    applyBilibiliLiveConfig(config);
                })
                .catch(() => { });
        }

        function renderBilibiliLiveRoomButtons() {
            const stripEl = document.getElementById('bilibili-live-room-strip');
            if (!stripEl) return;

            const roomCount = Math.max(1, bilibiliLiveRooms.length);
            stripEl.style.setProperty('--bilibili-room-count', String(roomCount));
            stripEl.style.setProperty('--bilibili-visible-room-count', String(Math.min(roomCount, 10)));
            stripEl.innerHTML = '';
            bilibiliLiveRooms.forEach(room => {
                const roomId = String(room?.roomId || '').trim();
                const roomName = String(room?.title || '').trim() || roomId;
                if (!roomId) return;

                const roomStatus = bilibiliLiveStatusMap[roomId] || {};
                const isLive = !!roomStatus.live;
                const isPlaying = roomId === bilibiliCurrentRoomId && !!(bilibiliDp || bilibiliFlvPlayer);
                const isActive = roomId === String(document.getElementById('bilibili-live-room-id')?.value || '').trim();

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'bilibili-room-btn';
                button.setAttribute('data-bilibili-room-id', roomId);
                button.classList.toggle('active', roomId === String(document.getElementById('bilibili-live-room-id')?.value || '').trim());
                button.classList.toggle('is-live', isLive);
                button.classList.toggle('is-offline', !isLive);
                button.classList.toggle('is-playing', isPlaying);
                button.classList.toggle('active', isActive);
                button.innerHTML = `
                    <span class="bilibili-room-btn-name">${escapePrivateMessageHtml(roomName)}</span>
                    <span class="bilibili-room-btn-badge">${isPlaying ? '播放中' : (isLive ? '直播中' : '未开播')}</span>
                `;
                button.onclick = () => selectBilibiliLiveRoom(roomId, true);
                stripEl.appendChild(button);
            });
        }

        async function loadBilibiliLiveStatuses() {
            try {
                const statuses = await ipcRenderer.invoke('get-bilibili-live-statuses', getBilibiliLiveRoomIds());
                bilibiliLiveStatusMap = {};
                (Array.isArray(statuses) ? statuses : []).forEach(item => {
                    const key = String(item?.requestedRoomId || '').trim();
                    if (key) bilibiliLiveStatusMap[key] = item;
                });

                renderBilibiliLiveRoomButtons();
                syncBilibiliLivePlaceholderForSelection();
                const currentMetaRoomId = String(document.getElementById('bilibili-live-room-id')?.value || bilibiliCurrentRoomId || '').trim();
                if (currentMetaRoomId) {
                    await refreshBilibiliCurrentOpenLiveInfo(currentMetaRoomId);
                    renderBilibiliLiveMeta(bilibiliLiveStatusMap[currentMetaRoomId] || {
                        requestedRoomId: currentMetaRoomId,
                        realRoomId: currentMetaRoomId
                    }, currentMetaRoomId);
                } else {
                    bilibiliCurrentOpenLiveInfo = null;
                    bilibiliCurrentOpenLiveGroupKey = '';
                }
                if (!(bilibiliDp || bilibiliFlvPlayer)) {
                    setBilibiliLiveSummary('');
                }

                if (bilibiliLiveAutoConnectPending) {
                    bilibiliLiveAutoConnectPending = false;
                    const selectedRoomId = String(document.getElementById('bilibili-live-room-id')?.value || '').trim();
                    if (selectedRoomId && bilibiliLiveStatusMap[selectedRoomId]?.live && !(bilibiliDp || bilibiliFlvPlayer)) {
                        await selectBilibiliLiveRoom(selectedRoomId, true);
                        return;
                    }

                    const rememberedRoomId = readLastBilibiliLiveRoomId();
                    if (rememberedRoomId && bilibiliLiveStatusMap[rememberedRoomId]?.live && !(bilibiliDp || bilibiliFlvPlayer)) {
                        await selectBilibiliLiveRoom(rememberedRoomId, true);
                        return;
                    }

                    const liveRooms = getBilibiliLiveRoomIds().filter(roomId => bilibiliLiveStatusMap[roomId]?.live);
                    if (liveRooms.length === 1 && !(bilibiliDp || bilibiliFlvPlayer)) {
                        await selectBilibiliLiveRoom(liveRooms[0], true);
                    }
                }
            } catch (error) {
                bilibiliLiveAutoConnectPending = false;
                if (!(bilibiliDp || bilibiliFlvPlayer)) {
                    setBilibiliLiveSummary('');
                }
            }
        }

        function startBilibiliLiveStatusPolling() {
            if (bilibiliLiveStatusTimer) {
                clearInterval(bilibiliLiveStatusTimer);
            }

            loadBilibiliLiveStatuses();
            bilibiliLiveStatusTimer = setInterval(() => {
                if (getCurrentViewName() === 'bilibili-live') {
                    loadBilibiliLiveStatuses();
                }
            }, 60000);
        }

        function enterBilibiliLiveView() {
            bilibiliLiveAutoConnectPending = true;
            renderBilibiliLiveRoomButtons();
            syncBilibiliLivePlaceholderForSelection();
            startBilibiliLiveStatusPolling();
        }

        function stopBilibiliLiveStatusPolling() {
            if (bilibiliLiveStatusTimer) {
                clearInterval(bilibiliLiveStatusTimer);
                bilibiliLiveStatusTimer = null;
            }
        }

        async function selectBilibiliLiveRoom(roomId, autoConnect = false) {
            const roomInput = document.getElementById('bilibili-live-room-id');
            const nextRoomId = String(roomId || '').trim();
            const previousRoomId = String(roomInput?.value || '').trim();
            if (roomInput) {
                roomInput.value = nextRoomId;
            }
            writeLastBilibiliLiveRoomId(nextRoomId);
            renderBilibiliLiveRoomButtons();
            syncBilibiliLivePlaceholderForSelection();
            await refreshBilibiliCurrentOpenLiveInfo(nextRoomId);
            renderBilibiliLiveMeta(bilibiliLiveStatusMap[nextRoomId] || {
                requestedRoomId: nextRoomId,
                realRoomId: nextRoomId,
                title: getBilibiliLiveRoomName(nextRoomId)
            }, nextRoomId);

            if (autoConnect) {
                const isSameRoom = previousRoomId === nextRoomId;
                const hasActivePlayer = !!(bilibiliDp || bilibiliFlvPlayer);
                if (isSameRoom && hasActivePlayer) {
                    return;
                }
                await connectBilibiliLive();
            }
        }

        function resetBilibiliLiveMeta() {
            const metaEl = document.getElementById('bilibili-live-meta');
            const titleEl = document.getElementById('bilibili-live-title');
            const upEl = document.getElementById('bilibili-live-up');
            const roomMetaEl = document.getElementById('bilibili-live-room-meta');
            if (metaEl) metaEl.style.display = 'none';
            if (titleEl) titleEl.textContent = '';
            if (upEl) upEl.textContent = '';
            if (roomMetaEl) roomMetaEl.textContent = '';
        }

        function renderBilibiliLiveMeta(info = {}, roomId = '') {
            const metaEl = document.getElementById('bilibili-live-meta');
            const titleEl = document.getElementById('bilibili-live-title');
            const upEl = document.getElementById('bilibili-live-up');
            const roomMetaEl = document.getElementById('bilibili-live-room-meta');
            const targetRoomId = String(roomId || document.getElementById('bilibili-live-room-id')?.value || bilibiliCurrentRoomId || '').trim();
            const roomConfig = getBilibiliLiveRoomConfig(targetRoomId);
            const groupInfo = getBilibiliOpenLiveGroupInfo(targetRoomId);
            const currentOpenLive = groupInfo && bilibiliCurrentOpenLiveGroupKey === groupInfo.groupKey
                ? bilibiliCurrentOpenLiveInfo
                : null;

            if (metaEl) metaEl.style.display = 'block';
            if (titleEl) {
                titleEl.textContent = currentOpenLive?.title || info.title || roomConfig?.title || 'B站直播';
            }

            if (upEl) {
                if (currentOpenLive?.subTitle) {
                    upEl.textContent = currentOpenLive.subTitle;
                } else {
                    upEl.textContent = info.uname ? `UP 主：${info.uname}` : 'UP 主信息暂不可用';
                }
            }

            const roomMetaParts = [];
            const liveTimeRange = formatBilibiliOpenLiveTimeRange(currentOpenLive);
            if (liveTimeRange) {
                roomMetaParts.push(liveTimeRange);
            }
            if (roomMetaEl) roomMetaEl.textContent = roomMetaParts.join(' · ');
        }

        async function destroyBilibiliLivePlayer(resetMeta = true) {
            try {
                if (bilibiliFlvPlayer) {
                    bilibiliFlvPlayer.pause();
                    bilibiliFlvPlayer.unload();
                    bilibiliFlvPlayer.detachMediaElement();
                    bilibiliFlvPlayer.destroy();
                }
            } catch (error) { }
            bilibiliFlvPlayer = null;

            try {
                if (bilibiliDp) {
                    bilibiliDp.destroy();
                }
            } catch (error) { }
            bilibiliDp = null;

            try {
                await ipcRenderer.invoke('stop-live-proxy');
            } catch (error) { }

            bilibiliCurrentRoomId = '';
            renderBilibiliLiveRoomButtons();

            const playerEl = document.getElementById('bilibili-live-player');
            const placeholderEl = document.getElementById('bilibili-live-player-placeholder');
            if (playerEl) {
                playerEl.innerHTML = '';
                playerEl.style.display = 'none';
            }
            if (placeholderEl) syncBilibiliLivePlaceholderForSelection();
            if (resetMeta) resetBilibiliLiveMeta();
        }

        function buildBilibiliCustomType(localUrl) {
            return function customFlv(video) {
                if (!(window.mpegts && typeof window.mpegts.isSupported === 'function' && window.mpegts.isSupported())) {
                    video.src = localUrl;
                    return;
                }

                if (bilibiliFlvPlayer) {
                    try {
                        bilibiliFlvPlayer.pause();
                        bilibiliFlvPlayer.unload();
                        bilibiliFlvPlayer.detachMediaElement();
                        bilibiliFlvPlayer.destroy();
                    } catch (error) { }
                    bilibiliFlvPlayer = null;
                }

                bilibiliFlvPlayer = window.mpegts.createPlayer({
                    type: 'flv',
                    url: localUrl,
                    isLive: true,
                    enableWorker: true,
                    enableStashBuffer: false,
                    stashInitialSize: 128
                });
                bilibiliFlvPlayer.attachMediaElement(video);
                bilibiliFlvPlayer.load();
            };
        }

        async function connectBilibiliLive() {
            const roomInput = document.getElementById('bilibili-live-room-id');
            const roomId = String(roomInput?.value || '').trim();
            if (!roomId) {
                setBilibiliLiveStatus('请选择直播间', true);
                return;
            }

            setBilibiliLiveStatus('');
            setBilibiliLiveConnectingPlaceholder();

            try {
                await refreshBilibiliCurrentOpenLiveInfo(roomId);
                const info = await ipcRenderer.invoke('resolve-bilibili-live', roomId);
                bilibiliCurrentRoomId = roomId;
                renderBilibiliLiveMeta(info, roomId);
                setBilibiliLiveSummary('');
                renderBilibiliLiveRoomButtons();

                await destroyBilibiliLivePlayer(false);
                bilibiliCurrentRoomId = roomId;
                renderBilibiliLiveRoomButtons();

                const localUrl = await ipcRenderer.invoke('start-live-proxy', {
                    url: info.streamUrl,
                    headers: info.proxyHeaders || {}
                });
                const playerEl = document.getElementById('bilibili-live-player');
                const placeholderEl = document.getElementById('bilibili-live-player-placeholder');

                if (!playerEl) {
                    throw new Error('播放器容器不存在');
                }

                playerEl.innerHTML = '<div id="bilibili-dplayer-container" style="width:100%; height:100%;"></div>';
                playerEl.style.display = 'block';
                if (placeholderEl) placeholderEl.style.display = 'none';

                bilibiliDp = new DPlayer({
                    container: document.getElementById('bilibili-dplayer-container'),
                    live: true,
                    autoplay: true,
                    screenshot: false,
                    hotkey: false,
                    theme: '#FF8EBF',
                    video: {
                        url: localUrl,
                        type: 'customFlv',
                        customType: {
                            customFlv: buildBilibiliCustomType(localUrl)
                        }
                    }
                });

                setBilibiliLiveStatus('');
                loadBilibiliLiveStatuses();
                setTimeout(() => {
                    if (bilibiliDp && typeof bilibiliDp.play === 'function') {
                        bilibiliDp.play().catch(() => { });
                    }
                }, 300);
            } catch (error) {
                await destroyBilibiliLivePlayer(false);
                const friendlyMessage = formatBilibiliLiveError(error, '连接直播失败，请稍后重试');
                setBilibiliLiveStatus(friendlyMessage, true);
                if (friendlyMessage === '该直播间当前未开播' || friendlyMessage === '未找到对应直播间') {
                    setBilibiliLivePlaceholder(
                        friendlyMessage === '该直播间当前未开播' ? '未开播' : friendlyMessage,
                        ''
                    );
                    setBilibiliLiveSummary('');
                }
            }
        }

        async function stopBilibiliLive() {
            await destroyBilibiliLivePlayer(false);
            setBilibiliLiveStatus('已停止播放');
        }

        return {
            enterBilibiliLiveView,
            initBilibiliLiveConfig,
            renderBilibiliLiveRoomButtons,
            startBilibiliLiveStatusPolling,
            stopBilibiliLiveStatusPolling,
            destroyBilibiliLivePlayer,
            connectBilibiliLive,
            stopBilibiliLive
        };
    };
})();
