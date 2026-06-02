(function () {
    const MEMBER_DATA_URL = 'https://yaya-data.pages.dev/members.json';
    const EARLIEST_KNOWN_WEEK_RANK_ID = 17;
    const WEEK_QUERY_CONCURRENCY = 6;

    let membersPromise = null;
    let rankPagePromise = null;
    let allRankWeeksPromise = null;
    const weekRankCache = new Map();
    let selectedMember = null;
    let currentMeleeRankMode = 'person';
    let initialized = false;
    let defaultModeApplied = false;

    function getEl(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function normalize(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getPinyinInitials(value) {
        return String(value || '')
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .split(/\s+/)
            .map(part => part.charAt(0))
            .join('')
            .toLowerCase();
    }

    function normalizeSourceUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return './icon.png';
        if (/^https?:\/\//i.test(raw)) return raw;
        return raw.startsWith('/') ? `https://source.48.cn${raw}` : `https://source.48.cn/${raw}`;
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function parseLatestWeekStart(weekName) {
        const match = String(weekName || '').match(/(\d{1,2})月(\d{1,2})日/);
        if (!match) return null;

        const now = new Date();
        let year = now.getFullYear();
        let start = new Date(year, Number(match[1]) - 1, Number(match[2]));

        if (start.getTime() - now.getTime() > 100 * 24 * 60 * 60 * 1000) {
            year -= 1;
            start = new Date(year, Number(match[1]) - 1, Number(match[2]));
        }

        return start;
    }

    function formatWeekRange(startDate) {
        const start = new Date(startDate);
        const end = new Date(startDate);
        end.setDate(start.getDate() + 6);
        const startText = `${start.getFullYear()}年${pad2(start.getMonth() + 1)}月${pad2(start.getDate())}日`;
        const endText = `${pad2(end.getMonth() + 1)}月${pad2(end.getDate())}日`;
        return `${startText}-${endText}`;
    }

    function inferWeekName(latestStart, offsetWeeks, fallback) {
        if (!latestStart) return fallback;
        const start = new Date(latestStart);
        start.setDate(start.getDate() - offsetWeeks * 7);
        return formatWeekRange(start);
    }

    function normalizeKnownWeekName(weekName, latestStart, offsetWeeks, fallback) {
        if (!latestStart) return weekName || fallback;
        return inferWeekName(latestStart, offsetWeeks, fallback);
    }

    function showToastSafe(message) {
        if (typeof window.showToast === 'function') {
            window.showToast(message);
        }
    }

    function getIpcRenderer() {
        return window.ipcRenderer || (window.desktop && window.desktop.ipcRenderer) || null;
    }

    async function invokePocket(channel, payload = {}) {
        const ipc = getIpcRenderer();
        if (!ipc || typeof ipc.invoke !== 'function') {
            throw new Error('当前环境不支持调用口袋接口');
        }
        return ipc.invoke(channel, payload);
    }

    function setMeta(html) {
        const meta = getEl('melee-rank-meta');
        if (meta) meta.innerHTML = html;
    }

    function setResult(html) {
        const result = getEl('melee-rank-result');
        if (result) result.innerHTML = html;
    }

    function showDefaultPersonMeleePrompt() {
        setMeleeRankMode('person');
        setMeta('');
        setResult('<div class="empty-state">请选择成员后查询</div>');
    }

    function setMeleeRankMode(mode) {
        currentMeleeRankMode = mode;
        const button = getEl('btn-query-person-melee-rank');
        if (button) {
            button.textContent = mode === 'person' ? '成员榜' : '总榜';
            button.classList.toggle('active', mode === 'person');
        }
    }

    function setQueryLoading(loading) {
        const button = getEl('btn-query-melee-rank');
        if (!button) return;
        button.disabled = !!loading;
        button.textContent = loading ? '查询中' : '查询';
    }

    function setPersonMeleeLoading(loading) {
        const button = getEl('btn-query-person-melee-rank');
        if (!button) return;
        button.disabled = !!loading;
        button.textContent = loading ? '读取中' : (currentMeleeRankMode === 'person' ? '成员榜' : '总榜');
    }

    async function queryMeleeRankCurrentMode() {
        if (currentMeleeRankMode === 'person') {
            await queryPersonMeleeRankData();
        } else {
            await queryMeleeRankData();
        }
    }

    async function toggleMeleeRankMode() {
        if (currentMeleeRankMode === 'person') {
            await restoreMeleeWeekCards();
            return;
        }

        setMeleeRankMode('person');
        const member = await resolveInputMember();
        if (member && member.id) {
            await queryPersonMeleeRankData();
        } else {
            setResult('<div class="empty-state">请选择成员后查看贡献榜</div>');
        }
    }

    async function loadMembers() {
        if (!membersPromise) {
            membersPromise = fetch(`${MEMBER_DATA_URL}?t=${Date.now()}`)
                .then(res => {
                    if (!res.ok) throw new Error(`成员数据加载失败: HTTP ${res.status}`);
                    return res.json();
                })
                .then(data => Array.isArray(data) ? data : (data.roomId || []));
        }
        return membersPromise;
    }

    async function loadRankPage() {
        if (!rankPagePromise) {
            rankPagePromise = invokePocket('fetch-melee-rank-page', {})
                .then(result => {
                    if (!result || !result.success) {
                        throw new Error(result?.msg || '读取乱斗榜失败');
                    }
                    return result.content || {};
                });
        }
        return rankPagePromise;
    }

    async function loadAllRankWeeks() {
        if (!allRankWeeksPromise) {
            allRankWeeksPromise = loadRankPage().then(content => {
                const knownWeeks = Array.isArray(content.weekRankList) ? content.weekRankList : [];
                const latestWeek = knownWeeks.reduce((latest, week) => {
                    if (!latest) return week;
                    return Number(week.weekRankId || 0) > Number(latest.weekRankId || 0) ? week : latest;
                }, null);
                const latestRankId = Number(latestWeek?.weekRankId || 0);
                if (!latestRankId) return knownWeeks;

                const latestStart = parseLatestWeekStart(latestWeek.weekRankName);
                const knownById = new Map(knownWeeks.map(week => [Number(week.weekRankId), week]));
                const weeks = [];

                for (let rankId = latestRankId; rankId >= EARLIEST_KNOWN_WEEK_RANK_ID; rankId--) {
                    const known = knownById.get(rankId);
                    const offsetWeeks = latestRankId - rankId;
                    weeks.push({
                        weekRankId: rankId,
                        weekRankName: normalizeKnownWeekName(
                            known?.weekRankName,
                            latestStart,
                            offsetWeeks,
                            `rankId ${rankId}`
                        )
                    });
                }

                return weeks;
            });
        }
        return allRankWeeksPromise;
    }

    async function loadWeekRank(rankId) {
        const key = String(rankId || '');
        if (!key) throw new Error('缺少 rankId');
        if (!weekRankCache.has(key)) {
            weekRankCache.set(key, invokePocket('fetch-melee-week-rank', { rankId: Number(rankId) })
                .then(result => {
                    if (!result || !result.success) {
                        throw new Error(result?.msg || '读取周榜失败');
                    }
                    return result.content || {};
                }));
        }
        return weekRankCache.get(key);
    }

    function formatWeekChips(weeks) {
        if (!Array.isArray(weeks) || !weeks.length) return '';
        const visibleWeeks = weeks.slice(0, 18);
        const hiddenCount = Math.max(0, weeks.length - visibleWeeks.length);
        return `
            <div class="melee-week-chips">
                ${visibleWeeks.map(week => `
                    <span class="melee-week-chip">${escapeHtml(week.weekRankName || `rankId ${week.weekRankId}`)}</span>
                `).join('')}
                ${hiddenCount ? `<span class="melee-week-chip">还有 ${hiddenCount} 期历史周榜</span>` : ''}
            </div>
        `;
    }

    async function refreshRankPageMeta() {
        try {
            const content = await loadRankPage();
            const weeks = await loadAllRankWeeks();
            setMeta('');
            renderWeekCards(weeks);
        } catch (error) {
            setMeta(`<span style="color:#ff4d4f;">${escapeHtml(error.message || '读取周榜失败')}</span>`);
        }
    }

    function renderWeekCards(weeks) {
        setMeleeRankMode('total');
        if (!Array.isArray(weeks) || !weeks.length) {
            setResult('<div class="empty-state">没有读取到历史周榜</div>');
            return;
        }

        setResult(`
            <div class="melee-week-card-grid">
                ${weeks.map((week, index) => renderWeekCard(week, index)).join('')}
            </div>
        `);
    }

    function renderWeekCard(week, index) {
        const isLatest = index === 0;
        return `
            <button class="melee-week-card" onclick="openMeleeWeekRank('${escapeHtml(week.weekRankId)}')">
                <span class="melee-week-card-kicker">${isLatest ? '最新周榜' : `第 ${escapeHtml(index + 1)} 期`}</span>
                <span class="melee-week-card-title">${escapeHtml(week.weekRankName || `rankId ${week.weekRankId}`)}</span>
            </button>
        `;
    }

    async function openMeleeWeekRank(rankId) {
        try {
            setMeleeRankMode('total');
            const weeks = await loadAllRankWeeks();
            const week = weeks.find(item => String(item.weekRankId) === String(rankId)) || { weekRankId: rankId };
            const rankName = week.weekRankName || `rankId ${rankId}`;
            setResult(`<div class="empty-state">正在读取 ${escapeHtml(rankName)}...</div>`);

            const content = await loadWeekRank(rankId);
            const list = content.rankUserList || [];
            setResult(`
                <div class="melee-rank-detail-bar">
                    <button class="btn btn-secondary" onclick="restoreMeleeWeekCards()">返回</button>
                    <div class="melee-rank-detail-heading">
                        <div class="melee-rank-detail-title">${escapeHtml(rankName)}</div>
                    </div>
                    <div class="melee-rank-detail-spacer"></div>
                </div>
                <div class="melee-rank-list">
                    ${list.length ? list.map(item => renderRankCard(item, rankName, rankId)).join('') : '<div class="empty-state">这一期没有榜单数据</div>'}
                </div>
            `);
        } catch (error) {
            setResult(`<div class="empty-state">读取周榜失败：${escapeHtml(error.message || '未知错误')}</div>`);
        }
    }

    async function restoreMeleeWeekCards() {
        try {
            const weeks = await loadAllRankWeeks();
            renderWeekCards(weeks);
        } catch (error) {
            setResult(`<div class="empty-state">恢复周榜列表失败：${escapeHtml(error.message || '未知错误')}</div>`);
        }
    }

    function memberMatches(member, keyword) {
        const lowerKeyword = String(keyword || '').toLowerCase();
        const matchName = String(member.ownerName || '').includes(keyword);
        const pinyin = String(member.pinyin || '');
        const matchPinyin = pinyin.toLowerCase().includes(lowerKeyword);
        const initials = getPinyinInitials(pinyin);
        const matchInitials = String(initials).toLowerCase().includes(lowerKeyword);
        return matchName || matchPinyin || matchInitials;
    }

    async function handleMeleeRankMemberInput(keyword) {
        const box = getEl('melee-rank-suggestions');
        if (!box) return;
        const text = String(keyword || '').trim();
        if (!text) {
            box.style.display = 'none';
            return;
        }

        try {
            const members = await loadMembers();
            const matches = members.filter(member => memberMatches(member, text));
            if (typeof memberSortLogic === 'function') {
                matches.sort(memberSortLogic);
            }
            if (!matches.length) {
                box.style.display = 'none';
                return;
            }

            box.innerHTML = matches.slice(0, 10).map(member => {
                const isInactive = member.isInGroup === false;
                const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';
                const colorStyle = typeof getTeamStyle === 'function'
                    ? (getTeamStyle(member.team || member.groupName, isInactive) || '')
                    : '';
                const memberId = member.id || member.userId || member.memberId || '';
                const memberName = member.ownerName || member.nickname || '';
                return `
                    <div class="suggestion-item"
                        onclick="selectMeleeRankMember('${escapeHtml(memberId)}', '${escapeHtml(memberName)}')"
                        style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:bold; ${baseStyle}">${escapeHtml(member.ownerName || member.nickname || '未知成员')}</span>
                        <span class="team-tag" style="${baseStyle} ${colorStyle}">${escapeHtml(member.team || member.groupName || '')}</span>
                    </div>
                `;
            }).join('');
            box.style.display = 'block';
        } catch (error) {
            console.warn('鸡腿数据成员搜索失败:', error);
            box.style.display = 'none';
        }
    }

    function selectMeleeRankMember(memberId, name) {
        selectedMember = {
            id: String(memberId || '').trim(),
            name: String(name || '').trim()
        };
        const input = getEl('melee-rank-member-input');
        const idInput = getEl('melee-rank-member-id');
        const box = getEl('melee-rank-suggestions');
        if (input) input.value = selectedMember.name;
        if (idInput) idInput.value = selectedMember.id;
        if (box) box.style.display = 'none';
    }

    async function resolveInputMember() {
        const input = getEl('melee-rank-member-input');
        const idInput = getEl('melee-rank-member-id');
        const explicitId = String(idInput?.value || '').trim();
        const keyword = String(input?.value || '').trim();

        if (selectedMember && selectedMember.id) return selectedMember;
        if (explicitId) {
            return { id: explicitId, name: keyword || explicitId };
        }
        if (!keyword) return null;

        const members = await loadMembers();
        const exact = members.find(member => String(member.ownerName || '') === keyword)
            || members.find(member => normalize(member.ownerName).includes(normalize(keyword)));
        if (!exact) return null;

        return {
            id: String(exact.id || exact.userId || exact.memberId || '').trim(),
            name: exact.ownerName || exact.nickname || keyword
        };
    }

    function renderRankCard(item, rankName, keyPrefix) {
        const base = item.baseUserInfo || {};
        const top = item.topUserInfo || {};
        const rankNum = item.rankNum || '--';
        const melee = String(Number(item.melee || 0));
        const starName = base.nickname || base.starName || '未知成员';
        const topUser = top.nickname || '匿名用户';
        return `
            <div class="melee-rank-card" data-rank-key="${escapeHtml(`${keyPrefix}-${rankNum}`)}">
                <div class="melee-rank-num">${escapeHtml(rankNum)}</div>
                <div style="min-width:0;">
                    <div class="melee-rank-title">${escapeHtml(starName)}</div>
                    <div class="melee-rank-sub">榜首用户：${escapeHtml(topUser)}</div>
                </div>
                <div class="melee-rank-value">${escapeHtml(melee)}</div>
            </div>
        `;
    }

    function renderPersonMeleeCard(item) {
        const user = item.userInfo || {};
        const rankNum = item.rankNum || '--';
        const totalCharm = String(Number(item.totalCharm || 0));
        const nickname = user.nickname || user.realNickName || '匿名用户';
        const userId = user.userId || user.id || '--';
        const avatar = normalizeSourceUrl(user.avatar);
        return `
            <div class="melee-rank-card melee-person-rank-card" data-rank-key="person-${escapeHtml(rankNum)}">
                <div class="melee-rank-num">${escapeHtml(rankNum)}</div>
                <img class="melee-person-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(nickname)}" loading="lazy" onerror="this.src='./icon.png'">
                <div style="min-width:0;">
                    <div class="melee-rank-title">${escapeHtml(nickname)}</div>
                    <div class="melee-rank-sub">用户 ID：${escapeHtml(userId)}${item.privacy ? ' · 隐私用户' : ''}</div>
                </div>
                <div class="melee-rank-value">${escapeHtml(totalCharm)}</div>
            </div>
        `;
    }

    async function scanWeeksForMember(weeks, member) {
        const hits = [];
        let cursor = 0;
        let completed = 0;

        async function runWorker() {
            while (cursor < weeks.length) {
                const week = weeks[cursor];
                cursor += 1;

                try {
                    const result = await invokePocket('fetch-melee-week-rank', { rankId: week.weekRankId });
                    if (result && result.success) {
                        const list = result.content?.rankUserList || [];
                        const hit = list.find(item => {
                            const base = item.baseUserInfo || {};
                            return String(base.userId || '') === member.id || String(base.nickname || '').includes(member.name);
                        });
                        if (hit) {
                            hits.push({ week, item: hit });
                        }
                    }
                } finally {
                    completed += 1;
                    if (completed === weeks.length || completed % 12 === 0) {
                        setResult(`<div class="empty-state">正在查询历史周榜... ${completed}/${weeks.length}</div>`);
                    }
                }
            }
        }

        const workerCount = Math.min(WEEK_QUERY_CONCURRENCY, weeks.length);
        await Promise.all(Array.from({ length: workerCount }, runWorker));
        return hits.sort((a, b) => Number(b.week.weekRankId || 0) - Number(a.week.weekRankId || 0));
    }

    async function queryMeleeRankData() {
        try {
            setQueryLoading(true);
            const member = await resolveInputMember();
            if (!member || !member.id) {
                showToastSafe('请先搜索并选择成员');
                setResult('<div class="empty-state">请先搜索并选择成员</div>');
                return;
            }

            setMeleeRankMode('total');
            setResult('<div class="empty-state">正在整理历史周榜...</div>');
            const weeks = await loadAllRankWeeks();
            const hits = await scanWeeksForMember(weeks, member);

            if (!hits.length) {
                setResult(`
                    <div class="melee-rank-summary">
                        <div class="melee-rank-stat"><span>查询成员</span><b>${escapeHtml(member.name)}</b></div>
                        <div class="melee-rank-stat"><span>历史周榜</span><b>${weeks.length} 期</b></div>
                        <div class="melee-rank-stat"><span>命中结果</span><b>0</b></div>
                    </div>
                    <div class="empty-state">历史 ${weeks.length} 期周榜未找到 ${escapeHtml(member.name)}</div>
                `);
                return;
            }

            const best = hits.reduce((acc, row) => {
                if (!acc) return row;
                return Number(row.item.rankNum || 999) < Number(acc.item.rankNum || 999) ? row : acc;
            }, null);

            setResult(`
                <div class="melee-rank-summary">
                    <div class="melee-rank-stat"><span>查询成员</span><b>${escapeHtml(member.name)}</b></div>
                    <div class="melee-rank-stat"><span>历史周榜</span><b>${weeks.length} 期</b></div>
                    <div class="melee-rank-stat"><span>命中次数</span><b>${hits.length}</b></div>
                    <div class="melee-rank-stat"><span>最好排名</span><b>第 ${escapeHtml(best?.item?.rankNum || '--')} 名</b></div>
                </div>
                <div class="melee-rank-list">
                    ${hits.map(row => renderRankCard(row.item, row.week.weekRankName || `rankId ${row.week.weekRankId}`, row.week.weekRankId)).join('')}
                </div>
            `);
        } catch (error) {
            setResult(`<div class="empty-state">查询失败：${escapeHtml(error.message || '未知错误')}</div>`);
        } finally {
            setQueryLoading(false);
        }
    }

    async function queryPersonMeleeRankData() {
        try {
            setPersonMeleeLoading(true);
            const member = await resolveInputMember();
            if (!member || !member.id) {
                showToastSafe('请先搜索并选择成员');
                setResult('<div class="empty-state">请先搜索并选择成员</div>');
                return;
            }

            setResult(`<div class="empty-state">正在读取 ${escapeHtml(member.name)} 的鸡腿贡献榜...</div>`);
            const result = await invokePocket('fetch-person-melee-rank-page', { resId: member.id });
            if (!result || !result.success) {
                throw new Error(result?.msg || '读取贡献榜失败');
            }

            const list = result.content?.charmInfo || [];
            const totalCharm = list.reduce((sum, item) => sum + Number(item.totalCharm || 0), 0);
            setMeleeRankMode('person');
            setResult(`
                <div class="melee-rank-summary">
                    <div class="melee-rank-stat"><span>查询成员</span><b>${escapeHtml(member.name)}</b></div>
                    <div class="melee-rank-stat"><span>总贡献值</span><b>${escapeHtml(String(totalCharm))}</b></div>
                </div>
                <div class="melee-rank-list">
                    ${list.length ? list.map(renderPersonMeleeCard).join('') : '<div class="empty-state">没有读取到贡献榜数据</div>'}
                </div>
            `);
        } catch (error) {
            setResult(`<div class="empty-state">贡献榜读取失败：${escapeHtml(error.message || '未知错误')}</div>`);
        } finally {
            setPersonMeleeLoading(false);
        }
    }

    function initMeleeRankDataPage() {
        if (!initialized) {
            initialized = true;
            const input = getEl('melee-rank-member-input');
            if (input) {
                input.addEventListener('keydown', event => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        queryMeleeRankCurrentMode();
                    }
                });
            }
            document.addEventListener('mousedown', event => {
                const box = getEl('melee-rank-suggestions');
                const inputEl = getEl('melee-rank-member-input');
                if (box && inputEl && !box.contains(event.target) && event.target !== inputEl) {
                    box.style.display = 'none';
                }
            });
        }
        if (!defaultModeApplied) {
            defaultModeApplied = true;
            showDefaultPersonMeleePrompt();
        } else {
            setMeleeRankMode(currentMeleeRankMode);
            if (currentMeleeRankMode === 'total') {
                refreshRankPageMeta();
            }
        }
    }

    window.initMeleeRankDataPage = initMeleeRankDataPage;
    window.handleMeleeRankMemberInput = handleMeleeRankMemberInput;
    window.selectMeleeRankMember = selectMeleeRankMember;
    window.queryMeleeRankData = queryMeleeRankData;
    window.queryPersonMeleeRankData = queryPersonMeleeRankData;
    window.queryMeleeRankCurrentMode = queryMeleeRankCurrentMode;
    window.toggleMeleeRankMode = toggleMeleeRankMode;
    window.openMeleeWeekRank = openMeleeWeekRank;
    window.restoreMeleeWeekCards = restoreMeleeWeekCards;
}());
