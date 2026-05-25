#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { ensureStoragePaths } = require('../src/common/storage-paths');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MEMBER_LIST_URL = 'https://yaya-data.pages.dev/members.json';
const APP_VERSION = '7.0.41';
const APP_BUILD = '24011601';
const DEFAULT_MAX_PAGES = 0;
const DEFAULT_DELAY_MS = 800;
const APP_USER_ID = '121569667';

function printHelp() {
    console.log(`
自动抓取口袋房间消息，并导出到软件可识别的 HTML。

用法:
  node scripts/auto-fetch-room-messages.js --member "卢静"
  node scripts/auto-fetch-room-messages.js --group GNZ --limit-members 20
  node scripts/auto-fetch-room-messages.js --all-members --max-pages 2
  node scripts/auto-fetch-room-messages.js --all-members --full --max-pages 0

常用参数:
  --member <关键词>        只抓匹配成员名 / ID / 房间号的成员
  --group <关键词>         只抓匹配分团的成员，例如 GNZ、SNH
  --all-members            抓成员列表中的全部成员
  --mode <all|member>      all=房间全部消息，member=只抓房主消息；默认 all
  --max-pages <数字>       最多抓多少页，每页 50 条；默认 0，表示直到没有更多
  --delay <毫秒>           每次请求后的间隔；默认 ${DEFAULT_DELAY_MS}
  --full                   忽略上次抓取位置，从最新一直往前抓
  --limit-members <数字>   限制处理的成员数量，适合先试跑
  --token <Token>          手动指定口袋 Token；不填则读取软件登录保存的 Token
  --pa <PA>                手动指定 pa；不填则用本地 2.wasm 生成
  --output-dir <路径>      自定义导出目录；默认 文档/牙牙消息/html
  --dry-run                只抓取不写入文件
  --help                   显示帮助

说明:
  默认是增量抓取。成功导出后会记录本次最新消息，下次自动从上次位置补新消息。
  输出目录与软件一致: 文档/牙牙消息/html/<成员名>/<分团-成员-channelId>.html
`);
}

function parseArgs(argv) {
    const args = {
        mode: 'all',
        maxPages: DEFAULT_MAX_PAGES,
        delay: DEFAULT_DELAY_MS,
        retry: 2,
        concurrency: 1,
        full: false,
        dryRun: false,
        allMembers: false
    };

    for (let i = 2; i < argv.length; i += 1) {
        const arg = argv[i];
        const readValue = () => {
            const value = argv[i + 1];
            if (!value || value.startsWith('--')) {
                throw new Error(`${arg} 需要一个值`);
            }
            i += 1;
            return value;
        };

        switch (arg) {
            case '--help':
            case '-h':
                args.help = true;
                break;
            case '--member':
                args.member = readValue();
                break;
            case '--group':
                args.group = readValue();
                break;
            case '--all-members':
                args.allMembers = true;
                break;
            case '--mode':
                args.mode = readValue();
                break;
            case '--max-pages':
                args.maxPages = Number(readValue());
                break;
            case '--delay':
                args.delay = Number(readValue());
                break;
            case '--retry':
                args.retry = Number(readValue());
                break;
            case '--concurrency':
                args.concurrency = Number(readValue());
                break;
            case '--limit-members':
                args.limitMembers = Number(readValue());
                break;
            case '--token':
                args.token = readValue();
                break;
            case '--pa':
                args.pa = readValue();
                break;
            case '--output-dir':
                args.outputDir = readValue();
                break;
            case '--full':
            case '--ignore-boundary':
                args.full = true;
                break;
            case '--dry-run':
                args.dryRun = true;
                break;
            default:
                throw new Error(`未知参数: ${arg}`);
        }
    }

    if (!['all', 'member'].includes(args.mode)) {
        throw new Error('--mode 只能是 all 或 member');
    }
    if (!Number.isFinite(args.maxPages) || args.maxPages < 0) {
        throw new Error('--max-pages 必须是大于等于 0 的数字');
    }
    if (!Number.isFinite(args.delay) || args.delay < 0) {
        throw new Error('--delay 必须是大于等于 0 的数字');
    }
    if (!Number.isFinite(args.retry) || args.retry < 0) {
        throw new Error('--retry 必须是大于等于 0 的数字');
    }
    if (!Number.isFinite(args.concurrency) || args.concurrency <= 0) {
        throw new Error('--concurrency 必须是大于 0 的数字');
    }
    if (args.limitMembers != null && (!Number.isFinite(args.limitMembers) || args.limitMembers <= 0)) {
        throw new Error('--limit-members 必须是大于 0 的数字');
    }

    return args;
}

function applyOutputDir(storagePaths, outputDir) {
    const customOutputDir = String(outputDir || '').trim();
    if (!customOutputDir) return storagePaths;
    const htmlDir = path.resolve(customOutputDir);
    fs.mkdirSync(htmlDir, { recursive: true });
    return {
        ...storagePaths,
        htmlDir
    };
}

