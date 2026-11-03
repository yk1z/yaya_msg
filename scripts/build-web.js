const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const { brotliCompressSync, gzipSync, constants: zlibConstants } = require('zlib');

const scopeDatabaseTailwind = {
    postcssPlugin: 'scope-database-tailwind',
    Rule(rule) {
        if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name || '')) return;
        rule.selectors = rule.selectors.flatMap((selector) => {
            const trimmed = selector.trim();
            if (!trimmed || trimmed.startsWith('#database-root')) return [trimmed];
            if ([':root', 'html', ':host', 'body'].includes(trimmed)) return ['#database-root'];
            if (trimmed === '*') return ['#database-root', '#database-root *'];
            if (trimmed === ':before' || trimmed === ':after') {
                return [`#database-root${trimmed}`, `#database-root *${trimmed}`];
            }
            if (trimmed === '::backdrop') return ['#database-root::backdrop'];
            return [`#database-root ${trimmed}`];
        });
    }
};

const projectRoot = path.join(__dirname, '..');
const outputDir = path.join(projectRoot, 'web-dist');
const buildDesktopRuntimeOnly = process.argv.includes('--database-runtime-only')
    || process.argv.includes('--desktop-runtime-only');
// Web keeps only API-shaped placeholders for features whose routes are disabled.
const excludedWebFeatureFactories = new Map([
    ['src/renderer/private-messages-feature.js', 'createPrivateMessagesFeature'],
    ['src/renderer/room-radio-feature.js', 'createRoomRadioFeature'],
    ['src/renderer/live-gift-feature.js', 'createLiveGiftFeature']
]);
const excludedWebScripts = new Set([
    'src/renderer/invoice-feature.js', 'src/renderer/pocket-social-login-feature.js',
    'src/renderer/deep-link-feature.js', 'src/renderer/desktop-live-gift-animation.js',
    'src/renderer/desktop-cloud-home-feature.js',
    'src/renderer/private-message-notifications.js',
    'src/renderer/desktop-navigation-feature.js',
    'src/common/deep-link.js'
]);

function webFeatureSource(relativePath, source) {
    const factory = excludedWebFeatureFactories.get(relativePath);
    if (!factory) return source;
    const original = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    const returned = [...original.matchAll(/return\s*\{\s*([A-Za-z\s,]+)\s*\};/g)].at(-1);
    const methods = returned?.[1].split(',').map(name => name.trim()).filter(Boolean);
    if (!methods?.length || methods.some(name => !/^[A-Za-z]\w*$/.test(name))) {
        throw new Error(`Cannot preserve disabled web feature API: ${relativePath}`);
    }
    return `window.YayaRendererFeatures.${factory}=function(){return {${methods.map(name => `${name}(){}`).join(',')}};};`;
}

