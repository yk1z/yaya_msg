const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function getLegacyMigrationText(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function getLegacyMigrationMediaUrl(node, selector) {
    const media = node?.querySelector(selector);
    if (!media) return '';
    return String(media.getAttribute('src') || media.querySelector('source')?.getAttribute('src') || '').trim();
}

function buildLegacyMigrationKey(row, timeStr, userId, index) {
    const existingKey = String(row.getAttribute('data-export-key') || '').trim();
    if (existingKey) return existingKey;

    const seed = `${timeStr}|${userId}|${getLegacyMigrationText(row)}|${index}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    return `legacy_${Math.abs(hash)}_${Date.parse(String(timeStr).replace(/-/g, '/')) || index}`;
}

function extractLegacyReplyContent(contentRoot) {
    const quote = contentRoot.querySelector('blockquote');
    if (!quote) return null;

    const quoteText = getLegacyMigrationText(quote);
    const separatorIndex = Math.max(quoteText.indexOf('：'), quoteText.indexOf(':'));
    const replyName = separatorIndex >= 0 ? quoteText.slice(0, separatorIndex).trim() : '未知用户';
    const replyText = separatorIndex >= 0 ? quoteText.slice(separatorIndex + 1).trim() : quoteText;
    quote.remove();
    contentRoot.querySelectorAll('audio, video').forEach(node => node.remove());
    contentRoot.querySelectorAll('div').forEach(node => {
        if (/^(?:音频|语音|视频)\s*[-–—]/.test(getLegacyMigrationText(node))) node.remove();
    });
    return {
        text: getLegacyMigrationText(contentRoot),
        replyName,
        replyText
    };
}

function convertLegacyHtmlRowToStructuredRecord(row, index) {
    const timeStr = getLegacyMigrationText(row.querySelector('time'));
    const parsedTime = Date.parse(timeStr.replace(/-/g, '/'));
    const senderNode = row.querySelector('span[data-userid], div.mb-2 span');
    const header = senderNode?.closest('div.mb-2') || null;
    const avatar = header?.querySelector('img');
    const userId = String(senderNode?.getAttribute('data-userid') || '');
    const roleId = Number(senderNode?.getAttribute('data-roleid')) || 0;
    const senderName = getLegacyMigrationText(senderNode) || '未知用户';
    const contentRoot = row.cloneNode(true);
    contentRoot.querySelector('time')?.remove();
    if (header) {
        const clonedHeader = contentRoot.querySelector('span[data-userid], div.mb-2 span')?.closest('div.mb-2');
        clonedHeader?.remove();
    }

    const audioUrl = getLegacyMigrationMediaUrl(contentRoot, 'audio');
    const videoUrl = getLegacyMigrationMediaUrl(contentRoot, 'video');
    const mediaImage = Array.from(contentRoot.querySelectorAll('img')).find(image => !image.classList.contains('avatar'));
    const imageUrl = String(mediaImage?.getAttribute('src') || '');
    const textContent = getLegacyMigrationText(contentRoot);
    let messageType = 'TEXT';
    let content = { text: textContent };

    const questionNode = Array.from(contentRoot.querySelectorAll('p, div')).find(node => /翻牌问题[:：]|翻牌提问/.test(getLegacyMigrationText(node)));
    const answerNode = Array.from(contentRoot.querySelectorAll('p, div')).find(node => /回答[:：]|成员回答/.test(getLegacyMigrationText(node)));
    if (questionNode || answerNode) {
        const question = getLegacyMigrationText(questionNode).replace(/^.*?(?:翻牌问题[:：]|翻牌提问)\s*/, '');
        const answer = getLegacyMigrationText(answerNode).replace(/^.*?(?:回答[:：]|成员回答)\s*/, '');
        if (videoUrl) {
            messageType = 'FLIPCARD_VIDEO';
            content = { flipCardVideoInfo: { question, answer: { url: videoUrl } } };
        } else if (audioUrl) {
            messageType = 'FLIPCARD_AUDIO';
            content = { flipCardAudioInfo: { question, answer: { url: audioUrl } } };
        } else {
            messageType = 'FLIPCARD';
            content = { flipCardInfo: { question, answer } };
        }
    } else {
        const giftContainer = Array.from(contentRoot.querySelectorAll('div')).find(node =>
            String(node.getAttribute('style') || '').includes('background:#fff0f6')
            && getLegacyMigrationText(node).includes('送出礼物')
        );
        const packetContainer = Array.from(contentRoot.querySelectorAll('div')).find(node =>
            String(node.getAttribute('style') || '').includes('linear-gradient')
            && getLegacyMigrationText(node).includes('红包')
        );
        const liveLink = contentRoot.querySelector('a[href*="live/playdetail"], a[href*="?id="]');
        const replyRoot = contentRoot.cloneNode(true);
        const replyInfo = extractLegacyReplyContent(replyRoot);

        if (giftContainer) {
            const giftText = getLegacyMigrationText(giftContainer);
            const giftName = giftText.match(/送出礼物[:：]\s*([^数量]+)/)?.[1]?.trim() || '未知礼物';
            const giftNum = Number(giftText.match(/数量[:：]\s*x?(\d+)/i)?.[1]) || 1;
            const totalCost = Number(giftText.match(/\((\d+)🍗\)/)?.[1]) || 0;
            messageType = 'GIFT_TEXT';
            content = {
                giftInfo: {
                    giftName,
                    giftNum,
                    ...(totalCost ? { money: totalCost / giftNum } : {}),
                    image: String(giftContainer.querySelector('img')?.getAttribute('src') || '')
                }
            };
        } else if (packetContainer) {
            const detailNodes = Array.from(packetContainer.querySelectorAll('div')).filter(node => node.children.length === 0);
            const visibleTexts = detailNodes.map(getLegacyMigrationText).filter(Boolean).filter(text => text !== '红包');
            const metaParts = String(visibleTexts[1] || '').split(/\s+·\s+/);
            messageType = 'RED_PACKET';
            content = {
                blessMessage: visibleTexts[0] || '送来了红包祝福',
                creatorName: metaParts[0] || senderName,
                starName: metaParts.slice(1).join(' · '),
                coverUrl: String(packetContainer.querySelector('img')?.getAttribute('src') || '')
            };
        } else if (liveLink) {
            const liveId = String(liveLink.getAttribute('href') || '').match(/[?&]id=(\d+)/)?.[1] || '';
            const title = String(liveLink.getAttribute('data-title') || getLegacyMigrationText(liveLink) || '直播开始了');
            const cover = String(liveLink.getAttribute('data-cover') || '');
            const memberName = String(liveLink.getAttribute('data-member') || '');
            if (memberName) {
                messageType = 'SHARE_LIVE';
                content = { shareInfo: { shareTitle: title, jumpPath: `?id=${liveId}`, sharePic: cover, liveUserName: memberName } };
            } else {
                messageType = 'LIVEPUSH';
                content = { livePushInfo: { liveId, liveTitle: title, liveCover: cover } };
            }
        } else if (audioUrl && replyInfo) {
            messageType = 'AUDIO_REPLY';
            content = { replyInfo: { ...replyInfo, voiceUrl: audioUrl } };
        } else if (videoUrl) {
            messageType = 'VIDEO';
            content = { url: videoUrl };
        } else if (audioUrl) {
            messageType = 'AUDIO';
            content = { url: audioUrl };
        } else if (mediaImage?.classList.contains('template-image-express-image')) {
            messageType = 'EXPRESSIMAGE';
            content = { expressImgInfo: { emotionRemote: imageUrl } };
        } else if (imageUrl) {
            messageType = 'IMAGE';
            content = { url: imageUrl };
        } else if (replyInfo) {
            messageType = 'REPLY';
            content = { replyInfo };
        }
    }

    return {
        schemaVersion: 1,
        key: buildLegacyMigrationKey(row, timeStr, userId, index),
        sortTime: Number.isFinite(parsedTime) ? parsedTime : index,
        timeStr,
        messageType,
        sender: {
            name: senderName,
            avatarUrl: String(avatar?.getAttribute('src') || ''),
            userId,
            roleId
        },
        content
    };
}

function convertLegacyHtmlContentToStructuredRecords(htmlContent) {
    const template = document.createElement('template');
    template.innerHTML = htmlContent;
    return Array.from(template.content.querySelectorAll('.Box-row'))
        .map(convertLegacyHtmlRowToStructuredRecord)
        .filter(record => record && record.key);
}

async function migrateLegacyMessageHtml(root) {
    const result = { convertedFiles: 0, convertedMessages: 0, failedFiles: 0 };

    async function visit(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const names = new Set(entries.map(entry => process.platform === 'win32' ? entry.name.toLowerCase() : entry.name));
        for (const entry of entries) {
            const filePath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await visit(filePath);
                continue;
            }
            if (!entry.isFile() || !/\.html$/i.test(entry.name)) continue;
            const jsonlName = entry.name.replace(/\.html$/i, '.jsonl');
            if (names.has(process.platform === 'win32' ? jsonlName.toLowerCase() : jsonlName)) continue;
            const target = path.join(dir, jsonlName);
            const temporary = path.join(dir, '.' + randomUUID() + '.migrating');
            try {
                const html = await fs.readFile(filePath, 'utf8');
                const records = convertLegacyHtmlContentToStructuredRecords(html);
                if (!records.length) continue;
                await fs.writeFile(temporary, records.map(record => JSON.stringify(record)).join('\n') + '\n', { flag: 'wx' });
                await fs.link(temporary, target);
                result.convertedFiles += 1;
                result.convertedMessages += records.length;
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    result.failedFiles += 1;
                    console.warn('转换旧版 HTML 消息失败:', filePath, error);
                }
            } finally {
                await fs.rm(temporary, { force: true });
            }
        }
    }

    await visit(root);
    return result;
}

module.exports = { migrateLegacyMessageHtml };
