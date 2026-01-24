let wasm;

const heap = new Array(128).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let heap_next = heap.length;

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];
    heap[idx] = obj;
    return idx;
}

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } });

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

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

function isLikeNone(x) {
    return x === undefined || x === null;
}

function __x6c2adf8__() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.__x6c2adf8__();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_exn_store(addHeapObject(e));
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("Falling back to `WebAssembly.instantiate`");
                } else {
                    throw e;
                }
            }
        }
        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);
        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};

    imports.wbg.__wbg_buffer_609cc3eee51ed158 = function (arg0) {
        const ret = getObject(arg0);
        return ret ? ret.buffer : wasm.memory.buffer;
    };

    imports.wbg.__wbg_call_672a4d21634d4a24 = function () {
        return handleError(function (arg0, arg1) {
            return getObject(arg0).call(getObject(arg1));
        }, arguments)
    };
    imports.wbg.__wbg_call_7cccdd69e0791ae2 = function () {
        return handleError(function (arg0, arg1, arg2) {
            return getObject(arg0).call(getObject(arg1), getObject(arg2));
        }, arguments)
    };

    imports.wbg.__wbg_crypto_ed58b8e10a292839 = function (arg0) {
        return addHeapObject({
            getRandomValues: function (array) {
                try {
                    require('crypto').randomFillSync(array);
                } catch (e) {
                    throw new Error('Node crypto module not found');
                }
            }
        });
    };
    imports.wbg.__wbg_getRandomValues_bcb4912f16000dc4 = function () {
        return handleError(function (arg0, arg1) {
            getObject(arg0).getRandomValues(getObject(arg1));
        }, arguments)
    };

    imports.wbg.__wbg_getTime_46267b1c24877e30 = function (arg0) {
        return getObject(arg0).getTime();
    };
    imports.wbg.__wbg_msCrypto_0a36e2ec3a343d26 = function (arg0) {
        return getObject(arg0).msCrypto;
    };
    imports.wbg.__wbg_new0_f788a2397c7ca929 = function () {
        return addHeapObject(new Date());
    };

    imports.wbg.__wbg_new_a12002a7f91c75be = function (arg0) {
        const buffer = getObject(arg0) || wasm.memory.buffer;
        return addHeapObject(new Uint8Array(buffer));
    };

    imports.wbg.__wbg_newnoargs_105ed471475aaf50 = function (arg0, arg1) {
        return addHeapObject(new Function(getStringFromWasm0(arg0, arg1)));
    };
    imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function (arg0, arg1, arg2) {
        const buffer = getObject(arg0) || wasm.memory.buffer;
        return addHeapObject(new Uint8Array(buffer, arg1 >>> 0, arg2 >>> 0));
    };

    imports.wbg.__wbg_newwithlength_a381634e90c276d4 = function (arg0) {
        return addHeapObject(new Uint8Array(arg0 >>> 0));
    };
    imports.wbg.__wbg_node_02999533c4ea02e3 = function (arg0) {
        return getObject(arg0).node;
    };

    imports.wbg.__wbg_process_5c1d670bc53614b8 = function (arg0) {
        return addHeapObject(process);
    };

    imports.wbg.__wbg_randomFillSync_ab2cfe79ebbf2740 = function () {
        return handleError(function (arg0, arg1) {
            getObject(arg0).randomFillSync(getObject(arg1));
        }, arguments)
    };
    imports.wbg.__wbg_require_79b1e9274cde3c87 = function () {
        return handleError(function () {
            return addHeapObject(module.require);
        }, arguments)
    };

    imports.wbg.__wbg_set_65595bdd868b3009 = function (arg0, arg1, arg2) {
        const dest = getObject(arg0);
        const src = getObject(arg1);
        const offset = arg2 >>> 0;

        if (dest.length === 0 && src.length > 0) {
            const memoryView = new Uint8Array(wasm.memory.buffer);
            memoryView.set(src, offset);
        } else {
            dest.set(src, offset);
        }
    };

    imports.wbg.__wbg_static_accessor_GLOBAL_88a902d13a557d07 = function () {
        const ret = typeof global === 'undefined' ? null : global;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0 = function () {
        const ret = typeof globalThis === 'undefined' ? null : globalThis;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };
    imports.wbg.__wbg_static_accessor_SELF_37c5d418e4bf5819 = function () {
        const ret = typeof self === 'undefined' ? null : self;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };
    imports.wbg.__wbg_static_accessor_WINDOW_5de37043a91a9c40 = function () {
        const ret = typeof window === 'undefined' ? null : window;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };
    imports.wbg.__wbg_subarray_aa9065fa9dc5df96 = function (arg0, arg1, arg2) {
        return addHeapObject(getObject(arg0).subarray(arg1 >>> 0, arg2 >>> 0));
    };
    imports.wbg.__wbg_versions_c71aa1626a93e0a1 = function (arg0) {
        return getObject(arg0).versions;
    };
    imports.wbg.__wbindgen_init_externref_table = function () {
        const table = wasm.__wbindgen_export_2;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
    };
    imports.wbg.__wbindgen_is_function = function (arg0) {
        return typeof (getObject(arg0)) === 'function';
    };
    imports.wbg.__wbindgen_is_object = function (arg0) {
        const val = getObject(arg0);
        return typeof (val) === 'object' && val !== null;
    };
    imports.wbg.__wbindgen_is_string = function (arg0) {
        return typeof (getObject(arg0)) === 'string';
    };
    imports.wbg.__wbindgen_is_undefined = function (arg0) {
        return getObject(arg0) === undefined;
    };
    imports.wbg.__wbindgen_memory = function () {
        return wasm.memory;
    };
    imports.wbg.__wbindgen_string_new = function (arg0, arg1) {
        return getStringFromWasm0(arg0, arg1);
    };
    imports.wbg.__wbindgen_throw = function (arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'undefined') {
        module_or_path = '2.wasm';
    }

    let instance;
    let module;

    if (module_or_path instanceof ArrayBuffer || module_or_path instanceof Uint8Array || Buffer.isBuffer(module_or_path)) {
        const res = await WebAssembly.instantiate(module_or_path, imports);
        instance = res.instance;
        module = res.module;
    } else {
        const { instance: i, module: m } = await __wbg_load(await module_or_path, imports);
        instance = i;
        module = m;
    }

    return __wbg_finalize_init(instance, module);
}

module.exports = {
    default: __wbg_init,
    __x6c2adf8__
};