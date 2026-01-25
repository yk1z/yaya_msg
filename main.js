const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const NodeMediaServer = require('node-media-server');
const wasmInit = require('./rust-wasm.js');
const { __x6c2adf8__ } = wasmInit;
const crypto = require('crypto');

let wasmInitialized = false;

async function ensureWasmLoaded() {
    if (wasmInitialized) return;
    try {
        const wasmName = '2.wasm';
        const wasmPath = app.isPackaged
            ? path.join(process.resourcesPath, wasmName)
            : path.join(__dirname, wasmName);

        if (!fs.existsSync(wasmPath)) {
            console.error('WASM 文件未找到:', wasmPath);
            return;
        }

        const wasmBuffer = fs.readFileSync(wasmPath);
        await wasmInit.default(wasmBuffer);
        wasmInitialized = true;
        console.log('WASM 模块加载成功');
    } catch (err) {
        console.error('WASM 加载失败:', err);
    }
}


let mainWindow;
const activeCommands = new Map();
const recordCommands = new Map();

const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const finalFfmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, ffmpegName)
    : ffmpegPath;

if (!fs.existsSync(finalFfmpegPath)) {
    console.error('CRITICAL: FFmpeg binary not found at:', finalFfmpegPath);
}

ffmpeg.setFfmpegPath(finalFfmpegPath);

function parseTimemark(timemark) {
    if (!timemark) return 0;
    const parts = timemark.split(':');
    if (parts.length !== 3) return 0;
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return (h * 3600) + (m * 60) + s;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1200,
        minHeight: 800,
        frame: false,
        titleBarStyle: 'hidden',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });
    mainWindow.loadFile('index.html');
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    ensureWasmLoaded();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('window-min', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-max', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    }
});
ipcMain.on('window-close', () => mainWindow && mainWindow.close());

ipcMain.on('start-record', (event, { url, taskId }) => {
    const downloadFolder = app.getPath('downloads');
    const tempTsPath = path.join(downloadFolder, `temp_rec_${taskId}.ts`);

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

    recordCommands.set(taskId, { command, tempPath: tempTsPath });

    command.on('start', () => {
        event.reply('record-status', { taskId, msg: '🔴 正在录制直播...', status: 'recording' });
    }).on('error', (err) => {
        if (!err.message.includes('SIGINT') && !err.message.includes('SIGKILL')) {
            event.reply('download-status', { taskId, msg: '录制出错', status: 'error' });
        }
        recordCommands.delete(taskId);
    }).run();
});

ipcMain.on('stop-record', (event, { taskId, fileName }) => {
    const task = recordCommands.get(taskId);
    if (!task) return;

    task.command.kill('SIGINT');

    const downloadFolder = app.getPath('downloads');
    const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
    const finalOutputPath = path.join(downloadFolder, `${safeFileName}.mp4`);

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
                try { fs.unlinkSync(task.tempPath); } catch (e) { }
                recordCommands.delete(taskId);
                event.reply('download-status', { taskId, msg: '完成', status: 'success' });
            })
            .on('error', (err) => {
                recordCommands.delete(taskId);
                event.reply('download-status', { taskId, msg: '封装失败', status: 'error' });
            })
            .save(finalOutputPath);
    }, 1500);
});

ipcMain.on('cancel-download', (event, { taskId }) => {
    const task = activeCommands.get(taskId) || recordCommands.get(taskId);
    if (task) {
        try { task.command.kill('SIGKILL'); } catch (e) { }
        activeCommands.delete(taskId);
        recordCommands.delete(taskId);
        setTimeout(() => {
            if (task.path && fs.existsSync(task.path)) try { fs.unlinkSync(task.path); } catch (e) { }
            if (task.tempPath && fs.existsSync(task.tempPath)) try { fs.unlinkSync(task.tempPath); } catch (e) { }
        }, 1000);
        event.reply('download-status', { taskId, msg: '任务已取消', status: 'canceled' });
    }
});

