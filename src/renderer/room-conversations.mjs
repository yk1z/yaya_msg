import { getPinyinInitials, memberSortLogic } from './member-directory.mjs';

export function installRoomConversations({
    ipcRenderer, switchView, loadMemberData, fetchPocketAPI, getAdaptivePollDelay, getAppToken, getCurrentUserId,
    getAccountSessionGeneration, getMemberData, getTeamStyle, getOptimizedThumbUrl, replaceTencentEmoji,
    escapePrivateMessageHtml, showToast, showConfirm, createCustomAudioPlayer, createCustomVideoPlayer,
    playArchiveFromMessage, playLiveStream, setMediaReturnView, getCurrentPlayingAudio, setCurrentPlayingAudio,
    privateMessageDetailState, privateMessageListState
}) {
    const factories = window.YayaRendererFeatures;
    const common = {
        ipcRenderer, getAdaptivePollDelay, getAppToken, getCurrentUserId, getMemberData,
        loadMemberData, showToast, replaceTencentEmoji
    };
    const chat = factories.createFollowedChatFeature({
        ...common, switchView, fetchPocketAPI, getOptimizedThumbUrl, createCustomAudioPlayer, createCustomVideoPlayer,
        playArchiveFromMessage, playLiveStream, setMediaReturnView, showConfirm
    });
    const archiveFlipUsers = factories.createArchiveFlipUserFeature({
        ipcRenderer,
        getToken: getAppToken,
        getPa: () => window.getPA ? window.getPA() : '',
        openProfile: chat.openFollowedUserProfile
    });
    const followed = factories.createFollowedRoomsFeature({
        ...common, getActiveFollowedChannel: chat.getActiveFollowedChannel, getAccountSessionGeneration,
        getMemberDataLoaded: () => Boolean(window.isMemberDataLoaded), getPinyinInitials, getTeamStyle, memberSortLogic
    });
    ipcRenderer.on?.('open-followed-room-from-notification', (_event, payload = {}) => {
        const channelId = String(payload.channelId || '').trim();
        const mainChannelId = String(payload.mainChannelId || channelId).trim();
        const serverId = String(payload.serverId || '').trim();
        if (!channelId || !serverId) return;
        switchView('followed-rooms');
        setTimeout(() => {
            chat.openFollowedChat(String(payload.memberName || '成员'), channelId, serverId, {
                mainChannelId,
                roomType: payload.roomType === 'small' ? 'small' : 'big'
            });
        }, 180);
    });
    const avatar = factories.createAvatarCacheFeature({ getAppToken, ipcRenderer });
    const formatters = factories.createPrivateMessageFormattersFeature({
        escapePrivateMessageHtml, getMemberData, privateMessageDetailState, privateMessageListState
    });
    const privateMessages = factories.createPrivateMessagesFeature({
        ...common, ...formatters, switchView, escapePrivateMessageHtml, getAccountSessionGeneration,
        privateMessageDetailState, privateMessageListState, createCustomAudioPlayer, createCustomVideoPlayer,
        getCurrentPlayingAudio, setCurrentPlayingAudio,
        getCurrentSearchKeyword: () => document.getElementById('private-message-search')?.value || '',
        getPrivateMessagesMemberDataLoaded: () => Boolean(window.isMemberDataLoaded)
    });
    const actions = { ...chat, ...followed, ...avatar, ...privateMessages };
    const {
        getActiveFollowedChannel,
        startFollowedRoomNotificationPolling,
        startFollowedRoomsPolling,
        stopFollowedRoomNotificationPolling,
        stopFollowedRoomsPolling,
        loadPrivateMessageDetail,
        loadPrivateMessageList,
        resetPrivateMessageDetailPanel,
        startPrivateMessagePolling,
        stopPrivateMessagePolling,
        ...publicActions
    } = actions;
    Object.assign(window, publicActions);
    factories.createPrivateMessageNotifications?.({
        ipcRenderer, getToken: getAppToken,
        getAccountGeneration: getAccountSessionGeneration,
        getActiveTarget: () => privateMessageDetailState.targetUserId,
        conversationKey: formatters.getPrivateMessageConversationKey, messageKey: formatters.getPrivateMessageItemKey,
        displayName: formatters.getPrivateMessageDisplayName, avatarUrl: formatters.getPrivateMessageAvatar,
        messageText: formatters.formatPrivateMessageContent, preview: formatters.formatPrivateMessagePreview,
        async openConversation(id, payload) {
            switchView('private-messages');
            await privateMessages.loadPrivateMessageDetail({ targetUserId: id, title: String(payload.memberName || '私信'),
                avatar: String(payload.iconUrl || './icon.png'), reset: true });
        }
    });
    document.addEventListener('mousedown', function (e) {
        const resultBox = document.getElementById('quick-follow-results');
        const input = document.getElementById('quick-follow-input');
        if (resultBox && !resultBox.contains(e.target) && e.target !== input) {
            resultBox.style.display = 'none';
        }
    });

    const privateDetailBody = document.getElementById('private-message-detail-body');
    if (privateDetailBody) {
        privateDetailBody.addEventListener('scroll', function () {
            if (this.scrollTop <= 40 && privateMessageDetailState.targetUserId && privateMessageDetailState.hasMore) {
                privateMessages.loadMorePrivateMessageDetail();
            }
        }, { passive: true });
    }

    return { ...actions, archiveFlipUsers };
}