function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal && signal.aborted) {
            reject(new Error('已停止'));
            return;
        }

        const timer = setTimeout(() => {
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            resolve();
        }, ms);

        function onAbort() {
            clearTimeout(timer);
            reject(new Error('已停止'));
        }

        if (signal) {
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

function formatMessageDate(message) {
    if (!message || typeof message !== 'object') return '';
    const rawTime = Number(message.msgTime || message.time || message.createTime || 0);
    if (!rawTime) return '';
    const timestamp = rawTime < 10000000000 ? rawTime * 1000 : rawTime;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getFetchedToDateLabel(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return '';
    return formatMessageDate(messages[messages.length - 1]) || formatMessageDate(messages[0]);
}

function readJsonSafe(filePath, fallbackValue) {
    try {
        if (!fs.existsSync(filePath)) return fallbackValue;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return fallbackValue;
    }
}

function writeJsonSafe(filePath, value) {
    const dir = path.dirname(filePath);
    const tempPath = `${filePath}.tmp`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value);
}

function escapeScriptJson(jsonText) {
    return jsonText.replace(/<\/script/gi, '<\\/script');
}

function safeFileName(value) {
    return String(value || '未命名成员').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名成员';
}

function createDeviceId() {
    const chars = 'QWERTYUIOPASDFGHJKLZXCVBNM1234567890';
    const randomString = (length) => {
        let result = '';
        for (let i = 0; i < length; i += 1) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    };

    return `${randomString(8)}-${randomString(4)}-${randomString(4)}-${randomString(4)}-${randomString(12)}`;
}

function createHeaders(token, pa) {
    const headers = {
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': `PocketFans201807/${APP_VERSION} (iPhone; iOS 16.3.1; Scale/2.00)`,
        Host: 'pocketapi.48.cn',
        'Accept-Language': 'zh-Hans-CN;q=1',
        appInfo: JSON.stringify({
            vendor: 'apple',
            deviceId: createDeviceId(),
            appVersion: APP_VERSION,
            appBuild: APP_BUILD,
            osVersion: '16.3.1',
            osType: 'ios',
            deviceName: 'iPhone XR',
            os: 'ios'
        })
    };

    if (token) headers.token = token;
    if (pa) headers.pa = pa;
    return headers;
}

async function generatePa() {
    const wasmInit = require(path.join(PROJECT_ROOT, 'rust-wasm.js'));
    const wasmBuffer = fs.readFileSync(path.join(PROJECT_ROOT, '2.wasm'));
    await wasmInit.default(wasmBuffer);
    return wasmInit.__x6c2adf8__();
}

function readToken(storagePaths, explicitToken) {
    const token = String(explicitToken || '').trim();
    if (token) return token;

    const settings = readJsonSafe(storagePaths.settingsFile, {});
    return String(settings.p48Token || '').trim();
}

function normalizeMember(rawMember) {
    const member = rawMember && typeof rawMember === 'object' ? rawMember : {};
    const ownerName = member.ownerName
        || member.name
        || member.nickname
        || member.nickName
        || member.memberName
        || member.realName
        || '';
    const teamName = member.teamName
        || member.groupName
        || member.team
        || member.group
        || member.club
        || '';

    return {
        ...member,
        ownerName: String(ownerName || '').trim(),
        teamName: String(teamName || '').trim(),
        channelId: member.channelId || member.roomId || member.channel_id || '',
        serverId: member.serverId || member.server_id || '',
        yklzId: member.yklzId || member.smallRoomId || member.smallChannelId || '',
        userId: member.userId || member.id || member.ownerId || member.yklzId || ''
    };
}

async function fetchMemberList() {
    const response = await axios.get(`${MEMBER_LIST_URL}?t=${Date.now()}`, { timeout: 60000 });
    const payload = response.data;
    const rawList = Array.isArray(payload)
        ? payload
        : (payload && (payload.roomId || payload.members || payload.data || payload.list));
    if (!Array.isArray(rawList)) {
        throw new Error('成员列表格式不正确');
    }

    return rawList.map(normalizeMember).filter((member) => member.channelId);
}

function filterMembers(members, args) {
    let result = members;

    if (args.member) {
        const keyword = String(args.member).trim().toLowerCase();
        result = result.filter((member) => {
            const haystack = [
                member.ownerName,
                member.name,
                member.nickname,
                member.nickName,
                member.teamName,
                member.userId,
                member.yklzId,
                member.channelId,
                member.serverId
            ].join(' ').toLowerCase();
            return haystack.includes(keyword);
        });
    }

    if (args.group) {
        const keyword = String(args.group).trim().toLowerCase();
        result = result.filter((member) => {
            const haystack = [
                member.teamName,
                member.groupName,
                member.group,
                member.team,
                member.ownerName
            ].join(' ').toLowerCase();
            return haystack.includes(keyword);
        });
    }

    if (args.limitMembers) {
        result = result.slice(0, args.limitMembers);
    }

    return result;
}

function isAbortError(error) {
    return error && (
        error.name === 'AbortError'
        || error.code === 'ERR_CANCELED'
        || error.message === 'canceled'
        || error.message === '已停止'
    );
}

async function resolveServerId(channelId, headers, signal) {
    try {
        const response = await axios.post(
            'https://pocketapi.48.cn/im/api/v1/im/team/room/info',
            { channelId: String(channelId) },
            { headers, timeout: 30000, signal }
        );
        if (response.data && response.data.success && response.data.content) {
            return response.data.content.serverId;
        }
    } catch (error) {
        if (isAbortError(error)) throw error;
    }

    return null;
}

async function fetchRoomMessagesPage({ channelId, serverId, token, pa, nextTime, fetchAll, signal }) {
    const headers = createHeaders(token, pa);
    let finalServerId = serverId;

    if (!finalServerId || Number(finalServerId) === 0) {
        finalServerId = await resolveServerId(channelId, headers, signal);
    }

    if (!finalServerId) {
        throw new Error('缺少 serverId，且自动获取失败');
    }

    const url = fetchAll
        ? 'https://pocketapi.48.cn/im/api/v1/team/message/list/all'
        : 'https://pocketapi.48.cn/im/api/v1/team/message/list/homeowner';

    const response = await axios.post(
        url,
        {
            channelId: parseInt(channelId, 10),
            serverId: parseInt(finalServerId, 10),
            nextTime: Number(nextTime) || 0,
            limit: 50
        },
        { headers, timeout: 45000, signal }
    );

    if (response.status === 200 && response.data && response.data.status === 200) {
        return { content: response.data.content || {}, usedServerId: finalServerId };
    }

    throw new Error((response.data && (response.data.message || response.data.msg)) || 'API 错误');
}

async function withRetry(fn, retryCount, label, signal) {
    let lastError = null;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
        if (signal && signal.aborted) {
            throw new Error('已停止');
        }
        try {
            return await fn();
        } catch (error) {
            if (isAbortError(error)) {
                throw error;
            }
            lastError = error;
            if (attempt < retryCount) {
                const waitMs = 1000 * (attempt + 1);
                console.warn(`  ${label} 失败，${waitMs}ms 后重试: ${error.message}`);
                await sleep(waitMs, signal);
            }
        }
    }

    throw lastError;
}

function getFetchBoundaryStorageKey(serverId, channelId, fetchAllMode) {
    return `yaya_fetch_boundary::${serverId || ''}::${channelId || ''}::${fetchAllMode ? 'all' : 'member'}`;
}

function buildFetchMessageKey(message) {
    if (!message) return '';

    let bodySeed = '';
    try {
        bodySeed = typeof message.bodys === 'string'
            ? message.bodys
            : JSON.stringify(message.bodys || message.msgContent || '');
    } catch (error) {
        bodySeed = String(message.bodys || message.msgContent || '');
    }

    return [
        message.id || message.msgId || message.messageId || message.clientMsgId || '',
        message.msgTime || '',
        message.msgType || '',
        message.senderUserId || message.senderId || message.uid || '',
        bodySeed
    ].join('|');
}

