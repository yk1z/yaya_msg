(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.YayaPocketRegistration = api;
})(typeof window !== 'undefined' ? window : null, function () {
    function loginResultKind(result, profile) {
        if (Number(result?.status) === 200 && result.success !== false && result.content?.token) return 'success';
        return profile === 'pocket48' && Number(result?.status) === 10001 ? 'register' : 'error';
    }
    function passwordError(password, confirmation) {
        if (typeof password !== 'string' || password.length < 6) return '密码至少需要 6 位';
        if (password.length > 1024) return '密码过长';
        if (password !== confirmation) return '两次输入的密码不一致';
        return '';
    }
    async function encryptPassword(password) {
        if (passwordError(password, password)) throw new Error(passwordError(password, password));
        const crypto = globalThis.crypto;
        if (!crypto?.subtle) throw new Error('当前环境不支持密码加密，请使用桌面版或 HTTPS 页面');
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('7yy4tjcw12aipo2c'), 'AES-CBC', false, ['encrypt']);
        const bytes = new TextEncoder().encode(password);
        const padding = 16 - bytes.length % 16;
        const input = new Uint8Array(bytes.length + padding); input.set(bytes); input.fill(padding, bytes.length);
        const output = new Uint8Array(input.length);
        for (let offset = 0; offset < input.length; offset += 16) {
            const block = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, key, input.subarray(offset, offset + 16));
            output.set(new Uint8Array(block, 0, 16), offset);
        }
        input.fill(0); bytes.fill(0);
        return btoa(String.fromCharCode(...output));
    }
    function registrationRequest(payload = {}) {
        if (payload.clientProfile !== 'pocket48') throw new Error('当前登录身份不使用口袋48设置密码注册流程');
        const mobile = String(payload.mobile || '').trim(), code = String(payload.code || '').trim();
        const area = String(payload.area || '86').replace(/^\+/, '');
        const mobilePwd = String(payload.encryptedPassword || '');
        if (!/^\d{6,20}$/.test(mobile) || !/^[1-9]\d{0,3}$/.test(area) || !/^\d{4,10}$/.test(code)) throw new Error('手机号、区号或验证码格式不正确');
        if (mobilePwd.length < 24 || mobilePwd.length > 5504 || !/^[A-Za-z0-9+/]+={0,2}$/.test(mobilePwd)) throw new Error('密码加密数据格式不正确');
        try { if (atob(mobilePwd).length % 16 !== 0) throw new Error(); } catch (_) { throw new Error('密码加密数据格式不正确'); }
        return { mobile, code, area, mobilePwd };
    }
    function apiRequest(channel, payload) {
        const body = registrationRequest(payload);
        if (channel === 'register-by-code') return { path: '/user/api/v1/register/mobile', body };
        if (channel !== 'login-by-password') throw new Error('不支持的注册请求');
        return { path: '/user/api/v1/login/app/mobile', body: {
            loginMobile: { mobile: body.mobile, pwd: body.mobilePwd }, loginType: 'MOBILE_PWD', intelligenceToken: '', deviceToken: ''
        } };
    }
    function apiResult(channel, data, httpStatus) {
        const success = httpStatus === 200 && Number(data?.status) === 200 && data.success !== false;
        return channel === 'register-by-code'
            ? { status: data?.status, success, message: data?.message || (success ? '注册成功' : '注册失败'), uncertain: httpStatus >= 500 }
            : { ...data, success: success && Boolean(data?.content?.token) };
    }
    return { loginResultKind, passwordError, encryptPassword, registrationRequest, apiRequest, apiResult };
});
