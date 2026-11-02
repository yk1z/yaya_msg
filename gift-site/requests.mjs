export function createGiftRequests({fetcher=fetch,maxEntries=48,timeoutMs=20000}={}){
    const cache=new Map();
    async function get(url,signal,{background=false}={}){
        const cached=cache.get(url),controller=new AbortController();let timedOut=false;
        const cancel=()=>controller.abort();if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
        const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
        try{
            const r=await fetcher(url,{cache:'no-store',headers:{...(cached?.etag?{'If-None-Match':cached.etag}:{}),...(background?{'X-Gift-Background':'1'}:{})},signal:controller.signal});
            if(r.status===304&&cached)return cached.value;
            if(!r.ok){let message='暂时无法更新数据';try{message=(await r.json()).message||message;}catch{}throw Error(message);}
            const value=await r.json(),etag=r.headers.get('etag');
            if(etag){cache.delete(url);if(cache.size>=maxEntries)cache.delete(cache.keys().next().value);cache.set(url,{etag,value});}
            return value;
        }catch(e){if(timedOut)throw Error('读取超时，稍后自动重试');throw e;}
        finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    }
    return{get};
}