function buildExportKey(message, exportUserId, rawBody) {
    const primaryId = message.id || message.msgId || message.messageId || message.clientMsgId || '';
    const normalizedBody = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});
    const seed = [
        primaryId,
        message.msgTime || '',
        message.msgType || '',
        exportUserId || '',
        normalizedBody
    ].join('|');

    return crypto.createHash('sha1').update(seed).digest('hex');
}

function parseJsonMaybe(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || !/^[{[]/.test(trimmed)) return null;
    try {
        return JSON.parse(trimmed);
    } catch (error) {
        return null;
    }
}

function fix48Url(mediaPath) {
    const rawPath = String(mediaPath || '').trim();
    if (!rawPath) return '';
    if (/^https?:\/\//i.test(rawPath)) return rawPath;
    if (rawPath.includes('48.cn')) {
        return `https://${rawPath.replace(/^\/+/, '')}`;
    }

    return rawPath.startsWith('/')
        ? `https://source3.48.cn${rawPath}`
        : `https://source3.48.cn/${rawPath}`;
}

function getMessageBody(message) {
    if (message.msgContent != null) return message.msgContent;
    if (message.bodys != null) return message.bodys;
    return '';
}

function getMessageType(message, jsonBody) {
    return String(
        message.msgType
        || (jsonBody && jsonBody.messageType)
        || ''
    ).toUpperCase();
}

function getSenderInfo(message) {
    let ext = null;
    if (message.extInfo) {
        ext = typeof message.extInfo === 'string' ? parseJsonMaybe(message.extInfo) : message.extInfo;
    }
    const user = (ext && ext.user) || {};
    const userId = message.senderUserId || message.senderId || message.uid || user.userId || user.id || '';
    const nickName = message.senderName || user.nickName || user.userName || user.name || '未知用户';
    const roleId = user.roleId || message.roleId || '';
    const avatar = fix48Url(user.avatar || user.avatarUrl || message.senderAvatar || '');

    return { userId, nickName, roleId, avatar };
}

function formatTime(timeValue) {
    const date = new Date(Number(timeValue) || timeValue || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function renderGiftText(jsonBody) {
    const info = (jsonBody && (jsonBody.giftInfo || jsonBody)) || {};
    const giftName = info.giftName || info.name || '礼物';
    const giftNum = info.giftNum || info.num || info.count || '';
    const giftImg = fix48Url(info.picPath || info.giftPic || info.image || '');
    const unitCost = Number(info.money || info.cost || 0);
    const costDisplay = unitCost
        ? `<span style="margin-left:5px; color:#fa8c16; font-weight:bold;">(${unitCost * (Number(giftNum) || 1)}🍗)</span>`
        : '';
    return `
        <div class="mb-2" style="display:flex; align-items:center; background:#fff0f6; padding:6px 8px; border-radius:6px; border:1px solid #ffadd2; max-width: 300px;">
            ${giftImg ? `<img src="${escapeAttr(giftImg)}" style="width: 25px !important; height: 25px !important; max-width: 32px !important; max-height: 32px !important; object-fit: contain !important; margin: 0 8px 0 0 !important; border-radius: 4px; box-shadow: none !important;">` : '<span style="font-size:24px; margin-right:8px;">🎁</span>'}
            <div style="flex: 1; overflow: hidden;">
                <div style="color:#eb2f96; font-weight:bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">送出礼物：${escapeHtml(giftName)}</div>
                <div style="font-size:11px; color:#888;">数量: x${escapeHtml(giftNum || 1)} ${costDisplay}</div>
            </div>
        </div>`;
}

function renderRedPacket(jsonBody = {}) {
    const blessMessage = escapeHtml(jsonBody.blessMessage || '送来了红包祝福');
    const creatorName = escapeHtml(jsonBody.creatorName || '未知用户');
    const starName = escapeHtml(jsonBody.starName || '');
    const packetImage = fix48Url(jsonBody.openImgUrl || jsonBody.coverUrl);
    return `
        <div class="mb-2" style="display:flex; gap:8px; align-items:center; background:linear-gradient(135deg, rgba(255,120,117,0.12) 0%, rgba(255,120,117,0.04) 100%), rgba(0,0,0,0.02); padding:6px 8px; border-radius:10px; border:1px solid rgba(255,110,110,0.22); width: 220px; max-width: 220px; box-sizing: border-box;">
            ${packetImage ? `<img src="${escapeAttr(packetImage)}" style="width:34px; height:34px; border-radius:6px; object-fit:cover; flex-shrink:0; box-shadow:0 2px 6px rgba(0,0,0,0.12);">` : ''}
            <div style="min-width:0; flex:1;">
                <div style="font-size:10px; color:#ff7875; font-weight:bold; margin-bottom:2px;">红包</div>
                <div style="font-size:12px; color:#24292f; font-weight:bold; line-height:1.35; word-break:break-word;">${blessMessage}</div>
                <div style="font-size:11px; color:#444; margin-top:4px; line-height:1.35; word-break:break-word;">${creatorName}${starName ? ` · ${starName}` : ''}</div>
            </div>
        </div>`;
}

function renderLiveLink(jsonBody, type) {
    let info = {};
    let title = '直播';
    let liveId = '';
    let coverUrl = '';
    let memberName = '';

    if (type === 'LIVEPUSH' || type === 'LIVE_PUSH') {
        info = (jsonBody && (jsonBody.livePushInfo || jsonBody)) || {};
        title = info.liveTitle || '直播开始了';
        liveId = info.liveId || '';
        coverUrl = fix48Url(info.liveCover || '');
    } else {
        info = (jsonBody && jsonBody.shareInfo) || {};
        title = info.shareTitle || '直播分享';
        memberName = info.liveUserName || '';
        coverUrl = fix48Url(info.sharePic || '');
        if (info.jumpPath) {
            const match = String(info.jumpPath).match(/id=(\d+)/);
            if (match) liveId = match[1];
        }
    }

    if (!liveId) {
        return `<p class="mb-2 template-pre">${escapeHtml(`[直播] ${title}`)}</p>`;
    }

    return `<a href="live/playdetail?id=${escapeAttr(liveId)}" data-title="${escapeAttr(title)}" data-cover="${escapeAttr(coverUrl)}" data-member="${escapeAttr(memberName)}" target="_blank" style="display:none"></a>`;
}

function renderMessageContent(message, options = {}) {
    const includeMediaLinks = options.includeMediaLinks !== false;
    const rawBody = getMessageBody(message);
    const bodyText = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});
    const jsonBody = typeof rawBody === 'string' ? parseJsonMaybe(rawBody) : rawBody;
    const type = getMessageType(message, jsonBody);

    if (jsonBody && (jsonBody.messageType === 'GIFT_TEXT' || type === 'GIFT_TEXT')) {
        return renderGiftText(jsonBody);
    }
    if (jsonBody && String(jsonBody.messageType || type).toUpperCase().startsWith('RED_PACKET')) {
        return renderRedPacket(jsonBody);
    }

    if (type === 'TEXT') {
        const text = (jsonBody && (jsonBody.bodys || jsonBody.text)) || bodyText;
        return `<p class="mb-2 template-pre">${escapeHtml(text)}</p>`;
    }

    if (type === 'IMAGE') {
        const url = fix48Url(jsonBody && (jsonBody.url || jsonBody.imageUrl));
        if (!url) return '<p class="mb-2 template-pre">[图片]</p>';
        return `<div class="mb-2"><img class="template-media" src="${escapeAttr(url)}" loading="lazy" style="cursor: default;"/></div>`;
    }

    if (type === 'VIDEO') {
        const url = fix48Url(jsonBody && (jsonBody.url || jsonBody.videoUrl));
        if (!url) return '<p class="mb-2 template-pre">[视频]</p>';
        return `<div class="mb-2"><video class="template-media" src="${escapeAttr(url)}" controls preload="metadata"></video></div>${includeMediaLinks ? `<div class="mb-2">视频 - <a class="color-fg-accent" href="${escapeAttr(url)}" target="_blank">${escapeHtml(url)}</a></div>` : ''}`;
    }

    if (type === 'AUDIO') {
        const url = fix48Url(jsonBody && (jsonBody.url || jsonBody.voiceUrl || jsonBody.audioUrl));
        if (!url) return '<p class="mb-2 template-pre">[语音]</p>';
        return `<div class="mb-2"><audio class="template-media" src="${escapeAttr(url)}" controls preload="metadata"></audio></div>${includeMediaLinks ? `<div class="mb-2">语音 - <a class="color-fg-accent" href="${escapeAttr(url)}" target="_blank">${escapeHtml(url)}</a></div>` : ''}`;
    }

    if (type === 'REPLY' || type === 'GIFTREPLY') {
        const info = (jsonBody && (jsonBody.replyInfo || jsonBody.giftReplyInfo || (jsonBody.bodys && (jsonBody.bodys.replyInfo || jsonBody.bodys.giftReplyInfo)))) || {};
        const text = info.text || (jsonBody && jsonBody.text) || bodyText;
        const replyName = info.replyName || '未知用户';
        const replyText = info.replyText || '未知消息';
        return `<p class="mb-2 template-pre">${escapeHtml(text)}</p><blockquote class="ml-2 mb-2 p-2 color-bg-accent template-pre" style="border-left: 4px solid #d0d7de; color: #57606a;">${escapeHtml(replyName)}：${escapeHtml(replyText)}</blockquote>`;
    }

    if (type === 'EXPRESSIMAGE' || type === 'EXPRESS') {
        const info = (jsonBody && (jsonBody.expressImgInfo || jsonBody)) || {};
        const url = fix48Url(info.emotionRemote || info.url || info.imageUrl);
        if (!url) return '<p class="mb-2 template-pre">[表情]</p>';
        return `<div class="mb-2"><img class="template-image-express-image" src="${escapeAttr(url)}" loading="lazy"/></div>`;
    }

    if (type === 'LIVEPUSH' || type === 'LIVE_PUSH' || type === 'SHARE_LIVE' || (jsonBody && jsonBody.messageType === 'SHARE_LIVE')) {
        return renderLiveLink(jsonBody, type);
    }

    if (type === 'AUDIO_GIFT_REPLY' || type === 'AUDIO_REPLY') {
        const info = (jsonBody && (jsonBody.replyInfo || jsonBody.giftReplyInfo || jsonBody)) || {};
        const voiceUrl = fix48Url(info.voiceUrl || info.url);
        const replyName = info.replyName || '未知用户';
        const replyText = info.replyText || '';
        return `<div class="mb-2"><audio class="template-media" src="${escapeAttr(voiceUrl)}" controls preload="metadata"></audio></div><blockquote class="ml-2 mb-2 p-2 color-bg-accent template-pre" style="border-left: 4px solid #d0d7de; color: #57606a;">${escapeHtml(replyName)}：${escapeHtml(replyText)}</blockquote>`;
    }

    if (['FLIPCARD', 'FLIPCARD_AUDIO', 'FLIPCARD_VIDEO'].includes(type)) {
        const infoKeys = ['flipCardInfo', 'filpCardInfo', 'flipCardAudioInfo', 'filpCardAudioInfo', 'flipCardVideoInfo', 'filpCardVideoInfo'];
        const info = infoKeys.reduce((found, key) => found || (jsonBody && (jsonBody[key] || (jsonBody.bodys && jsonBody.bodys[key]))), null) || {};
        const question = info.question || (jsonBody && jsonBody.question) || '问题';
        let answer = info.answer || (jsonBody && jsonBody.answer) || '回答';
        let mediaHtml = '';

        if (type !== 'FLIPCARD') {
            try {
                const answerObj = typeof answer === 'string' ? JSON.parse(answer) : answer;
                if (answerObj && answerObj.url) {
                    const rawUrl = String(answerObj.url || '');
                    const mediaUrl = rawUrl.includes('48.cn')
                        ? fix48Url(rawUrl)
                        : `https://mp4.48.cn/${rawUrl.replace(/^\/+/, '')}`;
                    if (type === 'FLIPCARD_VIDEO') {
                        mediaHtml = `<div class="mb-2"><video class="template-media" src="${escapeAttr(mediaUrl)}" controls preload="metadata"></video></div>`;
                        answer = `<a class="color-fg-accent template-pre" href="${escapeAttr(mediaUrl)}" target="_blank">${escapeHtml(mediaUrl)}</a>`;
                    } else {
                        mediaHtml = `<div class="mb-2"><audio class="template-media" src="${escapeAttr(mediaUrl)}" controls preload="metadata"></audio></div>`;
                        answer = `<a class="color-fg-accent template-pre" href="${escapeAttr(mediaUrl)}" target="_blank">${escapeHtml(mediaUrl)}</a>`;
                    }
                }
            } catch (error) {
            }
        }

        const answerHtml = typeof answer === 'string' && /^<a\b/i.test(answer.trim())
            ? answer
            : escapeHtml(typeof answer === 'string' ? answer : JSON.stringify(answer));

        return `
            <p class="mb-2"><strong>翻牌问题：</strong>${escapeHtml(question)}</p>
            <p class="mb-2"><strong>回答：</strong>${answerHtml}</p>
            ${mediaHtml}
        `;
    }

    return `<p class="mb-2 template-pre">${escapeHtml(bodyText)}</p>`;
}

function extractMessageMeta(message) {
    const rawBody = getMessageBody(message);
    const bodyText = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});
    const jsonBody = typeof rawBody === 'string' ? parseJsonMaybe(rawBody) : rawBody;
    const type = getMessageType(message, jsonBody);
    const meta = {
        text: bodyText,
        hasImg: false,
        hasVideo: false,
        hasAudio: false,
        audioUrl: '',
        videoUrl: '',
        isReply: false,
        liveId: '',
        isLiveText: false,
        liveTitle: ''
    };

    if (type === 'TEXT') {
        meta.text = (jsonBody && (jsonBody.bodys || jsonBody.text)) || bodyText;
    } else if (jsonBody && String(jsonBody.messageType || type).toUpperCase().startsWith('RED_PACKET')) {
        meta.text = `[红包] ${jsonBody.blessMessage || ''} ${jsonBody.creatorName || ''}`.trim();
    } else if (type === 'IMAGE') {
        meta.hasImg = true;
        meta.text = '[图片]';
    } else if (type === 'EXPRESSIMAGE' || type === 'EXPRESS') {
        meta.text = '[表情]';
    } else if (type === 'VIDEO') {
        meta.hasVideo = true;
        meta.videoUrl = fix48Url(jsonBody && (jsonBody.url || jsonBody.videoUrl));
        meta.text = '[视频]';
    } else if (type === 'AUDIO') {
        meta.hasAudio = true;
        meta.audioUrl = fix48Url(jsonBody && (jsonBody.url || jsonBody.voiceUrl || jsonBody.audioUrl));
        meta.text = '[语音]';
    } else if (type === 'REPLY' || type === 'GIFTREPLY') {
        const info = (jsonBody && (jsonBody.replyInfo || jsonBody.giftReplyInfo || (jsonBody.bodys && (jsonBody.bodys.replyInfo || jsonBody.bodys.giftReplyInfo)))) || {};
        meta.text = info.text || (jsonBody && jsonBody.text) || bodyText;
    } else if (type === 'AUDIO_GIFT_REPLY' || type === 'AUDIO_REPLY') {
        const info = (jsonBody && (jsonBody.replyInfo || jsonBody.giftReplyInfo || jsonBody)) || {};
        meta.hasAudio = true;
        meta.audioUrl = fix48Url(info.voiceUrl || info.url);
        meta.text = info.replyText || '[语音回复]';
    } else if (['FLIPCARD', 'FLIPCARD_AUDIO', 'FLIPCARD_VIDEO'].includes(type)) {
        const infoKeys = ['flipCardInfo', 'filpCardInfo', 'flipCardAudioInfo', 'filpCardAudioInfo', 'flipCardVideoInfo', 'filpCardVideoInfo'];
        const info = infoKeys.reduce((found, key) => found || (jsonBody && (jsonBody[key] || (jsonBody.bodys && jsonBody.bodys[key]))), null) || {};
        meta.isReply = true;
        meta.text = `${info.question || (jsonBody && jsonBody.question) || '问题'} ${info.answer || (jsonBody && jsonBody.answer) || '回答'}`;
        if (type !== 'FLIPCARD') {
            try {
                const answer = info.answer || (jsonBody && jsonBody.answer);
                const answerObj = typeof answer === 'string' ? JSON.parse(answer) : answer;
                if (answerObj && answerObj.url) {
                    const rawUrl = String(answerObj.url || '');
                    const mediaUrl = rawUrl.includes('48.cn')
                        ? fix48Url(rawUrl)
                        : `https://mp4.48.cn/${rawUrl.replace(/^\/+/, '')}`;
                    if (type === 'FLIPCARD_AUDIO') {
                        meta.hasAudio = true;
                        meta.audioUrl = mediaUrl;
                    }
                    if (type === 'FLIPCARD_VIDEO') {
                        meta.hasVideo = true;
                        meta.videoUrl = mediaUrl;
                    }
                }
            } catch (error) {
                if (type === 'FLIPCARD_AUDIO') meta.hasAudio = true;
                if (type === 'FLIPCARD_VIDEO') meta.hasVideo = true;
            }
        }
    } else if (type === 'LIVEPUSH' || type === 'LIVE_PUSH') {
        const info = (jsonBody && (jsonBody.livePushInfo || jsonBody)) || {};
        meta.liveId = String(info.liveId || '');
        meta.liveTitle = info.liveTitle || '直播开始了';
        meta.isLiveText = !meta.liveId;
        meta.text = `[直播] ${meta.liveTitle}`;
    } else if (type === 'SHARE_LIVE' || (jsonBody && jsonBody.messageType === 'SHARE_LIVE')) {
        const info = (jsonBody && jsonBody.shareInfo) || {};
        const match = String(info.jumpPath || '').match(/id=(\d+)/);
        meta.liveId = match ? match[1] : '';
        meta.liveTitle = info.shareTitle || '直播分享';
        meta.isLiveText = !meta.liveId;
        meta.text = `[直播分享] ${meta.liveTitle}`;
    } else if (jsonBody && (jsonBody.messageType === 'GIFT_TEXT' || type === 'GIFT_TEXT')) {
        const info = jsonBody.giftInfo || jsonBody;
        meta.text = `[礼物] ${info.giftName || info.name || '礼物'} x${info.giftNum || info.num || info.count || 1}`;
    }

    return meta;
}

