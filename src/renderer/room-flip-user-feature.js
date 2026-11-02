(function (root) {
    function createRoomFlipUserFeature({ ipcRenderer, getToken, getPa = () => '', openProfile }) {
        const cache = new Map();
        const queue = [];
        let active = 0;
        let cacheToken = '';
        let observer;

        function pump() {
            while (active < 3 && queue.length) {
                const task = queue.shift();
                active++;
                void (async () => {
                    try {
                        if (getToken() !== task.token) return task.resolve(null);
                        const result = await ipcRenderer.invoke('fetch-room-flip-user', {
                            token: task.token, pa: getPa(), questionId: task.questionId, answerId: task.answerId
                        });
                        task.resolve(result?.success ? result.content : null);
                    } catch (_) { task.resolve(null); }
                    finally { active--; pump(); }
                })();
            }
        }

        function fetchUser(token, questionId, answerId) {
            if (cacheToken !== token) { cache.clear(); cacheToken = token; }
            const key = `${questionId}:${answerId}`;
            if (cache.has(key)) return cache.get(key);
            const result = new Promise(resolve => { queue.push({ token, questionId, answerId, resolve }); });
            cache.set(key, result);
            while (cache.size > 128) cache.delete(cache.keys().next().value);
            pump();
            return result;
        }

        function avatarUrl(value) {
            if (!value) return '';
            try {
                const url = new URL(value, 'https://source.48.cn/');
                return /^https?:$/.test(url.protocol) ? url.href : '';
            } catch (_) { return ''; }
        }

        async function hydrate(slot) {
            if (slot.dataset.flipUserState || !slot.isConnected) return;
            slot.dataset.flipUserState = 'loading';
            const token = getToken();
            const result = token ? await fetchUser(token, slot.dataset.questionId, slot.dataset.answerId) : null;
            if (!slot.isConnected || token !== getToken()) return;
            slot.dataset.flipUserState = 'done';
            slot.replaceChildren();
            if (result?.visibility === 'anonymous') {
                slot.textContent = '匿名用户';
                return;
            }
            const user = result?.visibility === 'public' ? result.user : null;
            if (!user || (!user.nickname && !user.userId)) { slot.textContent = '用户'; return; }
            const name = user.nickname || '口袋用户';
            const avatar = avatarUrl(user.avatar);
            const button = root.document.createElement('button');
            button.type = 'button';
            button.className = 'room-flip-question-user';
            button.disabled = !/^[1-9]\d{0,31}$/.test(user.userId || '');
            button.title = button.disabled ? name : `查看 ${name} 的用户主页`;
            if (avatar) {
                const image = root.document.createElement('img');
                image.className = 'avatar room-flip-question-user-avatar';
                image.src = avatar;
                image.alt = '';
                image.addEventListener('error', () => { image.hidden = true; }, { once: true });
                button.appendChild(image);
            }
            const label = root.document.createElement('span');
            label.textContent = name;
            button.appendChild(label);
            button.addEventListener('click', event => {
                event.stopPropagation();
                openProfile(user.userId, name, avatar, false);
            });
            slot.appendChild(button);
        }

        function observe(container) {
            if (!container) return;
            observer?.disconnect();
            const slots = container.querySelectorAll('.room-flip-question-user-slot:not([data-flip-user-state])');
            if (typeof root.IntersectionObserver !== 'function') {
                slots.forEach(slot => { void hydrate(slot); });
                return;
            }
            observer = new root.IntersectionObserver(entries => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    observer.unobserve(entry.target);
                    void hydrate(entry.target);
                }
            }, { root: container, rootMargin: '160px' });
            slots.forEach(slot => observer.observe(slot));
        }

        return { observe };
    }

    if (typeof module === 'object' && module.exports) module.exports = { createRoomFlipUserFeature };
    if (root) {
        root.YayaRendererFeatures = root.YayaRendererFeatures || {};
        root.YayaRendererFeatures.createRoomFlipUserFeature = createRoomFlipUserFeature;
    }
})(typeof window !== 'undefined' ? window : globalThis);
