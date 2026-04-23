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
        const MAX_ACTIVE_VIDEO_COVER_LOADS = 2;

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
                const playContext = capturePlaybackViewContext();

                const currentPlayingVideo = getCurrentPlayingVideo();
                const currentPlayingAudio = getCurrentPlayingAudio();
                if (currentPlayingVideo) currentPlayingVideo.pause();
                if (currentPlayingAudio) {
                    currentPlayingAudio.pause();
                    setCurrentPlayingAudio(null);
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

                    if (!isPlaybackViewContextActive(playContext)) {
                        inlineVideo.pause();
                        cleanupStagingHost();
                        placeholder.dataset.inlinePlaying = '0';
                        placeholder.style.pointerEvents = 'auto';
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
                    if (getCurrentPlayingVideo() === inlineVideo) setCurrentPlayingVideo(null);
                };

                inlineVideo.onplay = () => {
                    const latestAudio = getCurrentPlayingAudio();
                    const latestVideo = getCurrentPlayingVideo();
                    if (latestAudio) latestAudio.pause();
                    if (latestVideo && latestVideo !== inlineVideo) {
                        latestVideo.pause();
                    }
                    setCurrentPlayingVideo(inlineVideo);
                };

                stagingHost.appendChild(inlineVideo);
                document.body.appendChild(stagingHost);
                const playPromise = inlineVideo.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => { });
                }
                setCurrentPlayingVideo(inlineVideo);
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

        return {
            createCustomAudioPlayer,
            createCustomVideoPlayer
        };
    };
})();
