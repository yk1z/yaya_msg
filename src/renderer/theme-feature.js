(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createThemeFeature = function createThemeFeature() {
        function initTheme() {
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
            updateThemeBtn(savedTheme);

            const savedBg = localStorage.getItem('custom_bg_data');
            if (savedBg) {
                document.body.style.backgroundImage = `url('${savedBg}')`;
            }
        }

        function toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
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
            initTheme,
            toggleTheme,
            updateThemeBtn
        };
    };
})();
