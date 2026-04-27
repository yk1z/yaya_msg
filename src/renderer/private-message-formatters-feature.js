(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createPrivateMessageFormattersFeature = function createPrivateMessageFormattersFeature(deps) {
        const {
            escapePrivateMessageHtml,
            getMemberData,
            privateMessageDetailState,
            privateMessageListState
        } = deps;

        function getPrivateMessageSourceMembers() {
            const memberData = getMemberData();
            return Array.isArray(memberData) ? memberData : (Array.isArray(window.memberData) ? window.memberData : []);
        }

        function getPrivateMessageAvatar(avatar) {
            if (!avatar) return './icon.png';
            if (avatar.startsWith('http')) return avatar;
            return `https://source.48.cn${avatar}`;
        }

        function getPrivateMessageConversationKey(item = {}) {
            const user = item.user || {};
            const candidates = [
                user.userId,
                user.id,
                item.targetUserId,
                item.userId,
                item.conversationId
            ];

            for (const candidate of candidates) {
                const normalized = String(candidate || '').trim();
                if (normalized) return normalized;
            }

            return '';
        }

        function getPrivateMessageItemKey(item = {}, activeTargetUserId = '') {
            const directId = String(
                item.messageId
                || item.msgId
                || item.id
                || item.messageid
                || ''
            ).trim();
            if (directId) return `msg:${directId}`;

            const type = String(item && item.messageType || item?.content?.messageType || '').trim().toUpperCase();
            const timestamp = String(item.timestamp || item.sendTime || item.createTime || '').trim();
            const senderId = String(
                item.user?.userId
                || item.fromUserId
                || item.senderId
                || item.uid
                || activeTargetUserId
                || ''
            ).trim();
            const contentKey = normalizePrivateMessageBodyText(formatPrivateMessageContent(item));

            return `fallback:${senderId}|${timestamp}|${type}|${contentKey}`;
        }

        function clearActivePrivateMessageUnread(targetUserId = privateMessageDetailState.targetUserId) {
            const activeTarget = String(targetUserId || '').trim();
            if (!activeTarget || !Array.isArray(privateMessageListState.items)) return;

            privateMessageListState.items.forEach(item => {
                const conversationKey = getPrivateMessageConversationKey(item);
                if (String(conversationKey) === activeTarget) {
                    item.noreadNum = 0;
                }
            });
        }

        function formatPrivateMessagePreview(text) {
            const cleanedText = normalizePrivateMessageBodyText(text);
            const parsed = parsePrivateFlipcardPayload(cleanedText);
            const audioUrl = String(parsed?.url || parsed?.voiceUrl || '').trim().toLowerCase();
            if (audioUrl && (audioUrl.endsWith('.aac') || audioUrl.endsWith('.mp3') || audioUrl.endsWith('.m4a') || audioUrl.endsWith('.wav'))) {
                return '[语音消息]';
            }
            const videoUrl = String(parsed?.url || parsed?.videoUrl || '').trim().toLowerCase();
            if (videoUrl && (videoUrl.endsWith('.mp4') || videoUrl.endsWith('.mov') || videoUrl.endsWith('.m4v') || videoUrl.endsWith('.webm'))) {
                return '[视频消息]';
            }
            const normalized = String(cleanedText || '').replace(/\s+/g, ' ').trim();
            return normalized || '暂无消息';
        }

        function normalizePrivateMessageBodyText(value) {
            return String(value || '')
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .replace(/^\s+/, '')
                .replace(/\s+$/, '');
        }

        function normalizePrivateMediaUrl(rawUrl = '', preferredHost = 'mp4') {
            const value = String(rawUrl || '').trim();
            if (!value) return '';
            if (value.startsWith('//')) return `https:${value}`;
            if (/^https?:\/\//i.test(value)) return value.replace(/^http:\/\//i, 'https://');
            if (value.startsWith('/mediasource/') || value.startsWith('/imagesource/')) {
                return `https://source.48.cn${value}`;
            }
            const base = preferredHost === 'source' ? 'https://source.48.cn' : 'https://mp4.48.cn';
            return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
        }

        function getPrivateMediaPathname(url = '') {
            try {
                return new URL(url).pathname.toLowerCase();
            } catch (error) {
                return String(url || '').split('?')[0].split('#')[0].toLowerCase();
            }
        }

        function looksLikeAudioUrl(url = '') {
            const pathname = getPrivateMediaPathname(url);
            return pathname.endsWith('.aac')
                || pathname.endsWith('.mp3')
                || pathname.endsWith('.m4a')
                || pathname.endsWith('.wav')
                || pathname.endsWith('.amr')
                || pathname.endsWith('.ogg');
        }

        function looksLikeVideoUrl(url = '') {
            const pathname = getPrivateMediaPathname(url);
            return pathname.endsWith('.mp4')
                || pathname.endsWith('.mov')
                || pathname.endsWith('.m4v')
                || pathname.endsWith('.webm');
        }

        function looksLikeImageUrl(url = '') {
            const pathname = getPrivateMediaPathname(url);
            return pathname.endsWith('.jpg')
                || pathname.endsWith('.jpeg')
                || pathname.endsWith('.png')
                || pathname.endsWith('.webp')
                || pathname.endsWith('.gif')
                || pathname.endsWith('.bmp');
        }

        function getPrivateMessageMediaAnswerType(item = {}, content = {}) {
            const candidates = [
                item.answerType,
                item.mediaAnswerType,
                content.answerType,
                content.mediaAnswerType
            ];

            for (const candidate of candidates) {
                const numeric = Number(candidate);
                if (Number.isFinite(numeric) && numeric > 0) {
                    return numeric;
                }
            }

            return 0;
        }

        function collectPrivateMessageMediaCandidates(message = {}) {
            const content = message.content || {};
            const parsedTextContent = parsePrivateFlipcardPayload(
                content.text || content.messageText || message.text || message.messageText || ''
            );
            const arrayCandidates = [];

            [content.bodys, message.bodys].forEach(entry => {
                if (Array.isArray(entry)) {
                    arrayCandidates.push(...entry);
                }
            });

            return [
                parsedTextContent,
                content.voiceInfo,
                content.audioInfo,
                content.videoInfo,
                content.imageInfo,
                content.imgInfo,
                content.pictureInfo,
                content.replyInfo,
                ...arrayCandidates,
                content,
                message
            ].filter(Boolean);
        }

        function normalizePrivateMessageName(value) {
            const text = String(value || '').trim();
            if (!text) return '';
            return text
                .replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48)\s*-\s*/i, '')
                .replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48)\s+/i, '')
                .trim();
        }

        function isPrivateMessageInvalidName(value) {
            const text = String(value || '').trim();
            if (!text) return true;
            const lower = text.toLowerCase();
            return lower.startsWith('/mediasource/')
                || lower.includes('/teamlogo')
                || /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(text)
                || text.includes('/');
        }

        function getPrivateMessageDisplayName(user = {}) {
            const candidates = [
                user.starName,
                user.realNickName,
                normalizePrivateMessageName(user.nickname),
                normalizePrivateMessageName(user.name),
                user.nickname,
                user.name
            ];

            for (const candidate of candidates) {
                if (!isPrivateMessageInvalidName(candidate)) {
                    return String(candidate).trim();
                }
            }

            return '未知用户';
        }

        function getPrivateMessageMetaName(user = {}, displayName = '') {
            const candidates = [
                user.realNickName,
                normalizePrivateMessageName(user.nickname),
                normalizePrivateMessageName(user.name),
                user.nickname,
                user.name
            ];

            for (const candidate of candidates) {
                if (isPrivateMessageInvalidName(candidate)) continue;
                const normalized = String(candidate).trim();
                if (!normalized || normalized === displayName) continue;
                return normalized;
            }

            return '';
        }

        function normalizePrivateMessageTeamLabel(team = '', groupName = '') {
            const rawTeam = String(team || '').trim();
            const rawGroup = String(groupName || '').trim().toUpperCase();
            if (!rawTeam) {
                return ['SNH48', 'GNZ48', 'BEJ48', 'CKG48', 'CGT48', 'IDFT'].includes(rawGroup) ? rawGroup : '';
            }

            const upper = rawTeam
                .toUpperCase()
                .replace(/[－—]/g, '-')
                .replace(/\s+/g, ' ')
                .trim();
            const matchesTeamToken = (token) => {
                if (!token) return false;
                const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return upper === token || new RegExp(`(?:^|\\s)${escaped}(?=\\s|$|[^A-Z])`).test(upper);
            };

            if (upper.includes('荣誉毕业')) return '荣誉毕业生';
            if (upper.includes('预备')) return '预备生';
            if (matchesTeamToken('TEAM NIII') || matchesTeamToken('NIII')) return 'TEAM NIII';
            if (matchesTeamToken('TEAM SII') || matchesTeamToken('SII')) return 'TEAM SII';
            if (matchesTeamToken('TEAM NII') || matchesTeamToken('NII')) return 'TEAM NII';
            if (matchesTeamToken('TEAM HII') || matchesTeamToken('HII')) return 'TEAM HII';
            if (matchesTeamToken('TEAM X') || matchesTeamToken('X')) return 'TEAM X';
            if (matchesTeamToken('TEAM GII') || matchesTeamToken('GII')) return 'TEAM GII';
            if (matchesTeamToken('TEAM CII') || matchesTeamToken('CII')) return 'TEAM CII';
            if (matchesTeamToken('TEAM G') || matchesTeamToken('G')) return 'TEAM G';
            if (matchesTeamToken('TEAM Z') || matchesTeamToken('Z')) return 'TEAM Z';
            if (matchesTeamToken('TEAM B') || matchesTeamToken('B')) return 'TEAM B';
            if (matchesTeamToken('TEAM E') || matchesTeamToken('E')) return 'TEAM E';
            if (matchesTeamToken('TEAM K') || matchesTeamToken('K')) return 'TEAM K';
            if (matchesTeamToken('TEAM C') || matchesTeamToken('C')) return 'TEAM C';

            if (['SNH48', 'GNZ48', 'BEJ48', 'CKG48', 'CGT48', 'IDFT'].includes(upper)) {
                return upper;
            }

            return rawTeam;
        }

        function getPrivateMessageMemberMatch(user = {}, displayName = '') {
            const sourceMembers = getPrivateMessageSourceMembers();
            if (sourceMembers.length === 0) return null;

            const normalizedDisplayName = String(displayName || getPrivateMessageDisplayName(user) || '').trim();
            const normalizedMetaName = String(getPrivateMessageMetaName(user, normalizedDisplayName) || '').trim();
            const userIds = [
                user.userId,
                user.id,
                user.memberId,
                user.starId
            ].map(value => String(value || '').trim()).filter(Boolean);

            return sourceMembers.find(m => {
                const memberIds = [
                    m.id,
                    m.userId,
                    m.memberId
                ].map(value => String(value || '').trim()).filter(Boolean);

                if (userIds.length > 0 && memberIds.some(id => userIds.includes(id))) {
                    return true;
                }

                const memberNames = [
                    m.ownerName,
                    m.name,
                    m.nickname
                ].map(value => normalizePrivateMessageName(value)).filter(Boolean);

                return (normalizedDisplayName && memberNames.includes(normalizePrivateMessageName(normalizedDisplayName)))
                    || (normalizedMetaName && memberNames.includes(normalizePrivateMessageName(normalizedMetaName)));
            }) || null;
        }

        function getPrivateMessageTeamLabel(user = {}, displayName = '') {
            const memberMatch = getPrivateMessageMemberMatch(user, displayName);
            if (memberMatch) {
                const memberTeam = normalizePrivateMessageTeamLabel(memberMatch.team, memberMatch.groupName);
                if (memberTeam) return memberTeam;
            }

            const teamLogo = String(user.teamLogo || '').toLowerCase();
            if (teamLogo.includes('snh48_s2')) return 'TEAM SII';
            if (teamLogo.includes('snh48_n2')) return 'TEAM NII';
            if (teamLogo.includes('snh48_h2')) return 'TEAM HII';
            if (teamLogo.includes('snh48_x')) return 'TEAM X';
            if (teamLogo.includes('gnz48_n3')) return 'TEAM NIII';
            if (teamLogo.includes('gnz48_g')) return 'TEAM G';
            if (teamLogo.includes('gnz_z')) return 'TEAM Z';
            if (teamLogo.includes('bej48_b')) return 'TEAM B';
            if (teamLogo.includes('bej48_e')) return 'TEAM E';
            if (teamLogo.includes('bej48_j')) return 'TEAM J';
            if (teamLogo.includes('ckg48_k')) return 'TEAM K';
            if (teamLogo.includes('ckg48_c')) return 'TEAM C';
            if (teamLogo.includes('cgt48_cii')) return 'TEAM CII';
            if (teamLogo.includes('cgt48_gii')) return 'TEAM GII';
            if (teamLogo.includes('yb') || teamLogo.includes('youth') || teamLogo.includes('pre')) return '预备生';

            const directTeam = [
                user.teamName,
                user.team,
                user.starTeamName
            ].find(value => {
                const normalized = String(value || '').trim().toUpperCase();
                if (!normalized) return false;
                if (normalized === 'SNH48' || normalized === 'GNZ48' || normalized === 'BEJ48' || normalized === 'CKG48' || normalized === 'CGT48') return false;
                return true;
            });

            if (directTeam) return normalizePrivateMessageTeamLabel(directTeam, user.groupName);

            const directGroup = String(user.groupName || '').trim().toUpperCase();
            if (directGroup === 'SNH48' || directGroup === 'GNZ48' || directGroup === 'BEJ48' || directGroup === 'CKG48' || directGroup === 'CGT48') {
                // 团名只作为最后兜底，不盖掉真实队伍。
            } else if (directGroup) {
                return String(user.groupName).trim();
            }

            const groupHint = String(user.nickname || user.name || '').toUpperCase();
            if (groupHint.startsWith('SNH48-')) return 'SNH48';
            if (groupHint.startsWith('GNZ48-')) return 'GNZ48';
            if (groupHint.startsWith('BEJ48-')) return 'BEJ48';
            if (groupHint.startsWith('CKG48-')) return 'CKG48';
            if (groupHint.startsWith('CGT48-')) return 'CGT48';

            return user.isStar ? '成员' : '';
        }

        function formatPrivateMessageTime(timestamp) {
            const time = Number(timestamp);
            if (!time) return '--';

            const date = new Date(time);
            const now = new Date();
            const sameYear = date.getFullYear() === now.getFullYear();
            const sameDay = date.toDateString() === now.toDateString();
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');

            if (sameDay) return `${hh}:${mm}`;
            if (sameYear) {
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${month}-${day}`;
            }

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function formatPrivateMessageDateTime(timestamp) {
            const time = Number(timestamp);
            if (!time) return '--';
            const date = new Date(time);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day} ${hh}:${mm}`;
        }

        function getPrivateMessageAudioInfo(message = {}) {
            const content = message.content || {};
            const candidates = collectPrivateMessageMediaCandidates(message);

            for (const item of candidates) {
                const url = normalizePrivateMediaUrl(item.url || item.voiceUrl || item.audioUrl || '');
                if (!url) continue;
                const audioType = String(item.type || item.contentType || content.type || message.messageType || '').toUpperCase();
                const answerType = getPrivateMessageMediaAnswerType(item, content);
                const hasAudioSpecificField = Boolean(item.voiceUrl || item.audioUrl || item.voicePath || item.audioPath);
                if (
                    looksLikeAudioUrl(url)
                    || ((audioType.includes('AUDIO') || audioType.includes('VOICE')) && !looksLikeVideoUrl(url))
                    || (answerType === 2 && !looksLikeVideoUrl(url))
                    || (hasAudioSpecificField && !looksLikeVideoUrl(url))
                ) {
                    return {
                        url,
                        duration: Number(item.duration || content.duration || 0)
                    };
                }
            }

            return null;
        }

        function getPrivateMessageImageInfo(message = {}) {
            const content = message.content || {};
            const candidates = collectPrivateMessageMediaCandidates(message);

            for (const item of candidates) {
                const url = normalizePrivateMediaUrl(String(
                    item.imgUrl
                    || item.imageUrl
                    || item.pictureUrl
                    || item.picUrl
                    || item.photoUrl
                    || item.cover
                    || item.coverUrl
                    || item.url
                    || item.path
                    || ''
                ).trim(), 'source');
                if (!url) continue;

                const imageType = String(item.type || item.contentType || content.type || message.messageType || '').toUpperCase();
                if (
                    looksLikeImageUrl(url)
                    || (imageType.includes('IMAGE') && !looksLikeAudioUrl(url) && !looksLikeVideoUrl(url))
                ) {
                    return {
                        url,
                        width: Number(item.imgWidth || item.width || content.imgWidth || content.width || 0),
                        height: Number(item.imgHeight || item.height || content.imgHeight || content.height || 0)
                    };
                }
            }

            return null;
        }

        function getPrivateMessageVideoInfo(message = {}) {
            const content = message.content || {};
            const candidates = collectPrivateMessageMediaCandidates(message);

            for (const item of candidates) {
                const url = normalizePrivateMediaUrl(String(
                    item.url
                    || item.videoUrl
                    || item.mp4Url
                    || item.playUrl
                    || item.path
                    || ''
                ).trim());
                if (!url) continue;
                const videoType = String(item.type || item.contentType || content.type || message.messageType || '').toUpperCase();
                const answerType = getPrivateMessageMediaAnswerType(item, content);
                const hasPreviewImage = Boolean(item.previewImg || item.cover || item.coverUrl || item.poster);
                if (
                    looksLikeVideoUrl(url)
                    || ((videoType.includes('VIDEO') || videoType.includes('MOVIE')) && !looksLikeAudioUrl(url))
                    || answerType === 3
                    || (hasPreviewImage && !looksLikeAudioUrl(url))
                ) {
                    return {
                        url,
                        cover: normalizePrivateMediaUrl(String(
                            item.previewImg
                            || item.cover
                            || item.coverUrl
                            || item.poster
                            || ''
                        ).trim(), 'source')
                    };
                }
            }

            return null;
        }

        function parsePrivateFlipcardPayload(value) {
            if (!value) return null;
            if (typeof value === 'object') return value;
            try {
                return JSON.parse(value);
            } catch (error) {
                return null;
            }
        }

        function getPrivateFlipcardInfo(message = {}) {
            const sources = [
                message.content,
                message,
                message?.content?.bodys,
                message?.bodys
            ].filter(Boolean);
            const possibleKeys = [
                'flipCardInfo',
                'filpCardInfo',
                'flipCardAudioInfo',
                'filpCardAudioInfo',
                'flipCardVideoInfo',
                'filpCardVideoInfo'
            ];

            for (const source of sources) {
                for (const key of possibleKeys) {
                    const parsed = parsePrivateFlipcardPayload(source[key]);
                    if (parsed) return parsed;
                }
            }

            return null;
        }

        function getPrivateFlipcardText(message = {}, mode = 'question') {
            const content = message.content || {};
            const flipInfo = getPrivateFlipcardInfo(message);
            const directValue = mode === 'answer'
                ? (flipInfo?.answer ?? content.answer ?? message.answer)
                : (flipInfo?.question ?? content.question ?? message.question);

            if (typeof directValue === 'string') {
                const trimmed = normalizePrivateMessageBodyText(directValue);
                if (trimmed) {
                    const parsed = parsePrivateFlipcardPayload(trimmed);
                    if (parsed) {
                        const nested = normalizePrivateMessageBodyText(parsed.text || parsed.answer || parsed.question || '');
                        if (nested) return nested;
                    }
                    return trimmed;
                }
            }

            if (directValue && typeof directValue === 'object') {
                const nested = normalizePrivateMessageBodyText(directValue.text || directValue.answer || directValue.question || '');
                if (nested) return nested;
            }

            return '';
        }

        function formatPrivateMessageContent(message) {
            const type = String(message && message.messageType || message?.content?.messageType || '').toUpperCase();
            const content = message && message.content ? message.content : {};
            const text = normalizePrivateMessageBodyText(content.text || content.replyText || content.messageText || '');
            const flipQuestion = getPrivateFlipcardText(message, 'question');
            const flipAnswer = getPrivateFlipcardText(message, 'answer');
            const isNumericOnly = /^\d+$/.test(text);
            const audioInfo = getPrivateMessageAudioInfo(message);
            const videoInfo = getPrivateMessageVideoInfo(message);
            const imageInfo = getPrivateMessageImageInfo(message);

            if (type === 'TEXT') {
                if (audioInfo) return '[语音消息]';
                if (videoInfo) return '[视频消息]';
                if (imageInfo) return '[图片消息]';
                return text || '空文本消息';
            }
            if (type === 'IMAGE') return '[图片消息]';
            if (type === 'AUDIO') return '[语音消息]';
            if (type === 'VIDEO') return '[视频消息]';
            if (type === 'GIFT') return '[礼物消息]';
            if (type === 'FLIP') return '[翻牌消息]';
            if (type === 'FLIPCARD_QUESTION') return flipQuestion || (!isNumericOnly ? text : '') || '[翻牌提问]';
            if (type === 'FLIPCARD_ANSWER') return flipAnswer || (!isNumericOnly ? text : '') || '[翻牌回复]';
            return `[${type || '未知'}]`;
        }

        function renderPrivateMessageContentHtml(message) {
            const audioInfo = getPrivateMessageAudioInfo(message);
            if (audioInfo) {
                return `<div class="private-message-audio-slot" data-audio-src="${escapePrivateMessageHtml(audioInfo.url)}" data-audio-duration="${Number(audioInfo.duration || 0)}"></div>`;
            }
            const videoInfo = getPrivateMessageVideoInfo(message);
            if (videoInfo) {
                return `<div class="private-message-video-slot" data-video-src="${escapePrivateMessageHtml(videoInfo.url)}"></div>`;
            }
            const imageInfo = getPrivateMessageImageInfo(message);
            if (imageInfo) {
                const width = Number(imageInfo.width || 0);
                const height = Number(imageInfo.height || 0);
                const sizeAttrs = [
                    width > 0 ? `width="${Math.round(width)}"` : '',
                    height > 0 ? `height="${Math.round(height)}"` : ''
                ].filter(Boolean).join(' ');
                const safeUrl = escapePrivateMessageHtml(imageInfo.url);
                return `<button type="button" class="private-message-image-button" onclick="openImageModal('${safeUrl}')"><img class="private-message-image" src="${safeUrl}" ${sizeAttrs} alt="图片消息" loading="lazy"></button>`;
            }
            return escapePrivateMessageHtml(formatPrivateMessageContent(message));
        }


        return {
            clearActivePrivateMessageUnread,
            formatPrivateMessageContent,
            formatPrivateMessageDateTime,
            formatPrivateMessagePreview,
            formatPrivateMessageTime,
            getPrivateMessageAvatar,
            getPrivateMessageConversationKey,
            getPrivateMessageDisplayName,
            getPrivateMessageItemKey,
            getPrivateMessageTeamLabel,
            normalizePrivateMessageName,
            renderPrivateMessageContentHtml
        };
    };
})();
