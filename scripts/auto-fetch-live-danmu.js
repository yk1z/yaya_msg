#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { ensureStoragePaths } = require('../src/common/storage-paths');
const {
    applyOutputDir,
    fetchMemberList,
    filterMembers,
    generatePa,
    readJsonSafe,
    readToken,
    sleep
} = require('./auto-fetch-room-messages');

const APP_VERSION = '7.0.41';
const APP_BUILD = '24011601';
const DEFAULT_DELAY_MS = 800;

function printHelp() {
    console.log(`
自动抓取口袋录播弹幕 LRC，并转换成 JSONL。

用法:
  node scripts/auto-fetch-live-danmu.js --member "谢晓倩" --year 2026
  node scripts/auto-fetch-live-danmu.js --group GNZ --year 2026 --limit-members 10
  node scripts/auto-fetch-live-danmu.js --all-members --year 2025 --max-lives 20
  node scripts/auto-fetch-live-danmu.js --live-id 1260410190216105984 --member-name "GNZ48-吕思琪"

常用参数:
  --member <关键词>        只抓匹配成员名 / ID 的成员
  --group <关键词>         只抓匹配分团，例如 GNZ、SNH
  --all-members            抓成员列表中的全部成员
  --year <年份>            只保存该年份直播；不填则不过滤
  --live-id <ID>           只抓一个指定直播 ID
  --member-name <名称>     配合 --live-id 使用，写入 JSONL 的成员名
  --max-pages <数字>       每个成员最多抓直播列表页数，默认 0=抓到底
  --max-lives <数字>       每个成员最多处理多少场直播，默认 0=不限制
  --delay <毫秒>           每次请求间隔，默认 ${DEFAULT_DELAY_MS}
  --token <Token>          手动指定口袋 Token；不填则读取软件登录保存的 Token
  --pa <PA>                手动指定 pa；不填则用本地 2.wasm 生成
  --output-dir <路径>      自定义导出目录；默认 文档/牙牙消息/html
  --full                   忽略本地已有直播边界，从最新一直往前扫描
  --no-rank                不读取本场贡献榜补用户 ID
  --no-lrc                 不保存原始 LRC，只保存 JSONL
  --dry-run                只请求不写入文件
  --help                   显示帮助

说明:
  LRC 通常只包含昵称、文本和相对时间，不一定有用户 ID。
  默认会读取本场贡献榜 Top20，用贡献榜里的昵称和 ID 给弹幕补 userId。
  没进贡献榜或昵称重名的弹幕仍然会保留 userId 为空。
`);
}

function parseArgs(argv) {
    const args = {
        maxPages: 0,
        maxLives: 0,
        delay: DEFAULT_DELAY_MS,
        retry: 2,
        allMembers: false,
        full: false,
        saveLrc: true,
        fetchRank: true,
        dryRun: false
    };

    for (let i = 2; i < argv.length; i += 1) {
        const arg = argv[i];
        const readValue = () => {
            const value = argv[i + 1];
            if (!value || value.startsWith('--')) throw new Error(`${arg} 需要一个值`);
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
            case '--member-name':
                args.memberName = readValue();
                break;
            case '--group':
                args.group = readValue();
                break;
            case '--all-members':
                args.allMembers = true;
                break;
            case '--year':
                args.year = String(readValue()).trim();
                break;
            case '--live-id':
                args.liveId = String(readValue()).trim();
                break;
            case '--max-pages':
                args.maxPages = Number(readValue());
                break;
            case '--max-lives':
                args.maxLives = Number(readValue());
                break;
            case '--delay':
                args.delay = Number(readValue());
                break;
            case '--retry':
                args.retry = Number(readValue());
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
            case '--no-lrc':
                args.saveLrc = false;
                break;
            case '--no-rank':
                args.fetchRank = false;
                break;
            case '--dry-run':
                args.dryRun = true;
                break;
            default:
                throw new Error(`未知参数: ${arg}`);
        }
    }

    for (const key of ['maxPages', 'maxLives', 'delay', 'retry']) {
        if (!Number.isFinite(args[key]) || args[key] < 0) throw new Error(`--${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)} 必须是大于等于 0 的数字`);
    }
    if (args.limitMembers != null && (!Number.isFinite(args.limitMembers) || args.limitMembers <= 0)) {
        throw new Error('--limit-members 必须是大于 0 的数字');
    }

    return args;
}

