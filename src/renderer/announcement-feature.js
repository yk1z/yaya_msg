(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createAnnouncementFeature = function createAnnouncementFeature(deps) {
        const {
            DATA_BASE_URL,
            openInBrowser
        } = deps;

        let pendingAnnouncementData = null;

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
            if (!pendingAnnouncementData) return;
            const data = pendingAnnouncementData;
            pendingAnnouncementData = null;
            renderAnnouncement(data);
        }

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

        return {
            checkGitHubNotice,
            closeAnnouncement
        };
    };
})();
