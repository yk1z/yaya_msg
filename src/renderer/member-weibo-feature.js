(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createMemberWeiboFeature = function createMemberWeiboFeature(deps) {
        const {
            getAppToken,
            getMemberData,
            getMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle,
            getOptimizedThumbUrl,
            ipcRenderer,
            showToast,
            openExternal,
            openImageModal
        } = deps;

        let currentWeiboNextTime = 0;
        let isFetchingWeibo = false;
        let isWeiboAutoLoading = false;
        let weiboRenderToken = 0;
        let weiboAppendFrame = 0;
        let weiboThumbObserver = null;
        let activeWeiboThumbLoads = 0;
        const weiboThumbQueue = [];
        const weiboQueuedThumbs = new WeakSet();
        const WEIBO_THUMB_CONCURRENCY = 3;
        const EMPTY_IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

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

        function normalizeWeiboJumpUrl(ext) {
            const candidates = [
                ext?.jumpPath,
                ext?.url,
                ext?.schemeUrl,
                ext?.weiboUrl,
                ext?.shareUrl
            ].map(value => String(value || '').trim()).filter(Boolean);

            for (const value of candidates) {
                if (/^https?:\/\//i.test(value)) return value;
                if (/^(?:m\.)?weibo\.cn\//i.test(value)) return `https://${value}`;
                if (/^\/(?:status|detail)\//i.test(value)) return `https://m.weibo.cn${value}`;
                const statusMatch = value.match(/(?:status|detail)[/?#:]?([A-Za-z0-9]+)/i);
                if (statusMatch && statusMatch[1]) return `https://m.weibo.cn/status/${statusMatch[1]}`;
            }

            const id = String(ext?.id || '').trim();
            if (/^\d{6,}$/.test(id)) return `https://m.weibo.cn/status/${id}`;

            return '';
        }

        function getResultBox() {
            return document.getElementById('member-weibo-search-results');
        }

        function getMemberId() {
            return String(document.getElementById('member-weibo-member-id')?.value || '').trim();
        }

        function getMemberName() {
            return String(document.getElementById('member-weibo-member-input')?.value || '').trim();
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

        function bindMemberWeiboSearchDismiss() {
            document.addEventListener('click', (event) => {
                const resultBox = getResultBox();
                if (!resultBox || window.getComputedStyle(resultBox).display === 'none') return;

                const input = document.getElementById('member-weibo-member-input');
                if ((input && input.contains(event.target)) || resultBox.contains(event.target)) return;

                resultBox.style.display = 'none';
            });
        }

        function formatTime(value) {
            const date = new Date(Number(value) || value || Date.now());
            if (Number.isNaN(date.getTime())) return '';
            const pad = num => String(num).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

        function normalizeWeiboList(content) {
            if (!content || typeof content !== 'object') return [];
            if (Array.isArray(content)) return content;
            return content.message || content.messageList || content.data || [];
        }

        function resetWeiboRenderState(container) {
            if (weiboAppendFrame) {
                cancelAnimationFrame(weiboAppendFrame);
            }

            weiboAppendFrame = 0;
            resetWeiboThumbLoading();

            if (container) {
                container.style.height = '';
                container.style.position = '';
            }
        }

        function resetWeiboThumbLoading() {
            if (weiboThumbObserver) {
                weiboThumbObserver.disconnect();
            }

            weiboThumbQueue.length = 0;
            activeWeiboThumbLoads = 0;
        }

        function getWeiboScrollRoot() {
            return document.getElementById('view-member-weibo') || null;
        }

        function ensureWeiboThumbObserver() {
            if (weiboThumbObserver) return weiboThumbObserver;
            if (typeof IntersectionObserver !== 'function') {
                return null;
            }

            weiboThumbObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    weiboThumbObserver.unobserve(entry.target);
                    enqueueWeiboThumb(entry.target);
                });
            }, {
                root: getWeiboScrollRoot(),
                rootMargin: '1800px 0px',
                threshold: 0.01
            });

            return weiboThumbObserver;
        }

        function observeWeiboThumbs(root, renderToken) {
            const observer = ensureWeiboThumbObserver();
            root.querySelectorAll('img.member-weibo-thumb[data-full-url]').forEach((img) => {
                img.dataset.renderToken = String(renderToken);
                if (observer) {
                    observer.observe(img);
                } else {
                    enqueueWeiboThumb(img);
                }
            });
        }

        function enqueueWeiboThumb(img) {
            if (!img || weiboQueuedThumbs.has(img) || img.dataset.loaded === '1') return;
            weiboQueuedThumbs.add(img);
            weiboThumbQueue.push(img);
            processWeiboThumbQueue();
        }

        function processWeiboThumbQueue() {
            while (activeWeiboThumbLoads < WEIBO_THUMB_CONCURRENCY && weiboThumbQueue.length) {
                const img = weiboThumbQueue.shift();
                if (!img || !img.isConnected || img.dataset.loaded === '1') continue;

                activeWeiboThumbLoads += 1;
                loadWeiboThumb(img)
                    .catch(() => {})
                    .finally(() => {
                        activeWeiboThumbLoads = Math.max(0, activeWeiboThumbLoads - 1);
                        processWeiboThumbQueue();
                    });
            }
        }

        function loadWeiboThumb(img) {
            const fullUrl = String(img.dataset.fullUrl || '').trim();
            const fallbackUrl = String(img.dataset.fallbackUrl || fullUrl).trim();
            const renderToken = String(img.dataset.renderToken || '');
            if (!fullUrl || !img.isConnected || renderToken !== String(weiboRenderToken)) return Promise.resolve();

            function loadImageSource(src) {
                if (!src || !img.isConnected || renderToken !== String(weiboRenderToken)) {
                    return Promise.resolve(false);
                }

                return new Promise((resolve) => {
                    let done = false;
                    const timer = setTimeout(() => finish(false), 25000);
                    function finish(success) {
                        if (done) return;
                        done = true;
                        clearTimeout(timer);
                        img.onload = null;
                        img.onerror = null;
                        resolve(success);
                    }

                    img.onload = () => finish(true);
                    img.onerror = () => finish(false);
                    img.src = src;
                });
            }

            return (async () => {
                const sources = [];
                if (ipcRenderer?.invoke && window.desktop?.platform !== 'web') {
                    try {
                        const cached = await ipcRenderer.invoke('cache-image-thumbnail', {
                            url: fullUrl,
                            width: 520
                        });
                        if (cached?.success && cached.url) {
                            sources.push(cached.url);
                        }
                    } catch (error) {
                    }
                }

                [fallbackUrl, fullUrl].forEach((source) => {
                    if (source && !sources.includes(source)) {
                        sources.push(source);
                    }
                });

                for (const source of sources) {
                    const success = await loadImageSource(source);
                    if (success) {
                        img.dataset.loaded = '1';
                        img.removeAttribute('data-loading');
                        return;
                    }
                }

                let settled = false;

                function finish(success) {
                    if (settled) return;
                    settled = true;
                    img.dataset.loaded = '1';
                    if (!success) img.dataset.failed = '1';
                    img.removeAttribute('data-loading');
                }

                if (ipcRenderer?.invoke
                    && window.desktop?.platform !== 'web'
                    && img.isConnected
                    && renderToken === String(weiboRenderToken)) {
                    try {
                        const result = await ipcRenderer.invoke('fetch-remote-image-data-url', { url: fullUrl });
                        if (result?.success && result.dataUrl) {
                            const success = await loadImageSource(result.dataUrl);
                            finish(success);
                            return;
                        }
                    } catch (error) {
                    }
                }

                finish(false);
            })();
        }

        function openWeiboUrl(url) {
            const target = String(url || '').trim();
            if (!target) return;
            if (!/^https?:\/\//i.test(target)) {
                showToast('这条微博没有可打开的原文链接');
                return;
            }
            try {
                if (typeof openExternal === 'function') {
                    openExternal(target);
                } else {
                    window.open(target, '_blank');
                }
            } catch (error) {
                window.open(target, '_blank');
            }
        }

        function waitForPaReady(timeoutMs = 5000) {
            if (typeof window.getPA !== 'function') {
                return Promise.resolve(null);
            }

            const firstPa = window.getPA();
            if (firstPa) {
                return Promise.resolve(firstPa);
            }

            return new Promise(resolve => {
                const startedAt = Date.now();
                const timer = setInterval(() => {
                    const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                    if (pa || Date.now() - startedAt >= timeoutMs) {
                        clearInterval(timer);
                        resolve(pa || null);
                    }
                }, 100);
            });
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

        function handleMemberWeiboSearch(keyword) {
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
                const memberId = member.id || member.userId || member.ownerId || '';
                const displayName = member.ownerName || member.name || '';

                return `<div class="suggestion-item"
                            onclick="selectMemberWeiboMember('${escapeJsString(displayName)}', '${escapeJsString(memberId)}')"
                            style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight:bold; ${baseStyle}">${escapeHtml(displayName)}</span>
                            <span class="team-tag" style="${baseStyle} ${colorStyle}">${escapeHtml(member.team || member.groupName || '')}</span>
                        </div>`;
            }).join('');
            resultBox.style.display = 'block';
        }

        function selectMemberWeiboMember(name, memberId) {
            const input = document.getElementById('member-weibo-member-input');
            const idInput = document.getElementById('member-weibo-member-id');
            const resultBox = getResultBox();
            if (input) input.value = name || '';
            if (idInput) idInput.value = memberId || '';
            if (resultBox) resultBox.style.display = 'none';
        }

        async function fetchAllMemberWeibo() {
            const button = document.getElementById('btn-member-weibo-all');
            if (isWeiboAutoLoading) {
                isWeiboAutoLoading = false;
                if (button) {
                    button.innerText = '加载全部';
                    button.style.background = '';
                    button.style.color = '';
                }
                return;
            }

            isWeiboAutoLoading = true;
            if (button) {
                button.innerText = '停止加载';
                button.style.background = '#ff4d4f';
                button.style.color = 'white';
            }

            if (!currentWeiboNextTime) {
                await fetchMemberWeibo(false);
            }

            while (isWeiboAutoLoading && currentWeiboNextTime) {
                const previousCursor = currentWeiboNextTime;
                await fetchMemberWeibo(true);
                await new Promise(resolve => setTimeout(resolve, 180));
                if (String(previousCursor) === String(currentWeiboNextTime)) break;
            }

            isWeiboAutoLoading = false;
            if (button) {
                button.innerText = '加载全部';
                button.style.background = '';
                button.style.color = '';
            }
        }

        async function fetchMemberWeibo(isLoadMore) {
            const container = document.getElementById('member-weibo-result-container');
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
            if (!container || isFetchingWeibo) return;

            isFetchingWeibo = true;
            if (!isLoadMore) {
                currentWeiboNextTime = 0;
                weiboRenderToken += 1;
                resetWeiboRenderState(container);
                container.className = '';
                container.innerHTML = '<div class="empty-state">正在读取成员微博...</div>';
            }

            try {
                const pa = await waitForPaReady();
                if (!pa) {
                    if (!isLoadMore) {
                        container.innerHTML = '<div class="placeholder-tip"><h3>加载失败</h3><p>SDK 还没加载完成，请稍后再试</p></div>';
                    }
                    return;
                }

                const result = await ipcRenderer.invoke('fetch-member-weibo', {
                    token,
                    pa,
                    ownerId,
                    nextTime: currentWeiboNextTime || 0
                });

                if (!result?.success || !result.content) {
                    if (!isLoadMore) {
                        container.innerHTML = `<div class="placeholder-tip"><h3>加载失败</h3><p>${escapeHtml(getResultMessage(result))}</p></div>`;
                    }
                    return;
                }

                const list = normalizeWeiboList(result.content);
                currentWeiboNextTime = result.content.nextTime || 0;

                if (!isLoadMore) {
                    container.innerHTML = '';
                    container.className = 'member-weibo-list';
                }

                if (!list.length) {
                    if (!isLoadMore) {
                        container.innerHTML = '<div class="empty-state">该成员暂无微博动态</div>';
                    }
                    return;
                }

                renderWeiboItems(list, container, weiboRenderToken);
            } catch (error) {
                if (!isLoadMore) {
                    container.innerHTML = `<div class="placeholder-tip"><h3>发生错误</h3><p>${escapeHtml(error.message || error)}</p></div>`;
                }
            } finally {
                isFetchingWeibo = false;
            }
        }

        function setupWeiboEventDelegation(container) {
            if (container.dataset.weiboDelegationReady) return;
            container.dataset.weiboDelegationReady = '1';

            container.addEventListener('click', function (event) {
                const imageBtn = event.target.closest('.member-weibo-image-btn');
                if (imageBtn) {
                    event.stopPropagation();
                    const url = imageBtn.getAttribute('data-url');
                    if (url && typeof openImageModal === 'function') openImageModal(url);
                    return;
                }

                const openBtn = event.target.closest('.member-weibo-open-btn');
                if (openBtn) {
                    event.stopPropagation();
                    const url = openBtn.getAttribute('data-jump-path');
                    if (url) openWeiboUrl(url);
                }
            });
        }

        function renderWeiboItems(list, container, renderToken) {
            if (renderToken !== weiboRenderToken) return;
            setupWeiboEventDelegation(container);
            container.className = 'member-weibo-list';

            appendWeiboItemsBatched(list, container, renderToken);
        }

        function appendWeiboItemsBatched(list, container, renderToken) {
            const BATCH_SIZE = 3;
            let index = 0;

            function appendNextBatch() {
                weiboAppendFrame = 0;
                if (renderToken !== weiboRenderToken) return;

                const fragment = document.createDocumentFragment();
                const cards = [];
                const end = Math.min(index + BATCH_SIZE, list.length);
                for (; index < end; index += 1) {
                    const card = buildWeiboCard(list[index]);
                    cards.push(card);
                    fragment.appendChild(card);
                }
                container.appendChild(fragment);
                cards.forEach(card => observeWeiboThumbs(card, renderToken));

                if (index < list.length) {
                    weiboAppendFrame = requestAnimationFrame(appendNextBatch);
                }
            }

            weiboAppendFrame = requestAnimationFrame(appendNextBatch);
        }

        function buildWeiboCard(item) {
            const ext = parseExtInfo(item);
            const images = Array.isArray(ext.coverUrlList)
                ? ext.coverUrlList
                : (ext.coverUrl ? [ext.coverUrl] : []);
            const jumpPath = normalizeWeiboJumpUrl(ext);
            const content = ext.content || item.bodys || '';
            const displayName = ext.user?.nickname || getMemberName() || '成员';
            const avatar = normalize48Url(ext.user?.avatar || '');
            const dateText = formatTime(item.msgTime);

            const card = document.createElement('article');
            card.className = 'member-weibo-card';
            card.innerHTML = `
                <div class="member-weibo-head">
                    <img class="member-weibo-avatar" src="${escapeHtml(avatar || './icon.png')}" loading="lazy" decoding="async" onerror="this.src='./icon.png'" alt="${escapeHtml(displayName)}">
                    <div class="member-weibo-meta">
                        <div class="member-weibo-name">${escapeHtml(displayName)}</div>
                        <div class="member-weibo-time">${escapeHtml(dateText)}</div>
                    </div>
                    ${jumpPath ? `<button class="btn btn-secondary member-weibo-open-btn" data-jump-path="${escapeHtml(jumpPath)}">微博原文</button>` : ''}
                </div>
                <div class="member-weibo-text">${escapeHtml(content || '微博')}</div>
                ${images.length ? `
                    <div class="member-weibo-images member-weibo-images-${Math.min(images.length, 4)}">
                        ${images.slice(0, 9).map((url, index) => {
                            const fullUrl = normalize48Url(url);
                            const thumbUrl = typeof getOptimizedThumbUrl === 'function' ? getOptimizedThumbUrl(fullUrl) : fullUrl;
                            return `<button class="member-weibo-image-btn" data-url="${escapeHtml(fullUrl)}" aria-label="查看微博图片 ${index + 1}">
                                <img class="member-weibo-thumb" src="${EMPTY_IMAGE_SRC}" data-full-url="${escapeHtml(fullUrl)}" data-fallback-url="${escapeHtml(thumbUrl)}" data-loading="1" loading="lazy" decoding="async" alt="">
                            </button>`;
                        }).join('')}
                    </div>
                ` : ''}
            `;
            return card;
        }

        bindMemberWeiboSearchDismiss();

        return {
            handleMemberWeiboSearch,
            selectMemberWeiboMember,
            fetchAllMemberWeibo,
            fetchMemberWeibo
        };
    };
})();
