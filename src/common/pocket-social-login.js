'use strict';

// Public application identifiers and request shapes from Pocket48 7.1.45.
// No provider application secret is needed for these implicit authorization flows.
const PROVIDERS = Object.freeze({
    baidu: { name: '百度贴吧', appId: 'CfFEZbR8HxiWHHDgr1EGWByV', type: 'BD' },
    sigua: { name: '丝瓜', type: 'SG' },
    wechat: { name: '微信', type: 'WX', unavailable: '微信登录暂不可用：官方移动应用授权需要服务端签名，目前无法在桌面端完成。请使用验证码或其他登录方式。' },
    qq: { name: 'QQ', appId: '1103838320', type: 'QQ' },
    weibo: { name: '微博', appId: '1603392323', type: 'WB' }
});

function getProvider(provider) {
    if (!Object.hasOwn(PROVIDERS, provider)) throw new Error('不支持的登录方式');
    return PROVIDERS[provider];
}

function authorizationUrl(provider, state) {
    const config = getProvider(provider);
    if (config.unavailable) throw new Error(config.unavailable);
    let url;
    if (provider === 'baidu') {
        url = new URL('https://openapi.baidu.com/oauth/2.0/authorize');
        url.search = new URLSearchParams({ client_id: config.appId, response_type: 'token', redirect_uri: 'oob', display: 'mobile', state });
    } else if (provider === 'qq') {
        url = new URL('https://graph.qq.com/oauth2.0/authorize');
        url.search = new URLSearchParams({ client_id: config.appId, response_type: 'token', redirect_uri: 'auth://tauth.qq.com/', scope: 'get_user_info', display: 'mobile', state });
    } else if (provider === 'weibo') {
        url = new URL('https://api.weibo.com/oauth2/authorize');
        url.search = new URLSearchParams({ client_id: config.appId, response_type: 'token', redirect_uri: 'https://api.weibo.com/oauth2/default.html', display: 'mobile', state });
    } else throw new Error('此登录方式不使用网页授权');
    return url.href;
}

function isQqAuthorizationPage(provider, rawUrl, expectedState) {
    if (provider !== 'qq') return false;
    let url;
    try { url = new URL(rawUrl); } catch { return false; }
    if (url.origin !== 'https://xui.ptlogin2.qq.com' || url.pathname !== '/cgi-bin/xlogin'
        || url.username || url.password || url.port || url.searchParams.get('style') !== '35') return false;
    const exactly = (key, value) => url.searchParams.getAll(key).length === 1 && url.searchParams.get(key) === value;
    if (!expectedState || !exactly('state', expectedState) || !exactly('client_id', PROVIDERS.qq.appId)
        || !exactly('pt_3rd_aid', PROVIDERS.qq.appId) || !exactly('response_type', 'token')
        || !exactly('redirect_uri', 'auth://tauth.qq.com/')) return false;
    return true;
}

function callbackMatches(provider, url) {
    if (url.username || url.password || url.port) return false;
    if (provider === 'baidu') return (url.protocol === 'oob:' && !url.host && !url.pathname)
        || (url.origin === 'https://openapi.baidu.com' && /^\/oauth\/2\.0\/login_success\/?$/.test(url.pathname));
    if (provider === 'qq') return url.protocol === 'auth:' && url.hostname === 'tauth.qq.com' && ['/', ''].includes(url.pathname);
    if (provider === 'weibo') return url.origin === 'https://api.weibo.com' && url.pathname === '/oauth2/default.html';
    return false;
}

function parseAuthorizationCallback(provider, rawUrl, expectedState) {
    let url;
    if (typeof rawUrl !== 'string' || rawUrl.length > 16384) return null;
    try { url = new URL(rawUrl.startsWith('oob#') ? 'oob:' + rawUrl.slice(3) : rawUrl); } catch { return null; }
    if (!callbackMatches(provider, url)) return null;
    const query = url.searchParams;
    const fragment = new URLSearchParams(url.hash.slice(1));
    const value = key => fragment.get(key) || query.get(key) || '';
    if (!value('access_token') && !value('error') && !value('error_code')) return null;
    const states = [...query.getAll('state'), ...fragment.getAll('state')];
    if (!expectedState || !states.length || states.some(state => state !== expectedState)) throw new Error('授权状态不匹配，请重新登录');
    if (value('error') || value('error_code')) throw new Error('第三方授权未完成，请重新登录');
    const accessToken = value('access_token');
    if (!/^[A-Za-z0-9_.~+/=-]{6,8192}$/.test(accessToken)) throw new Error('授权结果无效，请重新登录');
    return { accessToken, openId: value(provider === 'weibo' ? 'uid' : 'openid') };
}

