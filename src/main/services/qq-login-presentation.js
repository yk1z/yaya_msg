'use strict';

function prepareQqAuthorizationPage(expectedState) {
    const valid = () => {
        const url = new URL(location.href);
        const p = url.searchParams;
        return url.origin === 'https://xui.ptlogin2.qq.com' && url.pathname === '/cgi-bin/xlogin'
            && p.get('style') === '35' && p.get('state') === expectedState
            && p.get('client_id') === '1103838320' && p.get('pt_3rd_aid') === '1103838320'
            && p.get('redirect_uri') === 'auth://tauth.qq.com/' && p.get('response_type') === 'token';
    };
    if (!valid() || window.__yayaQqOAuthPrepared) return false;
    window.__yayaQqOAuthPrepared = true;
    const deadline = Date.now() + 15000;
    const prepare = () => {
        if (!valid()) return;
        const pt = window.pt;
        if (!pt?.isHulian || typeof pt.switchpwd !== 'function' || typeof pt.hideOneKey !== 'function' || !pt.submit_o?.openlogin_data) {
            if (Date.now() < deadline) setTimeout(prepare, 100);
            else window.__yayaQqOAuthPrepared = false;
            return;
        }
        const data = new URLSearchParams(decodeURIComponent(pt.submit_o.openlogin_data));
        if (data.get('client_id') !== '1103838320' || data.get('state') !== expectedState
            || data.get('redirect_uri') !== 'auth://tauth.qq.com/' || data.get('response_type') !== 'token') return;
        const style = document.createElement('style');
        style.textContent = `
            #onekey, #qrlogin, #switch, #qlogin_entry { display: none !important; }
            #form_outter_wrap { display: block !important; }
            #go { display: block !important; }
            #pwdlogin { max-width: 360px; margin: 20px auto; }
        `;
        document.head.appendChild(style);
        pt.hideOneKey();
        pt.switchpwd();
    };
    prepare();
    return true;
}

const qqAuthorizationPageScript = expectedState => '(' + prepareQqAuthorizationPage.toString() + ')(' + JSON.stringify(expectedState) + ')';
module.exports = { qqAuthorizationPageScript };
