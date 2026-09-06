const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { pipeline } = require('stream/promises');
const { pathToFileURL } = require('url');
const { app } = require('electron');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const NodeMediaServer = require('node-media-server');
const { reportIgnoredError } = require('../../common/error-utils');
const settingsService = require('./settings-service');

const activeCommands = new Map();
const recordCommands = new Map();
const liveRecordSessions = new Map();
const compatVodJobs = new Map();
const compatVodCommands = new Map();
const compatVodFiles = new Set();
const roomRadioRecordingSessions = new Map();
const LIVE_RECORD_SHUTDOWN_TIMEOUT_MS = 30_000;
const LIVE_RECORD_RECOVERY_MIN_AGE_MS = 15_000;
const LIVE_RECORD_SESSION_IDLE_FINALIZE_MS = 90_000;
let mediaShutdownInProgress = false;
let liveRecordRecoveryPromise = null;

const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const packagedFfmpegPath = process.resourcesPath ? path.join(process.resourcesPath, ffmpegName) : '';

function resolveDevelopmentFfmpegPath() {
    if (app?.isPackaged) return null;
    try {
        const ffmpegPath = require('ffmpeg-static');
        return typeof ffmpegPath === 'string' ? ffmpegPath : null;
    } catch (error) {
        reportIgnoredError(error, 'media-service:load-development-ffmpeg');
        return null;
    }
}

const staticFfmpegPath = resolveDevelopmentFfmpegPath();

function hasSystemFfmpeg() {
    try {
        const result = spawnSync('ffmpeg', ['-version'], {
            windowsHide: true,
            stdio: 'ignore'
        });

        return !result.error && result.status === 0;
    } catch (error) {
        return false;
    }
}

function resolveFfmpegConfig() {
    if (process.platform === 'linux' && hasSystemFfmpeg()) {
        return { path: 'ffmpeg', source: 'system', isAvailable: true };
    }

    if (app?.isPackaged && packagedFfmpegPath && fs.existsSync(packagedFfmpegPath)) {
        return { path: packagedFfmpegPath, source: 'packaged', isAvailable: true };
    }

    if (staticFfmpegPath && fs.existsSync(staticFfmpegPath)) {
        return { path: staticFfmpegPath, source: 'static', isAvailable: true };
    }

    if (hasSystemFfmpeg()) {
        return { path: 'ffmpeg', source: 'system', isAvailable: true };
    }

    return {
        path: app?.isPackaged && packagedFfmpegPath ? packagedFfmpegPath : (staticFfmpegPath || ffmpegName),
        source: 'missing',
        isAvailable: false
    };
}

const ffmpegConfig = resolveFfmpegConfig();

if (!ffmpegConfig.isAvailable) {
    console.error('CRITICAL: FFmpeg binary not found:', ffmpegConfig.path);
}

ffmpeg.setFfmpegPath(ffmpegConfig.path);

let currentProxyCommand = null;
let mediaServer = null;
let mediaServerPorts = null;
let mediaServerStartPromise = null;

const MEDIA_SERVER_HOST = '127.0.0.1';
const DEFAULT_RTMP_PORT = 1935;
const DEFAULT_HTTP_PORT = 8888;
const PROXY_START_TIMEOUT_MS = 8000;
const CLIP_READ_TIMEOUT_US = 20_000_000;
const CLIP_NO_PROGRESS_TIMEOUT_MS = 60_000;
const HLS_CLIP_PREROLL_SECONDS = 12;
const LIVE_RECORD_DISK_CHECK_INTERVAL_MS = 30_000;
const LIVE_RECORD_MIN_FREE_BYTES = 512 * 1024 * 1024;
const LIVE_RECORD_FINALIZE_RESERVE_BYTES = 256 * 1024 * 1024;

function stopCommand(command, signal = 'SIGKILL') {
    if (!command) {
        return;
    }

    try {
        command.kill(signal);
    } catch (error) { reportIgnoredError(error, 'src/main/services/media-service.js'); }
}

function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, MEDIA_SERVER_HOST);
    });
}

async function findAvailablePort(basePort, attempts = 20) {
    for (let offset = 0; offset < attempts; offset += 1) {
        const candidatePort = basePort + offset;
        if (await isPortAvailable(candidatePort)) {
            return candidatePort;
        }
    }

    throw new Error(`媒体代理端口不可用: ${basePort}-${basePort + attempts - 1}`);
}

function getServerObjects(nms) {
    return [
        nms?.httpServer?.httpServer,
        nms?.httpServer?.httpsServer,
        nms?.httpServer?.wsServer,
        nms?.httpServer?.wssServer,
        nms?.rtmpServer?.tcpServer,
        nms?.rtmpServer?.tlsServer
    ].filter(Boolean);
}

function closeServerObject(server) {
    if (!server || typeof server.close !== 'function') {
        return;
    }

    try {
        server.close();
    } catch (error) { reportIgnoredError(error, 'src/main/services/media-service.js'); }
}

function stopMediaServer() {
    if (!mediaServer) {
        mediaServerPorts = null;
        mediaServerStartPromise = null;
        return;
    }

    getServerObjects(mediaServer).forEach(closeServerObject);
    mediaServer = null;
    mediaServerPorts = null;
    mediaServerStartPromise = null;
}

async function startMediaServer() {
    if (mediaServer && mediaServerPorts) {
        return mediaServerPorts;
    }

    if (mediaServerStartPromise) {
        return mediaServerStartPromise;
    }

    mediaServerStartPromise = (async () => {
        const rtmpPort = await findAvailablePort(DEFAULT_RTMP_PORT);
        const httpPort = await findAvailablePort(DEFAULT_HTTP_PORT);
        const nextServer = new NodeMediaServer({
            bind: MEDIA_SERVER_HOST,
            rtmp: { port: rtmpPort, chunk_size: 60000, gop_cache: true, ping: 30, ping_timeout: 60 },
            http: { port: httpPort, allow_origin: '*', mediaroot: './media' }
        });
        const serverObjects = getServerObjects(nextServer);

        return await new Promise((resolve, reject) => {
            let settled = false;
            let pending = serverObjects.length;
            const cleanupListeners = [];

            const finish = () => {
                if (settled) return;
                pending -= 1;
                if (pending > 0) return;

                settled = true;
                cleanupListeners.forEach((cleanup) => cleanup());
                mediaServer = nextServer;
                mediaServerPorts = { rtmpPort, httpPort };
                resolve(mediaServerPorts);
            };

            const fail = (error) => {
                if (settled) return;
                settled = true;
                cleanupListeners.forEach((cleanup) => cleanup());
                getServerObjects(nextServer).forEach(closeServerObject);
                reject(new Error(`媒体代理启动失败: ${error.message}`));
            };

            serverObjects.forEach((server) => {
                const onListening = () => finish();
                const onError = (error) => fail(error);
                server.once('listening', onListening);
                server.once('error', onError);
                cleanupListeners.push(() => {
                    server.removeListener('listening', onListening);
                    server.removeListener('error', onError);
                });
            });

            try {
                nextServer.run();
                if (pending === 0) {
                    finish();
                }
            } catch (error) {
                fail(error);
            }
        });
    })();

    try {
        return await mediaServerStartPromise;
    } catch (error) {
        stopMediaServer();
        throw error;
    } finally {
        mediaServerStartPromise = null;
    }
}

function resolveDownloadFolder(customPath) {
    return (customPath && fs.existsSync(customPath)) ? customPath : app.getPath('downloads');
}