ipcMain.on('clip-vod', (event, { url, fileName, startTime, duration, taskId }) => {
    const downloadFolder = app.getPath('downloads');
    const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
    const finalOutputPath = path.join(downloadFolder, `${safeFileName}.mp4`);
    const tempTsPath = path.join(downloadFolder, `temp_${taskId}_${Date.now()}.ts`);

    const runPhase2_Transcode = () => {
        if (!activeCommands.has(taskId)) return;
        const command2 = ffmpeg(tempTsPath)
            .inputOptions(['-y'])
            .outputOptions(['-c copy', '-bsf:a aac_adtstoasc', '-movflags faststart'])
            .output(finalOutputPath);

        activeCommands.set(taskId, { command: command2, path: finalOutputPath, tempPath: tempTsPath });

        command2.on('end', () => {
            activeCommands.delete(taskId);
            try { fs.unlinkSync(tempTsPath); } catch (e) { }
            event.reply('download-status', { taskId, msg: '切片完成', status: 'success' });
        }).on('error', (err) => {
            activeCommands.delete(taskId);
            try { fs.unlinkSync(tempTsPath); } catch (e) { }
            if (!err.message.includes('SIGKILL')) event.reply('download-status', { taskId, msg: '封装失败', status: 'error' });
        }).run();
    };

    event.reply('download-status', { taskId, msg: '正在截取片段...', status: 'processing' });

    const command = ffmpeg(url)
        .inputOptions([`-ss ${startTime}`, '-protocol_whitelist', 'file,http,https,tcp,tls,crypto'])
        .outputOptions([`-t ${duration}`, '-c copy', '-f mpegts', '-avoid_negative_ts make_zero'])
        .output(tempTsPath);

    activeCommands.set(taskId, { command, path: finalOutputPath, tempPath: tempTsPath });

    command.on('progress', (p) => {
        const currentSeconds = parseTimemark(p.timemark);
        let percent = (currentSeconds / duration) * 100;
        event.reply('download-progress', { taskId, percent: Math.min(99, percent.toFixed(1)) });
    }).on('end', runPhase2_Transcode)
        .on('error', (err) => {
            activeCommands.delete(taskId);
            if (!err.message.includes('SIGKILL')) event.reply('download-status', { taskId, msg: '下载失败', status: 'error' });
        }).run();
});

const nmsConfig = {
    rtmp: { port: 1935, chunk_size: 60000, gop_cache: true, ping: 30, ping_timeout: 60 },
    http: { port: 8888, allow_origin: '*', mediaroot: './media' }
};
const nms = new NodeMediaServer(nmsConfig);
nms.run();

let currentLiveCommand = null;

ipcMain.handle('start-live-proxy', async (event, remoteUrl) => {
    if (currentLiveCommand) {
        try { currentLiveCommand.kill('SIGKILL'); } catch (e) { }
        currentLiveCommand = null;
    }
    const streamId = 'live_' + Date.now();
    const localRtmp = `rtmp://localhost:1935/live/${streamId}`;
    const localHttpFlv = `http://localhost:8888/live/${streamId}.flv`;

    return new Promise((resolve) => {
        let command = ffmpeg(remoteUrl)
            .inputOptions(['-re', '-rw_timeout 5000000'])
            .outputOptions(['-c copy', '-f flv'])
            .output(localRtmp);

        currentLiveCommand = command
            .on('start', () => resolve(localHttpFlv))
            .on('error', (err) => console.error(err.message));
        currentLiveCommand.run();
    });
});

ipcMain.handle('stop-live-proxy', () => {
    if (currentLiveCommand) {
        try { currentLiveCommand.kill('SIGKILL'); } catch (e) { }
        currentLiveCommand = null;
    }
});

