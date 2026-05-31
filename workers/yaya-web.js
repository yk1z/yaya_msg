const APP_VERSION = '7.0.41';
const APP_BUILD = '24011601';
const DEFAULT_API_BACKEND = 'https://api.gnz.hk';
const DESKTOP_DOWNLOAD_FILE = 'yaya_msg-v2.4-win.zip';
const MEET48_APP_VERSION = '2.0.3';
const MEET48_APP_BUILD = '2602062';
const MEET48_BUNDLE_ID = 'com.dapp.meet48';
const MEET48_APP_ID = '2e63a31eac9d056755b0f83b89ef6674';
const R2_MUSIC_LIST_CACHE_TTL_SECONDS = 6 * 60 * 60;
const R2_MUSIC_LIST_CACHE_TTL_MS = R2_MUSIC_LIST_CACHE_TTL_SECONDS * 1000;
let deviceId = '';
let r2MusicListCache = null;

const pocketChannels = {
    'login-send-sms': loginSendSms,
    'login-by-code': loginByCode,
    'login-check-token': loginCheckToken,
    'pocket-checkin': checkIn,
    'switch-big-small': switchBigSmall,
    'fetch-room-messages': fetchRoomMessages,
    'fetch-private-message-list': fetchPrivateMessageList,
    'fetch-private-message-info': fetchPrivateMessageInfo,
    'send-private-message-reply': sendPrivateMessageReply,
    'fetch-flip-list': fetchFlipList,
    'fetch-star-archives': fetchStarArchives,
    'fetch-star-history': fetchStarHistory,
    'fetch-open-live': fetchOpenLive,
    'fetch-open-live-one': fetchOpenLiveOne,
    'fetch-open-live-public-list': fetchOpenLivePublicList,
    'fetch-meet48-live-list': fetchMeet48LiveList,
    'fetch-meet48-live-one': fetchMeet48LiveOne,
    'fetch-open-live-participants': fetchOpenLiveParticipants,
    'fetch-flip-prices': fetchFlipPrices,
    'send-flip-question': sendFlipQuestion,
    'operate-flip-question': operateFlipQuestion,
    'fetch-member-photos': fetchMemberPhotos,
    'fetch-user-money': fetchUserMoney,
    'fetch-checkin-today': fetchCheckinToday,
    'fetch-unread-message-count': fetchUnreadMessageCount,
    'edit-user-info': editUserInfo,
    'upload-user-avatar': uploadUserAvatar,
    'fetch-user-rename-count': fetchUserRenameCount,
    'fetch-user-picture-frames': fetchUserPictureFrames,
    'fetch-client-group-team-star-update': fetchClientGroupTeamStarUpdate,
    'fetch-star-server-map': fetchStarServerMap,
    'fetch-media-collection-total-count': fetchMediaCollectionTotalCount,
    'send-live-gift': sendLiveGift,
    'fetch-gift-list': fetchGiftList,
    'get-nim-login-info': getNimLoginInfo,
    'fetch-room-album': fetchRoomAlbum,
    'fetch-room-radio': fetchRoomRadio,
    'fetch-live-rank': fetchLiveRank,
    'fetch-friends-ids': fetchFriendsIds,
    'fetch-last-messages': fetchLastMessages,
    'follow-member': followMember,
    'unfollow-member': unfollowMember,
    'fetch-live-list': fetchLiveList,
    'fetch-live-one': fetchLiveOne,
    'fetch-live-result': fetchLiveResult,
    'fetch-trip-list': fetchTripList,
    'fetch-album-list': fetchAlbumList,
    'fetch-melee-week-rank': fetchMeleeWeekRank,
    'fetch-melee-rank-page': fetchMeleeRankPage,
    'fetch-melee-year-rank-page': fetchMeleeYearRankPage,
    'fetch-person-melee-rank-page': fetchPersonMeleeRankPage,
    'fetch-post-image-list': fetchPostImageList,
    'fetch-chatroom-homeowner-messages': fetchChatroomHomeownerMessages,
    'fetch-member-weibo': fetchMemberWeiboMessages,
    'fetch-member-dynamic': fetchMemberDynamicMessages,
    'fetch-conversation-page': fetchConversationPage,
    'fetch-user-home-info': fetchUserHomeInfo,
    'fetch-flip-custom-index-v1': fetchFlipCustomIndexV1,
    'score-vote-login': loginElectionVote,
    'score-vote-status': fetchElectionVoteStatus,
    'score-act-status': fetchElectionActStatus,
    'score-userinfo': fetchElectionUserInfo,
    'score-vote-history': fetchElectionVoteHistory,
    'score-code-act-history': fetchElectionCodeActHistory,
    'score-check-sg-bind': fetchElectionSgBindStatus,
    'score-bind-sg': bindElectionSg,
    'score-rare-treasure-list': fetchPageantryRareTreasures,
    'score-buy-star-list': fetchPageantryBuyStarList,
    'fetch-score-official-bundle': fetchScoreOfficialBundle,
    'score-official-action': runScoreOfficialAction
};

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.protocol === 'http:' && !url.pathname.startsWith('/api/')) {
            url.protocol = 'https:';
            return Response.redirect(url.toString(), 301);
        }
        if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
            url.pathname = url.pathname.replace(/\/+$/, '');
            return Response.redirect(url.toString(), 301);
        }

        if (url.pathname === '/api/r2-music') {
            return handleR2MusicListRequest(request, env, url);
        }

        if (url.pathname === '/r2-music' || url.pathname.startsWith('/r2-music/')) {
            return handleR2MusicObjectRequest(request, env, url);
        }

        if (url.pathname === '/api/ipc') {
            const apiBackend = getApiBackend(env);
            if (apiBackend && await shouldProxyIpcToBackend(request)) {
                return proxyApiRequest(request, apiBackend);
            }
            return handleIpc(request, env);
        }

        const apiBackend = getApiBackend(env);
        if (apiBackend && isPocketBackendApiPath(url.pathname)) {
            return proxyApiRequest(request, apiBackend);
        }

        if (apiBackend && url.pathname.startsWith('/api/')) {
            return proxyApiRequest(request, apiBackend);
        }

        if (url.pathname === '/web-media-proxy') {
            return handleMediaProxy(request);
        }

        if (url.pathname === '/report' || url.pathname.startsWith('/report/')) {
            return handleReportRequest(request, env, url);
        }

        if (url.pathname === '/downloads' || url.pathname.startsWith('/downloads/')) {
            return handleDownloadRequest(request, env, url);
        }

        if (url.pathname === '/api/health') {
            return json({ success: true, runtime: 'cloudflare-workers' });
        }

        if (url.pathname === '/api/pocket') {
            return handlePocketProxy(request);
        }

        if (url.pathname === '/api/text-proxy') {
            return handleTextProxy(request);
        }

        return withWebRuntimeHeaders(await fetchWebAsset(request, env, url), url);
    }
};

async function fetchWebAsset(request, env, url) {
    const nestedAssetResponse = await fetchNestedRouteAsset(request, env, url);
    if (nestedAssetResponse) return nestedAssetResponse;

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    const path = url.pathname || '/';
    const looksLikeFile = /\/[^/]+\.[^/]+$/.test(path);
    if (looksLikeFile) return assetResponse;

    if (isWebAppRoute(url.pathname)) {
        return fetchIndexAsset(request, env);
    }

    return fetchIndexAsset(request, env);
}

