import { getAppSettingsApi, getStoredAppToken as readStoredToken } from './app-preferences.mjs';
import { showToast } from './renderer-dialogs.mjs';

export function createPocketAuthFeature({
    ipcRenderer, resetAccountScopedSessionState, startFollowedRoomNotificationPolling,
    stopFollowedRoomNotificationPolling, updateLocalGiftDatabase, onAccountReady
}) {
    let appToken = '';
    const AUTO_CHECKIN_ENABLED_KEY = 'yaya_auto_checkin_enabled';
    const AUTO_CHECKIN_LAST_DATE_KEY = 'yaya_auto_checkin_last_date';
    const AUTO_CHECKIN_LAST_USER_KEY = 'yaya_auto_checkin_last_user';
    let currentPocketUserId = '';
    let currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
    let accountValidationGeneration = 0;
    let smsLoginBusy = false;
    let accountSwitchGeneration = 0;
    let savedAccountSwitching = '';
    let selectedAccountAvatarFile = null;
    let selectedAccountAvatarDataUrl = '';
    let accountProfileStatusTimer = null;
    let accountProfileMetaContext = null;
    let accountRenameCountLoaded = false;
    let accountChickenBalanceLoaded = false;
    let accountRenameCountRequest = 0;
    let accountChickenBalanceRequest = 0;
    let autoCheckinInFlight = false;
    let autoCheckinGeneration = 0;
    let autoCheckinSettingsMigrated = false;
    let autoCheckinMidnightTimer = null;
    let autoCheckinObservedDate = '';
    const WEB_ACCOUNT_PROFILE_CACHE_KEY = 'yaya_web_account_profile_v1';

    function readPocketClientProfile() {
        const api = getAppSettingsApi();
        const value = api?.getSettingValueSync?.('p48ClientProfile', '')
            || localStorage.getItem('p48ClientProfile') || '';
        return value === 'pocket48' || value === 'seine48' ? value : '';
    }

    function selectedPocketClientProfile() {
        return document.getElementById('login-client-profile')?.value === 'seine48' ? 'seine48' : 'pocket48';
    }

    function savePocketClientProfile(value, persist = true) {
        const api = getAppSettingsApi();
        if (persist) {
            if (api?.setSettingValueSync) {
                api.setSettingValueSync('p48ClientProfile', value);
                localStorage.removeItem('p48ClientProfile');
            } else localStorage.setItem('p48ClientProfile', value);
        }
        const badge = document.getElementById('logged-in-client-profile');
        if (badge) {
            const profile = value === 'seine48' ? 'seine48' : 'pocket48';
            badge.dataset.clientProfile = profile;
            badge.textContent = window.YayaRendererUtils.t(profile === 'seine48' ? '塞纳河48' : '口袋48');
        }
    }

    function updateLoginClientProfile(value) {
        const profile = value === 'seine48' ? 'seine48' : 'pocket48';
        const field = document.getElementById('login-client-profile');
        const display = document.getElementById('login-client-profile-display');
        if (field) field.value = profile;
        if (display) display.textContent = window.YayaRendererUtils.t(profile === 'seine48' ? '塞纳河48' : '口袋48');
        document.querySelectorAll('#login-client-profile-dropdown [data-profile]').forEach(option => {
            option.setAttribute('aria-selected', String(option.dataset.profile === profile));
        });
    }

    function closeLoginClientProfileDropdown() {
        const dropdown = document.getElementById('login-client-profile-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        document.getElementById('login-client-profile-trigger')?.setAttribute('aria-expanded', 'false');
    }

    function toggleLoginClientProfileDropdown() {
        const dropdown = document.getElementById('login-client-profile-dropdown');
        if (!dropdown) return;
        const open = dropdown.style.display !== 'block';
        dropdown.style.display = open ? 'block' : 'none';
        document.getElementById('login-client-profile-trigger')?.setAttribute('aria-expanded', String(open));
    }

    function selectLoginClientProfile(value) {
        window.YayaPocketRegistrationUi?.close();
        window.YayaPocketSocialLoginUi?.cancel(false);
        updateLoginClientProfile(value);
        closeLoginClientProfileDropdown();
        document.getElementById('login-client-profile-trigger')?.focus();
    }

    function handleLoginClientProfileKey(event) {
        const dropdown = document.getElementById('login-client-profile-dropdown');
        if (!dropdown) return;
        if (event.key === 'Tab') { closeLoginClientProfileDropdown(); return; }
        if (event.key === 'Escape') {
            closeLoginClientProfileDropdown();
            document.getElementById('login-client-profile-trigger')?.focus();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            const options = Array.from(dropdown.querySelectorAll('[data-profile]'));
            const index = options.indexOf(document.activeElement);
            const selectedIndex = options.findIndex(option => option.dataset.profile === selectedPocketClientProfile());
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
                : index < 0 ? selectedIndex : (index + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
            dropdown.style.display = 'block';
            document.getElementById('login-client-profile-trigger')?.setAttribute('aria-expanded', 'true');
            options[next]?.focus();
        } else return;
        event.preventDefault();
        event.stopPropagation();
    }

    document.addEventListener('click', event => {
        if (!event.target?.closest?.('.login-client-profile-picker')) closeLoginClientProfileDropdown();
    });
    if (document.getElementById('login-client-profile')) updateLoginClientProfile(readPocketClientProfile() || 'pocket48');
    let lastSmsClientIdentity = '';
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
        lastSmsClientIdentity = '';
        savePocketClientProfile('');
        const settingsApi = getAppSettingsApi();
        if (settingsApi && typeof settingsApi.clearTokenSync === 'function') {
            settingsApi.clearTokenSync();
        }
        localStorage.removeItem('yaya_p48_token');
    }

    function setSavedPocketAccountStatus(message = '', isError = false) {
        const status = document.getElementById('saved-pocket-account-status');
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('is-error', isError);
        status.hidden = !message;
    }

    function renderSavedPocketAccounts() {
        const section = document.getElementById('saved-pocket-accounts');
        const list = document.getElementById('saved-pocket-account-list');
        const settings = getAppSettingsApi();
        if (!section || !list || isWebRuntimeForAccountUi() || !settings?.listPocketAccountsSync
            || window.desktop?.isRoomWindow || window.desktop?.isLiveWindow) return;
        section.hidden = false;
        let accounts;
        try {
            accounts = settings.listPocketAccountsSync().filter(account => account.userId !== currentPocketUserId);
        } catch (_) {
            list.replaceChildren();
            setSavedPocketAccountStatus('无法读取已保存的账号', true);
            return;
        }
        list.replaceChildren();
        if (!accounts.length) {
            const empty = document.createElement('div');
            empty.className = 'account-section-subtitle';
            empty.textContent = '暂无其它账号';
            list.append(empty);
            return;
        }
        for (const account of accounts) {
            const card = document.createElement('div');
            card.className = 'saved-pocket-account-card';
            const avatar = document.createElement('img');
            avatar.className = 'account-card-avatar';
            avatar.alt = '';
            avatar.src = /^https?:\/\//i.test(account.avatarUrl) ? account.avatarUrl : './icon.png';
            avatar.addEventListener('error', () => { avatar.src = './icon.png'; }, { once: true });
            const name = document.createElement('span');
            name.className = 'account-card-name';
            name.textContent = account.nickname;
            const id = document.createElement('span');
            id.className = 'saved-pocket-account-id';
            id.textContent = `ID ${account.userId}`;
            const accountDetails = document.createElement('span');
            accountDetails.className = 'saved-pocket-account-details';
            accountDetails.append(name, id);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'saved-pocket-account-switch';
            button.disabled = Boolean(savedAccountSwitching);
            button.setAttribute('aria-label', `切换到 ${account.nickname}`);
            button.append(avatar, accountDetails);
            button.addEventListener('click', () => switchSavedPocketAccount(account));
            const forget = document.createElement('button');
            forget.type = 'button';
            forget.className = 'btn btn-secondary saved-pocket-account-remove';
            forget.textContent = '移除';
            forget.disabled = Boolean(savedAccountSwitching);
            forget.setAttribute('aria-label', `移除 ${account.nickname} 的登录记录`);
            forget.addEventListener('click', () => {
                try {
                    settings.forgetPocketAccountSync(account.userId);
                    setSavedPocketAccountStatus();
                    renderSavedPocketAccounts();
                } catch (_) {
                    setSavedPocketAccountStatus('移除账号失败，请重试', true);
                }
            });
            card.append(button, forget);
            list.append(card);
        }
    }

    function rememberCurrentPocketAccount() {
        const settings = getAppSettingsApi();
        if (isWebRuntimeForAccountUi() || !settings?.rememberPocketAccountSync
            || window.desktop?.isRoomWindow || window.desktop?.isLiveWindow) return;
        try {
            settings.rememberPocketAccountSync({ userId: currentPocketUserId, token: appToken,
                nickname: currentPocketProfile.nickname, avatarUrl: currentPocketProfile.avatarUrl });
        } catch (_) {
            setSavedPocketAccountStatus('无法保存账号，请检查系统凭据存储', true);
        }
    }

    async function switchSavedPocketAccount(account) {
        if (savedAccountSwitching || account.userId === currentPocketUserId) return;
        const settings = getAppSettingsApi();
        const switchGeneration = ++accountSwitchGeneration;
        window.YayaPocketSocialLoginUi?.cancel(false);
        window.YayaPocketRegistrationUi?.close();
        savedAccountSwitching = account.userId;
        setSavedPocketAccountStatus('验证中');
        renderSavedPocketAccounts();
        try {
            const saved = settings.getPocketAccountSync(account.userId);
            await checkToken(false, { ...saved, userId: account.userId });
        } catch (error) {
            if (switchGeneration === accountSwitchGeneration) {
                setSavedPocketAccountStatus(error.message || '切换账号失败，请重试', true);
            }
        } finally {
            savedAccountSwitching = '';
            const status = document.getElementById('saved-pocket-account-status');
            if (status?.textContent === '验证中') setSavedPocketAccountStatus();
            renderSavedPocketAccounts();
        }
    }

    document.addEventListener('DOMContentLoaded', renderSavedPocketAccounts, { once: true });

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
        resetAccountProfileMeta();
        window.YayaPocketRegistrationUi?.close();
        stopAutoCheckinMidnightTimer();
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
    }


    function syncWebAccountButton(profile = currentPocketProfile, loggedIn = !!currentPocketUserId) {
        window.dispatchEvent(new CustomEvent('yaya:account-state-changed', {
            detail: {
                loggedIn: !!loggedIn,
                nickname: loggedIn ? String(profile?.nickname || '') : '',
                avatarUrl: loggedIn ? String(profile?.avatarUrl || '') : ''
            }
        }));
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
        button.title = window.YayaRendererUtils.t(loggedIn ? `${nickname || '口袋用户'} · 账号设置` : '登录账号');
        label.textContent = window.YayaRendererUtils.t('登录');
        avatar.src = loggedIn ? (avatarUrl || './web-icon.png') : './web-icon.png';
        if (loggedIn) writeWebAccountProfileCache(profile);
        if (typeof window.syncWebAccountRoute === 'function') {
            window.syncWebAccountRoute(!!loggedIn);
        }
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

    function resetAccountProfileMeta() {
        accountProfileMetaContext = null;
        accountRenameCountLoaded = false;
        accountChickenBalanceLoaded = false;
        accountRenameCountRequest += 1;
        accountChickenBalanceRequest += 1;
        renderAccountRenameCount(null);
        renderAccountChickenBalance(null);
        setAccountProfileMetaVisible(false);
    }

    function prepareAccountProfileMeta(context) {
        if (accountProfileMetaContext && isPocketAccountContextCurrent(accountProfileMetaContext)) return;
        resetAccountProfileMeta();
        accountProfileMetaContext = context;
    }

    function setRenameCountDisplay(freeText, chickenText) {
        const countEl = document.getElementById('account-rename-count');
        if (!countEl) return;
        let [freeEl, chickenEl] = countEl.children;
        if (countEl.children.length !== 2) {
            freeEl = document.createElement('span');
            chickenEl = document.createElement('span');
            countEl.replaceChildren(freeEl, chickenEl);
        }
        const freeLabel = window.YayaRendererUtils.t(`免费修改：${freeText}`);
        const chickenLabel = window.YayaRendererUtils.t(`鸡腿修改：${chickenText}`);
        if (freeEl.textContent !== freeLabel) freeEl.textContent = freeLabel;
        if (chickenEl.textContent !== chickenLabel) chickenEl.textContent = chickenLabel;
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
            resetAccountProfileMeta();
            return;
        }
        const accountContext = capturePocketAccountContext(token);
        prepareAccountProfileMeta(accountContext);
        const request = ++accountRenameCountRequest;
        if (!accountRenameCountLoaded) setRenameCountDisplay('读取中...', '读取中...');
        try {
            const pa = window.getPA ? window.getPA() : null;
            const res = await ipcRenderer.invoke('fetch-user-rename-count', { token, pa });
            if (request !== accountRenameCountRequest || !isPocketAccountContextCurrent(accountContext)) return;
            if (!res?.success) {
                throw new Error(res?.msg || '读取失败');
            }
            renderAccountRenameCount(res.content);
            accountRenameCountLoaded = true;
        } catch (error) {
            if (request !== accountRenameCountRequest || !isPocketAccountContextCurrent(accountContext)) return;
            if (!accountRenameCountLoaded) setRenameCountDisplay('读取失败', '读取失败');
        }
    }

    function renderAccountChickenBalance(content) {
        const balanceEl = document.getElementById('account-chicken-balance');
        if (!balanceEl) return;
        const total = content && typeof content === 'object'
            ? (content.moneyTotal ?? content.total ?? content.balance ?? content.money)
            : content;
        const text = total === undefined || total === null || total === '' ? '--' : String(total);
        if (balanceEl.textContent !== text) balanceEl.textContent = text;
    }

    async function refreshAccountChickenBalance() {
        const balanceEl = document.getElementById('account-chicken-balance');
        const token = appToken || readStoredToken();
        if (!balanceEl) return;
        if (!token) {
            resetAccountProfileMeta();
            return;
        }
        const accountContext = capturePocketAccountContext(token);
        prepareAccountProfileMeta(accountContext);
        const request = ++accountChickenBalanceRequest;
        if (!accountChickenBalanceLoaded) balanceEl.innerText = window.YayaRendererUtils.t('读取中...');
        try {
            const pa = window.getPA ? window.getPA() : null;
            const res = await ipcRenderer.invoke('fetch-user-money', { token, pa });
            if (request !== accountChickenBalanceRequest || !isPocketAccountContextCurrent(accountContext)) return;
            if (!res?.success) {
                throw new Error(res?.msg || '读取失败');
            }
            renderAccountChickenBalance(res.content);
            accountChickenBalanceLoaded = true;
        } catch (error) {
            if (request !== accountChickenBalanceRequest || !isPocketAccountContextCurrent(accountContext)) return;
            if (!accountChickenBalanceLoaded) balanceEl.innerText = window.YayaRendererUtils.t('读取失败');
        }
    }

    async function refreshAccountProfileMeta() {
        const accountContext = capturePocketAccountContext();
        prepareAccountProfileMeta(accountContext);
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
            rememberCurrentPocketAccount();
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
            rememberCurrentPocketAccount();
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
    function getTodayCheckinKey() {
        const now = new Date();
        const pad = (value) => String(value).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    function getAutoCheckinEnabled() {
        return String(readAutoCheckinSetting(AUTO_CHECKIN_ENABLED_KEY, '1')) !== '0';
    }

    function stopAutoCheckinMidnightTimer() {
        clearTimeout(autoCheckinMidnightTimer);
        autoCheckinMidnightTimer = null;
        autoCheckinObservedDate = '';
    }

    function scheduleAutoCheckinMidnight() {
        clearTimeout(autoCheckinMidnightTimer);
        autoCheckinMidnightTimer = null;
        if (!window.desktop?.platform || window.desktop.platform === 'web'
            || !appToken || !currentPocketUserId || !getAutoCheckinEnabled()) {
            stopAutoCheckinMidnightTimer();
            return;
        }
        if (!autoCheckinObservedDate) autoCheckinObservedDate = getTodayCheckinKey();
        const midnight = new Date();
        midnight.setHours(24, 0, 1, 0);
        autoCheckinMidnightTimer = setTimeout(checkAutoCheckinDayChange,
            Math.max(1000, Math.min(60000, midnight.getTime() - Date.now())));
    }

    function checkAutoCheckinDayChange() {
        if (autoCheckinObservedDate && autoCheckinObservedDate !== getTodayCheckinKey()
            && !autoCheckinInFlight && appToken && currentPocketUserId && getAutoCheckinEnabled()) {
            autoCheckinObservedDate = getTodayCheckinKey();
            void performPocketCheckin({ force: false, silentWhenSkipped: true }).catch(error => {
                console.warn('跨零点自动签到失败:', error);
            });
        }
        scheduleAutoCheckinMidnight();
    }

    window.addEventListener('focus', checkAutoCheckinDayChange);
    window.addEventListener('online', checkAutoCheckinDayChange);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkAutoCheckinDayChange();
    });

    function setAutoCheckinEnabled(enabled) {
        writeAutoCheckinSetting(AUTO_CHECKIN_ENABLED_KEY, enabled ? '1' : '0');
        syncAutoCheckinUi();
    }

    function markCheckinComplete(userId, date = getTodayCheckinKey()) {
        writeAutoCheckinSetting(AUTO_CHECKIN_LAST_DATE_KEY, date);
        writeAutoCheckinSetting(AUTO_CHECKIN_LAST_USER_KEY, String(userId || currentPocketUserId || ''));
    }

    function isCheckinRecordedToday(userId) {
        const targetUserId = String(userId || currentPocketUserId || '');
        return String(readAutoCheckinSetting(AUTO_CHECKIN_LAST_DATE_KEY, '')) === getTodayCheckinKey()
            && String(readAutoCheckinSetting(AUTO_CHECKIN_LAST_USER_KEY, '')) === targetUserId;
    }

    function updateAutoCheckinStatus(message) {
        const statusEl = document.getElementById('auto-checkin-status');
        if (!statusEl) return;
        statusEl.innerText = message;
        statusEl.style.color = '';
    }

    function syncAutoCheckinUi() {
        scheduleAutoCheckinMidnight();
        const toggle = document.getElementById('auto-checkin-toggle');
        if (toggle) {
            toggle.checked = getAutoCheckinEnabled();
        }

        if (currentPocketUserId && isCheckinRecordedToday(currentPocketUserId)) {
            updateAutoCheckinStatus('今日签到已完成，重复打开软件不会再次提交');
            return;
        }

        if (getAutoCheckinEnabled()) {
            updateAutoCheckinStatus(window.desktop?.platform === 'web'
                ? '已开启自动签到，登录成功后会在打开软件时自动尝试签到'
                : '已开启自动签到，启动并登录后及跨零点时会自动尝试签到');
        } else {
            updateAutoCheckinStatus('已关闭自动签到');
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

    async function performPocketCheckin(options = {}) {
        const { force = false, silentWhenSkipped = true } = options;
        const shouldShowCheckinToast = force || !silentWhenSkipped;

        if (!appToken) {
            updateAutoCheckinStatus('请先登录账号后再签到');
            if (!silentWhenSkipped) showToast('请先登录账号');
            return { success: false, skipped: true, reason: 'missing-token' };
        }

        if (!currentPocketUserId) {
            updateAutoCheckinStatus('当前账号信息未就绪，请稍后重试');
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
        const checkinDate = getTodayCheckinKey();
        const checkinGeneration = autoCheckinGeneration;
        const isCurrentCheckin = () => (
            checkinGeneration === autoCheckinGeneration
            && isPocketAccountContextCurrent(accountContext)
        );

        autoCheckinInFlight = true;
        updateAutoCheckinStatus('正在签到，请稍候...');

        try {
            const pa = window.getPA ? window.getPA() : null;
            const res = await ipcRenderer.invoke('pocket-checkin', {
                token: accountContext.token,
                pa
            });
            if (!isCurrentCheckin()) return { success: false, skipped: true, reason: 'account-changed' };

            if (res && res.success) {
                markCheckinComplete(accountContext.userId, checkinDate);
                const successMsg = formatCheckinSuccessMessage(res.content);
                updateAutoCheckinStatus(`${successMsg}，今日无需重复签到`);
                if (shouldShowCheckinToast) {
                    showToast(successMsg);
                }
                return { success: true, content: res.content };
            }

            const errorMessage = res?.msg || '签到失败';
            if (/已签到|重复签到|已经签到|已领取|明天再来/.test(errorMessage)) {
                markCheckinComplete(accountContext.userId, checkinDate);
                updateAutoCheckinStatus('今日签到已完成，重复打开软件不会再次提交');
                if (shouldShowCheckinToast) {
                    showToast('今天已经签到过了');
                }
                return { success: true, skipped: true, reason: 'already-signed' };
            }

            updateAutoCheckinStatus(`签到失败：${errorMessage}`);
            if (shouldShowCheckinToast) {
                showToast(`签到失败：${errorMessage}`);
            }
            return { success: false, msg: errorMessage };
        } catch (error) {
            if (!isCurrentCheckin()) return { success: false, skipped: true, reason: 'account-changed' };
            const errorMessage = error?.message || '签到请求异常';
            updateAutoCheckinStatus(`签到失败：${errorMessage}`);
            if (shouldShowCheckinToast) {
                showToast(`签到失败：${errorMessage}`);
            }
            return { success: false, msg: errorMessage };
        } finally {
            if (isCurrentCheckin()) {
                autoCheckinInFlight = false;
                checkAutoCheckinDayChange();
            }
        }
    }

    function toggleAutoCheckin(enabled) {
        setAutoCheckinEnabled(enabled);
        if (enabled) {
            updateAutoCheckinStatus(window.desktop?.platform === 'web'
                ? '已开启自动签到，软件启动并验证登录后会自动尝试签到'
                : '已开启自动签到，软件启动并验证登录后及跨零点时会自动尝试签到');
        } else {
            updateAutoCheckinStatus('已关闭自动签到');
        }
    }
    let smsTimer = null;
    let live48QrTimer = null;
    let live48QrCode = '';
    let live48QrPollCount = 0;

    function switchLoginTab(type) {
        if (type === 'social' && !window.YayaPocketSocialLoginUi?.enabled) type = 'sms';
        window.YayaPocketRegistrationUi?.close();
        window.YayaPocketSocialLoginUi?.cancel(false);
        closeLoginClientProfileDropdown();
        const identityField = document.getElementById('login-client-profile-field');
        const identitySlot = document.getElementById(type === 'social' ? 'social-login-client-profile-slot' : type === 'token' ? 'token-login-client-profile-slot' : 'sms-login-client-profile-slot');
        if (identityField && identitySlot) identitySlot.appendChild(identityField);
        const tabSms = document.getElementById('tab-sms');
        const tabQr = document.getElementById('tab-qr');
        const tabToken = document.getElementById('tab-token');
        const tabSocial = document.getElementById('tab-social');
        const formSms = document.getElementById('form-sms');
        const formQr = document.getElementById('form-qr');
        const formToken = document.getElementById('form-token');
        const formSocial = document.getElementById('form-social');
        const msgDiv = document.getElementById('login-msg');

        msgDiv.innerText = '';

        if (type !== 'qr') stopLive48QrLogin(false);

        [
            { tab: tabSms, form: formSms, key: 'sms' },
            { tab: tabQr, form: formQr, key: 'qr' },
            { tab: tabToken, form: formToken, key: 'token' },
            { tab: tabSocial, form: formSocial, key: 'social' }
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
            nameEl.innerText = window.YayaRendererUtils.t('live.48.cn 用户');
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
        } catch (error) { window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/pocket-auth-feature.mjs'); }
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
            placeholder.innerText = window.YayaRendererUtils.t('点击下方按钮生成二维码');
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
            btn.innerText = window.YayaRendererUtils.t('生成二维码');
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
            btn.innerText = window.YayaRendererUtils.t('生成中...');
        }
        if (msgBox) msgBox.innerText = '';
        renderLive48QrAccountInfo(null);
        if (placeholder) {
            placeholder.style.display = 'flex';
            placeholder.innerText = window.YayaRendererUtils.t('正在生成二维码...');
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
                btn.innerText = window.YayaRendererUtils.t('刷新二维码');
            }
            if (stopBtn) stopBtn.style.display = 'block';
            setLive48QrMessage('请用口袋48 App 扫码，并在手机上确认登录');

            live48QrTimer = setInterval(pollLive48QrLogin, 3000);
        } catch (error) {
            resetLive48QrDisplay();
            setLive48QrMessage(error.message || '创建二维码失败', '#ff4d4f');
            if (btn) {
                btn.disabled = false;
                btn.innerText = window.YayaRendererUtils.t('重新生成');
            }
        }
    }

    let currentVerifyAnswer = null;

    function getLoginPa() {
        return typeof window.getPA === 'function' ? window.getPA() : null;
    }

    async function handleSendSms(answer = null) {
        const mobile = document.getElementById('login-mobile').value.trim();
        const area = document.getElementById('login-area').value.trim() || '86';
        const clientProfile = selectedPocketClientProfile();
        const btn = document.getElementById('btn-send-sms');
        const msgBox = document.getElementById('login-msg');

        const verifyArea = document.getElementById('sms-verification-area');
        const verifyQuestion = document.getElementById('verify-question-text');
        const verifyOptions = document.getElementById('verify-options-container');

        if (!mobile) {
            msgBox.innerText = window.YayaRendererUtils.t('请输入手机号');
            return;
        }

        if (!answer) {
            btn.disabled = true;
            btn.innerText = window.YayaRendererUtils.t('发送中...');
        }

        msgBox.innerText = '';

        try {
            const pa = getLoginPa();
            const res = await ipcRenderer.invoke('login-send-sms', { mobile, area, answer, pa, clientProfile });

            if (res.success) {
                lastSmsClientIdentity = JSON.stringify([mobile, area, clientProfile]);
                if (verifyArea) verifyArea.style.display = 'none';

                let count = 60;
                btn.innerText = `${count}s`;
                const timer = setInterval(() => {
                    count--;
                    btn.innerText = `${count}s`;
                    if (count <= 0) {
                        clearInterval(timer);
                        btn.disabled = false;
                        btn.innerText = window.YayaRendererUtils.t('获取验证码');
                    }
                }, 1000);

                msgBox.style.color = '#28a745';
                msgBox.innerText = window.YayaRendererUtils.t('验证码已发送，请查收');

            } else if (res.needVerification) {
                btn.disabled = false;
                btn.innerText = window.YayaRendererUtils.t('获取验证码');

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
                            verifyQuestion.innerText = window.YayaRendererUtils.t(`正在验证: ${opt.value}...`);
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
            btn.innerText = window.YayaRendererUtils.t('获取验证码');
            msgBox.style.color = '#ff4d4f';
            msgBox.innerText = e.message;

        }
    }

    function startCountdown(seconds) {
        const btn = document.getElementById('btn-send-sms');
        let left = seconds;

        btn.disabled = true;
        btn.innerText = window.YayaRendererUtils.t(`${left}s 后重试`);

        if (smsTimer) clearInterval(smsTimer);

        smsTimer = setInterval(() => {
            left--;
            if (left <= 0) {
                clearInterval(smsTimer);
                btn.disabled = false;
                btn.innerText = window.YayaRendererUtils.t('获取验证码');
            } else {
                btn.innerText = window.YayaRendererUtils.t(`${left}s 后重试`);
            }
        }, 1000);
    }

    function completeSmsLogin(res, clientProfile, loginGeneration) {
        if (loginGeneration !== accountValidationGeneration) return;
        savePocketClientProfile(clientProfile);
        writeStoredToken(res.content.token);
        const tokenInput = document.getElementById('login-token');
        if (tokenInput) tokenInput.value = res.content.token;
        const msgDiv = document.getElementById('login-msg');
        msgDiv.style.color = '#28a745';
        msgDiv.innerText = window.YayaRendererUtils.t('登录成功！正在跳转...');
        setTimeout(() => { if (loginGeneration === accountValidationGeneration) checkToken(); }, 500);
    }

    function handleThirdPartyLogin(provider) {
        window.YayaPocketRegistrationUi?.close();
        const clientProfile = selectedPocketClientProfile();
        const generation = ++accountValidationGeneration;
        window.YayaPocketSocialLoginUi?.start(provider, {
            clientProfile,
            isCurrent: () => generation === accountValidationGeneration && selectedPocketClientProfile() === clientProfile,
            complete: result => completeSmsLogin(result, clientProfile, generation)
        });
    }

    async function handleLoginByCode() {
        if (smsLoginBusy) return;
        window.YayaPocketRegistrationUi?.close();
        window.YayaPocketSocialLoginUi?.cancel(false);
        const mobile = document.getElementById('login-mobile').value.trim();
        const area = document.getElementById('login-area').value.trim() || '86';
        const clientProfile = selectedPocketClientProfile();
        const code = document.getElementById('login-code').value.trim();
        const msgDiv = document.getElementById('login-msg');

        if (!mobile || !code) {
            msgDiv.innerText = window.YayaRendererUtils.t('请填写手机号和验证码');
            return;
        }
        if (lastSmsClientIdentity && lastSmsClientIdentity !== JSON.stringify([mobile, area, clientProfile])) {
            msgDiv.innerText = window.YayaRendererUtils.t('手机号、区号或登录身份已变化，请重新获取验证码');
            return;
        }
        const loginGeneration = ++accountValidationGeneration;
        smsLoginBusy = true;
        const loginButton = document.getElementById('btn-login-by-code');
        if (loginButton) loginButton.disabled = true;

        msgDiv.innerText = window.YayaRendererUtils.t('登录中...');
        msgDiv.style.color = 'var(--primary)';

        try {
            const pa = getLoginPa();
            if (loginGeneration !== accountValidationGeneration) return;
            const res = await ipcRenderer.invoke('login-by-code', { mobile, code, area, pa, clientProfile });
            if (loginGeneration !== accountValidationGeneration) return;

            const kind = window.YayaPocketRegistration.loginResultKind(res, clientProfile);
            if (kind === 'success') {
                completeSmsLogin(res, clientProfile, loginGeneration);
            } else if (kind === 'register') {
                msgDiv.innerText = '';
                window.YayaPocketRegistrationUi.open({ mobile, code, area, clientProfile }, {
                    isCurrent: () => loginGeneration === accountValidationGeneration
                        && selectedPocketClientProfile() === clientProfile
                        && document.getElementById('login-mobile').value.trim() === mobile
                        && document.getElementById('login-code').value.trim() === code
                        && (document.getElementById('login-area').value.trim() || '86') === area,
                    getPa: getLoginPa,
                    invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
                    complete: result => completeSmsLogin(result, clientProfile, loginGeneration)
                });
            } else {
                throw new Error(res.message || '登录失败');
            }
        } catch (err) {
            if (loginGeneration !== accountValidationGeneration) return;
            msgDiv.style.color = '#ff4d4f';
            msgDiv.innerText = window.YayaRendererUtils.t('登录失败: ' + err.message);
        } finally {
            smsLoginBusy = false;
            if (loginButton) loginButton.disabled = false;
        }
    }
    async function checkToken(manualLogin = false, savedAccount = null) {
        if (manualLogin === true) window.YayaPocketSocialLoginUi?.cancel(false);
        const clientProfile = savedAccount ? savedAccount.clientProfile
            : manualLogin === true ? selectedPocketClientProfile() : readPocketClientProfile();
        const tokenField = document.getElementById('login-token');
        const tokenInput = savedAccount ? savedAccount.token : (tokenField && tokenField.value ? tokenField.value.trim() : '')
            || String(appToken || '').trim()
            || readStoredToken();
        const msgBox = document.getElementById('login-msg');
        const panelInput = document.getElementById('panel-login');
        const panelSuccess = document.getElementById('panel-logged-in');

        const accountArea = document.getElementById('account-switcher-area');
        const accountList = document.getElementById('account-list');

        if (!tokenInput) {
            if (typeof window.setWebAccountAuthPending === 'function') {
                window.setWebAccountAuthPending(false);
            }
            if (msgBox) msgBox.innerText = window.YayaRendererUtils.t('请输入 Token');
            return;
        }
        const previousToken = String(appToken || readStoredToken() || '').trim();
        const validationGeneration = ++accountValidationGeneration;
        const settings = getAppSettingsApi();
        const previousStoredToken = savedAccount ? settings.getTokenSync() : '';
        let savedAccountActivated = false;
        const isCurrentValidation = () => (
            validationGeneration === accountValidationGeneration
            && (savedAccount && !savedAccountActivated
                ? settings.getTokenSync() === previousStoredToken
                : appToken === tokenInput && readStoredToken() === tokenInput)
        );

        if (!savedAccount) {
            if (previousToken && previousToken !== tokenInput) {
                resetAccountScopedSessionState();
                currentPocketUserId = '';
                currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
            }
            appToken = tokenInput;
            writeStoredToken(tokenInput);
            if (previousToken && previousToken !== tokenInput) {
                syncWebAccountButton(currentPocketProfile, false);
                syncAccountProfileEditUi(currentPocketProfile);
            }
            if (tokenField && tokenField.value !== tokenInput) tokenField.value = tokenInput;
            if (msgBox) {
                msgBox.innerText = window.YayaRendererUtils.t('正在验证身份...');
                msgBox.style.color = '#666';
            }
            window.setWebAccountAuthPending?.(true);
        }

        try {
            const pa = window.getPA ? window.getPA() : null;
            const res = await ipcRenderer.invoke('login-check-token', {
                token: tokenInput,
                pa,
                clientProfile
            });
            if (!isCurrentValidation()) return;
            if (savedAccount) {
                const user = res.userInfo;
                const id = user?.baseUserInfo?.userId || user?.userId || user?.id;
                if (!res.success) throw new Error(res.msg === 'Token 无效' || !res.msg
                    ? '此账号登录已失效，请重新登录' : res.msg);
                if (String(id) !== savedAccount.userId) throw new Error('登录记录与账号不符，请重新登录此账号');
                settings.activatePocketAccountSync({ previousToken: previousStoredToken, token: tokenInput, clientProfile });
                savedAccountActivated = true;
                resetAccountScopedSessionState();
                currentPocketUserId = '';
                currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
                appToken = tokenInput;
                localStorage.removeItem('yaya_p48_token');
                localStorage.removeItem('p48ClientProfile');
                if (tokenField) tokenField.value = tokenInput;
            }
            if (typeof window.setWebAccountAuthPending === 'function') {
                window.setWebAccountAuthPending(false);
            }

            if (res.success) {
                savePocketClientProfile(clientProfile, !savedAccount);
                if (clientProfile) updateLoginClientProfile(clientProfile);
                if (!isWebRuntimeForAccountUi()) {
                    void ipcRenderer.invoke('connect-account-im').catch(error => {
                        window.YayaRendererUtils.reportIgnoredError(error, 'src/renderer/pocket-auth-feature.mjs:connect-account-im');
                    });
                }
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
                if (currentPocketUserId && String(currentPocketUserId) !== String(userId)) {
                    resetAccountScopedSessionState();
                }
                currentPocketUserId = String(userId);
                currentPocketProfile = {
                    nickname: safeName,
                    avatar: currentAvatarRaw,
                    avatarUrl: currentAvatarUrl
                };
                setSavedPocketAccountStatus();
                rememberCurrentPocketAccount();
                renderSavedPocketAccounts();
                syncWebAccountButton(currentPocketProfile, true);
                document.getElementById('user-nickname').innerText = safeName;
                const idDisplay = document.getElementById('user-id-display');
                if (idDisplay) idDisplay.innerText = `ID ${userId}`;
                const currentAvatarEl = document.getElementById('current-user-avatar');
                if (currentAvatarEl) currentAvatarEl.src = currentAvatarUrl;
                syncAccountProfileEditUi(currentPocketProfile);
                refreshAccountProfileMeta();
                if (msgBox) msgBox.innerText = '';
                syncAutoCheckinUi();
                onAccountReady();
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
                        card.title = window.YayaRendererUtils.t(`点击切换到: ${user.nickname}`);

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

                if (typeof window.restoreWebProtectedRouteAfterLogin === 'function') {
                    window.restoreWebProtectedRouteAfterLogin();
                }

                await performPocketCheckin({
                    force: false,
                    silentWhenSkipped: true
                });

            } else {
                resetAccountScopedSessionState();
                clearStoredToken();
                appToken = '';
                if (typeof stopFollowedRoomNotificationPolling === 'function') {
                    stopFollowedRoomNotificationPolling();
                }
                currentPocketUserId = '';
                currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
                clearWebAccountProfileCache();
                renderSavedPocketAccounts();
                syncWebAccountButton(currentPocketProfile, false);
                if (panelInput) panelInput.style.display = 'block';
                if (panelSuccess) panelSuccess.style.display = 'none';
                syncAutoCheckinUi();
                if (msgBox) {
                    msgBox.style.color = '#ff4d4f';
                    msgBox.innerText = window.YayaRendererUtils.t(res.msg || 'Token 无效');
                }
                if (typeof window.redirectWebProtectedRouteToLogin === 'function') {
                    window.redirectWebProtectedRouteToLogin();
                }
            }
        } catch (e) {
            if (!isCurrentValidation()) return;
            if (savedAccount && !savedAccountActivated) throw e;
            if (typeof window.setWebAccountAuthPending === 'function') {
                window.setWebAccountAuthPending(false);
            }
            console.error(e);
            resetAccountScopedSessionState();
            if (typeof stopFollowedRoomNotificationPolling === 'function') {
                stopFollowedRoomNotificationPolling();
            }
            currentPocketUserId = '';
            currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
            renderSavedPocketAccounts();
            syncWebAccountButton(currentPocketProfile, false);
            if (panelInput) panelInput.style.display = 'block';
            if (panelSuccess) panelSuccess.style.display = 'none';
            syncAutoCheckinUi();
            if (msgBox) {
                msgBox.style.color = '#ff4d4f';
                msgBox.innerText = window.YayaRendererUtils.t('验证出错: ' + e.message);
            }
        }
    }

    async function handleSwitchAccount(targetUserId, targetName) {
        window.YayaPocketSocialLoginUi?.cancel(false);

        const switchGeneration = ++accountSwitchGeneration;
        accountValidationGeneration += 1;

        const nickNameEl = document.getElementById('user-nickname');
        const originalName = nickNameEl.innerText;

        nickNameEl.innerText = window.YayaRendererUtils.t(`正在切换...`);

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
                    resetAccountScopedSessionState();
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
                btn.innerText = window.YayaRendererUtils.t("已复制");
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
        window.YayaPocketSocialLoginUi?.cancel(false);
        accountValidationGeneration += 1;
        accountSwitchGeneration += 1;
        clearStoredToken();
        appToken = '';
        if (typeof stopFollowedRoomNotificationPolling === 'function') {
            stopFollowedRoomNotificationPolling();
        }
        currentPocketUserId = '';
        currentPocketProfile = { nickname: '', avatar: '', avatarUrl: '' };
        setSavedPocketAccountStatus();
        renderSavedPocketAccounts();
        clearWebAccountProfileCache();
        syncWebAccountButton(currentPocketProfile, false);
        selectedAccountAvatarFile = null;
        selectedAccountAvatarDataUrl = '';
        resetAccountScopedSessionState();

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
            msgBox.innerText = window.YayaRendererUtils.t(isWebRuntimeForAccountUi() ? '记录已清除' : '已退出当前账号');
            msgBox.style.color = '#28a745';
        }
        syncAutoCheckinUi();

        const memberSearch = document.getElementById('member-search');
        if (memberSearch) {
            memberSearch.value = '';
        }
    }

    return {
        getToken: () => appToken,
        setToken: value => { appToken = value; },
        getUserId: () => currentPocketUserId,
        checkToken, syncAutoCheckinUi, refreshMeet48AuthPanel, invalidatePocketAccountRequestState,
        actions: {
            toggleLoginClientProfileDropdown, selectLoginClientProfile, handleLoginClientProfileKey,
            saveMeet48AuthFromFields, importMeet48HarFile, clearMeet48Auth,
            handleAccountAvatarSelected, saveAccountNickname, toggleAutoCheckin,
            switchLoginTab, stopLive48QrLogin, startLive48QrLogin, handleSendSms, handleThirdPartyLogin,
            handleLoginByCode, checkToken, copyToken, logout
        }
    };
}