ipcMain.on('download-vod', (event, { url, fileName, taskId }) => {
    const downloadFolder = app.getPath('downloads');
    const outputPath = path.join(downloadFolder, `${fileName}.mp4`);

    if (!fs.existsSync(finalFfmpegPath)) {
        return event.reply('download-status', {
            taskId,
            msg: '内核文件丢失，请检查 resources 目录',
            status: 'error'
        });
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
        .on('error', (err) => {
            activeCommands.delete(taskId);
            event.reply('download-status', {
                taskId,
                msg: '下载失败',
                status: 'error'
            });
        })
        .on('end', () => {
            activeCommands.delete(taskId);
            event.reply('download-status', {
                taskId,
                msg: '下载完成',
                status: 'success'
            });
        })
        .save(outputPath);
});


function rStr(len) {
    const str = 'QWERTYUIOPASDFGHJKLZXCVBNM1234567890';
    let result = '';
    for (let i = 0; i < len; i++) result += str[Math.floor(Math.random() * str.length)];
    return result;
}

const DEVICE_ID = `${rStr(8)}-${rStr(4)}-${rStr(4)}-${rStr(4)}-${rStr(12)}`;

const APP_VERSION = '7.0.41';
const APP_BUILD = '24011601';

function createHeaders(token, pa) {
    const headers = {
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': `PocketFans201807/${APP_VERSION} (iPhone; iOS 16.3.1; Scale/2.00)`,
        'Host': 'pocketapi.48.cn',
        'Accept-Language': 'zh-Hans-CN;q=1',
        'appInfo': JSON.stringify({
            vendor: 'apple',
            deviceId: DEVICE_ID,
            appVersion: APP_VERSION,
            appBuild: APP_BUILD,
            osVersion: '16.3.1',
            osType: 'ios',
            deviceName: 'iPhone XR',
            os: 'ios'
        })
    };
    if (token) headers['token'] = token;
    if (pa) headers['pa'] = pa;
    return headers;
}

async function createLoginHeaders() {
    await ensureWasmLoaded();

    const headers = createHeaders();
    try {
        if (wasmInitialized) {
            headers['pa'] = __x6c2adf8__();
        }
    } catch (e) {
        console.error('生成 PA 失败:', e);
    }
    return headers;
}

ipcMain.handle('login-send-sms', async (event, { mobile, area, answer }) => {
    try {
        const url = 'https://pocketapi.48.cn/user/api/v1/sms/send2';

        const payload = {
            mobile: mobile,
            area: area || '86'
        };

        if (answer) {
            payload.answer = answer;
        }

        const res = await axios.post(url, payload, {
            headers: createHeaders()
        });

        if (res.status === 200 && res.data.status === 200) {
            return { success: true };
        }

        if (res.data.status === 2001) {
            try {
                const verificationData = JSON.parse(res.data.message);
                return {
                    success: false,
                    needVerification: true,
                    question: verificationData.question,
                    options: verificationData.answer
                };
            } catch (jsonErr) {
                return { success: false, msg: '验证数据解析失败: ' + res.data.message };
            }
        }

        return { success: false, msg: res.data.message || '发送失败' };
    } catch (e) {
        return { success: false, msg: '网络错误: ' + e.message };
    }
});

ipcMain.handle('login-by-code', async (event, { mobile, code }) => {
    try {
        const url = 'https://pocketapi.48.cn/user/api/v1/login/app/mobile/code';
        const headers = await createLoginHeaders();
        const payload = {
            mobile: mobile,
            code: code
        };

        const res = await axios.post(url, payload, { headers });
        return res.data;
    } catch (e) {
        console.error('登录错误:', e);
        return { status: 500, message: e.message };
    }
});

ipcMain.handle('login-check-token', async (event, { token, pa }) => {
    try {
        const url = 'https://pocketapi.48.cn/user/api/v1/user/info/reload';
        const res = await axios.post(url, { from: 'appstart' }, {
            headers: createHeaders(token, pa)
        });

        if (res.status === 200 && res.data.success) {
            const content = res.data.content;
            let finalInfo = content.userInfo || content;

            if (content.bigSmallInfo) {
                finalInfo.bigSmallInfo = content.bigSmallInfo;
            }

            return { success: true, userInfo: finalInfo };
        }
        return { success: false, msg: res.data.message || 'Token 无效' };
    } catch (e) {
        return { success: false, msg: '验证失败: ' + e.message };
    }
});

ipcMain.handle('switch-big-small', async (event, { token, pa, targetUserId }) => {
    if (!token) return { success: false, msg: '缺少 Token' };

    try {
        const headers = createHeaders(token, pa);
        const url = 'https://pocketapi.48.cn/user/api/v1/bigsmall/switch/user';

        const payload = {
            toUserId: targetUserId
        };

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return { success: true, content: res.data.content };
        }

        return { success: false, msg: res.data ? res.data.message : 'API 错误' };
    } catch (e) {
        return { success: false, msg: e.message };
    }
});

