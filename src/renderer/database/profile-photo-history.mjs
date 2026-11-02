export const PROFILE_PHOTO_BASE = 'https://data.gnz.hk/profile-photos/';
let indexPromise;

export function loadProfilePhotoHistory() {
    if (globalThis.window?.YayaDataSync) {
        return window.YayaDataSync.read(`${PROFILE_PHOTO_BASE}index.json`, {
            validate: index => index?.version === 1 && index.members && typeof index.members === 'object' && Array.isArray(index.ambiguousNames)
        });
    }
    if (!indexPromise) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        indexPromise = fetch(`${PROFILE_PHOTO_BASE}index.json`, { signal: controller.signal })
            .then(response => {
                if (!response.ok) throw new Error('Photo history unavailable');
                return response.json();
            })
            .then(index => {
                if (index?.version !== 1 || !index.members || !Array.isArray(index.ambiguousNames)) {
                    throw new Error('Invalid photo history index');
                }
                return index;
            })
            .catch(error => { indexPromise = null; throw error; })
            .finally(() => clearTimeout(timer));
    }
    return indexPromise;
}

export function selectProfilePhotoHistory(index, member) {
    const name = String(member?.ownerName || '').trim();
    if (!index?.members || !Object.hasOwn(index.members, name)) return [];
    const entries = index.members[name];
    if (!Array.isArray(entries)) return [];
    const ambiguous = index.ambiguousNames?.includes(name);
    const seen = new Set();
    return entries.filter(entry => {
        if (!/^\d{4}\.(0[1-9]|1[0-2])$/.test(entry?.date)
            || !/^images\/[a-f0-9]{2}\/[a-f0-9]{64}\.(jpg|jpeg|png|webp)$/.test(entry?.path)) return false;
        if (ambiguous && entry.group !== member.groupName) return false;
        const key = `${entry.date}/${entry.path}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => b.date.localeCompare(a.date)).map(entry => ({
        ...entry, url: PROFILE_PHOTO_BASE + entry.path
    }));
}