function sanitizeFileName(fileName) {
    return String(fileName || '').replace(/[\\/:*?"<>|]/g, '_');
}

function getUniqueMediaPath(folderPath, baseName, extension) {
    const safeBaseName = sanitizeFileName(baseName || `恢复的直播录制_${Date.now()}`);
    let candidatePath = path.join(folderPath, `${safeBaseName}${extension}`);
    let suffix = 1;
    while (fs.existsSync(candidatePath)) {
        candidatePath = path.join(folderPath, `${safeBaseName}_${suffix}${extension}`);
        suffix += 1;
    }
    return candidatePath;
}

function getRecoveredLiveRecordBaseName(fileName) {
    const withoutExtension = String(fileName || '').replace(/\.ts$/i, '');
    return withoutExtension
        .replace(/^未完成_/, '')
        .replace(/_auto_live_record_.+?_\d+$/i, '')
        .replace(/_rec_\d+$/i, '')
        || `恢复的直播录制_${Date.now()}`;
}

function removeMediaFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return;

    try {
        fs.unlinkSync(filePath);
    } catch (error) {
        reportIgnoredError(error, 'media-service:remove-media-file');
    }
}

function getClipErrorMessage(error, timedOut = false) {
    if (timedOut) {
        return '连接视频源超时，请确认回放仍可播放后重试';
    }

    const message = String(error?.message || '').toLowerCase();
    if (/\b(401|403)\b|forbidden|unauthorized/.test(message)) {
        return '视频地址已失效，请重新打开回放后重试';
    }
    if (/\b404\b|not found/.test(message)) {
        return '视频源不存在或已被移除';
    }
    if (/timed? out|timeout|connection reset|network is unreachable/.test(message)) {
        return '读取视频源超时，请检查网络后重试';
    }
    if (/invalid data|could not find codec|unsupported/.test(message)) {
        return '无法解析视频源，请重新打开回放后重试';
    }

    return '切片失败，请重新打开回放后重试';
}

function isRemoteHlsUrl(url) {
    return /^https?:\/\//i.test(url) && /\.m3u8(?:$|[?#])/i.test(url);
}

function resolveHlsUrl(value, baseUrl) {
    return new URL(String(value || '').trim(), baseUrl).href;
}

function absolutizeHlsTagUri(line, baseUrl) {
    return String(line || '').replace(/URI=(?:"([^"]+)"|([^,\s]+))/i, (match, quoted, plain) => {
        const absoluteUrl = resolveHlsUrl(quoted || plain, baseUrl);
        return `URI="${absoluteUrl}"`;
    });
}

async function resolveHlsMediaPlaylist(sourceUrl, depth = 0) {
    if (depth > 3) {
        throw new Error('HLS 播放列表嵌套层级过深');
    }

    const response = await axios.get(sourceUrl, {
        responseType: 'text',
        timeout: 20_000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const text = String(response.data || '');
    if (!text.startsWith('#EXTM3U')) {
        throw new Error('视频地址没有返回有效的 HLS 播放列表');
    }

    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const variants = [];
    for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].startsWith('#EXT-X-STREAM-INF')) continue;
        const bandwidth = Number(lines[index].match(/(?:^|,)BANDWIDTH=(\d+)/i)?.[1] || 0);
        const uri = lines.slice(index + 1).find(line => line && !line.startsWith('#'));
        if (uri) variants.push({ bandwidth, url: resolveHlsUrl(uri, sourceUrl) });
    }

    if (variants.length) {
        variants.sort((left, right) => right.bandwidth - left.bandwidth);
        return resolveHlsMediaPlaylist(variants[0].url, depth + 1);
    }

    return { url: sourceUrl, lines };
}

async function prepareHlsClipPlaylist(sourceUrl, clipStartTime, clipDuration) {
    const resolved = await resolveHlsMediaPlaylist(sourceUrl);
    const segments = [];
    let cursor = 0;
    let pendingDuration = null;
    let pendingDiscontinuity = false;
    let activeKeyLine = '';
    let activeMapLine = '';
    let pendingByteRange = '';
    let targetDuration = 6;
    let versionLine = '#EXT-X-VERSION:3';

    for (const line of resolved.lines) {
        if (line.startsWith('#EXT-X-VERSION:')) {
            versionLine = line;
        } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
            targetDuration = Math.max(1, Number(line.split(':')[1]) || targetDuration);
        } else if (line === '#EXT-X-DISCONTINUITY') {
            pendingDiscontinuity = true;
        } else if (line.startsWith('#EXT-X-KEY:')) {
            activeKeyLine = absolutizeHlsTagUri(line, resolved.url);
        } else if (line.startsWith('#EXT-X-MAP:')) {
            activeMapLine = absolutizeHlsTagUri(line, resolved.url);
        } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
            pendingByteRange = line;
        } else if (line.startsWith('#EXTINF:')) {
            pendingDuration = Number(line.slice('#EXTINF:'.length).split(',')[0]);
        } else if (!line.startsWith('#')) {
            const duration = Number.isFinite(pendingDuration) && pendingDuration > 0
                ? pendingDuration
                : targetDuration;
            segments.push({
                url: resolveHlsUrl(line, resolved.url),
                duration,
                start: cursor,
                end: cursor + duration,
                discontinuityBefore: pendingDiscontinuity,
                keyLine: activeKeyLine,
                mapLine: activeMapLine,
                byteRangeLine: pendingByteRange
            });
            cursor += duration;
            pendingDuration = null;
            pendingDiscontinuity = false;
            pendingByteRange = '';
        }
    }

    if (!segments.length) {
        throw new Error('HLS 播放列表没有视频分片');
    }
    if (segments.some(segment => segment.byteRangeLine)) {
        throw new Error('暂不支持字节范围型 HLS 切片');
    }

    const clipEndTime = clipStartTime + clipDuration;
    const windowStartTime = Math.max(0, clipStartTime - HLS_CLIP_PREROLL_SECONDS);
    const firstIndex = segments.findIndex(segment => segment.end > windowStartTime);
    const lastIndex = segments.findIndex(segment => segment.start >= clipEndTime + targetDuration);
    const selected = segments.slice(
        Math.max(0, firstIndex),
        lastIndex < 0 ? segments.length : Math.max(firstIndex + 1, lastIndex)
    );
    if (!selected.length || clipStartTime < selected[0].start || clipStartTime >= selected[selected.length - 1].end) {
        throw new Error('所选时间段没有对应的 HLS 分片');
    }

    const playlistLines = [
        '#EXTM3U',
        versionLine,
        '#EXT-X-ALLOW-CACHE:NO',
        `#EXT-X-TARGETDURATION:${Math.ceil(targetDuration)}`,
        '#EXT-X-MEDIA-SEQUENCE:0'
    ];
    let emittedKeyLine = '';
    let emittedMapLine = '';
    for (const segment of selected) {
        if (segment.keyLine && segment.keyLine !== emittedKeyLine) {
            playlistLines.push(segment.keyLine);
            emittedKeyLine = segment.keyLine;
        }
        if (segment.mapLine && segment.mapLine !== emittedMapLine) {
            playlistLines.push(segment.mapLine);
            emittedMapLine = segment.mapLine;
        }
        if (segment.discontinuityBefore) playlistLines.push('#EXT-X-DISCONTINUITY');
        playlistLines.push(`#EXTINF:${segment.duration.toFixed(6)},`);
        playlistLines.push(segment.url);
    }
    playlistLines.push('#EXT-X-ENDLIST');

    const tempPlaylistPath = path.join(
        app.getPath('temp'),
        `yaya-clip-${crypto.randomBytes(8).toString('hex')}.m3u8`
    );
    fs.writeFileSync(tempPlaylistPath, playlistLines.join('\n'), 'utf8');
    return {
        inputUrl: tempPlaylistPath,
        seekTime: Math.max(0, clipStartTime - selected[0].start),
        tempPlaylistPath
    };
}

function normalizeRemoteMediaUrl(value) {
    const rawUrl = String(value || '').trim();
    try {
        const parsed = new URL(rawUrl);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
    } catch (error) {
        return '';
    }
}

async function prepareCompatVod(remoteUrl) {
    const sourceUrl = normalizeRemoteMediaUrl(remoteUrl);
    if (!sourceUrl) {
        throw new Error('视频地址无效');
    }
    if (!ffmpegConfig.isAvailable) {
        throw new Error('FFmpeg 不可用，无法启动兼容播放');
    }

    const cacheKey = crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 20);
    const outputPath = path.join(app.getPath('temp'), `yaya-vod-compat-${cacheKey}.mp4`);

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        compatVodFiles.add(outputPath);
        return { url: pathToFileURL(outputPath).href, cached: true };
    }

    if (compatVodJobs.has(sourceUrl)) {
        return compatVodJobs.get(sourceUrl);
    }

    const job = new Promise((resolve, reject) => {
        removeMediaFile(outputPath);

        const command = ffmpeg(sourceUrl)
            .inputOptions([
                '-rw_timeout', String(CLIP_READ_TIMEOUT_US),
                '-reconnect', '1',
                '-reconnect_streamed', '1',
                '-reconnect_on_network_error', '1',
                '-reconnect_on_http_error', '429,5xx',
                '-reconnect_delay_max', '5',
                '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,rtmp,rtmps'
            ])
            .outputOptions([
                '-y',
                '-map 0:v:0',
                '-map 0:a?',
                '-c copy',
                '-avoid_negative_ts make_zero',
                '-movflags +faststart'
            ])
            .output(outputPath);

        compatVodCommands.set(sourceUrl, command);
        command
            .on('end', () => {
                compatVodCommands.delete(sourceUrl);
                compatVodFiles.add(outputPath);
                resolve({ url: pathToFileURL(outputPath).href, cached: false });
            })
            .on('error', (error) => {
                compatVodCommands.delete(sourceUrl);
                removeMediaFile(outputPath);
                console.error('[兼容播放] 视频转封装失败:', error);
                reject(new Error('旧版直播兼容处理失败'));
            })
            .run();
    });

    compatVodJobs.set(sourceUrl, job);
    try {
        return await job;
    } finally {
        compatVodJobs.delete(sourceUrl);
    }
}

