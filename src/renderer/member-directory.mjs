export function createMemberDirectory({
    getMembers, setMembers, loadMemberData, setStatus, onRefreshPrivateMessages, onRefreshSuggestions
}) {
    const memberNameMap = new Map();
    const memberIdSet = new Set();
    const memberTeamMap = new Map();

    function buildMemberCollectionsFromList(list) {
        memberNameMap.clear();
        memberIdSet.clear();
        memberTeamMap.clear();

        (Array.isArray(list) ? list : []).forEach(member => {
            const name = String(member?.ownerName || '').trim();
            const id = String(member?.id || '').trim();
            const team = String(member?.team || '').trim();

            if (!name || !id) return;

            memberNameMap.set(name, id);
            memberIdSet.add(id);
            if (team) memberTeamMap.set(name, team);

            if (name.includes('-')) {
                const simpleName = name.split('-')[1]?.trim();
                if (simpleName && !memberNameMap.has(simpleName)) {
                    memberNameMap.set(simpleName, id);
                    if (team) memberTeamMap.set(simpleName, team);
                }
            }
        });

        initBestNames();
    }

    async function loadMemberIdMap() {
        if (memberNameMap.size > 0 && sessionStorage.getItem('member_updated_this_session')) {
            return;
        }

        try {
            console.log("启动软件：正在获取最新的成员列表...");
            sessionStorage.setItem('member_updated_this_session', 'true');
            await autoUpdateMemberData();
            setStatus("成员映射表加载完成");
        } catch (e) {
            console.error("加载映射表失败:", e);
            setStatus("映射表解析出错");
        }
    }
    const bestNameMapForDisplay = new Map();

    async function autoUpdateMemberData() {
        setStatus("正在更新完整成员列表...");

        try {
            let allMembers = [];
            if (window.YayaMemberDataStore && typeof window.YayaMemberDataStore.loadMemberData === 'function') {
                allMembers = await window.YayaMemberDataStore.loadMemberData({ forceRefresh: true });
            } else if (typeof loadMemberData === 'function') {
                allMembers = await loadMemberData({ forceRefresh: true });
            }

            if (Array.isArray(allMembers) && allMembers.length > 0) {
                setMembers(allMembers);
            } else {
                throw new Error("JSON 数据格式不正确");
            }

            buildMemberCollectionsFromList(allMembers);

            onRefreshPrivateMessages();

            setStatus(`成员列表更新完成 (${allMembers.length}人)`);

            setTimeout(() => {
                setStatus("软件已就绪");
            }, 3000);

        } catch (err) {
            console.error("自动更新成员 ID 失败:", err);
            let cachedMembers = [];
            if (window.YayaMemberDataStore && typeof window.YayaMemberDataStore.readCachedMemberDataList === 'function') {
                cachedMembers = window.YayaMemberDataStore.readCachedMemberDataList();
            }

            if (Array.isArray(cachedMembers) && cachedMembers.length > 0) {
                if (window.YayaMemberDataStore && typeof window.YayaMemberDataStore.applyMemberDataList === 'function') {
                    window.YayaMemberDataStore.applyMemberDataList(cachedMembers);
                }
                setMembers(cachedMembers);
                buildMemberCollectionsFromList(cachedMembers);
                setStatus(`成员列表更新失败，已使用缓存 (${cachedMembers.length}人)`);
            } else if (getMembers()?.length > 0) {
                buildMemberCollectionsFromList(getMembers());
                setStatus("成员列表更新失败，已使用当前内存数据");
            } else {
                setStatus("成员列表更新失败");
                throw err;
            }
        }
    }

    window.addEventListener('member-data-loaded', () => {
        buildMemberCollectionsFromList(getMembers());
        onRefreshSuggestions();
        onRefreshPrivateMessages();
    });

    function initBestNames() {
        bestNameMapForDisplay.clear();
        for (const [name, id] of memberNameMap) {
            if (!bestNameMapForDisplay.has(id) || name.length > bestNameMapForDisplay.get(id).length) {
                bestNameMapForDisplay.set(id, name);
            }
        }
    }

    return { memberNameMap, memberIdSet, memberTeamMap, bestNameMapForDisplay, loadMemberIdMap };
}

export function getPinyinInitials(pinyinStr) {
    if (!pinyinStr) return "";
    return pinyinStr.replace(/[^A-Z]/g, "");
}

function getMemberWeight(m) {
    if (!m) return 1;
    return (m.isInGroup !== false) ? 1 : 0;
}

export function memberSortLogic(a, b) {
    const weightA = getMemberWeight(a);
    const weightB = getMemberWeight(b);
    return weightB - weightA;
}

export function getGroupCode(memberId, teamName, nickname) {
    if (window.memberData && memberId) {
        const m = window.memberData.find(x => x.id == memberId || x.userId == memberId);
        if (m && m.team) {
            const t = m.team.toUpperCase();
            if (t.includes('GNZ')) return 'gnz';
            if (t.includes('BEJ')) return 'bej';
            if (t.includes('CKG')) return 'ckg';
            if (t.includes('CGT')) return 'cgt';
            if (t.includes('IDFT')) return 'idft';
            if (t.includes('SNH')) return 'snh';
        }
    }

    if (teamName) {
        const t = teamName.toUpperCase();
        if (t.includes('GNZ') || t.includes('TEAM G') || t.includes('NIII') || t.includes('TEAM Z')) return 'gnz';
        if (t.includes('BEJ') || t.includes('TEAM B') || t.includes('TEAM E') || t.includes('TEAM J')) return 'bej';
        if (t.includes('CKG') || t.includes('TEAM C') || t.includes('TEAM K')) return 'ckg';
        if (t.includes('CGT') || t.includes('CII') || t.includes('GII')) return 'cgt';
        if (t.includes('IDFT')) return 'idft';
        if (t.includes('SNH')) return 'snh';
    }

    if (nickname) {
        const n = nickname.toUpperCase();
        if (n.startsWith('GNZ')) return 'gnz';
        if (n.startsWith('BEJ')) return 'bej';
        if (n.startsWith('CKG')) return 'ckg';
        if (n.startsWith('CGT')) return 'cgt';
    }

    return 'snh';
}
