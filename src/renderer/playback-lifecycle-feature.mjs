const mediaKeyHandlers = {
    'official-site-music': {
        'play-pause': 'toggleOfficialSiteMusicPlay', next: 'playOfficialSiteNext', previous: 'playOfficialSitePrevious'
    },
    'audio-programs': {
        'play-pause': 'toggleAudioProgramPlayback', next: 'playNextAudioProgram', previous: 'playPreviousAudioProgram'
    },
    'music-library': {
        'play-pause': 'toggleOfficialMusicPlayback', next: 'playNextMusic', previous: 'playPreviousMusic'
    }
};

export function createPlaybackLifecycle({
    getView, getAudio, setAudio, getVideo, setVideo, stopAudioProgram, closeVideoPlayer,
    destroyBilibiliLivePlayer, stopBilibiliLiveStatusPolling, stopPrivateMessagePolling, stopFollowedRoomsPolling
}) {
    window.ipcRenderer?.on?.('system-media-key', (_event, action) => {
        const handler = window[mediaKeyHandlers[getView()]?.[action]];
        if (typeof handler === 'function') handler.call(window);
    });

    function stopPlaybackOnViewChange(nextViewName) {
        const officialSiteMusicAudio = document.getElementById('official-site-music-audio');
        const audioProgramAudio = document.getElementById('native-audio-player');
        const shouldSuspendOfficialSiteMusic = nextViewName !== 'official-site-music'
            && officialSiteMusicAudio
            && typeof window.suspendOfficialSiteMusicForViewSwitch === 'function';
        const shouldSuspendAudioProgram = nextViewName !== 'audio-programs'
            && audioProgramAudio
            && typeof window.suspendAudioProgramForViewSwitch === 'function';
        if (shouldSuspendOfficialSiteMusic) {
            window.suspendOfficialSiteMusicForViewSwitch();
        }
        if (shouldSuspendAudioProgram) {
            window.suspendAudioProgramForViewSwitch();
        }

        document.querySelectorAll('audio, video').forEach(mediaEl => {
            if (shouldSuspendOfficialSiteMusic && mediaEl === officialSiteMusicAudio) return;
            if (shouldSuspendAudioProgram && mediaEl === audioProgramAudio) return;

            try {
                mediaEl.pause();
            } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/playback-lifecycle-feature.mjs'); }

            try {
                mediaEl.currentTime = 0;
            } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/playback-lifecycle-feature.mjs'); }
        });

        const currentPlayingAudio = getAudio();
        const currentPlayingVideo = getVideo();
        if (currentPlayingAudio && currentPlayingAudio !== officialSiteMusicAudio && currentPlayingAudio !== audioProgramAudio) {
            currentPlayingAudio.pause();
            currentPlayingAudio.currentTime = 0;
            setAudio(null);
        }

        if (currentPlayingVideo) {
            currentPlayingVideo.pause();
            try {
                currentPlayingVideo.currentTime = 0;
            } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/playback-lifecycle-feature.mjs'); }
            setVideo(null);
        }

        if (nextViewName !== 'audio-programs') {
            if (!shouldSuspendAudioProgram && typeof stopAudioProgram === 'function') stopAudioProgram();
        }

        if (nextViewName !== 'video-library') {
            if (typeof closeVideoPlayer === 'function') closeVideoPlayer();
        }

        if (nextViewName !== 'bilibili-live') {
            if (typeof destroyBilibiliLivePlayer === 'function') destroyBilibiliLivePlayer(false);
            if (typeof stopBilibiliLiveStatusPolling === 'function') stopBilibiliLiveStatusPolling();
        }

        if (nextViewName !== 'private-messages') {
            if (typeof stopPrivateMessagePolling === 'function') stopPrivateMessagePolling();
        }

        if (nextViewName !== 'followed-rooms') {
            if (typeof stopFollowedRoomsPolling === 'function') stopFollowedRoomsPolling();
        }

        if (nextViewName !== 'music-library') {
            const musicAudio = document.getElementById('music-native-audio');
            if (musicAudio) musicAudio.pause();
        }

        if (nextViewName !== 'official-site-music') {
            if (!shouldSuspendOfficialSiteMusic && officialSiteMusicAudio) {
                officialSiteMusicAudio.pause();
            }
        }
    }

    return { stopPlaybackOnViewChange };
}
