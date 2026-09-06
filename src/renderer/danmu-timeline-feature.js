(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createDanmuTimelineFeature = function createDanmuTimelineFeature(deps) {
        const isWebRuntime = window.desktop?.platform === 'web';
        const {
            DATA_BASE_URL,
            escapeHtml,
            getArt,
            getCurrentMode,
            getCurrentPlayingItem,
            getGroupCode
        } = deps;

        const COS_BASE_URL = `${DATA_BASE_URL}/subtitles`;
        const DANMU_FOLLOW_STORAGE_KEY = 'yaya_danmu_follow_enabled';

        function readDanmuFollowPreference() {
            try {
                return window.localStorage?.getItem(DANMU_FOLLOW_STORAGE_KEY) === '1';
            } catch (error) {
                console.warn('读取弹幕跟随设置失败:', error);
                return false;
            }
        }

        function saveDanmuFollowPreference(enabled) {
            try {
                window.localStorage?.setItem(DANMU_FOLLOW_STORAGE_KEY, enabled ? '1' : '0');
            } catch (error) {
                console.warn('保存弹幕跟随设置失败:', error);
            }
        }

        let currentDanmuList = [];
        let currentSubtitleList = [];
        let currentTimelineMode = 'danmu';
        let currentSubtitleUrl = '';
        let lastActiveIndex = -1;
        let danmuFollowEnabled = readDanmuFollowPreference();
        const TIMELINE_ROW_HEIGHT = 36;
        const TIMELINE_VIRTUAL_THRESHOLD = 400;
        const TIMELINE_OVERSCAN_ROWS = 16;
        let visibleTimelineEntries = [];
        let visibleTimelinePositionByIndex = new Map();
        let timelineSearchTerm = '';
        let virtualWindowStart = -1;
        let virtualWindowEnd = -1;
        let virtualScrollFrame = 0;

        function safeEscapeHtml(value) {
            if (typeof escapeHtml === 'function') return escapeHtml(value);
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function getCurrentTimelineList() {
            return currentTimelineMode === 'danmu' ? currentDanmuList : currentSubtitleList;
        }

        function rebuildVisibleTimelineEntries() {
            const list = getCurrentTimelineList();
            const term = timelineSearchTerm;
            let termPinyin = term;
            if (window.pinyinPro && term) {
                termPinyin = window.pinyinPro.pinyin(term, { toneType: 'none', type: 'array' }).join('').toLowerCase();
            }

            visibleTimelineEntries = [];
            visibleTimelinePositionByIndex = new Map();
            list.forEach((item, index) => {
                if (term) {
                    const text = String(item.text || '').toLowerCase();
                    const name = String(item.name || '').toLowerCase();
                    let isMatch = text.includes(term) || name.includes(term);

                    if (!isMatch && window.pinyinPro) {
                        if (item._pinyinText === undefined) {
                            item._pinyinText = window.pinyinPro.pinyin(text, { toneType: 'none', type: 'array' }).join('').toLowerCase();
                        }
                        if (item._pinyinName === undefined) {
                            item._pinyinName = window.pinyinPro.pinyin(name, { toneType: 'none', type: 'array' }).join('').toLowerCase();
                        }
                        isMatch = (item._pinyinText || '').includes(termPinyin)
                            || (item._pinyinName || '').includes(termPinyin);
                    }

                    if (!isMatch) return;
                }

                visibleTimelinePositionByIndex.set(index, visibleTimelineEntries.length);
                visibleTimelineEntries.push({ item, index });
            });
        }

        function scrollTimelineIndexIntoPosition(index) {
            const container = document.getElementById('danmu-list-body');
            const position = visibleTimelinePositionByIndex.get(index);
            if (!container || position === undefined) return false;

            const rowTop = position * TIMELINE_ROW_HEIGHT;
            const rowBottom = rowTop + TIMELINE_ROW_HEIGHT;
            const safeTop = container.scrollTop + (container.clientHeight * 0.4);
            const safeBottom = container.scrollTop + (container.clientHeight * 0.6);
            if (rowTop >= safeTop && rowBottom <= safeBottom) return true;

            const targetTop = rowTop - ((container.clientHeight - TIMELINE_ROW_HEIGHT) / 2);
            const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
            container.scrollTo({
                top: Math.max(0, Math.min(targetTop, maxTop)),
                behavior: 'smooth'
            });
            return true;
        }

        function clearTimelineHighlight() {
            if (lastActiveIndex !== -1) {
                const activeRow = document.getElementById(`dm-row-${lastActiveIndex}`);
                if (activeRow) activeRow.classList.remove('active');
            }
            lastActiveIndex = -1;
        }

        function setDanmuFollowEnabled(enabled) {
            danmuFollowEnabled = Boolean(enabled);
            saveDanmuFollowPreference(danmuFollowEnabled);
            const checkbox = document.getElementById('danmu-follow-checkbox');
            if (checkbox && checkbox.checked !== danmuFollowEnabled) {
                checkbox.checked = danmuFollowEnabled;
            }

            clearTimelineHighlight();
            if (!danmuFollowEnabled) return;

            const currentTime = Number(getArt()?.currentTime);
            if (Number.isFinite(currentTime)) syncDanmuHighlight(currentTime);
        }

        function handleDanmuSearch(keyword) {
            timelineSearchTerm = String(keyword || '').trim().toLowerCase();
            rebuildVisibleTimelineEntries();
            const container = document.getElementById('danmu-list-body');
            if (container) container.scrollTop = 0;
            virtualWindowStart = -1;
            virtualWindowEnd = -1;
            renderTimelineWindow(true);
        }

        function parseSRT(srtText) {
            const result = [];
            if (!srtText || typeof srtText !== 'string') return result;

            const pattern = "(\\d{1,2}:\\d{1,2}:\\d{1,2}[,.]\\d{1,3})\\s*-->\\s*(\\d{1,2}:\\d{1,2}:\\d{1,2}[,.]\\d{1,3})";
            const timeRegex = new RegExp(pattern);
            const normalizedText = srtText.replace(/(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3}\s*-->)/g, '\n$1');
            const lines = normalizedText.split('\n');

            let currentItem = null;

            const parseTime = (str) => {
                const parts = str.replace(',', '.').split(':');
                return (+parts[0]) * 3600 + (+parts[1]) * 60 + parseFloat(parts[2]);
            };

            const formatVTT = (t) => {
                let s = t.replace(',', '.');
                return s.split(':')[0].length === 1 ? '0' + s : s;
            };

            for (let line of lines) {
                line = line.trim();
                if (!line) continue;

                const timeMatch = line.match(timeRegex);
                if (timeMatch) {
                    if (currentItem) result.push(currentItem);

                    const startStr = timeMatch[1];
                    const endStr = timeMatch[2];

                    currentItem = {
                        time: parseTime(startStr),
                        endTime: parseTime(endStr),
                        vttStart: formatVTT(startStr),
                        vttEnd: formatVTT(endStr),
                        text: '',
                        name: '字幕'
                    };
                } else if (currentItem) {
                    if (/^\d+$/.test(line)) continue;
                    currentItem.text += (currentItem.text ? ' ' : '') + line;
                }
            }

            if (currentItem) result.push(currentItem);

            return result.map(item => {
                item.text = item.text.replace(/\s+\d+$/, '').trim();
                return item;
            });
        }

        function getSubtitleGroupPrefix(item, nickname) {
            const memberId =
                item?.userInfo?.userId ||
                item?.userInfo?.id ||
                item?.userId ||
                item?.id ||
                '';
            const teamName =
                item?.userInfo?.teamName ||
                item?.teamName ||
                '';

            const code = getGroupCode(memberId, teamName, nickname);
            const prefixMap = {
                snh: 'SNH48',
                gnz: 'GNZ48',
                bej: 'BEJ48',
                ckg: 'CKG48',
                cgt: 'CGT48',
                idft: 'IDFT'
            };

            if (window.memberData && nickname) {
                const member = window.memberData.find(m =>
                    String(m.ownerName || '').trim() === String(nickname || '').trim() ||
                    String(m.id || '') === String(memberId || '') ||
                    String(m.userId || '') === String(memberId || '')
                );

                const explicitGroup = String(member?.groupName || '').trim();
                if (explicitGroup) return explicitGroup;
            }

            return prefixMap[code] || '';
        }

        function getSubtitleFolderCandidates(item, nickname) {
            const candidates = [];
            const seen = new Set();
            const pushCandidate = (value) => {
                const normalized = String(value || '').trim();
                if (!normalized || seen.has(normalized)) return;
                seen.add(normalized);
                candidates.push(normalized);
            };

            const groupPrefix = getSubtitleGroupPrefix(item, nickname);
            const cleanNickname = String(nickname || '').trim();

            pushCandidate(cleanNickname);
            if (groupPrefix) {
                pushCandidate(`${groupPrefix}-${cleanNickname}`);
            }

            if (window.memberData && cleanNickname) {
                const member = window.memberData.find(m =>
                    String(m.ownerName || '').trim() === cleanNickname ||
                    String(m.nickname || '').trim() === cleanNickname
                );
                if (member) {
                    const memberGroup = String(member.groupName || groupPrefix || '').trim();
                    if (memberGroup) {
                        pushCandidate(`${memberGroup}-${cleanNickname}`);
                    }
                }
            }

            return candidates;
        }

        async function fetchCosSubtitle(nickname, rawT, item = null) {
            if (!nickname || !rawT) return null;

            const d = new Date(Number(rawT));
            const offset = d.getTimezoneOffset() * 60000;
            const utcTime = d.getTime() + offset;
            const bjTime = new Date(utcTime + 3600000 * 8);

            const pad = (n) => String(n).padStart(2, '0');
            const fTimestamp = `${bjTime.getFullYear()}${pad(bjTime.getMonth() + 1)}${pad(bjTime.getDate())}_${pad(bjTime.getHours())}.${pad(bjTime.getMinutes())}.${pad(bjTime.getSeconds())}`;

            const fileName = `【${nickname}】${fTimestamp}.srt`;
            const folderCandidates = getSubtitleFolderCandidates(item, nickname);

            for (const folderName of folderCandidates) {
                const srtUrl = `${COS_BASE_URL}/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`;

                console.log(`🔍 [字幕请求] 正在从云端获取: ${folderName}/${fileName}`);

                try {
                    const res = await fetch(`${srtUrl}?t=${Date.now()}`);

                    if (res.ok) {
                        const text = await res.text();
                        console.log(`[字幕加载成功] 来源于云端: ${folderName}`);
                        return { text, url: srtUrl, fileName };
                    }

                    console.log(`[字幕提示] 云端未找到: ${folderName}/${fileName} (${res.status})`);
                } catch (err) {
                    console.error(`[字幕请求错误] ${folderName}/${fileName}:`, err.message);
                }
            }

            return null;
        }

        function renderDanmuListUI(danmuData) {
            const wrapper = document.getElementById('danmu-timeline-wrapper');
            const container = document.getElementById('danmu-list-body');

            lastActiveIndex = -1;
            currentDanmuList = danmuData || [];
            currentSubtitleList = [];
            currentTimelineMode = 'danmu';
            currentSubtitleUrl = '';

            if (!wrapper || !container) return;
            const playbackMode = getCurrentMode();
            if (playbackMode === 'live' || playbackMode === 'meet-live') {
                wrapper.style.display = 'none';
                return;
            }

            wrapper.style.display = 'flex';

            const headerDiv = wrapper.firstElementChild;
            headerDiv.innerHTML = `
                <div style="display: flex; gap: 15px; align-items: center;">
                    <span id="tab-danmu" onclick="switchTimelineMode('danmu')" style="cursor:pointer; font-weight:bold; color:var(--primary); transition:all 0.2s; user-select:none;">弹幕</span>
                    <span style="width:1px; height:18px; background:var(--border); opacity:0.9; display:inline-block;"></span>
                    <span id="tab-subtitle" onclick="switchTimelineMode('subtitle')" style="cursor:pointer; font-weight:normal; color:var(--text-sub); transition:all 0.2s; user-select:none;">字幕</span>
                </div>
                <div style="display: flex; flex: 1; align-items: center;">
                    <input type="text" id="danmu-search-input" class="input-control" placeholder="搜索内容 / 发送者" style="flex: 1; height: 26px; font-size: 12px; padding: 0 8px; margin-left: 10px;" oninput="handleDanmuSearch(this.value)">
                    <button id="btn-danmu-analysis" class="btn btn-secondary" onclick="openDanmuAnalysis()" style="height: 26px; padding: 0 10px; font-size: 12px; margin-left: 10px;">统计</button>
                    <label id="danmu-follow-control" class="danmu-follow-control" title="跟随播放时间定位当前弹幕">
                        <input id="danmu-follow-checkbox" type="checkbox">
                        <span>跟随</span>
                    </label>
                </div>
            `;

            const followCheckbox = document.getElementById('danmu-follow-checkbox');
            if (followCheckbox) {
                followCheckbox.checked = danmuFollowEnabled;
                followCheckbox.addEventListener('change', () => {
                    setDanmuFollowEnabled(followCheckbox.checked);
                });
            }

            refreshTimelineListUI();

            const currentPlayingItem = getCurrentPlayingItem();
            if (currentPlayingItem && (currentPlayingItem.startTime || currentPlayingItem.ctime)) {
                const nickname = currentPlayingItem.userInfo ? currentPlayingItem.userInfo.nickname : (currentPlayingItem.nickname || '');
                const rawT = currentPlayingItem.startTime || currentPlayingItem.ctime;

                if (nickname) {
                    fetchCosSubtitle(nickname, rawT, currentPlayingItem).then(res => {
                        if (res && res.text) {
                            currentSubtitleUrl = res.url;
                            currentSubtitleList = parseSRT(res.text);

                            let cleanVttContent = "WEBVTT\n\n";
                            currentSubtitleList.forEach(item => {
                                cleanVttContent += `${item.vttStart} --> ${item.vttEnd}\n${item.text}\n\n`;
                            });

                            const blob = new Blob([cleanVttContent], { type: 'text/vtt;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const art = getArt();

                            if (art && art.subtitle) {
                                art.subtitle.switch(url, { type: 'vtt', name: '云端字幕' });
                            }
                            if (currentTimelineMode === 'subtitle') refreshTimelineListUI();
                        }
                    });
                }
            }
        }

        function switchTimelineMode(mode) {
            currentTimelineMode = mode;
            const tabDanmu = document.getElementById('tab-danmu');
            const tabSubtitle = document.getElementById('tab-subtitle');
            const analysisBtn = document.getElementById('btn-danmu-analysis');
            const searchInput = document.getElementById('danmu-search-input');

            if (mode === 'danmu') {
                if (tabDanmu) {
                    tabDanmu.style.color = 'var(--primary)';
                    tabDanmu.style.fontWeight = 'bold';
                }
                if (tabSubtitle) {
                    tabSubtitle.style.color = 'var(--text-sub)';
                    tabSubtitle.style.fontWeight = 'normal';
                }

                if (analysisBtn) analysisBtn.style.display = 'inline-flex';
                if (searchInput) searchInput.placeholder = '搜索内容 / 发送者';
            } else {
                if (tabSubtitle) {
                    tabSubtitle.style.color = 'var(--primary)';
                    tabSubtitle.style.fontWeight = 'bold';
                }
                if (tabDanmu) {
                    tabDanmu.style.color = 'var(--text-sub)';
                    tabDanmu.style.fontWeight = 'normal';
                }

                if (analysisBtn) analysisBtn.style.display = 'none';
                if (searchInput) searchInput.placeholder = '搜索字幕内容';
            }
            lastActiveIndex = -1;
            refreshTimelineListUI();
        }

        function createTimelineRow(item, index) {
            const div = document.createElement('div');
            div.className = 'danmu-row';
            if (index === lastActiveIndex) div.classList.add('active');
            div.id = `dm-row-${index}`;
            div.style.cssText = `display: flex; align-items: center; height: ${TIMELINE_ROW_HEIGHT}px; box-sizing: border-box; padding: 0 15px; border-bottom: 1px solid rgba(0,0,0,0.03);`;

            const time = Math.max(0, Number(item.time) || 0);
            const s = Math.floor(time);
            const ms = Math.floor((time % 1) * 1000);
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            const pad = (n, w = 2) => String(n).padStart(w, '0');
            const timeStr = `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms, 3)}`;

            const nameHtml = currentTimelineMode === 'subtitle' ? '' :
                `<div style="width: var(--col-name); margin-left: 10px; text-align: left; font-weight: bold; color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0;" title="${safeEscapeHtml(item.name || '???')}">${safeEscapeHtml(item.name || '???')}</div>`;
            const endPointTime = (currentTimelineMode === 'subtitle' && item.endTime) ? item.endTime : item.time;
            const actionHtml = currentTimelineMode === 'subtitle' && !isWebRuntime ? `
                <div style="width: var(--col-act); display: flex; gap: 6px; justify-content: flex-end; align-items: center; flex-shrink: 0; margin-left: 10px; padding-right: 8px;">
                    <button style="border: 1px solid #28a745; background: transparent; color: #28a745; padding: 2px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; transition: all 0.2s;"
                            onmouseover="this.style.background='#28a745'; this.style.color='#fff'"
                            onmouseout="this.style.background='transparent'; this.style.color='#28a745'"
                            onclick="event.stopPropagation(); setClipStartFromTimeline(${item.time})">起</button>
                    <button style="border: 1px solid #dc3545; background: transparent; color: #dc3545; padding: 2px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; transition: all 0.2s;"
                            onmouseover="this.style.background='#dc3545'; this.style.color='#fff'"
                            onmouseout="this.style.background='transparent'; this.style.color='#dc3545'"
                            onclick="event.stopPropagation(); setClipEndFromTimeline(${endPointTime})">终</button>
                </div>
            ` : '';

            div.innerHTML = `
                <div style="width: var(--col-time); text-align: left; flex-shrink: 0; margin-left: 0; color: var(--primary); font-weight: bold;">${timeStr}</div>
                ${nameHtml}
                <div title="${safeEscapeHtml(item.text)}" style="padding-left: 15px; flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text);">${safeEscapeHtml(item.text) || '&nbsp;'}</div>
                ${actionHtml}
            `;

            div.onclick = () => {
                const art = getArt();
                if (!art) return;
                const isPlaying = art.playing;
                art.seek = item.time;
                if (isPlaying) art.play();
                else art.pause();
            };
            return div;
        }

        function renderTimelineWindow(force = false) {
            const container = document.getElementById('danmu-list-body');
            if (!container) return;

            if (!visibleTimelineEntries.length) {
                virtualWindowStart = -1;
                virtualWindowEnd = -1;
                const sourceList = getCurrentTimelineList();
                const emptyText = timelineSearchTerm && sourceList.length
                    ? '没有匹配的结果'
                    : (currentTimelineMode === 'subtitle' ? '未在云端找到字幕文件' : '暂无弹幕数据');
                container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-sub);">${emptyText}</div>`;
                return;
            }

            const isVirtual = visibleTimelineEntries.length > TIMELINE_VIRTUAL_THRESHOLD;
            let start = 0;
            let end = visibleTimelineEntries.length;
            if (isVirtual) {
                const visibleRows = Math.max(1, Math.ceil(container.clientHeight / TIMELINE_ROW_HEIGHT));
                const firstVisible = Math.max(0, Math.floor(container.scrollTop / TIMELINE_ROW_HEIGHT));
                const lastVisible = Math.min(visibleTimelineEntries.length, firstVisible + visibleRows);
                const minimumBuffer = Math.floor(TIMELINE_OVERSCAN_ROWS / 2);
                const hasLeadingBuffer = virtualWindowStart === 0
                    || firstVisible - virtualWindowStart >= minimumBuffer;
                const hasTrailingBuffer = virtualWindowEnd === visibleTimelineEntries.length
                    || virtualWindowEnd - lastVisible >= minimumBuffer;
                if (!force && virtualWindowStart >= 0 && hasLeadingBuffer && hasTrailingBuffer) return;

                start = Math.max(0, firstVisible - TIMELINE_OVERSCAN_ROWS);
                end = Math.min(visibleTimelineEntries.length, start + visibleRows + (TIMELINE_OVERSCAN_ROWS * 2));
            }

            if (!force && start === virtualWindowStart && end === virtualWindowEnd) return;
            virtualWindowStart = start;
            virtualWindowEnd = end;

            const fragment = document.createDocumentFragment();
            if (isVirtual && start > 0) {
                const topSpacer = document.createElement('div');
                topSpacer.className = 'danmu-virtual-spacer';
                topSpacer.style.height = `${start * TIMELINE_ROW_HEIGHT}px`;
                fragment.appendChild(topSpacer);
            }

            for (let position = start; position < end; position++) {
                const entry = visibleTimelineEntries[position];
                fragment.appendChild(createTimelineRow(entry.item, entry.index));
            }

            if (isVirtual && end < visibleTimelineEntries.length) {
                const bottomSpacer = document.createElement('div');
                bottomSpacer.className = 'danmu-virtual-spacer';
                bottomSpacer.style.height = `${(visibleTimelineEntries.length - end) * TIMELINE_ROW_HEIGHT}px`;
                fragment.appendChild(bottomSpacer);
            }
            container.replaceChildren(fragment);
        }

        function handleTimelineScroll() {
            if (visibleTimelineEntries.length <= TIMELINE_VIRTUAL_THRESHOLD || virtualScrollFrame) return;
            virtualScrollFrame = window.requestAnimationFrame(() => {
                virtualScrollFrame = 0;
                renderTimelineWindow();
            });
        }

        function refreshTimelineListUI() {
            const container = document.getElementById('danmu-list-body');
            const searchInput = document.getElementById('danmu-search-input');
            const wrapper = document.getElementById('danmu-timeline-wrapper');
            if (!container || !wrapper) return;
            if (searchInput) searchInput.value = '';

            if (!document.getElementById('col-resize-style')) {
                const style = document.createElement('style');
                style.id = 'col-resize-style';
                style.innerHTML = `
                    .resizable-col { position: relative; }
                    .col-resizer {
                        position: absolute; top: 0; right: -5px; width: 10px; height: 100%;
                        cursor: col-resize; z-index: 10; background: transparent;
                    }
                    .col-resizer::after {
                        content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
                        width: 2px; height: 100%; background-color: var(--primary); opacity: 0;
                        transition: opacity 0.15s, box-shadow 0.15s; border-radius: 1px;
                    }
                    .col-resizer:hover::after, .col-resizer.is-resizing::after {
                        opacity: 1; box-shadow: 0 0 5px var(--primary);
                    }
                `;
                document.head.appendChild(style);
            }

            if (!wrapper.style.getPropertyValue('--col-seq')) {
                wrapper.style.setProperty('--col-seq', '40px');
                wrapper.style.setProperty('--col-time', '95px');
                wrapper.style.setProperty('--col-name', '80px');
                wrapper.style.setProperty('--col-act', '80px');
            }

            const headerDiv = container.previousElementSibling;
            if (headerDiv) {
                headerDiv.style.paddingRight = '6px';

                const createHeaderCol = (title, varName, isFlex = false, isLast = false, isFirst = false) => {
                    const wRule = isFlex ? 'flex: 1; padding-left: 15px;' : `width: var(${varName}); flex-shrink: 0; margin-left: ${isFirst ? '0' : '10px'};`;
                    const resizerHtml = (!isFlex && !isLast) ? `<div class="col-resizer" data-var="${varName}"></div>` : '';
                    return `<div class="resizable-col" style="${wRule} text-align: left; font-weight: bold;">${title}${resizerHtml}</div>`;
                };

                if (currentTimelineMode === 'subtitle') {
                    headerDiv.innerHTML =
                        createHeaderCol('时间', '--col-time', false, false, true) +
                        createHeaderCol('字幕内容', null, true, isWebRuntime) +
                        (isWebRuntime ? '' : createHeaderCol('操作', '--col-act', false, true));
                } else {
                    headerDiv.innerHTML =
                        createHeaderCol('时间', '--col-time', false, false, true) +
                        createHeaderCol('发送者', '--col-name') +
                        createHeaderCol('弹幕内容', null, true, true);
                }

                const resizers = headerDiv.querySelectorAll('.col-resizer');
                resizers.forEach(resizer => {
                    resizer.onmousedown = function (e) {
                        e.preventDefault();
                        const varName = this.getAttribute('data-var');
                        const startX = e.pageX;
                        const startWidth = parseFloat(getComputedStyle(wrapper).getPropertyValue(varName));

                        const limits = {
                            '--col-seq': [30, 80],
                            '--col-time': [85, 180],
                            '--col-name': [60, 250]
                        };
                        const [minW, maxW] = limits[varName] || [30, 200];
                        const dynamicMaxW = Math.max(minW, wrapper.clientWidth - 180);
                        const finalMaxW = Math.min(maxW, dynamicMaxW);

                        this.classList.add('is-resizing');
                        document.body.style.cursor = 'col-resize';

                        const onMouseMove = (mv) => {
                            const newWidth = Math.max(minW, Math.min(startWidth + (mv.pageX - startX), finalMaxW));
                            wrapper.style.setProperty(varName, newWidth + 'px');
                        };

                        const onMouseUp = () => {
                            this.classList.remove('is-resizing');
                            document.body.style.cursor = 'default';
                            document.removeEventListener('mousemove', onMouseMove);
                            document.removeEventListener('mouseup', onMouseUp);
                        };

                        document.addEventListener('mousemove', onMouseMove);
                        document.addEventListener('mouseup', onMouseUp);
                    };
                });
            }

            if (!container.dataset.yayaVirtualTimelineBound) {
                container.addEventListener('scroll', handleTimelineScroll, { passive: true });
                container.dataset.yayaVirtualTimelineBound = '1';
            }
            timelineSearchTerm = '';
            rebuildVisibleTimelineEntries();
            container.replaceChildren();
            container.scrollTop = 0;
            lastActiveIndex = -1;
            virtualWindowStart = -1;
            virtualWindowEnd = -1;
            renderTimelineWindow(true);

            if (danmuFollowEnabled) {
                const currentTime = Number(getArt()?.currentTime);
                if (Number.isFinite(currentTime)) syncDanmuHighlight(currentTime);
            }
        }

        function syncDanmuHighlight(currentTime) {
            if (!danmuFollowEnabled || !Number.isFinite(Number(currentTime))) return;
            const list = getCurrentTimelineList();
            if (!list || !list.length) return;

            let activeIndex = -1;
            let low = 0;
            let high = list.length - 1;
            const targetTime = Number(currentTime);
            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                if ((Number(list[mid]?.time) || 0) <= targetTime) {
                    activeIndex = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            if (activeIndex !== lastActiveIndex) {
                if (lastActiveIndex !== -1) {
                    const oldRow = document.getElementById(`dm-row-${lastActiveIndex}`);
                    if (oldRow) oldRow.classList.remove('active');
                }
                lastActiveIndex = activeIndex;
                if (activeIndex !== -1 && scrollTimelineIndexIntoPosition(activeIndex)) {
                    const newRow = document.getElementById(`dm-row-${activeIndex}`);
                    if (newRow) newRow.classList.add('active');
                }
            }
        }

        function resetTimelinePanel() {
            const timelineWrapper = document.getElementById('danmu-timeline-wrapper');
            if (timelineWrapper) timelineWrapper.style.display = 'none';
            const danmuBody = document.getElementById('danmu-list-body');
            if (danmuBody) danmuBody.replaceChildren();
            if (virtualScrollFrame) {
                window.cancelAnimationFrame(virtualScrollFrame);
                virtualScrollFrame = 0;
            }
            lastActiveIndex = -1;
            currentDanmuList = [];
            currentSubtitleList = [];
            currentSubtitleUrl = '';
            visibleTimelineEntries = [];
            visibleTimelinePositionByIndex = new Map();
            timelineSearchTerm = '';
            virtualWindowStart = -1;
            virtualWindowEnd = -1;
        }

        function loadTimelineSubtitleText(text) {
            currentSubtitleList = parseSRT(text);
            switchTimelineMode('subtitle');
            return currentSubtitleList;
        }

        function openDanmuAnalysis() {
            const modal = document.getElementById('danmuAnalysisModal');
            const container = document.getElementById('danmuAnalysisList');
            const modalTitle = modal?.querySelector('.modal-title');
            if (modalTitle) modalTitle.textContent = `弹幕榜（共 ${currentDanmuList.length} 条）`;

            if (!currentDanmuList || currentDanmuList.length === 0) {
                if (modal) modal.style.display = 'flex';
                if (container) container.innerHTML = '<div class="empty-state">当前没有弹幕数据</div>';
                return;
            }

            if (modal) modal.style.display = 'flex';

            const counts = {};
            currentDanmuList.forEach(item => {
                const name = item.name || '未知用户';
                counts[name] = (counts[name] || 0) + 1;
            });

            const sortedStats = Object.entries(counts)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

            if (!container) return;
            if (sortedStats.length === 0) {
                container.innerHTML = '<div class="empty-state">无数据</div>';
            } else {
                let html = '';
                sortedStats.forEach((user, index) => {
                    const rClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : ''));
                    html += `
            <div class="list-item" onclick="filterDanmuByUser('${safeEscapeHtml(user.name)}')" style="cursor: pointer;">
                <div class="rank-num ${rClass}">${index + 1}</div>
                <div class="item-main">
                    <span class="item-title">${safeEscapeHtml(user.name)}</span>
                </div>
                <div class="item-count">${user.count}条</div>
            </div>`;
                });
                container.innerHTML = html;
            }
            setTimeout(() => {
                container.scrollTop = 0;
            }, 0);
        }

        function closeDanmuAnalysis() {
            const modal = document.getElementById('danmuAnalysisModal');
            if (modal) modal.style.display = 'none';
        }

        function filterDanmuByUser(name) {
            closeDanmuAnalysis();
            const input = document.getElementById('danmu-search-input');
            if (input) {
                input.value = name;
                handleDanmuSearch(name);
            }
        }

        return {
            closeDanmuAnalysis,
            filterDanmuByUser,
            handleDanmuSearch,
            loadTimelineSubtitleText,
            openDanmuAnalysis,
            parseSRT,
            renderDanmuListUI,
            resetTimelinePanel,
            switchTimelineMode,
            syncDanmuHighlight
        };
    };
})();
