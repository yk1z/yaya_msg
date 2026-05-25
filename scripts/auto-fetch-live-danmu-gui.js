#!/usr/bin/env node

const path = require('path');
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { ensureStoragePaths } = require('../src/common/storage-paths');
const roomFetcher = require('./auto-fetch-room-messages');
const liveFetcher = require('./auto-fetch-live-danmu');

let mainWindow = null;
let cachedMembers = [];
let running = false;
let stopRequested = false;
let currentOutputDir = '';

function normalizeMemberForGui(rawMember) {
    const member = liveFetcher.normalizeMember(rawMember);
    const channelId = member.channelId || member.channel_id || '';
    return {
        ...member,
        channelId,
        key: memberKey(member),
        displayName: member.ownerName || member.memberName || member.nickname || member.name || String(member.userId || channelId || ''),
        displayGroup: member.teamName || member.groupName || member.team || member.group || '未分团',
        displayUserId: String(member.userId || ''),
        displayChannelId: String(channelId || '')
    };
}

function memberKey(member) {
    return [
        member.teamName || member.groupName || member.team || '',
        member.ownerName || member.memberName || member.nickname || member.name || '',
        member.userId || member.id || member.ownerId || '',
        member.channelId || ''
    ].join('|');
}

function nowLabel() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function sendProgress(payload) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('live-danmu:progress', payload);
}

function log(message, level = 'info') {
    sendProgress({ type: 'log', level, message: `[${nowLabel()}] ${message}` });
}

function toPositiveNumber(value, fallback, maxValue) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return fallback;
    if (maxValue != null) return Math.min(number, maxValue);
    return number;
}

function buildFetchArgs(payload) {
    return {
        year: String(payload.year || '').trim(),
        maxPages: toPositiveNumber(payload.maxPages, 0),
        maxLives: toPositiveNumber(payload.maxLives, 0),
        delay: toPositiveNumber(payload.delay, liveFetcher.DEFAULT_DELAY_MS),
        retry: toPositiveNumber(payload.retry, 2),
        full: !!payload.full,
        saveLrc: payload.saveLrc !== false,
        fetchRank: payload.fetchRank !== false,
        dryRun: !!payload.dryRun
    };
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 980,
        minHeight: 720,
        backgroundColor: '#0b1118',
        title: '直播弹幕自动抓取',
        webPreferences: {
            preload: path.join(__dirname, 'auto-fetch-live-danmu-gui-preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderHtml())}`);
}

ipcMain.handle('live-danmu:load-members', async () => {
    const members = await roomFetcher.fetchMemberList();
    cachedMembers = members.map(normalizeMemberForGui);
    const storagePaths = ensureStoragePaths();
    currentOutputDir = currentOutputDir || storagePaths.htmlDir;
    return {
        members: cachedMembers,
        outputDir: currentOutputDir
    };
});

ipcMain.handle('live-danmu:select-output-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择直播弹幕导出目录',
        defaultPath: currentOutputDir || ensureStoragePaths().htmlDir,
        properties: ['openDirectory', 'createDirectory']
    });
    if (!result.canceled && result.filePaths[0]) {
        currentOutputDir = result.filePaths[0];
    }
    return { outputDir: currentOutputDir || ensureStoragePaths().htmlDir };
});

ipcMain.handle('live-danmu:open-output-dir', async () => {
    const target = currentOutputDir || ensureStoragePaths().htmlDir;
    await shell.openPath(target);
    return { ok: true, outputDir: target };
});

ipcMain.handle('live-danmu:stop', async () => {
    stopRequested = true;
    log('已请求停止，当前请求结束后会停下。', 'warn');
    sendProgress({ type: 'state', running: true, stopping: true });
    return { ok: true };
});

