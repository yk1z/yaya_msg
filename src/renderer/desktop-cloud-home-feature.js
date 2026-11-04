(function () {
    if (!window.desktop || window.desktop.platform === 'web') return;
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};
    const SOURCE_URL = 'https://home.gnz.hk/';
    const CACHE_KEY = 'desktop_cloud_home_v1';
    const MAX_BYTES = 1024 * 1024;
    const FRAME_POLICY = "default-src https: data: blob:; script-src https: blob: 'unsafe-inline' 'unsafe-eval'; style-src https: 'unsafe-inline'; connect-src https:; frame-src 'none'; object-src 'none'; base-uri https:; form-action https:";

    function validHtml(html) {
        return typeof html === 'string' && html.length <= MAX_BYTES
            && /<(?:!doctype\s+html|html)[\s>]/i.test(html)
            && /<meta\b(?=[^>]*\bname=["']yaya-desktop-home["'])(?=[^>]*\bcontent=["']1["'])[^>]*>/i.test(html);
    }

    function pageBridge() {
        window.addEventListener('message', event => {
            if (event.source !== parent || event.data?.type !== 'yaya:home-theme') return;
            const theme = event.data.theme === 'light' ? 'light' : 'dark';
            document.documentElement.dataset.theme = theme;
            document.documentElement.style.colorScheme = theme;
            document.documentElement.dataset.desktopCustomBackground = String(event.data.customBackground === true);
        });
        document.addEventListener('click', event => {
            const anchor = event.target.closest?.('a[href]');
            if (!anchor || anchor.hasAttribute('download')) return;
            const href = anchor.getAttribute('href');
            if (href.startsWith('#')) {
                event.preventDefault();
                let id = href.slice(1);
                try { id = decodeURIComponent(id); } catch (_) {}
                if (!id) window.scrollTo(0, 0);
                else document.getElementById(id)?.scrollIntoView();
                return;
            }
            let url;
            try { url = new URL(anchor.href); } catch (_) { return; }
            if (!['https:', 'http:', 'yayamsg:'].includes(url.protocol)) return;
            event.preventDefault();
            parent.postMessage({ type: 'yaya:home-link', url: url.href }, '*');
        });
    }

    function frameDocument(html, theme, customBackground) {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        parsed.querySelectorAll('base').forEach(base => base.remove());
        const base = parsed.createElement('base');
        base.href = SOURCE_URL;
        const bridge = parsed.createElement('script');
        bridge.textContent = `(${pageBridge.toString()})();`;
        const backgroundStyle = parsed.createElement('style');
        backgroundStyle.textContent = 'html[data-desktop-custom-background="true"],html[data-desktop-custom-background="true"] body{background:transparent!important}';
        const policy = parsed.createElement('meta');
        policy.httpEquiv = 'Content-Security-Policy';
        policy.content = FRAME_POLICY;
        parsed.head.prepend(policy, base, bridge);
        parsed.head.appendChild(backgroundStyle);
        parsed.documentElement.dataset.theme = theme;
        parsed.documentElement.style.colorScheme = theme;
        parsed.documentElement.dataset.desktopCustomBackground = String(customBackground);
        return '<!doctype html>\n' + parsed.documentElement.outerHTML;
    }

    async function readHtmlResponse(response) {
        if (!response.ok) throw new Error('Cloud homepage unavailable');
        if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Cloud homepage too large');
        if (!response.body?.getReader) {
            const text = await response.text();
            if (!validHtml(text)) throw new Error('Invalid cloud homepage');
            return text;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let size = 0;
        let text = '';
        try {
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > MAX_BYTES) throw new Error('Cloud homepage too large');
                text += decoder.decode(value, { stream: true });
            }
            text += decoder.decode();
        } finally { await reader.cancel().catch(() => {}); }
        if (!validHtml(text)) throw new Error('Invalid cloud homepage');
        return text;
    }

    window.YayaRendererFeatures.createDesktopCloudHome = function ({ homeView, fetchHtml = window.fetch.bind(window) }) {
        if (!homeView) return null;
        const host = homeView.querySelector('.desktop-cloud-home') || document.createElement('section');
        host.className = 'desktop-cloud-home';
        host.setAttribute('aria-label', '主页');
        host.hidden = false;
        if (!host.parentElement) homeView.appendChild(host);
        let status = host.querySelector('.desktop-cloud-home-status');
        if (!status) {
            status = document.createElement('div');
            status.className = 'desktop-cloud-home-status';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            const message = document.createElement('p');
            message.className = 'desktop-cloud-home-message';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-secondary desktop-cloud-home-retry';
            button.textContent = '重新加载';
            status.append(message, button);
            host.appendChild(status);
        }
        const statusText = status.querySelector('.desktop-cloud-home-message');
        const retry = status.querySelector('.desktop-cloud-home-retry');
        let currentFrame = null;
        let pendingFrame = null;
        let renderedHtml = '';
        let pendingHtml = '';
        let inFlight = null;
        let controller = null;
        let lastAttempt = 0;
        let disposed = false;
        let generation = 0;
        let frameTimeout = null;
        let loadingTimeout = null;
        let restoringCache = false;
        const cache = window.desktop.appCache;
        const theme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
        const customBackground = () => document.documentElement.dataset.customBackground === 'true';
        const sendTheme = () => {
            for (const frame of [currentFrame, pendingFrame]) {
                if (frame) frame.style.colorScheme = theme();
            }
            currentFrame?.contentWindow?.postMessage({ type: 'yaya:home-theme', theme: theme(), customBackground: customBackground() }, '*');
        };

        function showStatus(failed = false) {
            clearTimeout(loadingTimeout);
            if (disposed || currentFrame) return;
            status.hidden = !failed;
            statusText.textContent = failed ? '主页暂时无法加载' : '正在加载主页…';
            retry.hidden = !failed;
            host.setAttribute('aria-busy', String(!failed));
            if (!failed && !restoringCache) {
                loadingTimeout = setTimeout(() => {
                    if (!disposed && !currentFrame) status.hidden = false;
                }, 500);
            }
        }
        showStatus();
        retry.addEventListener('click', () => { void refresh({ force: true }); });

        function render(html) {
            if (disposed || !validHtml(html) || html === renderedHtml || html === pendingHtml) return;
            const revision = ++generation;
            clearTimeout(frameTimeout);
            pendingFrame?.remove();
            const frame = document.createElement('iframe');
            frame.className = 'desktop-cloud-home-frame';
            frame.title = '主页';
            frame.name = 'yaya-cloud-home';
            frame.style.colorScheme = theme();
            frame.setAttribute('sandbox', 'allow-scripts allow-forms');
            frame.setAttribute('csp', FRAME_POLICY);
            frame.referrerPolicy = 'no-referrer';
            frame.hidden = true;
            pendingFrame = frame;
            pendingHtml = html;
            frame.addEventListener('load', () => {
                if (disposed || revision !== generation) return;
                clearTimeout(frameTimeout);
                clearTimeout(loadingTimeout);
                restoringCache = false;
                currentFrame?.remove();
                currentFrame = frame;
                pendingFrame = null;
                renderedHtml = html;
                pendingHtml = '';
                status.hidden = true;
                host.setAttribute('aria-busy', 'false');
                host.hidden = false;
                frame.hidden = false;
                sendTheme();
                try { cache?.setCacheValueSync(CACHE_KEY, { html, updatedAt: Date.now() }); } catch (_) {}
                window.dispatchEvent(new CustomEvent('yaya:cloud-home-ready'));
            }, { once: true });
            frameTimeout = setTimeout(() => {
                if (disposed || revision !== generation || pendingFrame !== frame) return;
                frame.remove();
                pendingFrame = null;
                pendingHtml = '';
                restoringCache = false;
                showStatus(true);
            }, 10000);
            frame.srcdoc = frameDocument(html, theme(), customBackground());
            host.appendChild(frame);
        }

        function refresh({ force = false } = {}) {
            if (disposed) return Promise.resolve(false);
            if (inFlight) return inFlight;
            if (!force && Date.now() - lastAttempt < 60000) return Promise.resolve(false);
            lastAttempt = Date.now();
            showStatus();
            controller = new AbortController();
            const timeout = setTimeout(() => controller?.abort(), 8000);
            inFlight = Promise.resolve().then(() => fetchHtml(`${SOURCE_URL}?t=${Date.now()}`, {
                cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal
            })).then(readHtmlResponse).then(html => {
                if (disposed) return false;
                render(html);
                return true;
            }).catch(() => {
                if (!pendingFrame) showStatus(true);
                return false;
            }).finally(() => {
                clearTimeout(timeout);
                inFlight = null;
                controller = null;
            });
            return inFlight;
        }

        function receiveLink(event) {
            if (disposed || !currentFrame || event.source !== currentFrame.contentWindow
                || document.body.dataset.desktopView !== 'home' || event.data?.type !== 'yaya:home-link') return;
            const raw = event.data.url;
            if (typeof raw !== 'string' || raw.length > 4096) return;
            let url;
            try { url = new URL(raw); } catch (_) { return; }
            if (url.username || url.password) return;
            if (url.protocol === 'yayamsg:' && window.YayaDeepLink?.parseDeepLink(raw)) {
                window.dispatchEvent(new CustomEvent('yaya:cloud-home-link', { detail: { url: raw } }));
            } else if (['https:', 'http:'].includes(url.protocol)) {
                void window.desktop.openExternal(url.href);
            }
        }
        const onView = event => { if (event.detail?.view === 'home') void refresh(); };
        const onFocus = () => { if (document.body.dataset.desktopView === 'home') void refresh(); };
        window.addEventListener('message', receiveLink);
        window.addEventListener('yaya:view-changed', onView);
        window.addEventListener('focus', onFocus);
        const observer = new MutationObserver(sendTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-custom-background'] });
        const interval = setInterval(() => {
            if (document.visibilityState !== 'hidden') void refresh();
        }, 5 * 60 * 1000);
        try {
            const cached = cache?.getCacheValueSync(CACHE_KEY, null);
            if (validHtml(cached?.html)) {
                restoringCache = true;
                clearTimeout(loadingTimeout);
                render(cached.html);
            }
        } catch (_) {}
        const initialRefresh = setTimeout(() => { void refresh({ force: true }); }, 0);
        function destroy() {
            disposed = true;
            generation++;
            controller?.abort();
            clearInterval(interval);
            clearTimeout(initialRefresh);
            clearTimeout(frameTimeout);
            clearTimeout(loadingTimeout);
            observer.disconnect();
            window.removeEventListener('message', receiveLink);
            window.removeEventListener('yaya:view-changed', onView);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('pagehide', destroy);
            host.remove();
        }
        window.addEventListener('pagehide', destroy);
        return { refresh, destroy };
    };
})();
