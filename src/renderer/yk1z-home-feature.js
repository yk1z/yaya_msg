(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createYk1zHomeFeature = function createYk1zHomeFeature(deps) {
        const {
            DATA_BASE_URL,
            openInBrowser,
            switchView
        } = deps;

        const YK1Z_CONFIG_URL = `${DATA_BASE_URL}/yk1z.json`;
        const YK1Z_HOME_CACHE_KEY = 'yk1z_home_config_v1';

        const DEFAULT_YK1Z_HOME_CONFIG = {
            title: 'yk1z',
            subtitle: '诶 这是什么O.o？',
            buttons: [
                {
                    title: '牙牙回放',
                    desc: '在外部浏览器打开',
                    type: 'url',
                    value: 'https://www.bilibili.com/video/BV1Ba8FzxEje'
                },
                {
                    title: '哔哩哔哩',
                    desc: '打开主页空间',
                    type: 'url',
                    value: 'https://space.bilibili.com/508441523'
                },
                {
                    title: 'GitHub',
                    desc: '打开项目仓库',
                    type: 'url',
                    value: 'https://github.com/yk1z/yaya_msg'
                }
            ]
        };

        let yk1zHomeConfigPromise = null;

        function readCacheValue(key, fallbackValue = null) {
            const cacheApi = window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
            if (cacheApi && typeof cacheApi.getCacheValueSync === 'function') {
                const storedValue = cacheApi.getCacheValueSync(key, fallbackValue);
                if (storedValue !== fallbackValue) {
                    return storedValue;
                }
            }

            try {
                const raw = localStorage.getItem(key);
                if (!raw) return fallbackValue;
                const parsed = JSON.parse(raw);
                if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                    cacheApi.setCacheValueSync(key, parsed);
                    localStorage.removeItem(key);
                }
                return parsed;
            } catch (error) {
                return fallbackValue;
            }
        }

        function writeCacheValue(key, value) {
            const cacheApi = window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
            if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                cacheApi.setCacheValueSync(key, value);
                localStorage.removeItem(key);
                return value;
            }

            localStorage.setItem(key, JSON.stringify(value));
            return value;
        }

        function normalizeYk1zButtonConfig(item) {
            if (!item || typeof item !== 'object') return null;

            const title = String(item.title || item.name || '').trim();
            const desc = String(item.desc || item.description || '').trim();
            const type = String(item.type || item.action || 'url').trim().toLowerCase();
            const value = String(item.value || item.url || item.target || '').trim();
            const primary = Boolean(item.primary);

            if (!title || !value) return null;
            if (!['url', 'browser', 'view'].includes(type)) return null;

            return { title, desc, type, value, primary };
        }

        function normalizeYk1zHomeConfig(rawConfig) {
            const source = Array.isArray(rawConfig)
                ? { buttons: rawConfig }
                : (rawConfig && typeof rawConfig === 'object' ? rawConfig : {});
            const normalizedButtons = Array.isArray(source.buttons)
                ? source.buttons.map(normalizeYk1zButtonConfig).filter(Boolean)
                : [];

            return {
                title: String(source.title || DEFAULT_YK1Z_HOME_CONFIG.title).trim() || DEFAULT_YK1Z_HOME_CONFIG.title,
                subtitle: String(source.subtitle || DEFAULT_YK1Z_HOME_CONFIG.subtitle).trim() || DEFAULT_YK1Z_HOME_CONFIG.subtitle,
                buttons: normalizedButtons.length ? normalizedButtons : DEFAULT_YK1Z_HOME_CONFIG.buttons.slice()
            };
        }

        function handleYk1zHomeAction(button) {
            if (!button) return;

            if (button.type === 'view') {
                switchView(button.value);
                return;
            }

            openInBrowser(button.value);
        }

        function renderYk1zHomeConfig(config) {
            const titleEl = document.getElementById('home-yk1z-title');
            const subtitleEl = document.getElementById('home-yk1z-subtitle');
            const actionsEl = document.getElementById('home-yk1z-actions');
            if (!titleEl || !subtitleEl || !actionsEl) return;

            titleEl.textContent = config.title;
            subtitleEl.textContent = config.subtitle;
            actionsEl.innerHTML = '';

            const fragment = document.createDocumentFragment();
            config.buttons.forEach(button => {
                const buttonEl = document.createElement('button');
                buttonEl.className = `home-card${button.primary ? ' home-card-primary' : ''}`;
                buttonEl.onclick = () => handleYk1zHomeAction(button);

                const titleSpan = document.createElement('span');
                titleSpan.className = 'home-card-title';
                titleSpan.textContent = button.title;
                buttonEl.appendChild(titleSpan);

                const descSpan = document.createElement('span');
                descSpan.className = 'home-card-desc';
                descSpan.textContent = button.desc || (button.type === 'view' ? '进入对应页面' : '打开外部链接');
                buttonEl.appendChild(descSpan);

                fragment.appendChild(buttonEl);
            });

            actionsEl.appendChild(fragment);
        }

        function readYk1zHomeConfigCache() {
            try {
                const raw = readCacheValue(YK1Z_HOME_CACHE_KEY, null);
                if (!raw) return null;
                return normalizeYk1zHomeConfig(raw);
            } catch (error) {
                console.warn('读取 yk1z 缓存失败:', error);
                return null;
            }
        }

        function writeYk1zHomeConfigCache(config) {
            try {
                writeCacheValue(YK1Z_HOME_CACHE_KEY, config);
            } catch (error) {
                console.warn('写入 yk1z 缓存失败:', error);
            }
        }

        function fetchYk1zHomeConfig() {
            if (!yk1zHomeConfigPromise) {
                yk1zHomeConfigPromise = fetch(`${YK1Z_CONFIG_URL}?t=${Date.now()}`, {
                    method: 'GET',
                    cache: 'no-store'
                })
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return res.json();
                    })
                    .then(normalizeYk1zHomeConfig)
                    .then(config => {
                        writeYk1zHomeConfigCache(config);
                        return config;
                    })
                    .catch(error => {
                        console.warn('加载 yk1z 配置失败，使用默认按钮:', error);
                        yk1zHomeConfigPromise = Promise.resolve(normalizeYk1zHomeConfig(DEFAULT_YK1Z_HOME_CONFIG));
                        return yk1zHomeConfigPromise;
                    });
            }

            return yk1zHomeConfigPromise;
        }

        function initYk1zHomePanel() {
            const cachedConfig = readYk1zHomeConfigCache();
            if (cachedConfig) {
                renderYk1zHomeConfig(cachedConfig);
            }

            fetchYk1zHomeConfig()
                .then(config => {
                    renderYk1zHomeConfig(config);
                })
                .catch(() => {
                    if (!cachedConfig) {
                        renderYk1zHomeConfig(normalizeYk1zHomeConfig(DEFAULT_YK1Z_HOME_CONFIG));
                    }
                });
        }

        return {
            initYk1zHomePanel
        };
    };
})();
