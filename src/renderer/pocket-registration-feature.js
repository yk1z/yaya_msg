(function () {
    let session = null;
    const el = id => document.getElementById(id);
    const ids = { modal: 'pocket-registration-modal', form: 'pocket-registration-form', password: 'registration-password',
        confirmation: 'registration-confirmation', agreement: 'registration-agreement', status: 'registration-status', submit: 'registration-submit' };
    function active(state) { return session === state && state.context.isCurrent(); }
    function render() {
        if (!session) return;
        const loginOnly = session.registered || session.uncertain;
        el('registration-password-fields').hidden = loginOnly;
        el('registration-agreement-row').hidden = loginOnly;
        el(ids.password).required = !loginOnly; el(ids.confirmation).required = !loginOnly;
        for (const id of [ids.password, ids.confirmation, ids.agreement]) el(id).disabled = session.busy;
        el(ids.submit).disabled = session.busy;
        el(ids.submit).textContent = session.busy ? (loginOnly ? '正在登录…' : '正在注册…') : loginOnly ? '重试登录' : '注册并登录';
    }
    function close() {
        session = null;
        const modal = el(ids.modal);
        if (modal) modal.style.display = 'none';
        for (const id of [ids.password, ids.confirmation]) { const field = el(id); if (field) field.value = ''; }
        if (el(ids.agreement)) el(ids.agreement).checked = false;
        if (el(ids.status)) el(ids.status).textContent = '';
    }
    async function submit(event) {
        event?.preventDefault();
        const state = session;
        if (!state || state.busy) return;
        if (!active(state)) { close(); return; }
        const status = el(ids.status);
        if (!state.registered && !state.uncertain) {
            const error = window.YayaPocketRegistration.passwordError(el(ids.password).value, el(ids.confirmation).value);
            if (error) { status.textContent = error; return; }
            if (!el(ids.agreement).checked) { status.textContent = '请先阅读并同意口袋48官方协议'; return; }
        }
        state.busy = true; render(); status.textContent = '';
        try {
            const pa = await state.context.getPa();
            if (!active(state)) return;
            if (!state.registered && !state.uncertain) {
                state.encryptedPassword = await window.YayaPocketRegistration.encryptPassword(el(ids.password).value);
                if (!active(state)) return;
                let response;
                try {
                    response = await state.context.invoke('register-by-code', { ...state.input, pa, encryptedPassword: state.encryptedPassword });
                } catch (_) {
                    state.uncertain = true;
                    throw new Error('注册结果未确认，请先尝试登录；不要重复提交注册');
                }
                if (!active(state)) return;
                if (!response?.success) {
                    state.uncertain = response?.uncertain === true || !response?.status;
                    throw new Error(state.uncertain ? '注册结果未确认，请先尝试登录；不要重复提交注册' : response.message || response.msg || '注册失败');
                }
                state.registered = true;
            }
            el(ids.password).value = ''; el(ids.confirmation).value = '';
            render(); status.textContent = state.uncertain ? '正在尝试登录…' : '注册成功，正在登录…';
            const response = await state.context.invoke('login-by-password', { ...state.input, pa, encryptedPassword: state.encryptedPassword });
            if (!active(state)) return;
            if (window.YayaPocketRegistration.loginResultKind(response, state.input.clientProfile) !== 'success') {
                throw new Error((state.registered ? '注册已成功，' : '') + (response?.message || response?.msg || '自动登录失败') + '，可重试登录');
            }
            close();
            state.context.complete(response);
        } catch (error) {
            if (active(state)) status.textContent = error.message || '操作失败，请稍后重试';
        } finally {
            if (session === state && !state.context.isCurrent()) close();
            if (active(state)) {
                state.busy = false;
                if (state.registered || state.uncertain) { el(ids.password).value = ''; el(ids.confirmation).value = ''; }
                render();
            }
        }
    }
    function open(input, context) {
        close();
        if (input.clientProfile !== 'pocket48' || !context.isCurrent()) return false;
        session = { input: { mobile: input.mobile, code: input.code, area: input.area, clientProfile: input.clientProfile },
            context, busy: false, registered: false, uncertain: false, encryptedPassword: '' };
        el(ids.modal).style.display = 'flex';
        el(ids.form).onsubmit = submit;
        render(); el(ids.password).focus();
        return true;
    }
    window.YayaPocketRegistrationUi = { open, close };
    document.addEventListener('click', event => {
        if (event.target === el(ids.modal) || event.target.closest?.('[data-close-pocket-registration]')) close();
    });
    document.addEventListener('keydown', event => {
        if (session && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    }, true);
    document.addEventListener('input', event => {
        if (session && ['login-mobile', 'login-area', 'login-code'].includes(event.target.id)) close();
    });
    window.addEventListener('yaya:view-changed', event => { if (event.detail?.view !== 'login') close(); });
    window.addEventListener('yaya:account-state-changed', () => close());
})();
