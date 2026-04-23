(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createAvatarCacheFeature = function createAvatarCacheFeature(deps) {
        const {
            getAppToken,
            ipcRenderer
        } = deps;

        window.globalAvatarCache = window.globalAvatarCache || {};

        async function loadMemberAvatar(memberId, channelId) {
            if (!memberId || !channelId) return;

            if (window.globalAvatarCache[memberId]) {
                updateSessionAvatar(channelId, window.globalAvatarCache[memberId]);
                return;
            }

            const token = getAppToken();
            const pa = window.getPA ? window.getPA() : null;

            try {
                const res = await ipcRenderer.invoke('fetch-star-archives', { token, pa, memberId });
                if (res.success && res.content) {
                    const info = res.content.starInfo || res.content;
                    const avatarPath = info.avatar || info.userAvatar;

                    if (avatarPath) {
                        const fullUrl = avatarPath.startsWith('http') ? avatarPath : `https://source.48.cn${avatarPath}`;
                        window.globalAvatarCache[memberId] = fullUrl;
                        updateSessionAvatar(channelId, fullUrl);
                    }
                }
            } catch (e) {
            }
        }

        function updateSessionAvatar(channelId, url) {
            const card = document.getElementById(`session-card-${channelId}`);
            if (card) {
                const img = card.querySelector('.session-avatar');
                if (img) {
                    img.src = url;
                    img.style.animation = 'fadeIn 0.5s ease-in';
                }
            }
        }

        return {
            loadMemberAvatar,
            updateSessionAvatar
        };
    };
})();
