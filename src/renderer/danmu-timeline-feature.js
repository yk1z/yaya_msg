(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createDanmuTimelineFeature = function createDanmuTimelineFeature(deps) {
        const {
            DATA_BASE_URL,
            escapeHtml,
            getArt,
            getCurrentMode,
            getCurrentPlayingItem,
            getGroupCode
        } = deps;

        const COS_BASE_URL = `${DATA_BASE_URL}/subtitles`;

        let currentDanmuList = [];
        let currentSubtitleList = [];
        let currentTimelineMode = 'danmu';
        let currentSubtitleUrl = '';
        let lastActiveIndex = -1;

        function safeEscapeHtml(value) {
            if (typeof escapeHtml === 'function') return escapeHtml(value);
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function handleDanmuSearch(keyword) {
            const term = String(keyword || '').trim().toLowerCase();
            const list = currentTimelineMode === 'danmu' ? currentDanmuList : currentSubtitleList;

            let termPinyin = term;
            if (window.pinyinPro && term) {
                termPinyin = pinyinPro.pinyin(term, { toneType: 'none', type: 'array' }).join('').toLowerCase();
            }

            list.forEach((item, index) => {
                const row = document.getElementById(`dm-row-${index}`);
                if (!row) return;

                const text = String(item.text || '').toLowerCase();
                const name = String(item.name || '').toLowerCase();
                let isMatch = text.includes(term) || name.includes(term);

                if (!isMatch && window.pinyinPro && term) {
                    if (item._pinyinText === undefined) {
                        item._pinyinText = pinyinPro.pinyin(text, { toneType: 'none', type: 'array' }).join('').toLowerCase();
                    }
                    if (item._pinyinName === undefined) {
                        item._pinyinName = pinyinPro.pinyin(name, { toneType: 'none', type: 'array' }).join('').toLowerCase();
                    }

                    const textPinyin = item._pinyinText || '';
                    const namePinyin = item._pinyinName || '';
                    if (textPinyin.includes(termPinyin) || namePinyin.includes(termPinyin)) {
                        isMatch = true;
                    }
                }

                row.style.display = isMatch ? 'flex' : 'none';
            });
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
                        console.log(`✅ [字幕加载成功] 来源于云端: ${folderName}`);
                        return { text, url: srtUrl, fileName };
                    }

                    console.log(`⚠️ [字幕提示] 云端未找到: ${folderName}/${fileName} (${res.status})`);
                } catch (err) {
                    console.error(`❌ [字幕请求错误] ${folderName}/${fileName}:`, err.message);
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
            if (getCurrentMode() === 'live') {
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
                    <span id="danmu-count-display" style="font-weight:normal; font-size:12px; color:var(--text-sub); white-space: nowrap; margin-left: 10px;"></span>
                </div>
            `;

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

        function refreshTimelineListUI() {
            const container = document.getElementById('danmu-list-body');
            const countDisplay = document.getElementById('danmu-count-display');
            const searchInput = document.getElementById('danmu-search-input');
            const wrapper = document.getElementById('danmu-timeline-wrapper');
            if (!container || !wrapper) return;
            if (searchInput) searchInput.value = '';

            const list = currentTimelineMode === 'danmu' ? currentDanmuList : currentSubtitleList;

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

                const createHeaderCol = (title, varName, isFlex = false, isLast = false) => {
                    const wRule = isFlex ? 'flex: 1; padding-left: 15px;' : `width: var(${varName}); flex-shrink: 0; margin-left: ${varName === '--col-seq' ? '0' : '10px'};`;
                    const resizerHtml = (!isFlex && !isLast) ? `<div class="col-resizer" data-var="${varName}"></div>` : '';
                    return `<div class="resizable-col" style="${wRule} text-align: left; font-weight: bold;">${title}${resizerHtml}</div>`;
                };

                if (currentTimelineMode === 'subtitle') {
                    headerDiv.innerHTML =
                        createHeaderCol('序号', '--col-seq') +
                        createHeaderCol('起始时间', '--col-time') +
                        createHeaderCol('字幕内容', null, true) +
                        createHeaderCol('操作', '--col-act', false, true);
                } else {
                    headerDiv.innerHTML =
                        createHeaderCol('序号', '--col-seq') +
                        createHeaderCol('起始时间', '--col-time') +
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

            container.innerHTML = '';
            container.scrollTop = 0;
            if (countDisplay) countDisplay.innerText = `共 ${list.length} 条`;

            if (list.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-sub);">${currentTimelineMode === 'subtitle' ? '未在云端找到字幕文件' : '暂无弹幕数据'}</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            list.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'danmu-row';
                div.id = `dm-row-${index}`;
                div.style.cssText = 'display: flex; align-items: center; height: 36px; box-sizing: border-box; padding: 0 15px; border-bottom: 1px solid rgba(0,0,0,0.03);';
                const s = Math.floor(item.time);
                const ms = Math.floor((item.time % 1) * 1000);
                const h = Math.floor(s / 3600);
                const m = Math.floor((s % 3600) / 60);
                const sec = s % 60;
                const pad = (n, w = 2) => String(n).padStart(w, '0');
                const timeStr = `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms, 3)}`;

                const nameHtml = currentTimelineMode === 'subtitle' ? `` :
                    `<div style="width: var(--col-name); margin-left: 10px; text-align: left; font-weight: bold; color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0;" title="${safeEscapeHtml(item.name || '???')}">${safeEscapeHtml(item.name || '???')}</div>`;

                const endPointTime = (currentTimelineMode === 'subtitle' && item.endTime) ? item.endTime : item.time;

                const actionHtml = currentTimelineMode === 'subtitle' ? `
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
                    <div style="width: var(--col-seq); text-align: left; color: var(--text-sub); flex-shrink: 0;">${index + 1}</div>
                    <div style="width: var(--col-time); text-align: left; flex-shrink: 0; margin-left: 10px; color: var(--primary); font-weight: bold;">${timeStr}</div>
                    ${nameHtml}
                    <div title="${safeEscapeHtml(item.text)}" style="padding-left: 15px; flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text);">${safeEscapeHtml(item.text) || '&nbsp;'}</div>
                    ${actionHtml}
                `;

                div.onclick = () => {
                    const art = getArt();
                    if (art) {
                        const isPlaying = art.playing;

                        art.seek = item.time;

                        if (isPlaying) {
                            art.play();
                        } else {
                            art.pause();
                        }
                    }
                };
                fragment.appendChild(div);
            });
            container.appendChild(fragment);
        }

        function syncDanmuHighlight(currentTime) {
            const list = currentTimelineMode === 'danmu' ? currentDanmuList : currentSubtitleList;
            if (!list || !list.length) return;

            let activeIndex = -1;
            for (let i = 0; i < list.length; i++) {
                if (list[i].time > currentTime) break;
                activeIndex = i;
            }

            if (activeIndex !== lastActiveIndex) {
                if (lastActiveIndex !== -1) {
                    const oldRow = document.getElementById(`dm-row-${lastActiveIndex}`);
                    if (oldRow) oldRow.classList.remove('active');
                }
                if (activeIndex !== -1) {
                    const newRow = document.getElementById(`dm-row-${activeIndex}`);
                    if (newRow) {
                        newRow.classList.add('active');
                        newRow.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                }
                lastActiveIndex = activeIndex;
            }
        }

        function resetTimelinePanel() {
            const timelineWrapper = document.getElementById('danmu-timeline-wrapper');
            if (timelineWrapper) timelineWrapper.style.display = 'none';
            const danmuBody = document.getElementById('danmu-list-body');
            if (danmuBody) danmuBody.innerHTML = '';
            const danmuCount = document.getElementById('danmu-count-display');
            if (danmuCount) danmuCount.textContent = '';
            lastActiveIndex = -1;
            currentDanmuList = [];
            currentSubtitleList = [];
            currentSubtitleUrl = '';
        }

        function loadTimelineSubtitleText(text) {
            currentSubtitleList = parseSRT(text);
            switchTimelineMode('subtitle');
            return currentSubtitleList;
        }

        function openDanmuAnalysis() {
            const modal = document.getElementById('danmuAnalysisModal');
            const container = document.getElementById('danmuAnalysisList');

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
