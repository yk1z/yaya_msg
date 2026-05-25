#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_DATA_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Documents', '牙牙消息', 'html');
const DEFAULT_DB_PATH = path.resolve('data', 'messages.db');

function parseArgs(argv) {
    const args = {
        dataDir: DEFAULT_DATA_DIR,
        db: DEFAULT_DB_PATH,
        limitFiles: 0,
        append: false
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
        else if (arg === '--db') args.db = path.resolve(readValue());
        else if (arg === '--limit-files') args.limitFiles = Number(readValue()) || 0;
        else if (arg === '--append') args.append = true;
        else if (arg === '--help' || arg === '-h') args.help = true;
        else throw new Error(`未知参数: ${arg}`);
    }
    return args;
}

function printHelp() {
    console.log(`
导入口袋消息 JSONL 到 SQLite 全文检索库

用法:
  node tools/import-messages-to-sqlite.js
  node tools/import-messages-to-sqlite.js --data-dir "C:\\Users\\naptw\\Documents\\牙牙消息\\html"

参数:
  --data-dir <目录>      JSONL 消息目录，默认 文档/牙牙消息/html
  --db <文件>            输出数据库，默认 ./data/messages.db
  --append               追加导入；默认会重建数据库
  --limit-files <数量>   只导入前 N 个文件，测试用
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

function normalizeText(value) {
    return String(value || '')
        .replace(/[\u200b-\u200f\uFEFF]/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cjkNgrams(text) {
    const source = String(text || '').replace(/[^\u4e00-\u9fff]/g, '');
    const terms = [];
    for (let size = 2; size <= 3; size += 1) {
        for (let i = 0; i <= source.length - size; i += 1) {
            terms.push(source.slice(i, i + size));
        }
    }
    return terms;
}

function buildSearchText(record) {
    const text = normalizeText(record.text || stripHtml(record.contentHtml || ''));
    const fields = [
        text,
        record.nameStr,
        record.senderName,
        record.nickname,
        record.memberName,
        record.groupName,
        record.liveTitle,
        record.msgType,
        record.userId,
        record.liveId
    ].filter(Boolean).map(normalizeText);
    return fields.concat(cjkNgrams(fields.join(' '))).join(' ');
}

function getRecordTimeValue(record) {
    const rawTime = Number(record.msgTime || record.sortTime || 0);
    if (rawTime) return rawTime < 10000000000 ? rawTime * 1000 : rawTime;
    const parsed = Date.parse(String(record.timeStr || record.time || '').replace(/-/g, '/'));
    return Number.isNaN(parsed) ? 0 : parsed;
}

function getRecordDate(record) {
    const timeStr = String(record.timeStr || record.time || '');
    const match = timeStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const time = getRecordTimeValue(record);
    if (!time) return '';
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function classifyBucket(record) {
    const source = String(record.source || '').toLowerCase();
    const roomType = String(record.roomType || '').toLowerCase();
    const msgType = String(record.msgType || '').toUpperCase();
    if (record.liveId || record.isLiveText || source.includes('live-danmu') || roomType.includes('live') || roomType.includes('直播') || msgType.includes('LIVE')) return 'live';
    return 'room';
}

function parseGiftValue(record) {
    const source = `${stripHtml(record.contentHtml || '')} ${record.text || ''}`;
    const valueMatch = source.match(/(\d+)\s*🍗/);
    return valueMatch ? Number(valueMatch[1]) || 0 : 0;
}

function messageId(record, filePath, lineNumber) {
    const raw = record.fetchKey
        || record.id
        || record.msgId
        || [
            record.liveId,
            record.timeStr || record.msgTime,
            record.userId || record.nameStr || record.senderName,
            record.text || record.contentHtml,
            filePath,
            lineNumber
        ].join('\u0001');
    return crypto.createHash('sha1').update(String(raw)).digest('hex');
}

function normalizeRecord(record, filePath, lineNumber) {
    const text = normalizeText(record.text || stripHtml(record.contentHtml || ''));
    const memberName = normalizeText(record.memberName || path.basename(path.dirname(filePath)));
    const senderName = normalizeText(record.nameStr || record.senderName || record.nickname || '');
    const msgType = normalizeText(record.msgType || record.type || '');
    const timeValue = getRecordTimeValue(record);
    return {
        id: messageId(record, filePath, lineNumber),
        filePath,
        fileLine: lineNumber,
        source: normalizeText(record.source || ''),
        bucket: classifyBucket(record),
        roomType: normalizeText(record.roomType || ''),
        memberName,
        groupName: normalizeText(record.groupName || ''),
        senderName,
        userId: normalizeText(record.userId || ''),
        avatarUrl: normalizeText(record.avatarUrl || record.avatar || ''),
        msgType,
        text,
        contentHtml: String(record.contentHtml || ''),
        timeStr: normalizeText(record.timeStr || record.time || ''),
        date: getRecordDate(record),
        msgTime: timeValue,
        liveId: normalizeText(record.liveId || ''),
        liveTitle: normalizeText(record.liveTitle || ''),
        rankMoney: Number(record.rankMoney || 0) || 0,
        giftValue: parseGiftValue(record),
        searchText: buildSearchText(record)
    };
}

function initDatabase(db, rebuild) {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA temp_store = MEMORY');
    if (rebuild) {
        db.exec('DROP TABLE IF EXISTS message_fts');
        db.exec('DROP TABLE IF EXISTS messages');
        db.exec('DROP TABLE IF EXISTS import_meta');
    }
    db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            file_line INTEGER NOT NULL,
            source TEXT,
            bucket TEXT,
            room_type TEXT,
            member_name TEXT,
            group_name TEXT,
            sender_name TEXT,
            user_id TEXT,
            avatar_url TEXT,
            msg_type TEXT,
            text TEXT,
            content_html TEXT,
            time_str TEXT,
            date TEXT,
            msg_time INTEGER,
            live_id TEXT,
            live_title TEXT,
            rank_money REAL DEFAULT 0,
            gift_value REAL DEFAULT 0
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
            search_text,
            content='messages',
            content_rowid='rowid',
            tokenize='unicode61'
        );
        CREATE TABLE IF NOT EXISTS import_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
        CREATE INDEX IF NOT EXISTS idx_messages_member ON messages(member_name);
        CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_name);
        CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date);
        CREATE INDEX IF NOT EXISTS idx_messages_msg_time ON messages(msg_time);
        CREATE INDEX IF NOT EXISTS idx_messages_bucket ON messages(bucket);
        CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(msg_type);
    `);
}

