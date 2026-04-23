const { ipcMain } = require('electron');
const pocketService = require('../services/pocket-service');

function registerPocketIpc() {
    ipcMain.handle('login-send-sms', (event, payload) => pocketService.loginSendSms(payload));
    ipcMain.handle('login-by-code', (event, payload) => pocketService.loginByCode(payload));
    ipcMain.handle('login-check-token', (event, payload) => pocketService.loginCheckToken(payload));
    ipcMain.handle('switch-big-small', (event, payload) => pocketService.switchBigSmall(payload));
    ipcMain.handle('fetch-room-messages', (event, payload) => pocketService.fetchRoomMessages(payload));
    ipcMain.handle('fetch-private-message-list', (event, payload) => pocketService.fetchPrivateMessageList(payload));
    ipcMain.handle('fetch-private-message-info', (event, payload) => pocketService.fetchPrivateMessageInfo(payload));
    ipcMain.handle('send-private-message-reply', (event, payload) => pocketService.sendPrivateMessageReply(payload));
    ipcMain.handle('fetch-flip-list', (event, payload) => pocketService.fetchFlipList(payload));
    ipcMain.handle('fetch-star-archives', (event, payload) => pocketService.fetchStarArchives(payload));
    ipcMain.handle('fetch-star-history', (event, payload) => pocketService.fetchStarHistory(payload));
    ipcMain.handle('fetch-open-live', (event, payload) => pocketService.fetchOpenLive(payload));
    ipcMain.handle('fetch-open-live-one', (event, payload) => pocketService.fetchOpenLiveOne(payload));
    ipcMain.handle('fetch-open-live-public-list', (event, payload) => pocketService.fetchOpenLivePublicList(payload));
    ipcMain.handle('fetch-open-live-participants', (event, payload) => pocketService.fetchOpenLiveParticipants(payload));
    ipcMain.handle('fetch-flip-prices', (event, payload) => pocketService.fetchFlipPrices(payload));
    ipcMain.handle('send-flip-question', (event, payload) => pocketService.sendFlipQuestion(payload));
    ipcMain.handle('operate-flip-question', (event, payload) => pocketService.operateFlipQuestion(payload));
    ipcMain.handle('fetch-member-photos', (event, payload) => pocketService.fetchMemberPhotos(payload));
    ipcMain.handle('fetch-user-money', (event, payload) => pocketService.fetchUserMoney(payload));
    ipcMain.handle('send-live-gift', (event, payload) => pocketService.sendLiveGift(payload));
    ipcMain.handle('fetch-gift-list', (event, payload) => pocketService.fetchGiftList(payload));
    ipcMain.handle('get-nim-login-info', (event, payload) => pocketService.getNimLoginInfo(payload));
    ipcMain.handle('fetch-room-album', (event, payload) => pocketService.fetchRoomAlbum(payload));
    ipcMain.handle('fetch-room-radio', (event, payload) => pocketService.fetchRoomRadio(payload));
    ipcMain.handle('fetch-live-rank', (event, payload) => pocketService.fetchLiveRank(payload));
    ipcMain.handle('fetch-friends-ids', (event, payload) => pocketService.fetchFriendsIds(payload));
    ipcMain.handle('fetch-last-messages', (event, payload) => pocketService.fetchLastMessages(payload));
    ipcMain.handle('follow-member', (event, payload) => pocketService.followMember(payload));
    ipcMain.handle('unfollow-member', (event, payload) => pocketService.unfollowMember(payload));
}

module.exports = {
    registerPocketIpc
};
