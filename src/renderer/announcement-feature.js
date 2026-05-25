(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createAnnouncementFeature = function createAnnouncementFeature(deps) {
        const {
            DATA_BASE_URL,
            openInBrowser
        } = deps;

        let pendingAnnouncementData = null;
        const ANNOUNCEMENT_SEEN_PREFIX = 'yaya:announcement:browser-session-seen:';
        const ANNOUNCEMENT_SESSION_KEY = 'yaya:announcement:browser-session-id';
        const ANNOUNCEMENT_TABS_KEY = 'yaya:announcement:active-tabs';
        const ANNOUNCEMENT_TAB_ID_KEY = 'yaya:announcement:tab-id';
        const ANNOUNCEMENT_TAB_STALE_MS = 15000;
        const ANNOUNCEMENT_TAB_HEARTBEAT_MS = 5000;
        let announcementTabRegistered = false;
        let announcementHeartbeatTimer = null;

        function normalizeAnnouncementPart(value) {
            return String(value || '').trim();
        }

        function hashString(input) {
            let hash = 0;
            const text = String(input || '');
            for (let i = 0; i < text.length; i += 1) {
                hash = ((hash << 5) - hash) + text.charCodeAt(i);
                hash |= 0;
            }
            return Math.abs(hash).toString(36);
        }

        function createAnnouncementId() {
            return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        }

        function readActiveAnnouncementTabs() {
            try {
                const parsed = JSON.parse(localStorage.getItem(ANNOUNCEMENT_TABS_KEY) || '{}');
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (e) {
                return {};
            }
        }

        function writeActiveAnnouncementTabs(tabs) {
            try {
                localStorage.setItem(ANNOUNCEMENT_TABS_KEY, JSON.stringify(tabs || {}));
            } catch (e) { }
        }

        function pruneActiveAnnouncementTabs(tabs) {
            const now = Date.now();
            const nextTabs = {};
            Object.keys(tabs || {}).forEach((tabId) => {
                const lastSeen = Number(tabs[tabId]);
                if (Number.isFinite(lastSeen) && now - lastSeen < ANNOUNCEMENT_TAB_STALE_MS) {
                    nextTabs[tabId] = lastSeen;
                }
            });
            return nextTabs;
        }

        function getAnnouncementTabId() {
            try {
                const existingTabId = sessionStorage.getItem(ANNOUNCEMENT_TAB_ID_KEY);
                if (existingTabId) return { tabId: existingTabId, hadExistingTabId: true };

                const tabId = createAnnouncementId();
                sessionStorage.setItem(ANNOUNCEMENT_TAB_ID_KEY, tabId);
                return { tabId, hadExistingTabId: false };
            } catch (e) {
                return { tabId: createAnnouncementId(), hadExistingTabId: false };
            }
        }

        function unregisterAnnouncementTab(tabId) {
            try {
                const tabs = readActiveAnnouncementTabs();
                delete tabs[tabId];
                writeActiveAnnouncementTabs(tabs);
            } catch (e) { }
        }

        function registerAnnouncementTab(tabId) {
            const tabs = pruneActiveAnnouncementTabs(readActiveAnnouncementTabs());
            tabs[tabId] = Date.now();
            writeActiveAnnouncementTabs(tabs);
        }

        function ensureBrowserAnnouncementSessionId() {
            try {
                const { tabId, hadExistingTabId } = getAnnouncementTabId();
                const activeTabs = pruneActiveAnnouncementTabs(readActiveAnnouncementTabs());
                const hasOtherActiveTabs = Object.keys(activeTabs).length > 0;
                let sessionId = localStorage.getItem(ANNOUNCEMENT_SESSION_KEY);

                if (!sessionId || (!hasOtherActiveTabs && !hadExistingTabId)) {
                    sessionId = createAnnouncementId();
                    localStorage.setItem(ANNOUNCEMENT_SESSION_KEY, sessionId);
                }

                registerAnnouncementTab(tabId);

                if (!announcementTabRegistered) {
                    announcementTabRegistered = true;
                    announcementHeartbeatTimer = setInterval(() => {
                        registerAnnouncementTab(tabId);
                    }, ANNOUNCEMENT_TAB_HEARTBEAT_MS);

                    const cleanup = () => {
                        if (announcementHeartbeatTimer) clearInterval(announcementHeartbeatTimer);
                        unregisterAnnouncementTab(tabId);
                    };
                    window.addEventListener('pagehide', cleanup, { once: true });
                    window.addEventListener('beforeunload', cleanup, { once: true });
                }

                return sessionId;
            } catch (e) {
                return 'fallback';
            }
        }

        function getAnnouncementKey(data) {
            const explicitId = normalizeAnnouncementPart(data.id || data.noticeId || data.version || data.updatedAt);
            const sessionId = ensureBrowserAnnouncementSessionId();
            if (explicitId) return `${ANNOUNCEMENT_SEEN_PREFIX}${sessionId}:${explicitId}`;

            const fingerprint = [
                data.header,
                data.title,
                data.fullContent,
                data.imageUrl,
                data.link
            ].map(normalizeAnnouncementPart).join('|');
            return `${ANNOUNCEMENT_SEEN_PREFIX}${sessionId}:${hashString(fingerprint)}`;
        }

        function hasSeenAnnouncement(data) {
            try {
                return localStorage.getItem(getAnnouncementKey(data)) === '1';
            } catch (e) {
                return false;
            }
        }

        function markAnnouncementSeen(data) {
            try {
                localStorage.setItem(getAnnouncementKey(data), '1');
            } catch (e) { }
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

            markAnnouncementSeen(data);

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
            if (hasSeenAnnouncement(data)) return;
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
