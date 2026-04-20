const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const axios = require('axios');
const { dialog, session, shell } = require('electron');
const { ensureStoragePaths } = require('../../common/storage-paths');

function escapeScriptJson(jsonText) {
    return jsonText.replace(/<\/script/gi, '<\\/script');
}

function buildExportDocument({ title, styleValue, entries }) {
    const listHtml = entries.map((entry) => entry.itemHtml).join('\n');
    const payload = escapeScriptJson(JSON.stringify({
        version: 2,
        entries
    }));

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://unpkg.com/@primer/css@20.8.3/dist/primer.css" />
    <style>${styleValue}</style>
</head>
<body class="template-body">
    <div class="d-flex flex-column">
        <div class="flex-auto p-2">
            <div class="Box">
                <ul class="f5" style="list-style: none; padding: 0; margin: 0;">
${listHtml}
                </ul>
            </div>
        </div>
    </div>
    <script id="yaya-export-data" type="application/json">${payload}</script>
</body>
</html>`;
}

function parseStoredEntries(htmlContent) {
    const match = htmlContent.match(/<script id="yaya-export-data" type="application\/json">([\s\S]*?)<\/script>/i);
    if (!match) {
        return null;
    }

    try {
        const payload = JSON.parse(match[1]);
        if (payload && Array.isArray(payload.entries)) {
            return payload.entries;
        }
    } catch (error) {
    }

    return null;
}

function migrateLegacyEntries(htmlContent) {
    const entries = [];
    const itemRegex = /<li class="Box-row">([\s\S]*?)<time class="d-block">([\s\S]*?)<\/time>\s*<\/li>/gi;
    let match;

    while ((match = itemRegex.exec(htmlContent)) !== null) {
        const itemBody = match[1];
        const timeStr = String(match[2] || '').trim();
        const itemHtml = `<li class="Box-row">${itemBody}<time class="d-block">${timeStr}</time></li>`;
        const sortTime = Date.parse(timeStr);
        const key = crypto.createHash('sha1').update(itemHtml).digest('hex');

        entries.push({
            key,
            sortTime: Number.isFinite(sortTime) ? sortTime : 0,
            itemHtml
        });
    }

    return entries;
}

function loadExistingEntries(filePath) {
    if (!fs.existsSync(filePath)) {
        return [];
    }

    const previousContent = fs.readFileSync(filePath, 'utf8');
    const storedEntries = parseStoredEntries(previousContent);
    if (storedEntries) {
        return storedEntries;
    }

    return migrateLegacyEntries(previousContent);
}

function normalizeIncomingEntries(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }

    return entries
        .filter((entry) => entry && entry.key && entry.itemHtml)
        .map((entry) => ({
            key: String(entry.key),
            sortTime: Number(entry.sortTime) || 0,
            itemHtml: String(entry.itemHtml)
        }));
}

function mergeEntries(existingEntries, incomingEntries) {
    const mergedMap = new Map();

    for (const entry of existingEntries) {
        mergedMap.set(entry.key, entry);
    }

    let addedCount = 0;
    for (const entry of incomingEntries) {
        if (!mergedMap.has(entry.key)) {
            addedCount += 1;
        }
        mergedMap.set(entry.key, entry);
    }

    const mergedEntries = Array.from(mergedMap.values()).sort((left, right) => {
        if (left.sortTime !== right.sortTime) {
            return left.sortTime - right.sortTime;
        }

        return left.key.localeCompare(right.key);
    });

    return { mergedEntries, addedCount };
}

function saveExportHtml({ memberName, title, styleValue, entries }) {
    try {
        const { htmlDir: baseDir } = ensureStoragePaths();
        const safeMemberName = String(memberName || '').replace(/[\\/:*?"<>|]/g, '_');
        const memberDir = path.join(baseDir, safeMemberName);

        if (!fs.existsSync(memberDir)) {
            fs.mkdirSync(memberDir, { recursive: true });
        }

        const filePath = path.join(memberDir, 'yaya_export.html');
        const existingEntries = loadExistingEntries(filePath);
        const incomingEntries = normalizeIncomingEntries(entries);
        const { mergedEntries, addedCount } = mergeEntries(existingEntries, incomingEntries);

        if (addedCount === 0 && existingEntries.length > 0) {
            console.log(`[导出跳过] 没有新增消息: ${filePath}`);
            return {
                success: true,
                changed: false,
                path: filePath,
                addedCount: 0,
                totalCount: existingEntries.length
            };
        }

        const htmlContent = buildExportDocument({
            title: title || '口袋消息导出',
            styleValue: styleValue || '',
            entries: mergedEntries
        });

        fs.writeFileSync(filePath, htmlContent, 'utf8');
        console.log(`[导出成功] ${filePath}`);
        return {
            success: true,
            changed: addedCount > 0,
            path: filePath,
            addedCount,
            totalCount: mergedEntries.length
        };
    } catch (error) {
        console.error('[导出失败]', error);
        return {
            success: false,
            msg: error.message
        };
    }
}

async function openDirectoryDialog(mainWindow) {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: '选择保存路径'
    });

    if (canceled) {
        return null;
    }

    return filePaths[0];
}

async function checkIpInfo() {
    try {
        const response = await axios.get('http://ip-api.com/json/?lang=zh-CN', { timeout: 5000 });
        if (response.data && response.data.status === 'success') {
            return { success: true, data: response.data };
        }

        return { success: false, msg: '获取失败' };
    } catch (error) {
        return { success: false, msg: error.message || '网络请求超时' };
    }
}

async function checkIpDomestic() {
    try {
        const response = await axios.get('https://myip.ipip.net', { timeout: 5000 });
        return { success: true, data: response.data.replace(/\s+/g, ' ').trim() };
    } catch (error) {
        return { success: false, msg: '连接失败' };
    }
}

async function checkIpForeign() {
    try {
        const response = await axios.get('http://ip-api.com/json/?lang=zh-CN', { timeout: 8000 });
        if (response.data && response.data.status === 'success') {
            return { success: true, data: response.data };
        }

        return { success: false, msg: '获取失败' };
    } catch (error) {
        return { success: false, msg: '连接失败' };
    }
}

async function fetchGoogleInfo(port, sourceName) {
    try {
        const response = await axios.get('http://ip-api.com/json/?lang=zh-CN', {
            timeout: 5000,
            proxy: { host: '127.0.0.1', port }
        });

        if (response.data && response.data.status === 'success') {
            return { success: true, data: response.data, usedProxy: sourceName };
        }
    } catch (error) {
        return { success: false, msg: `端口${port}能通Google，但查IP失败` };
    }

    return {
        success: true,
        data: { query: '连接成功', country: 'Google', regionName: '通畅', isp: 'Google Services' }
    };
}

async function checkIpGoogle() {
    const commonPorts = [
        ...Array.from({ length: 10 }, (_, index) => 7890 + index),
        ...Array.from({ length: 10 }, (_, index) => 10800 + index),
        8888,
        1080
    ];
    const googleTestUrl = 'http://www.google.com/generate_204';

    const checkPort = async (port) => {
        try {
            await axios.get(googleTestUrl, {
                timeout: 1500,
                proxy: { host: '127.0.0.1', port },
                validateStatus: (status) => status === 204 || status === 200
            });

            return port;
        } catch (error) {
            return null;
        }
    };

    console.log('[Google检测] 开始扫描代理端口...');

    try {
        const proxyStr = await session.defaultSession.resolveProxy(googleTestUrl);
        const match = proxyStr.match(/PROXY\s+([^\s:]+):(\d+)/i);
        if (match) {
            const port = parseInt(match[2], 10);
            const result = await checkPort(port);
            if (result) {
                return fetchGoogleInfo(port, '系统代理');
            }
        }
    } catch (error) {
    }

    try {
        const workingPort = await Promise.any(
            commonPorts.map(async (port) => {
                const result = await checkPort(port);
                if (!result) {
                    throw new Error('fail');
                }

                return result;
            })
        );

        console.log(`[Google检测] 发现可用端口: ${workingPort}`);
        return fetchGoogleInfo(workingPort, `端口${workingPort}`);
    } catch (error) {
        console.error('所有端口扫描均失败');
        return {
            success: false,
            msg: '连接失败。\n已扫描端口: 7890-7899, 10800-10809\n请确认已开启 HTTP 代理。'
        };
    }
}

function spawnDetached(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            detached: true,
            stdio: 'ignore'
        });

        let settled = false;

        child.once('error', (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        });

        child.once('spawn', () => {
            if (settled) return;
            settled = true;
            child.unref();
            resolve();
        });
    });
}

function getExternalPlayerCandidates(mediaUrl) {
    if (process.platform === 'win32') {
        return [
            { command: 'C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe', args: [mediaUrl], needsPathCheck: true },
            { command: 'C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini.exe', args: [mediaUrl], needsPathCheck: true },
            { command: 'C:\\Program Files\\PotPlayer\\PotPlayerMini64.exe', args: [mediaUrl], needsPathCheck: true },
            { command: 'C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini.exe', args: [mediaUrl], needsPathCheck: true },
            { command: 'PotPlayerMini64.exe', args: [mediaUrl] },
            { command: 'PotPlayerMini.exe', args: [mediaUrl] }
        ];
    }

    if (process.platform === 'darwin') {
        return [
            { command: '/Applications/VLC.app/Contents/MacOS/VLC', args: [mediaUrl], needsPathCheck: true },
            { command: 'open', args: ['-a', 'VLC', mediaUrl] }
        ];
    }

    return [
        { command: 'vlc', args: [mediaUrl] },
        { command: '/snap/bin/vlc', args: [mediaUrl], needsPathCheck: true },
        { command: 'flatpak', args: ['run', 'org.videolan.VLC', mediaUrl] }
    ];
}

async function openExternalPlayer({ url }) {
    const mediaUrl = String(url || '').trim();
    if (!mediaUrl) {
        return { success: false, msg: '媒体地址不能为空' };
    }

    const candidates = getExternalPlayerCandidates(mediaUrl);
    const errors = [];

    for (const candidate of candidates) {
        try {
            if (candidate.needsPathCheck && !fs.existsSync(candidate.command)) {
                continue;
            }

            await spawnDetached(candidate.command, candidate.args);
            return {
                success: true,
                player: process.platform === 'win32' ? 'PotPlayer' : 'VLC'
            };
        } catch (error) {
            errors.push(`${candidate.command}: ${error.message}`);
        }
    }

    if (process.platform === 'win32') {
        try {
            await shell.openExternal(`potplayer://${mediaUrl}`);
            return { success: true, player: 'PotPlayer' };
        } catch (error) {
            errors.push(`potplayer:// ${error.message}`);
        }
    }

    return {
        success: false,
        msg: process.platform === 'win32'
            ? '未找到可用的 PotPlayer，请先安装 PotPlayer'
            : '未找到可用的 VLC，请先安装 VLC',
        detail: errors.join('\n')
    };
}

module.exports = {
    saveExportHtml,
    openDirectoryDialog,
    checkIpInfo,
    checkIpDomestic,
    checkIpForeign,
    checkIpGoogle,
    openExternalPlayer
};