function messageToExportEntry(message) {
    const rawBody = getMessageBody(message);
    const bodySeed = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});
    const sender = getSenderInfo(message);
    const exportKey = buildExportKey(message, sender.userId, bodySeed);
    const timeStr = formatTime(message.msgTime);
    const avatarHtml = sender.avatar
        ? `<img class="avatar avatar-5 mr-2" src="${escapeAttr(sender.avatar)}" loading="lazy"/>`
        : '';
    const userHtml = `<div class="mb-2">${avatarHtml}<span data-userid="${escapeAttr(sender.userId)}" data-roleid="${escapeAttr(sender.roleId)}">${escapeHtml(sender.nickName)}</span></div>`;

    const itemHtml = `
            <li class="Box-row" data-export-key="${escapeAttr(exportKey)}">
                ${userHtml}
                ${renderMessageContent(message)}
                <time class="d-block">${escapeHtml(timeStr)}</time>
            </li>
        `;

    return {
        key: exportKey,
        sortTime: Number(message.msgTime) || Date.parse(timeStr) || 0,
        itemHtml
    };
}

function messageToJsonRecord(message, context = {}) {
    const rawBody = getMessageBody(message);
    const bodySeed = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});
    const sender = getSenderInfo(message);
    const exportKey = buildExportKey(message, sender.userId, bodySeed);
    const timeStr = formatTime(message.msgTime);
    const meta = extractMessageMeta(message);

    return {
        version: 1,
        exportKey,
        fetchKey: buildFetchMessageKey(message),
        sortTime: Number(message.msgTime) || Date.parse(timeStr) || 0,
        timeStr,
        msgTime: Number(message.msgTime) || 0,
        msgType: message.msgType || '',
        userId: sender.userId ? String(sender.userId) : '',
        nameStr: sender.nickName,
        avatarUrl: sender.avatar,
        roleId: sender.roleId || '',
        groupName: context.groupName || '',
        memberName: context.memberName || '',
        roomType: context.roomType || '',
        channelId: context.channelId || message.channelId || '',
        serverId: context.serverId || message.serverId || '',
        contentHtml: renderMessageContent(message, { includeMediaLinks: false }),
        text: String(meta.text || '').toLowerCase(),
        hasImg: meta.hasImg,
        hasVideo: meta.hasVideo,
        hasAudio: meta.hasAudio,
        audioUrl: meta.audioUrl,
        videoUrl: meta.videoUrl,
        isReply: meta.isReply,
        isFlip: meta.isReply,
        liveId: meta.liveId,
        isLiveText: meta.isLiveText,
        liveTitle: meta.liveTitle
    };
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
    <title>${escapeHtml(title)}</title>
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
    if (!match) return null;

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
    const itemRegex = /<li class="Box-row(?:\s[^>]*)?">([\s\S]*?)<time class="d-block">([\s\S]*?)<\/time>\s*<\/li>/gi;
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
    if (!fs.existsSync(filePath)) return [];
    const previousContent = fs.readFileSync(filePath, 'utf8');
    return parseStoredEntries(previousContent) || migrateLegacyEntries(previousContent);
}

