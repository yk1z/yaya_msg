import { getPinyinInitials, memberSortLogic } from './member-directory.mjs';
import { createProfileFeature } from './profile-feature.mjs';
import { createMemberPhotosFeature } from './member-photos-feature.mjs';
import { createRoomAlbumFeature } from './room-album-feature.mjs';
import { createMemberDynamicFeature } from './member-dynamic-feature.mjs';
import { createMemberWeiboFeature } from './member-weibo-feature.mjs';
import { createTripFeature } from './trip-feature.mjs';

export function installMemberPages({
    getAppToken, getCurrentUserId, loadMemberData, getTeamStyle, ipcRenderer, showToast,
    createCustomAudioPlayer, getCurrentPlayingAudio, getCurrentPlayingVideo, setCurrentPlayingVideo,
    getOptimizedThumbUrl, openImageModal, openExternal, replaceTencentEmoji,
    applyRoomAlbumChannelValue, downloadMediaFileIconMode
}) {
    const memberSearch = {
        getAppToken, loadMemberData, getTeamStyle, ipcRenderer, showToast, getPinyinInitials, memberSortLogic,
        getMemberData: () => window.memberData || [],
        getMemberDataLoaded: () => Boolean(window.isMemberDataLoaded)
    };
    const albumVideoObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const video = entry.target;
                if (!video.src && video.dataset.src) {
                    video.src = video.dataset.src;
                    video.preload = 'metadata';
                }
                observer.unobserve(video);
            }
        });
    }, { rootMargin: '300px' });

    const galleryMedia = {
        getAlbumVideoObserver: () => albumVideoObserver,
        getCurrentPlayingAudio, getCurrentPlayingVideo, setCurrentPlayingVideo, getOptimizedThumbUrl, openImageModal
    };
    const profile = createProfileFeature(memberSearch);
    const photos = createMemberPhotosFeature({ ...memberSearch, ...galleryMedia, createCustomAudioPlayer });
    const album = createRoomAlbumFeature({
        ...memberSearch, ...galleryMedia, applyRoomAlbumChannelValue, downloadMediaFileIconMode
    });
    const dynamic = createMemberDynamicFeature({
        ...memberSearch, getCurrentUserId, getOptimizedThumbUrl, replaceTencentEmoji, openImageModal
    });
    const weibo = createMemberWeiboFeature({ ...memberSearch, getOptimizedThumbUrl, openExternal, openImageModal });
    const trip = createTripFeature({ ...memberSearch, openExternal });

    Object.assign(window, profile, photos, album, dynamic, weibo, trip);
}