async function handleReportRequest(request, env, url) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return textResponse('Method Not Allowed', 405);
    }
    if (!env.YAYA_DOWNLOADS) {
        return textResponse('Report storage is not configured', 500);
    }

    const requestedName = decodeURIComponent(url.pathname.replace(/^\/report\/?/, '') || '')
        .replace(/^\/+/, '');
    if (!requestedName) {
        return textResponse('Report not found', 404);
    }
    if (requestedName.includes('..') || requestedName.includes('\\')) {
        return textResponse('Invalid report path', 400);
    }

    const fileName = requestedName.endsWith('.html') ? requestedName : `${requestedName}.html`;
    const object = await env.YAYA_DOWNLOADS.get(`reports/${fileName}`);
    if (!object) {
        return textResponse('Report not found', 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Content-Type', 'text/html;charset=utf-8');
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName.split('/').pop() || 'report.html')}"`);
    headers.set('Cache-Control', 'no-cache');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(request.method === 'HEAD' ? null : object.body, { headers });
}

function fetchIndexAsset(request, env) {
    const indexUrl = new URL(request.url);
    indexUrl.pathname = '/';
    indexUrl.search = '';
    return env.ASSETS.fetch(new Request(indexUrl, request));
}

function isWebAppRoute(pathname) {
    const slug = decodeURIComponent(String(pathname || '/'))
        .replace(/^\/+|\/+$/g, '')
        .split('/')[0];
    if (!slug || slug === 'index.html') return true;

    return getWebAppRouteSlugs().has(slug);
}

function getWebAppRouteSlugs() {
    return new Set([
        'home',
        'messages',
        'fetch',
        'live',
        'vod',
        'meet48-live',
        'meet48-vod',
        'replay',
        'room',
        'followed-rooms',
        'message',
        'img',
        'dynamic',
        'weibo',
        'openlive',
        'send-flip',
        'flip',
        'nft',
        'video',
        'music',
        'official-site-music',
        'audio',
        'profile',
        'database',
        'melee',
        'trip',
        'login',
        'settings',
        'voice'
    ]);
}

async function fetchNestedRouteAsset(request, env, url) {
    const parts = decodeURIComponent(String(url.pathname || '/'))
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .filter(Boolean);
    if (parts.length < 2 || !getWebAppRouteSlugs().has(parts[0])) return null;

    const nestedAssetPath = `/${parts.slice(1).join('/')}`;
    const looksLikeFile = /\/[^/]+\.[^/]+$/.test(nestedAssetPath);
    const looksLikeSourceAsset = nestedAssetPath.startsWith('/src/');
    if (!looksLikeFile && !looksLikeSourceAsset) return null;

    const assetUrl = new URL(request.url);
    assetUrl.pathname = nestedAssetPath;
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));
    return response.status === 404 ? null : response;
}

function getApiBackend(env) {
    if (env && Object.prototype.hasOwnProperty.call(env, 'YAYA_API_BACKEND')) {
        const configured = String(env.YAYA_API_BACKEND || '').trim();
        if (!configured || configured === 'local') return '';
        return configured.replace(/\/+$/, '');
    }
    const value = String(DEFAULT_API_BACKEND || '').trim().replace(/\/+$/, '');
    return value || '';
}

function isPocketBackendApiPath(pathname) {
    return pathname === '/api/pocket'
        || pathname === '/api/text-proxy';
}

async function shouldProxyIpcToBackend(request) {
    if (request.method !== 'POST') return false;
    try {
        const body = await request.clone().json();
        return new Set([
            'login-send-sms',
            'login-by-code',
            'login-check-token'
        ]).has(String(body?.channel || ''));
    } catch (error) {
        return false;
    }
}

function proxyApiRequest(request, apiBackend) {
    const sourceUrl = new URL(request.url);
    const targetUrl = new URL(sourceUrl.pathname + sourceUrl.search, apiBackend);
    const headers = new Headers(request.headers);
    headers.delete('host');

    const init = {
        method: request.method,
        headers,
        redirect: 'manual'
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
    }
    return fetch(targetUrl.toString(), init);
}

