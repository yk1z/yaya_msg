        function handleSearch(keyword) {
            const resultBox = document.getElementById('search-results');
            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }

            if (!isMemberDataLoaded) {
                if (typeof loadMemberData === 'function') loadMemberData();
                return;
            }

            const lowerKw = keyword.toLowerCase();

            let matches = memberData.filter(m => {
                const matchName = m.ownerName.includes(keyword);

                const pinyin = m.pinyin || "";
                const matchPinyin = pinyin.toLowerCase().includes(lowerKw);

                const initials = getPinyinInitials(pinyin);
                const matchInitials = initials.toLowerCase().includes(lowerKw);

                return matchName || matchPinyin || matchInitials;
            });

            matches.sort(memberSortLogic);

            if (matches.length > 0) {
                const html = matches.map(m => {
                    const isInactive = m.isInGroup === false;
                    const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';

                    let colorStyle = '';
                    if (typeof getTeamStyle === 'function') {
                        colorStyle = getTeamStyle(m.team, isInactive);
                    }

                    return `<div class="suggestion-item" 
                 onclick="selectToolMember('${m.ownerName}', '${m.serverId}', '${m.channelId}', '${m.yklzId || ''}')"
                 style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight:bold; ${baseStyle}">${m.ownerName}</span>
                <span class="team-tag" style="${baseStyle} ${colorStyle}">${m.team}</span>
            </div>`;
                }).join('');

                resultBox.innerHTML = html;
                resultBox.style.display = 'block';
            } else {
                resultBox.innerHTML = '<div class="suggestion-item" style="cursor:default; color:var(--text-sub);">未找到该成员</div>';
                resultBox.style.display = 'block';
            }
        }

        let isFetchSmallRoomMode = false;
        let isRoomAlbumSmallRoomMode = false;
        let isRoomRadioSmallRoomMode = false;

        function updateFetchRoomTypeUi() {
            const channelInput = document.getElementById('tool-channel');
            const channelLabel = document.getElementById('tool-channel-label');
            const toggleBtn = document.getElementById('btn-toggle-fetch-room-type');
            if (!channelInput || !channelLabel || !toggleBtn) return;

            const roomTypeText = isFetchSmallRoomMode ? '小房间' : '大房间';
            channelLabel.textContent = `${roomTypeText} Channel ID`;
            channelInput.placeholder = `${roomTypeText} Channel ID`;
            toggleBtn.textContent = roomTypeText;
        }

        function applyFetchChannelValue() {
            const channelInput = document.getElementById('tool-channel');
            if (!channelInput) return;

            const bigChannelId = channelInput.dataset.bigChannelId || '';
            const smallChannelId = channelInput.dataset.smallChannelId || '';
            channelInput.value = isFetchSmallRoomMode ? smallChannelId : bigChannelId;
        }

        function selectToolMember(name, serverId, channelId, smallChannelId = '') {
            currentSelectedMemberName = name;
            document.getElementById('member-search').value = name;
            document.getElementById('tool-server').value = serverId;
            const channelInput = document.getElementById('tool-channel');
            channelInput.dataset.bigChannelId = channelId || '';
            channelInput.dataset.smallChannelId = smallChannelId || '';
            applyFetchChannelValue();
            document.getElementById('search-results').style.display = 'none';
            document.getElementById('msg-result').innerHTML = '<div style="text-align:center;padding:20px;color:#999">已选择成员: ' + name + '<br>点击“抓取最新”开始</div>';
        }

        function toggleFetchRoomType() {
            isFetchSmallRoomMode = !isFetchSmallRoomMode;
            updateFetchRoomTypeUi();
            applyFetchChannelValue();
        }

        function updateRoomAlbumRoomTypeUi() {
            const channelInput = document.getElementById('room-album-channel-id');
            const channelLabel = document.getElementById('room-album-channel-label');
            const toggleBtn = document.getElementById('btn-toggle-room-album-room-type');
            if (!channelInput || !channelLabel || !toggleBtn) return;

            const roomTypeText = isRoomAlbumSmallRoomMode ? '小房间' : '大房间';
            channelLabel.textContent = `${roomTypeText} Channel ID`;
            channelInput.placeholder = `${roomTypeText} Channel ID`;
            toggleBtn.textContent = roomTypeText;
        }

        function applyRoomAlbumChannelValue() {
            const channelInput = document.getElementById('room-album-channel-id');
            if (!channelInput) return;

            const bigChannelId = channelInput.dataset.bigChannelId || '';
            const smallChannelId = channelInput.dataset.smallChannelId || '';
            channelInput.value = isRoomAlbumSmallRoomMode ? smallChannelId : bigChannelId;
        }

        function toggleRoomAlbumRoomType() {
            isRoomAlbumSmallRoomMode = !isRoomAlbumSmallRoomMode;
            updateRoomAlbumRoomTypeUi();
            applyRoomAlbumChannelValue();
        }

        function updateRoomRadioRoomTypeUi() {
            const channelInput = document.getElementById('room-radio-channel-id');
            const channelLabel = document.getElementById('room-radio-channel-label');
            const toggleBtn = document.getElementById('btn-toggle-room-radio-room-type');
            if (!channelInput || !channelLabel || !toggleBtn) return;

            const roomTypeText = isRoomRadioSmallRoomMode ? '小房间' : '大房间';
            channelLabel.textContent = `${roomTypeText} Channel ID`;
            channelInput.placeholder = `${roomTypeText} Channel ID`;
            toggleBtn.textContent = roomTypeText;
        }

        function applyRoomRadioChannelValue() {
            const channelInput = document.getElementById('room-radio-channel-id');
            if (!channelInput) return;

            const bigChannelId = channelInput.dataset.bigChannelId || '';
            const smallChannelId = channelInput.dataset.smallChannelId || '';
            channelInput.value = isRoomRadioSmallRoomMode ? smallChannelId : bigChannelId;
        }

        function toggleRoomRadioRoomType() {
            isRoomRadioSmallRoomMode = !isRoomRadioSmallRoomMode;
            updateRoomRadioRoomTypeUi();
            applyRoomRadioChannelValue();
        }

        updateFetchRoomTypeUi();
        updateRoomAlbumRoomTypeUi();
        updateRoomRadioRoomTypeUi();
        document.addEventListener('click', function (e) {
            const wrapper = document.querySelector('.search-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                document.getElementById('search-results').style.display = 'none';
            }
        });
        let currentPlayingItem = null;
        let liveAnnouncementDismissed = false;
        let currentViewName = 'home';
        let currentViewMode = null;
        const privateMessageListState = {
            items: [],
            cursor: Date.now(),
            hasMore: true,
            loading: false,
            initialized: false
        };
        const privateMessageDetailState = {
            targetUserId: '',
            title: '',
            avatar: './icon.png',
            cursor: 0,
            items: [],
            loading: false,
            hasMore: true,
            sending: false
        };
        const messageIndexLoadState = {
            loading: false,
            initialized: false,
            status: '正在初始化',
            detail: '请稍候'
        };

        function setMessageIndexLoadingState(loading, status = null, detail = null) {
            messageIndexLoadState.loading = loading;
            if (typeof status === 'string') messageIndexLoadState.status = status;
            if (typeof detail === 'string') messageIndexLoadState.detail = detail;

            if (window.__appStartupFailed) return;

            if (currentViewName === 'messages' && loading) {
                showShield(messageIndexLoadState.status, messageIndexLoadState.detail);
            } else if ((!loading || currentViewName !== 'messages') && isInitShieldVisible()) {
                hideShield();
            }
        }

        function syncMessageIndexLoadingShield() {
            if (window.__appStartupFailed) return;

            if (currentViewName === 'messages' && messageIndexLoadState.loading) {
                showShield(messageIndexLoadState.status, messageIndexLoadState.detail);
            } else if (isInitShieldVisible()) {
                hideShield();
            }
        }

        function mountSidebarPanelsToViews() {
            const downloadsHost = document.getElementById('downloads-panel-host');

            if (downloadsHost) {
                const downloadNode = document.getElementById('sb-download');
                if (downloadNode && downloadNode.parentElement !== downloadsHost) {
                    downloadsHost.appendChild(downloadNode);
                }
            }
        }

        function setSidebarHomeMode(isHome) {
            const sidebar = document.querySelector('.sidebar');
            const mainContent = document.getElementById('mainContentArea');
            if (!sidebar || !mainContent) return;

            mainContent.classList.toggle('home-mode', isHome);
        }

        function setGlobalSidebarVisible(isVisible) {
            const sidebar = document.querySelector('.sidebar');
            if (!sidebar) return;

            sidebar.classList.remove('collapsed');
            sidebar.classList.toggle('app-sidebar-disabled', !isVisible);
            sidebar.classList.toggle('home-hidden', !isVisible);
        }

        function isMessageViewVisible() {
            return !!(scrollContainer && scrollContainer.style.display !== 'none' && scrollContainer.clientHeight > 0);
        }

        function ensureMessageViewportFilled() {
            if (!isMessageViewVisible()) return;
            if (renderedCount >= currentFilteredPosts.length) return;
            if (scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
                scheduleNextBatch();
            }
        }

        function toggleSidebar() {
            if (currentViewName !== 'home') {
                switchView('home');
            }
        }

        function toggleSidebarMode(mode) {
            const idsToHide = ['sb-members', 'sb-analysis', 'sb-search', 'sb-date', 'sb-type', 'statusMsg'];

            const settingsGroup = document.getElementById('sb-settings-group');
            const downloadModule = document.getElementById('sb-download');
            const loginGroup = document.getElementById('sb-login-group');
            const liveGroup = document.getElementById('sb-live-group');

            idsToHide.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = (id === 'statusMsg') ? 'block' : 'flex';
            });
            if (settingsGroup) settingsGroup.style.display = 'none';
            if (loginGroup) loginGroup.style.display = 'none';
            if (downloadModule) downloadModule.style.display = 'none';
            if (liveGroup) liveGroup.style.display = 'none';

            if (mode === 'media') {

                idsToHide.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });

            } else if (mode === 'login') {
                idsToHide.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
            }
        }

        function switchView(viewName, mode = null) {
            currentViewName = viewName;
            currentViewMode = mode;
            document.getElementById('backToTopBtn').classList.remove('show');
            const backBtn = document.getElementById('backToTopBtn');
            if (backBtn) backBtn.classList.remove('show');

            const homeView = document.getElementById('view-home');
            const msgView = document.getElementById('view-messages');
            const mediaView = document.getElementById('view-media');
            const downloadsView = document.getElementById('view-downloads');
            const databaseView = document.getElementById('view-database');
            const loginView = document.getElementById('view-login');
            const fetchView = document.getElementById('view-fetch');
            const privateMessagesView = document.getElementById('view-private-messages');
            const flipView = document.getElementById('view-flip');
            const profileView = document.getElementById('view-profile');
            const openLiveView = document.getElementById('view-open-live');
            const sendFlipView = document.getElementById('view-send-flip');
            const settingsView = document.getElementById('view-settings');
            const photosView = document.getElementById('view-photos');
            const roomAlbumView = document.getElementById('view-room-album');
            const roomRadioView = document.getElementById('view-room-radio');
            const audioProgramsView = document.getElementById('view-audio-programs');
            const videoLibraryView = document.getElementById('view-video-library');
            const musicLibraryView = document.getElementById('view-music-library');
            const followedRoomsView = document.getElementById('view-followed-rooms');

            if (homeView) homeView.style.display = 'none';
            if (msgView) msgView.style.display = 'none';
            if (mediaView) mediaView.style.display = 'none';
            if (downloadsView) downloadsView.style.display = 'none';
            if (databaseView) databaseView.style.display = 'none';
            if (loginView) loginView.style.display = 'none';
            if (fetchView) fetchView.style.display = 'none';
            if (privateMessagesView) privateMessagesView.style.display = 'none';
            if (flipView) flipView.style.display = 'none';
            if (profileView) profileView.style.display = 'none';
            if (openLiveView) openLiveView.style.display = 'none';
            if (sendFlipView) sendFlipView.style.display = 'none';
            if (settingsView) settingsView.style.display = 'none';
            if (photosView) photosView.style.display = 'none';
            if (roomAlbumView) roomAlbumView.style.display = 'none';
            if (roomRadioView) roomRadioView.style.display = 'none';
            if (audioProgramsView) audioProgramsView.style.display = 'none';
            if (videoLibraryView) videoLibraryView.style.display = 'none';
            if (musicLibraryView) musicLibraryView.style.display = 'none';
            if (followedRoomsView) followedRoomsView.style.display = 'none';

            destroyPlayers();

            if (viewName !== 'audio-programs') {
                if (typeof stopAudioProgram === 'function') stopAudioProgram();
            }

            if (viewName !== 'music-library') {
                const musicAudio = document.getElementById('music-native-audio');
                if (musicAudio) musicAudio.pause();
            }

            if (window.vodState) window.vodState.isSearchActive = false;

            if (typeof updateSidebarButtons === 'function') {
                updateSidebarButtons(viewName, mode);
            }

            if (viewName === 'home') {
                toggleSidebarMode('messages');
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(true);
                if (homeView) homeView.style.display = 'flex';

            } else if (viewName === 'media') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('media');
                if (mediaView) {
                    mediaView.style.display = 'flex';
                    mediaView.style.flexDirection = 'column';
                }

                const titleEl = document.getElementById('live-view-title');
                currentMode = mode;

                const vodControls = document.getElementById('media-list-controls');
                const vodPagination = document.getElementById('vod-pagination-controls');
                const liveControls = document.getElementById('live-list-controls');

                if (mode === 'live') {
                    titleEl.textContent = '正在直播';
                    if (vodControls) vodControls.style.display = 'none';
                    if (vodPagination) vodPagination.style.display = 'none';
                    if (liveControls) liveControls.style.display = 'flex';
                    fetchLiveList();
                } else if (mode === 'vod') {
                    titleEl.textContent = '录播回放';
                    if (vodControls) vodControls.style.display = 'flex';
                    if (vodPagination) vodPagination.style.display = 'flex';
                    if (liveControls) liveControls.style.display = 'none';
                    if (window.vodState) {
                        if (vodState.list.length === 0) {
                            ensurePageData(2).then(() => window.renderVODListUI());
                        } else {
                            window.renderVODListUI();
                        }
                    }
                }
                document.getElementById('live-player-view').style.display = 'none';
                document.getElementById('media-list-area').style.display = 'block';

            } else if (viewName === 'downloads') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (downloadsView) downloadsView.style.display = 'block';
                const downloadModule = document.getElementById('sb-download');
                if (downloadModule) downloadModule.style.display = 'flex';

            } else if (viewName === 'database') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (databaseView) databaseView.style.display = 'block';
                if (typeof window.mountDatabaseView === 'function') {
                    window.mountDatabaseView();
                }

            } else if (viewName === 'private-messages') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (privateMessagesView) privateMessagesView.style.display = 'block';
                if (typeof loadPrivateMessageList === 'function') {
                    loadPrivateMessageList({
                        reset: !privateMessageListState.initialized || privateMessageListState.items.length === 0,
                        loadAll: true
                    });
                }

            } else if (viewName === 'settings') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');

                const loginGroup = document.getElementById('sb-login-group');
                if (loginGroup) loginGroup.style.display = 'none';

                const liveGroup = document.getElementById('sb-live-group');
                if (liveGroup) liveGroup.style.display = 'none';

                if (settingsView) {
                    settingsView.style.display = 'block';
                    if (typeof loadCustomPaths === 'function') {
                        loadCustomPaths();
                    }
                }

            } else if (viewName === 'login') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (loginView) loginView.style.display = 'block';

                const savedToken = localStorage.getItem('yaya_p48_token');
                const tokenInput = document.getElementById('login-token');
                if (savedToken && tokenInput) tokenInput.value = savedToken;

                if (typeof appToken !== 'undefined' && (appToken || savedToken)) {
                    if (!appToken) appToken = savedToken;
                    checkToken();
                    loadMemberData();
                } else {
                    const panelInput = document.getElementById('panel-login');
                    const panelSuccess = document.getElementById('panel-logged-in');
                    if (panelInput) panelInput.style.display = 'block';
                    if (panelSuccess) panelSuccess.style.display = 'none';
                }

            } else if (viewName === 'fetch') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (fetchView) fetchView.style.display = 'block';

            } else if (viewName === 'flip') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (flipView) flipView.style.display = 'block';
                if (typeof flipCurrentPage !== 'undefined' && flipCurrentPage === 0) loadFlipList(0);

            } else if (viewName === 'send-flip') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');

                const token = typeof appToken !== 'undefined' ? appToken : localStorage.getItem('yaya_p48_token');
                if (!token) {
                    showToast('请先登录账号');
                    return switchView('login');
                }

                if (sendFlipView) sendFlipView.style.display = 'block';

                const btn = document.getElementById('btn-sb-send-flip');
                if (btn) {
                    document.querySelectorAll('.sidebar .btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }

                setTimeout(() => {
                    const input = document.getElementById('flip-send-member-input');
                    if (input) input.focus();
                }, 100);

            } else if (viewName === 'profile') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (profileView) profileView.style.display = 'block';

            } else if (viewName === 'photos') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (photosView) photosView.style.display = 'block';

            } else if (viewName === 'room-album') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (roomAlbumView) roomAlbumView.style.display = 'block';

            } else if (viewName === 'openlive') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (openLiveView) openLiveView.style.display = 'block';

            } else if (viewName === 'room-radio') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (roomRadioView) roomRadioView.style.display = 'block';

            } else if (viewName === 'audio-programs') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (audioProgramsView) audioProgramsView.style.display = 'flex';

                const list = document.getElementById('audio-programs-list');
                if (list && list.innerHTML.trim() === '') {
                    loadAudioPrograms(0);
                }

            } else if (viewName === 'music-library') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                const musicView = document.getElementById('view-music-library');
                if (musicView) {
                    musicView.style.display = 'flex';
                    const grid = document.getElementById('music-list-grid');
                    if (grid && grid.innerHTML.trim() === '') {
                        fetchAllMusicLibrary();
                    }
                }

            } else if (viewName === 'followed-rooms') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (followedRoomsView) {
                    followedRoomsView.style.display = 'block';
                    loadFollowedRooms();
                }

            } else if (viewName === 'video-library') {
                setGlobalSidebarVisible(false);
                setSidebarHomeMode(false);
                toggleSidebarMode('login');
                if (videoLibraryView) {
                    videoLibraryView.style.display = 'flex';


                    const grid = document.getElementById('video-list-grid');
                    if (grid && grid.innerHTML.trim() === '') {
                        fetchAllVideoLibrary();
                    }
                }

            } else {
                setGlobalSidebarVisible(true);
                setSidebarHomeMode(false);
                toggleSidebarMode('messages');
                if (msgView) {
                    msgView.style.display = 'block';
                    syncMessageIndexLoadingShield();
                    ensureMessageViewportFilled();
                }
            }

            if (viewName !== 'messages') {
                syncMessageIndexLoadingShield();
            }
        }


        function updateSidebarButtons(viewName, mode) {
            const bottomButtons = [
                { id: 'btn-sb-login', defaultText: '账号设置', targetView: 'login' },
                { id: 'btn-sb-fetch', defaultText: '抓取消息', targetView: 'fetch' },
                { id: 'btn-sb-flip', defaultText: '翻牌记录', targetView: 'flip' },
                { id: 'btn-sb-send-flip', defaultText: '发送翻牌', targetView: 'send-flip' },
                { id: 'btn-sb-profile', defaultText: '详细档案', targetView: 'profile' },
                { id: 'btn-sb-open-live', defaultText: '公演记录', targetView: 'openlive' },
                { id: 'btn-sb-settings', defaultText: '⚙️ 设置', targetView: 'settings' },
                { id: 'btn-sb-photos', defaultText: '个人相册', targetView: 'photos' },
                { id: 'btn-sb-room-album', defaultText: '房间相册', targetView: 'room-album' },
                { id: 'btn-sb-room-radio', defaultText: '房间电台', targetView: 'room-radio' },
                { id: 'btn-sb-audio-programs', defaultText: '电台', targetView: 'audio-programs' },
                { id: 'btn-sb-video-library', defaultText: '视频', targetView: 'video-library' },
                { id: 'btn-sb-music-library', defaultText: '音乐', targetView: 'music-library' },
                { id: 'btn-sb-followed-rooms', defaultText: '口袋房间', targetView: 'followed-rooms' },
            ];

            bottomButtons.forEach(btn => {
                const el = document.getElementById(btn.id);
                if (!el) return;

                if (viewName === btn.targetView) {
                    el.innerHTML = '返回主页';
                    el.className = 'btn btn-primary btn-full';
                    el.onclick = () => switchView('home');
                } else {
                    el.innerHTML = btn.defaultText;
                    el.className = 'btn btn-secondary btn-full';
                    el.onclick = () => switchView(btn.targetView);
                }
            });

            const btnLive = document.getElementById('btn-sb-live');
            const btnVod = document.getElementById('btn-sb-vod');
            if (btnLive && btnVod) {
                if (viewName === 'media' && mode === 'live') {
                    btnLive.innerHTML = '返回主页';
                    btnLive.className = 'btn btn-primary';
                    btnLive.onclick = () => switchView('home');
                    btnVod.innerHTML = '录播回放';
                    btnVod.className = 'btn btn-secondary';
                    btnVod.onclick = () => switchView('media', 'vod');
                } else if (viewName === 'media' && mode === 'vod') {
                    btnLive.innerHTML = '正在直播';
                    btnLive.className = 'btn btn-secondary';
                    btnLive.onclick = () => switchView('media', 'live');
                    btnVod.innerHTML = '返回主页';
                    btnVod.className = 'btn btn-primary';
                    btnVod.onclick = () => switchView('home');
                } else {
                    btnLive.innerHTML = '正在直播';
                    btnLive.className = 'btn btn-secondary';
                    btnLive.onclick = () => switchView('media', 'live');
                    btnVod.innerHTML = '录播回放';
                    btnVod.className = 'btn btn-secondary';
                    btnVod.onclick = () => switchView('media', 'vod');
                }
            }
        }

        function cancelDownloadTask(taskId) {
            ipcRenderer.send('cancel-download', {
                taskId
            });
            const taskEl = document.getElementById(taskId);
            if (taskEl) {
                const liveId = taskEl.getAttribute('data-liveid');
                if (liveId) {
                    delete downloadStatusMap[liveId];
                    const mainBtn = document.querySelector(`.vod-btn-${liveId}`);
                    if (mainBtn) {
                        mainBtn.classList.remove('btn-downloading');
                        mainBtn.classList.remove('btn-success');
                        mainBtn.innerText = '下载';
                        mainBtn.disabled = false;
                        mainBtn.style.pointerEvents = 'auto';
                        mainBtn.style.opacity = '1';
                    }
                }
                taskEl.style.transition = 'all 0.3s ease';
                taskEl.style.opacity = '0';
                taskEl.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    taskEl.remove();
                    const downloadList = document.getElementById('downloadList');
                    if (downloadList && downloadList.children.length === 0) {
                        downloadList.innerHTML = '<div style="text-align: center; color: var(--text-sub); font-size: 11px; padding: 10px;">暂无下载任务</div>';
                    }
                }, 300);
            }
        }
        let downloadStatusMap = {};

        function formatDuration(ms) {
            if (!ms || isNaN(ms)) return "00:00";
            const seconds = Math.floor(ms / 1000);
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        const {
            ipcRenderer,
            fs,
            path,
            https,
            readline,
            appDir,
            storagePaths,
            openExternal
        } = window.desktop;
        const memberNameMap = new Map();
        const memberIdSet = new Set();
        const memberTeamMap = new Map();

        async function loadMemberIdMap() {
            const csvPath = storagePaths.membersFile;

            const isUpdatedThisSession = sessionStorage.getItem('member_updated_this_session');

            if (!fs.existsSync(csvPath) || !isUpdatedThisSession) {
                console.log("启动软件：正在获取最新的成员列表...");
                sessionStorage.setItem('member_updated_this_session', 'true');
                await autoUpdateMemberData();
                return;
            }

            try {
                if (!fs.existsSync(csvPath)) {
                    statusMsg.textContent = "❌ 无法获取成员数据";
                    return;
                }

                const data = fs.readFileSync(csvPath, 'utf-8');
                const lines = data.split('\n');

                memberNameMap.set('clear_all', true);
                memberNameMap.clear();
                memberIdSet.clear();
                memberTeamMap.clear();

                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('[source') || trimmed.startsWith('ownerName')) return;
                    const parts = trimmed.split(',');
                    if (parts.length >= 2) {
                        const name = parts[0].trim();
                        const id = parts[1].trim();
                        const team = parts[2] ? parts[2].trim() : '';
                        memberNameMap.set(name, id);
                        if (id) memberIdSet.add(id);
                        if (team) memberTeamMap.set(name, team);

                        if (name.includes('-')) {
                            const simpleName = name.split('-')[1];
                            if (!memberNameMap.has(simpleName)) {
                                memberNameMap.set(simpleName, id);
                                if (team) memberTeamMap.set(simpleName, team);
                            }
                        }
                    }
                });

                initBestNames();
                statusMsg.textContent = "✅ 成员映射表加载完成";
            } catch (e) {
                console.error("加载映射表失败:", e);
                statusMsg.textContent = "❌ 映射表解析出错";
            }
        }
        let bestNameMapForDisplay = new Map();

        const DATA_BASE_URL = "https://yaya-data.pages.dev";
        const MUSIC_LYRICS_BASE_URL = `${DATA_BASE_URL}/lyrics`;
        const MUSIC_LYRICS_INDEX_URL = `${DATA_BASE_URL}/lyrics-index.json`;
        let musicLyricsIndexPromise = null;

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

        function parseMusicLrc(text) {
            const lines = String(text || '').split(/\r?\n/);
            const entries = [];
            const timeReg = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

            lines.forEach(rawLine => {
                const line = rawLine.replace(/\uFEFF/g, '');
                if (!line.trim()) return;
                if (/^\[(ti|ar|al|offset|tool|by|length):/i.test(line.trim())) return;

                const matches = [...line.matchAll(timeReg)];
                if (!matches.length) return;
                const content = line.replace(timeReg, '').trim();
                if (!content) return;

                matches.forEach(match => {
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

        async function autoUpdateMemberData() {
            const url = `${DATA_BASE_URL}/members.json?t=${Date.now()}`;
            const csvPath = storagePaths.membersFile;

            if (statusMsg) statusMsg.textContent = "正在更新完整成员列表...";

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json();
                if (!data.roomId && !Array.isArray(data.roomId)) {
                    throw new Error("JSON 数据格式不正确");
                }

                let csvContent = '\uFEFFownerName,id,team,roomId,serverId,channelId,groupName,periodName,teamId,pinyin,account,liveRoomId\n';

                let allMembers = [];
                if (Array.isArray(data.roomId)) allMembers = allMembers.concat(data.roomId);
                if (Array.isArray(data.members)) allMembers = allMembers.concat(data.members);
                if (Array.isArray(data.retired)) allMembers = allMembers.concat(data.retired);

                allMembers.forEach(member => {
                    const name = member.ownerName || '';
                    const id = member.id || '';
                    const team = member.team || '';
                    const roomId = member.roomId || '';

                    const serverId = member.serverId || '';
                    const channelId = member.channelId || '';
                    const groupName = member.groupName || '';
                    const periodName = member.periodName || '';
                    const teamId = member.teamId || '';
                    const pinyin = member.pinyin || '';
                    const account = member.account || '';
                    const liveRoomId = member.liveRoomId || '';

                    if (id) {
                        csvContent += `${name},${id},${team},${roomId},${serverId},${channelId},${groupName},${periodName},${teamId},${pinyin},${account},${liveRoomId}\n`;
                    }
                });

                fs.writeFileSync(csvPath, csvContent, 'utf8');

                if (allMembers && allMembers.length > 0) {
                    memberData = allMembers;
                    isMemberDataLoaded = true;
                }

                loadMemberIdMap();

                if (statusMsg) statusMsg.textContent = `成员列表更新完成 (${allMembers.length}人)`;

                setTimeout(() => {
                    if (statusMsg) statusMsg.textContent = "软件已就绪";
                }, 3000);

            } catch (err) {
                console.error("自动更新成员 ID 失败:", err);
                if (statusMsg) statusMsg.textContent = "成员列表更新失败，使用本地缓存";
                loadMemberIdMap();
            }
        }

        function initBestNames() {
            bestNameMapForDisplay.clear();
            for (let [name, id] of memberNameMap) {
                if (!bestNameMapForDisplay.has(id) || name.length > bestNameMapForDisplay.get(id).length) {
                    bestNameMapForDisplay.set(id, name);
                }
            }
        }

        function selectMember(name) {
            const input = document.getElementById('vod-member-filter');
            const box = document.getElementById('member-suggestions');
            input.value = name;
            box.style.display = 'none';
            if (window.vodState) {
                vodState.currentPage = 1;
                ensurePageData(2).then(() => renderVODListUI());
            }
        }

        let currentImgZoom = 1;
        let isDraggingImg = false;
        let imgStartX = 0, imgStartY = 0, imgTranslateX = 0, imgTranslateY = 0;

        function openImageModal(src) {
            const modal = document.getElementById('imageModal');
            const img = document.getElementById('modalImg');

            img.src = src;
            modal.style.display = 'flex';

            currentImgZoom = 1;
            imgTranslateX = 0;
            imgTranslateY = 0;
            img.style.transform = `translate(0px, 0px) scale(1)`;
            img.style.transition = 'transform 0.2s ease-out';
            img.style.cursor = 'grab';
        }

        function closeImageModal() {
            document.getElementById('imageModal').style.display = 'none';
        }

        function getPreferredExternalPlayerName() {
            return window.desktop && window.desktop.platform === 'win32' ? 'PotPlayer' : 'VLC';
        }

        async function openMediaInExternalPlayer(url, options = {}) {
            const mediaUrl = String(url || '').trim();
            if (!mediaUrl) {
                if (options.silent !== true) {
                    showToast('媒体地址为空，无法播放');
                }
                return false;
            }

            try {
                const result = window.desktop && typeof window.desktop.openExternalPlayer === 'function'
                    ? await window.desktop.openExternalPlayer(mediaUrl)
                    : await window.ipcRenderer.invoke('open-external-player', { url: mediaUrl });

                if (result && result.success) {
                    return true;
                }

                if (options.silent !== true) {
                    showToast((result && result.msg) || `无法唤起 ${getPreferredExternalPlayerName()}`);
                }
            } catch (error) {
                if (options.silent !== true) {
                    showToast(`无法唤起 ${getPreferredExternalPlayerName()}`);
                }
                console.error('[外部播放器] 调用失败:', error);
            }

            return false;
        }

        function insertAudioPlayerIntoMessage(content, audioUrl) {
            if (!audioUrl || !content || content.querySelector('.audio-wrapper')) {
                return;
            }

            const player = createCustomAudioPlayer(audioUrl);
            const quoteBlock = content.querySelector('blockquote');

            if (quoteBlock) {
                player.style.display = 'inline-flex';
                player.style.margin = '0 0 12px 0';
                content.insertBefore(player, quoteBlock);
                return;
            }

            content.appendChild(player);
        }

        (function initImageViewerEvents() {
            const modal = document.getElementById('imageModal');
            const img = document.getElementById('modalImg');

            if (!modal || !img) return;

            img.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            modal.addEventListener('wheel', (e) => {
                if (modal.style.display !== 'flex') return;
                e.preventDefault();

                const zoomStep = 0.15;
                if (e.deltaY < 0) {
                    currentImgZoom += zoomStep;
                } else {
                    currentImgZoom -= zoomStep;
                }

                currentImgZoom = Math.max(0.2, Math.min(currentImgZoom, 10));

                img.style.transition = 'transform 0.1s ease-out';
                img.style.transform = `translate(${imgTranslateX}px, ${imgTranslateY}px) scale(${currentImgZoom})`;
            }, { passive: false });

            img.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isDraggingImg = true;
                imgStartX = e.clientX - imgTranslateX;
                imgStartY = e.clientY - imgTranslateY;
                img.style.transition = 'none';
                img.style.cursor = 'grabbing';
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDraggingImg) return;
                imgTranslateX = e.clientX - imgStartX;
                imgTranslateY = e.clientY - imgStartY;
                img.style.transform = `translate(${imgTranslateX}px, ${imgTranslateY}px) scale(${currentImgZoom})`;
            });

            window.addEventListener('mouseup', () => {
                if (isDraggingImg) {
                    isDraggingImg = false;
                    img.style.cursor = 'grab';
                }
            });

            img.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                currentImgZoom = 1;
                imgTranslateX = 0;
                imgTranslateY = 0;
                img.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                img.style.transform = `translate(0px, 0px) scale(1)`;
            });
        })();

        function updateSearchSuggestions() {
            const datalist = document.getElementById('member-list-suggestions');
            if (!datalist || memberNameMap.size === 0) return;
            datalist.innerHTML = '';
            const bestNameForId = new Map();
            for (let [name, id] of memberNameMap) {
                if (!bestNameForId.has(id) || name.length > bestNameForId.get(id).length) {
                    bestNameForId.set(id, name);
                }
            }
            for (let name of bestNameForId.values()) {
                const option = document.createElement('option');
                option.value = name;
                datalist.appendChild(option);
            }
        }

        function getMemberIdFromQuery(query) {
            if (!query) return null;
            let raw = query.trim();
            if (/^\d{1,10}$/.test(raw)) return raw;
            let cleanName = raw.replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48|IDFT|SHY48|CGT48)[-—\s]*/i, '').trim();
            if (memberNameMap.has(cleanName)) return memberNameMap.get(cleanName);
            if (memberNameMap.has(raw)) return memberNameMap.get(raw);
            for (let [name, id] of memberNameMap) {
                if (name.includes(cleanName) || cleanName.includes(name)) {
                    return id;
                }
            }
            return null;
        }
        let currentMode = 'live';
        class VODState {
            constructor() {
                this.currentGroup = 0;
                this.isLoading = false;
                this.list = [];
                this.searchPageToken = 0;
                this.isSearchActive = false;
                this.nextPageTokens = {
                    0: 0,
                    10: 0,
                    11: 0,
                    12: 0,
                    13: 0,
                    14: 0,
                    15: 0,
                    16: 0,
                    17: 0,
                    18: 20,
                    19: 0,
                    21: 0
                };
                this.hasMore = true;
                this.groups = [{
                    apiId: 0,
                    name: '全部团体'
                },
                {
                    apiId: 10,
                    name: 'SNH48'
                },
                {
                    apiId: 11,
                    name: 'BEJ48'
                },
                {
                    apiId: 12,
                    name: 'GNZ48'
                },
                {
                    apiId: 14,
                    name: 'CKG48'
                },
                {
                    apiId: 21,
                    name: 'CGT48'
                },
                {
                    apiId: 15,
                    name: 'IDFT'
                },
                {
                    apiId: 19,
                    name: '明星殿堂'
                },
                {
                    apiId: 20,
                    name: '丝芭影视'
                },
                {
                    apiId: 16,
                    name: '海外练习生'
                },
                {
                    apiId: 80,
                    name: '燃烧吧团魂'
                },
                ];
                this.currentPage = 1;
                this.pageSize = 5;
            }
            resetPagination(groupId) {
                this.nextPageTokens[groupId] = 0;
                this.list = [];
                this.hasMore = true;
                this.currentPage = 1;
            }
        }
        const vodState = new VODState();
        window.vodState = vodState;
        async function fetchVODList(groupId, loadMore = false) {
            if (vodState.isLoading || (!vodState.hasMore && loadMore)) return;
            vodState.isLoading = true;
            const nextToken = loadMore ? vodState.nextPageTokens[groupId] : 0;
            document.getElementById('vod-loading').textContent = loadMore ? '正在加载更多...' : '正在加载录播列表...';
            document.getElementById('vod-loading').style.display = 'block';
            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveList', JSON.stringify({
                    debug: true,
                    next: nextToken,
                    record: true,
                    groupId: groupId,
                    limit: 50
                }));
                vodState.isLoading = false;
                document.getElementById('vod-loading').style.display = 'none';
                if (res && res.status === 200 && res.content && res.content.liveList) {
                    const newList = res.content.liveList;
                    if (!loadMore) {
                        vodState.list = newList;
                    } else {
                        vodState.list = vodState.list.concat(newList);
                    }
                    vodState.nextPageTokens[groupId] = res.content.next;
                    vodState.hasMore = res.content.next !== 0 && res.content.next !== null;
                    window.renderVODListUI();
                } else {
                    vodState.isLoading = false;
                    vodState.hasMore = false;
                    document.getElementById('vod-loading').textContent = '暂无录播数据';
                    window.renderVODListUI();
                }
            } catch (err) {
                console.error('Fetch VOD List Error:', err);
                vodState.isLoading = false;
                document.getElementById('vod-loading').textContent = '录播列表加载失败，请检查网络或API';
                window.renderVODListUI();
            }
        }

        function autoAdjustPageSize() {
            if (!window.vodState) return;

            const availableHeight = window.innerHeight - 250;

            const cardHeight = 105;

            let calculatedSize = Math.floor(availableHeight / cardHeight);

            calculatedSize = Math.max(5, Math.min(calculatedSize, 30));

            if (window.vodState.pageSize !== calculatedSize) {
                window.vodState.pageSize = calculatedSize;

                const mediaView = document.getElementById('view-media');
                if (mediaView && mediaView.style.display !== 'none' && typeof currentMode !== 'undefined' && currentMode === 'vod') {
                    if (window.vodState.list.length > 0) {
                        window.renderVODListUI();
                    }
                }
            }
        }

        window.addEventListener('resize', () => {
            clearTimeout(window.resizeTimer);
            window.resizeTimer = setTimeout(autoAdjustPageSize, 150);
        });

        window.addEventListener('DOMContentLoaded', () => {
            autoAdjustPageSize();
        });

        function parsePocketDanmu(fileContent) {
            const result = [];
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');
            const timeRegex = /\[(\d+):(\d+):(\d+)\.(\d+)\]/;
            lines.forEach((line, index) => {
                const timeMatch = line.match(timeRegex);
                if (timeMatch) {
                    const seconds = (parseInt(timeMatch[1]) * 3600) + (parseInt(timeMatch[2]) * 60) + parseInt(timeMatch[3]) + (parseInt(timeMatch[4]) / 1000);
                    const contentPart = line.replace(timeMatch[0], '');
                    const parts = contentPart.split('\t');
                    if (parts.length >= 2) {
                        const nickname = parts[0];
                        const text = parts.slice(1).join('');
                        result.push({
                            name: nickname,
                            text: text,
                            time: seconds,
                            color: '#FFFFFF',
                            border: false,
                            mode: 0,
                        });
                    }
                }
            });
            return result;
        }
        let basePath = '';
        const FIXED_PATH = storagePaths.htmlDir;
        const bgInput = document.getElementById('bgInput');
        const searchInput = document.getElementById('searchInput');
        const sortSelect = document.getElementById('sortSelect');
        const outputList = document.getElementById('outputList');
        const statusMsg = document.getElementById('statusMsg');
        const scrollContainer = document.getElementById('view-messages');
        const loadingMoreDiv = document.getElementById('loadingMore');
        const analysisBtn = document.getElementById('analysisBtn');
        const dateBtn = document.getElementById('dateBtn');
        const userModal = document.getElementById('userModal');
        const userListContainer = document.getElementById('userListContainer');
        const dateModal = document.getElementById('dateModal');
        const dateListContainer = document.getElementById('dateListContainer');
        const yearSelect = document.getElementById('yearSelect');
        const monthSelect = document.getElementById('monthSelect');
        const daySelect = document.getElementById('daySelect');
        const themeBtn = document.getElementById('themeBtn');
        const contextModal = document.getElementById('contextModal');
        const contextListContainer = document.getElementById('contextListContainer');
        const livePlayerView = document.getElementById('live-player-view');
        const currentLiveTitle = document.getElementById('current-live-title');
        const liveVideo = document.getElementById('live-video');
        const livePlayerArea = document.getElementById('live-player-area');
        const mediaListControls = document.getElementById('media-list-controls');
        const vodListContainer = document.getElementById('vod-list-container');
        const vodLoading = document.getElementById('vod-loading');
        const mediaListArea = document.getElementById('media-list-area');
        let allPosts = [];
        let allMemberOptions = [];
        let currentFilteredPosts = [];
        let renderedCount = 0;
        const getBatchSize = () => (filterType === 'video' || filterType === 'image') ? 6 : 30;
        let filterType = 'all';
        let userStats = [];
        let dateStats = [];
        let availableYears = new Set();
        let currentPlayingAudio = null;
        let currentPlayingVideo = null;
        let isRenderingBatch = false;
        let batchRenderScheduled = false;

        let currentSortOrder = localStorage.getItem('msg_sort_order') || 'desc';
        function filterGroupOptions(keyword) {
            const select = document.getElementById('groupSelect');
            const currentVal = select.value;
            const term = keyword.trim().toLowerCase();

            select.innerHTML = '<option value="all">全部成员</option>';

            allMemberOptions.forEach(name => {
                if (name.toLowerCase().includes(term)) {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    select.appendChild(opt);
                }
            });

            let stillExists = false;
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === currentVal) {
                    select.value = currentVal;
                    stillExists = true;
                    break;
                }
            }
            if (!stillExists) {
                select.value = 'all';
                applyFilters();
            }
        }

        function toggleSortOrder() {
            const btn = document.getElementById('sortBtn');

            if (currentSortOrder === 'desc') {
                currentSortOrder = 'asc';
                btn.innerText = '当前：最早在前';
            } else {
                currentSortOrder = 'desc';
                btn.innerText = '当前：最新在前';
            }

            localStorage.setItem('msg_sort_order', currentSortOrder);

            applyFilters();
        }

        function triggerBgInput() {
            bgInput.click();
        }

        function fetchPocketAPI(path, postData) {
            return new Promise((resolve, reject) => {
                const options = {
                    hostname: 'pocketapi.48.cn',
                    port: 443,
                    path: path,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'app-info': '{"vendor":"google","deviceId":"123","appVersion":"6.0.0","appBuild":"123","osType":"android","osVersion":"10.0.0","deviceName":"pixel"}'
                    }
                };
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            resolve(json);
                        } catch (e) {
                            resolve({
                                status: 500,
                                content: {}
                            });
                        }
                    });
                });
                req.on('error', (e) => {
                    resolve({
                        status: 500,
                        content: {}
                    });
                });
                req.write(postData);
                req.end();
            });
        }

        function escapePrivateMessageHtml(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function getPrivateMessageAvatar(avatar) {
            if (!avatar) return './icon.png';
            if (avatar.startsWith('http')) return avatar;
            return `https://source.48.cn${avatar}`;
        }

        function formatPrivateMessagePreview(text) {
            const cleanedText = normalizePrivateMessageBodyText(text);
            const parsed = parsePrivateFlipcardPayload(cleanedText);
            const audioUrl = String(parsed?.url || parsed?.voiceUrl || '').trim().toLowerCase();
            if (audioUrl && (audioUrl.endsWith('.aac') || audioUrl.endsWith('.mp3') || audioUrl.endsWith('.m4a') || audioUrl.endsWith('.wav'))) {
                return '[语音消息]';
            }
            const videoUrl = String(parsed?.url || parsed?.videoUrl || '').trim().toLowerCase();
            if (videoUrl && (videoUrl.endsWith('.mp4') || videoUrl.endsWith('.mov') || videoUrl.endsWith('.m4v') || videoUrl.endsWith('.webm'))) {
                return '[视频消息]';
            }
            const normalized = String(cleanedText || '').replace(/\s+/g, ' ').trim();
            return normalized || '暂无消息';
        }

        function normalizePrivateMessageBodyText(value) {
            return String(value || '')
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .replace(/^\s+/, '')
                .replace(/\s+$/, '');
        }

        function normalizePrivateMessageName(value) {
            const text = String(value || '').trim();
            if (!text) return '';
            return text
                .replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48)\s*-\s*/i, '')
                .replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48)\s+/i, '')
                .trim();
        }

        function isPrivateMessageInvalidName(value) {
            const text = String(value || '').trim();
            if (!text) return true;
            const lower = text.toLowerCase();
            return lower.startsWith('/mediasource/')
                || lower.includes('/teamlogo')
                || /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(text)
                || text.includes('/');
        }

        function getPrivateMessageDisplayName(user = {}) {
            const candidates = [
                user.starName,
                user.realNickName,
                normalizePrivateMessageName(user.nickname),
                normalizePrivateMessageName(user.name),
                user.nickname,
                user.name
            ];

            for (const candidate of candidates) {
                if (!isPrivateMessageInvalidName(candidate)) {
                    return String(candidate).trim();
                }
            }

            return '未知用户';
        }

        function getPrivateMessageMetaName(user = {}, displayName = '') {
            const candidates = [
                user.realNickName,
                normalizePrivateMessageName(user.nickname),
                normalizePrivateMessageName(user.name),
                user.nickname,
                user.name
            ];

            for (const candidate of candidates) {
                if (isPrivateMessageInvalidName(candidate)) continue;
                const normalized = String(candidate).trim();
                if (!normalized || normalized === displayName) continue;
                return normalized;
            }

            return '';
        }

        function getPrivateMessageTeamLabel(user = {}, displayName = '') {
            const teamLogo = String(user.teamLogo || '').toLowerCase();
            if (teamLogo.includes('snh48_s2')) return 'TEAM SII';
            if (teamLogo.includes('snh48_n2')) return 'TEAM NII';
            if (teamLogo.includes('snh48_h2')) return 'TEAM HII';
            if (teamLogo.includes('snh48_x')) return 'TEAM X';
            if (teamLogo.includes('gnz48_n3')) return 'TEAM NIII';
            if (teamLogo.includes('gnz48_g')) return 'TEAM G';
            if (teamLogo.includes('gnz_z')) return 'TEAM Z';
            if (teamLogo.includes('bej48_b')) return 'TEAM B';
            if (teamLogo.includes('bej48_e')) return 'TEAM E';
            if (teamLogo.includes('bej48_j')) return 'TEAM J';
            if (teamLogo.includes('ckg48_k')) return 'TEAM K';
            if (teamLogo.includes('ckg48_c')) return 'TEAM C';
            if (teamLogo.includes('cgt48_cii')) return 'TEAM CII';
            if (teamLogo.includes('cgt48_gii')) return 'TEAM GII';
            if (teamLogo.includes('yb') || teamLogo.includes('youth') || teamLogo.includes('pre')) return '预备生';

            const directTeam = [
                user.teamName,
                user.team,
                user.starTeamName
            ].find(value => {
                const normalized = String(value || '').trim().toUpperCase();
                if (!normalized) return false;
                if (normalized === 'SNH48' || normalized === 'GNZ48' || normalized === 'BEJ48' || normalized === 'CKG48' || normalized === 'CGT48') return false;
                return true;
            });

            if (directTeam) return String(directTeam).trim();

            const directGroup = String(user.groupName || '').trim().toUpperCase();
            if (directGroup === 'SNH48' || directGroup === 'GNZ48' || directGroup === 'BEJ48' || directGroup === 'CKG48' || directGroup === 'CGT48') {
                // 团名只作为最后兜底，不盖掉真实队伍。
            } else if (directGroup) {
                return String(user.groupName).trim();
            }

            if (Array.isArray(window.memberData) && window.memberData.length > 0) {
                const normalizedDisplayName = String(displayName || getPrivateMessageDisplayName(user) || '').trim();
                const memberMatch = window.memberData.find(m =>
                    String(m.id || m.userId || '') === String(user.userId || user.id || '')
                    || (normalizedDisplayName && String(m.ownerName || '').trim() === normalizedDisplayName)
                );
                const memberTeam = String(memberMatch?.team || '').trim();
                if (memberTeam) return memberTeam;
            }

            const groupHint = String(user.nickname || user.name || '').toUpperCase();
            if (groupHint.startsWith('SNH48-')) return 'SNH48';
            if (groupHint.startsWith('GNZ48-')) return 'GNZ48';
            if (groupHint.startsWith('BEJ48-')) return 'BEJ48';
            if (groupHint.startsWith('CKG48-')) return 'CKG48';
            if (groupHint.startsWith('CGT48-')) return 'CGT48';

            return user.isStar ? '成员' : '';
        }

        function formatPrivateMessageTime(timestamp) {
            const time = Number(timestamp);
            if (!time) return '--';

            const date = new Date(time);
            const now = new Date();
            const sameYear = date.getFullYear() === now.getFullYear();
            const sameDay = date.toDateString() === now.toDateString();
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');

            if (sameDay) return `${hh}:${mm}`;
            if (sameYear) {
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${month}-${day}`;
            }

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function formatPrivateMessageDateTime(timestamp) {
            const time = Number(timestamp);
            if (!time) return '--';
            const date = new Date(time);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day} ${hh}:${mm}`;
        }

        function getPrivateMessageAudioInfo(message = {}) {
            function normalizePrivateMediaUrl(rawUrl = '', preferredHost = 'mp4') {
                const value = String(rawUrl || '').trim();
                if (!value) return '';
                if (value.startsWith('//')) return `https:${value}`;
                if (/^https?:\/\//i.test(value)) return value.replace(/^http:\/\//i, 'https://');
                if (value.startsWith('/mediasource/') || value.startsWith('/imagesource/')) {
                    return `https://source.48.cn${value}`;
                }
                const base = preferredHost === 'source' ? 'https://source.48.cn' : 'https://mp4.48.cn';
                return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
            }

            function getLowerPathname(url = '') {
                try {
                    return new URL(url).pathname.toLowerCase();
                } catch (error) {
                    return String(url || '').split('?')[0].split('#')[0].toLowerCase();
                }
            }

            function looksLikeAudioUrl(url = '') {
                const pathname = getLowerPathname(url);
                return pathname.endsWith('.aac')
                    || pathname.endsWith('.mp3')
                    || pathname.endsWith('.m4a')
                    || pathname.endsWith('.wav')
                    || pathname.endsWith('.amr')
                    || pathname.endsWith('.ogg');
            }

            const content = message.content || {};
            const parsedTextContent = parsePrivateFlipcardPayload(
                content.text || content.messageText || message.text || message.messageText || ''
            );
            const candidates = [
                parsedTextContent,
                content.voiceInfo,
                content.audioInfo,
                content.replyInfo,
                content
            ].filter(Boolean);

            for (const item of candidates) {
                const url = normalizePrivateMediaUrl(item.url || item.voiceUrl || '');
                if (!url) continue;
                const hasDuration = Number(item.duration || content.duration || 0) > 0;
                const audioType = String(item.type || item.contentType || content.type || message.messageType || '').toUpperCase();
                if (looksLikeAudioUrl(url) || hasDuration || audioType.includes('AUDIO') || audioType.includes('VOICE')) {
                    return {
                        url,
                        duration: Number(item.duration || content.duration || 0)
                    };
                }
            }

            return null;
        }

        function getPrivateMessageVideoInfo(message = {}) {
            const content = message.content || {};
            const parsedTextContent = parsePrivateFlipcardPayload(
                content.text || content.messageText || message.text || message.messageText || ''
            );
            const candidates = [
                parsedTextContent,
                content.videoInfo,
                content.replyInfo,
                content
            ].filter(Boolean);

            for (const item of candidates) {
                const url = String(
                    item.url
                    || item.videoUrl
                    || item.mp4Url
                    || item.playUrl
                    || item.path
                    || ''
                ).trim();
                if (!url) continue;
                const lower = url.toLowerCase();
                if (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.m4v') || lower.endsWith('.webm')) {
                    return {
                        url,
                        cover: String(item.cover || item.coverUrl || item.poster || '').trim()
                    };
                }
            }

            return null;
        }

        function parsePrivateFlipcardPayload(value) {
            if (!value) return null;
            if (typeof value === 'object') return value;
            try {
                return JSON.parse(value);
            } catch (error) {
                return null;
            }
        }

        function getPrivateFlipcardInfo(message = {}) {
            const sources = [
                message.content,
                message,
                message?.content?.bodys,
                message?.bodys
            ].filter(Boolean);
            const possibleKeys = [
                'flipCardInfo',
                'filpCardInfo',
                'flipCardAudioInfo',
                'filpCardAudioInfo',
                'flipCardVideoInfo',
                'filpCardVideoInfo'
            ];

            for (const source of sources) {
                for (const key of possibleKeys) {
                    const parsed = parsePrivateFlipcardPayload(source[key]);
                    if (parsed) return parsed;
                }
            }

            return null;
        }

        function getPrivateFlipcardText(message = {}, mode = 'question') {
            const content = message.content || {};
            const flipInfo = getPrivateFlipcardInfo(message);
            const directValue = mode === 'answer'
                ? (flipInfo?.answer ?? content.answer ?? message.answer)
                : (flipInfo?.question ?? content.question ?? message.question);

            if (typeof directValue === 'string') {
                const trimmed = normalizePrivateMessageBodyText(directValue);
                if (trimmed) {
                    const parsed = parsePrivateFlipcardPayload(trimmed);
                    if (parsed) {
                        const nested = normalizePrivateMessageBodyText(parsed.text || parsed.answer || parsed.question || '');
                        if (nested) return nested;
                    }
                    return trimmed;
                }
            }

            if (directValue && typeof directValue === 'object') {
                const nested = normalizePrivateMessageBodyText(directValue.text || directValue.answer || directValue.question || '');
                if (nested) return nested;
            }

            return '';
        }

        function formatPrivateMessageContent(message) {
            const type = String(message && message.messageType || message?.content?.messageType || '').toUpperCase();
            const content = message && message.content ? message.content : {};
            const text = normalizePrivateMessageBodyText(content.text || content.replyText || content.messageText || '');
            const flipQuestion = getPrivateFlipcardText(message, 'question');
            const flipAnswer = getPrivateFlipcardText(message, 'answer');
            const isNumericOnly = /^\d+$/.test(text);
            const audioInfo = getPrivateMessageAudioInfo(message);
            const videoInfo = getPrivateMessageVideoInfo(message);

            if (type === 'TEXT') {
                if (audioInfo) return '[语音消息]';
                if (videoInfo) return '[视频消息]';
                return text || '空文本消息';
            }
            if (type === 'IMAGE') return '[图片消息]';
            if (type === 'AUDIO') return '[语音消息]';
            if (type === 'VIDEO') return '[视频消息]';
            if (type === 'GIFT') return '[礼物消息]';
            if (type === 'FLIP') return '[翻牌消息]';
            if (type === 'FLIPCARD_QUESTION') return flipQuestion || (!isNumericOnly ? text : '') || '[翻牌提问]';
            if (type === 'FLIPCARD_ANSWER') return flipAnswer || (!isNumericOnly ? text : '') || '[翻牌回复]';
            return `[${type || '未知'}]`;
        }

        function renderPrivateMessageContentHtml(message) {
            const audioInfo = getPrivateMessageAudioInfo(message);
            if (audioInfo) {
                return `<div class="private-message-audio-slot" data-audio-src="${escapePrivateMessageHtml(audioInfo.url)}" data-audio-duration="${Number(audioInfo.duration || 0)}"></div>`;
            }
            const videoInfo = getPrivateMessageVideoInfo(message);
            if (videoInfo) {
                return `<div class="private-message-video-slot" data-video-src="${escapePrivateMessageHtml(videoInfo.url)}"></div>`;
            }
            return escapePrivateMessageHtml(formatPrivateMessageContent(message));
        }

        function setPrivateMessageDetailLoading(isLoading) {
            privateMessageDetailState.loading = isLoading;
        }

        function setPrivateMessageSending(isSending) {
            privateMessageDetailState.sending = isSending;
            const btn = document.getElementById('btn-send-private-message');
            const input = document.getElementById('private-message-reply-input');
            const disabled = !privateMessageDetailState.targetUserId || isSending;
            if (btn) btn.disabled = disabled;
            if (input) input.disabled = disabled;
        }

        function resetPrivateMessageDetailPanel() {
            privateMessageDetailState.targetUserId = '';
            privateMessageDetailState.title = '';
            privateMessageDetailState.avatar = './icon.png';
            privateMessageDetailState.cursor = 0;
            privateMessageDetailState.items = [];
            privateMessageDetailState.hasMore = true;
            privateMessageDetailState.sending = false;

            const headerEl = document.getElementById('private-message-detail-panel-header');
            const titleEl = document.getElementById('private-message-detail-title');
            const subtitleEl = document.getElementById('private-message-detail-subtitle');
            const avatarEl = document.getElementById('private-message-detail-avatar');
            const inputEl = document.getElementById('private-message-reply-input');
            const bodyEl = document.getElementById('private-message-detail-body');

            if (headerEl) headerEl.style.visibility = 'hidden';
            if (titleEl) titleEl.textContent = '私信详情';
            if (subtitleEl) subtitleEl.textContent = '--';
            if (avatarEl) avatarEl.src = './icon.png';
            if (inputEl) inputEl.value = '';
            if (bodyEl) bodyEl.innerHTML = '<div class="empty-state">请选择一个私信会话</div>';

            setPrivateMessageSending(false);
            setPrivateMessageDetailLoading(false);
        }

        function renderPrivateMessageDetail(options = {}) {
            const bodyEl = document.getElementById('private-message-detail-body');
            if (!bodyEl) return;
            const { keepScrollOffset = false, stickToBottom = false } = options;
            const previousScrollHeight = bodyEl.scrollHeight;
            const previousScrollTop = bodyEl.scrollTop;

            if (!privateMessageDetailState.items.length) {
                bodyEl.innerHTML = '<div class="empty-state">暂无私信内容</div>';
                return;
            }

            const sorted = privateMessageDetailState.items.slice().sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
            bodyEl.innerHTML = sorted.map(item => {
                const incoming = String(item.user?.userId || '') === String(privateMessageDetailState.targetUserId);
                return `
                    <div class="private-message-item ${incoming ? 'incoming' : 'outgoing'}">
                        <div class="private-message-bubble-meta">${escapePrivateMessageHtml(formatPrivateMessageDateTime(item.timestamp))}</div>
                        <div class="private-message-bubble ${incoming ? 'incoming' : 'outgoing'}">
                            ${renderPrivateMessageContentHtml(item)}
                        </div>
                    </div>
                `;
            }).join('');

            bodyEl.querySelectorAll('.private-message-audio-slot').forEach(slot => {
                const src = slot.getAttribute('data-audio-src');
                const duration = Number(slot.getAttribute('data-audio-duration') || 0);
                if (!src) return;
                slot.replaceChildren(createCustomAudioPlayer(src, duration));
            });
            bodyEl.querySelectorAll('.private-message-video-slot').forEach(slot => {
                const src = slot.getAttribute('data-video-src');
                if (!src) return;
                slot.replaceChildren(createCustomVideoPlayer(src));
            });

            if (keepScrollOffset) {
                bodyEl.scrollTop = bodyEl.scrollHeight - previousScrollHeight + previousScrollTop;
            } else if (stickToBottom) {
                bodyEl.scrollTop = bodyEl.scrollHeight;
            }
        }

        function closePrivateMessageDetail(event) {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            resetPrivateMessageDetailPanel();
            renderPrivateMessageList(document.getElementById('private-message-search')?.value || '');
        }

        async function loadPrivateMessageDetail({ targetUserId, title, avatar, reset = false } = {}) {
            const token = getPrivateMessagesToken();
            if (!token) {
                showToast('请先登录账号');
                return switchView('login');
            }

            if (reset) {
                privateMessageDetailState.targetUserId = String(targetUserId || '');
                privateMessageDetailState.title = title || '私信详情';
                privateMessageDetailState.avatar = avatar || './icon.png';
                privateMessageDetailState.cursor = 0;
                privateMessageDetailState.items = [];
                privateMessageDetailState.hasMore = true;
                privateMessageDetailState.sending = false;

                const headerEl = document.getElementById('private-message-detail-panel-header');
                const titleEl = document.getElementById('private-message-detail-title');
                const subtitleEl = document.getElementById('private-message-detail-subtitle');
                const avatarEl = document.getElementById('private-message-detail-avatar');
                const inputEl = document.getElementById('private-message-reply-input');
                if (headerEl) headerEl.style.visibility = 'visible';
                if (titleEl) titleEl.textContent = privateMessageDetailState.title;
                if (subtitleEl) subtitleEl.textContent = `User ID: ${privateMessageDetailState.targetUserId}`;
                if (avatarEl) avatarEl.src = privateMessageDetailState.avatar;
                if (inputEl) inputEl.value = '';
                filterPrivateMessageList(document.getElementById('private-message-search')?.value || '');
                renderPrivateMessageDetail();
                setPrivateMessageSending(false);
            }

            if (!privateMessageDetailState.targetUserId || privateMessageDetailState.loading) return;

            setPrivateMessageDetailLoading(true);
            try {
                const bodyEl = document.getElementById('private-message-detail-body');
                const shouldKeepScrollOffset = !reset && !!bodyEl;
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-private-message-info', {
                    token,
                    pa,
                    targetUserId: privateMessageDetailState.targetUserId,
                    lastTime: privateMessageDetailState.cursor
                });

                if (!res || !res.success || !res.content) {
                    throw new Error(res && res.msg ? res.msg : '获取私信详情失败');
                }

                const incoming = Array.isArray(res.content.data) ? res.content.data : [];
                const seen = new Set(privateMessageDetailState.items.map(item => String(item.messageId)));
                incoming.forEach(item => {
                    const key = String(item.messageId);
                    if (!seen.has(key)) {
                        seen.add(key);
                        privateMessageDetailState.items.push(item);
                    }
                });

                privateMessageDetailState.cursor = Number(res.content.lastTime) || privateMessageDetailState.cursor;
                privateMessageDetailState.hasMore = incoming.length > 0 && Number(res.content.lastTime || 0) > 0;
                renderPrivateMessageDetail({
                    keepScrollOffset: shouldKeepScrollOffset,
                    stickToBottom: reset
                });
            } catch (error) {
                console.error('加载私信详情失败:', error);
                showToast(`私信详情加载失败: ${error.message}`);
            } finally {
                setPrivateMessageDetailLoading(false);
            }
        }

        function openPrivateMessageDetail(targetUserId) {
            const item = privateMessageListState.items.find(entry => String(entry.user?.userId || '') === String(targetUserId));
            if (!item) return;
            const user = item.user || {};
            loadPrivateMessageDetail({
                targetUserId: String(user.userId || ''),
                title: getPrivateMessageDisplayName(user),
                avatar: getPrivateMessageAvatar(user.avatar),
                reset: true
            });
        }

        function getPrivateMessagesToken() {
            return appToken || localStorage.getItem('yaya_p48_token');
        }

        function setPrivateMessagesLoading(isLoading) {
            privateMessageListState.loading = isLoading;
            const btnRefresh = document.getElementById('btn-refresh-private-messages');
            const btnLoadMore = document.getElementById('btn-load-more-private-messages');
            if (btnRefresh) btnRefresh.disabled = isLoading;
            if (btnLoadMore) btnLoadMore.disabled = isLoading || !privateMessageListState.hasMore;
        }

        function updatePrivateMessagesStatus(text = '') {
            const statusEl = document.getElementById('private-messages-status');
            if (statusEl) statusEl.textContent = text;
        }

        function renderPrivateMessageList(items = privateMessageListState.items) {
            const listEl = document.getElementById('private-message-list');
            if (!listEl) return;

            if (!Array.isArray(items) || items.length === 0) {
                listEl.innerHTML = '<div class="empty-state">暂无私信会话</div>';
                return;
            }

            listEl.innerHTML = items.map(item => {
                const user = item.user || {};
                const displayName = getPrivateMessageDisplayName(user);
                const preview = formatPrivateMessagePreview(item.newestMessage);
                const unread = Number(item.noreadNum) || 0;
                const isActive = String(privateMessageDetailState.targetUserId || '') === String(user.userId || '');
                const teamLabel = getPrivateMessageTeamLabel(user);
                const shouldShowTeam = !!teamLabel && teamLabel !== '成员';
                const teamStyle = shouldShowTeam && typeof getTeamStyle === 'function'
                    ? getTeamStyle(teamLabel, false)
                    : '';
                const avatar = getPrivateMessageAvatar(user.avatar);

                return `
                    <div class="private-message-list-item ${isActive ? 'active' : ''}" onclick="openPrivateMessageDetail('${escapePrivateMessageHtml(String(user.userId || ''))}')">
                        <img class="private-message-list-avatar" src="${escapePrivateMessageHtml(avatar)}" alt="">
                        <div class="private-message-list-main">
                            <div class="private-message-list-head">
                                <div class="private-message-name-row">
                                    <div class="private-message-name">${escapePrivateMessageHtml(displayName)}</div>
                                    ${shouldShowTeam ? `<span class="private-message-team-badge" style="${teamStyle}">${escapePrivateMessageHtml(teamLabel)}</span>` : ''}
                                </div>
                                <div class="private-message-time">${escapePrivateMessageHtml(formatPrivateMessageTime(item.newestMessagetime))}</div>
                            </div>
                            <div class="private-message-list-tail">
                                <span class="private-message-last">${escapePrivateMessageHtml(preview)}</span>
                                ${unread > 0 ? `<span class="private-message-unread-dot">${Math.min(unread, 99)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function filterPrivateMessageList(keyword = '') {
            const lower = String(keyword || '').trim().toLowerCase();
            if (!lower) {
                renderPrivateMessageList(privateMessageListState.items);
                return;
            }

            const filtered = privateMessageListState.items.filter(item => {
                const user = item.user || {};
                const values = [
                    user.nickname,
                    user.starName,
                    user.realNickName,
                    normalizePrivateMessageName(user.nickname),
                    normalizePrivateMessageName(user.name),
                    item.newestMessage
                ].filter(Boolean).map(v => String(v).toLowerCase());

                return values.some(v => v.includes(lower));
            });

            renderPrivateMessageList(filtered);
        }

        async function loadPrivateMessageList({ reset = false, loadAll = false } = {}) {
            const token = getPrivateMessagesToken();
            const listEl = document.getElementById('private-message-list');

            if (!token) {
                updatePrivateMessagesStatus('请先登录口袋账号');
                if (listEl) listEl.innerHTML = '<div class="empty-state">请先前往账号设置登录后再查看私信列表</div>';
                switchView('login');
                return;
            }

            if (privateMessageListState.loading) return;

            if (reset) {
                privateMessageListState.cursor = Date.now();
                privateMessageListState.items = [];
                privateMessageListState.hasMore = true;
                privateMessageListState.initialized = true;
                const searchEl = document.getElementById('private-message-search');
                if (searchEl) searchEl.value = '';
            }

            setPrivateMessagesLoading(true);
            updatePrivateMessagesStatus(reset ? '正在读取私信列表...' : '正在加载更多...');

            try {
                const pa = window.getPA ? window.getPA() : null;
                const merged = reset ? [] : privateMessageListState.items.slice();
                const seen = new Set(merged.map(item => String(item.conversationId)));
                let continueLoading = true;
                let loopCount = 0;

                while (continueLoading) {
                    const res = await ipcRenderer.invoke('fetch-private-message-list', {
                        token,
                        pa,
                        lastTime: privateMessageListState.cursor
                    });

                    if (!res || !res.success || !res.content) {
                        throw new Error(res && res.msg ? res.msg : '获取失败');
                    }

                    const incoming = Array.isArray(res.content.data) ? res.content.data : [];

                    incoming.forEach(item => {
                        const key = String(item.conversationId);
                        if (!seen.has(key)) {
                            seen.add(key);
                            merged.push(item);
                        }
                    });

                    privateMessageListState.cursor = Number(res.content.lastTime) || privateMessageListState.cursor;
                    privateMessageListState.hasMore = incoming.length > 0 && Number(res.content.lastTime || 0) > 0;

                    loopCount += 1;
                    continueLoading = !!(loadAll && privateMessageListState.hasMore && loopCount < 80);
                    if (loadAll && continueLoading) {
                        updatePrivateMessagesStatus(`正在读取全部会话... 已加载 ${merged.length} 个`);
                    }
                }

                merged.sort((a, b) => Number(b.newestMessagetime || 0) - Number(a.newestMessagetime || 0));
                privateMessageListState.items = merged;

                filterPrivateMessageList(document.getElementById('private-message-search')?.value || '');
                updatePrivateMessagesStatus(`共 ${privateMessageListState.items.length} 个会话`);
            } catch (error) {
                console.error('加载私信列表失败:', error);
                updatePrivateMessagesStatus('私信列表读取失败');
                if (listEl && privateMessageListState.items.length === 0) {
                    listEl.innerHTML = `<div class="empty-state">${escapePrivateMessageHtml(error.message || '私信列表读取失败')}</div>`;
                }
            } finally {
                setPrivateMessagesLoading(false);
            }
        }

        function refreshPrivateMessageList() {
            loadPrivateMessageList({ reset: true, loadAll: true });
        }

        function loadMorePrivateMessageList() {
            if (!privateMessageListState.hasMore || privateMessageListState.loading) return;
            loadPrivateMessageList({ reset: false });
        }

        function loadMorePrivateMessageDetail() {
            if (!privateMessageDetailState.hasMore || privateMessageDetailState.loading) return;
            loadPrivateMessageDetail({ reset: false });
        }

        function handlePrivateMessageReplyKeydown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendPrivateMessageReply();
            }
        }

        async function sendPrivateMessageReply() {
            if (privateMessageDetailState.sending) return;
            const token = getPrivateMessagesToken();
            if (!token) {
                showToast('请先登录账号');
                return switchView('login');
            }
            if (!privateMessageDetailState.targetUserId) return;

            const input = document.getElementById('private-message-reply-input');
            const rawText = input ? input.value : '';
            const text = String(rawText || '').trim();
            if (!text) {
                return showToast('请输入私信内容');
            }

            setPrivateMessageSending(true);
            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('send-private-message-reply', {
                    token,
                    pa,
                    targetUserId: privateMessageDetailState.targetUserId,
                    text
                });

                if (!res || !res.success || !res.content) {
                    throw new Error(res && res.msg ? res.msg : '发送失败');
                }

                privateMessageDetailState.items.push({
                    messageId: res.content.messageId,
                    timestamp: res.content.timestamp,
                    messageType: res.content.messageType || 'TEXT',
                    content: res.content.content || { messageType: 'TEXT', text }
                });
                renderPrivateMessageDetail({ stickToBottom: true });

                const conversation = privateMessageListState.items.find(entry => String(entry.user?.userId || '') === String(privateMessageDetailState.targetUserId));
                if (conversation) {
                    conversation.newestMessage = text;
                    conversation.newestMessagetime = Number(res.content.timestamp) || Date.now();
                    renderPrivateMessageList(document.getElementById('private-message-search')?.value || '');
                }

                if (input) {
                    input.value = '';
                    input.focus();
                }
                showToast('私信已发送');
            } catch (error) {
                console.error('发送私信失败:', error);
                showToast(`发送失败: ${error.message}`);
            } finally {
                setPrivateMessageSending(false);
            }
        }

        const CACHE_FILE = storagePaths.cacheFile;

        function saveCacheOptimized(data) {
            return new Promise((resolve, reject) => {
                try {
                    const stream = fs.createWriteStream(CACHE_FILE, {
                        flags: 'w',
                        encoding: 'utf-8'
                    });
                    stream.on('error', (err) => {
                        reject(err);
                    });
                    stream.on('finish', () => {
                        resolve();
                    });
                    stream.write('[\n');
                    data.forEach((post, index) => {
                        const jsonStr = JSON.stringify(post);
                        if (index < data.length - 1) stream.write(jsonStr + ',\n');
                        else stream.write(jsonStr + '\n');
                    });
                    stream.write(']');
                    stream.end();
                } catch (e) {
                    reject(e);
                }
            });
        }

        function loadCacheOptimized() {
            return new Promise((resolve, reject) => {
                const tempPosts = [];
                try {
                    const fileStream = fs.createReadStream(CACHE_FILE);
                    fileStream.on('error', (err) => {
                        reject(err);
                    });
                    const rl = readline.createInterface({
                        input: fileStream,
                        crlfDelay: Infinity
                    });
                    rl.on('line', (line) => {
                        line = line.trim();
                        if (line === '[' || line === ']') return;
                        if (line.endsWith(',')) line = line.slice(0, -1);
                        if (line) {
                            try {
                                const post = JSON.parse(line);
                                tempPosts.push(post);
                            } catch (e) { }
                        }
                    });
                    rl.on('close', () => {
                        resolve(tempPosts);
                    });
                } catch (e) {
                    reject(e);
                }
            });
        }

        window.onload = async function () {
            try {
                setMessageIndexLoadingState(true, '正在初始化', '正在准备运行环境');

                window.addEventListener('keydown', function (e) {
                    if (e.key === 'F11') {
                        e.preventDefault();
                    }
                });

                mountSidebarPanelsToViews();
                await loadMemberIdMap();
                initTheme();

                Promise.resolve(checkGitHubNotice()).catch((error) => {
                    console.warn('公告检查失败:', error);
                });

                if (fs.existsSync(CACHE_FILE)) {
                    setMessageIndexLoadingState(true, '正在读取缓存', '解析本地历史数据');
                    statusMsg.textContent = "🚀 正在流式读取缓存...";

                    loadCacheOptimized().then((data) => {
                        allPosts = data;
                        allPosts.forEach((post, index) => {
                            post.originalIndex = index;
                        });
                        initUIWithData();
                        statusMsg.textContent = `⚡ 缓存加载完毕: ${allPosts.length} 条`;

                    }).catch((e) => {
                        try {
                            fs.unlinkSync(CACHE_FILE);
                        } catch (err) { }
                        scanFiles();
                    });
                } else {
                    scanFiles();
                }

                if (window.vodState) {
                    renderVodGroupOptions();
                }
                const savedToken = localStorage.getItem('yaya_p48_token');
                if (savedToken) {
                    appToken = savedToken;
                    console.log("启动自动登录...");
                    setTimeout(() => {
                        Promise.resolve(checkToken()).catch((error) => {
                            console.warn('自动登录检查失败:', error);
                        });
                    }, 500);
                }
                initBackToTopListener();
                const cInput = document.getElementById('search-content-input');
                const uInput = document.getElementById('search-user-input');
                const rBtn = document.getElementById('btn-clear-search');

                let searchTimeout = null;

                function handleInstantSearch() {
                    if (searchTimeout) clearTimeout(searchTimeout);

                    searchTimeout = setTimeout(() => {

                        if (typeof applyFilters === 'function') {
                            applyFilters();
                        }
                    }, 300);
                }

                if (cInput) cInput.addEventListener('input', handleInstantSearch);
                if (uInput) uInput.addEventListener('input', handleInstantSearch);

                if (rBtn) {
                    rBtn.onclick = () => {
                        if (cInput) cInput.value = '';
                        if (uInput) uInput.value = '';

                        if (typeof applyFilters === 'function') {
                            applyFilters();
                        }
                    };
                }

                window.__appStartupComplete = true;
            } catch (error) {
                if (typeof reportFatalInitError === 'function') {
                    reportFatalInitError(error, '启动流程执行失败');
                    return;
                }

                throw error;
            }
        };


        function scrollToTop() {
            const scrollableViews = [
                'view-messages',
                'view-media',
                'view-flip',
                'view-open-live',
                'view-profile',
                'view-fetch',
                'view-send-flip'
            ];

            scrollableViews.forEach(id => {
                const el = document.getElementById(id);
                if (el && window.getComputedStyle(el).display !== 'none') {
                    el.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }

        function initBackToTopListener() {
            const btn = document.getElementById('backToTopBtn');
            const scrollableViews = [
                'view-messages',
                'view-media',
                'view-flip',
                'view-open-live',
                'view-profile',
                'view-fetch',
                'view-send-flip'
            ];

            scrollableViews.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('scroll', () => {
                        if (window.getComputedStyle(el).display !== 'none') {
                            if (el.scrollTop > 1500) {
                                btn.classList.add('show');
                            } else {
                                btn.classList.remove('show');
                            }
                        }
                    });
                }
            });
        }



        window.forceReloadData = function () {
            setMessageIndexLoadingState(true, '正在准备更新', '检查文件变动');

            outputList.innerHTML = '<div class="placeholder-tip"><h3>🔄 正在增量更新...</h3><p>正在比对文件变动，请稍候。</p></div>';
            statusMsg.textContent = "正在分析新文件...";

            setTimeout(() => scanFiles(true), 100);
        }

        const MANIFEST_FILE = storagePaths.manifestFile;
        let fileManifest = {};

        function loadManifest() {
            try {
                if (fs.existsSync(MANIFEST_FILE)) {
                    fileManifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
                }
            } catch (e) { fileManifest = {}; }
        }

        function saveManifest() {
            try {
                fs.writeFileSync(MANIFEST_FILE, JSON.stringify(fileManifest), 'utf-8');
            } catch (e) { }
        }

        async function scanFiles(isIncremental = false) {
            if (!fs.existsSync(FIXED_PATH)) {
                setMessageIndexLoadingState(false);
                statusMsg.textContent = "❌ 路径不存在";
                outputList.innerHTML = `<div class="placeholder-tip"><h3>❌ 路径配置错误</h3><p>找不到文件夹：<br><b>${FIXED_PATH}</b></p></div>`;
                return;
            }

            loadManifest();

            if (isIncremental) {
                setMessageIndexLoadingState(true, '正在更新数据', '分析新文件');
            } else {
                setMessageIndexLoadingState(true, '正在重建索引', '扫描 html 文件夹，这可能需要一段时间');
            }

            if (isIncremental) {
                let realFilesOnDisk = new Set();
                try {
                    const gatherPaths = (dir) => {
                        if (fs.existsSync(dir)) {
                            const files = fs.readdirSync(dir, { withFileTypes: true });
                            files.forEach(f => {
                                if (f.isDirectory()) gatherPaths(path.join(dir, f.name));
                                else if (f.isFile() && f.name.endsWith('.html')) {
                                    realFilesOnDisk.add(path.join(dir, f.name));
                                }
                            });
                        }
                    };
                    gatherPaths(FIXED_PATH);

                    for (const cachedPath of Object.keys(fileManifest)) {
                        if (!realFilesOnDisk.has(cachedPath)) {
                            console.log(`检测到文件已删除: ${cachedPath}，将触发全量重扫`);
                            isIncremental = false;
                            statusMsg.textContent = "🗑️ 发现文件变动，正在重置缓存...";
                            setMessageIndexLoadingState(true, '检测到文件变动', '正在重置缓存');
                            break;
                        }
                    }
                } catch (e) {
                    isIncremental = false;
                }
            }

            statusMsg.textContent = isIncremental ? "正在扫描新文件..." : "正在重建索引...";

            if (!isIncremental) {
                allPosts = [];
                fileManifest = {};
            }

            let newParsedCount = 0;
            let skippedCount = 0;
            let newPosts = [];

            const fileQueue = [];
            async function gatherFilesAsync(dirPath, groupName) {
                const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
                for (const item of items) {
                    if (item.isDirectory()) {
                        await gatherFilesAsync(path.join(dirPath, item.name), item.name);
                    } else if (item.isFile() && item.name.endsWith('.html')) {
                        fileQueue.push({
                            fullPath: path.join(dirPath, item.name),
                            fileName: item.name,
                            group: groupName === 'html' ? '默认' : groupName
                        });
                    }
                }
            }

            try {
                await gatherFilesAsync(FIXED_PATH, '默认');

                const CHUNK_SIZE = 10;

                for (let i = 0; i < fileQueue.length; i++) {
                    const fileObj = fileQueue[i];
                    try {
                        const stats = await fs.promises.stat(fileObj.fullPath);
                        const fileKey = fileObj.fullPath;

                        if (isIncremental && fileManifest[fileKey] === stats.mtimeMs) {
                            skippedCount++;
                        } else {
                            const text = await fs.promises.readFile(fileObj.fullPath, 'utf-8');
                            const parsed = parseHtmlContent(text, fileObj.fileName, fileObj.group);
                            newPosts = newPosts.concat(parsed);

                            fileManifest[fileKey] = stats.mtimeMs;
                            newParsedCount++;

                            if (newParsedCount % 5 === 0) {
                                statusMsg.textContent = `正在解析... 已处理 ${newParsedCount} 个文件`;
                            }
                        }
                    } catch (e) {
                        console.error("解析失败:", fileObj.fileName, e);
                    }

                    if (i % CHUNK_SIZE === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }

                if (isIncremental) {
                    allPosts = allPosts.concat(newPosts);
                } else {
                    allPosts = newPosts;
                }

                if (allPosts.length === 0) {
                    setMessageIndexLoadingState(false);
                    outputList.innerHTML = '<div class="placeholder-tip"><h3>📂 没有找到数据</h3><p>请点击 抓取消息 按钮抓取成员房间消息。</p></div>';
                    if (fs.existsSync(CACHE_FILE)) try { fs.unlinkSync(CACHE_FILE); } catch (e) { }
                    saveManifest();
                    return;
                }

                statusMsg.textContent = "🧹 正在整理数据...";
                await new Promise(resolve => setTimeout(resolve, 50));

                const uniqueMap = new Map();
                const uniquePosts = [];
                for (let i = allPosts.length - 1; i >= 0; i--) {
                    const post = allPosts[i];
                    const uniqueKey = `${post.timeStr}_${post.nameStr}_${(post.text || '').substring(0, 50)}`;
                    if (!uniqueMap.has(uniqueKey)) {
                        uniqueMap.set(uniqueKey, true);
                        uniquePosts.push(post);
                    }
                }

                allPosts = uniquePosts.reverse();
                allPosts.sort((a, b) => new Date(a.timeStr) - new Date(b.timeStr));

                allPosts.forEach((post, index) => {
                    post.originalIndex = index;
                });

                statusMsg.textContent = "💾 正在保存缓存...";

                saveCacheOptimized(allPosts).then(() => {
                    saveManifest();
                    const msg = isIncremental
                        ? `✅ 更新: 新增 ${newParsedCount} 个文件`
                        : `✅ 重建完成: 共 ${allPosts.length} 条`;
                    statusMsg.textContent = msg;

                    initUIWithData();

                }).catch(e => {
                    statusMsg.textContent = `⚠️ 缓存写入失败`;
                    setMessageIndexLoadingState(false);
                });

            } catch (err) {
                outputList.innerHTML = `<div class="placeholder-tip"><h3>❌ 读取错误</h3><p>${err.message}</p></div>`;
                setMessageIndexLoadingState(false);
            }
        }

        function initUIWithData() {
            messageIndexLoadState.initialized = true;
            setMessageIndexLoadingState(false);

            const groups = new Set(allPosts.map(p => p.groupName));

            allMemberOptions = Array.from(groups).sort();
            const sortBtn = document.getElementById('sortBtn');
            if (sortBtn) {
                if (currentSortOrder === 'asc') {
                    sortBtn.innerText = '当前：最早在前';
                } else {
                    sortBtn.innerText = '当前：最新在前';
                }
            }

            initDateSelectors();
            applyFilters();

            const sInput = document.getElementById('searchInput');
            if (sInput) sInput.disabled = false;
            if (analysisBtn) analysisBtn.disabled = false;
            if (dateBtn) dateBtn.disabled = false;

            const giftAnalysisBtn = document.getElementById('giftAnalysisBtn');
            const speechAnalysisBtn = document.getElementById('speechAnalysisBtn');
            if (giftAnalysisBtn) giftAnalysisBtn.disabled = false;
            if (speechAnalysisBtn) speechAnalysisBtn.disabled = false;

            const yDisp = document.getElementById('yearSelectDisplay');
            if (yDisp) yDisp.disabled = false;
        }

        let returnToOpenLive = false;

        function backToLiveList() {
            if (returnToOpenLive) {
                const dmWrapper = document.getElementById('danmu-timeline-wrapper');
                if (dmWrapper) dmWrapper.style.display = 'none';
                livePlayerView.style.display = 'none';
                destroyPlayers();
                returnToOpenLive = false;
                switchView('openlive');
                return;
            }

            livePlayerView.style.display = 'none';
            document.getElementById('media-list-area').style.display = 'block';

            destroyPlayers();
            const oldNotice = document.querySelector('#live-player-area .live-link-info');
            if (oldNotice) oldNotice.remove();

            const liveControls = document.getElementById('live-list-controls');
            const vodPagination = document.getElementById('vod-pagination-controls');
            const mediaControls = document.getElementById('media-list-controls');

            if (currentMode === 'vod') {
                if (vodPagination) vodPagination.style.display = 'flex';
                if (mediaControls) mediaControls.style.display = 'flex';

                if (liveControls) liveControls.style.display = 'none';

                if (window.vodState) window.renderVODListUI();

            } else if (currentMode === 'live') {
                if (liveControls) liveControls.style.display = 'flex';

                if (vodPagination) vodPagination.style.display = 'none';
                if (mediaControls) mediaControls.style.display = 'none';

                fetchLiveList();
            }
        }

        function handleGroupChange(apiId) {
            if (!window.vodState) return;
            vodState.currentGroup = parseInt(apiId);
            vodState.resetPagination(vodState.currentGroup);
            ensurePageData(2).then(() => {
                window.renderVODListUI();
            });
        }
        let filterTimeout;

        function handleMemberFilter() {
            const input = document.getElementById('vod-member-filter');
            const box = document.getElementById('member-suggestions');
            const val = input.value.trim().toLowerCase();

            if (!window.isMemberDataLoaded && typeof loadMemberData === 'function') {
                loadMemberData();
            }

            if (document.activeElement !== input) {
                box.style.display = 'none';
                return;
            }

            if (val.length === 0) {
                box.style.display = 'none';
            } else {
                let matches = memberData.filter(m => {
                    const matchName = m.ownerName.includes(val);
                    const pinyin = m.pinyin || "";
                    const matchPinyin = pinyin.toLowerCase().includes(val);
                    const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : "";
                    const matchInitials = initials.toLowerCase().includes(val);

                    return matchName || matchPinyin || matchInitials;
                });

                matches.sort(memberSortLogic);

                if (matches.length > 0) {
                    const html = matches.slice(0, 10).map(m => {
                        const isInactive = m.isInGroup === false;
                        const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';
                        let colorStyle = typeof getTeamStyle === 'function' ? getTeamStyle(m.team, isInactive) : '';
                        const teamHtml = m.team ? `<span class="team-tag" style="${baseStyle} ${colorStyle}">${m.team}</span>` : '';

                        return `<div class="suggestion-item" 
                             onclick="selectMember('${m.ownerName}')"
                             style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight:bold; ${baseStyle}">${m.ownerName}</span>
                            ${teamHtml}
                        </div>`;
                    }).join('');

                    box.innerHTML = html;
                    box.style.display = 'block';
                } else {
                    box.style.display = 'none';
                }
            }

            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(() => {
                if (window.vodState) {
                    vodState.currentPage = 1;
                    ensurePageData(2).then(() => renderVODListUI());
                }
            }, 500);
        }

        function renderVodGroupOptions() {
            const list = document.getElementById('vod-group-dropdown');
            if (!list || !window.vodState) return;

            list.innerHTML = vodState.groups.map(g => `
                <div class="suggestion-item" onclick="selectVodGroup('${g.apiId}', '${g.name}')">
                    ${g.name}
                </div>
            `).join('');
        }

        function toggleVodGroupDropdown() {
            const list = document.getElementById('vod-group-dropdown');
            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
            const typeList = document.getElementById('vod-type-dropdown');
            if (typeList) typeList.style.display = 'none';
        }

        function selectVodGroup(apiId, name) {
            resetLoadAllButton();
            document.getElementById('vod-group-display').value = name;
            document.getElementById('vod-group-dropdown').style.display = 'none';
            handleGroupChange(apiId);
        }

        function toggleVodTypeDropdown() {
            const list = document.getElementById('vod-type-dropdown');
            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
            const groupList = document.getElementById('vod-group-dropdown');
            if (groupList) groupList.style.display = 'none';
        }

        function selectVodType(value, name) {
            resetLoadAllButton();
            document.getElementById('vod-type-display').value = name;
            document.getElementById('vod-type-filter').value = value;
            document.getElementById('vod-type-dropdown').style.display = 'none';
            handleVodTypeChange();
        }

        function handleVodTypeChange() {
            if (window.vodState) {
                vodState.currentPage = 1;
                ensurePageData(2).then(() => renderVODListUI());
            }
        }

        let isVodAutoLoading = false;

        async function handleLoadAllVod() {
            const loadBtn = document.getElementById('load-all-btn');

            if (isVodAutoLoading) {
                isVodAutoLoading = false;
                if (loadBtn) {
                    loadBtn.textContent = '继续加载';
                    loadBtn.style.background = '';
                    loadBtn.style.borderColor = '';
                }
                return;
            }

            if (!vodState.hasMore) {
                if (loadBtn) {
                    loadBtn.textContent = '加载完毕';
                    loadBtn.style.background = '#28a745';
                    loadBtn.style.borderColor = '#28a745';
                    loadBtn.disabled = true;
                }
                return;
            }

            isVodAutoLoading = true;
            if (loadBtn) {
                loadBtn.textContent = '暂停加载';
                loadBtn.style.background = '#dc3545';
                loadBtn.style.borderColor = '#dc3545';
            }

            try {
                let previousTotal = getFilteredVODList().length;

                while (isVodAutoLoading && vodState.hasMore) {

                    await fetchVODPageInternal();

                    if (typeof renderVODListUI === 'function') {
                        renderVODListUI();
                    }

                    const currentTotal = getFilteredVODList().length;

                    if (currentTotal === previousTotal) {
                        console.log("数据未增加，已到达真正的尽头，强制结束静默加载！");
                        vodState.hasMore = false;
                        break;
                    }

                    previousTotal = currentTotal;

                    await new Promise(r => setTimeout(r, 600));
                }
            } catch (error) {
                console.error("后台拉取数据时出错:", error);
            }

            if (!vodState.hasMore) {
                isVodAutoLoading = false;
                if (loadBtn) {
                    loadBtn.textContent = '加载完毕';
                    loadBtn.style.background = '#28a745';
                    loadBtn.style.borderColor = '#28a745';
                    loadBtn.disabled = true;
                }
            }
        }

        function resetLoadAllButton() {
            isVodAutoLoading = false;

            const loadBtn = document.getElementById('load-all-btn');
            if (loadBtn) {
                loadBtn.textContent = '加载全部';
                loadBtn.style.background = '';
                loadBtn.style.borderColor = '';
                loadBtn.disabled = false;
            }
        }

        async function handleRefreshList() {
            resetLoadAllButton();
            if (!window.vodState) return;
            const btn = document.getElementById('refresh-btn');
            const originalText = btn.textContent;
            btn.textContent = '正在刷新';
            btn.disabled = true;

            vodState.searchPageToken = 0;
            const groupId = vodState.currentGroup;
            vodState.nextPageTokens[groupId] = 0;
            vodState.hasMore = true;
            vodState.currentPage = 1;

            try {
                await fetchVODPageInternal();

                await ensurePageData(4);

                window.renderVODListUI();
            } catch (e) {
                console.error(e);
                window.renderVODListUI();
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }

        async function goToPage(page) {
            if (window.vodState) {
                await ensurePageData(page);
                const total = getFilteredVODList().length;
                const maxPage = Math.ceil(total / vodState.pageSize);
                if (page > maxPage && maxPage > 0) page = maxPage;
                vodState.currentPage = page;
                renderVODListUI();
            }
        }

        function handlePrevPage() {
            if (window.vodState && vodState.currentPage > 1) {
                vodState.currentPage--;
                renderVODListUI();
            }
        }

        async function handleNextPage(isAppend = false) {
            if (!window.vodState) return;
            const nextPage = vodState.currentPage + 1;
            await goToPage(nextPage, isAppend);
        }

        function getFilteredVODList() {
            const list = vodState.list;
            const memberFilterInput = document.getElementById('vod-member-filter');
            const typeFilterSelect = document.getElementById('vod-type-filter');
            const filterRaw = memberFilterInput ? memberFilterInput.value.trim().toLowerCase() : '';
            const typeFilter = typeFilterSelect ? typeFilterSelect.value : "0";
            if (!filterRaw && typeFilter === "0") return list;
            const keywords = filterRaw.split(/\s+/);
            return list.filter(item => {
                if (typeFilter !== "0") {
                    const isRadio = (item.liveType === 2);
                    const isRecord = (item.liveMode === 1);

                    if (typeFilter === "record") {
                        if (!isRecord) return false;
                    } else if (typeFilter === "1") {
                        if (isRadio || isRecord) return false;
                    } else if (typeFilter === "2") {
                        if (!isRadio) return false;
                    }
                }
                const u = item.userInfo || {};
                const name = String(u.nickname || item.nickname || '').toLowerCase();
                const title = String(item.title || item.liveTitle || '').toLowerCase();
                const userId = String(u.userId || item.userId || '');
                let timeStr = '';
                const rawTime = item.startTime || item.ctime;
                if (rawTime) {
                    const d = new Date(Number(rawTime));
                    timeStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                }
                return keywords.every(kw => name.includes(kw) || title.includes(kw) || userId.includes(kw) || timeStr.includes(kw));
            });
        }

        async function fetchVODPageInternal() {
            const memberFilterInput = document.getElementById('vod-member-filter');
            let filterText = memberFilterInput ? memberFilterInput.value.trim() : '';
            const memberId = filterText ? getMemberIdFromQuery(filterText) : null;
            const groupId = vodState.currentGroup;
            let nextToken = memberId ? (vodState.searchPageToken || 0) : vodState.nextPageTokens[groupId];
            try {
                if (memberId && nextToken === 0) {
                    const anchorRes = await fetchPocketAPI('/live/api/v1/live/getLiveList', JSON.stringify({
                        debug: true,
                        next: 0,
                        record: true,
                        limit: 1
                    }));
                    if (anchorRes?.content?.liveList?.[0]) nextToken = anchorRes.content.liveList[0].liveId;
                }
                const payload = {
                    debug: true,
                    next: nextToken,
                    record: true,
                    limit: 50
                };
                if (memberId) {
                    payload.userId = parseInt(memberId, 10);
                    document.getElementById('vod-loading').textContent = `正在检索 ID: ${memberId} 的回放...`;
                } else {
                    payload.groupId = groupId;
                    document.getElementById('vod-loading').textContent = `正在加载最近录播...`;
                }
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveList', JSON.stringify(payload));
                if (res?.status === 200 && res.content?.liveList) {
                    const newList = res.content.liveList;
                    if (memberId) {
                        if (vodState.searchPageToken === 0 || !vodState.searchPageToken) vodState.list = newList;
                        else vodState.list = vodState.list.concat(newList);
                        vodState.searchPageToken = res.content.next;
                    } else {
                        if (vodState.nextPageTokens[groupId] === 0) vodState.list = newList;
                        else vodState.list = vodState.list.concat(newList);
                        vodState.nextPageTokens[groupId] = res.content.next;
                    }
                    vodState.hasMore = res.content.next !== 0 && res.content.next !== null;
                    return newList.length;
                }
            } catch (e) { }
            return 0;
        }
        async function ensurePageData(page) {
            if (vodState.isLoading) return;
            const targetCount = page * vodState.pageSize;
            if (getFilteredVODList().length >= targetCount || !vodState.hasMore) return;
            vodState.isLoading = true;
            if (vodState.list.length === 0) document.getElementById('vod-loading').style.display = 'block';
            togglePagination(false);
            let loopSafety = 0;
            const MAX_LOOPS = 50;
            try {
                while (getFilteredVODList().length < targetCount && vodState.hasMore && loopSafety < MAX_LOOPS) {
                    const addedRaw = await fetchVODPageInternal();
                    if (addedRaw === 0 && !vodState.hasMore) break;
                    loopSafety++;
                }
            } catch (e) { } finally {
                vodState.isLoading = false;
                document.getElementById('vod-loading').style.display = 'none';
                togglePagination(true);
            }
        }

        function togglePagination(enabled) {
            const container = document.getElementById('vod-pagination-controls');
            if (container) {
                const btns = container.querySelectorAll('button');
                btns.forEach(b => b.disabled = !enabled);
            }
        }

        window.renderVODListUI = function () {
            if (!window.vodState) return;
            const container = document.getElementById('vod-list-container');
            const filteredList = getFilteredVODList();
            const currentType = window.vodState.currentFilterType || '0';
            const typeDropdownVal = document.getElementById('vod-type-dropdown') ? document.getElementById('vod-type-dropdown').getAttribute('data-value') : '0';

            if (filteredList.length < 5 && vodState.hasMore && !vodState.isLoading) {

                console.log("当前筛选结果不足，自动拉取下一页...");

                if (container.innerHTML.trim() === '') {
                    container.innerHTML = '<div style="width:100%; text-align:center; padding:20px; color:#888;">正在检索更多历史数据...</div>';
                }

                fetchVODPageInternal().then(() => {
                    renderVODListUI();
                }).catch(err => {
                    console.error("自动加载出错", err);
                    container.innerHTML = '<div style="width:100%; text-align:center; color:#888;">加载失败，请手动刷新</div>';
                });

                return;
            }

            container.className = 'vod-list-mode';
            container.innerHTML = '';
            if (filteredList.length === 0) {
                if (vodState.hasMore) {
                    if (!vodState.isLoading) container.innerHTML = '<div style="width:100%; text-align:center; color:#888;"><div>暂无匹配数据</div></div>';
                } else container.innerHTML = '<div style="width:100%; text-align:center; color:#888;">暂无录播数据</div>';
                updatePaginationControls(0);
                return;
            }
            const startIndex = (vodState.currentPage - 1) * vodState.pageSize;
            const endIndex = startIndex + vodState.pageSize;
            const pageItems = filteredList.slice(startIndex, endIndex);
            pageItems.forEach(item => {
                const card = document.createElement('div');
                card.className = 'vod-card-row';
                const status = downloadStatusMap[item.liveId];
                let btnText = "视频下载",
                    btnStyleClass = "btn-secondary",
                    btnDisabled = "";
                if (status === 'downloading') {
                    btnText = "下载中";
                    btnStyleClass = "btn-secondary btn-downloading";
                    btnDisabled = "disabled";
                } else if (status === 'success') {
                    btnText = "已完成";
                    btnStyleClass = "btn-success";
                    btnDisabled = "disabled";
                }
                const isLive = item.liveStatus === 1;
                const name = item.userInfo ? item.userInfo.nickname : item.nickname || '未知成员';
                const cover = item.coverPath ? `https://source.48.cn${item.coverPath}` : './icon.png';
                const titleText = item.liveTitle || item.title || '无标题';
                let timeStr = '未知时间';
                const rawTime = item.startTime || item.ctime;
                if (rawTime) {
                    const d = new Date(Number(rawTime));
                    timeStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
                }
                let liveTypeLabel = '视频';
                let badgeClass = 'badge-video';

                if (item.liveMode === 1) {
                    liveTypeLabel = '录屏';
                    badgeClass = 'badge-record';
                } else if (item.liveType === 2) {
                    liveTypeLabel = '电台';
                    badgeClass = 'badge-radio';
                }
                card.innerHTML = `
                    <div class="vod-row-cover-container">
                        <img src="${cover}" class="vod-row-cover" onclick="directToPotPlayer(event, '${item.liveId}')" title="点击头像直接调用外部播放器播放">
                        <div class="vod-badge ${badgeClass}">${liveTypeLabel}</div>
                    </div>
                    <div class="vod-row-info">
                        <div class="vod-row-name">
                            ${name}
                            <div style="margin-left:auto; display:flex; gap:5px;">
                                <button class="btn btn-secondary"
                                        style="padding: 2px 8px; font-size: 11px; height: 24px;" 
                                        onclick="handleDownloadDanmu(event, ${JSON.stringify(item).replace(/"/g, '&quot;')})">
                                    弹幕下载
                                </button>
                                
                                <button class="btn ${btnStyleClass} vod-btn-${item.liveId}" ${btnDisabled} 
                                        style="padding: 2px 8px; font-size: 11px; height: 24px;" 
                                        onclick="handleDownloadVOD(event, ${JSON.stringify(item).replace(/"/g, '&quot;')})">
                                    ${btnText}
                                </button>
                            </div>
                        </div>
                        
                        <div class="vod-row-title">${titleText}</div>
                        <div class="vod-row-time">${timeStr}</div>
                    </div>
                `;
                card.onclick = () => playLiveStream({
                    liveId: item.liveId,
                    userInfo: {
                        nickname: name
                    },
                    title: titleText,
                    startTime: rawTime
                }, isLive ? 'live' : 'vod');
                container.appendChild(card);
            });
            updatePaginationControls(filteredList.length);
        }

        function initLiveDanmu(chatroomId) {
            if (!chatroomId) return;
            if (nimInstance) {
                nimInstance.disconnect();
                nimInstance = null;
            }
            nimInstance = NIM.Chatroom.getInstance({
                appKey: '632feff1f4c838541ab75195d1ceb3fa',
                chatroomId: chatroomId,
                chatroomAddresses: ['chatweblink01.netease.im:443'],
                isAnonymous: true,
                chatroomNick: 'guest_' + Math.floor(Math.random() * 10000),
                onconnect: () => {
                    if (dp) dp.notice('弹幕服务器已连接');
                },
                onmsgs: (msgs) => {
                    msgs.forEach(msg => {
                        let text = "";
                        try {
                            if (msg.type === 'text') text = msg.text;
                            else if (msg.custom) {
                                const custom = JSON.parse(msg.custom);
                                text = custom.text;
                            }
                        } catch (e) { }
                        if (text && dp && dp.danmaku) dp.danmaku.draw({
                            text: text,
                            color: '#fff',
                            type: 'right'
                        });
                    });
                }
            });
        }

        function updatePaginationControls(totalItems) {
            const controlsContainer = document.getElementById('vod-pagination-controls');
            if (!controlsContainer) return;
            if (totalItems === 0) {
                controlsContainer.innerHTML = '';
                return;
            }
            const current = vodState.currentPage;
            const totalPagesLocal = Math.ceil(totalItems / vodState.pageSize);
            let html = '';
            html += `<button class="pagination-btn" onclick="goToPage(1)" ${current <= 1 ? 'disabled' : ''}>首页</button>`;
            html += `<button class="pagination-btn" onclick="handlePrevPage()" ${current <= 1 ? 'disabled' : ''}>上一页</button>`;
            let start = Math.max(1, current - 2),
                end = start + 4;
            if (end > totalPagesLocal) {
                end = Math.max(totalPagesLocal, 1);
                start = Math.max(1, end - 4);
            }
            for (let i = start; i <= end; i++) html += generatePageBtn(i, current);
            const canNext = current < totalPagesLocal || vodState.hasMore;
            html += `<button class="pagination-btn" onclick="handleNextPage()" ${!canNext ? 'disabled' : ''}>下一页</button>`;
            html += `<button class="pagination-btn" onclick="goToPage(${totalPagesLocal})" ${totalPagesLocal <= 1 ? 'disabled' : ''}>尾页</button>`;
            controlsContainer.innerHTML = html;
        }

        function generatePageBtn(pageNum, current) {
            const activeClass = pageNum === current ? 'active' : '';
            return `<button class="pagination-btn ${activeClass}" onclick="goToPage(${pageNum})">${pageNum}</button>`;
        }
        async function fetchLiveList() {
            const vodLoading = document.getElementById('vod-loading');
            const vodListContainer = document.getElementById('vod-list-container');

            vodLoading.style.display = 'block';
            vodListContainer.innerHTML = '';

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveList', JSON.stringify({
                    debug: true,
                    next: 0,
                    groupId: 0,
                    record: false
                }));

                vodLoading.style.display = 'none';

                if (res && res.status === 200 && res.content && res.content.liveList) {
                    currentLiveListRaw = res.content.liveList;
                    handleLiveFilter();
                } else {
                    currentLiveListRaw = [];
                    vodListContainer.innerHTML = '<div style="width:100%; text-align:center; color:#888;">当前没有成员在直播</div>';
                }
            } catch (err) {
                console.error(err);
                vodLoading.style.display = 'none';
                vodLoading.textContent = '获取失败，请检查网络';
            }
        }


        function toggleLiveGroupDropdown() {
            const list = document.getElementById('live-group-dropdown');
            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
            document.getElementById('live-type-dropdown').style.display = 'none';
        }

        function selectLiveGroup(val, text) {
            document.getElementById('live-group-value').value = val;
            document.getElementById('live-group-display').value = text;
            document.getElementById('live-group-dropdown').style.display = 'none';
            handleLiveFilter();
        }

        function toggleLiveTypeDropdown() {
            const list = document.getElementById('live-type-dropdown');
            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
            document.getElementById('live-group-dropdown').style.display = 'none';
        }

        function selectLiveType(val, text) {
            document.getElementById('live-type-value').value = val;
            document.getElementById('live-type-display').value = text;
            document.getElementById('live-type-dropdown').style.display = 'none';
            handleLiveFilter();
        }


        function handleLiveFilter() {
            const groupVal = document.getElementById('live-group-value').value;
            const typeVal = document.getElementById('live-type-value').value;

            const searchInput = document.getElementById('live-search-input');
            const container = document.getElementById('vod-list-container');
            const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';

            if (!currentLiveListRaw || currentLiveListRaw.length === 0) {
                container.innerHTML = '<div style="width:100%; text-align:center; color:#888;">当前没有成员在直播</div>';
                return;
            }

            const filtered = currentLiveListRaw.filter(item => {
                let matchGroup = true;
                if (groupVal !== 'all') {
                    const memberId = item.userInfo ? item.userInfo.userId : item.userId;
                    const teamName = item.userInfo ? item.userInfo.teamName : '';
                    const nickname = item.userInfo ? item.userInfo.nickname : '';
                    const code = getGroupCode(memberId, teamName, nickname);
                    if (code !== groupVal) matchGroup = false;
                }

                let matchType = true;
                if (typeVal !== 'all') {
                    const isRadio = (item.liveType === 2);
                    const isRecord = (item.liveMode === 1);

                    if (typeVal === 'record') {
                        if (!isRecord) matchType = false;
                    } else if (typeVal === 'video') {
                        if (isRadio || isRecord) matchType = false;
                    } else if (typeVal === 'radio') {
                        if (!isRadio) matchType = false;
                    }
                }

                let matchKeyword = true;
                if (keyword) {
                    const name = (item.userInfo ? item.userInfo.nickname : '').toLowerCase();
                    const title = (item.title || item.liveTitle || '').toLowerCase();
                    if (!name.includes(keyword) && !title.includes(keyword)) {
                        matchKeyword = false;
                    }
                }

                return matchGroup && matchType && matchKeyword;
            });

            if (filtered.length === 0) {
                container.innerHTML = '<div style="width:100%; text-align:center; color:#888; padding: 20px;">没有匹配的直播间</div>';
            } else {
                renderLiveList(filtered);
            }
        }



        function renderLiveList(list) {
            vodListContainer.className = 'live-card-grid';
            vodListContainer.innerHTML = '';
            list.forEach(item => {
                const card = document.createElement('div');
                card.className = 'live-card';
                const cover = item.coverPath ? `https://source.48.cn${item.coverPath}` : './icon.png';
                let typeText = '视频', typeClass = 'badge-video';

                if (item.liveMode === 1) {
                    typeText = '录屏';
                    typeClass = 'badge-record';
                } else if (item.liveType === 2) {
                    typeText = '电台';
                    typeClass = 'badge-radio';
                }
                card.innerHTML = `
                    <div class="live-badge ${typeClass}">${typeText}</div>
                    <img src="${cover}" onclick="directToPotPlayer(event, '${item.liveId}')" title="点击头像直接调用外部播放器播放" style="cursor: pointer;">
                    <div class="name">${item.userInfo.nickname}</div>
                    <div class="title">${item.title}</div>
                `;
                card.onclick = () => playLiveStream(item, 'live');
                vodListContainer.appendChild(card);
            });
        }
        let liveRecordCount = 0;
        async function playLiveStream(item, mode) {
            liveRecordCount = 0;
            currentPlayingItem = item;

            resetClipTool();

            document.getElementById('media-list-area').style.display = 'none';
            document.getElementById('vod-pagination-controls').style.display = 'none';
            document.getElementById('media-list-controls').style.display = 'none';

            const playerView = document.getElementById('live-player-view');
            if (playerView) playerView.style.display = 'flex';

            const authorEl = document.getElementById('current-live-author');
            if (authorEl) authorEl.textContent = item.userInfo ? item.userInfo.nickname : (item.nickname || '未知成员');

            const splitLayout = document.getElementById('player-split-layout');
            const timelineWrapper = document.getElementById('danmu-timeline-wrapper');
            const playerArea = document.getElementById('live-player-area');

            const rightWrapper = document.getElementById('player-right-column');
            const comboWrapper = document.getElementById('player-combo-wrapper');

            let announcementBar = document.getElementById('live-announcement-bar');
            if (!announcementBar && comboWrapper && playerArea) {
                announcementBar = document.createElement('div');
                announcementBar.id = 'live-announcement-bar';
                comboWrapper.insertBefore(announcementBar, playerArea);
            }
            if (announcementBar) {
                announcementBar.style.cssText = 'display: none; background: linear-gradient(135deg, rgba(250, 140, 22, 0.1) 0%, rgba(250, 140, 22, 0.02) 100%); color: #fa8c16; font-size: 13px; padding: 12px 16px; border-bottom: 1px solid rgba(250, 140, 22, 0.15); flex-shrink: 0; overflow: hidden;';

                announcementBar.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div style="display:flex; align-items:flex-start; gap:8px; flex:1;">
                            <span style="font-size:16px; line-height:1.4; filter: drop-shadow(0 2px 4px rgba(250, 140, 22, 0.3));">📢</span>
                            <div id="live-announcement-text" style="white-space: pre-wrap; line-height: 1.6; letter-spacing: 0.5px; flex:1; font-weight: 500; max-height: calc(1.6em * 3); overflow-y: auto; overflow-x: hidden; padding-right: 4px;"></div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                            <button class="btn btn-secondary" onclick="event.stopPropagation(); refreshLiveAnnouncement(this);" style="height: 22px; padding: 0 8px; font-size: 11px; background: transparent; border: 1px solid rgba(250,140,22,0.3); color: #fa8c16; border-radius: 4px; flex-shrink: 0; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(250,140,22,0.1)'" onmouseout="this.style.background='transparent'">↻</button>
                            <button class="btn btn-secondary" onclick="event.stopPropagation(); closeLiveAnnouncement();" style="height: 22px; min-width: 22px; padding: 0 6px; font-size: 13px; line-height: 1; background: transparent; border: 1px solid rgba(250,140,22,0.3); color: #fa8c16; border-radius: 4px; flex-shrink: 0; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(250,140,22,0.1)'" onmouseout="this.style.background='transparent'">×</button>
                        </div>
                    </div>
                `;
            }

            let rankContainer = document.getElementById('live-rank-container');

            if (!rankContainer) {
                rankContainer = document.createElement('div');
                rankContainer.id = 'live-rank-container';
            }

            if (comboWrapper) {
                comboWrapper.appendChild(rankContainer);
            }

            if (rankContainer) {
                rankContainer.style.cssText = 'display: none; background: transparent; border-top: 1px solid rgba(128,128,128,0.2);';

                rankContainer.innerHTML = `
                    <div onclick="toggleRankPanel()" style="padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; background: var(--input-bg); user-select: none;">
                        <div style="display: flex; align-items: center;">
                            <span style="font-weight: bold; margin-right: 10px;">💡 贡献榜</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <button class="btn btn-secondary" onclick="event.stopPropagation(); fetchLiveRank();" style="padding: 0 6px; height: 20px; font-size: 12px;">↻</button>
                            <span id="rank-panel-arrow" style="display: inline-block; font-size: 12px; color: #999; transition: transform 0.2s; transform: rotate(0deg);">▼</span>
                        </div>
                    </div>
                    <div id="live-rank-list" style="display: none; padding: 10px; border-top: 1px solid var(--border); background: var(--bg); max-height: 250px; overflow-y: auto;"></div>
                `;
            }

            if (splitLayout) {
                if (mode === 'live') {
                    splitLayout.style.flexDirection = 'column';
                    splitLayout.style.alignItems = 'stretch';
                    if (timelineWrapper) timelineWrapper.style.display = 'none';

                    if (rightWrapper) {
                        rightWrapper.style.width = '100%';
                        rightWrapper.style.maxWidth = '1200px';
                        rightWrapper.style.margin = '0 auto';
                        rightWrapper.style.overflowY = 'visible';
                        rightWrapper.style.paddingRight = '0';
                        rightWrapper.style.paddingBottom = '0';
                        rightWrapper.style.height = 'auto';
                    }

                    playerView.style.flex = '1';
                    playerView.style.height = 'auto';
                    playerView.style.minHeight = '0';
                    playerView.style.setProperty('overflow', 'visible', 'important');

                    if (comboWrapper) {
                        comboWrapper.style.flex = 'none';
                        comboWrapper.style.height = 'auto';
                    }
                    if (playerArea) {
                        playerArea.style.flex = 'none';
                        playerArea.style.height = 'auto';
                        playerArea.style.aspectRatio = '16 / 9';
                        playerArea.style.minHeight = '350px';
                    }
                } else {
                    splitLayout.style.flexDirection = 'row';
                    splitLayout.style.alignItems = 'stretch';
                    if (timelineWrapper) timelineWrapper.style.display = 'flex';

                    if (rightWrapper) {
                        rightWrapper.style.width = 'auto';
                        rightWrapper.style.maxWidth = 'none';
                        rightWrapper.style.margin = '0';
                        rightWrapper.style.overflowY = 'auto';
                        rightWrapper.style.paddingRight = '5px';
                        rightWrapper.style.paddingBottom = '0';
                        rightWrapper.style.height = '100%';
                    }

                    playerView.style.flex = '1';
                    playerView.style.height = 'auto';
                    playerView.style.minHeight = '0';
                    playerView.style.setProperty('overflow', 'hidden', 'important');

                    if (comboWrapper) {
                        comboWrapper.style.flex = '1 0 auto';
                        comboWrapper.style.height = 'auto';
                    }
                    if (playerArea) {
                        playerArea.style.flex = '1 0 auto';
                        playerArea.style.height = 'auto';
                        playerArea.style.aspectRatio = 'auto';
                        playerArea.style.minHeight = '300px';
                    }
                }
            }

            const giftContainer = document.getElementById('live-gift-container');
            if (giftContainer) {
                if (mode === 'live') {
                    giftContainer.style.display = 'block';
                } else {
                    giftContainer.style.display = 'none';
                }
            }

            const giftPanel = document.getElementById('live-gift-panel');
            const arrow = document.getElementById('gift-panel-arrow');
            if (giftPanel) giftPanel.style.display = 'none';
            if (arrow) arrow.style.transform = 'rotate(0deg)';
            selectedLiveGiftId = null;

            const rankList = document.getElementById('live-rank-list');
            const rankArrow = document.getElementById('rank-panel-arrow');
            if (rankList) rankList.style.display = 'none';
            if (rankArrow) rankArrow.style.transform = 'rotate(0deg)';

            const liveControls = document.getElementById('live-list-controls');
            if (liveControls) liveControls.style.display = 'none';

            const titleContainer = document.getElementById('current-live-title');
            const dateContainer = document.getElementById('current-live-date');
            const timeContainer = document.getElementById('current-live-time');
            let dateLabel = '';
            let timeLabel = '';

            if (item.startTime || item.ctime) {
                const ts = Number(item.startTime || item.ctime);
                if (!isNaN(ts)) {
                    const d = new Date(ts);
                    const pad = (n) => String(n).padStart(2, '0');

                    dateLabel = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                    timeLabel = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                }
            }

            titleContainer.textContent = item.title || item.liveTitle || '直播/回放';
            if (dateContainer) dateContainer.textContent = dateLabel || '未知';
            if (timeContainer) timeContainer.textContent = timeLabel || '未知';

            const oldNotice = document.querySelector('#live-player-area .live-link-info');
            if (oldNotice) oldNotice.remove();

            if (typeof liveVideo !== 'undefined') liveVideo.style.display = 'none';
            liveAnnouncementDismissed = false;

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({
                    liveId: item.liveId
                }));
                if (res && res.status === 200 && res.content) {
                    const streamUrl = res.content.playStreamPath;
                    const title = item.title || item.liveTitle;
                    const isLive = (mode === 'live');
                    const danmuUrl = res.content.msgFilePath;

                    if (announcementBar) {
                        const textEl = document.getElementById('live-announcement-text');

                        if (res.content.announcement) {
                            textEl.innerText = res.content.announcement;
                            announcementBar.scrollTop = 0;
                        } else {
                            textEl.innerHTML = '<span style="opacity: 0.6; font-style: italic;">暂无公告</span>';
                        }

                        announcementBar.style.display = liveAnnouncementDismissed ? 'none' : 'block';
                    }

                    if (rankContainer) {
                        if (isLive) {
                            rankContainer.style.display = 'block';
                            if (typeof fetchLiveRank === 'function') fetchLiveRank(item.liveId);
                        } else {
                            rankContainer.style.display = 'none';
                        }
                    }

                    let danmuData = [];
                    if (!isLive && danmuUrl) {
                        try {
                            const secureUrl = danmuUrl.replace(/^http:\/\//i, 'https://');
                            const danmuText = await fetchDanmuNative(secureUrl);
                            danmuData = parsePocketDanmu(danmuText);
                        } catch (e) { }
                    }

                    renderDanmuListUI(danmuData);
                    startPlayer(streamUrl, title, isLive, res.content.chatroomId, danmuData);
                } else {
                    showToast('无法获取流地址');
                    backToLiveList();
                }
            } catch (err) {
                showToast('播放失败');
                backToLiveList();
            }
        }

        async function refreshLiveAnnouncement(btnElement) {
            if (!currentPlayingItem || !currentPlayingItem.liveId) return;

            const originalText = btnElement.innerText;
            btnElement.innerText = '...';
            btnElement.disabled = true;

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({
                    liveId: currentPlayingItem.liveId
                }));

                if (res && res.status === 200 && res.content) {
                    const textEl = document.getElementById('live-announcement-text');
                    const barEl = document.getElementById('live-announcement-bar');

                    const newText = res.content.announcement;

                    if (newText) {
                        textEl.innerText = newText;
                    } else {
                        textEl.innerHTML = '<span style="opacity: 0.6; font-style: italic;">暂无公告</span>';
                    }

                    barEl.style.display = liveAnnouncementDismissed ? 'none' : 'block';

                    btnElement.innerText = '✓';
                } else {
                    btnElement.innerText = '❌';
                }
            } catch (e) {
                console.error('刷新公告失败:', e);
                btnElement.innerText = '❌';
            }

            setTimeout(() => {
                if (btnElement) {
                    btnElement.innerText = '↻';
                    btnElement.disabled = false;
                }
            }, 2000);
        }

        function closeLiveAnnouncement() {
            liveAnnouncementDismissed = true;
            const barEl = document.getElementById('live-announcement-bar');
            if (barEl) {
                barEl.style.display = 'none';
            }
        }

        function toggleRankPanel() {
            const list = document.getElementById('live-rank-list');
            const arrow = document.getElementById('rank-panel-arrow');

            if (!list) return;

            if (list.style.display === 'none' || list.style.display === '') {
                list.style.display = 'block';
                if (arrow) arrow.style.transform = 'rotate(180deg)';
            } else {
                list.style.display = 'none';
                if (arrow) arrow.style.transform = 'rotate(0deg)';
            }
        }

        async function fetchLiveRank(liveIdParam) {
            const liveId = liveIdParam || (currentPlayingItem ? currentPlayingItem.liveId : null);
            if (!liveId) return;

            const listContainer = document.getElementById('live-rank-list');
            if (!listContainer) return;

            listContainer.innerHTML = '<div style="text-align: center; color: var(--text-sub); font-size: 12px; padding: 20px;"><div class="spinner" style="width:20px;height:20px;margin:0 auto 10px;"></div>正在加载数据...</div>';

            const token = appToken || localStorage.getItem('yaya_p48_token');
            const pa = window.getPA ? window.getPA() : null;

            try {
                const res = await ipcRenderer.invoke('fetch-live-rank', { token, pa, liveId });

                if (res.success && res.content && res.content.data) {
                    const rankData = res.content.data;

                    if (rankData.length === 0) {
                        listContainer.innerHTML = '<div style="text-align: center; color: var(--text-sub); font-size: 12px; padding: 15px;">本场暂无贡献数据</div>';
                        return;
                    }

                    let html = '';
                    rankData.forEach((item, index) => {
                        const isTop3 = index < 3;
                        const rClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : ''));

                        let avatar = './icon.png';
                        if (item.user && item.user.userAvatar) {
                            avatar = item.user.userAvatar.startsWith('http') ? item.user.userAvatar : `https://source.48.cn${item.user.userAvatar}`;
                        }
                        const userName = item.user ? item.user.userName : '未知用户';

                        html += `
                <div style="display: flex; align-items: center; padding: 10px 8px; border-bottom: 1px solid rgba(128,128,128,0.1); transition: background 0.2s; cursor: default;" onmouseover="this.style.background='var(--chip-hover)'" onmouseout="this.style.background='transparent'">
                    <div class="rank-num ${rClass}" style="width: 24px; height: 24px; min-width: 24px; font-size: 11px; margin-right: 12px; margin-bottom: 0;">${index + 1}</div>
                    
                    <img src="${avatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; margin-right: 12px; border: 1px solid rgba(0,0,0,0.05); flex-shrink: 0;">
                    
                    <div style="flex: 1; font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${isTop3 ? 'bold' : '500'};">
                        ${userName}
                    </div>
                    
                    <div style="font-size: 14px; color: #fa8c16; font-weight: bold; margin-left: 10px; flex-shrink: 0; text-shadow: 0 0 10px rgba(250, 140, 22, 0.1);">
                        ${item.money} <span style="font-size: 11px; color: var(--text-sub); font-weight: normal; opacity: 0.6; margin-left: 2px;">贡献值</span>
                    </div>
                </div>
                `;
                    });
                    listContainer.innerHTML = html;
                } else {
                    listContainer.innerHTML = '<div style="text-align: center; color: var(--text-sub); font-size: 12px; padding: 15px;">获取榜单失败</div>';
                }
            } catch (e) {
                listContainer.innerHTML = `<div style="text-align: center; color: #ff4d4f; font-size: 12px; padding: 15px;">出错了: ${e.message}</div>`;
            }
        }

        let clipStartTime = null;
        let clipEndTime = null;

        function updateClipUI() {
            const startDisplay = document.getElementById('clip-start-display');
            const endDisplay = document.getElementById('clip-end-display');
            const durationDisplay = document.getElementById('clip-duration-display');
            const clipBtn = document.getElementById('btn-do-clip');

            const formatTimeMS = (s) => {
                if (s === null || s === undefined) return '';
                const h = Math.floor(s / 3600);
                const m = Math.floor((s % 3600) / 60);
                const sec = Math.floor(s % 60);
                const ms = Math.floor((s % 1) * 1000);

                const pad = (n, w = 2) => String(n).padStart(w, '0');
                return `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms, 3)}`;
            };

            if (startDisplay) startDisplay.textContent = formatTimeMS(clipStartTime);
            if (endDisplay) endDisplay.textContent = formatTimeMS(clipEndTime);

            if (clipStartTime !== null && clipEndTime !== null) {
                const dur = clipEndTime - clipStartTime;
                if (dur > 0) {
                    if (durationDisplay) durationDisplay.textContent = `切片时长: ${dur.toFixed(2)}s`;
                    if (clipBtn) clipBtn.disabled = false;
                } else {
                    if (durationDisplay) durationDisplay.textContent = `切片时长: 无效`;
                    if (clipBtn) clipBtn.disabled = true;
                }
            } else {
                if (durationDisplay) durationDisplay.textContent = '切片时长: 0s';
                if (clipBtn) clipBtn.disabled = true;
            }
        }

        function resetClipTool() {
            clipStartTime = null;
            clipEndTime = null;
            currentRecordTaskId = null;
            updateClipUI();
        }

        window.setClipStartFromTimeline = function (time) {
            clipStartTime = time;
            if (clipEndTime !== null && clipEndTime <= clipStartTime) clipEndTime = null;
            updateClipUI();
            if (art && art.notice) art.notice.show = `已打点起点`;
            if (art) art.seek = time;
        };

        window.setClipEndFromTimeline = function (time) {
            if (clipStartTime === null) {
                if (art && art.notice) art.notice.show = '❌ 请先设置起点';
                return;
            }
            if (time <= clipStartTime) {
                if (art && art.notice) art.notice.show = '❌ 终点必须晚于起点';
                return;
            }
            clipEndTime = time;
            updateClipUI();
            if (art && art.notice) art.notice.show = `已打点终点`;
            if (art) art.seek = time;
        };


        let currentRecordTaskId = null;

        function setClipStart() {
            if (!art && !dp) return;
            if (currentMode === 'live') {
                if (currentRecordTaskId) {
                    if (dp) dp.notice('⚠️ 录制正在进行中，请先结束当前片段');
                    return;
                }
                currentRecordTaskId = 'rec_' + Date.now();
                const url = art.option.url;

                const customSavePath = localStorage.getItem('yaya_path_clip') || '';

                ipcRenderer.send('start-record', {
                    url: url,
                    taskId: currentRecordTaskId,
                    savePath: customSavePath
                });
                document.getElementById('clip-start-display').textContent = "🔴 状态: 正在录制...";
                if (dp) dp.notice('🔴 后台录制已开启');
            } else {
                clipStartTime = art.currentTime;
                if (clipEndTime !== null && clipEndTime <= clipStartTime) clipEndTime = null;
                updateClipUI();
                art.notice.show = `已设定起点`;
            }
        }

        function setClipEnd() {
            if (!art && !dp) return;
            if (currentMode === 'live') {
                if (!currentRecordTaskId) {
                    if (dp) dp.notice('❌ 请先点击开始录制');
                    return;
                }
                liveRecordCount++;
                const nickname = currentPlayingItem?.userInfo?.nickname || currentPlayingItem?.nickname || '未知成员';
                let timeStr = '00000000_00.00.00';
                const rawTime = currentPlayingItem?.startTime || currentPlayingItem?.ctime;
                if (rawTime) {
                    const d = new Date(Number(rawTime));
                    const pad = (n) => String(n).padStart(2, '0');
                    timeStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
                }
                const fileName = `直播切片_【${nickname}】${timeStr}_${liveRecordCount}`;
                ipcRenderer.send('stop-record', {
                    taskId: currentRecordTaskId,
                    fileName: fileName
                });
                const downloadList = document.getElementById('downloadList');
                if (downloadList.innerText.includes('暂无')) downloadList.innerHTML = '';
                downloadList.insertAdjacentHTML('afterbegin', `
                    <div class="download-item" id="${currentRecordTaskId}">
                        <div class="download-title-row">
                            <div class="download-title-line" title="${fileName}">${fileName}</div>
                            <button class="btn-cancel" onclick="cancelDownloadTask('${currentRecordTaskId}')">取消</button>
                        </div>
                        <div class="progress-container" style="margin: 5px 0;">
                            <div class="progress-fill" style="width: 100%; opacity: 0.5;"></div>
                        </div>
                        <span class="download-status-text">正在停止并封装视频...</span>
                    </div>
                `);
                document.getElementById('clip-start-display').textContent = "起点: 未设置";
                document.getElementById('clip-end-display').textContent = "✅ 录制请求已提交";
                currentRecordTaskId = null;
            } else {
                if (clipStartTime === null) {
                    art.notice.show = '❌ 请先设置起点';
                    return;
                }
                const current = art.currentTime;
                if (current <= clipStartTime) {
                    art.notice.show = '❌ 终点必须晚于起点';
                    return;
                }
                clipEndTime = art.currentTime;
                updateClipUI();
                art.notice.show = `已设定终点`;
            }
        }

        function executeClip() {
            if (!art || clipStartTime === null || clipEndTime === null) return;
            const duration = clipEndTime - clipStartTime;
            if (duration <= 0.5) {
                art.notice.show = '❌ 片段太短';
                return;
            }
            const customSavePath = localStorage.getItem('yaya_path_clip') || '';
            const nickname = currentPlayingItem?.userInfo?.nickname || currentPlayingItem?.nickname || '未知成员';
            const baseTimeNum = Number(currentPlayingItem?.startTime || currentPlayingItem?.ctime || Date.now());
            const d = new Date(baseTimeNum);
            const pad = (n) => String(n).padStart(2, '0');
            const streamStartDateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
            const formatRelativeTime = (s) => {
                const ts = Math.floor(s),
                    h = Math.floor(ts / 3600),
                    m = Math.floor((ts % 3600) / 60),
                    sec = ts % 60;
                return h > 0 ? `${pad(h)}.${pad(m)}.${pad(sec)}` : `${pad(m)}.${pad(sec)}`;
            };
            const startStrFile = formatRelativeTime(clipStartTime),
                endStrFile = formatRelativeTime(clipEndTime);
            const formatRelativeTimeUI = (s) => {
                const ts = Math.floor(s),
                    m = Math.floor(ts / 60),
                    sec = ts % 60;
                return `${pad(m)}:${pad(sec)}`;
            };
            const fileName = `【${nickname}】${streamStartDateStr}~${startStrFile}_${endStrFile}`;
            const displayName = `【${nickname}】${streamStartDateStr}~${formatRelativeTimeUI(clipStartTime)}_${formatRelativeTimeUI(clipEndTime)}`;
            const taskId = 'clip_' + Date.now();
            const downloadList = document.getElementById('downloadList');
            if (downloadList.innerText.includes('暂无下载任务')) downloadList.innerHTML = '';
            downloadList.insertAdjacentHTML('afterbegin', `
                <div class="download-item" id="${taskId}">
                    <div class="download-title-row">
                        <div class="download-title-line" title="${displayName}">${displayName}</div>
                        <button class="btn-cancel" onclick="cancelDownloadTask('${taskId}')">取消</button>
                    </div>
                    <div class="download-detail-row">
                        <span>✂️ 视频切片</span>
                        <b class="download-percent">0%</b>
                    </div>
                    <div class="progress-container" style="margin: 5px 0;">
                        <div class="progress-fill"></div>
                    </div>
                    <span class="download-status-text">正在准备切片...</span>
                </div>
            `);
            art.notice.show = '🚀 切片任务已开始';
            window.ipcRenderer.send('clip-vod', {
                url: art.option.url,
                fileName: fileName,
                startTime: clipStartTime,
                duration: duration,
                taskId: taskId,
                savePath: customSavePath
            });
        }
        let nimInstance = null,
            dp = null,
            art = null;
        async function startPlayer(url, title = '直播/回放', isLiveContent = false, chatroomId = null, vodDanmuData = []) {
            destroyPlayers();
            const container = document.getElementById('live-player-container');
            if (isLiveContent) {
                try {
                    container.innerHTML = '<div style="color:white;display:flex;height:100%;align-items:center;justify-content:center;">来自yk1z的提示：正在连接中...</div>';
                    const localUrl = await ipcRenderer.invoke('start-live-proxy', url);
                    await new Promise(r => setTimeout(r, 1000));
                    container.innerHTML = '<div id="dplayer-container" style="width:100%; height:100%"></div>';
                    let flvPlayer = null;
                    dp = new DPlayer({
                        container: document.getElementById('dplayer-container'),
                        live: isLiveContent,
                        autoplay: true,
                        screenshot: true,
                        hotkey: false,
                        playbackSpeed: [1],
                        theme: '#FF8EBF',
                        video: {
                            url: localUrl,
                            type: 'customFlv',
                            customType: {
                                customFlv: function (video) {
                                    flvPlayer = mpegts.createPlayer({
                                        type: 'flv',
                                        url: localUrl,
                                        isLive: true,
                                        enableWorker: false,
                                        enableStashBuffer: false
                                    });
                                    flvPlayer.attachMediaElement(video);
                                    flvPlayer.load();
                                }
                            }
                        }
                    });
                    art = {
                        get currentTime() {
                            return dp.video.currentTime;
                        },
                        get notice() {
                            return {
                                show: (msg) => dp.notice(msg)
                            };
                        },
                        option: {
                            url: localUrl
                        }
                    };

                    setInterval(() => {
                        if (flvPlayer && flvPlayer.buffered.length) {
                            let diff = flvPlayer.buffered.end(0) - flvPlayer.currentTime;
                            if (diff > 2) flvPlayer.currentTime = flvPlayer.buffered.end(0) - 0.1;
                        }
                    }, 3000);
                    if (chatroomId) initLiveDanmu(chatroomId);
                } catch (err) {
                    container.innerHTML = `<div style="color:red">播放失败: ${err.message}</div>`;
                }
                return;
            }
            container.innerHTML = '<div class="artplayer-app"></div>';
            const loadSubtitle = (file) => {
                if (!file || !art) return;
                const ext = file.name.split('.').pop().toLowerCase();

                const reader = new FileReader();
                reader.onload = (e) => {
                    let text = e.target.result;

                    if (ext === 'srt') {
                        currentSubtitleList = parseSRT(text);
                        if (typeof switchTimelineMode === 'function') {
                            switchTimelineMode('subtitle');
                        }
                    } else {
                        console.warn('时间轴目前主要支持解析 SRT 格式的本地字幕');
                    }

                    if (ext === 'srt') {
                        let vttText = text.replace(/(^|[\r\n]+)\d+([\r\n]+)(?=\d{2}:\d{2}:\d{2})/g, '$1');
                        vttText = vttText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
                        if (!vttText.startsWith('WEBVTT')) vttText = 'WEBVTT\n\n' + vttText;

                        const url = URL.createObjectURL(new Blob([vttText], { type: 'text/vtt;charset=utf-8' }));
                        art.subtitle.switch(url, { type: 'vtt', name: '本地字幕' }).then(() => {
                            if (art.notice) art.notice.show = `字幕加载成功: ${file.name}`;
                        });
                    } else {
                        const url = URL.createObjectURL(file);
                        art.subtitle.switch(url, { type: ext, name: '本地字幕' }).then(() => {
                            if (art.notice) art.notice.show = `字幕加载成功: ${file.name}`;
                        });
                    }
                };

                reader.readAsText(file);
            };
            let subInput = document.getElementById('art-subtitle-loader');
            if (!subInput) {
                subInput = document.createElement('input');
                subInput.type = 'file';
                subInput.id = 'art-subtitle-loader';
                subInput.accept = '.srt,.vtt,.ass';
                subInput.style.display = 'none';
                document.body.appendChild(subInput);
            }
            subInput.onchange = (e) => {
                loadSubtitle(e.target.files[0]);
                subInput.value = '';
            };
            if (window.Artplayer) Artplayer.CONTEXTMENU = false;
            art = new Artplayer({
                container: '.artplayer-app',
                url: url,
                title: title,
                isLive: isLiveContent,
                theme: '#FF8EBF',
                autoSize: false,
                fullscreen: true,
                fullscreenWeb: true,
                setting: true,
                subtitleOffset: true,
                pip: true,
                flip: true,
                playbackRate: true,
                aspectRatio: true,
                contextmenu: [],
                subtitle: {
                    url: '',
                    type: 'vtt',
                    encoding: 'utf-8',
                    style: {
                        color: '#FFFFFF',
                        fontSize: '30px',
                        fontWeight: 'bold',
                        textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 2px #000',
                        fontFamily: 'sans-serif',
                        marginBottom: '30px',
                        backgroundColor: 'transparent'
                    }
                },
                settings: [{
                    html: '字幕颜色',
                    width: 250,
                    tooltip: '白色',
                    selector: [{
                        html: '<span style="color:#ffffff; font-weight:bold;">白色</span>',
                        url: '#FFFFFF',
                        default: true
                    },
                    {
                        html: '<span style="color:#ffff00; font-weight:bold;">黄色</span>',
                        url: '#FFFF00'
                    },
                    {
                        html: '<span style="color:#00ff00; font-weight:bold;">绿色</span>',
                        url: '#00FF00'
                    },
                    {
                        html: '<span style="color:#ff0000; font-weight:bold;">红色</span>',
                        url: '#FF0000'
                    },
                    {
                        html: '<span style="color:#00ffff; font-weight:bold;">青色</span>',
                        url: '#00FFFF'
                    },
                    {
                        html: '<span style="color:#ff00ff; font-weight:bold;">洋红</span>',
                        url: '#FF00FF'
                    }
                    ],
                    onSelect: function (item) {
                        art.subtitle.style('color', item.url);
                        return item.html;
                    }
                },
                {
                    html: '字幕大小',
                    width: 250,
                    tooltip: '30px',
                    selector: [{
                        html: '20px (小)',
                        url: '20px'
                    },
                    {
                        html: '30px (标准)',
                        url: '30px',
                        default: true
                    },
                    {
                        html: '40px (大)',
                        url: '40px'
                    },
                    {
                        html: '50px (特大)',
                        url: '50px'
                    },
                    {
                        html: '60px (极大)',
                        url: '60px'
                    },
                    {
                        html: '80px (巨型)',
                        url: '80px'
                    }
                    ],
                    onSelect: function (item) {
                        art.subtitle.style('fontSize', item.url);
                        return item.html;
                    }
                },
                {
                    html: '垂直位置',
                    width: 250,
                    tooltip: '30px',
                    selector: [{
                        html: '0px (最底)',
                        url: '0px'
                    },
                    {
                        html: '30px (标准)',
                        url: '30px',
                        default: true
                    },
                    {
                        html: '60px (偏高)',
                        url: '60px'
                    },
                    {
                        html: '100px (高)',
                        url: '100px'
                    },
                    {
                        html: '150px (很高)',
                        url: '150px'
                    }
                    ],
                    onSelect: function (item) {
                        art.subtitle.style('marginBottom', item.url);
                        return item.html;
                    }
                }
                ],
                controls: [
                    {
                        name: 'upload-subtitle',
                        position: 'right',
                        html: `
        <svg width="22" height="22" viewBox="0 0 24 24" style="background:none;">
            <path d="M19 4H5C3.89 4 3 4.9 3 6V18C3 19.1 3.89 20 5 20H19C20.1 20 21 19.1 21 18V6C21 4.9 20.1 4 19 4ZM11 11H9.5V10.5H7.5V13.5H9.5V13H11V14C11 14.55 10.55 15 10 15H7C6.45 15 6 14.55 6 14V10C6 9.45 6.45 9 7 9H10C10.55 9 11 9.45 11 10V11ZM18 11H16.5V10.5H14.5V13.5H16.5V13H18V14C18 14.55 17.55 15 17 15H14C13.45 15 13 14.55 13 14V10C13 9.45 13.45 9 14 9H17C17.55 9 18 9.45 18 10V11Z" 
                  style="fill: #ffffff !important; stroke: none !important;">
            </path>
        </svg>
    `,
                        tooltip: '加载本地字幕',
                        click: function () {
                            if (typeof subInput !== 'undefined') {
                                subInput.click();
                            }
                        }
                    },
                    {
                        name: 'rotate',
                        position: 'right',
                        html: `
        <svg width="22" height="22" viewBox="0 0 24 24" style="background:none;">
            <path d="M17 1L7 1C5.89 1 5 1.89 5 3V21C5 22.1 5.89 23 7 23H17C18.1 23 19 22.1 19 21V3C19 1.89 18.1 1 17 1Z" 
                  style="fill: none !important; stroke: #ffffff !important; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;">
            </path>
            
            <path d="M12 18L12 18.01" 
                  style="fill: none !important; stroke: #ffffff !important; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;">
            </path>
            
            <path d="M22 8L22 16" stroke-dasharray="2 2"
                  style="fill: none !important; stroke: #ffffff !important; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;">
            </path>
            
            <path d="M2 8L2 16" stroke-dasharray="2 2"
                  style="fill: none !important; stroke: #ffffff !important; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;">
            </path>
        </svg>
    `,
                        tooltip: '画面旋转',
                        click: function () {
                            if (typeof this.currentRotate === 'undefined') {
                                this.currentRotate = 0;
                                this.video.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
                            }

                            this.currentRotate += 90;

                            const isPerpendicular = this.currentRotate % 180 !== 0;

                            if (isPerpendicular) {
                                this.video.style.objectFit = 'contain';
                            } else {
                                this.video.style.objectFit = '';
                            }

                            this.video.style.transform = `rotate(${this.currentRotate}deg)`;

                            const displayDeg = this.currentRotate % 360;
                            this.notice.show = `旋转: ${displayDeg}°`;
                        }
                    }
                ],
                plugins: [artplayerPluginDanmuku({
                    danmuku: isLiveContent ? [] : vodDanmuData,
                    speed: 8,
                    opacity: 1,
                    fontSize: 25,
                    color: '#FFFFFF',
                    theme: 'dark',
                    mode: 0,
                    margin: [10, '25%'],
                    antiOverlap: true,
                    useWorker: true,
                    synchronousPlayback: false,
                    emitter: false,
                    heatmap: true,
                    points: []
                })],
                customType: {
                    flv: function (video, url) {
                        if (window.mpegts && window.mpegts.getIsSupported()) {
                            const player = window.mpegts.createPlayer({
                                type: 'flv',
                                url: url,
                                isLive: isLiveContent
                            });
                            player.attachMediaElement(video);
                            player.load();
                            video.mpegts = player;
                        } else video.src = url;
                    },
                    m3u8: function (video, url) {
                        if (window.Hls && window.Hls.isSupported()) {
                            const hls = new window.Hls();
                            hls.loadSource(url);
                            hls.attachMedia(video);
                            video.hls = hls;
                        } else video.src = url;
                    },
                },
            });
            if (chatroomId && isLiveContent) {
                nimInstance = NIM.Chatroom.getInstance({
                    appKey: '632feff1f4c838541ab75195d1ceb3fa',
                    chatroomId: chatroomId,
                    chatroomAddresses: ['chatweblink01.netease.im:443'],
                    isAnonymous: true,
                    chatroomNick: 'guest_' + Math.floor(Math.random() * 10000),
                    onconnect: () => {
                        if (art && art.notice) art.notice.show = '弹幕服务器已连接';
                    },
                    onmsgs: (msgs) => {
                        msgs.forEach(msg => handlePocketMessage(msg, art));
                    }
                });
            }
            art.on('ready', () => {
                const removeInput = () => {
                    document.querySelectorAll('.art-control-danmuku-input, .art-danmuku-input, .art-control-danmuku-send').forEach(el => el.remove());
                };
                removeInput();
                setTimeout(removeInput, 500);
                art.on('timeupdate', (currentTime) => {
                    syncDanmuHighlight(currentTime);
                });
                art.play();
            });
        }

        function initDanmuForDPlayer(chatroomId) {
            nimInstance = NIM.Chatroom.getInstance({
                appKey: '632feff1f4c838541ab75195d1ceb3fa',
                chatroomId: chatroomId,
                chatroomAddresses: ['chatweblink01.netease.im:443'],
                isAnonymous: true,
                chatroomNick: 'guest_' + Math.floor(Math.random() * 10000),
                onconnect: () => {
                    if (dp) dp.notice('弹幕服务器已连接');
                },
                onmsgs: (msgs) => {
                    msgs.forEach(msg => {
                        const custom = JSON.parse(msg.custom || '{}');
                        let text = msg.type === 'text' ? msg.text : (custom.text || "");
                        if (text && dp && dp.danmaku) dp.danmaku.draw({
                            text: text,
                            color: '#fff',
                            type: 'right'
                        });
                    });
                }
            });
        }

        function destroyPlayers() {
            if (typeof stopRoomRadio === 'function') stopRoomRadio(false);
            if (art && art.destroy) {
                if (art.video.mpegts) {
                    art.video.mpegts.destroy();
                    art.video.mpegts = null;
                }
                if (art.video.hls) {
                    art.video.hls.destroy();
                    art.video.hls = null;
                }
                art.destroy(true);
                art = null;
            }
            if (dp) {
                dp.destroy();
                dp = null;
            }
            if (nimInstance) {
                nimInstance.disconnect();
                nimInstance = null;
            }
            const container = document.getElementById('live-player-container');
            if (container) container.innerHTML = '';
        }

        function createCustomAudioPlayer(url, knownDuration = 0) {
            const wrapper = document.createElement('div');
            wrapper.className = 'audio-wrapper';
            wrapper.innerHTML = `<div class="audio-control-icon is-play"><span class="audio-icon-play"></span><span class="audio-icon-pause"><span></span><span></span></span></div><div class="audio-wave-box"><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div></div><span class="audio-duration">语音</span><audio style="display:none" preload="metadata" src="${url}"></audio>`;

            const audio = wrapper.querySelector('audio'),
                icon = wrapper.querySelector('.audio-control-icon'),
                timeDisplay = wrapper.querySelector('.audio-duration');

            if (knownDuration > 0) {
                timeDisplay.innerText = `${Math.floor(knownDuration / 60)}:${Math.floor(knownDuration % 60).toString().padStart(2, '0')}`;
            }

            audio.preload = 'auto';

            audio.onloadedmetadata = () => {
                if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
                timeDisplay.innerText = `${Math.floor(audio.duration / 60)}:${Math.floor(audio.duration % 60).toString().padStart(2, '0')}`;
            };

            audio.onerror = () => {
                wrapper.classList.remove('playing');
                icon.classList.remove('is-pause');
                icon.classList.add('is-play');
                if (!knownDuration) timeDisplay.innerText = '语音';
                if (currentPlayingAudio === audio) currentPlayingAudio = null;
            };

            audio.onpause = () => {
                wrapper.classList.remove('playing');
                icon.classList.remove('is-pause');
                icon.classList.add('is-play');
            };

            audio.onplay = () => {
                wrapper.classList.add('playing');
                icon.classList.remove('is-play');
                icon.classList.add('is-pause');
            };

            wrapper.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (audio.paused) {
                    if (currentPlayingAudio && currentPlayingAudio !== audio) {
                        currentPlayingAudio.pause();
                        currentPlayingAudio.currentTime = 0;
                    }

                    audio.currentTime = 0;
                    try {
                        if (audio.readyState === 0) audio.load();
                        await audio.play();
                        currentPlayingAudio = audio;
                    } catch (error) {
                        console.warn('Private message audio playback failed:', error);
                        showToast('语音播放失败');
                    }
                } else {
                    audio.pause();
                    audio.currentTime = 0;
                }
            };

            audio.onended = () => {
                wrapper.classList.remove('playing');
                icon.classList.remove('is-pause');
                icon.classList.add('is-play');
                if (currentPlayingAudio === audio) currentPlayingAudio = null;
            };

            return wrapper;
        }

        const pendingVideoCoverLoads = [];
        const activeVideoCoverLoads = new Set();
        const MAX_ACTIVE_VIDEO_COVER_LOADS = 2;

        function pumpVideoCoverLoads() {
            while (activeVideoCoverLoads.size < MAX_ACTIVE_VIDEO_COVER_LOADS && pendingVideoCoverLoads.length > 0) {
                const video = pendingVideoCoverLoads.shift();
                if (!video || !video.isConnected || video.dataset.coverReady === '1' || video.dataset.coverLoading === '1') {
                    continue;
                }

                const src = video.dataset.src;
                if (!src) {
                    continue;
                }

                video.dataset.coverLoading = '1';
                activeVideoCoverLoads.add(video);
                video.preload = 'auto';
                video.src = src;
                video.load();
            }
        }

        function releaseVideoCoverLoad(video) {
            if (!video) return;
            activeVideoCoverLoads.delete(video);
            delete video.dataset.coverLoading;
            pumpVideoCoverLoads();
        }

        function queueVideoCoverLoad(video) {
            if (!video || video.dataset.coverReady === '1' || video.dataset.coverLoading === '1') {
                return;
            }

            if (!pendingVideoCoverLoads.includes(video)) {
                pendingVideoCoverLoads.push(video);
            }

            pumpVideoCoverLoads();
        }

        const videoCoverObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    return;
                }

                const video = entry.target;
                queueVideoCoverLoad(video);
                observer.unobserve(video);
            });
        }, { rootMargin: '40px' });

        function createCustomVideoPlayer(url, options = {}) {
            const wrapper = document.createElement('div');
            wrapper.className = 'video-wrapper';
            wrapper.style.display = 'inline-block';
            wrapper.style.verticalAlign = 'top';
            wrapper.style.margin = '8px 0';
            wrapper.style.maxWidth = '100%';
            const preferExternalPlayer = options.preferExternalPlayer === true;

            const uniqueId = 'v-' + Math.random().toString(36).substr(2, 9);
            wrapper.innerHTML = `
                <div class="video-placeholder" id="${uniqueId}" style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 200px;  
                    min-height: 120px; 
                    background: #000;
                    border-radius: 12px;
                    cursor: pointer;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                    border: 1px solid rgba(128,128,128,0.1);
                    transition: transform 0.2s;
                ">
                    <video class="lazy-cover" data-src="${url}#t=0.1" muted playsinline 
                        preload="none" 
                        style="
                            position: absolute;
                            width: 100%;
                            height: 100%;
                            object-fit: contain; 
                            pointer-events: none;
                            z-index: 0;
                            background: #000;
                            transition: opacity 0.16s ease;
                        "
                    ></video>

                    <div class="play-icon-overlay" style="z-index: 1; text-align: center; opacity: 0.9; transition: transform 0.2s, opacity 0.16s ease;">
                        <div style="
                            width: 44px; height: 44px;
                            background: rgba(0,0,0,0.5);
                            backdrop-filter: blur(2px);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border: 1px solid rgba(255,255,255,0.3);
                            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                            color: white;
                        ">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                        </div>
                    </div>
                </div>`;

            const coverVideo = wrapper.querySelector('.lazy-cover');
            if (coverVideo) {
                videoCoverObserver.observe(coverVideo);

                coverVideo.onloadedmetadata = () => {
                    const w = coverVideo.videoWidth;
                    const h = coverVideo.videoHeight;
                    if (w && h) {
                        const placeholder = wrapper.querySelector('.video-placeholder');
                        let finalW = 280;
                        let finalH = (h / w) * finalW;

                        if (finalH > 420) {
                            finalH = 420;
                            finalW = (w / h) * finalH;
                        }

                        placeholder.style.width = finalW + 'px';
                        placeholder.style.height = finalH + 'px';
                        coverVideo.style.objectFit = 'fill';
                    }

                    coverVideo.dataset.coverReady = '1';
                    releaseVideoCoverLoad(coverVideo);
                };

                coverVideo.onerror = () => {
                    releaseVideoCoverLoad(coverVideo);
                };
            }

            const placeholder = wrapper.querySelector('.video-placeholder');
            const playInline = () => {
                if (!placeholder || placeholder.dataset.inlinePlaying === '1') {
                    return;
                }

                if (currentPlayingVideo) currentPlayingVideo.pause();
                if (currentPlayingAudio) {
                    currentPlayingAudio.pause();
                    currentPlayingAudio = null;
                }

                placeholder.dataset.inlinePlaying = '1';
                placeholder.style.pointerEvents = 'none';

                const cover = placeholder.querySelector('.lazy-cover');
                const overlay = placeholder.querySelector('.play-icon-overlay');
                const stagingHost = document.createElement('div');
                stagingHost.style.cssText = 'position: fixed; left: -10000px; top: -10000px; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none;';

                const inlineVideo = document.createElement('video');
                inlineVideo.src = url;
                inlineVideo.controls = true;
                inlineVideo.autoplay = true;
                inlineVideo.playsInline = true;
                inlineVideo.preload = 'auto';
                inlineVideo.style.cssText = `
                    display: block;
                    width: auto;
                    height: auto;
                    max-width: 100%;
                    max-height: 450px;
                    border-radius: 12px;
                    box-shadow: 0 8px 20px rgba(0,0,0,0.3);
                    outline: none;
                    background: black;
                    opacity: 0;
                    transition: opacity 0.16s ease;
                `;

                const cleanupStagingHost = () => {
                    if (stagingHost.parentNode) {
                        stagingHost.parentNode.removeChild(stagingHost);
                    }
                };

                const revealInlineVideo = () => {
                    if (placeholder.dataset.inlinePlaying !== '1') {
                        cleanupStagingHost();
                        return;
                    }

                    if (cover) cover.style.opacity = '0';
                    if (overlay) overlay.style.opacity = '0';

                    cleanupStagingHost();
                    wrapper.innerHTML = '';
                    wrapper.appendChild(inlineVideo);
                    placeholder.style.cursor = 'default';
                    requestAnimationFrame(() => {
                        inlineVideo.style.opacity = '1';
                    });
                };

                inlineVideo.addEventListener('loadeddata', revealInlineVideo, { once: true });
                inlineVideo.addEventListener('canplay', revealInlineVideo, { once: true });

                inlineVideo.onerror = () => {
                    placeholder.dataset.inlinePlaying = '0';
                    placeholder.style.pointerEvents = 'auto';
                    if (cover) cover.style.opacity = '1';
                    if (overlay) overlay.style.opacity = '0.9';
                    cleanupStagingHost();
                    wrapper.innerHTML = `<div style="padding:15px;color:#ff4d4f;background:#fff1f0;border-radius:8px;border:1px dashed #ff4d4f;font-size:12px;">❌ 视频无法加载</div>`;
                };

                inlineVideo.onended = () => {
                    if (currentPlayingVideo === inlineVideo) currentPlayingVideo = null;
                };

                inlineVideo.onplay = () => {
                    if (currentPlayingAudio) currentPlayingAudio.pause();
                    if (currentPlayingVideo && currentPlayingVideo !== inlineVideo) {
                        currentPlayingVideo.pause();
                    }
                    currentPlayingVideo = inlineVideo;
                };

                stagingHost.appendChild(inlineVideo);
                document.body.appendChild(stagingHost);
                const playPromise = inlineVideo.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => { });
                }
                currentPlayingVideo = inlineVideo;
            };

            if (placeholder) {
                placeholder.title = preferExternalPlayer
                    ? `点击调用${getPreferredExternalPlayerName()}播放`
                    : '点击播放视频';
            }

            placeholder.onclick = async (e) => {
                e.stopPropagation();
                if (preferExternalPlayer) {
                    const originalCursor = placeholder.style.cursor;
                    placeholder.style.cursor = 'wait';
                    const opened = await openMediaInExternalPlayer(url, { silent: true });
                    placeholder.style.cursor = originalCursor || 'pointer';
                    if (!opened) {
                        playInline();
                    }
                    return;
                }

                playInline();
            };

            placeholder.onmouseenter = () => {
                placeholder.style.transform = 'translateY(-2px)';
                const icon = placeholder.querySelector('.play-icon-overlay');
                if (icon) icon.style.transform = 'scale(1.1)';
            };
            placeholder.onmouseleave = () => {
                placeholder.style.transform = 'translateY(0)';
                const icon = placeholder.querySelector('.play-icon-overlay');
                if (icon) icon.style.transform = 'scale(1)';
            };

            return wrapper;
        }

        function initTheme() {
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
            updateThemeBtn(savedTheme);
            const savedBg = localStorage.getItem('custom_bg_data');
            if (savedBg) document.body.style.backgroundImage = `url('${savedBg}')`;
        }

        function toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            updateThemeBtn(next);
        }

        function updateThemeBtn(theme) {
            const compactLabel = theme === 'dark' ? '🌙 模式' : '🌞 模式';
            const settingsLabel = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
            document.querySelectorAll('[data-theme-toggle-label]').forEach((btn) => {
                const variant = btn.getAttribute('data-theme-toggle-label');
                btn.textContent = variant === 'settings' ? settingsLabel : compactLabel;
            });
        }
        bgInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    document.body.style.backgroundImage = `url('${ev.target.result}')`;
                    try {
                        localStorage.setItem('custom_bg_data', ev.target.result);
                    } catch (e) { }
                };
                reader.readAsDataURL(file);
            }
        });

        function replaceTencentEmoji(text) {
            if (!text) return text;

            const emojiMap = {
                "[色]": "😍", "[爱心]": "❤️", "[亲亲]": "😚", "[生病]": "😷",
                "[大哭]": "😭", "[微笑]": "🙂", "[酷]": "😎", "[坏笑]": "😏",
                "[惊恐]": "😱", "[愉快]": "😊", "[憨笑]": "😄", "[悠闲]": "😌",
                "[奋斗]": "💪", "[大笑]": "😆", "[疑问]": "❓", "[嘘]": "🤫",
                "[晕]": "😵", "[衰]": "😞", "[骷髅]": "💀", "[敲打]": "🔨",
                "[再见]": "👋", "[擦汗]": "😓", "[抠鼻]": "👃", "[鼓掌]": "👏",
                "[糗大了]": "😳", "[左哼哼]": "😤", "[右哼哼]": "😤", "[哈欠]": "🥱",
                "[鄙视]": "👎", "[委屈]": "🥺", "[快哭了]": "😿", "[阴险]": "😈",
                "[亲亲]": "😘", "[吓]": "😨", "[可怜]": "🥺", "[菜刀]": "🔪",
                "[西瓜]": "🍉", "[啤酒]": "🍺", "[篮球]": "🏀", "[乒乓]": "🏓",
                "[咖啡]": "☕", "[饭]": "🍚", "[猪头]": "🐷", "[玫瑰]": "🌹",
                "[凋谢]": "🥀", "[嘴唇]": "💋", "[爱心]": "❤️", "[心碎]": "💔",
                "[蛋糕]": "🎂", "[闪电]": "⚡", "[炸弹]": "💣", "[刀]": "🔪",
                "[足球]": "⚽", "[瓢虫]": "🐞", "[便便]": "💩", "[月亮]": "🌙",
                "[太阳]": "☀️", "[礼物]": "🎁", "[拥抱]": "🤗", "[强]": "👍",
                "[弱]": "👎", "[握手]": "🤝", "[胜利]": "✌️", "[抱拳]": "🙏",
                "[勾引]": "☝️", "[拳头]": "✊", "[差劲]": "👎", "[爱你]": "🤟",
                "[NO]": "🙅", "[OK]": "👌", "[跳跳]": "💃", "[发抖]": "🥶",
                "[怄火]": "😡", "[转圈]": "💫", "[磕头]": "🙇", "[回头]": "🔙",
                "[跳绳]": "🏃", "[挥手]": "🙋", "[激动]": "🤩", "[街舞]": "🕺",
                "[献吻]": "😽", "[左太极]": "☯️", "[右太极]": "☯️"
            };

            return text.replace(/\[([^\]]+)\]/g, (match, key) => {
                return emojiMap[`[${key}]`] || match;
            });
        }

        function stripAudioReplyPrefixes(text) {
            return String(text || '')
                .replace(/\[(?:语音回复|语音礼物回复)\]\s*回复\s*/g, '')
                .replace(/(^|>|\s)回复\s+(?=[^<\s])/g, '$1')
                .replace(/^\s+|\s+$/g, '');
        }

        function parseHtmlContent(htmlString, fileName, groupName) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');
            const rowElements = doc.querySelectorAll('.Box-row');
            const extracted = [];
            rowElements.forEach(row => {
                const timeEl = row.querySelector('time');
                const timeStr = timeEl ? timeEl.innerText.trim() : '';
                const cleanRow = row.cloneNode(true);
                cleanRow.querySelectorAll('.template-media').forEach(el => el.classList.remove('template-media'));
                cleanRow.querySelectorAll('audio').forEach(el => el.remove());
                if (cleanRow.querySelector('time')) cleanRow.querySelector('time').remove();
                if (cleanRow.querySelector('div.mb-2')) cleanRow.querySelector('div.mb-2').remove();
                let audioUrl = '',
                    videoUrl = '',
                    liveId = null,
                    isLiveText = false,
                    liveTitle = '';
                const idMatch = cleanRow.innerHTML.match(/[?&]id=(\d+)/);
                if (idMatch) {
                    liveId = idMatch[1];
                    cleanRow.querySelectorAll('div, p').forEach(node => {
                        if (node.innerText.includes('直播') && node.innerText.includes('http')) node.remove();
                    });
                }
                row.querySelectorAll('div').forEach(div => {
                    const txt = div.innerText.trim();
                    if (/^(音频|语音)[\s\u00A0]*[-–—][\s\u00A0]*http/i.test(txt)) {
                        const link = div.querySelector('a');
                        if (link) audioUrl = link.href;
                        else {
                            const match = txt.match(/http\S+/);
                            if (match) audioUrl = match[0];
                        }
                    }
                    if (/^(视频)[\s\u00A0]*[-–—][\s\u00A0]*http/i.test(txt)) {
                        const link = div.querySelector('a');
                        if (link) videoUrl = link.href;
                        else {
                            const match = txt.match(/http\S+/);
                            if (match) videoUrl = match[0];
                        }
                    }
                });
                cleanRow.querySelectorAll('div, p').forEach(node => {
                    if (/^(图片|视频|音频|语音)[\s\u00A0]*[-–—][\s\u00A0]*http/i.test(node.innerText.trim())) node.remove();
                });
                const textLiveMatch = cleanRow.innerText.trim().match(/(?:^|\s)直播(?:通知)?[\s\u00A0]*[-–—:：~]\s*([^\r\n]*)/i);
                if (!liveId && textLiveMatch) {
                    isLiveText = true;
                    liveTitle = textLiveMatch[1].trim() || '直播回放';
                    cleanRow.innerHTML = '';
                }

                const giftContainer = cleanRow.querySelector('div[style*="background:#fff0f6"]');
                if (giftContainer) {
                    const nameDiv = giftContainer.querySelector('div[style*="color:#eb2f96"]');
                    const countDiv = giftContainer.querySelector('div[style*="font-size:11px"]');

                    if (nameDiv && countDiv) {
                        if (!countDiv.innerText.includes('🍗')) {
                            const nameMatch = nameDiv.innerText.match(/送出礼物：(.+)/);
                            const numMatch = countDiv.innerText.match(/数量: x(\d+)/);

                            if (nameMatch && numMatch) {
                                const gName = nameMatch[1].trim();
                                const gNum = parseInt(numMatch[1]);

                                if (typeof POCKET_GIFT_DATA !== 'undefined') {
                                    const gift = POCKET_GIFT_DATA.find(x => x.name === gName);
                                    if (gift) {
                                        const total = gift.cost * gNum;
                                        countDiv.innerHTML += ` <span style="margin-left:5px; color:#fa8c16; font-weight:bold;">(${total}🍗)</span>`;
                                    }
                                }
                            }
                        }
                    }
                }

                let avatarHtml = '',
                    nameStr = 'Unknown',
                    userId = null,
                    isMember = false;


                const VIP_IDS = [];

                const originalHeader = row.querySelector('div.mb-2');
                if (originalHeader) {
                    const img = originalHeader.querySelector('img');
                    if (img) avatarHtml = img.outerHTML;

                    const span = originalHeader.querySelector('span');
                    if (span) {
                        nameStr = span.innerText;
                        userId = span.getAttribute('data-userid');
                        const roleId = span.getAttribute('data-roleid');


                        if (roleId && parseInt(roleId) > 1) {
                            isMember = true;
                        }


                        const style = span.getAttribute('style') || '';
                        if (style.includes('#ff4d4f') || style.includes('bold') || style.includes('font-weight:700')) {
                            isMember = true;
                        }


                        if (userId && VIP_IDS.includes(String(userId))) {
                            isMember = true;
                        }


                    }
                }

                let rowHtml = cleanRow.innerHTML;
                const isFlip = rowHtml.includes('翻牌问题：') && rowHtml.includes('回答：');
                if (isFlip) {
                    rowHtml = rowHtml.replace(/翻牌问题：/g, '<span class="flip-label question-tag">翻牌提问</span>');
                    rowHtml = rowHtml.replace(/回答：/g, '<br><span class="flip-label answer-tag">成员回答</span>');
                    if (cleanRow.querySelector('blockquote')) cleanRow.querySelector('blockquote').classList.add('flip-message-quote');
                }

                rowHtml = stripAudioReplyPrefixes(rowHtml);
                cleanRow.innerHTML = rowHtml;
                let year = '',
                    month = '',
                    day = '',
                    dateFull = '';
                if (timeStr) {
                    const datePart = timeStr.split(' ')[0];
                    dateFull = datePart;
                    const parts = datePart.split('-');
                    if (parts.length === 3) {
                        year = parts[0];
                        month = parseInt(parts[1]).toString();
                        day = parseInt(parts[2]).toString();
                    }
                }
                extracted.push({
                    avatarHtml,
                    nameStr,
                    contentHtml: cleanRow.innerHTML,
                    text: stripAudioReplyPrefixes(cleanRow.innerText).toLowerCase(),
                    timeStr,
                    userId,
                    year,
                    month,
                    day,
                    dateFull,
                    hasImg: !!row.querySelector('img.template-media'),
                    hasVideo: row.innerText.includes('视频') && (row.innerText.includes('http') || !!cleanRow.querySelector('video')),
                    hasAudio: !!audioUrl || row.innerText.includes('音频'),
                    audioUrl,
                    videoUrl,
                    isReply: isFlip,
                    groupName,
                    liveId,
                    isLiveText,
                    liveTitle
                });
            });
            return extracted;
        }

        function scheduleNextBatch() {
            if (batchRenderScheduled || isRenderingBatch) return;
            batchRenderScheduled = true;
            window.requestAnimationFrame(() => {
                batchRenderScheduled = false;
                renderNextBatch();
            });
        }

        function renderNextBatch() {
            if (isRenderingBatch) return;
            if (renderedCount >= currentFilteredPosts.length) {
                loadingMoreDiv.style.display = 'none';
                return;
            }

            isRenderingBatch = true;
            loadingMoreDiv.style.display = 'block';
            const nextBatch = currentFilteredPosts.slice(renderedCount, renderedCount + getBatchSize());
            const fragment = document.createDocumentFragment();
            nextBatch.forEach(post => {
                const div = document.createElement('div');
                div.className = 'Box-row';
                div.style.position = 'relative';
                div.style.contentVisibility = 'auto';
                div.style.containIntrinsicSize = '280px';
                if (post.userId && String(post.userId) !== 'undefined') {
                    const idTag = document.createElement('div');
                    idTag.innerHTML = `${post.userId}`;

                    idTag.style.cssText = `
                        position: absolute;
                        top: 14px;
                        right: 15px;
                        background: var(--chip-bg);
                        border: 1px solid var(--border);
                        color: var(--text-sub);
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-size: 11px;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                        z-index: 5;
                        display: flex;
                        align-items: center;
                        cursor: pointer; 
                        user-select: none; 
                        transition: all 0.2s ease;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.02);
                    `;

                    idTag.onclick = (e) => window.filterByUserId(post.userId);
                    idTag.title = "点击筛选此人的所有消息";

                    idTag.onmouseenter = () => {
                        idTag.style.borderColor = 'var(--primary)';
                        idTag.style.color = 'var(--primary)';
                        idTag.style.transform = 'translateY(-1px)';
                        idTag.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
                    };
                    idTag.onmouseleave = () => {
                        idTag.style.borderColor = 'var(--border)';
                        idTag.style.color = 'var(--text-sub)';
                        idTag.style.transform = 'none';
                        idTag.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)';
                    };

                    div.appendChild(idTag);
                }
                const header = document.createElement('div');
                header.className = 'user-header-row';


                const isMemberPost =
                    post.isMember ||
                    (post.nameStr === post.groupName) ||
                    post.isReply ||
                    (typeof memberNameMap !== 'undefined' && memberNameMap.has(post.nameStr)) ||
                    (typeof memberIdSet !== 'undefined' && post.userId && memberIdSet.has(String(post.userId)));


                let nameStyle = '';
                if (String(post.userId) === '121569667') {
                    nameStyle = 'color: #056de8; font-weight: bold;';
                } else {
                    nameStyle = isMemberPost ? 'color: #FB7299; font-weight: bold;' : 'color: var(--text); opacity: 0.9;';
                }

                header.innerHTML = `
                    ${post.avatarHtml}
                    <div class="user-info-col">
                        <div>
                            <span class="username" style="${nameStyle}">${post.nameStr}</span>
                        </div>
                        <span class="timestamp">${post.timeStr}</span>
                    </div>
                `;
                const content = document.createElement('div');
                content.innerHTML = replaceTencentEmoji(post.contentHtml);
                content.querySelectorAll('img').forEach(img => {
                    img.loading = 'lazy';
                    img.decoding = 'async';
                });
                try {
                    const audioRegex = /(?:音频[\s\u00A0]*[-–—][\s\u00A0]*)?(https?:\/\/[^\s<"']+\.(?:mp3|aac|m4a))/gi;
                    if (audioRegex.test(content.innerHTML)) content.innerHTML = content.innerHTML.replace(audioRegex, '<span class="temp-audio-placeholder" data-src="$1"></span>');
                    content.querySelectorAll('a, .temp-audio-placeholder').forEach(el => {
                        let src = el.tagName === 'SPAN' ? el.getAttribute('data-src') : (/\.(mp3|aac|m4a)$/i.test(el.href) ? el.href : '');
                        if (src) {
                            const player = createCustomAudioPlayer(src);
                            player.style.display = 'inline-flex';
                            player.style.margin = '4px 0';
                            if (el.tagName === 'A') el.parentNode.replaceChild(player, el);
                            else {
                                const parent = el.closest('a');
                                if (parent) parent.parentNode.replaceChild(player, parent);
                                else el.parentNode.replaceChild(player, el);
                            }
                        }
                    });
                } catch (e) { }
                content.classList.add('message-content-clickable');
                content.onclick = (e) => {
                    if (e.target.tagName === 'IMG' && !e.target.classList.contains('avatar')) {
                        openImageModal(e.target.src);
                        return;
                    }
                    if (e.target.tagName === 'VIDEO' || e.target.closest('.audio-wrapper') || e.target.closest('.video-wrapper') || e.target.closest('.vod-card-row') || e.target.tagName === 'BUTTON') return;
                    openContextModal(post.originalIndex);
                };
                let hasVideoTag = false;
                content.querySelectorAll('video').forEach(rawVideo => {
                    const src = rawVideo.src || rawVideo.querySelector('source')?.src;
                    if (src) {
                        rawVideo.parentNode.replaceChild(createCustomVideoPlayer(src), rawVideo);
                        hasVideoTag = true;
                    }
                });
                if (post.videoUrl && !hasVideoTag) content.appendChild(createCustomVideoPlayer(post.videoUrl));
                if (post.liveId) {
                    const card = document.createElement('div');
                    card.className = 'vod-card-row';
                    card.style.cssText = 'margin-top: 10px; width: 100%; box-sizing: border-box; background: var(--input-bg); cursor: pointer;';

                    let displayTitle = post.liveTitle;
                    let coverSrc = '';
                    let displayName = post.nameStr;

                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = post.contentHtml;
                    const link = tempDiv.querySelector('a');

                    if (link) {
                        displayTitle = link.getAttribute('data-title') || link.innerText.trim();
                        coverSrc = link.getAttribute('data-cover') || '';

                        const memberOverride = link.getAttribute('data-member');
                        if (memberOverride) {
                            displayName = memberOverride;
                        }
                    } else {
                        displayTitle = tempDiv.innerText.trim();
                    }

                    if (!coverSrc && post.avatarHtml) {
                        const srcMatch = post.avatarHtml.match(/src=['"]([^'"]+)['"]/);
                        if (srcMatch) coverSrc = srcMatch[1];
                    }
                    if (!coverSrc) coverSrc = './icon.png';
                    displayTitle = displayTitle || '直播回放';

                    card.innerHTML = `
                        <div class="vod-row-cover-container">
                            <img src="${coverSrc}" class="vod-row-cover">
                            <div class="vod-badge badge-replay">回放</div>
                        </div>
                        <div class="vod-row-info">
                            <div class="vod-row-name">${displayName}</div>
                            <div class="vod-row-title">${displayTitle}</div>
                            <div class="vod-row-time">${post.timeStr}</div>
                        </div>
                    `;
                    card.onclick = (e) => {
                        e.stopPropagation();
                        playArchiveFromMessage(post.liveId, displayName, post.timeStr, displayTitle);
                    };

                    content.appendChild(card);
                } else if (post.isLiveText) {
                    const card = document.createElement('div');
                    card.className = 'vod-card-row';
                    card.style.cssText = 'margin-top: 10px; width: 100%; box-sizing: border-box;';
                    let coverSrc = './icon.png';
                    if (post.avatarHtml) {
                        const srcMatch = post.avatarHtml.match(/src=['"]([^'"]+)['"]/);
                        if (srcMatch) coverSrc = srcMatch[1];
                    }
                    card.innerHTML = `<div class="vod-row-cover-container" style="width:100px; height:56px;"><img src="${coverSrc}" style="width:100%; height:100%; object-fit: cover; border-radius: 6px;"><div class="vod-badge badge-replay">回放</div></div><div class="vod-row-info" style="height:56px;"><div class="vod-row-name">${post.nameStr}</div><div class="vod-row-title" style="font-size:13px;">${post.liveTitle || '直播记录'}</div><div class="vod-row-time" style="font-size:11px;">${post.timeStr}</div></div>`;
                    card.onclick = (e) => {
                        e.stopPropagation();
                        matchReplayByTime(post.nameStr, post.timeStr);
                    };
                    content.appendChild(card);
                }
                if (post.audioUrl) insertAudioPlayerIntoMessage(content, post.audioUrl);
                div.appendChild(header);
                div.appendChild(content);
                fragment.appendChild(div);
            });
            outputList.appendChild(fragment);
            renderedCount += nextBatch.length;
            isRenderingBatch = false;
            if (isMessageViewVisible() && scrollContainer.scrollHeight <= scrollContainer.clientHeight && renderedCount < currentFilteredPosts.length) {
                scheduleNextBatch();
            }
            updateStatus();
        }

        function initDateSelectors() {
            allPosts.forEach(post => {
                if (post.year) availableYears.add(post.year);
            });

            const yearList = document.getElementById('year-dropdown');
            let html = `<div class="suggestion-item" onclick="selectDateItem('year', 'all', '全部')">全部</div>`;

            Array.from(availableYears).sort().reverse().forEach(y => {
                html += `<div class="suggestion-item" onclick="selectDateItem('year', '${y}', '${y}年')">${y}年</div>`;
            });
            yearList.innerHTML = html;

            resetMonthSelect();
            resetDaySelect();
        }

        function populateMonths(year) {
            const monthList = document.getElementById('month-dropdown');
            let html = `<div class="suggestion-item" onclick="selectDateItem('month', 'all', '全年')">全年</div>`;

            const months = new Set();
            allPosts.forEach(p => {
                if (p.year == year) months.add(p.month);
            });

            Array.from(months).sort((a, b) => a - b).forEach(m => {
                html += `<div class="suggestion-item" onclick="selectDateItem('month', '${m}', '${m}月')">${m}月</div>`;
            });
            monthList.innerHTML = html;

            resetDaySelect();
        }

        function populateDays(year, month) {
            const dayList = document.getElementById('day-dropdown');
            let html = `<div class="suggestion-item" onclick="selectDateItem('day', 'all', '全月')">全月</div>`;

            const days = new Set();
            allPosts.forEach(p => {
                if (p.year == year && p.month == month) days.add(p.day);
            });

            Array.from(days).sort((a, b) => a - b).forEach(d => {
                html += `<div class="suggestion-item" onclick="selectDateItem('day', '${d}', '${d}日')">${d}日</div>`;
            });
            dayList.innerHTML = html;
        }

        function resetMonthSelect() {
            document.getElementById('monthSelect').value = 'all';
            document.getElementById('monthSelectDisplay').value = '全年';
            document.getElementById('monthSelectDisplay').disabled = true;
            document.getElementById('month-dropdown').style.display = 'none';
        }

        function resetDaySelect() {
            document.getElementById('daySelect').value = 'all';
            document.getElementById('daySelectDisplay').value = '全月';
            document.getElementById('daySelectDisplay').disabled = true;
            document.getElementById('day-dropdown').style.display = 'none';
        }

        function resetDateFilter() {
            selectDateItem('year', 'all', '全部');
            const view = document.getElementById('view-messages');
            if (view) {
                view.scrollTop = 0;
            }
        }

        function handleDateChange(level) {
            const yearVal = document.getElementById('yearSelect').value;
            const monthVal = document.getElementById('monthSelect').value;

            if (level === 'year') {
                if (yearVal === 'all') {
                    resetMonthSelect();
                    resetDaySelect();
                } else {
                    populateMonths(yearVal);
                    document.getElementById('monthSelectDisplay').disabled = false;
                }
            } else if (level === 'month') {
                if (monthVal === 'all') {
                    resetDaySelect();
                } else {
                    populateDays(yearVal, monthVal);
                    document.getElementById('daySelectDisplay').disabled = false;
                }
            }
            applyFilters();
            const view = document.getElementById('view-messages');
            if (view) {
                view.scrollTop = 0;
            }
        }

        function toggleDateDropdown(type) {
            const displayEl = document.getElementById(`${type}SelectDisplay`);
            if (displayEl && displayEl.disabled) return;

            const list = document.getElementById(`${type}-dropdown`);
            ['year', 'month', 'day'].forEach(t => {
                if (t !== type) {
                    const other = document.getElementById(`${t}-dropdown`);
                    if (other) other.style.display = 'none';
                }
            });

            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        }

        function selectDateItem(type, value, text) {
            document.getElementById(`${type}Select`).value = value;
            document.getElementById(`${type}SelectDisplay`).value = text;
            document.getElementById(`${type}-dropdown`).style.display = 'none';
            handleDateChange(type);
        }

        function setFilter(type) {
            filterType = type;

            document.querySelectorAll('.filter-chip').forEach(el => el.classList.remove('active'));
            document.getElementById(`filter-${type}`).classList.add('active');

            requestAnimationFrame(() => {
                setTimeout(() => {
                    applyFilters();

                    const view = document.getElementById('view-messages');
                    if (view) view.scrollTop = 0;
                }, 10);
            });
        }

        function showMemberDropdown() {
            const list = document.getElementById('memberDropdownList');
            const input = document.getElementById('groupInput');
            list.style.display = 'block';
            const keyword = (input.value === '全部成员') ? '' : input.value;
            renderMemberDropdown(keyword);
        }

        function renderMemberDropdown(keyword) {
            const list = document.getElementById('memberDropdownList');
            const term = keyword.trim().toLowerCase();

            let html = `<div class="suggestion-item" onclick="selectMemberFilter('all')"><span style="font-weight:bold">全部成员</span></div>`;

            let matchCount = 0;
            allMemberOptions.forEach(name => {
                if (term === '' || name.toLowerCase().includes(term)) {
                    const team = memberTeamMap.get(name) || '';

                    let isInactive = false;
                    if (typeof memberData !== 'undefined') {
                        const mObj = memberData.find(m => m.ownerName === name);
                        if (mObj && mObj.isInGroup === false) isInactive = true;
                    }

                    const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';

                    let colorStyle = '';
                    if (typeof getTeamStyle === 'function') {
                        colorStyle = getTeamStyle(team, isInactive);
                    }

                    const teamHtml = team ? `<span class="team-tag" style="${baseStyle} ${colorStyle}">${team}</span>` : '';

                    html += `<div class="suggestion-item" 
                         onclick="selectMemberFilter('${name}')"
                         style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight:bold; ${baseStyle}">${name}</span>
                        ${teamHtml}
                     </div>`;
                    matchCount++;
                }
            });

            if (matchCount === 0 && term !== '') {
                html += `<div class="suggestion-item" style="cursor:default; color:var(--text-sub);">无匹配成员</div>`;
            }

            list.innerHTML = html;
        }

        function selectMemberFilter(value) {
            const input = document.getElementById('groupInput');
            const list = document.getElementById('memberDropdownList');

            if (value === 'all') {
                input.value = '全部成员';
            } else {
                input.value = value;
            }

            list.style.display = 'none';
            applyFilters();
        }

        document.addEventListener('click', function (e) {
            const container = document.getElementById('sb-members');
            const list = document.getElementById('memberDropdownList');
            if (list.style.display === 'block' && !container.contains(e.target)) {
                list.style.display = 'none';

                const input = document.getElementById('groupInput');
                const val = input.value;
                if (val !== '全部成员' && !allMemberOptions.includes(val)) {
                }
            }
        });

        function applyFilters() {
            const contentInput = document.getElementById('search-content-input');
            const userInput = document.getElementById('search-user-input');

            const contentKw = contentInput ? contentInput.value.trim().toLowerCase() : '';
            const userKw = userInput ? userInput.value.trim().toLowerCase() : '';

            const sortType = currentSortOrder;
            const groupInputVal = document.getElementById('groupInput').value;
            const selGroup = (groupInputVal === '全部成员' || groupInputVal === '') ? 'all' : groupInputVal;
            const selYear = yearSelect.value;
            const selMonth = monthSelect.value;
            const selDay = daySelect.value;

            currentFilteredPosts = allPosts.filter(post => {
                if (selGroup !== 'all' && post.groupName !== selGroup) return false;

                if (contentKw) {
                    const text = (post.text || '').toLowerCase();
                    const title = (post.liveTitle || '').toLowerCase();

                    if (contentKw.includes('|')) {
                        try {
                            const regex = new RegExp(contentKw, 'i');

                            const matchText = regex.test(text);
                            const matchTitle = regex.test(title);
                            const matchHtml = regex.test(post.contentHtml);

                            if (!matchText && !matchTitle && !matchHtml) return false;
                        } catch (e) {
                            if (!text.includes(contentKw) && !title.includes(contentKw)) return false;
                        }
                    } else {
                        if (!text.includes(contentKw) && !title.includes(contentKw)) return false;
                    }
                }

                if (userKw) {
                    const name = (post.nameStr || '').toLowerCase();
                    const uid = String(post.userId || '');

                    if (!name.includes(userKw) && uid !== userKw) return false;
                }

                let matchType = true;
                if (filterType === 'image') matchType = post.hasImg;
                else if (filterType === 'video') matchType = post.hasVideo;
                else if (filterType === 'audio') matchType = post.hasAudio;
                else if (filterType === 'reply') matchType = post.isReply;
                else if (filterType === 'live-record') matchType = (post.liveId || post.isLiveText);
                else if (filterType === 'text') matchType = !post.hasImg && !post.hasVideo && !post.hasAudio && !post.liveId && !post.isLiveText && !post.isReply;

                if (!matchType) return false;

                if (selYear !== 'all') {
                    if (post.year != selYear) return false;
                    if (selMonth !== 'all') {
                        if (post.month != selMonth) return false;
                        if (selDay !== 'all' && post.day != selDay) return false;
                    }
                }
                return true;
            });

            currentFilteredPosts.sort((a, b) => {
                const tA = new Date(a.timeStr).getTime() || 0,
                    tB = new Date(b.timeStr).getTime() || 0;
                return sortType === 'desc' ? tB - tA : tA - tB;
            });

            outputList.innerHTML = '';
            renderedCount = 0;
            isRenderingBatch = false;
            batchRenderScheduled = false;
            if (isMessageViewVisible()) {
                scheduleNextBatch();
            }
            updateStatus();
        }

        function updateStatus() {
            const names = {
                'all': '全部',
                'text': '文字',
                'image': '图片',
                'video': '视频',
                'audio': '语音',
                'reply': '翻牌',
                'live-record': '直播'
            };
            statusMsg.textContent = `[${names[filterType]}] 找到 ${currentFilteredPosts.length} 条`;
        }
        scrollContainer.addEventListener('scroll', () => {
            if (scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 300) scheduleNextBatch();
        });

        function openUserAnalysis() {
            const modal = document.getElementById('userModal');
            const container = document.getElementById('userListContainer');

            if (modal) modal.style.display = 'flex';
            if (container) {
                container.innerHTML = '<div class="empty-state">正在分析互动数据...</div>';
                container.scrollTop = 0;
            }

            setTimeout(() => {
                performUserAnalysis();
            }, 50);
        }

        function closeUserAnalysis() {
            const modal = document.getElementById('userModal');
            if (modal) modal.style.display = 'none';
        }

        function performUserAnalysis() {
            const container = document.getElementById('userListContainer');
            if (!container) return;

            const nameToId = {};
            const idToLatest = {};

            if (typeof allPosts !== 'undefined') {
                allPosts.forEach(post => {
                    if (!post.userId) return;

                    const time = new Date(post.timeStr).getTime();

                    if (post.nameStr) {
                        nameToId[post.nameStr] = post.userId;
                    }

                    if (!idToLatest[post.userId] || time > idToLatest[post.userId].time) {
                        idToLatest[post.userId] = {
                            name: post.nameStr,
                            avatar: post.avatarHtml,
                            time: time
                        };
                    }
                });
            }

            const groupInput = document.getElementById('groupInput');
            let selGroup = groupInput ? groupInput.value : 'all';
            if (selGroup === '全部成员' || !selGroup) selGroup = 'all';

            const sourceData = (typeof allPosts !== 'undefined')
                ? (selGroup === 'all' ? allPosts : allPosts.filter(p => p.groupName === selGroup))
                : [];

            const modalTitle = document.querySelector('#userModal .modal-title');
            if (modalTitle) modalTitle.innerText = selGroup === 'all' ? '房间消息互动榜 (全部)' : `房间消息互动榜 (${selGroup})`;

            const statsMap = {};
            let totalInteractions = 0;

            sourceData.forEach(post => {
                const match = post.contentHtml.match(/<blockquote[^>]*>\s*(.*?)[：:]/i);
                if (match && match[1]) {
                    let rawName = match[1].replace(/<[^>]+>/g, '').trim();
                    if (rawName) {
                        let uid = rawName;
                        let realId = null;

                        if (nameToId[rawName]) {
                            uid = nameToId[rawName];
                            realId = uid;
                        }

                        let displayName = rawName;
                        let displayAvatar = '';

                        if (realId && idToLatest[realId]) {
                            displayName = idToLatest[realId].name;
                            displayAvatar = idToLatest[realId].avatar;
                        }

                        if (!statsMap[uid]) {
                            statsMap[uid] = {
                                id: uid,
                                realId: realId,
                                name: displayName,
                                count: 0,
                                avatar: displayAvatar,
                                aliases: new Set()
                            };
                        }

                        statsMap[uid].aliases.add(rawName);
                        if (displayName) statsMap[uid].aliases.add(displayName);

                        if (!statsMap[uid].avatar && displayAvatar) {
                            statsMap[uid].avatar = displayAvatar;
                        }

                        statsMap[uid].count++;
                        totalInteractions++;
                    }
                }
            });

            const sortedList = Object.values(statsMap).sort((a, b) => b.count - a.count);

            if (sortedList.length === 0) {
                container.innerHTML = '<div class="empty-state">暂无互动数据</div>';
                return;
            }

            let html = `
                <div style="padding: 15px; background: rgba(114, 46, 209, 0.1); border-bottom: 1px solid #d3adf7; margin-bottom: 10px; border-radius: 4px;">
                    <div style="font-weight: bold; color: #722ed1; font-size: 14px; text-align: center;">
                        互动总数: <span style="font-size: 18px;">${totalInteractions}</span> 次
                    </div>
                </div>
            `;

            sortedList.forEach((user, index) => {
                const rClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : ''));

                let avatarSrc = './icon.png';
                if (user.avatar) {
                    const srcMatch = user.avatar.match(/src=['"]([^'"]+)['"]/);
                    if (srcMatch) avatarSrc = srcMatch[1];
                }

                const aliasArray = Array.from(user.aliases).map(n => n.replace(/'/g, "\\'"));
                const clickAction = `showInteractions(['${aliasArray.join("','")}'])`;

                html += `
                <div class="list-item" onclick="${clickAction}" style="cursor: pointer; align-items: center; padding: 10px 8px;">
                    <div class="rank-num ${rClass}">${index + 1}</div>
                    
                    <div style="margin-right: 12px;">
                        <img src="${avatarSrc}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                    </div>
                    
                    <div class="item-main" style="display: flex; flex-direction: column; justify-content: center; flex: 1; min-width: 0;">
                        <span class="item-title" style="font-size: 14px; line-height: 1.4; margin-bottom: 2px;">
                            ${user.name}
                            ${user.realId ? `<span style="font-size:10px; color:#aaa; font-weight:normal;">(ID:${user.realId})</span>` : ''}
                        </span>
                    </div>
                    
                    <div class="item-count" style="color: #722ed1; font-size: 13px; font-weight:bold;">${user.count} 次</div>
                </div>`;
            });

            container.innerHTML = html;
        }

        function showInteractions(names) {
            closeUserAnalysis();

            const contentInput = document.getElementById('search-content-input');
            const userInput = document.getElementById('search-user-input');

            if (userInput) userInput.value = '';

            if (contentInput) {
                if (Array.isArray(names)) {
                    const escapedNames = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                    contentInput.value = escapedNames.join('|');
                } else {
                    contentInput.value = names;
                }

                contentInput.dispatchEvent(new Event('input'));
            }
        }

        function openDateAnalysis() {
            const modal = document.getElementById('dateModal');
            const container = document.getElementById('dateListContainer');

            if (modal) modal.style.display = 'flex';
            if (container) container.innerHTML = '<div class="empty-state">正在分析数据...</div>';

            setTimeout(() => {
                performDateAnalysis();
                renderDateList();
            }, 100);
        }

        function closeDateAnalysis() {
            const modal = document.getElementById('dateModal');
            if (modal) modal.style.display = 'none';
        }

        function performDateAnalysis() {
            const counts = {};

            const groupInput = document.getElementById('groupInput');
            let selGroup = groupInput ? groupInput.value : 'all';
            if (selGroup === '全部成员' || !selGroup) selGroup = 'all';

            const sourceData = selGroup === 'all' ? allPosts : allPosts.filter(p => p.groupName === selGroup);
            const modalTitle = document.querySelector('#dateModal .modal-title');
            if (modalTitle) modalTitle.innerText = selGroup === 'all' ? '每日消息统计 (全部)' : `每日消息统计 (${selGroup})`;

            sourceData.forEach(post => {
                if (post.dateFull) {
                    if (!counts[post.dateFull]) {
                        counts[post.dateFull] = { total: 0, member: 0 };
                    }

                    counts[post.dateFull].total++;

                    const isMemberPost =
                        post.isMember ||
                        (post.nameStr === post.groupName) ||
                        post.isReply ||
                        (typeof memberNameMap !== 'undefined' && memberNameMap.has(post.nameStr)) ||
                        (typeof memberIdSet !== 'undefined' && post.userId && memberIdSet.has(String(post.userId)));

                    if (isMemberPost) {
                        counts[post.dateFull].member++;
                    }
                }
            });

            dateStats = Object.entries(counts).map(([date, val]) => ({
                date,
                count: val.total,
                memberCount: val.member
            })).sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        function renderDateList() {
            const container = document.getElementById('dateListContainer');
            if (!container) return;

            if (dateStats.length === 0) {
                container.innerHTML = '<div class="empty-state">暂无日期数据</div>';
                return;
            }
            const max = Math.max(...dateStats.map(d => d.count));

            let html = '';
            dateStats.forEach((item) => {
                const totalPct = (item.count / max) * 100;
                const memberPct = (item.memberCount / max) * 100;

                html += `
                <div class="list-item" onclick="filterByDate('${item.date}')">
                    <div class="item-main">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                            <span class="item-title">${item.date}</span>
                            <span style="font-size:11px; color:var(--text-sub);">
                                <span style="color:#FB7299; font-weight:bold;">成员: ${item.memberCount}</span> 
                                <span style="opacity:0.3; margin:0 4px;">|</span> 
                                总: ${item.count}
                            </span>
                        </div>
                        
                        <div class="stat-bar-container" style="position:relative; background:var(--bar-bg); height:6px; border-radius:3px; overflow:hidden;">
                            <div class="stat-bar" style="width: ${totalPct}%; background:var(--text-sub); opacity:0.25; position:absolute; top:0; left:0; height:100%;"></div>
                            <div class="stat-bar" style="width: ${memberPct}%; background:#FB7299; position:absolute; top:0; left:0; height:100%; z-index:2;"></div>
                        </div>
                    </div>
                </div>`;
            });
            container.innerHTML = html;
        }

        function filterByUser(username) {
            if (typeof closeUserAnalysis === 'function') closeUserAnalysis();

            const userInput = document.getElementById('search-user-input');
            const contentInput = document.getElementById('search-content-input');

            if (userInput) {
                userInput.value = username;
                if (contentInput) contentInput.value = '';

                if (typeof setFilter === 'function') setFilter('all');
                if (typeof selectDateItem === 'function') selectDateItem('year', 'all', '全部');

                if (typeof applyFilters === 'function') applyFilters();
            }
        }

        window.filterByUserId = function (userId) {
            if (window.event) window.event.stopPropagation();

            const userInput = document.getElementById('search-user-input');
            const contentInput = document.getElementById('search-content-input');

            if (userInput) {
                userInput.value = String(userId).trim();

                if (contentInput) contentInput.value = '';

                if (typeof setFilter === 'function') setFilter('all');
                if (typeof selectDateItem === 'function') selectDateItem('year', 'all', '全部');

                if (typeof applyFilters === 'function') {
                    applyFilters();
                }

                const view = document.getElementById('view-messages');
                if (view) view.scrollTop = 0;

                console.log(`[交互] 已点击 ID Tag: ${userId}，正在筛选...`);
            }
        };

        function filterByDate(dateStr) {
            closeDateAnalysis();
            const [y, m, d] = dateStr.split('-');

            const yearSelect = document.getElementById('yearSelect');
            const monthSelect = document.getElementById('monthSelect');
            const daySelect = document.getElementById('daySelect');

            if (yearSelect) {
                yearSelect.value = y;
                if (typeof populateMonths === 'function') populateMonths(y);
            }
            if (monthSelect) {
                monthSelect.value = parseInt(m).toString();
                if (typeof populateDays === 'function') populateDays(y, parseInt(m).toString());
                monthSelect.disabled = false;
            }
            if (daySelect) {
                daySelect.value = parseInt(d).toString();
                daySelect.disabled = false;
            }
            if (typeof applyFilters === 'function') applyFilters();
        }


        function openContextModal(targetGlobalIndex) {
            contextListContainer.innerHTML = '';
            const targetPost = allPosts[targetGlobalIndex];
            if (!targetPost) return;
            const groupPosts = allPosts.filter(p => p.groupName === targetPost.groupName),
                indexInGroup = groupPosts.indexOf(targetPost);
            const contextPosts = groupPosts.slice(Math.max(0, indexInGroup - 10), Math.min(groupPosts.length, indexInGroup + 11));
            contextPosts.forEach(post => {
                const div = document.createElement('div');
                div.className = 'Box-row';
                div.style.marginBottom = '10px';
                if (post === targetPost) {
                    div.classList.add('context-highlight');
                    div.id = 'target-message-scroll-anchor';
                }
                const header = document.createElement('div');
                header.className = 'user-header-row';
                header.innerHTML = `${post.avatarHtml}<div class="user-info-col"><div><span class="username">${post.nameStr}</span></div><span class="timestamp">${post.timeStr}</span></div>`;
                const content = document.createElement('div');
                content.innerHTML = replaceTencentEmoji(post.contentHtml);
                try {
                    const audioRegex = /(?:音频[\s\u00A0]*[-–—][\s\u00A0]*)?(https?:\/\/[^\s<"']+\.(?:mp3|aac|m4a))/gi;
                    if (audioRegex.test(content.innerHTML)) content.innerHTML = content.innerHTML.replace(audioRegex, '<span class="temp-audio-placeholder" data-src="$1"></span>');
                    content.querySelectorAll('a, .temp-audio-placeholder').forEach(el => {
                        let src = el.tagName === 'SPAN' ? el.getAttribute('data-src') : (/\.(mp3|aac|m4a)$/i.test(el.href) ? el.href : '');
                        if (src) {
                            const player = createCustomAudioPlayer(src);
                            player.style.display = 'inline-flex';
                            player.style.margin = '4px 0';
                            if (el.tagName === 'A') el.parentNode.replaceChild(player, el);
                            else {
                                const parent = el.closest('a');
                                if (parent) parent.parentNode.replaceChild(player, parent);
                                else el.parentNode.replaceChild(player, el);
                            }
                        }
                    });
                } catch (e) { }
                let hasVTag = false;
                content.querySelectorAll('video').forEach(rawV => {
                    const src = rawV.src || rawV.querySelector('source')?.src;
                    if (src) {
                        rawV.parentNode.replaceChild(createCustomVideoPlayer(src), rawV);
                        hasVTag = true;
                    }
                });
                if (post.videoUrl && !hasVTag) content.appendChild(createCustomVideoPlayer(post.videoUrl));
                if (post.liveId) {
                    const card = document.createElement('div');
                    card.className = 'vod-card-row';
                    card.style.cssText = 'margin-top: 10px; width: 100%; box-sizing: border-box; background: var(--input-bg); cursor: pointer; border: 1px solid var(--border);';

                    let displayTitle = post.liveTitle;
                    let coverSrc = '';
                    let displayName = post.nameStr;

                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = post.contentHtml;
                    const link = tempDiv.querySelector('a');

                    if (link) {
                        displayTitle = link.getAttribute('data-title') || link.innerText.trim();
                        coverSrc = link.getAttribute('data-cover') || '';

                        const memberOverride = link.getAttribute('data-member');
                        if (memberOverride) {
                            displayName = memberOverride;
                        }
                    } else {
                        displayTitle = tempDiv.innerText.trim();
                    }

                    if (!coverSrc && post.avatarHtml) {
                        const srcMatch = post.avatarHtml.match(/src=['"]([^'"]+)['"]/);
                        if (srcMatch) coverSrc = srcMatch[1];
                    }
                    if (!coverSrc) coverSrc = './icon.png';
                    displayTitle = displayTitle || '直播回放';

                    card.innerHTML = `
                        <div class="vod-row-cover-container">
                            <img src="${coverSrc}" class="vod-row-cover">
                            <div class="vod-badge badge-replay">回放</div>
                        </div>
                        <div class="vod-row-info">
                            <div class="vod-row-name">${displayName}</div>
                            <div class="vod-row-title">${displayTitle}</div>
                            <div class="vod-row-time">${post.timeStr}</div>
                        </div>
                    `;

                    card.onclick = (e) => {
                        e.stopPropagation();
                        playArchiveFromMessage(post.liveId, displayName, post.timeStr, displayTitle);
                    };

                    content.appendChild(card);

                } else if (post.isLiveText) {
                    const card = document.createElement('div');
                    card.className = 'vod-card-row';
                    card.style.cssText = 'margin-top: 10px; width: 100%; box-sizing: border-box; background: var(--input-bg);';
                    let cSrc = './icon.png';
                    if (post.avatarHtml) {
                        const sMatch = post.avatarHtml.match(/src=['"]([^'"]+)['"]/);
                        if (sMatch) cSrc = sMatch[1];
                    }
                    card.innerHTML = `<div class="vod-row-cover-container" style="width:100px; height:56px;"><img src="${cSrc}" style="width:100%; height:100%; object-fit: cover; border-radius: 6px;"><div class="vod-badge badge-replay">回放</div></div><div class="vod-row-info" style="height:56px;"><div class="vod-row-name">${post.nameStr}</div><div class="vod-row-title" style="font-size:13px;">${post.liveTitle || '直播记录'}</div><div class="vod-row-time" style="font-size:11px;">${post.timeStr}</div></div>`;
                    card.onclick = (e) => {
                        e.stopPropagation();
                        matchReplayByTime(post.nameStr, post.timeStr);
                    };
                    content.appendChild(card);
                }
                if (post.audioUrl) insertAudioPlayerIntoMessage(content, post.audioUrl);
                div.appendChild(header);
                div.appendChild(content);
                contextListContainer.appendChild(div);
            });
            document.querySelector('#contextModal .modal-title').innerText = `上下文: ${targetPost.groupName}`;
            contextModal.style.display = 'flex';
            setTimeout(() => {
                const tEl = document.getElementById('target-message-scroll-anchor');
                if (tEl) tEl.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }, 100);
        }

        function closeContextModal() {
            contextModal.style.display = 'none';
            document.querySelector('#contextModal .modal-title').innerText = `消息上下文`;
            if (currentPlayingAudio) {
                currentPlayingAudio.pause();
                currentPlayingAudio = null;
            }
        }
        contextModal.onclick = (e) => {
            if (e.target === contextModal) closeContextModal();
        }

        function escapeHtml(text) {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, (m) => map[m]);
        }

        async function directToPotPlayer(e, liveId) {
            e.stopPropagation();
            e.target.style.cursor = 'wait';
            const titleEl = document.getElementById('live-view-title') || document.getElementById('live-modal-title'),
                oTitle = titleEl ? titleEl.textContent : '';
            if (titleEl) titleEl.textContent = '⌛ 正在解析外部播放器地址...';
            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({
                    liveId: liveId
                }));
                if (res && res.status === 200 && res.content && res.content.playStreamPath) {
                    if (titleEl) titleEl.textContent = `正在唤起 ${getPreferredExternalPlayerName()}...`;
                    const opened = await openMediaInExternalPlayer(res.content.playStreamPath, { silent: true });
                    if (!opened && titleEl) {
                        titleEl.textContent = `❌ 无法唤起 ${getPreferredExternalPlayerName()}`;
                    }
                } else if (titleEl) titleEl.textContent = '❌ 无法获取流地址 (可能已失效)';
            } catch (err) {
                if (titleEl) titleEl.textContent = '❌ 网络请求失败';
            } finally {
                e.target.style.cursor = 'pointer';
                if (titleEl) setTimeout(() => {
                    if (document.body.contains(titleEl)) titleEl.textContent = oTitle || (currentMode === 'live' ? '正在直播' : '录播回放');
                }, 2000);
            }
        }

        function openInBrowser(url) {
            try {
                openExternal(url);
            } catch (e) {
                window.open(url, '_blank');
            }
        }

        function playArchiveFromMessage(liveId, nickname, timeStr, title) {
            switchView('media', 'vod');

            let ts = new Date(timeStr).getTime();
            if (isNaN(ts)) {
                ts = 0;
            }

            const temp = {
                liveId: liveId,
                userInfo: {
                    nickname: nickname
                },
                title: title || '直播回放',
                startTime: ts,
                ctime: ts,
                liveType: 1
            };

            setTimeout(() => {
                playLiveStream(temp, 'vod');
            }, 300);
        }

        async function matchReplayByTime(memberName, timeStr) {
            switchView('media', 'vod');
            const fInput = document.getElementById('vod-member-filter');
            if (fInput) {
                fInput.value = getMemberIdFromQuery(memberName) || memberName;
                if (window.vodState) vodState.currentPage = 1;
            }
            const loadingDiv = document.getElementById('vod-loading');
            loadingDiv.style.display = 'block';
            if (window.vodState) {
                vodState.list = [];
                vodState.nextPageTokens[vodState.currentGroup] = 0;
                vodState.hasMore = true;
                vodState.searchPageToken = 0;
                vodState.isSearchActive = true;
            }
            const tTime = new Date(timeStr).getTime();
            if (isNaN(tTime)) {
                showToast('消息时间格式无法解析。');
                loadingDiv.style.display = 'none';
                return;
            }
            let found = false,
                pCount = 0;
            while (vodState.hasMore && !found && vodState.isSearchActive) {
                pCount++;
                loadingDiv.innerHTML = `🔍 正在深度搜索第 ${pCount} 页 请耐心等待<br><span style="font-size:12px;color:#999">目标: ${timeStr}</span>`;
                await fetchVODPageInternal();
                const cList = getFilteredVODList();
                let bMatch = null,
                    minD = Infinity,
                    oldest = Infinity;
                for (const item of cList) {
                    const vTime = parseInt(item.startTime || item.ctime);
                    if (!vTime) continue;
                    if (vTime < oldest) oldest = vTime;
                    const diff = Math.abs(vTime - tTime);
                    if (diff < 300000 && diff < minD) {
                        minD = diff;
                        bMatch = item;
                    }
                }
                if (bMatch) {
                    playLiveStream(bMatch, 'vod');
                    found = true;
                    loadingDiv.style.display = 'none';
                    break;
                }
                if (oldest < tTime - 86400000 && oldest !== Infinity) break;
                await new Promise(r => setTimeout(r, 100));
            }
            if (!found && vodState.isSearchActive) {
                loadingDiv.innerText = `未找到匹配回放 (已搜索 ${pCount} 页)`;
                window.renderVODListUI();
            }
            if (window.vodState) vodState.isSearchActive = false;
        }

        function fetchDanmuNative(url) {
            return new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    let data = '';
                    res.on('data', (c) => data += c);
                    res.on('end', () => resolve(data));
                }).on('error', (e) => reject(e));
            });
        }
        document.addEventListener('click', function (e) {
            const box = document.getElementById('member-suggestions'),
                input = document.getElementById('vod-member-filter');
            if (box && input && e.target !== input && !box.contains(e.target)) box.style.display = 'none';

            ['year', 'month', 'day'].forEach(type => {
                const wrapper = document.getElementById(`${type}-wrapper`);
                const list = document.getElementById(`${type}-dropdown`);
                if (list && list.style.display === 'block' && wrapper && !wrapper.contains(e.target)) {
                    list.style.display = 'none';
                }
            });
        });

        async function handleDownloadDanmu(event, item) {
            event.stopPropagation();
            const btn = event.target;
            const originalText = btn.textContent;

            if (btn.disabled) return;

            btn.textContent = "获取中...";
            btn.disabled = true;

            const nickname = item.userInfo ? item.userInfo.nickname : (item.nickname || '未知成员');

            let timeStr = '00000000_00.00.00';
            const rawT = item.startTime || item.ctime;
            if (rawT) {
                const d = new Date(Number(rawT));
                const pad = (n) => String(n).padStart(2, '0');
                const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
                const timePart = `${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;

                timeStr = `${datePart}_${timePart}`;
            }

            const fileName = `【${nickname}】${timeStr}.lrc`;

            const customSavePath = localStorage.getItem('yaya_path_danmu') || '';

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({
                    liveId: item.liveId
                }));

                if (res.status === 200 && res.content && res.content.msgFilePath) {
                    let danmuUrl = res.content.msgFilePath;
                    if (danmuUrl.startsWith('http://')) {
                        danmuUrl = danmuUrl.replace('http://', 'https://');
                    }

                    btn.textContent = "下载中...";

                    ipcRenderer.send('download-danmu', {
                        url: danmuUrl,
                        fileName: fileName,
                        savePath: customSavePath
                    });

                    window.lastDanmuBtn = btn;
                    window.lastDanmuBtnOriginalText = originalText;

                } else {
                    showToast('该录播没有弹幕文件 (可能已过期或未生成)');
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            } catch (e) {
                console.error(e);
                showToast('获取弹幕地址失败');
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }

        ipcRenderer.on('danmu-download-reply', (event, data) => {
            if (window.lastDanmuBtn) {
                if (data.success) {
                    window.lastDanmuBtn.textContent = "已保存";
                    window.lastDanmuBtn.classList.remove('btn-secondary');
                    window.lastDanmuBtn.classList.add('btn-primary');

                    setTimeout(() => {
                        if (window.lastDanmuBtn) {
                            window.lastDanmuBtn.textContent = "弹幕下载";
                            window.lastDanmuBtn.classList.add('btn-secondary');
                            window.lastDanmuBtn.classList.remove('btn-primary');
                            window.lastDanmuBtn.disabled = false;
                        }
                    }, 3000);

                    console.log('弹幕已保存至:', data.path);
                } else {
                    showToast('下载失败: ' + data.msg);
                    window.lastDanmuBtn.textContent = window.lastDanmuBtnOriginalText || "弹幕下载";
                    window.lastDanmuBtn.disabled = false;
                }
            }
        });

        async function handleDownloadVOD(event, item) {
            if (event) event.stopPropagation();
            const btn = event.currentTarget,
                liveId = item.liveId;

            if (downloadStatusMap[liveId] === 'downloading' || downloadStatusMap[liveId] === 'success') return;

            downloadStatusMap[liveId] = 'downloading';
            btn.textContent = "下载中";

            btn.className = `btn btn-secondary btn-downloading vod-btn-${liveId}`;

            btn.disabled = true;
            const nickname = item.userInfo ? item.userInfo.nickname : (item.nickname || '未知成员'),
                title = item.liveTitle || item.title || '无标题';
            let tLabel = '未知时间',
                fTimestamp = '',
                rawT = item.startTime || item.ctime;
            if (rawT) {
                const d = new Date(Number(rawT)),
                    pad = (n) => String(n).padStart(2, '0');
                tLabel = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                fTimestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
            }
            const taskId = 'task_' + Date.now();
            const downloadList = document.getElementById('downloadList');
            if (downloadList.innerText.includes('暂无下载任务')) downloadList.innerHTML = '';

            downloadList.insertAdjacentHTML('afterbegin', `<div class="download-item" id="${taskId}" data-liveid="${liveId}"><div class="download-title-row"><div class="download-title-line" title="${title}" style="flex:1;">${title}</div><button class="btn-cancel" onclick="cancelDownloadTask('${taskId}')">取消</button></div><div class="download-detail-row"><span>${nickname}</span><b class="download-percent">0%</b></div><div class="download-detail-row"><span>${tLabel}</span></div><div class="progress-container" style="margin: 5px 0;"><div class="progress-fill"></div></div><span class="download-status-text">正在请求下载地址...</span></div>`);

            const customSavePath = localStorage.getItem('yaya_path_video') || '';

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({
                    liveId: liveId
                }));
                if (res?.status === 200 && res.content?.playStreamPath) {
                    const safeName = `【${nickname}】${fTimestamp}`.replace(/[\\/:*?"<>|]/g, '_');
                    ipcRenderer.send('download-vod', {
                        url: res.content.playStreamPath,
                        fileName: safeName,
                        taskId: taskId,
                        savePath: customSavePath
                    });
                } else {
                    downloadStatusMap[liveId] = 'error';
                    btn.textContent = "视频下载";
                    btn.className = `btn btn-secondary vod-btn-${liveId}`;
                    btn.disabled = false;
                    showToast('无法获取下载地址');
                }
            } catch (err) {
                downloadStatusMap[liveId] = 'error';
                btn.textContent = "视频下载";
                btn.className = `btn btn-secondary vod-btn-${liveId}`;
                btn.disabled = false;
            }
        }
        ipcRenderer.on('download-progress', (event, data) => {
            const taskEl = document.getElementById(data.taskId);
            if (taskEl) {
                const percent = data.percent ? Math.floor(data.percent) : 0;
                const fillEl = taskEl.querySelector('.progress-fill');
                const textEl = taskEl.querySelector('.download-percent');
                const statusTextEl = taskEl.querySelector('.download-status-text');
                if (percent > 0) {
                    textEl.textContent = `${percent}%`;
                    fillEl.style.width = `${percent}%`;
                    if (statusTextEl.textContent.includes('已下载时长')) {
                        statusTextEl.textContent = '正在下载...';
                    }
                } else if (data.timemark) {
                    fillEl.style.width = '100%';
                    fillEl.style.opacity = '0.3';
                    textEl.textContent = '';
                    const cleanTime = data.timemark.split('.')[0];
                    statusTextEl.textContent = `已下载时长: ${cleanTime}`;
                }
            }
        });
        ipcRenderer.on('download-status', (event, data) => {
            const taskEl = document.getElementById(data.taskId);
            if (!taskEl) return;

            const liveId = taskEl.getAttribute('data-liveid');
            const statusText = taskEl.querySelector('.download-status-text');

            if (data.status === 'success') {
                downloadStatusMap[liveId] = 'success';
            } else if (data.status === 'error' || data.status === 'canceled') {
                downloadStatusMap[liveId] = 'error';
            }

            const listBtn = document.querySelector(`.vod-btn-${liveId}`);

            if (data.status === 'success') {
                statusText.textContent = "完成";
                statusText.style.color = '#28a745';
                taskEl.querySelector('.progress-fill').style.background = '#28a745';

                if (listBtn) {
                    listBtn.textContent = "已完成";
                    listBtn.className = `btn btn-success vod-btn-${liveId}`;
                    listBtn.disabled = true;
                    listBtn.style.opacity = '1';
                    listBtn.blur();
                }

                setTimeout(() => {
                    taskEl.style.transition = 'all 0.5s ease';
                    taskEl.style.opacity = '0';
                    setTimeout(() => {
                        taskEl.remove();
                        const downloadList = document.getElementById('downloadList');
                        if (downloadList && downloadList.children.length === 0) {
                            downloadList.innerHTML = '<div style="text-align: center; color: var(--text-sub); font-size: 11px; padding: 10px;">暂无下载任务</div>';
                        }
                    }, 500);
                }, 1000);

            } else if (data.status === 'error' || data.status === 'canceled') {
                if (listBtn) {
                    listBtn.textContent = "视频下载";
                    listBtn.className = `btn btn-secondary vod-btn-${liveId}`;
                    listBtn.disabled = false;
                }

                if (data.status === 'canceled') {
                    taskEl.remove();
                } else {
                    statusText.textContent = data.msg || "下载失败";
                    statusText.style.color = '#e81123';
                }

                delete downloadStatusMap[liveId];
            }
        });
        const sidebarEl = document.querySelector('.sidebar');
        let scrollTimeout;
        if (sidebarEl) {
            sidebarEl.addEventListener('scroll', () => {
                sidebarEl.classList.add('scrolling');
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    sidebarEl.classList.remove('scrolling');
                }, 1500);
            });
        }
        let autoCloseTimer = null;
        let pendingAnnouncementData = null;

        function isInitShieldVisible() {
            const shield = document.getElementById('loading-shield');
            if (!shield) return false;
            if (window.__shieldVisible) return true;
            return window.getComputedStyle(shield).display !== 'none';
        }

        function renderAnnouncement(data) {
            const modal = document.getElementById('global-announcement-modal');
            if (!modal) return;

            const headerEl = document.getElementById('notice-header-text');
            if (headerEl) headerEl.textContent = data.header || '说点什么';

            const titleEl = document.getElementById('notice-title');
            if (titleEl) {
                if (data.title) {
                    titleEl.textContent = data.title;
                    titleEl.style.display = 'block';
                } else {
                    titleEl.style.display = 'none';
                }
            }

            const imgContainer = document.getElementById('notice-img-container');
            const img = document.getElementById('notice-image');
            if (imgContainer && img) {
                if (data.imageUrl && data.imageUrl.trim() !== "") {
                    img.src = data.imageUrl;
                    img.style.display = 'block';
                    imgContainer.style.display = 'flex';
                } else {
                    img.src = '';
                    img.style.display = 'none';
                    imgContainer.style.display = 'none';
                }
            }

            const textContainer = document.getElementById('notice-full-text');
            if (textContainer) {
                const rawContent = data.fullContent || '';
                const normalizedContent = String(rawContent)
                    .replace(/\/n/g, '\n')
                    .replace(/\\n/g, '\n');
                textContainer.innerHTML = normalizedContent;
            }

            const detailBtn = document.getElementById('notice-detail-btn');
            if (detailBtn) {
                if (data.link && data.link.trim() !== "") {
                    detailBtn.style.display = 'inline-block';
                    detailBtn.onclick = () => openInBrowser(data.link);
                } else {
                    detailBtn.style.display = 'none';
                }
            }

            modal.style.display = 'flex';
            setTimeout(() => {
                modal.style.opacity = '1';
                const box = document.getElementById('announcement-box');
                if (box) box.style.transform = 'translateY(0) scale(1)';
            }, 50);
        }

        function flushPendingAnnouncement() {
            if (!pendingAnnouncementData || isInitShieldVisible()) return;
            const data = pendingAnnouncementData;
            pendingAnnouncementData = null;
            renderAnnouncement(data);
        }

        window.addEventListener('app-shield-hidden', flushPendingAnnouncement);

        async function checkGitHubNotice() {
            try {
                const res = await fetch(`${DATA_BASE_URL}/notice.json?t=${Date.now()}`, {
                    method: 'GET',
                    cache: 'no-store'
                });
                if (res.status === 200) handleNoticeDisplay(await res.json());
            } catch (e) { }
        }

        function handleNoticeDisplay(data) {
            if (!data || !data.show) return;
            pendingAnnouncementData = data;
            flushPendingAnnouncement();
        }

        function closeAnnouncement() {
            const modal = document.getElementById('global-announcement-modal');
            if (modal) {
                modal.style.opacity = '0';
                const box = document.getElementById('announcement-box');
                if (box) box.style.transform = 'translateY(24px) scale(0.985)';
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 300);
            }
        }
        let flipCurrentPage = 0;
        const FLIP_PAGE_SIZE = 20;

        let allFlipData = [];
        let isFetchingFlips = false;
        let currentFlipFilterType = "0";
        let currentSearchKeyword = "";

        function formatFlipTime(timestamp) {
            const dateObj = new Date(Number(timestamp));
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            const hh = String(dateObj.getHours()).padStart(2, '0');
            const mm = String(dateObj.getMinutes()).padStart(2, '0');
            const ss = String(dateObj.getSeconds()).padStart(2, '0');
            return `${y}.${m}.${d} ${hh}:${mm}:${ss}`;
        }


        function createFlipCardDOM(item) {
            const card = document.createElement('div');
            card.className = 'Box-row';
            card.style.marginBottom = '12px';
            card.style.transition = 'all 0.2s';
            card.id = `flip-card-${item.questionId}`;

            const qTimeStr = formatFlipTime(item.qtime);
            const tagStyle = 'padding: 2px 6px; border-radius: 4px; font-size: 12px; border-width: 1px; border-style: solid; display: inline-flex; align-items: center; justify-content: center; height: 20px; box-sizing: border-box;';

            let statusHtml = '';
            let actionBtnHtml = '';

            if (item.status === 1) {
                statusHtml = `<span style="color:#faad14; border-color:#faad14; ${tagStyle}">待回答</span>`;
                actionBtnHtml = `<span class="btn-text-danger" onclick="executeDeleteFlip('${item.questionId}', true)">撤回</span>`;
            } else if (item.status === 2) {
                statusHtml = `<span style="color:#52c41a; border-color:#52c41a; ${tagStyle}">已翻牌</span>`;
                actionBtnHtml = `<span class="btn-text-gray" onclick="executeDeleteFlip('${item.questionId}', false)">删除</span>`;
            } else {
                statusHtml = `<span style="color:#ff4d4f; border-color:#ff4d4f; ${tagStyle}">已退款</span>`;
                actionBtnHtml = `<span class="btn-text-gray" onclick="executeDeleteFlip('${item.questionId}', false)">删除</span>`;
            }

            let answerTypeHtml = '';
            if (item.answerType === 1) answerTypeHtml = `<span style="color:#1890ff; border-color:#1890ff; ${tagStyle}">文字</span>`;
            else if (item.answerType === 2) answerTypeHtml = `<span style="color:#722ed1; border-color:#722ed1; ${tagStyle}">语音</span>`;
            else if (item.answerType === 3) answerTypeHtml = `<span style="color:#eb2f96; border-color:#eb2f96; ${tagStyle}">视频</span>`;
            else answerTypeHtml = `<span style="color:#8c8c8c; border-color:#8c8c8c; ${tagStyle}">未知</span>`;

            let privacyHtml = '';
            if (item.type === 1) privacyHtml = `<span style="color:#13c2c2; border-color:#13c2c2; ${tagStyle}">公开</span>`;
            else if (item.type === 2) privacyHtml = `<span style="color:#f5222d; border-color:#f5222d; ${tagStyle}">私密</span>`;
            else if (item.type === 3) privacyHtml = `<span style="color:#595959; border-color:#595959; ${tagStyle}">匿名</span>`;

            const costHtml = `<span style="color:#fa8c16; border-color:#fa8c16; ${tagStyle}">${item.cost}鸡腿</span>`;

            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px dashed var(--border); padding-bottom:8px;';

            headerDiv.innerHTML = `
        <span style="font-size:14px; font-weight:bold; color:var(--text);">${qTimeStr}</span>
        <div style="display:flex; gap:8px; align-items:center;">
            ${answerTypeHtml} ${privacyHtml} ${costHtml} ${statusHtml}
            <div style="width: 1px; height: 16px; background: var(--border); margin: 0 4px;"></div>
            ${actionBtnHtml}
        </div>`;
            card.appendChild(headerDiv);

            const memberName = item.baseUserInfo ? item.baseUserInfo.nickname : '成员';

            const questionDiv = document.createElement('div');
            questionDiv.style.marginBottom = '15px';
            questionDiv.innerHTML = `
        <div style="margin-bottom:6px; display:flex; align-items:center;">
            <span class="flip-label question-tag" style="margin-right:8px; margin-top:0; margin-bottom:0; transform:none;">翻牌提问</span>
            <span style="font-size:14px; color:var(--text); line-height: 20px;">向 <strong style="color:var(--primary);">${memberName}</strong> 提问</span>
        </div>
        <div style="font-size:14px; color:var(--text); line-height:1.6; padding:0 4px;">${item.content}</div>`;
            card.appendChild(questionDiv);

            if (item.status === 2) {
                const answerDiv = document.createElement('div');
                answerDiv.style.marginTop = '15px';
                const formattedAnswerTime = formatFlipTime(item.answerTime);

                let timeCostStr = '';
                if (item.qtime && item.answerTime) {
                    const diffMs = Number(item.answerTime) - Number(item.qtime);
                    const totalSeconds = Math.floor(diffMs / 1000);
                    const totalMinutes = Math.floor(totalSeconds / 60);
                    const totalHours = Math.floor(totalMinutes / 60);
                    const totalDays = Math.floor(totalHours / 24);

                    if (totalDays > 0) {
                        timeCostStr = `${totalDays}天${totalHours % 24}小时`;
                    } else if (totalHours > 0) {
                        timeCostStr = `${totalHours}小时${totalMinutes % 60}分`;
                    } else if (totalMinutes > 0) {
                        timeCostStr = `${totalMinutes}分${totalSeconds % 60}秒`;
                    } else {
                        timeCostStr = `${totalSeconds}秒`;
                    }
                }

                answerDiv.innerHTML = `
            <div style="margin-bottom:8px; display:flex; align-items:center; flex-wrap: wrap;">
                <span class="flip-label answer-tag" style="margin-right:8px; margin-top:0; margin-bottom:0; transform:none;">翻牌回答</span>
                <span style="font-size:14px; color:var(--text); line-height: 20px;"><strong style="color:var(--primary);">${memberName}</strong> 的回复</span>
                <span style="font-size:12px; color:var(--text-sub); margin-left: 10px;">翻牌时间：${formattedAnswerTime}</span>
                ${timeCostStr ? `<span style="font-size:11px; color:var(--primary); margin-left: 8px; font-weight: 500; opacity: 0.9;">(耗时：${timeCostStr})</span>` : ''}
            </div>`;

                try {
                    if (item.answerType === 1) {
                        const textContent = document.createElement('div');
                        textContent.style.cssText = 'font-size:14px; color:var(--text); line-height:1.6; padding:0 4px;';
                        textContent.innerText = item.answerContent;
                        answerDiv.appendChild(textContent);
                    } else {
                        const json = JSON.parse(item.answerContent);
                        let url = json.url;
                        if (!url.startsWith('http')) url = `https://mp4.48.cn${url}`;

                        if (item.answerType === 2) {
                            const audioRow = document.createElement('div');
                            audioRow.style.cssText = 'display: flex; align-items: center; gap: 12px; flex-wrap: wrap;';

                            if (typeof createCustomAudioPlayer === 'function') {
                                audioRow.appendChild(createCustomAudioPlayer(url));
                            } else {
                                const audioEl = document.createElement('audio');
                                audioEl.src = url;
                                audioEl.controls = true;
                                audioEl.style.maxWidth = '100%';
                                audioEl.style.marginTop = '8px';
                                audioRow.appendChild(audioEl);
                            }

                            const downloadBtn = document.createElement('button');
                            downloadBtn.className = 'btn btn-secondary';
                            downloadBtn.style.cssText = 'width: 38px; height: 38px; padding: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 8px;';
                            downloadBtn.title = '下载语音';

                            const downloadIcon = `
                                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                            `;
                            downloadBtn.innerHTML = downloadIcon;

                            downloadBtn.onclick = (e) => {
                                e.stopPropagation();
                                downloadMediaFileIconMode(url, `【${memberName}】翻牌语音_${item.questionId}.mp3`, downloadBtn, downloadIcon);
                            };

                            audioRow.appendChild(downloadBtn);
                            answerDiv.appendChild(audioRow);

                        } else if (item.answerType === 3) {
                            if (typeof createCustomVideoPlayer === 'function') {
                                answerDiv.appendChild(createCustomVideoPlayer(url));
                            } else {
                                const video = document.createElement('video');
                                video.src = url;
                                video.controls = true;
                                video.style.cssText = "max-width:100%; max-height:300px; border-radius:8px; background:#000;";
                                answerDiv.appendChild(video);
                            }
                        }
                    }
                } catch (e) {
                    const errDiv = document.createElement('div');
                    errDiv.style.color = '#ff4d4f';
                    errDiv.innerText = '⚠️ 无法解析回答内容';
                    answerDiv.appendChild(errDiv);
                }
                card.appendChild(answerDiv);
            }
            return card;
        }

        function toggleFlipTypeDropdown() {
            const list = document.getElementById('flip-type-dropdown');
            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        }

        function selectFlipType(value, text) {
            const displayInput = document.getElementById('flip-type-display');
            if (displayInput) displayInput.value = text;

            document.getElementById('flip-type-dropdown').style.display = 'none';

            applyFlipFilter(value);
        }

        function applyFlipFilter(val) {
            currentFlipFilterType = val;
            flipCurrentPage = 0;
            renderLocalPage(0);
        }

        function applyFlipSearch() {
            const input = document.getElementById('flipSearchInput');
            if (input) {
                currentSearchKeyword = input.value.trim();
                flipCurrentPage = 0;
                renderLocalPage(0);
            }
        }

        function changeFlipPage(delta) {
            const newPage = flipCurrentPage + delta;
            if (newPage < 0) return;
            renderLocalPage(newPage);
        }

        function getFilteredData() {
            let result = allFlipData;

            if (currentFlipFilterType !== "0") {
                result = result.filter(item => item.answerType == currentFlipFilterType);
            }

            if (currentSearchKeyword) {
                const lowerKey = currentSearchKeyword.toLowerCase();
                result = result.filter(item => {
                    const qContent = (item.content || "").toLowerCase();
                    const aContent = (item.answerContent || "").toLowerCase();
                    const memberName = (item.baseUserInfo && item.baseUserInfo.nickname || "").toLowerCase();

                    return qContent.includes(lowerKey) ||
                        aContent.includes(lowerKey) ||
                        memberName.includes(lowerKey);
                });
            }

            return result;
        }

        async function loadFlipList(pageIndex) {
            if (allFlipData.length === 0 && !isFetchingFlips) {
                await startAutoFetchAll();
            } else {
                renderLocalPage(pageIndex);
            }
        }

        function forceReloadFlips() {
            allFlipData = [];
            flipCurrentPage = 0;
            currentSearchKeyword = "";
            const input = document.getElementById('flipSearchInput');
            if (input) input.value = "";

            loadFlipList(0);
        }

        async function updateLatestFlips() {
            const token = appToken || localStorage.getItem('yaya_p48_token');
            if (!token) return;

            const statusText = document.getElementById('flip-status-text');
            if (statusText) statusText.innerText = '正在同步最新翻牌...';

            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-flip-list', {
                    token: token,
                    pa: pa,
                    beginLimit: 0,
                    limit: 20
                });

                if (res.success && res.content) {
                    const latestList = res.content || [];
                    let addedCount = 0;

                    latestList.reverse().forEach(newItem => {
                        const existingIndex = allFlipData.findIndex(item => String(item.questionId) === String(newItem.questionId));
                        if (existingIndex !== -1) {
                            allFlipData[existingIndex] = newItem;
                        } else {
                            allFlipData.unshift(newItem);
                            addedCount++;
                        }
                    });

                    if (statusText) statusText.innerText = `已同步最新状态 (新增 ${addedCount} 条)`;
                } else {
                    if (statusText) statusText.innerText = `同步失败: ${res.msg}`;
                }
            } catch (e) {
                if (statusText) statusText.innerText = `同步出错: ${e.message}`;
            }

            currentSearchKeyword = "";
            const input = document.getElementById('flipSearchInput');
            if (input) input.value = "";

            flipCurrentPage = 0;
            renderLocalPage(0);
        }

        async function startAutoFetchAll() {
            const container = document.getElementById('flip-list-container');
            const statusText = document.getElementById('flip-status-text');
            const pagination = document.querySelector('#view-flip .pagination-container');

            let token = appToken || localStorage.getItem('yaya_p48_token');
            if (!token) {
                container.innerHTML = '<div class="placeholder-tip"><h3>⚠️ 未登录</h3><p>请先前往“账号设置”页面验证 Token。</p></div>';
                return;
            }

            isFetchingFlips = true;
            if (pagination) pagination.style.display = 'none';
            container.innerHTML = '<div class="empty-state" style="padding:40px;"><h3>正在同步数据...</h3><p>正在拉取所有历史记录，完成后将自动显示。</p></div>';

            let beginLimit = 0;
            let hasMore = true;
            const pa = window.getPA ? window.getPA() : null;

            try {
                while (hasMore) {
                    statusText.innerText = `正在下载... 已获取 ${allFlipData.length} 条`;

                    const res = await ipcRenderer.invoke('fetch-flip-list', {
                        token: token,
                        pa: pa,
                        beginLimit: beginLimit,
                        limit: 20
                    });

                    if (res.success) {
                        const list = res.content || [];
                        if (list.length === 0) {
                            hasMore = false;
                        } else {
                            allFlipData = allFlipData.concat(list);
                            beginLimit += list.length;
                            if (list.length < 20) {
                                hasMore = false;
                            } else {
                                await new Promise(r => setTimeout(r, 50));
                            }
                        }
                    } else {
                        statusText.innerText = `同步中断: ${res.msg}`;
                        hasMore = false;
                    }
                }
            } catch (e) {
                statusText.innerText = `错误: ${e.message}`;
            } finally {
                isFetchingFlips = false;
                statusText.innerText = `共 ${allFlipData.length} 条记录`;
                renderLocalPage(0);
            }
        }

        function renderLocalPage(pageIndex) {
            const container = document.getElementById('flip-list-container');
            const statusText = document.getElementById('flip-status-text');
            const pagination = document.querySelector('#view-flip .pagination-container');

            let filteredData = getFilteredData();

            if (typeof currentFlipSort !== 'undefined') {
                if (currentFlipSort === 'cost_desc') {
                    filteredData.sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0));
                } else if (currentFlipSort === 'cost_asc') {
                    filteredData.sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0));
                } else if (currentFlipSort === 'speed_fast') {
                    filteredData.sort((a, b) => {
                        const durA = getFlipDuration(a);
                        const durB = getFlipDuration(b);
                        if (durA === -1) return 1;
                        if (durB === -1) return -1;
                        return durA - durB;
                    });
                } else if (currentFlipSort === 'speed_slow') {
                    filteredData.sort((a, b) => {
                        const durA = getFlipDuration(a);
                        const durB = getFlipDuration(b);
                        return durB - durA;
                    });
                } else {
                    filteredData.sort((a, b) => Number(b.qtime) - Number(a.qtime));
                }
            }

            const start = pageIndex * FLIP_PAGE_SIZE;
            const end = start + FLIP_PAGE_SIZE;
            const pageData = filteredData.slice(start, end);

            flipCurrentPage = pageIndex;

            const hasData = (typeof allFlipData !== 'undefined' && allFlipData && allFlipData.length > 0);

            const sidebarBtn = document.getElementById('flipAnalysisBtn');
            if (sidebarBtn) {
                if (hasData) {
                    sidebarBtn.disabled = false;
                    sidebarBtn.style.opacity = '1';
                    sidebarBtn.style.cursor = 'pointer';
                    sidebarBtn.title = '';
                } else {
                    sidebarBtn.disabled = true;
                    sidebarBtn.style.opacity = '0.5';
                    sidebarBtn.style.cursor = 'not-allowed';
                    sidebarBtn.title = '暂无数据，请先在翻牌记录页刷新数据';
                }
            }

            statusText.innerHTML = '';
            const headerBtn = document.createElement('button');
            headerBtn.className = 'btn btn-secondary';
            headerBtn.style.cssText = 'padding: 0 15px; transition: all 0.2s;';
            headerBtn.innerHTML = '翻牌统计';

            if (hasData) {
                headerBtn.disabled = false;
                headerBtn.onclick = function () {
                    if (sidebarBtn) sidebarBtn.click();
                    else if (typeof openFlipAnalysis === 'function') openFlipAnalysis();
                };
            } else {
                headerBtn.disabled = true;
                headerBtn.style.opacity = '0.5';
                headerBtn.style.cursor = 'not-allowed';
                headerBtn.title = '暂无数据，请先点击右侧“刷新”按钮获取数据';
            }

            statusText.appendChild(headerBtn);

            if (currentSearchKeyword) {
                const searchTip = document.createElement('span');
                searchTip.style.cssText = 'margin-left: 10px; font-size: 12px; color: var(--text-sub); vertical-align: middle;';
                searchTip.innerText = `(搜到 ${filteredData.length} 条)`;
                statusText.appendChild(searchTip);
            }

            container.innerHTML = '';
            if (pageData.length === 0) {
                container.innerHTML = '<div class="empty-state">没有符合条件的数据</div>';
            } else {
                const fragment = document.createDocumentFragment();
                pageData.forEach(item => {
                    fragment.appendChild(createFlipCardDOM(item));
                });
                container.appendChild(fragment);
            }

            const viewFlip = document.getElementById('view-flip');
            if (viewFlip) viewFlip.scrollTop = 0;

            if (pagination) {
                pagination.style.display = 'flex';
                renderFlipPagination(filteredData.length);
            }
        }

        function renderFlipPagination(totalCount) {
            const paginationContainer = document.querySelector('#view-flip .pagination-container');
            if (!paginationContainer) return;

            paginationContainer.innerHTML = '';
            const totalPages = Math.ceil(totalCount / FLIP_PAGE_SIZE) || 1;

            const firstBtn = document.createElement('button');
            firstBtn.className = 'pagination-btn';
            firstBtn.innerText = '首页';
            firstBtn.disabled = (flipCurrentPage === 0);
            if (firstBtn.disabled) firstBtn.style.opacity = '0.5';
            firstBtn.onclick = () => renderLocalPage(0);
            paginationContainer.appendChild(firstBtn);

            const prevBtn = document.createElement('button');
            prevBtn.className = 'pagination-btn';
            prevBtn.innerText = '上一页';
            prevBtn.disabled = (flipCurrentPage === 0);
            if (prevBtn.disabled) prevBtn.style.opacity = '0.5';
            prevBtn.onclick = () => changeFlipPage(-1);
            paginationContainer.appendChild(prevBtn);

            const startPage = Math.max(0, flipCurrentPage - 2);
            const endPage = Math.min(totalPages - 1, flipCurrentPage + 2);

            for (let i = startPage; i <= endPage; i++) {
                const numBtn = document.createElement('button');
                numBtn.className = `pagination-btn ${i === flipCurrentPage ? 'active' : ''}`;
                numBtn.innerText = i + 1;
                numBtn.onclick = () => renderLocalPage(i);
                paginationContainer.appendChild(numBtn);
            }

            const nextBtn = document.createElement('button');
            nextBtn.className = 'pagination-btn';
            nextBtn.innerText = '下一页';
            nextBtn.disabled = (flipCurrentPage >= totalPages - 1);
            if (nextBtn.disabled) nextBtn.style.opacity = '0.5';
            nextBtn.onclick = () => changeFlipPage(1);
            paginationContainer.appendChild(nextBtn);

            const lastBtn = document.createElement('button');
            lastBtn.className = 'pagination-btn';
            lastBtn.innerText = '尾页';
            lastBtn.disabled = (flipCurrentPage >= totalPages - 1);
            if (lastBtn.disabled) lastBtn.style.opacity = '0.5';
            lastBtn.onclick = () => renderLocalPage(totalPages - 1);
            paginationContainer.appendChild(lastBtn);
        }

        function getPinyinInitials(pinyinStr) {
            if (!pinyinStr) return "";
            return pinyinStr.replace(/[^A-Z]/g, "");
        }

        function getMemberWeight(m) {
            if (!m) return 1;
            return (m.isInGroup !== false) ? 1 : 0;
        }

        function memberSortLogic(a, b) {
            const weightA = getMemberWeight(a);
            const weightB = getMemberWeight(b);
            return weightB - weightA;
        }

        function handleProfileSearch(keyword) {
            const resultBox = document.getElementById('profile-search-results');
            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }
            if (!window.isMemberDataLoaded && typeof loadMemberData === 'function') loadMemberData();

            const lowerKw = keyword.toLowerCase();

            let matches = memberData.filter(m => {
                const matchName = m.ownerName.includes(keyword);
                const pinyin = m.pinyin || "";
                const matchPinyin = pinyin.toLowerCase().includes(lowerKw);
                const initials = getPinyinInitials(pinyin);
                const matchInitials = initials.toLowerCase().includes(lowerKw);
                return matchName || matchPinyin || matchInitials;
            });

            matches.sort(memberSortLogic);

            if (matches.length > 0) {
                const html = matches.map(m => {
                    const isInactive = m.isInGroup === false;
                    const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';

                    let colorStyle = '';
                    if (typeof getTeamStyle === 'function') {
                        colorStyle = getTeamStyle(m.team, isInactive);
                    }

                    return `<div class="suggestion-item" 
                 onclick="selectProfileMember('${m.ownerName}', '${m.id || m.userId || m.memberId}')"
                 style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight:bold; ${baseStyle}">${m.ownerName}</span>
                <span class="team-tag" style="${baseStyle} ${colorStyle}">${m.team}</span>
            </div>`;
                }).join('');
                resultBox.innerHTML = html;
                resultBox.style.display = 'block';
            } else {
                resultBox.style.display = 'none';
            }
        }

        function selectProfileMember(name, userId) {
            document.getElementById('profile-member-input').value = name;
            document.getElementById('profile-member-id').value = userId;
            document.getElementById('profile-search-results').style.display = 'none';
        }

        async function loadStarProfile() {
            const container = document.getElementById('profile-result-container');
            const memberId = document.getElementById('profile-member-id').value;
            let token = appToken || localStorage.getItem('yaya_p48_token');

            if (!token) {
                container.innerHTML = `
            <div class="placeholder-tip">
                <h3 style="color: #ff4d4f;">⚠️ 未登录</h3>
                <p>请先在左侧“账号设置”中登录。</p>
            </div>`;
                return;
            }

            if (!memberId) {
                container.innerHTML = `
            <div class="placeholder-tip">
                <h3 style="color: #ff4d4f;">⚠️ 未选择成员</h3>
                <p>请在上方输入框搜索成员名字，并点击下拉项选中。</p>
            </div>`;
                return;
            }

            container.innerHTML = '<div class="empty-state">正在读取完整档案...</div>';

            try {
                const pa = window.getPA ? window.getPA() : null;

                const [archiveRes, historyRes] = await Promise.all([
                    ipcRenderer.invoke('fetch-star-archives', { token, pa, memberId }),
                    ipcRenderer.invoke('fetch-star-history', { token, pa, memberId })
                ]);

                if (archiveRes.success && archiveRes.content) {
                    const data = archiveRes.content;

                    if (historyRes.success && historyRes.content && historyRes.content.history) {
                        data.fullHistory = historyRes.content.history;
                        console.log(`获取到完整履历 ${data.fullHistory.length} 条`);
                    } else {
                        data.fullHistory = data.history;
                    }

                    renderProfile(data, container);
                } else {
                    container.innerHTML = `<div class="placeholder-tip"><h3>❌ 获取失败</h3><p>${archiveRes.msg || '未知错误'}</p></div>`;
                }
            } catch (e) {
                container.innerHTML = `<div class="placeholder-tip"><h3>❌ 发生错误</h3><p>${e.message}</p></div>`;
            }
        }

        let currentPhotoPage = 1;
        let isFetchingPhotos = false;
        let isPhotosAutoLoading = false;

        async function fetchAllMemberPhotos() {
            const btn = document.getElementById('btn-photos-all');
            const memberId = document.getElementById('photo-member-id').value;
            const statusEl = document.getElementById('photos-status');

            if (!memberId) return showToast('⚠️ 请先搜索并选择成员');

            if (isPhotosAutoLoading) {
                isPhotosAutoLoading = false;
                btn.innerText = '加载全部';
                btn.style.background = '';
                btn.style.color = '';
                return;
            }

            isPhotosAutoLoading = true;
            btn.innerText = '停止加载';
            btn.style.background = '#ff4d4f';
            btn.style.color = 'white';

            if (!currentPhotoPage || currentPhotoPage === 0) {
                await fetchMemberPhotos(false);
            }

            while (isPhotosAutoLoading) {
                const prevPage = currentPhotoPage;
                await fetchMemberPhotos(true);
                await new Promise(r => setTimeout(r, 50));

                if (statusEl.innerText.includes('已到底部') || statusEl.innerText.includes('已加载全部') || currentPhotoPage === prevPage) {
                    break;
                }
            }

            isPhotosAutoLoading = false;
            btn.innerText = '加载全部';
            btn.style.background = '';
            btn.style.color = '';

            if (statusEl) {
                const totalCount = document.querySelectorAll('#photos-result-container .photo-nft-card').length;
                statusEl.innerHTML = `共获取 ${totalCount} 条 <span style="font-size:12px; color:#28a745">(已加载全部)</span>`;
            }
        }

        function handlePhotoSearch(keyword) {
            const resultBox = document.getElementById('photo-search-results');
            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }
            if (!window.isMemberDataLoaded && typeof loadMemberData === 'function') loadMemberData();

            const lowerKw = keyword.toLowerCase();
            let matches = memberData.filter(m => {
                const matchName = m.ownerName.includes(keyword);
                const pinyin = m.pinyin || "";
                const matchPinyin = pinyin.toLowerCase().includes(lowerKw);
                const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : "";
                return matchName || matchPinyin || initials.toLowerCase().includes(lowerKw);
            });

            matches.sort(memberSortLogic);

            if (matches.length > 0) {
                const html = matches.slice(0, 10).map(m => {
                    const isInactive = m.isInGroup === false;
                    const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';
                    let colorStyle = typeof getTeamStyle === 'function' ? getTeamStyle(m.team, isInactive) : '';
                    return `<div class="suggestion-item" 
                                 onclick="selectPhotoMember('${m.ownerName}', '${m.id || m.userId || m.memberId}')"
                                 style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight:bold; ${baseStyle}">${m.ownerName}</span>
                                <span class="team-tag" style="${baseStyle} ${colorStyle}">${m.team}</span>
                            </div>`;
                }).join('');
                resultBox.innerHTML = html;
                resultBox.style.display = 'block';
            } else {
                resultBox.style.display = 'none';
            }
        }

        function selectPhotoMember(name, userId) {
            document.getElementById('photo-member-input').value = name;
            document.getElementById('photo-member-id').value = userId;
            document.getElementById('photo-search-results').style.display = 'none';
        }

        async function fetchMemberPhotos(isLoadMore) {
            const container = document.getElementById('photos-result-container');
            const memberId = document.getElementById('photo-member-id').value;
            const token = appToken || localStorage.getItem('yaya_p48_token');
            const statusEl = document.getElementById('photos-status');

            if (!token) return showToast('⚠️ 请先在“账号设置”中登录');
            if (!memberId) return showToast('⚠️ 请先搜索并选择成员');
            if (isFetchingPhotos) return;

            isFetchingPhotos = true;

            if (!isLoadMore) {
                currentPhotoPage = 0;
                container.innerHTML = '<div class="empty-state">正在读取相册...</div>';
                container.className = '';
                if (statusEl) statusEl.innerText = '';
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-member-photos', {
                    token, pa, memberId, page: currentPhotoPage, size: 20
                });

                if (res.success && res.content) {
                    let list = [];
                    if (Array.isArray(res.content)) {
                        list = res.content;
                    } else if (typeof res.content === 'object' && res.content !== null) {
                        list = res.content.nftList || res.content.list || res.content.data || res.content.records || res.content.message || [];
                        if (list.length === 0) {
                            for (let key in res.content) {
                                if (Array.isArray(res.content[key])) {
                                    list = res.content[key];
                                    break;
                                }
                            }
                        }
                    }

                    if (!isLoadMore) container.innerHTML = '';

                    if (!list || list.length === 0) {
                        if (!isLoadMore) container.innerHTML = '<div class="empty-state">该成员暂无相册内容</div>';
                        if (statusEl && !isPhotosAutoLoading) statusEl.innerText = '已到底部';
                    } else {
                        if (!isLoadMore) container.className = 'photo-card-grid';

                        renderPhotoItems(list, container);
                        currentPhotoPage++;

                        const totalCount = container.querySelectorAll('.photo-nft-card').length;

                        if (list.length < 20) {
                            if (statusEl && !isPhotosAutoLoading) statusEl.innerText = `共获取 ${totalCount} 条 (已到底部)`;
                        } else {
                            if (statusEl) statusEl.innerText = `已获取 ${totalCount} 条...`;
                        }
                    }
                } else {
                    if (!isLoadMore) container.innerHTML = `<div class="placeholder-tip"><h3>❌ 加载失败</h3><p>${res.msg}</p></div>`;
                }
            } catch (e) {
                if (!isLoadMore) container.innerHTML = `<div class="placeholder-tip"><h3>❌ 发生错误</h3><p>${e.message}</p></div>`;
            } finally {
                isFetchingPhotos = false;
            }
        }

        function renderPhotoItems(list, container) {
            const memberName = document.getElementById('photo-member-input').value || '成员';

            list.forEach(item => {
                const card = document.createElement('div');
                card.className = 'photo-nft-card';

                const isAudio = item.sourceType === 3 || (item.url && (item.url.endsWith('.aac') || item.url.endsWith('.mp3'))) || item.audioInfo;
                const isVideo = item.sourceType === 2 || (item.url && item.url.endsWith('.mp4')) || item.videoInfo;
                const safeUrl = item.url ? (item.url.startsWith('http') ? item.url : `https://source.48.cn${item.url}`) : '';

                const extMatch = safeUrl.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
                const ext = extMatch ? extMatch[1] : (isAudio ? 'aac' : (isVideo ? 'mp4' : 'png'));
                const dlFilename = `【${memberName}】个人相册_${item.dataId || item.id || Date.now()}.${ext}`;

                let dateStr = '未知时间';
                if (item.createTime || item.ctime) {
                    const d = new Date(Number(item.createTime || item.ctime));
                    const pad = (n) => String(n).padStart(2, '0');
                    dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                }

                const costHtml = item.money ? `<span style="color: #fa8c16; font-weight: bold; font-size: 13px;">${item.money} 🍗</span>` : `<span style="color: #52c41a; font-weight: bold; font-size: 13px;">免费</span>`;

                const downloadIcon = `
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>保存
        `;

                const mediaContainer = document.createElement('div');
                mediaContainer.style.cssText = 'aspect-ratio: 1 / 1; width: 100%; display: flex; align-items: center; justify-content: center; background: var(--input-bg); border-bottom: 1px solid var(--border); overflow: hidden; position: relative;';

                if (isAudio) {
                    const audioPlayer = createCustomAudioPlayer(safeUrl);
                    mediaContainer.style.flexDirection = 'column';
                    mediaContainer.style.background = 'linear-gradient(145deg, var(--input-bg) 0%, rgba(155, 106, 156, 0.06) 100%)';
                    mediaContainer.innerHTML = `
                <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, var(--primary) 0%, #d49bc6 100%); box-shadow: 0 6px 16px rgba(155, 106, 156, 0.35); display: flex; align-items: center; justify-content: center; margin-bottom: 18px; user-select: none;">
                    <svg viewBox="0 0 24 24" width="30" height="30" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="18" x2="12" y2="6"></line><line x1="8" y1="14" x2="8" y2="10"></line><line x1="16" y1="16" x2="16" y2="8"></line><line x1="4" y1="13" x2="4" y2="11"></line><line x1="20" y1="15" x2="20" y2="9"></line>
                    </svg>
                </div>
            `;
                    mediaContainer.appendChild(audioPlayer);
                } else if (isVideo) {
                    let coverUrl = item.picPath ? (item.picPath.startsWith('http') ? item.picPath : `https://source.48.cn${item.picPath}`) : '';

                    mediaContainer.innerHTML = `
                <video data-src="${safeUrl}#t=0.1" preload="none" ${coverUrl ? `poster="${coverUrl}"` : ''} 
                       style="width: 100%; height: 100%; object-fit: cover; background: #000; transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);"></video>
                
                <div class="album-video-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.15); cursor: pointer; transition: opacity 0.3s;">
                    <div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.5); color: white; font-size: 11px; padding: 2px 6px; border-radius: 4px; backdrop-filter: blur(4px);">🎬 视频</div>
                    
                    <div class="album-play-btn" style="width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.25); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.6); box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="white" style="margin-left: 4px;"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
            `;

                    const overlay = mediaContainer.querySelector('.album-video-overlay');
                    const playBtn = mediaContainer.querySelector('.album-play-btn');
                    const videoEl = mediaContainer.querySelector('video');

                    if (typeof albumVideoObserver !== 'undefined') {
                        albumVideoObserver.observe(videoEl);
                    }

                    overlay.onmouseenter = () => { playBtn.style.transform = 'scale(1.15)'; playBtn.style.background = 'var(--primary)'; playBtn.style.borderColor = 'var(--primary)'; videoEl.style.transform = 'scale(1.05)'; };
                    overlay.onmouseleave = () => { playBtn.style.transform = 'scale(1)'; playBtn.style.background = 'rgba(255,255,255,0.25)'; playBtn.style.borderColor = 'rgba(255,255,255,0.6)'; videoEl.style.transform = 'scale(1)'; };

                    overlay.onclick = (e) => {
                        e.stopPropagation();
                        if (!videoEl.src) videoEl.src = videoEl.dataset.src;

                        overlay.style.opacity = '0';
                        overlay.style.pointerEvents = 'none';
                        videoEl.style.transform = 'scale(1)';
                        videoEl.style.objectFit = 'contain';
                        videoEl.controls = true;

                        if (typeof currentPlayingVideo !== 'undefined' && currentPlayingVideo && currentPlayingVideo !== videoEl) currentPlayingVideo.pause();
                        if (typeof currentPlayingAudio !== 'undefined' && currentPlayingAudio) currentPlayingAudio.pause();
                        currentPlayingVideo = videoEl;
                        videoEl.play();
                    };
                } else {
                    const thumbUrl = typeof getOptimizedThumbUrl === 'function' ? getOptimizedThumbUrl(safeUrl) : safeUrl;
                    mediaContainer.innerHTML = `<img src="${thumbUrl}" loading="lazy" decoding="async" onclick="openImageModal('${safeUrl}')" style="width:100%; height:100%; object-fit:cover; object-position:center; cursor:zoom-in; transition: transform 0.3s;">`;
                    const imgEl = mediaContainer.querySelector('img');
                    imgEl.onmouseenter = () => imgEl.style.transform = 'scale(1.05)';
                    imgEl.onmouseleave = () => imgEl.style.transform = 'scale(1)';
                }

                const infoContainer = document.createElement('div');
                infoContainer.style.padding = '12px';
                infoContainer.innerHTML = `
            <div style="font-size: 12px; color: var(--text-sub); margin-bottom: 6px;">${dateStr}</div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                ${costHtml}
                <span style="font-size: 12px; color: var(--text-sub);">发行: ${item.total || '不限'} | 已售: ${item.sold || 0}</span>
            </div>
            <div style="margin-top: 12px;">
                <button class="btn btn-secondary btn-full" style="height: 32px; font-size: 12px; border-radius: 16px;" onclick="downloadMediaFileIconMode('${safeUrl}', '${dlFilename}', this, this.innerHTML)">
                    ${downloadIcon}
                </button>
            </div>
        `;

                card.appendChild(mediaContainer);
                card.appendChild(infoContainer);
                container.appendChild(card);
            });
        }

        let currentRoomAlbumNextTime = 0;
        let isFetchingRoomAlbum = false;
        let isRoomAlbumAutoLoading = false;

        async function fetchAllRoomAlbum() {
            const btn = document.getElementById('btn-room-album-all');
            const channelId = document.getElementById('room-album-channel-id').value;
            const statusEl = document.getElementById('room-album-status');

            if (!channelId) {
                showToast('⚠️ 请先搜索并选择成员');
                return;
            }

            if (isRoomAlbumAutoLoading) {
                isRoomAlbumAutoLoading = false;
                btn.innerText = '加载全部';
                btn.style.background = '';
                btn.style.color = '';
                return;
            }

            isRoomAlbumAutoLoading = true;
            btn.innerText = '停止加载';
            btn.style.background = '#ff4d4f';
            btn.style.color = 'white';

            if (currentRoomAlbumNextTime === 0) {
                await fetchRoomAlbum(false);
            }

            while (isRoomAlbumAutoLoading) {
                if (!currentRoomAlbumNextTime || currentRoomAlbumNextTime === 0 || currentRoomAlbumNextTime === '0') {
                    break;
                }

                const prevTime = currentRoomAlbumNextTime;

                await fetchRoomAlbum(true);

                await new Promise(r => setTimeout(r, 50));

                if (currentRoomAlbumNextTime === prevTime && currentRoomAlbumNextTime !== 0) {
                    console.warn("游标未更新，强制停止");
                    break;
                }
            }

            isRoomAlbumAutoLoading = false;
            btn.innerText = '加载全部';
            btn.style.background = '';
            btn.style.color = '';

            if (statusEl && (!currentRoomAlbumNextTime || currentRoomAlbumNextTime === 0)) {
                const totalCount = document.querySelectorAll('#room-album-result-container .photo-nft-card').length;
                statusEl.innerHTML = `共获取 ${totalCount} 条 <span style="font-size:12px; color:#28a745">(已加载全部)</span>`;
            }
        }

        let isBatchDownloadingRoom = false;

        async function downloadAllRoomAlbum() {
            const btn = document.getElementById('btn-room-album-dl-all');
            const allDlBtns = document.querySelectorAll('#room-album-result-container .album-single-dl-btn');
            const memberName = document.getElementById('room-album-member-input').value || '未知成员';

            if (allDlBtns.length === 0) return showToast('⚠️ 当前没有可下载的媒体，请先查询或加载内容');

            if (isBatchDownloadingRoom) {
                isBatchDownloadingRoom = false;
                btn.innerText = '正在中止...';
                return;
            }

            let currentMediaDir = localStorage.getItem('yaya_path_media');
            if (!currentMediaDir) {
                showToast('尚未设置相册下载路径，请选择一个保存文件夹');
                try {
                    const selectedPath = await ipcRenderer.invoke('dialog-open-directory');
                    if (selectedPath) {
                        localStorage.setItem('yaya_path_media', selectedPath);
                        const pathInput = document.getElementById('path-media');
                        if (pathInput) pathInput.value = selectedPath;
                        showToast('路径设置成功，开始一键下载');
                    } else {
                        return showToast('已取消批量下载 (未选择文件夹)');
                    }
                } catch (e) {
                    console.error('打开文件夹选择框失败:', e);
                    return showToast('无法打开系统选择框，请先前往“设置”手动配置路径。');
                }
            }

            const folderName = `【房间相册】${memberName}`;
            isBatchDownloadingRoom = true;
            const originalText = '一键下载';
            const originalBg = '';

            let successCount = 0;
            let failCount = 0;

            btn.style.background = '#ff4d4f';

            for (let i = 0; i < allDlBtns.length; i++) {
                if (!isBatchDownloadingRoom) {
                    showToast('批量下载已中止');
                    break;
                }

                const singleBtn = allDlBtns[i];
                const url = singleBtn.getAttribute('data-url');
                const filename = singleBtn.getAttribute('data-filename');

                btn.innerText = `点击停止 (${i + 1}/${allDlBtns.length})`;

                const isSuccess = await downloadMediaFileIconMode(url, filename, singleBtn, singleBtn.innerHTML, 'media', folderName);

                if (isSuccess) successCount++;
                else failCount++;

                if (!isBatchDownloadingRoom) {
                    showToast('批量下载已中止');
                    break;
                }

                await new Promise(r => setTimeout(r, 400));
            }

            isBatchDownloadingRoom = false;

            if (failCount === 0) {
                btn.innerText = `✅ 结束 (共${successCount}个)`;
                btn.style.background = '#52c41a';
            } else {
                btn.innerText = `⚠️ 结束 (成功${successCount}, 失败${failCount})`;
                btn.style.background = '#fa8c16';
            }

            setTimeout(() => {
                if (!isBatchDownloadingRoom) {
                    btn.innerText = originalText;
                    btn.style.background = originalBg;
                }
            }, 3000);
        }

        function handleRoomAlbumSearch(keyword) {
            const resultBox = document.getElementById('room-album-search-results');
            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }
            if (!window.isMemberDataLoaded && typeof loadMemberData === 'function') loadMemberData();

            const lowerKw = keyword.toLowerCase();
            let matches = memberData.filter(m => {
                const matchName = m.ownerName.includes(keyword);
                const pinyin = m.pinyin || "";
                const matchPinyin = pinyin.toLowerCase().includes(lowerKw);
                const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : "";
                return matchName || matchPinyin || initials.toLowerCase().includes(lowerKw);
            });

            matches.sort(memberSortLogic);

            if (matches.length > 0) {
                const html = matches.slice(0, 10).map(m => {
                    const isInactive = m.isInGroup === false;
                    const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';
                    let colorStyle = typeof getTeamStyle === 'function' ? getTeamStyle(m.team, isInactive) : '';
                    return `<div class="suggestion-item" 
                                 onclick="selectRoomAlbumMember('${m.ownerName}', '${m.channelId}', '${m.yklzId || ''}')"
                                 style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight:bold; ${baseStyle}">${m.ownerName}</span>
                                <span class="team-tag" style="${baseStyle} ${colorStyle}">${m.team}</span>
                            </div>`;
                }).join('');
                resultBox.innerHTML = html;
                resultBox.style.display = 'block';
            } else {
                resultBox.style.display = 'none';
            }
        }

        function selectRoomAlbumMember(name, channelId, smallChannelId = '') {
            document.getElementById('room-album-member-input').value = name;
            const channelInput = document.getElementById('room-album-channel-id');
            channelInput.dataset.bigChannelId = channelId || '';
            channelInput.dataset.smallChannelId = smallChannelId || '';
            applyRoomAlbumChannelValue();
            document.getElementById('room-album-search-results').style.display = 'none';
        }

        async function fetchRoomAlbum(isLoadMore) {
            const container = document.getElementById('room-album-result-container');
            const channelId = document.getElementById('room-album-channel-id').value.trim();
            const token = appToken || localStorage.getItem('yaya_p48_token');
            const statusEl = document.getElementById('room-album-status');

            if (!token) return showToast('⚠️ 请先在“账号设置”中登录');
            if (!channelId || channelId === 'undefined') return showToast('⚠️ 请先搜索成员，或手动输入房间 Channel ID');
            if (isFetchingRoomAlbum) return;

            isFetchingRoomAlbum = true;

            if (!isLoadMore) {
                currentRoomAlbumNextTime = 0;
                container.innerHTML = '<div class="empty-state">正在抓取房间相册...</div>';
                container.className = '';
                if (statusEl) statusEl.innerText = '';
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-room-album', {
                    token, pa, channelId, nextTime: currentRoomAlbumNextTime
                });

                if (res.success && res.content) {
                    console.log('房间相册 API 返回数据:', res.content);

                    let list = [];
                    if (Array.isArray(res.content)) {
                        list = res.content;
                    } else if (typeof res.content === 'object' && res.content !== null) {
                        list = res.content.messageList || res.content.message || res.content.data || [];
                        if (list.length === 0) {
                            for (let key in res.content) {
                                if (Array.isArray(res.content[key])) {
                                    list = res.content[key];
                                    break;
                                }
                            }
                        }
                    }

                    if (res.content.nextTime !== undefined) {
                        currentRoomAlbumNextTime = res.content.nextTime;
                    }

                    if (!isLoadMore) container.innerHTML = '';

                    if (!list || list.length === 0) {
                        if (!isLoadMore) container.innerHTML = '<div class="empty-state">该房间暂无照片/视频记录</div>';
                        if (statusEl && !isRoomAlbumAutoLoading) statusEl.innerText = '已到底部';
                    } else {
                        if (!isLoadMore) container.className = 'photo-card-grid';

                        renderRoomAlbumItems(list, container);

                        const totalCount = container.querySelectorAll('.photo-nft-card').length;

                        if (!currentRoomAlbumNextTime || currentRoomAlbumNextTime === 0) {
                            if (statusEl && !isRoomAlbumAutoLoading) statusEl.innerText = `共获取 ${totalCount} 条 (已到底部)`;
                        } else {
                            if (statusEl) statusEl.innerText = `已获取 ${totalCount} 条...`;
                        }
                    }
                } else {
                    if (!isLoadMore) container.innerHTML = `<div class="placeholder-tip"><h3>❌ 加载失败</h3><p>${res.msg}</p></div>`;
                }
            } catch (e) {
                if (!isLoadMore) container.innerHTML = `<div class="placeholder-tip"><h3>❌ 发生错误</h3><p>${e.message}</p></div>`;
            } finally {
                isFetchingRoomAlbum = false;
            }
        }

        function getOptimizedThumbUrl(url) {
            if (!url) return '';
            if (url.includes('.mp4') || url.includes('.MOV') || url.includes('.aac') || url.includes('.mp3')) return url;
            const sep = url.includes('?') ? '&' : '?';
            return url + sep + 'imageView&thumbnail=500x0';
        }

        const albumVideoObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const video = entry.target;
                    if (!video.src && video.dataset.src) {
                        video.src = video.dataset.src;
                        video.preload = 'metadata';
                    }
                    observer.unobserve(video);
                }
            });
        }, { rootMargin: '300px' });

        function renderRoomAlbumItems(list, container) {
            const memberName = document.getElementById('room-album-member-input').value || '成员';

            list.forEach(item => {
                let bodyObj = {};
                try {
                    if (typeof item.bodys === 'string') {
                        let cleanBodys = item.bodys.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                        if (cleanBodys.startsWith('"') && cleanBodys.endsWith('"')) {
                            cleanBodys = cleanBodys.substring(1, cleanBodys.length - 1);
                        }
                        bodyObj = JSON.parse(cleanBodys);
                    } else {
                        bodyObj = item.bodys || {};
                    }
                } catch (e) {
                    return;
                }

                const card = document.createElement('div');
                card.className = 'photo-nft-card';

                const isVideo = item.sourceType === 'VIDEO';
                const safeUrl = bodyObj.url || '';
                if (!safeUrl) return;

                const ext = bodyObj.ext || (isVideo ? 'mp4' : 'jpg');
                const dlFilename = `【${memberName}】房间记录_${item.createTime || Date.now()}.${ext}`;

                let dateStr = '未知时间';
                if (item.createTime) {
                    const d = new Date(Number(item.createTime));
                    const pad = (n) => String(n).padStart(2, '0');
                    dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                }

                const downloadIcon = `
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>保存
        `;

                const mediaContainer = document.createElement('div');

                mediaContainer.style.cssText = 'aspect-ratio: 1 / 1; width: 100%; display: flex; align-items: center; justify-content: center; background: var(--input-bg); border-bottom: 1px solid var(--border); overflow: hidden; position: relative;';

                if (isVideo) {
                    mediaContainer.innerHTML = `
                <video data-src="${safeUrl}#t=0.1" preload="none" 
                       style="width: 100%; height: 100%; object-fit: cover; background: #000; transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);"></video>
                
                <div class="album-video-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.15); cursor: pointer; transition: opacity 0.3s;">
                    <div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.5); color: white; font-size: 11px; padding: 2px 6px; border-radius: 4px; backdrop-filter: blur(4px);">🎬 视频</div>
                    <div class="album-play-btn" style="width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.25); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.6); box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="white" style="margin-left: 4px;"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
            `;

                    const overlay = mediaContainer.querySelector('.album-video-overlay');
                    const playBtn = mediaContainer.querySelector('.album-play-btn');
                    const videoEl = mediaContainer.querySelector('video');

                    if (typeof albumVideoObserver !== 'undefined') {
                        albumVideoObserver.observe(videoEl);
                    }

                    overlay.onmouseenter = () => {
                        playBtn.style.transform = 'scale(1.15)';
                        playBtn.style.background = 'var(--primary)';
                        playBtn.style.borderColor = 'var(--primary)';
                        videoEl.style.transform = 'scale(1.05)';
                    };
                    overlay.onmouseleave = () => {
                        playBtn.style.transform = 'scale(1)';
                        playBtn.style.background = 'rgba(255,255,255,0.25)';
                        playBtn.style.borderColor = 'rgba(255,255,255,0.6)';
                        videoEl.style.transform = 'scale(1)';
                    };

                    overlay.onclick = (e) => {
                        e.stopPropagation();
                        if (!videoEl.src) videoEl.src = videoEl.dataset.src;

                        overlay.style.opacity = '0';
                        overlay.style.pointerEvents = 'none';
                        videoEl.style.transform = 'scale(1)';
                        videoEl.style.objectFit = 'contain';
                        videoEl.controls = true;

                        if (typeof currentPlayingVideo !== 'undefined' && currentPlayingVideo && currentPlayingVideo !== videoEl) {
                            currentPlayingVideo.pause();
                        }
                        if (typeof currentPlayingAudio !== 'undefined' && currentPlayingAudio) {
                            currentPlayingAudio.pause();
                        }
                        currentPlayingVideo = videoEl;
                        videoEl.play();
                    };
                } else {
                    const thumbUrl = typeof getOptimizedThumbUrl === 'function' ? getOptimizedThumbUrl(safeUrl) : safeUrl;
                    mediaContainer.innerHTML = `<img src="${thumbUrl}" loading="lazy" decoding="async" onclick="openImageModal('${safeUrl}')" style="width: 100%; height: 100%; object-fit: cover; object-position: center; cursor: zoom-in; transition: transform 0.3s;">`;
                    const imgEl = mediaContainer.querySelector('img');
                    imgEl.onmouseenter = () => imgEl.style.transform = 'scale(1.05)';
                    imgEl.onmouseleave = () => imgEl.style.transform = 'scale(1)';
                }

                const infoContainer = document.createElement('div');
                infoContainer.style.padding = '12px';

                const senderName = item.starName || memberName;

                infoContainer.innerHTML = `
            <div style="font-size: 13px; font-weight: bold; color: var(--text); margin-bottom: 2px;">
                ${senderName}
            </div>
            <div style="font-size: 11px; color: var(--text-sub); margin-bottom: 10px;">${dateStr}</div>
            
            <div>
                <button class="btn btn-secondary btn-full album-single-dl-btn" data-url="${safeUrl}" data-filename="${dlFilename}" style="height: 30px; font-size: 12px; border-radius: 6px;" onclick="downloadMediaFileIconMode('${safeUrl}', '${dlFilename}', this, this.innerHTML, 'media', '【房间相册】${memberName}')">
                    ${downloadIcon}
                </button>
            </div>
        `;

                card.appendChild(mediaContainer);
                card.appendChild(infoContainer);
                container.appendChild(card);
            });
        }

        function renderProfile(data, container) {
            const info = data.starInfo || data;

            const photos = [];
            if (info.fullPhoto1) photos.push(info.fullPhoto1);
            if (info.fullPhoto2) photos.push(info.fullPhoto2);
            if (info.fullPhoto3) photos.push(info.fullPhoto3);
            if (info.fullPhoto4) photos.push(info.fullPhoto4);

            const photosHtml = photos.map(url => {
                const safeUrl = url.startsWith('http') ? url : 'https://source.48.cn' + url;
                return `<img src="${safeUrl}" style="width:100%; border-radius:8px; margin-bottom:10px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">`;
            }).join('');

            let historyHtml = '';
            const historyList = data.fullHistory || data.history;

            if (historyList && historyList.length > 0) {
                const historyItems = historyList.map(h => {
                    const dateStr = h.showTime || h.ctime;
                    return `
            <div style="margin-bottom: 6px; display: flex; align-items: baseline;">
                <span style="color: var(--primary); font-weight:bold; font-size:12px; margin-right:12px; min-width:85px; text-align: right;">${dateStr}</span>
                <span style="color: var(--text); flex: 1; word-break: break-word;">${h.content}</span>
            </div>`;
                }).join('');

                historyHtml = `
            <div style="margin-top:20px; padding-top:15px; border-top:1px dashed var(--border);">
                <div style="font-weight: bold; font-size: 15px; margin-bottom: 10px; color: var(--text);">成员编年史</div>
                <div style="font-size:13px; line-height: 1.6; background: var(--input-bg); padding: 12px; border-radius: 8px;">
                    ${historyItems}
                </div>
            </div>
            `;
            }

            const displayName = info.starName || info.nickname;
            const htmlContent = `
            <div class="Box-row" style="margin-bottom: 20px;">
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 15px; border-left: 4px solid var(--primary); padding-left: 10px;">
                ${displayName} <span style="font-size:14px; color:var(--text-sub); font-weight:normal;">(${info.pinyin || ''})</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px; color: var(--text);">
                <div><strong>昵称:</strong> ${info.nickname || '-'}</div>
                <div><strong>身高:</strong> ${info.height || '-'} cm</div>
                <div><strong>血型:</strong> ${info.bloodType || '-'}</div>
                <div><strong>出生地:</strong> ${info.birthplace || '-'}</div>
                <div><strong>生日:</strong> ${info.birthday || '-'}</div>
                <div><strong>星座:</strong> ${info.constellation || '-'}</div>
                <div><strong>所属队伍:</strong> ${info.starTeamName || '-'}</div>
                <div><strong>加入期数:</strong> ${info.periodName || '-'}</div>
                <div><strong>入团时间:</strong> ${info.joinTime || '-'}</div>             
                <div><strong>特长:</strong> ${info.specialty || '-'}</div>
            </div>
            <div style="margin-top: 10px; font-size: 14px; color: var(--text);">
                <strong>爱好:</strong> ${info.hobbies || '-'}
            </div>

            ${historyHtml}
        </div>

        <div style="margin-top: 25px; margin-bottom: 15px; font-weight: bold; font-size: 16px; border-left: 4px solid var(--primary); padding-left: 10px; color: var(--text);">
            公式照
        </div>

        <div style="column-count: 2; column-gap: 15px;">
            ${photosHtml}
        </div>
    `;

            container.innerHTML = htmlContent;
        }

        let openLiveNextTime = 0;

        function handleOpenLiveSearch(keyword) {
            const resultBox = document.getElementById('openlive-search-results');
            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }
            if (!window.isMemberDataLoaded && typeof loadMemberData === 'function') loadMemberData();

            const lowerKw = keyword.toLowerCase();

            let matches = memberData.filter(m => {
                const matchName = m.ownerName.includes(keyword);
                const pinyin = m.pinyin || "";
                const matchPinyin = pinyin.toLowerCase().includes(lowerKw);
                const initials = getPinyinInitials(pinyin);
                const matchInitials = initials.toLowerCase().includes(lowerKw);
                return matchName || matchPinyin || matchInitials;
            });

            matches.sort(memberSortLogic);

            if (matches.length > 0) {
                const html = matches.map(m => {
                    const isInactive = m.isInGroup === false;
                    const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';

                    let colorStyle = '';
                    if (typeof getTeamStyle === 'function') {
                        colorStyle = getTeamStyle(m.team, isInactive);
                    }

                    return `<div class="suggestion-item" 
                 onclick="selectOpenLiveMember('${m.ownerName}', '${m.id || m.userId}')"
                 style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight:bold; ${baseStyle}">${m.ownerName}</span>
                <span class="team-tag" style="${baseStyle} ${colorStyle}">${m.team}</span>
            </div>`;
                }).join('');
                resultBox.innerHTML = html;
                resultBox.style.display = 'block';
            } else {
                resultBox.style.display = 'none';
            }
        }

        function selectOpenLiveMember(name, userId) {
            document.getElementById('openlive-member-input').value = name;
            document.getElementById('openlive-member-id').value = userId;
            document.getElementById('openlive-search-results').style.display = 'none';
        }

        async function fetchOpenLiveList(isLoadMore) {
            const container = document.getElementById('openlive-list-container');
            const loadMoreBtn = document.getElementById('openlive-load-more');
            const memberId = document.getElementById('openlive-member-id').value;
            const token = appToken || localStorage.getItem('yaya_p48_token');
            const statusEl = document.getElementById('openlive-status');

            if (!token) {
                if (statusEl) statusEl.innerHTML = '<span style="color:red">⚠️ 请先登录账号</span>';
                return;
            }
            if (!memberId) {
                if (statusEl) statusEl.innerHTML = '<span style="color:red">⚠️ 请先搜索并选择成员</span>';
                return;
            }

            if (!isLoadMore) {
                openLiveNextTime = 0;
                container.innerHTML = '<div class="empty-state">正在加载...</div>';
                loadMoreBtn.style.display = 'none';
                if (statusEl) statusEl.innerText = '';
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-open-live', {
                    token,
                    pa,
                    memberId,
                    nextTime: openLiveNextTime
                });

                if (res.success && res.content) {
                    const list = res.content.message || [];
                    openLiveNextTime = res.content.nextTime;

                    if (!isLoadMore) container.innerHTML = '';

                    if (list.length === 0) {
                        if (!isLoadMore) container.innerHTML = '<div class="empty-state">未找到相关记录</div>';
                        loadMoreBtn.style.display = 'none';
                        return;
                    }

                    renderOpenLiveItems(list, container);

                    const totalCount = container.querySelectorAll('.vod-card-row').length;
                    if (statusEl) statusEl.innerText = `共 ${totalCount} 场`;

                    if (openLiveNextTime && openLiveNextTime !== 0 && !isOpenLiveAutoLoading) {
                        loadMoreBtn.style.display = 'block';
                    } else {
                        loadMoreBtn.style.display = 'none';
                    }
                } else {
                    if (!isLoadMore) container.innerHTML = `<div class="placeholder-tip"><h3>❌ 加载失败</h3><p>${res.msg}</p></div>`;
                }
            } catch (e) {
                console.error(e);
                if (!isLoadMore) container.innerHTML = `<div class="placeholder-tip"><h3>❌ 发生错误</h3><p>${e.message}</p></div>`;
            }
        }


        let isOpenLiveAutoLoading = false;
        async function fetchAllOpenLive() {
            const btn = document.getElementById('btn-openlive-all');

            if (isOpenLiveAutoLoading) {
                isOpenLiveAutoLoading = false;
                btn.innerText = '加载全部';
                btn.style.background = '';
                btn.style.color = '';
                return;
            }

            const memberId = document.getElementById('openlive-member-id').value;
            if (!memberId) {
                if (statusEl) statusEl.innerHTML = '<span style="color:red">⚠️ 请先搜索并选择成员</span>';
                return;
            }

            isOpenLiveAutoLoading = true;
            btn.innerText = '停止加载';
            btn.style.background = '#ff4d4f';
            btn.style.color = 'white';

            if (openLiveNextTime === 0) {
                await fetchOpenLiveList(false);
            }

            while (isOpenLiveAutoLoading) {
                if (!openLiveNextTime || openLiveNextTime === 0 || openLiveNextTime === '0') {
                    break;
                }

                const prevTime = openLiveNextTime;

                await fetchOpenLiveList(true);

                await new Promise(r => setTimeout(r, 50));

                if (openLiveNextTime === prevTime && openLiveNextTime !== 0) {
                    console.warn("游标未更新，强制停止");
                    break;
                }
            }

            isOpenLiveAutoLoading = false;
            btn.innerText = '加载全部';
            btn.style.background = '';
            btn.style.color = '';

            const statusEl = document.getElementById('openlive-status');
            if (statusEl && (!openLiveNextTime || openLiveNextTime === 0)) {
                statusEl.innerHTML += ' <span style="font-size:12px; color:#28a745">(已加载全部)</span>';
            }
        }

        function renderOpenLiveItems(list, container) {
            list.forEach(item => {
                const msgId = item.msgidClient || item.msgId;
                if (document.getElementById(`openlive-card-${msgId}`)) return;

                let info = {};
                try {
                    const safeExtInfo = item.extInfo.replace(/:\s*([0-9]{16,})/g, ': "$1"');
                    info = JSON.parse(safeExtInfo);
                } catch (e) {
                    try { info = JSON.parse(item.extInfo); } catch (err) { return; }
                }

                const title = info.title || '未知公演';
                const liveId = info.liveId || info.id;
                const nickname = info.user ? info.user.nickname : '';

                let cover = './icon.png';
                if (info.coverUrl) {
                    cover = info.coverUrl.startsWith('http') ? info.coverUrl : `https://source.48.cn${info.coverUrl}`;
                }

                const d = new Date(item.msgTime);
                const offset = d.getTimezoneOffset() * 60000;
                const utcTime = d.getTime() + offset;
                const bjTime = new Date(utcTime + 3600000 * 8);
                const timeStr = `${bjTime.getFullYear()}-${String(bjTime.getMonth() + 1).padStart(2, '0')}-${String(bjTime.getDate()).padStart(2, '0')} ${String(bjTime.getHours()).padStart(2, '0')}:${String(bjTime.getMinutes()).padStart(2, '0')}`;

                const card = document.createElement('div');
                card.className = 'vod-card-row';
                card.style.marginBottom = '10px';
                card.style.cursor = 'pointer';
                card.id = `openlive-card-${msgId}`;

                card.innerHTML = `
            <div class="vod-row-cover-container">
                <img src="${cover}" class="vod-row-cover" loading="lazy"
                     title="点击调用外部播放器播放"
                     style="cursor: pointer;"
                     onclick="openOpenLiveInPotPlayer(event, '${liveId}')">
            </div>
            <div class="vod-row-info">
                <div class="vod-row-name" style="white-space: normal; line-height: 1.4; margin-bottom: 2px;">
                    ${title}
                </div>
                <div style="font-size: 13px; color: var(--text-sub);">
                    ${nickname}
                </div>
                <div class="vod-row-time" style="color:#999; font-size:12px; margin-top: auto;">
                    ${timeStr}
                </div>
            </div>
        `;

                card.onclick = (e) => {
                    if (!liveId) return;
                    playOpenLiveVideo(liveId, title, nickname, item.msgTime);
                };

                container.appendChild(card);
            });
        }

        async function playOpenLiveVideo(liveId, title, nickname, startTime) {
            const giftContainer = document.getElementById('live-gift-container');
            if (giftContainer) {
                giftContainer.style.display = 'none';
            }
            document.getElementById('view-open-live').style.display = 'none';
            const mediaView = document.getElementById('view-media');
            mediaView.style.display = 'flex';
            mediaView.style.flexDirection = 'column';

            document.getElementById('media-list-controls').style.display = 'none';
            document.getElementById('vod-pagination-controls').style.display = 'none';
            document.getElementById('media-list-area').style.display = 'none';

            const liveControls = document.getElementById('live-list-controls');
            if (liveControls) liveControls.style.display = 'none';

            returnToOpenLive = true;

            const playerView = document.getElementById('live-player-view');
            playerView.style.display = 'flex';
            const authorEl = document.getElementById('current-live-author');
            if (authorEl) authorEl.textContent = nickname || '未知成员';

            const sectionTitle = document.getElementById('live-view-title');
            if (sectionTitle) {
                sectionTitle.textContent = '剧场公演';
            }

            const titleEl = document.getElementById('current-live-title');
            const dateEl = document.getElementById('current-live-date');
            const timeEl = document.getElementById('current-live-time');

            if (titleEl) titleEl.textContent = title;

            if (startTime) {
                const d = new Date(Number(startTime));
                const offset = d.getTimezoneOffset() * 60000;
                const utcTime = d.getTime() + offset;
                const bjTime = new Date(utcTime + 3600000 * 8);
                const pad = (n) => String(n).padStart(2, '0');

                if (dateEl) dateEl.textContent = `${bjTime.getFullYear()}-${pad(bjTime.getMonth() + 1)}-${pad(bjTime.getDate())}`;
                if (timeEl) timeEl.textContent = `${pad(bjTime.getHours())}:${pad(bjTime.getMinutes())}:${pad(bjTime.getSeconds())}`;
            } else {
                if (dateEl) dateEl.textContent = '';
                if (timeEl) timeEl.textContent = '';
            }

            currentPlayingItem = { liveId, title, nickname, startTime };

            resetClipTool();

            try {
                const token = appToken || localStorage.getItem('yaya_p48_token');
                const pa = window.getPA ? window.getPA() : null;

                const res = await ipcRenderer.invoke('fetch-open-live-one', { token, pa, liveId });

                if (res.success && res.content && res.content.playStreams) {
                    let streamUrl = '';
                    const highQuality = res.content.playStreams.find(s => s.streamType === 2);
                    streamUrl = highQuality ? highQuality.streamPath : res.content.playStreams[0].streamPath;

                    if (streamUrl) {
                        renderDanmuListUI([]);
                        startPlayer(streamUrl, title, false, null, []);
                    } else {
                        console.warn(`[播放失败] liveId:${liveId} 无可用流`);
                    }
                } else {
                    console.warn(`[API获取失败] ${res.msg}`);
                }
            } catch (e) {
                console.error('[网络/系统错误]', e);
            }
        }

        function getGroupCode(memberId, teamName, nickname) {
            if (window.memberData && memberId) {
                const m = window.memberData.find(x => x.id == memberId || x.userId == memberId);
                if (m && m.team) {
                    const t = m.team.toUpperCase();
                    if (t.includes('GNZ')) return 'gnz';
                    if (t.includes('BEJ')) return 'bej';
                    if (t.includes('CKG')) return 'ckg';
                    if (t.includes('CGT')) return 'cgt';
                    if (t.includes('IDFT')) return 'idft';
                    if (t.includes('SNH')) return 'snh';
                }
            }

            if (teamName) {
                const t = teamName.toUpperCase();
                if (t.includes('GNZ') || t.includes('TEAM G') || t.includes('NIII') || t.includes('TEAM Z')) return 'gnz';
                if (t.includes('BEJ') || t.includes('TEAM B') || t.includes('TEAM E') || t.includes('TEAM J')) return 'bej';
                if (t.includes('CKG') || t.includes('TEAM C') || t.includes('TEAM K')) return 'ckg';
                if (t.includes('CGT') || t.includes('CII') || t.includes('GII')) return 'cgt';
                if (t.includes('IDFT')) return 'idft';
                if (t.includes('SNH')) return 'snh';
            }

            if (nickname) {
                const n = nickname.toUpperCase();
                if (n.startsWith('GNZ')) return 'gnz';
                if (n.startsWith('BEJ')) return 'bej';
                if (n.startsWith('CKG')) return 'ckg';
                if (n.startsWith('CGT')) return 'cgt';
            }

            return 'snh';
        }

        function getCompactDate(timestamp) {
            const d = new Date(Number(timestamp));
            const offset = d.getTimezoneOffset() * 60000;
            const utcTime = d.getTime() + offset;
            const beijingTime = new Date(utcTime + 3600000 * 8);

            const y = beijingTime.getFullYear();
            const m = String(beijingTime.getMonth() + 1).padStart(2, '0');
            const day = String(beijingTime.getDate()).padStart(2, '0');
            return `${y}${m}${day}`;
        }
        async function openOpenLiveInPotPlayer(e, liveId) {
            e.stopPropagation();

            const imgEl = e.target;
            const originalCursor = imgEl.style.cursor;
            imgEl.style.cursor = 'wait';

            try {
                const token = appToken || localStorage.getItem('yaya_p48_token');
                const pa = window.getPA ? window.getPA() : null;

                const res = await ipcRenderer.invoke('fetch-open-live-one', { token, pa, liveId });

                if (res.success && res.content && res.content.playStreams) {
                    let streamUrl = '';
                    const highQuality = res.content.playStreams.find(s => s.streamType === 2);
                    streamUrl = highQuality ? highQuality.streamPath : res.content.playStreams[0].streamPath;

                    if (streamUrl) {
                        const opened = await openMediaInExternalPlayer(streamUrl, { silent: true });
                        if (!opened) {
                            showToast(`未找到可用的 ${getPreferredExternalPlayerName()}`);
                        }
                    } else {
                        console.warn('[外部播放器] 未找到流地址');
                    }
                } else {
                    console.warn('[外部播放器] API返回错误:', res.msg);
                }
            } catch (err) {
                console.error('[外部播放器] 调用异常:', err);
            } finally {
                imgEl.style.cursor = originalCursor;
            }
        }

        function handleDanmuSearch(keyword) {
            const term = keyword.trim().toLowerCase();
            const list = currentTimelineMode === 'danmu' ? currentDanmuList : currentSubtitleList;

            let termPinyin = term;
            if (window.pinyinPro && term) {
                termPinyin = pinyinPro.pinyin(term, { toneType: 'none', type: 'array' }).join('').toLowerCase();
            }

            list.forEach((item, index) => {
                const row = document.getElementById(`dm-row-${index}`);
                if (row) {
                    const text = (item.text || '').toLowerCase();
                    const name = (item.name || '').toLowerCase();

                    let isMatch = text.includes(term) || name.includes(term);

                    if (!isMatch && window.pinyinPro && term) {

                        if (item._pinyinText === undefined) {
                            item._pinyinText = pinyinPro.pinyin(text, { toneType: 'none', type: 'array' }).join('').toLowerCase();
                        }
                        if (item._pinyinName === undefined) {
                            item._pinyinName = pinyinPro.pinyin(name, { toneType: 'none', type: 'array' }).join('').toLowerCase();
                        }

                        const textPinyin = item._pinyinText || '';
                        const namePinyin = item._pinyinName || '';

                        if (textPinyin.includes(termPinyin) || namePinyin.includes(termPinyin)) {
                            isMatch = true;
                        }
                    }

                    if (isMatch) {
                        row.style.display = 'flex';
                    } else {
                        row.style.display = 'none';
                    }
                }
            });
        }

        let currentDanmuList = [];
        let currentSubtitleList = [];
        let currentTimelineMode = 'danmu';
        let currentSubtitleUrl = '';



        function parseSRT(srtText) {
            const result = [];
            if (!srtText || typeof srtText !== 'string') return result;

            const pattern = "(\\d{1,2}:\\d{1,2}:\\d{1,2}[,.]\\d{1,3})\\s*-->\\s*(\\d{1,2}:\\d{1,2}:\\d{1,2}[,.]\\d{1,3})";
            const timeRegex = new RegExp(pattern);
            const normalizedText = srtText.replace(/(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3}\s*-->)/g, '\n$1');
            const lines = normalizedText.split('\n');

            let currentItem = null;

            const parseTime = (str) => {
                const parts = str.replace(',', '.').split(':');
                return (+parts[0]) * 3600 + (+parts[1]) * 60 + parseFloat(parts[2]);
            };

            const formatVTT = (t) => {
                let s = t.replace(',', '.');
                return s.split(':')[0].length === 1 ? '0' + s : s;
            };

            for (let line of lines) {
                line = line.trim();
                if (!line) continue;

                const timeMatch = line.match(timeRegex);
                if (timeMatch) {
                    if (currentItem) result.push(currentItem);

                    const startStr = timeMatch[1];
                    const endStr = timeMatch[2];

                    currentItem = {
                        time: parseTime(startStr),
                        endTime: parseTime(endStr),
                        vttStart: formatVTT(startStr),
                        vttEnd: formatVTT(endStr),
                        text: '',
                        name: '字幕'
                    };
                } else if (currentItem) {
                    if (/^\d+$/.test(line)) continue;
                    currentItem.text += (currentItem.text ? ' ' : '') + line;
                }
            }

            if (currentItem) result.push(currentItem);

            return result.map(item => {
                item.text = item.text.replace(/\s+\d+$/, '').trim();
                return item;
            });
        }
        const COS_BASE_URL = `${DATA_BASE_URL}/subtitles`;

        function getSubtitleGroupPrefix(item, nickname) {
            const memberId =
                item?.userInfo?.userId ||
                item?.userInfo?.id ||
                item?.userId ||
                item?.id ||
                '';
            const teamName =
                item?.userInfo?.teamName ||
                item?.teamName ||
                '';

            const code = getGroupCode(memberId, teamName, nickname);
            const prefixMap = {
                snh: 'SNH48',
                gnz: 'GNZ48',
                bej: 'BEJ48',
                ckg: 'CKG48',
                cgt: 'CGT48',
                idft: 'IDFT'
            };

            if (window.memberData && nickname) {
                const member = window.memberData.find(m =>
                    String(m.ownerName || '').trim() === String(nickname || '').trim() ||
                    String(m.id || '') === String(memberId || '') ||
                    String(m.userId || '') === String(memberId || '')
                );

                const explicitGroup = String(member?.groupName || '').trim();
                if (explicitGroup) return explicitGroup;
            }

            return prefixMap[code] || '';
        }

        function getSubtitleFolderCandidates(item, nickname) {
            const candidates = [];
            const seen = new Set();
            const pushCandidate = (value) => {
                const normalized = String(value || '').trim();
                if (!normalized || seen.has(normalized)) return;
                seen.add(normalized);
                candidates.push(normalized);
            };

            const groupPrefix = getSubtitleGroupPrefix(item, nickname);
            const cleanNickname = String(nickname || '').trim();

            pushCandidate(cleanNickname);
            if (groupPrefix) {
                pushCandidate(`${groupPrefix}-${cleanNickname}`);
            }

            if (window.memberData && cleanNickname) {
                const member = window.memberData.find(m =>
                    String(m.ownerName || '').trim() === cleanNickname ||
                    String(m.nickname || '').trim() === cleanNickname
                );
                if (member) {
                    const memberGroup = String(member.groupName || groupPrefix || '').trim();
                    if (memberGroup) {
                        pushCandidate(`${memberGroup}-${cleanNickname}`);
                    }
                }
            }

            return candidates;
        }

        async function fetchCosSubtitle(nickname, rawT, item = null) {
            if (!nickname || !rawT) return null;

            const d = new Date(Number(rawT));
            const offset = d.getTimezoneOffset() * 60000;
            const utcTime = d.getTime() + offset;
            const bjTime = new Date(utcTime + 3600000 * 8);

            const pad = (n) => String(n).padStart(2, '0');
            const fTimestamp = `${bjTime.getFullYear()}${pad(bjTime.getMonth() + 1)}${pad(bjTime.getDate())}_${pad(bjTime.getHours())}.${pad(bjTime.getMinutes())}.${pad(bjTime.getSeconds())}`;

            const fileName = `【${nickname}】${fTimestamp}.srt`;
            const folderCandidates = getSubtitleFolderCandidates(item, nickname);

            for (const folderName of folderCandidates) {
                const srtUrl = `${COS_BASE_URL}/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`;

                console.log(`🔍 [字幕请求] 正在从云端获取: ${folderName}/${fileName}`);

                try {
                    const res = await fetch(`${srtUrl}?t=${Date.now()}`);

                    if (res.ok) {
                        const text = await res.text();
                        console.log(`✅ [字幕加载成功] 来源于云端: ${folderName}`);
                        return { text, url: srtUrl, fileName };
                    }

                    console.log(`⚠️ [字幕提示] 云端未找到: ${folderName}/${fileName} (${res.status})`);
                } catch (err) {
                    console.error(`❌ [字幕请求错误] ${folderName}/${fileName}:`, err.message);
                }
            }

            return null;
        }

        function renderDanmuListUI(danmuData) {
            const wrapper = document.getElementById('danmu-timeline-wrapper');
            const container = document.getElementById('danmu-list-body');

            lastActiveIndex = -1;
            currentDanmuList = danmuData || [];
            currentSubtitleList = [];
            currentTimelineMode = 'danmu';
            currentSubtitleUrl = '';

            if (!wrapper || !container) return;
            if (currentMode === 'live') {
                wrapper.style.display = 'none';
                return;
            }

            wrapper.style.display = 'flex';

            const headerDiv = wrapper.firstElementChild;
            headerDiv.innerHTML = `
                <div style="display: flex; gap: 15px; align-items: center;">
                    <span id="tab-danmu" onclick="switchTimelineMode('danmu')" style="cursor:pointer; font-weight:bold; color:var(--primary); transition:all 0.2s; user-select:none;">弹幕</span>
                    <span style="width:1px; height:18px; background:var(--border); opacity:0.9; display:inline-block;"></span>
                    <span id="tab-subtitle" onclick="switchTimelineMode('subtitle')" style="cursor:pointer; font-weight:normal; color:var(--text-sub); transition:all 0.2s; user-select:none;">字幕</span>
                </div>
                <div style="display: flex; flex: 1; align-items: center;">
                    <input type="text" id="danmu-search-input" class="input-control" placeholder="搜索内容 / 发送者" style="flex: 1; height: 26px; font-size: 12px; padding: 0 8px; margin-left: 10px;" oninput="handleDanmuSearch(this.value)">
                    <button id="btn-danmu-analysis" class="btn btn-secondary" onclick="openDanmuAnalysis()" style="height: 26px; padding: 0 10px; font-size: 12px; margin-left: 10px;">统计</button>
                    <span id="danmu-count-display" style="font-weight:normal; font-size:12px; color:var(--text-sub); white-space: nowrap; margin-left: 10px;"></span>
                </div>
            `;

            refreshTimelineListUI();

            if (currentPlayingItem && (currentPlayingItem.startTime || currentPlayingItem.ctime)) {
                const nickname = currentPlayingItem.userInfo ? currentPlayingItem.userInfo.nickname : (currentPlayingItem.nickname || '');
                const rawT = currentPlayingItem.startTime || currentPlayingItem.ctime;

                if (nickname) {
                    fetchCosSubtitle(nickname, rawT, currentPlayingItem).then(res => {
                        if (res && res.text) {
                            currentSubtitleUrl = res.url;
                            currentSubtitleList = parseSRT(res.text);

                            let cleanVttContent = "WEBVTT\n\n";
                            currentSubtitleList.forEach(item => {
                                cleanVttContent += `${item.vttStart} --> ${item.vttEnd}\n${item.text}\n\n`;
                            });

                            const blob = new Blob([cleanVttContent], { type: 'text/vtt;charset=utf-8' });
                            const url = URL.createObjectURL(blob);

                            if (art && art.subtitle) {
                                art.subtitle.switch(url, { type: 'vtt', name: '云端字幕' });
                            }
                            if (currentTimelineMode === 'subtitle') refreshTimelineListUI();
                        }
                    });
                }
            }
        }

        window.switchTimelineMode = function (mode) {
            currentTimelineMode = mode;
            const tabDanmu = document.getElementById('tab-danmu');
            const tabSubtitle = document.getElementById('tab-subtitle');

            const analysisBtn = document.getElementById('btn-danmu-analysis');
            const searchInput = document.getElementById('danmu-search-input');

            if (mode === 'danmu') {
                tabDanmu.style.color = 'var(--primary)';
                tabDanmu.style.fontWeight = 'bold';
                tabSubtitle.style.color = 'var(--text-sub)';
                tabSubtitle.style.fontWeight = 'normal';

                if (analysisBtn) analysisBtn.style.display = 'inline-flex';
                if (searchInput) searchInput.placeholder = '搜索内容 / 发送者';
            } else {
                tabSubtitle.style.color = 'var(--primary)';
                tabSubtitle.style.fontWeight = 'bold';
                tabDanmu.style.color = 'var(--text-sub)';
                tabDanmu.style.fontWeight = 'normal';

                if (analysisBtn) analysisBtn.style.display = 'none';
                if (searchInput) searchInput.placeholder = '搜索字幕内容';
            }
            lastActiveIndex = -1;
            refreshTimelineListUI();
        }

        function refreshTimelineListUI() {
            const container = document.getElementById('danmu-list-body');
            const countDisplay = document.getElementById('danmu-count-display');
            const searchInput = document.getElementById('danmu-search-input');
            const wrapper = document.getElementById('danmu-timeline-wrapper');
            if (searchInput) searchInput.value = '';

            const list = currentTimelineMode === 'danmu' ? currentDanmuList : currentSubtitleList;

            if (!document.getElementById('col-resize-style')) {
                const style = document.createElement('style');
                style.id = 'col-resize-style';
                style.innerHTML = `
                    .resizable-col { position: relative; }
                    .col-resizer { 
                        position: absolute; top: 0; right: -5px; width: 10px; height: 100%; 
                        cursor: col-resize; z-index: 10; background: transparent;
                    }
                    .col-resizer::after {
                        content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
                        width: 2px; height: 100%; background-color: var(--primary); opacity: 0;
                        transition: opacity 0.15s, box-shadow 0.15s; border-radius: 1px;
                    }
                    .col-resizer:hover::after, .col-resizer.is-resizing::after { 
                        opacity: 1; box-shadow: 0 0 5px var(--primary);
                    }
                `;
                document.head.appendChild(style);
            }

            if (!wrapper.style.getPropertyValue('--col-seq')) {
                wrapper.style.setProperty('--col-seq', '40px');
                wrapper.style.setProperty('--col-time', '95px');
                wrapper.style.setProperty('--col-name', '80px');
                wrapper.style.setProperty('--col-act', '80px');
            }

            const headerDiv = container.previousElementSibling;
            if (headerDiv) {
                headerDiv.style.paddingRight = '6px';

                const createHeaderCol = (title, varName, isFlex = false, isLast = false) => {
                    const wRule = isFlex ? 'flex: 1; padding-left: 15px;' : `width: var(${varName}); flex-shrink: 0; margin-left: ${varName === '--col-seq' ? '0' : '10px'};`;
                    const resizerHtml = (!isFlex && !isLast) ? `<div class="col-resizer" data-var="${varName}"></div>` : '';
                    return `<div class="resizable-col" style="${wRule} text-align: left; font-weight: bold;">${title}${resizerHtml}</div>`;
                };

                if (currentTimelineMode === 'subtitle') {
                    headerDiv.innerHTML =
                        createHeaderCol('序号', '--col-seq') +
                        createHeaderCol('起始时间', '--col-time') +
                        createHeaderCol('字幕内容', null, true) +
                        createHeaderCol('操作', '--col-act', false, true);
                } else {
                    headerDiv.innerHTML =
                        createHeaderCol('序号', '--col-seq') +
                        createHeaderCol('起始时间', '--col-time') +
                        createHeaderCol('发送者', '--col-name') +
                        createHeaderCol('弹幕内容', null, true, true);
                }

                const resizers = headerDiv.querySelectorAll('.col-resizer');
                resizers.forEach(resizer => {
                    resizer.onmousedown = function (e) {
                        e.preventDefault();
                        const varName = this.getAttribute('data-var');
                        const startX = e.pageX;
                        const startWidth = parseFloat(getComputedStyle(wrapper).getPropertyValue(varName));

                        const limits = {
                            '--col-seq': [30, 80],
                            '--col-time': [85, 180],
                            '--col-name': [60, 250]
                        };
                        const [minW, maxW] = limits[varName] || [30, 200];
                        const dynamicMaxW = Math.max(minW, wrapper.clientWidth - 180);
                        const finalMaxW = Math.min(maxW, dynamicMaxW);

                        this.classList.add('is-resizing');
                        document.body.style.cursor = 'col-resize';

                        const onMouseMove = (mv) => {
                            let newWidth = Math.max(minW, Math.min(startWidth + (mv.pageX - startX), finalMaxW));
                            wrapper.style.setProperty(varName, newWidth + 'px');
                        };

                        const onMouseUp = () => {
                            this.classList.remove('is-resizing');
                            document.body.style.cursor = 'default';
                            document.removeEventListener('mousemove', onMouseMove);
                            document.removeEventListener('mouseup', onMouseUp);
                        };

                        document.addEventListener('mousemove', onMouseMove);
                        document.addEventListener('mouseup', onMouseUp);
                    };
                });
            }

            container.innerHTML = '';
            container.scrollTop = 0;
            if (countDisplay) countDisplay.innerText = `共 ${list.length} 条`;

            if (list.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-sub);">${currentTimelineMode === 'subtitle' ? '未在云端找到字幕文件' : '暂无弹幕数据'}</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            list.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'danmu-row';
                div.id = `dm-row-${index}`;
                div.style.cssText = 'display: flex; align-items: center; height: 36px; box-sizing: border-box; padding: 0 15px; border-bottom: 1px solid rgba(0,0,0,0.03);';
                const s = Math.floor(item.time), ms = Math.floor((item.time % 1) * 1000);
                const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
                const pad = (n, w = 2) => String(n).padStart(w, '0');
                const timeStr = `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms, 3)}`;

                const nameHtml = currentTimelineMode === 'subtitle' ? `` :
                    `<div style="width: var(--col-name); margin-left: 10px; text-align: left; font-weight: bold; color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0;" title="${item.name || '???'}">${item.name || '???'}</div>`;

                const endPointTime = (currentTimelineMode === 'subtitle' && item.endTime) ? item.endTime : item.time;

                const actionHtml = currentTimelineMode === 'subtitle' ? `
                    <div style="width: var(--col-act); display: flex; gap: 6px; justify-content: flex-end; align-items: center; flex-shrink: 0; margin-left: 10px; padding-right: 8px;">
                        <button style="border: 1px solid #28a745; background: transparent; color: #28a745; padding: 2px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; transition: all 0.2s;" 
                                onmouseover="this.style.background='#28a745'; this.style.color='#fff'" 
                                onmouseout="this.style.background='transparent'; this.style.color='#28a745'"
                                onclick="event.stopPropagation(); setClipStartFromTimeline(${item.time})">起</button>
                        <button style="border: 1px solid #dc3545; background: transparent; color: #dc3545; padding: 2px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; transition: all 0.2s;" 
                                onmouseover="this.style.background='#dc3545'; this.style.color='#fff'" 
                                onmouseout="this.style.background='transparent'; this.style.color='#dc3545'"
                                onclick="event.stopPropagation(); setClipEndFromTimeline(${endPointTime})">终</button>
                    </div>
                ` : '';

                div.innerHTML = `
                    <div style="width: var(--col-seq); text-align: left; color: var(--text-sub); flex-shrink: 0;">${index + 1}</div>
                    <div style="width: var(--col-time); text-align: left; flex-shrink: 0; margin-left: 10px; color: var(--primary); font-weight: bold;">${timeStr}</div>
                    ${nameHtml}
                    <div title="${item.text}" style="padding-left: 15px; flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text);">${item.text || '&nbsp;'}</div>
                    ${actionHtml}
                `;

                div.onclick = () => {
                    if (art) {
                        const isPlaying = art.playing;

                        art.seek = item.time;

                        if (isPlaying) {
                            art.play();
                        } else {
                            art.pause();
                        }
                    }
                };
                fragment.appendChild(div);
            });
            container.appendChild(fragment);
        }

        let lastActiveIndex = -1;
        function syncDanmuHighlight(currentTime) {
            const list = currentTimelineMode === 'danmu' ? currentDanmuList : currentSubtitleList;
            if (!list || !list.length) return;

            let activeIndex = -1;
            for (let i = 0; i < list.length; i++) {
                if (list[i].time > currentTime) break;
                activeIndex = i;
            }

            if (activeIndex !== lastActiveIndex) {
                if (lastActiveIndex !== -1) {
                    const oldRow = document.getElementById(`dm-row-${lastActiveIndex}`);
                    if (oldRow) oldRow.classList.remove('active');
                }
                if (activeIndex !== -1) {
                    const newRow = document.getElementById(`dm-row-${activeIndex}`);
                    if (newRow) {
                        newRow.classList.add('active');
                        newRow.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                }
                lastActiveIndex = activeIndex;
            }
        }

        let eggClickCount = 0;

        function triggerEasterEgg() {
            eggClickCount++;

            if (eggClickCount === 43) {
                const titleEl = document.getElementById('sidebar-title');
                if (titleEl) {
                    titleEl.innerText = "AY4EVER - yk1z";
                    titleEl.style.color = "#1edfe9";
                }

            }
        }

        function toggleSearchTypeDropdown() {
            const list = document.getElementById('search-type-dropdown');
            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        }

        function selectSearchType(value, text) {
            const hiddenInput = document.getElementById('searchTypeSelect');
            if (hiddenInput) hiddenInput.value = value;

            const displayInput = document.getElementById('search-type-display');
            if (displayInput) displayInput.value = text;

            document.getElementById('search-type-dropdown').style.display = 'none';
            applyFilters();
        }


        let currentFlipPrices = [];

        function handleFlipSendSearch(keyword) {
            const resultBox = document.getElementById('flip-send-search-results');

            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }

            if (!window.isMemberDataLoaded && typeof loadMemberData === 'function') loadMemberData();

            const lowerKw = keyword.toLowerCase();

            let matches = memberData.filter(m => {
                const matchName = m.ownerName.includes(keyword);
                const pinyin = m.pinyin || "";

                let abbr = m.abbr || "";
                if (!abbr && typeof getPinyinInitials === 'function' && pinyin) {
                    abbr = getPinyinInitials(pinyin);
                }

                return matchName ||
                    pinyin.toLowerCase().includes(lowerKw) ||
                    abbr.toLowerCase().includes(lowerKw);
            });

            matches.sort((a, b) => {
                const weightA = (a.isInGroup !== false) ? 1 : 0;
                const weightB = (b.isInGroup !== false) ? 1 : 0;
                return weightB - weightA;
            });

            if (matches.length > 0) {
                const html = matches.slice(0, 10).map(m => {
                    const isInactive = m.isInGroup === false;
                    const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';

                    let colorStyle = '';
                    if (typeof getTeamStyle === 'function') {
                        colorStyle = getTeamStyle(m.team, isInactive);
                    }

                    const teamHtml = m.team ? `<span class="team-tag" style="${baseStyle} ${colorStyle}">${m.team}</span>` : '';

                    return `<div class="suggestion-item" 
                 onclick="selectFlipSendMember('${m.ownerName}', '${m.id || m.userId}')"
                 style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight:bold; ${baseStyle}">${m.ownerName}</span>
                ${teamHtml}
            </div>`;
                }).join('');

                resultBox.innerHTML = html;
                resultBox.style.display = 'block';
            } else {
                resultBox.style.display = 'none';
            }
        }

        function selectFlipSendMember(name, id) {
            document.getElementById('flip-send-member-input').value = name;
            document.getElementById('flip-send-member-id').value = id;
            document.getElementById('flip-send-search-results').style.display = 'none';

            document.getElementById('flip-config-area').style.display = 'none';
            document.getElementById('flip-price-loading').style.display = 'block';
            document.getElementById('flip-send-msg').innerText = '';
            refreshFlipUserBalance();

            fetchFlipPrices(id);
        }

        async function refreshFlipUserBalance() {
            const balanceEl = document.getElementById('flip-user-balance');
            if (!balanceEl) return;

            const token = appToken || localStorage.getItem('yaya_p48_token');
            const pa = window.getPA ? window.getPA() : null;

            if (!token) {
                balanceEl.innerText = '未登录';
                return;
            }

            try {
                const res = await ipcRenderer.invoke('fetch-user-money', { token, pa });

                if (res.success && res.content) {
                    const latestMoney = res.content.moneyTotal || 0;
                    balanceEl.innerText = latestMoney;
                    localStorage.setItem('yaya_p48_money', latestMoney);
                } else {
                    console.error("刷新余额失败:", res.msg);
                }
            } catch (e) {
                console.error("余额请求出错:", e);
            }
        }

        async function fetchFlipPrices(memberId) {
            const token = appToken || localStorage.getItem('yaya_p48_token');
            const pa = window.getPA ? window.getPA() : null;

            try {
                const res = await ipcRenderer.invoke('fetch-flip-prices', { token, pa, memberId });

                document.getElementById('flip-price-loading').style.display = 'none';

                if (res.success && res.content && res.content.customs) {
                    currentFlipPrices = res.content.customs;
                    renderFlipOptions();
                    document.getElementById('flip-config-area').style.display = 'block';
                } else {
                    const msgDiv = document.getElementById('flip-send-msg');
                    msgDiv.innerText = `无法获取配置: ${res.msg || '未知错误'}`;
                    msgDiv.style.color = 'red';
                }
            } catch (e) {
                document.getElementById('flip-price-loading').style.display = 'none';
                const msgDiv = document.getElementById('flip-send-msg');
                msgDiv.innerText = `错误: ${e.message}`;
                msgDiv.style.color = 'red';
            }
        }

        function toggleFlipAnswerDropdown() {
            const list = document.getElementById('flip-answer-dropdown');
            document.getElementById('flip-privacy-dropdown').style.display = 'none';
            document.getElementById('flip-send-search-results').style.display = 'none';

            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        }

        function selectFlipAnswer(val, text) {
            document.getElementById('flip-answer-type').value = val;
            document.getElementById('flip-answer-display').value = text;
            document.getElementById('flip-answer-dropdown').style.display = 'none';
            updateFlipCostDisplay();
        }

        function toggleFlipPrivacyDropdown() {
            const list = document.getElementById('flip-privacy-dropdown');
            document.getElementById('flip-answer-dropdown').style.display = 'none';
            document.getElementById('flip-send-search-results').style.display = 'none';

            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        }

        function selectFlipPrivacy(val, text) {
            document.getElementById('flip-privacy-type').value = val;
            document.getElementById('flip-privacy-display').value = text;
            document.getElementById('flip-privacy-dropdown').style.display = 'none';
            updateFlipCostDisplay();
        }

        function renderFlipOptions() {
            const container = document.getElementById('flip-answer-dropdown');
            container.innerHTML = '';

            const typeNames = { 1: '文字翻牌', 2: '语音翻牌', 3: '视频翻牌' };

            if (currentFlipPrices.length === 0) {
                container.innerHTML = '<div class="suggestion-item" style="color:#999; cursor:default;">该成员暂未开通翻牌</div>';
                document.getElementById('flip-answer-display').value = "未开通";
                return;
            }

            currentFlipPrices.forEach((p, index) => {
                const name = typeNames[p.answerType] || `类型 ${p.answerType}`;
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerText = name;
                div.onclick = () => selectFlipAnswer(p.answerType, name);
                container.appendChild(div);

                if (index === 0) {
                    selectFlipAnswer(p.answerType, name);
                }
            });
        }

        function checkFlipCostMin() {
            const input = document.getElementById('flip-cost-input');
            const msgDiv = document.getElementById('flip-send-msg');
            if (!input) return;

            const minPrice = parseInt(input.dataset.minPrice) || 0;
            let currentVal = parseInt(input.value) || 0;

            if (currentVal < minPrice) {
                input.value = minPrice;
                if (msgDiv) {
                    msgDiv.innerText = `⚠️ 鸡腿数不能低于底价 ${minPrice} 🍗`;
                    msgDiv.style.color = '#fa8c16';
                    setTimeout(() => {
                        if (msgDiv.innerText.includes('不能低于底价')) msgDiv.innerText = '';
                    }, 3000);
                }
            }
        }

        function updateFlipCostDisplay() {
            const answerTypeVal = document.getElementById('flip-answer-type').value;
            const privacyTypeVal = document.getElementById('flip-privacy-type').value;
            const costInput = document.getElementById('flip-cost-input');

            if (!costInput) return;

            if (!answerTypeVal) {
                costInput.value = '';
                costInput.dataset.minPrice = '0';
                return;
            }

            const answerType = parseInt(answerTypeVal);
            const privacyType = String(privacyTypeVal);

            const config = currentFlipPrices.find(p => p.answerType === answerType);
            if (!config) {
                costInput.value = '';
                costInput.dataset.minPrice = '0';
                return;
            }

            let price = 0;
            if (privacyType === '1') price = config.normalCost;
            else if (privacyType === '2') price = config.privateCost;
            else if (privacyType === '3') price = config.anonymityCost;

            costInput.value = price;
            costInput.dataset.minPrice = price;
        }

        function updateFlipCharCount(input) {
            const count = input.value.length;
            const counterEl = document.getElementById('flip-content-count');
            if (counterEl) {
                counterEl.innerText = `${count}/200`;
                if (count >= 200) counterEl.style.color = '#ff4d4f';
                else counterEl.style.color = '#999';
            }
        }

        async function executeSendFlip() {
            const memberId = document.getElementById('flip-send-member-id').value;
            const content = document.getElementById('flip-content-input').value.trim();

            const answerTypeVal = document.getElementById('flip-answer-type').value;
            const privacyTypeVal = document.getElementById('flip-privacy-type').value;

            const costInput = document.getElementById('flip-cost-input');
            const costText = costInput ? costInput.value : '0';
            const minPrice = costInput ? (parseInt(costInput.dataset.minPrice) || 0) : 0;

            const msgDiv = document.getElementById('flip-send-msg');
            const btn = document.getElementById('btn-do-send-flip');

            msgDiv.style.color = '#ff4d4f';

            if (!memberId) {
                msgDiv.innerText = '⚠️ 请先选择成员';
                return;
            }
            if (!content) {
                msgDiv.innerText = '⚠️ 请输入提问内容';
                return;
            }
            if (!answerTypeVal || !costText) {
                msgDiv.innerText = '⚠️ 请选择有效的回答类型并确认鸡腿数';
                return;
            }

            const cost = parseInt(costText);

            if (cost < minPrice) {
                msgDiv.innerText = `⚠️ 发送失败：您填写的鸡腿数不能低于官方设定的 ${minPrice} 🍗`;
                costInput.value = minPrice;
                return;
            }

            const answerType = parseInt(answerTypeVal);
            const type = parseInt(privacyTypeVal);

            btn.disabled = true;
            btn.innerText = '发送中...';
            msgDiv.innerText = '正在提交请求...';
            msgDiv.style.color = '#666';

            const token = appToken || localStorage.getItem('yaya_p48_token');
            const pa = window.getPA ? window.getPA() : null;

            try {
                const payload = {
                    memberId: parseInt(memberId),
                    content: content,
                    type: type,
                    cost: cost,
                    answerType: answerType
                };

                const res = await ipcRenderer.invoke('send-flip-question', { token, pa, payload });

                if (res.success) {
                    msgDiv.innerText = '✅ 发送成功！2秒后将自动跳转到翻牌记录';
                    msgDiv.style.color = '#28a745';

                    document.getElementById('flip-content-input').value = '';
                    document.getElementById('flip-content-count').innerText = '0/200';
                    document.getElementById('flip-content-count').style.color = '#999';

                    refreshFlipUserBalance();

                    setTimeout(() => {
                        switchView('flip');

                        btn.disabled = false;
                        btn.innerText = '提问';
                        msgDiv.innerText = '';

                        updateLatestFlips();

                    }, 2000);

                } else {
                    msgDiv.innerText = `❌ 发送失败: ${res.msg}`;
                    msgDiv.style.color = '#ff4d4f';
                    btn.disabled = false;
                    btn.innerText = '提问';
                }
            } catch (e) {
                msgDiv.innerText = `❌ 出错: ${e.message}`;
                msgDiv.style.color = '#ff4d4f';
                btn.disabled = false;
                btn.innerText = '提问';
            }
        }



        document.addEventListener('click', function (e) {
            const dropDownConfigs = [
                { inputId: 'groupInput', dropdownId: 'memberDropdownList' },
                { inputId: 'member-search', dropdownId: 'search-results' },
                { inputId: 'profile-member-input', dropdownId: 'profile-search-results' },
                { inputId: 'openlive-member-input', dropdownId: 'openlive-search-results' },
                { inputId: 'vod-member-filter', dropdownId: 'member-suggestions' },
                { inputId: 'photo-member-input', dropdownId: 'photo-search-results' },
                { inputId: 'room-album-member-input', dropdownId: 'room-album-search-results' },
                { inputId: 'room-radio-member-input', dropdownId: 'room-radio-search-results' },
                { wrapperId: 'vod-group-wrapper', dropdownId: 'vod-group-dropdown' },
                { wrapperId: 'vod-type-wrapper', dropdownId: 'vod-type-dropdown' },
                { wrapperId: 'year-wrapper', dropdownId: 'year-dropdown' },
                { wrapperId: 'month-wrapper', dropdownId: 'month-dropdown' },
                { wrapperId: 'day-wrapper', dropdownId: 'day-dropdown' },
                { wrapperId: 'flip-type-wrapper', dropdownId: 'flip-type-dropdown' },
                { wrapperId: 'live-group-wrapper', dropdownId: 'live-group-dropdown' },
                { wrapperId: 'live-type-wrapper', dropdownId: 'live-type-dropdown' },
                { wrapperId: 'search-type-wrapper', dropdownId: 'search-type-dropdown' },
                { wrapperId: 'followed-sort-wrapper', dropdownId: 'followed-sort-dropdown' },

                { wrapperId: 'flip-member-wrapper', dropdownId: 'flip-send-search-results' },
                { wrapperId: 'flip-answer-wrapper', dropdownId: 'flip-answer-dropdown' },
                { wrapperId: 'flip-privacy-wrapper', dropdownId: 'flip-privacy-dropdown' }
            ];

            dropDownConfigs.forEach(cfg => {
                const dropdown = document.getElementById(cfg.dropdownId);
                if (!dropdown || dropdown.style.display === 'none') return;

                let keepOpen = false;

                if (cfg.wrapperId) {
                    const wrapper = document.getElementById(cfg.wrapperId);
                    if (wrapper && wrapper.contains(e.target)) keepOpen = true;
                } else if (cfg.inputId) {
                    const input = document.getElementById(cfg.inputId);
                    if (input && input.parentElement && input.parentElement.contains(e.target)) {
                        keepOpen = true;
                    }
                }

                if (!keepOpen) {
                    dropdown.style.display = 'none';
                }
            });
        });


        async function executeDeleteFlip(questionId, isWithdraw) {
            const actionName = isWithdraw ? '撤回' : '删除';

            const warning = isWithdraw
                ? '确定要撤回这条提问吗？\n撤回后鸡腿将退回到您的账户。'
                : '确定要删除这条翻牌吗？\n删除后不可恢复。';

            showCustomConfirm(warning, async () => {

                const token = appToken || localStorage.getItem('yaya_p48_token');
                const pa = window.getPA ? window.getPA() : null;

                if (!token) {
                    showCardTip(questionId, '⚠️ 请先登录账号', '#ff4d4f');
                    return;
                }

                try {
                    showCardTip(questionId, `正在${actionName}...`, '#666');

                    const res = await ipcRenderer.invoke('operate-flip-question', {
                        token,
                        pa,
                        questionId,
                        operateType: 1
                    });

                    if (res.success) {
                        showCardTip(questionId, `✅ ${actionName}成功`, '#28a745');

                        if (typeof allFlipData !== 'undefined') {
                            allFlipData = allFlipData.filter(item => String(item.questionId) !== String(questionId));
                        }

                        setTimeout(() => {
                            const card = document.getElementById(`flip-card-${questionId}`);
                            if (card) {
                                card.style.opacity = '0';
                                card.style.transform = 'scale(0.95)';
                                setTimeout(() => card.remove(), 300);
                            }
                        }, 500);

                    } else {
                        showCardTip(questionId, `❌ ${actionName}失败: ${res.msg}`, '#ff4d4f');
                    }
                } catch (e) {
                    showCardTip(questionId, `❌ 出错: ${e.message}`, '#ff4d4f');
                }

            });
        }

        function showCardTip(questionId, text, color) {
            const card = document.getElementById(`flip-card-${questionId}`);
            if (!card) return;

            let tipDiv = card.querySelector('.flip-action-tip');
            if (!tipDiv) {
                tipDiv = document.createElement('div');
                tipDiv.className = 'flip-action-tip';
                tipDiv.style.cssText = "font-size:12px; font-weight:bold; margin-top:5px; transition:all 0.3s; text-align:right;";
                const header = card.querySelector('.Box-row > div:first-child');
                if (header) header.insertAdjacentElement('afterend', tipDiv);
                else card.prepend(tipDiv);
            }

            tipDiv.innerText = text;
            tipDiv.style.color = color;
            tipDiv.style.opacity = '1';

            if (color === '#ff4d4f') {
                setTimeout(() => { tipDiv.style.opacity = '0'; }, 3000);
            }
        }


        let currentFlipAnalysisYear = 'all';

        function toggleFlipYearDropdown() {
            const list = document.getElementById('flip-year-dropdown');
            if (list) {
                list.style.display = (list.style.display === 'block') ? 'none' : 'block';
            }
        }

        function selectFlipYear(year) {
            currentFlipAnalysisYear = year;
            performFlipAnalysis();
        }

        function openFlipAnalysis() {
            if (!allFlipData || allFlipData.length === 0) {
                return;
            }

            const modal = document.getElementById('flipAnalysisModal');
            if (modal) {
                modal.style.display = 'flex';
                currentFlipAnalysisYear = 'all';
                performFlipAnalysis();
            }
        }

        function closeFlipAnalysis() {
            const modal = document.getElementById('flipAnalysisModal');
            if (modal) modal.style.display = 'none';
        }

        function performFlipAnalysis() {
            const container = document.getElementById('flipAnalysisContainer');
            if (!container) return;

            function formatDurationSimple(ms) {
                if (!ms || ms < 0) return '-';
                const totalSeconds = Math.floor(ms / 1000);
                const days = Math.floor(totalSeconds / 86400);
                const hours = Math.floor((totalSeconds % 86400) / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const seconds = totalSeconds % 60;

                if (days > 0) return `${days}天${hours}小时`;
                if (hours > 0) return `${hours}小时${minutes}分`;
                if (minutes > 0) return `${minutes}分${seconds}秒`;
                return `${seconds}秒`;
            }

            const years = [...new Set(allFlipData.map(item => {
                const t = Number(item.qtime);
                return t ? new Date(t).getFullYear() : null;
            }))].filter(y => y).sort((a, b) => b - a);

            let filteredData = allFlipData;
            if (currentFlipAnalysisYear !== 'all') {
                filteredData = allFlipData.filter(item => {
                    const t = Number(item.qtime);
                    return t && new Date(t).getFullYear() == currentFlipAnalysisYear;
                });
            }

            let dropdownItemsHtml = `
        <div class="suggestion-item" onclick="selectFlipYear('all')">全部年份</div>
    `;
            years.forEach(y => {
                dropdownItemsHtml += `
            <div class="suggestion-item" onclick="selectFlipYear(${y})">${y}年</div>
        `;
            });

            let currentYearText = (currentFlipAnalysisYear === 'all') ? '全部年份' : `${currentFlipAnalysisYear}年`;

            let totalCount = filteredData.length;
            let totalCost = 0;
            let globalDurationSum = 0;
            let globalAnsweredCount = 0;
            let globalMinDuration = Infinity;
            let globalMaxDuration = 0;
            let typeStats = { text: 0, audio: 0, video: 0 };
            let memberStats = {};

            filteredData.forEach(item => {
                const cost = Number(item.cost) || 0;
                totalCost += cost;

                if (item.answerType === 1) typeStats.text++;
                else if (item.answerType === 2) typeStats.audio++;
                else if (item.answerType === 3) typeStats.video++;

                const name = item.baseUserInfo ? item.baseUserInfo.nickname : '未知成员';

                if (!memberStats[name]) {
                    memberStats[name] = {
                        count: 0, cost: 0, name: name,
                        durationSum: 0, answeredCount: 0,
                        minDuration: Infinity, maxDuration: 0,
                        minSingleCost: Infinity, maxSingleCost: 0,
                        typeCounts: { text: 0, audio: 0, video: 0 }
                    };
                }

                const m = memberStats[name];
                m.count++;
                m.cost += cost;

                if (item.answerType === 1) m.typeCounts.text++;
                else if (item.answerType === 2) m.typeCounts.audio++;
                else if (item.answerType === 3) m.typeCounts.video++;

                if (cost < m.minSingleCost) m.minSingleCost = cost;
                if (cost > m.maxSingleCost) m.maxSingleCost = cost;

                if (item.status === 2 && item.qtime && item.answerTime) {
                    const diff = Number(item.answerTime) - Number(item.qtime);
                    if (diff > 0) {
                        globalDurationSum += diff;
                        globalAnsweredCount++;
                        if (diff < globalMinDuration) globalMinDuration = diff;
                        if (diff > globalMaxDuration) globalMaxDuration = diff;

                        m.durationSum += diff;
                        m.answeredCount++;
                        if (diff < m.minDuration) m.minDuration = diff;
                        if (diff > m.maxDuration) m.maxDuration = diff;
                    }
                }
            });

            if (globalMinDuration === Infinity) globalMinDuration = 0;
            let globalAvgTimeStr = '-';
            let globalRangeStr = '-';

            if (globalAnsweredCount > 0) {
                globalAvgTimeStr = formatDurationSimple(globalDurationSum / globalAnsweredCount);
                const minStr = formatDurationSimple(globalMinDuration);
                const maxStr = formatDurationSimple(globalMaxDuration);
                globalRangeStr = `${minStr} ~ ${maxStr}`;
            }

            const memberRank = Object.values(memberStats).sort((a, b) => {
                if (b.cost !== a.cost) return b.cost - a.cost;
                return b.count - a.count;
            });

            let html = `
        <div style="padding: 16px 20px; background: linear-gradient(to bottom, var(--bg), var(--input-bg)); border-bottom: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; text-align: center; margin-bottom: 15px;">
                <div style="flex: 1; border-right: 1px solid var(--border);">
                    <div style="font-size: 22px; font-weight: bold; color: var(--primary); font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif;">${totalCount}</div>
                    <div style="font-size: 13px; color: var(--text-sub); margin-top:6px;">总翻牌数</div>
                </div>
                <div style="flex: 1; border-right: 1px solid var(--border);">
                    <div style="font-size: 22px; font-weight: bold; color: #fa8c16; font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif;">${totalCost}</div>
                    <div style="font-size: 13px; color: var(--text-sub); margin-top:6px;">总消耗(鸡腿)</div>
                </div>
                <div style="flex: 1.4;">
                    <div style="font-size: 20px; font-weight: bold; color: #722ed1; font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif;">${globalAvgTimeStr}</div>
                    <div style="font-size: 13px; color: var(--text-sub); margin-top:6px;">平均耗时</div>
                    <div style="font-size: 12px; color: #888; margin-top: 4px;">${globalRangeStr}</div>
                </div>
            </div>
            
            <div style="display:flex; gap: 10px; font-size: 12px; justify-content: center; margin-top: 15px;">
                <span style="background:rgba(24, 144, 255, 0.1); color:#1890ff; padding:4px 10px; border-radius:12px;">文字 ${typeStats.text}</span>
                <span style="background:rgba(114, 46, 209, 0.1); color:#722ed1; padding:4px 10px; border-radius:12px;">语音 ${typeStats.audio}</span>
                <span style="background:rgba(235, 47, 150, 0.1); color:#eb2f96; padding:4px 10px; border-radius:12px;">视频 ${typeStats.video}</span>
            </div>
        </div>
        
        <div style="padding: 10px 20px; font-weight: bold; color: var(--text-sub); font-size: 13px; background: var(--bg); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <span>成员排行</span>
            
            <div id="flip-year-wrapper" style="position: relative; width: 100px;">
                <input type="text" id="flip-year-display" class="input-control" 
                       value="${currentYearText}" readonly 
                       onclick="toggleFlipYearDropdown()"
                       style="cursor: pointer; text-align: left; padding-right: 25px; height: 28px; font-size: 12px;">
                
                <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--text-sub); font-size: 10px;">
                    ▼
                </div>
                
                <div id="flip-year-dropdown" class="suggestion-box" style="display: none; top: 32px; width: 100%;">
                    ${dropdownItemsHtml}
                </div>
            </div>
        </div>
    `;

            if (memberRank.length === 0) {
                html += '<div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-sub); font-size: 14px;">该年份暂无数据</div>';
            } else {
                memberRank.forEach((m, index) => {
                    let rankClass = 'rank-other';
                    let rankNum = index + 1;
                    if (index === 0) rankClass = 'rank-1';
                    else if (index === 1) rankClass = 'rank-2';
                    else if (index === 2) rankClass = 'rank-3';

                    const topCost = memberRank[0].cost || 1;
                    const percent = (m.cost / topCost) * 100;
                    const avgPrice = (m.cost / (m.count || 1)).toFixed(0);
                    const minPrice = m.minSingleCost === Infinity ? 0 : m.minSingleCost;
                    const maxPrice = m.maxSingleCost;

                    let countParts = [];
                    countParts.push(`<span style="font-weight: bold; color: var(--text);">共 ${m.count} 条</span>`);
                    if (m.typeCounts.text > 0) countParts.push(`<span style="color:#1890ff;">文字 ${m.typeCounts.text}</span>`);
                    if (m.typeCounts.audio > 0) countParts.push(`<span style="color:#722ed1;">语音 ${m.typeCounts.audio}</span>`);
                    if (m.typeCounts.video > 0) countParts.push(`<span style="color:#eb2f96;">视频 ${m.typeCounts.video}</span>`);
                    const countLineHtml = countParts.join('<span style="margin: 0 6px; color:var(--border);">|</span>');

                    let timeLineHtml = '<span style="color:#999;">暂无回答数据</span>';
                    if (m.answeredCount > 0) {
                        const avgTime = formatDurationSimple(m.durationSum / m.answeredCount);
                        const minTime = formatDurationSimple(m.minDuration);
                        const maxTime = formatDurationSimple(m.maxDuration);

                        timeLineHtml = `
                    <span style="color: #722ed1; font-weight:500;">平均耗时 ${avgTime}</span>
                    <span style="margin: 0 6px; color:var(--border);">|</span>
                    <span>最快 ${minTime}</span>
                    <span style="margin: 0 6px; color:var(--border);">|</span>
                    <span>最慢 ${maxTime}</span>
                `;
                    }

                    html += `
            <div class="list-item" style="cursor: default; padding: 14px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: flex-start;">
                <div class="rank-num ${rankClass}" style="width: 30px; min-width: 30px; text-align: center; margin-right: 15px; font-weight: bold; font-size: 16px; line-height: 24px; margin-top: 2px;">${rankNum}</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: bold; font-size: 15px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${m.name}</span>
                        <span style="font-weight: bold; font-size: 16px; color: #fa8c16; font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif;">${m.cost} <span style="font-size:12px;">🍗</span></span>
                    </div>
                    <div style="height: 4px; background: var(--border); border-radius: 3px; overflow: hidden; margin-bottom: 10px;">
                        <div style="width: ${percent}%; height: 100%; background: #fa8c16; opacity: 0.7;"></div>
                    </div>
                    <div style="font-size: 13px; color: var(--text-sub); line-height: 1.8;">
                        
                        <div style="display:flex; align-items:center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${countLineHtml}
                        </div>

                        <div style="display:flex; align-items:center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            <span style="color: #fa8c16; font-weight:500;">平均鸡腿 ${avgPrice} 🍗</span>
                            <span style="margin: 0 6px; color:var(--border);">|</span>
                            <span>最高 ${maxPrice} 🍗</span>
                            <span style="margin: 0 6px; color:var(--border);">|</span>
                            <span>最低 ${minPrice} 🍗</span>
                        </div>

                        <div style="display:flex; align-items:center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${timeLineHtml}
                        </div>
                    </div>
                </div>
            </div>`;
                });
            }

            container.innerHTML = html;
        }


        function openGiftAnalysis() {
            const modal = document.getElementById('giftAnalysisModal');
            const container = document.getElementById('giftAnalysisList');

            if (modal) modal.style.display = 'flex';
            if (container) {
                container.innerHTML = '<div class="empty-state">正在分析礼物数据...</div>';
                container.scrollTop = 0;
            }

            setTimeout(() => {
                performGiftAnalysis();
            }, 50);
        }

        function closeGiftAnalysis() {
            const modal = document.getElementById('giftAnalysisModal');
            if (modal) modal.style.display = 'none';
        }

        function performGiftAnalysis() {
            const container = document.getElementById('giftAnalysisList');
            if (!container) return;

            const groupInput = document.getElementById('groupInput');
            let selGroup = groupInput ? groupInput.value : 'all';
            if (selGroup === '全部成员' || !selGroup) selGroup = 'all';

            const modalTitle = document.querySelector('#giftAnalysisModal .modal-title');
            if (modalTitle) {
                modalTitle.innerText = selGroup === 'all' ? '房间礼物贡献榜 (全部)' : `房间礼物贡献榜 (${selGroup})`;
            }

            const sourceData = currentFilteredPosts && currentFilteredPosts.length > 0 ? currentFilteredPosts : allPosts;

            const userMap = {};
            let totalRevenue = 0;

            sourceData.forEach(post => {
                if (post.contentHtml.includes('送出礼物：') || post.contentHtml.includes('🎁')) {

                    const nameMatch = post.contentHtml.match(/送出礼物：([^<]+)/);
                    const numMatch = post.contentHtml.match(/数量: x(\d+)/);

                    if (nameMatch && numMatch) {
                        const giftName = nameMatch[1].trim();
                        const count = parseInt(numMatch[1]);

                        const uid = post.userId || post.nameStr || '未知用户';
                        const postTime = new Date(post.timeStr).getTime();

                        let price = 0;
                        if (typeof POCKET_GIFT_DATA !== 'undefined') {
                            const giftObj = POCKET_GIFT_DATA.find(g => g.name === giftName);
                            if (giftObj) price = giftObj.cost;
                        }

                        const totalValue = price * count;

                        if (!userMap[uid]) {
                            userMap[uid] = {
                                id: uid,
                                realUserId: post.userId,
                                name: post.nameStr || '未知用户',
                                totalCost: 0,
                                totalCount: 0,
                                avatar: post.avatarHtml,
                                latestTime: postTime
                            };
                        }

                        const user = userMap[uid];
                        user.totalCost += totalValue;
                        user.totalCount += count;
                        totalRevenue += totalValue;

                        if (postTime > user.latestTime) {
                            user.name = post.nameStr;
                            user.avatar = post.avatarHtml;
                            user.latestTime = postTime;
                            if (post.userId) user.realUserId = post.userId;
                        }
                    }
                }
            });

            const sortedList = Object.values(userMap).sort((a, b) => b.totalCost - a.totalCost);

            if (sortedList.length === 0) {
                container.innerHTML = '<div class="empty-state">未检测到礼物数据</div>';
                return;
            }

            let html = `
        <div style="padding: 15px; background: rgba(250, 140, 22, 0.1); border-bottom: 1px solid #ffd591; margin-bottom: 10px; border-radius: 4px;">
            <div style="font-weight: bold; color: #d46b08; font-size: 14px; text-align: center;">
                鸡腿总数: <span style="font-size: 18px;">${totalRevenue}</span> 🍗
            </div>
        </div>
    `;

            sortedList.forEach((user, index) => {
                const rClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : ''));

                let avatarSrc = './icon.png';
                if (user.avatar) {
                    const srcMatch = user.avatar.match(/src=['"]([^'"]+)['"]/);
                    if (srcMatch) avatarSrc = srcMatch[1];
                }

                const clickAction = `showUserGifts('${user.realUserId || ''}', '${escapeHtml(user.name)}')`;

                html += `
        <div class="list-item" onclick="${clickAction}" style="cursor: pointer; align-items: center; padding: 10px 8px;">
            <div class="rank-num ${rClass}">${index + 1}</div>
            
            <div style="margin-right: 12px;">
                <img src="${avatarSrc}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            </div>
            
            <div class="item-main" style="display: flex; flex-direction: column; justify-content: center; flex: 1; min-width: 0;">
                <span class="item-title" style="font-size: 14px; line-height: 1.4; margin-bottom: 2px;">
                    ${user.name}
                    ${user.realUserId ? `<span style="font-size:10px; color:#aaa; font-weight:normal;">(ID:${user.realUserId})</span>` : ''}
                </span>
                <span style="font-size: 11px; color: #999; line-height: 1.3;">送出 ${user.totalCount} 个礼物</span>
            </div>
            
            <div class="item-count" style="color: #fa8c16; font-size: 13px; font-weight:bold;">${user.totalCost} 🍗</div>
        </div>`;
            });

            container.innerHTML = html;
        }


        function openSpeechAnalysis() {
            const modal = document.getElementById('speechAnalysisModal');
            const container = document.getElementById('speechAnalysisList');

            if (modal) modal.style.display = 'flex';
            if (container) {
                container.innerHTML = '<div class="empty-state">正在统计数据...</div>';
                container.scrollTop = 0;
            }

            setTimeout(() => {
                performSpeechAnalysis();
            }, 50);
        }

        function closeSpeechAnalysis() {
            const modal = document.getElementById('speechAnalysisModal');
            if (modal) modal.style.display = 'none';
        }

        function performSpeechAnalysis() {
            const container = document.getElementById('speechAnalysisList');
            if (!container) return;

            const groupInput = document.getElementById('groupInput');
            let selGroup = groupInput ? groupInput.value : 'all';
            if (selGroup === '全部成员' || !selGroup) selGroup = 'all';

            const modalTitle = document.querySelector('#speechAnalysisModal .modal-title');
            if (modalTitle) {
                modalTitle.innerText = selGroup === 'all' ? '用户发言活跃榜 (全部)' : `用户发言活跃榜 (${selGroup})`;
            }

            const sourceData = currentFilteredPosts && currentFilteredPosts.length > 0 ? currentFilteredPosts : allPosts;

            const userMap = {};
            let totalMessages = 0;

            sourceData.forEach(post => {
                if (!post.nameStr) return;

                if (post.contentHtml.includes('送出礼物：') || post.contentHtml.includes('🎁')) return;

                const uid = post.userId || post.nameStr;
                const postTime = new Date(post.timeStr).getTime();

                if (!userMap[uid]) {
                    userMap[uid] = {
                        id: uid,
                        realUserId: post.userId,
                        name: post.nameStr,
                        count: 0,
                        avatar: post.avatarHtml,
                        lastMsg: post.contentHtml,
                        latestTime: postTime
                    };
                }

                const user = userMap[uid];
                user.count++;
                totalMessages++;

                if (postTime > user.latestTime) {
                    user.name = post.nameStr;
                    user.avatar = post.avatarHtml;
                    user.lastMsg = post.contentHtml;
                    user.latestTime = postTime;
                    if (post.userId) user.realUserId = post.userId;
                }
            });

            const sortedList = Object.values(userMap).sort((a, b) => b.count - a.count);

            if (sortedList.length === 0) {
                container.innerHTML = '<div class="empty-state">无纯发言数据</div>';
                return;
            }

            let html = `
        <div style="padding: 15px; background: rgba(24, 144, 255, 0.1); border-bottom: 1px solid #91d5ff; margin-bottom: 10px; border-radius: 4px;">
            <div style="font-weight: bold; color: #096dd9; font-size: 14px; text-align: center;">
                发言总数: <span style="font-size: 18px;">${totalMessages}</span> 条
            </div>
        </div>
    `;

            sortedList.forEach((user, index) => {
                const rClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : ''));

                let avatarSrc = './icon.png';
                if (user.avatar) {
                    const srcMatch = user.avatar.match(/src=['"]([^'"]+)['"]/);
                    if (srcMatch) avatarSrc = srcMatch[1];
                }

                let previewTxt = user.lastMsg.replace(/<[^>]+>/g, "").trim();
                if (previewTxt.length > 10) previewTxt = previewTxt.substring(0, 10) + '...';
                if (!previewTxt) previewTxt = "图片/表情";

                const d = new Date(user.latestTime);
                const pad = (n) => String(n).padStart(2, '0');
                const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

                const clickAction = user.realUserId
                    ? `filterByUserId('${user.realUserId}')`
                    : `filterByUser('${escapeHtml(user.name)}')`;

                html += `
        <div class="list-item" onclick="${clickAction}" style="cursor: pointer; align-items: center; padding: 10px 8px;">
            <div class="rank-num ${rClass}">${index + 1}</div>
            
            <div style="margin-right: 12px;">
                <img src="${avatarSrc}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            </div>
            
            <div class="item-main" style="display: flex; flex-direction: column; justify-content: center; flex: 1; min-width: 0;">
                <span class="item-title" style="font-size: 14px; line-height: 1.4; margin-bottom: 2px;">
                    ${user.name}
                </span>
                
                <span style="font-size: 11px; color: #888; line-height: 1.3;">最近一条：${previewTxt}</span>
                
                <span style="font-size: 10px; color: #bbb; line-height: 1.3;">活跃时间：${timeStr}</span>
            </div>
            
            <div class="item-count" style="color: #1890ff; font-size: 13px; font-weight:bold;">${user.count} 条</div>
        </div>`;
            });

            container.innerHTML = html;
        }

        function formatDurationSimple(ms) {
            if (!ms || ms < 0) return '-';

            const totalSeconds = Math.floor(ms / 1000);
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);

            if (days > 0) {
                return `${days}天${hours}小时`;
            } else if (hours > 0) {
                return `${hours}小时${minutes}分`;
            } else {
                return `${minutes}分钟`;
            }
        }

        document.addEventListener('click', function (e) {
            const flipModal = document.getElementById('flipAnalysisModal');
            if (e.target === flipModal) closeFlipAnalysis();
        });


        let selectedLiveGiftId = null;

        function toggleGiftPanel() {
            const panel = document.getElementById('live-gift-panel');
            const arrow = document.getElementById('gift-panel-arrow');

            if (!panel) return;

            if (panel.style.display === 'none' || panel.style.display === '') {
                panel.style.display = 'block';
                if (arrow) arrow.style.transform = 'rotate(180deg)';

                renderLiveGiftGrid();
                updateLiveBalance();
            } else {
                panel.style.display = 'none';
                if (arrow) arrow.style.transform = 'rotate(0deg)';
            }
        }

        async function renderLiveGiftGrid() {
            const container = document.getElementById('live-gift-grid');
            if (!container) return;

            if (container.children.length === 0) {
                container.innerHTML = '<div style="padding:20px; text-align:center; color:#999; width:100%;">加载中...</div>';
            }

            let giftList = [];
            let useFallback = false;

            const safeFixUrl = (path) => {
                if (!path) return './icon.png';
                if (path.startsWith('http')) return path;

                const prefix = 'https://source.48.cn';
                return path.startsWith('/') ? (prefix + path) : (prefix + '/' + path);
            };

            const token = appToken || localStorage.getItem('yaya_p48_token');
            const liveId = currentPlayingItem ? currentPlayingItem.liveId : null;

            if (token && liveId) {
                try {
                    const pa = window.getPA ? window.getPA() : null;
                    const res = await ipcRenderer.invoke('fetch-gift-list', { token, pa, liveId });

                    if (res.success && res.content) {
                        if (Array.isArray(res.content)) {
                            res.content.forEach(category => {
                                if (category.giftList && Array.isArray(category.giftList)) {
                                    giftList = giftList.concat(category.giftList);
                                }
                            });
                        } else if (res.content.giftList && Array.isArray(res.content.giftList)) {
                            giftList = res.content.giftList;
                        }

                        const seen = new Set();
                        giftList = giftList.filter(item => {
                            const id = item.giftId || item.id;
                            if (seen.has(id)) return false;
                            seen.add(id);
                            return true;
                        });

                        if (giftList.length === 0) useFallback = true;
                    } else {
                        useFallback = true;
                    }
                } catch (e) {
                    console.error('加载礼物列表失败', e);
                    useFallback = true;
                }
            } else {
                useFallback = true;
            }

            if ((useFallback || giftList.length === 0) && typeof POCKET_GIFT_DATA !== 'undefined') {
                console.log('使用本地 POCKET_GIFT_DATA 备份');
                giftList = POCKET_GIFT_DATA.map(g => ({
                    giftId: g.id,
                    giftName: g.name,
                    money: g.cost,
                    picPath: `/mediasource/live/gift/gift_png_${g.id}.png`
                }));
            }

            if (giftList.length === 0) {
                container.innerHTML = '<div style="padding:10px; text-align:center; color:#999;">无法加载礼物列表</div>';
                return;
            }

            let html = '';
            giftList.forEach(gift => {
                const id = gift.giftId || gift.id;
                const name = gift.giftName || gift.name || '未知礼物';

                let cost = '??';
                if (gift.money !== undefined) cost = gift.money;
                else if (gift.canSendNum !== undefined) cost = gift.canSendNum;
                else if (gift.cost !== undefined) cost = gift.cost;

                const imgUrl = safeFixUrl(gift.picPath);

                html += `
            <div class="gift-item" id="gift-item-${id}" 
                 data-name="${name}" data-cost="${cost}"
                 onclick="selectLiveGift('${id}')">
                <img src="${imgUrl}" class="gift-img" onerror="this.src='./icon.png'" loading="lazy">
                <div class="gift-name" title="${name}">${name}</div>
                <div class="gift-cost">${cost} 🍗</div>
            </div>
        `;
            });
            container.innerHTML = html;
        }

        function selectLiveGift(giftId) {
            if (selectedLiveGiftId) {
                const old = document.getElementById(`gift-item-${selectedLiveGiftId}`);
                if (old) old.classList.remove('selected');
            }

            selectedLiveGiftId = giftId;

            const current = document.getElementById(`gift-item-${giftId}`);
            if (current) {
                current.classList.add('selected');

                const btn = document.getElementById('btn-confirm-send-gift');
                if (btn) {
                    btn.disabled = false;
                    const name = current.dataset.name || '礼物';
                    btn.innerText = `发送 ${name}`;
                    btn.title = `发送 ${name} (消耗 ${current.dataset.cost} 鸡腿)`;
                }
            }
        }

        async function updateLiveBalance() {
            const balanceEl = document.getElementById('live-gift-balance');
            if (!balanceEl) return;

            const token = appToken || localStorage.getItem('yaya_p48_token');
            if (!token) {
                balanceEl.innerText = '未登录';
                return;
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-user-money', { token, pa });
                if (res.success && res.content) {
                    balanceEl.innerText = res.content.moneyTotal;
                } else {
                    balanceEl.innerText = '获取失败';
                }
            } catch (e) {
                console.error(e);
                balanceEl.innerText = '错误';
            }
        }

        async function executeSendLiveGift() {
            if (!selectedLiveGiftId) {
                if (typeof dp !== 'undefined' && dp.notice) dp.notice('请先选择一个礼物', 2000);
                return;
            }
            if (!currentPlayingItem) return;

            const token = appToken || localStorage.getItem('yaya_p48_token');
            if (!token) {
                if (typeof dp !== 'undefined' && dp.notice) dp.notice('请先登录', 2000);
                else switchView('login');
                return;
            }

            const giftEl = document.getElementById(`gift-item-${selectedLiveGiftId}`);
            if (!giftEl) return;
            const giftName = giftEl.dataset.name;

            const numInput = document.getElementById('live-gift-num');
            const giftNum = numInput ? Math.floor(Number(numInput.value)) : 1;

            if (giftNum < 1) {
                if (typeof dp !== 'undefined' && dp.notice) dp.notice('数量不能小于 1', 2000);
                return;
            }

            const btn = document.getElementById('btn-confirm-send-gift');
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = '...';

            try {
                const liveId = currentPlayingItem.liveId;
                const acceptUserId = currentPlayingItem.userInfo ? currentPlayingItem.userInfo.userId : (currentPlayingItem.userId || '');

                if (!acceptUserId) throw new Error('无法获取主播ID');

                const pa = window.getPA ? window.getPA() : null;
                const crm = Date.now().toString();

                const res = await ipcRenderer.invoke('send-live-gift', {
                    token,
                    pa,
                    giftId: selectedLiveGiftId,
                    liveId,
                    acceptUserId,
                    crm,
                    giftNum: giftNum
                });

                if (res.success) {
                    updateLiveBalance();
                    if (typeof dp !== 'undefined' && dp.notice) {
                        dp.notice(`🎁 已送出 ${giftNum} 个 [${giftName}]`, 3000);
                    }
                } else {
                    let errorMsg = res.msg || '未知错误';

                    if (errorMsg.includes('不存在') || errorMsg.includes('下架')) {
                        errorMsg = '失败';
                        renderLiveGiftGrid();
                    }
                    else if (errorMsg.includes('余额') || errorMsg.includes('不足') || errorMsg.includes('钱')) {
                        errorMsg = '余额不足，请充值';
                    }

                    if (typeof dp !== 'undefined' && dp.notice) {
                        dp.notice(`❌ ${errorMsg}`, 3000);
                    } else {
                        console.error(res.msg);
                    }
                }

            } catch (e) {
                if (typeof dp !== 'undefined' && dp.notice) {
                    dp.notice(`❌ 出错: ${e.message}`, 3000);
                }
            } finally {
                btn.disabled = false;
                btn.innerText = originalText;
            }
        }

        function resetBackground() {
            localStorage.removeItem('custom_bg_data');
            document.body.style.backgroundImage = '';
        }

        function loadCustomPaths() {
            document.getElementById('path-danmu').value = localStorage.getItem('yaya_path_danmu') || '';
            document.getElementById('path-video').value = localStorage.getItem('yaya_path_video') || '';
            document.getElementById('path-clip').value = localStorage.getItem('yaya_path_clip') || '';
            document.getElementById('path-media').value = localStorage.getItem('yaya_path_media') || '';
            document.getElementById('path-flip').value = localStorage.getItem('yaya_path_flip') || '';
            document.getElementById('path-room-radio').value = localStorage.getItem('yaya_path_room_radio') || '';
        }

        function saveCustomPaths() {
            localStorage.setItem('yaya_path_danmu', document.getElementById('path-danmu').value.trim());
            localStorage.setItem('yaya_path_video', document.getElementById('path-video').value.trim());
            localStorage.setItem('yaya_path_clip', document.getElementById('path-clip').value.trim());
            localStorage.setItem('yaya_path_media', document.getElementById('path-media').value.trim());
            localStorage.setItem('yaya_path_flip', document.getElementById('path-flip').value.trim());
            localStorage.setItem('yaya_path_room_radio', document.getElementById('path-room-radio').value.trim());
        }

        async function triggerSelectPath(inputId) {
            try {
                const path = await ipcRenderer.invoke('dialog-open-directory');

                if (path) {
                    document.getElementById(inputId).value = path;
                    saveCustomPaths();
                }
            } catch (e) {
                console.error('打开文件夹选择框失败:', e);
                showToast('无法打开系统选择框，请尝试手动粘贴路径。');
            }
        }


        function openDanmuAnalysis() {
            const modal = document.getElementById('danmuAnalysisModal');
            const container = document.getElementById('danmuAnalysisList');

            if (!currentDanmuList || currentDanmuList.length === 0) {
                if (modal) modal.style.display = 'flex';
                if (container) container.innerHTML = '<div class="empty-state">当前没有弹幕数据</div>';
                return;
            }

            if (modal) modal.style.display = 'flex';

            const counts = {};
            currentDanmuList.forEach(item => {
                const name = item.name || '未知用户';
                counts[name] = (counts[name] || 0) + 1;
            });

            const sortedStats = Object.entries(counts)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

            if (sortedStats.length === 0) {
                container.innerHTML = '<div class="empty-state">无数据</div>';
            } else {
                let html = '';
                sortedStats.forEach((user, index) => {
                    const rClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : ''));
                    html += `
            <div class="list-item" onclick="filterDanmuByUser('${escapeHtml(user.name)}')" style="cursor: pointer;">
                <div class="rank-num ${rClass}">${index + 1}</div>
                <div class="item-main">
                    <span class="item-title">${user.name}</span>
                </div>
                <div class="item-count">${user.count}条</div>
            </div>`;
                });
                container.innerHTML = html;
            }
            if (container) {
                setTimeout(() => {
                    container.scrollTop = 0;
                }, 0);
            }
        }

        function closeDanmuAnalysis() {
            const modal = document.getElementById('danmuAnalysisModal');
            if (modal) modal.style.display = 'none';
        }

        function filterDanmuByUser(name) {
            closeDanmuAnalysis();
            const input = document.getElementById('danmu-search-input');
            if (input) {
                input.value = name;
                handleDanmuSearch(name);
            }
        }

        function handleRoomRadioSearch(keyword) {
            const resultBox = document.getElementById('room-radio-search-results');
            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }
            if (!window.isMemberDataLoaded && typeof loadMemberData === 'function') loadMemberData();

            const lowerKw = keyword.toLowerCase();
            let matches = memberData.filter(m => {
                const matchName = m.ownerName.includes(keyword);
                const pinyin = m.pinyin || "";
                const matchPinyin = pinyin.toLowerCase().includes(lowerKw);
                const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : "";
                return matchName || matchPinyin || initials.toLowerCase().includes(lowerKw);
            });

            matches.sort(memberSortLogic);

            if (matches.length > 0) {
                const html = matches.slice(0, 10).map(m => {
                    const isInactive = m.isInGroup === false;
                    const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';
                    let colorStyle = typeof getTeamStyle === 'function' ? getTeamStyle(m.team, isInactive) : '';
                    return `<div class="suggestion-item" 
                         onclick="selectRoomRadioMember('${m.ownerName}', '${m.channelId}', '${m.serverId}', '${m.yklzId || ''}')"
                         style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight:bold; ${baseStyle}">${m.ownerName}</span>
                        <span class="team-tag" style="${baseStyle} ${colorStyle}">${m.team}</span>
                    </div>`;
                }).join('');
                resultBox.innerHTML = html;
                resultBox.style.display = 'block';
            } else {
                resultBox.style.display = 'none';
            }
        }

        function selectRoomRadioMember(name, channelId, serverId, smallChannelId = '') {
            document.getElementById('room-radio-member-input').value = name;
            const channelInput = document.getElementById('room-radio-channel-id');
            channelInput.dataset.bigChannelId = channelId || '';
            channelInput.dataset.smallChannelId = smallChannelId || '';
            applyRoomRadioChannelValue();
            document.getElementById('room-radio-server-id').value = serverId;
            document.getElementById('room-radio-search-results').style.display = 'none';
        }

        let radioMpegtsPlayer = null;
        let radioMediaElement = null;
        let roomRadioEndWatchdog = null;
        let roomRadioLastCurrentTime = 0;
        let roomRadioStallCount = 0;

        function handleRoomRadioEnded(reason = 'ended') {
            const statusEl = document.getElementById('radio-status-text');
            const statusText = reason === 'stalled'
                ? '上麦已结束，录制已自动停止'
                : '上麦已结束，录制已自动停止';

            if (isRoomRadioRecording) {
                toggleRoomRadioRecord();
            }

            if (statusEl) {
                statusEl.innerHTML = `<span style="color:#faad14; font-weight:bold;">${statusText}</span>`;
            }
        }

        function clearRoomRadioEndWatchdog() {
            if (roomRadioEndWatchdog) {
                clearInterval(roomRadioEndWatchdog);
                roomRadioEndWatchdog = null;
            }
            roomRadioLastCurrentTime = 0;
            roomRadioStallCount = 0;
        }

        function setupRoomRadioEndWatchdog() {
            clearRoomRadioEndWatchdog();
            if (!radioMediaElement) return;

            roomRadioEndWatchdog = setInterval(() => {
                if (!radioMediaElement) {
                    clearRoomRadioEndWatchdog();
                    return;
                }

                if (radioMediaElement.ended) {
                    handleRoomRadioEnded('ended');
                    clearRoomRadioEndWatchdog();
                    return;
                }

                if (radioMediaElement.paused || radioMediaElement.readyState < 2) {
                    return;
                }

                const currentTime = Number(radioMediaElement.currentTime || 0);
                if (Math.abs(currentTime - roomRadioLastCurrentTime) < 0.01) {
                    roomRadioStallCount += 1;
                } else {
                    roomRadioLastCurrentTime = currentTime;
                    roomRadioStallCount = 0;
                }

                if (roomRadioStallCount >= 8) {
                    handleRoomRadioEnded('stalled');
                    clearRoomRadioEndWatchdog();
                }
            }, 1000);
        }

        async function connectRoomRadio() {
            const container = document.getElementById('room-radio-result-container');
            const channelId = document.getElementById('room-radio-channel-id').value.trim();
            const serverId = document.getElementById('room-radio-server-id').value.trim() || 0;
            const memberName = document.getElementById('room-radio-member-input').value.trim() || '该房间';
            const token = appToken || localStorage.getItem('yaya_p48_token');

            if (!token) return showToast('⚠️ 请先在“账号设置”中登录');
            if (!channelId || channelId === 'undefined') return showToast('⚠️ 请先搜索成员，或手动输入 Channel ID');

            stopRoomRadio(false);

            container.innerHTML = '<div class="empty-state">正在连接电台并启动音频引擎...</div>';

            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-room-radio', {
                    token, pa, channelId, serverId
                });

                if (res.success && res.content) {
                    if (!res.content.streamUrl) {
                        container.innerHTML = '<div class="placeholder-tip"><h3>未开启</h3><p>该房间当前没有开启语音电台。</p></div>';
                        return;
                    }
                    playAudioOnlyStream(res.content.streamUrl, memberName, container);
                } else {
                    container.innerHTML = `<div class="placeholder-tip"><h3>❌ 连接失败</h3><p>${res.msg}</p></div>`;
                }
            } catch (e) {
                container.innerHTML = `<div class="placeholder-tip"><h3>❌ 发生错误</h3><p>${e.message}</p></div>`;
            }
        }

        async function playAudioOnlyStream(remoteUrl, memberName, container) {
            container.innerHTML = '<div class="empty-state">正在解析音频流，请稍候...</div>';

            try {
                const localUrl = await ipcRenderer.invoke('start-radio-proxy', remoteUrl);

                await new Promise(r => setTimeout(r, 300));

                container.innerHTML = `
            <style>
                @keyframes radioPulse {
                    0% { box-shadow: 0 0 0 0 rgba(155, 106, 156, 0.4); transform: scale(1); }
                    70% { box-shadow: 0 0 0 20px rgba(155, 106, 156, 0); transform: scale(1.05); }
                    100% { box-shadow: 0 0 0 0 rgba(155, 106, 156, 0); transform: scale(1); }
                }
            </style>
            <div style="background: var(--input-bg); border: 1px solid var(--border); border-radius: 12px; padding: 40px 20px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-top: 10px;">
                <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, var(--primary) 0%, #d49bc6 100%); margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; animation: radioPulse 2s infinite;">
                    <span style="font-size: 36px; color: white;">📻</span>
                </div>
                <h3 style="margin: 0 0 10px 0; color: var(--primary);">${memberName} 的房间电台</h3>
                <div style="font-size: 13px; color: var(--text-sub); margin-bottom: 25px;" id="radio-status-text">正在缓冲音频数据...</div>
                
                <div style="display: flex; justify-content: center; gap: 15px; align-items: center;">
                    <button class="btn btn-secondary" onclick="toggleRadioMute()" id="btn-radio-mute" style="width: 100px;">静音</button>
                    <button class="btn btn-secondary" onclick="toggleRoomRadioRecord()" id="btn-radio-record" style="width: 100px;">开始录制</button>
                    <button class="btn btn-primary" onclick="stopRoomRadio(true)" style="background: #ff4d4f; border-color: #ff4d4f; width: 100px;">停止收听</button>
                </div>
                <video id="hidden-radio-audio" style="display: none;" crossorigin="anonymous"></video>
            </div>
        `;

                radioMediaElement = document.getElementById('hidden-radio-audio');

                if (window.mpegts && window.mpegts.isSupported()) {
                    radioMpegtsPlayer = window.mpegts.createPlayer(
                        {
                            type: 'flv',
                            url: localUrl,
                            isLive: true,
                            hasVideo: false,
                            hasAudio: true
                        },
                        {
                            enableWorker: false,
                            enableStashBuffer: false,
                            stashInitialSize: 128,
                            liveBufferLatencyChasing: true,
                            liveBufferLatencyMaxLatency: 1.5
                        }
                    );

                    radioMpegtsPlayer.attachMediaElement(radioMediaElement);
                    radioMpegtsPlayer.load();

                    radioMediaElement.addEventListener('playing', () => {
                        const statusEl = document.getElementById('radio-status-text');
                        if (statusEl) statusEl.innerHTML = '<span style="color:#28a745; font-weight:bold;">▶ 正在收听</span>';
                        roomRadioLastCurrentTime = Number(radioMediaElement.currentTime || 0);
                        roomRadioStallCount = 0;
                    });

                    radioMediaElement.addEventListener('error', () => {
                        const statusEl = document.getElementById('radio-status-text');
                        if (statusEl) statusEl.innerHTML = '<span style="color:#ff4d4f;">⚠️ 播放断开或解码出错</span>';
                        handleRoomRadioEnded('error');
                    });

                    radioMediaElement.addEventListener('ended', () => {
                        handleRoomRadioEnded('ended');
                    });

                    radioMediaElement.addEventListener('emptied', () => {
                        handleRoomRadioEnded('emptied');
                    });

                    setupRoomRadioEndWatchdog();

                    radioMpegtsPlayer.play();
                } else {
                    container.innerHTML = '<div class="placeholder-tip"><h3>❌ 播放引擎错误</h3><p>您的环境不支持该格式的音频解码。</p></div>';
                }

            } catch (err) {
                container.innerHTML = `<div class="placeholder-tip"><h3>❌ 启动代理失败</h3><p>${err.message}</p></div>`;
            }
        }

        function toggleRadioMute() {
            if (!radioMediaElement) return;
            const btn = document.getElementById('btn-radio-mute');
            if (radioMediaElement.muted) {
                radioMediaElement.muted = false;
                btn.innerText = '静音';
            } else {
                radioMediaElement.muted = true;
                btn.innerText = '取消静音';
            }
        }

        function stopRoomRadio(updateUI = true) {
            clearRoomRadioEndWatchdog();
            if (isRoomRadioRecording) {
                toggleRoomRadioRecord();
            }
            if (radioMpegtsPlayer) {
                try {
                    radioMpegtsPlayer.pause();
                    radioMpegtsPlayer.unload();
                    radioMpegtsPlayer.detachMediaElement();
                    radioMpegtsPlayer.destroy();
                } catch (e) { }
                radioMpegtsPlayer = null;
            }

            if (radioMediaElement) {
                radioMediaElement.pause();
                radioMediaElement.src = '';
                radioMediaElement = null;
            }

            ipcRenderer.invoke('stop-live-proxy');

            if (updateUI) {
                const container = document.getElementById('room-radio-result-container');
                if (container) {
                    container.innerHTML = `
                <div class="placeholder-tip">
                    <h3>已停止收听</h3>
                    <p>电台已关闭。您可以重新搜索其他成员并连接。</p>
                </div>
            `;
                }
            }
        }

        let roomRadioRecorder = null;
        let roomRadioChunks = [];
        let isRoomRadioRecording = false;

        function toggleRoomRadioRecord() {
            const btn = document.getElementById('btn-radio-record');
            if (!radioMediaElement) return;

            if (!isRoomRadioRecording) {
                try {
                    const stream = radioMediaElement.captureStream ? radioMediaElement.captureStream() : radioMediaElement.mozCaptureStream();

                    if (stream.getAudioTracks().length === 0) {
                        alert("音频流尚未准备好，请等声音出来后再点击录制！");
                        return;
                    }

                    roomRadioRecorder = new MediaRecorder(stream);
                    roomRadioChunks = [];

                    roomRadioRecorder.ondataavailable = function (e) {
                        if (e.data.size > 0) roomRadioChunks.push(e.data);
                    };

                    roomRadioRecorder.onstop = async function () {
                        const blob = new Blob(roomRadioChunks, { type: 'audio/webm' });
                        const now = new Date();
                        const timeStr = `${now.getMonth() + 1}月${now.getDate()}日_${now.getHours()}时${now.getMinutes()}分`;
                        const fileNameBase = `房间电台录音_${timeStr}`;

                        try {
                            const arrayBuffer = await blob.arrayBuffer();
                            const result = await ipcRenderer.invoke('save-room-radio-recording', {
                                arrayBuffer,
                                fileNameBase,
                                savePath: localStorage.getItem('yaya_path_room_radio') || ''
                            });

                            if (result?.success) {
                                showToast('录音已保存为 MP3');
                            } else if (result?.fallback) {
                                showToast(result.msg || 'MP3 转换失败，已保存为 WebM');
                            } else {
                                showToast('录音保存失败');
                            }
                        } catch (error) {
                            console.error("电台录音保存失败:", error);
                            showToast('录音保存失败');
                        }
                    };

                    roomRadioRecorder.start();
                    isRoomRadioRecording = true;

                    btn.innerHTML = '正在录制';
                    btn.style.color = '#ff4d4f';
                    btn.style.borderColor = '#ff4d4f';

                } catch (err) {
                    console.error("电台录制失败:", err);
                    alert("无法录制！环境可能不支持。错误信息：" + err.message);
                }
            } else {
                if (roomRadioRecorder && roomRadioRecorder.state !== 'inactive') {
                    roomRadioRecorder.stop();
                }
                isRoomRadioRecording = false;

                btn.innerHTML = '开始录制';
                btn.style.color = '';
                btn.style.borderColor = '';
            }
        }

        const PLAYER_MODE_ORDER = ['sequence', 'loop-one', 'shuffle'];
        const PLAYER_MODE_LABELS = {
            'sequence': '顺序',
            'loop-one': '单曲',
            'shuffle': '随机'
        };

        let currentAudioCtime = 0;
        let isAudioLoading = false;
        let audioProgramPlaylist = [];
        let currentAudioProgramTalkId = null;
        let currentAudioProgramPlayMode = localStorage.getItem('yaya_audio_program_play_mode') || 'sequence';

        let musicPlaylist = [];
        let currentMusicPlayMode = localStorage.getItem('yaya_music_play_mode') || 'sequence';

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
            localStorage.setItem('yaya_audio_program_play_mode', currentAudioProgramPlayMode);
            updateAudioProgramPlayModeButton();
            showToast(`电台播放模式：${getPlayerModeLabel(currentAudioProgramPlayMode)}`);
        }

        function cycleMusicPlayMode() {
            currentMusicPlayMode = getNextPlayMode(currentMusicPlayMode);
            localStorage.setItem('yaya_music_play_mode', currentMusicPlayMode);
            updateMusicPlayModeButton();
            showToast(`音乐播放模式：${getPlayerModeLabel(currentMusicPlayMode)}`);
        }

        function toggleAudioProgramQueue() {
            const panel = document.getElementById('audio-player-queue');
            if (!panel) return;
            panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'block' : 'none';
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
                <button class="player-queue-item ${String(item.talkId) === String(currentAudioProgramTalkId) ? 'active' : ''}" onclick="playAudioProgram(${item.talkId})">
                    <span class="player-queue-item-index">${index + 1}</span>
                    <div class="player-queue-item-main">
                        <div class="player-queue-item-title">${escapeHtml(item.title || '未命名节目')}</div>
                        <div class="player-queue-item-sub">${escapeHtml(item.subTitle || '口袋电台')}</div>
                    </div>
                    <span class="player-queue-item-time">${escapeHtml(item.dateStr || '')}</span>
                </button>
            `).join('');
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
                        <div class="player-queue-item-title">${escapeHtml(item.title || '未命名歌曲')}</div>
                        <div class="player-queue-item-sub">${escapeHtml(item.subTitle || item.joinMemberNames || '官方单曲')}</div>
                    </div>
                    <span class="player-queue-item-time">${escapeHtml(item.dateStr || '')}</span>
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
                            } else {
                                const endTip = document.createElement('div');
                                endTip.style.cssText = 'grid-column: 1 / -1; text-align: center; color: var(--text-sub); font-size: 12px; margin-top: 20px; padding: 10px;';
                                endTip.innerText = `— 已加载全部 ${totalCount} 期电台节目 —`;
                                container.appendChild(endTip);
                            }
                            break;
                        }

                        totalCount += data.length;

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

                            let guestInlineHtml = '';
                            if (item.guest) {
                                guestInlineHtml = `
                                <div style="font-size: 12px; color: var(--text-sub); opacity: 0.65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; margin-bottom: 4px;">
                                    嘉宾: ${item.guest}
                                </div>`;
                            }

                            const card = document.createElement('div');
                            card.style.cssText = `display: flex; position: relative; padding: 12px; gap: 14px; cursor: pointer; align-items: flex-start; background: var(--input-bg); border-radius: 12px; border: 1px solid var(--border); transition: all 0.2s ease; box-sizing: border-box;`;

                            card.onmouseover = () => {
                                card.style.borderColor = 'var(--primary)';
                                card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                                card.style.transform = 'translateY(-1px)';
                            };
                            card.onmouseout = () => {
                                card.style.borderColor = 'var(--border)';
                                card.style.boxShadow = 'none';
                                card.style.transform = 'translateY(0)';
                            };

                            card.innerHTML = `
                            <img src="${coverUrl}" style="width: 90px; height: 90px; border-radius: 8px; object-fit: cover; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                            
                            <div style="flex: 1; display: flex; flex-direction: column; min-height: 90px; justify-content: space-between; overflow: hidden;">
                                
                                <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
                                    <div style="font-weight: 700; font-size: 15px; color: var(--text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal; overflow: hidden; text-overflow: ellipsis; line-height: 1.3;">${item.title}</div>
                                    <div style="font-size: 12px; color: var(--text-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; opacity: 0.8;">${realSubtitle}</div>
                                </div>

                                <div style="display: flex; flex-direction: column; overflow: hidden;">
                                    ${guestInlineHtml}
                                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(0,0,0,0.03); padding-top: 5px;">
                                        <span style="font-size: 11px; color: #fa8c16; font-weight: bold; letter-spacing: -0.1px;">▶ ${item.playNum || 0} 次</span>
                                        <span style="font-size: 11px; color: var(--text-sub); opacity: 0.5;">${dateStr}</span>
                                    </div>
                                </div>
                            </div>
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

        async function playAudioProgram(talkId, title, coverUrl, subTitle) {
            try {
                const playlistItem = audioProgramPlaylist.find(item => String(item.talkId) === String(talkId));
                if (playlistItem) {
                    title = playlistItem.title;
                    coverUrl = playlistItem.coverUrl;
                    subTitle = playlistItem.subTitle;
                }

                const res = await fetchPocketAPI('/media/api/media/v1/talk', JSON.stringify({ resId: talkId.toString() }));

                if (res && res.success && res.content) {
                    const filePath = (res.content.data && res.content.data.filePath) || res.content.filePath;
                    if (!filePath) return showToast('❌ 未找到该节目的音频文件');
                    currentAudioProgramTalkId = talkId;

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
                            progressBar.style.background = 'rgba(0,0,0,0.08)';
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
                        subTitleEl.innerText = subTitle || '正在播放';

                        if (coverEl) coverEl.classList.remove('vinyl-pause');
                        if (dotEl) {
                            dotEl.style.background = '#28a745';
                            dotEl.style.boxShadow = '0 0 6px #28a745';
                        }
                    };

                    audioEl.onpause = () => {
                        if (coverEl) coverEl.classList.add('vinyl-pause');
                        if (dotEl) {
                            dotEl.style.background = '#ffc107';
                            dotEl.style.boxShadow = '0 0 6px #ffc107';
                        }
                    };

                    audioEl.onerror = () => {
                        currentUrlIndex++;
                        if (currentUrlIndex < tryUrls.length) {
                            console.log(`[电台播放] 节点失效，尝试备用线路 (${currentUrlIndex + 1}/${tryUrls.length})`);
                            subTitleEl.innerText = `切换线路 (${currentUrlIndex + 1}/${tryUrls.length})...`;

                            if (dotEl) {
                                dotEl.style.background = '#ffc107';
                                dotEl.style.boxShadow = '0 0 6px #ffc107';
                            }

                            audioEl.src = tryUrls[currentUrlIndex];
                            audioEl.play().catch(e => { });
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
                    audioEl.play().catch(e => {
                        console.warn('浏览器可能拦截了自动播放，需用户手动点击播放键', e);
                    });

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
            const timeCurrent = document.getElementById('custom-time-current');
            const timeDuration = document.getElementById('custom-time-duration');

            const volumeIcon = document.getElementById('audio-volume-icon');
            const volumeBar = document.getElementById('audio-volume-bar');

            updateAudioProgramPlayModeButton();

            const formatTime = (seconds) => {
                if (!seconds || isNaN(seconds)) return "00:00";
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
                progressBar.max = audioEl.duration;
                timeDuration.innerText = formatTime(audioEl.duration);
            });

            audioEl.addEventListener('timeupdate', () => {
                if (!progressBar.matches(':active')) {
                    progressBar.value = audioEl.currentTime;
                }
                timeCurrent.innerText = formatTime(audioEl.currentTime);

                const percent = (audioEl.currentTime / audioEl.duration) * 100 || 0;
                progressBar.style.background = `linear-gradient(to right, var(--primary) ${percent}%, rgba(0,0,0,0.08) ${percent}%)`;
            });

            progressBar.addEventListener('input', () => {
                audioEl.currentTime = progressBar.value;
                timeCurrent.innerText = formatTime(progressBar.value);
                const percent = (progressBar.value / audioEl.duration) * 100 || 0;
                progressBar.style.background = `linear-gradient(to right, var(--primary) ${percent}%, rgba(0,0,0,0.08) ${percent}%)`;
            });

            const savedVolume = localStorage.getItem('yaya_music_volume');
            if (savedVolume !== null) {
                const vol = parseFloat(savedVolume);
                audioEl.volume = vol;
                if (volumeBar) volumeBar.value = vol;
            }

            const updateVolumeUI = (vol) => {
                if (!volumeIcon || !volumeBar) return;
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

            if (volumeBar) {
                volumeBar.addEventListener('input', (e) => {
                    const vol = parseFloat(e.target.value);
                    audioEl.volume = vol;
                    audioEl.muted = false;
                    localStorage.setItem('yaya_music_volume', vol);
                    updateVolumeUI(vol);
                });
                volumeBar.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const step = e.deltaY < 0 ? 0.05 : -0.05;
                    const nextVol = Math.max(0, Math.min(1, (audioEl.muted ? 0 : audioEl.volume) + step));
                    audioEl.volume = nextVol;
                    audioEl.muted = false;
                    volumeBar.value = String(nextVol);
                    localStorage.setItem('yaya_music_volume', nextVol);
                    updateVolumeUI(nextVol);
                }, { passive: false });
            }

            if (volumeIcon) {
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
        }

        function stopAudioProgram() {
            const audioEl = document.getElementById('native-audio-player');
            const playerBar = document.getElementById('audio-player-bar');
            const titleEl = document.getElementById('audio-player-title');

            if (audioEl) {
                audioEl.onerror = null;
                audioEl.onplaying = null;
                audioEl.onpause = null;

                audioEl.pause();
                audioEl.src = "";
                try { audioEl.load(); } catch (e) { }
            }

            if (playerBar) {
                playerBar.style.display = 'none';
            }

            if (titleEl) {
                titleEl.classList.remove('is-scrolling');
                titleEl.innerText = "未播放";
            }
        }

        let musicNextCtime = 0;
        let musicHasMore = true;
        let isMusicLoading = false;
        let isMusicAutoLoading = false;
        let currentPlayingMusicId = null;
        let currentMusicLyrics = [];
        let currentMusicLyricMeta = null;
        let currentMusicLyricActiveIndex = -1;
        let currentMusicLyricsVisible = false;

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
            if (!panel) return;
            currentMusicLyricsVisible = typeof forceVisible === 'boolean' ? forceVisible : !currentMusicLyricsVisible;
            panel.style.display = currentMusicLyricsVisible ? 'block' : 'none';
            updateMusicLyricsToggleButton();
            if (currentMusicLyricsVisible) {
                const queuePanel = document.getElementById('music-player-queue');
                if (queuePanel) queuePanel.style.display = 'none';
                if (currentMusicLyrics.length) {
                    syncMusicLyrics(document.getElementById('music-native-audio')?.currentTime || 0, true);
                }
            }
        }

        async function loadMusicLyrics(meta) {
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
                buildMusicLyricIndexedPaths(meta, index).forEach(path => {
                    urls.push(`${MUSIC_LYRICS_BASE_URL}/${encodeMusicLyricPath(path)}`);
                });
            } catch (err) {
                console.warn('读取歌词索引失败', err);
            }

            const uniqueUrls = [...new Set(urls)];
            let lrcText = '';
            for (const url of uniqueUrls) {
                try {
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    lrcText = await res.text();
                    if (lrcText) break;
                } catch (_) { }
            }

            if (!lrcText) {
                setMusicLyricsPanelState('empty', '当前歌曲暂无歌词');
                return;
            }

            currentMusicLyrics = parseMusicLrc(lrcText);
            if (!currentMusicLyrics.length) {
                setMusicLyricsPanelState('empty', '歌词格式暂不支持');
                return;
            }

            renderMusicLyrics();
            syncMusicLyrics(document.getElementById('music-native-audio')?.currentTime || 0, true);
        }

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

            let termPinyin = kw;
            if (window.pinyinPro && kw) {
                termPinyin = pinyinPro.pinyin(kw, { toneType: 'none', type: 'array' }).join('').toLowerCase();
            }

            const cards = grid.querySelectorAll('.music-card');
            let visibleCount = 0;

            cards.forEach(card => {
                const text = card.textContent.toLowerCase();

                let isMatch = text.includes(kw);

                if (!isMatch && window.pinyinPro && kw) {
                    if (card._cachedPinyin === undefined) {
                        card._cachedPinyin = pinyinPro.pinyin(text, { toneType: 'none', type: 'array' }).join('').toLowerCase();
                    }
                    if (card._cachedPinyin.includes(termPinyin)) {
                        isMatch = true;
                    }
                }

                card.style.display = isMatch ? 'flex' : 'none';
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

            let termPinyin = kw;
            if (window.pinyinPro && kw) {
                termPinyin = pinyinPro.pinyin(kw, { toneType: 'none', type: 'array' }).join('').toLowerCase();
            }

            const children = grid.children;
            let visibleCount = 0;

            for (let i = 0; i < children.length; i++) {
                const card = children[i];

                if (card.id === 'video-loading-tip') continue;

                const text = card.textContent.toLowerCase();
                let isMatch = text.includes(kw);

                if (!isMatch && window.pinyinPro && kw) {
                    if (card._cachedPinyin === undefined) {
                        card._cachedPinyin = pinyinPro.pinyin(text, { toneType: 'none', type: 'array' }).join('').toLowerCase();
                    }
                    if (card._cachedPinyin.includes(termPinyin)) {
                        isMatch = true;
                    }
                }

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

            let termPinyin = kw;
            if (window.pinyinPro && kw) {
                termPinyin = pinyinPro.pinyin(kw, { toneType: 'none', type: 'array' }).join('').toLowerCase();
            }

            let visibleCount = 0;
            const children = grid.children;

            for (let i = 0; i < children.length; i++) {
                const card = children[i];

                if (card.id === 'audio-empty-tip' || card.textContent.includes('已加载全部')) {
                    continue;
                }

                const text = card.textContent.toLowerCase();

                let isMatch = text.includes(kw);

                if (!isMatch && window.pinyinPro && kw) {
                    if (card._cachedPinyin === undefined) {
                        card._cachedPinyin = pinyinPro.pinyin(text, { toneType: 'none', type: 'array' }).join('').toLowerCase();
                    }

                    if (card._cachedPinyin.includes(termPinyin)) {
                        isMatch = true;
                    }
                }

                card.style.display = isMatch ? 'flex' : 'none';

                if (isMatch) visibleCount++;
            }

            let emptyTip = document.getElementById('audio-empty-tip');
            if (visibleCount === 0 && kw !== '') {
                if (!emptyTip) {
                    emptyTip = document.createElement('div');
                    emptyTip.id = 'audio-empty-tip';
                    emptyTip.style.cssText = `grid-column: 1 / -1; width: 100%; text-align: center; padding: 80px 0; color: var(--text-sub); display: flex; flex-direction: column; align-items: center; opacity: 0.8;`;
                    emptyTip.innerHTML = `<div style="font-size: 40px; margin-bottom: 15px; opacity: 0.2;">📻</div><div style="font-weight: 500;">未找到相关电台</div>`;
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


            const savedVolume = localStorage.getItem('yaya_music_volume');
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
                localStorage.setItem('yaya_music_volume', vol);
                updateVolumeUI(vol);
            });
            volumeBar.addEventListener('wheel', (e) => {
                e.preventDefault();
                const step = e.deltaY < 0 ? 0.05 : -0.05;
                const nextVol = Math.max(0, Math.min(1, (audioEl.muted ? 0 : audioEl.volume) + step));
                audioEl.volume = nextVol;
                audioEl.muted = false;
                volumeBar.value = String(nextVol);
                localStorage.setItem('yaya_music_volume', nextVol);
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
            try {
                const playlistItem = musicPlaylist.find(item => String(item.musicId) === String(musicId));
                if (playlistItem) {
                    title = playlistItem.title;
                    subTitle = playlistItem.subTitle;
                    thumbPath = playlistItem.thumbPath;
                }

                const res = await fetchPocketAPI('/media/api/media/v1/music', JSON.stringify({ resId: String(musicId) }));
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

                    if (audioEl && playerBar) {
                        currentPlayingMusicId = musicId;
                        initMusicPlayerUI();
                        updateMusicPlayModeButton();
                        updateMusicLyricsToggleButton();
                        renderMusicQueue();

                        const radioEl = document.getElementById('native-audio-player');
                        if (radioEl) radioEl.pause();
                        if (typeof currentPlayingVideo !== 'undefined' && currentPlayingVideo) currentPlayingVideo.pause();

                        audioEl.onerror = null;
                        audioEl.onplaying = null;
                        audioEl.onpause = null;

                        audioEl.src = fullUrl;
                        titleEl.innerText = title;
                        subTitleEl.innerText = subTitle || '官方单曲';
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
                            if (coverEl) coverEl.classList.remove('vinyl-pause');
                            if (dotEl) {
                                dotEl.style.background = '#28a745';
                                dotEl.style.boxShadow = '0 0 6px #28a745';
                            }
                        };

                        audioEl.onpause = () => {
                            if (coverEl) coverEl.classList.add('vinyl-pause');
                            if (dotEl) {
                                dotEl.style.background = '#ffc107';
                                dotEl.style.boxShadow = '0 0 6px #ffc107';
                            }
                        };

                        audioEl.play().catch(e => {
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
            try {
                const res = await fetchPocketAPI('/media/api/media/v1/video', JSON.stringify({ resId: videoId.toString() }));
                if (res && res.success && res.content) {
                    const filePath = res.content.data.filePath || res.content.filePath;
                    const fullUrl = `https://mp4.48.cn${filePath}`;

                    const modal = document.getElementById('video-player-modal');
                    const video = document.getElementById('main-video-player');

                    document.getElementById('video-playing-title').innerText = title;
                    document.getElementById('video-playing-subtitle').innerText = subTitle || '';

                    video.src = fullUrl;
                    modal.style.display = 'flex';
                    video.play();

                    if (typeof stopAudioProgram === 'function') stopAudioProgram();
                }
            } catch (e) {
                showToast('视频地址解析失败');
            }
        }

        function closeVideoPlayer() {
            const modal = document.getElementById('video-player-modal');
            const video = document.getElementById('main-video-player');
            video.pause();
            video.src = "";
            modal.style.display = 'none';
        }

        let activeFollowedChannel = '';
        let activeFollowedServer = '';
        let activeFollowedName = '';
        let activeFollowedNextTime = 0;
        let isFollowedChatLoading = false;
        let currentFollowedData = [];
        window.allFollowedIds = new Set();

        function toggleFollowedSortDropdown() {
            const list = document.getElementById('followed-sort-dropdown');
            if (list) {
                list.style.display = (list.style.display === 'block') ? 'none' : 'block';
            }
        }

        function selectFollowedSort(value, text) {
            document.getElementById('followed-sort-value').value = value;
            document.getElementById('followed-sort-display').value = text;
            document.getElementById('followed-sort-dropdown').style.display = 'none';

            if (typeof sortFollowedRooms === 'function') {
                sortFollowedRooms();
            }
        }

        window.sortFollowedRooms = function () {
            const sortMode = document.getElementById('followed-sort-value')?.value || 'default'; let sortedData = [...currentFollowedData];

            if (sortMode === 'name') {
                sortedData.sort((a, b) => {
                    const isInactiveA = a.isInGroup === false;
                    const isInactiveB = b.isInGroup === false;

                    if (isInactiveA !== isInactiveB) {
                        return isInactiveA ? 1 : -1;
                    }

                    if (window.pinyinPro) {
                        const pA = pinyinPro.pinyin(a.bigDisplayName, { toneType: 'none', type: 'array' }).join('');
                        const pB = pinyinPro.pinyin(b.bigDisplayName, { toneType: 'none', type: 'array' }).join('');
                        return pA.localeCompare(pB);
                    }
                    return a.bigDisplayName.localeCompare(b.bigDisplayName, 'zh-CN');
                });
            } else if (sortMode === 'team') {
                sortedData.sort((a, b) => {
                    const isInactiveA = a.isInGroup === false;
                    const isInactiveB = b.isInGroup === false;

                    if (isInactiveA !== isInactiveB) {
                        return isInactiveA ? 1 : -1;
                    }

                    const idA = parseInt(a.teamId) || 999999;
                    const idB = parseInt(b.teamId) || 999999;

                    if (idA !== idB) {
                        return idA - idB;
                    }

                    if (window.pinyinPro) {
                        const pA = pinyinPro.pinyin(a.bigDisplayName, { toneType: 'none', type: 'array' }).join('');
                        const pB = pinyinPro.pinyin(b.bigDisplayName, { toneType: 'none', type: 'array' }).join('');
                        return pA.localeCompare(pB);
                    }
                    return a.bigDisplayName.localeCompare(b.bigDisplayName, 'zh-CN');
                });
            } else {
                const savedOrder = JSON.parse(localStorage.getItem('yaya_followed_custom_order') || '[]');

                if (savedOrder.length > 0) {
                    sortedData.sort((a, b) => {
                        const indexA = savedOrder.indexOf(String(a.channelId));
                        const indexB = savedOrder.indexOf(String(b.channelId));

                        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                        if (indexA !== -1) return -1;
                        if (indexB !== -1) return 1;
                        return b.msgTime - a.msgTime;
                    });
                } else {
                    sortedData.sort((a, b) => b.msgTime - a.msgTime);
                }
            }

            renderFollowedRoomsList(sortedData);
        };

        async function loadFollowedRooms() {
            const container = document.getElementById('followed-rooms-container');
            const token = appToken || localStorage.getItem('yaya_p48_token');
            if (!token) {
                container.innerHTML = '<div class="placeholder-tip"><h3>⚠️ 未登录</h3></div>';
                return;
            }

            const refreshBtn = document.querySelector('button[onclick="loadFollowedRooms()"]');
            if (refreshBtn) {
                refreshBtn.innerText = '刷新';
                refreshBtn.disabled = true;
            }

            if (!container.querySelector('.session-card')) {
                container.innerHTML = '<div class="empty-state">正在加载</div>';
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const friendsRes = await ipcRenderer.invoke('fetch-friends-ids', { token, pa });
                if (friendsRes.status !== 200 || !friendsRes.content?.data) throw new Error('获取失败');

                const followedIds = friendsRes.content.data;

                window.allFollowedIds = new Set(followedIds.map(id => String(id)));

                if (!window.isMemberDataLoaded) await loadMemberData();

                const followedMembers = [];
                const serverIds = new Set();

                followedIds.forEach(uid => {
                    const member = memberData.find(m => String(m.id || m.userId) === String(uid));
                    if (member && member.channelId) {
                        followedMembers.push(member);
                        if (member.serverId) serverIds.add(member.serverId);
                    }
                });

                const msgRes = await ipcRenderer.invoke('fetch-last-messages', {
                    token, pa, serverIdList: Array.from(serverIds)
                });

                const lastMsgs = msgRes.content?.lastMsgList || [];

                currentFollowedData = followedMembers.map(m => {
                    const msg = lastMsgs.find(msg => String(msg.channelId) === String(m.channelId)) || {};
                    const apiStarName = msg.starName || m.ownerName || '未知';
                    let bigDisplayName = m.ownerName || '未知成员';

                    if (bigDisplayName.includes('SNH48-') || bigDisplayName.includes('GNZ48-') ||
                        bigDisplayName.includes('BEJ48-') || bigDisplayName.includes('CKG48-') ||
                        bigDisplayName.includes('CGT48-')) {
                        bigDisplayName = bigDisplayName.split('-')[1] || bigDisplayName;
                    }

                    let lastText = msg.msgContent || '[暂无新消息]';

                    return {
                        ...m,
                        bigDisplayName: bigDisplayName,
                        pinkStarName: apiStarName,
                        lastText: typeof replaceTencentEmoji === 'function' ? replaceTencentEmoji(lastText) : lastText,
                        msgTime: msg.msgTime || 0,
                        unread: parseInt(msg.unreadCount || 0)
                    };
                });

                sortFollowedRooms();

                const currentSearchId = document.getElementById('quick-follow-id')?.value;
                const currentSearchName = document.getElementById('quick-follow-input')?.value;
                if (currentSearchId && typeof selectQuickFollowMember === 'function') {
                    selectQuickFollowMember(currentSearchName, currentSearchId);
                }

            } catch (e) {
                container.innerHTML = `<div class="empty-state">❌ ${e.message}</div>`;
            } finally {
                if (refreshBtn) {
                    refreshBtn.innerText = '刷新';
                    refreshBtn.disabled = false;
                }
            }
        }

        function renderFollowedRoomsList(renderData) {
            const container = document.getElementById('followed-rooms-container');
            const sortMode = document.getElementById('followed-sort-select')?.value || 'default';
            const isCustomSort = sortMode === 'default';

            let html = '';
            renderData.forEach(item => {
                const teamName = item.team || '';
                const isInactive = item.isInGroup === false;
                let colorStyle = (typeof getTeamStyle === 'function') ? getTeamStyle(teamName, isInactive) : '';

                const teamHtml = teamName ?
                    `<span class="team-tag" style="font-size: 10px; padding: 0 6px; height: 16px; line-height: 14px; font-weight: 500; border-radius: 8px; ${colorStyle}">${teamName}</span>`
                    : '';

                const unreadHtml = item.unread > 0
                    ? `<span style="background:#ff4d4f; color:#fff; font-size:10px; padding:0 6px; border-radius:10px; margin-left:8px; font-weight:bold;">${item.unread}</span>`
                    : '';

                const isActive = activeFollowedChannel === item.channelId ? 'active' : '';

                const draggableAttr = isCustomSort ? 'draggable="true"' : '';
                const cursorStyle = isCustomSort ? 'cursor: grab;' : 'cursor: pointer;';

                html += `
        <div class="session-card ${isActive}" id="session-card-${item.channelId}" data-channelid="${item.channelId}" ${draggableAttr} onclick="openFollowedChat('${item.bigDisplayName}', '${item.channelId}', '${item.serverId}')" style="padding: 12px 16px; border-bottom: 1px solid var(--border); transition: 0.2s; ${cursorStyle}">
            <div class="session-info" style="flex: 1; min-width: 0; pointer-events: none;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="display: flex; align-items: center; min-width: 0; flex: 1;">
                        <div class="session-title" style="font-size: 15px; font-weight: bold; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${item.bigDisplayName}
                        </div>
                        ${unreadHtml}
                    </div>
                    <div style="display: flex; align-items: center; flex-shrink: 0; margin-left: 10px;">
                        ${teamHtml}
                    </div>
                </div>
                <div class="session-msg" style="font-size: 12px; color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <span style="color:var(--primary); font-weight:bold;">${item.pinkStarName}</span>: ${item.lastText}
                </div>
            </div>
        </div>
    `;
            });

            container.innerHTML = html;

            if (isCustomSort) {
                const cards = container.querySelectorAll('.session-card');
                cards.forEach(card => {
                    card.addEventListener('dragstart', handleDragStart);
                    card.addEventListener('dragover', handleDragOver);
                    card.addEventListener('dragenter', handleDragEnter);
                    card.addEventListener('dragleave', handleDragLeave);
                    card.addEventListener('drop', handleDrop);
                    card.addEventListener('dragend', handleDragEnd);
                });
            }
        }

        let draggedCard = null;

        function handleDragStart(e) {
            draggedCard = this;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
            this.style.opacity = '0.4';
        }

        function handleDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return false;
        }

        function handleDragEnter(e) {
            e.preventDefault();
            if (this !== draggedCard) {
                this.classList.add('drag-over-target');
            }
        }

        function handleDragLeave(e) {
            this.classList.remove('drag-over-target');
        }

        function handleDrop(e) {
            e.stopPropagation();
            this.classList.remove('drag-over-target');

            if (draggedCard !== this) {
                const container = document.getElementById('followed-rooms-container');
                const cards = Array.from(container.querySelectorAll('.session-card'));
                const draggedIndex = cards.indexOf(draggedCard);
                const targetIndex = cards.indexOf(this);

                if (draggedIndex < targetIndex) {
                    this.parentNode.insertBefore(draggedCard, this.nextSibling);
                } else {
                    this.parentNode.insertBefore(draggedCard, this);
                }

                saveCustomRoomOrder();
            }
            return false;
        }

        function handleDragEnd(e) {
            this.style.opacity = '1';
            document.querySelectorAll('.session-card').forEach(c => {
                c.classList.remove('drag-over-target');
            });
        }

        function saveCustomRoomOrder() {
            const container = document.getElementById('followed-rooms-container');
            const cards = container.querySelectorAll('.session-card');
            const newOrder = Array.from(cards).map(card => card.getAttribute('data-channelid'));
            localStorage.setItem('yaya_followed_custom_order', JSON.stringify(newOrder));
        }

        let followedAutoRefreshTimer = null;
        let activeFollowedMainChannel = '';
        let isFollowedSmallRoomMode = false;
        let followedStickToBottom = true;
        let followedUserScrollLockUntil = 0;
        let followedLastScrollTop = 0;
        let followedAutoScrollToken = 0;
        let followedPendingBottomTimer = null;
        let followedPendingHtml = '';
        let followedPendingCount = 0;
        let followedPendingMessageIds = new Set();

        function resetFollowedPendingBottomTimer() {
            if (followedPendingBottomTimer) {
                clearTimeout(followedPendingBottomTimer);
                followedPendingBottomTimer = null;
            }
        }

        function invalidateFollowedAutoScrollJobs() {
            followedAutoScrollToken += 1;
            resetFollowedPendingBottomTimer();
        }

        function getFollowedNewMessageNotice() {
            return document.getElementById('followed-chat-new-messages');
        }

        function updateFollowedPendingNotice() {
            const btn = getFollowedNewMessageNotice();
            if (!btn) return;

            if (followedPendingCount > 0) {
                btn.style.display = 'inline-flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                btn.innerText = `有 ${followedPendingCount} 条新消息`;
                return;
            }

            btn.style.display = 'none';
            btn.innerText = '有新消息';
        }

        function resetFollowedPendingMessages() {
            followedPendingHtml = '';
            followedPendingCount = 0;
            followedPendingMessageIds.clear();
            updateFollowedPendingNotice();
        }

        function collectFollowedRenderedMessageIds(container, includePending = false) {
            const ids = new Set();

            if (container) {
                container.querySelectorAll('.msg-item').forEach(el => {
                    if (el.dataset.msgid) ids.add(String(el.dataset.msgid));
                });
            }

            if (includePending) {
                followedPendingMessageIds.forEach(id => ids.add(String(id)));
            }

            return ids;
        }

        function removeFollowedEmptyState(container) {
            if (!container) return;
            container.querySelectorAll('.empty-state').forEach(el => el.remove());
        }

        function queueFollowedPendingBatch(batchHtml, messageIds) {
            if (!batchHtml || !messageIds || messageIds.length === 0) {
                return;
            }

            followedPendingHtml += batchHtml;
            messageIds.forEach(id => followedPendingMessageIds.add(String(id)));
            followedPendingCount = followedPendingMessageIds.size;
            updateFollowedPendingNotice();
        }

        function hydrateFollowedPreviewMedia(container) {
            if (!container) return;

            container.querySelectorAll('.preview-media-placeholder').forEach(el => {
                const type = el.getAttribute('data-type');
                const src = el.getAttribute('data-src');
                if (src) {
                    if (type === 'audio' && typeof createCustomAudioPlayer === 'function') {
                        el.appendChild(createCustomAudioPlayer(src));
                    } else if (type === 'video' && typeof createCustomVideoPlayer === 'function') {
                        el.appendChild(createCustomVideoPlayer(src));
                    }
                }
                el.classList.remove('preview-media-placeholder');
            });
        }

        function scrollFollowedToBottom(msgBox, respectAutoScrollLock = false) {
            if (!msgBox) return;

            const autoScrollTokenAtAppend = followedAutoScrollToken;

            resetFollowedPendingBottomTimer();
            msgBox.scrollTop = msgBox.scrollHeight;
            followedLastScrollTop = msgBox.scrollTop;

            const goBottomSmart = () => {
                if (autoScrollTokenAtAppend !== followedAutoScrollToken) {
                    return;
                }
                if (!respectAutoScrollLock || canFollowedAutoScroll(msgBox)) {
                    msgBox.scrollTop = msgBox.scrollHeight;
                    followedLastScrollTop = msgBox.scrollTop;
                }
            };

            msgBox.querySelectorAll('img').forEach(img => {
                if (!img.complete) {
                    img.addEventListener('load', goBottomSmart, { once: true });
                    img.addEventListener('error', goBottomSmart, { once: true });
                }
            });

            followedPendingBottomTimer = setTimeout(() => {
                followedPendingBottomTimer = null;
                goBottomSmart();
            }, 300);
        }

        window.flushFollowedPendingMessages = function () {
            const msgBox = document.getElementById('followed-chat-messages');
            if (!msgBox || !followedPendingHtml) {
                resetFollowedPendingMessages();
                return;
            }

            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            invalidateFollowedAutoScrollJobs();
            removeFollowedEmptyState(msgBox);

            const fragment = document.createRange().createContextualFragment(followedPendingHtml);
            msgBox.appendChild(fragment);
            hydrateFollowedPreviewMedia(msgBox);
            resetFollowedPendingMessages();
            scrollFollowedToBottom(msgBox, false);
        };

        function updateFollowedScrollStickState(container) {
            if (!container) return;

            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            const isNearBottom = distanceFromBottom < 60;
            const isScrollingUp = container.scrollTop < followedLastScrollTop - 2;
            followedLastScrollTop = container.scrollTop;

            if (isNearBottom) {
                followedStickToBottom = true;
                followedUserScrollLockUntil = 0;
                return;
            }

            if (isScrollingUp) {
                followedStickToBottom = false;
                followedUserScrollLockUntil = Number.MAX_SAFE_INTEGER;
                return;
            }

            if (!followedStickToBottom) {
                return;
            }
        }

        function canFollowedAutoScroll(container) {
            if (!container) return false;

            if (followedStickToBottom) return true;

            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            if (distanceFromBottom < 60) {
                followedStickToBottom = true;
                followedUserScrollLockUntil = 0;
                return true;
            }

            if (Date.now() < followedUserScrollLockUntil) {
                return false;
            }

            return false;
        }

        function lockFollowedAutoScroll() {
            followedStickToBottom = false;
            followedUserScrollLockUntil = Number.MAX_SAFE_INTEGER;
            invalidateFollowedAutoScrollJobs();
        }

        window.openFollowedChat = function (ownerName, channelId, serverId) {
            activeFollowedChannel = channelId;
            activeFollowedMainChannel = channelId;
            activeFollowedServer = serverId;
            activeFollowedName = ownerName;
            activeFollowedNextTime = 0;
            isFollowedSmallRoomMode = false;
            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            followedLastScrollTop = 0;
            invalidateFollowedAutoScrollJobs();
            resetFollowedPendingMessages();

            if (followedAutoRefreshTimer) {
                clearInterval(followedAutoRefreshTimer);
                followedAutoRefreshTimer = null;
            }

            const roomBtn = document.getElementById('btn-toggle-room-type');
            if (roomBtn) {
                roomBtn.innerText = "大房间";
                roomBtn.classList.remove('btn-primary');
                roomBtn.classList.add('btn-secondary');
            }

            document.querySelectorAll('.session-card').forEach(card => card.classList.remove('active'));
            const selectedCard = document.getElementById(`session-card-${channelId}`);
            if (selectedCard) selectedCard.classList.add('active');

            const header = document.getElementById('followed-chat-header');
            header.style.visibility = 'visible';
            document.getElementById('followed-chat-title').innerText = `${ownerName} 的房间`;
            document.getElementById('followed-chat-subtitle').innerText = `Channel ID: ${channelId}`;

            const avatarImg = document.getElementById('followed-chat-avatar');
            const memberInfo = memberData.find(m => String(m.channelId) === String(channelId));

            if (memberInfo && memberInfo.id) {
                const avatarPath = window.globalAvatarCache[memberInfo.id] ||
                    (memberInfo.avatar ? (memberInfo.avatar.startsWith('http') ? memberInfo.avatar : `https://source.48.cn${memberInfo.avatar}`) : null);

                if (avatarPath) {
                    avatarImg.src = avatarPath;
                    avatarImg.style.display = 'block';
                } else {
                    avatarImg.style.display = 'none';
                }
            } else {
                avatarImg.style.display = 'none';
            }

            const msgBox = document.getElementById('followed-chat-messages');
            msgBox.style.transition = 'opacity 0.2s';
            msgBox.style.opacity = '0.4';
            msgBox.style.pointerEvents = 'none';

            loadFollowedChatPage(false).finally(() => {
                followedAutoRefreshTimer = setInterval(() => {
                    const view = document.getElementById('view-followed-rooms');
                    if (document.hidden || (view && view.style.display === 'none')) {
                        return;
                    }
                    loadFollowedChatPage(false, true);
                }, 5000);
            });
        };

        window.toggleFollowedRoomType = function () {
            if (isFollowedChatLoading || !activeFollowedName) return;

            const memberInfo = memberData.find(m => m.ownerName === activeFollowedName);

            if (!isFollowedSmallRoomMode) {
                const smallRoomId = memberInfo ? memberInfo.yklzId : null;
                if (!smallRoomId) {
                    showToast(`⚠️ 未在数据中找到 ${activeFollowedName} 的小房间 ID`);
                    return;
                }
                isFollowedSmallRoomMode = true;
                activeFollowedChannel = smallRoomId;
            } else {
                isFollowedSmallRoomMode = false;
                activeFollowedChannel = activeFollowedMainChannel;
            }

            const btn = document.getElementById('btn-toggle-room-type');
            if (isFollowedSmallRoomMode) {
                btn.innerText = "小房间";
            } else {
                btn.innerText = "大房间";
            }

            document.getElementById('followed-chat-subtitle').innerText = `Channel ID: ${activeFollowedChannel} ${isFollowedSmallRoomMode ? '' : ''}`;

            activeFollowedNextTime = 0;
            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            followedLastScrollTop = 0;
            invalidateFollowedAutoScrollJobs();
            resetFollowedPendingMessages();
            const msgBox = document.getElementById('followed-chat-messages');
            msgBox.style.transition = 'opacity 0.2s';
            msgBox.style.opacity = '0.4';
            msgBox.style.pointerEvents = 'none';
            msgBox.innerHTML = '';

            loadFollowedChatPage(false);
        };

        window.jumpToFullRoom = function () {
            if (!activeFollowedChannel) return;
            switchView('fetch');
            document.getElementById('member-search').value = activeFollowedName;
            document.getElementById('tool-channel').value = activeFollowedChannel;
            document.getElementById('tool-server').value = activeFollowedServer;
            setTimeout(() => document.getElementById('btn-fetch-one').click(), 300);
        };

        let isFollowedChatAllMode = false;

        window.toggleFollowedChatMode = function () {
            if (isFollowedChatLoading) return;

            isFollowedChatAllMode = !isFollowedChatAllMode;
            const btn = document.getElementById('btn-toggle-followed-mode');
            const msgBox = document.getElementById('followed-chat-messages');

            btn.innerText = "切换中...";
            btn.disabled = true;

            msgBox.style.transition = 'opacity 0.2s';
            msgBox.style.opacity = '0.4';

            if (isFollowedChatAllMode) {
            } else {
            }

            activeFollowedNextTime = 0;
            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            followedLastScrollTop = 0;
            invalidateFollowedAutoScrollJobs();
            resetFollowedPendingMessages();

            loadFollowedChatPage(false).finally(() => {
                btn.innerText = isFollowedChatAllMode ? "全部消息" : "成员消息";
                btn.disabled = false;
            });
        };

        async function loadFollowedChatPage(isLoadMore, isAutoRefresh = false) {
            if (isFollowedChatLoading) return;
            isFollowedChatLoading = true;

            const msgBox = document.getElementById('followed-chat-messages');
            const token = appToken || localStorage.getItem('yaya_p48_token');
            const pa = window.getPA ? window.getPA() : null;

            const oldScrollHeight = msgBox.scrollHeight;
            const shouldAutoScroll = canFollowedAutoScroll(msgBox);

            try {
                const fetchNextTime = isAutoRefresh ? 0 : activeFollowedNextTime;

                const res = await ipcRenderer.invoke('fetch-room-messages', {
                    token: token,
                    serverId: activeFollowedServer,
                    channelId: activeFollowedChannel,
                    pa: pa,
                    nextTime: fetchNextTime,
                    fetchAll: isFollowedChatAllMode
                });

                if (res.success && res.data.content) {
                    if (res.usedServerId) activeFollowedServer = res.usedServerId;
                    const content = res.data.content;
                    let list = content.messageList || content.message || [];

                    list = list.filter(m => {
                        let sid = m.senderUserId || m.senderId || m.uid;
                        if (!sid && m.extInfo) {
                            try {
                                const ext = typeof m.extInfo === 'string' ? JSON.parse(m.extInfo) : m.extInfo;
                                if (ext.user) sid = ext.user.userId || ext.user.id;
                            } catch (e) { }
                        }
                        return String(sid) !== '121569667';
                    });

                    if (!isAutoRefresh && !isLoadMore) {
                        activeFollowedNextTime = content.nextTime;
                        if (list.length === 0) activeFollowedNextTime = 0;
                    } else if (isLoadMore) {
                        activeFollowedNextTime = content.nextTime;
                    }

                    if (!isLoadMore && !isAutoRefresh) msgBox.innerHTML = '';
                    const oldBtn = document.getElementById('btn-load-more-followed');
                    if (oldBtn) oldBtn.remove();

                    if (list.length === 0 && !isLoadMore && !isAutoRefresh) {
                        msgBox.innerHTML = '<div class="empty-state" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text-sub); font-size: 14px;">暂无新消息</div>';
                        isFollowedChatLoading = false;
                        return;
                    }

                    const reversedList = [...list].reverse();
                    const existingIds = isAutoRefresh
                        ? collectFollowedRenderedMessageIds(msgBox, true)
                        : new Set();
                    const batchMessageIds = [];

                    const batchHtml = reversedList.map(m => {
                        const msgId = m.msgidClient || m.msgId || m.msgTime;

                        if (typeof isAutoRefresh !== 'undefined' && isAutoRefresh && typeof existingIds !== 'undefined' && existingIds.has(String(msgId))) {
                            return '';
                        }

                        batchMessageIds.push(String(msgId));

                        let txt = '[不支持的消息格式]';
                        let isMember = false;
                        let displayName = m.senderName || '未知用户';
                        let avatarUrl = './icon.png';
                        let body = m.bodys || m.msgContent || '';
                        let extraHtml = '';

                        const safeStr = (str) => String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                        if (m.extInfo) {
                            try {
                                const safeExtInfo = typeof m.extInfo === 'string' ? m.extInfo.replace(/:\s*([0-9]{16,})/g, ':"$1"') : m.extInfo;
                                const ext = typeof safeExtInfo === 'string' ? JSON.parse(safeExtInfo) : safeExtInfo;
                                if (ext && ext.user) {
                                    if (ext.user.roleId > 1) isMember = true;
                                    if (ext.user.nickName) displayName = ext.user.nickName;
                                    if (ext.user.avatar) {
                                        avatarUrl = ext.user.avatar.startsWith('http') ? ext.user.avatar : `https://source.48.cn${ext.user.avatar}`;
                                    }
                                }
                            } catch (e) { console.warn('用户信息(extInfo)解析失败', e); }
                        }

                        try {
                            let json = null;
                            if (typeof body === 'string' && (body.startsWith('{') || body.startsWith('['))) {
                                try {
                                    json = JSON.parse(body);
                                    if (typeof json === 'string') json = JSON.parse(json);
                                } catch (parseErr) { }
                            } else if (typeof body === 'object' && body !== null) {
                                json = body;
                            }

                            if (json) {
                                const msgType = (m.msgType || '').toUpperCase();
                                const jsonType = (json.messageType || '').toUpperCase();

                                if (msgType === 'TEXT') {
                                    txt = `<p class="mb-2 template-pre">${safeStr(json.text || json.bodys || body)}</p>`;
                                } else if (msgType === 'IMAGE') {
                                    const url = json.url.startsWith('http') ? json.url : `https://source3.48.cn${json.url}`;
                                    txt = `<div class="mb-2"><img class="template-media" src="${url}" loading="lazy" style="max-height: 250px; border-radius: 8px; cursor: zoom-in;" onclick="openImageModal('${url}')"></div>`;
                                } else if (msgType === 'EXPRESSIMAGE') {
                                    const url = json.expressImgInfo ? json.expressImgInfo.emotionRemote : json.url;
                                    txt = `<div class="mb-2"><img class="template-image-express-image" src="${url.startsWith('http') ? url : 'https://source3.48.cn' + url}"></div>`;
                                } else if (msgType === 'REPLY' || msgType === 'GIFTREPLY') {
                                    let info = json.replyInfo || json.giftReplyInfo || (json.bodys && (json.bodys.replyInfo || json.bodys.giftReplyInfo));
                                    const rName = safeStr(info?.replyName || '用户');
                                    const rText = safeStr(info?.replyText || '消息');
                                    const myText = safeStr(info?.text || json.text || body);
                                    txt = `<p class="mb-2 template-pre">${myText}</p>
                                           <blockquote class="ml-2 mb-2 p-2" style="background: var(--blockquote-bg); border-left: 4px solid var(--border); color: var(--text-sub); border-radius: 0 4px 4px 0;">
                                               ${rName}：${rText}
                                           </blockquote>`;
                                } else if (msgType === 'AUDIO') {
                                    let mediaUrl = json.url.startsWith('http') ? json.url : `https://mp4.48.cn${json.url.startsWith('/') ? '' : '/'}${json.url}`;
                                    txt = `<div class="mb-2 preview-media-placeholder" data-type="audio" data-src="${mediaUrl}"></div>`;
                                } else if (msgType === 'VIDEO') {
                                    let mediaUrl = json.url.startsWith('http') ? json.url : `https://mp4.48.cn${json.url.startsWith('/') ? '' : '/'}${json.url}`;
                                    txt = `<div class="mb-2 preview-media-placeholder" data-type="video" data-src="${mediaUrl}"></div>`;
                                } else if (jsonType === 'GIFT_TEXT' || msgType === 'GIFT_TEXT') {
                                    const info = json.giftInfo || json;
                                    let unitCost = info.money || info.cost;
                                    if (!unitCost && typeof POCKET_GIFT_DATA !== 'undefined') {
                                        const g = POCKET_GIFT_DATA.find(x => x.id == (info.giftId || info.id) || x.name === info.giftName);
                                        if (g) unitCost = g.cost;
                                    }
                                    const totalCostStr = unitCost ? ` (约 ${unitCost * info.giftNum} 🍗)` : '';
                                    txt = `<p class="mb-2" style="color:#eb2f96; font-weight:bold;">🎁 送出了 [${safeStr(info.giftName)}] x${info.giftNum}${totalCostStr}</p>`;
                                } else if (msgType.includes('FLIPCARD') || jsonType.includes('FLIPCARD')) {
                                    const possibleKeys = ['flipCardInfo', 'filpCardInfo', 'flipCardAudioInfo', 'filpCardAudioInfo', 'flipCardVideoInfo', 'filpCardVideoInfo'];
                                    let flipInfo = null;
                                    for (const key of possibleKeys) {
                                        if (json[key]) { flipInfo = json[key]; break; }
                                        if (json.bodys && json.bodys[key]) { flipInfo = json.bodys[key]; break; }
                                    }
                                    const qText = flipInfo?.question || json.question || '（无法解析的问题内容）';
                                    let aContent = flipInfo?.answer || json.answer || '';
                                    let ansHtml = '';
                                    if (msgType === 'FLIPCARD' || (jsonType === 'FLIPCARD' && typeof aContent === 'string' && !aContent.includes('url'))) {
                                        ansHtml = `<div style="font-size:14px; color:var(--text); line-height:1.6; padding:0 4px;">${safeStr(aContent)}</div>`;
                                    } else {
                                        try {
                                            const ansObj = typeof aContent === 'string' ? JSON.parse(aContent) : aContent;
                                            if (ansObj && ansObj.url) {
                                                let mediaUrl = ansObj.url.startsWith('http') ? ansObj.url : `https://mp4.48.cn${ansObj.url.startsWith('/') ? '' : '/'}${ansObj.url}`;
                                                const mType = (msgType.includes('AUDIO') || jsonType.includes('AUDIO')) ? 'audio' : 'video';
                                                ansHtml = `<div class="preview-media-placeholder" data-type="${mType}" data-src="${mediaUrl}" style="margin-top:8px;"></div>`;
                                            }
                                        } catch (e) { }
                                    }
                                    txt = `<div style="margin-bottom: 8px;">
                                                <span class="flip-label question-tag" style="margin-right:8px; transform:none; display:inline-flex;">翻牌提问</span>
                                                <span style="font-size:14px; color:var(--text); line-height: 1.5;">${safeStr(qText)}</span>
                                           </div>
                                           <div style="margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 8px;">
                                                <span class="flip-label answer-tag" style="margin-right:8px; transform:none; display:inline-flex;">成员回答</span>
                                                ${ansHtml}
                                           </div>`;
                                } else if (msgType === 'LIVEPUSH' || msgType === 'LIVE_PUSH' || jsonType === 'LIVEPUSH') {
                                    const info = json.livePushInfo || json;
                                    const liveTitle = safeStr(info.liveTitle || '直播开始了');
                                    const liveId = info.liveId;
                                    const cover = info.liveCover ? (info.liveCover.startsWith('http') ? info.liveCover : `https://source.48.cn${info.liveCover}`) : './icon.png';
                                    const d = new Date(m.msgTime);
                                    const pad = (n) => String(n).padStart(2, '0');
                                    const tStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                                    const escapedTitle = liveTitle.replace(/'/g, "\\'");
                                    const escapedName = safeStr(displayName).replace(/'/g, "\\'");
                                    txt = `<div class="vod-card-row" style="margin-top: 8px; width: 100%; box-sizing: border-box; background: var(--bg); border: 1px solid var(--border); box-shadow: none;" 
                                         onclick="event.stopPropagation(); playArchiveFromMessage('${liveId}', '${escapedName}', '${tStr}', '${escapedTitle}')">
                                        <div class="vod-row-cover-container" style="width: 100px; height: 56px; border-radius: 6px;">
                                            <img src="${cover}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">
                                            <div class="vod-badge badge-replay" style="bottom: 4px; right: 4px; background-color: #52c41a;">回放</div>
                                        </div>
                                        <div class="vod-row-info" style="height: 56px; justify-content: space-between;">
                                            <div class="vod-row-name" style="font-size: 14px; color: var(--text);">${safeStr(displayName)}</div>
                                            <div class="vod-row-title" style="font-size: 12px; color: var(--text-sub);">${liveTitle}</div>
                                            <div class="vod-row-time" style="font-size: 11px; color: var(--text-sub); opacity: 0.6;">${tStr}</div>
                                        </div>
                                    </div>`;
                                } else if (jsonType.startsWith('RED_PACKET')) {
                                    const blessMessage = safeStr(json.blessMessage || '送来了红包祝福');
                                    const creatorName = safeStr(json.creatorName || displayName || '未知用户');
                                    const starName = safeStr(json.starName || '');
                                    const packetImageRaw = json.openImgUrl || json.coverUrl || '';
                                    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
                                    const packetMainTextColor = isDarkTheme ? 'rgba(255,255,255,0.96)' : 'var(--text)';
                                    const packetMetaTextColor = isDarkTheme ? 'rgba(255,255,255,0.82)' : 'var(--text)';
                                    const packetImage = packetImageRaw
                                        ? (packetImageRaw.startsWith('http') ? packetImageRaw : `https://source.48.cn${packetImageRaw}`)
                                        : './icon.png';
                                    txt = `<div style="display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:10px; background: linear-gradient(135deg, rgba(255,120,117,0.12) 0%, rgba(255,120,117,0.04) 100%), var(--input-bg); border:1px solid rgba(255,120,117,0.22); width: 220px; max-width: 220px; box-sizing: border-box;">
                                        <img src="${packetImage}" style="width:34px; height:34px; object-fit:cover; border-radius:6px; flex-shrink:0; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
                                        <div style="min-width:0; flex:1;">
                                            <div style="font-size:10px; color:#ff7875; font-weight:bold; margin-bottom:2px;">红包</div>
                                            <div style="font-size:12px; color:${packetMainTextColor}; font-weight:bold; line-height:1.35; word-break:break-word;">${blessMessage}</div>
                                            <div style="font-size:11px; color:${packetMetaTextColor}; margin-top:4px; line-height:1.35; word-break:break-word;">${creatorName}${starName ? ` · ${starName}` : ''}</div>
                                        </div>
                                    </div>`;
                                } else if (
                                    msgType === 'AUDIO_GIFT_REPLY' ||
                                    jsonType === 'AUDIO_GIFT_REPLY' ||
                                    msgType === 'AUDIO_REPLY' ||
                                    jsonType === 'AUDIO_REPLY'
                                ) {
                                    const info = json.replyInfo || json.giftReplyInfo || json;
                                    let voiceUrl = info.voiceUrl || '';
                                    if (voiceUrl && !voiceUrl.startsWith('http')) {
                                        voiceUrl = `https://mp4.48.cn${voiceUrl.startsWith('/') ? '' : '/'}${voiceUrl}`;
                                    }
                                    const rName = safeStr(info.replyName || '未知用户');
                                    const rText = safeStr(info.replyText || '');
                                    txt = '';
                                    extraHtml = `<div class="preview-media-placeholder" data-type="audio" data-src="${voiceUrl}" style="margin: 0 0 12px 0;"></div>
                                            <div style="background: var(--blockquote-bg); padding: 8px 12px; border-radius: 6px; border-left: 3px solid var(--border); margin: 0 0 8px 0; color: var(--text-sub); font-size: 13px; line-height: 1.5;">
                                                ${rName}：${rText}
                                            </div>`;
                                } else {
                                    txt = `<p class="mb-2 template-pre">${safeStr(body)}</p>`;
                                }
                            } else {
                                txt = `<p class="mb-2 template-pre">${safeStr(body)}</p>`;
                            }
                            if (typeof replaceTencentEmoji === 'function' && txt) txt = replaceTencentEmoji(txt);
                        } catch (e) {
                            txt = `<p class="mb-2 template-pre" style="color: #fa8c16;">[原生内容] ${safeStr(body)}</p>`;
                        }

                        const d = new Date(m.msgTime);
                        const pad = (n) => String(n).padStart(2, '0');
                        const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

                        const nameColor = isMember ? '#FB7299' : 'var(--text)';
                        const fontWeight = 'bold';
                        const safeTxt = txt || '';
                        const idDisplay = (m.senderUserId && String(m.senderUserId) !== '0')
                            ? `<span style="color: var(--text-sub); opacity: 0.7; font-size:10px; margin-left:6px; ">(ID:${m.senderUserId})</span>`
                            : '';

                        const nameColorVar = isMember ? 'var(--msg-name-member)' : 'var(--msg-name-fan)';

                        return `
    <div class="msg-item" data-msgid="${msgId}" style="display: flex; padding: 8px 0; border-bottom: 1px solid var(--border);">
        <img src="${avatarUrl}" class="avatar" 
             style="width: 34px; height: 34px; border-radius: 50%; margin-right: 12px; margin-top: 2px; flex-shrink: 0; object-fit: cover; border: 1px solid rgba(0,0,0,0.05);">
        <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; margin-bottom: 2px;">
                <span style="color: ${nameColorVar}; font-weight: bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 75%;">
                    ${safeStr(displayName)}
                </span>
                
                <span style="margin-left: auto; color: var(--text-sub); font-size: 10px; opacity: 0.5; flex-shrink: 0;">
                    ${timeStr}
                </span>
            </div>
            <div style="color: var(--text); font-size: 13.5px; line-height: 1.4; word-break: break-all; margin-top: 2px;">
                ${txt}
                ${extraHtml}
            </div>
        </div>
   </div>`;
                    }).join('');

                    if (isAutoRefresh && !batchHtml) {
                        return;
                    }

                    if (isAutoRefresh && !shouldAutoScroll) {
                        queueFollowedPendingBatch(batchHtml, batchMessageIds);
                        return;
                    }

                    removeFollowedEmptyState(msgBox);
                    const fragment = document.createRange().createContextualFragment(batchHtml);

                    if (isLoadMore) {
                        msgBox.prepend(fragment);
                        const newScrollTop = msgBox.scrollHeight - oldScrollHeight;

                        msgBox.scrollTop = newScrollTop <= 0 ? 1 : newScrollTop;
                        followedLastScrollTop = msgBox.scrollTop;
                    } else {
                        msgBox.appendChild(fragment);
                        if (!isAutoRefresh || shouldAutoScroll) {
                            scrollFollowedToBottom(msgBox, isAutoRefresh);
                        }
                    }

                    if (activeFollowedNextTime > 0) {
                        const oldTip = document.getElementById('btn-load-more-followed');
                        if (oldTip) oldTip.remove();
                    }

                    hydrateFollowedPreviewMedia(msgBox);
                }
            } catch (e) {
                console.error(e);
            } finally {
                isFollowedChatLoading = false;

                const msgBox = document.getElementById('followed-chat-messages');
                if (!isAutoRefresh) {
                    msgBox.style.opacity = '1';
                    msgBox.style.pointerEvents = 'auto';
                }
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            const followedMsgBox = document.getElementById('followed-chat-messages');
            if (followedMsgBox) {
                followedMsgBox.addEventListener('wheel', function (event) {
                    if (event.deltaY < 0) {
                        lockFollowedAutoScroll();
                    }
                }, { passive: true });

                let followedTouchStartY = 0;
                followedMsgBox.addEventListener('touchstart', function (event) {
                    followedTouchStartY = event.touches && event.touches[0] ? event.touches[0].clientY : 0;
                }, { passive: true });

                followedMsgBox.addEventListener('touchmove', function (event) {
                    const currentY = event.touches && event.touches[0] ? event.touches[0].clientY : 0;
                    if (currentY > followedTouchStartY + 4) {
                        lockFollowedAutoScroll();
                    }
                }, { passive: true });

                followedMsgBox.addEventListener('scroll', function () {
                    updateFollowedScrollStickState(this);

                    if (followedPendingCount > 0 && canFollowedAutoScroll(this)) {
                        window.flushFollowedPendingMessages();
                        return;
                    }

                    if (isFollowedChatLoading || !activeFollowedNextTime || activeFollowedNextTime === 0) return;

                    if (this.scrollTop < 100) {
                        loadFollowedChatPage(true);
                    }
                });
            }

            document.addEventListener('keydown', function (event) {
                const followedMsgBox = document.getElementById('followed-chat-messages');
                const view = document.getElementById('view-followed-rooms');
                if (!followedMsgBox || !view || view.style.display === 'none') return;

                if (event.key === 'PageUp' || event.key === 'ArrowUp') {
                    lockFollowedAutoScroll();
                }
            });
        });

        window.globalAvatarCache = window.globalAvatarCache || {};

        async function loadMemberAvatar(memberId, channelId) {
            if (!memberId || !channelId) return;

            if (window.globalAvatarCache[memberId]) {
                updateSessionAvatar(channelId, window.globalAvatarCache[memberId]);
                return;
            }

            const token = appToken || localStorage.getItem('yaya_p48_token');
            const pa = window.getPA ? window.getPA() : null;

            try {
                const res = await ipcRenderer.invoke('fetch-star-archives', { token, pa, memberId });
                if (res.success && res.content) {
                    const info = res.content.starInfo || res.content;
                    let avatarPath = info.avatar || info.userAvatar;

                    if (avatarPath) {
                        const fullUrl = avatarPath.startsWith('http') ? avatarPath : `https://source.48.cn${avatarPath}`;
                        window.globalAvatarCache[memberId] = fullUrl;
                        updateSessionAvatar(channelId, fullUrl);
                    }
                }
            } catch (e) {
            }
        }

        function updateSessionAvatar(channelId, url) {
            const card = document.getElementById(`session-card-${channelId}`);
            if (card) {
                const img = card.querySelector('.session-avatar');
                if (img) {
                    img.src = url;
                    img.style.animation = 'fadeIn 0.5s ease-in';
                }
            }
        }

        window.handleQuickFollowSearch = function (keyword) {
            const resultBox = document.getElementById('quick-follow-results');
            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }

            if (!window.isMemberDataLoaded) {
                if (typeof loadMemberData === 'function') loadMemberData();
            }

            const lowerKw = keyword.toLowerCase();
            let matches = memberData.filter(m => {
                const matchName = m.ownerName.includes(keyword);
                const pinyin = m.pinyin || "";
                const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : "";
                return matchName || pinyin.toLowerCase().includes(lowerKw) || initials.toLowerCase().includes(lowerKw);
            });

            matches.sort(memberSortLogic);

            if (matches.length > 0) {
                const html = matches.slice(0, 10).map(m => {
                    const isInactive = m.isInGroup === false;
                    const colorStyle = typeof getTeamStyle === 'function' ? getTeamStyle(m.team, isInactive) : '';
                    return `
                <div class="suggestion-item" onclick="selectQuickFollowMember('${m.ownerName}', '${m.id || m.userId}')" 
                     style="display: flex; justify-content: space-between; align-items: center; padding: 8px;">
                    <span style="font-weight:bold; font-size:12px; ${isInactive ? 'opacity:0.6' : ''}">${m.ownerName}</span>
                    <span class="team-tag" style="font-size:10px; padding:0 4px; height:16px; line-height:14px; ${colorStyle}">${m.team}</span>
                </div>`;
                }).join('');
                resultBox.innerHTML = html;
                resultBox.style.display = 'block';
            } else {
                resultBox.innerHTML = '<div class="suggestion-item" style="font-size:12px; color:#999;">未找到该成员</div>';
                resultBox.style.display = 'block';
            }
        };

        window.selectQuickFollowMember = function (name, id) {
            document.getElementById('quick-follow-input').value = name;
            document.getElementById('quick-follow-id').value = id;
            document.getElementById('quick-follow-results').style.display = 'none';

            const btn = document.getElementById('btn-quick-action');
            if (window.allFollowedIds.has(String(id))) {
                btn.innerText = "取关";
                btn.style.color = "#ff4d4f";
            } else {
                btn.innerText = "关注";
                btn.style.color = "";
            }
        };

        window.executeQuickAction = async function () {
            const memberId = document.getElementById('quick-follow-id').value;
            const memberName = document.getElementById('quick-follow-input').value;
            const btn = document.getElementById('btn-quick-action');
            const token = appToken || localStorage.getItem('yaya_p48_token');
            const pa = window.getPA ? window.getPA() : null;

            if (!token || !memberId) return showToast('⚠️ 请先选择成员');

            const isUnfollow = btn.innerText === "取关";
            const channel = isUnfollow ? 'unfollow-member' : 'follow-member';

            showToast(`正在${isUnfollow ? '取消关注' : '关注'} ${memberName}...`);

            try {
                const res = await ipcRenderer.invoke(channel, { token, pa, memberId });
                if (res.success) {
                    showToast(`✅ ${isUnfollow ? '已取消关注' : '成功关注'} ${memberName}`);

                    document.getElementById('quick-follow-input').value = '';
                    document.getElementById('quick-follow-id').value = '';
                    btn.innerText = "关注";
                    btn.style.color = "";

                    if (typeof loadFollowedRooms === 'function') setTimeout(loadFollowedRooms, 500);
                } else {
                    showToast(`❌ 失败: ${res.msg}`);
                }
            } catch (e) {
                showToast(`❌ 错误: ${e.message}`);
            }
        };

        document.addEventListener('mousedown', function (e) {
            const resultBox = document.getElementById('quick-follow-results');
            const input = document.getElementById('quick-follow-input');
            if (resultBox && !resultBox.contains(e.target) && e.target !== input) {
                resultBox.style.display = 'none';
            }

            const privateDetailBody = document.getElementById('private-message-detail-body');
            if (privateDetailBody) {
                privateDetailBody.addEventListener('scroll', function () {
                    if (this.scrollTop <= 40 && privateMessageDetailState.targetUserId && privateMessageDetailState.hasMore && !privateMessageDetailState.loading) {
                        loadMorePrivateMessageDetail();
                    }
                }, { passive: true });
            }
        });

        document.addEventListener('click', function (e) {
            if (e.target.classList.contains('modal-overlay')) {
                const modalId = e.target.id;
                if (modalId === 'userModal' && typeof closeUserAnalysis === 'function') closeUserAnalysis();
                if (modalId === 'dateModal' && typeof closeDateAnalysis === 'function') closeDateAnalysis();
                if (modalId === 'danmuAnalysisModal' && typeof closeDanmuAnalysis === 'function') closeDanmuAnalysis();
                if (modalId === 'speechAnalysisModal' && typeof closeSpeechAnalysis === 'function') closeSpeechAnalysis();
                if (modalId === 'giftAnalysisModal' && typeof closeGiftAnalysis === 'function') closeGiftAnalysis();
                if (modalId === 'flipAnalysisModal' && typeof closeFlipAnalysis === 'function') closeFlipAnalysis();
                if (modalId === 'contextModal' && typeof closeContextModal === 'function') closeContextModal();
            }
        });

        function closeActiveOverlayOrDropdown() {
            const modalClosers = [
                { id: 'contextModal', close: () => typeof closeContextModal === 'function' && closeContextModal() },
                { id: 'imageModal', close: () => typeof closeImageModal === 'function' && closeImageModal() },
                { id: 'userModal', close: () => typeof closeUserAnalysis === 'function' && closeUserAnalysis() },
                { id: 'dateModal', close: () => typeof closeDateAnalysis === 'function' && closeDateAnalysis() },
                { id: 'danmuAnalysisModal', close: () => typeof closeDanmuAnalysis === 'function' && closeDanmuAnalysis() },
                { id: 'speechAnalysisModal', close: () => typeof closeSpeechAnalysis === 'function' && closeSpeechAnalysis() },
                { id: 'giftAnalysisModal', close: () => typeof closeGiftAnalysis === 'function' && closeGiftAnalysis() },
                { id: 'flipAnalysisModal', close: () => typeof closeFlipAnalysis === 'function' && closeFlipAnalysis() },
                { id: 'global-announcement-modal', close: () => typeof closeAnnouncement === 'function' && closeAnnouncement() }
            ];

            for (const item of modalClosers) {
                const el = document.getElementById(item.id);
                if (el && window.getComputedStyle(el).display !== 'none') {
                    item.close();
                    return true;
                }
            }

            const openDropdowns = document.querySelectorAll('.suggestion-box');
            for (const dropdown of openDropdowns) {
                if (window.getComputedStyle(dropdown).display !== 'none') {
                    dropdown.style.display = 'none';
                    return true;
                }
            }

            return false;
        }

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;

            if (closeActiveOverlayOrDropdown()) {
                e.preventDefault();
                return;
            }

            const activeEl = document.activeElement;
            const isTyping =
                activeEl &&
                (
                    activeEl.tagName === 'INPUT' ||
                    activeEl.tagName === 'TEXTAREA' ||
                    activeEl.tagName === 'SELECT' ||
                    activeEl.isContentEditable
                );

            if (isTyping) return;
            if (currentViewName === 'home') return;

            e.preventDefault();
            switchView('home');
        });
