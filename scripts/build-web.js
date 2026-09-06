const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');

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
    await esbuild.build({
        entryPoints: [path.join(projectRoot, 'src', 'renderer', 'media-vendor-loader.js')],
        outfile: outputPath,
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
    });
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
        block.matchAll(/src="\.\/(src\/renderer\/[^"?]+\.js)"/g),
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

    const featurePaths = paths.slice(1, -1);
    const targetChunkBytes = 280 * 1024;
    const featureChunks = [];
    let currentChunk = [];
    let currentChunkBytes = 0;
    featurePaths.forEach((relativePath) => {
        const source = readRendererSource(relativePath);
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
    const lazyBrowserShimTag = `    <script src="./src/web/browser-shim.js?v=__YAYA_BUILD_VERSION__" data-media-vendors-url="./${versionedRelativePath}"></script>`;
    return indexHtml
        .replace(/^[ \t]*<script src="\.\/src\/renderer\/vendor\/media-vendors\.js\?v=__YAYA_BUILD_VERSION__"><\/script>\r?\n/m, '')
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

async function buildWebAssets() {
    await buildDesktopRuntime();
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });
    ['index.html', 'style.css', 'web-icon.png', '2.wasm', 'rust-wasm-browser.js']
        .forEach((relativePath) => copyFile(relativePath));
    copyFile('web-icon.png', 'icon.png');
    copyDir('src/renderer');
    copyDir('src/web');
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
    indexHtml = configureLazyWebMediaVendors(indexHtml);
    indexHtml = await bundleRenderer(indexHtml);
    indexHtml = versionWebIndexAssets(indexHtml, buildVersion);
    fs.writeFileSync(indexPath, indexHtml, 'utf8');
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
    console.log(`Web assets built with esbuild (${buildVersion}) at ${outputDir}`);
}

const buildTask = buildDesktopRuntimeOnly ? buildDesktopRuntime() : buildWebAssets();
buildTask
    .then(() => console.log(buildDesktopRuntimeOnly ? 'Local runtime assets built' : 'Web build completed'))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
