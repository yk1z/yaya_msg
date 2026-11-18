const path = require('node:path');
const { fileURLToPath } = require('node:url');

const desktopEntry = path.resolve(__dirname, '../../desktop.html');

function isDesktopDocument(rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== 'file:') return false;
        const target = path.resolve(fileURLToPath(url));
        return process.platform === 'win32'
            ? target.toLowerCase() === desktopEntry.toLowerCase()
            : target === desktopEntry;
    } catch (_) {
        return false;
    }
}

function isMainFrameSender(event) {
    return !!event.senderFrame && event.senderFrame === event.sender?.mainFrame;
}

module.exports = { desktopEntry, isDesktopDocument, isMainFrameSender };
