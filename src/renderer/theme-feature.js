(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createThemeFeature = function createThemeFeature() {
        function readThemeSetting() {
            if (typeof window.readStoredStringSetting === 'function') {
                return window.readStoredStringSetting('theme', 'light');
            }
            const settingsApi = window.desktop && window.desktop.appSettings ? window.desktop.appSettings : null;
            if (settingsApi && typeof settingsApi.getSettingValueSync === 'function') {
                return String(settingsApi.getSettingValueSync('theme', 'light') || 'light');
            }
            return localStorage.getItem('theme') || 'light';
        }

        function writeThemeSetting(value) {
            if (typeof window.writeStoredStringSetting === 'function') {
                return window.writeStoredStringSetting('theme', value);
            }
            localStorage.setItem('theme', value);
            return value;
        }

        function applyCustomBackground(bgData) {
            if (typeof window.__applyYayaCustomBackground === 'function') {
                window.__applyYayaCustomBackground(bgData || '');
            }

            if (!bgData) {
                document.body.style.backgroundImage = '';
                return;
            }

            document.body.style.backgroundImage = `url('${bgData}')`;
        }

        function initTheme() {
            const savedTheme = readThemeSetting();
            const settingsApi = window.desktop && window.desktop.appSettings ? window.desktop.appSettings : null;
            document.documentElement.setAttribute('data-theme', savedTheme);
            if (typeof window.__applyYayaThemeBootStyle === 'function') {
                window.__applyYayaThemeBootStyle(savedTheme);
            }
            updateThemeBtn(savedTheme);

            const savedBg = settingsApi && typeof settingsApi.getBackgroundUrlSync === 'function'
                ? settingsApi.getBackgroundUrlSync()
                : localStorage.getItem('custom_bg_data');
            applyCustomBackground(savedBg || '');
        }

        function toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            writeThemeSetting(next);
            if (typeof window.__applyYayaThemeBootStyle === 'function') {
                window.__applyYayaThemeBootStyle(next);
            }
            updateThemeBtn(next);
        }

        function updateThemeBtn(theme) {
            const compactLabel = theme === 'dark' ? '🌙 模式' : '🌞 模式';
            const settingsLabel = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
            document.querySelectorAll('[data-theme-toggle-label]').forEach(buttonEl => {
                const variant = buttonEl.getAttribute('data-theme-toggle-label');
                buttonEl.textContent = variant === 'settings' ? settingsLabel : compactLabel;
            });
        }

        return {
            applyCustomBackground,
            initTheme,
            toggleTheme,
            updateThemeBtn
        };
    };
})();
