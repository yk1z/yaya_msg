#!/usr/bin/env node

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const port = Number(process.env.PORT || 3030);
const dbPath = path.resolve(process.env.MESSAGE_DB || path.join(projectRoot, 'data', 'messages.db'));
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const db = new DatabaseSync(dbPath, { readOnly: true });

function json(res, data, status = 200, origin = '') {
    const body = Buffer.from(JSON.stringify(data));
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const corsOrigin = getCorsOrigin(origin);
    if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Vary', 'Origin');
    }
    res.end(body);
}

function getCorsOrigin(origin) {
    if (!origin) return allowedOrigins.includes('*') ? '*' : '';
    if (allowedOrigins.includes('*')) return '*';
    return allowedOrigins.includes(origin) ? origin : '';
}

function applyOptions(res, origin) {
    res.statusCode = 204;
    const corsOrigin = getCorsOrigin(origin);
    if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.end();
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function parseJsonBody(text) {
    if (!text.trim()) return {};
    try {
        return JSON.parse(text);
    } catch (_) {
        return {};
    }
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
    if (source.length <= 1) return source ? [source] : terms;
    for (let size = 2; size <= 3; size += 1) {
        for (let i = 0; i <= source.length - size; i += 1) {
            terms.push(source.slice(i, i + size));
        }
    }
    return terms;
}

function ftsQuote(term) {
    return `"${String(term).replace(/"/g, '""')}"`;
}

function buildFtsQuery(query) {
    const source = normalizeText(query);
    if (!source) return '';
    const cjkTerms = cjkNgrams(source);
    const latinTerms = source
        .replace(/[\u4e00-\u9fff]/g, ' ')
        .match(/[A-Za-z0-9_@.-]{2,}/g) || [];
    const terms = Array.from(new Set(cjkTerms.concat(latinTerms))).slice(0, 24);
    return terms.map(ftsQuote).join(' AND ');
}

function toInt(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(number)));
}

function toArray(value) {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
    return [];
}

function addLikeCondition(where, params, column, value) {
    const text = normalizeText(value);
    if (!text) return;
    where.push(`${column} LIKE ?`);
    params.push(`%${text}%`);
}

