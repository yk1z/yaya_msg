(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createPerformanceFeature = function createPerformanceFeature(deps) {
        const {
            getAppToken,
            getMemberData,
            getMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle,
            ipcRenderer,
            openBilibiliLiveGroup,
            playOpenLiveVideo,
            showToast
        } = deps;

        const state = {
            initialized: false,
            loading: false,
            items: [],
            next: '0',
            hasMore: true,
            group: 'all',
            team: 'all',
            query: '',
            dateSearchCursor: '',
            dateSearchItems: null,
            dateSearchComplete: false,
            searchRevision: 0,
            memberId: '',
            memberName: '',
            memberTeam: '',
            memberGroup: '',
            memberItems: null,
            memberLoading: false,
            memberRequestId: 0,
            autoLoadPaused: false
        };

        let autoLoadObserver = null;
        let autoLoadFrame = 0;
        let autoLoadScrollRoot = null;
        let directOpenRequestId = 0;
        const AUTO_LOAD_PAGE_BATCH = 4;
        const FAST_SEARCH_PAGE_BATCH = 12;
        const MEMBER_RECORD_RENDER_BATCH = 4;
        const MEMBER_RECORD_PAGE_LIMIT = 200;
        let memberSuggestionRequestId = 0;
        const GROUPS = Object.freeze({
            snh: 'SNH48',
            gnz: 'GNZ48',
            bej: 'BEJ48',
            ckg: 'CKG48',
            cgt: 'CGT48',
            other: '其它'
        });
        const GROUP_IDS = Object.freeze({
            10: 'snh',
            11: 'bej',
            12: 'gnz',
            14: 'ckg',
            21: 'cgt'
        });

        function normalizeMediaUrl(value) {
            const raw = String(value || '').trim();
            if (!raw) return './icon.png';
            if (window.YayaRendererUtils?.normalize48Url) {
                return window.YayaRendererUtils.normalize48Url(raw, 'https://source.48.cn') || './icon.png';
            }
            return /^https?:\/\//i.test(raw) ? raw : `https://source.48.cn${raw.startsWith('/') ? '' : '/'}${raw}`;
        }

        function getPerformanceMemberResultBox() {
            return document.getElementById('performance-member-results');
        }

        function hidePerformanceMemberResults() {
            const resultBox = getPerformanceMemberResultBox();
            if (resultBox) resultBox.style.display = 'none';
        }

        function resetPerformanceMemberSelection() {
            state.memberRequestId += 1;
            state.memberId = '';
            state.memberName = '';
            state.memberTeam = '';
            state.memberGroup = '';
            state.memberItems = null;
            state.memberLoading = false;
            state.dateSearchCursor = getPerformanceDateSearchCursor(state.query);
            state.dateSearchItems = state.dateSearchCursor ? [] : null;
            state.dateSearchComplete = false;
            state.autoLoadPaused = false;
        }

        function renderPerformanceMemberResults(matches) {
            const resultBox = getPerformanceMemberResultBox();
            if (!resultBox) return;
            resultBox.replaceChildren();
            if (!matches.length) {
                resultBox.style.display = 'none';
                return;
            }

            const fragment = document.createDocumentFragment();
            matches.slice(0, 40).forEach(member => {
                const name = String(member?.ownerName || member?.name || '').trim();
                const team = String(member?.team || '').trim();
                const isInactive = member?.isInGroup === false;
                const option = document.createElement('div');
                option.className = 'suggestion-item';
                option.style.display = 'flex';
                option.style.alignItems = 'center';
                option.style.justifyContent = 'space-between';
                option.style.gap = '10px';

                const nameElement = document.createElement('span');
                nameElement.textContent = name;
                nameElement.style.fontWeight = '700';
                if (isInactive) nameElement.style.opacity = '0.6';
                option.appendChild(nameElement);

                if (team) {
                    const teamElement = document.createElement('span');
                    teamElement.className = 'team-tag';
                    teamElement.textContent = team;
                    if (typeof getTeamStyle === 'function') {
                        teamElement.style.cssText = getTeamStyle(team, isInactive) || '';
                    }
                    if (isInactive) teamElement.style.opacity = '0.6';
                    option.appendChild(teamElement);
                }

                option.addEventListener('click', () => selectPerformanceMember(member));
                fragment.appendChild(option);
            });
            resultBox.appendChild(fragment);
            resultBox.style.display = 'block';
        }

        async function handlePerformanceMemberSearch(keyword) {
            const value = String(keyword || '').trim();
            const requestId = ++memberSuggestionRequestId;
            if (state.memberId && value !== state.memberName) {
                resetPerformanceMemberSelection();
                renderPerformanceList();
                schedulePerformanceAutoLoad();
            }
            if (!value) {
                hidePerformanceMemberResults();
                return;
            }

            try {
                if (!getMemberDataLoaded?.() && typeof loadMemberData === 'function') {
                    await loadMemberData();
                }
                if (requestId !== memberSuggestionRequestId) return;
                const lowerKeyword = value.toLocaleLowerCase();
                const members = Array.isArray(getMemberData?.()) ? getMemberData() : [];
                const matches = members.filter(member => {
                    const name = String(member?.ownerName || member?.name || '');
                    const pinyin = String(member?.pinyin || '');
                    const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : '';
                    return name.includes(value)
                        || pinyin.toLocaleLowerCase().includes(lowerKeyword)
                        || String(initials).toLocaleLowerCase().includes(lowerKeyword);
                });
                if (typeof memberSortLogic === 'function') matches.sort(memberSortLogic);
                renderPerformanceMemberResults(matches);
            } catch (error) {
                console.error('[公演列表] 成员搜索失败:', error);
                hidePerformanceMemberResults();
            }
        }

        function inferPerformanceGroup(item) {
            const directGroup = [
                item?.groupName,
                item?.group,
                item?.starGroupName,
                item?.seineGroupName,
                item?.groupInfo?.name,
                item?.openLiveInfo?.groupName,
                item?.openLiveInfo?.group
            ].map(value => String(value || '').toLowerCase()).find(value => /(snh|gnz|bej|ckg|cgt)(?:48)?/i.test(value));
            if (directGroup) {
                const directMatch = directGroup.match(/(snh|gnz|bej|ckg|cgt)(?:48)?/i);
                if (directMatch) return directMatch[1].toLowerCase();
            }

            const directGroupId = [
                item?.groupId,
                item?.starGroupId,
                item?.seineGroupId,
                item?.groupInfo?.id,
                item?.openLiveInfo?.groupId,
                item?.openLiveInfo?.starGroupId
            ].map(value => String(value || '').trim()).find(value => Object.prototype.hasOwnProperty.call(GROUP_IDS, value));
            if (directGroupId) return GROUP_IDS[directGroupId];

            const teamGroupMap = {
                'TEAM SII': 'snh',
                'TEAM NII': 'snh',
                'TEAM HII': 'snh',
                'TEAM X': 'snh',
                'TEAM XII': 'snh',
                'TEAM FT': 'snh',
                'TEAM G': 'gnz',
                'TEAM NIII': 'gnz',
                'TEAM Z': 'gnz',
                'TEAM B': 'bej',
                'TEAM E': 'bej',
                'TEAM J': 'bej',
                'TEAM C': 'ckg',
                'TEAM K': 'ckg',
                'TEAM Q': 'ckg',
                'TEAM CII': 'cgt',
                'TEAM GII': 'cgt'
            };
            const inferredTeam = inferPerformanceTeam(item);
            if (teamGroupMap[inferredTeam]) return teamGroupMap[inferredTeam];

            const source = `${item?.teamLogo || ''} ${item?.cover || ''} ${item?.title || ''}`.toLowerCase();
            if (source.includes('snh48')) return 'snh';
            if (source.includes('gnz48')) return 'gnz';
            if (source.includes('bej48')) return 'bej';
            if (source.includes('ckg48')) return 'ckg';
            if (source.includes('cgt48')) return 'cgt';

            const logoMatch = source.match(/\/(snh|gnz|bej|ckg|cgt)(?:48)?[_/.-]/i);
            return logoMatch ? logoMatch[1].toLowerCase() : 'other';
        }

        function normalizePerformanceTeam(value) {
            if (typeof value !== 'string') return '';
            const raw = String(value || '').trim();
            if (!raw) return '';
            const upper = raw.toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (/^(SNH|GNZ|BEJ|CKG|CGT)48$/.test(upper)) return '';
            if (upper === '联合' || /JOINT|COMBINED/.test(upper)) return '其它';
            if (upper === '其它' || upper === '其他' || upper === 'OTHER') return '其它';
            if (upper === '预备生' || /YOUTH|TRAINEE|RESERVE|PRE/.test(upper)) return '预备生';
            const codeMatch = upper.match(/(?:^|\s)(?:TEAM\s*)?(SII|NII|HII|XII|X|FT|NIII|GII|CII|G|Z|B|E|J|K|C|Q)(?:$|\s)/);
            return codeMatch ? `TEAM ${codeMatch[1]}` : '';
        }

        function inferPerformanceTeam(item) {
            const teamLogo = String(item?.teamLogo || '').toLowerCase();
            const logoPatterns = [
                [/snh48[_/.-]?s2|team\s*sii\b/i, 'TEAM SII'],
                [/snh48[_/.-]?n2|team\s*nii\b/i, 'TEAM NII'],
                [/snh48[_/.-]?h2|team\s*hii\b/i, 'TEAM HII'],
                [/snh48[_/.-]?xii|team\s*xii\b/i, 'TEAM XII'],
                [/snh48[_/.-]?ft|team\s*ft\b/i, 'TEAM FT'],
                [/snh48[_/.-]?x(?:[^a-z]|$)|team\s*x\b/i, 'TEAM X'],
                [/gnz(?:48)?[_/.-]?n3|team\s*niii\b/i, 'TEAM NIII'],
                [/gnz(?:48)?[_/.-]?g(?:[^a-z]|$)|team\s*g\b/i, 'TEAM G'],
                [/gnz(?:48)?[_/.-]?z(?:[^a-z]|$)|team\s*z\b/i, 'TEAM Z'],
                [/bej(?:48)?[_/.-]?b(?:[^a-z]|$)|team\s*b\b/i, 'TEAM B'],
                [/bej(?:48)?[_/.-]?e(?:[^a-z]|$)|team\s*e\b/i, 'TEAM E'],
                [/bej(?:48)?[_/.-]?j(?:[^a-z]|$)|team\s*j\b/i, 'TEAM J'],
                [/ckg(?:48)?[_/.-]?k(?:[^a-z]|$)|team\s*k\b/i, 'TEAM K'],
                [/ckg(?:48)?[_/.-]?c(?:[^a-z]|$)|team\s*c\b/i, 'TEAM C'],
                [/ckg(?:48)?[_/.-]?q(?:[^a-z]|$)|team\s*q\b/i, 'TEAM Q'],
                [/cgt(?:48)?[_/.-]?cii|7qwq0z2kvtmpumdxeqsv6c3\.png|team\s*cii\b/i, 'TEAM CII'],
                [/cgt(?:48)?[_/.-]?gii|4gskw7gl929o9291nfpso16\.png|team\s*gii\b/i, 'TEAM GII'],
                [/(?:yb|youth|trainee|reserve|pre)(?:[^a-z]|$)|预备生/i, '预备生']
            ];
            const logoMatch = logoPatterns.find(([pattern]) => pattern.test(teamLogo));
            if (logoMatch) return logoMatch[1];

            const directTeam = [
                item?.teamName,
                item?.team,
                item?.starTeamName,
                item?.openLiveInfo?.teamName,
                item?.openLiveInfo?.team
            ].map(normalizePerformanceTeam).find(Boolean);
            if (directTeam) return directTeam;

            return '其它';
        }

        function getPerformanceTimeParts(timestamp) {
            const value = Number(timestamp);
            if (!Number.isFinite(value) || value <= 0) return null;
            const date = new Date(value);
            const parts = new Intl.DateTimeFormat('zh-CN', {
                timeZone: 'Asia/Shanghai',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).formatToParts(date).reduce((result, part) => {
                result[part.type] = part.value;
                return result;
            }, {});
            parts.weekday = String(parts.weekday || '').replace('星期', '周');
            return parts;
        }

        function formatPerformanceTime(timestamp) {
            const parts = getPerformanceTimeParts(timestamp);
            if (!parts) return '时间待定';
            return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}${parts.weekday ? ` ${parts.weekday}` : ''}`;
        }

        function getPerformanceDateSearchTerms(timestamp) {
            const parts = getPerformanceTimeParts(timestamp);
            if (!parts) return [];
            const month = String(Number(parts.month));
            const day = String(Number(parts.day));
            return [
                `${parts.year}-${parts.month}-${parts.day}`,
                `${parts.year}-${month}-${day}`,
                `${parts.year}/${parts.month}/${parts.day}`,
                `${parts.year}/${month}/${day}`,
                `${parts.year}.${parts.month}.${parts.day}`,
                `${parts.year}.${month}.${day}`,
                `${parts.year}年${month}月${day}日`,
                `${parts.year}年${month}月${day}号`,
                `${parts.year}${parts.month}${parts.day}`,
                `${parts.month}-${parts.day}`,
                `${month}-${day}`,
                `${parts.month}/${parts.day}`,
                `${month}/${day}`,
                `${parts.month}.${parts.day}`,
                `${month}.${day}`,
                `${parts.month}${parts.day}`,
                `${month}月${day}日`,
                `${month}月${day}号`,
                `${month}月${day}`,
                `${parts.hour}:${parts.minute}`,
                `${parts.hour}${parts.minute}`,
                `${parts.hour}时${parts.minute}分`,
                parts.weekday
            ].filter(Boolean);
        }

        function getPerformanceDateSearchCursor(query) {
            const value = String(query || '').trim();
            const separated = value.match(/(?:^|\D)(\d{4})(?:[-/.]|年)(\d{1,2})(?:[-/.]|月)(\d{1,2})(?:日|号)?(?:\D|$)/);
            const compact = separated ? null : value.match(/(?:^|\D)(\d{4})(\d{2})(\d{2})(?:\D|$)/);
            const match = separated || compact;
            if (!match) return '';

            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            const testDate = new Date(Date.UTC(year, month - 1, day));
            if (testDate.getUTCFullYear() !== year
                || testDate.getUTCMonth() !== month - 1
                || testDate.getUTCDate() !== day) return '';

            return String(Date.UTC(year, month - 1, day, 16));
        }

        function parsePerformanceMemberRecord(item) {
            let info = {};
            try {
                const safeExtInfo = String(item?.extInfo || '').replace(/:\s*([0-9]{16,})/g, ': "$1"');
                info = JSON.parse(safeExtInfo);
            } catch (error) {
                return null;
            }

            const liveId = String(info?.liveId || info?.id || '').trim();
            if (!liveId) return null;
            const nickname = String(info?.user?.nickname || state.memberName || '').trim();
            return {
                title: String(info?.title || '未知公演'),
                cover: String(info?.coverUrl || info?.cover || ''),
                businessId: liveId,
                startTime: item?.msgTime || info?.startTime || 0,
                groupName: state.memberGroup || nickname,
                teamName: state.memberTeam,
                openLiveInfo: {
                    id: String(info?.id || liveId),
                    liveId,
                    status: 0
                }
            };
        }

        function mergePerformanceMemberItems(items) {
            const source = Array.isArray(state.memberItems) ? state.memberItems.slice() : [];
            const known = new Set(source.map(getPerformanceItemKey));
            items.forEach(item => {
                const key = getPerformanceItemKey(item);
                if (!known.has(key)) {
                    known.add(key);
                    source.push(item);
                }
            });
            state.memberItems = source;
        }

        async function loadPerformanceMemberRecords(member) {
            const memberId = String(member?.id || member?.userId || member?.memberId || member?.ownerId || '').trim();
            const memberName = String(member?.ownerName || member?.name || '').trim();
            if (!memberId) {
                if (typeof showToast === 'function') showToast('该成员缺少用户 ID');
                return;
            }

            const token = getAppToken ? getAppToken() : '';
            if (!token) {
                if (typeof showToast === 'function') showToast('请先登录账号');
                return;
            }

            const requestId = state.memberRequestId + 1;
            state.memberRequestId = requestId;
            state.memberId = memberId;
            state.memberName = memberName;
            state.memberTeam = String(member?.team || member?.teamName || '').trim();
            state.memberGroup = String(member?.groupName || member?.group || '').trim();
            state.memberItems = [];
            state.memberLoading = true;
            state.group = 'all';
            state.team = 'all';
            state.dateSearchCursor = '';
            state.dateSearchItems = null;
            state.dateSearchComplete = false;
            state.autoLoadPaused = false;
            renderPerformanceList();

            try {
                const pa = window.getPA ? window.getPA() : null;
                let cursor = '0';
                const seenCursors = new Set();

                for (let page = 0; page < MEMBER_RECORD_PAGE_LIMIT; page += 1) {
                    const result = await ipcRenderer.invoke('fetch-open-live', {
                        token,
                        pa,
                        memberId,
                        nextTime: cursor
                    });
                    if (requestId !== state.memberRequestId) return;
                    if (!result?.success || !result.content) {
                        throw new Error(result?.msg || '成员公演记录返回异常');
                    }

                    const records = Array.isArray(result.content.message) ? result.content.message : [];
                    mergePerformanceMemberItems(records.map(parsePerformanceMemberRecord).filter(Boolean));
                    if (page === 0 || (page + 1) % MEMBER_RECORD_RENDER_BATCH === 0) {
                        renderPerformanceList();
                    }

                    const nextCursor = String(result.content.nextTime || '0');
                    if (!records.length || nextCursor === '0' || nextCursor === cursor || seenCursors.has(nextCursor)) break;
                    seenCursors.add(nextCursor);
                    cursor = nextCursor;
                }
            } catch (error) {
                console.error('[公演列表] 加载成员公演失败:', error);
                if (requestId === state.memberRequestId && typeof showToast === 'function') {
                    const message = window.YayaRendererUtils?.getErrorMessage
                        ? window.YayaRendererUtils.getErrorMessage(error, '请稍后重试')
                        : String(error?.message || error || '请稍后重试');
                    showToast(`成员公演加载失败：${message}`);
                }
            } finally {
                if (requestId === state.memberRequestId) {
                    state.memberLoading = false;
                    renderPerformanceList();
                }
            }
        }

        function selectPerformanceMember(member) {
            const input = document.getElementById('performance-member-input');
            const name = String(member?.ownerName || member?.name || '').trim();
            memberSuggestionRequestId += 1;
            if (input) input.value = name;
            hidePerformanceMemberResults();
            void loadPerformanceMemberRecords(member);
        }

        function getPerformanceStatus(item) {
            const status = Number(item?.openLiveInfo?.status);
            if (status === 2) return { label: '直播中', className: 'is-live' };
            if (status === 1) return { label: '即将开始', className: 'is-upcoming' };
            return { label: '已结束', className: 'is-ended' };
        }

        function appendTextElement(parent, tagName, className, text) {
            const element = document.createElement(tagName);
            element.className = className;
            element.textContent = String(text || '');
            parent.appendChild(element);
            return element;
        }

        function getPerformanceParticipantPageId(item) {
            return String(
                item?.openLiveInfo?.id
                || item?.openLiveInfo?.liveId
                || item?.businessId
                || ''
            ).trim();
        }

        function getPerformanceItemKey(item) {
            return String(item?.businessId || `${item?.title || ''}:${item?.startTime || ''}`);
        }

        function openPerformanceItem(item) {
            const groupKey = inferPerformanceGroup(item);
            const isLivePerformance = Number(item?.openLiveInfo?.status) === 2;
            if (isLivePerformance) {
                Promise.resolve(openBilibiliLiveGroup(groupKey)).catch(error => {
                    console.error('[公演列表] 打开B站直播失败:', error);
                    showToast('B站直播页面打开失败，请稍后重试');
                });
                return;
            }

            const liveId = String(item?.businessId || '').trim();
            if (!liveId) {
                showToast('该场公演缺少播放信息');
                return;
            }
            if (typeof window.syncWebPerformanceRoute === 'function') {
                window.syncWebPerformanceRoute(liveId);
            }

            const groupName = GROUPS[groupKey] || '公演';
            playOpenLiveVideo(
                liveId,
                String(item?.title || '未命名公演'),
                groupName,
                item?.startTime,
                getPerformanceParticipantPageId(item),
                'performance',
                false,
                groupKey
            );
        }

        function findPerformanceItemById(performanceId) {
            return [
                ...(Array.isArray(state.items) ? state.items : []),
                ...(Array.isArray(state.dateSearchItems) ? state.dateSearchItems : []),
                ...(Array.isArray(state.memberItems) ? state.memberItems : [])
            ].find(entry => String(entry?.businessId || '') === performanceId) || null;
        }

        function normalizePerformanceDetail(content, performanceId) {
            if (!content || typeof content !== 'object') return null;

            const liveInfo = content.openLiveInfo && typeof content.openLiveInfo === 'object'
                ? content.openLiveInfo
                : (content.liveInfo && typeof content.liveInfo === 'object' ? content.liveInfo : content);
            const user = liveInfo.user && typeof liveInfo.user === 'object'
                ? liveInfo.user
                : (content.user && typeof content.user === 'object' ? content.user : {});
            const liveId = String(
                liveInfo.liveId
                || liveInfo.businessId
                || content.liveId
                || content.businessId
                || performanceId
            ).trim();
            const participantPageId = String(
                liveInfo.id
                || content.id
                || liveId
            ).trim();

            return {
                ...content,
                businessId: liveId,
                title: String(
                    liveInfo.title
                    || liveInfo.liveTitle
                    || content.title
                    || content.liveTitle
                    || '公演'
                ),
                cover: String(
                    liveInfo.cover
                    || liveInfo.coverUrl
                    || liveInfo.coverPath
                    || content.cover
                    || content.coverUrl
                    || content.coverPath
                    || ''
                ),
                startTime: liveInfo.startTime
                    || liveInfo.liveStartTime
                    || content.startTime
                    || content.liveStartTime
                    || 0,
                groupName: liveInfo.groupName
                    || content.groupName
                    || user.groupName
                    || '',
                groupId: liveInfo.groupId
                    || content.groupId
                    || user.groupId
                    || '',
                teamName: liveInfo.teamName
                    || content.teamName
                    || user.teamName
                    || '',
                teamLogo: liveInfo.teamLogo
                    || content.teamLogo
                    || '',
                openLiveInfo: {
                    ...(content.openLiveInfo && typeof content.openLiveInfo === 'object'
                        ? content.openLiveInfo
                        : liveInfo),
                    id: participantPageId,
                    liveId,
                    status: Number(liveInfo.status ?? content.status ?? 0)
                }
            };
        }

        async function loadAndOpenPerformanceById(performanceId, requestId) {
            const token = getAppToken ? getAppToken() : '';
            const pa = window.getPA ? window.getPA() : null;

            try {
                const result = await ipcRenderer.invoke('fetch-open-live-one', {
                    token,
                    pa,
                    liveId: performanceId
                });
                if (requestId !== directOpenRequestId) return;
                if (!result?.success || !result.content) {
                    throw new Error(result?.msg || '公演详情返回异常');
                }

                const item = normalizePerformanceDetail(result.content, performanceId);
                if (!item) throw new Error('公演详情为空');
                openPerformanceItem(item);
            } catch (error) {
                if (requestId !== directOpenRequestId) return;
                console.error('[公演列表] 按链接加载公演详情失败:', error);
                const fallbackItem = findPerformanceItemById(performanceId);
                if (fallbackItem) {
                    openPerformanceItem(fallbackItem);
                    return;
                }
                if (typeof showToast === 'function') {
                    showToast('公演信息加载失败，请返回列表后重试');
                }
            }
        }

        function openPerformanceById(performanceId) {
            const normalizedId = String(performanceId || '').trim();
            if (!/^[a-z0-9_-]{1,128}$/i.test(normalizedId)) return false;

            const item = findPerformanceItemById(normalizedId);
            if (item) {
                directOpenRequestId += 1;
                openPerformanceItem(item);
                return true;
            }

            const requestId = ++directOpenRequestId;
            void loadAndOpenPerformanceById(normalizedId, requestId);
            return true;
        }

        function createPerformanceCard(item) {
            const card = document.createElement('article');
            card.className = 'performance-card';
            card.dataset.performanceKey = getPerformanceItemKey(item);
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            const isLivePerformance = Number(item?.openLiveInfo?.status) === 2;
            card.setAttribute(
                'aria-label',
                `${isLivePerformance ? '进入B站直播' : '播放'} ${String(item?.title || '公演')}`
            );

            const visual = document.createElement('div');
            visual.className = 'performance-card-visual';

            const cover = document.createElement('img');
            cover.className = 'performance-card-cover';
            cover.src = normalizeMediaUrl(item?.cover);
            cover.alt = String(item?.title || '公演海报');
            cover.loading = 'lazy';
            cover.addEventListener('error', () => {
                if (!cover.src.endsWith('/icon.png') && !cover.src.endsWith('icon.png')) cover.src = './icon.png';
            }, { once: true });
            visual.appendChild(cover);

            const status = getPerformanceStatus(item);
            appendTextElement(visual, 'span', `performance-status ${status.className}`, status.label);

            const body = document.createElement('div');
            body.className = 'performance-card-body';

            const heading = document.createElement('div');
            heading.className = 'performance-card-heading';

            const groupKey = inferPerformanceGroup(item);
            appendTextElement(heading, 'span', 'performance-group-name', GROUPS[groupKey] || '公演');

            const logoUrl = String(item?.teamLogo || '').trim();
            if (logoUrl) {
                const logo = document.createElement('img');
                logo.className = 'performance-team-logo';
                logo.src = normalizeMediaUrl(logoUrl);
                logo.alt = '';
                logo.loading = 'lazy';
                logo.addEventListener('error', () => logo.remove(), { once: true });
                heading.appendChild(logo);
            }

            appendTextElement(body, 'h3', 'performance-card-title', item?.title || '未命名公演');
            body.appendChild(heading);

            const time = formatPerformanceTime(item?.startTime);
            const schedule = document.createElement('div');
            schedule.className = 'performance-card-schedule';
            appendTextElement(schedule, 'span', 'performance-card-date', time);

            body.appendChild(schedule);
            card.append(visual, body);
            const openPlayer = () => openPerformanceItem(item);
            card.addEventListener('click', openPlayer);
            card.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openPlayer();
            });
            return card;
        }

        function setPerformanceMessage(title, detail, actionLabel = '', action = null) {
            const container = document.getElementById('performance-list');
            if (!container) return;
            container.replaceChildren();

            const message = document.createElement('div');
            message.className = 'performance-empty-state';
            appendTextElement(message, 'h3', 'performance-empty-title', title);
            appendTextElement(message, 'p', 'performance-empty-detail', detail);
            if (actionLabel && typeof action === 'function') {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-secondary';
                button.textContent = actionLabel;
                button.addEventListener('click', action);
                message.appendChild(button);
            }
            container.appendChild(message);
        }

        function matchesPerformanceFilters(item) {
            if (state.group !== 'all' && inferPerformanceGroup(item) !== state.group) return false;
            if (state.team !== 'all' && inferPerformanceTeam(item) !== state.team) return false;
            if (!state.query) return true;
            const searchableText = [
                item?.title,
                formatPerformanceTime(item?.startTime),
                ...getPerformanceDateSearchTerms(item?.startTime)
            ].map(value => String(value || '').toLocaleLowerCase()).join(' ');
            return state.query.split(/\s+/).every(keyword => searchableText.includes(keyword));
        }

        function getPerformanceSourceItems() {
            if (Array.isArray(state.memberItems)) return state.memberItems;
            return Array.isArray(state.dateSearchItems) ? state.dateSearchItems : state.items;
        }

        function getVisibleItems() {
            return getPerformanceSourceItems().filter(matchesPerformanceFilters);
        }

        function getAvailablePerformanceTeams() {
            const teams = getPerformanceSourceItems()
                .filter(item => state.group === 'all' || inferPerformanceGroup(item) === state.group)
                .map(inferPerformanceTeam)
                .filter(Boolean);
            teams.push('其它');
            return Array.from(new Set(teams)).sort((left, right) => {
                if (left === '其它') return 1;
                if (right === '其它') return -1;
                return left.localeCompare(right, 'zh-CN', { numeric: true });
            });
        }

        function renderPerformanceTeamFilters() {
            const container = document.getElementById('performance-team-filters');
            if (!container) return;
            if (state.group === 'all' || state.group === 'other') {
                state.team = 'all';
                container.replaceChildren();
                container.hidden = true;
                return;
            }
            const teams = getAvailablePerformanceTeams();
            if (state.team !== 'all' && !teams.includes(state.team)) state.team = 'all';
            container.replaceChildren();
            container.hidden = teams.length === 0;
            if (!teams.length) return;

            const createButton = (value, label) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'performance-filter performance-team-filter';
                button.dataset.performanceTeam = value;
                button.textContent = label;
                const active = state.team === value;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', active ? 'true' : 'false');
                button.addEventListener('click', () => selectPerformanceTeam(value));
                return button;
            };

            const fragment = document.createDocumentFragment();
            fragment.appendChild(createButton('all', '全部队伍'));
            teams.forEach(team => fragment.appendChild(createButton(team, team)));
            container.appendChild(fragment);
        }

        function syncPerformanceControls() {
            renderPerformanceTeamFilters();
            document.querySelectorAll('[data-performance-group]').forEach(button => {
                const active = button.dataset.performanceGroup === state.group;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', active ? 'true' : 'false');
            });

            const refreshButton = document.getElementById('performance-refresh');
            if (refreshButton) {
                refreshButton.disabled = state.loading;
                refreshButton.textContent = state.loading && state.items.length === 0 ? '加载中…' : '刷新列表';
            }

            const loadMoreButton = document.getElementById('performance-load-more');
            if (loadMoreButton) {
                loadMoreButton.hidden = Array.isArray(state.memberItems)
                    || !state.autoLoadPaused
                    || !state.hasMore
                    || state.items.length === 0;
                loadMoreButton.disabled = state.loading;
                loadMoreButton.textContent = state.loading ? '加载中…' : '重新加载';
            }

            const loadSentinel = document.getElementById('performance-load-sentinel');
            if (loadSentinel) {
                const visibleCount = getVisibleItems().length;
                const countText = visibleCount > 0 ? `已找到 ${visibleCount} 场公演` : '';
                const loadingText = state.memberLoading
                    ? `正在加载${state.memberName ? ` ${state.memberName} ` : ''}的公演…`
                    : (state.loading && state.items.length > 0
                    ? '正在自动加载更多公演…'
                    : '');
                loadSentinel.textContent = countText && loadingText
                    ? `${countText} · ${loadingText}`
                    : (countText || loadingText);
            }

        }

        function renderPerformanceList({ reuseExisting = true } = {}) {
            const container = document.getElementById('performance-list');
            if (!container) return;

            const list = getVisibleItems();
            if (!list.length) {
                const searching = Boolean(state.query);
                if (searching || state.memberLoading) {
                    container.replaceChildren();
                    syncPerformanceControls();
                    return;
                }
                if (state.memberId) {
                    setPerformanceMessage(
                        `${state.memberName || '该成员'}暂无公演记录`,
                        '可以搜索其他成员。'
                    );
                    syncPerformanceControls();
                    return;
                }
                setPerformanceMessage(
                    state.items.length
                        ? '这个筛选暂无公演'
                        : '暂时没有公演',
                    state.items.length
                        ? '可以切换到其他团体或队伍看看。'
                        : '稍后刷新列表再试。'
                );
                syncPerformanceControls();
                return;
            }

            const existingCards = reuseExisting
                ? new Map(Array.from(container.children)
                    .filter(element => element.classList.contains('performance-card'))
                    .map(element => [element.dataset.performanceKey || '', element]))
                : new Map();
            const visibleKeys = new Set();

            if (!reuseExisting) container.replaceChildren();
            container.querySelectorAll(':scope > .performance-empty-state').forEach(element => element.remove());

            let insertionPoint = container.firstElementChild;
            list.forEach(item => {
                const key = getPerformanceItemKey(item);
                const card = existingCards.get(key) || createPerformanceCard(item);
                visibleKeys.add(key);
                if (card !== insertionPoint) container.insertBefore(card, insertionPoint);
                insertionPoint = card.nextElementSibling;
            });
            Array.from(container.children).forEach(element => {
                if (element.classList.contains('performance-card')
                    && !visibleKeys.has(element.dataset.performanceKey || '')) {
                    element.remove();
                }
            });
            syncPerformanceControls();
        }

        function mergePerformanceItems(items, reset) {
            const source = reset ? [] : state.items.slice();
            const known = new Set(source.map(getPerformanceItemKey));
            items.forEach(item => {
                const key = getPerformanceItemKey(item);
                if (!known.has(key)) {
                    known.add(key);
                    source.push(item);
                }
            });
            state.items = source;
        }

        function canAutoLoadPerformanceList() {
            const view = document.getElementById('view-performance');
            return Boolean(
                state.initialized
                && state.items.length > 0
                && !Array.isArray(state.memberItems)
                && (state.hasMore || Boolean(state.dateSearchCursor))
                && !state.dateSearchComplete
                && !state.loading
                && !state.autoLoadPaused
                && view
                && view.style.display !== 'none'
            );
        }

        function schedulePerformanceAutoLoad() {
            if (autoLoadFrame) cancelAnimationFrame(autoLoadFrame);
            autoLoadFrame = requestAnimationFrame(() => {
                autoLoadFrame = 0;
                if (!canAutoLoadPerformanceList()) return;

                const view = document.getElementById('view-performance');
                const sentinel = document.getElementById('performance-load-sentinel');
                if (!view || !sentinel) return;

                const viewRect = view.getBoundingClientRect();
                const sentinelRect = sentinel.getBoundingClientRect();
                if (sentinelRect.top <= viewRect.bottom + 280 && sentinelRect.bottom >= viewRect.top) {
                    void loadPerformanceList({ reset: false, automatic: true });
                }
            });
        }

        function ensurePerformanceAutoLoad() {
            const view = document.getElementById('view-performance');
            const sentinel = document.getElementById('performance-load-sentinel');
            if (!view || !sentinel) return;

            if (autoLoadScrollRoot !== view) {
                if (autoLoadScrollRoot) {
                    autoLoadScrollRoot.removeEventListener('scroll', schedulePerformanceAutoLoad);
                }
                autoLoadScrollRoot = view;
                autoLoadScrollRoot.addEventListener('scroll', schedulePerformanceAutoLoad, { passive: true });
            }

            if (autoLoadObserver) autoLoadObserver.disconnect();
            if (typeof IntersectionObserver === 'function') {
                autoLoadObserver = new IntersectionObserver(entries => {
                    if (entries.some(entry => entry.isIntersecting)) schedulePerformanceAutoLoad();
                }, {
                    root: view,
                    rootMargin: '0px 0px 280px 0px'
                });
                autoLoadObserver.observe(sentinel);
            }

            schedulePerformanceAutoLoad();
        }

        async function loadPerformanceList({ reset = false, automatic = false } = {}) {
            if (state.loading) return;

            const token = getAppToken ? getAppToken() : '';
            if (!token) {
                state.initialized = true;
                state.items = [];
                state.hasMore = false;
                setPerformanceMessage('登录后查看公演', '公演列表需要使用你的口袋账号访问。', '前往登录', () => window.switchView('login'));
                syncPerformanceControls();
                return;
            }

            const requestedDateCursor = !reset ? state.dateSearchCursor : '';
            const directDateSearch = Boolean(requestedDateCursor) && getVisibleItems().length === 0;
            const fastSearch = !reset
                && automatic
                && !directDateSearch
                && Boolean(state.query)
                && getVisibleItems().length === 0;
            const pageLimit = fastSearch
                ? FAST_SEARCH_PAGE_BATCH
                : (automatic && !reset ? AUTO_LOAD_PAGE_BATCH : 1);
            const searchRevision = state.searchRevision;
            let loadedAnyPage = false;
            state.loading = true;
            if (reset) {
                state.next = '0';
                state.hasMore = true;
                state.autoLoadPaused = false;
                setPerformanceMessage('正在加载公演', '正在同步最新公演安排…');
            }
            syncPerformanceControls();

            try {
                const pa = window.getPA ? window.getPA() : null;
                let cursor = directDateSearch ? requestedDateCursor : (reset ? '0' : state.next);

                for (let page = 0; page < pageLimit; page += 1) {
                    const previousNext = String(cursor || '0');
                    const result = await ipcRenderer.invoke('fetch-seine-performance-list', {
                        token,
                        pa,
                        groupId: '0',
                        next: previousNext
                    });

                    if (!result?.success || !result.content) {
                        throw new Error(result?.msg || '公演列表返回异常');
                    }

                    const list = Array.isArray(result.content.liveList) ? result.content.liveList : [];
                    if (directDateSearch) {
                        if (state.searchRevision === searchRevision
                            && state.dateSearchCursor === requestedDateCursor) {
                            state.dateSearchItems = list;
                            state.dateSearchCursor = '';
                            state.dateSearchComplete = true;
                            loadedAnyPage = true;
                        }
                        break;
                    }

                    mergePerformanceItems(list, reset && page === 0);
                    loadedAnyPage = true;
                    cursor = String(result.content.next || '0');
                    state.next = cursor;
                    state.hasMore = list.length > 0 && cursor !== '0' && cursor !== previousNext;

                    if (!state.hasMore || (fastSearch && state.items.some(matchesPerformanceFilters))) break;
                }

                state.autoLoadPaused = false;
                state.initialized = true;
                renderPerformanceList({ reuseExisting: !reset });
            } catch (error) {
                const message = window.YayaRendererUtils?.getErrorMessage
                    ? window.YayaRendererUtils.getErrorMessage(error, '请稍后重试')
                    : String(error?.message || error || '请稍后重试');
                if (reset || state.items.length === 0) {
                    state.items = [];
                    state.hasMore = false;
                    setPerformanceMessage('公演列表加载失败', message, '重新加载', () => refreshPerformanceList());
                } else {
                    if (loadedAnyPage) renderPerformanceList();
                    state.autoLoadPaused = true;
                    if (typeof showToast === 'function') {
                        showToast(`${automatic ? '自动' : '继续'}加载失败：${message}`);
                    }
                }
            } finally {
                state.loading = false;
                syncPerformanceControls();
                schedulePerformanceAutoLoad();
            }
        }

        function enterPerformanceView() {
            ensurePerformanceAutoLoad();
            if (!state.initialized) {
                loadPerformanceList({ reset: true });
                return;
            }
            renderPerformanceList();
            schedulePerformanceAutoLoad();
        }

        function refreshPerformanceList() {
            return loadPerformanceList({ reset: true });
        }

        function loadMorePerformanceList() {
            if (!state.hasMore) return Promise.resolve();
            state.autoLoadPaused = false;
            return loadPerformanceList({ reset: false, automatic: false });
        }

        function selectPerformanceGroup(group) {
            state.group = group === 'all' || Object.prototype.hasOwnProperty.call(GROUPS, group) ? group : 'all';
            state.team = 'all';
            renderPerformanceList();
            schedulePerformanceAutoLoad();
        }

        function selectPerformanceTeam(team) {
            const normalizedTeam = String(team || 'all');
            const teams = getAvailablePerformanceTeams();
            state.team = normalizedTeam === 'all' || teams.includes(normalizedTeam) ? normalizedTeam : 'all';
            renderPerformanceList();
            schedulePerformanceAutoLoad();
        }

        function searchPerformanceList(query) {
            state.query = String(query || '').trim().toLocaleLowerCase();
            state.searchRevision += 1;
            state.dateSearchCursor = state.memberId ? '' : getPerformanceDateSearchCursor(state.query);
            state.dateSearchItems = state.dateSearchCursor ? [] : null;
            state.dateSearchComplete = false;
            state.autoLoadPaused = false;
            renderPerformanceList();
            schedulePerformanceAutoLoad();
        }

        return {
            enterPerformanceView,
            openPerformanceById,
            loadMorePerformanceList,
            refreshPerformanceList,
            selectPerformanceGroup,
            selectPerformanceTeam,
            searchPerformanceList,
            handlePerformanceMemberSearch
        };
    };
})();
