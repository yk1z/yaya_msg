const { ipcMain } = require('electron');
const messageIndexService = require('../services/message-index-service');

function registerMessageIndexIpc() {
    ipcMain.handle('sync-gift-prices', (_event, payload) => require('../services/gift-price-sync-service').syncGiftPrices(payload));
    ipcMain.handle('message-index-sync', () => messageIndexService.syncMessageIndex());
    ipcMain.handle('message-index-summary', () => messageIndexService.getMessageIndexSummary());
    ipcMain.handle('message-index-query-page', (event, payload) => messageIndexService.queryMessageIndexPage(payload || {}));
    ipcMain.handle('message-index-context', (event, payload) => messageIndexService.getMessageIndexContext(payload || {}));
    ipcMain.handle('message-index-analyze', (event, payload) => messageIndexService.queryMessageAnalysis(payload || {}));
    ipcMain.handle('message-index-get-all', () => messageIndexService.getAllMessageIndexRecords());
}

module.exports = {
    registerMessageIndexIpc
};
