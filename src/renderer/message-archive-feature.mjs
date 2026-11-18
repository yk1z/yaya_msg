export function createMessageArchive({
    ipcRenderer, isWebRuntime, getView, showShield, hideShield, showToast,
    readStoredStringSetting, writeStoredStringSetting, readRuntimeCacheValue,
    getMembers, memberIdSet, memberNameMap, memberTeamMap, escapeHtml, replaceTencentEmoji,
    getTeamStyle, createCustomAudioPlayer, createCustomVideoPlayer, insertAudioPlayerIntoMessage,
    observeArchiveFlipUsers, decorateArchiveFlipUser, matchReplayByTime, playLiveOrArchiveFromMessage, openImageModal,
    confirmAction, getPocketGiftData, pauseActiveAudio
}) {
    const outputList = document.getElementById('outputList');
    const statusMsg = document.getElementById('statusMsg');
    const scrollContainer = document.getElementById('view-messages');
    const loadingMoreDiv = document.getElementById('loadingMore');
    const analysisBtn = document.getElementById('analysisBtn');
    const dateBtn = document.getElementById('dateBtn');
    const userListContainer = document.getElementById('userListContainer');
    const dateModal = document.getElementById('dateModal');
    const dateListContainer = document.getElementById('dateListContainer');
    const messageDateFromInput = document.getElementById('message-date-from');
    const messageDateToInput = document.getElementById('message-date-to');
    const contextModal = document.getElementById('contextModal');
    const contextListContainer = document.getElementById('contextListContainer');
    let allPosts = [];
    let allMemberOptions = [];
    let currentFilteredPosts = [];
    let renderedCount = 0;
    const WEB_MESSAGE_PAGE_SIZE = 100;
    let webMessagePage = 1;
    let webMessageHasMore = false;
    let webMessageSummary = { totalCount: 0, members: [] };
    let webMessageQueryToken = 0;
    let pagedMessageMatchedCount = 0;
    let pagedMessageCursors = new Map([[1, null]]);
    let pagedMessageLoadingMore = false;
    let pagedAnalysisPosts = null;
    let pagedAnalysisRequest = null;
    const desktopMessageStore = !isWebRuntime ? {
        sync: () => ipcRenderer.invoke('message-index-sync'),
        getSummary: () => ipcRenderer.invoke('message-index-summary'),
        queryPage: filters => ipcRenderer.invoke('message-index-query-page', filters),
        getContext: target => ipcRenderer.invoke('message-index-context', target),
        analyze: payload => ipcRenderer.invoke('message-index-analyze', payload),
        getAll: () => ipcRenderer.invoke('message-index-get-all')
    } : null;
    const getActiveMessageStore = () => isWebRuntime ? window.yayaWebMessageStore : desktopMessageStore;
    const getBatchSize = () => (filterType === 'video' || filterType === 'image') ? 6 : 30;
    let filterType = 'all';
    let messageAnalysisDrilldown = '';
    let userStats = [];
    let availableYears = new Set();
    let isRenderingBatch = false;
    let batchRenderScheduled = false;
    let messageRenderToken = 0;
    let currentSortOrder = readStoredStringSetting('msg_sort_order', 'desc');
    function toggleSortOrder() {
        const btn = document.getElementById('sortBtn');

        if (currentSortOrder === 'desc') {
            currentSortOrder = 'asc';
            btn.innerText = window.YayaRendererUtils.t('当前：最早在前');
        } else {
            currentSortOrder = 'desc';
            btn.innerText = window.YayaRendererUtils.t('当前：最新在前');
        }

        writeStoredStringSetting('msg_sort_order', currentSortOrder);

        applyFilters();
    }


    const messageIndexLoadState = {
        loading: false,
        initialized: false,
        status: '正在初始化',
        detail: '请稍候'
    };

    function isInitShieldVisible() {
        const shield = document.getElementById('loading-shield');
        if (!shield) return false;
        if (window.__shieldVisible) return true;
        return window.getComputedStyle(shield).display !== 'none';
    }

    function setMessageIndexLoadingState(loading, status = null, detail = null) {
        messageIndexLoadState.loading = loading;
        if (typeof status === 'string') messageIndexLoadState.status = status;
        if (typeof detail === 'string') messageIndexLoadState.detail = detail;

        if (window.__appStartupFailed) return;

        if (getView() === 'messages' && loading) {
            showShield(messageIndexLoadState.status, messageIndexLoadState.detail);
        } else if ((!loading || getView() !== 'messages') && isInitShieldVisible()) {
            hideShield();
        }
    }

    function syncMessageIndexLoadingShield() {
        if (window.__appStartupFailed) return;

        if (getView() === 'messages' && messageIndexLoadState.loading) {
            showShield(messageIndexLoadState.status, messageIndexLoadState.detail);
        } else if (isInitShieldVisible()) {
            hideShield();
        }
    }

    function isMessageViewVisible() {
        return !!(scrollContainer && scrollContainer.style.display !== 'none' && scrollContainer.clientHeight > 0);
    }

    function ensureMessageViewportFilled() {
        if (!isMessageViewVisible()) return;
        if (scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
            if (renderedCount < currentFilteredPosts.length) scheduleNextBatch();
            else loadNextPagedMessageBatch();
        }
    }

    function resetMessageRenderState() {
        messageRenderToken += 1;
        renderedCount = 0;
        isRenderingBatch = false;
        batchRenderScheduled = false;
        if (loadingMoreDiv) loadingMoreDiv.style.display = 'none';
    }

    function parseWebMessageRecords(records, sortOrder = currentSortOrder) {
        const groupedRecords = new Map();
        (Array.isArray(records) ? records : []).forEach((record) => {
            if (!record || (!record.itemHtml && !record.content && !record.contentHtml)) return;
            const memberName = String(record.memberName || '未命名成员');
            const fileName = String(record.fileName || 'messages.jsonl');
            const groupKey = `${memberName}\u0000${fileName}`;
            if (!groupedRecords.has(groupKey)) {
                groupedRecords.set(groupKey, { memberName, fileName, records: [] });
            }
            groupedRecords.get(groupKey).records.push(record);
        });

        const posts = [];
        groupedRecords.forEach((group) => {
            const html = `<ul>${group.records.map(jsonRecordToHtmlRow).join('\n')}</ul>`;
            const sourcePath = group.records[0]?.sourcePath || `web:${group.memberName}/${group.fileName}`;
            const parsedGroupPosts = parseHtmlContent(html, group.fileName, group.memberName);
            posts.push(...parsedGroupPosts.map((post, index) => ({
                ...post,
                ...window.YayaRendererFeatures.getArchiveFlipIds(group.records[index]),
                ...window.YayaMessageRoomFilter.getMessageRoomMetadata(group.records[index]),
                sortTime: Number(group.records[index]?.sortTime) || getMessagePostTimeMs(post),
                sourcePath: group.records[index]?.sourcePath || sourcePath,
                sourceFile: group.records[index]?.fileName || group.fileName,
                indexId: group.records[index]?.indexId || ''
            })));
        });
        posts.sort((a, b) => {
            const difference = getMessagePostTimeMs(a) - getMessagePostTimeMs(b);
            return sortOrder === 'desc' ? -difference : difference;
        });
        posts.forEach((post, index) => {
            post.originalIndex = index;
        });
        return posts;
    }

    function getWebMessageFilterInput() {
        const groupValue = String(document.getElementById('groupInput')?.value || '全部成员');
        return {
            query: String(document.getElementById('search-content-input')?.value || '').trim(),
            user: String(document.getElementById('search-user-input')?.value || '').trim(),
            member: (groupValue === '全部成员' || !groupValue) ? 'all' : groupValue,
            type: filterType,
            drilldown: messageAnalysisDrilldown,
            ...getMessageRoomFilter(),
            fromTime: parseMessageFilterDate(getMessageDateValue('from'), false),
            toTime: parseMessageFilterDate(getMessageDateValue('to'), true),
            sortOrder: currentSortOrder
        };
    }

    async function applyWebMessageFilters(options = {}) {
        const store = getActiveMessageStore();
        if (!store || typeof store.queryPage !== 'function') return;
        const append = options.append === true;
        if (append && (pagedMessageLoadingMore || !webMessageHasMore)) return;
        if (options.resetPage) {
            webMessagePage = 1;
            pagedMessageCursors = new Map([[1, null]]);
        }
        const requestedPage = append ? webMessagePage + 1 : webMessagePage;
        const queryToken = append ? webMessageQueryToken : ++webMessageQueryToken;
        pagedMessageLoadingMore = true;
        if (!append) {
            statusMsg.textContent = window.YayaRendererUtils.t('正在检索消息...');
        }

        try {
            const request = {
                ...getWebMessageFilterInput(),
                offset: (requestedPage - 1) * WEB_MESSAGE_PAGE_SIZE,
                limit: WEB_MESSAGE_PAGE_SIZE
            };
            if (!isWebRuntime) {
                request.cursor = pagedMessageCursors.get(requestedPage) || null;
                delete request.offset;
            }
            const result = await store.queryPage(request);
            if (queryToken !== webMessageQueryToken) return;

            const nextPosts = parseWebMessageRecords(result.records);
            if (append) {
                const startIndex = allPosts.length;
                nextPosts.forEach((post, index) => {
                    post.originalIndex = startIndex + index;
                });
                allPosts = allPosts.concat(nextPosts);
                currentFilteredPosts = currentFilteredPosts.concat(nextPosts);
                webMessagePage = requestedPage;
            } else {
                allPosts = nextPosts;
                currentFilteredPosts = allPosts.slice();
            }
            webMessageHasMore = !!result.hasMore;
            pagedMessageMatchedCount = Number.isFinite(Number(result.totalCount))
                ? Number(result.totalCount)
                : Number(webMessageSummary.totalCount) || 0;
            if (!isWebRuntime && result.nextCursor) {
                pagedMessageCursors.set(requestedPage + 1, result.nextCursor);
            }
            if (!append) {
                outputList.replaceChildren();
                resetMessageRenderState();
                if (scrollContainer) scrollContainer.scrollTop = 0;
            }
            if (!currentFilteredPosts.length) {
                const isDatabaseEmpty = webMessageSummary.totalCount === 0;
                outputList.innerHTML = isDatabaseEmpty
                    ? '<div class="placeholder-tip"><h3>还没有消息</h3><p>请返回主页进入“抓取”，选择成员并将抓取结果保存到消息检索。</p></div>'
                    : '<div class="placeholder-tip"><h3>没有匹配消息</h3><p>请调整关键词或筛选条件。</p></div>';
            } else if (isMessageViewVisible()) {
                if (append) scheduleNextBatch();
                else renderNextBatch();
            }
            updateStatus();
        } catch (error) {
            if (queryToken !== webMessageQueryToken) return;
            console.error('检索浏览器消息失败:', error);
            if (append) {
                statusMsg.textContent = window.YayaRendererUtils.t('继续加载消息失败，请稍后再试');
            } else {
                allPosts = [];
                currentFilteredPosts = [];
                webMessageHasMore = false;
                statusMsg.textContent = window.YayaRendererUtils.t('消息检索失败');
                outputList.innerHTML = `<div class="placeholder-tip"><h3>消息检索失败</h3><p>${escapeHtml(error?.message || '未知错误')}</p></div>`;
            }
        } finally {
            if (queryToken === webMessageQueryToken) pagedMessageLoadingMore = false;
        }
    }

    async function loadNextPagedMessageBatch() {
        if (pagedMessageLoadingMore || !webMessageHasMore) return;
        if (renderedCount < currentFilteredPosts.length) {
            scheduleNextBatch();
            return;
        }
        await applyWebMessageFilters({ append: true });
    }

    async function loadWebMessageData() {
        pagedAnalysisPosts = null;
        pagedAnalysisRequest = null;
        const store = getActiveMessageStore();
        const environmentName = isWebRuntime ? '浏览器' : '本地';
        setMessageIndexLoadingState(true, '正在读取消息', `正在准备${environmentName}消息索引`);
        statusMsg.textContent = window.YayaRendererUtils.t(`正在读取${environmentName}消息索引...`);

        if (!store || typeof store.getSummary !== 'function' || typeof store.queryPage !== 'function') {
            allPosts = [];
            currentFilteredPosts = [];
            setMessageIndexLoadingState(false);
            statusMsg.textContent = window.YayaRendererUtils.t('消息索引不可用');
            outputList.innerHTML = '<div class="placeholder-tip"><h3>无法读取消息</h3><p>当前消息索引服务不可用。</p></div>';
            return;
        }

        try {
            if (!isWebRuntime) {
                if (!window.desktop.isRoomWindow) {
                    try {
                        await window.desktop.messageArchive?.migrateLegacyHtml();
                    } catch (error) {
                        console.warn('迁移旧版消息失败:', error);
                    }
                }
                await store.sync();
            }
            webMessageSummary = await store.getSummary();
            allMemberOptions = Array.from(new Set(webMessageSummary.members || [])).sort();
            messageIndexLoadState.initialized = true;
            setMessageIndexLoadingState(false);
            initDateSelectors();
            const sortBtn = document.getElementById('sortBtn');
            if (sortBtn) sortBtn.innerText = window.YayaRendererUtils.t(currentSortOrder === 'asc' ? '当前：最早在前' : '当前：最新在前');
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.disabled = false;
            if (analysisBtn) analysisBtn.disabled = false;
            if (dateBtn) dateBtn.disabled = false;
            const giftAnalysisBtn = document.getElementById('giftAnalysisBtn');
            const speechAnalysisBtn = document.getElementById('speechAnalysisBtn');
            if (giftAnalysisBtn) giftAnalysisBtn.disabled = false;
            if (speechAnalysisBtn) speechAnalysisBtn.disabled = false;
            const dateTrigger = document.querySelector('#message-date-wrapper .flip-date-trigger');
            if (dateTrigger) dateTrigger.disabled = false;
            webMessagePage = 1;
            await applyWebMessageFilters({ resetPage: true });
        } catch (error) {
            console.error('读取浏览器消息索引失败:', error);
            allPosts = [];
            currentFilteredPosts = [];
            setMessageIndexLoadingState(false);
            statusMsg.textContent = window.YayaRendererUtils.t('消息索引读取失败');
            outputList.innerHTML = `<div class="placeholder-tip"><h3>消息读取失败</h3><p>${escapeHtml(error?.message || '未知错误')}</p></div>`;
        }
    }

    async function ensurePagedAnalysisPosts() {
        if (pagedAnalysisPosts) return pagedAnalysisPosts;
        if (pagedAnalysisRequest) return pagedAnalysisRequest;
        const store = getActiveMessageStore();
        if (!store || typeof store.getAll !== 'function') return null;

        const request = store.getAll().then(records => {
            const posts = parseWebMessageRecords(records);
            if (pagedAnalysisRequest === request) pagedAnalysisPosts = posts;
            return posts;
        }).finally(() => {
            if (pagedAnalysisRequest === request) pagedAnalysisRequest = null;
        });
        pagedAnalysisRequest = request;
        return request;
    }

    async function loadMessageAnalysis(kind) {
        const store = getActiveMessageStore();
        if (!store || typeof store.analyze !== 'function') {
            throw new Error('本地统计服务不可用');
        }
        const memberNames = new Set(allMemberOptions || []);
        if (memberNameMap && typeof memberNameMap.keys === 'function') {
            for (const name of memberNameMap.keys()) memberNames.add(String(name));
        }
        const memberIds = memberIdSet && typeof memberIdSet.values === 'function'
            ? Array.from(memberIdSet.values(), value => String(value))
            : [];
        const giftData = getPocketGiftData();
        const giftPrices = Array.isArray(giftData)
            ? giftData.map(gift => ({
                id: gift.id,
                name: gift.name,
                cost: Number(gift.cost) || 0,
                source: gift.source,
                requiresDateReview: gift.requiresDateReview === true
            }))
            : [];
        return store.analyze({
            kind,
            filters: getWebMessageFilterInput(),
            memberNames: Array.from(memberNames),
            memberIds,
            giftPrices,
            giftPriceRules: window.YayaGiftPriceSnapshot.rules
        });
    }

    function applyMessageAnalysisDrilldown(kind, payload = {}) {
        const contentInput = document.getElementById('search-content-input');
        const userInput = document.getElementById('search-user-input');
        messageAnalysisDrilldown = kind === 'gift' || kind === 'interaction' ? kind : '';
        filterType = 'all';
        document.querySelectorAll('.filter-chip').forEach(element => element.classList.remove('active'));
        document.getElementById('filter-all')?.classList.add('active');

        if (kind === 'interaction') {
            const names = Array.isArray(payload.names) ? payload.names.map(String).filter(Boolean) : [];
            if (contentInput) contentInput.value = names.join('|');
            if (userInput) userInput.value = '';
        } else if (kind === 'gift') {
            if (contentInput) contentInput.value = '';
            if (userInput) userInput.value = String(payload.userId || payload.name || '').trim();
        }

        const view = document.getElementById('view-messages');
        if (view) view.scrollTop = 0;
        return applyFilters();
    };

    function clearWebMessageData() {
        const clearMessages = async () => {
            try {
                await window.yayaWebMessageStore.clear();
                await loadWebMessageData();
                showToast('浏览器消息已清空');
            } catch (error) {
                showToast(`清空失败：${error?.message || '未知错误'}`);
            }
        };

        confirmAction('确定清空当前浏览器中保存的全部消息吗？此操作无法撤销。', clearMessages);
    };



    async function openMessageDataFolder() {
        try {
            const result = await ipcRenderer.invoke('open-message-data-folder');
            if (!result || !result.success) {
                throw new Error(result?.msg || '无法打开数据文件夹');
            }
        } catch (error) {
            showToast(error.message || '无法打开数据文件夹');
        }
    }

    function stripAudioReplyPrefixes(text) {
        return String(text || '')
            .replace(/\[(?:语音回复|语音礼物回复)\]\s*回复\s*/g, '')
            .replace(/(^|>|\s)回复\s+(?=[^<\s])/g, '$1')
            .replace(/^\s+|\s+$/g, '');
    }

    function formatJsonRecordTime(record) {
        const timeStr = String(record.timeStr || record.time || '').trim();
        if (timeStr) return timeStr;

        const sortTime = Number(record.sortTime || record.msgTime || 0);
        const date = new Date(sortTime || Date.now());
        if (Number.isNaN(date.getTime())) return '';
        const pad = (value) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    function normalizeJsonMessageMediaUrl(value) {
        const mediaPath = String(value || '').trim();
        if (!mediaPath) return '';
        if (/^https?:\/\//i.test(mediaPath)) return mediaPath;
        if (mediaPath.includes('48.cn')) return `https://${mediaPath.replace(/^\/+/, '')}`;
        return mediaPath.startsWith('/')
            ? `https://source3.48.cn${mediaPath}`
            : `https://source3.48.cn/${mediaPath}`;
    }

    function structuredJsonValueText(value, fallback = '') {
        if (value === null || value === undefined) return String(fallback || '');
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        try {
            return JSON.stringify(value);
        } catch (error) {
            return String(fallback || '');
        }
    }

    function renderStructuredGiftContent(giftInfo = {}, record = {}) {
        giftInfo = window.YayaGiftPricing.normalizeGiftInfo(giftInfo, { rules: window.YayaGiftPriceSnapshot.rules });
        const giftName = structuredJsonValueText(giftInfo.giftName || giftInfo.name, '未知礼物');
        const giftNum = Number(giftInfo.giftNum || giftInfo.num || giftInfo.count || 1) || 1;
        const giftImg = window.YayaRendererUtils.resolvePocketImageUrl(normalizeJsonMessageMediaUrl(giftInfo.picPath || giftInfo.giftPic || giftInfo.image || ''));
        const giftPrice = window.resolvePocketGiftPrice(giftInfo, { historical: true, ...window.YayaGiftPricing.messageContext(record) });
        const unitCost = giftPrice.unitCost;

        const costDisplay = window.YayaGiftPricing.isScoringGift(giftInfo)
            ? `<span style="margin-left:5px; color:#fa8c16; font-weight:bold;">${window.YayaGiftPricing.giftScoreText(giftInfo, { rules: window.YayaGiftPriceSnapshot.rules })}</span>` : unitCost !== null
            ? `<span style="margin-left:5px; color:#fa8c16; font-weight:bold;">${unitCost * giftNum} 🍗</span>`
            : '<span style="margin-left:5px; color:var(--text-sub);">价格待核</span>';

        return `
            <div class="mb-2" data-gift-id="${escapeHtml(giftInfo.giftId || giftInfo.id || '')}" data-gift-name="${escapeHtml(giftName)}" data-gift-num="${giftNum}" data-gift-is-score="${window.YayaGiftPricing.isScoringGift(giftInfo) ? '1' : '0'}" data-gift-message-cost="${giftPrice.basis === 'message' ? unitCost : ''}" style="display:flex; align-items:center; background:#fff0f6; padding:6px 8px; border-radius:6px; border:1px solid #ffadd2; max-width: 300px;">
                ${giftImg ? `<img class="pocket-gift-image" src="${escapeHtml(giftImg)}" style="width: 25px !important; height: 25px !important; max-width: 32px !important; max-height: 32px !important; object-fit: contain !important; margin: 0 8px 0 0 !important; border-radius: 4px; box-shadow: none !important;">` : '<span style="font-size:24px; margin-right:8px;">🎁</span>'}
                <div style="flex: 1; overflow: hidden;">
                    <div style="color:#eb2f96; font-weight:bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">送出礼物：${escapeHtml(giftName)}</div>
                    <div style="font-size:11px; color:#888;">数量: x${giftNum} ${costDisplay}</div>
                </div>
            </div>`;
    }

    function renderStructuredJsonContent(record, senderName) {
        const content = record.content && typeof record.content === 'object'
            ? record.content
            : { text: structuredJsonValueText(record.content ?? record.text ?? '') };
        const messageType = String(record.messageType || record.msgType || content.messageType || 'TEXT').toUpperCase();
        const contentMessageType = String(content.messageType || '').toUpperCase();

        if (messageType === 'TEXT') {
            const text = structuredJsonValueText(content.bodys ?? content.text ?? content);
            return `<p class="mb-2 template-pre">${escapeHtml(text)}</p>`;
        }

        if (messageType === 'IMAGE') {
            const url = normalizeJsonMessageMediaUrl(content.url);
            return `<div class="mb-2"><img class="template-media" src="${escapeHtml(url)}" loading="lazy" style="cursor: pointer;"></div><div class="mb-2"></div>`;
        }

        if (['GIFT_TEXT', 'CHANNEL_PRESENT_TEXT', 'PRESENT_TEXT'].includes(messageType)
            || ['GIFT_TEXT', 'CHANNEL_PRESENT_TEXT', 'PRESENT_TEXT'].includes(contentMessageType)) {
            return renderStructuredGiftContent(content.giftInfo || content, record);
        }

        if (messageType.startsWith('RED_PACKET') || contentMessageType.startsWith('RED_PACKET')) {
            const blessMessage = structuredJsonValueText(content.blessMessage, '送来了红包祝福');
            const creatorName = structuredJsonValueText(content.creatorName, senderName || '未知用户');
            const starName = structuredJsonValueText(content.starName, '');
            const packetImage = normalizeJsonMessageMediaUrl(content.openImgUrl || content.coverUrl);
            return `
                <div class="mb-2" style="display:flex; gap:8px; align-items:center; background:linear-gradient(135deg, rgba(255,120,117,0.12) 0%, rgba(255,120,117,0.04) 100%), rgba(0,0,0,0.02); padding:6px 8px; border-radius:10px; border:1px solid rgba(255,110,110,0.22); width: 220px; max-width: 220px; box-sizing: border-box;">
                    <img src="${escapeHtml(packetImage)}" style="width:34px; height:34px; border-radius:6px; object-fit:cover; flex-shrink:0; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
                    <div style="min-width:0; flex:1;">
                        <div style="font-size:10px; color:#ff7875; font-weight:bold; margin-bottom:2px;">红包</div>
                        <div style="font-size:12px; color:var(--text-main); font-weight:bold; line-height:1.35; word-break:break-word;">${escapeHtml(blessMessage)}</div>
                        <div style="font-size:11px; color:var(--text-sub); margin-top:4px; line-height:1.35; word-break:break-word;">${escapeHtml(creatorName)}${starName ? ` · ${escapeHtml(starName)}` : ''}</div>
                    </div>
                </div>`;
        }

        if (messageType === 'VIDEO' || messageType === 'AUDIO') {
            const url = normalizeJsonMessageMediaUrl(content.url);
            const isVideo = messageType === 'VIDEO';
            const mediaTag = isVideo ? 'video' : 'audio';
            const label = isVideo ? '视频' : '语音';
            return `<div class="mb-2"><${mediaTag} class="template-media" src="${escapeHtml(url)}" controls></${mediaTag}></div><div class="mb-2">${label} - <a class="color-fg-accent" href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></div>`;
        }

        if (messageType === 'REPLY' || messageType === 'GIFTREPLY') {
            const info = content.replyInfo || content.giftReplyInfo
                || content.bodys?.replyInfo || content.bodys?.giftReplyInfo || {};
            const text = structuredJsonValueText(info.text ?? content.text ?? '');
            const replyName = structuredJsonValueText(info.replyName, '未知用户');
            const replyText = structuredJsonValueText(info.replyText, '未知消息');
            return `<p class="mb-2 template-pre">${escapeHtml(text)}</p><blockquote class="ml-2 mb-2 p-2 color-bg-accent template-pre" style="border-left: 4px solid #d0d7de; color: #57606a;">${escapeHtml(replyName)}：${escapeHtml(replyText)}</blockquote>`;
        }

        if (messageType === 'EXPRESSIMAGE') {
            const url = normalizeJsonMessageMediaUrl(content.expressImgInfo?.emotionRemote || content.url);
            return `<div class="mb-2"><img class="template-image-express-image" src="${escapeHtml(url)}"></div>`;
        }

        if (messageType === 'LIVEPUSH') {
            const info = content.livePushInfo || {};
            const title = structuredJsonValueText(info.liveTitle, '直播开始了');
            const liveId = structuredJsonValueText(info.liveId, '');
            const coverUrl = info.liveCover
                ? (/^https?:\/\//i.test(info.liveCover) ? info.liveCover : `https://source.48.cn${info.liveCover}`)
                : '';
            return liveId
                ? `<a href="live/playdetail?id=${escapeHtml(liveId)}" data-title="${escapeHtml(title)}" data-cover="${escapeHtml(coverUrl)}" target="_blank" style="display:none"></a>`
                : `直播 - ${escapeHtml(title)}`;
        }

        if (messageType === 'SHARE_LIVE' || contentMessageType === 'SHARE_LIVE') {
            const info = content.shareInfo || {};
            const title = structuredJsonValueText(info.shareTitle, '直播分享');
            const match = structuredJsonValueText(info.jumpPath, '').match(/id=(\d+)/);
            const liveId = match ? match[1] : '';
            const coverUrl = info.sharePic
                ? (/^https?:\/\//i.test(info.sharePic) ? info.sharePic : `https://source.48.cn${info.sharePic}`)
                : '';
            const memberName = structuredJsonValueText(info.liveUserName, '');
            return liveId
                ? `<a href="live/playdetail?id=${escapeHtml(liveId)}" data-title="${escapeHtml(title)}" data-cover="${escapeHtml(coverUrl)}" data-member="${escapeHtml(memberName)}" target="_blank" style="display:none"></a>`
                : `[分享] ${escapeHtml(title)}`;
        }

        if (['AUDIO_GIFT_REPLY', 'AUDIO_REPLY'].includes(messageType) || ['AUDIO_GIFT_REPLY', 'AUDIO_REPLY'].includes(contentMessageType)) {
            const info = content.replyInfo || content.giftReplyInfo || content;
            const voiceUrl = normalizeJsonMessageMediaUrl(info.voiceUrl);
            const replyName = structuredJsonValueText(info.replyName, '未知用户');
            const replyText = structuredJsonValueText(info.replyText, '');
            return `<div class="mb-2"><audio class="template-media" src="${escapeHtml(voiceUrl)}" controls></audio></div><div class="mb-2">语音 - <a class="color-fg-accent" href="${escapeHtml(voiceUrl)}" target="_blank">${escapeHtml(voiceUrl)}</a></div><blockquote class="ml-2 mb-2 p-2 color-bg-accent template-pre" style="border-left: 4px solid #d0d7de; color: #57606a;">${escapeHtml(replyName)}：${escapeHtml(replyText)}</blockquote>`;
        }

        if (['FLIPCARD', 'FLIPCARD_AUDIO', 'FLIPCARD_VIDEO'].includes(messageType)) {
            const possibleKeys = ['flipCardInfo', 'filpCardInfo', 'flipCardAudioInfo', 'filpCardAudioInfo', 'flipCardVideoInfo', 'filpCardVideoInfo'];
            let info = null;
            for (const key of possibleKeys) {
                if (content[key]) {
                    info = content[key];
                    break;
                }
                if (content.bodys && content.bodys[key]) {
                    info = content.bodys[key];
                    break;
                }
            }
            const question = structuredJsonValueText(info?.question ?? content.question, '问题');
            const rawAnswer = info?.answer ?? content.answer ?? '回答';
            let answerText = structuredJsonValueText(rawAnswer, '回答');
            let mediaHtml = '';

            if (messageType !== 'FLIPCARD') {
                let answerObject = rawAnswer;
                if (typeof answerObject === 'string') {
                    try {
                        answerObject = JSON.parse(answerObject);
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/message-archive-feature.mjs'); }
                }
                if (answerObject && typeof answerObject === 'object' && answerObject.url) {
                    const rawUrl = String(answerObject.url);
                    const mediaUrl = rawUrl.includes('48.cn')
                        ? normalizeJsonMessageMediaUrl(rawUrl)
                        : `https://mp4.48.cn/${rawUrl.replace(/^\/+/, '')}`;
                    const mediaTag = messageType === 'FLIPCARD_VIDEO' ? 'video' : 'audio';
                    mediaHtml = `<div class="mb-2"><${mediaTag} class="template-media" src="${escapeHtml(mediaUrl)}" controls preload="metadata"></${mediaTag}></div>`;
                    answerText = mediaUrl;
                }
            }

            const answerHtml = mediaHtml
                ? `<a class="color-fg-accent template-pre" href="${escapeHtml(answerText)}" target="_blank">${escapeHtml(answerText)}</a>`
                : escapeHtml(answerText);
            return `<p class="mb-2"><strong>翻牌问题：</strong>${escapeHtml(question)}</p><p class="mb-2"><strong>回答：</strong>${answerHtml}</p>${mediaHtml}`;
        }

        const fallbackText = structuredJsonValueText(content.text ?? content.bodys ?? content, '');
        return `<p class="mb-2 template-pre">${escapeHtml(fallbackText)}</p>`;
    }

    function jsonRecordToHtmlRow(record) {
        if (!record || typeof record !== 'object') return '';

        if (record.itemHtml) {
            return String(record.itemHtml);
        }

        const sender = record.sender && typeof record.sender === 'object' ? record.sender : {};
        const avatarUrl = window.YayaRendererUtils.resolvePocketImageUrl(sender.avatarUrl || record.avatarUrl || record.avatar || '');
        const avatarHtml = record.avatarHtml
            || (avatarUrl ? `<img class="avatar avatar-5 mr-2" src="${escapeHtml(avatarUrl)}" loading="lazy">` : '');
        const nameStr = String(sender.name || record.nameStr || record.nickName || record.nickname || record.senderName || 'Unknown');
        const userId = sender.userId == null ? (record.userId == null ? '' : String(record.userId)) : String(sender.userId);
        const roleId = sender.roleId == null ? (record.roleId == null ? '' : String(record.roleId)) : String(sender.roleId);
        let contentHtml = record.schemaVersion && record.content
            ? renderStructuredJsonContent(record, nameStr)
            : (String(record.contentHtml || '').trim()
                || `<p class="mb-2 template-pre">${escapeHtml(String(record.text || record.content || ''))}</p>`);
        const contentSeed = `${record.messageType || record.msgType || ''} ${contentHtml} ${record.text || ''}`;
        const recordLooksFlip = /FLIPCARD/i.test(String(record.messageType || record.msgType || ''))
            || /翻牌问题[:：]/.test(contentSeed);
        if (recordLooksFlip && !/回答[:：]/.test(contentHtml)) {
            contentHtml += '<p class="mb-2"><strong>回答：</strong></p>';
        }
        const timeStr = formatJsonRecordTime(record);
        const exportKey = String(record.exportKey || record.key || record.fetchKey || '');

        return `
            <li class="Box-row" data-export-key="${escapeHtml(exportKey)}">
                <div class="mb-2">
                    ${avatarHtml}
                    <span data-userid="${escapeHtml(userId)}" data-roleid="${escapeHtml(roleId)}">${escapeHtml(nameStr)}</span>
                </div>
                ${contentHtml}
                <time class="d-block">${escapeHtml(timeStr)}</time>
            </li>
        `;
    }

    function parseHtmlContent(htmlString, fileName, groupName) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const rowElements = doc.querySelectorAll('.Box-row');
        const extracted = [];
        rowElements.forEach(row => {
            const exportKey = row.getAttribute('data-export-key') || '';
            const timeEl = row.querySelector('time');
            const timeStr = timeEl ? timeEl.innerText.trim() : '';
            const originalRowHtml = row.innerHTML;
            const cleanRow = row.cloneNode(true);
            cleanRow.querySelectorAll('.template-media').forEach(el => el.classList.remove('template-media'));
            cleanRow.querySelectorAll('audio').forEach(el => el.remove());
            if (cleanRow.querySelector('time')) cleanRow.querySelector('time').remove();
            if (cleanRow.querySelector('div.mb-2')) cleanRow.querySelector('div.mb-2').remove();
            let audioUrl = '',
                videoUrl = '',
                liveId = null,
                isLiveText = false,
                liveTitle = '';
            const idMatch = cleanRow.innerHTML.match(/[?&]id=(\d+)/);
            if (idMatch) {
                liveId = idMatch[1];
                cleanRow.querySelectorAll('div, p').forEach(node => {
                    if (node.innerText.includes('直播') && node.innerText.includes('http')) node.remove();
                });
            }
            row.querySelectorAll('div').forEach(div => {
                const txt = div.innerText.trim();
                if (/^(音频|语音)[\s\u00A0]*[-–—][\s\u00A0]*http/i.test(txt)) {
                    const link = div.querySelector('a');
                    if (link) audioUrl = link.href;
                    else {
                        const match = txt.match(/http\S+/);
                        if (match) audioUrl = match[0];
                    }
                }
                if (/^(视频)[\s\u00A0]*[-–—][\s\u00A0]*http/i.test(txt)) {
                    const link = div.querySelector('a');
                    if (link) videoUrl = link.href;
                    else {
                        const match = txt.match(/http\S+/);
                        if (match) videoUrl = match[0];
                    }
                }
            });
            row.querySelectorAll('a').forEach(link => {
                const href = link.href || link.getAttribute('href') || '';
                if (!href) return;
                if (!audioUrl && /\.(mp3|aac|m4a)(?:$|\?)/i.test(href)) audioUrl = href;
                if (!videoUrl && /\.(mp4|mov)(?:$|\?)/i.test(href)) videoUrl = href;
            });
            cleanRow.querySelectorAll('div, p').forEach(node => {
                const nodeText = node.innerText.trim();
                const hasMediaLink = Array.from(node.querySelectorAll('a')).some(link => {
                    const href = link.href || link.getAttribute('href') || '';
                    return /\.(mp3|aac|m4a|mp4|mov)(?:$|\?)/i.test(href);
                });
                if (/^(图片|视频|音频|语音)[\s\u00A0]*[-–—][\s\u00A0]*http/i.test(nodeText)) node.remove();
                if (/^回答[:：]/.test(nodeText) && hasMediaLink) {
                    node.innerHTML = '<strong>回答：</strong>';
                }
            });
            const textLiveMatch = cleanRow.innerText.trim().match(/(?:^|\s)直播(?:通知)?[\s\u00A0]*[-–—:：~]\s*([^\r\n]*)/i);
            if (!liveId && textLiveMatch) {
                isLiveText = true;
                liveTitle = textLiveMatch[1].trim() || '直播回放';
                cleanRow.replaceChildren();
            }

            const giftContainer = cleanRow.querySelector('div[style*="background:#fff0f6"]');
            if (giftContainer) {
                const nameDiv = giftContainer.querySelector('div[style*="color:#eb2f96"]');
                const countDiv = giftContainer.querySelector('div[style*="font-size:11px"]');

                if (nameDiv && countDiv) {
                    if (!countDiv.innerText.includes('🍗')) {
                        const nameMatch = nameDiv.innerText.match(/送出礼物：(.+)/);
                        const numMatch = countDiv.innerText.match(/数量: x(\d+)/);

                        if (nameMatch && numMatch) {
                            const gName = nameMatch[1].trim();
                            const gNum = parseInt(numMatch[1]);

                            const price = window.resolvePocketGiftPrice({
                                giftId: giftContainer.dataset.giftId || '', giftName: gName
                            }, { historical: true }).unitCost;
                            if (price !== null) countDiv.innerHTML += ` <span style="margin-left:5px; color:#fa8c16; font-weight:bold;">(${price * gNum}🍗)</span>`;
                        }
                    }
                }
            }

            let avatarHtml = '',
                avatarUrl = '',
                nameStr = 'Unknown',
                userId = null,
                isMember = false;


            const VIP_IDS = [];

            const originalHeader = row.querySelector('div.mb-2');
            if (originalHeader) {
                const img = originalHeader.querySelector('img');
                if (img) {
                    avatarHtml = img.outerHTML;
                    avatarUrl = img.getAttribute('src') || '';
                }

                const span = originalHeader.querySelector('span');
                if (span) {
                    nameStr = span.innerText;
                    userId = span.getAttribute('data-userid');
                    const roleId = span.getAttribute('data-roleid');


                    if (roleId && parseInt(roleId) > 1) {
                        isMember = true;
                    }


                    const style = span.getAttribute('style') || '';
                    if (style.includes('#ff4d4f') || style.includes('bold') || style.includes('font-weight:700')) {
                        isMember = true;
                    }


                    if (userId && VIP_IDS.includes(String(userId))) {
                        isMember = true;
                    }


                }
            }

            let rowHtml = cleanRow.innerHTML;
            const isFlip = originalRowHtml.includes('翻牌问题：') && originalRowHtml.includes('回答：');
            if (isFlip) {
                rowHtml = rowHtml.replace(/翻牌问题：/g, '<span class="flip-label question-tag">翻牌提问</span>');
                rowHtml = rowHtml.replace(/回答：/g, '<br><span class="flip-label answer-tag">成员回答</span>');
                cleanRow.innerHTML = rowHtml;
                if (cleanRow.querySelector('blockquote')) cleanRow.querySelector('blockquote').classList.add('flip-message-quote');
            }

            rowHtml = stripAudioReplyPrefixes(rowHtml);
            cleanRow.innerHTML = rowHtml;
            let year = '',
                month = '',
                day = '',
                dateFull = '';
            if (timeStr) {
                const datePart = timeStr.split(' ')[0];
                dateFull = datePart;
                const parts = datePart.split('-');
                if (parts.length === 3) {
                    year = parts[0];
                    month = parseInt(parts[1]).toString();
                    day = parseInt(parts[2]).toString();
                }
            }
            extracted.push({
                avatarHtml,
                avatarUrl,
                nameStr,
                giftInfo: giftContainer ? {
                    giftId: giftContainer.dataset.giftId || '',
                    giftName: giftContainer.dataset.giftName || '',
                    giftNum: Number(giftContainer.dataset.giftNum) || 1,
                    isScore: giftContainer.dataset.giftIsScore === '1',
                    ...(giftContainer.dataset.giftMessageCost !== undefined && giftContainer.dataset.giftMessageCost !== ''
                        ? { money: Number(giftContainer.dataset.giftMessageCost) } : {})
                } : null,
                contentHtml: cleanRow.innerHTML,
                text: stripAudioReplyPrefixes(cleanRow.innerText).toLowerCase(),
                timeStr,
                userId,
                year,
                month,
                day,
                dateFull,
                exportKey,
                hasImg: !!row.querySelector('img.template-media'),
                hasVideo: !!videoUrl || !!cleanRow.querySelector('video') || (row.innerText.includes('视频') && row.innerText.includes('http')),
                hasAudio: !!audioUrl || !!row.querySelector('audio') || row.innerText.includes('音频'),
                audioUrl,
                videoUrl,
                isReply: isFlip,
                groupName,
                liveId,
                isLiveText,
                liveTitle
            });
        });
        return extracted;
    }

    function scheduleNextBatch() {
        if (batchRenderScheduled || isRenderingBatch) return;
        const renderToken = messageRenderToken;
        batchRenderScheduled = true;
        window.requestAnimationFrame(() => {
            batchRenderScheduled = false;
            if (renderToken !== messageRenderToken) return;
            renderNextBatch(renderToken);
        });
    }

    function createMessageListRow(post) {
        const div = document.createElement('div');
        div.className = 'Box-row';
        div.style.position = 'relative';
        div.style.contentVisibility = 'auto';
        div.style.containIntrinsicSize = '280px';
        if (post.userId && String(post.userId) !== 'undefined') {
            const idTag = document.createElement('div');
            idTag.textContent = post.userId;

            idTag.style.cssText = `
                position: absolute;
                top: 14px;
                right: 15px;
                background: var(--chip-bg);
                border: 1px solid var(--border);
                color: var(--text-sub);
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                z-index: 5;
                display: flex;
                align-items: center;
                cursor: pointer;
                user-select: none;
                transition: all 0.2s ease;
                box-shadow: 0 1px 2px rgba(0,0,0,0.02);
            `;

            idTag.onclick = (e) => window.filterByUserId(post.userId);
            idTag.title = window.YayaRendererUtils.t("点击筛选此人的所有消息");

            idTag.onmouseenter = () => {
                idTag.style.borderColor = 'var(--primary)';
                idTag.style.color = 'var(--primary)';
                idTag.style.transform = 'translateY(-1px)';
                idTag.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
            };
            idTag.onmouseleave = () => {
                idTag.style.borderColor = 'var(--border)';
                idTag.style.color = 'var(--text-sub)';
                idTag.style.transform = 'none';
                idTag.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)';
            };

            div.appendChild(idTag);
        }
        const header = document.createElement('div');
        header.className = 'user-header-row';


        const isMemberPost =
            post.isMember ||
            (post.nameStr === post.groupName) ||
            post.isReply ||
            (typeof memberNameMap !== 'undefined' && memberNameMap.has(post.nameStr)) ||
            (typeof memberIdSet !== 'undefined' && post.userId && memberIdSet.has(String(post.userId)));


        let nameStyle = '';
        if (String(post.userId) === '121569667') {
            nameStyle = 'color: #056de8; font-weight: bold;';
        } else {
            nameStyle = isMemberPost ? 'color: #FB7299; font-weight: bold;' : 'color: var(--text); opacity: 0.9;';
        }

        header.innerHTML = `
            ${post.avatarHtml}
            <div class="user-info-col">
                <div>
                    <span class="username" style="${nameStyle}">${escapeHtml(post.nameStr)}</span>
                </div>
                <span class="timestamp">${escapeHtml(post.timeStr)}</span>
            </div>
        `;
        const profileAvatar = header.querySelector('img.avatar, img.msg-avatar');
        if (profileAvatar && post.userId && String(post.userId) !== 'undefined') {
            profileAvatar.classList.add('message-profile-avatar');
            profileAvatar.title = window.YayaRendererUtils.t('查看用户主页');
            profileAvatar.tabIndex = 0;
            profileAvatar.setAttribute('role', 'button');
            const openProfile = event => {
                event.stopPropagation();
                if (typeof window.openFollowedUserProfile !== 'function') {
                    showToast('用户主页模块还没有准备好');
                    return;
                }
                window.openFollowedUserProfile(
                    String(post.userId),
                    post.nameStr || '口袋用户',
                    profileAvatar.currentSrc || profileAvatar.src || './icon.png',
                    isMemberPost
                );
            };
            profileAvatar.addEventListener('click', openProfile);
            profileAvatar.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openProfile(event);
            });
        }
        const content = document.createElement('div');
        content.innerHTML = replaceTencentEmoji(post.contentHtml);
        content.querySelectorAll('img').forEach(img => {
            img.loading = 'lazy';
            img.decoding = 'async';
        });
        try {
            const audioRegex = /(?:音频[\s\u00A0]*[-–—][\s\u00A0]*)?(https?:\/\/[^\s<"']+\.(?:mp3|aac|m4a))/gi;
            if (audioRegex.test(content.innerHTML)) content.innerHTML = content.innerHTML.replace(audioRegex, '<span class="temp-audio-placeholder" data-src="$1"></span>');
            content.querySelectorAll('a, .temp-audio-placeholder').forEach(el => {
                let src = el.tagName === 'SPAN' ? el.getAttribute('data-src') : (/\.(mp3|aac|m4a)$/i.test(el.href) ? el.href : '');
                if (src) {
                    const player = createCustomAudioPlayer(src);
                    player.style.display = 'inline-flex';
                    player.style.margin = '4px 0';
                    if (el.tagName === 'A') el.parentNode.replaceChild(player, el);
                    else {
                        const parent = el.closest('a');
                        if (parent) parent.parentNode.replaceChild(player, parent);
                        else el.parentNode.replaceChild(player, el);
                    }
                }
            });
        } catch (e) { window.YayaRendererUtils.reportIgnoredError(e, 'src/renderer/message-archive-feature.mjs'); }
        content.classList.add('message-content-clickable');
        content.onclick = (e) => {
            if (e.target.tagName === 'IMG' && !e.target.classList.contains('avatar')) {
                openImageModal(e.target.src);
                return;
            }
            if (e.target.tagName === 'VIDEO' || e.target.closest('.audio-wrapper') || e.target.closest('.video-wrapper') || e.target.closest('.vod-card-row') || e.target.tagName === 'BUTTON') return;
            openContextModal(post.originalIndex);
        };
        let hasVideoTag = false;
        content.querySelectorAll('video').forEach(rawVideo => {
            const src = rawVideo.src || rawVideo.querySelector('source')?.src;
            if (src) {
                rawVideo.parentNode.replaceChild(createCustomVideoPlayer(src), rawVideo);
                hasVideoTag = true;
            }
        });
        if (post.videoUrl && !hasVideoTag) content.appendChild(createCustomVideoPlayer(post.videoUrl));
        if (post.liveId) {
            const card = document.createElement('div');
            card.className = 'vod-card-row';
            card.style.cssText = 'margin-top: 10px; width: 100%; box-sizing: border-box; background: var(--input-bg); cursor: pointer;';

            let displayTitle = post.liveTitle;
            let coverSrc = '';
            let displayName = post.nameStr;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = post.contentHtml;
            const link = tempDiv.querySelector('a');

            if (link) {
                displayTitle = link.getAttribute('data-title') || link.innerText.trim();
                coverSrc = link.getAttribute('data-cover') || '';

                const memberOverride = link.getAttribute('data-member');
                if (memberOverride) {
                    displayName = memberOverride;
                }
            } else {
                displayTitle = tempDiv.innerText.trim();
            }

            if (!coverSrc && post.avatarHtml) {
                const srcMatch = post.avatarHtml.match(/src=['"]([^'"]+)['"]/);
                if (srcMatch) coverSrc = srcMatch[1];
            }
            if (!coverSrc) coverSrc = './icon.png';
            displayTitle = displayTitle || '直播回放';

            card.innerHTML = `
                <div class="vod-row-cover-container">
                    <img src="${coverSrc}" class="vod-row-cover">
                    <div class="vod-badge badge-replay">回放</div>
                </div>
                <div class="vod-row-info">
                    <div class="vod-row-name">${escapeHtml(displayName)}</div>
                    <div class="vod-row-title">${escapeHtml(displayTitle)}</div>
                    <div class="vod-row-time">${escapeHtml(post.timeStr)}</div>
                </div>
            `;
            card.onclick = (e) => {
                e.stopPropagation();
                playLiveOrArchiveFromMessage(post.liveId, displayName, post.timeStr, displayTitle);
            };

            content.appendChild(card);
        } else if (post.isLiveText) {
            const card = document.createElement('div');
            card.className = 'vod-card-row';
            card.style.cssText = 'margin-top: 10px; width: 100%; box-sizing: border-box;';
            let coverSrc = './icon.png';
            if (post.avatarHtml) {
                const srcMatch = post.avatarHtml.match(/src=['"]([^'"]+)['"]/);
                if (srcMatch) coverSrc = srcMatch[1];
            }
            card.innerHTML = `<div class="vod-row-cover-container" style="width:100px; height:56px;"><img src="${coverSrc}" style="width:100%; height:100%; object-fit: cover; border-radius: 6px;"><div class="vod-badge badge-replay">回放</div></div><div class="vod-row-info" style="height:56px;"><div class="vod-row-name">${escapeHtml(post.nameStr)}</div><div class="vod-row-title" style="font-size:13px;">${escapeHtml(post.liveTitle || '直播记录')}</div><div class="vod-row-time" style="font-size:11px;">${escapeHtml(post.timeStr)}</div></div>`;
            card.onclick = (e) => {
                e.stopPropagation();
                matchReplayByTime(post.nameStr, post.timeStr);
            };
            content.appendChild(card);
        }
        if (post.audioUrl) insertAudioPlayerIntoMessage(content, post.audioUrl);
        decorateArchiveFlipUser(content, post, header.querySelector('img')?.getAttribute('src') || '');
        div.appendChild(header);
        div.appendChild(content);
        return div;
    }


    function renderNextBatch(renderToken = messageRenderToken) {
        if (renderToken !== messageRenderToken) return;
        if (isRenderingBatch) return;
        if (renderedCount >= currentFilteredPosts.length) {
            loadingMoreDiv.style.display = 'none';
            if (webMessageHasMore && isMessageViewVisible()
                && scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 300) {
                loadNextPagedMessageBatch();
            }
            return;
        }

        isRenderingBatch = true;
        loadingMoreDiv.style.display = 'block';
        const nextBatch = currentFilteredPosts.slice(renderedCount, renderedCount + getBatchSize());
        const fragment = document.createDocumentFragment();
        nextBatch.forEach(post => {
            fragment.appendChild(createMessageListRow(post));
        });
        if (renderToken !== messageRenderToken) {
            isRenderingBatch = false;
            loadingMoreDiv.style.display = 'none';
            return;
        }
        outputList.appendChild(fragment);
        observeArchiveFlipUsers(scrollContainer);
        renderedCount += nextBatch.length;
        isRenderingBatch = false;
        if (isMessageViewVisible() && scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
            if (renderedCount < currentFilteredPosts.length) scheduleNextBatch();
            else loadNextPagedMessageBatch();
        }
        updateStatus();
    }

    function initDateSelectors() {
        availableYears = new Set();
        allPosts.forEach(post => {
            if (post.year) availableYears.add(post.year);
        });

        const trigger = document.querySelector('#message-date-wrapper .flip-date-trigger');
        if (trigger) trigger.disabled = false;
        const dropdown = document.getElementById('message-date-dropdown');
        if (dropdown && dropdown.dataset.keepOpenBound !== 'true') {
            dropdown.dataset.keepOpenBound = 'true';
            dropdown.addEventListener('click', event => event.stopPropagation());
        }
        syncMessageDateTriggerState();
        syncMessageDateFieldDisplays();
    }

    const messageDatePickerState = {
        activeTarget: 'from',
        displayYear: null,
        displayMonth: null
    };

    const legacyMessageDateParts = {
        year: 'all',
        month: 'all',
        day: 'all'
    };

    function padMessageDatePart(value) {
        return String(value).padStart(2, '0');
    }

    function toMessageDateValue(year, monthIndex, day) {
        return `${year}-${padMessageDatePart(monthIndex + 1)}-${padMessageDatePart(day)}`;
    }

    function parseMessageDateValue(value) {
        if (!value) return null;
        const normalized = String(value).trim().replace(/\//g, '-');
        const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (!match) return null;
        return {
            year: Number(match[1]),
            month: Number(match[2]) - 1,
            day: Number(match[3])
        };
    }

    function formatMessageDateDisplay(value) {
        return value ? String(value).replace(/-/g, '/') : '请选择';
    }

    function getMessageDateInput(target) {
        return target === 'to' ? messageDateToInput : messageDateFromInput;
    }

    function getMessageDateValue(target) {
        const input = getMessageDateInput(target);
        return input ? input.value : '';
    }

    function parseMessageFilterDate(value, isEnd = false) {
        if (!value) return null;
        const normalized = String(value).trim().replace(/\//g, '-');
        const suffix = isEnd ? 'T23:59:59.999' : 'T00:00:00';
        const parsed = new Date(`${normalized}${suffix}`).getTime();
        return Number.isFinite(parsed) ? parsed : null;
    }

    function getMessagePostTimeMs(post) {
        const direct = Number(post?.sortTime);
        if (Number.isFinite(direct) && direct > 0) return direct;
        const parsedTime = new Date(post?.timeStr || '').getTime();
        if (Number.isFinite(parsedTime) && parsedTime > 0) return parsedTime;
        if (post?.year && post?.month && post?.day) {
            const fallback = new Date(Number(post.year), Number(post.month) - 1, Number(post.day)).getTime();
            if (Number.isFinite(fallback)) return fallback;
        }
        return 0;
    }

    function syncMessageDateTriggerState() {
        const trigger = document.querySelector('#message-date-wrapper .flip-date-trigger');
        const textEl = document.getElementById('message-date-trigger-text');
        if (!trigger || !textEl) return;

        const fromValue = getMessageDateValue('from');
        const toValue = getMessageDateValue('to');
        const hasValue = !!(fromValue || toValue);
        trigger.classList.toggle('is-active', hasValue);
        if (fromValue && toValue) {
            textEl.textContent = `${formatMessageDateDisplay(fromValue)} - ${formatMessageDateDisplay(toValue)}`;
        } else if (fromValue) {
            textEl.textContent = window.YayaRendererUtils.t(`${formatMessageDateDisplay(fromValue)} 起`);
        } else if (toValue) {
            textEl.textContent = window.YayaRendererUtils.t(`至 ${formatMessageDateDisplay(toValue)}`);
        } else {
            textEl.textContent = window.YayaRendererUtils.t('全部');
        }
    }

    function syncMessageDateFieldDisplays() {
        const fromDisplay = document.getElementById('message-time-from-display');
        const toDisplay = document.getElementById('message-time-to-display');
        const fromValue = getMessageDateValue('from');
        const toValue = getMessageDateValue('to');

        if (fromDisplay) {
            const valueNode = fromDisplay.querySelector('.flip-date-field-card-value');
            if (valueNode) valueNode.textContent = formatMessageDateDisplay(fromValue);
            fromDisplay.classList.toggle('is-active', messageDatePickerState.activeTarget === 'from');
        }

        if (toDisplay) {
            const valueNode = toDisplay.querySelector('.flip-date-field-card-value');
            if (valueNode) valueNode.textContent = formatMessageDateDisplay(toValue);
            toDisplay.classList.toggle('is-active', messageDatePickerState.activeTarget === 'to');
        }
    }

    function setMessageDateCalendarMonth(dateValue = '') {
        const parsed = parseMessageDateValue(dateValue);
        const baseDate = parsed
            ? new Date(parsed.year, parsed.month, parsed.day)
            : new Date();
        messageDatePickerState.displayYear = baseDate.getFullYear();
        messageDatePickerState.displayMonth = baseDate.getMonth();
    }

    function renderMessageDateCalendar() {
        const label = document.getElementById('message-date-calendar-label');
        const grid = document.getElementById('message-date-calendar-grid');
        if (!label || !grid) return;

        if (messageDatePickerState.displayYear === null || messageDatePickerState.displayMonth === null) {
            setMessageDateCalendarMonth(getMessageDateValue(messageDatePickerState.activeTarget));
        }

        syncMessageDateFieldDisplays();

        const year = messageDatePickerState.displayYear;
        const month = messageDatePickerState.displayMonth;
        label.textContent = window.YayaRendererUtils.t(`${year}年${padMessageDatePart(month + 1)}月`);

        const firstDay = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();
        const startOffset = (firstDay.getDay() + 6) % 7;
        const fromValue = getMessageDateValue('from');
        const toValue = getMessageDateValue('to');
        const fromMs = parseMessageFilterDate(fromValue, false);
        const toMs = parseMessageFilterDate(toValue, true);
        const now = new Date();
        const todayValue = toMessageDateValue(now.getFullYear(), now.getMonth(), now.getDate());

        grid.replaceChildren();
        for (let index = 0; index < 42; index += 1) {
            let day;
            let cellMonth = month;
            let cellYear = year;
            let isMuted = false;

            if (index < startOffset) {
                day = prevMonthDays - startOffset + index + 1;
                cellMonth -= 1;
                if (cellMonth < 0) {
                    cellMonth = 11;
                    cellYear -= 1;
                }
                isMuted = true;
            } else if (index >= startOffset + daysInMonth) {
                day = index - startOffset - daysInMonth + 1;
                cellMonth += 1;
                if (cellMonth > 11) {
                    cellMonth = 0;
                    cellYear += 1;
                }
                isMuted = true;
            } else {
                day = index - startOffset + 1;
            }

            const value = toMessageDateValue(cellYear, cellMonth, day);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'flip-calendar-day';
            if (isMuted) button.classList.add('is-muted');
            if (value === fromValue || value === toValue) button.classList.add('is-selected');
            if (value === todayValue) button.classList.add('is-today');

            const dayMs = parseMessageFilterDate(value, false);
            if (fromMs !== null && toMs !== null && dayMs !== null && dayMs >= fromMs && dayMs <= toMs) {
                button.classList.add('is-in-range');
            }

            button.textContent = String(day);
            button.onclick = () => selectMessageCalendarDate(value);
            grid.appendChild(button);
        }
    }

    function toggleMessageDateDropdown() {
        const list = document.getElementById('message-date-dropdown');
        const trigger = document.querySelector('#message-date-wrapper .flip-date-trigger');
        if (!list || trigger?.disabled) return;
        const willOpen = list.style.display !== 'block';
        list.style.display = willOpen ? 'block' : 'none';
        if (willOpen) {
            setMessageDateCalendarMonth(getMessageDateValue(messageDatePickerState.activeTarget));
            renderMessageDateCalendar();
        }
    }

    function setActiveMessageDateField(target) {
        messageDatePickerState.activeTarget = target === 'to' ? 'to' : 'from';
        setMessageDateCalendarMonth(getMessageDateValue(messageDatePickerState.activeTarget));
        renderMessageDateCalendar();
    }

    function shiftMessageDateCalendarMonth(offset) {
        if (!Number.isFinite(offset)) return;
        if (messageDatePickerState.displayYear === null || messageDatePickerState.displayMonth === null) {
            setMessageDateCalendarMonth(getMessageDateValue(messageDatePickerState.activeTarget));
        }
        const nextDate = new Date(messageDatePickerState.displayYear, messageDatePickerState.displayMonth + offset, 1);
        messageDatePickerState.displayYear = nextDate.getFullYear();
        messageDatePickerState.displayMonth = nextDate.getMonth();
        renderMessageDateCalendar();
    }

    function shiftMessageDateCalendarYear(offset) {
        if (!Number.isFinite(offset)) return;
        if (messageDatePickerState.displayYear === null || messageDatePickerState.displayMonth === null) {
            setMessageDateCalendarMonth(getMessageDateValue(messageDatePickerState.activeTarget));
        }
        messageDatePickerState.displayYear += offset;
        renderMessageDateCalendar();
    }

    function applyMessageDateRangeFilter() {
        syncMessageDateTriggerState();
        syncMessageDateFieldDisplays();
        applyFilters();
        const view = document.getElementById('view-messages');
        if (view) view.scrollTop = 0;
    }

    function selectMessageCalendarDate(value) {
        const input = getMessageDateInput(messageDatePickerState.activeTarget);
        if (!input) return;
        input.value = value;
        applyMessageDateRangeFilter();
        renderMessageDateCalendar();
        const dropdown = document.getElementById('message-date-dropdown');
        if (dropdown) dropdown.style.display = 'block';
    }

    function clearActiveMessageDateField() {
        const input = getMessageDateInput(messageDatePickerState.activeTarget);
        if (!input) return;
        input.value = '';
        applyMessageDateRangeFilter();
        renderMessageDateCalendar();
        const dropdown = document.getElementById('message-date-dropdown');
        if (dropdown) dropdown.style.display = 'block';
    }

    function pickTodayForMessageDate() {
        const now = new Date();
        selectMessageCalendarDate(toMessageDateValue(now.getFullYear(), now.getMonth(), now.getDate()));
    }

    function resetDateFilter() {
        if (messageDateFromInput) messageDateFromInput.value = '';
        if (messageDateToInput) messageDateToInput.value = '';
        legacyMessageDateParts.year = 'all';
        legacyMessageDateParts.month = 'all';
        legacyMessageDateParts.day = 'all';
        const dropdown = document.getElementById('message-date-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        syncMessageDateTriggerState();
        syncMessageDateFieldDisplays();
        applyFilters();
        const view = document.getElementById('view-messages');
        if (view) {
            view.scrollTop = 0;
        }
    }

    function resetMonthSelect() {
        legacyMessageDateParts.month = 'all';
    }

    function resetDaySelect() {
        legacyMessageDateParts.day = 'all';
    }

    function toggleDateDropdown() {
        toggleMessageDateDropdown();
    }

    function selectDateItem(type, value, text) {
        if (value === 'all') {
            resetDateFilter();
            return;
        }

        legacyMessageDateParts[type] = String(value || 'all');
        const year = Number(legacyMessageDateParts.year);
        if (!Number.isFinite(year)) return;

        let fromValue = `${year}-01-01`;
        let toValue = `${year}-12-31`;
        const month = Number(legacyMessageDateParts.month);
        if (Number.isFinite(month)) {
            fromValue = `${year}-${padMessageDatePart(month)}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            toValue = `${year}-${padMessageDatePart(month)}-${padMessageDatePart(lastDay)}`;
        }
        const day = Number(legacyMessageDateParts.day);
        if (Number.isFinite(month) && Number.isFinite(day)) {
            fromValue = `${year}-${padMessageDatePart(month)}-${padMessageDatePart(day)}`;
            toValue = fromValue;
        }

        setMessageDateRange(fromValue, toValue);
    }

    function setMessageDateRange(from, to) {
        if (messageDateFromInput) messageDateFromInput.value = from;
        if (messageDateToInput) messageDateToInput.value = to;
        applyMessageDateRangeFilter();
    }

    function setFilter(type) {
        messageAnalysisDrilldown = '';
        filterType = type;

        document.querySelectorAll('.filter-chip').forEach(el => el.classList.remove('active'));
        document.getElementById(`filter-${type}`).classList.add('active');

        requestAnimationFrame(() => {
            setTimeout(() => {
                applyFilters();

                const view = document.getElementById('view-messages');
                if (view) view.scrollTop = 0;
            }, 10);
        });
    }

    function showMemberDropdown() {
        const list = document.getElementById('memberDropdownList');
        const input = document.getElementById('groupInput');
        list.style.display = 'block';
        const keyword = (input.value === '全部成员') ? '' : input.value;
        renderMemberDropdown(keyword);
    }

    function renderMemberDropdown(keyword) {
        const list = document.getElementById('memberDropdownList');
        const term = keyword.trim().toLowerCase();

        let html = `<div class="suggestion-item" onclick="selectMemberFilter('all')"><span style="font-weight:bold">全部成员</span></div>`;

        let matchCount = 0;
        allMemberOptions.forEach(name => {
            if (term === '' || name.toLowerCase().includes(term)) {
                const team = memberTeamMap.get(name) || '';

                let isInactive = false;
                if (typeof getMembers() !== 'undefined') {
                    const mObj = getMembers().find(m => m.ownerName === name);
                    if (mObj && mObj.isInGroup === false) isInactive = true;
                }

                const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';

                let colorStyle = '';
                if (typeof getTeamStyle === 'function') {
                    colorStyle = getTeamStyle(team, isInactive);
                }

                const teamHtml = team ? `<span class="team-tag" style="${baseStyle} ${colorStyle}">${team}</span>` : '';

                html += `<div class="suggestion-item"
                     onclick="selectMemberFilter('${name}')"
                     style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight:bold; ${baseStyle}">${name}</span>
                    ${teamHtml}
                 </div>`;
                matchCount++;
            }
        });

        if (matchCount === 0 && term !== '') {
            html += `<div class="suggestion-item" style="cursor:default; color:var(--text-sub);">无匹配成员</div>`;
        }

        list.innerHTML = html;
    }

    function selectMemberFilter(value) {
        const input = document.getElementById('groupInput');
        const list = document.getElementById('memberDropdownList');

        if (value === 'all') {
            input.value = '全部成员';
        } else {
            input.value = value;
        }

        list.style.display = 'none';
        applyFilters();
    }

    document.addEventListener('click', function (e) {
        const container = document.getElementById('sb-members');
        const list = document.getElementById('memberDropdownList');
        if (list.style.display === 'block' && !container.contains(e.target)) {
            list.style.display = 'none';

            const input = document.getElementById('groupInput');
            const val = input.value;
            if (val !== '全部成员' && !allMemberOptions.includes(val)) {
            }
        }
    });

    function getMessageRoomFilter() {
        const value = document.getElementById('message-room-type')?.value;
        const roomType = value === 'big' || value === 'small' ? value : 'all';
        return { roomType, channelIds: roomType === 'all' ? []
            : window.YayaMessageRoomFilter.getMessageRoomChannelIds(getMembers(), roomType,
                readRuntimeCacheValue('yaya_message_room_history_v1', {}) || {}) };
    }

    function toggleMessageRoomDropdown() {
        const list = document.getElementById('message-room-dropdown');
        const visible = list.style.display !== 'block';
        list.style.display = visible ? 'block' : 'none';
        document.getElementById('message-room-trigger').setAttribute('aria-expanded', String(visible));
    };
    function selectMessageRoom(value) {
        const type = value === 'big' || value === 'small' ? value : 'all';
        document.getElementById('message-room-type').value = type;
        document.getElementById('message-room-label').textContent = window.YayaRendererUtils.t(type === 'big' ? '大房间' : type === 'small' ? '小房间' : '全部房间');
        document.getElementById('message-room-dropdown').style.display = 'none';
        document.getElementById('message-room-trigger').setAttribute('aria-expanded', 'false');
        messageAnalysisDrilldown = '';
        applyFilters();
    };
    document.addEventListener('click', event => {
        if (!document.getElementById('message-room-wrapper')?.contains(event.target)) {
            document.getElementById('message-room-dropdown').style.display = 'none';
            document.getElementById('message-room-trigger').setAttribute('aria-expanded', 'false');
        }
    });

    function filterMessagePostsInMemory(sourcePosts) {
        const contentKw = String(document.getElementById('search-content-input')?.value || '').trim().toLowerCase();
        const userKw = String(document.getElementById('search-user-input')?.value || '').trim().toLowerCase();
        const groupInputVal = String(document.getElementById('groupInput')?.value || '全部成员');
        const selectedGroup = (groupInputVal === '全部成员' || !groupInputVal) ? 'all' : groupInputVal;
        const roomFilter = getMessageRoomFilter();
        const fromMs = parseMessageFilterDate(getMessageDateValue('from'), false);
        const toMs = parseMessageFilterDate(getMessageDateValue('to'), true);

        const filtered = (Array.isArray(sourcePosts) ? sourcePosts : []).filter(post => {
            if (selectedGroup !== 'all' && post.groupName !== selectedGroup) return false;
            if (!window.YayaMessageRoomFilter.matchesMessageRoom(post, roomFilter)) return false;
            if (contentKw) {
                const text = String(post.text || '').toLowerCase();
                const title = String(post.liveTitle || '').toLowerCase();
                const html = String(post.contentHtml || '').toLowerCase();
                const terms = contentKw.split('|').map(term => term.trim()).filter(Boolean);
                if (terms.length && !terms.some(term => text.includes(term) || title.includes(term) || html.includes(term))) return false;
            }
            if (userKw) {
                const name = String(post.nameStr || '').toLowerCase();
                const userId = String(post.userId || '').toLowerCase();
                if (!name.includes(userKw) && userId !== userKw) return false;
            }

            if (filterType === 'image' && (post.isReply || !post.hasImg)) return false;
            if (filterType === 'video' && (post.isReply || !post.hasVideo)) return false;
            if (filterType === 'audio' && (post.isReply || !post.hasAudio)) return false;
            if (filterType === 'reply' && !post.isReply) return false;
            if (filterType === 'live-record' && !post.liveId && !post.isLiveText) return false;
            if (filterType === 'gift' && !post.giftInfo) return false;
            if (filterType === 'text' && (post.hasImg || post.hasVideo || post.hasAudio || post.liveId || post.isLiveText || post.isReply)) return false;

            if (fromMs !== null || toMs !== null) {
                const postTime = getMessagePostTimeMs(post);
                if (!postTime) return false;
                if (fromMs !== null && postTime < fromMs) return false;
                if (toMs !== null && postTime > toMs) return false;
            }
            return true;
        });

        filtered.sort((left, right) => {
            const difference = getMessagePostTimeMs(left) - getMessagePostTimeMs(right);
            return currentSortOrder === 'desc' ? -difference : difference;
        });
        return filtered;
    }

    function applyFilters() {
        return applyWebMessageFilters({ resetPage: true });
    }

    function updateStatus() {
        const names = {
            'all': '全部',
            'text': '文字',
            'image': '图片',
            'video': '视频',
            'audio': '语音',
            'reply': '翻牌',
            'gift': '礼物',
            'live-record': '直播'
        };
        statusMsg.textContent = window.YayaRendererUtils.t(`[${names[filterType]}] 共 ${pagedMessageMatchedCount || 0} 条`);
    }
    scrollContainer.addEventListener('scroll', () => {
        if (scrollContainer.scrollTop + scrollContainer.clientHeight < scrollContainer.scrollHeight - 300) return;
        if (renderedCount < currentFilteredPosts.length) scheduleNextBatch();
        else loadNextPagedMessageBatch();
    });

    let messageContextRequest = 0;
    async function openContextModal(targetGlobalIndex) {
        const targetPost = allPosts[targetGlobalIndex];
        if (!targetPost) return;
        const request = ++messageContextRequest;
        contextListContainer.textContent = window.YayaRendererUtils.t('正在读取上下文...');
        document.querySelector('#contextModal .modal-title').innerText = window.YayaRendererUtils.t(`上下文: ${targetPost.groupName}`);
        contextModal.style.display = 'flex';
        let contextPosts;
        let targetIndex;
        try {
            const store = getActiveMessageStore();
            if (typeof store?.getContext === 'function') {
                const result = await store.getContext({ indexId: targetPost.indexId,
                    memberName: targetPost.groupName, key: targetPost.exportKey, radius: 10 });
                if (request !== messageContextRequest) return;
                contextPosts = parseWebMessageRecords(result.records, 'asc');
                targetIndex = contextPosts.findIndex(post => targetPost.indexId
                    ? String(post.indexId) === String(targetPost.indexId)
                    : post.exportKey === targetPost.exportKey);
            } else {
                const groupPosts = allPosts.filter(post => targetPost.sourcePath
                    ? post.sourcePath === targetPost.sourcePath : post.groupName === targetPost.groupName)
                    .sort((a, b) => getMessagePostTimeMs(a) - getMessagePostTimeMs(b));
                const index = groupPosts.indexOf(targetPost);
                const start = Math.max(0, index - 10);
                contextPosts = groupPosts.slice(start, index + 11);
                targetIndex = index - start;
            }
        } catch (error) {
            if (request === messageContextRequest) contextListContainer.textContent = `读取上下文失败：${error.message || error}`;
            return;
        }
        if (request !== messageContextRequest) return;
        contextListContainer.replaceChildren();
        contextPosts.forEach(post => {
            const div = document.createElement('div');
            div.className = 'Box-row';
            div.style.marginBottom = '10px';
            if (post === contextPosts[targetIndex]) {
                div.classList.add('context-highlight');
                div.id = 'target-message-scroll-anchor';
            }
            const header = document.createElement('div');
            header.className = 'user-header-row';
            header.innerHTML = `${post.avatarHtml}<div class="user-info-col"><div><span class="username">${escapeHtml(post.nameStr)}</span></div><span class="timestamp">${escapeHtml(post.timeStr)}</span></div>`;
            const content = document.createElement('div');
            content.innerHTML = replaceTencentEmoji(post.contentHtml);
            try {
                const audioRegex = /(?:音频[\s\u00A0]*[-–—][\s\u00A0]*)?(https?:\/\/[^\s<"']+\.(?:mp3|aac|m4a))/gi;
                if (audioRegex.test(content.innerHTML)) content.innerHTML = content.innerHTML.replace(audioRegex, '<span class="temp-audio-placeholder" data-src="$1"></span>');
                content.querySelectorAll('a, .temp-audio-placeholder').forEach(el => {
                    let src = el.tagName === 'SPAN' ? el.getAttribute('data-src') : (/\.(mp3|aac|m4a)$/i.test(el.href) ? el.href : '');
                    if (src) {
                        const player = createCustomAudioPlayer(src);
                        player.style.display = 'inline-flex';
                        player.style.margin = '4px 0';
                        if (el.tagName === 'A') el.parentNode.replaceChild(player, el);
                        else {
                            const parent = el.closest('a');
                            if (parent) parent.parentNode.replaceChild(player, parent);
                            else el.parentNode.replaceChild(player, el);
                        }
                    }
                });
            } catch (e) { window.YayaRendererUtils.reportIgnoredError(e, 'src/renderer/message-archive-feature.mjs'); }
            let hasVTag = false;
            content.querySelectorAll('video').forEach(rawV => {
                const src = rawV.src || rawV.querySelector('source')?.src;
                if (src) {
                    rawV.parentNode.replaceChild(createCustomVideoPlayer(src), rawV);
                    hasVTag = true;
                }
            });
            if (post.videoUrl && !hasVTag) content.appendChild(createCustomVideoPlayer(post.videoUrl));
            if (post.liveId) {
                const card = document.createElement('div');
                card.className = 'vod-card-row';
                card.style.cssText = 'margin-top: 10px; width: 100%; box-sizing: border-box; background: var(--input-bg); cursor: pointer; border: 1px solid var(--border);';

                let displayTitle = post.liveTitle;
                let coverSrc = '';
                let displayName = post.nameStr;

                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = post.contentHtml;
                const link = tempDiv.querySelector('a');

                if (link) {
                    displayTitle = link.getAttribute('data-title') || link.innerText.trim();
                    coverSrc = link.getAttribute('data-cover') || '';

                    const memberOverride = link.getAttribute('data-member');
                    if (memberOverride) {
                        displayName = memberOverride;
                    }
                } else {
                    displayTitle = tempDiv.innerText.trim();
                }

                if (!coverSrc && post.avatarHtml) {
                    const srcMatch = post.avatarHtml.match(/src=['"]([^'"]+)['"]/);
                    if (srcMatch) coverSrc = srcMatch[1];
                }
                if (!coverSrc) coverSrc = './icon.png';
                displayTitle = displayTitle || '直播回放';

                card.innerHTML = `
                    <div class="vod-row-cover-container">
                        <img src="${coverSrc}" class="vod-row-cover">
                        <div class="vod-badge badge-replay">回放</div>
                    </div>
                    <div class="vod-row-info">
                        <div class="vod-row-name">${escapeHtml(displayName)}</div>
                        <div class="vod-row-title">${escapeHtml(displayTitle)}</div>
                        <div class="vod-row-time">${escapeHtml(post.timeStr)}</div>
                    </div>
                `;

                card.onclick = (e) => {
                    e.stopPropagation();
                    playLiveOrArchiveFromMessage(post.liveId, displayName, post.timeStr, displayTitle);
                };

                content.appendChild(card);

            } else if (post.isLiveText) {
                const card = document.createElement('div');
                card.className = 'vod-card-row';
                card.style.cssText = 'margin-top: 10px; width: 100%; box-sizing: border-box; background: var(--input-bg);';
                let cSrc = './icon.png';
                if (post.avatarHtml) {
                    const sMatch = post.avatarHtml.match(/src=['"]([^'"]+)['"]/);
                    if (sMatch) cSrc = sMatch[1];
                }
                card.innerHTML = `<div class="vod-row-cover-container" style="width:100px; height:56px;"><img src="${cSrc}" style="width:100%; height:100%; object-fit: cover; border-radius: 6px;"><div class="vod-badge badge-replay">回放</div></div><div class="vod-row-info" style="height:56px;"><div class="vod-row-name">${escapeHtml(post.nameStr)}</div><div class="vod-row-title" style="font-size:13px;">${escapeHtml(post.liveTitle || '直播记录')}</div><div class="vod-row-time" style="font-size:11px;">${escapeHtml(post.timeStr)}</div></div>`;
                card.onclick = (e) => {
                    e.stopPropagation();
                    matchReplayByTime(post.nameStr, post.timeStr);
                };
                content.appendChild(card);
            }
            if (post.audioUrl) insertAudioPlayerIntoMessage(content, post.audioUrl);
            decorateArchiveFlipUser(content, post, header.querySelector('img')?.getAttribute('src') || '');
            div.appendChild(header);
            div.appendChild(content);
            contextListContainer.appendChild(div);
        });
        document.querySelector('#contextModal .modal-title').innerText = window.YayaRendererUtils.t(`上下文: ${targetPost.groupName}`);
        contextModal.style.display = 'flex';
        observeArchiveFlipUsers(contextListContainer);
        setTimeout(() => {
            const tEl = document.getElementById('target-message-scroll-anchor');
            if (tEl) tEl.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }, 100);
    }

    function closeContextModal() {
        messageContextRequest++;
        contextModal.style.display = 'none';
        document.querySelector('#contextModal .modal-title').innerText = window.YayaRendererUtils.t(`消息上下文`);
        pauseActiveAudio();
    }
    contextModal.onclick = (e) => {
        if (e.target === contextModal) closeContextModal();
    }

    function enterMessagesView() {
        syncMessageIndexLoadingShield();
        if (window.__messageDataDirty) {
            window.__messageDataDirty = false;
            Promise.resolve(loadWebMessageData()).catch(error => {
                window.__messageDataDirty = true;
                console.warn('自动抓取后的消息索引刷新失败:', error);
            });
        } else {
            ensureMessageViewportFilled();
        }
    }

    let messageIndexAutoRefreshTimer = null;
    ipcRenderer.on?.('message-index-updated', (event, result = {}) => {
        window.__messageDataDirty = true;
        if ((Number(result.removedMessages) || 0) <= 0 || getView() !== 'messages') return;

        if (messageIndexAutoRefreshTimer) clearTimeout(messageIndexAutoRefreshTimer);
        messageIndexAutoRefreshTimer = setTimeout(() => {
            messageIndexAutoRefreshTimer = null;
            if (getView() !== 'messages') return;
            window.__messageDataDirty = false;
            Promise.resolve(loadWebMessageData()).catch(error => {
                window.__messageDataDirty = true;
                console.warn('消息删除后的索引刷新失败:', error);
            });
        }, 600);
    });

    function setupSearchControls() {
        const cInput = document.getElementById('search-content-input');
        const uInput = document.getElementById('search-user-input');
        const rBtn = document.getElementById('btn-clear-search');

        let searchTimeout = null;

        function handleInstantSearch(event) {
            if (event?.isTrusted) messageAnalysisDrilldown = '';
            if (searchTimeout) clearTimeout(searchTimeout);

            searchTimeout = setTimeout(() => {

                applyFilters();
            }, 300);
        }

        if (cInput) cInput.addEventListener('input', handleInstantSearch);
        if (uInput) uInput.addEventListener('input', handleInstantSearch);

        if (rBtn) {
            rBtn.onclick = () => {
                messageAnalysisDrilldown = '';
                if (cInput) cInput.value = '';
                if (uInput) uInput.value = '';

                applyFilters();
            };
        }
    }

    Object.assign(window, {
        applyMessageAnalysisDrilldown, clearWebMessageData, forceReloadData: loadWebMessageData,
        openMessageDataFolder, toggleSortOrder, toggleMessageDateDropdown, setActiveMessageDateField,
        shiftMessageDateCalendarMonth, shiftMessageDateCalendarYear, clearActiveMessageDateField,
        pickTodayForMessageDate, selectMessageCalendarDate, resetDateFilter, toggleDateDropdown,
        selectDateItem, setFilter, showMemberDropdown, renderMemberDropdown, selectMemberFilter,
        toggleMessageRoomDropdown, selectMessageRoom, openContextModal, closeContextModal
    });

    return {
        enterMessagesView, setupSearchControls, setMessageIndexLoadingState, syncMessageIndexLoadingShield,
        loadWebMessageData, ensurePagedAnalysisPosts, loadMessageAnalysis, applyFilters, closeContextModal,
        selectDateItem, setMessageDateRange, setFilter,
        getAllPosts: () => pagedAnalysisPosts || allPosts,
        getCurrentFilteredPosts: () => pagedAnalysisPosts
            ? filterMessagePostsInMemory(pagedAnalysisPosts)
            : currentFilteredPosts
    };
}
