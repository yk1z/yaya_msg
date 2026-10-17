(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createNimChatroomFeature = function createNimChatroomFeature(deps) {
        const {
            getNimAuth,
            getNimInstance,
            setNimInstance,
            showToast,
            ipcRenderer
        } = deps;

        const NIM_CHATROOM_SDK_URL = './src/renderer/vendor/NIM_Web_Chatroom.js';
        const CHATROOM_ADDRESSES = ['chatweblink01.netease.im:443'];
        const CHATROOM_APP_KEY = '632feff1f4c838541ab75195d1ceb3fa';
        const LIVE_DANMU_ENABLED = true;
        const BARRAGE_TYPES = new Set([
            'BARRAGE_NORMAL',
            'BARRAGE_MEMBER',
            'BARRAGE_PAY',
            'BARRAGE_SUPERMAN'
        ]);
        const GIFT_TYPES = new Set([
            'PRESENT_NORMAL',
            'PRESENT_FULLSCREEN',
            'PRESENT_FULLSCREEN_TWO'
        ]);
        const DANMU_COLORS = {
            BARRAGE_MEMBER: '#ff9ac5',
            BARRAGE_PAY: '#ffd166',
            BARRAGE_SUPERMAN: '#6ee7ff',
            gift: '#ffb86c',
            system: '#c4b5fd',
            normal: '#ffffff'
        };

        let nimSdkLoadPromise = null;
        let sessionSequence = 0;
        let chatDiagnosticSaveTimer = null;
        let pendingChatDiagnostics = [];
        let liveDanmuList = null;
        const giftEffectTimers = new Set();
        const giftAnimationPlayer = window.desktop?.platform && window.desktop.platform !== 'web'
            ? window.YayaRendererFeatures.createDesktopLiveGiftAnimation?.({ ipcRenderer, reportError: reportIgnoredError })
            : null;

        function reportIgnoredError(error) {
            if (window.YayaRendererUtils?.reportIgnoredError) {
                window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/nim-chatroom-feature.js');
            }
        }

        function normalizeNimChatroomGlobal() {
            if (window.NIM && window.NIM.Chatroom) return window.NIM;
            if (window.SDK && window.SDK.Chatroom) {
                window.NIM = window.SDK;
                return window.NIM;
            }
            if (window.Chatroom) {
                window.NIM = window.NIM || {};
                window.NIM.Chatroom = window.Chatroom;
                return window.NIM;
            }
            return null;
        }

        function loadNimChatroomScript(src) {
            return new Promise((resolve, reject) => {
                const existing = document.querySelector(`script[data-nim-chatroom-sdk="${src}"]`);
                if (existing) {
                    existing.addEventListener('load', () => resolve(), { once: true });
                    existing.addEventListener('error', () => reject(new Error(`加载云信聊天室 SDK 失败: ${src}`)), { once: true });
                    if (normalizeNimChatroomGlobal()) resolve();
                    return;
                }

                const script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.dataset.nimChatroomSdk = src;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error(`加载云信聊天室 SDK 失败: ${src}`));
                document.head.appendChild(script);
            });
        }

        async function ensureNimChatroomSdkLoaded() {
            const existing = normalizeNimChatroomGlobal();
            if (existing) return existing;

            if (!nimSdkLoadPromise) {
                nimSdkLoadPromise = (async () => {
                    await loadNimChatroomScript(NIM_CHATROOM_SDK_URL);
                    const sdk = normalizeNimChatroomGlobal();
                    if (sdk && sdk.Chatroom) return sdk;
                    throw new Error('本地云信聊天室 SDK 无效');
                })().catch(error => {
                    nimSdkLoadPromise = null;
                    throw error;
                });
            }

            return nimSdkLoadPromise;
        }

        function parseJsonObject(value) {
            if (!value) return null;
            if (typeof value === 'object' && !Array.isArray(value)) return value;
            if (typeof value !== 'string') return null;
            try {
                const parsed = JSON.parse(value);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
            } catch (error) {
                return null;
            }
        }

        function readRawJsonId(value, key) {
            if (typeof value !== 'string') return '';
            const pattern = new RegExp(`"${key}"\\s*:\\s*(?:"([^"]+)"|(-?\\d+))`, 'i');
            const match = value.match(pattern);
            return String(match?.[1] || match?.[2] || '').trim();
        }

        function parseMessageExtension(msg) {
            const candidates = [
                msg?.msg_attach_,
                msg?.msgAttach,
                msg?.attachment,
                typeof msg?.attach === 'string' ? msg.attach : null,
                msg?.custom,
                msg?.remoteExtension,
                msg?.ext,
                msg?.attach?.custom
            ];
            let extension = {};
            for (const candidate of candidates) {
                const parsed = parseJsonObject(candidate);
                if (parsed) extension = { ...extension, ...parsed };
            }

            const nested = parseJsonObject(extension.data)
                || parseJsonObject(extension.ext)
                || parseJsonObject(extension.custom);
            if (nested) extension = { ...extension, ...nested };

            const rawSourceId = candidates
                .filter(value => typeof value === 'string')
                .map(value => readRawJsonId(value, 'sourceId'))
                .find(Boolean) || '';
            if (rawSourceId) extension.__rawSourceId = rawSourceId;
            const rawUserId = candidates
                .filter(value => typeof value === 'string')
                .map(value => readRawJsonId(value, 'userId'))
                .find(Boolean) || '';
            if (rawUserId) extension.__rawUserId = rawUserId;
            return extension;
        }

        function queueChatMessageDiagnostic(msg, normalized, liveId) {
            if (!msg || msg.type !== 'custom') return;
            const extension = parseMessageExtension(msg);
            const messageType = String(extension.messageType || extension.msgType || extension.type || '').trim();
            const rawAttachment = [msg.msg_attach_, msg.msgAttach, msg.attachment, msg.custom]
                .find(value => typeof value === 'string' && value.trim()) || '';
            pendingChatDiagnostics.push({
                time: new Date().toISOString(),
                liveId: String(liveId || ''),
                transportType: String(msg.type || ''),
                transportMessageType: Number(msg.msg_type_ ?? -1),
                messageType,
                messageKeys: Object.keys(msg).sort(),
                extensionKeys: Object.keys(extension).filter(key => key !== '__rawSourceId').sort(),
                normalizedKind: String(normalized?.kind || ''),
                normalizedMessageType: String(normalized?.messageType || ''),
                rawAttachment: String(rawAttachment).replace(/https?:\/\/[^"\s]+/gi, '[url]').slice(0, 1600)
            });
            if (pendingChatDiagnostics.length > 50) pendingChatDiagnostics = pendingChatDiagnostics.slice(-50);
            if (chatDiagnosticSaveTimer) return;
            chatDiagnosticSaveTimer = setTimeout(() => {
                chatDiagnosticSaveTimer = null;
                const cacheApi = window.desktop?.appCache;
                if (!cacheApi || typeof cacheApi.setCacheValueSync !== 'function') return;
                const previous = typeof cacheApi.getCacheValueSync === 'function'
                    ? cacheApi.getCacheValueSync('LIVE_CHAT_EVENT_DIAGNOSTIC_V1', [])
                    : [];
                const merged = (Array.isArray(previous) ? previous : []).concat(pendingChatDiagnostics).slice(-50);
                pendingChatDiagnostics = [];
                cacheApi.setCacheValueSync('LIVE_CHAT_EVENT_DIAGNOSTIC_V1', merged);
            }, 250);
        }

        function getMessageUser(msg, extension) {
            const user = parseJsonObject(extension.user) || extension.user || {};
            return {
                nick: String(
                    user.nickName
                    || user.nickname
                    || user.nick
                    || user.name
                    || extension.nickName
                    || extension.nickname
                    || msg?.fromNick
                    || msg?.nick
                    || ''
                ).trim(),
                userId: String(extension.__rawUserId || user.userId || user.id || extension.userId || msg?.from || '').trim(),
                avatar: String(user.avatar || user.avatarUrl || msg?.fromAvatar || '').trim()
            };
        }

        function normalizeComparableId(value) {
            const text = String(value == null ? '' : value).trim();
            if (!text) return '';
            return /^\d+$/.test(text) ? text.replace(/^0+(?=\d)/, '') : text;
        }

        function belongsToLive(extension, liveId) {
            const expected = normalizeComparableId(liveId);
            const sourceId = normalizeComparableId(
                extension.__rawSourceId || extension.sourceId || extension.liveId || ''
            );
            return !expected || !sourceId || expected === sourceId;
        }

        function parseGiftText(extension, user) {
            const giftInfo = parseJsonObject(extension.giftInfo)
                || parseJsonObject(extension.presentInfo)
                || parseJsonObject(extension.present)
                || parseJsonObject(extension.gift)
                || extension.giftInfo
                || extension.presentInfo
                || extension.present
                || extension.gift
                || {};
            const gift = parseJsonObject(giftInfo.gift) || giftInfo.gift || {};
            const giftName = String(
                giftInfo.giftName
                || giftInfo.presentName
                || giftInfo.name
                || gift.name
                || extension.giftName
                || extension.presentName
                || '礼物'
            ).trim();
            const giftNum = Number(
                giftInfo.giftNum
                || giftInfo.presentNum
                || giftInfo.num
                || giftInfo.count
                || giftInfo.quantity
                || extension.giftNum
                || extension.presentNum
                || extension.num
                || extension.count
                || extension.quantity
                || 1
            ) || 1;
            const sender = user.nick || '用户';
            return `${sender} 赠送 ${giftNum} × ${giftName}`;
        }

        function getGiftDetails(extension) {
            const giftInfo = parseJsonObject(extension.giftInfo)
                || parseJsonObject(extension.presentInfo)
                || parseJsonObject(extension.present)
                || parseJsonObject(extension.gift)
                || extension.giftInfo
                || extension.presentInfo
                || extension.present
                || extension.gift
                || {};
            const gift = parseJsonObject(giftInfo.gift) || giftInfo.gift || {};
            return {
                giftName: String(
                    giftInfo.giftName
                    || giftInfo.presentName
                    || giftInfo.name
                    || gift.name
                    || extension.giftName
                    || extension.presentName
                    || ''
                ).trim(),
                giftNum: Number(
                    giftInfo.giftNum
                    || giftInfo.presentNum
                    || giftInfo.num
                    || giftInfo.count
                    || giftInfo.quantity
                    || extension.giftNum
                    || extension.presentNum
                    || extension.num
                    || extension.count
                    || extension.quantity
                    || 1
                ) || 1,
                animation: {
                    url: String(giftInfo.animationpath || giftInfo.animationPath || giftInfo.zipPath || gift.animationpath || gift.zipPath || ''),
                    md5: String(giftInfo.zipMd5 || giftInfo.animationMd5 || ''),
                    resourceType: Number(giftInfo.resourceType || 0),
                    switchTime: Number(giftInfo.switchTime || 0)
                },
                picPath: String(giftInfo.picPath || gift.picPath || '')
            };
        }

        function getBarrageText(extension, msg) {
            const giftInfo = parseJsonObject(extension.giftInfo) || extension.giftInfo || {};
            const giftAttachData = parseJsonObject(giftInfo.attachData) || giftInfo.attachData || {};
            const attachData = parseJsonObject(extension.attachData) || extension.attachData || {};
            return String(
                extension.text
                || giftAttachData.text
                || attachData.text
                || msg.text
                || ''
            ).trim();
        }

        function parseWelcomeRichText(value, extension) {
            const template = document.createElement('template');
            template.innerHTML = String(value || '').slice(0, 12000);
            const parts = [];
            const badgeLabel = extension.seineZxNotify?.seineZxContentList?.[1]?.liveIntoText || '';
            function visit(node, inheritedColor = '', depth = 0) {
                if (depth > 16 || parts.length >= 200) return;
                if (node.nodeType === 3) {
                    if (node.textContent.trim()) parts.push({ text: node.textContent, color: inheritedColor });
                    return;
                }
                if (node.nodeType !== 1 || /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|LINK|META)$/.test(String(node.tagName).toUpperCase())) return;
                const colorMatch = String(node.getAttribute('style') || '').match(/(?:^|;)\s*color\s*:\s*#?([a-f0-9]{6}|[a-f0-9]{3})\s*(?:;|$)/i);
                const color = colorMatch ? `#${colorMatch[1]}` : inheritedColor;
                if (node.tagName === 'IMG') {
                    try {
                        const url = new URL(node.getAttribute('src') || '', 'https://source.48.cn/');
                        if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.port
                            && (url.hostname === '48.cn' || url.hostname.endsWith('.48.cn'))
                            && /\.(png|jpe?g|webp|gif)$/i.test(url.pathname)) {
                            url.protocol = 'https:';
                            parts.push({ image: url.href, alt: String(node.getAttribute('alt') || badgeLabel).slice(0, 60) });
                        }
                    } catch (_error) {}
                    return;
                }
                for (const child of node.childNodes) visit(child, color, depth + 1);
            }
            for (const node of template.content.childNodes) visit(node);
            return {
                parts,
                text: parts.map(part => part.text?.trim() || (part.alt ? `[${part.alt}]` : '')).filter(Boolean).join(' ')
                    .replace(/\s+/g, ' ').trim()
            };
        }

        function normalizeChatroomMessage(msg, liveId) {
            if (!msg || typeof msg !== 'object') return null;
            const extension = parseMessageExtension(msg);
            if (!belongsToLive(extension, liveId)) return null;

            const messageType = String(
                extension.messageType
                || extension.msgType
                || extension.type
                || ''
            ).trim().toUpperCase();
            const user = getMessageUser(msg, extension);
            if (window.desktop?.platform && window.desktop.platform !== 'web' && messageType.startsWith('BARRAGE_NOTIFY')) {
                const welcome = parseWelcomeRichText(getBarrageText(extension, msg), extension);
                if (!welcome.text) return null;
                return {
                    kind: 'welcome', messageType, text: welcome.text, richText: welcome.parts,
                    nick: user.nick, userId: user.userId, avatar: user.avatar,
                    color: DANMU_COLORS.system, time: Number(msg.time || Date.now())
                };
            }
            const giftDetails = getGiftDetails(extension);
            const hasGiftPayload = Boolean(
                extension.giftInfo
                || extension.presentInfo
                || extension.present
                || extension.gift
                || giftDetails.giftName
            );
            const isBarrage = BARRAGE_TYPES.has(messageType)
                || messageType.startsWith('BARRAGE_')
                || msg.type === 'text';
            const isGift = !isBarrage && (GIFT_TYPES.has(messageType)
                || messageType.startsWith('PRESENT_')
                || messageType.startsWith('GIFT_')
                || hasGiftPayload);

            if (isGift) {
                return {
                    kind: 'gift',
                    messageType,
                    text: parseGiftText(extension, user),
                    nick: user.nick,
                    userId: user.userId,
                    avatar: user.avatar,
                    giftName: giftDetails.giftName,
                    giftNum: giftDetails.giftNum,
                    ...(window.desktop?.platform && window.desktop.platform !== 'web' ? {
                        giftPicPath: giftDetails.picPath,
                        giftAnimation: giftDetails.animation
                    } : {}),
                    color: DANMU_COLORS.gift,
                    time: Number(msg.time || extension.time || Date.now())
                };
            }

            if (messageType === 'CLOSELIVE') {
                return {
                    kind: 'system',
                    messageType,
                    text: '直播已结束',
                    nick: '',
                    userId: '',
                    color: DANMU_COLORS.system,
                    time: Date.now()
                };
            }

            if (messageType === 'LIVEUPDATE' || messageType === 'DISABLE_SPEAK') {
                return null;
            }

            const text = getBarrageText(extension, msg);
            if (!isBarrage || !text) return null;
            return {
                kind: 'barrage',
                messageType,
                text,
                nick: user.nick,
                userId: user.userId,
                avatar: user.avatar,
                color: DANMU_COLORS[messageType] || DANMU_COLORS.normal,
                time: Number(msg.time || extension.time || Date.now())
            };
        }

        function ensureDanmuStyle() {
            if (document.getElementById('yaya-live-danmu-style')) return;
            const style = document.createElement('style');
            style.id = 'yaya-live-danmu-style';
            style.textContent = `
                #live-danmu-composer {
                    display: grid;
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 8px 10px;
                    padding: 10px 15px;
                    border-top: 1px solid rgba(128, 128, 128, 0.2);
                    background: var(--input-bg);
                    color: var(--text);
                }
                .live-danmu-composer-label {
                    font-size: 13px;
                    font-weight: 700;
                    white-space: nowrap;
                }
                .live-danmu-composer-field {
                    display: flex;
                    align-items: center;
                    min-width: 0;
                    height: 34px;
                    border: 1px solid var(--border);
                    border-radius: 7px;
                    background: var(--bg);
                    transition: border-color 0.2s ease, box-shadow 0.2s ease;
                }
                .live-danmu-composer-field:focus-within {
                    border-color: var(--primary);
                    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
                }
                .live-danmu-composer-input {
                    box-sizing: border-box;
                    flex: 1;
                    min-width: 0;
                    height: 100%;
                    padding: 0 8px 0 10px;
                    border: 0;
                    outline: none;
                    background: transparent;
                    color: var(--text);
                    font-size: 13px;
                }
                .live-danmu-composer-input::placeholder {
                    color: var(--text-sub);
                }
                .live-danmu-composer-count {
                    padding-right: 9px;
                    color: var(--text-sub);
                    font-size: 11px;
                    white-space: nowrap;
                }
                .live-danmu-composer-error {
                    display: none;
                    grid-column: 2 / 4;
                    color: #cf1322;
                    font-size: 12px;
                }
                #live-danmu-composer-submit {
                    height: 34px;
                    min-width: 68px;
                    padding: 0 14px;
                    font-size: 13px;
                }
                @media (max-width: 560px) {
                    #live-danmu-composer {
                        grid-template-columns: minmax(0, 1fr) auto;
                        padding: 9px 10px;
                    }
                    .live-danmu-composer-label { display: none; }
                    .live-danmu-composer-error { grid-column: 1 / 3; }
                }
            `;
            document.head.appendChild(style);
        }

        function formatLiveDanmuDisplayText(item) {
            if (item?.kind !== 'gift') return String(item?.text || '');
            return `${item.giftName || '礼物'} × ${Number(item.giftNum) || 1}`;
        }

        function appendLiveDanmuListItem(item) {
            if (!item?.text) return;
            const list = document.getElementById('live-danmu-list-body');
            if (!list) return;
            if (liveDanmuList?.root !== list) {
                liveDanmuList?.destroy();
                liveDanmuList = window.YayaRendererFeatures.createLiveDanmuVirtualList(list, createLiveDanmuListRow);
            }
            liveDanmuList.append(item);
        }

        function createLiveDanmuListRow(item) {
            const row = document.createElement('div');
            row.className = 'live-danmu-list-row';
            row.dataset.kind = item.kind || 'barrage';
            const userId = String(item.userId || '').trim();
            const canOpenProfile = Boolean(userId) && item.kind !== 'system';
            const nick = document.createElement(canOpenProfile ? 'button' : 'span');
            nick.className = 'live-danmu-list-nick';
            nick.textContent = item.nick || (item.kind === 'system' ? '系统' : '礼物');
            if (canOpenProfile) {
                nick.type = 'button';
                nick.title = window.YayaRendererUtils?.t('查看用户主页') || '查看用户主页';
                nick.addEventListener('click', event => {
                    event.stopPropagation();
                    if (typeof window.openFollowedUserProfile !== 'function') {
                        showToast?.('用户主页模块还没有准备好');
                        return;
                    }
                    window.openFollowedUserProfile(userId, item.nick || '口袋用户', item.avatar || '', false);
                });
            }
            row.appendChild(nick);
            const text = document.createElement('span');
            text.className = 'live-danmu-list-text';
            if (item.kind === 'welcome' && Array.isArray(item.richText)) {
                item.richText.forEach((part, index) => {
                    if (index) text.appendChild(document.createTextNode(' '));
                    if (part.image) {
                        const image = document.createElement('img');
                        image.src = part.image;
                        image.alt = part.alt || '';
                        Object.assign(image.style, { height: '18px', width: 'auto', maxWidth: '64px', verticalAlign: 'middle', objectFit: 'contain' });
                        image.addEventListener('error', () => image.replaceWith(document.createTextNode(part.alt ? `[${part.alt}]` : '')), { once: true });
                        text.appendChild(image);
                    } else {
                        const span = document.createElement('span');
                        span.textContent = part.text;
                        if (part.color) {
                            span.className = 'live-danmu-welcome-token';
                            span.style.setProperty('--live-welcome-color', /^#(?:fff|ffffff)$/i.test(part.color) ? 'var(--text)' : part.color);
                        }
                        text.appendChild(span);
                    }
                });
            } else text.textContent = formatLiveDanmuDisplayText(item);
            row.appendChild(text);
            return row;
        }

        function setLiveDanmuListStatus(status) {
            const panel = document.getElementById('live-danmu-list-wrapper');
            const normalizedStatus = String(status || 'disconnected');
            if (panel) panel.dataset.status = normalizedStatus;
            ensureLiveDanmuColumnResize();
        }

        function ensureLiveDanmuColumnResize() {
            const panel = document.getElementById('live-danmu-list-wrapper');
            const resizer = document.getElementById('live-danmu-name-resizer');
            if (!panel || !resizer || resizer.dataset.resizeBound === 'true') return;
            resizer.dataset.resizeBound = 'true';
            resizer.addEventListener('mousedown', event => {
                event.preventDefault();
                const startX = event.pageX;
                const configuredWidth = parseFloat(getComputedStyle(panel).getPropertyValue('--live-danmu-name-width'));
                const startWidth = Number.isFinite(configuredWidth) ? configuredWidth : 130;
                const minWidth = 72;
                const maxWidth = Math.max(minWidth, Math.min(260, panel.clientWidth - 130));
                const previousUserSelect = document.body.style.userSelect;
                resizer.classList.add('is-resizing');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';

                const onMouseMove = moveEvent => {
                    const width = Math.max(minWidth, Math.min(startWidth + moveEvent.pageX - startX, maxWidth));
                    panel.style.setProperty('--live-danmu-name-width', `${Math.round(width)}px`);
                    liveDanmuList?.invalidateMeasurements();
                };
                const onMouseUp = () => {
                    resizer.classList.remove('is-resizing');
                    document.body.style.cursor = '';
                    document.body.style.userSelect = previousUserSelect;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        function resetLiveDanmuList() {
            const list = document.getElementById('live-danmu-list-body');
            if (list) {
                const empty = document.createElement('div');
                empty.className = 'live-danmu-list-empty';
                empty.textContent = '等待实时弹幕';
                if (liveDanmuList?.root === list) liveDanmuList.clear(empty);
                else list.replaceChildren(empty);
                list.scrollTop = 0;
            }
            setLiveDanmuListStatus('connecting');
        }

        function drawLiveDanmu(item, player, { emitToPlayer = true } = {}) {
            if (!item?.text) return;
            appendLiveDanmuListItem(item);
            if (item.kind === 'gift') showDesktopGiftEffect(item, player);
            if (item.kind === 'gift') giftAnimationPlayer?.enqueue(item, player);
            const plugin = player?.plugins?.artplayerPluginDanmuku;
            if (emitToPlayer && typeof plugin?.emit === 'function') {
                void Promise.resolve(plugin.emit({
                    text: formatLiveDanmuDisplayText(item),
                    mode: item.kind === 'system' ? 1 : 0,
                    color: item.color || DANMU_COLORS.normal
                })).catch(reportIgnoredError);
            }

            window.dispatchEvent(new CustomEvent('yaya:live-chat-message', { detail: item }));
        }

        function showDesktopGiftEffect(item, player) {
            if (!window.desktop?.platform || window.desktop.platform === 'web') return;
            const parent = player?.template?.$player || document.getElementById('live-player-container');
            if (!parent) return;
            if (!document.getElementById('yaya-desktop-gift-effect-style')) {
                const style = document.createElement('style');
                style.id = 'yaya-desktop-gift-effect-style';
                style.textContent = `
                    .yaya-desktop-gift-effects { position:absolute; inset:0; z-index:25; pointer-events:none;
                        display:flex; flex-direction:column; justify-content:flex-end; align-items:flex-start;
                        gap:6px; padding:12px 12px 64px; overflow:hidden; box-sizing:border-box; }
                    .yaya-desktop-gift-effect { display:flex; align-items:center; gap:6px; max-width:min(100%,320px);
                        box-sizing:border-box; padding:4px 10px 4px 6px; border-radius:20px;
                        background:linear-gradient(110deg,rgba(103,48,126,.94),rgba(202,74,119,.90));
                        border:1px solid rgba(255,210,230,.55); color:#fff; box-shadow:0 4px 20px #0004;
                        animation:yayaDesktopGiftEnter .35s ease-out; font:12px/1.4 sans-serif; }
                    .yaya-desktop-gift-effect img { width:24px; height:24px; flex-shrink:0; object-fit:contain; }
                    .yaya-desktop-gift-effect span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .yaya-desktop-gift-effect strong { color:#ffe38a; font-size:16px; white-space:nowrap; }
                    @keyframes yayaDesktopGiftEnter { from { opacity:0; transform:translateX(-40px) scale(.9); }
                        to { opacity:1; transform:translateX(0) scale(1); } }
                    @media (prefers-reduced-motion:reduce) { .yaya-desktop-gift-effect { animation:none; } }
                `;
                document.head.appendChild(style);
            }
            let overlay = parent.querySelector('.yaya-desktop-gift-effects');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'yaya-desktop-gift-effects';
                parent.appendChild(overlay);
            }
            while (overlay.children.length >= 3) overlay.firstElementChild.remove();
            const effect = document.createElement('div');
            effect.className = 'yaya-desktop-gift-effect';
            const imagePath = String(item.giftPicPath || '').trim();
            if (imagePath) {
                try {
                    const url = new URL(imagePath, 'https://source.48.cn/');
                    if (url.protocol === 'https:' || url.protocol === 'http:') {
                        const image = document.createElement('img');
                        image.src = url.href;
                        image.alt = '';
                        image.addEventListener('error', () => image.remove(), { once: true });
                        effect.appendChild(image);
                    }
                } catch (_error) {}
            }
            const text = document.createElement('span');
            text.textContent = `${item.nick || '用户'} 送出 ${item.giftName || '礼物'}`;
            const count = document.createElement('strong');
            count.textContent = `× ${Number(item.giftNum) || 1}`;
            effect.append(text, count);
            overlay.appendChild(effect);
            const timer = setTimeout(() => {
                giftEffectTimers.delete(timer);
                effect.remove();
            }, 4500);
            giftEffectTimers.add(timer);
        }

        function clearDanmuOverlay() {
            giftAnimationPlayer?.clear();
            giftEffectTimers.forEach(timer => clearTimeout(timer));
            giftEffectTimers.clear();
            document.querySelectorAll('.yaya-desktop-gift-effects').forEach(node => node.remove());
            resetLiveDanmuList();
        }

        function closeDanmakuComposer() {
            document.getElementById('live-danmu-composer')?.remove();
        }

        function ensureDanmakuComposer(onSubmit) {
            ensureDanmuStyle();
            let form = document.getElementById('live-danmu-composer');
            if (!form) {
                const giftContainer = document.getElementById('live-gift-container');
                const playerArea = document.getElementById('live-player-area');
                const parent = giftContainer?.parentElement || playerArea?.parentElement;
                if (!parent) return null;
                form = document.createElement('form');
                form.id = 'live-danmu-composer';
                form.setAttribute('aria-label', '发送直播弹幕');
                form.innerHTML = `
                    <label class="live-danmu-composer-label" for="live-danmu-composer-input">发送弹幕</label>
                    <div class="live-danmu-composer-field">
                        <input id="live-danmu-composer-input" class="live-danmu-composer-input" type="text"
                            maxlength="100" autocomplete="off" placeholder="说点什么吧" aria-label="弹幕内容">
                        <span class="live-danmu-composer-count">0 / 100</span>
                    </div>
                    <button id="live-danmu-composer-submit" type="submit" class="btn btn-primary">发送</button>
                    <span class="live-danmu-composer-error" role="alert"></span>`;
                if (giftContainer) parent.insertBefore(form, giftContainer);
                else playerArea.insertAdjacentElement('afterend', form);
            }

            const input = form.querySelector('input');
            const count = form.querySelector('.live-danmu-composer-count');
            const errorText = form.querySelector('.live-danmu-composer-error');
            const sendButton = form.querySelector('#live-danmu-composer-submit');
            form.__yayaSubmitDanmaku = onSubmit;
            form.dataset.connectionEnabled = 'true';
            if (form.dataset.ready !== 'true') {
                form.dataset.ready = 'true';
                input.addEventListener('input', () => {
                    count.textContent = `${Array.from(input.value).length} / 100`;
                    errorText.textContent = '';
                    errorText.style.display = 'none';
                });
                form.addEventListener('submit', async event => {
                    event.preventDefault();
                    if (form.dataset.submitting === 'true' || input.disabled) return;
                    const text = input.value.trim();
                    if (!text) {
                        errorText.textContent = '请输入弹幕内容';
                        errorText.style.display = 'block';
                        input.focus();
                        return;
                    }
                    form.dataset.submitting = 'true';
                    input.disabled = true;
                    sendButton.disabled = true;
                    sendButton.textContent = '发送中';
                    errorText.textContent = '';
                    errorText.style.display = 'none';
                    try {
                        await form.__yayaSubmitDanmaku(text);
                        input.value = '';
                        count.textContent = '0 / 100';
                    } catch (error) {
                        errorText.textContent = error?.message || '发送弹幕失败';
                        errorText.style.display = 'block';
                    } finally {
                        form.dataset.submitting = 'false';
                        const enabled = form.dataset.connectionEnabled === 'true';
                        input.disabled = !enabled;
                        sendButton.disabled = !enabled;
                        sendButton.textContent = '发送';
                        if (enabled) input.focus();
                    }
                });
            }
            input.disabled = false;
            sendButton.disabled = false;
            return { form, input, sendButton };
        }

        function setDanmakuComposerEnabled(enabled, message = '') {
            const form = document.getElementById('live-danmu-composer');
            if (!form) return;
            const input = form.querySelector('input');
            const sendButton = form.querySelector('#live-danmu-composer-submit');
            const errorText = form.querySelector('.live-danmu-composer-error');
            form.dataset.connectionEnabled = enabled ? 'true' : 'false';
            if (input) input.disabled = !enabled;
            if (sendButton) sendButton.disabled = !enabled;
            if (message && errorText) {
                errorText.textContent = message;
                errorText.style.display = 'block';
            } else if (errorText) {
                errorText.textContent = '';
                errorText.style.display = 'none';
            }
        }

        function setConnectionStatus(status) {
            document.getElementById('live-danmu-status')?.remove();
            setLiveDanmuListStatus(status);
        }

        function setLiveOnlineCount(value) {
            const countNode = document.getElementById('current-live-online');
            if (!countNode) return;
            const count = Number(value);
            countNode.textContent = Number.isFinite(count) && count >= 0
                ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(Math.round(count))
                : '--';
        }

        function clearConnectionStatus() {
            document.getElementById('live-danmu-status')?.remove();
            closeDanmakuComposer();
        }

        function notifyPlayer(player, text) {
            try {
                if (player?.notice && 'show' in player.notice) {
                    player.notice.show = text;
                    return;
                }
                if (typeof player?.notice === 'function') player.notice(text);
            } catch (error) {
                reportIgnoredError(error);
            }
        }

        function teardownCurrentInstance() {
            const currentInstance = getNimInstance ? getNimInstance() : null;
            if (!currentInstance) return;
            try {
                if (typeof currentInstance.destroy === 'function') currentInstance.destroy();
                else if (typeof currentInstance.disconnect === 'function') currentInstance.disconnect();
            } catch (error) {
                reportIgnoredError(error);
            }
            setNimInstance(null);
        }

        function disconnectLiveDanmu({ clearUi = true } = {}) {
            sessionSequence += 1;
            teardownCurrentInstance();
            if (clearUi) {
                closeDanmakuComposer();
                clearDanmuOverlay();
                clearConnectionStatus();
            }
        }

        async function resolveLoginOptions() {
            if (typeof getNimAuth === 'function') {
                try {
                    const auth = await getNimAuth();
                    const account = String(auth?.account || auth?.accid || '').trim();
                    const token = String(auth?.token || '').trim();
                    if (auth?.success !== false && account && token) {
                        return { account, token, isAnonymous: false };
                    }
                    if (auth?.msg) console.warn('[直播弹幕] 云信账号不可用:', auth.msg);
                } catch (error) {
                    console.warn('[直播弹幕] 读取云信账号失败:', error?.message || error);
                }
            }
            return {
                isAnonymous: true,
                chatroomNick: `guest_${Math.floor(Math.random() * 100000)}`
            };
        }

        async function connectLiveDanmu(chatroomId, player, options = {}) {
            if (!LIVE_DANMU_ENABLED) return null;

            const normalizedRoomId = String(chatroomId || '').trim();
            const liveId = String(options.liveId || '').trim();
            if (!/^\d{1,32}$/.test(normalizedRoomId) || !/^\d{1,32}$/.test(liveId)) return null;
            if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function' || typeof ipcRenderer.on !== 'function') {
                setConnectionStatus('disconnected', '桌面弹幕服务不可用');
                return null;
            }

            const sessionId = ++sessionSequence;
            const connectionId = `desktop-${Date.now()}-${sessionId}`;
            teardownCurrentInstance();
            clearDanmuOverlay();
            setConnectionStatus('connecting', '实时弹幕连接中');

            let destroyed = false;
            let chatConnected = false;
            const locallyRenderedMessageIds = new Set();
            const remotelyRenderedMessageIds = new Set();
            const getMessageId = message => String(message?.uuid || message?.idClient || '').trim();
            const rememberMessageId = (collection, messageId) => {
                if (!messageId) return;
                collection.add(messageId);
                while (collection.size > 128) {
                    collection.delete(collection.values().next().value);
                }
            };
            const sendDanmaku = async normalizedText => {
                if (destroyed || sessionId !== sessionSequence) throw new Error('聊天室连接已失效');
                if (!chatConnected) throw new Error('聊天室连接中，请稍候');
                const result = await ipcRenderer.invoke('send-live-danmaku', {
                    connectionId,
                    text: normalizedText
                });
                if (!result?.success) throw new Error(result?.msg || '发送弹幕失败');
                const localMessage = result.localMessage;
                const localMessageId = getMessageId(localMessage) || String(result.idClient || '').trim();
                if (!localMessageId || !remotelyRenderedMessageIds.has(localMessageId)) {
                    rememberMessageId(locallyRenderedMessageIds, localMessageId);
                    const localItem = normalizeChatroomMessage(localMessage, liveId);
                    if (localItem) {
                        drawLiveDanmu(localItem, player, { emitToPlayer: !options.usePlayerEmitter });
                    }
                } else {
                    remotelyRenderedMessageIds.delete(localMessageId);
                }
                showToast?.('弹幕已发送');
            };
            const handleStatus = (_event, payload = {}) => {
                if (destroyed || sessionId !== sessionSequence || payload.connectionId !== connectionId) return;
                if (payload.status === 'connected') {
                    chatConnected = true;
                    setConnectionStatus('connected', '实时弹幕已连接');
                    if (options.usePlayerEmitter) closeDanmakuComposer();
                    else ensureDanmakuComposer(sendDanmaku);
                    notifyPlayer(player, '实时弹幕已连接');
                    return;
                }
                if (payload.status === 'reconnecting') {
                    chatConnected = false;
                    setLiveOnlineCount(null);
                    setConnectionStatus('reconnecting', '实时弹幕重连中');
                    if (!options.usePlayerEmitter) {
                        setDanmakuComposerEnabled(false, '聊天室重连中，请稍候');
                    }
                    return;
                }
                if (payload.status === 'disconnected') {
                    chatConnected = false;
                    setLiveOnlineCount(null);
                    setConnectionStatus('disconnected', '实时弹幕已断开');
                    if (!options.usePlayerEmitter) {
                        setDanmakuComposerEnabled(false, '聊天室连接已断开');
                    }
                    if (payload.message) console.warn('[直播弹幕] 连接断开:', payload.message);
                }
            };
            const handleOnline = (_event, payload = {}) => {
                if (destroyed || sessionId !== sessionSequence || payload.connectionId !== connectionId) return;
                setLiveOnlineCount(payload.onlineMemberNum);
            };
            const handleMessage = (_event, payload = {}) => {
                if (destroyed || sessionId !== sessionSequence || payload.connectionId !== connectionId) return;
                const messages = Array.isArray(payload.messages) ? payload.messages : [];
                messages.forEach(message => {
                    const messageId = getMessageId(message);
                    if (messageId && locallyRenderedMessageIds.has(messageId)) {
                        locallyRenderedMessageIds.delete(messageId);
                        return;
                    }
                    rememberMessageId(remotelyRenderedMessageIds, messageId);
                    const item = normalizeChatroomMessage(message, liveId);
                    queueChatMessageDiagnostic(message, item, liveId);
                    if (item) drawLiveDanmu(item, player);
                });
            };
            const removeStatusListener = ipcRenderer.on('live-danmaku-status', handleStatus);
            const removeMessageListener = ipcRenderer.on('live-danmaku-message', handleMessage);
            const removeOnlineListener = ipcRenderer.on('live-danmaku-online', handleOnline);
            const instance = {
                sendText: sendDanmaku,
                get connected() {
                    return chatConnected;
                },
                destroy() {
                    if (destroyed) return;
                    destroyed = true;
                    chatConnected = false;
                    if (typeof removeStatusListener === 'function') removeStatusListener();
                    if (typeof removeMessageListener === 'function') removeMessageListener();
                    if (typeof removeOnlineListener === 'function') removeOnlineListener();
                    setLiveOnlineCount(null);
                    void ipcRenderer.invoke('disconnect-live-danmaku', { connectionId }).catch(reportIgnoredError);
                },
                disconnect() {
                    this.destroy();
                }
            };
            setNimInstance(instance);

            try {
                const result = await ipcRenderer.invoke('connect-live-danmaku', {
                    connectionId,
                    liveId,
                    roomId: normalizedRoomId
                });
                if (sessionId !== sessionSequence) {
                    instance.destroy();
                    return null;
                }
                if (!result?.success) throw new Error(result?.msg || '实时弹幕连接失败');
                return instance;
            } catch (error) {
                if (sessionId !== sessionSequence) return null;
                console.error('[直播弹幕] 连接失败:', error);
                instance.destroy();
                setNimInstance(null);
                setConnectionStatus('disconnected', '实时弹幕连接失败');
                showToast?.(error?.message || '实时弹幕连接失败');
                return null;
            }
        }

        async function initLiveDanmu(chatroomId, options = {}) {
            return connectLiveDanmu(chatroomId, deps.getDp?.(), options);
        }

        async function initArtLiveDanmu(chatroomId, art, options = {}) {
            if (!art) return null;
            return connectLiveDanmu(chatroomId, art, options);
        }

        async function initDanmuForDPlayer(chatroomId, options = {}) {
            return initLiveDanmu(chatroomId, options);
        }

        return {
            disconnectLiveDanmu,
            ensureNimChatroomSdkLoaded,
            initLiveDanmu,
            initArtLiveDanmu,
            initDanmuForDPlayer,
            parseChatroomMessage: normalizeChatroomMessage,
            renderLiveDanmu: drawLiveDanmu,
            ensureDanmakuComposer,
            setDanmakuComposerEnabled,
            setLiveOnlineCount
        };
    };
})();
