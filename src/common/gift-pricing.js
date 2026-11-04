(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.YayaGiftPricing = api;
})(typeof window !== 'undefined' ? window : null, function () {
    const identityIndexes = new WeakMap();
    const claimedScoringGifts = new Map([
        ['888006', '旋转茶杯'], ['888007', '茶杯汪汪'], ['888008', '浪漫咖啡屋'], ['888009', '旋转飞椅'],
        ['888010', '惊险海盗船'], ['888011', '超级过山车'], ['888012', '星光'], ['888013', '织梦'],
        ['888014', '命定水晶'], ['888015', '心愿纸鹤'], ['888016', '夏日愿望'], ['888017', '梦幻城堡'],
        ['888018', '午夜调频'], ['888019', '鎏光碟影'], ['888020', '迷迭音浪'], ['888021', '云境乐园'],
        ['888022', '告白讯号'], ['888023', '暮色巡航']
    ]);
    function isScoringGift(gift = {}, options = {}) {
        gift = normalizeGiftInfo(gift, options);
        if ([true, 1, '1'].includes(gift.isScore) || [true, 1, '1'].includes(gift.isVote)) return true;
        const id = String(gift.giftId ?? gift.id ?? '');
        const name = String(gift.giftName ?? gift.name ?? '');
        const earlyNames = { '888001': ['星光之翼', '0.1分'], '888002': ['星光翼展', '1分'],
            '888003': ['星光飞翼', '9分'], '888004': ['星光飞跃', '99分'], '888005': ['星光翱翔', '999分'] };
        if (earlyNames[id]?.includes(name)) return true;
        if (claimedScoringGifts.get(id) === name) return true;
        if (id === '1320115721784332288') return true;
        return id === String(Number('1320115721784332288')) && name === '弦月回响'
            && String(gift.picPath || '').endsWith('/backstage/2026/1022/yun19ux7oa35qoex0bu400k.png');
    }
    const price = value => value !== null && value !== undefined && value !== ''
        && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
    const keyOf = (id, name) => `${String(id || '').trim()}\u0000${String(name || '').trim()}`;
    function normalizePrice(row) {
        const id = String(row?.id ?? row?.giftId ?? '').trim();
        const name = String(row?.name ?? row?.giftName ?? '').trim();
        const cost = price(row?.cost ?? row?.money);
        if (!/^[1-9]\d{0,31}$/.test(id) || !name || name.length > 200 || cost === null) return null;
        return { ...row, id, name, cost };
    }
    function validateSnapshot(value) {
        if (value?.schemaVersion !== 1 || value.source !== 'yaya-gift-confirmed'
            || !/^[a-f0-9]{64}$/.test(value.revision || '') || !Array.isArray(value.prices)
            || !value.prices.length || value.prices.length > 10000 || !Array.isArray(value.rules)
            || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('礼物价格数据格式不正确');
        const prices = value.prices.map(normalizePrice);
        if (prices.some(row => !row) || new Set(prices.map(row => keyOf(row.id, row.name))).size !== prices.length) throw new Error('礼物价格数据存在无效或重复条目');
        const rules = value.rules.map(row => ({ ...row, id: String(row.id || ''), name: String(row.name || '') }));
        if (rules.length > 10000 || rules.some(row => !/^[1-9]\d{0,31}$/.test(row.id) || !row.name)) throw new Error('礼物价格规则无效');
        for (const rule of rules) if (rule.recordPrices !== undefined) {
            if (!Array.isArray(rule.recordPrices) || rule.recordPrices.length > 10000 || rule.recordPrices.some(row =>
                !/^[1-9]\d{0,31}$/.test(row.channelId || '') || !Number.isSafeInteger(row.time) || row.time <= 0
                || !Number.isSafeInteger(row.quantity) || row.quantity <= 0 || price(row.cost) === null
                || row.source !== 'user-confirmed')) throw new Error('逐笔价格确认规则无效');
        }
        for (const rule of rules) if (rule.legacyImagePaths !== undefined) {
            if (!Array.isArray(rule.legacyImagePaths) || rule.legacyImagePaths.length > 1000
                || rule.legacyImagePaths.some(path => typeof path !== 'string' || !path.startsWith('/') || path.length > 2048)) throw new Error('旧礼物图片匹配规则无效');
        }
        for (const rule of rules) if (rule.scorePerUnit !== undefined) {
            if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(String(rule.scorePerUnit)) || Number(rule.scorePerUnit) <= 0) throw new Error('礼物分值规则无效');
        }
        return { ...value, prices, rules };
    }
    function findIdentity(prices, gift) {
        const id = String(gift?.giftId ?? gift?.id ?? '').trim();
        const name = String(gift?.giftName ?? gift?.name ?? '').trim();
        if (!id || !name) return null;
        let index = identityIndexes.get(prices);
        if (!index || index.size !== prices.length) {
            index = { exact: new Map(), aliases: new Map(), size: prices.length };
            for (const row of prices) {
                index.exact.set(keyOf(row.id, row.name), row);
                const key = keyOf(String(Number(row.id)), row.name);
                if (!index.aliases.has(key)) index.aliases.set(key, row);
                else if (index.aliases.get(key)?.cost !== row.cost) index.aliases.set(key, null);
                else if (['observed', 'legacy-cache'].includes(index.aliases.get(key)?.source)
                    && !['observed', 'legacy-cache'].includes(row.source)) index.aliases.set(key, row);
            }
            identityIndexes.set(prices, index);
        }
        const exact = index.exact.get(keyOf(id, name));
        const alias = index.aliases.get(keyOf(id, name));
        const unverified = row => row && ['observed', 'legacy-cache'].includes(row.source);
        if (unverified(exact) && alias && !unverified(alias)) return alias;
        return exact || alias || null;
    }
    function resolveGiftPrice(gift = {}, options = {}) {
        gift = normalizeGiftInfo(gift, options);
        if (options.priceBasis === 'user-confirmed' && price(options.unitCost) !== null) return { unitCost: price(options.unitCost), basis: 'user-confirmed' };
        const channelId = String(options.channelId || '').trim();
        const time = Number(options.time);
        const rule = (options.rules || []).find(row => row.name === String(gift.giftName ?? gift.name ?? '')
            && (row.id === String(gift.giftId ?? gift.id ?? '') || String(Number(row.id)) === String(gift.giftId ?? gift.id ?? '')));
        const confirmed = rule?.recordPrices?.find(row => row.channelId === channelId && row.time === time
            && row.quantity === Number(gift.giftNum ?? gift.num ?? gift.count ?? 1));
        if (confirmed && price(confirmed.cost) !== null) return { unitCost: price(confirmed.cost), basis: 'user-confirmed' };
        for (const field of ['money', 'cost']) if (price(gift[field]) !== null) return { unitCost: price(gift[field]), basis: 'message' };
        const prices = Array.isArray(options.prices) ? options.prices : [];
        const match = findIdentity(prices, gift);
        if (options.historical && (rule?.requiresDateReview || match?.requiresDateReview)) return { unitCost: null, basis: 'unknown' };
        if (!match || (options.historical && ['observed', 'legacy-cache'].includes(match.source))) return { unitCost: null, basis: 'unknown' };
        return { unitCost: match.cost, basis: match.source || 'catalog' };
    }
    function upsertObservedPrice(prices, gift) {
        if (Number(gift?.isPocketGift) === 1) return false;
        const row = normalizePrice({ ...gift, source: 'observed' });
        if (!row) return false;
        const existing = prices.find(item => keyOf(item.id, item.name) === keyOf(row.id, row.name));
        if (!existing) { prices.push(row); identityIndexes.delete(prices); return true; }
        if (existing.cost === row.cost || existing.observedCost === row.cost) return false;
        existing.observedCost = row.cost;
        existing.requiresDateReview = true;
        identityIndexes.delete(prices);
        return true;
    }
    function mergeSnapshot(prices, snapshot) {
        const next = validateSnapshot(snapshot);
        const previous = new Map(prices.map(row => [keyOf(row.id, row.name), row]));
        const merged = next.prices.map(row => {
            const old = previous.get(keyOf(row.id, row.name));
            const rule = next.rules.find(item => keyOf(item.id, item.name) === keyOf(row.id, row.name));
            return { ...row, ...(rule || {}), requiresDateReview: !!(rule?.requiresDateReview || old?.requiresDateReview
                || (old && !['observed', 'legacy-cache'].includes(old.source) && old.cost !== row.cost)) };
        });
        const present = new Set(merged.map(row => keyOf(row.id, row.name)));
        for (const row of prices) if (!present.has(keyOf(row.id, row.name))) merged.push(row);
        const rules = new Map(next.rules.map(row => [keyOf(row.id, row.name), row]));
        for (const row of merged) if (row.requiresDateReview && !rules.has(keyOf(row.id, row.name))) {
            rules.set(keyOf(row.id, row.name), { id: row.id, name: row.name, requiresDateReview: true });
        }
        prices.splice(0, prices.length, ...merged);
        identityIndexes.delete(prices);
        return { ...next, rules: [...rules.values()] };
    }
    function messageContext(record = {}) {
        const file = String(record.fileName || record.sourceFile || record.sourcePath || '');
        return { channelId: String(record.channelId || file.match(/-([1-9]\d{0,31})\.(?:jsonl|json)$/i)?.[1] || ''),
            time: Number(record.sortTime || record.msgTime || 0) };
    }
    function normalizeGiftInfo(gift = {}, options = {}) {
        if (gift.giftId || gift.id || !Object.hasOwn(gift, 'image')) return gift;
        const legacyKeys = new Set(['giftName', 'giftNum', 'money', 'image', 'legacyPriceUnknown']);
        if (!Object.keys(gift).every(key => legacyKeys.has(key))) return gift;
        const result = { ...gift };
        if (result.money === 0 || result.money === '0') {
            delete result.money;
            result.legacyPriceUnknown = true;
        }
        let imagePath;
        try {
            const image = new URL(gift.image, 'https://source.48.cn');
            if (!/^https?:$/.test(image.protocol) || !/^(?:[\w-]+\.)*48\.cn$/i.test(image.hostname)) return result;
            imagePath = image.pathname;
        } catch (_) { return result; }
        const matches = (options.rules || []).filter(rule => rule.name === gift.giftName && rule.legacyImagePaths?.includes(imagePath));
        if (new Set(matches.map(rule => rule.id)).size === 1) {
            result.giftId = matches[0].id;
            result.picPath = gift.image;
        }
        return result;
    }
    function giftScoreText(gift = {}, options = {}) {
        gift = normalizeGiftInfo(gift, options);
        if (!isScoringGift(gift)) return '';
        const raw = String(gift.tpNum ?? '').trim();
        const match = raw.match(/^(\d{1,9})(?:\.(\d{1,6}))?$/);
        let scaled = match ? Number(match[1]) * 1000000 + Number((match[2] || '').padEnd(6, '0')) : null;
        if (scaled !== null && options.source === 'live') {
            const count = Number(gift.giftNum ?? 1);
            scaled = Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(scaled * count) ? scaled * count : null;
        }
        if (scaled === null && !raw) {
            const rule = (options.rules || []).find(row => row.id === String(gift.giftId ?? gift.id ?? '')
                && row.name === String(gift.giftName ?? gift.name ?? ''));
            const unit = String(rule?.scorePerUnit ?? '').match(/^(\d{1,9})(?:\.(\d{1,6}))?$/);
            const count = Number(gift.giftNum ?? 1);
            if (unit && Number.isSafeInteger(count) && count > 0) {
                const value = (Number(unit[1]) * 1000000 + Number((unit[2] || '').padEnd(6, '0'))) * count;
                if (Number.isSafeInteger(value) && value > 0) scaled = value;
            }
        }
        if (scaled === null && !raw && (String(gift.giftId) === '1320115721784332288'
            || String(gift.giftId) === String(Number('1320115721784332288')))) {
            const count = Number(gift.giftNum);
            if (Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(count * 1000000)) scaled = count * 1000000;
        }
        if (scaled === null) return '分数待核';
        const whole = Math.floor(scaled / 1000000);
        const fraction = String(scaled % 1000000).padStart(6, '0').replace(/0+$/, '');
        return `${whole}${fraction ? '.' + fraction : ''} 分`;
    }
    return { normalizePrice, validateSnapshot, findIdentity, resolveGiftPrice, upsertObservedPrice, mergeSnapshot, messageContext, isScoringGift, normalizeGiftInfo, giftScoreText };
});
