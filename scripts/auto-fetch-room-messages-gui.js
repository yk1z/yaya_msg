#!/usr/bin/env node

const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { ensureStoragePaths } = require('../src/common/storage-paths');
const fetcher = require('./auto-fetch-room-messages');

let mainWindow = null;
let cachedMembers = [];
let isRunning = false;
let stopRequested = false;
let activeAbortController = null;

function memberKey(member) {
    return [
        member.channelId || '',
        member.serverId || '',
        member.ownerName || member.name || member.nickname || ''
    ].join('|');
}

function compactMember(member) {
    const name = member.ownerName || member.name || member.nickname || member.nickName || String(member.channelId || '');
    return {
        key: memberKey(member),
        name,
        group: member.teamName || member.groupName || member.team || member.group || '',
        channelId: String(member.channelId || ''),
        serverId: String(member.serverId || ''),
        smallRoomId: String(member.yklzId || member.smallRoomId || member.smallChannelId || ''),
        userId: String(member.userId || member.id || member.ownerId || ''),
        raw: member
    };
}

function createAsyncLock() {
    let chain = Promise.resolve();
    return function runLocked(task) {
        const next = chain.then(task, task);
        chain = next.catch(() => {});
        return next;
    };
}

function buildRoomTargets(members, roomType) {
    const targets = [];
    for (const member of members) {
        const memberName = member.ownerName || member.name || member.nickname || String(member.channelId);
        const groupName = member.groupName || member.teamName || member.group || member.team || '未知分团';
        const exportPrefix = `${groupName}-${memberName}`;
        const addMain = roomType === 'main' || roomType === 'both';
        const addSmall = roomType === 'small' || roomType === 'both';

        if (addMain) {
            targets.push({
                member: { ...member, roomLabel: '大房间' },
                memberName,
                exportFolderName: memberName,
                exportFileName: `${exportPrefix}-${member.channelId}.html`,
                exportJsonlFileName: `${exportPrefix}-${member.channelId}.jsonl`,
                roomLabel: '大房间'
            });
        }

        if (addSmall) {
            const smallRoomId = member.yklzId || member.smallRoomId || member.smallChannelId || '';
            if (smallRoomId) {
                targets.push({
                    member: {
                        ...member,
                        channelId: smallRoomId,
                        roomLabel: '小房间'
                    },
                    memberName,
                    exportFolderName: memberName,
                    exportFileName: `${exportPrefix}-${smallRoomId}.html`,
                    exportJsonlFileName: `${exportPrefix}-${smallRoomId}.jsonl`,
                    roomLabel: '小房间'
                });
            } else {
                sendProgress({
                    type: 'log',
                    level: 'warn',
                    message: `${memberName} 没有小房间 ID，已跳过小房间。`
                });
            }
        }
    }

    return targets;
}

