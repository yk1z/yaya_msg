#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEFAULT_DATA_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Documents', '牙牙消息', 'html');
let giftCatalogCache = null;

function parseArgs(argv) {
    const args = {
        dataDir: DEFAULT_DATA_DIR,
        outDir: path.resolve('reports'),
        year: String(new Date().getFullYear()),
        user: '',
        name: '',
        aliases: [],
        limitFiles: 0
    };

    for (let i = 2; i < argv.length; i += 1) {
        const arg = argv[i];
        const readValue = () => {
            const value = argv[i + 1];
            if (!value || value.startsWith('--')) throw new Error(`${arg} 需要一个值`);
            i += 1;
            return value;
        };

        if (arg === '--data-dir') args.dataDir = readValue();
        else if (arg === '--out-dir') args.outDir = path.resolve(readValue());
        else if (arg === '--year') args.year = String(readValue());
        else if (arg === '--user') args.user = String(readValue()).trim();
        else if (arg === '--name') args.name = String(readValue()).trim().toLowerCase();
        else if (arg === '--alias') args.aliases.push(readValue());
        else if (arg === '--limit-files') args.limitFiles = Number(readValue()) || 0;
        else if (arg === '--help' || arg === '-h') args.help = true;
        else throw new Error(`未知参数: ${arg}`);
    }

    return args;
}

function printHelp() {
    console.log(`
本地生成口袋消息年报

用法:
  node tools/build-year-report.js --year 2026 --user 113443136
  node tools/build-year-report.js --year 2026 --name "小王"

参数:
  --data-dir <目录>      消息目录，默认 文档/牙牙消息/html
  --out-dir <目录>       输出目录，默认 ./reports
  --year <年份>          年份，例如 2026
  --user <用户ID>        指定用户 ID，推荐
  --name <昵称关键词>    没有用户 ID 时可按昵称包含匹配
  --alias <昵称>         给 --user 手动补一个直播昵称，可重复传
  --limit-files <数量>   只扫描前 N 个文件，测试用
`);
}

function walkJsonlFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) walkJsonlFiles(fullPath, files);
        else if (item.isFile() && /\.jsonl$/i.test(item.name)) files.push(fullPath);
    }
    return files;
}

function normalizeAlias(value) {
    return String(value || '')
        .replace(/[\u200b-\u200f\uFEFF]/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getRecordYear(record) {
    const timeStr = String(record.timeStr || record.time || '');
    const match = timeStr.match(/^(\d{4})-/);
    if (match) return match[1];

    const rawTime = Number(record.msgTime || record.sortTime || 0);
    if (!rawTime) return '';
    const timestamp = rawTime < 10000000000 ? rawTime * 1000 : rawTime;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? '' : String(date.getFullYear());
}

function getRecordDate(record) {
    const timeStr = String(record.timeStr || record.time || '');
    const match = timeStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    const rawTime = Number(record.msgTime || record.sortTime || 0);
    if (!rawTime) return '';
    const timestamp = rawTime < 10000000000 ? rawTime * 1000 : rawTime;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getRecordHour(record) {
    const timeStr = String(record.timeStr || record.time || '');
    const match = timeStr.match(/\s(\d{2}):/);
    if (match) return Number(match[1]);

    const rawTime = Number(record.msgTime || record.sortTime || 0);
    if (!rawTime) return -1;
    const timestamp = rawTime < 10000000000 ? rawTime * 1000 : rawTime;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? -1 : date.getHours();
}

function classifyRecord(record) {
    const type = String(record.msgType || '').toUpperCase();
    const html = String(record.contentHtml || '');
    const text = String(record.text || '');
    if (record.isReply || /FLIPCARD/.test(type) || /翻牌问题[:：]/.test(html)) return 'flip';
    if (type.includes('GIFT') || /送出礼物/.test(html) || /^\[礼物\]/.test(text)) return 'gift';
    if (record.liveId || record.isLiveText || /LIVE/.test(type)) return 'live';
    if (record.hasAudio || type.includes('AUDIO')) return 'audio';
    if (record.hasVideo || type.includes('VIDEO')) return 'video';
    if (record.hasImg || type === 'IMAGE') return 'image';
    if (/EXPRESS/.test(type) || /template-image-express-image/.test(html) || /\[表情\]/.test(text)) return 'express';
    return 'text';
}

function bump(map, key, amount = 1) {
    const normalizedKey = String(key || '未知');
    map.set(normalizedKey, (map.get(normalizedKey) || 0) + amount);
}

function topEntries(map, limit = 10) {
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function bumpDetail(map, key, bucket) {
    const normalizedKey = String(key || '未知');
    const current = map.get(normalizedKey) || { total: 0, room: 0, live: 0, days: new Set(), roomDays: new Set(), liveDays: new Set(), month: Array.from({ length: 12 }, () => 0) };
    current.total += 1;
    if (bucket === 'live') current.live += 1;
    else current.room += 1;
    map.set(normalizedKey, current);
}

function bumpDetailMeta(map, key, bucket, date) {
    const current = map.get(String(key || '未知'));
    if (!current) return;
    if (date) {
        current.days.add(date);
        if (bucket === 'live') current.liveDays.add(date);
        else current.roomDays.add(date);
        const month = Number(date.slice(5, 7));
        if (month >= 1 && month <= 12) current.month[month - 1] += 1;
    }
}

function topDetailEntries(map, limit = 10) {
    return Array.from(map.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, limit);
}

function topObjectEntries(map, sortKey, limit = 10) {
    return Array.from(map.entries())
        .sort((a, b) => (b[1][sortKey] || 0) - (a[1][sortKey] || 0))
        .slice(0, limit);
}

function detailToPlain(detail) {
    return {
        total: detail.total || 0,
        room: detail.room || 0,
        live: detail.live || 0,
        days: detail.days ? detail.days.size : 0,
        roomDays: detail.roomDays ? detail.roomDays.size : 0,
        liveDays: detail.liveDays ? detail.liveDays.size : 0,
        month: detail.month || Array.from({ length: 12 }, () => 0)
    };
}

function topPlainDetailEntries(map, limit = 10) {
    return topDetailEntries(map, limit).map(([key, value]) => [key, detailToPlain(value)]);
}

function stripHtml(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function loadPocketGiftCatalog() {
    if (giftCatalogCache) return giftCatalogCache;

    const byId = new Map();
    const byName = new Map();
    const addCatalogItem = (rawItem) => {
        const id = String(rawItem && (rawItem.id || rawItem.giftId) || '').trim();
        const name = String(rawItem && (rawItem.name || rawItem.giftName) || '').trim();
        const cost = Number(rawItem && (rawItem.cost || rawItem.money || rawItem.price) || 0);
        if ((!id && !name) || !cost) return;
        const item = { id, name: name || id, cost };
        if (id) byId.set(id, item);
        if (name) byName.set(name.toLowerCase(), item);
    };
    const catalogPath = path.join(__dirname, '..', 'src', 'renderer', 'bootstrap-shared.js');
    try {
        const source = fs.readFileSync(catalogPath, 'utf8');
        const arrayMatch = source.match(/var\s+POCKET_GIFT_DATA\s*=\s*\[([\s\S]*?)\];/);
        const body = arrayMatch ? arrayMatch[1] : '';
        const itemPattern = /\{\s*name:\s*"([^"]+)"\s*,\s*cost:\s*([0-9.]+)\s*,\s*id:\s*"([^"]+)"[^}]*\}/g;
        let match;
        while ((match = itemPattern.exec(body))) {
            addCatalogItem({
                name: match[1].trim(),
                cost: Number(match[2]) || 0,
                id: match[3].trim()
            });
        }
    } catch (error) {
        // 礼物表只是补单价用，读取失败时仍然可以按消息本身生成报告。
    }

    const runtimeCachePaths = [
        process.env.APPDATA ? path.join(process.env.APPDATA, '牙牙消息', 'runtime-cache.json') : '',
        process.env.APPDATA ? path.join(process.env.APPDATA, 'yaya_msg', 'runtime-cache.json') : '',
        process.env.HOME ? path.join(process.env.HOME, 'Library', 'Application Support', '牙牙消息', 'runtime-cache.json') : '',
        process.env.HOME ? path.join(process.env.HOME, '.local', 'share', '牙牙消息', 'runtime-cache.json') : ''
    ].filter(Boolean);
    for (const cachePath of runtimeCachePaths) {
        try {
            if (!fs.existsSync(cachePath)) continue;
            const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            const giftList = cache && cache.POCKET_GIFT_DATA_CACHE;
            if (Array.isArray(giftList)) giftList.forEach(addCatalogItem);
        } catch (error) {
        }
    }

    giftCatalogCache = { byId, byName };
    return giftCatalogCache;
}

function normalizeResourceUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `https://source3.48.cn${url}`;
    return url;
}

function parseEmbeddedJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    const source = String(value);
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(source.slice(start, end + 1));
    } catch (error) {
        return null;
    }
}

function getGiftPayload(record) {
    const candidates = [
        record.giftInfo,
        record.body,
        record.payload,
        record.extInfo,
        record.rawBody,
        record.raw,
        record.fetchKey
    ];

    for (const candidate of candidates) {
        const parsed = parseEmbeddedJson(candidate);
        if (!parsed || typeof parsed !== 'object') continue;
        if (parsed.giftInfo) return parsed.giftInfo;
        if (parsed.body && parsed.body.giftInfo) return parsed.body.giftInfo;
        if (parsed.bodys && parsed.bodys.giftInfo) return parsed.bodys.giftInfo;
        if (parsed.giftName || parsed.giftId || parsed.picPath) return parsed;
    }
    return null;
}

function getRecordTimeValue(record) {
    const rawTime = Number(record.msgTime || record.sortTime || 0);
    if (rawTime) return rawTime < 10000000000 ? rawTime * 1000 : rawTime;
    const parsed = Date.parse(String(record.timeStr || record.time || '').replace(/-/g, '/'));
    return Number.isNaN(parsed) ? 0 : parsed;
}

const STOP_WORDS = new Set([
    '这个', '那个', '就是', '不是', '什么', '怎么', '可以', '没有', '还是', '因为',
    '所以', '然后', '如果', '但是', '真的', '哈哈', '哈哈哈', '一个', '一下',
    '今天', '明天', '昨天', '现在', '感觉', '谢谢', '妈妈', '宝宝', '姐姐',
    'the', 'and', 'you', 'are', 'for', 'with'
]);

function collectWords(text, wordMap) {
    const source = stripHtml(text)
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[0-9]+/g, ' ')
        .trim();
    if (!source) return;

    const latinWords = source.match(/[A-Za-z][A-Za-z0-9_]{2,}/g) || [];
    for (const word of latinWords) {
        const normalized = word.toLowerCase();
        if (!STOP_WORDS.has(normalized)) bump(wordMap, normalized);
    }

    const chineseText = source.replace(/[^\u4e00-\u9fff]/g, '');
    for (let i = 0; i < chineseText.length - 1; i += 2) {
        const word = chineseText.slice(i, i + 2);
        if (!STOP_WORDS.has(word)) bump(wordMap, word);
    }
}

