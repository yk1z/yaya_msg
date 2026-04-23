        (function () {
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
            const savedBg = localStorage.getItem('custom_bg_data');

            if (savedTheme === 'dark') {
                const style = document.createElement('style');
                style.innerHTML = 'html, body { background-color: #1e1e1e !important; }';
                document.head.appendChild(style);
            }

            if (savedBg) {
                const bgStyle = document.createElement('style');
                const escapedBg = String(savedBg)
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"');
                bgStyle.textContent = `html, body { background-image: url("${escapedBg}") !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important; }`;
                document.head.appendChild(bgStyle);
            }
        })();