function normalizeEntries(entries) {
    return (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry && entry.key && entry.itemHtml)
        .map((entry) => ({
            key: String(entry.key),
            sortTime: Number(entry.sortTime) || 0,
            itemHtml: String(entry.itemHtml)
        }));
}

function mergeEntries(existingEntries, incomingEntries) {
    const mergedMap = new Map();
    for (const entry of normalizeEntries(existingEntries)) {
        mergedMap.set(entry.key, entry);
    }

    let addedCount = 0;
    for (const entry of normalizeEntries(incomingEntries)) {
        if (!mergedMap.has(entry.key)) addedCount += 1;
        mergedMap.set(entry.key, entry);
    }

    const mergedEntries = Array.from(mergedMap.values()).sort((left, right) => {
        if (left.sortTime !== right.sortTime) return left.sortTime - right.sortTime;
        return left.key.localeCompare(right.key);
    });

    return { mergedEntries, addedCount };
}

function saveExportHtml({ storagePaths, memberName, entries, dryRun, fileName }) {
    const memberDir = path.join(storagePaths.htmlDir, safeFileName(memberName));
    const safeHtmlFileName = safeFileName(fileName || 'yaya_export.html').replace(/\.html$/i, '') + '.html';
    const filePath = path.join(memberDir, safeHtmlFileName);
    const existingEntries = loadExistingEntries(filePath);
    const { mergedEntries, addedCount } = mergeEntries(existingEntries, entries);

    if (dryRun) {
        return {
            path: filePath,
            changed: addedCount > 0,
            addedCount,
            totalCount: mergedEntries.length
        };
    }

    fs.mkdirSync(memberDir, { recursive: true });
    const styleValue = `
        body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; background-color: #f6f8fa; padding: 20px; }
        .template-body { width: 100%; max-width: 900px; margin: 0 auto; }
        .template-media { max-width: 600px; border-radius: 6px; margin-top: 5px; }
        .template-image-express-image { max-width: 85px; }
        .template-pre { white-space: pre-wrap; word-break: break-all; margin-bottom: 8px; }
        .avatar-5 { width: 32px; height: 32px; border-radius: 50%; vertical-align: middle; }
        .color-bg-accent { background-color: #f6f8fa; }
        .color-fg-accent { color: #0969da; text-decoration: none; }
    `;
    const htmlContent = buildExportDocument({
        title: '口袋消息导出',
        styleValue,
        entries: mergedEntries
    });
    fs.writeFileSync(filePath, htmlContent, 'utf8');

    return {
        path: filePath,
        changed: addedCount > 0,
        addedCount,
        totalCount: mergedEntries.length
    };
}

