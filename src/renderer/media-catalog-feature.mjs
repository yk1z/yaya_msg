export function createMediaCatalogFeature({
    fetchPocketAPI,
    isWebRuntime,
    invoke,
    getViewName,
    getMode,
    getPlaybackRevision,
    getAccountGeneration,
    getMembers,
    membersLoaded,
    loadMemberData,
    getMemberIdFromQuery,
    getMemberNamesById,
    getPinyinInitials,
    getGroupCode,
    memberSortLogic,
    getTeamStyle,
    getDownloadStatus,
    directToPotPlayer,
    handleDownloadDanmu,
    handleDownloadVOD,
    playLiveStream,
    showToast,
    escapeHtml
}) {
    const vodPopularityCache = new Map();
    const vodPopularityRequests = new Map();
    let vodPopularityObserver = null;

    let liveListRequest = null;
    let currentLiveListRaw = [];
    class VODState {
        constructor() {
            this.currentGroup = 0;
            this.isLoading = false;
            this.list = [];
            this.searchPageToken = 0;
            this.isSearchActive = false;
            this.filterSignature = '';
            this.requestVersion = 0;
            this.source = 'pocket';
            this.nextPageTokens = {
                0: 0,
                10: 0,
                11: 0,
                12: 0,
                13: 0,
                14: 0,
                15: 0,
                16: 0,
                17: 0,
                18: 20,
                19: 0,
                21: 0,
                meet48: 0
            };
            this.hasMore = true;
            this.groups = [{
                apiId: 0,
                name: '全部团体'
            },
            {
                apiId: 10,
                name: 'SNH48'
            },
            {
                apiId: 12,
                name: 'GNZ48'
            },
            {
                apiId: 11,
                name: 'BEJ48'
            },
            {
                apiId: 14,
                name: 'CKG48'
            },
            {
                apiId: 21,
                name: 'CGT48'
            },
            {
                apiId: 15,
                name: 'IDFT'
            },
            {
                apiId: 19,
                name: '明星殿堂'
            },
            {
                apiId: 20,
                name: '丝芭影视'
            },
            {
                apiId: 16,
                name: '海外练习生'
            },
            {
                apiId: 80,
                name: '燃烧吧团魂'
            },
            ];
            this.currentPage = 1;
            this.pageSize = 5;
        }
        resetPagination(groupId) {
            this.requestVersion++;
            this.isLoading = false;
            this.nextPageTokens[groupId] = 0;
            this.nextPageTokens.meet48 = 0;
            this.searchPageToken = 0;
            this.list = [];
            this.hasMore = true;
            this.currentPage = 1;
        }
    }
    const vodState = new VODState();
    const VOD_PAGE_BUTTON_COUNT = 5;

    function isMeet48Mode(mode = getMode()) {
        return mode === 'meet-live' || mode === 'meet-vod';
    }

    function isLiveMediaMode(mode = getMode()) {
        return mode === 'live' || mode === 'meet-live';
    }

    function isVodMediaMode(mode = getMode()) {
        return mode === 'vod' || mode === 'meet-vod';
    }

    function getMediaSourceForMode(mode = getMode()) {
        return isMeet48Mode(mode) ? 'meet48' : 'pocket';
    }

    function normalizeMediaCoverUrl(pathname, source = 'pocket') {
        const value = String(pathname || '').trim();
        if (!value) return './icon.png';
        if (/^https?:\/\//i.test(value)) return value;
        const base = source === 'meet48'
            ? (/^(?:image|avatarUpload)\//i.test(value.replace(/^\/+/, '')) ? 'https://static.meet48.xyz/' : 'https://source3.48.cn/')
            : 'https://source.48.cn/';
        try {
            return new URL(value.replace(/^\/+/, ''), base).href;
        } catch (error) {
            return value.startsWith('/') ? `${base.replace(/\/$/, '')}${value}` : `${base}${value}`;
        }
    }

    function normalizeMeet48LiveItem(item, record = false) {
        const raw = item || {};
        const user = raw.userInfo || raw.user || {};
        return Object.assign({}, raw, {
            source: 'meet48',
            liveId: String(raw.liveId || raw.id || ''),
            title: raw.title || raw.liveTitle || (record ? '海外回放' : '海外直播'),
            liveTitle: raw.liveTitle || raw.title || (record ? '海外回放' : '海外直播'),
            liveType: raw.liveType || 1,
            liveMode: raw.liveMode || 0,
            userInfo: Object.assign({}, user, {
                nickname: user.nickname || user.userName || raw.nickname || '海外成员',
                userId: user.userId || raw.userId || ''
            })
        });
    }

    async function fetchMeet48ListPage({ next = 0, record = false } = {}) {
        const result = await invoke('fetch-meet48-live-list', { next, record });
        if (result?.success && result.content?.liveList) {
            return {
                status: 200,
                content: {
                    liveList: result.content.liveList.map(item => normalizeMeet48LiveItem(item, record)),
                    next: result.content.next
                }
            };
        }
        return { status: 500, message: result?.msg || 'Meet48 列表加载失败', content: {} };
    }

    function configureMeet48ListControls() {
        const isMeet = isMeet48Mode();
        const liveGroupWrapper = document.getElementById('live-group-wrapper');
        const liveTypeWrapper = document.getElementById('live-type-wrapper');
        const vodGroupWrapper = document.getElementById('vod-group-wrapper');
        const vodTypeWrapper = document.getElementById('vod-type-wrapper');
        const liveGroupValue = document.getElementById('live-group-value');
        const liveGroupDisplay = document.getElementById('live-group-display');
        const liveTypeValue = document.getElementById('live-type-value');
        const liveTypeDisplay = document.getElementById('live-type-display');
        const vodTypeValue = document.getElementById('vod-type-filter');
        const vodTypeDisplay = document.getElementById('vod-type-display');

        if (liveGroupWrapper?.parentElement) liveGroupWrapper.parentElement.style.display = isMeet ? 'none' : 'flex';
        if (liveTypeWrapper?.parentElement) liveTypeWrapper.parentElement.style.display = isMeet ? 'none' : 'flex';
        if (vodGroupWrapper?.parentElement) vodGroupWrapper.parentElement.style.display = isMeet ? 'none' : 'flex';
        if (vodTypeWrapper?.parentElement) vodTypeWrapper.parentElement.style.display = isMeet ? 'none' : 'flex';
        if (isMeet) {
            if (liveGroupValue) liveGroupValue.value = 'all';
            if (liveGroupDisplay) liveGroupDisplay.value = '全部团体';
            if (liveTypeValue) liveTypeValue.value = 'all';
            if (liveTypeDisplay) liveTypeDisplay.value = '全部';
            if (vodTypeValue) vodTypeValue.value = '0';
            if (vodTypeDisplay) vodTypeDisplay.value = '全部';
        }
    }

    function autoAdjustPageSize() {
        const mediaView = document.getElementById('view-media');
        let calculatedSize;
        if (document.body?.classList.contains('desktop-workspace')) {
            if (!mediaView || mediaView.style.display === 'none' || !isVodMediaMode()) return;
            const list = document.getElementById('vod-list-container');
            const row = list?.querySelector('.vod-card-row');
            const footer = document.getElementById('vod-pagination-controls');
            if (!row || !footer || mediaView.clientHeight <= 0) return;
            const rowHeight = row.getBoundingClientRect().height;
            if (rowHeight <= 0) return;
            const pixels = value => Number.parseFloat(value) || 0;
            const viewStyle = getComputedStyle(mediaView);
            const listStyle = getComputedStyle(list);
            const footerStyle = getComputedStyle(footer);
            const gap = pixels(listStyle.rowGap);
            const listTop = list.getBoundingClientRect().top - mediaView.getBoundingClientRect().top + mediaView.scrollTop;
            const availableHeight = mediaView.clientHeight - pixels(viewStyle.paddingBottom) - listTop
                - footer.getBoundingClientRect().height - pixels(footerStyle.marginBottom)
                - pixels(listStyle.paddingTop) - pixels(listStyle.paddingBottom);
            calculatedSize = Math.max(1, Math.min(30, Math.floor((availableHeight + gap) / (rowHeight + gap))));
        } else {
            calculatedSize = Math.max(5, Math.min(30, Math.floor((window.innerHeight - 250) / 105)));
        }

        if (vodState.pageSize !== calculatedSize) {
            const firstItemIndex = (Math.max(1, vodState.currentPage || 1) - 1) * vodState.pageSize;
            vodState.pageSize = calculatedSize;
            vodState.currentPage = Math.floor(firstItemIndex / calculatedSize) + 1;
            if (mediaView && mediaView.style.display !== 'none' && isVodMediaMode(getMode())) {
                if (vodState.list.length > 0) {
                    renderVODListUI();
                }
            }
        }
    }

    let vodPageSizeFrame = 0;
    function scheduleVodPageSizeAdjustment() {
        if (vodPageSizeFrame) return;
        vodPageSizeFrame = requestAnimationFrame(() => {
            vodPageSizeFrame = 0;
            autoAdjustPageSize();
        });
    }
    window.addEventListener('yaya:view-changed', event => {
        if (event.detail?.view === 'media') scheduleVodPageSizeAdjustment();
    });

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(autoAdjustPageSize, 150);
    });

    window.addEventListener('DOMContentLoaded', () => {
        if (window.desktop?.isRoomWindow) return;
        autoAdjustPageSize();
        if (!isWebRuntime && typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(scheduleVodPageSizeAdjustment);
            ['view-media', 'media-list-controls', 'vod-pagination-controls'].forEach(id => {
                const element = document.getElementById(id);
                if (element) observer.observe(element);
            });
        }
    });

    function selectMember(name) {
        const input = document.getElementById('vod-member-filter');
        const box = document.getElementById('member-suggestions');
        input.value = name;
        box.style.display = 'none';
        reloadVodListForCurrentFilter();
    }

    function handleGroupChange(apiId) {
        vodState.currentGroup = parseInt(apiId);
        vodState.resetPagination(vodState.currentGroup);
        vodState.filterSignature = getVodFilterSignature();
        ensureInitialVodPages().then(() => {
            renderVODListUI();
        });
    }
    let filterTimeout;

    function getVodFilterSignature() {
        const memberFilterInput = document.getElementById('vod-member-filter');
        const typeFilterSelect = document.getElementById('vod-type-filter');
        const filterText = memberFilterInput ? memberFilterInput.value.trim().toLowerCase() : '';
        const typeFilter = typeFilterSelect ? typeFilterSelect.value : '0';
        const groupId = vodState.currentGroup;
        const source = vodState.source;
        return `${source}|${groupId}|${typeFilter}|${filterText}`;
    }

    function resetVodDataForFilterChange() {
        const nextSignature = getVodFilterSignature();
        if (vodState.filterSignature === nextSignature) return false;

        vodState.filterSignature = nextSignature;
        vodState.requestVersion++;
        vodState.isLoading = false;
        vodState.searchPageToken = 0;
        vodState.nextPageTokens[vodState.currentGroup] = 0;
        vodState.nextPageTokens.meet48 = 0;
        vodState.list = [];
        vodState.hasMore = true;
        vodState.currentPage = 1;
        resetLoadAllButton();
        return true;
    }

    let vodMemberLookupPromise = null;

    async function ensureVodMemberLookupReady(filterText) {
        if (!filterText || membersLoaded()) return;

        if (!vodMemberLookupPromise) {
            vodMemberLookupPromise = Promise.resolve(loadMemberData()).finally(() => {
                vodMemberLookupPromise = null;
            });
        }

        try {
            await vodMemberLookupPromise;
        } catch (error) {
            console.warn('录播成员索引加载失败:', error);
        }
    }

    async function reloadVodListForCurrentFilter() {
        const requestSignature = getVodFilterSignature();
        const memberFilterInput = document.getElementById('vod-member-filter');
        const filterText = memberFilterInput ? memberFilterInput.value.trim() : '';

        await ensureVodMemberLookupReady(filterText);
        if (getVodFilterSignature() !== requestSignature) return;

        resetVodDataForFilterChange();
        vodState.currentPage = 1;
        await ensureInitialVodPages();
        renderVODListUI();
    }

    function handleMemberFilter() {
        const input = document.getElementById('vod-member-filter');
        const box = document.getElementById('member-suggestions');
        const val = input.value.trim().toLowerCase();

        if (!membersLoaded()) {
            loadMemberData();
        }

        if (document.activeElement !== input) {
            box.style.display = 'none';
            return;
        }

        if (val.length === 0) {
            box.style.display = 'none';
        } else {
            const matches = getMembers().filter(m => {
                const matchName = m.ownerName.includes(val);
                const pinyin = m.pinyin || "";
                const matchPinyin = pinyin.toLowerCase().includes(val);
                const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : "";
                const matchInitials = initials.toLowerCase().includes(val);

                return matchName || matchPinyin || matchInitials;
            });

            matches.sort(memberSortLogic);

            if (matches.length > 0) {
                const html = matches.slice(0, 10).map(m => {
                    const isInactive = m.isInGroup === false;
                    const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';
                    const colorStyle = typeof getTeamStyle === 'function' ? getTeamStyle(m.team, isInactive) : '';
                    const teamHtml = m.team ? `<span class="team-tag" style="${baseStyle} ${colorStyle}">${escapeHtml(m.team)}</span>` : '';

                    return `<div class="suggestion-item"
                         data-media-value="${escapeHtml(m.ownerName)}"
                         style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight:bold; ${baseStyle}">${escapeHtml(m.ownerName)}</span>
                        ${teamHtml}
                    </div>`;
                }).join('');

                box.innerHTML = html;
                box.style.display = 'block';
            } else {
                box.style.display = 'none';
            }
        }

        clearTimeout(filterTimeout);
        filterTimeout = setTimeout(() => {
            reloadVodListForCurrentFilter();
        }, 500);
    }

    function renderVodGroupOptions() {
        const list = document.getElementById('vod-group-dropdown');
        if (!list) return;

        list.innerHTML = vodState.groups.map(g => `
            <div class="suggestion-item" data-media-value="${g.apiId}" data-media-label="${escapeHtml(g.name)}">
                ${g.name}
            </div>
        `).join('');
    }

    function toggleVodGroupDropdown() {
        const list = document.getElementById('vod-group-dropdown');
        if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        const typeList = document.getElementById('vod-type-dropdown');
        if (typeList) typeList.style.display = 'none';
    }

    function selectVodGroup(apiId, name) {
        resetLoadAllButton();
        document.getElementById('vod-group-display').value = name;
        document.getElementById('vod-group-dropdown').style.display = 'none';
        handleGroupChange(apiId);
    }

    function toggleVodTypeDropdown() {
        const list = document.getElementById('vod-type-dropdown');
        if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        const groupList = document.getElementById('vod-group-dropdown');
        if (groupList) groupList.style.display = 'none';
    }

    function selectVodType(value, name) {
        resetLoadAllButton();
        document.getElementById('vod-type-display').value = name;
        document.getElementById('vod-type-filter').value = value;
        document.getElementById('vod-type-dropdown').style.display = 'none';
        handleVodTypeChange();
    }

    function handleVodTypeChange() {
        reloadVodListForCurrentFilter();
    }

    let isVodAutoLoading = false;

    async function handleLoadAllVod() {
        const loadBtn = document.getElementById('load-all-btn');

        if (isVodAutoLoading) {
            isVodAutoLoading = false;
            if (loadBtn) {
                loadBtn.textContent = window.YayaRendererUtils.t('继续加载');
                loadBtn.style.background = '';
                loadBtn.style.borderColor = '';
            }
            return;
        }

        if (!vodState.hasMore) {
            if (loadBtn) {
                loadBtn.textContent = window.YayaRendererUtils.t('加载完毕');
                loadBtn.style.background = '#28a745';
                loadBtn.style.borderColor = '#28a745';
                loadBtn.disabled = true;
            }
            return;
        }

        isVodAutoLoading = true;
        if (loadBtn) {
            loadBtn.textContent = window.YayaRendererUtils.t('暂停加载');
            loadBtn.style.background = '#dc3545';
            loadBtn.style.borderColor = '#dc3545';
        }

        try {
            let previousTotal = getFilteredVODList().length;
            const autoLoadVersion = vodState.requestVersion;

            while (isVodAutoLoading && vodState.hasMore && autoLoadVersion === vodState.requestVersion) {

                await fetchVODPageInternal(autoLoadVersion);
                if (autoLoadVersion !== vodState.requestVersion) break;

                if (typeof renderVODListUI === 'function') {
                    renderVODListUI();
                }

                const currentTotal = getFilteredVODList().length;

                if (currentTotal === previousTotal) {
                    console.log("数据未增加，已到达真正的尽头，强制结束静默加载！");
                    vodState.hasMore = false;
                    break;
                }

                previousTotal = currentTotal;

                await new Promise(r => setTimeout(r, 600));
            }
        } catch (error) {
            console.error("后台拉取数据时出错:", error);
        }

        if (!vodState.hasMore) {
            isVodAutoLoading = false;
            if (loadBtn) {
                loadBtn.textContent = window.YayaRendererUtils.t('加载完毕');
                loadBtn.style.background = '#28a745';
                loadBtn.style.borderColor = '#28a745';
                loadBtn.disabled = true;
            }
        }
    }

    function resetLoadAllButton() {
        isVodAutoLoading = false;

        const loadBtn = document.getElementById('load-all-btn');
        if (loadBtn) {
            loadBtn.textContent = window.YayaRendererUtils.t('加载全部');
            loadBtn.style.background = '';
            loadBtn.style.borderColor = '';
            loadBtn.disabled = false;
        }
    }

    async function handleRefreshList() {
        resetLoadAllButton();
        const btn = document.getElementById('refresh-btn');
        const originalText = btn.textContent;
        btn.textContent = window.YayaRendererUtils.t('正在刷新');
        btn.disabled = true;

        vodState.resetPagination(vodState.currentGroup);
        vodState.filterSignature = getVodFilterSignature();

        try {
            await ensureInitialVodPages();

            renderVODListUI();
        } catch (e) {
            console.error(e);
            renderVODListUI();
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    async function goToPage(page) {
        const requestVersion = vodState.requestVersion;
        await ensurePageData(page);
        if (requestVersion !== vodState.requestVersion || getViewName() !== 'media' || !isVodMediaMode()) return;
        const maxPage = Math.ceil(getFilteredVODList().length / vodState.pageSize);
        vodState.currentPage = maxPage > 0 ? Math.min(page, maxPage) : page;
        renderVODListUI();
    }

    function handlePrevPage() {
        if (vodState.currentPage > 1) {
            vodState.currentPage--;
            renderVODListUI();
        }
    }

    async function handleNextPage(isAppend = false) {
        const nextPage = vodState.currentPage + 1;
        await goToPage(nextPage, isAppend);
    }

    function padVodDatePart(value) {
        return String(value || '').padStart(2, '0');
    }

    function buildVodDateSearchTerms(rawTime) {
        const timestamp = Number(rawTime);
        if (!Number.isFinite(timestamp)) return [];

        const d = new Date(timestamp);
        if (Number.isNaN(d.getTime())) return [];

        const year = String(d.getFullYear());
        const month = padVodDatePart(d.getMonth() + 1);
        const day = padVodDatePart(d.getDate());
        const monthRaw = String(d.getMonth() + 1);
        const dayRaw = String(d.getDate());

        return [
            `${year}-${month}-${day}`,
            `${year}/${month}/${day}`,
            `${year}.${month}.${day}`,
            `${year}${month}${day}`,
            `${year}年${monthRaw}月${dayRaw}日`,
            `${year}年${month}月${day}日`,
            `${month}-${day}`,
            `${month}/${day}`,
            `${month}.${day}`,
            `${monthRaw}-${dayRaw}`,
            `${monthRaw}/${dayRaw}`,
            `${monthRaw}.${dayRaw}`,
            `${monthRaw}月${dayRaw}日`
        ];
    }

    function getFilteredVODList() {
        const list = vodState.list;
        const memberFilterInput = document.getElementById('vod-member-filter');
        const typeFilterSelect = document.getElementById('vod-type-filter');
        const filterRaw = memberFilterInput ? memberFilterInput.value.trim().toLowerCase() : '';
        const typeFilter = typeFilterSelect ? typeFilterSelect.value : "0";
        if (!filterRaw && typeFilter === "0") return list;
        const keywords = filterRaw.split(/\s+/);
        return list.filter(item => {
            if (typeFilter !== "0") {
                const isRadio = (item.liveType === 2);
                const isRecord = (item.liveMode === 1);

                if (typeFilter === "record") {
                    if (!isRecord) return false;
                } else if (typeFilter === "1") {
                    if (isRadio || isRecord) return false;
                } else if (typeFilter === "2") {
                    if (!isRadio) return false;
                }
            }
            const u = item.userInfo || {};
            const name = String(u.nickname || item.nickname || '').toLowerCase();
            const title = String(item.title || item.liveTitle || '').toLowerCase();
            const userId = String(u.userId || u.id || item.userId || item.id || '');
            const memberNames = getMemberNamesById(userId).map(v => String(v).toLowerCase()).join(' ');
            const rawTime = item.startTime || item.ctime;
            const dateSearchTerms = buildVodDateSearchTerms(rawTime).map(v => v.toLowerCase()).join(' ');
            const searchableText = [name, memberNames, title, userId, dateSearchTerms].filter(Boolean).join(' ');
            return keywords.every(kw => searchableText.includes(kw));
        });
    }

    function hasNextVodPage(next, current) {
        const cursor = String(next ?? '').trim();
        return (typeof next === 'string' || typeof next === 'number')
            && cursor !== '' && cursor !== '0' && cursor !== String(current ?? '').trim();
    }

    async function fetchVODPageInternal(requestVersion = vodState.requestVersion, { prefetch = false } = {}) {
        if (getViewName() !== 'media' || !isVodMediaMode()) return 0;
        const isStaleVodRequest = () => requestVersion !== vodState.requestVersion
            || getViewName() !== 'media' || !isVodMediaMode();
        const failRequest = message => {
            if (isStaleVodRequest()) return 0;
            if (prefetch) return null;
            vodState.hasMore = false;
            if (message) document.getElementById('vod-loading').textContent = message;
            return 0;
        };
        const memberFilterInput = document.getElementById('vod-member-filter');
        let filterText = memberFilterInput ? memberFilterInput.value.trim() : '';
        const isMeetSource = vodState.source === 'meet48' || getMode() === 'meet-vod';
        const memberId = (!isMeetSource && filterText) ? getMemberIdFromQuery(filterText) : null;
        const groupId = vodState.currentGroup;
        let nextToken = isMeetSource
            ? (vodState.nextPageTokens.meet48 || 0)
            : (memberId ? (vodState.searchPageToken || 0) : vodState.nextPageTokens[groupId]);
        try {
            if (isMeetSource) {
                const res = await fetchMeet48ListPage({ next: nextToken, record: true });
                if (isStaleVodRequest()) return 0;
                if (res?.status === 200 && res.content?.liveList) {
                    const newList = res.content.liveList;
                    if (vodState.nextPageTokens.meet48 === 0) vodState.list = newList;
                    else vodState.list = vodState.list.concat(newList);
                    vodState.nextPageTokens.meet48 = res.content.next;
                    vodState.hasMore = hasNextVodPage(res.content.next, nextToken);
                    return newList.length;
                }
                return failRequest();
            }

            if (memberId && nextToken === 0) {
                const anchorRes = await fetchPocketAPI('/live/api/v1/live/getLiveList', JSON.stringify({
                    debug: true,
                    next: 0,
                    record: true,
                    limit: 1
                }));
                if (isStaleVodRequest()) return 0;
                if (anchorRes?.content?.liveList?.[0]) nextToken = anchorRes.content.liveList[0].liveId;
            }
            const payload = {
                debug: true,
                next: nextToken,
                record: true,
                limit: 20
            };
            if (memberId) {
                payload.userId = parseInt(memberId, 10);
            } else {
                payload.groupId = groupId;
            }
            const res = await fetchPocketAPI('/live/api/v1/live/getLiveList', JSON.stringify(payload));
            if (isStaleVodRequest()) return 0;
            if (res?.status === 200 && res.content?.liveList) {
                const newList = res.content.liveList;
                if (memberId) {
                    if (vodState.searchPageToken === 0 || !vodState.searchPageToken) vodState.list = newList;
                    else vodState.list = vodState.list.concat(newList);
                    vodState.searchPageToken = res.content.next;
                } else {
                    if (vodState.nextPageTokens[groupId] === 0) vodState.list = newList;
                    else vodState.list = vodState.list.concat(newList);
                    vodState.nextPageTokens[groupId] = res.content.next;
                }
                vodState.hasMore = hasNextVodPage(res.content.next, nextToken);
                return newList.length;
            }
            return failRequest(res?.message);
        } catch (e) {
            return failRequest(window.YayaRendererUtils.t(e?.message || '录播接口请求失败'));
        }
    }
    function ensureInitialVodPages() {
        const memberFilter = document.getElementById('vod-member-filter');
        const typeFilter = document.getElementById('vod-type-filter');
        const search = Boolean(memberFilter?.value.trim());
        if (!search && typeFilter && typeFilter.value !== '0') {
            return ensurePageData(1);
        }
        return ensurePageData(VOD_PAGE_BUTTON_COUNT, { prefetch: true, search });
    }

    async function ensurePageData(page, { prefetch = false, search = false } = {}) {
        if (getViewName() !== 'media' || !isVodMediaMode() || vodState.isLoading) return;
        const requestVersion = vodState.requestVersion;
        const isCurrentVodRequest = () => requestVersion === vodState.requestVersion
            && getViewName() === 'media' && isVodMediaMode();
        const targetCount = page * vodState.pageSize;
        if (getFilteredVODList().length >= targetCount || !vodState.hasMore) return;
        vodState.isLoading = true;
        document.getElementById('vod-loading').style.display = 'none';
        togglePagination(false);
        const maxBatches = prefetch && !search ? 2 : 50;
        try {
            for (let batch = 0; batch < maxBatches && isCurrentVodRequest() && vodState.hasMore; batch++) {
                const matchingCount = getFilteredVODList().length;
                if (matchingCount >= targetCount) break;
                const extraBatch = prefetch && (search ? matchingCount >= vodState.pageSize : batch > 0);
                const addedRaw = await fetchVODPageInternal(requestVersion, { prefetch: extraBatch });
                if (!isCurrentVodRequest() || addedRaw === null) break;
                if (addedRaw === 0) {
                    vodState.hasMore = false;
                    break;
                }
                if (search && extraBatch) break;
            }
        } catch (e) { window.YayaRendererUtils.reportIgnoredError(e, 'src/renderer/media-catalog-feature.mjs'); } finally {
            if (isCurrentVodRequest()) {
                vodState.isLoading = false;
                document.getElementById('vod-loading').style.display = 'none';
                togglePagination(true);
            }
        }
    }

    let lastVodPaginationMarkup = '';

    function togglePagination(enabled) {
        const container = document.getElementById('vod-pagination-controls');
        if (!container) return;
        container.dataset.busy = enabled ? '0' : '1';
    }

    function getVODPopularityValue(item) {
        const candidates = [
            item?.onlineNum,
            item?.online,
            item?.hot,
            item?.popularity,
            item?.viewerNum,
            item?.viewNum
        ];
        for (const value of candidates) {
            const num = Number(value);
            if (Number.isFinite(num) && num > 0) return num;
        }
        return null;
    }

    function formatVODPopularity(value) {
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0) return '';
        if (num >= 10000) {
            const text = (num / 10000).toFixed(num >= 100000 ? 0 : 1).replace(/\.0$/, '');
            return `${text}万`;
        }
        return String(Math.round(num));
    }

    function renderVODPopularityBadge(liveId, value) {
        const display = formatVODPopularity(value);
        return `
            <div class="vod-row-popularity" data-vod-popularity-liveid="${escapeHtml(liveId)}" title="${display ? `人气值 ${display}` : ''}" ${display ? '' : 'hidden'}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <span>${display}</span>
            </div>
        `;
    }

    function updateVODPopularityBadge(card, value) {
        const badge = card.querySelector('.vod-row-popularity');
        const display = formatVODPopularity(value);
        if (!badge || !display) return;
        badge.hidden = false;
        badge.title = window.YayaRendererUtils.t(`人气值 ${display}`);
        const valueEl = badge.querySelector('span');
        if (valueEl) valueEl.textContent = display;
    }

    function getCachedVODPopularity(liveId) {
        const entry = vodPopularityCache.get(liveId);
        if (entry && entry.expiresAt > Date.now()) return entry.value;
        vodPopularityCache.delete(liveId);
        return undefined;
    }

    function fetchVODPopularity(liveId) {
        const cached = getCachedVODPopularity(liveId);
        if (cached !== undefined) return Promise.resolve(cached);
        const pending = vodPopularityRequests.get(liveId);
        if (pending) return pending;

        const request = (async () => {
            let value = null;
            try {
                let useDetail = !isWebRuntime;
                if (isWebRuntime) {
                    const url = `/api/vod-popularity?${new URLSearchParams({ liveId })}`;
                    const response = await fetch(window.yayaWebApiUrl ? window.yayaWebApiUrl(url) : url);
                    if (response.ok) value = getVODPopularityValue(await response.json());
                    useDetail = response.status === 404;
                }
                if (useDetail) {
                    const response = await fetchPocketAPI('/live/api/v1/live/getLiveOne', JSON.stringify({ liveId }));
                    if (response?.status === 200) value = getVODPopularityValue(response.content);
                }
            } catch (error) {
                console.warn('获取回放人气值失败:', liveId, error);
            }
            if (vodPopularityCache.size >= 1024) vodPopularityCache.delete(vodPopularityCache.keys().next().value);
            vodPopularityCache.set(liveId, { value, expiresAt: Date.now() + (value === null ? 30000 : 300000) });
            return value;
        })().finally(() => vodPopularityRequests.delete(liveId));
        vodPopularityRequests.set(liveId, request);
        return request;
    }

    function observeVODPopularity(cards, requestVersion) {
        if (!cards.size) return;
        const load = async (card) => {
            if (!card.isConnected || requestVersion !== vodState.requestVersion || getViewName() !== 'media' || !isVodMediaMode()) return;
            const value = await fetchVODPopularity(cards.get(card));
            if (card.isConnected && requestVersion === vodState.requestVersion && getViewName() === 'media' && isVodMediaMode()) {
                updateVODPopularityBadge(card, value);
            }
        };
        vodPopularityObserver = new IntersectionObserver((entries, observer) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                observer.unobserve(entry.target);
                void load(entry.target);
            }
        });
        for (const card of cards.keys()) vodPopularityObserver.observe(card);
    }

    function renderVODListUI() {
        if (getViewName() !== 'media' || !isVodMediaMode()) return;
        vodPopularityObserver?.disconnect();
        vodPopularityObserver = null;
        const container = document.getElementById('vod-list-container');
        const filteredList = getFilteredVODList();
        if (filteredList.length || !vodState.isLoading) delete document.documentElement.dataset.vodStartup;

        container.className = 'vod-list-mode';
        container.replaceChildren();
        if (filteredList.length === 0) {
            if (vodState.hasMore) {
                if (!vodState.isLoading) container.innerHTML = '<div style="width:100%; text-align:center; color:#888;"><div>暂无匹配数据</div></div>';
            } else container.innerHTML = '<div style="width:100%; text-align:center; color:#888;">暂无录播数据</div>';
            updatePaginationControls(0);
            return;
        }
        const totalPages = Math.max(1, Math.ceil(filteredList.length / vodState.pageSize));
        if (vodState.currentPage > totalPages) vodState.currentPage = totalPages;
        if (vodState.currentPage < 1) vodState.currentPage = 1;
        const startIndex = (vodState.currentPage - 1) * vodState.pageSize;
        const endIndex = startIndex + vodState.pageSize;
        const pageItems = filteredList.slice(startIndex, endIndex);
        const popularityCards = new Map();
        pageItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'vod-card-row';
            const status = getDownloadStatus(item.liveId);
            let btnText = "视频下载",
                btnStyleClass = "btn-secondary",
                btnDisabled = "";
            if (status === 'downloading') {
                btnText = "下载中";
                btnStyleClass = "btn-secondary btn-downloading";
                btnDisabled = "disabled";
            } else if (status === 'success') {
                btnText = "已完成";
                btnStyleClass = "btn-success";
                btnDisabled = "disabled";
            }
            const isLive = item.liveStatus === 1;
            const isMeetItem = item.source === 'meet48';
            const name = item.userInfo ? item.userInfo.nickname : item.nickname || '未知成员';
            const cover = normalizeMediaCoverUrl(item.coverPath, isMeetItem ? 'meet48' : 'pocket');
            const titleText = item.liveTitle || item.title || '无标题';
            const ownPopularity = getVODPopularityValue(item);
            const cachedPopularity = isMeetItem || isMeet48Mode() ? null : getCachedVODPopularity(String(item.liveId));
            const popularityValue = ownPopularity ?? cachedPopularity ?? null;
            if (item.liveId && ownPopularity === null && cachedPopularity === undefined) {
                popularityCards.set(card, String(item.liveId));
            }
            let timeStr = '未知时间';
            const rawTime = item.startTime || item.ctime;
            if (rawTime) {
                const d = new Date(Number(rawTime));
                timeStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
            }
            let liveTypeLabel = '视频';
            let badgeClass = 'badge-video';

            if (item.liveMode === 1) {
                liveTypeLabel = '录屏';
                badgeClass = 'badge-record';
            } else if (item.liveType === 2) {
                liveTypeLabel = '电台';
                badgeClass = 'badge-radio';
            }
            card.innerHTML = `
                <div class="vod-row-cover-container">
                    <img src="${escapeHtml(cover)}" class="vod-row-cover" title="点击播放">
                    <div class="vod-badge ${badgeClass}">${liveTypeLabel}</div>
                </div>
                <div class="vod-row-info">
                    <div class="vod-row-name">
                        ${escapeHtml(name)}
                        <div class="vod-row-actions">
                            ${isMeetItem ? '' : `<button class="btn btn-secondary web-hidden" data-vod-download="danmu" style="padding: 2px 8px; font-size: 11px; height: 24px;">
                                弹幕下载
                            </button>

                            <button class="btn ${btnStyleClass} vod-btn-${escapeHtml(item.liveId)} web-hidden" ${btnDisabled}
                                    data-vod-download="video" style="padding: 2px 8px; font-size: 11px; height: 24px;">
                                ${btnText}
                            </button>`}
                        </div>
                    </div>

                    <div class="vod-row-title">${escapeHtml(titleText)}</div>
                    <div class="vod-row-time">${timeStr}</div>
                </div>
                ${renderVODPopularityBadge(item.liveId, popularityValue)}
            `;
            card.querySelector('.vod-row-cover')?.addEventListener('click', event => directToPotPlayer(event, String(item.liveId), isMeetItem ? 'meet48' : 'pocket'));
            card.querySelector('[data-vod-download="danmu"]')?.addEventListener('click', event => handleDownloadDanmu(event, item));
            card.querySelector('[data-vod-download="video"]')?.addEventListener('click', event => handleDownloadVOD(event, item));
            card.onclick = () => playLiveStream({
                liveId: item.liveId,
                source: item.source,
                userInfo: {
                    nickname: name
                },
                title: titleText,
                startTime: rawTime
            }, isMeetItem ? getMode() : (isLive ? 'live' : 'vod'));
            container.appendChild(card);
        });
        observeVODPopularity(popularityCards, vodState.requestVersion);
        updatePaginationControls(filteredList.length);
        scheduleVodPageSizeAdjustment();
    }

    function updatePaginationControls(totalItems) {
        const controlsContainer = document.getElementById('vod-pagination-controls');
        if (!controlsContainer) return;
        if (totalItems === 0) {
            if (lastVodPaginationMarkup !== '') {
                controlsContainer.replaceChildren();
                lastVodPaginationMarkup = '';
            }
            return;
        }
        const current = vodState.currentPage;
        const totalPagesLocal = Math.ceil(totalItems / vodState.pageSize);
        let html = '';
        html += `<button class="pagination-btn" data-vod-page="1" ${current <= 1 ? 'disabled' : ''}>首页</button>`;
        html += `<button class="pagination-btn" data-vod-page="previous" ${current <= 1 ? 'disabled' : ''}>上一页</button>`;
        let start = Math.max(1, current - Math.floor(VOD_PAGE_BUTTON_COUNT / 2)),
            end = start + VOD_PAGE_BUTTON_COUNT - 1;
        if (end > totalPagesLocal) {
            end = Math.max(totalPagesLocal, 1);
            start = Math.max(1, end - VOD_PAGE_BUTTON_COUNT + 1);
        }
        const visiblePages = [];
        for (let i = start; i <= end; i++) visiblePages.push(i);
        while (visiblePages.length < VOD_PAGE_BUTTON_COUNT) visiblePages.push(null);
        visiblePages.forEach(pageNum => {
            html += pageNum === null ? generatePagePlaceholderBtn() : generatePageBtn(pageNum, current);
        });
        const canNext = current < totalPagesLocal || vodState.hasMore;
        html += `<button class="pagination-btn" data-vod-page="next" ${!canNext ? 'disabled' : ''}>下一页</button>`;
        html += `<button class="pagination-btn" data-vod-page="${totalPagesLocal}" ${totalPagesLocal <= 1 ? 'disabled' : ''}>尾页</button>`;
        if (html === lastVodPaginationMarkup) return;
        controlsContainer.innerHTML = html;
        lastVodPaginationMarkup = html;
    }

    function generatePageBtn(pageNum, current) {
        const activeClass = pageNum === current ? 'active' : '';
        return `<button class="pagination-btn ${activeClass}" data-vod-page="${pageNum}">${pageNum}</button>`;
    }

    function generatePagePlaceholderBtn() {
        return '<button class="pagination-btn pagination-placeholder" disabled aria-hidden="true" tabindex="-1"></button>';
    }
    async function fetchLiveList() {
        if (getViewName() !== 'media' || !isLiveMediaMode()) return;
        const mode = getMode();
        const viewToken = getPlaybackRevision();
        const accountGeneration = getAccountGeneration();
        if (liveListRequest && liveListRequest.mode === mode && liveListRequest.viewToken === viewToken
            && liveListRequest.accountGeneration === accountGeneration) return liveListRequest.promise;
        const vodLoading = document.getElementById('vod-loading');
        const liveListContainer = document.getElementById('live-list-container');
        if (!vodLoading || !liveListContainer) return;
        const request = { mode, viewToken, accountGeneration, promise: null };
        liveListRequest = request;
        const isCurrentRequest = () => liveListRequest === request && getViewName() === 'media'
            && getMode() === mode && getPlaybackRevision() === viewToken
            && getAccountGeneration() === accountGeneration;

        vodLoading.textContent = window.YayaRendererUtils.t('正在加载直播列表…');
        vodLoading.style.display = 'block';
        currentLiveListRaw = [];
        liveListContainer.replaceChildren();

        request.promise = (async () => {
            try {
                const res = mode === 'meet-live'
                    ? await fetchMeet48ListPage({ next: 0, record: false })
                    : await fetchPocketAPI('/live/api/v1/live/getLiveList', JSON.stringify({
                        debug: true,
                        next: 0,
                        groupId: 0,
                        record: false
                    }));
                if (!isCurrentRequest()) return;

                if (res?.status === 200 && Array.isArray(res.content?.liveList)) {
                    vodLoading.textContent = '';
                    vodLoading.style.display = 'none';
                    currentLiveListRaw = res.content.liveList;
                    handleLiveFilter();
                } else {
                    vodLoading.textContent = window.YayaRendererUtils.t(res?.message || res?.msg || '直播列表加载失败，请刷新重试');
                    vodLoading.style.display = 'block';
                }
            } catch (err) {
                if (!isCurrentRequest()) return;
                console.error(err);
                vodLoading.textContent = window.YayaRendererUtils.t(err?.message || '获取失败，请检查网络');
                vodLoading.style.display = 'block';
            } finally {
                if (liveListRequest === request) liveListRequest = null;
            }
        })();
        return request.promise;
    }


    function toggleLiveGroupDropdown() {
        const list = document.getElementById('live-group-dropdown');
        if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        document.getElementById('live-type-dropdown').style.display = 'none';
    }

    function selectLiveGroup(val, text) {
        document.getElementById('live-group-value').value = val;
        document.getElementById('live-group-display').value = text;
        document.getElementById('live-group-dropdown').style.display = 'none';
        handleLiveFilter();
    }

    function toggleLiveTypeDropdown() {
        const list = document.getElementById('live-type-dropdown');
        if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        document.getElementById('live-group-dropdown').style.display = 'none';
    }

    function selectLiveType(val, text) {
        document.getElementById('live-type-value').value = val;
        document.getElementById('live-type-display').value = text;
        document.getElementById('live-type-dropdown').style.display = 'none';
        handleLiveFilter();
    }


    function handleLiveFilter() {
        const groupVal = document.getElementById('live-group-value').value;
        const typeVal = document.getElementById('live-type-value').value;

        const searchInput = document.getElementById('live-search-input');
        const container = document.getElementById('live-list-container');
        const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';

        if (!currentLiveListRaw || currentLiveListRaw.length === 0) {
            const loading = document.getElementById('vod-loading');
            if (loading?.style.display === 'block' && loading.textContent) {
                container.replaceChildren();
                return;
            }
            container.innerHTML = '<div style="width:100%; text-align:center; color:#888;">当前没有成员在直播</div>';
            return;
        }

        const members = getMembers();
        const filtered = currentLiveListRaw.filter(item => {
            let matchGroup = true;
            if (groupVal !== 'all') {
                const memberId = item.userInfo ? item.userInfo.userId : item.userId;
                const teamName = item.userInfo ? item.userInfo.teamName : '';
                const nickname = item.userInfo ? item.userInfo.nickname : '';
                const code = getGroupCode(memberId, teamName, nickname);
                if (code !== groupVal) matchGroup = false;
            }

            let matchType = true;
            if (typeVal !== 'all') {
                const isRadio = (item.liveType === 2);
                const isRecord = (item.liveMode === 1);

                if (typeVal === 'record') {
                    if (!isRecord) matchType = false;
                } else if (typeVal === 'video') {
                    if (isRadio || isRecord) matchType = false;
                } else if (typeVal === 'radio') {
                    if (!isRadio) matchType = false;
                }
            }

            let matchKeyword = true;
            if (keyword) {
                const name = (item.userInfo ? item.userInfo.nickname : '').toLowerCase();
                const title = (item.title || item.liveTitle || '').toLowerCase();
                const memberId = String(item.userInfo ? (item.userInfo.userId || item.userInfo.id || '') : (item.userId || item.id || ''));
                const member = Array.isArray(members)
                    ? members.find(m => {
                        const ids = [m.id, m.userId, m.ownerId].map(value => String(value || ''));
                        const names = [m.ownerName, m.name, m.nickname, m.nickName].map(value => String(value || '').toLowerCase());
                        return (memberId && ids.includes(memberId)) || (name && names.includes(name));
                    })
                    : null;
                const rawPinyin = String(member?.pinyin || '');
                const pinyin = rawPinyin.toLowerCase();
                const initials = typeof getPinyinInitials === 'function'
                    ? getPinyinInitials(rawPinyin).toLowerCase()
                    : '';
                const searchText = [
                    name,
                    title,
                    pinyin,
                    initials,
                    String(member?.ownerName || '').toLowerCase(),
                    String(member?.team || member?.groupName || '').toLowerCase()
                ].join(' ');

                if (!searchText.includes(keyword)) {
                    matchKeyword = false;
                }
            }

            return matchGroup && matchType && matchKeyword;
        });

        if (filtered.length === 0) {
            container.innerHTML = '<div style="width:100%; text-align:center; color:#888; padding: 20px;">没有匹配的直播间</div>';
        } else {
            renderLiveList(filtered);
        }
    }

    function renderLiveList(list) {
        const liveListContainer = document.getElementById('live-list-container');
        liveListContainer.className = 'live-card-grid';
        liveListContainer.replaceChildren();
        list.forEach(item => {
            const card = document.createElement('div');
            card.className = 'live-card';
            const isMeetItem = item.source === 'meet48';
            const mode = isMeetItem ? 'meet-live' : 'live';
            card.addEventListener('contextmenu', event => {
                window.showLiveWindowMenu?.(event, item, mode);
            });
            const cover = normalizeMediaCoverUrl(item.coverPath, isMeetItem ? 'meet48' : 'pocket');
            let typeText = '视频', typeClass = 'badge-video';

            if (item.liveMode === 1) {
                typeText = '录屏';
                typeClass = 'badge-record';
            } else if (item.liveType === 2) {
                typeText = '电台';
                typeClass = 'badge-radio';
            }
            card.innerHTML = `
                <div class="live-badge ${typeClass}">${typeText}</div>
                <img src="${escapeHtml(cover)}" title="${window.desktop && window.desktop.platform !== 'web' ? '独立窗口播放' : '点击播放'}" style="cursor: pointer;">
                <div class="name">${escapeHtml(item.userInfo?.nickname || item.nickname || "未知成员")}</div>
                <div class="title">${escapeHtml(item.title)}</div>
            `;
            card.querySelector('img').onclick = event => {
                if (!window.desktop || window.desktop.platform === 'web') {
                    void directToPotPlayer(event, String(item.liveId), isMeetItem ? 'meet48' : 'pocket');
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.openLiveWindowForItem !== 'function') {
                    showToast('直播窗口尚未准备好，请重试');
                    return;
                }
                void window.openLiveWindowForItem(item, mode);
            };
            card.onclick = event => {
                if (window.desktop?.platform === 'web' && !event.target.closest('img')) {
                    if (!window.openWebDesktopLive?.(item, mode)) showToast('直播信息不完整，请刷新列表后重试');
                    return;
                }
                playLiveStream(item, mode);
            };
            liveListContainer.appendChild(card);
        });
    }

    function leaveView(previous, next, mode) {
        if (previous === 'media' && isVodMediaMode() && (next !== 'media' || mode !== getMode())) {
            vodState.requestVersion += 1;
            vodState.isLoading = false;
            clearTimeout(filterTimeout);
            resetLoadAllButton();
            vodPopularityObserver?.disconnect();
            vodPopularityObserver = null;
        }
        vodState.isSearchActive = false;
    }

    function showList({ returningFromPlayer = false } = {}) {
        const mode = getMode();
        const title = document.getElementById('live-view-title');
        const vodControls = document.getElementById('media-list-controls');
        const vodPagination = document.getElementById('vod-pagination-controls');
        const liveControls = document.getElementById('live-list-controls');
        const liveList = document.getElementById('live-list-container');
        const vodList = document.getElementById('vod-list-container');

        configureMeet48ListControls();

        if (isLiveMediaMode(mode)) {
            if (liveList) liveList.hidden = false;
            if (vodList) vodList.hidden = true;
            if (title && !returningFromPlayer) title.textContent = window.YayaRendererUtils.t(mode === 'meet-live' ? '海外直播' : '正在直播');
            if (vodControls) vodControls.style.display = 'none';
            if (vodPagination) vodPagination.style.display = 'none';
            if (liveControls) liveControls.style.display = 'flex';
            void fetchLiveList();
        } else if (isVodMediaMode(mode)) {
            if (liveList) liveList.hidden = true;
            if (vodList) vodList.hidden = false;
            if (title && !returningFromPlayer) title.textContent = window.YayaRendererUtils.t(mode === 'meet-vod' ? '海外回放' : '录播回放');
            if (vodControls) vodControls.style.display = 'flex';
            if (vodPagination) vodPagination.style.display = 'flex';
            if (liveControls) liveControls.style.display = 'none';

            const source = getMediaSourceForMode(mode);
            const sourceChanged = vodState.source !== source;
            if (sourceChanged && !returningFromPlayer) {
                vodState.source = source;
                vodState.resetPagination(vodState.currentGroup);
                vodState.filterSignature = getVodFilterSignature();
            }
            const hasMemberFilter = Boolean(document.getElementById('vod-member-filter')?.value.trim());
            if (!returningFromPlayer && (sourceChanged || !hasMemberFilter)) {
                void handleRefreshList();
            } else {
                renderVODListUI();
            }
        }
    }

    const catalogButtons = {
        'live-group-display': toggleLiveGroupDropdown,
        'live-type-display': toggleLiveTypeDropdown,
        'btn-live-refresh': fetchLiveList,
        'vod-group-display': toggleVodGroupDropdown,
        'vod-type-display': toggleVodTypeDropdown,
        'load-all-btn': handleLoadAllVod,
        'refresh-btn': handleRefreshList
    };
    for (const [id, handler] of Object.entries(catalogButtons)) {
        document.getElementById(id)?.addEventListener('click', handler);
    }
    document.getElementById('live-search-input')?.addEventListener('input', handleLiveFilter);
    document.getElementById('vod-member-filter')?.addEventListener('input', handleMemberFilter);

    const catalogDropdowns = {
        'live-group-dropdown': selectLiveGroup,
        'live-type-dropdown': selectLiveType,
        'vod-group-dropdown': selectVodGroup,
        'vod-type-dropdown': selectVodType,
        'member-suggestions': selectMember
    };
    for (const [id, select] of Object.entries(catalogDropdowns)) {
        document.getElementById(id)?.addEventListener('click', event => {
            const option = event.target.closest('[data-media-value]');
            if (option) select(option.dataset.mediaValue, option.dataset.mediaLabel);
        });
    }
    document.getElementById('vod-pagination-controls')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-vod-page]');
        if (!button || button.disabled) return;
        const page = button.dataset.vodPage;
        if (page === 'previous') handlePrevPage();
        else if (page === 'next') void handleNextPage();
        else void goToPage(Number(page));
    });

    return { leaveView, showList, renderVodGroupOptions, getFilteredVODList, renderVODListUI, fetchVODPageInternal, vodState };
}
