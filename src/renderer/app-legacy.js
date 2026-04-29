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
        let initBilibiliLiveConfig;
        let enterBilibiliLiveView;
        let renderBilibiliLiveRoomButtons;
        let startBilibiliLiveStatusPolling;
        let stopBilibiliLiveStatusPolling;
        let destroyBilibiliLivePlayer;
        let connectBilibiliLive;
        let stopBilibiliLive;
        let updateMusicLyricsToggleButton;
        let syncMusicLyrics;
        let toggleMusicLyricsPanel;
        let loadMusicLyrics;
        let seekMusicLyricLine;
        let closePrivateMessageDetail;
        let filterPrivateMessageList;
        let handlePrivateMessageReplyKeydown;
        let loadMorePrivateMessageDetail;
        let loadMorePrivateMessageList;
        let loadPrivateMessageDetail;
        let loadPrivateMessageList;
        let openPrivateMessageDetail;
        let refreshPrivateMessageList;
        let resetPrivateMessageDetailPanel;
        let sendPrivateMessageReply;
        let startPrivateMessagePolling;
        let stopPrivateMessagePolling;
        let handleOpenLiveSearch;
        let selectOpenLiveMember;
        let fetchOpenLiveList;
        let fetchAllOpenLive;
        let openOpenLiveInPotPlayer;
        let destroyPlayers;
        let handleProfileSearch;
        let selectProfileMember;
        let loadStarProfile;
        let fetchAllMemberPhotos;
        let handlePhotoSearch;
        let selectPhotoMember;
        let fetchMemberPhotos;
        let fetchAllRoomAlbum;
        let downloadAllRoomAlbum;
        let handleRoomAlbumSearch;
        let selectRoomAlbumMember;
        let fetchRoomAlbum;
        let handleRoomRadioSearch;
        let selectRoomRadioMember;
        let connectRoomRadio;
        let toggleRadioMute;
        let stopRoomRadio;
        let toggleRoomRadioRecord;
        let initYk1zHomePanel;
        let applyCustomBackground;
        let initTheme;
        let toggleTheme;
        let updateThemeBtn;
        let ensureNimChatroomSdkLoaded;
        let initLiveDanmu;
        let initArtLiveDanmu;
        let initDanmuForDPlayer;
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
        let playLiveStream;
        let startPlayer;
        let showInteractions;
        let closeFlipAnalysis;
        let applyFlipSearch;
        let changeFlipPage;
        let checkFlipCostMin;
        let executeDeleteFlip;
        let executeSendFlip;
        let executeSendLiveGift;
        let executeClip;
        let forceReloadFlips;
        let fetchLiveRank;
        let fetchDanmuNative;
        let handleFlipSendSearch;
        let handleDownloadDanmu;
        let handleDownloadVOD;
        let applyFlipTimeRangeFilter;
        let clearActiveFlipDateField;
        let loadFlipList;
        let pickTodayForFlipDate;
        let openFlipDatePicker;
        let renderLiveGiftGrid;
        let refreshLiveAnnouncement;
        let refreshFlipUserBalance;
        let resetClipTool;
        let selectFlipAnswer;
        let selectFlipPrivacy;
        let selectFlipSendMember;
        let selectFlipType;
        let selectFlipCalendarDate;
        let selectLiveGift;
        let setActiveFlipDateField;
        let setClipEnd;
        let setClipEndFromTimeline;
        let setClipStart;
        let setClipStartFromTimeline;
        let shiftFlipDateCalendarYear;
        let shiftFlipDateCalendarMonth;
        let closeLiveAnnouncement;
        let toggleRankPanel;
        let toggleGiftPanel;
        let toggleFlipAnswerDropdown;
        let toggleFlipDateDropdown;
        let toggleFlipPrivacyDropdown;
        let toggleFlipTypeDropdown;
        let toggleFlipVisibilityDropdown;
        let toggleFlipSortDropdown;
        let resetFlipTimeRangeFilter;
        let updateClipUI;
        let updateFlipCharCount;
        let updateLiveBalance;
        let updateLatestFlips;
        let selectFlipYear;
        let toggleFlipYearDropdown;
        let closeVideoPlayer;
        let cycleAudioProgramPlayMode;
        let cycleMusicPlayMode;
        let debouncedAudioSearch;
        let debouncedMusicSearch;
        let debouncedVideoSearch;
        let fetchAllMusicLibrary;
        let fetchAllVideoLibrary;
        let initMusicScrollListener;
        let initVideoScrollListener;
        let loadAudioPrograms;
        let playAudioProgram;
        let playNextAudioProgram;
        let playNextMusic;
        let playOfficialMusic;
        let playOfficialVideo;
        let playPreviousAudioProgram;
        let playPreviousMusic;
        let restoreAudioProgramPlayerState;
        let suspendAudioProgramForViewSwitch;
        let stopAudioProgram;
        let toggleAudioProgramQueue;
        let toggleMusicQueue;
        let resetTimelinePanel;
        let switchTimelineMode;
        let syncDanmuHighlight;
        let createCustomAudioPlayer;
        let createCustomVideoPlayer;
        let loadFollowedRooms;
        let toggleFollowedSortDropdown;
        let selectFollowedSort;
        let sortFollowedRooms;
        let handleQuickFollowSearch;
        let selectQuickFollowMember;
        let executeQuickAction;
        let openFollowedChat;
        let toggleFollowedRoomType;
        let jumpToFullRoom;
        let toggleFollowedChatMode;
        let flushFollowedPendingMessages;
        let loadFollowedChatPage;
        let getActiveFollowedChannel;
        let checkGitHubNotice;
        let closeAnnouncement;
        let directToPotPlayer;
        let openImageModal;
        let closeImageModal;
        let getPreferredExternalPlayerName;
        let openMediaInExternalPlayer;
        let openInBrowser;
        let insertAudioPlayerIntoMessage;
        let loadMemberAvatar;
        let updateSessionAvatar;
        let updateSearchSuggestions;
        let normalizeMemberLookupText;
        let getMemberLookupAliases;
        let findMemberRecordByQuery;
        let getMemberNamesById;
        let getMemberIdFromQuery;
        let playArchiveFromMessage;
        let getPrivateMessageAvatar;
        let getPrivateMessageConversationKey;
        let getPrivateMessageItemKey;
        let clearActivePrivateMessageUnread;
        let formatPrivateMessagePreview;
        let normalizePrivateMessageName;
        let getPrivateMessageDisplayName;
        let getPrivateMessageTeamLabel;
        let formatPrivateMessageTime;
        let formatPrivateMessageDateTime;
        let formatPrivateMessageContent;
        let renderPrivateMessageContentHtml;
        let matchReplayByTime;

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
        let mediaPlaybackViewToken = 0;
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

        function isInitShieldVisible() {
            const shield = document.getElementById('loading-shield');
            if (!shield) return false;
            if (window.__shieldVisible) return true;
            return window.getComputedStyle(shield).display !== 'none';
        }

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

        function stopPlaybackOnViewChange(nextViewName) {
            const officialSiteMusicAudio = document.getElementById('official-site-music-audio');
            const audioProgramAudio = document.getElementById('native-audio-player');
            const shouldSuspendOfficialSiteMusic = nextViewName !== 'official-site-music'
                && officialSiteMusicAudio
                && typeof window.suspendOfficialSiteMusicForViewSwitch === 'function';
            const shouldSuspendAudioProgram = nextViewName !== 'audio-programs'
                && audioProgramAudio
                && typeof window.suspendAudioProgramForViewSwitch === 'function';
            if (shouldSuspendOfficialSiteMusic) {
                window.suspendOfficialSiteMusicForViewSwitch();
            }
            if (shouldSuspendAudioProgram) {
                window.suspendAudioProgramForViewSwitch();
            }

            document.querySelectorAll('audio, video').forEach(mediaEl => {
                if (shouldSuspendOfficialSiteMusic && mediaEl === officialSiteMusicAudio) return;
                if (shouldSuspendAudioProgram && mediaEl === audioProgramAudio) return;

                try {
                    mediaEl.pause();
                } catch (error) { }

                try {
                    mediaEl.currentTime = 0;
                } catch (error) { }
            });

            if (currentPlayingAudio && currentPlayingAudio !== officialSiteMusicAudio && currentPlayingAudio !== audioProgramAudio) {
                currentPlayingAudio.pause();
                currentPlayingAudio.currentTime = 0;
                currentPlayingAudio = null;
            }

            if (currentPlayingVideo) {
                currentPlayingVideo.pause();
                try {
                    currentPlayingVideo.currentTime = 0;
                } catch (error) { }
                currentPlayingVideo = null;
            }

            if (nextViewName !== 'audio-programs') {
                if (!shouldSuspendAudioProgram && typeof stopAudioProgram === 'function') stopAudioProgram();
            }

            if (nextViewName !== 'video-library') {
                if (typeof closeVideoPlayer === 'function') closeVideoPlayer();
            }

            if (nextViewName !== 'bilibili-live') {
                destroyBilibiliLivePlayer(false);
                stopBilibiliLiveStatusPolling();
            }

            if (nextViewName !== 'private-messages') {
                stopPrivateMessagePolling();
            }

            if (nextViewName !== 'music-library') {
                const musicAudio = document.getElementById('music-native-audio');
                if (musicAudio) musicAudio.pause();
            }

            if (nextViewName !== 'official-site-music') {
                if (!shouldSuspendOfficialSiteMusic && officialSiteMusicAudio) {
                    officialSiteMusicAudio.pause();
                }
            }
        }

        function getPrimaryViewElements() {
            return [
                document.getElementById('view-home'),
                document.getElementById('view-messages'),
                document.getElementById('view-media'),
                document.getElementById('view-downloads'),
                document.getElementById('view-database'),
                document.getElementById('view-official-site-music'),
                document.getElementById('view-login'),
                document.getElementById('view-fetch'),
                document.getElementById('view-private-messages'),
                document.getElementById('view-bilibili-live'),
                document.getElementById('view-flip'),
                document.getElementById('view-profile'),
                document.getElementById('view-open-live'),
                document.getElementById('view-send-flip'),
                document.getElementById('view-settings'),
                document.getElementById('view-photos'),
                document.getElementById('view-room-album'),
                document.getElementById('view-room-radio'),
                document.getElementById('view-audio-programs'),
                document.getElementById('view-video-library'),
                document.getElementById('view-music-library'),
                document.getElementById('view-followed-rooms')
            ].filter(Boolean);
        }

        function hideAllPrimaryViews() {
            getPrimaryViewElements().forEach(viewEl => {
                viewEl.style.display = 'none';
            });
        }

        function recoverToSafeHomeFromViewError(viewName, mode, error) {
            console.error(`[switchView] 页面切换失败: ${viewName}${mode ? `:${mode}` : ''}`, error);

            currentViewName = 'home';
            currentViewMode = null;
            updateTopbarPageTitle('home');

            try {
                hideAllPrimaryViews();

                const homeView = document.getElementById('view-home');
                const mediaListArea = document.getElementById('media-list-area');
                const playerView = document.getElementById('live-player-view');

                if (playerView) playerView.style.display = 'none';
                if (mediaListArea) mediaListArea.style.display = 'block';

                setGlobalSidebarVisible(false);
                setSidebarHomeMode(true);
                toggleSidebarMode('messages');

                if (typeof updateSidebarButtons === 'function') {
                    updateSidebarButtons('home', null);
                }

                if (homeView) {
                    homeView.style.display = 'flex';
                }

                syncMessageIndexLoadingShield();
            } catch (recoveryError) {
                console.error('[switchView] 安全回退主页失败', recoveryError);
            }

            if (typeof showToast === 'function') {
                showToast(`页面加载失败，已返回主页：${viewName}`);
            }
        }

        const LOGIN_REQUIRED_VIEWS = new Set([
            'fetch',
            'flip',
            'send-flip',
            'profile',
            'openlive',
            'photos',
            'room-album',
            'room-radio',
            'private-messages',
            'followed-rooms'
        ]);

        function getAppSettingsApi() {
            return window.desktop && window.desktop.appSettings ? window.desktop.appSettings : null;
        }

        function readStoredStringSetting(key, fallbackValue = '', legacyKey = key) {
            const settingsApi = getAppSettingsApi();
            const missingMarker = readStoredStringSetting._missingMarker || (readStoredStringSetting._missingMarker = {});

            if (settingsApi && typeof settingsApi.getSettingValueSync === 'function') {
                const storedValue = settingsApi.getSettingValueSync(key, missingMarker);
                if (storedValue !== missingMarker) {
                    return typeof storedValue === 'string' ? storedValue : String(storedValue ?? '');
                }
            }

            const legacyValue = localStorage.getItem(legacyKey);
            if (legacyValue !== null) {
                if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
                    settingsApi.setSettingValueSync(key, legacyValue);
                    localStorage.removeItem(legacyKey);
                }
                return String(legacyValue);
            }

            return fallbackValue;
        }

        function writeStoredStringSetting(key, value, legacyKey = key) {
            const normalizedValue = String(value ?? '');
            const settingsApi = getAppSettingsApi();
            if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
                settingsApi.setSettingValueSync(key, normalizedValue);
                localStorage.removeItem(legacyKey);
                return normalizedValue;
            }

            localStorage.setItem(legacyKey, normalizedValue);
            return normalizedValue;
        }

        function readStoredJsonSetting(key, fallbackValue, legacyKey = key) {
            const settingsApi = getAppSettingsApi();
            const missingMarker = readStoredJsonSetting._missingMarker || (readStoredJsonSetting._missingMarker = {});

            if (settingsApi && typeof settingsApi.getSettingValueSync === 'function') {
                const storedValue = settingsApi.getSettingValueSync(key, missingMarker);
                if (storedValue !== missingMarker) {
                    return storedValue;
                }
            }

            const legacyValue = localStorage.getItem(legacyKey);
            if (legacyValue !== null) {
                try {
                    const parsedValue = JSON.parse(legacyValue);
                    if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
                        settingsApi.setSettingValueSync(key, parsedValue);
                        localStorage.removeItem(legacyKey);
                    }
                    return parsedValue;
                } catch (error) {
                    console.warn(`解析旧设置失败: ${legacyKey}`, error);
                }
            }

            return fallbackValue;
        }

        function writeStoredJsonSetting(key, value, legacyKey = key) {
            const settingsApi = getAppSettingsApi();
            if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
                settingsApi.setSettingValueSync(key, value);
                localStorage.removeItem(legacyKey);
                return value;
            }

            localStorage.setItem(legacyKey, JSON.stringify(value));
            return value;
        }

        function removeStoredSetting(key, legacyKey = key) {
            const settingsApi = getAppSettingsApi();
            if (settingsApi && typeof settingsApi.removeSettingValueSync === 'function') {
                settingsApi.removeSettingValueSync(key);
            }
            localStorage.removeItem(legacyKey);
        }

        window.readStoredStringSetting = readStoredStringSetting;
        window.writeStoredStringSetting = writeStoredStringSetting;
        window.readStoredJsonSetting = readStoredJsonSetting;
        window.writeStoredJsonSetting = writeStoredJsonSetting;
        window.removeStoredSetting = removeStoredSetting;

        function getStoredAppToken() {
            const settingsApi = getAppSettingsApi();
            if (settingsApi && typeof settingsApi.getTokenSync === 'function') {
                const storedToken = String(settingsApi.getTokenSync() || '').trim();
                if (storedToken) {
                    return storedToken;
                }
            }

            return String(localStorage.getItem('yaya_p48_token') || '').trim();
        }

        function migrateLegacyPersistentState() {
            const settingsApi = getAppSettingsApi();
            if (!settingsApi) {
                return;
            }

            try {
                const legacyToken = String(localStorage.getItem('yaya_p48_token') || '').trim();
                if (legacyToken && !settingsApi.getTokenSync()) {
                    settingsApi.setTokenSync(legacyToken);
                }
                if (legacyToken) {
                    localStorage.removeItem('yaya_p48_token');
                }
            } catch (error) {
                console.warn('迁移旧 Token 失败:', error);
            }

            try {
                const legacyBg = String(localStorage.getItem('custom_bg_data') || '');
                const currentBg = typeof settingsApi.getBackgroundUrlSync === 'function'
                    ? settingsApi.getBackgroundUrlSync()
                    : '';
                if (legacyBg && !currentBg && typeof settingsApi.saveBackgroundFromDataUrlSync === 'function') {
                    settingsApi.saveBackgroundFromDataUrlSync(legacyBg);
                }
                if (legacyBg) {
                    localStorage.removeItem('custom_bg_data');
                }
            } catch (error) {
                console.warn('迁移旧背景图失败:', error);
            }

            try {
                const stringSettingKeys = [
                    'theme',
                    'msg_sort_order',
                    'yaya_path_danmu',
                    'yaya_path_video',
                    'yaya_path_clip',
                    'yaya_path_media',
                    'yaya_path_flip',
                    'yaya_path_room_radio',
                    'yaya_audio_program_play_mode',
                    'yaya_music_play_mode',
                    'yaya_music_volume',
                    'bilibili_live_last_room_id'
                ];

                stringSettingKeys.forEach((key) => {
                    const legacyValue = localStorage.getItem(key);
                    if (legacyValue === null) return;
                    if (typeof settingsApi.getSettingValueSync === 'function'
                        && typeof settingsApi.setSettingValueSync === 'function') {
                        const missingMarker = {};
                        const currentValue = settingsApi.getSettingValueSync(key, missingMarker);
                        if (currentValue === missingMarker) {
                            settingsApi.setSettingValueSync(key, legacyValue);
                        }
                    }
                    localStorage.removeItem(key);
                });

                const jsonSettingKeys = [
                    'yaya_followed_custom_order',
                    BILIBILI_LIVE_CONFIG_CACHE_KEY
                ];

                jsonSettingKeys.forEach((key) => {
                    const legacyValue = localStorage.getItem(key);
                    if (legacyValue === null) return;
                    try {
                        const parsedValue = JSON.parse(legacyValue);
                        if (typeof settingsApi.getSettingValueSync === 'function'
                            && typeof settingsApi.setSettingValueSync === 'function') {
                            const missingMarker = {};
                            const currentValue = settingsApi.getSettingValueSync(key, missingMarker);
                            if (currentValue === missingMarker) {
                                settingsApi.setSettingValueSync(key, parsedValue);
                            }
                        }
                        localStorage.removeItem(key);
                    } catch (error) {
                        console.warn(`迁移旧 JSON 设置失败: ${key}`, error);
                    }
                });
            } catch (error) {
                console.warn('迁移旧设置失败:', error);
            }
        }

        function getCurrentAppToken() {
            return (typeof appToken !== 'undefined' && appToken)
                ? appToken
                : getStoredAppToken();
        }

        window.getAppToken = getCurrentAppToken;

        function ensureLoginBeforeSwitchView(viewName) {
            if (!LOGIN_REQUIRED_VIEWS.has(viewName)) return true;
            if (getCurrentAppToken()) return true;

            if (typeof showToast === 'function') {
                showToast('请先登录账号');
            }
            switchView('login');
            return false;
        }

        const APP_TOPBAR_TITLE_MAP = {
            messages: '消息检索',
            downloads: '下载管理',
            database: '数据库',
            'official-site-music': '音乐',
            login: '账号设置',
            fetch: '抓取消息',
            'private-messages': '私信列表',
            'bilibili-live': 'B站直播',
            flip: '翻牌记录',
            profile: '成员档案',
            openlive: '公演记录',
            'send-flip': '翻牌提问',
            settings: '软件设置',
            photos: '个人相册',
            'room-album': '房间相册',
            'room-radio': '房间上麦',
            'audio-programs': '电台',
            'video-library': '视频',
            'music-library': '音乐',
            'followed-rooms': '口袋房间'
        };

        function getAppTopbarTitle(viewName, mode = null) {
            if (viewName === 'home') return '';
            if (viewName === 'media') {
                if (mode === 'live') return '正在直播';
                if (mode === 'vod') return '直播回放';
                return '直播/回放';
            }
            return APP_TOPBAR_TITLE_MAP[viewName] || '';
        }

        function updateTopbarPageTitle(viewName, mode = null) {
            const titleEl = document.getElementById('topbar-page-title');
            if (!titleEl) return;

            const titleText = getAppTopbarTitle(viewName, mode);
            titleEl.textContent = titleText;
            titleEl.classList.toggle('is-visible', !!titleText);
            titleEl.title = titleText;
        }

        function switchView(viewName, mode = null) {
            try {
                if (viewName !== 'login' && !ensureLoginBeforeSwitchView(viewName)) {
                    return;
                }

                mediaPlaybackViewToken += 1;
                currentViewName = viewName;
                currentViewMode = mode;
                updateTopbarPageTitle(viewName, mode);
                document.getElementById('backToTopBtn').classList.remove('show');
                const backBtn = document.getElementById('backToTopBtn');
                if (backBtn) backBtn.classList.remove('show');

                const homeView = document.getElementById('view-home');
                const msgView = document.getElementById('view-messages');
                const mediaView = document.getElementById('view-media');
                const downloadsView = document.getElementById('view-downloads');
                const databaseView = document.getElementById('view-database');
                const officialSiteMusicView = document.getElementById('view-official-site-music');
                const loginView = document.getElementById('view-login');
                const fetchView = document.getElementById('view-fetch');
                const privateMessagesView = document.getElementById('view-private-messages');
                const bilibiliLiveView = document.getElementById('view-bilibili-live');
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

                hideAllPrimaryViews();

                destroyPlayers();
                stopPlaybackOnViewChange(viewName);

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

                } else if (viewName === 'official-site-music') {
                    setGlobalSidebarVisible(false);
                    setSidebarHomeMode(false);
                    toggleSidebarMode('login');
                    if (officialSiteMusicView) officialSiteMusicView.style.display = 'flex';
                    if (typeof window.loadOfficialSiteMusic === 'function') {
                        window.loadOfficialSiteMusic();
                    }

                } else if (viewName === 'private-messages') {
                    setGlobalSidebarVisible(false);
                    setSidebarHomeMode(false);
                    toggleSidebarMode('login');
                    if (privateMessagesView) privateMessagesView.style.display = 'block';
                    if (typeof loadPrivateMessageList === 'function') {
                        loadPrivateMessageList({
                            reset: !privateMessageListState.initialized || privateMessageListState.items.length === 0,
                            loadAll: true,
                            silent: true
                        });
                    }
                    startPrivateMessagePolling();

                } else if (viewName === 'bilibili-live') {
                    setGlobalSidebarVisible(false);
                    setSidebarHomeMode(false);
                    toggleSidebarMode('login');
                    if (bilibiliLiveView) bilibiliLiveView.style.display = 'block';
                    enterBilibiliLiveView();

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

                    const savedToken = getStoredAppToken();
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

                    refreshBilibiliLoginStatus(true);

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

                    const token = getCurrentAppToken();
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
                        Promise.resolve(loadAudioPrograms(0)).finally(() => {
                            if (typeof window.restoreAudioProgramPlayerState === 'function') {
                                window.restoreAudioProgramPlayerState();
                            }
                        });
                    } else if (typeof window.restoreAudioProgramPlayerState === 'function') {
                        window.restoreAudioProgramPlayerState();
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
            } catch (error) {
                recoverToSafeHomeFromViewError(viewName, mode, error);
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
                { id: 'btn-sb-music-library', defaultText: '音乐', targetView: 'official-site-music' },
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

        updateTopbarPageTitle(currentViewName, currentViewMode);

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

        openInBrowser = function (url) {
            try {
                openExternal(url);
            } catch (e) {
                window.open(url, '_blank');
            }
        };

        function buildMemberCollectionsFromList(list) {
            memberNameMap.set('clear_all', true);
            memberNameMap.clear();
            memberIdSet.clear();
            memberTeamMap.clear();

            (Array.isArray(list) ? list : []).forEach(member => {
                const name = String(member?.ownerName || '').trim();
                const id = String(member?.id || '').trim();
                const team = String(member?.team || '').trim();

                if (!name || !id) return;

                memberNameMap.set(name, id);
                memberIdSet.add(id);
                if (team) memberTeamMap.set(name, team);

                if (name.includes('-')) {
                    const simpleName = name.split('-')[1]?.trim();
                    if (simpleName && !memberNameMap.has(simpleName)) {
                        memberNameMap.set(simpleName, id);
                        if (team) memberTeamMap.set(simpleName, team);
                    }
                }
            });

            initBestNames();
        }

        async function loadMemberIdMap() {
            if (memberNameMap.size > 0 && sessionStorage.getItem('member_updated_this_session')) {
                return;
            }

            try {
                console.log("启动软件：正在获取最新的成员列表...");
                sessionStorage.setItem('member_updated_this_session', 'true');
                await autoUpdateMemberData();
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

        ({ initYk1zHomePanel } = window.YayaRendererFeatures.createYk1zHomeFeature({
            DATA_BASE_URL,
            openInBrowser,
            switchView
        }));

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

        ({
            updateMusicLyricsToggleButton,
            syncMusicLyrics,
            toggleMusicLyricsPanel,
            loadMusicLyrics,
            seekMusicLyricLine
        } = window.YayaRendererFeatures.createMusicLyricsFeature({
            MUSIC_LYRICS_BASE_URL,
            MUSIC_LYRICS_INDEX_URL,
            escapeHtml,
            parseMusicLrc
        }));
        window.toggleMusicLyricsPanel = toggleMusicLyricsPanel;
        window.seekMusicLyricLine = seekMusicLyricLine;

        async function autoUpdateMemberData() {
            const url = `${DATA_BASE_URL}/members.json?t=${Date.now()}`;

            if (statusMsg) statusMsg.textContent = "正在更新完整成员列表...";

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json();
                if (!data.roomId && !Array.isArray(data.roomId)) {
                    throw new Error("JSON 数据格式不正确");
                }

                let allMembers = [];
                if (Array.isArray(data.roomId)) allMembers = allMembers.concat(data.roomId);
                if (Array.isArray(data.members)) allMembers = allMembers.concat(data.members);
                if (Array.isArray(data.retired)) allMembers = allMembers.concat(data.retired);

                if (allMembers && allMembers.length > 0) {
                    memberData = allMembers;
                    window.memberData = allMembers;
                    isMemberDataLoaded = true;
                    window.isMemberDataLoaded = true;
                }

                buildMemberCollectionsFromList(allMembers);

                if (privateMessageListState && Array.isArray(privateMessageListState.items) && privateMessageListState.items.length > 0) {
                    filterPrivateMessageList(document.getElementById('private-message-search')?.value || '', {
                        preserveScroll: true
                    });
                }

                if (statusMsg) statusMsg.textContent = `成员列表更新完成 (${allMembers.length}人)`;

                setTimeout(() => {
                    if (statusMsg) statusMsg.textContent = "软件已就绪";
                }, 3000);

            } catch (err) {
                console.error("自动更新成员 ID 失败:", err);
                if (Array.isArray(memberData) && memberData.length > 0) {
                    buildMemberCollectionsFromList(memberData);
                    if (statusMsg) statusMsg.textContent = "成员列表更新失败，已使用当前内存数据";
                } else {
                    if (statusMsg) statusMsg.textContent = "成员列表更新失败";
                    throw err;
                }
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
                    apiId: 12,
                    name: 'GNZ48'
                },
                {
                    apiId: 11,
                    name: 'BEJ48'
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
            initBilibiliLiveConfig();
            initYk1zHomePanel();
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
        let availableYears = new Set();
        let currentPlayingAudio = null;
        let currentPlayingVideo = null;
        let isRenderingBatch = false;
        let batchRenderScheduled = false;
        let isMessageDataScanRunning = false;
        let pendingMessageDataScanMode = null;
        let currentSortOrder = readStoredStringSetting('msg_sort_order', 'desc');
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

            writeStoredStringSetting('msg_sort_order', currentSortOrder);

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

        ({
            enterBilibiliLiveView,
            initBilibiliLiveConfig,
            renderBilibiliLiveRoomButtons,
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
            getCurrentViewName: () => currentViewName,
            ipcRenderer,
            setArt: value => { art = value; },
            setCurrentPlayingItem: value => { currentPlayingItem = value; },
            setDp: value => { dp = value; }
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
            createCustomAudioPlayer,
            createCustomVideoPlayer
        } = window.YayaRendererFeatures.createCustomMediaPlayerFeature({
            getCurrentViewMode: () => currentViewMode,
            getCurrentViewName: () => currentViewName,
            getCurrentPlayingAudio: () => currentPlayingAudio,
            getCurrentPlayingVideo: () => currentPlayingVideo,
            getPlaybackViewToken: () => mediaPlaybackViewToken,
            getPreferredExternalPlayerName,
            openMediaInExternalPlayer,
            setCurrentPlayingAudio: value => { currentPlayingAudio = value; },
            setCurrentPlayingVideo: value => { currentPlayingVideo = value; },
            showToast: (...args) => showToast(...args)
        }));

        ({
            flushFollowedPendingMessages,
            getActiveFollowedChannel,
            jumpToFullRoom,
            loadFollowedChatPage,
            openFollowedChat,
            playSharedLiveFromMessage,
            toggleFollowedChatMode,
            toggleFollowedRoomType
        } = window.YayaRendererFeatures.createFollowedChatFeature({
            createCustomAudioPlayer,
            createCustomVideoPlayer,
            fetchPocketAPI,
            getAdaptivePollDelay: () => getAdaptivePollDelay(),
            getAppToken: () => getCurrentAppToken(),
            getMemberData: () => memberData || [],
            ipcRenderer,
            playArchiveFromMessage: (...args) => typeof playArchiveFromMessage === 'function'
                ? playArchiveFromMessage(...args)
                : undefined,
            playLiveStream: (...args) => typeof playLiveStream === 'function'
                ? playLiveStream(...args)
                : undefined,
            replaceTencentEmoji: value => typeof replaceTencentEmoji === 'function' ? replaceTencentEmoji(value) : value,
            showToast: (...args) => showToast(...args),
            switchView
        }));
        window.flushFollowedPendingMessages = flushFollowedPendingMessages;
        window.jumpToFullRoom = jumpToFullRoom;
        window.loadFollowedChatPage = loadFollowedChatPage;
        window.openFollowedChat = openFollowedChat;
        window.playSharedLiveFromMessage = playSharedLiveFromMessage;
        window.toggleFollowedChatMode = toggleFollowedChatMode;
        window.toggleFollowedRoomType = toggleFollowedRoomType;

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

        ({
            executeQuickAction,
            handleQuickFollowSearch,
            loadFollowedRooms,
            selectFollowedSort,
            selectQuickFollowMember,
            sortFollowedRooms,
            toggleFollowedSortDropdown
        } = window.YayaRendererFeatures.createFollowedRoomsFeature({
            getActiveFollowedChannel: () => getActiveFollowedChannel(),
            getAppToken: () => getCurrentAppToken(),
            getMemberData: () => memberData || [],
            getMemberDataLoaded: () => !!window.isMemberDataLoaded,
            getPinyinInitials,
            getTeamStyle: (...args) => {
                if (typeof getTeamStyle === 'function') return getTeamStyle(...args);
                if (typeof window.getTeamStyle === 'function') return window.getTeamStyle(...args);
                return '';
            },
            ipcRenderer,
            loadMemberData,
            memberSortLogic,
            replaceTencentEmoji: value => typeof replaceTencentEmoji === 'function' ? replaceTencentEmoji(value) : value,
            showToast: (...args) => showToast(...args)
        }));
        window.executeQuickAction = executeQuickAction;
        window.handleQuickFollowSearch = handleQuickFollowSearch;
        window.loadFollowedRooms = loadFollowedRooms;
        window.selectFollowedSort = selectFollowedSort;
        window.selectQuickFollowMember = selectQuickFollowMember;
        window.sortFollowedRooms = sortFollowedRooms;
        window.toggleFollowedSortDropdown = toggleFollowedSortDropdown;

        ({
            loadMemberAvatar,
            updateSessionAvatar
        } = window.YayaRendererFeatures.createAvatarCacheFeature({
            getAppToken: () => getCurrentAppToken(),
            ipcRenderer
        }));
        window.loadMemberAvatar = loadMemberAvatar;
        window.updateSessionAvatar = updateSessionAvatar;

        ({
            clearActivePrivateMessageUnread,
            formatPrivateMessageContent,
            formatPrivateMessageDateTime,
            formatPrivateMessagePreview,
            formatPrivateMessageTime,
            getPrivateMessageAvatar,
            getPrivateMessageConversationKey,
            getPrivateMessageDisplayName,
            getPrivateMessageItemKey,
            getPrivateMessageTeamLabel,
            normalizePrivateMessageName,
            renderPrivateMessageContentHtml
        } = window.YayaRendererFeatures.createPrivateMessageFormattersFeature({
            escapePrivateMessageHtml,
            getMemberData: () => memberData || [],
            privateMessageDetailState,
            privateMessageListState
        }));

        ({
            checkPrivateMessageFlipCostMin,
            closePrivateMessageDetail,
            filterPrivateMessageList,
            flushPrivateMessagePendingMessages,
            handlePrivateMessageFlipCostInput,
            handlePrivateMessageReplyKeydown,
            loadMorePrivateMessageDetail,
            loadMorePrivateMessageList,
            loadPrivateMessageDetail,
            loadPrivateMessageList,
            openPrivateMessageDetail,
            refreshPrivateMessageList,
            resetPrivateMessageDetailPanel,
            sendPrivateMessageReply,
            startPrivateMessagePolling,
            stopPrivateMessagePolling,
            syncPrivateMessageFlipControls,
            togglePrivateMessageFlipAnswerDropdown,
            togglePrivateMessageFlipPrivacyDropdown,
            selectPrivateMessageFlipAnswer,
            selectPrivateMessageFlipPrivacy,
            updatePrivateMessageReplyCounter,
            updatePrivateMessageFlipCostDisplay
        } = window.YayaRendererFeatures.createPrivateMessagesFeature({
            privateMessageListState,
            privateMessageDetailState,
            clearActivePrivateMessageUnread,
            createCustomAudioPlayer,
            createCustomVideoPlayer,
            escapePrivateMessageHtml,
            formatPrivateMessageContent,
            formatPrivateMessageDateTime,
            formatPrivateMessagePreview,
            formatPrivateMessageTime,
            getAdaptivePollDelay: () => getAdaptivePollDelay(),
            getAppToken: () => getCurrentAppToken(),
            getCurrentPlayingAudio: () => currentPlayingAudio,
            getCurrentSearchKeyword: () => (document.getElementById('private-message-search')?.value || ''),
            getMemberData: () => memberData || [],
            getPrivateMessageAvatar,
            getPrivateMessageConversationKey,
            getPrivateMessageDisplayName,
            getPrivateMessageItemKey,
            getPrivateMessageTeamLabel,
            getPrivateMessagesMemberDataLoaded: () => !!window.isMemberDataLoaded,
            ipcRenderer,
            loadMemberData,
            normalizePrivateMessageName,
            renderPrivateMessageContentHtml,
            setCurrentPlayingAudio: value => { currentPlayingAudio = value; },
            showToast: (...args) => showToast(...args),
            switchView
        }));
        window.closePrivateMessageDetail = closePrivateMessageDetail;
        window.filterPrivateMessageList = filterPrivateMessageList;
        window.flushPrivateMessagePendingMessages = flushPrivateMessagePendingMessages;
        window.handlePrivateMessageFlipCostInput = handlePrivateMessageFlipCostInput;
        window.handlePrivateMessageReplyKeydown = handlePrivateMessageReplyKeydown;
        window.loadMorePrivateMessageDetail = loadMorePrivateMessageDetail;
        window.loadMorePrivateMessageList = loadMorePrivateMessageList;
        window.openPrivateMessageDetail = openPrivateMessageDetail;
        window.refreshPrivateMessageList = refreshPrivateMessageList;
        window.sendPrivateMessageReply = sendPrivateMessageReply;
        window.checkPrivateMessageFlipCostMin = checkPrivateMessageFlipCostMin;
        window.syncPrivateMessageFlipControls = syncPrivateMessageFlipControls;
        window.togglePrivateMessageFlipAnswerDropdown = togglePrivateMessageFlipAnswerDropdown;
        window.togglePrivateMessageFlipPrivacyDropdown = togglePrivateMessageFlipPrivacyDropdown;
        window.selectPrivateMessageFlipAnswer = selectPrivateMessageFlipAnswer;
        window.selectPrivateMessageFlipPrivacy = selectPrivateMessageFlipPrivacy;
        window.updatePrivateMessageReplyCounter = updatePrivateMessageReplyCounter;
        window.updatePrivateMessageFlipCostDisplay = updatePrivateMessageFlipCostDisplay;

        ({
            directToPotPlayer,
            fetchDanmuNative,
            handleDownloadDanmu,
            handleDownloadVOD,
            matchReplayByTime,
            openInBrowser,
            playArchiveFromMessage
        } = window.YayaRendererFeatures.createReplayDownloadFeature({
            fetchPocketAPI,
            getCurrentMode: () => currentMode,
            getDownloadStatus: liveId => downloadStatusMap[liveId],
            getFilteredVODList,
            getMemberIdFromQuery,
            getPlayLiveStream: () => playLiveStream,
            getPreferredExternalPlayerName,
            getVodState: () => window.vodState,
            https,
            ipcRenderer,
            openExternal,
            openMediaInExternalPlayer,
            renderVODListUI: () => window.renderVODListUI(),
            setDownloadStatus: (liveId, status) => { downloadStatusMap[liveId] = status; },
            deleteDownloadStatus: liveId => { delete downloadStatusMap[liveId]; },
            showToast: (...args) => showToast(...args),
            switchView,
            fetchVODPageInternal
        }));
        window.directToPotPlayer = directToPotPlayer;
        window.fetchDanmuNative = fetchDanmuNative;
        window.handleDownloadDanmu = handleDownloadDanmu;
        window.handleDownloadVOD = handleDownloadVOD;
        window.matchReplayByTime = matchReplayByTime;
        window.openInBrowser = openInBrowser;
        window.playArchiveFromMessage = playArchiveFromMessage;

        ({
            destroyPlayers,
            playLiveStream,
            startPlayer
        } = window.YayaRendererFeatures.createPlayerCoreFeature({
            backToLiveList,
            fetchDanmuNative,
            fetchPocketAPI,
            getArt: () => art,
            getCurrentPlayingItem: () => currentPlayingItem,
            getDp: () => dp,
            getLiveAnnouncementDismissed: () => liveAnnouncementDismissed,
            getNimInstance: () => nimInstance,
            getSelectedLiveGiftId: () => selectedLiveGiftId,
            initArtLiveDanmu: (...args) => typeof initArtLiveDanmu === 'function'
                ? initArtLiveDanmu(...args)
                : undefined,
            initLiveDanmu: (...args) => typeof initLiveDanmu === 'function'
                ? initLiveDanmu(...args)
                : undefined,
            ipcRenderer,
            loadTimelineSubtitleText: (...args) => typeof loadTimelineSubtitleText === 'function'
                ? loadTimelineSubtitleText(...args)
                : [],
            parsePocketDanmu,
            renderDanmuListUI: (...args) => typeof renderDanmuListUI === 'function'
                ? renderDanmuListUI(...args)
                : undefined,
            resetClipTool: (...args) => typeof resetClipTool === 'function'
                ? resetClipTool(...args)
                : undefined,
            resetTimelinePanel: (...args) => typeof resetTimelinePanel === 'function'
                ? resetTimelinePanel(...args)
                : undefined,
            setArt: value => { art = value; },
            setCurrentPlayingItem: value => { currentPlayingItem = value; },
            setDp: value => { dp = value; },
            setLiveAnnouncementDismissed: value => { liveAnnouncementDismissed = !!value; },
            setNimInstance: value => { nimInstance = value; },
            setSelectedLiveGiftId: value => { selectedLiveGiftId = value; },
            showToast: (...args) => showToast(...args),
            stopRoomRadio: (...args) => typeof stopRoomRadio === 'function' ? stopRoomRadio(...args) : undefined,
            syncDanmuHighlight: (...args) => typeof syncDanmuHighlight === 'function'
                ? syncDanmuHighlight(...args)
                : undefined
        }));
        window.destroyPlayers = destroyPlayers;
        window.playLiveStream = playLiveStream;
        window.startPlayer = startPlayer;

        ({
            closeLiveAnnouncement,
            executeClip,
            fetchLiveRank,
            refreshLiveAnnouncement,
            resetClipTool,
            setClipEnd,
            setClipEndFromTimeline,
            setClipStart,
            setClipStartFromTimeline,
            toggleRankPanel,
            updateClipUI
        } = window.YayaRendererFeatures.createLiveToolsFeature({
            fetchPocketAPI,
            getAppToken: () => getCurrentAppToken(),
            getArt: () => art,
            getCurrentMode: () => currentMode,
            getCurrentViewName: () => currentViewName,
            getCurrentPlayingItem: () => currentPlayingItem,
            getLiveAnnouncementDismissed: () => liveAnnouncementDismissed,
            setLiveAnnouncementDismissed: value => { liveAnnouncementDismissed = !!value; },
            getDp: () => dp,
            ipcRenderer
        }));
        window.closeLiveAnnouncement = closeLiveAnnouncement;
        window.executeClip = executeClip;
        window.fetchLiveRank = fetchLiveRank;
        window.refreshLiveAnnouncement = refreshLiveAnnouncement;
        window.resetClipTool = resetClipTool;
        window.setClipEnd = setClipEnd;
        window.setClipEndFromTimeline = setClipEndFromTimeline;
        window.setClipStart = setClipStart;
        window.setClipStartFromTimeline = setClipStartFromTimeline;
        window.toggleRankPanel = toggleRankPanel;

        ({
            handleOpenLiveSearch,
            selectOpenLiveMember,
            fetchOpenLiveList,
            fetchAllOpenLive,
            openOpenLiveInPotPlayer
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
            setCurrentPlayingItem: value => { currentPlayingItem = value; },
            setReturnToOpenLive: value => { returnToOpenLive = !!value; },
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
        window.openOpenLiveInPotPlayer = openOpenLiveInPotPlayer;

        ({
            handleProfileSearch,
            selectProfileMember,
            loadStarProfile
        } = window.YayaRendererFeatures.createProfileFeature({
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
            ipcRenderer
        }));
        window.handleProfileSearch = handleProfileSearch;
        window.selectProfileMember = selectProfileMember;
        window.loadStarProfile = loadStarProfile;

        ({
            fetchAllMemberPhotos,
            handlePhotoSearch,
            selectPhotoMember,
            fetchMemberPhotos
        } = window.YayaRendererFeatures.createMemberPhotosFeature({
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
            showToast: (...args) => showToast(...args),
            createCustomAudioPlayer,
            getAlbumVideoObserver: () => albumVideoObserver,
            getCurrentPlayingAudio: () => currentPlayingAudio,
            getCurrentPlayingVideo: () => currentPlayingVideo,
            setCurrentPlayingVideo: value => { currentPlayingVideo = value; },
            getOptimizedThumbUrl,
            openImageModal
        }));
        window.fetchAllMemberPhotos = fetchAllMemberPhotos;
        window.handlePhotoSearch = handlePhotoSearch;
        window.selectPhotoMember = selectPhotoMember;
        window.fetchMemberPhotos = fetchMemberPhotos;

        ({
            fetchAllRoomAlbum,
            downloadAllRoomAlbum,
            handleRoomAlbumSearch,
            selectRoomAlbumMember,
            fetchRoomAlbum
        } = window.YayaRendererFeatures.createRoomAlbumFeature({
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
            applyRoomAlbumChannelValue,
            ipcRenderer,
            showToast: (...args) => showToast(...args),
            downloadMediaFileIconMode: (...args) => downloadMediaFileIconMode(...args),
            getAlbumVideoObserver: () => albumVideoObserver,
            getCurrentPlayingAudio: () => currentPlayingAudio,
            getCurrentPlayingVideo: () => currentPlayingVideo,
            setCurrentPlayingVideo: value => { currentPlayingVideo = value; },
            getOptimizedThumbUrl,
            openImageModal
        }));
        window.fetchAllRoomAlbum = fetchAllRoomAlbum;
        window.downloadAllRoomAlbum = downloadAllRoomAlbum;
        window.handleRoomAlbumSearch = handleRoomAlbumSearch;
        window.selectRoomAlbumMember = selectRoomAlbumMember;
        window.fetchRoomAlbum = fetchRoomAlbum;

        ({
            handleRoomRadioSearch,
            selectRoomRadioMember,
            connectRoomRadio,
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
            ipcRenderer,
            showToast: (...args) => showToast(...args)
        }));
        window.handleRoomRadioSearch = handleRoomRadioSearch;
        window.selectRoomRadioMember = selectRoomRadioMember;
        window.connectRoomRadio = connectRoomRadio;
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

        ({
            ensureNimChatroomSdkLoaded,
            initLiveDanmu,
            initArtLiveDanmu,
            initDanmuForDPlayer
        } = window.YayaRendererFeatures.createNimChatroomFeature({
            getDp: () => dp,
            getNimInstance: () => nimInstance,
            setNimInstance: value => { nimInstance = value; },
            handlePocketMessage: (msg, player) => {
                if (typeof handlePocketMessage === 'function') {
                    handlePocketMessage(msg, player);
                }
            },
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
            getCurrentMode: () => currentMode,
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
            applyFilters,
            escapeHtml,
            getAllPosts: () => allPosts || [],
            getCurrentFilteredPosts: () => currentFilteredPosts || [],
            getMemberIdSet: () => memberIdSet,
            getMemberNameMap: () => memberNameMap,
            getPocketGiftData: () => typeof POCKET_GIFT_DATA !== 'undefined' ? POCKET_GIFT_DATA : [],
            populateDays,
            populateMonths,
            selectDateItem,
            setFilter
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

        ({
            applyFlipSearch,
            changeFlipPage,
            checkFlipCostMin,
            executeDeleteFlip,
            executeSendFlip,
            forceReloadFlips,
            handleFlipSendSearch,
            loadFlipList,
            refreshFlipUserBalance,
            selectFlipAnswer,
            selectFlipPrivacy,
            selectFlipSendMember,
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
            toggleFlipDateDropdown,
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
        window.executeDeleteFlip = executeDeleteFlip;
        window.executeSendFlip = executeSendFlip;
        window.forceReloadFlips = forceReloadFlips;
        window.handleFlipSendSearch = handleFlipSendSearch;
        window.loadFlipList = loadFlipList;
        window.refreshFlipUserBalance = refreshFlipUserBalance;
        window.selectFlipAnswer = selectFlipAnswer;
        window.selectFlipPrivacy = selectFlipPrivacy;
        window.selectFlipSendMember = selectFlipSendMember;
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
        window.toggleFlipDateDropdown = toggleFlipDateDropdown;
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
            getCurrentPlayingItem: () => currentPlayingItem,
            getDp: () => dp,
            getPocketGiftData: () => typeof POCKET_GIFT_DATA !== 'undefined' ? POCKET_GIFT_DATA : [],
            getSelectedLiveGiftId: () => selectedLiveGiftId,
            setSelectedLiveGiftId: value => { selectedLiveGiftId = value; },
            ipcRenderer,
            switchView
        }));
        window.executeSendLiveGift = executeSendLiveGift;
        window.renderLiveGiftGrid = renderLiveGiftGrid;
        window.selectLiveGift = selectLiveGift;
        window.toggleGiftPanel = toggleGiftPanel;
        window.updateLiveBalance = updateLiveBalance;

        const ACTIVE_POLL_INTERVAL = 3000;
        const BACKGROUND_POLL_INTERVAL = 5000;
        function getAdaptivePollDelay() {
            return (document.hidden || !document.hasFocus()) ? BACKGROUND_POLL_INTERVAL : ACTIVE_POLL_INTERVAL;
        }

        const CACHE_FILE = storagePaths.cacheFile;

        function saveCacheOptimized(data) {
            return new Promise((resolve, reject) => {
                const tempCacheFile = `${CACHE_FILE}.tmp`;
                let settled = false;

                const rejectOnce = (error) => {
                    if (settled) return;
                    settled = true;
                    try { if (fs.existsSync(tempCacheFile)) fs.unlinkSync(tempCacheFile); } catch (cleanupError) { }
                    reject(error);
                };

                try {
                    const stream = fs.createWriteStream(tempCacheFile, {
                        flags: 'w',
                        encoding: 'utf-8'
                    });
                    stream.on('error', (err) => {
                        rejectOnce(err);
                    });
                    stream.on('finish', async () => {
                        if (settled) return;
                        try {
                            await fs.promises.rename(tempCacheFile, CACHE_FILE);
                            settled = true;
                            resolve();
                        } catch (error) {
                            rejectOnce(error);
                        }
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
                    rejectOnce(e);
                }
            });
        }

        function loadCacheOptimized() {
            return new Promise((resolve, reject) => {
                const tempPosts = [];
                let sawOpenBracket = false;
                let sawCloseBracket = false;
                let settled = false;
                const rejectOnce = (error) => {
                    if (settled) return;
                    settled = true;
                    reject(error);
                };
                try {
                    const fileStream = fs.createReadStream(CACHE_FILE);
                    fileStream.on('error', (err) => {
                        rejectOnce(err);
                    });
                    const rl = readline.createInterface({
                        input: fileStream,
                        crlfDelay: Infinity
                    });
                    rl.on('line', (line) => {
                        line = line.trim();
                        if (!line) return;
                        if (line === '[') {
                            if (sawOpenBracket) {
                                rl.close();
                                rejectOnce(new Error('缓存文件格式异常'));
                            }
                            sawOpenBracket = true;
                            return;
                        }
                        if (line === ']') {
                            sawCloseBracket = true;
                            return;
                        }
                        if (!sawOpenBracket || sawCloseBracket) {
                            rl.close();
                            rejectOnce(new Error('缓存文件格式异常'));
                            return;
                        }
                        if (line.endsWith(',')) line = line.slice(0, -1);
                        if (line) {
                            try {
                                const post = JSON.parse(line);
                                tempPosts.push(post);
                            } catch (e) {
                                rl.close();
                                rejectOnce(new Error('缓存文件解析失败'));
                            }
                        }
                    });
                    rl.on('close', () => {
                        if (settled) return;
                        if (!sawOpenBracket || !sawCloseBracket) {
                            rejectOnce(new Error('缓存文件不完整'));
                            return;
                        }

                        settled = true;
                        resolve(tempPosts);
                    });
                } catch (e) {
                    rejectOnce(e);
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
                migrateLegacyPersistentState();
                initTheme();

                Promise.resolve(checkGitHubNotice()).catch((error) => {
                    console.warn('公告检查失败:', error);
                });

                Promise.resolve(loadMemberIdMap()).catch((error) => {
                    console.warn('成员列表预加载失败:', error);
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
                if (typeof syncAutoCheckinUi === 'function') {
                    syncAutoCheckinUi();
                }
                const savedToken = getStoredAppToken();
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

        window.openMessageDataFolder = async function () {
            try {
                const result = await ipcRenderer.invoke('open-message-data-folder');
                if (!result || !result.success) {
                    throw new Error(result?.msg || '无法打开数据文件夹');
                }
            } catch (error) {
                showToast(error.message || '无法打开数据文件夹');
            }
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
            if (isMessageDataScanRunning) {
                pendingMessageDataScanMode = pendingMessageDataScanMode === false ? false : !!isIncremental;
                statusMsg.textContent = "已有更新任务在进行，稍后继续处理...";
                return;
            }

            isMessageDataScanRunning = true;
            try {
                await scanFilesInternal(isIncremental);
            } finally {
                isMessageDataScanRunning = false;
                if (pendingMessageDataScanMode !== null) {
                    const nextScanMode = pendingMessageDataScanMode;
                    pendingMessageDataScanMode = null;
                    setTimeout(() => scanFiles(nextScanMode), 0);
                }
            }
        }

        async function scanFilesInternal(isIncremental = false) {
            if (!fs.existsSync(FIXED_PATH)) {
                setMessageIndexLoadingState(false);
                statusMsg.textContent = "❌ 路径不存在";
                outputList.innerHTML = `<div class="placeholder-tip"><h3>❌ 路径配置错误</h3><p>找不到文件夹：<br><b>${FIXED_PATH}</b></p></div>`;
                return;
            }

            loadManifest();

            if (isIncremental && allPosts.some(post => !post || !post.sourcePath)) {
                isIncremental = false;
                statusMsg.textContent = "检测到旧版缓存，正在重建索引...";
            }

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
            const changedFilePaths = new Set();

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
                            const parsed = parseHtmlContent(text, fileObj.fileName, fileObj.group).map(post => ({
                                ...post,
                                sourcePath: fileObj.fullPath,
                                sourceFile: fileObj.fileName
                            }));
                            newPosts = newPosts.concat(parsed);
                            changedFilePaths.add(fileKey);

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
                    if (changedFilePaths.size > 0) {
                        allPosts = allPosts.filter(post => !changedFilePaths.has(post.sourcePath));
                    }
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
                    const uniqueKey = post.exportKey
                        ? `${post.sourcePath || post.groupName || ''}_${post.exportKey}`
                        : `${post.sourcePath || ''}_${post.timeStr}_${post.nameStr}_${(post.text || '').substring(0, 80)}`;
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
            ensurePageData(2, { silent: true }).then(() => {
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
                    ensurePageData(2, { silent: true }).then(() => renderVODListUI());
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
                ensurePageData(2, { silent: true }).then(() => renderVODListUI());
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
                const userId = String(u.userId || u.id || item.userId || item.id || '');
                const memberNames = getMemberNamesById(userId).map(v => String(v).toLowerCase()).join(' ');
                let timeStr = '';
                const rawTime = item.startTime || item.ctime;
                if (rawTime) {
                    const d = new Date(Number(rawTime));
                    timeStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                }
                const searchableText = [name, memberNames, title, userId, timeStr].filter(Boolean).join(' ');
                return keywords.every(kw => searchableText.includes(kw));
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
        async function ensurePageData(page, options = {}) {
            if (vodState.isLoading) return;
            const silent = !!options.silent;
            const targetCount = page * vodState.pageSize;
            if (getFilteredVODList().length >= targetCount || !vodState.hasMore) return;
            vodState.isLoading = true;
            if (!silent && vodState.list.length === 0) document.getElementById('vod-loading').style.display = 'block';
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

        let lastVodPaginationMarkup = '';

        function togglePagination(enabled) {
            const container = document.getElementById('vod-pagination-controls');
            if (!container) return;
            container.dataset.busy = enabled ? '0' : '1';
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

        function updatePaginationControls(totalItems) {
            const controlsContainer = document.getElementById('vod-pagination-controls');
            if (!controlsContainer) return;
            if (totalItems === 0) {
                if (lastVodPaginationMarkup !== '') {
                    controlsContainer.innerHTML = '';
                    lastVodPaginationMarkup = '';
                }
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
            if (html === lastVodPaginationMarkup) return;
            controlsContainer.innerHTML = html;
            lastVodPaginationMarkup = html;
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

        let nimInstance = null,
            dp = null,
            art = null;

        bgInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const settingsApi = getAppSettingsApi();
                if (settingsApi && typeof settingsApi.saveBackgroundFromFileSync === 'function' && file.path) {
                    try {
                        const backgroundUrl = settingsApi.saveBackgroundFromFileSync(file.path);
                        if (typeof applyCustomBackground === 'function') {
                            applyCustomBackground(backgroundUrl);
                        } else {
                            document.body.style.backgroundImage = `url('${backgroundUrl}')`;
                        }
                        localStorage.removeItem('custom_bg_data');
                        bgInput.value = '';
                        return;
                    } catch (error) {
                        console.warn('保存背景图片文件失败，回退为内存读取:', error);
                    }
                }

                const reader = new FileReader();
                reader.onload = (ev) => {
                    let nextBackground = ev.target.result;
                    if (settingsApi && typeof settingsApi.saveBackgroundFromDataUrlSync === 'function') {
                        try {
                            nextBackground = settingsApi.saveBackgroundFromDataUrlSync(ev.target.result) || ev.target.result;
                            localStorage.removeItem('custom_bg_data');
                        } catch (error) {
                            console.warn('保存背景图片数据失败，回退到旧存储:', error);
                        }
                    }

                    if (typeof applyCustomBackground === 'function') {
                        applyCustomBackground(nextBackground);
                    } else {
                        document.body.style.backgroundImage = `url('${nextBackground}')`;
                    }
                    if (!(settingsApi && typeof settingsApi.saveBackgroundFromDataUrlSync === 'function')) {
                        try {
                            localStorage.setItem('custom_bg_data', ev.target.result);
                        } catch (e) { }
                    }
                    bgInput.value = '';
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
                const exportKey = row.getAttribute('data-export-key') || '';
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
                    exportKey,
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

        function createMessageListRow(post) {
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
            return div;
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
                fragment.appendChild(createMessageListRow(post));
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
        let currentSearchKeyword = "";

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
                { wrapperId: 'flip-date-wrapper', dropdownId: 'flip-date-dropdown' },
                { wrapperId: 'flip-type-wrapper', dropdownId: 'flip-type-dropdown' },
                { wrapperId: 'flip-visibility-wrapper', dropdownId: 'flip-visibility-dropdown' },
                { wrapperId: 'flip-sort-wrapper', dropdownId: 'flip-sort-dropdown' },
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


        document.addEventListener('click', function (e) {
            const flipModal = document.getElementById('flipAnalysisModal');
            if (e.target === flipModal) closeFlipAnalysis();
        });


        let selectedLiveGiftId = null;

        function resetBackground() {
            const settingsApi = getAppSettingsApi();
            if (settingsApi && typeof settingsApi.clearBackgroundSync === 'function') {
                settingsApi.clearBackgroundSync();
            }
            localStorage.removeItem('custom_bg_data');
            if (typeof applyCustomBackground === 'function') {
                applyCustomBackground('');
            } else {
                document.body.style.backgroundImage = '';
            }
        }

        let bilibiliLoginPollTimer = null;
        let currentBilibiliLoginUrl = '';

        function setBilibiliLoginPanelVisible(isVisible) {
            const panel = document.getElementById('bilibili-login-panel');
            if (panel) {
                panel.style.display = isVisible ? 'flex' : 'none';
            }
        }

        function setBilibiliLoginStatus(message, color = '') {
            const statusEl = document.getElementById('bilibili-login-status');
            if (statusEl) {
                statusEl.textContent = message || '';
                statusEl.style.color = color || 'var(--text-sub)';
            }
        }

        function setBilibiliLoginQrMessage(message, color = '') {
            const msgEl = document.getElementById('bilibili-login-qr-msg');
            if (msgEl) {
                msgEl.textContent = message || '';
                msgEl.style.color = color || 'var(--text-sub)';
            }
        }

        function stopBilibiliLoginPolling() {
            if (bilibiliLoginPollTimer) {
                clearInterval(bilibiliLoginPollTimer);
                bilibiliLoginPollTimer = null;
            }
        }

        function renderBilibiliLoginState(result) {
            const loginBtn = document.getElementById('btn-bilibili-login');
            const logoutBtn = document.getElementById('btn-bilibili-logout');
            const userInfo = result && result.userInfo ? result.userInfo : null;

            if (result && result.loggedIn && userInfo) {
                const name = userInfo.uname || 'B站用户';
                const uid = userInfo.mid ? `UID: ${userInfo.mid}` : 'UID: --';
                setBilibiliLoginStatus(`已登录：${name} (${uid})`, '#28a745');
                if (loginBtn) loginBtn.textContent = '切换账号';
                if (logoutBtn) logoutBtn.style.display = 'inline-flex';
                setBilibiliLoginPanelVisible(false);
                stopBilibiliLoginPolling();
                return;
            }

            setBilibiliLoginStatus((result && result.msg) || '未登录B站，登录后可降低直播接口被拦截的概率');
            if (loginBtn) loginBtn.textContent = '登录账号';
            if (logoutBtn) logoutBtn.style.display = 'none';
        }

        async function refreshBilibiliLoginStatus(silent = false) {
            try {
                if (!silent) {
                    setBilibiliLoginStatus('正在检查 B站登录状态...');
                }
                const result = await ipcRenderer.invoke('bilibili-login-status');
                renderBilibiliLoginState(result);
                return result;
            } catch (error) {
                setBilibiliLoginStatus('B站登录状态读取失败', '#ff4d4f');
                return { success: false, loggedIn: false, msg: error.message };
            }
        }

        async function startBilibiliLogin() {
            stopBilibiliLoginPolling();
            currentBilibiliLoginUrl = '';
            setBilibiliLoginStatus('正在生成 B站登录二维码...');
            setBilibiliLoginQrMessage('正在生成二维码...');
            setBilibiliLoginPanelVisible(true);

            const loginBtn = document.getElementById('btn-bilibili-login');
            if (loginBtn) loginBtn.disabled = true;

            try {
                const result = await ipcRenderer.invoke('bilibili-login-create-qrcode');
                if (!result || !result.success) {
                    throw new Error(result?.msg || 'B站二维码生成失败');
                }

                currentBilibiliLoginUrl = result.url;
                const qrImg = document.getElementById('bilibili-login-qr');
                if (qrImg) {
                    qrImg.src = result.qrDataUrl || '';
                }

                setBilibiliLoginStatus('请使用 B站 App 扫码登录');
                setBilibiliLoginQrMessage('等待扫码...');

                bilibiliLoginPollTimer = setInterval(async () => {
                    try {
                        const pollResult = await ipcRenderer.invoke('bilibili-login-poll', {
                            qrcodeKey: result.qrcodeKey
                        });

                        if (!pollResult || !pollResult.success) {
                            throw new Error(pollResult?.msg || 'B站登录状态检查失败');
                        }

                        if (pollResult.loggedIn) {
                            setBilibiliLoginQrMessage('登录成功，正在更新状态...', '#28a745');
                            await refreshBilibiliLoginStatus(true);
                            showToast('B站登录成功');
                            return;
                        }

                        setBilibiliLoginQrMessage(pollResult.msg || '等待扫码...');
                        if (pollResult.expired) {
                            stopBilibiliLoginPolling();
                            setBilibiliLoginStatus('二维码已过期，请重新登录', '#faad14');
                        }
                    } catch (error) {
                        stopBilibiliLoginPolling();
                        setBilibiliLoginQrMessage(error.message || 'B站登录失败', '#ff4d4f');
                        setBilibiliLoginStatus(error.message || 'B站登录失败', '#ff4d4f');
                    }
                }, 2000);
            } catch (error) {
                setBilibiliLoginQrMessage(error.message || 'B站二维码生成失败', '#ff4d4f');
                setBilibiliLoginStatus(error.message || 'B站二维码生成失败', '#ff4d4f');
            } finally {
                if (loginBtn) loginBtn.disabled = false;
            }
        }

        async function logoutBilibili() {
            stopBilibiliLoginPolling();
            try {
                await ipcRenderer.invoke('bilibili-logout');
                currentBilibiliLoginUrl = '';
                const qrImg = document.getElementById('bilibili-login-qr');
                if (qrImg) qrImg.src = '';
                setBilibiliLoginPanelVisible(false);
                renderBilibiliLoginState({ loggedIn: false, msg: '已退出B站账号' });
                showToast('已退出B站账号');
            } catch (error) {
                setBilibiliLoginStatus(error.message || '退出B站登录失败', '#ff4d4f');
            }
        }

        function loadCustomPaths() {
            document.getElementById('path-danmu').value = readStoredStringSetting('yaya_path_danmu', '');
            document.getElementById('path-video').value = readStoredStringSetting('yaya_path_video', '');
            document.getElementById('path-clip').value = readStoredStringSetting('yaya_path_clip', '');
            document.getElementById('path-media').value = readStoredStringSetting('yaya_path_media', '');
            document.getElementById('path-flip').value = readStoredStringSetting('yaya_path_flip', '');
            document.getElementById('path-room-radio').value = readStoredStringSetting('yaya_path_room_radio', '');
        }

        function saveCustomPaths() {
            writeStoredStringSetting('yaya_path_danmu', document.getElementById('path-danmu').value.trim());
            writeStoredStringSetting('yaya_path_video', document.getElementById('path-video').value.trim());
            writeStoredStringSetting('yaya_path_clip', document.getElementById('path-clip').value.trim());
            writeStoredStringSetting('yaya_path_media', document.getElementById('path-media').value.trim());
            writeStoredStringSetting('yaya_path_flip', document.getElementById('path-flip').value.trim());
            writeStoredStringSetting('yaya_path_room_radio', document.getElementById('path-room-radio').value.trim());
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


        ({
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
        } = window.YayaRendererFeatures.createOfficialMediaFeature({
            escapeHtml,
            fetchPocketAPI,
            getCurrentViewMode: () => currentViewMode,
            getCurrentViewName: () => currentViewName,
            getCurrentPlayingVideo: () => currentPlayingVideo,
            getPlaybackViewToken: () => mediaPlaybackViewToken,
            loadMusicLyrics,
            showToast: (...args) => showToast(...args),
            syncMusicLyrics,
            toggleMusicLyricsPanel,
            updateMusicLyricsToggleButton
        }));
        window.closeVideoPlayer = closeVideoPlayer;
        window.cycleAudioProgramPlayMode = cycleAudioProgramPlayMode;
        window.cycleMusicPlayMode = cycleMusicPlayMode;
        window.debouncedAudioSearch = debouncedAudioSearch;
        window.debouncedMusicSearch = debouncedMusicSearch;
        window.debouncedVideoSearch = debouncedVideoSearch;
        window.playAudioProgram = playAudioProgram;
        window.playNextAudioProgram = playNextAudioProgram;
        window.playNextMusic = playNextMusic;
        window.playOfficialMusic = playOfficialMusic;
        window.playOfficialVideo = playOfficialVideo;
        window.playPreviousAudioProgram = playPreviousAudioProgram;
        window.playPreviousMusic = playPreviousMusic;
        window.restoreAudioProgramPlayerState = restoreAudioProgramPlayerState;
        window.suspendAudioProgramForViewSwitch = suspendAudioProgramForViewSwitch;
        window.toggleAudioProgramQueue = toggleAudioProgramQueue;
        window.toggleMusicQueue = toggleMusicQueue;

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

