const path = require('path');
const fs = require('fs');
const https = require('https');
const readline = require('readline');
const { ipcRenderer, shell } = require('electron');
const { ensureStoragePaths } = require('../common/storage-paths');

const appDir = path.join(__dirname, '../../');
const platform = process.platform;
const storagePaths = ensureStoragePaths();
const bundledMembersFile = path.join(appDir, 'members_id.csv');

if (!fs.existsSync(storagePaths.membersFile) && fs.existsSync(bundledMembersFile)) {
    fs.copyFileSync(bundledMembersFile, storagePaths.membersFile);
}

window.desktop = {
    appDir,
    platform,
    storagePaths,
    fs,
    path,
    https,
    readline,
    ipcRenderer: {
        send(channel, payload) {
            ipcRenderer.send(channel, payload);
        },
        invoke(channel, payload) {
            return ipcRenderer.invoke(channel, payload);
        },
        on(channel, listener) {
            ipcRenderer.on(channel, listener);
            return () => ipcRenderer.removeListener(channel, listener);
        }
    },
    openExternal(url) {
        return shell.openExternal(url);
    },
    openExternalPlayer(url) {
        return ipcRenderer.invoke('open-external-player', { url });
    }
};

window.ipcRenderer = window.desktop.ipcRenderer;