ipcMain.handle('fetch-room-messages', async (event, { channelId, serverId, token, pa, nextTime = 0, fetchAll = false }) => {
    if (!token) return { success: false, msg: '缺少 Token' };

    try {
        const headers = createHeaders(token, pa);
        let finalServerId = serverId;

        if (!finalServerId || finalServerId == 0) {
            try {
                const infoUrl = 'https://pocketapi.48.cn/im/api/v1/im/team/room/info';
                const infoRes = await axios.post(infoUrl, { channelId: String(channelId) }, { headers });
                if (infoRes.data.success) {
                    finalServerId = infoRes.data.content.serverId;
                }
            } catch (e) {
                console.warn('ServerID 自动获取失败');
            }
        }

        const url = fetchAll
            ? 'https://pocketapi.48.cn/im/api/v1/team/message/list/all'
            : 'https://pocketapi.48.cn/im/api/v1/team/message/list/homeowner';

        const payload = {
            channelId: parseInt(channelId),
            serverId: parseInt(finalServerId),
            nextTime: nextTime,
            limit: 50
        };

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return { success: true, data: res.data, usedServerId: finalServerId };
        }

        return { success: false, msg: res.data ? res.data.message : 'API 错误' };
    } catch (e) {
        return { success: false, msg: e.message };
    }
});

ipcMain.on('save-export-html', (event, { memberName, htmlContent }) => {
    try {
        const baseDir = path.join(process.cwd(), 'html');
        const safeMemberName = memberName.replace(/[\\/:*?"<>|]/g, '_');
        const memberDir = path.join(baseDir, safeMemberName);

        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir);
        }

        if (!fs.existsSync(memberDir)) {
            fs.mkdirSync(memberDir);
        }

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
        const fileName = `yaya_html_${timeStr}.html`;
        const filePath = path.join(memberDir, fileName);

        fs.writeFileSync(filePath, htmlContent, 'utf8');
        console.log(`[导出成功] ${filePath}`);
    } catch (err) {
        console.error('[导出失败]', err);
    }
});

ipcMain.handle('fetch-flip-list', async (event, { token, pa, beginLimit = 0, limit = 20 }) => {
    if (!token) return { success: false, msg: '缺少 Token' };

    try {
        const headers = createHeaders(token, pa);

        const url = 'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question/list';

        const payload = {
            status: 0,
            beginLimit: beginLimit,
            limit: limit,
            memberId: ""
        };

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return { success: true, content: res.data.content };
        }

        return { success: false, msg: res.data ? res.data.message : 'API 错误' };
    } catch (e) {
        return { success: false, msg: e.message };
    }
});
ipcMain.handle('fetch-star-archives', async (event, { token, pa, memberId }) => {
    if (!token) return { success: false, msg: '缺少 Token' };

    try {
        const headers = createHeaders(token, pa);
        const url = 'https://pocketapi.48.cn/user/api/v1/user/star/archives';

        if (!memberId || memberId === 'undefined') {
            return { success: false, msg: '未获取到有效的成员ID，请重新搜索选择' };
        }

        const payload = {
            memberId: Number(memberId)
        };

        console.log(`正在查询档案, MemberID: ${payload.memberId}`);

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return { success: true, content: res.data.content };
        }

        return { success: false, msg: res.data ? res.data.message : 'API 错误' };
    } catch (e) {
        console.error('Fetch Archives Error:', e);
        return { success: false, msg: e.message };
    }
});

ipcMain.handle('fetch-star-history', async (event, { token, pa, memberId }) => {
    if (!token) return { success: false, msg: '缺少 Token' };

    try {
        const headers = createHeaders(token, pa);
        const url = 'https://pocketapi.48.cn/user/api/v1/user/star/history';

        const payload = {
            memberId: Number(memberId),
            limit: 100,
            lastTime: 0
        };

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return { success: true, content: res.data.content };
        }

        return { success: false, msg: res.data ? res.data.message : 'API 错误' };
    } catch (e) {
        console.error('Fetch History Error:', e);
        return { success: false, msg: e.message };
    }
});

