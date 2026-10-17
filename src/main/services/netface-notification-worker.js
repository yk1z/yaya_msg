'use strict';

const { parentPort } = require('node:worker_threads');
delete globalThis.navigator;
const NIM = require('@yxim/nim-web-sdk/dist/SDK/NIM_Web_NIM_nodejs.js');
let nim;
let stopped = false;
const emit = (type, data = {}) => { if (!stopped) parentPort.postMessage({ type, ...data }); };
parentPort.postMessage({ type: 'ready' });
parentPort.on('message', command => {
    if (command.type === 'stop') {
        stopped = true;
        if (nim) nim.destroy({ done: () => parentPort.close() });
        else parentPort.close();
        return;
    }
    if (command.type !== 'connect' || nim || stopped) return;
    try {
        nim = NIM.getInstance({
            appKey: command.appKey, account: command.account, token: command.token,
            debug: false, db: false, dbLog: false, needReconnect: true,
            syncRelations: false, syncFriends: false, syncTeams: false, syncSuperTeams: false,
            syncRoamingMsgs: false, syncSuperTeamRoamingMsgs: false, syncMsgReceipts: false,
            syncSessionUnread: false, syncAvSignal: false,
            onconnect: () => emit('connected'),
            onwillreconnect: () => emit('reconnecting'),
            ondisconnect: () => emit('disconnected'),
            onerror: () => emit('error'),
            oncustomsysmsg: data => {
                if (typeof data?.content === 'string') emit('notification', { content: data.content });
            }
        });
    } catch { emit('error'); }
});