function copyFile(relativePath, targetRelativePath = relativePath) {
    const source = path.join(projectRoot, relativePath);
    const target = path.join(outputDir, targetRelativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

function copyDir(relativePath) {
    const sourceDir = path.join(projectRoot, relativePath);
    if (!fs.existsSync(sourceDir)) return;
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const child = path.join(relativePath, entry.name);
        if (entry.isDirectory()) copyDir(child);
        if (entry.isFile()) copyFile(child);
    }
}

function collectFiles(relativePath) {
    const absolutePath = path.join(projectRoot, relativePath);
    if (!fs.existsSync(absolutePath)) return [];
    const stat = fs.statSync(absolutePath);
    if (stat.isFile()) return [absolutePath];
    return fs.readdirSync(absolutePath, { withFileTypes: true })
        .flatMap((entry) => collectFiles(path.join(relativePath, entry.name)));
}

function getBuildVersion() {
    const hash = crypto.createHash('sha256');
    [
        'index.html',
        'style.css',
        'scripts/build-web.js',
        'src/renderer',
        'src/web',
        'rust-wasm-browser.js'
    ].flatMap(collectFiles).sort().forEach((filePath) => {
        hash.update(path.relative(projectRoot, filePath));
        hash.update(fs.readFileSync(filePath));
    });
    return hash.digest('hex').slice(0, 12);
}

function getContentVersion(content) {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function getFileVersion(filePath) {
    return getContentVersion(fs.readFileSync(filePath));
}

async function buildDatabaseRuntime(sourcePath, runtimePath, banner) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    if (!source.trim()) throw new Error('数据库 JSX 脚本不存在');

    const result = await esbuild.build({
        stdin: {
            contents: source,
            loader: 'jsx',
            resolveDir: path.dirname(sourcePath),
            sourcefile: path.basename(sourcePath)
        },
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: ['es2020'],
        jsx: 'automatic',
        write: false,
        logLevel: 'silent',
        define: {
            'process.env.NODE_ENV': '"production"'
        }
    });
    const output = result.outputFiles?.[0]?.text;
    if (!output) throw new Error('esbuild 未生成数据库运行时');
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
    fs.writeFileSync(runtimePath, `${banner}\n${output}`, 'utf8');
}

async function buildMediaVendors() {
    const outputPath = path.join(projectRoot, 'src', 'renderer', 'vendor', 'media-vendors.js');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await Promise.all([
        ['media-vendor-loader.js', 'media-vendors.js'],
        ['player-vendor-loader.js', 'player-vendors.js'],
        ['pinyin-vendor-loader.js', 'pinyin-vendor.js']
    ].map(([entry, output]) => esbuild.build({
        entryPoints: [path.join(projectRoot, 'src', 'renderer', entry)],
        outfile: path.join(path.dirname(outputPath), output),
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['es2020'],
        minify: true,
        legalComments: 'none',
        logLevel: 'silent',
        define: {
            'process.env.NODE_ENV': '"production"'
        }
    })));
}

async function buildDatabaseTailwind() {
    const outputPath = path.join(projectRoot, 'src', 'renderer', 'database', 'tailwind.css');
    const result = await postcss([
        tailwindcss({
            content: [
                path.join(projectRoot, 'src', 'renderer', 'database', 'app.jsx'),
                path.join(projectRoot, 'src', 'renderer', 'database', 'index.html')
            ],
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        gray: { 750: '#2d3748', 850: '#1a202c', 950: '#0d1117' },
                        gold: { 500: '#EAB308', 100: '#FEF9C3' },
                        silver: { 500: '#94A3B8', 100: '#F1F5F9' },
                        bronze: { 500: '#B45309', 100: '#FFEDD5' }
                    }
                }
            }
        }),
        scopeDatabaseTailwind
    ]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
    const minified = await esbuild.transform(result.css, { loader: 'css', minify: true });
    fs.writeFileSync(outputPath, minified.code, 'utf8');
}

function copyDesktopVendorFiles() {
    const source = path.join(projectRoot, 'node_modules', '@yxim', 'nim-web-sdk', 'dist', 'SDK', 'NIM_Web_Chatroom.js');
    const target = path.join(projectRoot, 'src', 'renderer', 'vendor', 'NIM_Web_Chatroom.js');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

async function buildDesktopRuntime() {
    await buildDatabaseRuntime(
        path.join(projectRoot, 'src', 'renderer', 'database', 'app.jsx'),
        path.join(projectRoot, 'src', 'renderer', 'database', 'runtime.js'),
        '// Generated with esbuild by scripts/build-web.js --database-runtime-only. Do not edit directly.'
    );
    await Promise.all([buildMediaVendors(), buildDatabaseTailwind()]);
    copyDesktopVendorFiles();
}

function getRendererBundlePaths(indexHtml) {
    const startMarker = '<script src="./src/renderer/bootstrap-shared.js"></script>';
    const endMarker = '<script src="./src/renderer/app-legacy.js"></script>';
    const startIndex = indexHtml.indexOf(startMarker);
    const endMarkerIndex = indexHtml.indexOf(endMarker);
    if (startIndex < 0 || endMarkerIndex < startIndex) {
        throw new Error('Web renderer bundle script block not found');
    }
    const endIndex = endMarkerIndex + endMarker.length;
    const block = indexHtml.slice(startIndex, endIndex);
    const paths = Array.from(
        block.matchAll(/src="\.\/(src\/(?:renderer|common)\/[^"?]+\.js)"/g),
        (match) => match[1]
    );
    return { startIndex, endIndex, paths };
}

async function writeRendererChunk(label, source, options = {}) {
    const preserveTopLevelNames = options.preserveTopLevelNames === true;
    const result = await esbuild.transform(source, {
        loader: 'js',
        target: 'es2020',
        minify: !preserveTopLevelNames,
        minifyIdentifiers: !preserveTopLevelNames,
        minifySyntax: true,
        minifyWhitespace: true,
        legalComments: 'none',
        sourcefile: `${label}.js`
    });
    const chunkName = `${label}.${getContentVersion(result.code)}.js`;
    const chunkRelativePath = path.join('src', 'renderer', chunkName);
    fs.writeFileSync(path.join(outputDir, chunkRelativePath), result.code, 'utf8');
    return `<script defer src="./src/renderer/${chunkName}"></script>`;
}

