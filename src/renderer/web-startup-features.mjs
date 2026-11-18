const features = window.YayaRendererFeatures ||= {};
const noop = () => {};
const disabledFeature = methods => () => Object.fromEntries(methods.map(name => [name, noop]));

features.createYk1zHomeFeature = () => ({ initYk1zHomePanel: noop });

features.createPrivateMessagesFeature = disabledFeature([
    'backToPrivateMessageList',
    'closePrivateMessageDetail',
    'checkPrivateMessageFlipCostMin',
    'filterPrivateMessageList',
    'flushPrivateMessagePendingMessages',
    'handlePrivateMessageImageSelected',
    'handlePrivateMessageFlipCostInput',
    'handlePrivateMessageReplyKeydown',
    'loadMorePrivateMessageDetail',
    'loadMorePrivateMessageList',
    'loadPrivateMessageDetail',
    'loadPrivateMessageList',
    'openPrivateMessageDetail',
    'openPrivateMessageImagePicker',
    'refreshPrivateMessageList',
    'resetPrivateMessageDetailPanel',
    'resetPrivateMessageListState',
    'sendPrivateMessageReply',
    'startPrivateMessagePolling',
    'stopPrivateMessagePolling',
    'syncPrivateMessageFlipControls',
    'togglePrivateMessageFlipAnswerDropdown',
    'togglePrivateMessageFlipPrivacyDropdown',
    'selectPrivateMessageFlipAnswer',
    'selectPrivateMessageFlipPrivacy',
    'updatePrivateMessageReplyCounter',
    'updatePrivateMessageFlipCostDisplay',
]);

features.createRoomRadioFeature = disabledFeature([
    'handleRoomRadioSearch',
    'selectRoomRadioMember',
    'connectRoomRadio',
    'openAutoRoomRadioRecordModal',
    'closeAutoRoomRadioRecordModal',
    'searchAutoRoomRadioRecordMembers',
    'toggleAutoRoomRadioRecording',
    'autoConnectFollowedRoomRadio',
    'ensureRoomRadioScanFresh',
    'startAllMemberRoomRadioAutoScan',
    'startFollowedMemberRoomRadioAutoScan',
    'stopAllMemberRoomRadioAutoScan',
    'toggleAllMemberRoomRadioScan',
    'toggleScannedRoomRadioMute',
    'toggleRadioMute',
    'stopRoomRadio',
    'toggleRoomRadioRecord',
]);

features.createLiveGiftFeature = disabledFeature([
    'executeSendLiveGift',
    'renderLiveGiftGrid',
    'selectLiveGift',
    'toggleGiftPanel',
    'updateLiveBalance',
]);
