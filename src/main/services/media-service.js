const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { app } = require('electron');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const NodeMediaServer = require('node-media-server');

const activeCommands = new Map();
const recordCommands = new Map();

const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const packagedFfmpegPath = path.join(process.resourcesPath, ffmpegName);
const staticFfmpegPath = typeof ffmpegPath === 'string' ? ffmpegPath : null;

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

    if (app.isPackaged && fs.existsSync(packagedFfmpegPath)) {
        return { path: packagedFfmpegPath, source: 'packaged', isAvailable: true };
    }

    if (staticFfmpegPath && fs.existsSync(staticFfmpegPath)) {
        return { path: staticFfmpegPath, source: 'static', isAvailable: true };
    }

    if (hasSystemFfmpeg()) {
        return { path: 'ffmpeg', source: 'system', isAvailable: true };
    }

    return {
        path: app.isPackaged ? packagedFfmpegPath : (staticFfmpegPath || ffmpegName),
        source: 'missing',
        isAvailable: false
    };
}

const ffmpegConfig = resolveFfmpegConfig();

if (!ffmpegConfig.isAvailable) {
    console.error('CRITICAL: FFmpeg binary not found:', ffmpegConfig.path);
}

ffmpeg.setFfmpegPath(ffmpegConfig.path);

const nms = new NodeMediaServer({
    rtmp: { port: 1935, chunk_size: 60000, gop_cache: true, ping: 30, ping_timeout: 60 },
    http: { port: 8888, allow_origin: '*', mediaroot: './media' }
});

nms.run();

let currentProxyCommand = null;

function stopCommand(command, signal = 'SIGKILL') {
    if (!command) {
        return;
    }

    try {
        command.kill(signal);
    } catch (error) {
    }
}

function resolveDownloadFolder(customPath) {
    return (customPath && fs.existsSync(customPath)) ? customPath : app.getPath('downloads');
}

function sanitizeFileName(fileName) {
    return String(fileName || '').replace(/[\\/:*?"<>|]/g, '_');
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

async function saveRoomRadioRecording({ arrayBuffer, fileNameBase, savePath }) {
    const safeBaseName = sanitizeFileName(fileNameBase || `房间电台录音_${Date.now()}`);
    const tempFolder = app.getPath('temp');
    const downloadFolder = resolveDownloadFolder(savePath);
    const tempInputPath = path.join(tempFolder, `${safeBaseName}_${Date.now()}.webm`);
    const outputPath = path.join(downloadFolder, `${safeBaseName}.mp3`);

    await fs.promises.writeFile(tempInputPath, Buffer.from(arrayBuffer));

    if (!ffmpegConfig.isAvailable) {
        const fallbackPath = path.join(downloadFolder, `${safeBaseName}.webm`);
        await fs.promises.copyFile(tempInputPath, fallbackPath);
        await fs.promises.unlink(tempInputPath).catch(() => { });
        return {
            success: false,
            fallback: true,
            path: fallbackPath,
            msg: 'FFmpeg 不可用，已改为保存 WebM'
        };
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
                const fallbackPath = path.join(downloadFolder, `${safeBaseName}.webm`);
                await fs.promises.copyFile(tempInputPath, fallbackPath).catch(() => { });
                await fs.promises.unlink(tempInputPath).catch(() => { });
                resolve({
                    success: false,
                    fallback: true,
                    path: fallbackPath,
                    msg: '转换 MP3 失败，已改为保存 WebM'
                });
            })
            .save(outputPath);
    });
}

