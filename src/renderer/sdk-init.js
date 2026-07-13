        import * as wasmSdk from '../../rust-wasm-browser.js';

        const init = wasmSdk.default;
        const __x6c2adf8__ = wasmSdk.__x6c2adf8__;
        window.isWasmReady = false;

        function loadLocalWasmBytes() {
            const desktop = window.desktop;
            if (!desktop || !desktop.fs || !desktop.path || !desktop.appDir) {
                return null;
            }

            const candidates = [
                desktop.path.join(desktop.appDir, '2.wasm'),
                desktop.path.join(desktop.appDir, '..', '2.wasm')
            ];
            for (const wasmPath of candidates) {
                try {
                    if (desktop.fs.existsSync && !desktop.fs.existsSync(wasmPath)) {
                        continue;
                    }
                    const bytes = desktop.fs.readFileSync(wasmPath);
                    return new Uint8Array(bytes);
                } catch (error) {
                    console.warn('WASM 本地路径不可用:', wasmPath, error);
                }
            }
            return null;
        }

        async function initSDK() {
            try {
                if (typeof init !== 'function' || typeof __x6c2adf8__ !== 'function') {
                    throw new Error('WASM SDK 导出不可用');
                }
                const localBytes = loadLocalWasmBytes();
                if (localBytes) {
                    await init(localBytes);
                } else {
                    const wasmResponse = await fetch(new URL('../../2.wasm', import.meta.url));
                    await init(wasmResponse);
                }
                window.isWasmReady = true;
                console.log("SDK 加载成功");
            } catch (e) {
                console.error("SDK Error:", e);
            }
        }
        window.getPA = function () {
            return window.isWasmReady && typeof __x6c2adf8__ === 'function' ? __x6c2adf8__() : null;
        };
        window.yayaWasmReadyPromise = initSDK();
