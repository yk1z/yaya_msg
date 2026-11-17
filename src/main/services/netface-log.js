'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getStoragePaths } = require('../../common/storage-paths');
const { createNetfaceLogSanitizer } = require('../../common/netface-log-data');
const { version } = require('../../../package.json');

function createNetfaceLogger({ directory = () => path.join(getStoragePaths().internalDataDir, 'logs'),
    maxBytes = 20 * 1024 * 1024, backups = 5 } = {}) {
    const sanitize = createNetfaceLogSanitizer();
    const runId = crypto.randomUUID();
    let sequence = 0, reportedFailure = false;
    const localTime = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23' });
    return function writeNetfaceLog(input = {}) {
        if (!input || typeof input !== 'object' || !/^[a-z][a-z0-9-]{0,95}$/.test(input.event || '')) return false;
        try {
            const details = sanitize(input);
            for (const key of ['time', 'localTime', 'version', 'schemaVersion', 'runId', 'pid', 'sequence', 'logMode']) delete details[key];
            const now = new Date();
            const entry = { time: now.toISOString(), localTime: localTime.format(now).replace(' ', 'T') + '+08:00',
                version, schemaVersion: 2, logMode: 'full-redacted', runId, pid: process.pid, sequence: ++sequence, ...details };
            const logDir = directory();
            fs.mkdirSync(logDir, { recursive: true });
            const file = path.join(logDir, 'netface.log');
            const line = JSON.stringify(entry) + '\n';
            if (fs.existsSync(file) && fs.statSync(file).size + Buffer.byteLength(line) > maxBytes) {
                const count = Math.max(1, Math.min(20, Math.trunc(backups) || 1));
                for (let index = count; index >= 1; index--) {
                    const previous = index === 1 ? file : file + '.' + (index - 1);
                    const next = file + '.' + index;
                    fs.rmSync(next, { force: true });
                    if (fs.existsSync(previous)) fs.renameSync(previous, next);
                }
            }
            fs.appendFileSync(file, line, 'utf8');
            return true;
        } catch (error) {
            if (!reportedFailure) console.warn('[netface-log] write failed', error.code);
            reportedFailure = true;
            return false;
        }
    };
}

const writeNetfaceLog = createNetfaceLogger();
let requestSequence = 0;
async function traceNetfaceRequest(api, request, action, { log = writeNetfaceLog, ...context } = {}) {
    const started = Date.now();
    const details = { source: 'main', requestId: `main-${process.pid}-${++requestSequence}`, api, ...context };
    log({ ...details, event: 'request-start', request });
    try {
        const response = await action();
        log({ ...details, event: response?.success === false ? 'request-failed' : 'request-success', response, elapsedMilliseconds: Date.now() - started });
        return response;
    } catch (error) {
        log({ ...details, event: 'request-failed', error, elapsedMilliseconds: Date.now() - started });
        throw error;
    }
}

module.exports = { createNetfaceLogger, writeNetfaceLog, traceNetfaceRequest };
