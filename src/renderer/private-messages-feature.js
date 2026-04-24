(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createPrivateMessagesFeature = function createPrivateMessagesFeature(deps) {
        const {
            privateMessageListState,
            privateMessageDetailState,
            clearActivePrivateMessageUnread,
            createCustomAudioPlayer,
            createCustomVideoPlayer,
            escapePrivateMessageHtml,
            formatPrivateMessageContent,
            formatPrivateMessageDateTime,
            formatPrivateMessagePreview,
            formatPrivateMessageTime,
            getAdaptivePollDelay,
            getAppToken,
            getCurrentPlayingAudio,
            getCurrentSearchKeyword,
            getPrivateMessageAvatar,
            getPrivateMessageConversationKey,
            getPrivateMessageDisplayName,
            getPrivateMessageItemKey,
            getPrivateMessageTeamLabel,
            getPrivateMessagesMemberDataLoaded,
            ipcRenderer,
            loadMemberData,
            normalizePrivateMessageName,
            renderPrivateMessageContentHtml,
            setCurrentPlayingAudio,
            setLoginView,
            showToast,
            switchView
        } = deps;

        let privateMessageAutoRefreshTimer = null;
        let privateMessageAutoRefreshRunning = false;
        let privateMessageAutoRefreshEnabled = false;
        let privateMessagePendingItems = [];
        let privateMessagePendingKeys = new Set();

        function setPrivateMessageDetailLoading(isLoading) {
            privateMessageDetailState.loading = isLoading;
        }

        function getPrivateMessageNewMessageNotice() {
            return document.getElementById('private-message-new-messages');
        }

        function updatePrivateMessagePendingNotice() {
            const btn = getPrivateMessageNewMessageNotice();
            if (!btn) return;

            const count = privateMessagePendingItems.length;
            if (count > 0) {
                btn.style.display = 'inline-flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                btn.innerText = `有 ${count} 条新消息`;
                return;
            }

            btn.style.display = 'none';
            btn.innerText = '有 0 条新消息';
        }

        function resetPrivateMessagePendingMessages() {
            privateMessagePendingItems = [];
            privateMessagePendingKeys.clear();
            updatePrivateMessagePendingNotice();
        }

        function queuePrivateMessagePendingItems(items = []) {
            if (!Array.isArray(items) || items.length === 0) return;

            items.forEach(item => {
                const key = getPrivateMessageItemKey(item, privateMessageDetailState.targetUserId);
                if (!key || privateMessagePendingKeys.has(key)) return;
                privateMessagePendingKeys.add(key);
                privateMessagePendingItems.push(item);
            });

            privateMessagePendingItems.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
            updatePrivateMessagePendingNotice();
        }

        function setPrivateMessageSending(isSending) {
            privateMessageDetailState.sending = isSending;
            const btn = document.getElementById('btn-send-private-message');
            const input = document.getElementById('private-message-reply-input');
            const disabled = !privateMessageDetailState.targetUserId || isSending;
            if (btn) btn.disabled = disabled;
            if (input) input.disabled = disabled;
        }

        function resetPrivateMessageDetailPanel() {
            privateMessageDetailState.targetUserId = '';
            privateMessageDetailState.title = '';
            privateMessageDetailState.avatar = './icon.png';
            privateMessageDetailState.cursor = 0;
            privateMessageDetailState.items = [];
            privateMessageDetailState.hasMore = true;
            privateMessageDetailState.sending = false;

            const headerEl = document.getElementById('private-message-detail-panel-header');
            const titleEl = document.getElementById('private-message-detail-title');
            const subtitleEl = document.getElementById('private-message-detail-subtitle');
            const avatarEl = document.getElementById('private-message-detail-avatar');
            const inputEl = document.getElementById('private-message-reply-input');
            const bodyEl = document.getElementById('private-message-detail-body');

            if (headerEl) headerEl.style.visibility = 'hidden';
            if (titleEl) titleEl.textContent = '私信详情';
            if (subtitleEl) subtitleEl.textContent = '--';
            if (avatarEl) avatarEl.src = './icon.png';
            if (inputEl) inputEl.value = '';
            if (bodyEl) bodyEl.innerHTML = '<div class="empty-state">请选择一个私信会话</div>';

            resetPrivateMessagePendingMessages();
            setPrivateMessageSending(false);
            setPrivateMessageDetailLoading(false);
        }

        function canPrivateMessageStickToBottom(container) {
            if (!container) return true;
            const threshold = 32;
            return (container.scrollHeight - container.scrollTop - container.clientHeight) <= threshold;
        }

        function createPrivateMessageDetailElement(item) {
            const incoming = String(item.user?.userId || '') === String(privateMessageDetailState.targetUserId);
            const wrapper = document.createElement('div');
            wrapper.className = `private-message-item ${incoming ? 'incoming' : 'outgoing'}`;
            wrapper.innerHTML = `
                <div class="private-message-bubble-meta">${escapePrivateMessageHtml(formatPrivateMessageDateTime(item.timestamp))}</div>
                <div class="private-message-bubble ${incoming ? 'incoming' : 'outgoing'}">
                    ${renderPrivateMessageContentHtml(item)}
                </div>
            `;

            wrapper.querySelectorAll('.private-message-audio-slot').forEach(slot => {
                const src = slot.getAttribute('data-audio-src');
                const duration = Number(slot.getAttribute('data-audio-duration') || 0);
                if (!src) return;
                slot.replaceChildren(createCustomAudioPlayer(src, duration));
            });

            wrapper.querySelectorAll('.private-message-video-slot').forEach(slot => {
                const src = slot.getAttribute('data-video-src');
                if (!src) return;
                slot.replaceChildren(createCustomVideoPlayer(src));
            });

            return wrapper;
        }

        function capturePrivateMessageAudioState(container) {
            if (!container || typeof getCurrentPlayingAudio !== 'function') return null;
            const currentAudio = getCurrentPlayingAudio();
            if (!currentAudio || !container.contains(currentAudio)) return null;

            const src = String(currentAudio.currentSrc || currentAudio.src || '').trim();
            if (!src) return null;

            return {
                src,
                currentTime: Number(currentAudio.currentTime || 0),
                wasPlaying: !currentAudio.paused
            };
        }

        function restorePrivateMessageAudioState(container, playbackState) {
            if (!container || !playbackState || !playbackState.src) {
                if (typeof setCurrentPlayingAudio === 'function') {
                    setCurrentPlayingAudio(null);
                }
                return;
            }

            const restoredAudio = Array.from(container.querySelectorAll('.audio-wrapper audio')).find(audio => {
                const src = String(audio.currentSrc || audio.src || '').trim();
                return src === playbackState.src;
            });

            if (!restoredAudio) {
                if (typeof setCurrentPlayingAudio === 'function') {
                    setCurrentPlayingAudio(null);
                }
                return;
            }

            const targetTime = Number.isFinite(playbackState.currentTime)
                ? Math.max(0, playbackState.currentTime)
                : 0;

            const resumePlayback = async () => {
                if (typeof setCurrentPlayingAudio === 'function') {
                    setCurrentPlayingAudio(restoredAudio);
                }

                if (!playbackState.wasPlaying) {
                    return;
                }

                try {
                    await restoredAudio.play();
                } catch (error) {
                    console.warn('恢复私信语音播放失败:', error);
                }
            };

            const applyPlaybackState = () => {
                if (targetTime <= 0.05) {
                    resumePlayback();
                    return;
                }

                let settled = false;
                const finishRestore = () => {
                    if (settled) return;
                    settled = true;
                    restoredAudio.removeEventListener('seeked', handleSeeked);
                    restoredAudio.removeEventListener('canplay', handleCanPlayFallback);
                    resumePlayback();
                };

                const handleSeeked = () => {
                    finishRestore();
                };

                const handleCanPlayFallback = () => {
                    const delta = Math.abs(Number(restoredAudio.currentTime || 0) - targetTime);
                    if (delta <= 0.35) {
                        finishRestore();
                    }
                };

                restoredAudio.addEventListener('seeked', handleSeeked);
                restoredAudio.addEventListener('canplay', handleCanPlayFallback);

                try {
                    restoredAudio.pause();
                    restoredAudio.currentTime = targetTime;
                } catch (error) {
                    console.warn('恢复私信语音进度失败:', error);
                    finishRestore();
                    return;
                }

                setTimeout(() => {
                    const delta = Math.abs(Number(restoredAudio.currentTime || 0) - targetTime);
                    if (delta <= 0.35) {
                        finishRestore();
                        return;
                    }
                    try {
                        restoredAudio.currentTime = targetTime;
                    } catch (error) {
                        console.warn('二次恢复私信语音进度失败:', error);
                    }
                    setTimeout(finishRestore, 180);
                }, 120);
            };

            if (restoredAudio.readyState >= 1) {
                applyPlaybackState();
                return;
            }

            const handleReady = () => {
                restoredAudio.removeEventListener('loadedmetadata', handleReady);
                restoredAudio.removeEventListener('canplay', handleReady);
                applyPlaybackState();
            };

            restoredAudio.addEventListener('loadedmetadata', handleReady, { once: true });
            restoredAudio.addEventListener('canplay', handleReady, { once: true });
            try {
                restoredAudio.load();
            } catch (error) {
                console.warn('重新加载私信语音失败:', error);
            }
        }

        function renderPrivateMessageDetail(options = {}) {
            const bodyEl = document.getElementById('private-message-detail-body');
            if (!bodyEl) return;
            const { keepScrollOffset = false, stickToBottom = false } = options;
            const previousScrollHeight = bodyEl.scrollHeight;
            const previousScrollTop = bodyEl.scrollTop;
            const audioPlaybackState = capturePrivateMessageAudioState(bodyEl);

            if (!privateMessageDetailState.items.length) {
                bodyEl.innerHTML = '<div class="empty-state">暂无私信内容</div>';
                if (typeof setCurrentPlayingAudio === 'function') {
                    setCurrentPlayingAudio(null);
                }
                return;
            }

            const sorted = privateMessageDetailState.items.slice().sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
            bodyEl.innerHTML = '';
            const fragment = document.createDocumentFragment();
            sorted.forEach(item => {
                fragment.appendChild(createPrivateMessageDetailElement(item));
            });
            bodyEl.appendChild(fragment);

            if (keepScrollOffset) {
                bodyEl.scrollTop = bodyEl.scrollHeight - previousScrollHeight + previousScrollTop;
            } else if (stickToBottom) {
                bodyEl.scrollTop = bodyEl.scrollHeight;
            }

            resetPrivateMessagePendingMessages();
            restorePrivateMessageAudioState(bodyEl, audioPlaybackState);
        }

        function renderPrivateMessageDetailIncremental(items = [], options = {}) {
            const bodyEl = document.getElementById('private-message-detail-body');
            if (!bodyEl || !Array.isArray(items) || items.length === 0) return;

            const { prepend = false, keepScrollOffset = false, stickToBottom = false } = options;
            const previousScrollHeight = bodyEl.scrollHeight;
            const previousScrollTop = bodyEl.scrollTop;

            if (bodyEl.querySelector('.empty-state')) {
                bodyEl.innerHTML = '';
            }

            const fragment = document.createDocumentFragment();
            items
                .slice()
                .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
                .forEach(item => {
                    fragment.appendChild(createPrivateMessageDetailElement(item));
                });

            if (prepend && bodyEl.firstChild) {
                bodyEl.insertBefore(fragment, bodyEl.firstChild);
            } else {
                bodyEl.appendChild(fragment);
            }

            if (keepScrollOffset) {
                bodyEl.scrollTop = bodyEl.scrollHeight - previousScrollHeight + previousScrollTop;
            } else if (stickToBottom) {
                bodyEl.scrollTop = bodyEl.scrollHeight;
            }
        }

        function flushPrivateMessagePendingMessages() {
            if (!privateMessagePendingItems.length) {
                resetPrivateMessagePendingMessages();
                return;
            }

            const pendingItems = privateMessagePendingItems.slice();
            resetPrivateMessagePendingMessages();
            renderPrivateMessageDetailIncremental(pendingItems, {
                prepend: false,
                stickToBottom: true
            });
        }

        function closePrivateMessageDetail(event) {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            resetPrivateMessageDetailPanel();
            filterPrivateMessageList(getCurrentSearchKeyword());
        }

        function getPrivateMessagesToken() {
            return getAppToken();
        }

        async function loadPrivateMessageDetail({ targetUserId, title, avatar, reset = false, isAutoRefresh = false } = {}) {
            const token = getPrivateMessagesToken();
            if (!token) {
                showToast('请先登录账号');
                return switchView('login');
            }

            if (reset) {
                privateMessageDetailState.targetUserId = String(targetUserId || '');
                privateMessageDetailState.title = title || '私信详情';
                privateMessageDetailState.avatar = avatar || './icon.png';
                privateMessageDetailState.cursor = 0;
                privateMessageDetailState.items = [];
                privateMessageDetailState.hasMore = true;
                privateMessageDetailState.sending = false;

                const headerEl = document.getElementById('private-message-detail-panel-header');
                const titleEl = document.getElementById('private-message-detail-title');
                const subtitleEl = document.getElementById('private-message-detail-subtitle');
                const avatarEl = document.getElementById('private-message-detail-avatar');
                const inputEl = document.getElementById('private-message-reply-input');
                if (headerEl) headerEl.style.visibility = 'visible';
                if (titleEl) titleEl.textContent = privateMessageDetailState.title;
                if (subtitleEl) subtitleEl.textContent = `User ID: ${privateMessageDetailState.targetUserId}`;
                if (avatarEl) avatarEl.src = privateMessageDetailState.avatar;
                if (inputEl) inputEl.value = '';
                clearActivePrivateMessageUnread(privateMessageDetailState.targetUserId);
                filterPrivateMessageList(getCurrentSearchKeyword());
                renderPrivateMessageDetail();
                setPrivateMessageSending(false);
            }

            if (!privateMessageDetailState.targetUserId || privateMessageDetailState.loading) return;

            setPrivateMessageDetailLoading(true);
            try {
                const bodyEl = document.getElementById('private-message-detail-body');
                const shouldStickToBottom = !reset && isAutoRefresh && canPrivateMessageStickToBottom(bodyEl);
                const shouldKeepScrollOffset = !reset && !!bodyEl && !shouldStickToBottom;
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-private-message-info', {
                    token,
                    pa,
                    targetUserId: privateMessageDetailState.targetUserId,
                    lastTime: isAutoRefresh ? 0 : privateMessageDetailState.cursor
                });

                if (!res || !res.success || !res.content) {
                    throw new Error(res && res.msg ? res.msg : '获取私信详情失败');
                }

                const incoming = Array.isArray(res.content.data) ? res.content.data : [];
                const previousItems = privateMessageDetailState.items.slice();
                const previousMinTimestamp = previousItems.length
                    ? Math.min(...previousItems.map(item => Number(item.timestamp || 0)))
                    : 0;
                const previousMaxTimestamp = previousItems.length
                    ? Math.max(...previousItems.map(item => Number(item.timestamp || 0)))
                    : 0;
                const seen = new Set(
                    privateMessageDetailState.items.map(item => getPrivateMessageItemKey(item, privateMessageDetailState.targetUserId))
                );
                let addedCount = 0;
                const addedItems = [];
                incoming.forEach(item => {
                    const key = getPrivateMessageItemKey(item, privateMessageDetailState.targetUserId);
                    if (!seen.has(key)) {
                        seen.add(key);
                        privateMessageDetailState.items.push(item);
                        addedCount += 1;
                        addedItems.push(item);
                    }
                });

                if (!isAutoRefresh) {
                    privateMessageDetailState.cursor = Number(res.content.lastTime) || privateMessageDetailState.cursor;
                }
                privateMessageDetailState.hasMore = incoming.length > 0 && Number(res.content.lastTime || 0) > 0;
                clearActivePrivateMessageUnread(privateMessageDetailState.targetUserId);
                filterPrivateMessageList(getCurrentSearchKeyword(), { preserveScroll: true });
                if (reset || addedCount > 0 || !isAutoRefresh) {
                    const addedMinTimestamp = addedItems.length
                        ? Math.min(...addedItems.map(item => Number(item.timestamp || 0)))
                        : 0;
                    const addedMaxTimestamp = addedItems.length
                        ? Math.max(...addedItems.map(item => Number(item.timestamp || 0)))
                        : 0;
                    const canPrependIncrementally = !reset
                        && addedItems.length > 0
                        && previousItems.length > 0
                        && addedMaxTimestamp <= previousMinTimestamp;
                    const canAppendIncrementally = !reset
                        && addedItems.length > 0
                        && previousItems.length > 0
                        && addedMinTimestamp >= previousMaxTimestamp;

                    if (canPrependIncrementally) {
                        renderPrivateMessageDetailIncremental(addedItems, {
                            prepend: true,
                            keepScrollOffset: true
                        });
                    } else if (canAppendIncrementally) {
                        if (isAutoRefresh && !shouldStickToBottom) {
                            queuePrivateMessagePendingItems(addedItems);
                        } else {
                            renderPrivateMessageDetailIncremental(addedItems, {
                                prepend: false,
                                stickToBottom: shouldStickToBottom
                            });
                        }
                    } else {
                        renderPrivateMessageDetail({
                            keepScrollOffset: shouldKeepScrollOffset,
                            stickToBottom: reset || shouldStickToBottom
                        });
                    }
                }
            } catch (error) {
                console.error('加载私信详情失败:', error);
                if (!isAutoRefresh) {
                    showToast(`私信详情加载失败: ${error.message}`);
                }
            } finally {
                setPrivateMessageDetailLoading(false);
            }
        }

        function openPrivateMessageDetail(targetUserId) {
            const item = privateMessageListState.items.find(entry => String(entry.user?.userId || '') === String(targetUserId));
            if (!item) return;
            const user = item.user || {};
            loadPrivateMessageDetail({
                targetUserId: String(user.userId || ''),
                title: getPrivateMessageDisplayName(user),
                avatar: getPrivateMessageAvatar(user.avatar),
                reset: true
            });
        }

        function setPrivateMessagesLoading(isLoading, options = {}) {
            privateMessageListState.loading = isLoading;
            const silent = !!options.silent;
            const btnRefresh = document.getElementById('btn-refresh-private-messages');
            const btnLoadMore = document.getElementById('btn-load-more-private-messages');
            if (btnRefresh) btnRefresh.disabled = !silent && isLoading;
            if (btnLoadMore) btnLoadMore.disabled = (!silent && isLoading) || !privateMessageListState.hasMore;
        }

        function updatePrivateMessagesStatus(text = '') {
            const statusEl = document.getElementById('private-messages-status');
            if (!statusEl) return;

            const normalized = String(text || '').trim();
            const shouldShow = normalized.includes('失败') || normalized.includes('请先登录');
            statusEl.textContent = shouldShow ? normalized : '';
        }

        function renderPrivateMessageList(items = privateMessageListState.items, options = {}) {
            const listEl = document.getElementById('private-message-list');
            if (!listEl) return;
            const preserveScroll = !!options.preserveScroll;
            const previousScrollTop = listEl.scrollTop;

            if (!Array.isArray(items) || items.length === 0) {
                listEl.innerHTML = '<div class="empty-state">暂无私信会话</div>';
                return;
            }

            renderPrivateMessageList.lastRenderItems = items;
            listEl.innerHTML = items.map(item => {
                const user = item.user || {};
                const displayName = getPrivateMessageDisplayName(user);
                const preview = formatPrivateMessagePreview(item.newestMessage);
                const unread = Number(item.noreadNum) || 0;
                const isActive = String(privateMessageDetailState.targetUserId || '') === String(user.userId || '');
                const teamLabel = getPrivateMessageTeamLabel(user, displayName);
                const shouldShowTeam = !!teamLabel && teamLabel !== '成员';
                const teamStyle = shouldShowTeam && typeof window.getTeamStyle === 'function'
                    ? window.getTeamStyle(teamLabel, false)
                    : '';
                const avatar = getPrivateMessageAvatar(user.avatar);

                return `
                    <div class="private-message-list-item ${isActive ? 'active' : ''}" onclick="openPrivateMessageDetail('${escapePrivateMessageHtml(String(user.userId || ''))}')">
                        <img class="private-message-list-avatar" src="${escapePrivateMessageHtml(avatar)}" alt="">
                        <div class="private-message-list-main">
                            <div class="private-message-list-head">
                                <div class="private-message-name-row">
                                    <div class="private-message-name">${escapePrivateMessageHtml(displayName)}</div>
                                    ${shouldShowTeam ? `<span class="private-message-team-badge" style="${teamStyle}">${escapePrivateMessageHtml(teamLabel)}</span>` : ''}
                                </div>
                                <div class="private-message-time">${escapePrivateMessageHtml(formatPrivateMessageTime(item.newestMessagetime))}</div>
                            </div>
                            <div class="private-message-list-tail">
                                <span class="private-message-last">${escapePrivateMessageHtml(preview)}</span>
                                ${unread > 0 ? `<span class="private-message-unread-dot">${Math.min(unread, 99)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            if (preserveScroll) {
                listEl.scrollTop = previousScrollTop;
            }
        }

        function filterPrivateMessageList(keyword = '', options = {}) {
            const lower = String(keyword || '').trim().toLowerCase();
            if (!lower) {
                renderPrivateMessageList(privateMessageListState.items, options);
                return;
            }

            const filtered = privateMessageListState.items.filter(item => {
                const user = item.user || {};
                const values = [
                    user.nickname,
                    user.starName,
                    user.realNickName,
                    normalizePrivateMessageName(user.nickname),
                    normalizePrivateMessageName(user.name),
                    item.newestMessage
                ].filter(Boolean).map(v => String(v).toLowerCase());

                return values.some(v => v.includes(lower));
            });

            renderPrivateMessageList(filtered, options);
        }

        async function loadPrivateMessageList({ reset = false, loadAll = false, silent = false, preserveScroll = false, refreshFromTop = false } = {}) {
            const token = getPrivateMessagesToken();
            const listEl = document.getElementById('private-message-list');

            if (!token) {
                updatePrivateMessagesStatus('请先登录口袋账号');
                if (listEl) listEl.innerHTML = '<div class="empty-state">请先前往账号设置登录后再查看私信列表</div>';
                setLoginView?.();
                switchView('login');
                return;
            }

            if (privateMessageListState.loading) return;

            if (!getPrivateMessagesMemberDataLoaded() && typeof loadMemberData === 'function') {
                try {
                    await loadMemberData();
                } catch (error) {
                    console.warn('私信列表加载前预热成员库失败:', error);
                }
            }

            if (reset) {
                privateMessageListState.cursor = Date.now();
                privateMessageListState.items = [];
                privateMessageListState.hasMore = true;
                privateMessageListState.initialized = true;
                const searchEl = document.getElementById('private-message-search');
                if (searchEl) searchEl.value = '';
            }

            setPrivateMessagesLoading(true, { silent });
            if (!silent) {
                updatePrivateMessagesStatus(reset ? '正在读取私信列表...' : '正在加载更多...');
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const merged = reset ? [] : privateMessageListState.items.slice();
                const indexByConversationId = new Map();
                merged.forEach((item, index) => {
                    const key = getPrivateMessageConversationKey(item);
                    if (key) indexByConversationId.set(key, index);
                });
                let continueLoading = true;
                let loopCount = 0;
                let requestCursor = refreshFromTop ? Date.now() : privateMessageListState.cursor;

                while (continueLoading) {
                    const res = await ipcRenderer.invoke('fetch-private-message-list', {
                        token,
                        pa,
                        lastTime: requestCursor
                    });

                    if (!res || !res.success || !res.content) {
                        throw new Error(res && res.msg ? res.msg : '获取失败');
                    }

                    const incoming = Array.isArray(res.content.data) ? res.content.data : [];

                    incoming.forEach(item => {
                        const key = getPrivateMessageConversationKey(item);
                        if (!key) return;
                        if (indexByConversationId.has(key)) {
                            merged[indexByConversationId.get(key)] = item;
                        } else {
                            indexByConversationId.set(key, merged.length);
                            merged.push(item);
                        }
                    });

                    requestCursor = Number(res.content.lastTime) || requestCursor;
                    if (!refreshFromTop) {
                        privateMessageListState.cursor = requestCursor || privateMessageListState.cursor;
                    }
                    privateMessageListState.hasMore = incoming.length > 0 && Number(res.content.lastTime || 0) > 0;

                    loopCount += 1;
                    continueLoading = !!(loadAll && privateMessageListState.hasMore && loopCount < 80);
                    if (!silent && loadAll && continueLoading) {
                        updatePrivateMessagesStatus(`正在读取全部会话... 已加载 ${merged.length} 个`);
                    }
                }

                merged.sort((a, b) => Number(b.newestMessagetime || 0) - Number(a.newestMessagetime || 0));
                privateMessageListState.items = merged;
                clearActivePrivateMessageUnread();

                filterPrivateMessageList(getCurrentSearchKeyword(), { preserveScroll });
                updatePrivateMessagesStatus('');
            } catch (error) {
                console.error('加载私信列表失败:', error);
                if (!silent) {
                    updatePrivateMessagesStatus('私信列表读取失败');
                }
                if (!silent && listEl && privateMessageListState.items.length === 0) {
                    listEl.innerHTML = `<div class="empty-state">${escapePrivateMessageHtml(error.message || '私信列表读取失败')}</div>`;
                }
            } finally {
                setPrivateMessagesLoading(false, { silent });
            }
        }

        function refreshPrivateMessageList() {
            loadPrivateMessageList({
                reset: false,
                loadAll: false,
                silent: true,
                preserveScroll: true,
                refreshFromTop: true
            });
        }

        function loadMorePrivateMessageList() {
            if (!privateMessageListState.hasMore || privateMessageListState.loading) return;
            loadPrivateMessageList({ reset: false });
        }

        function loadMorePrivateMessageDetail() {
            if (!privateMessageDetailState.hasMore || privateMessageDetailState.loading) return;
            loadPrivateMessageDetail({ reset: false });
        }

        function handlePrivateMessageReplyKeydown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendPrivateMessageReply();
            }
        }

        async function sendPrivateMessageReply() {
            if (privateMessageDetailState.sending) return;
            const token = getPrivateMessagesToken();
            if (!token) {
                showToast('请先登录账号');
                return switchView('login');
            }
            if (!privateMessageDetailState.targetUserId) return;

            const input = document.getElementById('private-message-reply-input');
            const rawText = input ? input.value : '';
            const text = String(rawText || '').trim();
            if (!text) {
                return showToast('请输入私信内容');
            }

            setPrivateMessageSending(true);
            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('send-private-message-reply', {
                    token,
                    pa,
                    targetUserId: privateMessageDetailState.targetUserId,
                    text
                });

                if (!res || !res.success || !res.content) {
                    throw new Error(res && res.msg ? res.msg : '发送失败');
                }

                privateMessageDetailState.items.push({
                    messageId: res.content.messageId,
                    timestamp: res.content.timestamp,
                    messageType: res.content.messageType || 'TEXT',
                    content: res.content.content || { messageType: 'TEXT', text }
                });
                renderPrivateMessageDetail({ stickToBottom: true });

                const conversation = privateMessageListState.items.find(entry => String(entry.user?.userId || '') === String(privateMessageDetailState.targetUserId));
                if (conversation) {
                    conversation.newestMessage = text;
                    conversation.newestMessagetime = Number(res.content.timestamp) || Date.now();
                    filterPrivateMessageList(getCurrentSearchKeyword(), { preserveScroll: true });
                }

                if (input) {
                    input.value = '';
                    input.focus();
                }
            } catch (error) {
                console.error('发送私信失败:', error);
                showToast(`发送失败: ${error.message}`);
            } finally {
                setPrivateMessageSending(false);
            }
        }

        function stopPrivateMessagePolling() {
            privateMessageAutoRefreshEnabled = false;
            if (privateMessageAutoRefreshTimer) {
                clearTimeout(privateMessageAutoRefreshTimer);
                privateMessageAutoRefreshTimer = null;
            }
            privateMessageAutoRefreshRunning = false;
        }

        function startPrivateMessagePolling() {
            stopPrivateMessagePolling();
            privateMessageAutoRefreshEnabled = true;

            const scheduleNext = () => {
                if (!privateMessageAutoRefreshEnabled) return;
                privateMessageAutoRefreshTimer = setTimeout(runPoll, getAdaptivePollDelay());
            };

            const runPoll = async () => {
                if (!privateMessageAutoRefreshEnabled) return;
                const view = document.getElementById('view-private-messages');
                if (!view || view.style.display === 'none' || privateMessageAutoRefreshRunning) {
                    scheduleNext();
                    return;
                }

                privateMessageAutoRefreshRunning = true;
                try {
                    const tasks = [
                        loadPrivateMessageList({
                            reset: false,
                            loadAll: false,
                            silent: true,
                            preserveScroll: true,
                            refreshFromTop: true
                        })
                    ];

                    if (privateMessageDetailState.targetUserId && !privateMessageDetailState.loading) {
                        tasks.push(loadPrivateMessageDetail({ reset: false, isAutoRefresh: true }));
                    }

                    await Promise.allSettled(tasks);
                } finally {
                    privateMessageAutoRefreshRunning = false;
                    scheduleNext();
                }
            };

            scheduleNext();
        }

        return {
            closePrivateMessageDetail,
            filterPrivateMessageList,
            flushPrivateMessagePendingMessages,
            handlePrivateMessageReplyKeydown,
            loadMorePrivateMessageDetail,
            loadMorePrivateMessageList,
            loadPrivateMessageDetail,
            loadPrivateMessageList,
            openPrivateMessageDetail,
            refreshPrivateMessageList,
            resetPrivateMessageDetailPanel,
            sendPrivateMessageReply,
            startPrivateMessagePolling,
            stopPrivateMessagePolling
        };
    };
})();
