        import init, { __x6c2adf8__ } from '../../rust-wasm-browser.js';
        window.isWasmReady = false;

        function loadLocalWasmBytes() {
            const desktop = window.desktop;
            if (!desktop || !desktop.fs || !desktop.path || !desktop.appDir) {
                return null;
            }

            const wasmPath = desktop.path.join(desktop.appDir, '2.wasm');
            const bytes = desktop.fs.readFileSync(wasmPath);
            return new Uint8Array(bytes);
        }

        async function initSDK() {
            try {
                const localBytes = loadLocalWasmBytes();
                if (localBytes) {
                    await init(localBytes);
                } else {
                    const wasmResponse = await fetch(new URL('../../2.wasm', import.meta.url));
                    await init(wasmResponse);
                }
                window.isWasmReady = true;
                console.log("✅ SDK 加载成功");
            } catch (e) {
                console.error("SDK Error:", e);
            }
        }
        window.getPA = function () {
            return window.isWasmReady ? __x6c2adf8__() : null;
        };
        initSDK();
