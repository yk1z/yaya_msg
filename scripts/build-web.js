const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const outputDir = path.join(projectRoot, 'web-dist');
const buildVersion = Date.now().toString(36);

function copyFile(relativePath) {
    const source = path.join(projectRoot, relativePath);
    const target = path.join(outputDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

function copyDir(relativePath) {
    const sourceDir = path.join(projectRoot, relativePath);
    const targetDir = path.join(outputDir, relativePath);
    if (!fs.existsSync(sourceDir)) return;
    fs.mkdirSync(targetDir, { recursive: true });

    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const childRelativePath = path.join(relativePath, entry.name);
        if (entry.isDirectory()) {
            copyDir(childRelativePath);
        } else if (entry.isFile()) {
            copyFile(childRelativePath);
        }
    }
}

function replaceOnce(content, search, replacement) {
    if (!content.includes(search)) {
        throw new Error(`Web build transform target not found: ${search.slice(0, 80)}`);
    }
    return content.replace(search, replacement);
}

function addClass(content, search, className) {
    if (!content.includes(search)) {
        throw new Error(`Web build class target not found: ${search.slice(0, 80)}`);
    }
    return content.replace(search, search.replace('class="', `class="${className} `));
}

function addClassByPattern(content, pattern, replacement, label) {
    const nextContent = content.replace(pattern, replacement);
    if (nextContent === content) {
        throw new Error(`Web build class target not found: ${label}`);
    }
    return nextContent;
}

function replaceInWebTextFiles(relativePath) {
    const targetPath = path.join(outputDir, relativePath);
    if (!fs.existsSync(targetPath)) return;
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(targetPath)) {
            replaceInWebTextFiles(path.join(relativePath, entry));
        }
        return;
    }

    if (!/\.(html|js|css)$/i.test(relativePath)) return;
    const content = fs.readFileSync(targetPath, 'utf8');
    const nextContent = content.replace(/\.\/icon\.png/g, './web-icon.png');
    if (nextContent !== content) {
        fs.writeFileSync(targetPath, nextContent);
    }
}

function optimizeLocalScriptTags(indexHtml) {
    return indexHtml.replace(
        /<script(?![^>]*\bdefer\b)([^>]*?)\ssrc="(\.\/src\/renderer\/[^"?]+\.js)(?:\?v=[^"]*)?"([^>]*)><\/script>/g,
        (match, before, src, after) => {
            if (src.endsWith('/theme-init.js')) return match;
            return `<script defer${before} src="${src}?v=${buildVersion}"${after}></script>`;
        }
    );
}

