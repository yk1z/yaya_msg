(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createLiveToolsFeature = function createLiveToolsFeature(deps) {
        const {
            fetchPocketAPI,
            getAppToken,
            getArt,
            getCurrentMode,
            getCurrentPlayingItem,
            getLiveAnnouncementDismissed,
            setLiveAnnouncementDismissed,
            getDp,
            ipcRenderer
        } = deps;

        let clipStartTime = null;
        let clipEndTime = null;
        let currentRecordTaskId = null;
        let liveRecordCount = 0;

        function readStringSetting(key, fallbackValue = '') {
            if (typeof window.readStoredStringSetting === 'function') {
                return window.readStoredStringSetting(key, fallbackValue);
            }
            const legacyValue = localStorage.getItem(key);
            return legacyValue === null ? fallbackValue : String(legacyValue);
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

        function getCurrentDp() {
            return typeof getDp === 'function' ? getDp() : null;
        }

        async function refreshLiveAnnouncement(btnElement) {
            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;
            if (!currentPlayingItem || !currentPlayingItem.liveId || !btnElement) return;

            const originalText = btnElement.innerText;
            btnElement.innerText = '...';
            btnElement.disabled = true;

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({
                    liveId: currentPlayingItem.liveId
                }));

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
                    btnElement.innerText = '❌';
                }
            } catch (e) {
                console.error('刷新公告失败:', e);
                btnElement.innerText = '❌';
            }

            setTimeout(() => {
                btnElement.innerText = originalText || '↻';
                btnElement.disabled = false;
            }, 2000);
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

        async function fetchLiveRank(liveIdParam) {
            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;
            const liveId = liveIdParam || (currentPlayingItem ? currentPlayingItem.liveId : null);
            if (!liveId) return;

            const listContainer = document.getElementById('live-rank-list');
            if (!listContainer) return;

            listContainer.innerHTML = '<div style="text-align: center; color: var(--text-sub); font-size: 12px; padding: 20px;"><div class="spinner" style="width:20px;height:20px;margin:0 auto 10px;"></div>正在加载数据...</div>';

            try {
                const res = await ipcRenderer.invoke('fetch-live-rank', {
                    token: getSafeToken(),
                    pa: getSafePa(),
                    liveId
                });

                if (res.success && res.content && res.content.data) {
                    const rankData = res.content.data;

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

                        html += `
                <div style="display: flex; align-items: center; padding: 10px 8px; border-bottom: 1px solid rgba(128,128,128,0.1); transition: background 0.2s; cursor: default;" onmouseover="this.style.background='var(--chip-hover)'" onmouseout="this.style.background='transparent'">
                    <div class="rank-num ${rankClass}" style="width: 24px; height: 24px; min-width: 24px; font-size: 11px; margin-right: 12px; margin-bottom: 0;">${index + 1}</div>
                    <img src="${avatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; margin-right: 12px; border: 1px solid rgba(0,0,0,0.05); flex-shrink: 0;">
                    <div style="flex: 1; font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${isTop3 ? 'bold' : '500'};">
                        ${userName}
                    </div>
                    <div style="font-size: 14px; color: #fa8c16; font-weight: bold; margin-left: 10px; flex-shrink: 0; text-shadow: 0 0 10px rgba(250, 140, 22, 0.1);">
                        ${item.money} <span style="font-size: 11px; color: var(--text-sub); font-weight: normal; opacity: 0.6; margin-left: 2px;">贡献值</span>
                    </div>
                </div>
                `;
                    });
                    listContainer.innerHTML = html;
                } else {
                    listContainer.innerHTML = '<div style="text-align: center; color: var(--text-sub); font-size: 12px; padding: 15px;">获取榜单失败</div>';
                }
            } catch (e) {
                listContainer.innerHTML = `<div style="text-align: center; color: #ff4d4f; font-size: 12px; padding: 15px;">出错了: ${e.message}</div>`;
            }
        }

        function updateClipUI() {
            const startDisplay = document.getElementById('clip-start-display');
            const endDisplay = document.getElementById('clip-end-display');
            const durationDisplay = document.getElementById('clip-duration-display');
            const clipBtn = document.getElementById('btn-do-clip');

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
                    if (durationDisplay) durationDisplay.textContent = `切片时长: ${duration.toFixed(2)}s`;
                    if (clipBtn) clipBtn.disabled = false;
                } else {
                    if (durationDisplay) durationDisplay.textContent = '切片时长: 无效';
                    if (clipBtn) clipBtn.disabled = true;
                }
            } else {
                if (durationDisplay) durationDisplay.textContent = '切片时长: 0s';
                if (clipBtn) clipBtn.disabled = true;
            }
        }

        function resetClipTool() {
            clipStartTime = null;
            clipEndTime = null;
            currentRecordTaskId = null;
            liveRecordCount = 0;
            updateClipUI();
        }

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
                if (art && art.notice) art.notice.show = '❌ 请先设置起点';
                return;
            }
            if (time <= clipStartTime) {
                if (art && art.notice) art.notice.show = '❌ 终点必须晚于起点';
                return;
            }
            clipEndTime = time;
            updateClipUI();
            if (art && art.notice) art.notice.show = '已打点终点';
            if (art) art.seek = time;
        }

        function setClipStart() {
            const art = getCurrentArt();
            const dp = getCurrentDp();
            const currentMode = typeof getCurrentMode === 'function' ? getCurrentMode() : 'live';
            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;

            if (!art && !dp) return;

            if (currentMode === 'live') {
                if (currentRecordTaskId) {
                    if (dp) dp.notice('⚠️ 录制正在进行中，请先结束当前片段');
                    return;
                }

                currentRecordTaskId = `rec_${Date.now()}`;
                const customSavePath = readStringSetting('yaya_path_clip', '');

                ipcRenderer.send('start-record', {
                    url: art.option.url,
                    taskId: currentRecordTaskId,
                    savePath: customSavePath
                });

                const startDisplay = document.getElementById('clip-start-display');
                if (startDisplay) startDisplay.textContent = '🔴 状态: 正在录制...';
                if (dp) dp.notice('🔴 后台录制已开启');
                return;
            }

            clipStartTime = art.currentTime;
            if (clipEndTime !== null && clipEndTime <= clipStartTime) clipEndTime = null;
            updateClipUI();
            if (art.notice) art.notice.show = '已设定起点';
        }

        function setClipEnd() {
            const art = getCurrentArt();
            const dp = getCurrentDp();
            const currentMode = typeof getCurrentMode === 'function' ? getCurrentMode() : 'live';
            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;

            if (!art && !dp) return;

            if (currentMode === 'live') {
                if (!currentRecordTaskId) {
                    if (dp) dp.notice('❌ 请先点击开始录制');
                    return;
                }

                liveRecordCount += 1;
                const nickname = currentPlayingItem?.userInfo?.nickname || currentPlayingItem?.nickname || '未知成员';
                let timeStr = '00000000_00.00.00';
                const rawTime = currentPlayingItem?.startTime || currentPlayingItem?.ctime;

                if (rawTime) {
                    const d = new Date(Number(rawTime));
                    const pad = (n) => String(n).padStart(2, '0');
                    timeStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
                }

                const fileName = `直播切片_【${nickname}】${timeStr}_${liveRecordCount}`;
                ipcRenderer.send('stop-record', {
                    taskId: currentRecordTaskId,
                    fileName
                });

                const downloadList = document.getElementById('downloadList');
                if (downloadList) {
                    if (downloadList.innerText.includes('暂无')) downloadList.innerHTML = '';
                    downloadList.insertAdjacentHTML('afterbegin', `
                    <div class="download-item" id="${currentRecordTaskId}">
                        <div class="download-title-row">
                            <div class="download-title-line" title="${fileName}">${fileName}</div>
                            <button class="btn-cancel" onclick="cancelDownloadTask('${currentRecordTaskId}')">取消</button>
                        </div>
                        <div class="progress-container" style="margin: 5px 0;">
                            <div class="progress-fill" style="width: 100%; opacity: 0.5;"></div>
                        </div>
                        <span class="download-status-text">正在停止并封装视频...</span>
                    </div>
                `);
                }

                const startDisplay = document.getElementById('clip-start-display');
                const endDisplay = document.getElementById('clip-end-display');
                currentRecordTaskId = null;
                clipStartTime = null;
                clipEndTime = null;
                updateClipUI();
                return;
            }

            if (clipStartTime === null) {
                if (art.notice) art.notice.show = '❌ 请先设置起点';
                return;
            }

            const current = art.currentTime;
            if (current <= clipStartTime) {
                if (art.notice) art.notice.show = '❌ 终点必须晚于起点';
                return;
            }

            clipEndTime = current;
            updateClipUI();
            if (art.notice) art.notice.show = '已设定终点';
        }

        function executeClip() {
            const art = getCurrentArt();
            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;
            if (!art || clipStartTime === null || clipEndTime === null) return;

            const duration = clipEndTime - clipStartTime;
            if (duration <= 0.5) {
                if (art.notice) art.notice.show = '❌ 片段太短';
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

            const fileName = `【${nickname}】${streamStartDateStr}~${startStrFile}_${endStrFile}`;
            const displayName = `【${nickname}】${streamStartDateStr}~${formatRelativeTimeUI(clipStartTime)}_${formatRelativeTimeUI(clipEndTime)}`;
            const taskId = `clip_${Date.now()}`;
            const downloadList = document.getElementById('downloadList');

            if (downloadList) {
                if (downloadList.innerText.includes('暂无下载任务')) downloadList.innerHTML = '';
                downloadList.insertAdjacentHTML('afterbegin', `
                <div class="download-item" id="${taskId}">
                    <div class="download-title-row">
                        <div class="download-title-line" title="${displayName}">${displayName}</div>
                        <button class="btn-cancel" onclick="cancelDownloadTask('${taskId}')">取消</button>
                    </div>
                    <div class="download-detail-row">
                        <span>✂️ 视频切片</span>
                        <b class="download-percent">0%</b>
                    </div>
                    <div class="progress-container" style="margin: 5px 0;">
                        <div class="progress-fill"></div>
                    </div>
                    <span class="download-status-text">正在准备切片...</span>
                </div>
            `);
            }

            if (art.notice) art.notice.show = '🚀 切片任务已开始';
            ipcRenderer.send('clip-vod', {
                url: art.option.url,
                fileName,
                startTime: clipStartTime,
                duration,
                taskId,
                savePath: customSavePath
            });
        }

        return {
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
        };
    };
}());
