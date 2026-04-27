(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createReplayDownloadFeature = function createReplayDownloadFeature(deps) {
        const {
            fetchPocketAPI,
            getCurrentMode,
            getDownloadStatus,
            getFilteredVODList,
            getMemberIdFromQuery,
            getPlayLiveStream,
            getPreferredExternalPlayerName,
            getVodState,
            https,
            ipcRenderer,
            openExternal,
            openMediaInExternalPlayer,
            renderVODListUI,
            setDownloadStatus,
            deleteDownloadStatus,
            showToast,
            switchView,
            fetchVODPageInternal
        } = deps;

        function readStringSetting(key, fallbackValue = '') {
            if (typeof window.readStoredStringSetting === 'function') {
                return window.readStoredStringSetting(key, fallbackValue);
            }
            const legacyValue = localStorage.getItem(key);
            return legacyValue === null ? fallbackValue : String(legacyValue);
        }

        function fetchDanmuNative(url) {
            return new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => resolve(data));
                }).on('error', (error) => reject(error));
            });
        }

        async function directToPotPlayer(e, liveId) {
            e.stopPropagation();
            e.target.style.cursor = 'wait';

            const titleEl = document.getElementById('live-view-title') || document.getElementById('live-modal-title');
            const originalTitle = titleEl ? titleEl.textContent : '';

            if (titleEl) titleEl.textContent = '⌛ 正在解析外部播放器地址...';

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({ liveId }));
                if (res && res.status === 200 && res.content && res.content.playStreamPath) {
                    if (titleEl) titleEl.textContent = `正在唤起 ${getPreferredExternalPlayerName()}...`;
                    const opened = await openMediaInExternalPlayer(res.content.playStreamPath, { silent: true });
                    if (!opened && titleEl) {
                        titleEl.textContent = `❌ 无法唤起 ${getPreferredExternalPlayerName()}`;
                    }
                } else if (titleEl) {
                    titleEl.textContent = '❌ 无法获取流地址 (可能已失效)';
                }
            } catch (err) {
                if (titleEl) titleEl.textContent = '❌ 网络请求失败';
            } finally {
                e.target.style.cursor = 'pointer';
                if (titleEl) {
                    setTimeout(() => {
                        if (document.body.contains(titleEl)) {
                            titleEl.textContent = originalTitle || (getCurrentMode() === 'live' ? '正在直播' : '录播回放');
                        }
                    }, 2000);
                }
            }
        }

        function openInBrowser(url) {
            try {
                openExternal(url);
            } catch (e) {
                window.open(url, '_blank');
            }
        }

        function playArchiveFromMessage(liveId, nickname, timeStr, title) {
            switchView('media', 'vod');

            let ts = new Date(timeStr).getTime();
            if (Number.isNaN(ts)) ts = 0;

            const temp = {
                liveId,
                userInfo: {
                    nickname
                },
                title: title || '直播回放',
                startTime: ts,
                ctime: ts,
                liveType: 1
            };

            setTimeout(() => {
                const playLiveStream = getPlayLiveStream();
                if (typeof playLiveStream === 'function') {
                    playLiveStream(temp, 'vod');
                }
            }, 300);
        }

        async function matchReplayByTime(memberName, timeStr) {
            switchView('media', 'vod');

            const filterInput = document.getElementById('vod-member-filter');
            if (filterInput) {
                filterInput.value = getMemberIdFromQuery(memberName) || memberName;
            }

            const vodState = getVodState();
            if (vodState) {
                vodState.currentPage = 1;
            }

            const loadingDiv = document.getElementById('vod-loading');
            if (loadingDiv) loadingDiv.style.display = 'block';

            if (vodState) {
                vodState.list = [];
                vodState.nextPageTokens[vodState.currentGroup] = 0;
                vodState.hasMore = true;
                vodState.searchPageToken = 0;
                vodState.isSearchActive = true;
            }

            const targetTime = new Date(timeStr).getTime();
            if (Number.isNaN(targetTime)) {
                showToast('消息时间格式无法解析。');
                if (loadingDiv) loadingDiv.style.display = 'none';
                return;
            }

            let found = false;
            let pageCount = 0;

            while (vodState && vodState.hasMore && !found && vodState.isSearchActive) {
                pageCount += 1;
                if (loadingDiv) {
                    loadingDiv.innerHTML = `🔍 正在深度搜索第 ${pageCount} 页 请耐心等待<br><span style="font-size:12px;color:#999">目标: ${timeStr}</span>`;
                }

                await fetchVODPageInternal();
                const currentList = getFilteredVODList();

                let bestMatch = null;
                let minDiff = Infinity;
                let oldest = Infinity;

                for (const item of currentList) {
                    const vodTime = parseInt(item.startTime || item.ctime, 10);
                    if (!vodTime) continue;

                    if (vodTime < oldest) oldest = vodTime;
                    const diff = Math.abs(vodTime - targetTime);
                    if (diff < 300000 && diff < minDiff) {
                        minDiff = diff;
                        bestMatch = item;
                    }
                }

                if (bestMatch) {
                    const playLiveStream = getPlayLiveStream();
                    if (typeof playLiveStream === 'function') {
                        playLiveStream(bestMatch, 'vod');
                    }
                    found = true;
                    if (loadingDiv) loadingDiv.style.display = 'none';
                    break;
                }

                if (oldest < targetTime - 86400000 && oldest !== Infinity) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (!found && vodState && vodState.isSearchActive) {
                if (loadingDiv) loadingDiv.innerText = `未找到匹配回放 (已搜索 ${pageCount} 页)`;
                renderVODListUI();
            }

            if (vodState) {
                vodState.isSearchActive = false;
            }
        }

        async function handleDownloadDanmu(event, item) {
            event.stopPropagation();
            const btn = event.target;
            const originalText = btn.textContent;

            if (btn.disabled) return;

            btn.textContent = '获取中...';
            btn.disabled = true;

            const nickname = item.userInfo ? item.userInfo.nickname : (item.nickname || '未知成员');

            let timeStr = '00000000_00.00.00';
            const rawTime = item.startTime || item.ctime;
            if (rawTime) {
                const d = new Date(Number(rawTime));
                const pad = (n) => String(n).padStart(2, '0');
                const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
                const timePart = `${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
                timeStr = `${datePart}_${timePart}`;
            }

            const fileName = `【${nickname}】${timeStr}.lrc`;
            const customSavePath = readStringSetting('yaya_path_danmu', '');

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({
                    liveId: item.liveId
                }));

                if (res.status === 200 && res.content && res.content.msgFilePath) {
                    let danmuUrl = res.content.msgFilePath;
                    if (danmuUrl.startsWith('http://')) {
                        danmuUrl = danmuUrl.replace('http://', 'https://');
                    }

                    btn.textContent = '下载中...';
                    ipcRenderer.send('download-danmu', {
                        url: danmuUrl,
                        fileName,
                        savePath: customSavePath
                    });

                    window.lastDanmuBtn = btn;
                    window.lastDanmuBtnOriginalText = originalText;
                } else {
                    showToast('该录播没有弹幕文件 (可能已过期或未生成)');
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            } catch (e) {
                console.error(e);
                showToast('获取弹幕地址失败');
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }

        async function handleDownloadVOD(event, item) {
            if (event) event.stopPropagation();
            const btn = event.currentTarget;
            const liveId = item.liveId;

            if (getDownloadStatus(liveId) === 'downloading' || getDownloadStatus(liveId) === 'success') return;

            setDownloadStatus(liveId, 'downloading');
            btn.textContent = '下载中';
            btn.className = `btn btn-secondary btn-downloading vod-btn-${liveId}`;
            btn.disabled = true;

            const nickname = item.userInfo ? item.userInfo.nickname : (item.nickname || '未知成员');
            const title = item.liveTitle || item.title || '无标题';

            let timeLabel = '未知时间';
            let fileTimestamp = '';
            const rawTime = item.startTime || item.ctime;
            if (rawTime) {
                const d = new Date(Number(rawTime));
                const pad = (n) => String(n).padStart(2, '0');
                timeLabel = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                fileTimestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
            }

            const taskId = `task_${Date.now()}`;
            const downloadList = document.getElementById('downloadList');
            if (downloadList && downloadList.innerText.includes('暂无下载任务')) {
                downloadList.innerHTML = '';
            }

            if (downloadList) {
                downloadList.insertAdjacentHTML('afterbegin', `<div class="download-item" id="${taskId}" data-liveid="${liveId}"><div class="download-title-row"><div class="download-title-line" title="${title}" style="flex:1;">${title}</div><button class="btn-cancel" onclick="cancelDownloadTask('${taskId}')">取消</button></div><div class="download-detail-row"><span>${nickname}</span><b class="download-percent">0%</b></div><div class="download-detail-row"><span>${timeLabel}</span></div><div class="progress-container" style="margin: 5px 0;"><div class="progress-fill"></div></div><span class="download-status-text">正在请求下载地址...</span></div>`);
            }

            const customSavePath = readStringSetting('yaya_path_video', '');

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({ liveId }));
                if (res?.status === 200 && res.content?.playStreamPath) {
                    const safeName = `【${nickname}】${fileTimestamp}`.replace(/[\\/:*?"<>|]/g, '_');
                    ipcRenderer.send('download-vod', {
                        url: res.content.playStreamPath,
                        fileName: safeName,
                        taskId,
                        savePath: customSavePath
                    });
                } else {
                    setDownloadStatus(liveId, 'error');
                    btn.textContent = '视频下载';
                    btn.className = `btn btn-secondary vod-btn-${liveId}`;
                    btn.disabled = false;
                    showToast('无法获取下载地址');
                }
            } catch (err) {
                setDownloadStatus(liveId, 'error');
                btn.textContent = '视频下载';
                btn.className = `btn btn-secondary vod-btn-${liveId}`;
                btn.disabled = false;
            }
        }

        function bindDownloadIpcEvents() {
            if (window.__yayaReplayDownloadEventsBound) return;
            window.__yayaReplayDownloadEventsBound = true;

            ipcRenderer.on('danmu-download-reply', (event, data) => {
                if (!window.lastDanmuBtn) return;

                if (data.success) {
                    window.lastDanmuBtn.textContent = '已保存';
                    window.lastDanmuBtn.classList.remove('btn-secondary');
                    window.lastDanmuBtn.classList.add('btn-primary');

                    setTimeout(() => {
                        if (window.lastDanmuBtn) {
                            window.lastDanmuBtn.textContent = '弹幕下载';
                            window.lastDanmuBtn.classList.add('btn-secondary');
                            window.lastDanmuBtn.classList.remove('btn-primary');
                            window.lastDanmuBtn.disabled = false;
                        }
                    }, 3000);
                } else {
                    showToast(`下载失败: ${data.msg}`);
                    window.lastDanmuBtn.textContent = window.lastDanmuBtnOriginalText || '弹幕下载';
                    window.lastDanmuBtn.disabled = false;
                }
            });

            ipcRenderer.on('download-progress', (event, data) => {
                const taskEl = document.getElementById(data.taskId);
                if (!taskEl) return;

                const percent = data.percent ? Math.floor(data.percent) : 0;
                const fillEl = taskEl.querySelector('.progress-fill');
                const textEl = taskEl.querySelector('.download-percent');
                const statusTextEl = taskEl.querySelector('.download-status-text');

                if (percent > 0) {
                    textEl.textContent = `${percent}%`;
                    fillEl.style.width = `${percent}%`;
                    if (statusTextEl.textContent.includes('已下载时长')) {
                        statusTextEl.textContent = '正在下载...';
                    }
                } else if (data.timemark) {
                    fillEl.style.width = '100%';
                    fillEl.style.opacity = '0.3';
                    textEl.textContent = '';
                    const cleanTime = data.timemark.split('.')[0];
                    statusTextEl.textContent = `已下载时长: ${cleanTime}`;
                }
            });

            ipcRenderer.on('download-status', (event, data) => {
                const taskEl = document.getElementById(data.taskId);
                if (!taskEl) return;

                const liveId = taskEl.getAttribute('data-liveid');
                const statusText = taskEl.querySelector('.download-status-text');

                if (data.status === 'success') {
                    setDownloadStatus(liveId, 'success');
                } else if (data.status === 'error' || data.status === 'canceled') {
                    setDownloadStatus(liveId, 'error');
                }

                const listBtn = document.querySelector(`.vod-btn-${liveId}`);

                if (data.status === 'success') {
                    statusText.textContent = '完成';
                    statusText.style.color = '#28a745';
                    taskEl.querySelector('.progress-fill').style.background = '#28a745';

                    if (listBtn) {
                        listBtn.textContent = '已完成';
                        listBtn.className = `btn btn-success vod-btn-${liveId}`;
                        listBtn.disabled = true;
                        listBtn.style.opacity = '1';
                        listBtn.blur();
                    }

                    setTimeout(() => {
                        taskEl.style.transition = 'all 0.5s ease';
                        taskEl.style.opacity = '0';
                        setTimeout(() => {
                            taskEl.remove();
                            const downloadList = document.getElementById('downloadList');
                            if (downloadList && downloadList.children.length === 0) {
                                downloadList.innerHTML = '<div style="text-align: center; color: var(--text-sub); font-size: 11px; padding: 10px;">暂无下载任务</div>';
                            }
                        }, 500);
                    }, 1000);
                } else if (data.status === 'error' || data.status === 'canceled') {
                    if (listBtn) {
                        listBtn.textContent = '视频下载';
                        listBtn.className = `btn btn-secondary vod-btn-${liveId}`;
                        listBtn.disabled = false;
                    }

                    if (data.status === 'canceled') {
                        taskEl.remove();
                    } else {
                        statusText.textContent = data.msg || '下载失败';
                        statusText.style.color = '#e81123';
                    }

                    deleteDownloadStatus(liveId);
                }
            });
        }

        bindDownloadIpcEvents();

        return {
            directToPotPlayer,
            fetchDanmuNative,
            handleDownloadDanmu,
            handleDownloadVOD,
            matchReplayByTime,
            openInBrowser,
            playArchiveFromMessage
        };
    };
}());
