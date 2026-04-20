        (function () {
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
            if (savedTheme === 'dark') {
                const style = document.createElement('style');
                style.innerHTML = 'html, body { background-color: #1e1e1e !important; }';
                document.head.appendChild(style);
            }
        })();
