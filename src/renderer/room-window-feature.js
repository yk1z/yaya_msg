(function () {
    'use strict';
    if (!window.desktop || window.desktop.platform === 'web') return;
    const ipc = window.desktop.ipcRenderer;

    window.openFollowedRoomWindow = async function (room, options = {}) {
        const active = window.getActiveFollowedRoomWindowContext?.();
        const sameRoom = active && String(active.mainChannelId) === String(room.mainChannelId || room.channelId)
            && String(active.serverId) === String(room.serverId);
        const context = sameRoom ? {
            ...room, ...active,
            smallChannelId: active.smallChannelId || room.smallChannelId,
            memberId: active.memberId || room.memberId,
            avatarUrl: active.avatarUrl || room.avatarUrl
        } : { ...room };
        if (options.fromDrag) context.dragOutsideHalf = options.detachEligible === true;
        try {
            const result = await ipc.invoke(options.fromDrag ? 'open-room-window-from-drag' : 'open-room-window', context);
            if (!result?.success) {
                if (!result?.cancelled) window.showToast?.(result?.msg || '独立窗口打开失败，请重试');
            }
            return result;
        } catch (_) {
            window.showToast?.('独立窗口打开失败，请重试');
            return { success: false };
        }
    };

    if (!window.desktop.isRoomWindow || window.desktop.isLiveWindow) return;

    async function startRoomWindow() {
        const root = document.documentElement;
        const body = document.body;
        root.dataset.roomWindow = 'true';
        body.classList.add('room-window');
        body.dataset.desktopView = 'followed-rooms';
        document.querySelectorAll('#mainContentArea > [id^="view-"]').forEach(page => {
            page.classList.add('desktop-page');
            page.style.display = page.id === 'view-followed-rooms' ? 'block' : 'none';
        });
        document.getElementById('view-followed-rooms').classList.add('desktop-conversations', 'is-chat-open');

        const title = document.querySelector('.title-info > span');
        if (title) title.textContent = '牙牙消息 · 房间';
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'room-window-back';
        back.textContent = '‹ 返回房间';
        back.hidden = true;
        back.addEventListener('click', () => window.switchView('followed-rooms'));
        document.querySelector('.custom-title-bar').appendChild(back);
        window.addEventListener('yaya:view-changed', event => {
            const view = event.detail?.view || 'followed-rooms';
            body.dataset.desktopView = view;
            back.hidden = view === 'followed-rooms';
            syncTitle();
        });
        const heading = document.getElementById('followed-chat-title');
        const syncTitle = () => {
            const view = body.dataset.desktopView || 'followed-rooms';
            const isRoom = view === 'followed-rooms';
            const pageTitle = view === 'send-flip' ? '提问'
                : view === 'flip' ? '历史'
                : ['room-album', 'photos'].includes(view) ? '相册'
                : document.getElementById('topbar-page-title')?.textContent.trim() || '详情';
            const label = `牙牙消息 · ${isRoom ? '房间' : pageTitle}`;
            if (title) title.textContent = label;
            const name = heading.textContent.trim();
            document.title = isRoom && name ? `${name} · 牙牙消息` : label;
        };
        new MutationObserver(syncTitle).observe(heading, { childList: true, subtree: true, characterData: true });

        try {
            const context = await ipc.invoke('get-room-window-context');
            if (!context?.channelId || !context.serverId) throw new Error('房间信息已失效，请关闭窗口后重新打开');
            if (!window.getAppToken?.()) throw new Error('请先在主窗口登录，然后重新打开房间');
            window.switchView('followed-rooms');
            // Render immediately from the selected card; enrich member details in the background.
            window.openFollowedChat(context.ownerName, context.channelId, context.serverId, context);
            void Promise.resolve(window.loadMemberData?.()).catch(() => {});
            syncTitle();
            window.__appStartupComplete = true;
            window.dispatchEvent(new CustomEvent('yaya:app-startup-complete'));
        } catch (error) {
            const box = document.getElementById('followed-chat-messages');
            box.textContent = error.message || '房间打开失败，请关闭窗口后重试';
            box.classList.add('room-window-error');
        } finally {
            root.classList.remove('desktop-workspace-pending');
            ipc.send('desktop-workspace-ready');
        }
    }

    // This script follows the room markup and feature definitions. Start now;
    // unrelated module scripts and the remaining document need not delay the room.
    void startRoomWindow();
})();