ipcMain.handle('fetch-open-live', async (event, { token, pa, memberId, nextTime }) => {
    if (!token) return { success: false, msg: '缺少 Token' };

    try {
        const headers = createHeaders(token, pa);
        const url = 'https://pocketapi.48.cn/im/api/v1/chatroom/msg/list/aim/type';

        const payload = {
            extMsgType: 'OPEN_LIVE',
            roomId: '',
            ownerId: String(memberId),
            nextTime: nextTime || 0
        };

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return { success: true, content: res.data.content };
        }

        return { success: false, msg: res.data ? res.data.message : 'API 错误' };
    } catch (e) {
        console.error('Fetch Open Live Error:', e);
        return { success: false, msg: e.message };
    }
});

ipcMain.handle('fetch-open-live-one', async (event, { token, pa, liveId }) => {
    if (!token) return { success: false, msg: '缺少 Token' };

    try {
        const headers = createHeaders(token, pa);
        const url = 'https://pocketapi.48.cn/live/api/v1/live/getOpenLiveOne';

        const payload = {
            liveId: String(liveId)
        };

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return { success: true, content: res.data.content };
        }

        return { success: false, msg: res.data ? res.data.message : 'API 错误' };
    } catch (e) {
        console.error('Fetch Open Live One Error:', e);
        return { success: false, msg: e.message };
    }
});

ipcMain.on('download-danmu', async (event, { url, fileName }) => {
    try {
        const downloadFolder = app.getPath('downloads');
        const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_');
        const outputPath = path.join(downloadFolder, safeName);

        const res = await axios.get(url, { responseType: 'text' });

        fs.writeFileSync(outputPath, res.data);

        event.reply('danmu-download-reply', { success: true, path: outputPath });
    } catch (e) {
        console.error('Download Danmu Error:', e);
        event.reply('danmu-download-reply', { success: false, msg: e.message });
    }
});

ipcMain.handle('fetch-flip-prices', async (event, { token, pa, memberId }) => {
    if (!token) return { success: false, msg: '缺少 Token' };
    try {
        const headers = createHeaders(token, pa);
        const url = 'https://pocketapi.48.cn/idolanswer/api/idolanswer/v2/custom/index';
        const res = await axios.post(url, { memberId: String(memberId) }, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return { success: true, content: res.data.content };
        }
        return { success: false, msg: res.data ? res.data.message : 'API 错误' };
    } catch (e) {
        return { success: false, msg: e.message };
    }
});

ipcMain.handle('send-flip-question', async (event, { token, pa, payload }) => {
    if (!token) return { success: false, msg: '缺少 Token' };
    try {
        const headers = createHeaders(token, pa);
        const url = 'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question';

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return { success: true, msg: '发送成功' };
        }
        return { success: false, msg: res.data ? res.data.message : '发送失败' };
    } catch (e) {
        return { success: false, msg: e.message };
    }
});

ipcMain.handle('operate-flip-question', async (event, { token, pa, questionId, operateType }) => {
    if (!token) return { success: false, msg: '缺少 Token' };
    try {
        const headers = createHeaders(token, pa);
        const url = 'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question/operate';

        const payload = {
            questionId: String(questionId),
            operateType: operateType || 1
        };

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return { success: true, msg: '操作成功' };
        }
        return { success: false, msg: res.data ? res.data.message : 'API 错误' };
    } catch (e) {
        return { success: false, msg: e.message };
    }
});

ipcMain.handle('fetch-member-photos', async (event, { token, pa, memberId, page, size }) => {
    if (!token) return { success: false, msg: '缺少 Token' };
    try {
        const headers = createHeaders(token, pa);
        const url = 'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/nft/user_nft_list';

        const payload = {
            starId: parseInt(memberId),
            size: size || 20,
            page: page || 0
        };

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return { success: true, content: res.data.content };
        }
        return { success: false, msg: res.data ? res.data.message : 'API 错误' };
    } catch (e) {
        return { success: false, msg: e.message };
    }
});

