(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createPlayerCoreFeature = function createPlayerCoreFeature(deps) {
        const {
            backToLiveList,
            disconnectLiveDanmu,
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
            syncDanmuHighlight,
            activateMediaPlaybackPage
        } = deps;

        let pendingLiveReconnectTimer = null;
        const LIVE_STALL_RECOVERY_DELAY = 5000;
        const MEDIA_SIGNATURE_TIMEOUT_MS = 6000;
        const LEGACY_FLV_FALLBACK_TIMEOUT_MS = 10000;
        const HLS_INITIAL_LOAD_TIMEOUT_MS = 15000;
        const HLS_RELOAD_MAX_ATTEMPTS = 4;
        const detectedMediaTypeCache = new Map();

        function getLiveReconnectDelay(attempt = 0) {
            return Math.min(5000 + Math.max(0, (Number(attempt) || 0) - 1) * 5000, 30000);
        }

        function isLivePlayerViewOpen() {
            const playerView = document.getElementById('live-player-view');
            const playbackPage = playerView?.closest('.media-playback-page');
            return !!playerView
                && playerView.style.display !== 'none'
                && (!playbackPage || playbackPage.style.display !== 'none');
        }

        function getPerpendicularVideoScale(video, bounds) {
            const containerWidth = Number(bounds?.width) || 0;
            const containerHeight = Number(bounds?.height) || 0;
            if (containerWidth <= 0 || containerHeight <= 0) return 1;

            const videoWidth = Number(video?.videoWidth) || 0;
            const videoHeight = Number(video?.videoHeight) || 0;
            if (videoWidth <= 0 || videoHeight <= 0) {
                return Math.min(1, containerWidth / containerHeight, containerHeight / containerWidth);
            }

            const mediaAspect = videoWidth / videoHeight;
            const containerAspect = containerWidth / containerHeight;
            let renderedWidth;
            let renderedHeight;
            if (mediaAspect > containerAspect) {
                renderedWidth = containerWidth;
                renderedHeight = containerWidth / mediaAspect;
            } else {
                renderedHeight = containerHeight;
                renderedWidth = containerHeight * mediaAspect;
            }

            const scale = Math.min(
                containerWidth / renderedHeight,
                containerHeight / renderedWidth
            );
            return Number.isFinite(scale) && scale > 0 ? scale : 1;
        }

        function applyDPlayerVideoTransform(dp, { animate = true } = {}) {
            if (!dp || !dp.video) return;
            const degree = Number(dp.yayaRotateDegree) || 0;
            const mirror = dp.yayaMirrorMode || 'none';
            const isPerpendicular = degree % 180 !== 0;
            let rotateScale = 1;
            if (isPerpendicular) {
                const bounds = (dp.container || dp.video.parentElement || dp.video).getBoundingClientRect();
                rotateScale = getPerpendicularVideoScale(dp.video, bounds);
            }
            const rotateTransform = degree ? `rotate(${degree}deg)` : '';
            const scaleTransform = Math.abs(rotateScale - 1) > 0.001 ? `scale(${rotateScale})` : '';
            const mirrorTransform = mirror === 'horizontal'
                ? 'scaleX(-1)'
                : mirror === 'vertical'
                    ? 'scaleY(-1)'
                    : '';
            dp.video.style.transition = animate ? 'transform 0.3s ease' : 'none';
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
                let resizeFrame = 0;
                const handleResize = () => {
                    const degree = Number(dp.yayaRotateDegree) || 0;
                    if (degree % 180 === 0 || resizeFrame) return;
                    resizeFrame = window.requestAnimationFrame(() => {
                        resizeFrame = 0;
                        applyDPlayerVideoTransform(dp, { animate: false });
                    });
                };
                dp.yayaTransformResizeCleanup = () => {
                    window.removeEventListener('resize', handleResize);
                    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
                    resizeFrame = 0;
                    dp.yayaTransformResizeBound = false;
                };
                window.addEventListener('resize', handleResize, { passive: true });
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
                textEl.replaceChildren();
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
                rankList.replaceChildren();
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
                            <span style="font-weight: bold; margin-right: 10px;">贡献榜</span>
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

        function normalizePlaybackUrl(url) {
            const value = String(url || '').trim();
            if (!value || !/^https?:\/\//i.test(value)) return value;

            try {
                const parsed = new URL(value);
                const hostname = parsed.hostname.toLowerCase();
                if (parsed.protocol === 'http:' && (hostname === '48.cn' || hostname.endsWith('.48.cn'))) {
                    parsed.protocol = 'https:';
                    return parsed.href;
                }
            } catch (error) {
                window.YayaRendererUtils.reportIgnoredError(error, 'player-core:normalize-playback-url');
            }

            return value;
        }

        async function readRemoteMediaSignature(url, byteCount = 16) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), MEDIA_SIGNATURE_TIMEOUT_MS);
            let reader = null;

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        Range: `bytes=0-${Math.max(0, byteCount - 1)}`
                    },
                    cache: 'no-store',
                    credentials: 'omit',
                    signal: controller.signal
                });

                if (!response.ok) return null;

                if (!response.body || typeof response.body.getReader !== 'function') {
                    const contentLength = Number(response.headers.get('content-length'));
                    if (Number.isFinite(contentLength) && contentLength > 4096) return null;
                    return new Uint8Array(await response.arrayBuffer()).slice(0, byteCount);
                }

                reader = response.body.getReader();
                const bytes = [];
                while (bytes.length < byteCount) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    for (const byte of value) {
                        bytes.push(byte);
                        if (bytes.length >= byteCount) break;
                    }
                }
                return Uint8Array.from(bytes);
            } finally {
                clearTimeout(timeout);
                if (reader) {
                    try {
                        await reader.cancel();
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'player-core:cancel-media-signature-read'); }
                }
            }
        }

        async function detectMediaPlaybackType(url) {
            const normalizedUrl = String(url || '').trim();
            if (!normalizedUrl) return '';
            if (/\.flv(?:$|[?#])/i.test(normalizedUrl)) return 'flv';
            if (/\.m3u8(?:$|[?#])/i.test(normalizedUrl)) return 'm3u8';
            if (!/^https?:\/\//i.test(normalizedUrl)) return '';

            if (detectedMediaTypeCache.has(normalizedUrl)) {
                return detectedMediaTypeCache.get(normalizedUrl);
            }

            try {
                const signature = await readRemoteMediaSignature(normalizedUrl);
                const detectedType = signature
                    && signature.length >= 3
                    && signature[0] === 0x46
                    && signature[1] === 0x4c
                    && signature[2] === 0x56
                    ? 'flv'
                    : '';

                if (detectedType) {
                    detectedMediaTypeCache.set(normalizedUrl, detectedType);
                    console.info('[播放器] 检测到扩展名与内容不一致，按 FLV 点播加载');
                }
                return detectedType;
            } catch (error) {
                if (error?.name !== 'AbortError') {
                    window.YayaRendererUtils.reportIgnoredError(error, 'player-core:detect-media-type');
                }
                return '';
            }
        }

        async function switchToCompatVodPlayback(video, videoUrl, player, reason = '', playbackState = {}) {
            if (!video || video.yayaCompatFallbackStarted) return;
            if (window.desktop?.platform === 'web') return;

            const currentArt = getArt();
            if (!currentArt || currentArt.video !== video) return;
            const savedResumeAt = Number(playbackState.resumeAt);
            const resumeAt = Math.max(0, Number.isFinite(savedResumeAt) ? savedResumeAt : (Number(video.currentTime) || 0));
            const shouldResumePlayback = typeof playbackState.shouldResumePlayback === 'boolean'
                ? playbackState.shouldResumePlayback
                : !video.paused && !video.ended;
            video.yayaCompatFallbackStarted = true;

            if (video.yayaCompatFallbackTimer) {
                clearTimeout(video.yayaCompatFallbackTimer);
                video.yayaCompatFallbackTimer = null;
            }

            try {
                if (currentArt.notice) {
                    currentArt.notice.show = '旧版视频加载较慢，正在切换兼容模式...';
                }
                if (player) {
                    try { player.unload(); } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'player-core:compat-unload'); }
                    try { player.detachMediaElement(); } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'player-core:compat-detach'); }
                    try { player.destroy(); } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'player-core:compat-destroy'); }
                }
                video.mpegts = null;

                const result = await ipcRenderer.invoke('prepare-compat-vod', videoUrl);
                const latestArt = getArt();
                if (!latestArt || latestArt.video !== video || !result?.url) return;

                video.src = result.url;
                video.load();
                if (resumeAt > 0) {
                    await restoreCompatVodPosition(video, resumeAt);
                }
                if (getArt() !== latestArt || latestArt.video !== video) return;
                if (shouldResumePlayback) {
                    await video.play().catch((error) => {
                        window.YayaRendererUtils.reportIgnoredError(error, 'player-core:compat-autoplay');
                    });
                }
                if (latestArt.notice) latestArt.notice.show = '已切换兼容播放';
            } catch (error) {
                console.error('[播放器] 兼容播放失败:', reason, error);
                if (typeof showToast === 'function') {
                    showToast(error?.message || '旧版直播兼容播放失败');
                }
            }
        }

        function restoreCompatVodPosition(video, resumeAt) {
            const requestedTime = Math.max(0, Number(resumeAt) || 0);
            if (!video || requestedTime <= 0) return Promise.resolve();

            return new Promise((resolve) => {
                const metadataReady = video.readyState >= HTMLMediaElement.HAVE_METADATA;
                let seekStarted = false;
                let settled = false;
                let timeout = null;

                const cleanup = () => {
                    video.removeEventListener('loadedmetadata', handleMetadata);
                    video.removeEventListener('seeked', finish);
                    video.removeEventListener('error', finish);
                    if (timeout) clearTimeout(timeout);
                    timeout = null;
                };
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    resolve();
                };
                const handleMetadata = () => {
                    if (seekStarted) return;
                    seekStarted = true;
                    const duration = Number(video.duration);
                    const targetTime = Number.isFinite(duration) && duration > 0
                        ? Math.min(requestedTime, Math.max(0, duration - 0.25))
                        : requestedTime;

                    try {
                        if (Math.abs((Number(video.currentTime) || 0) - targetTime) < 0.1) {
                            finish();
                            return;
                        }
                        video.addEventListener('seeked', finish, { once: true });
                        video.currentTime = targetTime;
                    } catch (error) {
                        window.YayaRendererUtils.reportIgnoredError(error, 'player-core:compat-restore-position');
                        finish();
                    }
                };

                video.addEventListener('loadedmetadata', handleMetadata, { once: true });
                video.addEventListener('error', finish, { once: true });
                timeout = setTimeout(finish, 10000);
                if (metadataReady) handleMetadata();
            });
        }

        function canUseNativeHls(video) {
            if (!video || typeof video.canPlayType !== 'function') return false;
            return Boolean(
                video.canPlayType('application/vnd.apple.mpegurl') ||
                video.canPlayType('application/x-mpegURL')
            );
        }

        function cleanupAttachedHls(video) {
            if (!video) return;

            if (typeof video.yayaHlsCleanup === 'function') {
                video.yayaHlsCleanup();
                return;
            }

            if (video.hls && typeof video.hls.destroy === 'function') {
                try {
                    video.hls.destroy();
                } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'player-core:hls-destroy'); }
            }
            video.hls = null;
        }

        function attachStableHls(video, videoUrl, isLiveContent) {
            const isVodPlayback = !isLiveContent;
            const resumeAt = isLiveContent
                ? 0
                : Math.max(0, Number(video.yayaHlsResumeAt) || Number(video.currentTime) || 0);
            const shouldResumePlayback = Boolean(video.yayaHlsShouldResume)
                || (!video.paused && !video.ended);
            cleanupAttachedHls(video);

            let stallRecoverCount = 0;
            let stallRecoverTimer = null;
            let initialLoadTimer = null;
            let reloadTimer = null;
            let lastRecoverAt = 0;
            let sourceLoaded = false;
            let hasPlayableMedia = false;
            let disposed = false;
            let lastPlaybackPosition = resumeAt;

            const clearReloadTimers = () => {
                clearTimeout(initialLoadTimer);
                clearTimeout(reloadTimer);
                initialLoadTimer = null;
                reloadTimer = null;
            };

            const rememberPlaybackState = () => {
                if (!isLiveContent) {
                    if (isVodPlayback) {
                        const currentTime = Number(video.currentTime);
                        if (Number.isFinite(currentTime) && currentTime >= 0) {
                            lastPlaybackPosition = currentTime;
                        }
                        video.yayaHlsResumeAt = Math.max(0, lastPlaybackPosition || 0);
                    } else {
                        video.yayaHlsResumeAt = Math.max(
                            0,
                            Number(video.yayaHlsResumeAt) || 0,
                            Number(video.currentTime) || 0,
                            resumeAt || 0
                        );
                    }
                }
                video.yayaHlsShouldResume = Boolean(video.yayaHlsShouldResume)
                    || shouldResumePlayback
                    || (!video.paused && !video.ended);
            };

            const scheduleFullReload = (reason = 'fatal error', delay = 800) => {
                if (disposed || reloadTimer) return;

                const attempts = Math.max(0, Number(video.yayaHlsRecoveryAttempts) || 0);
                if (attempts >= HLS_RELOAD_MAX_ATTEMPTS) {
                    console.error(`[播放器] HLS ${reason}，已达到自动重载上限`);
                    return;
                }

                rememberPlaybackState();
                video.yayaHlsRecoveryAttempts = attempts + 1;
                reloadTimer = setTimeout(() => {
                    reloadTimer = null;
                    if (disposed || video.hls !== hls) return;

                    const currentArt = getArt();
                    if (!currentArt || currentArt.video !== video) return;

                    console.warn(`[播放器] HLS ${reason}，重建播放器 #${attempts + 1}`);
                    cleanupAttachedHls(video);
                    currentArt.url = videoUrl;
                }, Math.max(0, Number(delay) || 0));
            };

            const recoverFromStall = (reason = 'stalled') => {
                if (disposed || !video || video.paused || video.ended) return;
                const now = Date.now();
                if (now - lastRecoverAt < 1200) return;
                lastRecoverAt = now;
                stallRecoverCount += 1;

                const resumeAt = Math.max(0, Number(video.currentTime) || 0);

                try {
                    hls.stopLoad();
                    hls.startLoad(Math.max(0, resumeAt - 1));
                } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/player-core-feature.js'); }

                if (stallRecoverCount % 2 === 0) {
                    try {
                        hls.recoverMediaError();
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/player-core-feature.js'); }
                }

                if (stallRecoverCount === 3) {
                    try {
                        hls.detachMedia();
                        hls.attachMedia(video);
                        hls.startLoad(Math.max(0, resumeAt - 1));
                        if (Number.isFinite(resumeAt)) video.currentTime = resumeAt;
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'player-core:hls-reattach'); }
                }

                console.warn(`[播放器] HLS ${reason}，尝试自动恢复 #${stallRecoverCount}`);
                if (stallRecoverCount < 5) {
                    clearTimeout(stallRecoverTimer);
                    stallRecoverTimer = setTimeout(() => {
                        if (video && !video.paused && !video.ended && video.readyState < 3) {
                            recoverFromStall('persistent stall');
                        }
                    }, 2500);
                }
            };

            const scheduleStallRecovery = (reason) => {
                if (!hasPlayableMedia || !isLiveContent) return;
                clearTimeout(stallRecoverTimer);
                stallRecoverTimer = setTimeout(() => {
                    if (video && !video.paused && !video.ended && video.readyState < 3) {
                        recoverFromStall(reason);
                    }
                }, 1800);
            };

            const clearStallRecovery = () => {
                clearTimeout(stallRecoverTimer);
                stallRecoverTimer = null;
                stallRecoverCount = 0;
            };

            const hls = new window.Hls({
                enableWorker: true,
                progressive: isVodPlayback ? false : true,
                lowLatencyMode: false,
                startFragPrefetch: !isLiveContent,
                backBufferLength: isLiveContent ? 15 : 90,
                maxBufferLength: isLiveContent ? 30 : 90,
                maxMaxBufferLength: isLiveContent ? 60 : 180,
                maxBufferSize: 128 * 1000 * 1000,
                maxBufferHole: isVodPlayback ? 0.5 : 0.1,
                highBufferWatchdogPeriod: isVodPlayback ? 1 : 2,
                nudgeMaxRetry: isVodPlayback ? 5 : 3,
                manifestLoadPolicy: {
                    default: {
                        maxTimeToFirstByteMs: 4000,
                        maxLoadTimeMs: 10000,
                        timeoutRetry: {
                            maxNumRetry: 3,
                            retryDelayMs: 300,
                            maxRetryDelayMs: 2000,
                            backoff: 'linear'
                        },
                        errorRetry: {
                            maxNumRetry: 3,
                            retryDelayMs: 500,
                            maxRetryDelayMs: 4000,
                            backoff: 'linear'
                        }
                    }
                },
                playlistLoadPolicy: {
                    default: {
                        maxTimeToFirstByteMs: 4000,
                        maxLoadTimeMs: 10000,
                        timeoutRetry: {
                            maxNumRetry: 3,
                            retryDelayMs: 300,
                            maxRetryDelayMs: 2000,
                            backoff: 'linear'
                        },
                        errorRetry: {
                            maxNumRetry: 3,
                            retryDelayMs: 500,
                            maxRetryDelayMs: 4000,
                            backoff: 'linear'
                        }
                    }
                },
                fragLoadPolicy: {
                    default: {
                        maxTimeToFirstByteMs: isVodPlayback ? 60000 : 4000,
                        maxLoadTimeMs: isVodPlayback ? 60000 : 15000,
                        timeoutRetry: {
                            maxNumRetry: isVodPlayback ? 6 : 4,
                            retryDelayMs: isVodPlayback ? 1000 : 300,
                            maxRetryDelayMs: isVodPlayback ? 64000 : 2500,
                            backoff: 'linear'
                        },
                        errorRetry: {
                            maxNumRetry: isVodPlayback ? 6 : 5,
                            retryDelayMs: isVodPlayback ? 1000 : 500,
                            maxRetryDelayMs: isVodPlayback ? 64000 : 5000,
                            backoff: 'linear'
                        }
                    }
                }
            });

            if (window.Hls.Events && window.Hls.ErrorTypes) {
                hls.on(window.Hls.Events.ERROR, (_event, data) => {
                    if (!data) return;

                    if (!data.fatal) {
                        if (data.details === 'bufferStalledError' || data.details === 'bufferNudgeOnStall') {
                            scheduleStallRecovery(data.details);
                        }
                        return;
                    }

                    if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                        try {
                            hls.startLoad();
                        } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'player-core:hls-network-recover'); }
                        scheduleFullReload(data.details || 'network error', hasPlayableMedia ? 2500 : 1200);
                    } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                        try {
                            hls.recoverMediaError();
                        } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'player-core:hls-media-recover'); }
                        scheduleFullReload(data.details || 'media error', 1800);
                    } else {
                        scheduleFullReload(data.details || data.type || 'fatal error', 300);
                    }
                });
            }

            video.preservesPitch = true;
            video.mozPreservesPitch = true;
            video.webkitPreservesPitch = true;
            const handleWaiting = () => scheduleStallRecovery('waiting');
            const handleStalled = () => scheduleStallRecovery('stalled');
            const rememberCurrentPosition = () => {
                if (!isVodPlayback) return;
                const currentTime = Number(video.currentTime);
                if (Number.isFinite(currentTime) && currentTime >= 0) {
                    lastPlaybackPosition = currentTime;
                }
            };
            const handleSeeking = () => {
                if (!isVodPlayback) return;
                rememberCurrentPosition();
                const seekTarget = Math.max(0, lastPlaybackPosition || 0);
                video.yayaHlsResumeAt = seekTarget;
                clearStallRecovery();
            };
            const handleSeeked = () => {
                if (!isVodPlayback) return;
                rememberCurrentPosition();
                const seekTarget = Math.max(0, lastPlaybackPosition || 0);
                video.yayaHlsResumeAt = seekTarget;
            };
            const restorePlaybackPosition = () => {
                if (isLiveContent || resumeAt <= 0) return;
                const duration = Number(video.duration);
                const targetTime = Number.isFinite(duration) && duration > 0
                    ? Math.min(resumeAt, Math.max(0, duration - 0.25))
                    : resumeAt;
                try {
                    video.currentTime = targetTime;
                } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'player-core:hls-restore-position'); }
            };
            const markPlayable = () => {
                if (disposed) return;
                hasPlayableMedia = true;
                clearStallRecovery();
                clearReloadTimers();
                video.yayaHlsRecoveryAttempts = 0;
                video.yayaHlsResumeAt = 0;
                video.yayaHlsShouldResume = false;
                if (shouldResumePlayback && video.paused) {
                    video.play().catch((error) => {
                        window.YayaRendererUtils.reportIgnoredError(error, 'player-core:hls-resume');
                    });
                }
            };
            if (isVodPlayback) {
                video.addEventListener('timeupdate', rememberCurrentPosition);
                video.addEventListener('seeking', handleSeeking);
                video.addEventListener('seeked', handleSeeked);
            }
            video.addEventListener('waiting', handleWaiting);
            video.addEventListener('stalled', handleStalled);
            video.addEventListener('loadedmetadata', restorePlaybackPosition);
            video.addEventListener('loadeddata', markPlayable);
            video.addEventListener('playing', markPlayable);
            video.addEventListener('canplay', markPlayable);

            const loadSourceAfterAttach = () => {
                if (sourceLoaded) return;
                sourceLoaded = true;
                hls.loadSource(videoUrl);
            };
            if (window.Hls.Events?.MEDIA_ATTACHED) {
                hls.once(window.Hls.Events.MEDIA_ATTACHED, loadSourceAfterAttach);
            }
            hls.attachMedia(video);
            if (!window.Hls.Events?.MEDIA_ATTACHED) loadSourceAfterAttach();
            video.hls = hls;
            const cleanup = () => {
                if (disposed) return;
                disposed = true;
                clearStallRecovery();
                clearReloadTimers();
                if (isVodPlayback) {
                    video.removeEventListener('timeupdate', rememberCurrentPosition);
                    video.removeEventListener('seeking', handleSeeking);
                    video.removeEventListener('seeked', handleSeeked);
                }
                video.removeEventListener('waiting', handleWaiting);
                video.removeEventListener('stalled', handleStalled);
                video.removeEventListener('loadedmetadata', restorePlaybackPosition);
                video.removeEventListener('loadeddata', markPlayable);
                video.removeEventListener('playing', markPlayable);
                video.removeEventListener('canplay', markPlayable);
                try {
                    hls.destroy();
                } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'player-core:hls-cleanup'); }
                if (video.hls === hls) video.hls = null;
                if (video.yayaHlsCleanup === cleanup) video.yayaHlsCleanup = null;
            };
            video.yayaHlsCleanup = cleanup;
            initialLoadTimer = setTimeout(() => {
                if (!disposed && !hasPlayableMedia && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                    scheduleFullReload('首次加载超时', 0);
                }
            }, HLS_INITIAL_LOAD_TIMEOUT_MS);
            return hls;
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

            const usesFullWidthLayout = mode === 'live'
                || mode === 'meet-live'
                || mode === 'open-live'
                || mode === 'open-live-record'
                || mode === 'performance-record';

            if (usesFullWidthLayout) {
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
            if (mode === 'live' && typeof window.updateLiveBalance === 'function') {
                void window.updateLiveBalance();
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

            const participantsButton = document.getElementById('btn-player-participants');
            const participantsModal = document.getElementById('openLiveParticipantsModal');
            if (participantsButton) {
                participantsButton.style.display = 'none';
                participantsButton.textContent = '参与成员';
            }
            if (participantsModal) participantsModal.style.display = 'none';

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

        function showSeparatedMediaPlayerPage(mode, item, playerView) {
            const mediaView = document.getElementById('view-media');
            const pageIdByMode = {
                live: 'view-live-player',
                vod: 'view-vod-player',
                'meet-live': 'view-meet-live-player',
                'meet-vod': 'view-meet-vod-player'
            };
            const fallbackPageId = isLivePlaybackMode(mode, item)
                ? 'view-live-player'
                : 'view-vod-player';
            const targetPage = document.getElementById(pageIdByMode[mode] || fallbackPageId);

            if (!targetPage || !playerView) return;
            if (typeof activateMediaPlaybackPage === 'function'
                && activateMediaPlaybackPage(targetPage.id, playerView)) {
                return;
            }
            if (playerView.parentElement !== targetPage) targetPage.appendChild(playerView);
            if (mediaView) mediaView.style.display = 'none';
            document.querySelectorAll('.media-playback-page').forEach(page => {
                page.style.display = 'none';
            });
            targetPage.style.display = 'flex';
            targetPage.style.flexDirection = 'column';
            targetPage.scrollTop = 0;
            playerView.style.display = 'flex';
        }

        async function playLiveStream(item, mode) {
            if (typeof setCurrentPlayingItem === 'function') {
                setCurrentPlayingItem(item);
            }

            const mediaListArea = document.getElementById('media-list-area');
            const vodPaginationControls = document.getElementById('vod-pagination-controls');
            const mediaListControls = document.getElementById('media-list-controls');
            const playerView = document.getElementById('live-player-view');
            const comboWrapper = document.getElementById('player-combo-wrapper');
            const playerArea = document.getElementById('live-player-area');
            const playerRankButton = document.getElementById('btn-player-rank');

            if (mediaListArea) mediaListArea.style.display = 'none';
            if (vodPaginationControls) vodPaginationControls.style.display = 'none';
            if (mediaListControls) mediaListControls.style.display = 'none';
            showSeparatedMediaPlayerPage(mode, item, playerView);
            if (typeof resetClipTool === 'function') {
                resetClipTool();
            }
            if (playerRankButton) {
                playerRankButton.style.display = mode === 'vod' ? 'inline-flex' : 'none';
            }

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
                        } catch (e) { window.YayaRendererUtils.reportIgnoredError(e, 'src/renderer/player-core-feature.js'); }
                    }

                    if (typeof renderDanmuListUI === 'function') {
                        renderDanmuListUI(danmuData);
                    }
                    const chatroomId = res.content.chatroomId
                        || res.content.roomId
                        || hydratedItem.chatroomId
                        || hydratedItem.roomId;
                    await startPlayer(streamUrl, title, isLive, chatroomId, danmuData, {
                        liveId: res.content.liveId || hydratedItem.liveId || item.liveId
                    });
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
            const {
                clearAuxPanels = false,
                autoRecoveryAttempt = 0,
                liveId = ''
            } = options || {};
            url = normalizePlaybackUrl(url);
            destroyPlayers({ clearTimeline: isLiveContent, clearAuxPanels });
            const container = document.getElementById('live-player-container');
            if (!container) return;

            if (isLiveContent) {
                try {
                    container.innerHTML = '<div style="color:white;display:flex;height:100%;align-items:center;justify-content:center;">来自yk1z的提示：正在连接中...</div>';
                    if (typeof window.ensureYayaWebPlayerLibs === 'function') {
                        await window.ensureYayaWebPlayerLibs('dplayer');
                    }
                    const liveProxyPayload = window.desktop?.platform === 'web'
                        ? { url, liveId }
                        : url;
                    const localUrl = await ipcRenderer.invoke('start-live-proxy', liveProxyPayload);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    container.innerHTML = '<div id="dplayer-container" style="width:100%; height:100%"></div>';

                    let flvPlayer = null;
                    let hlsPlayer = null;
                    const useHlsLive = /\.m3u8(?:$|[?#])/i.test(String(localUrl || ''));
                    const liveCustomType = useHlsLive
                        ? {
                            customHls: function (video) {
                                video.setAttribute('playsinline', '');
                                video.setAttribute('webkit-playsinline', '');
                                video.disableRemotePlayback = true;
                                if (window.Hls?.isSupported?.()) {
                                    hlsPlayer = new window.Hls({
                                        lowLatencyMode: true,
                                        liveSyncDurationCount: 3,
                                        liveMaxLatencyDurationCount: 6,
                                        backBufferLength: 30,
                                        enableWorker: true
                                    });
                                    hlsPlayer.loadSource(localUrl);
                                    hlsPlayer.attachMedia(video);
                                    video.hls = hlsPlayer;
                                    return;
                                }
                                if (canUseNativeHls(video)) {
                                    video.src = localUrl;
                                    return;
                                }
                                throw new Error('当前浏览器不支持 HLS 直播');
                            }
                        }
                        : {
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
                        };
                    const nextDp = new DPlayer({
                        container: document.getElementById('dplayer-container'),
                        live: isLiveContent,
                        autoplay: !useHlsLive,
                        screenshot: true,
                        hotkey: false,
                        playbackSpeed: [1],
                        theme: '#FF8EBF',
                        video: {
                            url: localUrl,
                            type: useHlsLive ? 'customHls' : 'customFlv',
                            customType: liveCustomType
                        }
                    });

                    setDp(nextDp);
                    enhanceDPlayerControls(nextDp);
                    nextDp.yayaFlvPlayer = flvPlayer;
                    nextDp.yayaHlsPlayer = hlsPlayer;
                    if (useHlsLive && typeof nextDp.notice === 'function') {
                        nextDp.notice('手机端请点击画面开始播放');
                    }
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

                    let disposed = false;
                    let recovering = false;
                    let stallRecoveryTimer = null;
                    let lastVideoTime = Number(nextDp.video.currentTime) || 0;
                    let lastProgressAt = Date.now();
                    let stableProgressStartedAt = 0;
                    let recoveryAttempt = Math.max(0, Number(autoRecoveryAttempt) || 0);

                    const clearStallTimer = () => {
                        if (stallRecoveryTimer) {
                            clearTimeout(stallRecoveryTimer);
                            stallRecoveryTimer = null;
                        }
                    };

                    const markPlaybackProgress = () => {
                        if (disposed) return;
                        const currentTime = Number(nextDp.video.currentTime) || 0;
                        const now = Date.now();
                        if (currentTime > lastVideoTime + 0.03) {
                            if (!stableProgressStartedAt) stableProgressStartedAt = now;
                            if (now - stableProgressStartedAt >= 10000) recoveryAttempt = 0;
                            lastVideoTime = currentTime;
                            lastProgressAt = now;
                            clearStallTimer();
                        }
                    };

                    const reloadStalledLive = async (reason = '播放停滞') => {
                        if (disposed || recovering || getDp() !== nextDp || !isLivePlayerViewOpen()) return;
                        const video = nextDp.video;
                        if (!video || video.paused || video.ended) return;

                        const stalledFor = Date.now() - lastProgressAt;
                        if (video.readyState >= 3 && stalledFor < LIVE_STALL_RECOVERY_DELAY) return;

                        recovering = true;
                        clearStallTimer();
                        const nextAttempt = recoveryAttempt + 1;
                        console.warn(`[直播播放器] ${reason}，自动重新加载 #${nextAttempt}`);
                        if (typeof nextDp.notice === 'function') {
                            nextDp.notice('直播卡顿，正在自动重新加载…');
                        }
                        await startPlayer(url, title, true, chatroomId, vodDanmuData, {
                            clearAuxPanels: false,
                            autoRecoveryAttempt: nextAttempt,
                            liveId
                        });
                    };

                    const scheduleStallRecovery = (reason = '缓冲超时') => {
                        if (disposed || recovering || stallRecoveryTimer) return;
                        const video = nextDp.video;
                        if (!video || video.paused || video.ended) return;
                        stallRecoveryTimer = setTimeout(() => {
                            stallRecoveryTimer = null;
                            reloadStalledLive(reason);
                        }, LIVE_STALL_RECOVERY_DELAY);
                    };

                    const handlePlaying = () => {
                        lastProgressAt = Date.now();
                        stableProgressStartedAt = lastProgressAt;
                        clearStallTimer();
                    };
                    const handleWaiting = () => scheduleStallRecovery('持续缓冲');
                    const handleStalled = () => scheduleStallRecovery('视频流停滞');
                    const handleError = () => scheduleStallRecovery('播放错误');

                    nextDp.video.addEventListener('timeupdate', markPlaybackProgress);
                    nextDp.video.addEventListener('playing', handlePlaying);
                    nextDp.video.addEventListener('waiting', handleWaiting);
                    nextDp.video.addEventListener('stalled', handleStalled);
                    nextDp.video.addEventListener('error', handleError);

                    const bufferSyncTimer = setInterval(() => {
                        if (flvPlayer && flvPlayer.buffered.length) {
                            const diff = flvPlayer.buffered.end(0) - flvPlayer.currentTime;
                            if (diff > 2) flvPlayer.currentTime = flvPlayer.buffered.end(0) - 0.1;
                        }
                    }, 3000);

                    const liveHealthTimer = setInterval(() => {
                        if (disposed || recovering || getDp() !== nextDp || !isLivePlayerViewOpen()) return;
                        const video = nextDp.video;
                        if (!video || video.paused || video.ended) {
                            lastProgressAt = Date.now();
                            lastVideoTime = Number(video?.currentTime) || 0;
                            stableProgressStartedAt = 0;
                            clearStallTimer();
                            return;
                        }

                        markPlaybackProgress();
                        if (Date.now() - lastProgressAt >= LIVE_STALL_RECOVERY_DELAY) {
                            reloadStalledLive('播放时间停止推进');
                        }
                    }, 2000);

                    nextDp.yayaLiveCleanup = () => {
                        if (disposed) return;
                        disposed = true;
                        clearStallTimer();
                        clearInterval(bufferSyncTimer);
                        clearInterval(liveHealthTimer);
                        nextDp.video.removeEventListener('timeupdate', markPlaybackProgress);
                        nextDp.video.removeEventListener('playing', handlePlaying);
                        nextDp.video.removeEventListener('waiting', handleWaiting);
                        nextDp.video.removeEventListener('stalled', handleStalled);
                        nextDp.video.removeEventListener('error', handleError);
                    };

                    if (chatroomId) {
                        initLiveDanmu(chatroomId, { liveId });
                    }
                } catch (err) {
                    const nextAttempt = Math.max(0, Number(autoRecoveryAttempt) || 0) + 1;
                    const retryDelay = getLiveReconnectDelay(nextAttempt);
                    container.innerHTML = `<div style="color:white;display:flex;height:100%;align-items:center;justify-content:center;">直播连接失败，${Math.ceil(retryDelay / 1000)} 秒后自动重试…</div>`;
                    console.warn(`[直播播放器] 连接失败，准备自动重试 #${nextAttempt}:`, err);
                    pendingLiveReconnectTimer = setTimeout(() => {
                        pendingLiveReconnectTimer = null;
                        if (!isLivePlayerViewOpen()) return;
                        startPlayer(url, title, true, chatroomId, vodDanmuData, {
                            clearAuxPanels: false,
                            autoRecoveryAttempt: nextAttempt,
                            liveId
                        });
                    }, retryDelay);
                }
                return;
            }

            container.innerHTML = '<div class="artplayer-app"></div>';
            if (typeof window.ensureYayaWebPlayerLibs === 'function') {
                await window.ensureYayaWebPlayerLibs('player');
            }
            if (window.Artplayer) Artplayer.CONTEXTMENU = false;
            const playbackType = await detectMediaPlaybackType(url);

            const applyVideoTransform = (art) => {
                if (!art || !art.video) return;
                const degree = Number(art.currentRotate) || 0;
                const mirror = art.currentMirror || 'none';
                const isPerpendicular = degree % 180 !== 0;
                const bounds = (art.container || art.video.parentElement || art.video).getBoundingClientRect();
                const rotateScale = isPerpendicular && bounds.width > 0 && bounds.height > 0
                    ? getPerpendicularVideoScale(art.video, bounds)
                    : 1;
                const rotateTransform = degree ? `rotate(${degree}deg)` : '';
                const scaleTransform = Math.abs(rotateScale - 1) > 0.001 ? `scale(${rotateScale})` : '';
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
                type: playbackType,
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
                            }, {
                                enableWorker: false,
                                enableStashBuffer: isLiveContent,
                                stashInitialSize: 32 * 1024,
                                deferLoadAfterSourceOpen: false,
                                lazyLoad: !isLiveContent,
                                accurateSeek: !isLiveContent,
                                rangeLoadZeroStart: !isLiveContent,
                                reuseRedirectedURL: true,
                                autoCleanupSourceBuffer: true,
                                autoCleanupMaxBackwardDuration: 120,
                                autoCleanupMinBackwardDuration: 60
                            });

                            if (window.mpegts.Events?.ERROR) {
                                player.on(window.mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
                                    const detail = String(errorInfo?.msg || errorDetail || errorType || '未知错误');
                                    const playbackState = {
                                        resumeAt: Math.max(0, Number(video.currentTime) || 0),
                                        shouldResumePlayback: !video.paused && !video.ended
                                    };
                                    console.error('[播放器] FLV 加载失败:', errorType, errorDetail, errorInfo);
                                    setTimeout(() => switchToCompatVodPlayback(video, videoUrl, player, detail, playbackState), 0);
                                });
                            }
                            player.attachMediaElement(video);
                            player.load();
                            video.mpegts = player;
                            const clearFallbackTimer = () => {
                                if (!video.yayaCompatFallbackTimer) return;
                                clearTimeout(video.yayaCompatFallbackTimer);
                                video.yayaCompatFallbackTimer = null;
                            };
                            video.addEventListener('canplay', clearFallbackTimer, { once: true });
                            video.addEventListener('playing', clearFallbackTimer, { once: true });
                            video.yayaCompatFallbackTimer = setTimeout(() => {
                                if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
                                switchToCompatVodPlayback(video, videoUrl, player, 'playback timeout');
                            }, LEGACY_FLV_FALLBACK_TIMEOUT_MS);
                        } else {
                            video.src = videoUrl;
                        }
                    },
                    m3u8: function (video, videoUrl) {
                        if (window.Hls?.isSupported?.()) {
                            attachStableHls(video, videoUrl, isLiveContent);
                        } else {
                            cleanupAttachedHls(video);
                            video.src = videoUrl;
                        }
                    }
                }
            });

            setArt(nextArt);

            if (chatroomId && isLiveContent) {
                initArtLiveDanmu(chatroomId, nextArt, { liveId });
            }

            nextArt.on('ready', () => {
                const removeInput = () => {
                    document.querySelectorAll('.art-control-danmuku-input, .art-danmuku-input, .art-control-danmuku-send').forEach(el => el.remove());
                };

                removeInput();
                setTimeout(removeInput, 500);
                const syncTimelinePosition = () => {
                    if (typeof syncDanmuHighlight === 'function') {
                        syncDanmuHighlight(Number(nextArt.currentTime) || 0);
                    }
                };
                nextArt.on('video:timeupdate', syncTimelinePosition);
                nextArt.on('video:seeked', syncTimelinePosition);
                syncTimelinePosition();
                const playPromise = nextArt.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch((error) => {
                        if (String(error?.name || '') === 'NotAllowedError') {
                            return;
                        }
                        window.YayaRendererUtils.reportIgnoredError(error, 'player-core:vod-autoplay');
                    });
                }
            });
        }

        function destroyPlayers(options = {}) {
            const { clearTimeline = true, clearAuxPanels = true } = options;
            const currentArt = getArt();
            const currentDp = getDp();
            const nimInstance = getNimInstance();

            if (pendingLiveReconnectTimer) {
                clearTimeout(pendingLiveReconnectTimer);
                pendingLiveReconnectTimer = null;
            }

            if (typeof stopRoomRadio === 'function') {
                stopRoomRadio(false);
            }

            if (currentArt && currentArt.destroy) {
                if (currentArt.video.yayaCompatFallbackTimer) {
                    clearTimeout(currentArt.video.yayaCompatFallbackTimer);
                    currentArt.video.yayaCompatFallbackTimer = null;
                }
                if (currentArt.video.mpegts) {
                    currentArt.video.mpegts.destroy();
                    currentArt.video.mpegts = null;
                }
                cleanupAttachedHls(currentArt.video);
                currentArt.destroy(true);
                setArt(null);
            }

            if (currentDp) {
                if (typeof currentDp.yayaTransformResizeCleanup === 'function') {
                    currentDp.yayaTransformResizeCleanup();
                    currentDp.yayaTransformResizeCleanup = null;
                }
                if (typeof currentDp.yayaLiveCleanup === 'function') {
                    currentDp.yayaLiveCleanup();
                    currentDp.yayaLiveCleanup = null;
                }
                if (currentDp.yayaFlvPlayer && typeof currentDp.yayaFlvPlayer.destroy === 'function') {
                    try {
                        currentDp.yayaFlvPlayer.destroy();
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/player-core-feature.js'); }
                    currentDp.yayaFlvPlayer = null;
                }
                if (currentDp.yayaHlsPlayer && typeof currentDp.yayaHlsPlayer.destroy === 'function') {
                    try {
                        currentDp.yayaHlsPlayer.destroy();
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/player-core-feature.js'); }
                    currentDp.yayaHlsPlayer = null;
                }
                currentDp.destroy();
                setDp(null);
            }

            if (typeof disconnectLiveDanmu === 'function') {
                disconnectLiveDanmu();
            } else if (nimInstance) {
                if (typeof nimInstance.destroy === 'function') nimInstance.destroy();
                else nimInstance.disconnect();
                setNimInstance(null);
            }

            const container = document.getElementById('live-player-container');
            if (container) {
                container.replaceChildren();
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
            configurePlayerLayout,
            destroyPlayers,
            playLiveStream,
            startPlayer
        };
    };
}());