async function bundleRenderer(indexHtml) {
    const { startIndex, endIndex, paths } = getRendererBundlePaths(indexHtml);
    const bootstrapPath = paths[0];
    const appLegacyPath = paths[paths.length - 1];
    if (!bootstrapPath.endsWith('/bootstrap-shared.js') || !appLegacyPath.endsWith('/app-legacy.js')) {
        throw new Error('Unexpected web renderer bundle boundaries');
    }

    const readRendererSource = (relativePath) => fs.readFileSync(path.join(outputDir, relativePath), 'utf8');
    const tags = [];
    tags.push(await writeRendererChunk(
        'web-bootstrap',
        readRendererSource(bootstrapPath),
        { preserveTopLevelNames: true }
    ));

    const featurePaths = paths.slice(1, -1).filter(relativePath => !excludedWebScripts.has(relativePath));
    const targetChunkBytes = 280 * 1024;
    const featureChunks = [];
    let currentChunk = [];
    let currentChunkBytes = 0;
    featurePaths.forEach((relativePath) => {
        const source = webFeatureSource(relativePath, readRendererSource(relativePath));
        const sourceBytes = Buffer.byteLength(source);
        if (currentChunk.length && currentChunkBytes + sourceBytes > targetChunkBytes) {
            featureChunks.push(currentChunk);
            currentChunk = [];
            currentChunkBytes = 0;
        }
        currentChunk.push({ relativePath, source });
        currentChunkBytes += sourceBytes;
    });
    if (currentChunk.length) featureChunks.push(currentChunk);

    for (let index = 0; index < featureChunks.length; index += 1) {
        const source = featureChunks[index]
            .map(({ relativePath, source: fileSource }) => `// ${relativePath}\n${fileSource}\n;`)
            .join('\n');
        tags.push(await writeRendererChunk(`web-features-${index + 1}`, source));
    }

    tags.push(await writeRendererChunk('web-app-core', readRendererSource(appLegacyPath)));
    return indexHtml.slice(0, startIndex) + tags.join('\n    ') + indexHtml.slice(endIndex);
}

function configureLazyWebMediaVendors(indexHtml) {
    const mediaVendorsPath = path.join(outputDir, 'src', 'renderer', 'vendor', 'media-vendors.js');
    const mediaVendorsVersion = getFileVersion(mediaVendorsPath);
    const versionedRelativePath = `src/renderer/vendor/media-vendors.${mediaVendorsVersion}.js`;
    fs.copyFileSync(mediaVendorsPath, path.join(outputDir, versionedRelativePath));

    const browserShimTag = '    <script src="./src/web/browser-shim.js?v=__YAYA_BUILD_VERSION__"></script>';
    const lazyBrowserShimTag = `    <script src="./src/web/member-room-client.js?v=__YAYA_BUILD_VERSION__"></script>
    <script src="./src/web/browser-shim.js?v=__YAYA_BUILD_VERSION__" data-media-vendors-url="./${versionedRelativePath}"></script>`;
    return indexHtml
        .replace(/^[ \t]*<script src="\.\/src\/renderer\/vendor\/media-vendors\.js\?v=__YAYA_BUILD_VERSION__"><\/script>\r?\n/m, '')
        .replace(/^[ \t]*<script src="\.\/src\/renderer\/(?:vendor\/pinyin-vendor|desktop-media-loader)\.js\?v=__YAYA_BUILD_VERSION__"><\/script>\r?\n/gm, '')
        .replace(browserShimTag, lazyBrowserShimTag);
}

function configureWebDocumentBase(indexHtml) {
    if (/<base\s/i.test(indexHtml)) return indexHtml;
    const headTag = '<head>';
    if (!indexHtml.includes(headTag)) {
        throw new Error('Web index head tag not found');
    }
    return indexHtml.replace(headTag, `${headTag}\n    <base href="/">`);
}

