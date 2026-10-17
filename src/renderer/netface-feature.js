(function () {
    if (window.desktop?.platform === 'web') return;
    const transport = window.ipcRenderer;
    const { escapeHtml: esc } = window.YayaRendererUtils;
    const model = window.YayaNetfaceModel;
    const deviceStorageKey = 'yaya_netface_devices_v1';
    let deviceSelection = { audio: { id: '', label: '' }, video: { id: '', label: '' } };
    try {
        const saved = JSON.parse(localStorage.getItem(deviceStorageKey) || '{}');
        for (const kind of ['audio', 'video']) if (typeof saved[kind]?.id === 'string' && typeof saved[kind]?.label === 'string') {
            deviceSelection[kind] = { id: saved[kind].id.slice(0, 1024), label: saved[kind].label.slice(0, 512) };
        }
    } catch (error) { console.warn('[netface] device preferences unavailable', error); }
    const $ = id => document.getElementById(id);
    const state = { token: '', generation: 0, loading: false, loaded: false, busy: false, stale: true,
        info: {}, balance: null, events: [], active: null, engine: null, preview: null,
        timer: null, tick: null, signalId: '', signalOff: [], filter: 'all', search: '',
        group: '0', status: '', rtcStatus: '', paused: false, deadline: 0, muted: false, camera: true,
        remote: new Set(), joined: false, entering: false, ticketId: '0', tickets: [], ticketsLoaded: false, signalSequence: 0,
        started: false, expiryTimer: null, rtcReady: false, signalHealthy: false, pendingSignals: [], signalOverflow: false, lastSignalTime: 0, ending: false };
    const token = () => String(window.getAppToken?.() || '');
    let joinPending = false;
    let quitPrompt = null;
    let historySession = null;
    let deviceAudioCleanup = null;
    let devicePickerCleanup = null;
    let availabilityNoticeShown = false;
    const searchNames = new Map();
    const listMarkup = new WeakMap();
    function updateListMarkup(list, html) {
        if (listMarkup.get(list) === html) return false;
        list.innerHTML = html;
        listMarkup.set(list, html);
        return true;
    }
    const normalizeSearch = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s_-]+/g, '');
    function matchesSearch(star = {}, keyword) {
        if (!keyword) return true;
        const name = String(star.name || star.nickname || '');
        let terms = searchNames.get(name);
        if (!terms) {
            terms = [normalizeSearch(name)];
            if (window.pinyinPro?.pinyin) {
                const memberName = name.replace(/^[a-z]+\d+\s*[-－—·:]\s*/i, '');
                const parts = window.pinyinPro.pinyin(memberName, { toneType: 'none', type: 'array', surname: 'head' });
                terms.push(normalizeSearch(parts.join('')), normalizeSearch(parts.map(part => part.charAt(0)).join('')));
                searchNames.set(name, terms);
            }
        }
        return [...terms, normalizeSearch(star.pinyin), normalizeSearch(star.abbr)].some(term => term.includes(keyword));
    }
    const visible = () => $('view-netface')?.style.display !== 'none';
    document.addEventListener('pointerdown', event => {
        document.querySelectorAll('.netface-dropdown-trigger[aria-expanded="true"]').forEach(trigger => {
            const wrapper = trigger.closest('.netface-dropdown');
            if (!wrapper.contains(event.target)) {
                wrapper.querySelector('.suggestion-box').style.display = 'none';
                trigger.setAttribute('aria-expanded', 'false');
            }
        });
    });
    function message(text, error = false) {
        const el = $('netface-status');
        if (el) { el.textContent = text; el.dataset.error = String(error); }
        if (state.active && error && $('netface-staff')) {
            $('netface-staff').textContent = text;
            $('netface-staff').dataset.error = 'true';
        }
    }
    async function invoke(channel, payload = {}, requestToken = state.token) {
        const result = await transport.invoke(channel, { token: requestToken, pa: window.getPA?.(), ...payload });
        if (!result?.success) throw new Error(result?.msg || '请求失败，请稍后重试');
        return result;
    }
    function current(generation, requestToken) {
        return generation === state.generation && requestToken === token() && requestToken === state.token;
    }
    function safeUrl(value) {
        try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
    }
    function reservationTime(value) {
        const date = new Date(Number(value));
        if (!value || !Number.isFinite(date.getTime())) return '待公布';
        const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai',
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(v => [v.type, v.value]));
        return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    }
    function waitTime(item) {
        if (item.waitTimeStr) return item.waitTimeStr;
        const seconds = Number(item.waitTime);
        if (item.waitTime == null || !Number.isFinite(seconds) || seconds < 0) return '待更新';
        return `${Math.floor(seconds / 60)}分${Math.floor(seconds % 60)}秒`;
    }
    function styleDropdown(select) {
        let wrapper = select.closest('.netface-dropdown');
        if (!wrapper) {
            wrapper = document.createElement('div'); wrapper.className = 'netface-dropdown';
            select.before(wrapper); wrapper.appendChild(select); select.hidden = true;
            const trigger = document.createElement('button');
            trigger.type = 'button'; trigger.className = 'input-control netface-dropdown-trigger';
            trigger.id = `${select.id}-trigger`; trigger.setAttribute('aria-haspopup', 'listbox');
            trigger.setAttribute('aria-label', select.getAttribute('aria-label') || '选择活动');
            const list = document.createElement('div'); list.className = 'suggestion-box';
            list.id = `${select.id}-options`; list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', trigger.getAttribute('aria-label'));
            trigger.setAttribute('aria-controls', list.id); trigger.setAttribute('aria-expanded', 'false');
            wrapper.append(trigger, list);
            const close = () => { list.style.display = 'none'; trigger.setAttribute('aria-expanded', 'false'); };
            trigger.onclick = () => {
                const open = list.style.display !== 'block';
                document.querySelectorAll('.netface-dropdown-trigger[aria-expanded="true"]').forEach(v => { if (v !== trigger) v.click(); });
                list.style.display = open ? 'block' : 'none'; trigger.setAttribute('aria-expanded', String(open));
            };
            wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget)) close(); });
            wrapper.addEventListener('keydown', event => {
                const options = [...list.querySelectorAll('button')];
                if (event.key === 'Escape' && list.style.display === 'block') { event.preventDefault(); event.stopPropagation(); close(); trigger.focus(); }
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault(); list.style.display = 'block'; trigger.setAttribute('aria-expanded', 'true');
                    const index = options.indexOf(document.activeElement);
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? (index + 1) % options.length : (index < 0 ? options.length - 1 : (index - 1 + options.length) % options.length);
                    options[next]?.focus();
                }
            });
            select.addEventListener('change', () => styleDropdown(select));
        }
        const trigger = wrapper.querySelector('.netface-dropdown-trigger');
        const list = wrapper.querySelector('.suggestion-box');
        trigger.innerHTML = `<span>${esc(select.selectedOptions[0]?.textContent || '请选择')}</span><span class="netface-dropdown-arrow" aria-hidden="true">▼</span>`;
        list.replaceChildren();
        for (const option of select.options) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'suggestion-item';
            button.textContent = option.textContent; button.disabled = option.disabled;
            button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(option.selected));
            button.onclick = () => { select.value = option.value; list.style.display = 'none'; trigger.setAttribute('aria-expanded', 'false'); select.dispatchEvent(new Event('change', { bubbles: true })); trigger.focus(); };
            list.appendChild(button);
        }
    }
    function updateCaptureButtons() {
        const icons = {
            mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
            camera: '<rect x="3" y="5" width="12" height="14" rx="2"/><path d="m15 9 6-4v14l-6-4"/>'
        };
        for (const [type, enabled, name] of [['mic', !state.muted, '麦克风'], ['camera', state.camera, '摄像头']]) {
            const button = $(`netface-${type}`);
            button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[type]}${enabled ? '' : '<path d="m2 2 20 20"/>'}</svg>`;
            const label = `${enabled ? '关闭' : '开启'}${name}`;
            button.setAttribute('aria-label', label); button.title = label;
            button.setAttribute('aria-pressed', String(enabled));
        }
    }
    function shell() {
        const view = $('view-netface');
        if (view.dataset.initialized) return;
        view.dataset.initialized = 'true';
        view.innerHTML = `<div class="netface-page">
            <section id="netface-overview" class="netface-overview">
            <div class="netface-heading"><h2 id="netface-activity">正在加载活动…</h2>
                <div class="netface-summary-actions"><button class="btn btn-secondary" id="netface-choose-activity">选择活动</button><button class="btn btn-secondary" id="netface-refresh">刷新</button></div></div>
            <div class="netface-summary"><div class="netface-balance-block"><span class="netface-label">我的握手资格</span><div><strong id="netface-balance">—</strong><span>次</span></div></div>
                <div class="netface-summary-actions"><button class="btn btn-primary" id="netface-redeem">兑换资格</button><button class="btn btn-secondary" id="netface-history">兑换记录</button><button class="btn btn-secondary" id="netface-device">设备检查</button></div></div>
            </section>
            <section id="netface-call" class="netface-call" hidden>
                <div class="netface-call-heading"><strong id="netface-call-title">云握手房间</strong><div id="netface-staff" role="status"></div><span id="netface-call-status">准备连接</span></div>
                <div class="netface-videos"><div class="netface-video"><div class="netface-video-stage"><canvas id="netface-remote-canvas" width="720" height="1280"></canvas></div><span>成员画面</span></div><div class="netface-video"><div class="netface-video-stage"><canvas id="netface-local-canvas" width="720" height="1280"></canvas></div><span>我的画面</span></div></div>
                <div class="netface-call-actions"><button type="button" class="btn btn-secondary netface-icon-button" id="netface-mic"></button><button type="button" class="btn btn-secondary netface-icon-button" id="netface-camera"></button><button type="button" class="btn" id="netface-quit">结束</button></div>
            </section>
            <section id="netface-browse" class="netface-browse">
            <div class="netface-toolbar"><div class="netface-tabs"><button class="btn btn-secondary is-active" id="netface-tab-all">全部场次</button><button class="btn btn-secondary" id="netface-tab-mine">我的预约</button></div>
                <select id="netface-group" class="input-control" aria-label="选择团体"><option value="0">全部团体</option></select><input id="netface-search" class="input-control" placeholder="成员名 / 拼音 / 首字母" aria-label="搜索成员姓名、拼音或首字母"></div>
            <div id="netface-status" role="status" aria-live="polite"></div>
            <div id="netface-list" class="netface-list"></div>
            </section>
        </div>`;
        updateCaptureButtons();
        $('netface-refresh').onclick = () => refresh(true);
        $('netface-choose-activity').onclick = chooseActivity;
        $('netface-redeem').onclick = redeem;
        $('netface-history').onclick = () => history(true);
        $('netface-device').onclick = devices;
        $('netface-tab-all').onclick = () => filter('all');
        $('netface-tab-mine').onclick = () => filter('mine');
        $('netface-group').onchange = event => { state.group = event.target.value; renderList(); };
        styleDropdown($('netface-group'));
        $('netface-search').oninput = event => { state.search = event.target.value.trim(); renderList(); };
        $('netface-mic').onclick = () => {
            if (state.ending) return;
            state.muted = !state.muted;
            syncAudio();
            updateCaptureButtons();
        };
        $('netface-camera').onclick = () => {
            if (state.ending) return;
            state.camera = !state.camera;
            state.engine?.enableCamera(state.camera);
            updateCaptureButtons();
        };
        $('netface-quit').onclick = () => quit(true);
    }
    function filter(value) {
        state.filter = value;
        $('netface-tab-all').classList.toggle('is-active', value === 'all');
        $('netface-tab-mine').classList.toggle('is-active', value === 'mine');
        renderList();
    }
    function renderList() {
        const list = $('netface-list');
        if (!list) return;
        const keyword = normalizeSearch(state.search);
        const events = state.events.filter(item => (state.filter !== 'mine' || item.ordered)
            && (state.group === '0' || String(item.groupId) === state.group)
            && matchesSearch(item.starInfo, keyword));
        if (!events.length) {
            const initialLoading = state.loading && !state.loaded;
            updateListMarkup(list, `<div class="netface-empty">${initialLoading ? '<span class="netface-empty-icon">◌</span>' : ''}<strong>${initialLoading ? '正在获取云握手场次' : state.stale ? '暂时无法获取场次' : state.filter === 'mine' ? '还没有预约' : '暂无云握手场次'}</strong><p>${state.stale ? '请点击刷新重试。' : '活动开放后，可在这里选择成员并预约。'}</p></div>`);
            return;
        }
        const html = events.map(item => {
            const star = item.starInfo || {};
            let avatar = safeUrl(star.avatar);
            if (!avatar && star.avatar && !/^[a-z]+:/i.test(star.avatar)) avatar = safeUrl(`https://source.48.cn/${String(star.avatar).replace(/^\//, '')}`);
            const canReserve = Number(item.status) === 1 && !item.ordered;
            const canJoin = item.ordered && [3, 4].includes(Number(item.status));
            const label = canJoin ? '进入房间' : canReserve ? '预约' : model.statusText[Number(item.status)] || '活动状态待确认';
            const name = star.name || star.nickname || '成员';
            const groupName = star.groupName || state.info.groupInfos?.find(group => String(group.groupId) === String(item.groupId))?.groupName || '';
            const teamName = star.teamName || item.teamName || '';
            const affiliation = [groupName, teamName].filter(Boolean).join(' · ');
            const teamStyle = typeof window.getTeamStyle === 'function' ? window.getTeamStyle(teamName, false) : '';
            const bookingStatus = item.ordered ? `<span class="netface-badge">${esc(model.statusText[Number(item.status)] || '待确认')} · ${esc(item.orderNum || item.orderedTime || '—')} 次</span>` : '';
            return `<article class="netface-card" data-status="${Number(item.status)}" data-ordered="${item.ordered}"><div class="netface-member">${avatar ? `<img src="${esc(avatar)}" alt="" loading="lazy">` : '<div class="netface-avatar">☁</div>'}<div class="netface-member-info"><h3 title="${esc(name)}">${esc(name)}</h3>${affiliation ? `<div class="netface-member-affiliation"><span class="team-tag" style="${esc(teamStyle)}" title="${esc(affiliation)}">${esc(teamName || groupName)}</span></div>` : ''}</div></div>
                <div class="netface-schedule"><div><span>预约时间</span><time>${esc(reservationTime(item.queueStartTime))}</time></div><div><span>开始时间</span><time>${esc(item.startTime || '待公布')}</time></div></div>
                <div class="netface-card-meta"><div><span>${item.ordered ? '排队号' : '队列'}</span><strong>${item.ordered ? esc(item.queneNumber || item.queueNumber || '—') : `${esc(item.queueSize ?? '—')} <span class="netface-count-unit">人</span>`}</strong></div><div><span>预计等待</span><strong>${esc(waitTime(item))}</strong></div></div>
                <div class="netface-card-actions">${bookingStatus}${item.ordered && Number(item.status) === 2 ? `<button class="btn btn-secondary" data-event="${esc(item.eventId)}" data-action="cancel" ${state.busy ? 'disabled' : ''}>取消预约</button>` : `<button class="btn ${canReserve || canJoin ? 'btn-primary' : 'btn-secondary'}" data-event="${esc(item.eventId)}" data-action="${canJoin ? 'join' : 'reserve'}" ${!(canReserve || canJoin) || state.stale || state.busy || state.entering || state.active ? 'disabled' : ''}>${esc(label)}</button>`}</div>
            </article>`;
        }).join('');
        if (!updateListMarkup(list, html)) return;
        list.querySelectorAll('[data-action]').forEach(button => { button.onclick = () => {
            const item = state.events.find(v => v.eventId === button.dataset.event);
            if (button.dataset.action === 'reserve') reserve(item);
            else if (button.dataset.action === 'cancel') cancel(item);
            else join(item);
        }; });
    }
    async function refresh(manual = false) {
        if (state.loading || !visible() || !state.token) return;
        const generation = state.generation, requestToken = state.token;
        state.loading = true;
        $('netface-refresh').disabled = true;
        $('netface-refresh').setAttribute('aria-busy', 'true');
        if (!state.events.length) renderList();
        try {
            if (!state.ticketsLoaded || manual || state.ticketId === '0') {
                const catalog = await invoke('fetch-netface-activities', {}, requestToken);
                if (!current(generation, requestToken)) return;
                state.tickets = (Array.isArray(catalog.content) ? catalog.content : []).filter(v => /^\d{1,32}$/.test(String(v.ticketId)) && String(v.ticketId) !== '0');
                state.ticketsLoaded = true;
                if (state.ticketId === '0') state.ticketId = String(state.tickets[0]?.ticketId || '0');
                if (state.ticketId === '0') {
                    state.info = {}; state.events = []; state.balance = null; state.stale = false; state.loaded = true;
                    $('netface-activity').textContent = '暂无开放活动';
                    $('netface-balance').textContent = '—';
                    message('口袋当前没有返回开放的活动，可通过「选择活动」查询指定活动');
                    return;
                }
            }
            const result = await invoke('fetch-netface-events', { ticketId: state.ticketId }, requestToken);
            if (!current(generation, requestToken)) return;
            const previous = new Map(state.events.map(v => [v.eventId, Number(v.status)]));
            state.info = result.content || {};
            state.events = model.events(state.info);
            state.stale = false; state.loaded = true;
            $('netface-activity').textContent = state.info.ticketName || '当前活动';
            const groups = state.info.groupInfos || [];
            $('netface-group').innerHTML = '<option value="0">全部团体</option>' + groups.filter(v => String(v.groupId) !== '0').map(v => `<option value="${esc(v.groupId)}">${esc(v.groupName)}</option>`).join('');
            if (!groups.some(v => String(v.groupId) === state.group)) state.group = '0';
            $('netface-group').value = state.group;
            styleDropdown($('netface-group'));
            for (const item of state.events) {
                if (item.ordered && [3, 4].includes(Number(item.status)) && ![3, 4].includes(previous.get(item.eventId))) window.showToast?.(`${item.starInfo?.name || '成员'}的云握手可以入场了，请及时进入`);
            }
            renderList();
            const reads = [invoke('fetch-netface-balance', { ticketId: state.ticketId }, requestToken)];
            const ids = state.events.filter(v => v.ordered).map(v => v.eventId);
            if (ids.length) reads.push(invoke('fetch-netface-wait', { eventIds: ids }, requestToken));
            const results = await Promise.allSettled(reads);
            if (!current(generation, requestToken)) return;
            if (results[0].status === 'fulfilled') {
                state.balance = Number(results[0].value.content?.tpNum ?? 0);
                $('netface-balance').textContent = state.balance;
            } else { state.balance = null; $('netface-balance').textContent = '—'; }
            if (results[1]?.status === 'fulfilled') {
                for (const wait of results[1].value.content?.waitTimeResps || []) {
                    const item = state.events.find(v => v.eventId === String(wait.eventId));
                    if (item) { item.waitTimeStr = wait.time; item.queueSize = wait.queueSize; }
                }
                renderList();
            }
            const failure = results.find(v => v.status === 'rejected');
            message(failure ? `场次已更新，${failure.reason.message}` : state.status || '', Boolean(failure));
            if (!state.signalId && !state.active && !state.entering && state.info.chatRoomId) void connectSignals('');
        } catch (error) {
            if (current(generation, requestToken)) {
                state.stale = true;
                $('netface-activity').textContent = state.info.ticketName || state.tickets.find(v => String(v.ticketId) === state.ticketId)?.ticketName || '未选择活动';
                message(error.message, true); renderList();
            }
        } finally {
            if (current(generation, requestToken)) { state.loading = false; $('netface-refresh').disabled = false; $('netface-refresh').removeAttribute('aria-busy'); renderList(); }
        }
    }
    function modal(title, body) {
        closeModal();
        const el = document.createElement('div');
        el.id = 'netface-modal'; el.className = 'modal-overlay netface-modal'; el.style.display = 'flex';
        el.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="netface-modal-title"><div class="modal-header"><span id="netface-modal-title" class="modal-title">${esc(title)}</span><button type="button" class="modal-close close-btn" aria-label="关闭">×</button></div><div class="modal-body">${body}</div></div>`;
        document.body.appendChild(el);
        el.querySelector('.modal-close').onclick = closeModal;
        el.querySelector('input,button')?.focus();
        el.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !state.busy) closeModal();
            if (event.key === 'Tab') {
                const elements = [...el.querySelectorAll('button,input,a,select')].filter(v => !v.disabled && v.getClientRects().length);
                const first = elements[0], last = elements[elements.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        });
    }
    function closeModal() {
        if (historySession?.frame) cancelAnimationFrame(historySession.frame);
        historySession = null;
        devicePickerCleanup?.(); devicePickerCleanup = null;
        deviceAudioCleanup?.(); deviceAudioCleanup = null;
        state.preview?.getTracks().forEach(track => track.stop()); state.preview = null;
        $('netface-modal')?.remove();
    }
    async function mutation(channel, payload, success) {
        if (state.busy) return;
        state.busy = true; renderList();
        const generation = state.generation, requestToken = state.token;
        const button = $('netface-confirm'); if (button) button.disabled = true;
        try {
            const result = await invoke(channel, payload, requestToken);
            if (!current(generation, requestToken)) return;
            state.status = success;
            closeModal();
            await refresh();
            return result;
        } catch (error) {
            if (current(generation, requestToken)) {
                const el = $('netface-modal-error');
                if (el) el.textContent = error.message; else message(error.message, true);
            }
        } finally {
            if (current(generation, requestToken)) {
                state.busy = false; renderList();
                const next = $('netface-confirm'); if (next) next.disabled = false;
            }
        }
    }
    function reserve(item) {
        if (!item || Number(item.status) !== 1 || item.ordered || state.stale) return;
        const max = Math.min(state.balance ?? 0, Number(item.maxSingleNum || state.info.maxTpNum || 1), Number(state.info.maxTpNum || 999));
        if (max < 1) { message(state.balance === null ? '资格尚未获取，请刷新后再试' : '握手资格不足，请先兑换资格', true); return; }
        modal('预约云握手', `<p>成员：<strong>${esc(item.starInfo?.name || item.starInfo?.nickname)}</strong></p><p>时间：${esc(item.startTime)}</p><label class="netface-field">使用资格次数<input id="netface-count" class="input-control" type="number" min="1" max="${max}" step="1" value="1"></label><p id="netface-modal-error" role="alert"></p><button class="btn btn-primary btn-full" id="netface-confirm">确认预约</button>`);
        const input = $('netface-count');
        const updateCount = () => {
            if (input.value === '') { $('netface-confirm').disabled = true; return; }
            input.value = String(Math.min(max, Math.max(1, Math.trunc(Number(input.value)) || 1)));
            $('netface-confirm').disabled = state.busy;
            $('netface-modal-error').textContent = '';
        };
        input.oninput = updateCount;
        input.onblur = () => { if (input.value === '') input.value = '1'; updateCount(); };
        $('netface-confirm').onclick = () => {
            const count = Number($('netface-count').value);
            if (!Number.isInteger(count) || count < 1 || count > max) { $('netface-modal-error').textContent = `请输入 1–${max} 的整数`; return; }
            void mutation('reserve-netface', { eventId: item.eventId, tpNum: count }, '预约成功，请留意排队状态');
        };
    }
    function cancel(item) {
        if (!item?.ordered) return;
        modal('取消预约', `<p>取消 ${esc(item.starInfo?.name || item.starInfo?.nickname)} 的云握手预约？资格退还情况以活动规则和口袋处理结果为准。</p><p id="netface-modal-error" role="alert"></p><button id="netface-confirm" class="btn btn-danger btn-full">确认取消预约</button>`);
        $('netface-confirm').onclick = () => mutation('cancel-netface', { eventId: item.eventId }, '预约已取消');
    }
    function redeem() {
        if (state.ticketId === '0') { message('请先选择云握手活动', true); return; }
        modal('兑换握手资格', `<label class="netface-field">资格兑换码<input id="netface-key" class="input-control" autocomplete="off" maxlength="256" placeholder="输入兑换码"></label><p id="netface-modal-error" role="alert"></p><button id="netface-confirm" class="btn btn-primary btn-full">确认兑换</button>`);
        $('netface-confirm').onclick = () => mutation('activate-netface-key', { ticketId: state.ticketId, tpKey: $('netface-key').value.trim() }, '资格兑换成功');
    }
    function chooseActivity() {
        if (state.active || state.entering || state.busy) { message('请先完成当前云握手再切换活动'); return; }
        modal('选择云握手活动', `<div class="netface-field"><select id="netface-activity-select" class="input-control" aria-label="选择云握手活动"><option value="0">自动选择当前活动</option>${state.tickets.map(v => `<option value="${esc(v.ticketId)}" ${String(v.ticketId) === state.ticketId ? 'selected' : ''}>${esc(v.ticketName)}</option>`).join('')}</select></div><p id="netface-modal-error" role="alert"></p><button id="netface-confirm" class="btn btn-primary btn-full">查看活动</button>`);
        $('netface-modal').classList.add('netface-activity-modal');
        styleDropdown($('netface-activity-select'));
        $('netface-activity-select-trigger').focus();
        $('netface-confirm').onclick = () => {
            try {
                const id = $('netface-activity-select').value;
                leave(); state.ticketId = id; state.info = {}; state.events = []; state.balance = null; state.stale = true; state.loaded = false; state.status = ''; state.group = '0';
                $('netface-balance').textContent = '—';
                $('netface-activity').textContent = '正在加载活动…';
                window.enterNetfaceView();
            } catch (error) { if ($('netface-modal-error')) $('netface-modal-error').textContent = error.message; }
        };
    }
    async function history(reset) {
        if (state.ticketId === '0') { message('请先选择云握手活动', true); return; }
        if (reset) {
            modal('资格兑换记录', '<div id="netface-history-list"></div><div id="netface-history-status" role="status" aria-live="polite"></div><p id="netface-modal-error" role="alert"></p>');
            const el = $('netface-modal');
            historySession = { el, body: el.querySelector('.modal-body'), list: $('netface-history-list'),
                status: $('netface-history-status'), error: $('netface-modal-error'), generation: state.generation,
                token: state.token, ticketId: state.ticketId, next: 0, count: 0, loading: false, hasMore: true, cursors: new Set(), frame: 0 };
            const session = historySession;
            session.body.addEventListener('scroll', () => {
                if (historySession === session && session.body.scrollHeight - session.body.scrollTop - session.body.clientHeight <= 48) void history(false);
            });
        }
        const session = historySession;
        if (!session || session.loading || !session.hasMore) return;
        session.loading = true; session.status.textContent = '正在加载…'; session.error.textContent = '';
        const cursor = session.next;
        const isCurrent = () => historySession === session && $('netface-modal') === session.el && current(session.generation, session.token);
        let loaded = false;
        try {
            const result = await invoke('fetch-netface-history', { ticketId: session.ticketId, next: cursor }, session.token);
            if (!isCurrent()) return;
            const records = Array.isArray(result.content?.data) ? result.content.data : [];
            session.cursors.add(cursor);
            const next = Number(result.content?.next || 0);
            session.hasMore = records.length > 0 && Number.isFinite(next) && next > 0 && !session.cursors.has(next);
            session.next = session.hasMore ? next : 0;
            if (records.length) {
                session.list.insertAdjacentHTML('beforeend', records.map(item => `<div class="netface-history-row"><strong>${esc(item.tpNum ?? item.num ?? '—')} 次资格</strong><span>${esc(item.activeTime || item.actTime || item.createTime || item.ticketName || '')}</span></div>`).join(''));
                session.count += records.length;
            } else if (!session.count) session.list.innerHTML = '<p>暂无兑换记录</p>';
            session.status.textContent = session.hasMore ? '' : session.count ? '已加载全部记录' : '';
            loaded = true;
        } catch (error) {
            if (isCurrent()) { session.error.textContent = error.message; session.status.textContent = '滚动到底可重试'; }
        } finally {
            session.loading = false;
            if (loaded && isCurrent() && session.hasMore) {
                session.frame = requestAnimationFrame(() => {
                    session.frame = 0;
                    if (isCurrent() && session.body.scrollHeight <= session.body.clientHeight) void history(false);
                });
            }
        }
    }
    function drawMicrophoneBars(canvas, samples) {
        const context = canvas.getContext('2d'), count = 48;
        const { width, height } = canvas;
        let sum = 0;
        if (samples) for (const sample of samples) sum += sample * sample;
        const volume = samples?.length ? Math.sqrt(sum / samples.length) : 0;
        const activeCount = volume < 0.008 ? 0 : Math.round(Math.min(1, volume * 4) * count);
        context.clearRect(0, 0, width, height);
        context.lineWidth = 3; context.lineCap = 'round';
        for (let i = 0; i < count; i++) {
            const barHeight = 22;
            const x = (i + 0.5) * width / count;
            context.strokeStyle = i < activeCount ? '#42a5f5' : '#6d7076';
            context.beginPath();
            context.moveTo(x, (height - barHeight) / 2);
            context.lineTo(x, (height + barHeight) / 2);
            context.stroke();
        }
    }
    function setupMicrophoneTest(stream, el) {
        const canvas = $('netface-mic-wave'), button = $('netface-mic-test'), status = $('netface-mic-status');
        let audioContext, source, analyser, frame, disposed = false;
        const stop = () => {
            cancelAnimationFrame(frame); frame = null;
            source?.disconnect(); source = null;
            analyser?.disconnect(); analyser = null;
            if (audioContext) void audioContext.close().catch(error => console.warn('[netface] audio cleanup failed', error));
            audioContext = null;
            button.textContent = '开始试麦'; button.setAttribute('aria-pressed', 'false');
            drawMicrophoneBars(canvas);
        };
        deviceAudioCleanup = () => { disposed = true; stop(); };
        button.disabled = false;
        button.onclick = async () => {
            if (disposed) return;
            if (audioContext) { stop(); return; }
            try {
                audioContext = new AudioContext();
                source = audioContext.createMediaStreamSource(stream);
                analyser = audioContext.createAnalyser(); analyser.fftSize = 2048;
                source.connect(analyser);
                const activeContext = audioContext;
                await audioContext.resume();
                if (disposed || $('netface-modal') !== el || audioContext !== activeContext) return;
                button.textContent = '停止试麦'; button.setAttribute('aria-pressed', 'true');
                status.textContent = '请对着麦克风说话，声音越大，蓝色亮起的竖条越多。';
                const samples = new Float32Array(analyser.fftSize);
                const draw = () => {
                    analyser.getFloatTimeDomainData(samples);
                    drawMicrophoneBars(canvas, samples);
                    frame = requestAnimationFrame(draw);
                };
                draw();
            } catch (error) {
                if (disposed || $('netface-modal') !== el) return;
                stop();
                status.textContent = `无法启动试麦：${error?.message || '请重试'}`;
            }
        };
    }
    async function devices() {
        if (state.active || state.entering) { message('请先结束当前通话再检查设备'); return; }
        modal('检查麦克风 / 摄像头', `<section class="netface-device-section" aria-labelledby="netface-mic-heading">
                <h3 id="netface-mic-heading">麦克风测试</h3>
                <select id="netface-mic-select" class="input-control" aria-label="选择麦克风"><option value="">系统默认</option></select>
                <p id="netface-mic-device" class="netface-device-name">正在检测麦克风…</p>
                <div class="netface-mic-test-row"><button type="button" id="netface-mic-test" aria-pressed="false" disabled>开始试麦</button><canvas id="netface-mic-wave" width="720" height="76" role="img" aria-label="麦克风实时音量指示条"></canvas></div>
                <p id="netface-mic-status" class="netface-device-hint" role="status">点击开始试麦后，对着麦克风说话。</p>
            </section>
            <section class="netface-device-section" aria-labelledby="netface-camera-heading">
                <h3 id="netface-camera-heading">摄像头测试</h3>
                <select id="netface-camera-select" class="input-control" aria-label="选择摄像头"><option value="">系统默认</option></select>
                <p id="netface-camera-device" class="netface-device-name">正在检测摄像头…</p>
                <video id="netface-device-video" autoplay muted playsinline></video>
            </section>
            <p id="netface-device-result" role="status"></p><button type="button" class="btn btn-secondary" id="netface-device-retry" hidden>重新检查</button>`);
        const el = $('netface-modal');
        el.classList.add('netface-device-modal');
        drawMicrophoneBars($('netface-mic-wave'));
        const generation = state.generation;
        const retry = $('netface-device-retry'), result = $('netface-device-result');
        const pending = { audio: { ...deviceSelection.audio }, video: { ...deviceSelection.video } };
        const selects = { audio: $('netface-mic-select'), video: $('netface-camera-select') };
        let sequence = 0, checking = false;
        const valid = () => $('netface-modal') === el && generation === state.generation && state.token === token();
        const setBusy = value => {
            checking = value;
            for (const select of Object.values(selects)) { select.disabled = value; $(`${select.id}-trigger`).disabled = value; }
        };
        const refreshOptions = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                if (!valid()) return;
                for (const [kind, select] of Object.entries(selects)) {
                    const available = devices.filter(device => device.kind === `${kind}input` && device.deviceId && !['default', 'communications'].includes(device.deviceId));
                    const choice = pending[kind];
                    if (choice.id && !available.some(device => device.deviceId === choice.id)) {
                        const matches = available.filter(device => model.deviceName(device.label) === model.deviceName(choice.label));
                        if (matches.length === 1) choice.id = matches[0].deviceId;
                    }
                    const defaultLabel = devices.find(device => device.kind === `${kind}input` && device.deviceId === 'default')?.label
                        || (!choice.id && (kind === 'audio' ? state.preview?.getAudioTracks()[0]?.label : state.preview?.getVideoTracks()[0]?.label));
                    select.replaceChildren(new Option(defaultLabel ? `系统默认 · ${defaultLabel.replace(/^default\s*[-–:]\s*/i, '')}` : '系统默认', ''));
                    available.forEach((device, index) => select.add(new Option(device.label || `${kind === 'audio' ? '麦克风' : '摄像头'} ${index + 1}`, device.deviceId)));
                    if (choice.id && !available.some(device => device.deviceId === choice.id)) select.add(new Option(`${choice.label || '已选设备'}（未连接）`, choice.id));
                    select.value = choice.id;
                    styleDropdown(select); $(`${select.id}-trigger`).disabled = checking;
                }
            } catch (error) { console.warn('[netface] device enumeration failed', error); }
        };
        for (const select of Object.values(selects)) styleDropdown(select);
        const onDeviceChange = () => { void refreshOptions(); };
        navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange);
        devicePickerCleanup = () => { sequence++; navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange); };
        const check = async () => {
            if (!valid()) return;
            const request = ++sequence;
            setBusy(true);
            retry.hidden = true; retry.disabled = true;
            result.textContent = '';
            deviceAudioCleanup?.(); deviceAudioCleanup = null;
            $('netface-mic-test').disabled = true;
            state.preview?.getTracks().forEach(track => track.stop()); state.preview = null;
            $('netface-device-video').srcObject = null;
            $('netface-mic-device').textContent = '正在检测麦克风…';
            $('netface-camera-device').textContent = '正在检测摄像头…';
            const selection = { audio: { ...pending.audio }, video: { ...pending.video } };
            let stream;
            try {
                if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前运行环境不支持摄像头和麦克风访问');
                stream = await navigator.mediaDevices.getUserMedia(model.deviceConstraints(selection));
                if (!valid() || request !== sequence) { stream.getTracks().forEach(track => track.stop()); return; }
                $('netface-device-video').srcObject = stream;
                state.preview = stream;
                for (const [kind, tracks] of [['audio', stream.getAudioTracks()], ['video', stream.getVideoTracks()]]) {
                    if (selection[kind].id && tracks[0]?.label) selection[kind].label = tracks[0].label;
                    pending[kind] = { ...selection[kind] };
                }
                deviceSelection = selection;
                try { localStorage.setItem(deviceStorageKey, JSON.stringify(deviceSelection)); } catch (error) { console.warn('[netface] device preferences not saved', error); }
                $('netface-mic-device').textContent = '';
                $('netface-camera-device').textContent = '';
                result.textContent = '';
                setupMicrophoneTest(stream, el);
                await refreshOptions();
            } catch (error) {
                stream?.getTracks().forEach(track => track.stop());
                if (!valid() || request !== sequence) return;
                $('netface-mic-device').textContent = '未完成检测';
                $('netface-camera-device').textContent = '未完成检测';
                const reasons = {
                    NotAllowedError: '摄像头或麦克风访问被拒绝，请检查 Windows 隐私设置中的桌面应用访问权限。',
                    NotFoundError: '未找到可用的摄像头或麦克风，请检查设备是否已连接。',
                    NotReadableError: '设备无法启动，可能被其他程序占用或驱动异常，请关闭占用程序后重试。',
                    AbortError: '设备启动被中断，请重新检查。',
                    OverconstrainedError: '所选设备已不可用或不支持当前采集要求，请重新选择设备。',
                    SecurityError: '当前运行环境禁止访问摄像头或麦克风。'
                };
                result.textContent = reasons[error?.name]
                    ? `${reasons[error.name]}（${error.name}）`
                    : `设备检查失败：${error?.message || '未知错误'}${error?.name ? `（${error.name}）` : ''}`;
                console.warn('[netface] device check failed', error?.name, error?.message);
                retry.hidden = false; retry.disabled = false;
            } finally {
                if (valid() && request === sequence) setBusy(false);
            }
        };
        for (const [kind, select] of Object.entries(selects)) select.onchange = () => {
            pending[kind] = { id: select.value, label: select.value ? select.selectedOptions[0].textContent.replace(/（未连接）$/, '') : '' };
            void check();
        };
        retry.onclick = check;
        await refreshOptions();
        if (!valid()) return;
        await check();
    }
    async function connectSignals(eventId) {
        const generation = state.generation, requestToken = state.token;
        disconnectSignals();
        const id = `netface-${generation}-${++state.signalSequence}`;
        state.signalId = id;
        state.signalOff.push(transport.on('netface-signal', (_event, payload) => {
            if (payload.connectionId !== state.signalId || !current(generation, requestToken)) return;
            const signal = model.signal(payload.message);
            if (signal) {
                if (state.entering && !state.rtcReady) {
                    if (state.pendingSignals.length >= 128) { state.signalOverflow = true; return; }
                    state.pendingSignals.push(signal);
                } else handleSignal(signal);
            }
        }));
        state.signalOff.push(transport.on('netface-signal-status', (_event, payload) => {
            if (payload.connectionId !== state.signalId || !current(generation, requestToken)) return;
            state.signalHealthy = payload.status === 'connected';
            if (!state.signalHealthy && payload.status !== 'connecting') {
                if (state.active && !state.entering) finishInteraction('实时通知中断，已停止音视频，请重新进入房间');
                else message('实时通知连接中断，正在重连；排队列表仍会定时刷新', true);
            }
        }));
        try {
            const result = await transport.invoke('connect-netface-signals', { connectionId: id, ticketId: state.ticketId, eventId });
            if (!current(generation, requestToken) || state.signalId !== id) return false;
            if (!result.success) throw new Error(result.msg);
            if (eventId && state.signalOverflow) throw new Error('实时通知过多，请重新入场');
            state.signalHealthy = true;
            return true;
        } catch (error) {
            if (state.signalId === id) { disconnectSignals(); message(`实时通知暂不可用：${error.message}`, true); }
            return false;
        }
    }
    function disconnectSignals() {
        const id = state.signalId;
        state.signalId = '';
        state.signalHealthy = false;
        state.signalOff.splice(0).forEach(off => off?.());
        if (id) void transport.invoke('disconnect-netface-signals', { connectionId: id }).catch(() => {});
    }
    function syncAudio() {
        if (!state.engine || !state.rtcReady || !state.active) return;
        const audible = !state.ending && state.signalHealthy && state.started && !state.paused && state.deadline > Date.now();
        state.engine.muteMicrophone(state.muted || !audible);
        state.engine.mutePlayStreamAudio(state.active.starStreamId, !audible);
    }
    function scheduleExpiry() {
        clearTimeout(state.expiryTimer); state.expiryTimer = null;
        if (!state.active || !state.started || state.paused) return;
        state.expiryTimer = setTimeout(updateClock, Math.min(2147483647, Math.max(0, state.deadline + 5000 - Date.now())));
    }
    function finishInteraction(status, release = false) {
        const active = state.active;
        if (!active) return;
        const generation = state.generation, requestToken = state.token;
        stopRtc(); state.active = null; state.status = status; state.rtcStatus = status;
        message(status); void connectSignals('');
        if (release && !state.busy && !state.ending) {
            state.busy = true; renderList();
            void invoke('quit-netface', { eventId: active.eventId }, requestToken).catch(() => {
                if (current(generation, requestToken) && !state.active) {
                    state.status = `${status}；退出请求未成功，请在口袋客户端核实预约状态`;
                    message(state.status, true);
                }
            }).finally(() => {
                if (current(generation, requestToken)) { state.busy = false; renderList(); void refresh(true); }
            });
        } else void refresh();
    }
    function handleSignal(signal) {
        if (!state.active) { void refresh(); return; }
        const sourceId = signal.sourceId || signal.eventId;
        if (sourceId && String(sourceId) !== String(state.active.eventId)) return;
        if (!sourceId && !signal.reservationId && signal.messageType !== 'NETFACE_KICKUSER') return;
        if (signal.targetId && String(signal.targetId) !== '0' && String(signal.targetId) !== state.active.userId) return;
        if (signal.reservationId && String(signal.reservationId) !== String(state.active.reservationId)) return;
        if (!signal.reservationId && String(signal.targetId || '') !== state.active.userId) return;
        if (state.ending && !['NETFACE_END', 'NETFACE_KICKUSER'].includes(signal.messageType)) return;
        const signalTime = Number(signal.signTime) || 0;
        if (signalTime && signalTime < state.lastSignalTime) return;
        if (signal.messageType === 'NETFACE_ADMIN_MSG') { $('netface-staff').textContent = signal.text || ''; $('netface-staff').dataset.error = 'false'; return; }
        if (signal.messageType === 'NETFACE_START') {
            if (state.started || String(signal.targetId || '') === '0') return;
            const duration = Number(signal.duration ?? state.active.duration);
            if (!Number.isFinite(duration) || duration <= 0) return;
            state.started = true; state.paused = false; state.deadline = Date.now() + duration * 1000;
            state.rtcStatus = '互动中';
        } else if (signal.messageType === 'NETFACE_PAUSE') {
            if (!state.started || state.paused) return;
            state.active.remainingTime = Math.max(0, (state.deadline - Date.now()) / 1000); state.paused = true; state.rtcStatus = '工作人员已暂停互动';
        } else if (signal.messageType === 'NETFACE_CONTINUE') {
            if (!state.started || !state.paused) return;
            state.paused = false; state.deadline = Date.now() + Number(state.active.remainingTime || 0) * 1000; state.rtcStatus = '互动中';
        } else if (signal.messageType === 'NETFACE_END' || signal.messageType === 'NETFACE_KICKUSER') {
            if (String(signal.targetId || '') === '0') return;
            finishInteraction(signal.messageType === 'NETFACE_END' ? '互动已结束' : '工作人员已结束本次互动');
            return;
        } else return;
        if (signalTime) state.lastSignalTime = signalTime;
        syncAudio(); scheduleExpiry();
        updateClock();
    }
    function updateClock() {
        if (!state.active || !$('netface-call-status')) return;
        if (state.started && !state.paused && Date.now() >= state.deadline + 5000) {
            finishInteraction('互动时间已到，已停止音视频', true); return;
        }
        const remaining = state.paused ? Number(state.active.remainingTime || 0) : Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
        if (state.started && !state.paused && remaining === 0) syncAudio();
        $('netface-call-status').textContent = `${state.rtcStatus}${state.started ? ` · 剩余 ${Math.ceil(remaining)} 秒` : ''}`;
    }
    async function join(item) {
        if (!item?.ordered || state.stale || state.busy || state.entering || joinPending || state.active || ![3, 4].includes(Number(item.status))) return;
        joinPending = true;
        state.entering = true; state.rtcReady = false; state.pendingSignals = []; state.signalOverflow = false; renderList(); closeModal();
        const generation = state.generation, requestToken = state.token;
        let admitted = false, rollbackAttempted = false;
        const rollbackAdmission = async () => {
            if (!admitted || rollbackAttempted) return;
            rollbackAttempted = true;
            await invoke('quit-netface', { eventId: item.eventId }, requestToken);
        };
        try {
            const engine = window.getNetfaceRtcEngine();
            const [config, account] = await Promise.all([
                invoke('fetch-netface-rtc-config', {}, requestToken), invoke('login-check-token', {}, requestToken)
            ]);
            if (!current(generation, requestToken)) return;
            if (!Number(config.content?.appId) || !config.content?.appSign) throw new Error('口袋未返回完整的音视频配置');
            if (!await connectSignals(item.eventId)) throw new Error('工作人员通知未连接成功，请重试入场');
            const result = await invoke('join-netface', { eventId: item.eventId }, requestToken);
            admitted = true;
            if (!current(generation, requestToken)) { await rollbackAdmission(); return; }
            const info = result.content || {};
            const room = model.room(info, account.userInfo || {});
            state.active = { ...info, ...room, eventId: item.eventId };
            state.engine = engine; state.joined = false; state.ending = false; state.camera = true; state.muted = false; state.remote.clear();
            $('netface-call').hidden = false;
            $('netface-overview').hidden = true;
            $('netface-browse').hidden = true;
            $('netface-call-title').textContent = info.starInfo?.name || info.starInfo?.nickname || '成员';
            $('netface-staff').textContent = '';
            $('netface-staff').dataset.error = 'false';
            updateCaptureButtons();
            const session = model.session(info);
            state.started = session.started; state.paused = session.paused; state.lastSignalTime = 0;
            state.active.remainingTime = session.remainingTime;
            state.rtcStatus = '正在连接音视频';
            state.deadline = session.deadline;
            updateClock();
            await engine.createEngine({ appID: Number(config.content.appId), appSign: config.content.appSign, scenario: 0 });
            if (!current(generation, requestToken) || !state.active) { engine.removeAllListeners(); engine.destroyEngine(); return; }
            else model.applyRtcDevices(engine, deviceSelection);
            if (!state.signalHealthy || state.signalOverflow) throw new Error('工作人员通知连接中断，请重新入场');
            state.rtcReady = true;
            const listenRtc = (name, callback) => engine.on(name, param => {
                if (!state.active || state.engine !== engine || (param?.roomID && param.roomID !== room.roomId)) return;
                try { callback(param); }
                catch { finishInteraction('音视频设备发生异常，已停止音视频，请检查设备后重新进入房间'); }
            });
            listenRtc('onRoomStateUpdate', param => {
                if (param.errorCode) { finishInteraction(`音视频连接失败 (${param.errorCode})，已停止音视频，请重新进入房间`); return; }
                if (state.ending) return;
                if (param.state === 2) {
                    if (!state.signalHealthy) { finishInteraction('实时通知中断，已停止音视频，请重新进入房间'); return; }
                    syncAudio();
                    if (!state.joined) {
                        state.joined = true;
                        engine.startPreview({ canvas: $('netface-local-canvas'), viewMode: 0 });
                        engine.startPublishingStream(room.streamId);
                    }
                    state.rtcStatus = state.paused ? '工作人员已暂停互动' : state.deadline ? '互动中' : '已进入，等待工作人员开始互动';
                    updateClock();
                } else if (param.state !== 2) { state.rtcStatus = '音视频重连中'; updateClock(); }
            });
            listenRtc('onRoomStreamUpdate', param => {
                if (state.ending) return;
                for (const stream of param.streamList || []) {
                    if (stream.streamID !== room.starStreamId) continue;
                    if (param.updateType === 0) {
                        state.remote.add(stream.streamID);
                        engine.startPlayingStream(stream.streamID, { canvas: $('netface-remote-canvas'), viewMode: 0 });
                        syncAudio();
                    }
                    else { engine.stopPlayingStream(stream.streamID); state.remote.delete(stream.streamID); }
                }
            });
            engine.on('onPublisherStateUpdate', param => { if (param.errorCode && state.engine === engine) message(`音视频发送失败 (${param.errorCode})，请检查网络`, true); });
            engine.on('onPlayerStateUpdate', param => { if (param.errorCode && state.engine === engine) message(`成员画面连接失败 (${param.errorCode})，请检查网络`, true); });
            for (const signal of state.pendingSignals.splice(0)) handleSignal(signal);
            if (!current(generation, requestToken) || state.engine !== engine || !state.active) return;
            scheduleExpiry();
            engine.loginRoom(room.roomId, { userID: room.userId, userName: room.userName }, { isUserStatusNotify: true });
            $('netface-call').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            if (current(generation, requestToken)) { stopRtc(); state.active = null; }
            let quitFailed = false;
            if (admitted && !rollbackAttempted) { try { await rollbackAdmission(); } catch { quitFailed = true; } }
            if (current(generation, requestToken)) { message(`进入云握手失败：${error.message}${quitFailed ? '；退出请求也未成功，请在口袋客户端核实本次预约' : ''}`, true); void connectSignals(''); }
        } finally { joinPending = false; if (current(generation, requestToken)) { state.entering = false; renderList(); } }
    }
    function stopRtc() {
        quitPrompt?.cancel();
        clearTimeout(state.expiryTimer); state.expiryTimer = null;
        state.rtcReady = false; state.started = false; state.deadline = 0; state.pendingSignals = [];
        const engine = state.engine; state.engine = null; state.joined = false;
        if (engine) {
            const cleanup = [() => engine.removeAllListeners(), () => engine.muteMicrophone(true), () => engine.enableCamera(false), () => engine.stopPublishingStream(),
                () => engine.stopPreview(), ...Array.from(state.remote, id => () => engine.stopPlayingStream(id)),
                () => { if (state.active) engine.logoutRoom(state.active.roomId); }, () => engine.destroyEngine()];
            for (const action of cleanup) {
                try { Promise.resolve(action()).catch(() => {}); } catch {                                               }
            }
        }
        state.remote.clear();
        if ($('netface-call')) $('netface-call').hidden = true;
        if ($('netface-overview')) $('netface-overview').hidden = false;
        if ($('netface-browse')) $('netface-browse').hidden = false;
    }
    function confirmQuit() {
        if (quitPrompt) return quitPrompt.promise;
        const prompt = {};
        prompt.promise = new Promise(resolve => {
            const finish = accepted => { if (quitPrompt === prompt) quitPrompt = null; resolve(accepted); };
            prompt.cancel = window.showCustomConfirm('结束并离开本次云握手？提前结束后的资格处理以活动规则为准。', () => finish(true), () => finish(false));
        });
        quitPrompt = prompt;
        return prompt.promise;
    }
    async function quit(ask = false) {
        if (!state.active || state.busy) return false;
        const active = state.active;
        if (ask && !await confirmQuit()) return false;
        if (state.active !== active || state.busy) return false;
        const eventId = state.active.eventId;
        const generation = state.generation, requestToken = state.token;
        state.busy = true;
        state.ending = true;
        state.rtcStatus = '已停止本地音视频，正在退出';
        if (state.engine) {
            for (const action of [() => syncAudio(), () => state.engine.enableCamera(false), () => state.engine.stopPublishingStream(), () => state.engine.stopPreview()]) {
                try { Promise.resolve(action()).catch(() => {}); } catch {                                                           }
            }
        }
        updateClock();
        try {
            await invoke('quit-netface', { eventId });
            if (!current(generation, requestToken) || state.active !== active) return false;
            stopRtc(); state.active = null;
            state.status = '已离开云握手';
            message(state.status); void connectSignals(''); void refresh();
            return true;
        } catch (error) {
            if (current(generation, requestToken) && state.active === active) {
                state.rtcStatus = '本地音视频已停止，退出请求失败'; updateClock();
                message(`退出失败：${error.message}。本地音视频已停止，请重试结束并离开。`, true);
            }
            return false;
        }
        finally { if (current(generation, requestToken)) { state.busy = false; renderList(); } }
    }
    function leave() {
        clearInterval(state.timer); clearInterval(state.tick); state.timer = null; state.tick = null;
        disconnectSignals(); closeModal(); state.generation++; state.loading = false;
    }
    window.beforeLeaveNetfaceView = (next, mode) => {
        if (state.entering || joinPending || state.busy) { message('正在处理云握手请求，请稍候'); return false; }
        if (state.active) { void quit(true).then(ok => { if (ok) window.switchView(next, mode); }); return false; }
        leave(); availabilityNoticeShown = false; return true;
    };
    window.resetNetfaceAccountState = () => {
        searchNames.clear();
        stopRtc(); state.active = null; leave(); state.token = ''; state.info = {}; state.events = []; state.balance = null;
        state.stale = true; state.loaded = false; state.status = ''; state.busy = false; state.entering = false;
        state.tickets = []; state.ticketsLoaded = false; state.ticketId = '0';
        message('');
        if ($('netface-activity')) $('netface-activity').textContent = '正在加载活动…';
        if ($('netface-balance')) $('netface-balance').textContent = '—';
        renderList();
    };
    window.enterNetfaceView = () => {
        shell();
        if (state.token !== token()) {
            window.resetNetfaceAccountState(); state.token = token();
        }
        renderList(); void refresh(true);
        clearInterval(state.timer); clearInterval(state.tick);
        state.timer = setInterval(() => {
            if (state.token !== token()) { stopRtc(); state.active = null; leave(); window.enterNetfaceView(); return; }
            void refresh();
        }, 10000);
        state.tick = setInterval(updateClock, 1000);
        if (!availabilityNoticeShown) {
            availabilityNoticeShown = true;
            modal('注意', '<p id="netface-availability-notice">该功能可用性未经测试，当前版本仅作入口预留，不保证功能可用性。</p><button type="button" id="netface-notice-confirm" class="btn btn-primary btn-full">我已知晓风险并继续使用</button>');
            $('netface-modal').classList.add('netface-notice-modal');
            $('netface-modal').querySelector('.modal-close').remove();
            $('netface-modal').querySelector('[role="dialog"]').setAttribute('aria-describedby', 'netface-availability-notice');
            $('netface-notice-confirm').onclick = closeModal;
            $('netface-notice-confirm').focus();
        }
    };
    window.addEventListener('beforeunload', () => { stopRtc(); leave(); });
})();
