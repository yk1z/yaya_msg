export function showToast(msg) {
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
export function showCustomConfirm(text, onConfirm, onCancel) {
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

    let closed = false;
    function close(confirmed = false) {
        if (closed) return;
        closed = true;
        overlay.remove();
        if (confirmed) onConfirm?.();
        else onCancel?.();
    }

    btnCancel.onclick = () => {
        close();
    };

    btnOk.onclick = () => {
        close(true);
    };

    document.body.appendChild(overlay);
    return () => close(false);
}
