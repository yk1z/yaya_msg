const rtcMethods = [
    'createEngine', 'destroyEngine', 'loginRoom', 'logoutRoom',
    'muteMicrophone', 'enableCamera', 'mutePlayStreamAudio',
    'getAudioDeviceList', 'getVideoDeviceList', 'useAudioDevice', 'useVideoDevice',
    'getDefaultAudioDeviceID', 'getDefaultVideoDeviceID', 'startSoundLevelMonitor', 'stopSoundLevelMonitor',
    'startPublishingStream',
    'stopPublishingStream', 'stopPreview', 'stopPlayingStream', 'removeAllListeners'
];

const eventNames = new Set([
    'onRoomStateUpdate', 'onRoomStreamUpdate', 'onPublisherStateUpdate', 'onPlayerStateUpdate',
    'onPublisherQualityUpdate', 'onPlayerQualityUpdate', 'onNetworkQuality',
    'onNetworkModeChanged', 'onDebugError', 'onAudioDeviceStateChanged',
    'onVideoDeviceStateChanged', 'onPublisherVideoSizeChanged', 'onPlayerVideoSizeChanged',
    'onPlayerMediaEvent',
    'onPublisherCapturedAudioFirstFrame', 'onPublisherCapturedVideoFirstFrame',
    'onCapturedSoundLevelUpdate', 'onLocalDeviceExceptionOccurred',
    'onPlayerRecvAudioFirstFrame', 'onPlayerRecvVideoFirstFrame',
    'onPlayerRenderVideoFirstFrame'
]);

function getRtcApi() {
    const engine = require('zego-express-engine-electron/ZegoExpressEngine');
    const api = Object.fromEntries(rtcMethods.map(method => [method, (...args) => engine[method](...args)]));
    return {
        ...api,
        on(name, listener) {
            if (eventNames.has(name) && typeof listener === 'function') {
                engine.on(name, payload => listener(payload));
            }
        },
        startPreview() {
            const canvas = document.getElementById('netface-local-canvas');
            if (canvas) engine.startPreview({ canvas, viewMode: 0 });
        },
        startDevicePreview() {
            const canvas = document.getElementById('netface-device-video');
            if (canvas) engine.startPreview({ canvas, viewMode: 0 });
        },
        startPlayingStream(streamId) {
            const canvas = document.getElementById('netface-remote-canvas');
            if (canvas) engine.startPlayingStream(streamId, { canvas, viewMode: 0 });
        }
    };
}

module.exports = { getRtcApi };