function normalizeProxyPayload(payload) {
    if (typeof payload === 'string') {
        return {
            url: payload,
            headers: {}
        };
    }

    if (payload && typeof payload === 'object') {
        return {
            url: String(payload.url || '').trim(),
            headers: payload.headers && typeof payload.headers === 'object' ? payload.headers : {}
        };
    }

    return {
        url: '',
        headers: {}
    };
}

function buildHttpInputOptions(headers = {}) {
    const options = [];
    const userAgent = String(headers['User-Agent'] || headers['user-agent'] || '').trim();

    if (userAgent) {
        options.push('-user_agent', userAgent);
    }

    const headerLines = Object.entries(headers)
        .filter(([key, value]) => !/^user-agent$/i.test(String(key || '')) && String(value || '').trim())
        .map(([key, value]) => `${key}: ${String(value).trim()}`);

    if (headerLines.length > 0) {
        options.push('-headers', `${headerLines.join('\r\n')}\r\n`);
    }

    return options;
}

function createRoomRadioRecordingPaths(fileNameBase, savePath) {
    const safeBaseName = sanitizeFileName(fileNameBase || `房间电台录音_${Date.now()}`);
    const tempFolder = app.getPath('temp');
    const downloadFolder = resolveDownloadFolder(savePath);
    const tempInputPath = path.join(tempFolder, `${safeBaseName}_${Date.now()}.webm`);
    const outputPath = path.join(downloadFolder, `${safeBaseName}.mp3`);
    const fallbackPath = path.join(downloadFolder, `${safeBaseName}.webm`);

    return { tempInputPath, outputPath, fallbackPath };
}

async function convertRoomRadioRecording({ tempInputPath, outputPath, fallbackPath }) {
    const saveFallback = async (message) => {
        try {
            await fs.promises.copyFile(tempInputPath, fallbackPath);
            return {
                success: false,
                fallback: true,
                path: fallbackPath,
                msg: message
            };
        } catch (error) {
            return {
                success: false,
                fallback: false,
                msg: `录音保存失败：${error.message || error}`
            };
        } finally {
            await fs.promises.unlink(tempInputPath).catch(() => { });
        }
    };


    if (!ffmpegConfig.isAvailable) {
        return saveFallback('FFmpeg 不可用，已改为保存 WebM');
    }

    return await new Promise((resolve) => {
        ffmpeg(tempInputPath)
            .audioCodec('libmp3lame')
            .audioBitrate('192k')
            .format('mp3')
            .on('end', async () => {
                await fs.promises.unlink(tempInputPath).catch(() => { });
                resolve({
                    success: true,
                    path: outputPath
                });
            })
            .on('error', async () => {
                await fs.promises.unlink(outputPath).catch(() => { });
                resolve(await saveFallback('转换 MP3 失败，已改为保存 WebM'));
            })
            .save(outputPath);
    });
}

async function saveRoomRadioRecording({ arrayBuffer, fileNameBase, savePath }) {
    const paths = createRoomRadioRecordingPaths(fileNameBase, savePath);
    await fs.promises.writeFile(paths.tempInputPath, Buffer.from(arrayBuffer));
    return convertRoomRadioRecording(paths);
}

async function startRoomRadioRecording({ sessionId, fileNameBase, savePath }) {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId || roomRadioRecordingSessions.has(normalizedSessionId)) {
        return { success: false, msg: '录音会话无效或已存在' };
    }

    const paths = createRoomRadioRecordingPaths(fileNameBase, savePath);
    await fs.promises.writeFile(paths.tempInputPath, Buffer.alloc(0));
    roomRadioRecordingSessions.set(normalizedSessionId, {
        ...paths,
        writeChain: Promise.resolve(),
        finalized: false
    });
    return { success: true };
}

async function appendRoomRadioRecordingChunk({ sessionId, arrayBuffer }) {
    const session = roomRadioRecordingSessions.get(String(sessionId || '').trim());
    if (!session || session.finalized) {
        return { success: false, msg: '录音会话不存在或已经结束' };
    }

    const chunk = Buffer.from(arrayBuffer || new ArrayBuffer(0));
    session.writeChain = session.writeChain.then(() => fs.promises.appendFile(session.tempInputPath, chunk));
    try {
        await session.writeChain;
        return { success: true };
    } catch (error) {
        return { success: false, msg: `录音写入失败：${error.message || error}` };
    }
}

async function finishRoomRadioRecording({ sessionId }) {
    const normalizedSessionId = String(sessionId || '').trim();
    const session = roomRadioRecordingSessions.get(normalizedSessionId);
    if (!session || session.finalized) {
        return { success: false, msg: '录音会话不存在或已经结束' };
    }

    session.finalized = true;
    roomRadioRecordingSessions.delete(normalizedSessionId);
    try {
        await session.writeChain;
    } catch (error) {
        await fs.promises.unlink(session.tempInputPath).catch(() => { });
        return { success: false, msg: `录音写入失败：${error.message || error}` };
    }
    return convertRoomRadioRecording(session);
}

async function abortRoomRadioRecording({ sessionId }) {
    const normalizedSessionId = String(sessionId || '').trim();
    const session = roomRadioRecordingSessions.get(normalizedSessionId);
    if (!session) return { success: true };

    session.finalized = true;
    roomRadioRecordingSessions.delete(normalizedSessionId);
    await session.writeChain.catch(() => { });
    await fs.promises.unlink(session.tempInputPath).catch(() => { });
    return { success: true };
}

function getAvailableDiskBytes(folderPath) {
    if (typeof fs.statfsSync !== 'function') return Number.POSITIVE_INFINITY;
    try {
        const stats = fs.statfsSync(folderPath);
        return Number(stats.bavail) * Number(stats.bsize);
    } catch (error) {
        reportIgnoredError(error, 'media-service:live-record-disk-space');
        return Number.POSITIVE_INFINITY;
    }
}

function clearLiveRecordTimers(task) {
    if (!task) return;
    if (task.diskCheckTimer) clearInterval(task.diskCheckTimer);
    if (task.forceStopTimer) clearTimeout(task.forceStopTimer);
    if (task.forceFinalizeTimer) clearTimeout(task.forceFinalizeTimer);
    task.diskCheckTimer = null;
    task.forceStopTimer = null;
    task.forceFinalizeTimer = null;
}

function replyMediaEvent(event, channel, payload) {
    try {
        if (!event || typeof event.reply !== 'function' || event.sender?.isDestroyed?.()) return;
        event.reply(channel, payload);
    } catch (error) {
        reportIgnoredError(error, `media-service:reply:${channel}`);
    }
}

function clearLiveRecordSessionFinalizeTimer(session) {
    if (!session?.finalizeTimer) return;
    clearTimeout(session.finalizeTimer);
    session.finalizeTimer = null;
}

function closeLiveRecordSession(task) {
    const session = task?.liveRecordSession;
    if (!session || task.keepLiveRecordSession === true) return;
    clearLiveRecordSessionFinalizeTimer(session);
    if (liveRecordSessions.get(session.sessionId) === session) {
        liveRecordSessions.delete(session.sessionId);
    }
}

function finishLiveRecordTask(event, task, { status, msg, outputPath = '' }) {
    if (!task || task.completed) return;
    task.completed = true;
    clearLiveRecordTimers(task);
    if (recordCommands.get(task.taskId) === task) {
        recordCommands.delete(task.taskId);
    }
    closeLiveRecordSession(task);
    replyMediaEvent(event, 'download-status', {
        taskId: task.taskId,
        msg,
        status,
        path: outputPath,
        resumeRecording: task.resumeAfterUnexpectedEnd === true
    });
    replyMediaEvent(event, 'record-status', {
        taskId: task.taskId,
        msg,
        status,
        resumeRecording: task.resumeAfterUnexpectedEnd === true
    });
    if (typeof task.resolveCompletion === 'function') {
        task.resolveCompletion({ status, msg, outputPath });
        task.resolveCompletion = null;
    }
}

