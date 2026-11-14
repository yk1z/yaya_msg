(function () {
    if (!window.desktop || window.desktop.platform === 'web') return;
    const source = new URL('./vendor/player-vendors.js', document.currentScript.src).href;
    let loading = null;
    const ready = () => window.mpegts && window.Hls && window.Artplayer
        && window.artplayerPluginDanmuku;

    window.ensureYayaWebPlayerLibs = function ensureDesktopPlayerLibs() {
        if (ready()) return Promise.resolve();
        if (loading) return loading;
        loading = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = source;
            script.async = true;
            const fail = () => {
                script.remove();
                loading = null;
                reject(new Error('播放器运行库加载失败，请重试'));
            };
            script.addEventListener('load', () => ready() ? resolve() : fail(), { once: true });
            script.addEventListener('error', fail, { once: true });
            document.head.appendChild(script);
        });
        return loading;
    };
    window.ensureYayaWebPinyin = () => Promise.resolve(window.pinyinPro);
})();
