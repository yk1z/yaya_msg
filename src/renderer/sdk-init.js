        import init, { __x6c2adf8__ } from '../../rust-wasm-browser.js';
        window.isWasmReady = false;
        async function initSDK() {
            try {
                await init(new URL('../../2.wasm', import.meta.url));
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
