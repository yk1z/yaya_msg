export function createRoomSelectionFeature({
    getMembers, getMemberDataLoaded, loadMemberData, getPinyinInitials, memberSortLogic, getTeamStyle,
    escapeHtml, setSelectedMemberName, switchView, showToast, selectRoomAlbumMember, fetchRoomAlbum, selectRoomRadioMember
}) {
    let isFetchSmallRoomMode = false;
    let isRoomAlbumSmallRoomMode = false;
    let isRoomRadioSmallRoomMode = false;

    function handleSearch(keyword) {
        const resultBox = document.getElementById('search-results');
        if (!keyword || !keyword.trim()) {
            resultBox.style.display = 'none';
            return;
        }

        if (!getMemberDataLoaded()) {
            if (typeof loadMemberData === 'function') loadMemberData();
            return;
        }

        const lowerKw = keyword.toLowerCase();

        let matches = getMembers().filter(m => {
            const matchName = m.ownerName.includes(keyword);

            const pinyin = m.pinyin || "";
            const matchPinyin = pinyin.toLowerCase().includes(lowerKw);

            const initials = getPinyinInitials(pinyin);
            const matchInitials = initials.toLowerCase().includes(lowerKw);

            return matchName || matchPinyin || matchInitials;
        });

        matches.sort(memberSortLogic);

        if (matches.length > 0) {
            const items = matches.map(member => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
                const inactive = member.isInGroup === false;
                const name = document.createElement('span');
                name.style.cssText = inactive ? 'font-weight:bold;opacity:0.6;color:#999;' : 'font-weight:bold;';
                name.textContent = member.ownerName;
                const team = document.createElement('span');
                team.className = 'team-tag';
                team.style.cssText = getTeamStyle(member.team, inactive);
                if (inactive) team.style.opacity = '0.6';
                team.textContent = member.team;
                item.append(name, team);
                item.addEventListener('click', () => selectToolMember(
                    member.ownerName, member.serverId, member.channelId, member.yklzId || ''
                ));
                return item;
            });
            resultBox.replaceChildren(...items);
            resultBox.style.display = 'block';
        } else {
            resultBox.innerHTML = '<div class="suggestion-item" style="cursor:default; color:var(--text-sub);">未找到该成员</div>';
            resultBox.style.display = 'block';
        }
    }

    function updateFetchRoomTypeUi() {
        const channelInput = document.getElementById('tool-channel');
        const channelLabel = document.getElementById('tool-channel-label');
        const toggleBtn = document.getElementById('btn-toggle-fetch-room-type');
        if (!channelInput || !toggleBtn) return;

        const roomTypeText = isFetchSmallRoomMode ? '小房间' : '大房间';
        const channelHint = `${roomTypeText} Channel ID`;
        channelInput.placeholder = channelHint;
        if (channelLabel) channelLabel.textContent = channelHint;
        toggleBtn.textContent = roomTypeText;
    }

    function applyFetchChannelValue() {
        const channelInput = document.getElementById('tool-channel');
        if (!channelInput) return;

        const bigChannelId = channelInput.dataset.bigChannelId || '';
        const smallChannelId = channelInput.dataset.smallChannelId || '';
        channelInput.value = isFetchSmallRoomMode ? smallChannelId : bigChannelId;
    }

    function selectToolMember(name, serverId, channelId, smallChannelId = '') {
        setSelectedMemberName(name);
        document.getElementById('member-search').value = name;
        document.getElementById('tool-server').value = serverId;
        const channelInput = document.getElementById('tool-channel');
        channelInput.dataset.bigChannelId = channelId || '';
        channelInput.dataset.smallChannelId = smallChannelId || '';
        applyFetchChannelValue();
        document.getElementById('search-results').style.display = 'none';
        document.getElementById('msg-result').innerHTML = '<div style="text-align:center;padding:20px;color:#999">已选择成员: ' + escapeHtml(name) + '<br>点击“抓取最新”开始</div>';
    }

    function toggleFetchRoomType() {
        isFetchSmallRoomMode = !isFetchSmallRoomMode;
        updateFetchRoomTypeUi();
        applyFetchChannelValue();
    }

    function updateRoomAlbumRoomTypeUi() {
        const channelInput = document.getElementById('room-album-channel-id');
        const channelLabel = document.getElementById('room-album-channel-label');
        const toggleBtn = document.getElementById('btn-toggle-room-album-room-type');
        if (!channelInput || !channelLabel || !toggleBtn) return;

        const roomTypeText = isRoomAlbumSmallRoomMode ? '小房间' : '大房间';
        channelLabel.textContent = `${roomTypeText} Channel ID`;
        channelInput.placeholder = `${roomTypeText} Channel ID`;
        toggleBtn.textContent = roomTypeText;
    }

    function applyRoomAlbumChannelValue() {
        const channelInput = document.getElementById('room-album-channel-id');
        if (!channelInput) return;

        const bigChannelId = channelInput.dataset.bigChannelId || '';
        const smallChannelId = channelInput.dataset.smallChannelId || '';
        channelInput.value = isRoomAlbumSmallRoomMode ? smallChannelId : bigChannelId;
    }

    function toggleRoomAlbumRoomType() {
        isRoomAlbumSmallRoomMode = !isRoomAlbumSmallRoomMode;
        updateRoomAlbumRoomTypeUi();
        applyRoomAlbumChannelValue();
    }

    function openRoomAlbumForRoom(name, bigChannelId, smallChannelId = '', roomType = 'big') {
        const normalizedBigChannelId = String(bigChannelId || '').trim();
        const normalizedSmallChannelId = String(smallChannelId || '').trim();
        const openSmallRoom = roomType === 'small' && !!normalizedSmallChannelId;
        const targetChannelId = openSmallRoom ? normalizedSmallChannelId : normalizedBigChannelId;
        if (!targetChannelId) {
            showToast('当前房间缺少相册 Channel ID');
            return;
        }

        isRoomAlbumSmallRoomMode = openSmallRoom;
        switchView('room-album');
        selectRoomAlbumMember(name, normalizedBigChannelId, normalizedSmallChannelId);
        updateRoomAlbumRoomTypeUi();
        applyRoomAlbumChannelValue();
        setTimeout(() => fetchRoomAlbum(false), 0);
    }

    async function openRoomAlbumByChannelId(channelId) {
        const normalizedChannelId = String(channelId || '').trim();
        if (!/^\d{1,32}$/.test(normalizedChannelId)) return false;

        if (!getMemberDataLoaded() && typeof loadMemberData === 'function') {
            try {
                await loadMemberData();
            } catch (error) {
                console.warn('按 Channel ID 打开房间相册时加载成员资料失败:', error);
            }
        }

        const member = (getMembers() || []).find(item => (
            String(item?.channelId || '') === normalizedChannelId
            || String(item?.yklzId || '') === normalizedChannelId
        ));
        const bigChannelId = String(member?.channelId || normalizedChannelId).trim();
        const smallChannelId = String(member?.yklzId || '').trim();
        isRoomAlbumSmallRoomMode = Boolean(
            member
            && smallChannelId
            && smallChannelId === normalizedChannelId
        );
        selectRoomAlbumMember(member?.ownerName || '', bigChannelId, smallChannelId);
        updateRoomAlbumRoomTypeUi();
        applyRoomAlbumChannelValue();
        setTimeout(() => fetchRoomAlbum(false), 0);
        return true;
    }

    function updateRoomRadioRoomTypeUi() {
        const channelInput = document.getElementById('room-radio-channel-id');
        const channelLabel = document.getElementById('room-radio-channel-label');
        const toggleBtn = document.getElementById('btn-toggle-room-radio-room-type');
        if (!channelInput || !channelLabel || !toggleBtn) return;

        const roomTypeText = isRoomRadioSmallRoomMode ? '小房间' : '大房间';
        channelLabel.textContent = `${roomTypeText} Channel ID`;
        channelInput.placeholder = `${roomTypeText} Channel ID`;
        toggleBtn.textContent = roomTypeText;
    }

    function applyRoomRadioChannelValue() {
        const channelInput = document.getElementById('room-radio-channel-id');
        if (!channelInput) return;

        const bigChannelId = channelInput.dataset.bigChannelId || '';
        const smallChannelId = channelInput.dataset.smallChannelId || '';
        channelInput.value = isRoomRadioSmallRoomMode ? smallChannelId : bigChannelId;
    }

    function toggleRoomRadioRoomType() {
        isRoomRadioSmallRoomMode = !isRoomRadioSmallRoomMode;
        updateRoomRadioRoomTypeUi();
        applyRoomRadioChannelValue();
    }

    function setRoomRadioRoomType(useSmallRoom) {
        isRoomRadioSmallRoomMode = useSmallRoom === true;
        updateRoomRadioRoomTypeUi();
        applyRoomRadioChannelValue();
    }

    function openRoomRadioByChannelId(channelId) {
        const id = String(channelId || '').trim();
        if (!/^[1-9]\d{0,31}$/.test(id)) return false;
        const member = (getMembers() || []).find(item =>
            [item.channelId, item.yklzId, item.smallChannelId, item.smallRoomId].some(value => String(value || '') === id));
        const smallId = String(member?.yklzId || member?.smallChannelId || member?.smallRoomId || '');
        selectRoomRadioMember(member?.ownerName || member?.name || '', String(member?.channelId || id), String(member?.serverId || ''), smallId);
        setRoomRadioRoomType(Boolean(smallId && smallId === id));
        return true;
    }

    updateFetchRoomTypeUi();
    updateRoomAlbumRoomTypeUi();
    updateRoomRadioRoomTypeUi();
    document.addEventListener('click', function (e) {
        const wrapper = document.querySelector('.search-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            document.getElementById('search-results').style.display = 'none';
        }
    });
    Object.assign(window, { handleSearch, toggleFetchRoomType, toggleRoomAlbumRoomType, toggleRoomRadioRoomType });
    return {
        getFetchRoomType: () => isFetchSmallRoomMode ? 'small' : 'big',
        applyRoomAlbumChannelValue, applyRoomRadioChannelValue,
        openRoomAlbumByChannelId, openRoomAlbumForRoom, openRoomRadioByChannelId, setRoomRadioRoomType
    };
}
