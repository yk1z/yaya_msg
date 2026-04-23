        (function () {
            const savedTheme = localStorage.getItem('theme') || 'light';
            const savedBg = localStorage.getItem('custom_bg_data');
            const THEME_STYLE_ID = 'yaya-theme-init-style';
            const BG_STYLE_ID = 'yaya-custom-bg-style';

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

            function applyCustomBackground(bgData) {
                const styleEl = ensureStyleNode(BG_STYLE_ID);
                if (!bgData) {
                    styleEl.textContent = '';
                    return;
                }

                const escapedBg = String(bgData)
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"');
                styleEl.textContent = `html, body { background-image: url("${escapedBg}") !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important; }`;
            }

            window.__applyYayaThemeBootStyle = applyThemeBootStyle;
            window.__applyYayaCustomBackground = applyCustomBackground;

            document.documentElement.setAttribute('data-theme', savedTheme);
            applyThemeBootStyle(savedTheme);
            applyCustomBackground(savedBg);
        })();