ipcMain.handle('fetch-user-money', async (event, { token, pa }) => {
    if (!token) return { success: false, msg: '缺少 Token' };
    try {
        const headers = createHeaders(token, pa);
        const url = 'https://pocketapi.48.cn/user/api/v1/user/money';

        const res = await axios.post(url, { token }, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return {
                success: true,
                content: res.data.content
            };
        }
        return { success: false, msg: res.data ? res.data.message : '接口返回错误' };
    } catch (e) {
        return { success: false, msg: e.message };
    }
});

ipcMain.handle('send-live-gift', async (event, { token, pa, giftId, liveId, acceptUserId, giftNum }) => {
    if (!token) return { success: false, msg: '缺少 Token' };

    try {
        const headers = createHeaders(token, pa);

        headers['appInfo'] = JSON.stringify({
            vendor: "apple",
            deviceId: "7B93DFD0-472F-4736-A628-E85FAE086487",
            appVersion: "7.1.35",
            appBuild: "25101021",
            osVersion: "16.3.0",
            osType: "ios",
            deviceName: "iPhone 14 Pro",
            os: "ios"
        });
        headers['User-Agent'] = 'PocketFans201807/7.1.35 (iPhone; iOS 16.3; Scale/3.00)';
        headers['Content-Type'] = 'application/json;charset=utf-8';

        delete headers['Origin'];
        delete headers['Referer'];

        const url = 'https://pocketapi.48.cn/gift/api/v1/gift/send';

        const realCrm = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString() + Math.random().toString().slice(2));

        const payload = {
            giftId: String(giftId),
            businessId: String(liveId),
            acceptUserId: String(acceptUserId),
            giftNum: Number(giftNum) || 1,
            isPocketGift: 0,
            businessCode: 0,
            zip: 0,
            isCombo: 0,
            ruleId: 0,
            giftType: 1,
            crm: realCrm
        };

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return {
                success: true,
                msg: res.data.message || '送礼成功',
                content: res.data.content
            };
        }

        return {
            success: false,
            msg: res.data ? res.data.message : '送礼失败'
        };
    } catch (e) {
        console.error('送礼请求失败:', e);
        return { success: false, msg: '网络错误: ' + e.message };
    }
});

ipcMain.handle('fetch-gift-list', async (event, { token, pa, liveId }) => {
    if (!token) return { success: false, msg: '缺少 Token' };
    try {
        const headers = createHeaders(token, pa);
        const url = 'https://pocketapi.48.cn/gift/api/v1/gift/list';

        const payload = {
            businessId: String(liveId),
            giftType: 1
        };

        const res = await axios.post(url, payload, { headers });

        if (res.status === 200 && res.data && res.data.status === 200) {
            return {
                success: true,
                content: res.data.content
            };
        }
        return { success: false, msg: res.data ? res.data.message : '获取礼物列表失败' };
    } catch (e) {
        return { success: false, msg: e.message };
    }
});

ipcMain.handle('get-nim-login-info', async (event, { token, pa }) => {
    if (!token) return { success: false, msg: '未登录' };
    try {
        const headers = createHeaders(token, pa);

        headers['appInfo'] = JSON.stringify({
            vendor: "apple",
            deviceId: "7B93DFD0-472F-4736-A628-E85FAE086487",
            appVersion: "7.1.35",
            appBuild: "25101021",
            osVersion: "16.3.0",
            osType: "ios",
            deviceName: "iPhone 14 Pro",
            os: "ios"
        });
        headers['User-Agent'] = 'PocketFans201807/7.1.35 (iPhone; iOS 16.3; Scale/3.00)';
        headers['Content-Type'] = 'application/json;charset=utf-8';

        const url = 'https://pocketapi.48.cn/user/api/v1/user/info/home';
        const res = await axios.post(url, {}, { headers });

        if (res.status === 200 && res.data && res.data.success) {
            const userInfo = res.data.content.userInfo;
            return {
                success: true,
                accid: userInfo.accId,
                token: token
            };
        }

        return { success: false, msg: '获取用户信息失败' };
    } catch (e) {
        console.error('获取IM信息失败:', e);
        return { success: false, msg: e.message };
    }
});
