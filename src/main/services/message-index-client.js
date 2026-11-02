const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { ensureStoragePaths } = require('../../common/storage-paths');

function createMessageIndexClient(options = {}) {
    let worker = null;
    let requestId = 0;
    let closed = false;
    let closePromise = null;
    let syncPromise = null;
    let watcher = null;
    let watchTimer = null;
    let watchDirty = false;
    let watchRunning = false;
    let watchListener = null;
    let storagePaths = options.storagePaths || null;
    const pending = new Map();
    const getPaths = () => storagePaths || (storagePaths = ensureStoragePaths());

    function ensureWorker() {
        if (worker) return worker;
        const makeWorker = options.createWorker || ((file, config) => new Worker(file, config));
        const current = makeWorker(path.join(__dirname, 'message-index-worker.js'), {
            workerData: { storagePaths: getPaths() }
        });
        worker = current;
        current.unref();
        current.on('message', message => {
            const request = pending.get(message.id);
            if (!request) return;
            pending.delete(message.id);
            if (message.error) {
                request.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
            } else request.resolve(message.result);
        });
        const fail = error => {
            if (worker !== current) return;
            worker = null;
            for (const request of pending.values()) request.reject(error);
            pending.clear();
        };
        current.on('error', fail);
        current.on('exit', code => fail(new Error(`消息索引后台任务已退出 (${code})，请重试`)));
        return current;
    }

    function request(method, payload, duringClose = false) {
        if (closed && !duringClose) return Promise.reject(new Error('消息索引正在关闭'));
        return new Promise((resolve, reject) => {
            const id = ++requestId;
            try {
                const current = ensureWorker();
                pending.set(id, { resolve, reject });
                current.postMessage({ id, method, payload });
            } catch (error) {
                pending.delete(id);
                reject(error);
            }
        });
    }

    function syncMessageIndex() {
        if (!syncPromise) syncPromise = request('syncMessageIndex').finally(() => { syncPromise = null; });
        return syncPromise;
    }

    async function flushWatcher() {
        if (watchRunning || closed) return;
        watchRunning = true;
        try {
            while (watchDirty && !closed) {
                watchDirty = false;
                const result = await syncMessageIndex();
                if (!closed && (result.changedFiles > 0 || result.removedMessages > 0)) watchListener?.(result);
            }
        } catch (error) {
            if (!closed) console.warn('消息文件变化自动同步失败:', error);
        } finally {
            watchRunning = false;
            if (watchDirty && !closed) scheduleWatcher();
        }
    }

    function scheduleWatcher() {
        if (closed) return;
        watchDirty = true;
        if (watchTimer) clearTimeout(watchTimer);
        watchTimer = setTimeout(() => { watchTimer = null; void flushWatcher(); }, 500);
        watchTimer.unref?.();
    }

    function stopMessageIndexWatcher() {
        if (watchTimer) clearTimeout(watchTimer);
        watchTimer = null;
        watchDirty = false;
        watchListener = null;
        watcher?.close();
        watcher = null;
    }

    function startMessageIndexWatcher(listener) {
        if (closed) return;
        watchListener = typeof listener === 'function' ? listener : null;
        if (watcher) return;
        try {
            watcher = fs.watch(getPaths().htmlDir, { recursive: true }, scheduleWatcher);
            watcher.on('error', error => console.warn('消息数据目录监听失败:', error));
        } catch (error) { console.warn('无法启动消息数据目录监听:', error); }
    }

    function closeMessageIndex() {
        if (closePromise) return closePromise;
        closed = true;
        stopMessageIndexWatcher();
        closePromise = (async () => {
            const current = worker;
            if (!current) return;
            try { await request('closeMessageIndex', undefined, true); }
            catch (error) { console.warn('关闭消息索引后台任务失败:', error); }
            finally {
                if (worker === current) worker = null;
                await current.terminate();
            }
        })();
        return closePromise;
    }

    return {
        syncMessageIndex, startMessageIndexWatcher, stopMessageIndexWatcher, closeMessageIndex,
        getMessageIndexSummary: () => request('getMessageIndexSummary'),
        queryMessageIndexPage: payload => request('queryMessageIndexPage', payload),
        getMessageIndexContext: payload => request('getMessageIndexContext', payload),
        queryMessageAnalysis: payload => request('queryMessageAnalysis', payload),
        getAllMessageIndexRecords: () => request('getAllMessageIndexRecords')
    };
}

module.exports = { ...createMessageIndexClient(), createMessageIndexClient };