async function moveLiveRecordingFile(sourcePath, targetPath) {
    await fs.promises.unlink(targetPath).catch(() => { });
    try {
        await fs.promises.rename(sourcePath, targetPath);
    } catch (error) {
        if (error?.code !== 'EXDEV') throw error;
        await fs.promises.copyFile(sourcePath, targetPath);
        await fs.promises.unlink(sourcePath).catch(() => { });
    }
}

async function preserveLiveRecordingAsTs(event, task, message) {
    if (task.canceled) {
        await fs.promises.unlink(task.tempPath).catch(() => { });
        await fs.promises.unlink(task.outputPath || '').catch(() => { });
        return;
    }
    const fallbackPath = path.join(task.downloadFolder, `${sanitizeFileName(task.fileName)}.ts`);
    await fs.promises.unlink(task.outputPath || '').catch(() => { });
    try {
        await moveLiveRecordingFile(task.tempPath, fallbackPath);
        finishLiveRecordTask(event, task, {
            status: 'success',
            msg: message,
            outputPath: fallbackPath
        });
    } catch (error) {
        task.resumeAfterUnexpectedEnd = false;
        finishLiveRecordTask(event, task, {
            status: 'error',
            msg: `录制文件保存失败：${error.message || error}`
        });
    }
}

async function appendLiveRecordSessionPart(task) {
    const session = task?.liveRecordSession;
    if (!session || !task.tempPath || task.tempPath === session.aggregatePath) return false;

    let stats;
    try {
        stats = await fs.promises.stat(task.tempPath);
    } catch (error) {
        return false;
    }

    if (!stats.isFile() || stats.size <= 0) {
        await fs.promises.unlink(task.tempPath).catch(() => { });
        return false;
    }

    await fs.promises.mkdir(path.dirname(session.aggregatePath), { recursive: true });
    if (!fs.existsSync(session.aggregatePath)) {
        await moveLiveRecordingFile(task.tempPath, session.aggregatePath);
    } else {
        await pipeline(
            fs.createReadStream(task.tempPath),
            fs.createWriteStream(session.aggregatePath, { flags: 'a' })
        );
        await fs.promises.unlink(task.tempPath).catch(() => { });
    }
    task.tempPath = session.aggregatePath;
    session.partCount += 1;
    return true;
}

function createLiveRecordSessionFinalizationTask(session, event, reason = 'session-finish') {
    const taskId = `auto_live_finalize_${sanitizeFileName(session.sessionId)}_${Date.now()}`;
    let resolveCompletion;
    const completionPromise = new Promise(resolve => {
        resolveCompletion = resolve;
    });
    return {
        taskId,
        command: null,
        tempPath: session.aggregatePath,
        tempFolder: session.tempFolder,
        downloadFolder: session.downloadFolder,
        fileName: session.fileName,
        stopRequested: true,
        stopReason: reason,
        finalizing: false,
        completed: false,
        diskCheckTimer: null,
        forceStopTimer: null,
        forceFinalizeTimer: null,
        canceled: false,
        mediaStarted: true,
        resumeAfterUnexpectedEnd: false,
        event: event || session.event,
        completionPromise,
        resolveCompletion,
        recordType: 'live',
        liveRecordSession: session,
        keepLiveRecordSession: false
    };
}

function finalizeLiveRecordSession(event, { sessionId, reason = 'session-finish' } = {}) {
    const normalizedSessionId = String(sessionId || '').trim();
    const session = liveRecordSessions.get(normalizedSessionId);
    if (!session || session.finalizing) return null;

    clearLiveRecordSessionFinalizeTimer(session);
    const activeTask = session.activeTaskId ? recordCommands.get(session.activeTaskId) : null;
    if (activeTask && !activeTask.completed) {
        requestLiveRecordStop(event || activeTask.event, activeTask, reason);
        return activeTask.completionPromise;
    }

    const task = createLiveRecordSessionFinalizationTask(session, event, reason);
    session.activeTaskId = task.taskId;
    session.finalizing = true;
    recordCommands.set(task.taskId, task);
    finalizeLiveRecording(task.event, task.taskId, { interrupted: false }).catch(error => {
        finishLiveRecordTask(task.event, task, {
            status: 'error',
            msg: `合并直播录制失败：${error.message || error}`
        });
    });
    return task.completionPromise;
}

function scheduleLiveRecordSessionFinalization(session) {
    if (!session || session.finalizing || mediaShutdownInProgress) return;
    clearLiveRecordSessionFinalizeTimer(session);
    session.finalizeTimer = setTimeout(() => {
        session.finalizeTimer = null;
        finalizeLiveRecordSession(session.event, {
            sessionId: session.sessionId,
            reason: 'retry-timeout'
        });
    }, LIVE_RECORD_SESSION_IDLE_FINALIZE_MS);
}

async function finalizeLiveRecording(event, taskId, { interrupted = false, emptyFileMessage = '' } = {}) {
    const task = recordCommands.get(taskId);
    if (!task || task.finalizing || task.completed) return;
    task.finalizing = true;
    clearLiveRecordTimers(task);

    if (task.liveRecordSession) {
        const session = task.liveRecordSession;
        session.event = event || session.event;
        session.activeTaskId = '';
        try {
            await appendLiveRecordSessionPart(task);
        } catch (error) {
            task.keepLiveRecordSession = false;
            finishLiveRecordTask(event, task, {
                status: 'error',
                msg: `录制片段暂存失败：${error.message || error}`
            });
            return;
        }

        if (!task.stopReason) {
            task.keepLiveRecordSession = true;
            task.resumeAfterUnexpectedEnd = task.mediaStarted;
            scheduleLiveRecordSessionFinalization(session);
            finishLiveRecordTask(event, task, {
                status: task.mediaStarted ? 'success' : 'error',
                msg: task.mediaStarted
                    ? '直播流中断，当前内容已暂存，将继续录入同一文件'
                    : (emptyFileMessage || '直播流暂时没有有效数据，将自动重试')
            });
            return;
        }

        task.keepLiveRecordSession = false;
        task.tempPath = session.aggregatePath;
        task.fileName = session.fileName;
        task.downloadFolder = session.downloadFolder;
        session.finalizing = true;
    }

    let tempStats;
    try {
        tempStats = await fs.promises.stat(task.tempPath);
    } catch (error) {
        finishLiveRecordTask(event, task, {
            status: 'error',
            msg: emptyFileMessage || '录制未产生可保存的视频文件'
        });
        return;
    }

    if (!tempStats.isFile() || tempStats.size <= 0) {
        await fs.promises.unlink(task.tempPath).catch(() => { });
        finishLiveRecordTask(event, task, {
            status: 'error',
            msg: emptyFileMessage || '录制未产生有效的视频数据'
        });
        return;
    }

    if (task.recordType === 'room-radio') {
        const finalOutputPath = getUniqueMediaPath(task.downloadFolder, task.fileName, '.mp3');
        task.outputPath = finalOutputPath;
        replyMediaEvent(event, 'download-status', {
            taskId,
            msg: task.stopReason === 'app-quit'
                ? '软件正在退出，正在保存上麦录制...'
                : (interrupted ? '上麦音频已断开，正在保存已录部分...' : '正在保存上麦录制...'),
            status: 'processing'
        });
        try {
            await moveLiveRecordingFile(task.tempPath, finalOutputPath);
            finishLiveRecordTask(event, task, {
                status: 'success',
                msg: task.stopReason === 'app-quit'
                    ? '软件退出前已保存上麦录制'
                    : (interrupted && task.resumeAfterUnexpectedEnd
                        ? '上麦音频中断，已保存当前片段，将自动续录'
                        : '上麦录制已保存'),
                outputPath: finalOutputPath
            });
        } catch (error) {
            task.resumeAfterUnexpectedEnd = false;
            finishLiveRecordTask(event, task, {
                status: 'error',
                msg: `上麦录制保存失败：${error.message || error}`
            });
        }
        return;
    }

    const finalOutputPath = task.liveRecordSession
        ? getUniqueMediaPath(task.downloadFolder, task.fileName, '.mp4')
        : path.join(task.downloadFolder, `${sanitizeFileName(task.fileName)}.mp4`);
    task.outputPath = finalOutputPath;
    const processingMessage = task.stopReason === 'low-disk'
        ? '磁盘剩余空间不足，正在保存已录部分...'
        : (task.stopReason === 'app-quit'
            ? '软件正在退出，正在封装录制文件...'
            : (interrupted ? '直播已断流，正在保存已录部分...' : '录制完成，正在封装...'));
    replyMediaEvent(event, 'download-status', {
        taskId,
        msg: processingMessage,
        status: 'processing'
    });

    const freeBytes = getAvailableDiskBytes(task.downloadFolder);
    if (freeBytes < tempStats.size + LIVE_RECORD_FINALIZE_RESERVE_BYTES) {
        task.resumeAfterUnexpectedEnd = false;
        await preserveLiveRecordingAsTs(event, task, '磁盘空间不足以封装 MP4，已保留 TS 文件');
        return;
    }

    const finalizeCommand = ffmpeg(task.tempPath)
        .inputOptions(task.liveRecordSession
            ? ['-fflags', '+genpts+discardcorrupt', '-dts_delta_threshold', '1']
            : [])
        .outputOptions(task.liveRecordSession
            ? ['-c copy', '-movflags faststart', '-avoid_negative_ts make_zero']
            : ['-c copy', '-movflags faststart']);
    task.command = finalizeCommand;

    finalizeCommand
        .on('end', async () => {
            if (task.canceled) {
                await fs.promises.unlink(task.tempPath).catch(() => { });
                await fs.promises.unlink(finalOutputPath).catch(() => { });
                return;
            }
            await fs.promises.unlink(task.tempPath).catch(() => { });
            finishLiveRecordTask(event, task, {
                status: 'success',
                msg: task.stopReason === 'low-disk'
                    ? '磁盘空间不足，已自动停止并保存'
                    : (task.stopReason === 'app-quit'
                        ? '软件退出前已保存录制文件'
                        : (interrupted
                            ? (task.resumeAfterUnexpectedEnd
                                ? '直播断流，已保存当前片段，将自动续录'
                                : '直播断流，已保存已录部分')
                            : '完成')),
                outputPath: finalOutputPath
            });
        })
        .on('error', async () => {
            if (task.canceled) return;
            await preserveLiveRecordingAsTs(event, task, 'MP4 封装失败，已保留 TS 文件');
        })
        .save(finalOutputPath);
}

