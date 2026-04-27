(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createFollowedChatFeature = function createFollowedChatFeature(deps) {
        const {
            createCustomAudioPlayer,
            createCustomVideoPlayer,
            fetchPocketAPI,
            getAdaptivePollDelay,
            getAppToken,
            getMemberData,
            ipcRenderer,
            playArchiveFromMessage,
            playLiveStream,
            replaceTencentEmoji,
            showToast,
            switchView
        } = deps;

        let followedAutoRefreshEnabled = false;
        let activeFollowedChannel = '';
        let activeFollowedServer = '';
        let activeFollowedName = '';
        let activeFollowedNextTime = 0;
        let isFollowedChatLoading = false;

        let followedAutoRefreshTimer = null;
        let followedAutoRefreshRunning = false;
        let activeFollowedMainChannel = '';
        let isFollowedSmallRoomMode = false;
        let followedStickToBottom = true;
        let followedUserScrollLockUntil = 0;
        let followedLastScrollTop = 0;
        let followedAutoScrollToken = 0;
        let followedPendingBottomTimer = null;
        let followedPendingHtml = '';
        let followedPendingCount = 0;
        let followedPendingMessageIds = new Set();
        let followedGiftCacheSaveTimer = null;

        function escapeFollowedHtml(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function normalizeFollowedPocketMediaUrl(mediaPath) {
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

        function scheduleFollowedGiftCacheSave() {
            if (followedGiftCacheSaveTimer) {
                clearTimeout(followedGiftCacheSaveTimer);
            }

            followedGiftCacheSaveTimer = setTimeout(() => {
                followedGiftCacheSaveTimer = null;
                const cacheApi = window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
                if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                    cacheApi.setCacheValueSync('POCKET_GIFT_DATA_CACHE', POCKET_GIFT_DATA);
                } else {
                    localStorage.setItem('POCKET_GIFT_DATA_CACHE', JSON.stringify(POCKET_GIFT_DATA));
                }
            }, 500);
        }

        function upsertFollowedPocketGiftData(giftInfo = {}, unitCost = 0) {
            if (typeof POCKET_GIFT_DATA === 'undefined') return false;

            const id = String(giftInfo.giftId || giftInfo.id || '').trim();
            const name = String(giftInfo.giftName || giftInfo.name || '').trim();
            const cost = Number(unitCost || giftInfo.money || giftInfo.cost || 0);
            if ((!id && !name) || !cost) return false;

            const existing = POCKET_GIFT_DATA.find(item => (id && String(item.id) === id) || (name && item.name === name));
            if (existing) {
                const changed = Number(existing.cost || 0) !== cost
                    || (id && String(existing.id || '') !== id)
                    || (name && existing.name !== name);
                if (!changed) return false;

                existing.id = id || existing.id;
                existing.name = name || existing.name;
                existing.cost = cost;
            } else {
                POCKET_GIFT_DATA.push({ id, name: name || id, cost });
            }

            scheduleFollowedGiftCacheSave();
            return true;
        }

        function renderFollowedPocketGiftCard(giftInfo = {}) {
            const giftName = escapeFollowedHtml(giftInfo.giftName || giftInfo.name || '未知礼物');
            const giftNum = Number(giftInfo.giftNum || giftInfo.num || giftInfo.count || 1) || 1;
            const giftImg = normalizeFollowedPocketMediaUrl(giftInfo.picPath || giftInfo.giftPic || giftInfo.image || '');
            let unitCost = Number(giftInfo.money || giftInfo.cost || 0);

            if (!unitCost && typeof POCKET_GIFT_DATA !== 'undefined') {
                const gift = POCKET_GIFT_DATA.find(item => item.id == (giftInfo.giftId || giftInfo.id) || item.name === (giftInfo.giftName || giftInfo.name));
                if (gift) unitCost = Number(gift.cost || 0);
            }

            upsertFollowedPocketGiftData(giftInfo, unitCost);

            const costDisplay = unitCost
                ? `<span style="margin-left:5px; color:#fa8c16; font-weight:bold;">(${unitCost * giftNum}🍗)</span>`
                : '';

            return `
                <div class="mb-2" style="display:flex; align-items:center; background:#fff0f6; padding:6px 8px; border-radius:6px; border:1px solid #ffadd2; max-width: 300px;">
                    ${giftImg ? `<img src="${escapeFollowedHtml(giftImg)}" style="width: 25px !important; height: 25px !important; max-width: 32px !important; max-height: 32px !important; object-fit: contain !important; margin: 0 8px 0 0 !important; border-radius: 4px; box-shadow: none !important;">` : '<span style="font-size:24px; margin-right:8px;">🎁</span>'}
                    <div style="flex: 1; overflow: hidden;">
                        <div style="color:#eb2f96; font-weight:bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">送出礼物：${giftName}</div>
                        <div style="font-size:11px; color:#888;">数量: x${giftNum} ${costDisplay}</div>
                    </div>
                </div>`;
        }

        function resetFollowedPendingBottomTimer() {
            if (followedPendingBottomTimer) {
                clearTimeout(followedPendingBottomTimer);
                followedPendingBottomTimer = null;
            }
        }

        function invalidateFollowedAutoScrollJobs() {
            followedAutoScrollToken += 1;
            resetFollowedPendingBottomTimer();
        }

        function getFollowedNewMessageNotice() {
            return document.getElementById('followed-chat-new-messages');
        }

        function updateFollowedPendingNotice() {
            const btn = getFollowedNewMessageNotice();
            if (!btn) return;

            if (followedPendingCount > 0) {
                btn.style.display = 'inline-flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                btn.innerText = `有 ${followedPendingCount} 条新消息`;
                return;
            }

            btn.style.display = 'none';
            btn.innerText = '有新消息';
        }

        function resetFollowedPendingMessages() {
            followedPendingHtml = '';
            followedPendingCount = 0;
            followedPendingMessageIds.clear();
            updateFollowedPendingNotice();
        }

        function collectFollowedRenderedMessageIds(container, includePending = false) {
            const ids = new Set();

            if (container) {
                container.querySelectorAll('.msg-item').forEach(el => {
                    if (el.dataset.msgid) ids.add(String(el.dataset.msgid));
                });
            }

            if (includePending) {
                followedPendingMessageIds.forEach(id => ids.add(String(id)));
            }

            return ids;
        }

        function removeFollowedEmptyState(container) {
            if (!container) return;
            container.querySelectorAll('.empty-state').forEach(el => el.remove());
        }

        function queueFollowedPendingBatch(batchHtml, messageIds) {
            if (!batchHtml || !messageIds || messageIds.length === 0) {
                return;
            }

            followedPendingHtml += batchHtml;
            messageIds.forEach(id => followedPendingMessageIds.add(String(id)));
            followedPendingCount = followedPendingMessageIds.size;
            updateFollowedPendingNotice();
        }

        function hydrateFollowedPreviewMedia(container) {
            if (!container) return;

            container.querySelectorAll('.preview-media-placeholder').forEach(el => {
                const type = el.getAttribute('data-type');
                const src = el.getAttribute('data-src');
                if (src) {
                    if (type === 'audio' && typeof createCustomAudioPlayer === 'function') {
                        el.appendChild(createCustomAudioPlayer(src));
                    } else if (type === 'video' && typeof createCustomVideoPlayer === 'function') {
                        el.appendChild(createCustomVideoPlayer(src));
                    }
                }
                el.classList.remove('preview-media-placeholder');
            });
        }

        function scrollFollowedToBottom(msgBox, respectAutoScrollLock = false) {
            if (!msgBox) return;

            const autoScrollTokenAtAppend = followedAutoScrollToken;

            resetFollowedPendingBottomTimer();
            msgBox.scrollTop = msgBox.scrollHeight;
            followedLastScrollTop = msgBox.scrollTop;

            const goBottomSmart = () => {
                if (autoScrollTokenAtAppend !== followedAutoScrollToken) {
                    return;
                }
                if (!respectAutoScrollLock || canFollowedAutoScroll(msgBox)) {
                    msgBox.scrollTop = msgBox.scrollHeight;
                    followedLastScrollTop = msgBox.scrollTop;
                }
            };

            msgBox.querySelectorAll('img').forEach(img => {
                if (!img.complete) {
                    img.addEventListener('load', goBottomSmart, { once: true });
                    img.addEventListener('error', goBottomSmart, { once: true });
                }
            });

            followedPendingBottomTimer = setTimeout(() => {
                followedPendingBottomTimer = null;
                goBottomSmart();
            }, 300);
        }

        function flushFollowedPendingMessages() {
            const msgBox = document.getElementById('followed-chat-messages');
            if (!msgBox || !followedPendingHtml) {
                resetFollowedPendingMessages();
                return;
            }

            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            invalidateFollowedAutoScrollJobs();
            removeFollowedEmptyState(msgBox);

            const fragment = document.createRange().createContextualFragment(followedPendingHtml);
            msgBox.appendChild(fragment);
            hydrateFollowedPreviewMedia(msgBox);
            resetFollowedPendingMessages();
            scrollFollowedToBottom(msgBox, false);
        };

        function updateFollowedScrollStickState(container) {
            if (!container) return;

            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            const isNearBottom = distanceFromBottom < 60;
            const isScrollingUp = container.scrollTop < followedLastScrollTop - 2;
            followedLastScrollTop = container.scrollTop;

            if (isNearBottom) {
                followedStickToBottom = true;
                followedUserScrollLockUntil = 0;
                return;
            }

            if (isScrollingUp) {
                followedStickToBottom = false;
                followedUserScrollLockUntil = Number.MAX_SAFE_INTEGER;
                return;
            }

            if (!followedStickToBottom) {
                return;
            }
        }

        function canFollowedAutoScroll(container) {
            if (!container) return false;

            if (followedStickToBottom) return true;

            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            if (distanceFromBottom < 60) {
                followedStickToBottom = true;
                followedUserScrollLockUntil = 0;
                return true;
            }

            if (Date.now() < followedUserScrollLockUntil) {
                return false;
            }

            return false;
        }

        function lockFollowedAutoScroll() {
            followedStickToBottom = false;
            followedUserScrollLockUntil = Number.MAX_SAFE_INTEGER;
            invalidateFollowedAutoScrollJobs();
        }

        async function playSharedLiveFromMessage(liveId, nickname, timeStr, title) {
            if (!liveId) return;

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveList', JSON.stringify({
                    debug: true,
                    next: 0,
                    groupId: 0,
                    record: false
                }));

                const liveList = Array.isArray(res?.content?.liveList) ? res.content.liveList : [];
                const matchedLive = liveList.find(item => String(item.liveId) === String(liveId));

                if (matchedLive && typeof playLiveStream === 'function') {
                    switchView('media', 'live');
                    setTimeout(() => {
                        playLiveStream(matchedLive, 'live');
                    }, 300);
                    return;
                }
            } catch (error) {
                console.warn('[关注房间] 判断分享直播状态失败，回退到回放模式:', error);
            }

            if (typeof playArchiveFromMessage === 'function') {
                playArchiveFromMessage(liveId, nickname, timeStr, title || '直播分享');
            }
        }

        function openFollowedChat(ownerName, channelId, serverId) {
            activeFollowedChannel = channelId;
            activeFollowedMainChannel = channelId;
            activeFollowedServer = serverId;
            activeFollowedName = ownerName;
            activeFollowedNextTime = 0;
            isFollowedSmallRoomMode = false;
            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            followedLastScrollTop = 0;
            invalidateFollowedAutoScrollJobs();
            resetFollowedPendingMessages();

            if (followedAutoRefreshTimer) {
                clearTimeout(followedAutoRefreshTimer);
                followedAutoRefreshTimer = null;
            }
            followedAutoRefreshEnabled = false;
            followedAutoRefreshRunning = false;

            const roomBtn = document.getElementById('btn-toggle-room-type');
            if (roomBtn) {
                roomBtn.innerText = "大房间";
                roomBtn.classList.remove('btn-primary');
                roomBtn.classList.add('btn-secondary');
            }

            document.querySelectorAll('.session-card').forEach(card => card.classList.remove('active'));
            const selectedCard = document.getElementById(`session-card-${channelId}`);
            if (selectedCard) selectedCard.classList.add('active');

            const header = document.getElementById('followed-chat-header');
            header.style.visibility = 'visible';
            document.getElementById('followed-chat-title').innerText = `${ownerName} 的房间`;
            document.getElementById('followed-chat-subtitle').innerText = `Channel ID: ${channelId}`;

            const avatarImg = document.getElementById('followed-chat-avatar');
            const memberInfo = getMemberData().find(m => String(m.channelId) === String(channelId));

            if (memberInfo && memberInfo.id) {
                const avatarPath = window.globalAvatarCache[memberInfo.id] ||
                    (memberInfo.avatar ? (memberInfo.avatar.startsWith('http') ? memberInfo.avatar : `https://source.48.cn${memberInfo.avatar}`) : null);

                if (avatarPath) {
                    avatarImg.src = avatarPath;
                    avatarImg.style.display = 'block';
                } else {
                    avatarImg.style.display = 'none';
                }
            } else {
                avatarImg.style.display = 'none';
            }

            const msgBox = document.getElementById('followed-chat-messages');
            msgBox.style.transition = 'opacity 0.2s';
            msgBox.style.opacity = '0.4';
            msgBox.style.pointerEvents = 'none';

            loadFollowedChatPage(false).finally(() => {
                followedAutoRefreshEnabled = true;

                const scheduleNext = () => {
                    if (!followedAutoRefreshEnabled) return;
                    followedAutoRefreshTimer = setTimeout(runPoll, getAdaptivePollDelay());
                };

                const runPoll = async () => {
                    if (!followedAutoRefreshEnabled) return;
                    const view = document.getElementById('view-followed-rooms');
                    if ((view && view.style.display === 'none') || followedAutoRefreshRunning) {
                        scheduleNext();
                        return;
                    }
                    followedAutoRefreshRunning = true;
                    try {
                        await loadFollowedChatPage(false, true);
                    } finally {
                        followedAutoRefreshRunning = false;
                        scheduleNext();
                    }
                };

                scheduleNext();
            });
        };

        function toggleFollowedRoomType() {
            if (isFollowedChatLoading || !activeFollowedName) return;

            const memberInfo = getMemberData().find(m => m.ownerName === activeFollowedName);

            if (!isFollowedSmallRoomMode) {
                const smallRoomId = memberInfo ? memberInfo.yklzId : null;
                if (!smallRoomId) {
                    showToast(`⚠️ 未在数据中找到 ${activeFollowedName} 的小房间 ID`);
                    return;
                }
                isFollowedSmallRoomMode = true;
                activeFollowedChannel = smallRoomId;
            } else {
                isFollowedSmallRoomMode = false;
                activeFollowedChannel = activeFollowedMainChannel;
            }

            const btn = document.getElementById('btn-toggle-room-type');
            if (isFollowedSmallRoomMode) {
                btn.innerText = "小房间";
            } else {
                btn.innerText = "大房间";
            }

            document.getElementById('followed-chat-subtitle').innerText = `Channel ID: ${activeFollowedChannel} ${isFollowedSmallRoomMode ? '' : ''}`;

            activeFollowedNextTime = 0;
            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            followedLastScrollTop = 0;
            invalidateFollowedAutoScrollJobs();
            resetFollowedPendingMessages();
            const msgBox = document.getElementById('followed-chat-messages');
            msgBox.style.transition = 'opacity 0.2s';
            msgBox.style.opacity = '0.4';
            msgBox.style.pointerEvents = 'none';
            msgBox.innerHTML = '';

            loadFollowedChatPage(false);
        }

        function jumpToFullRoom() {
            if (!activeFollowedChannel) return;
            switchView('fetch');
            document.getElementById('member-search').value = activeFollowedName;
            document.getElementById('tool-channel').value = activeFollowedChannel;
            document.getElementById('tool-server').value = activeFollowedServer;
            setTimeout(() => document.getElementById('btn-fetch-one').click(), 300);
        }

        let isFollowedChatAllMode = false;

        function toggleFollowedChatMode() {
            if (isFollowedChatLoading) return;

            isFollowedChatAllMode = !isFollowedChatAllMode;
            const btn = document.getElementById('btn-toggle-followed-mode');
            const msgBox = document.getElementById('followed-chat-messages');

            btn.innerText = "切换中...";
            btn.disabled = true;

            msgBox.style.transition = 'opacity 0.2s';
            msgBox.style.opacity = '0.4';

            if (isFollowedChatAllMode) {
            } else {
            }

            activeFollowedNextTime = 0;
            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            followedLastScrollTop = 0;
            invalidateFollowedAutoScrollJobs();
            resetFollowedPendingMessages();

            loadFollowedChatPage(false).finally(() => {
                btn.innerText = isFollowedChatAllMode ? "全部消息" : "成员消息";
                btn.disabled = false;
            });
        };

        async function loadFollowedChatPage(isLoadMore, isAutoRefresh = false) {
            if (isFollowedChatLoading) return;
            isFollowedChatLoading = true;

            const msgBox = document.getElementById('followed-chat-messages');
            const token = getAppToken();
            const pa = window.getPA ? window.getPA() : null;

            const oldScrollHeight = msgBox.scrollHeight;
            const shouldAutoScroll = canFollowedAutoScroll(msgBox);

            try {
                const fetchNextTime = isAutoRefresh ? 0 : activeFollowedNextTime;

                const res = await ipcRenderer.invoke('fetch-room-messages', {
                    token: token,
                    serverId: activeFollowedServer,
                    channelId: activeFollowedChannel,
                    pa: pa,
                    nextTime: fetchNextTime,
                    fetchAll: isFollowedChatAllMode
                });

                if (res.success && res.data.content) {
                    if (res.usedServerId) activeFollowedServer = res.usedServerId;
                    const content = res.data.content;
                    let list = content.messageList || content.message || [];

                    list = list.filter(m => {
                        let sid = m.senderUserId || m.senderId || m.uid;
                        if (!sid && m.extInfo) {
                            try {
                                const ext = typeof m.extInfo === 'string' ? JSON.parse(m.extInfo) : m.extInfo;
                                if (ext.user) sid = ext.user.userId || ext.user.id;
                            } catch (e) { }
                        }
                        return String(sid) !== '121569667';
                    });

                    if (!isAutoRefresh && !isLoadMore) {
                        activeFollowedNextTime = content.nextTime;
                        if (list.length === 0) activeFollowedNextTime = 0;
                    } else if (isLoadMore) {
                        activeFollowedNextTime = content.nextTime;
                    }

                    if (!isLoadMore && !isAutoRefresh) msgBox.innerHTML = '';
                    const oldBtn = document.getElementById('btn-load-more-followed');
                    if (oldBtn) oldBtn.remove();

                    if (list.length === 0 && !isLoadMore && !isAutoRefresh) {
                        msgBox.innerHTML = '<div class="empty-state" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text-sub); font-size: 14px;">暂无新消息</div>';
                        isFollowedChatLoading = false;
                        return;
                    }

                    const reversedList = [...list].reverse();
                    const existingIds = isAutoRefresh
                        ? collectFollowedRenderedMessageIds(msgBox, true)
                        : new Set();
                    const batchMessageIds = [];

                    const batchHtml = reversedList.map(m => {
                        const msgId = m.msgidClient || m.msgId || m.msgTime;

                        if (typeof isAutoRefresh !== 'undefined' && isAutoRefresh && typeof existingIds !== 'undefined' && existingIds.has(String(msgId))) {
                            return '';
                        }

                        batchMessageIds.push(String(msgId));

                        let txt = '[不支持的消息格式]';
                        let isMember = false;
                        let displayName = m.senderName || '未知用户';
                        let avatarUrl = './icon.png';
                        let body = m.bodys || m.msgContent || '';
                        let extraHtml = '';

                        const safeStr = (str) => String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        const msgDate = new Date(m.msgTime);
                        const msgPad = (n) => String(n).padStart(2, '0');
                        const fallbackTimeStr = `${msgDate.getFullYear()}-${msgPad(msgDate.getMonth() + 1)}-${msgPad(msgDate.getDate())} ${msgPad(msgDate.getHours())}:${msgPad(msgDate.getMinutes())}:${msgPad(msgDate.getSeconds())}`;

                        if (m.extInfo) {
                            try {
                                const safeExtInfo = typeof m.extInfo === 'string' ? m.extInfo.replace(/:\s*([0-9]{16,})/g, ':"$1"') : m.extInfo;
                                const ext = typeof safeExtInfo === 'string' ? JSON.parse(safeExtInfo) : safeExtInfo;
                                if (ext && ext.user) {
                                    if (ext.user.roleId > 1) isMember = true;
                                    if (ext.user.nickName) displayName = ext.user.nickName;
                                    if (ext.user.avatar) {
                                        avatarUrl = ext.user.avatar.startsWith('http') ? ext.user.avatar : `https://source.48.cn${ext.user.avatar}`;
                                    }
                                }
                            } catch (e) { console.warn('用户信息(extInfo)解析失败', e); }
                        }

                        try {
                            let json = null;
                            if (typeof body === 'string' && (body.startsWith('{') || body.startsWith('['))) {
                                try {
                                    json = JSON.parse(body);
                                    if (typeof json === 'string') json = JSON.parse(json);
                                } catch (parseErr) { }
                            } else if (typeof body === 'object' && body !== null) {
                                json = body;
                            }

                            if (json) {
                                const msgType = (m.msgType || '').toUpperCase();
                                const jsonType = (json.messageType || '').toUpperCase();

                                if (msgType === 'TEXT') {
                                    txt = `<p class="mb-2 template-pre">${safeStr(json.text || json.bodys || body)}</p>`;
                                } else if (msgType === 'IMAGE') {
                                    const url = json.url.startsWith('http') ? json.url : `https://source3.48.cn${json.url}`;
                                    txt = `<div class="mb-2"><img class="template-media" src="${url}" loading="lazy" style="max-height: 250px; border-radius: 8px; cursor: zoom-in;" onclick="openImageModal('${url}')"></div>`;
                                } else if (msgType === 'EXPRESSIMAGE') {
                                    const url = json.expressImgInfo ? json.expressImgInfo.emotionRemote : json.url;
                                    txt = `<div class="mb-2"><img class="template-image-express-image" src="${url.startsWith('http') ? url : 'https://source3.48.cn' + url}"></div>`;
                                } else if (msgType === 'REPLY' || msgType === 'GIFTREPLY') {
                                    let info = json.replyInfo || json.giftReplyInfo || (json.bodys && (json.bodys.replyInfo || json.bodys.giftReplyInfo));
                                    const rName = safeStr(info?.replyName || '用户');
                                    const rText = safeStr(info?.replyText || '消息');
                                    const myText = safeStr(info?.text || json.text || body);
                                    txt = `<p class="mb-2 template-pre">${myText}</p>
                                           <blockquote class="ml-2 mb-2 p-2" style="background: var(--blockquote-bg); border-left: 4px solid var(--border); color: var(--text-sub); border-radius: 0 4px 4px 0;">
                                               ${rName}：${rText}
                                           </blockquote>`;
                                } else if (msgType === 'AUDIO') {
                                    let mediaUrl = json.url.startsWith('http') ? json.url : `https://mp4.48.cn${json.url.startsWith('/') ? '' : '/'}${json.url}`;
                                    txt = `<div class="mb-2 preview-media-placeholder" data-type="audio" data-src="${mediaUrl}"></div>`;
                                } else if (msgType === 'VIDEO') {
                                    let mediaUrl = json.url.startsWith('http') ? json.url : `https://mp4.48.cn${json.url.startsWith('/') ? '' : '/'}${json.url}`;
                                    txt = `<div class="mb-2 preview-media-placeholder" data-type="video" data-src="${mediaUrl}"></div>`;
                                } else if (jsonType === 'GIFT_TEXT' || msgType === 'GIFT_TEXT') {
                                    const info = json.giftInfo || json;
                                    txt = renderFollowedPocketGiftCard(info);
                                } else if (msgType.includes('FLIPCARD') || jsonType.includes('FLIPCARD')) {
                                    const possibleKeys = ['flipCardInfo', 'filpCardInfo', 'flipCardAudioInfo', 'filpCardAudioInfo', 'flipCardVideoInfo', 'filpCardVideoInfo'];
                                    let flipInfo = null;
                                    for (const key of possibleKeys) {
                                        if (json[key]) { flipInfo = json[key]; break; }
                                        if (json.bodys && json.bodys[key]) { flipInfo = json.bodys[key]; break; }
                                    }
                                    const qText = flipInfo?.question || json.question || '（无法解析的问题内容）';
                                    let aContent = flipInfo?.answer || json.answer || '';
                                    let ansHtml = '';
                                    if (msgType === 'FLIPCARD' || (jsonType === 'FLIPCARD' && typeof aContent === 'string' && !aContent.includes('url'))) {
                                        ansHtml = `<div style="font-size:14px; color:var(--text); line-height:1.6; padding:0 4px;">${safeStr(aContent)}</div>`;
                                    } else {
                                        try {
                                            const ansObj = typeof aContent === 'string' ? JSON.parse(aContent) : aContent;
                                            if (ansObj && ansObj.url) {
                                                let mediaUrl = ansObj.url.startsWith('http') ? ansObj.url : `https://mp4.48.cn${ansObj.url.startsWith('/') ? '' : '/'}${ansObj.url}`;
                                                const mType = (msgType.includes('AUDIO') || jsonType.includes('AUDIO')) ? 'audio' : 'video';
                                                ansHtml = `<div class="preview-media-placeholder" data-type="${mType}" data-src="${mediaUrl}" style="margin-top:8px;"></div>`;
                                            }
                                        } catch (e) { }
                                    }
                                    txt = `<div style="margin-bottom: 8px;">
                                                <span class="flip-label question-tag" style="margin-right:8px; transform:none; display:inline-flex;">翻牌提问</span>
                                                <span style="font-size:14px; color:var(--text); line-height: 1.5;">${safeStr(qText)}</span>
                                           </div>
                                           <div style="margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 8px;">
                                                <span class="flip-label answer-tag" style="margin-right:8px; transform:none; display:inline-flex;">成员回答</span>
                                                ${ansHtml}
                                           </div>`;
                                } else if (msgType === 'LIVEPUSH' || msgType === 'LIVE_PUSH' || jsonType === 'LIVEPUSH') {
                                    const info = json.livePushInfo || json;
                                    const liveTitle = safeStr(info.liveTitle || '直播开始了');
                                    const liveId = info.liveId;
                                    const cover = info.liveCover ? (info.liveCover.startsWith('http') ? info.liveCover : `https://source.48.cn${info.liveCover}`) : './icon.png';
                                    const d = new Date(m.msgTime);
                                    const pad = (n) => String(n).padStart(2, '0');
                                    const tStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                                    const escapedTitle = liveTitle.replace(/'/g, "\\'");
                                    const escapedName = safeStr(displayName).replace(/'/g, "\\'");
                                    txt = `<div class="vod-card-row" style="margin-top: 8px; width: 100%; box-sizing: border-box; background: var(--bg); border: 1px solid var(--border); box-shadow: none; ${liveId ? 'cursor: pointer;' : 'cursor: default;'}" 
                                         ${liveId ? `onclick="event.stopPropagation(); playSharedLiveFromMessage('${liveId}', '${escapedName}', '${tStr}', '${escapedTitle}')"` : ''}>
                                        <div class="vod-row-cover-container" style="width: 100px; height: 56px; border-radius: 6px;">
                                            <img src="${cover}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">
                                            <div class="vod-badge" style="bottom: 4px; right: 4px; background-color: #722ed1;">通知</div>
                                        </div>
                                        <div class="vod-row-info" style="height: 56px; justify-content: space-between;">
                                            <div class="vod-row-name" style="font-size: 14px; color: var(--text);">${safeStr(displayName)}</div>
                                            <div class="vod-row-title" style="font-size: 12px; color: var(--text-sub);">${liveTitle}</div>
                                            <div class="vod-row-time" style="font-size: 11px; color: var(--text-sub); opacity: 0.6;">${tStr}</div>
                                        </div>
                                    </div>`;
                                } else if (msgType === 'SHARE_LIVE' || jsonType === 'SHARE_LIVE') {
                                    const info = json.shareInfo || {};
                                    const shareTitle = safeStr(info.shareTitle || '直播分享');
                                    const shareDesc = safeStr(info.shareDesc || '');
                                    const liveUserName = safeStr(info.liveUserName || displayName || '');
                                    const sharePicRaw = info.sharePic || '';
                                    const sharePic = sharePicRaw
                                        ? (sharePicRaw.startsWith('http') ? sharePicRaw : `https://source.48.cn${sharePicRaw}`)
                                        : './icon.png';
                                    let sharedLiveId = '';
                                    if (info.jumpPath) {
                                        const match = String(info.jumpPath).match(/id=(\d+)/);
                                        if (match) sharedLiveId = match[1];
                                    }

                                    const escapedTitle = shareTitle.replace(/'/g, "\\'");
                                    const escapedName = liveUserName.replace(/'/g, "\\'");
                                    const shareTime = shareDesc || fallbackTimeStr;

                                    txt = `<div class="vod-card-row" style="margin-top: 8px; width: 100%; box-sizing: border-box; background: var(--bg); border: 1px solid var(--border); box-shadow: none; ${sharedLiveId ? 'cursor: pointer;' : 'cursor: default;'}"
                                         ${sharedLiveId ? `onclick="event.stopPropagation(); playSharedLiveFromMessage('${sharedLiveId}', '${escapedName}', '${shareTime}', '${escapedTitle}')"` : ''}>
                                        <div class="vod-row-cover-container" style="width: 100px; height: 56px; border-radius: 6px;">
                                            <img src="${sharePic}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;" onerror="this.src='./icon.png'">
                                            <div class="vod-badge" style="bottom: 4px; right: 4px; background-color: #722ed1;">分享</div>
                                        </div>
                                        <div class="vod-row-info" style="height: 56px; justify-content: space-between;">
                                            <div class="vod-row-name" style="font-size: 14px; color: var(--text);">${liveUserName || safeStr(displayName)}</div>
                                            <div class="vod-row-title" style="font-size: 12px; color: var(--text-sub);">${shareTitle}</div>
                                            <div class="vod-row-time" style="font-size: 11px; color: var(--text-sub); opacity: 0.6;">${shareTime}</div>
                                        </div>
                                    </div>`;
                                } else if (jsonType.startsWith('RED_PACKET')) {
                                    const blessMessage = safeStr(json.blessMessage || '送来了红包祝福');
                                    const creatorName = safeStr(json.creatorName || displayName || '未知用户');
                                    const starName = safeStr(json.starName || '');
                                    const packetImageRaw = json.openImgUrl || json.coverUrl || '';
                                    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
                                    const packetMainTextColor = isDarkTheme ? 'rgba(255,255,255,0.96)' : 'var(--text)';
                                    const packetMetaTextColor = isDarkTheme ? 'rgba(255,255,255,0.82)' : 'var(--text)';
                                    const packetImage = packetImageRaw
                                        ? (packetImageRaw.startsWith('http') ? packetImageRaw : `https://source.48.cn${packetImageRaw}`)
                                        : './icon.png';
                                    txt = `<div style="display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:10px; background: linear-gradient(135deg, rgba(255,120,117,0.12) 0%, rgba(255,120,117,0.04) 100%), var(--input-bg); border:1px solid rgba(255,120,117,0.22); width: 220px; max-width: 220px; box-sizing: border-box;">
                                        <img src="${packetImage}" style="width:34px; height:34px; object-fit:cover; border-radius:6px; flex-shrink:0; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
                                        <div style="min-width:0; flex:1;">
                                            <div style="font-size:10px; color:#ff7875; font-weight:bold; margin-bottom:2px;">红包</div>
                                            <div style="font-size:12px; color:${packetMainTextColor}; font-weight:bold; line-height:1.35; word-break:break-word;">${blessMessage}</div>
                                            <div style="font-size:11px; color:${packetMetaTextColor}; margin-top:4px; line-height:1.35; word-break:break-word;">${creatorName}${starName ? ` · ${starName}` : ''}</div>
                                        </div>
                                    </div>`;
                                } else if (
                                    msgType === 'AUDIO_GIFT_REPLY' ||
                                    jsonType === 'AUDIO_GIFT_REPLY' ||
                                    msgType === 'AUDIO_REPLY' ||
                                    jsonType === 'AUDIO_REPLY'
                                ) {
                                    const info = json.replyInfo || json.giftReplyInfo || json;
                                    let voiceUrl = info.voiceUrl || '';
                                    if (voiceUrl && !voiceUrl.startsWith('http')) {
                                        voiceUrl = `https://mp4.48.cn${voiceUrl.startsWith('/') ? '' : '/'}${voiceUrl}`;
                                    }
                                    const rName = safeStr(info.replyName || '未知用户');
                                    const rText = safeStr(info.replyText || '');
                                    txt = '';
                                    extraHtml = `<div class="preview-media-placeholder" data-type="audio" data-src="${voiceUrl}" style="margin: 0 0 12px 0;"></div>
                                            <div style="background: var(--blockquote-bg); padding: 8px 12px; border-radius: 6px; border-left: 3px solid var(--border); margin: 0 0 8px 0; color: var(--text-sub); font-size: 13px; line-height: 1.5;">
                                                ${rName}：${rText}
                                            </div>`;
                                } else {
                                    txt = `<p class="mb-2 template-pre">${safeStr(body)}</p>`;
                                }
                            } else {
                                txt = `<p class="mb-2 template-pre">${safeStr(body)}</p>`;
                            }
                            if (typeof replaceTencentEmoji === 'function' && txt) txt = replaceTencentEmoji(txt);
                        } catch (e) {
                            txt = `<p class="mb-2 template-pre" style="color: #fa8c16;">[原生内容] ${safeStr(body)}</p>`;
                        }

                        const timeStr = fallbackTimeStr;

                        const nameColorVar = isMember ? 'var(--msg-name-member)' : 'var(--msg-name-fan)';

                        return `
    <div class="msg-item" data-msgid="${msgId}" style="display: flex; padding: 8px 0; border-bottom: 1px solid var(--border);">
        <img src="${avatarUrl}" class="avatar" 
             style="width: 34px; height: 34px; border-radius: 50%; margin-right: 12px; margin-top: 2px; flex-shrink: 0; object-fit: cover; border: 1px solid rgba(0,0,0,0.05);">
        <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; margin-bottom: 2px;">
                <span style="color: ${nameColorVar}; font-weight: bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 75%;">
                    ${safeStr(displayName)}
                </span>
                
                <span style="margin-left: auto; color: var(--text-sub); font-size: 10px; opacity: 0.5; flex-shrink: 0;">
                    ${timeStr}
                </span>
            </div>
            <div style="color: var(--text); font-size: 13.5px; line-height: 1.4; word-break: break-all; margin-top: 2px;">
                ${txt}
                ${extraHtml}
            </div>
        </div>
   </div>`;
                    }).join('');

                    if (isAutoRefresh && !batchHtml) {
                        return;
                    }

                    if (isAutoRefresh && !shouldAutoScroll) {
                        queueFollowedPendingBatch(batchHtml, batchMessageIds);
                        return;
                    }

                    removeFollowedEmptyState(msgBox);
                    const fragment = document.createRange().createContextualFragment(batchHtml);

                    if (isLoadMore) {
                        msgBox.prepend(fragment);
                        const newScrollTop = msgBox.scrollHeight - oldScrollHeight;

                        msgBox.scrollTop = newScrollTop <= 0 ? 1 : newScrollTop;
                        followedLastScrollTop = msgBox.scrollTop;
                    } else {
                        msgBox.appendChild(fragment);
                        if (!isAutoRefresh || shouldAutoScroll) {
                            scrollFollowedToBottom(msgBox, isAutoRefresh);
                        }
                    }

                    if (activeFollowedNextTime > 0) {
                        const oldTip = document.getElementById('btn-load-more-followed');
                        if (oldTip) oldTip.remove();
                    }

                    hydrateFollowedPreviewMedia(msgBox);
                }
            } catch (e) {
                console.error(e);
            } finally {
                isFollowedChatLoading = false;

                const msgBox = document.getElementById('followed-chat-messages');
                if (!isAutoRefresh) {
                    msgBox.style.opacity = '1';
                    msgBox.style.pointerEvents = 'auto';
                }
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            const followedMsgBox = document.getElementById('followed-chat-messages');
            if (followedMsgBox) {
                followedMsgBox.addEventListener('wheel', function (event) {
                    if (event.deltaY < 0) {
                        lockFollowedAutoScroll();
                    }
                }, { passive: true });

                let followedTouchStartY = 0;
                followedMsgBox.addEventListener('touchstart', function (event) {
                    followedTouchStartY = event.touches && event.touches[0] ? event.touches[0].clientY : 0;
                }, { passive: true });

                followedMsgBox.addEventListener('touchmove', function (event) {
                    const currentY = event.touches && event.touches[0] ? event.touches[0].clientY : 0;
                    if (currentY > followedTouchStartY + 4) {
                        lockFollowedAutoScroll();
                    }
                }, { passive: true });

                followedMsgBox.addEventListener('scroll', function () {
                    updateFollowedScrollStickState(this);

                    if (followedPendingCount > 0 && canFollowedAutoScroll(this)) {
                        flushFollowedPendingMessages();
                        return;
                    }

                    if (isFollowedChatLoading || !activeFollowedNextTime || activeFollowedNextTime === 0) return;

                    if (this.scrollTop < 100) {
                        loadFollowedChatPage(true);
                    }
                });
            }

            document.addEventListener('keydown', function (event) {
                const followedMsgBox = document.getElementById('followed-chat-messages');
                const view = document.getElementById('view-followed-rooms');
                if (!followedMsgBox || !view || view.style.display === 'none') return;

                if (event.key === 'PageUp' || event.key === 'ArrowUp') {
                    lockFollowedAutoScroll();
                }
            });
        });


        function getActiveFollowedChannel() {
            return activeFollowedChannel;
        }

        return {
            flushFollowedPendingMessages,
            getActiveFollowedChannel,
            jumpToFullRoom,
            loadFollowedChatPage,
            openFollowedChat,
            playSharedLiveFromMessage,
            toggleFollowedChatMode,
            toggleFollowedRoomType
        };
    };
})();