function configureSolidWebBackground(indexHtml) {
    const defaultBackgroundSource = ' src="https://data.gnz.hk/assets/default-background.jpg?v=20260829"';
    const rendererThemeTag = '    <script src="./src/renderer/theme-init.js?v=__YAYA_BUILD_VERSION__"></script>';
    const webThemeTag = '    <script src="./src/web/solid-background.js?v=__YAYA_BUILD_VERSION__"></script>';
    if (!indexHtml.includes(defaultBackgroundSource) || !indexHtml.includes(rendererThemeTag)) {
        throw new Error('Web background bootstrap anchors not found');
    }
    return indexHtml
        .replace(defaultBackgroundSource, '')
        .replace(rendererThemeTag, webThemeTag);
}

function configureWebContentSecurityPolicy(indexHtml) {
    const originalPolicy = "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' file: https: data: blob:; media-src 'self' file: https: http: data: blob:; connect-src 'self' file: https: http: ws: wss: data: blob:; font-src 'self' data:;";
    const webPolicy = "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.dingxiang-inc.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; img-src 'self' file: https: data: blob:; media-src 'self' file: https: http: data: blob:; connect-src 'self' file: https: http: ws: wss: data: blob:; font-src 'self' data: https://fonts.gstatic.com; frame-src https://*.dingxiang-inc.com; form-action 'self';";
    if (!indexHtml.includes(originalPolicy)) {
        throw new Error('Web Content Security Policy block not found');
    }
    return indexHtml.replace(originalPolicy, webPolicy);
}

function configureEarlyWebLocale(indexHtml) {
    const titleTag = '    <title>牙牙消息</title>';
    if (!indexHtml.includes(titleTag)) {
        throw new Error('Web document title tag not found');
    }
    const localeAssets = Object.fromEntries(['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ko', 'ja'].map(locale => {
        const asset = `src/web/i18n/${locale}.js`;
        return [locale, `./${asset}?v=${getFileVersion(path.join(outputDir, asset))}`];
    }));
    const bootstrap = `    <title></title>
    <script>
        (() => {
            window.YayaLocaleAssets = ${JSON.stringify(localeAssets)};
            const normalizeLocale = (value) => {
                const locale = String(value || '').trim().replace('_', '-');
                if (/^zh-(?:Hant-)?(?:HK|MO)$/i.test(locale)) return 'zh-HK';
                if (/^zh-(?:Hant-)?TW$/i.test(locale) || /^zh-Hant/i.test(locale)) return 'zh-TW';
                if (/^zh/i.test(locale)) return 'zh-CN';
                if (/^en/i.test(locale)) return 'en';
                if (/^ko/i.test(locale)) return 'ko';
                if (/^ja/i.test(locale)) return 'ja';
                return '';
            };
            let urlLocale = '';
            let storedLocale = '';
            try {
                urlLocale = normalizeLocale(new URL(window.location.href).searchParams.get('lang'));
                storedLocale = normalizeLocale(window.localStorage.getItem('yaya_web_locale_v1'));
            } catch (_) {
                // Storage can be unavailable in restricted browsing modes.
            }
            const locale = urlLocale
                || storedLocale
                || normalizeLocale(document.documentElement.dataset.geoLocale)
                || normalizeLocale(navigator.languages?.[0] || navigator.language)
                || 'zh-CN';
            const titles = {
                'zh-CN': '牙牙消息',
                'zh-HK': '牙牙消息',
                'zh-TW': '牙牙訊息',
                en: 'yaya msg',
                ko: 'yaya msg',
                ja: 'yaya msg'
            };
            document.documentElement.dataset.initialLocale = locale;
            document.documentElement.dataset.platform = 'web';
            document.documentElement.classList.add('web-shell-pending');
            document.documentElement.lang = locale;
            if (locale !== 'zh-CN') document.documentElement.classList.add('web-i18n-pending');
            document.title = titles[locale] || titles['zh-CN'];
            if (locale !== 'zh-CN') {
                const preload = document.createElement('link');
                preload.rel = 'preload';
                preload.as = 'script';
                preload.href = window.YayaLocaleAssets[locale];
                document.head.appendChild(preload);
            }
        })();
    </script>`;
    return indexHtml.replace(titleTag, bootstrap);
}