function getExportStyleValue() {
    return `
        body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; background-color: #f6f8fa; padding: 20px; }
        .template-body { width: 100%; max-width: 900px; margin: 0 auto; }
        .template-media { max-width: 600px; border-radius: 6px; margin-top: 5px; }
        .template-image-express-image { max-width: 85px; }
        .template-pre { white-space: pre-wrap; word-break: break-all; margin-bottom: 8px; }
        .avatar-5 { width: 32px; height: 32px; border-radius: 50%; vertical-align: middle; }
        .color-bg-accent { background-color: #f6f8fa; }
        .color-fg-accent { color: #0969da; text-decoration: none; }
    `;
}

function buildExportPrefix({ title, styleValue }) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://unpkg.com/@primer/css@20.8.3/dist/primer.css" />
    <style>${styleValue}</style>
</head>
<body class="template-body">
    <div class="d-flex flex-column">
        <div class="flex-auto p-2">
            <div class="Box">
                <ul class="f5" style="list-style: none; padding: 0; margin: 0;">
`;
}

function buildExportSuffix() {
    return `                </ul>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function extractExportKeys(htmlContent) {
    const keys = new Set();
    const regex = /data-export-key="([^"]+)"/g;
    let match;
    while ((match = regex.exec(htmlContent)) !== null) {
        keys.add(match[1]);
    }
    return keys;
}

