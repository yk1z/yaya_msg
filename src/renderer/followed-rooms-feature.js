(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createFollowedRoomsFeature = function createFollowedRoomsFeature(deps) {
        const { escapeHtml } = window.YayaRendererUtils;
        const {
            getActiveFollowedChannel,
            getAdaptivePollDelay,
            getAppToken,
            getCurrentUserId,
            getAccountSessionGeneration,
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
        let followedRoomsPollGeneration = 0;
        let followedRoomsLoadGeneration = 0;
        let followedRoomsLastRenderHtml = '';
        let followedRoomContextMenu = null;
        let followedRoomContextTarget = null;
        let followedRoomNotificationTimer = null;
        let followedRoomNotificationRunning = false;
        let followedRoomNotificationEnabled = false;
        let followedRoomNotificationGeneration = 0;
        let followedTeamDiscoveryAt = 0;
        let followedTeamDiscoveryPromise = null;
        const followedNotificationServerDetailCache = new Map();
        window.allFollowedIds = window.allFollowedIds || new Set();
        window.followedTeamIds = window.followedTeamIds || new Set();
        const FOLLOWED_CUSTOM_ORDER_KEY = 'yaya_followed_custom_order';
        const FOLLOWED_PINNED_CHANNELS_KEY = 'yaya_followed_pinned_channels';
        const FOLLOWED_NOTIFICATION_ROOMS_KEY = 'yaya_followed_notification_rooms';
        const FOLLOWED_NOTIFICATION_CURSORS_KEY = 'yaya_followed_notification_cursors';
        const FOLLOWED_TEAM_RELATIONS_KEY = 'yaya_followed_team_relations';
        const FOLLOWED_NOTIFICATION_POLL_INTERVAL = 2000;
        const FOLLOWED_ACCOUNT_SETTING_KEYS = new Set([
            FOLLOWED_CUSTOM_ORDER_KEY,
            FOLLOWED_PINNED_CHANNELS_KEY,
            FOLLOWED_NOTIFICATION_ROOMS_KEY,
            FOLLOWED_NOTIFICATION_CURSORS_KEY,
            FOLLOWED_TEAM_RELATIONS_KEY
        ]);

        function isWebRuntime() {
            return window.desktop?.platform === 'web'
                || document.documentElement.dataset.platform === 'web';
        }

        function getFollowedNotificationAccountSuffix() {
            const userId = String(typeof getCurrentUserId === 'function' ? getCurrentUserId() || '' : '').trim();
            if (userId) return `user-${userId.replace(/[^a-z0-9_-]/gi, '_')}`;

            const token = String(getAppToken() || '').trim();
            if (!token) return 'signed-out';
            let hash = 2166136261;
            for (let index = 0; index < token.length; index += 1) {
                hash ^= token.charCodeAt(index);
                hash = Math.imul(hash, 16777619);
            }
            return `token-${(hash >>> 0).toString(36)}`;
        }

        function getFollowedSettingStorageKey(key) {
            return FOLLOWED_ACCOUNT_SETTING_KEYS.has(key)
                ? `${key}_${getFollowedNotificationAccountSuffix()}`
                : key;
        }

        function readRawJsonSetting(key, fallbackValue) {
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

        function writeRawJsonSetting(key, value) {
            if (typeof window.writeStoredJsonSetting === 'function') {
                return window.writeStoredJsonSetting(key, value);
            }
            localStorage.setItem(key, JSON.stringify(value));
            return value;
        }

        function removeRawSetting(key) {
            if (typeof window.removeStoredSetting === 'function') {
                window.removeStoredSetting(key);
                return;
            }
            localStorage.removeItem(key);
        }

        function readJsonSetting(key, fallbackValue) {
            const storageKey = getFollowedSettingStorageKey(key);
            const storedValue = readRawJsonSetting(storageKey, null);
            if (storedValue !== null) return storedValue;

            if (storageKey !== key && getFollowedNotificationAccountSuffix() !== 'signed-out') {
                const legacyValue = readRawJsonSetting(key, null);
                if (legacyValue !== null) {
                    writeRawJsonSetting(storageKey, legacyValue);
                    removeRawSetting(key);
                    return legacyValue;
                }
            }

            return fallbackValue;
        }

        function writeJsonSetting(key, value) {
            return writeRawJsonSetting(getFollowedSettingStorageKey(key), value);
        }

        function getSavedTeamRelations() {
            const saved = readJsonSetting(FOLLOWED_TEAM_RELATIONS_KEY, []);
            if (!Array.isArray(saved)) return [];
            const relations = new Map();
            saved.forEach(item => {
                const teamId = String(item?.teamId || '').trim();
                if (!teamId) return;
                relations.set(teamId, {
                    teamId,
                    starId: String(item?.starId || '').trim(),
                    serverId: String(item?.serverId || '').trim(),
                    checkedAt: Number(item?.checkedAt) || 0
                });
            });
            return Array.from(relations.values());
        }

        function writeSavedTeamRelations(relations) {
            const normalized = Array.isArray(relations) ? relations : [];
            writeJsonSetting(FOLLOWED_TEAM_RELATIONS_KEY, normalized.filter(item => item?.teamId));
        }

        function parseTeamFollowRelation(teamId, content = {}) {
            let custom = {};
            if (content?.custom && typeof content.custom === 'string') {
                try {
                    custom = JSON.parse(content.custom);
                } catch (error) {
                    console.warn('队伍关注信息解析失败:', error);
                }
            } else if (content?.custom && typeof content.custom === 'object') {
                custom = content.custom;
            }
            const jumpInfo = content?.jumpServerInfo || {};
            return {
                teamId: String(teamId || custom.teamId || jumpInfo.teamId || '').trim(),
                starId: String(content?.serverOwner || custom.serverOwner || jumpInfo.serverOwner || '').trim(),
                serverId: String(content?.serverId || custom.serverId || jumpInfo.serverId || '').trim(),
                checkedAt: Date.now()
            };
        }

        function saveTeamRelation(relation) {
            if (!relation?.teamId) return;
            const relations = getSavedTeamRelations().filter(item => item.teamId !== relation.teamId);
            relations.push(relation);
            writeSavedTeamRelations(relations);
            window.followedTeamIds.add(String(relation.teamId));
        }

        function removeTeamRelation(teamId) {
            const normalizedTeamId = String(teamId || '').trim();
            writeSavedTeamRelations(getSavedTeamRelations().filter(item => item.teamId !== normalizedTeamId));
            window.followedTeamIds.delete(normalizedTeamId);
        }

        async function checkTeamFollowRelation(relation, token, pa) {
            if (!relation?.teamId || (!relation?.starId && !relation?.channelId)) return null;
            try {
                const response = await ipcRenderer.invoke('fetch-team-follow-state', {
                    token,
                    pa,
                    teamId: relation.teamId,
                    starId: relation.starId,
                    channelId: relation.channelId
                });
                if (!response?.success || typeof response.content?.friend !== 'boolean') return null;
                if (!response.content.friend) return false;
                return parseTeamFollowRelation(relation.teamId, response.content);
            } catch (error) {
                console.warn('队伍关注状态校验失败:', error);
                return null;
            }
        }

        async function reconcileSavedTeamRelations(memberData, token, pa, force = false) {
            const savedRelations = getSavedTeamRelations();
            const now = Date.now();
            const shouldDiscover = force || !followedTeamDiscoveryAt || now - followedTeamDiscoveryAt >= 5 * 60 * 1000;
            if (!shouldDiscover) return savedRelations;
            if (followedTeamDiscoveryPromise) return followedTeamDiscoveryPromise;

            const discoveryAccountSuffix = getFollowedNotificationAccountSuffix();
            const discoveryPromise = (async () => {
                const savedByTeamId = new Map(savedRelations.map(item => [String(item.teamId), item]));
                const candidates = (Array.isArray(memberData) ? memberData : [])
                    .map(item => ({ item, target: getFollowedTarget(item) }))
                    .filter(entry => entry.target.isTeam)
                    .map(entry => ({
                        ...(savedByTeamId.get(entry.target.id) || {}),
                        teamId: entry.target.id,
                        channelId: String(entry.item.channelId || '').trim(),
                        serverId: String(entry.item.serverId || '').trim()
                    }));

                const activeRelations = [];
                for (let index = 0; index < candidates.length; index += 4) {
                    const batch = candidates.slice(index, index + 4);
                    const results = await Promise.all(batch.map(async relation => ({
                        relation,
                        result: await checkTeamFollowRelation(relation, token, pa)
                    })));
                    results.forEach(({ relation, result }) => {
                        if (result) {
                            activeRelations.push({ ...relation, ...result, checkedAt: now });
                        } else if (result === null && savedByTeamId.has(relation.teamId)) {
                            activeRelations.push(savedByTeamId.get(relation.teamId));
                        }
                    });
                }

                if (discoveryAccountSuffix !== getFollowedNotificationAccountSuffix()) {
                    return [];
                }
                followedTeamDiscoveryAt = Date.now();
                writeSavedTeamRelations(activeRelations);
                return activeRelations;
            })();
            followedTeamDiscoveryPromise = discoveryPromise;
            try {
                return await discoveryPromise;
            } finally {
                if (followedTeamDiscoveryPromise === discoveryPromise) {
                    followedTeamDiscoveryPromise = null;
                }
            }
        }

        function isFollowTargetFollowed(id, sourceType) {
            const normalizedId = String(id || '').trim();
            return Number(sourceType) === 0
                ? window.followedTeamIds.has(normalizedId)
                : window.allFollowedIds.has(normalizedId);
        }

        function getFollowedNotificationConfigs() {
            const savedConfigs = readJsonSetting(FOLLOWED_NOTIFICATION_ROOMS_KEY, []);
            if (!Array.isArray(savedConfigs)) return [];
            const members = Array.isArray(getMemberData()) ? getMemberData() : [];
            return savedConfigs
                .filter(config => config && config.channelId && config.serverId)
                .map(config => {
                    const memberId = String(config.memberId || '');
                    const mainChannelId = String(config.channelId || '');
                    const memberName = String(config.memberName || '成员');
                    const member = members.find(item => (
                        (memberId && String(item.id || item.userId || '') === memberId)
                        || String(item.channelId || '') === mainChannelId
                        || String(item.ownerName || '') === memberName
                    ));
                    return {
                        channelId: mainChannelId,
                        smallChannelId: String(
                            config.smallChannelId
                            || member?.smallChannelId
                            || member?.yklzId
                            || ''
                        ),
                        serverId: String(config.serverId),
                        memberId,
                        memberName,
                        avatarUrl: String(config.avatarUrl || getFollowedNotificationAvatar(member || {}) || '')
                    };
                });
        }

        function getFollowedNotificationRooms() {
            return getFollowedNotificationConfigs().flatMap(config => {
                const rooms = [{
                    ...config,
                    mainChannelId: config.channelId,
                    roomType: 'big',
                    roomLabel: '大房间'
                }];
                if (config.smallChannelId) {
                    rooms.push({
                        ...config,
                        channelId: config.smallChannelId,
                        mainChannelId: config.channelId,
                        roomType: 'small',
                        roomLabel: '小房间'
                    });
                }
                return rooms;
            });
        }

        function writeFollowedNotificationConfigs(configs) {
            writeJsonSetting(FOLLOWED_NOTIFICATION_ROOMS_KEY, configs);
        }

        function isFollowedRoomNotificationEnabled(channelId) {
            const target = String(channelId || '');
            return getFollowedNotificationConfigs().some(config => config.channelId === target);
        }

        function getActiveFollowedRoomCard(channelId = getActiveFollowedChannel()) {
            const target = String(channelId || '').trim();
            const cards = Array.from(document.querySelectorAll('#followed-rooms-container .session-card'));
            return cards.find(card => (
                String(card.dataset.channelid || '') === target
                || String(card.dataset.smallChannelId || '') === target
            )) || document.querySelector('#followed-rooms-container .session-card.active');
        }

        function updateFollowedRoomNotificationButton(channelId = getActiveFollowedChannel()) {
            const button = document.getElementById('btn-toggle-followed-notification');
            if (!button) return;

            if (isWebRuntime()) {
                const label = '网页版不启用发言通知';
                button.disabled = true;
                button.classList.remove('is-enabled');
                button.setAttribute('aria-pressed', 'false');
                button.setAttribute('aria-label', label);
                button.title = label;
                return;
            }

            const card = getActiveFollowedRoomCard(channelId);
            const mainChannelId = String(card?.dataset?.channelid || '').trim();
            const enabled = !!mainChannelId && isFollowedRoomNotificationEnabled(mainChannelId);
            const label = enabled ? '关闭通知' : '开启通知';
            button.classList.toggle('is-enabled', enabled);
            button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            button.setAttribute('aria-label', label);
            button.title = label;
        }

        function getAllFollowedNotificationCandidates() {
            return currentFollowedData.map(item => ({
                channelId: String(item.channelId || '').trim(),
                smallChannelId: String(item.smallChannelId || item.yklzId || '').trim(),
                serverId: String(item.serverId || '').trim(),
                memberId: String(item.id || item.userId || '').trim(),
                memberName: String(item.bigDisplayName || item.ownerName || '成员').trim(),
                avatarUrl: getFollowedNotificationAvatar(item)
            })).filter(config => config.channelId && config.serverId);
        }

        function updateAllFollowedRoomNotificationsButton() {
            const button = document.getElementById('btn-toggle-all-followed-notifications');
            if (!button) return;

            if (isWebRuntime()) {
                const label = '网页版不启用发言通知';
                const buttonLabel = button.querySelector('.followed-notification-all-label');
                if (buttonLabel) buttonLabel.textContent = '停用';
                button.disabled = true;
                button.classList.remove('is-enabled', 'is-partial', 'is-initializing');
                button.setAttribute('aria-pressed', 'false');
                button.setAttribute('aria-label', label);
                button.title = label;
                return;
            }

            const candidates = getAllFollowedNotificationCandidates();
            const enabledChannelIds = new Set(getFollowedNotificationConfigs().map(config => config.channelId));
            const enabledCount = candidates.filter(config => enabledChannelIds.has(config.channelId)).length;
            const allEnabled = candidates.length > 0 && enabledCount === candidates.length;
            const partiallyEnabled = enabledCount > 0 && !allEnabled;
            const label = allEnabled ? '一键关闭所有通知' : '一键开启所有通知';
            button.disabled = candidates.length === 0;
            button.classList.remove('is-initializing');
            const buttonLabel = button.querySelector('.followed-notification-all-label');
            if (buttonLabel) buttonLabel.textContent = allEnabled ? '全开' : partiallyEnabled ? '部分' : '全关';
            button.classList.toggle('is-enabled', allEnabled);
            button.classList.toggle('is-partial', partiallyEnabled);
            button.setAttribute('aria-pressed', allEnabled ? 'true' : partiallyEnabled ? 'mixed' : 'false');
            button.setAttribute('aria-label', label);
            button.title = label;
        }

        function toggleAllFollowedRoomNotifications() {
            if (isWebRuntime()) {
                stopFollowedRoomNotificationPolling();
                showToast('网页版不启用发言通知');
                return;
            }

            const candidates = getAllFollowedNotificationCandidates();
            if (!candidates.length) {
                showToast('暂无可开启通知的关注成员');
                updateAllFollowedRoomNotificationsButton();
                return;
            }

            const configs = getFollowedNotificationConfigs();
            const enabledChannelIds = new Set(configs.map(config => config.channelId));
            const allEnabled = candidates.every(config => enabledChannelIds.has(config.channelId));

            if (allEnabled) {
                writeFollowedNotificationConfigs([]);
                writeJsonSetting(FOLLOWED_NOTIFICATION_CURSORS_KEY, {});
                stopFollowedRoomNotificationPolling();
                showToast(`已关闭全部 ${candidates.length} 位成员的发言通知`);
            } else {
                const configsByChannelId = new Map(configs.map(config => [config.channelId, config]));
                const cursors = readJsonSetting(FOLLOWED_NOTIFICATION_CURSORS_KEY, {});
                let addedCount = 0;
                candidates.forEach(config => {
                    if (configsByChannelId.has(config.channelId)) return;
                    configsByChannelId.set(config.channelId, config);
                    delete cursors[config.channelId];
                    if (config.smallChannelId) delete cursors[config.smallChannelId];
                    addedCount += 1;
                });
                writeFollowedNotificationConfigs(Array.from(configsByChannelId.values()));
                writeJsonSetting(FOLLOWED_NOTIFICATION_CURSORS_KEY, cursors);
                startFollowedRoomNotificationPolling(0);
                showToast(`已开启全部 ${candidates.length} 位成员的发言通知${addedCount < candidates.length ? `（新增 ${addedCount} 位）` : ''}`);
            }

            sortFollowedRooms();
            updateFollowedRoomNotificationButton();
            updateAllFollowedRoomNotificationsButton();
        }

        function normalizeFollowedNotificationAvatar(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            if (/^https?:\/\//i.test(raw)) return raw;
            if (raw.startsWith('//')) return `https:${raw}`;
            return `https://source.48.cn/${raw.replace(/^\/+/, '')}`;
        }

        function getFollowedNotificationAvatar(source = {}) {
            return normalizeFollowedNotificationAvatar(
                source.starAvatar
                || source.avatarUrl
                || source.avatar
                || source.userAvatar
                || source.headImage
                || source.faceImage
                || source.picPath
                || ''
            );
        }

        function getFollowedMessageKey(message = {}) {
            return String(
                message.msgidClient
                || message.msgIdClient
                || message.msgIdServer
                || message.msgId
                || message.messageId
                || `${message.msgTime || 0}:${message.msgContent || message.bodys || ''}`
            );
        }

        function getFollowedMessageTime(message = {}) {
            return Number(message.msgTime || message.messageTime || 0) || 0;
        }

        function getFollowedMessageExtUser(message = {}) {
            if (!message.extInfo) return null;
            try {
                const safeExtInfo = typeof message.extInfo === 'string'
                    ? message.extInfo.replace(/:\s*([0-9]{16,})/g, ':"$1"')
                    : message.extInfo;
                const ext = typeof safeExtInfo === 'string' ? JSON.parse(safeExtInfo) : safeExtInfo;
                return ext?.user || null;
            } catch (error) {
                return null;
            }
        }

        function getFollowedMessageSenderAvatar(message = {}) {
            let avatarUrl = getFollowedNotificationAvatar(message);
            const extUser = getFollowedMessageExtUser(message);
            avatarUrl = getFollowedNotificationAvatar(extUser || {}) || avatarUrl;
            return avatarUrl;
        }

        function getFollowedMessageSenderName(message = {}, fallbackName = '成员') {
            const extUser = getFollowedMessageExtUser(message);
            return String(
                extUser?.nickName
                || extUser?.nickname
                || message.senderName
                || message.nickName
                || fallbackName
            ).trim() || fallbackName;
        }

        function getFollowedMessagePreview(message = {}) {
            const messageType = String(message.msgType || message.messageType || '').toUpperCase();
            const typeLabels = {
                AUDIO: '[语音消息]',
                EXPRESSIMAGE: '[表情消息]',
                IMAGE: '[图片消息]',
                VIDEO: '[视频消息]'
            };
            if (typeLabels[messageType]) return typeLabels[messageType];
            return replaceTencentEmoji(parseFollowedPreviewText(message.bodys || message.msgContent || message.content || ''));
        }

        async function fetchFollowedRoomNotificationMessages(room, token, pa) {
            const response = await ipcRenderer.invoke('fetch-room-messages', {
                token,
                pa,
                serverId: room.serverId,
                channelId: room.channelId,
                nextTime: 0,
                fetchAll: false
            });
            if (!response?.success || !response?.data?.content) {
                throw new Error(response?.msg || '获取房间消息失败');
            }
            const content = response.data.content;
            const list = content.messageList || content.message || [];
            return Array.isArray(list) ? list : [];
        }

        async function runFollowedNotificationTasks(items, concurrency, worker) {
            let nextIndex = 0;
            const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
                while (nextIndex < items.length) {
                    const item = items[nextIndex];
                    nextIndex += 1;
                    await worker(item);
                }
            });
            await Promise.all(workers);
        }

        function getCachedFollowedNotificationRoomName(room) {
            const detail = followedNotificationServerDetailCache.get(String(room.serverId || '').trim());
            const channels = Array.isArray(detail?.channelInfoList) ? detail.channelInfoList : [];
            const matchedChannel = channels.find(channel => (
                String(channel.channelId || '') === String(room.channelId || '')
            ));
            return String(matchedChannel?.channelName || room.roomLabel).trim() || room.roomLabel;
        }

        async function getFollowedNotificationRoomName(room, token, pa) {
            const serverId = String(room.serverId || '').trim();
            if (!serverId) return room.roomLabel;

            let detail = followedNotificationServerDetailCache.get(serverId);
            if (!detail) {
                try {
                    const response = await ipcRenderer.invoke('fetch-seine-server-detail', {
                        token,
                        pa,
                        serverId
                    });
                    if (response?.success && response.content) {
                        detail = response.content;
                        followedNotificationServerDetailCache.set(serverId, detail);
                    }
                } catch (error) {
                    console.warn(`[口袋通知] 获取 ${room.memberName} 的真实房间名失败:`, error);
                }
            }

            const channels = Array.isArray(detail?.channelInfoList) ? detail.channelInfoList : [];
            const matchedChannel = channels.find(channel => (
                String(channel.channelId || '') === String(room.channelId || '')
            ));
            return String(matchedChannel?.channelName || room.roomLabel).trim() || room.roomLabel;
        }

        function stopFollowedRoomNotificationPolling() {
            followedRoomNotificationGeneration += 1;
            followedRoomNotificationEnabled = false;
            if (followedRoomNotificationTimer) {
                clearTimeout(followedRoomNotificationTimer);
                followedRoomNotificationTimer = null;
            }
            followedRoomNotificationRunning = false;
        }

        function startFollowedRoomNotificationPolling(delayMs = 1000, options = {}) {
            stopFollowedRoomNotificationPolling();
            if (isWebRuntime()) return;

            followedRoomNotificationEnabled = true;
            const pollingGeneration = followedRoomNotificationGeneration;
            let silentInitialSyncPending = options?.silentInitialSync === true;

            const scheduleNext = (delay) => {
                if (!followedRoomNotificationEnabled
                    || pollingGeneration !== followedRoomNotificationGeneration) return;
                const normalizedDelay = Number(delay);
                followedRoomNotificationTimer = setTimeout(
                    runPoll,
                    Math.max(0, Number.isFinite(normalizedDelay) ? normalizedDelay : FOLLOWED_NOTIFICATION_POLL_INTERVAL)
                );
            };

            const runPoll = async () => {
                const pollStartedAt = Date.now();
                if (!followedRoomNotificationEnabled
                    || pollingGeneration !== followedRoomNotificationGeneration) return;
                if (followedRoomNotificationRunning) {
                    scheduleNext(FOLLOWED_NOTIFICATION_POLL_INTERVAL);
                    return;
                }

                const token = String(getAppToken() || '').trim();
                const savedConfigs = readJsonSetting(FOLLOWED_NOTIFICATION_ROOMS_KEY, []);
                if (!token || !Array.isArray(savedConfigs) || savedConfigs.length === 0) {
                    scheduleNext(10000);
                    return;
                }

                if (!getMemberDataLoaded()) {
                    try {
                        await loadMemberData();
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/followed-rooms-feature.js'); }
                }
                const rooms = getFollowedNotificationRooms();
                if (rooms.length === 0) {
                    scheduleNext(10000);
                    return;
                }

                followedRoomNotificationRunning = true;
                try {
                    const pa = window.getPA ? window.getPA() : null;
                    const serverIdList = [...new Set(rooms.map(room => room.serverId).filter(Boolean))];
                    const latestResponse = await ipcRenderer.invoke('fetch-last-messages', {
                        token,
                        pa,
                        serverIdList
                    });
                    if (!followedRoomNotificationEnabled
                        || pollingGeneration !== followedRoomNotificationGeneration) return;
                    const lastMessages = latestResponse?.content?.lastMsgList || [];
                    const lastMessagesByChannel = new Map(lastMessages.map(message => [
                        String(message.channelId || ''),
                        message
                    ]));
                    const cursors = readJsonSetting(FOLLOWED_NOTIFICATION_CURSORS_KEY, {});
                    const pendingNotificationsByMember = new Map();
                    const detailFetchesByChannel = new Map();
                    let cursorChanged = false;

                    const roomsNeedingDetails = rooms.filter(room => {
                        const lastMessage = lastMessagesByChannel.get(room.channelId);
                        if (!lastMessage) return false;
                        const previous = cursors[room.channelId];
                        const hasPreviousMessageCursor = !!previous
                            && Array.isArray(previous.recentMessageKeys)
                            && previous.recentMessageKeys.length > 0;
                        if (silentInitialSyncPending || !hasPreviousMessageCursor) return true;
                        const previousPreviewKey = String(previous.previewKey || previous.key || '');
                        return getFollowedMessageKey(lastMessage) !== previousPreviewKey;
                    });

                    const roomsByServer = [...new Map(roomsNeedingDetails.map(room => [room.serverId, room])).values()];
                    await Promise.all([
                        runFollowedNotificationTasks(roomsNeedingDetails, 8, async room => {
                            try {
                                const messages = await fetchFollowedRoomNotificationMessages(room, token, pa);
                                detailFetchesByChannel.set(room.channelId, { messages });
                            } catch (error) {
                                detailFetchesByChannel.set(room.channelId, { error });
                            }
                        }),
                        runFollowedNotificationTasks(roomsByServer, 8, async room => {
                            try {
                                await getFollowedNotificationRoomName(room, token, pa);
                            } catch (error) {
                                console.warn(`[口袋通知] 获取 ${room.memberName} 的房间名失败:`, error);
                            }
                        })
                    ]);
                    if (!followedRoomNotificationEnabled
                        || pollingGeneration !== followedRoomNotificationGeneration) return;

                    for (const room of rooms) {
                        const lastMessage = lastMessagesByChannel.get(room.channelId);
                        if (silentInitialSyncPending && !lastMessage) {
                            if (Object.prototype.hasOwnProperty.call(cursors, room.channelId)) {
                                delete cursors[room.channelId];
                                cursorChanged = true;
                            }
                            continue;
                        }
                        if (!lastMessage) continue;

                        const nextTime = getFollowedMessageTime(lastMessage);
                        const nextKey = getFollowedMessageKey(lastMessage);
                        const previous = cursors[room.channelId];

                        const hasPreviousMessageCursor = !!previous
                            && Array.isArray(previous.recentMessageKeys)
                            && previous.recentMessageKeys.length > 0;
                        if (silentInitialSyncPending || !hasPreviousMessageCursor) {
                            try {
                                const detailFetch = detailFetchesByChannel.get(room.channelId);
                                if (detailFetch?.error) throw detailFetch.error;
                                const initialMessages = detailFetch?.messages || [];
                                const newest = [...initialMessages].sort((left, right) => (
                                    getFollowedMessageTime(right) - getFollowedMessageTime(left)
                                ))[0] || lastMessage;
                                const initialMessageKeys = [...new Set(initialMessages
                                    .map(message => getFollowedMessageKey(message))
                                    .filter(Boolean))].slice(0, 100);
                                const initialLatestTime = Math.max(
                                    nextTime,
                                    ...initialMessages.map(message => getFollowedMessageTime(message))
                                );
                                cursors[room.channelId] = {
                                    previewKey: nextKey,
                                    messageKey: getFollowedMessageKey(newest),
                                    msgTime: initialLatestTime,
                                    recentMessageKeys: initialMessageKeys
                                };
                            } catch (error) {
                                cursors[room.channelId] = {
                                    previewKey: nextKey,
                                    messageKey: '',
                                    msgTime: nextTime
                                };
                            }
                            cursorChanged = true;
                            continue;
                        }

                        const previousTime = Number(previous.msgTime) || 0;
                        const previousPreviewKey = String(previous.previewKey || previous.key || '');
                        if (nextKey === previousPreviewKey) continue;

                        let detailMessages;
                        try {
                            const detailFetch = detailFetchesByChannel.get(room.channelId);
                            if (detailFetch?.error) throw detailFetch.error;
                            detailMessages = detailFetch?.messages || [];
                        } catch (error) {
                            console.warn(`[口袋通知] 获取 ${room.memberName} 的新增消息失败:`, error);
                            continue;
                        }

                        const previousMessageKey = String(previous.messageKey || '');
                        const knownMessageKeys = new Set([
                            previousMessageKey,
                            ...(Array.isArray(previous.recentMessageKeys) ? previous.recentMessageKeys : [])
                        ].filter(Boolean));
                        const previousIndex = previousMessageKey
                            ? detailMessages.findIndex(message => getFollowedMessageKey(message) === previousMessageKey)
                            : -1;
                        const messagesBeforePrevious = new Set((previousIndex >= 0
                            ? detailMessages.slice(0, previousIndex)
                            : []).map(message => getFollowedMessageKey(message)));
                        const freshMessages = detailMessages
                            .filter(message => {
                                const senderId = String(message.senderUserId || message.senderId || message.uid || '');
                                if (senderId === '121569667') return false;
                                const messageKey = getFollowedMessageKey(message);
                                if (messageKey && knownMessageKeys.has(messageKey)) return false;
                                const messageTime = getFollowedMessageTime(message);
                                if (messageTime > previousTime) return true;
                                if (messageTime === previousTime && messageTime > 0) return true;
                                return messageTime === 0 && messagesBeforePrevious.has(messageKey);
                            })
                            .sort((left, right) => getFollowedMessageTime(left) - getFollowedMessageTime(right));

                        const detailMessageKeys = [...new Set(detailMessages
                            .map(message => getFollowedMessageKey(message))
                            .filter(Boolean))];
                        const recentMessageKeys = [...new Set([
                            ...detailMessageKeys,
                            ...knownMessageKeys
                        ])].slice(0, 100);
                        const newestDetailMessage = [...detailMessages].sort((left, right) => (
                            getFollowedMessageTime(right) - getFollowedMessageTime(left)
                        ))[0] || lastMessage;
                        const latestDetailTime = Math.max(
                            previousTime,
                            nextTime,
                            ...detailMessages.map(message => getFollowedMessageTime(message))
                        );

                        cursors[room.channelId] = {
                            previewKey: nextKey,
                            messageKey: getFollowedMessageKey(newestDetailMessage),
                            msgTime: latestDetailTime,
                            recentMessageKeys
                        };
                        cursorChanged = true;

                        if (freshMessages.length === 0) continue;

                        const newestMessage = freshMessages[freshMessages.length - 1];
                        const senderName = getFollowedMessageSenderName(newestMessage, room.memberName);
                        const messagePreview = getFollowedMessagePreview(newestMessage);
                        const iconUrl = getFollowedMessageSenderAvatar(newestMessage)
                            || getFollowedNotificationAvatar(lastMessage)
                            || room.avatarUrl;

                        const memberKey = String(room.memberId || room.mainChannelId || room.memberName);
                        const pendingNotification = {
                            room,
                            newestMessage,
                            messageTime: getFollowedMessageTime(newestMessage) || nextTime,
                            senderName,
                            messagePreview,
                            iconUrl
                        };
                        const existingNotification = pendingNotificationsByMember.get(memberKey);
                        if (!existingNotification || pendingNotification.messageTime >= existingNotification.messageTime) {
                            pendingNotificationsByMember.set(memberKey, pendingNotification);
                        }

                    }

                    for (const pendingNotification of pendingNotificationsByMember.values()) {
                        if (!followedRoomNotificationEnabled
                            || pollingGeneration !== followedRoomNotificationGeneration) return;
                        const { room, senderName, messagePreview, iconUrl } = pendingNotification;
                        const roomName = getCachedFollowedNotificationRoomName(room);
                        try {
                            const notificationResult = await ipcRenderer.invoke('show-system-notification', {
                                title: `${room.memberName} · ${roomName}`,
                                body: `${senderName}：${messagePreview}`,
                                iconUrl,
                                memberName: room.memberName,
                                channelId: room.channelId,
                                mainChannelId: room.mainChannelId,
                                serverId: room.serverId,
                                roomType: room.roomType,
                                theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
                            });
                            if (notificationResult?.success === false) {
                                showToast(notificationResult.msg || '系统通知发送失败');
                            }
                        } catch (error) {
                            console.warn('[口袋通知] 系统通知发送失败:', error);
                        }
                    }

                    if (cursorChanged) {
                        writeJsonSetting(FOLLOWED_NOTIFICATION_CURSORS_KEY, cursors);
                    }
                    silentInitialSyncPending = false;
                } catch (error) {
                    console.warn('[口袋通知] 后台检查失败:', error);
                } finally {
                    if (pollingGeneration !== followedRoomNotificationGeneration) return;
                    followedRoomNotificationRunning = false;
                    const elapsed = Date.now() - pollStartedAt;
                    scheduleNext(Math.max(100, FOLLOWED_NOTIFICATION_POLL_INTERVAL - elapsed));
                }
            };

            followedRoomNotificationTimer = setTimeout(runPoll, Math.max(0, Number(delayMs) || 0));
        }

        function removeFollowedRoomNotification(channelId) {
            const targetChannelId = String(channelId || '');
            if (!targetChannelId) return;
            const removedConfig = getFollowedNotificationConfigs().find(config => config.channelId === targetChannelId);
            writeFollowedNotificationConfigs(
                getFollowedNotificationConfigs().filter(config => config.channelId !== targetChannelId)
            );
            const cursors = readJsonSetting(FOLLOWED_NOTIFICATION_CURSORS_KEY, {});
            const cursorIds = [targetChannelId, removedConfig?.smallChannelId].filter(Boolean);
            let cursorsChanged = false;
            cursorIds.forEach(cursorId => {
                if (!Object.prototype.hasOwnProperty.call(cursors, cursorId)) return;
                delete cursors[cursorId];
                cursorsChanged = true;
            });
            if (cursorsChanged) {
                writeJsonSetting(FOLLOWED_NOTIFICATION_CURSORS_KEY, cursors);
            }
        }

        async function toggleFollowedRoomNotification(card) {
            if (isWebRuntime()) {
                stopFollowedRoomNotificationPolling();
                showToast('网页版不启用发言通知');
                return;
            }

            const channelId = String(card?.dataset?.channelid || '').trim();
            const smallChannelId = String(card?.dataset?.smallChannelId || '').trim();
            const serverId = String(card?.dataset?.serverId || '').trim();
            const memberName = String(card?.dataset?.ownerName || '成员').trim();
            if (!channelId || !serverId) {
                showToast('无法开启通知：缺少房间参数');
                return;
            }

            const configs = getFollowedNotificationConfigs();
            const existingIndex = configs.findIndex(config => config.channelId === channelId);
            if (existingIndex >= 0) {
                removeFollowedRoomNotification(channelId);
                showToast(`已关闭 ${memberName} 的发言通知`);
            } else {
                configs.push({
                    channelId,
                    smallChannelId,
                    serverId,
                    memberId: String(card.dataset.memberId || ''),
                    memberName,
                    avatarUrl: String(card.dataset.avatarUrl || '')
                });
                writeFollowedNotificationConfigs(configs);
                const cursors = readJsonSetting(FOLLOWED_NOTIFICATION_CURSORS_KEY, {});
                delete cursors[channelId];
                if (smallChannelId) delete cursors[smallChannelId];
                writeJsonSetting(FOLLOWED_NOTIFICATION_CURSORS_KEY, cursors);
                startFollowedRoomNotificationPolling(0);
                showToast(`已开启 ${memberName} 的发言通知`);
            }
            sortFollowedRooms();
            updateFollowedRoomNotificationButton(channelId);
        }

        function toggleActiveFollowedRoomNotification() {
            const card = getActiveFollowedRoomCard();
            if (!card) {
                showToast('请先选择成员房间');
                return;
            }
            toggleFollowedRoomNotification(card);
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

            if (messageType === 'REPLY' || messageType === 'GIFTREPLY') {
                const info = json.replyInfo || json.giftReplyInfo || json;
                if (typeof info.text === 'string' && info.text.trim()) {
                    return info.text;
                }
                const replyName = String(info.replyName || '用户').trim();
                const replyText = String(info.replyText || '').trim();
                return replyText ? `[回复 ${replyName}] ${replyText}` : '[回复消息]';
            }

            if (messageType === 'AUDIO_REPLY' || messageType === 'AUDIO_GIFT_REPLY') {
                const info = json.replyInfo || json.giftReplyInfo || json;
                return typeof info.text === 'string' && info.text.trim()
                    ? info.text
                    : '[语音回复消息]';
            }

            if (messageType === 'IMAGE') return '[图片消息]';
            if (messageType === 'EXPRESSIMAGE') return '[表情消息]';
            if (messageType === 'AUDIO') return '[语音消息]';
            if (messageType === 'VIDEO') return '[视频消息]';

            if (messageType.includes('FLIPCARD')) {
                const info = json.flipCardInfo
                    || json.filpCardInfo
                    || json.flipCardAudioInfo
                    || json.filpCardAudioInfo
                    || json.flipCardVideoInfo
                    || json.filpCardVideoInfo
                    || json;
                const answer = String(info.answer || '').trim();
                return answer && !answer.startsWith('{') ? answer : '[翻牌回复]';
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

        function getFollowedTarget(item) {
            const memberId = String(item?.id || item?.userId || '').trim();
            const teamId = String(item?.teamId || '').trim();
            const ownerName = String(item?.ownerName || '').trim().toUpperCase();
            const teamName = String(item?.team || '').trim().toUpperCase();
            const isTeamRecord = String(item?.groupName || '').trim() === '队伍'
                || (!!item?.serverId && !!item?.channelId && !!ownerName && ownerName === teamName);
            const isTeam = !memberId && !!teamId && isTeamRecord;
            return {
                id: isTeam ? teamId : memberId,
                type: isTeam ? 0 : 1,
                isTeam
            };
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
                } catch (_) { window.YayaRendererUtils.reportIgnoredError(_, 'src/renderer/followed-rooms-feature.js'); }
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

        function sortFollowedRooms(options = {}) {
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

            renderFollowedRoomsList(filterFollowedRoomsByKeyword(sortedData), options);
        }

        function openFollowedRoomByChannelId(channelId) {
            const normalizedChannelId = String(channelId || '').trim();
            if (!normalizedChannelId || typeof window.openFollowedChat !== 'function') return false;

            const matchesChannel = room => (
                String(room.channelId || '') === normalizedChannelId
                || String(room.smallChannelId || room.yklzId || '') === normalizedChannelId
            );
            const item = currentFollowedData.find(matchesChannel)
                || getMemberData().find(matchesChannel);
            if (!item) return false;

            const mainChannelId = String(item.channelId || '').trim();
            const smallChannelId = String(item.smallChannelId || item.yklzId || '').trim();
            const isSmallRoom = Boolean(smallChannelId && smallChannelId === normalizedChannelId);
            const followTarget = getFollowedTarget(item);
            const rawOwnerName = String(item.bigDisplayName || item.ownerName || item.name || '成员');
            const displayName = rawOwnerName.replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48)-/, '') || rawOwnerName;
            window.openFollowedChat(
                displayName,
                normalizedChannelId,
                String(item.serverId || ''),
                {
                    mainChannelId: mainChannelId || normalizedChannelId,
                    roomType: isSmallRoom ? 'small' : 'big',
                    memberId: followTarget.isTeam ? '' : followTarget.id
                }
            );
            return true;
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
            const { silent = false, preserveScroll = false, skipTeamDiscovery = false } = options;
            const container = document.getElementById('followed-rooms-container');
            const token = getAppToken();
            if (!token) {
                container.innerHTML = '<div class="placeholder-tip"><h3>未登录</h3></div>';
                return;
            }
            const loadGeneration = ++followedRoomsLoadGeneration;
            const accountGeneration = typeof getAccountSessionGeneration === 'function'
                ? getAccountSessionGeneration()
                : 0;
            const isCurrentAccount = () => (
                String(getAppToken() || '').trim() === String(token || '').trim()
                && (typeof getAccountSessionGeneration !== 'function'
                    || getAccountSessionGeneration() === accountGeneration)
            );
            const isCurrentRequest = () => (
                loadGeneration === followedRoomsLoadGeneration
                && isCurrentAccount()
            );

            const refreshBtn = document.querySelector('button[onclick="loadFollowedRooms()"]');
            if (refreshBtn && !silent) {
                refreshBtn.innerText = '刷新';
                refreshBtn.disabled = true;
            }

            if (!silent && !container.querySelector('.session-card')) {
                container.innerHTML = '<div class="empty-state">正在加载</div>';
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const friendsRes = await ipcRenderer.invoke('fetch-friends-ids', { token, pa });
                if (!isCurrentRequest()) return;
                if (friendsRes.status !== 200 || !friendsRes.content?.data) throw new Error('获取失败');

                const memberFollowedIds = Array.isArray(friendsRes.content.data)
                    ? friendsRes.content.data.map(id => String(id))
                    : [];

                if (!getMemberDataLoaded()) await loadMemberData();
                if (!isCurrentRequest()) return;

                const memberData = getMemberData();
                const teamRelations = getSavedTeamRelations();
                const teamFollowedIds = teamRelations.map(item => String(item.teamId));
                const followedIds = [...new Set([...memberFollowedIds, ...teamFollowedIds])];
                window.followedTeamIds = new Set(teamFollowedIds);
                window.allFollowedIds = new Set(followedIds);

                const followedMembers = [];
                const serverIds = new Set();
                followedIds.forEach(uid => {
                    const followedId = String(uid);
                    const member = memberData.find(m => String(m.id || m.userId || '') === followedId)
                        || memberData.find(m => {
                            const target = getFollowedTarget(m);
                            return target.isTeam && target.id === followedId;
                        });
                    if (member && member.channelId) {
                        followedMembers.push(member);
                        if (member.serverId) serverIds.add(member.serverId);
                    }
                });

                const msgRes = await ipcRenderer.invoke('fetch-last-messages', {
                    token, pa, serverIdList: Array.from(serverIds)
                });
                if (!isCurrentRequest()) return;

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

                sortFollowedRooms({ preserveScroll });
                if (isWebRuntime()) {
                    window.dispatchEvent(new CustomEvent('yaya:followed-rooms-loaded'));
                }

                const currentSearchId = document.getElementById('quick-follow-id')?.value;
                const currentSearchName = document.getElementById('quick-follow-input')?.value;
                const currentSearchType = document.getElementById('quick-follow-type')?.value;
                if (currentSearchId) {
                    selectQuickFollowMember(currentSearchName, currentSearchId, currentSearchType);
                }

                const shouldRefreshTeams = !silent
                    || !followedTeamDiscoveryAt
                    || Date.now() - followedTeamDiscoveryAt >= 5 * 60 * 1000;
                if (!skipTeamDiscovery && shouldRefreshTeams && !followedTeamDiscoveryPromise) {
                    const previousTeamIds = new Set(teamFollowedIds);
                    void reconcileSavedTeamRelations(memberData, token, pa, !silent)
                        .then(nextRelations => {
                            if (!isCurrentAccount()) return;
                            const nextTeamIds = new Set(nextRelations.map(item => String(item.teamId)));
                            const changed = nextTeamIds.size !== previousTeamIds.size
                                || Array.from(nextTeamIds).some(id => !previousTeamIds.has(id));
                            if (changed) {
                                loadFollowedRooms({
                                    silent: true,
                                    preserveScroll: true,
                                    skipTeamDiscovery: true
                                });
                            }
                        })
                        .catch(error => console.warn('队伍关注状态后台更新失败:', error));
                }
            } catch (e) {
                if (!isCurrentRequest()) return;
                if (silent) {
                    console.warn('口袋房间列表自动刷新失败:', e);
                } else {
                    container.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
                }
            } finally {
                if (isCurrentAccount() && refreshBtn && !silent) {
                    refreshBtn.innerText = '刷新';
                    refreshBtn.disabled = false;
                }
            }
        }

        function stopFollowedRoomsPolling() {
            followedRoomsPollGeneration += 1;
            followedRoomsAutoRefreshEnabled = false;
            if (followedRoomsAutoRefreshTimer) {
                clearTimeout(followedRoomsAutoRefreshTimer);
                followedRoomsAutoRefreshTimer = null;
            }
            followedRoomsAutoRefreshRunning = false;
        }

        function resetFollowedRoomsState() {
            followedRoomsLoadGeneration += 1;
            stopFollowedRoomsPolling();
            stopFollowedRoomNotificationPolling();
            followedNotificationServerDetailCache.clear();
            followedTeamDiscoveryAt = 0;
            followedTeamDiscoveryPromise = null;
            currentFollowedData = [];
            followedRoomsLastRenderHtml = '';
            window.allFollowedIds = new Set();
            window.followedTeamIds = new Set();
            const container = document.getElementById('followed-rooms-container');
            if (container) {
                container.innerHTML = '<div class="empty-state" style="margin-top: 50px;">正在加载房间列表</div>';
            }
            const quickInput = document.getElementById('quick-follow-input');
            const quickId = document.getElementById('quick-follow-id');
            const quickType = document.getElementById('quick-follow-type');
            const quickButton = document.getElementById('btn-quick-action');
            if (quickInput) quickInput.value = '';
            if (quickId) quickId.value = '';
            if (quickType) quickType.value = '1';
            if (quickButton) {
                quickButton.innerText = '关注';
                quickButton.style.color = '';
                quickButton.disabled = false;
            }
        }

        function startFollowedRoomsPolling() {
            stopFollowedRoomsPolling();
            followedRoomsAutoRefreshEnabled = true;
            const pollingGeneration = followedRoomsPollGeneration;

            const scheduleNext = () => {
                if (!followedRoomsAutoRefreshEnabled || pollingGeneration !== followedRoomsPollGeneration) return;
                followedRoomsAutoRefreshTimer = setTimeout(runPoll, getAdaptivePollDelay());
            };

            const runPoll = async () => {
                if (!followedRoomsAutoRefreshEnabled || pollingGeneration !== followedRoomsPollGeneration) return;
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
                    if (pollingGeneration !== followedRoomsPollGeneration) return;
                    followedRoomsAutoRefreshRunning = false;
                    scheduleNext();
                }
            };

            scheduleNext();
        }

        function captureFollowedRoomsScrollAnchor(container) {
            if (!container) return null;
            const containerRect = container.getBoundingClientRect();
            const cards = Array.from(container.querySelectorAll('.session-card'));
            const anchorCard = cards.find(card => card.getBoundingClientRect().bottom > containerRect.top + 1);
            return {
                scrollTop: container.scrollTop,
                channelId: anchorCard?.dataset.channelid || '',
                offsetTop: anchorCard
                    ? anchorCard.getBoundingClientRect().top - containerRect.top
                    : null
            };
        }

        function restoreFollowedRoomsScrollAnchor(container, scrollState) {
            if (!container || !scrollState) return;
            container.scrollTop = scrollState.scrollTop;
            if (!scrollState.channelId || scrollState.offsetTop === null) return;

            const anchorCard = Array.from(container.querySelectorAll('.session-card'))
                .find(card => card.dataset.channelid === scrollState.channelId);
            if (!anchorCard) return;
            const containerRect = container.getBoundingClientRect();
            const currentOffsetTop = anchorCard.getBoundingClientRect().top - containerRect.top;
            container.scrollTop += currentOffsetTop - scrollState.offsetTop;
        }

        function renderFollowedRoomsList(renderData, options = {}) {
            const { preserveScroll = false } = options;
            const container = document.getElementById('followed-rooms-container');
            const scrollState = preserveScroll ? captureFollowedRoomsScrollAnchor(container) : null;
            const sortMode = document.getElementById('followed-sort-value')?.value || 'default';
            const isCustomSort = sortMode === 'default';
            const searchKeyword = getFollowedListSearchKeyword();

            if (!renderData.length) {
                const emptyHtml = searchKeyword
                    ? '<div class="empty-state" style="margin-top: 50px;">未找到已关注成员</div>'
                    : '<div class="empty-state" style="margin-top: 50px;">暂无关注成员</div>';
                if (emptyHtml !== followedRoomsLastRenderHtml) {
                    container.innerHTML = emptyHtml;
                    followedRoomsLastRenderHtml = emptyHtml;
                }
                updateAllFollowedRoomNotificationsButton();
                return;
            }

            const pinnedIdSet = new Set(getPinnedChannelIds());
            const html = renderData.map((item, index) => {
                const followTarget = getFollowedTarget(item);
                const teamName = item.team || '';
                const isInactive = !followTarget.isTeam && item.isInGroup === false;
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
                const notificationAvatarUrl = getFollowedNotificationAvatar(item);
                const memberId = followTarget.isTeam ? '' : followTarget.id;
                const memberNames = new Set([
                    String(item.bigDisplayName || '').trim(),
                    String(item.ownerName || '').trim(),
                    String(item.pinkStarName || '').replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48)-/, '').trim()
                ].filter(Boolean));
                const scannedRoomRadios = Array.isArray(window.yayaRoomRadioScanResults)
                    ? window.yayaRoomRadioScanResults
                    : [];
                const memberMatchesRadio = result => {
                    const voiceUsers = Array.isArray(result.voiceUsers) ? result.voiceUsers : [];
                    if (voiceUsers.some(user => memberId && String(user.userId || '') === memberId)) return true;
                    if (voiceUsers.some(user => memberNames.has(String(user.name || '').trim()))) return true;
                    return voiceUsers.length === 0 && memberNames.has(String(result.name || '').trim());
                };
                const activeRadio = scannedRoomRadios.find(memberMatchesRadio);
                const playingRadioKey = String(window.yayaActiveRoomRadioScanKey || '');
                const playingRadio = scannedRoomRadios.find(result => (
                    `${String(result.serverId || '')}:${String(result.channelId || '')}` === playingRadioKey
                ));
                const currentFollowedChannelId = String(getActiveFollowedChannel() || '');
                const isCurrentFollowedRoom = [
                    String(item.channelId || ''),
                    String(item.smallChannelId || item.yklzId || '')
                ].includes(currentFollowedChannelId);
                const isListeningRadio = (!!playingRadio && memberMatchesRadio(playingRadio))
                    || (!!playingRadioKey && isCurrentFollowedRoom);
                const isMutedRadio = window.yayaRoomRadioMuted === true
                    && (isListeningRadio || isCurrentFollowedRoom);
                const radioButtonHtml = !isWebRuntime() && activeRadio ? `
                    <button type="button" class="followed-room-radio-listen${isListeningRadio ? ' is-listening' : ''}${isMutedRadio ? ' is-muted' : ''}"
                        data-radio-channel-id="${escapeHtml(activeRadio.channelId)}"
                        data-radio-server-id="${escapeHtml(activeRadio.serverId)}"
                        title="${isMutedRadio ? '取消静音' : isListeningRadio ? '静音' : '正在上麦，进入房间后自动收听'}"
                        aria-label="${isMutedRadio ? '取消静音' : isListeningRadio ? '静音' : '正在上麦，进入房间后自动收听'}"
                        aria-pressed="${isMutedRadio ? 'true' : 'false'}" draggable="false">
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                            <rect x="8" y="3" width="8" height="12" rx="4"></rect>
                            <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path>
                            <path class="followed-room-radio-mute-slash" d="M4 4l16 16"></path>
                        </svg>
                    </button>` : '';

                const isActive = String(getActiveFollowedChannel()) === String(item.channelId) ? 'active' : '';
                const draggableAttr = isCustomSort ? 'draggable="true"' : '';
                const cursorStyle = isCustomSort ? 'cursor: grab;' : 'cursor: pointer;';

                return `
        ${pinnedDividerHtml}
        <div class="session-card ${isActive}" id="session-card-${escapeHtml(item.channelId)}" data-channelid="${escapeHtml(item.channelId)}" data-small-channel-id="${escapeHtml(item.smallChannelId || item.yklzId || '')}" data-member-id="${escapeHtml(memberId)}" data-follow-source-id="${escapeHtml(followTarget.id)}" data-follow-source-type="${followTarget.type}" data-owner-name="${escapeHtml(item.bigDisplayName)}" data-server-id="${escapeHtml(item.serverId)}" data-avatar-url="${escapeHtml(notificationAvatarUrl)}" ${draggableAttr} style="padding: 12px 16px; border-bottom: 1px solid var(--border); transition: 0.2s; ${cursorStyle}">
            <div class="session-info" style="flex: 1; min-width: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="display: flex; align-items: center; min-width: 0; flex: 1;">
                        <div class="session-title" style="font-size: 15px; font-weight: bold; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${escapeHtml(item.bigDisplayName)}
                        </div>
                        ${radioButtonHtml}
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

            if (html === followedRoomsLastRenderHtml && container.querySelector('.session-card')) {
                updateFollowedRoomNotificationButton();
                updateAllFollowedRoomNotificationsButton();
                return;
            }

            container.classList.add('is-refreshing-list');
            container.innerHTML = html;
            followedRoomsLastRenderHtml = html;
            restoreFollowedRoomsScrollAnchor(container, scrollState);
            requestAnimationFrame(() => {
                restoreFollowedRoomsScrollAnchor(container, scrollState);
                requestAnimationFrame(() => {
                    restoreFollowedRoomsScrollAnchor(container, scrollState);
                    container.classList.remove('is-refreshing-list');
                });
            });

            const cards = container.querySelectorAll('.session-card');
            cards.forEach(card => {
                card.addEventListener('click', () => {
                    hideFollowedRoomContextMenu();
                    window.openFollowedChat(card.dataset.ownerName, card.dataset.channelid, card.dataset.serverId, {
                        memberId: card.dataset.memberId
                    });
                });
                card.addEventListener('contextmenu', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    showFollowedRoomContextMenu(event, card);
                });
            });
            container.querySelectorAll('.followed-room-radio-listen').forEach(button => {
                button.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof window.toggleScannedRoomRadioMute === 'function') {
                        window.toggleScannedRoomRadioMute(
                            button.dataset.radioChannelId,
                            button.dataset.radioServerId
                        );
                    }
                });
                button.addEventListener('mousedown', event => event.stopPropagation());
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
            updateFollowedRoomNotificationButton();
            updateAllFollowedRoomNotificationsButton();
        }

        window.addEventListener('yaya-room-radio-scan-updated', () => {
            if (currentFollowedData.length) sortFollowedRooms({ preserveScroll: true });
        });

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
            menu.className = 'yaya-context-menu';
            menu.style.cssText = [
                'position: fixed',
                'z-index: 99999',
                'display: none',
                'min-width: 132px'
            ].join(';');

            menu.innerHTML = `
                <button type="button" data-action="notify" class="yaya-context-menu-item">开启通知</button>
                <button type="button" data-action="pin" class="yaya-context-menu-item">置顶</button>
                <button type="button" data-action="unfollow" class="yaya-context-menu-item yaya-context-menu-danger">取关</button>
            `;

            menu.querySelectorAll('button').forEach(button => {
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    const action = button.dataset.action;
                    const target = followedRoomContextTarget;
                    hideFollowedRoomContextMenu();
                    if (!target) return;
                    if (action === 'notify') {
                        toggleFollowedRoomNotification(target);
                    } else if (action === 'pin') {
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
            const notificationButton = menu.querySelector('[data-action="notify"]');
            const channelId = String(card.dataset.channelid || '').trim();
            const isPinned = getPinnedChannelIds().includes(channelId);
            if (pinButton) {
                pinButton.textContent = isPinned ? '取消置顶' : '置顶';
            }
            if (notificationButton) {
                notificationButton.textContent = isFollowedRoomNotificationEnabled(channelId)
                    ? '关闭通知'
                    : '开启通知';
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
            const sourceId = String(card.dataset.followSourceId || card.dataset.memberId || '').trim();
            const sourceType = Number(card.dataset.followSourceType) === 0 ? 0 : 1;
            const channelId = String(card.dataset.channelid || '').trim();
            const memberName = card.dataset.ownerName || (sourceType === 0 ? '该队伍' : '该成员');
            const token = getAppToken();
            const pa = window.getPA ? window.getPA() : null;

            if (!token || !sourceId) {
                showToast(`取关失败：缺少${sourceType === 0 ? '队伍' : '成员'} ID 或登录信息`);
                return;
            }

            showFollowedRoomConfirm(`确定取关 ${memberName} 吗？`, async () => {
                showToast(`正在取消关注 ${memberName}`);
                try {
                    const res = await ipcRenderer.invoke('unfollow-member', {
                        token,
                        pa,
                        sourceId,
                        toType: sourceType
                    });
                    if (!res.success) {
                        showToast(`取关失败: ${res.msg || '未知错误'}`);
                        return;
                    }

                    window.allFollowedIds.delete(sourceId);
                    if (sourceType === 0) removeTeamRelation(sourceId);
                    currentFollowedData = currentFollowedData.filter(item => {
                        const target = getFollowedTarget(item);
                        return target.id !== sourceId || target.type !== sourceType;
                    });
                    removeChannelFromCustomOrder(channelId);
                    removeFollowedRoomNotification(channelId);
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
            const quickType = document.getElementById('quick-follow-type');
            const quickButton = document.getElementById('btn-quick-action');
            if (quickId) quickId.value = '';
            if (quickType) quickType.value = '1';
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
                const target = getFollowedTarget(m);
                if (!target.id) return false;
                const matchName = String(m.ownerName || '').includes(keyword);
                const pinyin = m.pinyin || "";
                const initials = getPinyinInitials(pinyin);
                const team = target.isTeam ? String(m.team || '').toLowerCase() : '';
                const groupName = target.isTeam ? String(m.groupName || '').toLowerCase() : '';
                return matchName
                    || pinyin.toLowerCase().includes(lowerKw)
                    || initials.toLowerCase().includes(lowerKw)
                    || team.includes(lowerKw)
                    || groupName.includes(lowerKw);
            });

            matches.sort(memberSortLogic);

            if (matches.length > 0) {
                const html = matches.slice(0, 10).map(m => {
                    const target = getFollowedTarget(m);
                    const isInactive = !target.isTeam && m.isInGroup === false;
                    const colorStyle = getTeamStyle(m.team, isInactive);
                    return `
                <div class="suggestion-item" data-name="${escapeHtml(m.ownerName)}" data-id="${escapeHtml(target.id)}" data-source-type="${target.type}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px;">
                    <span style="font-weight:bold; font-size:12px; ${isInactive ? 'opacity:0.6' : ''}">${escapeHtml(m.ownerName)}</span>
                    <span class="team-tag" style="font-size:10px; padding:0 4px; height:16px; line-height:14px; ${colorStyle}">${target.isTeam ? '队伍' : escapeHtml(m.team)}</span>
                </div>`;
                }).join('');
                resultBox.innerHTML = html;
                resultBox.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', () => selectQuickFollowMember(
                        item.dataset.name,
                        item.dataset.id,
                        item.dataset.sourceType
                    ));
                });
                resultBox.style.display = 'block';
            } else {
                resultBox.innerHTML = '<div class="suggestion-item" style="font-size:12px; color:#999;">未找到该成员或队伍</div>';
                resultBox.style.display = 'block';
            }
        }

        function selectQuickFollowMember(name, id, sourceType = 1) {
            document.getElementById('quick-follow-input').value = name;
            document.getElementById('quick-follow-id').value = id;
            document.getElementById('quick-follow-type').value = Number(sourceType) === 0 ? '0' : '1';
            document.getElementById('quick-follow-results').style.display = 'none';
            sortFollowedRooms();

            const btn = document.getElementById('btn-quick-action');
            if (isFollowTargetFollowed(id, sourceType)) {
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
            const sourceType = Number(document.getElementById('quick-follow-type')?.value) === 0 ? 0 : 1;
            const btn = document.getElementById('btn-quick-action');
            const token = getAppToken();
            const pa = window.getPA ? window.getPA() : null;

            if (!token || !memberId) return showToast('请先选择成员');

            const isUnfollow = isFollowTargetFollowed(memberId, sourceType) || btn.innerText === '取关';
            const channel = isUnfollow ? 'unfollow-member' : 'follow-member';

            showToast(`正在${isUnfollow ? '取消关注' : '关注'} ${memberName}`);

            try {
                const res = await ipcRenderer.invoke(channel, {
                    token,
                    pa,
                    sourceId: memberId,
                    toType: sourceType
                });
                if (res.success) {
                    if (!isUnfollow && sourceType === 0) {
                        const relation = parseTeamFollowRelation(memberId, res.content);
                        if (!relation.starId) {
                            throw new Error('服务器未返回队伍所有者 ID，无法确认关注状态');
                        }
                        saveTeamRelation(relation);
                        let confirmed = await checkTeamFollowRelation(relation, token, pa);
                        if (confirmed === false) {
                            await new Promise(resolve => setTimeout(resolve, 700));
                            confirmed = await checkTeamFollowRelation(relation, token, pa);
                        }
                        if (confirmed === false) {
                            removeTeamRelation(memberId);
                            throw new Error('服务器未确认队伍关注，请稍后重试');
                        }
                        if (confirmed) saveTeamRelation(confirmed);
                    }
                    showToast(`${isUnfollow ? '已取消关注' : '成功关注'} ${memberName}`);

                    if (isUnfollow) {
                        const removed = currentFollowedData.find(item => {
                            const target = getFollowedTarget(item);
                            return target.id === String(memberId) && target.type === sourceType;
                        });
                        window.allFollowedIds.delete(String(memberId));
                        if (sourceType === 0) removeTeamRelation(memberId);
                        currentFollowedData = currentFollowedData.filter(item => {
                            const target = getFollowedTarget(item);
                            return target.id !== String(memberId) || target.type !== sourceType;
                        });
                        removeChannelFromCustomOrder(removed?.channelId);
                        removeFollowedRoomNotification(removed?.channelId);
                        sortFollowedRooms();
                    } else {
                        window.allFollowedIds.add(String(memberId));
                        setTimeout(loadFollowedRooms, 500);
                    }

                    document.getElementById('quick-follow-input').value = '';
                    document.getElementById('quick-follow-id').value = '';
                    document.getElementById('quick-follow-type').value = '1';
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
            openFollowedRoomByChannelId,
            resetFollowedRoomsState,
            selectFollowedSort,
            selectQuickFollowMember,
            startFollowedRoomNotificationPolling,
            startFollowedRoomsPolling,
            stopFollowedRoomNotificationPolling,
            stopFollowedRoomsPolling,
            sortFollowedRooms,
            toggleActiveFollowedRoomNotification,
            toggleAllFollowedRoomNotifications,
            toggleFollowedSortDropdown,
            updateAllFollowedRoomNotificationsButton,
            updateFollowedRoomNotificationButton
        };
    };
})();
