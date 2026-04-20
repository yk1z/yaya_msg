const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const wasmInit = require('../../../rust-wasm.js');

const { __x6c2adf8__ } = wasmInit;

let wasmInitialized = false;

async function ensureWasmLoaded() {
    if (wasmInitialized) {
        return;
    }

    try {
        const wasmName = '2.wasm';
        const wasmPath = app.isPackaged
            ? path.join(process.resourcesPath, wasmName)
            : path.join(__dirname, '../../../2.wasm');

        if (!fs.existsSync(wasmPath)) {
            console.error('WASM 文件未找到:', wasmPath);
            return;
        }

        const wasmBuffer = fs.readFileSync(wasmPath);
        await wasmInit.default(wasmBuffer);
        wasmInitialized = true;
        console.log('WASM 模块加载成功');
    } catch (error) {
        console.error('WASM 加载失败:', error);
    }
}

function generatePa() {
    if (!wasmInitialized) {
        return null;
    }

    try {
        return __x6c2adf8__();
    } catch (error) {
        console.error('生成 PA 失败:', error);
        return null;
    }
}

module.exports = {
    ensureWasmLoaded,
    generatePa
};
