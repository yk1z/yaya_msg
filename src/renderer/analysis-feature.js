(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createAnalysisFeature = function createAnalysisFeature(deps) {
        const {
            applyFilters,
            escapeHtml,
            getAllPosts,
            getCurrentFilteredPosts,
            getMemberIdSet,
            getMemberNameMap,
            getPocketGiftData,
            populateDays,
            populateMonths,
            selectDateItem,
            setFilter
        } = deps;

        let dateStats = [];

        function getSelectedGroupValue() {
            const groupInput = document.getElementById('groupInput');
            let selectedGroup = groupInput ? groupInput.value : 'all';
            if (selectedGroup === '全部成员' || !selectedGroup) selectedGroup = 'all';
            return selectedGroup;
        }

        function openUserAnalysis() {
            const modal = document.getElementById('userModal');
            const container = document.getElementById('userListContainer');

            if (modal) modal.style.display = 'flex';
            if (container) {
                container.innerHTML = '<div class="empty-state">正在分析互动数据...</div>';
                container.scrollTop = 0;
            }

            setTimeout(() => {
                performUserAnalysis();
            }, 50);
        }

        function closeUserAnalysis() {
            const modal = document.getElementById('userModal');
            if (modal) modal.style.display = 'none';
        }

        function performUserAnalysis() {
            const container = document.getElementById('userListContainer');
            if (!container) return;

            const allPosts = getAllPosts();
            const nameToId = {};
            const idToLatest = {};

            allPosts.forEach(post => {
                if (!post.userId) return;

                const time = new Date(post.timeStr).getTime();

                if (post.nameStr) {
                    nameToId[post.nameStr] = post.userId;
                }

                if (!idToLatest[post.userId] || time > idToLatest[post.userId].time) {
                    idToLatest[post.userId] = {
                        name: post.nameStr,
                        avatar: post.avatarHtml,
                        time
                    };
                }
            });

            const selectedGroup = getSelectedGroupValue();
            const sourceData = selectedGroup === 'all'
                ? allPosts
                : allPosts.filter(post => post.groupName === selectedGroup);

            const modalTitle = document.querySelector('#userModal .modal-title');
            if (modalTitle) {
                modalTitle.innerText = selectedGroup === 'all'
                    ? '房间消息互动榜 (全部)'
                    : `房间消息互动榜 (${selectedGroup})`;
            }

            const statsMap = {};
            let totalInteractions = 0;

            sourceData.forEach(post => {
                const match = post.contentHtml.match(/<blockquote[^>]*>\s*(.*?)[：:]/i);
                if (!match || !match[1]) return;

                const rawName = match[1].replace(/<[^>]+>/g, '').trim();
                if (!rawName) return;

                let uid = rawName;
                let realId = null;

                if (nameToId[rawName]) {
                    uid = nameToId[rawName];
                    realId = uid;
                }

                let displayName = rawName;
                let displayAvatar = '';

                if (realId && idToLatest[realId]) {
                    displayName = idToLatest[realId].name;
                    displayAvatar = idToLatest[realId].avatar;
                }

                if (!statsMap[uid]) {
                    statsMap[uid] = {
                        id: uid,
                        realId,
                        name: displayName,
                        count: 0,
                        avatar: displayAvatar,
                        aliases: new Set()
                    };
                }

                statsMap[uid].aliases.add(rawName);
                if (displayName) statsMap[uid].aliases.add(displayName);

                if (!statsMap[uid].avatar && displayAvatar) {
                    statsMap[uid].avatar = displayAvatar;
                }

                statsMap[uid].count++;
                totalInteractions++;
            });

            const sortedList = Object.values(statsMap).sort((a, b) => b.count - a.count);

            if (sortedList.length === 0) {
                container.innerHTML = '<div class="empty-state">暂无互动数据</div>';
                return;
            }

            let html = `
                <div style="padding: 15px; background: rgba(114, 46, 209, 0.1); border-bottom: 1px solid #d3adf7; margin-bottom: 10px; border-radius: 4px;">
                    <div style="font-weight: bold; color: #722ed1; font-size: 14px; text-align: center;">
                        互动总数: <span style="font-size: 18px;">${totalInteractions}</span> 次
                    </div>
                </div>
            `;

            sortedList.forEach((user, index) => {
                const rClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : ''));

                let avatarSrc = './icon.png';
                if (user.avatar) {
                    const srcMatch = user.avatar.match(/src=['"]([^'"]+)['"]/);
                    if (srcMatch) avatarSrc = srcMatch[1];
                }

                const aliasArray = Array.from(user.aliases).map(name => name.replace(/'/g, "\\'"));
                const clickAction = `showInteractions(['${aliasArray.join("','")}'])`;

                html += `
                <div class="list-item" onclick="${clickAction}" style="cursor: pointer; align-items: center; padding: 10px 8px;">
                    <div class="rank-num ${rClass}">${index + 1}</div>
                    <div style="margin-right: 12px;">
                        <img src="${avatarSrc}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                    </div>
                    <div class="item-main" style="display: flex; flex-direction: column; justify-content: center; flex: 1; min-width: 0;">
                        <span class="item-title" style="font-size: 14px; line-height: 1.4; margin-bottom: 2px;">
                            ${user.name}
                            ${user.realId ? `<span style="font-size:10px; color:#aaa; font-weight:normal;">(ID:${user.realId})</span>` : ''}
                        </span>
                    </div>
                    <div class="item-count" style="color: #722ed1; font-size: 13px; font-weight:bold;">${user.count} 次</div>
                </div>`;
            });

            container.innerHTML = html;
        }

        function showInteractions(names) {
            closeUserAnalysis();

            const contentInput = document.getElementById('search-content-input');
            const userInput = document.getElementById('search-user-input');

            if (userInput) userInput.value = '';

            if (contentInput) {
                if (Array.isArray(names)) {
                    const escapedNames = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                    contentInput.value = escapedNames.join('|');
                } else {
                    contentInput.value = names;
                }

                contentInput.dispatchEvent(new Event('input'));
            }
        }

        function openDateAnalysis() {
            const modal = document.getElementById('dateModal');
            const container = document.getElementById('dateListContainer');

            if (modal) modal.style.display = 'flex';
            if (container) container.innerHTML = '<div class="empty-state">正在分析数据...</div>';

            setTimeout(() => {
                performDateAnalysis();
                renderDateList();
            }, 100);
        }

        function closeDateAnalysis() {
            const modal = document.getElementById('dateModal');
            if (modal) modal.style.display = 'none';
        }

        function performDateAnalysis() {
            const counts = {};
            const selectedGroup = getSelectedGroupValue();
            const allPosts = getAllPosts();
            const memberNameMap = getMemberNameMap();
            const memberIdSet = getMemberIdSet();
            const sourceData = selectedGroup === 'all'
                ? allPosts
                : allPosts.filter(post => post.groupName === selectedGroup);

            const modalTitle = document.querySelector('#dateModal .modal-title');
            if (modalTitle) {
                modalTitle.innerText = selectedGroup === 'all'
                    ? '每日消息统计 (全部)'
                    : `每日消息统计 (${selectedGroup})`;
            }

            sourceData.forEach(post => {
                if (!post.dateFull) return;

                if (!counts[post.dateFull]) {
                    counts[post.dateFull] = { total: 0, member: 0 };
                }

                counts[post.dateFull].total++;

                const isMemberPost =
                    post.isMember ||
                    (post.nameStr === post.groupName) ||
                    post.isReply ||
                    memberNameMap.has(post.nameStr) ||
                    (post.userId && memberIdSet.has(String(post.userId)));

                if (isMemberPost) {
                    counts[post.dateFull].member++;
                }
            });

            dateStats = Object.entries(counts).map(([date, value]) => ({
                date,
                count: value.total,
                memberCount: value.member
            })).sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        function renderDateList() {
            const container = document.getElementById('dateListContainer');
            if (!container) return;

            if (dateStats.length === 0) {
                container.innerHTML = '<div class="empty-state">暂无日期数据</div>';
                return;
            }

            const max = Math.max(...dateStats.map(item => item.count));

            let html = '';
            dateStats.forEach(item => {
                const totalPct = (item.count / max) * 100;
                const memberPct = (item.memberCount / max) * 100;

                html += `
                <div class="list-item" onclick="filterByDate('${item.date}')">
                    <div class="item-main">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                            <span class="item-title">${item.date}</span>
                            <span style="font-size:11px; color:var(--text-sub);">
                                <span style="color:#FB7299; font-weight:bold;">成员: ${item.memberCount}</span>
                                <span style="opacity:0.3; margin:0 4px;">|</span>
                                总: ${item.count}
                            </span>
                        </div>
                        <div class="stat-bar-container" style="position:relative; background:var(--bar-bg); height:6px; border-radius:3px; overflow:hidden;">
                            <div class="stat-bar" style="width: ${totalPct}%; background:var(--text-sub); opacity:0.25; position:absolute; top:0; left:0; height:100%;"></div>
                            <div class="stat-bar" style="width: ${memberPct}%; background:#FB7299; position:absolute; top:0; left:0; height:100%; z-index:2;"></div>
                        </div>
                    </div>
                </div>`;
            });

            container.innerHTML = html;
        }

        function filterByUser(username) {
            closeUserAnalysis();

            const userInput = document.getElementById('search-user-input');
            const contentInput = document.getElementById('search-content-input');

            if (userInput) {
                userInput.value = username;
                if (contentInput) contentInput.value = '';

                if (typeof setFilter === 'function') setFilter('all');
                if (typeof selectDateItem === 'function') selectDateItem('year', 'all', '全部');
                if (typeof applyFilters === 'function') applyFilters();
            }
        }

        function filterByUserId(userId) {
            if (window.event) window.event.stopPropagation();

            const userInput = document.getElementById('search-user-input');
            const contentInput = document.getElementById('search-content-input');

            if (userInput) {
                userInput.value = String(userId).trim();

                if (contentInput) contentInput.value = '';
                if (typeof setFilter === 'function') setFilter('all');
                if (typeof selectDateItem === 'function') selectDateItem('year', 'all', '全部');
                if (typeof applyFilters === 'function') applyFilters();

                const view = document.getElementById('view-messages');
                if (view) view.scrollTop = 0;

                console.log(`[交互] 已点击 ID Tag: ${userId}，正在筛选...`);
            }
        }

        function filterByDate(dateStr) {
            closeDateAnalysis();
            const [year, month, day] = dateStr.split('-');

            const yearSelect = document.getElementById('yearSelect');
            const monthSelect = document.getElementById('monthSelect');
            const daySelect = document.getElementById('daySelect');

            if (yearSelect) {
                yearSelect.value = year;
                if (typeof populateMonths === 'function') populateMonths(year);
            }
            if (monthSelect) {
                monthSelect.value = parseInt(month).toString();
                if (typeof populateDays === 'function') populateDays(year, parseInt(month).toString());
                monthSelect.disabled = false;
            }
            if (daySelect) {
                daySelect.value = parseInt(day).toString();
                daySelect.disabled = false;
            }
            if (typeof applyFilters === 'function') applyFilters();
        }

        function openGiftAnalysis() {
            const modal = document.getElementById('giftAnalysisModal');
            const container = document.getElementById('giftAnalysisList');

            if (modal) modal.style.display = 'flex';
            if (container) {
                container.innerHTML = '<div class="empty-state">正在分析礼物数据...</div>';
                container.scrollTop = 0;
            }

            setTimeout(() => {
                performGiftAnalysis();
            }, 50);
        }

        function closeGiftAnalysis() {
            const modal = document.getElementById('giftAnalysisModal');
            if (modal) modal.style.display = 'none';
        }

        function performGiftAnalysis() {
            const container = document.getElementById('giftAnalysisList');
            if (!container) return;

            const selectedGroup = getSelectedGroupValue();
            const modalTitle = document.querySelector('#giftAnalysisModal .modal-title');
            if (modalTitle) {
                modalTitle.innerText = selectedGroup === 'all'
                    ? '房间礼物贡献榜 (全部)'
                    : `房间礼物贡献榜 (${selectedGroup})`;
            }

            const currentFilteredPosts = getCurrentFilteredPosts();
            const allPosts = getAllPosts();
            const sourceData = currentFilteredPosts.length > 0 ? currentFilteredPosts : allPosts;
            const pocketGiftData = getPocketGiftData();

            const userMap = {};
            let totalRevenue = 0;

            sourceData.forEach(post => {
                if (!post.contentHtml.includes('送出礼物：') && !post.contentHtml.includes('🎁')) return;

                const nameMatch = post.contentHtml.match(/送出礼物：([^<]+)/);
                const numMatch = post.contentHtml.match(/数量: x(\d+)/);
                if (!nameMatch || !numMatch) return;

                const giftName = nameMatch[1].trim();
                const count = parseInt(numMatch[1]);
                const uid = post.userId || post.nameStr || '未知用户';
                const postTime = new Date(post.timeStr).getTime();

                let price = 0;
                if (Array.isArray(pocketGiftData)) {
                    const giftObj = pocketGiftData.find(gift => gift.name === giftName);
                    if (giftObj) price = giftObj.cost;
                }

                const totalValue = price * count;

                if (!userMap[uid]) {
                    userMap[uid] = {
                        id: uid,
                        realUserId: post.userId,
                        name: post.nameStr || '未知用户',
                        totalCost: 0,
                        totalCount: 0,
                        avatar: post.avatarHtml,
                        latestTime: postTime
                    };
                }

                const user = userMap[uid];
                user.totalCost += totalValue;
                user.totalCount += count;
                totalRevenue += totalValue;

                if (postTime > user.latestTime) {
                    user.name = post.nameStr;
                    user.avatar = post.avatarHtml;
                    user.latestTime = postTime;
                    if (post.userId) user.realUserId = post.userId;
                }
            });

            const sortedList = Object.values(userMap).sort((a, b) => b.totalCost - a.totalCost);
            if (sortedList.length === 0) {
                container.innerHTML = '<div class="empty-state">未检测到礼物数据</div>';
                return;
            }

            let html = `
        <div style="padding: 15px; background: rgba(250, 140, 22, 0.1); border-bottom: 1px solid #ffd591; margin-bottom: 10px; border-radius: 4px;">
            <div style="font-weight: bold; color: #d46b08; font-size: 14px; text-align: center;">
                鸡腿总数: <span style="font-size: 18px;">${totalRevenue}</span> 🍗
            </div>
        </div>
    `;

            sortedList.forEach((user, index) => {
                const rClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : ''));

                let avatarSrc = './icon.png';
                if (user.avatar) {
                    const srcMatch = user.avatar.match(/src=['"]([^'"]+)['"]/);
                    if (srcMatch) avatarSrc = srcMatch[1];
                }

                const clickAction = `showUserGifts('${user.realUserId || ''}', '${escapeHtml(user.name)}')`;

                html += `
        <div class="list-item" onclick="${clickAction}" style="cursor: pointer; align-items: center; padding: 10px 8px;">
            <div class="rank-num ${rClass}">${index + 1}</div>
            <div style="margin-right: 12px;">
                <img src="${avatarSrc}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="item-main" style="display: flex; flex-direction: column; justify-content: center; flex: 1; min-width: 0;">
                <span class="item-title" style="font-size: 14px; line-height: 1.4; margin-bottom: 2px;">
                    ${user.name}
                    ${user.realUserId ? `<span style="font-size:10px; color:#aaa; font-weight:normal;">(ID:${user.realUserId})</span>` : ''}
                </span>
                <span style="font-size: 11px; color: #999; line-height: 1.3;">送出 ${user.totalCount} 个礼物</span>
            </div>
            <div class="item-count" style="color: #fa8c16; font-size: 13px; font-weight:bold;">${user.totalCost} 🍗</div>
        </div>`;
            });

            container.innerHTML = html;
        }

        function openSpeechAnalysis() {
            const modal = document.getElementById('speechAnalysisModal');
            const container = document.getElementById('speechAnalysisList');

            if (modal) modal.style.display = 'flex';
            if (container) {
                container.innerHTML = '<div class="empty-state">正在统计数据...</div>';
                container.scrollTop = 0;
            }

            setTimeout(() => {
                performSpeechAnalysis();
            }, 50);
        }

        function closeSpeechAnalysis() {
            const modal = document.getElementById('speechAnalysisModal');
            if (modal) modal.style.display = 'none';
        }

        function performSpeechAnalysis() {
            const container = document.getElementById('speechAnalysisList');
            if (!container) return;

            const selectedGroup = getSelectedGroupValue();
            const modalTitle = document.querySelector('#speechAnalysisModal .modal-title');
            if (modalTitle) {
                modalTitle.innerText = selectedGroup === 'all'
                    ? '用户发言活跃榜 (全部)'
                    : `用户发言活跃榜 (${selectedGroup})`;
            }

            const currentFilteredPosts = getCurrentFilteredPosts();
            const allPosts = getAllPosts();
            const sourceData = currentFilteredPosts.length > 0 ? currentFilteredPosts : allPosts;

            const userMap = {};
            let totalMessages = 0;

            sourceData.forEach(post => {
                if (!post.nameStr) return;
                if (post.contentHtml.includes('送出礼物：') || post.contentHtml.includes('🎁')) return;

                const uid = post.userId || post.nameStr;
                const postTime = new Date(post.timeStr).getTime();

                if (!userMap[uid]) {
                    userMap[uid] = {
                        id: uid,
                        realUserId: post.userId,
                        name: post.nameStr,
                        count: 0,
                        avatar: post.avatarHtml,
                        lastMsg: post.contentHtml,
                        latestTime: postTime
                    };
                }

                const user = userMap[uid];
                user.count++;
                totalMessages++;

                if (postTime > user.latestTime) {
                    user.name = post.nameStr;
                    user.avatar = post.avatarHtml;
                    user.lastMsg = post.contentHtml;
                    user.latestTime = postTime;
                    if (post.userId) user.realUserId = post.userId;
                }
            });

            const sortedList = Object.values(userMap).sort((a, b) => b.count - a.count);
            if (sortedList.length === 0) {
                container.innerHTML = '<div class="empty-state">无纯发言数据</div>';
                return;
            }

            let html = `
        <div style="padding: 15px; background: rgba(24, 144, 255, 0.1); border-bottom: 1px solid #91d5ff; margin-bottom: 10px; border-radius: 4px;">
            <div style="font-weight: bold; color: #096dd9; font-size: 14px; text-align: center;">
                发言总数: <span style="font-size: 18px;">${totalMessages}</span> 条
            </div>
        </div>
    `;

            sortedList.forEach((user, index) => {
                const rClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : ''));

                let avatarSrc = './icon.png';
                if (user.avatar) {
                    const srcMatch = user.avatar.match(/src=['"]([^'"]+)['"]/);
                    if (srcMatch) avatarSrc = srcMatch[1];
                }

                let previewTxt = user.lastMsg.replace(/<[^>]+>/g, '').trim();
                if (previewTxt.length > 10) previewTxt = previewTxt.substring(0, 10) + '...';
                if (!previewTxt) previewTxt = '图片/表情';

                const date = new Date(user.latestTime);
                const pad = value => String(value).padStart(2, '0');
                const timeStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

                const clickAction = user.realUserId
                    ? `filterByUserId('${user.realUserId}')`
                    : `filterByUser('${escapeHtml(user.name)}')`;

                html += `
        <div class="list-item" onclick="${clickAction}" style="cursor: pointer; align-items: center; padding: 10px 8px;">
            <div class="rank-num ${rClass}">${index + 1}</div>
            <div style="margin-right: 12px;">
                <img src="${avatarSrc}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="item-main" style="display: flex; flex-direction: column; justify-content: center; flex: 1; min-width: 0;">
                <span class="item-title" style="font-size: 14px; line-height: 1.4; margin-bottom: 2px;">
                    ${user.name}
                </span>
                <span style="font-size: 11px; color: #888; line-height: 1.3;">最近一条：${previewTxt}</span>
                <span style="font-size: 10px; color: #bbb; line-height: 1.3;">活跃时间：${timeStr}</span>
            </div>
            <div class="item-count" style="color: #1890ff; font-size: 13px; font-weight:bold;">${user.count} 条</div>
        </div>`;
            });

            container.innerHTML = html;
        }

        return {
            closeDateAnalysis,
            closeGiftAnalysis,
            closeSpeechAnalysis,
            closeUserAnalysis,
            filterByDate,
            filterByUser,
            filterByUserId,
            openDateAnalysis,
            openGiftAnalysis,
            openSpeechAnalysis,
            openUserAnalysis,
            showInteractions
        };
    };
})();
