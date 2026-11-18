const { ipcMain } = require('electron');
const { handleDesktop } = require('./desktop-sender');
const messageIndexService = require('../services/message-index-client');

function registerMessageIndexIpc() {
    handleDesktop(ipcMain, 'sync-gift-prices', (_event, payload) => require('../services/gift-price-sync-service').syncGiftPrices(payload));
    handleDesktop(ipcMain, 'message-index-sync', () => messageIndexService.syncMessageIndex());
    handleDesktop(ipcMain, 'message-index-summary', () => messageIndexService.getMessageIndexSummary());
    handleDesktop(ipcMain, 'message-index-query-page', (event, payload) => messageIndexService.queryMessageIndexPage(payload || {}));
    handleDesktop(ipcMain, 'message-index-context', (event, payload) => messageIndexService.getMessageIndexContext(payload || {}));
    handleDesktop(ipcMain, 'message-index-analyze', (event, payload) => messageIndexService.queryMessageAnalysis(payload || {}));
    handleDesktop(ipcMain, 'message-index-get-all', () => messageIndexService.getAllMessageIndexRecords());
}

module.exports = {
    registerMessageIndexIpc
};
