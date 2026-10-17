(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};
    let pagSdkPromise = null;
    let lottieSdkPromise = null;

    function loadScript(file) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = new URL(`./src/renderer/vendor/${file}`, document.baseURI).href;
            script.onload = resolve;
            script.onerror = () => { script.remove(); reject(new Error(`礼物播放器加载失败: ${file}`)); };
            document.head.appendChild(script);
        });
    }

    async function getPag(ipcRenderer) {
        if (!pagSdkPromise) pagSdkPromise = (async () => {
            if (!window.libpag) await loadScript('libpag-runtime.js');
            const bytes = await ipcRenderer.invoke('read-live-gift-player-wasm');
            return window.libpag.PAGInit({ wasmBinary: new Uint8Array(bytes) });
        })().catch(error => { pagSdkPromise = null; throw error; });
        return pagSdkPromise;
    }

    async function getLottie() {
        if (!lottieSdkPromise) lottieSdkPromise = (async () => {
            if (!window.lottie) await loadScript('lottie-light-runtime.js');
            return window.lottie;
        })().catch(error => { lottieSdkPromise = null; throw error; });
        return lottieSdkPromise;
    }

    window.YayaRendererFeatures.createDesktopLiveGiftAnimation = function ({ ipcRenderer, reportError = console.warn,
        getContainer, eventName = 'yaya:live-gift-animation-state', layerClassName = '' }) {
        const queue = [];
        let active = null;
        let generation = 0;

        function emit(state, item, type) {
            window.dispatchEvent(new CustomEvent(eventName, {
                detail: { state, type, giftName: item.giftName || '' }
            }));
        }

        function makeLayer(parent) {
            const layer = document.createElement('div');
            layer.className = `yaya-desktop-gift-animation ${layerClassName}`.trim();
            Object.assign(layer.style, { position: 'absolute', inset: '0', zIndex: '24', pointerEvents: 'none',
                overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' });
            parent.appendChild(layer);
            return layer;
        }

        function waitForEnd(job, timeout, start) {
            return new Promise((resolve, reject) => {
                let done = false;
                const timer = setTimeout(() => finish(), Math.min(65_000, Math.max(1000, timeout)));
                function finish(error) {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    job.finish = null;
                    error ? reject(error) : resolve();
                }
                job.finish = finish;
                try { start(finish); } catch (error) { finish(error); }
            });
        }

        async function playPag(asset, layer, job) {
            const PAG = await getPag(ipcRenderer);
            if (job.cancelled) return;
            const data = new Uint8Array(asset.bytes);
            const file = await PAG.PAGFile.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
            if (!file) throw new Error('无法读取 PAG 礼物');
            job.cleanups.push(() => file.destroy());
            if (job.cancelled) return;
            const canvas = document.createElement('canvas');
            canvas.width = file.width();
            canvas.height = file.height();
            Object.assign(canvas.style, { width: '100%', height: '100%', objectFit: 'contain' });
            layer.appendChild(canvas);
            const view = await PAG.PAGView.init(file, canvas);
            if (!view) throw new Error('无法创建 PAG 礼物播放器');
            job.cleanups.push(() => view.destroy());
            if (job.cancelled) return;
            view.setRepeatCount(1);
            emit('playing', job.item, 'pag');
            await waitForEnd(job, view.duration() / 1000 + 2500, finish => {
                view.addListener('onAnimationEnd', () => finish());
                void view.play().catch(finish);
            });
        }

        async function playLottie(asset, layer, job) {
            const lottie = await getLottie();
            if (job.cancelled) return;
            const element = document.createElement('div');
            Object.assign(element.style, { width: '100%', height: '100%' });
            layer.appendChild(element);
            const animation = lottie.loadAnimation({ container: element, renderer: 'svg', loop: false, autoplay: false,
                animationData: asset.animationData, rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } });
            job.cleanups.push(() => animation.destroy());
            const duration = ((asset.animationData.op - asset.animationData.ip) / asset.animationData.fr) * 1000;
            await waitForEnd(job, duration + 3000, finish => {
                animation.addEventListener('complete', () => finish());
                animation.addEventListener('data_failed', () => finish(new Error('Lottie 礼物加载失败')));
                animation.addEventListener('error', () => finish(new Error('Lottie 礼物播放失败')));
                animation.addEventListener('DOMLoaded', () => { emit('playing', job.item, 'lottie'); animation.play(); });
            });
        }

        async function playFrames(asset, layer, job) {
            const image = document.createElement('img');
            image.alt = '';
            Object.assign(image.style, { width: '100%', height: '100%', objectFit: 'contain' });
            layer.appendChild(image);
            const interval = Math.max(16, Math.min(1000, Number(job.item.giftAnimation.switchTime) || 50));
            let timer;
            job.cleanups.push(() => { clearTimeout(timer); image.removeAttribute('src'); });
            await waitForEnd(job, asset.frames.length * interval + 5000, finish => {
                let index = 0;
                image.onerror = () => finish(new Error('礼物动画图片加载失败'));
                image.onload = () => {
                    if (job.cancelled) return;
                    if (index === 1) emit('playing', job.item, 'frames');
                    timer = setTimeout(() => {
                        if (index >= asset.frames.length) finish();
                        else image.src = asset.frames[index++];
                    }, interval);
                };
                image.src = asset.frames[index++];
            });
        }

        function dispose(job) {
            job.finish?.();
            for (const cleanup of job.cleanups.splice(0).reverse()) {
                try { cleanup(); } catch (error) { reportError(error); }
            }
            job.layer?.remove();
        }

        async function pump() {
            if (active || !queue.length) return;
            const job = queue.shift();
            active = job;
            try {
                const info = job.item.giftAnimation;
                const asset = await ipcRenderer.invoke('load-live-gift-animation', { url: info.url, md5: info.md5 });
                if (job.cancelled || job.generation !== generation || !job.parent.isConnected) return;
                if (!asset?.success) throw new Error(asset?.msg || '礼物动画资源加载失败');
                job.layer = makeLayer(job.parent);
                if (asset.type === 'pag') await playPag(asset, job.layer, job);
                else if (asset.type === 'lottie') await playLottie(asset, job.layer, job);
                else if (asset.type === 'frames') await playFrames(asset, job.layer, job);
                else throw new Error('未知礼物动画格式');
                if (!job.cancelled) emit('ended', job.item, asset.type);
            } catch (error) {
                if (!job.cancelled) { reportError(error); emit('failed', job.item); }
            } finally {
                dispose(job);
                if (active === job) { active = null; void pump(); }
            }
        }

        return {
            enqueue(item, player) {
                if (!window.desktop?.platform || window.desktop.platform === 'web' || !item.giftAnimation?.url) return;
                const parent = getContainer ? getContainer() : (player?.template?.$player || document.getElementById('live-player-container'));
                if (!parent) return;
                if (queue.length >= 20) queue.shift();
                queue.push({ item, parent, generation, cancelled: false, cleanups: [] });
                void pump();
            },
            clear() {
                generation++;
                queue.length = 0;
                if (active) {
                    active.cancelled = true;
                    active.finish?.();
                    active.layer?.remove();
                    active = null;
                }
            }
        };
    };
}());
