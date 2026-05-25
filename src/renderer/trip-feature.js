(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createTripFeature = function createTripFeature(deps) {
        const {
            getAppToken,
            getMemberData,
            getMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle,
            ipcRenderer,
            showToast,
            openExternal
        } = deps;

        let tripLastTime = '0';
        let tripLoading = false;

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

        function getResultBox() {
            return document.getElementById('trip-search-results');
        }

        function getMemberId() {
            return String(document.getElementById('trip-member-id')?.value || '').trim();
        }

        function bindTripSearchDismiss() {
            document.addEventListener('click', (event) => {
                const resultBox = getResultBox();
                if (!resultBox || window.getComputedStyle(resultBox).display === 'none') return;

                const input = document.getElementById('trip-member-input');
                if ((input && input.contains(event.target)) || resultBox.contains(event.target)) return;

                resultBox.style.display = 'none';
            });
        }

        function normalizeTripList(content) {
            if (!content || typeof content !== 'object') return [];
            if (Array.isArray(content)) return content;
            return content.data || content.list || content.trips || [];
        }

        function getTripCursor(content, list) {
            const direct = content?.nextTime || content?.lastTime || content?.next;
            if (direct) return String(direct);
            const last = Array.isArray(list) && list.length ? list[list.length - 1] : null;
            return String(last?.timestamp || last?.showTimestamp || last?.showDateTime || '0');
        }

        function handleTripSearch(keyword) {
            const resultBox = getResultBox();
            if (!resultBox) return;
            const normalizedKeyword = String(keyword || '').trim();
            const idInput = document.getElementById('trip-member-id');
            if (idInput) idInput.value = '';

            if (!normalizedKeyword) {
                resultBox.style.display = 'none';
                return;
            }

            if (!getMemberDataLoaded() && typeof loadMemberData === 'function') {
                loadMemberData();
            }

            const lowerKeyword = normalizedKeyword.toLowerCase();
            const memberList = Array.isArray(getMemberData()) ? getMemberData() : [];
            const matches = memberList.filter(member => {
                const name = String(member.ownerName || member.name || '').trim();
                const pinyin = String(member.pinyin || '');
                const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : '';
                return name.includes(normalizedKeyword)
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
                            onclick="selectTripMember('${escapeJsString(displayName)}', '${escapeJsString(memberId)}')"
                            style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight:bold; ${baseStyle}">${escapeHtml(displayName)}</span>
                            <span class="team-tag" style="${baseStyle} ${colorStyle}">${escapeHtml(member.team || member.groupName || '')}</span>
                        </div>`;
            }).join('');
            resultBox.style.display = 'block';
        }

        function selectTripMember(name, memberId) {
            const input = document.getElementById('trip-member-input');
            const idInput = document.getElementById('trip-member-id');
            const resultBox = getResultBox();
            if (input) input.value = name || '';
            if (idInput) idInput.value = memberId || '';
            if (resultBox) resultBox.style.display = 'none';
        }

        function formatTripDate(item) {
            const date = String(item.showDate || '').trim();
            const time = String(item.showTime || '').trim();
            if (date || time) return `${date}${time ? ` ${time.slice(0, 5)}` : ''}`.trim();
            const timestamp = Number(item.timestamp || 0);
            if (!timestamp) return '';
            const d = new Date(timestamp);
            if (Number.isNaN(d.getTime())) return '';
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }

        function formatTripDateParts(item) {
            const text = formatTripDate(item) || '时间待定';
            const parts = text.split(/\s+/);
            return {
                date: parts[0] || text,
                time: parts.slice(1).join(' ') || ''
            };
        }

        function openTripUrl(url) {
            const target = String(url || '').trim();
            if (!target) return;
            if (typeof openExternal === 'function') {
                openExternal(target);
            } else {
                window.open(target, '_blank', 'noopener,noreferrer');
            }
        }

        function buildTripInfoRow(label, value) {
            const text = String(value || '').trim();
            if (!text) return '';
            return `<div class="trip-info-row">
                        <span class="trip-info-label">${escapeHtml(label)}</span>
                        <span class="trip-info-value">${escapeHtml(text)}</span>
                    </div>`;
        }

        function buildTripCard(item) {
            const card = document.createElement('article');
            card.className = 'trip-card';
            const dateParts = formatTripDateParts(item);
            const location = item.locationInfo?.details || item.locationInfo?.keyword || '';
            const ticketUrl = item.ticketInfo?.url || '';
            const ticketText = item.ticketInfo?.content || '';
            const liveText = item.liveInfo?.content || '';
            const members = item.joinMemberName || '';
            card.innerHTML = `
                <div class="trip-card-main">
                    <div class="trip-date">
                        <span class="trip-date-day">${escapeHtml(dateParts.date)}</span>
                        ${dateParts.time ? `<span class="trip-date-time">${escapeHtml(dateParts.time)}</span>` : ''}
                    </div>
                    <div class="trip-content">
                        <div class="trip-title">${escapeHtml(item.title || '未命名行程')}</div>
                        ${item.subTitle ? `<div class="trip-subtitle">${escapeHtml(item.subTitle)}</div>` : ''}
                        ${item.content ? `<div class="trip-desc">${escapeHtml(item.content)}</div>` : ''}
                        <div class="trip-info-list">
                            ${buildTripInfoRow('地点', location)}
                            ${buildTripInfoRow('成员', members)}
                            ${buildTripInfoRow('票务', ticketText)}
                            ${buildTripInfoRow('直播', liveText)}
                        </div>
                    </div>
                    ${ticketUrl ? `<button class="btn btn-secondary trip-ticket-btn" type="button" data-url="${escapeHtml(ticketUrl)}">票务</button>` : ''}
                </div>
            `;
            const ticketBtn = card.querySelector('.trip-ticket-btn');
            if (ticketBtn) {
                ticketBtn.addEventListener('click', () => openTripUrl(ticketBtn.dataset.url));
            }
            return card;
        }

        function renderTrips(list, append) {
            const container = document.getElementById('trip-result-container');
            if (!container) return;
            if (!append) container.innerHTML = '';
            if (!list.length && !append) {
                container.innerHTML = '<div class="empty-state">暂无行程</div>';
                return;
            }

            const fragment = document.createDocumentFragment();
            list.forEach(item => fragment.appendChild(buildTripCard(item)));
            container.appendChild(fragment);
        }

        async function fetchTripList() {
            const token = getAppToken ? getAppToken() : '';
            const container = document.getElementById('trip-result-container');
            if (!token) {
                showToast('请先在“账号设置”中登录');
                return;
            }
            if (!container || tripLoading) return;

            tripLoading = true;
            const button = document.getElementById('btn-trip-query');
            const originalText = button?.innerText || '';
            if (button) {
                button.disabled = true;
                button.innerText = '加载中';
            }

            tripLastTime = '0';
            container.innerHTML = '<div class="empty-state">正在读取行程...</div>';

            try {
                const pa = typeof window.getPA === 'function' ? window.getPA() : null;
                const memberId = getMemberId();
                let hasRendered = false;
                let isMore = false;
                const seenCursors = new Set();

                for (let page = 0; page < 100; page += 1) {
                    const cursor = isMore ? tripLastTime : '0';
                    if (isMore && seenCursors.has(cursor)) break;
                    seenCursors.add(cursor);

                    const result = await ipcRenderer.invoke('fetch-trip-list', {
                        token,
                        pa,
                        groupId: 0,
                        memberId,
                        userId: '',
                        lastTime: cursor,
                        isMore
                    });

                    if (!result?.success || !result.content) {
                        throw new Error(result?.msg || '获取行程失败');
                    }

                    const list = normalizeTripList(result.content);
                    if (!list.length) break;

                    const nextCursor = getTripCursor(result.content, list);
                    renderTrips(list, hasRendered);
                    hasRendered = true;

                    if (!nextCursor || nextCursor === cursor || nextCursor === '0') break;
                    tripLastTime = nextCursor;
                    isMore = true;
                }

                if (!hasRendered) {
                    container.innerHTML = '<div class="empty-state">暂无行程</div>';
                }
            } catch (error) {
                container.innerHTML = `<div class="placeholder-tip"><h3>加载失败</h3><p>${escapeHtml(error.message || error)}</p></div>`;
            } finally {
                tripLoading = false;
                if (button) {
                    button.disabled = false;
                    button.innerText = originalText;
                }
            }
        }

        bindTripSearchDismiss();

        return {
            handleTripSearch,
            selectTripMember,
            fetchTripList
        };
    };
})();