function parseGiftInfo(record) {
    const html = String(record.contentHtml || '');
    const text = String(record.text || '');
    const source = `${stripHtml(html)} ${text}`;
    const payload = getGiftPayload(record) || {};
    const nameMatch = source.match(/送出礼物[:：]\s*([^\s数量xX（(]+)/)
        || text.match(/^\[礼物\]\s*([^\sxX]+)(?:\s+x\d+)?/);
    const countMatch = source.match(/数量[:：]\s*x?(\d+)/i)
        || text.match(/\sx(\d+)/i);
    const valueMatch = source.match(/(\d+)\s*🍗/);
    const imageMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);

    const giftId = String(payload.giftId || payload.id || '').trim();
    const payloadName = String(payload.giftName || payload.name || '').trim();
    const name = payloadName || (nameMatch ? nameMatch[1].trim() : '');
    if (!name) return null;

    const catalog = loadPocketGiftCatalog();
    const catalogItem = (giftId && catalog.byId.get(giftId)) || catalog.byName.get(name.toLowerCase()) || null;
    const count = Number(payload.giftNum || payload.num || payload.count || (countMatch ? countMatch[1] : 1)) || 1;
    const unitCost = Number(payload.cost || payload.money || payload.price || (catalogItem ? catalogItem.cost : 0)) || 0;
    const value = valueMatch ? Number(valueMatch[1]) || 0 : unitCost * count;
    const imageUrl = normalizeResourceUrl(
        payload.picPath || payload.giftPic || payload.image || payload.imageUrl || (imageMatch ? imageMatch[1] : '')
    );
    return {
        id: giftId,
        name,
        count,
        value,
        unitCost,
        imageUrl
    };
}

