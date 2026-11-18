(function initYayaRendererUtils() {
    const SAFE_HTML = Symbol('YayaSafeHtml');

    const QQ_EMOJI_MAP = Object.freeze({
        '[微笑]': '🙂',
        '[撇嘴]': '😕',
        '[色]': '😍',
        '[发呆]': '😐',
        '[得意]': '😎',
        '[流泪]': '😢',
        '[害羞]': '😊',
        '[闭嘴]': '🤐',
        '[睡]': '😴',
        '[大哭]': '😭',
        '[尴尬]': '😅',
        '[发怒]': '😡',
        '[调皮]': '😜',
        '[呲牙]': '😁',
        '[龇牙]': '😁',
        '[惊讶]': '😮',
        '[难过]': '😞',
        '[酷]': '😎',
        '[囧]': '😣',
        '[冷汗]': '😰',
        '[抓狂]': '😫',
        '[吐]': '🤮',
        '[偷笑]': '🤭',
        '[愉快]': '😊',
        '[可爱]': '😊',
        '[白眼]': '🙄',
        '[傲慢]': '😤',
        '[饥饿]': '🤤',
        '[困]': '😪',
        '[惊恐]': '😱',
        '[流汗]': '😓',
        '[憨笑]': '😄',
        '[悠闲]': '😌',
        '[大兵]': '🫡',
        '[奋斗]': '💪',
        '[咒骂]': '🤬',
        '[疑问]': '❓',
        '[嘘]': '🤫',
        '[晕]': '😵',
        '[疯了]': '🤪',
        '[折磨]': '🤪',
        '[衰]': '😞',
        '[骷髅]': '💀',
        '[敲打]': '🔨',
        '[再见]': '👋',
        '[擦汗]': '😓',
        '[抠鼻]': '👃',
        '[鼓掌]': '👏',
        '[糗大了]': '😳',
        '[坏笑]': '😏',
        '[左哼哼]': '😤',
        '[右哼哼]': '😤',
        '[哈欠]': '🥱',
        '[鄙视]': '👎',
        '[委屈]': '🥺',
        '[快哭了]': '🥹',
        '[阴险]': '😈',
        '[亲亲]': '😘',
        '[吓]': '😨',
        '[可怜]': '🥺',
        '[菜刀]': '🔪',
        '[西瓜]': '🍉',
        '[啤酒]': '🍺',
        '[篮球]': '🏀',
        '[乒乓]': '🏓',
        '[咖啡]': '☕',
        '[饭]': '🍚',
        '[猪头]': '🐷',
        '[玫瑰]': '🌹',
        '[凋谢]': '🥀',
        '[嘴唇]': '💋',
        '[示爱]': '💋',
        '[爱心]': '❤️',
        '[心碎]': '💔',
        '[蛋糕]': '🎂',
        '[闪电]': '⚡',
        '[炸弹]': '💣',
        '[刀]': '🔪',
        '[足球]': '⚽',
        '[瓢虫]': '🐞',
        '[便便]': '💩',
        '[月亮]': '🌙',
        '[太阳]': '☀️',
        '[礼物]': '🎁',
        '[拥抱]': '🤗',
        '[强]': '👍',
        '[弱]': '👎',
        '[握手]': '🤝',
        '[胜利]': '✌️',
        '[抱拳]': '🙏',
        '[勾引]': '☝️',
        '[拳头]': '✊',
        '[差劲]': '👎',
        '[爱你]': '🤟',
        '[NO]': '🙅',
        '[OK]': '👌',
        '[爱情]': '💞',
        '[飞吻]': '😘',
        '[跳跳]': '💃',
        '[发抖]': '🥶',
        '[怄火]': '😡',
        '[转圈]': '💫',
        '[磕头]': '🙇',
        '[回头]': '🔙',
        '[跳绳]': '🏃',
        '[投降]': '🏳️',
        '[挥手]': '🙋',
        '[激动]': '🤩',
        '[乱舞]': '🕺',
        '[街舞]': '🕺',
        '[献吻]': '😽',
        '[左太极]': '☯️',
        '[右太极]': '☯️',
        '[生病]': '😷',
        '[大笑]': '😆'
    });

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[character]));
    }

    function escapeJsString(value) {
        return String(value == null ? '' : value)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\r?\n/g, ' ');
    }

    function replaceTencentEmoji(value) {
        const text = String(value == null ? '' : value);
        if (!text) return text;
        return text.replace(/\[[^\]]+\]/g, match => QQ_EMOJI_MAP[match] || match);
    }

    function normalizeUrl(value, options = {}) {
        const raw = String(value || '').trim();
        if (!raw) return options.fallback || '';

        try {
            const url = new URL(raw, options.baseUrl || window.location.href);
            const allowedProtocols = options.allowedProtocols || ['https:', 'http:'];
            return allowedProtocols.includes(url.protocol) ? url.toString() : (options.fallback || '');
        } catch (error) {
            reportIgnoredError(error, 'normalizeUrl');
            return options.fallback || '';
        }
    }

    function normalize48Url(value, sourceOrigin = 'https://source3.48.cn') {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return normalizeUrl(raw);
        if (raw.includes('48.cn')) return normalizeUrl(`https://${raw.replace(/^\/+/, '')}`);
        return normalizeUrl(raw.startsWith('/') ? `${sourceOrigin}${raw}` : `${sourceOrigin}/${raw}`);
    }

    const pocketImageHosts = ['source.48.cn', 'source1.48.cn', 'source2.48.cn'];

    function parsePocketImageUrl(value) {
        const raw = String(value || '').trim();
        try {
            const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
            return ['http:', 'https:'].includes(url.protocol) && (pocketImageHosts.includes(url.hostname) || url.hostname === 'source3.48.cn') ? url : null;
        } catch (_) { return null; }
    }

    function resolvePocketImageUrl(value) {
        const raw = String(value || '').trim();
        if (!raw || window.desktop?.platform === 'web') return raw;
        const url = parsePocketImageUrl(raw);
        if (!url) return raw;
        url.protocol = 'https:';
        url.hostname = pocketImageHosts[0];
        url.pathname = url.pathname.replace(/^\/mediasource\/backstage\//, '/backstage/');
        return url.href;
    }

    if (window.desktop && window.desktop.platform !== 'web' && typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('error', event => {
            const image = event.target;
            if (image?.tagName !== 'IMG') return;
            const original = image.currentSrc || image.src;
            const current = parsePocketImageUrl(original);
            let next = null;
            if (current) {
                const resolved = new URL(resolvePocketImageUrl(original));
                const index = pocketImageHosts.indexOf(current.hostname);
                if (index < 0 || current.pathname !== resolved.pathname || current.protocol !== resolved.protocol) {
                    next = resolved.href;
                } else if (index < pocketImageHosts.length - 1) {
                    resolved.hostname = pocketImageHosts[index + 1];
                    next = resolved.href;
                }
            }
            if (next) {
                event.stopImmediatePropagation();
                image.removeAttribute('srcset');
                image.src = next;
            } else if (image.classList.contains('pocket-gift-image')) {
                const fallback = document.createElement('span');
                fallback.textContent = '🎁';
                fallback.setAttribute('role', 'img');
                fallback.setAttribute('aria-label', '礼物图片暂不可用');
                fallback.style.cssText = 'font-size:24px;margin-right:8px;';
                image.replaceWith(fallback);
            } else if ((current && (image.classList.contains('avatar') || image.classList.contains('message-profile-avatar')))
                || (image.dataset?.avatarFallback !== undefined && image.getAttribute('src') !== './icon.png')) {
                event.stopImmediatePropagation();
                image.removeAttribute('srcset');
                image.src = './icon.png';
            }
        }, true);
    }

    function getErrorMessage(error, fallback = '未知错误') {
        if (error instanceof Error && error.message) return error.message;
        const message = String(error == null ? '' : error).trim();
        return message || fallback;
    }

    function reportError(context, error, level = 'error') {
        const entry = {
            event: 'renderer_error',
            context: String(context || 'unknown'),
            error: getErrorMessage(error)
        };
        const logger = level === 'debug' ? console.debug : level === 'warn' ? console.warn : console.error;
        logger(entry);
        return entry.error;
    }

    function reportIgnoredError(error, context = 'ignored_operation') {
        return reportError(context, error, 'debug');
    }

    function parseJson(value, fallbackValue = null, context = 'parse_json') {
        try {
            return JSON.parse(String(value || ''));
        } catch (error) {
            reportIgnoredError(error, context);
            return fallbackValue;
        }
    }

    function rawHtml(value) {
        return { [SAFE_HTML]: true, value: String(value == null ? '' : value) };
    }

    function html(strings, ...values) {
        const value = strings.reduce((result, part, index) => {
            if (index >= values.length) return result + part;
            const interpolation = values[index];
            const rendered = interpolation && interpolation[SAFE_HTML]
                ? interpolation.value
                : escapeHtml(interpolation);
            return result + part + rendered;
        }, '');
        return rawHtml(value);
    }

    function setSafeHtml(element, safeValue) {
        if (!element) return null;
        if (!safeValue || safeValue[SAFE_HTML] !== true) {
            throw new TypeError('setSafeHtml requires a value created by html() or rawHtml()');
        }
        element.innerHTML = safeValue.value;
        return element;
    }

    function setText(element, value) {
        if (element) element.textContent = String(value == null ? '' : value);
        return element;
    }

    function t(key, variables = {}) {
        const source = String(key == null ? '' : key);
        if (window.YayaI18n?.t) {
            const translated = window.YayaI18n.t(source, variables);
            if (translated !== source) return translated;
            return window.YayaI18n.translateDynamic?.(translated) || translated;
        }
        return Object.entries(variables).reduce(
            (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
            source
        );
    }

    function isLyricCreditLine(value) {
        const text = String(value == null ? '' : value).normalize('NFKC').trim();
        if (!text) return false;
        const noticeText = text.replace(/^[\s【\[(（]+/, '');
        if (/^(?:未经(?:著作权人)?许可|未经授权|版权所有|本歌曲声明|本作品声明)/i.test(noticeText)) return true;

        const separatorIndex = text.search(/[:：]/);
        if (separatorIndex < 1 || separatorIndex > 80) return false;

        const label = text.slice(0, separatorIndex).replace(/[\s/\\&+·•・()（）【】\[\]]+/g, '').toLowerCase();
        return /^(?:作词|填词|歌词|中文词|中文译词|原作词|原词|改编词|rap词|词|作曲|谱曲|原曲|改编曲|曲|原编曲|编曲|制作人?|总制作人|联合制作|改编制作|demo制作|监制|出品人?|出品|项目(?:统筹|策划)|策划|统筹|艺人统筹|ar企划|中文版|录音|人声录音|配唱|监棚配唱|音频编辑|人声编辑|声乐指导|声乐老师|声音设计|和声|合声|和音|混音|母带|吉他|贝斯|鼓手?|弦乐|钢琴|键盘|笛子|中阮|乐器|音乐(?:工程|制作|总监|版权|企划|统筹|监制|营销|发行|策划)|版权|发行|宣发|出处|来源|管理(?:方|单位)?|akb48.*制作人|tsh48管理制作人|admin(?:by|istrator)?|op|sp|isrc|lyricist|lyrics?|composer|composedby|arranger|arrangedby|producer|producedby|vocal|backingvocal|harmony|recording|mixing|mastering|guitar|bass|drums?|piano|keyboard|strings?|musicdirector)/i.test(label);
    }

    window.YayaRendererUtils = Object.freeze({
        escapeHtml,
        escapeJsString,
        getErrorMessage,
        html,
        isLyricCreditLine,
        normalize48Url,
        normalizeUrl,
        parseJson,
        QQ_EMOJI_MAP,
        rawHtml,
        replaceTencentEmoji,
        reportError,
        reportIgnoredError,
        resolvePocketImageUrl,
        setSafeHtml,
        setText,
        t
    });
})();
