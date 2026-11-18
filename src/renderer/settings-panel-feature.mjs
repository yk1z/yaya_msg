import senderProfile from '../common/sender-profile.js';

export function createSettingsPanelFeature({
    invoke,
    getAppSettingsApi,
    readStoredStringSetting,
    writeStoredStringSetting,
    readStoredJsonSetting,
    writeStoredJsonSetting,
    removeStoredSetting,
    applyCustomBackground,
    showToast,
    translate
}) {
    const downloadPathFields = {
        'path-danmu': 'yaya_path_danmu',
        'path-video': 'yaya_path_video',
        'path-live': 'yaya_path_live',
        'path-clip': 'yaya_path_clip',
        'path-media': 'yaya_path_media',
        'path-flip': 'yaya_path_flip',
        'path-room-radio': 'yaya_path_room_radio'
    };

    const bgInput = document.getElementById('bgInput');
    bgInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const settingsApi = getAppSettingsApi();
            const reader = new FileReader();
            reader.onload = (ev) => {
                let nextBackground = ev.target.result;
                if (settingsApi && typeof settingsApi.saveBackgroundFromDataUrlSync === 'function') {
                    try {
                        nextBackground = settingsApi.saveBackgroundFromDataUrlSync(ev.target.result) || ev.target.result;
                        localStorage.removeItem('custom_bg_data');
                    } catch (error) {
                        console.warn('保存背景图片数据失败，回退到旧存储:', error);
                    }
                }

                if (typeof applyCustomBackground === 'function') {
                    applyCustomBackground(nextBackground);
                } else {
                    document.body.style.backgroundImage = `url('${nextBackground}')`;
                }
                if (!(settingsApi && typeof settingsApi.saveBackgroundFromDataUrlSync === 'function')) {
                    try {
                        localStorage.setItem('custom_bg_data', ev.target.result);
                    } catch (e) { window.YayaRendererUtils.reportIgnoredError(e, 'src/renderer/settings-panel-feature.mjs'); }
                }
                bgInput.value = '';
            };
            reader.readAsDataURL(file);
        }
    });

    function resetBackground() {
        const settingsApi = getAppSettingsApi();
        if (settingsApi && typeof settingsApi.clearBackgroundSync === 'function') {
            settingsApi.clearBackgroundSync();
        }
        localStorage.removeItem('custom_bg_data');
        if (typeof applyCustomBackground === 'function') {
            applyCustomBackground('');
        } else {
            document.body.style.backgroundImage = '';
        }
    }

    let bilibiliLoginPollTimer = null;
    let bilibiliLoginRevision = 0;
    let pendingBilibiliRequest = Promise.resolve();

    function requestBilibili(channel, revision, payload) {
        const request = pendingBilibiliRequest.then(() => {
            if (revision === bilibiliLoginRevision) return invoke(channel, payload);
        });
        pendingBilibiliRequest = request.catch(() => {});
        return request;
    }

    function setBilibiliActionsDisabled(disabled) {
        for (const id of ['btn-bilibili-login', 'btn-bilibili-logout']) {
            const button = document.getElementById(id);
            if (button) button.disabled = disabled;
        }
    }

    function setBilibiliLoginPanelVisible(isVisible) {
        const panel = document.getElementById('bilibili-login-panel');
        if (panel) {
            panel.style.display = isVisible ? 'flex' : 'none';
        }
    }

    function setBilibiliLoginStatus(message, color = '') {
        const statusEl = document.getElementById('bilibili-login-status');
        if (statusEl) {
            statusEl.textContent = message || '';
            statusEl.style.color = color || 'var(--text-sub)';
        }
    }

    function setBilibiliLoginQrMessage(message, color = '') {
        const msgEl = document.getElementById('bilibili-login-qr-msg');
        if (msgEl) {
            msgEl.textContent = message || '';
            msgEl.style.color = color || 'var(--text-sub)';
        }
    }

    function stopBilibiliLoginPolling() {
        clearTimeout(bilibiliLoginPollTimer);
        bilibiliLoginPollTimer = null;
    }

    function renderBilibiliLoginState(result) {
        const loginBtn = document.getElementById('btn-bilibili-login');
        const logoutBtn = document.getElementById('btn-bilibili-logout');
        const userInfo = result && result.userInfo ? result.userInfo : null;

        if (result && result.loggedIn && userInfo) {
            const name = userInfo.uname || 'B站用户';
            const uid = userInfo.mid ? `UID: ${userInfo.mid}` : 'UID: --';
            setBilibiliLoginStatus(`已登录：${name} (${uid})`, '#28a745');
            if (loginBtn) loginBtn.textContent = translate('切换账号');
            if (logoutBtn) logoutBtn.style.display = 'inline-flex';
            setBilibiliLoginPanelVisible(false);
            stopBilibiliLoginPolling();
            return;
        }

        setBilibiliLoginStatus((result && result.msg) || '未登录B站，登录后可降低直播接口被拦截的概率');
        if (loginBtn) loginBtn.textContent = translate('登录账号');
        if (logoutBtn) logoutBtn.style.display = 'none';
    }

    async function refreshBilibiliLoginStatus(silent = false) {
        const revision = bilibiliLoginRevision;
        try {
            if (!silent) setBilibiliLoginStatus('正在检查 B站登录状态...');
            const result = await requestBilibili('bilibili-login-status', revision);
            if (revision === bilibiliLoginRevision) renderBilibiliLoginState(result);
            return result;
        } catch (error) {
            if (revision === bilibiliLoginRevision) setBilibiliLoginStatus('B站登录状态读取失败', '#ff4d4f');
            return { success: false, loggedIn: false, msg: error.message };
        }
    }

    function scheduleBilibiliPoll(qrcodeKey, revision) {
        bilibiliLoginPollTimer = setTimeout(async () => {
            bilibiliLoginPollTimer = null;
            try {
                const result = await requestBilibili('bilibili-login-poll', revision, { qrcodeKey });
                if (revision !== bilibiliLoginRevision) return;
                if (!result?.success) throw new Error(result?.msg || 'B站登录状态检查失败');
                if (result.loggedIn) {
                    setBilibiliLoginQrMessage('登录成功，正在更新状态...', '#28a745');
                    if (result.userInfo) renderBilibiliLoginState(result);
                    else await refreshBilibiliLoginStatus(true);
                    if (revision === bilibiliLoginRevision) showToast('B站登录成功');
                    return;
                }

                setBilibiliLoginQrMessage(result.msg || '等待扫码...');
                if (result.expired) {
                    setBilibiliLoginStatus('二维码已过期，请重新登录', '#faad14');
                    return;
                }
                scheduleBilibiliPoll(qrcodeKey, revision);
            } catch (error) {
                if (revision !== bilibiliLoginRevision) return;
                setBilibiliLoginQrMessage(error.message || 'B站登录失败', '#ff4d4f');
                setBilibiliLoginStatus(error.message || 'B站登录失败', '#ff4d4f');
            }
        }, 2000);
    }

    async function startBilibiliLogin() {
        const revision = ++bilibiliLoginRevision;
        stopBilibiliLoginPolling();
        const qrImage = document.getElementById('bilibili-login-qr');
        qrImage?.removeAttribute('src');
        setBilibiliLoginStatus('正在生成 B站登录二维码...');
        setBilibiliLoginQrMessage('正在生成二维码...');
        setBilibiliLoginPanelVisible(true);
        setBilibiliActionsDisabled(true);

        try {
            const result = await requestBilibili('bilibili-login-create-qrcode', revision);
            if (revision !== bilibiliLoginRevision) return;
            if (!result?.success || !result.qrcodeKey) throw new Error(result?.msg || 'B站二维码生成失败');
            if (qrImage && result.qrDataUrl) qrImage.src = result.qrDataUrl;
            setBilibiliLoginStatus('请使用 B站 App 扫码登录');
            setBilibiliLoginQrMessage('等待扫码...');
            scheduleBilibiliPoll(result.qrcodeKey, revision);
        } catch (error) {
            if (revision !== bilibiliLoginRevision) return;
            setBilibiliLoginQrMessage(error.message || 'B站二维码生成失败', '#ff4d4f');
            setBilibiliLoginStatus(error.message || 'B站二维码生成失败', '#ff4d4f');
        } finally {
            if (revision === bilibiliLoginRevision) setBilibiliActionsDisabled(false);
        }
    }

    async function logoutBilibili() {
        const revision = ++bilibiliLoginRevision;
        stopBilibiliLoginPolling();
        setBilibiliActionsDisabled(true);
        try {
            const result = await requestBilibili('bilibili-logout', revision);
            if (revision !== bilibiliLoginRevision) return;
            if (!result?.success) throw new Error(result?.msg || '退出B站登录失败');
            document.getElementById('bilibili-login-qr')?.removeAttribute('src');
            setBilibiliLoginPanelVisible(false);
            renderBilibiliLoginState({ loggedIn: false, msg: '已退出B站账号' });
            showToast('已退出B站账号');
        } catch (error) {
            if (revision === bilibiliLoginRevision) setBilibiliLoginStatus(error.message || '退出B站登录失败', '#ff4d4f');
        } finally {
            if (revision === bilibiliLoginRevision) setBilibiliActionsDisabled(false);
        }
    }

    async function loadCustomPaths() {
        for (const [id, key] of Object.entries(downloadPathFields)) {
            const input = document.getElementById(id);
            if (input) input.value = readStoredStringSetting(key, '');
        }

        try {
            const defaultDownloadPath = String(
                await invoke('get-default-download-path') || ''
            ).trim();
            if (!defaultDownloadPath) return;
            Object.keys(downloadPathFields)
                .forEach((id) => {
                    const input = document.getElementById(id);
                    if (input) input.placeholder = translate(`${defaultDownloadPath}（默认路径）`);
                });
        } catch (error) {
            console.warn('读取默认下载路径失败:', error);
        }
    }

    function readStoredBooleanSetting(key, fallbackValue = false) {
        const settingsApi = getAppSettingsApi();
        if (settingsApi && typeof settingsApi.getSettingValueSync === 'function') {
            return settingsApi.getSettingValueSync(key, fallbackValue) === true;
        }

        const legacyValue = localStorage.getItem(key);
        if (legacyValue === null) return fallbackValue === true;
        return legacyValue === 'true';
    }

    function writeStoredBooleanSetting(key, value) {
        const normalized = value === true;
        const settingsApi = getAppSettingsApi();
        if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
            settingsApi.setSettingValueSync(key, normalized);
            localStorage.removeItem(key);
            return normalized;
        }

        localStorage.setItem(key, String(normalized));
        return normalized;
    }

    function loadYayaApiProxySetting() {
        const checkbox = document.getElementById('use-yaya-api-proxy');
        if (!checkbox) return;
        checkbox.checked = readStoredBooleanSetting('useYayaApiProxy', false);
    }

    function saveYayaApiProxySetting() {
        const checkbox = document.getElementById('use-yaya-api-proxy');
        if (!checkbox) return;
        writeStoredBooleanSetting('useYayaApiProxy', checkbox.checked);
        if (typeof showToast === 'function') {
            showToast(checkbox.checked ? '已启用 yaya-api 代理' : '已关闭 yaya-api 代理');
        }
    }

    function normalizeWindowCloseBehavior(value) {
        return value === 'quit' ? 'quit' : 'minimize-to-tray';
    }

    function readCustomSenderProfileForm() {
        const enabled = document.getElementById('custom-sender-profile-enabled')?.checked === true;
        const readValue = id => String(document.getElementById(id)?.value || '')
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .trim();
        return senderProfile.normalizeCustomSenderProfile({
            enabled,
            userId: readValue('custom-sender-user-id'),
            nickName: readValue('custom-sender-nickname'),
            avatar: readValue('custom-sender-avatar'),
            level: readValue('custom-sender-level'),
            roleId: readValue('custom-sender-role-id'),
            channelRole: readValue('custom-sender-channel-role'),
            vip: document.getElementById('custom-sender-vip')?.checked === true,
            teamLogo: readValue('custom-sender-team-logo'),
            pfUrl: readValue('custom-sender-pf-url'),
            badge: document.getElementById('custom-sender-badge')?.value || '',
            bubbleId: readValue('custom-sender-bubble-id'),
            sessionRole: readValue('custom-sender-session-role'),
            inTop: document.getElementById('custom-sender-in-top')?.checked === true,
            monthCardBadge: {
                img: readValue('custom-sender-month-img'),
                level: readValue('custom-sender-month-level'),
                levelColor: readValue('custom-sender-month-level-color'),
                setText: readValue('custom-sender-month-set-text'),
                textColor: readValue('custom-sender-month-text-color')
            },
            config: {
                version: readValue('custom-sender-config-version'),
                build: readValue('custom-sender-config-build'),
                phoneName: readValue('custom-sender-config-phone-name'),
                phoneSystemVersion: readValue('custom-sender-config-phone-system-version'),
                mobileOperators: readValue('custom-sender-config-mobile-operators'),
                ip: readValue('custom-sender-config-ip')
            }
        }, { strict: true });
    }

    function toggleCustomSenderProfileControls() {
        const enabled = document.getElementById('custom-sender-profile-enabled')?.checked === true;
        const card = document.getElementById('custom-sender-profile-card');
        card?.classList.toggle('is-disabled', !enabled);
        document.querySelectorAll('#custom-sender-profile-fields input, #custom-sender-profile-fields textarea').forEach(input => {
            input.disabled = !enabled;
        });
    }

    function loadCustomSenderProfileSetting() {
        const stored = readStoredJsonSetting('customSenderProfile', {});
        const profile = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
        const setValue = (id, value) => {
            const input = document.getElementById(id);
            if (input) input.value = value === null || value === undefined ? '' : String(value);
        };

        const enabledInput = document.getElementById('custom-sender-profile-enabled');
        if (enabledInput) enabledInput.checked = profile.enabled === true;
        setValue('custom-sender-user-id', profile.userId);
        setValue('custom-sender-nickname', profile.nickName ?? profile.nickname);
        setValue('custom-sender-avatar', profile.avatar);
        setValue('custom-sender-level', profile.level);
        setValue('custom-sender-role-id', profile.roleId);
        setValue('custom-sender-channel-role', profile.channelRole);
        const vipInput = document.getElementById('custom-sender-vip');
        if (vipInput) vipInput.checked = profile.vip === true;
        setValue('custom-sender-team-logo', profile.teamLogo);
        setValue('custom-sender-pf-url', profile.pfUrl);
        setValue('custom-sender-badge', Array.isArray(profile.badge) ? JSON.stringify(profile.badge, null, 2) : '');
        setValue('custom-sender-bubble-id', profile.bubbleId);
        setValue('custom-sender-session-role', profile.sessionRole);
        const inTopInput = document.getElementById('custom-sender-in-top');
        if (inTopInput) inTopInput.checked = profile.inTop === true;
        for (const [field, id] of Object.entries({ img: 'img', level: 'level', levelColor: 'level-color', setText: 'set-text', textColor: 'text-color' })) {
            setValue('custom-sender-month-' + id, profile.monthCardBadge?.[field]);
        }
        for (const [field, id] of Object.entries({ version: 'version', build: 'build', phoneName: 'phone-name', phoneSystemVersion: 'phone-system-version', mobileOperators: 'mobile-operators', ip: 'ip' })) {
            setValue('custom-sender-config-' + id, profile.config?.[field]);
        }
        toggleCustomSenderProfileControls();
    }

    function saveCustomSenderProfileSetting() {
        try {
            const profile = readCustomSenderProfileForm();
            writeStoredJsonSetting('customSenderProfile', profile);
            if (typeof showToast === 'function') {
                showToast(profile.enabled ? '自定义发送资料已保存' : '已停用自定义发送资料');
            }
        } catch (error) {
            if (typeof showToast === 'function') showToast(error?.message || '发送资料格式无效');
        }
    }

    function resetCustomSenderProfileSetting() {
        removeStoredSetting('customSenderProfile');
        loadCustomSenderProfileSetting();
        if (typeof showToast === 'function') showToast('已恢复使用口袋48账号资料');
    }

    function loadWindowCloseBehaviorSetting() {
        const behavior = normalizeWindowCloseBehavior(
            readStoredStringSetting('windowCloseBehavior', 'minimize-to-tray')
        );
        const select = document.getElementById('window-close-behavior-select');
        if (select) {
            select.value = behavior;
            select.dispatchEvent(new Event('yaya:setting-loaded'));
        }
        const radio = document.querySelector(`input[name="window-close-behavior"][value="${behavior}"]`);
        if (radio) radio.checked = true;
    }

    function saveWindowCloseBehaviorSetting() {
        const select = document.getElementById('window-close-behavior-select');
        const checked = document.querySelector('input[name="window-close-behavior"]:checked');
        if (!select && !checked) return;
        const behavior = normalizeWindowCloseBehavior(select ? select.value : checked.value);
        writeStoredStringSetting('windowCloseBehavior', behavior);
        if (typeof showToast === 'function') {
            showToast(behavior === 'quit' ? '关闭软件时将直接退出' : '关闭软件时将最小化到托盘');
        }
    }

    function saveCustomPaths() {
        for (const [id, key] of Object.entries(downloadPathFields)) {
            const input = document.getElementById(id);
            if (input) writeStoredStringSetting(key, input.value.trim());
        }
    }

    async function triggerSelectPath(inputId) {
        const input = document.getElementById(inputId);
        if (!input || !Object.prototype.hasOwnProperty.call(downloadPathFields, inputId)) return;
        try {
            const path = await invoke('dialog-open-directory');

            if (path) {
                input.value = path;
                saveCustomPaths();
            }
        } catch (e) {
            console.error('打开文件夹选择框失败:', e);
            showToast('无法打开系统选择框，请尝试手动粘贴路径。');
        }
    }

    const buttons = {
        'btn-choose-background': () => bgInput?.click(),
        'btn-reset-background': resetBackground,
        'btn-bilibili-login': startBilibiliLogin,
        'btn-bilibili-refresh': () => refreshBilibiliLoginStatus(),
        'btn-bilibili-logout': logoutBilibili,
        'btn-save-sender-profile': saveCustomSenderProfileSetting,
        'btn-reset-sender-profile': resetCustomSenderProfileSetting
    };
    for (const [id, handler] of Object.entries(buttons)) {
        document.getElementById(id)?.addEventListener('click', handler);
    }
    document.getElementById('custom-sender-profile-enabled')?.addEventListener('change', toggleCustomSenderProfileControls);
    document.getElementById('use-yaya-api-proxy')?.addEventListener('change', saveYayaApiProxySetting);
    document.getElementById('view-settings')?.addEventListener('change', event => {
        if (event.target.matches('#window-close-behavior-select, input[name="window-close-behavior"]')) {
            saveWindowCloseBehaviorSetting();
        }
    }, true);

    for (const id of Object.keys(downloadPathFields)) {
        document.getElementById(id)?.addEventListener('change', saveCustomPaths);
    }
    for (const button of document.querySelectorAll('[data-settings-path]')) {
        button.addEventListener('click', () => triggerSelectPath(button.dataset.settingsPath));
    }

    function loadSettings() {
        void loadCustomPaths();
        loadYayaApiProxySetting();
        loadWindowCloseBehaviorSetting();
        loadCustomSenderProfileSetting();
    }

    return { loadSettings, refreshBilibiliLoginStatus };
}
