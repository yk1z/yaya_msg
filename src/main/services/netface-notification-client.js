'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { signal } = require('../../common/netface-model');

function createNetfaceNotificationClient(options, {
    createWorker = () => new Worker(path.join(__dirname, 'netface-notification-worker.js'), { stdout: true, stderr: true })
} = {}) {
    let worker, timer, rejectConnect;
    let stopped = false;
    const terminate = current => {
        try { Promise.resolve(current.terminate()).catch(() => {}); } catch {                       }
    };
    function destroy() {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        rejectConnect?.(new Error('云握手通知连接已取消'));
        rejectConnect = null;
        if (worker) {
            const current = worker;
            try { current.postMessage({ type: 'stop' }); } catch { terminate(current); }
            const deadline = setTimeout(() => terminate(current), 1000);
            deadline.unref?.();
            current.once('exit', () => clearTimeout(deadline));
            worker = null;
        }
    }
    function connect() {
        if (stopped || worker) return Promise.reject(new Error('云握手通知连接不可重复使用'));
        return new Promise((resolve, reject) => {
            rejectConnect = reject;
            const fail = () => {
                if (stopped) return;
                options.onError?.(new Error('云信自定义通知连接失败'));
                rejectConnect?.(new Error('云信自定义通知连接失败'));
                rejectConnect = null;
                clearTimeout(timer);
            };
            try {
                worker = createWorker();
                worker.stdout?.resume(); worker.stderr?.resume();
                worker.on('error', fail);
                worker.on('exit', () => { if (!stopped) { fail(); options.onDisconnected?.(); } });
                worker.on('message', data => {
                    if (stopped) return;
                    if (data.type === 'connected') {
                        clearTimeout(timer); rejectConnect = null;
                        options.onConnected?.(); resolve();
                    } else if (data.type === 'reconnecting') options.onReconnecting?.();
                    else if (data.type === 'disconnected' || data.type === 'error') { fail(); options.onDisconnected?.(); }
                    else if (data.type === 'notification') {
                        const parsed = signal({ custom: data.content });
                        if (parsed) options.onMessage?.({ custom: data.content });
                    }
                });
                timer = setTimeout(() => { fail(); destroy(); }, 20000);
                timer.unref?.();
                worker.postMessage({ type: 'connect', appKey: options.appKey, account: options.account, token: options.token });
            } catch { fail(); destroy(); }
        });
    }
    return { connect, destroy };
}

module.exports = { createNetfaceNotificationClient };
