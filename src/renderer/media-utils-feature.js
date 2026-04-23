(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createMediaUtilsFeature = function createMediaUtilsFeature(deps) {
        const {
            getCreateCustomAudioPlayer,
            showToast
        } = deps;

        let currentImgZoom = 1;
        let isDraggingImg = false;
        let imgStartX = 0;
        let imgStartY = 0;
        let imgTranslateX = 0;
        let imgTranslateY = 0;

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

            const createCustomAudioPlayer = getCreateCustomAudioPlayer();
            if (typeof createCustomAudioPlayer !== 'function') return;

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

        function initImageViewerEvents() {
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
        }

        initImageViewerEvents();

        return {
            closeImageModal,
            getPreferredExternalPlayerName,
            insertAudioPlayerIntoMessage,
            openImageModal,
            openMediaInExternalPlayer
        };
    };
})();
