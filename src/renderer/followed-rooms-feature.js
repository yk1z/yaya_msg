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
        let followedRoomsAutoRefreshTimer = null;
        let followedRoomsAutoRefreshEnabled = false;
        let followedRoomsAutoRefreshRunning = false;
        let followedRoomContextMenu = null;
        let followedRoomContextTarget = null;
        window.allFollowedIds = window.allFollowedIds || new Set();
        const FOLLOWED_CUSTOM_ORDER_KEY = 'yaya_followed_custom_order';
        const FOLLOWED_PINNED_CHANNELS_KEY = 'yaya_followed_pinned_channels';

        function readJsonSetting(key, fallbackValue) {
            if (typeof window.readStoredJsonSetting === 'function') {
                return window.readStoredJsonSetting(key, fallbackValue);
            }
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallbackValue;
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

        function normalizeSearchText(value) {
            return String(value || '').trim().toLowerCase();
        }

        function getFollowedListSearchKeyword() {
            return normalizeSearchText(document.getElementById('quick-follow-input')?.value);
        }

        function getFollowedSearchPinyinParts(value) {
            const raw = String(value || '').trim();
            if (!raw) return { full: '', compact: '', initials: '' };

            if (window.pinyinPro && typeof window.pinyinPro.pinyin === 'function') {
                try {
                    const pinyinArray = window.pinyinPro.pinyin(raw, {
                        toneType: 'none',
                        type: 'array'
                    }).filter(Boolean);

                    const full = pinyinArray.join(' ').toLowerCase();
                    return {
                        full,
                        compact: pinyinArray.join('').toLowerCase(),
                        initials: pinyinArray.map(part => String(part || '').charAt(0)).join('').toLowerCase()
                    };
                } catch (_) {
                    // Fall through to the stored pinyin text below.
                }
            }

            const full = raw.toLowerCase();
            return {
                full,
                compact: full.replace(/[\s_-]+/g, ''),
                initials: full
                    .split(/[\s_-]+/)
                    .filter(Boolean)
                    .map(part => part.charAt(0))
                    .join('')
            };
        }

        function filterFollowedRoomsByKeyword(data) {
            const keyword = getFollowedListSearchKeyword();
            if (!keyword) return data;
            const compactKeyword = keyword.replace(/[\s_-]+/g, '');

            return data.filter(item => {
                const storedPinyin = getFollowedSearchPinyinParts(item.pinyin);
                const namePinyin = getFollowedSearchPinyinParts(item.bigDisplayName || item.ownerName || item.pinkStarName);
                const searchableText = [
                    item.bigDisplayName,
                    item.ownerName,
                    item.pinkStarName,
                    item.team,
                    item.groupName,
                    item.lastText,
                    item.channelId,
                    item.serverId
                ].map(value => String(value || '').toLowerCase()).join(' ');

                return searchableText.includes(keyword)
                    || storedPinyin.full.includes(keyword)
                    || storedPinyin.compact.includes(compactKeyword)
                    || storedPinyin.initials.includes(compactKeyword)
                    || namePinyin.full.includes(keyword)
                    || namePinyin.compact.includes(compactKeyword)
                    || namePinyin.initials.includes(compactKeyword);
            });
        }

        function sortFollowedRooms() {
            const sortMode = document.getElementById('followed-sort-value')?.value || 'default';
            const sortedData = [...currentFollowedData];
            const pinnedIds = getPinnedChannelIds();
            const comparePinnedState = (a, b) => {
                const indexA = pinnedIds.indexOf(String(a.channelId));
                const indexB = pinnedIds.indexOf(String(b.channelId));
                const pinnedA = indexA !== -1;
                const pinnedB = indexB !== -1;

                if (pinnedA && pinnedB) return indexA - indexB;
                if (pinnedA) return -1;
                if (pinnedB) return 1;
                return 0;
            };

            if (sortMode === 'name') {
                sortedData.sort((a, b) => comparePinnedState(a, b) || compareInactiveState(a, b) || compareFollowedNames(a, b));
            } else if (sortMode === 'team') {
                sortedData.sort((a, b) => {
                    const pinnedCompare = comparePinnedState(a, b);
                    if (pinnedCompare) return pinnedCompare;

                    const inactiveCompare = compareInactiveState(a, b);
                    if (inactiveCompare) return inactiveCompare;

                    const idA = parseInt(a.teamId) || 999999;
                    const idB = parseInt(b.teamId) || 999999;
                    if (idA !== idB) return idA - idB;

                    return compareFollowedNames(a, b);
                });
            } else {
                const savedOrder = readJsonSetting(FOLLOWED_CUSTOM_ORDER_KEY, []);

                if (savedOrder.length > 0) {
                    sortedData.sort((a, b) => {
                        const pinnedCompare = comparePinnedState(a, b);
                        if (pinnedCompare) return pinnedCompare;

                        const indexA = savedOrder.indexOf(String(a.channelId));
                        const indexB = savedOrder.indexOf(String(b.channelId));

                        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                        if (indexA !== -1) return -1;
                        if (indexB !== -1) return 1;
                        return b.msgTime - a.msgTime;
                    });
                } else {
                    sortedData.sort((a, b) => comparePinnedState(a, b) || b.msgTime - a.msgTime);
                }
            }

            renderFollowedRoomsList(filterFollowedRoomsByKeyword(sortedData));
        }

        function setFollowedCustomSortMode() {
            const sortValue = document.getElementById('followed-sort-value');
            const sortDisplay = document.getElementById('followed-sort-display');
            if (sortValue) sortValue.value = 'default';
            if (sortDisplay) sortDisplay.value = '自定义排序';
        }

        function getSavedCustomOrder() {
            const savedOrder = readJsonSetting(FOLLOWED_CUSTOM_ORDER_KEY, []);
            return Array.isArray(savedOrder) ? savedOrder.map(id => String(id)) : [];
        }

        function writeSavedCustomOrder(order) {
            writeJsonSetting(FOLLOWED_CUSTOM_ORDER_KEY, [...new Set(order.map(id => String(id)).filter(Boolean))]);
        }

        function removeChannelFromCustomOrder(channelId) {
            const targetChannelId = String(channelId || '');
            writeSavedCustomOrder(getSavedCustomOrder().filter(id => id !== targetChannelId));
            writePinnedChannelIds(getPinnedChannelIds().filter(id => id !== targetChannelId));
        }

        function getPinnedChannelIds() {
            const pinnedIds = readJsonSetting(FOLLOWED_PINNED_CHANNELS_KEY, []);
            return Array.isArray(pinnedIds) ? pinnedIds.map(id => String(id)) : [];
        }

        function writePinnedChannelIds(channelIds) {
            writeJsonSetting(FOLLOWED_PINNED_CHANNELS_KEY, [...new Set(channelIds.map(id => String(id)).filter(Boolean))]);
        }

        async function loadFollowedRooms(options = {}) {
            const { silent = false, preserveScroll = false } = options;
            const container = document.getElementById('followed-rooms-container');
            const token = getAppToken();
            if (!token) {
                container.innerHTML = '<div class="placeholder-tip"><h3>未登录</h3></div>';
                return;
            }

            const refreshBtn = document.querySelector('button[onclick="loadFollowedRooms()"]');
            if (refreshBtn && !silent) {
                refreshBtn.innerText = '刷新';
                refreshBtn.disabled = true;
            }

            const previousScrollTop = container ? container.scrollTop : 0;
            if (!silent && !container.querySelector('.session-card')) {
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
                if (preserveScroll && container) {
                    container.scrollTop = previousScrollTop;
                }

                const currentSearchId = document.getElementById('quick-follow-id')?.value;
                const currentSearchName = document.getElementById('quick-follow-input')?.value;
                if (currentSearchId) {
                    selectQuickFollowMember(currentSearchName, currentSearchId);
                }
            } catch (e) {
                if (silent) {
                    console.warn('口袋房间列表自动刷新失败:', e);
                } else {
                    container.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
                }
            } finally {
                if (refreshBtn && !silent) {
                    refreshBtn.innerText = '刷新';
                    refreshBtn.disabled = false;
                }
            }
        }

        function stopFollowedRoomsPolling() {
            followedRoomsAutoRefreshEnabled = false;
            if (followedRoomsAutoRefreshTimer) {
                clearTimeout(followedRoomsAutoRefreshTimer);
                followedRoomsAutoRefreshTimer = null;
            }
            followedRoomsAutoRefreshRunning = false;
        }

        function resetFollowedRoomsState() {
            stopFollowedRoomsPolling();
            currentFollowedData = [];
            window.allFollowedIds = new Set();
            const container = document.getElementById('followed-rooms-container');
            if (container) {
                container.innerHTML = '<div class="empty-state" style="margin-top: 50px;">正在加载房间列表</div>';
            }
            const quickInput = document.getElementById('quick-follow-input');
            const quickId = document.getElementById('quick-follow-id');
            const quickButton = document.getElementById('btn-quick-action');
            if (quickInput) quickInput.value = '';
            if (quickId) quickId.value = '';
            if (quickButton) {
                quickButton.innerText = '关注';
                quickButton.style.color = '';
                quickButton.disabled = false;
            }
        }

        function startFollowedRoomsPolling() {
            stopFollowedRoomsPolling();
            followedRoomsAutoRefreshEnabled = true;

            const scheduleNext = () => {
                if (!followedRoomsAutoRefreshEnabled) return;
                followedRoomsAutoRefreshTimer = setTimeout(runPoll, getAdaptivePollDelay());
            };

            const runPoll = async () => {
                if (!followedRoomsAutoRefreshEnabled) return;
                const view = document.getElementById('view-followed-rooms');
                if (!view || view.style.display === 'none' || followedRoomsAutoRefreshRunning) {
                    scheduleNext();
                    return;
                }

                followedRoomsAutoRefreshRunning = true;
                try {
                    await loadFollowedRooms({
                        silent: true,
                        preserveScroll: true
                    });
                } finally {
                    followedRoomsAutoRefreshRunning = false;
                    scheduleNext();
                }
            };

            scheduleNext();
        }

        function renderFollowedRoomsList(renderData) {
            const container = document.getElementById('followed-rooms-container');
            const sortMode = document.getElementById('followed-sort-value')?.value || 'default';
            const isCustomSort = sortMode === 'default';
            const searchKeyword = getFollowedListSearchKeyword();

            if (!renderData.length) {
                container.innerHTML = searchKeyword
                    ? '<div class="empty-state" style="margin-top: 50px;">未找到已关注成员</div>'
                    : '<div class="empty-state" style="margin-top: 50px;">暂无关注成员</div>';
                return;
            }

            const pinnedIdSet = new Set(getPinnedChannelIds());

            const html = renderData.map((item, index) => {
                const teamName = item.team || '';
                const isInactive = item.isInGroup === false;
                const colorStyle = getTeamStyle(teamName, isInactive);
                const isPinned = pinnedIdSet.has(String(item.channelId));
                const previousItem = index > 0 ? renderData[index - 1] : null;
                const shouldRenderPinnedDivider = previousItem
                    && pinnedIdSet.has(String(previousItem.channelId))
                    && !isPinned;
                const pinnedDividerHtml = shouldRenderPinnedDivider
                    ? '<div class="followed-pinned-divider" style="height: 1px; margin: 8px 8px; background: linear-gradient(90deg, transparent, rgba(64, 156, 255, 0.9), transparent); box-shadow: 0 0 10px rgba(64, 156, 255, 0.28);"></div>'
                    : '';

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
        ${pinnedDividerHtml}
        <div class="session-card ${isActive}" id="session-card-${escapeHtml(item.channelId)}" data-channelid="${escapeHtml(item.channelId)}" data-member-id="${escapeHtml(item.id || item.userId || '')}" data-owner-name="${escapeHtml(item.bigDisplayName)}" data-server-id="${escapeHtml(item.serverId)}" ${draggableAttr} style="padding: 12px 16px; border-bottom: 1px solid var(--border); transition: 0.2s; ${cursorStyle}">
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
                    <span style="color:var(--msg-name-member); font-weight:bold;">${escapeHtml(item.pinkStarName)}</span>: ${escapeHtml(item.lastText)}
                </div>
            </div>
        </div>
    `;
            }).join('');

            container.innerHTML = html;

            const cards = container.querySelectorAll('.session-card');
            cards.forEach(card => {
                card.addEventListener('click', () => {
                    hideFollowedRoomContextMenu();
                    window.openFollowedChat(card.dataset.ownerName, card.dataset.channelid, card.dataset.serverId);
                });
                card.addEventListener('contextmenu', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    showFollowedRoomContextMenu(event, card);
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
            writeSavedCustomOrder(newOrder);
        }

        function ensureFollowedRoomContextMenu() {
            if (followedRoomContextMenu) return followedRoomContextMenu;

            const menu = document.createElement('div');
            menu.id = 'followed-room-context-menu';
            menu.style.cssText = [
                'position: fixed',
                'z-index: 99999',
                'display: none',
                'min-width: 132px',
                'padding: 6px',
                'border-radius: 8px',
                'border: 1px solid var(--border)',
                'background: rgba(20, 24, 31, 0.98)',
                'box-shadow: 0 14px 34px rgba(0,0,0,0.35)',
                'backdrop-filter: blur(12px)',
                'color: var(--text)',
                'font-size: 13px'
            ].join(';');

            menu.innerHTML = `
                <button type="button" data-action="pin" style="width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--text); text-align: left; cursor: pointer;">置顶</button>
                <button type="button" data-action="unfollow" style="width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: #ff6b8a; text-align: left; cursor: pointer;">取关</button>
            `;

            menu.querySelectorAll('button').forEach(button => {
                button.addEventListener('mouseenter', () => {
                    button.style.background = 'rgba(255,255,255,0.08)';
                });
                button.addEventListener('mouseleave', () => {
                    button.style.background = 'transparent';
                });
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    const action = button.dataset.action;
                    const target = followedRoomContextTarget;
                    hideFollowedRoomContextMenu();
                    if (!target) return;
                    if (action === 'pin') {
                        toggleFollowedRoomPinned(target);
                    } else if (action === 'unfollow') {
                        unfollowFromFollowedRoomCard(target);
                    }
                });
            });

            document.body.appendChild(menu);
            document.addEventListener('click', hideFollowedRoomContextMenu);
            document.addEventListener('scroll', hideFollowedRoomContextMenu, true);
            window.addEventListener('resize', hideFollowedRoomContextMenu);
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') hideFollowedRoomContextMenu();
            });

            followedRoomContextMenu = menu;
            return menu;
        }

        function showFollowedRoomContextMenu(event, card) {
            const menu = ensureFollowedRoomContextMenu();
            followedRoomContextTarget = card;
            const pinButton = menu.querySelector('[data-action="pin"]');
            const channelId = String(card.dataset.channelid || '').trim();
            const isPinned = getPinnedChannelIds().includes(channelId);
            if (pinButton) {
                pinButton.textContent = isPinned ? '取消置顶' : '置顶';
            }

            menu.style.display = 'block';
            menu.style.left = '0px';
            menu.style.top = '0px';

            const rect = menu.getBoundingClientRect();
            const margin = 8;
            const left = Math.min(event.clientX, window.innerWidth - rect.width - margin);
            const top = Math.min(event.clientY, window.innerHeight - rect.height - margin);
            menu.style.left = `${Math.max(margin, left)}px`;
            menu.style.top = `${Math.max(margin, top)}px`;
        }

        function hideFollowedRoomContextMenu() {
            if (followedRoomContextMenu) {
                followedRoomContextMenu.style.display = 'none';
            }
            followedRoomContextTarget = null;
        }

        function showFollowedRoomConfirm(message, onConfirm) {
            if (typeof window.showCustomConfirm === 'function') {
                window.showCustomConfirm(escapeHtml(message), onConfirm);
                return;
            }

            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = `
                <div class="confirm-box">
                    <div class="confirm-text">${escapeHtml(message)}</div>
                    <div class="confirm-btns">
                        <button class="confirm-btn cancel" type="button">取消</button>
                        <button class="confirm-btn ok" type="button">确定</button>
                    </div>
                </div>
            `;

            const close = () => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };

            overlay.querySelector('.confirm-btn.cancel')?.addEventListener('click', close);
            overlay.querySelector('.confirm-btn.ok')?.addEventListener('click', () => {
                close();
                if (typeof onConfirm === 'function') onConfirm();
            });
            overlay.addEventListener('click', event => {
                if (event.target === overlay) close();
            });
            document.body.appendChild(overlay);
        }

        function toggleFollowedRoomPinned(card) {
            const channelId = String(card.dataset.channelid || '').trim();
            if (!channelId) return;

            const pinnedIds = getPinnedChannelIds();
            if (pinnedIds.includes(channelId)) {
                writePinnedChannelIds(pinnedIds.filter(id => id !== channelId));
                sortFollowedRooms();
                showToast(`已取消置顶 ${card.dataset.ownerName || '该房间'}`);
                return;
            }

            const currentOrder = getSavedCustomOrder();
            const visibleOrder = Array.from(document.querySelectorAll('#followed-rooms-container .session-card'))
                .map(item => item.dataset.channelid)
                .filter(Boolean);
            const mergedOrder = [
                channelId,
                ...currentOrder.filter(id => id !== channelId),
                ...visibleOrder.filter(id => id !== channelId)
            ];

            writePinnedChannelIds([channelId, ...pinnedIds.filter(id => id !== channelId)]);
            writeSavedCustomOrder(mergedOrder);
            setFollowedCustomSortMode();
            sortFollowedRooms();
            showToast(`已置顶 ${card.dataset.ownerName || '该房间'}`);
        }

        function unfollowFromFollowedRoomCard(card) {
            const memberId = String(card.dataset.memberId || '').trim();
            const channelId = String(card.dataset.channelid || '').trim();
            const memberName = card.dataset.ownerName || '该成员';
            const token = getAppToken();
            const pa = window.getPA ? window.getPA() : null;

            if (!token || !memberId) {
                showToast('取关失败：缺少成员 ID 或登录信息');
                return;
            }

            showFollowedRoomConfirm(`确定取关 ${memberName} 吗？`, async () => {
                showToast(`正在取消关注 ${memberName}`);
                try {
                    const res = await ipcRenderer.invoke('unfollow-member', { token, pa, memberId });
                    if (!res.success) {
                        showToast(`取关失败: ${res.msg || '未知错误'}`);
                        return;
                    }

                    window.allFollowedIds.delete(String(memberId));
                    currentFollowedData = currentFollowedData.filter(item => String(item.id || item.userId) !== String(memberId));
                    removeChannelFromCustomOrder(channelId);
                    sortFollowedRooms();
                    showToast(`已取消关注 ${memberName}`);
                    setTimeout(() => loadFollowedRooms({ silent: true, preserveScroll: true }), 500);
                } catch (error) {
                    showToast(`取关失败: ${error.message}`);
                }
            });
        }

        function handleQuickFollowSearch(keyword) {
            const resultBox = document.getElementById('quick-follow-results');
            const quickId = document.getElementById('quick-follow-id');
            const quickButton = document.getElementById('btn-quick-action');
            if (quickId) quickId.value = '';
            if (quickButton) {
                quickButton.innerText = '关注';
                quickButton.style.color = '';
                quickButton.disabled = false;
            }
            sortFollowedRooms();

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
            sortFollowedRooms();

            const btn = document.getElementById('btn-quick-action');
            if (window.allFollowedIds.has(String(id))) {
                btn.disabled = false;
                btn.innerText = '取关';
                btn.style.color = '#ff4d4f';
            } else {
                btn.disabled = false;
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

            if (!token || !memberId) return showToast('请先选择成员');

            const isUnfollow = window.allFollowedIds.has(String(memberId)) || btn.innerText === '取关';
            const channel = isUnfollow ? 'unfollow-member' : 'follow-member';

            showToast(`正在${isUnfollow ? '取消关注' : '关注'} ${memberName}`);

            try {
                const res = await ipcRenderer.invoke(channel, { token, pa, memberId });
                if (res.success) {
                    showToast(`${isUnfollow ? '已取消关注' : '成功关注'} ${memberName}`);

                    if (isUnfollow) {
                        const removed = currentFollowedData.find(item => String(item.id || item.userId) === String(memberId));
                        window.allFollowedIds.delete(String(memberId));
                        currentFollowedData = currentFollowedData.filter(item => String(item.id || item.userId) !== String(memberId));
                        removeChannelFromCustomOrder(removed?.channelId);
                        sortFollowedRooms();
                    } else {
                        window.allFollowedIds.add(String(memberId));
                        setTimeout(loadFollowedRooms, 500);
                    }

                    document.getElementById('quick-follow-input').value = '';
                    document.getElementById('quick-follow-id').value = '';
                    btn.disabled = false;
                    btn.innerText = "关注";
                    btn.style.color = "";
                } else {
                    showToast(`失败: ${res.msg}`);
                }
            } catch (e) {
                showToast(`错误: ${e.message}`);
            }
        }

        return {
            executeQuickAction,
            handleQuickFollowSearch,
            loadFollowedRooms,
            resetFollowedRoomsState,
            selectFollowedSort,
            selectQuickFollowMember,
            startFollowedRoomsPolling,
            stopFollowedRoomsPolling,
            sortFollowedRooms,
            toggleFollowedSortDropdown
        };
    };
})();
