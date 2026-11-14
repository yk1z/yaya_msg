const fs = require('fs');
const path = require('path');

function renderDesktopDocument(sharedDocument, home, navigation, version = require('../../package.json').version) {
    const appVersion = String(version).replace(/[^0-9A-Za-z.+-]/g, '');
    const allFilter = '<div class="filter-chip active" onclick="setFilter(\'all\')" id="filter-all">全部</div>';
    const liveFilter = '<div class="filter-chip" onclick="setFilter(\'live-record\')" id="filter-live-record">直播</div>';
    const homeStart = sharedDocument.indexOf('            <div id="view-home"');
    const homeEnd = sharedDocument.indexOf('            <div id="view-followed-rooms"', homeStart);
    const mainTag = '        <main class="main-content home-mode" id="mainContentArea">';
    const rendererTag = '    <script src="./src/renderer/renderer-utils.js?v=__YAYA_BUILD_VERSION__"></script>';
    const oldNavigationStart = sharedDocument.indexOf('            <div class="sidebar-group" id="sb-settings-group">');
    const oldNavigationEnd = sharedDocument.indexOf('            <div class="sidebar-group" id="sb-search"', oldNavigationStart);
    if (homeStart < 0 || homeEnd < homeStart || oldNavigationStart < 0 || oldNavigationEnd < oldNavigationStart
        || !sharedDocument.includes(mainTag) || !sharedDocument.includes(rendererTag)) {
        throw new Error('Desktop document layout anchors were not found');
    }
    const document = sharedDocument.slice(0, oldNavigationStart) + sharedDocument.slice(oldNavigationEnd, homeStart)
        + home.trim() + '\n\n' + sharedDocument.slice(homeEnd);
    return document
        .replace('<head>', `<head>\n    <meta name="yaya-app-version" content="${appVersion}">`)
        .replace(/<span>牙牙消息(?: v[\d.]+)?<\/span>/,
            '<span>牙牙消息</span><script>if (window.desktop?.isRoomWindow) document.currentScript.previousElementSibling.textContent = window.desktop.isLiveWindow ? "牙牙消息 · 直播" : "牙牙消息 · 房间";</script>')
        .replace(/^[ \t]*<script src="\.\/src\/web\/[^"\n]+"><\/script>\r?\n/gm, '')
        .replace(/^[ \t]*<link\b[^>]*\bhref="\.\/src\/web\/[^"\n]+"[^>]*>\r?\n/gm, '')
        .replace('<html ', '<html class="desktop-workspace-pending" data-desktop-shell="true" ')
        .replace('<body class="topbar-page-title-enabled">', '<body class="topbar-page-title-enabled desktop-workspace">')
        .replace('<aside class="sidebar app-sidebar-disabled home-hidden">', '<aside class="sidebar desktop-message-sidebar">')
        .replace(allFilter, '')
        .replace('<div class="filter-group" id="filterGroup">', '<div class="filter-group" id="filterGroup">\n                    ' + allFilter)
        .replace(liveFilter, liveFilter + '\n                    <div class="filter-chip" onclick="setFilter(\'gift\')" id="filter-gift">礼物</div>')
        .replace(mainTag, navigation.trim() + '\n' + mainTag)
        .replace(/^[ \t]*<img id="web-background-layer"[^>]*>\r?\n/m, '')
        .replace(rendererTag, '    <link rel="stylesheet" href="./src/renderer/desktop-workspace.css?v=__YAYA_BUILD_VERSION__">\n    <link rel="stylesheet" href="./src/renderer/room-window.css?v=__YAYA_BUILD_VERSION__">\n' + rendererTag);
}

function buildDesktopShell(projectRoot = path.join(__dirname, '../..')) {
    const read = name => fs.readFileSync(path.join(projectRoot, name), 'utf8');
    const document = renderDesktopDocument(read('index.html'), read('src/renderer/desktop-home.html'), read('src/renderer/desktop-navigation.html'), JSON.parse(read('package.json')).version);
    const outputPath = path.join(projectRoot, 'desktop.html');
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== document) {
        fs.writeFileSync(outputPath, document, 'utf8');
    }
    return outputPath;
}

module.exports = { renderDesktopDocument, buildDesktopShell };
