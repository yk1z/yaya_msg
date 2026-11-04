const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const RELEASE_API = 'https://api.github.com/repos/yk1z/yaya_msg/releases/latest';
const RELEASE_PAGE = 'https://github.com/yk1z/yaya_msg/releases';

function parseVersion(value) {
    const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value || '').trim());
    if (!match) throw new Error('版本信息格式无效');
    const numbers = [match[1], match[2], match[3] || '0'].map(Number);
    if (!numbers.every(Number.isSafeInteger)) throw new Error('版本信息格式无效');
    return { numbers, prerelease: match[4] || '' };
}

function evaluateRelease(release, currentVersion, platform = process.platform) {
    if (!release || release.draft !== false || release.prerelease !== false) throw new Error('未获取到正式发布版本');
    const latest = parseVersion(release.tag_name);
    const current = parseVersion(currentVersion);
    if (latest.prerelease) throw new Error('未获取到正式发布版本');
    let comparison = 0;
    for (let i = 0; i < 3; i++) {
        if (latest.numbers[i] !== current.numbers[i]) {
            comparison = latest.numbers[i] > current.numbers[i] ? 1 : -1;
            break;
        }
    }
    if (!comparison && current.prerelease) comparison = 1;
    const extension = { win32: '.exe', darwin: '.dmg', linux: '.deb' }[platform];
    const downloadPrefix = `${RELEASE_PAGE}/download/${encodeURIComponent(release.tag_name)}/`;
    const asset = extension && Array.isArray(release.assets) && release.assets.find(item =>
        typeof item.name === 'string' && item.name.startsWith('yaya_msg-') && item.name.endsWith(extension)
        && typeof item.browser_download_url === 'string' && item.browser_download_url.startsWith(downloadPrefix));
    return {
        success: true,
        currentVersion,
        latestVersion: latest.numbers.join('.'),
        updateAvailable: comparison > 0,
        releaseUrl: `${RELEASE_PAGE}/tag/${encodeURIComponent(release.tag_name)}`,
        downloadUrl: asset ? asset.browser_download_url : '',
        assetName: asset ? asset.name : '',
        assetSize: asset && Number.isSafeInteger(asset.size) && asset.size > 0 ? asset.size : 0,
        assetDigest: asset && /^sha256:[a-f0-9]{64}$/i.test(asset.digest || '') ? asset.digest.slice(7).toLowerCase() : ''
    };
}

async function checkForUpdates(currentVersion, { request = axios.get, platform = process.platform } = {}) {
    try {
        const response = await request(RELEASE_API, {
            timeout: 10000,
            maxContentLength: 1024 * 1024,
            maxRedirects: 0,
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': `YayaMsg/${currentVersion}`, 'Cache-Control': 'no-cache' }
        });
        return evaluateRelease(response.data, currentVersion, platform);
    } catch (error) {
        if (error.response?.status === 404) {
            return { success: true, currentVersion, latestVersion: '', updateAvailable: false, releaseUrl: RELEASE_PAGE, downloadUrl: '' };
        }
        return { success: false, msg: [403, 429].includes(error.response?.status)
            ? '检查更新过于频繁，请稍后重试' : '检查更新失败，请检查网络后重试' };
    }
}

function createUpdateDownloader({ getLatest, directory, request = axios.get, onProgress = () => {} }) {
    let pending = null;
    let downloadedPath = '';
    let downloadedInfo = null;
    function notify(data) {
        try { onProgress(data); } catch (_) {                                                        }
    }
    function download() {
        if (pending) return pending;
        pending = (async () => {
            let temporaryPath = '';
            let response;
            downloadedPath = '';
            downloadedInfo = null;
            try {
                const update = await getLatest();
                if (!update.success) return update;
                if (!update.updateAvailable) return { success: false, msg: '暂无可用更新，请重新检查版本' };
                if (!/^yaya_msg-[A-Za-z0-9._-]+\.(exe|dmg|deb)$/.test(update.assetName || '')
                    || !Number.isSafeInteger(update.assetSize) || update.assetSize <= 0
                    || !update.downloadUrl?.startsWith(`${RELEASE_PAGE}/download/`)) {
                    return { success: false, msg: '新版安装包尚未就绪，请稍后重试' };
                }
                const folder = path.join(directory(), 'yaya-updates');
                await fs.promises.mkdir(folder, { recursive: true });
                const destination = path.join(folder, update.assetName);
                temporaryPath = `${destination}.${crypto.randomUUID()}.part`;
                response = await request(update.downloadUrl, {
                    responseType: 'stream', timeout: 30000, maxRedirects: 5,
                    headers: { 'User-Agent': 'YayaMsg', Accept: 'application/octet-stream' }
                });
                const total = update.assetSize;
                const headerLength = Number(response.headers?.['content-length']) || 0;
                if ((response.status && response.status !== 200) || (headerLength && headerLength !== total)) {
                    throw new Error('安装包大小与发布信息不一致');
                }
                const hash = crypto.createHash('sha256');
                let received = 0;
                let lastProgress = 0;
                notify({ version: update.latestVersion, received, total, percent: 0 });
                const measure = new Transform({ transform(chunk, encoding, callback) {
                    received += chunk.length;
                    if (received > total) return callback(new Error('安装包大小与发布信息不一致'));
                    hash.update(chunk);
                    if (Date.now() - lastProgress >= 150) {
                        lastProgress = Date.now();
                        notify({ version: update.latestVersion, received, total, percent: Math.min(99, Math.floor(received / total * 100)) });
                    }
                    callback(null, chunk);
                } });
                await pipeline(response.data, measure, fs.createWriteStream(temporaryPath, { flags: 'wx' }));
                if (received !== total) throw new Error('安装包下载不完整');
                const digest = hash.digest('hex');
                if (update.assetDigest && digest !== update.assetDigest) throw new Error('安装包校验失败，请重新下载');
                await fs.promises.rename(temporaryPath, destination);
                temporaryPath = '';
                downloadedPath = destination;
                downloadedInfo = { filePath: destination, size: received, digest, version: update.latestVersion };
                notify({ version: update.latestVersion, received, total, percent: 100 });
                return { success: true, version: update.latestVersion, fileName: update.assetName };
            } catch (error) {
                response?.data?.destroy?.();
                return { success: false, msg: error?.message?.startsWith('安装包') ? error.message : '下载更新失败，请检查网络后重试' };
            } finally {
                if (temporaryPath) await fs.promises.unlink(temporaryPath).catch(() => {});
            }
        })().finally(() => { pending = null; });
        return pending;
    }
    return { download, getDownloadedPath: () => downloadedPath, getDownloadedInfo: () => downloadedInfo && { ...downloadedInfo } };
}

module.exports = { checkForUpdates, evaluateRelease, createUpdateDownloader };