function getLiveContributionValue(record) {
    if (!record || typeof record !== 'object') return 0;
    if (!record.liveId && !record.isLiveText) return 0;
    const value = Number(record.rankMoney || record.contributionValue || record.liveGiftValue || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function getMessageBucket(record, type) {
    const roomType = String(record.roomType || '').toLowerCase();
    if (record.liveId || record.isLiveText || type === 'live' || roomType.includes('直播') || roomType.includes('live')) {
        return 'live';
    }
    return 'room';
}

function calculateLongestStreak(days) {
    const sorted = Array.from(days).sort();
    let longest = 0;
    let current = 0;
    let previousTime = 0;

    for (const day of sorted) {
        const time = Date.parse(`${day}T00:00:00`);
        if (!previousTime || time - previousTime === 86400000) {
            current += 1;
        } else {
            current = 1;
        }
        if (current > longest) longest = current;
        previousTime = time;
    }

    return longest;
}

function createEmptyReport(args) {
    return {
        year: args.year,
        user: args.user,
        nameKeyword: args.name,
        liveAliasMatched: 0,
        names: new Map(),
        nameDetails: new Map(),
        avatarUrls: new Map(),
        total: 0,
        bucketTotals: { room: 0, live: 0 },
        bucketChars: { room: 0, live: 0 },
        bucketDays: { room: new Set(), live: new Set() },
        bucketHour: {
            room: Array.from({ length: 24 }, () => 0),
            live: Array.from({ length: 24 }, () => 0)
        },
        bucketMonth: {
            room: Array.from({ length: 12 }, () => 0),
            live: Array.from({ length: 12 }, () => 0)
        },
        charCount: 0,
        days: new Set(),
        dayTotals: new Map(),
        memberDayTotals: new Map(),
        firstDate: '',
        lastDate: '',
        firstMessage: null,
        lastMessage: null,
        firstByBucket: { room: null, live: null },
        lastByBucket: { room: null, live: null },
        byType: new Map(),
        byMember: new Map(),
        byMemberDetails: new Map(),
        byGroup: new Map(),
        byMonth: Array.from({ length: 12 }, () => 0),
        byHour: Array.from({ length: 24 }, () => 0),
        gifts: new Map(),
        giftValues: new Map(),
        giftImages: new Map(),
        giftUnitPrices: new Map(),
        giftByMember: new Map(),
        giftMonth: {
            room: Array.from({ length: 12 }, () => 0),
            live: Array.from({ length: 12 }, () => 0)
        },
        giftMessages: 0,
        giftCount: 0,
        giftValue: 0,
        roomGiftValue: 0,
        liveGiftMessageValue: 0,
        liveContributionValue: 0,
        liveContributionLives: 0,
        liveContributionMonth: Array.from({ length: 12 }, () => 0),
        liveContributionByMember: new Map(),
        liveContributionSeen: new Set(),
        words: new Map(),
        bucketWords: {
            room: new Map(),
            live: new Map()
        },
        repeatedText: {
            room: new Map(),
            live: new Map(),
            all: new Map()
        },
        keywordMembers: {
            老公: new Map(),
            老婆: new Map(),
            宝宝: new Map()
        },
        previousRoomMembers: new Set(),
        previousLiveMembers: new Set(),
        previousGiftMembers: new Set(),
        sampleTexts: []
    };
}

function isLiveAliasCandidate(record) {
    if (String(record.userId || '').trim()) return false;
    const source = String(record.source || '').toLowerCase();
    const roomType = String(record.roomType || '').toLowerCase();
    const msgType = String(record.msgType || '').toUpperCase();
    return source.includes('live-danmu')
        || roomType.includes('live')
        || roomType.includes('直播')
        || msgType.includes('LIVE_DANMU');
}

function getRecordSenderName(record) {
    return normalizeAlias(record.nameStr || record.senderName || record.userName || record.nickname || '');
}

function matchesTarget(record, args) {
    if (args.user) {
        if (String(record.userId || '') === args.user) return true;
        const aliases = args.targetAliases instanceof Set ? args.targetAliases : new Set();
        if (isLiveAliasCandidate(record) && aliases.has(getRecordSenderName(record))) return true;
        return false;
    }
    if (args.name) {
        const name = String(record.nameStr || record.senderName || '').toLowerCase();
        if (!name.includes(args.name)) return false;
    }
    return args.user || args.name;
}

async function scanFile(filePath, args, report) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let record;
        try {
            record = JSON.parse(trimmed);
        } catch (error) {
            continue;
        }

        if (!matchesTarget(record, args)) continue;
        const matchedByLiveAlias = args.user
            && String(record.userId || '') !== args.user
            && isLiveAliasCandidate(record)
            && args.targetAliases instanceof Set
            && args.targetAliases.has(getRecordSenderName(record));

        const recordYear = getRecordYear(record);
        const date = getRecordDate(record);
        const hour = getRecordHour(record);
        const memberName = record.memberName || record.groupName || path.basename(path.dirname(filePath));
        const groupName = record.groupName || '';
        const type = classifyRecord(record);
        const text = String(record.text || stripHtml(record.contentHtml || '')).trim();
        const timeValue = getRecordTimeValue(record);
        const bucket = getMessageBucket(record, type);
        const displayName = record.nameStr || record.senderName || record.userId || '未知';

        if (recordYear !== args.year) {
            if (recordYear === String(Number(args.year) - 1)) {
                if (bucket === 'live') report.previousLiveMembers.add(memberName);
                else report.previousRoomMembers.add(memberName);
                if (type === 'gift') report.previousGiftMembers.add(memberName);
            }
            continue;
        }

        report.total += 1;
        if (matchedByLiveAlias) report.liveAliasMatched += 1;
        const textChars = text.replace(/\s/g, '').length;
        report.charCount += textChars;
        report.bucketTotals[bucket] += 1;
        report.bucketChars[bucket] += textChars;
        bump(report.names, displayName);
        bumpDetail(report.nameDetails, displayName, bucket);
        bumpDetailMeta(report.nameDetails, displayName, bucket, date);
        if (record.avatarUrl) bump(report.avatarUrls, record.avatarUrl);
        bump(report.byType, type);
        bump(report.byMember, memberName);
        bumpDetail(report.byMemberDetails, memberName, bucket);
        bumpDetailMeta(report.byMemberDetails, memberName, bucket, date);
        bump(report.byGroup, groupName);
        const liveContributionValue = getLiveContributionValue(record);
        if (bucket === 'live' && liveContributionValue > 0) {
            const liveContributionKey = [
                record.liveId || record.liveStartTime || record.timeStr || timeValue,
                record.userId || getRecordSenderName(record) || displayName,
                memberName
            ].join('\t');
            if (!report.liveContributionSeen.has(liveContributionKey)) {
                report.liveContributionSeen.add(liveContributionKey);
                report.liveContributionValue += liveContributionValue;
                report.liveContributionLives += 1;
                const current = report.liveContributionByMember.get(memberName) || { value: 0, lives: 0 };
                current.value += liveContributionValue;
                current.lives += 1;
                report.liveContributionByMember.set(memberName, current);
                const month = date ? Number(date.slice(5, 7)) : 0;
                if (month >= 1 && month <= 12) {
                    report.liveContributionMonth[month - 1] += liveContributionValue;
                    report.giftMonth.live[month - 1] += liveContributionValue;
                }
            }
        }
        if (type === 'gift') {
            const gift = parseGiftInfo(record);
            report.giftMessages += 1;
            if (gift) {
                bump(report.gifts, gift.name, gift.count);
                bump(report.giftValues, gift.name, gift.value);
                if (gift.imageUrl && !report.giftImages.has(gift.name)) report.giftImages.set(gift.name, gift.imageUrl);
                if (gift.unitCost > 0 && !report.giftUnitPrices.has(gift.name)) report.giftUnitPrices.set(gift.name, gift.unitCost);
                report.giftCount += gift.count;
                report.giftValue += gift.value;
                if (bucket === 'live') report.liveGiftMessageValue += gift.value;
                else report.roomGiftValue += gift.value;
                const current = report.giftByMember.get(memberName) || { messages: 0, count: 0, value: 0, room: 0, live: 0, gifts: new Map() };
                current.messages += 1;
                current.count += gift.count;
                current.value += gift.value;
                current[bucket] += gift.value;
                bump(current.gifts, gift.name, gift.count);
                report.giftByMember.set(memberName, current);
                const month = date ? Number(date.slice(5, 7)) : 0;
                if (month >= 1 && month <= 12) report.giftMonth[bucket][month - 1] += gift.value;
            }
        }
        if (date) {
            report.days.add(date);
            report.bucketDays[bucket].add(date);
            bump(report.dayTotals, date);
            bump(report.memberDayTotals, `${date}\t${memberName}`);
            if (!report.firstDate || date < report.firstDate) report.firstDate = date;
            if (!report.lastDate || date > report.lastDate) report.lastDate = date;
            const month = Number(date.slice(5, 7));
            if (month >= 1 && month <= 12) {
                report.byMonth[month - 1] += 1;
                report.bucketMonth[bucket][month - 1] += 1;
            }
        }
        if (hour >= 0 && hour < 24) {
            report.byHour[hour] += 1;
            report.bucketHour[bucket][hour] += 1;
        }
        if (!report.firstMessage || timeValue < report.firstMessage.timeValue) {
            report.firstMessage = { timeValue, timeStr: record.timeStr || '', text, memberName };
        }
        if (!report.lastMessage || timeValue > report.lastMessage.timeValue) {
            report.lastMessage = { timeValue, timeStr: record.timeStr || '', text, memberName };
        }
        if (!report.firstByBucket[bucket] || timeValue < report.firstByBucket[bucket].timeValue) {
            report.firstByBucket[bucket] = { timeValue, timeStr: record.timeStr || '', text, memberName };
        }
        if (!report.lastByBucket[bucket] || timeValue > report.lastByBucket[bucket].timeValue) {
            report.lastByBucket[bucket] = { timeValue, timeStr: record.timeStr || '', text, memberName };
        }
        collectWords(text, report.words);
        collectWords(text, report.bucketWords[bucket]);
        if (text && text.length <= 80 && !/https?:\/\//.test(text)) {
            bump(report.repeatedText.all, text);
            bump(report.repeatedText[bucket], text);
        }
        for (const keyword of Object.keys(report.keywordMembers)) {
            if (text.includes(keyword)) bump(report.keywordMembers[keyword], memberName);
        }
        if (text && report.sampleTexts.length < 12) report.sampleTexts.push(text.slice(0, 80));
    }
}

