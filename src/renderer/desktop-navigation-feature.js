(function () {
    'use strict';
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};
    window.YayaRendererFeatures.createDesktopNavigation = function (deps) {
        const pages = new Map(deps.getPages().map(page => [page.id.slice(5), page]));
        const flexPages = new Set(['home', 'media', 'official-site-music', 'audio-programs', 'community', 'video-library', 'music-library']);
        const deferredPages = new Set(['media', 'private-messages', 'followed-rooms']);
        let revision = 0, frame = 0, task = 0, initialized = false;
        function cancelEntry() {
            if (frame) cancelAnimationFrame(frame);
            if (task) clearTimeout(task);
            frame = task = 0;
        }
        function show(view) {
            pages.forEach((page, name) => {
                const display = name === view ? (flexPages.has(name) ? 'flex' : 'block') : 'none';
                if (page.style.display !== display) page.style.display = display;
            });
            document.querySelectorAll('.media-playback-page').forEach(page => {
                if (page.style.display !== 'none') page.style.display = 'none';
            });
        }
        function notify(view, mode) {
            deps.setRoute(view, mode);
            window.dispatchEvent(new CustomEvent('yaya:view-changed', { detail: { view, mode } }));
        }
        return function navigate(view, mode = null) {
            if (view === 'openlive') view = 'performance';
            if (!pages.has(view)) view = 'messages';
            const previous = deps.getRoute();
            if (initialized && previous.view === view && previous.mode === mode && pages.get(view).style.display !== 'none') return;
            if (!deps.canLeave(view, mode) || (view !== 'login' && !deps.ensureLogin(view))) return;
            initialized = true;
            cancelEntry();
            const currentRevision = ++revision;
            try {
                deps.leavePage(previous.view, view, mode);
                show(view);
                notify(view, mode);
                const enter = () => {
                    frame = task = 0;
                    if (revision !== currentRevision) return;
                    try { deps.enterPage(view, mode); }
                    catch (error) {
                        console.error('[desktop navigation] Failed to enter page', error);
                        show('home');
                        notify('home', null);
                    }
                };
                if (deferredPages.has(view)) {
                    // Paint the selected page before its data loads and secondary work.
                    frame = requestAnimationFrame(() => { task = setTimeout(enter, 0); });
                } else enter();
            } catch (error) {
                console.error('[desktop navigation] Failed to switch page', error);
                show('home');
                notify('home', null);
            }
        };
    };
})();
