(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createProfileFeature = function createProfileFeature(deps) {
        const {
            getAppToken,
            getMemberData,
            getMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle,
            ipcRenderer
        } = deps;

        function getProfileSearchResultBox() {
            return document.getElementById('profile-search-results');
        }

        function handleProfileSearch(keyword) {
            const resultBox = getProfileSearchResultBox();
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
                const matchName = String(member.ownerName || '').includes(keyword);
                const pinyin = String(member.pinyin || '');
                const matchPinyin = pinyin.toLowerCase().includes(lowerKeyword);
                const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : '';
                const matchInitials = String(initials).toLowerCase().includes(lowerKeyword);
                return matchName || matchPinyin || matchInitials;
            });

            matches.sort(memberSortLogic);

            if (!matches.length) {
                resultBox.style.display = 'none';
                return;
            }

            resultBox.innerHTML = matches.map(member => {
                const isInactive = member.isInGroup === false;
                const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';
                const colorStyle = typeof getTeamStyle === 'function'
                    ? (getTeamStyle(member.team, isInactive) || '')
                    : '';

                return `<div class="suggestion-item"
                 onclick="selectProfileMember('${member.ownerName}', '${member.id || member.userId || member.memberId}')"
                 style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight:bold; ${baseStyle}">${member.ownerName}</span>
                <span class="team-tag" style="${baseStyle} ${colorStyle}">${member.team}</span>
            </div>`;
            }).join('');
            resultBox.style.display = 'block';
        }

        function selectProfileMember(name, userId) {
            const inputEl = document.getElementById('profile-member-input');
            const idEl = document.getElementById('profile-member-id');
            const resultBox = getProfileSearchResultBox();

            if (inputEl) inputEl.value = name || '';
            if (idEl) idEl.value = userId || '';
            if (resultBox) resultBox.style.display = 'none';
        }

        async function loadStarProfile() {
            const container = document.getElementById('profile-result-container');
            const memberId = String(document.getElementById('profile-member-id')?.value || '').trim();
            const token = getAppToken ? getAppToken() : (localStorage.getItem('yaya_p48_token') || '');

            if (!container) return;

            if (!token) {
                container.innerHTML = `
            <div class="placeholder-tip">
                <h3 style="color: #ff4d4f;">⚠️ 未登录</h3>
                <p>请先在左侧“账号设置”中登录。</p>
            </div>`;
                return;
            }

            if (!memberId) {
                container.innerHTML = `
            <div class="placeholder-tip">
                <h3 style="color: #ff4d4f;">⚠️ 未选择成员</h3>
                <p>请在上方输入框搜索成员名字，并点击下拉项选中。</p>
            </div>`;
                return;
            }

            container.innerHTML = '<div class="empty-state">正在读取完整档案...</div>';

            try {
                const pa = window.getPA ? window.getPA() : null;
                const [archiveRes, historyRes] = await Promise.all([
                    ipcRenderer.invoke('fetch-star-archives', { token, pa, memberId }),
                    ipcRenderer.invoke('fetch-star-history', { token, pa, memberId })
                ]);

                if (archiveRes.success && archiveRes.content) {
                    const data = archiveRes.content;
                    if (historyRes.success && historyRes.content && historyRes.content.history) {
                        data.fullHistory = historyRes.content.history;
                        console.log(`获取到完整履历 ${data.fullHistory.length} 条`);
                    } else {
                        data.fullHistory = data.history;
                    }

                    renderProfile(data, container);
                } else {
                    container.innerHTML = `<div class="placeholder-tip"><h3>❌ 获取失败</h3><p>${archiveRes.msg || '未知错误'}</p></div>`;
                }
            } catch (error) {
                container.innerHTML = `<div class="placeholder-tip"><h3>❌ 发生错误</h3><p>${error.message}</p></div>`;
            }
        }

        function renderProfile(data, container) {
            const info = data.starInfo || data;
            const photos = [];
            if (info.fullPhoto1) photos.push(info.fullPhoto1);
            if (info.fullPhoto2) photos.push(info.fullPhoto2);
            if (info.fullPhoto3) photos.push(info.fullPhoto3);
            if (info.fullPhoto4) photos.push(info.fullPhoto4);

            const photosHtml = photos.map(url => {
                const safeUrl = url.startsWith('http') ? url : 'https://source.48.cn' + url;
                return `<img src="${safeUrl}" style="width:100%; border-radius:8px; margin-bottom:10px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">`;
            }).join('');

            let historyHtml = '';
            const historyList = data.fullHistory || data.history;

            if (historyList && historyList.length > 0) {
                const historyItems = historyList.map(item => {
                    const dateStr = item.showTime || item.ctime;
                    return `
            <div style="margin-bottom: 6px; display: flex; align-items: baseline;">
                <span style="color: var(--primary); font-weight:bold; font-size:12px; margin-right:12px; min-width:85px; text-align: right;">${dateStr}</span>
                <span style="color: var(--text); flex: 1; word-break: break-word;">${item.content}</span>
            </div>`;
                }).join('');

                historyHtml = `
            <div style="margin-top:20px; padding-top:15px; border-top:1px dashed var(--border);">
                <div style="font-weight: bold; font-size: 15px; margin-bottom: 10px; color: var(--text);">成员编年史</div>
                <div style="font-size:13px; line-height: 1.6; background: var(--input-bg); padding: 12px; border-radius: 8px;">
                    ${historyItems}
                </div>
            </div>
            `;
            }

            const displayName = info.starName || info.nickname;
            container.innerHTML = `
            <div class="Box-row" style="margin-bottom: 20px;">
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 15px; border-left: 4px solid var(--primary); padding-left: 10px;">
                ${displayName} <span style="font-size:14px; color:var(--text-sub); font-weight:normal;">(${info.pinyin || ''})</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px; color: var(--text);">
                <div><strong>昵称:</strong> ${info.nickname || '-'}</div>
                <div><strong>身高:</strong> ${info.height || '-'} cm</div>
                <div><strong>血型:</strong> ${info.bloodType || '-'}</div>
                <div><strong>出生地:</strong> ${info.birthplace || '-'}</div>
                <div><strong>生日:</strong> ${info.birthday || '-'}</div>
                <div><strong>星座:</strong> ${info.constellation || '-'}</div>
                <div><strong>所属队伍:</strong> ${info.starTeamName || '-'}</div>
                <div><strong>加入期数:</strong> ${info.periodName || '-'}</div>
                <div><strong>入团时间:</strong> ${info.joinTime || '-'}</div>             
                <div><strong>特长:</strong> ${info.specialty || '-'}</div>
            </div>
            <div style="margin-top: 10px; font-size: 14px; color: var(--text);">
                <strong>爱好:</strong> ${info.hobbies || '-'}
            </div>

            ${historyHtml}
        </div>

        <div style="margin-top: 25px; margin-bottom: 15px; font-weight: bold; font-size: 16px; border-left: 4px solid var(--primary); padding-left: 10px; color: var(--text);">
            公式照
        </div>

        <div style="column-count: 2; column-gap: 15px;">
            ${photosHtml}
        </div>
    `;
        }

        return {
            handleProfileSearch,
            selectProfileMember,
            loadStarProfile
        };
    };
})();
