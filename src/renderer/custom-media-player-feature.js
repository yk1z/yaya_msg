(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createCustomMediaPlayerFeature = function createCustomMediaPlayerFeature(deps) {
        const {
            getCurrentViewMode,
            getCurrentViewName,
            getCurrentPlayingAudio,
            getCurrentPlayingVideo,
            getPlaybackViewToken,
            getPreferredExternalPlayerName,
            openMediaInExternalPlayer,
            setCurrentPlayingAudio,
            setCurrentPlayingVideo,
            showToast
        } = deps;

        const pendingVideoCoverLoads = [];
        const activeVideoCoverLoads = new Set();
        const videoCoverReleaseTimers = new WeakMap();
        const MAX_ACTIVE_VIDEO_COVER_LOADS = 2;
        const VIDEO_COVER_RELEASE_DELAY = 8000;

        function capturePlaybackViewContext() {
            return {
                token: typeof getPlaybackViewToken === 'function' ? getPlaybackViewToken() : 0,
                viewName: typeof getCurrentViewName === 'function' ? getCurrentViewName() : '',
                viewMode: typeof getCurrentViewMode === 'function' ? getCurrentViewMode() : null
            };
        }

        function isPlaybackViewContextActive(context) {
            if (!context) return false;
            if (typeof getPlaybackViewToken === 'function' && context.token !== getPlaybackViewToken()) return false;
            if (typeof getCurrentViewName === 'function' && context.viewName !== getCurrentViewName()) return false;
            if (typeof getCurrentViewMode === 'function' && context.viewMode !== getCurrentViewMode()) return false;
            return true;
        }

        function createCustomAudioPlayer(url, knownDuration = 0) {
            const wrapper = document.createElement('div');
            wrapper.className = 'audio-wrapper';
            wrapper.innerHTML = `<div class="audio-control-icon is-play"><span class="audio-icon-play"></span><span class="audio-icon-pause"><span></span><span></span></span></div><div class="audio-wave-box"><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div></div><span class="audio-duration">语音</span><audio style="display:none" preload="metadata" src="${url}"></audio>`;

            const audio = wrapper.querySelector('audio');
            const icon = wrapper.querySelector('.audio-control-icon');
            const timeDisplay = wrapper.querySelector('.audio-duration');

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
                if (getCurrentPlayingAudio() === audio) setCurrentPlayingAudio(null);
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
                const playContext = capturePlaybackViewContext();

                if (audio.paused) {
                    const currentPlayingAudio = getCurrentPlayingAudio();
                    if (currentPlayingAudio && currentPlayingAudio !== audio) {
                        currentPlayingAudio.pause();
                        currentPlayingAudio.currentTime = 0;
                    }

                    audio.currentTime = 0;
                    try {
                        if (audio.readyState === 0) audio.load();
                        await audio.play();
                        if (!isPlaybackViewContextActive(playContext)) {
                            audio.pause();
                            audio.currentTime = 0;
                            return;
                        }
                        setCurrentPlayingAudio(audio);
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
                if (getCurrentPlayingAudio() === audio) setCurrentPlayingAudio(null);
            };

            return wrapper;
        }

        function pumpVideoCoverLoads() {
            while (activeVideoCoverLoads.size < MAX_ACTIVE_VIDEO_COVER_LOADS && pendingVideoCoverLoads.length > 0) {
                const video = pendingVideoCoverLoads.shift();
                if (!video || !video.isConnected
                    || video.dataset.nearViewport === '0'
                    || (video.dataset.coverReady === '1' && video.dataset.resourceReleased !== '1')
                    || video.dataset.coverLoading === '1') {
                    continue;
                }

                const src = video.dataset.src;
                if (!src) {
                    continue;
                }

                video.dataset.coverLoading = '1';
                video.dataset.coverReady = '0';
                video.dataset.resourceReleased = '0';
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
            if (!video
                || (video.dataset.coverReady === '1' && video.dataset.resourceReleased !== '1')
                || video.dataset.coverLoading === '1') {
                return;
            }

            if (!pendingVideoCoverLoads.includes(video)) {
                pendingVideoCoverLoads.push(video);
            }

            pumpVideoCoverLoads();
        }

        function clearVideoCoverRelease(video) {
            const timer = videoCoverReleaseTimers.get(video);
            if (timer) clearTimeout(timer);
            videoCoverReleaseTimers.delete(video);
        }

        function captureVideoCoverPoster(video) {
            if (!video || video.dataset.posterReady === '1' || !video.videoWidth || !video.videoHeight) return false;
            const scale = Math.min(1, 320 / video.videoWidth, 480 / video.videoHeight);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
            const context = canvas.getContext('2d');
            if (!context) return false;
            try {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                video.poster = canvas.toDataURL('image/jpeg', 0.76);
                video.dataset.posterReady = '1';
                return true;
            } catch (error) {
                return false;
            }
        }

        function restoreVideoCoverPresentation(video) {
            const placeholder = video?.closest('.video-placeholder');
            if (!video || !placeholder || !video.dataset.previewStyle) return;
            video.controls = false;
            video.muted = true;
            video.defaultMuted = true;
            video.style.cssText = video.dataset.previewStyle;
            placeholder.style.width = video.dataset.previewWidth || placeholder.style.width;
            placeholder.style.height = video.dataset.previewHeight || placeholder.style.height;
            placeholder.style.background = 'transparent';
            placeholder.style.cursor = 'pointer';
            placeholder.dataset.inlinePlaying = '0';
            const overlay = placeholder.querySelector('.play-icon-overlay');
            if (overlay) {
                overlay.style.opacity = '0.9';
                overlay.style.pointerEvents = 'auto';
            }
        }

        function releaseVideoCoverResource(video) {
            clearVideoCoverRelease(video);
            if (!video || !video.isConnected || video.dataset.nearViewport !== '0') return;
            const placeholder = video.closest('.video-placeholder');
            if (getCurrentPlayingVideo() === video
                || !video.paused
                || video.dataset.posterReady !== '1') return;

            if (placeholder?.dataset.inlinePlaying === '1') {
                restoreVideoCoverPresentation(video);
            }

            const pendingIndex = pendingVideoCoverLoads.indexOf(video);
            if (pendingIndex >= 0) pendingVideoCoverLoads.splice(pendingIndex, 1);
            activeVideoCoverLoads.delete(video);
            delete video.dataset.coverLoading;
            video.dataset.coverReady = '0';
            video.dataset.resourceReleased = '1';
            video.removeAttribute('src');
            video.load();
            pumpVideoCoverLoads();
        }

        function scheduleVideoCoverRelease(video) {
            clearVideoCoverRelease(video);
            const timer = setTimeout(() => releaseVideoCoverResource(video), VIDEO_COVER_RELEASE_DELAY);
            videoCoverReleaseTimers.set(video, timer);
        }

        const videoCoverObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const video = entry.target;
                video.dataset.nearViewport = entry.isIntersecting ? '1' : '0';
                if (entry.isIntersecting) {
                    clearVideoCoverRelease(video);
                    queueVideoCoverLoad(video);
                    return;
                }
                scheduleVideoCoverRelease(video);
            });
        }, { rootMargin: '800px 0px' });

        function detectVideoBlackBars(video) {
            const sourceWidth = Number(video?.videoWidth) || 0;
            const sourceHeight = Number(video?.videoHeight) || 0;
            if (!sourceWidth || !sourceHeight) return null;

            const sampleWidth = 96;
            const sampleHeight = Math.max(48, Math.min(160, Math.round(sampleWidth * sourceHeight / sourceWidth)));
            const canvas = document.createElement('canvas');
            canvas.width = sampleWidth;
            canvas.height = sampleHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) return null;

            try {
                context.drawImage(video, 0, 0, sampleWidth, sampleHeight);
                const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
                const isDarkPixel = index => (
                    pixels[index] <= 28
                    && pixels[index + 1] <= 28
                    && pixels[index + 2] <= 28
                );
                const isDarkRow = y => {
                    let dark = 0;
                    for (let x = 0; x < sampleWidth; x += 1) {
                        if (isDarkPixel((y * sampleWidth + x) * 4)) dark += 1;
                    }
                    return dark / sampleWidth >= 0.94;
                };
                const isDarkColumn = x => {
                    let dark = 0;
                    for (let y = 0; y < sampleHeight; y += 1) {
                        if (isDarkPixel((y * sampleWidth + x) * 4)) dark += 1;
                    }
                    return dark / sampleHeight >= 0.94;
                };

                const maxRows = Math.floor(sampleHeight * 0.42);
                const maxColumns = Math.floor(sampleWidth * 0.42);
                let top = 0;
                let bottom = 0;
                let left = 0;
                let right = 0;
                while (top < maxRows && isDarkRow(top)) top += 1;
                while (bottom < maxRows && isDarkRow(sampleHeight - 1 - bottom)) bottom += 1;
                while (left < maxColumns && isDarkColumn(left)) left += 1;
                while (right < maxColumns && isDarkColumn(sampleWidth - 1 - right)) right += 1;

                const verticalBars = top + bottom >= Math.max(4, Math.round(sampleHeight * 0.04));
                const horizontalBars = left + right >= Math.max(4, Math.round(sampleWidth * 0.04));
                if (!verticalBars && !horizontalBars) return null;

                if (verticalBars) {
                    top = Math.min(maxRows, top + 1);
                    bottom = Math.min(maxRows, bottom + 1);
                } else {
                    top = 0;
                    bottom = 0;
                }
                if (horizontalBars) {
                    left = Math.min(maxColumns, left + 1);
                    right = Math.min(maxColumns, right + 1);
                } else {
                    left = 0;
                    right = 0;
                }

                if (sampleWidth - left - right < sampleWidth * 0.3
                    || sampleHeight - top - bottom < sampleHeight * 0.3) return null;
                return {
                    top: top / sampleHeight,
                    right: right / sampleWidth,
                    bottom: bottom / sampleHeight,
                    left: left / sampleWidth
                };
            } catch (error) {
                return null;
            }
        }

        function cropVideoCoverToContent(video, placeholder) {
            if (!video || !placeholder || video.dataset.blackBarsChecked === '1') return;
            video.dataset.blackBarsChecked = '1';
            const bars = detectVideoBlackBars(video);
            if (!bars) return;

            const sourceWidth = video.videoWidth;
            const sourceHeight = video.videoHeight;
            const cropLeft = sourceWidth * bars.left;
            const cropTop = sourceHeight * bars.top;
            const activeWidth = sourceWidth * (1 - bars.left - bars.right);
            const activeHeight = sourceHeight * (1 - bars.top - bars.bottom);
            if (activeWidth <= 0 || activeHeight <= 0) return;

            let finalWidth = 280;
            let finalHeight = activeHeight / activeWidth * finalWidth;
            if (finalHeight > 420) {
                finalHeight = 420;
                finalWidth = activeWidth / activeHeight * finalHeight;
            }

            const scale = finalWidth / activeWidth;
            placeholder.style.width = `${finalWidth}px`;
            placeholder.style.height = `${finalHeight}px`;
            video.style.inset = 'auto';
            video.style.left = `${-(cropLeft * scale)}px`;
            video.style.top = `${-(cropTop * scale)}px`;
            video.style.width = `${sourceWidth * scale}px`;
            video.style.height = `${sourceHeight * scale}px`;
            video.style.objectFit = 'fill';
            video.style.transform = 'none';
            video.dataset.contentCropApplied = '1';
        }

        function createCustomVideoPlayer(url, options = {}) {
            const wrapper = document.createElement('div');
            wrapper.className = 'video-wrapper';
            wrapper.style.display = 'inline-block';
            wrapper.style.verticalAlign = 'top';
            wrapper.style.margin = '8px 0';
            wrapper.style.maxWidth = '100%';
            wrapper.style.background = 'transparent';
            const preferExternalPlayer = options.preferExternalPlayer === true;

            const uniqueId = 'v-' + Math.random().toString(36).substr(2, 9);
            wrapper.innerHTML = `
                <div class="video-placeholder" id="${uniqueId}" style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 200px;
                    min-height: 120px;
                    background: transparent;
                    border-radius: 12px;
                    cursor: pointer;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                    border: 0;
                    transition: transform 0.2s;
                ">
                    <video class="lazy-cover" data-src="${url}#t=0.1" muted playsinline crossorigin="anonymous"
                        preload="none"
                        style="
                            position: absolute;
                            inset: 0;
                            width: 100%;
                            height: 100%;
                            max-width: none;
                            max-height: none;
                            object-fit: cover;
                            border-radius: 0 !important;
                            pointer-events: none;
                            z-index: 0;
                            background: transparent;
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
                        coverVideo.dataset.sourceWidth = String(w);
                        coverVideo.dataset.sourceHeight = String(h);
                        const placeholder = wrapper.querySelector('.video-placeholder');
                        if (placeholder?.dataset.inlinePlaying !== '1'
                            && coverVideo.dataset.contentCropApplied !== '1') {
                            let finalW = 280;
                            let finalH = (h / w) * finalW;

                            if (finalH > 420) {
                                finalH = 420;
                                finalW = (w / h) * finalH;
                            }

                            placeholder.style.width = finalW + 'px';
                            placeholder.style.height = finalH + 'px';
                            coverVideo.style.objectFit = 'cover';
                        }
                    }

                    coverVideo.dataset.coverReady = '1';
                    releaseVideoCoverLoad(coverVideo);
                };

                coverVideo.addEventListener('loadeddata', () => {
                    cropVideoCoverToContent(coverVideo, wrapper.querySelector('.video-placeholder'));
                    captureVideoCoverPoster(coverVideo);
                    if (coverVideo.dataset.nearViewport === '0') {
                        scheduleVideoCoverRelease(coverVideo);
                    }
                });

                coverVideo.onerror = () => {
                    releaseVideoCoverLoad(coverVideo);
                };
            }

            const placeholder = wrapper.querySelector('.video-placeholder');
            const playInline = () => {
                if (!placeholder || placeholder.dataset.inlinePlaying === '1') {
                    return;
                }
                const playContext = capturePlaybackViewContext();

                const currentPlayingVideo = getCurrentPlayingVideo();
                const currentPlayingAudio = getCurrentPlayingAudio();
                if (currentPlayingVideo) currentPlayingVideo.pause();
                if (currentPlayingAudio) {
                    currentPlayingAudio.pause();
                    setCurrentPlayingAudio(null);
                }

                placeholder.dataset.inlinePlaying = '1';

                const cover = placeholder.querySelector('.lazy-cover');
                const overlay = placeholder.querySelector('.play-icon-overlay');
                if (!cover) {
                    placeholder.dataset.inlinePlaying = '0';
                    return;
                }

                clearVideoCoverRelease(cover);
                if (cover.dataset.resourceReleased === '1') {
                    cover.dataset.resourceReleased = '0';
                    cover.dataset.coverReady = '0';
                    cover.preload = 'auto';
                    cover.src = cover.dataset.src;
                    cover.load();
                }
                cover.dataset.previewStyle = cover.style.cssText;
                cover.dataset.previewWidth = placeholder.style.width;
                cover.dataset.previewHeight = placeholder.style.height;
                placeholder.style.cursor = 'default';
                placeholder.style.background = '#000';
                placeholder.style.pointerEvents = 'auto';

                cover.removeAttribute('muted');
                cover.muted = false;
                cover.defaultMuted = false;
                cover.controls = true;
                cover.preload = 'auto';
                cover.style.cssText = `
                    position: absolute;
                    inset: 0;
                    display: block;
                    width: 100%;
                    height: 100%;
                    max-width: none;
                    max-height: none;
                    object-fit: contain;
                    border-radius: 0 !important;
                    box-shadow: none;
                    outline: none;
                    background: #000;
                    opacity: 1;
                    pointer-events: auto;
                    z-index: 2;
                `;
                if (overlay) {
                    overlay.style.opacity = '0';
                    overlay.style.pointerEvents = 'none';
                }

                cover.onended = () => {
                    if (getCurrentPlayingVideo() === cover) setCurrentPlayingVideo(null);
                    restoreVideoCoverPresentation(cover);
                };

                cover.onpause = () => {
                    if (getCurrentPlayingVideo() === cover) setCurrentPlayingVideo(null);
                    if (cover.dataset.nearViewport === '0') scheduleVideoCoverRelease(cover);
                };

                cover.onplay = () => {
                    const latestAudio = getCurrentPlayingAudio();
                    const latestVideo = getCurrentPlayingVideo();
                    if (latestAudio) latestAudio.pause();
                    if (latestVideo && latestVideo !== cover) {
                        latestVideo.pause();
                    }
                    setCurrentPlayingVideo(cover);
                };

                if (!isPlaybackViewContextActive(playContext)) {
                    cover.pause();
                    placeholder.dataset.inlinePlaying = '0';
                    return;
                }

                const playPromise = cover.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(error => {
                        restoreVideoCoverPresentation(cover);
                        console.warn('Inline video playback failed:', error);
                        showToast('视频播放失败');
                    });
                }
                setCurrentPlayingVideo(cover);
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

            return wrapper;
        }

        return {
            createCustomAudioPlayer,
            createCustomVideoPlayer
        };
    };
})();
