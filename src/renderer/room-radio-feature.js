(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createRoomRadioFeature = function createRoomRadioFeature(deps) {
        const {
            getAppToken,
            getMemberData,
            getMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle,
            applyRoomRadioChannelValue,
            setRoomRadioRoomType,
            ipcRenderer,
            showToast
        } = deps;

        const ROOM_RADIO_SCAN_CONCURRENCY = 24;
        const ROOM_RADIO_SCAN_REQUEST_GAP_MS = 20;
        const ROOM_RADIO_AUTO_SCAN_INTERVAL_MS = 60000;
        const AUTO_ROOM_RADIO_RECORD_ENABLED_KEY = 'yaya_auto_room_radio_record_enabled';
        const AUTO_ROOM_RADIO_RECORD_MEMBERS_KEY = 'yaya_auto_room_radio_record_members';
        const AUTO_ROOM_RADIO_RECORD_POLL_INTERVAL_MS = 3000;
        const IS_WEB_PLATFORM = window.desktop?.platform === 'web'
            || document.documentElement?.dataset?.platform === 'web';

        let radioMpegtsPlayer = null;
        let radioHlsPlayer = null;
        let radioMediaElement = null;
        let roomRadioEndWatchdog = null;
        let roomRadioStartupTimer = null;
        let roomRadioLastCurrentTime = 0;
        let roomRadioStallCount = 0;
        let roomRadioHasStartedPlayback = false;
        let roomRadioRecorder = null;
        let isRoomRadioRecording = false;
        let isRoomRadioRecordingStarting = false;
        let roomRadioRecordingStartToken = 0;
        let pendingRoomRadioRecordingSessionId = '';
        let activeRoomRadioMemberName = '';
        let activeRoomRadioContainer = null;
        let roomRadioPlaybackRequestId = 0;
        let roomRadioScanRunId = 0;
        let isRoomRadioScanning = false;
        let roomRadioScanTotal = 0;
        let roomRadioScanCompleted = 0;
        let roomRadioScanFailed = 0;
        let roomRadioScanResults = [];
        let roomRadioScanCompletedAt = 0;
        let roomRadioScanCompletedScope = '';
        let roomRadioScannedChannelIds = new Set();
        let activeRoomRadioScanKey = '';
        let pendingFollowedRoomRadioAutoConnect = null;
        let roomRadioAutoScanTimer = null;
        let isRoomRadioAutoScanEnabled = false;
        let roomRadioAutoScanFollowedOnly = false;
        let autoRoomRadioRecordEnabled = false;
        let autoRoomRadioRecordMembers = [];
        let autoRoomRadioRecordPollTimer = null;
        let autoRoomRadioRecordPollRunning = false;
        const autoRoomRadioRecordTasks = new Map();

        function readStringSetting(key, fallbackValue = '') {
            if (typeof window.readStoredStringSetting === 'function') {
                return window.readStoredStringSetting(key, fallbackValue);
            }
            const legacyValue = localStorage.getItem(key);
            return legacyValue === null ? fallbackValue : String(legacyValue);
        }

        function getRoomRadioSearchResultBox() {
            return document.getElementById('room-radio-search-results');
        }

        function handleRoomRadioSearch(keyword) {
            const resultBox = getRoomRadioSearchResultBox();
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
                return matchName || matchPinyin || String(initials).toLowerCase().includes(lowerKeyword);
            });

            matches.sort(memberSortLogic);

            if (!matches.length) {
                resultBox.style.display = 'none';
                return;
            }

            resultBox.innerHTML = matches.slice(0, 10).map(member => {
                const isInactive = member.isInGroup === false;
                const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';
                const colorStyle = typeof getTeamStyle === 'function'
                    ? (getTeamStyle(member.team, isInactive) || '')
                    : '';

                return `<div class="suggestion-item"
                         onclick="selectRoomRadioMember('${member.ownerName}', '${member.channelId}', '${member.serverId}', '${member.yklzId || ''}')"
                         style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight:bold; ${baseStyle}">${member.ownerName}</span>
                        <span class="team-tag" style="${baseStyle} ${colorStyle}">${member.team}</span>
                    </div>`;
            }).join('');
            resultBox.style.display = 'block';
        }

        function selectRoomRadioMember(name, channelId, serverId, smallChannelId = '') {
            const inputEl = document.getElementById('room-radio-member-input');
            const channelInput = document.getElementById('room-radio-channel-id');
            const serverInput = document.getElementById('room-radio-server-id');
            const resultBox = getRoomRadioSearchResultBox();

            if (inputEl) inputEl.value = name || '';
            if (channelInput) {
                channelInput.dataset.bigChannelId = channelId || '';
                channelInput.dataset.smallChannelId = smallChannelId || '';
            }
            applyRoomRadioChannelValue();
            if (serverInput) serverInput.value = serverId || '';
            if (resultBox) resultBox.style.display = 'none';
        }

        function normalizeRoomRadioChannelId(value) {
            const channelId = String(value || '').trim();
            return /^\d+$/.test(channelId) && channelId !== '0' ? channelId : '';
        }

        function getRoomRadioScanElements() {
            return {
                button: document.getElementById('btn-room-radio-scan'),
                progressCopy: document.getElementById('room-radio-scan-progress-copy'),
                progressText: document.getElementById('room-radio-scan-progress-text'),
                detected: document.getElementById('room-radio-scan-detected'),
                summary: document.getElementById('room-radio-scan-summary'),
                results: document.getElementById('room-radio-scan-results')
            };
        }

        function setRoomRadioScanButton({ disabled = false, text = '' } = {}) {
            const { button } = getRoomRadioScanElements();
            if (!button) return;
            button.disabled = disabled;
            button.textContent = text || (isRoomRadioScanning ? '停止扫描' : '刷新列表');
            button.classList.toggle('btn-danger', isRoomRadioScanning);
            button.classList.toggle('btn-secondary', !isRoomRadioScanning);
        }

        function getRoomRadioScanVoiceUserCount() {
            return roomRadioScanResults.reduce((total, item) => {
                const voiceUserCount = Array.isArray(item.voiceUsers) ? item.voiceUsers.length : 0;
                return total + Math.max(1, voiceUserCount);
            }, 0);
        }

        function updateRoomRadioScanProgress(statusText = '') {
            const { progressCopy, progressText, detected, summary } = getRoomRadioScanElements();
            if (progressCopy) progressCopy.hidden = false;
            const percent = roomRadioScanTotal > 0
                ? Math.min(100, Math.round((roomRadioScanCompleted / roomRadioScanTotal) * 100))
                : 0;
            if (progressText) {
                progressText.textContent = statusText
                    || `正在扫描（${percent}%）`;
            }
            if (detected) detected.textContent = `已检测 ${roomRadioScanCompleted}/${roomRadioScanTotal}`;
            if (summary) {
                summary.textContent = `上麦 ${getRoomRadioScanVoiceUserCount()} · 异常 ${roomRadioScanFailed}`;
            }
        }

        function getRoomRadioMemberId(member) {
            return String(member?.id || member?.userId || '').trim();
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

        function normalizeAutoRoomRadioRecordMember(member) {
            const id = String(member?.id || member?.userId || member?.ownerId || member?.memberId || '').trim();
            const name = String(member?.name || member?.ownerName || member?.nickname || member?.nickName || '').trim();
            if (!id || !name) return null;
            return {
                id,
                name,
                team: String(member?.team || member?.groupName || '').trim()
            };
        }

        function normalizeStoredAutoRoomRadioRecordMembers(value) {
            const result = [];
            const seen = new Set();
            (Array.isArray(value) ? value : []).forEach(item => {
                const member = normalizeAutoRoomRadioRecordMember(item);
                if (!member || seen.has(member.id)) return;
                seen.add(member.id);
                result.push(member);
            });
            return result;
        }

        function persistAutoRoomRadioRecordSettings() {
            writeJsonSetting(AUTO_ROOM_RADIO_RECORD_ENABLED_KEY, autoRoomRadioRecordEnabled);
            writeJsonSetting(AUTO_ROOM_RADIO_RECORD_MEMBERS_KEY, autoRoomRadioRecordMembers);
        }

        function updateAutoRoomRadioRecordUi() {
            const button = document.getElementById('btn-auto-room-radio-record');
            const checkbox = document.getElementById('auto-room-radio-record-enabled');
            const status = document.getElementById('auto-room-radio-record-status');
            const count = document.getElementById('auto-room-radio-record-member-count');
            const activeCount = autoRoomRadioRecordTasks.size;
            if (button) {
                button.textContent = activeCount > 0 ? `自动录制 ${activeCount}` : '自动录制';
                button.classList.toggle('is-recording', activeCount > 0);
                button.title = autoRoomRadioRecordEnabled
                    ? `已启用，监控 ${autoRoomRadioRecordMembers.length} 位成员${activeCount ? `，正在录制 ${activeCount} 路` : ''}`
                    : '设置上麦自动录制成员';
            }
            if (checkbox) checkbox.checked = autoRoomRadioRecordEnabled;
            if (count) count.textContent = `${autoRoomRadioRecordMembers.length} 位`;
            if (status) {
                if (!autoRoomRadioRecordEnabled) status.textContent = '尚未启用';
                else if (!autoRoomRadioRecordMembers.length) status.textContent = '请先添加需要自动录制的成员';
                else status.textContent = `正在监控 ${autoRoomRadioRecordMembers.length} 位成员`;
            }
        }

        function renderAutoRoomRadioRecordMembers() {
            const container = document.getElementById('auto-room-radio-record-member-list');
            if (!container) return;
            container.replaceChildren();
            if (!autoRoomRadioRecordMembers.length) {
                const empty = document.createElement('div');
                empty.className = 'auto-live-record-member-empty';
                empty.textContent = '还没有成员，请在上方搜索添加';
                container.appendChild(empty);
                return;
            }

            autoRoomRadioRecordMembers.forEach(member => {
                const item = document.createElement('div');
                item.className = 'auto-live-record-member-item';
                const copy = document.createElement('span');
                copy.className = 'auto-live-record-member-copy';
                const name = document.createElement('b');
                name.textContent = member.name;
                const detail = document.createElement('small');
                const task = autoRoomRadioRecordTasks.get(member.id);
                detail.textContent = task ? '正在自动录制' : `ID ${member.id}`;
                copy.append(name, detail);
                const actions = document.createElement('span');
                actions.className = 'auto-live-record-member-actions';
                if (member.team) {
                    const team = document.createElement('span');
                    team.className = 'team-tag';
                    team.textContent = member.team;
                    if (typeof getTeamStyle === 'function') team.style.cssText = getTeamStyle(member.team, false) || '';
                    actions.appendChild(team);
                }
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'auto-live-record-member-remove';
                remove.textContent = '移除';
                remove.addEventListener('click', () => removeAutoRoomRadioRecordMember(member.id));
                actions.appendChild(remove);
                item.append(copy, actions);
                container.appendChild(item);
            });
        }

        function addAutoRoomRadioRecordMember(rawMember) {
            const member = normalizeAutoRoomRadioRecordMember(rawMember);
            if (!member) return;
            if (!autoRoomRadioRecordMembers.some(item => item.id === member.id)) {
                autoRoomRadioRecordMembers.push(member);
                persistAutoRoomRadioRecordSettings();
            }
            const input = document.getElementById('auto-room-radio-record-member-search');
            const results = document.getElementById('auto-room-radio-record-member-results');
            if (input) input.value = '';
            if (results) results.style.display = 'none';
            renderAutoRoomRadioRecordMembers();
            updateAutoRoomRadioRecordUi();
            if (autoRoomRadioRecordEnabled) scheduleAutoRoomRadioRecordPoll(0);
        }

        function stopAutoRoomRadioRecordTask(memberId) {
            const task = autoRoomRadioRecordTasks.get(String(memberId || '').trim());
            if (!task || task.stopRequested) return;
            task.stopRequested = true;
            ipcRenderer.send('stop-record', { taskId: task.taskId, fileName: task.fileName });
        }

        function removeAutoRoomRadioRecordMember(memberId) {
            const normalizedId = String(memberId || '').trim();
            stopAutoRoomRadioRecordTask(normalizedId);
            autoRoomRadioRecordMembers = autoRoomRadioRecordMembers.filter(item => item.id !== normalizedId);
            persistAutoRoomRadioRecordSettings();
            renderAutoRoomRadioRecordMembers();
            updateAutoRoomRadioRecordUi();
        }

        function searchAutoRoomRadioRecordMembers(keyword = '') {
            const results = document.getElementById('auto-room-radio-record-member-results');
            const input = document.getElementById('auto-room-radio-record-member-search');
            if (!results || (input && document.activeElement !== input)) return;
            const query = String(keyword || '').trim().toLowerCase();
            results.replaceChildren();
            results.scrollTop = 0;
            if (!query) {
                results.style.display = 'none';
                return;
            }
            const selectedIds = new Set(autoRoomRadioRecordMembers.map(item => item.id));
            const source = Array.isArray(getMemberData()) ? getMemberData() : [];
            const matches = source.filter(member => {
                const normalized = normalizeAutoRoomRadioRecordMember(member);
                if (!normalized || selectedIds.has(normalized.id)) return false;
                const pinyin = String(member?.pinyin || '');
                const initials = typeof getPinyinInitials === 'function' ? String(getPinyinInitials(pinyin) || '') : '';
                return normalized.name.toLowerCase().includes(query)
                    || pinyin.toLowerCase().includes(query)
                    || initials.toLowerCase().includes(query);
            }).sort(memberSortLogic).slice(0, 12);

            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'suggestion-item';
                empty.textContent = '没有匹配的成员';
                empty.style.cursor = 'default';
                results.appendChild(empty);
            } else {
                matches.forEach(member => {
                    const normalized = normalizeAutoRoomRadioRecordMember(member);
                    const row = document.createElement('div');
                    row.className = 'suggestion-item';
                    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
                    const name = document.createElement('b');
                    name.textContent = normalized.name;
                    const team = document.createElement('span');
                    team.className = 'team-tag';
                    team.textContent = normalized.team || `ID ${normalized.id}`;
                    if (typeof getTeamStyle === 'function') team.style.cssText = getTeamStyle(normalized.team, member?.isInGroup === false) || '';
                    row.append(name, team);
                    row.addEventListener('click', () => addAutoRoomRadioRecordMember(member));
                    results.appendChild(row);
                });
            }
            results.style.display = 'block';
        }

        async function openAutoRoomRadioRecordModal() {
            const modal = document.getElementById('autoRoomRadioRecordModal');
            if (!modal) return;
            modal.style.display = 'flex';
            updateAutoRoomRadioRecordUi();
            renderAutoRoomRadioRecordMembers();
            if (!getMemberDataLoaded() && typeof loadMemberData === 'function') {
                try {
                    await loadMemberData();
                } catch (error) {
                    console.warn('上麦自动录制成员名单加载失败:', error);
                }
            }
        }

        function closeAutoRoomRadioRecordModal() {
            const modal = document.getElementById('autoRoomRadioRecordModal');
            const results = document.getElementById('auto-room-radio-record-member-results');
            if (modal) modal.style.display = 'none';
            if (results) results.style.display = 'none';
        }

        function toggleAutoRoomRadioRecording(enabled) {
            if (IS_WEB_PLATFORM) {
                autoRoomRadioRecordEnabled = false;
                updateAutoRoomRadioRecordUi();
                showToast('网页端已禁用上麦请求');
                return;
            }
            autoRoomRadioRecordEnabled = enabled === true;
            persistAutoRoomRadioRecordSettings();
            updateAutoRoomRadioRecordUi();
            if (autoRoomRadioRecordEnabled) {
                if (!autoRoomRadioRecordMembers.length) showToast('请先添加需要自动录制的成员');
                scheduleAutoRoomRadioRecordPoll(0);
            } else {
                if (autoRoomRadioRecordPollTimer) clearTimeout(autoRoomRadioRecordPollTimer);
                autoRoomRadioRecordPollTimer = null;
                autoRoomRadioRecordTasks.forEach((_, memberId) => stopAutoRoomRadioRecordTask(memberId));
            }
        }

        function getRoomRadioScanKey(item) {
            return `${String(item?.serverId || '')}:${String(item?.channelId || '')}`;
        }

        function publishRoomRadioScanState() {
            window.yayaRoomRadioScanResults = [...roomRadioScanResults];
            window.yayaActiveRoomRadioScanKey = activeRoomRadioScanKey;
            window.yayaRoomRadioMuted = !!radioMediaElement?.muted;
            window.dispatchEvent(new CustomEvent('yaya-room-radio-scan-updated', {
                detail: {
                    results: window.yayaRoomRadioScanResults,
                    activeKey: activeRoomRadioScanKey,
                    muted: !!radioMediaElement?.muted,
                    scanning: isRoomRadioScanning
                }
            }));
        }

        async function getRoomRadioFollowedMemberIds(token) {
            try {
                const pa = window.getPA ? window.getPA() : null;
                const response = await ipcRenderer.invoke('fetch-friends-ids', { token, pa });
                const followedIds = response?.content?.data;
                if (response?.status === 200 && Array.isArray(followedIds)) {
                    const followedMemberIds = new Set(followedIds.map(id => String(id)).filter(Boolean));
                    window.allFollowedIds = followedMemberIds;
                    return followedMemberIds;
                }
                throw new Error(response?.message || response?.msg || '获取关注列表失败');
            } catch (error) {
                console.warn('读取关注列表失败，将继续扫描全部成员:', error);
                return window.allFollowedIds instanceof Set
                    ? new Set([...window.allFollowedIds].map(id => String(id)).filter(Boolean))
                    : new Set();
            }
        }

        function createRoomRadioScanTaskList(memberList, followedMemberIds = new Set(), preferredChannelId = '') {
            const tasks = [];
            const seenChannels = new Set();
            const normalizedPreferredChannelId = normalizeRoomRadioChannelId(preferredChannelId);
            const isFollowedMember = member => followedMemberIds.has(getRoomRadioMemberId(member));
            const isPreferredMember = member => [
                normalizeRoomRadioChannelId(member.channelId),
                normalizeRoomRadioChannelId(member.smallChannelId || member.yklzId)
            ].includes(normalizedPreferredChannelId);
            const sortedMembers = [...memberList].sort((left, right) => {
                const preferredOrder = Number(isPreferredMember(right)) - Number(isPreferredMember(left));
                if (preferredOrder) return preferredOrder;
                const followedOrder = Number(isFollowedMember(right)) - Number(isFollowedMember(left));
                return followedOrder || memberSortLogic(left, right);
            });

            sortedMembers.forEach(member => {
                const name = String(member.ownerName || member.name || member.nickname || '').trim();
                const serverId = String(member.serverId || '').trim();
                const bigChannelId = normalizeRoomRadioChannelId(member.channelId);
                const smallChannelId = normalizeRoomRadioChannelId(member.smallChannelId || member.yklzId);
                if (!name) return;

                const addTask = (channelId, roomType) => {
                    if (!channelId) return;
                    const channelKey = `${serverId}:${channelId}`;
                    if (seenChannels.has(channelKey)) return;
                    seenChannels.add(channelKey);
                    tasks.push({
                        name,
                        team: String(member.team || member.groupName || '').trim(),
                        inactive: member.isInGroup === false,
                        serverId,
                        channelId,
                        bigChannelId,
                        smallChannelId,
                        roomType,
                        followed: isFollowedMember(member)
                    });
                };

                const roomTasks = [
                    { channelId: bigChannelId, roomType: 'big' },
                    { channelId: smallChannelId, roomType: 'small' }
                ].sort((left, right) => (
                    Number(right.channelId === normalizedPreferredChannelId)
                    - Number(left.channelId === normalizedPreferredChannelId)
                ));
                roomTasks.forEach(room => addTask(room.channelId, room.roomType));
            });

            return tasks;
        }

        function getActiveRoomRadioVoiceUsers(content, memberList, fallbackTask) {
            const voiceUserList = Array.isArray(content?.voiceUserList) ? content.voiceUserList : [];
            return voiceUserList
                .filter(user => user && user.voiceStatus !== false)
                .map(user => {
                    const member = memberList.find(item => String(item.id || item.userId || '') === String(user.userId || ''));
                    return {
                        userId: String(user.userId || ''),
                        name: String(user.nickname || member?.ownerName || member?.name || fallbackTask.name || '未知成员').trim(),
                        avatar: String(user.avatar || member?.avatar || ''),
                        team: String(member?.team || member?.groupName || '').trim(),
                        inactive: member ? member.isInGroup === false : false
                    };
                });
        }

        function createRoomRadioScanResult(task, result, memberList) {
            const voiceUsers = getActiveRoomRadioVoiceUsers(result?.content, memberList, task);
            const voiceNames = [...new Set(voiceUsers.map(user => user.name).filter(Boolean))];
            const teams = [...new Set(voiceUsers.map(user => user.team).filter(Boolean))];
            return {
                ...task,
                roomOwnerName: task.name,
                name: voiceNames.join('、') || task.name,
                team: teams.length === 1 ? teams[0] : task.team,
                inactive: voiceUsers.length ? voiceUsers.every(user => user.inactive) : task.inactive,
                voiceUsers,
                streamUrl: result.content.streamUrl
            };
        }

        function upsertRoomRadioScanResult(nextResult) {
            const resultKey = getRoomRadioScanKey(nextResult);
            const existingIndex = roomRadioScanResults.findIndex(item => getRoomRadioScanKey(item) === resultKey);
            if (existingIndex >= 0) {
                roomRadioScanResults[existingIndex] = nextResult;
            } else {
                roomRadioScanResults.push(nextResult);
            }
        }

        function removeRoomRadioScanResult(task) {
            const taskKey = getRoomRadioScanKey(task);
            const previousLength = roomRadioScanResults.length;
            roomRadioScanResults = roomRadioScanResults.filter(item => getRoomRadioScanKey(item) !== taskKey);
            return roomRadioScanResults.length !== previousLength;
        }

        function hasActiveRoomRadioVoiceUser(content) {
            return Array.isArray(content?.voiceUserList)
                && content.voiceUserList.some(user => user && user.voiceStatus !== false);
        }

        function renderRoomRadioScanResults({ finished = false, cancelled = false } = {}) {
            const { results } = getRoomRadioScanElements();
            publishRoomRadioScanState();
            if (!results) return;
            results.replaceChildren();

            if (!roomRadioScanResults.length) {
                results.hidden = true;
                return;
            }
            results.hidden = false;

            const sortedResults = [...roomRadioScanResults].sort((left, right) => {
                if (left.inactive !== right.inactive) return left.inactive ? 1 : -1;
                const nameOrder = left.name.localeCompare(right.name, 'zh-CN');
                if (nameOrder !== 0) return nameOrder;
                return left.roomType === 'big' ? -1 : 1;
            });

            const fragment = document.createDocumentFragment();
            sortedResults.forEach(item => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'room-radio-scan-card';
                card.title = `收听${item.name}的${item.roomType === 'small' ? '小房间' : '大房间'}上麦`;
                card.addEventListener('click', () => openRoomRadioScanResult(item));

                const main = document.createElement('span');
                main.className = 'room-radio-scan-card-main';
                const title = document.createElement('span');
                title.className = 'room-radio-scan-card-title';

                const name = document.createElement('span');
                name.className = 'room-radio-scan-card-name';
                name.textContent = item.name;
                title.appendChild(name);

                if (item.team) {
                    const team = document.createElement('span');
                    team.className = 'team-tag';
                    team.textContent = item.team;
                    if (typeof getTeamStyle === 'function') {
                        team.style.cssText += getTeamStyle(item.team, item.inactive) || '';
                    }
                    title.appendChild(team);
                }

                const roomType = document.createElement('span');
                roomType.className = `room-radio-scan-room-type is-${item.roomType}`;
                roomType.textContent = item.roomType === 'small' ? '小房间' : '大房间';
                title.appendChild(roomType);

                if (item.inactive) {
                    const inactive = document.createElement('span');
                    inactive.className = 'room-radio-scan-inactive';
                    inactive.textContent = '非现役';
                    title.appendChild(inactive);
                }

                let meta = null;
                if (item.roomOwnerName && item.roomOwnerName !== item.name) {
                    meta = document.createElement('span');
                    meta.className = 'room-radio-scan-card-meta';
                    const roomOwner = document.createElement('span');
                    roomOwner.textContent = `房间: ${item.roomOwnerName}`;
                    meta.appendChild(roomOwner);
                }

                main.appendChild(title);
                if (meta) main.appendChild(meta);
                const action = document.createElement('span');
                action.className = 'room-radio-scan-card-action';
                action.textContent = '收听 ›';
                card.append(main, action);
                fragment.appendChild(card);
            });
            results.appendChild(fragment);
        }

        async function openRoomRadioScanResult(item) {
            selectRoomRadioMember(item.name, item.bigChannelId, item.serverId, item.smallChannelId);
            if (typeof setRoomRadioRoomType === 'function') {
                setRoomRadioRoomType(item.roomType === 'small');
            }
            await connectRoomRadio();
        }

        function isRoomRadioOfflineResult(result) {
            if (result?.success) return !result?.content?.streamUrl;
            const message = String(result?.msg || result?.message || '');
            return /未开启|没有开启|未开通|已结束|电台未开启|获取失败/.test(message);
        }

        function formatAutoRoomRadioRecordTime(date = new Date()) {
            const pad = value => String(value).padStart(2, '0');
            return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
        }

        function getCurrentAutoRoomRadioMember(member) {
            const source = Array.isArray(getMemberData()) ? getMemberData() : [];
            return source.find(item => getRoomRadioMemberId(item) === member.id) || member;
        }

        function isTargetMemberInVoiceList(content, member) {
            const voiceUsers = Array.isArray(content?.voiceUserList) ? content.voiceUserList : null;
            if (!voiceUsers) return true;
            const normalizedName = String(member.name || '').replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48)-/, '').trim();
            return voiceUsers.some(user => user && user.voiceStatus !== false && (
                String(user.userId || '').trim() === member.id
                || String(user.nickname || '').replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48)-/, '').trim() === normalizedName
            ));
        }

        async function detectAutoRoomRadioRecordState(member, token, pa) {
            const currentMember = getCurrentAutoRoomRadioMember(member);
            const channels = [...new Set([
                normalizeRoomRadioChannelId(currentMember.channelId),
                normalizeRoomRadioChannelId(currentMember.smallChannelId || currentMember.yklzId)
            ].filter(Boolean))];
            if (!channels.length) return { state: 'unknown' };

            let hadUnknownResult = false;
            for (const channelId of channels) {
                try {
                    const result = await ipcRenderer.invoke('fetch-room-radio', {
                        token,
                        pa,
                        channelId,
                        serverId: String(currentMember.serverId || '').trim()
                    });
                    if (
                        result?.success
                        && result?.content?.streamUrl
                        && isTargetMemberInVoiceList(result.content, member)
                    ) {
                        return {
                            state: 'active',
                            streamUrl: result.content.streamUrl,
                            channelId
                        };
                    }
                    if (result?.success && result?.content?.streamUrl) {
                        continue;
                    }
                    if (!isRoomRadioOfflineResult(result)) hadUnknownResult = true;
                } catch (error) {
                    hadUnknownResult = true;
                    console.warn(`检测${member.name}上麦状态失败:`, error);
                }
            }
            return { state: hadUnknownResult ? 'unknown' : 'offline' };
        }

        function startAutoRoomRadioRecordTask(member, detection) {
            if (autoRoomRadioRecordTasks.has(member.id) || !detection?.streamUrl) return;
            const fileName = `房间上麦_【${member.name}】${formatAutoRoomRadioRecordTime()}`;
            const taskId = `auto_room_radio_record_${member.id}_${Date.now()}`;
            autoRoomRadioRecordTasks.set(member.id, {
                taskId,
                fileName,
                channelId: detection.channelId,
                missedPolls: 0,
                stopRequested: false
            });
            ipcRenderer.send('start-record', {
                url: detection.streamUrl,
                taskId,
                savePath: readStringSetting('yaya_path_room_radio', ''),
                fileName,
                recordType: 'room-radio'
            });
            showToast(`已开始自动录制上麦：${member.name}`);
            updateAutoRoomRadioRecordUi();
            renderAutoRoomRadioRecordMembers();
        }

        function scheduleAutoRoomRadioRecordPoll(delay = AUTO_ROOM_RADIO_RECORD_POLL_INTERVAL_MS) {
            if (autoRoomRadioRecordPollTimer) clearTimeout(autoRoomRadioRecordPollTimer);
            autoRoomRadioRecordPollTimer = null;
            if (IS_WEB_PLATFORM || !autoRoomRadioRecordEnabled) return;
            autoRoomRadioRecordPollTimer = setTimeout(pollAutoRoomRadioRecordMembers, Math.max(0, delay));
        }

        async function pollAutoRoomRadioRecordMembers() {
            autoRoomRadioRecordPollTimer = null;
            if (IS_WEB_PLATFORM || !autoRoomRadioRecordEnabled) return;
            if (autoRoomRadioRecordPollRunning) {
                scheduleAutoRoomRadioRecordPoll();
                return;
            }
            autoRoomRadioRecordPollRunning = true;
            try {
                const token = getAppToken ? getAppToken() : (typeof window.getAppToken === 'function' ? window.getAppToken() : '');
                if (!token || !autoRoomRadioRecordMembers.length) return;
                if (!getMemberDataLoaded() && typeof loadMemberData === 'function') await loadMemberData();
                const pa = window.getPA ? window.getPA() : null;
                const detections = await Promise.all(autoRoomRadioRecordMembers.map(async member => ({
                    member,
                    detection: await detectAutoRoomRadioRecordState(member, token, pa)
                })));

                detections.forEach(({ member, detection }) => {
                    const task = autoRoomRadioRecordTasks.get(member.id);
                    if (detection.state === 'active') {
                        if (task) task.missedPolls = 0;
                        else startAutoRoomRadioRecordTask(member, detection);
                        return;
                    }
                    if (!task || detection.state === 'unknown' || task.stopRequested) return;
                    task.missedPolls += 1;
                    if (task.missedPolls >= 2) {
                        stopAutoRoomRadioRecordTask(member.id);
                        showToast(`${member.name} 已下麦，正在保存录制`);
                    }
                });
            } catch (error) {
                console.warn('上麦自动录制状态检测失败:', error);
            } finally {
                autoRoomRadioRecordPollRunning = false;
                scheduleAutoRoomRadioRecordPoll();
            }
        }

        function handleAutoRoomRadioRecordStatus(event, data) {
            const taskEntry = [...autoRoomRadioRecordTasks.entries()]
                .find(([, task]) => task.taskId === String(data?.taskId || ''));
            if (!taskEntry) return;
            const [memberId, task] = taskEntry;
            if (!['success', 'error', 'canceled'].includes(data?.status)) return;
            if (autoRoomRadioRecordTasks.get(memberId) !== task) return;
            autoRoomRadioRecordTasks.delete(memberId);
            updateAutoRoomRadioRecordUi();
            renderAutoRoomRadioRecordMembers();
            if (autoRoomRadioRecordEnabled) {
                scheduleAutoRoomRadioRecordPoll(AUTO_ROOM_RADIO_RECORD_POLL_INTERVAL_MS);
            }
        }

        function waitForRoomRadioScanGap() {
            return new Promise(resolve => setTimeout(resolve, ROOM_RADIO_SCAN_REQUEST_GAP_MS));
        }

        function cancelAllMemberRoomRadioScan() {
            if (!isRoomRadioScanning) return;
            roomRadioScanRunId += 1;
            isRoomRadioScanning = false;
            setRoomRadioScanButton();
            updateRoomRadioScanProgress('扫描已停止');
            renderRoomRadioScanResults({ cancelled: true });
            showToast('已停止全成员上麦扫描');
        }

        async function scanAllMemberRoomRadios(options = {}) {
            const {
                followedOnly = false,
                preferredChannelId = '',
                silent = false
            } = options;
            const token = getAppToken ? getAppToken() : (typeof window.getAppToken === 'function' ? window.getAppToken() : '');
            if (!token) {
                if (!silent) showToast('请先在“账号设置”中登录');
                return;
            }

            setRoomRadioScanButton({ disabled: true, text: '载入成员...' });
            let loadedMembers = [];
            try {
                if (!getMemberDataLoaded() && typeof loadMemberData === 'function') {
                    loadedMembers = await loadMemberData();
                }
            } catch (error) {
                setRoomRadioScanButton();
                if (!silent) showToast(`成员列表加载失败：${error.message || error}`);
                return;
            }

            const memberList = Array.isArray(getMemberData()) && getMemberData().length
                ? getMemberData()
                : loadedMembers;
            setRoomRadioScanButton({ disabled: true, text: '读取关注...' });
            const followedMemberIds = await getRoomRadioFollowedMemberIds(token);
            const normalizedMemberList = Array.isArray(memberList) ? memberList : [];
            const normalizedPreferredChannelId = normalizeRoomRadioChannelId(preferredChannelId);
            const scopedMemberList = followedOnly
                ? normalizedMemberList.filter(member => (
                    followedMemberIds.has(getRoomRadioMemberId(member))
                    || [
                        normalizeRoomRadioChannelId(member.channelId),
                        normalizeRoomRadioChannelId(member.smallChannelId || member.yklzId)
                    ].includes(normalizedPreferredChannelId)
                ))
                : normalizedMemberList.filter(member => member?.isInGroup !== false);
            const tasks = createRoomRadioScanTaskList(
                scopedMemberList,
                followedMemberIds,
                normalizedPreferredChannelId
            );
            if (!tasks.length) {
                setRoomRadioScanButton();
                if (!silent) showToast('成员列表中没有可扫描的房间 Channel ID');
                return;
            }

            const runId = roomRadioScanRunId + 1;
            roomRadioScanRunId = runId;
            isRoomRadioScanning = true;
            roomRadioScanTotal = tasks.length;
            roomRadioScanCompleted = 0;
            roomRadioScanFailed = 0;
            roomRadioScanCompletedAt = 0;
            roomRadioScanCompletedScope = '';
            roomRadioScannedChannelIds = new Set();
            setRoomRadioScanButton();
            publishRoomRadioScanState();
            const followedMemberCount = scopedMemberList.reduce((count, member) => (
                followedMemberIds.has(getRoomRadioMemberId(member)) ? count + 1 : count
            ), 0);
            updateRoomRadioScanProgress(followedOnly
                ? `正在扫描 ${followedMemberCount} 位已关注成员`
                : (followedMemberCount > 0
                    ? `优先扫描 ${followedMemberCount} 位已关注成员，然后扫描其他成员`
                    : '正在扫描全部成员'));
            renderRoomRadioScanResults();

            let nextTaskIndex = 0;
            const worker = async () => {
                while (runId === roomRadioScanRunId) {
                    const taskIndex = nextTaskIndex;
                    nextTaskIndex += 1;
                    if (taskIndex >= tasks.length) return;
                    const task = tasks[taskIndex];

                    try {
                        const pa = window.getPA ? window.getPA() : null;
                        const result = await ipcRenderer.invoke('fetch-room-radio', {
                            token,
                            pa,
                            channelId: task.channelId,
                            serverId: task.serverId
                        });
                        if (runId !== roomRadioScanRunId) return;

                        const hasExplicitVoiceList = Array.isArray(result?.content?.voiceUserList);
                        const hasActiveVoiceUser = hasActiveRoomRadioVoiceUser(result?.content);
                        if (result?.success && result?.content?.streamUrl && (!hasExplicitVoiceList || hasActiveVoiceUser)) {
                            upsertRoomRadioScanResult(createRoomRadioScanResult(task, result, memberList));
                            renderRoomRadioScanResults();
                            tryAutoConnectFollowedRoomRadio();
                        } else if (
                            (result?.success && (!result?.content?.streamUrl || (hasExplicitVoiceList && !hasActiveVoiceUser)))
                            || isRoomRadioOfflineResult(result)
                        ) {
                            if (removeRoomRadioScanResult(task)) renderRoomRadioScanResults();
                        } else if (!isRoomRadioOfflineResult(result)) {
                            roomRadioScanFailed += 1;
                        }
                    } catch (error) {
                        if (runId !== roomRadioScanRunId) return;
                        roomRadioScanFailed += 1;
                        console.warn(`扫描${task.name}${task.roomType === 'small' ? '小房间' : '大房间'}失败:`, error);
                    }

                    roomRadioScannedChannelIds.add(String(task.channelId));
                    roomRadioScanCompleted += 1;
                    updateRoomRadioScanProgress();
                    if (nextTaskIndex < tasks.length) await waitForRoomRadioScanGap();
                }
            };

            await Promise.all(Array.from(
                { length: Math.min(IS_WEB_PLATFORM ? 6 : ROOM_RADIO_SCAN_CONCURRENCY, tasks.length) },
                () => worker()
            ));

            if (runId !== roomRadioScanRunId) return;
            isRoomRadioScanning = false;
            if (!followedOnly) {
                const currentTaskKeys = new Set(tasks.map(getRoomRadioScanKey));
                roomRadioScanResults = roomRadioScanResults.filter(item => currentTaskKeys.has(getRoomRadioScanKey(item)));
            }
            roomRadioScanCompletedAt = Date.now();
            roomRadioScanCompletedScope = followedOnly ? 'followed' : 'all';
            setRoomRadioScanButton();
            updateRoomRadioScanProgress('扫描完成');
            renderRoomRadioScanResults({ finished: true });
            if (!silent) {
                showToast(`扫描完成，发现 ${getRoomRadioScanVoiceUserCount()} 位上麦成员（${roomRadioScanResults.length} 个房间）`);
            }
        }

        function toggleAllMemberRoomRadioScan() {
            if (isRoomRadioScanning) {
                cancelAllMemberRoomRadioScan();
                scheduleAllMemberRoomRadioAutoScan();
                return;
            }
            clearAllMemberRoomRadioAutoScanTimer();
            scanAllMemberRoomRadios().catch(error => {
                isRoomRadioScanning = false;
                setRoomRadioScanButton();
                updateRoomRadioScanProgress(`扫描中断：${error.message || error}`);
                console.error('全成员上麦扫描失败:', error);
                showToast('全成员上麦扫描中断');
            }).finally(() => {
                scheduleAllMemberRoomRadioAutoScan();
            });
        }

        function clearAllMemberRoomRadioAutoScanTimer() {
            if (!roomRadioAutoScanTimer) return;
            clearTimeout(roomRadioAutoScanTimer);
            roomRadioAutoScanTimer = null;
        }

        function scheduleAllMemberRoomRadioAutoScan(delayMs = ROOM_RADIO_AUTO_SCAN_INTERVAL_MS) {
            clearAllMemberRoomRadioAutoScanTimer();
            if (IS_WEB_PLATFORM || !isRoomRadioAutoScanEnabled) return;
            roomRadioAutoScanTimer = setTimeout(runAllMemberRoomRadioAutoScan, Math.max(0, delayMs));
        }

        async function runAllMemberRoomRadioAutoScan() {
            roomRadioAutoScanTimer = null;
            if (!isRoomRadioAutoScanEnabled) return;
            if (isRoomRadioScanning) {
                scheduleAllMemberRoomRadioAutoScan(1000);
                return;
            }

            try {
                await scanAllMemberRoomRadios({
                    followedOnly: roomRadioAutoScanFollowedOnly,
                    silent: true
                });
            } catch (error) {
                isRoomRadioScanning = false;
                setRoomRadioScanButton();
                updateRoomRadioScanProgress(`扫描中断：${error.message || error}`);
                console.error('全成员上麦自动扫描失败:', error);
            } finally {
                scheduleAllMemberRoomRadioAutoScan();
            }
        }

        function startAllMemberRoomRadioAutoScan() {
            if (IS_WEB_PLATFORM) return;
            const alreadyScanningAll = isRoomRadioAutoScanEnabled && !roomRadioAutoScanFollowedOnly;
            isRoomRadioAutoScanEnabled = true;
            roomRadioAutoScanFollowedOnly = false;
            if (alreadyScanningAll) return;
            scheduleAllMemberRoomRadioAutoScan(0);
        }

        function startFollowedMemberRoomRadioAutoScan() {
            if (IS_WEB_PLATFORM) return;
            const alreadyScanningFollowed = isRoomRadioAutoScanEnabled && roomRadioAutoScanFollowedOnly;
            isRoomRadioAutoScanEnabled = true;
            roomRadioAutoScanFollowedOnly = true;
            if (alreadyScanningFollowed) return;
            scheduleAllMemberRoomRadioAutoScan(0);
        }

        function stopAllMemberRoomRadioAutoScan() {
            isRoomRadioAutoScanEnabled = false;
            roomRadioAutoScanFollowedOnly = false;
            clearAllMemberRoomRadioAutoScanTimer();
        }

        function ensureRoomRadioScanFresh(options = {}) {
            if (IS_WEB_PLATFORM) return;
            const {
                preferredChannelId = '',
                prioritizeCurrent = false,
                maxAgeMs = 120000
            } = options;
            const normalizedPreferredChannelId = normalizeRoomRadioChannelId(preferredChannelId);
            const preferredAlreadyScanned = normalizedPreferredChannelId
                && roomRadioScannedChannelIds.has(normalizedPreferredChannelId);

            if (isRoomRadioScanning) {
                if (!prioritizeCurrent || !normalizedPreferredChannelId || preferredAlreadyScanned) return;
                roomRadioScanRunId += 1;
                isRoomRadioScanning = false;
            }

            const scanIsFresh = roomRadioScanCompletedAt
                && Date.now() - roomRadioScanCompletedAt < maxAgeMs
                && (roomRadioScanCompletedScope === 'followed' || roomRadioScanCompletedScope === 'all');
            if (scanIsFresh && (!normalizedPreferredChannelId || preferredAlreadyScanned)) return;

            scanAllMemberRoomRadios({
                followedOnly: true,
                preferredChannelId: normalizedPreferredChannelId,
                silent: true
            }).catch(error => {
                isRoomRadioScanning = false;
                setRoomRadioScanButton();
                publishRoomRadioScanState();
                console.error('口袋房间上麦状态扫描失败:', error);
            });
        }

        async function startScannedRoomRadioPlayback(item) {
            const targetKey = getRoomRadioScanKey(item);
            if (activeRoomRadioScanKey === targetKey && (radioMpegtsPlayer || radioHlsPlayer || radioMediaElement)) return;
            stopRoomRadio(false);
            const playbackRequestId = ++roomRadioPlaybackRequestId;
            activeRoomRadioScanKey = targetKey;
            publishRoomRadioScanState();
            showToast(`正在连接 ${item.name} 的上麦音频`);

            try {
                const token = getAppToken ? getAppToken() : (typeof window.getAppToken === 'function' ? window.getAppToken() : '');
                const pa = window.getPA ? window.getPA() : null;
                const freshResult = await ipcRenderer.invoke('fetch-room-radio', {
                    token,
                    pa,
                    channelId: item.channelId,
                    serverId: item.serverId
                });
                if (playbackRequestId !== roomRadioPlaybackRequestId) return;
                const freshStreamUrl = freshResult?.content?.streamUrl;
                if (!freshResult?.success || !freshStreamUrl) {
                    throw new Error(freshResult?.msg || freshResult?.message || '该成员已结束上麦');
                }

                item.streamUrl = freshStreamUrl;
                await playAudioOnlyStream(
                    freshStreamUrl,
                    item.name,
                    ensureFollowedRoomRadioPlaybackHost(),
                    {
                        headless: true,
                        playbackRequestId,
                        channelId: item.channelId,
                        serverId: item.serverId
                    }
                );
            } catch (error) {
                if (playbackRequestId !== roomRadioPlaybackRequestId) return;
                activeRoomRadioScanKey = '';
                publishRoomRadioScanState();
                console.error('口袋房间上麦播放失败:', error);
                showToast(`播放失败：${error.message || error}`);
            }
        }

        function tryAutoConnectFollowedRoomRadio() {
            if (!pendingFollowedRoomRadioAutoConnect) return;
            const pending = pendingFollowedRoomRadioAutoConnect;
            const targetKey = `${pending.serverId}:${pending.channelId}`;
            const normalizedMemberName = String(pending.memberName || '')
                .replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48)-/, '')
                .trim();
            const item = roomRadioScanResults.find(result => getRoomRadioScanKey(result) === targetKey)
                || roomRadioScanResults.find(result => {
                    const voiceUsers = Array.isArray(result.voiceUsers) ? result.voiceUsers : [];
                    return voiceUsers.some(user => (
                        (pending.memberId && String(user.userId || '') === pending.memberId)
                        || (normalizedMemberName && String(user.name || '').trim() === normalizedMemberName)
                    ));
                });
            if (!item) return;
            pendingFollowedRoomRadioAutoConnect = null;
            startScannedRoomRadioPlayback(item);
        }

        function autoConnectFollowedRoomRadio(channelId, serverId, memberId = '', memberName = '') {
            if (IS_WEB_PLATFORM) return;
            const normalizedChannelId = normalizeRoomRadioChannelId(channelId);
            if (!normalizedChannelId) return;
            const normalizedServerId = String(serverId || '').trim();
            const targetKey = `${normalizedServerId}:${normalizedChannelId}`;

            const hasRoomRadioPlayback = !!(activeRoomRadioScanKey || radioMpegtsPlayer || radioMediaElement);
            if (hasRoomRadioPlayback && activeRoomRadioScanKey !== targetKey) {
                stopRoomRadio(false);
            }
            pendingFollowedRoomRadioAutoConnect = {
                channelId: normalizedChannelId,
                serverId: normalizedServerId,
                memberId: String(memberId || '').trim(),
                memberName: String(memberName || '').trim()
            };
            tryAutoConnectFollowedRoomRadio();
        }

        function toggleScannedRoomRadioMute(channelId, serverId) {
            if (!radioMediaElement) {
                showToast(activeRoomRadioScanKey ? '上麦音频正在连接' : '当前没有正在播放的上麦音频');
                return;
            }

            radioMediaElement.muted = !radioMediaElement.muted;
            publishRoomRadioScanState();
            showToast(radioMediaElement.muted ? '已静音上麦音频' : '已恢复上麦音频');
        }

        function ensureFollowedRoomRadioPlaybackHost() {
            let host = document.getElementById('followed-room-radio-playback-host');
            if (host) return host;
            host = document.createElement('div');
            host.id = 'followed-room-radio-playback-host';
            host.style.cssText = [
                'position: fixed',
                'left: 0',
                'bottom: 0',
                'width: 2px',
                'height: 2px',
                'overflow: hidden',
                'opacity: 0.01',
                'pointer-events: none',
                'z-index: -1'
            ].join(';');
            document.body.appendChild(host);
            return host;
        }

        function cancelPendingRoomRadioRecordingStart() {
            roomRadioRecordingStartToken += 1;
            isRoomRadioRecordingStarting = false;
            const sessionId = pendingRoomRadioRecordingSessionId;
            pendingRoomRadioRecordingSessionId = '';
            if (sessionId) {
                ipcRenderer.invoke('abort-room-radio-recording', { sessionId }).catch(error => {
                    window.YayaRendererUtils.reportIgnoredError(error, 'room-radio:abort-pending-recording');
                });
            }
            const buttonEl = document.getElementById('btn-radio-record');
            if (buttonEl) {
                buttonEl.disabled = false;
                buttonEl.innerHTML = '开始录制';
            }
        }

        function handleRoomRadioEnded(reason = 'ended', expectedMediaElement = radioMediaElement, expectedPlaybackRequestId = roomRadioPlaybackRequestId) {
            if (
                expectedPlaybackRequestId !== roomRadioPlaybackRequestId
                || !expectedMediaElement
                || radioMediaElement !== expectedMediaElement
            ) return;
            const statusEl = activeRoomRadioContainer?.querySelector('#radio-status-text');
            const statusText = reason === 'stalled'
                ? '上麦已结束，录制已自动停止'
                : '上麦已结束，录制已自动停止';

            if (isRoomRadioRecordingStarting) {
                cancelPendingRoomRadioRecordingStart();
            }
            if (isRoomRadioRecording) {
                toggleRoomRadioRecord();
            }

            if (statusEl) {
                statusEl.innerHTML = `<span style="color:#faad14; font-weight:bold;">${statusText}</span>`;
            }
            if (activeRoomRadioScanKey) {
                activeRoomRadioScanKey = '';
                publishRoomRadioScanState();
            }
        }

        function clearRoomRadioEndWatchdog() {
            if (roomRadioEndWatchdog) {
                clearInterval(roomRadioEndWatchdog);
                roomRadioEndWatchdog = null;
            }
            if (roomRadioStartupTimer) {
                clearTimeout(roomRadioStartupTimer);
                roomRadioStartupTimer = null;
            }
            roomRadioLastCurrentTime = 0;
            roomRadioStallCount = 0;
            roomRadioHasStartedPlayback = false;
        }

        function setupRoomRadioEndWatchdog(expectedMediaElement = radioMediaElement, expectedPlaybackRequestId = roomRadioPlaybackRequestId) {
            clearRoomRadioEndWatchdog();
            if (!expectedMediaElement) return;

            roomRadioEndWatchdog = setInterval(() => {
                if (
                    expectedPlaybackRequestId !== roomRadioPlaybackRequestId
                    || radioMediaElement !== expectedMediaElement
                ) {
                    clearRoomRadioEndWatchdog();
                    return;
                }

                if (expectedMediaElement.ended) {
                    handleRoomRadioEnded('ended', expectedMediaElement, expectedPlaybackRequestId);
                    clearRoomRadioEndWatchdog();
                    return;
                }

                if (!roomRadioHasStartedPlayback) {
                    return;
                }

                const currentTime = Number(expectedMediaElement.currentTime || 0);
                if (
                    expectedMediaElement.paused
                    || expectedMediaElement.readyState < 2
                    || Math.abs(currentTime - roomRadioLastCurrentTime) < 0.01
                ) {
                    roomRadioStallCount += 1;
                } else {
                    roomRadioLastCurrentTime = currentTime;
                    roomRadioStallCount = 0;
                }

                if (roomRadioStallCount >= 8) {
                    handleRoomRadioEnded('stalled', expectedMediaElement, expectedPlaybackRequestId);
                    clearRoomRadioEndWatchdog();
                }
            }, 1000);
        }

        async function connectRoomRadio() {
            const container = document.getElementById('room-radio-result-container');
            const channelId = String(document.getElementById('room-radio-channel-id')?.value || '').trim();
            const serverId = String(document.getElementById('room-radio-server-id')?.value || '').trim() || 0;
            const memberName = String(document.getElementById('room-radio-member-input')?.value || '').trim() || '该房间';
            const token = getAppToken ? getAppToken() : (typeof window.getAppToken === 'function' ? window.getAppToken() : '');

            if (!token) {
                showToast('请先在“账号设置”中登录');
                return;
            }

            if (!channelId || channelId === 'undefined') {
                showToast('未获取到房间 Channel ID');
                return;
            }

            stopRoomRadio(false);

            if (container) {
                container.innerHTML = '<div class="empty-state">正在连接电台并启动音频引擎...</div>';
            }

            try {
                if (IS_WEB_PLATFORM) {
                    await playAudioOnlyStream('', memberName, container, { channelId, serverId });
                    return;
                }
                const pa = window.getPA ? window.getPA() : null;
                const result = await ipcRenderer.invoke('fetch-room-radio', {
                    token,
                    pa,
                    channelId,
                    serverId
                });

                if (result.success && result.content) {
                    if (!result.content.streamUrl) {
                        if (container) {
                            container.innerHTML = '<div class="placeholder-tip"><h3>未开启</h3><p>该房间当前没有开启语音电台。</p></div>';
                        }
                        return;
                    }
                    playAudioOnlyStream(result.content.streamUrl, memberName, container, { channelId, serverId });
                } else if (container) {
                    container.innerHTML = `<div class="placeholder-tip"><h3>连接失败</h3><p>${result.msg}</p></div>`;
                }
            } catch (error) {
                if (container) {
                    container.innerHTML = `<div class="placeholder-tip"><h3>发生错误</h3><p>${error.message}</p></div>`;
                }
            }
        }

        async function playAudioOnlyStream(remoteUrl, memberName, container, options = {}) {
            if (!container) return;
            const {
                headless = false,
                playbackRequestId = roomRadioPlaybackRequestId,
                channelId = '',
                serverId = '0'
            } = options;
            activeRoomRadioMemberName = String(memberName || '').trim() || '未知成员';
            container.innerHTML = '<div class="empty-state">正在解析音频流，请稍候...</div>';
            activeRoomRadioContainer = container;

            try {
                const proxyPayload = IS_WEB_PLATFORM
                    ? {
                        url: remoteUrl,
                        channelId,
                        serverId,
                        token: getAppToken ? getAppToken() : '',
                        pa: window.getPA ? window.getPA() : null
                    }
                    : remoteUrl;
                const localUrl = await ipcRenderer.invoke('start-radio-proxy', proxyPayload);
                if (playbackRequestId !== roomRadioPlaybackRequestId) {
                    if (!activeRoomRadioScanKey) await ipcRenderer.invoke('stop-live-proxy');
                    return;
                }
                if (!IS_WEB_PLATFORM) {
                    await new Promise(resolve => setTimeout(resolve, 700));
                }

                const recordButton = IS_WEB_PLATFORM
                    ? ''
                    : '<button class="btn btn-secondary" onclick="toggleRoomRadioRecord()" id="btn-radio-record" style="width: 100px;">开始录制</button>';
                const mediaElement = '<audio id="hidden-radio-audio" style="display: none;" crossorigin="anonymous"></audio>';
                container.innerHTML = headless ? `
                    <div id="radio-status-text">正在缓冲音频数据...</div>
                    <audio id="hidden-radio-audio" style="display:none" crossorigin="anonymous"></audio>
                ` : `
            <div style="background: var(--input-bg); border: 1px solid var(--border); border-radius: 12px; padding: 28px 20px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-top: 10px;">
                <h3 style="margin: 0 0 10px 0; color: var(--primary);">${memberName} 的房间电台</h3>
                <div style="font-size: 13px; color: var(--text-sub); margin-bottom: 20px;" id="radio-status-text">正在缓冲音频数据...</div>
                
                <div style="display: flex; justify-content: center; gap: 15px; align-items: center;">
                    ${recordButton}
                    <button class="btn btn-primary" onclick="stopRoomRadio(true)" style="background: #ff4d4f; border-color: #ff4d4f; width: 100px;">停止收听</button>
                </div>
                ${mediaElement}
            </div>
        `;

                radioMediaElement = container.querySelector('#hidden-radio-audio');
                const attachedMediaElement = radioMediaElement;
                let hasStartedPlayback = false;
                let startupRetryCount = 0;
                const isHlsStream = /\.m3u8(?:[?#].*)?$/i.test(String(localUrl || ''));
                const markPlaying = () => {
                    if (playbackRequestId !== roomRadioPlaybackRequestId || radioMediaElement !== attachedMediaElement) return;
                    hasStartedPlayback = true;
                    roomRadioHasStartedPlayback = true;
                    if (roomRadioStartupTimer) {
                        clearTimeout(roomRadioStartupTimer);
                        roomRadioStartupTimer = null;
                    }
                    const statusEl = activeRoomRadioContainer?.querySelector('#radio-status-text');
                    if (statusEl) statusEl.innerHTML = '<span style="color:#28a745; font-weight:bold;">▶ 正在收听</span>';
                    if (headless && activeRoomRadioScanKey) showToast(`正在收听 ${memberName}`);
                    roomRadioLastCurrentTime = Number(attachedMediaElement.currentTime || 0);
                    roomRadioStallCount = 0;
                };
                const markError = () => {
                    if (playbackRequestId !== roomRadioPlaybackRequestId || radioMediaElement !== attachedMediaElement) return;
                    const statusEl = activeRoomRadioContainer?.querySelector('#radio-status-text');
                    if (statusEl) statusEl.innerHTML = '<span style="color:#ff4d4f;">播放断开或解码出错</span>';
                    if (headless && activeRoomRadioScanKey) showToast(`${memberName} 的上麦音频播放失败`);
                    handleRoomRadioEnded('error', attachedMediaElement, playbackRequestId);
                };
                const showManualPlaybackButton = (message, label = '点击播放') => {
                    const statusEl = activeRoomRadioContainer?.querySelector('#radio-status-text');
                    if (!statusEl || !IS_WEB_PLATFORM || headless) return;
                    statusEl.replaceChildren();
                    const copy = document.createElement('span');
                    copy.textContent = message;
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'btn btn-secondary';
                    button.textContent = label;
                    button.style.cssText = 'height:30px;margin-left:10px;padding:0 12px;';
                    button.addEventListener('click', () => {
                        startupRetryCount = 0;
                        statusEl.textContent = '正在继续缓冲音频...';
                        requestPlayback();
                        scheduleStartupRecovery();
                    });
                    statusEl.append(copy, button);
                };
                const requestPlayback = () => {
                    const playPromise = attachedMediaElement.play();
                    if (playPromise && typeof playPromise.catch === 'function') {
                        playPromise.catch(error => {
                            if (
                                playbackRequestId !== roomRadioPlaybackRequestId
                                || radioMediaElement !== attachedMediaElement
                            ) return;

                            const errorName = String(error?.name || '');
                            if (errorName === 'AbortError') {
                                window.YayaRendererUtils.reportIgnoredError(error, 'room-radio:play-interrupted');
                                return;
                            }

                            console.error('上麦音频启动播放失败:', error);
                            if (errorName === 'NotAllowedError') {
                                showManualPlaybackButton('浏览器阻止了自动播放。');
                            } else {
                                showManualPlaybackButton('音频尚未准备好。', '继续播放');
                            }
                            if (headless && activeRoomRadioScanKey) {
                                showToast(`播放失败：${error.message || error}`);
                                activeRoomRadioScanKey = '';
                                publishRoomRadioScanState();
                            }
                        });
                    }
                };
                const scheduleStartupRecovery = () => {
                    if (roomRadioStartupTimer) clearTimeout(roomRadioStartupTimer);
                    roomRadioStartupTimer = setTimeout(() => {
                        roomRadioStartupTimer = null;
                        if (
                            playbackRequestId !== roomRadioPlaybackRequestId
                            || radioMediaElement !== attachedMediaElement
                            || hasStartedPlayback
                        ) return;

                        startupRetryCount += 1;
                        const statusEl = activeRoomRadioContainer?.querySelector('#radio-status-text');
                        if (statusEl) statusEl.textContent = `音频流正在缓冲 ${startupRetryCount}/3...`;
                        try {
                            requestPlayback();
                        } catch (error) {
                            window.YayaRendererUtils.reportIgnoredError(error, 'room-radio:startup-retry');
                        }

                        if (startupRetryCount < 3) {
                            scheduleStartupRecovery();
                        } else {
                            showManualPlaybackButton('音频仍在缓冲，请稍候。', '继续播放');
                        }
                    }, 8000);
                };

                attachedMediaElement.addEventListener('playing', markPlaying);
                attachedMediaElement.addEventListener('error', markError);
                attachedMediaElement.addEventListener('ended', () => {
                    handleRoomRadioEnded('ended', attachedMediaElement, playbackRequestId);
                });
                attachedMediaElement.addEventListener('emptied', () => {
                    if (!hasStartedPlayback) return;
                    handleRoomRadioEnded('emptied', attachedMediaElement, playbackRequestId);
                });

                if (isHlsStream) {
                    if (attachedMediaElement.canPlayType('application/vnd.apple.mpegurl')) {
                        attachedMediaElement.src = localUrl;
                        attachedMediaElement.load();
                        requestPlayback();
                    } else {
                        if (typeof window.ensureYayaWebPlayerLibs === 'function') {
                            await window.ensureYayaWebPlayerLibs('hls');
                        }
                        if (!window.Hls?.isSupported?.()) throw new Error('当前浏览器不支持 HLS 音频播放');
                        radioHlsPlayer = new window.Hls({
                            lowLatencyMode: true,
                            liveSyncDurationCount: 2,
                            liveMaxLatencyDurationCount: 5
                        });
                        radioHlsPlayer.loadSource(localUrl);
                        radioHlsPlayer.attachMedia(attachedMediaElement);
                        radioHlsPlayer.once(window.Hls.Events.MANIFEST_PARSED, requestPlayback);
                    }
                    setupRoomRadioEndWatchdog(attachedMediaElement, playbackRequestId);
                    scheduleStartupRecovery();
                } else {
                    if (typeof window.ensureYayaWebPlayerLibs === 'function') {
                        await window.ensureYayaWebPlayerLibs('mpegts');
                    }
                    if (!window.mpegts || !window.mpegts.isSupported()) {
                        throw new Error('您的环境不支持 FLV 音频解码');
                    }
                    radioMpegtsPlayer = window.mpegts.createPlayer(
                        {
                            type: 'flv',
                            url: localUrl,
                            isLive: true,
                            hasVideo: false,
                            hasAudio: true
                        },
                        {
                            enableWorker: false,
                            enableStashBuffer: false,
                            stashInitialSize: 128,
                            liveBufferLatencyChasing: true,
                            liveBufferLatencyMaxLatency: 1.5
                        }
                    );

                    radioMpegtsPlayer.attachMediaElement(attachedMediaElement);
                    radioMpegtsPlayer.load();
                    setupRoomRadioEndWatchdog(attachedMediaElement, playbackRequestId);
                    requestPlayback();
                    scheduleStartupRecovery();
                }
            } catch (error) {
                container.innerHTML = `<div class="placeholder-tip"><h3>启动代理失败</h3><p>${error.message}</p></div>`;
                activeRoomRadioScanKey = '';
                publishRoomRadioScanState();
            }
        }

        function toggleRadioMute() {
            if (!radioMediaElement) return;
            const buttonEl = activeRoomRadioContainer?.querySelector('#btn-radio-mute');
            if (radioMediaElement.muted) {
                radioMediaElement.muted = false;
                if (buttonEl) buttonEl.innerText = '静音';
            } else {
                radioMediaElement.muted = true;
                if (buttonEl) buttonEl.innerText = '取消静音';
            }
            if (activeRoomRadioScanKey) publishRoomRadioScanState();
        }

        function stopRoomRadio(updateUI = true) {
            const hadActiveRadio = !!(radioMpegtsPlayer || radioHlsPlayer || radioMediaElement || isRoomRadioRecording);
            const hadActiveScanResult = !!activeRoomRadioScanKey;
            roomRadioPlaybackRequestId += 1;
            pendingFollowedRoomRadioAutoConnect = null;
            clearRoomRadioEndWatchdog();
            if (isRoomRadioRecordingStarting) {
                cancelPendingRoomRadioRecordingStart();
            }
            if (isRoomRadioRecording) {
                toggleRoomRadioRecord();
            }

            if (radioMpegtsPlayer) {
                try {
                    radioMpegtsPlayer.pause();
                    radioMpegtsPlayer.unload();
                    radioMpegtsPlayer.detachMediaElement();
                    radioMpegtsPlayer.destroy();
                } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/room-radio-feature.js'); }
                radioMpegtsPlayer = null;
            }

            if (radioHlsPlayer) {
                try {
                    radioHlsPlayer.destroy();
                } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/room-radio-feature.js:hls-destroy'); }
                radioHlsPlayer = null;
            }

            if (radioMediaElement) {
                radioMediaElement.pause();
                radioMediaElement.src = '';
                radioMediaElement = null;
            }

            if (hadActiveRadio) {
                ipcRenderer.invoke('stop-live-proxy');
            }

            activeRoomRadioScanKey = '';
            if (hadActiveRadio || hadActiveScanResult || window.yayaRoomRadioMuted === true) {
                publishRoomRadioScanState();
            }

            if (activeRoomRadioContainer?.id === 'followed-room-radio-playback-host') {
                activeRoomRadioContainer.replaceChildren();
            }
            activeRoomRadioContainer = null;
            activeRoomRadioMemberName = '';

            if (updateUI) {
                const container = document.getElementById('room-radio-result-container');
                if (container) container.replaceChildren();
            }
        }

        async function toggleRoomRadioRecord() {
            const buttonEl = document.getElementById('btn-radio-record');
            if (!radioMediaElement) return;

            if (isRoomRadioRecordingStarting) {
                showToast('正在准备录音，请稍候');
                return;
            }

            if (!isRoomRadioRecording) {
                const recordingMediaElement = radioMediaElement;
                const recordingStartedAt = new Date();
                const recordingMemberName = activeRoomRadioMemberName || '未知成员';
                const pad = (value) => String(value).padStart(2, '0');
                const timeStr = `${recordingStartedAt.getFullYear()}${pad(recordingStartedAt.getMonth() + 1)}${pad(recordingStartedAt.getDate())}_${pad(recordingStartedAt.getHours())}.${pad(recordingStartedAt.getMinutes())}.${pad(recordingStartedAt.getSeconds())}`;
                const fileNameBase = `房间上麦_【${recordingMemberName}】${timeStr}`;
                const sessionId = `room_radio_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                const startToken = ++roomRadioRecordingStartToken;
                pendingRoomRadioRecordingSessionId = sessionId;
                isRoomRadioRecordingStarting = true;

                if (buttonEl) {
                    buttonEl.disabled = true;
                    buttonEl.innerHTML = '正在准备';
                }

                try {
                    const stream = recordingMediaElement.captureStream
                        ? recordingMediaElement.captureStream()
                        : recordingMediaElement.mozCaptureStream();

                    if (stream.getAudioTracks().length === 0) {
                        throw new Error('音频流尚未准备好，请等声音出来后再点击录制');
                    }

                    const startResult = await ipcRenderer.invoke('start-room-radio-recording', {
                        sessionId,
                        fileNameBase,
                        savePath: readStringSetting('yaya_path_room_radio', '')
                    });
                    if (!startResult?.success) {
                        throw new Error(startResult?.msg || '无法创建录音文件');
                    }

                    if (
                        startToken !== roomRadioRecordingStartToken
                        || radioMediaElement !== recordingMediaElement
                    ) {
                        await ipcRenderer.invoke('abort-room-radio-recording', { sessionId });
                        return;
                    }

                    const recorder = new MediaRecorder(stream);
                    let writeQueue = Promise.resolve();
                    let writeError = null;

                    recorder.ondataavailable = function (event) {
                        if (event.data.size <= 0) return;
                        const chunk = event.data;
                        writeQueue = writeQueue
                            .then(async () => {
                                const arrayBuffer = await chunk.arrayBuffer();
                                const result = await ipcRenderer.invoke('append-room-radio-recording-chunk', {
                                    sessionId,
                                    arrayBuffer
                                });
                                if (!result?.success) {
                                    throw new Error(result?.msg || '录音数据写入失败');
                                }
                            })
                            .catch(error => {
                                writeError = writeError || error;
                                console.error('电台录音分块写入失败:', error);
                            });
                    };

                    recorder.onstop = async function () {
                        try {
                            await writeQueue;
                            if (writeError) {
                                await ipcRenderer.invoke('abort-room-radio-recording', { sessionId });
                                throw writeError;
                            }

                            const result = await ipcRenderer.invoke('finish-room-radio-recording', { sessionId });

                            if (result?.success) {
                                showToast('录音已保存为 MP3');
                            } else if (result?.fallback) {
                                showToast(result.msg || 'MP3 转换失败，已保存为 WebM');
                            } else {
                                showToast('录音保存失败');
                            }
                        } catch (error) {
                            console.error('电台录音保存失败:', error);
                            showToast('录音保存失败');
                        } finally {
                            if (roomRadioRecorder === recorder) {
                                roomRadioRecorder = null;
                                isRoomRadioRecording = false;
                                const currentButton = document.getElementById('btn-radio-record');
                                if (currentButton) {
                                    currentButton.disabled = false;
                                    currentButton.innerHTML = '开始录制';
                                    currentButton.style.color = '';
                                    currentButton.style.borderColor = '';
                                }
                            }
                        }
                    };

                    recorder.onerror = function (event) {
                        console.error('电台录音发生错误:', event.error || event);
                        showToast('录音发生错误，正在保存已录内容');
                    };

                    roomRadioRecorder = recorder;
                    recorder.start(1000);
                    isRoomRadioRecording = true;
                    pendingRoomRadioRecordingSessionId = '';

                    if (buttonEl) {
                        buttonEl.disabled = false;
                        buttonEl.innerHTML = '正在录制';
                        buttonEl.style.color = '#ff4d4f';
                        buttonEl.style.borderColor = '#ff4d4f';
                    }
                } catch (error) {
                    console.error('电台录制失败:', error);
                    await ipcRenderer.invoke('abort-room-radio-recording', { sessionId }).catch(() => { });
                    if (roomRadioRecorder?.state === 'inactive') {
                        roomRadioRecorder = null;
                    }
                    showToast(`无法录制：${error.message || error}`);
                } finally {
                    if (startToken === roomRadioRecordingStartToken) {
                        isRoomRadioRecordingStarting = false;
                        pendingRoomRadioRecordingSessionId = '';
                        if (buttonEl && !isRoomRadioRecording) {
                            buttonEl.disabled = false;
                            buttonEl.innerHTML = '开始录制';
                        }
                    }
                }
            } else {
                if (roomRadioRecorder && roomRadioRecorder.state !== 'inactive') {
                    roomRadioRecorder.stop();
                }
                isRoomRadioRecording = false;

                if (buttonEl) {
                    buttonEl.innerHTML = '正在保存';
                    buttonEl.disabled = true;
                    buttonEl.style.color = '';
                    buttonEl.style.borderColor = '';
                }
            }
        }

        autoRoomRadioRecordEnabled = !IS_WEB_PLATFORM
            && readJsonSetting(AUTO_ROOM_RADIO_RECORD_ENABLED_KEY, false) === true;
        autoRoomRadioRecordMembers = normalizeStoredAutoRoomRadioRecordMembers(
            readJsonSetting(AUTO_ROOM_RADIO_RECORD_MEMBERS_KEY, [])
        );
        document.addEventListener('click', event => {
            const results = document.getElementById('auto-room-radio-record-member-results');
            const input = document.getElementById('auto-room-radio-record-member-search');
            if (results && input && event.target !== input && !results.contains(event.target)) {
                results.style.display = 'none';
            }
        }, true);
        ipcRenderer.on('record-status', handleAutoRoomRadioRecordStatus);
        ipcRenderer.on('download-status', handleAutoRoomRadioRecordStatus);
        setTimeout(() => {
            updateAutoRoomRadioRecordUi();
            if (autoRoomRadioRecordEnabled) scheduleAutoRoomRadioRecordPoll(0);
        }, 1200);

        return {
            handleRoomRadioSearch,
            selectRoomRadioMember,
            connectRoomRadio,
            openAutoRoomRadioRecordModal,
            closeAutoRoomRadioRecordModal,
            searchAutoRoomRadioRecordMembers,
            toggleAutoRoomRadioRecording,
            autoConnectFollowedRoomRadio,
            ensureRoomRadioScanFresh,
            startAllMemberRoomRadioAutoScan,
            startFollowedMemberRoomRadioAutoScan,
            stopAllMemberRoomRadioAutoScan,
            toggleAllMemberRoomRadioScan,
            toggleScannedRoomRadioMute,
            toggleRadioMute,
            stopRoomRadio,
            toggleRoomRadioRecord
        };
    };
})();