ipcMain.handle('live-danmu:start', async (_event, payload = {}) => {
    if (running) return { ok: false, error: '正在抓取中' };
    const selectedKeys = new Set(Array.isArray(payload.selectedKeys) ? payload.selectedKeys : []);
    const selectedMembers = cachedMembers.filter((member) => selectedKeys.has(member.key));
    if (!selectedMembers.length) return { ok: false, error: '请先选择成员' };

    running = true;
    stopRequested = false;
    sendProgress({ type: 'state', running: true, stopping: false });

    try {
        const storagePaths = roomFetcher.applyOutputDir(ensureStoragePaths(), payload.outputDir || currentOutputDir);
        currentOutputDir = storagePaths.htmlDir;
        const token = roomFetcher.readToken(storagePaths, payload.token || '');
        if (!token) {
            throw new Error(`没有找到口袋 Token。请先在软件里登录，或手动填 Token。设置文件: ${storagePaths.settingsFile}`);
        }
        const pa = String(payload.pa || '').trim() || await roomFetcher.generatePa();
        const baseArgs = buildFetchArgs(payload);
        const concurrency = Math.max(1, Math.min(toPositiveNumber(payload.concurrency, 3), 8, selectedMembers.length));
        let cursor = 0;
        const summary = [];

        log(`输出目录: ${storagePaths.htmlDir}`);
        log(`准备抓取 ${selectedMembers.length} 个成员，年份 ${baseArgs.year || '不限'}，并发 ${concurrency}。`);
        log(baseArgs.full ? '全量模式：会忽略本地已有直播边界。' : '增量模式：遇到本地已有直播会停止往前翻。');
        if (baseArgs.dryRun) log('只测试，不写入文件。', 'warn');

        async function worker(workerIndex) {
            while (!stopRequested) {
                const index = cursor;
                cursor += 1;
                if (index >= selectedMembers.length) return;
                const member = selectedMembers[index];
                const name = member.displayName;
                const group = member.displayGroup;
                log(`[${index + 1}/${selectedMembers.length}] ${group} ${name} 开始。`);
                try {
                    const result = await liveFetcher.fetchMemberLiveDanmu({
                        member,
                        token,
                        pa,
                        htmlDir: storagePaths.htmlDir,
                        args: {
                            ...baseArgs,
                            shouldStop: () => stopRequested,
                            onListPage: (info) => {
                                const range = info.firstDate || info.lastDate
                                    ? `${info.firstDate || '?'} ~ ${info.lastDate || '?'}`
                                    : '无日期';
                                log(`${name} 直播列表 ${range}，命中 ${info.matched} 场，累计 ${info.totalLives} 场。`);
                                if (info.boundaryLiveId) log(`${name} 已遇到上次抓取边界。`, 'warn');
                            },
                            onLiveStart: (info) => {
                                const title = info.live.liveTitle || info.live.title || '';
                                const date = liveFetcher.getLiveDateLabel(info.live) || '';
                                log(`${name} 处理直播 ${info.index}/${info.total}${date ? ` ${date}` : ''}${title ? ` ${title}` : ''}`);
                            },
                            onLiveDone: (info) => {
                                const date = liveFetcher.getLiveDateLabel(info.live) || '';
                                if (info.failed) {
                                    log(`${name} ${date || info.liveId}: 下载失败，已跳过 (${info.reason || '未知错误'})`, 'error');
                                    return;
                                }
                                if (info.skipped) {
                                    log(`${name} ${date || info.liveId}: ${info.reason || '跳过'}`, 'warn');
                                    return;
                                }
                                log(`${name} ${date || info.liveId}: 弹幕 ${info.records} 条，贡献榜 ${info.rankCount} 人，补 ID ${info.rankMatched} 条，新增 ${info.added} 条，更新 ${info.updated} 条。`, 'success');
                            },
                            onNotice: (message) => log(message, 'warn')
                        }
                    });
                    summary.push({ ok: true, ...result });
                    log(`${name} 完成: 直播 ${result.processed}/${result.lives} 场，失败 ${result.failedLives || 0} 场，无弹幕 ${result.noDanmu} 场，新增 ${result.added} 条，更新 ${result.updated} 条${result.boundaryStopped ? '，已到上次边界' : ''}。`, 'success');
                } catch (error) {
                    summary.push({ ok: false, memberName: name, error: error.message });
                    log(`${name} 失败: ${error.message}`, 'error');
                }
                sendProgress({
                    type: 'summary',
                    done: summary.length,
                    total: selectedMembers.length,
                    ok: summary.filter((item) => item.ok).length,
                    added: summary.reduce((sum, item) => sum + (item.added || 0), 0),
                    updated: summary.reduce((sum, item) => sum + (item.updated || 0), 0),
                    skipped: summary.reduce((sum, item) => sum + (item.skipped || 0), 0),
                    noDanmu: summary.reduce((sum, item) => sum + (item.noDanmu || 0), 0),
                    failedLives: summary.reduce((sum, item) => sum + (item.failedLives || 0), 0)
                });
                if (baseArgs.delay > 0 && !stopRequested) await roomFetcher.sleep(baseArgs.delay);
            }
            log(`并发任务 ${workerIndex} 已停止。`, 'warn');
        }

        await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index + 1)));
        const okCount = summary.filter((item) => item.ok).length;
        const addedCount = summary.reduce((sum, item) => sum + (item.added || 0), 0);
        const updatedCount = summary.reduce((sum, item) => sum + (item.updated || 0), 0);
        const stoppedText = stopRequested ? '已停止' : '完成';
        log(`${stoppedText}: 成功 ${okCount}/${summary.length} 个成员，新增 ${addedCount} 条，更新 ${updatedCount} 条。`, stopRequested ? 'warn' : 'success');
        return { ok: true, stopped: stopRequested, summary };
    } catch (error) {
        log(`错误: ${error.message}`, 'error');
        return { ok: false, error: error.message };
    } finally {
        running = false;
        stopRequested = false;
        sendProgress({ type: 'state', running: false, stopping: false });
    }
});