function stripExportFooter(htmlContent) {
    const listCloseIndex = htmlContent.lastIndexOf('</ul>');
    if (listCloseIndex >= 0) {
        return htmlContent.slice(0, listCloseIndex);
    }

    const bodyCloseIndex = htmlContent.lastIndexOf('</body>');
    if (bodyCloseIndex >= 0) {
        return htmlContent.slice(0, bodyCloseIndex);
    }

    return htmlContent;
}

function createStreamingExportWriter({ storagePaths, memberName, fileName, dryRun }) {
    const memberDir = path.join(storagePaths.htmlDir, safeFileName(memberName));
    const safeHtmlFileName = safeFileName(fileName || 'yaya_export.html').replace(/\.html$/i, '') + '.html';
    const filePath = path.join(memberDir, safeHtmlFileName);
    const tempPath = `${filePath}.tmp-fetch`;
    const existingContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const knownKeys = extractExportKeys(existingContent);
    let addedCount = 0;
    let initialized = false;

    function init() {
        if (initialized || dryRun) return;
        fs.mkdirSync(memberDir, { recursive: true });
        const prefix = existingContent
            ? stripExportFooter(existingContent)
            : buildExportPrefix({ title: '口袋消息导出', styleValue: getExportStyleValue() });
        fs.writeFileSync(tempPath, `${prefix}\n`, 'utf8');
        initialized = true;
    }

    return {
        path: filePath,
        write(entries) {
            const incomingEntries = normalizeEntries(entries);
            const freshEntries = incomingEntries.filter((entry) => {
                if (knownKeys.has(entry.key)) return false;
                knownKeys.add(entry.key);
                return true;
            });

            if (freshEntries.length === 0) {
                return { addedCount, totalCount: knownKeys.size, pageAddedCount: 0 };
            }

            addedCount += freshEntries.length;
            if (!dryRun) {
                init();
                fs.appendFileSync(tempPath, `${freshEntries.map((entry) => entry.itemHtml).join('\n')}\n`, 'utf8');
            }

            return { addedCount, totalCount: knownKeys.size, pageAddedCount: freshEntries.length };
        },
        finish() {
            if (!dryRun) {
                init();
                fs.appendFileSync(tempPath, buildExportSuffix(), 'utf8');
                fs.renameSync(tempPath, filePath);
            }

            return {
                path: filePath,
                changed: addedCount > 0,
                addedCount,
                totalCount: knownKeys.size
            };
        },
        discard() {
            try {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch (error) {
            }
        }
    };
}

function createStreamingJsonlWriter({ storagePaths, memberName, fileName, dryRun }) {
    const memberDir = path.join(storagePaths.htmlDir, safeFileName(memberName));
    const safeJsonlFileName = safeFileName(fileName || 'yaya_export.jsonl').replace(/\.(jsonl|json)$/i, '') + '.jsonl';
    const filePath = path.join(memberDir, safeJsonlFileName);
    const knownKeys = new Set();
    let addedCount = 0;

    if (fs.existsSync(filePath)) {
        const previous = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
        for (const line of previous) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const record = JSON.parse(trimmed);
                const key = record.exportKey || record.key || record.fetchKey;
                if (key) knownKeys.add(String(key));
            } catch (error) {
            }
        }
    }

    return {
        path: filePath,
        write(records) {
            const freshRecords = (Array.isArray(records) ? records : [])
                .filter((record) => {
                    if (!record) return false;
                    const key = record.exportKey || record.key || record.fetchKey;
                    if (!key || knownKeys.has(String(key))) return false;
                    knownKeys.add(String(key));
                    return true;
                });

            if (freshRecords.length === 0) {
                return { addedCount, totalCount: knownKeys.size, pageAddedCount: 0 };
            }

            addedCount += freshRecords.length;
            if (!dryRun) {
                fs.mkdirSync(memberDir, { recursive: true });
                fs.appendFileSync(
                    filePath,
                    `${freshRecords.map((record) => JSON.stringify(record)).join('\n')}\n`,
                    'utf8'
                );
            }

            return { addedCount, totalCount: knownKeys.size, pageAddedCount: freshRecords.length };
        },
        finish() {
            return {
                path: filePath,
                changed: addedCount > 0,
                addedCount,
                totalCount: knownKeys.size
            };
        },
        discard() {
        }
    };
}

