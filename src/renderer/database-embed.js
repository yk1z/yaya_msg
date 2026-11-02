(function initDatabaseEmbed() {
    const DATABASE_STYLES_PATH = 'src/renderer/database/styles.css';
    const DATABASE_TAILWIND_PATH = 'src/renderer/database/tailwind.css';
    const DESKTOP_DATABASE_RUNTIME_PATH = './database/runtime.js';
    const WEB_DATABASE_RUNTIME_PATH = '/src/renderer/database/runtime.js';
    const WEB_DATABASE_STYLES_PATH = '/src/renderer/database/styles.css';
    const WEB_DATABASE_TAILWIND_PATH = '/src/renderer/database/tailwind.css';
    const EMBED_SCRIPT_SRC = document.currentScript && document.currentScript.src ? document.currentScript.src : '';

    let runtimePromise = null;
    let mountPromise = null;
    let databaseModule = null;
    let releaseTimer = null;
    let savedScroll = [];
    function scrollElements(host) {
        return [document.getElementById('view-database'), host, ...host.querySelectorAll('*')].filter(Boolean);
    }
    function captureDatabaseScroll() {
        const host = getDatabaseHost();
        if (!host) return;
        savedScroll = scrollElements(host).flatMap((element, index) =>
            element.scrollTop || element.scrollLeft ? [{ index, top: element.scrollTop, left: element.scrollLeft }] : []);
    }
    function restoreDatabaseScroll(host) {
        if (!savedScroll.length) return;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (host.dataset.databaseMounted !== 'true') return;
            const elements = scrollElements(host);
            for (const scroll of savedScroll) {
                if (elements[scroll.index]) {
                    elements[scroll.index].scrollTop = scroll.top;
                    elements[scroll.index].scrollLeft = scroll.left;
                }
            }
            savedScroll = [];
        }));
    }

    function getDatabaseHost() {
        return document.getElementById('database-root');
    }

    function isWebRuntime() {
        return !!(window.desktop && window.desktop.platform === 'web');
    }

    function getWebDatabaseRuntimeUrl() {
        return getVersionedRuntimeUrl(WEB_DATABASE_RUNTIME_PATH);
    }

    function getDesktopDatabaseRuntimeUrl() {
        return getVersionedRuntimeUrl(DESKTOP_DATABASE_RUNTIME_PATH);
    }

    function getVersionedRuntimeUrl(runtimePath) {
        let version = '';
        try {
            version = new URL(EMBED_SCRIPT_SRC).searchParams.get('v') || '';
        } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/database-embed.js'); }
        return version
            ? `${runtimePath}?v=${encodeURIComponent(version)}`
            : runtimePath;
    }

    function setDatabaseState(html, className) {
        const host = getDatabaseHost();
        if (!host) return;
        host.innerHTML = `<div class="${className}">${html}</div>`;
    }

    async function ensureRuntime() {
        if (runtimePromise) return runtimePromise;
        runtimePromise = Promise.resolve();
        return runtimePromise;
    }

    async function readDatabaseAsset(desktopPath, webPath) {
        const desktop = window.desktop;
        if (desktop && desktop.platform === 'web') {
            const response = await fetch(webPath);
            if (!response.ok) {
                throw new Error(`数据库资源加载失败: ${response.status}`);
            }
            return response.text();
        }

        if (!desktop || !desktop.fs || !desktop.path || !desktop.appDir) {
            throw new Error('数据库运行环境未准备好');
        }

        const assetPath = desktop.path.join(desktop.appDir, desktopPath);
        return desktop.fs.readFileSync(assetPath, 'utf8');
    }

    async function readDatabaseStyles() {
        const [tailwindStyles, databaseStyles] = await Promise.all([
            readDatabaseAsset(DATABASE_TAILWIND_PATH, WEB_DATABASE_TAILWIND_PATH),
            readDatabaseAsset(DATABASE_STYLES_PATH, WEB_DATABASE_STYLES_PATH)
        ]);
        return `${tailwindStyles}\n${databaseStyles}`;
    }

    function injectDatabaseStyles(styles) {
        if (document.getElementById('database-embed-style')) return;

        const style = document.createElement('style');
        style.id = 'database-embed-style';
        style.textContent = String(styles || '')
            .replace(/html\s*,\s*body\s*\{[\s\S]*?\}\s*/g, '')
            .replace(/body\s*\{[\s\S]*?\}\s*/g, '');
        document.head.appendChild(style);
    }

    async function mountDatabaseView() {
        const host = getDatabaseHost();
        if (!host) return;
        if (host.dataset.databaseMounted === 'true') return;
        if (mountPromise) return mountPromise;

        mountPromise = (async () => {
            try {
                const styles = await readDatabaseStyles();
                injectDatabaseStyles(styles);
                await ensureRuntime();

                if (isWebRuntime()) {
                    host.replaceChildren();
                    databaseModule = await import(getWebDatabaseRuntimeUrl());
                    databaseModule.mountDatabaseApp?.(host);
                    host.dataset.databaseMounted = 'true';
                    restoreDatabaseScroll(host);
                    return;
                }

                host.replaceChildren();
                databaseModule = await import(getDesktopDatabaseRuntimeUrl());
                databaseModule.mountDatabaseApp?.(host);
                host.dataset.databaseMounted = 'true';
                restoreDatabaseScroll(host);
            } catch (error) {
                console.error('数据库页面挂载失败:', error);
                setDatabaseState(`数据库加载失败<br>${error.message || error}`, 'database-error');
            } finally {
                mountPromise = null;
            }
        })();

        return mountPromise;
    }

    window.mountDatabaseView = mountDatabaseView;
    function releaseInactiveDatabaseView() {
        const host = getDatabaseHost();
        const view = document.getElementById('view-database');
        if (!host || !view || view.style.display !== 'none' || mountPromise
            || host.dataset.databaseMounted !== 'true' || !databaseModule?.unmountDatabaseApp) return false;
        if (host.querySelector('[role="dialog"], .fixed.inset-0')
            || [...host.querySelectorAll('audio, video')].some(media => !media.paused)) return false;
        if (!savedScroll.length) captureDatabaseScroll();
        databaseModule.unmountDatabaseApp();
        host.replaceChildren();
        delete host.dataset.databaseMounted;
        return true;
    }
    window.releaseInactiveDatabaseView = releaseInactiveDatabaseView;
    window.captureDatabaseScroll = captureDatabaseScroll;
    window.addEventListener('yaya:view-changed', () => {
        if (releaseTimer) clearTimeout(releaseTimer);
        releaseTimer = null;
        if (document.getElementById('view-database')?.style.display === 'none') {
            releaseTimer = setTimeout(releaseInactiveDatabaseView, 120_000);
        }
    });
})();
