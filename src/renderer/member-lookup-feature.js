(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createMemberLookupFeature = function createMemberLookupFeature(deps) {
        const {
            getBestNameMapForDisplay,
            getMemberData,
            getMemberNameMap,
            getPinyinInitials
        } = deps;

        function updateSearchSuggestions() {
            const datalist = document.getElementById('member-list-suggestions');
            const memberNameMap = getMemberNameMap();
            if (!datalist || memberNameMap.size === 0) return;
            datalist.innerHTML = '';
            const bestNameForId = new Map();
            for (const [name, id] of memberNameMap) {
                if (!bestNameForId.has(id) || name.length > bestNameForId.get(id).length) {
                    bestNameForId.set(id, name);
                }
            }
            for (const name of bestNameForId.values()) {
                const option = document.createElement('option');
                option.value = name;
                datalist.appendChild(option);
            }
        }

        function normalizeMemberLookupText(value) {
            return String(value || '')
                .trim()
                .replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48|IDFT|SHY48|CGT48)[-—\s]*/i, '')
                .toLowerCase();
        }

        function getMemberLookupAliases(member) {
            if (!member) return [];
            const aliases = new Set();
            const pushAlias = (value) => {
                const raw = String(value || '').trim();
                if (!raw) return;
                aliases.add(raw);
                const normalized = normalizeMemberLookupText(raw);
                if (normalized) aliases.add(normalized);
                if (raw.includes('-')) {
                    const simpleName = raw.split('-').slice(1).join('-').trim();
                    if (simpleName) {
                        aliases.add(simpleName);
                        const simpleNormalized = normalizeMemberLookupText(simpleName);
                        if (simpleNormalized) aliases.add(simpleNormalized);
                    }
                }
            };

            pushAlias(member.ownerName);
            pushAlias(member.name);
            pushAlias(member.nickname);
            pushAlias(member.account);
            pushAlias(member.pinyin);
            if (typeof getPinyinInitials === 'function') {
                pushAlias(getPinyinInitials(member.pinyin || ''));
            }

            return Array.from(aliases);
        }

        function findMemberRecordByQuery(query) {
            const memberData = getMemberData();
            if (!Array.isArray(memberData) || memberData.length === 0) return null;
            const normalizedQuery = normalizeMemberLookupText(query);
            if (!normalizedQuery) return null;

            return memberData.find(member => {
                const aliases = getMemberLookupAliases(member);
                return aliases.some(alias => {
                    const normalizedAlias = normalizeMemberLookupText(alias);
                    if (!normalizedAlias) return false;
                    return normalizedAlias === normalizedQuery
                        || normalizedAlias.includes(normalizedQuery)
                        || normalizedQuery.includes(normalizedAlias);
                });
            }) || null;
        }

        function getMemberNamesById(memberId) {
            const id = String(memberId || '').trim();
            if (!id) return [];

            const names = new Set();
            const addName = (value) => {
                const text = String(value || '').trim();
                if (!text) return;
                names.add(text);
                if (text.includes('-')) {
                    const simpleName = text.split('-').slice(1).join('-').trim();
                    if (simpleName) names.add(simpleName);
                }
            };

            addName(getBestNameMapForDisplay().get(id));

            const memberData = getMemberData();
            if (Array.isArray(memberData) && memberData.length > 0) {
                memberData.forEach(member => {
                    const currentId = String(member.id || member.userId || '').trim();
                    if (currentId && currentId === id) {
                        getMemberLookupAliases(member).forEach(addName);
                    }
                });
            }

            return Array.from(names);
        }

        function getMemberIdFromQuery(query) {
            if (!query) return null;
            const raw = query.trim();
            if (/^\d{1,10}$/.test(raw)) return raw;

            const memberNameMap = getMemberNameMap();
            const cleanName = raw.replace(/^(SNH48|GNZ48|BEJ48|CKG48|CGT48|IDFT|SHY48|CGT48)[-—\s]*/i, '').trim();
            if (memberNameMap.has(cleanName)) return memberNameMap.get(cleanName);
            if (memberNameMap.has(raw)) return memberNameMap.get(raw);

            const normalizedQuery = normalizeMemberLookupText(cleanName || raw);
            for (const [name, id] of memberNameMap) {
                const normalizedName = normalizeMemberLookupText(name);
                if (!normalizedName) continue;
                if (normalizedName === normalizedQuery || normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
                    return id;
                }
            }

            const matchedMember = findMemberRecordByQuery(raw);
            if (matchedMember) {
                return String(matchedMember.id || matchedMember.userId || '');
            }

            return null;
        }

        return {
            findMemberRecordByQuery,
            getMemberIdFromQuery,
            getMemberLookupAliases,
            getMemberNamesById,
            normalizeMemberLookupText,
            updateSearchSuggestions
        };
    };
})();
