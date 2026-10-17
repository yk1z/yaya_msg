(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};
    window.YayaRendererFeatures.createMemberRoomGiftFeature = function ({ ipcRenderer, getTarget, getSessionKey = () => '', onGiftSent }) {
        let panel, toggle, header, grid, status, quantity, send, balance, host;
        let revision = 0;
        let context = null;
        let selected = null;
        let sending = false;
        let statusTimer = null;
        const cache = new Map();
        let catalogue = null;
        let latestBalance = null;
        let sessionKey = getSessionKey();
        let renderedGifts = '';
        const targetKey = target => `${target?.serverId || ''}:${target?.channelId || ''}`;

        function setStatus(message) {
            clearTimeout(statusTimer);
            statusTimer = null;
            status.textContent = message;
            status.title = message;
            if (message) statusTimer = setTimeout(() => setStatus(''), 5000);
        }

        function syncSession() {
            const current = getSessionKey();
            if (current !== sessionKey) {
                sessionKey = current;
                cache.clear();
                catalogue = null;
                latestBalance = null;
                context = null;
                selected = null;
            }
            return current;
        }

        function positionPanel() {
            if (!panel || panel.hidden) return;
            const bounds = host.getBoundingClientRect();
            const pane = host.closest('.followed-chat-pane') || host.parentElement;
            const top = Math.max(8, pane?.getBoundingClientRect().top + 8 || 8);
            panel.style.maxHeight = `${Math.max(100, Math.floor(bounds.top - top - 8))}px`;
        }

        function close() {
            revision++;
            context = null;
            selected = null;
            if (status) setStatus('');
            if (panel) panel.hidden = true;
            toggle?.setAttribute('aria-expanded', 'false');
        }

        function update() {
            const count = Number(quantity.value);
            const valid = Number.isInteger(count) && count >= 1 && count <= 999;
            const cost = selected && valid ? selected.money * count : 0;
            const enough = selected && context && valid && (selected.isPocketGift === 1
                ? count <= selected.stock : cost <= context.balance);
            send.disabled = sending || !enough;
            quantity.disabled = sending;
            send.textContent = sending ? '赠送中…' : (selected ? `赠送 ${selected.giftName}` : '赠送');
            send.title = selected ? `赠送 ${selected.giftName} × ${valid ? count : '—'}${selected.isPocketGift === 1 ? '（背包）' : `，消耗 ${valid ? cost : '—'} 🍗`}` : '请先选择礼物';
            for (const card of grid.children) {
                card.disabled = sending;
                const active = card.dataset.key === (selected ? `${selected.giftId}:${selected.isPocketGift}` : '');
                card.setAttribute('aria-pressed', String(active));
                card.classList.toggle('selected', active);
            }
        }

        function imageUrl(path) {
            try {
                const url = new URL(path, 'https://source.48.cn/');
                return url.protocol === 'https:' && (url.hostname === '48.cn' || url.hostname.endsWith('.48.cn')) ? url.href : '';
            } catch (_) { return ''; }
        }

        function renderGifts(gifts) {
            const signature = JSON.stringify(gifts);
            if (signature === renderedGifts) return;
            renderedGifts = signature;
            grid.replaceChildren();
            for (const gift of gifts) {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'gift-item member-room-gift-card';
                card.title = `${gift.giftName} · ${gift.isPocketGift === 1 ? `背包 ${gift.stock} 个` : `${gift.money} 🍗`}`;
                card.dataset.key = `${gift.giftId}:${gift.isPocketGift}`;
                const image = document.createElement('img');
                image.className = 'gift-img';
                image.alt = '';
                const url = gift.picPath && imageUrl(gift.picPath);
                if (url) image.src = url;
                else image.hidden = true;
                image.addEventListener('error', () => { image.hidden = true; });
                const name = document.createElement('span');
                name.className = 'gift-name';
                name.textContent = gift.giftName;
                const price = document.createElement('small');
                price.className = 'gift-cost';
                price.textContent = gift.isPocketGift === 1 ? `背包 × ${gift.stock}` : `${gift.money} 🍗`;
                card.append(image, name, price);
                card.addEventListener('click', () => {
                    if (sending) return;
                    selected = context?.gifts.find(item => `${item.giftId}:${item.isPocketGift}` === card.dataset.key) || gift;
                    if (context) setStatus('');
                    update();
                });
                grid.appendChild(card);
            }
        }

        async function open(successMessage = '') {
            const request = ++revision;
            const requestSession = syncSession();
            const target = { ...getTarget() };
            const key = targetKey(target);
            const cached = cache.get(key);
            const previewGifts = cached?.gifts || catalogue;
            context = null;
            selected = null;
            panel.hidden = false;
            toggle.setAttribute('aria-expanded', 'true');
            header.textContent = '赠送礼物';
            balance.textContent = latestBalance != null ? String(latestBalance) : '—';
            setStatus(successMessage || (cached ? (cached.gifts.length ? '' : '当前暂无可赠送礼物') : previewGifts ? '' : '正在加载…'));
            renderGifts(previewGifts || []);
            quantity.value = '1';
            update();
            positionPanel();
            try {
                const result = await ipcRenderer.invoke('fetch-member-room-gifts', target);
                if (request !== revision || key !== targetKey(getTarget()) || requestSession !== getSessionKey()) return;
                if (!result?.success) throw new Error(result?.msg || '获取礼物失败');
                if (targetKey(result.content?.target) !== key) throw new Error('房间已变化，请重新打开');
                context = result.content;
                catalogue = context.gifts.filter(gift => gift.isPocketGift === 0);
                latestBalance = context.balance;
                cache.delete(key);
                cache.set(key, context);
                while (cache.size > 10) cache.delete(cache.keys().next().value);
                selected = selected ? context.gifts.find(gift => gift.giftId === selected.giftId && gift.isPocketGift === selected.isPocketGift) || null : null;
                balance.textContent = String(context.balance);
                renderGifts(context.gifts);
                setStatus(successMessage || (context.gifts.length ? '' : '当前暂无可赠送礼物'));
                update();
            } catch (error) {
                if (request !== revision || key !== targetKey(getTarget()) || requestSession !== getSessionKey()) return;
                cache.delete(key);
                context = null;
                balance.textContent = '—';
                setStatus(error.message || '获取礼物失败');
                update();
            }
        }

        async function submit() {
            if (sessionKey !== getSessionKey()) { syncSession(); close(); return; }
            if (sending || send.disabled || !context || !selected) return;
            if (targetKey(context.target) !== targetKey(getTarget())) { close(); return; }
            const request = revision;
            const requestSession = sessionKey;
            const target = { ...context.target };
            const previousContext = context;
            const gift = selected;
            const count = Number(quantity.value);
            sending = true;
            setStatus('');
            update();
            let result;
            try {
                result = await ipcRenderer.invoke('send-member-room-gift', {
                    serverId: target.serverId, channelId: target.channelId, acceptUserId: target.memberId,
                    giftId: gift.giftId, giftNum: count, isPocketGift: gift.isPocketGift, unitPrice: gift.money
                });
            } catch (_) {
                result = { success: false, uncertain: true, msg: '送礼结果暂未确认，请先检查余额和房间记录，勿重复发送' };
            } finally {
                sending = false;
            }
            if (requestSession === getSessionKey()) {
                latestBalance = result?.success ? result.content?.balance ?? null : null;
                cache.set(targetKey(target), { ...previousContext, balance: latestBalance });
            }
            if (result?.success) onGiftSent?.(target);
            if (request !== revision) {
                if (!panel.hidden && targetKey(target) === targetKey(getTarget()) && requestSession === getSessionKey()) {
                    await open(result?.success ? `已送出 ${gift.giftName} × ${count}` : result?.msg || '送礼失败');
                }
                return;
            }
            if (requestSession !== getSessionKey()) { syncSession(); close(); return; }
            selected = null;
            context = null;
            update();
            if (result?.success) await open(`已送出 ${gift.giftName} × ${count}`);
            else setStatus(result?.msg || '送礼失败，请重新打开面板后再试');
        }

        function mount(form) {
            if (window.desktop?.platform === 'web' || toggle || !form) return;
            const row = form.querySelector('.followed-room-composer-row');
            if (!row) return;
            host = form;
            host.classList.add('member-room-gift-host');
            toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'btn member-room-gift-toggle';
            toggle.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13"/>
                <path d="M12 8H7.5A2.5 2.5 0 1 1 10 5.5L12 8Zm0 0h4.5A2.5 2.5 0 1 0 14 5.5L12 8Z"/>
            </svg>`;
            toggle.title = '送礼';
            toggle.setAttribute('aria-label', '送礼');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-controls', 'member-room-gift-panel');
            row.prepend(toggle);
            panel = document.createElement('section');
            panel.id = 'member-room-gift-panel';
            panel.className = 'member-room-gift-panel';
            panel.hidden = true;
            panel.setAttribute('role', 'region');
            panel.setAttribute('aria-label', '赠送礼物');
            panel.innerHTML = `<div class="member-room-gift-header">
                <div class="member-room-gift-summary"><strong>赠送礼物</strong><span class="member-room-gift-balance-label">余额 <b class="member-room-gift-balance">—</b> 🍗</span></div>
                <div class="member-room-gift-status" role="status" aria-live="polite"></div>
                <div class="member-room-gift-actions"><label>数量 <input class="member-room-gift-quantity" aria-label="礼物数量" type="number" min="1" max="999" step="1" value="1"></label>
                <button type="button" class="btn btn-primary member-room-gift-send" disabled>赠送</button><button type="button" class="member-room-gift-close" aria-label="关闭礼物面板">×</button></div></div>
                <div class="gift-grid-container member-room-gift-grid"></div>`;
            form.appendChild(panel);
            header = panel.querySelector('strong');
            balance = panel.querySelector('.member-room-gift-balance');
            grid = panel.querySelector('.member-room-gift-grid');
            status = panel.querySelector('.member-room-gift-status');
            quantity = panel.querySelector('input');
            send = panel.querySelector('.member-room-gift-send');
            panel.querySelector('.member-room-gift-close').addEventListener('click', close);
            toggle.addEventListener('click', () => panel.hidden ? void open() : close());
            quantity.addEventListener('input', update);
            panel.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
            document.addEventListener('pointerdown', event => {
                if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) close();
            });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && !panel.hidden) { close(); toggle.focus(); }
            });
            window.addEventListener('resize', positionPanel);
            send.addEventListener('click', () => { void submit(); });
        }

        return { mount, close };
    };
})();
