(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createLiveToolsFeature = function createLiveToolsFeature(deps) {
        const {
            fetchPocketAPI,
            getAppToken,
            getArt,
            getCurrentMode,
            getCurrentViewName,
            getCurrentPlayingItem,
            getPlaybackViewToken,
            getLiveAnnouncementDismissed,
            setLiveAnnouncementDismissed,
            getMemberData,
            loadMemberData,
            getPinyinInitials,
            getTeamStyle,
            showToast,
            ipcRenderer
        } = deps;

        let clipStartTime = null;
        let clipEndTime = null;
        let currentRecordTaskId = null;
        let currentRecordStartedAt = null;
        let currentRecordFileName = '';
        let clipTaskPreparing = false;
        let liveUiRevision = 0;
        const liveRankRequests = new Map();
        const liveAnnouncementRequests = new Map();

        function resetAnnouncementButton(button, request) {
            if (liveAnnouncementRequests.get(button) !== request) return;
            clearTimeout(request.timer);
            button.innerText = request.originalText || '↻';
            button.disabled = false;
            liveAnnouncementRequests.delete(button);
        }

        function invalidateLiveUiRequests() {
            liveUiRevision += 1;
            liveRankRequests.clear();
            for (const [button, request] of liveAnnouncementRequests) resetAnnouncementButton(button, request);
        }

        function captureLiveUiContext() {
            const revision = liveUiRevision;
            const token = getSafeToken();
            const accountGeneration = window.getPocketAccountSessionGeneration?.();
            const playbackToken = getPlaybackViewToken?.();
            const liveId = String(getCurrentPlayingItem?.()?.liveId || '');
            return () => revision === liveUiRevision && token === getSafeToken()
                && accountGeneration === window.getPocketAccountSessionGeneration?.()
                && playbackToken === getPlaybackViewToken?.()
                && liveId === String(getCurrentPlayingItem?.()?.liveId || '');
        }

        window.addEventListener('yaya:view-changed', invalidateLiveUiRequests);
        const AUTO_LIVE_RECORD_ENABLED_KEY = 'yaya_auto_live_record_enabled';
        const AUTO_LIVE_RECORD_MEMBERS_KEY = 'yaya_auto_live_record_members';
        const AUTO_LIVE_RECORD_POLL_INTERVAL_MS = 3000;
        const LIVE_START_HINT_TTL_MS = 15000;
        const IS_WEB_PLATFORM = window.desktop?.platform === 'web'
            || document.documentElement?.dataset?.platform === 'web';
        const CAN_AUTO_RECORD_LIVE = !IS_WEB_PLATFORM && !window.desktop?.isRoomWindow && !window.desktop?.isLiveWindow;
        let autoLiveRecordEnabled = false;
        let autoLiveRecordMembers = [];
        let autoLiveRecordPollTimer = null;
        let autoLiveRecordPollRunning = false;
        const autoLiveRecordTasks = new Map();
        const autoLiveRecordTaskOwners = new Map();
        const autoLiveRecordHandledLiveIds = new Set();
        const autoLiveRecordRetryState = new Map();
        const autoLiveRecordMissingPolls = new Map();
        const liveStartHints = new Map();
        let liveStartSubscription = null;
        let liveRecordAccount = null;
        let liveRecordGeneration = 0;
        let livePollRequested = false;
        let liveRecordCheckFailures = 0;

        function liveRecordRetryDelay() {
            return [3000, 10000, 30000, 60000][Math.min(Math.max(0, liveRecordCheckFailures - 1), 3)];
        }

        function readStringSetting(key, fallbackValue = '') {
            if (typeof window.readStoredStringSetting === 'function') {
                return window.readStoredStringSetting(key, fallbackValue);
            }
            const legacyValue = localStorage.getItem(key);
            return legacyValue === null ? fallbackValue : String(legacyValue);
        }

        function readJsonSetting(key, fallbackValue = null) {
            if (typeof window.readStoredJsonSetting === 'function') {
                return window.readStoredJsonSetting(key, fallbackValue);
            }
            try {
                const raw = localStorage.getItem(key);
                return raw === null ? fallbackValue : JSON.parse(raw);
            } catch (error) {
                return fallbackValue;
            }
        }

        function writeJsonSetting(key, value) {
            if (typeof window.writeStoredJsonSetting === 'function') {
                return window.writeStoredJsonSetting(key, value);
            }
            localStorage.setItem(key, JSON.stringify(value));
            return value;
        }

        function showAutoLiveRecordToast(message, type = 'info') {
            if (typeof showToast === 'function') {
                showToast(message, type);
                return;
            }
            console.log(`[自动录制] ${message}`);
        }

        function getSafeToken() {
            if (typeof getAppToken === 'function') return getAppToken();
            return typeof window.getAppToken === 'function' ? window.getAppToken() : '';
        }

        function getSafePa() {
            return window.getPA ? window.getPA() : null;
        }

        function getCurrentArt() {
            return typeof getArt === 'function' ? getArt() : null;
        }

        function getSafeCurrentViewName() {
            return typeof getCurrentViewName === 'function' ? String(getCurrentViewName() || '') : '';
        }

        function getActiveClipScope() {
            const currentViewName = getSafeCurrentViewName();
            let preferredScope;
            if (currentViewName === 'bilibili-live') {
                preferredScope = document.getElementById('view-bilibili-live');
            } else {
                const visiblePlaybackPage = Array.from(document.querySelectorAll('.media-playback-page'))
                    .find(page => page.style.display !== 'none');
                const mode = getClipMode();
                preferredScope = visiblePlaybackPage || (
                    mode === 'live' || mode === 'meet-live'
                        ? document.getElementById('view-live-player')
                        : document.getElementById('view-vod-player')
                );
            }
            if (preferredScope) return preferredScope;
            return document.getElementById('view-media') || document;
        }

        function getClipElement(role, legacyId = '') {
            const selector = `[data-clip-role="${role}"]`;
            const activeScope = getActiveClipScope();
            const scopedEl = activeScope?.querySelector ? activeScope.querySelector(selector) : null;
            if (scopedEl) return scopedEl;
            if (legacyId) {
                const legacyEl = document.getElementById(legacyId);
                if (legacyEl) return legacyEl;
            }
            return document.querySelector(selector);
        }

        function getClipMode() {
            if (getSafeCurrentViewName() === 'bilibili-live') return 'live';
            const visiblePlaybackPage = Array.from(document.querySelectorAll('.media-playback-page'))
                .find(page => page.style.display !== 'none');
            if (visiblePlaybackPage?.dataset.mediaPlaybackKind) {
                return visiblePlaybackPage.dataset.mediaPlaybackKind;
            }
            return typeof getCurrentMode === 'function' ? getCurrentMode() : 'live';
        }

        function syncWebLiveClipToolbarVisibility() {
            if (!IS_WEB_PLATFORM) return;

            const mode = getClipMode();
            const shouldHide = mode === 'live' || mode === 'meet-live';
            const toolbar = getSafeCurrentViewName() === 'bilibili-live'
                ? document.querySelector('[data-clip-toolbar="bilibili-live"]')
                : getActiveClipScope()?.querySelector('.media-clip-toolbar');
            if (toolbar) {
                toolbar.classList.toggle('web-live-clip-toolbar-hidden', shouldHide);
            }
        }

        async function refreshLiveAnnouncement(btnElement) {
            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;
            if (!currentPlayingItem || !currentPlayingItem.liveId || !btnElement) return;

            const previous = liveAnnouncementRequests.get(btnElement);
            if (previous) resetAnnouncementButton(btnElement, previous);
            const request = { originalText: btnElement.innerText, timer: null };
            const contextIsCurrent = captureLiveUiContext();
            const isCurrent = () => liveAnnouncementRequests.get(btnElement) === request && contextIsCurrent();
            liveAnnouncementRequests.set(btnElement, request);

            btnElement.innerText = '...';
            btnElement.disabled = true;

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({
                    liveId: currentPlayingItem.liveId
                }));
                if (!isCurrent()) return;

                if (res && res.status === 200 && res.content) {
                    const textEl = document.getElementById('live-announcement-text');
                    const barEl = document.getElementById('live-announcement-bar');
                    const newText = res.content.announcement;

                    if (textEl) {
                        if (newText) {
                            textEl.innerText = newText;
                        } else {
                            textEl.innerHTML = '<span style="opacity: 0.6; font-style: italic;">暂无公告</span>';
                        }
                    }

                    if (barEl) {
                        const dismissed = typeof getLiveAnnouncementDismissed === 'function'
                            ? getLiveAnnouncementDismissed()
                            : false;
                        barEl.style.display = dismissed ? 'none' : 'block';
                    }

                    btnElement.innerText = '✓';
                } else {
                    btnElement.innerText = window.YayaRendererUtils.t('失败');
                }
            } catch (e) {
                if (!isCurrent()) return;
                console.error('刷新公告失败:', e);
                btnElement.innerText = window.YayaRendererUtils.t('失败');
            } finally {
                if (isCurrent()) request.timer = setTimeout(() => resetAnnouncementButton(btnElement, request), 2000);
                else resetAnnouncementButton(btnElement, request);
            }
        }

        function closeLiveAnnouncement() {
            if (typeof setLiveAnnouncementDismissed === 'function') {
                setLiveAnnouncementDismissed(true);
            }

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

        function openLiveRankPanel() {
            const modal = document.getElementById('liveRankModal');
            const list = document.getElementById('live-rank-modal-list');

            if (modal) modal.style.display = 'flex';
            updateLiveRankModalInfo();
            if (list) {
                list.innerHTML = '<div class="empty-state">正在加载贡献榜...</div>';
                list.scrollTop = 0;
            }
            return fetchLiveRank(null, 'live-rank-modal-list');
        }

        function closeLiveRankModal() {
            liveRankRequests.delete('live-rank-modal-list');
            const modal = document.getElementById('liveRankModal');
            if (modal) modal.style.display = 'none';
        }

        function formatLiveRankModalTime(rawTime) {
            if (!rawTime) return '';
            const timeNum = Number(rawTime);
            if (Number.isNaN(timeNum)) return String(rawTime);
            const date = new Date(timeNum);
            const pad = value => String(value).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        }

        function escapeLiveRankText(value) {
            return String(value ?? '').replace(/[&<>"']/g, char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char]));
        }

        function formatRankMoney(value) {
            const num = Number(value);
            if (!Number.isFinite(num)) return '';
            return String(num);
        }

        function bindLiveRankUserProfiles(listContainer) {
            listContainer.querySelectorAll('[data-live-rank-user-id]').forEach(row => {
                const openProfile = () => {
                    const userId = String(row.dataset.liveRankUserId || '').trim();
                    if (!userId) return;
                    if (typeof window.openFollowedUserProfile !== 'function') {
                        const art = getCurrentArt();
                        if (art?.notice) art.notice.show = '用户主页模块还没有准备好';
                        return;
                    }
                    closeLiveRankModal();
                    window.openFollowedUserProfile(
                        userId,
                        row.dataset.liveRankUserName || '口袋用户',
                        row.dataset.liveRankAvatar || './icon.png',
                        false
                    );
                };
                row.addEventListener('click', openProfile);
                row.addEventListener('keydown', event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openProfile();
                });
            });
        }

        function updateLiveRankModalInfo(totalContribution = null) {
            const infoEl = document.getElementById('live-rank-modal-info');
            if (!infoEl) return;

            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;
            if (!currentPlayingItem) {
                infoEl.innerHTML = `
                    <div class="live-rank-info-grid">
                        <span class="live-rank-info-chip">--</span>
                    </div>
                `;
                return;
            }

            const memberName = currentPlayingItem.userInfo?.nickname
                || currentPlayingItem.userInfo?.userName
                || currentPlayingItem.nickname
                || '未知成员';
            const timeText = formatLiveRankModalTime(currentPlayingItem.startTime || currentPlayingItem.ctime);
            const items = [
                { label: '成员', value: memberName },
                { label: '时间', value: timeText },
                { label: '总贡献值', value: formatRankMoney(totalContribution) }
            ].filter(item => item.value);

            infoEl.innerHTML = `
                <div class="live-rank-info-grid">
                    ${items.map(item => `
                        <span class="live-rank-info-chip" title="${escapeLiveRankText(item.label)}: ${escapeLiveRankText(item.value)}">
                            <span class="live-rank-info-key">${escapeLiveRankText(item.label)}</span>
                            <span class="live-rank-info-value">${escapeLiveRankText(item.value)}</span>
                        </span>
                    `).join('')}
                </div>
            `;
        }

        async function fetchLiveRank(liveIdParam, targetContainerId = 'live-rank-list') {
            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;
            const liveId = liveIdParam || (currentPlayingItem ? currentPlayingItem.liveId : null);
            if (!liveId) return;

            const listContainer = document.getElementById(targetContainerId);
            if (!listContainer) return;
            const request = {};
            const contextIsCurrent = captureLiveUiContext();
            const isCurrent = () => liveRankRequests.get(targetContainerId) === request && contextIsCurrent();
            liveRankRequests.set(targetContainerId, request);

            listContainer.innerHTML = '<div style="text-align: center; color: var(--text-sub); font-size: 12px; padding: 20px;"><div class="spinner" style="width:20px;height:20px;margin:0 auto 10px;"></div>正在加载数据...</div>';

            try {
                const res = await ipcRenderer.invoke('fetch-live-rank', {
                    token: getSafeToken(),
                    pa: getSafePa(),
                    liveId,
                    ...(currentPlayingItem?.rankSource === 'performance'
                        && String(currentPlayingItem.liveId) === String(liveId)
                        ? { rankSource: 'performance', type: currentPlayingItem.rankType } : {})
                });

                if (!isCurrent()) return;

                if (res.success && res.content && res.content.data) {
                    const rankData = res.content.data;
                    if (targetContainerId === 'live-rank-modal-list') {
                        const totalContribution = rankData.reduce((sum, item) => sum + (Number(item.money) || 0), 0);
                        updateLiveRankModalInfo(totalContribution);
                    }

                    if (rankData.length === 0) {
                        listContainer.innerHTML = '<div style="text-align: center; color: var(--text-sub); font-size: 12px; padding: 15px;">本场暂无贡献数据</div>';
                        return;
                    }

                    let html = '';
                    rankData.forEach((item, index) => {
                        const isTop3 = index < 3;
                        const rankClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : ''));

                        let avatar = './icon.png';
                        if (item.user && item.user.userAvatar) {
                            avatar = item.user.userAvatar.startsWith('http')
                                ? item.user.userAvatar
                                : `https://source.48.cn${item.user.userAvatar}`;
                        }
                        const userName = item.user ? item.user.userName : '未知用户';
                        const userId = item.user
                            ? (item.user.userId || item.user.id || item.user.uid || item.user.accountId || '')
                            : (item.userId || item.id || item.uid || item.accountId || '');
                        const userIdText = userId ? `ID: ${userId}` : 'ID: --';
                        const profileAttributes = userId
                            ? `role="button" tabindex="0" data-live-rank-user-id="${escapeLiveRankText(userId)}" data-live-rank-user-name="${escapeLiveRankText(userName)}" data-live-rank-avatar="${escapeLiveRankText(avatar)}" title="查看用户主页"`
                            : '';

                        html += `
                <div ${profileAttributes} style="display: flex; align-items: center; padding: 10px 8px; border-bottom: 1px solid rgba(128,128,128,0.1); transition: background 0.2s; cursor: ${userId ? 'pointer' : 'default'};" onmouseover="this.style.background='var(--chip-hover)'" onmouseout="this.style.background='transparent'">
                    <div class="rank-num ${rankClass}" style="width: 24px; height: 24px; min-width: 24px; font-size: 11px; margin-right: 12px; margin-bottom: 0;">${index + 1}</div>
                    <img src="${escapeLiveRankText(avatar)}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; margin-right: 12px; border: 1px solid rgba(0,0,0,0.05); flex-shrink: 0;">
                    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
                        <div style="font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${isTop3 ? 'bold' : '500'};">
                            ${escapeLiveRankText(userName)}
                        </div>
                        <div style="font-size: 11px; color: var(--text-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeLiveRankText(userIdText)}
                        </div>
                    </div>
                    <div style="font-size: 14px; color: #fa8c16; font-weight: bold; margin-left: 10px; flex-shrink: 0; text-shadow: 0 0 10px rgba(250, 140, 22, 0.1);">
                        ${escapeLiveRankText(item.money)} <span style="font-size: 11px; color: var(--text-sub); font-weight: normal; opacity: 0.6; margin-left: 2px;">贡献值</span>
                    </div>
                </div>
                `;
                    });
                    listContainer.innerHTML = html;
                    bindLiveRankUserProfiles(listContainer);
                } else {
                    listContainer.innerHTML = '<div style="text-align: center; color: var(--text-sub); font-size: 12px; padding: 15px;">获取榜单失败</div>';
                }
            } catch (e) {
                if (!isCurrent()) return;
                listContainer.innerHTML = `<div style="text-align: center; color: #ff4d4f; font-size: 12px; padding: 15px;">出错了: ${e.message}</div>`;
            } finally {
                if (liveRankRequests.get(targetContainerId) === request) liveRankRequests.delete(targetContainerId);
            }
        }

        function updateClipUI() {
            syncWebLiveClipToolbarVisibility();

            const startDisplay = getClipElement('start-display', 'clip-start-display');
            const endDisplay = getClipElement('end-display', 'clip-end-display');
            const durationDisplay = getClipElement('duration-display', 'clip-duration-display');
            const clipBtn = getClipElement('do-clip', 'btn-do-clip');

            const formatTimeMS = (seconds) => {
                if (seconds === null || seconds === undefined) return '';
                const h = Math.floor(seconds / 3600);
                const m = Math.floor((seconds % 3600) / 60);
                const sec = Math.floor(seconds % 60);
                const ms = Math.floor((seconds % 1) * 1000);

                const pad = (n, width = 2) => String(n).padStart(width, '0');
                return `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms, 3)}`;
            };

            if (startDisplay) {
                startDisplay.textContent = clipStartTime === null
                    ? ''
                    : formatTimeMS(clipStartTime);
            }
            if (endDisplay) {
                endDisplay.textContent = clipEndTime === null
                    ? ''
                    : formatTimeMS(clipEndTime);
            }

            if (clipStartTime !== null && clipEndTime !== null) {
                const duration = clipEndTime - clipStartTime;
                if (duration > 0) {
                    if (durationDisplay) durationDisplay.textContent = window.YayaRendererUtils.t(`时长: ${duration.toFixed(2)}s`);
                    if (clipBtn) clipBtn.disabled = false;
                } else {
                    if (durationDisplay) durationDisplay.textContent = window.YayaRendererUtils.t('时长: 无效');
                    if (clipBtn) clipBtn.disabled = true;
                }
            } else {
                if (durationDisplay) durationDisplay.textContent = window.YayaRendererUtils.t('时长: 0s');
                if (clipBtn) clipBtn.disabled = true;
            }
        }

        function resetClipTool() {
            clipStartTime = null;
            clipEndTime = null;
            currentRecordTaskId = null;
            currentRecordStartedAt = null;
            currentRecordFileName = '';
            updateClipUI();
        }

        function buildLiveCaptureFileName(currentPlayingItem, startedAt = new Date(), prefix = '直播切片') {
            const nickname = currentPlayingItem?.userInfo?.nickname || currentPlayingItem?.nickname || '未知成员';
            const pad = (n) => String(n).padStart(2, '0');
            let streamTime = '00000000_00.00.00';
            const rawTime = currentPlayingItem?.startTime || currentPlayingItem?.ctime;
            if (rawTime) {
                const streamStartedAt = new Date(Number(rawTime));
                streamTime = `${streamStartedAt.getFullYear()}${pad(streamStartedAt.getMonth() + 1)}${pad(streamStartedAt.getDate())}_${pad(streamStartedAt.getHours())}.${pad(streamStartedAt.getMinutes())}.${pad(streamStartedAt.getSeconds())}`;
            }
            const recordTime = `${pad(startedAt.getHours())}.${pad(startedAt.getMinutes())}.${pad(startedAt.getSeconds())}`;
            return `${prefix}_【${nickname}】${streamTime}_${recordTime}`;
        }

        function buildLiveRecordFileName(currentPlayingItem, startedAt = new Date()) {
            return buildLiveCaptureFileName(currentPlayingItem, startedAt, '直播录制');
        }

        function buildLiveClipFileName(currentPlayingItem, startedAt = new Date()) {
            return buildLiveCaptureFileName(currentPlayingItem, startedAt, '直播切片');
        }

        function ensureLiveRecordDownloadTask(taskId, fileName, statusText) {
            const downloadList = document.getElementById('downloadList');
            if (!downloadList) return;
            if (downloadList.innerText.includes('暂无')) downloadList.replaceChildren();

            let taskEl = document.getElementById(taskId);
            if (!taskEl) {
                taskEl = document.createElement('div');
                taskEl.className = 'download-item';
                taskEl.id = taskId;
                taskEl.dataset.taskType = 'live-record';
                taskEl.innerHTML = `
                    <div class="download-title-row">
                        <div class="download-title-line"></div>
                        <button class="btn-cancel">取消</button>
                    </div>
                    <div class="progress-container" style="margin: 5px 0;">
                        <div class="progress-fill" style="width: 100%; opacity: 0.5;"></div>
                    </div>
                    <span class="download-status-text"></span>
                `;
                taskEl.querySelector('.btn-cancel')?.addEventListener('click', () => {
                    if (typeof window.cancelDownloadTask === 'function') {
                        window.cancelDownloadTask(taskId);
                    }
                });
                downloadList.prepend(taskEl);
            }

            const titleEl = taskEl.querySelector('.download-title-line');
            const statusEl = taskEl.querySelector('.download-status-text');
            if (titleEl) {
                titleEl.textContent = fileName;
                titleEl.title = fileName;
            }
            if (statusEl) statusEl.textContent = statusText;
        }

        function normalizeAutoLiveRecordMember(member) {
            const id = String(member?.id || member?.userId || member?.ownerId || member?.memberId || '').trim();
            const name = String(member?.name || member?.ownerName || member?.nickname || member?.nickName || '').trim();
            if (!id || !name) return null;
            return {
                id,
                name,
                team: String(member?.team || member?.groupName || '').trim()
            };
        }

        function normalizeStoredAutoLiveRecordMembers(value) {
            const result = [];
            const seen = new Set();
            (Array.isArray(value) ? value : []).forEach(item => {
                const member = normalizeAutoLiveRecordMember(item);
                if (!member || seen.has(member.id)) return;
                seen.add(member.id);
                result.push(member);
            });
            return result;
        }

        function persistAutoLiveRecordSettings() {
            writeJsonSetting(AUTO_LIVE_RECORD_ENABLED_KEY, autoLiveRecordEnabled);
            writeJsonSetting(AUTO_LIVE_RECORD_MEMBERS_KEY, autoLiveRecordMembers);
        }

        function getAutoLiveRecordItemMemberId(item) {
            return String(
                item?.userInfo?.userId
                || item?.userInfo?.id
                || item?.userId
                || item?.ownerId
                || ''
            ).trim();
        }

        function getAutoLiveRecordItemName(item, fallbackName = '') {
            return String(
                item?.userInfo?.nickname
                || item?.nickname
                || item?.userName
                || fallbackName
                || '未知成员'
            ).trim();
        }

        function updateAutoLiveRecordUi() {
            const button = document.getElementById('btn-auto-live-record');
            const checkbox = document.getElementById('auto-live-record-enabled');
            const status = document.getElementById('auto-live-record-status');
            const count = document.getElementById('auto-live-record-member-count');
            const activeCount = autoLiveRecordTasks.size;
            const monitorStatus = getLiveRecordMonitorStatus();

            if (button) {
                button.classList.toggle('is-enabled', autoLiveRecordEnabled);
                button.classList.toggle('is-recording', activeCount > 0);
                button.textContent = window.YayaRendererUtils.t(activeCount > 0 ? `自动录制 ${activeCount}` : '自动录制');
                button.title = autoLiveRecordEnabled
                    ? `${monitorStatus}${activeCount ? `，正在录制 ${activeCount} 场` : ''}`
                    : '设置直播自动录制成员';
            }
            if (checkbox) checkbox.checked = autoLiveRecordEnabled;
            if (count) count.textContent = window.YayaRendererUtils.t(`${autoLiveRecordMembers.length} 位`);
            if (status) {
                if (!autoLiveRecordEnabled) {
                    status.textContent = window.YayaRendererUtils.t('尚未启用');
                } else if (autoLiveRecordMembers.length === 0) {
                    status.textContent = window.YayaRendererUtils.t('请先添加需要自动录制的成员');
                } else {
                    status.textContent = window.YayaRendererUtils.t(monitorStatus);
                }
            }
        }

        function getLiveRecordMonitorStatus() {
            if (!autoLiveRecordEnabled) return '尚未启用';
            if (!autoLiveRecordMembers.length) return '请先添加需要自动录制的成员';
            if (!getSafeToken()) return '请先登录口袋48账号';
            if (liveRecordCheckFailures) return `直播检查失败，${liveRecordRetryDelay() / 1000} 秒后重试`;
            const state = liveStartSubscription;
            const covered = autoLiveRecordMembers.filter(member => {
                const keys = state?.roomKeysByMember.get(member.id);
                return keys?.size && [...keys].every(key => state.accepted.has(key));
            }).length;
            if (covered === autoLiveRecordMembers.length) return `订阅正常：${covered} 位成员`;
            const missing = autoLiveRecordMembers.length - covered;
            if (state?.status === 'connecting') return `正在订阅 ${autoLiveRecordMembers.length} 位成员，轮询兜底中`;
            return covered ? `${covered} 位订阅正常，${missing} 位轮询兜底`
                : `${state?.status === 'connected' ? '订阅未完整' : '正在重连'}，${missing} 位成员轮询兜底`;
        }

        function renderAutoLiveRecordMembers() {
            const container = document.getElementById('auto-live-record-member-list');
            const count = document.getElementById('auto-live-record-member-count');
            if (count) count.textContent = window.YayaRendererUtils.t(`${autoLiveRecordMembers.length} 位`);
            if (!container) return;
            container.replaceChildren();

            if (autoLiveRecordMembers.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'auto-live-record-member-empty';
                empty.textContent = window.YayaRendererUtils.t('还没有成员，请在上方搜索添加');
                container.appendChild(empty);
                return;
            }

            autoLiveRecordMembers.forEach(member => {
                const item = document.createElement('div');
                item.className = 'auto-live-record-member-item';

                const copy = document.createElement('span');
                copy.className = 'auto-live-record-member-copy';
                const name = document.createElement('b');
                name.textContent = member.name;
                const detail = document.createElement('small');
                const task = autoLiveRecordTasks.get(member.id);
                detail.textContent = window.YayaRendererUtils.t(task ? '正在自动录制' : `ID ${member.id}`);
                copy.append(name, detail);

                const actions = document.createElement('span');
                actions.className = 'auto-live-record-member-actions';
                if (member.team) {
                    const team = document.createElement('span');
                    team.className = 'team-tag';
                    team.textContent = member.team;
                    if (typeof getTeamStyle === 'function') {
                        team.style.cssText = getTeamStyle(member.team, false) || '';
                    }
                    actions.appendChild(team);
                }
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'auto-live-record-member-remove';
                remove.textContent = window.YayaRendererUtils.t('移除');
                remove.addEventListener('click', () => removeAutoLiveRecordMember(member.id));
                actions.appendChild(remove);
                item.append(copy, actions);
                container.appendChild(item);
            });
        }

        function addAutoLiveRecordMember(rawMember) {
            const member = normalizeAutoLiveRecordMember(rawMember);
            if (!member) return;
            if (!autoLiveRecordMembers.some(item => item.id === member.id)) {
                autoLiveRecordMembers.push(member);
                persistAutoLiveRecordSettings();
            }
            const input = document.getElementById('auto-live-record-member-search');
            const results = document.getElementById('auto-live-record-member-results');
            if (input) input.value = '';
            if (results) results.style.display = 'none';
            renderAutoLiveRecordMembers();
            updateAutoLiveRecordUi();
            if (autoLiveRecordEnabled) refreshLiveRecordMonitoring();
        }

        function removeAutoLiveRecordMember(memberId) {
            const normalizedId = String(memberId || '').trim();
            const activeTask = autoLiveRecordTasks.get(normalizedId);
            if (activeTask) {
                autoLiveRecordHandledLiveIds.delete(activeTask.liveId);
                ipcRenderer.send('stop-record', {
                    taskId: activeTask.taskId,
                    fileName: activeTask.fileName
                });
            }
            autoLiveRecordRetryState.forEach((retryState, liveId) => {
                if (retryState?.memberId !== normalizedId) return;
                ipcRenderer.send('finalize-live-record-session', {
                    sessionId: retryState.sessionId,
                    reason: 'member-removed'
                });
                autoLiveRecordRetryState.delete(liveId);
                autoLiveRecordHandledLiveIds.delete(liveId);
                autoLiveRecordMissingPolls.delete(liveId);
            });
            autoLiveRecordMembers = autoLiveRecordMembers.filter(item => item.id !== normalizedId);
            persistAutoLiveRecordSettings();
            renderAutoLiveRecordMembers();
            updateAutoLiveRecordUi();
            if (autoLiveRecordEnabled) refreshLiveRecordMonitoring();
        }

        function searchAutoLiveRecordMembers(keyword = '') {
            const results = document.getElementById('auto-live-record-member-results');
            const input = document.getElementById('auto-live-record-member-search');
            if (!results || (input && document.activeElement !== input)) return;
            const normalizedKeyword = String(keyword || '').trim().toLowerCase();
            results.replaceChildren();
            results.scrollTop = 0;
            if (!normalizedKeyword) {
                results.style.display = 'none';
                return;
            }

            const selectedIds = new Set(autoLiveRecordMembers.map(item => item.id));
            const source = typeof getMemberData === 'function' ? getMemberData() : [];
            const matches = (Array.isArray(source) ? source : [])
                .filter(member => {
                    const normalized = normalizeAutoLiveRecordMember(member);
                    if (!normalized || selectedIds.has(normalized.id)) return false;
                    const rawPinyin = String(member?.pinyin || '');
                    const pinyin = rawPinyin.toLowerCase();
                    const initials = typeof getPinyinInitials === 'function'
                        ? String(getPinyinInitials(rawPinyin) || '').toLowerCase()
                        : '';
                    return normalized.name.toLowerCase().includes(normalizedKeyword)
                        || pinyin.includes(normalizedKeyword)
                        || initials.includes(normalizedKeyword);
                })
                .sort((left, right) => {
                    const leftInGroup = left?.isInGroup !== false ? 1 : 0;
                    const rightInGroup = right?.isInGroup !== false ? 1 : 0;
                    return rightInGroup - leftInGroup;
                })
                .slice(0, 12);

            if (matches.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'suggestion-item';
                empty.textContent = window.YayaRendererUtils.t('没有匹配的成员');
                empty.style.cursor = 'default';
                results.appendChild(empty);
            } else {
                matches.forEach(member => {
                    const normalized = normalizeAutoLiveRecordMember(member);
                    const teamColorStyle = typeof getTeamStyle === 'function'
                        ? (getTeamStyle(normalized.team, member?.isInGroup === false) || '')
                        : '';
                    const item = document.createElement('div');
                    item.className = 'suggestion-item';
                    item.style.display = 'flex';
                    item.style.alignItems = 'center';
                    item.style.justifyContent = 'space-between';
                    const name = document.createElement('b');
                    name.textContent = normalized.name;
                    const team = document.createElement('span');
                    team.className = 'team-tag';
                    team.textContent = normalized.team || `ID ${normalized.id}`;
                    team.style.cssText = teamColorStyle;
                    item.append(name, team);
                    item.addEventListener('mousedown', event => event.preventDefault());
                    item.addEventListener('click', () => addAutoLiveRecordMember(member));
                    results.appendChild(item);
                });
            }
            results.style.display = 'block';
        }

        async function openAutoLiveRecordModal() {
            const modal = document.getElementById('autoLiveRecordModal');
            if (!modal) return;
            modal.style.display = 'flex';
            updateAutoLiveRecordUi();
            renderAutoLiveRecordMembers();
            const input = document.getElementById('auto-live-record-member-search');
            if (input) input.focus();
            const source = typeof getMemberData === 'function' ? getMemberData() : [];
            if ((!Array.isArray(source) || source.length === 0) && typeof loadMemberData === 'function') {
                try {
                    await loadMemberData();
                } catch (error) {
                    console.warn('自动录制成员名单加载失败:', error);
                }
            }
        }

        function closeAutoLiveRecordModal() {
            const modal = document.getElementById('autoLiveRecordModal');
            const results = document.getElementById('auto-live-record-member-results');
            const input = document.getElementById('auto-live-record-member-search');
            if (modal) modal.style.display = 'none';
            if (results) results.style.display = 'none';
            if (input) input.blur();
        }

        function stopAllAutoLiveRecordTasks() {
            autoLiveRecordTasks.forEach(task => {
                ipcRenderer.send('stop-record', {
                    taskId: task.taskId,
                    fileName: task.fileName
                });
            });
            autoLiveRecordRetryState.forEach(retryState => {
                ipcRenderer.send('finalize-live-record-session', {
                    sessionId: retryState.sessionId,
                    reason: 'auto-record-disabled'
                });
            });
            autoLiveRecordRetryState.clear();
            autoLiveRecordHandledLiveIds.clear();
            autoLiveRecordMissingPolls.clear();
            autoLiveRecordTasks.clear();
            autoLiveRecordTaskOwners.clear();
            updateAutoLiveRecordUi();
            renderAutoLiveRecordMembers();
        }

        function toggleAutoLiveRecording(enabled) {
            if (IS_WEB_PLATFORM) {
                autoLiveRecordEnabled = false;
                updateAutoLiveRecordUi();
                showAutoLiveRecordToast('网页端已禁用直播自动录制');
                return;
            }
            if (!CAN_AUTO_RECORD_LIVE) return;
            autoLiveRecordEnabled = !!enabled;
            persistAutoLiveRecordSettings();
            updateAutoLiveRecordUi();
            if (autoLiveRecordEnabled) {
                if (autoLiveRecordMembers.length === 0) {
                    showAutoLiveRecordToast('请先添加需要自动录制的成员');
                }
                refreshLiveRecordMonitoring();
            } else {
                if (autoLiveRecordPollTimer) clearTimeout(autoLiveRecordPollTimer);
                autoLiveRecordPollTimer = null;
                liveRecordGeneration += 1;
                liveRecordAccount = null;
                liveStartHints.clear();
                livePollRequested = false;
                liveRecordCheckFailures = 0;
                stopLiveStartSubscription();
                stopAllAutoLiveRecordTasks();
            }
        }

        function stopLiveStartSubscription() {
            const previous = liveStartSubscription;
            liveStartSubscription = null;
            updateAutoLiveRecordUi();
            if (previous) void ipcRenderer.invoke('disconnect-live-start', { requestId: previous.id }).catch(() => {});
        }

        function syncLiveRecordAccount() {
            const token = CAN_AUTO_RECORD_LIVE && autoLiveRecordEnabled ? getSafeToken() : '';
            if (liveRecordAccount?.token === token) return liveRecordAccount;
            if (liveRecordAccount) {
                liveRecordGeneration += 1;
                stopLiveStartSubscription();
                stopAllAutoLiveRecordTasks();
                liveStartHints.clear();
                livePollRequested = false;
                liveRecordCheckFailures = 0;
            }
            liveRecordAccount = token ? { token, nextMemberLoadAt: 0 } : null;
            return liveRecordAccount;
        }

        function syncLiveStartSubscription(account) {
            if (!account || liveRecordAccount !== account || getSafeToken() !== account.token) return;
            const watchedIds = new Set(autoLiveRecordMembers.map(member => member.id));
            const members = new Map((getMemberData?.() || []).map(member => [String(member.id || member.userId || ''), member]));
            const rooms = new Map();
            const roomKeysByMember = new Map();
            for (const memberId of watchedIds) {
                const member = members.get(memberId);
                const serverId = String(member?.serverId || '');
                if (!/^\d{1,32}$/.test(serverId)) continue;
                const keys = roomKeysByMember.get(memberId) || new Set();
                for (const value of [member.channelId, member.smallChannelId || member.yklzId]) {
                    const channelId = String(value || '');
                    if (!/^\d{1,32}$/.test(channelId)) continue;
                    const key = `${serverId}:${channelId}`;
                    rooms.set(key, { serverId, channelId });
                    keys.add(key);
                }
                if (keys.size) roomKeysByMember.set(memberId, keys);
            }
            const signature = [...rooms.keys()].sort().join(',');
            if (liveStartSubscription?.signature === signature) {
                liveStartSubscription.rooms = rooms;
                liveStartSubscription.roomKeysByMember = roomKeysByMember;
                return;
            }
            if (!rooms.size) { stopLiveStartSubscription(); return; }
            const previous = liveStartSubscription;
            const state = { id: `live_start_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                account, signature, rooms, roomKeysByMember, accepted: new Set(), status: 'connecting' };
            liveStartSubscription = state;
            updateAutoLiveRecordUi();
            void ipcRenderer.invoke('configure-live-start', {
                requestId: state.id, rooms: [...rooms.values()]
            }).then(result => {
                if (result?.success !== true) throw new Error('订阅直播通知失败');
            }).catch(() => {
                if (liveStartSubscription !== state) return;
                stopLiveStartSubscription();
                if (previous) void ipcRenderer.invoke('disconnect-live-start', { requestId: previous.id }).catch(() => {});
            });
        }

        function refreshLiveStartScope(account) {
            const now = Date.now();
            if (!getMemberData?.()?.length && now >= account.nextMemberLoadAt && typeof loadMemberData === 'function') {
                account.nextMemberLoadAt = now + 60000;
                void Promise.resolve().then(() => loadMemberData()).then(() => syncLiveStartSubscription(account)).catch(() => {});
            }
            syncLiveStartSubscription(account);
        }

        function refreshLiveRecordMonitoring() {
            const account = syncLiveRecordAccount();
            if (account) refreshLiveStartScope(account);
            updateAutoLiveRecordUi();
            requestLiveRecordPoll();
        }

        function requestLiveRecordPoll() {
            if (autoLiveRecordPollRunning) livePollRequested = true;
            else scheduleAutoLiveRecordPoll(0);
        }

        window.addEventListener('yaya:account-state-changed', () => {
            invalidateLiveUiRequests();
            refreshLiveRecordMonitoring();
        });
        window.addEventListener('member-data-loaded', () => syncLiveStartSubscription(liveRecordAccount));
        ipcRenderer.on('account-im-status', (_event, payload = {}) => {
            if (!CAN_AUTO_RECORD_LIVE || !autoLiveRecordEnabled) return;
            const account = syncLiveRecordAccount();
            if (!account) return;
            if (payload.status === 'reset') {
                liveRecordGeneration += 1;
                stopLiveStartSubscription();
                liveRecordCheckFailures = 0;
                refreshLiveStartScope(account);
                requestLiveRecordPoll();
            } else if (payload.status === 'connected') {
                if (liveStartSubscription?.status !== 'connected') {
                    stopLiveStartSubscription();
                    refreshLiveStartScope(account);
                    requestLiveRecordPoll();
                }
            } else if (liveStartSubscription) {
                liveStartSubscription.accepted.clear();
                liveStartSubscription.status = 'disconnected';
                requestLiveRecordPoll();
            }
            updateAutoLiveRecordUi();
        });

        ipcRenderer.on('live-start-status', (_event, payload = {}) => {
            const state = liveStartSubscription;
            if (!state || payload.requestId !== state.id || getSafeToken() !== state.account.token) return;
            state.status = payload.status;
            state.accepted = new Set(payload.status === 'connected'
                ? (payload.accepted || []).map(room => `${room.serverId}:${room.channelId}`) : []);
            if (payload.status === 'connected' || payload.status === 'disconnected') requestLiveRecordPoll();
            updateAutoLiveRecordUi();
        });

        ipcRenderer.on('live-start-message', (_event, payload = {}) => {
            const state = liveStartSubscription;
            const message = payload.message;
            if (!state || !message || payload.requestId !== state.id || getSafeToken() !== state.account.token
                || !state.rooms.has(`${message.serverId}:${message.channelId}`) || !/^\d{1,32}$/.test(message.liveId)) return;
            const now = Date.now();
            const timestamp = Number(message.time);
            if (timestamp > 0 && now - (timestamp < 1e12 ? timestamp * 1000 : timestamp) > 120000) return;
            if (liveStartHints.has(message.liveId) || autoLiveRecordHandledLiveIds.has(message.liveId)) return;
            liveStartHints.set(message.liveId, now + LIVE_START_HINT_TTL_MS);
            requestLiveRecordPoll();
        });

        function scheduleAutoLiveRecordPoll(delay = getLiveRecordPollInterval()) {
            if (autoLiveRecordPollTimer) clearTimeout(autoLiveRecordPollTimer);
            autoLiveRecordPollTimer = null;
            if (!CAN_AUTO_RECORD_LIVE || !autoLiveRecordEnabled || delay === null) return;
            autoLiveRecordPollTimer = setTimeout(() => {
                autoLiveRecordPollTimer = null;
                pollAutoLiveRecordMembers();
            }, Math.max(0, Number(delay) || 0));
        }

        function getLiveRecordPollInterval() {
            if (!autoLiveRecordMembers.length || !liveRecordAccount) return null;
            if (liveRecordCheckFailures) return liveRecordRetryDelay();
            const interrupted = [...autoLiveRecordRetryState.keys()].some(liveId =>
                ![...autoLiveRecordTasks.values()].some(task => task.liveId === liveId));
            const missing = [...autoLiveRecordTasks.values()].some(task => autoLiveRecordMissingPolls.get(task.liveId) > 0);
            if (interrupted || missing || liveStartHints.size) return AUTO_LIVE_RECORD_POLL_INTERVAL_MS;
            const state = liveStartSubscription;
            const covered = state && autoLiveRecordMembers.every(member => {
                const keys = state.roomKeysByMember.get(member.id);
                return keys?.size && [...keys].every(key => state.accepted.has(key));
            });
            return covered ? null : AUTO_LIVE_RECORD_POLL_INTERVAL_MS;
        }

        function scheduleAutoLiveRecordRetry(task, { resume = false } = {}) {
            if (!task?.liveId) return;
            const previous = autoLiveRecordRetryState.get(task.liveId);
            const stableRecordingMs = task.recordingStartedAt
                ? Date.now() - task.recordingStartedAt
                : 0;
            const attempts = Math.min((stableRecordingMs >= 120_000 ? 0 : (previous?.attempts || 0)) + 1, 5);
            const baseDelay = 3_000;
            const maxDelay = 30_000;
            const delay = Math.min(baseDelay * (2 ** (attempts - 1)), maxDelay);
            autoLiveRecordRetryState.set(task.liveId, {
                attempts,
                nextRetryAt: Date.now() + delay,
                sessionId: task.sessionId,
                fileName: task.fileName,
                memberId: task.memberId
            });
            autoLiveRecordHandledLiveIds.delete(task.liveId);
            scheduleAutoLiveRecordPoll(delay);
            if (resume) {
                showAutoLiveRecordToast(`直播流中断，内容已暂存，${Math.ceil(delay / 1000)} 秒后继续录入同一文件`);
            }
        }

        async function startAutoLiveRecordTask(member, liveItem, isCurrent) {
            if (!isCurrent()) return;
            const liveId = String(liveItem?.liveId || '').trim();
            if (!liveId || autoLiveRecordHandledLiveIds.has(liveId) || autoLiveRecordTasks.has(member.id)) return;
            const retryState = autoLiveRecordRetryState.get(liveId);
            if (retryState && Date.now() < retryState.nextRetryAt) return;

            autoLiveRecordHandledLiveIds.add(liveId);
            try {
                const result = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({ liveId }));
                const detail = result?.status === 200 && result?.content ? result.content : null;
                const streamUrl = detail?.playStreamPath || detail?.streamPath || detail?.playUrl || '';
                if (!streamUrl) throw new Error('没有可用的直播流');
                if (!isCurrent()) return;
                if (!autoLiveRecordMembers.some(item => item.id === member.id)) {
                    autoLiveRecordHandledLiveIds.delete(liveId);
                    return;
                }

                const item = {
                    ...liveItem,
                    ...detail,
                    userInfo: detail?.userInfo || liveItem?.userInfo || {
                        userId: member.id,
                        nickname: member.name
                    },
                    nickname: getAutoLiveRecordItemName(detail || liveItem, member.name)
                };
                const startedAt = new Date();
                const fileName = retryState?.fileName || buildLiveRecordFileName(item, startedAt);
                const sessionId = retryState?.sessionId || `auto_live_session_${liveId}_${Date.now()}`;
                const taskId = `auto_live_record_${member.id}_${Date.now()}`;
                const task = { taskId, memberId: member.id, liveId, fileName, sessionId, recordingStartedAt: 0 };
                autoLiveRecordTasks.set(member.id, task);
                autoLiveRecordTaskOwners.set(taskId, member.id);
                ensureLiveRecordDownloadTask(taskId, fileName, '自动录制中，正在连接直播流...');
                updateAutoLiveRecordUi();
                renderAutoLiveRecordMembers();
                ipcRenderer.send('start-record', {
                    url: streamUrl,
                    taskId,
                    savePath: readStringSetting('yaya_path_live', ''),
                    fileName,
                    recordingSessionId: sessionId
                });
                showAutoLiveRecordToast(`已开始自动录制：${member.name}`);
                return true;
            } catch (error) {
                if (!isCurrent()) return;
                autoLiveRecordHandledLiveIds.delete(liveId);
                console.error(`自动录制 ${member.name} 启动失败:`, error);
                return false;
            }
        }

        async function pollAutoLiveRecordMembers() {
            if (!CAN_AUTO_RECORD_LIVE || !autoLiveRecordEnabled || autoLiveRecordPollRunning) return;
            const account = syncLiveRecordAccount();
            if (account) refreshLiveStartScope(account);
            if (autoLiveRecordMembers.length === 0 || !account) {
                liveStartHints.clear();
                scheduleAutoLiveRecordPoll(null);
                return;
            }

            const generation = liveRecordGeneration;
            const isCurrent = () => autoLiveRecordEnabled && liveRecordAccount === account
                && liveRecordGeneration === generation && getSafeToken() === account.token;
            for (const [liveId, expires] of liveStartHints) {
                if (expires <= Date.now()) liveStartHints.delete(liveId);
            }
            autoLiveRecordPollRunning = true;
            let needsStreamRetry = false;
            let checkFailed = false;
            try {
                const result = await fetchPocketAPI('/live/api/v1/live/getLiveList', JSON.stringify({
                    debug: true,
                    next: 0,
                    groupId: 0,
                    record: false
                }));
                if (!isCurrent()) return;
                if (!result || result.status !== 200 || !result.content || !Array.isArray(result.content.liveList)) {
                    throw new Error(result?.message || '直播列表获取失败');
                }

                const liveList = result.content.liveList;
                const currentLiveIds = new Set(liveList.map(item => String(item?.liveId || '').trim()).filter(Boolean));
                const knownLiveIds = new Set([
                    ...autoLiveRecordHandledLiveIds,
                    ...autoLiveRecordRetryState.keys(),
                    ...Array.from(autoLiveRecordTasks.values(), task => task.liveId)
                ]);
                knownLiveIds.forEach(liveId => {
                    if (currentLiveIds.has(liveId)) {
                        autoLiveRecordMissingPolls.delete(liveId);
                        return;
                    }
                    autoLiveRecordMissingPolls.set(liveId, (autoLiveRecordMissingPolls.get(liveId) || 0) + 1);
                });

                const selectedMembers = new Map(autoLiveRecordMembers.map(member => [member.id, member]));
                const selectedLiveItems = new Map();
                liveList.forEach(item => {
                    const memberId = getAutoLiveRecordItemMemberId(item);
                    if (!selectedMembers.has(memberId)) liveStartHints.delete(String(item?.liveId || '').trim());
                    if (memberId && selectedMembers.has(memberId) && !selectedLiveItems.has(memberId)) {
                        selectedLiveItems.set(memberId, item);
                    }
                });

                autoLiveRecordTasks.forEach((task, memberId) => {
                    const liveItem = selectedLiveItems.get(memberId);
                    const liveMissing = !liveItem || String(liveItem.liveId || '') !== task.liveId;
                    if (liveMissing && (autoLiveRecordMissingPolls.get(task.liveId) || 0) >= 3) {
                        ipcRenderer.send('stop-record', {
                            taskId: task.taskId,
                            fileName: task.fileName
                        });
                    }
                });

                autoLiveRecordRetryState.forEach((retryState, liveId) => {
                    if ((autoLiveRecordMissingPolls.get(liveId) || 0) < 3) return;
                    ipcRenderer.send('finalize-live-record-session', {
                        sessionId: retryState.sessionId,
                        reason: 'live-ended'
                    });
                    autoLiveRecordRetryState.delete(liveId);
                    autoLiveRecordHandledLiveIds.delete(liveId);
                    autoLiveRecordMissingPolls.delete(liveId);
                });

                for (const [memberId, liveItem] of selectedLiveItems) {
                    const member = selectedMembers.get(memberId);
                    const started = await startAutoLiveRecordTask(member, liveItem, isCurrent);
                    if (!isCurrent()) return;
                    if (started === false) checkFailed = true;
                    const liveId = String(liveItem.liveId || '').trim();
                    if (autoLiveRecordHandledLiveIds.has(liveId)) liveStartHints.delete(liveId);
                    else needsStreamRetry = true;
                }
            } catch (error) {
                if (!isCurrent()) return;
                checkFailed = true;
                needsStreamRetry = true;
                console.warn('自动录制直播状态检测失败:', error);
            } finally {
                autoLiveRecordPollRunning = false;
                if (isCurrent()) liveRecordCheckFailures = checkFailed ? liveRecordCheckFailures + 1 : 0;
                updateAutoLiveRecordUi();
                const immediate = livePollRequested;
                livePollRequested = false;
                if (immediate) scheduleAutoLiveRecordPoll(0);
                else scheduleAutoLiveRecordPoll(liveRecordCheckFailures ? liveRecordRetryDelay()
                    : needsStreamRetry ? AUTO_LIVE_RECORD_POLL_INTERVAL_MS : getLiveRecordPollInterval());
            }
        }

        ipcRenderer.on('record-status', (event, data) => {
            const autoMemberId = data ? autoLiveRecordTaskOwners.get(data.taskId) : '';
            if (!autoMemberId || data.status !== 'recording') return;
            const task = autoLiveRecordTasks.get(autoMemberId);
            if (task?.taskId === data.taskId) {
                task.recordingStartedAt = Date.now();
                const previous = autoLiveRecordRetryState.get(task.liveId);
                autoLiveRecordRetryState.set(task.liveId, {
                    attempts: previous?.attempts || 0,
                    nextRetryAt: 0,
                    sessionId: task.sessionId,
                    fileName: task.fileName,
                    memberId: task.memberId
                });
            }
        });

        ipcRenderer.on('download-status', (event, data) => {
            const autoMemberId = data ? autoLiveRecordTaskOwners.get(data.taskId) : '';
            if (autoMemberId) {
                const isAutoTerminal = data.status === 'success'
                    || data.status === 'error'
                    || data.status === 'canceled';
                if (isAutoTerminal) {
                    const task = autoLiveRecordTasks.get(autoMemberId);
                    if (task?.taskId === data.taskId) {
                        if (data.resumeRecording === true) {
                            scheduleAutoLiveRecordRetry(task, { resume: true });
                        } else if (data.status === 'error') {
                            scheduleAutoLiveRecordRetry(task);
                        } else {
                            autoLiveRecordRetryState.delete(task.liveId);
                        }
                    }
                    if (task?.taskId === data.taskId) autoLiveRecordTasks.delete(autoMemberId);
                    autoLiveRecordTaskOwners.delete(data.taskId);
                    updateAutoLiveRecordUi();
                    renderAutoLiveRecordMembers();
                }
            }
            if (!data || data.taskId !== currentRecordTaskId) return;
            const isTerminal = data.status === 'success'
                || data.status === 'error'
                || data.status === 'canceled';
            if (!isTerminal) {
                const startDisplay = getClipElement('start-display', 'clip-start-display');
                if (startDisplay && data.msg) startDisplay.textContent = window.YayaRendererUtils.t(`状态: ${data.msg}`);
                return;
            }

            currentRecordTaskId = null;
            currentRecordStartedAt = null;
            currentRecordFileName = '';
            clipStartTime = null;
            clipEndTime = null;
            updateClipUI();
            const art = getCurrentArt();
            if (art?.notice && data.msg) art.notice.show = data.msg;
        });

        function setClipStartFromTimeline(time) {
            const art = getCurrentArt();
            clipStartTime = time;
            if (clipEndTime !== null && clipEndTime <= clipStartTime) clipEndTime = null;
            updateClipUI();
            if (art && art.notice) art.notice.show = '已打点起点';
            if (art) art.seek = time;
        }

        function setClipEndFromTimeline(time) {
            const art = getCurrentArt();
            if (clipStartTime === null) {
                if (art && art.notice) art.notice.show = '请先设置起点';
                return;
            }
            if (time <= clipStartTime) {
                if (art && art.notice) art.notice.show = '终点必须晚于起点';
                return;
            }
            clipEndTime = time;
            updateClipUI();
            if (art && art.notice) art.notice.show = '已打点终点';
            if (art) art.seek = time;
        }

        function setClipStart() {
            const art = getCurrentArt();
            const currentMode = getClipMode();
            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;

            if (!art) return;

            if (currentMode === 'live') {
                if (currentRecordTaskId) {
                    if (art.notice) art.notice.show = '录制正在进行中，请先结束当前片段';
                    return;
                }

                currentRecordTaskId = `rec_${Date.now()}`;
                currentRecordStartedAt = new Date();
                currentRecordFileName = buildLiveClipFileName(currentPlayingItem, currentRecordStartedAt);
                const customSavePath = readStringSetting('yaya_path_clip', '');

                ipcRenderer.send('start-record', {
                    url: art.option.url,
                    taskId: currentRecordTaskId,
                    savePath: customSavePath,
                    fileName: currentRecordFileName
                });
                ensureLiveRecordDownloadTask(
                    currentRecordTaskId,
                    currentRecordFileName,
                    '正在录制直播...'
                );

                const startDisplay = getClipElement('start-display', 'clip-start-display');
                if (startDisplay) startDisplay.textContent = window.YayaRendererUtils.t('状态: 正在录制...');
                if (art.notice) art.notice.show = '后台录制已开启';
                return;
            }

            clipStartTime = art.currentTime;
            if (clipEndTime !== null && clipEndTime <= clipStartTime) clipEndTime = null;
            updateClipUI();
            if (art.notice) art.notice.show = '已设定起点';
        }

        function setClipEnd() {
            const art = getCurrentArt();
            const currentMode = getClipMode();
            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;

            if (!art) return;

            if (currentMode === 'live') {
                if (!currentRecordTaskId) {
                    if (art.notice) art.notice.show = '请先点击开始录制';
                    return;
                }

                const startedAt = currentRecordStartedAt instanceof Date ? currentRecordStartedAt : new Date();
                const fileName = currentRecordFileName || buildLiveClipFileName(currentPlayingItem, startedAt);
                ipcRenderer.send('stop-record', {
                    taskId: currentRecordTaskId,
                    fileName
                });
                ensureLiveRecordDownloadTask(currentRecordTaskId, fileName, '正在停止录制...');

                currentRecordTaskId = null;
                currentRecordStartedAt = null;
                currentRecordFileName = '';
                clipStartTime = null;
                clipEndTime = null;
                updateClipUI();
                return;
            }

            if (clipStartTime === null) {
                if (art.notice) art.notice.show = '请先设置起点';
                return;
            }

            const current = art.currentTime;
            if (current <= clipStartTime) {
                if (art.notice) art.notice.show = '终点必须晚于起点';
                return;
            }

            clipEndTime = current;
            updateClipUI();
            if (art.notice) art.notice.show = '已设定终点';
        }

        async function resolveFreshClipUrl(currentPlayingItem, fallbackUrl) {
            const liveId = currentPlayingItem?.liveId;
            if (!liveId) return fallbackUrl;

            try {
                const currentMode = typeof getCurrentMode === 'function' ? getCurrentMode() : '';
                const isMeet48 = currentMode === 'meet-vod' || currentPlayingItem?.source === 'meet48';
                const response = isMeet48
                    ? await ipcRenderer.invoke('fetch-meet48-live-one', { liveId })
                    : await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({ liveId }));
                const content = response?.content;

                if (isMeet48) {
                    return content?.playStreamPath
                        || content?.streamPath
                        || content?.playStreams?.find(item => item?.streamPath)?.streamPath
                        || fallbackUrl;
                }

                return content?.playStreamPath || fallbackUrl;
            } catch (error) {
                window.YayaRendererUtils.reportIgnoredError(error, 'live-tools:refresh-clip-url');
                return fallbackUrl;
            }
        }

        async function executeClip() {
            const art = getCurrentArt();
            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;
            if (!art || clipStartTime === null || clipEndTime === null) return;

            if (clipTaskPreparing) {
                if (art.notice) art.notice.show = '正在准备上一个切片任务';
                return;
            }

            const duration = clipEndTime - clipStartTime;
            if (duration <= 0.5) {
                if (art.notice) art.notice.show = '片段太短';
                return;
            }

            clipTaskPreparing = true;
            if (art.notice) art.notice.show = '正在获取最新视频地址...';
            const clipUrl = await resolveFreshClipUrl(currentPlayingItem, art.option.url);
            clipTaskPreparing = false;

            if (!clipUrl) {
                if (art.notice) art.notice.show = '无法获取视频地址，请重新打开回放';
                return;
            }

            const customSavePath = readStringSetting('yaya_path_clip', '');
            const nickname = currentPlayingItem?.userInfo?.nickname || currentPlayingItem?.nickname || '未知成员';
            const baseTimeNum = Number(currentPlayingItem?.startTime || currentPlayingItem?.ctime || Date.now());
            const d = new Date(baseTimeNum);
            const pad = (n) => String(n).padStart(2, '0');
            const streamStartDateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
            const formatRelativeTime = (seconds) => {
                const ts = Math.floor(seconds);
                const h = Math.floor(ts / 3600);
                const m = Math.floor((ts % 3600) / 60);
                const sec = ts % 60;
                return h > 0 ? `${pad(h)}.${pad(m)}.${pad(sec)}` : `${pad(m)}.${pad(sec)}`;
            };
            const startStrFile = formatRelativeTime(clipStartTime);
            const endStrFile = formatRelativeTime(clipEndTime);
            const formatRelativeTimeUI = (seconds) => {
                const ts = Math.floor(seconds);
                const m = Math.floor(ts / 60);
                const sec = ts % 60;
                return `${pad(m)}:${pad(sec)}`;
            };

            const fileName = `回放切片_【${nickname}】${streamStartDateStr}_${startStrFile}~${endStrFile}`;
            const displayName = `回放切片_【${nickname}】${streamStartDateStr}_${formatRelativeTimeUI(clipStartTime)}~${formatRelativeTimeUI(clipEndTime)}`;
            const taskId = `clip_${Date.now()}`;
            const downloadList = document.getElementById('downloadList');

            if (downloadList) {
                if (downloadList.innerText.includes('暂无下载任务')) downloadList.replaceChildren();
                downloadList.insertAdjacentHTML('afterbegin', `
                <div class="download-item" id="${taskId}" data-task-type="clip">
                    <div class="download-title-row">
                        <div class="download-title-line" title="${displayName}">${displayName}</div>
                        <button class="btn-cancel" onclick="cancelDownloadTask('${taskId}')">取消</button>
                    </div>
                    <div class="download-detail-row">
                        <span>视频切片</span>
                        <b class="download-percent">0%</b>
                    </div>
                    <div class="progress-container" style="margin: 5px 0;">
                        <div class="progress-fill"></div>
                    </div>
                    <span class="download-status-text">正在准备切片...</span>
                </div>
            `);
            }

            if (art.notice) art.notice.show = '切片任务已开始';
            ipcRenderer.send('clip-vod', {
                url: clipUrl,
                fileName,
                startTime: clipStartTime,
                duration,
                taskId,
                savePath: customSavePath
            });
        }

        autoLiveRecordEnabled = CAN_AUTO_RECORD_LIVE
            && readJsonSetting(AUTO_LIVE_RECORD_ENABLED_KEY, false) === true;
        autoLiveRecordMembers = normalizeStoredAutoLiveRecordMembers(
            readJsonSetting(AUTO_LIVE_RECORD_MEMBERS_KEY, [])
        );
        document.addEventListener('click', event => {
            const results = document.getElementById('auto-live-record-member-results');
            const input = document.getElementById('auto-live-record-member-search');
            if (results && input && event.target !== input && !results.contains(event.target)) {
                results.style.display = 'none';
            }
        }, true);
        setTimeout(() => {
            updateAutoLiveRecordUi();
            if (autoLiveRecordEnabled) refreshLiveRecordMonitoring();
        }, 1200);

        return {
            closeAutoLiveRecordModal,
            closeLiveRankModal,
            closeLiveAnnouncement,
            executeClip,
            fetchLiveRank,
            openAutoLiveRecordModal,
            openLiveRankPanel,
            refreshLiveAnnouncement,
            resetClipTool,
            searchAutoLiveRecordMembers,
            setClipEnd,
            setClipEndFromTimeline,
            setClipStart,
            setClipStartFromTimeline,
            toggleAutoLiveRecording,
            toggleRankPanel,
            updateClipUI
        };
    };
}());
