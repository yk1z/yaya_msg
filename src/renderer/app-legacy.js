        const {
            createMemberDirectory, getPinyinInitials, memberSortLogic, getGroupCode
        } = window.YayaRendererFeatures.memberDirectory;

        let initBilibiliLiveConfig;
        let enterBilibiliLiveView;
        let renderBilibiliLiveRoomButtons;
        let selectBilibiliLiveGroup;
        let startBilibiliLiveStatusPolling;
        let stopBilibiliLiveStatusPolling;
        let destroyBilibiliLivePlayer;
        let connectBilibiliLive;
        let stopBilibiliLive;
        let followedRoomScanStartTimer = null;
        let pocketAccountSessionGeneration = 0;
        let currentSelectedMemberName = '';
        let pocketAuth;
        let messageFetch;
        let handleOpenLiveSearch;
        let selectOpenLiveMember;
        let fetchOpenLiveList;
        let fetchAllOpenLive;
        let playOpenLiveVideo;
        let openOpenLiveInPotPlayer;
        let openOpenLiveParticipantsModal;
        let closeOpenLiveParticipantsModal;
        let enterPerformanceView;
        let openPerformanceById;
        let loadMorePerformanceList;
        let refreshPerformanceList;
        let selectPerformanceGroup;
        let searchPerformanceList;
        let handlePerformanceMemberSearch;
        let currentPlayingAudio = null;
        let currentPlayingVideo = null;
        let handleRoomRadioSearch;
        let selectRoomRadioMember;
        let connectRoomRadio;
        let openAutoRoomRadioRecordModal;
        let closeAutoRoomRadioRecordModal;
        let searchAutoRoomRadioRecordMembers;
        let toggleAutoRoomRadioRecording;
        let autoConnectFollowedRoomRadio;
        let ensureRoomRadioScanFresh;
        let startAllMemberRoomRadioAutoScan;
        let startFollowedMemberRoomRadioAutoScan;
        let stopAllMemberRoomRadioAutoScan;
        let toggleAllMemberRoomRadioScan;
        let toggleScannedRoomRadioMute;
        let toggleRadioMute;
        let stopRoomRadio;
        let toggleRoomRadioRecord;
        let initYk1zHomePanel;
        let applyCustomBackground;
        let initTheme;
        let toggleTheme;
        let updateThemeBtn;
        let ensureNimChatroomSdkLoaded;
        let disconnectLiveDanmu;
        let initArtLiveDanmu;
        let handleDanmuSearch;
        let loadTimelineSubtitleText;
        let openDanmuAnalysis;
        let closeDanmuAnalysis;
        let filterDanmuByUser;
        let parseSRT;
        let renderDanmuListUI;
        let closeDateAnalysis;
        let closeGiftAnalysis;
        let closeSpeechAnalysis;
        let closeUserAnalysis;
        let filterByDate;
        let filterByUser;
        let filterByUserId;
        let openDateAnalysis;
        let openFlipAnalysis;
        let openGiftAnalysis;
        let openSpeechAnalysis;
        let openUserAnalysis;
        let showInteractions;
        let closeFlipAnalysis;
        let applyFlipSearch;
        let changeFlipPage;
        let checkFlipCostMin;
        let executeDeleteFlip;
        let executeSendFlip;
        let executeSendLiveGift;
        let forceReloadFlips;
        let handleFlipSendSearch;
        let applyFlipTimeRangeFilter;
        let clearActiveFlipDateField;
        let loadFlipList;
        let pickTodayForFlipDate;
        let openFlipDatePicker;
        let renderLiveGiftGrid;
        let refreshFlipUserBalance;
        let selectFlipAnswer;
        let selectFlipMemberFilter;
        let selectFlipPrivacy;
        let selectFlipSendMember;
        let setDefaultFlipAnswerType;
        let openFlipDefaultSettings;
        let openFlipSendByMemberId;
        let closeFlipDefaultSettings;
        let saveFlipDefaultSettings;
        let selectFlipDefaultSetting;
        let toggleFlipDefaultSettingsDropdown;
        let selectFlipType;
        let selectFlipCalendarDate;
        let selectLiveGift;
        let setActiveFlipDateField;
        let shiftFlipDateCalendarYear;
        let shiftFlipDateCalendarMonth;
        let toggleGiftPanel;
        let toggleFlipAnswerDropdown;
        let toggleFlipDateDropdown;
        let toggleFlipMemberFilterDropdown;
        let toggleFlipPrivacyDropdown;
        let toggleFlipTypeDropdown;
        let toggleFlipVisibilityDropdown;
        let toggleFlipSortDropdown;
        let resetFlipTimeRangeFilter;
        let updateFlipCharCount;
        let updateLiveBalance;
        let updateLatestFlips;
        let selectFlipYear;
        let toggleFlipYearDropdown;
        let ensureCommunityFeedLoaded;
        let loadCommunityFeed;
        let loadMoreCommunityFeed;
        let refreshCommunityFeed;
        let resetTimelinePanel;
        let switchTimelineMode;
        let syncDanmuHighlight;
        let createCustomAudioPlayer;
        let createCustomVideoPlayer;
        let checkGitHubNotice;
        let closeAnnouncement;
        let openImageModal;
        let closeImageModal;
        let getPreferredExternalPlayerName;
        let openMediaInExternalPlayer;
        let openInBrowser;
        let insertAudioPlayerIntoMessage;
        let updateSearchSuggestions;
        let normalizeMemberLookupText;
        let getMemberLookupAliases;
        let findMemberRecordByQuery;
        let getMemberNamesById;
        let getMemberIdFromQuery;

        const roomSelection = window.YayaRendererFeatures.createRoomSelectionFeature({
            getMembers: () => memberData,
            getMemberDataLoaded: () => isMemberDataLoaded,
            loadMemberData: (...args) => loadMemberData(...args),
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle,
            escapeHtml,
            setSelectedMemberName(name) { currentSelectedMemberName = name; },
            switchView,
            showToast: message => window.showToast?.(message),
            selectRoomAlbumMember: (...args) => window.selectRoomAlbumMember(...args),
            fetchRoomAlbum: (...args) => window.fetchRoomAlbum(...args),
            selectRoomRadioMember: (...args) => selectRoomRadioMember(...args)
        });
        const {
            applyRoomAlbumChannelValue, applyRoomRadioChannelValue,
            openRoomAlbumByChannelId, openRoomAlbumForRoom, openRoomRadioByChannelId,
            setRoomRadioRoomType, getFetchRoomType
        } = roomSelection;

        let currentPlayingItem = null;
        let liveAnnouncementDismissed = false;
        const currentRoute = { view: 'home', mode: null, mediaMode: 'live' };
        let pendingMediaReturnView = null;
        let activeMediaReturnView = null;
        let mediaPlaybackViewToken = 0;

        const playbackLifecycle = window.YayaRendererFeatures.createPlaybackLifecycle({
            getView: () => currentRoute.view,
            getAudio: () => currentPlayingAudio,
            setAudio: value => { currentPlayingAudio = value; },
            getVideo: () => currentPlayingVideo,
            setVideo: value => { currentPlayingVideo = value; },
            stopAudioProgram: () => stopAudioProgram?.(),
            closeVideoPlayer: () => closeVideoPlayer?.(),
            destroyBilibiliLivePlayer: value => destroyBilibiliLivePlayer?.(value),
            stopBilibiliLiveStatusPolling: () => stopBilibiliLiveStatusPolling?.(),
            stopPrivateMessagePolling: () => stopPrivateMessagePolling?.(),
            stopFollowedRoomsPolling: () => stopFollowedRoomsPolling?.()
        });

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
        const {
            getAppSettingsApi, getStoredAppToken, migrateLegacyPersistentState,
            readStoredStringSetting, writeStoredStringSetting,
            readStoredJsonSetting, writeStoredJsonSetting, removeStoredSetting
        } = window.YayaRendererFeatures.appPreferences;

        function getCurrentAppToken() {
            return pocketAuth?.getToken() || getStoredAppToken();
        }

        window.getAppToken = getCurrentAppToken;

        function enterAccountView() {
            const savedToken = getStoredAppToken();
            const tokenInput = document.getElementById('login-token');
            if (savedToken && tokenInput) tokenInput.value = savedToken;

            if (pocketAuth.getToken() || savedToken) {
                if (!pocketAuth.getToken()) pocketAuth.setToken(savedToken);
                pocketAuth.checkToken();
                loadMemberData();
            } else {
                const panelInput = document.getElementById('panel-login');
                const panelSuccess = document.getElementById('panel-logged-in');
                if (typeof window.setWebAccountAuthPending === 'function') {
                    window.setWebAccountAuthPending(false);
                }
                if (panelInput) panelInput.style.display = 'block';
                if (panelSuccess) panelSuccess.style.display = 'none';
            }

            settingsPanel.refreshBilibiliLoginStatus(true);
            pocketAuth.refreshMeet48AuthPanel();
        }

        function enterFollowedRoomsView() {
            const roomListLoading = !window.desktop?.isRoomWindow ? loadFollowedRooms() : null;
            if (!window.desktop?.isRoomWindow && typeof startFollowedMemberRoomRadioAutoScan === 'function') {
                const generation = pocketAccountSessionGeneration;
                Promise.resolve(roomListLoading).then(() => {
                    if (currentRoute.view !== 'followed-rooms' || generation !== pocketAccountSessionGeneration) return;
                    clearTimeout(followedRoomScanStartTimer);
                    followedRoomScanStartTimer = setTimeout(() => {
                        followedRoomScanStartTimer = null;
                        if (currentRoute.view === 'followed-rooms' && generation === pocketAccountSessionGeneration) {
                            startFollowedMemberRoomRadioAutoScan();
                        }
                    }, 600);
                });
            }
            const activeRoomRadioChannelId = typeof getActiveFollowedChannel === 'function'
                ? getActiveFollowedChannel()
                : '';
            if (!window.desktop?.isRoomWindow && activeRoomRadioChannelId && typeof window.autoConnectFollowedRoomRadio === 'function') {
                const activeRoomCard = document.querySelector(
                    `.session-card[data-channelid="${activeRoomRadioChannelId}"], .session-card[data-small-channel-id="${activeRoomRadioChannelId}"]`
                );
                window.autoConnectFollowedRoomRadio(
                    activeRoomRadioChannelId,
                    activeRoomCard?.dataset?.serverId || '',
                    activeRoomCard?.dataset?.memberId || '',
                    activeRoomCard?.dataset?.ownerName || ''
                );
            }
            if (!window.desktop?.isRoomWindow && typeof startFollowedRoomsPolling === 'function') startFollowedRoomsPolling();
        }

        function enterAudioProgramsView() {
            const list = document.getElementById('audio-programs-list');
            if (list && list.innerHTML.trim() === '') {
                Promise.resolve(loadAudioPrograms(0)).finally(() => window.restoreAudioProgramPlayerState?.());
            } else {
                window.restoreAudioProgramPlayerState?.();
            }
        }

        const appNavigation = window.YayaRendererFeatures.createAppNavigation({
            route: currentRoute,
            getCurrentAppToken,
            getPocketUserId: () => (pocketAuth?.getUserId() || ''),
            getTokenValidator: () => typeof checkToken === 'function' ? checkToken : null,
            showToast: message => window.showToast?.(message),
            clearWebMessageData: () => window.clearWebMessageData(),
            syncMessageIndexLoadingShield: () => messageArchive.syncMessageIndexLoadingShield(),
            onLeave(previous, next, mode) {
                mediaCatalog.leaveView(previous, next, mode);
                mediaPlaybackViewToken += 1;
                if (next === 'media') {
                    activeMediaReturnView = pendingMediaReturnView;
                    pendingMediaReturnView = null;
                }
                if (next !== 'room-radio' && typeof stopAllMemberRoomRadioAutoScan === 'function') stopAllMemberRoomRadioAutoScan();
                if (previous === 'room-radio' && next !== previous && typeof stopRoomRadio === 'function') stopRoomRadio(true);
            },
            afterHide(next, desktopNavigation) {
                if (typeof destroyPlayers === 'function' && (!desktopNavigation || art || nimInstance)) destroyPlayers();
                playbackLifecycle.stopPlaybackOnViewChange(next);
            },
            beforeEnter() {
                clearTimeout(followedRoomScanStartTimer);
                followedRoomScanStartTimer = null;
            },
            onEnter: {
                'media': () => mediaCatalog.showList(),
                'messages': () => messageArchive.enterMessagesView(),
                'netface': () => window.enterNetfaceView?.(),
                'invoice': () => window.enterInvoiceView?.(),
                'database': () => window.mountDatabaseView?.(),
                'melee-rank': () => window.initMeleeRankDataPage?.(),
                'official-site-music': () => window.loadOfficialSiteMusic?.(),
                'private-messages'() {
                    loadPrivateMessageList?.({
                        reset: !privateMessageListState.initialized || privateMessageListState.items.length === 0,
                        loadAll: isWebRuntime || !privateMessageListState.initialized,
                        refreshFromTop: !isWebRuntime && privateMessageListState.initialized,
                        preserveScroll: !isWebRuntime && privateMessageListState.initialized,
                        silent: true
                    });
                    startPrivateMessagePolling();
                },
                'bilibili-live': () => enterBilibiliLiveView(),
                'performance': () => enterPerformanceView?.(),
                'settings': () => settingsPanel.loadSettings(),
                'login': enterAccountView,
                'flip': () => loadFlipList?.(typeof flipCurrentPage === 'undefined' ? 0 : flipCurrentPage),
                'trip': () => { if (typeof window.ensureTripListLoaded === 'function') setTimeout(window.ensureTripListLoaded, 0); },
                'room-radio': () => startAllMemberRoomRadioAutoScan?.(),
                'audio-programs': enterAudioProgramsView,
                'community': () => ensureCommunityFeedLoaded?.(),
                'music-library'() {
                    const grid = document.getElementById('music-list-grid');
                    if (grid && grid.innerHTML.trim() === '') fetchAllMusicLibrary();
                },
                'followed-rooms': enterFollowedRoomsView,
                'video-library': () => fetchAllVideoLibrary()
            }
        });
        const { activateMediaPlaybackPage, closeAllModalOverlays } = appNavigation;

        function switchView(viewName, mode = null) {
            return appNavigation.navigate(viewName, mode);
        }

        appNavigation.install(switchView);

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
                        mainBtn.innerText = window.YayaRendererUtils.t('下载');
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
        const { openExternal } = window.desktop;
        const isWebRuntime = window.desktop && window.desktop.platform === 'web';
        ipcRenderer.on('live-recording-recovery', (event, result) => {
            const recovered = Number(result?.recovered || 0);
            const preserved = Number(result?.preserved || 0);
            const failed = Number(result?.failed || 0);
            if (!recovered && !preserved && !failed) return;
            setTimeout(() => {
                if (typeof showToast !== 'function') return;
                if (failed) {
                    showToast(`录制缓存恢复：成功 ${recovered + preserved} 个，失败 ${failed} 个`);
                } else {
                    showToast(`已恢复 ${recovered + preserved} 个未完成的录制文件`);
                }
            }, 1200);
        });
        const {
            memberNameMap, memberIdSet, memberTeamMap, bestNameMapForDisplay, loadMemberIdMap
        } = createMemberDirectory({
            getMembers: () => memberData,
            setMembers(list) {
                memberData = window.memberData = list;
                isMemberDataLoaded = window.isMemberDataLoaded = true;
            },
            loadMemberData,
            setStatus(message) {
                if (statusMsg) statusMsg.textContent = window.YayaRendererUtils.t(message);
            },
            onRefreshPrivateMessages() {
                if (privateMessageListState.items?.length) {
                    filterPrivateMessageList(document.getElementById('private-message-search')?.value || '', { preserveScroll: true });
                }
            },
            onRefreshSuggestions: () => updateSearchSuggestions?.()
        });

        openInBrowser = function (url) {
            try {
                openExternal(url);
            } catch (e) {
                window.open(url, '_blank');
            }
        };

        const DATA_BASE_URL = "https://data.gnz.hk";
        const MUSIC_LYRICS_BASE_URL = `${DATA_BASE_URL}/lyrics`;
        const MUSIC_LYRICS_INDEX_URL = `${DATA_BASE_URL}/lyrics-index.json`;
        const BILIBILI_LIVE_CONFIG_URL = `${DATA_BASE_URL}/bilibili-live.json`;
        const BILIBILI_LIVE_CONFIG_CACHE_KEY = 'bilibili_live_config_v1';

        const DEFAULT_BILIBILI_LIVE_CONFIG = {
            rooms: [
                { roomId: '48', title: 'SNH48' },
                { roomId: '391199', title: 'GNZ48' },
                { roomId: '383045', title: 'BEJ48' },
                { roomId: '6015846', title: 'CKG48' },
                { roomId: '27848865', title: 'CGT48' },
                { roomId: '1721763676', title: '星梦空间' },
                { roomId: '30187109', title: 'MEET48' }
            ]
        };

        const createYk1zHomeFeature = window.YayaRendererFeatures && window.YayaRendererFeatures.createYk1zHomeFeature;
        if (typeof createYk1zHomeFeature === 'function') {
            ({ initYk1zHomePanel } = createYk1zHomeFeature({
                DATA_BASE_URL,
                openInBrowser,
                switchView
            }));
            if (window.desktop?.platform && window.desktop.platform !== 'web') initYk1zHomePanel();
        } else {
            console.warn('createYk1zHomeFeature 未加载，跳过 yk1z 首页模块');
            initYk1zHomePanel = function noopInitYk1zHomePanel() {};
        }

        ({
            findMemberRecordByQuery,
            getMemberIdFromQuery,
            getMemberLookupAliases,
            getMemberNamesById,
            normalizeMemberLookupText,
            updateSearchSuggestions
        } = window.YayaRendererFeatures.createMemberLookupFeature({
            getBestNameMapForDisplay: () => bestNameMapForDisplay,
            getMemberData: () => memberData || [],
            getMemberNameMap: () => memberNameMap,
            getPinyinInitials
        }));
        const mediaCatalog = window.YayaRendererFeatures.createMediaCatalogFeature({
            fetchPocketAPI,
            isWebRuntime,
            invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
            getViewName: () => currentRoute.view,
            getMode: () => currentRoute.mediaMode,
            getPlaybackRevision: () => mediaPlaybackViewToken,
            getAccountGeneration: () => pocketAccountSessionGeneration,
            getMembers: () => memberData,
            membersLoaded: () => Boolean(window.isMemberDataLoaded || isMemberDataLoaded),
            loadMemberData: () => loadMemberData(),
            getMemberIdFromQuery,
            getMemberNamesById,
            getPinyinInitials,
            getGroupCode,
            memberSortLogic,
            getTeamStyle: (...args) => getTeamStyle(...args),
            getDownloadStatus: liveId => downloadStatusMap[liveId],
            directToPotPlayer: (...args) => directToPotPlayer(...args),
            handleDownloadDanmu: (...args) => handleDownloadDanmu(...args),
            handleDownloadVOD: (...args) => handleDownloadVOD(...args),
            playLiveStream: (...args) => playLiveStream(...args),
            showToast: message => showToast(message),
            escapeHtml
        });
        window.addEventListener('DOMContentLoaded', () => {
            if (window.desktop?.isRoomWindow) return;
            initBilibiliLiveConfig();
            initYk1zHomePanel();
        });

        const statusMsg = document.getElementById('statusMsg');
        const themeBtn = document.getElementById('themeBtn');
        const livePlayerView = document.getElementById('live-player-view');
        const currentLiveTitle = document.getElementById('current-live-title');
        const liveVideo = document.getElementById('live-video');
        const livePlayerArea = document.getElementById('live-player-area');
        const mediaListControls = document.getElementById('media-list-controls');
        const mediaListArea = document.getElementById('media-list-area');
        const messageArchive = window.YayaRendererFeatures.createMessageArchive({
            ipcRenderer,
            isWebRuntime,
            getView: () => currentRoute.view,
            showShield,
            hideShield,
            showToast: text => window.showToast?.(text),
            readStoredStringSetting,
            writeStoredStringSetting,
            readRuntimeCacheValue,
            getMembers: () => memberData,
            memberIdSet,
            memberNameMap,
            memberTeamMap,
            escapeHtml,
            replaceTencentEmoji,
            getTeamStyle,
            createCustomAudioPlayer: (...args) => createCustomAudioPlayer(...args),
            createCustomVideoPlayer: (...args) => createCustomVideoPlayer(...args),
            insertAudioPlayerIntoMessage: (...args) => insertAudioPlayerIntoMessage(...args),
            observeArchiveFlipUsers: container => archiveFlipUsers.observe(container),
            decorateArchiveFlipUser: (...args) => archiveFlipUsers.decorate(...args),
            matchReplayByTime: (...args) => matchReplayByTime(...args),
            playLiveOrArchiveFromMessage,
            openImageModal: (...args) => openImageModal(...args),
            confirmAction(message, action) {
                if (typeof showCustomConfirm === 'function') showCustomConfirm(message, action);
                else if (window.confirm(message)) action();
            },
            getPocketGiftData: () => typeof POCKET_GIFT_DATA === 'undefined' ? [] : POCKET_GIFT_DATA,
            pauseActiveAudio() {
                if (currentPlayingAudio) {
                    currentPlayingAudio.pause();
                    currentPlayingAudio = null;
                }
            }
        });

        function fetchPocketAPI(path, postData) {
            if (isWebRuntime) {
                const apiUrl = window.yayaWebApiUrl ? window.yayaWebApiUrl('/api/pocket') : '/api/pocket';
                return fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path, postData })
                }).then(async (response) => {
                    const text = await response.text();
                    const data = window.YayaRendererUtils.parseJson(text, {
                        status: 500,
                        message: /^\s*</.test(text || '')
                            ? '口袋 API 返回了 HTML 页面，Cloudflare Worker 请求可能被拦截'
                            : '口袋 API 返回内容不是 JSON',
                        content: {}
                    }, 'fetchPocketAPI');
                    if (!response.ok) {
                        return {
                            status: response.status,
                            message: data?.msg || data?.message || '网页版 API 请求失败',
                            content: data?.content || {}
                        };
                    }
                    return data;
                }).catch((error) => ({
                    status: 500,
                    content: {},
                    message: window.YayaRendererUtils.reportError('fetchPocketAPI', error)
                }));
            }

            return ipcRenderer.invoke('fetch-pocket-api', { path, postData })
                .catch(error => ({
                    status: 500,
                    content: {},
                    message: error.message || 'Pocket API 请求失败'
                }));
        }

        function escapePrivateMessageHtml(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        ({
            enterBilibiliLiveView,
            initBilibiliLiveConfig,
            renderBilibiliLiveRoomButtons,
            selectBilibiliLiveGroup,
            startBilibiliLiveStatusPolling,
            stopBilibiliLiveStatusPolling,
            destroyBilibiliLivePlayer,
            connectBilibiliLive,
            stopBilibiliLive
        } = window.YayaRendererFeatures.createBilibiliLiveFeature({
            DEFAULT_BILIBILI_LIVE_CONFIG,
            BILIBILI_LIVE_CONFIG_URL,
            BILIBILI_LIVE_CONFIG_CACHE_KEY,
            escapePrivateMessageHtml,
            getAppToken: () => getCurrentAppToken(),
            getCurrentViewName: () => currentRoute.view,
            ipcRenderer,
            getArt: () => art,
            getPerpendicularVideoScale: (...args) => getPerpendicularVideoScale(...args),
            setArt: value => { art = value; },
            setCurrentPlayingItem: value => { currentPlayingItem = value; }
        }));

        ({
            closeImageModal,
            getPreferredExternalPlayerName,
            insertAudioPlayerIntoMessage,
            openImageModal,
            openMediaInExternalPlayer
        } = window.YayaRendererFeatures.createMediaUtilsFeature({
            getCreateCustomAudioPlayer: () => createCustomAudioPlayer,
            showToast: (...args) => showToast(...args)
        }));
        window.closeImageModal = closeImageModal;
        window.openImageModal = openImageModal;

        ({
            ensureCommunityFeedLoaded,
            loadCommunityFeed,
            loadMoreCommunityFeed,
            refreshCommunityFeed
        } = window.YayaRendererFeatures.createCommunityFeature({
            getAppToken: () => getCurrentAppToken(),
            getCurrentUserId: () => (pocketAuth?.getUserId() || ''),
            ipcRenderer,
            openImageModal,
            openInBrowser,
            replaceTencentEmoji: value => typeof replaceTencentEmoji === 'function' ? replaceTencentEmoji(value) : value,
            showToast: (...args) => showToast(...args)
        }));
        window.loadCommunityFeed = loadCommunityFeed;
        window.loadMoreCommunityFeed = loadMoreCommunityFeed;
        window.refreshCommunityFeed = refreshCommunityFeed;

        ({
            createCustomAudioPlayer,
            createCustomVideoPlayer
        } = window.YayaRendererFeatures.createCustomMediaPlayerFeature({
            getCurrentViewMode: () => currentRoute.mode,
            getCurrentViewName: () => currentRoute.view,
            getCurrentPlayingAudio: () => currentPlayingAudio,
            getCurrentPlayingVideo: () => currentPlayingVideo,
            getPlaybackViewToken: () => mediaPlaybackViewToken,
            getPreferredExternalPlayerName,
            openMediaInExternalPlayer,
            setCurrentPlayingAudio: value => { currentPlayingAudio = value; },
            setCurrentPlayingVideo: value => { currentPlayingVideo = value; },
            showToast: (...args) => showToast(...args)
        }));

        const roomConversations = window.YayaRendererFeatures.installRoomConversations({
            ipcRenderer, switchView, loadMemberData, fetchPocketAPI, getAdaptivePollDelay,
            getAppToken: getCurrentAppToken,
            getCurrentUserId: () => (pocketAuth?.getUserId() || ''),
            getAccountSessionGeneration: () => pocketAccountSessionGeneration,
            getMemberData: () => memberData || [],
            getTeamStyle, getOptimizedThumbUrl, replaceTencentEmoji, escapePrivateMessageHtml,
            showToast: message => window.showToast?.(message),
            showConfirm(message, action) {
                if (typeof showCustomConfirm === 'function') showCustomConfirm(message, action);
                else if (window.confirm(message)) action();
            },
            createCustomAudioPlayer, createCustomVideoPlayer,
            playArchiveFromMessage: (...args) => playArchiveFromMessage?.(...args),
            playLiveStream: (...args) => playLiveStream?.(...args),
            setMediaReturnView: value => { pendingMediaReturnView = value || null; },
            getCurrentPlayingAudio: () => currentPlayingAudio,
            setCurrentPlayingAudio: value => { currentPlayingAudio = value; },
            privateMessageDetailState, privateMessageListState
        });
        const { archiveFlipUsers } = roomConversations;
        const {
            getActiveFollowedChannel, loadFollowedRooms, resetFollowedRoomsState, startFollowedRoomNotificationPolling,
            startFollowedRoomsPolling, stopFollowedRoomNotificationPolling, stopFollowedRoomsPolling,
            filterPrivateMessageList, loadPrivateMessageDetail, loadPrivateMessageList,
            resetPrivateMessageDetailPanel, resetPrivateMessageListState, startPrivateMessagePolling, stopPrivateMessagePolling
        } = roomConversations;

        ({
            checkGitHubNotice,
            closeAnnouncement
        } = window.YayaRendererFeatures.createAnnouncementFeature({
            DATA_BASE_URL,
            openInBrowser: (...args) => typeof openInBrowser === 'function'
                ? openInBrowser(...args)
                : undefined
        }));
        window.closeAnnouncement = closeAnnouncement;

        const livePlayback = window.YayaRendererFeatures.installLivePlayback({
            ipcRenderer, fetchPocketAPI, switchView, getCurrentAppToken, getMemberIdFromQuery, loadMemberData,
            showToast: message => window.showToast?.(message),
            getTeamStyle, openExternal, openMediaInExternalPlayer, getPreferredExternalPlayerName,
            downloadStatusMap, mediaCatalog, backToLiveList, activateMediaPlaybackPage,
            getCurrentMode: () => currentRoute.mediaMode,
            getCurrentViewName: () => currentRoute.view,
            getCurrentPlayingItem: () => currentPlayingItem,
            setCurrentPlayingItem: value => { currentPlayingItem = value; },
            getPlaybackViewToken: () => mediaPlaybackViewToken,
            getLiveAnnouncementDismissed: () => liveAnnouncementDismissed,
            setLiveAnnouncementDismissed: value => { liveAnnouncementDismissed = Boolean(value); },
            getArt: () => art,
            setArt: value => { art = value; },
            getNimInstance: () => nimInstance,
            setNimInstance: value => { nimInstance = value; },
            getSelectedLiveGiftId: () => selectedLiveGiftId,
            setSelectedLiveGiftId: value => { selectedLiveGiftId = value; },
            disconnectLiveDanmu: (...args) => disconnectLiveDanmu?.(...args),
            initArtLiveDanmu: (...args) => initArtLiveDanmu?.(...args),
            loadTimelineSubtitleText: (...args) => loadTimelineSubtitleText?.(...args) ?? [],
            renderDanmuListUI: (...args) => renderDanmuListUI?.(...args),
            resetTimelinePanel: (...args) => resetTimelinePanel?.(...args),
            stopRoomRadio: (...args) => stopRoomRadio?.(...args),
            syncDanmuHighlight: (...args) => syncDanmuHighlight?.(...args)
        });
        openInBrowser = livePlayback.openInBrowser;
        const {
            directToPotPlayer, handleDownloadDanmu, handleDownloadVOD, matchReplayByTime,
            playArchiveFromMessage, configurePlayerLayout, destroyPlayers, playLiveStream,
            getPerpendicularVideoScale, startPlayer, closeAutoLiveRecordModal, closeLiveRankModal,
            resetClipTool
        } = livePlayback;

        ({
            handleOpenLiveSearch,
            selectOpenLiveMember,
            fetchOpenLiveList,
            fetchAllOpenLive,
            playOpenLiveVideo,
            openOpenLiveInPotPlayer,
            openOpenLiveParticipantsModal,
            closeOpenLiveParticipantsModal
        } = window.YayaRendererFeatures.createOpenLiveFeature({
            getAppToken: () => getCurrentAppToken(),
            getMemberData: () => window.memberData || [],
            getMemberDataLoaded: () => !!window.isMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle: (...args) => {
                if (typeof getTeamStyle === 'function') return getTeamStyle(...args);
                if (typeof window.getTeamStyle === 'function') return window.getTeamStyle(...args);
                return '';
            },
            ipcRenderer,
            resetTimelinePanel: (...args) => typeof resetTimelinePanel === 'function'
                ? resetTimelinePanel(...args)
                : undefined,
            resetClipTool,
            activateMediaPlaybackPage,
            configurePlayerLayout: (...args) => typeof configurePlayerLayout === 'function'
                ? configurePlayerLayout(...args)
                : undefined,
            destroyPlayers: (...args) => typeof destroyPlayers === 'function'
                ? destroyPlayers(...args)
                : undefined,
            backToLiveList,
            setCurrentPlayingItem: value => { currentPlayingItem = value; },
            getCurrentPlayingItem: () => currentPlayingItem,
            getPlaybackViewToken: () => mediaPlaybackViewToken,
            setReturnToOpenLive: value => { returnToOpenLive = !!value; },
            setReturnToPerformance: value => { returnToPerformance = !!value; },
            startPlayer: (...args) => typeof startPlayer === 'function'
                ? startPlayer(...args)
                : undefined,
            openMediaInExternalPlayer,
            getPreferredExternalPlayerName,
            showToast: (...args) => showToast(...args)
        }));
        window.handleOpenLiveSearch = handleOpenLiveSearch;
        window.selectOpenLiveMember = selectOpenLiveMember;
        window.fetchOpenLiveList = fetchOpenLiveList;
        window.fetchAllOpenLive = fetchAllOpenLive;
        window.playOpenLiveVideo = playOpenLiveVideo;
        window.openOpenLiveInPotPlayer = openOpenLiveInPotPlayer;
        window.openOpenLiveParticipantsModal = openOpenLiveParticipantsModal;
        window.closeOpenLiveParticipantsModal = closeOpenLiveParticipantsModal;

        ({
            enterPerformanceView,
            openPerformanceById,
            loadMorePerformanceList,
            refreshPerformanceList,
            selectPerformanceGroup,
            searchPerformanceList,
            handlePerformanceMemberSearch
        } = window.YayaRendererFeatures.createPerformanceFeature({
            getAppToken: () => getCurrentAppToken(),
            getMemberData: () => window.memberData || [],
            getMemberDataLoaded: () => !!window.isMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle: (...args) => {
                if (typeof getTeamStyle === 'function') return getTeamStyle(...args);
                if (typeof window.getTeamStyle === 'function') return window.getTeamStyle(...args);
                return '';
            },
            ipcRenderer,
            openBilibiliLiveGroup: async groupKey => {
                switchView('bilibili-live');
                const opened = await selectBilibiliLiveGroup(groupKey, true);
                if (!opened) {
                    showToast('未找到对应团体的B站直播间');
                }
                return opened;
            },
            playOpenLiveVideo: (...args) => playOpenLiveVideo(...args),
            showToast: (...args) => showToast(...args)
        }));
        window.enterPerformanceView = enterPerformanceView;
        window.openPerformanceById = openPerformanceById;
        window.loadMorePerformanceList = loadMorePerformanceList;
        window.refreshPerformanceList = refreshPerformanceList;
        window.selectPerformanceGroup = selectPerformanceGroup;
        window.searchPerformanceList = searchPerformanceList;
        window.handlePerformanceMemberSearch = handlePerformanceMemberSearch;

        window.YayaRendererFeatures.installMemberPages({
            getAppToken: getCurrentAppToken,
            getCurrentUserId: () => (pocketAuth?.getUserId() || ''),
            loadMemberData,
            getTeamStyle,
            ipcRenderer,
            showToast: message => window.showToast?.(message),
            createCustomAudioPlayer,
            getCurrentPlayingAudio: () => currentPlayingAudio,
            getCurrentPlayingVideo: () => currentPlayingVideo,
            setCurrentPlayingVideo: value => { currentPlayingVideo = value; },
            getOptimizedThumbUrl,
            openImageModal,
            openExternal,
            replaceTencentEmoji,
            applyRoomAlbumChannelValue,
            downloadMediaFileIconMode: (...args) => downloadMediaFileIconMode(...args)
        });
        window.openRoomAlbumForRoom = openRoomAlbumForRoom;
        window.openRoomAlbumByChannelId = openRoomAlbumByChannelId;

        ({
            handleRoomRadioSearch,
            selectRoomRadioMember,
            connectRoomRadio,
            openAutoRoomRadioRecordModal,
            closeAutoRoomRadioRecordModal,
            searchAutoRoomRadioRecordMembers,
            toggleAutoRoomRadioRecording,
            autoConnectFollowedRoomRadio,
            ensureRoomRadioScanFresh,
            startAllMemberRoomRadioAutoScan,
            startFollowedMemberRoomRadioAutoScan,
            stopAllMemberRoomRadioAutoScan,
            toggleAllMemberRoomRadioScan,
            toggleScannedRoomRadioMute,
            toggleRadioMute,
            stopRoomRadio,
            toggleRoomRadioRecord
        } = window.YayaRendererFeatures.createRoomRadioFeature({
            getAppToken: () => getCurrentAppToken(),
            getMemberData: () => window.memberData || [],
            getMemberDataLoaded: () => !!window.isMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle: (...args) => {
                if (typeof getTeamStyle === 'function') return getTeamStyle(...args);
                if (typeof window.getTeamStyle === 'function') return window.getTeamStyle(...args);
                return '';
            },
            applyRoomRadioChannelValue,
            setRoomRadioRoomType,
            ipcRenderer,
            showToast: (...args) => showToast(...args)
        }));
        window.handleRoomRadioSearch = handleRoomRadioSearch;
        window.selectRoomRadioMember = selectRoomRadioMember;
        window.openRoomRadioByChannelId = openRoomRadioByChannelId;
        window.connectRoomRadio = connectRoomRadio;
        window.openAutoRoomRadioRecordModal = openAutoRoomRadioRecordModal;
        window.closeAutoRoomRadioRecordModal = closeAutoRoomRadioRecordModal;
        window.searchAutoRoomRadioRecordMembers = searchAutoRoomRadioRecordMembers;
        window.toggleAutoRoomRadioRecording = toggleAutoRoomRadioRecording;
        window.autoConnectFollowedRoomRadio = autoConnectFollowedRoomRadio;
        window.ensureRoomRadioScanFresh = ensureRoomRadioScanFresh;
        window.startAllMemberRoomRadioAutoScan = startAllMemberRoomRadioAutoScan;
        window.startFollowedMemberRoomRadioAutoScan = startFollowedMemberRoomRadioAutoScan;
        window.stopAllMemberRoomRadioAutoScan = stopAllMemberRoomRadioAutoScan;
        window.toggleAllMemberRoomRadioScan = toggleAllMemberRoomRadioScan;
        window.toggleScannedRoomRadioMute = toggleScannedRoomRadioMute;
        window.toggleRadioMute = toggleRadioMute;
        window.stopRoomRadio = stopRoomRadio;
        window.toggleRoomRadioRecord = toggleRoomRadioRecord;

        ({
            applyCustomBackground,
            initTheme,
            toggleTheme,
            updateThemeBtn
        } = window.YayaRendererFeatures.createThemeFeature());
        window.toggleTheme = toggleTheme;

        const settingsPanel = window.YayaRendererFeatures.createSettingsPanelFeature({
            invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
            getAppSettingsApi,
            readStoredStringSetting,
            writeStoredStringSetting,
            readStoredJsonSetting,
            writeStoredJsonSetting,
            removeStoredSetting,
            applyCustomBackground,
            showToast: message => window.showToast?.(message),
            translate: value => window.YayaRendererUtils.t(value)
        });

        ({
            disconnectLiveDanmu,
            ensureNimChatroomSdkLoaded,
            initArtLiveDanmu
        } = window.YayaRendererFeatures.createNimChatroomFeature({
            ipcRenderer,
            getNimAuth: async () => {
                const token = getCurrentAppToken();
                if (!token) return { success: false, msg: '未登录口袋48' };
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                return ipcRenderer.invoke('get-nim-login-info', { token, pa });
            },
            getNimInstance: () => nimInstance,
            setNimInstance: value => { nimInstance = value; },
            showToast: (...args) => showToast(...args)
        }));
        ({
            closeDanmuAnalysis,
            filterDanmuByUser,
            handleDanmuSearch,
            loadTimelineSubtitleText,
            openDanmuAnalysis,
            parseSRT,
            renderDanmuListUI,
            resetTimelinePanel,
            switchTimelineMode,
            syncDanmuHighlight
        } = window.YayaRendererFeatures.createDanmuTimelineFeature({
            DATA_BASE_URL,
            escapeHtml,
            getArt: () => art,
            getCurrentMode: () => currentRoute.mediaMode,
            getCurrentPlayingItem: () => currentPlayingItem,
            getGroupCode
        }));
        window.closeDanmuAnalysis = closeDanmuAnalysis;
        window.filterDanmuByUser = filterDanmuByUser;
        window.handleDanmuSearch = handleDanmuSearch;
        window.openDanmuAnalysis = openDanmuAnalysis;
        window.switchTimelineMode = switchTimelineMode;

        ({
            closeDateAnalysis,
            closeGiftAnalysis,
            closeSpeechAnalysis,
            closeUserAnalysis,
            filterByDate,
            filterByUser,
            filterByUserId,
            openDateAnalysis,
            openGiftAnalysis,
            openSpeechAnalysis,
            openUserAnalysis,
            showInteractions
        } = window.YayaRendererFeatures.createAnalysisFeature({
            applyFilters: messageArchive.applyFilters,
            escapeHtml,
            getAllPosts: messageArchive.getAllPosts,
            getCurrentFilteredPosts: messageArchive.getCurrentFilteredPosts,
            loadAnalysis: !isWebRuntime ? messageArchive.loadMessageAnalysis : null,
            prepare: isWebRuntime ? messageArchive.ensurePagedAnalysisPosts : null,
            getMemberIdSet: () => memberIdSet,
            getMemberNameMap: () => memberNameMap,
            getPocketGiftData: () => typeof POCKET_GIFT_DATA !== 'undefined' ? POCKET_GIFT_DATA : [],
            selectDateItem: messageArchive.selectDateItem,
            setMessageDateRange: messageArchive.setMessageDateRange,
            setFilter: messageArchive.setFilter
        }));
        window.closeDateAnalysis = closeDateAnalysis;
        window.closeGiftAnalysis = closeGiftAnalysis;
        window.closeSpeechAnalysis = closeSpeechAnalysis;
        window.closeUserAnalysis = closeUserAnalysis;
        window.filterByDate = filterByDate;
        window.filterByUser = filterByUser;
        window.filterByUserId = filterByUserId;
        window.openDateAnalysis = openDateAnalysis;
        window.openGiftAnalysis = openGiftAnalysis;
        window.addEventListener('yaya:gift-prices-updated', () => {
            const modal = document.getElementById('giftAnalysisModal');
            if (modal && modal.style.display === 'flex') void openGiftAnalysis();
        });
        window.openSpeechAnalysis = openSpeechAnalysis;
        window.openUserAnalysis = openUserAnalysis;
        window.showInteractions = showInteractions;

        ({
            closeFlipAnalysis,
            openFlipAnalysis,
            selectFlipYear,
            toggleFlipYearDropdown
        } = window.YayaRendererFeatures.createFlipAnalysisFeature({
            getAllFlipData: () => allFlipData || []
        }));
        window.closeFlipAnalysis = closeFlipAnalysis;
        window.openFlipAnalysis = openFlipAnalysis;
        window.selectFlipYear = selectFlipYear;
        window.toggleFlipYearDropdown = toggleFlipYearDropdown;

        const {
            getPocketAccountScopeKey, loadCachedFlipDataForCurrentAccount, saveFlipDataForCurrentAccount
        } = window.YayaRendererFeatures.createPocketAccountCache({
            getCurrentAppToken,
            getCurrentUserId: () => (pocketAuth?.getUserId() || '')
        });

        ({
            applyFlipSearch,
            changeFlipPage,
            checkFlipCostMin,
            closeFlipDefaultSettings,
            executeDeleteFlip,
            executeSendFlip,
            forceReloadFlips,
            handleFlipSendSearch,
            loadFlipList,
            openFlipDefaultSettings,
            openFlipSendByMemberId,
            refreshFlipUserBalance,
            saveFlipDefaultSettings,
            selectFlipDefaultSetting,
            selectFlipAnswer,
            selectFlipMemberFilter,
            selectFlipPrivacy,
            selectFlipSendMember,
            setDefaultFlipAnswerType,
            selectFlipType,
            selectFlipVisibilityFilter,
            selectFlipSort,
            applyFlipTimeRangeFilter,
            clearActiveFlipDateField,
            openFlipDatePicker,
            pickTodayForFlipDate,
            selectFlipCalendarDate,
            setActiveFlipDateField,
            shiftFlipDateCalendarYear,
            shiftFlipDateCalendarMonth,
            toggleFlipAnswerDropdown,
            toggleFlipDefaultSettingsDropdown,
            toggleFlipDateDropdown,
            toggleFlipMemberFilterDropdown,
            toggleFlipPrivacyDropdown,
            toggleFlipTypeDropdown,
            toggleFlipVisibilityDropdown,
            toggleFlipSortDropdown,
            resetFlipTimeRangeFilter,
            updateFlipCharCount,
            updateLatestFlips
        } = window.YayaRendererFeatures.createFlipFeature({
            createCustomAudioPlayer: (...args) => createCustomAudioPlayer(...args),
            createCustomVideoPlayer: (...args) => createCustomVideoPlayer(...args),
            downloadMediaFileIconMode: (...args) => downloadMediaFileIconMode(...args),
            getAllFlipData: () => allFlipData || [],
            setAllFlipData: value => { allFlipData = value; },
            getAppToken: () => getCurrentAppToken(),
            loadCachedFlipData: () => loadCachedFlipDataForCurrentAccount(),
            saveFlipDataCache: value => saveFlipDataForCurrentAccount(value),
            getCurrentFlipFilterType: () => currentFlipFilterType,
            setCurrentFlipFilterType: value => { currentFlipFilterType = value; },
            getCurrentFlipPrivacyFilter: () => currentFlipPrivacyFilter,
            setCurrentFlipPrivacyFilter: value => { currentFlipPrivacyFilter = value; },
            getCurrentFlipPage: () => flipCurrentPage,
            setCurrentFlipPage: value => { flipCurrentPage = value; },
            getCurrentFlipSort: () => currentFlipSort,
            setCurrentFlipSort: value => { currentFlipSort = value; },
            getCurrentFlipTimeFrom: () => currentFlipTimeFrom,
            setCurrentFlipTimeFrom: value => { currentFlipTimeFrom = value; },
            getCurrentFlipTimeTo: () => currentFlipTimeTo,
            setCurrentFlipTimeTo: value => { currentFlipTimeTo = value; },
            getCurrentFlipMemberKeyword: () => currentFlipMemberKeyword,
            setCurrentFlipMemberKeyword: value => { currentFlipMemberKeyword = value; },
            getCurrentSearchKeyword: () => currentSearchKeyword,
            setCurrentSearchKeyword: value => { currentSearchKeyword = value; },
            getIsFetchingFlips: () => isFetchingFlips,
            setIsFetchingFlips: value => { isFetchingFlips = value; },
            getMemberData: () => memberData || [],
            getPageSize: () => FLIP_PAGE_SIZE,
            getTeamStyle: (...args) => typeof getTeamStyle === 'function' ? getTeamStyle(...args) : '',
            ipcRenderer,
            loadMemberData: (...args) => typeof loadMemberData === 'function' ? loadMemberData(...args) : undefined,
            showConfirm: (message, onConfirm) => {
                if (typeof showCustomConfirm === 'function') {
                    showCustomConfirm(message, onConfirm);
                } else if (window.confirm(message)) {
                    onConfirm();
                }
            },
            switchView
        }));
        window.applyFlipSearch = applyFlipSearch;
        window.changeFlipPage = changeFlipPage;
        window.checkFlipCostMin = checkFlipCostMin;
        window.closeFlipDefaultSettings = closeFlipDefaultSettings;
        window.executeDeleteFlip = executeDeleteFlip;
        window.executeSendFlip = executeSendFlip;
        window.forceReloadFlips = forceReloadFlips;
        window.handleFlipSendSearch = handleFlipSendSearch;
        window.loadFlipList = loadFlipList;
        window.openFlipDefaultSettings = openFlipDefaultSettings;
        window.openFlipSendByMemberId = openFlipSendByMemberId;
        window.refreshFlipUserBalance = refreshFlipUserBalance;
        window.saveFlipDefaultSettings = saveFlipDefaultSettings;
        window.selectFlipDefaultSetting = selectFlipDefaultSetting;
        window.selectFlipAnswer = selectFlipAnswer;
        window.selectFlipMemberFilter = selectFlipMemberFilter;
        window.selectFlipPrivacy = selectFlipPrivacy;
        window.selectFlipSendMember = selectFlipSendMember;
        window.setDefaultFlipAnswerType = setDefaultFlipAnswerType;
        window.selectFlipType = selectFlipType;
        window.selectFlipVisibilityFilter = selectFlipVisibilityFilter;
        window.selectFlipSort = selectFlipSort;
        window.applyFlipTimeRangeFilter = applyFlipTimeRangeFilter;
        window.clearActiveFlipDateField = clearActiveFlipDateField;
        window.openFlipDatePicker = openFlipDatePicker;
        window.pickTodayForFlipDate = pickTodayForFlipDate;
        window.selectFlipCalendarDate = selectFlipCalendarDate;
        window.setActiveFlipDateField = setActiveFlipDateField;
        window.shiftFlipDateCalendarYear = shiftFlipDateCalendarYear;
        window.shiftFlipDateCalendarMonth = shiftFlipDateCalendarMonth;
        window.toggleFlipAnswerDropdown = toggleFlipAnswerDropdown;
        window.toggleFlipDefaultSettingsDropdown = toggleFlipDefaultSettingsDropdown;
        window.toggleFlipDateDropdown = toggleFlipDateDropdown;
        window.toggleFlipMemberFilterDropdown = toggleFlipMemberFilterDropdown;
        window.toggleFlipPrivacyDropdown = toggleFlipPrivacyDropdown;
        window.toggleFlipTypeDropdown = toggleFlipTypeDropdown;
        window.toggleFlipVisibilityDropdown = toggleFlipVisibilityDropdown;
        window.toggleFlipSortDropdown = toggleFlipSortDropdown;
        window.resetFlipTimeRangeFilter = resetFlipTimeRangeFilter;
        window.updateFlipCharCount = updateFlipCharCount;
        window.updateLatestFlips = updateLatestFlips;

        ({
            executeSendLiveGift,
            renderLiveGiftGrid,
            selectLiveGift,
            toggleGiftPanel,
            updateLiveBalance
        } = window.YayaRendererFeatures.createLiveGiftFeature({
            getAppToken: () => getCurrentAppToken(),
            getArt: () => art,
            getCurrentPlayingItem: () => currentPlayingItem,
            getPocketGiftData: () => typeof POCKET_GIFT_DATA !== 'undefined' ? POCKET_GIFT_DATA : [],
            getSelectedLiveGiftId: () => selectedLiveGiftId,
            setSelectedLiveGiftId: value => { selectedLiveGiftId = value; },
            showToast: (...args) => showToast(...args),
            ipcRenderer,
            switchView
        }));
        window.executeSendLiveGift = executeSendLiveGift;
        window.renderLiveGiftGrid = renderLiveGiftGrid;
        window.selectLiveGift = selectLiveGift;
        window.toggleGiftPanel = toggleGiftPanel;
        window.updateLiveBalance = updateLiveBalance;

        const ACTIVE_POLL_INTERVAL = 2000;
        const BACKGROUND_POLL_INTERVAL = 5000;
        function getAdaptivePollDelay() {
            return (document.hidden || !document.hasFocus()) ? BACKGROUND_POLL_INTERVAL : ACTIVE_POLL_INTERVAL;
        }

        let returnToOpenLive = false;
        let returnToPerformance = false;

        function backToLiveList() {
            mediaPlaybackViewToken += 1;
            closeAllModalOverlays();

            if (returnToOpenLive) {
                const dmWrapper = document.getElementById('danmu-timeline-wrapper');
                if (dmWrapper) dmWrapper.style.display = 'none';
                livePlayerView.style.display = 'none';
                if (typeof destroyPlayers === 'function') destroyPlayers();
                returnToOpenLive = false;
                switchView('openlive');
                return;
            }

            if (returnToPerformance) {
                const dmWrapper = document.getElementById('danmu-timeline-wrapper');
                if (dmWrapper) dmWrapper.style.display = 'none';
                livePlayerView.style.display = 'none';
                if (typeof destroyPlayers === 'function') destroyPlayers();
                returnToPerformance = false;
                switchView('performance');
                return;
            }

            if (activeMediaReturnView === 'followed-rooms') {
                activeMediaReturnView = null;
                const dmWrapper = document.getElementById('danmu-timeline-wrapper');
                if (dmWrapper) dmWrapper.style.display = 'none';
                livePlayerView.style.display = 'none';
                document.getElementById('media-list-area').style.display = 'block';
                if (typeof destroyPlayers === 'function') destroyPlayers();
                switchView('followed-rooms');
                return;
            }

            livePlayerView.style.display = 'none';
            document.getElementById('media-list-area').style.display = 'block';
            const mediaView = document.getElementById('view-media');
            document.querySelectorAll('.media-playback-page').forEach(page => {
                page.style.display = 'none';
            });
            if (mediaView) {
                mediaView.style.display = 'flex';
                mediaView.style.flexDirection = 'column';
            }

            if (typeof destroyPlayers === 'function') destroyPlayers();
            if (currentRoute.mediaMode === 'live' && typeof window.syncWebLiveListRoute === 'function') {
                window.syncWebLiveListRoute();
            } else if (currentRoute.mediaMode === 'vod' && typeof window.syncWebVodListRoute === 'function') {
                window.syncWebVodListRoute();
            }
            const oldNotice = document.querySelector('#live-player-area .live-link-info');
            if (oldNotice) oldNotice.remove();

            mediaCatalog.showList({ returningFromPlayer: true });
        }

        let nimInstance = null,
            art = null;


        function replaceTencentEmoji(text) {
            return window.YayaRendererUtils.replaceTencentEmoji(text);
        }

        async function playLiveOrArchiveFromMessage(liveId, nickname, timeStr, title) {
            if (!liveId) return;

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveList', JSON.stringify({
                    debug: true,
                    next: 0,
                    groupId: 0,
                    record: false
                }));
                const liveList = Array.isArray(res?.content?.liveList) ? res.content.liveList : [];
                const matchedLive = liveList.find(item => String(item.liveId) === String(liveId));

                if (matchedLive && typeof playLiveStream === 'function') {
                    switchView('media', 'live');
                    setTimeout(() => {
                        playLiveStream(matchedLive, 'live');
                    }, 300);
                    return;
                }
            } catch (error) {
                console.warn('[消息检索] 判断直播状态失败，回退到回放:', error);
            }

            playArchiveFromMessage(liveId, nickname, timeStr, title);
        }

        function escapeHtml(value) {
            return window.YayaRendererUtils.escapeHtml(value);
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
        let flipCurrentPage = 0;
        const FLIP_PAGE_SIZE = 20;

        let allFlipData = [];
        let isFetchingFlips = false;
        let currentFlipFilterType = "0";
        let currentFlipPrivacyFilter = "0";
        let currentFlipSort = "latest_desc";
        let currentFlipTimeFrom = "";
        let currentFlipTimeTo = "";
        let currentFlipMemberKeyword = "";
        let currentSearchKeyword = "";
        function resetFlipSessionState() {
            allFlipData = [];
            isFetchingFlips = false;
            flipCurrentPage = 0;
            currentFlipMemberKeyword = "";
            currentSearchKeyword = "";

            const memberFilterInput = document.getElementById('flipMemberFilterInput');
            if (memberFilterInput) memberFilterInput.value = '全部成员';

            const searchInput = document.getElementById('flipSearchInput');
            if (searchInput) searchInput.value = '';

            const statusText = document.getElementById('flip-status-text');
            if (statusText) statusText.textContent = '';

            const listContainer = document.getElementById('flip-list-container');
            if (listContainer) {
                listContainer.innerHTML = '<div class="empty-state">正在加载翻牌记录</div>';
            }

            const pagination = document.querySelector('#view-flip .pagination-container');
            if (pagination) pagination.style.display = 'none';
        }

        function resetAccountScopedSessionState() {
            pocketAccountSessionGeneration += 1;
            resetFlipSessionState();
            if (typeof resetFollowedRoomsState === 'function') {
                resetFollowedRoomsState();
            }
            if (typeof resetPrivateMessageListState === 'function') {
                resetPrivateMessageListState();
            }
            if (typeof window.resetInvoiceAccountState === 'function') {
                window.resetInvoiceAccountState();
            }
            window.resetNetfaceAccountState?.();
            messageFetch.invalidateAccountState();
            pocketAuth.invalidatePocketAccountRequestState();
        }

        window.getPocketAccountScopeKey = getPocketAccountScopeKey;
        window.getPocketAccountSessionGeneration = () => pocketAccountSessionGeneration;

        function getOptimizedThumbUrl(url) {
            if (!url) return '';
            if (url.includes('.mp4') || url.includes('.MOV') || url.includes('.aac') || url.includes('.mp3')) return url;
            const sep = url.includes('?') ? '&' : '?';
            return url + sep + 'imageView&thumbnail=500x0';
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

        let selectedLiveGiftId = null;

        const {
            closeVideoPlayer, fetchAllMusicLibrary, fetchAllVideoLibrary, loadAudioPrograms,
            restoreAudioProgramPlayerState, stopAudioProgram
        } = window.YayaRendererFeatures.installOfficialMedia({
            MUSIC_LYRICS_BASE_URL, MUSIC_LYRICS_INDEX_URL, escapeHtml, fetchPocketAPI,
            showToast: message => window.showToast?.(message),
            getCurrentViewMode: () => currentRoute.mode,
            getCurrentViewName: () => currentRoute.view,
            getCurrentPlayingVideo: () => currentPlayingVideo,
            getPlaybackViewToken: () => mediaPlaybackViewToken
        });

        window.YayaRendererFeatures.installAppOverlayControls({ getView: () => currentRoute.view, switchView });
        pocketAuth = window.YayaRendererFeatures.createPocketAuthFeature({
            ipcRenderer, resetAccountScopedSessionState, startFollowedRoomNotificationPolling,
            stopFollowedRoomNotificationPolling, updateLocalGiftDatabase,
            onAccountReady: () => messageFetch.activateForAccount()
        });
        messageFetch = window.YayaRendererFeatures.createMessageFetchFeature({
            ipcRenderer, getAppToken: pocketAuth.getToken, getCurrentPocketUserId: pocketAuth.getUserId,
            getFetchRoomType, getSelectedMemberName: () => currentSelectedMemberName,
            getMemberData: () => memberData, isMemberDataLoaded: () => isMemberDataLoaded,
            loadMemberData, getPinyinInitials, memberSortLogic, getTeamStyle,
            replaceTencentEmoji, switchView, POCKET_GIFT_DATA
        });
        Object.assign(window, pocketAuth.actions, messageFetch.actions);

        window.YayaRendererFeatures.startApp({
            isWebRuntime, appNavigation, messageArchive, mediaCatalog, migrateLegacyPersistentState,
            BILIBILI_LIVE_CONFIG_CACHE_KEY, initTheme, checkGitHubNotice, loadMemberIdMap,
            syncAutoCheckinUi: pocketAuth.syncAutoCheckinUi,
            getStoredAppToken, setAppToken: pocketAuth.setToken, checkToken: pocketAuth.checkToken,
            reportFatalInitError: typeof reportFatalInitError === 'function' ? reportFatalInitError : null
        });