async function handleDownloadRequest(request, env, url) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json({ success: false, msg: 'Method Not Allowed' }, 405);
    }
    if (!env.YAYA_DOWNLOADS) {
        return new Response('Download storage is not configured', { status: 500 });
    }

    const requestedKey = decodeURIComponent(url.pathname.replace(/^\/downloads\/?/, '') || DESKTOP_DOWNLOAD_FILE)
        .replace(/^\/+/, '');
    if (!requestedKey || requestedKey.includes('..') || requestedKey.includes('\\')) {
        return new Response('Invalid download path', { status: 400 });
    }

    const resolvedKey = requestedKey;
    const rangeHeader = request.headers.get('range');
    const getOptions = rangeHeader ? { range: request.headers } : undefined;
    const object = await env.YAYA_DOWNLOADS.get(resolvedKey, getOptions);
    if (!object) {
        return new Response('File not found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=3600');
    headers.set('Content-Type', headers.get('Content-Type') || getDownloadContentType(resolvedKey));
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(resolvedKey.split('/').pop() || DESKTOP_DOWNLOAD_FILE)}"`);
    const isRangeResponse = Boolean(rangeHeader && object.range);
    if (isRangeResponse) {
        headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.end ?? object.size - 1}/${object.size}`);
        headers.set('Content-Length', String((object.range.end ?? object.size - 1) - object.range.offset + 1));
    } else {
        headers.set('Content-Length', String(object.size));
    }

    return new Response(request.method === 'HEAD' ? null : object.body, {
        status: isRangeResponse ? 206 : 200,
        headers
    });
}

function getDownloadContentType(key) {
    const lowered = String(key || '').toLowerCase();
    if (lowered.endsWith('.tar.gz') || lowered.endsWith('.tgz')) return 'application/gzip';
    if (lowered.endsWith('.zip')) return 'application/zip';
    return 'application/octet-stream';
}

const R2_MUSIC_PREFIXES = ['SNH48/', 'GNZ48/', 'BEJ48/', 'CKG48/', 'CGT48/', 'SHY48/', 'TSH48/'];
const R2_AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus']);
const R2_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const R2_MUSIC_IMAGE_CACHE_SECONDS = 30 * 24 * 60 * 60;

function getR2MusicCorsHeaders(extraHeaders = {}) {
    const headers = new Headers(extraHeaders);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range, Cache-Control, Content-Type');
    headers.set('Access-Control-Expose-Headers', 'X-Yaya-Cache, Content-Length, Content-Range, Accept-Ranges, ETag, Content-Type');
    return headers;
}

function r2MusicOptionsResponse() {
    return new Response(null, {
        status: 204,
        headers: getR2MusicCorsHeaders({ 'Cache-Control': 'no-store' })
    });
}

function getR2ObjectExtension(key) {
    const file = String(key || '').split('/').pop() || '';
    const match = file.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
}

function isAllowedR2MusicKey(key) {
    const normalizedKey = String(key || '').replace(/^\/+/, '');
    return normalizedKey
        && !normalizedKey.includes('..')
        && !normalizedKey.includes('\\')
        && R2_MUSIC_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix));
}

function getR2MusicContentType(key, fallback = '') {
    const ext = getR2ObjectExtension(key);
    if (fallback) return fallback;
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'm4a' || ext === 'aac') return 'audio/mp4';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'flac') return 'audio/flac';
    if (ext === 'ogg' || ext === 'opus') return 'audio/ogg';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return 'application/octet-stream';
}

function encodeR2MusicPath(key) {
    return String(key || '').split('/').map(encodeURIComponent).join('/');
}

function parseR2MusicTitle(key) {
    const file = String(key || '').split('/').pop() || '';
    return file
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/^\s*\d{1,3}\s*[._\-、\]\)]\s*/u, '')
        .replace(/^\s*[\[\(（]\s*\d{1,3}\s*[\]\)）]\s*/u, '')
        .replace(/_\d{1,3}$/u, '')
        .trim() || file;
}

function getR2MusicAlbum(key) {
    const parts = String(key || '').split('/').filter(Boolean);
    if (parts.length <= 2) return '';
    return parts.slice(1, -1).join(' / ');
}

function getR2MusicGroupInfo(key) {
    const folder = String(key || '').split('/').filter(Boolean)[0] || '';
    const label = folder || '公演';
    return {
        groupLabel: label,
        groupKey: label.replace(/48$/i, '').toUpperCase() || label.toUpperCase()
    };
}

async function listR2MusicObjects(env) {
    const objects = [];
    for (const prefix of R2_MUSIC_PREFIXES) {
        let cursor = undefined;
        do {
            const listed = await env.YAYA_DOWNLOADS.list({ prefix, cursor, limit: 1000 });
            objects.push(...(listed.objects || []));
            cursor = listed.truncated ? listed.cursor : undefined;
        } while (cursor);
    }
    return objects;
}

async function handleR2MusicListRequest(request, env) {
    if (request.method === 'OPTIONS') {
        return r2MusicOptionsResponse();
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(JSON.stringify({ success: false, msg: 'Method Not Allowed', tracks: [] }), {
            status: 405,
            headers: getR2MusicCorsHeaders({
                'Content-Type': 'application/json;charset=utf-8',
                'Cache-Control': 'no-store'
            })
        });
    }
    if (!env.YAYA_DOWNLOADS || typeof env.YAYA_DOWNLOADS.list !== 'function') {
        return new Response(JSON.stringify({ success: false, msg: 'Music storage is not configured', tracks: [] }), {
            status: 500,
            headers: getR2MusicCorsHeaders({
                'Content-Type': 'application/json;charset=utf-8',
                'Cache-Control': 'no-store'
            })
        });
    }

    const bypassCache = /\bno-cache\b/i.test(request.headers.get('Cache-Control') || '');
    const now = Date.now();
    if (!bypassCache && r2MusicListCache && r2MusicListCache.expiresAt > now) {
        return new Response(r2MusicListCache.body, {
            headers: getR2MusicCorsHeaders({
                'Content-Type': 'application/json;charset=utf-8',
                'Cache-Control': `public, max-age=${R2_MUSIC_LIST_CACHE_TTL_SECONDS}`,
                'X-Yaya-Cache': 'HIT'
            })
        });
    }
    const edgeCache = typeof caches !== 'undefined' ? caches.default : null;
    const edgeCacheKey = new Request(new URL('/api/r2-music-cache-v1', request.url).toString(), { method: 'GET' });
    if (!bypassCache && edgeCache) {
        const cached = await edgeCache.match(edgeCacheKey);
        if (cached) {
            const body = await cached.text();
            r2MusicListCache = {
                body,
                expiresAt: now + R2_MUSIC_LIST_CACHE_TTL_MS
            };
            return new Response(body, {
                headers: getR2MusicCorsHeaders({
                    'Content-Type': 'application/json;charset=utf-8',
                    'Cache-Control': `public, max-age=${R2_MUSIC_LIST_CACHE_TTL_SECONDS}`,
                    'X-Yaya-Cache': 'HIT'
                })
            });
        }
    }

    const objects = await listR2MusicObjects(env);
    const imageByFolder = new Map();
    objects.forEach((object) => {
        const key = object.key || '';
        const ext = getR2ObjectExtension(key);
        if (!R2_IMAGE_EXTENSIONS.has(ext)) return;
        const folder = key.split('/').slice(0, -1).join('/');
        const current = imageByFolder.get(folder);
        const file = key.split('/').pop() || '';
        const isPreferred = /^(cover|folder|front|封面)\./i.test(file);
        if (!current || isPreferred) imageByFolder.set(folder, key);
    });

    const tracks = objects
        .filter((object) => R2_AUDIO_EXTENSIONS.has(getR2ObjectExtension(object.key || '')))
        .map((object, index) => {
            const key = object.key || '';
            const folder = key.split('/').slice(0, -1).join('/');
            const group = getR2MusicGroupInfo(key);
            const coverKey = imageByFolder.get(folder) || imageByFolder.get(key.split('/')[0]) || '';
            return {
                id: `R2-${key}`,
                key,
                title: parseR2MusicTitle(key),
                album: getR2MusicAlbum(key),
                groupKey: group.groupKey,
                groupLabel: group.groupLabel,
                mp3: `/r2-music/${encodeR2MusicPath(key)}`,
                coverUrl: coverKey ? `/r2-music/${encodeR2MusicPath(coverKey)}` : '',
                size: object.size || 0,
                uploaded: object.uploaded ? object.uploaded.toISOString() : '',
                sourceIndex: 100000 + index,
                source: 'r2-performance'
            };
        });

    const body = JSON.stringify({ success: true, tracks });
    r2MusicListCache = {
        body,
        expiresAt: now + R2_MUSIC_LIST_CACHE_TTL_MS
    };
    const response = new Response(body, {
        headers: getR2MusicCorsHeaders({
            'Content-Type': 'application/json;charset=utf-8',
            'Cache-Control': `public, max-age=${R2_MUSIC_LIST_CACHE_TTL_SECONDS}`,
            'X-Yaya-Cache': 'MISS'
        })
    });
    if (edgeCache) {
        await edgeCache.put(edgeCacheKey, response.clone());
    }
    return response;
}

async function handleR2MusicObjectRequest(request, env, url) {
    if (request.method === 'OPTIONS') {
        return r2MusicOptionsResponse();
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', {
            status: 405,
            headers: getR2MusicCorsHeaders({
                'Content-Type': 'text/plain;charset=utf-8',
                'Cache-Control': 'no-store'
            })
        });
    }
    if (!env.YAYA_DOWNLOADS) {
        return new Response('Music storage is not configured', {
            status: 500,
            headers: getR2MusicCorsHeaders({
                'Content-Type': 'text/plain;charset=utf-8',
                'Cache-Control': 'no-store'
            })
        });
    }

    const key = decodeURIComponent(url.pathname.replace(/^\/r2-music\/?/, '')).replace(/^\/+/, '');
    const ext = getR2ObjectExtension(key);
    if (!isAllowedR2MusicKey(key) || (!R2_AUDIO_EXTENSIONS.has(ext) && !R2_IMAGE_EXTENSIONS.has(ext))) {
        return new Response('Invalid music path', {
            status: 400,
            headers: getR2MusicCorsHeaders({
                'Content-Type': 'text/plain;charset=utf-8',
                'Cache-Control': 'no-store'
            })
        });
    }

    const object = await env.YAYA_DOWNLOADS.get(key, { range: request.headers });
    if (!object) {
        return new Response('File not found', {
            status: 404,
            headers: getR2MusicCorsHeaders({
                'Content-Type': 'text/plain;charset=utf-8',
                'Cache-Control': 'no-store'
            })
        });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', R2_IMAGE_EXTENSIONS.has(ext)
        ? `public, max-age=${R2_MUSIC_IMAGE_CACHE_SECONDS}, immutable`
        : 'no-store');
    headers.set('Content-Type', getR2MusicContentType(key, headers.get('Content-Type') || ''));
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(key.split('/').pop() || 'music')}"`);
    if (object.range) {
        const offset = Number(object.range.offset) || 0;
        const length = Number(object.range.length);
        const end = Number.isFinite(Number(object.range.end))
            ? Number(object.range.end)
            : (Number.isFinite(length) && length > 0 ? offset + length - 1 : object.size - 1);
        headers.set('Content-Range', `bytes ${offset}-${Math.min(end, object.size - 1)}/${object.size}`);
    }

    return new Response(request.method === 'HEAD' ? null : object.body, {
        status: object.range ? 206 : 200,
        headers: getR2MusicCorsHeaders(headers)
    });
}