async function fetchMemberMessages({ member, args, token, pa, runtimeCache }) {
    const fetchAll = args.mode === 'all';
    let usedServerId = member.serverId || '';
    const channelId = member.channelId;
    let boundaryKey = getFetchBoundaryStorageKey(usedServerId, channelId, fetchAll);
    let stopMessageKey = args.full ? '' : String(runtimeCache[boundaryKey] || '');
    let nextTime = 0;
    let newestMessage = null;
    let stoppedAtPrevious = false;
    const fetchedMessages = [];

    for (let page = 1; ; page += 1) {
        if (args.shouldStop && args.shouldStop()) {
            return { messages: fetchedMessages, newestMessage, usedServerId, stoppedAtPrevious, reason: '已停止' };
        }

        if (args.maxPages > 0 && page > args.maxPages) {
            return { messages: fetchedMessages, newestMessage, usedServerId, stoppedAtPrevious, reason: '达到页数上限' };
        }

        let pageResult;
        try {
            pageResult = await withRetry(
                () => fetchRoomMessagesPage({
                    channelId,
                    serverId: usedServerId,
                    token,
                    pa,
                    nextTime,
                    fetchAll,
                    signal: args.abortSignal
                }),
                args.retry,
                `第 ${page} 页`,
                args.abortSignal
            );
        } catch (error) {
            if (isAbortError(error) || (args.shouldStop && args.shouldStop())) {
                return { messages: fetchedMessages, newestMessage, usedServerId, stoppedAtPrevious, reason: '已停止' };
            }
            throw error;
        }

        usedServerId = pageResult.usedServerId || usedServerId;
        const nextBoundaryKey = getFetchBoundaryStorageKey(usedServerId, channelId, fetchAll);
        if (nextBoundaryKey !== boundaryKey) {
            boundaryKey = nextBoundaryKey;
            stopMessageKey = args.full ? '' : String(runtimeCache[boundaryKey] || stopMessageKey || '');
        }

        const content = pageResult.content || {};
        let list = content.messageList || content.message || [];
        if (!Array.isArray(list)) list = [];

        if (!fetchAll) {
            list = list.filter((message) => {
                const sender = getSenderInfo(message);
                return String(sender.userId) !== APP_USER_ID;
            });
        }

        if (!newestMessage && list.length > 0) {
            newestMessage = list[0];
        }

        if (stopMessageKey) {
            const stopIndex = list.findIndex((message) => buildFetchMessageKey(message) === stopMessageKey);
            if (stopIndex >= 0) {
                list = list.slice(0, stopIndex);
                stoppedAtPrevious = true;
            }
        }

        let reachedExistingData = false;
        if (typeof args.onMessages === 'function' && list.length > 0) {
            const messageResult = await args.onMessages(list, { page, usedServerId, channelId, fetchAll });
            reachedExistingData = messageResult && messageResult.stopAtExisting === true;
        }

        if (reachedExistingData) {
            stoppedAtPrevious = true;
            return { messages: fetchedMessages, newestMessage, usedServerId, stoppedAtPrevious, reason: '到达已有数据位置' };
        }

        if (args.collectMessages !== false) {
            fetchedMessages.push(...list);
        }
        const fetchedTotal = args.collectMessages === false
            ? ((args.__fetchedTotal = (args.__fetchedTotal || 0) + list.length))
            : fetchedMessages.length;
        if (typeof args.onPage === 'function' && list.length > 0) {
            args.onPage({
                page,
                added: list.length,
                total: fetchedTotal,
                dateLabel: getFetchedToDateLabel(list)
            });
        }
        if (!args.silent) {
            process.stdout.write(`  第 ${page} 页: +${list.length} 条，累计 ${fetchedTotal} 条\r`);
        }

        if (stoppedAtPrevious) {
            if (!args.silent) process.stdout.write('\n');
            return { messages: fetchedMessages, newestMessage, usedServerId, stoppedAtPrevious, reason: '到达上次抓取位置' };
        }

        nextTime = Number(content.nextTime) || 0;
        if (list.length === 0 || !nextTime) {
            if (!args.silent) process.stdout.write('\n');
            return { messages: fetchedMessages, newestMessage, usedServerId, stoppedAtPrevious, reason: '没有更多消息' };
        }

        if (args.delay > 0) {
            try {
                await sleep(args.delay, args.abortSignal);
            } catch (error) {
                if (isAbortError(error) || (args.shouldStop && args.shouldStop())) {
                    return { messages: fetchedMessages, newestMessage, usedServerId, stoppedAtPrevious, reason: '已停止' };
                }
                throw error;
            }
        }
    }
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        return;
    }

    if (!args.member && !args.group && !args.allMembers) {
        printHelp();
        throw new Error('请指定 --member、--group 或 --all-members，避免误抓全部成员');
    }

    const storagePaths = applyOutputDir(ensureStoragePaths(), args.outputDir);
    const token = readToken(storagePaths, args.token);
    if (!token) {
        throw new Error(`没有找到口袋 Token。请先在软件里登录，或用 --token 手动指定。设置文件: ${storagePaths.settingsFile}`);
    }

    const pa = args.pa || await generatePa();
    const runtimeCache = readJsonSafe(storagePaths.runtimeCacheFile, {});
    const members = filterMembers(await fetchMemberList(), args);

    if (members.length === 0) {
        throw new Error('没有匹配到成员');
    }

    console.log(`匹配成员: ${members.length} 个`);
    console.log(`抓取模式: ${args.mode === 'all' ? '房间全部消息' : '只抓房主消息'}；${args.full ? '全量' : '增量'}；每成员最多 ${args.maxPages === 0 ? '不限' : args.maxPages} 页`);
    if (args.dryRun) {
        console.log('dry-run: 本次不会写入文件');
    }

    const summary = [];
    for (let index = 0; index < members.length; index += 1) {
        const member = members[index];
        const memberName = member.ownerName || member.name || member.nickname || String(member.channelId);
        const groupName = member.groupName || member.teamName || member.group || member.team || '未知分团';
        const exportPrefix = `${groupName}-${memberName}`;
        console.log(`\n[${index + 1}/${members.length}] ${memberName} channelId=${member.channelId} serverId=${member.serverId || '自动'}`);

        try {
            const result = await fetchMemberMessages({ member, args, token, pa, runtimeCache });
            const entries = result.messages.map(messageToExportEntry);
            const saved = saveExportHtml({
                storagePaths,
                memberName,
                fileName: `${exportPrefix}-${member.channelId}.html`,
                entries,
                dryRun: args.dryRun
            });

            if (!args.dryRun && result.newestMessage) {
                const boundaryKey = getFetchBoundaryStorageKey(result.usedServerId || member.serverId, member.channelId, args.mode === 'all');
                const boundaryValue = buildFetchMessageKey(result.newestMessage);
                if (boundaryValue) {
                    runtimeCache[boundaryKey] = boundaryValue;
                    writeJsonSafe(storagePaths.runtimeCacheFile, runtimeCache);
                }
            }

            console.log(`  ${result.reason}；新增导出 ${saved.addedCount} 条，共 ${saved.totalCount} 条`);
            console.log(`  ${saved.path}`);
            summary.push({ memberName, ok: true, added: saved.addedCount, total: saved.totalCount });
        } catch (error) {
            console.error(`  失败: ${error.message}`);
            summary.push({ memberName, ok: false, error: error.message });
        }

        if (args.delay > 0 && index < members.length - 1) {
            await sleep(args.delay);
        }
    }

    const okCount = summary.filter((item) => item.ok).length;
    const addedCount = summary.reduce((sum, item) => sum + (item.added || 0), 0);
    console.log(`\n完成: 成功 ${okCount}/${summary.length} 个成员，新增 ${addedCount} 条。`);
    const failed = summary.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.log('失败成员:');
        for (const item of failed) {
            console.log(`  - ${item.memberName}: ${item.error}`);
        }
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_DELAY_MS,
    DEFAULT_MAX_PAGES,
    buildFetchMessageKey,
    createStreamingExportWriter,
    createStreamingJsonlWriter,
    fetchMemberList,
    fetchMemberMessages,
    filterMembers,
    generatePa,
    getFetchBoundaryStorageKey,
    applyOutputDir,
    messageToExportEntry,
    messageToJsonRecord,
    parseArgs,
    printHelp,
    readJsonSafe,
    readToken,
    saveExportHtml,
    sleep,
    writeJsonSafe
};

if (require.main === module) {
    main().catch((error) => {
        console.error(`错误: ${error.message}`);
        process.exitCode = 1;
    });
}
