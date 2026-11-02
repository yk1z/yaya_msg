// Shared by Electron, the Node API and the web login gateway.
function normalizePocketClientProfile(value) {
    return value === 'pocket48' || value === 'seine48' ? value : '';
}

function createPocketClientHeaders({ clientProfile = 'pocket48', deviceId = '', token = '', pa = '' } = {}) {
    const appName = normalizePocketClientProfile(clientProfile) || 'pocket48';
    const appVersion = appName === 'seine48' ? '1.3.5' : '7.1.45';
    const appBuild = appName === 'seine48' ? 26102601 : '26102701';
    return {
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': `PocketFans201807/${appVersion}_${appBuild} (SM-G9730:Android 12;Samsung V417IR release-keys)`,
        'Accept-Language': 'zh-Hans-CN;q=1',
        appInfo: JSON.stringify({
            IMEI: deviceId, deviceId, appName, appVersion, appBuild,
            deviceName: 'SM-G9730', osType: 'android', osVersion: '12',
            phoneName: 'SM-G9730', phoneSystemVersion: '12', vendor: 'Samsung'
        }),
        ...(appName === 'seine48' ? { 'X-Custom-Device-Type': 'ANDROID' } : {}),
        ...(token ? { token } : {}),
        ...(pa ? { pa } : {})
    };
}

module.exports = { normalizePocketClientProfile, createPocketClientHeaders };
