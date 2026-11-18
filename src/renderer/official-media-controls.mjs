function parseMusicLrc(text) {
    const lines = String(text || '').split(/\r?\n/);
    const entries = [];
    const timeReg = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

    lines.forEach(rawLine => {
        const line = rawLine.replace(/\uFEFF/g, '');
        if (!line.trim()) return;
        if (/^\[(ti|ar|al|offset|tool|by|length):/i.test(line.trim())) return;

        const matches = [...line.matchAll(timeReg)];
        if (!matches.length) return;
        const content = line.replace(timeReg, '').trim();
        if (!content) return;
        if (window.YayaRendererUtils.isLyricCreditLine(content)) return;

        matches.forEach(match => {
            const min = Number(match[1] || 0);
            const sec = Number(match[2] || 0);
            const fractionRaw = match[3] || '0';
            const fraction = fractionRaw.length === 3 ? Number(fractionRaw) / 1000 : Number(fractionRaw) / 100;
            entries.push({
                time: min * 60 + sec + fraction,
                text: content
            });
        });
    });

    return entries.sort((a, b) => a.time - b.time);
}

export function installOfficialMedia({
    MUSIC_LYRICS_BASE_URL, MUSIC_LYRICS_INDEX_URL, escapeHtml, fetchPocketAPI, showToast,
    getCurrentViewMode, getCurrentViewName, getCurrentPlayingVideo, getPlaybackViewToken
}) {
    const factories = window.YayaRendererFeatures;
    const lyrics = factories.createMusicLyricsFeature({
        MUSIC_LYRICS_BASE_URL, MUSIC_LYRICS_INDEX_URL, escapeHtml, parseMusicLrc
    });
    const media = factories.createOfficialMediaFeature({
        ...lyrics, escapeHtml, fetchPocketAPI, showToast,
        getCurrentViewMode, getCurrentViewName, getCurrentPlayingVideo, getPlaybackViewToken
    });

    const {
        fetchAllMusicLibrary, fetchAllVideoLibrary, initMusicScrollListener, initVideoScrollListener, loadAudioPrograms, stopAudioProgram, ...publicControls
    } = media;
    Object.assign(window, publicControls, {
        toggleMusicLyricsPanel: lyrics.toggleMusicLyricsPanel,
        seekMusicLyricLine: lyrics.seekMusicLyricLine
    });
    return media;
}