function getLiveRecordConnectionErrorMessage(task, error, stderr = '') {
    const details = `${error?.message || error || ''}\n${stderr || ''}`;
    const isAutoRecord = /^auto_(?:live|room_radio)_record_/.test(String(task?.taskId || ''));
    const retryHint = isAutoRecord ? '，自动录制将稍后获取新地址重试' : '，请重新打开直播后重试';

    if (/\b(?:401|403)\b|unauthorized|forbidden/i.test(details)) {
        return `直播流地址已失效${retryHint}`;
    }
    if (/\b404\b|not found/i.test(details)) {
        return `直播流暂不可用${retryHint}`;
    }
    if (/timed?\s*out|timeout|rw_timeout/i.test(details)) {
        return `连接直播流超时${retryHint}`;
    }
    if (/invalid data|could not find codec|error when loading first segment/i.test(details)) {
        return `直播流暂时没有有效的视频数据${retryHint}`;
    }
    return `无法连接直播流${retryHint}`;
}

function sanitizeLiveRecordErrorDetails(value) {
    return String(value || '')
        .replace(/(https?:\/\/[^\s?'\"]+)[^\s'\"]*/gi, '$1')
        .slice(-2000);
}

function requestLiveRecordStop(event, task, reason = 'manual') {
    if (!task || task.stopRequested || task.finalizing) return;
    task.stopRequested = true;
    task.stopReason = reason;
    stopCommand(task.command, 'SIGINT');
    task.forceStopTimer = setTimeout(() => {
        if (recordCommands.get(task.taskId) !== task || task.finalizing) return;
        stopCommand(task.command, 'SIGKILL');
        task.forceFinalizeTimer = setTimeout(() => {
            finalizeLiveRecording(event, task.taskId, {
                interrupted: task.stopReason !== 'manual'
            }).catch(error => {
                finishLiveRecordTask(event, task, {
                    status: 'error',
                    msg: `录制保存失败：${error.message || error}`
                });
            });
        }, 1000);
    }, 15_000);
}

function startRecord(event, {
    url,
    taskId,
    savePath,
    fileName,
    recordType = '',
    recordingSessionId = ''
}) {
    const sourceUrl = String(url || '').trim();
    const normalizedTaskId = String(taskId || '').trim();
    if (mediaShutdownInProgress || !ffmpegConfig.isAvailable || !sourceUrl || !normalizedTaskId || recordCommands.has(normalizedTaskId)) {
        replyMediaEvent(event, 'download-status', {
            taskId: normalizedTaskId,
            msg: mediaShutdownInProgress
                ? '软件正在退出，无法启动新的录制任务'
                : (!ffmpegConfig.isAvailable ? 'FFmpeg 不可用，无法录制直播' : '直播录制参数无效'),
            status: 'error'
        });
        return;
    }

    const downloadFolder = resolveDownloadFolder(savePath);
    const tempFolder = app.getPath('temp');
    const isRoomRadioRecord = recordType === 'room-radio' || normalizedTaskId.startsWith('auto_room_radio_record_');
    const defaultPrefix = isRoomRadioRecord
        ? '房间上麦'
        : (normalizedTaskId.startsWith('auto_live_record_') ? '直播录制' : '直播切片');
    let resolvedFileName = String(fileName || `${defaultPrefix}_${Date.now()}`);
    const normalizedSessionId = !isRoomRadioRecord && normalizedTaskId.startsWith('auto_live_record_')
        ? String(recordingSessionId || '').trim()
        : '';
    let liveRecordSession = normalizedSessionId ? liveRecordSessions.get(normalizedSessionId) : null;
    if (normalizedSessionId && !liveRecordSession) {
        liveRecordSession = {
            sessionId: normalizedSessionId,
            fileName: resolvedFileName,
            tempFolder,
            downloadFolder,
            aggregatePath: path.join(
                tempFolder,
                `未完成_${sanitizeFileName(resolvedFileName)}_auto_live_record_${sanitizeFileName(normalizedSessionId)}_${Date.now()}.ts`
            ),
            activeTaskId: '',
            event,
            finalizeTimer: null,
            finalizing: false,
            partCount: 0
        };
        liveRecordSessions.set(normalizedSessionId, liveRecordSession);
    }
    if (liveRecordSession) {
        clearLiveRecordSessionFinalizeTimer(liveRecordSession);
        liveRecordSession.event = event;
        liveRecordSession.downloadFolder = downloadFolder;
        resolvedFileName = liveRecordSession.fileName;
    }
    const tempTsPath = path.join(
        tempFolder,
        `未完成_${sanitizeFileName(resolvedFileName)}_${sanitizeFileName(normalizedTaskId)}.${isRoomRadioRecord ? 'mp3' : 'ts'}`
    );
    const isRtmpSource = /^rtmps?:\/\//i.test(sourceUrl);
    const recordInputOptions = [
        '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,rtmp,rtmps',
        '-rw_timeout', String(CLIP_READ_TIMEOUT_US)
    ];
    if (!isRtmpSource) {
        recordInputOptions.unshift(
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            '-reconnect', '1',
            '-reconnect_at_eof', '1',
            '-reconnect_on_network_error', '1',
            '-reconnect_on_http_error', '4xx,5xx',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '10'
        );
    }
    const command = ffmpeg(sourceUrl).inputOptions(recordInputOptions);
    if (isRoomRadioRecord) {
        command
            .noVideo()
            .audioCodec('libmp3lame')
            .audioBitrate('192k')
            .format('mp3');
    } else {
        command.outputOptions([
            '-c', 'copy',
            '-f', 'mpegts',
            '-avoid_negative_ts', 'make_zero',
            '-fflags', '+genpts'
        ]);
    }
    command.output(tempTsPath);

    let resolveCompletion;
    const completionPromise = new Promise((resolve) => {
        resolveCompletion = resolve;
    });

    const task = {
        taskId: normalizedTaskId,
        command,
        tempPath: tempTsPath,
        tempFolder,
        downloadFolder,
        fileName: resolvedFileName,
        stopRequested: false,
        stopReason: '',
        finalizing: false,
        completed: false,
        diskCheckTimer: null,
        forceStopTimer: null,
        forceFinalizeTimer: null,
        canceled: false,
        mediaStarted: false,
        resumeAfterUnexpectedEnd: false,
        event,
        completionPromise,
        resolveCompletion,
        recordType: isRoomRadioRecord ? 'room-radio' : 'live',
        liveRecordSession,
        keepLiveRecordSession: false
    };
    recordCommands.set(normalizedTaskId, task);
    if (liveRecordSession) liveRecordSession.activeTaskId = normalizedTaskId;

    const markRecordingStarted = () => {
        if (task.mediaStarted || task.finalizing || task.completed) return;
        task.mediaStarted = true;
        replyMediaEvent(event, 'record-status', {
            taskId: normalizedTaskId,
            msg: isRoomRadioRecord ? '正在录制上麦音频...' : '正在录制直播...',
            status: 'recording'
        });
        task.diskCheckTimer = setInterval(() => {
            if (task.stopRequested || task.finalizing) return;
            if (getAvailableDiskBytes(task.tempFolder) >= LIVE_RECORD_MIN_FREE_BYTES) return;
            replyMediaEvent(event, 'download-status', {
                taskId: normalizedTaskId,
                msg: '磁盘剩余空间不足，正在自动停止并保存...',
                status: 'processing'
            });
            requestLiveRecordStop(event, task, 'low-disk');
        }, LIVE_RECORD_DISK_CHECK_INTERVAL_MS);
    };

    command
        .on('start', () => {
            replyMediaEvent(event, 'record-status', {
                taskId: normalizedTaskId,
                msg: '正在连接直播流...',
                status: 'connecting'
            });
        })
        .on('codecData', markRecordingStarted)
        .on('progress', markRecordingStarted)
        .on('error', (error, stdout, stderr) => {
            const currentTask = recordCommands.get(normalizedTaskId);
            if (currentTask !== task || task.finalizing || task.completed) return;
            task.resumeAfterUnexpectedEnd = task.mediaStarted
                && !task.stopReason
                && /^auto_(?:live|room_radio)_record_/.test(normalizedTaskId);
            const emptyFileMessage = getLiveRecordConnectionErrorMessage(task, error, stderr);
            console.error(
                `[直播录制] ${normalizedTaskId} 中断:`,
                sanitizeLiveRecordErrorDetails(error?.message || error),
                sanitizeLiveRecordErrorDetails(stderr)
            );
            finalizeLiveRecording(event, normalizedTaskId, {
                interrupted: task.stopReason !== 'manual',
                emptyFileMessage
            }).catch(error => {
                finishLiveRecordTask(event, task, {
                    status: 'error',
                    msg: `录制保存失败：${error.message || error}`
                });
            });
        })
        .on('end', () => {
            const currentTask = recordCommands.get(normalizedTaskId);
            if (currentTask !== task || task.finalizing || task.completed) return;
            task.resumeAfterUnexpectedEnd = task.mediaStarted
                && !task.stopReason
                && /^auto_(?:live|room_radio)_record_/.test(normalizedTaskId);
            finalizeLiveRecording(event, normalizedTaskId, {
                interrupted: task.stopReason !== 'manual'
            }).catch(error => {
                finishLiveRecordTask(event, task, {
                    status: 'error',
                    msg: `录制保存失败：${error.message || error}`
                });
            });
        });

    try {
        command.run();
    } catch (error) {
        if (liveRecordSession) {
            task.keepLiveRecordSession = true;
            scheduleLiveRecordSessionFinalization(liveRecordSession);
        }
        finishLiveRecordTask(event, task, {
            status: 'error',
            msg: `无法启动直播录制：${error.message || error}`
        });
    }
}

function stopRecord(event, { taskId, fileName }) {
    const task = recordCommands.get(String(taskId || '').trim());
    if (!task) return;
    if (fileName) task.fileName = String(fileName);
    replyMediaEvent(event, 'download-status', {
        taskId: task.taskId,
        msg: '正在停止录制并等待文件写入完成...',
        status: 'processing'
    });
    requestLiveRecordStop(event, task, 'manual');
}

function cancelDownload(event, { taskId }) {
    const liveRecordTask = recordCommands.get(taskId);
    const task = activeCommands.get(taskId) || liveRecordTask;
    if (!task) {
        return;
    }

    task.canceled = true;
    clearLiveRecordTimers(task);
    const canceledLiveRecordSession = liveRecordTask?.liveRecordSession || null;
    if (canceledLiveRecordSession) {
        clearLiveRecordSessionFinalizeTimer(canceledLiveRecordSession);
        liveRecordSessions.delete(canceledLiveRecordSession.sessionId);
    }
    stopCommand(task.command);
    activeCommands.delete(taskId);
    recordCommands.delete(taskId);
    if (liveRecordTask && typeof task.resolveCompletion === 'function') {
        task.resolveCompletion({ status: 'canceled', msg: '任务已取消', outputPath: '' });
        task.resolveCompletion = null;
    }

    setTimeout(() => {
        if (task.path && fs.existsSync(task.path)) {
            try {
                fs.unlinkSync(task.path);
            } catch (error) { reportIgnoredError(error, 'src/main/services/media-service.js'); }
        }

        if (task.tempPath && fs.existsSync(task.tempPath)) {
            try {
                fs.unlinkSync(task.tempPath);
            } catch (error) { reportIgnoredError(error, 'src/main/services/media-service.js'); }
        }

        if (canceledLiveRecordSession?.aggregatePath && fs.existsSync(canceledLiveRecordSession.aggregatePath)) {
            try {
                fs.unlinkSync(canceledLiveRecordSession.aggregatePath);
            } catch (error) { reportIgnoredError(error, 'media-service:cancel-live-record-session'); }
        }
    }, 1000);

    event.reply('download-status', { taskId, msg: '任务已取消', status: 'canceled' });
}

async function clipVod(event, { url, fileName, startTime, duration, taskId, savePath }) {
    const sourceUrl = String(url || '').trim();
    const clipStartTime = Number(startTime);
    const clipDuration = Number(duration);

    if (!ffmpegConfig.isAvailable) {
        event.reply('download-status', {
            taskId,
            msg: 'FFmpeg 不可用，请检查安装文件',
            status: 'error'
        });
        return;
    }

    if (!sourceUrl || !Number.isFinite(clipStartTime) || clipStartTime < 0
        || !Number.isFinite(clipDuration) || clipDuration <= 0) {
        event.reply('download-status', {
            taskId,
            msg: '切片参数无效，请重新选择起点和终点',
            status: 'error'
        });
        return;
    }

    const downloadFolder = resolveDownloadFolder(savePath);
    const finalOutputPath = path.join(downloadFolder, `${sanitizeFileName(fileName)}.mp4`);
    const remoteHls = isRemoteHlsUrl(sourceUrl);
    let clipInputUrl = sourceUrl;
    let accurateOutputSeekTime = 0;
    let tempPlaylistPath = '';

    console.log(`[切片任务] 目标路径: ${finalOutputPath}`);

    if (remoteHls) {
        event.reply('download-status', {
            taskId,
            msg: '正在解析 HLS 分片时间轴...',
            status: 'processing'
        });
        try {
            const prepared = await prepareHlsClipPlaylist(sourceUrl, clipStartTime, clipDuration);
            clipInputUrl = prepared.inputUrl;
            accurateOutputSeekTime = prepared.seekTime;
            tempPlaylistPath = prepared.tempPlaylistPath;
        } catch (error) {
            console.error('准备 HLS 切片时间轴失败:', error);
            event.reply('download-status', {
                taskId,
                msg: getClipErrorMessage(error),
                status: 'error'
            });
            return;
        }
    }

    const finishClip = () => {
        if (!activeCommands.has(taskId)) {
            return;
        }

        let outputStats;
        try {
            outputStats = fs.statSync(finalOutputPath);
        } catch (error) {
            outputStats = null;
        }

        activeCommands.delete(taskId);
        removeMediaFile(tempPlaylistPath);
        if (!outputStats?.isFile() || outputStats.size <= 0) {
            removeMediaFile(finalOutputPath);
            event.reply('download-status', {
                taskId,
                msg: '所选时间段未读取到视频数据，请确认回放可播放到该位置后重试',
                status: 'error'
            });
            return;
        }

        event.reply('download-status', { taskId, msg: '切片完成', status: 'success' });
    };

    event.reply('download-status', {
        taskId,
        msg: remoteHls ? '正在连接并定位 HLS 分片...' : '正在连接并定位视频...',
        status: 'processing'
    });

    const remoteRtmp = /^rtmps?:\/\//i.test(sourceUrl);
    const remoteHttp = /^https?:\/\//i.test(sourceUrl);
    const inputOptions = [
        '-rw_timeout', String(CLIP_READ_TIMEOUT_US),
        '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,rtmp,rtmps'
    ];

    if (!remoteHls) {
        inputOptions.unshift(`-ss ${clipStartTime}`);
    }

    if (remoteHttp && !remoteRtmp && !remoteHls) {
        inputOptions.push(
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_on_network_error', '1',
            '-reconnect_on_http_error', '429,5xx',
            '-reconnect_delay_max', '5'
        );
    }

    if (remoteHls) {
        inputOptions.push(
            '-http_persistent', '1',
            '-http_multiple', '1',
            '-http_seekable', '1'
        );
    }

    const outputOptions = [
        '-y',
        ...(remoteHls ? [`-ss ${accurateOutputSeekTime}`] : []),
        `-t ${clipDuration}`,
        '-map 0:v:0',
        '-map 0:a:0?',
        '-c:v libx264',
        '-preset veryfast',
        '-crf 20',
        '-c:a aac',
        '-b:a 128k',
        '-af aresample=async=1:first_pts=0',
        '-fps_mode vfr',
        '-max_interleave_delta 0',
        '-movflags +faststart',
        '-avoid_negative_ts make_zero'
    ];

    const command = ffmpeg(clipInputUrl)
        .inputOptions(inputOptions)
        .outputOptions(outputOptions)
        .output(finalOutputPath);

    activeCommands.set(taskId, { command, path: finalOutputPath, tempPath: tempPlaylistPath });

    let phase1Finished = false;
    let timedOut = false;
    let noProgressTimer = null;

    const clearNoProgressTimer = () => {
        if (noProgressTimer) {
            clearTimeout(noProgressTimer);
            noProgressTimer = null;
        }
    };

    const armNoProgressTimer = () => {
        clearNoProgressTimer();
        noProgressTimer = setTimeout(() => {
            if (phase1Finished || !activeCommands.has(taskId)) return;

            timedOut = true;
            phase1Finished = true;
            activeCommands.delete(taskId);
            event.reply('download-status', {
                taskId,
                msg: getClipErrorMessage(null, true),
                status: 'error'
            });
            stopCommand(command);
            removeMediaFile(tempPlaylistPath);
            removeMediaFile(finalOutputPath);
        }, CLIP_NO_PROGRESS_TIMEOUT_MS);
    };

    armNoProgressTimer();

    command
        .on('start', () => {
            event.reply('download-status', {
                taskId,
                msg: remoteHls
                    ? '正在读取目标分片并精确定位起点...'
                    : '正在读取视频源并定位切片起点...',
                status: 'processing'
            });
        })
        .on('progress', (progress) => {
            if (phase1Finished) return;
            armNoProgressTimer();

            let percent = 0;
            if (progress.timemark) {
                const timeParts = progress.timemark.split(':');
                const seconds = (+timeParts[0]) * 3600 + (+timeParts[1]) * 60 + (+timeParts[2]);
                percent = (seconds / clipDuration) * 100;
            }

            event.reply('download-progress', {
                taskId,
                percent: Math.min(99, Number(percent.toFixed(1))),
                msg: '正在截取片段...'
            });
        })
        .on('end', () => {
            if (phase1Finished) return;
            phase1Finished = true;
            clearNoProgressTimer();
            finishClip();
        })
        .on('error', (error) => {
            console.error('切片下载失败:', error);
            clearNoProgressTimer();
            if (phase1Finished) return;

            phase1Finished = true;
            activeCommands.delete(taskId);
            removeMediaFile(tempPlaylistPath);
            removeMediaFile(finalOutputPath);

            if (!timedOut && !error.message.includes('SIGKILL')) {
                event.reply('download-status', {
                    taskId,
                    msg: getClipErrorMessage(error),
                    status: 'error'
                });
            }
        })
        .run();
}

async function startProxy(remotePayload, {
    streamPrefix,
    inputOptions,
    outputOptions,
    errorPrefix,
    waitForInputReady = false,
    readinessFallbackMs = 1200,
    startTimeoutMs = PROXY_START_TIMEOUT_MS
}) {
    if (!ffmpegConfig.isAvailable) {
        throw new Error('FFmpeg 不可用，请检查系统环境或打包资源');
    }

    stopCommand(currentProxyCommand);
    currentProxyCommand = null;
    const { url: remoteUrl, headers } = normalizeProxyPayload(remotePayload);
    if (!remoteUrl) {
        return Promise.reject(new Error('缺少直播流地址'));
    }

    const { rtmpPort, httpPort } = await startMediaServer();
    const streamId = `${streamPrefix}_${Date.now()}`;
    const localRtmp = `rtmp://${MEDIA_SERVER_HOST}:${rtmpPort}/live/${streamId}`;
    const localHttpFlv = `http://${MEDIA_SERVER_HOST}:${httpPort}/live/${streamId}.flv`;

    return new Promise((resolve, reject) => {
        let settled = false;
        let command = null;
        let readinessFallbackTimer = null;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            stopCommand(command);
            if (currentProxyCommand === command) {
                currentProxyCommand = null;
            }
            reject(new Error('媒体代理启动超时'));
        }, Math.max(1000, Number(startTimeoutMs) || PROXY_START_TIMEOUT_MS));

        const settleSuccess = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearTimeout(readinessFallbackTimer);
            resolve(localHttpFlv);
        };

        const settleFailure = (error) => {
            const errorMessage = String(error?.message || error || '');
            const wasStoppedIntentionally = /(?:SIGKILL|SIGTERM|was killed)/i.test(errorMessage);
            if (!wasStoppedIntentionally) {
                console.error(`${errorPrefix}:`, errorMessage);
            }
            if (settled) {
                if (currentProxyCommand === command) {
                    currentProxyCommand = null;
                }
                return;
            }
            settled = true;
            clearTimeout(timer);
            clearTimeout(readinessFallbackTimer);
            if (currentProxyCommand === command) {
                currentProxyCommand = null;
            }
            reject(new Error(`媒体代理启动失败: ${error.message}`));
        };

        command = ffmpeg(remoteUrl)
            .inputOptions([
                ...buildHttpInputOptions(headers),
                ...inputOptions
            ])
            .outputOptions(outputOptions)
            .output(localRtmp);

        currentProxyCommand = command
            .on('start', () => {
                if (!waitForInputReady) {
                    settleSuccess();
                    return;
                }
                const fallbackDelay = Number(readinessFallbackMs) || 0;
                if (fallbackDelay > 0) {
                    readinessFallbackTimer = setTimeout(settleSuccess, fallbackDelay);
                }
            })
            .on('codecData', () => {
                if (waitForInputReady) settleSuccess();
            })
            .on('error', settleFailure);

        currentProxyCommand.run();
    });
}

