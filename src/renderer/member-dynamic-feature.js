(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createMemberDynamicFeature = function createMemberDynamicFeature(deps) {
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
            openImageModal
        } = deps;

        let currentDynamicNextTime = 0;
        let isFetchingDynamic = false;

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

        function stripHtml(value) {
            const html = String(value || '').replace(/<br\s*\/?>/gi, '\n');
            const div = document.createElement('div');
            div.innerHTML = html;
            return (div.textContent || div.innerText || '').trim();
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
                    parts.push(`<span class="member-dynamic-mention">${escapeHtml(label)}</span>`);
                    return;
                }
                element.childNodes.forEach(walk);
            };

            div.childNodes.forEach(walk);
            return parts.join('').replace(/\n{3,}/g, '\n\n').trim() || renderDynamicPlainText('动态');
        }

        function normalize48Url(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            if (/^https?:\/\//i.test(raw)) return raw;
            if (raw.includes('48.cn')) return `https://${raw.replace(/^\/+/, '')}`;
            return raw.startsWith('/') ? `https://source3.48.cn${raw}` : `https://source3.48.cn/${raw}`;
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
                const memberId = member.id || member.userId || member.ownerId || '';
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
            if (!container || isFetchingDynamic) return;

            isFetchingDynamic = true;
            const button = document.getElementById('btn-member-dynamic-query');
            const originalText = button?.innerText || '';
            if (button) {
                button.disabled = true;
                button.innerText = '加载中';
            }
            currentDynamicNextTime = 0;
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
                        container.innerHTML = '';
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
        }

        function buildDynamicCard(item) {
            const ext = parseExtInfo(item);
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
            `;
            return card;
        }

        bindMemberDynamicSearchDismiss();

        return {
            handleMemberDynamicSearch,
            selectMemberDynamicMember,
            fetchMemberDynamic
        };
    };
})();
