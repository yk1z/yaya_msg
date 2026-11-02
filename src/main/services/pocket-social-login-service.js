'use strict';

const { randomBytes } = require('crypto');
const { getProvider, authorizationUrl, isQqAuthorizationPage, parseAuthorizationCallback, isAllowedAuthorizationUrl } = require('../../common/pocket-social-login');
const { qqAuthorizationPageScript } = require('./qq-login-presentation');

async function providerJson(fetchImpl, url, options, signal, jsonp = false) {
    let response;
    try {
        response = await fetchImpl(url, { ...options, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), redirect: 'error', cache: 'no-store', credentials: 'omit' });
    } catch { throw new Error('获取第三方用户资料失败，请检查网络后重试'); }
    if (!response.ok) throw new Error('获取第三方用户资料失败，请重新授权');
    let text = await response.text();
    if (text.length > 256 * 1024) throw new Error('第三方返回内容异常');
    if (jsonp) text = text.replace(/^\s*callback\s*\(\s*/, '').replace(/\s*\)\s*;?\s*$/, '');
    try {
        // Retrofit reads Baidu userid directly as a String. Preserve the original
        // integer spelling here too; JSON.parse -> Number -> String can change IDs.
        return JSON.parse(text, (_key, value, context) => typeof value === 'number' && !Number.isSafeInteger(value)
            && /^-?\d+$/.test(context?.source || '') ? context.source : value);
    } catch { throw new Error('第三方返回内容异常，请稍后重试'); }
}

async function readProviderUser(provider, auth, fetchImpl, signal) {
    const params = new URLSearchParams({ access_token: auth.accessToken });
    let info, openId, nickname, avatar;
    if (provider === 'baidu') {
        info = await providerJson(fetchImpl, 'https://openapi.baidu.com/rest/2.0/passport/users/getInfo', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString()
        }, signal);
        openId = String(info.userid || ''); nickname = info.username; avatar = info.portrait ? 'https://tb.himg.baidu.com/sys/portrait/item/' + encodeURIComponent(info.portrait) : '';
    } else if (provider === 'qq') {
        const identity = await providerJson(fetchImpl, 'https://graph.qq.com/oauth2.0/me?' + params, {}, signal, true);
        if (String(identity.client_id) !== getProvider('qq').appId) throw new Error('QQ 授权应用不匹配，请重新登录');
        openId = String(identity.openid || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(openId)) throw new Error('QQ 授权资料不完整');
        params.set('openid', openId); params.set('oauth_consumer_key', getProvider('qq').appId);
        info = await providerJson(fetchImpl, 'https://graph.qq.com/user/get_user_info?' + params, {}, signal);
        if (Number(info.ret) !== 0) throw new Error('获取 QQ 用户资料失败，请重新授权');
        nickname = info.nickname; avatar = info.figureurl_qq_2 || info.figureurl_qq_1 || '';
    } else if (provider === 'weibo') {
        const identity = await providerJson(fetchImpl, 'https://api.weibo.com/oauth2/get_token_info', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString()
        }, signal);
        if (String(identity.appkey) !== getProvider('weibo').appId) throw new Error('微博授权应用不匹配，请重新登录');
        openId = String(identity.uid || '');
        if (!/^\d{1,24}$/.test(openId)) throw new Error('微博授权资料不完整');
        params.set('uid', openId);
        info = await providerJson(fetchImpl, 'https://api.weibo.com/2/users/show.json?' + params, {}, signal);
        nickname = info.screen_name || info.name; avatar = info.avatar_large || info.profile_image_url || '';
    } else throw new Error('不支持的网页授权方式');
    if (!openId || !nickname || info.error || info.error_code) throw new Error('获取第三方用户资料失败，请重新授权');
    return { accessToken: auth.accessToken, openId, nickname, avatar };
}

