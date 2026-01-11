let wasm;

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        console.error(e);
    }
}

function getImports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_buffer_609cc3eee51ed158 = function(arg0) { return arg0.buffer; };
    imports.wbg.__wbg_call_672a4d21634d4a24 = function() { return handleError(function (arg0, arg1) { return arg0.call(arg1); }, arguments) };
    imports.wbg.__wbg_call_7cccdd69e0791ae2 = function() { return handleError(function (arg0, arg1, arg2) { return arg0.call(arg1, arg2); }, arguments) };
    imports.wbg.__wbg_crypto_ed58b8e10a292839 = function(arg0) { return arg0.crypto; };
    imports.wbg.__wbg_getRandomValues_bcb4912f16000dc4 = function() { return handleError(function (arg0, arg1) { arg0.getRandomValues(arg1); }, arguments) };
    imports.wbg.__wbg_getTime_46267b1c24877e30 = function(arg0) { return arg0.getTime(); };
    imports.wbg.__wbg_msCrypto_0a36e2ec3a343d26 = function(arg0) { return arg0.msCrypto; };
    imports.wbg.__wbg_new0_f788a2397c7ca929 = function() { return new Date(); };
    imports.wbg.__wbg_new_a12002a7f91c75be = function(arg0) { return new Uint8Array(arg0); };
    imports.wbg.__wbg_newnoargs_105ed471475aaf50 = function(arg0, arg1) { return new Function(getStringFromWasm0(arg0, arg1)); };
    imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function(arg0, arg1, arg2) { return new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0); };
    imports.wbg.__wbg_newwithlength_a381634e90c276d4 = function(arg0) { return new Uint8Array(arg0 >>> 0); };
    imports.wbg.__wbg_node_02999533c4ea02e3 = function(arg0) { return arg0.node; };
    imports.wbg.__wbg_process_5c1d670bc53614b8 = function(arg0) { return arg0.process; };
    imports.wbg.__wbg_randomFillSync_ab2cfe79ebbf2740 = function() { return handleError(function (arg0, arg1) { arg0.randomFillSync(arg1); }, arguments) };
    imports.wbg.__wbg_require_79b1e9274cde3c87 = function() { return handleError(function () { return module.require; }, arguments) };
    imports.wbg.__wbg_set_65595bdd868b3009 = function(arg0, arg1, arg2) { arg0.set(arg1, arg2 >>> 0); };
    imports.wbg.__wbg_static_accessor_GLOBAL_88a902d13a557d07 = function() { return typeof global === 'undefined' ? null : global; };
    imports.wbg.__wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0 = function() { return typeof globalThis === 'undefined' ? null : globalThis; };
    imports.wbg.__wbg_static_accessor_SELF_37c5d418e4bf5819 = function() { return typeof self === 'undefined' ? null : self; };
    imports.wbg.__wbg_static_accessor_WINDOW_5de37043a91a9c40 = function() { return typeof window === 'undefined' ? null : window; };
    imports.wbg.__wbg_subarray_aa9065fa9dc5df96 = function(arg0, arg1, arg2) { return arg0.subarray(arg1 >>> 0, arg2 >>> 0); };
    imports.wbg.__wbg_versions_c71aa1626a93e0a1 = function(arg0) { return arg0.versions; };
    imports.wbg.__wbindgen_is_function = function(arg0) { return typeof(arg0) === 'function'; };
    imports.wbg.__wbindgen_is_object = function(arg0) { return typeof(arg0) === 'object' && arg0 !== null; };
    imports.wbg.__wbindgen_is_string = function(arg0) { return typeof(arg0) === 'string'; };
    imports.wbg.__wbindgen_is_undefined = function(arg0) { return arg0 === undefined; };
    imports.wbg.__wbindgen_memory = function() { return wasm.memory; };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) { return getStringFromWasm0(arg0, arg1); };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) { throw new Error(getStringFromWasm0(arg0, arg1)); };

    return imports;
}

export function __x6c2adf8__() {
    try {
        const ret = wasm.__x6c2adf8__();
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
    }
}

async function load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);
        return instance instanceof WebAssembly.Instance ? { instance, module } : instance;
    }
}

export default async function init(input) {
    if (wasm !== undefined) return wasm;
    if (typeof input === 'undefined') input = '2.wasm';
    
    const imports = getImports();

    if (typeof input === 'string' || input instanceof URL) {
        input = fetch(input);
    }

    const { instance } = await load(await input, imports);
    wasm = instance.exports;
    if (wasm.__wbindgen_start) wasm.__wbindgen_start();
    return wasm;
}