function configureWebLocalePacks(indexHtml) {
    const shellTag = '    <script src="./src/web/web-shell.js?v=__YAYA_BUILD_VERSION__"></script>';
    const homeTag = '    <script src="./src/web/pocket-home.js?v=__YAYA_BUILD_VERSION__"></script>';
    if (!indexHtml.includes(shellTag) || !indexHtml.includes(homeTag)) {
        throw new Error('Web locale script anchors not found');
    }
    const packTags = ['zh-CN']
        .map((locale) => `    <script src="./src/web/i18n/${locale}.js?v=__YAYA_BUILD_VERSION__"></script>`)
        .join('\n');
    const translatorTag = '    <script src="./src/web/i18n/page-translator.js?v=__YAYA_BUILD_VERSION__"></script>';
    return indexHtml
        .replace(shellTag, `${packTags}\n${shellTag}`)
        .replace(homeTag, `${homeTag}\n${translatorTag}`);
}

// Keep classic-script order while letting the browser fetch the entire startup
// chain in parallel. The tiny theme bootstrap stays synchronous to avoid flashing.
function configureDeferredWebScripts(indexHtml) {
    return indexHtml.replace(/<script\b([^>]*\bsrc="([^"]+)"[^>]*)>/g, (tag, attributes, source) => {
        if (/(?:\b(?:defer|async)(?:\s|=|$)|\btype\s*=)/.test(attributes)
            || source.includes('/solid-background.js')) return tag;
        return `<script defer${attributes}>`;
    }).replace("const platform = (window.desktop && window.desktop.platform) || '';",
        "const platform = (window.desktop && window.desktop.platform) || document.documentElement.dataset.platform || '';"
    );
}

async function optimizeWebTextAssets() {
    // Optimize only the web copies; the desktop sources keep their current form.
    const assets = ['style.css', ...collectFiles('src/web'), ...collectFiles('src/renderer')]
        .map(file => path.isAbsolute(file) ? path.relative(projectRoot, file) : file)
        .filter(file => /\.(?:js|css)$/.test(file));
    for (const relativePath of assets) {
        const target = path.join(outputDir, relativePath);
        if (!fs.existsSync(target)) continue;
        let source = fs.readFileSync(target, 'utf8');
        if (relativePath.replaceAll('\\', '/') === 'src/web/pocket-home.css') {
            source = source.replace(/^@import[^;]+;\s*/, '');
        }
        if (relativePath.replaceAll('\\', '/') === 'src/web/vendor/phosphor/style.css') {
            source = source.replace('font-display: block', 'font-display: swap');
        }
        const result = await esbuild.transform(source, {
            loader: relativePath.endsWith('.css') ? 'css' : 'js',
            minifyWhitespace: true,
            // Some legacy scripts share top-level names across files.
            minifyIdentifiers: false,
            minifySyntax: false,
            legalComments: 'none'
        });
        fs.writeFileSync(target, result.code);
    }
}

function precompressWebAssets() {
    const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(target) : [target];
    });
    for (const target of walk(outputDir).filter(file => /\.(?:js|css)$/.test(file))) {
        const source = fs.readFileSync(target);
        if (source.length < 1024) continue;
        fs.writeFileSync(`${target}.br`, brotliCompressSync(source, {
            params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 }
        }));
        fs.writeFileSync(`${target}.gz`, gzipSync(source));
    }
}

function versionWebIndexAssets(indexHtml, fallbackVersion) {
    const versionedReference = /((?:src|href)="\.\/|(?:src|href)=")([^"?]+)\?v=__YAYA_BUILD_VERSION__(")/g;
    const withPerFileVersions = indexHtml.replace(versionedReference, (match, prefix, assetPath, suffix) => {
        const relativePath = assetPath.replace(/^\.\//, '').replaceAll('/', path.sep);
        const filePath = path.join(outputDir, relativePath);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return match;
        return `${prefix}${assetPath}?v=${getFileVersion(filePath)}${suffix}`;
    });
    return withPerFileVersions.replaceAll('__YAYA_BUILD_VERSION__', fallbackVersion);
}

function configureWebHomeMarkup(indexHtml) {
    const links = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/web/home-links.json'), 'utf8'));
    links.forEach(({ title, description, url }) => {
        if (!title || !description || new URL(url).protocol !== 'https:') {
            throw new Error('Invalid Web homepage link');
        }
    });
    const start = indexHtml.indexOf('<div id="view-home"');
    const end = indexHtml.indexOf('<div id="view-followed-rooms"', start);
    if (start < 0 || end < 0) throw new Error('Web homepage boundaries not found');
    // The Web homepage owns its components; no desktop homepage markup is shipped.
    const data = JSON.stringify(links).replace(/</g, '\\u003c');
    const home = `<div id="view-home" class="web-home-view">
                <script type="application/json" id="web-home-links">${data}</script>
            </div>\n\n            `;
    return indexHtml.slice(0, start) + home + indexHtml.slice(end);
}

function configureWebDesktopDownload(indexHtml) {
    const shell = fs.readFileSync(path.join(projectRoot, 'src/web/web-shell.js'), 'utf8');
    const version = shell.match(/const DESKTOP_VERSION = '([^']+)'/)[1];
    const stamp = shell.match(/Windows: '([^']+)'/)[1];
    const href = `https://gnz.hk/downloads/yaya_msg-${version}-win.exe?v=${stamp}`;
    const pattern = /(<span id="sms-limit-download-links">[\s\S]*?\bhref=")[^"]+/g;
    if ([...indexHtml.matchAll(pattern)].length !== 1) throw new Error('Desktop download fallback link not found');
    return indexHtml.replace(pattern, (_, prefix) => prefix + href);
}

