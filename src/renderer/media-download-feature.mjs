import { readStoredStringSetting } from './app-preferences.mjs';
import { showToast } from './renderer-dialogs.mjs';

const MEDIA_DOWNLOAD_CHUNK_SIZE = 1024 * 1024;

async function saveDesktopMedia(response, downloads, metadata) {
    if (!response.body) throw new Error('下载文件为空');
    const reader = response.body.getReader();
    let id;
    try {
        ({ id } = await downloads.begin({ ...metadata, contentLength: response.headers.get('content-length') }));
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (let offset = 0; offset < value.length; offset += MEDIA_DOWNLOAD_CHUNK_SIZE) {
                const bytes = value.slice(offset, offset + MEDIA_DOWNLOAD_CHUNK_SIZE);
                await downloads.append({ id, bytes });
            }
        }
        await downloads.finish({ id });
    } catch (error) {
        await Promise.allSettled([
            reader.cancel(),
            id ? downloads.abort({ id }) : undefined
        ]);
        throw error;
    } finally {
        reader.releaseLock();
    }
}

export async function downloadMediaFileIconMode(url, filename, btnElement, originalIcon, dlType = 'media', subFolder = '') {
    if (btnElement && btnElement.disabled) return false;
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" style="animation: spin 1s linear infinite;">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                <path d="M12 2a10 10 0 0 1 10 10"></path>
            </svg>
        `;
    }

    async function fetchDownloadMedia(downloadUrl) {
        const response = await fetch(downloadUrl, { cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error(`网络请求失败: ${response.status}`);
        return response;
    }

    function getWebMediaProxyUrl(downloadUrl) {
        if (!window.desktop || window.desktop.platform !== 'web') return '';
        try {
            const parsed = new URL(downloadUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) return '';
            return `/web-media-proxy?url=${encodeURIComponent(parsed.toString())}`;
        } catch (error) {
            return '';
        }
    }

    try {
        let response;
        try {
            response = await fetchDownloadMedia(url);
        } catch (directError) {
            const proxyUrl = getWebMediaProxyUrl(url);
            if (!proxyUrl) throw directError;
            response = await fetchDownloadMedia(proxyUrl);
        }

        const customPath = readStoredStringSetting(`yaya_path_${dlType}`, '');

        if (customPath && window.desktop?.mediaDownloads) {
            await saveDesktopMedia(response, window.desktop.mediaDownloads, { filename, dlType, subFolder });
        } else {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        }

        if (btnElement) {
            btnElement.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => { btnElement.disabled = false; btnElement.innerHTML = originalIcon; }, 2000);
        }
        return true;
    } catch (e) {
        console.error('下载失败:', e);
        if (btnElement) {
            btnElement.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="#ff4d4f" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            setTimeout(() => { btnElement.disabled = false; btnElement.innerHTML = originalIcon; }, 2000);
        }
        showToast(`下载失败: ${e.message}`);
        return false;
    }
}