function safeFileName(value) {
    return String(value || '未命名')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim() || '未命名';
}

function createDeviceId() {
    const chars = 'QWERTYUIOPASDFGHJKLZXCVBNM1234567890';
    const randomString = (length) => Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
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

function formatDateTime(timestamp, offsetSeconds = 0) {
    const base = Number(timestamp || 0);
    const date = new Date((base < 10000000000 ? base * 1000 : base) + Math.round(offsetSeconds * 1000));
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getLiveYear(live) {
    if (!live || typeof live !== 'object') return '';
    const raw = Number(live.startTime || live.ctime || live.updateTime || 0);
    if (!raw) return '';
    const date = new Date(raw < 10000000000 ? raw * 1000 : raw);
    return Number.isNaN(date.getTime()) ? '' : String(date.getFullYear());
}

function getLiveDateLabel(live) {
    if (!live || typeof live !== 'object') return '';
    const raw = Number(live.startTime || live.ctime || live.updateTime || 0);
    if (!raw) return '';
    const date = new Date(raw < 10000000000 ? raw * 1000 : raw);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shouldStopByYear(pageLives, year) {
    const targetYear = Number(year || 0);
    if (!targetYear || !Array.isArray(pageLives) || pageLives.length === 0) return false;
    const years = pageLives.map(getLiveYear).map(Number).filter(Boolean);
    return years.length > 0 && Math.max(...years) < targetYear;
}

function normalizeMember(rawMember) {
    const member = rawMember && typeof rawMember === 'object' ? rawMember : {};
    const ownerName = member.ownerName || member.name || member.nickname || member.nickName || member.memberName || member.realName || '';
    const teamName = member.teamName || member.groupName || member.team || member.group || member.club || '';
    return {
        ...member,
        ownerName: String(ownerName || '').trim(),
        teamName: String(teamName || '').trim(),
        userId: member.userId || member.id || member.ownerId || member.yklzId || ''
    };
}

async function withRetry(fn, retryCount, label) {
    let lastError = null;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < retryCount) {
                console.log(`[重试] ${label}: ${error.message}`);
                await sleep(800 + attempt * 800);
            }
        }
    }
    throw lastError;
}

async function fetchLiveListPage({ token, pa, userId, next = 0 }) {
    const payload = {
        debug: true,
        next: next || 0,
        record: true,
        limit: 20
    };
    if (userId) payload.userId = Number(userId);

    const response = await axios.post(
        'https://pocketapi.48.cn/live/api/v1/live/getLiveList',
        payload,
        { headers: createHeaders(token, pa), timeout: 45000 }
    );

    if (response.status === 200 && response.data && response.data.status === 200) {
        return response.data.content || {};
    }
    throw new Error(response.data?.message || response.data?.msg || '直播列表 API 错误');
}

