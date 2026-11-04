        (function () {
            if (window.desktop?.isRoomWindow) document.documentElement.dataset.roomWindow = 'true';
            const settingsApi = window.desktop && window.desktop.appSettings ? window.desktop.appSettings : null;
            const savedTheme = settingsApi && typeof settingsApi.getSettingValueSync === 'function'
                ? String(settingsApi.getSettingValueSync('theme', 'light') || 'light')
                : (localStorage.getItem('theme') || 'light');
            const savedBg = settingsApi && typeof settingsApi.getBackgroundUrlSync === 'function'
                ? settingsApi.getBackgroundUrlSync()
                : localStorage.getItem('custom_bg_data');
            const DEFAULT_BACKGROUND_URL = 'https://data.gnz.hk/assets/default-background.jpg?v=20260829';
            const THEME_STYLE_ID = 'yaya-theme-init-style';
            const BG_STYLE_ID = 'yaya-custom-bg-style';
            if (document.documentElement.dataset.desktopShell === 'true') {
                const key = 'desktopBackgroundTransparency';
                let transparency = settingsApi?.getSettingValueSync?.(key, null);
                if (typeof transparency !== 'number' || !Number.isFinite(transparency)) transparency = null;
                function preview(value) {
                    const number = Number(value);
                    if (!Number.isFinite(number)) return;
                    transparency = Math.max(0, Math.min(100, Math.round(number)));
                    document.documentElement.style.setProperty('--desktop-background-transparency', `${transparency}%`);
                }
                if (transparency !== null) preview(transparency);
                window.YayaDesktopBackground = {
                    getTransparency: () => transparency ?? 85,
                    previewTransparency: preview,
                    saveTransparency(value) {
                        const number = Number(value);
                        if (!Number.isFinite(number)) return;
                        const normalized = Math.max(0, Math.min(100, Math.round(number)));
                        settingsApi?.setSettingValueSync?.(key, normalized);
                        preview(normalized);
                    }
                };
            }

            function ensureStyleNode(id) {
                let styleEl = document.getElementById(id);
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = id;
                    document.head.appendChild(styleEl);
                }
                return styleEl;
            }

            function applyThemeBootStyle(theme) {
                const styleEl = ensureStyleNode(THEME_STYLE_ID);
                styleEl.textContent = theme === 'dark'
                    ? 'html, body { background-color: #1e1e1e !important; }'
                    : '';
            }

            function hideUnavailableWebBackground(imageElement) {
                if (!imageElement) return;
                imageElement.classList.add('is-unavailable');
                imageElement.removeAttribute('src');
            }

            async function recoverWebBackground(imageElement) {
                if (!imageElement) return;
                if (imageElement.dataset.fallbackAttempted === 'true') {
                    hideUnavailableWebBackground(imageElement);
                    return;
                }
                const sourceUrl = imageElement.currentSrc || imageElement.src;
                if (!sourceUrl || sourceUrl.startsWith('blob:')) {
                    hideUnavailableWebBackground(imageElement);
                    return;
                }

                imageElement.dataset.fallbackAttempted = 'true';
                try {
                    const response = await fetch(sourceUrl, {
                        cache: 'no-store',
                        credentials: 'omit'
                    });
                    if (!response.ok) throw new Error(`Background request failed: ${response.status}`);
                    imageElement.src = URL.createObjectURL(await response.blob());
                } catch (_) {
                    hideUnavailableWebBackground(imageElement);
                }
            }

            function applyCustomBackground(bgData) {
                const styleEl = ensureStyleNode(BG_STYLE_ID);
                if (document.documentElement.dataset.desktopShell === 'true') {
                    const background = String(bgData || '').trim();
                    const escaped = background.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, '');
                    document.documentElement.dataset.customBackground = String(Boolean(background));
                    document.documentElement.style.setProperty('--yaya-background-image', background ? `url("${escaped}")` : 'none');
                    window.__yayaCurrentBackgroundUrl = background;
                    styleEl.textContent = '';
                    return;
                }
                const nextBg = bgData || DEFAULT_BACKGROUND_URL;
                window.__yayaCurrentBackgroundUrl = nextBg;

                const webBackgroundLayer = document.getElementById('web-background-layer');
                if (webBackgroundLayer) {
                    delete webBackgroundLayer.dataset.fallbackAttempted;
                    webBackgroundLayer.classList.remove('is-unavailable');
                    webBackgroundLayer.src = nextBg;
                }

                const escapedBg = String(nextBg)
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"');
                document.documentElement.style.setProperty(
                    '--yaya-background-image',
                    `url("${escapedBg}")`
                );
                styleEl.textContent = `html, body { background-image: url("${escapedBg}") !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important; }`;
            }

            window.__applyYayaThemeBootStyle = applyThemeBootStyle;
            window.__applyYayaCustomBackground = applyCustomBackground;
            window.__recoverYayaWebBackground = recoverWebBackground;

            document.documentElement.setAttribute('data-theme', savedTheme);
            applyThemeBootStyle(savedTheme);
            applyCustomBackground(savedBg);
        })();
