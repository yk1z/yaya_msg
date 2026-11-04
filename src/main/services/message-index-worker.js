const { parentPort, workerData } = require('node:worker_threads');
const service = require('./message-index-service');

service.configureMessageIndexStorage(workerData.storagePaths);
const methods = new Set([
    'syncMessageIndex', 'getMessageIndexSummary', 'queryMessageIndexPage',
    'getMessageIndexContext', 'queryMessageAnalysis', 'getAllMessageIndexRecords', 'closeMessageIndex'
]);
let queue = Promise.resolve();
parentPort.on('message', ({ id, method, payload }) => {
    queue = queue.then(async () => {
        try {
            if (!methods.has(method)) throw new Error('不支持的消息索引操作');
            const result = await service[method](payload);
            parentPort.postMessage({ id, result });
        } catch (error) {
            parentPort.postMessage({ id, error: { message: error.message, code: error.code } });
        }
    });
});
