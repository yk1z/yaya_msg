import { getStoredAppToken } from './app-preferences.mjs';

let maskwordLibrary = [];

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

export function hideMaskwordResultIfEmpty() {
    const input = getActiveMaskwordElements().input;
    if (!String(input?.value || '').trim()) hideMaskwordResult();
}

async function updateMaskwordLibrary() {
    const token = getStoredAppToken();

    showMaskwordResult('正在读取词库');

    try {
        const res = await window.ipcRenderer.invoke('fetch-pocket-mask-words', {
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

export async function checkMaskwordText() {
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
    btn.innerText = window.YayaRendererUtils.t('检测中');
    display.innerHTML = '<div class="spinner"></div><span style="margin-left:10px;">正在查询网络信息...</span>';
    display.style.display = 'flex';

    try {
        const res = await window.ipcRenderer.invoke('check-ip-info');

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
        btn.innerText = window.YayaRendererUtils.t('重新检测');
    }
}

export async function checkAllNetwork() {
    const btn = document.getElementById('btn-check-all');
    btn.disabled = true;
    btn.innerText = window.YayaRendererUtils.t('检测中');

    ['domestic', 'foreign', 'google'].forEach(type => {
        document.getElementById(`res-${type}`).innerHTML = '<div class="spinner"></div> 检测中';
    });

    const p1 = window.ipcRenderer.invoke('check-ip-domestic').then(res => renderDomestic(res));
    const p2 = window.ipcRenderer.invoke('check-ip-foreign').then(res => renderCommon('foreign', res));
    const p3 = window.ipcRenderer.invoke('check-ip-google').then(res => renderCommon('google', res));

    await Promise.allSettled([p1, p2, p3]);

    btn.disabled = false;
    btn.innerText = window.YayaRendererUtils.t('重新检测');
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
