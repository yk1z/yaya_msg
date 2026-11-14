'use strict';

const { ipcMain } = require('electron');
const memberRoomService = require('../services/member-room-service');
const memberRoomGiftService = require('../services/member-room-gift-service');
const roomNotificationService = require('../services/room-notification-service');
const accountImService = require('../services/account-im-service');
const roomVoiceService = require('../services/room-voice-service');
const liveStartService = require('../services/live-start-service');

function registerMemberRoomIpc() {
    accountImService.initialize();
    ipcMain.handle('connect-account-im', event => accountImService.connect(event.sender));
    ipcMain.handle('configure-live-start', (event, payload) => liveStartService.configure(event.sender, payload));
    ipcMain.handle('disconnect-live-start', (event, payload = {}) => ({
        success: true, disconnected: liveStartService.stop(event.sender.id, payload.requestId)
    }));
    ipcMain.handle('configure-room-voice', (event, payload) => roomVoiceService.configure(event.sender, payload));
    ipcMain.handle('disconnect-room-voice', (event, payload = {}) => ({
        success: true, disconnected: roomVoiceService.stop(event.sender.id, payload.requestId)
    }));
    ipcMain.handle('configure-room-notifications', (event, payload) => roomNotificationService.configure(event.sender, payload));
    ipcMain.handle('disconnect-room-notifications', (event, payload = {}) => ({
        success: true, disconnected: roomNotificationService.stop(event.sender.id, payload.requestId)
    }));
    ipcMain.handle('fetch-member-room-gifts', (_event, payload) => memberRoomGiftService.fetchMemberRoomGifts(payload));
    ipcMain.handle('send-member-room-gift', (event, payload) => memberRoomGiftService.sendMemberRoomGift(event.sender.id, payload));
    ipcMain.handle('connect-member-room', (event, payload) => (
        memberRoomService.connectMemberRoom(event.sender, payload)
    ));
    ipcMain.handle('disconnect-member-room', (event, payload = {}) => ({
        success: true,
        disconnected: memberRoomService.disconnectMemberRoom(event.sender.id, payload.connectionId)
    }));
    ipcMain.handle('send-member-room-message', (event, payload) => (
        memberRoomService.sendMemberRoomMessage(event.sender.id, payload)
    ));
    ipcMain.handle('delete-member-room-message', (event, payload) => (
        memberRoomService.deleteMemberRoomMessage(event.sender.id, payload)
    ));
}

module.exports = {
    registerMemberRoomIpc
};
