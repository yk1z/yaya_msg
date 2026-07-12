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
            getMemberData,
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
        let privateMessageFlipPrices = [];
        let privateMessageFlipMember = null;
        let privateMessageFlipLoading = false;
        let privateMessageContextMenu = null;
        let privateMessageContextTarget = null;
        const deletingPrivateMessageIds = new Set();

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

        function isLocalPrivateMessageFlipQuestion(item = {}) {
            const messageId = String(item.messageId || item.msgId || item.id || '').trim();
            const type = String(item.messageType || item?.content?.messageType || '').toUpperCase();
            return messageId.startsWith('local-flip-') && type === 'FLIPCARD_QUESTION';
        }

        function isPrivateMessageFlipQuestion(item = {}) {
            const type = String(item.messageType || item?.content?.messageType || '').toUpperCase();
            return type === 'FLIPCARD_QUESTION';
        }

        function normalizePrivateMessageCompareText(value = '') {
            return String(value || '').replace(/\s+/g, ' ').trim();
        }

        function findMatchingLocalFlipQuestionIndex(serverItem = {}) {
            if (!isPrivateMessageFlipQuestion(serverItem)) return -1;

            const serverText = normalizePrivateMessageCompareText(formatPrivateMessageContent(serverItem));
            const serverTimestamp = Number(serverItem.timestamp || serverItem.sendTime || serverItem.createTime || 0);
            if (!serverText || !serverTimestamp) return -1;

            return privateMessageDetailState.items.findIndex(item => {
                if (!isLocalPrivateMessageFlipQuestion(item)) return false;

                const localText = normalizePrivateMessageCompareText(formatPrivateMessageContent(item));
                const localTimestamp = Number(item.timestamp || 0);
                if (!localText || !localTimestamp || localText !== serverText) return false;

                return Math.abs(serverTimestamp - localTimestamp) <= 5 * 60 * 1000;
            });
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
            const imageBtn = document.getElementById('btn-send-private-message-image');
            const imageInput = document.getElementById('private-message-image-file');
            const input = document.getElementById('private-message-reply-input');
            const flipEnabled = document.getElementById('private-message-flip-enabled');
            const flipAnswer = document.getElementById('private-message-flip-answer-display');
            const flipPrivacy = document.getElementById('private-message-flip-privacy-display');
            const flipCost = document.getElementById('private-message-flip-cost-input');
            const disabled = !privateMessageDetailState.targetUserId || isSending;
            if (btn) btn.disabled = disabled;
            if (imageBtn) imageBtn.disabled = disabled || isPrivateMessageFlipEnabled();
            if (imageInput) imageInput.disabled = disabled || isPrivateMessageFlipEnabled();
            if (input) input.disabled = disabled;
            if (flipEnabled) flipEnabled.disabled = disabled || !privateMessageFlipMember;
            if (flipAnswer) flipAnswer.disabled = disabled || !isPrivateMessageFlipEnabled() || privateMessageFlipPrices.length === 0;
            if (flipPrivacy) flipPrivacy.disabled = disabled || !isPrivateMessageFlipEnabled() || privateMessageFlipPrices.length === 0;
            if (flipCost) flipCost.disabled = disabled || !isPrivateMessageFlipEnabled() || privateMessageFlipPrices.length === 0;
            if (btn) btn.textContent = isSending
                ? (isPrivateMessageFlipEnabled() ? '发送翻牌中' : '发送中')
                : (isPrivateMessageFlipEnabled() ? '发送翻牌' : '发送');
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
            const imageInputEl = document.getElementById('private-message-image-file');
            const bodyEl = document.getElementById('private-message-detail-body');
            const viewEl = document.getElementById('view-private-messages');

            if (headerEl) headerEl.style.visibility = 'hidden';
            if (titleEl) titleEl.textContent = '私信详情';
            if (subtitleEl) subtitleEl.textContent = '--';
            if (avatarEl) avatarEl.src = './icon.png';
            if (inputEl) inputEl.value = '';
            if (imageInputEl) imageInputEl.value = '';
            if (bodyEl) bodyEl.innerHTML = '<div class="empty-state">请选择一个私信会话</div>';
            if (viewEl) viewEl.classList.remove('is-detail-open');

            resetPrivateMessagePendingMessages();
            resetPrivateMessageFlipPanel();
            updatePrivateMessageReplyCounter();
            setPrivateMessageSending(false);
            setPrivateMessageDetailLoading(false);
        }

        function backToPrivateMessageList(event) {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            const viewEl = document.getElementById('view-private-messages');
            if (viewEl) viewEl.classList.remove('is-detail-open');
            filterPrivateMessageList(getCurrentSearchKeyword(), { preserveScroll: true });
        }

        function canPrivateMessageStickToBottom(container) {
            if (!container) return true;
            const threshold = 32;
            return (container.scrollHeight - container.scrollTop - container.clientHeight) <= threshold;
        }

        function createPrivateMessageDetailElement(item) {
            const incoming = String(item.user?.userId || '') === String(privateMessageDetailState.targetUserId);
            const msgId = getPrivateMessageDeletableId(item);
            const avatarUrl = getPrivateMessageSenderAvatar(item, incoming);
            const wrapper = document.createElement('div');
            wrapper.className = `private-message-item ${incoming ? 'incoming' : 'outgoing'}`;
            if (msgId) {
                wrapper.dataset.msgId = msgId;
            }
            wrapper.innerHTML = `<div class="private-message-row"><img class="private-message-sender-avatar" src="${escapePrivateMessageHtml(avatarUrl)}" alt="" onerror="this.src='./icon.png'"><div class="private-message-content"><div class="private-message-bubble-meta">${escapePrivateMessageHtml(formatPrivateMessageDateTime(item.timestamp))}</div><div class="private-message-bubble ${incoming ? 'incoming' : 'outgoing'}">${renderPrivateMessageContentHtml(item)}</div></div></div>`;
            wrapper.addEventListener('contextmenu', event => {
                event.preventDefault();
                event.stopPropagation();
                showPrivateMessageContextMenu(event, wrapper);
            });

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

        function getCurrentAccountAvatar() {
            const candidates = [
                document.getElementById('current-user-avatar')?.getAttribute('src'),
                document.getElementById('account-avatar-preview')?.getAttribute('src'),
                document.getElementById('web-account-avatar')?.getAttribute('src')
            ];

            return candidates.map(value => String(value || '').trim()).find(Boolean) || './icon.png';
        }

        function getPrivateMessageSenderAvatar(item = {}, incoming = false) {
            const user = item.user || {};
            const rawAvatar = user.avatar
                || user.faceImage
                || user.headImg
                || user.headImage
                || user.avatarUrl
                || '';

            if (rawAvatar) {
                return getPrivateMessageAvatar(String(rawAvatar));
            }

            return incoming
                ? (privateMessageDetailState.avatar || './icon.png')
                : getCurrentAccountAvatar();
        }

        function getPrivateMessageDeletableId(item = {}) {
            const msgId = String(
                item.messageId
                || item.msgId
                || item.id
                || item.messageid
                || ''
            ).trim();

            if (!msgId || msgId.startsWith('local-')) return '';
            return msgId;
        }

        function ensurePrivateMessageContextMenu() {
            if (privateMessageContextMenu) return privateMessageContextMenu;

            const menu = document.createElement('div');
            menu.id = 'private-message-context-menu';
            menu.style.cssText = [
                'position: fixed',
                'z-index: 99999',
                'display: none',
                'min-width: 120px',
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
                <button type="button" data-action="delete" style="width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: #ff6b8a; text-align: left; cursor: pointer;">删除</button>
            `;

            menu.querySelectorAll('button').forEach(button => {
                button.addEventListener('mouseenter', () => {
                    if (!button.disabled) button.style.background = 'rgba(255,255,255,0.08)';
                });
                button.addEventListener('mouseleave', () => {
                    button.style.background = 'transparent';
                });
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    const target = privateMessageContextTarget;
                    hidePrivateMessageContextMenu();
                    if (!target || button.disabled) return;
                    deletePrivateMessageFromContext(target);
                });
            });

            document.body.appendChild(menu);
            document.addEventListener('click', hidePrivateMessageContextMenu);
            document.addEventListener('scroll', hidePrivateMessageContextMenu, true);
            window.addEventListener('resize', hidePrivateMessageContextMenu);
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') hidePrivateMessageContextMenu();
            });

            privateMessageContextMenu = menu;
            return menu;
        }

        function showPrivateMessageContextMenu(event, target) {
            const menu = ensurePrivateMessageContextMenu();
            const deleteButton = menu.querySelector('[data-action="delete"]');
            const msgId = String(target?.dataset?.msgId || '').trim();
            privateMessageContextTarget = target;

            if (deleteButton) {
                deleteButton.disabled = !msgId || deletingPrivateMessageIds.has(msgId);
                deleteButton.textContent = deletingPrivateMessageIds.has(msgId) ? '删除中' : '删除';
                deleteButton.style.opacity = deleteButton.disabled ? '0.55' : '1';
                deleteButton.style.cursor = deleteButton.disabled ? 'not-allowed' : 'pointer';
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

        function hidePrivateMessageContextMenu() {
            if (privateMessageContextMenu) {
                privateMessageContextMenu.style.display = 'none';
            }
            privateMessageContextTarget = null;
        }

        function showPrivateMessageDeleteConfirm(message, onConfirm) {
            if (typeof window.showCustomConfirm === 'function') {
                window.showCustomConfirm(escapePrivateMessageHtml(message), onConfirm);
                return;
            }

            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = `
                <div class="confirm-box">
                    <div class="confirm-text">${escapePrivateMessageHtml(message)}</div>
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

        function removePrivateMessageById(msgId) {
            const targetId = String(msgId || '').trim();
            if (!targetId) return false;

            const beforeCount = privateMessageDetailState.items.length;
            privateMessageDetailState.items = privateMessageDetailState.items.filter(item => getPrivateMessageDeletableId(item) !== targetId);
            privateMessagePendingItems = privateMessagePendingItems.filter(item => getPrivateMessageDeletableId(item) !== targetId);
            privateMessagePendingKeys = new Set(privateMessagePendingItems.map(item => getPrivateMessageItemKey(item, privateMessageDetailState.targetUserId)));
            updatePrivateMessagePendingNotice();

            return privateMessageDetailState.items.length !== beforeCount;
        }

        function deletePrivateMessageFromContext(target) {
            const msgId = String(target?.dataset?.msgId || '').trim();
            if (!msgId) {
                showToast('这条消息暂时不能删除');
                return;
            }

            if (deletingPrivateMessageIds.has(msgId)) return;

            showPrivateMessageDeleteConfirm('确定删除这条私信吗？', async () => {
                const token = getPrivateMessagesToken();
                if (!token) {
                    showToast('请先登录账号');
                    return;
                }

                deletingPrivateMessageIds.add(msgId);
                showToast('正在删除私信');
                try {
                    const res = await ipcRenderer.invoke('delete-private-message', {
                        token,
                        pa: getPrivateMessageSafePa(),
                        msgId
                    });

                    if (!res || !res.success) {
                        showToast(`删除失败: ${res?.msg || '未知错误'}`);
                        return;
                    }

                    const bodyEl = document.getElementById('private-message-detail-body');
                    const shouldStickToBottom = canPrivateMessageStickToBottom(bodyEl);
                    removePrivateMessageById(msgId);
                    renderPrivateMessageDetail({ stickToBottom: shouldStickToBottom });
                    filterPrivateMessageList(getCurrentSearchKeyword(), { preserveScroll: true });
                    setTimeout(() => loadPrivateMessageList({
                        reset: false,
                        silent: true,
                        preserveScroll: true,
                        refreshFromTop: true
                    }), 300);
                    showToast('已删除私信');
                } catch (error) {
                    showToast(`删除失败: ${error.message}`);
                } finally {
                    deletingPrivateMessageIds.delete(msgId);
                }
            });
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

        function getPrivateMessageSafePa() {
            return window.getPA ? window.getPA() : null;
        }

        function getPrivateMessageSourceMembers() {
            const data = typeof getMemberData === 'function' ? getMemberData() : window.memberData;
            return Array.isArray(data) ? data : [];
        }

        function getPrivateMessageMemberRecordIds(member = {}) {
            return [
                member.id,
                member.userId,
                member.memberId,
                member.ownerId,
                member.starId
            ].map(value => String(value || '').trim()).filter(Boolean);
        }

        function getPrivateMessageFlipMemberId(member = {}) {
            const targetId = String(privateMessageDetailState.targetUserId || '').trim();
            const recordIds = getPrivateMessageMemberRecordIds(member);
            if (targetId && recordIds.includes(targetId)) return targetId;
            return '';
        }

        function findActivePrivateMessageMember() {
            const targetId = String(privateMessageDetailState.targetUserId || '').trim();
            if (!targetId) return null;

            const members = getPrivateMessageSourceMembers();
            if (!members.length) return null;

            return members.find(member => {
                const ids = getPrivateMessageMemberRecordIds(member);
                return ids.some(id => id === targetId);
            }) || null;
        }

        function getPrivateMessageFlipAnswerName(answerType) {
            const names = { 1: '文字', 2: '语音', 3: '视频' };
            return `${names[Number(answerType)] || `类型 ${answerType}`}翻牌`;
        }

        function getPrivateMessageFlipPanelElements() {
            return {
                panel: document.getElementById('private-message-flip-panel'),
                enabled: document.getElementById('private-message-flip-enabled'),
                answerType: document.getElementById('private-message-flip-answer-type'),
                answerDisplay: document.getElementById('private-message-flip-answer-display'),
                answerDropdown: document.getElementById('private-message-flip-answer-dropdown'),
                privacyType: document.getElementById('private-message-flip-privacy-type'),
                privacyDisplay: document.getElementById('private-message-flip-privacy-display'),
                privacyDropdown: document.getElementById('private-message-flip-privacy-dropdown'),
                costInput: document.getElementById('private-message-flip-cost-input'),
                status: document.getElementById('private-message-flip-status'),
                sendButton: document.getElementById('btn-send-private-message')
            };
        }

        function setPrivateMessageFlipStatus(text = '', tone = '') {
            const { status } = getPrivateMessageFlipPanelElements();
            if (!status) return;

            status.textContent = text;
            status.dataset.tone = tone || '';
        }

        function setPrivateMessageFlipPanelVisible(isVisible) {
            const { panel } = getPrivateMessageFlipPanelElements();
            if (panel) panel.style.display = isVisible ? 'flex' : 'none';
        }

        function resetPrivateMessageFlipPanel() {
            privateMessageFlipPrices = [];
            privateMessageFlipMember = null;
            privateMessageFlipLoading = false;

            const { enabled, answerType, answerDisplay, answerDropdown, privacyType, privacyDisplay, privacyDropdown, costInput, sendButton } = getPrivateMessageFlipPanelElements();
            if (enabled) enabled.checked = false;
            if (answerType) {
                answerType.value = '1';
            }
            if (answerDisplay) {
                answerDisplay.value = '文字翻牌';
                answerDisplay.disabled = true;
            }
            if (answerDropdown) {
                answerDropdown.innerHTML = '';
                answerDropdown.style.display = 'none';
            }
            if (privacyType) {
                privacyType.value = '1';
            }
            if (privacyDisplay) {
                privacyDisplay.value = '公开';
                privacyDisplay.disabled = true;
            }
            if (privacyDropdown) {
                privacyDropdown.style.display = 'none';
            }
            if (costInput) {
                costInput.value = '0';
                costInput.dataset.minPrice = '0';
                costInput.disabled = true;
            }
            if (sendButton && !privateMessageDetailState.sending) {
                sendButton.textContent = '发送';
            }
            setPrivateMessageFlipStatus('');
            setPrivateMessageFlipPanelVisible(false);
            setPrivateMessageSending(privateMessageDetailState.sending);
        }

        function populatePrivateMessageFlipOptions() {
            const { answerType, answerDisplay, answerDropdown } = getPrivateMessageFlipPanelElements();
            if (!answerDropdown) return;

            answerDropdown.innerHTML = '';
            const enabledPrices = privateMessageFlipPrices.filter(item => Number(item.status) === 1);
            if (!enabledPrices.length) {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.style.color = '#999';
                item.style.cursor = 'default';
                item.textContent = '未开通';
                answerDropdown.appendChild(item);
                if (answerType) answerType.value = '';
                if (answerDisplay) {
                    answerDisplay.value = '未开通';
                    answerDisplay.disabled = true;
                }
                return;
            }

            enabledPrices.forEach(item => {
                const option = document.createElement('div');
                option.className = 'suggestion-item';
                option.textContent = getPrivateMessageFlipAnswerName(item.answerType);
                option.onclick = () => selectPrivateMessageFlipAnswer(item.answerType, option.textContent);
                answerDropdown.appendChild(option);
            });

            const first = enabledPrices[0];
            if (first) {
                selectPrivateMessageFlipAnswer(first.answerType, getPrivateMessageFlipAnswerName(first.answerType));
            }
        }

        function togglePrivateMessageFlipAnswerDropdown() {
            const { answerDisplay, answerDropdown, privacyDropdown } = getPrivateMessageFlipPanelElements();
            if (!answerDisplay || answerDisplay.disabled || !answerDropdown) return;
            if (privacyDropdown) privacyDropdown.style.display = 'none';
            answerDropdown.style.display = answerDropdown.style.display === 'block' ? 'none' : 'block';
        }

        function selectPrivateMessageFlipAnswer(value, text) {
            const { answerType, answerDisplay, answerDropdown } = getPrivateMessageFlipPanelElements();
            if (answerType) answerType.value = String(value || '');
            if (answerDisplay) answerDisplay.value = text || getPrivateMessageFlipAnswerName(value);
            if (answerDropdown) answerDropdown.style.display = 'none';
            updatePrivateMessageFlipCostDisplay();
        }

        function togglePrivateMessageFlipPrivacyDropdown() {
            const { privacyDisplay, privacyDropdown, answerDropdown } = getPrivateMessageFlipPanelElements();
            if (!privacyDisplay || privacyDisplay.disabled || !privacyDropdown) return;
            if (answerDropdown) answerDropdown.style.display = 'none';
            privacyDropdown.style.display = privacyDropdown.style.display === 'block' ? 'none' : 'block';
        }

        function selectPrivateMessageFlipPrivacy(value, text) {
            const { privacyType, privacyDisplay, privacyDropdown } = getPrivateMessageFlipPanelElements();
            if (privacyType) privacyType.value = String(value || '1');
            if (privacyDisplay) privacyDisplay.value = text || '公开';
            if (privacyDropdown) privacyDropdown.style.display = 'none';
            updatePrivateMessageFlipCostDisplay();
        }

        function closePrivateMessageFlipDropdowns(event) {
            const { answerDropdown, privacyDropdown } = getPrivateMessageFlipPanelElements();
            if (!answerDropdown && !privacyDropdown) return;

            const target = event?.target;
            const answerWrap = document.getElementById('private-message-flip-answer-wrapper');
            const privacyWrap = document.getElementById('private-message-flip-privacy-wrapper');
            const clickedInsideAnswer = !!(answerWrap && target && answerWrap.contains(target));
            const clickedInsidePrivacy = !!(privacyWrap && target && privacyWrap.contains(target));

            if (!clickedInsideAnswer && answerDropdown) answerDropdown.style.display = 'none';
            if (!clickedInsidePrivacy && privacyDropdown) privacyDropdown.style.display = 'none';
        }

        document.addEventListener('click', closePrivateMessageFlipDropdowns);

        function updatePrivateMessageFlipCostDisplay() {
            const { answerType, privacyType, costInput } = getPrivateMessageFlipPanelElements();
            if (!answerType || !privacyType || !costInput) return;

            const answerTypeValue = Number(answerType.value);
            const config = privateMessageFlipPrices.find(item => Number(item.answerType) === answerTypeValue);
            if (!config) {
                costInput.value = '0';
                costInput.dataset.minPrice = '0';
                costInput.disabled = true;
                return;
            }

            const privacy = String(privacyType.value || '1');
            let price = Number(config.normalCost) || 0;
            if (privacy === '2') price = Number(config.privateCost) || 0;
            if (privacy === '3') price = Number(config.anonymityCost) || 0;

            costInput.value = String(price);
            costInput.dataset.minPrice = String(price);
            costInput.disabled = false;
        }

        function checkPrivateMessageFlipCostMin() {
            const { costInput } = getPrivateMessageFlipPanelElements();
            if (!costInput) return;

            const minPrice = Number(costInput.dataset.minPrice || 0) || 0;
            const currentCost = Number(costInput.value || 0) || 0;
            if (currentCost < minPrice) {
                costInput.value = String(minPrice);
                setPrivateMessageFlipStatus(`鸡腿数不能低于 ${minPrice}`, 'warn');
            }
        }

        function handlePrivateMessageFlipCostInput() {
            const { costInput } = getPrivateMessageFlipPanelElements();
            if (!costInput) return;

            const normalized = String(costInput.value || '').replace(/[^\d]/g, '');
            if (costInput.value !== normalized) {
                costInput.value = normalized;
            }

            if (normalized) {
                const minPrice = Number(costInput.dataset.minPrice || 0) || 0;
                const currentCost = Number(normalized) || 0;
                if (currentCost >= minPrice) {
                    setPrivateMessageFlipStatus('');
                }
            }
        }

        function isPrivateMessageFlipEnabled() {
            const { panel, enabled } = getPrivateMessageFlipPanelElements();
            return !!(panel && panel.style.display !== 'none' && enabled && enabled.checked);
        }

        function updatePrivateMessageReplyCounter() {
            const input = document.getElementById('private-message-reply-input');
            const counter = document.getElementById('private-message-reply-count');
            if (!input || !counter) return;

            if (!isPrivateMessageFlipEnabled()) {
                input.removeAttribute('maxlength');
                counter.style.display = 'none';
                counter.textContent = '0/200';
                counter.classList.remove('is-limit');
                return;
            }

            const count = input.value.length;
            counter.textContent = `${count}/200`;
            counter.style.display = 'block';
            counter.classList.toggle('is-limit', count > 200);
        }

        function syncPrivateMessageFlipControls() {
            const { enabled, answerDisplay, answerDropdown, privacyDisplay, privacyDropdown, costInput, sendButton } = getPrivateMessageFlipPanelElements();
            const isEnabled = !!(enabled && enabled.checked);
            const canToggleFlip = privateMessageFlipPrices.length > 0
                && !!privateMessageFlipMember
                && !privateMessageFlipLoading
                && !privateMessageDetailState.sending;
            const canUseFlip = isEnabled && canToggleFlip;

            if (enabled) enabled.disabled = !canToggleFlip;
            if (answerDisplay) answerDisplay.disabled = !canUseFlip;
            if (privacyDisplay) privacyDisplay.disabled = !canUseFlip;
            if (costInput) costInput.disabled = !canUseFlip;
            if (!canUseFlip) {
                if (answerDropdown) answerDropdown.style.display = 'none';
                if (privacyDropdown) privacyDropdown.style.display = 'none';
            }
            if (sendButton && !privateMessageDetailState.sending) {
                sendButton.textContent = isEnabled ? '发送翻牌' : '发送';
            }
            const imageBtn = document.getElementById('btn-send-private-message-image');
            const imageInput = document.getElementById('private-message-image-file');
            const imageDisabled = !privateMessageDetailState.targetUserId || privateMessageDetailState.sending || isEnabled;
            if (imageBtn) imageBtn.disabled = imageDisabled;
            if (imageInput) imageInput.disabled = imageDisabled;

            if (isEnabled && !privateMessageFlipPrices.length && !privateMessageFlipLoading) {
                setPrivateMessageFlipStatus('该成员暂未开通翻牌', 'warn');
            } else if (!isEnabled && !privateMessageFlipLoading) {
                setPrivateMessageFlipStatus('');
            }

            updatePrivateMessageReplyCounter();
        }

        async function refreshPrivateMessageFlipPanel() {
            resetPrivateMessageFlipPanel();

            const targetId = String(privateMessageDetailState.targetUserId || '').trim();
            if (!targetId) return;

            if (!getPrivateMessagesMemberDataLoaded() && typeof loadMemberData === 'function') {
                try {
                    await loadMemberData();
                } catch (error) {
                    console.warn('私信翻牌入口加载成员库失败:', error);
                }
            }

            const member = findActivePrivateMessageMember();
            if (!member) return;

            const memberId = getPrivateMessageFlipMemberId(member);
            if (!memberId) return;

            if (String(privateMessageDetailState.targetUserId || '').trim() !== targetId) return;

            privateMessageFlipMember = {
                id: memberId,
                name: member.ownerName || member.nickname || member.name || privateMessageDetailState.title || '成员'
            };

            const { enabled } = getPrivateMessageFlipPanelElements();
            if (enabled) enabled.checked = true;
            setPrivateMessageFlipPanelVisible(true);
            setPrivateMessageFlipStatus('');
            privateMessageFlipLoading = true;
            syncPrivateMessageFlipControls();

            try {
                const token = getPrivateMessagesToken();
                const res = await ipcRenderer.invoke('fetch-flip-prices', {
                    token,
                    pa: getPrivateMessageSafePa(),
                    memberId
                });

                if (String(privateMessageDetailState.targetUserId || '').trim() !== targetId) return;

                if (res && res.success && res.content && Array.isArray(res.content.customs)) {
                    privateMessageFlipPrices = res.content.customs;
                    populatePrivateMessageFlipOptions();
                    updatePrivateMessageFlipCostDisplay();
                    setPrivateMessageFlipStatus(privateMessageFlipPrices.length ? '' : '该成员暂未开通翻牌', privateMessageFlipPrices.length ? '' : 'warn');
                } else {
                    privateMessageFlipPrices = [];
                    populatePrivateMessageFlipOptions();
                    setPrivateMessageFlipStatus(`翻牌设置读取失败: ${res?.msg || '未知错误'}`, 'error');
                }
            } catch (error) {
                if (String(privateMessageDetailState.targetUserId || '').trim() !== targetId) return;
                privateMessageFlipPrices = [];
                populatePrivateMessageFlipOptions();
                setPrivateMessageFlipStatus(`翻牌设置读取失败: ${error.message}`, 'error');
            } finally {
                if (String(privateMessageDetailState.targetUserId || '').trim() !== targetId) return;
                privateMessageFlipLoading = false;
                syncPrivateMessageFlipControls();
            }
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
                const viewEl = document.getElementById('view-private-messages');
                if (headerEl) headerEl.style.visibility = 'visible';
                if (titleEl) titleEl.textContent = privateMessageDetailState.title;
                if (subtitleEl) subtitleEl.textContent = `ID: ${privateMessageDetailState.targetUserId}`;
                if (avatarEl) avatarEl.src = privateMessageDetailState.avatar;
                if (inputEl) inputEl.value = '';
                if (viewEl) viewEl.classList.add('is-detail-open');
                clearActivePrivateMessageUnread(privateMessageDetailState.targetUserId);
                filterPrivateMessageList(getCurrentSearchKeyword());
                renderPrivateMessageDetail();
                updatePrivateMessageReplyCounter();
                resetPrivateMessageFlipPanel();
                setPrivateMessageSending(false);
                void refreshPrivateMessageFlipPanel();
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
                let replacedCount = 0;
                const addedItems = [];
                incoming.forEach(item => {
                    const key = getPrivateMessageItemKey(item, privateMessageDetailState.targetUserId);
                    const localFlipIndex = findMatchingLocalFlipQuestionIndex(item);
                    if (localFlipIndex >= 0) {
                        const oldItem = privateMessageDetailState.items[localFlipIndex];
                        const oldKey = getPrivateMessageItemKey(oldItem, privateMessageDetailState.targetUserId);
                        if (oldKey) seen.delete(oldKey);
                        privateMessageDetailState.items[localFlipIndex] = item;
                        if (key) seen.add(key);
                        replacedCount += 1;
                        return;
                    }

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
                if (reset || addedCount > 0 || replacedCount > 0 || !isAutoRefresh) {
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

                    if (replacedCount > 0) {
                        renderPrivateMessageDetail({
                            keepScrollOffset: shouldKeepScrollOffset,
                            stickToBottom: shouldStickToBottom
                        });
                    } else if (canPrependIncrementally) {
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
                            </div>
                            <div class="private-message-list-tail">
                                <span class="private-message-last">${escapePrivateMessageHtml(preview)}</span>
                            </div>
                        </div>
                        <div class="private-message-list-side">
                            <div class="private-message-time">${escapePrivateMessageHtml(formatPrivateMessageTime(item.newestMessagetime))}</div>
                            ${unread > 0 ? `<span class="private-message-unread-dot">${Math.min(unread, 99)}</span>` : ''}
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
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                sendPrivateMessageReply();
            }
        }

        async function sendPrivateMessageFlipQuestion(text, input) {
            const token = getPrivateMessagesToken();
            const { answerType, privacyType, costInput } = getPrivateMessageFlipPanelElements();

            if (!privateMessageFlipMember || !privateMessageFlipMember.id) {
                setPrivateMessageFlipStatus('当前私信对象不是可翻牌成员', 'error');
                return;
            }

            if (privateMessageFlipLoading) {
                setPrivateMessageFlipStatus('翻牌设置还在读取中', 'warn');
                return;
            }

            const answerTypeValue = Number(answerType?.value || 0);
            const privacyValue = Number(privacyType?.value || 1);
            const cost = parseInt(costInput?.value || '0', 10) || 0;
            const minPrice = parseInt(costInput?.dataset.minPrice || '0', 10) || 0;

            if (!answerTypeValue || !privateMessageFlipPrices.length) {
                setPrivateMessageFlipStatus('请选择有效的翻牌类型', 'error');
                return;
            }

            if (cost < minPrice) {
                if (costInput) costInput.value = String(minPrice);
                setPrivateMessageFlipStatus(`鸡腿数不能低于 ${minPrice}`, 'warn');
                return;
            }

            setPrivateMessageSending(true);
            setPrivateMessageFlipStatus('正在发送翻牌', '');

            try {
                const payload = {
                    memberId: Number(privateMessageFlipMember.id),
                    content: text,
                    type: privacyValue,
                    cost,
                    answerType: answerTypeValue
                };

                const res = await ipcRenderer.invoke('send-flip-question', {
                    token,
                    pa: getPrivateMessageSafePa(),
                    payload
                });

                if (!res || !res.success) {
                    throw new Error(res && res.msg ? res.msg : '发送失败');
                }

                privateMessageDetailState.items.push({
                    messageId: `local-flip-${Date.now()}`,
                    timestamp: Date.now(),
                    messageType: 'FLIPCARD_QUESTION',
                    content: {
                        messageType: 'FLIPCARD_QUESTION',
                        text,
                        question: text
                    },
                    question: text
                });
                renderPrivateMessageDetail({ stickToBottom: true });

                const conversation = privateMessageListState.items.find(entry => String(entry.user?.userId || '') === String(privateMessageDetailState.targetUserId));
                if (conversation) {
                    conversation.newestMessage = '[翻牌提问]';
                    conversation.newestMessagetime = Date.now();
                    filterPrivateMessageList(getCurrentSearchKeyword(), { preserveScroll: true });
                }

                if (input) {
                    input.value = '';
                    input.focus();
                }

                setPrivateMessageFlipStatus('翻牌发送成功', 'success');
                setTimeout(() => {
                    const { status } = getPrivateMessageFlipPanelElements();
                    if (status && status.textContent === '翻牌发送成功' && status.dataset.tone === 'success') {
                        setPrivateMessageFlipStatus('');
                    }
                }, 3000);
            } catch (error) {
                console.error('发送私信翻牌失败:', error);
                setPrivateMessageFlipStatus(`发送失败: ${error.message}`, 'error');
            } finally {
                setPrivateMessageSending(false);
            }
        }

        function openPrivateMessageImagePicker() {
            if (privateMessageDetailState.sending) return;
            const token = getPrivateMessagesToken();
            if (!token) {
                showToast('请先登录账号');
                return switchView('login');
            }
            if (!privateMessageDetailState.targetUserId) {
                showToast('请先选择私信会话');
                return;
            }
            if (isPrivateMessageFlipEnabled()) {
                setPrivateMessageFlipStatus('翻牌模式不能发送图片', 'error');
                return;
            }

            const input = document.getElementById('private-message-image-file');
            if (input) input.click();
        }

        function readPrivateMessageImageData(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('读取图片失败'));
                reader.readAsDataURL(file);
            });
        }

        function getPrivateMessageImageSize(dataUrl) {
            return new Promise(resolve => {
                const image = new Image();
                image.onload = () => resolve({
                    width: Number(image.naturalWidth || image.width || 0),
                    height: Number(image.naturalHeight || image.height || 0)
                });
                image.onerror = () => resolve({ width: 0, height: 0 });
                image.src = dataUrl;
            });
        }

        function setPrivateMessageImageButtonText(text) {
            const btn = document.getElementById('btn-send-private-message-image');
            if (btn) btn.textContent = text || '图片';
        }

        async function handlePrivateMessageImageSelected(file) {
            if (!file || privateMessageDetailState.sending) return;
            const token = getPrivateMessagesToken();
            if (!token) {
                showToast('请先登录账号');
                return switchView('login');
            }
            if (!privateMessageDetailState.targetUserId) {
                showToast('请先选择私信会话');
                return;
            }
            if (isPrivateMessageFlipEnabled()) {
                setPrivateMessageFlipStatus('翻牌模式不能发送图片', 'error');
                return;
            }

            const mimeType = String(file.type || '').toLowerCase();
            const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
            if (mimeType && !allowedTypes.has(mimeType)) {
                showToast('请选择 JPG、PNG、WEBP 或 GIF 图片');
                return;
            }
            const maxSize = 20 * 1024 * 1024;
            if (file.size > maxSize) {
                showToast('图片不能超过 20MB');
                return;
            }

            const targetUserId = String(privateMessageDetailState.targetUserId || '');
            setPrivateMessageSending(true);
            setPrivateMessageImageButtonText('上传中');
            try {
                const dataUrl = await readPrivateMessageImageData(file);
                const imageSize = await getPrivateMessageImageSize(dataUrl);
                const uploadRes = await ipcRenderer.invoke('upload-private-message-image', {
                    token,
                    pa: getPrivateMessageSafePa(),
                    fileName: file.name || `private-message-${Date.now()}.jpg`,
                    mimeType: mimeType || 'image/jpeg',
                    dataBase64: dataUrl
                });

                if (!uploadRes || !uploadRes.success) {
                    throw new Error(uploadRes && uploadRes.msg ? uploadRes.msg : '上传图片失败');
                }

                const uploaded = Array.isArray(uploadRes.content) ? uploadRes.content[0] : (uploadRes.content || {});
                const imagePayload = {
                    imgUrl: String(uploaded.path || uploadRes.path || ''),
                    imgWidth: Number(uploaded.width || imageSize.width || 0),
                    imgHeight: Number(uploaded.height || imageSize.height || 0),
                    imgSize: Number(uploaded.size || file.size || 0)
                };

                if (!imagePayload.imgUrl) {
                    throw new Error('上传结果缺少图片地址');
                }

                setPrivateMessageImageButtonText('发送中');
                const res = await ipcRenderer.invoke('send-private-message-reply', {
                    token,
                    pa: getPrivateMessageSafePa(),
                    targetUserId,
                    messageType: 'IMAGE',
                    text: '',
                    image: imagePayload
                });

                if (!res || !res.success || !res.content) {
                    throw new Error(res && res.msg ? res.msg : '发送图片失败');
                }

                if (String(privateMessageDetailState.targetUserId || '') === targetUserId) {
                    privateMessageDetailState.items.push({
                        messageId: res.content.messageId,
                        timestamp: res.content.timestamp,
                        messageType: res.content.messageType || 'IMAGE',
                        content: res.content.content || { messageType: 'IMAGE', text: '', ...imagePayload }
                    });
                    renderPrivateMessageDetail({ stickToBottom: true });
                }

                const conversation = privateMessageListState.items.find(entry => String(entry.user?.userId || '') === targetUserId);
                if (conversation) {
                    conversation.newestMessage = '[图片消息]';
                    conversation.newestMessagetime = Number(res.content.timestamp) || Date.now();
                    filterPrivateMessageList(getCurrentSearchKeyword(), { preserveScroll: true });
                }
            } catch (error) {
                console.error('发送私信图片失败:', error);
                showToast(`发送图片失败: ${error.message}`);
            } finally {
                setPrivateMessageImageButtonText('图片');
                setPrivateMessageSending(false);
            }
        }

        async function sendPrivateMessageReply() {
            if (privateMessageDetailState.sending) return;
            const token = getPrivateMessagesToken();
            if (!token) {
                if (isPrivateMessageFlipEnabled()) {
                    setPrivateMessageFlipStatus('请先登录账号', 'error');
                } else {
                    showToast('请先登录账号');
                }
                return switchView('login');
            }
            if (!privateMessageDetailState.targetUserId) return;

            const input = document.getElementById('private-message-reply-input');
            const rawText = input ? input.value : '';
            const text = String(rawText || '').trim();
            const isFlipMode = isPrivateMessageFlipEnabled();
            if (!text) {
                if (isFlipMode) {
                    setPrivateMessageFlipStatus('请输入内容', 'error');
                    return;
                }
                return showToast('请输入私信内容');
            }

            if (isFlipMode) {
                if (text.length > 200) {
                    setPrivateMessageFlipStatus('翻牌内容不能超过 200 字', 'error');
                    return;
                }
                return sendPrivateMessageFlipQuestion(text, input);
            }

            setPrivateMessageSending(true);
            try {
                const res = await ipcRenderer.invoke('send-private-message-reply', {
                    token,
                    pa: getPrivateMessageSafePa(),
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

        function resetPrivateMessageListState() {
            stopPrivateMessagePolling();
            privateMessageListState.items = [];
            privateMessageListState.cursor = Date.now();
            privateMessageListState.hasMore = true;
            privateMessageListState.loading = false;
            privateMessageListState.initialized = false;
            resetPrivateMessageDetailPanel();
            const searchEl = document.getElementById('private-message-search');
            const listEl = document.getElementById('private-message-list');
            const statusEl = document.getElementById('private-messages-status');
            if (searchEl) searchEl.value = '';
            if (statusEl) statusEl.textContent = '';
            if (listEl) listEl.innerHTML = '<div class="empty-state">正在加载私信列表</div>';
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
            backToPrivateMessageList,
            closePrivateMessageDetail,
            checkPrivateMessageFlipCostMin,
            filterPrivateMessageList,
            flushPrivateMessagePendingMessages,
            handlePrivateMessageImageSelected,
            handlePrivateMessageFlipCostInput,
            handlePrivateMessageReplyKeydown,
            loadMorePrivateMessageDetail,
            loadMorePrivateMessageList,
            loadPrivateMessageDetail,
            loadPrivateMessageList,
            openPrivateMessageDetail,
            openPrivateMessageImagePicker,
            refreshPrivateMessageList,
            resetPrivateMessageDetailPanel,
            resetPrivateMessageListState,
            sendPrivateMessageReply,
            startPrivateMessagePolling,
            stopPrivateMessagePolling,
            syncPrivateMessageFlipControls,
            togglePrivateMessageFlipAnswerDropdown,
            togglePrivateMessageFlipPrivacyDropdown,
            selectPrivateMessageFlipAnswer,
            selectPrivateMessageFlipPrivacy,
            updatePrivateMessageReplyCounter,
            updatePrivateMessageFlipCostDisplay
        };
    };
})();
