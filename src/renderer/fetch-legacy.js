        let appToken = '';
        let lastNextTime = 0;
        let isAutoFetching = false;
        let currentFetchStopKey = '';
        let currentFetchStoppedAtPrevious = false;
        let currentFetchedServerId = '';
        let currentFetchedChannelId = '';
        let currentFetchedFetchAllMode = false;
        let pocketGiftCacheSaveTimer = null;
        const AUTO_CHECKIN_ENABLED_KEY = 'yaya_auto_checkin_enabled';
        const AUTO_CHECKIN_LAST_DATE_KEY = 'yaya_auto_checkin_last_date';
        const AUTO_CHECKIN_LAST_USER_KEY = 'yaya_auto_checkin_last_user';
        const AUTO_MESSAGE_FETCH_SETTING_KEY = 'autoMessageFetch';
        const AUTO_MESSAGE_FETCH_DEFAULT_INTERVAL = 10;
        const AUTO_MESSAGE_FETCH_MAX_PAGES = 200;
        const AUTO_MESSAGE_FETCH_MEMBER_CONCURRENCY = 6;
        let autoMessageFetchTimer = null;
        let autoMessageFetchStartupTimer = null;
        let autoMessageFetchInFlight = false;
        let autoMessageFetchInitialized = false;
        let autoMessageFetchStartupArmed = false;
        let autoMessageFetchStartupCompleted = false;
        let autoMessageFetchDraftConfig = null;
        let autoMessageFetchDraftDirty = false;
        let autoMessageFetchAccountGeneration = 0;
        let currentPocketUserId = '';
        let currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
        let accountValidationGeneration = 0;
        let accountSwitchGeneration = 0;
        let selectedAccountAvatarFile = null;
        let selectedAccountAvatarDataUrl = '';
        let accountProfileStatusTimer = null;
        let autoCheckinInFlight = false;
        let autoCheckinGeneration = 0;
        let autoCheckinSettingsMigrated = false;
        const WEB_ACCOUNT_PROFILE_CACHE_KEY = 'yaya_web_account_profile_v1';
        let maskwordLibrary = [];

        function getAppSettingsApi() {
            return window.desktop && window.desktop.appSettings ? window.desktop.appSettings : null;
        }

        function getAppCacheApi() {
            return window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
        }

        function readStoredToken() {
            const settingsApi = getAppSettingsApi();
            if (settingsApi && typeof settingsApi.getTokenSync === 'function') {
                const storedToken = String(settingsApi.getTokenSync() || '').trim();
                if (storedToken) {
                    return storedToken;
                }
            }

            return String(localStorage.getItem('yaya_p48_token') || '').trim();
        }

        function writeStoredToken(token) {
            const normalizedToken = String(token || '').trim();
            const settingsApi = getAppSettingsApi();

            if (settingsApi && typeof settingsApi.setTokenSync === 'function') {
                settingsApi.setTokenSync(normalizedToken);
                localStorage.removeItem('yaya_p48_token');
                return normalizedToken;
            }

            if (normalizedToken) {
                localStorage.setItem('yaya_p48_token', normalizedToken);
            } else {
                localStorage.removeItem('yaya_p48_token');
            }

            return normalizedToken;
        }

        function clearStoredToken() {
            const settingsApi = getAppSettingsApi();
            if (settingsApi && typeof settingsApi.clearTokenSync === 'function') {
                settingsApi.clearTokenSync();
            }
            localStorage.removeItem('yaya_p48_token');
        }

        function readStoredMeet48Auth() {
            const settingsApi = getAppSettingsApi();
            if (settingsApi && typeof settingsApi.getSettingValueSync === 'function') {
                const auth = settingsApi.getSettingValueSync('meet48Auth', null);
                if (auth && typeof auth === 'object' && !Array.isArray(auth)) {
                    return {
                        token: String(auth.token || '').trim(),
                        cookie: String(auth.cookie || '').trim(),
                        deviceId: String(auth.deviceId || '').trim(),
                        disabled: auth.disabled === true
                    };
                }
            }
            return { token: '', cookie: '', deviceId: '', disabled: false };
        }

        function writeStoredMeet48Auth(auth) {
            const settingsApi = getAppSettingsApi();
            if (!settingsApi || typeof settingsApi.setSettingValueSync !== 'function') {
                throw new Error('当前环境不支持本机设置保存');
            }

            const normalized = {
                token: String(auth?.token || '').trim(),
                cookie: String(auth?.cookie || '').trim(),
                deviceId: String(auth?.deviceId || '').trim(),
                disabled: false
            };
            settingsApi.setSettingValueSync('meet48Auth', normalized);
            return normalized;
        }

        function clearStoredMeet48AuthValue() {
            const settingsApi = getAppSettingsApi();
            if (settingsApi && typeof settingsApi.removeSettingValueSync === 'function') {
                settingsApi.removeSettingValueSync('meet48Auth');
            }
        }

        function setMeet48LoginStatus(message, type = 'muted') {
            const statusEl = document.getElementById('meet48-login-status');
            if (!statusEl) return;
            statusEl.innerText = message;
            statusEl.style.color = type === 'success'
                ? '#28a745'
                : (type === 'error' ? '#ff4d4f' : 'var(--text-sub)');
        }

        function clearMeet48AuthFields() {
            const tokenInput = document.getElementById('meet48-token');
            const cookieInput = document.getElementById('meet48-cookie');
            if (tokenInput) tokenInput.value = '';
            if (cookieInput) cookieInput.value = '';
        }

        function getHeaderValue(headers, name) {
            const target = String(name || '').toLowerCase();
            if (!Array.isArray(headers)) return '';
            const found = headers.find(header => String(header?.name || '').toLowerCase() === target);
            return String(found?.value || '').trim();
        }

        function extractMeet48AuthFromHarText(text) {
            let har;
            try {
                har = JSON.parse(String(text || ''));
            } catch (error) {
                throw new Error('HAR 文件不是有效 JSON');
            }

            const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];
            const candidates = entries.filter(entry => {
                const url = String(entry?.request?.url || '');
                return url.includes('meetapi-v2.meet48.xyz') || url.includes('meet48-api');
            });

            for (const entry of candidates) {
                const headers = entry?.request?.headers || [];
                const token = getHeaderValue(headers, 'token');
                const deviceId = getHeaderValue(headers, 'x-deviceid');
                const cookie = getHeaderValue(headers, 'cookie');
                if (token || deviceId || cookie) {
                    return { token, cookie, deviceId };
                }
            }

            throw new Error('没有在 HAR 中找到 Meet48 的 token / x-deviceid 请求头');
        }

        function normalizeMeet48LiveList(content) {
            const list = content?.liveList || content?.list || content?.records || [];
            return Array.isArray(list) ? list : [];
        }

        async function validateMeet48AuthSaved() {
            const listResult = await ipcRenderer.invoke('fetch-meet48-live-list', { next: 0, record: true });
            if (!listResult?.success) {
                return { ok: false, message: listResult?.msg || '列表验证失败' };
            }

            const firstItem = normalizeMeet48LiveList(listResult.content)
                .find(item => item && (item.liveId || item.id));
            if (!firstItem) {
                return { ok: true, message: '已保存，列表验证通过' };
            }

            const liveId = String(firstItem.liveId || firstItem.id || '');
            const oneResult = await ipcRenderer.invoke('fetch-meet48-live-one', { liveId });
            if (oneResult?.success) {
                return { ok: true, message: '已保存，播放验证通过' };
            }

            return { ok: false, message: oneResult?.msg || '播放验证失败，登录态可能已过期' };
        }

        async function refreshMeet48AuthPanel() {
            const panel = document.getElementById('meet48-login-status');
            if (!panel) return;

            const auth = readStoredMeet48Auth();
            const deviceInput = document.getElementById('meet48-device-id');
            if (deviceInput) deviceInput.value = auth.deviceId || '';
            clearMeet48AuthFields();

            if (auth.token || auth.cookie || auth.deviceId) {
                const parts = [];
                if (auth.token) parts.push('token');
                if (auth.cookie) parts.push('cookie');
                if (auth.deviceId) parts.push('deviceId');
                setMeet48LoginStatus(`本机已保存 ${parts.join(' / ')}，不会回显敏感内容`, 'success');
            } else {
                setMeet48LoginStatus('未保存 Meet48 登录态', 'muted');
            }
        }

        async function saveMeet48AuthFromFields() {
            const token = document.getElementById('meet48-token')?.value?.trim() || '';
            const cookie = document.getElementById('meet48-cookie')?.value?.trim() || '';
            const deviceId = document.getElementById('meet48-device-id')?.value?.trim() || '';
            if (!token || !deviceId) {
                setMeet48LoginStatus('至少需要 token 和 x-deviceid', 'error');
                return;
            }

            try {
                setMeet48LoginStatus('正在保存并验证...', 'muted');
                writeStoredMeet48Auth({ token, cookie, deviceId });
                clearMeet48AuthFields();
                const validation = await validateMeet48AuthSaved();
                setMeet48LoginStatus(validation.message, validation.ok ? 'success' : 'error');
            } catch (error) {
                setMeet48LoginStatus(error.message || '保存失败', 'error');
            }
        }

        function importMeet48HarFile(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    setMeet48LoginStatus('正在解析 HAR...', 'muted');
                    const auth = extractMeet48AuthFromHarText(reader.result);
                    if (!auth.token || !auth.deviceId) {
                        throw new Error('HAR 中缺少 token 或 x-deviceid');
                    }
                    writeStoredMeet48Auth(auth);
                    const deviceInput = document.getElementById('meet48-device-id');
                    if (deviceInput) deviceInput.value = auth.deviceId;
                    clearMeet48AuthFields();
                    const validation = await validateMeet48AuthSaved();
                    setMeet48LoginStatus(validation.message, validation.ok ? 'success' : 'error');
                } catch (error) {
                    setMeet48LoginStatus(error.message || '导入失败', 'error');
                }
            };
            reader.onerror = () => setMeet48LoginStatus('读取 HAR 失败', 'error');
            reader.readAsText(file, 'utf-8');
        }

        function clearMeet48Auth() {
            clearStoredMeet48AuthValue();
            const deviceInput = document.getElementById('meet48-device-id');
            if (deviceInput) deviceInput.value = '';
            clearMeet48AuthFields();
            setMeet48LoginStatus('Meet48 登录态已清除', 'success');
        }

        function normalizeAccountAvatarUrl(avatarPath) {
            const raw = String(avatarPath || '').trim();
            if (!raw) return './icon.png';
            if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
            return raw.startsWith('/') ? `https://source.48.cn${raw}` : `https://source.48.cn/${raw}`;
        }

        function isWebRuntimeForAccountUi() {
            return !!(window.desktop && window.desktop.platform === 'web');
        }

        function getWebAccountProfileCacheKey() {
            const token = String(readStoredToken() || '').trim();
            if (!token) return '';
            let hash = 2166136261;
            for (let index = 0; index < token.length; index += 1) {
                hash ^= token.charCodeAt(index);
                hash = Math.imul(hash, 16777619);
            }
            return `${WEB_ACCOUNT_PROFILE_CACHE_KEY}_token-${(hash >>> 0).toString(36)}`;
        }

        function readWebAccountProfileCache() {
            if (!isWebRuntimeForAccountUi() || !readStoredToken()) return null;
            try {
                const storageKey = getWebAccountProfileCacheKey();
                let cached = JSON.parse(localStorage.getItem(storageKey) || 'null');
                if (!cached) {
                    cached = JSON.parse(localStorage.getItem(WEB_ACCOUNT_PROFILE_CACHE_KEY) || 'null');
                    if (cached && storageKey) {
                        localStorage.setItem(storageKey, JSON.stringify(cached));
                        localStorage.removeItem(WEB_ACCOUNT_PROFILE_CACHE_KEY);
                    }
                }
                return cached && typeof cached === 'object' && !Array.isArray(cached) ? cached : null;
            } catch (error) {
                return null;
            }
        }

        function writeWebAccountProfileCache(profile = currentPocketProfile) {
            if (!isWebRuntimeForAccountUi()) return;
            const storageKey = getWebAccountProfileCacheKey();
            if (!storageKey) return;
            const normalized = {
                nickname: String(profile?.nickname || '').trim(),
                avatar: String(profile?.avatar || '').trim(),
                avatarUrl: String(profile?.avatarUrl || normalizeAccountAvatarUrl(profile?.avatar) || '').trim(),
                updatedAt: Date.now()
            };
            if (!normalized.avatarUrl && !normalized.avatar) return;
            localStorage.setItem(storageKey, JSON.stringify(normalized));
        }

        function clearWebAccountProfileCache() {
            if (!isWebRuntimeForAccountUi()) return;
            localStorage.removeItem(WEB_ACCOUNT_PROFILE_CACHE_KEY);
            for (let index = localStorage.length - 1; index >= 0; index -= 1) {
                const key = localStorage.key(index);
                if (key && key.startsWith(`${WEB_ACCOUNT_PROFILE_CACHE_KEY}_`)) {
                    localStorage.removeItem(key);
                }
            }
        }

        function capturePocketAccountContext(token = appToken || readStoredToken()) {
            return {
                token: String(token || '').trim(),
                userId: String(currentPocketUserId || '').trim(),
                sessionGeneration: typeof window.getPocketAccountSessionGeneration === 'function'
                    ? window.getPocketAccountSessionGeneration()
                    : 0
            };
        }

        function isPocketAccountContextCurrent(context) {
            if (!context) return false;
            return context.token === String(appToken || readStoredToken() || '').trim()
                && context.userId === String(currentPocketUserId || '').trim()
                && (typeof window.getPocketAccountSessionGeneration !== 'function'
                    || context.sessionGeneration === window.getPocketAccountSessionGeneration());
        }

        function invalidatePocketAccountRequestState() {
            autoCheckinGeneration += 1;
            autoCheckinInFlight = false;
            selectedAccountAvatarFile = null;
            selectedAccountAvatarDataUrl = '';
            const avatarInput = document.getElementById('account-avatar-file');
            if (avatarInput) avatarInput.value = '';
            const nicknameButton = document.getElementById('btn-save-account-nickname');
            const avatarButton = document.querySelector('.account-avatar-edit-actions .btn');
            if (nicknameButton) nicknameButton.disabled = false;
            if (avatarButton) avatarButton.disabled = false;
            setCheckinButtonBusy(false);
        }

        window.invalidatePocketAccountRequestState = invalidatePocketAccountRequestState;

        function syncWebAccountButton(profile = currentPocketProfile, loggedIn = !!currentPocketUserId) {
            if (!isWebRuntimeForAccountUi()) return;
            const button = document.getElementById('web-account-button');
            const avatar = document.getElementById('web-account-avatar');
            const label = document.getElementById('web-account-login-label');
            if (!button || !avatar || !label) return;

            if (!loggedIn) {
                const cachedProfile = readWebAccountProfileCache();
                if (cachedProfile) {
                    profile = cachedProfile;
                    loggedIn = true;
                }
            }

            const nickname = String(profile?.nickname || '').trim();
            const avatarUrl = profile?.avatarUrl || normalizeAccountAvatarUrl(profile?.avatar);
            button.classList.toggle('is-logged-in', !!loggedIn);
            button.setAttribute('aria-label', loggedIn ? `${nickname || '口袋用户'}，账号设置` : '登录账号');
            button.title = loggedIn ? `${nickname || '口袋用户'} · 账号设置` : '登录账号';
            label.textContent = '登录';
            avatar.src = loggedIn ? (avatarUrl || './web-icon.png') : './web-icon.png';
            if (loggedIn) writeWebAccountProfileCache(profile);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => syncWebAccountButton(), { once: true });
        } else {
            syncWebAccountButton();
        }

        function setAccountProfileEditStatus(message, type = 'muted') {
            const statusEl = document.getElementById('account-profile-edit-status');
            if (!statusEl) return;
            if (accountProfileStatusTimer) {
                clearTimeout(accountProfileStatusTimer);
                accountProfileStatusTimer = null;
            }
            statusEl.innerText = message || '';
            statusEl.style.color = type === 'success'
                ? '#28a745'
                : (type === 'error' ? '#ff4d4f' : 'var(--text-sub)');
            if ((type === 'success' || type === 'error') && message) {
                accountProfileStatusTimer = setTimeout(() => {
                    statusEl.innerText = '';
                    accountProfileStatusTimer = null;
                }, 3000);
            }
        }

        function syncAccountProfileEditUi(profile = currentPocketProfile) {
            const nickname = String(profile?.nickname || '').trim();
            const avatarUrl = profile?.avatarUrl || normalizeAccountAvatarUrl(profile?.avatar);
            const nicknameInput = document.getElementById('account-nickname-input');
            const preview = document.getElementById('account-avatar-preview');
            if (nicknameInput) nicknameInput.value = nickname;
            if (preview) preview.src = avatarUrl || './icon.png';
            setAccountProfileEditStatus('');
        }

        function setAccountProfileMetaVisible(visible) {
            const row = document.getElementById('account-profile-meta-row');
            if (!row) return;
            row.classList.toggle('account-profile-meta-loading', !visible);
        }

        function setRenameCountDisplay(freeText, chickenText) {
            const countEl = document.getElementById('account-rename-count');
            if (!countEl) return;
            countEl.replaceChildren();

            const freeEl = document.createElement('span');
            freeEl.textContent = `免费修改：${freeText}`;
            const chickenEl = document.createElement('span');
            chickenEl.textContent = `鸡腿修改：${chickenText}`;
            countEl.append(freeEl, chickenEl);
        }

        function renderAccountRenameCount(content) {
            const countEl = document.getElementById('account-rename-count');
            if (!countEl) return;

            if (content && typeof content === 'object') {
                const freeCount = content.count ?? content.renameCount ?? content.renameNum ?? content.num ?? content.leftCount ?? content.remainCount;
                const chickenCount = content.jtcount ?? content.jtCount ?? content.chickenCount ?? content.payCount;
                const freeText = freeCount === undefined || freeCount === null || freeCount === '' ? '--' : String(freeCount);
                const chickenText = chickenCount === undefined || chickenCount === null || chickenCount === '' ? '--' : String(chickenCount);
                setRenameCountDisplay(freeText, chickenText);
                return;
            }

            const normalized = content === undefined || content === null || content === ''
                ? '--'
                : String(content);
            setRenameCountDisplay(normalized, '--');
        }

        async function refreshAccountRenameCount() {
            const countEl = document.getElementById('account-rename-count');
            const token = appToken || readStoredToken();
            if (!countEl) return;
            if (!token) {
                countEl.innerText = '改名次数：--';
                return;
            }
            const accountContext = capturePocketAccountContext(token);

            setRenameCountDisplay('读取中...', '读取中...');
            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-user-rename-count', { token, pa });
                if (!isPocketAccountContextCurrent(accountContext)) return;
                if (!res?.success) {
                    throw new Error(res?.msg || '读取失败');
                }
                renderAccountRenameCount(res.content);
            } catch (error) {
                if (!isPocketAccountContextCurrent(accountContext)) return;
                setRenameCountDisplay('读取失败', '读取失败');
            }
        }

        function renderAccountChickenBalance(content) {
            const balanceEl = document.getElementById('account-chicken-balance');
            if (!balanceEl) return;
            const total = content && typeof content === 'object'
                ? (content.moneyTotal ?? content.total ?? content.balance ?? content.money)
                : content;
            balanceEl.innerText = total === undefined || total === null || total === '' ? '--' : String(total);
        }

        async function refreshAccountChickenBalance() {
            const balanceEl = document.getElementById('account-chicken-balance');
            const token = appToken || readStoredToken();
            if (!balanceEl) return;
            if (!token) {
                balanceEl.innerText = '--';
                return;
            }
            const accountContext = capturePocketAccountContext(token);

            balanceEl.innerText = '读取中...';
            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('fetch-user-money', { token, pa });
                if (!isPocketAccountContextCurrent(accountContext)) return;
                if (!res?.success) {
                    throw new Error(res?.msg || '读取失败');
                }
                renderAccountChickenBalance(res.content);
            } catch (error) {
                if (!isPocketAccountContextCurrent(accountContext)) return;
                balanceEl.innerText = '读取失败';
            }
        }

        async function refreshAccountProfileMeta() {
            const accountContext = capturePocketAccountContext();
            setAccountProfileMetaVisible(false);
            await Promise.all([
                refreshAccountRenameCount(),
                refreshAccountChickenBalance()
            ]);
            if (isPocketAccountContextCurrent(accountContext)) setAccountProfileMetaVisible(true);
        }

        function handleAccountAvatarSelected(file) {
            const accountContext = capturePocketAccountContext();
            selectedAccountAvatarFile = file || null;
            selectedAccountAvatarDataUrl = '';
            const fileInput = document.getElementById('account-avatar-file');

            if (!file) return;

            if (!/^image\/(jpeg|png|webp)$/i.test(file.type || '')) {
                selectedAccountAvatarFile = null;
                setAccountProfileEditStatus('请选择 JPG、PNG 或 WebP 图片', 'error');
                if (fileInput) fileInput.value = '';
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                selectedAccountAvatarFile = null;
                setAccountProfileEditStatus('头像图片请控制在 5MB 以内', 'error');
                if (fileInput) fileInput.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                if (!isPocketAccountContextCurrent(accountContext)) return;
                selectedAccountAvatarDataUrl = String(reader.result || '');
                const preview = document.getElementById('account-avatar-preview');
                if (preview && selectedAccountAvatarDataUrl) preview.src = selectedAccountAvatarDataUrl;
                setAccountProfileEditStatus('');
                uploadAccountAvatar();
            };
            reader.onerror = () => {
                if (!isPocketAccountContextCurrent(accountContext)) return;
                selectedAccountAvatarFile = null;
                selectedAccountAvatarDataUrl = '';
                setAccountProfileEditStatus('读取头像图片失败', 'error');
            };
            reader.readAsDataURL(file);
        }

        async function saveAccountNickname() {
            const nicknameInput = document.getElementById('account-nickname-input');
            const button = document.getElementById('btn-save-account-nickname');
            const nickname = String(nicknameInput?.value || '').trim();
            const token = appToken || readStoredToken();

            if (!token) {
                showToast('请先登录账号');
                return;
            }

            if (!nickname) {
                setAccountProfileEditStatus('昵称不能为空', 'error');
                return;
            }
            const accountContext = capturePocketAccountContext(token);

            try {
                if (button) button.disabled = true;
                setAccountProfileEditStatus('');
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('edit-user-info', {
                    token,
                    pa,
                    key: 'nickname',
                    value: nickname
                });
                if (!isPocketAccountContextCurrent(accountContext)) return;

                if (!res?.success) {
                    throw new Error(res?.msg || '保存昵称失败');
                }

                currentPocketProfile.nickname = nickname;
                const nameEl = document.getElementById('user-nickname');
                if (nameEl) nameEl.innerText = nickname;
                syncWebAccountButton(currentPocketProfile, true);
                refreshAccountRenameCount();
                setAccountProfileEditStatus('昵称已保存', 'success');
            } catch (error) {
                if (!isPocketAccountContextCurrent(accountContext)) return;
                setAccountProfileEditStatus(error.message || '保存昵称失败', 'error');
            } finally {
                if (isPocketAccountContextCurrent(accountContext) && button) button.disabled = false;
            }
        }

        async function uploadAccountAvatar() {
            const button = document.querySelector('.account-avatar-edit-actions .btn');
            const token = appToken || readStoredToken();

            if (!token) {
                showToast('请先登录账号');
                return;
            }

            if (!selectedAccountAvatarFile || !selectedAccountAvatarDataUrl) {
                setAccountProfileEditStatus('请先选择头像图片', 'error');
                return;
            }
            const accountContext = capturePocketAccountContext(token);

            try {
                if (button) button.disabled = true;
                setAccountProfileEditStatus('');
                const pa = window.getPA ? window.getPA() : null;
                const uploadRes = await ipcRenderer.invoke('upload-user-avatar', {
                    token,
                    pa,
                    fileName: selectedAccountAvatarFile.name,
                    mimeType: selectedAccountAvatarFile.type,
                    dataBase64: selectedAccountAvatarDataUrl
                });
                if (!isPocketAccountContextCurrent(accountContext)) return;

                if (!uploadRes?.success || !uploadRes.path) {
                    throw new Error(uploadRes?.msg || '上传头像失败');
                }

                const editRes = await ipcRenderer.invoke('edit-user-info', {
                    token,
                    pa,
                    key: 'avatar',
                    value: uploadRes.path
                });
                if (!isPocketAccountContextCurrent(accountContext)) return;

                if (!editRes?.success) {
                    throw new Error(editRes?.msg || '头像写入失败');
                }

                const avatarUrl = normalizeAccountAvatarUrl(uploadRes.path);
                currentPocketProfile.avatar = uploadRes.path;
                currentPocketProfile.avatarUrl = avatarUrl;
                const currentAvatarEl = document.getElementById('current-user-avatar');
                const preview = document.getElementById('account-avatar-preview');
                if (currentAvatarEl) currentAvatarEl.src = avatarUrl;
                if (preview) preview.src = avatarUrl;
                syncWebAccountButton(currentPocketProfile, true);
                selectedAccountAvatarFile = null;
                selectedAccountAvatarDataUrl = '';
                const fileInput = document.getElementById('account-avatar-file');
                if (fileInput) fileInput.value = '';
                setAccountProfileEditStatus('头像已更新', 'success');
                showToast('头像已更新');
            } catch (error) {
                if (!isPocketAccountContextCurrent(accountContext)) return;
                setAccountProfileEditStatus(error.message || '上传头像失败', 'error');
            } finally {
                if (isPocketAccountContextCurrent(accountContext) && button) button.disabled = false;
            }
        }

        function readStoredSettingStringFallback(key, fallbackValue = '') {
            if (typeof window.readStoredStringSetting === 'function') {
                return window.readStoredStringSetting(key, fallbackValue);
            }
            const legacyValue = localStorage.getItem(key);
            return legacyValue === null ? fallbackValue : String(legacyValue);
        }

        function readRuntimeCacheString(key, fallbackValue = '') {
            const cacheApi = getAppCacheApi();
            const missingMarker = readRuntimeCacheString._missingMarker || (readRuntimeCacheString._missingMarker = {});

            if (cacheApi && typeof cacheApi.getCacheValueSync === 'function') {
                const storedValue = cacheApi.getCacheValueSync(key, missingMarker);
                if (storedValue !== missingMarker) {
                    return typeof storedValue === 'string' ? storedValue : String(storedValue ?? '');
                }
            }

            const legacyValue = localStorage.getItem(key);
            if (legacyValue !== null) {
                if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                    cacheApi.setCacheValueSync(key, legacyValue);
                    localStorage.removeItem(key);
                }
                return String(legacyValue);
            }

            return fallbackValue;
        }

        function writeRuntimeCacheString(key, value) {
            const normalizedValue = String(value ?? '');
            const cacheApi = getAppCacheApi();
            if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                cacheApi.setCacheValueSync(key, normalizedValue);
                localStorage.removeItem(key);
                return normalizedValue;
            }

            localStorage.setItem(key, normalizedValue);
            return normalizedValue;
        }

        function removeRuntimeCacheValue(key) {
            const cacheApi = getAppCacheApi();
            if (cacheApi && typeof cacheApi.removeCacheValueSync === 'function') {
                cacheApi.removeCacheValueSync(key);
            }
            localStorage.removeItem(key);
        }

        function ensureAutoCheckinSettingsMigrated() {
            if (autoCheckinSettingsMigrated) {
                return;
            }

            autoCheckinSettingsMigrated = true;
            const settingsApi = getAppSettingsApi();
            if (!settingsApi
                || typeof settingsApi.getSettingValueSync !== 'function'
                || typeof settingsApi.setSettingValueSync !== 'function') {
                return;
            }

            try {
                const hasEnabled = typeof settingsApi.getSettingValueSync(AUTO_CHECKIN_ENABLED_KEY, undefined) !== 'undefined';
                const legacyEnabled = localStorage.getItem(AUTO_CHECKIN_ENABLED_KEY);
                if (!hasEnabled && legacyEnabled !== null) {
                    settingsApi.setSettingValueSync(AUTO_CHECKIN_ENABLED_KEY, legacyEnabled);
                }
                if (legacyEnabled !== null) {
                    localStorage.removeItem(AUTO_CHECKIN_ENABLED_KEY);
                }

                const hasLastDate = typeof settingsApi.getSettingValueSync(AUTO_CHECKIN_LAST_DATE_KEY, undefined) !== 'undefined';
                const legacyLastDate = localStorage.getItem(AUTO_CHECKIN_LAST_DATE_KEY);
                if (!hasLastDate && legacyLastDate !== null) {
                    settingsApi.setSettingValueSync(AUTO_CHECKIN_LAST_DATE_KEY, legacyLastDate);
                }
                if (legacyLastDate !== null) {
                    localStorage.removeItem(AUTO_CHECKIN_LAST_DATE_KEY);
                }

                const hasLastUser = typeof settingsApi.getSettingValueSync(AUTO_CHECKIN_LAST_USER_KEY, undefined) !== 'undefined';
                const legacyLastUser = localStorage.getItem(AUTO_CHECKIN_LAST_USER_KEY);
                if (!hasLastUser && legacyLastUser !== null) {
                    settingsApi.setSettingValueSync(AUTO_CHECKIN_LAST_USER_KEY, legacyLastUser);
                }
                if (legacyLastUser !== null) {
                    localStorage.removeItem(AUTO_CHECKIN_LAST_USER_KEY);
                }
            } catch (error) {
                console.warn('迁移自动签到设置失败:', error);
            }
        }

        function readAutoCheckinSetting(key, fallbackValue = '') {
            ensureAutoCheckinSettingsMigrated();
            const settingsApi = getAppSettingsApi();
            if (settingsApi && typeof settingsApi.getSettingValueSync === 'function') {
                return settingsApi.getSettingValueSync(key, fallbackValue);
            }

            const legacyValue = localStorage.getItem(key);
            return legacyValue === null ? fallbackValue : legacyValue;
        }

        function writeAutoCheckinSetting(key, value) {
            ensureAutoCheckinSettingsMigrated();
            const settingsApi = getAppSettingsApi();
            if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
                settingsApi.setSettingValueSync(key, value);
                localStorage.removeItem(key);
                return value;
            }

            localStorage.setItem(key, value);
            return value;
        }

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

        function getFetchBoundaryTimestamp(boundaryKey) {
            const timestamp = Number(String(boundaryKey || '').split('|')[1]);
            return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
        }

        function getFetchMessageTimestamp(message) {
            const timestamp = Number(message?.msgTime || message?.messageTime || message?.time || 0);
            return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
        }

        function loadFetchBoundary(serverId, channelId, fetchAllMode) {
            try {
                return readRuntimeCacheString(getFetchBoundaryStorageKey(serverId, channelId, fetchAllMode), '');
            } catch (error) {
                return '';
            }
        }

        function saveFetchBoundary(serverId, channelId, fetchAllMode, message) {
            const boundaryKey = buildFetchMessageKey(message);
            if (!boundaryKey) return;

            try {
                writeRuntimeCacheString(getFetchBoundaryStorageKey(serverId, channelId, fetchAllMode), boundaryKey);
            } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/fetch-legacy.js'); }
        }

        function escapeFetchHtml(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function normalizePocketMediaUrl(mediaPath) {
            const rawPath = String(mediaPath || '').trim();
            if (!rawPath) return '';
            if (/^https?:\/\//i.test(rawPath)) return rawPath;
            if (rawPath.includes('48.cn')) {
                return `https://${rawPath.replace(/^\/+/, '')}`;
            }

            return rawPath.startsWith('/')
                ? `https://source3.48.cn${rawPath}`
                : `https://source3.48.cn/${rawPath}`;
        }

        function schedulePocketGiftCacheSave() {
            if (pocketGiftCacheSaveTimer) {
                clearTimeout(pocketGiftCacheSaveTimer);
            }

            pocketGiftCacheSaveTimer = setTimeout(() => {
                pocketGiftCacheSaveTimer = null;
                const cacheApi = window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
                if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                    cacheApi.setCacheValueSync('POCKET_GIFT_DATA_CACHE', POCKET_GIFT_DATA);
                } else {
                    localStorage.setItem('POCKET_GIFT_DATA_CACHE', JSON.stringify(POCKET_GIFT_DATA));
                }
            }, 500);
        }

        function upsertPocketGiftData(giftInfo = {}, unitCost = 0) {
            if (typeof POCKET_GIFT_DATA === 'undefined') return false;

            const id = String(giftInfo.giftId || giftInfo.id || '').trim();
            const name = String(giftInfo.giftName || giftInfo.name || '').trim();
            const cost = Number(unitCost || giftInfo.money || giftInfo.cost || 0);
            if ((!id && !name) || !cost) return false;

            const existing = POCKET_GIFT_DATA.find(item => (id && String(item.id) === id) || (name && item.name === name));
            if (existing) {
                const changed = Number(existing.cost || 0) !== cost
                    || (id && String(existing.id || '') !== id)
                    || (name && existing.name !== name);
                if (!changed) return false;

                existing.cost = cost;
                if (id) existing.id = id;
                if (name) existing.name = name;
            } else {
                POCKET_GIFT_DATA.push({ id, name: name || id, cost });
            }

            schedulePocketGiftCacheSave();
            return true;
        }

        function renderPocketGiftCard(giftInfo = {}) {
            const giftName = escapeFetchHtml(giftInfo.giftName || giftInfo.name || '未知礼物');
            const giftNum = Number(giftInfo.giftNum || giftInfo.num || giftInfo.count || 1) || 1;
            const giftImg = normalizePocketMediaUrl(giftInfo.picPath || giftInfo.giftPic || giftInfo.image || '');
            let unitCost = Number(giftInfo.money || giftInfo.cost || 0);

            if (!unitCost && typeof POCKET_GIFT_DATA !== 'undefined') {
                const gift = POCKET_GIFT_DATA.find(item => item.id == (giftInfo.giftId || giftInfo.id) || item.name === (giftInfo.giftName || giftInfo.name));
                if (gift) unitCost = Number(gift.cost || 0);
            }

            upsertPocketGiftData(giftInfo, unitCost);

            const costDisplay = unitCost
                ? `<span style="margin-left:5px; color:#fa8c16; font-weight:bold;">(${unitCost * giftNum}🍗)</span>`
                : '';

            return `
        <div class="mb-2" style="display:flex; align-items:center; background:#fff0f6; padding:6px 8px; border-radius:6px; border:1px solid #ffadd2; max-width: 300px;">
            ${giftImg ? `<img src="${escapeFetchHtml(giftImg)}" style="width: 25px !important; height: 25px !important; max-width: 32px !important; max-height: 32px !important; object-fit: contain !important; margin: 0 8px 0 0 !important; border-radius: 4px; box-shadow: none !important;">` : '<span style="font-size:24px; margin-right:8px;">🎁</span>'}
            <div style="flex: 1; overflow: hidden;">
                <div style="color:#eb2f96; font-weight:bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">送出礼物：${giftName}</div>
                <div style="font-size:11px; color:#888;">数量: x${giftNum} ${costDisplay}</div>
            </div>
        </div>`;
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
                removeRuntimeCacheValue(getFetchBoundaryStorageKey(serverId, channelId, isFetchAllMode));
            } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/fetch-legacy.js'); }

            currentFetchStopKey = '';
            currentFetchStoppedAtPrevious = false;

            if (statusEl) {
                statusEl.innerHTML = '已清除当前房间上次抓取位置';
            }

            showToast('已清除当前房间上次抓取位置');
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        function normalizeAutoMessageFetchMember(member) {
            const name = String(member?.name || member?.ownerName || '').trim();
            const serverId = String(member?.serverId || '').trim();
            const channelId = String(member?.channelId || '').trim();
            if (!name || !serverId || !channelId) return null;

            return {
                name,
                serverId,
                channelId,
                smallChannelId: String(member?.smallChannelId || member?.yklzId || '').trim(),
                team: String(member?.team || '').trim()
            };
        }

        function normalizeAutoMessageFetchConfig(value) {
            const allowedIntervals = new Set([1, 5, 10, 30, 60]);
            const intervalMinutes = Number(value?.intervalMinutes);
            const hasSplitModeSetting = typeof value?.startupEnabled === 'boolean'
                || typeof value?.scheduledEnabled === 'boolean';
            const legacyEnabled = value?.enabled === true;
            const memberKeys = new Set();
            const members = [];

            for (const rawMember of (Array.isArray(value?.members) ? value.members : [])) {
                const member = normalizeAutoMessageFetchMember(rawMember);
                if (!member) continue;
                const memberKey = `${member.serverId}::${member.channelId}`;
                if (memberKeys.has(memberKey)) continue;
                memberKeys.add(memberKey);
                members.push(member);
            }

            return {
                startupEnabled: value?.startupEnabled === true,
                scheduledEnabled: value?.scheduledEnabled === true || (!hasSplitModeSetting && legacyEnabled),
                roomType: value?.roomType === 'small' || value?.roomType === 'all' ? value.roomType : 'big',
                messageScope: value?.messageScope === 'all' ? 'all' : 'member',
                intervalMinutes: allowedIntervals.has(intervalMinutes)
                    ? intervalMinutes
                    : AUTO_MESSAGE_FETCH_DEFAULT_INTERVAL,
                members,
                lastRunAt: Number(value?.lastRunAt) || 0
            };
        }

        function readAutoMessageFetchConfig() {
            const settingsApi = getAppSettingsApi();
            let rawValue = null;
            const accountScope = typeof window.getPocketAccountScopeKey === 'function'
                ? String(window.getPocketAccountScopeKey() || '').trim()
                : '';
            const scopedSettingKey = accountScope && accountScope !== 'signed-out'
                ? `${AUTO_MESSAGE_FETCH_SETTING_KEY}_${accountScope}`
                : '';

            if (settingsApi && typeof settingsApi.getSettingValueSync === 'function') {
                rawValue = settingsApi.getSettingValueSync(AUTO_MESSAGE_FETCH_SETTING_KEY, null);
                if (!rawValue && scopedSettingKey) {
                    rawValue = settingsApi.getSettingValueSync(scopedSettingKey, null);
                    if (rawValue && typeof settingsApi.setSettingValueSync === 'function') {
                        settingsApi.setSettingValueSync(AUTO_MESSAGE_FETCH_SETTING_KEY, rawValue);
                        if (typeof settingsApi.removeSettingValueSync === 'function') {
                            settingsApi.removeSettingValueSync(scopedSettingKey);
                        }
                    }
                }
            }

            if (!rawValue) {
                const sharedLocalKey = `yaya_${AUTO_MESSAGE_FETCH_SETTING_KEY}`;
                let legacyValue = localStorage.getItem(sharedLocalKey);
                const scopedLocalKey = scopedSettingKey ? `yaya_${scopedSettingKey}` : '';
                if (!legacyValue && scopedLocalKey) {
                    legacyValue = localStorage.getItem(scopedLocalKey);
                    if (legacyValue) {
                        localStorage.setItem(sharedLocalKey, legacyValue);
                        localStorage.removeItem(scopedLocalKey);
                    }
                }
                if (legacyValue) {
                    try {
                        rawValue = JSON.parse(legacyValue);
                    } catch (error) {
                        rawValue = null;
                    }
                }
            }

            return normalizeAutoMessageFetchConfig(rawValue || {});
        }

        function writeAutoMessageFetchConfig(value) {
            const config = normalizeAutoMessageFetchConfig(value);
            const settingsApi = getAppSettingsApi();

            if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
                settingsApi.setSettingValueSync(AUTO_MESSAGE_FETCH_SETTING_KEY, config);
                localStorage.removeItem(`yaya_${AUTO_MESSAGE_FETCH_SETTING_KEY}`);
            } else {
                localStorage.setItem(`yaya_${AUTO_MESSAGE_FETCH_SETTING_KEY}`, JSON.stringify(config));
            }

            return config;
        }

        function cloneAutoMessageFetchConfig(value) {
            return normalizeAutoMessageFetchConfig(JSON.parse(JSON.stringify(value || {})));
        }

        function getAutoMessageFetchDraftConfig(refreshWhenClean = false) {
            if (!autoMessageFetchDraftConfig || (refreshWhenClean && !autoMessageFetchDraftDirty)) {
                autoMessageFetchDraftConfig = cloneAutoMessageFetchConfig(readAutoMessageFetchConfig());
            }
            return autoMessageFetchDraftConfig;
        }

        function markAutoMessageFetchDraftDirty() {
            autoMessageFetchDraftDirty = true;
            saveAutoMessageFetchSettings({ silent: true });
        }

        function setAutoMessageFetchStatus(message, type = '') {
            const statusEl = document.getElementById('auto-fetch-status');
            if (!statusEl) return;
            statusEl.textContent = String(message || '');
            statusEl.className = `auto-fetch-status${type ? ` is-${type}` : ''}`;
        }

        function formatAutoMessageFetchTime(timestamp) {
            if (!timestamp) return '';
            return new Date(timestamp).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        }

        function renderAutoMessageFetchUi(options = {}) {
            if (!autoMessageFetchDraftDirty) {
                autoMessageFetchDraftConfig = cloneAutoMessageFetchConfig(readAutoMessageFetchConfig());
            }
            const config = getAutoMessageFetchDraftConfig();
            const startupToggle = document.getElementById('auto-fetch-startup-toggle');
            const scheduleToggle = document.getElementById('auto-fetch-schedule-toggle');
            const roomTypeDisplay = document.getElementById('auto-fetch-room-type-display');
            const messageScopeDisplay = document.getElementById('auto-fetch-message-scope-display');
            const intervalDisplay = document.getElementById('auto-fetch-interval-display');
            const intervalField = document.getElementById('auto-fetch-schedule-interval-field');
            const controls = document.querySelector('.auto-fetch-controls');
            const runButton = document.getElementById('btn-auto-fetch-now');
            const list = document.getElementById('auto-fetch-member-list');

            if (startupToggle) startupToggle.checked = config.startupEnabled;
            if (scheduleToggle) scheduleToggle.checked = config.scheduledEnabled;
            if (roomTypeDisplay) {
                roomTypeDisplay.value = config.roomType === 'small'
                    ? '小房间'
                    : (config.roomType === 'all' ? '所有房间' : '大房间');
            }
            if (messageScopeDisplay) messageScopeDisplay.value = config.messageScope === 'all' ? '全体消息' : '只看成员';
            if (intervalDisplay) intervalDisplay.value = `${config.intervalMinutes} 分钟`;
            if (intervalField) intervalField.style.display = config.scheduledEnabled ? 'block' : 'none';
            if (controls) controls.classList.toggle('has-scheduled-interval', config.scheduledEnabled);
            if (!config.scheduledEnabled) {
                const intervalDropdown = document.getElementById('auto-fetch-interval-dropdown');
                if (intervalDropdown) intervalDropdown.style.display = 'none';
            }
            if (runButton && !autoMessageFetchInFlight) {
                runButton.disabled = autoMessageFetchDraftDirty;
                runButton.title = autoMessageFetchDraftDirty ? '自动抓取设置正在保存' : '';
            }

            if (list) {
                list.replaceChildren();
                for (const member of config.members) {
                    const chip = document.createElement('span');
                    chip.className = 'auto-fetch-member-chip';

                    const name = document.createElement('span');
                    name.textContent = member.name;
                    chip.appendChild(name);

                    const removeButton = document.createElement('button');
                    removeButton.type = 'button';
                    removeButton.title = `移除 ${member.name}`;
                    removeButton.setAttribute('aria-label', `移除 ${member.name}`);
                    removeButton.textContent = '×';
                    removeButton.addEventListener('click', () => removeAutoMessageFetchMember(member.serverId, member.channelId));
                    chip.appendChild(removeButton);
                    list.appendChild(chip);
                }
            }

            if (options.keepStatus || autoMessageFetchInFlight) return;
            if (autoMessageFetchDraftDirty) {
                setAutoMessageFetchStatus('正在自动保存设置', 'running');
                return;
            }
            if (config.members.length === 0) {
                setAutoMessageFetchStatus('尚未添加自动抓取成员');
            } else if (!config.startupEnabled && !config.scheduledEnabled) {
                setAutoMessageFetchStatus(`已选择 ${config.members.length} 位成员，自动抓取未启用`);
            } else if (config.startupEnabled && !config.scheduledEnabled) {
                setAutoMessageFetchStatus('已启用打开软件自动抓取，下次打开软件并登录后执行');
            } else {
                const nextRunAt = Math.max(Date.now(), config.lastRunAt + config.intervalMinutes * 60 * 1000);
                const prefix = config.startupEnabled ? '两种自动抓取均已启用' : '已启用定时抓取';
                setAutoMessageFetchStatus(`${prefix}，下次定时抓取约 ${formatAutoMessageFetchTime(nextRunAt)}`);
            }
        }

        function handleAutoFetchMemberSearch(keyword) {
            const resultBox = document.getElementById('auto-fetch-member-results');
            if (!resultBox) return;

            const query = String(keyword || '').trim();
            if (!query) {
                resultBox.style.display = 'none';
                return;
            }

            if (typeof isMemberDataLoaded !== 'undefined' && !isMemberDataLoaded) {
                if (typeof loadMemberData === 'function') {
                    Promise.resolve(loadMemberData()).then(() => handleAutoFetchMemberSearch(query));
                }
                resultBox.innerHTML = '<div class="suggestion-item" style="cursor:default;color:var(--text-sub)">正在读取成员列表...</div>';
                resultBox.style.display = 'block';
                return;
            }

            const source = (typeof memberData !== 'undefined' && Array.isArray(memberData))
                ? memberData
                : (Array.isArray(window.memberData) ? window.memberData : []);
            const lowerQuery = query.toLowerCase();
            const matches = source.filter(member => {
                const name = String(member?.ownerName || '');
                const pinyin = String(member?.pinyin || '');
                const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : '';
                return name.includes(query)
                    || pinyin.toLowerCase().includes(lowerQuery)
                    || initials.toLowerCase().includes(lowerQuery);
            });

            if (typeof memberSortLogic === 'function') matches.sort(memberSortLogic);
            resultBox.replaceChildren();

            if (matches.length === 0) {
                resultBox.innerHTML = '<div class="suggestion-item" style="cursor:default;color:var(--text-sub)">未找到该成员</div>';
                resultBox.style.display = 'block';
                return;
            }

            for (const member of matches.slice(0, 30)) {
                const isInactive = member?.isInGroup === false;
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.style.display = 'flex';
                item.style.justifyContent = 'space-between';
                item.style.alignItems = 'center';

                const name = document.createElement('span');
                name.style.fontWeight = 'bold';
                if (isInactive) {
                    name.style.opacity = '0.6';
                    name.style.color = '#999';
                }
                name.textContent = String(member.ownerName || '');
                item.appendChild(name);

                const team = document.createElement('span');
                team.className = 'team-tag';
                if (typeof getTeamStyle === 'function') {
                    team.style.cssText = getTeamStyle(member.team, isInactive);
                }
                if (isInactive) {
                    team.style.opacity = '0.6';
                    team.style.color = '#999';
                }
                team.textContent = String(member.team || '');
                item.appendChild(team);
                item.addEventListener('click', () => addAutoMessageFetchMember(member));
                resultBox.appendChild(item);
            }

            resultBox.style.display = 'block';
        }

        function addAutoMessageFetchMember(rawMember) {
            const member = normalizeAutoMessageFetchMember(rawMember);
            if (!member) {
                showToast('该成员缺少大房间参数，无法加入自动抓取');
                return;
            }

            const config = getAutoMessageFetchDraftConfig(true);
            const exists = config.members.some(item => item.serverId === member.serverId && item.channelId === member.channelId);
            if (!exists) config.members.push(member);

            const input = document.getElementById('auto-fetch-member-input');
            const results = document.getElementById('auto-fetch-member-results');
            if (input) input.value = '';
            if (results) results.style.display = 'none';
            if (exists) {
                showToast(`${member.name} 已在自动抓取列表中`);
            } else {
                markAutoMessageFetchDraftDirty();
            }
        }

        function removeAutoMessageFetchMember(serverId, channelId) {
            const config = getAutoMessageFetchDraftConfig(true);
            config.members = config.members.filter(member => (
                member.serverId !== String(serverId || '') || member.channelId !== String(channelId || '')
            ));
            if (config.members.length === 0) {
                config.startupEnabled = false;
                config.scheduledEnabled = false;
            }
            markAutoMessageFetchDraftDirty();
        }

        function setAutoMessageFetchRoomType(value) {
            const config = getAutoMessageFetchDraftConfig(true);
            config.roomType = value === 'small' || value === 'all' ? value : 'big';
            markAutoMessageFetchDraftDirty();
        }

        function setAutoMessageFetchScope(value) {
            const config = getAutoMessageFetchDraftConfig(true);
            config.messageScope = value === 'all' ? 'all' : 'member';
            markAutoMessageFetchDraftDirty();
        }

        function setAutoMessageFetchInterval(value) {
            const config = getAutoMessageFetchDraftConfig(true);
            config.intervalMinutes = Number(value);
            markAutoMessageFetchDraftDirty();
        }

        function saveAutoMessageFetchEnabledState(settingName, enabled) {
            const isScheduled = settingName === 'scheduledEnabled';
            const settingKey = isScheduled ? 'scheduledEnabled' : 'startupEnabled';
            const persistedConfig = readAutoMessageFetchConfig();
            const draftConfig = getAutoMessageFetchDraftConfig(true);
            const nextEnabled = !!enabled;

            if (nextEnabled && persistedConfig.members.length === 0) {
                draftConfig[settingKey] = false;
                renderAutoMessageFetchUi({ keepStatus: true });
                setAutoMessageFetchStatus('请先添加至少一位成员', 'error');
                showToast('请先添加自动抓取成员');
                return;
            }

            const nextConfig = cloneAutoMessageFetchConfig(persistedConfig);
            nextConfig[settingKey] = nextEnabled;
            if (isScheduled && nextEnabled && !persistedConfig.scheduledEnabled) {
                nextConfig.lastRunAt = Date.now();
            }
            const savedConfig = writeAutoMessageFetchConfig(nextConfig);

            draftConfig[settingKey] = savedConfig[settingKey];
            if (!autoMessageFetchDraftDirty) {
                autoMessageFetchDraftConfig = cloneAutoMessageFetchConfig(savedConfig);
            }

            if (settingKey === 'startupEnabled' && !savedConfig.startupEnabled) {
                autoMessageFetchStartupArmed = false;
                if (autoMessageFetchStartupTimer) clearTimeout(autoMessageFetchStartupTimer);
                autoMessageFetchStartupTimer = null;
            }

            if (settingKey === 'scheduledEnabled') {
                if (savedConfig.scheduledEnabled) {
                    scheduleAutoMessageFetch(savedConfig.intervalMinutes * 60 * 1000);
                } else {
                    if (autoMessageFetchTimer) clearTimeout(autoMessageFetchTimer);
                    autoMessageFetchTimer = null;
                }
            }

            renderAutoMessageFetchUi();
            showToast(`${isScheduled ? '定时抓取' : '自动抓取'}已${nextEnabled ? '开启' : '关闭'}`);
        }

        function setStartupAutoMessageFetchEnabled(enabled) {
            saveAutoMessageFetchEnabledState('startupEnabled', enabled);
        }

        function setScheduledAutoMessageFetchEnabled(enabled) {
            saveAutoMessageFetchEnabledState('scheduledEnabled', enabled);
        }

        function setAutoMessageFetchEnabled(enabled) {
            setScheduledAutoMessageFetchEnabled(enabled);
        }

        function closeAutoMessageFetchDropdowns(exceptId = '') {
            document.querySelectorAll('.auto-fetch-option-dropdown').forEach(dropdown => {
                if (exceptId && dropdown.id === exceptId) return;
                dropdown.style.display = 'none';
            });
        }

        function toggleAutoMessageFetchDropdown(settingName) {
            const dropdownIds = {
                roomType: 'auto-fetch-room-type-dropdown',
                messageScope: 'auto-fetch-message-scope-dropdown',
                intervalMinutes: 'auto-fetch-interval-dropdown'
            };
            const dropdown = document.getElementById(dropdownIds[settingName]);
            if (!dropdown) return;
            const shouldOpen = dropdown.style.display !== 'block';
            closeAutoMessageFetchDropdowns();
            dropdown.style.display = shouldOpen ? 'block' : 'none';
        }

        function selectAutoMessageFetchOption(settingName, value) {
            closeAutoMessageFetchDropdowns();
            if (settingName === 'roomType') {
                setAutoMessageFetchRoomType(value);
            } else if (settingName === 'messageScope') {
                setAutoMessageFetchScope(value);
            } else if (settingName === 'intervalMinutes') {
                setAutoMessageFetchInterval(value);
            }
        }

        function saveAutoMessageFetchSettings(options = {}) {
            if (!autoMessageFetchDraftDirty) return;

            const previousConfig = readAutoMessageFetchConfig();
            const draftConfig = cloneAutoMessageFetchConfig(getAutoMessageFetchDraftConfig());
            if ((draftConfig.startupEnabled || draftConfig.scheduledEnabled) && draftConfig.members.length === 0) {
                setAutoMessageFetchStatus('请先添加至少一位成员', 'error');
                showToast('请先添加自动抓取成员');
                return;
            }

            const scheduleTimingChanged = draftConfig.scheduledEnabled
                && (!previousConfig.scheduledEnabled
                    || previousConfig.intervalMinutes !== draftConfig.intervalMinutes);
            draftConfig.lastRunAt = scheduleTimingChanged ? Date.now() : previousConfig.lastRunAt;

            const savedConfig = writeAutoMessageFetchConfig(draftConfig);
            autoMessageFetchDraftConfig = cloneAutoMessageFetchConfig(savedConfig);
            autoMessageFetchDraftDirty = false;

            if (!savedConfig.startupEnabled) {
                autoMessageFetchStartupArmed = false;
                if (autoMessageFetchStartupTimer) clearTimeout(autoMessageFetchStartupTimer);
                autoMessageFetchStartupTimer = null;
            }

            if (savedConfig.scheduledEnabled) {
                if (scheduleTimingChanged || !autoMessageFetchTimer) {
                    scheduleAutoMessageFetch(savedConfig.intervalMinutes * 60 * 1000);
                }
            } else {
                if (autoMessageFetchTimer) clearTimeout(autoMessageFetchTimer);
                autoMessageFetchTimer = null;
            }

            closeAutoMessageFetchDropdowns();
            renderAutoMessageFetchUi();
            const missingSmallRoomCount = savedConfig.roomType === 'small' || savedConfig.roomType === 'all'
                ? savedConfig.members.filter(member => !member.smallChannelId).length
                : 0;
            if (missingSmallRoomCount > 0) {
                const missingMessage = savedConfig.roomType === 'all'
                    ? `${missingSmallRoomCount} 位成员缺少小房间参数，将只抓取大房间`
                    : `${missingSmallRoomCount} 位成员缺少小房间参数`;
                setAutoMessageFetchStatus(`已自动保存；${missingMessage}`, 'error');
            }
            if (!options.silent) showToast('自动抓取设置已保存');
        }

        function scheduleAutoMessageFetch(delayMs) {
            if (autoMessageFetchTimer) clearTimeout(autoMessageFetchTimer);
            autoMessageFetchTimer = null;

            const config = readAutoMessageFetchConfig();
            if (!config.scheduledEnabled || config.members.length === 0) return;
            const scheduleGeneration = autoMessageFetchAccountGeneration;
            const accountScope = typeof window.getPocketAccountScopeKey === 'function'
                ? String(window.getPocketAccountScopeKey() || '')
                : '';

            const safeDelay = Math.max(250, Number(delayMs) || config.intervalMinutes * 60 * 1000);
            autoMessageFetchTimer = setTimeout(() => {
                if (scheduleGeneration !== autoMessageFetchAccountGeneration
                    || (typeof window.getPocketAccountScopeKey === 'function'
                        && String(window.getPocketAccountScopeKey() || '') !== accountScope)) return;
                autoMessageFetchTimer = null;
                Promise.resolve(runAutoMessageFetchNow()).catch(error => {
                    console.warn('自动抓取任务失败:', error);
                });
            }, safeDelay);
        }

        function filterFetchedMemberMessages(list) {
            return (Array.isArray(list) ? list : []).filter(message => {
                let senderId = message.senderUserId || message.senderId || message.uid;
                if (!senderId && message.extInfo) {
                    try {
                        const ext = typeof message.extInfo === 'string' ? JSON.parse(message.extInfo) : message.extInfo;
                        if (ext?.user) senderId = ext.user.userId || ext.user.id;
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/fetch-legacy.js'); }
                }
                return String(senderId || '') !== '121569667';
            });
        }

        async function fetchAutoMessageMember(member, token, options = {}) {
            const roomType = options.roomType === 'small' ? 'small' : 'big';
            const fetchAll = options.messageScope === 'all';
            const isCurrentRun = typeof options.isCurrentRun === 'function' ? options.isCurrentRun : () => true;
            const channelId = roomType === 'small' ? member.smallChannelId : member.channelId;
            if (!channelId) {
                throw new Error(`缺少${roomType === 'small' ? '小' : '大'}房间 Channel ID`);
            }

            const previousBoundary = loadFetchBoundary(member.serverId, channelId, fetchAll);
            const previousBoundaryTimestamp = getFetchBoundaryTimestamp(previousBoundary);
            const collectedMessages = [];
            const seenKeys = new Set();
            let nextTime = 0;
            let pageCount = 0;
            let reachedPrevious = false;

            do {
                if (!isCurrentRun()) throw new Error('account-changed');
                const pa = window.getPA ? window.getPA() : null;
                const response = await ipcRenderer.invoke('fetch-room-messages', {
                    token,
                    serverId: member.serverId,
                    channelId,
                    pa,
                    nextTime,
                    fetchAll
                });
                if (!isCurrentRun()) throw new Error('account-changed');

                if (!response?.success || !response?.data?.content) {
                    throw new Error(response?.msg || '抓取接口未返回消息');
                }

                const content = response.data.content;
                const rawList = content.messageList || content.message || [];
                let list = fetchAll ? (Array.isArray(rawList) ? rawList : []) : filterFetchedMemberMessages(rawList);
                if (previousBoundary) {
                    const stopIndex = list.findIndex(message => buildFetchMessageKey(message) === previousBoundary);
                    if (stopIndex >= 0) {
                        list = list.slice(0, stopIndex);
                        reachedPrevious = true;
                    } else if (previousBoundaryTimestamp > 0) {
                        const crossedBoundaryIndex = list.findIndex(message => {
                            const messageTimestamp = getFetchMessageTimestamp(message);
                            return messageTimestamp > 0 && messageTimestamp <= previousBoundaryTimestamp;
                        });
                        if (crossedBoundaryIndex >= 0) {
                            list = list.slice(0, crossedBoundaryIndex);
                            reachedPrevious = true;
                        }
                    }
                }

                for (const message of list) {
                    const messageKey = buildFetchMessageKey(message);
                    if (messageKey && seenKeys.has(messageKey)) continue;
                    if (messageKey) seenKeys.add(messageKey);
                    collectedMessages.push(message);
                }

                pageCount += 1;
                nextTime = reachedPrevious ? 0 : (Number(content.nextTime) || 0);

                if (!previousBoundary || !Array.isArray(rawList) || rawList.length === 0) nextTime = 0;
                if (nextTime > 0 && pageCount < AUTO_MESSAGE_FETCH_MAX_PAGES) await sleep(350);
            } while (nextTime > 0 && pageCount < AUTO_MESSAGE_FETCH_MAX_PAGES);
            if (!isCurrentRun()) throw new Error('account-changed');

            if (pageCount >= AUTO_MESSAGE_FETCH_MAX_PAGES && nextTime > 0) {
                throw new Error(`连续抓取超过 ${AUTO_MESSAGE_FETCH_MAX_PAGES} 页，已安全停止`);
            }

            if (collectedMessages.length === 0) {
                return { addedCount: 0, changed: false, initialized: !previousBoundary };
            }

            const exportMeta = getFetchExportMemberMeta(member.name, channelId);
            const exportGroupName = exportMeta.groupName === '未知分团' && member.team
                ? member.team
                : exportMeta.groupName;
            const exportPrefix = `${exportGroupName}-${exportMeta.memberName}`;
            const saveResult = await ipcRenderer.invoke('save-export-jsonl', {
                memberName: exportMeta.memberName,
                fileName: `${exportPrefix}-${exportMeta.channelId}.jsonl`,
                entries: buildFetchExportEntries(collectedMessages)
            });
            if (!isCurrentRun()) throw new Error('account-changed');

            if (!saveResult?.success) {
                throw new Error(saveResult?.msg || '保存 JSONL 失败');
            }

            saveFetchBoundary(member.serverId, channelId, fetchAll, collectedMessages[0]);
            return {
                addedCount: Number(saveResult.addedCount) || 0,
                changed: saveResult.changed === true,
                initialized: !previousBoundary
            };
        }

        async function fetchAutoMessageMemberRooms(member, token, options = {}) {
            const roomTypes = options.roomType === 'all'
                ? ['big', 'small']
                : [options.roomType === 'small' ? 'small' : 'big'];
            const aggregate = { addedCount: 0, changed: false, skippedRoomCount: 0 };

            for (let index = 0; index < roomTypes.length; index += 1) {
                if (typeof options.isCurrentRun === 'function' && !options.isCurrentRun()) {
                    throw new Error('account-changed');
                }
                const roomType = roomTypes[index];
                if (roomType === 'small' && !member.smallChannelId && options.roomType === 'all') {
                    aggregate.skippedRoomCount += 1;
                    continue;
                }

                const result = await fetchAutoMessageMember(member, token, {
                    roomType,
                    messageScope: options.messageScope,
                    isCurrentRun: options.isCurrentRun
                });
                aggregate.addedCount += result.addedCount;
                aggregate.changed = aggregate.changed || result.changed;
                if (index < roomTypes.length - 1) await sleep(350);
            }

            return aggregate;
        }

        async function runAutoMessageFetchNow(options = {}) {
            const manual = options?.manual === true;
            const startup = options?.startup === true;
            const config = readAutoMessageFetchConfig();
            const shouldSchedule = config.scheduledEnabled;

            if (autoMessageFetchInFlight) {
                if (manual) showToast('自动抓取正在运行');
                if (!manual && shouldSchedule) scheduleAutoMessageFetch(30000);
                return { success: false, skipped: true, reason: 'busy' };
            }

            if (config.members.length === 0) {
                setAutoMessageFetchStatus('请先添加自动抓取成员', 'error');
                if (manual) showToast('请先添加自动抓取成员');
                return { success: false, skipped: true, reason: 'missing-members' };
            }

            const token = String(appToken || readStoredToken() || '').trim();
            if (!token) {
                setAutoMessageFetchStatus('等待账号登录，登录后会继续自动抓取', 'error');
                if (manual) showToast('请先登录账号');
                if (shouldSchedule) scheduleAutoMessageFetch(Math.min(60000, config.intervalMinutes * 60 * 1000));
                return { success: false, skipped: true, reason: 'missing-token' };
            }
            const runContext = {
                generation: autoMessageFetchAccountGeneration,
                token,
                accountScope: typeof window.getPocketAccountScopeKey === 'function'
                    ? String(window.getPocketAccountScopeKey() || '')
                    : '',
                sessionGeneration: typeof window.getPocketAccountSessionGeneration === 'function'
                    ? window.getPocketAccountSessionGeneration()
                    : 0
            };
            const isCurrentRun = () => (
                runContext.generation === autoMessageFetchAccountGeneration
                && runContext.token === String(appToken || readStoredToken() || '').trim()
                && (typeof window.getPocketAccountScopeKey !== 'function'
                    || runContext.accountScope === String(window.getPocketAccountScopeKey() || ''))
                && (typeof window.getPocketAccountSessionGeneration !== 'function'
                    || runContext.sessionGeneration === window.getPocketAccountSessionGeneration())
            );

            if (isAutoFetching || document.getElementById('loading-indicator')) {
                setAutoMessageFetchStatus('手动抓取正在运行，自动任务已顺延');
                if (shouldSchedule) scheduleAutoMessageFetch(30000);
                return { success: false, skipped: true, reason: 'manual-fetch-busy' };
            }

            autoMessageFetchInFlight = true;
            const runButton = document.getElementById('btn-auto-fetch-now');
            if (runButton) {
                runButton.disabled = true;
                runButton.textContent = '抓取中...';
            }

            let addedCount = 0;
            let changedMemberCount = 0;
            let failedCount = 0;
            let skippedRoomCount = 0;

            try {
                let nextMemberIndex = 0;
                let completedMemberCount = 0;
                const roomLabel = config.roomType === 'small'
                    ? '小房间'
                    : (config.roomType === 'all' ? '所有房间' : '大房间');
                const scopeLabel = config.messageScope === 'all' ? '全体消息' : '成员消息';
                const worker = async () => {
                    while (nextMemberIndex < config.members.length) {
                        if (!isCurrentRun()) return;
                        const latestConfig = readAutoMessageFetchConfig();
                        if (!manual && startup && !latestConfig.startupEnabled) return;
                        if (!manual && !startup && !latestConfig.scheduledEnabled) return;

                        const memberIndex = nextMemberIndex;
                        nextMemberIndex += 1;
                        const member = config.members[memberIndex];
                        setAutoMessageFetchStatus(
                            `正在抓取 ${member.name} · ${roomLabel} · ${scopeLabel}（已完成 ${completedMemberCount}/${config.members.length}）...`,
                            'running'
                        );
                        try {
                            const result = await fetchAutoMessageMemberRooms(member, token, {
                                roomType: config.roomType,
                                messageScope: config.messageScope,
                                isCurrentRun
                            });
                            if (!isCurrentRun()) return;
                            addedCount += result.addedCount;
                            skippedRoomCount += result.skippedRoomCount;
                            if (result.changed) changedMemberCount += 1;
                        } catch (error) {
                            if (!isCurrentRun()) return;
                            failedCount += 1;
                            console.warn(`自动抓取 ${member.name} 失败:`, error);
                        } finally {
                            completedMemberCount += 1;
                            setAutoMessageFetchStatus(
                                `正在并发抓取成员消息（${completedMemberCount}/${config.members.length}）...`,
                                'running'
                            );
                        }
                    }
                };

                await Promise.all(Array.from(
                    { length: Math.min(AUTO_MESSAGE_FETCH_MEMBER_CONCURRENCY, config.members.length) },
                    () => worker()
                ));
                if (!isCurrentRun()) return { success: false, skipped: true, reason: 'account-changed' };

                const latestConfig = readAutoMessageFetchConfig();
                latestConfig.lastRunAt = Date.now();
                writeAutoMessageFetchConfig(latestConfig);

                if (addedCount > 0) {
                    window.__messageDataDirty = true;
                    setAutoMessageFetchStatus(
                        `本次新增 ${addedCount} 条，更新 ${changedMemberCount} 位成员${skippedRoomCount ? `，跳过 ${skippedRoomCount} 个小房间` : ''}${failedCount ? `，${failedCount} 位失败` : ''}`,
                        failedCount ? 'error' : 'success'
                    );
                } else if (failedCount > 0) {
                    setAutoMessageFetchStatus(`本次没有新增消息，${failedCount} 位成员抓取失败`, 'error');
                } else if (skippedRoomCount > 0) {
                    setAutoMessageFetchStatus(`检查完成，没有新消息；跳过 ${skippedRoomCount} 个缺少参数的小房间`, 'success');
                } else {
                    setAutoMessageFetchStatus('检查完成，没有新消息', 'success');
                }

                return { success: failedCount === 0, addedCount, changedMemberCount, failedCount, skippedRoomCount };
            } finally {
                if (isCurrentRun()) {
                    autoMessageFetchInFlight = false;
                    if (runButton) {
                        runButton.disabled = autoMessageFetchDraftDirty;
                        runButton.textContent = '立即抓取';
                        runButton.title = autoMessageFetchDraftDirty ? '自动抓取设置正在保存' : '';
                    }

                    const latestConfig = readAutoMessageFetchConfig();
                    if (latestConfig.scheduledEnabled) {
                        scheduleAutoMessageFetch(latestConfig.intervalMinutes * 60 * 1000);
                    }
                }
            }
        }

        function queueStartupAutoMessageFetch(delayMs = 0) {
            if (!autoMessageFetchStartupArmed || autoMessageFetchStartupCompleted) return;
            if (autoMessageFetchStartupTimer) clearTimeout(autoMessageFetchStartupTimer);

            autoMessageFetchStartupTimer = setTimeout(() => {
                autoMessageFetchStartupTimer = null;
                const config = readAutoMessageFetchConfig();
                if (!autoMessageFetchStartupArmed || !config.startupEnabled || autoMessageFetchStartupCompleted) return;
                if (!String(appToken || readStoredToken() || '').trim()) {
                    setAutoMessageFetchStatus('等待账号登录，登录后执行打开软件自动抓取');
                    return;
                }
                if (autoMessageFetchInFlight || isAutoFetching || document.getElementById('loading-indicator')) {
                    queueStartupAutoMessageFetch(30000);
                    return;
                }

                autoMessageFetchStartupCompleted = true;
                Promise.resolve(runAutoMessageFetchNow({ startup: true })).catch(error => {
                    console.warn('打开软件自动抓取失败:', error);
                });
            }, Math.max(0, Number(delayMs) || 0));
        }

        function invalidateAutoMessageFetchAccountState() {
            autoMessageFetchAccountGeneration += 1;
            if (autoMessageFetchTimer) clearTimeout(autoMessageFetchTimer);
            if (autoMessageFetchStartupTimer) clearTimeout(autoMessageFetchStartupTimer);
            autoMessageFetchTimer = null;
            autoMessageFetchStartupTimer = null;
            autoMessageFetchInFlight = false;
            autoMessageFetchStartupArmed = false;
            autoMessageFetchStartupCompleted = false;
            autoMessageFetchDraftConfig = null;
            autoMessageFetchDraftDirty = false;
            const runButton = document.getElementById('btn-auto-fetch-now');
            if (runButton) {
                runButton.disabled = false;
                runButton.textContent = '立即抓取';
                runButton.title = '';
            }
        }

        function activateAutoMessageFetchForCurrentAccount() {
            invalidateAutoMessageFetchAccountState();
            const config = readAutoMessageFetchConfig();
            autoMessageFetchStartupArmed = config.startupEnabled && config.members.length > 0;
            renderAutoMessageFetchUi({ keepStatus: true });
            if (autoMessageFetchStartupArmed) {
                queueStartupAutoMessageFetch(1200);
            } else if (config.scheduledEnabled && config.members.length > 0) {
                const intervalMs = config.intervalMinutes * 60 * 1000;
                const elapsed = config.lastRunAt ? Date.now() - config.lastRunAt : intervalMs;
                scheduleAutoMessageFetch(elapsed >= intervalMs ? 1200 : intervalMs - elapsed);
            }
        }

        window.invalidateAutoMessageFetchAccountState = invalidateAutoMessageFetchAccountState;
        window.activateAutoMessageFetchForCurrentAccount = activateAutoMessageFetchForCurrentAccount;

        function initializeAutoMessageFetch() {
            if (autoMessageFetchInitialized) return;
            autoMessageFetchInitialized = true;
            renderAutoMessageFetchUi();

            document.addEventListener('pointerdown', event => {
                const wrapper = document.querySelector('.auto-fetch-member-search');
                const results = document.getElementById('auto-fetch-member-results');
                if (wrapper && results && !wrapper.contains(event.target)) results.style.display = 'none';
                if (!event.target.closest?.('.auto-fetch-dropdown')) closeAutoMessageFetchDropdowns();
            });

            if (currentPocketUserId) {
                activateAutoMessageFetchForCurrentAccount();
            } else {
                invalidateAutoMessageFetchAccountState();
                renderAutoMessageFetchUi({ keepStatus: true });
            }
        }

        window.addEventListener('load', initializeAutoMessageFetch, { once: true });
        window.addEventListener('member-data-loaded', () => renderAutoMessageFetchUi({ keepStatus: true }));

        function getTodayCheckinKey() {
            const now = new Date();
            const pad = (value) => String(value).padStart(2, '0');
            return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        }

        function getAutoCheckinEnabled() {
            return String(readAutoCheckinSetting(AUTO_CHECKIN_ENABLED_KEY, '1')) !== '0';
        }

        function setAutoCheckinEnabled(enabled) {
            writeAutoCheckinSetting(AUTO_CHECKIN_ENABLED_KEY, enabled ? '1' : '0');
            syncAutoCheckinUi();
        }

        function markCheckinComplete(userId) {
            writeAutoCheckinSetting(AUTO_CHECKIN_LAST_DATE_KEY, getTodayCheckinKey());
            writeAutoCheckinSetting(AUTO_CHECKIN_LAST_USER_KEY, String(userId || currentPocketUserId || ''));
        }

        function isCheckinRecordedToday(userId) {
            const targetUserId = String(userId || currentPocketUserId || '');
            return String(readAutoCheckinSetting(AUTO_CHECKIN_LAST_DATE_KEY, '')) === getTodayCheckinKey()
                && String(readAutoCheckinSetting(AUTO_CHECKIN_LAST_USER_KEY, '')) === targetUserId;
        }

        function updateAutoCheckinStatus(message, color = 'var(--text-sub)') {
            const statusEl = document.getElementById('auto-checkin-status');
            if (!statusEl) return;
            statusEl.innerText = message;
            statusEl.style.color = color;
        }

        function syncAutoCheckinUi() {
            const toggle = document.getElementById('auto-checkin-toggle');
            if (toggle) {
                toggle.checked = getAutoCheckinEnabled();
            }

            if (currentPocketUserId && isCheckinRecordedToday(currentPocketUserId)) {
                updateAutoCheckinStatus('今日签到已完成，重复打开软件不会再次提交', '#28a745');
                return;
            }

            if (getAutoCheckinEnabled()) {
                updateAutoCheckinStatus('已开启自动签到，登录成功后会在打开软件时自动尝试签到');
            } else {
                updateAutoCheckinStatus('已关闭自动签到，需要时可以点击“立即签到”');
            }
        }

        function formatCheckinSuccessMessage(content) {
            if (!content || typeof content !== 'object') {
                return '签到成功';
            }

            const days = Number(content.days) || 0;
            const addExp = Number(content.addExp) || 0;
            const addSupport = Number(content.addSupport) || 0;
            const parts = [];

            if (days > 0) parts.push(`第 ${days} 天`);
            if (addExp > 0) parts.push(`成长值 +${addExp}`);
            if (addSupport > 0) parts.push(`鸡翅 +${addSupport}`);

            return parts.length ? `签到成功，${parts.join('，')}` : '签到成功';
        }

        function setCheckinButtonBusy(isBusy) {
            const btn = document.getElementById('btn-manual-checkin');
            if (!btn) return;
            btn.disabled = isBusy;
            btn.innerText = isBusy ? '签到中...' : '立即签到';
        }

        async function performPocketCheckin(options = {}) {
            const { force = false, silentWhenSkipped = true } = options;
            const shouldShowCheckinToast = force || !silentWhenSkipped;

            if (!appToken) {
                updateAutoCheckinStatus('请先登录账号后再签到', '#ff4d4f');
                if (!silentWhenSkipped) showToast('请先登录账号');
                return { success: false, skipped: true, reason: 'missing-token' };
            }

            if (!currentPocketUserId) {
                updateAutoCheckinStatus('当前账号信息未就绪，请稍后重试', '#ff4d4f');
                return { success: false, skipped: true, reason: 'missing-user' };
            }

            if (!force && !getAutoCheckinEnabled()) {
                syncAutoCheckinUi();
                return { success: false, skipped: true, reason: 'disabled' };
            }

            if (!force && isCheckinRecordedToday(currentPocketUserId)) {
                syncAutoCheckinUi();
                return { success: true, skipped: true, reason: 'already-recorded' };
            }

            if (autoCheckinInFlight) {
                return { success: false, skipped: true, reason: 'busy' };
            }
            const accountContext = capturePocketAccountContext(appToken);
            const checkinGeneration = autoCheckinGeneration;
            const isCurrentCheckin = () => (
                checkinGeneration === autoCheckinGeneration
                && isPocketAccountContextCurrent(accountContext)
            );

            autoCheckinInFlight = true;
            setCheckinButtonBusy(true);
            updateAutoCheckinStatus('正在签到，请稍候...', 'var(--primary)');

            try {
                const pa = window.getPA ? window.getPA() : null;
                const res = await ipcRenderer.invoke('pocket-checkin', {
                    token: accountContext.token,
                    pa
                });
                if (!isCurrentCheckin()) return { success: false, skipped: true, reason: 'account-changed' };

                if (res && res.success) {
                    markCheckinComplete(accountContext.userId);
                    const successMsg = formatCheckinSuccessMessage(res.content);
                    updateAutoCheckinStatus(`${successMsg}，今日无需重复签到`, '#28a745');
                    if (shouldShowCheckinToast) {
                        showToast(successMsg);
                    }
                    return { success: true, content: res.content };
                }

                const errorMessage = res?.msg || '签到失败';
                if (/已签到|重复签到|已经签到|已领取|明天再来/.test(errorMessage)) {
                    markCheckinComplete(accountContext.userId);
                    updateAutoCheckinStatus('今日签到已完成，重复打开软件不会再次提交', '#28a745');
                    if (shouldShowCheckinToast) {
                        showToast('今天已经签到过了');
                    }
                    return { success: true, skipped: true, reason: 'already-signed' };
                }

                updateAutoCheckinStatus(`签到失败：${errorMessage}`, '#ff4d4f');
                if (shouldShowCheckinToast) {
                    showToast(`签到失败：${errorMessage}`);
                }
                return { success: false, msg: errorMessage };
            } catch (error) {
                if (!isCurrentCheckin()) return { success: false, skipped: true, reason: 'account-changed' };
                const errorMessage = error?.message || '签到请求异常';
                updateAutoCheckinStatus(`签到失败：${errorMessage}`, '#ff4d4f');
                if (shouldShowCheckinToast) {
                    showToast(`签到失败：${errorMessage}`);
                }
                return { success: false, msg: errorMessage };
            } finally {
                if (isCurrentCheckin()) {
                    autoCheckinInFlight = false;
                    setCheckinButtonBusy(false);
                }
            }
        }

        async function handleManualCheckIn() {
            await performPocketCheckin({
                force: true,
                silentWhenSkipped: false
            });
        }

        function toggleAutoCheckin(enabled) {
            setAutoCheckinEnabled(enabled);
            if (enabled) {
                updateAutoCheckinStatus('已开启自动签到，软件启动并验证登录后会自动尝试签到');
            } else {
                updateAutoCheckinStatus('已关闭自动签到，需要时可以点击“立即签到”');
            }
        }

        async function fetchAllMsgs() {
            const btn = document.getElementById('btn-fetch-all');
            const fetchBtn = document.getElementById('btn-fetch-one');
            const box = document.getElementById('msg-result');
            const memberSearch = document.getElementById('member-search');
            const exportBtn = document.getElementById('btn-export-jsonl');
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
                box.innerHTML = `<div style="text-align:center; padding:20px; color:#ff4d4f;">请先在搜索框输入名字并选择成员</div>`;
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
        let live48QrTimer = null;
        let live48QrCode = '';
        let live48QrPollCount = 0;

        function switchLoginTab(type) {
            const tabSms = document.getElementById('tab-sms');
            const tabQr = document.getElementById('tab-qr');
            const tabToken = document.getElementById('tab-token');
            const formSms = document.getElementById('form-sms');
            const formQr = document.getElementById('form-qr');
            const formToken = document.getElementById('form-token');
            const msgDiv = document.getElementById('login-msg');

            msgDiv.innerText = '';

            if (type !== 'qr') stopLive48QrLogin(false);

            [
                { tab: tabSms, form: formSms, key: 'sms' },
                { tab: tabQr, form: formQr, key: 'qr' },
                { tab: tabToken, form: formToken, key: 'token' }
            ].forEach(item => {
                const active = item.key === type;
                if (item.tab) {
                    item.tab.style.color = active ? 'var(--primary)' : 'var(--text-sub)';
                    item.tab.style.borderBottomColor = active ? 'var(--primary)' : 'transparent';
                    item.tab.style.fontWeight = active ? 'bold' : 'normal';
                }
                if (item.form) item.form.style.display = active ? 'block' : 'none';
            });

            if (type === 'qr') refreshLive48QrLoginStatus();
        }

        function setLive48QrMessage(text, color = 'var(--text-sub)') {
            const msgEl = document.getElementById('live48-login-qr-msg');
            if (!msgEl) return;
            msgEl.innerText = text;
            msgEl.style.color = color;
        }

        function renderLive48QrAccountInfo(accountInfo = null) {
            const box = document.getElementById('live48-login-account');
            const avatarEl = document.getElementById('live48-login-account-avatar');
            const nameEl = document.getElementById('live48-login-account-name');
            const idEl = document.getElementById('live48-login-account-id');
            if (!box || !avatarEl || !nameEl || !idEl) return;

            if (!accountInfo) {
                box.style.display = 'none';
                avatarEl.src = './icon.png';
                nameEl.innerText = 'live.48.cn 用户';
                idEl.innerText = 'UID: --';
                return;
            }

            const nickname = String(accountInfo.nickname || 'live.48.cn 用户').trim();
            const userId = String(accountInfo.userId || accountInfo.uid || '').trim();
            const avatarUrl = String(accountInfo.avatarUrl || accountInfo.avatar || '').trim();
            nameEl.innerText = nickname;
            idEl.innerText = userId ? `UID: ${userId}` : 'UID: --';
            avatarEl.src = avatarUrl || './icon.png';
            box.style.display = 'flex';
        }

        async function refreshLive48QrLoginStatus() {
            try {
                const res = await ipcRenderer.invoke('login-qr-status');
                if (res && res.loggedIn && res.accountInfo) {
                    renderLive48QrAccountInfo(res.accountInfo);
                    setLive48QrMessage('live.48.cn 已登录', '#28a745');
                } else if (res && res.accountInfo) {
                    renderLive48QrAccountInfo(res.accountInfo);
                    setLive48QrMessage(res.msg || 'live.48.cn 登录状态可能已失效', '#fa8c16');
                }
            } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/fetch-legacy.js'); }
        }

        function resetLive48QrDisplay() {
            const qrImg = document.getElementById('live48-login-qr');
            const placeholder = document.getElementById('live48-qr-placeholder');
            if (qrImg) {
                qrImg.src = '';
                qrImg.style.display = 'none';
            }
            if (placeholder) {
                placeholder.style.display = 'flex';
                placeholder.innerText = '点击下方按钮生成二维码';
            }
        }

        function stopLive48QrLogin(cancelRemote = false) {
            if (live48QrTimer) {
                clearInterval(live48QrTimer);
                live48QrTimer = null;
            }

            const codeToCancel = live48QrCode;
            live48QrCode = '';
            live48QrPollCount = 0;

            const btn = document.getElementById('btn-live48-login-qr');
            const stopBtn = document.getElementById('btn-live48-login-stop');
            if (btn) {
                btn.disabled = false;
                btn.innerText = '生成二维码';
            }
            if (stopBtn) stopBtn.style.display = 'none';

            if (cancelRemote && codeToCancel) {
                ipcRenderer.invoke('login-cancel-qr', { code: codeToCancel }).catch(() => {});
                resetLive48QrDisplay();
                renderLive48QrAccountInfo(null);
                setLive48QrMessage('已停止扫码登录');
            }
        }

        async function pollLive48QrLogin() {
            if (!live48QrCode) return;
            live48QrPollCount += 1;

            if (live48QrPollCount > 100) {
                stopLive48QrLogin(true);
                setLive48QrMessage('二维码已过期，请重新生成', '#ff4d4f');
                return;
            }

            try {
                const res = await ipcRenderer.invoke('login-poll-qr', { code: live48QrCode });
                if (!res || !res.success) {
                    throw new Error(res?.msg || '检查登录状态失败');
                }

                if (res.loggedIn) {
                    stopLive48QrLogin(false);
                    renderLive48QrAccountInfo(res.accountInfo || null);
                    const name = res.accountInfo?.nickname ? `：${res.accountInfo.nickname}` : '';
                    setLive48QrMessage(`扫码登录成功${name}`, '#28a745');
                    const msgBox = document.getElementById('login-msg');
                    if (msgBox) {
                        msgBox.style.color = '#28a745';
                        msgBox.innerText = res.accountInfo?.nickname
                            ? `live.48.cn 已登录：${res.accountInfo.nickname}；口袋 API 功能仍需验证码或 Token 登录。`
                            : '网页扫码登录成功；口袋 API 功能仍需验证码或 Token 登录。';
                    }
                    return;
                }

                setLive48QrMessage(res.msg || '等待 App 确认登录');
            } catch (error) {
                if (live48QrCode) {
                    setLive48QrMessage(error.message || '检查登录状态失败', '#ff4d4f');
                }
            }
        }

        async function startLive48QrLogin() {
            stopLive48QrLogin(false);

            const btn = document.getElementById('btn-live48-login-qr');
            const stopBtn = document.getElementById('btn-live48-login-stop');
            const qrImg = document.getElementById('live48-login-qr');
            const placeholder = document.getElementById('live48-qr-placeholder');
            const msgBox = document.getElementById('login-msg');

            if (btn) {
                btn.disabled = true;
                btn.innerText = '生成中...';
            }
            if (msgBox) msgBox.innerText = '';
            renderLive48QrAccountInfo(null);
            if (placeholder) {
                placeholder.style.display = 'flex';
                placeholder.innerText = '正在生成二维码...';
            }
            if (qrImg) qrImg.style.display = 'none';
            setLive48QrMessage('正在连接 live.48.cn...');

            try {
                const res = await ipcRenderer.invoke('login-create-qr');
                if (!res || !res.success || !res.code || !res.qrImage) {
                    throw new Error(res?.msg || '创建二维码失败');
                }

                live48QrCode = res.code;
                live48QrPollCount = 0;
                if (qrImg) {
                    qrImg.src = res.qrImage;
                    qrImg.style.display = 'block';
                }
                if (placeholder) placeholder.style.display = 'none';
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = '刷新二维码';
                }
                if (stopBtn) stopBtn.style.display = 'block';
                setLive48QrMessage('请用口袋48 App 扫码，并在手机上确认登录');

                live48QrTimer = setInterval(pollLive48QrLogin, 3000);
            } catch (error) {
                resetLive48QrDisplay();
                setLive48QrMessage(error.message || '创建二维码失败', '#ff4d4f');
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = '重新生成';
                }
            }
        }

        let currentVerifyAnswer = null;

        async function getLoginPa() {
            if (window.yayaWasmReadyPromise) {
                try {
                    await window.yayaWasmReadyPromise;
                } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/fetch-legacy.js'); }
            }
            return typeof window.getPA === 'function' ? window.getPA() : null;
        }

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
                const pa = await getLoginPa();
                const res = await ipcRenderer.invoke('login-send-sms', { mobile, area, answer, pa });

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
                        verifyOptions.replaceChildren();

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
            const loginGeneration = ++accountValidationGeneration;

            msgDiv.innerText = '登录中...';
            msgDiv.style.color = 'var(--primary)';

            try {
                const pa = await getLoginPa();
                if (loginGeneration !== accountValidationGeneration) return;
                const res = await ipcRenderer.invoke('login-by-code', { mobile, code, pa });
                if (loginGeneration !== accountValidationGeneration) return;

                if (res.status === 200 && res.success) {
                    const token = res.content.token;
                    const userInfo = res.content.userInfo;

                    writeStoredToken(token);
                    const tokenInput = document.getElementById('login-token');
                    if (tokenInput) tokenInput.value = token;

                    msgDiv.style.color = '#28a745';
                    msgDiv.innerText = '登录成功！正在跳转...';

                    setTimeout(() => {
                        if (loginGeneration === accountValidationGeneration) checkToken();
                    }, 500);
                } else {
                    throw new Error(res.message || '登录失败');
                }
            } catch (err) {
                if (loginGeneration !== accountValidationGeneration) return;
                msgDiv.style.color = '#ff4d4f';
                msgDiv.innerText = '登录失败: ' + err.message;
            }
        }
        async function checkToken() {
            const tokenField = document.getElementById('login-token');
            const tokenInput = (tokenField && tokenField.value ? tokenField.value.trim() : '')
                || (typeof appToken !== 'undefined' && appToken ? String(appToken).trim() : '')
                || readStoredToken();
            const msgBox = document.getElementById('login-msg');
            const panelInput = document.getElementById('panel-login');
            const panelSuccess = document.getElementById('panel-logged-in');

            const accountArea = document.getElementById('account-switcher-area');
            const accountList = document.getElementById('account-list');

            if (!tokenInput) {
                if (msgBox) msgBox.innerText = '请输入 Token';
                return;
            }
            const previousToken = String(appToken || readStoredToken() || '').trim();
            if (previousToken && previousToken !== tokenInput
                && typeof resetAccountScopedSessionState === 'function') {
                resetAccountScopedSessionState();
                currentPocketUserId = '';
                currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
            }
            const validationGeneration = ++accountValidationGeneration;
            const isCurrentValidation = () => (
                validationGeneration === accountValidationGeneration
                && String(appToken || '').trim() === tokenInput
                && String(readStoredToken() || '').trim() === tokenInput
            );

            appToken = tokenInput;
            writeStoredToken(appToken);
            if (previousToken && previousToken !== tokenInput) {
                syncWebAccountButton(currentPocketProfile, false);
                syncAccountProfileEditUi(currentPocketProfile);
            }
            if (tokenField && tokenField.value !== tokenInput) {
                tokenField.value = tokenInput;
            }

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
                if (!isCurrentValidation()) return;

                if (res.success) {
                    if (panelInput) panelInput.style.display = 'none';
                    if (panelSuccess) panelSuccess.style.display = 'block';

                    updateLocalGiftDatabase();

                    const userInfo = res.userInfo;
                    const safeName = userInfo?.baseUserInfo?.nickname || userInfo?.nickname || '口袋用户';
                    const userId = userInfo?.baseUserInfo?.userId || userInfo?.userId || userInfo?.id || 'Unknown';
                    const currentAvatarRaw = userInfo?.baseUserInfo?.avatar || userInfo?.avatar || userInfo?.baseUserInfo?.faceImage || '';
                    const currentAvatarUrl = currentAvatarRaw
                        ? (String(currentAvatarRaw).startsWith('http') ? String(currentAvatarRaw) : `https://source.48.cn${currentAvatarRaw}`)
                        : './icon.png';
                    if (currentPocketUserId && String(currentPocketUserId) !== String(userId)
                        && typeof resetAccountScopedSessionState === 'function') {
                        resetAccountScopedSessionState();
                    }
                    currentPocketUserId = String(userId);
                    currentPocketProfile = {
                        nickname: safeName,
                        avatar: currentAvatarRaw,
                        avatarUrl: currentAvatarUrl
                    };
                    syncWebAccountButton(currentPocketProfile, true);
                    document.getElementById('user-nickname').innerText = safeName;
                    const idDisplay = document.getElementById('user-id-display');
                    if (idDisplay) idDisplay.innerText = `ID: ${userId}`;
                    const currentAvatarEl = document.getElementById('current-user-avatar');
                    if (currentAvatarEl) currentAvatarEl.src = currentAvatarUrl;
                    syncAccountProfileEditUi(currentPocketProfile);
                    refreshAccountProfileMeta();
                    if (msgBox) msgBox.innerText = '';
                    syncAutoCheckinUi();
                    if (typeof window.activateAutoMessageFetchForCurrentAccount === 'function') {
                        window.activateAutoMessageFetchForCurrentAccount();
                    }
                    if (!isWebRuntimeForAccountUi() && typeof startFollowedRoomNotificationPolling === 'function') {
                        startFollowedRoomNotificationPolling(1200, { silentInitialSync: true });
                    }

                    if (accountArea && accountList) {
                        accountList.replaceChildren();
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

                    await performPocketCheckin({
                        force: false,
                        silentWhenSkipped: true
                    });

                } else {
                    if (typeof resetAccountScopedSessionState === 'function') {
                        resetAccountScopedSessionState();
                    }
                    clearStoredToken();
                    appToken = '';
                    if (typeof stopFollowedRoomNotificationPolling === 'function') {
                        stopFollowedRoomNotificationPolling();
                    }
                    currentPocketUserId = '';
                    currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
                    clearWebAccountProfileCache();
                    syncWebAccountButton(currentPocketProfile, false);
                    if (panelInput) panelInput.style.display = 'block';
                    if (panelSuccess) panelSuccess.style.display = 'none';
                    syncAutoCheckinUi();
                    if (msgBox) {
                        msgBox.style.color = '#ff4d4f';
                        msgBox.innerText = res.msg || 'Token 无效';
                    }
                }
            } catch (e) {
                if (!isCurrentValidation()) return;
                console.error(e);
                if (typeof resetAccountScopedSessionState === 'function') {
                    resetAccountScopedSessionState();
                }
                if (typeof stopFollowedRoomNotificationPolling === 'function') {
                    stopFollowedRoomNotificationPolling();
                }
                currentPocketUserId = '';
                currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
                syncWebAccountButton(currentPocketProfile, false);
                if (panelInput) panelInput.style.display = 'block';
                if (panelSuccess) panelSuccess.style.display = 'none';
                syncAutoCheckinUi();
                if (msgBox) {
                    msgBox.style.color = '#ff4d4f';
                    msgBox.innerText = '验证出错: ' + e.message;
                }
            }
        }

        async function handleSwitchAccount(targetUserId, targetName) {

            const switchGeneration = ++accountSwitchGeneration;
            accountValidationGeneration += 1;

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
                if (switchGeneration !== accountSwitchGeneration) return;

                if (res.success) {
                    const newToken = res.content.token;
                    if (newToken) {
                        if (typeof resetAccountScopedSessionState === 'function') {
                            resetAccountScopedSessionState();
                        }
                        currentPocketUserId = '';
                        currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
                        appToken = newToken;
                        writeStoredToken(newToken);
                        syncWebAccountButton(currentPocketProfile, false);
                        syncAccountProfileEditUi(currentPocketProfile);
                        document.getElementById('login-token').value = newToken;

                        await checkToken();

                    } else {
                        throw new Error("接口未返回 Token");
                    }
                } else {
                    throw new Error(res.msg || "未知错误");
                }
            } catch (e) {
                if (switchGeneration !== accountSwitchGeneration) return;
                showToast(`切换失败: ${e.message}`);
                nickNameEl.innerText = originalName;
            }
        }

        function copyToken() {
            const token = appToken || readStoredToken();
            const btn = document.getElementById('btn-copy-token');

            if (token) {
                navigator.clipboard.writeText(token).then(() => {
                    const originalText = btn.innerText;
                    btn.innerText = "已复制";
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
                showToast('当前未获取到 Token');
            }
        }

        function logout() {
            accountValidationGeneration += 1;
            accountSwitchGeneration += 1;
            clearStoredToken();
            appToken = '';
            if (typeof stopFollowedRoomNotificationPolling === 'function') {
                stopFollowedRoomNotificationPolling();
            }
            currentPocketUserId = '';
            currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
            clearWebAccountProfileCache();
            syncWebAccountButton(currentPocketProfile, false);
            selectedAccountAvatarFile = null;
            selectedAccountAvatarDataUrl = '';
            if (typeof resetAccountScopedSessionState === 'function') {
                resetAccountScopedSessionState();
            }

            const panelInput = document.getElementById('panel-login');
            const panelSuccess = document.getElementById('panel-logged-in');

            if (panelSuccess) panelSuccess.style.display = 'none';
            if (panelInput) panelInput.style.display = 'block';

            document.getElementById('login-token').value = '';
            syncAccountProfileEditUi(currentPocketProfile);
            renderAccountRenameCount(null);
            renderAccountChickenBalance(null);
            setAccountProfileMetaVisible(false);
            const avatarInput = document.getElementById('account-avatar-file');
            if (avatarInput) avatarInput.value = '';
            const msgBox = document.getElementById('login-msg');
            if (msgBox) {
                msgBox.innerText = '记录已清除';
                msgBox.style.color = '#28a745';
            }
            syncAutoCheckinUi();

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
            const exportBtn = document.getElementById('btn-export-jsonl');
            const exportLocalBtn = document.getElementById('btn-export-local');

            if (!channelId) {
                if (!isLoadMore) {
                    box.innerHTML = `<div style="text-align:center; padding:20px; color:#ff4d4f;">请先在搜索框输入名字并选择成员</div>`;
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
                box.replaceChildren();
                lastNextTime = 0;
                allFetchedMsgs = [];
                currentFetchStopKey = loadFetchBoundary(serverId, channelId, isFetchAllMode);
                currentFetchStoppedAtPrevious = false;
                currentFetchedServerId = serverId;
                currentFetchedChannelId = channelId;
                currentFetchedFetchAllMode = isFetchAllMode;
                const statusEl = document.getElementById('fetch-status');
                if (statusEl) statusEl.replaceChildren();
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
                    if (res.usedServerId) {
                        document.getElementById('tool-server').value = res.usedServerId;
                        if (!isLoadMore) {
                            currentFetchedServerId = res.usedServerId;
                        }
                    }
                    const content = res.data.content;

                    let list = content.messageList || content.message || [];

                    if (!isFetchAllMode) {
                        list = list.filter(m => {
                            let sid = m.senderUserId || m.senderId || m.uid;
                            if (!sid && m.extInfo) {
                                try {
                                    const ext = typeof m.extInfo === 'string' ? JSON.parse(m.extInfo) : m.extInfo;
                                    if (ext.user) sid = ext.user.userId || ext.user.id;
                                } catch (e) { window.YayaRendererUtils.reportIgnoredError(e, 'src/renderer/fetch-legacy.js'); }
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
                                    txt = '';
                                    extraHtml = renderPocketGiftCard(info);
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

        function getFetchExportMemberMeta(memberName, channelId) {
            const targetName = String(memberName || '').trim();
            const targetChannelId = String(channelId || '').trim();
            const members = (typeof memberData !== 'undefined' && Array.isArray(memberData))
                ? memberData
                : (Array.isArray(window.memberData) ? window.memberData : []);

            const member = members.find(m => {
                const names = [m.ownerName, m.name, m.nickname, m.nickName, m.memberName]
                    .map(value => String(value || '').trim());
                const channelIds = [
                    m.channelId,
                    m.roomId,
                    m.channel_id,
                    m.yklzId,
                    m.smallRoomId,
                    m.smallChannelId
                ].map(value => String(value || '').trim());

                return (targetChannelId && channelIds.includes(targetChannelId))
                    || (targetName && names.includes(targetName));
            });

            const resolvedMemberName = String(
                (member && (member.ownerName || member.name || member.nickname || member.nickName || member.memberName))
                || targetName
                || '未命名成员'
            ).trim();
            const groupName = String(
                (member && (member.groupName || member.teamName || member.group || member.team))
                || '未知分团'
            ).trim();
            const exportPrefix = `${groupName}-${resolvedMemberName}`;

            return {
                memberName: resolvedMemberName,
                groupName,
                exportPrefix,
                channelId: targetChannelId || 'unknown'
            };
        }

        function fixFetchExportUrl(path) {
            if (!path) return 'https://www.snh48.com/images/logo_snh48.jpg';
            if (/^https?:\/\//i.test(path)) return path;
            if (path.includes('48.cn')) return `https://${path.replace(/^\/+/, '')}`;
            const baseUrl = 'https://source3.48.cn';
            return path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
        }

        function buildFetchExportKey(message, exportUserId, rawBody) {
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
            for (let index = 0; index < seed.length; index += 1) {
                hash = ((hash << 5) - hash) + seed.charCodeAt(index);
                hash |= 0;
            }
            return `msg_${Math.abs(hash)}_${message.msgTime || 0}`;
        }

        function buildFetchExportEntries(messages) {
            const exportEntries = [];
            for (const m of (Array.isArray(messages) ? messages : [])) {
                const rawBody = m.bodys || m.msgContent || '';
                let structuredContent;

                if (typeof rawBody === 'string' && (rawBody.trim().startsWith('{') || rawBody.trim().startsWith('['))) {
                    try {
                        structuredContent = JSON.parse(rawBody);
                    } catch (error) {
                        structuredContent = { text: rawBody };
                    }
                } else if (rawBody && typeof rawBody === 'object') {
                    structuredContent = rawBody;
                } else {
                    structuredContent = { text: String(rawBody || '') };
                }

                let avatarUrl = 'https://www.snh48.com/images/logo_snh48.jpg';
                let nickName = m.senderName || '未知用户';
                let exportUserId = m.senderUserId || '';
                let exportRoleId = 0;

                if (m.extInfo) {
                    try {
                        const ext = typeof m.extInfo === 'string' ? JSON.parse(m.extInfo) : m.extInfo;
                        if (ext?.user) {
                            nickName = ext.user.nickName || nickName;
                            if (ext.user.avatar) avatarUrl = fixFetchExportUrl(ext.user.avatar);
                            if (!exportUserId) exportUserId = ext.user.userId || ext.user.id || '';
                            exportRoleId = Number(ext.user.roleId) || 0;
                        }
                    } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/fetch-legacy.js'); }
                }

                const sortTime = Number(m.msgTime) || Date.now();
                const messageDate = new Date(sortTime);
                const pad = (value) => String(value).padStart(2, '0');
                const timeStr = `${messageDate.getFullYear()}-${pad(messageDate.getMonth() + 1)}-${pad(messageDate.getDate())} ${pad(messageDate.getHours())}:${pad(messageDate.getMinutes())}:${pad(messageDate.getSeconds())}`;
                const exportKey = buildFetchExportKey(m, exportUserId, rawBody);

                exportEntries.push({
                    schemaVersion: 1,
                    key: exportKey,
                    sortTime,
                    timeStr,
                    messageType: String(structuredContent?.messageType || m.msgType || 'TEXT'),
                    sender: {
                        name: String(nickName || '未知用户'),
                        avatarUrl: String(avatarUrl || ''),
                        userId: String(exportUserId || ''),
                        roleId: exportRoleId
                    },
                    content: structuredContent
                });
            }
            return exportEntries;
        }

        async function exportMsgsToJsonl() {
            if (allFetchedMsgs.length === 0) return showToast('没有消息可导出');
            const exportEntries = buildFetchExportEntries(allFetchedMsgs);

            const selectedMemberName = currentSelectedMemberName || document.getElementById('member-search').value.trim() || '未命名成员';
            const selectedChannelId = currentFetchedChannelId || document.getElementById('tool-channel').value.trim();
            const exportMeta = getFetchExportMemberMeta(selectedMemberName, selectedChannelId);
            const exportFolderName = exportMeta.memberName;
            const exportFileName = `${exportMeta.exportPrefix}-${exportMeta.channelId}.jsonl`;
            const exportBtn = document.getElementById('btn-export-jsonl');
            const originalBtnText = exportBtn.innerText;
            const box = document.getElementById('msg-result');
            const tip = document.createElement('div');
            tip.style.cssText = "text-align:center; color:#28a745; margin-top:10px; font-weight:bold; padding:5px; border:1px solid #28a745; border-radius:4px; background:rgba(40,167,69,0.1);";

            try {
                exportBtn.innerText = "正在导出";
                exportBtn.disabled = true;

                const res = await window.ipcRenderer.invoke('save-export-jsonl', {
                    memberName: exportFolderName,
                    fileName: exportFileName,
                    entries: exportEntries
                });

                if (!res || !res.success) {
                    throw new Error((res && res.msg) || '导出失败');
                }

                if (allFetchedMsgs.length > 0) {
                    saveFetchBoundary(
                        currentFetchedServerId || document.getElementById('tool-server').value.trim(),
                        currentFetchedChannelId || document.getElementById('tool-channel').value.trim(),
                        currentFetchedFetchAllMode,
                        allFetchedMsgs[0]
                    );
                }

                const displayPath = res.path || `${window.desktop.storagePaths.htmlDir}\\${exportFolderName}\\${exportFileName}`;
                exportBtn.innerText = res.changed ? "导出成功" : "没有新增";
                exportBtn.style.backgroundColor = res.changed ? "#28a745" : "#6c757d";
                exportBtn.style.color = "white";
                tip.innerText = res.changed
                    ? `已新增 ${res.addedCount} 条，共 ${res.totalCount} 条: ${displayPath}`
                    : `没有新增消息，共 ${res.totalCount} 条: ${displayPath}`;
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
                            outputList.innerHTML = '<div class="placeholder-tip"><h3>正在读取新数据...</h3><p>由于导出内容已更新，分析可能需要一点时间。</p></div>';
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
            let div = document.querySelector('.toast-msg');
            if (!div) {
                div = document.createElement('div');
                div.className = 'toast-msg';
                document.body.appendChild(div);
            }
            div.innerText = msg;
            div.style.animation = 'none';
            void div.offsetWidth;
            div.style.animation = '';

            if (window.__yayaToastTimer) {
                clearTimeout(window.__yayaToastTimer);
            }
            window.__yayaToastTimer = setTimeout(() => {
                if (div.parentNode) div.parentNode.removeChild(div);
                window.__yayaToastTimer = null;
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

            async function fetchDownloadMedia(downloadUrl) {
                const response = await fetch(downloadUrl, { cache: 'no-store', credentials: 'omit' });
                if (!response.ok) throw new Error(`网络请求失败: ${response.status}`);
                return response;
            }

            function getWebMediaProxyUrl(downloadUrl) {
                if (!window.desktop || window.desktop.platform !== 'web') return '';
                try {
                    const parsed = new URL(downloadUrl);
                    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
                    return `/web-media-proxy?url=${encodeURIComponent(parsed.toString())}`;
                } catch (error) {
                    return '';
                }
            }

            try {
                let response;
                try {
                    response = await fetchDownloadMedia(url);
                } catch (directError) {
                    const proxyUrl = getWebMediaProxyUrl(url);
                    if (!proxyUrl) throw directError;
                    response = await fetchDownloadMedia(proxyUrl);
                }

                const customPath = readStoredSettingStringFallback(`yaya_path_${dlType}`, '');

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
                    const fileBytes = new Uint8Array(arrayBuffer);
                    const fullPath = path.join(finalDir, filename);

                    await new Promise((resolve, reject) => {
                        fs.writeFile(fullPath, fileBytes, (err) => err ? reject(err) : resolve());
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
                showToast(`下载失败: ${e.message}`);
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

            if (typeof window.applyMessageAnalysisDrilldown === 'function') {
                window.applyMessageAnalysisDrilldown('gift', { userId: uid, name });
                return;
            }

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

        function escapeMaskwordHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function getActiveMaskwordElements() {
            const pbcView = document.getElementById('view-pbc');
            const isPbcVisible = pbcView && window.getComputedStyle(pbcView).display !== 'none';
            const input = document.getElementById(isPbcVisible ? 'pbc-maskword-input' : 'maskword-input')
                || document.getElementById('maskword-input')
                || document.getElementById('pbc-maskword-input');
            const result = document.getElementById(isPbcVisible ? 'pbc-maskword-result' : 'maskword-result')
                || document.getElementById('maskword-result')
                || document.getElementById('pbc-maskword-result');
            return { input, result };
        }

        function hideMaskwordResult() {
            const resultEl = getActiveMaskwordElements().result;
            if (!resultEl) return;
            resultEl.hidden = true;
            resultEl.classList.remove('is-hit');
            resultEl.textContent = '';
        }

        function showMaskwordResult(content, isHit = false, useHtml = false) {
            const resultEl = getActiveMaskwordElements().result;
            if (!resultEl) return null;
            resultEl.hidden = false;
            resultEl.classList.toggle('is-hit', isHit);
            if (useHtml) {
                resultEl.innerHTML = content;
            } else {
                resultEl.textContent = content;
            }
            return resultEl;
        }

        function hideMaskwordResultIfEmpty() {
            const input = getActiveMaskwordElements().input;
            if (!String(input?.value || '').trim()) hideMaskwordResult();
        }

        async function updateMaskwordLibrary() {
            const token = readStoredToken();

            showMaskwordResult('正在读取词库');

            try {
                const res = await ipcRenderer.invoke('fetch-pocket-mask-words', {
                    token,
                    pa: window.getPA ? window.getPA() : null,
                    clientTime: 0
                });

                if (!res || !res.success || !res.content) {
                    throw new Error(res && res.msg ? res.msg : '获取失败');
                }

                const content = res.content || {};
                maskwordLibrary = Array.isArray(content.words)
                    ? content.words.map(word => String(word || '').trim()).filter(Boolean)
                    : [];
                if (!maskwordLibrary.length) showMaskwordResult('未读取到可用词库');
            } catch (error) {
                console.error('更新屏蔽词失败:', error);
                showMaskwordResult(`更新失败: ${error.message}`);
            }
        }

        async function checkMaskwordText() {
            const input = getActiveMaskwordElements().input;
            const text = String(input?.value || '');
            if (!text.trim()) {
                hideMaskwordResult();
                return;
            }

            if (!maskwordLibrary.length) {
                await updateMaskwordLibrary();
                if (!maskwordLibrary.length) return;
            }

            const lowerText = text.toLowerCase();
            const hits = [];
            const seen = new Set();
            for (const word of maskwordLibrary) {
                const normalized = String(word || '').trim();
                if (!normalized || seen.has(normalized)) continue;
                if (lowerText.includes(normalized.toLowerCase())) {
                    seen.add(normalized);
                    hits.push(normalized);
                    if (hits.length >= 100) break;
                }
            }

            if (!hits.length) {
                showMaskwordResult('未命中屏蔽词');
                return;
            }

            showMaskwordResult(`
                <div>命中 ${hits.length} 个屏蔽词${hits.length >= 100 ? '，仅显示前 100 个' : ''}</div>
                <div class="maskword-hit-list">
                    ${hits.map(word => `<span class="maskword-hit-chip">${escapeMaskwordHtml(word)}</span>`).join('')}
                </div>
            `, true, true);
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
                display.innerHTML = `<span style="color: #ff4d4f;">检测失败: ${e.message}</span>`;
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
                el.innerHTML = `<span class="status-fail">检测失败</span>`;
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
                el.innerHTML = `<span class="status-fail" title="${res.msg}">${res.msg.split('\n')[0]}</span>`;
            }
        }