async function buildWebAssets() {
    await buildDesktopRuntime();
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });
    ['index.html', 'style.css', 'web-icon.png', '2.wasm', 'rust-wasm-browser.js', '_headers']
        .forEach((relativePath) => copyFile(relativePath));
    copyFile('web-icon.png', 'icon.png');
    copyDir('src/renderer');
    copyDir('src/web');
    copyFile('src/common/sender-profile.js');
    copyFile('src/common/gift-pricing.js');
    copyFile('src/common/gift-prices.snapshot.js');
    copyFile('src/common/message-room-filter.js');
    copyFile('src/common/deep-link.js');
    copyFile('src/common/pocket-registration.js');
    copyFile('src/common/netface-model.js');
    copyFile('src/web/yk1z-home-feature.js', 'src/renderer/yk1z-home-feature.js');
    copyFile('src/web/service-worker.js', 'service-worker.js');
    copyFile('node_modules/@ffmpeg/ffmpeg/dist/ffmpeg.min.js', 'src/renderer/vendor/ffmpeg/ffmpeg.min.js');
    copyFile('node_modules/@ffmpeg/core/dist/ffmpeg-core.js', 'src/renderer/vendor/ffmpeg/ffmpeg-core.js');
    copyFile('node_modules/@ffmpeg/core/dist/ffmpeg-core.wasm', 'src/renderer/vendor/ffmpeg/ffmpeg-core.wasm');
    copyFile('node_modules/@ffmpeg/core/dist/ffmpeg-core.worker.js', 'src/renderer/vendor/ffmpeg/ffmpeg-core.worker.js');

    await buildDatabaseRuntime(
        path.join(projectRoot, 'src', 'renderer', 'database', 'app.jsx'),
        path.join(outputDir, 'src', 'renderer', 'database', 'runtime.js'),
        '// Generated with esbuild by scripts/build-web.js. Do not edit web-dist output directly.'
    );

    const { prepareWebIconAssets, versionWebStaticDependencies } = require('./web-icon-assets.cjs');
    prepareWebIconAssets(projectRoot, outputDir);
    const staticDependencies = versionWebStaticDependencies(outputDir);
    await optimizeWebTextAssets();

    const buildVersion = getBuildVersion();
    const onlineAssetDir = path.join(outputDir, 'src', 'web');
    const onlineCssPath = path.join(onlineAssetDir, 'online.css');
    const presenceScriptPath = path.join(onlineAssetDir, 'presence-feature.js');
    if (fs.existsSync(onlineCssPath)) {
        fs.copyFileSync(onlineCssPath, path.join(onlineAssetDir, `online.${buildVersion}.css`));
    }
    if (fs.existsSync(presenceScriptPath)) {
        fs.copyFileSync(
            presenceScriptPath,
            path.join(onlineAssetDir, `presence-feature.${buildVersion}.js`)
        );
    }
    const indexPath = path.join(outputDir, 'index.html');
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    indexHtml = configureWebDocumentBase(indexHtml);
    indexHtml = configureSolidWebBackground(indexHtml);
    indexHtml = configureWebContentSecurityPolicy(indexHtml);
    indexHtml = configureEarlyWebLocale(indexHtml);
    indexHtml = configureWebLocalePacks(indexHtml);
    indexHtml = configureWebHomeMarkup(indexHtml);
    indexHtml = configureWebDesktopDownload(indexHtml);
    indexHtml = configureLazyWebMediaVendors(indexHtml);
    indexHtml = await bundleRenderer(indexHtml);
    indexHtml = indexHtml.replace(/^[ \t]*<script\b[^>]*src="\.\/([^"?]+)(?:\?[^"]*)?"[^>]*><\/script>\r?\n/gm,
        (tag, relativePath) => excludedWebScripts.has(relativePath) ? '' : tag);
    for (const relativePath of [...excludedWebScripts, ...excludedWebFeatureFactories.keys()]) {
        fs.rmSync(path.join(outputDir, relativePath), { force: true });
    }
    indexHtml = configureDeferredWebScripts(indexHtml);
    indexHtml = indexHtml.replace('<link rel="stylesheet" href="./src/web/pocket-home.css',
        `<link rel="stylesheet" href="./src/web/vendor/phosphor/style.css?v=__YAYA_BUILD_VERSION__">\n    <link rel="preload" as="image" href="${staticDependencies.poster}">\n    <link rel="stylesheet" href="./src/web/pocket-home.css`);
    indexHtml = versionWebIndexAssets(indexHtml, buildVersion);
    fs.writeFileSync(indexPath, indexHtml, 'utf8');
    const statusPath = path.join(outputDir, 'src', 'web', 'status-page.txt');
    if (fs.existsSync(statusPath)) {
        const { STATUS_SERVICES, STATUS_HISTORY } = await import('../workers/api-status.mjs');
        const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[char]);
        const bars = '<span class="day-bar" data-state="unknown" aria-hidden="true"></span>'
            .repeat(STATUS_HISTORY.days * 24 / STATUS_HISTORY.intervalHours);
        const placeholder = [...new Set(STATUS_SERVICES.map(service => service.group))].map(group =>
            `<section class="service-group"><h3 class="group-title">${escapeHtml(group)}</h3>`
            + STATUS_SERVICES.filter(service => service.group === group).map(service =>
                `<article class="service"><button class="service-toggle" type="button" disabled aria-expanded="false">`
                + `<span class="service-name"><span class="chevron">›</span><span>${escapeHtml(service.name)}</span></span>`
                + '<span class="service-state" data-state="unknown"><span class="status-dot" data-state="unknown"></span><span>暂无请求记录</span></span></button>'
                + `<div class="history-bars" role="group" aria-label="${escapeHtml(service.name)}最近${STATUS_HISTORY.days}天历史，每格${STATUS_HISTORY.intervalHours}小时">${bars}</div>`
                + `<div class="history-caption"><span>${STATUS_HISTORY.days} 天前</span><span>现在</span></div></article>`
            ).join('') + '</section>'
        ).join('');
        const statusHtml = fs.readFileSync(statusPath, 'utf8').replace('<!-- STATUS_SERVICE_PLACEHOLDER -->', placeholder);
        fs.writeFileSync(statusPath, versionWebIndexAssets(statusHtml, buildVersion), 'utf8');
    }
    const onlinePath = path.join(outputDir, 'src', 'web', 'online-page.txt');
    if (fs.existsSync(onlinePath)) {
        const onlineHtml = fs.readFileSync(onlinePath, 'utf8')
            .replaceAll('__YAYA_BUILD_VERSION__', buildVersion);
        fs.writeFileSync(onlinePath, onlineHtml, 'utf8');
        fs.writeFileSync(
            path.join(outputDir, 'src', 'web', 'online-page-admin-layout-v5.txt'),
            onlineHtml,
            'utf8'
        );
    }
    precompressWebAssets();
    console.log(`Web assets built with esbuild (${buildVersion}) at ${outputDir}`);
}

async function prepareGiftPriceSnapshot() {
    const syncScript = path.join(__dirname, 'sync-gift-price-catalog.mjs');
    const localCatalog = path.join(projectRoot, 'server', 'gift', 'prices.json');
    if (fs.existsSync(syncScript) && fs.existsSync(localCatalog)) {
        const module = await import('./sync-gift-price-catalog.mjs');
        module.syncGiftPriceCatalog();
    } else {
        // Public checkouts use the committed catalogue; private server sources are optional.
        const snapshot = require('../src/common/gift-prices.snapshot');
        require('../src/common/gift-pricing').validateSnapshot(snapshot);
    }
}

const buildTask = prepareGiftPriceSnapshot()
    .then(() => buildDesktopRuntimeOnly ? buildDesktopRuntime() : buildWebAssets());
buildTask
    .then(() => console.log(buildDesktopRuntimeOnly ? 'Local runtime assets built' : 'Web build completed'))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
