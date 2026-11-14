'use strict';

const { createRoomNotificationService } = require('./room-notification-service');
module.exports = createRoomNotificationService({ prefix: 'room-voice', voiceEvents: true });
