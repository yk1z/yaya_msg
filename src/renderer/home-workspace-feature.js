(function () {
    'use strict';

    function normalizeSearchValue(value) {
        return String(value || '').trim().toLocaleLowerCase('zh-CN');
    }

    function initContactResizing() {
        const minWidth = 220;
        const maxWidth = 420;
        const defaultWidth = Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--desktop-default-contact-width')) || 252;
        const storageKey = 'yaya_desktop_contact_widths_v1';
        const widths = {};
        const splitters = new Map();
        let railWidth = document.querySelector('.home-app-rail').getBoundingClientRect().width;
        let drag = null;
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            for (const view of ['followed-rooms', 'private-messages']) {
                if (typeof saved?.[view] === 'number' && Number.isFinite(saved[view])) widths[view] = saved[view];
            }
        } catch (_) {                                       }

        function upperBound() {
            return Math.max(minWidth, Math.min(maxWidth, Math.floor(innerWidth - railWidth - 480)));
        }

        function apply(view, requested) {
            const bound = upperBound();
            const value = Math.round(Math.max(minWidth, Math.min(bound, requested)));
            document.body.style.setProperty('--desktop-contact-width', `${value}px`);
            const splitter = splitters.get(view);
            splitter?.setAttribute('aria-valuenow', String(value));
            splitter?.setAttribute('aria-valuemax', String(bound));
            splitter?.setAttribute('aria-valuetext', `${value} 像素`);
            return value;
        }

        function save() {
            try { localStorage.setItem(storageKey, JSON.stringify(widths)); } catch (_) {                                      }
        }

        function finish(commit) {
            if (!drag) return;
            const state = drag;
            drag = null;
            document.body.classList.remove('desktop-resizing-contacts');
            if (commit) {
                widths[state.view] = state.width;
                save();
            } else apply(state.view, state.originalWidth);
            if (state.splitter.hasPointerCapture(state.pointerId)) state.splitter.releasePointerCapture(state.pointerId);
        }

        for (const [view, label] of [['followed-rooms', '房间'], ['private-messages', '私信']]) {
            const page = document.getElementById(`view-${view}`);
            if (!page) continue;
            const splitter = document.createElement('div');
            splitter.className = 'desktop-contact-splitter';
            splitter.tabIndex = 0;
            splitter.setAttribute('role', 'separator');
            splitter.setAttribute('aria-orientation', 'vertical');
            splitter.setAttribute('aria-label', `调整${label}列表宽度`);
            splitter.setAttribute('aria-valuemin', String(minWidth));
            splitter.title = '拖动调整宽度，双击恢复默认';
            page.appendChild(splitter);
            splitters.set(view, splitter);
            splitter.addEventListener('pointerdown', event => {
                if (event.button !== 0 || !event.isPrimary) return;
                event.preventDefault();
                splitter.focus({ preventScroll: true });
                const width = apply(view, widths[view] ?? defaultWidth);
                drag = { view, splitter, pointerId: event.pointerId, startX: event.clientX, originalWidth: width, width };
                splitter.setPointerCapture(event.pointerId);
                document.body.classList.add('desktop-resizing-contacts');
            });
            splitter.addEventListener('pointermove', event => {
                if (!drag || drag.splitter !== splitter || drag.pointerId !== event.pointerId) return;
                drag.width = apply(view, drag.originalWidth + event.clientX - drag.startX);
            });
            splitter.addEventListener('pointerup', event => {
                if (drag?.pointerId === event.pointerId) finish(true);
            });
            splitter.addEventListener('pointercancel', () => finish(false));
            splitter.addEventListener('lostpointercapture', () => finish(false));
            splitter.addEventListener('dblclick', () => { widths[view] = apply(view, defaultWidth); save(); });
            splitter.addEventListener('keydown', event => {
                if (event.key === 'Escape') { finish(false); return; }
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const width = widths[view] ?? defaultWidth;
                const next = event.key === 'Home' ? minWidth : event.key === 'End' ? upperBound()
                    : width + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 25 : 10);
                widths[view] = apply(view, next);
                save();
            });
        }

        function sync(view) {
            finish(false);
            if (splitters.has(view)) apply(view, widths[view] ?? defaultWidth);
        }
        window.addEventListener('resize', () => {
            railWidth = document.querySelector('.home-app-rail').getBoundingClientRect().width;
            sync(document.body.dataset.desktopView);
        });
        window.addEventListener('blur', () => finish(false));
        return sync;
    }

    function initHomeWorkspace() {
        const isDesktop = window.desktop && window.desktop.platform !== 'web';
        const input = document.getElementById('home-module-search');
        const desktopNavigation = isDesktop ? initDesktopWorkspace() : null;
        const emptyState = document.getElementById('home-search-empty');
        const homeView = document.getElementById('view-home');
        if (!input || !emptyState || !homeView) return;

        const listItems = Array.from(document.querySelectorAll('.home-conversation-item[data-home-search]'));
        const featureCards = Array.from(homeView.querySelectorAll('.home-feature-card[data-home-search]'));
        const secondarySections = Array.from(homeView.querySelectorAll('.home-tools-heading, .home-tools-row, .home-site-section'));

        function applyFilter() {
            const query = normalizeSearchValue(input.value);
            let visibleListItems = 0;
            let visibleFeatureCards = 0;

            if (desktopNavigation) visibleListItems = desktopNavigation.filter(query);
            else listItems.forEach(item => {
                    const matched = !query || normalizeSearchValue(item.dataset.homeSearch).includes(query);
                    item.hidden = !matched;
                    if (matched) visibleListItems += 1;
                });

            featureCards.forEach(card => {
                const matched = !query || normalizeSearchValue(card.dataset.homeSearch).includes(query);
                card.hidden = !matched;
                if (matched) visibleFeatureCards += 1;
            });

            secondarySections.forEach(section => {
                section.hidden = Boolean(query);
            });

            emptyState.hidden = !query || visibleListItems > 0;
            emptyState.textContent = !isDesktop && visibleFeatureCards > 0 ? '相关功能已显示在右侧' : '没有找到相关功能';
        }

        input.addEventListener('input', applyFilter);
        input.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            input.value = '';
            applyFilter();
            input.blur();
        });

        document.addEventListener('keydown', event => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 'k') return;
            if (!isDesktop && getComputedStyle(homeView).display === 'none') return;
            const view = document.body.dataset.desktopView;
            if (isDesktop && !['followed-rooms', 'private-messages'].includes(view)) return;
            event.preventDefault();
            const searchTarget = isDesktop && view === 'followed-rooms'
                ? document.getElementById('quick-follow-input')
                : isDesktop && view === 'private-messages' ? document.getElementById('private-message-search') : input;
            searchTarget?.focus();
            searchTarget?.select();
        });
    }

    function initDesktopWorkspace() {
        const app = document.querySelector('.app-container');
        const main = document.getElementById('mainContentArea');
        const rail = document.querySelector('.home-app-rail');
        const navigation = document.querySelector('.home-conversation-pane');
        if (!app || !main || !rail || !navigation) return;
        document.body.classList.add('desktop-workspace');
        const scrollTimers = new WeakMap();
        document.addEventListener('scroll', event => {
            const scroller = event.target;
            if (!(scroller instanceof Element)) return;
            scroller.classList.add('desktop-is-scrolling');
            clearTimeout(scrollTimers.get(scroller));
            scrollTimers.set(scroller, setTimeout(() => {
                scroller.classList.remove('desktop-is-scrolling');
                scrollTimers.delete(scroller);
            }, 900));
        }, { capture: true, passive: true });
        navigation.querySelector('.home-conversation-footer')?.remove();
        const windowBrand = document.querySelector('.title-info');
        if (windowBrand) {
            const logo = document.createElement('img');
            logo.className = 'title-logo';
            logo.src = './icon.png';
            logo.alt = '';
            const name = document.createElement('span');
            name.textContent = '牙牙消息';
            windowBrand.replaceChildren(logo, name);
        }
        rail.querySelector('.home-rail-brand')?.remove();
        const accountButton = document.createElement('button');
        accountButton.type = 'button';
        accountButton.className = 'desktop-account-avatar';
        const accountImage = document.createElement('img');
        accountImage.alt = '';
        accountImage.hidden = true;
        const accountFallback = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        accountFallback.setAttribute('viewBox', '0 0 24 24');
        accountFallback.innerHTML = '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>';
        accountFallback.setAttribute('aria-hidden', 'true');
        navigation.querySelector('.home-conversation-header button')?.remove();
        accountButton.append(accountImage, accountFallback);
        accountButton.addEventListener('click', () => window.switchView('login'));
        const avatarCacheKey = 'desktop_account_avatar_v1';
        const avatarCache = window.desktop.appCache;
        let avatarSnapshot = null;
        let activeAvatarUrl = '';
        const thumbnailRequests = new Set();
        function accountScope() {
            try {
                const token = String(window.desktop.appSettings?.getTokenSync?.() || '').trim();
                if (!token) return '';
                let hash = 2166136261;
                for (let index = 0; index < token.length; index++) {
                    hash ^= token.charCodeAt(index);
                    hash = Math.imul(hash, 16777619);
                }
                return `token-${(hash >>> 0).toString(36)}`;
            } catch (_) { return ''; }
        }
        try { avatarSnapshot = avatarCache?.getCacheValueSync(avatarCacheKey, null); } catch (_) {}
        accountImage.addEventListener('error', () => {
            if (activeAvatarUrl && accountImage.getAttribute('src') !== activeAvatarUrl) {
                accountImage.src = activeAvatarUrl;
                return;
            }
            accountImage.hidden = true;
            accountFallback.removeAttribute('hidden');
        });
        function syncAccountAvatar(state) {
            const scope = accountScope();
            if (!state.loggedIn && scope && avatarSnapshot?.scope === scope) {
                state = { ...avatarSnapshot, loggedIn: true };
            } else if (!state.loggedIn) {
                avatarSnapshot = null;
                try { avatarCache?.removeCacheValueSync(avatarCacheKey); } catch (_) {}
            }
            const label = state.loggedIn ? `${state.nickname || '当前账号'} · 账号` : '未登录 · 登录账号';
            accountButton.setAttribute('aria-label', label);
            accountButton.title = label;
            const url = state.loggedIn ? String(state.avatarUrl || '').trim() : '';
            const hasAvatar = Boolean(url && !/(^|\/)icon\.png(?:[?#]|$)/i.test(url));
            activeAvatarUrl = hasAvatar ? url : '';
            accountImage.hidden = !hasAvatar;
            accountFallback.toggleAttribute('hidden', hasAvatar);
            if (state.loggedIn && scope) {
                const next = { scope, nickname: String(state.nickname || ''), avatarUrl: hasAvatar ? url : '' };
                if (JSON.stringify(next) !== JSON.stringify(avatarSnapshot)) {
                    avatarSnapshot = next;
                    try { avatarCache?.setCacheValueSync(avatarCacheKey, next); } catch (_) {}
                }
            }
            if (hasAvatar) {
                let localUrl = '';
                try { localUrl = window.desktop.imageCache?.getCachedThumbnailUrlSync(url, 160) || ''; } catch (_) {}
                const displayUrl = localUrl || url;
                if (accountImage.getAttribute('src') !== displayUrl) accountImage.src = displayUrl;
                if (!localUrl && /^https?:\/\//i.test(url) && !thumbnailRequests.has(url)) {
                    thumbnailRequests.add(url);
                    Promise.resolve().then(() => window.desktop.ipcRenderer.invoke('cache-image-thumbnail', { url, width: 160 }))
                        .catch(() => {}).finally(() => thumbnailRequests.delete(url));
                }
            } else accountImage.removeAttribute('src');
        }
        rail.prepend(accountButton);
        window.addEventListener('yaya:account-state-changed', event => syncAccountAvatar(event.detail || {}));
        syncAccountAvatar({
            loggedIn: Boolean(document.getElementById('panel-logged-in') && document.getElementById('panel-logged-in').style.display !== 'none'),
            nickname: document.getElementById('user-nickname')?.textContent,
            avatarUrl: document.getElementById('current-user-avatar')?.getAttribute('src')
        });
        app.prepend(rail);
        app.insertBefore(navigation, main);
        const roomSearchRow = document.getElementById('quick-follow-input')?.parentElement.parentElement;
        const roomActions = document.getElementById('btn-toggle-all-followed-notifications')?.parentElement;
        const roomHeader = roomActions?.parentElement;
        const roomFooter = roomSearchRow?.parentElement;
        if (roomSearchRow && roomActions && roomHeader && roomFooter) {
            roomHeader.classList.add('desktop-room-search-header');
            roomSearchRow.classList.add('desktop-room-search-row');
            roomFooter.classList.add('desktop-room-actions-footer');
            roomActions.classList.add('desktop-room-actions-row');
            const roomSort = roomActions.querySelector('#followed-sort-wrapper');
            if (roomSort) roomActions.prepend(roomSort);
            roomHeader.appendChild(roomSearchRow);
            roomFooter.prepend(roomActions);
        }
        const syncContactWidth = initContactResizing();
        app.querySelector(':scope > .sidebar')?.classList.add('desktop-message-sidebar');

        const settingsContent = document.querySelector('#view-settings > .list-container');
        const backgroundSettings = window.YayaDesktopBackground;
        const appearanceCard = settingsContent?.querySelector('.Box-row');
        appearanceCard?.querySelectorAll(':scope > div > div:first-child').forEach(copy => {
            copy.classList.add('desktop-setting-copy');
        });
        if (appearanceCard && backgroundSettings) {
            const row = document.createElement('div');
            row.className = 'desktop-background-transparency-row';
            const copy = document.createElement('div');
            copy.className = 'desktop-setting-copy';
            const label = document.createElement('label');
            label.htmlFor = 'desktop-background-transparency';
            label.textContent = '背景透明度';
            const hint = document.createElement('span');
            hint.textContent = '调整背景透明度';
            copy.append(label, hint);
            const controls = document.createElement('div');
            controls.className = 'desktop-background-transparency-controls';
            const slider = document.createElement('input');
            slider.id = 'desktop-background-transparency';
            slider.type = 'range';
            slider.min = '0'; slider.max = '100'; slider.step = '1';
            const value = document.createElement('output');
            value.htmlFor = slider.id;
            function sync() {
                slider.value = String(backgroundSettings.getTransparency());
                value.textContent = `${slider.value}%`;
                slider.setAttribute('aria-valuetext', `${slider.value}%`);
            }
            slider.addEventListener('input', () => { backgroundSettings.previewTransparency(slider.value); sync(); });
            slider.addEventListener('change', () => {
                try { backgroundSettings.saveTransparency(slider.value); }
                catch (_) { window.showToast?.('保存背景透明度失败，请重试'); }
            });
            new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
            sync();
            controls.append(slider, value);
            row.append(copy, controls);
            appearanceCard.appendChild(row);
        }
        const effectSettings = window.YayaGiftEffectSettings;
        if (settingsContent && effectSettings) {
            const card = document.createElement('div');
            card.id = 'gift-effects-settings-card';
            card.className = 'Box-row gift-effects-settings-card';
            const heading = document.createElement('h3');
            heading.textContent = '软件设置';
            card.appendChild(heading);
            for (const [scope, title, description] of [
                ['live', '直播特效', '显示直播间的礼物特效'],
                ['room', '房间特效', '显示成员房间的礼物特效']
            ]) {
                const row = document.createElement('label');
                row.className = 'gift-effects-setting-row';
                const copy = document.createElement('span');
                const name = document.createElement('strong');
                name.textContent = title;
                const hint = document.createElement('span');
                hint.textContent = description;
                copy.append(name, hint);
                const toggle = document.createElement('input');
                toggle.type = 'checkbox';
                toggle.id = `gift-effects-${scope}-enabled`;
                toggle.className = 'gift-effects-setting-switch';
                toggle.setAttribute('role', 'switch');
                toggle.setAttribute('aria-label', title);
                toggle.checked = effectSettings.isEnabled(scope);
                toggle.addEventListener('change', () => {
                    try { effectSettings.setEnabled(scope, toggle.checked); }
                    catch (_) {
                        toggle.checked = effectSettings.isEnabled(scope);
                        window.showToast?.('保存特效设置失败，请重试');
                    }
                });
                window.addEventListener('yaya:gift-effects-setting-changed', event => {
                    if (event.detail?.scope === scope) toggle.checked = event.detail.enabled;
                });
                row.append(copy, toggle);
                card.appendChild(row);
            }
            const privateRow = document.createElement('label');
            privateRow.className = 'gift-effects-setting-row';
            const privateCopy = document.createElement('span');
            const privateName = document.createElement('strong');
            privateName.textContent = '私信提醒';
            const privateHint = document.createElement('span');
            privateHint.textContent = '收到新私信时显示桌面提醒';
            privateCopy.append(privateName, privateHint);
            const privateToggle = document.createElement('input');
            privateToggle.type = 'checkbox';
            privateToggle.id = 'private-message-notifications-enabled';
            privateToggle.className = 'gift-effects-setting-switch';
            privateToggle.setAttribute('role', 'switch');
            privateToggle.setAttribute('aria-label', '私信提醒');
            privateToggle.checked = window.desktop.appSettings?.getSettingValueSync?.('privateMessageNotificationsEnabled', false) === true;
            privateToggle.addEventListener('change', () => {
                try {
                    window.desktop.appSettings.setSettingValueSync('privateMessageNotificationsEnabled', privateToggle.checked);
                    window.dispatchEvent(new CustomEvent('yaya:private-message-notifications-setting-changed'));
                } catch (_) {
                    privateToggle.checked = !privateToggle.checked;
                    window.showToast?.('保存私信提醒设置失败，请重试');
                }
            });
            privateRow.append(privateCopy, privateToggle);
            card.appendChild(privateRow);

            const autoCheckinRow = document.getElementById('auto-checkin-setting');
            const autoCheckinToggle = document.getElementById('auto-checkin-toggle');
            if (autoCheckinRow && autoCheckinToggle) {
                const autoCheckinCard = autoCheckinRow.closest('.Box-row');
                autoCheckinRow.className = 'gift-effects-setting-row';
                autoCheckinToggle.className = 'gift-effects-setting-switch';
                autoCheckinToggle.setAttribute('role', 'switch');
                card.appendChild(autoCheckinRow);
                autoCheckinCard?.remove();
            }

            const proxyToggle = document.getElementById('use-yaya-api-proxy');
            const proxyCard = proxyToggle?.closest('.Box-row');
            if (proxyToggle && proxyCard) {
                const row = document.createElement('label');
                row.className = 'gift-effects-setting-row';
                const copy = document.createElement('span');
                const name = document.createElement('strong');
                name.textContent = '代理请求';
                const hint = document.createElement('span');
                hint.textContent = '海外网络无法直连口袋48接口时，通过 api.gnz.hk 代为请求';
                copy.append(name, hint);
                proxyToggle.removeAttribute('style');
                proxyToggle.className = 'gift-effects-setting-switch';
                proxyToggle.setAttribute('role', 'switch');
                proxyToggle.setAttribute('aria-label', '代理请求');
                proxyToggle.checked = window.desktop.appSettings?.getSettingValueSync?.('useYayaApiProxy', false) === true;
                row.append(copy, proxyToggle);
                card.appendChild(row);
                proxyCard.remove();
            }

            const closeCard = document.getElementById('window-close-settings-card');
            if (closeCard) {
                const row = document.createElement('div');
                row.className = 'gift-effects-setting-row';
                const copy = document.createElement('span');
                const name = document.createElement('strong');
                name.textContent = '关闭软件';
                const hint = document.createElement('span');
                hint.textContent = '点击窗口关闭按钮时执行的操作';
                copy.append(name, hint);
                const select = document.createElement('select');
                select.id = 'window-close-behavior-select';
                select.className = 'input-control desktop-close-behavior-select';
                select.setAttribute('aria-label', '关闭软件');
                select.setAttribute('onchange', 'saveWindowCloseBehaviorSetting()');
                for (const [value, text] of [['minimize-to-tray', '最小化到托盘'], ['quit', '退出软件']]) {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = text;
                    select.appendChild(option);
                }
                select.value = window.desktop.appSettings?.getSettingValueSync?.('windowCloseBehavior', 'minimize-to-tray') === 'quit'
                    ? 'quit' : 'minimize-to-tray';
                select.hidden = true;
                const picker = document.createElement('div');
                picker.className = 'flip-default-dropdown-wrapper desktop-close-behavior-picker';
                const trigger = document.createElement('button');
                trigger.type = 'button';
                trigger.className = 'input-control desktop-close-behavior-trigger';
                trigger.setAttribute('aria-label', '关闭软件');
                trigger.setAttribute('aria-haspopup', 'listbox');
                trigger.setAttribute('aria-expanded', 'false');
                trigger.setAttribute('aria-controls', 'window-close-behavior-dropdown');
                const arrow = document.createElement('span');
                arrow.className = 'flip-default-dropdown-arrow';
                arrow.textContent = '▼';
                arrow.setAttribute('aria-hidden', 'true');
                const menu = document.createElement('div');
                menu.id = 'window-close-behavior-dropdown';
                menu.className = 'suggestion-box';
                menu.setAttribute('role', 'listbox');
                menu.setAttribute('aria-label', '关闭软件');
                menu.style.display = 'none';
                const options = Array.from(select.options, option => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'suggestion-item';
                    button.setAttribute('role', 'option');
                    button.dataset.value = option.value;
                    button.textContent = option.textContent;
                    button.addEventListener('click', () => {
                        select.value = option.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        closeMenu();
                        trigger.focus();
                    });
                    menu.appendChild(button);
                    return button;
                });
                function syncPicker() {
                    trigger.textContent = select.selectedOptions[0]?.textContent || '最小化到托盘';
                    options.forEach(option => option.setAttribute('aria-selected', String(option.dataset.value === select.value)));
                }
                function closeMenu() {
                    menu.style.display = 'none';
                    trigger.setAttribute('aria-expanded', 'false');
                }
                function openMenu() {
                    picker.classList.toggle('opens-above', trigger.getBoundingClientRect().bottom + 100 > innerHeight);
                    menu.style.display = 'block';
                    trigger.setAttribute('aria-expanded', 'true');
                }
                trigger.addEventListener('click', () => menu.style.display === 'none' ? openMenu() : closeMenu());
                picker.addEventListener('keydown', event => {
                    if (event.key === 'Escape') {
                        event.preventDefault(); event.stopPropagation(); closeMenu(); trigger.focus();
                    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                        event.preventDefault(); event.stopPropagation(); openMenu();
                        const index = options.indexOf(document.activeElement);
                        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
                            : index < 0 ? Math.max(0, options.findIndex(option => option.dataset.value === select.value))
                            : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
                        options[next].focus();
                    }
                });
                document.addEventListener('pointerdown', event => { if (!picker.contains(event.target)) closeMenu(); });
                picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget)) closeMenu(); });
                window.addEventListener('yaya:view-changed', closeMenu);
                select.addEventListener('change', syncPicker);
                select.addEventListener('yaya:setting-loaded', syncPicker);
                syncPicker();
                picker.append(select, trigger, arrow, menu);
                row.append(copy, picker);
                card.appendChild(row);
                closeCard.remove();
            }
            const appearanceCard = settingsContent.querySelector('.Box-row');
            if (appearanceCard) appearanceCard.after(card);
            else settingsContent.appendChild(card);
        }

        if (settingsContent) {
            const appVersion = document.querySelector('meta[name="yaya-app-version"]')?.content || '';
            const formatVersion = value => String(value || '').replace(/^(\d+\.\d+)\.\d+$/, '$1');
            const updateCard = document.createElement('section');
            updateCard.id = 'desktop-update-card';
            updateCard.className = 'Box-row desktop-update-card';
            const updateRow = document.createElement('div');
            updateRow.className = 'desktop-update-row';
            const updateCopy = document.createElement('div');
            updateCopy.className = 'desktop-update-copy';
            const updateHeading = document.createElement('h3');
            updateHeading.textContent = '检查更新';
            updateCopy.appendChild(updateHeading);
            const updateActions = document.createElement('div');
            updateActions.className = 'desktop-update-actions';
            const checkButton = document.createElement('button');
            checkButton.id = 'desktop-check-updates';
            checkButton.type = 'button';
            checkButton.className = 'btn btn-secondary';
            checkButton.textContent = '检查更新';
            const downloadButton = document.createElement('button');
            downloadButton.type = 'button';
            downloadButton.className = 'btn btn-primary';
            downloadButton.hidden = true;
            const updateStatus = document.createElement('p');
            updateStatus.className = 'desktop-update-status';
            updateStatus.setAttribute('role', 'status');
            updateStatus.textContent = '尚未检查更新';
            let downloadUrl = '';
            let downloadMode = 'download';
            let downloading = false;
            let lastAutomaticUpdateCheckAt = null;
            const autoUpdateCheckIntervalMs = 5 * 60 * 1000;
            const installLabel = window.desktop.platform === 'darwin' ? '手动安装' : '安装更新';
            window.desktop.ipcRenderer.on('app-update-download-progress', (_event, progress) => {
                if (!downloading) return;
                const mb = bytes => (Math.max(0, Number(bytes) || 0) / 1024 / 1024).toFixed(1);
                const percent = Number.isFinite(progress?.percent) ? ` ${Math.min(100, Math.max(0, progress.percent))}%` : '';
                updateStatus.textContent = `正在下载更新${percent} · ${mb(progress?.received)} MB${progress?.total ? ` / ${mb(progress.total)} MB` : ''}`;
            });
            downloadButton.addEventListener('click', async () => {
                if (downloadButton.disabled) return;
                if (downloadMode === 'release') {
                    if (downloadUrl) window.desktop.openExternal(downloadUrl);
                    return;
                }
                const installing = downloadMode === 'install';
                let restartScheduled = false;
                downloadButton.disabled = true;
                checkButton.disabled = true;
                downloading = !installing;
                downloadButton.textContent = installing ? '正在打开' : '正在下载';
                updateStatus.textContent = installing ? '正在打开安装包' : '正在准备下载更新';
                try {
                    const result = await window.desktop.ipcRenderer.invoke(installing ? 'open-app-update-installer' : 'download-app-update');
                    if (!result?.success) throw new Error(result?.msg || '更新失败，请稍后重试');
                    if (installing) {
                        restartScheduled = result.mode === 'automatic';
                        updateStatus.textContent = restartScheduled
                            ? result.authorization ? '正在退出软件，安装时请完成系统授权，完成后将自动启动新版' : '正在退出软件，安装完成后将自动启动新版'
                            : result.msg || '已打开安装包，请按提示完成安装';
                    }
                    else {
                        downloadMode = 'install';
                        updateStatus.textContent = `版本 ${formatVersion(result.version)} 下载完成，点击“${installLabel}”继续`;
                    }
                } catch (error) {
                    updateStatus.textContent = error?.message || '更新失败，请稍后重试';
                } finally {
                    downloading = false;
                    downloadButton.disabled = restartScheduled;
                    checkButton.disabled = restartScheduled;
                    downloadButton.textContent = restartScheduled ? '正在安装' : downloadMode === 'install' ? installLabel : '更新';
                }
            });
            async function checkUpdates({ automatic = false } = {}) {
                if (checkButton.disabled) return;
                if (automatic) {
                    const now = Date.now();
                    if (lastAutomaticUpdateCheckAt !== null && now - lastAutomaticUpdateCheckAt < autoUpdateCheckIntervalMs) return;
                    lastAutomaticUpdateCheckAt = now;
                }
                checkButton.disabled = true;
                checkButton.textContent = '正在检查';
                downloadButton.hidden = true;
                downloadUrl = '';
                downloadMode = 'download';
                updateStatus.textContent = '正在获取最新版本信息';
                try {
                    const result = await window.desktop.ipcRenderer.invoke('check-app-updates');
                    if (!result?.success) throw new Error(result?.msg || '检查更新失败，请稍后重试');
                    if (result.updateAvailable) {
                        updateStatus.textContent = `发现新版本v${formatVersion(result.latestVersion)}`;
                        downloadUrl = result.downloadUrl || result.releaseUrl;
                        downloadMode = result.downloadUrl ? 'download' : 'release';
                        downloadButton.textContent = result.downloadUrl ? '更新' : '查看更新';
                        downloadButton.hidden = !downloadUrl;
                    } else {
                        updateStatus.textContent = result.latestVersion ? `当前已是最新版本 v${formatVersion(result.currentVersion || appVersion)}` : '暂无已发布版本';
                    }
                    if (result.installFailed) updateStatus.textContent += ' · 上次安装未完成，请重试';
                } catch (error) {
                    updateStatus.textContent = error?.message || '检查更新失败，请稍后重试';
                } finally {
                    checkButton.disabled = false;
                    checkButton.textContent = '检查更新';
                }
            }
            checkButton.addEventListener('click', () => void checkUpdates());
            window.addEventListener('yaya:view-changed', event => {
                if (event.detail?.view === 'settings' && !downloading && downloadMode !== 'install') {
                    void checkUpdates({ automatic: true });
                }
            });
            updateActions.append(checkButton, downloadButton);
            updateCopy.appendChild(updateStatus);
            updateRow.append(updateCopy, updateActions);
            updateCard.appendChild(updateRow);
            settingsContent.appendChild(updateCard);
            const about = document.createElement('section');
            about.id = 'desktop-about-card';
            about.className = 'Box-row desktop-about-card';
            about.setAttribute('aria-label', '关于');
            const name = document.createElement('h3');
            name.textContent = '牙牙消息';
            const version = document.createElement('p');
            version.className = 'desktop-about-version';
            version.textContent = `版本 ${formatVersion(appVersion)}`;
            const credit = document.createElement('p');
            credit.className = 'desktop-about-credit';
            function authorLink(text) {
                const link = document.createElement('a');
                link.className = 'desktop-about-author';
                link.href = 'https://github.com/yk1z';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = text;
                link.addEventListener('click', event => {
                    if (window.desktop?.openExternal) {
                        event.preventDefault();
                        window.desktop.openExternal(link.href);
                    }
                });
                return link;
            }
            credit.appendChild(authorLink('Presented by yk1z'));
            const copyright = document.createElement('p');
            copyright.className = 'desktop-about-copyright';
            copyright.append('Copyright © 2024-2026 ', authorLink('yk1z'));
            about.append(name, version, credit, copyright);
            settingsContent.appendChild(about);
        }

        const ipCheckCard = document.getElementById('btn-check-all')?.closest('.Box-row');
        if (ipCheckCard) {
            const page = document.createElement('div');
            page.id = 'view-ip-check';
            page.className = 'main-content';
            page.style.cssText = 'display: none; height: 100%; overflow-y: auto;';
            const content = document.createElement('div');
            content.className = 'list-container';
            content.appendChild(ipCheckCard);
            page.appendChild(content);
            main.appendChild(page);
        }

        for (const card of [document.querySelector('#view-pbc .pbc-card'), ipCheckCard]) {
            if (!card) continue;
            card.classList.add('desktop-tool-card');
            const header = card.firstElementChild;
            header.classList.add('desktop-tool-header');
            header.querySelector('h2, h3')?.classList.add('desktop-tool-title');
            header.firstElementChild?.lastElementChild?.classList.add('desktop-tool-description');
            header.querySelector('button')?.classList.add('desktop-tool-action');
        }

        const groups = [
            ['home', '主页', [['home', '主页', '全部功能与快捷入口']]],
            ['message-tools', '消息', [['messages', '检索', '历史消息与条件搜索'], ['fetch', '抓取', '手动刷新与重扫']]],
            ['messages', '房间与消息', [['followed-rooms', '房间', '关注成员与实时房间']]],
            ['private', '私信', [['private-messages', '私信', '口袋私信会话']]],
            ['live', '直播', [['media:live', '直播', '口袋直播与弹幕'], ['media:vod', '回放', '回看直播与弹幕'], ['room-radio', '上麦', '上麦与音频'], ['bilibili-live', '公演', 'B站公演直播源与播放']]],
            ['flip', '翻牌', [['send-flip', '提问', '向成员提问'], ['flip', '历史', '历史翻牌'], ['photos', '个人相册', '成员照片']]],
            ['discover', '功能', [['room-album', '相册', '房间图片'], ['profile', '档案', '资料与详细信息'], ['member-dynamic', '动态', '口袋动态'], ['trip', '行程', '活动与公演安排'], ['member-weibo', '微博', '微博内容'], ['community', '社区', '广场与话题'], ['melee-rank', '鸡腿榜', '乱斗周榜'], ['netface', '云握手', '预约与音视频互动']]],
            ['library', '媒体', [['video-library', '视频', '官方视频资源'], ['official-site-music', '音乐', '歌曲与播放列表'], ['audio-programs', '电台', '收听电台节目'], ['performance', '公演记录', '演出与成员记录']]],
            ['tools', '工具', [['database', '数据库', '成员数据查询'], ['downloads', '下载管理', '任务与进度'], ['invoice', '开具发票', '订单开票申请'], ['pbc', '屏蔽词检测', '检测口袋48屏蔽词'], ['ip-check', 'IP检测', '国内直连、通用出口与代理通道的 IP 归属']]],
            ['settings', '设置', [['settings', '设置', '外观与程序行为']]]
        ];
        const categories = new Map(groups.map(([id, label]) => [id, label]));
        const routeCategories = new Map([['login', 'account']]);
        let activeCategory = 'home';
        let menuCategory = 'home';
        let flyoutTrigger = null;
        let closeTimer;
        const searchInput = document.getElementById('home-module-search');
        searchInput.closest('.home-search-box')?.remove();
        const navigationTitle = navigation.querySelector('h1');
        const list = document.getElementById('home-conversation-list');
        const empty = document.getElementById('home-search-empty');
        navigation.id = 'desktop-function-flyout';
        navigation.setAttribute('aria-label', '功能菜单');
        navigation.setAttribute('aria-hidden', 'true');
        navigation.inert = true;
        list.replaceChildren();
        groups.forEach(([category, label, entries]) => {
            const heading = document.createElement('div');
            heading.className = 'home-list-label';
            heading.dataset.category = category;
            heading.textContent = label;
            list.appendChild(heading);
            entries.forEach(([route, name, description]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'home-conversation-item';
                button.dataset.route = route;
                button.dataset.category = category;
                routeCategories.set(route, category);
                button.dataset.homeSearch = `${label} ${name} ${description}`;
                const copy = document.createElement('span');
                copy.className = 'home-list-copy';
                const title = document.createElement('strong');
                title.textContent = name;
                copy.appendChild(title);
                button.appendChild(copy);
                button.addEventListener('click', () => {
                    searchInput.value = '';
                    const [view, mode] = route.split(':');
                    window.switchView(view, mode || null);
                    closeFlyout();
                    searchInput.dispatchEvent(new Event('input'));
                });
                list.appendChild(button);
            });
        });
        list.appendChild(empty);

        function filterNavigation(query) {
            query = normalizeSearchValue(query);
            let count = 0;
            list.querySelectorAll('[data-route]').forEach(button => {
                const visible = query
                    ? normalizeSearchValue(button.dataset.homeSearch).includes(query)
                    : button.dataset.category === menuCategory;
                button.hidden = !visible;
                if (visible) count += 1;
            });
            list.querySelectorAll('.home-list-label').forEach(heading => {
                heading.hidden = !query || !Array.from(list.querySelectorAll('[data-route]'))
                    .some(button => button.dataset.category === heading.dataset.category && !button.hidden);
            });
            navigationTitle.textContent = query ? '搜索功能' : categories.get(menuCategory);
            navigation.dataset.category = menuCategory;
            empty.hidden = count > 0;
            empty.textContent = '没有找到相关功能';
            return count;
        }

        const railButtons = Array.from(rail.querySelectorAll('.home-rail-nav:not(.home-rail-nav-bottom) .home-rail-button'));
        const railCategoryIds = ['home', 'messages', 'live', 'discover'];
        railButtons.forEach((button, index) => {
            button.dataset.category = railCategoryIds[index];
            if (railCategoryIds[index] === 'discover') {
                button.querySelector('span').textContent = '功能';
                button.setAttribute('aria-label', '功能');
                button.title = '功能';
            }
        });
        const messageButton = railButtons[0].cloneNode(true);
        messageButton.dataset.category = 'message-tools';
        messageButton.querySelector('span').textContent = '消息';
        messageButton.setAttribute('aria-label', '消息');
        messageButton.title = '消息';
        messageButton.classList.remove('is-active');
        messageButton.querySelector('svg').innerHTML = '<path d="M10 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8l6 6v3M14 3v6h6M8 12h2M8 16h1"></path><circle cx="16" cy="16" r="4"></circle><path d="m19 19 3 3"></path>';
        railButtons[0].after(messageButton);
        const privateButton = railButtons[0].cloneNode(true);
        privateButton.dataset.category = 'private';
        privateButton.querySelector('span').textContent = '私信';
        privateButton.setAttribute('aria-label', '私信');
        privateButton.title = '私信';
        privateButton.classList.remove('is-active');
        privateButton.querySelector('svg').innerHTML = '<circle cx="12" cy="7" r="4"></circle><path d="M5 21v-2a7 7 0 0 1 14 0v2"></path>';
        railButtons[1].after(privateButton);
        const flipButton = railButtons[0].cloneNode(true);
        flipButton.dataset.category = 'flip';
        flipButton.querySelector('span').textContent = '翻牌';
        flipButton.setAttribute('aria-label', '翻牌');
        flipButton.title = '翻牌';
        flipButton.classList.remove('is-active');
        flipButton.querySelector('svg').innerHTML = '<g transform="translate(3 0)"><path d="M15.66 6.34a8 8 0 1 0 0 11.32L10 12Z"></path><circle cx="10" cy="7.5" r="0.8" fill="currentColor" stroke="none"></circle></g>';
        privateButton.after(flipButton);
        const libraryButton = railButtons[2].cloneNode(true);
        libraryButton.dataset.category = 'library';
        libraryButton.querySelector('span').textContent = '媒体';
        libraryButton.setAttribute('aria-label', '媒体');
        libraryButton.title = '媒体';
        libraryButton.classList.remove('is-active');
        libraryButton.querySelector('svg').innerHTML = '<path d="M9 18V5l12-2v13"></path><ellipse cx="6" cy="18" rx="3" ry="3"></ellipse><ellipse cx="18" cy="16" rx="3" ry="3"></ellipse>';
        railButtons[0].parentElement.appendChild(libraryButton);
        const toolsButton = railButtons[0].cloneNode(true);
        toolsButton.dataset.category = 'tools';
        toolsButton.querySelector('span').textContent = '工具';
        toolsButton.setAttribute('aria-label', '工具');
        toolsButton.title = '工具';
        toolsButton.classList.remove('is-active');
        toolsButton.querySelector('svg').innerHTML = '<rect x="3" y="7" width="18" height="14" rx="2"></rect><path d="M8 7V4h8v3M3 12h18M10 12v3h4v-3"></path>';
        libraryButton.after(messageButton);
        messageButton.after(toolsButton);
        const settingsButton = rail.querySelector('.home-rail-nav-bottom .home-rail-button:last-child');
        settingsButton.dataset.category = 'settings';
        function closeFlyout() {
            clearTimeout(closeTimer);
            if (!flyoutTrigger) return;
            if (navigation.contains(document.activeElement)) flyoutTrigger?.focus({ preventScroll: true });
            document.body.classList.remove('desktop-flyout-open');
            navigation.inert = true;
            navigation.setAttribute('aria-hidden', 'true');
            rail.querySelectorAll('[aria-controls="desktop-function-flyout"]').forEach(button => {
                button.setAttribute('aria-expanded', 'false');
                button.classList.remove('is-menu-open');
            });
            flyoutTrigger = null;
            menuCategory = activeCategory;
        }

        function openFlyout(button, focusFirst = false) {
            clearTimeout(closeTimer);
            if (flyoutTrigger !== button && navigation.contains(document.activeElement)) button.focus({ preventScroll: true });
            menuCategory = button.dataset.category;
            flyoutTrigger = button;
            filterNavigation('');
            const appRect = app.getBoundingClientRect();
            const buttonRect = button.getBoundingClientRect();
            const maxHeight = Math.max(80, appRect.height - 16);
            navigation.style.setProperty('--desktop-flyout-max-height', `${maxHeight}px`);
            const menuHeight = Math.min(list.scrollHeight + 2, maxHeight);
            const top = Math.max(8, Math.min(buttonRect.top - appRect.top, appRect.height - menuHeight - 8));
            navigation.style.setProperty('--desktop-flyout-top', `${top}px`);
            navigation.inert = false;
            navigation.setAttribute('aria-hidden', 'false');
            document.body.classList.add('desktop-flyout-open');
            rail.querySelectorAll('[aria-controls="desktop-function-flyout"]').forEach(trigger => {
                const expanded = trigger === button;
                trigger.setAttribute('aria-expanded', String(expanded));
                trigger.classList.toggle('is-menu-open', expanded);
            });
            const current = list.querySelector('[aria-current="page"]:not([hidden])');
            if (current) current.scrollIntoView({ block: 'nearest' });
            else list.scrollTop = 0;
            if (focusFirst) (current || list.querySelector('[data-route]:not([hidden])'))?.focus();
        }

        function scheduleClose() {
            clearTimeout(closeTimer);
            closeTimer = setTimeout(() => {
                if (navigation.matches(':hover, :focus-within') || flyoutTrigger?.matches(':hover')) return;
                closeFlyout();
            }, 120);
        }

        [...railButtons, messageButton, privateButton, flipButton, libraryButton, toolsButton, settingsButton].forEach(button => {
            button.removeAttribute('onclick');
            const category = button.dataset.category;
            const hasFlyout = !['home', 'messages', 'private', 'settings'].includes(category);
            if (hasFlyout) {
                button.setAttribute('aria-controls', navigation.id);
                button.setAttribute('aria-expanded', 'false');
                button.addEventListener('pointerenter', event => {
                    if (event.pointerType === 'touch') return;
                    openFlyout(button);
                });
                button.addEventListener('pointerleave', scheduleClose);
                button.addEventListener('keydown', event => {
                    if (event.key !== 'ArrowRight') return;
                    event.preventDefault();
                    openFlyout(button, true);
                });
            } else {
                button.addEventListener('pointerenter', closeFlyout);
                button.addEventListener('focus', closeFlyout);
            }
            button.addEventListener('click', () => {
                if (hasFlyout && category !== 'home') {
                    openFlyout(button);
                    return;
                }
                searchInput.value = '';
                closeFlyout();
                window.switchView(category === 'messages' ? 'followed-rooms' : category === 'private' ? 'private-messages' : category === 'settings' ? 'settings' : 'home');
                searchInput.dispatchEvent(new Event('input'));
            });
        });
        navigation.addEventListener('pointerenter', () => { clearTimeout(closeTimer); });
        navigation.addEventListener('pointerleave', scheduleClose);
        navigation.addEventListener('focusout', scheduleClose);
        document.addEventListener('pointerdown', event => {
            if (!navigation.contains(event.target) && !flyoutTrigger?.contains(event.target)) closeFlyout();
        }, { capture: true });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && document.body.classList.contains('desktop-flyout-open')) {
                event.preventDefault();
                closeFlyout();
            }
        });
        window.addEventListener('blur', closeFlyout);
        window.addEventListener('resize', closeFlyout);

        main.querySelectorAll('[id^="view-"]').forEach(page => {
            page.classList.add('desktop-page');
            if (page.id === 'view-followed-rooms' || page.id === 'view-private-messages') page.classList.add('desktop-conversations');
        });
        const header = document.createElement('header');
        header.className = 'desktop-page-heading';
        const title = document.createElement('h1');
        title.textContent = '主页';
        header.appendChild(title);
        document.querySelector('.custom-title-bar').appendChild(header);

        const railIndicator = document.createElement('span');
        railIndicator.className = 'desktop-rail-indicator';
        railIndicator.setAttribute('aria-hidden', 'true');
        rail.appendChild(railIndicator);
        function positionRailIndicator() {
            const activeButton = rail.querySelector('.home-rail-button.is-active');
            const buttonBounds = activeButton?.getBoundingClientRect();
            if (!buttonBounds?.height) {
                railIndicator.style.opacity = '0';
                return;
            }
            const top = buttonBounds.top - rail.getBoundingClientRect().top + (buttonBounds.height - 26) / 2;
            railIndicator.style.transform = `translateY(${Math.round(top)}px)`;
            railIndicator.style.opacity = '1';
        }
        window.addEventListener('resize', positionRailIndicator);
        const railResizeObserver = new ResizeObserver(positionRailIndicator);
        railResizeObserver.observe(rail);

        function syncNavigation(detail) {
            const view = detail.view || 'home';
            const route = view === 'media' ? `media:${String(detail.mode || 'live').includes('vod') ? 'vod' : 'live'}` : view;
            activeCategory = routeCategories.get(route) || activeCategory;
            closeFlyout();
            filterNavigation(searchInput.value);
            let selected;
            list.querySelectorAll('[data-route]').forEach(button => {
                const active = button.dataset.route === route;
                button.classList.toggle('is-emphasis', active);
                if (active) { button.setAttribute('aria-current', 'page'); selected = button; }
                else button.removeAttribute('aria-current');
            });
            title.textContent = route === 'login' ? '账号' : selected?.querySelector('strong').textContent || document.getElementById('topbar-page-title')?.textContent || '牙牙消息';
            if (document.body.classList.contains('desktop-flyout-open') && selected && !selected.hidden && !searchInput.value) {
                if (selected.offsetTop < list.scrollTop) list.scrollTop = selected.offsetTop;
                else if (selected.offsetTop + selected.offsetHeight > list.scrollTop + list.clientHeight) {
                    list.scrollTop = selected.offsetTop + selected.offsetHeight - list.clientHeight;
                }
            }
            document.body.dataset.desktopView = view;
            syncContactWidth(view);
            if (view === 'login') accountButton.setAttribute('aria-current', 'page');
            else accountButton.removeAttribute('aria-current');
            rail.querySelectorAll('.home-rail-button').forEach(button => {
                const active = button.dataset.category === activeCategory;
                button.classList.toggle('is-active', active);
                if (active) button.setAttribute('aria-current', 'true');
                else button.removeAttribute('aria-current');
            });
            positionRailIndicator();
        }
        window.addEventListener('yaya:view-changed', event => syncNavigation(event.detail || {}));
        syncNavigation({ view: 'home' });
        requestAnimationFrame(() => railIndicator.classList.add('is-ready'));
        window.YayaRendererFeatures.createDesktopCloudHome?.({ homeView: document.getElementById('view-home') });
        return { filter: filterNavigation };
    }

    function startHomeWorkspace() {
        if (window.desktop?.isRoomWindow) return;
        try {
            initHomeWorkspace();
        } finally {
            document.documentElement.classList.remove('desktop-workspace-pending');
            if (window.desktop && window.desktop.platform !== 'web') {
                window.desktop.ipcRenderer.send('desktop-workspace-ready');
                requestAnimationFrame(() => {
                    window.dispatchEvent(new CustomEvent('yaya:desktop-workspace-ready'));
                });
            }
        }
    }

    if (document.documentElement.dataset.desktopShell === 'true') {
        startHomeWorkspace();
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startHomeWorkspace, { once: true });
    } else {
        startHomeWorkspace();
    }
})();
