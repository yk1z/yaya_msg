import { getAppSettingsApi, getStoredAppToken as readStoredToken } from './app-preferences.mjs';
import { showToast } from './renderer-dialogs.mjs';

export function createMessageFetchFeature({
    ipcRenderer, getAppToken, getCurrentPocketUserId, getFetchRoomType, getSelectedMemberName,
    getMemberData, isMemberDataLoaded, loadMemberData, getPinyinInitials, memberSortLogic,
    getTeamStyle, replaceTencentEmoji, switchView, POCKET_GIFT_DATA
}) {
    let lastNextTime = 0;
    let isAutoFetching = false;
    const ROOM_HISTORY_DAY_MS = 24 * 60 * 60 * 1000;
    const ROOM_HISTORY_COARSE_STEP_MS = 3 * ROOM_HISTORY_DAY_MS;
    const ROOM_HISTORY_FINE_STEP_MS = 6 * 60 * 60 * 1000;
    const ROOM_HISTORY_EMPTY_RANGE_DAYS = 365;
    let roomHistoryProbe = null;
    let currentFetchStopKey = '';
    let currentFetchStoppedAtPrevious = false;
    let currentFetchedToken = '';
    let currentFetchedServerId = '';
    let currentFetchedChannelId = '';
    let currentFetchedRoomType = '';
    let currentFetchedFetchAllMode = false;
    let pocketGiftCacheSaveTimer = null;
    const AUTO_MESSAGE_FETCH_SETTING_KEY = 'autoMessageFetch';
    const AUTO_MESSAGE_FETCH_DEFAULT_INTERVAL = 10;
    const AUTO_MESSAGE_FETCH_INTERVALS = new Set([1, 5, 10, 30, 60]);
    const AUTO_MESSAGE_FETCH_ROOM_LABELS = { big: '大房间', small: '小房间', all: '所有房间' };
    const AUTO_MESSAGE_FETCH_MAX_PAGES = 200;
    const AUTO_MESSAGE_FETCH_MEMBER_CONCURRENCY = 6;
    const autoMessageFetchResumes = new Map();
    let autoMessageFetchTimer = null;
    let autoMessageFetchStartupTimer = null;
    let autoMessageFetchInFlight = false;
    let autoMessageFetchInitialized = false;
    let autoMessageFetchStartupArmed = false;
    let autoMessageFetchStartupCompleted = false;
    let autoMessageFetchDraftConfig = null;
    let autoMessageFetchDraftDirty = false;
    let autoMessageFetchSelectedMemberKey = '';
    let autoMessageFetchAccountGeneration = 0;

    function getAppCacheApi() {
        return window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
    }
    function readRuntimeCacheString(key, fallbackValue = '') {
        const cacheApi = getAppCacheApi();

        if (cacheApi && typeof cacheApi.getCacheValueSync === 'function') {
            const storedValue = cacheApi.getCacheValueSync(key, undefined);
            if (storedValue !== undefined) {
                return typeof storedValue === 'string' ? storedValue : String(storedValue ?? '');
            }
        }

        const legacyValue = localStorage.getItem(key);
        if (legacyValue !== null) {
            if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                cacheApi.setCacheValueSync(key, legacyValue);
                localStorage.removeItem(key);
            }
            return String(legacyValue);
        }

        return fallbackValue;
    }

    function writeRuntimeCacheString(key, value) {
        const normalizedValue = String(value ?? '');
        const cacheApi = getAppCacheApi();
        if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
            cacheApi.setCacheValueSync(key, normalizedValue);
            localStorage.removeItem(key);
            return normalizedValue;
        }

        localStorage.setItem(key, normalizedValue);
        return normalizedValue;
    }

    function removeRuntimeCacheValue(key) {
        const cacheApi = getAppCacheApi();
        if (cacheApi && typeof cacheApi.removeCacheValueSync === 'function') {
            cacheApi.removeCacheValueSync(key);
        }
        localStorage.removeItem(key);
    }
    function getFetchBoundaryStorageKey(serverId, channelId, fetchAllMode) {
        return `yaya_fetch_boundary::${serverId || ''}::${channelId || ''}::${fetchAllMode ? 'all' : 'member'}`;
    }

    function buildFetchMessageKey(message) {
        if (!message) return '';

        let bodySeed = '';
        try {
            bodySeed = typeof message.bodys === 'string'
                ? message.bodys
                : JSON.stringify(message.bodys || message.msgContent || '');
        } catch (error) {
            bodySeed = String(message.bodys || message.msgContent || '');
        }

        return [
            message.id || message.msgId || message.messageId || message.clientMsgId || '',
            message.msgTime || '',
            message.msgType || '',
            message.senderUserId || message.senderId || message.uid || '',
            bodySeed
        ].join('|');
    }

    function getFetchBoundaryTimestamp(boundaryKey) {
        const timestamp = Number(String(boundaryKey || '').split('|')[1]);
        return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
    }

    function getFetchMessageTimestamp(message) {
        const timestamp = Number(message?.msgTime || message?.messageTime || message?.time || 0);
        return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
    }

    function advanceRoomHistoryProbe(state, content, list, requestStartedAt, boundaryTime) {
        const requestedTime = state.cursor;
        const hit = state.probe?.hit;
        if (list.length) {
            const firstFineCursor = (state.probe?.newerCursor || 0) - ROOM_HISTORY_FINE_STEP_MS;
            if (hit || !requestedTime || firstFineCursor <= requestedTime) {
                state.probe = null;
                return 'page';
            }
            state.probe = { ...state.probe, hit: { cursor: requestedTime, content } };
            state.cursor = firstFineCursor;
            return 'continue';
        }
        if (hit) {
            state.cursor = Math.max(requestedTime - ROOM_HISTORY_FINE_STEP_MS, hit.cursor);
            return 'continue';
        }

        if (requestedTime && !state.emptySearchFloor) {
            state.emptySearchFloor = Math.max(0, requestedTime - ROOM_HISTORY_EMPTY_RANGE_DAYS * ROOM_HISTORY_DAY_MS);
        }
        const probeTime = requestedTime
            ? Math.max(requestedTime - ROOM_HISTORY_COARSE_STEP_MS, state.emptySearchFloor)
            : requestStartedAt;
        const candidate = Math.max(probeTime, boundaryTime ? boundaryTime + 1 : 0);
        state.cursor = !requestedTime || candidate < requestedTime ? candidate : 0;
        state.probe = requestedTime && state.cursor ? { newerCursor: requestedTime } : null;
        if (!state.cursor) return 'end';
        return state.cursor === state.emptySearchFloor ? 'pause' : 'continue';
    }

    function getRoomHistoryPageCursor(content, list, requestedTime, boundaryTime) {
        const returnedTime = Number(content.nextTime) || 0;
        const isOlder = time => Number.isFinite(time) && time > 0 && (!requestedTime || time < requestedTime);
        const olderTimes = list.map(getFetchMessageTimestamp).filter(isOlder);
        const oldestTime = olderTimes.length ? Math.min(...olderTimes) : 0;
        const nextTime = Math.max(isOlder(returnedTime) ? returnedTime : 0, oldestTime);
        if (!nextTime) throw new Error('历史游标没有前进，请重试');
        const candidate = Math.max(nextTime, boundaryTime ? boundaryTime + 1 : 0);
        return !requestedTime || candidate < requestedTime ? candidate : 0;
    }

    function loadFetchBoundary(serverId, channelId, fetchAllMode) {
        try {
            return readRuntimeCacheString(getFetchBoundaryStorageKey(serverId, channelId, fetchAllMode), '');
        } catch (error) {
            return '';
        }
    }

    function saveFetchBoundary(serverId, channelId, fetchAllMode, message) {
        const boundaryKey = buildFetchMessageKey(message);
        if (!boundaryKey) return;

        try {
            writeRuntimeCacheString(getFetchBoundaryStorageKey(serverId, channelId, fetchAllMode), boundaryKey);
        } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/message-fetch-feature.mjs'); }
    }

    function escapeFetchHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizePocketMediaUrl(mediaPath) {
        const rawPath = String(mediaPath || '').trim();
        if (!rawPath) return '';
        if (/^https?:\/\//i.test(rawPath)) return rawPath;
        if (rawPath.includes('48.cn')) {
            return `https://${rawPath.replace(/^\/+/, '')}`;
        }

        return rawPath.startsWith('/')
            ? `https://source3.48.cn${rawPath}`
            : `https://source3.48.cn/${rawPath}`;
    }

    function schedulePocketGiftCacheSave() {
        if (pocketGiftCacheSaveTimer) {
            clearTimeout(pocketGiftCacheSaveTimer);
        }

        pocketGiftCacheSaveTimer = setTimeout(() => {
            pocketGiftCacheSaveTimer = null;
            const cacheApi = window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
            if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                cacheApi.setCacheValueSync('POCKET_GIFT_DATA_CACHE', POCKET_GIFT_DATA);
            } else {
                localStorage.setItem('POCKET_GIFT_DATA_CACHE', JSON.stringify(POCKET_GIFT_DATA));
            }
        }, 500);
    }

    function upsertPocketGiftData(giftInfo = {}) {
        if (typeof POCKET_GIFT_DATA === 'undefined') return false;
        if (!window.YayaGiftPricing.upsertObservedPrice(POCKET_GIFT_DATA, giftInfo)) return false;
        schedulePocketGiftCacheSave();
        return true;
    }

    function renderPocketGiftCard(giftInfo = {}) {
        giftInfo = window.YayaGiftPricing.normalizeGiftInfo(giftInfo, { rules: window.YayaGiftPriceSnapshot.rules });
        const giftName = escapeFetchHtml(giftInfo.giftName || giftInfo.name || '未知礼物');
        const giftNum = Number(giftInfo.giftNum || giftInfo.num || giftInfo.count || 1) || 1;
        const giftImg = window.YayaRendererUtils.resolvePocketImageUrl(normalizePocketMediaUrl(giftInfo.picPath || giftInfo.giftPic || giftInfo.image || ''));
        const unitCost = window.resolvePocketGiftPrice(giftInfo, { historical: true }).unitCost;

        upsertPocketGiftData(giftInfo, unitCost);

        const costDisplay = window.YayaGiftPricing.isScoringGift(giftInfo)
            ? `<span style="margin-left:5px; color:#fa8c16; font-weight:bold;">${window.YayaGiftPricing.giftScoreText(giftInfo, { rules: window.YayaGiftPriceSnapshot.rules })}</span>` : unitCost !== null
            ? `<span style="margin-left:5px; color:#fa8c16; font-weight:bold;">${unitCost * giftNum} 🍗</span>`
            : '<span style="margin-left:5px; color:var(--text-sub);">价格待核</span>';

        return `
    <div class="mb-2" style="display:flex; align-items:center; background:#fff0f6; padding:6px 8px; border-radius:6px; border:1px solid #ffadd2; max-width: 300px;">
        ${giftImg ? `<img class="pocket-gift-image" src="${escapeFetchHtml(giftImg)}" style="width: 25px !important; height: 25px !important; max-width: 32px !important; max-height: 32px !important; object-fit: contain !important; margin: 0 8px 0 0 !important; border-radius: 4px; box-shadow: none !important;">` : '<span style="font-size:24px; margin-right:8px;">🎁</span>'}
        <div style="flex: 1; overflow: hidden;">
            <div style="color:#eb2f96; font-weight:bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">送出礼物：${giftName}</div>
            <div style="font-size:11px; color:#888;">数量: x${giftNum} ${costDisplay}</div>
        </div>
    </div>`;
    }

    function clearFetchBoundary() {
        const serverId = document.getElementById('tool-server').value.trim();
        const channelId = document.getElementById('tool-channel').value.trim();
        const statusEl = document.getElementById('fetch-status');

        if (!channelId) {
            showToast('请先选择成员或填写房间参数');
            return;
        }

        try {
            removeRuntimeCacheValue(getFetchBoundaryStorageKey(serverId, channelId, isFetchAllMode));
        } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/message-fetch-feature.mjs'); }

        currentFetchStopKey = '';
        currentFetchStoppedAtPrevious = false;

        if (statusEl) {
            statusEl.innerHTML = '已清除当前房间上次抓取位置';
        }

        showToast('已清除当前房间上次抓取位置');
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function normalizeAutoMessageFetchMember(member) {
        const name = String(member?.name || member?.ownerName || '').trim();
        const serverId = String(member?.serverId || '').trim();
        const channelId = String(member?.channelId || '').trim();
        if (!name || !serverId || !channelId) return null;

        return {
            name,
            serverId,
            channelId,
            smallChannelId: String(member?.smallChannelId || member?.yklzId || '').trim(),
            team: String(member?.team || member?.teamName || '').trim()
        };
    }

    function getAutoMessageFetchMemberKey(member) {
        return `${member.serverId}::${member.channelId}`;
    }

    function normalizeAutoMessageFetchOptions(value, defaults = {}) {
        const roomType = value?.roomType ?? defaults.roomType;
        const intervalMinutes = Number(value?.intervalMinutes ?? defaults.intervalMinutes);
        return {
            roomType: roomType === 'small' || roomType === 'all' ? roomType : 'big',
            messageScope: (value?.messageScope ?? defaults.messageScope) === 'all' ? 'all' : 'member',
            intervalMinutes: AUTO_MESSAGE_FETCH_INTERVALS.has(intervalMinutes)
                ? intervalMinutes
                : AUTO_MESSAGE_FETCH_DEFAULT_INTERVAL
        };
    }

    function normalizeAutoMessageFetchConfig(value) {
        const defaults = normalizeAutoMessageFetchOptions(value);
        const lastRunAt = Number(value?.lastRunAt) || 0;
        const memberKeys = new Set();
        const members = [];

        for (const rawMember of (Array.isArray(value?.members) ? value.members : [])) {
            const member = normalizeAutoMessageFetchMember(rawMember);
            if (!member) continue;
            const memberKey = getAutoMessageFetchMemberKey(member);
            if (memberKeys.has(memberKey)) continue;
            memberKeys.add(memberKey);
            members.push({
                ...member,
                ...normalizeAutoMessageFetchOptions(rawMember, defaults),
                lastRunAt: Number(rawMember.lastRunAt ?? lastRunAt) || 0
            });
        }

        return {
            startupEnabled: members.length > 0,
            scheduledEnabled: members.length > 0,
            ...defaults,
            members,
            lastRunAt
        };
    }

    function readAutoMessageFetchConfig() {
        const settingsApi = getAppSettingsApi();
        let rawValue = null;
        const accountScope = typeof window.getPocketAccountScopeKey === 'function'
            ? String(window.getPocketAccountScopeKey() || '').trim()
            : '';
        const scopedSettingKey = accountScope && accountScope !== 'signed-out'
            ? `${AUTO_MESSAGE_FETCH_SETTING_KEY}_${accountScope}`
            : '';

        if (settingsApi && typeof settingsApi.getSettingValueSync === 'function') {
            rawValue = settingsApi.getSettingValueSync(AUTO_MESSAGE_FETCH_SETTING_KEY, null);
            if (!rawValue && scopedSettingKey) {
                rawValue = settingsApi.getSettingValueSync(scopedSettingKey, null);
                if (rawValue && typeof settingsApi.setSettingValueSync === 'function') {
                    settingsApi.setSettingValueSync(AUTO_MESSAGE_FETCH_SETTING_KEY, rawValue);
                    if (typeof settingsApi.removeSettingValueSync === 'function') {
                        settingsApi.removeSettingValueSync(scopedSettingKey);
                    }
                }
            }
        }

        if (!rawValue) {
            const sharedLocalKey = `yaya_${AUTO_MESSAGE_FETCH_SETTING_KEY}`;
            let legacyValue = localStorage.getItem(sharedLocalKey);
            const scopedLocalKey = scopedSettingKey ? `yaya_${scopedSettingKey}` : '';
            if (!legacyValue && scopedLocalKey) {
                legacyValue = localStorage.getItem(scopedLocalKey);
                if (legacyValue) {
                    localStorage.setItem(sharedLocalKey, legacyValue);
                    localStorage.removeItem(scopedLocalKey);
                }
            }
            if (legacyValue) {
                try {
                    rawValue = JSON.parse(legacyValue);
                } catch (error) {
                    rawValue = null;
                }
            }
        }

        return normalizeAutoMessageFetchConfig(rawValue || {});
    }

    function writeAutoMessageFetchConfig(value) {
        const config = normalizeAutoMessageFetchConfig(value);
        const settingsApi = getAppSettingsApi();

        if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
            settingsApi.setSettingValueSync(AUTO_MESSAGE_FETCH_SETTING_KEY, config);
            localStorage.removeItem(`yaya_${AUTO_MESSAGE_FETCH_SETTING_KEY}`);
        } else {
            localStorage.setItem(`yaya_${AUTO_MESSAGE_FETCH_SETTING_KEY}`, JSON.stringify(config));
        }

        return config;
    }

    function cloneAutoMessageFetchConfig(value) {
        return normalizeAutoMessageFetchConfig(JSON.parse(JSON.stringify(value || {})));
    }

    function getAutoMessageFetchDraftConfig(refreshWhenClean = false) {
        if (!autoMessageFetchDraftConfig || (refreshWhenClean && !autoMessageFetchDraftDirty)) {
            autoMessageFetchDraftConfig = cloneAutoMessageFetchConfig(readAutoMessageFetchConfig());
        }
        return autoMessageFetchDraftConfig;
    }

    function markAutoMessageFetchDraftDirty() {
        autoMessageFetchDraftDirty = true;
        renderAutoMessageFetchUi();
    }

    function getAutoMessageFetchSelectedOptions(config) {
        return config.members.find(member => getAutoMessageFetchMemberKey(member) === autoMessageFetchSelectedMemberKey)
            || config;
    }

    function getAutoMessageFetchMemberDueAt(member) {
        return member.lastRunAt ? member.lastRunAt + member.intervalMinutes * 60 * 1000 : 0;
    }

    function getAutoMessageFetchNextRunAt(config) {
        return config.members.reduce((next, member) => Math.min(next, getAutoMessageFetchMemberDueAt(member)), Infinity);
    }

    function setAutoMessageFetchStatus(message, type = '') {
        const statusEl = document.getElementById('auto-fetch-status');
        if (!statusEl) return;
        statusEl.textContent = String(message || '');
        statusEl.title = statusEl.textContent;
        statusEl.className = `auto-fetch-status${type ? ` is-${type}` : ''}`;
    }

    function formatAutoMessageFetchTime(timestamp) {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }

    function renderAutoMessageFetchUi(options = {}) {
        if (!autoMessageFetchDraftDirty) {
            autoMessageFetchDraftConfig = cloneAutoMessageFetchConfig(readAutoMessageFetchConfig());
        }
        const config = getAutoMessageFetchDraftConfig();
        const selected = getAutoMessageFetchSelectedOptions(config);
        const roomTypeDisplay = document.getElementById('auto-fetch-room-type-display');
        const messageScopeDisplay = document.getElementById('auto-fetch-message-scope-display');
        const intervalDisplay = document.getElementById('auto-fetch-interval-display');
        const runButton = document.getElementById('btn-auto-fetch-now');
        const saveButton = document.getElementById('btn-save-auto-fetch');
        const list = document.getElementById('auto-fetch-member-list');
        const memberLabel = document.querySelector('label[for="auto-fetch-member-input"]');

        if (memberLabel) memberLabel.textContent = window.YayaRendererUtils.t(selected.name
            ? `搜索成员 · 已选 ${selected.name}` : '搜索成员');
        if (roomTypeDisplay) roomTypeDisplay.value = AUTO_MESSAGE_FETCH_ROOM_LABELS[selected.roomType];
        if (messageScopeDisplay) messageScopeDisplay.value = selected.messageScope === 'all' ? '全体消息' : '只看成员';
        if (intervalDisplay) intervalDisplay.value = `${selected.intervalMinutes} 分钟`;
        if (runButton && !autoMessageFetchInFlight) {
            runButton.disabled = autoMessageFetchDraftDirty;
            runButton.title = window.YayaRendererUtils.t(autoMessageFetchDraftDirty ? '请先保存自动抓取设置' : '');
        }
        if (saveButton) saveButton.disabled = !autoMessageFetchDraftDirty;

        if (list) {
            list.replaceChildren();
            for (const member of config.members) {
                const row = document.createElement('li');
                row.className = 'auto-fetch-member-row';
                row.classList.toggle('is-selected', member === selected);

                const identity = document.createElement('span');
                identity.className = 'auto-fetch-member-identity';
                const name = document.createElement('strong');
                name.textContent = member.name;
                identity.appendChild(name);
                const team = document.createElement('span');
                team.className = 'team-tag';
                team.textContent = member.team || window.YayaRendererUtils.t('队伍未知');
                if (typeof getTeamStyle === 'function') team.style.cssText = getTeamStyle(member.team);
                identity.appendChild(team);
                row.appendChild(identity);

                const details = document.createElement('dl');
                details.className = 'auto-fetch-member-details';
                for (const [label, value] of [
                    ['抓取房间', AUTO_MESSAGE_FETCH_ROOM_LABELS[member.roomType]],
                    ['消息范围', member.messageScope === 'all' ? '全体消息' : '只看成员'],
                    ['抓取间隔', `${member.intervalMinutes} 分钟`]
                ]) {
                    const field = document.createElement('div');
                    const title = document.createElement('dt');
                    title.textContent = window.YayaRendererUtils.t(label);
                    const content = document.createElement('dd');
                    content.textContent = window.YayaRendererUtils.t(value);
                    field.append(title, content);
                    details.appendChild(field);
                }
                row.appendChild(details);

                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.setAttribute('aria-label', window.YayaRendererUtils.t(`移除 ${member.name}`));
                removeButton.textContent = window.YayaRendererUtils.t('移除');
                removeButton.addEventListener('click', () => removeAutoMessageFetchMember(member.serverId, member.channelId));
                row.appendChild(removeButton);
                list.appendChild(row);
            }
        }

        if (options.keepStatus || autoMessageFetchInFlight) return;
        if (autoMessageFetchDraftDirty) {
            setAutoMessageFetchStatus('设置有未保存的更改，点击“保存”后生效');
            return;
        }
        if (config.members.length === 0) {
            setAutoMessageFetchStatus('尚未添加自动抓取成员');
        } else {
            const nextRunAt = Math.max(Date.now(), getAutoMessageFetchNextRunAt(config));
            setAutoMessageFetchStatus(`下次定时抓取约 ${formatAutoMessageFetchTime(nextRunAt)}`);
        }
    }

    function handleAutoFetchMemberSearch(keyword) {
        const resultBox = document.getElementById('auto-fetch-member-results');
        if (!resultBox) return;

        const query = String(keyword || '').trim();
        if (!query) {
            resultBox.style.display = 'none';
            return;
        }

        if (!isMemberDataLoaded()) {
            if (typeof loadMemberData === 'function') {
                Promise.resolve(loadMemberData()).then(() => handleAutoFetchMemberSearch(query));
            }
            resultBox.innerHTML = '<div class="suggestion-item" style="cursor:default;color:var(--text-sub)">正在读取成员列表...</div>';
            resultBox.style.display = 'block';
            return;
        }

        const source = getMemberData();
        const lowerQuery = query.toLowerCase();
        const matches = source.filter(member => {
            const name = String(member?.ownerName || '');
            const pinyin = String(member?.pinyin || '');
            const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : '';
            return name.includes(query)
                || pinyin.toLowerCase().includes(lowerQuery)
                || initials.toLowerCase().includes(lowerQuery);
        });

        if (typeof memberSortLogic === 'function') matches.sort(memberSortLogic);
        resultBox.replaceChildren();

        if (matches.length === 0) {
            resultBox.innerHTML = '<div class="suggestion-item" style="cursor:default;color:var(--text-sub)">未找到该成员</div>';
            resultBox.style.display = 'block';
            return;
        }

        for (const member of matches.slice(0, 30)) {
            const isInactive = member?.isInGroup === false;
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';

            const name = document.createElement('span');
            name.style.fontWeight = 'bold';
            if (isInactive) {
                name.style.opacity = '0.6';
                name.style.color = '#999';
            }
            name.textContent = String(member.ownerName || '');
            item.appendChild(name);

            const team = document.createElement('span');
            team.className = 'team-tag';
            if (typeof getTeamStyle === 'function') {
                team.style.cssText = getTeamStyle(member.team, isInactive);
            }
            if (isInactive) {
                team.style.opacity = '0.6';
                team.style.color = '#999';
            }
            team.textContent = String(member.team || '');
            item.appendChild(team);
            item.addEventListener('click', () => addAutoMessageFetchMember(member));
            resultBox.appendChild(item);
        }

        resultBox.style.display = 'block';
    }

    function addAutoMessageFetchMember(rawMember) {
        const member = normalizeAutoMessageFetchMember(rawMember);
        if (!member) {
            showToast('该成员缺少大房间参数，无法加入自动抓取');
            return;
        }

        const config = getAutoMessageFetchDraftConfig(true);
        const key = getAutoMessageFetchMemberKey(member);
        const exists = config.members.some(item => getAutoMessageFetchMemberKey(item) === key);
        autoMessageFetchSelectedMemberKey = key;
        if (!exists) config.members.push({ ...member, ...normalizeAutoMessageFetchOptions(config), lastRunAt: 0 });

        const input = document.getElementById('auto-fetch-member-input');
        const results = document.getElementById('auto-fetch-member-results');
        if (input) input.value = '';
        if (results) results.style.display = 'none';
        if (exists) {
            renderAutoMessageFetchUi();
        } else {
            markAutoMessageFetchDraftDirty();
        }
    }

    function removeAutoMessageFetchMember(serverId, channelId) {
        const config = getAutoMessageFetchDraftConfig(true);
        config.members = config.members.filter(member => (
            member.serverId !== String(serverId || '') || member.channelId !== String(channelId || '')
        ));
        if (autoMessageFetchSelectedMemberKey === `${serverId}::${channelId}`) {
            autoMessageFetchSelectedMemberKey = '';
        }
        markAutoMessageFetchDraftDirty();
    }

    function setAutoMessageFetchRoomType(value) {
        const config = getAutoMessageFetchSelectedOptions(getAutoMessageFetchDraftConfig(true));
        config.roomType = value === 'small' || value === 'all' ? value : 'big';
        markAutoMessageFetchDraftDirty();
    }

    function setAutoMessageFetchScope(value) {
        const config = getAutoMessageFetchSelectedOptions(getAutoMessageFetchDraftConfig(true));
        config.messageScope = value === 'all' ? 'all' : 'member';
        markAutoMessageFetchDraftDirty();
    }

    function setAutoMessageFetchInterval(value) {
        const config = getAutoMessageFetchSelectedOptions(getAutoMessageFetchDraftConfig(true));
        config.intervalMinutes = Number(value);
        markAutoMessageFetchDraftDirty();
    }

    function closeAutoMessageFetchDropdowns(exceptId = '') {
        document.querySelectorAll('.auto-fetch-option-dropdown').forEach(dropdown => {
            if (exceptId && dropdown.id === exceptId) return;
            dropdown.style.display = 'none';
        });
    }

    function toggleAutoMessageFetchDropdown(settingName) {
        const dropdownIds = {
            roomType: 'auto-fetch-room-type-dropdown',
            messageScope: 'auto-fetch-message-scope-dropdown',
            intervalMinutes: 'auto-fetch-interval-dropdown'
        };
        const dropdown = document.getElementById(dropdownIds[settingName]);
        if (!dropdown) return;
        const shouldOpen = dropdown.style.display !== 'block';
        closeAutoMessageFetchDropdowns();
        dropdown.style.display = shouldOpen ? 'block' : 'none';
    }

    function selectAutoMessageFetchOption(settingName, value) {
        closeAutoMessageFetchDropdowns();
        if (settingName === 'roomType') {
            setAutoMessageFetchRoomType(value);
        } else if (settingName === 'messageScope') {
            setAutoMessageFetchScope(value);
        } else if (settingName === 'intervalMinutes') {
            setAutoMessageFetchInterval(value);
        }
    }

    function saveAutoMessageFetchSettings() {
        if (!autoMessageFetchDraftDirty) return;

        const previousConfig = readAutoMessageFetchConfig();
        const draftConfig = cloneAutoMessageFetchConfig(getAutoMessageFetchDraftConfig());
        const previousMembers = new Map(previousConfig.members.map(member => [getAutoMessageFetchMemberKey(member), member]));
        const savedAt = Date.now();
        for (const member of draftConfig.members) {
            const previous = previousMembers.get(getAutoMessageFetchMemberKey(member));
            const resetTimer = previous?.intervalMinutes !== member.intervalMinutes;
            member.lastRunAt = resetTimer ? savedAt : previous?.lastRunAt || 0;
        }
        draftConfig.lastRunAt = previousConfig.lastRunAt;

        let savedConfig;
        try {
            savedConfig = writeAutoMessageFetchConfig(draftConfig);
        } catch (error) {
            setAutoMessageFetchStatus(`保存失败：${error.message}`, 'error');
            return;
        }
        autoMessageFetchDraftConfig = cloneAutoMessageFetchConfig(savedConfig);
        autoMessageFetchDraftDirty = false;

        if (!savedConfig.startupEnabled) {
            autoMessageFetchStartupArmed = false;
            if (autoMessageFetchStartupTimer) clearTimeout(autoMessageFetchStartupTimer);
            autoMessageFetchStartupTimer = null;
        }

        scheduleAutoMessageFetch();

        closeAutoMessageFetchDropdowns();
        renderAutoMessageFetchUi();
        const missingSmallRoomCount = savedConfig.members.filter(member => member.roomType !== 'big' && !member.smallChannelId).length;
        if (missingSmallRoomCount > 0) {
            setAutoMessageFetchStatus(`已保存。${missingSmallRoomCount} 位成员缺少小房间参数`, 'error');
        }
        showToast('自动抓取设置已保存');
    }

    function scheduleAutoMessageFetch(delayMs) {
        if (autoMessageFetchTimer) clearTimeout(autoMessageFetchTimer);
        autoMessageFetchTimer = null;

        const config = readAutoMessageFetchConfig();
        if (!config.scheduledEnabled || config.members.length === 0) return;
        const scheduleGeneration = autoMessageFetchAccountGeneration;
        const accountScope = typeof window.getPocketAccountScopeKey === 'function'
            ? String(window.getPocketAccountScopeKey() || '')
            : '';

        const safeDelay = Math.max(250, delayMs ?? getAutoMessageFetchNextRunAt(config) - Date.now());
        autoMessageFetchTimer = setTimeout(() => {
            if (scheduleGeneration !== autoMessageFetchAccountGeneration
                || (typeof window.getPocketAccountScopeKey === 'function'
                    && String(window.getPocketAccountScopeKey() || '') !== accountScope)) return;
            autoMessageFetchTimer = null;
            Promise.resolve(runAutoMessageFetchNow()).catch(error => {
                console.warn('自动抓取任务失败:', error);
            });
        }, safeDelay);
    }

    function filterFetchedMemberMessages(list) {
        return (Array.isArray(list) ? list : []).filter(message => {
            let senderId = message.senderUserId || message.senderId || message.uid;
            if (!senderId && message.extInfo) {
                try {
                    const ext = typeof message.extInfo === 'string' ? JSON.parse(message.extInfo) : message.extInfo;
                    if (ext?.user) senderId = ext.user.userId || ext.user.id;
                } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/message-fetch-feature.mjs'); }
            }
            return String(senderId || '') !== '121569667';
        });
    }

    async function fetchAutoMessageMember(member, token, options = {}) {
        const roomType = options.roomType === 'small' ? 'small' : 'big';
        const fetchAll = options.messageScope === 'all';
        const isCurrentRun = typeof options.isCurrentRun === 'function' ? options.isCurrentRun : () => true;
        const channelId = roomType === 'small' ? member.smallChannelId : member.channelId;
        if (!channelId) {
            throw new Error(`缺少${roomType === 'small' ? '小' : '大'}房间 Channel ID`);
        }

        const previousBoundary = loadFetchBoundary(member.serverId, channelId, fetchAll);
        const previousBoundaryTimestamp = getFetchBoundaryTimestamp(previousBoundary);
        const roomKey = getFetchBoundaryStorageKey(member.serverId, channelId, fetchAll);
        const pending = autoMessageFetchResumes.get(roomKey);
        const resume = pending?.boundary === previousBoundary ? pending : null;
        if (!resume) autoMessageFetchResumes.delete(roomKey);
        const pagination = { cursor: resume?.cursor || 0, probe: resume?.probe || null, emptySearchFloor: 0 };
        const collectedMessages = [];
        const seenKeys = new Set();
        let newestMessage = resume?.newestMessage || null;
        let reachedPrevious = false;

        for (let page = 0; page < AUTO_MESSAGE_FETCH_MAX_PAGES; page++) {
            if (page) await sleep(350);
            if (!isCurrentRun()) throw new Error('account-changed');

            const requestedTime = pagination.cursor;
            const requestStartedAt = Date.now();
            const hit = pagination.probe?.hit;
            let content;
            if (hit && requestedTime === hit.cursor) {
                content = hit.content;
            } else {
                const response = await ipcRenderer.invoke('fetch-room-messages', {
                    token,
                    serverId: member.serverId,
                    channelId,
                    pa: window.getPA ? window.getPA() : null,
                    nextTime: requestedTime,
                    fetchAll
                });
                if (!isCurrentRun()) throw new Error('account-changed');
                if (!response?.success || !response?.data?.content) {
                    throw new Error(response?.msg || '抓取接口未返回消息');
                }
                content = response.data.content;
            }

            const rawList = content.messageList || content.message || [];
            if (!Array.isArray(rawList)) throw new Error('抓取接口返回的消息格式无效');
            if (previousBoundary) {
                const step = advanceRoomHistoryProbe(pagination, content, rawList, requestStartedAt, previousBoundaryTimestamp);
                if (step === 'pause') break;
                if (step === 'end') {
                    reachedPrevious = previousBoundaryTimestamp > 0;
                    break;
                }
                if (step === 'continue') continue;
            }

            let list = fetchAll ? rawList : filterFetchedMemberMessages(rawList);
            if (previousBoundary) {
                const stopIndex = list.findIndex(message => buildFetchMessageKey(message) === previousBoundary);
                if (stopIndex >= 0) {
                    list = list.slice(0, stopIndex);
                    reachedPrevious = true;
                } else if (previousBoundaryTimestamp > 0) {
                    const crossedBoundaryIndex = list.findIndex(message => {
                        const messageTimestamp = getFetchMessageTimestamp(message);
                        return messageTimestamp > 0 && messageTimestamp <= previousBoundaryTimestamp;
                    });
                    if (crossedBoundaryIndex >= 0) {
                        list = list.slice(0, crossedBoundaryIndex);
                        reachedPrevious = true;
                    }
                }
            }

            for (const message of list) {
                const messageKey = buildFetchMessageKey(message);
                if (messageKey && seenKeys.has(messageKey)) continue;
                if (messageKey) seenKeys.add(messageKey);
                collectedMessages.push(message);
            }

            if (!newestMessage && list.length) newestMessage = list[0];
            if (!previousBoundary || reachedPrevious) break;
            pagination.cursor = getRoomHistoryPageCursor(content, rawList, requestedTime, previousBoundaryTimestamp);
            if (!pagination.cursor) {
                reachedPrevious = previousBoundaryTimestamp > 0;
                break;
            }
        }
        if (!isCurrentRun()) throw new Error('account-changed');

        let saveResult;
        if (collectedMessages.length) {
            const exportMeta = getFetchExportMemberMeta(member.name, channelId);
            const exportGroupName = exportMeta.groupName === '未知分团' && member.team
                ? member.team
                : exportMeta.groupName;
            const exportPrefix = `${exportGroupName}-${exportMeta.memberName}`;
            saveResult = await ipcRenderer.invoke('save-export-jsonl', {
                memberName: exportMeta.memberName,
                fileName: `${exportPrefix}-${exportMeta.channelId}.jsonl`,
                entries: buildFetchExportEntries(collectedMessages, { channelId, roomType })
            });
            if (!isCurrentRun()) throw new Error('account-changed');
            if (!saveResult?.success) throw new Error(saveResult?.msg || '保存 JSONL 失败');
        }

        const sameBoundary = loadFetchBoundary(member.serverId, channelId, fetchAll) === previousBoundary;
        const needsResume = sameBoundary && !!previousBoundary && !reachedPrevious && pagination.cursor > 0;
        if (needsResume) {
            autoMessageFetchResumes.set(roomKey, { boundary: previousBoundary, cursor: pagination.cursor, probe: pagination.probe, newestMessage });
        } else {
            autoMessageFetchResumes.delete(roomKey);
            if (sameBoundary && newestMessage && (!previousBoundary || reachedPrevious)) {
                saveFetchBoundary(member.serverId, channelId, fetchAll, newestMessage);
            }
        }
        return {
            addedCount: Number(saveResult?.addedCount) || 0,
            changed: saveResult?.changed === true,
            needsResume,
            initialized: !previousBoundary
        };
    }

    async function fetchAutoMessageMemberRooms(member, token, options = {}) {
        const roomTypes = options.roomType === 'all'
            ? ['big', 'small']
            : [options.roomType === 'small' ? 'small' : 'big'];
        const aggregate = { addedCount: 0, changed: false, skippedRoomCount: 0, pendingRoomCount: 0 };

        for (let index = 0; index < roomTypes.length; index += 1) {
            if (typeof options.isCurrentRun === 'function' && !options.isCurrentRun()) {
                throw new Error('account-changed');
            }
            const roomType = roomTypes[index];
            if (roomType === 'small' && !member.smallChannelId && options.roomType === 'all') {
                aggregate.skippedRoomCount += 1;
                continue;
            }

            const result = await fetchAutoMessageMember(member, token, {
                roomType,
                messageScope: options.messageScope,
                isCurrentRun: options.isCurrentRun
            });
            aggregate.addedCount += result.addedCount;
            aggregate.changed = aggregate.changed || result.changed;
            if (result.needsResume) aggregate.pendingRoomCount += 1;
            if (index < roomTypes.length - 1) await sleep(350);
        }

        return aggregate;
    }

    async function runAutoMessageFetchNow(options = {}) {
        const manual = options?.manual === true;
        const startup = options?.startup === true;
        const config = readAutoMessageFetchConfig();
        const shouldSchedule = config.scheduledEnabled;

        if (autoMessageFetchInFlight) {
            if (manual) showToast('自动抓取正在运行');
            if (!manual && shouldSchedule) scheduleAutoMessageFetch(30000);
            return { success: false, skipped: true, reason: 'busy' };
        }

        if (config.members.length === 0) {
            setAutoMessageFetchStatus('请先添加自动抓取成员', 'error');
            if (manual) showToast('请先添加自动抓取成员');
            return { success: false, skipped: true, reason: 'missing-members' };
        }
        const startedAt = Date.now();
        const members = manual || startup ? config.members
            : config.members.filter(member => getAutoMessageFetchMemberDueAt(member) <= startedAt);
        if (!members.length || (!manual && !startup && !shouldSchedule)) {
            scheduleAutoMessageFetch();
            return { success: false, skipped: true, reason: 'not-due' };
        }

        const token = String(getAppToken() || readStoredToken() || '').trim();
        if (!token) {
            setAutoMessageFetchStatus('等待账号登录，登录后会继续自动抓取', 'error');
            if (manual) showToast('请先登录账号');
            if (shouldSchedule) scheduleAutoMessageFetch(60000);
            return { success: false, skipped: true, reason: 'missing-token' };
        }
        const runContext = {
            generation: autoMessageFetchAccountGeneration,
            token,
            accountScope: typeof window.getPocketAccountScopeKey === 'function'
                ? String(window.getPocketAccountScopeKey() || '')
                : '',
            sessionGeneration: typeof window.getPocketAccountSessionGeneration === 'function'
                ? window.getPocketAccountSessionGeneration()
                : 0
        };
        const isCurrentRun = () => (
            runContext.generation === autoMessageFetchAccountGeneration
            && runContext.token === String(getAppToken() || readStoredToken() || '').trim()
            && (typeof window.getPocketAccountScopeKey !== 'function'
                || runContext.accountScope === String(window.getPocketAccountScopeKey() || ''))
            && (typeof window.getPocketAccountSessionGeneration !== 'function'
                || runContext.sessionGeneration === window.getPocketAccountSessionGeneration())
        );

        if (isAutoFetching || document.getElementById('loading-indicator')) {
            setAutoMessageFetchStatus('手动抓取正在运行，自动任务已顺延');
            if (shouldSchedule) scheduleAutoMessageFetch(30000);
            return { success: false, skipped: true, reason: 'manual-fetch-busy' };
        }

        autoMessageFetchInFlight = true;
        const runButton = document.getElementById('btn-auto-fetch-now');
        if (runButton) {
            runButton.disabled = true;
            runButton.textContent = window.YayaRendererUtils.t('抓取中...');
        }

        let addedCount = 0;
        let changedMemberCount = 0;
        let failedCount = 0;
        let skippedRoomCount = 0;
        let pendingRoomCount = 0;
        const attemptedMembers = new Map();

        try {
            let nextMemberIndex = 0;
            let completedMemberCount = 0;
            const worker = async () => {
                while (nextMemberIndex < members.length) {
                    if (!isCurrentRun()) return;
                    const latestConfig = readAutoMessageFetchConfig();
                    if (!manual && startup && !latestConfig.startupEnabled) return;
                    if (!manual && !startup && !latestConfig.scheduledEnabled) return;

                    const key = getAutoMessageFetchMemberKey(members[nextMemberIndex++]);
                    const member = latestConfig.members.find(candidate => getAutoMessageFetchMemberKey(candidate) === key);
                    if (!member || (!manual && !startup && getAutoMessageFetchMemberDueAt(member) > startedAt)) {
                        completedMemberCount += 1;
                        continue;
                    }
                    attemptedMembers.set(key, member);
                    const roomLabel = AUTO_MESSAGE_FETCH_ROOM_LABELS[member.roomType];
                    const scopeLabel = member.messageScope === 'all' ? '全体消息' : '成员消息';
                    setAutoMessageFetchStatus(
                        `正在抓取 ${member.name} · ${roomLabel} · ${scopeLabel}（已完成 ${completedMemberCount}/${members.length}）...`,
                        'running'
                    );
                    try {
                        const result = await fetchAutoMessageMemberRooms(member, token, {
                            roomType: member.roomType,
                            messageScope: member.messageScope,
                            isCurrentRun
                        });
                        if (!isCurrentRun()) return;
                        addedCount += result.addedCount;
                        skippedRoomCount += result.skippedRoomCount;
                        pendingRoomCount += result.pendingRoomCount || 0;
                        if (result.changed) changedMemberCount += 1;
                    } catch (error) {
                        if (!isCurrentRun()) return;
                        failedCount += 1;
                        console.warn(`自动抓取 ${member.name} 失败:`, error);
                    } finally {
                        completedMemberCount += 1;
                        setAutoMessageFetchStatus(
                            `正在并发抓取成员消息（${completedMemberCount}/${members.length}）...`,
                            'running'
                        );
                    }
                }
            };

            await Promise.all(Array.from(
                { length: Math.min(AUTO_MESSAGE_FETCH_MEMBER_CONCURRENCY, members.length) },
                () => worker()
            ));
            if (!isCurrentRun()) return { success: false, skipped: true, reason: 'account-changed' };

            const latestConfig = readAutoMessageFetchConfig();
            latestConfig.lastRunAt = Date.now();
            for (const member of latestConfig.members) {
                const attempted = attemptedMembers.get(getAutoMessageFetchMemberKey(member));
                if (attempted && attempted.lastRunAt === member.lastRunAt && attempted.intervalMinutes === member.intervalMinutes
                    && attempted.roomType === member.roomType && attempted.messageScope === member.messageScope) {
                    member.lastRunAt = latestConfig.lastRunAt;
                }
            }
            writeAutoMessageFetchConfig(latestConfig);

            const pendingText = pendingRoomCount ? `，${pendingRoomCount} 个房间将在下一轮继续复查` : '';
            if (addedCount > 0) {
                window.__messageDataDirty = true;
                setAutoMessageFetchStatus(
                    `本次新增 ${addedCount} 条，更新 ${changedMemberCount} 位成员${skippedRoomCount ? `，跳过 ${skippedRoomCount} 个小房间` : ''}${failedCount ? `，${failedCount} 位失败` : ''}${pendingText}`,
                    failedCount ? 'error' : 'success'
                );
            } else if (failedCount > 0) {
                setAutoMessageFetchStatus(`本次没有新增消息，${failedCount} 位成员抓取失败${pendingText}`, 'error');
            } else if (pendingRoomCount > 0) {
                setAutoMessageFetchStatus(`${pendingRoomCount} 个房间将在下一轮继续复查`, 'running');
            } else if (skippedRoomCount > 0) {
                setAutoMessageFetchStatus(`检查完成，没有新消息；跳过 ${skippedRoomCount} 个缺少参数的小房间`, 'success');
            } else {
                setAutoMessageFetchStatus('检查完成，没有新消息', 'success');
            }

            return { success: failedCount === 0, addedCount, changedMemberCount, failedCount, skippedRoomCount, pendingRoomCount };
        } finally {
            if (isCurrentRun()) {
                autoMessageFetchInFlight = false;
                if (runButton) {
                    runButton.disabled = autoMessageFetchDraftDirty;
                    runButton.textContent = window.YayaRendererUtils.t('立即抓取');
                    runButton.title = window.YayaRendererUtils.t(autoMessageFetchDraftDirty ? '请先保存自动抓取设置' : '');
                }

                scheduleAutoMessageFetch();
            }
        }
    }

    function queueStartupAutoMessageFetch(delayMs = 0) {
        if (!autoMessageFetchStartupArmed || autoMessageFetchStartupCompleted) return;
        if (autoMessageFetchStartupTimer) clearTimeout(autoMessageFetchStartupTimer);

        autoMessageFetchStartupTimer = setTimeout(() => {
            autoMessageFetchStartupTimer = null;
            const config = readAutoMessageFetchConfig();
            if (!autoMessageFetchStartupArmed || !config.startupEnabled || autoMessageFetchStartupCompleted) return;
            if (!String(getAppToken() || readStoredToken() || '').trim()) {
                setAutoMessageFetchStatus('等待账号登录，登录后执行打开软件自动抓取');
                return;
            }
            if (autoMessageFetchInFlight || isAutoFetching || document.getElementById('loading-indicator')) {
                queueStartupAutoMessageFetch(30000);
                return;
            }

            autoMessageFetchStartupCompleted = true;
            Promise.resolve(runAutoMessageFetchNow({ startup: true })).catch(error => {
                console.warn('打开软件自动抓取失败:', error);
            });
        }, Math.max(0, Number(delayMs) || 0));
    }

    function invalidateAutoMessageFetchAccountState() {
        const hadUnsavedChanges = autoMessageFetchDraftDirty;
        autoMessageFetchAccountGeneration += 1;
        if (autoMessageFetchTimer) clearTimeout(autoMessageFetchTimer);
        if (autoMessageFetchStartupTimer) clearTimeout(autoMessageFetchStartupTimer);
        autoMessageFetchTimer = null;
        autoMessageFetchStartupTimer = null;
        autoMessageFetchInFlight = false;
        autoMessageFetchStartupArmed = false;
        autoMessageFetchStartupCompleted = false;
        autoMessageFetchDraftConfig = null;
        autoMessageFetchDraftDirty = false;
        autoMessageFetchSelectedMemberKey = '';
        autoMessageFetchResumes.clear();
        const runButton = document.getElementById('btn-auto-fetch-now');
        if (runButton) {
            runButton.disabled = false;
            runButton.textContent = window.YayaRendererUtils.t('立即抓取');
            runButton.title = '';
        }
        if (hadUnsavedChanges) renderAutoMessageFetchUi();
    }

    function activateAutoMessageFetchForCurrentAccount() {
        invalidateAutoMessageFetchAccountState();
        const config = readAutoMessageFetchConfig();
        autoMessageFetchStartupArmed = config.startupEnabled;
        renderAutoMessageFetchUi({ keepStatus: true });
        if (autoMessageFetchStartupArmed) {
            queueStartupAutoMessageFetch(1200);
        }
    }


    function initializeAutoMessageFetch() {
        if (window.desktop?.isRoomWindow) return;
        if (autoMessageFetchInitialized) return;
        autoMessageFetchInitialized = true;
        renderAutoMessageFetchUi();

        document.addEventListener('pointerdown', event => {
            const wrapper = document.querySelector('.auto-fetch-member-search');
            const results = document.getElementById('auto-fetch-member-results');
            if (wrapper && results && !wrapper.contains(event.target)) results.style.display = 'none';
            if (!event.target.closest?.('.auto-fetch-dropdown')) closeAutoMessageFetchDropdowns();
        });

        if (getCurrentPocketUserId()) {
            activateAutoMessageFetchForCurrentAccount();
        } else {
            invalidateAutoMessageFetchAccountState();
            renderAutoMessageFetchUi({ keepStatus: true });
        }
    }

    window.addEventListener('load', initializeAutoMessageFetch, { once: true });
    window.addEventListener('member-data-loaded', () => renderAutoMessageFetchUi({ keepStatus: true }));
    async function fetchAllMsgs() {
        const btn = document.getElementById('btn-fetch-all');
        const fetchBtn = document.getElementById('btn-fetch-one');
        const box = document.getElementById('msg-result');
        const memberSearch = document.getElementById('member-search');
        const exportBtn = document.getElementById('btn-export-jsonl');
        const exportLocalBtn = document.getElementById('btn-export-local');
        const toggleBtn = document.getElementById('btn-toggle-mode');
        const clearBoundaryBtn = document.getElementById('btn-clear-fetch-boundary');
        const channelInput = document.getElementById('tool-channel');
        const serverInput = document.getElementById('tool-server');
        const roomTypeBtn = document.getElementById('btn-toggle-fetch-room-type');
        const controls = [fetchBtn, memberSearch, toggleBtn, clearBoundaryBtn, channelInput, serverInput, roomTypeBtn];

        if (isAutoFetching) {
            isAutoFetching = false;
            btn.disabled = true;
            return;
        }

        if (btn.disabled || document.getElementById('loading-indicator')) return;

        const channelId = channelInput.value.trim();
        if (!channelId) {
            box.innerHTML = `<div style="text-align:center; padding:20px; color:#ff4d4f;">请先在搜索框输入名字并选择成员</div>`;
            return;
        }

        isAutoFetching = true;
        btn.innerText = window.YayaRendererUtils.t('停止加载');
        btn.style.background = '#ff4d4f';
        btn.style.color = 'white';
        controls.forEach(control => { if (control) control.disabled = true; });
        if (exportBtn) exportBtn.disabled = true;
        if (exportLocalBtn) exportLocalBtn.disabled = true;

        let canContinue = true;
        try {
            const resume = lastNextTime > 0 && isSameFetchRoom(channelId, serverInput.value.trim());
            canContinue = await fetchMsgs(resume, true);
            while (canContinue && isAutoFetching && lastNextTime > 0) {
                await sleep(50);
                if (isAutoFetching) canContinue = await fetchMsgs(true, true);
            }
        } finally {
            const wasStopped = !isAutoFetching;
            isAutoFetching = false;
            btn.disabled = false;
            btn.innerText = window.YayaRendererUtils.t('加载全部');
            btn.style.background = '';
            btn.style.color = '';
            controls.forEach(control => { if (control) control.disabled = false; });

            const statusEl = document.getElementById('fetch-status');
            if (statusEl && wasStopped) {
                statusEl.textContent = window.YayaRendererUtils.t('已停止，点击“加载全部”可继续查找');
            } else if (statusEl && canContinue && lastNextTime === 0) {
                statusEl.innerHTML += currentFetchStoppedAtPrevious
                    ? ' <b style="color:#28a745; margin-left:5px;">(已停在上次抓取位置)</b>'
                    : ' <b style="color:#28a745; margin-left:5px;">(完成)</b>';
            }
            if (allFetchedMsgs.length > 0) {
                if (exportBtn) exportBtn.disabled = false;
                if (exportLocalBtn) exportLocalBtn.disabled = false;
            }
        }
    }

    let isFetchAllMode = false;

    function toggleFetchMode() {
        isFetchAllMode = !isFetchAllMode;
        const btn = document.getElementById('btn-toggle-mode');

        if (isFetchAllMode) {
            btn.innerHTML = "当前模式：全体消息";
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
        } else {
            btn.innerHTML = "当前模式：只看成员";
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        }


    }
    function isSameFetchRoom(channelId, serverId) {
        return channelId === currentFetchedChannelId && serverId === currentFetchedServerId
            && getAppToken() === currentFetchedToken
            && isFetchAllMode === currentFetchedFetchAllMode
            && getFetchRoomType() === currentFetchedRoomType;
    }

    let allFetchedMsgs = [];
    const fetchedRoomHistoryKeys = new Set();
    async function fetchMsgs(isLoadMore = false, fromAuto = false) {
        if (document.getElementById('loading-indicator')) return false;
        if (!fromAuto && (isAutoFetching || document.getElementById('btn-fetch-all')?.disabled)) return false;
        const channelInput = document.getElementById('tool-channel');
        const serverInput = document.getElementById('tool-server');
        const channelId = channelInput.value.trim();
        let serverId = serverInput.value.trim();
        const box = document.getElementById('msg-result');
        const statusEl = document.getElementById('fetch-status');
        const exportBtn = document.getElementById('btn-export-jsonl');
        const exportLocalBtn = document.getElementById('btn-export-local');

        if (!channelId) {
            if (!isLoadMore) {
                box.innerHTML = `<div style="text-align:center; padding:20px; color:#ff4d4f;">请先在搜索框输入名字并选择成员</div>`;
            } else {
                console.warn("缺少 Channel ID");
            }
            return false;
        }

        isLoadMore = isLoadMore && isSameFetchRoom(channelId, serverId);
        if (!isLoadMore) {
            box.replaceChildren();
            lastNextTime = 0;
            roomHistoryProbe = null;
            allFetchedMsgs = [];
            fetchedRoomHistoryKeys.clear();
            currentFetchStopKey = loadFetchBoundary(serverId, channelId, isFetchAllMode);
            currentFetchStoppedAtPrevious = false;
            currentFetchedToken = getAppToken();
            currentFetchedServerId = serverId;
            currentFetchedChannelId = channelId;
            currentFetchedRoomType = getFetchRoomType();
            currentFetchedFetchAllMode = isFetchAllMode;
            if (statusEl) statusEl.replaceChildren();
            if (exportBtn) exportBtn.disabled = true;
            if (exportLocalBtn) exportLocalBtn.disabled = true;
        }

        const loadingDiv = document.createElement('div');
        loadingDiv.innerText = window.YayaRendererUtils.t('加载中...');
        loadingDiv.style.textAlign = 'center';
        loadingDiv.style.color = '#999';
        loadingDiv.id = 'loading-indicator';
        box.appendChild(loadingDiv);

        try {
            const token = getAppToken();
            const fetchAll = currentFetchedFetchAllMode;
            const boundaryTime = getFetchBoundaryTimestamp(currentFetchStopKey);
            let requestedTime = 0;
            let content;
            let rawList;
            const pagination = { cursor: lastNextTime, probe: roomHistoryProbe, emptySearchFloor: 0 };
            let pausedAtEmptyPages = false;
            while (!fromAuto || isAutoFetching) {
                requestedTime = lastNextTime;
                if (token !== getAppToken() || channelId !== channelInput.value.trim()
                    || !isSameFetchRoom(channelId, serverInput.value.trim())) return false;
                const requestStartedAt = Date.now();
                const hit = pagination.probe?.hit;
                if (hit && requestedTime === hit.cursor) {
                    content = hit.content;
                } else {
                    const res = await ipcRenderer.invoke('fetch-room-messages', {
                        token,
                        serverId,
                        channelId,
                        pa: window.getPA ? window.getPA() : null,
                        nextTime: requestedTime,
                        fetchAll
                    });
                    if (token !== getAppToken() || channelId !== channelInput.value.trim()
                        || !isSameFetchRoom(channelId, serverInput.value.trim())) return false;
                    if (!res?.success || !res.data?.content) throw new Error(res?.msg || '抓取接口未返回消息');
                    if (res.usedServerId) {
                        serverId = String(res.usedServerId);
                        serverInput.value = currentFetchedServerId = serverId;
                    }
                    content = res.data.content;
                }
                rawList = content.messageList || content.message || [];
                if (!Array.isArray(rawList)) throw new Error('抓取接口返回的消息格式无效');
                const step = advanceRoomHistoryProbe(pagination, content, rawList, requestStartedAt, boundaryTime);
                lastNextTime = pagination.cursor;
                roomHistoryProbe = pagination.probe;
                if (step === 'page') break;
                if (rawList.length) rawList = null;
                if (step === 'end' && boundaryTime) currentFetchStoppedAtPrevious = true;
                if (step === 'end' || (!fromAuto && !isLoadMore) || (fromAuto && !isAutoFetching)) break;
                if (step === 'pause') {
                    pausedAtEmptyPages = true;
                    break;
                }
                if (fromAuto && !isAutoFetching) return false;
                if (statusEl) {
                    const date = new Date(lastNextTime).toLocaleString();
                    const progress = roomHistoryProbe?.hit ? '已找到旧消息，正在细查' : '遇到空页，正在向前查找';
                    statusEl.textContent = window.YayaRendererUtils.t(`已抓取 ${allFetchedMsgs.length} 条，${progress} ${date} 前的消息`);
                }
                await sleep(350);
            }

            if (rawList && (!fromAuto || isAutoFetching || rawList.length)) {
                let list = fetchAll ? rawList : filterFetchedMemberMessages(rawList);
                if (currentFetchStopKey && rawList.length) {
                    const stopIndex = list.findIndex(m => buildFetchMessageKey(m) === currentFetchStopKey);
                    if (stopIndex >= 0) {
                        list = list.slice(0, stopIndex);
                        currentFetchStoppedAtPrevious = true;
                    } else if (boundaryTime && rawList.some(m => {
                        const timestamp = getFetchMessageTimestamp(m);
                        return timestamp > 0 && timestamp < boundaryTime;
                    })) {
                        list = list.filter(m => getFetchMessageTimestamp(m) >= boundaryTime);
                        currentFetchStoppedAtPrevious = true;
                    }
                }

                if (currentFetchStoppedAtPrevious) {
                    lastNextTime = 0;
                } else if (rawList.length) {
                    lastNextTime = getRoomHistoryPageCursor(content, rawList, requestedTime, boundaryTime);
                    if (!lastNextTime) currentFetchStoppedAtPrevious = true;
                }

                list = list.filter(message => {
                    const key = buildFetchMessageKey(message);
                    if (fetchedRoomHistoryKeys.has(key)) return false;
                    fetchedRoomHistoryKeys.add(key);
                    return true;
                });
                allFetchedMsgs.push(...list);
                document.getElementById('fetch-empty-state')?.remove();
                if (!allFetchedMsgs.length) {
                    const emptyState = document.createElement('div');
                    emptyState.id = 'fetch-empty-state';
                    emptyState.style.cssText = 'text-align:center;padding:20px;color:#999';
                    emptyState.textContent = window.YayaRendererUtils.t(currentFetchStoppedAtPrevious
                        ? '已到上次抓取位置，暂无新消息' : '当前页暂无可显示的消息');
                    box.appendChild(emptyState);
                }
                if (statusEl) {
                    let timeText = '';
                    const lastMsg = allFetchedMsgs.at(-1);
                    if (lastMsg) {
                        const d = new Date(lastMsg.msgTime);
                        const pad = (n) => String(n).padStart(2, '0');

                        timeText = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                    }
                    statusEl.innerHTML = `已抓取 <b style="color:var(--primary)">${allFetchedMsgs.length}</b> 条 <span style="margin-left:5px; ">${timeText}</span>`;
                    if (pausedAtEmptyPages) {
                        const nextProbe = new Date(lastNextTime).toLocaleString();
                        statusEl.append(window.YayaRendererUtils.t(` 连续 ${ROOM_HISTORY_EMPTY_RANGE_DAYS} 天未查到消息，已暂停。点击“加载全部”可从 ${nextProbe} 继续`));
                    }
                }


                const batchHtml = list.map(m => {

                    let txt = '[未知类型]';
                    let isMember = false;
                    let senderId = m.senderUserId || m.senderId || m.uid || '';
                    let extraHtml = '';

                    try {
                        let body = m.bodys;
                        if (m.msgContent) body = m.msgContent;

                        if (m.extInfo) {
                            const ext = typeof m.extInfo === 'string' ? JSON.parse(m.extInfo) : m.extInfo;
                            if (ext.user) {
                                if (ext.user.roleId > 1) isMember = true;
                                if (!senderId) senderId = ext.user.userId || ext.user.id;
                            }
                        }

                        if (typeof body === 'string' && (body.startsWith('{') || body.startsWith('['))) {
                            const json = JSON.parse(body);

                            if (m.msgType === 'text') txt = replaceTencentEmoji(json.text);
                            else if (m.msgType === 'image') txt = `[图片] 链接请见下方`;
                            else if (m.msgType === 'reply') txt = `回复: ${json.text}`;
                            else if (m.msgType === 'express') txt = `[表情]`;
                            else if (m.msgType === 'SHARE_LIVE' || (json && json.messageType === 'SHARE_LIVE')) {
                                const info = json.shareInfo || {};
                                txt = `[直播分享] ${info.shareTitle || '点击查看'}`;
                            }

                            else if (m.msgType === 'LIVEPUSH' || m.msgType === 'live_push') {
                                const info = json.livePushInfo || json;
                                const liveTitle = info.liveTitle || '直播';
                                const liveId = info.liveId;

                                txt = `[直播通知] ${liveTitle}`;

                                if (liveId) {
                                    m.tempLiveId = liveId;
                                }
                            }

                            else if (json.messageType === 'GIFT_TEXT' || m.msgType === 'GIFT_TEXT') {
                                const info = json.giftInfo || json;
                                txt = '';
                                extraHtml = renderPocketGiftCard(info);
                        }
                        else if ((json.messageType || '').toUpperCase().startsWith('RED_PACKET')) {
                            const esc = (value) => String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            const blessMessage = esc(json.blessMessage || '送来了红包祝福');
                            const creatorName = esc(json.creatorName || '未知用户');
                            const starName = esc(json.starName || '');
                            const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
                            const packetMainTextColor = isDarkTheme ? 'rgba(255,255,255,0.96)' : '#333';
                            const packetMetaTextColor = isDarkTheme ? 'rgba(255,255,255,0.82)' : '#444';
                            const packetImage = normalizePocketMediaUrl(json.openImgUrl || json.coverUrl);
                            txt = '';

                            extraHtml = `
    <div style="display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:10px; background: linear-gradient(135deg, rgba(255,120,117,0.12) 0%, rgba(255,120,117,0.04) 100%), rgba(0,0,0,0.02); border:1px solid rgba(255,110,110,0.2); width:220px; max-width:220px; box-sizing:border-box;">
        <img src="${packetImage}" style="width:34px; height:34px; object-fit:cover; border-radius:6px; flex-shrink:0; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
        <div style="min-width:0; flex:1;">
            <div style="font-size:10px; color:#ff7875; font-weight:bold; margin-bottom:2px;">红包</div>
            <div style="font-size:12px; color:${packetMainTextColor}; font-weight:bold; line-height:1.35; word-break:break-word;">${blessMessage}</div>
            <div style="font-size:11px; color:${packetMetaTextColor}; margin-top:4px; line-height:1.35; word-break:break-word;">${creatorName}${starName ? ` · ${starName}` : ''}</div>
        </div>
    </div>
`;
                        }
                        else if (
                            m.msgType === 'AUDIO_GIFT_REPLY' ||
                            json.messageType === 'AUDIO_GIFT_REPLY' ||
                            m.msgType === 'AUDIO_REPLY' ||
                            json.messageType === 'AUDIO_REPLY'
                            ) {
                                const info = json.replyInfo || json.giftReplyInfo || json;
                                const voiceUrl = normalizePocketMediaUrl(info.voiceUrl);
                                const rName = info.replyName || '未知用户';
                                const rText = info.replyText || '';
                                txt = '';

                                extraHtml = `
    <div style="margin-bottom:8px;">
        <audio controls src="${voiceUrl}" style="height:30px; max-width: 100%;"></audio>
    </div>
    <div style="padding: 4px; color: #666; background: rgba(0,0,0,0.03); border-radius: 4px;">
        ${rName}: ${rText}
    </div>
`;
                            }
                        } else {
                            txt = replaceTencentEmoji(body);
                        }
                    } catch (e) {
                        let raw = m.msgContent || m.bodys || '解析错误';
                        txt = replaceTencentEmoji(raw);
                    }

                    const time = new Date(m.msgTime).toLocaleString();
                    const nameColor = isMember ? '#FB7299' : '#333333';
                    const safeTxt = String(txt).replace(/</g, '&lt;').replace(/>/g, '&gt;');

                    const displayName = m.senderName || (m.extInfo && (typeof m.extInfo === 'string' ? JSON.parse(m.extInfo) : m.extInfo).user.nickName) || '未知用户';
                    const idDisplay = (senderId && String(senderId) !== '0')
                        ? `<span style="color:#999; font-size:10px; margin-left:6px; ">(ID:${senderId})</span>`
                        : '';


                    return `<div class="msg-item" style="padding:8px 0; border-bottom:1px solid #eee; font-size:13px;">
    <div style="color:#999; font-size:11px; margin-bottom:2px; display:flex; align-items:center;">
    <span style="margin-right: 5px;">${time}</span>
    <span style="color:${nameColor}; font-weight:${isMember ? 'bold' : 'normal'}">${displayName}</span>
    ${idDisplay}
    </div>
    <div style="color:#333; line-height:1.4; word-break: break-all;">
        ${safeTxt}
        ${extraHtml}
    </div>
</div>`;
                }).join('');

                const range = document.createRange();
                range.selectNodeContents(box);
                const fragment = range.createContextualFragment(batchHtml);

                box.appendChild(fragment);
                const MAX_DISPLAY_COUNT = 1000;
                const msgItems = box.getElementsByClassName('msg-item');

                if (msgItems.length > MAX_DISPLAY_COUNT) {
                    const removeCount = msgItems.length - MAX_DISPLAY_COUNT;
                    for (let i = 0; i < removeCount; i++) {
                        if (msgItems[0]) msgItems[0].remove();
                    }
                }

                if (!isAutoFetching && allFetchedMsgs.length) {
                    if (exportBtn) exportBtn.disabled = false;
                    if (exportLocalBtn) exportLocalBtn.disabled = false;
                }
                return !pausedAtEmptyPages;
            }
            return false;
        } catch (e) {
            if (statusEl) statusEl.textContent = window.YayaRendererUtils.t('抓取失败：' + e.message);
            return false;
        } finally {
            loadingDiv.remove();
        }
    }

    function getFetchExportMemberMeta(memberName, channelId) {
        const targetName = String(memberName || '').trim();
        const targetChannelId = String(channelId || '').trim();
        const members = getMemberData();

        const member = members.find(m => {
            const names = [m.ownerName, m.name, m.nickname, m.nickName, m.memberName]
                .map(value => String(value || '').trim());
            const channelIds = [
                m.channelId,
                m.roomId,
                m.channel_id,
                m.yklzId,
                m.smallRoomId,
                m.smallChannelId
            ].map(value => String(value || '').trim());

            return (targetChannelId && channelIds.includes(targetChannelId))
                || (targetName && names.includes(targetName));
        });

        const resolvedMemberName = String(
            (member && (member.ownerName || member.name || member.nickname || member.nickName || member.memberName))
            || targetName
            || '未命名成员'
        ).trim();
        const groupName = String(
            (member && (member.groupName || member.teamName || member.group || member.team))
            || '未知分团'
        ).trim();
        const exportPrefix = `${groupName}-${resolvedMemberName}`;

        return {
            memberName: resolvedMemberName,
            groupName,
            exportPrefix,
            channelId: targetChannelId || 'unknown'
        };
    }

    function fixFetchExportUrl(path) {
        if (!path) return 'https://www.snh48.com/images/logo_snh48.jpg';
        if (/^https?:\/\//i.test(path)) return path;
        if (path.includes('48.cn')) return `https://${path.replace(/^\/+/, '')}`;
        const baseUrl = 'https://source3.48.cn';
        return path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
    }

    function buildFetchExportKey(message, exportUserId, rawBody) {
        const primaryId = message.id || message.msgId || message.messageId || message.clientMsgId || '';
        const normalizedBody = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});
        const seed = [
            primaryId,
            message.msgTime || '',
            message.msgType || '',
            exportUserId || '',
            normalizedBody
        ].join('|');

        let hash = 0;
        for (let index = 0; index < seed.length; index += 1) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(index);
            hash |= 0;
        }
        return `msg_${Math.abs(hash)}_${message.msgTime || 0}`;
    }

    function buildFetchExportEntries(messages, source = {}) {
        const exportEntries = [];
        for (const m of (Array.isArray(messages) ? messages : [])) {
            const rawBody = m.bodys || m.msgContent || '';
            let structuredContent;

            if (typeof rawBody === 'string' && (rawBody.trim().startsWith('{') || rawBody.trim().startsWith('['))) {
                try {
                    structuredContent = window.YayaRendererFeatures.parseArchiveMessageJson(rawBody);
                } catch (error) {
                    structuredContent = { text: rawBody };
                }
            } else if (rawBody && typeof rawBody === 'object') {
                structuredContent = rawBody;
            } else {
                structuredContent = { text: String(rawBody || '') };
            }

            let avatarUrl = 'https://www.snh48.com/images/logo_snh48.jpg';
            let nickName = m.senderName || '未知用户';
            let exportUserId = m.senderUserId || '';
            let exportRoleId = 0;

            if (m.extInfo) {
                try {
                    const ext = typeof m.extInfo === 'string' ? JSON.parse(m.extInfo) : m.extInfo;
                    if (ext?.user) {
                        nickName = ext.user.nickName || nickName;
                        if (ext.user.avatar) avatarUrl = fixFetchExportUrl(ext.user.avatar);
                        if (!exportUserId) exportUserId = ext.user.userId || ext.user.id || '';
                        exportRoleId = Number(ext.user.roleId) || 0;
                    }
                } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/message-fetch-feature.mjs'); }
            }

            const sortTime = Number(m.msgTime) || Date.now();
            const messageDate = new Date(sortTime);
            const pad = (value) => String(value).padStart(2, '0');
            const timeStr = `${messageDate.getFullYear()}-${pad(messageDate.getMonth() + 1)}-${pad(messageDate.getDate())} ${pad(messageDate.getHours())}:${pad(messageDate.getMinutes())}:${pad(messageDate.getSeconds())}`;
            const exportKey = buildFetchExportKey(m, exportUserId, rawBody);

            exportEntries.push({
                ...window.YayaMessageRoomFilter.getMessageRoomMetadata(source),
                schemaVersion: 1,
                key: exportKey,
                sortTime,
                timeStr,
                messageType: String(structuredContent?.messageType || m.msgType || 'TEXT'),
                sender: {
                    name: String(nickName || '未知用户'),
                    avatarUrl: String(avatarUrl || ''),
                    userId: String(exportUserId || ''),
                    roleId: exportRoleId
                },
                content: structuredContent
            });
        }
        return exportEntries;
    }

    async function exportMsgsToJsonl() {
        if (allFetchedMsgs.length === 0) return showToast('没有消息可导出');
        const exportEntries = buildFetchExportEntries(allFetchedMsgs, {
            channelId: currentFetchedChannelId, roomType: currentFetchedRoomType
        });

        const selectedMemberName = getSelectedMemberName() || document.getElementById('member-search').value.trim() || '未命名成员';
        const selectedChannelId = currentFetchedChannelId || document.getElementById('tool-channel').value.trim();
        const exportMeta = getFetchExportMemberMeta(selectedMemberName, selectedChannelId);
        const exportFolderName = exportMeta.memberName;
        const exportFileName = `${exportMeta.exportPrefix}-${exportMeta.channelId}.jsonl`;
        const exportBtn = document.getElementById('btn-export-jsonl');
        const originalBtnText = exportBtn.innerText;
        const box = document.getElementById('msg-result');
        const tip = document.createElement('div');
        tip.style.cssText = "text-align:center; color:#28a745; margin-top:10px; font-weight:bold; padding:5px; border:1px solid #28a745; border-radius:4px; background:rgba(40,167,69,0.1);";

        try {
            exportBtn.innerText = window.YayaRendererUtils.t("正在导出");
            exportBtn.disabled = true;

            const res = await window.ipcRenderer.invoke('save-export-jsonl', {
                memberName: exportFolderName,
                fileName: exportFileName,
                entries: exportEntries
            });

            if (!res || !res.success) {
                throw new Error((res && res.msg) || '导出失败');
            }

            if (allFetchedMsgs.length > 0) {
                saveFetchBoundary(
                    currentFetchedServerId || document.getElementById('tool-server').value.trim(),
                    currentFetchedChannelId || document.getElementById('tool-channel').value.trim(),
                    currentFetchedFetchAllMode,
                    allFetchedMsgs[0]
                );
            }

            const displayPath = res.path || exportFileName;
            exportBtn.innerText = window.YayaRendererUtils.t(res.changed ? "导出成功" : "没有新增");
            exportBtn.style.backgroundColor = res.changed ? "#28a745" : "#6c757d";
            exportBtn.style.color = "white";
            tip.innerText = res.changed
                ? `已新增 ${res.addedCount} 条，共 ${res.totalCount} 条: ${displayPath}`
                : `没有新增消息，共 ${res.totalCount} 条: ${displayPath}`;
            box.appendChild(tip);

            setTimeout(() => {
                exportBtn.innerText = originalBtnText;
                exportBtn.style.backgroundColor = "";
                exportBtn.style.color = "";
                exportBtn.disabled = false;
                tip.remove();

                if (res.changed) {
                    switchView('messages');

                    const outputList = document.getElementById('outputList');
                    if (outputList) {
                        outputList.innerHTML = '<div class="placeholder-tip"><h3>正在读取新数据...</h3><p>由于导出内容已更新，分析可能需要一点时间。</p></div>';
                    }

                    if (typeof window.forceReloadData === 'function') {
                        requestAnimationFrame(() => {
                            setTimeout(() => {
                                window.forceReloadData();
                            }, 50);
                        });
                    }
                }
            }, 600);
        } catch (error) {
            exportBtn.innerText = originalBtnText;
            exportBtn.style.backgroundColor = "";
            exportBtn.style.color = "";
            exportBtn.disabled = false;
            showToast(`导出失败: ${error.message}`);
        }
    }

    return {
        invalidateAccountState: invalidateAutoMessageFetchAccountState,
        activateForAccount: activateAutoMessageFetchForCurrentAccount,
        actions: {
            clearFetchBoundary, handleAutoFetchMemberSearch, toggleAutoMessageFetchDropdown,
            selectAutoMessageFetchOption, saveAutoMessageFetchSettings, fetchAllMsgs,
            toggleFetchMode, fetchMsgs, exportMsgsToJsonl
        }
    };
}