async function fetchLiveOne({ token, pa, liveId }) {
    const tryUrls = [
        'https://pocketapi.48.cn/live/api/v1/live/getLiveOne',
        'https://pocketapi.48.cn/live/api/v1/live/getOpenLiveOne'
    ];
    let lastError = null;
    for (const url of tryUrls) {
        try {
            const response = await axios.post(
                url,
                { liveId: String(liveId) },
                { headers: createHeaders(token, pa), timeout: 45000 }
            );
            if (response.status === 200 && response.data && response.data.status === 200) {
                return response.data.content || {};
            }
            lastError = new Error(response.data?.message || response.data?.msg || '直播详情 API 错误');
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('直播详情 API 错误');
}

async function fetchLiveRank({ token, pa, liveId }) {
    const response = await axios.post(
        'https://pocketapi.48.cn/live/api/v2/live/getLiveRank',
        {
            type: 1,
            liveId: String(liveId)
        },
        { headers: createHeaders(token, pa), timeout: 45000 }
    );

    if (response.status === 200 && response.data && response.data.status === 200) {
        return response.data.content || {};
    }
    throw new Error(response.data?.message || response.data?.msg || '贡献榜 API 错误');
}

async function downloadLrc(url) {
    const secureUrl = String(url || '').replace(/^http:\/\//i, 'https://');
    const response = await axios.get(secureUrl, {
        responseType: 'text',
        timeout: 60000,
        transformResponse: [(data) => data]
    });
    return String(response.data || '');
}

function parsePocketDanmuLrc(fileContent) {
    const result = [];
    const timeRegex = /\[(\d+):(\d+):(\d+)\.(\d+)\]/;
    const lines = String(fileContent || '').split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const timeMatch = trimmed.match(timeRegex);
        if (!timeMatch) continue;

        const seconds = Number(timeMatch[1]) * 3600
            + Number(timeMatch[2]) * 60
            + Number(timeMatch[3])
            + Number(`0.${timeMatch[4]}`);
        const contentPart = trimmed.replace(timeMatch[0], '');
        const parts = contentPart.split('\t').map((part) => part.trim());
        const nickname = parts[0] || '';
        const text = parts.slice(1).join('').trim();
        if (!nickname && !text) continue;

        result.push({
            offsetSeconds: seconds,
            nickname,
            text,
            raw: trimmed
        });
    }

    return result;
}

function normalizeNickname(value) {
    return String(value || '')
        .replace(/[\u200b-\u200f\uFEFF]/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildRankUserMap(rankItems) {
    const grouped = new Map();
    for (const item of Array.isArray(rankItems) ? rankItems : []) {
        const user = item.user || {};
        const name = normalizeNickname(user.userName || user.nickName || item.userName || item.name || '');
        const userId = String(user.userId || user.id || user.uid || user.accountId || item.userId || item.id || item.uid || item.accountId || '').trim();
        if (!name || !userId) continue;
        const entry = {
            userId,
            userName: name,
            userAvatar: user.userAvatar || item.userAvatar || '',
            money: Number(item.money) || 0,
            rankIndex: grouped.size + 1
        };
        if (!grouped.has(name)) grouped.set(name, []);
        grouped.get(name).push(entry);
    }

    const unique = new Map();
    const ambiguous = new Set();
    for (const [name, entries] of grouped.entries()) {
        const ids = new Set(entries.map((entry) => entry.userId));
        if (ids.size === 1) unique.set(name, entries[0]);
        else ambiguous.add(name);
    }

    return { unique, ambiguous };
}

function buildRecordKey(record) {
    const raw = [
        record.liveId,
        record.timeStr,
        record.nameStr,
        record.text
    ].join('\u0001');
    return crypto.createHash('sha1').update(raw).digest('hex');
}

function readExistingRecords(jsonlPath) {
    const records = [];
    const byKey = new Map();
    if (!fs.existsSync(jsonlPath)) return { records, byKey };
    const lines = fs.readFileSync(jsonlPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const record = JSON.parse(line);
            const key = record.fetchKey || buildRecordKey(record);
            record.fetchKey = key;
            records.push(record);
            if (!byKey.has(key)) byKey.set(key, record);
        } catch (_) {
            // ignore broken lines
        }
    }
    return { records, byKey };
}

function getLiveIdFromItem(live) {
    if (!live || typeof live !== 'object') return '';
    return String(live.liveId || live.id || '').trim();
}

function buildExistingLiveIdSet(jsonlPath) {
    const existing = readExistingRecords(jsonlPath);
    const liveIds = new Set();
    for (const record of existing.records) {
        const liveId = String(record.liveId || '').trim();
        if (liveId) liveIds.add(liveId);
    }
    return liveIds;
}

function liveToJsonRecords({ live, member, danmuList, rankMap }) {
    const liveId = String(live.liveId || live.id || '');
    const startTime = live.startTime || live.ctime || 0;
    const memberName = member.ownerName || live.userInfo?.nickname || live.nickname || live.name || '未知成员';
    const groupName = member.teamName || member.team || member.groupName || '';
    const title = live.liveTitle || live.title || '';

    return danmuList.map((item, index) => {
        const timeStr = formatDateTime(startTime, item.offsetSeconds);
        const normalizedDanmuName = normalizeNickname(item.nickname);
        const rankUser = rankMap && rankMap.unique ? rankMap.unique.get(normalizedDanmuName) : null;
        const record = {
            source: 'pocket-live-danmu-lrc',
            roomType: 'live',
            msgType: 'LIVE_DANMU',
            isLiveText: true,
            liveId,
            liveTitle: title,
            liveStartTime: startTime || '',
            danmuOffsetSeconds: Number(item.offsetSeconds.toFixed(3)),
            memberName,
            groupName,
            senderName: normalizedDanmuName || item.nickname,
            nameStr: normalizedDanmuName || item.nickname,
            userId: rankUser ? rankUser.userId : '',
            avatarUrl: rankUser && rankUser.userAvatar
                ? (String(rankUser.userAvatar).startsWith('http') ? rankUser.userAvatar : `https://source.48.cn${rankUser.userAvatar}`)
                : '',
            rankMatched: !!rankUser,
            rankMoney: rankUser ? rankUser.money : 0,
            rankIndex: rankUser ? rankUser.rankIndex : 0,
            text: item.text,
            timeStr,
            msgTime: timeStr ? Date.parse(timeStr.replace(/-/g, '/')) : '',
            raw: item.raw,
            sortIndex: index
        };
        record.fetchKey = buildRecordKey(record);
        return record;
    });
}

function writeLiveRecords(jsonlPath, records, dryRun) {
    const existing = readExistingRecords(jsonlPath);
    const fresh = [];
    let updated = 0;

    for (const record of records) {
        const oldRecord = existing.byKey.get(record.fetchKey);
        if (!oldRecord) {
            fresh.push(record);
            continue;
        }

        const canEnrichUserId = !oldRecord.userId && record.userId;
        const canEnrichAvatar = !oldRecord.avatarUrl && record.avatarUrl;
        const canEnrichRank = !oldRecord.rankMatched && record.rankMatched;
        if (canEnrichUserId || canEnrichAvatar || canEnrichRank) {
            oldRecord.userId = oldRecord.userId || record.userId || '';
            oldRecord.avatarUrl = oldRecord.avatarUrl || record.avatarUrl || '';
            oldRecord.rankMatched = oldRecord.rankMatched || record.rankMatched || false;
            oldRecord.rankMoney = oldRecord.rankMoney || record.rankMoney || 0;
            oldRecord.rankIndex = oldRecord.rankIndex || record.rankIndex || 0;
            oldRecord.senderName = oldRecord.senderName || record.senderName || '';
            oldRecord.nameStr = oldRecord.nameStr || record.nameStr || '';
            updated += 1;
        }
    }

    if ((!fresh.length && !updated) || dryRun) {
        return {
            added: dryRun ? fresh.length : 0,
            updated: dryRun ? updated : 0,
            skipped: records.length - fresh.length - updated
        };
    }

    fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
    const finalRecords = existing.records.concat(fresh);
    fs.writeFileSync(jsonlPath, finalRecords.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8');
    return { added: fresh.length, updated, skipped: records.length - fresh.length - updated };
}

function makeMemberOutputDir(htmlDir, member) {
    const group = member.teamName || member.groupName || member.team || '未分团';
    const name = member.ownerName || member.memberName || member.nickname || '未知成员';
    const dir = path.join(htmlDir, safeFileName(`${group}-${name}`));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

async function fetchMemberLiveDanmu({ member, args, token, pa, htmlDir }) {
    const normalizedMember = normalizeMember(member);
    const shouldStop = typeof args.shouldStop === 'function' ? args.shouldStop : () => false;
    const onListPage = typeof args.onListPage === 'function' ? args.onListPage : null;
    const onLiveStart = typeof args.onLiveStart === 'function' ? args.onLiveStart : null;
    const onLiveDone = typeof args.onLiveDone === 'function' ? args.onLiveDone : null;
    const onNotice = typeof args.onNotice === 'function' ? args.onNotice : null;
    if (!normalizedMember.userId && !args.liveId) {
        throw new Error('成员缺少 userId，无法查询直播列表');
    }

    const outputDir = makeMemberOutputDir(htmlDir, normalizedMember);
    const jsonlPath = path.join(outputDir, `${safeFileName(`${normalizedMember.teamName || '未分团'}-${normalizedMember.ownerName || args.memberName || '未知成员'}-live-danmu`)}.jsonl`);
    const lrcDir = path.join(outputDir, 'live_lrc');
    if (args.saveLrc && !args.dryRun) fs.mkdirSync(lrcDir, { recursive: true });
    const existingLiveIds = (!args.liveId && !args.full) ? buildExistingLiveIdSet(jsonlPath) : new Set();
    if (existingLiveIds.size > 0) {
        console.log(`[边界] ${normalizedMember.ownerName} 本地已有 ${existingLiveIds.size} 场直播，遇到已抓直播会停止翻页。`);
        if (onNotice) onNotice(`${normalizedMember.ownerName} 本地已有 ${existingLiveIds.size} 场直播，启用增量续抓。`);
    }

    const lives = [];
    let boundaryStopped = false;
    if (args.liveId) {
        lives.push({
            liveId: args.liveId,
            title: args.memberName || '指定直播',
            userInfo: { nickname: args.memberName || normalizedMember.ownerName || '未知成员' }
        });
    } else {
        let next = 0;
        let page = 0;
        while (args.maxPages === 0 || page < args.maxPages) {
            if (shouldStop()) break;
            page += 1;
            console.log(`[列表] ${normalizedMember.ownerName} 第 ${page} 页，请求中...`);
            const content = await withRetry(
                () => fetchLiveListPage({ token, pa, userId: normalizedMember.userId, next }),
                args.retry,
                `${normalizedMember.ownerName} 直播列表第 ${page} 页`
            );
            const pageLives = (Array.isArray(content.liveList) ? content.liveList : []).filter((live) => live && typeof live === 'object');
            if (pageLives.length === 0) {
                console.log(`[列表] ${normalizedMember.ownerName} 第 ${page} 页没有更多直播，停止翻页。`);
                if (onNotice) onNotice(`${normalizedMember.ownerName} 没有更多直播，停止翻页。`);
                break;
            }
            const firstDate = getLiveDateLabel(pageLives[0]);
            const lastDate = getLiveDateLabel(pageLives[pageLives.length - 1]);
            const matchedBefore = lives.length;
            let pageBoundaryLiveId = '';
            for (const live of pageLives) {
                const liveId = getLiveIdFromItem(live);
                const liveYear = getLiveYear(live);
                if (!args.full && liveId && existingLiveIds.has(liveId) && (!args.year || liveYear === args.year || !liveYear)) {
                    pageBoundaryLiveId = liveId;
                    boundaryStopped = true;
                    break;
                }
                if (args.year && liveYear !== args.year) continue;
                lives.push(live);
                if (args.maxLives > 0 && lives.length >= args.maxLives) break;
            }
            console.log(`[列表] ${normalizedMember.ownerName} 第 ${page} 页 ${pageLives.length} 场${firstDate || lastDate ? ` (${firstDate || '?'} ~ ${lastDate || '?'})` : ''}，本页命中 ${lives.length - matchedBefore} 场，累计 ${lives.length} 场`);
            if (onListPage) {
                onListPage({
                    member: normalizedMember,
                    page,
                    pageCount: pageLives.length,
                    firstDate,
                    lastDate,
                    matched: lives.length - matchedBefore,
                    totalLives: lives.length,
                    boundaryLiveId: pageBoundaryLiveId
                });
            }
            if (pageBoundaryLiveId) {
                console.log(`[边界] ${normalizedMember.ownerName} 遇到已抓直播 ${pageBoundaryLiveId}，停止继续往前翻。`);
                if (onNotice) onNotice(`${normalizedMember.ownerName} 遇到已抓直播，停止继续往前翻。`);
                break;
            }
            next = content.next;
            if (args.year && shouldStopByYear(pageLives, args.year)) {
                console.log(`[列表] ${normalizedMember.ownerName} 已翻到 ${args.year} 年以前，停止翻页。`);
                if (onNotice) onNotice(`${normalizedMember.ownerName} 已翻到 ${args.year} 年以前，停止翻页。`);
                break;
            }
            if ((args.maxLives > 0 && lives.length >= args.maxLives) || !next || next === '0') break;
            await sleep(args.delay);
        }
    }

    let addedTotal = 0;
    let skippedTotal = 0;
    let updatedTotal = 0;
    let noDanmu = 0;
    let rankMatchedTotal = 0;
    let rankAmbiguousTotal = 0;
    let processed = 0;
    let failedLives = 0;

    for (const live of lives) {
        if (shouldStop()) break;
        if (!live || typeof live !== 'object') continue;
        const liveId = String(live.liveId || live.id || args.liveId || '');
        if (!liveId) continue;
        processed += 1;
        if (onLiveStart) onLiveStart({ member: normalizedMember, live, liveId, index: processed, total: lives.length });

        try {
            const detail = await withRetry(
                () => fetchLiveOne({ token, pa, liveId }),
                args.retry,
                `${normalizedMember.ownerName} ${liveId} 直播详情`
            );
            let rankItems = [];
            let rankMap = { unique: new Map(), ambiguous: new Set() };
            if (args.fetchRank) {
                try {
                    const rankContent = await withRetry(
                        () => fetchLiveRank({ token, pa, liveId }),
                        args.retry,
                        `${normalizedMember.ownerName} ${liveId} 贡献榜`
                    );
                    rankItems = Array.isArray(rankContent.data) ? rankContent.data : [];
                    rankMap = buildRankUserMap(rankItems);
                    rankAmbiguousTotal += rankMap.ambiguous.size;
                } catch (error) {
                    console.log(`[提示] ${normalizedMember.ownerName} ${liveId}: 贡献榜读取失败，弹幕不补 ID (${error.message})`);
                }
            }
            const danmuUrl = detail.msgFilePath || detail.messageFilePath || detail.danmuFilePath || detail.danmakuFilePath || '';
            const mergedLive = { ...live, ...detail, liveId };

            if (!danmuUrl) {
                noDanmu += 1;
                console.log(`[跳过] ${normalizedMember.ownerName} ${liveId}: 没有弹幕 LRC`);
                if (onLiveDone) {
                    onLiveDone({
                        member: normalizedMember,
                        live: mergedLive,
                        liveId,
                        index: processed,
                        total: lives.length,
                        skipped: true,
                        reason: '没有弹幕 LRC'
                    });
                }
                await sleep(args.delay);
                continue;
            }

            const lrcText = await withRetry(
                () => downloadLrc(danmuUrl),
                args.retry,
                `${normalizedMember.ownerName} ${liveId} 下载 LRC`
            );
            const danmuList = parsePocketDanmuLrc(lrcText);
            const records = liveToJsonRecords({ live: mergedLive, member: normalizedMember, danmuList, rankMap });
            const matchedCount = records.filter((record) => record.rankMatched).length;
            rankMatchedTotal += matchedCount;
            const result = writeLiveRecords(jsonlPath, records, args.dryRun);
            addedTotal += result.added;
            skippedTotal += result.skipped;
            updatedTotal += result.updated || 0;

            if (args.saveLrc && !args.dryRun) {
                const timeLabel = formatDateTime(mergedLive.startTime || mergedLive.ctime || 0).replace(/[: ]/g, '-');
                const lrcName = safeFileName(`${timeLabel || 'unknown'}-${liveId}-${mergedLive.liveTitle || mergedLive.title || '直播弹幕'}.lrc`);
                fs.writeFileSync(path.join(lrcDir, lrcName), lrcText, 'utf8');
            }

            console.log(`[完成] ${normalizedMember.ownerName} ${liveId}: 弹幕 ${records.length} 条，贡献榜 ${rankItems.length} 人，补 ID ${matchedCount} 条，新增 ${result.added} 条，更新 ${result.updated || 0} 条`);
            if (onLiveDone) {
                onLiveDone({
                    member: normalizedMember,
                    live: mergedLive,
                    liveId,
                    index: processed,
                    total: lives.length,
                    records: records.length,
                    rankCount: rankItems.length,
                    rankMatched: matchedCount,
                    added: result.added,
                    updated: result.updated || 0,
                    skipped: result.skipped
                });
            }
        } catch (error) {
            failedLives += 1;
            console.log(`[失败] ${normalizedMember.ownerName} ${liveId}: ${error.message}`);
            if (onLiveDone) {
                onLiveDone({
                    member: normalizedMember,
                    live,
                    liveId,
                    index: processed,
                    total: lives.length,
                    failed: true,
                    reason: error.message
                });
            }
            await sleep(args.delay);
            continue;
        }
        await sleep(args.delay);
    }

    return {
        memberName: normalizedMember.ownerName || args.memberName || '未知成员',
        lives: lives.length,
        processed,
        noDanmu,
        failedLives,
        boundaryStopped,
        existingLives: existingLiveIds.size,
        added: addedTotal,
        skipped: skippedTotal,
        updated: updatedTotal,
        rankMatched: rankMatchedTotal,
        rankAmbiguous: rankAmbiguousTotal,
        jsonlPath
    };
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help || (!args.liveId && !args.member && !args.group && !args.allMembers)) {
        printHelp();
        if (!args.help) process.exitCode = 1;
        return;
    }

    const storagePaths = applyOutputDir(ensureStoragePaths(), args.outputDir);
    const token = readToken(storagePaths, args.token);
    if (!token) {
        throw new Error(`没有找到口袋 Token。请先在软件里登录，或用 --token 手动指定。设置文件: ${storagePaths.settingsFile}`);
    }
    const pa = String(args.pa || '').trim() || await generatePa();

    const members = args.liveId
        ? [normalizeMember({ ownerName: args.memberName || '指定直播', teamName: '直播弹幕', userId: '' })]
        : filterMembers(await fetchMemberList(), args).map(normalizeMember);

    if (!members.length) {
        throw new Error('没有匹配到成员');
    }

    console.log(`输出目录: ${storagePaths.htmlDir}`);
    console.log(`准备处理 ${members.length} 个成员${args.year ? `，年份 ${args.year}` : ''}`);

    const summary = [];
    for (let i = 0; i < members.length; i += 1) {
        const member = members[i];
        console.log(`\n[${i + 1}/${members.length}] ${member.teamName || ''} ${member.ownerName || member.userId}`);
        try {
            const result = await fetchMemberLiveDanmu({ member, args, token, pa, htmlDir: storagePaths.htmlDir });
            summary.push({ ok: true, ...result });
            console.log(`[汇总] ${result.memberName}: 直播 ${result.processed}/${result.lives} 场，无弹幕 ${result.noDanmu} 场，补 ID ${result.rankMatched} 条，新增 ${result.added} 条，更新 ${result.updated} 条`);
        } catch (error) {
            summary.push({ ok: false, memberName: member.ownerName || member.userId, error: error.message });
            console.log(`[失败] ${member.ownerName || member.userId}: ${error.message}`);
        }
        if (args.delay > 0 && i < members.length - 1) await sleep(args.delay);
    }

    const okCount = summary.filter((item) => item.ok).length;
    const addedCount = summary.reduce((sum, item) => sum + (item.added || 0), 0);
    console.log(`\n完成: 成功 ${okCount}/${summary.length} 个成员，新增 ${addedCount} 条直播弹幕。`);
    const failed = summary.filter((item) => !item.ok);
    if (failed.length) {
        console.log('失败成员:');
        for (const item of failed) console.log(`  - ${item.memberName}: ${item.error}`);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`错误: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    DEFAULT_DELAY_MS,
    buildExistingLiveIdSet,
    buildRankUserMap,
    downloadLrc,
    fetchLiveListPage,
    fetchLiveOne,
    fetchLiveRank,
    fetchMemberLiveDanmu,
    formatDateTime,
    getLiveDateLabel,
    getLiveYear,
    liveToJsonRecords,
    normalizeMember,
    parseArgs,
    parsePocketDanmuLrc,
    printHelp,
    shouldStopByYear
};
