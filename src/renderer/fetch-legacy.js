        let appToken = '';
        let lastNextTime = 0;
        let isAutoFetching = false;
        let currentFetchStopKey = '';
        let currentFetchStoppedAtPrevious = false;

        function getFetchBoundaryStorageKey(serverId, channelId, fetchAllMode) {
            return `yaya_fetch_boundary::${serverId || ''}::${channelId || ''}::${fetchAllMode ? 'all' : 'member'}`;
        }

        function buildFetchMessageKey(message) {
            if (!message) return '';

            let bodySeed = '';
            try {
                bodySeed = typeof message.bodys === 'string'
                    ? message.bodys
                    : JSON.stringify(message.bodys || message.msgContent || '');
            } catch (error) {
                bodySeed = String(message.bodys || message.msgContent || '');
            }

            return [
                message.id || message.msgId || message.messageId || message.clientMsgId || '',
                message.msgTime || '',
                message.msgType || '',
                message.senderUserId || message.senderId || message.uid || '',
                bodySeed
            ].join('|');
        }

        function loadFetchBoundary(serverId, channelId, fetchAllMode) {
            try {
                return localStorage.getItem(getFetchBoundaryStorageKey(serverId, channelId, fetchAllMode)) || '';
            } catch (error) {
                return '';
            }
        }

        function saveFetchBoundary(serverId, channelId, fetchAllMode, message) {
            const boundaryKey = buildFetchMessageKey(message);
            if (!boundaryKey) return;

            try {
                localStorage.setItem(getFetchBoundaryStorageKey(serverId, channelId, fetchAllMode), boundaryKey);
            } catch (error) {
            }
        }

        function clearFetchBoundary() {
            const serverId = document.getElementById('tool-server').value.trim();
            const channelId = document.getElementById('tool-channel').value.trim();
            const statusEl = document.getElementById('fetch-status');

            if (!channelId) {
                showToast('请先选择成员或填写房间参数');
                return;
            }

            try {
                localStorage.removeItem(getFetchBoundaryStorageKey(serverId, channelId, isFetchAllMode));
            } catch (error) {
            }

            currentFetchStopKey = '';
            currentFetchStoppedAtPrevious = false;

            if (statusEl) {
                statusEl.innerHTML = '已清除当前房间抓取边界';
            }

            showToast('已清除当前房间抓取边界');
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function fetchAllMsgs() {
            const btn = document.getElementById('btn-fetch-all');
            const fetchBtn = document.getElementById('btn-fetch-one');
            const box = document.getElementById('msg-result');
            const memberSearch = document.getElementById('member-search');
            const exportBtn = document.getElementById('btn-export-html');
            const exportLocalBtn = document.getElementById('btn-export-local');
            const toggleBtn = document.getElementById('btn-toggle-mode');
            const clearBoundaryBtn = document.getElementById('btn-clear-fetch-boundary');

            if (isAutoFetching) {
                isAutoFetching = false;
                btn.innerText = '加载全部';
                btn.style.background = '';
                btn.style.color = '';
                if (fetchBtn) fetchBtn.disabled = false;
                if (memberSearch) memberSearch.disabled = false;
                if (toggleBtn) toggleBtn.disabled = false;
                if (clearBoundaryBtn) clearBoundaryBtn.disabled = false;
                if (allFetchedMsgs.length > 0) {
                    if (exportBtn) exportBtn.disabled = false;
                    if (exportLocalBtn) exportLocalBtn.disabled = false;
                }
                return;
            }


            const channelId = document.getElementById('tool-channel').value.trim();
            if (!channelId) {
                box.innerHTML = `<div style="text-align:center; padding:20px; color:#ff4d4f;">⚠️ 请先在搜索框输入名字并选择成员</div>`;
                return;
            }

            isAutoFetching = true;
            btn.innerText = '停止加载';
            btn.style.background = '#ff4d4f';
            btn.style.color = 'white';
            if (fetchBtn) fetchBtn.disabled = true;
            if (memberSearch) memberSearch.disabled = true;
            if (exportBtn) exportBtn.disabled = true;
            if (exportLocalBtn) exportLocalBtn.disabled = true;
            if (toggleBtn) toggleBtn.disabled = true;
            if (clearBoundaryBtn) clearBoundaryBtn.disabled = true;

            try {
                if (lastNextTime === 0 || box.children.length <= 1) {
                    await fetchMsgs(false);
                    await sleep(50);
                }

                while (isAutoFetching && lastNextTime > 0) {

                    const lastEl = box.lastElementChild;
                    if (lastEl && lastEl.innerText.includes('加载更多')) lastEl.remove();

                    await fetchMsgs(true);
                    await sleep(50);
                }
            } catch (e) {
                console.error("自动抓取中断", e);
            } finally {
                isAutoFetching = false;
                btn.innerText = '加载全部';
                btn.style.background = '';
                btn.style.color = '';
                if (fetchBtn) fetchBtn.disabled = false;
                if (memberSearch) memberSearch.disabled = false;
                if (toggleBtn) toggleBtn.disabled = false;
                if (clearBoundaryBtn) clearBoundaryBtn.disabled = false;

                const statusEl = document.getElementById('fetch-status');
                if (statusEl && statusEl.innerHTML) {
                    statusEl.innerHTML += currentFetchStoppedAtPrevious
                        ? ' <b style="color:#28a745; margin-left:5px;">(已停在上次抓取位置)</b>'
                        : ' <b style="color:#28a745; margin-left:5px;">(完成)</b>';
                }
                if (allFetchedMsgs.length > 0) {
                    if (exportBtn) exportBtn.disabled = false;
                    if (exportLocalBtn) exportLocalBtn.disabled = false;
                }
            }
        }

        let isFetchAllMode = false;

        function toggleFetchMode() {
            isFetchAllMode = !isFetchAllMode;
            const btn = document.getElementById('btn-toggle-mode');

            if (isFetchAllMode) {
                btn.innerHTML = "当前模式：全体消息";
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
            } else {
                btn.innerHTML = "当前模式：只看成员";
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
            }


        }


        let smsTimer = null;

        function switchLoginTab(type) {
            const tabSms = document.getElementById('tab-sms');
            const tabToken = document.getElementById('tab-token');
            const formSms = document.getElementById('form-sms');
            const formToken = document.getElementById('form-token');
            const msgDiv = document.getElementById('login-msg');

            msgDiv.innerText = '';

            if (type === 'sms') {
                tabSms.style.color = 'var(--primary)';
                tabSms.style.borderBottomColor = 'var(--primary)';
                tabSms.style.fontWeight = 'bold';

                tabToken.style.color = 'var(--text-sub)';
                tabToken.style.borderBottomColor = 'transparent';
                tabToken.style.fontWeight = 'normal';

                formSms.style.display = 'block';
                formToken.style.display = 'none';
            } else {
                tabToken.style.color = 'var(--primary)';
                tabToken.style.borderBottomColor = 'var(--primary)';
                tabToken.style.fontWeight = 'bold';

                tabSms.style.color = 'var(--text-sub)';
                tabSms.style.borderBottomColor = 'transparent';
                tabSms.style.fontWeight = 'normal';

                formToken.style.display = 'block';
                formSms.style.display = 'none';
            }
        }

        let currentVerifyAnswer = null;

        async function handleSendSms(answer = null) {
            const mobile = document.getElementById('login-mobile').value.trim();
            const area = document.getElementById('login-area').value.trim() || '86';
            const btn = document.getElementById('btn-send-sms');
            const msgBox = document.getElementById('login-msg');

            const verifyArea = document.getElementById('sms-verification-area');
            const verifyQuestion = document.getElementById('verify-question-text');
            const verifyOptions = document.getElementById('verify-options-container');

            if (!mobile) {
                msgBox.innerText = '请输入手机号';
                return;
            }

            if (!answer) {
                btn.disabled = true;
                btn.innerText = '发送中...';
            }

            msgBox.innerText = '';

            try {
                const res = await ipcRenderer.invoke('login-send-sms', { mobile, area, answer });

                if (res.success) {
                    if (verifyArea) verifyArea.style.display = 'none';

                    let count = 60;
                    btn.innerText = `${count}s`;
                    const timer = setInterval(() => {
                        count--;
                        btn.innerText = `${count}s`;
                        if (count <= 0) {
                            clearInterval(timer);
                            btn.disabled = false;
                            btn.innerText = '获取验证码';
                        }
                    }, 1000);

                    msgBox.style.color = '#28a745';
                    msgBox.innerText = '验证码已发送，请查收';

                } else if (res.needVerification) {
                    btn.disabled = false;
                    btn.innerText = '获取验证码';

                    msgBox.innerText = '';

                    if (verifyArea && verifyQuestion && verifyOptions) {
                        verifyArea.style.display = 'block';
                        verifyQuestion.innerText = res.question;
                        verifyOptions.innerHTML = '';

                        res.options.forEach(opt => {
                            const optBtn = document.createElement('button');
                            optBtn.className = 'btn btn-secondary';
                            optBtn.style.cssText = 'padding: 4px 10px; font-size: 12px;';
                            optBtn.innerText = opt.value;

                            optBtn.onclick = () => {
                                verifyQuestion.innerText = `正在验证: ${opt.value}...`;
                                verifyOptions.style.pointerEvents = 'none';
                                verifyOptions.style.opacity = '0.5';

                                handleSendSms(opt.option);
                            };

                            verifyOptions.appendChild(optBtn);
                        });

                        verifyOptions.style.pointerEvents = 'auto';
                        verifyOptions.style.opacity = '1';
                    }

                } else {
                    throw new Error(res.msg);
                }
            } catch (e) {
                btn.disabled = false;
                btn.innerText = '获取验证码';
                msgBox.style.color = '#ff4d4f';
                msgBox.innerText = e.message;

            }
        }

        function startCountdown(seconds) {
            const btn = document.getElementById('btn-send-sms');
            let left = seconds;

            btn.disabled = true;
            btn.innerText = `${left}s 后重试`;

            if (smsTimer) clearInterval(smsTimer);

            smsTimer = setInterval(() => {
                left--;
                if (left <= 0) {
                    clearInterval(smsTimer);
                    btn.disabled = false;
                    btn.innerText = '获取验证码';
                } else {
                    btn.innerText = `${left}s 后重试`;
                }
            }, 1000);
        }

        async function handleLoginByCode() {
            const mobile = document.getElementById('login-mobile').value.trim();
            const code = document.getElementById('login-code').value.trim();
            const msgDiv = document.getElementById('login-msg');

            if (!mobile || !code) {
                msgDiv.innerText = '请填写手机号和验证码';
                return;
            }

            msgDiv.innerText = '登录中...';
            msgDiv.style.color = 'var(--primary)';

            try {
                const res = await ipcRenderer.invoke('login-by-code', { mobile, code });

                if (res.status === 200 && res.success) {
                    const token = res.content.token;
                    const userInfo = res.content.userInfo;

                    localStorage.setItem('yaya_p48_token', token);
                    const tokenInput = document.getElementById('login-token');
                    if (tokenInput) tokenInput.value = token;

                    msgDiv.style.color = '#28a745';
                    msgDiv.innerText = '登录成功！正在跳转...';

                    setTimeout(() => {
                        checkToken();
                    }, 500);
                } else {
                    throw new Error(res.message || '登录失败');
                }
            } catch (err) {
                msgDiv.style.color = '#ff4d4f';
                msgDiv.innerText = '登录失败: ' + err.message;
            }
        }
        async function checkToken() {
            const tokenInput = document.getElementById('login-token').value.trim();
            const msgBox = document.getElementById('login-msg');
            const panelInput = document.getElementById('panel-login');
            const panelSuccess = document.getElementById('panel-logged-in');

            const accountArea = document.getElementById('account-switcher-area');
            const accountList = document.getElementById('account-list');

            if (!tokenInput) {
                if (msgBox) msgBox.innerText = '请输入 Token';
                return;
            }

            appToken = tokenInput;
            localStorage.setItem('yaya_p48_token', appToken);

            if (msgBox) {
                msgBox.innerText = '正在验证身份...';
                msgBox.style.color = '#666';
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('login-check-token', {
                    token: tokenInput,
                    pa
                });

                if (res.success) {
                    if (panelInput) panelInput.style.display = 'none';
                    if (panelSuccess) panelSuccess.style.display = 'block';

                    updateLocalGiftDatabase();

                    const userInfo = res.userInfo;
                    const safeName = userInfo?.baseUserInfo?.nickname || userInfo?.nickname || '口袋用户';
                    const userId = userInfo?.baseUserInfo?.userId || userInfo?.userId || userInfo?.id || 'Unknown';
                    document.getElementById('user-nickname').innerText = safeName;
                    const idDisplay = document.getElementById('user-id-display');
                    if (idDisplay) idDisplay.innerText = `ID: ${userId}`;
                    if (msgBox) msgBox.innerText = '';

                    if (accountArea && accountList) {
                        accountList.innerHTML = '';
                        let hasOtherAccounts = false;
                        const bigSmall = userInfo.bigSmallInfo;

                        const createCard = (user, type) => {
                            const card = document.createElement('div');
                            card.className = 'account-card';
                            card.title = `点击切换到: ${user.nickname}`;

                            let avatarUrl = 'https://source.48.cn/logo.png';
                            if (user.avatar) {
                                avatarUrl = user.avatar.startsWith('http') ? user.avatar : `https://source.48.cn${user.avatar}`;
                            }

                            const tagClass = type === 'main' ? 'tag-big' : 'tag-small';
                            const tagText = type === 'main' ? '主号' : '小号';

                            card.innerHTML = `
                        <img src="${avatarUrl}" class="account-card-avatar" onerror="this.src='./icon.png'">
                        <div class="account-card-info">
                            <div class="account-card-name">${user.nickname}</div>
                            <span class="tag-badge ${tagClass}">${tagText}</span>
                        </div>
                    `;

                            card.onclick = () => handleSwitchAccount(user.userId, user.nickname);
                            return card;
                        };

                        if (bigSmall) {
                            if (bigSmall.smallUserInfo && Array.isArray(bigSmall.smallUserInfo)) {
                                bigSmall.smallUserInfo.forEach(small => {
                                    if (String(small.userId) !== String(userInfo.userId)) {
                                        hasOtherAccounts = true;
                                        accountList.appendChild(createCard(small, 'small'));
                                    }
                                });
                            }

                            if (bigSmall.bigUserInfo && String(bigSmall.bigUserInfo.userId) !== String(userInfo.userId)) {
                                hasOtherAccounts = true;
                                accountList.insertBefore(createCard(bigSmall.bigUserInfo, 'main'), accountList.firstChild);
                            }
                        }

                        accountList.style.gridTemplateColumns = '1fr';
                        accountArea.style.display = hasOtherAccounts ? 'block' : 'none';
                    }

                } else {
                    if (panelInput) panelInput.style.display = 'block';
                    if (panelSuccess) panelSuccess.style.display = 'none';
                    if (msgBox) {
                        msgBox.style.color = '#ff4d4f';
                        msgBox.innerText = res.msg || 'Token 无效';
                    }
                }
            } catch (e) {
                console.error(e);
                if (panelInput) panelInput.style.display = 'block';
                if (panelSuccess) panelSuccess.style.display = 'none';
                if (msgBox) {
                    msgBox.style.color = '#ff4d4f';
                    msgBox.innerText = '验证出错: ' + e.message;
                }
            }
        }

        async function handleSwitchAccount(targetUserId, targetName) {

            const nickNameEl = document.getElementById('user-nickname');
            const originalName = nickNameEl.innerText;

            nickNameEl.innerText = `正在切换...`;

            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('switch-big-small', {
                    token: appToken,
                    pa: pa,
                    targetUserId: targetUserId
                });

                if (res.success) {
                    const newToken = res.content.token;
                    if (newToken) {
                        appToken = newToken;
                        localStorage.setItem('yaya_p48_token', newToken);
                        document.getElementById('login-token').value = newToken;

                        await checkToken();

                    } else {
                        throw new Error("接口未返回 Token");
                    }
                } else {
                    throw new Error(res.msg || "未知错误");
                }
            } catch (e) {
                showToast(`切换失败: ${e.message}`);
                nickNameEl.innerText = originalName;
            }
        }

        function copyToken() {
            const token = appToken || localStorage.getItem('yaya_p48_token');
            const btn = document.getElementById('btn-copy-token');

            if (token) {
                navigator.clipboard.writeText(token).then(() => {
                    const originalText = btn.innerText;
                    btn.innerText = "✅ 已复制";
                    btn.style.backgroundColor = "#28a745";
                    btn.style.color = "white";

                    setTimeout(() => {
                        btn.innerText = originalText;
                        btn.style.backgroundColor = "white";
                        btn.style.color = "#28a745";
                    }, 1500);
                }).catch(err => {
                    showToast('复制失败，请手动复制');
                });
            } else {
                showToast('❌ 当前未获取到 Token');
            }
        }

        function logout() {
            localStorage.removeItem('yaya_p48_token');
            appToken = '';

            const panelInput = document.getElementById('panel-login');
            const panelSuccess = document.getElementById('panel-logged-in');

            if (panelSuccess) panelSuccess.style.display = 'none';
            if (panelInput) panelInput.style.display = 'block';

            document.getElementById('login-token').value = '';
            const msgBox = document.getElementById('login-msg');
            if (msgBox) {
                msgBox.innerText = '记录已清除';
                msgBox.style.color = '#28a745';
            }

            const memberSearch = document.getElementById('member-search');
            if (memberSearch) {
                memberSearch.value = '';
            }
        }
        let allFetchedMsgs = [];
        async function fetchMsgs(isLoadMore = false) {
            const channelId = document.getElementById('tool-channel').value.trim();
            const serverId = document.getElementById('tool-server').value.trim();
            const box = document.getElementById('msg-result');
            const exportBtn = document.getElementById('btn-export-html');
            const exportLocalBtn = document.getElementById('btn-export-local');

            if (!channelId) {
                if (!isLoadMore) {
                    box.innerHTML = `<div style="text-align:center; padding:20px; color:#ff4d4f;">⚠️ 请先在搜索框输入名字并选择成员</div>`;
                } else {
                    console.warn("缺少 Channel ID");
                }
                isAutoFetching = false;
                const btn = document.getElementById('btn-fetch-all');
                if (btn) {
                    btn.innerText = '加载全部';
                    btn.style.background = '';
                    btn.style.color = '';
                }
                return;
            }

            if (!isLoadMore) {
                box.innerHTML = '';
                lastNextTime = 0;
                allFetchedMsgs = [];
                currentFetchStopKey = loadFetchBoundary(serverId, channelId, isFetchAllMode);
                currentFetchStoppedAtPrevious = false;
                const statusEl = document.getElementById('fetch-status');
                if (statusEl) statusEl.innerHTML = '';
                if (exportBtn) exportBtn.disabled = true;
            }

            const loadingDiv = document.createElement('div');
            loadingDiv.innerText = '加载中...';
            loadingDiv.style.textAlign = 'center';
            loadingDiv.style.color = '#999';
            loadingDiv.id = 'loading-indicator';
            box.appendChild(loadingDiv);

            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-room-messages', {
                    token: appToken,
                    serverId,
                    channelId,
                    pa,
                    nextTime: lastNextTime,
                    fetchAll: isFetchAllMode
                });

                if (document.getElementById('loading-indicator')) {
                    box.removeChild(document.getElementById('loading-indicator'));
                }

                if (res.success && res.data.content) {
                    if (res.usedServerId) document.getElementById('tool-server').value = res.usedServerId;
                    const content = res.data.content;

                    let list = content.messageList || content.message || [];

                    if (!isFetchAllMode) {
                        list = list.filter(m => {
                            let sid = m.senderUserId || m.senderId || m.uid;
                            if (!sid && m.extInfo) {
                                try {
                                    const ext = typeof m.extInfo === 'string' ? JSON.parse(m.extInfo) : m.extInfo;
                                    if (ext.user) sid = ext.user.userId || ext.user.id;
                                } catch (e) { }
                            }
                            return String(sid) !== '121569667';
                        });
                    }

                    let stoppedAtPreviousInThisBatch = false;
                    if (currentFetchStopKey) {
                        const stopIndex = list.findIndex(m => buildFetchMessageKey(m) === currentFetchStopKey);
                        if (stopIndex >= 0) {
                            list = list.slice(0, stopIndex);
                            stoppedAtPreviousInThisBatch = true;
                            currentFetchStoppedAtPrevious = true;
                        }
                    }

                    lastNextTime = stoppedAtPreviousInThisBatch ? 0 : content.nextTime;
                    if (list.length === 0) lastNextTime = 0;

                    if (list.length === 0 && !isLoadMore) {
                        if (!isLoadMore) {
                            box.innerHTML = currentFetchStoppedAtPrevious
                                ? '<div style="text-align:center;padding:20px;color:#999">已到上次抓取位置，暂无新消息</div>'
                                : '<div style="text-align:center;padding:20px;color:#999">暂无新消息</div>';
                        }
                        return;
                    }

                    allFetchedMsgs = allFetchedMsgs.concat(list);
                    if (allFetchedMsgs.length > 0) {
                        saveFetchBoundary(serverId, channelId, isFetchAllMode, allFetchedMsgs[0]);
                    }
                    const statusEl = document.getElementById('fetch-status');
                    if (statusEl) {
                        let timeText = '';
                        if (list.length > 0) {
                            const lastMsg = list[list.length - 1];
                            const d = new Date(lastMsg.msgTime);
                            const pad = (n) => String(n).padStart(2, '0');

                            timeText = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                        }
                        statusEl.innerHTML = `已抓取 <b style="color:var(--primary)">${allFetchedMsgs.length}</b> 条 <span style="margin-left:5px; ">${timeText}</span>`;
                    }


                    const batchHtml = list.map(m => {

                        let txt = '[未知类型]';
                        let isMember = false;
                        let senderId = m.senderUserId || m.senderId || m.uid || '';
                        let extraHtml = '';

                        try {
                            let body = m.bodys;
                            if (m.msgContent) body = m.msgContent;

                            if (m.extInfo) {
                                const ext = typeof m.extInfo === 'string' ? JSON.parse(m.extInfo) : m.extInfo;
                                if (ext.user) {
                                    if (ext.user.roleId > 1) isMember = true;
                                    if (!senderId) senderId = ext.user.userId || ext.user.id;
                                }
                            }

                            if (typeof body === 'string' && (body.startsWith('{') || body.startsWith('['))) {
                                const json = JSON.parse(body);

                                if (m.msgType === 'text') txt = replaceTencentEmoji(json.text);
                                else if (m.msgType === 'image') txt = `[图片] 链接请见下方`;
                                else if (m.msgType === 'reply') txt = `回复: ${json.text}`;
                                else if (m.msgType === 'express') txt = `[表情]`;
                                else if (m.msgType === 'SHARE_LIVE' || (json && json.messageType === 'SHARE_LIVE')) {
                                    const info = json.shareInfo || {};
                                    txt = `[直播分享] ${info.shareTitle || '点击查看'}`;
                                }

                                else if (m.msgType === 'LIVEPUSH' || m.msgType === 'live_push') {
                                    const info = json.livePushInfo || json;
                                    const liveTitle = info.liveTitle || '直播';
                                    const liveId = info.liveId;

                                    txt = `[直播通知] ${liveTitle}`;

                                    if (liveId) {
                                        m.tempLiveId = liveId;
                                    }
                                }

                                else if (json.messageType === 'GIFT_TEXT' || m.msgType === 'GIFT_TEXT') {
                                    const info = json.giftInfo || json;

                                    let unitCost = info.money || info.cost;
                                if (!unitCost && typeof POCKET_GIFT_DATA !== 'undefined') {
                                    const g = POCKET_GIFT_DATA.find(x => x.id == (info.giftId || info.id) || x.name === info.giftName);
                                    if (g) unitCost = g.cost;
                                }
                                const totalCostStr = unitCost ? ` (约 ${unitCost * info.giftNum} 🍗)` : '';

                                txt = `🎁 送出了 [${info.giftName}] x${info.giftNum}${totalCostStr}`;
                            }
                            else if ((json.messageType || '').toUpperCase().startsWith('RED_PACKET')) {
                                const esc = (value) => String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                const blessMessage = esc(json.blessMessage || '送来了红包祝福');
                                const creatorName = esc(json.creatorName || '未知用户');
                                const starName = esc(json.starName || '');
                                const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
                                const packetMainTextColor = isDarkTheme ? 'rgba(255,255,255,0.96)' : '#333';
                                const packetMetaTextColor = isDarkTheme ? 'rgba(255,255,255,0.82)' : '#444';
                                const packetImage = fix48Url(json.openImgUrl || json.coverUrl);
                                txt = '';

                                extraHtml = `
        <div style="display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:10px; background: linear-gradient(135deg, rgba(255,120,117,0.12) 0%, rgba(255,120,117,0.04) 100%), rgba(0,0,0,0.02); border:1px solid rgba(255,110,110,0.2); width:220px; max-width:220px; box-sizing:border-box;">
            <img src="${packetImage}" style="width:34px; height:34px; object-fit:cover; border-radius:6px; flex-shrink:0; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
            <div style="min-width:0; flex:1;">
                <div style="font-size:10px; color:#ff7875; font-weight:bold; margin-bottom:2px;">红包</div>
                <div style="font-size:12px; color:${packetMainTextColor}; font-weight:bold; line-height:1.35; word-break:break-word;">${blessMessage}</div>
                <div style="font-size:11px; color:${packetMetaTextColor}; margin-top:4px; line-height:1.35; word-break:break-word;">${creatorName}${starName ? ` · ${starName}` : ''}</div>
            </div>
        </div>
    `;
                            }
                            else if (
                                m.msgType === 'AUDIO_GIFT_REPLY' ||
                                json.messageType === 'AUDIO_GIFT_REPLY' ||
                                m.msgType === 'AUDIO_REPLY' ||
                                json.messageType === 'AUDIO_REPLY'
                                ) {
                                    const info = json.replyInfo || json.giftReplyInfo || json;
                                    const voiceUrl = fix48Url(info.voiceUrl);
                                    const rName = info.replyName || '未知用户';
                                    const rText = info.replyText || '';
                                    txt = '';

                                    extraHtml = `
        <div style="margin-bottom:8px;">
            <audio controls src="${voiceUrl}" style="height:30px; max-width: 100%;"></audio>
        </div>
        <div style="padding: 4px; color: #666; background: rgba(0,0,0,0.03); border-radius: 4px;">
            ${rName}: ${rText}
        </div>
    `;
                                }
                            } else {
                                txt = replaceTencentEmoji(body);
                            }
                        } catch (e) {
                            let raw = m.msgContent || m.bodys || '解析错误';
                            txt = replaceTencentEmoji(raw);
                        }

                        const time = new Date(m.msgTime).toLocaleString();
                        const nameColor = isMember ? '#FB7299' : '#333333';
                        const safeTxt = String(txt).replace(/</g, '&lt;').replace(/>/g, '&gt;');

                        const displayName = m.senderName || (m.extInfo && (typeof m.extInfo === 'string' ? JSON.parse(m.extInfo) : m.extInfo).user.nickName) || '未知用户';
                        const idDisplay = (senderId && String(senderId) !== '0')
                            ? `<span style="color:#999; font-size:10px; margin-left:6px; ">(ID:${senderId})</span>`
                            : '';


                        return `<div class="msg-item" style="padding:8px 0; border-bottom:1px solid #eee; font-size:13px;">
        <div style="color:#999; font-size:11px; margin-bottom:2px; display:flex; align-items:center;">
        <span style="margin-right: 5px;">${time}</span>
        <span style="color:${nameColor}; font-weight:${isMember ? 'bold' : 'normal'}">${displayName}</span>
        ${idDisplay}
        </div>
        <div style="color:#333; line-height:1.4; word-break: break-all;">
            ${safeTxt}
            ${extraHtml} 
        </div> 
    </div>`;
                    }).join('');

                    const range = document.createRange();
                    range.selectNodeContents(box);
                    const fragment = range.createContextualFragment(batchHtml);

                    const oldBtn = document.getElementById('btn-load-more-msg');
                    if (oldBtn) oldBtn.remove();

                    box.appendChild(fragment);
                    const MAX_DISPLAY_COUNT = 1000;
                    const msgItems = box.getElementsByClassName('msg-item');

                    if (msgItems.length > MAX_DISPLAY_COUNT) {
                        const removeCount = msgItems.length - MAX_DISPLAY_COUNT;
                        for (let i = 0; i < removeCount; i++) {
                            if (msgItems[0]) msgItems[0].remove();
                        }
                    }

                    if (lastNextTime > 0) {
                        const moreBtnFragment = document.createRange().createContextualFragment(`
                    <div id="btn-load-more-msg">
                        <button style="width:100%; margin-top:10px; padding:8px; cursor:pointer; background:#f0f0f0; border:1px solid #ddd; border-radius:4px;" onclick="fetchMsgs(true)">加载更多...</button>
                    </div>
                `);
                        box.appendChild(moreBtnFragment);
                    }
                    if (!isAutoFetching) {
                        if (exportBtn) exportBtn.disabled = false;
                        if (exportLocalBtn) exportLocalBtn.disabled = false;
                    }
                } else {
                    if (!isLoadMore) box.innerText = '获取失败: ' + (res.msg || 'API Error');
                }
            } catch (e) {
                if (!isLoadMore) box.innerText = '出错: ' + e.message;
            }
        }

        async function exportMsgsToHtml() {
            if (allFetchedMsgs.length === 0) return showToast('没有消息可导出');
            const fix48Url = (path) => {
                if (!path) return 'https://www.snh48.com/images/logo_snh48.jpg';
                if (/^https?:\/\//i.test(path)) return path;
                if (path.includes('48.cn')) {
                    return `https://${path.replace(/^\/+/, '')}`;
                }
                const baseUrl = 'https://source3.48.cn';
                return path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
            };
            const styleValue = `
                    body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; background-color: #f6f8fa; padding: 20px; }
                    .template-body { width: 100%; max-width: 900px; margin: 0 auto; }
                    .template-media { max-width: 600px; border-radius: 6px; margin-top: 5px; }
                    .template-image-express-image { max-width: 85px; }
                    .template-pre { white-space: pre-wrap; word-break: break-all; margin-bottom: 8px; }
                    .avatar-5 { width: 32px; height: 32px; } 
                    .color-bg-accent { background-color: #f6f8fa; } 
                    .color-fg-accent { color: #0969da; text-decoration: none; }
                `;
            const buildExportKey = (message, exportUserId, rawBody) => {
                const primaryId = message.id || message.msgId || message.messageId || message.clientMsgId || '';
                const normalizedBody = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});
                const seed = [
                    primaryId,
                    message.msgTime || '',
                    message.msgType || '',
                    exportUserId || '',
                    normalizedBody
                ].join('|');

                let hash = 0;
                for (let i = 0; i < seed.length; i += 1) {
                    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
                    hash |= 0;
                }

                return `msg_${Math.abs(hash)}_${message.msgTime || 0}`;
            };

            const exportEntries = [];

            allFetchedMsgs.forEach(m => {
                let contentHtml = '';
                let userHtml = '';
                let timeStr = '';
                let exportKey = '';
                try {


                    let avatarUrl = 'https://www.snh48.com/images/logo_snh48.jpg';
                    let nickName = m.senderName || '未知用户';
                    let exportUserId = '';
                    let exportRoleId = 0;

                    if (m.senderUserId) exportUserId = m.senderUserId;

                    if (m.extInfo) {
                        try {
                            const ext = typeof m.extInfo === 'string' ? JSON.parse(m.extInfo) : m.extInfo;
                            if (ext.user) {
                                nickName = ext.user.nickName;
                                if (ext.user.avatar) avatarUrl = fix48Url(ext.user.avatar);
                                if (!exportUserId) exportUserId = ext.user.userId || ext.user.id;

                                if (ext.user.roleId) exportRoleId = ext.user.roleId;
                            }
                        } catch (e) { }
                    }

                    userHtml = `
                <div class="mb-2">
                    <img class="avatar avatar-5 mr-2" src="${avatarUrl}" loading="lazy"/>
                    <span data-userid="${exportUserId}" data-roleid="${exportRoleId}">${nickName}</span> 
                </div>
            `;
                    let body = m.bodys || m.msgContent;
                    if (typeof body === 'string' && (body.startsWith('{') || body.startsWith('['))) {
                        try {
                            const json = JSON.parse(body);
                            if (m.msgType === 'TEXT') {
                                const text = json.bodys || json.text || body;
                                contentHtml = `<p class="mb-2 template-pre">${text}</p>`;
                            } else if (m.msgType === 'IMAGE') {
                                const url = fix48Url(json.url);
                                contentHtml = `
                                            <div class="mb-2">
                                            <img class="template-media" src="${url}" loading="lazy" style="cursor: default;"/>
                                            </div>
                                            <div class="mb-2">
                                            </div>`;
                            } else if (json.messageType === 'GIFT_TEXT' || m.msgType === 'GIFT_TEXT') {
                                const info = json.giftInfo || json;
                                const giftImg = info.picPath ? fix48Url(info.picPath) : '';

                                let unitCost = info.money || info.cost;
                                if (!unitCost && typeof POCKET_GIFT_DATA !== 'undefined') {
                                    const g = POCKET_GIFT_DATA.find(x => x.id == (info.giftId || info.id) || x.name === info.giftName);
                                    if (g) unitCost = g.cost;
                                }
                                const costDisplay = unitCost ? `<span style="margin-left:5px; color:#fa8c16; font-weight:bold;">(${unitCost * info.giftNum}🍗)</span>` : '';

                                contentHtml = `
        <div class="mb-2" style="display:flex; align-items:center; background:#fff0f6; padding:6px 8px; border-radius:6px; border:1px solid #ffadd2; max-width: 300px;">
            ${giftImg ? `<img src="${giftImg}" style="width: 25px !important; height: 25px !important; max-width: 32px !important; max-height: 32px !important; object-fit: contain !important; margin: 0 8px 0 0 !important; border-radius: 4px; box-shadow: none !important;">` : '<span style="font-size:24px; margin-right:8px;">🎁</span>'}
            <div style="flex: 1; overflow: hidden;">
                <div style="color:#eb2f96; font-weight:bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">送出礼物：${info.giftName}</div>
                <div style="font-size:11px; color:#888;">数量: x${info.giftNum} ${costDisplay}</div>
            </div>
        </div>`;
                            } else if ((json.messageType || '').toUpperCase().startsWith('RED_PACKET')) {
                                const blessMessage = String(json.blessMessage || '送来了红包祝福').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                const creatorName = String(json.creatorName || nickName || '未知用户').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                const starName = String(json.starName || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
                                const packetMainTextColor = isDarkTheme ? 'rgba(255,255,255,0.96)' : '#24292f';
                                const packetMetaTextColor = isDarkTheme ? 'rgba(255,255,255,0.82)' : '#444';
                                const packetImage = fix48Url(json.openImgUrl || json.coverUrl);
                                contentHtml = `
        <div class="mb-2" style="display:flex; gap:8px; align-items:center; background:linear-gradient(135deg, rgba(255,120,117,0.12) 0%, rgba(255,120,117,0.04) 100%), rgba(0,0,0,0.02); padding:6px 8px; border-radius:10px; border:1px solid rgba(255,110,110,0.22); width: 220px; max-width: 220px; box-sizing: border-box;">
            <img src="${packetImage}" style="width:34px; height:34px; border-radius:6px; object-fit:cover; flex-shrink:0; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
            <div style="min-width:0; flex:1;">
                <div style="font-size:10px; color:#ff7875; font-weight:bold; margin-bottom:2px;">红包</div>
                <div style="font-size:12px; color:${packetMainTextColor}; font-weight:bold; line-height:1.35; word-break:break-word;">${blessMessage}</div>
                <div style="font-size:11px; color:${packetMetaTextColor}; margin-top:4px; line-height:1.35; word-break:break-word;">${creatorName}${starName ? ` · ${starName}` : ''}</div>
            </div>
        </div>`;
                            } else if (m.msgType === 'VIDEO') {
                                const url = fix48Url(json.url);
                                contentHtml = `
                            <div class="mb-2">
                                <video class="template-media" src="${url}" controls></video>
                            </div>
                            <div class="mb-2">
                                视频 - <a class="color-fg-accent" href="${url}" target="_blank">${url}</a>
                            </div>`;
                            } else if (m.msgType === 'AUDIO') {
                                const url = fix48Url(json.url);
                                contentHtml = `
                            <div class="mb-2">
                                <audio class="template-media" src="${url}" controls></audio>
                            </div>
                            <div class="mb-2">
                                语音 - <a class="color-fg-accent" href="${url}" target="_blank">${url}</a>
                            </div>`;
                            } else if (m.msgType === 'REPLY' || m.msgType === 'GIFTREPLY') {
                                let info = json.replyInfo || json.giftReplyInfo;
                                if (!info && json.bodys) info = json.bodys.replyInfo || json.bodys.giftReplyInfo;
                                const myText = info?.text || json.text || body;
                                const rName = info?.replyName || '未知用户';
                                const rText = info?.replyText || '未知消息';
                                contentHtml = `<p class="mb-2 template-pre">${myText}</p>`;
                                contentHtml += `
                            <blockquote class="ml-2 mb-2 p-2 color-bg-accent template-pre" style="border-left: 4px solid #d0d7de; color: #57606a;">
                                ${rName}：${rText}
                            </blockquote>`;
                            } else if (m.msgType === 'EXPRESSIMAGE') {
                                let url = '';
                                if (json.expressImgInfo) url = fix48Url(json.expressImgInfo.emotionRemote);
                                else if (json.url) url = fix48Url(json.url);
                                contentHtml = `<div class="mb-2"><img class="template-image-express-image" src="${url}"/></div>`;
                            } else if (m.msgType === 'LIVEPUSH') {
                                const info = json.livePushInfo || {};
                                const title = info.liveTitle || '直播开始了';
                                const liveId = info.liveId;

                                let coverUrl = '';
                                if (info.liveCover) {
                                    if (info.liveCover.startsWith('http')) {
                                        coverUrl = info.liveCover;
                                    } else {
                                        coverUrl = 'https://source.48.cn' + info.liveCover;
                                    }
                                }

                                if (liveId) {
                                    contentHtml = `<a href="live/playdetail?id=${liveId}" data-title="${title}" data-cover="${coverUrl}" target="_blank" style="display:none"></a>`;
                                } else {
                                    contentHtml = `直播 - ${title}`;
                                }

                            } else if (m.msgType === 'SHARE_LIVE' || (json && json.messageType === 'SHARE_LIVE')) {
                                const info = json.shareInfo || {};
                                const title = info.shareTitle || '直播分享';

                                let liveId = '';
                                if (info.jumpPath) {
                                    const match = info.jumpPath.match(/id=(\d+)/);
                                    if (match) liveId = match[1];
                                }

                                let coverUrl = '';
                                if (info.sharePic) {
                                    if (info.sharePic.startsWith('http')) {
                                        coverUrl = info.sharePic;
                                    } else {
                                        coverUrl = 'https://source.48.cn' + info.sharePic;
                                    }
                                }

                                const memberName = info.liveUserName || '';

                                if (liveId) {
                                    contentHtml = `<a href="live/playdetail?id=${liveId}" data-title="${title}" data-cover="${coverUrl}" data-member="${memberName}" target="_blank" style="display:none"></a>`;
                                } else {
                                    contentHtml = `[分享] ${title}`;
                                }
                            } else if (
                                m.msgType === 'AUDIO_GIFT_REPLY' ||
                                (json && json.messageType === 'AUDIO_GIFT_REPLY') ||
                                m.msgType === 'AUDIO_REPLY' ||
                                (json && json.messageType === 'AUDIO_REPLY')
                            ) {
                                const info = json.replyInfo || json.giftReplyInfo || json;
                                const voiceUrl = fix48Url(info.voiceUrl);
                                const rName = info.replyName || '未知用户';
                                const rText = info.replyText || '';
                                contentHtml = `
        <div class="mb-2">
            <audio class="template-media" src="${voiceUrl}" controls></audio>
        </div>
        <div class="mb-2">
            语音 - <a class="color-fg-accent" href="${voiceUrl}" target="_blank">${voiceUrl}</a>
        </div>
        <blockquote class="ml-2 mb-2 p-2 color-bg-accent template-pre" style="border-left: 4px solid #d0d7de; color: #57606a;">
            ${rName}：${rText}
        </blockquote>`;

                            } else if (['FLIPCARD', 'FLIPCARD_AUDIO', 'FLIPCARD_VIDEO'].includes(m.msgType)) {
                                const possibleKeys = ['flipCardInfo', 'filpCardInfo', 'flipCardAudioInfo', 'filpCardAudioInfo', 'flipCardVideoInfo', 'filpCardVideoInfo'];
                                let info = null;
                                for (const key of possibleKeys) {
                                    if (json[key]) {
                                        info = json[key];
                                        break;
                                    }
                                    if (json.bodys && json.bodys[key]) {
                                        info = json.bodys[key];
                                        break;
                                    }
                                }
                                const q = info?.question || json.question || '问题';
                                let a = info?.answer || json.answer || '回答';
                                let mediaHtml = '';
                                if (m.msgType !== 'FLIPCARD') {
                                    try {
                                        const answerObj = typeof a === 'string' ? JSON.parse(a) : a;
                                        if (answerObj && answerObj.url) {
                                            let rawUrl = answerObj.url;
                                            let mediaUrl;
                                            if (!rawUrl.includes('48.cn')) {
                                                mediaUrl = `https://mp4.48.cn/${rawUrl.replace(/^\/+/, '')}`;
                                            } else {
                                                mediaUrl = fix48Url(rawUrl);
                                            }
                                            if (m.msgType === 'FLIPCARD_VIDEO') {
                                                mediaHtml = `<div class="mb-2"><video class="template-media" src="${mediaUrl}" controls preload="metadata"></video></div>`;
                                                a = `<a class="color-fg-accent template-pre" href="${mediaUrl}" target="_blank">${mediaUrl}</a>`;
                                            } else {
                                                mediaHtml = `<div class="mb-2"><audio class="template-media" src="${mediaUrl}" controls preload="metadata"></audio></div>`;
                                                a = `<a class="color-fg-accent template-pre" href="${mediaUrl}" target="_blank">${mediaUrl}</a>`;
                                            }
                                        }
                                    } catch (e) {
                                        console.error('翻牌解析失败', e);
                                    }
                                }
                                contentHtml = `
                                        <p class="mb-2"><strong>翻牌问题：</strong>${q}</p>
                                        <p class="mb-2"><strong>回答：</strong>${a}</p>
                                        ${mediaHtml}
                                    `;
                            } else {
                                contentHtml = `<p class="mb-2 template-pre">${replaceTencentEmoji(body)}</p>`;
                            }
                        } catch (e) {
                            contentHtml = `<p class="mb-2 template-pre">${replaceTencentEmoji(body)}</p>`;
                        }
                    } else {
                        contentHtml = `<p class="mb-2 template-pre">${replaceTencentEmoji(body)}</p>`;
                    }
                    const d = new Date(m.msgTime);
                    const pad = (n) => String(n).padStart(2, '0');
                    timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                    exportKey = buildExportKey(m, exportUserId, body);
                } catch (e) {
                    console.error(e);
                    contentHtml = `<p class="mb-2" style="color:red">解析错误</p>`;
                    timeStr = timeStr || new Date(m.msgTime || Date.now()).toLocaleString();
                    exportKey = buildExportKey(m, '', m.msgContent || m.bodys || '');
                }

                const itemHtml = `
            <li class="Box-row" data-export-key="${exportKey}">
                ${userHtml}
                ${contentHtml}
                <time class="d-block">${timeStr}</time>
            </li>
        `;

                exportEntries.push({
                    key: exportKey,
                    sortTime: Number(m.msgTime) || Date.parse(timeStr) || 0,
                    itemHtml
                });
            });

            const memberName = currentSelectedMemberName || document.getElementById('member-search').value.trim() || '未命名成员';
            const exportBtn = document.getElementById('btn-export-html');
            const originalBtnText = exportBtn.innerText;
            const box = document.getElementById('msg-result');
            const tip = document.createElement('div');
            tip.style.cssText = "text-align:center; color:#28a745; margin-top:10px; font-weight:bold; padding:5px; border:1px solid #28a745; border-radius:4px; background:rgba(40,167,69,0.1);";

            try {
                exportBtn.innerText = "正在导出";
                exportBtn.disabled = true;

                const res = await window.ipcRenderer.invoke('save-export-html', {
                    memberName: memberName,
                    title: '口袋消息导出',
                    styleValue,
                    entries: exportEntries
                });

                if (!res || !res.success) {
                    throw new Error((res && res.msg) || '导出失败');
                }

                const fileName = res.path ? window.desktop.path.basename(res.path) : 'yaya_export.html';
                exportBtn.innerText = res.changed ? "导出成功" : "没有新增";
                exportBtn.style.backgroundColor = res.changed ? "#28a745" : "#6c757d";
                exportBtn.style.color = "white";
                tip.innerText = res.changed
                    ? `已新增 ${res.addedCount} 条，共 ${res.totalCount} 条: ${window.desktop.storagePaths.htmlDir}\\${memberName}\\${fileName}`
                    : `没有新增消息，共 ${res.totalCount} 条: ${window.desktop.storagePaths.htmlDir}\\${memberName}\\${fileName}`;
                box.appendChild(tip);

                setTimeout(() => {
                    exportBtn.innerText = originalBtnText;
                    exportBtn.style.backgroundColor = "";
                    exportBtn.style.color = "";
                    exportBtn.disabled = false;
                    tip.remove();

                    if (res.changed) {
                        switchView('messages');

                        const outputList = document.getElementById('outputList');
                        if (outputList) {
                            outputList.innerHTML = '<div class="placeholder-tip"><h3>🔄 正在读取新数据...</h3><p>由于导出内容已更新，分析可能需要一点时间。</p></div>';
                        }

                        if (typeof forceReloadData === 'function') {
                            requestAnimationFrame(() => {
                                setTimeout(() => {
                                    forceReloadData();
                                }, 50);
                            });
                        }
                    }
                }, 600);
            } catch (error) {
                exportBtn.innerText = originalBtnText;
                exportBtn.style.backgroundColor = "";
                exportBtn.style.color = "";
                exportBtn.disabled = false;
                showToast(`导出失败: ${error.message}`);
            }
        }

        function showToast(msg) {
            const div = document.createElement('div');
            div.className = 'toast-msg';
            div.innerText = msg;
            document.body.appendChild(div);
            setTimeout(() => {
                if (div.parentNode) div.parentNode.removeChild(div);
            }, 3000);
        }

        async function downloadMediaFileIconMode(url, filename, btnElement, originalIcon, dlType = 'media', subFolder = '') {
            if (btnElement && btnElement.disabled) return false;
            if (btnElement) {
                btnElement.disabled = true;
                btnElement.innerHTML = `
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" style="animation: spin 1s linear infinite;">
                        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                        <path d="M12 2a10 10 0 0 1 10 10"></path>
                    </svg>
                `;
            }

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('网络请求失败');

                const customPath = localStorage.getItem(`yaya_path_${dlType}`);

                if (customPath && typeof fs !== 'undefined' && typeof path !== 'undefined') {
                    let finalDir = customPath;

                    if (subFolder) {
                        const safeSubFolder = subFolder.replace(/[\\/:*?"<>|]/g, '_');
                        finalDir = path.join(customPath, safeSubFolder);
                        if (!fs.existsSync(finalDir)) {
                            fs.mkdirSync(finalDir, { recursive: true });
                        }
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const fullPath = path.join(finalDir, filename);

                    await new Promise((resolve, reject) => {
                        fs.writeFile(fullPath, buffer, (err) => err ? reject(err) : resolve());
                    });
                } else {
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                }

                if (btnElement) {
                    btnElement.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    setTimeout(() => { btnElement.disabled = false; btnElement.innerHTML = originalIcon; }, 2000);
                }
                return true;
            } catch (e) {
                console.error('下载失败:', e);
                if (btnElement) {
                    btnElement.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="#ff4d4f" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                    setTimeout(() => { btnElement.disabled = false; btnElement.innerHTML = originalIcon; }, 2000);
                }
                showToast(`❌ 下载失败: ${e.message}`);
                return false;
            }
        }

        function showCustomConfirm(text, onConfirm) {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = `
        <div class="confirm-box">
            <div class="confirm-text">${text}</div>
            <div class="confirm-btns">
                <button class="confirm-btn cancel">取消</button>
                <button class="confirm-btn ok">确定</button>
            </div>
        </div>
    `;

            const btnCancel = overlay.querySelector('.cancel');
            const btnOk = overlay.querySelector('.ok');

            function close() {
                document.body.removeChild(overlay);
            }

            btnCancel.onclick = () => {
                close();
            };

            btnOk.onclick = () => {
                close();
                if (onConfirm) onConfirm();
            };

            document.body.appendChild(overlay);
        }

        function showUserGifts(uid, name) {
            closeGiftAnalysis();

            const contentInput = document.getElementById('search-content-input');

            if (uid) {
                if (typeof filterByUserId === 'function') filterByUserId(uid);
            } else {
                if (typeof filterByUser === 'function') filterByUser(name);
            }

            if (contentInput) {
                setTimeout(() => {
                    contentInput.value = "送出礼物";

                    contentInput.dispatchEvent(new Event('input'));
                }, 100);
            }
        }


        async function checkNetworkStatus() {
            const display = document.getElementById('ip-info-display');
            const btn = document.getElementById('btn-check-ip');

            btn.disabled = true;
            btn.innerText = '检测中';
            display.innerHTML = '<div class="spinner"></div><span style="margin-left:10px;">正在查询网络信息...</span>';
            display.style.display = 'flex';

            try {
                const res = await ipcRenderer.invoke('check-ip-info');

                if (res.success) {
                    const data = res.data;

                    display.style.display = 'block';
                    display.style.textAlign = 'left';

                    display.innerHTML = `
                <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px;">
                    <span style="color:var(--text-sub);">IP 地址:</span>
                    <span style="font-weight:bold; color:var(--primary); font-size: 16px;">${data.query}</span>
                    
                    <span style="color:var(--text-sub);">所在地:</span>
                    <span>${data.country} ${data.regionName} ${data.city}</span>
                    
                    <span style="color:var(--text-sub);">运营商:</span>
                    <span>${data.isp}</span>
                    
                    <span style="color:var(--text-sub);">ASN组织:</span>
                    <span>${data.as}</span>
                    
                    <span style="color:var(--text-sub);">时区:</span>
                    <span>${data.timezone}</span>
                </div>
            `;
                } else {
                    throw new Error(res.msg);
                }
            } catch (e) {
                display.style.display = 'flex';
                display.innerHTML = `<span style="color: #ff4d4f;">❌ 检测失败: ${e.message}</span>`;
            } finally {
                btn.disabled = false;
                btn.innerText = '重新检测';
            }
        }

        async function checkAllNetwork() {
            const btn = document.getElementById('btn-check-all');
            btn.disabled = true;
            btn.innerText = '检测中';

            ['domestic', 'foreign', 'google'].forEach(type => {
                document.getElementById(`res-${type}`).innerHTML = '<div class="spinner"></div> 检测中';
            });

            const p1 = ipcRenderer.invoke('check-ip-domestic').then(res => renderDomestic(res));
            const p2 = ipcRenderer.invoke('check-ip-foreign').then(res => renderCommon('foreign', res));
            const p3 = ipcRenderer.invoke('check-ip-google').then(res => renderCommon('google', res));

            await Promise.allSettled([p1, p2, p3]);

            btn.disabled = false;
            btn.innerText = '重新检测';
        }

        function renderDomestic(res) {
            const el = document.getElementById('res-domestic');
            if (res.success) {
                const text = res.data;
                const ipMatch = text.match(/IP：(\d+\.\d+\.\d+\.\d+)/);
                const ip = ipMatch ? ipMatch[1] : '';
                const location = text.replace(`当前 IP：${ip}`, '').replace('来自于：', '').trim();

                el.innerHTML = `
            <span class="ip-highlight">${ip || text}</span>
            <div>${location}</div>
        `;
            } else {
                el.innerHTML = `<span class="status-fail">❌ 检测失败</span>`;
            }
        }

        function renderCommon(type, res) {
            const el = document.getElementById(`res-${type}`);

            if (res.success) {
                const data = res.data;
                const proxyTag = res.usedProxy
                    ? `<span style="font-size:10px; color:#52c41a; border:1px solid #52c41a; padding:0 3px; border-radius:3px; margin-left:5px;">${res.usedProxy}</span>`
                    : '';

                const address = `${data.country} ${data.regionName} ${data.city}`;

                el.innerHTML = `
            <div>
                <span class="ip-highlight" style="display:inline-block;">${data.query}</span>
                ${proxyTag}
            </div>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${address}">
                ${address}
            </div>
            <div style="font-size:12px; opacity:0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${data.isp}
            </div>
        `;
            } else {
                console.error('检测报错:', res.msg);
                el.innerHTML = `<span class="status-fail" title="${res.msg}">❌ ${res.msg.split('\n')[0]}</span>`;
            }
        }
