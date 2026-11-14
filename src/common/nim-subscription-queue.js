'use strict';

const { setTimeout: delay } = require('node:timers/promises');

function createNimSubscriptionQueue({ intervalMs = 250, now = Date.now,
    wait = (ms, signal) => delay(ms, undefined, { signal }), retryDelays = [1000, 3000, 10000] } = {}) {
    const controller = new AbortController();
    let queue = Promise.resolve();
    let nextAt = 0;

    function assertOpen() {
        if (!controller.signal.aborted) return;
        const error = new Error('成员房间连接已取消');
        error.code = 'MEMBER_ROOM_CONNECT_CANCELLED';
        throw error;
    }

    function request(work) {
        const pending = queue.catch(() => {}).then(async () => {
            for (let attempt = 0; ; attempt++) {
                assertOpen();
                const pause = Math.max(0, nextAt - now());
                if (pause) {
                    try { await wait(pause, controller.signal); }
                    catch (error) { assertOpen(); throw error; }
                }
                assertOpen();
                nextAt = now() + intervalMs;
                try { return await work(); }
                catch (error) {
                    if (Number(error.code) !== 416) throw error;
                    const cooldown = retryDelays[Math.min(attempt, retryDelays.length - 1)];
                    nextAt = Math.max(nextAt, now() + cooldown);
                    if (attempt >= retryDelays.length) {
                        const limited = new Error('房间订阅请求过于频繁，请稍后重试（416）');
                        limited.code = 416;
                        limited.retryAfterMs = cooldown;
                        throw limited;
                    }
                }
            }
        });
        queue = pending.catch(() => {});
        return pending;
    }

    return { request, close: () => controller.abort(), get closed() { return controller.signal.aborted; } };
}

module.exports = { createNimSubscriptionQueue };
