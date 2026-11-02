const path = require('node:path');
const { SCHEME, parseDeepLink, findDeepLink } = require('../../common/deep-link');

function registerDeepLinkProtocol(app, runtime = process) {
    if (runtime.defaultApp) {
        if (!runtime.argv[1]) return false;
        return app.setAsDefaultProtocolClient(SCHEME, runtime.execPath, [path.resolve(runtime.argv[1])]);
    }
    return app.setAsDefaultProtocolClient(SCHEME);
}

function createDeepLinkController({ app, ipcMain, getMainWindow, showMainWindow }) {
    let pending = null;
    const readyWindows = new WeakSet();
    function flush() {
        const window = getMainWindow();
        if (!pending || !window || window.isDestroyed() || window.webContents.isDestroyed()
            || window.webContents.isLoadingMainFrame() || !readyWindows.has(window.webContents)) return;
        const route = pending;
        pending = null;
        window.webContents.send('deep-link-open', route);
    }
    function acceptRoute(route) {
        if (!route) return false;
        pending = route;
        if (app.isReady()) showMainWindow();
        flush();
        return true;
    }
    function accept(raw) { return acceptRoute(parseDeepLink(raw)); }
    app.on('open-url', (event, url) => { event.preventDefault(); accept(url); });
    ipcMain.on('deep-link-ready', event => {
        const window = getMainWindow();
        if (!window || event.sender !== window.webContents) return;
        readyWindows.add(event.sender);
        if (event.sender.isLoadingMainFrame()) event.sender.once('did-stop-loading', flush);
        flush();
    });
    return { accept, acceptArguments: args => acceptRoute(findDeepLink(args)), flush };
}

module.exports = { registerDeepLinkProtocol, createDeepLinkController };