function startRecord(event, { url, taskId, savePath }) {
    const tempFolder = app.getPath('temp');
    const tempTsPath = path.join(tempFolder, `temp_rec_${taskId}.ts`);

    const command = ffmpeg(url)
        .inputOptions([
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
            '-rw_timeout', '10000000'
        ])
        .outputOptions([
            '-c', 'copy',
            '-f', 'mpegts',
            '-avoid_negative_ts', 'make_zero',
            '-fflags', '+genpts'
        ])
        .output(tempTsPath);

    recordCommands.set(taskId, {
        command,
        tempPath: tempTsPath,
        savePath,
        isManuallyStopped: false
    });

    command
        .on('start', () => {
            event.reply('record-status', { taskId, msg: '🔴 正在录制直播...', status: 'recording' });
        })
        .on('error', (error) => {
            const currentTask = recordCommands.get(taskId);
            if (currentTask && currentTask.isManuallyStopped) {
                return;
            }

            if (!error.message.includes('SIGINT') && !error.message.includes('SIGKILL')) {
                event.reply('download-status', { taskId, msg: '录制出错', status: 'error' });
            }

            recordCommands.delete(taskId);
        })
        .run();
}

function stopRecord(event, { taskId, fileName }) {
    const task = recordCommands.get(taskId);
    if (!task) {
        return;
    }

    task.isManuallyStopped = true;
    stopCommand(task.command, 'SIGINT');

    const downloadFolder = resolveDownloadFolder(task.savePath);
    const finalOutputPath = path.join(downloadFolder, `${sanitizeFileName(fileName)}.mp4`);

    setTimeout(() => {
        if (!fs.existsSync(task.tempPath)) {
            event.reply('download-status', { taskId, msg: '临时文件丢失', status: 'error' });
            return;
        }

        ffmpeg(task.tempPath)
            .outputOptions(['-c copy', '-movflags faststart'])
            .on('start', () => {
                event.reply('download-status', { taskId, msg: '录制完成，正在封装...', status: 'processing' });
            })
            .on('end', () => {
                try {
                    fs.unlinkSync(task.tempPath);
                } catch (error) {
                }

                recordCommands.delete(taskId);
                event.reply('download-status', { taskId, msg: '完成', status: 'success' });
            })
            .on('error', () => {
                recordCommands.delete(taskId);
                event.reply('download-status', { taskId, msg: '封装失败', status: 'error' });
            })
            .save(finalOutputPath);
    }, 1500);
}

function cancelDownload(event, { taskId }) {
    const task = activeCommands.get(taskId) || recordCommands.get(taskId);
    if (!task) {
        return;
    }

    stopCommand(task.command);
    activeCommands.delete(taskId);
    recordCommands.delete(taskId);

    setTimeout(() => {
        if (task.path && fs.existsSync(task.path)) {
            try {
                fs.unlinkSync(task.path);
            } catch (error) {
            }
        }

        if (task.tempPath && fs.existsSync(task.tempPath)) {
            try {
                fs.unlinkSync(task.tempPath);
            } catch (error) {
            }
        }
    }, 1000);

    event.reply('download-status', { taskId, msg: '任务已取消', status: 'canceled' });
}

