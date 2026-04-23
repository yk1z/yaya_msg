const axios = require('axios');

const BILIBILI_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    Referer: 'https://live.bilibili.com/',
    Origin: 'https://live.bilibili.com'
};

function normalizeRoomId(input) {
    const digits = String(input || '').trim().replace(/[^\d]/g, '');
    if (!digits) {
        throw new Error('请输入有效的 B 站直播间号');
    }
    return digits;
}

async function requestBilibili(url, params) {
    const response = await axios.get(url, {
        params,
        headers: BILIBILI_HEADERS,
        timeout: 15000
    });
    return response.data;
}

function buildCandidateUrl(codec = {}) {
    const baseUrl = String(codec.base_url || '').trim();
    if (!baseUrl) return [];

    return (codec.url_info || [])
        .map(info => {
            const host = String(info.host || '').trim();
            const extra = String(info.extra || '').trim();
            if (!host) return null;
            return {
                url: `${host}${baseUrl}${extra}`,
                formatName: codec.__formatName || '',
                codecName: codec.codec_name || '',
                currentQn: Number(codec.current_qn || 0),
                acceptQn: Array.isArray(codec.accept_qn) ? codec.accept_qn.map(item => Number(item || 0)) : []
            };
        })
        .filter(Boolean);
}

function pickBestLiveUrl(playurl = {}) {
    const candidates = [];

    (playurl.stream || []).forEach(stream => {
        (stream.format || []).forEach(format => {
            (format.codec || []).forEach(codec => {
                const codecWithFormat = {
                    ...codec,
                    __formatName: format.format_name || ''
                };
                candidates.push(...buildCandidateUrl(codecWithFormat));
            });
        });
    });

    if (!candidates.length) return null;

    const scoreCandidate = candidate => {
        let score = 0;
        if (candidate.formatName === 'flv') score += 1000;
        else if (candidate.formatName === 'fmp4') score += 600;

        if (candidate.codecName === 'avc') score += 100;
        else if (candidate.codecName === 'hevc') score += 60;

        score += candidate.currentQn || 0;
        if (candidate.acceptQn.includes(10000)) score += 20;
        return score;
    };

    candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    return candidates[0].url;
}

async function getBilibiliLiveStatus(roomIdInput) {
    const roomId = normalizeRoomId(roomIdInput);

    try {
        const initData = await requestBilibili('https://api.live.bilibili.com/room/v1/Room/room_init', {
            id: roomId
        });

        if (initData?.code !== 0 || !initData?.data?.room_id) {
            return {
                requestedRoomId: roomId,
                realRoomId: '',
                live: false,
                liveStatus: 0,
                error: initData?.message || '未找到直播间'
            };
        }

        return {
            requestedRoomId: roomId,
            realRoomId: String(initData.data.room_id || roomId),
            live: Number(initData.data.live_status) === 1,
            liveStatus: Number(initData.data.live_status || 0),
            error: ''
        };
    } catch (error) {
        return {
            requestedRoomId: roomId,
            realRoomId: '',
            live: false,
            liveStatus: 0,
            error: error.message || '状态获取失败'
        };
    }
}

async function getBilibiliLiveStatuses(roomIds = []) {
    const normalizedRoomIds = Array.from(
        new Set(
            (Array.isArray(roomIds) ? roomIds : [])
                .map(roomId => {
                    try {
                        return normalizeRoomId(roomId);
                    } catch (error) {
                        return '';
                    }
                })
                .filter(Boolean)
        )
    );

    const results = await Promise.all(normalizedRoomIds.map(roomId => getBilibiliLiveStatus(roomId)));
    return results;
}

async function resolveBilibiliLive(roomIdInput) {
    const roomId = normalizeRoomId(roomIdInput);

    const initData = await requestBilibili('https://api.live.bilibili.com/room/v1/Room/room_init', {
        id: roomId
    });

    if (initData?.code !== 0 || !initData?.data?.room_id) {
        throw new Error(initData?.message || '未找到对应的 B 站直播间');
    }

    const realRoomId = String(initData.data.room_id);
    if (Number(initData.data.live_status) !== 1) {
        throw new Error('该直播间当前未开播');
    }

    const playInfo = await requestBilibili(
        'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo',
        {
            room_id: realRoomId,
            protocol: '0,1',
            format: '0,1,2',
            codec: '0,1',
            qn: 10000,
            platform: 'web',
            ptype: 8
        }
    );

    if (playInfo?.code !== 0 || !playInfo?.data) {
        throw new Error(playInfo?.message || '获取 B 站直播流失败');
    }

    const streamUrl = pickBestLiveUrl(playInfo.data.playurl_info?.playurl);
    if (!streamUrl) {
        throw new Error('未找到可用的直播播放地址');
    }

    const roomInfo = playInfo.data.room_info || {};
    const anchorInfo = playInfo.data.anchor_info?.base_info || {};

    return {
        requestedRoomId: roomId,
        realRoomId,
        title: String(roomInfo.title || '').trim() || `B站直播 ${realRoomId}`,
        uname: String(anchorInfo.uname || roomInfo.uname || '').trim(),
        face: String(anchorInfo.face || '').trim(),
        areaName: String(roomInfo.area_name || '').trim(),
        parentAreaName: String(roomInfo.parent_area_name || '').trim(),
        streamUrl,
        proxyHeaders: {
            'User-Agent': BILIBILI_HEADERS['User-Agent'],
            Referer: `https://live.bilibili.com/${realRoomId}`,
            Origin: BILIBILI_HEADERS.Origin
        }
    };
}

module.exports = {
    resolveBilibiliLive,
    getBilibiliLiveStatuses
};
