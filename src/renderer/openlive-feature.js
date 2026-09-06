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
            activateMediaPlaybackPage,
            configurePlayerLayout,
            destroyPlayers,
            backToLiveList,
            setCurrentPlayingItem,
            setReturnToOpenLive,
            setReturnToPerformance,
            startPlayer,
            openMediaInExternalPlayer,
            getPreferredExternalPlayerName,
            showToast
        } = deps;

        let openLiveNextTime = 0;
        let isOpenLiveAutoLoading = false;
        let currentOpenLiveParticipantsRequestId = 0;
        const ENABLE_OPENLIVE_PARTICIPANTS = true;

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
            const buttonEl = document.getElementById('btn-player-participants');
            const statusEl = document.getElementById('openlive-participants-modal-status');
            const listEl = document.getElementById('openlive-participants-modal-list');
            const shouldShow = ENABLE_OPENLIVE_PARTICIPANTS && visible;
            if (buttonEl) {
                buttonEl.style.display = shouldShow ? 'inline-flex' : 'none';
                buttonEl.textContent = '参与成员';
            }
            if (statusEl) statusEl.textContent = text || '';
            if (listEl) listEl.replaceChildren();
            if (!shouldShow) closeOpenLiveParticipantsModal();
        }

        function normalizeOpenLiveParticipantName(value) {
            return String(value || '')
                .trim()
                .replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48|SHY48|IDFT)[-\s]*/i, '')
                .replace(/\s+/g, '')
                .toLowerCase();
        }

        function normalizeOpenLiveParticipantGroup(value) {
            const match = String(value || '').trim().toLowerCase().match(/(?:^|[^a-z])(snh|gnz|bej|ckg|cgt|shy)(?:48)?(?:$|[^a-z])/i);
            return match ? match[1].toLowerCase() : '';
        }

        function openLiveMemberBelongsToGroup(member, group) {
            if (!member || !group) return false;
            if (normalizeOpenLiveParticipantGroup(member.groupName || member.group) === group) return true;
            const membershipText = [
                member.note,
                member.concurrentGroup,
                member.concurrentTeam,
                member.secondGroupName,
                member.secondTeamName
            ].map(value => String(value || '')).join(' ');
            return new RegExp(`(?:^|[^a-z])${group}(?:48)?(?:$|[^a-z])`, 'i').test(membershipText);
        }

        function getOpenLiveParticipantTeam(participant, member, group) {
            const participantTeam = String(participant?.teamName || participant?.team || '').trim();
            if (participantTeam) return participantTeam;
            return String(member?.team || '').trim();
        }

        function getOpenLiveParticipantAvatar(value) {
            const raw = String(value || '').trim();
            if (!raw) return './icon.png';
            const normalizer = window.YayaRendererUtils?.normalize48Url;
            return (typeof normalizer === 'function' ? normalizer(raw, 'https://source.48.cn') : raw) || './icon.png';
        }

        function enrichOpenLiveParticipants(participants, groupHint = '') {
            const memberList = Array.isArray(getMemberData()) ? getMemberData() : [];
            const membersById = new Map();
            const membersByPrimaryName = new Map();
            const membersByAlias = new Map();
            const addMemberName = (map, value, member) => {
                const key = normalizeOpenLiveParticipantName(value);
                if (!key) return;
                const matches = map.get(key) || [];
                if (!matches.includes(member)) matches.push(member);
                map.set(key, matches);
            };
            memberList.forEach(member => {
                [member?.id, member?.userId, member?.memberId, member?.ownerId, member?.starId]
                    .map(value => String(value || '').trim())
                    .filter(Boolean)
                    .forEach(id => {
                        if (!membersById.has(id)) membersById.set(id, member);
                    });
                addMemberName(membersByPrimaryName, member?.ownerName || member?.name, member);
                [
                    member?.name,
                    member?.nickname,
                    member?.nickName,
                    member?.starName,
                    member?.realNickName
                ].forEach(value => addMemberName(membersByAlias, value, member));
            });

            const normalizedGroupHint = normalizeOpenLiveParticipantGroup(groupHint);
            const seen = new Set();
            return participants.map(participant => {
                const name = String(participant?.name || participant?.starName || participant?.nickname || '').trim();
                const nameKey = normalizeOpenLiveParticipantName(name);
                const participantIds = [
                    participant?.memberId,
                    participant?.userId,
                    participant?.ownerId,
                    participant?.id,
                    participant?.starId
                ].map(value => String(value || '').trim()).filter(Boolean);
                const identityKey = participantIds[0] || `${normalizedGroupHint}:${nameKey}`;
                if (!nameKey || seen.has(identityKey)) return null;
                seen.add(identityKey);

                const participantGroup = normalizeOpenLiveParticipantGroup(
                    participant?.groupName || participant?.group || participant?.clubName || normalizedGroupHint
                );
                let member = participantIds.map(id => membersById.get(id)).find(Boolean);
                if (!member) {
                    const primaryMatches = membersByPrimaryName.get(nameKey) || [];
                    const candidates = primaryMatches.length ? primaryMatches : (membersByAlias.get(nameKey) || []);
                    member = candidates.find(candidate => (
                        participantGroup && openLiveMemberBelongsToGroup(candidate, participantGroup)
                    ));
                    if (!member && candidates.length) {
                        member = candidates.find(candidate => candidate?.isInGroup === true) || candidates[0];
                    }
                }
                member = member || {};
                const userId = String(
                    participant?.memberId
                    || participant?.userId
                    || participant?.ownerId
                    || member.id
                    || member.userId
                    || member.memberId
                    || member.ownerId
                    || ''
                ).trim();
                const avatar = getOpenLiveParticipantAvatar(
                    participant?.avatar
                    || participant?.avatarUrl
                    || participant?.headImg
                    || participant?.headImgUrl
                    || member.avatar
                    || member.avatarUrl
                    || member.headImg
                    || member.headImgUrl
                );
                const team = getOpenLiveParticipantTeam(participant, member, participantGroup);

                return { name, userId, avatar, team, teamLabel: team };
            }).filter(Boolean);
        }

        function renderOpenLiveParticipants(participants, groupHint = '') {
            const normalizedParticipants = enrichOpenLiveParticipants(participants, groupHint);
            const buttonEl = document.getElementById('btn-player-participants');
            const statusEl = document.getElementById('openlive-participants-modal-status');
            const listEl = document.getElementById('openlive-participants-modal-list');
            if (buttonEl) {
                buttonEl.style.display = 'inline-flex';
                buttonEl.textContent = '参与成员';
            }
            if (statusEl) statusEl.textContent = `共 ${normalizedParticipants.length} 位成员`;
            if (!listEl) return;
            listEl.replaceChildren();
            const fragment = document.createDocumentFragment();
            normalizedParticipants.forEach(participant => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'openlive-participant-chip';
                chip.setAttribute('aria-label', `查看 ${participant.name} 的用户主页`);

                const avatar = document.createElement('img');
                avatar.className = 'openlive-participant-avatar';
                avatar.src = participant.avatar;
                avatar.alt = '';
                avatar.loading = 'lazy';
                avatar.addEventListener('error', () => {
                    if (!avatar.src.endsWith('/icon.png')) avatar.src = './icon.png';
                }, { once: true });

                const details = document.createElement('span');
                details.className = 'openlive-participant-details';

                const name = document.createElement('span');
                name.className = 'openlive-participant-name';
                name.textContent = participant.name;
                details.appendChild(name);

                if (participant.teamLabel) {
                    const team = document.createElement('span');
                    team.className = 'team-tag openlive-participant-team';
                    team.textContent = participant.teamLabel;
                    if (typeof getTeamStyle === 'function') {
                        team.style.cssText = getTeamStyle(participant.team, false) || '';
                    }
                    details.appendChild(team);
                }

                chip.append(avatar, details);

                if (participant.userId && typeof window.openFollowedUserProfile === 'function') {
                    chip.addEventListener('click', () => {
                        closeOpenLiveParticipantsModal();
                        window.openFollowedUserProfile(participant.userId, participant.name, participant.avatar, true);
                    });
                } else {
                    chip.disabled = true;
                    chip.title = '暂时没有获取到成员 ID';
                }
                fragment.appendChild(chip);
            });
            listEl.appendChild(fragment);
        }

        function openOpenLiveParticipantsModal() {
            const modalEl = document.getElementById('openLiveParticipantsModal');
            if (modalEl) modalEl.style.display = 'flex';
        }

        function closeOpenLiveParticipantsModal() {
            const modalEl = document.getElementById('openLiveParticipantsModal');
            if (modalEl) modalEl.style.display = 'none';
        }

        async function loadOpenLiveParticipants(liveId, title = '', startTime = '', groupHint = '') {
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
                    dateHint: startTime,
                    groupHint
                });
                if (currentOpenLiveParticipantsRequestId !== requestId) {
                    return;
                }

                const participants = Array.isArray(result?.content?.participants) ? result.content.participants : [];

                if (!participants.length) {
                    setOpenLiveParticipantsText('未获取到参与成员', true);
                    return;
                }

                if (!getMemberDataLoaded() && typeof loadMemberData === 'function') {
                    try {
                        await loadMemberData();
                    } catch (error) {
                        console.warn('[公演记录] 补全成员资料失败，将使用公演数据:', error);
                    }
                    if (currentOpenLiveParticipantsRequestId !== requestId) return;
                }

                renderOpenLiveParticipants(participants, groupHint);
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
                setOpenLiveStatusHtml('');
                showToast('请先登录账号');
                return;
            }

            if (!memberId) {
                setOpenLiveStatusHtml('');
                showToast('请先搜索并选择成员');
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
                        container.innerHTML = `<div class="placeholder-tip"><h3>加载失败</h3><p>${result?.msg || '未知错误'}</p></div>`;
                    }
                    return;
                }

                const list = Array.isArray(result.content.message) ? result.content.message : [];
                openLiveNextTime = result.content.nextTime;

                if (!isLoadMore) {
                    container.replaceChildren();
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
                    container.innerHTML = `<div class="placeholder-tip"><h3>发生错误</h3><p>${error.message}</p></div>`;
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
                setOpenLiveStatusHtml('');
                showToast('请先搜索并选择成员');
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

        async function playOpenLiveVideo(
            liveId,
            title,
            nickname,
            startTime,
            openLivePageId = '',
            sourceView = 'openlive',
            isLiveContent = false,
            participantGroupHint = ''
        ) {
            if (typeof destroyPlayers === 'function') {
                destroyPlayers({ clearTimeline: true, clearAuxPanels: true });
            }
            const giftContainer = document.getElementById('live-gift-container');
            if (giftContainer) {
                giftContainer.style.display = 'none';
            }

            if (typeof resetTimelinePanel === 'function') {
                resetTimelinePanel();
            }
            const openLiveView = document.getElementById('view-open-live');
            const performanceView = document.getElementById('view-performance');
            if (openLiveView) openLiveView.style.display = 'none';
            if (performanceView) performanceView.style.display = 'none';

            const mediaView = document.getElementById('view-media');
            const targetPlayerPageId = sourceView === 'performance'
                ? 'view-performance-player'
                : (isLiveContent ? 'view-open-live-player' : 'view-open-live-record-player');
            const targetPlayerPage = document.getElementById(targetPlayerPageId);

            const mediaListControls = document.getElementById('media-list-controls');
            const paginationControls = document.getElementById('vod-pagination-controls');
            const mediaListArea = document.getElementById('media-list-area');
            const liveControls = document.getElementById('live-list-controls');
            const rankButton = document.getElementById('btn-player-rank');
            const rankContainer = document.getElementById('live-rank-container');
            if (mediaListControls) mediaListControls.style.display = 'none';
            if (paginationControls) paginationControls.style.display = 'none';
            if (mediaListArea) mediaListArea.style.display = 'none';
            if (liveControls) liveControls.style.display = 'none';
            if (rankButton) rankButton.style.display = 'none';
            if (rankContainer) rankContainer.style.display = 'none';

            setReturnToOpenLive(sourceView === 'openlive');
            if (typeof setReturnToPerformance === 'function') {
                setReturnToPerformance(sourceView === 'performance');
            }

            const playerView = document.getElementById('live-player-view');
            if (targetPlayerPage && playerView && typeof activateMediaPlaybackPage === 'function') {
                activateMediaPlaybackPage(targetPlayerPage.id, playerView);
            } else if (targetPlayerPage && playerView) {
                if (playerView.parentElement !== targetPlayerPage) {
                    targetPlayerPage.appendChild(playerView);
                }
                if (mediaView) mediaView.style.display = 'none';
                document.querySelectorAll('.media-playback-page').forEach(page => {
                    page.style.display = 'none';
                });
                targetPlayerPage.style.display = 'flex';
                targetPlayerPage.style.flexDirection = 'column';
                targetPlayerPage.scrollTop = 0;
                playerView.style.display = 'flex';
            } else {
                if (mediaView) {
                    mediaView.style.display = 'flex';
                    mediaView.style.flexDirection = 'column';
                }
                if (playerView) playerView.style.display = 'flex';
            }
            if (typeof configurePlayerLayout === 'function') {
                configurePlayerLayout(targetPlayerPage?.dataset.mediaPlaybackMode || (isLiveContent ? 'open-live' : 'open-live-record'));
            }

            const authorEl = document.getElementById('current-live-author');
            if (authorEl) authorEl.textContent = nickname || '未知成员';

            const sectionTitle = document.getElementById('live-view-title');
            if (sectionTitle) sectionTitle.textContent = isLiveContent ? '公演直播' : '公演记录';

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
            const queueParticipantLoad = () => {
                if (!ENABLE_OPENLIVE_PARTICIPANTS) return;
                Promise.resolve()
                    .then(() => loadOpenLiveParticipants(
                        openLivePageId || liveId,
                        title,
                        startTime,
                        participantGroupHint
                    ))
                    .catch(error => console.error('[公演记录] 异步读取参与成员失败:', error));
            };

            try {
                const streamUrl = await fetchOpenLiveStreamUrl(liveId);
                if (!streamUrl) {
                    console.warn(`[播放失败] liveId:${liveId} 无可用流`);
                    showToast('该场公演尚未开始或暂无播放源');
                    if (typeof backToLiveList === 'function') backToLiveList();
                    return;
                }
                if (typeof startPlayer !== 'function') {
                    console.error('[公演记录] startPlayer 未就绪');
                    if (typeof backToLiveList === 'function') backToLiveList();
                    return;
                }
                startPlayer(streamUrl, title, isLiveContent, null, [], { clearAuxPanels: true });
                queueParticipantLoad();
            } catch (error) {
                console.error('[网络/系统错误]', error);
                showToast('公演播放地址获取失败，请稍后重试');
                if (typeof backToLiveList === 'function') backToLiveList();
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
            playOpenLiveVideo,
            openOpenLiveInPotPlayer,
            openOpenLiveParticipantsModal,
            closeOpenLiveParticipantsModal
        };
    };
})();
