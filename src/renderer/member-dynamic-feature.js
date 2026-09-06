(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createMemberDynamicFeature = function createMemberDynamicFeature(deps) {
        const { escapeHtml, escapeJsString, normalize48Url } = window.YayaRendererUtils;
        const {
            getAppToken,
            getCurrentUserId,
            getMemberData,
            getMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle,
            getOptimizedThumbUrl,
            ipcRenderer,
            replaceTencentEmoji,
            showToast,
            openImageModal
        } = deps;

        let currentDynamicNextTime = 0;
        let isFetchingDynamic = false;
        const dynamicCommentStateMap = new Map();
        const dynamicPostStatsCache = new Map();
        const dynamicPostStatsRequests = new Map();
        let dynamicPostStatsObserver = null;

        function stripHtml(value) {
            const html = String(value || '').replace(/<br\s*\/?>/gi, '\n');
            const div = document.createElement('div');
            div.innerHTML = html;
            return (div.textContent || div.innerText || '').trim();
        }

        function getDynamicMentionUserId(href) {
            const match = String(href || '').trim().match(/^snh48:\/\/(\d+)/i);
            return match ? match[1] : '';
        }

        function renderDynamicPlainText(value) {
            return escapeHtml(value || '动态').replace(
                /(^|[\s([（【「『，。！？、；：])(@[^\s@，。！？、；：,.!?()[\]（）【】「」『』]+)/g,
                (match, prefix, mention) => {
                    let name = mention;
                    let rest = '';
                    const asciiMatch = mention.match(/^@[A-Za-z0-9_.-]+/);
                    if (asciiMatch) {
                        name = asciiMatch[0];
                        rest = mention.slice(name.length);
                    } else {
                        const greetingIndex = ['生日快乐', '新年快乐', '元旦快乐', '节日快乐'].reduce((nearest, word) => {
                            const index = mention.indexOf(word);
                            return index > 1 && (nearest < 0 || index < nearest) ? index : nearest;
                        }, -1);
                        if (greetingIndex > 1) {
                            name = mention.slice(0, greetingIndex);
                            rest = mention.slice(greetingIndex);
                        }
                    }
                    return `${prefix}<span class="member-dynamic-mention">${name}</span>${rest}`;
                }
            );
        }

        function renderDynamicContent(value) {
            const raw = String(value || '').trim();
            if (!raw) return renderDynamicPlainText('动态');
            if (!/[<>&]/.test(raw)) return renderDynamicPlainText(raw);

            const div = document.createElement('div');
            div.innerHTML = raw.replace(/<br\s*\/?>/gi, '\n');
            const parts = [];

            const walk = node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.nodeValue || '';
                    if (!text.trim() && !text.includes('\n')) return;
                    parts.push(renderDynamicPlainText(text));
                    return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) return;

                const element = node;
                const href = element.getAttribute('href') || '';
                const label = (element.textContent || '').trim();
                if (element.tagName === 'A' && href.startsWith('snh48://') && label) {
                    const mentionUserId = getDynamicMentionUserId(href);
                    if (mentionUserId) {
                        parts.push(`<button type="button" class="member-dynamic-mention member-dynamic-mention-btn" onclick="window.openFollowedUserProfile && window.openFollowedUserProfile('${escapeJsString(mentionUserId)}', '${escapeJsString(label)}', '', false)">${escapeHtml(label)}</button>`);
                    } else {
                        parts.push(`<span class="member-dynamic-mention">${escapeHtml(label)}</span>`);
                    }
                    return;
                }
                element.childNodes.forEach(walk);
            };

            div.childNodes.forEach(walk);
            return parts.join('').replace(/\n{3,}/g, '\n\n').trim() || renderDynamicPlainText('动态');
        }

        function getResultBox() {
            return document.getElementById('member-dynamic-search-results');
        }

        function getMemberId() {
            return String(document.getElementById('member-dynamic-member-id')?.value || '').trim();
        }

        function getMemberName() {
            return String(document.getElementById('member-dynamic-member-input')?.value || '').trim();
        }

        function getMemberOwnerIdFromInput() {
            const selectedId = getMemberId();
            if (selectedId) return selectedId;

            const keyword = getMemberName();
            if (!keyword) return '';

            const memberList = Array.isArray(getMemberData()) ? getMemberData() : [];
            const matchedMember = memberList.find(member => String(member.ownerName || member.name || '').trim() === keyword)
                || memberList.find(member => String(member.ownerName || member.name || '').trim().includes(keyword));
            return matchedMember
                ? String(matchedMember.id || matchedMember.userId || matchedMember.ownerId || matchedMember.memberId || '').trim()
                : '';
        }

        function bindMemberDynamicSearchDismiss() {
            document.addEventListener('click', (event) => {
                const resultBox = getResultBox();
                if (!resultBox || window.getComputedStyle(resultBox).display === 'none') return;

                const input = document.getElementById('member-dynamic-member-input');
                if ((input && input.contains(event.target)) || resultBox.contains(event.target)) return;

                resultBox.style.display = 'none';
            });
        }

        function formatTime(value) {
            const raw = Number(value);
            const normalizedValue = Number.isFinite(raw) && raw > 0 && raw < 10000000000
                ? raw * 1000
                : (raw || value || Date.now());
            const date = new Date(normalizedValue);
            if (Number.isNaN(date.getTime())) return '';
            const pad = num => String(num).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }

        function formatDynamicNumber(value) {
            const number = Number(value);
            if (!Number.isFinite(number)) return '';
            if (number >= 10000) return `${(number / 10000).toFixed(number >= 100000 ? 0 : 1).replace(/\.0$/, '')}万`;
            return String(number);
        }

        function findDynamicPostObject(value, visited = new WeakSet(), depth = 0) {
            if (!value || depth > 6) return null;
            if (typeof value === 'string') {
                const raw = value.trim();
                if (!((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']')))) return null;
                try {
                    return findDynamicPostObject(JSON.parse(raw), visited, depth + 1);
                } catch (error) {
                    return null;
                }
            }
            if (typeof value !== 'object' || visited.has(value)) return null;
            visited.add(value);
            if (value.postId !== undefined && value.postId !== null && String(value.postId).trim()) return value;

            const preferredKeys = ['postsInfo', 'post', 'data', 'content', 'extInfo'];
            for (const key of preferredKeys) {
                const found = findDynamicPostObject(value[key], visited, depth + 1);
                if (found) return found;
            }
            for (const child of Object.values(value)) {
                const found = findDynamicPostObject(child, visited, depth + 1);
                if (found) return found;
            }
            return null;
        }

        function getDynamicPostMeta(item, ext) {
            const post = findDynamicPostObject(ext) || findDynamicPostObject(item) || {};
            const postId = String(post.postId || ext?.postId || ext?.id || item?.postId || '').trim();
            const getCount = candidates => {
                const rawValue = candidates.find(value => value !== undefined && value !== null && value !== '');
                const number = rawValue === undefined ? null : Number(rawValue);
                return Number.isFinite(number) ? number : null;
            };
            return {
                postId,
                viewCount: getCount([post.viewCount, post.readCount, ext?.viewCount, ext?.readCount, item?.viewCount, item?.readCount]),
                likeCount: getCount([post.likeCount, post.likeNum, ext?.likeCount, ext?.likeNum, item?.likeCount, item?.likeNum]),
                commentCount: getCount([post.commentCount, post.commentNum, ext?.commentCount, ext?.commentNum, item?.commentCount, item?.commentNum])
            };
        }

        function parseExtInfo(item) {
            if (!item || !item.extInfo) return {};
            try {
                const text = typeof item.extInfo === 'string'
                    ? item.extInfo.replace(/:\s*([0-9]{16,})/g, ':"$1"')
                    : item.extInfo;
                return typeof text === 'string' ? JSON.parse(text) : text;
            } catch (error) {
                return {};
            }
        }

        function normalizeDynamicList(content) {
            if (!content || typeof content !== 'object') return [];
            if (Array.isArray(content)) return content;
            return content.message || content.messageList || content.data || [];
        }

        function getResultMessage(result) {
            if (!result) return '未知错误';
            return result.msg
                || result.message
                || result.data?.message
                || result.data?.msg
                || result.data?.error
                || '未知错误';
        }

        function getDynamicPostStatsFromContent(content) {
            const post = content?.postsInfo || content?.post || {};
            const toCount = value => {
                const number = Number(value);
                return Number.isFinite(number) ? number : null;
            };
            return {
                viewCount: toCount(post.viewCount ?? post.readCount),
                likeCount: toCount(post.likeCount ?? post.likeNum),
                commentCount: toCount(post.commentCount ?? post.commentNum)
            };
        }

        function updateDynamicPostStats(postId, stats = {}) {
            const card = document.getElementById(`member-dynamic-card-${postId}`);
            if (!card) return;
            const mappings = [
                ['viewCount', '.member-dynamic-view-count'],
                ['likeCount', '.member-dynamic-like-count'],
                ['commentCount', '.member-dynamic-comment-count']
            ];
            mappings.forEach(([key, selector]) => {
                const value = stats[key];
                const element = card.querySelector(selector);
                if (element && Number.isFinite(Number(value))) {
                    element.textContent = formatDynamicNumber(value);
                }
            });
        }

        function loadDynamicPostStats(postId) {
            const normalizedPostId = String(postId || '').trim();
            if (!normalizedPostId) return Promise.resolve(null);
            if (dynamicPostStatsCache.has(normalizedPostId)) {
                return Promise.resolve(dynamicPostStatsCache.get(normalizedPostId));
            }
            if (dynamicPostStatsRequests.has(normalizedPostId)) {
                return dynamicPostStatsRequests.get(normalizedPostId);
            }

            const request = (async () => {
                const token = getAppToken ? getAppToken() : '';
                if (!token) return null;
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                const result = await ipcRenderer.invoke('fetch-area48-post-details', {
                    token,
                    pa,
                    postId: normalizedPostId
                });
                if (!result?.success || !result.content) {
                    throw new Error(getResultMessage(result));
                }
                const stats = getDynamicPostStatsFromContent(result.content);
                dynamicPostStatsCache.set(normalizedPostId, stats);
                return stats;
            })().finally(() => {
                dynamicPostStatsRequests.delete(normalizedPostId);
            });
            dynamicPostStatsRequests.set(normalizedPostId, request);
            return request;
        }

        function hydrateDynamicPostStats(card) {
            const postId = String(card?.dataset?.memberDynamicPostId || '').trim();
            if (!postId) return;
            const cached = dynamicPostStatsCache.get(postId);
            if (cached) {
                updateDynamicPostStats(postId, cached);
                return;
            }
            loadDynamicPostStats(postId)
                .then(stats => {
                    if (stats) updateDynamicPostStats(postId, stats);
                })
                .catch(error => console.warn('[成员动态] 获取统计数据失败:', postId, error));
        }

        function observeDynamicPostStats(container) {
            const cards = container.querySelectorAll('.member-dynamic-card[data-member-dynamic-post-id]:not([data-stats-observed])');
            if (!cards.length) return;
            if (typeof IntersectionObserver !== 'function') {
                cards.forEach(card => {
                    card.dataset.statsObserved = '1';
                    hydrateDynamicPostStats(card);
                });
                return;
            }
            if (!dynamicPostStatsObserver) {
                dynamicPostStatsObserver = new IntersectionObserver(entries => {
                    entries.forEach(entry => {
                        if (!entry.isIntersecting) return;
                        dynamicPostStatsObserver.unobserve(entry.target);
                        hydrateDynamicPostStats(entry.target);
                    });
                }, { rootMargin: '240px 0px' });
            }
            cards.forEach(card => {
                card.dataset.statsObserved = '1';
                dynamicPostStatsObserver.observe(card);
            });
        }

        function getDynamicCommentUserMap(content) {
            const map = new Map();
            const users = Array.isArray(content?.commentUserList) ? content.commentUserList : [];
            users.forEach(user => {
                map.set(String(user.userId || ''), user);
            });
            return map;
        }

        function confirmMemberDynamicAction(text) {
            return new Promise(resolve => {
                const existing = document.querySelector('.confirm-overlay.member-dynamic-confirm-overlay');
                if (existing) existing.remove();

                const overlay = document.createElement('div');
                overlay.className = 'confirm-overlay member-dynamic-confirm-overlay';
                overlay.innerHTML = `
                    <div class="confirm-box">
                        <div class="confirm-text">${escapeHtml(text)}</div>
                        <div class="confirm-btns">
                            <button class="confirm-btn cancel" type="button">取消</button>
                            <button class="confirm-btn ok" type="button">确定</button>
                        </div>
                    </div>`;

                const close = confirmed => {
                    document.removeEventListener('keydown', handleKeydown);
                    overlay.remove();
                    resolve(confirmed);
                };
                const handleKeydown = event => {
                    if (event.key === 'Escape') close(false);
                    if (event.key === 'Enter') close(true);
                };
                overlay.addEventListener('click', event => {
                    if (event.target === overlay) close(false);
                });
                overlay.querySelector('.confirm-btn.cancel')?.addEventListener('click', () => close(false));
                overlay.querySelector('.confirm-btn.ok')?.addEventListener('click', () => close(true));
                document.addEventListener('keydown', handleKeydown);
                document.body.appendChild(overlay);
                setTimeout(() => overlay.querySelector('.confirm-btn.ok')?.focus(), 0);
            });
        }

        function updateDynamicCommentCount(postId, count) {
            const countEl = document.querySelector(`#member-dynamic-comment-toggle-${postId} .member-dynamic-comment-count`);
            if (!countEl || !Number.isFinite(Number(count))) return;
            countEl.textContent = formatDynamicNumber(count);
            const cachedStats = dynamicPostStatsCache.get(String(postId));
            if (cachedStats) cachedStats.commentCount = Number(count);
        }

        function renderMemberDynamicComments(postId, state) {
            const panel = document.getElementById(`member-dynamic-comments-${postId}`);
            if (!panel) return;
            const comments = Array.isArray(state.comments) ? state.comments : [];
            const currentUserId = typeof getCurrentUserId === 'function' ? String(getCurrentUserId() || '') : '';
            const html = comments.map(comment => {
                const user = state.userMap.get(String(comment.userId || '')) || {};
                const userId = String(user.userId || comment.userId || '').trim();
                const avatar = normalize48Url(user.avatar || user.headImg || user.icon || '');
                const name = user.nickname || user.realNickName || user.name || String(comment.userId || '用户');
                const escapedText = renderDynamicPlainText(comment.msg || comment.comment || '');
                const text = typeof replaceTencentEmoji === 'function' ? replaceTencentEmoji(escapedText) : escapedText;
                const imageUrl = normalize48Url(comment.url || '');
                const commentId = String(comment.commentId || comment.resourceId || '').trim();
                const canDelete = commentId && currentUserId && String(comment.userId || '') === currentUserId;
                const openProfile = userId
                    ? `onclick="window.openFollowedUserProfile && window.openFollowedUserProfile('${escapeHtml(escapeJsString(userId))}', '${escapeHtml(escapeJsString(name))}', '${escapeHtml(escapeJsString(avatar))}', false)"`
                    : '';
                return `
                    <div class="community-comment-item">
                        <button type="button" class="community-comment-profile-avatar" ${openProfile} ${userId ? `aria-label="查看 ${escapeHtml(name)} 的用户主页"` : 'disabled'}>
                            ${avatar
                                ? `<img class="community-comment-avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                                : '<span class="community-comment-avatar community-avatar-placeholder"></span>'}
                        </button>
                        <div class="community-comment-body">
                            <div class="community-comment-head">
                                <button type="button" class="community-comment-name community-comment-profile-name" ${openProfile} ${userId ? '' : 'disabled'}>${escapeHtml(name)}</button>
                                <span class="community-comment-time">${escapeHtml(formatTime(comment.ctime))}</span>
                                ${canDelete ? `
                                    <button class="community-comment-delete" onclick="deleteMemberDynamicComment('${escapeJsString(postId)}', '${escapeJsString(commentId)}')">删除</button>
                                ` : ''}
                            </div>
                            ${text ? `<div class="community-comment-text">${text}</div>` : ''}
                            ${imageUrl ? `
                                <button class="member-weibo-image-btn member-dynamic-comment-image" data-url="${escapeHtml(imageUrl)}" aria-label="查看评论图片">
                                    <img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" onerror="this.closest('button')?.remove()">
                                </button>
                            ` : ''}
                        </div>
                    </div>`;
            }).join('');

            panel.innerHTML = `
                <div class="community-comment-compose">
                    <input id="member-dynamic-comment-input-${escapeHtml(postId)}" class="community-comment-input" type="text" placeholder="写评论" onkeydown="if(event.key==='Enter') sendMemberDynamicComment('${escapeJsString(postId)}')">
                    <button id="member-dynamic-comment-send-${escapeHtml(postId)}" class="community-comment-send" onclick="sendMemberDynamicComment('${escapeJsString(postId)}')">发送</button>
                </div>
                ${comments.length
                    ? `<div class="community-comments-list">${html}</div>`
                    : `<div class="community-comments-empty">${state.loading ? '正在读取评论...' : '暂无评论'}</div>`}
                ${state.hasMore ? `
                    <button class="community-comments-more" onclick="loadMoreMemberDynamicComments('${escapeJsString(postId)}')">
                        ${state.loading ? '加载中' : '查看更多评论'}
                    </button>
                ` : ''}
            `;
            panel.classList.add('is-open');
        }

        async function loadMemberDynamicComments(postId, options = {}) {
            const normalizedPostId = String(postId || '').trim();
            if (!normalizedPostId) return;
            const token = getAppToken ? getAppToken() : '';
            if (!token) {
                showToast('请先在“账号设置”中登录');
                return;
            }

            const reset = options.reset !== false;
            const existing = dynamicCommentStateMap.get(normalizedPostId) || {
                comments: [],
                userMap: new Map(),
                next: 0,
                hasMore: false,
                loading: false
            };
            if (existing.loading) return;
            const state = reset
                ? { comments: [], userMap: new Map(), next: 0, hasMore: false, loading: true }
                : { ...existing, loading: true };
            dynamicCommentStateMap.set(normalizedPostId, state);
            renderMemberDynamicComments(normalizedPostId, state);

            try {
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                const result = await ipcRenderer.invoke('fetch-area48-comments', {
                    token,
                    pa,
                    resourceId: normalizedPostId,
                    next: reset ? 0 : state.next
                });
                if (!result?.success || !result.content) {
                    throw new Error(getResultMessage(result));
                }

                const content = result.content || {};
                const fetchedComments = Array.isArray(content.commentList) ? content.commentList : [];
                const nextUserMap = getDynamicCommentUserMap(content);
                state.userMap.forEach((user, id) => nextUserMap.set(id, user));
                const mergedComments = reset ? fetchedComments : state.comments.concat(fetchedComments);
                const seenIds = new Set();
                state.comments = mergedComments.filter(comment => {
                    const key = String(comment.commentId || `${comment.userId || ''}-${comment.ctime || ''}-${comment.msg || ''}`);
                    if (seenIds.has(key)) return false;
                    seenIds.add(key);
                    return true;
                });
                state.userMap = nextUserMap;
                state.next = content.next || 0;
                state.hasMore = Boolean(state.next) && fetchedComments.length > 0;
                state.commentNum = Number.isFinite(Number(content.commentNum))
                    ? Number(content.commentNum)
                    : state.comments.length;
                state.loading = false;
                dynamicCommentStateMap.set(normalizedPostId, state);
                updateDynamicCommentCount(normalizedPostId, state.commentNum);
                renderMemberDynamicComments(normalizedPostId, state);
            } catch (error) {
                state.loading = false;
                dynamicCommentStateMap.set(normalizedPostId, state);
                renderMemberDynamicComments(normalizedPostId, state);
                showToast(error.message || '获取评论失败');
            }
        }

        function toggleMemberDynamicComments(postId) {
            const normalizedPostId = String(postId || '').trim();
            const panel = document.getElementById(`member-dynamic-comments-${normalizedPostId}`);
            if (!panel) return;
            if (panel.classList.contains('is-open')) {
                panel.classList.remove('is-open');
                panel.replaceChildren();
                return;
            }
            loadMemberDynamicComments(normalizedPostId, { reset: true });
        }

        function loadMoreMemberDynamicComments(postId) {
            loadMemberDynamicComments(postId, { reset: false });
        }

        async function sendMemberDynamicComment(postId) {
            const normalizedPostId = String(postId || '').trim();
            const input = document.getElementById(`member-dynamic-comment-input-${normalizedPostId}`);
            const button = document.getElementById(`member-dynamic-comment-send-${normalizedPostId}`);
            if (button?.disabled) return;
            const commentMsg = String(input?.value || '').trim();
            if (!commentMsg) {
                showToast('请输入评论内容');
                return;
            }
            const token = getAppToken ? getAppToken() : '';
            if (!token) {
                showToast('请先在“账号设置”中登录');
                return;
            }
            if (button) {
                button.disabled = true;
                button.textContent = '发送中';
            }

            try {
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                const result = await ipcRenderer.invoke('add-area48-comment', {
                    token,
                    pa,
                    resourceId: normalizedPostId,
                    commentMsg
                });
                if (!result?.success || !result.content) {
                    throw new Error(getResultMessage(result));
                }

                const content = result.content || {};
                const newComment = content.comment;
                const commentUser = content.commentUser;
                const state = dynamicCommentStateMap.get(normalizedPostId) || {
                    comments: [],
                    userMap: new Map(),
                    next: 0,
                    hasMore: false,
                    loading: false,
                    commentNum: 0
                };
                if (commentUser?.userId) {
                    state.userMap.set(String(commentUser.userId), commentUser);
                }
                if (newComment) {
                    const newKey = String(newComment.commentId || `${newComment.userId || ''}-${newComment.ctime || ''}-${newComment.msg || ''}`);
                    state.comments = [
                        newComment,
                        ...state.comments.filter(comment => {
                            const key = String(comment.commentId || `${comment.userId || ''}-${comment.ctime || ''}-${comment.msg || ''}`);
                            return key !== newKey;
                        })
                    ];
                    const currentTotal = Number(state.commentNum);
                    state.commentNum = Number.isFinite(currentTotal) ? currentTotal + 1 : state.comments.length;
                    dynamicCommentStateMap.set(normalizedPostId, state);
                    updateDynamicCommentCount(normalizedPostId, state.commentNum);
                    renderMemberDynamicComments(normalizedPostId, state);
                } else {
                    await loadMemberDynamicComments(normalizedPostId, { reset: true });
                }
                showToast('评论已发送');
            } catch (error) {
                showToast(error.message || '发送评论失败');
            } finally {
                const nextButton = document.getElementById(`member-dynamic-comment-send-${normalizedPostId}`);
                if (nextButton) {
                    nextButton.disabled = false;
                    nextButton.textContent = '发送';
                }
            }
        }

        async function deleteMemberDynamicComment(postId, commentId) {
            const normalizedPostId = String(postId || '').trim();
            const normalizedCommentId = String(commentId || '').trim();
            if (!normalizedPostId || !normalizedCommentId) return;
            const confirmed = await confirmMemberDynamicAction('确定要删除这条评论吗？');
            if (!confirmed) return;

            const token = getAppToken ? getAppToken() : '';
            if (!token) {
                showToast('请先在“账号设置”中登录');
                return;
            }
            try {
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                const result = await ipcRenderer.invoke('delete-area48-comment', {
                    token,
                    pa,
                    resourceId: normalizedCommentId
                });
                if (!result?.success) {
                    throw new Error(getResultMessage(result));
                }

                const state = dynamicCommentStateMap.get(normalizedPostId);
                if (state) {
                    state.comments = (state.comments || []).filter(comment => {
                        const id = String(comment.commentId || comment.resourceId || '');
                        return id !== normalizedCommentId;
                    });
                    const currentTotal = Number(state.commentNum);
                    state.commentNum = Number.isFinite(currentTotal)
                        ? Math.max(0, currentTotal - 1)
                        : state.comments.length;
                    state.loading = false;
                    dynamicCommentStateMap.set(normalizedPostId, state);
                    updateDynamicCommentCount(normalizedPostId, state.commentNum);
                    renderMemberDynamicComments(normalizedPostId, state);
                }
                showToast('评论已删除');
            } catch (error) {
                showToast(error.message || '删除评论失败');
            }
        }

        function handleMemberDynamicSearch(keyword) {
            const resultBox = getResultBox();
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
                const name = String(member.ownerName || member.name || '').trim();
                const pinyin = String(member.pinyin || '');
                const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : '';
                return name.includes(keyword)
                    || pinyin.toLowerCase().includes(lowerKeyword)
                    || String(initials).toLowerCase().includes(lowerKeyword);
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
                const memberId = member.id || member.userId || member.ownerId || member.memberId || '';
                const displayName = member.ownerName || member.name || '';

                return `<div class="suggestion-item"
                            onclick="selectMemberDynamicMember('${escapeJsString(displayName)}', '${escapeJsString(memberId)}')"
                            style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight:bold; ${baseStyle}">${escapeHtml(displayName)}</span>
                            <span class="team-tag" style="${baseStyle} ${colorStyle}">${escapeHtml(member.team || member.groupName || '')}</span>
                        </div>`;
            }).join('');
            resultBox.style.display = 'block';
        }

        function selectMemberDynamicMember(name, memberId) {
            const input = document.getElementById('member-dynamic-member-input');
            const idInput = document.getElementById('member-dynamic-member-id');
            const resultBox = getResultBox();
            if (input) input.value = name || '';
            if (idInput) idInput.value = memberId || '';
            if (resultBox) resultBox.style.display = 'none';
            if (memberId && typeof window.syncWebMemberDynamicRoute === 'function') {
                window.syncWebMemberDynamicRoute(memberId);
            }
        }

        async function openMemberDynamicById(memberId) {
            const normalizedMemberId = String(memberId || '').trim();
            if (!/^\d{1,32}$/.test(normalizedMemberId)) return false;

            if (!getMemberDataLoaded() && typeof loadMemberData === 'function') {
                try {
                    await loadMemberData();
                } catch (error) {
                    console.warn('按成员 ID 打开动态时加载成员资料失败:', error);
                }
            }

            const memberList = Array.isArray(getMemberData()) ? getMemberData() : [];
            const member = memberList.find(item => [
                item?.id,
                item?.userId,
                item?.ownerId,
                item?.memberId
            ].some(value => String(value || '') === normalizedMemberId));
            const displayName = String(member?.ownerName || member?.name || '').trim();
            selectMemberDynamicMember(displayName, normalizedMemberId);
            setTimeout(() => fetchMemberDynamic(), 0);
            return true;
        }

        async function fetchMemberDynamic() {
            const container = document.getElementById('member-dynamic-result-container');
            const ownerId = getMemberOwnerIdFromInput();
            const token = getAppToken ? getAppToken() : '';
            if (!token) {
                showToast('请先在“账号设置”中登录');
                return;
            }
            if (!ownerId) {
                showToast('请先搜索并选择成员');
                return;
            }
            if (typeof window.syncWebMemberDynamicRoute === 'function') {
                window.syncWebMemberDynamicRoute(ownerId);
            }
            if (!container || isFetchingDynamic) return;

            isFetchingDynamic = true;
            const button = document.getElementById('btn-member-dynamic-query');
            const originalText = button?.innerText || '';
            if (button) {
                button.disabled = true;
                button.innerText = '加载中';
            }
            currentDynamicNextTime = 0;
            dynamicCommentStateMap.clear();
            if (dynamicPostStatsObserver) dynamicPostStatsObserver.disconnect();
            container.className = '';
            container.innerHTML = '<div class="empty-state">正在读取成员动态...</div>';

            try {
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                let hasRendered = false;
                const seenCursors = new Set();

                for (let page = 0; page < 100; page += 1) {
                    const cursor = currentDynamicNextTime || 0;
                    if (cursor && seenCursors.has(String(cursor))) break;
                    seenCursors.add(String(cursor));

                    const result = await ipcRenderer.invoke('fetch-member-dynamic', {
                        token,
                        pa,
                        ownerId,
                        nextTime: cursor
                    });

                    if (!result?.success || !result.content) {
                        throw new Error(getResultMessage(result));
                    }

                    const list = normalizeDynamicList(result.content);
                    currentDynamicNextTime = result.content.nextTime || 0;

                    if (!hasRendered) {
                        container.replaceChildren();
                        container.className = 'member-weibo-list member-dynamic-list';
                    }

                    if (!list.length) break;

                    renderDynamicItems(list, container);
                    hasRendered = true;

                    if (!currentDynamicNextTime || String(currentDynamicNextTime) === String(cursor)) break;
                    await new Promise(resolve => setTimeout(resolve, 180));
                }

                if (!hasRendered) {
                    container.innerHTML = '<div class="empty-state">该成员暂无动态</div>';
                }
            } catch (error) {
                container.innerHTML = `<div class="placeholder-tip"><h3>发生错误</h3><p>${escapeHtml(error.message || error)}</p></div>`;
            } finally {
                isFetchingDynamic = false;
                if (button) {
                    button.disabled = false;
                    button.innerText = originalText;
                }
            }
        }

        function setupDynamicEventDelegation(container) {
            if (container.dataset.dynamicDelegationReady) return;
            container.dataset.dynamicDelegationReady = '1';

            container.addEventListener('click', function (event) {
                const imageBtn = event.target.closest('.member-weibo-image-btn');
                if (!imageBtn) return;
                event.stopPropagation();
                const url = imageBtn.getAttribute('data-url');
                if (url && typeof openImageModal === 'function') openImageModal(url);
            });
        }

        function renderDynamicItems(list, container) {
            setupDynamicEventDelegation(container);
            container.className = 'member-weibo-list member-dynamic-list';

            const fragment = document.createDocumentFragment();
            list.forEach(item => fragment.appendChild(buildDynamicCard(item)));
            container.appendChild(fragment);
            observeDynamicPostStats(container);
        }

        function buildDynamicCard(item) {
            const ext = parseExtInfo(item);
            const { postId, viewCount, likeCount, commentCount } = getDynamicPostMeta(item, ext);
            const images = Array.isArray(ext.coverUrlList)
                ? ext.coverUrlList
                : (ext.coverUrl ? [ext.coverUrl] : []);
            const displayName = ext.user?.nickname || getMemberName() || '成员';
            const avatar = normalize48Url(ext.user?.avatar || '');
            const dateText = formatTime(item.msgTime || ext.createAt);
            const title = stripHtml(ext.title || '');
            const rawContent = ext.content || ext.previewText || item.bodys || '';

            const card = document.createElement('article');
            card.className = 'member-weibo-card member-dynamic-card';
            if (postId) {
                card.id = `member-dynamic-card-${postId}`;
                card.dataset.memberDynamicPostId = postId;
            }
            card.innerHTML = `
                <div class="member-weibo-head">
                    <img class="member-weibo-avatar" src="${escapeHtml(avatar || './icon.png')}" loading="lazy" decoding="async" onerror="this.src='./icon.png'" alt="${escapeHtml(displayName)}">
                    <div class="member-weibo-meta">
                        <div class="member-weibo-name">${escapeHtml(displayName)}</div>
                        <div class="member-weibo-time">${escapeHtml(dateText)}</div>
                    </div>
                </div>
                ${title ? `<div class="member-dynamic-title">${escapeHtml(title)}</div>` : ''}
                <div class="member-weibo-text">${renderDynamicContent(rawContent)}</div>
                ${images.length ? `
                    <div class="member-weibo-images member-weibo-images-${Math.min(images.length, 4)}">
                        ${images.slice(0, 9).map((url, index) => {
                            const fullUrl = normalize48Url(url);
                            const thumbUrl = typeof getOptimizedThumbUrl === 'function' ? getOptimizedThumbUrl(fullUrl) : fullUrl;
                            return `<button class="member-weibo-image-btn" data-url="${escapeHtml(fullUrl)}" aria-label="查看动态图片 ${index + 1}">
                                <img class="member-weibo-thumb" src="${escapeHtml(thumbUrl)}" loading="lazy" decoding="async" alt="">
                            </button>`;
                        }).join('')}
                    </div>
                ` : ''}
                ${postId ? `
                    <div class="community-post-stats member-dynamic-stats">
                        <span>浏览 <span class="member-dynamic-view-count">${viewCount === null ? '--' : escapeHtml(formatDynamicNumber(viewCount))}</span></span>
                        <span>点赞 <span class="member-dynamic-like-count">${likeCount === null ? '--' : escapeHtml(formatDynamicNumber(likeCount))}</span></span>
                        <button id="member-dynamic-comment-toggle-${escapeHtml(postId)}" class="community-comment-toggle" onclick="toggleMemberDynamicComments('${escapeJsString(postId)}')">
                            评论 <span class="member-dynamic-comment-count">${commentCount === null ? '--' : escapeHtml(formatDynamicNumber(commentCount))}</span>
                        </button>
                    </div>
                    <div id="member-dynamic-comments-${escapeHtml(postId)}" class="community-comments-panel"></div>
                ` : ''}
            `;
            return card;
        }

        bindMemberDynamicSearchDismiss();

        return {
            handleMemberDynamicSearch,
            selectMemberDynamicMember,
            openMemberDynamicById,
            fetchMemberDynamic,
            toggleMemberDynamicComments,
            loadMoreMemberDynamicComments,
            sendMemberDynamicComment,
            deleteMemberDynamicComment
        };
    };
})();
