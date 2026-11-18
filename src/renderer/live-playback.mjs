import { getPinyinInitials } from './member-directory.mjs';

function parsePocketDanmu(fileContent) {
    const result = [];
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    const timeRegex = /\[(\d+):(\d+):(\d+)\.(\d+)\]/;
    lines.forEach((line, index) => {
        const timeMatch = line.match(timeRegex);
        if (timeMatch) {
            const seconds = (parseInt(timeMatch[1]) * 3600) + (parseInt(timeMatch[2]) * 60) + parseInt(timeMatch[3]) + (parseInt(timeMatch[4]) / 1000);
            const contentPart = line.replace(timeMatch[0], '');
            const parts = contentPart.split('\t');
            if (parts.length >= 2) {
                const nickname = parts[0];
                const text = parts.slice(1).join('');
                result.push({
                    name: nickname,
                    text: text,
                    time: seconds,
                    color: '#FFFFFF',
                    border: false,
                    mode: 0,
                });
            }
        }
    });
    return result;
}
export function installLivePlayback({
    ipcRenderer, fetchPocketAPI, switchView, getCurrentAppToken, getMemberIdFromQuery, loadMemberData,
    showToast, getTeamStyle, openExternal, openMediaInExternalPlayer, getPreferredExternalPlayerName,
    downloadStatusMap, mediaCatalog, backToLiveList, activateMediaPlaybackPage,
    getCurrentMode, getCurrentViewName, getCurrentPlayingItem, setCurrentPlayingItem, getPlaybackViewToken,
    getLiveAnnouncementDismissed, setLiveAnnouncementDismissed, getArt, setArt, getNimInstance, setNimInstance,
    getSelectedLiveGiftId, setSelectedLiveGiftId, disconnectLiveDanmu, initArtLiveDanmu, loadTimelineSubtitleText,
    renderDanmuListUI, resetTimelinePanel, stopRoomRadio, syncDanmuHighlight
}) {
    const factories = window.YayaRendererFeatures;
    const common = { ipcRenderer, fetchPocketAPI, showToast };
    const tools = factories.createLiveToolsFeature({
        ...common, getAppToken: getCurrentAppToken, getArt, getCurrentMode, getCurrentViewName,
        getCurrentPlayingItem, getPlaybackViewToken, getLiveAnnouncementDismissed, setLiveAnnouncementDismissed,
        getMemberData: () => window.memberData || [],
        loadMemberData, getPinyinInitials, getTeamStyle
    });
    const replay = factories.createReplayDownloadFeature({
        ...common, getCurrentMode, getMemberIdFromQuery, getPreferredExternalPlayerName, openExternal,
        openMediaInExternalPlayer, switchView, getPlayLiveStream: () => player.playLiveStream,
        getDownloadStatus: liveId => downloadStatusMap[liveId],
        setDownloadStatus: (liveId, status) => { downloadStatusMap[liveId] = status; },
        deleteDownloadStatus: liveId => { delete downloadStatusMap[liveId]; },
        getFilteredVODList: mediaCatalog.getFilteredVODList,
        getVodState: () => mediaCatalog.vodState,
        renderVODListUI: mediaCatalog.renderVODListUI,
        fetchVODPageInternal: mediaCatalog.fetchVODPageInternal
    });
    const player = factories.createPlayerCoreFeature({
        ...common, getArt, setArt, getNimInstance, setNimInstance, getCurrentPlayingItem, setCurrentPlayingItem,
        getSelectedLiveGiftId, setSelectedLiveGiftId, getLiveAnnouncementDismissed, setLiveAnnouncementDismissed,
        disconnectLiveDanmu, initArtLiveDanmu, loadTimelineSubtitleText, renderDanmuListUI, resetTimelinePanel,
        stopRoomRadio, syncDanmuHighlight, activateMediaPlaybackPage, parsePocketDanmu,
        fetchDanmuNative: replay.fetchDanmuNative,
        resetClipTool: tools.resetClipTool,
        backToLiveList: (...args) => window.desktop?.isLiveWindow
            ? window.showDetachedLiveError?.() : backToLiveList(...args)
    });
    const actions = { ...replay, ...player, ...tools };
    const { getPerpendicularVideoScale, updateClipUI, ...publicActions } = actions;
    Object.assign(window, publicActions);
    return actions;
}