function renderHtml() {
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>直播弹幕自动抓取</title>
<style>
:root {
    --bg: #07111b;
    --panel: #0d1824;
    --panel-2: #101f2d;
    --line: #223449;
    --text: #eef7ff;
    --muted: #98adbf;
    --accent: #7bdcff;
    --accent-2: #b984ff;
    --green: #49d17d;
    --red: #ff6b7a;
    --yellow: #ffd45a;
}
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
body {
    background: radial-gradient(circle at 20% 0%, rgba(123, 220, 255, .08), transparent 28%), var(--bg);
    color: var(--text);
    font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
}
button, input, select { font: inherit; }
.app {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 430px;
    height: 100vh;
    min-width: 0;
    min-height: 0;
}
.main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--line);
}
.side {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: rgba(9, 19, 29, .9);
}
.header {
    padding: 22px 24px 14px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
}
h1 { margin: 0; font-size: 28px; letter-spacing: 0; }
.count { color: #b9d9f3; font-size: 14px; white-space: nowrap; }
.toolbar {
    padding: 0 24px 18px;
    display: grid;
    grid-template-columns: minmax(220px, 1.2fr) minmax(150px, .7fr) repeat(4, minmax(92px, auto));
    gap: 12px;
    align-items: stretch;
}
.toolbar.second {
    grid-template-columns: 200px 150px minmax(160px, 1fr);
    padding-top: 0;
}
.input, .select, .btn {
    width: 100%;
    min-width: 0;
    min-height: 46px;
    border: 1px solid #2b4159;
    border-radius: 8px;
    background: #08131f;
    color: var(--text);
    outline: none;
}
.input, .select { padding: 0 14px; }
.input:focus, .select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(123, 220, 255, .12); }
.btn {
    padding: 0 16px;
    cursor: pointer;
    background: linear-gradient(180deg, #132437, #0d1927);
    font-weight: 700;
}
.btn:hover { border-color: var(--accent); }
.btn:disabled { opacity: .48; cursor: not-allowed; }
.btn.primary { background: linear-gradient(180deg, #1a7a47, #125d34); border-color: #248a52; }
.btn.danger { background: linear-gradient(180deg, #65202a, #47161d); border-color: #8a2d3a; }
.hint { color: var(--muted); align-self: center; font-size: 14px; }
.table-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border-top: 1px solid var(--line);
}
table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
}
th, td {
    padding: 13px 12px;
    border-bottom: 1px solid rgba(34, 52, 73, .82);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #0b1723;
    color: #a9cdf0;
    font-size: 13px;
    font-weight: 500;
}
td { color: #cdeaff; font-size: 16px; }
td.name { color: #fff; font-weight: 800; }
tr:hover td { background: rgba(123, 220, 255, .045); }
input[type="checkbox"] { width: 18px; height: 18px; accent-color: #80a8ff; }
.settings {
    flex: 0 0 auto;
    max-height: 58vh;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 24px;
    border-bottom: 1px solid var(--line);
}
.settings h2 { margin: 0 0 18px; font-size: 22px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field label { display: block; margin-bottom: 6px; color: #a8bfd2; font-size: 13px; }
.field.full { grid-column: 1 / -1; }
.check {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 34px;
    color: #e8f4ff;
}
.actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 14px;
}
.path-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 86px;
    gap: 8px;
}
.summary {
    margin-top: 12px;
    color: #a9c6dc;
    font-size: 13px;
    line-height: 1.55;
    word-break: break-all;
}
.log {
    flex: 1 1 auto;
    height: 0;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
    padding: 18px 22px;
    font-family: Consolas, "Microsoft YaHei", monospace;
    font-size: 14px;
    line-height: 1.65;
    background: #050b12;
}
.log-line { color: #70c7ff; white-space: pre-wrap; word-break: break-all; }
.log-line.success { color: #59f08f; }
.log-line.error { color: #ff7e8c; }
.log-line.warn { color: #ffd75e; }
@media (max-width: 1100px) {
    .app { grid-template-columns: minmax(0, 1fr) 390px; }
}
</style>
</head>
<body>
<div class="app">
    <section class="main">
        <div class="header">
            <h1>直播弹幕自动抓取</h1>
            <div class="count" id="countText">加载中...</div>
        </div>
        <div class="toolbar">
            <input class="input" id="searchInput" placeholder="搜索成员名、分团、ID">
            <select class="select" id="groupSelect"><option value="">全部分团</option></select>
            <button class="btn" id="selectVisibleBtn">选择当前</button>
            <button class="btn" id="selectAllBtn">全选</button>
            <button class="btn" id="clearAllBtn">全不选</button>
            <button class="btn" id="invertVisibleBtn">反选当前</button>
        </div>
        <div class="toolbar second">
            <select class="select" id="sortFieldSelect">
                <option value="name">按成员名</option>
                <option value="group">按分团</option>
                <option value="userId">按用户 ID</option>
                <option value="channelId">按 Channel ID</option>
            </select>
            <select class="select" id="sortDirectionSelect">
                <option value="asc">升序</option>
                <option value="desc">降序</option>
            </select>
            <div class="hint">直播弹幕来自录播 LRC；用户 ID 只能用贡献榜 Top20 尽量补齐。</div>
        </div>
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th style="width:52px;"></th>
                        <th style="width:180px;">成员</th>
                        <th style="width:150px;">分团</th>
                        <th style="width:150px;">用户 ID</th>
                        <th style="width:150px;">Channel ID</th>
                    </tr>
                </thead>
                <tbody id="memberBody"></tbody>
            </table>
        </div>
    </section>
    <aside class="side">
        <div class="settings">
            <h2>抓取设置</h2>
            <div class="grid">
                <div class="field">
                    <label>抓取年份</label>
                    <select class="select" id="yearInput">
                        <option value="${new Date().getFullYear()}">${new Date().getFullYear()}</option>
                        <option value="">不限年份</option>
                        ${Array.from({ length: 9 }, (_, index) => new Date().getFullYear() - index - 1)
                            .map((year) => `<option value="${year}">${year}</option>`)
                            .join('')}
                    </select>
                </div>
                <div class="field">
                    <label>并发数，最多 8</label>
                    <input class="input" id="concurrencyInput" type="number" min="1" max="8" value="3">
                </div>
                <div class="field">
                    <label>最大页数，0=抓到底</label>
                    <input class="input" id="maxPagesInput" type="number" min="0" value="0">
                </div>
                <div class="field">
                    <label>每成员最大直播数，0=不限</label>
                    <input class="input" id="maxLivesInput" type="number" min="0" value="0">
                </div>
                <div class="field">
                    <label>请求间隔 ms</label>
                    <input class="input" id="delayInput" type="number" min="0" value="800">
                </div>
                <div class="field">
                    <label>重试次数</label>
                    <input class="input" id="retryInput" type="number" min="0" value="2">
                </div>
                <label class="check"><input type="checkbox" id="fetchRankInput" checked> 读取贡献榜补用户 ID</label>
                <label class="check"><input type="checkbox" id="saveLrcInput" checked> 保存原始 LRC</label>
                <label class="check"><input type="checkbox" id="fullInput"> 忽略上次位置，全量重抓</label>
                <label class="check"><input type="checkbox" id="dryRunInput"> 只测试，不写入文件</label>
                <div></div>
                <div class="field full">
                    <label>导出目录</label>
                    <div class="path-row">
                        <input class="input" id="outputDirInput">
                        <button class="btn" id="selectOutputBtn">选择</button>
                    </div>
                </div>
            </div>
            <div class="actions">
                <button class="btn primary" id="startBtn">开始抓取</button>
                <button class="btn danger" id="stopBtn" disabled>停止</button>
                <button class="btn" id="reloadBtn">重新加载成员</button>
                <button class="btn" id="openOutputBtn">打开输出目录</button>
            </div>
            <div class="summary" id="summaryText">未开始</div>
        </div>
        <div class="log" id="logBox"></div>
    </aside>
</div>
<script>
const state = {
    members: [],
    visible: [],
    selected: new Set(),
    running: false
};

function el(id) { return document.getElementById(id); }
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function selectedCountText() {
    el('countText').textContent = '显示 ' + state.visible.length + ' / ' + state.members.length + '，已选 ' + state.selected.size;
}
function normalizeForSort(value) {
    return String(value || '').toLowerCase();
}
function applyFilters() {
    const keyword = normalizeForSort(el('searchInput').value).trim();
    const group = el('groupSelect').value;
    const field = el('sortFieldSelect').value;
    const direction = el('sortDirectionSelect').value === 'desc' ? -1 : 1;
    state.visible = state.members.filter((member) => {
        if (group && member.displayGroup !== group) return false;
        if (!keyword) return true;
        return [member.displayName, member.displayGroup, member.displayUserId, member.displayChannelId].some((value) => normalizeForSort(value).includes(keyword));
    });
    state.visible.sort((a, b) => {
        const valueA = field === 'group' ? a.displayGroup : field === 'userId' ? a.displayUserId : field === 'channelId' ? a.displayChannelId : a.displayName;
        const valueB = field === 'group' ? b.displayGroup : field === 'userId' ? b.displayUserId : field === 'channelId' ? b.displayChannelId : b.displayName;
        return normalizeForSort(valueA).localeCompare(normalizeForSort(valueB), 'zh-Hans-CN', { numeric: true }) * direction;
    });
    renderTable();
}
function renderGroups() {
    const groups = Array.from(new Set(state.members.map((member) => member.displayGroup).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    el('groupSelect').innerHTML = '<option value="">全部分团</option>' + groups.map((group) => '<option value="' + escapeHtml(group) + '">' + escapeHtml(group) + '</option>').join('');
}
function renderTable() {
    el('memberBody').innerHTML = state.visible.map((member) => {
        return '<tr>' +
            '<td><input type="checkbox" data-key="' + escapeHtml(member.key) + '"' + (state.selected.has(member.key) ? ' checked' : '') + '></td>' +
            '<td class="name" title="' + escapeHtml(member.displayName) + '">' + escapeHtml(member.displayName) + '</td>' +
            '<td title="' + escapeHtml(member.displayGroup) + '">' + escapeHtml(member.displayGroup) + '</td>' +
            '<td title="' + escapeHtml(member.displayUserId) + '">' + escapeHtml(member.displayUserId || '-') + '</td>' +
            '<td title="' + escapeHtml(member.displayChannelId) + '">' + escapeHtml(member.displayChannelId || '-') + '</td>' +
        '</tr>';
    }).join('');
    selectedCountText();
}
function setRunning(running, stopping) {
    state.running = running;
    el('startBtn').disabled = running;
    el('stopBtn').disabled = !running || stopping;
    el('reloadBtn').disabled = running;
}
function appendLog(line, level) {
    const box = el('logBox');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const div = document.createElement('div');
    div.className = 'log-line ' + (level || 'info');
    div.textContent = line;
    box.appendChild(div);
    if (atBottom) box.scrollTop = box.scrollHeight;
}
async function loadMembers() {
    const res = await window.liveDanmuGui.loadMembers();
    state.members = res.members || [];
    state.selected = new Set(state.selected);
    el('outputDirInput').value = res.outputDir || '';
    renderGroups();
    applyFilters();
    appendLog('成员列表加载完成，共 ' + state.members.length + ' 个。', 'success');
}

el('memberBody').addEventListener('change', (event) => {
    const checkbox = event.target;
    if (!checkbox || checkbox.type !== 'checkbox') return;
    if (checkbox.checked) state.selected.add(checkbox.dataset.key);
    else state.selected.delete(checkbox.dataset.key);
    selectedCountText();
});
for (const id of ['searchInput', 'groupSelect', 'sortFieldSelect', 'sortDirectionSelect']) {
    el(id).addEventListener('input', applyFilters);
    el(id).addEventListener('change', applyFilters);
}
el('selectVisibleBtn').addEventListener('click', () => {
    for (const member of state.visible) state.selected.add(member.key);
    renderTable();
});
el('selectAllBtn').addEventListener('click', () => {
    for (const member of state.members) state.selected.add(member.key);
    renderTable();
});
el('clearAllBtn').addEventListener('click', () => {
    state.selected.clear();
    renderTable();
});
el('invertVisibleBtn').addEventListener('click', () => {
    for (const member of state.visible) {
        if (state.selected.has(member.key)) state.selected.delete(member.key);
        else state.selected.add(member.key);
    }
    renderTable();
});
el('reloadBtn').addEventListener('click', loadMembers);
el('selectOutputBtn').addEventListener('click', async () => {
    const res = await window.liveDanmuGui.selectOutputDir();
    if (res.outputDir) el('outputDirInput').value = res.outputDir;
});
el('openOutputBtn').addEventListener('click', async () => {
    await window.liveDanmuGui.openOutputDir();
});
el('stopBtn').addEventListener('click', async () => {
    await window.liveDanmuGui.stopFetch();
});
el('startBtn').addEventListener('click', async () => {
    if (!state.selected.size) {
        appendLog('请先选择成员。', 'warn');
        return;
    }
    el('summaryText').textContent = '抓取中...';
    const res = await window.liveDanmuGui.startFetch({
        selectedKeys: Array.from(state.selected),
        year: el('yearInput').value,
        concurrency: el('concurrencyInput').value,
        maxPages: el('maxPagesInput').value,
        maxLives: el('maxLivesInput').value,
        delay: el('delayInput').value,
        retry: el('retryInput').value,
        fetchRank: el('fetchRankInput').checked,
        saveLrc: el('saveLrcInput').checked,
        full: el('fullInput').checked,
        dryRun: el('dryRunInput').checked,
        outputDir: el('outputDirInput').value
    });
    if (!res.ok) {
        appendLog(res.error || '启动失败', 'error');
        el('summaryText').textContent = res.error || '启动失败';
    }
});
window.liveDanmuGui.onProgress((payload) => {
    if (!payload) return;
    if (payload.type === 'log') appendLog(payload.message, payload.level);
    if (payload.type === 'state') setRunning(payload.running, payload.stopping);
    if (payload.type === 'summary') {
        el('summaryText').textContent = '进度 ' + payload.done + ' / ' + payload.total + '，成功 ' + payload.ok + '，新增 ' + payload.added + ' 条，更新 ' + payload.updated + ' 条，去重 ' + payload.skipped + ' 条，失败 ' + payload.failedLives + ' 场，无弹幕 ' + payload.noDanmu + ' 场。';
    }
});
loadMembers().catch((error) => appendLog('加载成员失败: ' + error.message, 'error'));
</script>
</body>
</html>`;
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
