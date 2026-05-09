(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createPlayerCoreFeature = function createPlayerCoreFeature(deps) {
        const {
            backToLiveList,
            fetchDanmuNative,
            fetchPocketAPI,
            getArt,
            getCurrentPlayingItem,
            getDp,
            getLiveAnnouncementDismissed,
            getNimInstance,
            getSelectedLiveGiftId,
            initArtLiveDanmu,
            initLiveDanmu,
            ipcRenderer,
            loadTimelineSubtitleText,
            parsePocketDanmu,
            renderDanmuListUI,
            resetClipTool,
            resetTimelinePanel,
            setArt,
            setCurrentPlayingItem,
            setDp,
            setLiveAnnouncementDismissed,
            setNimInstance,
            setSelectedLiveGiftId,
            showToast,
            stopRoomRadio,
            syncDanmuHighlight
        } = deps;

        function applyDPlayerVideoTransform(dp) {
            if (!dp || !dp.video) return;
            const degree = Number(dp.yayaRotateDegree) || 0;
            const mirror = dp.yayaMirrorMode || 'none';
            const isPerpendicular = degree % 180 !== 0;
            const bounds = (dp.container || dp.video.parentElement || dp.video).getBoundingClientRect();
            const rotateScale = isPerpendicular && bounds.width > 0 && bounds.height > 0
                ? Math.min(1, bounds.width / bounds.height, bounds.height / bounds.width)
                : 1;
            const rotateTransform = degree ? `rotate(${degree}deg)` : '';
            const scaleTransform = rotateScale < 1 ? `scale(${rotateScale})` : '';
            const mirrorTransform = mirror === 'horizontal'
                ? 'scaleX(-1)'
                : mirror === 'vertical'
                    ? 'scaleY(-1)'
                    : '';
            dp.video.style.transition = 'transform 0.3s ease';
            dp.video.style.transformOrigin = 'center center';
            dp.video.style.objectFit = isPerpendicular ? 'contain' : '';
            dp.video.style.transform = [rotateTransform, scaleTransform, mirrorTransform].filter(Boolean).join(' ');
        }

        function enhanceDPlayerControls(dp) {
            if (!dp || !dp.container) return;

            const install = () => {
                const iconsRight = dp.container.querySelector('.dplayer-icons-right');
                if (!iconsRight) return;
                if (dp.container.querySelector('.yaya-dplayer-control-group')) return;

                const group = document.createElement('div');
                group.className = 'yaya-dplayer-control-group';

                const rotateBtn = document.createElement('button');
                rotateBtn.type = 'button';
                rotateBtn.className = 'yaya-dplayer-control-btn';
                rotateBtn.textContent = '旋转';
                rotateBtn.title = '画面旋转';
                rotateBtn.onclick = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    dp.yayaRotateDegree = ((Number(dp.yayaRotateDegree) || 0) + 90) % 360;
                    applyDPlayerVideoTransform(dp);
                    if (typeof dp.notice === 'function') dp.notice(`旋转: ${dp.yayaRotateDegree}°`);
                };

                const mirrorBtn = document.createElement('button');
                mirrorBtn.type = 'button';
                mirrorBtn.className = 'yaya-dplayer-control-btn';
                mirrorBtn.textContent = '镜像';
                mirrorBtn.title = '镜像翻转';
                mirrorBtn.onclick = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const modes = ['none', 'horizontal', 'vertical'];
                    const labels = {
                        none: '关闭',
                        horizontal: '水平镜像',
                        vertical: '垂直镜像'
                    };
                    const currentIndex = modes.indexOf(dp.yayaMirrorMode || 'none');
                    dp.yayaMirrorMode = modes[(currentIndex + 1) % modes.length] || 'none';
                    mirrorBtn.dataset.mode = dp.yayaMirrorMode;
                    applyDPlayerVideoTransform(dp);
                    if (typeof dp.notice === 'function') dp.notice(`镜像: ${labels[dp.yayaMirrorMode] || '关闭'}`);
                };

                group.appendChild(rotateBtn);
                group.appendChild(mirrorBtn);
                const fullControl = iconsRight.querySelector('.dplayer-full');
                iconsRight.insertBefore(group, fullControl || null);
            };

            install();
            setTimeout(install, 100);
            setTimeout(install, 500);
            if (!dp.yayaTransformResizeBound) {
                dp.yayaTransformResizeBound = true;
                window.addEventListener('resize', () => applyDPlayerVideoTransform(dp));
            }
        }

        window.enhanceYayaDPlayerControls = enhanceDPlayerControls;

        function ensureAnnouncementBar(comboWrapper, playerArea) {
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
                            <div id="live-announcement-text" style="white-space: pre-wrap; line-height: 1.6; letter-spacing: 0.5px; flex:1; font-weight: 500; max-height: calc(1.6em * 3); overflow-y: auto; overflow-x: hidden; padding-right: 4px;"></div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                            <button class="btn btn-secondary" onclick="event.stopPropagation(); refreshLiveAnnouncement(this);" style="width: 24px; height: 24px; padding: 0; font-size: 12px; line-height: 1; background: transparent; border: 1px solid rgba(250,140,22,0.3); color: #fa8c16; border-radius: 4px; flex-shrink: 0; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(250,140,22,0.1)'" onmouseout="this.style.background='transparent'">↻</button>
                            <button class="btn btn-secondary" onclick="event.stopPropagation(); closeLiveAnnouncement();" style="width: 24px; height: 24px; padding: 0; font-size: 16px; font-weight: 600; line-height: 1; background: transparent; border: 1px solid rgba(250,140,22,0.3); color: #fa8c16; border-radius: 4px; flex-shrink: 0; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(250,140,22,0.1)'" onmouseout="this.style.background='transparent'">×</button>
                        </div>
                    </div>
                `;
            }

            return announcementBar;
        }

        function resetAnnouncementBar() {
            const announcementBar = document.getElementById('live-announcement-bar');
            const textEl = document.getElementById('live-announcement-text');

            if (textEl) {
                textEl.innerHTML = '';
            }

            if (announcementBar) {
                announcementBar.style.display = 'none';
                announcementBar.scrollTop = 0;
            }
        }

        function resetRankContainer() {
            const rankContainer = document.getElementById('live-rank-container');
            const rankList = document.getElementById('live-rank-list');
            const rankArrow = document.getElementById('rank-panel-arrow');

            if (rankList) {
                rankList.style.display = 'none';
                rankList.innerHTML = '';
            }

            if (rankArrow) {
                rankArrow.style.transform = 'rotate(0deg)';
            }

            if (rankContainer) {
                rankContainer.style.display = 'none';
            }
        }

        function ensureRankContainer(comboWrapper) {
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

            return rankContainer;
        }

        function isMeet48Playback(mode, item) {
            return mode === 'meet-live' || mode === 'meet-vod' || item?.source === 'meet48';
        }

        function isLivePlaybackMode(mode, item) {
            return mode === 'live' || mode === 'meet-live' || (item?.source === 'meet48' && mode !== 'meet-vod');
        }

        function getMeet48StreamUrl(content) {
            if (!content) return '';
            if (content.playStreamPath) return content.playStreamPath;
            if (content.streamPath) return content.streamPath;
            if (Array.isArray(content.playStreams)) {
                const stream = content.playStreams.find(item => item && item.streamPath) || content.playStreams[0];
                return stream?.streamPath || '';
            }
            return '';
        }

        function configurePlayerLayout(mode) {
            const splitLayout = document.getElementById('player-split-layout');
            const timelineWrapper = document.getElementById('danmu-timeline-wrapper');
            const playerArea = document.getElementById('live-player-area');
            const rightWrapper = document.getElementById('player-right-column');
            const comboWrapper = document.getElementById('player-combo-wrapper');
            const playerView = document.getElementById('live-player-view');
            const isMobileLayout = window.matchMedia
                ? window.matchMedia('(max-width: 768px)').matches
                : window.innerWidth <= 768;

            if (!splitLayout || !playerView) return;

            if (mode === 'live' || mode === 'meet-live') {
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
                    comboWrapper.style.width = isMobileLayout ? '100%' : '';
                    comboWrapper.style.maxWidth = '';
                    comboWrapper.style.margin = '';
                }
                if (playerArea) {
                    playerArea.style.flex = 'none';
                    playerArea.style.height = isMobileLayout ? 'min(68svh, 720px)' : 'auto';
                    playerArea.style.width = isMobileLayout ? '100%' : '';
                    playerArea.style.maxHeight = '';
                    playerArea.style.aspectRatio = isMobileLayout ? 'auto' : '16 / 9';
                    playerArea.style.minHeight = isMobileLayout ? '0' : '350px';
                }
            } else {
                splitLayout.style.flexDirection = isMobileLayout ? 'column' : 'row';
                splitLayout.style.alignItems = 'stretch';
                if (timelineWrapper) timelineWrapper.style.display = 'flex';

                if (rightWrapper) {
                    rightWrapper.style.width = isMobileLayout ? '100%' : 'auto';
                    rightWrapper.style.maxWidth = 'none';
                    rightWrapper.style.margin = '0';
                    rightWrapper.style.overflowY = isMobileLayout ? 'visible' : 'auto';
                    rightWrapper.style.paddingRight = isMobileLayout ? '0' : '5px';
                    rightWrapper.style.paddingBottom = '0';
                    rightWrapper.style.height = isMobileLayout ? 'auto' : '100%';
                }

                playerView.style.flex = '1';
                playerView.style.height = 'auto';
                playerView.style.minHeight = '0';
                playerView.style.setProperty('overflow', isMobileLayout ? 'visible' : 'hidden', 'important');

                if (comboWrapper) {
                    comboWrapper.style.flex = isMobileLayout ? 'none' : '1 0 auto';
                    comboWrapper.style.height = 'auto';
                    comboWrapper.style.width = isMobileLayout ? '100%' : '';
                    comboWrapper.style.maxWidth = '';
                    comboWrapper.style.margin = '';
                }
                if (playerArea) {
                    playerArea.style.flex = isMobileLayout ? 'none' : '1 0 auto';
                    playerArea.style.height = isMobileLayout ? 'min(68svh, 720px)' : 'auto';
                    playerArea.style.width = isMobileLayout ? '100%' : '';
                    playerArea.style.maxHeight = '';
                    playerArea.style.aspectRatio = 'auto';
                    playerArea.style.minHeight = isMobileLayout ? '0' : '300px';
                }
            }
        }

        function resetLiveSidePanels(mode) {
            const giftContainer = document.getElementById('live-gift-container');
            if (giftContainer) {
                giftContainer.style.display = mode === 'live' ? 'block' : 'none';
            }

            const giftPanel = document.getElementById('live-gift-panel');
            const giftArrow = document.getElementById('gift-panel-arrow');
            if (giftPanel) giftPanel.style.display = 'none';
            if (giftArrow) giftArrow.style.transform = 'rotate(0deg)';
            if (typeof setSelectedLiveGiftId === 'function') {
                setSelectedLiveGiftId(null);
            }

            const rankList = document.getElementById('live-rank-list');
            const rankArrow = document.getElementById('rank-panel-arrow');
            if (rankList) rankList.style.display = 'none';
            if (rankArrow) rankArrow.style.transform = 'rotate(0deg)';
        }

        function updatePlayerMeta(item) {
            const authorEl = document.getElementById('current-live-author');
            if (authorEl) {
                authorEl.textContent = item.userInfo ? item.userInfo.nickname : (item.nickname || '未知成员');
            }

            const openLiveMembersWrap = document.getElementById('current-openlive-members-wrap');
            const openLiveMembersEl = document.getElementById('current-openlive-members');
            if (openLiveMembersWrap) {
                openLiveMembersWrap.style.display = 'none';
            }
            if (openLiveMembersEl) {
                openLiveMembersEl.textContent = '';
            }

            const titleContainer = document.getElementById('current-live-title');
            const dateContainer = document.getElementById('current-live-date');
            const timeContainer = document.getElementById('current-live-time');
            let dateLabel = '';
            let timeLabel = '';

            if (item.startTime || item.ctime) {
                const ts = Number(item.startTime || item.ctime);
                if (!Number.isNaN(ts)) {
                    const d = new Date(ts);
                    const pad = (n) => String(n).padStart(2, '0');
                    dateLabel = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                    timeLabel = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                }
            }

            if (titleContainer) titleContainer.textContent = item.title || item.liveTitle || '直播/回放';
            if (dateContainer) dateContainer.textContent = dateLabel || '未知';
            if (timeContainer) timeContainer.textContent = timeLabel || '未知';
        }

        function mergeLiveResponseMeta(item, content) {
            if (!content || typeof content !== 'object') return item;
            const user = content.user || content.userInfo || {};
            return Object.assign({}, item, {
                title: content.title || content.liveTitle || item.title || item.liveTitle,
                liveTitle: content.liveTitle || content.title || item.liveTitle || item.title,
                startTime: content.startTime || content.ctime || content.beginTime || item.startTime || item.ctime,
                ctime: content.ctime || content.startTime || content.beginTime || item.ctime || item.startTime,
                userInfo: Object.assign({}, item.userInfo || {}, {
                    nickname: user.userName || user.nickname || item.userInfo?.nickname || item.nickname
                }),
                nickname: user.userName || user.nickname || item.nickname
            });
        }

        function syncMediaDeepLink(item, mode) {
            if (!item || !item.liveId) return;
            if (!window.desktop || window.desktop.platform !== 'web') return;
            if (mode === 'live' && typeof window.syncWebLiveRoute === 'function') {
                window.syncWebLiveRoute(item);
            } else if (mode === 'vod' && typeof window.syncWebVodRoute === 'function') {
                window.syncWebVodRoute(item);
            }
        }

        async function playLiveStream(item, mode) {
            if (typeof setCurrentPlayingItem === 'function') {
                setCurrentPlayingItem(item);
            }

            if (typeof resetClipTool === 'function') {
                resetClipTool();
            }

            const mediaListArea = document.getElementById('media-list-area');
            const vodPaginationControls = document.getElementById('vod-pagination-controls');
            const mediaListControls = document.getElementById('media-list-controls');
            const playerView = document.getElementById('live-player-view');
            const comboWrapper = document.getElementById('player-combo-wrapper');
            const playerArea = document.getElementById('live-player-area');

            if (mediaListArea) mediaListArea.style.display = 'none';
            if (vodPaginationControls) vodPaginationControls.style.display = 'none';
            if (mediaListControls) mediaListControls.style.display = 'none';
            if (playerView) playerView.style.display = 'flex';

            updatePlayerMeta(item);
            syncMediaDeepLink(item, mode);

            const announcementBar = ensureAnnouncementBar(comboWrapper, playerArea);
            const rankContainer = ensureRankContainer(comboWrapper);

            configurePlayerLayout(mode);
            resetLiveSidePanels(mode);

            const liveControls = document.getElementById('live-list-controls');
            if (liveControls) liveControls.style.display = 'none';

            const oldNotice = document.querySelector('#live-player-area .live-link-info');
            if (oldNotice) oldNotice.remove();

            const liveVideo = document.getElementById('live-video');
            if (liveVideo) liveVideo.style.display = 'none';

            if (typeof setLiveAnnouncementDismissed === 'function') {
                setLiveAnnouncementDismissed(false);
            }

            try {
                const isMeet48 = isMeet48Playback(mode, item);
                const isLiveContent = isLivePlaybackMode(mode, item);
                const res = isMeet48
                    ? await ipcRenderer.invoke('fetch-meet48-live-one', { liveId: item.liveId })
                    : await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({
                        liveId: item.liveId
                    }));

                if (res && (res.status === 200 || res.success) && res.content) {
                    const hydratedItem = mergeLiveResponseMeta(item, res.content);
                    if (typeof setCurrentPlayingItem === 'function') {
                        setCurrentPlayingItem(hydratedItem);
                    }
                    updatePlayerMeta(hydratedItem);
                    const streamUrl = isMeet48 ? getMeet48StreamUrl(res.content) : res.content.playStreamPath;
                    if (!streamUrl) {
                        showToast('无法获取流地址');
                        backToLiveList();
                        return;
                    }
                    const title = hydratedItem.title || hydratedItem.liveTitle;
                    const isLive = isLiveContent || /^rtmp:\/\//i.test(streamUrl);
                    const danmuUrl = res.content.msgFilePath;

                    if (announcementBar) {
                        const textEl = document.getElementById('live-announcement-text');
                        if (textEl) {
                            if (res.content.announcement) {
                                textEl.innerText = res.content.announcement;
                                announcementBar.scrollTop = 0;
                            } else {
                                textEl.innerHTML = '<span style="opacity: 0.6; font-style: italic;">暂无公告</span>';
                            }
                        }

                        const dismissed = typeof getLiveAnnouncementDismissed === 'function'
                            ? getLiveAnnouncementDismissed()
                            : false;
                        announcementBar.style.display = dismissed ? 'none' : 'block';
                    }

                    if (rankContainer) {
                        if (mode === 'live') {
                            rankContainer.style.display = 'block';
                            if (typeof window.fetchLiveRank === 'function') {
                                window.fetchLiveRank(item.liveId);
                            }
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
                        } catch (e) {
                        }
                    }

                    if (typeof renderDanmuListUI === 'function') {
                        renderDanmuListUI(danmuData);
                    }
                    await startPlayer(streamUrl, title, isLive, res.content.chatroomId, danmuData);
                } else {
                    showToast(res?.msg || res?.message || '无法获取流地址');
                    backToLiveList();
                }
            } catch (err) {
                showToast('播放失败');
                backToLiveList();
            }
        }

        async function startPlayer(url, title = '直播/回放', isLiveContent = false, chatroomId = null, vodDanmuData = [], options = {}) {
            const { clearAuxPanels = false } = options || {};
            destroyPlayers({ clearTimeline: isLiveContent, clearAuxPanels });
            const container = document.getElementById('live-player-container');
            if (!container) return;

            if (isLiveContent) {
                try {
                    container.innerHTML = '<div style="color:white;display:flex;height:100%;align-items:center;justify-content:center;">来自yk1z的提示：正在连接中...</div>';
                    if (typeof window.ensureYayaWebPlayerLibs === 'function') {
                        await window.ensureYayaWebPlayerLibs('dplayer');
                    }
                    const localUrl = await ipcRenderer.invoke('start-live-proxy', url);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    container.innerHTML = '<div id="dplayer-container" style="width:100%; height:100%"></div>';

                    let flvPlayer = null;
                    const nextDp = new DPlayer({
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

                    setDp(nextDp);
                    enhanceDPlayerControls(nextDp);
                    setArt({
                        get currentTime() {
                            return nextDp.video.currentTime;
                        },
                        get notice() {
                            return {
                                show: (msg) => nextDp.notice(msg)
                            };
                        },
                        option: {
                            url: localUrl
                        }
                    });

                    setInterval(() => {
                        if (flvPlayer && flvPlayer.buffered.length) {
                            const diff = flvPlayer.buffered.end(0) - flvPlayer.currentTime;
                            if (diff > 2) flvPlayer.currentTime = flvPlayer.buffered.end(0) - 0.1;
                        }
                    }, 3000);

                    if (chatroomId) {
                        initLiveDanmu(chatroomId);
                    }
                } catch (err) {
                    container.innerHTML = `<div style="color:red">播放失败: ${err.message}</div>`;
                }
                return;
            }

            container.innerHTML = '<div class="artplayer-app"></div>';
            if (typeof window.ensureYayaWebPlayerLibs === 'function') {
                await window.ensureYayaWebPlayerLibs('player');
            }
            if (window.Artplayer) Artplayer.CONTEXTMENU = false;

            const applyVideoTransform = (art) => {
                if (!art || !art.video) return;
                const degree = Number(art.currentRotate) || 0;
                const mirror = art.currentMirror || 'none';
                const isPerpendicular = degree % 180 !== 0;
                const bounds = (art.container || art.video.parentElement || art.video).getBoundingClientRect();
                const rotateScale = isPerpendicular && bounds.width > 0 && bounds.height > 0
                    ? Math.min(1, bounds.width / bounds.height, bounds.height / bounds.width)
                    : 1;
                const rotateTransform = degree ? `rotate(${degree}deg)` : '';
                const scaleTransform = rotateScale < 1 ? `scale(${rotateScale})` : '';
                const mirrorTransform = mirror === 'horizontal'
                    ? 'scaleX(-1)'
                    : mirror === 'vertical'
                        ? 'scaleY(-1)'
                        : '';
                art.video.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
                art.video.style.objectFit = isPerpendicular ? 'contain' : '';
                art.video.style.transform = [rotateTransform, scaleTransform, mirrorTransform].filter(Boolean).join(' ');
            };

            const nextArt = new Artplayer({
                container: '.artplayer-app',
                url,
                title,
                isLive: isLiveContent,
                theme: '#FF8EBF',
                autoSize: false,
                fullscreen: true,
                fullscreenWeb: true,
                setting: true,
                subtitleOffset: false,
                pip: true,
                flip: false,
                playbackRate: true,
                aspectRatio: false,
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
                    }, {
                        html: '<span style="color:#ffff00; font-weight:bold;">黄色</span>',
                        url: '#FFFF00'
                    }, {
                        html: '<span style="color:#00ff00; font-weight:bold;">绿色</span>',
                        url: '#00FF00'
                    }, {
                        html: '<span style="color:#ff0000; font-weight:bold;">红色</span>',
                        url: '#FF0000'
                    }, {
                        html: '<span style="color:#00ffff; font-weight:bold;">青色</span>',
                        url: '#00FFFF'
                    }, {
                        html: '<span style="color:#ff00ff; font-weight:bold;">洋红</span>',
                        url: '#FF00FF'
                    }],
                    onSelect: function (item) {
                        nextArt.subtitle.style('color', item.url);
                        return item.html;
                    }
                }, {
                    html: '字幕大小',
                    width: 250,
                    tooltip: '30px',
                    selector: [{
                        html: '20px (小)',
                        url: '20px'
                    }, {
                        html: '30px (标准)',
                        url: '30px',
                        default: true
                    }, {
                        html: '40px (大)',
                        url: '40px'
                    }, {
                        html: '50px (特大)',
                        url: '50px'
                    }, {
                        html: '60px (极大)',
                        url: '60px'
                    }, {
                        html: '80px (巨型)',
                        url: '80px'
                    }],
                    onSelect: function (item) {
                        nextArt.subtitle.style('fontSize', item.url);
                        return item.html;
                    }
                }, {
                    html: '字幕位置',
                    width: 250,
                    tooltip: '30px',
                    selector: [{
                        html: '0px (最底)',
                        url: '0px'
                    }, {
                        html: '30px (标准)',
                        url: '30px',
                        default: true
                    }, {
                        html: '60px (偏高)',
                        url: '60px'
                    }, {
                        html: '100px (高)',
                        url: '100px'
                    }, {
                        html: '150px (很高)',
                        url: '150px'
                    }],
                    onSelect: function (item) {
                        nextArt.subtitle.style('marginBottom', item.url);
                        return item.html;
                    }
                }, {
                    html: '画面旋转',
                    width: 250,
                    tooltip: '正常',
                    selector: [{
                        html: '正常',
                        url: '0',
                        default: true
                    }, {
                        html: '90°',
                        url: '90'
                    }, {
                        html: '180°',
                        url: '180'
                    }, {
                        html: '270°',
                        url: '270'
                    }],
                    onSelect: function (item) {
                        const degree = Number(item.url) || 0;
                        nextArt.currentRotate = degree;
                        applyVideoTransform(nextArt);
                        if (nextArt.notice) nextArt.notice.show = `旋转: ${degree}°`;
                        return item.html;
                    }
                }, {
                    html: '镜像翻转',
                    width: 250,
                    tooltip: '关闭',
                    selector: [{
                        html: '关闭',
                        url: 'none',
                        default: true
                    }, {
                        html: '水平镜像',
                        url: 'horizontal'
                    }, {
                        html: '垂直镜像',
                        url: 'vertical'
                    }],
                    onSelect: function (item) {
                        nextArt.currentMirror = item.url || 'none';
                        applyVideoTransform(nextArt);
                        if (nextArt.notice) nextArt.notice.show = `镜像翻转: ${item.html}`;
                        return item.html;
                    }
                }],
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
                    flv: function (video, videoUrl) {
                        if (window.mpegts && window.mpegts.getIsSupported()) {
                            const player = window.mpegts.createPlayer({
                                type: 'flv',
                                url: videoUrl,
                                isLive: isLiveContent
                            });
                            player.attachMediaElement(video);
                            player.load();
                            video.mpegts = player;
                        } else {
                            video.src = videoUrl;
                        }
                    },
                    m3u8: function (video, videoUrl) {
                        if (window.Hls && window.Hls.isSupported()) {
                            const hls = new window.Hls();
                            hls.loadSource(videoUrl);
                            hls.attachMedia(video);
                            video.hls = hls;
                        } else {
                            video.src = videoUrl;
                        }
                    }
                }
            });

            setArt(nextArt);

            if (chatroomId && isLiveContent) {
                initArtLiveDanmu(chatroomId, nextArt);
            }

            nextArt.on('ready', () => {
                const removeInput = () => {
                    document.querySelectorAll('.art-control-danmuku-input, .art-danmuku-input, .art-control-danmuku-send').forEach(el => el.remove());
                };

                removeInput();
                setTimeout(removeInput, 500);
                nextArt.on('timeupdate', (currentTime) => {
                    if (typeof syncDanmuHighlight === 'function') {
                        syncDanmuHighlight(currentTime);
                    }
                });
                nextArt.play();
            });
        }

        function destroyPlayers(options = {}) {
            const { clearTimeline = true, clearAuxPanels = true } = options;
            const currentArt = getArt();
            const currentDp = getDp();
            const nimInstance = getNimInstance();

            if (typeof stopRoomRadio === 'function') {
                stopRoomRadio(false);
            }

            if (currentArt && currentArt.destroy) {
                if (currentArt.video.mpegts) {
                    currentArt.video.mpegts.destroy();
                    currentArt.video.mpegts = null;
                }
                if (currentArt.video.hls) {
                    currentArt.video.hls.destroy();
                    currentArt.video.hls = null;
                }
                currentArt.destroy(true);
                setArt(null);
            }

            if (currentDp) {
                currentDp.destroy();
                setDp(null);
            }

            if (nimInstance) {
                nimInstance.disconnect();
                setNimInstance(null);
            }

            const container = document.getElementById('live-player-container');
            if (container) {
                container.innerHTML = '';
            }

            if (clearAuxPanels) {
                resetAnnouncementBar();
                resetRankContainer();
            }

            if (clearTimeline) {
                if (typeof resetTimelinePanel === 'function') {
                    resetTimelinePanel();
                }
            }
        }

        return {
            destroyPlayers,
            playLiveStream,
            startPlayer
        };
    };
}());
