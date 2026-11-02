(function (root) {
    'use strict';
    function createDataSync(env) {
        const sources = new Map();
        const intervalMs = 180000;
        const manifestUrl = 'https://data.gnz.hk/data-version.json';
        let manifest = null;
        let manifestPromise = null;
        let manifestController = null;
        let lastManifestAttempt = 0;
        let disposed = false;
        const now = () => env.Date?.now ? env.Date.now() : Date.now();
        const visible = () => env.document?.visibilityState !== 'hidden' && env.navigator?.onLine !== false;
        function readManifest(force = false) {
            if (manifestPromise) return manifestPromise;
            if (!force && manifest) return Promise.resolve(manifest);
            lastManifestAttempt = now();
            const controller = new AbortController();
            manifestController = controller;
            const timer = env.setTimeout(() => controller.abort(), 8000);
            manifestPromise = Promise.resolve().then(() => env.fetch(manifestUrl, { cache: 'no-cache', signal: controller.signal }))
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.json();
                }).then(value => {
                    if (disposed || value?.version !== 1 || !value.files || typeof value.files !== 'object'
                        || !Object.values(value.files).every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash))) throw new Error('Invalid data version');
                    manifest = value;
                    return manifest;
                }).finally(() => { env.clearTimeout(timer); manifestPromise = null; manifestController = null; });
            return manifestPromise;
        }
        function sourceFor(url, validate) {
            const parsed = new URL(url);
            if (parsed.origin !== 'https://data.gnz.hk' || !parsed.pathname.endsWith('.json')) throw new Error('Unsupported data source');
            const key = parsed.origin + parsed.pathname;
            if (!sources.has(key)) sources.set(key, { url: key, listeners: new Set(), lastAttempt: 0, hasValue: false });
            const source = sources.get(key);
            if (validate) source.validate = validate;
            return source;
        }
        function read(url, options = {}) {
            const source = sourceFor(url, options.validate);
            if (source.promise) return source.promise;
            if (!options.force && source.hasValue) return Promise.resolve(source.value);
            if (disposed) return Promise.reject(new Error('Data sync stopped'));
            source.lastAttempt = now();
            const controller = new AbortController();
            source.controller = controller;
            const timer = env.setTimeout(() => controller.abort(), 15000);
            let expectedVersion;
            source.promise = readManifest().catch(() => null).then(version => {
                expectedVersion = version?.files[new URL(source.url).pathname.slice(1)];
                return env.fetch(source.url, { cache: 'no-cache', signal: controller.signal });
            })
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.json();
                }).then(value => {
                    if (disposed || controller.signal.aborted) throw new Error('Data sync stopped');
                    if (value === null || typeof value !== 'object' || (source.validate && !source.validate(value))) throw new Error('Invalid data');
                    source.version = expectedVersion;
                    const signature = JSON.stringify(value);
                    if (!source.hasValue || source.signature !== signature) {
                        source.value = value;
                        source.signature = signature;
                        source.hasValue = true;
                        for (const listener of [...source.listeners]) {
                            try { listener(value); } catch (error) { env.console?.warn('资料更新回调失败', error); }
                        }
                    }
                    return source.value;
                }).finally(() => {
                    env.clearTimeout(timer);
                    source.promise = null;
                    source.controller = null;
                });
            return source.promise;
        }
        function subscribe(url, listener, options = {}) {
            const source = sourceFor(url, options.validate);
            source.listeners.add(listener);
            return () => source.listeners.delete(listener);
        }
        async function check(options = {}) {
            if (disposed || !visible()) return Promise.resolve([]);
            const watched = [...sources.values()].filter(source => source.listeners.size || source.hasValue);
            if (!watched.length) return [];
            const minimumAge = options.wake || options.scheduled ? 30000 : intervalMs;
            if (!options.force && now() - lastManifestAttempt < minimumAge) return [];
            let version;
            try { version = await readManifest(true); } catch (_) { return []; }
            if (disposed) return [];
            return Promise.allSettled(watched.filter(source => {
                const hash = version.files[new URL(source.url).pathname.slice(1)];
                return hash && (!source.hasValue || hash !== source.version);
            }).map(source => read(source.url, { force: true })));
        }
        const wake = () => { void check({ wake: true }); };
        const interval = env.setInterval(() => { void check({ scheduled: true }); }, intervalMs);
        for (const name of ['focus', 'online', 'pageshow', 'yaya:view-changed']) env.addEventListener(name, wake);
        env.document?.addEventListener('visibilitychange', wake);
        function destroy() {
            disposed = true;
            manifestController?.abort();
            env.clearInterval(interval);
            for (const source of sources.values()) source.controller?.abort();
            for (const name of ['focus', 'online', 'pageshow', 'yaya:view-changed']) env.removeEventListener(name, wake);
            env.document?.removeEventListener('visibilitychange', wake);
        }
        return { read, subscribe, check, destroy, peek: url => sourceFor(url).value };
    }
    if (typeof module === 'object' && module.exports) module.exports = { createDataSync };
    if (root?.document) {
        root.YayaDataSync = createDataSync(root);
        root.dispatchEvent(new Event('yaya:data-sync-ready'));
    }
})(typeof window !== 'undefined' ? window : null);
