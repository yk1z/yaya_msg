'use strict';

const { ipcMain } = require('electron');
const memberRoomService = require('../services/member-room-service');
const memberRoomGiftService = require('../services/member-room-gift-service');
const roomNotificationService = require('../services/room-notification-service');

function registerMemberRoomIpc() {
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