function startLiveProxy(remoteUrl) {
    return startProxy(remoteUrl, {
        streamPrefix: 'live',
        inputOptions: ['-re', '-rw_timeout 5000000'],
        outputOptions: ['-c copy', '-f flv'],
        errorPrefix: '直播代理中断',
        waitForInputReady: true,
        readinessFallbackMs: 0,
        startTimeoutMs: 15000
    });
}

function startRadioProxy(remoteUrl) {
    return startProxy(remoteUrl, {
        streamPrefix: 'radio',
        inputOptions: ['-rw_timeout 5000000', '-fflags nobuffer', '-analyzeduration 500000', '-probesize 500000'],
        outputOptions: ['-vn', '-c:a copy', '-f flv'],
        errorPrefix: '电台代理中断',
        waitForInputReady: true
    });
}

function stopLiveProxy() {
    stopCommand(currentProxyCommand);
    currentProxyCommand = null;
    stopMediaServer();
}

function remuxRecoveredLiveRecording(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions(['-y', '-c copy', '-movflags faststart'])
            .on('end', resolve)
            .on('error', reject)
            .save(outputPath);
    });
}

async function performInterruptedLiveRecordingRecovery({
    minAgeMs = LIVE_RECORD_RECOVERY_MIN_AGE_MS
} = {}) {
    const tempFolder = app.getPath('temp');
    const settings = settingsService.readSettings();
    const clipDownloadFolder = resolveDownloadFolder(String(settings.yaya_path_clip || '').trim());
    const liveDownloadFolder = resolveDownloadFolder(String(settings.yaya_path_live || '').trim());
    await Promise.all([
        fs.promises.mkdir(clipDownloadFolder, { recursive: true }),
        fs.promises.mkdir(liveDownloadFolder, { recursive: true })
    ]);

    let entries = [];
    try {
        entries = await fs.promises.readdir(tempFolder, { withFileTypes: true });
    } catch (error) {
        return { recovered: 0, preserved: 0, failed: 0 };
    }

    const staleFiles = entries
        .filter(entry => entry.isFile() && /^未完成_.*\.ts$/i.test(entry.name))
        .map(entry => ({ name: entry.name, path: path.join(tempFolder, entry.name) }));
    const result = { recovered: 0, preserved: 0, failed: 0 };

    for (const staleFile of staleFiles) {
        const normalizedStalePath = path.resolve(staleFile.path).toLowerCase();
        const belongsToActiveTask = Array.from(recordCommands.values()).some(task => (
            task?.tempPath && path.resolve(task.tempPath).toLowerCase() === normalizedStalePath
        ));
        const belongsToActiveSession = Array.from(liveRecordSessions.values()).some(session => (
            session?.aggregatePath && path.resolve(session.aggregatePath).toLowerCase() === normalizedStalePath
        ));
        if (belongsToActiveTask || belongsToActiveSession) continue;

        let stats;
        try {
            stats = await fs.promises.stat(staleFile.path);
        } catch (error) {
            result.failed += 1;
            continue;
        }
        if (Date.now() - stats.mtimeMs < Math.max(0, Number(minAgeMs) || 0)) continue;
        if (!stats.isFile() || stats.size <= 0) {
            await fs.promises.unlink(staleFile.path).catch(() => { });
            continue;
        }

        const baseName = getRecoveredLiveRecordBaseName(staleFile.name);
        const downloadFolder = baseName.startsWith('直播录制_')
            ? liveDownloadFolder
            : clipDownloadFolder;
        const outputPath = getUniqueMediaPath(downloadFolder, baseName, '.mp4');
        try {
            if (!ffmpegConfig.isAvailable) throw new Error('FFmpeg unavailable');
            await remuxRecoveredLiveRecording(staleFile.path, outputPath);
            await fs.promises.unlink(staleFile.path).catch(() => { });
            result.recovered += 1;
        } catch (error) {
            await fs.promises.unlink(outputPath).catch(() => { });
            const fallbackPath = getUniqueMediaPath(downloadFolder, baseName, '.ts');
            try {
                await moveLiveRecordingFile(staleFile.path, fallbackPath);
                result.preserved += 1;
            } catch (moveError) {
                result.failed += 1;
                reportIgnoredError(moveError, 'media-service:recover-live-recording');
            }
        }
    }

    return result;
}

