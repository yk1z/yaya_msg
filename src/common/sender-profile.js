'use strict';

(function installSenderProfile(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.YayaSenderProfile = api;
})(typeof window !== 'undefined' ? window : null, function createSenderProfileApi() {
const STRING_LIMITS = Object.freeze({
    userId: 32,
    nickName: 50,
    avatar: 2048,
    teamLogo: 2048,
    pfUrl: 2048,
    bubbleId: 32,
    badge: 2048,
    img: 2048,
    monthLevel: 50,
    setText: 100,
    levelColor: 64,
    textColor: 64,
    version: 64,
    build: 64,
    phoneName: 128,
    phoneSystemVersion: 128,
    mobileOperators: 128,
    ip: 128
});

function normalizeString(value, field, { strict = false } = {}) {
    const normalized = String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim();
    const limit = STRING_LIMITS[field];
    if (strict && Array.from(normalized).length > limit) {
        throw new Error(`${field} 长度不能超过 ${limit} 个字符`);
    }
    return Array.from(normalized).slice(0, limit).join('');
}

function normalizeUserId(value, options, field = 'userId') {
    const userId = normalizeString(value, field, options);
    if (userId && !/^\d{1,32}$/.test(userId)) {
        if (options?.strict) throw new Error(`${field} 必须为 1 至 32 位数字`);
        return '';
    }
    return userId;
}

function normalizeAssetValue(value, field, options) {
    const normalized = normalizeString(value, field, options);
    if (!normalized) return '';
    const isRelativePath = /^\/(?!\/)[^\s"'<>]*$/.test(normalized);
    let isHttpUrl = false;
    try {
        const parsed = new URL(normalized);
        isHttpUrl = (parsed.protocol === 'https:' || parsed.protocol === 'http:')
            && !parsed.username
            && !parsed.password;
    } catch (_error) {
    }
    if (!isRelativePath && !isHttpUrl) {
        if (options?.strict) throw new Error(`${field} 必须是 HTTP(S) URL 或以 / 开头的资源路径`);
        return '';
    }
    return normalized;
}

function normalizeInteger(value, field, { strict = false } = {}, min = 0) {
    if (value === '' || value === null || value === undefined) return null;
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < min || normalized > 999) {
        if (strict) throw new Error(`${field} 必须是 ${min} 至 999 的整数`);
        return null;
    }
    return normalized;
}

function normalizeBadge(value, options) {
    if (value === null || value === undefined || value === '') return null;
    let list = value;
    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return null;
        try { list = text.startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).map(item => item.trim()).filter(Boolean); }
        catch (_error) { if (options.strict) throw new Error('badge 必须是字符串数组或每行一个资源地址'); return null; }
    }
    if (!Array.isArray(list) || list.length > 100 || list.some(item => typeof item !== 'string')) {
        if (options.strict) throw new Error('badge 必须是字符串数组，最多 100 项');
        return null;
    }
    return list.map(item => normalizeAssetValue(item, 'badge', options)).filter(Boolean);
}

function normalizeMonthCardBadge(value, options) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const result = {};
    for (const field of ['img', 'level', 'levelColor', 'setText', 'textColor']) {
        let text = field === 'img' ? normalizeAssetValue(value[field], 'img', options)
            : normalizeString(value[field], field === 'level' ? 'monthLevel' : field, options);
        if (text && (field === 'levelColor' || field === 'textColor')) {
            text = text.replace(/^#/, '');
            if (!/^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) {
                if (options.strict) throw new Error(`${field} 必须为 6 或 8 位十六进制颜色，例如 FFFFFF`);
                continue;
            }
        }
        if (text) result[field] = text;
    }
    if (!Object.keys(result).length) return null;
    const required = ['img', 'level', 'levelColor', 'setText', 'textColor'];
    if (required.some(field => !result[field])) {
        if (options.strict) throw new Error('monthCardBadge 的图片、等级、等级颜色、徽章文字和文字颜色需一起填写，或全部留空');
        return null;
    }
    return result;
}

function normalizeCustomSenderProfile(value, { strict = false } = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const options = { strict };
    return {
        enabled: source.enabled === true,
        userId: normalizeUserId(source.userId, options),
        nickName: normalizeString(source.nickName ?? source.nickname, 'nickName', options),
        avatar: normalizeAssetValue(source.avatar, 'avatar', options),
        level: normalizeInteger(source.level, 'level', options),
        roleId: normalizeInteger(source.roleId, 'roleId', options),
        channelRole: normalizeInteger(source.channelRole, 'channelRole', options),
        vip: typeof source.vip === 'boolean' ? source.vip : null,
        teamLogo: normalizeAssetValue(source.teamLogo, 'teamLogo', options),
        pfUrl: normalizeAssetValue(source.pfUrl, 'pfUrl', options),
        badge: normalizeBadge(source.badge, options),
        bubbleId: normalizeUserId(source.bubbleId, options, 'bubbleId'),
        monthCardBadge: normalizeMonthCardBadge(source.monthCardBadge, options),
        sessionRole: normalizeInteger(source.sessionRole, 'sessionRole', options, -1),
        inTop: typeof source.inTop === 'boolean' ? source.inTop : null,
        config: Object.fromEntries(['version', 'build', 'phoneName', 'phoneSystemVersion', 'mobileOperators', 'ip']
            .map(field => [field, normalizeString(source.config?.[field], field, options)]))
    };
}

function applyCustomSenderProfile(userInfo, customProfile, options = {}) {
    const base = userInfo && typeof userInfo === 'object' && !Array.isArray(userInfo)
        ? { ...userInfo }
        : {};
    const custom = normalizeCustomSenderProfile(customProfile, options);
    if (!custom.enabled) return base;

    if (custom.userId) base.userId = custom.userId;
    if (custom.nickName) {
        base.nickname = custom.nickName;
        base.nickName = custom.nickName;
    }
    if (custom.avatar) base.avatar = custom.avatar;
    if (custom.level !== null) base.level = custom.level;
    if (custom.roleId !== null) base.roleId = custom.roleId;
    if (custom.vip !== null) base.vip = custom.vip;
    if (custom.teamLogo) base.teamLogo = custom.teamLogo;
    if (custom.pfUrl) base.pfUrl = custom.pfUrl;
    if (custom.badge !== null) base.badge = [...custom.badge];
    return base;
}

function applyCustomLiveExtensions(extension, customProfile) {
    const custom = normalizeCustomSenderProfile(customProfile);
    if (!custom.enabled) return extension;
    return {
        ...extension,
        bubbleId: custom.bubbleId || extension.bubbleId,
        sessionRole: custom.sessionRole ?? extension.sessionRole,
        inTop: custom.inTop ?? extension.inTop,
        ...(custom.monthCardBadge ? { monthCardBadge: { ...custom.monthCardBadge } } : {}),
        config: { ...extension.config, ...Object.fromEntries(Object.entries(custom.config).filter(([, value]) => value !== '')) }
    };
}

return {
    applyCustomLiveExtensions,
    applyCustomSenderProfile,
    normalizeCustomSenderProfile
};
});