function isAllowedAuthorizationUrl(provider, rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (callbackMatches(provider, url)) return true;
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
        const roots = provider === 'baidu' ? ['baidu.com'] : provider === 'qq' ? ['qq.com'] : provider === 'weibo' ? ['weibo.com', 'weibo.cn', 'sina.com.cn'] : [];
        return roots.some(root => url.hostname === root || url.hostname.endsWith('.' + root));
    } catch { return false; }
}

function socialLoginRequest(provider, credentials = {}) {
    const config = getProvider(provider);
    if (config.unavailable) throw new Error(config.unavailable);
    const text = (key, max, required = true) => {
        const value = credentials[key];
        if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\x00-\x1f\x7f]/.test(value)) throw new Error('第三方登录资料不完整');
        return value;
    };
    if (provider === 'sigua') return {
        path: '/user/api/v1/login/app/sg',
        body: { sgAccount: text('sgAccount', 256).trim(), sgToken: text('sgToken', 1024) }
    };
    const info = { accessToken: text('accessToken', 8192), nickname: text('nickname', 256), avatar: text('avatar', 2048, false) };
    info[provider === 'weibo' ? 'wbId' : 'openId'] = text('openId', 128);
    return { path: '/user/api/v2/login/app/app_login', body: { loginType: config.type, ['login' + config.type]: info, deviceToken: '' } };
}

function socialLoginResult(provider, data, httpStatus) {
    const config = getProvider(provider);
    const content = data?.content && typeof data.content === 'object' && !Array.isArray(data.content) ? data.content : null;
    const token = typeof content?.token === 'string' ? content.token.trim() : '';
    const status = Number(data?.status);
    const type = content?.type == null ? null : Number(content.type);
    const accepted = Number(httpStatus) === 200 && status === 200 && data?.success !== false;
    // The official LoginResponse uses type=1 for the follow-up binding flow;
    // its token, if present, must not become a regular logged-in session.
    if (accepted && token && type !== 1) return { success: true, status, content: { token } };
    const diagnostic = {
        stage: 'pocket-login', httpStatus: Number(httpStatus),
        businessStatus: Number.isFinite(status) ? status : null,
        resultType: Number.isFinite(type) ? type : null,
        hasToken: Boolean(token), hasUserInfo: Boolean(content?.userInfo),
        contentKind: data?.content == null ? 'empty' : Array.isArray(data.content) ? 'array' : typeof data.content,
        explicitFailure: data?.success === false
    };
    let message;
    if (accepted && type === 1) {
        message = `口袋接口要求本次${config.name}身份继续绑定账号（类型 1），尚未完成登录；若官方可直接登录，请确认两端使用的是同一个${config.name}账号。`;
    } else if (status === 10001) {
        message = '官方要求进一步注册或绑定，请先在官方 App 完成后重试';
    } else {
        const reason = typeof data?.message === 'string' ? data.message.trim() : '';
        const detail = !token ? '未返回登录 Token' : '接口未确认登录成功';
        const codes = `HTTP ${httpStatus}，状态 ${diagnostic.businessStatus ?? '缺失'}${diagnostic.resultType == null ? '' : '，类型 ' + diagnostic.resultType}`;
        message = reason && !/^(ok|success|成功|操作成功)$/i.test(reason)
            ? `${reason}（${codes}）` : `${config.name}授权已返回，但${detail}（${codes}）。`;
    }
    return { success: false, status: diagnostic.businessStatus ?? httpStatus, message, diagnostic };
}

module.exports = { PROVIDERS, getProvider, authorizationUrl, isQqAuthorizationPage, parseAuthorizationCallback, isAllowedAuthorizationUrl, socialLoginRequest, socialLoginResult };
