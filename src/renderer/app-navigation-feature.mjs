import { createDesktopNavigation, getPageDisplay } from './desktop-navigation-feature.mjs';

export function createAppNavigation({
    route,
    getCurrentAppToken,
    getPocketUserId,
    getTokenValidator,
    showToast,
    clearWebMessageData,
    syncMessageIndexLoadingShield,
    onLeave,
    afterHide,
    beforeEnter,
    onEnter
}) {
    function mountSidebarPanelsToViews() {
        const downloadsHost = document.getElementById('downloads-panel-host');

        if (downloadsHost) {
            const downloadNode = document.getElementById('sb-download');
            if (downloadNode && downloadNode.parentElement !== downloadsHost) {
                downloadsHost.appendChild(downloadNode);
            }
        }

        if (window.desktop?.platform === 'web') {
            const messageControlsHost = document.getElementById('web-message-controls-host');
            if (messageControlsHost && messageControlsHost.dataset.mounted !== 'true') {
                messageControlsHost.dataset.mounted = 'true';
                messageControlsHost.innerHTML = `
                    <div class="web-message-page-header"></div>
                    <div class="web-message-controls-grid view-toolbar-grid"></div>
                `;

                const controlsGrid = messageControlsHost.querySelector('.web-message-controls-grid');
                const status = document.getElementById('statusMsg');
                const pageHeader = messageControlsHost.querySelector('.web-message-page-header');
                const sidebar = document.querySelector('.sidebar');
                const creditLink = document.querySelector('.credit-link');
                const statusGroup = creditLink ? creditLink.parentElement : null;
                const compactMessageLayout = window.matchMedia('(max-width: 900px)');
                const messagePanelIds = [
                    'sb-search',
                    'sb-members',
                    'sb-date',
                    'sb-type',
                    'sb-message-data'
                ];
                const desktopPanelIds = [
                    'sb-search',
                    'sb-members',
                    'sb-date',
                    'sb-analysis',
                    'sb-type',
                    'sb-message-data'
                ];

                const syncMessageControlPlacement = () => {
                    if (compactMessageLayout.matches) {
                        messagePanelIds.forEach((id) => {
                            const panel = document.getElementById(id);
                            if (panel && controlsGrid) controlsGrid.appendChild(panel);
                        });
                        if (status && pageHeader) pageHeader.appendChild(status);
                        return;
                    }

                    if (sidebar && statusGroup && statusGroup.parentElement === sidebar) {
                        desktopPanelIds.forEach((id) => {
                            const panel = document.getElementById(id);
                            if (panel) sidebar.insertBefore(panel, statusGroup);
                        });
                    }
                    if (status && creditLink && creditLink.parentElement) {
                        creditLink.parentElement.insertBefore(status, creditLink);
                    }
                };

                syncMessageControlPlacement();
                compactMessageLayout.addEventListener('change', syncMessageControlPlacement);

                const dataPanel = document.getElementById('sb-message-data');
                const dataButtons = dataPanel ? dataPanel.querySelectorAll('button') : [];
                if (dataButtons[1]) {
                    dataButtons[1].textContent = window.YayaRendererUtils.t('清空浏览器消息');
                    dataButtons[1].onclick = () => clearWebMessageData();
                }

                const exportButton = document.getElementById('btn-export-jsonl');
                if (exportButton) exportButton.textContent = window.YayaRendererUtils.t('保存到消息检索');
            }
        }
    }

    function setSidebarHomeMode(isHome) {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.getElementById('mainContentArea');
        if (!sidebar || !mainContent) return;

        mainContent.classList.toggle('home-mode', isHome);
    }

    function setGlobalSidebarVisible(isVisible) {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        const inlineTransition = sidebar.style.transition;
        sidebar.style.transition = 'none';
        sidebar.classList.remove('collapsed');
        sidebar.classList.toggle('app-sidebar-disabled', !isVisible);
        sidebar.classList.toggle('home-hidden', !isVisible);
        void sidebar.offsetWidth;
        sidebar.style.transition = inlineTransition;
    }

    function toggleSidebar() {
        if (route.view !== 'home') {
            switchView('home');
        }
    }

    function toggleSidebarMode(mode) {
        const idsToHide = ['sb-members', 'sb-analysis', 'sb-search', 'sb-date', 'sb-type', 'statusMsg'];

        const settingsGroup = document.getElementById('sb-settings-group');
        const downloadModule = document.getElementById('sb-download');
        const loginGroup = document.getElementById('sb-login-group');
        const liveGroup = document.getElementById('sb-live-group');

        idsToHide.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = (id === 'statusMsg') ? 'block' : 'flex';
        });
        if (settingsGroup) settingsGroup.style.display = 'none';
        if (loginGroup) loginGroup.style.display = 'none';
        if (downloadModule) downloadModule.style.display = 'none';
        if (liveGroup) liveGroup.style.display = 'none';

        if (mode === 'media') {

            idsToHide.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });

        } else if (mode === 'login') {
            idsToHide.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }
    }

    const MEDIA_PLAYBACK_PAGE_DEFINITIONS = [
        { id: 'view-live-player', mode: 'live', kind: 'live' },
        { id: 'view-vod-player', mode: 'vod', kind: 'vod' },
        { id: 'view-meet-live-player', mode: 'meet-live', kind: 'live' },
        { id: 'view-meet-vod-player', mode: 'meet-vod', kind: 'vod' },
        { id: 'view-open-live-player', mode: 'open-live', kind: 'live' },
        { id: 'view-open-live-record-player', mode: 'open-live-record', kind: 'vod' },
        { id: 'view-performance-player', mode: 'performance-record', kind: 'vod' }
    ];

    function ensureSeparatedMediaPlayerPages() {
        const mediaView = document.getElementById('view-media');
        const playerView = document.getElementById('live-player-view');
        const parent = mediaView?.parentElement;
        if (!mediaView || !playerView || !parent) return {};

        function ensurePage({ id, mode, kind }) {
            let page = document.getElementById(id);
            if (!page) {
                page = document.createElement('div');
                page.id = id;
                page.style.cssText = 'height: 100%; width: 100%; overflow-y: auto; scrollbar-gutter: stable; display: none; padding: 12px 20px 20px 20px; box-sizing: border-box;';
                parent.insertBefore(page, mediaView.nextSibling);
            }
            page.classList.add('media-playback-page');
            page.style.paddingTop = '12px';
            page.dataset.mediaPlaybackMode = mode;
            page.dataset.mediaPlaybackKind = kind;
            return page;
        }

        const pages = MEDIA_PLAYBACK_PAGE_DEFINITIONS.map(ensurePage);
        const livePage = document.getElementById('view-live-player');
        const vodPage = document.getElementById('view-vod-player');
        const toolbarTemplate = document.getElementById('clip-toolbar')
            || document.querySelector('.media-clip-toolbar');
        if (toolbarTemplate) {
            toolbarTemplate.classList.add('media-clip-toolbar');
            toolbarTemplate.dataset.clipToolbar = 'media';
            toolbarTemplate.dataset.clipToolbarOwner ||= toolbarTemplate.closest('.media-playback-page')?.dataset.mediaPlaybackMode || 'live';
            MEDIA_PLAYBACK_PAGE_DEFINITIONS.forEach(definition => {
                let toolbar = document.querySelector(`.media-clip-toolbar[data-clip-toolbar-owner="${definition.mode}"]`);
                if (!toolbar) {
                    toolbar = toolbarTemplate.cloneNode(true);
                    toolbar.id = `clip-toolbar-${definition.mode}`;
                    toolbar.dataset.clipToolbarOwner = definition.mode;
                    toolbar.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
                    const startDisplay = toolbar.querySelector('[data-clip-role="start-display"]');
                    const endDisplay = toolbar.querySelector('[data-clip-role="end-display"]');
                    const durationDisplay = toolbar.querySelector('[data-clip-role="duration-display"]');
                    const clipButton = toolbar.querySelector('[data-clip-role="do-clip"]');
                    if (startDisplay) startDisplay.textContent = '';
                    if (endDisplay) endDisplay.textContent = '';
                    if (durationDisplay) durationDisplay.textContent = window.YayaRendererUtils.t('时长: 0s');
                    if (clipButton) clipButton.disabled = true;
                    document.getElementById(definition.id)?.appendChild(toolbar);
                }
            });
        }
        if (!playerView.closest('.media-playback-page')) livePage.appendChild(playerView);
        return { pages, livePage, vodPage, playerView };
    }

    function activateMediaPlaybackPage(pageId, playerView = document.getElementById('live-player-view')) {
        const { pages = [] } = ensureSeparatedMediaPlayerPages();
        const targetPage = document.getElementById(pageId);
        if (!targetPage || !playerView) return false;

        const targetMode = targetPage.dataset.mediaPlaybackMode;
        const rightColumn = playerView.querySelector('#player-right-column');
        const currentToolbar = rightColumn?.querySelector('.media-clip-toolbar');
        if (currentToolbar && currentToolbar.dataset.clipToolbarOwner !== targetMode) {
            const ownerPage = pages.find(page => page.dataset.mediaPlaybackMode === currentToolbar.dataset.clipToolbarOwner);
            if (ownerPage) ownerPage.appendChild(currentToolbar);
        }

        const targetToolbar = document.querySelector(`.media-clip-toolbar[data-clip-toolbar-owner="${targetMode}"]`);
        if (targetToolbar && rightColumn && targetToolbar.parentElement !== rightColumn) {
            rightColumn.appendChild(targetToolbar);
        }

        const mediaView = document.getElementById('view-media');
        if (mediaView) mediaView.style.display = 'none';
        pages.forEach(page => { page.style.display = 'none'; });
        if (playerView.parentElement !== targetPage) targetPage.appendChild(playerView);
        targetPage.style.display = 'flex';
        targetPage.style.flexDirection = 'column';
        targetPage.scrollTop = 0;
        playerView.style.display = 'flex';
        return true;
    }

    function getPrimaryViewElements() {
        const { pages = [] } = ensureSeparatedMediaPlayerPages();
        return [
            document.getElementById('view-home'),
            document.getElementById('view-messages'),
            document.getElementById('view-media'),
            ...pages,
            document.getElementById('view-downloads'),
            document.getElementById('view-invoice'),
            document.getElementById('view-netface'),
            document.getElementById('view-database'),
            document.getElementById('view-melee-rank'),
            document.getElementById('view-official-site-music'),
            document.getElementById('view-login'),
            document.getElementById('view-fetch'),
            document.getElementById('view-private-messages'),
            document.getElementById('view-bilibili-live'),
            document.getElementById('view-flip'),
            document.getElementById('view-profile'),
            document.getElementById('view-performance'),
            document.getElementById('view-open-live'),
            document.getElementById('view-send-flip'),
            document.getElementById('view-settings'),
            document.getElementById('view-photos'),
            document.getElementById('view-room-album'),
            document.getElementById('view-member-dynamic'),
            document.getElementById('view-member-weibo'),
            document.getElementById('view-trip'),
            document.getElementById('view-room-radio'),
            document.getElementById('view-audio-programs'),
            document.getElementById('view-community'),
            document.getElementById('view-pbc'),
            document.getElementById('view-ip-check'),
            document.getElementById('view-video-library'),
            document.getElementById('view-music-library'),
            document.getElementById('view-followed-rooms')
        ].filter(Boolean);
    }

    function hideAllPrimaryViews() {
        getPrimaryViewElements().forEach(viewEl => {
            viewEl.style.display = 'none';
        });
    }

    function closeAllModalOverlays() {
        document.querySelectorAll('.modal-overlay').forEach(modalEl => {
            modalEl.style.display = 'none';
        });
    }

    function recoverToSafeHomeFromViewError(viewName, mode, error) {
        console.error(`[switchView] 页面切换失败: ${viewName}${mode ? `:${mode}` : ''}`, error);

        route.view = 'home';
        route.mode = null;
        updateTopbarPageTitle('home');

        try {
            hideAllPrimaryViews();

            const homeView = document.getElementById('view-home');
            const mediaListArea = document.getElementById('media-list-area');
            const playerView = document.getElementById('live-player-view');

            if (playerView) playerView.style.display = 'none';
            if (mediaListArea) mediaListArea.style.display = 'block';

            setGlobalSidebarVisible(false);
            setSidebarHomeMode(true);
            toggleSidebarMode('messages');

            updateSidebarButtons('home', null);

            if (homeView) {
                homeView.style.display = 'flex';
            }

            syncMessageIndexLoadingShield();
        } catch (recoveryError) {
            console.error('[switchView] 安全回退主页失败', recoveryError);
        }

        if (typeof showToast === 'function') {
            showToast(`页面加载失败，已返回主页：${viewName}`);
        }
    }

    const LOGIN_REQUIRED_VIEWS = new Set([
        'fetch',
        'flip',
        'send-flip',
        'profile',
        'performance',
        'openlive',
        'photos',
        'room-album',
        'member-dynamic',
        'member-weibo',
        'trip',
        'room-radio',
        'invoice',
        'netface',
        'private-messages',
        'followed-rooms',
        'community'
    ]);

    function isCurrentAppLoggedIn() {
        if (!getCurrentAppToken()) return false;

        if (String(getPocketUserId() || '').trim()) {
            return true;
        }

        const loggedInPanel = document.getElementById('panel-logged-in');
        if (!loggedInPanel) return false;
        const inlineDisplay = loggedInPanel.style && loggedInPanel.style.display;
        const computedDisplay = window.getComputedStyle
            ? window.getComputedStyle(loggedInPanel).display
            : inlineDisplay;
        return inlineDisplay !== 'none' && computedDisplay !== 'none';
    }

    function scheduleStoredTokenValidation() {
        if (window.desktop?.isRoomWindow) return;
        if (!getCurrentAppToken()) return;
        if (isCurrentAppLoggedIn()) return;
        if (window.__yayaAuthCheckInFlight) return;
        const validateToken = getTokenValidator();
        if (!validateToken) return;

        window.__yayaAuthCheckInFlight = true;
        setTimeout(() => {
            Promise.resolve().then(validateToken)
                .catch((error) => {
                    console.warn('自动验证登录状态失败:', error);
                })
                .finally(() => {
                    window.__yayaAuthCheckInFlight = false;
                });
        }, 0);
    }

    function ensureLoginBeforeSwitchView(viewName) {
        if (!LOGIN_REQUIRED_VIEWS.has(viewName)) return true;
        if (isCurrentAppLoggedIn()) return true;
        if (getCurrentAppToken()) {
            scheduleStoredTokenValidation();
            return true;
        }

        if (typeof showToast === 'function') {
            showToast('请先登录账号');
        }
        if (typeof window.rememberWebProtectedViewForLogin === 'function') {
            window.rememberWebProtectedViewForLogin(viewName);
        }
        switchView('login');
        return false;
    }

    const APP_TOPBAR_TITLE_MAP = {
        messages: '消息检索',
        downloads: '下载管理',
        invoice: '开具发票',
        netface: '云握手',
        database: '数据库',
        'melee-rank': '鸡腿榜',
        'official-site-music': '音乐',
        login: '账号设置',
        fetch: '抓取消息',
        'private-messages': '私信列表',
        'bilibili-live': 'B站直播',
        performance: '公演列表',
        flip: '翻牌记录',
        profile: '成员档案',
        openlive: '公演记录',
        'send-flip': '翻牌提问',
        settings: '软件设置',
        photos: '个人相册',
        'room-album': '房间相册',
        'member-dynamic': '成员动态',
        'member-weibo': '成员微博',
        trip: '成员行程',
        'room-radio': '房间上麦',
        'audio-programs': '电台',
        community: '社区',
        pbc: '屏蔽词检测',
        'ip-check': 'IP检测',
        'video-library': '视频',
        'music-library': '音乐',
        'followed-rooms': '口袋房间'
    };

    function getAppTopbarTitle(viewName, mode = null) {
        if (viewName === 'home') return '';
        if (viewName === 'media') {
            if (mode === 'live') return '正在直播';
            if (mode === 'vod') return '直播回放';
            if (mode === 'meet-live') return '海外直播';
            if (mode === 'meet-vod') return '海外回放';
            return '直播/回放';
        }
        return APP_TOPBAR_TITLE_MAP[viewName] || '';
    }

    function updateTopbarPageTitle(viewName, mode = null) {
        const titleEl = document.getElementById('topbar-page-title');
        if (!titleEl) return;

        const titleText = getAppTopbarTitle(viewName, mode);
        titleEl.textContent = titleText;
        titleEl.classList.toggle('is-visible', !!titleText);
        titleEl.title = titleText;
    }

    function updateSidebarButtons(viewName, mode) {
        const bottomButtons = [
            { id: 'btn-sb-login', defaultText: '账号设置', targetView: 'login' },
            { id: 'btn-sb-fetch', defaultText: '抓取消息', targetView: 'fetch' },
            { id: 'btn-sb-flip', defaultText: '翻牌记录', targetView: 'flip' },
            { id: 'btn-sb-send-flip', defaultText: '发送翻牌', targetView: 'send-flip' },
            { id: 'btn-sb-profile', defaultText: '详细档案', targetView: 'profile' },
            { id: 'btn-sb-open-live', defaultText: '公演记录', targetView: 'openlive' },
            { id: 'btn-sb-settings', defaultText: '⚙️ 设置', targetView: 'settings' },
            { id: 'btn-sb-photos', defaultText: '个人相册', targetView: 'photos' },
            { id: 'btn-sb-room-album', defaultText: '房间相册', targetView: 'room-album' },
            { id: 'btn-sb-room-radio', defaultText: '房间电台', targetView: 'room-radio' },
            { id: 'btn-sb-audio-programs', defaultText: '电台', targetView: 'audio-programs' },
            { id: 'btn-sb-video-library', defaultText: '视频', targetView: 'video-library' },
            { id: 'btn-sb-music-library', defaultText: '音乐', targetView: 'official-site-music' },
            { id: 'btn-sb-community', defaultText: '社区', targetView: 'community' },
            { id: 'btn-sb-followed-rooms', defaultText: '口袋房间', targetView: 'followed-rooms' },
        ];

        bottomButtons.forEach(btn => {
            const el = document.getElementById(btn.id);
            if (!el) return;

            if (viewName === btn.targetView) {
                el.textContent = '返回主页';
                el.className = 'btn btn-primary btn-full';
                el.onclick = () => switchView('home');
            } else {
                el.textContent = btn.defaultText;
                el.className = 'btn btn-secondary btn-full';
                el.onclick = () => switchView(btn.targetView);
            }
        });

        [
            { id: 'btn-sb-live', label: '正在直播', mode: 'live' },
            { id: 'btn-sb-vod', label: '录播回放', mode: 'vod' }
        ].forEach((btn) => {
            const el = document.getElementById(btn.id);
            if (!el) return;
            if (viewName === 'media' && mode === btn.mode) {
                el.textContent = '返回主页';
                el.className = 'btn btn-primary';
                el.onclick = () => switchView('home');
            } else {
                el.textContent = btn.label;
                el.className = 'btn btn-secondary';
                el.onclick = () => switchView('media', btn.mode);
            }
        });
    }


    const SIDEBARLESS_VIEWS = new Set([
        'home', 'media', 'downloads', 'netface', 'invoice', 'database', 'melee-rank',
        'official-site-music', 'private-messages', 'bilibili-live', 'performance', 'settings', 'login', 'fetch',
        'flip', 'send-flip', 'profile', 'photos', 'room-album', 'member-dynamic', 'member-weibo', 'trip',
        'openlive', 'room-radio', 'audio-programs', 'community', 'pbc', 'ip-check', 'music-library',
        'followed-rooms', 'video-library'
    ]);
    let desktopNavigate;

    function canLeave(next, mode) {
        const beforeLeave = window.beforeLeaveNetfaceView;
        return route.view !== 'netface' || next === 'netface'
            || typeof beforeLeave !== 'function' || beforeLeave(next, mode);
    }

    function prepareViewChange(previous, next, mode) {
        if (previous === 'database' && next !== previous) window.captureDatabaseScroll?.();
        closeAllModalOverlays();
        onLeave(previous, next, mode);
    }

    function hideBackToTop() {
        document.getElementById('backToTopBtn')?.classList.remove('show');
    }

    function enterAppView(view, mode) {
        if (window.desktop?.isLiveWindow) return;

        beforeEnter();
        const page = SIDEBARLESS_VIEWS.has(view) ? view : 'messages';
        const viewElement = document.getElementById('view-' + page);
        if (viewElement) viewElement.style.display = getPageDisplay(page);
        if ((page === 'downloads' || page === 'settings' || page === 'messages'
            || page === 'followed-rooms' || page === 'video-library' || page === 'music-library') && !viewElement) return;

        if (page === 'media') {
            if (viewElement) viewElement.style.flexDirection = 'column';
            route.mediaMode = mode;
            onEnter.media();
            document.getElementById('live-player-view').style.display = 'none';
            document.getElementById('media-list-area').style.display = 'block';
            document.querySelectorAll('.media-playback-page').forEach(element => { element.style.display = 'none'; });
        } else if (page === 'downloads') {
            const downloadModule = document.getElementById('sb-download');
            if (downloadModule) downloadModule.style.display = 'flex';
        } else if (page === 'send-flip') {
            if (!getCurrentAppToken()) {
                showToast('请先登录账号');
                return switchView('login');
            }
            setTimeout(() => {
                if (route.view !== 'send-flip') return;
                if (window.suppressNextFlipMemberAutofocus) {
                    window.suppressNextFlipMemberAutofocus = false;
                    return;
                }
                if (window.desktop?.platform === 'web' && window.matchMedia?.('(max-width: 768px)').matches) return;
                document.getElementById('flip-send-member-input')?.focus();
            }, 100);
        } else {
            onEnter[page]?.();
        }
    }

    function switchLegacyView(viewName, mode) {
        try {
            if (!canLeave(viewName, mode)) return;
            if (viewName === 'openlive') viewName = 'performance';
            if (viewName !== 'login' && !ensureLoginBeforeSwitchView(viewName)) return;

            prepareViewChange(route.view, viewName, mode);
            route.view = viewName;
            route.mode = mode;
            window.dispatchEvent(new CustomEvent('yaya:view-changed', { detail: { view: viewName, mode } }));
            updateTopbarPageTitle(viewName, mode);
            window.YayaPlatformAdapter?.onViewChanged?.(viewName, mode);
            hideBackToTop();

            hideAllPrimaryViews();
            afterHide(viewName, false);
            updateSidebarButtons(viewName, mode);
            const messageLayout = !SIDEBARLESS_VIEWS.has(viewName);
            setGlobalSidebarVisible(messageLayout);
            setSidebarHomeMode(viewName === 'home');
            toggleSidebarMode(viewName === 'home' || messageLayout ? 'messages' : viewName === 'media' ? 'media' : 'login');
            enterAppView(viewName, mode);

            if (viewName !== 'messages') syncMessageIndexLoadingShield();
        } catch (error) {
            recoverToSafeHomeFromViewError(viewName, mode, error);
        }
    }

    function switchView(viewName, mode = null) {
        if (window.desktop?.isRoomWindow && viewName === 'home') viewName = 'followed-rooms';
        if (!window.desktop || window.desktop.platform === 'web') return switchLegacyView(viewName, mode);
        if (!desktopNavigate) {
            desktopNavigate = createDesktopNavigation({
                getPages: getPrimaryViewElements,
                getRoute: () => route,
                ensureLogin: ensureLoginBeforeSwitchView,
                canLeave,
                setRoute(view, nextMode) {
                    route.view = view;
                    route.mode = nextMode;
                    if (view === 'media') route.mediaMode = nextMode;
                    updateTopbarPageTitle(view, nextMode);
                },
                leavePage(previous, next, nextMode) {
                    prepareViewChange(previous, next, nextMode);
                    afterHide(next, true);
                    hideBackToTop();
                },
                enterPage(view, nextMode) {
                    enterAppView(view, nextMode);
                    if (view !== 'messages') syncMessageIndexLoadingShield();
                }
            });
        }
        return desktopNavigate(viewName, mode);
    }

    const scrollablePageIds = [
        'view-messages', 'view-media', ...MEDIA_PLAYBACK_PAGE_DEFINITIONS.map(page => page.id),
        'view-flip', 'view-open-live', 'view-profile', 'view-fetch', 'view-send-flip',
        'view-trip', 'view-member-dynamic', 'view-member-weibo'
    ];

    function scrollToTop() {
        for (const id of scrollablePageIds) {
            const page = document.getElementById(id);
            if (page && window.getComputedStyle(page).display !== 'none') page.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function initBackToTopListener() {
        const button = document.getElementById('backToTopBtn');
        if (!button) return;
        for (const id of scrollablePageIds) {
            const page = document.getElementById(id);
            page?.addEventListener('scroll', () => {
                if (window.getComputedStyle(page).display !== 'none') button.classList.toggle('show', page.scrollTop > 1500);
            }, { passive: true });
        }
    }

    function install(navigate = switchView) {
        const pending = Array.isArray(window.__yayaPendingSwitchView) ? window.__yayaPendingSwitchView : null;
        window.__yayaPendingSwitchView = null;
        window.switchView = navigate;
        window.toggleSidebar = toggleSidebar;
        window.getAppTopbarTitle = getAppTopbarTitle;
        window.scrollToTop = scrollToTop;
        updateTopbarPageTitle(route.view, route.mode);
        if (pending) setTimeout(() => navigate(...pending), 0);
    }

    return {
        navigate: switchView,
        install,
        mountSidebarPanelsToViews,
        activateMediaPlaybackPage,
        closeAllModalOverlays,
        initBackToTopListener
    };
}

export function installAppOverlayControls({ getView, switchView }) {
    const dropdowns = [
        ['groupInput', 'memberDropdownList', true],
        ['member-search', 'search-results', true],
        ['profile-member-input', 'profile-search-results', true],
        ['openlive-member-input', 'openlive-search-results', true],
        ['vod-member-filter', 'member-suggestions', true],
        ['photo-member-input', 'photo-search-results', true],
        ['room-album-member-input', 'room-album-search-results', true],
        ['room-radio-member-input', 'room-radio-search-results', true],
        ['vod-group-wrapper', 'vod-group-dropdown', false],
        ['vod-type-wrapper', 'vod-type-dropdown', false],
        ['message-date-wrapper', 'message-date-dropdown', false],
        ['flip-date-wrapper', 'flip-date-dropdown', false],
        ['flip-type-wrapper', 'flip-type-dropdown', false],
        ['flip-member-filter-wrapper', 'flip-member-filter-dropdown', false],
        ['flip-visibility-wrapper', 'flip-visibility-dropdown', false],
        ['flip-sort-wrapper', 'flip-sort-dropdown', false],
        ['live-group-wrapper', 'live-group-dropdown', false],
        ['live-type-wrapper', 'live-type-dropdown', false],
        ['followed-sort-wrapper', 'followed-sort-dropdown', false],
        ['flip-member-wrapper', 'flip-send-search-results', false],
        ['flip-answer-wrapper', 'flip-answer-dropdown', false],
        ['flip-privacy-wrapper', 'flip-privacy-dropdown', false],
    ];
    const modals = [
        ['contextModal', 'closeContextModal'],
        ['imageModal', 'closeImageModal'],
        ['userModal', 'closeUserAnalysis'],
        ['dateModal', 'closeDateAnalysis'],
        ['danmuAnalysisModal', 'closeDanmuAnalysis'],
        ['speechAnalysisModal', 'closeSpeechAnalysis'],
        ['giftAnalysisModal', 'closeGiftAnalysis'],
        ['liveRankModal', 'closeLiveRankModal'],
        ['autoLiveRecordModal', 'closeAutoLiveRecordModal'],
        ['autoRoomRadioRecordModal', 'closeAutoRoomRadioRecordModal'],
        ['flipAnalysisModal', 'closeFlipAnalysis'],
        ['flipDefaultSettingsModal', 'closeFlipDefaultSettings'],
        ['global-announcement-modal', 'closeAnnouncement']
    ];
    const backdropClosers = new Map(modals.filter(([id]) =>
        !['contextModal', 'imageModal', 'flipDefaultSettingsModal', 'global-announcement-modal'].includes(id)
    ));

    document.addEventListener('click', ({ target }) => {
        for (const [ownerId, dropdownId, useParent] of dropdowns) {
            const dropdown = document.getElementById(dropdownId);
            if (!dropdown || dropdown.style.display === 'none') continue;
            const owner = document.getElementById(ownerId);
            const wrapper = useParent ? owner?.parentElement : owner;
            if (!wrapper?.contains(target)) dropdown.style.display = 'none';
        }
        if (target.classList?.contains('modal-overlay')) window[backdropClosers.get(target.id)]?.();
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const modal = modals.find(([id]) => {
            const element = document.getElementById(id);
            return element && window.getComputedStyle(element).display !== 'none';
        });
        if (modal) {
            window[modal[1]]?.();
            event.preventDefault();
            return;
        }
        const openDropdown = [...document.querySelectorAll('.suggestion-box')]
            .find(dropdown => window.getComputedStyle(dropdown).display !== 'none');
        if (openDropdown) {
            openDropdown.style.display = 'none';
            event.preventDefault();
            return;
        }
        const active = document.activeElement;
        const typing = active && (active.matches('input, textarea, select') || active.isContentEditable);
        if (typing || getView() === 'home') return;
        event.preventDefault();
        switchView('home');
    });
}
