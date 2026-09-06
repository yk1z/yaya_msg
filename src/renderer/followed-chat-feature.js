(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createFollowedChatFeature = function createFollowedChatFeature(deps) {
        const {
            createCustomAudioPlayer,
            createCustomVideoPlayer,
            fetchPocketAPI,
            getAdaptivePollDelay,
            getAppToken,
            getCurrentUserId,
            getOptimizedThumbUrl,
            getMemberData,
            ipcRenderer,
            loadMemberData,
            playArchiveFromMessage,
            playLiveStream,
            setMediaReturnView,
            replaceTencentEmoji,
            showConfirm,
            showToast,
            switchView
        } = deps;

        let followedAutoRefreshEnabled = false;
        let activeFollowedChannel = '';
        let activeFollowedServer = '';
        let activeFollowedName = '';
        let activeFollowedMemberId = '';
        let activeFollowedNextTime = 0;
        let isFollowedChatLoading = false;
        let followedChatRequestRevision = 0;

        let followedAutoRefreshTimer = null;
        let followedAutoRefreshRunning = false;
        let followedAutoRefreshCycle = 0;
        let activeFollowedMainChannel = '';
        let isFollowedSmallRoomMode = false;
        let followedStickToBottom = true;
        let followedUserScrollLockUntil = 0;
        let followedLastScrollTop = 0;
        let followedAutoScrollToken = 0;
        let followedPendingBottomTimer = null;
        let followedPendingHtml = '';
        let followedPendingCount = 0;
        let followedPendingMessageIds = new Set();
        let followedGiftCacheSaveTimer = null;
        let activeFollowedFallbackAvatarUrl = '';
        let followedUserProfileRequestToken = 0;
        let followedUserProfileCurrentEntry = null;
        let followedProfileVideoCoverObserver = null;
        let followedProfileDynamicStatsObserver = null;
        const followedUserProfileHistory = [];
        const followedServerDetailCache = new Map();
        const followedProfileDynamicStatsCache = new Map();
        const followedProfileDynamicStatsRequests = new Map();
        const followedProfileDynamicCommentStateMap = new Map();
        const FOLLOWED_CHAT_REQUEST_TIMEOUT_MS = 20000;

        function fetchFollowedRoomMessagesWithTimeout(payload) {
            let timeoutId = null;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error('口袋房间消息加载超时'));
                }, FOLLOWED_CHAT_REQUEST_TIMEOUT_MS);
            });

            return Promise.race([
                ipcRenderer.invoke('fetch-room-messages', payload),
                timeoutPromise
            ]).finally(() => {
                if (timeoutId) clearTimeout(timeoutId);
            });
        }

        function normalizeFollowedNextTime(nextTime, requestedNextTime = 0) {
            const normalized = String(nextTime == null ? '' : nextTime).trim();
            const requested = String(requestedNextTime == null ? '' : requestedNextTime).trim();
            if (!normalized || normalized === '0') return 0;
            if (requested && requested !== '0' && normalized === requested) return 0;
            return nextTime;
        }

        function escapeFollowedHtml(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function normalizeFollowedPocketMediaUrl(mediaPath) {
            const rawPath = String(mediaPath || '').trim();
            if (!rawPath) return '';
            if (/^https?:\/\//i.test(rawPath)) return rawPath;
            if (rawPath.includes('48.cn')) {
                return `https://${rawPath.replace(/^\/+/, '')}`;
            }

            return rawPath.startsWith('/')
                ? `https://source3.48.cn${rawPath}`
                : `https://source3.48.cn/${rawPath}`;
        }

        function normalizeFollowedSourceUrl(mediaPath) {
            const rawPath = String(mediaPath || '').trim();
            if (!rawPath) return '';
            if (/^https?:\/\//i.test(rawPath)) return rawPath;
            if (rawPath.includes('48.cn')) {
                return `https://${rawPath.replace(/^\/+/, '')}`;
            }

            return rawPath.startsWith('/')
                ? `https://source.48.cn${rawPath}`
                : `https://source.48.cn/${rawPath}`;
        }

        function getFollowedMediaThumbUrl(url, width = 360) {
            const rawUrl = String(url || '').trim();
            if (!rawUrl) return '';
            if (/\.(mp4|mov|aac|mp3)(\?|$)/i.test(rawUrl)) return rawUrl;
            if (typeof getOptimizedThumbUrl === 'function') {
                return getOptimizedThumbUrl(rawUrl) || rawUrl;
            }
            const sep = rawUrl.includes('?') ? '&' : '?';
            return `${rawUrl}${sep}imageView&thumbnail=${Number(width) || 360}x0`;
        }

        function getFollowedProfileContent(response) {
            return response?.content || response?.data?.content || {};
        }

        function getFollowedUserInfo(content) {
            return content?.userInfo || content?.user || content?.profile || content || {};
        }

        function getFollowedBaseUserInfo(userInfo) {
            return userInfo?.baseUserInfo || userInfo?.baseInfo || userInfo || {};
        }

        function getFollowedUserAvatarUrl(userInfo) {
            const base = getFollowedBaseUserInfo(userInfo);
            return normalizeFollowedSourceUrl(
                base.avatar
                || base.avatarUrl
                || base.faceImage
                || userInfo?.avatar
                || userInfo?.avatarUrl
                || ''
            );
        }

        function toFollowedInlineArg(value) {
            return escapeFollowedHtml(JSON.stringify(String(value == null ? '' : value)));
        }

        function getFollowedProfileDisplayName(userInfo, fallback = '口袋用户') {
            const base = getFollowedBaseUserInfo(userInfo);
            return base.nickname
                || base.nickName
                || base.userName
                || userInfo?.nickname
                || userInfo?.nickName
                || userInfo?.userName
                || fallback;
        }

        function getFollowedProfileUserId(userInfo, fallback = '') {
            const base = getFollowedBaseUserInfo(userInfo);
            return base.userId || base.id || userInfo?.userId || userInfo?.id || fallback;
        }

        function renderFollowedProfileMeta(label, value) {
            const normalized = String(value == null ? '' : value).trim();
            if (!normalized) return '';
            return `
                <div class="followed-user-profile-meta-item">
                    <span>${escapeFollowedHtml(label)}</span>
                    <strong>${escapeFollowedHtml(normalized)}</strong>
                </div>`;
        }

        function getFollowedNestedValue(source, path) {
            return String(path || '').split('.').reduce((current, key) => {
                if (!current || typeof current !== 'object') return undefined;
                return current[key];
            }, source);
        }

        function getFirstFollowedProfileValue(sources, paths) {
            for (const path of paths) {
                for (const source of sources) {
                    const value = getFollowedNestedValue(source, path);
                    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
                }
            }
            return '';
        }

        function formatFollowedProfileValue(value) {
            if (value === true) return '是';
            if (value === false) return '否';
            if (Array.isArray(value)) {
                return value
                    .map(item => {
                        if (item == null) return '';
                        if (typeof item === 'object') {
                            return item.name || item.title || item.label || item.badgeName || item.medalName || '';
                        }
                        return String(item);
                    })
                    .filter(Boolean)
                    .join('、');
            }
            if (typeof value === 'object') {
                return value.name || value.title || value.label || value.badgeName || value.medalName || '';
            }
            return value;
        }

        function renderFollowedProfileMetaGroup(sources, definitions) {
            const rendered = [];
            const seenLabels = new Set();
            definitions.forEach(def => {
                const value = formatFollowedProfileValue(getFirstFollowedProfileValue(sources, def.paths));
                const html = renderFollowedProfileMeta(def.label, value);
                if (html && !seenLabels.has(def.label)) {
                    rendered.push(html);
                    seenLabels.add(def.label);
                }
            });
            return rendered.join('');
        }

        function normalizeFollowedRelationText(sources) {
            const explicitText = String(getFirstFollowedProfileValue(sources, ['relationText', 'followStatusText', 'friendStatusText', 'followText']) || '').trim();
            if (/互相关注|互关/.test(explicitText)) return '互相关注';
            if (/已关注|关注/.test(explicitText)) return '已关注';

            const relationValue = String(getFirstFollowedProfileValue(sources, ['relation', 'relationType', 'followStatus', 'friendStatus', 'isFollow', 'followed', 'isFriend']) || '').trim().toLowerCase();
            if (['mutual', 'both', 'friend', 'friends', '2', '3'].includes(relationValue)) return '互相关注';
            if (['true', 'followed', 'following', '1'].includes(relationValue)) return '已关注';
            return '关注';
        }

        async function toggleFollowedProfileFollow(userId, displayName = '', button = null) {
            const normalizedUserId = String(userId || '').trim();
            if (!normalizedUserId) {
                if (typeof showToast === 'function') showToast('没有获取到用户 ID');
                return;
            }

            const token = getAppToken ? getAppToken() : (typeof window.getAppToken === 'function' ? window.getAppToken() : '');
            if (!token) {
                if (typeof showToast === 'function') showToast('请先登录账号');
                return;
            }

            const targetButton = button || document.querySelector('.followed-pocket-action[data-action="follow"]');
            const currentText = String(targetButton?.textContent || '关注').trim();
            const shouldUnfollow = currentText === '已关注' || currentText === '互相关注';
            const channel = shouldUnfollow ? 'unfollow-member' : 'follow-member';
            const pa = window.getPA ? window.getPA() : null;
            const safeName = displayName || '用户';

            if (targetButton) {
                targetButton.disabled = true;
                targetButton.textContent = shouldUnfollow ? '取关中...' : '关注中...';
            }
            if (typeof showToast === 'function') {
                showToast(`正在${shouldUnfollow ? '取消关注' : '关注'} ${safeName}`);
            }

            try {
                const res = await ipcRenderer.invoke(channel, { token, pa, memberId: normalizedUserId });
                if (!res || !res.success) {
                    throw new Error(res?.msg || '操作失败');
                }
                if (window.allFollowedIds instanceof Set) {
                    if (shouldUnfollow) {
                        window.allFollowedIds.delete(normalizedUserId);
                    } else {
                        window.allFollowedIds.add(normalizedUserId);
                    }
                }
                if (targetButton) {
                    targetButton.textContent = shouldUnfollow ? '关注' : '已关注';
                    targetButton.disabled = false;
                }
                if (typeof showToast === 'function') {
                    showToast(`${shouldUnfollow ? '已取消关注' : '成功关注'} ${safeName}`);
                }
            } catch (error) {
                if (targetButton) {
                    targetButton.textContent = currentText || '关注';
                    targetButton.disabled = false;
                }
                if (typeof showToast === 'function') showToast(`操作失败: ${error.message}`);
            }
        }

        function openFollowedProfilePrivateMessage(userId, displayName = '', avatarUrl = '') {
            const normalizedUserId = String(userId || '').trim();
            if (!normalizedUserId) {
                if (typeof showToast === 'function') showToast('没有获取到用户 ID');
                return;
            }

            closeFollowedUserProfile();
            if (typeof switchView === 'function') {
                switchView('private-messages');
            }

            window.setTimeout(() => {
                if (typeof window.openPrivateMessageDetail !== 'function') {
                    if (typeof showToast === 'function') showToast('私信模块还没有准备好');
                    return;
                }

                window.openPrivateMessageDetail(normalizedUserId, {
                    title: displayName || '私信详情',
                    avatar: avatarUrl || './icon.png'
                });
            }, 0);
        }

        function normalizeFollowedProfileMemberName(value) {
            return String(value || '')
                .trim()
                .replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48|SHY48|IDFT)-/i, '')
                .replace(/\s+/g, '')
                .toLowerCase();
        }

        function findFollowedProfileMemberRoom(userId, displayName = '') {
            const normalizedUserId = String(userId || '').trim();
            const targetNames = [
                displayName,
                String(displayName || '').split('-').pop()
            ]
                .map(normalizeFollowedProfileMemberName)
                .filter(Boolean);
            const memberList = typeof getMemberData === 'function' ? getMemberData() : [];
            if (!Array.isArray(memberList)) return null;

            return memberList.find(member => {
                if (!member || !member.channelId) return false;
                const ids = [
                    member.id,
                    member.userId,
                    member.memberId,
                    member.ownerId,
                    member.starId
                ].map(value => String(value || '').trim()).filter(Boolean);
                if (normalizedUserId && ids.includes(normalizedUserId)) return true;

                const memberNames = [
                    member.ownerName,
                    member.nickname,
                    member.nickName,
                    member.name,
                    member.realNickName,
                    member.starName,
                    member.bigDisplayName,
                    member.pinkStarName
                ].map(normalizeFollowedProfileMemberName).filter(Boolean);

                return targetNames.some(name => memberNames.includes(name));
            }) || null;
        }

        async function openFollowedProfileRoom(userId, displayName = '') {
            const normalizedUserId = String(userId || '').trim();
            let member = findFollowedProfileMemberRoom(normalizedUserId, displayName);

            if (!member && typeof loadMemberData === 'function') {
                try {
                    await loadMemberData();
                    member = findFollowedProfileMemberRoom(normalizedUserId, displayName);
                } catch (error) {
                    console.warn('打开口袋房间前加载成员库失败:', error);
                }
            }

            if (!member || !member.channelId) {
                if (typeof showToast === 'function') showToast('没有找到对应口袋房间');
                return;
            }

            closeFollowedUserProfile();
            if (typeof switchView === 'function') {
                switchView('followed-rooms');
            }

            window.setTimeout(() => {
                openFollowedChat(
                    member.ownerName || member.nickname || member.name || displayName || '成员',
                    member.channelId,
                    member.serverId || ''
                );
            }, 0);
        }

        function closeFollowedProfileVideo() {
            const modal = document.getElementById('followedProfileVideoModal');
            if (!modal) return;
            const slot = modal.querySelector('.followed-profile-video-slot');
            if (slot) slot.replaceChildren();
            modal.style.display = 'none';
        }

        function openFollowedProfileVideo(videoUrl) {
            const safeUrl = String(videoUrl || '').trim();
            if (!safeUrl) {
                if (typeof showToast === 'function') showToast('视频地址为空');
                return;
            }

            let modal = document.getElementById('followedProfileVideoModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'followedProfileVideoModal';
                modal.className = 'modal-overlay followed-profile-video-modal';
                modal.innerHTML = `
                    <div class="followed-profile-video-dialog" onclick="event.stopPropagation()">
                        <button type="button" class="followed-profile-video-close" onclick="closeFollowedProfileVideo()" aria-label="关闭">×</button>
                        <div class="followed-profile-video-slot"></div>
                    </div>`;
                modal.addEventListener('click', closeFollowedProfileVideo);
                document.body.appendChild(modal);
            }

            const slot = modal.querySelector('.followed-profile-video-slot');
            if (!slot) return;
            slot.innerHTML = `<video class="followed-profile-video-player" src="${escapeFollowedHtml(safeUrl)}" controls autoplay playsinline></video>`;
            modal.style.display = 'flex';
        }

        function getFollowedProfileVideoCoverObserver() {
            if (followedProfileVideoCoverObserver) return followedProfileVideoCoverObserver;
            followedProfileVideoCoverObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const video = entry.target;
                    if (!video.src && video.dataset.src) {
                        video.src = video.dataset.src;
                        video.preload = 'metadata';
                    }
                    followedProfileVideoCoverObserver.unobserve(video);
                });
            }, { rootMargin: '180px' });
            return followedProfileVideoCoverObserver;
        }

        function hydrateFollowedProfileVideoCovers(container) {
            if (!container) return;
            const observer = getFollowedProfileVideoCoverObserver();
            container.querySelectorAll('.followed-pocket-video-cover[data-src]').forEach(video => {
                if (!video.dataset.coverObserved) {
                    video.dataset.coverObserved = '1';
                    observer.observe(video);
                }
            });
        }

        function renderFollowedUserProfileHome(content, fallback = {}) {
            const userInfo = getFollowedUserInfo(content);
            const base = getFollowedBaseUserInfo(userInfo);
            const sources = [base, userInfo, content].filter(Boolean);
            const displayName = getFollowedProfileDisplayName(userInfo, fallback.name || '口袋用户');
            const userId = getFollowedProfileUserId(userInfo, fallback.userId || '');
            const avatarUrl = getFollowedUserAvatarUrl(userInfo) || fallback.avatar || './icon.png';
            const signature = getFirstFollowedProfileValue(sources, ['signature', 'sign', 'description', 'desc', 'intro']);

            const primaryMetaHtml = [
                renderFollowedProfileMeta('ID', userId),
                renderFollowedProfileMeta('等级', getFirstFollowedProfileValue(sources, ['level', 'lv', 'userLevel'])),
                renderFollowedProfileMeta('经验', getFirstFollowedProfileValue(sources, ['exp', 'experience', 'expValue'])),
                renderFollowedProfileMeta('身份', getFirstFollowedProfileValue(sources, ['roleName', 'role', 'userRoleName'])),
                renderFollowedProfileMeta('粉丝', getFirstFollowedProfileValue(sources, ['fansNum', 'fansCount', 'fanNum'])),
                renderFollowedProfileMeta('关注', getFirstFollowedProfileValue(sources, ['followNum', 'followCount', 'followingNum']))
            ].join('');
            const extraMetaHtml = renderFollowedProfileMetaGroup(sources, [
                { label: '性别', paths: ['gender', 'sex'] },
                { label: '生日', paths: ['birthday', 'birthDay'] },
                { label: '地区', paths: ['city', 'province', 'area', 'location', 'address'] },
                { label: '角色ID', paths: ['roleId', 'userRole'] },
                { label: '认证', paths: ['verifyInfo', 'certification', 'authInfo'] },
                { label: '徽章', paths: ['badgeName', 'medalName', 'badgeList', 'medals', 'specialBadge'] },
                { label: '获赞', paths: ['likeNum', 'likedNum', 'praiseNum'] },
                { label: '动态', paths: ['postNum', 'postsNum', 'dynamicNum'] },
                { label: '房间', paths: ['serverName', 'chatServerInfo.serverName'] },
                { label: '注册时间', paths: ['ctime', 'createTime', 'registerTime'] }
            ]);

            return `
                <div class="followed-user-profile-head">
                    <img class="followed-user-profile-avatar" src="${escapeFollowedHtml(avatarUrl)}" alt="" onerror="this.src='./icon.png'">
                    <div class="followed-user-profile-title">
                        <div class="followed-user-profile-name">${escapeFollowedHtml(displayName)}</div>
                        ${userId ? `<div class="followed-user-profile-id">ID: ${escapeFollowedHtml(userId)}</div>` : ''}
                    </div>
                </div>
                ${signature ? `<div class="followed-user-profile-sign">${escapeFollowedHtml(signature)}</div>` : ''}
                ${primaryMetaHtml ? `<div class="followed-user-profile-meta">${primaryMetaHtml}</div>` : ''}
                ${extraMetaHtml ? `
                    <div class="followed-user-profile-section">
                        <div class="followed-user-profile-section-title">更多资料</div>
                        <div class="followed-user-profile-meta">${extraMetaHtml}</div>
                    </div>` : ''}`;
        }

        function renderFollowedStarProfileSection(starContent) {
            const info = getFollowedStarInfo(starContent);
            const name = info.starName || info.nickname || info.ownerName || '';
            if (!name) return '';

            const photos = [info.fullPhoto1, info.fullPhoto2, info.fullPhoto3, info.fullPhoto4]
                .filter(Boolean)
                .map(url => normalizeFollowedSourceUrl(url));

            const metaHtml = [
                renderFollowedProfileMeta('所属队伍', info.starTeamName || info.teamName || info.team),
                renderFollowedProfileMeta('生日', info.birthday),
                renderFollowedProfileMeta('出生地', info.birthplace),
                renderFollowedProfileMeta('身高', info.height ? `${info.height} cm` : ''),
                renderFollowedProfileMeta('血型', info.bloodType),
                renderFollowedProfileMeta('星座', info.constellation),
                renderFollowedProfileMeta('加入期数', info.periodName),
                renderFollowedProfileMeta('入团时间', info.joinTime)
            ].join('');

            const photosHtml = photos.length
                ? `<div class="followed-user-profile-photos">
                    ${photos.map(url => `<img src="${escapeFollowedHtml(url)}" alt="" onclick="openImageModal(${toFollowedInlineArg(url)})" onerror="this.style.display='none'">`).join('')}
                </div>`
                : '';

            return `
                <div class="followed-user-profile-section">
                    <div class="followed-user-profile-section-title">成员主页</div>
                    <div class="followed-user-profile-star-name">${escapeFollowedHtml(name)}</div>
                    ${metaHtml ? `<div class="followed-user-profile-meta">${metaHtml}</div>` : ''}
                    ${info.hobbies ? `<div class="followed-user-profile-sign">爱好：${escapeFollowedHtml(info.hobbies)}</div>` : ''}
                    ${info.specialty ? `<div class="followed-user-profile-sign">特长：${escapeFollowedHtml(info.specialty)}</div>` : ''}
                    ${photosHtml}
                </div>`;
        }

        function getFollowedProfileImageUrl(sources, paths) {
            const raw = getFirstFollowedProfileValue(sources, paths);
            return normalizeFollowedSourceUrl(raw);
        }

        function collectFollowedStarPhotos(starContent) {
            const info = getFollowedStarInfo(starContent);
            return [
                info.fullPhoto1,
                info.fullPhoto2,
                info.fullPhoto3,
                info.fullPhoto4,
                info.avatar,
                info.userAvatar
            ].filter(Boolean).map(url => normalizeFollowedSourceUrl(url)).filter(Boolean);
        }

        function renderFollowedPocketProfileTab(name, label, active = false) {
            return `<button type="button" class="followed-pocket-profile-tab ${active ? 'is-active' : ''}" data-tab="${escapeFollowedHtml(name)}" onclick="switchFollowedUserProfileTab(${toFollowedInlineArg(name)})">${escapeFollowedHtml(label)}</button>`;
        }

        function renderFollowedPocketProfileEmpty(text) {
            return `<div class="followed-pocket-profile-empty">${escapeFollowedHtml(text)}</div>`;
        }

        function renderFollowedDynamicPlainText(value) {
            return escapeFollowedHtml(value || '').replace(
                /(^|[\s([（【「『，。！？、；：])(@[^\s@，。！？、；：,.!?()[\]（）【】「」『』]+)/g,
                (match, prefix, mention) => {
                    let name = mention;
                    let rest = '';
                    const asciiMatch = mention.match(/^@[A-Za-z0-9_.-]+/);
                    if (asciiMatch) {
                        name = asciiMatch[0];
                        rest = mention.slice(name.length);
                    } else {
                        const splitIndex = ['生日快乐', '新年快乐', '元旦快乐', '节日快乐'].reduce((nearest, word) => {
                            const index = mention.indexOf(word);
                            return index > 1 && (nearest < 0 || index < nearest) ? index : nearest;
                        }, -1);
                        if (splitIndex > 1) {
                            name = mention.slice(0, splitIndex);
                            rest = mention.slice(splitIndex);
                        }
                    }
                    return `${prefix}<span class="followed-pocket-dynamic-mention">${name}</span>${rest}`;
                }
            );
        }

        function renderFollowedDynamicCommentText(value) {
            const escaped = renderFollowedDynamicPlainText(value);
            return typeof replaceTencentEmoji === 'function' ? replaceTencentEmoji(escaped) : escaped;
        }

        function getFollowedDynamicMentionUserId(href) {
            const raw = String(href || '').trim();
            const match = raw.match(/^snh48:\/\/(\d+)/i);
            return match ? match[1] : '';
        }

        function isFollowedDynamicPostLikeObject(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
            return [
                'postId',
                'userId',
                'ownerId',
                'memberId',
                'avatar',
                'nickname',
                'ctime',
                'createTime',
                'postTime',
                'imgList',
                'imageList',
                'commentNum',
                'likeNum'
            ].some(key => Object.prototype.hasOwnProperty.call(value, key));
        }

        function extractFollowedDynamicTextCandidate(value, visited = new WeakSet(), depth = 0) {
            if (value == null || depth > 6) return '';
            if (typeof value === 'string') {
                const raw = value.trim();
                if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
                    try {
                        return extractFollowedDynamicTextCandidate(JSON.parse(raw), visited, depth + 1);
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/followed-chat-feature.js'); }
                }
                return raw;
            }
            if (typeof value !== 'object') return '';
            if (visited.has(value)) return '';
            visited.add(value);

            if (Array.isArray(value)) {
                if (value.some(isFollowedDynamicPostLikeObject)) return '';
                return value
                    .map(item => extractFollowedDynamicTextCandidate(item, visited, depth + 1))
                    .filter(Boolean)
                    .join('');
            }

            const keys = ['text', 'content', 'postContent', 'value', 'label', 'title', 'desc', 'msg', 'message', 'subject'];
            for (const key of keys) {
                if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
                const text = extractFollowedDynamicTextCandidate(value[key], visited, depth + 1);
                if (text) return text;
            }
            return '';
        }

        function getFollowedDynamicText(value) {
            const candidates = [
                value?.postContent,
                value?.text,
                value?.msg,
                value?.message,
                value?.desc,
                value?.subject,
                value?.title,
                value?.content
            ];
            for (const candidate of candidates) {
                const text = extractFollowedDynamicTextCandidate(candidate);
                if (text) return text;
            }
            return '';
        }

        function renderFollowedDynamicContent(value) {
            const raw = extractFollowedDynamicTextCandidate(value);
            if (!raw) return '';
            if (!/[<>&]/.test(raw)) return renderFollowedDynamicPlainText(raw);

            const wrapper = document.createElement('div');
            wrapper.innerHTML = raw.replace(/<br\s*\/?>/gi, '\n');
            const parts = [];

            const walk = node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.nodeValue || '';
                    if (!text.trim() && !text.includes('\n')) return;
                    parts.push(renderFollowedDynamicPlainText(text));
                    return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) return;

                const element = node;
                const href = element.getAttribute('href') || '';
                const label = (element.textContent || '').trim();
                if (element.tagName === 'A' && href.startsWith('snh48://') && label) {
                    const mentionUserId = getFollowedDynamicMentionUserId(href);
                    parts.push(mentionUserId
                        ? `<button type="button" class="followed-pocket-dynamic-mention followed-pocket-dynamic-mention-btn" onclick="openFollowedUserProfile(${toFollowedInlineArg(mentionUserId)}, ${toFollowedInlineArg(label)}, '', false)">${escapeFollowedHtml(label)}</button>`
                        : `<span class="followed-pocket-dynamic-mention">${escapeFollowedHtml(label)}</span>`);
                    return;
                }
                element.childNodes.forEach(walk);
            };

            wrapper.childNodes.forEach(walk);
            return parts.join('')
                .replace(/(<\/(?:button|span)>)\s*\n+/g, '$1')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        function isFollowedImageLikeValue(value) {
            const raw = String(value || '').trim();
            if (!raw || raw.length > 600) return false;
            return /\.(?:png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(raw)
                || /(?:^|\/)(?:avatar|backstage|card|cards|honor|image|images|img|media|pageantry|pic|picture|poster|resource)\//i.test(raw)
                || /(?:source\d*\.48\.cn|source\.48\.cn)/i.test(raw);
        }

        function getFollowedImageCandidateScore(key, value) {
            if (!isFollowedImageLikeValue(value)) return 0;
            const normalizedKey = String(key || '').toLowerCase();
            let score = 1;
            if (/(card|honor|front|main|large|big|show|prop|resource|reward|skin)/.test(normalizedKey)) score += 5;
            if (/(img|image|pic|picture|photo|poster|cover|url|path)/.test(normalizedKey)) score += 3;
            if (/(avatar|icon|badge|logo|bg|background|thumb|small|frame)/.test(normalizedKey)) score -= 2;
            if (/\.(?:png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(String(value))) score += 2;
            return score;
        }

        function collectFollowedImageCandidates(value, candidates = [], visited = new WeakSet(), depth = 0, keyPath = '') {
            if (!value || depth > 5 || candidates.length >= 40) return candidates;
            if (typeof value === 'string') {
                const score = getFollowedImageCandidateScore(keyPath, value);
                if (score > 0) candidates.push({ value, score });
                return candidates;
            }
            if (Array.isArray(value)) {
                value.forEach((item, index) => collectFollowedImageCandidates(item, candidates, visited, depth + 1, `${keyPath}.${index}`));
                return candidates;
            }
            if (typeof value !== 'object') return candidates;
            if (visited.has(value)) return candidates;
            visited.add(value);

            Object.entries(value).forEach(([key, child]) => {
                const nextKeyPath = keyPath ? `${keyPath}.${key}` : key;
                if (typeof child === 'string') {
                    const score = getFollowedImageCandidateScore(nextKeyPath, child);
                    if (score > 0) candidates.push({ value: child, score });
                    return;
                }
                if (child && typeof child === 'object') {
                    collectFollowedImageCandidates(child, candidates, visited, depth + 1, nextKeyPath);
                }
            });
            return candidates;
        }

        function getBestFollowedHonorImage(value, imageKeys) {
            for (const key of imageKeys) {
                const direct = value?.[key];
                if (typeof direct === 'string' && isFollowedImageLikeValue(direct)) {
                    return normalizeFollowedPocketMediaUrl(direct);
                }
                if (direct && typeof direct === 'object') {
                    const nested = getBestFollowedHonorImage(direct, imageKeys);
                    if (nested) return nested;
                }
            }

            const candidates = collectFollowedImageCandidates(value)
                .sort((a, b) => b.score - a.score);
            return normalizeFollowedPocketMediaUrl(candidates[0]?.value || '');
        }

        function flattenFollowedHonorItems(value, items = [], seen = new Set(), visited = new WeakSet(), depth = 0) {
            if (!value || items.length >= 24 || depth > 8) return items;
            if (Array.isArray(value)) {
                value.forEach(item => flattenFollowedHonorItems(item, items, seen, visited, depth + 1));
                return items;
            }
            if (typeof value !== 'object') return items;
            if (visited.has(value)) return items;
            visited.add(value);

            const imageKeys = [
                'cardImg',
                'cardImage',
                'cardImageUrl',
                'cardImgUrl',
                'cardPath',
                'cardPhoto',
                'cardPic',
                'cardPicture',
                'cardPoster',
                'cardUrl',
                'cardView',
                'cover',
                'coverPath',
                'coverUrl',
                'filePath',
                'fileUrl',
                'front',
                'frontImg',
                'frontImage',
                'frontImageUrl',
                'frontPath',
                'frontPic',
                'frontPicture',
                'frontUrl',
                'honorCardUrl',
                'honorCardImg',
                'honorCardImage',
                'honorCardImageUrl',
                'image',
                'imagePath',
                'imageUrl',
                'img',
                'imgPath',
                'imgUrl',
                'largeImg',
                'largeImage',
                'largePic',
                'largeUrl',
                'mainImg',
                'mainImage',
                'mainPic',
                'mainUrl',
                'path',
                'photo',
                'photoPath',
                'photoUrl',
                'pic',
                'picImg',
                'picPath',
                'picUrl',
                'picture',
                'picturePath',
                'pictureUrl',
                'poster',
                'posterPath',
                'posterUrl',
                'propImg',
                'propImage',
                'propPic',
                'resourceImg',
                'resourceImage',
                'resourcePath',
                'resourceUrl',
                'showImg',
                'showImage',
                'showPic',
                'showUrl',
                'skinImg',
                'skinImage',
                'skinPic',
                'url'
            ];
            const imageUrl = getBestFollowedHonorImage(value, imageKeys);
            const cardId = value.cardId || value.honorCardId || value.propId || value.id || value.resourceId || '';
            const title = value.cardName
                || value.honorCardName
                || value.propName
                || value.name
                || value.title
                || value.starName
                || value.memberName
                || '';
            const level = value.level || value.lv || value.rare || value.rarity || value.cardLevel || value.cardLevelName || '';
            const looksLikeHonorCard = !!(
                value.cardId
                || value.honorCardId
                || value.propId
                || value.cardImgUrl
                || value.cardLevelName
                || value.starName
                || value.cardName
                || value.honorCardName
            );
            const identity = cardId || `${title}|${level}` || imageUrl;
            if (looksLikeHonorCard && identity && !seen.has(identity) && (imageUrl || title || cardId)) {
                seen.add(identity);
                items.push({
                    imageUrl,
                    title,
                    score: value.score || value.point || value.points || value.totalScore || value.sortScore || value.value || '',
                    level
                });
            }

            Object.values(value).forEach(child => {
                if (child && typeof child === 'object') flattenFollowedHonorItems(child, items, seen, visited, depth + 1);
            });
            return items;
        }

        function collectFollowedHonorCards(honorContent) {
            return flattenFollowedHonorItems(honorContent || {});
        }

        function flattenFollowedPostItems(value, type = 'image', items = [], seen = new Set(), visited = new WeakSet(), depth = 0) {
            if (!value || items.length >= 240 || depth > 8) return items;
            if (Array.isArray(value)) {
                value.forEach(item => flattenFollowedPostItems(item, type, items, seen, visited, depth + 1));
                return items;
            }
            if (typeof value !== 'object') return items;
            if (visited.has(value)) return items;
            visited.add(value);

            const imageKeys = type === 'video'
                ? ['coverPath', 'coverUrl', 'cover', 'firstFrame', 'videoCover', 'picPath', 'picUrl', 'imgUrl', 'imageUrl', 'image', 'poster']
                : ['imagePath', 'imageUrl', 'imgPath', 'imgUrl', 'picPath', 'picUrl', 'url', 'image', 'pic'];
            const videoKeys = ['videoPath', 'videoUrl', 'playUrl', 'mediaUrl', 'url', 'fileUrl', 'video'];
            const rawImage = imageKeys.map(key => value[key]).find(Boolean);
            const rawVideo = type === 'video' ? videoKeys.map(key => value[key]).find(Boolean) : '';
            const imageUrl = normalizeFollowedPocketMediaUrl(rawImage);
            const videoUrl = type === 'video' ? normalizeFollowedPocketMediaUrl(rawVideo) : '';
            const identity = videoUrl || imageUrl;
            if (identity && !seen.has(identity)) {
                seen.add(identity);
                items.push({
                    imageUrl,
                    videoUrl,
                    title: value.title || value.content || value.postTitle || value.desc || '',
                    ctime: value.ctime || value.createTime || value.postTime || value.time || '',
                    postId: value.postId || value.id || value.resourceId || ''
                });
            }

            Object.values(value).forEach(child => {
                if (child && typeof child === 'object') flattenFollowedPostItems(child, type, items, seen, visited, depth + 1);
            });
            return items;
        }

        function getFollowedPostItemKey(item) {
            return String(item?.postId || item?.videoUrl || item?.imageUrl || item?.title || item?.ctime || '');
        }

        function renderFollowedAlbumItem(item) {
            const key = getFollowedPostItemKey(item);
            const thumbUrl = getFollowedMediaThumbUrl(item.imageUrl);
            return `
                <button type="button" class="followed-pocket-media-card" data-media-key="${escapeFollowedHtml(key)}" onclick="openImageModal(${toFollowedInlineArg(item.imageUrl)})">
                    <img src="${escapeFollowedHtml(thumbUrl || item.imageUrl)}" alt="" loading="lazy" decoding="async" fetchpriority="low" onerror="this.style.display='none'">
                </button>`;
        }

        function renderFollowedVideoItem(item) {
            const key = getFollowedPostItemKey(item);
            const thumbUrl = getFollowedMediaThumbUrl(item.imageUrl);
            const coverHtml = item.imageUrl
                ? `<img src="${escapeFollowedHtml(thumbUrl || item.imageUrl)}" alt="" loading="lazy" decoding="async" fetchpriority="low" onerror="this.style.display='none'">`
                : (item.videoUrl
                    ? `<video class="followed-pocket-video-cover" data-src="${escapeFollowedHtml(item.videoUrl)}#t=0.1" muted playsinline preload="none"></video>`
                    : '<div class="followed-pocket-video-cover-empty">视频</div>');
            if (item.videoUrl) {
                return `<button type="button" class="followed-pocket-media-card followed-pocket-video-card" data-media-key="${escapeFollowedHtml(key)}" onclick="openFollowedProfileVideo(${toFollowedInlineArg(item.videoUrl)})">
                    ${coverHtml}
                    <span class="followed-pocket-video-badge">视频</span>
                    <div class="followed-pocket-video-play">▶</div>
                </button>`;
            }
            return `<div class="followed-pocket-media-card followed-pocket-video-card" data-media-key="${escapeFollowedHtml(key)}">
                ${coverHtml}
                <div class="followed-pocket-video-play">▶</div>
            </div>`;
        }

        function appendFollowedMediaItems(type, content) {
            const selector = type === 'video' ? '.followed-pocket-video-grid' : '.followed-pocket-album-grid';
            const grid = document.querySelector(`#followed-user-profile-body ${selector}`);
            if (!grid) return false;

            const renderItem = type === 'video' ? renderFollowedVideoItem : renderFollowedAlbumItem;
            const existing = new Set(Array.from(grid.querySelectorAll('[data-media-key]')).map(node => node.dataset.mediaKey || ''));
            const html = flattenFollowedPostItems(content, type)
                .filter(item => {
                    const key = getFollowedPostItemKey(item);
                    if (!key || existing.has(key)) return false;
                    existing.add(key);
                    return true;
                })
                .map(renderItem)
                .join('');
            if (!html) return false;

            grid.insertAdjacentHTML('beforeend', html);
            if (type === 'video') {
                hydrateFollowedProfileVideoCovers(grid);
            }
            return true;
        }

        function renderFollowedAlbumGrid(albumContent) {
            const images = flattenFollowedPostItems(albumContent, 'image');
            if (!images.length) return renderFollowedPocketProfileEmpty('暂无相册数据');

            return `<div class="followed-pocket-media-grid followed-pocket-album-grid">
                ${images.slice(0, 180).map(renderFollowedAlbumItem).join('')}
            </div>`;
        }

        function renderFollowedVideoGrid(videoContent) {
            const videos = flattenFollowedPostItems(videoContent, 'video');
            if (!videos.length) return renderFollowedPocketProfileEmpty('暂无视频数据');

            return `<div class="followed-pocket-media-grid followed-pocket-video-grid">
                ${videos.slice(0, 180).map(renderFollowedVideoItem).join('')}
            </div>`;
        }

        function getFollowedDynamicCount(value, keys) {
            const sources = [value, value?.postsInfo, value?.post, value?.data?.postsInfo, value?.data?.post].filter(Boolean);
            for (const source of sources) {
                for (const key of keys) {
                    const raw = source?.[key];
                    if (raw === undefined || raw === null || raw === '') continue;
                    const number = Number(raw);
                    if (Number.isFinite(number)) return number;
                }
            }
            return null;
        }

        function getFollowedDynamicTime(value) {
            const sources = [value, value?.postsInfo, value?.post, value?.data?.postsInfo, value?.data?.post].filter(Boolean);
            [value?.extInfo, value?.data?.extInfo].forEach(extInfo => {
                if (!extInfo) return;
                if (typeof extInfo === 'object') {
                    sources.push(extInfo);
                    return;
                }
                if (typeof extInfo === 'string') {
                    try {
                        const parsed = JSON.parse(extInfo.replace(/:\s*([0-9]{16,})/g, ':"$1"'));
                        if (parsed && typeof parsed === 'object') sources.push(parsed);
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'parse_followed_dynamic_time'); }
                }
            });
            const keys = ['ctime', 'createTime', 'createAt', 'postTime', 'msgTime', 'sendTime', 'publishTime', 'time', 'timestamp'];
            for (const source of sources) {
                for (const key of keys) {
                    const raw = source?.[key];
                    if (raw !== undefined && raw !== null && String(raw).trim() !== '') return raw;
                }
            }
            return '';
        }

        function flattenFollowedDynamicItems(value, items = [], seen = new Set(), visited = new WeakSet(), depth = 0) {
            if (!value || items.length >= 240 || depth > 8) return items;
            if (typeof value === 'string') {
                const raw = value.trim();
                if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
                    try {
                        return flattenFollowedDynamicItems(JSON.parse(raw), items, seen, visited, depth + 1);
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/followed-chat-feature.js'); }
                }
                return items;
            }
            if (Array.isArray(value)) {
                value.forEach(item => flattenFollowedDynamicItems(item, items, seen, visited, depth + 1));
                return items;
            }
            if (typeof value !== 'object') return items;
            if (visited.has(value)) return items;
            visited.add(value);

            const body = value.bodys || value.msgContent || value.body || {};
            if (body && typeof body === 'string') {
                try {
                    flattenFollowedDynamicItems(JSON.parse(body), items, seen, visited, depth + 1);
                } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/followed-chat-feature.js'); }
            } else if (body && typeof body === 'object') {
                flattenFollowedDynamicItems(body, items, seen, visited, depth + 1);
            }

            if (value.data?.postsInfo && typeof value.data.postsInfo === 'object') {
                flattenFollowedDynamicItems(value.data.postsInfo, items, seen, visited, depth + 1);
            }

            const text = getFollowedDynamicText(value);
            const postId = value.postId || value.id || value.resourceId || '';
            const directImages = Array.isArray(value.images)
                ? value.images.map(url => normalizeFollowedPocketMediaUrl(url)).filter(Boolean)
                : [];
            const isPostObject = !!(postId || text || isFollowedDynamicPostLikeObject(value));
            const nestedImages = isPostObject
                ? flattenFollowedPostItems(value, 'image').map(item => item.imageUrl).filter(Boolean)
                : [];
            const images = [...new Set([...directImages, ...nestedImages])];
            const key = String(postId || text || images[0] || '');
            if (key && seen.has(key)) {
                const existing = items.find(item => String(item.postId || item.text || item.images?.[0] || '') === key);
                if (existing) {
                    const nextViewCount = getFollowedDynamicCount(value, ['viewCount', 'readCount']);
                    const nextLikeCount = getFollowedDynamicCount(value, ['likeCount', 'likeNum']);
                    const nextCommentCount = getFollowedDynamicCount(value, ['commentCount', 'commentNum']);
                    const nextTime = getFollowedDynamicTime(value);
                    if (!Number.isFinite(existing.viewCount) && Number.isFinite(nextViewCount)) existing.viewCount = nextViewCount;
                    if (!Number.isFinite(existing.likeCount) && Number.isFinite(nextLikeCount)) existing.likeCount = nextLikeCount;
                    if (!Number.isFinite(existing.commentCount) && Number.isFinite(nextCommentCount)) existing.commentCount = nextCommentCount;
                    if (!existing.ctime && nextTime) existing.ctime = nextTime;
                }
            }
            if (key && !seen.has(key) && (text || images.length)) {
                seen.add(key);
                items.push({
                    text,
                    images,
                    ctime: getFollowedDynamicTime(value),
                    postId,
                    viewCount: getFollowedDynamicCount(value, ['viewCount', 'readCount']),
                    likeCount: getFollowedDynamicCount(value, ['likeCount', 'likeNum']),
                    commentCount: getFollowedDynamicCount(value, ['commentCount', 'commentNum'])
                });
            }

            Object.values(value).forEach(child => {
                if (child && typeof child === 'object') flattenFollowedDynamicItems(child, items, seen, visited, depth + 1);
            });
            return items;
        }

        function dedupeFollowedDynamicItems(items = []) {
            const deduped = [];
                const scoreItem = item => (
                    (item?.text ? 4 : 0)
                    + (item?.postId ? 3 : 0)
                    + (item?.ctime ? 1 : 0)
                    + (Number.isFinite(item?.viewCount) ? 1 : 0)
                    + (Number.isFinite(item?.likeCount) ? 1 : 0)
                    + (Number.isFinite(item?.commentCount) ? 1 : 0)
                    + Math.min(2, Array.isArray(item?.images) ? item.images.length : 0)
                );

            items.forEach(item => {
                if (!item || typeof item !== 'object') return;
                const images = [...new Set((Array.isArray(item.images) ? item.images : []).filter(Boolean))];
                const normalized = { ...item, images };
                const imageSet = new Set(images);
                const matchedIndex = deduped.findIndex(existing => {
                    const samePost = normalized.postId
                        && existing.postId
                        && String(normalized.postId) === String(existing.postId);
                    if (samePost) return true;

                    const sharesImage = imageSet.size > 0
                        && existing.images.some(url => imageSet.has(url));
                    if (!sharesImage) return false;

                    return !normalized.text
                        || !existing.text
                        || !normalized.postId
                        || !existing.postId;
                });

                if (matchedIndex < 0) {
                    deduped.push(normalized);
                    return;
                }

                const existing = deduped[matchedIndex];
                const richer = scoreItem(normalized) >= scoreItem(existing) ? normalized : existing;
                const other = richer === normalized ? existing : normalized;
                deduped[matchedIndex] = {
                    ...richer,
                    text: richer.text || other.text || '',
                    postId: richer.postId || other.postId || '',
                    ctime: richer.ctime || other.ctime || '',
                    viewCount: Number.isFinite(richer.viewCount) ? richer.viewCount : other.viewCount,
                    likeCount: Number.isFinite(richer.likeCount) ? richer.likeCount : other.likeCount,
                    commentCount: Number.isFinite(richer.commentCount) ? richer.commentCount : other.commentCount,
                    images: [...new Set([...richer.images, ...other.images])]
                };
            });

            return deduped;
        }

        function formatFollowedDynamicNumber(value) {
            const number = Number(value);
            if (!Number.isFinite(number)) return '--';
            if (number >= 10000) return `${(number / 10000).toFixed(number >= 100000 ? 0 : 1).replace(/\.0$/, '')}万`;
            return String(number);
        }

        function getFollowedDynamicStatsFromContent(content) {
            const post = content?.postsInfo || content?.post || content?.data?.postsInfo || content?.data?.post || content || {};
            return {
                viewCount: getFollowedDynamicCount(post, ['viewCount', 'readCount']),
                likeCount: getFollowedDynamicCount(post, ['likeCount', 'likeNum']),
                commentCount: getFollowedDynamicCount(post, ['commentCount', 'commentNum']),
                ctime: getFollowedDynamicTime(post)
            };
        }

        function updateFollowedProfileDynamicStats(postId, stats = {}) {
            const card = document.getElementById(`followed-profile-dynamic-card-${postId}`);
            if (!card) return;
            [
                ['viewCount', '.followed-pocket-dynamic-view-count'],
                ['likeCount', '.followed-pocket-dynamic-like-count'],
                ['commentCount', '.followed-pocket-dynamic-comment-count']
            ].forEach(([key, selector]) => {
                if (stats[key] === null || stats[key] === undefined || !Number.isFinite(Number(stats[key]))) return;
                const element = card.querySelector(selector);
                if (element) element.textContent = formatFollowedDynamicNumber(stats[key]);
            });
            if (stats.ctime) {
                const timeElement = card.querySelector('.followed-pocket-dynamic-time');
                if (timeElement) timeElement.textContent = formatFollowedProfileDateTime(stats.ctime);
            }
        }

        function loadFollowedProfileDynamicStats(postId) {
            const normalizedPostId = String(postId || '').trim();
            if (!normalizedPostId) return Promise.resolve(null);
            const cached = followedProfileDynamicStatsCache.get(normalizedPostId);
            if (cached
                && Number.isFinite(cached.viewCount)
                && Number.isFinite(cached.likeCount)
                && Number.isFinite(cached.commentCount)
                && cached.ctime) {
                return Promise.resolve(cached);
            }
            if (followedProfileDynamicStatsRequests.has(normalizedPostId)) {
                return followedProfileDynamicStatsRequests.get(normalizedPostId);
            }

            const request = (async () => {
                const token = getAppToken ? getAppToken() : '';
                if (!token) return null;
                const result = await ipcRenderer.invoke('fetch-area48-post-details', {
                    token,
                    pa: window.getPA ? window.getPA() : null,
                    postId: normalizedPostId
                });
                if (!result?.success || !result.content) return null;
                const stats = getFollowedDynamicStatsFromContent(result.content);
                const mergedStats = { ...(cached || {}) };
                Object.entries(stats).forEach(([key, value]) => {
                    if (Number.isFinite(value) || (key === 'ctime' && value)) mergedStats[key] = value;
                });
                followedProfileDynamicStatsCache.set(normalizedPostId, mergedStats);
                return mergedStats;
            })().finally(() => followedProfileDynamicStatsRequests.delete(normalizedPostId));
            followedProfileDynamicStatsRequests.set(normalizedPostId, request);
            return request;
        }

        function observeFollowedProfileDynamicStats(container) {
            if (followedProfileDynamicStatsObserver) followedProfileDynamicStatsObserver.disconnect();
            const cards = container?.querySelectorAll('.followed-pocket-dynamic-card[data-needs-stats="1"]') || [];
            if (!cards.length) return;
            const hydrate = card => {
                const postId = String(card.dataset.followedDynamicPostId || '').trim();
                if (!postId) return;
                loadFollowedProfileDynamicStats(postId)
                    .then(stats => {
                        if (stats) updateFollowedProfileDynamicStats(postId, stats);
                    })
                    .catch(error => console.warn('读取主页动态统计失败', error));
            };
            if (typeof IntersectionObserver !== 'function') {
                cards.forEach(hydrate);
                return;
            }
            followedProfileDynamicStatsObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    followedProfileDynamicStatsObserver.unobserve(entry.target);
                    hydrate(entry.target);
                });
            }, { rootMargin: '160px 0px' });
            cards.forEach(card => followedProfileDynamicStatsObserver.observe(card));
        }

        function getFollowedProfileDynamicCommentUserMap(content) {
            const map = new Map();
            const users = Array.isArray(content?.commentUserList) ? content.commentUserList : [];
            users.forEach(user => map.set(String(user.userId || ''), user));
            return map;
        }

        function renderFollowedProfileDynamicComments(postId) {
            const state = followedProfileDynamicCommentStateMap.get(String(postId));
            if (!state?.open) {
                return `<div id="followed-profile-dynamic-comments-${escapeFollowedHtml(postId)}" class="followed-pocket-dynamic-comments"></div>`;
            }
            const comments = Array.isArray(state.comments) ? state.comments : [];
            const currentUserId = typeof getCurrentUserId === 'function' ? String(getCurrentUserId() || '') : '';
            const itemsHtml = comments.map(comment => {
                const user = state.userMap.get(String(comment.userId || '')) || {};
                const userId = String(user.userId || comment.userId || '').trim();
                const name = user.nickname || user.realNickName || user.name || userId || '用户';
                const avatar = normalizeFollowedSourceUrl(user.avatar || user.headImg || user.icon || '');
                const commentId = String(comment.commentId || comment.resourceId || '').trim();
                const canDelete = commentId && currentUserId && String(comment.userId || '') === currentUserId;
                const openProfile = userId
                    ? `onclick="openFollowedUserProfile(${toFollowedInlineArg(userId)}, ${toFollowedInlineArg(name)}, ${toFollowedInlineArg(avatar)}, false)"`
                    : '';
                return `<div class="followed-pocket-dynamic-comment-item">
                    <button type="button" class="followed-pocket-dynamic-comment-avatar" ${openProfile} ${userId ? `aria-label="查看 ${escapeFollowedHtml(name)} 的用户主页"` : 'disabled'}>
                        ${avatar ? `<img src="${escapeFollowedHtml(avatar)}" alt="">` : '<span></span>'}
                    </button>
                    <div class="followed-pocket-dynamic-comment-body">
                        <div class="followed-pocket-dynamic-comment-head">
                            <button type="button" class="followed-pocket-dynamic-comment-name" ${openProfile} ${userId ? '' : 'disabled'}>${escapeFollowedHtml(name)}</button>
                            <span>${escapeFollowedHtml(formatFollowedProfileDateTime(comment.ctime))}</span>
                            ${canDelete ? `<button type="button" class="followed-pocket-dynamic-comment-delete" onclick="deleteFollowedProfileDynamicComment(${toFollowedInlineArg(postId)}, ${toFollowedInlineArg(commentId)})">删除</button>` : ''}
                        </div>
                        <div class="followed-pocket-dynamic-comment-text">${renderFollowedDynamicCommentText(comment.msg || comment.comment || '')}</div>
                    </div>
                </div>`;
            }).join('');
            return `<div id="followed-profile-dynamic-comments-${escapeFollowedHtml(postId)}" class="followed-pocket-dynamic-comments is-open">
                <div class="followed-pocket-dynamic-comment-compose">
                    <input id="followed-profile-dynamic-comment-input-${escapeFollowedHtml(postId)}" type="text" placeholder="写评论" onkeydown="if(event.key==='Enter'){event.preventDefault();sendFollowedProfileDynamicComment(${toFollowedInlineArg(postId)})}">
                    <button id="followed-profile-dynamic-comment-send-${escapeFollowedHtml(postId)}" type="button" onclick="sendFollowedProfileDynamicComment(${toFollowedInlineArg(postId)})">发送</button>
                </div>
                ${state.loading && !comments.length ? '<div class="followed-pocket-dynamic-comments-empty">正在读取评论...</div>' : ''}
                ${itemsHtml ? `<div class="followed-pocket-dynamic-comments-list">${itemsHtml}</div>` : ''}
                ${!state.loading && state.loaded && !comments.length ? '<div class="followed-pocket-dynamic-comments-empty">暂无评论</div>' : ''}
                ${state.hasMore ? `<button type="button" class="followed-pocket-dynamic-comments-more" onclick="loadMoreFollowedProfileDynamicComments(${toFollowedInlineArg(postId)})">${state.loading ? '加载中' : '查看更多评论'}</button>` : ''}
            </div>`;
        }

        function updateFollowedProfileDynamicComments(postId) {
            const panel = document.getElementById(`followed-profile-dynamic-comments-${postId}`);
            if (panel) panel.outerHTML = renderFollowedProfileDynamicComments(postId);
        }

        function setFollowedProfileDynamicCommentCount(postId, count) {
            const number = Number(count);
            if (!Number.isFinite(number)) return;
            const normalizedPostId = String(postId || '').trim();
            const cached = followedProfileDynamicStatsCache.get(normalizedPostId) || {};
            cached.commentCount = Math.max(0, number);
            followedProfileDynamicStatsCache.set(normalizedPostId, cached);
            updateFollowedProfileDynamicStats(normalizedPostId, cached);
        }

        async function loadFollowedProfileDynamicComments(postId, append = false) {
            const normalizedPostId = String(postId || '').trim();
            if (!normalizedPostId) return;
            const existing = followedProfileDynamicCommentStateMap.get(normalizedPostId) || {
                open: true,
                loaded: false,
                loading: false,
                comments: [],
                userMap: new Map(),
                next: 0,
                hasMore: false
            };
            if (existing.loading) return;
            existing.open = true;
            existing.loading = true;
            followedProfileDynamicCommentStateMap.set(normalizedPostId, existing);
            updateFollowedProfileDynamicComments(normalizedPostId);

            try {
                const token = getAppToken ? getAppToken() : '';
                const result = await ipcRenderer.invoke('fetch-area48-comments', {
                    token,
                    pa: window.getPA ? window.getPA() : null,
                    resourceId: normalizedPostId,
                    next: append ? existing.next : 0
                });
                if (!result?.success || !result.content) throw new Error(result?.msg || '获取评论失败');
                const content = result.content;
                const fetched = Array.isArray(content.commentList) ? content.commentList : [];
                const nextUserMap = getFollowedProfileDynamicCommentUserMap(content);
                existing.userMap.forEach((user, id) => nextUserMap.set(id, user));
                const merged = append ? existing.comments.concat(fetched) : fetched;
                const seen = new Set();
                existing.comments = merged.filter(comment => {
                    const key = String(comment.commentId || `${comment.userId || ''}-${comment.ctime || ''}-${comment.msg || ''}`);
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                existing.userMap = nextUserMap;
                existing.next = content.next || 0;
                existing.hasMore = Boolean(existing.next) && fetched.length > 0;
                existing.loaded = true;
                const commentCount = Number(content.commentNum);
                if (Number.isFinite(commentCount)) {
                    existing.commentCount = commentCount;
                    setFollowedProfileDynamicCommentCount(normalizedPostId, commentCount);
                }
            } catch (error) {
                if (typeof showToast === 'function') showToast(error.message || '获取评论失败');
            } finally {
                existing.loading = false;
                followedProfileDynamicCommentStateMap.set(normalizedPostId, existing);
                updateFollowedProfileDynamicComments(normalizedPostId);
            }
        }

        function toggleFollowedProfileDynamicComments(postId) {
            const normalizedPostId = String(postId || '').trim();
            if (!normalizedPostId) return;
            const state = followedProfileDynamicCommentStateMap.get(normalizedPostId);
            if (state?.open) {
                state.open = false;
                followedProfileDynamicCommentStateMap.set(normalizedPostId, state);
                updateFollowedProfileDynamicComments(normalizedPostId);
                return;
            }
            if (state?.loaded) {
                state.open = true;
                followedProfileDynamicCommentStateMap.set(normalizedPostId, state);
                updateFollowedProfileDynamicComments(normalizedPostId);
                return;
            }
            void loadFollowedProfileDynamicComments(normalizedPostId, false);
        }

        function loadMoreFollowedProfileDynamicComments(postId) {
            void loadFollowedProfileDynamicComments(postId, true);
        }

        async function sendFollowedProfileDynamicComment(postId) {
            const normalizedPostId = String(postId || '').trim();
            const input = document.getElementById(`followed-profile-dynamic-comment-input-${normalizedPostId}`);
            const button = document.getElementById(`followed-profile-dynamic-comment-send-${normalizedPostId}`);
            if (!normalizedPostId || button?.disabled) return;
            const commentMsg = String(input?.value || '').trim();
            if (!commentMsg) {
                if (typeof showToast === 'function') showToast('请输入评论内容');
                return;
            }
            const token = getAppToken ? getAppToken() : '';
            if (!token) {
                if (typeof showToast === 'function') showToast('请先登录账号');
                return;
            }
            if (button) {
                button.disabled = true;
                button.textContent = '发送中';
            }

            try {
                const result = await ipcRenderer.invoke('add-area48-comment', {
                    token,
                    pa: window.getPA ? window.getPA() : null,
                    resourceId: normalizedPostId,
                    commentMsg
                });
                if (!result?.success || !result.content) throw new Error(result?.msg || '发送评论失败');
                const content = result.content;
                const state = followedProfileDynamicCommentStateMap.get(normalizedPostId) || {
                    open: true,
                    loaded: true,
                    loading: false,
                    comments: [],
                    userMap: new Map(),
                    next: 0,
                    hasMore: false
                };
                if (content.commentUser?.userId) {
                    state.userMap.set(String(content.commentUser.userId), content.commentUser);
                }
                if (content.comment) {
                    const newComment = content.comment;
                    const newKey = String(newComment.commentId || `${newComment.userId || ''}-${newComment.ctime || ''}-${newComment.msg || ''}`);
                    state.comments = [
                        newComment,
                        ...state.comments.filter(comment => String(comment.commentId || `${comment.userId || ''}-${comment.ctime || ''}-${comment.msg || ''}`) !== newKey)
                    ];
                    state.open = true;
                    state.loaded = true;
                    const cachedCount = followedProfileDynamicStatsCache.get(normalizedPostId)?.commentCount;
                    const currentCount = Number.isFinite(Number(state.commentCount))
                        ? Number(state.commentCount)
                        : (Number.isFinite(Number(cachedCount)) ? Number(cachedCount) : state.comments.length - 1);
                    state.commentCount = currentCount + 1;
                    followedProfileDynamicCommentStateMap.set(normalizedPostId, state);
                    setFollowedProfileDynamicCommentCount(normalizedPostId, state.commentCount);
                    updateFollowedProfileDynamicComments(normalizedPostId);
                } else {
                    state.loading = false;
                    followedProfileDynamicCommentStateMap.set(normalizedPostId, state);
                    await loadFollowedProfileDynamicComments(normalizedPostId, false);
                }
                if (typeof showToast === 'function') showToast('评论已发送');
            } catch (error) {
                if (typeof showToast === 'function') showToast(error.message || '发送评论失败');
            } finally {
                const nextButton = document.getElementById(`followed-profile-dynamic-comment-send-${normalizedPostId}`);
                if (nextButton) {
                    nextButton.disabled = false;
                    nextButton.textContent = '发送';
                }
            }
        }

        function deleteFollowedProfileDynamicComment(postId, commentId) {
            const normalizedPostId = String(postId || '').trim();
            const normalizedCommentId = String(commentId || '').trim();
            if (!normalizedPostId || !normalizedCommentId) return;

            const performDelete = async () => {
                const token = getAppToken ? getAppToken() : '';
                if (!token) {
                    if (typeof showToast === 'function') showToast('请先登录账号');
                    return;
                }
                try {
                    const result = await ipcRenderer.invoke('delete-area48-comment', {
                        token,
                        pa: window.getPA ? window.getPA() : null,
                        resourceId: normalizedCommentId
                    });
                    if (!result?.success) throw new Error(result?.msg || '删除评论失败');
                    const state = followedProfileDynamicCommentStateMap.get(normalizedPostId);
                    if (state) {
                        state.comments = state.comments.filter(comment => String(comment.commentId || comment.resourceId || '') !== normalizedCommentId);
                        const cachedCount = followedProfileDynamicStatsCache.get(normalizedPostId)?.commentCount;
                        const currentCount = Number.isFinite(Number(state.commentCount))
                            ? Number(state.commentCount)
                            : (Number.isFinite(Number(cachedCount)) ? Number(cachedCount) : state.comments.length + 1);
                        state.commentCount = Math.max(0, currentCount - 1);
                        followedProfileDynamicCommentStateMap.set(normalizedPostId, state);
                        setFollowedProfileDynamicCommentCount(normalizedPostId, state.commentCount);
                        updateFollowedProfileDynamicComments(normalizedPostId);
                    }
                    if (typeof showToast === 'function') showToast('评论已删除');
                } catch (error) {
                    if (typeof showToast === 'function') showToast(error.message || '删除评论失败');
                }
            };

            if (typeof showConfirm === 'function') {
                showConfirm('确定要删除这条评论吗？', () => { void performDelete(); });
            } else if (window.confirm('确定要删除这条评论吗？')) {
                void performDelete();
            }
        }

        function renderFollowedDynamicList(dynamicContent) {
            const posts = dedupeFollowedDynamicItems(flattenFollowedDynamicItems(dynamicContent));
            if (!posts.length) return renderFollowedPocketProfileEmpty('暂无动态数据');

            return `<div class="followed-pocket-dynamic-list">
                ${posts.slice(0, 120).map(item => {
                    const cached = followedProfileDynamicStatsCache.get(String(item.postId || '')) || {};
                    const viewCount = Number.isFinite(item.viewCount) ? item.viewCount : cached.viewCount;
                    const likeCount = Number.isFinite(item.likeCount) ? item.likeCount : cached.likeCount;
                    const commentCount = Number.isFinite(item.commentCount) ? item.commentCount : cached.commentCount;
                    const ctime = item.ctime || cached.ctime || '';
                    const needsStats = item.postId && (!Number.isFinite(viewCount) || !Number.isFinite(likeCount) || !Number.isFinite(commentCount) || !ctime);
                    if (item.postId && !needsStats) {
                        followedProfileDynamicStatsCache.set(String(item.postId), { viewCount, likeCount, commentCount, ctime });
                    }
                    return `
                    <div class="followed-pocket-dynamic-card" ${item.postId ? `id="followed-profile-dynamic-card-${escapeFollowedHtml(item.postId)}" data-followed-dynamic-post-id="${escapeFollowedHtml(item.postId)}" ${needsStats ? 'data-needs-stats="1"' : ''}` : ''}>
                        ${(item.postId || ctime) ? `<div class="followed-pocket-dynamic-time">${ctime ? escapeFollowedHtml(formatFollowedProfileDateTime(ctime)) : '--'}</div>` : ''}
                        ${item.text ? `<div class="followed-pocket-dynamic-text">${renderFollowedDynamicContent(item.text)}</div>` : ''}
                        ${item.images.length ? `<div class="followed-pocket-dynamic-images">
                            ${item.images.slice(0, 6).map(url => `
                                <button type="button" class="followed-pocket-dynamic-image" onclick="openImageModal(${toFollowedInlineArg(url)})">
                                    <img src="${escapeFollowedHtml(url)}" alt="" loading="lazy" onerror="this.style.display='none'">
                                </button>`).join('')}
                        </div>` : ''}
                        ${item.postId ? `<div class="followed-pocket-dynamic-stats">
                            <span>浏览 <span class="followed-pocket-dynamic-view-count">${formatFollowedDynamicNumber(viewCount)}</span></span>
                            <span>点赞 <span class="followed-pocket-dynamic-like-count">${formatFollowedDynamicNumber(likeCount)}</span></span>
                            <button type="button" onclick="toggleFollowedProfileDynamicComments(${toFollowedInlineArg(item.postId)})">评论 <span class="followed-pocket-dynamic-comment-count">${formatFollowedDynamicNumber(commentCount)}</span></button>
                        </div>
                        ${renderFollowedProfileDynamicComments(item.postId)}` : ''}
                    </div>`;
                }).join('')}
            </div>`;
        }

        function getFollowedProfileNextCursor(content = {}) {
            const candidates = [
                content.next,
                content.nextId,
                content.nextTime,
                content.lastTime,
                content.cursor,
                content.pageCursor
            ];
            const value = candidates.find(item => item !== undefined && item !== null && String(item).trim() !== '');
            return String(value || '0');
        }

        function mergeFollowedDynamicContent(previousContent = {}, nextContent = {}, sourceKey = 'timeline') {
            const previousSource = previousContent?.[sourceKey] || previousContent || {};
            const mergedItems = [];
            const seen = new Set();
            dedupeFollowedDynamicItems([
                ...flattenFollowedDynamicItems(previousSource),
                ...flattenFollowedDynamicItems(nextContent)
            ]).forEach(item => {
                const key = String(item.postId || item.text || item.images?.[0] || item.ctime || '');
                if (!key || seen.has(key)) return;
                seen.add(key);
                mergedItems.push(item);
            });

            return {
                ...previousContent,
                [sourceKey]: {
                    list: mergedItems,
                    next: getFollowedProfileNextCursor(nextContent)
                }
            };
        }

        function mergeFollowedPostContent(previousContent = {}, nextContent = {}, type = 'image') {
            const mergedItems = [];
            const seen = new Set();
            [...flattenFollowedPostItems(previousContent, type), ...flattenFollowedPostItems(nextContent, type)].forEach(item => {
                const key = String(item.postId || item.videoUrl || item.imageUrl || item.title || item.ctime || '');
                if (!key || seen.has(key)) return;
                seen.add(key);
                mergedItems.push(item);
            });

            return {
                list: mergedItems,
                next: getFollowedProfileNextCursor(nextContent)
            };
        }

        function formatFollowedProfileDateTime(value) {
            const raw = String(value == null ? '' : value).trim();
            if (!raw) return '';
            if (/^\d{10,13}$/.test(raw)) {
                const timestamp = raw.length === 10 ? Number(raw) * 1000 : Number(raw);
                const date = new Date(timestamp);
                if (!Number.isNaN(date.getTime())) {
                    const pad = number => String(number).padStart(2, '0');
                    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
                }
            }
            return raw;
        }

        function flattenFollowedLiveItems(value, items = [], seen = new Set(), visited = new WeakSet(), depth = 0) {
            if (!value || items.length >= 160 || depth > 8) return items;
            if (Array.isArray(value)) {
                value.forEach(item => flattenFollowedLiveItems(item, items, seen, visited, depth + 1));
                return items;
            }
            if (typeof value !== 'object') return items;
            if (visited.has(value)) return items;
            visited.add(value);

            const liveId = value.liveId || value.id || value.resourceId || '';
            const title = value.title || value.liveTitle || value.name || value.desc || value.announcement || '';
            const coverUrl = normalizeFollowedSourceUrl(value.coverPath || value.coverUrl || value.liveCover || value.picPath || value.imageUrl || '');
            const liveTime = formatFollowedProfileDateTime(value.ctime || value.createTime || value.liveTime || value.startTime || value.serverTime || '');
            const key = String(liveId || title || coverUrl || '');
            if (key && !seen.has(key) && (liveId || title || coverUrl)) {
                seen.add(key);
                items.push({
                    liveId,
                    title: /^\d{10,}$/.test(String(title || '').trim()) ? '直播' : (title || '直播'),
                    coverUrl,
                    ctime: liveTime,
                    onlineNum: value.onlineNum || value.hot || value.viewer || ''
                });
            }

            Object.values(value).forEach(child => {
                if (child && typeof child === 'object') flattenFollowedLiveItems(child, items, seen, visited, depth + 1);
            });
            return items;
        }

        function getFollowedLiveNextCursor(content = {}) {
            return getFollowedProfileNextCursor(content);
        }

        function mergeFollowedLiveContent(previousContent = {}, nextContent = {}) {
            const mergedItems = [];
            const seen = new Set();
            [...flattenFollowedLiveItems(previousContent), ...flattenFollowedLiveItems(nextContent)].forEach(item => {
                const key = String(item.liveId || item.title || item.coverUrl || item.ctime || '');
                if (!key || seen.has(key)) return;
                seen.add(key);
                mergedItems.push(item);
            });

            return {
                liveList: mergedItems,
                next: getFollowedLiveNextCursor(nextContent)
            };
        }

        function renderFollowedLiveList(liveContent) {
            const lives = flattenFollowedLiveItems(liveContent);
            if (!lives.length) return renderFollowedPocketProfileEmpty('暂无直播数据');

            return `<div class="followed-member-live-list">
                ${lives.slice(0, 120).map(item => `
                    <button type="button" class="followed-member-live-card" ${item.liveId ? `onclick="playSharedLiveFromMessage(${toFollowedInlineArg(item.liveId)}, ${toFollowedInlineArg(item.title)}, ${toFollowedInlineArg(item.ctime)}, ${toFollowedInlineArg(item.title)})"` : ''}>
                        <div class="followed-member-live-cover">
                            ${item.coverUrl ? `<img src="${escapeFollowedHtml(item.coverUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
                            <span>直播</span>
                        </div>
                        <div class="followed-member-live-info">
                            <strong>${escapeFollowedHtml(item.title)}</strong>
                            ${item.ctime ? `<span>${escapeFollowedHtml(item.ctime)}</span>` : ''}
                        </div>
                    </button>`).join('')}
            </div>`;
        }

        function getFollowedStarInfo(starContent) {
            return starContent?.content?.starInfo
                || starContent?.starInfo
                || starContent?.content?.memberInfo
                || starContent?.memberInfo
                || starContent
                || {};
        }

        function isFollowedMemberProfile(starContent, fallback = {}) {
            const info = getFollowedStarInfo(starContent);
            return !!(
                fallback.isMember
                || info.isStar
                || info.star
                || info.starName
                || info.realNickName
                || info.ownerName
                || info.starTeamName
                || info.teamName
                || info.periodName
            );
        }

        function renderFollowedMemberIntro(starContent) {
            const info = getFollowedStarInfo(starContent);
            const history = Array.isArray(starContent?.content?.history)
                ? starContent.content.history
                : (Array.isArray(starContent?.history) ? starContent.history : []);
            const metaHtml = renderFollowedProfileMetaGroup([info], [
                { label: '昵称', paths: ['nickname'] },
                { label: '所属分团', paths: ['starGroupName', 'groupName'] },
                { label: '所属队伍', paths: ['starTeamName', 'teamName', 'team'] },
                { label: '加入期数', paths: ['periodName'] },
                { label: '入团时间', paths: ['joinTime'] },
                { label: '生日', paths: ['birthday'] },
                { label: '出生地', paths: ['birthplace'] },
                { label: '身高', paths: ['height'] },
                { label: '血型', paths: ['bloodType'] },
                { label: '星座', paths: ['constellation'] },
                { label: '星区', paths: ['starRegion'] },
                { label: '微博', paths: ['wbName'] }
            ]);
            const hobbies = String(info.hobbies || '').trim();
            const specialty = String(info.specialty || '').trim();
            const historyHtml = history
                .map(item => {
                    const time = String(item?.ctime || '').trim();
                    const text = String(item?.content || '').trim();
                    if (!time && !text) return '';
                    return `<div class="followed-member-history-item">
                        ${time ? `<span>${escapeFollowedHtml(time)}</span>` : ''}
                        ${text ? `<strong>${escapeFollowedHtml(text)}</strong>` : ''}
                    </div>`;
                })
                .filter(Boolean)
                .join('');

            if (!metaHtml && !hobbies && !specialty && !historyHtml) {
                return renderFollowedPocketProfileEmpty('暂无简介');
            }

            return `<div class="followed-member-intro">
                ${metaHtml ? `<div class="followed-user-profile-meta">${metaHtml}</div>` : ''}
                ${hobbies ? `<div class="followed-member-intro-line"><b>爱好</b><span>${escapeFollowedHtml(hobbies)}</span></div>` : ''}
                ${specialty ? `<div class="followed-member-intro-line"><b>特长</b><span>${escapeFollowedHtml(specialty)}</span></div>` : ''}
                ${historyHtml ? `<div class="followed-member-history">${historyHtml}</div>` : ''}
            </div>`;
        }

        function renderFollowedMemberProfile(content, starContent = {}, dynamicContent = {}, albumContent = {}, videoContent = {}, liveContent = {}, fallback = {}) {
            const userInfo = getFollowedUserInfo(content);
            const base = getFollowedBaseUserInfo(userInfo);
            const info = getFollowedStarInfo(starContent);
            const sources = [base, userInfo, content, info].filter(Boolean);
            const displayName = getFollowedProfileDisplayName(userInfo, '')
                || base.realNickName
                || base.nickname
                || info.realNickName
                || info.nickname
                || info.starName
                || info.ownerName
                || fallback.name
                || '成员';
            const teamName = info.starTeamName || info.teamName || info.team || getFirstFollowedProfileValue(sources, ['teamName', 'starTeamName', 'team']);
            const fansNum = getFirstFollowedProfileValue(sources, ['followers', 'fansNum', 'fansCount', 'fanNum']);
            const avatarUrl = getFollowedUserAvatarUrl(userInfo)
                || normalizeFollowedSourceUrl(info.starAvatar || info.avatar || info.userAvatar || info.fullPhoto1 || '')
                || fallback.avatar
                || './icon.png';
            const teamLogoUrl = normalizeFollowedSourceUrl(info.starTeamLogo || info.seineTeamLogo || base.teamLogo || base.seineTeamLogo || info.teamLogo || '');
            const coverUrl = normalizeFollowedSourceUrl(base.bgImg || base.bgImgUrl || '')
                || getFollowedProfileImageUrl([userInfo, content, info].filter(Boolean), [
                'bgImg',
                'bgImgUrl',
                'backgroundImg',
                'backgroundImgUrl',
                'backImg',
                'backImgUrl',
                'homeBgImg',
                'homeBgImgUrl',
                'bannerUrl'
            ])
                || './icon.png';
            const dynamicHtml = renderFollowedDynamicList(dynamicContent);
            const albumHtml = renderFollowedAlbumGrid(albumContent);
            const videoHtml = renderFollowedVideoGrid(videoContent);
            const liveHtml = renderFollowedLiveList(liveContent);
            const introHtml = renderFollowedMemberIntro(starContent);
            const userId = getFollowedProfileUserId(userInfo, fallback.userId || info.memberId || info.userId || info.starId || '');
            const followText = normalizeFollowedRelationText(sources);

            return `
                <div class="followed-member-profile">
                    <div class="followed-member-scroll">
                        <div class="followed-member-hero" style="${coverUrl ? `--followed-member-cover: url('${escapeFollowedHtml(coverUrl)}');` : ''}">
                            ${renderFollowedUserProfileBackButton()}
                            <div class="followed-member-hero-main">
                                <img class="followed-member-avatar" src="${escapeFollowedHtml(avatarUrl)}" alt="" onerror="this.src='./icon.png'">
                                <div class="followed-member-title">
                                    <div class="followed-member-name-row">
                                        <span class="followed-member-name">${escapeFollowedHtml(displayName)}</span>
                                        ${teamLogoUrl
                                            ? `<img class="followed-member-team-logo" src="${escapeFollowedHtml(teamLogoUrl)}" alt="${escapeFollowedHtml(teamName || '')}" onerror="this.style.display='none'">`
                                            : (teamName ? `<span class="followed-member-team">${escapeFollowedHtml(teamName)}</span>` : '')}
                                    </div>
                                    <div class="followed-member-fans">粉丝 ${escapeFollowedHtml(fansNum || '-')}</div>
                                </div>
                            </div>
                        </div>
                        <div class="followed-member-tabs">
                            ${renderFollowedPocketProfileTab('dynamic', '动态', true)}
                            ${renderFollowedPocketProfileTab('album', '美图')}
                            ${renderFollowedPocketProfileTab('video', '视频')}
                            ${renderFollowedPocketProfileTab('live', '直播')}
                            ${renderFollowedPocketProfileTab('intro', '简介')}
                        </div>
                        <div class="followed-member-tab-panels">
                            <div class="followed-pocket-tab-panel is-active" data-panel="dynamic">${dynamicHtml}</div>
                            <div class="followed-pocket-tab-panel" data-panel="album">${albumHtml}</div>
                            <div class="followed-pocket-tab-panel" data-panel="video">${videoHtml}</div>
                            <div class="followed-pocket-tab-panel" data-panel="live">${liveHtml}</div>
                            <div class="followed-pocket-tab-panel" data-panel="intro">${introHtml}</div>
                        </div>
                    </div>
                    <div class="followed-member-actions">
                        <button type="button" class="followed-member-action" data-action="follow" onclick="toggleFollowedProfileFollow(${toFollowedInlineArg(userId)}, ${toFollowedInlineArg(displayName)}, this)">${escapeFollowedHtml(followText)}</button>
                        <button type="button" class="followed-member-action" onclick="openFollowedProfilePrivateMessage(${toFollowedInlineArg(userId)}, ${toFollowedInlineArg(displayName)}, ${toFollowedInlineArg(avatarUrl)})">翻牌</button>
                        <button type="button" class="followed-member-action" onclick="openFollowedProfileRoom(${toFollowedInlineArg(userId)}, ${toFollowedInlineArg(displayName)})">聚聚</button>
                    </div>
                </div>`;
        }

        function renderFollowedHonorCards(honorCards, fallbackPhotos) {
            if (honorCards.length) {
                return `<div class="followed-pocket-honor-stage">
                    <div class="followed-pocket-honor-grid">
                        ${honorCards.slice(0, 12).map(card => `
                            <button type="button" class="followed-pocket-honor-card" ${card.imageUrl ? `onclick="openImageModal(${toFollowedInlineArg(card.imageUrl)})"` : ''}>
                                ${card.imageUrl
                                    ? `<img src="${escapeFollowedHtml(card.imageUrl)}" alt="" onerror="this.style.display='none'">`
                                    : `<span class="followed-pocket-honor-card-placeholder">${escapeFollowedHtml(card.title || '荣耀卡')}</span>`}
                                ${(card.title || card.score || card.level) ? `
                                    <span class="followed-pocket-honor-card-meta">
                                        ${card.title ? `<b>${escapeFollowedHtml(card.title)}</b>` : ''}
                                        ${(card.title && (card.level || card.score)) ? '<span>·</span>' : ''}
                                        ${card.level ? `<i>${escapeFollowedHtml(card.level)}</i>` : ''}
                                        ${card.score ? `<em>${escapeFollowedHtml(card.score)}</em>` : ''}
                                    </span>` : ''}
                            </button>`).join('')}
                    </div>
                </div>`;
            }

            if (fallbackPhotos.length) {
                return `<div class="followed-pocket-honor-stage">
                    <div class="followed-pocket-honor-grid">
                        ${fallbackPhotos.slice(0, 4).map(url => `
                            <button type="button" class="followed-pocket-honor-card" onclick="openImageModal(${toFollowedInlineArg(url)})">
                                <img src="${escapeFollowedHtml(url)}" alt="" onerror="this.style.display='none'">
                            </button>`).join('')}
                    </div>
                </div>`;
            }

            return '';
        }

        function renderFollowedUserProfileBackButton() {
            return '<button type="button" class="followed-profile-back-btn" onclick="backFollowedUserProfile()" aria-label="返回">‹</button>';
        }

        function renderFollowedPocketProfile(content, starContent = {}, honorContent = {}, dynamicContent = {}, albumContent = {}, videoContent = {}, liveContent = {}, fallback = {}) {
            if (isFollowedMemberProfile(starContent, fallback)) {
                return renderFollowedMemberProfile(content, starContent, dynamicContent, albumContent, videoContent, liveContent, fallback);
            }

            const userInfo = getFollowedUserInfo(content);
            const base = getFollowedBaseUserInfo(userInfo);
            const starInfo = starContent?.starInfo || starContent?.memberInfo || starContent || {};
            const sources = [base, userInfo, content, starInfo].filter(Boolean);
            const displayName = starInfo.starName
                || getFollowedProfileDisplayName(userInfo, fallback.name || '口袋用户');
            const userId = getFollowedProfileUserId(userInfo, fallback.userId || starInfo.memberId || starInfo.userId || '');
            const avatarUrl = normalizeFollowedSourceUrl(starInfo.avatar || starInfo.userAvatar || '')
                || getFollowedUserAvatarUrl(userInfo)
                || fallback.avatar
                || './icon.png';
            const coverUrl = normalizeFollowedSourceUrl(base.bgImg || base.bgImgUrl || '')
                || getFollowedProfileImageUrl([userInfo, content, starInfo].filter(Boolean), [
                'bgImg',
                'bgImgUrl',
                'backgroundImg',
                'backgroundImgUrl',
                'backImg',
                'backImgUrl',
                'coverImg',
                'coverImgUrl',
                'homeBgImg',
                'homeBgImgUrl',
                'banner',
                'bannerUrl',
                'serverBgWallImg',
                'chatServerInfo.serverBgWallImg'
            ])
                || './icon.png';
            const signature = getFirstFollowedProfileValue(sources, ['signature', 'sign', 'description', 'desc', 'intro']);
            const level = getFirstFollowedProfileValue(sources, ['level', 'lv', 'userLevel']);
            const roleName = getFirstFollowedProfileValue(sources, ['roleName', 'role', 'userRoleName']);
            const medalName = formatFollowedProfileValue(getFirstFollowedProfileValue(sources, ['badgeName', 'medalName', 'badgeList', 'medals', 'specialBadge']));
            const rankText = getFirstFollowedProfileValue(sources, ['rankName', 'rank', 'topName']);
            const followText = normalizeFollowedRelationText(sources);

            const badges = [
                roleName,
                level ? `lv${level}` : '',
                medalName,
                rankText
            ].filter(Boolean).slice(0, 4);

            const starPhotos = collectFollowedStarPhotos(starContent);
            const honorCards = collectFollowedHonorCards(honorContent);
            const honorCardHtml = renderFollowedHonorCards(honorCards, starPhotos)
                || renderFollowedPocketProfileEmpty('暂无荣耀卡');

            const dynamicCount = getFirstFollowedProfileValue(sources, ['postNum', 'postsNum', 'dynamicNum']);
            const dynamicHtml = renderFollowedDynamicList(dynamicContent);
            const albumHtml = renderFollowedAlbumGrid(albumContent);
            const videoHtml = renderFollowedVideoGrid(videoContent);

            return `
                <div class="followed-pocket-profile">
                    <div class="followed-pocket-scroll">
                        <div class="followed-pocket-hero" style="--followed-profile-cover: url('${escapeFollowedHtml(coverUrl)}');">
                            ${renderFollowedUserProfileBackButton()}
                            <div class="followed-pocket-summary">
                                <img class="followed-pocket-avatar" src="${escapeFollowedHtml(avatarUrl)}" alt="" onerror="this.src='./icon.png'">
                                <div class="followed-pocket-title">
                                    <div class="followed-pocket-name-row">
                                        <div class="followed-pocket-name">${escapeFollowedHtml(displayName)}</div>
                                        ${badges.map((badge, index) => `<span class="followed-pocket-badge badge-${index}">${escapeFollowedHtml(badge)}</span>`).join('')}
                                    </div>
                                    ${userId ? `<div class="followed-pocket-id">ID: ${escapeFollowedHtml(userId)}</div>` : ''}
                                    ${signature ? `<div class="followed-pocket-brief">${escapeFollowedHtml(signature)}</div>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="followed-pocket-tabs">
                            ${renderFollowedPocketProfileTab('honor', '荣耀卡', true)}
                            ${renderFollowedPocketProfileTab('dynamic', '动态')}
                            ${renderFollowedPocketProfileTab('album', '相册')}
                            ${renderFollowedPocketProfileTab('video', '视频')}
                        </div>
                        <div class="followed-pocket-tab-panels">
                            <div class="followed-pocket-tab-panel is-active" data-panel="honor">${honorCardHtml}</div>
                            <div class="followed-pocket-tab-panel" data-panel="dynamic">${dynamicHtml || renderFollowedPocketProfileEmpty(dynamicCount ? `动态 ${dynamicCount} 条` : '暂无动态数据')}</div>
                            <div class="followed-pocket-tab-panel" data-panel="album">${albumHtml}</div>
                            <div class="followed-pocket-tab-panel" data-panel="video">${videoHtml}</div>
                        </div>
                    </div>
                    <div class="followed-pocket-actions">
                        <button type="button" class="followed-pocket-action" data-action="follow" onclick="toggleFollowedProfileFollow(${toFollowedInlineArg(userId)}, ${toFollowedInlineArg(displayName)}, this)">${escapeFollowedHtml(followText)}</button>
                        <button type="button" class="followed-pocket-action" onclick="openFollowedProfilePrivateMessage(${toFollowedInlineArg(userId)}, ${toFollowedInlineArg(displayName)}, ${toFollowedInlineArg(avatarUrl)})">私信</button>
                    </div>
                </div>`;
        }

        function setFollowedUserProfileModalHtml(html) {
            const container = document.getElementById('followed-user-profile-body');
            if (container) container.innerHTML = html;
        }

        function closeFollowedUserProfile() {
            followedUserProfileRequestToken += 1;
            followedUserProfileHistory.length = 0;
            followedUserProfileCurrentEntry = null;
            followedProfileDynamicCommentStateMap.clear();
            if (followedProfileDynamicStatsObserver) followedProfileDynamicStatsObserver.disconnect();
            const modal = document.getElementById('followedUserProfileModal');
            if (modal) modal.style.display = 'none';
        }

        function backFollowedUserProfile() {
            const previousEntry = followedUserProfileHistory.pop();
            if (!previousEntry) {
                closeFollowedUserProfile();
                return;
            }

            openFollowedUserProfile(
                previousEntry.userId,
                previousEntry.fallbackName,
                previousEntry.avatarUrl,
                previousEntry.isMember,
                { pushHistory: false }
            );
        }

        function switchFollowedUserProfileTab(tabName) {
            const modal = document.getElementById('followedUserProfileModal');
            if (!modal) return;
            const normalized = String(tabName || 'honor');
            modal.querySelectorAll('.followed-pocket-profile-tab').forEach(btn => {
                btn.classList.toggle('is-active', btn.dataset.tab === normalized);
            });
            modal.querySelectorAll('.followed-pocket-tab-panel').forEach(panel => {
                panel.classList.toggle('is-active', panel.dataset.panel === normalized);
            });
            const scrollEl = modal.querySelector('.followed-member-scroll, .followed-pocket-scroll');
            if (scrollEl && typeof scrollEl.onscroll === 'function') {
                scrollEl.onscroll();
            }
        }

        async function openFollowedUserProfile(userId, fallbackName = '', avatarUrl = '', isMember = false, options = {}) {
            const normalizedUserId = String(userId || '').trim();
            if (!normalizedUserId) {
                if (typeof showToast === 'function') showToast('没有获取到用户 ID');
                return;
            }

            followedProfileDynamicCommentStateMap.clear();
            if (followedProfileDynamicStatsObserver) followedProfileDynamicStatsObserver.disconnect();

            const token = getAppToken ? getAppToken() : (typeof window.getAppToken === 'function' ? window.getAppToken() : '');
            if (!token) {
                if (typeof showToast === 'function') showToast('请先登录账号');
                return;
            }

            const modal = document.getElementById('followedUserProfileModal');
            if (!modal) return;

            const shouldPushHistory = options.pushHistory !== false
                && modal.style.display !== 'none'
                && followedUserProfileCurrentEntry
                && String(followedUserProfileCurrentEntry.userId || '') !== normalizedUserId;
            if (shouldPushHistory) {
                followedUserProfileHistory.push(followedUserProfileCurrentEntry);
            }
            followedUserProfileCurrentEntry = {
                userId: normalizedUserId,
                fallbackName,
                avatarUrl,
                isMember: !!isMember
            };

            const profileRequestToken = ++followedUserProfileRequestToken;
            modal.style.display = 'flex';
            setFollowedUserProfileModalHtml(`
                ${renderFollowedUserProfileBackButton()}
                <div class="followed-user-profile-loading">
                    <img src="${escapeFollowedHtml(avatarUrl || './icon.png')}" alt="" onerror="this.src='./icon.png'">
                    <div>正在读取用户主页...</div>
                </div>`);

            try {
                const pa = window.getPA ? window.getPA() : null;
                const homeRes = await ipcRenderer.invoke('fetch-user-home-info', {
                    token,
                    pa,
                    userId: normalizedUserId
                });

                if (profileRequestToken !== followedUserProfileRequestToken) return;
                if (!homeRes || !homeRes.success) {
                    setFollowedUserProfileModalHtml(`<div class="empty-state">${escapeFollowedHtml(homeRes?.msg || '读取用户主页失败')}</div>`);
                    return;
                }

                const homeContent = getFollowedProfileContent(homeRes);
                let starContent = homeContent?.starInfo
                    || homeContent?.memberInfo
                    || ((homeContent?.baseUserInfo?.isStar || homeContent?.baseUserInfo?.star || homeContent?.baseUserInfo?.starName)
                        ? homeContent.baseUserInfo
                        : {});
                let honorContent = {};
                let dynamicContent = {};
                let albumContent = {};
                let videoContent = {};
                let liveContent = {};
                let dynamicNextCursor = '0';
                let albumNextCursor = '0';
                let videoNextCursor = '0';
                let liveNextCursor = '0';
                let dynamicHasMore = false;
                let albumHasMore = false;
                let videoHasMore = false;
                let liveHasMore = false;
                let dynamicLoadingMore = false;
                let albumLoadingMore = false;
                let videoLoadingMore = false;
                let liveLoadingMore = false;

                let resolvedMemberProfile = isFollowedMemberProfile(starContent, { isMember });
                const updateHasMore = cursor => !!cursor && cursor !== '0';
                const applyDynamicContent = (content, append = false, sourceKey = 'timeline') => {
                    dynamicContent = append ? mergeFollowedDynamicContent(dynamicContent, content, sourceKey) : content;
                    const items = flattenFollowedDynamicItems(content);
                    const fallbackCursor = items.length >= 20 ? String(items[items.length - 1]?.postId || '') : '';
                    const nextCursor = getFollowedProfileNextCursor(append ? dynamicContent[sourceKey] : content);
                    dynamicNextCursor = updateHasMore(nextCursor) ? nextCursor : fallbackCursor;
                    dynamicHasMore = updateHasMore(dynamicNextCursor);
                };
                const applyAlbumContent = (content, append = false) => {
                    albumContent = append ? mergeFollowedPostContent(albumContent, content, 'image') : content;
                    const items = flattenFollowedPostItems(content, 'image');
                    const fallbackCursor = items.length >= 20 ? String(items[items.length - 1]?.postId || '') : '';
                    const nextCursor = getFollowedProfileNextCursor(albumContent);
                    albumNextCursor = updateHasMore(nextCursor) ? nextCursor : fallbackCursor;
                    albumHasMore = updateHasMore(albumNextCursor);
                };
                const applyVideoContent = (content, append = false) => {
                    videoContent = append ? mergeFollowedPostContent(videoContent, content, 'video') : content;
                    const items = flattenFollowedPostItems(content, 'video');
                    const fallbackCursor = items.length >= 20 ? String(items[items.length - 1]?.postId || '') : '';
                    const nextCursor = getFollowedProfileNextCursor(videoContent);
                    videoNextCursor = updateHasMore(nextCursor) ? nextCursor : fallbackCursor;
                    videoHasMore = updateHasMore(videoNextCursor);
                };
                const applyLiveContent = (content, append = false) => {
                    liveContent = append ? mergeFollowedLiveContent(liveContent, content) : content;
                    liveNextCursor = getFollowedLiveNextCursor(liveContent);
                    liveHasMore = updateHasMore(liveNextCursor);
                };
                const getActiveFollowedProfileTab = () => document.querySelector('#followed-user-profile-body .followed-pocket-profile-tab.is-active')?.dataset.tab || '';
                const loadMoreFollowedProfileDynamic = async () => {
                    if (dynamicLoadingMore || !dynamicHasMore) return;
                    if (getActiveFollowedProfileTab() !== 'dynamic') return;

                    dynamicLoadingMore = true;
                    try {
                        const nextDynamicRes = resolvedMemberProfile
                            ? await ipcRenderer.invoke('fetch-post-timeline-home-new', {
                                token,
                                pa: window.getPA ? window.getPA() : pa,
                                nextId: dynamicNextCursor,
                                userId: normalizedUserId
                            })
                            : await ipcRenderer.invoke('fetch-post-timeline-home', {
                                token,
                                pa: window.getPA ? window.getPA() : pa,
                                nextId: dynamicNextCursor,
                                limit: 20,
                                userId: normalizedUserId
                            });
                        if (profileRequestToken !== followedUserProfileRequestToken) return;
                        if (nextDynamicRes && nextDynamicRes.success && nextDynamicRes.content) {
                            const beforeCount = flattenFollowedDynamicItems(dynamicContent).length;
                            const beforeNext = dynamicNextCursor;
                            applyDynamicContent(nextDynamicRes.content, true, 'timeline');
                            const afterCount = flattenFollowedDynamicItems(dynamicContent).length;
                            if (afterCount <= beforeCount && dynamicNextCursor === beforeNext) {
                                dynamicHasMore = false;
                            }
                            renderCurrentProfile();
                        } else {
                            dynamicHasMore = false;
                        }
                    } catch (dynamicError) {
                        console.warn('加载更多主页动态失败', dynamicError);
                        dynamicHasMore = false;
                    } finally {
                        dynamicLoadingMore = false;
                    }
                };
                const loadMoreFollowedProfileAlbum = async () => {
                    if (albumLoadingMore || !albumHasMore) return;
                    if (getActiveFollowedProfileTab() !== 'album') return;

                    albumLoadingMore = true;
                    try {
                        const nextAlbumRes = await ipcRenderer.invoke('fetch-post-image-list', {
                            token,
                            pa: window.getPA ? window.getPA() : pa,
                            nextId: albumNextCursor,
                            limit: 20,
                            userId: normalizedUserId
                        });
                        if (profileRequestToken !== followedUserProfileRequestToken) return;
                        if (nextAlbumRes && nextAlbumRes.success && nextAlbumRes.content) {
                            const beforeCount = flattenFollowedPostItems(albumContent, 'image').length;
                            const beforeNext = albumNextCursor;
                            const appended = appendFollowedMediaItems('image', nextAlbumRes.content);
                            applyAlbumContent(nextAlbumRes.content, true);
                            const afterCount = flattenFollowedPostItems(albumContent, 'image').length;
                            if (afterCount <= beforeCount && albumNextCursor === beforeNext) {
                                albumHasMore = false;
                            }
                            if (!appended) renderCurrentProfile();
                        } else {
                            albumHasMore = false;
                        }
                    } catch (albumError) {
                        console.warn('加载更多主页相册失败', albumError);
                        albumHasMore = false;
                    } finally {
                        albumLoadingMore = false;
                    }
                };
                const loadMoreFollowedProfileVideo = async () => {
                    if (videoLoadingMore || !videoHasMore) return;
                    if (getActiveFollowedProfileTab() !== 'video') return;

                    videoLoadingMore = true;
                    try {
                        const nextVideoRes = await ipcRenderer.invoke('fetch-post-video-list', {
                            token,
                            pa: window.getPA ? window.getPA() : pa,
                            nextId: videoNextCursor,
                            limit: 20,
                            userId: normalizedUserId
                        });
                        if (profileRequestToken !== followedUserProfileRequestToken) return;
                        if (nextVideoRes && nextVideoRes.success && nextVideoRes.content) {
                            const beforeCount = flattenFollowedPostItems(videoContent, 'video').length;
                            const beforeNext = videoNextCursor;
                            const appended = appendFollowedMediaItems('video', nextVideoRes.content);
                            applyVideoContent(nextVideoRes.content, true);
                            const afterCount = flattenFollowedPostItems(videoContent, 'video').length;
                            if (afterCount <= beforeCount && videoNextCursor === beforeNext) {
                                videoHasMore = false;
                            }
                            if (!appended) renderCurrentProfile();
                        } else {
                            videoHasMore = false;
                        }
                    } catch (videoError) {
                        console.warn('加载更多主页视频失败', videoError);
                        videoHasMore = false;
                    } finally {
                        videoLoadingMore = false;
                    }
                };
                const loadMoreFollowedMemberLive = async () => {
                    if (!resolvedMemberProfile || liveLoadingMore || !liveHasMore) return;
                    if (getActiveFollowedProfileTab() !== 'live') return;

                    liveLoadingMore = true;
                    try {
                        const nextLiveRes = await ipcRenderer.invoke('fetch-live-list', {
                            token,
                            pa: window.getPA ? window.getPA() : pa,
                            debug: true,
                            next: liveNextCursor,
                            record: true,
                            userId: normalizedUserId
                        });
                        if (profileRequestToken !== followedUserProfileRequestToken) return;
                        if (nextLiveRes && nextLiveRes.success && nextLiveRes.content) {
                            const beforeCount = flattenFollowedLiveItems(liveContent).length;
                            const beforeNext = liveNextCursor;
                            applyLiveContent(nextLiveRes.content, true);
                            const afterCount = flattenFollowedLiveItems(liveContent).length;
                            if (afterCount <= beforeCount && liveNextCursor === beforeNext) {
                                liveHasMore = false;
                            }
                            renderCurrentProfile();
                        } else {
                            liveHasMore = false;
                        }
                    } catch (liveError) {
                        console.warn('加载更多成员直播失败', liveError);
                        liveHasMore = false;
                    } finally {
                        liveLoadingMore = false;
                    }
                };
                const loadMoreFollowedProfileActiveTab = () => {
                    const activeTab = getActiveFollowedProfileTab();
                    if (activeTab === 'dynamic') void loadMoreFollowedProfileDynamic();
                    if (activeTab === 'album') void loadMoreFollowedProfileAlbum();
                    if (activeTab === 'video') void loadMoreFollowedProfileVideo();
                    if (activeTab === 'live') void loadMoreFollowedMemberLive();
                };
                const attachFollowedProfileAutoLoad = () => {
                    const scrollEl = document.querySelector('#followed-user-profile-body .followed-member-scroll, #followed-user-profile-body .followed-pocket-scroll');
                    if (!scrollEl) return;
                    scrollEl.onscroll = () => {
                        const remaining = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
                        if (remaining <= 96) {
                            loadMoreFollowedProfileActiveTab();
                        }
                    };
                    window.setTimeout(() => {
                        if (profileRequestToken !== followedUserProfileRequestToken) return;
                        scrollEl.onscroll();
                    }, 0);
                };
                const renderCurrentProfile = () => {
                    if (profileRequestToken !== followedUserProfileRequestToken) return false;
                    const activeTab = getActiveFollowedProfileTab();
                    const scrollEl = document.querySelector('#followed-user-profile-body .followed-member-scroll, #followed-user-profile-body .followed-pocket-scroll');
                    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
                    setFollowedUserProfileModalHtml(renderFollowedPocketProfile(homeContent, starContent, honorContent, dynamicContent, albumContent, videoContent, liveContent, {
                        name: fallbackName,
                        userId: normalizedUserId,
                        avatar: avatarUrl,
                        isMember: resolvedMemberProfile
                    }));
                    if (activeTab) switchFollowedUserProfileTab(activeTab);
                    hydrateFollowedPreviewMedia(document.getElementById('followed-user-profile-body'));
                    hydrateFollowedProfileVideoCovers(document.getElementById('followed-user-profile-body'));
                    observeFollowedProfileDynamicStats(document.getElementById('followed-user-profile-body'));
                    const nextScrollEl = document.querySelector('#followed-user-profile-body .followed-member-scroll, #followed-user-profile-body .followed-pocket-scroll');
                    if (nextScrollEl && scrollTop > 0) nextScrollEl.scrollTop = scrollTop;
                    attachFollowedProfileAutoLoad();
                    return true;
                };
                renderCurrentProfile();

                try {
                    const starRes = await ipcRenderer.invoke('fetch-star-archives', {
                        token,
                        pa: window.getPA ? window.getPA() : pa,
                        memberId: normalizedUserId
                    });
                    if (profileRequestToken !== followedUserProfileRequestToken) return;
                    if (starRes && starRes.success && starRes.content) {
                        starContent = starRes.content || starContent;
                        resolvedMemberProfile = isFollowedMemberProfile(starContent, { isMember });
                        renderCurrentProfile();
                    }
                } catch (starError) {
                    if (isMember) console.warn('读取成员主页失败', starError);
                }

                if (resolvedMemberProfile) {
                    try {
                        const dynamicRes = await ipcRenderer.invoke('fetch-post-timeline-home-new', {
                            token,
                            pa: window.getPA ? window.getPA() : pa,
                            nextId: '0',
                            userId: normalizedUserId
                        });
                        if (profileRequestToken !== followedUserProfileRequestToken) return;
                        if (dynamicRes && dynamicRes.success && dynamicRes.content) {
                            applyDynamicContent(dynamicRes.content, false, 'timeline');
                            renderCurrentProfile();
                        }
                    } catch (dynamicError) {
                        console.warn('读取成员主页动态失败', dynamicError);
                    }
                    try {
                        const postInfoRes = await ipcRenderer.invoke('fetch-member-dynamic', {
                            token,
                            pa: window.getPA ? window.getPA() : pa,
                            ownerId: normalizedUserId,
                            roomId: '',
                            nextTime: 0
                        });
                        if (profileRequestToken !== followedUserProfileRequestToken) return;
                        if (postInfoRes && postInfoRes.success && postInfoRes.content) {
                            dynamicContent = { ...dynamicContent, postInfo: postInfoRes.content };
                            renderCurrentProfile();
                        }
                    } catch (postInfoError) {
                        console.warn('读取成员房间动态失败', postInfoError);
                    }
                    try {
                        const liveRes = await ipcRenderer.invoke('fetch-live-list', {
                            token,
                            pa: window.getPA ? window.getPA() : pa,
                            debug: true,
                            next: 0,
                            record: true,
                            userId: normalizedUserId
                        });
                        if (profileRequestToken !== followedUserProfileRequestToken) return;
                        if (liveRes && liveRes.success && liveRes.content) {
                            applyLiveContent(liveRes.content, false);
                            renderCurrentProfile();
                        }
                    } catch (liveError) {
                        console.warn('读取成员直播失败', liveError);
                    }
                } else {
                    try {
                        const honorRes = await ipcRenderer.invoke('fetch-pageantry-honor-card-info', {
                            token,
                            pa: window.getPA ? window.getPA() : pa,
                            sortType: 0,
                            userId: normalizedUserId
                        });
                        if (profileRequestToken !== followedUserProfileRequestToken) return;
                        if (honorRes && honorRes.success && honorRes.content) {
                            honorContent = honorRes.content;
                            renderCurrentProfile();
                        }
                    } catch (honorError) {
                        console.warn('读取荣耀卡失败', honorError);
                    }
                    try {
                        const dynamicRes = await ipcRenderer.invoke('fetch-post-timeline-home', {
                            token,
                            pa: window.getPA ? window.getPA() : pa,
                            nextId: 0,
                            limit: 20,
                            userId: normalizedUserId
                        });
                        if (profileRequestToken !== followedUserProfileRequestToken) return;
                        if (dynamicRes && dynamicRes.success && dynamicRes.content) {
                            applyDynamicContent(dynamicRes.content, false, 'timeline');
                            renderCurrentProfile();
                        }
                    } catch (dynamicError) {
                        console.warn('读取主页动态失败', dynamicError);
                    }
                }
                try {
                    const albumRes = await ipcRenderer.invoke('fetch-post-image-list', {
                        token,
                        pa: window.getPA ? window.getPA() : pa,
                        nextId: 0,
                        limit: 20,
                        userId: normalizedUserId
                    });
                    if (profileRequestToken !== followedUserProfileRequestToken) return;
                    if (albumRes && albumRes.success && albumRes.content) {
                        applyAlbumContent(albumRes.content, false);
                        renderCurrentProfile();
                    }
                } catch (albumError) {
                    console.warn('读取主页相册失败', albumError);
                }
                try {
                    const videoRes = await ipcRenderer.invoke('fetch-post-video-list', {
                        token,
                        pa: window.getPA ? window.getPA() : pa,
                        nextId: 0,
                        limit: 20,
                        userId: normalizedUserId
                    });
                    if (profileRequestToken !== followedUserProfileRequestToken) return;
                    if (videoRes && videoRes.success && videoRes.content) {
                        applyVideoContent(videoRes.content, false);
                        renderCurrentProfile();
                    }
                } catch (videoError) {
                    console.warn('读取主页视频失败', videoError);
                }
            } catch (error) {
                if (profileRequestToken !== followedUserProfileRequestToken) return;
                console.error('读取用户主页失败', error);
                setFollowedUserProfileModalHtml(`<div class="empty-state">${escapeFollowedHtml(error.message || '读取用户主页失败')}</div>`);
            }
        }

        function scheduleFollowedGiftCacheSave() {
            if (followedGiftCacheSaveTimer) {
                clearTimeout(followedGiftCacheSaveTimer);
            }

            followedGiftCacheSaveTimer = setTimeout(() => {
                followedGiftCacheSaveTimer = null;
                const cacheApi = window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
                if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                    cacheApi.setCacheValueSync('POCKET_GIFT_DATA_CACHE', POCKET_GIFT_DATA);
                } else {
                    localStorage.setItem('POCKET_GIFT_DATA_CACHE', JSON.stringify(POCKET_GIFT_DATA));
                }
            }, 500);
        }

        function upsertFollowedPocketGiftData(giftInfo = {}, unitCost = 0) {
            if (typeof POCKET_GIFT_DATA === 'undefined') return false;

            const id = String(giftInfo.giftId || giftInfo.id || '').trim();
            const name = String(giftInfo.giftName || giftInfo.name || '').trim();
            const cost = Number(unitCost || giftInfo.money || giftInfo.cost || 0);
            if ((!id && !name) || !cost) return false;

            const existing = POCKET_GIFT_DATA.find(item => (id && String(item.id) === id) || (name && item.name === name));
            if (existing) {
                const changed = Number(existing.cost || 0) !== cost
                    || (id && String(existing.id || '') !== id)
                    || (name && existing.name !== name);
                if (!changed) return false;

                existing.id = id || existing.id;
                existing.name = name || existing.name;
                existing.cost = cost;
            } else {
                POCKET_GIFT_DATA.push({ id, name: name || id, cost });
            }

            scheduleFollowedGiftCacheSave();
            return true;
        }

        function renderFollowedPocketGiftCard(giftInfo = {}) {
            const giftName = escapeFollowedHtml(giftInfo.giftName || giftInfo.name || '未知礼物');
            const giftNum = Number(giftInfo.giftNum || giftInfo.num || giftInfo.count || 1) || 1;
            const giftImg = normalizeFollowedPocketMediaUrl(giftInfo.picPath || giftInfo.giftPic || giftInfo.image || '');
            let unitCost = Number(giftInfo.money || giftInfo.cost || 0);

            if (!unitCost && typeof POCKET_GIFT_DATA !== 'undefined') {
                const gift = POCKET_GIFT_DATA.find(item => item.id == (giftInfo.giftId || giftInfo.id) || item.name === (giftInfo.giftName || giftInfo.name));
                if (gift) unitCost = Number(gift.cost || 0);
            }

            upsertFollowedPocketGiftData(giftInfo, unitCost);

            const costDisplay = unitCost
                ? `<span style="margin-left:5px; color:#fa8c16; font-weight:bold;">(${unitCost * giftNum}🍗)</span>`
                : '';

            return `
                <div class="mb-2" style="display:flex; align-items:center; background:#fff0f6; padding:6px 8px; border-radius:6px; border:1px solid #ffadd2; max-width: 300px;">
                    ${giftImg ? `<img src="${escapeFollowedHtml(giftImg)}" style="width: 25px !important; height: 25px !important; max-width: 32px !important; max-height: 32px !important; object-fit: contain !important; margin: 0 8px 0 0 !important; border-radius: 4px; box-shadow: none !important;">` : '<span style="font-size:24px; margin-right:8px;">🎁</span>'}
                    <div style="flex: 1; overflow: hidden;">
                        <div style="color:#eb2f96; font-weight:bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">送出礼物：${giftName}</div>
                        <div style="font-size:11px; color:#888;">数量: x${giftNum} ${costDisplay}</div>
                    </div>
                </div>`;
        }

        function resetFollowedPendingBottomTimer() {
            if (followedPendingBottomTimer) {
                clearTimeout(followedPendingBottomTimer);
                followedPendingBottomTimer = null;
            }
        }

        function invalidateFollowedAutoScrollJobs() {
            followedAutoScrollToken += 1;
            resetFollowedPendingBottomTimer();
        }

        function getFollowedNewMessageNotice() {
            return document.getElementById('followed-chat-new-messages');
        }

        function updateFollowedPendingNotice() {
            const btn = getFollowedNewMessageNotice();
            if (!btn) return;

            if (followedPendingCount > 0) {
                btn.style.display = 'inline-flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                btn.innerText = `有 ${followedPendingCount} 条新消息`;
                return;
            }

            btn.style.display = 'none';
            btn.innerText = '有新消息';
        }

        function resetFollowedPendingMessages() {
            followedPendingHtml = '';
            followedPendingCount = 0;
            followedPendingMessageIds.clear();
            updateFollowedPendingNotice();
        }

        function collectFollowedRenderedMessageIds(container, includePending = false) {
            const ids = new Set();

            if (container) {
                container.querySelectorAll('.msg-item').forEach(el => {
                    if (el.dataset.msgid) ids.add(String(el.dataset.msgid));
                });
            }

            if (includePending) {
                followedPendingMessageIds.forEach(id => ids.add(String(id)));
            }

            return ids;
        }

        function removeFollowedEmptyState(container) {
            if (!container) return;
            container.querySelectorAll('.empty-state').forEach(el => el.remove());
        }

        function queueFollowedPendingBatch(batchHtml, messageIds) {
            if (!batchHtml || !messageIds || messageIds.length === 0) {
                return;
            }

            followedPendingHtml += batchHtml;
            messageIds.forEach(id => followedPendingMessageIds.add(String(id)));
            followedPendingCount = followedPendingMessageIds.size;
            updateFollowedPendingNotice();
        }

        function hydrateFollowedPreviewMedia(container) {
            if (!container) return;

            container.querySelectorAll('.preview-media-placeholder').forEach(el => {
                const type = el.getAttribute('data-type');
                const src = el.getAttribute('data-src');
                if (src) {
                    if (type === 'audio' && typeof createCustomAudioPlayer === 'function') {
                        el.appendChild(createCustomAudioPlayer(src));
                    } else if (type === 'video' && typeof createCustomVideoPlayer === 'function') {
                        el.appendChild(createCustomVideoPlayer(src));
                    }
                }
                el.classList.remove('preview-media-placeholder');
            });
        }

        function captureFollowedPrependAnchor(container) {
            if (!container) return null;

            const containerTop = container.getBoundingClientRect().top;
            const messageItems = Array.from(container.querySelectorAll('.msg-item'));
            const anchorEl = messageItems.find(item => item.getBoundingClientRect().bottom > containerTop + 1)
                || messageItems[0];
            const messageId = anchorEl?.dataset?.msgid;
            if (!anchorEl || !messageId) return null;

            return {
                messageId: String(messageId),
                offsetTop: anchorEl.getBoundingClientRect().top - containerTop
            };
        }

        function restoreFollowedPrependAnchor(container, anchor) {
            if (!container || !anchor) return false;

            const anchorEl = Array.from(container.querySelectorAll('.msg-item'))
                .find(item => String(item.dataset.msgid || '') === anchor.messageId);
            if (!anchorEl) return false;

            const containerTop = container.getBoundingClientRect().top;
            const currentOffsetTop = anchorEl.getBoundingClientRect().top - containerTop;
            const nextScrollTop = container.scrollTop + currentOffsetTop - anchor.offsetTop;
            container.scrollTop = Math.max(1, nextScrollTop);
            followedLastScrollTop = container.scrollTop;
            return true;
        }

        function scrollFollowedToBottom(msgBox, respectAutoScrollLock = false) {
            if (!msgBox) return;
            if (respectAutoScrollLock && !canFollowedAutoScroll(msgBox)) return;

            const autoScrollTokenAtAppend = followedAutoScrollToken;

            resetFollowedPendingBottomTimer();
            msgBox.scrollTop = msgBox.scrollHeight;
            followedLastScrollTop = msgBox.scrollTop;

            const goBottomSmart = () => {
                if (autoScrollTokenAtAppend !== followedAutoScrollToken) {
                    return;
                }
                if (!respectAutoScrollLock || canFollowedAutoScroll(msgBox)) {
                    msgBox.scrollTop = msgBox.scrollHeight;
                    followedLastScrollTop = msgBox.scrollTop;
                }
            };

            msgBox.querySelectorAll('img').forEach(img => {
                if (!img.complete) {
                    img.addEventListener('load', goBottomSmart, { once: true });
                    img.addEventListener('error', goBottomSmart, { once: true });
                }
            });

            followedPendingBottomTimer = setTimeout(() => {
                followedPendingBottomTimer = null;
                goBottomSmart();
            }, 300);
        }

        function flushFollowedPendingMessages() {
            const msgBox = document.getElementById('followed-chat-messages');
            if (!msgBox || !followedPendingHtml) {
                resetFollowedPendingMessages();
                return;
            }

            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            invalidateFollowedAutoScrollJobs();
            removeFollowedEmptyState(msgBox);

            const fragment = document.createRange().createContextualFragment(followedPendingHtml);
            msgBox.appendChild(fragment);
            hydrateFollowedPreviewMedia(msgBox);
            resetFollowedPendingMessages();
            scrollFollowedToBottom(msgBox, false);
        };

        function updateFollowedScrollStickState(container) {
            if (!container) return;

            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            const isNearBottom = distanceFromBottom < 60;
            const isScrollingUp = container.scrollTop < followedLastScrollTop - 2;
            followedLastScrollTop = container.scrollTop;

            if (isNearBottom) {
                followedStickToBottom = true;
                followedUserScrollLockUntil = 0;
                return;
            }

            if (isScrollingUp) {
                followedStickToBottom = false;
                followedUserScrollLockUntil = Number.MAX_SAFE_INTEGER;
                invalidateFollowedAutoScrollJobs();
                return;
            }

            if (!followedStickToBottom) {
                return;
            }
        }

        function canFollowedAutoScroll(container) {
            if (!container) return false;

            if (followedStickToBottom) return true;

            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            if (distanceFromBottom < 60) {
                followedStickToBottom = true;
                followedUserScrollLockUntil = 0;
                return true;
            }

            if (Date.now() < followedUserScrollLockUntil) {
                return false;
            }

            return false;
        }

        function lockFollowedAutoScroll() {
            followedStickToBottom = false;
            followedUserScrollLockUntil = Number.MAX_SAFE_INTEGER;
            invalidateFollowedAutoScrollJobs();
        }

        function getFollowedChannelTitle(detail, channelId) {
            const content = detail?.content || detail || {};
            const channels = Array.isArray(content.channelInfoList) ? content.channelInfoList : [];
            const matchedChannel = channels.find(channel => String(channel.channelId) === String(channelId));
            return matchedChannel?.channelName || '';
        }

        function getFollowedFallbackTitle(ownerName = activeFollowedName) {
            const name = String(ownerName || '').trim();
            return name ? `${name} 的房间` : '成员房间';
        }

        function hideFollowedChatTitle() {
            const titleEl = document.getElementById('followed-chat-title');
            if (!titleEl) return;
            titleEl.innerText = ' ';
            titleEl.style.visibility = 'hidden';
        }

        function showFollowedChatTitle(title) {
            const titleEl = document.getElementById('followed-chat-title');
            if (!titleEl) return;
            titleEl.innerText = title;
            titleEl.style.visibility = 'visible';
        }

        function updateFollowedChatSubtitle(channelId) {
            const subtitleEl = document.getElementById('followed-chat-subtitle');
            if (!subtitleEl) return;

            const normalizedChannelId = String(channelId || '--').trim() || '--';
            subtitleEl.dataset.channelId = normalizedChannelId;
            subtitleEl.innerText = `Channel ID: ${normalizedChannelId}`;
        }

        function updateFollowedChatTitleFromDetail(detail) {
            const title = getFollowedChannelTitle(detail, activeFollowedChannel) || getFollowedFallbackTitle();
            showFollowedChatTitle(title);
        }

        function setFollowedChatAvatarUrl(avatarUrl) {
            const avatarImg = document.getElementById('followed-chat-avatar');
            if (!avatarImg) return;

            const nextUrl = String(avatarUrl || '').trim();
            if (!nextUrl) {
                avatarImg.removeAttribute('src');
                avatarImg.style.display = 'block';
                avatarImg.style.visibility = 'hidden';
                avatarImg.style.opacity = '0';
                return;
            }

            if (avatarImg.getAttribute('src') !== nextUrl) {
                avatarImg.src = nextUrl;
            }
            avatarImg.style.display = 'block';
            avatarImg.style.visibility = 'visible';
            avatarImg.style.opacity = '1';
        }

        function updateFollowedChatAvatarFromDetail(detail) {
            const serverIcon = detail?.chatServerInfo?.serverIcon;
            const avatarUrl = normalizeFollowedSourceUrl(serverIcon);
            if (!avatarUrl) return false;

            setFollowedChatAvatarUrl(avatarUrl);
            return true;
        }

        function updateFollowedChatMetaFromDetail(detail) {
            updateFollowedChatTitleFromDetail(detail);
            if (!updateFollowedChatAvatarFromDetail(detail) && activeFollowedFallbackAvatarUrl) {
                setFollowedChatAvatarUrl(activeFollowedFallbackAvatarUrl);
            }
        }

        function getFollowedMemberAvatarUrl(channelId) {
            const memberInfo = getMemberData().find(m => String(m.channelId) === String(channelId));
            if (!memberInfo || !memberInfo.id) return '';
            return window.globalAvatarCache[memberInfo.id] ||
                (memberInfo.avatar ? normalizeFollowedSourceUrl(memberInfo.avatar) : '');
        }

        async function refreshFollowedChatTitle() {
            const serverId = String(activeFollowedServer || '').trim();
            if (!serverId) {
                if (activeFollowedFallbackAvatarUrl) setFollowedChatAvatarUrl(activeFollowedFallbackAvatarUrl);
                return;
            }

            const cachedDetail = followedServerDetailCache.get(serverId);
            if (cachedDetail) {
                updateFollowedChatMetaFromDetail(cachedDetail);
                return;
            }

            const requestServerId = serverId;
            try {
                const token = getAppToken();
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-seine-server-detail', {
                    token,
                    pa,
                    serverId: requestServerId
                });

                if (!res?.success || !res.content) {
                    if (activeFollowedFallbackAvatarUrl) setFollowedChatAvatarUrl(activeFollowedFallbackAvatarUrl);
                    return;
                }
                followedServerDetailCache.set(requestServerId, res.content);
                if (String(activeFollowedServer || '') === requestServerId) {
                    updateFollowedChatMetaFromDetail(res.content);
                }
            } catch (error) {
                console.warn('获取频道名失败:', error);
                if (activeFollowedFallbackAvatarUrl) setFollowedChatAvatarUrl(activeFollowedFallbackAvatarUrl);
            }
        }

        async function playSharedLiveFromMessage(liveId, nickname, timeStr, title) {
            if (!liveId) return;

            try {
                const res = await fetchPocketAPI('/live/api/v1/live/getLiveList', JSON.stringify({
                    debug: true,
                    next: 0,
                    groupId: 0,
                    record: false
                }));

                const liveList = Array.isArray(res?.content?.liveList) ? res.content.liveList : [];
                const matchedLive = liveList.find(item => String(item.liveId) === String(liveId));

                if (matchedLive && typeof playLiveStream === 'function') {
                    if (typeof setMediaReturnView === 'function') setMediaReturnView('followed-rooms');
                    switchView('media', 'live');
                    setTimeout(() => {
                        playLiveStream(matchedLive, 'live');
                    }, 300);
                    return;
                }
            } catch (error) {
                console.warn('[关注房间] 判断分享直播状态失败，回退到回放模式:', error);
            }

            if (typeof playArchiveFromMessage === 'function') {
                if (typeof setMediaReturnView === 'function') setMediaReturnView('followed-rooms');
                playArchiveFromMessage(liveId, nickname, timeStr, title || '直播分享');
            }
        }

        function openFollowedChat(ownerName, channelId, serverId, options = {}) {
            const requestRevision = ++followedChatRequestRevision;
            const refreshCycle = ++followedAutoRefreshCycle;
            isFollowedChatLoading = false;
            const initialRoomType = options?.roomType === 'small' ? 'small' : 'big';
            const mainChannelId = String(options?.mainChannelId || channelId || '');
            activeFollowedChannel = channelId;
            activeFollowedMainChannel = mainChannelId;
            activeFollowedServer = serverId;
            activeFollowedName = ownerName;
            activeFollowedMemberId = String(options?.memberId || '').trim();
            activeFollowedNextTime = 0;
            isFollowedSmallRoomMode = initialRoomType === 'small';
            if (typeof window.syncWebRoomRoute === 'function') {
                window.syncWebRoomRoute(channelId);
            }
            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            followedLastScrollTop = 0;
            invalidateFollowedAutoScrollJobs();
            resetFollowedPendingMessages();
            if (typeof window.autoConnectFollowedRoomRadio === 'function') {
                window.autoConnectFollowedRoomRadio(
                    channelId,
                    serverId,
                    activeFollowedMemberId,
                    ownerName
                );
            }
            if (typeof window.ensureRoomRadioScanFresh === 'function') {
                window.ensureRoomRadioScanFresh({
                    preferredChannelId: channelId,
                    prioritizeCurrent: true
                });
            }
            const followedView = document.getElementById('view-followed-rooms');
            if (followedView) followedView.classList.add('is-chat-open');

            if (followedAutoRefreshTimer) {
                clearTimeout(followedAutoRefreshTimer);
                followedAutoRefreshTimer = null;
            }
            followedAutoRefreshEnabled = false;
            followedAutoRefreshRunning = false;

            const roomBtn = document.getElementById('btn-toggle-room-type');
            if (roomBtn) {
                roomBtn.innerText = isFollowedSmallRoomMode ? "小房间" : "大房间";
                roomBtn.classList.remove('btn-primary');
                roomBtn.classList.add('btn-secondary');
            }

            document.querySelectorAll('.session-card').forEach(card => card.classList.remove('active'));
            const selectedCard = document.getElementById(`session-card-${mainChannelId}`);
            if (selectedCard) selectedCard.classList.add('active');

            const header = document.getElementById('followed-chat-header');
            header.style.visibility = 'visible';
            if (typeof window.updateFollowedRoomNotificationButton === 'function') {
                window.updateFollowedRoomNotificationButton(mainChannelId);
            }
            showFollowedChatTitle(getFollowedFallbackTitle(ownerName));
            updateFollowedChatSubtitle(channelId);
            activeFollowedFallbackAvatarUrl = getFollowedMemberAvatarUrl(mainChannelId);

            if (activeFollowedServer) {
                setFollowedChatAvatarUrl('');
                refreshFollowedChatTitle();
            } else {
                setFollowedChatAvatarUrl(activeFollowedFallbackAvatarUrl);
            }

            const msgBox = document.getElementById('followed-chat-messages');
            msgBox.style.transition = 'opacity 0.2s';
            msgBox.style.opacity = '0.4';
            msgBox.style.pointerEvents = 'none';

            loadFollowedChatPage(false, false, requestRevision).finally(() => {
                if (refreshCycle !== followedAutoRefreshCycle) return;
                followedAutoRefreshEnabled = true;

                const scheduleNext = () => {
                    if (!followedAutoRefreshEnabled || refreshCycle !== followedAutoRefreshCycle) return;
                    followedAutoRefreshTimer = setTimeout(runPoll, getAdaptivePollDelay());
                };

                const runPoll = async () => {
                    if (!followedAutoRefreshEnabled || refreshCycle !== followedAutoRefreshCycle) return;
                    const view = document.getElementById('view-followed-rooms');
                    if ((view && view.style.display === 'none') || followedAutoRefreshRunning) {
                        scheduleNext();
                        return;
                    }
                    followedAutoRefreshRunning = true;
                    try {
                        await loadFollowedChatPage(false, true);
                    } finally {
                        if (refreshCycle !== followedAutoRefreshCycle) return;
                        followedAutoRefreshRunning = false;
                        scheduleNext();
                    }
                };

                scheduleNext();
            });
        };

        function backToFollowedRoomList(event) {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            const followedView = document.getElementById('view-followed-rooms');
            if (followedView) followedView.classList.remove('is-chat-open');
            if (typeof window.syncWebRoomListRoute === 'function') {
                window.syncWebRoomListRoute();
            }
        }

        function openActiveFollowedRoomAlbum() {
            if (!activeFollowedName || !activeFollowedChannel) {
                showToast('请先打开成员房间');
                return;
            }

            const memberInfo = getMemberData().find(member => (
                (activeFollowedMemberId && String(member.id || member.userId || '') === activeFollowedMemberId)
                || String(member.channelId || '') === String(activeFollowedMainChannel || activeFollowedChannel)
                || String(member.ownerName || member.name || '') === String(activeFollowedName)
            ));
            const bigChannelId = String(
                activeFollowedMainChannel
                || memberInfo?.channelId
                || activeFollowedChannel
                || ''
            );
            const smallChannelId = String(
                (isFollowedSmallRoomMode ? activeFollowedChannel : '')
                || memberInfo?.smallChannelId
                || memberInfo?.yklzId
                || ''
            );

            if (typeof window.openRoomAlbumForRoom === 'function') {
                window.openRoomAlbumForRoom(
                    activeFollowedName,
                    bigChannelId,
                    smallChannelId,
                    isFollowedSmallRoomMode ? 'small' : 'big'
                );
                return;
            }

            switchView('room-album');
            if (typeof window.selectRoomAlbumMember === 'function') {
                window.selectRoomAlbumMember(activeFollowedName, bigChannelId, smallChannelId);
            }
        }

        function openActiveFollowedFlipQuestion() {
            if (!activeFollowedName) {
                showToast('请先打开成员房间');
                return;
            }

            const memberInfo = getMemberData().find(member => (
                (activeFollowedMemberId && String(member.id || member.userId || '') === activeFollowedMemberId)
                || String(member.channelId || '') === String(activeFollowedMainChannel || activeFollowedChannel)
                || String(member.ownerName || member.name || '') === String(activeFollowedName)
            ));
            const memberId = String(activeFollowedMemberId || memberInfo?.id || memberInfo?.userId || '').trim();
            if (!memberId) {
                showToast(`未找到 ${activeFollowedName} 的成员 ID`);
                return;
            }

            window.suppressNextFlipMemberAutofocus = true;
            switchView('send-flip');
            if (typeof window.selectFlipSendMember === 'function') {
                window.selectFlipSendMember(activeFollowedName, memberId);
            }
        }

        function toggleFollowedRoomType() {
            if (isFollowedChatLoading || !activeFollowedName) return;

            followedChatRequestRevision += 1;
            isFollowedChatLoading = false;

            const memberInfo = getMemberData().find(m => m.ownerName === activeFollowedName);

            if (!isFollowedSmallRoomMode) {
                const smallRoomId = memberInfo ? memberInfo.yklzId : null;
                if (!smallRoomId) {
                    showToast(`未在数据中找到 ${activeFollowedName} 的小房间 ID`);
                    return;
                }
                isFollowedSmallRoomMode = true;
                activeFollowedChannel = smallRoomId;
            } else {
                isFollowedSmallRoomMode = false;
                activeFollowedChannel = activeFollowedMainChannel;
            }
            if (typeof window.syncWebRoomRoute === 'function') {
                window.syncWebRoomRoute(activeFollowedChannel);
            }

            const btn = document.getElementById('btn-toggle-room-type');
            if (isFollowedSmallRoomMode) {
                btn.innerText = "小房间";
            } else {
                btn.innerText = "大房间";
            }

            updateFollowedChatSubtitle(activeFollowedChannel);
            if (typeof window.autoConnectFollowedRoomRadio === 'function') {
                window.autoConnectFollowedRoomRadio(
                    activeFollowedChannel,
                    activeFollowedServer,
                    activeFollowedMemberId,
                    activeFollowedName
                );
            }
            if (typeof window.ensureRoomRadioScanFresh === 'function') {
                window.ensureRoomRadioScanFresh({
                    preferredChannelId: activeFollowedChannel,
                    prioritizeCurrent: true
                });
            }
            showFollowedChatTitle(getFollowedFallbackTitle());
            refreshFollowedChatTitle();

            activeFollowedNextTime = 0;
            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            followedLastScrollTop = 0;
            invalidateFollowedAutoScrollJobs();
            resetFollowedPendingMessages();
            const msgBox = document.getElementById('followed-chat-messages');
            msgBox.style.transition = 'opacity 0.2s';
            msgBox.style.opacity = '0.4';
            msgBox.style.pointerEvents = 'none';
            msgBox.replaceChildren();

            loadFollowedChatPage(false);
        }

        function jumpToFullRoom() {
            if (!activeFollowedChannel) return;
            switchView('fetch');
            document.getElementById('member-search').value = activeFollowedName;
            document.getElementById('tool-channel').value = activeFollowedChannel;
            document.getElementById('tool-server').value = activeFollowedServer;
            setTimeout(() => document.getElementById('btn-fetch-one').click(), 300);
        }

        let isFollowedChatAllMode = false;

        function toggleFollowedChatMode() {
            if (isFollowedChatLoading) return;

            isFollowedChatAllMode = !isFollowedChatAllMode;
            followedChatRequestRevision += 1;
            const btn = document.getElementById('btn-toggle-followed-mode');
            const msgBox = document.getElementById('followed-chat-messages');

            btn.innerText = "切换中...";
            btn.disabled = true;

            msgBox.style.transition = 'opacity 0.2s';
            msgBox.style.opacity = '0.4';

            if (isFollowedChatAllMode) {
            } else {
            }

            activeFollowedNextTime = 0;
            followedStickToBottom = true;
            followedUserScrollLockUntil = 0;
            followedLastScrollTop = 0;
            invalidateFollowedAutoScrollJobs();
            resetFollowedPendingMessages();

            loadFollowedChatPage(false).finally(() => {
                btn.innerText = isFollowedChatAllMode ? "全部消息" : "成员消息";
                btn.disabled = false;
            });
        };

        async function loadFollowedChatPage(isLoadMore, isAutoRefresh = false, requestRevision = followedChatRequestRevision) {
            if (requestRevision !== followedChatRequestRevision || isFollowedChatLoading) return;
            isFollowedChatLoading = true;

            const msgBox = document.getElementById('followed-chat-messages');
            const token = getAppToken();
            const pa = window.getPA ? window.getPA() : null;
            const requestServerId = activeFollowedServer;
            const requestChannelId = activeFollowedChannel;
            const requestFetchAll = isFollowedChatAllMode;

            const oldScrollHeight = msgBox.scrollHeight;
            const prependAnchor = isLoadMore ? captureFollowedPrependAnchor(msgBox) : null;
            try {
                const fetchNextTime = isAutoRefresh ? 0 : activeFollowedNextTime;

                const res = await fetchFollowedRoomMessagesWithTimeout({
                    token: token,
                    serverId: requestServerId,
                    channelId: requestChannelId,
                    pa: pa,
                    nextTime: fetchNextTime,
                    fetchAll: requestFetchAll
                });

                if (requestRevision !== followedChatRequestRevision) return;

                if (res.success && res.data.content) {
                    if (res.usedServerId) {
                        activeFollowedServer = res.usedServerId;
                        refreshFollowedChatTitle();
                    }
                    const content = res.data.content;
                    let list = content.messageList || content.message || [];

                    if (!isAutoRefresh && !isLoadMore) {
                        activeFollowedNextTime = normalizeFollowedNextTime(content.nextTime);
                        if (list.length === 0) activeFollowedNextTime = 0;
                    } else if (isLoadMore) {
                        activeFollowedNextTime = list.length > 0
                            ? normalizeFollowedNextTime(content.nextTime, fetchNextTime)
                            : 0;
                    }

                    if (!isLoadMore && !isAutoRefresh) msgBox.replaceChildren();
                    const oldBtn = document.getElementById('btn-load-more-followed');
                    if (oldBtn) oldBtn.remove();

                    if (list.length === 0 && !isLoadMore && !isAutoRefresh) {
                        msgBox.innerHTML = '<div class="empty-state" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text-sub); font-size: 14px;">暂无新消息</div>';
                        isFollowedChatLoading = false;
                        return;
                    }

                    const reversedList = [...list].reverse();
                    const existingIds = isAutoRefresh || isLoadMore
                        ? collectFollowedRenderedMessageIds(msgBox, true)
                        : new Set();
                    const batchMessageIds = [];

                    const batchHtml = reversedList.map(m => {
                        const msgId = m.msgidClient || m.msgId || m.msgTime;

                        if ((isAutoRefresh || isLoadMore) && existingIds.has(String(msgId))) {
                            return '';
                        }

                        batchMessageIds.push(String(msgId));

                        let txt = '[不支持的消息格式]';
                        let isMember = false;
                        let displayName = m.senderName || '未知用户';
                        let senderId = m.senderUserId || m.senderId || m.uid || '';
                        let avatarUrl = './icon.png';
                        let body = m.bodys || m.msgContent || '';
                        let extraHtml = '';

                        const safeStr = (str) => String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        const msgDate = new Date(m.msgTime);
                        const msgPad = (n) => String(n).padStart(2, '0');
                        const fallbackTimeStr = `${msgDate.getFullYear()}-${msgPad(msgDate.getMonth() + 1)}-${msgPad(msgDate.getDate())} ${msgPad(msgDate.getHours())}:${msgPad(msgDate.getMinutes())}:${msgPad(msgDate.getSeconds())}`;

                        if (m.extInfo) {
                            try {
                                const safeExtInfo = typeof m.extInfo === 'string' ? m.extInfo.replace(/:\s*([0-9]{16,})/g, ':"$1"') : m.extInfo;
                                const ext = typeof safeExtInfo === 'string' ? JSON.parse(safeExtInfo) : safeExtInfo;
                                if (ext && ext.user) {
                                    if (ext.user.roleId > 1) isMember = true;
                                    if (!senderId) senderId = ext.user.userId || ext.user.id || '';
                                    if (ext.user.nickName) displayName = ext.user.nickName;
                                    if (ext.user.avatar) {
                                        avatarUrl = ext.user.avatar.startsWith('http') ? ext.user.avatar : `https://source.48.cn${ext.user.avatar}`;
                                    }
                                }
                            } catch (e) { console.warn('用户信息(extInfo)解析失败', e); }
                        }

                        try {
                            let json = null;
                            if (typeof body === 'string' && (body.startsWith('{') || body.startsWith('['))) {
                                try {
                                    json = JSON.parse(body);
                                    if (typeof json === 'string') json = JSON.parse(json);
                                } catch (parseErr) { window.YayaRendererUtils.reportIgnoredError(parseErr, 'src/renderer/followed-chat-feature.js'); }
                            } else if (typeof body === 'object' && body !== null) {
                                json = body;
                            }

                            if (json) {
                                const msgType = (m.msgType || '').toUpperCase();
                                const jsonType = (json.messageType || '').toUpperCase();

                                if (msgType === 'TEXT') {
                                    txt = `<p class="mb-2 template-pre">${safeStr(json.text || json.bodys || body)}</p>`;
                                } else if (msgType === 'IMAGE') {
                                    const url = json.url.startsWith('http') ? json.url : `https://source3.48.cn${json.url}`;
                                    txt = `<div class="mb-2"><img class="template-media" src="${url}" loading="lazy" style="max-height: 250px; border-radius: 8px; cursor: zoom-in;" onclick="openImageModal('${url}')"></div>`;
                                } else if (msgType === 'EXPRESSIMAGE') {
                                    const url = json.expressImgInfo ? json.expressImgInfo.emotionRemote : json.url;
                                    txt = `<div class="mb-2"><img class="template-image-express-image" src="${url.startsWith('http') ? url : 'https://source3.48.cn' + url}"></div>`;
                                } else if (msgType === 'REPLY' || msgType === 'GIFTREPLY') {
                                    let info = json.replyInfo || json.giftReplyInfo || (json.bodys && (json.bodys.replyInfo || json.bodys.giftReplyInfo));
                                    const rName = safeStr(info?.replyName || '用户');
                                    const rText = safeStr(info?.replyText || '消息');
                                    const myText = safeStr(info?.text || json.text || body);
                                    txt = `<p class="mb-2 template-pre">${myText}</p>
                                           <blockquote class="ml-2 mb-2 p-2" style="background: var(--blockquote-bg); border-left: 4px solid var(--border); color: var(--text-sub); border-radius: 0 4px 4px 0;">
                                               ${rName}：${rText}
                                           </blockquote>`;
                                } else if (msgType === 'AUDIO') {
                                    let mediaUrl = json.url.startsWith('http') ? json.url : `https://mp4.48.cn${json.url.startsWith('/') ? '' : '/'}${json.url}`;
                                    txt = `<div class="mb-2 preview-media-placeholder" data-type="audio" data-src="${mediaUrl}"></div>`;
                                } else if (msgType === 'VIDEO') {
                                    let mediaUrl = json.url.startsWith('http') ? json.url : `https://mp4.48.cn${json.url.startsWith('/') ? '' : '/'}${json.url}`;
                                    txt = `<div class="mb-2 preview-media-placeholder" data-type="video" data-src="${mediaUrl}"></div>`;
                                } else if (jsonType === 'GIFT_TEXT' || msgType === 'GIFT_TEXT') {
                                    const info = json.giftInfo || json;
                                    txt = renderFollowedPocketGiftCard(info);
                                } else if (msgType.includes('FLIPCARD') || jsonType.includes('FLIPCARD')) {
                                    const possibleKeys = ['flipCardInfo', 'filpCardInfo', 'flipCardAudioInfo', 'filpCardAudioInfo', 'flipCardVideoInfo', 'filpCardVideoInfo'];
                                    let flipInfo = null;
                                    for (const key of possibleKeys) {
                                        if (json[key]) { flipInfo = json[key]; break; }
                                        if (json.bodys && json.bodys[key]) { flipInfo = json.bodys[key]; break; }
                                    }
                                    const qText = flipInfo?.question || json.question || '（无法解析的问题内容）';
                                    let aContent = flipInfo?.answer || json.answer || '';
                                    let ansHtml = '';
                                    if (msgType === 'FLIPCARD' || (jsonType === 'FLIPCARD' && typeof aContent === 'string' && !aContent.includes('url'))) {
                                        ansHtml = `<div style="font-size:14px; color:var(--text); line-height:1.6; padding:0 4px;">${safeStr(aContent)}</div>`;
                                    } else {
                                        try {
                                            const ansObj = typeof aContent === 'string' ? JSON.parse(aContent) : aContent;
                                            if (ansObj && ansObj.url) {
                                                let mediaUrl = ansObj.url.startsWith('http') ? ansObj.url : `https://mp4.48.cn${ansObj.url.startsWith('/') ? '' : '/'}${ansObj.url}`;
                                                const mType = (msgType.includes('AUDIO') || jsonType.includes('AUDIO')) ? 'audio' : 'video';
                                                ansHtml = `<div class="preview-media-placeholder" data-type="${mType}" data-src="${mediaUrl}" style="margin-top:8px;"></div>`;
                                            }
                                        } catch (e) { window.YayaRendererUtils.reportIgnoredError(e, 'src/renderer/followed-chat-feature.js'); }
                                    }
                                    txt = `<div style="margin-bottom: 8px;">
                                                <span class="flip-label question-tag" style="margin-right:8px; transform:none; display:inline-flex;">翻牌提问</span>
                                                <span style="font-size:14px; color:var(--text); line-height: 1.5;">${safeStr(qText)}</span>
                                           </div>
                                           <div style="margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 8px;">
                                                <span class="flip-label answer-tag" style="margin-right:8px; transform:none; display:inline-flex;">成员回答</span>
                                                ${ansHtml}
                                           </div>`;
                                } else if (msgType === 'LIVEPUSH' || msgType === 'LIVE_PUSH' || jsonType === 'LIVEPUSH') {
                                    const info = json.livePushInfo || json;
                                    const liveTitle = safeStr(info.liveTitle || '直播开始了');
                                    const liveId = info.liveId;
                                    const cover = info.liveCover ? (info.liveCover.startsWith('http') ? info.liveCover : `https://source.48.cn${info.liveCover}`) : './icon.png';
                                    const d = new Date(m.msgTime);
                                    const pad = (n) => String(n).padStart(2, '0');
                                    const tStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                                    const escapedTitle = liveTitle.replace(/'/g, "\\'");
                                    const escapedName = safeStr(displayName).replace(/'/g, "\\'");
                                    txt = `<div class="vod-card-row" style="margin-top: 8px; width: 100%; box-sizing: border-box; background: var(--bg); border: 1px solid var(--border); box-shadow: none; ${liveId ? 'cursor: pointer;' : 'cursor: default;'}" 
                                         ${liveId ? `onclick="event.stopPropagation(); playSharedLiveFromMessage('${liveId}', '${escapedName}', '${tStr}', '${escapedTitle}')"` : ''}>
                                        <div class="vod-row-cover-container" style="width: 100px; height: 56px; border-radius: 6px;">
                                            <img src="${cover}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">
                                            <div class="vod-badge" style="bottom: 4px; right: 4px; background-color: #722ed1;">通知</div>
                                        </div>
                                        <div class="vod-row-info" style="height: 56px; justify-content: space-between;">
                                            <div class="vod-row-name" style="font-size: 14px; color: var(--text);">${safeStr(displayName)}</div>
                                            <div class="vod-row-title" style="font-size: 12px; color: var(--text-sub);">${liveTitle}</div>
                                            <div class="vod-row-time" style="font-size: 11px; color: var(--text-sub); opacity: 0.6;">${tStr}</div>
                                        </div>
                                    </div>`;
                                } else if (msgType === 'SHARE_LIVE' || jsonType === 'SHARE_LIVE') {
                                    const info = json.shareInfo || {};
                                    const shareTitle = safeStr(info.shareTitle || '直播分享');
                                    const shareDesc = safeStr(info.shareDesc || '');
                                    const liveUserName = safeStr(info.liveUserName || displayName || '');
                                    const sharePicRaw = info.sharePic || '';
                                    const sharePic = sharePicRaw
                                        ? (sharePicRaw.startsWith('http') ? sharePicRaw : `https://source.48.cn${sharePicRaw}`)
                                        : './icon.png';
                                    let sharedLiveId = '';
                                    if (info.jumpPath) {
                                        const match = String(info.jumpPath).match(/id=(\d+)/);
                                        if (match) sharedLiveId = match[1];
                                    }

                                    const escapedTitle = shareTitle.replace(/'/g, "\\'");
                                    const escapedName = liveUserName.replace(/'/g, "\\'");
                                    const shareTime = shareDesc || fallbackTimeStr;

                                    txt = `<div class="vod-card-row" style="margin-top: 8px; width: 100%; box-sizing: border-box; background: var(--bg); border: 1px solid var(--border); box-shadow: none; ${sharedLiveId ? 'cursor: pointer;' : 'cursor: default;'}"
                                         ${sharedLiveId ? `onclick="event.stopPropagation(); playSharedLiveFromMessage('${sharedLiveId}', '${escapedName}', '${shareTime}', '${escapedTitle}')"` : ''}>
                                        <div class="vod-row-cover-container" style="width: 100px; height: 56px; border-radius: 6px;">
                                            <img src="${sharePic}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;" onerror="this.src='./icon.png'">
                                            <div class="vod-badge" style="bottom: 4px; right: 4px; background-color: #722ed1;">分享</div>
                                        </div>
                                        <div class="vod-row-info" style="height: 56px; justify-content: space-between;">
                                            <div class="vod-row-name" style="font-size: 14px; color: var(--text);">${liveUserName || safeStr(displayName)}</div>
                                            <div class="vod-row-title" style="font-size: 12px; color: var(--text-sub);">${shareTitle}</div>
                                            <div class="vod-row-time" style="font-size: 11px; color: var(--text-sub); opacity: 0.6;">${shareTime}</div>
                                        </div>
                                    </div>`;
                                } else if (jsonType.startsWith('RED_PACKET')) {
                                    const blessMessage = safeStr(json.blessMessage || '送来了红包祝福');
                                    const creatorName = safeStr(json.creatorName || displayName || '未知用户');
                                    const starName = safeStr(json.starName || '');
                                    const packetImageRaw = json.openImgUrl || json.coverUrl || '';
                                    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
                                    const packetMainTextColor = isDarkTheme ? 'rgba(255,255,255,0.96)' : 'var(--text)';
                                    const packetMetaTextColor = isDarkTheme ? 'rgba(255,255,255,0.82)' : 'var(--text)';
                                    const packetImage = packetImageRaw
                                        ? (packetImageRaw.startsWith('http') ? packetImageRaw : `https://source.48.cn${packetImageRaw}`)
                                        : './icon.png';
                                    txt = `<div style="display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:10px; background: linear-gradient(135deg, rgba(255,120,117,0.12) 0%, rgba(255,120,117,0.04) 100%), var(--input-bg); border:1px solid rgba(255,120,117,0.22); width: 220px; max-width: 220px; box-sizing: border-box;">
                                        <img src="${packetImage}" style="width:34px; height:34px; object-fit:cover; border-radius:6px; flex-shrink:0; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
                                        <div style="min-width:0; flex:1;">
                                            <div style="font-size:10px; color:#ff7875; font-weight:bold; margin-bottom:2px;">红包</div>
                                            <div style="font-size:12px; color:${packetMainTextColor}; font-weight:bold; line-height:1.35; word-break:break-word;">${blessMessage}</div>
                                            <div style="font-size:11px; color:${packetMetaTextColor}; margin-top:4px; line-height:1.35; word-break:break-word;">${creatorName}${starName ? ` · ${starName}` : ''}</div>
                                        </div>
                                    </div>`;
                                } else if (
                                    msgType === 'AUDIO_GIFT_REPLY' ||
                                    jsonType === 'AUDIO_GIFT_REPLY' ||
                                    msgType === 'AUDIO_REPLY' ||
                                    jsonType === 'AUDIO_REPLY'
                                ) {
                                    const info = json.replyInfo || json.giftReplyInfo || json;
                                    let voiceUrl = info.voiceUrl || '';
                                    if (voiceUrl && !voiceUrl.startsWith('http')) {
                                        voiceUrl = `https://mp4.48.cn${voiceUrl.startsWith('/') ? '' : '/'}${voiceUrl}`;
                                    }
                                    const rName = safeStr(info.replyName || '未知用户');
                                    const rText = safeStr(info.replyText || '');
                                    txt = '';
                                    extraHtml = `<div class="preview-media-placeholder" data-type="audio" data-src="${voiceUrl}" style="margin: 0 0 12px 0;"></div>
                                            <div style="background: var(--blockquote-bg); padding: 8px 12px; border-radius: 6px; border-left: 3px solid var(--border); margin: 0 0 8px 0; color: var(--text-sub); font-size: 13px; line-height: 1.5;">
                                                ${rName}：${rText}
                                            </div>`;
                                } else {
                                    txt = `<p class="mb-2 template-pre">${safeStr(body)}</p>`;
                                }
                            } else {
                                txt = `<p class="mb-2 template-pre">${safeStr(body)}</p>`;
                            }
                            if (typeof replaceTencentEmoji === 'function' && txt) txt = replaceTencentEmoji(txt);
                        } catch (e) {
                            txt = `<p class="mb-2 template-pre" style="color: #fa8c16;">[原生内容] ${safeStr(body)}</p>`;
                        }

                        const timeStr = fallbackTimeStr;

                        const nameColorVar = String(senderId) === '121569667'
                            ? '#056de8'
                            : (isMember ? 'var(--msg-name-member)' : 'var(--msg-name-fan)');

                        return `
    <div class="msg-item" data-msgid="${msgId}" style="display: flex; padding: 8px 0; border-bottom: 1px solid var(--border);">
        <button type="button" class="followed-message-avatar-btn" title="查看用户主页"
                onclick="openFollowedUserProfile(${toFollowedInlineArg(senderId)}, ${toFollowedInlineArg(displayName)}, ${toFollowedInlineArg(avatarUrl)}, ${isMember ? 'true' : 'false'})">
            <img src="${avatarUrl}" class="avatar" alt="" onerror="this.src='./icon.png'">
        </button>
        <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; margin-bottom: 2px;">
                <span style="color: ${nameColorVar}; font-weight: bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 75%;">
                    ${safeStr(displayName)}
                </span>
                
                <span style="margin-left: auto; color: var(--text-sub); font-size: 10px; opacity: 0.5; flex-shrink: 0;">
                    ${timeStr}
                </span>
            </div>
            <div style="color: var(--text); font-size: 13.5px; line-height: 1.4; word-break: break-all; margin-top: 2px;">
                ${txt}
                ${extraHtml}
            </div>
        </div>
   </div>`;
                    }).join('');

                    if (isAutoRefresh && !batchHtml) {
                        return;
                    }

                    if (isLoadMore && !batchHtml) {
                        activeFollowedNextTime = 0;
                        return;
                    }

                    const shouldAutoScrollNow = !isAutoRefresh || canFollowedAutoScroll(msgBox);
                    if (isAutoRefresh && !shouldAutoScrollNow) {
                        queueFollowedPendingBatch(batchHtml, batchMessageIds);
                        return;
                    }

                    removeFollowedEmptyState(msgBox);
                    const fragment = document.createRange().createContextualFragment(batchHtml);

                    if (isLoadMore) {
                        msgBox.prepend(fragment);
                        if (!restoreFollowedPrependAnchor(msgBox, prependAnchor)) {
                            const newScrollTop = msgBox.scrollHeight - oldScrollHeight;
                            msgBox.scrollTop = newScrollTop <= 0 ? 1 : newScrollTop;
                            followedLastScrollTop = msgBox.scrollTop;
                        }
                    } else {
                        msgBox.appendChild(fragment);
                        if (shouldAutoScrollNow) {
                            scrollFollowedToBottom(msgBox, isAutoRefresh);
                        }
                    }

                    if (activeFollowedNextTime > 0) {
                        const oldTip = document.getElementById('btn-load-more-followed');
                        if (oldTip) oldTip.remove();
                    }

                    hydrateFollowedPreviewMedia(msgBox);
                }
            } catch (e) {
                if (requestRevision === followedChatRequestRevision) {
                    console.error(e);
                    if (!isAutoRefresh && !isLoadMore) {
                        msgBox.innerHTML = '<div class="empty-state" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text-sub); font-size: 14px;">消息加载失败，请重新选择房间重试</div>';
                    }
                }
            } finally {
                if (requestRevision === followedChatRequestRevision) {
                    isFollowedChatLoading = false;

                    const msgBox = document.getElementById('followed-chat-messages');
                    if (!isAutoRefresh) {
                        msgBox.style.opacity = '1';
                        msgBox.style.pointerEvents = 'auto';
                    }

                    if (activeFollowedNextTime && msgBox.scrollTop < 100) {
                        window.requestAnimationFrame(() => {
                            if (requestRevision !== followedChatRequestRevision
                                || isFollowedChatLoading
                                || !activeFollowedNextTime) return;
                            const currentMsgBox = document.getElementById('followed-chat-messages');
                            if (currentMsgBox && currentMsgBox.scrollTop < 100) {
                                loadFollowedChatPage(true, false, requestRevision);
                            }
                        });
                    }
                }
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            const followedMsgBox = document.getElementById('followed-chat-messages');
            if (followedMsgBox) {
                followedMsgBox.addEventListener('wheel', function (event) {
                    if (event.deltaY < 0) {
                        lockFollowedAutoScroll();
                    }
                }, { passive: true });

                let followedTouchStartY = 0;
                followedMsgBox.addEventListener('touchstart', function (event) {
                    followedTouchStartY = event.touches && event.touches[0] ? event.touches[0].clientY : 0;
                }, { passive: true });

                followedMsgBox.addEventListener('touchmove', function (event) {
                    const currentY = event.touches && event.touches[0] ? event.touches[0].clientY : 0;
                    if (currentY > followedTouchStartY + 4) {
                        lockFollowedAutoScroll();
                    }
                }, { passive: true });

                followedMsgBox.addEventListener('scroll', function () {
                    updateFollowedScrollStickState(this);

                    if (followedPendingCount > 0 && canFollowedAutoScroll(this)) {
                        flushFollowedPendingMessages();
                        return;
                    }

                    if (isFollowedChatLoading || !activeFollowedNextTime || activeFollowedNextTime === 0) return;

                    if (this.scrollTop < 100) {
                        loadFollowedChatPage(true);
                    }
                });
            }

            document.addEventListener('keydown', function (event) {
                const followedMsgBox = document.getElementById('followed-chat-messages');
                const view = document.getElementById('view-followed-rooms');
                if (!followedMsgBox || !view || view.style.display === 'none') return;

                if (event.key === 'PageUp' || event.key === 'ArrowUp') {
                    lockFollowedAutoScroll();
                }
            });
        });


        function getActiveFollowedChannel() {
            return activeFollowedChannel;
        }

        return {
            backToFollowedRoomList,
            backFollowedUserProfile,
            closeFollowedUserProfile,
            deleteFollowedProfileDynamicComment,
            flushFollowedPendingMessages,
            getActiveFollowedChannel,
            jumpToFullRoom,
            loadFollowedChatPage,
            openFollowedChat,
            openFollowedProfilePrivateMessage,
            openFollowedProfileRoom,
            openFollowedProfileVideo,
            openFollowedUserProfile,
            loadMoreFollowedProfileDynamicComments,
            openActiveFollowedFlipQuestion,
            openActiveFollowedRoomAlbum,
            playSharedLiveFromMessage,
            sendFollowedProfileDynamicComment,
            closeFollowedProfileVideo,
            switchFollowedUserProfileTab,
            toggleFollowedProfileDynamicComments,
            toggleFollowedProfileFollow,
            toggleFollowedChatMode,
            toggleFollowedRoomType
        };
    };
})();
