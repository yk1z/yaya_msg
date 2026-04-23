(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createFollowedRoomsFeature = function createFollowedRoomsFeature(deps) {
        const {
            getActiveFollowedChannel,
            getAppToken,
            getMemberData,
            getMemberDataLoaded,
            getPinyinInitials,
            getTeamStyle,
            ipcRenderer,
            loadMemberData,
            memberSortLogic,
            replaceTencentEmoji,
            showToast
        } = deps;

        let currentFollowedData = [];
        let draggedCard = null;
        window.allFollowedIds = window.allFollowedIds || new Set();

        function escapeHtml(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function parseFollowedPreviewText(rawContent) {
            if (rawContent == null) return '[暂无新消息]';

            let json = null;
            if (typeof rawContent === 'string') {
                const trimmed = rawContent.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try {
                        json = JSON.parse(trimmed);
                        if (typeof json === 'string') {
                            json = JSON.parse(json);
                        }
                    } catch (_) {
                        json = null;
                    }
                }
            } else if (typeof rawContent === 'object') {
                json = rawContent;
            }

            if (!json || typeof json !== 'object') {
                return String(rawContent || '[暂无新消息]');
            }

            const messageType = String(json.messageType || '').toUpperCase();
            if (messageType === 'SHARE_LIVE') {
                const info = json.shareInfo || {};
                return `[直播分享] ${info.shareTitle || '点击查看'}`;
            }

            if (messageType === 'LIVEPUSH') {
                const info = json.livePushInfo || json;
                return `[直播通知] ${info.liveTitle || '直播'}`;
            }

            if (messageType === 'GIFT_TEXT') {
                const info = json.giftInfo || json;
                if (info.giftName && info.giftNum) {
                    return `🎁 送出了 [${info.giftName}] x${info.giftNum}`;
                }
            }

            if (typeof json.text === 'string' && json.text.trim()) {
                return json.text;
            }

            if (typeof json.bodys === 'string' && json.bodys.trim()) {
                return json.bodys;
            }

            return '[新消息]';
        }

        function toggleFollowedSortDropdown() {
            const list = document.getElementById('followed-sort-dropdown');
            if (list) {
                list.style.display = (list.style.display === 'block') ? 'none' : 'block';
            }
        }

        function selectFollowedSort(value, text) {
            document.getElementById('followed-sort-value').value = value;
            document.getElementById('followed-sort-display').value = text;
            document.getElementById('followed-sort-dropdown').style.display = 'none';
            sortFollowedRooms();
        }

        function compareFollowedNames(a, b) {
            if (window.pinyinPro) {
                const pA = pinyinPro.pinyin(a.bigDisplayName, { toneType: 'none', type: 'array' }).join('');
                const pB = pinyinPro.pinyin(b.bigDisplayName, { toneType: 'none', type: 'array' }).join('');
                return pA.localeCompare(pB);
            }
            return a.bigDisplayName.localeCompare(b.bigDisplayName, 'zh-CN');
        }

        function compareInactiveState(a, b) {
            const isInactiveA = a.isInGroup === false;
            const isInactiveB = b.isInGroup === false;
            if (isInactiveA !== isInactiveB) {
                return isInactiveA ? 1 : -1;
            }
            return 0;
        }

        function sortFollowedRooms() {
            const sortMode = document.getElementById('followed-sort-value')?.value || 'default';
            const sortedData = [...currentFollowedData];

            if (sortMode === 'name') {
                sortedData.sort((a, b) => compareInactiveState(a, b) || compareFollowedNames(a, b));
            } else if (sortMode === 'team') {
                sortedData.sort((a, b) => {
                    const inactiveCompare = compareInactiveState(a, b);
                    if (inactiveCompare) return inactiveCompare;

                    const idA = parseInt(a.teamId) || 999999;
                    const idB = parseInt(b.teamId) || 999999;
                    if (idA !== idB) return idA - idB;

                    return compareFollowedNames(a, b);
                });
            } else {
                const savedOrder = JSON.parse(localStorage.getItem('yaya_followed_custom_order') || '[]');

                if (savedOrder.length > 0) {
                    sortedData.sort((a, b) => {
                        const indexA = savedOrder.indexOf(String(a.channelId));
                        const indexB = savedOrder.indexOf(String(b.channelId));

                        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                        if (indexA !== -1) return -1;
                        if (indexB !== -1) return 1;
                        return b.msgTime - a.msgTime;
                    });
                } else {
                    sortedData.sort((a, b) => b.msgTime - a.msgTime);
                }
            }

            renderFollowedRoomsList(sortedData);
        }

        async function loadFollowedRooms() {
            const container = document.getElementById('followed-rooms-container');
            const token = getAppToken();
            if (!token) {
                container.innerHTML = '<div class="placeholder-tip"><h3>⚠️ 未登录</h3></div>';
                return;
            }

            const refreshBtn = document.querySelector('button[onclick="loadFollowedRooms()"]');
            if (refreshBtn) {
                refreshBtn.innerText = '刷新';
                refreshBtn.disabled = true;
            }

            if (!container.querySelector('.session-card')) {
                container.innerHTML = '<div class="empty-state">正在加载</div>';
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const friendsRes = await ipcRenderer.invoke('fetch-friends-ids', { token, pa });
                if (friendsRes.status !== 200 || !friendsRes.content?.data) throw new Error('获取失败');

                const followedIds = friendsRes.content.data;
                window.allFollowedIds = new Set(followedIds.map(id => String(id)));

                if (!getMemberDataLoaded()) await loadMemberData();

                const followedMembers = [];
                const serverIds = new Set();
                const memberData = getMemberData();

                followedIds.forEach(uid => {
                    const member = memberData.find(m => String(m.id || m.userId) === String(uid));
                    if (member && member.channelId) {
                        followedMembers.push(member);
                        if (member.serverId) serverIds.add(member.serverId);
                    }
                });

                const msgRes = await ipcRenderer.invoke('fetch-last-messages', {
                    token, pa, serverIdList: Array.from(serverIds)
                });

                const lastMsgs = msgRes.content?.lastMsgList || [];

                currentFollowedData = followedMembers.map(m => {
                    const msg = lastMsgs.find(msg => String(msg.channelId) === String(m.channelId)) || {};
                    const apiStarName = msg.starName || m.ownerName || '未知';
                    let bigDisplayName = m.ownerName || '未知成员';

                    if (bigDisplayName.includes('SNH48-') || bigDisplayName.includes('GNZ48-') ||
                        bigDisplayName.includes('BEJ48-') || bigDisplayName.includes('CKG48-') ||
                        bigDisplayName.includes('CGT48-')) {
                        bigDisplayName = bigDisplayName.split('-')[1] || bigDisplayName;
                    }

                    const lastText = parseFollowedPreviewText(msg.msgContent);

                    return {
                        ...m,
                        bigDisplayName,
                        pinkStarName: apiStarName,
                        lastText: replaceTencentEmoji(lastText),
                        msgTime: msg.msgTime || 0,
                        unread: parseInt(msg.unreadCount || 0)
                    };
                });

                sortFollowedRooms();

                const currentSearchId = document.getElementById('quick-follow-id')?.value;
                const currentSearchName = document.getElementById('quick-follow-input')?.value;
                if (currentSearchId) {
                    selectQuickFollowMember(currentSearchName, currentSearchId);
                }
            } catch (e) {
                container.innerHTML = `<div class="empty-state">❌ ${escapeHtml(e.message)}</div>`;
            } finally {
                if (refreshBtn) {
                    refreshBtn.innerText = '刷新';
                    refreshBtn.disabled = false;
                }
            }
        }

        function renderFollowedRoomsList(renderData) {
            const container = document.getElementById('followed-rooms-container');
            const sortMode = document.getElementById('followed-sort-value')?.value || 'default';
            const isCustomSort = sortMode === 'default';

            const html = renderData.map(item => {
                const teamName = item.team || '';
                const isInactive = item.isInGroup === false;
                const colorStyle = getTeamStyle(teamName, isInactive);

                const teamHtml = teamName ?
                    `<span class="team-tag" style="font-size: 10px; padding: 0 6px; height: 16px; line-height: 14px; font-weight: 500; border-radius: 8px; ${colorStyle}">${escapeHtml(teamName)}</span>`
                    : '';

                const unreadHtml = item.unread > 0
                    ? `<span style="background:#ff4d4f; color:#fff; font-size:10px; padding:0 6px; border-radius:10px; margin-left:8px; font-weight:bold;">${item.unread}</span>`
                    : '';

                const isActive = String(getActiveFollowedChannel()) === String(item.channelId) ? 'active' : '';
                const draggableAttr = isCustomSort ? 'draggable="true"' : '';
                const cursorStyle = isCustomSort ? 'cursor: grab;' : 'cursor: pointer;';

                return `
        <div class="session-card ${isActive}" id="session-card-${escapeHtml(item.channelId)}" data-channelid="${escapeHtml(item.channelId)}" data-owner-name="${escapeHtml(item.bigDisplayName)}" data-server-id="${escapeHtml(item.serverId)}" ${draggableAttr} style="padding: 12px 16px; border-bottom: 1px solid var(--border); transition: 0.2s; ${cursorStyle}">
            <div class="session-info" style="flex: 1; min-width: 0; pointer-events: none;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="display: flex; align-items: center; min-width: 0; flex: 1;">
                        <div class="session-title" style="font-size: 15px; font-weight: bold; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${escapeHtml(item.bigDisplayName)}
                        </div>
                        ${unreadHtml}
                    </div>
                    <div style="display: flex; align-items: center; flex-shrink: 0; margin-left: 10px;">
                        ${teamHtml}
                    </div>
                </div>
                <div class="session-msg" style="font-size: 12px; color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <span style="color:var(--primary); font-weight:bold;">${escapeHtml(item.pinkStarName)}</span>: ${escapeHtml(item.lastText)}
                </div>
            </div>
        </div>
    `;
            }).join('');

            container.innerHTML = html;

            const cards = container.querySelectorAll('.session-card');
            cards.forEach(card => {
                card.addEventListener('click', () => {
                    window.openFollowedChat(card.dataset.ownerName, card.dataset.channelid, card.dataset.serverId);
                });
            });

            if (isCustomSort) {
                cards.forEach(card => {
                    card.addEventListener('dragstart', handleDragStart);
                    card.addEventListener('dragover', handleDragOver);
                    card.addEventListener('dragenter', handleDragEnter);
                    card.addEventListener('dragleave', handleDragLeave);
                    card.addEventListener('drop', handleDrop);
                    card.addEventListener('dragend', handleDragEnd);
                });
            }
        }

        function handleDragStart(e) {
            draggedCard = this;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
            this.style.opacity = '0.4';
        }

        function handleDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return false;
        }

        function handleDragEnter(e) {
            e.preventDefault();
            if (this !== draggedCard) {
                this.classList.add('drag-over-target');
            }
        }

        function handleDragLeave() {
            this.classList.remove('drag-over-target');
        }

        function handleDrop(e) {
            e.stopPropagation();
            this.classList.remove('drag-over-target');

            if (draggedCard !== this) {
                const container = document.getElementById('followed-rooms-container');
                const cards = Array.from(container.querySelectorAll('.session-card'));
                const draggedIndex = cards.indexOf(draggedCard);
                const targetIndex = cards.indexOf(this);

                if (draggedIndex < targetIndex) {
                    this.parentNode.insertBefore(draggedCard, this.nextSibling);
                } else {
                    this.parentNode.insertBefore(draggedCard, this);
                }

                saveCustomRoomOrder();
            }
            return false;
        }

        function handleDragEnd() {
            this.style.opacity = '1';
            document.querySelectorAll('.session-card').forEach(c => {
                c.classList.remove('drag-over-target');
            });
        }

        function saveCustomRoomOrder() {
            const container = document.getElementById('followed-rooms-container');
            const cards = container.querySelectorAll('.session-card');
            const newOrder = Array.from(cards).map(card => card.getAttribute('data-channelid'));
            localStorage.setItem('yaya_followed_custom_order', JSON.stringify(newOrder));
        }

        function handleQuickFollowSearch(keyword) {
            const resultBox = document.getElementById('quick-follow-results');
            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }

            if (!getMemberDataLoaded()) {
                loadMemberData();
            }

            const lowerKw = keyword.toLowerCase();
            const memberData = getMemberData();
            const matches = memberData.filter(m => {
                const matchName = m.ownerName.includes(keyword);
                const pinyin = m.pinyin || "";
                const initials = getPinyinInitials(pinyin);
                return matchName || pinyin.toLowerCase().includes(lowerKw) || initials.toLowerCase().includes(lowerKw);
            });

            matches.sort(memberSortLogic);

            if (matches.length > 0) {
                const html = matches.slice(0, 10).map(m => {
                    const isInactive = m.isInGroup === false;
                    const colorStyle = getTeamStyle(m.team, isInactive);
                    return `
                <div class="suggestion-item" data-name="${escapeHtml(m.ownerName)}" data-id="${escapeHtml(m.id || m.userId)}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px;">
                    <span style="font-weight:bold; font-size:12px; ${isInactive ? 'opacity:0.6' : ''}">${escapeHtml(m.ownerName)}</span>
                    <span class="team-tag" style="font-size:10px; padding:0 4px; height:16px; line-height:14px; ${colorStyle}">${escapeHtml(m.team)}</span>
                </div>`;
                }).join('');
                resultBox.innerHTML = html;
                resultBox.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', () => selectQuickFollowMember(item.dataset.name, item.dataset.id));
                });
                resultBox.style.display = 'block';
            } else {
                resultBox.innerHTML = '<div class="suggestion-item" style="font-size:12px; color:#999;">未找到该成员</div>';
                resultBox.style.display = 'block';
            }
        }

        function selectQuickFollowMember(name, id) {
            document.getElementById('quick-follow-input').value = name;
            document.getElementById('quick-follow-id').value = id;
            document.getElementById('quick-follow-results').style.display = 'none';

            const btn = document.getElementById('btn-quick-action');
            if (window.allFollowedIds.has(String(id))) {
                btn.innerText = "取关";
                btn.style.color = "#ff4d4f";
            } else {
                btn.innerText = "关注";
                btn.style.color = "";
            }
        }

        async function executeQuickAction() {
            const memberId = document.getElementById('quick-follow-id').value;
            const memberName = document.getElementById('quick-follow-input').value;
            const btn = document.getElementById('btn-quick-action');
            const token = getAppToken();
            const pa = window.getPA ? window.getPA() : null;

            if (!token || !memberId) return showToast('⚠️ 请先选择成员');

            const isUnfollow = btn.innerText === "取关";
            const channel = isUnfollow ? 'unfollow-member' : 'follow-member';

            showToast(`正在${isUnfollow ? '取消关注' : '关注'} ${memberName}...`);

            try {
                const res = await ipcRenderer.invoke(channel, { token, pa, memberId });
                if (res.success) {
                    showToast(`✅ ${isUnfollow ? '已取消关注' : '成功关注'} ${memberName}`);

                    document.getElementById('quick-follow-input').value = '';
                    document.getElementById('quick-follow-id').value = '';
                    btn.innerText = "关注";
                    btn.style.color = "";

                    setTimeout(loadFollowedRooms, 500);
                } else {
                    showToast(`❌ 失败: ${res.msg}`);
                }
            } catch (e) {
                showToast(`❌ 错误: ${e.message}`);
            }
        }

        return {
            executeQuickAction,
            handleQuickFollowSearch,
            loadFollowedRooms,
            selectFollowedSort,
            selectQuickFollowMember,
            sortFollowedRooms,
            toggleFollowedSortDropdown
        };
    };
})();
