'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { unzipSync } = require('fflate');
const { getStoragePaths } = require('../../common/storage-paths');

const MAX_DOWNLOAD = 32 * 1024 * 1024;
const MAX_EXPANDED = 128 * 1024 * 1024;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

function normalizeGiftAssetUrl(value) {
    const url = new URL(String(value || ''), 'https://source.48.cn/');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port
        || !(url.hostname === '48.cn' || url.hostname.endsWith('.48.cn')) || !/\.(zip|pag|json)$/i.test(url.pathname)) {
        throw new Error('无效的官方礼物动画地址');
    }
    url.protocol = 'https:';
    return url.href;
}

function imageDataUrl(name, bytes) {
    const ext = path.posix.extname(name).slice(1).toLowerCase();
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${Buffer.from(bytes).toString('base64')}`;
}

function decodeGiftPackage(bytes, pathname = '') {
    const input = new Uint8Array(bytes);
    if (Buffer.from(input.subarray(0, 3)).toString() === 'PAG') return { type: 'pag', bytes: input };
    let files;
    if (/\.json$/i.test(pathname)) files = { 'data.json': input };
    else {
        let count = 0, total = 0;
        files = unzipSync(input, { filter(entry) {
            if (++count > 4096 || entry.originalSize > MAX_EXPANDED || (total += entry.originalSize) > MAX_EXPANDED) {
                throw new Error('礼物动画包过大');
            }
            const name = entry.name.replaceAll('\\', '/');
            if (name.startsWith('/') || name.split('/').includes('..')) throw new Error('礼物动画包路径无效');
            return !name.includes('__MACOSX/') && !path.posix.basename(name).startsWith('.')
                && /\.(pag|json|png|jpe?g|webp|gif)$/i.test(name);
        } });
    }
    const names = Object.keys(files);
    const pag = names.find(name => /(?:^|\/)giftpag\.pag$/i.test(name)) || names.find(name => /\.pag$/i.test(name));
    if (pag) return { type: 'pag', bytes: files[pag] };
    const jsonNames = names.filter(name => /\.json$/i.test(name)).sort((a, b) => Number(!/(?:data|animation)\.json$/i.test(a)) - Number(!/(?:data|animation)\.json$/i.test(b)));
    for (const name of jsonNames) {
        const data = JSON.parse(Buffer.from(files[name]).toString('utf8'));
        if (!Array.isArray(data.layers) || !Number.isFinite(data.fr)) continue;
        for (const asset of data.assets || []) {
            if (!asset.p) continue;
            if (asset.e === 1 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(asset.p)) continue;
            const relative = path.posix.normalize(path.posix.join(path.posix.dirname(name), asset.u || '', asset.p));
            const image = files[relative];
            if (!image || !IMAGE_EXT.test(relative)) throw new Error('Lottie 礼物缺少图片资源');
            asset.u = '';
            asset.p = imageDataUrl(relative, image);
            asset.e = 1;
        }
        for (const font of data.fonts?.list || []) { delete font.fPath; font.fOrigin = 0; }
        return { type: 'lottie', animationData: data };
    }
    const frames = names.filter(name => IMAGE_EXT.test(name)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (frames.length) return { type: 'frames', frames: frames.map(name => imageDataUrl(name, files[name])) };
    throw new Error('礼物动画包没有可播放资源');
}

function createLiveGiftAssetsService(options = {}) {
    const fetchAsset = options.fetch || globalThis.fetch;
    const cacheDir = options.cacheDir || path.join(getStoragePaths().internalDataDir, 'live-gift-effects');
    const pending = new Map();

    async function download(url) {
        for (let redirects = 0; redirects < 4; redirects++) {
            const response = await fetchAsset(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
            if (response.status >= 300 && response.status < 400) {
                url = normalizeGiftAssetUrl(new URL(response.headers.get('location'), url).href);
                continue;
            }
            if (!response.ok) throw new Error(`礼物动画下载失败: ${response.status}`);
            if (Number(response.headers.get('content-length')) > MAX_DOWNLOAD) throw new Error('礼物动画包过大');
            const chunks = [];
            let length = 0;
            for await (const chunk of response.body) {
                length += chunk.length;
                if (length > MAX_DOWNLOAD) throw new Error('礼物动画包过大');
                chunks.push(Buffer.from(chunk));
            }
            return Buffer.concat(chunks);
        }
        throw new Error('礼物动画重定向过多');
    }

    async function trimCache() {
        const entries = await fs.readdir(cacheDir, { withFileTypes: true });
        const files = await Promise.all(entries.filter(x => x.isFile() && /^[a-f0-9]{64}\.bin$/.test(x.name)).map(async x => {
            const file = path.join(cacheDir, x.name), stat = await fs.stat(file);
            return { file, size: stat.size, time: stat.mtimeMs };
        }));
        let total = files.reduce((n, x) => n + x.size, 0);
        for (const file of files.sort((a, b) => a.time - b.time)) {
            if (total <= 160 * 1024 * 1024) break;
            await fs.unlink(file.file);
            total -= file.size;
        }
    }

    async function load(payload = {}) {
        const url = normalizeGiftAssetUrl(payload.url);
        const md5 = /^[a-f0-9]{32}$/i.test(payload.md5 || '') ? payload.md5.toLowerCase() : '';
        const key = createHash('sha256').update(`${url}:${md5}`).digest('hex');
        if (pending.has(key)) return pending.get(key);
        const task = (async () => {
            await fs.mkdir(cacheDir, { recursive: true });
            const file = path.join(cacheDir, `${key}.bin`);
            let bytes = await fs.readFile(file).catch(() => null);
            const valid = data => data?.length <= MAX_DOWNLOAD && (!md5 || createHash('md5').update(data).digest('hex') === md5);
            if (!bytes || !valid(bytes)) bytes = await download(url);
            if (!valid(bytes)) throw new Error('礼物动画校验失败');
            const asset = decodeGiftPackage(bytes, new URL(url).pathname);
            await fs.writeFile(file, bytes);
            await trimCache().catch(error => console.warn('[直播礼物] 清理动画缓存失败:', error.message));
            return { success: true, ...asset };
        })();
        pending.set(key, task);
        try { return await task; } finally { pending.delete(key); }
    }

    return { load };
}

const liveGiftAssetsService = createLiveGiftAssetsService();
function readGiftPlayerWasm() {
    return fs.readFile(require.resolve('libpag/lib/libpag.wasm')).then(bytes => new Uint8Array(bytes));
}

module.exports = { normalizeGiftAssetUrl, decodeGiftPackage, createLiveGiftAssetsService, liveGiftAssetsService, readGiftPlayerWasm };
