(function () {
    if (window.desktop && window.ipcRenderer) {
        return;
    }

    const IS_MOBILE_WEB_DEVICE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const IS_WINDOWS_WEB_DEVICE = /Windows/i.test(navigator.userAgent || '') && !IS_MOBILE_WEB_DEVICE;
    const IS_MAC_WEB_DEVICE = /Macintosh|Mac OS X/i.test(navigator.userAgent || '') && !IS_MOBILE_WEB_DEVICE;
    const IS_LINUX_WEB_DEVICE = /Linux|X11/i.test(navigator.userAgent || '') && !IS_MOBILE_WEB_DEVICE;
    document.documentElement.classList.toggle('web-mobile-device', IS_MOBILE_WEB_DEVICE);

    const initialHashRoute = String(window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
    const initialPathRoute = decodeURIComponent(String(window.location.pathname || '/'))
        .replace(/^\/+|\/+$/g, '')
        .split('/')[0];
    const initialRoute = initialHashRoute || (initialPathRoute && initialPathRoute !== 'index.html' ? initialPathRoute : '');
    if (initialRoute && initialRoute !== 'home') {
        document.documentElement.classList.add('web-route-pending', 'web-secondary-route-boot');
    }

    if (typeof window.switchView !== 'function') {
        window.switchView = function (...args) {
            window.__yayaPendingSwitchView = args;
        };
    }

    if (typeof window.toggleSidebar !== 'function') {
        window.toggleSidebar = function () {
            window.__yayaPendingSwitchView = ['home'];
        };
    }

    const SETTINGS_KEY = 'yaya_web_settings';
    const CACHE_KEY = 'yaya_web_cache';
    const channelsNeedingPa = new Set([
        'login-by-code',
        'login-check-token',
        'pocket-checkin',
        'switch-big-small',
        'fetch-room-messages',
        'fetch-private-message-list',
        'fetch-private-message-info',
        'delete-private-message',
        'send-private-message-reply',
        'fetch-flip-list',
        'fetch-star-archives',
        'fetch-star-history',
        'fetch-open-live',
        'fetch-open-live-one',
        'fetch-open-live-public-list',
        'fetch-open-live-participants',
        'fetch-flip-prices',
        'send-flip-question',
        'operate-flip-question',
        'fetch-member-photos',
        'fetch-user-money',
        'fetch-invoice-tips',
        'fetch-invoice-config',
        'fetch-invoice-order-list',
        'apply-electronic-invoice',
        'fetch-checkin-today',
        'fetch-unread-message-count',
        'edit-user-info',
        'upload-user-avatar',
        'upload-private-message-image',
        'fetch-user-rename-count',
        'fetch-user-picture-frames',
        'fetch-client-group-team-star-update',
        'fetch-star-server-map',
        'fetch-media-collection-total-count',
        'send-live-gift',
        'fetch-gift-list',
        'get-nim-login-info',
        'fetch-room-album',
        'fetch-member-weibo',
        'fetch-room-radio',
        'fetch-live-rank',
        'fetch-friends-ids',
        'fetch-last-messages',
        'follow-member',
        'unfollow-member',
        'fetch-area48-newest',
        'fetch-area48-recommend',
        'fetch-area48-topic-info',
        'fetch-area48-topic-hot-posts',
        'fetch-area48-topic-newest-posts',
        'fetch-area48-comments',
        'fetch-area48-post-details',
        'add-area48-comment',
        'delete-area48-comment',
        'create-area48-post',
        'fetch-pocket-mask-words'
    ]);

    function readStore(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function writeStore(key, value) {
        const normalized = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        localStorage.setItem(key, JSON.stringify(normalized));
        return normalized;
    }

    function readSettings() {
        return readStore(SETTINGS_KEY);
    }

    function writeSettings(settings) {
        return writeStore(SETTINGS_KEY, settings);
    }

    function getSettingValueSync(key, fallbackValue) {
        const settings = readSettings();
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
            return settings[key];
        }
        return arguments.length >= 2 ? fallbackValue : '';
    }

    function setSettingValueSync(key, value) {
        const settings = readSettings();
        settings[key] = value;
        writeSettings(settings);
        return value;
    }

    function removeSettingValueSync(key) {
        const settings = readSettings();
        delete settings[key];
        writeSettings(settings);
    }

    function readCache() {
        return readStore(CACHE_KEY);
    }

    function writeCache(cache) {
        return writeStore(CACHE_KEY, cache);
    }

    function getCacheValueSync(key, fallbackValue) {
        const cache = readCache();
        if (Object.prototype.hasOwnProperty.call(cache, key)) {
            return cache[key];
        }
        return arguments.length >= 2 ? fallbackValue : '';
    }

    function setCacheValueSync(key, value) {
        const cache = readCache();
        cache[key] = value;
        writeCache(cache);
        return value;
    }

    function removeCacheValueSync(key) {
        const cache = readCache();
        delete cache[key];
        writeCache(cache);
    }

    function getApiBaseUrl() {
        const configured = String(
            window.YAYA_API_BASE
            || localStorage.getItem('yaya_web_api_base')
            || getSettingValueSync('yaya_web_api_base', '')
            || ''
        ).trim();
        return configured.replace(/\/+$/, '');
    }

    function apiUrl(path) {
        const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
        const baseUrl = getApiBaseUrl();
        return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
    }

    function sameOriginApiUrl(path) {
        const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
        return new URL(normalizedPath, window.location.origin).toString();
    }

    function parseJsonResponseText(text) {
        try {
            return {
                data: text ? JSON.parse(text) : null,
                looksLikeHtml: false
            };
        } catch (error) {
            return {
                data: null,
                looksLikeHtml: /^\s*</.test(text || '')
            };
        }
    }

    const pocketProxyChannels = {
        'fetch-melee-week-rank': {
            path: '/gift/api/v1/melee/rank/getMeleeWeekRank',
            payload: payload => {
                const next = { rankId: Number(payload?.rankId) || 0 };
                if (payload?.nextId !== undefined && payload?.nextId !== null && payload?.nextId !== '') {
                    next.nextId = payload.nextId;
                }
                return next;
            }
        },
        'fetch-melee-rank-page': {
            path: '/gift/api/v1/melee/rank/getMeleeRankPage',
            payload: payload => {
                const next = { rankid: Number(payload?.rankId) || 0 };
                if (payload?.nextId !== undefined && payload?.nextId !== null && payload?.nextId !== '') {
                    next.nextId = payload.nextId;
                }
                return next;
            }
        },
        'fetch-melee-year-rank-page': {
            path: '/gift/api/v1/melee/rank/getMeleeYearRankPage',
            payload: payload => {
                const next = {};
                if (payload?.rankId !== undefined && payload?.rankId !== null && payload?.rankId !== '') {
                    next.rankid = Number(payload.rankId) || 0;
                }
                if (payload?.nextId !== undefined && payload?.nextId !== null && payload?.nextId !== '') {
                    next.nextId = payload.nextId;
                }
                return next;
            }
        },
        'fetch-person-melee-rank-page': {
            path: '/gift/api/v1/melee/rank/getPersonMeleeRankPage',
            payload: payload => ({ resId: Number(payload?.resId) || 0 })
        }
    };

    async function invokePocketProxy(channel, payload) {
        const config = pocketProxyChannels[channel];
        if (!config) return null;

        const response = await fetch(apiUrl('/api/pocket'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: config.path,
                postData: config.payload(payload || {})
            })
        });

        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (error) {
            return {
                success: false,
                msg: /^\s*</.test(text || '')
                    ? '口袋 API 返回了网页内容，请稍后重试。'
                    : '口袋 API 返回内容不是 JSON'
            };
        }

        if (!response.ok) {
            return data || { success: false, msg: `口袋 API 请求失败: ${response.status}` };
        }

        if (data && data.status === 200 && data.success !== false) {
            return { ...data, success: true };
        }
        return data || { success: false, msg: '口袋 API 请求失败' };
    }

    function openMediaUrlForWeb(url) {
        const mediaUrl = String(url || '').trim();
        if (!mediaUrl) return false;
        window.open(mediaUrl, '_blank', 'noopener,noreferrer');
        return true;
    }

    const webLibraryUrls = {
        mpegts: 'https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.min.js',
        hls: 'https://cdn.jsdelivr.net/npm/hls.js@1.6.16/dist/hls.min.js',
        artplayer: 'https://cdn.jsdelivr.net/npm/artplayer/dist/artplayer.js',
        artplayerDanmuku: 'https://cdn.jsdelivr.net/npm/artplayer-plugin-danmuku/dist/artplayer-plugin-danmuku.js',
        dplayer: 'https://cdn.jsdelivr.net/npm/dplayer/dist/DPlayer.min.js',
        pinyin: 'https://cdn.jsdelivr.net/npm/pinyin-pro@3.24.2/dist/index.js'
    };
    const webLibraryPromises = new Map();

    function loadWebScriptOnce(key, url, globalName) {
        if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
        if (webLibraryPromises.has(key)) return webLibraryPromises.get(key);

        const promise = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-yaya-lib="${key}"]`);
            if (existing) {
                existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
                existing.addEventListener('error', () => reject(new Error(`加载 ${key} 失败`)), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.dataset.yayaLib = key;
            script.onload = () => resolve(globalName ? window[globalName] : true);
            script.onerror = () => reject(new Error(`加载 ${key} 失败`));
            document.head.appendChild(script);
        });

        webLibraryPromises.set(key, promise);
        return promise;
    }

    window.ensureYayaWebPlayerLibs = async function ensureYayaWebPlayerLibs(type = 'player') {
        if (type === 'mpegts') {
            await loadWebScriptOnce('mpegts', webLibraryUrls.mpegts, 'mpegts');
            return;
        }
        if (type === 'dplayer') {
            await loadWebScriptOnce('mpegts', webLibraryUrls.mpegts, 'mpegts');
            await loadWebScriptOnce('dplayer', webLibraryUrls.dplayer, 'DPlayer');
            return;
        }
        await loadWebScriptOnce('mpegts', webLibraryUrls.mpegts, 'mpegts');
        await loadWebScriptOnce('hls', webLibraryUrls.hls, 'Hls');
        await loadWebScriptOnce('artplayer', webLibraryUrls.artplayer, 'Artplayer');
        await loadWebScriptOnce('artplayerDanmuku', webLibraryUrls.artplayerDanmuku, 'artplayerPluginDanmuku');
        await loadWebScriptOnce('dplayer', webLibraryUrls.dplayer, 'DPlayer');
    };

    window.ensureYayaWebPinyin = function ensureYayaWebPinyin() {
        return loadWebScriptOnce('pinyin', webLibraryUrls.pinyin, 'pinyinPro');
    };

    function downloadTextFile(filename, content, type) {
        const blob = new Blob([content || ''], { type: type || 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'download.txt';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function saveBackgroundFromDataUrlSync(dataUrl) {
        setSettingValueSync('customBackgroundDataUrl', dataUrl || '');
        return dataUrl || '';
    }

    function createUnsupportedFileError() {
        return new Error('网页版不支持直接访问本地文件系统');
    }

    function waitForPaReady(timeoutMs = 15000) {
        return new Promise(resolve => {
            const startedAt = Date.now();
            const readPa = () => {
                try {
                    return typeof window.getPA === 'function' ? window.getPA() : null;
                } catch (error) {
                    console.warn('生成登录签名失败:', error);
                    return null;
                }
            };
            const firstPa = readPa();
            if (firstPa) {
                resolve(firstPa);
                return;
            }
            const timer = setInterval(() => {
                const pa = readPa();
                if (pa || Date.now() - startedAt >= timeoutMs) {
                    clearInterval(timer);
                    resolve(pa || null);
                }
            }, 100);
        });
    }

    const fsShim = {
        existsSync() {
            return false;
        },
        readFileSync() {
            throw createUnsupportedFileError();
        },
        writeFileSync() {
        },
        unlinkSync() {
        },
        createReadStream() {
            throw createUnsupportedFileError();
        },
        promises: {
            async readdir() {
                return [];
            },
            async stat() {
                return { mtimeMs: 0 };
            },
            async readFile() {
                throw createUnsupportedFileError();
            },
            async writeFile() {
            },
            async rename() {
            }
        }
    };

    const pathShim = {
        join(...parts) {
            return parts.filter(part => part !== undefined && part !== null && part !== '').join('/').replace(/\/+/g, '/');
        },
        basename(value) {
            return String(value || '').split(/[\\/]/).pop() || '';
        },
        dirname(value) {
            const text = String(value || '');
            const index = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
            return index > 0 ? text.slice(0, index) : '';
        },
        extname(value) {
            const name = this.basename(value);
            const index = name.lastIndexOf('.');
            return index >= 0 ? name.slice(index) : '';
        }
    };

    async function invokeRemote(channel, payload) {
        const pocketProxyResult = await invokePocketProxy(channel, payload);
        if (pocketProxyResult) return pocketProxyResult;

        const nextPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
            ? { ...payload }
            : payload;

        if (channelsNeedingPa.has(channel) && nextPayload && !nextPayload.pa) {
            const pa = await waitForPaReady();
            if (pa) {
                nextPayload.pa = pa;
            } else if (channel === 'login-by-code' || channel === 'login-check-token') {
                return {
                    status: 503,
                    success: false,
                    message: '登录签名模块加载失败，请刷新页面后重试'
                };
            }
        }

        if ((channel === 'fetch-meet48-live-list' || channel === 'fetch-meet48-live-one')
            && nextPayload && typeof nextPayload === 'object' && !nextPayload.meet48Auth) {
            const meet48Auth = getSettingValueSync('meet48Auth', null);
            if (meet48Auth && typeof meet48Auth === 'object' && !Array.isArray(meet48Auth)) {
                const hasAuth = meet48Auth.token || meet48Auth.cookie || meet48Auth.deviceId;
                if (hasAuth) {
                    nextPayload.meet48Auth = {
                        token: String(meet48Auth.token || ''),
                        cookie: String(meet48Auth.cookie || ''),
                        deviceId: String(meet48Auth.deviceId || '')
                    };
                }
            }
        }

        const requestBody = JSON.stringify({ channel, payload: nextPayload });
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody
        };
        const primaryUrl = apiUrl('/api/ipc');
        let response = await fetch(primaryUrl, requestOptions);
        let text = await response.text();
        let parsed = parseJsonResponseText(text);

        if (parsed.looksLikeHtml) {
            const fallbackUrl = sameOriginApiUrl('/api/ipc');
            if (fallbackUrl !== primaryUrl) {
                response = await fetch(fallbackUrl, requestOptions);
                text = await response.text();
                parsed = parseJsonResponseText(text);
            }
        }

        if (parsed.looksLikeHtml) {
            return {
                success: false,
                msg: '网页版 API 暂时返回了网页内容，请稍后重试。'
            };
        }

        if (!parsed.data && text) {
            return {
                success: false,
                msg: '网页版 API 返回内容不是 JSON'
            };
        }

        if (!response.ok) {
            return parsed.data || { success: false, msg: `网页版 API 请求失败: ${response.status}` };
        }
        return parsed.data;
    }

    const FFMPEG_SCRIPT_URLS = [
        'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js',
        'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js'
    ];
    const FFMPEG_CORE_PATH = 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js';
    const WEB_CLIP_MAX_DURATION = 10 * 60;
    const WEB_CLIP_MAX_DIRECT_BYTES = 512 * 1024 * 1024;
    const WEB_CLIP_MAX_SEGMENTS = 120;
    let ffmpegScriptPromise = null;
    let ffmpegLoadPromise = null;
    let ffmpegInstance = null;

    function getVisibleClipElement(selector) {
        const elements = Array.from(document.querySelectorAll(selector));
        return elements.find((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        }) || elements[0] || null;
    }

    function setClipToolbarStatus(statusText, percent, isDone = false) {
        const durationEl = getVisibleClipElement('[data-clip-role="duration-display"], #clip-duration-display');
        const buttonEl = getVisibleClipElement('[data-clip-role="do-clip"], #btn-do-clip');
        if (durationEl && statusText) {
            const prefix = typeof percent === 'number' && percent > 0 && percent < 100
                ? `${Math.round(percent)}% `
                : '';
            durationEl.textContent = `${prefix}${statusText}`;
        }
        if (buttonEl) {
            if (isDone) {
                buttonEl.disabled = false;
                buttonEl.textContent = '切片';
            } else {
                buttonEl.disabled = true;
                buttonEl.textContent = typeof percent === 'number' && percent > 0 ? `${Math.round(percent)}%` : '处理中';
            }
        }
    }

    function finishClipToolbarStatus(statusText, failed = false) {
        const durationEl = getVisibleClipElement('[data-clip-role="duration-display"], #clip-duration-display');
        const buttonEl = getVisibleClipElement('[data-clip-role="do-clip"], #btn-do-clip');
        if (durationEl && statusText) {
            durationEl.textContent = statusText;
            durationEl.style.color = failed ? '#ff4d4f' : '';
        }
        if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.textContent = '切片';
        }
    }

    function setDownloadTaskStatus(taskId, statusText, percent) {
        setClipToolbarStatus(statusText, percent);
        const task = taskId ? document.getElementById(taskId) : null;
        if (!task) return;
        const statusEl = task.querySelector('.download-status-text');
        const percentEl = task.querySelector('.download-percent');
        const fillEl = task.querySelector('.progress-fill');
        if (statusEl && statusText) statusEl.textContent = statusText;
        if (typeof percent === 'number') {
            const fixed = Math.max(0, Math.min(100, Math.round(percent)));
            if (percentEl) percentEl.textContent = `${fixed}%`;
            if (fillEl) fillEl.style.width = `${fixed}%`;
        }
    }

    function sanitizeDownloadName(value) {
        return String(value || '视频切片')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120) || '视频切片';
    }

    function triggerBlobDownload(filename, bytes, type) {
        const blob = new Blob([bytes], { type: type || 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${url}"]`);
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
                if (window.FFmpeg) resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.onload = resolve;
            script.onerror = () => reject(new Error(`FFmpeg 脚本加载失败: ${url}`));
            document.head.appendChild(script);
            setTimeout(() => reject(new Error(`FFmpeg 脚本加载超时: ${url}`)), 20000);
        });
    }

    async function ensureFfmpegScript() {
        if (!ffmpegScriptPromise) {
            ffmpegScriptPromise = (async () => {
                let lastError = null;
                for (const url of FFMPEG_SCRIPT_URLS) {
                    try {
                        await loadScript(url);
                        if (window.FFmpeg?.createFFmpeg) return;
                    } catch (error) {
                        lastError = error;
                    }
                }
                throw lastError || new Error('FFmpeg 脚本加载失败');
            })();
        }
        return ffmpegScriptPromise;
    }

    async function ensureFfmpeg(taskId) {
        if (!window.isSecureContext) {
            throw new Error('浏览器切片需要 HTTPS 安全页面，请用 https://gnz.hk 打开后再试');
        }
        if (!window.crossOriginIsolated) {
            const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
            throw new Error(isMobile
                ? '当前手机浏览器不支持网页 FFmpeg 切片，请用桌面端软件切片'
                : '当前浏览器未启用跨域隔离，无法使用网页 FFmpeg 切片');
        }
        await ensureFfmpegScript();
        if (!ffmpegLoadPromise) {
            ffmpegLoadPromise = (async () => {
                setDownloadTaskStatus(taskId, '正在加载浏览器 FFmpeg...', 5);
                const { createFFmpeg } = window.FFmpeg;
                const instance = createFFmpeg({
                    log: false,
                    corePath: FFMPEG_CORE_PATH,
                    progress({ ratio }) {
                        if (ratio > 0) {
                            setDownloadTaskStatus(taskId, '正在封装切片...', 70 + ratio * 25);
                        }
                    }
                });
                await instance.load();
                ffmpegInstance = instance;
                return instance;
            })();
        }
        return ffmpegLoadPromise.then((instance) => {
            ffmpegInstance = instance;
            return instance;
        });
    }

    function proxiedMediaUrl(url) {
        return `/web-media-proxy?url=${encodeURIComponent(url)}`;
    }

    async function fetchWithCorsFallback(url, options = {}) {
        const useProxy = options.useProxy === true;
        const sourceUrl = useProxy ? proxiedMediaUrl(url) : url;
        const response = await fetch(sourceUrl, {
            cache: 'no-store',
            credentials: 'omit'
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response;
    }

    async function fetchTextMedia(url) {
        try {
            return await (await fetchWithCorsFallback(url)).text();
        } catch (directError) {
            return (await fetchWithCorsFallback(url, { useProxy: true })).text();
        }
    }

    async function fetchBinaryMedia(url, taskId, progressBase = 20, progressSpan = 40) {
        let response;
        try {
            response = await fetchWithCorsFallback(url);
        } catch (directError) {
            response = await fetchWithCorsFallback(url, { useProxy: true });
        }

        const lengthValue = Number(response.headers.get('Content-Length') || 0);
        if (lengthValue > WEB_CLIP_MAX_DIRECT_BYTES) {
            throw new Error('视频文件过大，网页版只适合切 m3u8 分片或较短文件');
        }

        const reader = response.body?.getReader ? response.body.getReader() : null;
        if (!reader) return new Uint8Array(await response.arrayBuffer());

        const chunks = [];
        let received = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            if (lengthValue) {
                setDownloadTaskStatus(taskId, '正在下载切片数据...', progressBase + (received / lengthValue) * progressSpan);
            }
        }

        const bytes = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return bytes;
    }

    function resolveMediaUrl(value, baseUrl) {
        return new URL(String(value || '').trim(), baseUrl).toString();
    }

    function parseM3u8Attributes(line) {
        const attrs = {};
        const attrText = String(line || '').split(':').slice(1).join(':');
        const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
        let match;
        while ((match = pattern.exec(attrText))) {
            attrs[match[1].toUpperCase()] = String(match[2] || '').replace(/^"|"$/g, '');
        }
        return attrs;
    }

    async function resolveMediaPlaylist(url, depth = 0) {
        if (depth > 3) throw new Error('m3u8 嵌套层级过深');
        const text = await fetchTextMedia(url);
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const variants = [];
        for (let i = 0; i < lines.length; i += 1) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                const attrs = parseM3u8Attributes(lines[i]);
                const nextLine = lines.slice(i + 1).find(line => line && !line.startsWith('#'));
                if (nextLine) {
                    variants.push({
                        bandwidth: Number(attrs.BANDWIDTH || 0),
                        url: resolveMediaUrl(nextLine, url)
                    });
                }
            }
        }
        if (variants.length) {
            variants.sort((a, b) => b.bandwidth - a.bandwidth);
            return resolveMediaPlaylist(variants[0].url, depth + 1);
        }
        return { url, text };
    }

    function parseMediaPlaylist(text, playlistUrl) {
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const segments = [];
        let duration = null;
        let cursor = 0;
        let targetDuration = 6;
        let mapUrl = '';
        for (const line of lines) {
            if (line.startsWith('#EXT-X-TARGETDURATION')) {
                const parsed = Number(line.split(':')[1]);
                if (parsed > 0) targetDuration = parsed;
            } else if (line.startsWith('#EXT-X-MAP')) {
                const attrs = parseM3u8Attributes(line);
                if (attrs.URI) mapUrl = resolveMediaUrl(attrs.URI, playlistUrl);
            } else if (line.startsWith('#EXTINF')) {
                duration = Number(line.replace('#EXTINF:', '').split(',')[0]);
            } else if (!line.startsWith('#')) {
                const segDuration = Number.isFinite(duration) && duration > 0 ? duration : targetDuration;
                segments.push({
                    url: resolveMediaUrl(line, playlistUrl),
                    duration: segDuration,
                    start: cursor,
                    end: cursor + segDuration
                });
                cursor += segDuration;
                duration = null;
            }
        }
        return { segments, targetDuration, mapUrl };
    }

    function isM3u8Url(url) {
        return /\.m3u8(?:[?#].*)?$/i.test(String(url || ''));
    }

    async function writeHlsClipInputs(ffmpeg, url, startTime, duration, taskId) {
        const resolved = await resolveMediaPlaylist(url);
        const playlist = parseMediaPlaylist(resolved.text, resolved.url);
        if (!playlist.segments.length) {
            throw new Error('没有解析到 m3u8 分片');
        }

        const endTime = startTime + duration;
        const selected = playlist.segments.filter(segment => segment.end > startTime && segment.start < endTime);
        if (!selected.length) throw new Error('所选时间段没有对应分片');
        if (selected.length > WEB_CLIP_MAX_SEGMENTS) {
            throw new Error(`分片过多，请缩短切片时长（当前 ${selected.length} 段）`);
        }

        let localMapName = '';
        if (playlist.mapUrl) {
            setDownloadTaskStatus(taskId, '正在下载初始化片段...', 15);
            localMapName = 'init.mp4';
            ffmpeg.FS('writeFile', localMapName, await fetchBinaryMedia(playlist.mapUrl, taskId, 15, 5));
        }

        const localLines = [
            '#EXTM3U',
            '#EXT-X-VERSION:7',
            `#EXT-X-TARGETDURATION:${Math.ceil(playlist.targetDuration || 6)}`,
            '#EXT-X-MEDIA-SEQUENCE:0'
        ];
        if (localMapName) {
            localLines.push(`#EXT-X-MAP:URI="${localMapName}"`);
        }

        for (let i = 0; i < selected.length; i += 1) {
            const segment = selected[i];
            const name = `seg_${String(i).padStart(4, '0')}${segment.url.includes('.m4s') ? '.m4s' : '.ts'}`;
            const progress = 20 + (i / Math.max(1, selected.length)) * 45;
            setDownloadTaskStatus(taskId, `正在下载分片 ${i + 1}/${selected.length}...`, progress);
            ffmpeg.FS('writeFile', name, await fetchBinaryMedia(segment.url, taskId, progress, 45 / Math.max(1, selected.length)));
            localLines.push(`#EXTINF:${segment.duration.toFixed(3)},`);
            localLines.push(name);
        }
        localLines.push('#EXT-X-ENDLIST');
        ffmpeg.FS('writeFile', 'input.m3u8', new TextEncoder().encode(localLines.join('\n')));

        return {
            inputName: 'input.m3u8',
            localStartTime: Math.max(0, startTime - selected[0].start)
        };
    }

    async function writeDirectClipInput(ffmpeg, url, taskId) {
        setDownloadTaskStatus(taskId, '正在下载视频文件...', 15);
        const inputName = /\.flv(?:[?#].*)?$/i.test(url)
            ? 'input.flv'
            : /\.ts(?:[?#].*)?$/i.test(url)
                ? 'input.ts'
                : 'input.mp4';
        ffmpeg.FS('writeFile', inputName, await fetchBinaryMedia(url, taskId, 15, 45));
        return { inputName, localStartTime: null };
    }

    async function runBrowserClip(payload) {
        const taskId = payload?.taskId || '';
        const sourceUrl = String(payload?.url || '').trim();
        const startTime = Number(payload?.startTime || 0);
        const duration = Number(payload?.duration || 0);
        if (!sourceUrl) throw new Error('没有可切片的视频地址');
        if (!Number.isFinite(startTime) || startTime < 0 || !Number.isFinite(duration) || duration <= 0) {
            throw new Error('切片时间无效');
        }
        if (duration > WEB_CLIP_MAX_DURATION) {
            throw new Error('网页版切片最多支持 10 分钟，请缩短片段');
        }

        const ffmpeg = await ensureFfmpeg(taskId);
        const outputName = 'output.mp4';
        try {
            try { ffmpeg.FS('unlink', outputName); } catch (error) {}
            const input = isM3u8Url(sourceUrl)
                ? await writeHlsClipInputs(ffmpeg, sourceUrl, startTime, duration, taskId)
                : await writeDirectClipInput(ffmpeg, sourceUrl, taskId);
            const seekTime = input.localStartTime === null ? startTime : input.localStartTime;
            setDownloadTaskStatus(taskId, '正在封装切片...', 70);
            await ffmpeg.run(
                '-ss', String(Math.max(0, seekTime)),
                '-i', input.inputName,
                '-t', String(duration),
                '-c', 'copy',
                '-movflags', 'faststart',
                outputName
            );
            const output = ffmpeg.FS('readFile', outputName);
            triggerBlobDownload(`${sanitizeDownloadName(payload?.fileName)}.mp4`, output, 'video/mp4');
            setDownloadTaskStatus(taskId, '浏览器切片完成，已开始下载', 100);
            finishClipToolbarStatus('切片完成，已开始下载');
        } finally {
            try { ffmpeg.FS('unlink', outputName); } catch (error) {}
        }
    }

    function clipVodInBrowser(payload) {
        const taskId = payload?.taskId || '';
        setDownloadTaskStatus(taskId, '正在准备浏览器切片...', 1);
        runBrowserClip(payload).catch((error) => {
            console.error('网页版切片失败:', error);
            setDownloadTaskStatus(taskId, error?.message || '浏览器切片失败', 0);
            finishClipToolbarStatus(error?.message || '浏览器切片失败', true);
            window.alert(`浏览器切片失败：${error?.message || '未知错误'}`);
            const task = taskId ? document.getElementById(taskId) : null;
            const percentEl = task?.querySelector?.('.download-percent');
            if (percentEl) percentEl.textContent = '失败';
        });
    }

    const ipcRenderer = {
        send(channel, payload) {
            if (channel === 'download-danmu' && payload && payload.content) {
                downloadTextFile(payload.fileName || 'danmu.json', payload.content, 'application/json;charset=utf-8');
                return;
            }
            if (channel === 'clip-vod') {
                clipVodInBrowser(payload || {});
                return;
            }
            if (channel === 'window-min' || channel === 'window-max' || channel === 'window-close') {
                return;
            }
            console.warn(`网页版暂不支持 send 通道: ${channel}`);
        },
        async invoke(channel, payload) {
            if (channel === 'dialog-open-directory') {
                return '';
            }
            if (channel === 'open-message-data-folder') {
                return { success: false, msg: '网页版没有本地数据文件夹' };
            }
            if (channel === 'save-export-html') {
                downloadTextFile(payload?.fileName || 'messages.html', payload?.htmlContent || '', 'text/html;charset=utf-8');
                return { success: true };
            }
            if (channel === 'open-external-player') {
                const url = payload?.url || payload;
                return { success: openMediaUrlForWeb(url) };
            }
            if (channel === 'bilibili-login-status') {
                return { success: true, loggedIn: false, msg: '网页版暂未保存 B 站登录状态' };
            }
            if (channel === 'bilibili-logout') {
                return { success: true };
            }
            if (channel === 'bilibili-login-create-qrcode' || channel === 'bilibili-login-poll') {
                return { success: false, msg: '网页版暂不支持 B 站扫码登录' };
            }
            if (channel === 'get-bilibili-live-statuses') {
                const roomIds = Array.isArray(payload) ? payload : [];
                return roomIds.map(roomId => ({
                    requestedRoomId: String(roomId || ''),
                    realRoomId: String(roomId || ''),
                    live: false,
                    liveStatus: 0,
                    error: '网页版暂未接入 B 站直播状态'
                }));
            }
            if (channel === 'resolve-bilibili-live') {
                return { success: false, msg: '网页版暂不支持解析 B 站直播流' };
            }
            if (channel === 'start-live-proxy' || channel === 'start-radio-proxy') {
                return payload?.url || payload;
            }
            if (channel === 'stop-live-proxy') {
                return { success: true };
            }
            return invokeRemote(channel, payload);
        },
        on() {
            return function unsubscribe() {};
        }
    };

    window.desktop = {
        appDir: '',
        platform: 'web',
        storagePaths: {
            cacheFile: '',
            manifestFile: '',
            htmlDir: '',
            exportRootDir: '',
            internalDataDir: ''
        },
        fs: fsShim,
        path: pathShim,
        https: {},
        readline: {},
        openExternal(url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        },
        openExternalPlayer(url) {
            return Promise.resolve({ success: openMediaUrlForWeb(url) });
        },
        ipcRenderer,
        appSettings: {
            readSync: readSettings,
            getSettingValueSync,
            setSettingValueSync,
            removeSettingValueSync,
            getTokenSync() {
                return getSettingValueSync('yaya_p48_token', localStorage.getItem('yaya_p48_token') || '');
            },
            setTokenSync(token) {
                localStorage.setItem('yaya_p48_token', token || '');
                return setSettingValueSync('yaya_p48_token', token || '');
            },
            clearTokenSync() {
                localStorage.removeItem('yaya_p48_token');
                removeSettingValueSync('yaya_p48_token');
                return '';
            },
            getBackgroundUrlSync() {
                return getSettingValueSync('customBackgroundDataUrl', '');
            },
            saveBackgroundFromDataUrlSync,
            saveBackgroundFromFileSync() {
                return '';
            },
            clearBackgroundSync() {
                removeSettingValueSync('customBackgroundDataUrl');
                return '';
            }
        },
        appCache: {
            readSync: readCache,
            getCacheValueSync,
            setCacheValueSync,
            removeCacheValueSync
        }
    };

    window.ipcRenderer = ipcRenderer;
    window.yayaWebApiUrl = apiUrl;
})();
