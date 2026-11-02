// Generated from rust-wasm-browser.js and server/vote/profile-client.js.
const profileSigning=(()=>{
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
                if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
                    return globalThis.crypto.getRandomValues(array);
                }
                if (typeof require === 'function') {
                    try {
                        return require('crypto').randomFillSync(array);
                    } catch (e) {
                    }
                }
                throw new Error('Crypto API not available');
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
        const source = getStringFromWasm0(arg0, arg1).trim(); if (!/^return this;?$/.test(source)) throw new Error('Unsupported global accessor'); return addHeapObject(() => globalThis);
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

    if (module_or_path instanceof ArrayBuffer || module_or_path instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(module_or_path))) {
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


return {default: __wbg_init, __x6c2adf8__};

})();
(() => {
'use strict';
const params=new URLSearchParams(location.search),userId=params.get('user')||'',name=params.get('name')||'口袋用户',member=params.get('member')==='1';
const modal=document.getElementById('followedUserProfileModal'),body=document.getElementById('followed-user-profile-body');
const notifyClose=()=>parent.postMessage({type:'yaya-vote-profile-close'},location.origin);
const token=()=>{try{return String(JSON.parse(localStorage.getItem('yaya_web_settings')||'{}').yaya_p48_token||localStorage.getItem('yaya_p48_token')||'').trim()}catch{return ''}};
let messageTimer;
const toast=text=>{const el=document.getElementById('profile-message');el.textContent=String(text||'');el.hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>el.hidden=true,3500)};
let signingPromise;
async function signingReady(){if(window.getPA)return;if(!signingPromise)signingPromise=Promise.resolve(profileSigning).then(async runtime=>{const response=await fetch('/2.wasm');if(!response.ok)throw Error('签名组件加载失败');await runtime.default(await response.arrayBuffer());window.getPA=runtime.__x6c2adf8__}).catch(error=>{signingPromise=null;throw error});return signingPromise}
const invoke=async(channel,payload={})=>{await signingReady();const response=await fetch('/api/ipc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,payload:{...payload,pa:window.getPA()}}),signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('读取失败，请稍后重试');return response.json()};
const external=path=>window.open(path,'_blank','noopener,noreferrer');
let currentAccountId='',accountPromise;
function currentAccount(){if(currentAccountId)return Promise.resolve();if(!accountPromise)accountPromise=invoke('login-check-token',{token:token()}).then(result=>{const user=result?.userInfo?.baseUserInfo||result?.userInfo||{};const id=String(user.userId||user.id||'');if(result?.success&&/^\d{1,32}$/.test(id))currentAccountId=id}).catch(()=>{}).finally(()=>accountPromise=null);return accountPromise}
window.desktop={platform:'web'};
window.YayaRendererUtils={t:text=>text,reportIgnoredError:()=>{}};
const player=(tag,src)=>{const el=document.createElement(tag);el.src=src;el.controls=true;return el};
const feature=window.YayaRendererFeatures?.createFollowedChatFeature?.({
 ipcRenderer:{invoke,on:()=>{}},getAppToken:token,getCurrentUserId:()=>currentAccountId,getMemberData:()=>[],loadMemberData:async()=>[],
 getOptimizedThumbUrl:url=>url,showToast:toast,showConfirm:(text,confirmed)=>{const accepted=window.confirm(String(text));if(accepted&&typeof confirmed==='function')confirmed();return accepted},
 createCustomVideoPlayer:src=>player('video',src),createCustomAudioPlayer:src=>player('audio',src),
 playLiveStream:()=>toast('网页版暂不支持实时直播，请使用客户端观看'),setMediaReturnView:()=>{},
 switchView:()=>{},fetchPocketAPI:async(path,data)=>{const response=await fetch('/api/pocket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,postData:data}),signal:AbortSignal.timeout(25000)});return response.json()}
});
if(feature)Object.assign(window,feature);
window.openFollowedProfilePrivateMessage=id=>{const value=String(id||'').trim();if(!/^\d{1,32}$/.test(value))return;if(document.querySelector('.followed-member-profile'))external('/send/'+encodeURIComponent(value));else toast('网页版暂不支持私信，请使用客户端')};
window.openPrivateMessageDetail=window.openFollowedProfilePrivateMessage;
window.toggleFollowedProfileDynamicComments=async postId=>{await currentAccount();feature.toggleFollowedProfileDynamicComments(postId)};
let roomMembersPromise,openingRoom=false;
function roomMembers(data){return (Array.isArray(data)?data:[...(Array.isArray(data?.roomId)?data.roomId:[]),...(Array.isArray(data?.members)?data.members:[]),...(Array.isArray(data?.retired)?data.retired:[])]).filter(row=>row&&typeof row==='object')}
function loadRoomMembers(){if(!roomMembersPromise)roomMembersPromise=fetch('https://data.gnz.hk/members.json',{signal:AbortSignal.timeout(15000)}).then(response=>{if(!response.ok)throw Error('读取成员失败');return response.json()}).then(roomMembers).catch(error=>{roomMembersPromise=null;throw error});return roomMembersPromise}
window.openFollowedProfileRoom=async id=>{
 const targetId=String(id||'').trim();if(!/^\d{1,32}$/.test(targetId)||openingRoom)return;
 openingRoom=true;
 // Reserve the tab during the user's click, before waiting for the member list.
 let next;try{next=window.open('about:blank','_blank');if(next)next.opener=null}catch{}
 try{
  const members=await loadRoomMembers();
  const room=members.find(row=>[row.id,row.userId,row.memberId].some(value=>String(value??'').trim()===targetId)&&/^[1-9]\d{0,31}$/.test(String(row.channelId||'').trim()));
  if(!room){next?.close();toast('没有找到对应口袋房间');return}
  const path='/room/'+encodeURIComponent(String(room.channelId).trim());
  if(next&&!next.closed)next.location.replace(path);else window.top.location.assign(path);
 }catch{next?.close();toast('读取房间失败，请稍后重试')}finally{openingRoom=false}
};
window.playSharedLiveFromMessage=async id=>{
 const liveId=String(id||'').trim();if(!/^[a-z0-9_-]{1,128}$/i.test(liveId))return;
 let next;try{next=window.open('about:blank','_blank');if(next)next.opener=null}catch{}
 let live=false;
 try{const result=await invoke('fetch-live-list',{token:token(),record:false,next:0,groupId:0,debug:true});live=Array.isArray(result?.content?.liveList)&&result.content.liveList.some(item=>String(item.liveId||item.id)===liveId)}catch{}
 if(live){next?.close();toast('这场正在直播，网页版暂不支持实时直播，请使用客户端观看');return}
 const path='/vod/'+encodeURIComponent(liveId);
 if(next&&!next.closed)next.location.replace(path);else window.top.location.assign(path);
};
window.openImageModal=url=>{const parsed=new URL(url,location.origin);if(!['http:','https:'].includes(parsed.protocol))return;document.querySelector('.profile-image-viewer')?.remove();const viewer=document.createElement('div'),image=document.createElement('img'),close=document.createElement('button');viewer.className='profile-image-viewer';viewer.setAttribute('role','dialog');viewer.setAttribute('aria-label','图片预览');image.src=parsed.href;image.alt='主页图片';close.textContent='×';close.setAttribute('aria-label','关闭图片');viewer.append(image,close);viewer.addEventListener('click',()=>viewer.remove());document.body.append(viewer);close.focus()};
new MutationObserver(()=>{if(modal.style.display==='none')notifyClose()}).observe(modal,{attributes:true,attributeFilter:['style']});
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const image=document.querySelector('.profile-image-viewer'),video=document.getElementById('followedProfileVideoModal');if(image)image.remove();else if(video?.style.display==='flex')feature.closeFollowedProfileVideo();else notifyClose()});
function login(){modal.style.display='flex';body.innerHTML='<div class="profile-login"><button class="followed-profile-back-btn" aria-label="关闭用户主页">‹</button><span>登录后查看用户主页</span><a href="/login" target="_blank" rel="noopener noreferrer">登录账号</a><button id="profile-retry">已登录，重试</button></div>';body.querySelector('.followed-profile-back-btn').addEventListener('click',notifyClose);document.getElementById('profile-retry').addEventListener('click',open)}
async function open(){if(!/^\d{1,32}$/.test(userId))return;if(!feature){modal.style.display='flex';body.textContent='用户主页组件未能载入，请关闭后重试';return}if(!token())return login();try{await signingReady();await feature.openFollowedUserProfile(userId,name,'',member,{pushHistory:false})}catch(error){modal.style.display='flex';body.textContent='用户主页加载失败：'+String(error.message||'请稍后重试')}}
open();
})();