function sendProgress(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('room-fetch:progress', payload);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1120,
        height: 760,
        minWidth: 920,
        minHeight: 620,
        title: '房间消息自动抓取',
        backgroundColor: '#101419',
        webPreferences: {
            preload: path.join(__dirname, 'auto-fetch-room-messages-gui-preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderHtml())}`);
}

ipcMain.handle('room-fetch:load-members', async () => {
    cachedMembers = await fetcher.fetchMemberList();
    return {
        members: cachedMembers.map(compactMember),
        outputDir: ensureStoragePaths().htmlDir
    };
});

ipcMain.handle('room-fetch:open-output-dir', async () => {
    const storagePaths = ensureStoragePaths();
    await shell.openPath(storagePaths.htmlDir);
    return storagePaths.htmlDir;
});

ipcMain.handle('room-fetch:stop', async () => {
    stopRequested = true;
    if (activeAbortController) {
        activeAbortController.abort();
    }
    sendProgress({ type: 'log', level: 'warn', message: '正在停止，当前请求已中断。' });
    return { ok: true };
});

ipcMain.handle('room-fetch:start', async (_event, payload = {}) => {
    if (isRunning) {
        return { ok: false, message: '正在抓取中，请等待当前任务结束。' };
    }

    const selectedKeys = new Set(Array.isArray(payload.selectedKeys) ? payload.selectedKeys : []);
    const selectedMembers = cachedMembers.filter((member) => selectedKeys.has(memberKey(member)));
    if (selectedMembers.length === 0) {
        return { ok: false, message: '请先选择至少一个成员。' };
    }

    isRunning = true;
    stopRequested = false;

    try {
        const storagePaths = ensureStoragePaths();
        const token = fetcher.readToken(storagePaths, payload.token || '');
        if (!token) {
            return { ok: false, message: `没有找到口袋 Token。请先在软件里登录，或手动输入 Token。设置文件: ${storagePaths.settingsFile}` };
        }

        sendProgress({ type: 'log', level: 'info', message: '正在生成 pa...' });
        const pa = payload.pa || await fetcher.generatePa();
        const runtimeCache = fetcher.readJsonSafe(storagePaths.runtimeCacheFile, {});
        activeAbortController = new AbortController();
        const roomType = ['main', 'small', 'both'].includes(payload.roomType) ? payload.roomType : 'main';
        const targets = buildRoomTargets(selectedMembers, roomType);
        if (targets.length === 0) {
            return { ok: false, message: '没有可抓取的房间，请检查是否选择了有小房间 ID 的成员。' };
        }

        const args = {
            mode: payload.mode === 'member' ? 'member' : 'all',
            exportFormat: ['html', 'jsonl', 'both'].includes(payload.exportFormat) ? payload.exportFormat : 'jsonl',
            maxPages: Math.max(0, Number(payload.maxPages) || 0),
            delay: Math.max(0, Number(payload.delay) || 0),
            retry: 2,
            concurrency: Math.max(1, Math.min(8, Number(payload.concurrency) || 1)),
            full: payload.full === true,
            dryRun: payload.dryRun === true,
            silent: true
        };

        sendProgress({
            type: 'log',
            level: 'info',
            message: `开始抓取 ${targets.length} 个房间，并发 ${Math.min(args.concurrency, targets.length)}，模式: ${args.mode === 'all' ? '房间全部消息' : '只抓房主消息'}，${args.full ? '全量' : '增量'}。`
        });

        const summary = [];
        const runLocked = createAsyncLock();
        let nextIndex = 0;

        async function runTarget(target, index) {
            if (stopRequested) {
                sendProgress({ type: 'log', level: 'warn', message: '已停止剩余任务。' });
                return;
            }

            const member = target.member;
            const memberName = target.memberName;
            const exportFolderName = target.exportFolderName || memberName;
            const displayName = `${memberName} ${target.roomLabel}`;
            let htmlWriter = null;
            let jsonlWriter = null;
            sendProgress({
                type: 'member',
                index: index + 1,
                total: targets.length,
                name: displayName,
                channelId: member.channelId,
                serverId: member.serverId || ''
            });

            try {
                if (args.exportFormat === 'html' || args.exportFormat === 'both') {
                    htmlWriter = fetcher.createStreamingExportWriter({
                        storagePaths,
                        memberName: exportFolderName,
                        fileName: target.exportFileName,
                        dryRun: args.dryRun
                    });
                }
                if (args.exportFormat === 'jsonl' || args.exportFormat === 'both') {
                    jsonlWriter = fetcher.createStreamingJsonlWriter({
                        storagePaths,
                        memberName: exportFolderName,
                        fileName: target.exportJsonlFileName,
                        dryRun: args.dryRun
                    });
                }

                const result = await fetcher.fetchMemberMessages({
                    member,
                    args: {
                        ...args,
                        collectMessages: false,
                        onPage: (pagePayload) => {
                            sendProgress({
                                type: 'page',
                                name: displayName,
                                ...pagePayload
                            });
                        },
                        onMessages: async (messages) => {
                            return await runLocked(async () => {
                                const writeResults = [];
                                if (htmlWriter) {
                                    writeResults.push(htmlWriter.write(messages.map(fetcher.messageToExportEntry)));
                                }
                                if (jsonlWriter) {
                                    writeResults.push(jsonlWriter.write(messages.map((message) => fetcher.messageToJsonRecord(message, {
                                        groupName: target.exportFolderName,
                                        memberName,
                                        roomType: target.roomLabel,
                                        channelId: member.channelId,
                                        serverId: member.serverId || ''
                                    }))));
                                }

                                const hasWriter = writeResults.length > 0;
                                const hasNewData = writeResults.some((result) => Number(result && result.pageAddedCount) > 0);
                                return {
                                    stopAtExisting: hasWriter && !args.full && !args.dryRun && !hasNewData
                                };
                            });
                        },
                        abortSignal: activeAbortController.signal,
                        shouldStop: () => stopRequested
                    },
                    token,
                    pa,
                    runtimeCache
                });

                const saved = await runLocked(async () => {
                    const saveResults = [htmlWriter, jsonlWriter].filter(Boolean).map((writer) => writer.finish());
                    const saveResult = saveResults[saveResults.length - 1] || { addedCount: 0, totalCount: 0, path: '' };

                    if (!args.dryRun && result.newestMessage) {
                        const boundaryKey = fetcher.getFetchBoundaryStorageKey(
                            result.usedServerId || member.serverId,
                            member.channelId,
                            args.mode === 'all'
                        );
                        const boundaryValue = fetcher.buildFetchMessageKey(result.newestMessage);
                        if (boundaryValue) {
                            runtimeCache[boundaryKey] = boundaryValue;
                            fetcher.writeJsonSafe(storagePaths.runtimeCacheFile, runtimeCache);
                        }
                    }

                    return saveResult;
                });

                summary.push({
                    ok: true,
                    memberName: displayName,
                    added: saved.addedCount,
                    total: saved.totalCount,
                    path: saved.path
                });
                sendProgress({
                    type: 'result',
                    ok: true,
                    name: displayName,
                    message: `${result.reason}；新增 ${saved.addedCount} 条，共 ${saved.totalCount} 条。`,
                    path: saved.path
                });
            } catch (error) {
                if (htmlWriter) htmlWriter.discard();
                if (jsonlWriter) jsonlWriter.discard();
                summary.push({ ok: false, memberName: displayName, error: error.message });
                sendProgress({
                    type: 'result',
                    ok: false,
                    name: displayName,
                    message: error.message
                });
            }

            if (stopRequested) {
                sendProgress({ type: 'log', level: 'warn', message: '已停止剩余任务。' });
                return;
            }

            if (args.delay > 0) {
                try {
                    await fetcher.sleep(args.delay, activeAbortController.signal);
                } catch (error) {
                    sendProgress({ type: 'log', level: 'warn', message: '已停止等待。' });
                }
            }
        }

        async function worker() {
            while (!stopRequested) {
                const index = nextIndex;
                nextIndex += 1;
                if (index >= targets.length) return;
                await runTarget(targets[index], index);
            }
        }

        const workerCount = Math.min(args.concurrency, targets.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));

        const okCount = summary.filter((item) => item.ok).length;
        const addedCount = summary.reduce((sum, item) => sum + (item.added || 0), 0);
        sendProgress({
            type: 'done',
            okCount,
            total: summary.length,
            addedCount,
            dryRun: args.dryRun
        });

        return { ok: true, okCount, total: summary.length, addedCount };
    } finally {
        isRunning = false;
        stopRequested = false;
        activeAbortController = null;
    }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

function renderHtml() {
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>房间消息自动抓取</title>
<style>
:root {
    color-scheme: dark;
    --bg: #0b1117;
    --surface: #101822;
    --surface-2: #121c27;
    --surface-3: #0d141d;
    --line: #263443;
    --line-soft: rgba(67, 86, 108, .5);
    --text: #e6edf3;
    --muted: #8ea0b3;
    --accent: #79c0ff;
    --green: #238636;
    --red: #5f1f26;
}
* { box-sizing: border-box; }
html, body {
    height: 100%;
    overflow: hidden;
}
body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: var(--text);
    background: var(--bg);
}
button, input, select { font: inherit; }
.app {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 430px;
    height: 100vh;
    overflow: hidden;
}
.main {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--line);
    overflow: hidden;
}
.toolbar {
    flex: 0 0 auto;
    padding: 18px 20px 16px;
    border-bottom: 1px solid var(--line);
    background: linear-gradient(180deg, #141f2b 0%, #111922 100%);
}
.title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
}
h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
.muted { color: var(--muted); font-size: 13px; }
.filters {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) 140px repeat(4, minmax(70px, 88px));
    gap: 10px;
}
.filters .btn {
    padding: 0 10px;
}
.sortbar {
    display: grid;
    grid-template-columns: 160px 120px minmax(0, 1fr);
    gap: 10px;
    margin-top: 10px;
}
.input, .select {
    width: 100%;
    height: 38px;
    color: #dbe7f2;
    background: #0a1119;
    border: 1px solid #314052;
    border-radius: 8px;
    padding: 0 12px;
    outline: none;
}
.input:focus, .select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(121, 192, 255, .12); }
.btn {
    height: 38px;
    border: 1px solid #34485d;
    border-radius: 8px;
    padding: 0 14px;
    color: #dbe3ec;
    background: #152130;
    cursor: pointer;
    transition: background .15s, border-color .15s, transform .15s;
}
.btn:hover { background: #1c2b3b; border-color: #4a627b; }
.btn:active { transform: translateY(1px); }
.btn.primary {
    border-color: #2f8f4e;
    background: var(--green);
    color: #fff;
    font-weight: 700;
}
.btn.danger {
    border-color: #8f3333;
    background: var(--red);
}
.btn:disabled { opacity: .55; cursor: not-allowed; }
.list-head {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: 42px minmax(130px, 1fr) 100px 90px 130px 130px 130px;
    gap: 10px;
    padding: 10px 20px;
    color: #9fb2c7;
    font-size: 12px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-3);
}
.list {
    flex: 1;
    min-height: 0;
    overflow: auto;
}
.row {
    display: grid;
    grid-template-columns: 42px minmax(130px, 1fr) 100px 90px 130px 130px 130px;
    gap: 10px;
    align-items: center;
    min-height: 44px;
    padding: 0 20px;
    border-bottom: 1px solid var(--line-soft);
    background: rgba(16, 24, 34, .72);
}
.row:nth-child(even) { background: rgba(13, 20, 29, .74); }
.row:hover { background: rgba(121, 192, 255, .08); }
.name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cell { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #b8c2cc; }
.side {
    display: flex;
    flex-direction: column;
    height: 100vh;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    background: #0c131c;
}
.panel {
    flex: 0 0 auto;
    max-height: 56vh;
    overflow: auto;
    padding: 18px 20px;
    border-bottom: 1px solid var(--line);
    background: linear-gradient(180deg, #101a25 0%, #0c131c 100%);
}
.panel h2 {
    margin: 0 0 12px;
    font-size: 15px;
    color: #f0f6fc;
}
.form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}
.field label {
    display: block;
    margin-bottom: 6px;
    color: var(--muted);
    font-size: 12px;
}
.check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    color: #cbd7e3;
}
.actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 14px;
}
.log {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 14px 20px 18px;
    font-family: Consolas, "Microsoft YaHei", monospace;
    font-size: 12px;
    line-height: 1.55;
    color: #c9d1d9;
    white-space: pre-wrap;
    background: #080e15;
}
.log-line { margin: 0 0 5px; }
.ok { color: #7ee787; }
.warn { color: #f2cc60; }
.err { color: #ff7b72; }
.info { color: #79c0ff; }
.path {
    color: #8b98a5;
    word-break: break-all;
}
input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: #7aa2f7;
}
@media (max-width: 980px) {
    .app { grid-template-columns: 1fr; }
    .side { height: 360px; border-top: 1px solid var(--line); }
    .filters { grid-template-columns: 1fr 1fr; }
}
</style>
</head>
<body>
<div class="app">
    <section class="main">
        <div class="toolbar">
            <div class="title">
                <h1>房间消息自动抓取</h1>
                <div class="muted" id="countText">正在加载成员...</div>
            </div>
            <div class="filters">
                <input class="input" id="searchInput" placeholder="搜索成员名、分团、房间号">
                <select class="select" id="groupSelect">
                    <option value="">全部分团</option>
                </select>
                <button class="btn" id="selectVisibleBtn">选择当前</button>
                <button class="btn" id="selectAllBtn">全选</button>
                <button class="btn" id="invertVisibleBtn">反选当前</button>
                <button class="btn" id="clearBtn">全不选</button>
            </div>
            <div class="sortbar">
                <select class="select" id="sortFieldSelect">
                    <option value="name">按成员名</option>
                    <option value="group">按分团</option>
                    <option value="userId">按成员 ID</option>
                    <option value="channelId">按大房间 ID</option>
                    <option value="smallRoomId">按小房间 ID</option>
                    <option value="serverId">按服务器 ID</option>
                </select>
                <select class="select" id="sortDirectionSelect">
                    <option value="asc">升序</option>
                    <option value="desc">降序</option>
                </select>
                <div class="muted" style="display:flex;align-items:center;">成员列表可按 ID 排序，方便核对房间。</div>
            </div>
        </div>
        <div class="list-head">
            <div></div>
            <div>成员</div>
            <div>分团</div>
            <div>成员 ID</div>
            <div>Channel ID</div>
            <div>小房间 ID</div>
            <div>Server ID</div>
        </div>
        <div class="list" id="memberList"></div>
    </section>
    <aside class="side">
        <div class="panel">
            <h2>抓取设置</h2>
            <div class="form-grid">
                <div class="field">
                    <label>抓取模式</label>
                    <select class="select" id="modeSelect">
                        <option value="all">房间全部消息</option>
                        <option value="member">只抓房主消息</option>
                    </select>
                </div>
                <div class="field">
                    <label>房间类型</label>
                    <select class="select" id="roomTypeSelect">
                        <option value="main">大房间</option>
                        <option value="small">小房间</option>
                        <option value="both">大+小房间</option>
                    </select>
                </div>
                <div class="field">
                    <label>导出格式</label>
                    <select class="select" id="exportFormatSelect">
                        <option value="jsonl">JSONL</option>
                        <option value="both">JSONL + HTML</option>
                        <option value="html">HTML</option>
                    </select>
                </div>
                <div class="field">
                    <label>最大页数，0=抓到底</label>
                    <input class="input" id="maxPagesInput" type="number" min="0" value="0">
                </div>
                <div class="field">
                    <label>请求间隔 ms</label>
                    <input class="input" id="delayInput" type="number" min="0" value="800">
                </div>
                <div class="field">
                    <label>并发数</label>
                    <input class="input" id="concurrencyInput" type="number" min="1" max="8" value="2">
                </div>
                <div class="field">
                    <label>选中数量</label>
                    <input class="input" id="selectedCountInput" readonly value="0">
                </div>
            </div>
            <label class="check"><input type="checkbox" id="fullCheck"> 忽略上次位置，全量往前抓</label>
            <label class="check"><input type="checkbox" id="dryRunCheck"> 只测试，不写入文件</label>
            <div class="actions">
                <button class="btn primary" id="startBtn">开始抓取</button>
                <button class="btn danger" id="stopBtn" disabled>停止</button>
            </div>
            <div class="actions">
                <button class="btn" id="reloadBtn">重新加载成员</button>
                <button class="btn" id="openDirBtn">打开输出目录</button>
            </div>
            <p class="muted" id="outputDirText"></p>
        </div>
        <div class="log" id="logBox"></div>
    </aside>
</div>
<script>
const state = {
    members: [],
    visible: [],
    selected: new Set(),
    running: false,
    sortField: 'name',
    sortDirection: 'asc'
};

const el = (id) => document.getElementById(id);
const listEl = el('memberList');
const logEl = el('logBox');
const MAX_LOG_LINES = 1200;

function log(message, level = 'info') {
    const shouldStickToBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 24;
    const line = document.createElement('div');
    line.className = 'log-line ' + level;
    const time = new Date().toLocaleTimeString();
    line.textContent = '[' + time + '] ' + message;
    logEl.appendChild(line);
    while (logEl.children.length > MAX_LOG_LINES) {
        logEl.removeChild(logEl.firstElementChild);
    }
    if (shouldStickToBottom) {
        logEl.scrollTop = logEl.scrollHeight;
    }
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

function updateCounts() {
    el('selectedCountInput').value = String(state.selected.size);
    el('countText').textContent = '显示 ' + state.visible.length + ' / ' + state.members.length + '，已选 ' + state.selected.size;
}

function renderGroups() {
    const groups = Array.from(new Set(state.members.map((m) => m.group).filter(Boolean))).sort();
    el('groupSelect').innerHTML = '<option value="">全部分团</option>' + groups.map((group) => '<option value="' + escapeHtml(group) + '">' + escapeHtml(group) + '</option>').join('');
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function applyFilters() {
    const keyword = el('searchInput').value.trim().toLowerCase();
    const group = el('groupSelect').value;
    state.visible = state.members.filter((member) => {
        if (group && member.group !== group) return false;
        if (!keyword) return true;
        const text = [member.name, member.group, member.channelId, member.serverId, member.smallRoomId, member.userId].join(' ').toLowerCase();
        return text.includes(keyword);
    });
    sortVisible();
    renderList();
}

function getSortValue(member, field) {
    const value = member[field] || '';
    if (['userId', 'channelId', 'smallRoomId', 'serverId'].includes(field)) {
        const number = Number(value);
        return Number.isFinite(number) ? number : -1;
    }
    return String(value).toLowerCase();
}

function sortVisible() {
    const field = state.sortField;
    const direction = state.sortDirection === 'desc' ? -1 : 1;
    state.visible.sort((left, right) => {
        const leftValue = getSortValue(left, field);
        const rightValue = getSortValue(right, field);
        if (leftValue < rightValue) return -1 * direction;
        if (leftValue > rightValue) return 1 * direction;
        return String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hans-CN') * direction;
    });
}

function renderList() {
    const fragment = document.createDocumentFragment();
    for (const member of state.visible) {
        const row = document.createElement('label');
        row.className = 'row';
        row.innerHTML =
            '<div><input type="checkbox" data-key="' + escapeHtml(member.key) + '"' + (state.selected.has(member.key) ? ' checked' : '') + '></div>' +
            '<div class="name" title="' + escapeHtml(member.name) + '">' + escapeHtml(member.name) + '</div>' +
            '<div class="cell">' + escapeHtml(member.group || '-') + '</div>' +
            '<div class="cell">' + escapeHtml(member.userId || '-') + '</div>' +
            '<div class="cell">' + escapeHtml(member.channelId || '-') + '</div>' +
            '<div class="cell">' + escapeHtml(member.smallRoomId || '-') + '</div>' +
            '<div class="cell">' + escapeHtml(member.serverId || '自动') + '</div>';
        fragment.appendChild(row);
    }
    listEl.replaceChildren(fragment);
    updateCounts();
}

async function loadMembers() {
    listEl.innerHTML = '';
    log('正在加载成员列表...');
    const res = await window.roomFetchGui.loadMembers();
    state.members = res.members || [];
    state.visible = state.members;
    el('outputDirText').textContent = res.outputDir || '';
    renderGroups();
    applyFilters();
    log('成员列表加载完成，共 ' + state.members.length + ' 个。', 'ok');
}

function setRunning(running) {
    state.running = running;
    el('startBtn').disabled = running;
    el('stopBtn').disabled = !running;
    el('reloadBtn').disabled = running;
}

listEl.addEventListener('change', (event) => {
    const checkbox = event.target;
    if (!checkbox || checkbox.type !== 'checkbox') return;
    if (checkbox.checked) state.selected.add(checkbox.dataset.key);
    else state.selected.delete(checkbox.dataset.key);
    updateCounts();
});

el('searchInput').addEventListener('input', applyFilters);
el('groupSelect').addEventListener('change', applyFilters);
el('sortFieldSelect').addEventListener('change', () => {
    state.sortField = el('sortFieldSelect').value;
    applyFilters();
});
el('sortDirectionSelect').addEventListener('change', () => {
    state.sortDirection = el('sortDirectionSelect').value;
    applyFilters();
});
el('selectVisibleBtn').addEventListener('click', () => {
    for (const member of state.visible) state.selected.add(member.key);
    renderList();
});
el('selectAllBtn').addEventListener('click', () => {
    for (const member of state.members) state.selected.add(member.key);
    renderList();
});
el('invertVisibleBtn').addEventListener('click', () => {
    for (const member of state.visible) {
        if (state.selected.has(member.key)) state.selected.delete(member.key);
        else state.selected.add(member.key);
    }
    renderList();
});
el('clearBtn').addEventListener('click', () => {
    state.selected.clear();
    renderList();
});
el('reloadBtn').addEventListener('click', () => {
    loadMembers().catch((error) => log(error.message, 'err'));
});
el('openDirBtn').addEventListener('click', () => {
    window.roomFetchGui.openOutputDir().catch((error) => log(error.message, 'err'));
});
el('stopBtn').addEventListener('click', () => {
    window.roomFetchGui.stopFetch();
});
el('startBtn').addEventListener('click', async () => {
    if (state.selected.size === 0) {
        log('请先选择至少一个成员。', 'warn');
        return;
    }
    setRunning(true);
    try {
        const concurrency = clampNumber(el('concurrencyInput').value, 1, 8, 1);
        el('concurrencyInput').value = String(concurrency);
        const res = await window.roomFetchGui.startFetch({
            selectedKeys: Array.from(state.selected),
            mode: el('modeSelect').value,
            roomType: el('roomTypeSelect').value,
            exportFormat: el('exportFormatSelect').value,
            maxPages: Number(el('maxPagesInput').value) || 0,
            delay: Number(el('delayInput').value) || 0,
            concurrency,
            full: el('fullCheck').checked,
            dryRun: el('dryRunCheck').checked
        });
        if (!res.ok) {
            log(res.message || '启动失败', 'err');
        }
    } catch (error) {
        log(error.message, 'err');
    } finally {
        setRunning(false);
    }
});

window.roomFetchGui.onProgress((payload) => {
    if (!payload) return;
    if (payload.type === 'log') {
        log(payload.message, payload.level || 'info');
    } else if (payload.type === 'member') {
        log('[' + payload.index + '/' + payload.total + '] ' + payload.name + ' channelId=' + payload.channelId + ' serverId=' + (payload.serverId || '自动'), 'info');
    } else if (payload.type === 'page') {
        const dateText = payload.dateLabel ? '抓取到 ' + payload.dateLabel : '抓取中';
        log(payload.name + ' ' + dateText + '，累计 ' + payload.total, 'info');
    } else if (payload.type === 'result') {
        log(payload.name + ': ' + payload.message, payload.ok ? 'ok' : 'err');
        if (payload.path) log(payload.path, 'path');
    } else if (payload.type === 'done') {
        log('完成：成功 ' + payload.okCount + '/' + payload.total + ' 个成员，新增 ' + payload.addedCount + ' 条。' + (payload.dryRun ? ' 本次为测试运行。' : ''), 'ok');
    }
});

loadMembers().catch((error) => log(error.message, 'err'));
</script>
</body>
</html>`;
}
