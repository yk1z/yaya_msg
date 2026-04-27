(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createLiveGiftFeature = function createLiveGiftFeature(deps) {
        const {
            getAppToken,
            getCurrentPlayingItem,
            getDp,
            getPocketGiftData,
            getSelectedLiveGiftId,
            setSelectedLiveGiftId,
            ipcRenderer,
            switchView
        } = deps;

        let liveGiftCacheSaveTimer = null;

        function getSafeToken() {
            if (typeof getAppToken === 'function') return getAppToken();
            return typeof window.getAppToken === 'function' ? window.getAppToken() : '';
        }

        function getSafePa() {
            return window.getPA ? window.getPA() : null;
        }

        function notify(message, duration = 2000) {
            const dp = typeof getDp === 'function' ? getDp() : null;
            if (dp && typeof dp.notice === 'function') {
                dp.notice(message, duration);
                return true;
            }
            return false;
        }

        function getGiftFallbackList() {
            const pocketGiftData = typeof getPocketGiftData === 'function' ? getPocketGiftData() : [];
            return pocketGiftData.map(gift => ({
                giftId: gift.id,
                giftName: gift.name,
                money: gift.cost,
                picPath: `/mediasource/live/gift/gift_png_${gift.id}.png`
            }));
        }

        function scheduleLiveGiftCacheSave(pocketGiftData) {
            if (liveGiftCacheSaveTimer) {
                clearTimeout(liveGiftCacheSaveTimer);
            }

            liveGiftCacheSaveTimer = setTimeout(() => {
                liveGiftCacheSaveTimer = null;
                const cacheApi = window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
                if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                    cacheApi.setCacheValueSync('POCKET_GIFT_DATA_CACHE', pocketGiftData);
                } else {
                    localStorage.setItem('POCKET_GIFT_DATA_CACHE', JSON.stringify(pocketGiftData));
                }
            }, 500);
        }

        function persistGiftListToCache(giftList = []) {
            const pocketGiftData = typeof getPocketGiftData === 'function' ? getPocketGiftData() : [];
            let changed = false;

            giftList.forEach((gift) => {
                const id = String(gift.giftId || gift.id || '').trim();
                const name = String(gift.giftName || gift.name || '').trim();
                const cost = Number(gift.money || gift.cost || 0);
                if ((!id && !name) || !cost) return;

                const normalizedGift = { id, name: name || id, cost };

                const existing = pocketGiftData.find(item => (id && String(item.id) === id) || (name && item.name === name));
                if (existing) {
                    const itemChanged = Number(existing.cost || 0) !== cost
                        || (id && String(existing.id || '') !== id)
                        || (name && existing.name !== name);
                    if (!itemChanged) return;

                    existing.id = id || existing.id;
                    existing.name = name || existing.name;
                    existing.cost = cost;
                    changed = true;
                } else {
                    pocketGiftData.push(normalizedGift);
                    changed = true;
                }
            });

            if (!changed) return;

            scheduleLiveGiftCacheSave(pocketGiftData);
        }

        function toggleGiftPanel() {
            const panel = document.getElementById('live-gift-panel');
            const arrow = document.getElementById('gift-panel-arrow');

            if (!panel) return;

            if (panel.style.display === 'none' || panel.style.display === '') {
                panel.style.display = 'block';
                if (arrow) arrow.style.transform = 'rotate(180deg)';

                void renderLiveGiftGrid();
                void updateLiveBalance();
            } else {
                panel.style.display = 'none';
                if (arrow) arrow.style.transform = 'rotate(0deg)';
            }
        }

        async function renderLiveGiftGrid() {
            const container = document.getElementById('live-gift-grid');
            if (!container) return;

            if (container.children.length === 0) {
                container.innerHTML = '<div style="padding:20px; text-align:center; color:#999; width:100%;">加载中...</div>';
            }

            let giftList = [];
            let useFallback = false;

            const safeFixUrl = (path) => {
                if (!path) return './icon.png';
                if (path.startsWith('http')) return path;

                const prefix = 'https://source.48.cn';
                return path.startsWith('/') ? (prefix + path) : (prefix + '/' + path);
            };

            const token = getSafeToken();
            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;
            const liveId = currentPlayingItem ? currentPlayingItem.liveId : null;

            if (token && liveId) {
                try {
                    const res = await ipcRenderer.invoke('fetch-gift-list', { token, pa: getSafePa(), liveId });

                    if (res.success && res.content) {
                        if (Array.isArray(res.content)) {
                            res.content.forEach(category => {
                                if (category.giftList && Array.isArray(category.giftList)) {
                                    giftList = giftList.concat(category.giftList);
                                }
                            });
                        } else if (res.content.giftList && Array.isArray(res.content.giftList)) {
                            giftList = res.content.giftList;
                        }

                        const seen = new Set();
                        giftList = giftList.filter(item => {
                            const id = item.giftId || item.id;
                            if (seen.has(id)) return false;
                            seen.add(id);
                            return true;
                        });

                        if (giftList.length === 0) useFallback = true;
                    } else {
                        useFallback = true;
                    }
                } catch (e) {
                    console.error('加载礼物列表失败', e);
                    useFallback = true;
                }
            } else {
                useFallback = true;
            }

            if (useFallback || giftList.length === 0) {
                giftList = getGiftFallbackList();
            } else {
                persistGiftListToCache(giftList);
            }

            if (giftList.length === 0) {
                container.innerHTML = '<div style="padding:10px; text-align:center; color:#999;">无法加载礼物列表</div>';
                return;
            }

            let html = '';
            giftList.forEach(gift => {
                const id = gift.giftId || gift.id;
                const name = gift.giftName || gift.name || '未知礼物';

                let cost = '??';
                if (gift.money !== undefined) cost = gift.money;
                else if (gift.canSendNum !== undefined) cost = gift.canSendNum;
                else if (gift.cost !== undefined) cost = gift.cost;

                const imgUrl = safeFixUrl(gift.picPath);

                html += `
            <div class="gift-item" id="gift-item-${id}" 
                 data-name="${name}" data-cost="${cost}"
                 onclick="selectLiveGift('${id}')">
                <img src="${imgUrl}" class="gift-img" onerror="this.src='./icon.png'" loading="lazy">
                <div class="gift-name" title="${name}">${name}</div>
                <div class="gift-cost">${cost} 🍗</div>
            </div>
        `;
            });
            container.innerHTML = html;
        }

        function selectLiveGift(giftId) {
            const previousGiftId = typeof getSelectedLiveGiftId === 'function' ? getSelectedLiveGiftId() : null;
            if (previousGiftId) {
                const oldGift = document.getElementById(`gift-item-${previousGiftId}`);
                if (oldGift) oldGift.classList.remove('selected');
            }

            if (typeof setSelectedLiveGiftId === 'function') {
                setSelectedLiveGiftId(giftId);
            }

            const currentGift = document.getElementById(`gift-item-${giftId}`);
            if (!currentGift) return;

            currentGift.classList.add('selected');

            const btn = document.getElementById('btn-confirm-send-gift');
            if (btn) {
                const name = currentGift.dataset.name || '礼物';
                btn.disabled = false;
                btn.innerText = `发送 ${name}`;
                btn.title = `发送 ${name} (消耗 ${currentGift.dataset.cost} 鸡腿)`;
            }
        }

        async function updateLiveBalance() {
            const balanceEl = document.getElementById('live-gift-balance');
            if (!balanceEl) return;

            const token = getSafeToken();
            if (!token) {
                balanceEl.innerText = '未登录';
                return;
            }

            try {
                const res = await ipcRenderer.invoke('fetch-user-money', { token, pa: getSafePa() });
                if (res.success && res.content) {
                    balanceEl.innerText = res.content.moneyTotal;
                } else {
                    balanceEl.innerText = '获取失败';
                }
            } catch (e) {
                console.error(e);
                balanceEl.innerText = '错误';
            }
        }

        async function executeSendLiveGift() {
            const selectedLiveGiftId = typeof getSelectedLiveGiftId === 'function' ? getSelectedLiveGiftId() : null;
            if (!selectedLiveGiftId) {
                notify('请先选择一个礼物', 2000);
                return;
            }

            const currentPlayingItem = typeof getCurrentPlayingItem === 'function' ? getCurrentPlayingItem() : null;
            if (!currentPlayingItem) return;

            const token = getSafeToken();
            if (!token) {
                if (!notify('请先登录', 2000)) {
                    switchView('login');
                }
                return;
            }

            const giftEl = document.getElementById(`gift-item-${selectedLiveGiftId}`);
            if (!giftEl) return;

            const giftName = giftEl.dataset.name;
            const numInput = document.getElementById('live-gift-num');
            const giftNum = numInput ? Math.floor(Number(numInput.value)) : 1;
            if (giftNum < 1) {
                notify('数量不能小于 1', 2000);
                return;
            }

            const btn = document.getElementById('btn-confirm-send-gift');
            if (!btn) return;

            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = '...';

            try {
                const liveId = currentPlayingItem.liveId;
                const acceptUserId = currentPlayingItem.userInfo
                    ? currentPlayingItem.userInfo.userId
                    : (currentPlayingItem.userId || '');

                if (!acceptUserId) throw new Error('无法获取主播ID');

                const res = await ipcRenderer.invoke('send-live-gift', {
                    token,
                    pa: getSafePa(),
                    giftId: selectedLiveGiftId,
                    liveId,
                    acceptUserId,
                    crm: Date.now().toString(),
                    giftNum
                });

                if (res.success) {
                    void updateLiveBalance();
                    notify(`🎁 已送出 ${giftNum} 个 [${giftName}]`, 3000);
                } else {
                    let errorMsg = res.msg || '未知错误';

                    if (errorMsg.includes('不存在') || errorMsg.includes('下架')) {
                        errorMsg = '失败';
                        void renderLiveGiftGrid();
                    } else if (errorMsg.includes('余额') || errorMsg.includes('不足') || errorMsg.includes('钱')) {
                        errorMsg = '余额不足，请充值';
                    }

                    if (!notify(`❌ ${errorMsg}`, 3000)) {
                        console.error(res.msg);
                    }
                }
            } catch (e) {
                notify(`❌ 出错: ${e.message}`, 3000);
            } finally {
                btn.disabled = false;
                btn.innerText = originalText;
            }
        }

        return {
            executeSendLiveGift,
            renderLiveGiftGrid,
            selectLiveGift,
            toggleGiftPanel,
            updateLiveBalance
        };
    };
}());