function createPocketSocialLoginService({ BrowserWindow, invokePocket, fetchImpl = globalThis.fetch, timeoutMs = 300000 }) {
    const sessions = new Map();
    const cancelled = { success: false, cancelled: true, msg: '已取消登录' };

    function cancel(owner, attemptId) {
        if (owner.isDestroyed()) return { success: true };
        const state = sessions.get(owner.id);
        if (state && (!attemptId || attemptId === state.attemptId)) state.finish(cancelled);
        return { success: true };
    }

    async function start(owner, payload = {}) {
        const { provider, clientProfile, deviceId, attemptId } = payload;
        let config;
        try {
            config = getProvider(provider);
            if (config.unavailable) throw new Error(config.unavailable);
            if (!['pocket48', 'seine48'].includes(clientProfile) || !/^[a-f0-9]{16}$/.test(deviceId || '') || !/^[a-f0-9-]{16,64}$/i.test(attemptId || '')) throw new Error('登录参数无效，请重试');
            if (owner.isDestroyed()) return cancelled;
        } catch (error) { return { success: false, msg: error.message }; }
        cancel(owner);
        const ownerId = owner.id;
        return new Promise(resolve => {
            const controller = new AbortController();
            const state = { attemptId, controller, window: null, exchanging: false, done: false };
            sessions.set(ownerId, state);
            const isCurrent = () => !state.done && sessions.get(ownerId) === state && !owner.isDestroyed();
            const onDestroyed = () => state.finish(cancelled);
            const onNavigation = (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) state.finish(cancelled); };
            const timer = setTimeout(() => state.finish({ success: false, msg: '登录已超时，请重试' }), timeoutMs);
            state.finish = result => {
                if (state.done) return;
                state.done = true; clearTimeout(timer); controller.abort();
                if (sessions.get(ownerId) === state) sessions.delete(ownerId);
                owner.removeListener('destroyed', onDestroyed); owner.removeListener('did-start-navigation', onNavigation);
                const win = state.window;
                const browserSession = state.browserSession;
                if (win && !win.isDestroyed()) win.destroy();
                // Each login has a fresh in-memory partition; clear it after the window is destroyed.
                if (browserSession) Promise.allSettled([
                    Promise.resolve().then(() => browserSession.clearStorageData()),
                    Promise.resolve().then(() => browserSession.clearCache())
                ]).catch(() => {});
                resolve(result);
            };
            owner.once('destroyed', onDestroyed); owner.on('did-start-navigation', onNavigation);
            const exchange = async credentials => {
                if (!isCurrent() || state.exchanging) return;
                state.exchanging = true;
                if (state.window && !state.window.isDestroyed()) state.window.hide();
                try {
                    if (!isCurrent()) return;
                    const result = await invokePocket('login-by-thirdparty', { provider, credentials, clientProfile, deviceId });
                    if (isCurrent()) state.finish(result);
                } catch { if (isCurrent()) state.finish({ success: false, msg: '登录请求失败，请稍后重试' }); }
            };
            if (provider === 'sigua') {
                const credentials = { sgAccount: payload.sgAccount, sgToken: payload.sgToken };
                exchange(credentials);
                return;
            }
            const oauthState = randomBytes(24).toString('hex');
            let receiving = false;
            let qqAuthorizationPageSeen = false;
            let navigationRevision = 0;
            const loadAuthorizationPage = url => {
                const revision = ++navigationRevision;
                state.window.loadURL(url).catch(error => {
                    // Only the current navigation may fail the login attempt.
                    if (isCurrent() && !receiving && revision === navigationRevision && error?.code !== 'ERR_ABORTED') {
                        state.finish({ success: false, msg: '授权页加载失败，请检查网络后重试' });
                    }
                });
            };
            const navigate = (event, rawUrl) => {
                if (!isCurrent()) { event?.preventDefault(); return; }
                try {
                    if (isQqAuthorizationPage(provider, rawUrl, oauthState)) qqAuthorizationPageSeen = true;
                    const auth = parseAuthorizationCallback(provider, rawUrl, oauthState);
                    if (auth) {
                        event?.preventDefault();
                        if (receiving) return;
                        receiving = true;
                        state.window.hide();
                        readProviderUser(provider, auth, fetchImpl, controller.signal).then(credentials => {
                            if (isCurrent()) exchange(credentials);
                        }).catch(error => { if (isCurrent()) state.finish({ success: false, msg: error.message }); });
                        return;
                    }
                    if (!isAllowedAuthorizationUrl(provider, rawUrl)) {
                        event?.preventDefault();
                        state.finish({ success: false, msg: '授权页跳转到不支持的地址，请使用其他登录方式' });
                    }
                    if (provider === 'qq' && qqAuthorizationPageSeen && /^https:\/\/connect\.qq\.com\/?(?:[?#].*)?$/.test(rawUrl)) {
                        event?.preventDefault();
                        state.finish({ success: false, msg: 'QQ 返回了互联首页，没有返回口袋授权结果。请重新发起 QQ 登录。' });
                    }
                } catch (error) {
                    event?.preventDefault();
                    state.finish({ success: false, msg: error.message });
                }
            };
            try {
                const parent = BrowserWindow.fromWebContents(owner);
                const win = new BrowserWindow({
                    parent, width: 520, height: 730, minWidth: 420, minHeight: 520,
                    title: config.name + '登录 · 牙牙消息', autoHideMenuBar: true,
                    webPreferences: { partition: 'yaya-pocket-auth-' + randomBytes(16).toString('hex'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
                });
                state.window = win;
                state.browserSession = win.webContents.session;
                win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
                win.webContents.session.setPermissionCheckHandler(() => false);
                win.webContents.session.on('will-download', event => event.preventDefault());
                win.on('closed', () => state.finish(cancelled));
                win.webContents.on('will-navigate', navigate);
                win.webContents.on('will-redirect', (event, url, _inPlace, isMainFrame) => {
                    if (isMainFrame !== false && event.isMainFrame !== false) navigate(event, url || event.url);
                });
                // Implicit authorization can attach its fragment only when the final
                // document commits. Baidu's Android client also checks onPageFinished;
                // checking just will-navigate/will-redirect can leave the success page open.
                win.webContents.on('did-navigate', (_event, url) => navigate(null, url));
                win.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => { if (isMainFrame) navigate(event, url); });
                win.webContents.on('did-finish-load', () => {
                    if (!isCurrent() || receiving) return;
                    const url = win.webContents.getURL();
                    navigate(null, url);
                    if (isCurrent() && !receiving && isQqAuthorizationPage(provider, url, oauthState)) {
                        win.webContents.executeJavaScript(qqAuthorizationPageScript(oauthState)).catch(() => {});
                    }
                });
                win.webContents.setWindowOpenHandler(({ url }) => {
                    navigate(null, url);
                    if (isCurrent() && !receiving && isAllowedAuthorizationUrl(provider, url)) win.loadURL(url).catch(() => {});
                    return { action: 'deny' };
                });
                win.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
                    if (isMainFrame && code !== -3 && !receiving && isCurrent()) state.finish({ success: false, msg: '授权页加载失败，请检查网络后重试' });
                });
                loadAuthorizationPage(authorizationUrl(provider, oauthState));
            } catch { state.finish({ success: false, msg: '无法打开授权窗口，请稍后重试' }); }
        });
    }
    return { start, cancel, closeAll: () => { for (const state of sessions.values()) state.finish(cancelled); } };
}

module.exports = { createPocketSocialLoginService, readProviderUser };