async function collectTargetAliasesFromFile(filePath, args, aliases) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let record;
        try {
            record = JSON.parse(trimmed);
        } catch (error) {
            continue;
        }

        if (getRecordYear(record) !== args.year) continue;
        if (String(record.userId || '') !== args.user) continue;

        const name = getRecordSenderName(record);
        if (name) aliases.add(name);
    }
}

async function collectTargetAliases(files, args) {
    const aliases = new Set((args.aliases || []).map(normalizeAlias).filter(Boolean));
    if (!args.user) return aliases;

    let scanned = 0;
    for (const file of files) {
        scanned += 1;
        process.stdout.write(`\r收集昵称 ${scanned}/${files.length}: ${path.basename(file).slice(0, 36)}...`);
        await collectTargetAliasesFromFile(file, args, aliases);
    }
    process.stdout.write('\n');
    return aliases;
}

function serializeReport(report, scannedFiles) {
    const topHour = report.byHour
        .map((count, hour) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)[0] || { hour: 0, count: 0 };
    const topRoomHour = report.bucketHour.room
        .map((count, hour) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)[0] || { hour: 0, count: 0 };
    const topLiveHour = report.bucketHour.live
        .map((count, hour) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)[0] || { hour: 0, count: 0 };
    const maxDay = topEntries(report.dayTotals, 1)[0] || ['', 0];
    const maxMemberDayRaw = topEntries(report.memberDayTotals, 1)[0] || ['', 0];
    const [maxMemberDayDate, maxMemberDayName] = String(maxMemberDayRaw[0] || '').split('\t');
    const roomMembers = new Set(Array.from(report.byMemberDetails.entries()).filter(([, value]) => value.room > 0).map(([name]) => name));
    const liveMembers = new Set(Array.from(report.byMemberDetails.entries()).filter(([, value]) => value.live > 0).map(([name]) => name));
    const giftMembers = new Set(report.giftByMember.keys());
    const lostRooms = Array.from(report.previousRoomMembers).filter((name) => !roomMembers.has(name)).slice(0, 12);
    const lostLiveRooms = Array.from(report.previousLiveMembers).filter((name) => !liveMembers.has(name)).slice(0, 12);
    const lostGiftMembers = Array.from(report.previousGiftMembers).filter((name) => !giftMembers.has(name)).slice(0, 12);
    const combinedGiftMembers = new Map();
    for (const [name, value] of report.giftByMember.entries()) {
        combinedGiftMembers.set(name, {
            messages: value.messages,
            count: value.count,
            value: value.value,
            room: value.room,
            live: value.live,
            liveContribution: 0,
            gifts: value.gifts
        });
    }
    for (const [name, value] of report.liveContributionByMember.entries()) {
        const current = combinedGiftMembers.get(name) || {
            messages: 0,
            count: 0,
            value: 0,
            room: 0,
            live: 0,
            liveContribution: 0,
            gifts: new Map()
        };
        current.liveContribution += value.value || 0;
        current.live += value.value || 0;
        current.value += value.value || 0;
        combinedGiftMembers.set(name, current);
    }
    const giftMemberRows = topObjectEntries(combinedGiftMembers, 'value', 10).map(([name, value]) => [
        name,
        {
            messages: value.messages,
            count: value.count,
            value: value.value,
            room: value.room,
            live: value.live,
            liveContribution: value.liveContribution || 0,
            gifts: topEntries(value.gifts, 6)
        }
    ]);
    const makeGiftRows = (entries) => entries.map(([name, count]) => {
        const totalValue = report.giftValues.get(name) || 0;
        const unitPrice = report.giftUnitPrices.get(name) || (count > 0 ? totalValue / count : 0);
        return [
            name,
            {
                count,
                value: totalValue,
                unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
                imageUrl: report.giftImages.get(name) || ''
            }
        ];
    });
    const allGiftRows = makeGiftRows(Array.from(report.gifts.entries()).sort((a, b) => {
        const valueDiff = (report.giftValues.get(b[0]) || 0) - (report.giftValues.get(a[0]) || 0);
        return valueDiff || b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-CN');
    }));
    const giftRows = allGiftRows.slice(0, 10);

    return {
        year: report.year,
        user: report.user,
        nameKeyword: report.nameKeyword,
        liveAliasMatched: report.liveAliasMatched,
        displayName: topEntries(report.names, 1)[0]?.[0] || report.user || report.nameKeyword || '未知用户',
        avatarUrl: topEntries(report.avatarUrls, 1)[0]?.[0] || '',
        total: report.total,
        bucketTotals: report.bucketTotals,
        bucketChars: report.bucketChars,
        bucketDays: {
            room: report.bucketDays.room.size,
            live: report.bucketDays.live.size
        },
        charCount: report.charCount,
        activeDays: report.days.size,
        longestStreak: calculateLongestStreak(report.days),
        firstDate: report.firstDate,
        lastDate: report.lastDate,
        firstMessage: report.firstMessage,
        lastMessage: report.lastMessage,
        firstByBucket: report.firstByBucket,
        lastByBucket: report.lastByBucket,
        topHour,
        topRoomHour,
        topLiveHour,
        maxDay: { date: maxDay[0], count: maxDay[1] },
        maxMemberDay: { date: maxMemberDayDate || '', memberName: maxMemberDayName || '', count: maxMemberDayRaw[1] || 0 },
        scannedFiles,
        byType: Object.fromEntries(report.byType),
        nicknameCount: report.nameDetails.size,
        nicknames: topPlainDetailEntries(report.nameDetails, 8),
        visitedMemberCount: report.byMemberDetails.size,
        byMember: topEntries(report.byMember, 12),
        byMemberDetails: topPlainDetailEntries(report.byMemberDetails, 16),
        roomMemberCount: roomMembers.size,
        liveMemberCount: liveMembers.size,
        byGroup: topEntries(report.byGroup, 8),
        byMonth: report.byMonth,
        byHour: report.byHour,
        bucketMonth: report.bucketMonth,
        bucketHour: report.bucketHour,
        giftMessages: report.giftMessages,
        giftCount: report.giftCount,
        giftValue: report.giftValue,
        roomGiftValue: report.roomGiftValue,
        liveGiftMessageValue: report.liveGiftMessageValue,
        liveContributionValue: report.liveContributionValue,
        liveContributionLives: report.liveContributionLives,
        totalGiftValue: report.giftValue + report.liveContributionValue,
        giftMonth: report.giftMonth,
        topGifts: giftRows,
        allGifts: allGiftRows,
        giftMembers: combinedGiftMembers.size,
        giftByMember: giftMemberRows,
        topWords: topEntries(report.words, 18),
        roomWords: topEntries(report.bucketWords.room, 18),
        liveWords: topEntries(report.bucketWords.live, 18),
        repeatedText: {
            room: topEntries(report.repeatedText.room, 3),
            live: topEntries(report.repeatedText.live, 3),
            all: topEntries(report.repeatedText.all, 3)
        },
        keywordMembers: Object.fromEntries(Object.entries(report.keywordMembers).map(([key, map]) => [key, topEntries(map, 12)])),
        lostRooms,
        lostLiveRooms,
        lostGiftMembers,
        generatedAt: new Date().toISOString().slice(0, 10),
        sampleTexts: report.sampleTexts
    };
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString('zh-CN');
}