function withWebRuntimeHeaders(response, url = null) {
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    if (url) {
        const contentType = headers.get('content-type') || '';
        if (url.searchParams.has('v')) {
            headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (contentType.includes('text/html')) {
            headers.set('Cache-Control', 'no-cache');
        } else if (/\.(?:png|ico|svg|webp|wasm)$/i.test(url.pathname)) {
            headers.set('Cache-Control', 'public, max-age=86400');
        }
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

async function handleIpc(request, env) {
    if (request.method !== 'POST') {
        return json({ success: false, msg: 'Method Not Allowed' }, 405);
    }

    try {
        const body = await request.json();
        const channel = String(body?.channel || '');
        const handler = pocketChannels[channel];
        if (!handler) {
            return json({ success: false, msg: `网页版暂不支持: ${channel}` }, 404);
        }

        const result = await handler(body?.payload || {}, env);
        return json(result);
    } catch (error) {
        return json({ success: false, msg: error?.message || 'API 错误' }, 500);
    }
}

async function handlePocketProxy(request) {
    if (request.method !== 'POST') {
        return json({ status: 405, message: 'Method Not Allowed', content: {} }, 405);
    }

    try {
        const body = await request.json();
        const apiPath = normalizePocketPath(body?.path);
        const postData = normalizePostData(body?.postData);
        const response = await fetch(`https://pocketapi.48.cn${apiPath}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
                'User-Agent': 'PocketFans201807/7.1.35 (iPhone; iOS 16.3; Scale/3.00)',
                'Accept-Language': 'zh-Hans-CN;q=1',
                appInfo: JSON.stringify({
                    vendor: 'apple',
                    deviceId: createDeviceId(),
                    appVersion: '7.1.35',
                    appBuild: '25101021',
                    osVersion: '16.3.0',
                    osType: 'ios',
                    deviceName: 'iPhone 14 Pro',
                    os: 'ios'
                })
            },
            body: JSON.stringify(postData)
        });

        const text = await response.text();
        return new Response(text || '{"status":500,"content":{}}', {
            status: response.ok ? 200 : response.status,
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
                'Cache-Control': 'no-store'
            }
        });
    } catch (error) {
        return json({ status: 500, message: error?.message || 'Pocket API 请求失败', content: {} }, 500);
    }
}

async function handleTextProxy(request) {
    if (request.method !== 'GET') {
        return textResponse('Method Not Allowed', 405);
    }

    const requestUrl = new URL(request.url);
    const targetValue = requestUrl.searchParams.get('url') || '';

    let targetUrl;
    try {
        targetUrl = new URL(targetValue);
    } catch (error) {
        return textResponse('Bad Request', 400);
    }

    const allowedHosts = new Set([
        'source.48.cn',
        'source2.48.cn'
    ]);

    if (targetUrl.protocol !== 'https:' || !allowedHosts.has(targetUrl.hostname)) {
        return textResponse('Forbidden', 403);
    }

    try {
        const response = await fetch(targetUrl.toString(), {
            headers: {
                'User-Agent': 'PocketFans201807/7.1.35 (iPhone; iOS 16.3; Scale/3.00)',
                'Accept': 'text/plain,*/*'
            }
        });

        const text = await response.text();
        return new Response(text, {
            status: response.status,
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
                'Cache-Control': 'no-store'
            }
        });
    } catch (error) {
        return textResponse(error?.message || 'Proxy Error', 502);
    }
}

async function handleMediaProxy(request) {
    if (request.method !== 'GET') {
        return textResponse('Method Not Allowed', 405);
    }

    const requestUrl = new URL(request.url);
    const targetValue = requestUrl.searchParams.get('url') || '';
    let targetUrl;
    try {
        targetUrl = new URL(targetValue);
    } catch (error) {
        return textResponse('Bad Request', 400);
    }

    const hostname = targetUrl.hostname.toLowerCase();
    const isAllowedHost = hostname === 'source.48.cn'
        || hostname === 'source2.48.cn'
        || hostname.endsWith('.48.cn');
    if (!['http:', 'https:'].includes(targetUrl.protocol) || !isAllowedHost) {
        return textResponse('Forbidden', 403);
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 PocketFans201807/7.1.35',
        'Accept': '*/*',
        'Referer': 'https://h5.48.cn/'
    };
    const range = request.headers.get('range');
    if (range) headers.Range = range;

    try {
        const response = await fetch(targetUrl.toString(), { headers });
        const responseHeaders = new Headers();
        const passthroughHeaders = [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'last-modified',
            'etag'
        ];
        for (const key of passthroughHeaders) {
            const value = response.headers.get(key);
            if (value) responseHeaders.set(key, value);
        }
        if (!responseHeaders.has('content-type')) {
            responseHeaders.set('content-type', 'application/octet-stream');
        }
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Cache-Control', 'no-store');
        return new Response(response.body, {
            status: response.status,
            headers: responseHeaders
        });
    } catch (error) {
        return textResponse(error?.message || 'Proxy Error', 502);
    }
}

function normalizePocketPath(value) {
    const apiPath = String(value || '').trim();
    if (!apiPath.startsWith('/') || apiPath.includes('://') || apiPath.includes('..')) {
        throw new Error('无效的 Pocket API 路径');
    }
    return apiPath;
}

function normalizePostData(value) {
    if (value && typeof value === 'object') {
        return value;
    }
    try {
        const parsed = JSON.parse(String(value || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        return {};
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json;charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function textResponse(text, status = 200) {
    return new Response(text, {
        status,
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function createDeviceId() {
    if (globalThis.crypto?.randomUUID) {
        return crypto.randomUUID().toUpperCase();
    }
    return 'WEB-' + Math.random().toString(36).slice(2).toUpperCase();
}

function getDeviceId() {
    if (!deviceId) {
        deviceId = createDeviceId();
    }
    return deviceId;
}

function createHeaders(token, pa) {
    const headers = {
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': `PocketFans201807/${APP_VERSION} (iPhone; iOS 16.3.1; Scale/2.00)`,
        'Accept-Language': 'zh-Hans-CN;q=1',
        appInfo: JSON.stringify({
            vendor: 'apple',
            deviceId: getDeviceId(),
            appVersion: APP_VERSION,
            appBuild: APP_BUILD,
            osVersion: '16.3.1',
            osType: 'ios',
            deviceName: 'iPhone XR',
            os: 'ios'
        })
    };
    if (token) headers.token = token;
    if (pa) headers.pa = pa;
    return headers;
}

function createModernHeaders(token, pa) {
    const headers = createHeaders(token, pa);
    headers.appInfo = JSON.stringify({
        vendor: 'apple',
        deviceId: '7B93DFD0-472F-4736-A628-E85FAE086486',
        appVersion: '7.1.35',
        appBuild: '25101021',
        osVersion: '16.3.0',
        osType: 'ios',
        deviceName: 'iPhone 14 Pro',
        os: 'ios'
    });
    headers['User-Agent'] = 'PocketFans201807/7.1.35 (iPhone; iOS 16.3; Scale/3.00)';
    return headers;
}

function createCheckinHeaders(token, pa) {
    return { ...createModernHeaders(token, pa), 'P-Sign-Type': 'V0' };
}

function createWeiboHeaders(token, pa) {
    const headers = createModernHeaders(token, pa);
    headers.appInfo = JSON.stringify({
        vendor: 'apple',
        deviceId: '7B93DFD0-472F-4736-A628-E85FAE086487',
        appVersion: '7.1.38',
        appBuild: '26042402',
        osVersion: '26.5.0',
        osType: 'ios',
        deviceName: 'iPhone17,1',
        os: 'ios'
    });
    headers['User-Agent'] = 'PocketFans201807/7.1.38 (iPhone; iOS 26.5; Scale/3.00)';
    headers['P-Sign-Type'] = 'V0';
    return headers;
}

function createPfileHeaders(token, pa) {
    const headers = createModernHeaders(token, pa);
    delete headers['Content-Type'];
    delete headers.Host;
    return headers;
}

function getElectionVoteToken(payload = {}) {
    return String(
        payload.voteToken
        || payload.electionToken
        || payload.authToken
        || payload.bearerToken
        || payload.authorization
        || payload.electionAuthorization
        || ''
    ).replace(/^Bearer\s+/i, '').trim();
}

function getElectionAppToken(payload = {}) {
    return String(payload.appToken || payload.pocketToken || payload.token || '').trim();
}

function createElectionVoteHeaders(payload = {}, options = {}) {
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://ceremony.ckg48.com',
        Referer: 'https://ceremony.ckg48.com/',
        Host: 'voteapi.48.cn',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
    };
    if (options.appToken) {
        const appToken = getElectionAppToken(payload);
        if (appToken) headers['X-APP-TOKEN'] = appToken;
    }
    if (options.auth !== false) {
        const voteToken = getElectionVoteToken(payload);
        if (voteToken) headers.Authorization = `Bearer ${voteToken}`;
    }
    return headers;
}

function createPageantryHeaders(token, pa) {
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json, text/plain, */*',
        Origin: 'http://h5.snh48.com',
        Referer: 'http://h5.snh48.com/',
        Host: 'pocketapi.48.cn',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        appInfo: encodeURIComponent(JSON.stringify({
            build: '26042402',
            phoneSystemVersion: 'iOS',
            schema: 'com.DuYi.SNH48',
            appName: 'pocket48',
            IMEI: '7B93DFD0-472F-4736-A628-E85FAE086487',
            osType: 'ios',
            version: '7.1.38',
            phoneName: 'iPhone17,1'
        }))
    };
    if (token) headers.token = token;
    if (pa) headers.pa = pa;
    return headers;
}

function normalizeMeet48ClientAuth(auth) {
    if (!auth || typeof auth !== 'object' || Array.isArray(auth)) {
        return {};
    }

    return {
        token: String(auth.token || '').trim(),
        cookie: String(auth.cookie || '').trim(),
        deviceId: String(auth.deviceId || '').trim()
    };
}

function createMeet48Headers(env = {}, auth = {}) {
    const clientAuth = normalizeMeet48ClientAuth(auth);
    const meetDeviceId = clientAuth.deviceId || env.MEET48_DEVICE_ID || createDeviceId();
    const headers = {
        'content-type': 'application/json',
        accept: '*/*',
        'accept-language': 'zh_TW',
        'user-agent': `Meet48/${MEET48_APP_VERSION} (${MEET48_BUNDLE_ID}; build:${MEET48_APP_BUILD}; iOS 26.4.2) Alamofire/5.8.0`,
        'x-versioncode': MEET48_APP_VERSION,
        'x-app-id': MEET48_APP_ID,
        'x-device-info': JSON.stringify({
            appVersion: MEET48_APP_VERSION,
            deviceId: meetDeviceId,
            osType: 'ios',
            appName: 'Meet48',
            vendor: 'apple',
            osVersion: '26.4.2',
            appBuildId: MEET48_APP_BUILD,
            osLoginType: 'common',
            bundleId: MEET48_BUNDLE_ID,
            deviceName: 'iPhone17,1'
        }),
        'x-web-type': '1',
        'x-deviceid': meetDeviceId,
        'x-custom-device-type': 'IOS'
    };
    const token = clientAuth.token || env.MEET48_TOKEN || '';
    const cookie = clientAuth.cookie || env.MEET48_COOKIE || '';
    if (token) {
        headers.token = token;
    }
    if (cookie) {
        headers.cookie = cookie;
    }
    return headers;
}

function missingToken() {
    return { success: false, msg: '缺少 Token' };
}

function apiError(response, fallback = 'API 错误') {
    return { success: false, msg: response?.data?.message || fallback };
}

async function postPocketContent(url, payload, options = {}) {
    const {
        token,
        pa,
        headersFactory = createHeaders,
        errorMessage = 'API 错误',
        largeNumbers = false
    } = options;
    const response = await postJson(
        url,
        payload || {},
        headersFactory(token, pa),
        { largeNumbers }
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content, data: response.data };
    }
    return apiError(response, errorMessage);
}

function parseJsonPreservingLargeNumbers(text) {
    const fixed = String(text || '').replace(/:\s*([0-9]{15,})/g, ':"$1"');
    return JSON.parse(fixed);
}

async function postJson(url, payload, headers, options = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload || {})
    });
    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = options.largeNumbers ? parseJsonPreservingLargeNumbers(text) : JSON.parse(text);
        } catch (error) {
            const isHtml = /^\s*</.test(text);
            const preview = text.replace(/\s+/g, ' ').slice(0, 160);
            throw new Error(isHtml
                ? `口袋 API 返回了 HTML 页面，可能拦截了 Cloudflare Worker 请求: ${preview}`
                : `口袋 API 返回内容不是 JSON: ${preview}`);
        }
    }
    return { status: response.status, data };
}

async function getText(url, headers) {
    const response = await fetch(url, { headers });
    return response.text();
}

async function resolveServerId(channelId, headers) {
    try {
        const response = await postJson(
            'https://pocketapi.48.cn/im/api/v1/im/team/room/info',
            { channelId: String(channelId) },
            headers
        );
        if (response.data?.success) return response.data.content.serverId;
    } catch (error) {
    }
    return null;
}

async function loginSendSms({ mobile, area, answer }) {
    const payload = { mobile, area: area || '86' };
    if (answer) payload.answer = answer;
    const response = await postJson('https://pocketapi.48.cn/user/api/v1/sms/send2', payload, createHeaders());
    if (response.status === 200 && response.data?.status === 200) return { success: true };
    if (response.data?.status === 2001) {
        try {
            const verificationData = JSON.parse(response.data.message);
            return { success: false, needVerification: true, question: verificationData.question, options: verificationData.answer };
        } catch (error) {
            return { success: false, msg: `验证数据解析失败: ${response.data.message}` };
        }
    }
    return { success: false, msg: response.data?.message || '发送失败' };
}

async function loginByCode({ mobile, code, pa }) {
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/login/app/mobile/code',
        { mobile, code },
        createHeaders(null, pa)
    );
    return response.data;
}

async function loginCheckToken({ token, pa }) {
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/info/reload',
        { from: 'appstart' },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.success) {
        const content = response.data.content;
        const finalInfo = content.userInfo || content;
        if (content.bigSmallInfo) finalInfo.bigSmallInfo = content.bigSmallInfo;
        return { success: true, userInfo: finalInfo };
    }
    return { success: false, msg: response.data?.message || 'Token 无效' };
}

async function checkIn({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson('https://pocketapi.48.cn/user/api/v1/checkin', {}, createCheckinHeaders(token, pa));
    if (response.status === 200 && (response.data?.success || response.data?.status === 200)) {
        return { success: true, msg: response.data.message || '签到成功', content: response.data.content || null };
    }
    return { success: false, msg: response.data?.message || '签到失败', status: response.data?.status };
}

async function switchBigSmall({ token, pa, targetUserId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/bigsmall/switch/user',
        { toUserId: targetUserId },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchRoomMessages({ channelId, serverId, token, pa, nextTime = 0, fetchAll = false }) {
    if (!token) return missingToken();
    const headers = createHeaders(token, pa);
    let finalServerId = serverId;
    if (!finalServerId || finalServerId === 0) {
        finalServerId = await resolveServerId(channelId, headers);
    }
    const response = await postJson(
        fetchAll
            ? 'https://pocketapi.48.cn/im/api/v1/team/message/list/all'
            : 'https://pocketapi.48.cn/im/api/v1/team/message/list/homeowner',
        { channelId: parseInt(channelId, 10), serverId: parseInt(finalServerId, 10), nextTime, limit: 50 },
        headers
    );
    if (response.status === 200 && response.data?.status === 200) {
        return { success: true, data: response.data, usedServerId: finalServerId };
    }
    return apiError(response);
}

async function fetchPrivateMessageList({ token, pa, lastTime }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/message/api/v1/user/message/list',
        { lastTime: Number(lastTime) || Date.now() },
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response, '获取私信列表失败');
}

async function fetchPrivateMessageInfo({ token, pa, targetUserId, lastTime = 0 }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/message/api/v1/user/message/info',
        { lastTime: Number(lastTime) || 0, targetUserId: String(targetUserId) },
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response, '获取私信详情失败');
}

async function sendPrivateMessageReply({ token, pa, targetUserId, text }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/message/api/v1/user/message/reply',
        { messageType: 'TEXT', text: String(text || ''), targetUserId: String(targetUserId) },
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response, '发送私信失败');
}

async function fetchFlipList({ token, pa, beginLimit = 0, limit = 20 }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question/list',
        { status: 0, beginLimit, limit, memberId: '' },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchStarArchives({ token, pa, memberId }) {
    if (!token) return missingToken();
    if (!memberId || memberId === 'undefined') return { success: false, msg: '未获取到有效的成员ID，请重新搜索选择' };
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/star/archives',
        { memberId: Number(memberId) },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchStarHistory({ token, pa, memberId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/star/history',
        { memberId: Number(memberId), limit: 100, lastTime: 0 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchOpenLive({ token, pa, memberId, nextTime }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/chatroom/msg/list/aim/type',
        { extMsgType: 'OPEN_LIVE', roomId: '', ownerId: String(memberId), nextTime: nextTime || 0 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchOpenLiveOne({ token, pa, liveId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/live/api/v1/live/getOpenLiveOne',
        { liveId: String(liveId) },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchOpenLivePublicList({ token, pa, groupId = 0, next = 0, record = false, debug = false }) {
    if (!token) return missingToken();

    const response = await postJson(
        'https://pocketapi.48.cn/live/api/v1/live/getOpenLiveList',
        { groupId, debug: !!debug, next, record: !!record },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchMeet48LiveList({ next = 0, record = false, meet48Auth = null } = {}, env = {}) {
    const response = await postJson(
        'https://meetapi-v2.meet48.xyz/meet48-api/live/api/v1/live/getLiveList',
        { title: null, next: next || 0, record: !!record },
        createMeet48Headers(env, meet48Auth)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.code === 0 || response.data?.success)) {
        return { success: true, content: response.data.content || response.data.data };
    }
    return apiError(response, 'Meet48 API 错误');
}

async function fetchMeet48LiveOne({ liveId, meet48Auth = null }, env = {}) {
    const response = await postJson(
        'https://meetapi-v2.meet48.xyz/meet48-api/live/api/v1/live/getLiveOne',
        { liveId: String(liveId || ''), streamProtocol: 'RTMP' },
        createMeet48Headers(env, meet48Auth)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.code === 0 || response.data?.success)) {
        return { success: true, content: response.data.content || response.data.data };
    }
    return apiError(response, 'Meet48 API 错误');
}

function extractInputValue(html, inputId) {
    const pattern = new RegExp(`<input[^>]+id=["']${inputId}["'][^>]+value=["']([^"']*)["']`, 'i');
    const match = String(html || '').match(pattern);
    return match ? String(match[1] || '').trim() : '';
}

function extractParticipantNames(html) {
    const names = [];
    const matches = String(html || '').matchAll(/<p class="listname">\s*([^<\r\n]+?)\s*(?:<em|<\/p>)/gi);
    for (const match of matches) {
        const name = String(match[1] || '').replace(/\s+/g, ' ').trim();
        if (name && !names.includes(name)) names.push(name);
    }
    return names;
}

async function fetchOpenLiveParticipants({ liveId }) {
    const normalizedLiveId = String(liveId || '').trim();
    if (!normalizedLiveId) return { success: false, msg: '缺少 liveId' };
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36',
        Referer: 'https://live.48.cn/'
    };
    const html = await getText(`https://live.48.cn/Index/inlive/id/${encodeURIComponent(normalizedLiveId)}`, headers);
    const videoId = extractInputValue(html, 'vedio_id');
    const clubId = extractInputValue(html, 'club_id');
    const param = extractInputValue(html, 'param');
    const names = extractParticipantNames(html);
    return { success: true, content: { videoId, clubId, param, names } };
}

async function fetchFlipPrices({ token, pa, memberId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v2/custom/index',
        { memberId: String(memberId) },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function sendFlipQuestion({ token, pa, payload }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question',
        payload,
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, msg: '发送成功' };
    return { success: false, msg: response.data?.message || '发送失败' };
}

async function operateFlipQuestion({ token, pa, questionId, operateType }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/question/operate',
        { questionId: String(questionId), operateType: operateType || 1 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, msg: '操作成功' };
    return apiError(response);
}

async function fetchMemberPhotos({ token, pa, memberId, page, size }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/user/nft/user_nft_list',
        { starId: parseInt(memberId, 10), size: size || 20, page: page || 0 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchUserMoney({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson('https://pocketapi.48.cn/user/api/v1/user/money', { token }, createHeaders(token, pa));
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return { success: false, msg: response.data?.message || '接口返回错误' };
}

async function fetchCheckinToday({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/checkin/check/today',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取签到状态失败');
}

async function fetchUnreadMessageCount({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/message/api/v1/unread/message/num',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取未读消息数失败');
}

async function editUserInfo({ token, pa, key, value }) {
    if (!token) return missingToken();
    if (!key) return { success: false, msg: '缺少修改字段' };
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/info/edit',
        { key, value },
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content, msg: response.data.message };
    }
    return apiError(response, '修改资料失败');
}

async function uploadUserAvatar({ token, pa, fileName, mimeType, dataBase64 }) {
    if (!token) return missingToken();
    const base64Body = String(dataBase64 || '').replace(/^data:[^;,]+;base64,/, '');
    if (!base64Body) return { success: false, msg: '缺少头像图片数据' };

    const binary = Uint8Array.from(atob(base64Body), char => char.charCodeAt(0));
    const finalMimeType = mimeType || 'image/jpeg';
    const finalFileName = fileName || `avatar-${Date.now()}.${finalMimeType.includes('png') ? 'png' : 'jpg'}`;
    const formData = new FormData();
    formData.append('fromType', 'avatar');
    formData.append('file', new Blob([binary], { type: finalMimeType }), finalFileName);

    const response = await fetch('https://pfile.48.cn/filesystem/upload/image', {
        method: 'POST',
        headers: createPfileHeaders(token, pa),
        body: formData
    });
    const data = await response.json();
    if (response.ok && data?.status === 200) {
        const item = Array.isArray(data.content) ? data.content[0] : data.content;
        return { success: true, content: item, path: item?.path || '' };
    }
    return { success: false, msg: data?.message || '上传头像失败' };
}

async function fetchUserRenameCount({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/rename/count',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取改名次数失败');
}

async function fetchUserPictureFrames({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/user/get/picture/frame',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取头像框失败');
}

async function fetchClientGroupTeamStarUpdate({ token, pa, payload }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v1/client/update/group_team_star',
        payload || {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取成员基础数据更新失败');
}

async function fetchStarServerMap({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/team/star/server/map/get',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取成员房间映射失败');
}

async function fetchMediaCollectionTotalCount({ token, pa }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/media/api/media/v1/getCollectionTotalCount',
        {},
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && (response.data?.status === 200 || response.data?.success)) {
        return { success: true, content: response.data.content };
    }
    return apiError(response, '获取收藏统计失败');
}

async function sendLiveGift({ token, pa, giftId, liveId, acceptUserId, giftNum }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/gift/api/v1/gift/send',
        {
            giftId: String(giftId),
            businessId: String(liveId),
            acceptUserId: String(acceptUserId),
            giftNum: Number(giftNum) || 1,
            isPocketGift: 0,
            businessCode: 0,
            zip: 0,
            isCombo: 0,
            ruleId: 0,
            giftType: 1,
            crm: crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
        },
        createModernHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) {
        return { success: true, msg: response.data.message || '送礼成功', content: response.data.content };
    }
    return { success: false, msg: response.data?.message || '送礼失败' };
}

async function fetchGiftList({ token, pa, liveId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/gift/api/v1/gift/list',
        { businessId: String(liveId), giftType: 1 },
        createHeaders(token, pa),
        { largeNumbers: true }
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return { success: false, msg: response.data?.message || '获取礼物列表失败' };
}

async function getNimLoginInfo({ token, pa }) {
    if (!token) return { success: false, msg: '未登录' };
    const response = await postJson('https://pocketapi.48.cn/user/api/v1/user/info/home', {}, createModernHeaders(token, pa));
    if (response.status === 200 && response.data?.success) {
        return { success: true, accid: response.data.content.userInfo.accId, token };
    }
    return { success: false, msg: '获取用户信息失败' };
}

async function fetchRoomAlbum({ token, pa, channelId, nextTime }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/team/msg/list/img',
        { channelId: String(channelId), nextTime: nextTime || 0 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return apiError(response);
}

async function fetchRoomRadio({ token, pa, channelId, serverId }) {
    if (!token) return missingToken();
    const headers = createHeaders(token, pa);
    let finalServerId = serverId;
    if (!finalServerId || finalServerId === 0) {
        finalServerId = await resolveServerId(channelId, headers);
    }
    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/team/voice/operate',
        { channelId: parseInt(channelId, 10), serverId: parseInt(finalServerId, 10), operateCode: 2 },
        headers
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return { success: false, msg: response.data?.message || '电台未开启或获取失败' };
}

async function fetchLiveRank({ token, pa, liveId }) {
    if (!token) return missingToken();
    const response = await postJson(
        'https://pocketapi.48.cn/live/api/v2/live/getLiveRank',
        { type: 1, liveId: String(liveId) },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.status === 200) return { success: true, content: response.data.content };
    return { success: false, msg: response.data?.message || '获取榜单失败' };
}

async function fetchFriendsIds({ token, pa }) {
    const response = await postJson('https://pocketapi.48.cn/user/api/v1/friendships/friends/id', {}, createHeaders(token, pa));
    return response.data;
}

async function fetchLastMessages({ token, pa, serverIdList }) {
    const response = await postJson(
        'https://pocketapi.48.cn/im/api/v1/team/classic/last/message/get',
        { serverIdList: Array.isArray(serverIdList) ? serverIdList.map(Number) : [Number(serverIdList)] },
        createHeaders(token, pa)
    );
    return response.data;
}

async function followMember({ token, pa, memberId }) {
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v2/friendships/friends/add',
        { toSourceId: parseInt(memberId, 10), toType: 1 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.success) return { success: true };
    return apiError(response);
}

async function unfollowMember({ token, pa, memberId }) {
    const response = await postJson(
        'https://pocketapi.48.cn/user/api/v2/friendships/friends/remove',
        { toSourceId: parseInt(memberId, 10), toType: 1 },
        createHeaders(token, pa)
    );
    if (response.status === 200 && response.data?.success) return { success: true };
    return apiError(response);
}

async function fetchLiveList({ token, pa, groupId = 0, next = 0, record = false, debug = false }) {
    return postPocketContent(
        'https://pocketapi.48.cn/live/api/v1/live/getLiveList',
        { groupId: Number(groupId) || 0, debug: !!debug, next: Number(next) || 0, record: !!record },
        { token, pa, errorMessage: '获取直播列表失败' }
    );
}

async function fetchLiveOne({ token, pa, liveId }) {
    return postPocketContent(
        'https://pocketapi.48.cn/live/api/v1/live/getLiveOne',
        { liveId: String(liveId || '') },
        { token, pa, errorMessage: '获取直播详情失败' }
    );
}

async function fetchLiveResult({ token, pa, liveId }) {
    return postPocketContent(
        'https://pocketapi.48.cn/live/api/v1/live/result',
        { liveId: String(liveId || '') },
        { token, pa, errorMessage: '获取直播结果失败' }
    );
}

async function fetchTripList({ token, pa, groupId = 0, memberId = '', userId = '', lastTime = '0', isMore = false }) {
    const payload = {
        lastTime: String(lastTime || '0'),
        groupId: Number(groupId) || 0,
        isMore: !!isMore
    };
    if (memberId !== undefined && memberId !== null && memberId !== '') payload.memberId = String(memberId);
    if (userId !== undefined && userId !== null && userId !== '') payload.userId = String(userId);

    return postPocketContent(
        'https://pocketapi.48.cn/trip/api/trip/v1/list',
        payload,
        { token, pa, errorMessage: '获取行程失败' }
    );
}

async function fetchAlbumList({ token, pa, ctime = 0, groupId = 0, limit = 20 }) {
    return postPocketContent(
        'https://pocketapi.48.cn/media/api/media/v1/album/list',
        { ctime: Number(ctime) || 0, groupId: Number(groupId) || 0, limit: Number(limit) || 20 },
        { token, pa, errorMessage: '获取专辑列表失败' }
    );
}

async function fetchMeleeWeekRank({ token, pa, rankId, nextId }) {
    const payload = { rankId: Number(rankId) || 0 };
    if (nextId !== undefined && nextId !== null && nextId !== '') payload.nextId = nextId;
    return postPocketContent(
        'https://pocketapi.48.cn/gift/api/v1/melee/rank/getMeleeWeekRank',
        payload,
        { token, pa, errorMessage: '获取乱斗周榜失败', largeNumbers: true }
    );
}

async function fetchMeleeRankPage({ token, pa, rankId, nextId }) {
    const payload = { rankid: Number(rankId) || 0 };
    if (nextId !== undefined && nextId !== null && nextId !== '') payload.nextId = nextId;
    return postPocketContent(
        'https://pocketapi.48.cn/gift/api/v1/melee/rank/getMeleeRankPage',
        payload,
        { token, pa, errorMessage: '获取乱斗榜单失败', largeNumbers: true }
    );
}

async function fetchMeleeYearRankPage({ token, pa, rankId, nextId }) {
    const payload = {};
    if (rankId !== undefined && rankId !== null && rankId !== '') payload.rankid = Number(rankId) || 0;
    if (nextId !== undefined && nextId !== null && nextId !== '') payload.nextId = nextId;
    return postPocketContent(
        'https://pocketapi.48.cn/gift/api/v1/melee/rank/getMeleeYearRankPage',
        payload,
        { token, pa, errorMessage: '获取乱斗年榜失败', largeNumbers: true }
    );
}

async function fetchPersonMeleeRankPage({ token, pa, resId }) {
    return postPocketContent(
        'https://pocketapi.48.cn/gift/api/v1/melee/rank/getPersonMeleeRankPage',
        { resId: Number(resId) || 0 },
        { token, pa, errorMessage: '获取成员鸡腿贡献榜失败', largeNumbers: true }
    );
}

async function fetchPostImageList({ token, pa, userId, nextTime = 0 }) {
    return postPocketContent(
        'https://pocketapi.48.cn/posts/api/v1/posts/img/list',
        { userId: String(userId || ''), nextTime: Number(nextTime) || 0 },
        { token, pa, errorMessage: '获取成员图片动态失败' }
    );
}

async function fetchChatroomHomeownerMessages({ token, pa, roomId, ownerId, nextTime = 0, needTop1Msg = false }) {
    return postPocketContent(
        'https://pocketapi.48.cn/im/api/v1/chatroom/msg/list/homeowner',
        {
            needTop1Msg: String(!!needTop1Msg),
            roomId: String(roomId || ''),
            ownerId: String(ownerId || ''),
            nextTime: String(nextTime || 0)
        },
        { token, pa, errorMessage: '获取成员房间消息失败' }
    );
}

async function fetchMemberWeiboMessages({ token, pa, ownerId, nextTime = 0, roomId = '' }) {
    return postPocketContent(
        'https://pocketapi.48.cn/im/api/v1/chatroom/msg/list/aim/type',
        {
            extMsgType: 'WEI_BO',
            roomId: String(roomId || ''),
            ownerId: String(ownerId || ''),
            nextTime: Number(nextTime) || 0
        },
        { token, pa, headersFactory: createWeiboHeaders, errorMessage: '获取成员微博失败' }
    );
}

async function fetchMemberDynamicMessages({ token, pa, ownerId, nextTime = 0, roomId = '' }) {
    return postPocketContent(
        'https://pocketapi.48.cn/im/api/v1/chatroom/msg/list/aim/type',
        {
            extMsgType: 'POST_INFO',
            roomId: String(roomId || ''),
            ownerId: String(ownerId || ''),
            nextTime: Number(nextTime) || 0
        },
        { token, pa, headersFactory: createWeiboHeaders, errorMessage: '获取成员动态失败' }
    );
}

async function fetchConversationPage({ token, pa, nextTime = 0, limit = 20 }) {
    if (!token) return missingToken();
    return postPocketContent(
        'https://pocketapi.48.cn/im/api/v1/conversation/page',
        { nextTime: Number(nextTime) || 0, limit: Number(limit) || 20 },
        { token, pa, headersFactory: createModernHeaders, errorMessage: '获取会话列表失败' }
    );
}

async function fetchUserHomeInfo({ token, pa, userId }) {
    const payload = {};
    if (userId !== undefined && userId !== null && userId !== '') payload.userId = String(userId);
    return postPocketContent(
        'https://pocketapi.48.cn/user/api/v1/user/info/home',
        payload,
        { token, pa, headersFactory: createModernHeaders, errorMessage: '获取用户主页信息失败' }
    );
}

async function fetchFlipCustomIndexV1({ token, pa, memberId }) {
    return postPocketContent(
        'https://pocketapi.48.cn/idolanswer/api/idolanswer/v1/custom/index',
        { memberId: String(memberId || '') },
        { token, pa, errorMessage: '获取翻牌配置失败' }
    );
}

async function requestElectionVoteApi(method, path, payload = {}, body = {}, options = {}) {
    const response = await fetch(`https://voteapi.48.cn/election-vote/api/v1${path}`, {
        method,
        headers: createElectionVoteHeaders(payload, options),
        body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });
    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (_) {
            return { success: false, msg: `计分 API 返回内容不是 JSON: ${text.replace(/\s+/g, ' ').slice(0, 120)}` };
        }
    }
    if (response.status === 200 && (data?.status === 200 || data?.success)) {
        return { success: true, content: data.content, data };
    }
    return { success: false, msg: data?.message || '计分 API 错误', data };
}

async function loginElectionVote(payload = {}) {
    const appToken = getElectionAppToken(payload);
    if (!appToken) return missingToken();
    return requestElectionVoteApi('POST', '/login/app', payload, {
        appToken,
        nickName: String(payload.nickName || payload.nickname || ''),
        avatar: String(payload.avatar || ''),
        device: String(payload.device || 'iOS;iPhone17,1;7.1.38;26042402'),
        platform: String(payload.platform || 'IOS')
    }, { auth: false, appToken: true });
}

async function fetchElectionVoteStatus(payload = {}) {
    return requestElectionVoteApi('GET', '/vote/status', payload, null, { auth: false });
}

async function fetchElectionActStatus(payload = {}) {
    return requestElectionVoteApi('GET', '/act/status', payload, null, { auth: false });
}

async function fetchElectionUserInfo(payload = {}) {
    if (!getElectionVoteToken(payload)) return missingToken();
    return requestElectionVoteApi('POST', '/userinfo/get', payload, {}, { auth: true });
}

async function fetchElectionVoteHistory(payload = {}) {
    if (!getElectionVoteToken(payload)) return missingToken();
    return requestElectionVoteApi('POST', '/vote/history/list', payload, {
        limit: Number(payload.limit) || 10,
        lastTime: Number(payload.lastTime) || 0
    }, { auth: true });
}

async function fetchElectionCodeActHistory(payload = {}) {
    if (!getElectionVoteToken(payload)) return missingToken();
    return requestElectionVoteApi('POST', '/code/act/history/list', payload, {
        limit: Number(payload.limit) || 10,
        lastTime: Number(payload.lastTime) || 0
    }, { auth: true });
}

async function fetchElectionSgBindStatus(payload = {}) {
    if (!getElectionVoteToken(payload)) return missingToken();
    return requestElectionVoteApi('POST', '/userinfo/check/bind/sg', payload, {}, { auth: true });
}

async function bindElectionSg(payload = {}) {
    if (!getElectionVoteToken(payload)) return missingToken();
    return requestElectionVoteApi('POST', '/bind/sg', payload, {
        clientId: String(payload.clientId || '20260518001'),
        platform: String(payload.platform || 'IOS'),
        code: String(payload.code || ''),
        device: String(payload.device || 'iOS;iPhone17,1;7.1.38;26042402')
    }, { auth: true, appToken: true });
}

async function fetchPageantryRareTreasures({ token, pa } = {}) {
    if (!token) return missingToken();
    return postPocketContent(
        'https://pocketapi.48.cn/ai-fairyland/api/pageantry/2026/v1/rare_treasure/list',
        {},
        { token, pa, headersFactory: createPageantryHeaders, errorMessage: '获取稀有宝物列表失败' }
    );
}

async function fetchPageantryBuyStarList({ token, pa, starId = '', starName = '' } = {}) {
    if (!token) return missingToken();
    return postPocketContent(
        'https://pocketapi.48.cn/ai-fairyland/api/pageantry/2026/v1/get/buy_star/list',
        { starId: String(starId || ''), starName: String(starName || '') },
        { token, pa, headersFactory: createPageantryHeaders, errorMessage: '获取计分成员列表失败' }
    );
}

async function fetchScoreOfficialBundle(payload = {}) {
    const actions = [
        ['voteStatus', () => fetchElectionVoteStatus(payload)],
        ['actStatus', () => fetchElectionActStatus(payload)],
        ['rareTreasures', () => fetchPageantryRareTreasures(payload)],
        ['buyStarList', () => fetchPageantryBuyStarList(payload)]
    ];
    if (getElectionVoteToken(payload)) {
        actions.push(
            ['userInfo', () => fetchElectionUserInfo(payload)],
            ['sgBindStatus', () => fetchElectionSgBindStatus(payload)],
            ['voteHistory', () => fetchElectionVoteHistory(payload)],
            ['codeActHistory', () => fetchElectionCodeActHistory(payload)]
        );
    }
    const content = {};
    await Promise.all(actions.map(async ([key, fn]) => {
        try {
            content[key] = await fn();
        } catch (error) {
            content[key] = { success: false, msg: error.message || '计分 API 错误' };
        }
    }));
    return { success: true, content };
}

async function runScoreOfficialAction(payload = {}) {
    const action = String(payload.action || payload.type || '').trim();
    const actionPayload = payload.payload && typeof payload.payload === 'object'
        ? { ...payload, ...payload.payload }
        : payload;
    const handlers = {
        'vote-login': loginElectionVote,
        'vote-status': fetchElectionVoteStatus,
        'act-status': fetchElectionActStatus,
        userinfo: fetchElectionUserInfo,
        'vote-history': fetchElectionVoteHistory,
        'code-act-history': fetchElectionCodeActHistory,
        'check-sg-bind': fetchElectionSgBindStatus,
        'bind-sg': bindElectionSg,
        'rare-treasure-list': fetchPageantryRareTreasures,
        'buy-star-list': fetchPageantryBuyStarList,
        bundle: fetchScoreOfficialBundle
    };
    const handler = handlers[action];
    if (!handler) return { success: false, msg: `未知计分动作: ${action || '-'}` };
    return handler(actionPayload);
}
