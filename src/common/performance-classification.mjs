const GROUP_IDS = [10, 12, 11, 14, 21];
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 1500;

export function createPerformanceClassifier(fetchPage) {
    const cache = new Map();
    const pending = new Map();
    return async function classify(result, payload) {
        if (!result?.success || !Array.isArray(result.content?.liveList)) return result;
        const { token, clientProfile, deviceId, groupId = 0, next = 0 } = payload;
        const scope = JSON.stringify([token, clientProfile, deviceId]);
        const keyFor = item => JSON.stringify([scope, String(item.businessId)]);
        const rows = result.content.liveList;
        const membership = new Map();
        const requestedGroup = Number(groupId);
        if (GROUP_IDS.includes(requestedGroup)) {
            rows.forEach(item => membership.set(String(item.businessId), [requestedGroup]));
        } else {
            const missing = [];
            for (const item of rows) {
                const entry = cache.get(keyFor(item));
                if (entry && entry.expiresAt > Date.now()) membership.set(String(item.businessId), entry.groups);
                else missing.push(item);
            }
            if (missing.length) {
                const pageKey = JSON.stringify([scope, String(next)]);
                let request = pending.get(pageKey);
                if (!request) {
                    request = Promise.allSettled(GROUP_IDS.map(id => fetchPage({ ...payload, groupId: id })))
                        .finally(() => pending.delete(pageKey));
                    pending.set(pageKey, request);
                }
                const pages = await request;
                const complete = pages.every(page => page.status === 'fulfilled'
                    && page.value?.success && Array.isArray(page.value.content?.liveList));
                for (const item of missing) {
                    const id = String(item.businessId);
                    const groups = GROUP_IDS.filter((_, index) => {
                        const page = pages[index];
                        return page.status === 'fulfilled' && page.value?.success
                            && Array.isArray(page.value.content?.liveList)
                            && page.value.content.liveList.some(row => String(row.businessId) === id);
                    });
                    if (complete) {
                        membership.set(id, groups);
                        cache.set(keyFor(item), { groups, expiresAt: Date.now() + CACHE_TTL_MS });
                    }
                }
                while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
            }
        }
        return { ...result, content: { ...result.content, liveList: rows.map(item => ({ ...item,
            ...(membership.has(String(item.businessId))
                ? { officialGroupIds: membership.get(String(item.businessId)) }
                : { officialGroupLookupFailed: true })
        })) } };
    };
}

function normalizeOfficialTeams(raw) {
    if (!Array.isArray(raw)) return null;
    const teams = raw.filter(team => team && typeof team.teamName === 'string' && team.teamName.trim())
        .map(team => ({ teamId: String(team.teamId || ''), groupId: String(team.groupId || ''),
            teamName: team.teamName.trim(), teamLogo: String(team.teamLogo || ''),
            seineTeamLogo: String(team.seineTeamLogo || ''), teamColor: String(team.teamColor || '') }));
    return teams.length === raw.length ? teams : null;
}

export function createPerformanceTeamClassifier(fetchPage, fetchDetail) {
    const cache = new Map();
    const pending = new Map();
    return async function classifyTeams(result, payload) {
        if (!result?.success || !Array.isArray(result.content?.liveList)) return result;
        const scope = JSON.stringify([payload.token, payload.clientProfile, payload.deviceId]);
        const keyFor = id => JSON.stringify([scope, String(id)]);
        const teamsById = new Map();
        let receivedTeamPage = false;
        const missing = result.content.liveList.filter(item => {
            const entry = cache.get(keyFor(item.businessId));
            if (entry && entry.expiresAt > Date.now()) {
                teamsById.set(String(item.businessId), entry.teams);
                return false;
            }
            return true;
        });
        await Promise.all([false, true].map(async record => {
            const targets = new Set(missing.filter(item => {
                const status = Number(item.openLiveInfo?.status);
                return record ? status !== 1 && status !== 2 : status === 1 || status === 2;
            }).map(item => String(item.businessId)));
            let cursor = String(payload.next || '0');
            const seen = new Set();
            for (let page = 0; targets.size && page < 10 && !seen.has(cursor); page++) {
                seen.add(cursor);
                const pageKey = JSON.stringify([scope, record, cursor]);
                let request = pending.get(pageKey);
                if (!request) {
                    request = Promise.resolve().then(() => fetchPage({ ...payload, groupId: 0, record, next: cursor }))
                        .finally(() => pending.delete(pageKey));
                    pending.set(pageKey, request);
                }
                let response;
                try { response = await request; } catch { break; }
                if (!response?.success || !Array.isArray(response.content?.liveList)) break;
                receivedTeamPage = true;
                const rows = response.content.liveList;
                for (const row of rows) {
                    const id = String(row.liveId);
                    const teams = normalizeOfficialTeams(row.teamList);
                    if (!teams) continue;
                    cache.set(keyFor(id), { teams, expiresAt: Date.now() + CACHE_TTL_MS });
                    if (targets.has(id)) {
                        teamsById.set(id, teams);
                        targets.delete(id);
                    }
                }
                const next = String(response.content.next || '0');
                if (!rows.length || next === '0' || next === cursor) break;
                cursor = next;
            }
        }));
        if (receivedTeamPage && typeof fetchDetail === 'function') {
            const remainder = missing.filter(item => !teamsById.has(String(item.businessId))).slice(0, 8);
            for (let offset = 0; offset < remainder.length; offset += 3) {
                await Promise.all(remainder.slice(offset, offset + 3).map(async item => {
                    try {
                        const detail = await fetchDetail({ ...payload, liveId: String(item.businessId) });
                        const teams = detail?.success ? normalizeOfficialTeams(detail.content?.teamList) : null;
                        if (!teams) return;
                        teamsById.set(String(item.businessId), teams);
                        cache.set(keyFor(item.businessId), { teams, expiresAt: Date.now() + CACHE_TTL_MS });
                    } catch {                                                                        }
                }));
            }
        }
        while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
        return { ...result, content: { ...result.content, liveList: result.content.liveList.map(item => ({ ...item,
            ...(teamsById.has(String(item.businessId))
                ? { officialTeams: teamsById.get(String(item.businessId)) }
                : { officialTeamLookupFailed: true })
        })) } };
    };
}