function recoverInterruptedLiveRecordings(options = {}) {
    if (liveRecordRecoveryPromise) return liveRecordRecoveryPromise;
    liveRecordRecoveryPromise = performInterruptedLiveRecordingRecovery(options)
        .finally(() => {
            liveRecordRecoveryPromise = null;
        });
    return liveRecordRecoveryPromise;
}

async function finalizeLiveRecordingsBeforeQuit(timeoutMs = LIVE_RECORD_SHUTDOWN_TIMEOUT_MS) {
    mediaShutdownInProgress = true;
    Array.from(liveRecordSessions.values()).forEach(session => {
        const activeTask = session.activeTaskId ? recordCommands.get(session.activeTaskId) : null;
        if (!activeTask) {
            finalizeLiveRecordSession(session.event, {
                sessionId: session.sessionId,
                reason: 'app-quit'
            });
        }
    });
    const tasks = Array.from(recordCommands.values());
    if (tasks.length === 0) return { total: 0, completed: 0, timedOut: false };

    tasks.forEach(task => {
        if (task.completed || task.finalizing) return;
        task.stopReason = 'app-quit';
        replyMediaEvent(task.event, 'download-status', {
            taskId: task.taskId,
            msg: '软件正在退出，正在保存录制文件...',
            status: 'processing'
        });
        requestLiveRecordStop(task.event, task, 'app-quit');
    });

    let timeoutHandle = null;
    const timeoutPromise = new Promise(resolve => {
        timeoutHandle = setTimeout(() => resolve('timeout'), Math.max(1000, Number(timeoutMs) || LIVE_RECORD_SHUTDOWN_TIMEOUT_MS));
    });
    const completionPromise = Promise.allSettled(tasks.map(task => task.completionPromise)).then(() => 'completed');
    const outcome = await Promise.race([completionPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    if (outcome === 'timeout') {
        tasks.forEach(task => {
            if (task.completed) return;
            clearLiveRecordTimers(task);
            stopCommand(task.command, 'SIGKILL');
        });
    }

    return {
        total: tasks.length,
        completed: tasks.filter(task => task.completed).length,
        timedOut: outcome === 'timeout'
    };
}

function cleanupMediaTasks() {
    stopCommand(currentProxyCommand);
    currentProxyCommand = null;

    activeCommands.forEach((task) => stopCommand(task.command));
    recordCommands.forEach((task) => {
        task.canceled = true;
        clearLiveRecordTimers(task);
        stopCommand(task.command, 'SIGINT');
    });
    compatVodCommands.forEach((command) => stopCommand(command));

    activeCommands.clear();
    recordCommands.clear();
    compatVodCommands.clear();
    compatVodJobs.clear();
    compatVodFiles.forEach(removeMediaFile);
    compatVodFiles.clear();
    roomRadioRecordingSessions.forEach((session) => {
        session.finalized = true;
        removeMediaFile(session.tempInputPath);
    });
    roomRadioRecordingSessions.clear();
    liveRecordSessions.forEach(session => clearLiveRecordSessionFinalizeTimer(session));
    liveRecordSessions.clear();
    stopMediaServer();
}

function downloadVod(event, { url, fileName, taskId, savePath }) {
    const sourceUrl = String(url || '').trim();
    const downloadFolder = resolveDownloadFolder(savePath);
    const outputPath = path.join(downloadFolder, `${fileName}.mp4`);

    if (!ffmpegConfig.isAvailable) {
        event.reply('download-status', {
            taskId,
            msg: 'FFmpeg 不可用，请检查系统环境或打包资源',
            status: 'error'
        });
        return;
    }

    const inputOptions = ['-protocol_whitelist', 'file,http,https,tcp,tls,crypto,rtmp,rtmps'];

    const command = ffmpeg(sourceUrl)
        .inputOptions(inputOptions)
        .outputOptions('-c copy');

    activeCommands.set(taskId, { command, path: outputPath });

    command
        .on('start', () => {
            event.reply('download-status', { taskId, msg: '正在解析...', status: 'start' });
        })
        .on('progress', (progress) => {
            event.reply('download-progress', {
                taskId,
                percent: progress.percent || 0,
                timemark: progress.timemark
            });
        })
        .on('error', () => {
            activeCommands.delete(taskId);
            event.reply('download-status', { taskId, msg: '下载失败', status: 'error' });
        })
        .on('end', () => {
            activeCommands.delete(taskId);
            event.reply('download-status', { taskId, msg: '下载完成', status: 'success' });
        })
        .save(outputPath);
}

async function downloadDanmu(event, { url, fileName, savePath }) {
    try {
        const downloadFolder = resolveDownloadFolder(savePath);
        const outputPath = path.join(downloadFolder, sanitizeFileName(fileName));
        const response = await axios.get(url, { responseType: 'text' });

        fs.writeFileSync(outputPath, response.data);
        event.reply('danmu-download-reply', { success: true, path: outputPath });
    } catch (error) {
        console.error('Download Danmu Error:', error);
        event.reply('danmu-download-reply', { success: false, msg: error.message });
    }
}

module.exports = {
    startRecord,
    stopRecord,
    finalizeLiveRecordSession,
    cancelDownload,
    clipVod,
    startLiveProxy,
    stopLiveProxy,
    downloadVod,
    downloadDanmu,
    startRadioProxy,
    saveRoomRadioRecording,
    startRoomRadioRecording,
    appendRoomRadioRecordingChunk,
    finishRoomRadioRecording,
    abortRoomRadioRecording,
    prepareCompatVod,
    recoverInterruptedLiveRecordings,
    finalizeLiveRecordingsBeforeQuit,
    cleanupMediaTasks
};