function renderReportHtml(data) {
    const typeLabel = {
        text: '文字',
        audio: '语音',
        image: '图片',
        video: '视频',
        flip: '翻牌',
        gift: '礼物',
        live: '直播',
        express: '表情'
    };
    const renderSmallMessage = (message, emptyText) => message
        ? `<div class="message-card"><span>${escapeHtml(message.timeStr || '')}</span><b>${escapeHtml(message.memberName || '')}</b><p>${escapeHtml(message.text || '这一条没有文本内容')}</p></div>`
        : `<div class="message-card"><p>${escapeHtml(emptyText)}</p></div>`;
    const renderWordCloud = (entries) => entries.map(([word, count], index) => {
        const size = Math.max(14, 30 - Math.min(index, 10) * 1.5);
        return `<span style="font-size:${size}px" title="${formatNumber(count)} 次">${escapeHtml(word)}<small>${formatNumber(count)}</small></span>`;
    }).join('');
    const renderMonthBars = (values) => {
        const maxMonth = Math.max(1, ...values);
        return values.map((value, index) => {
            const height = Math.max(5, value / maxMonth * 100);
            return `<div class="month" title="${index + 1}月 ${formatNumber(value)} 条"><b>${formatNumber(value)}</b><i style="height:${height}%"></i><span>${index + 1}月</span></div>`;
        }).join('');
    };
    const renderHourBars = (values) => {
        const maxHour = Math.max(1, ...values);
        return values.map((value, hour) => {
            const height = Math.max(4, value / maxHour * 100);
            return `<div class="hour" title="${hour}:00 ${formatNumber(value)} 条"><b>${value ? formatNumber(value) : ''}</b><i style="height:${height}%"></i><span>${hour}</span></div>`;
        }).join('');
    };
    const renderMemberList = (items) => items.map((name, index) => `<li><em>${index + 1}</em><span>${escapeHtml(name)}</span></li>`).join('');
    const typeRows = Object.entries(data.byType)
        .sort((a, b) => b[1] - a[1])
        .map(([key, value]) => {
            const percent = value / Math.max(1, data.total) * 100;
            return `<div class="metric-line"><span>${typeLabel[key] || key}</span><strong>${formatNumber(value)} <small>${percent.toFixed(1)}%</small></strong><i style="width:${Math.max(5, percent)}%"></i></div>`;
        })
        .join('');
    const memberRows = data.byMember.map(([name, value], index) => `<li><em>${index + 1}</em><span>${escapeHtml(name)}</span><b>${formatNumber(value)} 条</b></li>`).join('');
    const nicknameRows = data.nicknames.map(([name, value]) => `<li><span>${escapeHtml(name)}</span><b>${formatNumber(value.total)} 次</b><small>直播${formatNumber(value.live)}次 | 房间${formatNumber(value.room)}次</small></li>`).join('');
    const memberDetailRows = data.byMemberDetails.map(([name, value], index) => `<li><em>${index + 1}</em><span>${escapeHtml(name)}</span><b>${formatNumber(value.total)} 次</b><small>房间${formatNumber(value.room)}次/${formatNumber(value.roomDays)}天 | 直播${formatNumber(value.live)}次/${formatNumber(value.liveDays)}天</small></li>`).join('');
    const topMember = data.byMemberDetails[0] || null;
    const secondMember = data.byMemberDetails[1] || null;
    const pushCards = [topMember, secondMember].filter(Boolean).map(([name, value], index) => `
        <div class="push-card">
            <div class="push-avatar">${index + 1}</div>
            <div>
                <p>过去一年你的${index === 0 ? '首推' : '二推'}是 <b>${escapeHtml(name)}</b></p>
                <p>你和她口袋互动了 <b>${formatNumber(value.total)}</b> 次</p>
                <small>其中房间 ${formatNumber(value.room)} 次 | 直播 ${formatNumber(value.live)} 次</small>
            </div>
        </div>
    `).join('');
    const hourBars = renderHourBars(data.byHour);
    const monthBars = renderMonthBars(data.byMonth);
    const wordCloud = renderWordCloud(data.topWords);
    const roomWordCloud = renderWordCloud(data.roomWords || []);
    const liveWordCloud = renderWordCloud(data.liveWords || []);
    const samples = data.sampleTexts.slice(0, 5).map((text) => `<li>${escapeHtml(text)}</li>`).join('');
    const topType = Object.entries(data.byType).sort((a, b) => b[1] - a[1])[0] || ['text', 0];
    const renderGiftRows = (items) => items.map(([name, value], index) => {
        const image = value.imageUrl
            ? `<img class="gift-icon" src="${escapeHtml(value.imageUrl)}" alt="">`
            : '<span class="gift-icon gift-icon-fallback">礼</span>';
        const unitPrice = Number(value.unitPrice || 0);
        const totalValue = Number(value.value || 0);
        const unitText = unitPrice > 0 ? `${formatNumber(unitPrice)} 鸡腿/个` : '单价未知';
        const totalText = totalValue > 0 ? `${formatNumber(totalValue)} 鸡腿` : '价值待补';
        return `<li class="gift-row"><em>${index + 1}</em>${image}<div class="gift-meta"><span class="gift-name">${escapeHtml(name)}</span><small>${unitText}</small></div><div class="gift-value"><b>${formatNumber(value.count)} 个</b><small>${totalText}</small></div></li>`;
    }).join('');
    const giftRows = renderGiftRows(data.topGifts || []);
    const allGiftRows = renderGiftRows(data.allGifts || data.topGifts || []);
    const giftMemberRows = data.giftByMember.map(([name, value], index) => {
        const giftNames = value.gifts.map(([giftName, count]) => `${escapeHtml(giftName)} x${formatNumber(count)}`).join(' / ');
        return `<li><em>${index + 1}</em><span>${escapeHtml(name)}</span><b>${formatNumber(value.value)} 鸡腿</b><small>房间${formatNumber(value.room)} | 直播${formatNumber(value.live)}${value.liveContribution ? ` | 贡献榜${formatNumber(value.liveContribution)}` : ''}${giftNames ? ' · ' + giftNames : ''}</small></li>`;
    }).join('');
    const repeatedRoom = data.repeatedText.room[0] || null;
    const repeatedLive = data.repeatedText.live[0] || null;
    const keywordSections = Object.entries(data.keywordMembers || {}).map(([keyword, items]) => {
        const rows = items.map(([name, count]) => `<li><em>${formatNumber(count)}</em><span>${escapeHtml(name)}</span></li>`).join('');
        return rows ? `<div class="keyword-box"><h3>${escapeHtml(keyword)}</h3><ol class="rank compact">${rows}</ol></div>` : '';
    }).join('');
    const lostRoomRows = renderMemberList(data.lostRooms || []);
    const lostLiveRows = renderMemberList(data.lostLiveRooms || []);
    const lostGiftRows = renderMemberList(data.lostGiftMembers || []);
    const avatar = data.avatarUrl
        ? `<img class="avatar" src="${escapeHtml(data.avatarUrl)}" alt="">`
        : `<div class="avatar avatar-fallback">${escapeHtml(String(data.displayName || '?').slice(0, 1))}</div>`;
    const coverAvatar = data.avatarUrl
        ? `<img class="cover-avatar-bg" src="${escapeHtml(data.avatarUrl)}" alt="">`
        : '';
    const firstMessage = data.firstMessage
        ? `<div class="message-card"><span>${escapeHtml(data.firstMessage.timeStr || data.firstDate || '')}</span><b>${escapeHtml(data.firstMessage.memberName || '')}</b><p>${escapeHtml(data.firstMessage.text || '这一条没有文本内容')}</p></div>`
        : '<div class="message-card"><p>暂无第一条消息</p></div>';
    const lastMessage = data.lastMessage
        ? `<div class="message-card"><span>${escapeHtml(data.lastMessage.timeStr || data.lastDate || '')}</span><b>${escapeHtml(data.lastMessage.memberName || '')}</b><p>${escapeHtml(data.lastMessage.text || '这一条没有文本内容')}</p></div>`
        : '<div class="message-card"><p>暂无最后一条消息</p></div>';

    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.displayName)} ${escapeHtml(data.year)} 年报</title>