function applyWebTransforms() {
    const indexPath = path.join(outputDir, 'index.html');
    const stylePath = path.join(outputDir, 'style.css');
    const appLegacyPath = path.join(outputDir, 'src', 'renderer', 'app-legacy.js');
    const danmuTimelinePath = path.join(outputDir, 'src', 'renderer', 'danmu-timeline-feature.js');
    const replayDownloadPath = path.join(outputDir, 'src', 'renderer', 'replay-download-feature.js');
    const officialSiteMusicPath = path.join(outputDir, 'src', 'renderer', 'official-site-music-feature.js');
    const databaseTemplatePath = path.join(outputDir, 'src', 'renderer', 'database', 'index.html');
    const webDatabaseTemplatePath = path.join(outputDir, 'database-template.txt');
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    let appLegacy = fs.readFileSync(appLegacyPath, 'utf8');
    let danmuTimeline = fs.readFileSync(danmuTimelinePath, 'utf8');
    let replayDownload = fs.readFileSync(replayDownloadPath, 'utf8');
    let officialSiteMusic = fs.readFileSync(officialSiteMusicPath, 'utf8');
    fs.copyFileSync(databaseTemplatePath, webDatabaseTemplatePath);

    indexHtml = replaceOnce(
        indexHtml,
        '<head>',
        '<head>\n    <base href="/">'
    );
    indexHtml = replaceOnce(
        indexHtml,
        '    <script src="./src/renderer/theme-init.js"></script>',
        `    <script src="./src/web/browser-shim.js?v=${buildVersion}"></script>\n    <script src="./src/renderer/theme-init.js"></script>`
    );
    indexHtml = replaceOnce(
        indexHtml,
        '<link rel="icon" href="./icon.png" type="image/x-icon">',
        '<link rel="icon" href="./web-icon.png" type="image/png">'
    );
    indexHtml = indexHtml
        .replace(/<title>牙牙消息 v\d+\.\d+<\/title>/g, '<title>牙牙消息</title>')
        .replace(/<span>牙牙消息 v\d+\.\d+<\/span>/g, '<span>牙牙消息</span>');
    indexHtml = replaceOnce(
        indexHtml,
        '<link rel="stylesheet" href="style.css">',
        `<link rel="stylesheet" href="style.css?v=${buildVersion}">`
    );
    for (const blockingCdnScript of [
        '    <script src="https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.min.js"></script>\r\n',
        '    <script src="https://cdn.jsdelivr.net/npm/hls.js@1.4.0/dist/hls.min.js"></script>\r\n',
        '    <script src="https://cdn.jsdelivr.net/npm/artplayer/dist/artplayer.js"></script>\r\n',
        '    <script src="https://cdn.jsdelivr.net/npm/artplayer-plugin-danmuku/dist/artplayer-plugin-danmuku.js"></script>\r\n',
        '    <script src="https://cdn.jsdelivr.net/npm/dplayer/dist/DPlayer.min.js"></script>\r\n',
        '    <script src="https://cdn.jsdelivr.net/npm/pinyin-pro@3.24.2/dist/index.js"></script>\r\n'
    ]) {
        indexHtml = replaceOnce(indexHtml, blockingCdnScript, '');
    }
    indexHtml = replaceOnce(
        indexHtml,
        '<script src="./src/renderer/app-legacy.js"></script>',
        `<script src="./src/renderer/app-legacy.js?v=${buildVersion}"></script>`
    );
    indexHtml = replaceOnce(
        indexHtml,
        '<script src="./src/renderer/bootstrap-shared.js"></script>',
        `<script src="./src/renderer/bootstrap-shared.js?v=${buildVersion}"></script>`
    );
    indexHtml = optimizeLocalScriptTags(indexHtml);

    indexHtml = addClass(indexHtml, '<button class="home-card" onclick="switchView(\'bilibili-live\')">', 'web-hidden');
    indexHtml = indexHtml
        .replace(/软件设置/g, '页面设置')
        .replace(/软件相关设置/g, '页面相关设置');
    indexHtml = replaceOnce(
        indexHtml,
        '<div class="home-panel-subtitle">口袋账号、B站账号、下载管理、页面相关设置</div>',
        '<div class="home-panel-subtitle">口袋账号、页面相关设置</div>'
    );
    indexHtml = replaceOnce(
        indexHtml,
        '<div class="home-panel-subtitle">官方视频、音乐、电台资源</div>',
        '<div class="home-panel-subtitle">官方视频、音乐、电台资源</div>'
    );
    indexHtml = addClass(indexHtml, '<button class="home-card" onclick="switchView(\'downloads\')">', 'web-hidden');
    indexHtml = addClassByPattern(
        indexHtml,
        /<div class="Box-row account-section-card">(\s*<div[\s\S]*?<label style="display:block; font-weight:bold; color:var\(--text\);">B站登录<\/label>)/,
        '<div class="Box-row account-section-card web-hidden">$1',
        'B站登录设置'
    );
    indexHtml = addClassByPattern(
        indexHtml,
        /<div class="Box-row">(\s*<div\s+style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">\s*<h3 style="margin: 0; color: var\(--text\);">🌐 IP检测<\/h3>)/,
        '<div class="Box-row web-hidden">$1',
        'IP检测设置'
    );
    indexHtml = addClassByPattern(
        indexHtml,
        /<div class="Box-row">(\s*<h3 style="margin-top: 0; color: var\(--text\);">📂 下载路径<\/h3>)/,
        '<div class="Box-row web-hidden">$1',
        '下载路径设置'
    );
    indexHtml = addClass(
        indexHtml,
        '<button id="btn-room-album-dl-all" class="btn btn-secondary" style="width: 100%;"',
        'web-hidden'
    );
    indexHtml = replaceOnce(
        indexHtml,
        '                    </section>\r\n                    <div class="home-footer-credit">presented by yk1z</div>',
        `                    </section>\r\n                    <div class="web-limit-notice">\r\n                        <span class="web-limit-copy">由于网页限制，使用完整功能请下载桌面端。</span>\r\n                        <div class="web-download-actions" aria-label="桌面端下载">\r\n                            <a class="web-desktop-download-btn" href="/downloads/yaya_msg-v2.3-win.zip" download>Windows</a>\r\n                            <a class="web-desktop-download-btn" href="/downloads/yaya_msg-v2.3-mac.zip" download>macOS</a>\r\n                            <a class="web-desktop-download-btn" href="/downloads/yaya_msg-v2.3-linux.tar.gz" download>Linux</a>\r\n                        </div>\r\n                    </div>\r\n                    <div class="home-footer-credit">presented by yk1z</div>`
    );

    fs.writeFileSync(indexPath, indexHtml);

    replayDownload = addClassByPattern(
        replayDownload,
        /function fetchDanmuNative\(url\) \{\s*return new Promise\(\(resolve, reject\) => \{\s*https\.get\(url, \(res\) => \{\s*let data = '';\s*res\.on\('data', \(chunk\) => \{\s*data \+= chunk;\s*\}\);\s*res\.on\('end', \(\) => resolve\(data\)\);\s*\}\)\.on\('error', \(error\) => reject\(error\)\);\s*\}\);\s*\}/,
        `async function fetchDanmuNative(url) {
            const apiUrl = window.yayaWebApiUrl ? window.yayaWebApiUrl('/api/text-proxy') : '/api/text-proxy';
            const response = await fetch(apiUrl + '?url=' + encodeURIComponent(url));
            if (!response.ok) {
                throw new Error('弹幕文件读取失败: ' + response.status);
            }
            return response.text();
        }`,
        '网页版弹幕读取'
    );
    fs.writeFileSync(replayDownloadPath, replayDownload);

    officialSiteMusic = addClassByPattern(
        officialSiteMusic,
        /                        <span class="official-site-music-table-text\$\{track\.album \? '' : ' is-empty'\}">\$\{escapeHtml\(getOfficialSiteAlbumDisplayName\(track\.album\) \|\| '-'\)\}<\/span>\r?\n                        <span class="official-site-music-table-text">\$\{escapeHtml\(track\.groupLabel\)\}<\/span>\r?\n                        <span class="official-site-music-table-time">\$\{escapeHtml\(track\.duration \|\| '--:--'\)\}<\/span>/,
        "                        <span class=\"official-site-music-table-text${track.album ? '' : ' is-empty'}\">${escapeHtml(getOfficialSiteAlbumDisplayName(track.album) || '-')}</span>\r\n                        <span class=\"official-site-music-table-text official-site-music-group-cell\">${escapeHtml(track.groupLabel)}</span>",
        '官网音乐列表网页列'
    );
    officialSiteMusic = addClassByPattern(
        officialSiteMusic,
        /                \$\{renderSortHeader\('source', '#'\)\}\r?\n                \$\{renderSortHeader\('title', '标题'\)\}\r?\n                \$\{renderSortHeader\('album', '专辑'\)\}\r?\n                \$\{renderSortHeader\('group', '分团'\)\}\r?\n                \$\{renderSortHeader\('duration', '时长'\)\}/,
        "                ${renderSortHeader('source', '序号')}\r\n                ${renderSortHeader('title', '标题')}\r\n                ${renderSortHeader('album', '专辑')}\r\n                ${renderSortHeader('group', '分团')}",
        '官网音乐表头网页列'
    );
    fs.writeFileSync(officialSiteMusicPath, officialSiteMusic);

    danmuTimeline = replaceOnce(
        danmuTimeline,
        "                        createHeaderCol('字幕内容', null, true) +\r\n                        createHeaderCol('操作', '--col-act', false, true);",
        "                        createHeaderCol('字幕内容', null, true, true);"
    );
    danmuTimeline = addClassByPattern(
        danmuTimeline,
        /const actionHtml = currentTimelineMode === 'subtitle' \? `[\s\S]*?`\s*: '';/,
        "const actionHtml = '';",
        '字幕操作列'
    );
    fs.writeFileSync(danmuTimelinePath, danmuTimeline);

    appLegacy = appLegacy.replace(
        '<button class="btn btn-secondary"\r\n                                        style="padding: 2px 8px; font-size: 11px; height: 24px;" \r\n                                        onclick="handleDownloadDanmu(event, ${JSON.stringify(item).replace(/"/g, \'&quot;\')})">',
        '<button class="btn btn-secondary web-hidden"\r\n                                        style="padding: 2px 8px; font-size: 11px; height: 24px;" \r\n                                        onclick="handleDownloadDanmu(event, ${JSON.stringify(item).replace(/"/g, \'&quot;\')})">'
    );
    appLegacy = appLegacy.replace(
        '<button class="btn ${btnStyleClass} vod-btn-${item.liveId}" ${btnDisabled} ',
        '<button class="btn ${btnStyleClass} vod-btn-${item.liveId} web-hidden" ${btnDisabled} '
    );
    appLegacy = appLegacy.replace(
        / onclick="directToPotPlayer\(event, '\$\{item\.liveId\}'(?:, '\$\{isMeetItem \? 'meet48' : 'pocket'\}')?\)" title="点击头像直接调用外部播放器播放"/g,
        ' onclick="if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || \'\')) return; directToPotPlayer(event, \'${item.liveId}\', \'${isMeetItem ? \'meet48\' : \'pocket\'}\')" title="点击头像直接调用外部播放器播放"'
    );
    appLegacy = addClassByPattern(
        appLegacy,
        /                document\.getElementById\('backToTopBtn'\)\.classList\.remove\('show'\);\r?\n                const backBtn = document\.getElementById\('backToTopBtn'\);\r?\n                if \(backBtn\) backBtn\.classList\.remove\('show'\);/,
        "                const backBtn = document.getElementById('backToTopBtn');\n                if (backBtn) backBtn.classList.remove('show');",
        '返回顶部按钮安全判断'
    );
    appLegacy = replaceOnce(
        appLegacy,
        "                return fetch('/api/pocket', {",
        "                const apiUrl = window.yayaWebApiUrl ? window.yayaWebApiUrl('/api/pocket') : '/api/pocket';\n                return fetch(apiUrl, {"
    );
    appLegacy = replaceOnce(
        appLegacy,
        "                    const data = await response.json().catch(() => ({ status: 500, content: {} }));",
        `                    const text = await response.text();
                    let data = null;
                    try {
                        data = text ? JSON.parse(text) : { status: 500, content: {} };
                    } catch (error) {
                        data = {
                            status: 500,
                            message: /^\\s*</.test(text || '')
                                ? '口袋 API 返回了 HTML 页面，Cloudflare Worker 请求可能被拦截'
                                : '口袋 API 返回内容不是 JSON',
                            content: {}
                        };
                    }`
    );
    appLegacy = addClassByPattern(
        appLegacy,
        /                if \(!isStaleVodRequest\(\)\) vodState\.hasMore = false;\r?\n            } catch \(e\) \{\r?\n                if \(!isStaleVodRequest\(\)\) vodState\.hasMore = false;\r?\n            }\r?\n            return 0;/,
        "                if (!isStaleVodRequest()) {\r\n                    vodState.hasMore = false;\r\n                    if (res?.message) document.getElementById('vod-loading').textContent = res.message;\r\n                }\r\n            } catch (e) {\r\n                if (!isStaleVodRequest()) {\r\n                    vodState.hasMore = false;\r\n                    document.getElementById('vod-loading').textContent = e?.message || '录播接口请求失败';\r\n                }\r\n            }\r\n            return 0;"
        ,
        '录播接口错误提示'
    );
    appLegacy = replaceOnce(
        appLegacy,
        '        function switchView(viewName, mode = null) {',
        `        const WEB_ROUTE_MAP = {
            home: { view: 'home', mode: null, title: '' },
            messages: { view: 'messages', mode: null, title: '消息检索' },
            fetch: { view: 'fetch', mode: null, title: '抓取消息' },
            live: { view: 'media', mode: 'live', title: '正在直播' },
            vod: { view: 'media', mode: 'vod', title: '直播回放' },
            'meet48-live': { view: 'media', mode: 'meet-live', title: '海外直播' },
            'meet48-vod': { view: 'media', mode: 'meet-vod', title: '海外回放' },
            room: { view: 'followed-rooms', mode: null, title: '口袋房间' },
            'followed-rooms': { view: 'followed-rooms', mode: null, title: '口袋房间' },
            message: { view: 'private-messages', mode: null, title: '私信列表' },
            img: { view: 'room-album', mode: null, title: '房间相册' },
            openlive: { view: 'openlive', mode: null, title: '公演记录' },
            'send-flip': { view: 'send-flip', mode: null, title: '翻牌提问' },
            flip: { view: 'flip', mode: null, title: '翻牌记录' },
            nft: { view: 'photos', mode: null, title: '个人相册' },
            video: { view: 'video-library', mode: null, title: '视频' },
            music: { view: 'official-site-music', mode: null, title: '音乐' },
            audio: { view: 'audio-programs', mode: null, title: '电台' },
            profile: { view: 'profile', mode: null, title: '成员档案' },
            database: { view: 'database', mode: null, title: '数据库' },
            login: { view: 'login', mode: null, title: '账号登录' },
            settings: { view: 'settings', mode: null, title: '软件设置' },
            voice: { view: 'room-radio', mode: null, title: '房间上麦' }
        };
        const WEB_VIEW_TO_SLUG = new Map([
            ['home:', 'home'],
            ['messages:', 'messages'],
            ['fetch:', 'fetch'],
            ['media:live', 'live'],
            ['media:vod', 'vod'],
            ['media:meet-live', 'meet48-live'],
            ['media:meet-vod', 'meet48-vod'],
            ['followed-rooms:', 'room'],
            ['private-messages:', 'message'],
            ['room-album:', 'img'],
            ['openlive:', 'openlive'],
            ['send-flip:', 'send-flip'],
            ['flip:', 'flip'],
            ['photos:', 'nft'],
            ['video-library:', 'video'],
            ['official-site-music:', 'music'],
            ['audio-programs:', 'audio'],
            ['profile:', 'profile'],
            ['database:', 'database'],
            ['login:', 'login'],
            ['settings:', 'settings'],
            ['room-radio:', 'voice']
        ]);
        let isApplyingWebRoute = false;

        function getWebViewKey(viewName, mode) {
            return \`\${viewName || 'home'}:\${mode || ''}\`;
        }

        function getWebRouteTitle(viewName, mode) {
            const slug = WEB_VIEW_TO_SLUG.get(getWebViewKey(viewName, mode));
            return slug && WEB_ROUTE_MAP[slug] ? WEB_ROUTE_MAP[slug].title : '';
        }

        function getWebSlugFromLocation() {
            const hashSlug = String(window.location.hash || '')
                .replace(/^#\\/?/, '')
                .split('?')[0]
                .replace(/^\\/+|\\/+$/g, '');
            if (hashSlug) return hashSlug;
            const pathSlug = decodeURIComponent(String(window.location.pathname || '/'))
                .replace(/^\\/+|\\/+$/g, '');
            return pathSlug && pathSlug !== 'index.html' ? pathSlug : 'home';
        }

        function getWebRouteFromLocation() {
            const slug = getWebSlugFromLocation();
            const parts = slug.split('/').filter(Boolean);
            const baseSlug = parts[0] || 'home';
            const route = WEB_ROUTE_MAP[baseSlug] || WEB_ROUTE_MAP.home;
            if ((baseSlug === 'live' || baseSlug === 'vod' || baseSlug === 'replay') && parts[1]) {
                return Object.assign({}, route, { liveId: parts[1] });
            }
            return route;
        }

        function syncWebRouteAndTitle(viewName, mode, options = {}) {
            if (!window.desktop || window.desktop.platform !== 'web') return;

            const title = getWebRouteTitle(viewName, mode);
            document.title = title ? \`牙牙消息 - \${title}\` : '牙牙消息';
            document.body.classList.toggle('web-secondary-page', !!title);

            let slug = WEB_VIEW_TO_SLUG.get(getWebViewKey(viewName, mode)) || 'home';
            const liveId = options.liveId ? String(options.liveId) : '';
            if (viewName === 'media' && (mode === 'live' || mode === 'vod') && liveId) {
                slug = \`\${mode}/\${encodeURIComponent(liveId)}\`;
            }
            if (slug === 'home') {
                document.documentElement.classList.remove('web-secondary-route-boot');
            }

            if (isApplyingWebRoute) return;

            const nextPath = slug === 'home' ? '/' : \`/\${slug}\`;
            const currentPath = decodeURIComponent(window.location.pathname || '/').replace(/\\/+$/, '') || '/';
            const nextComparablePath = decodeURIComponent(nextPath).replace(/\\/+$/, '') || '/';
            if (!window.location.hash && currentPath === nextComparablePath) return;

            const historyState = liveId ? { viewName, mode, liveId } : { viewName, mode };

            if (options.replace) {
                history.replaceState(historyState, '', nextPath);
            } else {
                history.pushState(historyState, '', nextPath);
            }
        }

        function createWebMediaRouteItem(liveId, mode) {
            const isLive = mode === 'live';
            return {
                liveId,
                userInfo: { nickname: isLive ? '直播' : '录播' },
                nickname: isLive ? '直播' : '录播',
                title: isLive ? '正在直播' : '直播回放',
                liveTitle: isLive ? '正在直播' : '直播回放',
                startTime: 0,
                ctime: 0
            };
        }

        function scheduleWebMediaAutoplay(liveId, mode) {
            const normalizedLiveId = String(liveId || '').trim();
            const normalizedMode = mode === 'live' ? 'live' : 'vod';
            if (!normalizedLiveId) return;

            window.__yayaPendingMediaRoute = { liveId: normalizedLiveId, mode: normalizedMode };
            const tryPlayMediaRoute = () => {
                const pendingRoute = window.__yayaPendingMediaRoute || {};
                if (String(pendingRoute.liveId || '') !== normalizedLiveId || pendingRoute.mode !== normalizedMode) return;

                if (typeof window.playLiveStream !== 'function') {
                    setTimeout(tryPlayMediaRoute, 80);
                    return;
                }

                isApplyingWebRoute = true;
                try {
                    switchView('media', normalizedMode);
                } finally {
                    isApplyingWebRoute = false;
                    document.documentElement.classList.remove('web-route-pending');
                }
                syncWebRouteAndTitle('media', normalizedMode, { replace: true, liveId: normalizedLiveId });

                const currentItem = typeof getCurrentPlayingItem === 'function'
                    ? getCurrentPlayingItem()
                    : null;
                const currentRoute = window.__yayaCurrentMediaDeepLink || {};
                if (currentItem
                    && String(currentItem.liveId || '') === normalizedLiveId
                    && currentRoute.mode === normalizedMode) {
                    window.__yayaCurrentMediaDeepLink = { liveId: normalizedLiveId, mode: normalizedMode };
                    return;
                }

                window.__yayaCurrentMediaDeepLink = { liveId: normalizedLiveId, mode: normalizedMode };
                window.playLiveStream(createWebMediaRouteItem(normalizedLiveId, normalizedMode), normalizedMode);
            };

            setTimeout(tryPlayMediaRoute, 0);
        }

        function syncWebMediaRoute(mode, item, options = {}) {
            const normalizedMode = mode === 'live' ? 'live' : 'vod';
            const liveId = item && item.liveId ? String(item.liveId) : '';
            if (!liveId) return;
            window.__yayaPendingMediaRoute = null;
            window.__yayaCurrentMediaDeepLink = { liveId, mode: normalizedMode };
            syncWebRouteAndTitle('media', normalizedMode, Object.assign({}, options, { liveId }));
        }

        function syncWebMediaListRoute(mode, options = {}) {
            const normalizedMode = mode === 'live' ? 'live' : 'vod';
            window.__yayaPendingMediaRoute = null;
            window.__yayaCurrentMediaDeepLink = null;
            syncWebRouteAndTitle('media', normalizedMode, Object.assign({ replace: true }, options));
        }

        window.syncWebLiveRoute = function syncWebLiveRoute(item, options = {}) {
            syncWebMediaRoute('live', item, options);
        };

        window.syncWebVodRoute = function syncWebVodRoute(item, options = {}) {
            syncWebMediaRoute('vod', item, options);
        };

        window.syncWebLiveListRoute = function syncWebLiveListRoute(options = {}) {
            syncWebMediaListRoute('live', options);
        };

        window.syncWebVodListRoute = function syncWebVodListRoute(options = {}) {
            syncWebMediaListRoute('vod', options);
        };

        function applyWebRouteFromLocation() {
            if (!window.desktop || window.desktop.platform !== 'web') return;

            const route = getWebRouteFromLocation();
            const isMediaDeepRoute = (route.mode === 'live' || route.mode === 'vod') && route.liveId;
            if (isMediaDeepRoute) {
                syncWebRouteAndTitle(route.view, route.mode, { replace: true, liveId: route.liveId });
                scheduleWebMediaAutoplay(route.liveId, route.mode);
                return;
            }

            isApplyingWebRoute = true;
            try {
                switchView(route.view, route.mode);
            } finally {
                isApplyingWebRoute = false;
                document.documentElement.classList.remove('web-route-pending');
            }
            syncWebRouteAndTitle(route.view, route.mode, route.liveId
                ? { replace: true, liveId: route.liveId }
                : { replace: true });
        }

        function scheduleWebRouteStabilizer() {
            if (!window.desktop || window.desktop.platform !== 'web') return;
            const slug = getWebSlugFromLocation();
            if (!slug || slug === 'home') return;
            const route = getWebRouteFromLocation();
            if (route.liveId) {
                setTimeout(() => {
                    document.documentElement.classList.remove('web-secondary-route-boot');
                }, 1200);
                return;
            }

            [50, 180, 500, 1000].forEach((delay) => {
                setTimeout(() => {
                    const latestSlug = getWebSlugFromLocation();
                    if (latestSlug && latestSlug !== 'home') {
                        applyWebRouteFromLocation();
                    }
                }, delay);
            });
            setTimeout(() => {
                document.documentElement.classList.remove('web-secondary-route-boot');
            }, 1200);
        }

        function switchView(viewName, mode = null) {`
    );
    appLegacy = appLegacy.replace(/软件设置/g, '页面设置');
    appLegacy = replaceOnce(
        appLegacy,
        '                updateTopbarPageTitle(viewName, mode);',
        '                updateTopbarPageTitle(viewName, mode);\n                syncWebRouteAndTitle(viewName, mode);'
    );
    appLegacy = replaceOnce(
        appLegacy,
        '        updateTopbarPageTitle(currentViewName, currentViewMode);',
        "        const pendingWebSwitchView = Array.isArray(window.__yayaPendingSwitchView)\n            ? window.__yayaPendingSwitchView\n            : null;\n        window.__yayaPendingSwitchView = null;\n        window.switchView = switchView;\n        window.toggleSidebar = toggleSidebar;\n        window.getAppTopbarTitle = getAppTopbarTitle;\n        updateTopbarPageTitle(currentViewName, currentViewMode);\n        if (window.desktop && window.desktop.platform === 'web') {\n            window.addEventListener('popstate', applyWebRouteFromLocation);\n            window.addEventListener('hashchange', () => {\n                if (!isApplyingWebRoute) applyWebRouteFromLocation();\n            });\n            const initialWebSlug = getWebSlugFromLocation();\n            if (initialWebSlug && initialWebSlug !== 'home') {\n                applyWebRouteFromLocation();\n                scheduleWebRouteStabilizer();\n            } else if (pendingWebSwitchView) {\n                setTimeout(() => {\n                    try {\n                        switchView(...pendingWebSwitchView);\n                    } finally {\n                        document.documentElement.classList.remove('web-route-pending');\n                    }\n                }, 0);\n            } else {\n                applyWebRouteFromLocation();\n            }\n        }"
    );
    fs.writeFileSync(appLegacyPath, appLegacy);

    fs.appendFileSync(stylePath, [
        '',
        'html[data-platform="web"] .window-controls {',
        '    display: none;',
        '}',
        '',
        'html[data-platform="web"] .web-hidden {',
        '    display: none !important;',
        '}',
        '',
        'html[data-platform="web"].web-mobile-device #clip-toolbar,',
        'html[data-platform="web"].web-mobile-device [data-clip-toolbar] {',
        '    display: none !important;',
        '}',
        '',
        'html.web-secondary-route-boot #view-home {',
        '    display: none !important;',
        '    visibility: hidden !important;',
        '}',
        '',
        'html.web-route-pending .app-container {',
        '    visibility: hidden;',
        '}',
        '',
        'html.web-route-pending body::before {',
        '    content: "";',
        '    position: fixed;',
        '    inset: 0;',
        '    z-index: 9998;',
        '    background: var(--bg);',
        '}',
        '',
        'html.web-route-pending body::after {',
        '    content: "";',
        '    position: fixed;',
        '    left: 50%;',
        '    top: 50%;',
        '    z-index: 9999;',
        '    width: 36px;',
        '    height: 36px;',
        '    margin: -18px 0 0 -18px;',
        '    border: 4px solid rgba(148, 163, 184, 0.22);',
        '    border-top-color: var(--primary);',
        '    border-radius: 50%;',
        '    animation: spin 0.8s linear infinite;',
        '}',
        '',
        'html[data-platform="web"] .custom-title-bar {',
        '    height: 54px;',
        '    margin: 12px 16px 0;',
        '    padding: 0 14px;',
        '    border: 1px solid rgba(255, 255, 255, 0.22);',
        '    border-radius: 14px;',
        '    background: rgba(255, 255, 255, 0.18);',
        '    box-shadow: 0 14px 36px rgba(15, 23, 42, 0.14);',
        '    -webkit-backdrop-filter: blur(22px) saturate(1.15);',
        '    backdrop-filter: blur(22px) saturate(1.15);',
        '    -webkit-app-region: no-drag;',
        '    z-index: 20;',
        '}',
        '',
        'html[data-platform="web"][data-theme="dark"] .custom-title-bar {',
        '    border-color: rgba(255, 255, 255, 0.12);',
        '    background: rgba(16, 22, 32, 0.50);',
        '    box-shadow: 0 16px 38px rgba(0, 0, 0, 0.24);',
        '}',
        '',
        'html[data-platform="web"] .title-info {',
        '    height: 36px;',
        '    padding-left: 0;',
        '    gap: 10px;',
        '    font-size: 13px;',
        '}',
        '',
        'html[data-platform="web"] .title-info .control-btn {',
        '    width: 36px;',
        '    height: 36px;',
        '    margin-right: 0 !important;',
        '    border: 1px solid rgba(148, 163, 184, 0.26);',
        '    border-radius: 10px;',
        '    background: rgba(255, 255, 255, 0.38);',
        '    color: var(--text);',
        '}',
        '',
        'html[data-platform="web"][data-theme="dark"] .title-info .control-btn {',
        '    background: rgba(255, 255, 255, 0.08);',
        '    border-color: rgba(255, 255, 255, 0.14);',
        '}',
        '',
        'html[data-platform="web"] .title-info .control-btn:hover {',
        '    background: rgba(255, 255, 255, 0.62);',
        '    border-color: rgba(155, 106, 156, 0.35);',
        '}',
        '',
        'html[data-platform="web"][data-theme="dark"] .title-info .control-btn:hover {',
        '    background: rgba(255, 255, 255, 0.14);',
        '}',
        '',
        'html[data-platform="web"] .title-logo {',
        '    width: 22px;',
        '    height: 22px;',
        '    border-radius: 6px;',
        '}',
        '',
        'html[data-platform="web"] .title-bar-center-title {',
        '    max-width: min(360px, calc(100vw - 380px));',
        '    height: 30px;',
        '    padding: 0 14px;',
        '    border: 1px solid rgba(148, 163, 184, 0.22);',
        '    border-radius: 999px;',
        '    background: rgba(255, 255, 255, 0.34);',
        '    display: flex;',
        '    align-items: center;',
        '    justify-content: center;',
        '    color: var(--text);',
        '    font-size: 13px;',
        '}',
        '',
        'html[data-platform="web"][data-theme="dark"] .title-bar-center-title {',
        '    border-color: rgba(255, 255, 255, 0.12);',
        '    background: rgba(255, 255, 255, 0.08);',
        '    color: rgba(255, 255, 255, 0.88);',
        '}',
        '',
        'html[data-platform="web"] .app-container {',
        '    height: calc(100vh - 66px);',
        '}',
        '',
        'html[data-platform="web"] .main-content.home-mode {',
        '    padding-top: 14px;',
        '}',
        '',
        'html[data-platform="web"] body.web-secondary-page .custom-title-bar {',
        '    background: rgba(255, 255, 255, 0.24);',
        '}',
        '',
        'html[data-platform="web"][data-theme="dark"] body.web-secondary-page .custom-title-bar {',
        '    background: rgba(16, 22, 32, 0.58);',
        '}',
        '',
        'html[data-platform="web"] body.web-secondary-page .title-bar-center-title.is-visible {',
        '    opacity: 1;',
        '}',
        '',
        'html[data-platform="web"] .custom-title-bar {',
        '    display: none;',
        '}',
        '',
        'html[data-platform="web"] .app-container {',
        '    height: 100vh;',
        '}',
        '',
        'html[data-platform="web"] .main-content.home-mode {',
        '    padding-top: 16px;',
        '}',
        '',
        'html[data-platform="web"] .web-limit-notice {',
        '    margin: 8px 8px 0;',
        '    padding: 18px 20px;',
        '    border: 1px solid rgba(148, 163, 184, 0.28);',
        '    border-radius: 12px;',
        '    background: color-mix(in srgb, var(--card) 86%, transparent);',
        '    color: var(--text-sub);',
        '    font-size: 14px;',
        '    font-weight: 700;',
        '    text-align: center;',
        '    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);',
        '    backdrop-filter: blur(12px);',
        '    display: flex;',
        '    align-items: center;',
        '    justify-content: center;',
        '    gap: 12px;',
        '    flex-wrap: wrap;',
        '}',
        '',
        'html[data-platform="web"] .web-limit-copy {',
        '    line-height: 1.5;',
        '}',
        '',
        'html[data-platform="web"] .web-download-actions {',
        '    display: inline-flex;',
        '    align-items: center;',
        '    justify-content: center;',
        '    gap: 8px;',
        '    flex-wrap: wrap;',
        '}',
        '',
        'html[data-platform="web"] .web-desktop-download-btn {',
        '    display: inline-flex;',
        '    align-items: center;',
        '    justify-content: center;',
        '    min-width: 96px;',
        '    min-height: 36px;',
        '    padding: 0 14px;',
        '    border-radius: 8px;',
        '    background: color-mix(in srgb, var(--card) 92%, transparent);',
        '    color: var(--text);',
        '    border: 1px solid color-mix(in srgb, var(--border) 82%, var(--primary));',
        '    text-decoration: none;',
        '    font-size: 13px;',
        '    font-weight: 800;',
        '    box-shadow: none;',
        '    transition: background 0.16s ease, border-color 0.16s ease;',
        '}',
        '',
        'html[data-platform="web"] .web-desktop-download-btn:hover {',
        '    background: color-mix(in srgb, var(--primary) 8%, var(--card));',
        '    border-color: color-mix(in srgb, var(--primary) 36%, var(--border));',
        '}',
        '',
        'html[data-platform="web"][data-theme="dark"] .web-limit-notice {',
        '    border-color: rgba(255, 255, 255, 0.12);',
        '    background: rgba(22, 27, 34, 0.62);',
        '    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18);',
        '}',
        '',
        'html[data-platform="web"],',
        'html[data-platform="web"] body {',
        '    min-width: 0;',
        '    overflow-x: hidden;',
        '    touch-action: manipulation;',
        '}',
        '',
        'html[data-platform="web"] .app-container,',
        'html[data-platform="web"] .main-content,',
        'html[data-platform="web"] [id^="view-"] {',
        '    min-width: 0;',
        '}',
        '',
        'html[data-platform="web"] body {',
        '    -webkit-text-size-adjust: 100%;',
        '}',
        '',
        'html[data-platform="web"] *,',
        'html[data-platform="web"] *::before,',
        'html[data-platform="web"] *::after {',
        '    box-sizing: border-box;',
        '}',
        '',
        'html[data-platform="web"] .official-site-music-table {',
        '    min-width: 0;',
        '}',
        '',
        'html[data-platform="web"] .official-site-music-table-head,',
        'html[data-platform="web"] .official-site-music-card {',
        '    grid-template-columns: 64px minmax(0, 1.35fr) minmax(180px, 0.85fr) 88px;',
        '    gap: 12px;',
        '}',
        '',
        'html[data-platform="web"] .official-site-music-group-cell {',
        '    display: block !important;',
        '    text-align: left;',
        '}',
        '',
        'html[data-platform="web"] .official-site-music-player {',
        '    justify-content: center;',
        '}',
        '',
        '@supports (height: 100dvh) {',
        '    html[data-platform="web"] .app-container {',
        '        height: 100dvh;',
        '    }',
        '}',
        '',
        '@media (max-width: 900px) {',
        '    html[data-platform="web"] .main-content.home-mode {',
        '        padding: 12px;',
        '    }',
        '',
        '    html[data-platform="web"] .home-grid {',
        '        grid-template-columns: 1fr;',
        '        gap: 12px;',
        '    }',
        '',
        '    html[data-platform="web"] .home-panel {',
        '        border-radius: 12px;',
        '        padding: 12px;',
        '    }',
        '',
        '    html[data-platform="web"] .home-card-grid {',
        '        grid-template-columns: repeat(3, minmax(0, 1fr));',
        '        gap: 10px;',
        '    }',
        '',
        '    html[data-platform="web"] .home-card {',
        '        width: 100%;',
        '        min-height: 68px;',
        '        aspect-ratio: auto;',
        '    }',
        '',
        '    html[data-platform="web"] .home-panel-subtitle {',
        '        white-space: normal;',
        '    }',
        '',
        '    html[data-platform="web"] .web-limit-notice {',
        '        margin: 0;',
        '        padding: 14px 12px;',
        '        font-size: 13px;',
        '        line-height: 1.6;',
        '    }',
        '',
        '    html[data-platform="web"] #view-media,',
        '    html[data-platform="web"] #view-login,',
        '    html[data-platform="web"] #view-fetch,',
        '    html[data-platform="web"] #view-video-library,',
        '    html[data-platform="web"] #view-flip,',
        '    html[data-platform="web"] #view-open-live,',
        '    html[data-platform="web"] #view-profile,',
        '    html[data-platform="web"] #view-photos,',
        '    html[data-platform="web"] #view-room-album,',
        '    html[data-platform="web"] #view-room-radio,',
        '    html[data-platform="web"] #view-settings,',
        '    html[data-platform="web"] #view-audio-programs,',
        '    html[data-platform="web"] #view-music-library,',
        '    html[data-platform="web"] #view-official-site-music,',
        '    html[data-platform="web"] #view-private-messages,',
        '    html[data-platform="web"] #view-followed-rooms {',
        '        padding: 12px !important;',
        '        overflow-y: auto !important;',
        '        overflow-x: hidden !important;',
        '        scrollbar-gutter: auto;',
        '    }',
        '',
        '    html[data-platform="web"] .list-container {',
        '        width: 100%;',
        '        max-width: none;',
        '        box-sizing: border-box;',
        '    }',
        '',
        '    html[data-platform="web"] .home-shell,',
        '    html[data-platform="web"] .home-view,',
        '    html[data-platform="web"] .home-grid,',
        '    html[data-platform="web"] .home-panel,',
        '    html[data-platform="web"] .Box-row {',
        '        width: 100%;',
        '        max-width: 100%;',
        '        min-width: 0;',
        '    }',
        '',
        '    html[data-platform="web"] .page-header {',
        '        flex-wrap: wrap;',
        '        align-items: flex-start;',
        '        gap: 10px;',
        '    }',
        '',
        '    html[data-platform="web"] .page-title {',
        '        font-size: 18px;',
        '        white-space: normal;',
        '    }',
        '',
        '    html[data-platform="web"] .btn,',
        '    html[data-platform="web"] .input-control {',
        '        min-height: 40px;',
        '        font-size: 14px;',
        '    }',
        '',
        '    html[data-platform="web"] input,',
        '    html[data-platform="web"] textarea,',
        '    html[data-platform="web"] select {',
        '        max-width: 100%;',
        '    }',
        '',
        '    html[data-platform="web"] .Box-row > div[style*="display: flex"],',
        '    html[data-platform="web"] .page-header > div,',
        '    html[data-platform="web"] #panel-login div[style*="display: flex"],',
        '    html[data-platform="web"] .private-message-detail-actions > div {',
        '        flex-wrap: wrap;',
        '    }',
        '',
        '    html[data-platform="web"] #live-list-controls,',
        '    html[data-platform="web"] #media-list-controls > div {',
        '        gap: 10px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-list-controls > div,',
        '    html[data-platform="web"] #media-list-controls > div > div {',
        '        min-width: min(100%, 160px) !important;',
        '    }',
        '',
        '    html[data-platform="web"] #vod-group-wrapper,',
        '    html[data-platform="web"] #vod-type-wrapper,',
        '    html[data-platform="web"] #live-group-wrapper,',
        '    html[data-platform="web"] #live-type-wrapper,',
        '    html[data-platform="web"] #followed-sort-wrapper {',
        '        width: 100% !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-list-controls > div:has(input[type="text"]),',
        '    html[data-platform="web"] #media-list-controls > div > div:has(#vod-member-filter) {',
        '        flex-basis: 100% !important;',
        '        min-width: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-list-controls button,',
        '    html[data-platform="web"] #media-list-controls button {',
        '        flex: 1 1 calc(50% - 5px);',
        '        min-width: 120px;',
        '    }',
        '',
        '    html[data-platform="web"] #panel-login {',
        '        padding: 14px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #login-forms-container {',
        '        min-height: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-player {',
        '        align-items: center;',
        '        text-align: center;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-disc {',
        '        margin-left: auto;',
        '        margin-right: auto;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-player-info {',
        '        width: 100%;',
        '        flex: none;',
        '        align-items: center;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-subline {',
        '        justify-content: center;',
        '    }',
        '',
        '    html[data-platform="web"] .live-card-grid {',
        '        grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));',
        '        padding: 0;',
        '    }',
        '',
        '    html[data-platform="web"] .vod-card-row {',
        '        align-items: flex-start;',
        '        gap: 10px;',
        '    }',
        '',
        '    html[data-platform="web"] .vod-row-cover-container {',
        '        width: 96px;',
        '        height: 54px;',
        '        margin-right: 0;',
        '    }',
        '',
        '    html[data-platform="web"] .vod-row-info {',
        '        height: auto;',
        '        min-height: 54px;',
        '    }',
        '',
        '    html[data-platform="web"] .vod-row-name,',
        '    html[data-platform="web"] .vod-row-title,',
        '    html[data-platform="web"] .vod-row-time {',
        '        min-width: 0;',
        '    }',
        '',
        '    html[data-platform="web"] #live-player-view {',
        '        height: auto !important;',
        '        min-height: 0 !important;',
        '        overflow: visible !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-player-view > div:first-child {',
        '        margin: 0 0 12px 0 !important;',
        '        padding: 12px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #player-split-layout {',
        '        flex: 0 0 auto !important;',
        '        flex-direction: column !important;',
        '        height: auto !important;',
        '        min-height: 0 !important;',
        '        padding: 0 0 12px 0 !important;',
        '        gap: 12px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #player-right-column {',
        '        order: 1;',
        '        width: 100%;',
        '        height: auto !important;',
        '        overflow: visible !important;',
        '        padding-right: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #danmu-timeline-wrapper {',
        '        order: 2;',
        '        flex: 0 0 auto !important;',
        '        width: 100%;',
        '        max-width: none !important;',
        '        height: auto !important;',
        '        min-height: 0 !important;',
        '        --col-seq: 0px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #danmu-timeline-wrapper > div:nth-child(2) > div:first-child,',
        '    html[data-platform="web"] #danmu-list-body .danmu-row > div:first-child {',
        '        display: none !important;',
        '    }',
        '',
        '    html[data-platform="web"] #danmu-timeline-wrapper > div:nth-child(2) > div:nth-child(2),',
        '    html[data-platform="web"] #danmu-list-body .danmu-row > div:nth-child(2) {',
        '        margin-left: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #player-combo-wrapper {',
        '        flex: 0 0 auto !important;',
        '        width: 100% !important;',
        '        max-width: 100% !important;',
        '        margin: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-player-area {',
        '        flex: 0 0 auto !important;',
        '        width: 100% !important;',
        '        height: min(68vh, 720px) !important;',
        '        height: min(68svh, 720px) !important;',
        '        max-height: none !important;',
        '        min-height: 0 !important;',
        '        aspect-ratio: auto !important;',
        '        background: #000 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms > div {',
        '        flex-direction: column;',
        '        height: auto !important;',
        '        min-height: calc(100dvh - 24px);',
        '        overflow: hidden;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms > div > div:first-child {',
        '        width: 100% !important;',
        '        max-height: 42vh;',
        '        border-right: none !important;',
        '        border-bottom: 1px solid var(--border);',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms > div > div:last-child {',
        '        min-height: 420px;',
        '    }',
        '',
        '    html[data-platform="web"] #followed-chat-header {',
        '        padding: 10px 12px !important;',
        '        gap: 10px;',
        '        flex-wrap: wrap;',
        '    }',
        '',
        '    html[data-platform="web"] #followed-chat-messages {',
        '        padding: 12px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .private-messages-shell {',
        '        height: auto;',
        '        min-height: calc(100dvh - 24px);',
        '        flex-direction: column;',
        '    }',
        '',
        '    html[data-platform="web"] .private-messages-sidebar {',
        '        width: 100%;',
        '        max-height: 42vh;',
        '        border-right: none;',
        '        border-bottom: 1px solid var(--border);',
        '    }',
        '',
        '    html[data-platform="web"] .private-messages-sidebar-header {',
        '        padding: 12px;',
        '        flex-wrap: wrap;',
        '    }',
        '',
        '    html[data-platform="web"] .private-messages-panel {',
        '        min-height: 420px;',
        '    }',
        '',
        '    html[data-platform="web"] .private-message-detail-body {',
        '        padding: 12px;',
        '    }',
        '',
        '    html[data-platform="web"] .private-message-item {',
        '        max-width: min(86%, 420px);',
        '    }',
        '',
        '    html[data-platform="web"] .private-message-detail-actions {',
        '        padding: 10px 12px 12px;',
        '    }',
        '',
        '    html[data-platform="web"] .photo-card-grid {',
        '        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));',
        '        gap: 10px;',
        '    }',
        '',
        '    html[data-platform="web"] #view-room-album .Box-row > div:first-child {',
        '        flex-direction: column;',
        '        gap: 10px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-room-album .Box-row > div:first-child > div {',
        '        width: 100%;',
        '        flex: none !important;',
        '    }',
        '',
        '    html[data-platform="web"] .modal-content {',
        '        width: calc(100vw - 24px) !important;',
        '        max-width: calc(100vw - 24px) !important;',
        '        max-height: calc(100dvh - 24px) !important;',
        '    }',
        '}',
        '',
        '@media (max-width: 520px) {',
        '    html[data-platform="web"] .main-content.home-mode {',
        '        padding: 10px;',
        '    }',
        '',
        '    html[data-platform="web"] .home-card-grid {',
        '        grid-template-columns: repeat(2, minmax(0, 1fr));',
        '    }',
        '',
        '    html[data-platform="web"] .home-card {',
        '        min-height: 64px;',
        '        padding: 8px 6px;',
        '    }',
        '',
        '    html[data-platform="web"] .home-card-title {',
        '        font-size: 13px;',
        '    }',
        '',
        '    html[data-platform="web"] #view-media,',
        '    html[data-platform="web"] #view-login,',
        '    html[data-platform="web"] #view-fetch,',
        '    html[data-platform="web"] #view-video-library,',
        '    html[data-platform="web"] #view-flip,',
        '    html[data-platform="web"] #view-open-live,',
        '    html[data-platform="web"] #view-profile,',
        '    html[data-platform="web"] #view-photos,',
        '    html[data-platform="web"] #view-room-album,',
        '    html[data-platform="web"] #view-room-radio,',
        '    html[data-platform="web"] #view-settings,',
        '    html[data-platform="web"] #view-audio-programs,',
        '    html[data-platform="web"] #view-music-library,',
        '    html[data-platform="web"] #view-official-site-music,',
        '    html[data-platform="web"] #view-private-messages,',
        '    html[data-platform="web"] #view-followed-rooms {',
        '        padding: 10px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .Box-row {',
        '        padding: 12px;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-table-head,',
        '    html[data-platform="web"] .official-site-music-card {',
        '        grid-template-columns: 44px minmax(0, 1.1fr) minmax(84px, 0.8fr) 54px;',
        '        gap: 8px;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-table-head {',
        '        padding: 0 10px;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-card {',
        '        padding: 9px 10px;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-table-head .official-site-music-sort:nth-child(3),',
        '    html[data-platform="web"] .official-site-music-table-head .official-site-music-sort:nth-child(4),',
        '    html[data-platform="web"] .official-site-music-card > .official-site-music-table-text,',
        '    html[data-platform="web"] .official-site-music-card > .official-site-music-group-cell {',
        '        display: inline-flex !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-official-site-music {',
        '        gap: 8px !important;',
        '        padding: 8px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-header {',
        '        gap: 8px !important;',
        '        margin-bottom: 8px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-header-tools {',
        '        gap: 8px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-toolbar {',
        '        gap: 7px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-filter {',
        '        min-height: 36px !important;',
        '        padding: 0 12px !important;',
        '        font-size: 13px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-search .input-control {',
        '        min-height: 40px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-table-head {',
        '        min-height: 38px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-card {',
        '        min-height: 56px !important;',
        '        padding-top: 7px !important;',
        '        padding-bottom: 7px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-index {',
        '        width: 38px !important;',
        '        height: 38px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-grid {',
        '        padding-bottom: 8px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-player-wrap {',
        '        --official-site-music-queue-bottom: 94px;',
        '        padding-top: 8px !important;',
        '        padding-bottom: max(8px, env(safe-area-inset-bottom)) !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-player {',
        '        flex-direction: row !important;',
        '        align-items: center !important;',
        '        justify-content: flex-start !important;',
        '        gap: 10px !important;',
        '        width: 100% !important;',
        '        min-height: 78px !important;',
        '        padding: 14px 12px 12px !important;',
        '        border-radius: 14px !important;',
        '        text-align: left !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-disc {',
        '        flex: 0 0 44px !important;',
        '        width: 44px !important;',
        '        height: 44px !important;',
        '        margin: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-player-info {',
        '        flex: 1 1 auto !important;',
        '        width: auto !important;',
        '        min-width: 0 !important;',
        '        align-items: flex-start !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-subline {',
        '        justify-content: flex-start !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-player-controls {',
        '        flex: 0 0 auto !important;',
        '        flex-wrap: nowrap !important;',
        '        justify-content: flex-end !important;',
        '        width: auto !important;',
        '        gap: 6px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-center-controls {',
        '        position: static !important;',
        '        transform: none !important;',
        '        width: auto !important;',
        '        gap: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-center-controls .player-step-btn,',
        '    html[data-platform="web"] #official-site-music-favorite-btn,',
        '    html[data-platform="web"] #official-site-music-playlist-btn,',
        '    html[data-platform="web"] .official-site-music-volume {',
        '        display: none !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-right-controls {',
        '        display: flex !important;',
        '        width: auto !important;',
        '        margin-left: 0 !important;',
        '        gap: 6px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .official-site-music-right-controls .player-mini-btn {',
        '        width: 34px !important;',
        '        height: 34px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #official-site-music-player-queue {',
        '        bottom: 94px !important;',
        '        max-height: min(420px, calc(100dvh - 130px)) !important;',
        '    }',
        '',
        '    html[data-platform="web"] .Box-row > div[style*="display: flex"] > *,',
        '    html[data-platform="web"] .page-header > div > *,',
        '    html[data-platform="web"] #panel-login div[style*="display: flex"] > * {',
        '        min-width: 0;',
        '    }',
        '',
        '    html[data-platform="web"] #live-list-controls > div,',
        '    html[data-platform="web"] #media-list-controls > div > div {',
        '        flex: 1 1 100% !important;',
        '        width: 100% !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-list-controls button,',
        '    html[data-platform="web"] #media-list-controls button {',
        '        flex: 1 1 100%;',
        '        width: 100%;',
        '    }',
        '',
        '    html[data-platform="web"] .live-card-grid {',
        '        grid-template-columns: repeat(2, minmax(0, 1fr));',
        '        gap: 10px;',
        '    }',
        '',
        '    html[data-platform="web"] .vod-card-row {',
        '        padding: 10px;',
        '        flex-direction: column;',
        '    }',
        '',
        '    html[data-platform="web"] .vod-row-cover-container {',
        '        width: 100%;',
        '        height: auto;',
        '        aspect-ratio: 16 / 9;',
        '    }',
        '',
        '    html[data-platform="web"] .vod-row-info {',
        '        width: 100%;',
        '    }',
        '',
        '    html[data-platform="web"] .vod-row-name {',
        '        font-size: 13px;',
        '        gap: 6px;',
        '    }',
        '',
        '    html[data-platform="web"] .vod-row-title {',
        '        font-size: 12px;',
        '        white-space: normal;',
        '        display: -webkit-box;',
        '        -webkit-box-orient: vertical;',
        '        -webkit-line-clamp: 2;',
        '        line-clamp: 2;',
        '    }',
        '',
        '    html[data-platform="web"] .vod-row-time {',
        '        font-size: 11px;',
        '        flex-wrap: wrap;',
        '    }',
        '',
        '    html[data-platform="web"] #live-player-area {',
        '        min-height: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #danmu-timeline-wrapper {',
        '        flex: 0 0 auto !important;',
        '        height: auto !important;',
        '        min-height: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #danmu-timeline-wrapper > div:first-child {',
        '        flex-wrap: wrap;',
        '    }',
        '',
        '    html[data-platform="web"] #danmu-search-input {',
        '        flex-basis: 100%;',
        '        margin-left: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] .private-message-detail-actions > div:last-child {',
        '        flex-direction: column;',
        '    }',
        '',
        '    html[data-platform="web"] #btn-send-private-message {',
        '        width: 100% !important;',
        '        height: 42px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .photo-card-grid {',
        '        grid-template-columns: 1fr 1fr;',
        '    }',
        '}',
        '',
        '@media (max-width: 380px) {',
        '    html[data-platform="web"] .main-content.home-mode {',
        '        padding: 8px;',
        '    }',
        '',
        '    html[data-platform="web"] .home-panel {',
        '        padding: 10px;',
        '    }',
        '',
        '    html[data-platform="web"] .home-card-grid,',
        '    html[data-platform="web"] .live-card-grid,',
        '    html[data-platform="web"] .photo-card-grid {',
        '        grid-template-columns: 1fr;',
        '    }',
        '',
        '    html[data-platform="web"] .home-card {',
        '        min-height: 58px;',
        '    }',
        '',
        '    html[data-platform="web"] .web-limit-notice {',
        '        padding: 12px 10px;',
        '        font-size: 12px;',
        '    }',
        '',
        '    html[data-platform="web"] #view-media,',
        '    html[data-platform="web"] #view-login,',
        '    html[data-platform="web"] #view-fetch,',
        '    html[data-platform="web"] #view-video-library,',
        '    html[data-platform="web"] #view-flip,',
        '    html[data-platform="web"] #view-open-live,',
        '    html[data-platform="web"] #view-profile,',
        '    html[data-platform="web"] #view-photos,',
        '    html[data-platform="web"] #view-room-album,',
        '    html[data-platform="web"] #view-room-radio,',
        '    html[data-platform="web"] #view-settings,',
        '    html[data-platform="web"] #view-audio-programs,',
        '    html[data-platform="web"] #view-music-library,',
        '    html[data-platform="web"] #view-official-site-music,',
        '    html[data-platform="web"] #view-private-messages,',
        '    html[data-platform="web"] #view-followed-rooms {',
        '        padding: 8px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .Box-row {',
        '        padding: 10px;',
        '    }',
        '',
        '    html[data-platform="web"] .private-message-item {',
        '        max-width: 92%;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages {',
        '        height: auto !important;',
        '        min-height: 100dvh !important;',
        '        overflow: hidden !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-messages-shell {',
        '        height: calc(100dvh - 16px);',
        '        min-height: 0;',
        '        border-radius: 10px;',
        '        flex-direction: column;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-messages-sidebar {',
        '        width: 100%;',
        '        max-height: none;',
        '        flex: 1 1 auto;',
        '        border-right: none;',
        '        border-bottom: none;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages:not(.is-detail-open) .private-messages-panel {',
        '        display: none;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages.is-detail-open .private-messages-sidebar {',
        '        display: none;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages.is-detail-open .private-messages-panel {',
        '        display: flex;',
        '        flex: 1 1 auto;',
        '        min-height: 0;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-messages-sidebar-header {',
        '        padding: 12px;',
        '        flex-direction: column;',
        '        align-items: stretch;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-messages-sidebar-header > div:first-child {',
        '        display: grid !important;',
        '        grid-template-columns: auto minmax(0, 1fr);',
        '        gap: 12px !important;',
        '        width: 100%;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-messages-toolbar-actions {',
        '        width: 100%;',
        '        display: grid;',
        '        grid-template-columns: 1fr;',
        '        gap: 8px;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-messages-toolbar-actions .btn {',
        '        width: 100%;',
        '        height: 38px;',
        '        font-size: 13px;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-message-list {',
        '        padding: 8px 0;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-message-list-item {',
        '        padding: 12px;',
        '        gap: 12px;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-messages-panel-header {',
        '        min-height: 58px;',
        '        padding: 9px 12px;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-message-mobile-back {',
        '        height: 34px;',
        '        padding: 0 10px;',
        '        border: 1px solid var(--border);',
        '        border-radius: 8px;',
        '        background: var(--input-bg);',
        '        color: var(--primary);',
        '        display: inline-flex;',
        '        align-items: center;',
        '        justify-content: center;',
        '        flex-shrink: 0;',
        '        font-size: 13px;',
        '        font-weight: 800;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-message-detail-body {',
        '        padding: 12px;',
        '        gap: 12px;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-message-item {',
        '        max-width: 88%;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-message-bubble {',
        '        padding: 7px 11px 8px;',
        '        line-height: 1.38;',
        '        font-size: 14px;',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-message-detail-actions {',
        '        padding: 10px 12px calc(10px + env(safe-area-inset-bottom));',
        '    }',
        '',
        '    html[data-platform="web"] #view-private-messages .private-message-detail-actions > div:last-child {',
        '        gap: 8px !important;',
        '        margin-bottom: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #private-message-reply-input {',
        '        height: 56px !important;',
        '        min-height: 56px;',
        '        padding: 8px 10px 22px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #btn-send-private-message {',
        '        width: 68px !important;',
        '        height: 56px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #private-message-new-messages {',
        '        bottom: 82px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms {',
        '        height: auto !important;',
        '        min-height: 100dvh !important;',
        '        overflow: hidden !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms > div {',
        '        height: calc(100dvh - 16px) !important;',
        '        min-height: 0 !important;',
        '        border-radius: 10px !important;',
        '        flex-direction: column !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms > div > div:first-child {',
        '        width: 100% !important;',
        '        max-height: none !important;',
        '        flex: 1 1 auto !important;',
        '        min-height: 0 !important;',
        '        border-right: none !important;',
        '        border-bottom: none !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms:not(.is-chat-open) > div > div:last-child {',
        '        display: none !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms.is-chat-open > div > div:first-child {',
        '        display: none !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms.is-chat-open > div > div:last-child {',
        '        display: flex !important;',
        '        flex: 1 1 auto !important;',
        '        min-height: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms > div > div:first-child > div:first-child {',
        '        padding: 12px !important;',
        '        flex-direction: column !important;',
        '        align-items: stretch !important;',
        '        gap: 10px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms > div > div:first-child > div:first-child > div {',
        '        width: 100% !important;',
        '        display: grid !important;',
        '        grid-template-columns: minmax(0, 1fr) auto;',
        '        gap: 8px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #followed-sort-wrapper {',
        '        width: 100% !important;',
        '    }',
        '',
        '    html[data-platform="web"] #followed-rooms-container {',
        '        padding: 8px 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms .session-card {',
        '        margin: 2px 8px 6px !important;',
        '        padding: 12px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #view-followed-rooms > div > div:first-child > div:last-child {',
        '        padding: 10px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #followed-chat-header {',
        '        min-height: 58px;',
        '        padding: 9px 12px !important;',
        '        gap: 8px !important;',
        '        flex-wrap: nowrap !important;',
        '    }',
        '',
        '    html[data-platform="web"] #followed-chat-header > div:first-child {',
        '        margin-right: 0 !important;',
        '        gap: 10px !important;',
        '    }',
        '',
        '    html[data-platform="web"] .followed-chat-mobile-back {',
        '        height: 34px;',
        '        padding: 0 10px;',
        '        border: 1px solid var(--border);',
        '        border-radius: 8px;',
        '        background: var(--input-bg);',
        '        color: var(--primary);',
        '        display: inline-flex;',
        '        align-items: center;',
        '        justify-content: center;',
        '        flex-shrink: 0;',
        '        font-size: 13px;',
        '        font-weight: 800;',
        '    }',
        '',
        '    html[data-platform="web"] #followed-chat-avatar {',
        '        width: 36px !important;',
        '        height: 36px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #followed-chat-header > div:last-child {',
        '        gap: 6px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #btn-toggle-room-type {',
        '        height: 30px !important;',
        '        padding: 0 8px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #btn-toggle-followed-mode {',
        '        width: 72px !important;',
        '        height: 30px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #followed-chat-messages {',
        '        padding: 12px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-player-area {',
        '        min-height: 170px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-player-view,',
        '    html[data-platform="web"] #player-split-layout,',
        '    html[data-platform="web"] #player-right-column,',
        '    html[data-platform="web"] #player-combo-wrapper,',
        '    html[data-platform="web"] #danmu-timeline-wrapper,',
        '    html[data-platform="web"] #clip-toolbar {',
        '        width: 100% !important;',
        '        max-width: 100% !important;',
        '        min-width: 0 !important;',
        '        box-sizing: border-box !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-player-view {',
        '        min-height: 0 !important;',
        '        gap: 12px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-player-view > div:first-child {',
        '        margin: 10px 0 2px !important;',
        '        padding: 12px !important;',
        '        border-radius: 10px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-player-view > div:first-child > div:first-child {',
        '        display: grid !important;',
        '        grid-template-columns: minmax(0, 1fr) auto;',
        '        align-items: center !important;',
        '        gap: 12px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-player-view > div:first-child > div:first-child > div:first-child {',
        '        display: grid !important;',
        '        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);',
        '        gap: 14px 18px !important;',
        '        min-width: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #current-live-author,',
        '    html[data-platform="web"] #current-live-title,',
        '    html[data-platform="web"] #current-live-date,',
        '    html[data-platform="web"] #current-live-time {',
        '        display: block !important;',
        '        min-width: 0 !important;',
        '        overflow: hidden !important;',
        '        text-overflow: ellipsis !important;',
        '        white-space: nowrap !important;',
        '    }',
        '',
        '    html[data-platform="web"] #player-split-layout {',
        '        flex: none !important;',
        '        height: auto !important;',
        '        overflow: visible !important;',
        '    }',
        '',
        '    html[data-platform="web"] #player-right-column {',
        '        margin: 0 !important;',
        '        padding: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #player-combo-wrapper {',
        '        height: auto !important;',
        '        width: 100% !important;',
        '        max-width: 100% !important;',
        '        margin: 0 !important;',
        '        border-radius: 8px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #live-player-area {',
        '        width: 100% !important;',
        '        height: min(68vh, 720px) !important;',
        '        height: min(68svh, 720px) !important;',
        '        max-height: none !important;',
        '        min-height: 0 !important;',
        '        aspect-ratio: auto !important;',
        '        background: #000 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #clip-toolbar {',
        '        padding: 12px !important;',
        '        border-radius: 10px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #clip-toolbar > div {',
        '        display: flex !important;',
        '        flex-direction: column !important;',
        '        align-items: stretch !important;',
        '        gap: 12px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #clip-toolbar > div > div:first-child {',
        '        display: grid !important;',
        '        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);',
        '        gap: 10px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #clip-start-display,',
        '    html[data-platform="web"] #clip-end-display {',
        '        min-width: 0 !important;',
        '        padding: 0 8px !important;',
        '        font-size: 13px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #clip-toolbar > div > div:last-child {',
        '        display: flex !important;',
        '        flex-direction: row !important;',
        '        align-items: center !important;',
        '        justify-content: space-between !important;',
        '        width: 100% !important;',
        '    }',
        '',
        '    html[data-platform="web"] #clip-duration-display {',
        '        width: auto !important;',
        '        text-align: left !important;',
        '        white-space: nowrap !important;',
        '    }',
        '',
        '    html[data-platform="web"] #btn-do-clip {',
        '        width: 132px !important;',
        '        max-width: 45% !important;',
        '    }',
        '',
        '    html[data-platform="web"] #danmu-timeline-wrapper {',
        '        flex: 0 0 auto !important;',
        '        height: auto !important;',
        '        max-height: none !important;',
        '        min-height: 0 !important;',
        '        --col-seq: 0px !important;',
        '        --col-time: 112px !important;',
        '        --col-name: 90px !important;',
        '        --col-act: 72px !important;',
        '    }',
        '',
        '    html[data-platform="web"] #danmu-timeline-wrapper > div:nth-child(2) > div:first-child,',
        '    html[data-platform="web"] #danmu-list-body .danmu-row > div:first-child {',
        '        display: none !important;',
        '    }',
        '',
        '    html[data-platform="web"] #danmu-timeline-wrapper > div:nth-child(2) > div:nth-child(2),',
        '    html[data-platform="web"] #danmu-list-body .danmu-row > div:nth-child(2) {',
        '        margin-left: 0 !important;',
        '    }',
        '',
        '    html[data-platform="web"] #danmu-list-body {',
        '        flex: 0 1 auto !important;',
        '        height: auto !important;',
        '        max-height: min(42dvh, 420px) !important;',
        '        overflow-y: auto !important;',
        '    }',
        '}',
        ''
    ].join('\n'));
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

[
    'index.html',
    'style.css',
    'web-icon.png',
    '2.wasm',
    'rust-wasm-browser.js'
].forEach(copyFile);

copyDir('src/renderer');
copyDir('src/web');

applyWebTransforms();
replaceInWebTextFiles('');

console.log(`Web assets copied to ${outputDir}`);
