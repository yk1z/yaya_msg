(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createLiveGiftFeature = function createLiveGiftFeature(deps) {
        const {
            getAppToken,
            getArt,
            getCurrentPlayingItem,
            getDp,
            getPocketGiftData,
            getSelectedLiveGiftId,
            setSelectedLiveGiftId,
            showToast,
            ipcRenderer,
            switchView
        } = deps;

        let liveGiftCacheSaveTimer = null;
        let liveGiftBalanceRequestId = 0;
        let giftPopupListenersBound = false;
        let liveGiftListRequestId = 0;
        let liveGiftListLoading = false;
        let liveGiftSending = false;
        let liveGiftSendRevision = 0;
        let renderedGiftContext = null;

        function isCurrentGiftTarget(token, liveId) {
            return token === getSafeToken()
                && String(liveId || '') === String(getCurrentPlayingItem?.()?.liveId || '');
        }

        function closeGiftPopup() {
            const panel = document.getElementById('live-gift-panel');
            if (panel) panel.style.display = 'none';
            const arrow = document.getElementById('gift-panel-arrow');
            if (arrow) arrow.style.transform = 'rotate(0deg)';
            document.querySelector('#live-gift-container .gift-control-bar')?.setAttribute('aria-expanded', 'false');
        }

        function positionGiftPopup() {
            const panel = document.getElementById('live-gift-panel');
            const host = document.getElementById('live-gift-container');
            const player = document.getElementById('live-player-area');
            if (!panel || !host || !player || panel.style.display === 'none') return;
            const available = host.getBoundingClientRect().top - Math.max(0, player.getBoundingClientRect().top) - 8;
            panel.style.setProperty('--live-gift-popup-max-height', `${Math.max(60, Math.floor(available))}px`);
        }

        function getSafeToken() {
            if (typeof getAppToken === 'function') return getAppToken();
            return typeof window.getAppToken === 'function' ? window.getAppToken() : '';
        }

        function getSafePa() {
            return window.getPA ? window.getPA() : null;
        }

        function notify(message, duration = 2000) {
            const art = typeof getArt === 'function' ? getArt() : null;
            if (art?.notice && 'show' in art.notice) {
                art.notice.show = message;
                return true;
            }
            const dp = typeof getDp === 'function' ? getDp() : null;
            if (dp && typeof dp.notice === 'function') {
                dp.notice(message, duration);
                return true;
            }
            if (typeof showToast === 'function') {
                showToast(message);
                return true;
            }
            return false;
        }

        function saveLiveGiftDiagnostic(value) {
            const diagnostic = value && typeof value === 'object' ? value : {};
            const cacheApi = window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
            if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                cacheApi.setCacheValueSync('LIVE_GIFT_DIAGNOSTIC_V1', diagnostic);
                return;
            }
            localStorage.setItem('LIVE_GIFT_DIAGNOSTIC_V1', JSON.stringify(diagnostic));
        }

        function readLiveGiftDiagnostic() {
            const cacheApi = window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
            if (cacheApi && typeof cacheApi.getCacheValueSync === 'function') {
                return cacheApi.getCacheValueSync('LIVE_GIFT_DIAGNOSTIC_V1', {}) || {};
            }
            try {
                return JSON.parse(localStorage.getItem('LIVE_GIFT_DIAGNOSTIC_V1') || '{}');
            } catch (error) {
                return {};
            }
        }

        async function fetchOfficialGiftState(token, liveId) {
            const [moneyResult, accountResult, rankResult] = await Promise.all([
                ipcRenderer.invoke('fetch-user-money', { token, pa: getSafePa() }),
                ipcRenderer.invoke('login-check-token', { token, pa: getSafePa() }),
                ipcRenderer.invoke('fetch-live-rank', { token, pa: getSafePa(), liveId })
            ]);
            const userId = String(accountResult?.userInfo?.userId || accountResult?.userInfo?.id || '');
            const rankData = Array.isArray(rankResult?.content?.data) ? rankResult.content.data : [];
            const rankEntry = rankData.find(item => String(item?.user?.userId || '') === userId) || null;
            return {
                money: moneyResult?.success ? Number(moneyResult.content?.moneyTotal) : null,
                userId,
                rankMoney: rankEntry ? Number(rankEntry.money || 0) : null
            };
        }

        async function verifyOfficialGift(token, liveId, beforeState, response, sendRevision) {
            const isCurrent = () => sendRevision === liveGiftSendRevision && isCurrentGiftTarget(token, liveId);
            const delays = [1200, 3000];
            let afterState = null;
            for (const delay of delays) {
                await new Promise(resolve => setTimeout(resolve, delay));
                if (!isCurrent()) return;
                afterState = await fetchOfficialGiftState(token, liveId).catch(() => null);
                if (!isCurrent()) return;
                const balanceDecreased = Number.isFinite(beforeState?.money)
                    && Number.isFinite(afterState?.money)
                    && afterState.money < beforeState.money;
                const rankIncreased = Number.isFinite(afterState?.rankMoney)
                    && (!Number.isFinite(beforeState?.rankMoney) || afterState.rankMoney > beforeState.rankMoney);
                if (balanceDecreased || rankIncreased) break;
            }

            const balanceDecreased = Number.isFinite(beforeState?.money)
                && Number.isFinite(afterState?.money)
                && afterState.money < beforeState.money;
            const rankIncreased = Number.isFinite(afterState?.rankMoney)
                && (!Number.isFinite(beforeState?.rankMoney) || afterState.rankMoney > beforeState.rankMoney);
            const confirmed = balanceDecreased || rankIncreased;
            const diagnostic = readLiveGiftDiagnostic();
            diagnostic.verification = {
                time: new Date().toISOString(),
                confirmed,
                before: beforeState || null,
                after: afterState,
                responseGiftNum: Number(response?.content?.giftNum ?? response?.diagnostic?.content?.giftNum ?? 0)
            };
            saveLiveGiftDiagnostic(diagnostic);
            if (window.desktop?.platform === 'web') {
                if (confirmed) {
                    const balanceText = balanceDecreased ? `，余额 ${beforeState.money} → ${afterState.money}` : '';
                    notify(`🎁 官方已确认赠送${balanceText}`, 4000);
                } else {
                    notify('暂未确认赠送结果，请先检查余额和礼物记录，勿重复发送', 5000);
                }
            }
            void updateLiveBalance();
            if (typeof window.fetchLiveRank === 'function') void window.fetchLiveRank(liveId);
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
            const playerArea = document.getElementById('live-player-area');
            const playerWrapper = document.getElementById('player-combo-wrapper');
            const isDesktop = window.desktop?.platform !== 'web';

            if (!panel) return;
            if (isDesktop) {
                const quantity = document.getElementById('live-gift-num');
                if (quantity) quantity.max = '999';
                panel.querySelector('#live-gift-hint')?.remove();
                if (!giftPopupListenersBound) {
                    giftPopupListenersBound = true;
                    document.addEventListener('pointerdown', event => {
                        if (!document.getElementById('live-gift-container')?.contains(event.target)) closeGiftPopup();
                    });
                    document.addEventListener('keydown', event => {
                        if (event.key === 'Escape') closeGiftPopup();
                    });
                    window.addEventListener('resize', positionGiftPopup);
                }
            }

            if (panel.style.display === 'none' || panel.style.display === '') {
                const playerHeight = Math.round(playerArea?.getBoundingClientRect().height || 0);
                if (!isDesktop && playerWrapper && playerHeight > 0) {
                    playerWrapper.style.setProperty('--live-player-expanded-height', `${playerHeight}px`);
                    playerWrapper.classList.add('gift-panel-expanded');
                }
                panel.style.display = 'block';
                if (arrow) arrow.style.transform = 'rotate(180deg)';
                if (isDesktop) {
                    document.querySelector('#live-gift-container .gift-control-bar')?.setAttribute('aria-expanded', 'true');
                    positionGiftPopup();
                }

                void renderLiveGiftGrid();
                void updateLiveBalance();
            } else {
                panel.style.display = 'none';
                if (arrow) arrow.style.transform = 'rotate(0deg)';
                if (isDesktop) closeGiftPopup();
                if (playerWrapper) {
                    playerWrapper.classList.remove('gift-panel-expanded');
                    playerWrapper.style.removeProperty('--live-player-expanded-height');
                }
            }
        }

        async function renderLiveGiftGrid() {
            const container = document.getElementById('live-gift-grid');
            if (!container || liveGiftSending) return;

            const requestId = ++liveGiftListRequestId;
            liveGiftListLoading = true;
            renderedGiftContext = null;
            if (typeof setSelectedLiveGiftId === 'function') setSelectedLiveGiftId(null);
            const sendButton = document.getElementById('btn-confirm-send-gift');
            if (sendButton) {
                sendButton.disabled = true;
                sendButton.innerText = window.YayaRendererUtils.t('发送');
            }
            container.querySelectorAll('.selected').forEach(card => card.classList.remove('selected'));

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

            if (requestId !== liveGiftListRequestId || !isCurrentGiftTarget(token, liveId)) return;
            liveGiftListLoading = false;
            renderedGiftContext = { token, liveId };
            if (useFallback || giftList.length === 0) {
                giftList = getGiftFallbackList();
            } else {
                persistGiftListToCache(giftList);
            }

            if (giftList.length === 0) {
                container.innerHTML = '<div style="padding:10px; text-align:center; color:#999;">无法加载礼物列表</div>';
                return;
            }

            const cards = document.createDocumentFragment();
            giftList.forEach(gift => {
                const id = gift.giftId || gift.id;
                const name = gift.giftName || gift.name || '未知礼物';
                const isPocketGift = Number(gift.isPocketGift || 0) === 1 ? 1 : 0;

                let cost = '??';
                if (gift.money !== undefined) cost = gift.money;
                else if (gift.canSendNum !== undefined) cost = gift.canSendNum;
                else if (gift.cost !== undefined) cost = gift.cost;

                const card = document.createElement('div');
                card.className = 'gift-item';
                card.id = `gift-item-${id}`;
                Object.assign(card.dataset, { name, cost, isPocketGift, picPath: encodeURIComponent(String(gift.picPath || '')) });
                card.addEventListener('click', () => selectLiveGift(String(id)));
                const image = document.createElement('img');
                image.className = 'gift-img';
                image.loading = 'lazy';
                image.alt = '';
                image.addEventListener('error', () => { image.src = './icon.png'; }, { once: true });
                image.src = safeFixUrl(gift.picPath);
                const label = document.createElement('div');
                label.className = 'gift-name';
                label.textContent = name;
                label.title = name;
                const price = document.createElement('div');
                price.className = 'gift-cost';
                price.textContent = `${cost} 🍗`;
                card.append(image, label, price);
                cards.appendChild(card);
            });
            container.replaceChildren(cards);
        }

        function selectLiveGift(giftId) {
            if (liveGiftSending || liveGiftListLoading) return;
            if (renderedGiftContext && !isCurrentGiftTarget(renderedGiftContext.token, renderedGiftContext.liveId)) return;
            const currentGift = document.getElementById(`gift-item-${giftId}`);
            if (!currentGift) return;
            const previousGiftId = typeof getSelectedLiveGiftId === 'function' ? getSelectedLiveGiftId() : null;
            if (previousGiftId) {
                const oldGift = document.getElementById(`gift-item-${previousGiftId}`);
                if (oldGift) oldGift.classList.remove('selected');
            }

            if (typeof setSelectedLiveGiftId === 'function') {
                setSelectedLiveGiftId(giftId);
            }

            currentGift.classList.add('selected');

            const btn = document.getElementById('btn-confirm-send-gift');
            if (btn) {
                const name = currentGift.dataset.name || '礼物';
                btn.disabled = false;
                btn.innerText = window.YayaRendererUtils.t(`发送 ${name}`);
                btn.title = window.YayaRendererUtils.t(`发送 ${name} (消耗 ${currentGift.dataset.cost} 鸡腿)`);
            }
        }

        async function updateLiveBalance() {
            const balanceEl = document.getElementById('live-gift-balance');
            if (!balanceEl) return;

            const requestId = liveGiftBalanceRequestId + 1;
            liveGiftBalanceRequestId = requestId;
            const token = getSafeToken();
            if (!token) {
                balanceEl.innerText = window.YayaRendererUtils.t('未登录');
                return;
            }

            try {
                const res = await ipcRenderer.invoke('fetch-user-money', { token, pa: getSafePa() });
                if (requestId !== liveGiftBalanceRequestId || token !== getSafeToken()) return;
                if (res.success && res.content) {
                    balanceEl.innerText = res.content.moneyTotal;
                } else {
                    balanceEl.innerText = window.YayaRendererUtils.t('获取失败');
                }
            } catch (e) {
                if (requestId !== liveGiftBalanceRequestId || token !== getSafeToken()) return;
                console.error(e);
                balanceEl.innerText = window.YayaRendererUtils.t('错误');
            }
        }

        async function executeSendLiveGift() {
            if (liveGiftSending || liveGiftListLoading) return;
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

            if (renderedGiftContext && !isCurrentGiftTarget(renderedGiftContext.token, renderedGiftContext.liveId)) {
                notify('直播或账号已变化，请重新打开礼物栏', 3000);
                return;
            }

            const giftEl = document.getElementById(`gift-item-${selectedLiveGiftId}`);
            if (!giftEl) return;

            const giftName = giftEl.dataset.name;
            const numInput = document.getElementById('live-gift-num');
            const giftNum = numInput ? Number(numInput.value) : 1;
            const maxQuantity = window.desktop?.platform === 'web' ? 9999 : 999;
            if (!Number.isInteger(giftNum) || giftNum < 1 || giftNum > maxQuantity) {
                notify(`礼物数量须为 1–${maxQuantity} 的整数`, 3000);
                return;
            }

            const btn = document.getElementById('btn-confirm-send-gift');
            if (!btn) return;

            const originalText = btn.innerText;
            liveGiftSending = true;
            const sendRevision = ++liveGiftSendRevision;
            btn.disabled = true;
            btn.innerText = '...';
            if (numInput) numInput.disabled = true;

            const liveId = currentPlayingItem.liveId;
            const sendToRoomId = currentPlayingItem.chatroomId || currentPlayingItem.roomId || '';
            const acceptUserId = currentPlayingItem.userInfo
                ? currentPlayingItem.userInfo.userId
                : (currentPlayingItem.userId || '');
            const crm = currentPlayingItem.crm || '';
            const liveType = currentPlayingItem.liveType;
            const isPocketGift = Number(giftEl.dataset.isPocketGift || 0) === 1 ? 1 : 0;
            let paymentStarted = false;
            let refreshGiftList = false;

            try {
                if (!acceptUserId) throw new Error('无法获取主播ID');
                const beforeState = await fetchOfficialGiftState(token, liveId).catch(() => null);
                if (!isCurrentGiftTarget(token, liveId)) return;

                paymentStarted = true;
                const res = await ipcRenderer.invoke('send-live-gift', {
                    token,
                    pa: getSafePa(),
                    giftId: selectedLiveGiftId,
                    liveId,
                    acceptUserId,
                    giftNum,
                    ...(window.desktop?.platform !== 'web' ? {
                        crm,
                        sendToRoomId,
                        liveType,
                        isPocketGift
                    } : {})
                });

                if (!isCurrentGiftTarget(token, liveId)) return;
                saveLiveGiftDiagnostic({
                    time: new Date().toISOString(),
                    request: {
                        liveId: String(liveId || ''),
                        giftId: String(selectedLiveGiftId || ''),
                        acceptUserId: String(acceptUserId || ''),
                        giftNum,
                        isPocketGift,
                        route: window.desktop?.platform === 'web' ? 'contribution-api' : 'live-room-api',
                        hasRoomId: Boolean(sendToRoomId)
                    },
                    response: {
                        success: res?.success === true,
                        message: String(res?.msg || ''),
                        diagnostic: res?.diagnostic || null,
                        content: res?.content && typeof res.content === 'object'
                            ? {
                                giftNum: Number(res.content.giftNum ?? 0),
                                money: Number(res.content.money ?? 0),
                                userId: String(res.content.userId ?? '')
                            }
                            : null
                    }
                });

                if (res.success) {
                    if (window.desktop?.platform === 'web') {
                        notify(`🎁 [${giftName}] 接口已受理，正在核对官方余额和贡献榜`, 3500);
                    } else {
                        notify(`已送出 ${giftName} × ${giftNum}`, 3000);
                    }
                    if (typeof window.fetchLiveRank === 'function') void window.fetchLiveRank(liveId);
                    void verifyOfficialGift(token, liveId, beforeState, res, sendRevision).catch(error => console.error('核对送礼结果失败:', error));
                } else {
                    let errorMsg = res.msg || '未知错误';

                    if (errorMsg.includes('不存在') || errorMsg.includes('下架')) {
                        errorMsg = '失败';
                        refreshGiftList = true;
                    } else if (errorMsg.includes('余额') || errorMsg.includes('不足') || errorMsg.includes('钱')) {
                        errorMsg = '余额不足，请充值';
                    }

                    if (!notify(`${errorMsg}`, 3000)) {
                        console.error(res.msg);
                    }
                }
            } catch (e) {
                if (!isCurrentGiftTarget(token, liveId)) return;
                saveLiveGiftDiagnostic({
                    time: new Date().toISOString(),
                    response: { success: false, message: String(e?.message || e || '未知错误') }
                });
                notify(paymentStarted ? '送礼结果暂未确认，请先检查余额和礼物记录，勿重复发送' : `出错: ${e.message}`, 3000);
            } finally {
                liveGiftSending = false;
                if (numInput) numInput.disabled = false;
                const selectionUnchanged = typeof getSelectedLiveGiftId === 'function' && getSelectedLiveGiftId() === selectedLiveGiftId;
                btn.disabled = !selectionUnchanged || !isCurrentGiftTarget(token, liveId);
                btn.innerText = btn.disabled ? window.YayaRendererUtils.t('发送') : originalText;
                if (refreshGiftList && isCurrentGiftTarget(token, liveId)) void renderLiveGiftGrid();
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