function clipVod(event, { url, fileName, startTime, duration, taskId, savePath }) {
    const downloadFolder = resolveDownloadFolder(savePath);
    const finalOutputPath = path.join(downloadFolder, `${sanitizeFileName(fileName)}.mp4`);
    const tempTsPath = path.join(app.getPath('temp'), `temp_${taskId}_${Date.now()}.ts`);

    console.log(`[切片任务] 目标路径: ${finalOutputPath}`);

    const runPhase2Transcode = () => {
        if (!activeCommands.has(taskId)) {
            return;
        }

        const command2 = ffmpeg(tempTsPath)
            .inputOptions(['-y'])
            .outputOptions(['-c copy', '-bsf:a aac_adtstoasc', '-movflags faststart'])
            .output(finalOutputPath);

        activeCommands.set(taskId, { command: command2, path: finalOutputPath, tempPath: tempTsPath });

        command2
            .on('end', () => {
                activeCommands.delete(taskId);

                try {
                    fs.unlinkSync(tempTsPath);
                } catch (error) {
                }

                event.reply('download-status', { taskId, msg: '切片完成', status: 'success' });
            })
            .on('error', (error) => {
                console.error('切片转码失败:', error);
                activeCommands.delete(taskId);

                try {
                    fs.unlinkSync(tempTsPath);
                } catch (unlinkError) {
                }

                if (!error.message.includes('SIGKILL')) {
                    event.reply('download-status', { taskId, msg: '封装失败', status: 'error' });
                }
            })
            .run();
    };

    event.reply('download-status', { taskId, msg: '正在截取片段...', status: 'processing' });

    const command = ffmpeg(url)
        .inputOptions([`-ss ${startTime}`, '-protocol_whitelist', 'file,http,https,tcp,tls,crypto'])
        .outputOptions([`-t ${duration}`, '-c copy', '-f mpegts', '-avoid_negative_ts make_zero'])
        .output(tempTsPath);

    activeCommands.set(taskId, { command, path: finalOutputPath, tempPath: tempTsPath });

    command
        .on('progress', (progress) => {
            let percent = 0;
            if (progress.timemark) {
                const timeParts = progress.timemark.split(':');
                const seconds = (+timeParts[0]) * 3600 + (+timeParts[1]) * 60 + (+timeParts[2]);
                percent = (seconds / duration) * 100;
            }

            event.reply('download-progress', { taskId, percent: Math.min(99, percent.toFixed(1)) });
        })
        .on('end', runPhase2Transcode)
        .on('error', (error) => {
            console.error('切片下载失败:', error);
            activeCommands.delete(taskId);

            if (!error.message.includes('SIGKILL')) {
                event.reply('download-status', { taskId, msg: '下载失败', status: 'error' });
            }
        })
        .run();
}

function startProxy(remotePayload, { streamPrefix, inputOptions, outputOptions, errorPrefix }) {
    stopCommand(currentProxyCommand);
    currentProxyCommand = null;
    const { url: remoteUrl, headers } = normalizeProxyPayload(remotePayload);
    if (!remoteUrl) {
        return Promise.reject(new Error('缺少直播流地址'));
    }

    const streamId = `${streamPrefix}_${Date.now()}`;
    const localRtmp = `rtmp://localhost:1935/live/${streamId}`;
    const localHttpFlv = `http://localhost:8888/live/${streamId}.flv`;

    return new Promise((resolve) => {
        const command = ffmpeg(remoteUrl)
            .inputOptions([
                ...buildHttpInputOptions(headers),
                ...inputOptions
            ])
            .outputOptions(outputOptions)
            .output(localRtmp);

        currentProxyCommand = command
            .on('start', () => resolve(localHttpFlv))
            .on('error', (error) => console.error(`${errorPrefix}:`, error.message));

        currentProxyCommand.run();
    });
}

function startLiveProxy(remoteUrl) {
    return startProxy(remoteUrl, {
        streamPrefix: 'live',
        inputOptions: ['-re', '-rw_timeout 5000000'],
        outputOptions: ['-c copy', '-f flv'],
        errorPrefix: '直播代理中断'
    });
}

function startRadioProxy(remoteUrl) {
    return startProxy(remoteUrl, {
        streamPrefix: 'radio',
        inputOptions: ['-rw_timeout 5000000', '-fflags nobuffer', '-analyzeduration 500000', '-probesize 500000'],
        outputOptions: ['-vn', '-c:a copy', '-f flv'],
        errorPrefix: '电台代理中断'
    });
}

function stopLiveProxy() {
    stopCommand(currentProxyCommand);
    currentProxyCommand = null;
}

function downloadVod(event, { url, fileName, taskId, savePath }) {
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

    const command = ffmpeg(url)
        .inputOptions(['-protocol_whitelist', 'file,http,https,tcp,tls,crypto'])
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
    cancelDownload,
    clipVod,
    startLiveProxy,
    stopLiveProxy,
    downloadVod,
    downloadDanmu,
    startRadioProxy,
    saveRoomRadioRecording
};