function buildSearchSql(input) {
    const query = normalizeText(input.query || input.q || '');
    const ftsQuery = buildFtsQuery(query);
    const limit = toInt(input.limit, 20, 1, 200);
    const offset = toInt(input.offset ?? ((Number(input.page || 1) - 1) * limit), 0, 0, 1000000);
    const sortOrder = String(input.sort_order || input.sort || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const msgTypes = toArray(input.msg_types || input.msgType || input.msg_type);
    const where = [];
    const params = [];

    if (ftsQuery) {
        where.push('message_fts MATCH ?');
        params.push(ftsQuery);
    }
    addLikeCondition(where, params, 'm.user_id', input.user_id || input.user);
    addLikeCondition(where, params, 'm.sender_name', input.nickname);
    addLikeCondition(where, params, 'm.member_name', input.member || input.member_name);
    addLikeCondition(where, params, 'm.group_name', input.group || input.groupName || input.idol_type || input.team_filter);
    addLikeCondition(where, params, 'm.live_id', input.live_id || input.liveId);

    const roomId = normalizeText(input.room_id || input.roomId || '');
    if (roomId) {
        where.push('(m.member_name LIKE ? OR m.file_path LIKE ?)');
        params.push(`%${roomId}%`, `%${roomId}%`);
    }

    const bucket = normalizeText(input.bucket || input.room_type || '');
    if (bucket) {
        where.push('m.bucket = ?');
        params.push(bucket);
    }

    if (msgTypes.length) {
        where.push(`m.msg_type IN (${msgTypes.map(() => '?').join(',')})`);
        params.push(...msgTypes);
    }

    const startDate = normalizeText(input.start_date || input.startDate || '');
    const endDate = normalizeText(input.end_date || input.endDate || '');
    if (startDate) {
        where.push('m.date >= ?');
        params.push(startDate);
    }
    if (endDate) {
        where.push('m.date <= ?');
        params.push(endDate);
    }

    const from = ftsQuery
        ? 'message_fts JOIN messages m ON m.rowid = message_fts.rowid'
        : 'messages m';
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    return {
        rowsSql: `
            SELECT
                m.id, m.text AS content, m.user_id, m.sender_name AS nickname, m.avatar_url AS avatar,
                m.member_name, m.group_name, m.msg_type, m.time_str AS msg_time, m.msg_time AS timestamp,
                m.bucket, m.room_type, m.live_id, m.live_title, m.rank_money, m.gift_value, m.file_path, m.file_line
            FROM ${from}
            ${whereSql}
            ORDER BY m.msg_time ${sortOrder}, m.id ${sortOrder}
            LIMIT ? OFFSET ?
        `,
        countSql: `SELECT COUNT(*) AS count FROM ${from} ${whereSql}`,
        params,
        rowsParams: params.concat([limit, offset]),
        limit,
        offset
    };
}

function searchMessages(input) {
    const startedAt = Date.now();
    const groupBy = normalizeText(input.group_by || input.groupBy || 'none');
    const sql = buildSearchSql(input);

    if (groupBy && groupBy !== 'none') {
        const groupColumn = groupBy === 'room' ? 'm.member_name'
            : groupBy === 'team' ? 'm.group_name'
                : groupBy === 'type' ? 'm.msg_type'
                    : 'm.member_name';
        const from = sql.countSql.match(/FROM\s+(.+?)\s*(WHERE|$)/is)?.[1] || 'messages m';
        const whereSql = sql.countSql.includes(' WHERE ') ? `WHERE ${sql.countSql.split(' WHERE ')[1]}` : '';
        const rows = db.prepare(`
            SELECT ${groupColumn} AS name, COUNT(*) AS totalCount
            FROM ${from}
            ${whereSql}
            GROUP BY ${groupColumn}
            ORDER BY totalCount DESC
            LIMIT 200
        `).all(...sql.params);
        return {
            success: true,
            results: rows,
            groups: rows,
            total_count: rows.length,
            returned_count: rows.length,
            search_time: Date.now() - startedAt
        };
    }

    const rows = db.prepare(sql.rowsSql).all(...sql.rowsParams);
    const total = db.prepare(sql.countSql).get(...sql.params)?.count || 0;
    return {
        success: true,
        results: rows.map((row) => ({
            id: row.id,
            content: row.content || '',
            user_id: row.user_id || '',
            nickname: row.nickname || '',
            avatar: row.avatar || '',
            server_id: '',
            room_id: '',
            room_info: {
                ownerName: row.member_name || '',
                groupName: row.group_name || '',
                team: row.group_name || ''
            },
            msg_time: row.msg_time || '',
            timestamp: row.timestamp || 0,
            msg_type: row.msg_type || '',
            msgType: row.msg_type || '',
            bucket: row.bucket || '',
            room_type: row.room_type || '',
            live_id: row.live_id || '',
            live_title: row.live_title || '',
            rank_money: row.rank_money || 0,
            gift_value: row.gift_value || 0,
            file_path: row.file_path || '',
            file_line: row.file_line || 0
        })),
        total_count: total,
        returned_count: rows.length,
        offset: sql.offset,
        limit: sql.limit,
        search_time: Date.now() - startedAt
    };
}

function getStats() {
    const total = db.prepare('SELECT COUNT(*) AS count FROM messages').get()?.count || 0;
    const room = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE bucket = ?').get('room')?.count || 0;
    const live = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE bucket = ?').get('live')?.count || 0;
    const users = db.prepare("SELECT COUNT(DISTINCT user_id) AS count FROM messages WHERE user_id <> ''").get()?.count || 0;
    return {
        success: true,
        total_messages: total,
        room_messages: room,
        live_messages: live,
        users,
        db: dbPath,
        health: 'green'
    };
}

function getRooms() {
    const rooms = db.prepare(`
        SELECT member_name AS ownerName, group_name AS groupName, group_name AS team, COUNT(*) AS messageCount
        FROM messages
        GROUP BY member_name, group_name
        ORDER BY messageCount DESC
        LIMIT 2000
    `).all();
    return {
        success: true,
        rooms: rooms.map((room, index) => ({
            roomId: room.ownerName,
            serverId: room.ownerName,
            ownerName: room.ownerName || '',
            groupName: room.groupName || '',
            team: room.team || '',
            messageCount: room.messageCount || 0,
            id: index + 1
        }))
    };
}

function getMessageTypes() {
    const rows = db.prepare(`
        SELECT msg_type AS value, msg_type AS label, COUNT(*) AS count
        FROM messages
        WHERE msg_type <> ''
        GROUP BY msg_type
        ORDER BY count DESC
    `).all();
    return { success: true, messageTypes: rows };
}

async function handle(req, res) {
    const origin = String(req.headers.origin || '');
    if (req.method === 'OPTIONS') return applyOptions(res, origin);

    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    try {
        if (requestUrl.pathname === '/') {
            return json(res, { success: true, service: 'yaya-message-search', db: dbPath }, 200, origin);
        }
        if (requestUrl.pathname === '/api/stats') return json(res, getStats(), 200, origin);
        if (requestUrl.pathname === '/api/rooms') return json(res, getRooms(), 200, origin);
        if (requestUrl.pathname === '/api/message-types') return json(res, getMessageTypes(), 200, origin);
        if (requestUrl.pathname === '/api/search') {
            const body = req.method === 'POST' ? parseJsonBody(await readBody(req)) : {};
            const params = Object.fromEntries(requestUrl.searchParams.entries());
            return json(res, searchMessages({ ...params, ...body }), 200, origin);
        }
        return json(res, { success: false, msg: 'Not Found' }, 404, origin);
    } catch (error) {
        console.error(error);
        return json(res, { success: false, msg: error?.message || 'Internal Server Error' }, 500, origin);
    }
}

const server = http.createServer((req, res) => {
    handle(req, res);
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Yaya message search API listening on http://0.0.0.0:${port}`);
    console.log(`Database: ${dbPath}`);
});