<style>
*{box-sizing:border-box}
:root{--bg:#0c1016;--page:#141a22;--page2:#171e27;--panel:rgba(24,31,41,.82);--line:rgba(220,230,241,.11);--text:#f6f1e8;--muted:#a8b4c2;--soft:#d7e0ea;--gold:#f7c86a;--pink:#ff6fa8;--blue:#83b8ff}
html{scroll-snap-type:y proximity;background:var(--bg)}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text)}
.report{width:min(100%,430px);margin:0 auto;background:var(--page);box-shadow:0 20px 70px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.06)}
.page{position:relative;min-height:100svh;scroll-snap-align:start;overflow:hidden;padding:40px 28px 32px;display:flex;flex-direction:column;justify-content:space-between;border-bottom:1px solid var(--line);background:linear-gradient(180deg,var(--page2),var(--page))}
.page:nth-child(2n){background:linear-gradient(180deg,#151b24,#101720)}.page::before{content:"";position:absolute;left:28px;right:28px;top:24px;height:3px;border-radius:999px;background:linear-gradient(90deg,var(--gold),var(--pink),var(--blue));opacity:.72}.page>*{position:relative;z-index:1}.kicker{display:none}.brand{font-size:14px;color:var(--muted)}
h1{font-size:40px;line-height:1.08;margin:22px 0 0;letter-spacing:0;font-weight:850}.name{color:var(--gold)}.big{font-size:66px;line-height:.95;font-weight:850;letter-spacing:0;color:var(--gold)}
.caption{font-size:16px;line-height:1.75;color:var(--soft);margin:14px 0}.muted{color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px;box-shadow:0 16px 40px rgba(0,0,0,.16);backdrop-filter:blur(14px)}
.cover-avatar-bg{position:absolute;right:-58px;top:56px;width:230px;height:230px;border-radius:50%;object-fit:cover;opacity:.10;filter:grayscale(.1);z-index:0}.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.chip{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.055);color:#cbd5df;font-size:12px}.chip b{color:#fff}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px}.stat{background:rgba(255,255,255,.055);border:1px solid var(--line);border-radius:9px;padding:14px}.stat span{display:block;font-size:12px;color:var(--muted)}.stat b{display:block;margin-top:8px;font-size:28px}
h2{font-size:29px;line-height:1.18;margin:0 0 18px;letter-spacing:0;font-weight:850}.metric-line{position:relative;display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid var(--line);overflow:hidden}.metric-line:last-child{border-bottom:0}.metric-line i{position:absolute;left:0;bottom:0;height:3px;background:linear-gradient(90deg,var(--pink),var(--gold));border-radius:4px}.metric-line small{font-size:11px;color:var(--muted);font-weight:500;margin-left:5px}
.rank{list-style:none;margin:0;padding:0}.rank li{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:10px;align-items:center;padding:13px 0;border-bottom:1px solid var(--line)}.rank li:last-child{border-bottom:0}.rank em{font-style:normal;color:var(--gold);font-weight:800}.rank span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rank b{color:#fff}
.rank li.gift-row{grid-template-columns:26px 42px minmax(0,1fr) auto;gap:10px}.gift-icon{width:40px;height:40px;border-radius:10px;object-fit:contain;background:rgba(255,255,255,.08);border:1px solid var(--line);padding:4px}.gift-icon-fallback{display:flex;align-items:center;justify-content:center;color:var(--gold);font-weight:800}.gift-meta{min-width:0}.gift-meta .gift-name{display:block;font-weight:760;font-size:15px}.gift-meta small,.gift-value small{display:block;margin-top:4px;color:var(--muted);font-size:11px;line-height:1.25}.gift-value{text-align:right}.gift-value b{display:block;color:#fff;font-size:17px}
.gift-all-panel{max-height:68svh;overflow:auto;padding-right:10px}.gift-all-panel::-webkit-scrollbar{width:6px}.gift-all-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.24);border-radius:999px}.gift-all-panel .gift-row{padding:11px 0}.rank.compact li{grid-template-columns:40px 1fr}.rank.compact em{color:var(--pink);font-weight:800;text-align:right}
.detail-list{list-style:none;margin:0;padding:0}.detail-list li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 12px;padding:13px 0;border-bottom:1px solid var(--line)}.detail-list li:last-child{border-bottom:0}.detail-list span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px}.detail-list b{color:var(--pink);font-size:22px}.detail-list small{grid-column:1 / -1;color:var(--soft);text-align:right}
.push-card{display:grid;grid-template-columns:56px 1fr;gap:16px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}.push-card:last-child{border-bottom:0}.push-avatar{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#202936;border:2px solid var(--gold);color:var(--gold);font-weight:850}.push-card p{margin:0 0 5px;line-height:1.45}.push-card b{color:var(--pink)}.push-card small{color:var(--soft)}
.gift-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.gift-stat{border:1px solid var(--line);background:rgba(255,255,255,.055);border-radius:9px;padding:13px}.gift-stat span{display:block;color:var(--muted);font-size:12px}.gift-stat b{display:block;margin-top:7px;color:#fff;font-size:23px}
.hours{display:flex;gap:5px;height:210px;align-items:end;margin-top:18px}.hour{flex:1;height:100%;display:flex;flex-direction:column;justify-content:end;align-items:center;color:#94a1b0;font-size:10px;min-width:0}.hour b{writing-mode:vertical-rl;max-height:66px;overflow:hidden;color:#dce7f2;font-size:9px;font-weight:600;margin-bottom:4px}.hour i{display:block;width:100%;max-width:14px;background:linear-gradient(180deg,var(--blue),#4c6c9a);border-radius:5px 5px 0 0}
.samples{list-style:none;margin:0;padding:0}.samples li{margin:12px 0;padding:13px 14px;background:rgba(255,255,255,.055);border-left:3px solid var(--gold);border-radius:8px;color:#dce3ea;line-height:1.55}
.footer{display:none}.seal{display:inline-flex;align-items:center;justify-content:center;margin-top:24px;width:86px;height:86px;border-radius:50%;border:1px solid rgba(247,200,106,.55);color:var(--gold);font-weight:850}
.cover-profile{display:flex;align-items:center;gap:16px;margin-top:20px}.avatar{width:94px;height:94px;border-radius:50%;object-fit:cover;border:2px solid rgba(247,200,106,.92);background:#222b36;box-shadow:0 12px 34px rgba(0,0,0,.30)}.avatar-fallback{display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:850;color:var(--gold)}
.months{display:flex;gap:8px;height:230px;align-items:end;margin-top:18px}.month{flex:1;height:100%;display:flex;flex-direction:column;justify-content:end;align-items:center;color:#94a1b0;font-size:10px;min-width:0}.month b{writing-mode:vertical-rl;max-height:76px;overflow:hidden;color:#fff;font-size:10px;margin-bottom:5px}.month i{display:block;width:100%;max-width:20px;background:linear-gradient(180deg,var(--gold),#9c7442);border-radius:6px 6px 0 0}.month span{margin-top:4px}
.months.small{height:145px;margin:6px 0 18px}.months.small .month i{max-width:16px}.months.small .month b{max-height:46px;font-size:9px}.word-cloud{display:flex;flex-wrap:wrap;gap:12px 14px;align-items:center}.word-cloud span{display:inline-flex;align-items:flex-end;gap:3px;color:#f6f0e8;line-height:1.1}.word-cloud small{font-size:10px;color:#99a6b3}.word-cloud span:nth-child(3n){color:var(--blue)}.word-cloud span:nth-child(4n){color:var(--gold)}
.message-card{background:rgba(255,255,255,.055);border:1px solid var(--line);border-radius:10px;padding:15px;margin:12px 0}.message-card span{display:block;color:#97a3af;font-size:12px}.message-card b{display:block;margin-top:6px;color:var(--gold)}.message-card p{margin:10px 0 0;line-height:1.6;color:#dce3ea}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mini-title{font-size:13px;color:var(--muted);margin:0 0 8px}.keyword-box{margin-bottom:14px}.keyword-box h3{margin:0 0 5px;color:var(--gold);font-size:18px}.notice{border:1px dashed rgba(255,255,255,.22);border-radius:8px;padding:12px;color:#aeb9c7;line-height:1.55}
@media(min-width:760px){body{padding:28px 0}.report{border-radius:20px;overflow:hidden}.page{min-height:760px}}
</style>
</head>
<body>
<main class="report">
    <section class="page">
        ${coverAvatar}
        <div>
            <div class="kicker">Pocket48 Room Report</div>
            <div class="cover-profile">${avatar}<div><h1><span class="name">${escapeHtml(data.displayName)}</span><br>${escapeHtml(data.year)} 年报</h1></div></div>
            <div class="chips">
                <span class="chip">用户 ID <b>${escapeHtml(data.user || '-')}</b></span>
                <span class="chip">消息 <b>${formatNumber(data.total)}</b></span>
                <span class="chip">活跃 <b>${formatNumber(data.activeDays)} 天</b></span>
                <span class="chip">直播昵称补入 <b>${formatNumber(data.liveAliasMatched || 0)}</b></span>
                <span class="chip">更新 <b>${escapeHtml(data.generatedAt)}</b></span>
            </div>
        </div>
        <p class="caption">这一年，你在口袋房间留下了很多瞬间。它们散在不同房间、不同时间，现在被整理成这一份小小的记录。</p>
        <div class="footer">数据来自本地消息文件 · 扫描 ${data.scannedFiles} 个文件</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Total Messages</div>
            <h2>全年发言</h2>
            <div class="big">${formatNumber(data.total)}</div>
        </div>
        <div class="panel">
            <p class="caption">从 ${escapeHtml(data.firstDate || '-')} 到 ${escapeHtml(data.lastDate || '-')}，你一共活跃了 <b>${formatNumber(data.activeDays)}</b> 天。</p>
            <p class="caption">最长连续活跃 <b>${formatNumber(data.longestStreak)}</b> 天。</p>
            <p class="caption">平均每个活跃日约 <b>${(data.total / Math.max(1, data.activeDays)).toFixed(1)}</b> 条。</p>
        </div>
        <div class="footer">每一条消息都是一枚时间戳。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Nicknames</div>
            <h2>这一年你在口袋使用过 <span class="name">${formatNumber(data.nicknameCount)}</span> 个昵称</h2>
        </div>
        <div class="panel">
            <ol class="detail-list">${nicknameRows || '<li><span>暂无昵称数据</span></li>'}</ol>
        </div>
        <div class="footer">按同一用户 ID 下出现过的昵称统计。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Oshi</div>
            <h2>过去一年，你最常互动的成员</h2>
        </div>
        <div class="panel">${pushCards || '<div class="muted">暂无成员互动数据</div>'}</div>
        <div class="footer">根据房间消息和直播消息合计排序。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Rooms</div>
            <h2>口袋房间</h2>
            <p class="caption">这一年你到访过 <b>${formatNumber(data.visitedMemberCount)}</b> 位成员的口袋房间。</p>
        </div>
        <div class="panel">
            <div class="gift-grid">
                <div class="gift-stat"><span>共发出消息</span><b>${formatNumber(data.total)}</b></div>
                <div class="gift-stat"><span>累计字数</span><b>${formatNumber(data.charCount)}</b></div>
            </div>
            <ol class="detail-list">${memberDetailRows || '<li><span>暂无房间数据</span></li>'}</ol>
        </div>
        <div class="footer">字数不含空白字符。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Pocket Room Top</div>
            <h2>口袋房间 top 数据</h2>
            <p class="caption"><b>${formatNumber(data.bucketDays.room)}</b> 天曾在口袋房间留言，共 <b>${formatNumber(data.bucketTotals.room)}</b> 条。</p>
        </div>
        <div class="panel">
            <p class="caption">说得最多的一句话是 <b>${escapeHtml(repeatedRoom ? repeatedRoom[0] : '暂无')}</b>${repeatedRoom ? `，共 ${formatNumber(repeatedRoom[1])} 次。` : ''}</p>
            <p class="caption"><b>${escapeHtml(data.maxDay.date || '-')}</b> 是你最能说的一天，共发出 <b>${formatNumber(data.maxDay.count)}</b> 条留言。</p>
            <p class="caption">你最常在 <b>${String(data.topRoomHour.hour).padStart(2, '0')}:00</b> 出没在成员的口袋房间。</p>
            <p class="caption">最密集的一次是 <b>${escapeHtml(data.maxMemberDay.date || '-')}</b> 在 <b>${escapeHtml(data.maxMemberDay.memberName || '-')}</b> 房间，一口气留下 <b>${formatNumber(data.maxMemberDay.count)}</b> 条。</p>
        </div>
        <div class="footer">“最多一句话”会忽略链接和过长文本。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Pocket Room First / Last</div>
            <h2>房间互动</h2>
            <p class="caption">今年最早和最晚的房间留言。</p>
        </div>
        <div>
            ${renderSmallMessage(data.firstByBucket.room, '暂无第一条房间留言')}
            ${renderSmallMessage(data.lastByBucket.room, '暂无最后一条房间留言')}
        </div>
        <div class="footer">按消息时间排序。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Pocket Live</div>
            <h2>口袋直播</h2>
            <p class="caption">这一年你在 <b>${formatNumber(data.liveMemberCount)}</b> 位成员直播间参与过互动。</p>
        </div>
        <div class="panel">
            <div class="gift-grid">
                <div class="gift-stat"><span>直播弹幕</span><b>${formatNumber(data.bucketTotals.live)}</b></div>
                <div class="gift-stat"><span>累计字数</span><b>${formatNumber(data.bucketChars.live)}</b></div>
            </div>
            <p class="caption">最常出没时段是 <b>${String(data.topLiveHour.hour).padStart(2, '0')}:00</b>。</p>
            <p class="caption">直播间说得最多的一句话是 <b>${escapeHtml(repeatedLive ? repeatedLive[0] : '暂无')}</b>${repeatedLive ? `，共 ${formatNumber(repeatedLive[1])} 次。` : ''}</p>
        </div>
        <div class="footer">只有 JSONL 中能识别为直播的消息会进入这里。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Live First / Last</div>
            <h2>直播间互动</h2>
            <p class="caption">今年最早和最晚的直播弹幕。</p>
        </div>
        <div>
            ${renderSmallMessage(data.firstByBucket.live, '暂无第一条直播弹幕')}
            ${renderSmallMessage(data.lastByBucket.live, '暂无最后一条直播弹幕')}
        </div>
        <div class="footer">直播回放/直播房间数据越完整，这里越准确。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Monthly Rhythm</div>
            <h2>这一年的起伏</h2>
            <p class="caption">每个月的消息量，构成了你的年度节奏。</p>
        </div>
        <div class="panel"><div class="months">${monthBars}</div></div>
        <div class="footer">横轴为 1 月至 12 月。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Room / Live Month</div>
            <h2>房间和直播月分布</h2>
        </div>
        <div class="panel">
            <p class="mini-title">口袋房间</p>
            <div class="months small">${renderMonthBars(data.bucketMonth.room)}</div>
            <p class="mini-title">直播间弹幕</p>
            <div class="months small">${renderMonthBars(data.bucketMonth.live)}</div>
        </div>
        <div class="footer">对应目标年报里的房间月留言分布和直播弹幕月分布。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Most Active Time</div>
            <h2>你最常在这个时间出现</h2>
            <div class="big">${String(data.topHour.hour).padStart(2, '0')}:00</div>
            <p class="caption">这个时段共有 <b>${formatNumber(data.topHour.count)}</b> 条消息。</p>
        </div>
        <div class="panel">
            <div class="hours">${hourBars}</div>
        </div>
        <div class="footer">按消息发送小时统计。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Message Types</div>
            <h2>这一年你的主要痕迹</h2>
            <p class="caption">出现最多的是 <b>${typeLabel[topType[0]] || topType[0]}</b>，共有 <b>${formatNumber(topType[1])}</b> 条。</p>
        </div>
        <div class="panel">${typeRows || '<div class="muted">暂无数据</div>'}</div>
        <div class="footer">翻牌会优先归入翻牌类。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Gift Stats</div>
            <h2>礼物也有自己的年度记录</h2>
            <p class="caption">这一年记录到 <b>${formatNumber(data.giftMessages)}</b> 条礼物消息。</p>
        </div>
        <div class="panel">
            <div class="gift-grid">
                <div class="gift-stat"><span>礼物数量</span><b>${formatNumber(data.giftCount)}</b></div>
                <div class="gift-stat"><span>房间礼物价值</span><b>${formatNumber(data.roomGiftValue)}</b></div>
                <div class="gift-stat"><span>直播贡献值</span><b>${formatNumber(data.liveContributionValue)}</b></div>
                <div class="gift-stat"><span>总礼物价值</span><b>${formatNumber(data.totalGiftValue)}</b></div>
            </div>
            <ol class="rank">${giftRows || '<li><span>暂无礼物明细</span></li>'}</ol>
        </div>
        <div class="footer">礼物图片来自本地 JSONL 里的礼物图标地址；单价优先用消息字段，其次用软件内置礼物表补齐。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">All Gifts</div>
            <h2>送出的所有礼物</h2>
            <p class="caption">这一年一共送出 <b>${formatNumber(data.giftCount)}</b> 个礼物，折合 <b>${formatNumber(data.giftValue)}</b> 鸡腿。</p>
        </div>
        <div class="panel gift-all-panel">
            <ol class="rank">${allGiftRows || '<li><span>暂无礼物明细</span></li>'}</ol>
        </div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Gift Members</div>
            <h2>你的送礼成员榜</h2>
            <p class="caption">这一年共给 <b>${formatNumber(data.giftMembers)}</b> 位成员送出过口袋礼物。</p>
        </div>
        <div class="panel"><ol class="detail-list">${giftMemberRows || '<li><span>暂无送礼成员明细</span></li>'}</ol></div>
        <div class="footer">按房间礼物价值和直播贡献榜价值合计排序。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Gift Month</div>
            <h2>鸡腿每月分布</h2>
        </div>
        <div class="panel">
            <p class="mini-title">房间鸡腿</p>
            <div class="months small">${renderMonthBars(data.giftMonth.room)}</div>
            <p class="mini-title">直播鸡腿</p>
            <div class="months small">${renderMonthBars(data.giftMonth.live)}</div>
        </div>
        <div class="footer">公演、总选、公开翻牌需要对应来源数据，目前本地房间消息里通常没有完整字段。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Top Rooms</div>
            <h2>你最常出现的房间</h2>
        </div>
        <div class="panel"><ol class="rank">${memberRows || '<li><span>暂无数据</span></li>'}</ol></div>
        <div class="footer">按成员房间统计。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Keywords</div>
            <h2>这一年，你常说这些</h2>
        </div>
        <div class="panel"><div class="word-cloud">${wordCloud || '<span>暂无关键词</span>'}</div></div>
        <div class="footer">关键词来自文本消息的粗略分词。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Room / Live Words</div>
            <h2>房间和直播关键词</h2>
        </div>
        <div class="panel">
            <p class="mini-title">口袋房间关键词</p>
            <div class="word-cloud">${roomWordCloud || '<span>暂无房间关键词</span>'}</div>
            <p class="mini-title">直播间弹幕关键词</p>
            <div class="word-cloud">${liveWordCloud || '<span>暂无直播关键词</span>'}</div>
        </div>
        <div class="footer">对应目标年报里的房间词云和直播词云。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Special Calls</div>
            <h2>特别称呼</h2>
            <p class="caption">统计你在哪些成员房间里叫过“老公”“老婆”“宝宝”。</p>
        </div>
        <div class="panel">${keywordSections || '<div class="muted">暂无特别称呼记录</div>'}</div>
        <div class="footer">按文本包含关键词统计。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Disappeared</div>
            <h2>消失的互动</h2>
            <p class="caption">和上一年对比，今年没有再出现的房间、直播间和送礼对象。</p>
        </div>
        <div class="panel">
            <p class="mini-title">消失的口袋房间</p>
            <ol class="rank">${lostRoomRows || '<li><span>暂无或缺少上一年数据</span></li>'}</ol>
            <p class="mini-title">消失的直播间</p>
            <ol class="rank">${lostLiveRows || '<li><span>暂无或缺少上一年数据</span></li>'}</ol>
            <p class="mini-title">礼物流失</p>
            <ol class="rank">${lostGiftRows || '<li><span>暂无或缺少上一年数据</span></li>'}</ol>
        </div>
        <div class="footer">需要同一目录里有上一年的消息文件才能对比。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">First And Last</div>
            <h2>开头和结尾</h2>
        </div>
        <div>
            ${firstMessage}
            ${lastMessage}
        </div>
        <div class="footer">按消息时间排序。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">Fragments</div>
            <h2>几条被捡起来的话</h2>
        </div>
        <ul class="samples">${samples || '<li>暂无文本消息</li>'}</ul>
        <div class="footer">摘录只显示部分文本消息。</div>
    </section>

    <section class="page">
        <div>
            <div class="kicker">End</div>
            <h2>${escapeHtml(data.year)}，你的口袋年报已生成</h2>
            <p class="caption">总消息 <b>${formatNumber(data.total)}</b> 条，活跃 <b>${formatNumber(data.activeDays)}</b> 天，最常出现于 <b>${String(data.topHour.hour).padStart(2, '0')}:00</b>。</p>
            <div class="seal">YAYA</div>
        </div>
        <div class="footer">presented by 牙牙消息</div>
    </section>
</main>
</body>
</html>`;
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help || (!args.user && !args.name)) {
        printHelp();
        if (!args.help) process.exitCode = 1;
        return;
    }

    const files = walkJsonlFiles(args.dataDir).sort();
    const selectedFiles = args.limitFiles > 0 ? files.slice(0, args.limitFiles) : files;
    args.targetAliases = await collectTargetAliases(selectedFiles, args);
    if (args.user) {
        console.log(`识别到 ${args.targetAliases.size} 个历史昵称，用于匹配无 ID 直播弹幕。`);
    }
    const report = createEmptyReport(args);

    let scanned = 0;
    for (const file of selectedFiles) {
        scanned += 1;
        process.stdout.write(`\r扫描 ${scanned}/${selectedFiles.length}: ${path.basename(file).slice(0, 36)}...`);
        await scanFile(file, args, report);
    }
    process.stdout.write('\n');

    const data = serializeReport(report, selectedFiles.length);
    fs.mkdirSync(args.outDir, { recursive: true });
    const safeName = `${data.year}-${data.user || data.nameKeyword || 'user'}`.replace(/[\\/:*?"<>|]/g, '_');
    const outPath = path.join(args.outDir, `year-report-${safeName}.html`);
    fs.writeFileSync(outPath, renderReportHtml(data), 'utf8');
    console.log(`完成: ${outPath}`);
    console.log(`匹配消息: ${data.total} 条`);
}

main().catch((error) => {
    console.error(`错误: ${error.message}`);
    process.exitCode = 1;
});
