(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createCommunityFeature = function createCommunityFeature(deps) {
        const {
            getAppToken,
            getCurrentUserId,
            ipcRenderer,
            openImageModal,
            openInBrowser,
            replaceTencentEmoji,
            showToast
        } = deps;

        let nextId = 0;
        let isLoading = false;
        let hasLoadedOnce = false;
        let autoLoadBound = false;
        let feedMode = 'newest';
        let viewMode = 'feed';
        let currentTopic = null;
        const commentStateMap = new Map();
        const postDetailStateMap = new Map();

        function escapeHtml(value) {
            return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char]));
        }

        function escapeJsString(value) {
            return String(value == null ? '' : value)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/\r?\n/g, ' ');
        }

        function normalize48Url(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            if (/^https?:\/\//i.test(raw)) return raw;
            if (raw.includes('48.cn')) return `https://${raw.replace(/^\/+/, '')}`;
            return raw.startsWith('/') ? `https://source3.48.cn${raw}` : `https://source3.48.cn/${raw}`;
        }

        function formatTime(value) {
            const raw = Number(value);
            const timestamp = Number.isFinite(raw)
                ? (raw < 10000000000 ? raw * 1000 : raw)
                : Date.parse(String(value || ''));
            const date = new Date(timestamp);
            if (Number.isNaN(date.getTime())) return '';
            const pad = num => String(num).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }

        function formatCommunityNumber(value) {
            const number = Number(value);
            if (!Number.isFinite(number)) return String(value ?? '0');
            if (number >= 10000) return `${(number / 10000).toFixed(number >= 100000 ? 0 : 1)}万`;
            return String(number);
        }

        function getResultMessage(result) {
            return result?.msg || result?.message || result?.data?.message || result?.data?.msg || '获取社区动态失败';
        }

        function renderTextSegment(value) {
            const escaped = escapeHtml(value);
            return typeof replaceTencentEmoji === 'function' ? replaceTencentEmoji(escaped) : escaped;
        }

        function normalizeRenderedText(value) {
            return String(value || '')
                .replace(/\r\n/g, '\n')
                .replace(/[ \t]+\n/g, '\n')
                .replace(/\n[ \t]+/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        function renderText(value, options = {}) {
            const div = document.createElement('div');
            const parts = [];
            div.innerHTML = String(value || '').replace(/<br\s*\/?>/gi, '\n');

            const walk = node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.nodeValue || '';
                    if (!text.trim() && !text.includes('\n')) return;
                    parts.push(renderTextSegment(text));
                    return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) return;

                const element = node;
                const href = element.getAttribute('href') || '';
                if (element.tagName === 'A' && href.startsWith('post://')) {
                    if (options.keepPostLinks && options.postId) {
                        const label = (element.textContent || '查看更多').trim() || '查看更多';
                        parts.push(`<button type="button" class="community-post-inline-detail" onclick="loadCommunityPostDetails('${escapeJsString(options.postId)}')">${renderTextSegment(label)}</button>`);
                    }
                    return;
                }
                if (element.tagName === 'A' && href.startsWith('snh48://')) {
                    const label = (element.textContent || '').trim();
                    if (label) {
                        parts.push(`<span class="community-post-mention">${renderTextSegment(label)}</span>`);
                    }
                    return;
                }
                if (element.tagName === 'A' && href.startsWith('topic://')) {
                    const label = (element.textContent || '').trim();
                    const topicId = extractCommunityTopicId(href);
                    if (label && topicId) {
                        parts.push(`<button type="button" class="community-post-topic" onclick="openCommunityTopic('${escapeJsString(topicId)}', '${escapeJsString(label.replace(/^#|#$/g, ''))}')">${renderTextSegment(label)}</button>`);
                    } else if (label) {
                        parts.push(`<span class="community-post-topic-text">${renderTextSegment(label)}</span>`);
                    }
                    return;
                }

                element.childNodes.forEach(walk);
            };

            div.childNodes.forEach(walk);
            return normalizeRenderedText(parts.join(''));
        }

        function getArray(value) {
            if (Array.isArray(value)) return value;
            if (!value) return [];
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (_) {
                    return value.split(',').map(item => item.trim()).filter(Boolean);
                }
            }
            return [];
        }

        function getListElement() {
            return document.getElementById('community-feed-list');
        }

        function getScrollElement() {
            return document.querySelector('#view-community .community-scroll-area');
        }

        function updateLoadState() {
            const sentinel = document.getElementById('community-load-sentinel');
            if (!sentinel) return;
            sentinel.textContent = isLoading && hasLoadedOnce ? '加载中' : '';
            sentinel.classList.toggle('is-visible', Boolean(sentinel.textContent));
        }

        function updateFeedTabs() {
            ['recommend', 'newest'].forEach(mode => {
                const button = document.getElementById(`community-tab-${mode}`);
                if (!button) return;
                const isActive = feedMode === mode;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
        }

        function updateFeedTabsVisibility() {
            const tabs = document.querySelector('#view-community .community-feed-tabs');
            if (!tabs) return;
            tabs.classList.toggle('is-hidden', viewMode === 'topic');
        }

        function confirmCommunityAction(text) {
            return new Promise(resolve => {
                const existing = document.querySelector('.confirm-overlay.community-confirm-overlay');
                if (existing) existing.remove();

                const overlay = document.createElement('div');
                overlay.className = 'confirm-overlay community-confirm-overlay';
                overlay.innerHTML = `
                    <div class="confirm-box">
                        <div class="confirm-text">${escapeHtml(text)}</div>
                        <div class="confirm-btns">
                            <button class="confirm-btn cancel" type="button">取消</button>
                            <button class="confirm-btn ok" type="button">确定</button>
                        </div>
                    </div>
                `;

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

        function normalizeCommunityTopicArray(value) {
            const ids = String(value || '')
                .split(/[\s,，、]+/)
                .map(item => item.replace(/\D/g, '').trim())
                .filter(Boolean);
            const uniqueIds = [...new Set(ids)];
            return uniqueIds.length ? `${uniqueIds.join(',')},` : '';
        }

        function buildCommunityPostContent(value) {
            const lines = String(value || '').replace(/\r\n/g, '\n').trim().split('\n');
            return lines.map(line => {
                const text = line.trimEnd();
                return text.trim() ? `<span>${escapeHtml(text)}</span>` : '';
            }).join('<br />');
        }

        function closeCommunityPostComposer() {
            document.querySelector('.community-compose-overlay')?.remove();
        }

        function openCommunityPostComposer() {
            const token = typeof getAppToken === 'function' ? getAppToken() : '';
            if (!token) {
                showToast('请先登录账号');
                return;
            }
            closeCommunityPostComposer();

            const topicId = viewMode === 'topic' && currentTopic?.id ? currentTopic.id : '';
            const topicName = currentTopic?.info?.name || currentTopic?.name || '';
            const overlay = document.createElement('div');
            overlay.className = 'community-compose-overlay';
            overlay.tabIndex = -1;
            overlay.innerHTML = `
                <div class="community-compose-dialog" role="dialog" aria-modal="true" aria-label="发布社区动态">
                    <div class="community-compose-header">
                        <div>
                            <div class="community-compose-title">发布动态</div>
                            ${topicId ? `<div class="community-compose-subtitle">话题：${escapeHtml(topicName ? `#${topicName}` : topicId)}</div>` : ''}
                        </div>
                        <button class="community-compose-close" type="button" aria-label="关闭">×</button>
                    </div>
                    <div class="community-compose-body">
                        <label class="community-compose-field">
                            <span>标题</span>
                            <input id="community-compose-title-input" class="community-compose-input" type="text" maxlength="60" placeholder="可不填">
                        </label>
                        <label class="community-compose-field">
                            <span>话题 ID</span>
                            <input id="community-compose-topic-input" class="community-compose-input" type="text" value="${escapeHtml(topicId)}" placeholder="多个话题用逗号分隔">
                        </label>
                        <label class="community-compose-field">
                            <span>正文</span>
                            <textarea id="community-compose-content-input" class="community-compose-textarea" maxlength="5000" placeholder="写点什么"></textarea>
                        </label>
                    </div>
                    <div class="community-compose-footer">
                        <button class="community-compose-cancel" type="button">取消</button>
                        <button id="community-compose-send" class="community-compose-send" type="button">发布</button>
                    </div>
                </div>
            `;

            overlay.addEventListener('click', event => {
                if (event.target === overlay) closeCommunityPostComposer();
            });
            overlay.addEventListener('keydown', event => {
                if (event.key === 'Escape') closeCommunityPostComposer();
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    sendCommunityPost();
                }
            });
            overlay.querySelector('.community-compose-close')?.addEventListener('click', closeCommunityPostComposer);
            overlay.querySelector('.community-compose-cancel')?.addEventListener('click', closeCommunityPostComposer);
            overlay.querySelector('#community-compose-send')?.addEventListener('click', sendCommunityPost);
            document.body.appendChild(overlay);
            setTimeout(() => overlay.querySelector('#community-compose-content-input')?.focus(), 0);
        }

        async function sendCommunityPost() {
            const titleInput = document.getElementById('community-compose-title-input');
            const topicInput = document.getElementById('community-compose-topic-input');
            const contentInput = document.getElementById('community-compose-content-input');
            const sendButton = document.getElementById('community-compose-send');
            const rawContent = String(contentInput?.value || '').trim();
            if (!rawContent) {
                showToast('请输入正文');
                return;
            }
            const token = typeof getAppToken === 'function' ? getAppToken() : '';
            if (!token) {
                showToast('请先登录账号');
                return;
            }
            if (sendButton) {
                sendButton.disabled = true;
                sendButton.textContent = '发布中';
            }

            try {
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                const result = await ipcRenderer.invoke('create-area48-post', {
                    token,
                    pa,
                    title: String(titleInput?.value || '').trim(),
                    topicArray: normalizeCommunityTopicArray(topicInput?.value || ''),
                    content: buildCommunityPostContent(rawContent)
                });
                if (!result?.success) {
                    throw new Error(getResultMessage(result));
                }

                closeCommunityPostComposer();
                showToast('发布成功');
                if (viewMode === 'topic' && currentTopic) {
                    currentTopic.sort = 'newest';
                    return loadCommunityTopicPosts({ reset: true });
                }
                feedMode = 'newest';
                updateFeedTabs();
                return loadCommunityFeed({ reset: true });
            } catch (error) {
                showToast(error.message || '发布动态失败');
            } finally {
                const nextButton = document.getElementById('community-compose-send');
                if (nextButton) {
                    nextButton.disabled = false;
                    nextButton.textContent = '发布';
                }
            }
        }

        function maybeAutoLoadCommunityFeed() {
            const scrollEl = getScrollElement();
            if (!scrollEl || isLoading || !nextId || !hasLoadedOnce) return;

            const distanceToBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
            if (distanceToBottom <= 420) {
                if (viewMode === 'topic') {
                    loadCommunityTopicPosts({ reset: false });
                } else {
                    loadCommunityFeed({ reset: false });
                }
            }
        }

        function bindCommunityAutoLoad() {
            if (autoLoadBound) return;
            const scrollEl = getScrollElement();
            if (!scrollEl) return;
            scrollEl.addEventListener('scroll', maybeAutoLoadCommunityFeed, { passive: true });
            autoLoadBound = true;
        }

        function openCommunityImage(url) {
            if (!url) return;
            if (typeof openImageModal === 'function') {
                openImageModal(url);
                return;
            }
            if (typeof openInBrowser === 'function') openInBrowser(url);
        }

        function extractCommunityTopicId(...values) {
            const patterns = [
                /(?:topicId|topic_id)=([0-9]+)/i,
                /topicdetail\?id=([0-9]+)/i,
                /topic:\/\/([0-9]+)/i,
                /topic(?:detail|Detail)?[/:?=]+([0-9]+)/i
            ];
            for (const value of values) {
                const raw = String(value || '').trim();
                if (!raw) continue;
                if (/^[0-9]{8,}$/.test(raw)) return raw;
                const candidates = [raw];
                try {
                    candidates.push(decodeURIComponent(raw));
                } catch (_) {
                    // Keep the original raw value when it is not URI encoded.
                }
                for (const candidate of candidates) {
                    for (const pattern of patterns) {
                        const match = candidate.match(pattern);
                        if (match?.[1]) return match[1];
                    }
                }
            }
            return '';
        }

        function openCommunityJump(path, title = '', topicId = '') {
            const target = String(path || '').trim();
            const resolvedTopicId = topicId || extractCommunityTopicId(target);
            if (resolvedTopicId) {
                openCommunityTopic(resolvedTopicId, title);
                return;
            }
            if (!target) return;
            if (/^https?:\/\//i.test(target) && typeof openInBrowser === 'function') {
                openInBrowser(target);
                return;
            }
            showToast('这个入口需要在口袋48内打开');
        }

        function renderBanner(item) {
            const banners = Array.isArray(item?.data) ? item.data : [];
            if (!banners.length) return '';
            return `
                <section class="community-card community-banner-card">
                    <div class="community-section-title">推荐</div>
                    <div class="community-banner-list">
                        ${banners.map(banner => {
                            const imageUrl = normalize48Url(banner.imgUrl || banner.imagePath || banner.imgPath || banner.image || banner.url);
                            const title = banner.title || banner.name || '';
                            const jumpPath = banner.jumpPath || banner.jumpUrl || banner.linkUrl || banner.url || '';
                            const topicId = extractCommunityTopicId(
                                banner.topicId,
                                banner.resourceId,
                                banner.relationId,
                                jumpPath
                            );
                            return `
                                <button class="community-banner-item" onclick="openCommunityJump('${escapeJsString(jumpPath)}', '${escapeJsString(title)}', '${escapeJsString(topicId)}')">
                                    ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" loading="lazy">` : ''}
                                    <span>${escapeHtml(title)}</span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                </section>
            `;
        }

        function renderHotTopics(item) {
            const topics = Array.isArray(item?.data) ? item.data : [];
            if (!topics.length) return '';
            return `
                <section class="community-card">
                    <div class="community-section-title">热门话题</div>
                    <div class="community-topic-list">
                        ${topics.map(topic => {
                            const topicId = String(topic.topicId || topic.id || topic.resourceId || '').trim();
                            const topicName = topic.name || topic.title || '话题';
                            return `
                            <button class="community-topic-chip" type="button" ${topicId ? `onclick="openCommunityTopic('${escapeJsString(topicId)}', '${escapeJsString(topicName)}')"` : ''}>
                                <div class="community-topic-name">#${escapeHtml(topic.name || topic.title || '话题')}</div>
                                <div class="community-topic-meta">${escapeHtml(topic.description || '')}</div>
                            </button>
                        `;
                        }).join('')}
                    </div>
                </section>
            `;
        }

        function renderPost(item) {
            const data = item?.data || {};
            const post = data.postsInfo || data.post || data || {};
            const user = post.user || data.user || {};
            const name = user.realNickName || user.nickName || user.nickname || user.starName || user.name || '未知用户';
            const avatar = normalize48Url(user.avatar || user.headImg || user.headImgUrl || user.icon);
            const title = post.title || '';
            const rawText = post.previewText || post.postContent || post.content || '';
            const postId = String(post.postId || data.postId || '').trim();
            const hasInlineDetailLink = postId && String(rawText).includes('post://');
            const text = renderText(rawText, { keepPostLinks: true, postId });
            const previewPlainText = renderText(post.previewText || '');
            const contentPlainText = renderText(post.postContent || '');
            const time = formatTime(post.createAt || post.ctime || post.time);
            const images = getArray(post.previewImg || post.imgs || post.images || post.imageList)
                .map(image => normalize48Url(image.imgUrl || image.imagePath || image.imgPath || image.url || image))
                .filter(Boolean)
                .slice(0, 9);
            const stats = [
                ['浏览', post.viewCount],
                ['点赞', post.likeCount]
            ].filter(([, value]) => value !== undefined && value !== null && String(value) !== '');
            const commentCount = post.commentCount || data.commentCount || 0;
            const shouldShowDetailButton = postId && !hasInlineDetailLink && (
                String(post.previewText || '').includes('post://')
                || String(post.previewText || '').includes('查看更多')
                || (previewPlainText && contentPlainText && contentPlainText.length > previewPlainText.length + 8)
                || String(post.previewText || '').length > 260
            );

            return `
                <article class="community-card community-post-card" data-post-id="${escapeHtml(postId)}">
                    <div class="community-post-head">
                        ${avatar
                            ? `<img class="community-avatar" src="${escapeHtml(avatar)}" alt="">`
                            : '<div class="community-avatar community-avatar-placeholder"></div>'}
                        <div class="community-post-meta">
                            <div class="community-post-name">${escapeHtml(name)}</div>
                            <div class="community-post-time">${escapeHtml(time)}</div>
                        </div>
                    </div>
                    ${title ? `<div class="community-post-title">${escapeHtml(title)}</div>` : ''}
                    ${text ? `<div id="community-post-text-${escapeHtml(postId)}" class="community-post-text">${text}</div>` : ''}
                    ${shouldShowDetailButton ? `
                        <button id="community-post-detail-${escapeHtml(postId)}" class="community-post-detail-btn" onclick="loadCommunityPostDetails('${escapeJsString(postId)}')">
                            查看更多
                        </button>
                    ` : ''}
                    ${images.length ? `
                        <div class="community-image-grid community-image-count-${Math.min(images.length, 3)}">
                            ${images.map(url => `
                                <button class="community-image-button" onclick="openCommunityImage('${escapeJsString(url)}')">
                                    <img src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.closest('.community-image-button')?.remove()">
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                    ${(stats.length || postId) ? `
                        <div class="community-post-stats">
                            ${stats.map(([label, value]) => `<span>${escapeHtml(label)} ${escapeHtml(formatCommunityNumber(value))}</span>`).join('')}
                            ${postId ? `
                                <button class="community-comment-toggle" onclick="toggleCommunityComments('${escapeJsString(postId)}')">
                                    评论 ${escapeHtml(formatCommunityNumber(commentCount))}
                                </button>
                            ` : ''}
                        </div>
                    ` : ''}
                    ${postId ? `<div id="community-comments-${escapeHtml(postId)}" class="community-comments-panel"></div>` : ''}
                </article>
            `;
        }

        function getCommentUserMap(content) {
            const map = new Map();
            const users = Array.isArray(content?.commentUserList) ? content.commentUserList : [];
            users.forEach(user => {
                map.set(String(user.userId || ''), user);
            });
            return map;
        }

        function renderCommunityComments(postId, state) {
            const panel = document.getElementById(`community-comments-${postId}`);
            if (!panel) return;
            const comments = Array.isArray(state.comments) ? state.comments : [];

            const html = comments.map(comment => {
                const user = state.userMap.get(String(comment.userId || '')) || {};
                const avatar = normalize48Url(user.avatar || user.headImg || user.icon);
                const name = user.nickname || user.realNickName || user.name || String(comment.userId || '用户');
                const text = renderText(comment.msg || comment.comment || '');
                const commentId = String(comment.commentId || comment.resourceId || '').trim();
                const currentUserId = typeof getCurrentUserId === 'function' ? String(getCurrentUserId() || '') : '';
                const canDelete = commentId && currentUserId && String(comment.userId || '') === currentUserId;
                return `
                    <div class="community-comment-item">
                        ${avatar
                            ? `<img class="community-comment-avatar" src="${escapeHtml(avatar)}" alt="">`
                            : '<div class="community-comment-avatar community-avatar-placeholder"></div>'}
                        <div class="community-comment-body">
                            <div class="community-comment-head">
                                <span class="community-comment-name">${escapeHtml(name)}</span>
                                <span class="community-comment-time">${escapeHtml(formatTime(comment.ctime))}</span>
                                ${canDelete ? `
                                    <button class="community-comment-delete" onclick="deleteCommunityComment('${escapeJsString(postId)}', '${escapeJsString(commentId)}')">删除</button>
                                ` : ''}
                            </div>
                            <div class="community-comment-text">${text}</div>
                        </div>
                    </div>
                `;
            }).join('');

            panel.innerHTML = `
                <div class="community-comment-compose">
                    <input id="community-comment-input-${escapeHtml(postId)}" class="community-comment-input" type="text" placeholder="写评论" onkeydown="if(event.key==='Enter') sendCommunityComment('${escapeJsString(postId)}')">
                    <button id="community-comment-send-${escapeHtml(postId)}" class="community-comment-send" onclick="sendCommunityComment('${escapeJsString(postId)}')">发送</button>
                </div>
                ${comments.length ? `<div class="community-comments-list">${html}</div>` : `<div class="community-comments-empty">${state.loading ? '正在读取评论...' : '暂无评论'}</div>`}
                ${state.hasMore ? `
                    <button class="community-comments-more" onclick="loadMoreCommunityComments('${escapeJsString(postId)}')">
                        ${state.loading ? '加载中' : '查看更多评论'}
                    </button>
                ` : ''}
            `;
            panel.classList.add('is-open');
        }

        async function loadCommunityComments(postId, options = {}) {
            const token = typeof getAppToken === 'function' ? getAppToken() : '';
            if (!token) {
                showToast('请先登录账号');
                return;
            }
            const reset = options.reset !== false;
            const existing = commentStateMap.get(postId) || {
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
            commentStateMap.set(postId, state);
            renderCommunityComments(postId, state);

            try {
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                const result = await ipcRenderer.invoke('fetch-area48-comments', {
                    token,
                    pa,
                    resourceId: postId,
                    next: reset ? 0 : state.next
                });
                if (!result?.success || !result.content) {
                    throw new Error(getResultMessage(result));
                }

                const content = result.content || {};
                const fetchedComments = Array.isArray(content.commentList) ? content.commentList : [];
                const nextUserMap = getCommentUserMap(content);
                state.userMap.forEach((user, id) => nextUserMap.set(id, user));
                const nextComments = reset
                    ? fetchedComments
                    : state.comments.concat(fetchedComments);
                const seenCommentIds = new Set();
                state.comments = nextComments.filter(comment => {
                    const key = String(comment.commentId || `${comment.userId || ''}-${comment.ctime || ''}-${comment.msg || ''}`);
                    if (seenCommentIds.has(key)) return false;
                    seenCommentIds.add(key);
                    return true;
                });
                state.userMap = nextUserMap;
                state.next = content.next || 0;
                state.hasMore = Boolean(state.next) && fetchedComments.length > 0;
                state.loading = false;
                commentStateMap.set(postId, state);
                renderCommunityComments(postId, state);
            } catch (error) {
                state.loading = false;
                commentStateMap.set(postId, state);
                renderCommunityComments(postId, state);
                showToast(error.message || '获取评论失败');
            }
        }

        function toggleCommunityComments(postId) {
            const panel = document.getElementById(`community-comments-${postId}`);
            if (!panel) return;
            if (panel.classList.contains('is-open')) {
                panel.classList.remove('is-open');
                panel.innerHTML = '';
                return;
            }
            loadCommunityComments(postId, { reset: true });
        }

        function loadMoreCommunityComments(postId) {
            loadCommunityComments(postId, { reset: false });
        }

        async function sendCommunityComment(postId) {
            const input = document.getElementById(`community-comment-input-${postId}`);
            const button = document.getElementById(`community-comment-send-${postId}`);
            const commentMsg = String(input?.value || '').trim();
            if (!commentMsg) {
                showToast('请输入评论内容');
                return;
            }
            const token = typeof getAppToken === 'function' ? getAppToken() : '';
            if (!token) {
                showToast('请先登录账号');
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
                    resourceId: postId,
                    commentMsg
                });
                if (!result?.success || !result.content) {
                    throw new Error(getResultMessage(result));
                }

                const content = result.content || {};
                const newComment = content.comment;
                const commentUser = content.commentUser;
                const existing = commentStateMap.get(postId) || {
                    comments: [],
                    userMap: new Map(),
                    next: 0,
                    loading: false
                };
                if (commentUser?.userId) {
                    existing.userMap.set(String(commentUser.userId), commentUser);
                }
                if (newComment) {
                    const newKey = String(newComment.commentId || `${newComment.userId || ''}-${newComment.ctime || ''}-${newComment.msg || ''}`);
                    existing.comments = [
                        newComment,
                        ...existing.comments.filter(comment => {
                            const key = String(comment.commentId || `${comment.userId || ''}-${comment.ctime || ''}-${comment.msg || ''}`);
                            return key !== newKey;
                        })
                    ];
                }
                existing.loading = false;
                commentStateMap.set(postId, existing);
                if (input) input.value = '';
                renderCommunityComments(postId, existing);
                showToast('评论已发送');
            } catch (error) {
                showToast(error.message || '发送评论失败');
            } finally {
                const nextButton = document.getElementById(`community-comment-send-${postId}`);
                if (nextButton) {
                    nextButton.disabled = false;
                    nextButton.textContent = '发送';
                }
            }
        }

        async function deleteCommunityComment(postId, commentId) {
            if (!postId || !commentId) return;
            const confirmed = await confirmCommunityAction('确定要删除这条评论吗？');
            if (!confirmed) return;
            const token = typeof getAppToken === 'function' ? getAppToken() : '';
            if (!token) {
                showToast('请先登录账号');
                return;
            }
            try {
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                const result = await ipcRenderer.invoke('delete-area48-comment', {
                    token,
                    pa,
                    resourceId: commentId
                });
                if (!result?.success) {
                    throw new Error(getResultMessage(result));
                }
                const existing = commentStateMap.get(postId);
                if (existing) {
                    existing.comments = (existing.comments || []).filter(comment => {
                        const id = String(comment.commentId || comment.resourceId || '');
                        return id !== String(commentId);
                    });
                    existing.loading = false;
                    commentStateMap.set(postId, existing);
                    renderCommunityComments(postId, existing);
                }
                showToast('评论已删除');
            } catch (error) {
                showToast(error.message || '删除评论失败');
            }
        }

        async function loadCommunityPostDetails(postId) {
            const textEl = document.getElementById(`community-post-text-${postId}`);
            const button = document.getElementById(`community-post-detail-${postId}`);
            if (!textEl) return;
            const actionButtons = [
                button,
                ...textEl.querySelectorAll('.community-post-inline-detail')
            ].filter(Boolean);
            const cached = postDetailStateMap.get(postId);
            if (cached?.content) {
                textEl.innerHTML = cached.content;
                if (button) button.remove();
                return;
            }
            if (cached?.loading) return;

            const token = typeof getAppToken === 'function' ? getAppToken() : '';
            if (!token) {
                showToast('请先登录账号');
                return;
            }

            postDetailStateMap.set(postId, { loading: true });
            actionButtons.forEach(actionButton => {
                actionButton.disabled = true;
            });

            try {
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                const result = await ipcRenderer.invoke('fetch-area48-post-details', {
                    token,
                    pa,
                    postId
                });
                if (!result?.success || !result.content) {
                    throw new Error(getResultMessage(result));
                }
                const detailPost = result.content.postsInfo || result.content.post || {};
                const fullText = renderText(detailPost.postContent || detailPost.previewText || '');
                if (!fullText) {
                    throw new Error('详情内容为空');
                }
                postDetailStateMap.set(postId, { loading: false, content: fullText });
                textEl.innerHTML = fullText;
                if (button) button.remove();
            } catch (error) {
                postDetailStateMap.set(postId, { loading: false });
                actionButtons.forEach(actionButton => {
                    actionButton.disabled = false;
                });
                showToast(error.message || '获取帖子详情失败');
            }
        }

        function renderCommunityItems(items, append = false) {
            const listEl = getListElement();
            if (!listEl) return;
            const html = items.map(item => {
                const type = String(item?.type || '').toUpperCase();
                if (type === 'BANNER') return renderBanner(item);
                if (type === 'HOTTOPIC') return renderHotTopics(item);
                if (type === 'POSTS') return renderPost(item);
                return '';
            }).filter(Boolean).join('');

            if (!append) listEl.innerHTML = '';
            if (html) {
                listEl.insertAdjacentHTML('beforeend', html);
            } else if (!append) {
                listEl.innerHTML = '<div class="empty-state">暂无社区动态</div>';
            }
        }

        function normalizeCommunityFeedItems(content) {
            if (Array.isArray(content?.list)) return content.list;
            if (Array.isArray(content?.postsInfo)) {
                return content.postsInfo.map(postItem => ({
                    type: 'POSTS',
                    data: postItem
                }));
            }
            return [];
        }

        function normalizeCommunityPostItems(content) {
            const items = Array.isArray(content?.data)
                ? content.data
                : (Array.isArray(content?.postsInfo) ? content.postsInfo : []);
            return items.map(postItem => ({
                type: 'POSTS',
                data: postItem
            }));
        }

        function renderCommunityTopicHeader(topic = {}) {
            const info = topic.info || {};
            const title = info.name || topic.name || '话题';
            const description = info.description || '';
            const imageUrl = normalize48Url(info.imgPath || info.imagePath || info.imgUrl || '');
            return `
                <section class="community-card community-topic-header">
                    <div class="community-topic-header-top">
                        <button class="community-topic-back" type="button" onclick="backToCommunityFeed()">返回</button>
                        <div class="community-topic-header-main">
                            ${imageUrl ? `<img class="community-topic-cover" src="${escapeHtml(imageUrl)}" alt="">` : ''}
                            <div class="community-topic-title-wrap">
                                <div class="community-topic-title">#${escapeHtml(title)}</div>
                                ${description ? `<div class="community-topic-desc">${escapeHtml(description)}</div>` : ''}
                                <div class="community-topic-counts">
                                    ${info.read ? `<span>浏览 ${escapeHtml(formatCommunityNumber(info.read))}</span>` : ''}
                                    ${info.hot ? `<span>热度 ${escapeHtml(formatCommunityNumber(info.hot))}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="community-topic-tabs">
                        <button class="community-topic-tab ${topic.sort === 'hot' ? 'is-active' : ''}" type="button" onclick="switchCommunityTopicSort('hot')">热门</button>
                        <button class="community-topic-tab ${topic.sort === 'newest' ? 'is-active' : ''}" type="button" onclick="switchCommunityTopicSort('newest')">最新</button>
                    </div>
                </section>
            `;
        }

        function renderCommunityTopicItems(items, append = false) {
            const listEl = getListElement();
            if (!listEl || !currentTopic) return;
            const html = items.map(item => renderPost(item)).filter(Boolean).join('');

            if (!append) {
                listEl.innerHTML = renderCommunityTopicHeader(currentTopic);
            }
            if (html) {
                listEl.insertAdjacentHTML('beforeend', html);
            } else if (!append) {
                listEl.insertAdjacentHTML('beforeend', '<div class="empty-state">暂无话题动态</div>');
            }
        }

        async function loadCommunityFeed(options = {}) {
            const reset = options.reset !== false;
            const listEl = getListElement();
            const token = typeof getAppToken === 'function' ? getAppToken() : '';
            if (!token) {
                showToast('请先登录账号');
                return;
            }
            if (!listEl || isLoading) return;

            isLoading = true;
            if (reset) {
                nextId = 0;
                listEl.innerHTML = '';
            }
            updateLoadState();

            try {
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                const channel = feedMode === 'newest' ? 'fetch-area48-newest' : 'fetch-area48-recommend';
                const result = await ipcRenderer.invoke(channel, {
                    token,
                    pa,
                    nextId: reset ? 0 : nextId
                });

                if (!result?.success || !result.content) {
                    throw new Error(getResultMessage(result));
                }

                const content = result.content || {};
                const items = normalizeCommunityFeedItems(content);
                nextId = content.nextId || 0;
                hasLoadedOnce = true;
                renderCommunityItems(items, !reset);
            } catch (error) {
                if (reset) {
                    listEl.innerHTML = `<div class="placeholder-tip"><h3>读取失败</h3><p>${escapeHtml(error.message || error)}</p></div>`;
                } else {
                    showToast(error.message || '自动加载失败');
                }
            } finally {
                isLoading = false;
                updateLoadState();
                setTimeout(maybeAutoLoadCommunityFeed, 0);
            }
        }

        async function loadCommunityTopicPosts(options = {}) {
            const reset = options.reset !== false;
            const listEl = getListElement();
            const token = typeof getAppToken === 'function' ? getAppToken() : '';
            if (!token) {
                showToast('请先登录账号');
                return;
            }
            if (!listEl || isLoading || !currentTopic?.id) return;

            isLoading = true;
            if (reset) {
                nextId = 0;
                listEl.innerHTML = currentTopic ? renderCommunityTopicHeader(currentTopic) : '';
            }
            updateLoadState();

            try {
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                if (reset) {
                    const infoResult = await ipcRenderer.invoke('fetch-area48-topic-info', {
                        token,
                        pa,
                        topicId: currentTopic.id
                    });
                    if (infoResult?.success && infoResult.content) {
                        currentTopic.info = infoResult.content;
                    }
                }

                const channel = currentTopic.sort === 'newest'
                    ? 'fetch-area48-topic-newest-posts'
                    : 'fetch-area48-topic-hot-posts';
                const result = await ipcRenderer.invoke(channel, {
                    token,
                    pa,
                    topicId: currentTopic.id,
                    nextId: reset ? 0 : nextId,
                    limit: 20
                });

                if (!result?.success || !result.content) {
                    throw new Error(getResultMessage(result));
                }

                const content = result.content || {};
                const items = normalizeCommunityPostItems(content);
                nextId = currentTopic.sort === 'newest' ? (content.nextId || 0) : 0;
                hasLoadedOnce = true;
                renderCommunityTopicItems(items, !reset);
            } catch (error) {
                if (reset) {
                    listEl.innerHTML = `<div class="placeholder-tip"><h3>读取失败</h3><p>${escapeHtml(error.message || error)}</p></div>`;
                } else {
                    showToast(error.message || '自动加载失败');
                }
            } finally {
                isLoading = false;
                updateLoadState();
                setTimeout(maybeAutoLoadCommunityFeed, 0);
            }
        }

        function loadMoreCommunityFeed() {
            if (!nextId) {
                showToast('没有更多了');
                return;
            }
            return viewMode === 'topic'
                ? loadCommunityTopicPosts({ reset: false })
                : loadCommunityFeed({ reset: false });
        }

        function refreshCommunityFeed() {
            return viewMode === 'topic'
                ? loadCommunityTopicPosts({ reset: true })
                : loadCommunityFeed({ reset: true });
        }

        function switchCommunityFeedMode(mode) {
            const nextMode = mode === 'newest' ? 'newest' : 'recommend';
            if (viewMode === 'feed' && feedMode === nextMode && hasLoadedOnce) return Promise.resolve();
            viewMode = 'feed';
            currentTopic = null;
            feedMode = nextMode;
            nextId = 0;
            hasLoadedOnce = false;
            commentStateMap.clear();
            postDetailStateMap.clear();
            updateFeedTabs();
            updateFeedTabsVisibility();
            return loadCommunityFeed({ reset: true });
        }

        function openCommunityTopic(topicId, topicName = '') {
            const id = String(topicId || '').trim();
            if (!id) return Promise.resolve();
            viewMode = 'topic';
            currentTopic = {
                id,
                name: topicName,
                sort: 'hot',
                info: null
            };
            nextId = 0;
            hasLoadedOnce = false;
            commentStateMap.clear();
            postDetailStateMap.clear();
            updateFeedTabsVisibility();
            return loadCommunityTopicPosts({ reset: true });
        }

        function switchCommunityTopicSort(sort) {
            if (!currentTopic) return Promise.resolve();
            const nextSort = sort === 'newest' ? 'newest' : 'hot';
            if (currentTopic.sort === nextSort && hasLoadedOnce) return Promise.resolve();
            currentTopic.sort = nextSort;
            nextId = 0;
            hasLoadedOnce = false;
            commentStateMap.clear();
            postDetailStateMap.clear();
            return loadCommunityTopicPosts({ reset: true });
        }

        function backToCommunityFeed() {
            viewMode = 'feed';
            currentTopic = null;
            nextId = 0;
            hasLoadedOnce = false;
            commentStateMap.clear();
            postDetailStateMap.clear();
            updateFeedTabs();
            updateFeedTabsVisibility();
            return loadCommunityFeed({ reset: true });
        }

        function ensureCommunityFeedLoaded() {
            bindCommunityAutoLoad();
            updateFeedTabs();
            updateFeedTabsVisibility();
            if (!hasLoadedOnce) {
                return loadCommunityFeed({ reset: true });
            }
            setTimeout(maybeAutoLoadCommunityFeed, 0);
            return Promise.resolve();
        }

        window.openCommunityImage = openCommunityImage;
        window.openCommunityJump = openCommunityJump;
        window.toggleCommunityComments = toggleCommunityComments;
        window.loadMoreCommunityComments = loadMoreCommunityComments;
        window.loadCommunityPostDetails = loadCommunityPostDetails;
        window.sendCommunityComment = sendCommunityComment;
        window.deleteCommunityComment = deleteCommunityComment;
        window.switchCommunityFeedMode = switchCommunityFeedMode;
        window.openCommunityTopic = openCommunityTopic;
        window.switchCommunityTopicSort = switchCommunityTopicSort;
        window.backToCommunityFeed = backToCommunityFeed;
        window.openCommunityPostComposer = openCommunityPostComposer;
        window.closeCommunityPostComposer = closeCommunityPostComposer;
        window.sendCommunityPost = sendCommunityPost;

        return {
            ensureCommunityFeedLoaded,
            loadCommunityFeed,
            loadMoreCommunityFeed,
            refreshCommunityFeed,
            switchCommunityFeedMode,
            openCommunityTopic,
            openCommunityPostComposer
        };
    };
}());
