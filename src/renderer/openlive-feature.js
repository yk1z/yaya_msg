(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createOpenLiveFeature = function createOpenLiveFeature(deps) {
        const {
            getAppToken,
            getMemberData,
            getMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle,
            ipcRenderer,
            resetTimelinePanel,
            resetClipTool,
            setCurrentPlayingItem,
            setReturnToOpenLive,
            startPlayer,
            openMediaInExternalPlayer,
            getPreferredExternalPlayerName,
            showToast
        } = deps;

        let openLiveNextTime = 0;
        let isOpenLiveAutoLoading = false;
        let currentOpenLiveParticipantsRequestId = 0;
        const ENABLE_OPENLIVE_PARTICIPANTS = false;

        function getOpenLiveSearchResultBox() {
            return document.getElementById('openlive-search-results');
        }

        function formatBeijingDateTime(timestamp, withSeconds = false) {
            const date = new Date(Number(timestamp));
            const offset = date.getTimezoneOffset() * 60000;
            const utcTime = date.getTime() + offset;
            const bjTime = new Date(utcTime + 3600000 * 8);
            const pad = value => String(value).padStart(2, '0');
            const dateLabel = `${bjTime.getFullYear()}-${pad(bjTime.getMonth() + 1)}-${pad(bjTime.getDate())}`;
            const timeLabel = withSeconds
                ? `${pad(bjTime.getHours())}:${pad(bjTime.getMinutes())}:${pad(bjTime.getSeconds())}`
                : `${pad(bjTime.getHours())}:${pad(bjTime.getMinutes())}`;

            return { dateLabel, timeLabel };
        }

        function renderOpenLiveSearchResults(matches, resultBox) {
            if (!resultBox) return;

            if (!matches.length) {
                resultBox.style.display = 'none';
                return;
            }

            const html = matches.map(member => {
                const isInactive = member.isInGroup === false;
                const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';
                const colorStyle = typeof getTeamStyle === 'function'
                    ? (getTeamStyle(member.team, isInactive) || '')
                    : '';

                return `<div class="suggestion-item"
                 onclick="selectOpenLiveMember('${member.ownerName}', '${member.id || member.userId}')"
                 style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight:bold; ${baseStyle}">${member.ownerName}</span>
                <span class="team-tag" style="${baseStyle} ${colorStyle}">${member.team}</span>
            </div>`;
            }).join('');

            resultBox.innerHTML = html;
            resultBox.style.display = 'block';
        }

        function handleOpenLiveSearch(keyword) {
            const resultBox = getOpenLiveSearchResultBox();
            if (!resultBox) return;

            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }

            if (!getMemberDataLoaded() && typeof loadMemberData === 'function') {
                loadMemberData();
            }

            const lowerKeyword = keyword.toLowerCase();
            const memberList = Array.isArray(getMemberData()) ? getMemberData() : [];
            const matches = memberList.filter(member => {
                const matchName = String(member.ownerName || '').includes(keyword);
                const pinyin = String(member.pinyin || '');
                const matchPinyin = pinyin.toLowerCase().includes(lowerKeyword);
                const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : '';
                const matchInitials = String(initials).toLowerCase().includes(lowerKeyword);
                return matchName || matchPinyin || matchInitials;
            });

            matches.sort(memberSortLogic);
            renderOpenLiveSearchResults(matches, resultBox);
        }

        function selectOpenLiveMember(name, userId) {
            const inputEl = document.getElementById('openlive-member-input');
            const idEl = document.getElementById('openlive-member-id');
            const resultBox = getOpenLiveSearchResultBox();

            if (inputEl) inputEl.value = name || '';
            if (idEl) idEl.value = userId || '';
            if (resultBox) resultBox.style.display = 'none';
        }

        function setOpenLiveLoadMoreVisible(visible) {
            const loadMoreBtn = document.getElementById('openlive-load-more');
            if (loadMoreBtn) {
                loadMoreBtn.style.display = visible ? 'block' : 'none';
            }
        }

        function setOpenLiveStatusHtml(html) {
            const statusEl = document.getElementById('openlive-status');
            if (statusEl) {
                statusEl.innerHTML = html || '';
            }
        }

        function setOpenLiveParticipantsText(text, visible = true) {
            const wrapEl = document.getElementById('current-openlive-members-wrap');
            const membersEl = document.getElementById('current-openlive-members');
            if (membersEl) {
                membersEl.textContent = text || '';
            }
            if (wrapEl) {
                wrapEl.style.display = ENABLE_OPENLIVE_PARTICIPANTS && visible ? 'block' : 'none';
            }
        }

        async function loadOpenLiveParticipants(liveId, title = '', startTime = '') {
            if (!ENABLE_OPENLIVE_PARTICIPANTS) {
                setOpenLiveParticipantsText('', false);
                return;
            }

            const normalizedLiveId = String(liveId || '').trim();
            if (!normalizedLiveId) {
                setOpenLiveParticipantsText('', false);
                return;
            }

            const requestId = Date.now() + Math.random();
            currentOpenLiveParticipantsRequestId = requestId;
            setOpenLiveParticipantsText('正在读取参与成员...', true);

            try {
                const result = await ipcRenderer.invoke('fetch-open-live-participants', {
                    liveId: normalizedLiveId,
                    title,
                    dateHint: startTime
                });
                if (currentOpenLiveParticipantsRequestId !== requestId) {
                    return;
                }

                const participants = Array.isArray(result?.content?.participants) ? result.content.participants : [];
                const names = participants
                    .map(item => String(item?.name || '').trim())
                    .filter(Boolean);

                if (!names.length) {
                    setOpenLiveParticipantsText('未获取到参与成员', true);
                    return;
                }

                setOpenLiveParticipantsText(`${names.length} 人：${names.join('、')}`, true);
            } catch (error) {
                console.error('[公演记录] 读取参与成员失败:', error);
                if (currentOpenLiveParticipantsRequestId === requestId) {
                    setOpenLiveParticipantsText('参与成员加载失败', true);
                }
            }
        }

        async function fetchOpenLiveList(isLoadMore) {
            const container = document.getElementById('openlive-list-container');
            const memberId = String(document.getElementById('openlive-member-id')?.value || '').trim();
            const token = getAppToken ? getAppToken() : (typeof window.getAppToken === 'function' ? window.getAppToken() : '');

            if (!token) {
                setOpenLiveStatusHtml('<span style="color:red">⚠️ 请先登录账号</span>');
                return;
            }

            if (!memberId) {
                setOpenLiveStatusHtml('<span style="color:red">⚠️ 请先搜索并选择成员</span>');
                return;
            }

            if (!container) return;

            if (!isLoadMore) {
                openLiveNextTime = 0;
                container.innerHTML = '<div class="empty-state">正在加载...</div>';
                setOpenLiveLoadMoreVisible(false);
                setOpenLiveStatusHtml('');
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const result = await ipcRenderer.invoke('fetch-open-live', {
                    token,
                    pa,
                    memberId,
                    nextTime: openLiveNextTime
                });

                if (!result?.success || !result.content) {
                    if (!isLoadMore) {
                        container.innerHTML = `<div class="placeholder-tip"><h3>❌ 加载失败</h3><p>${result?.msg || '未知错误'}</p></div>`;
                    }
                    return;
                }

                const list = Array.isArray(result.content.message) ? result.content.message : [];
                openLiveNextTime = result.content.nextTime;

                if (!isLoadMore) {
                    container.innerHTML = '';
                }

                if (!list.length) {
                    if (!isLoadMore) {
                        container.innerHTML = '<div class="empty-state">未找到相关记录</div>';
                    }
                    setOpenLiveLoadMoreVisible(false);
                    return;
                }

                renderOpenLiveItems(list, container);

                const totalCount = container.querySelectorAll('.vod-card-row').length;
                setOpenLiveStatusHtml(`共 ${totalCount} 场`);

                const hasNextPage = openLiveNextTime && openLiveNextTime !== 0 && openLiveNextTime !== '0';
                setOpenLiveLoadMoreVisible(hasNextPage && !isOpenLiveAutoLoading);
            } catch (error) {
                console.error(error);
                if (!isLoadMore) {
                    container.innerHTML = `<div class="placeholder-tip"><h3>❌ 发生错误</h3><p>${error.message}</p></div>`;
                }
            }
        }

        async function fetchAllOpenLive() {
            const buttonEl = document.getElementById('btn-openlive-query');
            const memberId = String(document.getElementById('openlive-member-id')?.value || '').trim();

            if (isOpenLiveAutoLoading) {
                isOpenLiveAutoLoading = false;
                if (buttonEl) {
                    buttonEl.innerText = '查询';
                    buttonEl.style.background = '';
                    buttonEl.style.color = '';
                }
                return;
            }

            if (!memberId) {
                setOpenLiveStatusHtml('<span style="color:red">⚠️ 请先搜索并选择成员</span>');
                return;
            }

            isOpenLiveAutoLoading = true;
            if (buttonEl) {
                buttonEl.innerText = '停止查询';
                buttonEl.style.background = '#ff4d4f';
                buttonEl.style.color = 'white';
            }

            await fetchOpenLiveList(false);

            while (isOpenLiveAutoLoading) {
                if (!openLiveNextTime || openLiveNextTime === 0 || openLiveNextTime === '0') {
                    break;
                }

                const previousCursor = openLiveNextTime;
                await fetchOpenLiveList(true);
                await new Promise(resolve => setTimeout(resolve, 50));

                if (openLiveNextTime === previousCursor && openLiveNextTime !== 0) {
                    console.warn('游标未更新，强制停止');
                    break;
                }
            }

            isOpenLiveAutoLoading = false;
            if (buttonEl) {
                buttonEl.innerText = '查询';
                buttonEl.style.background = '';
                buttonEl.style.color = '';
            }
        }

        function renderOpenLiveItems(list, container) {
            list.forEach(item => {
                const msgId = item.msgidClient || item.msgId;
                if (document.getElementById(`openlive-card-${msgId}`)) return;

                let info = {};
                try {
                    const safeExtInfo = String(item.extInfo || '').replace(/:\s*([0-9]{16,})/g, ': "$1"');
                    info = JSON.parse(safeExtInfo);
                } catch (error) {
                    try {
                        info = JSON.parse(item.extInfo);
                    } catch (fallbackError) {
                        return;
                    }
                }

                const title = info.title || '未知公演';
                const liveId = info.liveId || info.id;
                const openLivePageId = info.id || '';
                const nickname = info.user ? info.user.nickname : '';
                let cover = './icon.png';

                if (info.coverUrl) {
                    cover = info.coverUrl.startsWith('http') ? info.coverUrl : `https://source.48.cn${info.coverUrl}`;
                }

                const { dateLabel, timeLabel } = formatBeijingDateTime(item.msgTime, false);
                const card = document.createElement('div');
                card.className = 'vod-card-row';
                card.style.marginBottom = '10px';
                card.style.cursor = 'pointer';
                card.id = `openlive-card-${msgId}`;
                card.innerHTML = `
            <div class="vod-row-cover-container">
                <img src="${cover}" class="vod-row-cover" loading="lazy"
                     title="点击调用外部播放器播放"
                     style="cursor: pointer;"
                     onclick="openOpenLiveInPotPlayer(event, '${liveId}')">
            </div>
            <div class="vod-row-info">
                <div class="vod-row-name" style="white-space: normal; line-height: 1.4; margin-bottom: 2px;">
                    ${title}
                </div>
                <div style="font-size: 13px; color: var(--text-sub);">
                    ${nickname}
                </div>
                <div class="vod-row-time" style="color:#999; font-size:12px; margin-top: auto;">
                    ${dateLabel} ${timeLabel}
                </div>
            </div>
        `;

                card.onclick = () => {
                    if (!liveId) return;
                    playOpenLiveVideo(liveId, title, nickname, item.msgTime, openLivePageId);
                };

                container.appendChild(card);
            });
        }

        async function fetchOpenLiveStreamUrl(liveId) {
            const token = getAppToken ? getAppToken() : (typeof window.getAppToken === 'function' ? window.getAppToken() : '');
            const pa = window.getPA ? window.getPA() : null;
            const result = await ipcRenderer.invoke('fetch-open-live-one', { token, pa, liveId });

            if (!result?.success || !result.content?.playStreams?.length) {
                console.warn('[公演记录] API返回错误:', result?.msg);
                return '';
            }

            const highQuality = result.content.playStreams.find(stream => stream.streamType === 2);
            return highQuality ? highQuality.streamPath : result.content.playStreams[0].streamPath;
        }

        async function playOpenLiveVideo(liveId, title, nickname, startTime, openLivePageId = '') {
            const giftContainer = document.getElementById('live-gift-container');
            if (giftContainer) {
                giftContainer.style.display = 'none';
            }

            if (typeof resetTimelinePanel === 'function') {
                resetTimelinePanel();
            }
            document.getElementById('view-open-live').style.display = 'none';

            const mediaView = document.getElementById('view-media');
            if (mediaView) {
                mediaView.style.display = 'flex';
                mediaView.style.flexDirection = 'column';
            }

            const mediaListControls = document.getElementById('media-list-controls');
            const paginationControls = document.getElementById('vod-pagination-controls');
            const mediaListArea = document.getElementById('media-list-area');
            const liveControls = document.getElementById('live-list-controls');
            if (mediaListControls) mediaListControls.style.display = 'none';
            if (paginationControls) paginationControls.style.display = 'none';
            if (mediaListArea) mediaListArea.style.display = 'none';
            if (liveControls) liveControls.style.display = 'none';

            setReturnToOpenLive(true);

            const playerView = document.getElementById('live-player-view');
            if (playerView) playerView.style.display = 'flex';

            const authorEl = document.getElementById('current-live-author');
            if (authorEl) authorEl.textContent = nickname || '未知成员';

            const sectionTitle = document.getElementById('live-view-title');
            if (sectionTitle) sectionTitle.textContent = '公演记录';

            const titleEl = document.getElementById('current-live-title');
            const dateEl = document.getElementById('current-live-date');
            const timeEl = document.getElementById('current-live-time');
            if (titleEl) titleEl.textContent = title || '';

            if (startTime) {
                const { dateLabel, timeLabel } = formatBeijingDateTime(startTime, true);
                if (dateEl) dateEl.textContent = dateLabel;
                if (timeEl) timeEl.textContent = timeLabel;
            } else {
                if (dateEl) dateEl.textContent = '';
                if (timeEl) timeEl.textContent = '';
            }

            setCurrentPlayingItem({ liveId, title, nickname, startTime, openLivePageId });
            if (typeof resetClipTool === 'function') {
                resetClipTool();
            }
            setOpenLiveParticipantsText('', false);

            try {
                const streamUrl = await fetchOpenLiveStreamUrl(liveId);
                if (!streamUrl) {
                    console.warn(`[播放失败] liveId:${liveId} 无可用流`);
                    return;
                }
                if (typeof startPlayer !== 'function') {
                    console.error('[公演记录] startPlayer 未就绪');
                    return;
                }
                startPlayer(streamUrl, title, false, null, [], { clearAuxPanels: true });
                if (ENABLE_OPENLIVE_PARTICIPANTS) {
                    Promise.resolve()
                        .then(() => loadOpenLiveParticipants(openLivePageId || liveId, title, startTime))
                        .catch(error => console.error('[公演记录] 异步读取参与成员失败:', error));
                }
            } catch (error) {
                console.error('[网络/系统错误]', error);
            }
        }

        async function openOpenLiveInPotPlayer(event, liveId) {
            event.stopPropagation();

            const imageEl = event.target;
            const originalCursor = imageEl.style.cursor;
            imageEl.style.cursor = 'wait';

            try {
                const streamUrl = await fetchOpenLiveStreamUrl(liveId);
                if (!streamUrl) {
                    console.warn('[外部播放器] 未找到流地址');
                    return;
                }

                const opened = await openMediaInExternalPlayer(streamUrl, { silent: true });
                if (!opened) {
                    showToast(`未找到可用的 ${getPreferredExternalPlayerName()}`);
                }
            } catch (error) {
                console.error('[外部播放器] 调用异常:', error);
            } finally {
                imageEl.style.cursor = originalCursor;
            }
        }

        return {
            handleOpenLiveSearch,
            selectOpenLiveMember,
            fetchOpenLiveList,
            fetchAllOpenLive,
            openOpenLiveInPotPlayer
        };
    };
})();
