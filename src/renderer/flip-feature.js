(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createFlipFeature = function createFlipFeature(deps) {
        const {
            createCustomAudioPlayer,
            createCustomVideoPlayer,
            downloadMediaFileIconMode,
            getAllFlipData,
            setAllFlipData,
            getAppToken,
            getCurrentFlipFilterType,
            getCurrentFlipPrivacyFilter,
            getCurrentFlipTimeFrom,
            getCurrentFlipTimeTo,
            setCurrentFlipFilterType,
            setCurrentFlipPrivacyFilter,
            getCurrentFlipPage,
            setCurrentFlipPage,
            getCurrentFlipSort,
            setCurrentFlipSort,
            setCurrentFlipTimeFrom,
            setCurrentFlipTimeTo,
            getCurrentSearchKeyword,
            setCurrentSearchKeyword,
            getIsFetchingFlips,
            setIsFetchingFlips,
            getMemberData,
            getPageSize,
            getTeamStyle,
            ipcRenderer,
            loadMemberData,
            showConfirm,
            switchView
        } = deps;

        let currentFlipPrices = [];
        let flipCountdownTimer = null;

        function getSafeToken() {
            if (typeof getAppToken === 'function') {
                return getAppToken();
            }
            return typeof window.getAppToken === 'function' ? window.getAppToken() : '';
        }

        function getSafePa() {
            return window.getPA ? window.getPA() : null;
        }

        function getFlipPageSize() {
            return Number(typeof getPageSize === 'function' ? getPageSize() : 20) || 20;
        }

        function getFlipData() {
            const data = typeof getAllFlipData === 'function' ? getAllFlipData() : [];
            return Array.isArray(data) ? data : [];
        }

        function setFlipData(data) {
            if (typeof setAllFlipData === 'function') {
                setAllFlipData(Array.isArray(data) ? data : []);
            }
        }

        function getFlipDuration(item) {
            if (!item || item.status !== 2 || !item.qtime || !item.answerTime) return -1;
            const duration = Number(item.answerTime) - Number(item.qtime);
            if (!Number.isFinite(duration) || duration < 0) return -1;
            return duration;
        }

        function formatFlipTime(timestamp) {
            const dateObj = new Date(Number(timestamp));
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            const hh = String(dateObj.getHours()).padStart(2, '0');
            const mm = String(dateObj.getMinutes()).padStart(2, '0');
            const ss = String(dateObj.getSeconds()).padStart(2, '0');
            return `${y}.${m}.${d} ${hh}:${mm}:${ss}`;
        }

        function getFlipSevenDayExpireTime(questionTime) {
            const qtime = Number(questionTime);
            if (!Number.isFinite(qtime) || qtime <= 0) return 0;

            const dateObj = new Date(qtime);
            return new Date(
                dateObj.getFullYear(),
                dateObj.getMonth(),
                dateObj.getDate() + 8,
                0,
                0,
                0,
                0
            ).getTime();
        }

        function formatFlipSevenDayRemaining(expireAt, now = Date.now()) {
            const remainingMs = Number(expireAt) - Number(now);
            if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
                return '七天乐已到期';
            }

            const totalSeconds = Math.floor(remainingMs / 1000);
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            const parts = [];
            if (days > 0) parts.push(`${days}天`);
            if (hours > 0 || parts.length > 0) parts.push(`${hours}小时`);
            if (minutes > 0 || parts.length > 0) parts.push(`${minutes}分`);
            parts.push(`${seconds}秒`);

            return `距离七天乐还有 ${parts.join('')}`;
        }

        function formatFlipDurationFull(durationMs) {
            const totalSeconds = Math.max(0, Math.floor(Number(durationMs) / 1000));
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            const parts = [];

            if (days > 0) parts.push(`${days}天`);
            if (hours > 0 || parts.length > 0) parts.push(`${hours}小时`);
            if (minutes > 0 || parts.length > 0) parts.push(`${minutes}分`);
            parts.push(`${seconds}秒`);

            return parts.join('');
        }

        function updateFlipSevenDayCountdowns() {
            const nodes = document.querySelectorAll('.flip-seven-day-countdown[data-expire-at]');
            if (!nodes.length) {
                if (flipCountdownTimer) {
                    clearInterval(flipCountdownTimer);
                    flipCountdownTimer = null;
                }
                return;
            }

            const now = Date.now();
            nodes.forEach(node => {
                const expireAt = Number(node.getAttribute('data-expire-at') || 0);
                const remainingMs = expireAt - now;
                node.textContent = formatFlipSevenDayRemaining(expireAt, now);
                node.classList.toggle('is-expired', expireAt > 0 && expireAt <= now);
                node.classList.toggle('is-urgent', remainingMs > 0 && remainingMs <= 24 * 60 * 60 * 1000);
            });
        }

        function startFlipSevenDayCountdownTimer() {
            updateFlipSevenDayCountdowns();
            if (flipCountdownTimer) return;

            flipCountdownTimer = setInterval(updateFlipSevenDayCountdowns, 1000);
        }

        function createFlipCardDOM(item) {
            const card = document.createElement('div');
            card.className = 'Box-row';
            card.style.marginBottom = '12px';
            card.style.transition = 'all 0.2s';
            card.id = `flip-card-${item.questionId}`;

            const qTimeStr = formatFlipTime(item.qtime);
            const tagStyle = 'padding: 2px 6px; border-radius: 4px; font-size: 12px; border-width: 1px; border-style: solid; display: inline-flex; align-items: center; justify-content: center; height: 20px; box-sizing: border-box;';

            let statusHtml = '';
            let actionBtnHtml = '';

            if (item.status === 1) {
                statusHtml = `<span style="color:#faad14; border-color:#faad14; ${tagStyle}">待回答</span>`;
                actionBtnHtml = `<span class="btn-text-danger" onclick="executeDeleteFlip('${item.questionId}', true)">撤回</span>`;
            } else if (item.status === 2) {
                statusHtml = `<span style="color:#52c41a; border-color:#52c41a; ${tagStyle}">已翻牌</span>`;
                actionBtnHtml = `<span class="btn-text-gray" onclick="executeDeleteFlip('${item.questionId}', false)">删除</span>`;
            } else {
                statusHtml = `<span style="color:#ff4d4f; border-color:#ff4d4f; ${tagStyle}">已退款</span>`;
                actionBtnHtml = `<span class="btn-text-gray" onclick="executeDeleteFlip('${item.questionId}', false)">删除</span>`;
            }

            let answerTypeHtml = '';
            if (item.answerType === 1) answerTypeHtml = `<span style="color:#1890ff; border-color:#1890ff; ${tagStyle}">文字</span>`;
            else if (item.answerType === 2) answerTypeHtml = `<span style="color:#722ed1; border-color:#722ed1; ${tagStyle}">语音</span>`;
            else if (item.answerType === 3) answerTypeHtml = `<span style="color:#eb2f96; border-color:#eb2f96; ${tagStyle}">视频</span>`;
            else answerTypeHtml = `<span style="color:#8c8c8c; border-color:#8c8c8c; ${tagStyle}">未知</span>`;

            let privacyHtml = '';
            if (item.type === 1) privacyHtml = `<span style="color:#13c2c2; border-color:#13c2c2; ${tagStyle}">公开</span>`;
            else if (item.type === 2) privacyHtml = `<span style="color:#f5222d; border-color:#f5222d; ${tagStyle}">私密</span>`;
            else if (item.type === 3) privacyHtml = `<span style="color:#595959; border-color:#595959; ${tagStyle}">匿名</span>`;

            const costHtml = `<span style="color:#fa8c16; border-color:#fa8c16; ${tagStyle}">${item.cost}鸡腿</span>`;

            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px dashed var(--border); padding-bottom:8px;';

            headerDiv.innerHTML = `
        <span style="font-size:14px; font-weight:bold; color:var(--text);">${qTimeStr}</span>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
            ${answerTypeHtml} ${privacyHtml} ${costHtml} ${statusHtml}
            <div style="width: 1px; height: 16px; background: var(--border); margin: 0 4px;"></div>
            ${actionBtnHtml}
        </div>`;
            card.appendChild(headerDiv);

            const memberName = item.baseUserInfo ? item.baseUserInfo.nickname : '成员';
            let questionSideHtml = '';
            if (item.status === 1) {
                const expireAt = getFlipSevenDayExpireTime(item.qtime);
                if (expireAt > 0) {
                    questionSideHtml = `<span class="flip-seven-day-countdown" data-expire-at="${expireAt}">${formatFlipSevenDayRemaining(expireAt)}</span>`;
                }
            } else if (item.status === 2) {
                const durationText = getFlipDuration(item);
                if (durationText >= 0) {
                    const timeCostStr = formatFlipDurationFull(durationText);
                    questionSideHtml = `<span class="flip-seven-day-countdown flip-answer-duration-side">耗时 ${timeCostStr}</span>`;
                }
            }

            const questionDiv = document.createElement('div');
            questionDiv.style.marginBottom = '15px';
            questionDiv.innerHTML = `
        <div style="margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div style="display:flex; align-items:center; min-width:0;">
                <span class="flip-label question-tag" style="margin-right:8px; margin-top:0; margin-bottom:0; transform:none;">翻牌提问</span>
                <span style="font-size:14px; color:var(--text); line-height: 20px; min-width:0;">向 <strong style="color:var(--primary);">${memberName}</strong> 提问</span>
            </div>
            ${questionSideHtml}
        </div>
        <div style="font-size:14px; color:var(--text); line-height:1.6; padding:0 4px;">${item.content}</div>`;
            card.appendChild(questionDiv);

            if (item.status === 2) {
                const answerDiv = document.createElement('div');
                answerDiv.style.marginTop = '15px';
                const formattedAnswerTime = formatFlipTime(item.answerTime);

                let timeCostStr = '';
                if (item.qtime && item.answerTime) {
                    const diffMs = Number(item.answerTime) - Number(item.qtime);
                    timeCostStr = formatFlipDurationFull(diffMs);
                }

                answerDiv.innerHTML = `
            <div style="margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <div style="display:flex; align-items:center; flex-wrap:wrap; min-width:0;">
                    <span class="flip-label answer-tag" style="margin-right:8px; margin-top:0; margin-bottom:0; transform:none;">翻牌回答</span>
                    <span style="font-size:14px; color:var(--text); line-height: 20px;"><strong style="color:var(--primary);">${memberName}</strong> 的回复</span>
                    <span style="font-size:12px; color:var(--text-sub); margin-left:10px;">翻牌时间：${formattedAnswerTime}</span>
                </div>
            </div>`;

                try {
                    if (item.answerType === 1) {
                        const textContent = document.createElement('div');
                        textContent.style.cssText = 'font-size:14px; color:var(--text); line-height:1.6; padding:0 4px;';
                        textContent.innerText = item.answerContent;
                        answerDiv.appendChild(textContent);
                    } else {
                        const json = JSON.parse(item.answerContent);
                        let url = json.url;
                        if (!url.startsWith('http')) url = `https://mp4.48.cn${url}`;

                        if (item.answerType === 2) {
                            const audioRow = document.createElement('div');
                            audioRow.style.cssText = 'display: flex; align-items: center; gap: 12px; flex-wrap: wrap;';

                            if (typeof createCustomAudioPlayer === 'function') {
                                audioRow.appendChild(createCustomAudioPlayer(url));
                            } else {
                                const audioEl = document.createElement('audio');
                                audioEl.src = url;
                                audioEl.controls = true;
                                audioEl.style.maxWidth = '100%';
                                audioEl.style.marginTop = '8px';
                                audioRow.appendChild(audioEl);
                            }

                            const downloadBtn = document.createElement('button');
                            downloadBtn.className = 'btn btn-secondary';
                            downloadBtn.style.cssText = 'width: 38px; height: 38px; padding: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 8px;';
                            downloadBtn.title = '下载语音';

                            const downloadIcon = `
                                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                            `;
                            downloadBtn.innerHTML = downloadIcon;

                            downloadBtn.onclick = (e) => {
                                e.stopPropagation();
                                if (typeof downloadMediaFileIconMode === 'function') {
                                    downloadMediaFileIconMode(url, `【${memberName}】翻牌语音_${item.questionId}.mp3`, downloadBtn, downloadIcon);
                                }
                            };

                            audioRow.appendChild(downloadBtn);
                            answerDiv.appendChild(audioRow);
                        } else if (item.answerType === 3) {
                            if (typeof createCustomVideoPlayer === 'function') {
                                answerDiv.appendChild(createCustomVideoPlayer(url));
                            } else {
                                const video = document.createElement('video');
                                video.src = url;
                                video.controls = true;
                                video.style.cssText = 'max-width:100%; max-height:300px; border-radius:8px; background:#000;';
                                answerDiv.appendChild(video);
                            }
                        }
                    }
                } catch (e) {
                    const errDiv = document.createElement('div');
                    errDiv.style.color = '#ff4d4f';
                    errDiv.innerText = '无法解析回答内容';
                    answerDiv.appendChild(errDiv);
                }
                card.appendChild(answerDiv);
            }
            return card;
        }

        function toggleFlipTypeDropdown() {
            const list = document.getElementById('flip-type-dropdown');
            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        }

        const flipDatePickerState = {
            activeTarget: 'from',
            displayYear: null,
            displayMonth: null
        };

        function padFlipDatePart(value) {
            return String(value).padStart(2, '0');
        }

        function toFlipDateValue(year, monthIndex, day) {
            return `${year}-${padFlipDatePart(monthIndex + 1)}-${padFlipDatePart(day)}`;
        }

        function parseFlipDateValue(value) {
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

        function formatFlipDateDisplay(value) {
            return value ? String(value).replace(/-/g, '/') : '请选择';
        }

        function getFlipDateInput(target) {
            return document.getElementById(target === 'to' ? 'flip-time-to' : 'flip-time-from');
        }

        function getFlipDateValue(target) {
            const input = getFlipDateInput(target);
            return input ? input.value : '';
        }

        function syncFlipDateTriggerState() {
            const trigger = document.querySelector('#flip-date-wrapper .flip-date-trigger');
            if (!trigger) return;
            const fromInput = document.getElementById('flip-time-from');
            const toInput = document.getElementById('flip-time-to');
            const hasValue = !!((fromInput && fromInput.value) || (toInput && toInput.value));
            trigger.classList.toggle('is-active', hasValue);
        }

        function syncFlipDateFieldDisplays() {
            const fromDisplay = document.getElementById('flip-time-from-display');
            const toDisplay = document.getElementById('flip-time-to-display');
            const fromValue = getFlipDateValue('from');
            const toValue = getFlipDateValue('to');

            if (fromDisplay) {
                const valueNode = fromDisplay.querySelector('.flip-date-field-card-value');
                if (valueNode) valueNode.textContent = formatFlipDateDisplay(fromValue);
                fromDisplay.classList.toggle('is-active', flipDatePickerState.activeTarget === 'from');
            }

            if (toDisplay) {
                const valueNode = toDisplay.querySelector('.flip-date-field-card-value');
                if (valueNode) valueNode.textContent = formatFlipDateDisplay(toValue);
                toDisplay.classList.toggle('is-active', flipDatePickerState.activeTarget === 'to');
            }
        }

        function setFlipDateCalendarMonth(dateValue = '') {
            const parsed = parseFlipDateValue(dateValue);
            const baseDate = parsed
                ? new Date(parsed.year, parsed.month, parsed.day)
                : new Date();
            flipDatePickerState.displayYear = baseDate.getFullYear();
            flipDatePickerState.displayMonth = baseDate.getMonth();
        }

        function renderFlipDateCalendar() {
            const label = document.getElementById('flip-date-calendar-label');
            const grid = document.getElementById('flip-date-calendar-grid');
            if (!label || !grid) return;

            if (flipDatePickerState.displayYear === null || flipDatePickerState.displayMonth === null) {
                setFlipDateCalendarMonth(getFlipDateValue(flipDatePickerState.activeTarget));
            }

            syncFlipDateFieldDisplays();

            const year = flipDatePickerState.displayYear;
            const month = flipDatePickerState.displayMonth;
            label.textContent = `${year}年${padFlipDatePart(month + 1)}月`;

            const firstDay = new Date(year, month, 1);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const prevMonthDays = new Date(year, month, 0).getDate();
            const startOffset = (firstDay.getDay() + 6) % 7;
            const fromValue = getFlipDateValue('from');
            const toValue = getFlipDateValue('to');
            const fromMs = parseFlipFilterDate(fromValue, false);
            const toMs = parseFlipFilterDate(toValue, true);
            const todayValue = (() => {
                const now = new Date();
                return toFlipDateValue(now.getFullYear(), now.getMonth(), now.getDate());
            })();

            grid.innerHTML = '';

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

                const value = toFlipDateValue(cellYear, cellMonth, day);
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'flip-calendar-day';
                if (isMuted) button.classList.add('is-muted');
                if (value === fromValue || value === toValue) button.classList.add('is-selected');
                if (value === todayValue) button.classList.add('is-today');

                const dayMs = parseFlipFilterDate(value, false);
                if (fromMs !== null && toMs !== null && dayMs !== null && dayMs >= fromMs && dayMs <= toMs) {
                    button.classList.add('is-in-range');
                }

                button.textContent = String(day);
                button.onclick = () => selectFlipCalendarDate(value);
                grid.appendChild(button);
            }
        }

        function toggleFlipDateDropdown() {
            const list = document.getElementById('flip-date-dropdown');
            if (!list) return;
            const willOpen = list.style.display !== 'block';
            list.style.display = willOpen ? 'block' : 'none';
            if (willOpen) {
                setFlipDateCalendarMonth(getFlipDateValue(flipDatePickerState.activeTarget));
                renderFlipDateCalendar();
            }
        }

        function openFlipDatePicker(inputId) {
            setActiveFlipDateField(inputId === 'flip-time-to' ? 'to' : 'from');
            const list = document.getElementById('flip-date-dropdown');
            if (list && list.style.display !== 'block') {
                toggleFlipDateDropdown();
            }
        }

        function setActiveFlipDateField(target) {
            flipDatePickerState.activeTarget = target === 'to' ? 'to' : 'from';
            setFlipDateCalendarMonth(getFlipDateValue(flipDatePickerState.activeTarget));
            renderFlipDateCalendar();
        }

        function shiftFlipDateCalendarMonth(offset) {
            if (!Number.isFinite(offset)) return;
            if (flipDatePickerState.displayYear === null || flipDatePickerState.displayMonth === null) {
                setFlipDateCalendarMonth(getFlipDateValue(flipDatePickerState.activeTarget));
            }
            const nextDate = new Date(flipDatePickerState.displayYear, flipDatePickerState.displayMonth + offset, 1);
            flipDatePickerState.displayYear = nextDate.getFullYear();
            flipDatePickerState.displayMonth = nextDate.getMonth();
            renderFlipDateCalendar();
        }

        function shiftFlipDateCalendarYear(offset) {
            if (!Number.isFinite(offset)) return;
            if (flipDatePickerState.displayYear === null || flipDatePickerState.displayMonth === null) {
                setFlipDateCalendarMonth(getFlipDateValue(flipDatePickerState.activeTarget));
            }
            flipDatePickerState.displayYear += offset;
            renderFlipDateCalendar();
        }

        function selectFlipCalendarDate(value) {
            const input = getFlipDateInput(flipDatePickerState.activeTarget);
            if (!input) return;
            input.value = value;
            applyFlipTimeRangeFilter();
            renderFlipDateCalendar();
        }

        function clearActiveFlipDateField() {
            const input = getFlipDateInput(flipDatePickerState.activeTarget);
            if (!input) return;
            input.value = '';
            applyFlipTimeRangeFilter();
            renderFlipDateCalendar();
        }

        function pickTodayForFlipDate() {
            const now = new Date();
            selectFlipCalendarDate(toFlipDateValue(now.getFullYear(), now.getMonth(), now.getDate()));
        }

        function toggleFlipVisibilityDropdown() {
            const list = document.getElementById('flip-visibility-dropdown');
            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        }

        function toggleFlipSortDropdown() {
            const list = document.getElementById('flip-sort-dropdown');
            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        }

        function selectFlipType(value, text) {
            const displayInput = document.getElementById('flip-type-display');
            if (displayInput) displayInput.value = text;

            const dropdown = document.getElementById('flip-type-dropdown');
            if (dropdown) dropdown.style.display = 'none';

            applyFlipFilter(value);
        }

        function applyFlipFilter(value) {
            if (typeof setCurrentFlipFilterType === 'function') {
                setCurrentFlipFilterType(value);
            }
            if (typeof setCurrentFlipPage === 'function') {
                setCurrentFlipPage(0);
            }
            renderLocalPage(0);
        }

        function selectFlipVisibilityFilter(value, text) {
            const displayInput = document.getElementById('flip-visibility-display');
            if (displayInput) displayInput.value = text;

            const dropdown = document.getElementById('flip-visibility-dropdown');
            if (dropdown) dropdown.style.display = 'none';

            if (typeof setCurrentFlipPrivacyFilter === 'function') {
                setCurrentFlipPrivacyFilter(value);
            }
            if (typeof setCurrentFlipPage === 'function') {
                setCurrentFlipPage(0);
            }
            renderLocalPage(0);
        }

        function selectFlipSort(value, text) {
            const displayInput = document.getElementById('flip-sort-display');
            if (displayInput) displayInput.value = text;

            const dropdown = document.getElementById('flip-sort-dropdown');
            if (dropdown) dropdown.style.display = 'none';

            if (typeof setCurrentFlipSort === 'function') {
                setCurrentFlipSort(value);
            }
            if (typeof setCurrentFlipPage === 'function') {
                setCurrentFlipPage(0);
            }
            renderLocalPage(0);
        }

        function applyFlipTimeRangeFilter() {
            const fromInput = document.getElementById('flip-time-from');
            const toInput = document.getElementById('flip-time-to');

            if (typeof setCurrentFlipTimeFrom === 'function') {
                setCurrentFlipTimeFrom(fromInput ? fromInput.value : '');
            }
            if (typeof setCurrentFlipTimeTo === 'function') {
                setCurrentFlipTimeTo(toInput ? toInput.value : '');
            }
            if (typeof setCurrentFlipPage === 'function') {
                setCurrentFlipPage(0);
            }
            syncFlipDateTriggerState();
            syncFlipDateFieldDisplays();
            renderLocalPage(0);
        }

        function parseFlipFilterDate(value, isEnd = false) {
            if (!value) return null;
            const normalized = String(value).trim().replace(/\//g, '-');
            const suffix = isEnd ? 'T23:59:59.999' : 'T00:00:00';
            const parsed = new Date(`${normalized}${suffix}`).getTime();
            return Number.isFinite(parsed) ? parsed : null;
        }

        function resetFlipTimeRangeFilter() {
            const fromInput = document.getElementById('flip-time-from');
            const toInput = document.getElementById('flip-time-to');
            if (fromInput) fromInput.value = '';
            if (toInput) toInput.value = '';

            if (typeof setCurrentFlipTimeFrom === 'function') {
                setCurrentFlipTimeFrom('');
            }
            if (typeof setCurrentFlipTimeTo === 'function') {
                setCurrentFlipTimeTo('');
            }
            if (typeof setCurrentFlipPage === 'function') {
                setCurrentFlipPage(0);
            }
            syncFlipDateTriggerState();
            syncFlipDateFieldDisplays();
            renderLocalPage(0);
        }

        function applyFlipSearch() {
            const input = document.getElementById('flipSearchInput');
            if (!input) return;

            if (typeof setCurrentSearchKeyword === 'function') {
                setCurrentSearchKeyword(input.value.trim());
            }
            if (typeof setCurrentFlipPage === 'function') {
                setCurrentFlipPage(0);
            }
            renderLocalPage(0);
        }

        function changeFlipPage(delta) {
            const currentPage = typeof getCurrentFlipPage === 'function' ? getCurrentFlipPage() : 0;
            const newPage = currentPage + delta;
            if (newPage < 0) return;
            renderLocalPage(newPage);
        }

        function getFilteredData() {
            let result = getFlipData();
            const currentFlipFilterType = typeof getCurrentFlipFilterType === 'function' ? getCurrentFlipFilterType() : '0';
            const currentFlipPrivacyFilter = typeof getCurrentFlipPrivacyFilter === 'function' ? getCurrentFlipPrivacyFilter() : '0';
            const currentFlipTimeFrom = typeof getCurrentFlipTimeFrom === 'function' ? getCurrentFlipTimeFrom() : '';
            const currentFlipTimeTo = typeof getCurrentFlipTimeTo === 'function' ? getCurrentFlipTimeTo() : '';
            const currentSearchKeyword = typeof getCurrentSearchKeyword === 'function' ? getCurrentSearchKeyword() : '';

            if (currentFlipFilterType !== '0') {
                result = result.filter(item => item.answerType == currentFlipFilterType);
            }

            if (currentFlipPrivacyFilter !== '0') {
                result = result.filter(item => String(item.type) === String(currentFlipPrivacyFilter));
            }

            if (currentFlipTimeFrom || currentFlipTimeTo) {
                const fromMs = parseFlipFilterDate(currentFlipTimeFrom, false);
                const toMs = parseFlipFilterDate(currentFlipTimeTo, true);

                result = result.filter(item => {
                    const questionMs = Number(item.qtime) || null;
                    const answerMs = Number(item.answerTime) || null;
                    const candidates = [questionMs, answerMs].filter(value => Number.isFinite(value) && value > 0);
                    if (candidates.length === 0) return false;

                    return candidates.some(timeMs => {
                        if (fromMs !== null && timeMs < fromMs) return false;
                        if (toMs !== null && timeMs > toMs) return false;
                        return true;
                    });
                });
            }

            if (currentSearchKeyword) {
                const lowerKey = currentSearchKeyword.toLowerCase();
                result = result.filter(item => {
                    const qContent = (item.content || '').toLowerCase();
                    const aContent = (item.answerContent || '').toLowerCase();
                    const memberName = ((item.baseUserInfo && item.baseUserInfo.nickname) || '').toLowerCase();

                    return qContent.includes(lowerKey) ||
                        aContent.includes(lowerKey) ||
                        memberName.includes(lowerKey);
                });
            }

            return result;
        }

        async function loadFlipList(pageIndex) {
            const data = getFlipData();
            const isFetching = typeof getIsFetchingFlips === 'function' ? getIsFetchingFlips() : false;

            if (data.length === 0 && !isFetching) {
                await startAutoFetchAll();
            } else {
                renderLocalPage(pageIndex);
            }
        }

        function forceReloadFlips() {
            setFlipData([]);
            if (typeof setCurrentFlipPage === 'function') {
                setCurrentFlipPage(0);
            }
            if (typeof setCurrentSearchKeyword === 'function') {
                setCurrentSearchKeyword('');
            }

            const input = document.getElementById('flipSearchInput');
            if (input) input.value = '';

            void loadFlipList(0);
        }

        async function updateLatestFlips() {
            const token = getSafeToken();
            if (!token) return;

            try {
                const res = await ipcRenderer.invoke('fetch-flip-list', {
                    token,
                    pa: getSafePa(),
                    beginLimit: 0,
                    limit: 20
                });

                if (res.success && res.content) {
                    const latestList = res.content || [];
                    const nextData = [...getFlipData()];
                    let addedCount = 0;

                    latestList.reverse().forEach(newItem => {
                        const existingIndex = nextData.findIndex(item => String(item.questionId) === String(newItem.questionId));
                        if (existingIndex !== -1) {
                            nextData[existingIndex] = newItem;
                        } else {
                            nextData.unshift(newItem);
                            addedCount++;
                        }
                    });

                    setFlipData(nextData);
                }
            } catch (e) { }

            if (typeof setCurrentSearchKeyword === 'function') {
                setCurrentSearchKeyword('');
            }
            const input = document.getElementById('flipSearchInput');
            if (input) input.value = '';

            if (typeof setCurrentFlipPage === 'function') {
                setCurrentFlipPage(0);
            }
            renderLocalPage(0);
        }

        async function startAutoFetchAll() {
            const container = document.getElementById('flip-list-container');
            const pagination = document.querySelector('#view-flip .pagination-container');

            const token = getSafeToken();
            if (!token) {
                if (container) {
                    container.innerHTML = '<div class="placeholder-tip"><h3>未登录</h3><p>请先前往“账号设置”页面验证 Token。</p></div>';
                }
                return;
            }

            if (typeof setIsFetchingFlips === 'function') {
                setIsFetchingFlips(true);
            }
            if (pagination) pagination.style.display = 'none';
            if (container) {
                container.innerHTML = '<div class="empty-state" style="padding:40px;"><h3>正在同步数据...</h3><p>正在拉取所有历史记录，完成后将自动显示。</p></div>';
            }

            let nextData = getFlipData().slice();
            let beginLimit = 0;
            let hasMore = true;
            const pa = getSafePa();

            try {
                while (hasMore) {
                    const res = await ipcRenderer.invoke('fetch-flip-list', {
                        token,
                        pa,
                        beginLimit,
                        limit: 20
                    });

                    if (res.success) {
                        const list = res.content || [];
                        if (list.length === 0) {
                            hasMore = false;
                        } else {
                            nextData = nextData.concat(list);
                            beginLimit += list.length;
                            if (list.length < 20) {
                                hasMore = false;
                            } else {
                                await new Promise(resolve => setTimeout(resolve, 50));
                            }
                        }
                    } else {
                        hasMore = false;
                    }
                }
            } catch (e) {
            } finally {
                setFlipData(nextData);
                if (typeof setIsFetchingFlips === 'function') {
                    setIsFetchingFlips(false);
                }
                renderLocalPage(0);
            }
        }

        function renderLocalPage(pageIndex) {
            const container = document.getElementById('flip-list-container');
            const statusText = document.getElementById('flip-status-text');
            const pagination = document.querySelector('#view-flip .pagination-container');

            if (!container || !statusText) return;

            const currentFlipSort = typeof getCurrentFlipSort === 'function' ? getCurrentFlipSort() : null;
            const currentSearchKeyword = typeof getCurrentSearchKeyword === 'function' ? getCurrentSearchKeyword() : '';
            let filteredData = getFilteredData();

            if (currentFlipSort) {
                if (currentFlipSort === 'latest_desc') {
                    filteredData.sort((a, b) => Number(b.qtime) - Number(a.qtime));
                } else if (currentFlipSort === 'latest_asc') {
                    filteredData.sort((a, b) => Number(a.qtime) - Number(b.qtime));
                } else if (currentFlipSort === 'cost_desc') {
                    filteredData.sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0));
                } else if (currentFlipSort === 'cost_asc') {
                    filteredData.sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0));
                } else if (currentFlipSort === 'speed_fast') {
                    filteredData.sort((a, b) => {
                        const durA = getFlipDuration(a);
                        const durB = getFlipDuration(b);
                        if (durA === -1) return 1;
                        if (durB === -1) return -1;
                        return durA - durB;
                    });
                } else if (currentFlipSort === 'speed_slow') {
                    filteredData.sort((a, b) => {
                        const durA = getFlipDuration(a);
                        const durB = getFlipDuration(b);
                        return durB - durA;
                    });
                } else {
                    filteredData.sort((a, b) => Number(b.qtime) - Number(a.qtime));
                }
            }

            const pageSize = getFlipPageSize();
            const start = pageIndex * pageSize;
            const end = start + pageSize;
            const pageData = filteredData.slice(start, end);

            if (typeof setCurrentFlipPage === 'function') {
                setCurrentFlipPage(pageIndex);
            }

            const hasData = getFlipData().length > 0;
            const sidebarBtn = document.getElementById('flipAnalysisBtn');
            if (sidebarBtn) {
                if (hasData) {
                    sidebarBtn.disabled = false;
                    sidebarBtn.style.opacity = '1';
                    sidebarBtn.style.cursor = 'pointer';
                    sidebarBtn.title = '';
                } else {
                    sidebarBtn.disabled = true;
                    sidebarBtn.style.opacity = '0.5';
                    sidebarBtn.style.cursor = 'not-allowed';
                    sidebarBtn.title = '暂无数据，请先在翻牌记录页刷新数据';
                }
            }

            statusText.innerHTML = '';
            const headerBtn = document.createElement('button');
            headerBtn.className = 'btn btn-secondary';
            headerBtn.style.cssText = 'padding: 0 15px; transition: all 0.2s;';
            headerBtn.innerHTML = '翻牌统计';

            if (hasData) {
                headerBtn.disabled = false;
                headerBtn.onclick = function () {
                    if (sidebarBtn) sidebarBtn.click();
                    else if (typeof window.openFlipAnalysis === 'function') window.openFlipAnalysis();
                };
            } else {
                headerBtn.disabled = true;
                headerBtn.style.opacity = '0.5';
                headerBtn.style.cursor = 'not-allowed';
                headerBtn.title = '暂无数据，请先点击右侧“刷新”按钮获取数据';
            }

            statusText.appendChild(headerBtn);

            if (currentSearchKeyword) {
                const searchTip = document.createElement('span');
                searchTip.style.cssText = 'margin-left: 10px; font-size: 12px; color: var(--text-sub); vertical-align: middle;';
                searchTip.innerText = `(搜到 ${filteredData.length} 条)`;
                statusText.appendChild(searchTip);
            }

            container.innerHTML = '';
            if (pageData.length === 0) {
                container.innerHTML = '<div class="empty-state">没有符合条件的数据</div>';
                updateFlipSevenDayCountdowns();
            } else {
                const fragment = document.createDocumentFragment();
                pageData.forEach(item => {
                    fragment.appendChild(createFlipCardDOM(item));
                });
                container.appendChild(fragment);
                startFlipSevenDayCountdownTimer();
            }

            const viewFlip = document.getElementById('view-flip');
            if (viewFlip) viewFlip.scrollTop = 0;

            if (pagination) {
                pagination.style.display = 'flex';
                renderFlipPagination(filteredData.length);
            }
        }

        function renderFlipPagination(totalCount) {
            const paginationContainer = document.querySelector('#view-flip .pagination-container');
            if (!paginationContainer) return;

            paginationContainer.innerHTML = '';
            const totalPages = Math.ceil(totalCount / getFlipPageSize()) || 1;
            const currentPage = typeof getCurrentFlipPage === 'function' ? getCurrentFlipPage() : 0;

            const firstBtn = document.createElement('button');
            firstBtn.className = 'pagination-btn';
            firstBtn.innerText = '首页';
            firstBtn.disabled = (currentPage === 0);
            if (firstBtn.disabled) firstBtn.style.opacity = '0.5';
            firstBtn.onclick = () => renderLocalPage(0);
            paginationContainer.appendChild(firstBtn);

            const prevBtn = document.createElement('button');
            prevBtn.className = 'pagination-btn';
            prevBtn.innerText = '上一页';
            prevBtn.disabled = (currentPage === 0);
            if (prevBtn.disabled) prevBtn.style.opacity = '0.5';
            prevBtn.onclick = () => changeFlipPage(-1);
            paginationContainer.appendChild(prevBtn);

            const startPage = Math.max(0, currentPage - 2);
            const endPage = Math.min(totalPages - 1, currentPage + 2);

            for (let i = startPage; i <= endPage; i++) {
                const numBtn = document.createElement('button');
                numBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
                numBtn.innerText = i + 1;
                numBtn.onclick = () => renderLocalPage(i);
                paginationContainer.appendChild(numBtn);
            }

            const nextBtn = document.createElement('button');
            nextBtn.className = 'pagination-btn';
            nextBtn.innerText = '下一页';
            nextBtn.disabled = (currentPage >= totalPages - 1);
            if (nextBtn.disabled) nextBtn.style.opacity = '0.5';
            nextBtn.onclick = () => changeFlipPage(1);
            paginationContainer.appendChild(nextBtn);

            const lastBtn = document.createElement('button');
            lastBtn.className = 'pagination-btn';
            lastBtn.innerText = '尾页';
            lastBtn.disabled = (currentPage >= totalPages - 1);
            if (lastBtn.disabled) lastBtn.style.opacity = '0.5';
            lastBtn.onclick = () => renderLocalPage(totalPages - 1);
            paginationContainer.appendChild(lastBtn);
        }

        function getPinyinInitials(pinyinStr) {
            if (!pinyinStr) return '';
            return pinyinStr.replace(/[^A-Z]/g, '');
        }

        function handleFlipSendSearch(keyword) {
            const resultBox = document.getElementById('flip-send-search-results');
            if (!resultBox) return;

            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }

            if (!window.isMemberDataLoaded && typeof loadMemberData === 'function') {
                loadMemberData();
            }

            const lowerKw = keyword.toLowerCase();
            const members = typeof getMemberData === 'function' ? getMemberData() : [];

            let matches = members.filter(m => {
                const matchName = m.ownerName.includes(keyword);
                const pinyin = m.pinyin || '';

                let abbr = m.abbr || '';
                if (!abbr && pinyin) {
                    abbr = getPinyinInitials(pinyin);
                }

                return matchName ||
                    pinyin.toLowerCase().includes(lowerKw) ||
                    abbr.toLowerCase().includes(lowerKw);
            });

            matches.sort((a, b) => {
                const weightA = (a.isInGroup !== false) ? 1 : 0;
                const weightB = (b.isInGroup !== false) ? 1 : 0;
                return weightB - weightA;
            });

            if (matches.length > 0) {
                const html = matches.slice(0, 10).map(m => {
                    const isInactive = m.isInGroup === false;
                    const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';

                    let colorStyle = '';
                    if (typeof getTeamStyle === 'function') {
                        colorStyle = getTeamStyle(m.team, isInactive);
                    }

                    const teamHtml = m.team ? `<span class="team-tag" style="${baseStyle} ${colorStyle}">${m.team}</span>` : '';

                    return `<div class="suggestion-item" 
                 onclick="selectFlipSendMember('${m.ownerName}', '${m.id || m.userId}')"
                 style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight:bold; ${baseStyle}">${m.ownerName}</span>
                ${teamHtml}
            </div>`;
                }).join('');

                resultBox.innerHTML = html;
                resultBox.style.display = 'block';
            } else {
                resultBox.style.display = 'none';
            }
        }

        function selectFlipSendMember(name, id) {
            const memberInput = document.getElementById('flip-send-member-input');
            const memberIdInput = document.getElementById('flip-send-member-id');
            const resultBox = document.getElementById('flip-send-search-results');
            const configArea = document.getElementById('flip-config-area');
            const priceLoading = document.getElementById('flip-price-loading');
            const sendMsg = document.getElementById('flip-send-msg');

            if (memberInput) memberInput.value = name;
            if (memberIdInput) memberIdInput.value = id;
            if (resultBox) resultBox.style.display = 'none';
            if (configArea) configArea.style.display = 'none';
            if (priceLoading) priceLoading.style.display = 'block';
            if (sendMsg) sendMsg.innerText = '';

            void refreshFlipUserBalance();
            void fetchFlipPrices(id);
        }

        async function refreshFlipUserBalance() {
            const balanceEl = document.getElementById('flip-user-balance');
            if (!balanceEl) return;

            const token = getSafeToken();
            if (!token) {
                balanceEl.innerText = '未登录';
                return;
            }

            try {
                const res = await ipcRenderer.invoke('fetch-user-money', { token, pa: getSafePa() });

                if (res.success && res.content) {
                    const latestMoney = res.content.moneyTotal || 0;
                    balanceEl.innerText = latestMoney;
                    const cacheApi = window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
                    if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                        cacheApi.setCacheValueSync('yaya_p48_money', latestMoney);
                    } else {
                        localStorage.setItem('yaya_p48_money', latestMoney);
                    }
                } else {
                    console.error('刷新余额失败:', res.msg);
                }
            } catch (e) {
                console.error('余额请求出错:', e);
            }
        }

        async function fetchFlipPrices(memberId) {
            const token = getSafeToken();
            const loading = document.getElementById('flip-price-loading');
            const configArea = document.getElementById('flip-config-area');
            const msgDiv = document.getElementById('flip-send-msg');

            try {
                const res = await ipcRenderer.invoke('fetch-flip-prices', { token, pa: getSafePa(), memberId });

                if (loading) loading.style.display = 'none';

                if (res.success && res.content && res.content.customs) {
                    currentFlipPrices = res.content.customs;
                    renderFlipOptions();
                    if (configArea) configArea.style.display = 'block';
                } else if (msgDiv) {
                    msgDiv.innerText = `无法获取配置: ${res.msg || '未知错误'}`;
                    msgDiv.style.color = 'red';
                }
            } catch (e) {
                if (loading) loading.style.display = 'none';
                if (msgDiv) {
                    msgDiv.innerText = `错误: ${e.message}`;
                    msgDiv.style.color = 'red';
                }
            }
        }

        function toggleFlipAnswerDropdown() {
            const list = document.getElementById('flip-answer-dropdown');
            const privacyList = document.getElementById('flip-privacy-dropdown');
            const searchResult = document.getElementById('flip-send-search-results');

            if (privacyList) privacyList.style.display = 'none';
            if (searchResult) searchResult.style.display = 'none';
            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        }

        function selectFlipAnswer(val, text) {
            const answerTypeInput = document.getElementById('flip-answer-type');
            const answerDisplay = document.getElementById('flip-answer-display');
            const dropdown = document.getElementById('flip-answer-dropdown');

            if (answerTypeInput) answerTypeInput.value = val;
            if (answerDisplay) answerDisplay.value = text;
            if (dropdown) dropdown.style.display = 'none';
            updateFlipCostDisplay();
        }

        function toggleFlipPrivacyDropdown() {
            const list = document.getElementById('flip-privacy-dropdown');
            const answerList = document.getElementById('flip-answer-dropdown');
            const searchResult = document.getElementById('flip-send-search-results');

            if (answerList) answerList.style.display = 'none';
            if (searchResult) searchResult.style.display = 'none';
            if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        }

        function selectFlipPrivacy(val, text) {
            const privacyTypeInput = document.getElementById('flip-privacy-type');
            const privacyDisplay = document.getElementById('flip-privacy-display');
            const dropdown = document.getElementById('flip-privacy-dropdown');

            if (privacyTypeInput) privacyTypeInput.value = val;
            if (privacyDisplay) privacyDisplay.value = text;
            if (dropdown) dropdown.style.display = 'none';
            updateFlipCostDisplay();
        }

        function renderFlipOptions() {
            const container = document.getElementById('flip-answer-dropdown');
            const answerDisplay = document.getElementById('flip-answer-display');
            if (!container) return;

            container.innerHTML = '';

            const typeNames = { 1: '文字翻牌', 2: '语音翻牌', 3: '视频翻牌' };

            if (currentFlipPrices.length === 0) {
                container.innerHTML = '<div class="suggestion-item" style="color:#999; cursor:default;">该成员暂未开通翻牌</div>';
                if (answerDisplay) answerDisplay.value = '未开通';
                return;
            }

            currentFlipPrices.forEach((p, index) => {
                const name = typeNames[p.answerType] || `类型 ${p.answerType}`;
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerText = name;
                div.onclick = () => selectFlipAnswer(p.answerType, name);
                container.appendChild(div);

                if (index === 0) {
                    selectFlipAnswer(p.answerType, name);
                }
            });
        }

        function checkFlipCostMin() {
            const input = document.getElementById('flip-cost-input');
            const msgDiv = document.getElementById('flip-send-msg');
            if (!input) return;

            const minPrice = parseInt(input.dataset.minPrice, 10) || 0;
            const currentVal = parseInt(input.value, 10) || 0;

            if (currentVal < minPrice) {
                input.value = minPrice;
                if (msgDiv) {
                msgDiv.innerText = `鸡腿数不能低于底价 ${minPrice} 🍗`;
                    msgDiv.style.color = '#fa8c16';
                    setTimeout(() => {
                        if (msgDiv.innerText.includes('不能低于底价')) msgDiv.innerText = '';
                    }, 3000);
                }
            }
        }

        function updateFlipCostDisplay() {
            const answerTypeVal = document.getElementById('flip-answer-type')?.value;
            const privacyTypeVal = document.getElementById('flip-privacy-type')?.value;
            const costInput = document.getElementById('flip-cost-input');

            if (!costInput) return;

            if (!answerTypeVal) {
                costInput.value = '';
                costInput.dataset.minPrice = '0';
                return;
            }

            const answerType = parseInt(answerTypeVal, 10);
            const privacyType = String(privacyTypeVal);

            const config = currentFlipPrices.find(p => p.answerType === answerType);
            if (!config) {
                costInput.value = '';
                costInput.dataset.minPrice = '0';
                return;
            }

            let price = 0;
            if (privacyType === '1') price = config.normalCost;
            else if (privacyType === '2') price = config.privateCost;
            else if (privacyType === '3') price = config.anonymityCost;

            costInput.value = price;
            costInput.dataset.minPrice = String(price);
        }

        function updateFlipCharCount(input) {
            const count = input.value.length;
            const counterEl = document.getElementById('flip-content-count');
            if (!counterEl) return;

            counterEl.innerText = `${count}/200`;
            counterEl.style.color = count >= 200 ? '#ff4d4f' : '#999';
        }

        async function executeSendFlip() {
            const memberId = document.getElementById('flip-send-member-id')?.value;
            const content = document.getElementById('flip-content-input')?.value.trim() || '';
            const answerTypeVal = document.getElementById('flip-answer-type')?.value;
            const privacyTypeVal = document.getElementById('flip-privacy-type')?.value;
            const costInput = document.getElementById('flip-cost-input');
            const costText = costInput ? costInput.value : '0';
            const minPrice = costInput ? (parseInt(costInput.dataset.minPrice, 10) || 0) : 0;
            const msgDiv = document.getElementById('flip-send-msg');
            const btn = document.getElementById('btn-do-send-flip');

            if (!msgDiv || !btn) return;

            msgDiv.style.color = '#ff4d4f';

            if (!memberId) {
                msgDiv.innerText = '请先选择成员';
                return;
            }
            if (!content) {
                msgDiv.innerText = '请输入提问内容';
                return;
            }
            if (content.length > 200) {
                msgDiv.innerText = '翻牌内容不能超过 200 字';
                return;
            }
            if (!answerTypeVal || !costText) {
                msgDiv.innerText = '请选择有效的回答类型并确认鸡腿数';
                return;
            }

            const cost = parseInt(costText, 10);
            if (cost < minPrice) {
                msgDiv.innerText = `发送失败：您填写的鸡腿数不能低于官方设定的 ${minPrice} 🍗`;
                if (costInput) costInput.value = String(minPrice);
                return;
            }

            const answerType = parseInt(answerTypeVal, 10);
            const type = parseInt(privacyTypeVal, 10);

            btn.disabled = true;
            btn.innerText = '发送中...';
            msgDiv.innerText = '正在提交请求...';
            msgDiv.style.color = '#666';

            try {
                const payload = {
                    memberId: parseInt(memberId, 10),
                    content,
                    type,
                    cost,
                    answerType
                };

                const res = await ipcRenderer.invoke('send-flip-question', {
                    token: getSafeToken(),
                    pa: getSafePa(),
                    payload
                });

                if (res.success) {
                    msgDiv.innerText = '发送成功！2秒后将自动跳转到翻牌记录';
                    msgDiv.style.color = '#28a745';

                    const contentInput = document.getElementById('flip-content-input');
                    const countEl = document.getElementById('flip-content-count');
                    if (contentInput) contentInput.value = '';
                    if (countEl) {
                        countEl.innerText = '0/200';
                        countEl.style.color = '#999';
                    }

                    void refreshFlipUserBalance();

                    setTimeout(() => {
                        switchView('flip');

                        btn.disabled = false;
                        btn.innerText = '提问';
                        msgDiv.innerText = '';

                        void updateLatestFlips();
                    }, 2000);
                } else {
                    msgDiv.innerText = `发送失败: ${res.msg}`;
                    msgDiv.style.color = '#ff4d4f';
                    btn.disabled = false;
                    btn.innerText = '提问';
                }
            } catch (e) {
                msgDiv.innerText = `出错: ${e.message}`;
                msgDiv.style.color = '#ff4d4f';
                btn.disabled = false;
                btn.innerText = '提问';
            }
        }

        async function executeDeleteFlip(questionId, isWithdraw) {
            const actionName = isWithdraw ? '撤回' : '删除';
            const warning = isWithdraw
                ? '确定要撤回这条提问吗？\n撤回后鸡腿将退回到您的账户。'
                : '确定要删除这条翻牌吗？\n删除后不可恢复。';

            const confirmAction = () => {
                const token = getSafeToken();
                if (!token) {
                    showCardTip(questionId, '请先登录账号', '#ff4d4f');
                    return;
                }

                showCardTip(questionId, `正在${actionName}`, '#666');

                ipcRenderer.invoke('operate-flip-question', {
                    token,
                    pa: getSafePa(),
                    questionId,
                    operateType: 1
                }).then(res => {
                    if (res.success) {
                        showCardTip(questionId, `${actionName}成功`, '#28a745');

                        const nextData = getFlipData().filter(item => String(item.questionId) !== String(questionId));
                        setFlipData(nextData);

                        setTimeout(() => {
                            const card = document.getElementById(`flip-card-${questionId}`);
                            if (card) {
                                card.style.opacity = '0';
                                card.style.transform = 'scale(0.95)';
                                setTimeout(() => card.remove(), 300);
                            }
                        }, 500);
                    } else {
                        showCardTip(questionId, `${actionName}失败: ${res.msg}`, '#ff4d4f');
                    }
                }).catch(e => {
                    showCardTip(questionId, `出错: ${e.message}`, '#ff4d4f');
                });
            };

            if (typeof showConfirm === 'function') {
                showConfirm(warning, confirmAction);
            } else if (window.confirm(warning)) {
                confirmAction();
            }
        }

        function showCardTip(questionId, text, color) {
            const card = document.getElementById(`flip-card-${questionId}`);
            if (!card) return;

            const tipDiv = card.querySelector('.flip-action-tip') || card.querySelector('[onclick^="executeDeleteFlip"]');
            if (!tipDiv) return;

            tipDiv.innerText = text;
            tipDiv.style.color = color;
            tipDiv.style.opacity = '1';
            tipDiv.style.fontWeight = '700';

            if (color === '#ff4d4f') {
                setTimeout(() => {
                    tipDiv.style.opacity = '0';
                }, 3000);
            }
        }

        return {
            applyFlipSearch,
            changeFlipPage,
            checkFlipCostMin,
            executeDeleteFlip,
            executeSendFlip,
            forceReloadFlips,
            handleFlipSendSearch,
            loadFlipList,
            refreshFlipUserBalance,
            selectFlipAnswer,
            selectFlipPrivacy,
            selectFlipSendMember,
            selectFlipType,
            selectFlipVisibilityFilter,
            selectFlipSort,
            applyFlipTimeRangeFilter,
            clearActiveFlipDateField,
            openFlipDatePicker,
            pickTodayForFlipDate,
            selectFlipCalendarDate,
            setActiveFlipDateField,
            shiftFlipDateCalendarYear,
            shiftFlipDateCalendarMonth,
            toggleFlipAnswerDropdown,
            toggleFlipDateDropdown,
            toggleFlipPrivacyDropdown,
            toggleFlipTypeDropdown,
            toggleFlipVisibilityDropdown,
            toggleFlipSortDropdown,
            resetFlipTimeRangeFilter,
            updateFlipCharCount,
            updateLatestFlips
        };
    };
}());