async function importFile(filePath, statements, counters) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lineNumber = 0;

    for await (const line of rl) {
        lineNumber += 1;
        const trimmed = line.trim();
        if (!trimmed) continue;
        let record;
        try {
            record = JSON.parse(trimmed);
        } catch (_) {
            counters.bad += 1;
            continue;
        }

        const normalized = normalizeRecord(record, filePath, lineNumber);
        const result = statements.insert.run(
            normalized.id,
            normalized.filePath,
            normalized.fileLine,
            normalized.source,
            normalized.bucket,
            normalized.roomType,
            normalized.memberName,
            normalized.groupName,
            normalized.senderName,
            normalized.userId,
            normalized.avatarUrl,
            normalized.msgType,
            normalized.text,
            normalized.contentHtml,
            normalized.timeStr,
            normalized.date,
            normalized.msgTime,
            normalized.liveId,
            normalized.liveTitle,
            normalized.rankMoney,
            normalized.giftValue
        );
        if (result.changes > 0) {
            const rowid = result.lastInsertRowid ? Number(result.lastInsertRowid) : 0;
            if (rowid) {
                statements.insertFts.run(rowid, normalized.searchText);
            } else {
                const row = statements.rowid.get(normalized.id);
                if (row && row.rowid) statements.insertFts.run(row.rowid, normalized.searchText);
            }
            counters.inserted += 1;
        } else {
            counters.skipped += 1;
        }
    }
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        return;
    }

    if (!fs.existsSync(args.dataDir)) throw new Error(`数据目录不存在: ${args.dataDir}`);
    fs.mkdirSync(path.dirname(args.db), { recursive: true });
    if (!args.append && fs.existsSync(args.db)) fs.rmSync(args.db);
    if (!args.append && fs.existsSync(`${args.db}-wal`)) fs.rmSync(`${args.db}-wal`);
    if (!args.append && fs.existsSync(`${args.db}-shm`)) fs.rmSync(`${args.db}-shm`);

    const db = new DatabaseSync(args.db);
    initDatabase(db, !args.append);

    let files = walkJsonlFiles(args.dataDir).sort();
    if (args.limitFiles > 0) files = files.slice(0, args.limitFiles);
    if (!files.length) throw new Error(`没有找到 JSONL 文件: ${args.dataDir}`);

    const statements = {
        insert: db.prepare(`
            INSERT OR IGNORE INTO messages (
                id, file_path, file_line, source, bucket, room_type, member_name, group_name,
                sender_name, user_id, avatar_url, msg_type, text, content_html, time_str,
                date, msg_time, live_id, live_title, rank_money, gift_value
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `),
        rowid: db.prepare('SELECT rowid FROM messages WHERE id = ?'),
        insertFts: db.prepare('INSERT INTO message_fts(rowid, search_text) VALUES (?, ?)')
    };

    const counters = { inserted: 0, skipped: 0, bad: 0 };
    const startedAt = Date.now();
    console.log(`数据库: ${args.db}`);
    console.log(`数据目录: ${args.dataDir}`);
    console.log(`准备导入 ${files.length} 个 JSONL 文件`);

    db.exec('BEGIN');
    try {
        for (let i = 0; i < files.length; i += 1) {
            const file = files[i];
            process.stdout.write(`\r导入 ${i + 1}/${files.length}: ${path.basename(file).slice(0, 42)}...`);
            await importFile(file, statements, counters);
            if ((i + 1) % 5 === 0) {
                db.exec('COMMIT');
                try { db.exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch (_) {}
                db.exec('BEGIN');
            }
        }
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    process.stdout.write('\n');

    db.prepare('INSERT OR REPLACE INTO import_meta(key, value) VALUES (?, ?)').run('data_dir', args.dataDir);
    db.prepare('INSERT OR REPLACE INTO import_meta(key, value) VALUES (?, ?)').run('imported_at', new Date().toISOString());
    db.prepare('INSERT OR REPLACE INTO import_meta(key, value) VALUES (?, ?)').run('files', String(files.length));
    db.exec('PRAGMA optimize');
    db.close();

    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`完成: 新增 ${counters.inserted} 条，跳过重复 ${counters.skipped} 条，坏行 ${counters.bad} 条，用时 ${seconds}s`);
}

main().catch((error) => {
    console.error(`错误: ${error.message}`);
    process.exitCode = 1;
});
