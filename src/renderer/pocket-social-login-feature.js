(function () {
    'use strict';
    const enabled = false;
    const names = { baidu: '百度贴吧', sigua: '丝瓜', wechat: '微信', qq: 'QQ', weibo: '微博' };
    let session = null;
    const el = id => document.getElementById(id);
    const isDesktop = () => !!window.desktop && window.desktop.platform !== 'web';
    function message(text, error = false) {
        const box = el('login-msg');
        if (box) { box.textContent = text; box.style.color = error ? '#ff4d4f' : 'var(--text-sub)'; }
    }
    function render() {
        const row = el('pocket-social-login');
        if (!row) return;
        row.hidden = !enabled || !isDesktop();
        if (el('tab-social')) el('tab-social').hidden = !enabled || !isDesktop();
        row.querySelectorAll('[data-social-provider]').forEach(button => { button.disabled = !!session; });
        el('pocket-social-login-cancel').hidden = !session;
        el('sigua-login-submit').disabled = !!session?.busy;
        el('sigua-login-account').disabled = !!session?.busy;
        el('sigua-login-password').disabled = !!session?.busy;
    }
    function cancel(showMessage = true) {
        const previous = session;
        session = null;
        const modal = el('pocket-sigua-login-modal');
        if (modal) modal.style.display = 'none';
        if (el('sigua-login-password')) el('sigua-login-password').value = '';
        if (el('sigua-login-account')) el('sigua-login-account').value = '';
        if (el('sigua-login-status')) el('sigua-login-status').textContent = '';
        if (previous?.busy) window.ipcRenderer.invoke('pocket-social-login-cancel', { attemptId: previous.attemptId }).catch(() => {});
        render();
        if (previous && showMessage) message('已取消登录');
    }
    async function authorize(state, credentials = {}) {
        if (session !== state || state.busy || !state.context.isCurrent()) return;
        state.busy = true; render();
        message(state.provider === 'sigua' ? '正在登录丝瓜账号…' : '请在授权窗口完成' + names[state.provider] + '登录');
        el('sigua-login-status').textContent = state.provider === 'sigua' ? '正在登录…' : '';
        try {
            const result = await window.ipcRenderer.invoke('pocket-social-login-start', {
                provider: state.provider, clientProfile: state.context.clientProfile, attemptId: state.attemptId, ...credentials
            });
            if (session !== state || !state.context.isCurrent()) return;
            if (!result?.success || !result.content?.token) {
                if (result?.cancelled) { cancel(); return; }
                throw new Error(result?.msg || result?.message || '登录失败，请重试');
            }
            const complete = state.context.complete;
            cancel(false);
            complete(result);
        } catch (error) {
            if (session === state && state.context.isCurrent()) {
                const text = error?.message || '登录失败，请稍后重试';
                message(text, true);
                el('sigua-login-status').textContent = text;
                if (state.provider !== 'sigua') cancel(false);
            }
        } finally {
            if (session === state && !state.context.isCurrent()) cancel(false);
            if (session === state) { state.busy = false; render(); }
        }
    }
    function start(provider, context) {
        if (!enabled || !Object.hasOwn(names, provider) || !isDesktop()) return;
        cancel(false);
        if (provider === 'wechat') {
            message('微信登录暂不可用：官方移动应用授权需要服务端签名，目前无法在桌面端完成。请使用验证码或其他登录方式。', true);
            return;
        }
        if (!context.isCurrent()) return;
        session = { provider, context, busy: false, attemptId: crypto.randomUUID() };
        render();
        if (provider === 'sigua') {
            message('');
            el('pocket-sigua-login-modal').style.display = 'flex';
            el('pocket-sigua-login-form').onsubmit = event => {
                event.preventDefault();
                const state = session;
                if (!state || state.busy) return;
                const sgAccount = el('sigua-login-account').value.trim();
                const sgToken = el('sigua-login-password').value;
                if (!sgAccount || !sgToken.trim()) return;
                el('sigua-login-password').value = '';
                authorize(state, { sgAccount, sgToken });
            };
            el('sigua-login-account').focus();
        } else authorize(session);
    }
    window.YayaPocketSocialLoginUi = { enabled, start, cancel, refresh: render };
    document.addEventListener('DOMContentLoaded', render);
    document.addEventListener('click', event => {
        if (event.target === el('pocket-sigua-login-modal') || event.target.closest?.('[data-close-sigua-login]')) cancel();
    });
    document.addEventListener('keydown', event => {
        if (session && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancel(); }
    }, true);
    window.addEventListener('yaya:view-changed', event => { if (event.detail?.view !== 'login') cancel(false); });
    window.addEventListener('yaya:account-state-changed', () => cancel(false));
    window.addEventListener('pagehide', () => cancel(false));
})();
