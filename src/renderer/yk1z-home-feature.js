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
            title: '牙口栗子',
            subtitle: 'O.o？',
            buttons: [
                {
                    title: '牙牙推送',
                    desc: '牙牙推送',
                    type: 'url',
                    value: 'https://push.gnz.hk'
                },
                {
                    title: '牙牙字幕',
                    desc: '牙牙字幕',
                    type: 'url',
                    value: 'https://zimu.gnz.hk'
                },
                {
                    title: 'Room',
                    desc: '所有房间',
                    type: 'url',
                    value: 'https://snh48.xyz'
                },
                {
                    title: '看看烟花',
                    desc: 'kh',
                    type: 'url',
                    value: 'https://kh.gay'
                },
                {
                    title: '项目仓库',
                    desc: '项目仓库',
                    type: 'url',
                    value: 'https://github.com/yk1z/yaya_msg'
                }
            ]
        };

        let yk1zHomeConfigPromise = null;
        let yk1zHomeInitialized = false;

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

        function isYk1zHomeConfigRendered(config) {
            const titleEl = document.getElementById('home-yk1z-title');
            const subtitleEl = document.getElementById('home-yk1z-subtitle');
            const actionsEl = document.getElementById('home-yk1z-actions');
            if (!titleEl || !subtitleEl || !actionsEl) return false;

            const buttonEls = Array.from(actionsEl.children);
            if (titleEl.textContent !== config.title
                || subtitleEl.textContent !== config.subtitle
                || buttonEls.length !== config.buttons.length) {
                return false;
            }

            return config.buttons.every((button, index) => {
                const buttonEl = buttonEls[index];
                const titleEl = buttonEl && buttonEl.querySelector('.home-card-title');
                const desc = button.desc || (button.type === 'view' ? '进入对应页面' : '打开外部链接');
                return buttonEl
                    && titleEl
                    && titleEl.textContent === button.title
                    && buttonEl.dataset.yk1zType === button.type
                    && buttonEl.dataset.yk1zValue === button.value
                    && buttonEl.dataset.yk1zDesc === desc
                    && buttonEl.classList.contains('home-card-primary') === Boolean(button.primary);
            });
        }

        function renderYk1zHomeConfig(config) {
            const titleEl = document.getElementById('home-yk1z-title');
            const subtitleEl = document.getElementById('home-yk1z-subtitle');
            const actionsEl = document.getElementById('home-yk1z-actions');
            if (!titleEl || !subtitleEl || !actionsEl) return;
            if (isYk1zHomeConfigRendered(config)) return;

            titleEl.textContent = config.title;
            subtitleEl.textContent = config.subtitle;
            actionsEl.replaceChildren();

            const fragment = document.createDocumentFragment();
            config.buttons.forEach(button => {
                const buttonEl = document.createElement('button');
                buttonEl.className = `home-card${button.primary ? ' home-card-primary' : ''}`;
                buttonEl.dataset.yk1zType = button.type;
                buttonEl.dataset.yk1zValue = button.value;
                buttonEl.dataset.yk1zDesc = button.desc || (button.type === 'view' ? '进入对应页面' : '打开外部链接');
                buttonEl.onclick = () => handleYk1zHomeAction(button);

                const titleSpan = document.createElement('span');
                titleSpan.className = 'home-card-title';
                titleSpan.textContent = button.title;
                buttonEl.appendChild(titleSpan);

                const descSpan = document.createElement('span');
                descSpan.className = 'home-card-desc';
                descSpan.textContent = window.YayaRendererUtils.t(button.desc || (button.type === 'view' ? '进入对应页面' : '打开外部链接'));
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
            if (window.YayaDataSync) return window.YayaDataSync.read(YK1Z_CONFIG_URL).then(normalizeYk1zHomeConfig);
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
                        console.warn('加载 yk1z 配置失败，保留本地配置:', error);
                        yk1zHomeConfigPromise = Promise.resolve(readYk1zHomeConfigCache()
                            || normalizeYk1zHomeConfig(DEFAULT_YK1Z_HOME_CONFIG));
                        return yk1zHomeConfigPromise;
                    });
            }

            return yk1zHomeConfigPromise;
        }

        function initYk1zHomePanel() {
            if (!document.getElementById('home-yk1z-actions')) return;
            if (yk1zHomeInitialized) return;
            yk1zHomeInitialized = true;
            window.YayaDataSync?.subscribe(YK1Z_CONFIG_URL, raw => {
                const config = normalizeYk1zHomeConfig(raw);
                writeYk1zHomeConfigCache(config);
                renderYk1zHomeConfig(config);
            });
            const cachedConfig = readYk1zHomeConfigCache();
            if (cachedConfig) renderYk1zHomeConfig(cachedConfig);
            const refreshConfig = () => {
                fetchYk1zHomeConfig()
                    .then(config => {
                        renderYk1zHomeConfig(config);
                    })
                    .catch(() => {
                        if (!cachedConfig) {
                            renderYk1zHomeConfig(normalizeYk1zHomeConfig(DEFAULT_YK1Z_HOME_CONFIG));
                        }
                    });
            };

            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(refreshConfig, { timeout: 2000 });
            } else {
                window.setTimeout(refreshConfig, 500);
            }
        }

        return {
            initYk1zHomePanel
        };
    };
})();
