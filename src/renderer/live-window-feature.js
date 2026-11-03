(function () {
    'use strict';
    if (!window.desktop || window.desktop.platform === 'web') return;
    const ipc = window.desktop.ipcRenderer;
    window.openLiveWindowForItem = async (item, mode = 'live') => {
        const target = { liveId: String(item?.liveId || ''), mode,
            ownerName: item?.userInfo?.nickname || item?.nickname || '直播', title: item?.title || item?.liveTitle || '直播' };
        if (!target.liveId) { window.showToast?.('直播信息不完整'); return; }
        try {
            const result = await ipc.invoke('open-live-window', target);
            if (!result?.success) { window.showToast?.(result?.msg || '直播窗口打开失败'); return; }
            return result;
        } catch (_) { window.showToast?.('直播窗口打开失败，请重试'); }
    };
    let menu = null, selected = null;
    const hideMenu = () => { if (menu) menu.hidden = true; selected = null; };
    window.showLiveWindowMenu = (event, item, mode = 'live') => {
        event.preventDefault(); event.stopPropagation();
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'live-window-context-menu'; menu.className = 'yaya-context-menu';
            menu.style.cssText = 'position:fixed;z-index:99999;width:152px;box-sizing:border-box;';
            const action = document.createElement('button');
            action.type = 'button'; action.className = 'yaya-context-menu-item'; action.textContent = '独立窗口播放';
            action.addEventListener('pointerdown', event => { if (event.button === 0) event.preventDefault(); });
            action.addEventListener('click', event => {
                event.stopPropagation(); const target = selected; hideMenu();
                if (target) void window.openLiveWindowForItem(target.item, target.mode);
            });
            menu.appendChild(action); document.body.appendChild(menu);
            document.addEventListener('click', hideMenu);
            document.addEventListener('scroll', hideMenu, true);
            document.addEventListener('keydown', event => { if (event.key === 'Escape') hideMenu(); });
            window.addEventListener('resize', hideMenu);
            window.addEventListener('yaya:view-changed', hideMenu);
        }
        selected = { item, mode }; menu.hidden = false;
        menu.style.left = '0px'; menu.style.top = '0px';
        const rect = menu.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(event.clientX, innerWidth - rect.width - 8)) + 'px';
        menu.style.top = Math.max(8, Math.min(event.clientY, innerHeight - rect.height - 8)) + 'px';
    };
    if (!window.desktop.isLiveWindow) return;

    async function start() {
        const root = document.documentElement;
        root.dataset.liveWindow = 'true';
        const brand = document.querySelector('.title-info > span');
        if (brand) brand.textContent = '牙牙消息 · 直播';
        const player = document.getElementById('live-player-view');
        const back = player.querySelector('button[onclick="backToLiveList()"]');
        back?.remove();
        window.showDetachedLiveError = () => {
            const container = document.getElementById('live-player-container');
            container.replaceChildren();
            const retry = document.createElement('button');
            retry.type = 'button'; retry.className = 'btn btn-secondary'; retry.textContent = '重新播放';
            retry.onclick = () => location.reload();
            container.appendChild(retry);
        };
        window.addEventListener('beforeunload', () => window.destroyPlayers?.());
        try {
            const context = await ipc.invoke('get-room-window-context');
            if (context?.kind !== 'live') throw new Error('直播信息已失效，请关闭窗口后重试');
            const isVod = context.mode.endsWith('vod');
            if (brand) brand.textContent = `牙牙消息 · ${isVod ? '回放' : '直播'}`;
            document.title = `${context.ownerName} · ${isVod ? '回放' : '直播'} · 牙牙消息`;
            window.switchView('media', context.mode);
            let resizeFrame = 0;
            window.addEventListener('resize', () => {
                if (resizeFrame) cancelAnimationFrame(resizeFrame);
                resizeFrame = requestAnimationFrame(() => {
                    resizeFrame = 0;
                    window.configurePlayerLayout?.(context.mode);
                });
            });
            document.querySelectorAll('#mainContentArea > [id^="view-"]').forEach(page => page.classList.add('desktop-page'));
            root.classList.remove('desktop-workspace-pending');
            ipc.send('desktop-workspace-ready');
            await window.playLiveStream({ liveId: context.liveId, title: context.title,
                userInfo: { nickname: context.ownerName }, ...(context.mode.startsWith('meet-') ? { source: 'meet48' } : {}) }, context.mode);
            window.__appStartupComplete = true;
        } catch (error) {
            window.showDetachedLiveError();
            window.showToast?.(error.message || '直播播放失败');
        } finally {
            root.classList.remove('desktop-workspace-pending');
            ipc.send('desktop-workspace-ready');
        }
    }
    void start();
})();
