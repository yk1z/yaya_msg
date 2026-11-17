'use strict';

const secretKeys = new Set(['token', 'authorization', 'cookie', 'setcookie', 'password', 'passwd', 'pwd', 'impwd',
    'appsign', 'appsecret', 'secret', 'secretkey', 'privatekey', 'encryptionkey', 'sessionkey', 'apikey',
    'pa', 'tpkey', 'smscode', 'verificationcode', 'captchacode', 'signature', 'credential']);
const normalizeKey = key => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
const isSecretKey = key => secretKeys.has(normalizeKey(key)) || /(?:token|password|secret)$/.test(normalizeKey(key));
const parseJson = text => JSON.parse(text.replace(/(:\s*)(\d{15,})(?=\s*[,}])/g, '$1"$2"'));

function createNetfaceLogSanitizer({ maxDepth = 24, maxNodes = 100000, maxStringLength = 1024 * 1024 } = {}) {
    const secrets = new Set();
    function remember(value) {
        if (typeof value !== 'string' || value.length < 4 || value === '[REDACTED]') return;
        secrets.add(value);
        if (secrets.size > 512) secrets.delete(secrets.values().next().value);
    }
    function fields(value) {
        return [...new Set([...Object.keys(value), ...(Object.prototype.toString.call(value) === '[object Error]'
            ? ['name', 'message', 'stack', 'cause', ...Object.getOwnPropertyNames(value)] : [])])];
    }
    function observe(value, depth, seen, budget) {
        if (++budget.count > maxNodes || depth > maxDepth || value == null) return;
        if (typeof value === 'string') {
            if (value.length <= maxStringLength && /^[\s]*[\[{]/.test(value)) {
                try { observe(parseJson(value), depth + 1, seen, budget); } catch {}
            }
            return;
        }
        if (typeof value !== 'object' || seen.has(value) || ArrayBuffer.isView(value)) return;
        seen.add(value);
        for (const key of fields(value)) {
            let item;
            try { item = value[key]; } catch { continue; }
            if (isSecretKey(key)) {
                if (Array.isArray(item)) item.forEach(remember); else remember(item);
            } else observe(item, depth + 1, seen, budget);
        }
    }
    function cleanText(text) {
        let result = text;
        for (const secret of [...secrets].sort((a, b) => b.length - a.length)) result = result.split(secret).join('[REDACTED]');
        result = result.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, '$1 [REDACTED]');
        return result.replace(/([?&\s"'](?:[\w-]*token|authorization|cookie|password|passwd|pwd|imPwd|appSign|appSecret|secret|tpKey|pa|signature|credential)["']?\s*[:=]\s*["']?)([^\s"'&,;}]+)/gi, '$1[REDACTED]');
    }
    function clean(value, depth, seen, budget) {
        if (++budget.count > maxNodes) return '[Truncated: node limit]';
        if (depth > maxDepth) return '[Truncated: depth limit]';
        if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
        if (typeof value === 'bigint') return String(value);
        if (typeof value === 'string') {
            if (value.length > maxStringLength) return cleanText(value.slice(0, maxStringLength)) + `[Truncated: ${value.length} characters]`;
            if (/^[\s]*[\[{]/.test(value)) {
                try { return JSON.stringify(clean(parseJson(value), depth + 1, seen, budget)); } catch {}
            }
            return cleanText(value);
        }
        if (typeof value !== 'object') return String(value);
        if (seen.has(value)) return '[Circular]';
        if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : String(value);
        if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return { type: value.constructor?.name || 'Binary', byteLength: value.byteLength };
        seen.add(value);
        let result;
        if (Array.isArray(value)) result = value.map(item => clean(item, depth + 1, seen, budget));
        else {
            result = Object.create(null);
            for (const key of fields(value)) {
                try { result[key] = isSecretKey(key) ? '[REDACTED]' : clean(value[key], depth + 1, seen, budget); }
                catch { result[key] = '[Unavailable]'; }
            }
        }
        seen.delete(value);
        return result;
    }
    return function sanitize(value, credentials) {
        observe(credentials, 0, new WeakSet(), { count: 0 });
        observe(value, 0, new WeakSet(), { count: 0 });
        return clean(value, 0, new WeakSet(), { count: 0 });
    };
}

module.exports = { createNetfaceLogSanitizer };
