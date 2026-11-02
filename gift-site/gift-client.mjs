import {renderRows,pageLabel,legsText} from './render.mjs?v=20261101-24';
import {patchRows} from './table-patch.mjs?v=20261101-24';
import {createGiftRequests} from './requests.mjs?v=20261101-24';
import {createDatePicker} from './date-picker.mjs?v=20261101-24';
const $=id=>document.getElementById(id),initial=JSON.parse($('bootstrap').textContent),requests=createGiftRequests();
let state={view:'members',page:1,...initial.filters},data=initial,detail=null,sequence=0,detailSequence=0,requestAbort,detailAbort,statusAbort,loading=false,mainBusy=false,detailBusy=false,pollTimer,pollSequence=0,failures=0;
const mainCursors=new Map(),signatures=new WeakMap();
const currentFilters=()=>Object.fromEntries(Object.entries(state).filter(([k,v])=>['q','member','user','unknownUser','gift','group','team','room','since','until','sort'].includes(k)&&v!==''));
const context=()=>JSON.stringify([state.view,currentFilters(),state.page]);let renderedContext;
function syncReset(){$('reset').hidden=!Object.entries(currentFilters()).some(([k,v])=>k!=='sort'||v!=='legs');}
function url(filters){const params=new URLSearchParams({...filters,dataOnly:1});params.sort();return '/api/gift/dashboard?'+params;}
function cursorFor(view,page,cursors){return view==='events'&&page>1?cursors.get(page)||{}:{};}
function markup(result,view,head,body,context){
    const signature=JSON.stringify([view,context,result.items]),target=$(body);if(signatures.get(target)===signature)return;
    const r=renderRows(result,view,{hideCount:body==='detail-body'&&['members','users'].includes(view)});if($(head).innerHTML!==r.head)$(head).innerHTML=r.head;
    patchRows(target,r.body,result.items.map(row=>view==='events'?row.key:row.id),{context});signatures.set(target,signature);
}
function drawStatus(s={}){
    $('status').textContent=s.preview?'预览样本':s.error?'采集等待重试':s.retrying?`${s.retrying} 间重试中`:s.running&&s.heartbeatAt&&Date.now()-s.heartbeatAt>30000?'采集状态待更新':s.running?'':'采集已暂停';
    $('coverage').textContent=s.preview?`样本覆盖 ${data.summary.rooms} 间房间`:s.total?`历史 ${s.complete||0}/${s.total}${s.realtime?.connected?` · 实时 ${s.realtime.subscribed} 间`:''}${s.unavailable?` · ${s.unavailable} 间不可读取`:''}`:'等待房间目录';
    $('coverage-compact').textContent=s.preview?'预览样本':s.total?`历史 ${s.complete||0}/${s.total}`:'等待目录';
    $('coverage').parentElement.title=[$('status').textContent,$('coverage').textContent].filter(Boolean).join(' · ');
    $('notice').hidden=!s.preview;if(s.preview)$('notice').textContent='本地预览 · 当前为已导出历史中的样本，尚未运行全房间采集';
}
function draw(result){
    renderedContext=context();
    data=result;markup(result,state.view,'head','body',JSON.stringify([state.view,currentFilters(),state.page]));
    $('table').className=state.view;for(const k of ['quantity','users','records'])$(k).textContent=result.summary[k];
    $('legs').textContent=legsText(result.summary);$('price-note').textContent=result.summary.unpriced?`另有 ${result.summary.unpriced} 条记录待核价，“+”表示当前仅合计已核价礼物。`:'';
    $('page-label').textContent=pageLabel({...result,view:state.view});$('previous').disabled=result.page<=1;$('next').disabled=result.page*result.limit>=result.total||state.view==='events'&&!result.items.length;
    $('pagination').hidden=state.view==='members';
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===state.view));
    if(result.status)drawStatus(result.status);if(result.nextCursor)mainCursors.set(result.page+1,result.nextCursor);
    syncReset();
}
async function load({background=false}={}){
    if(background&&mainBusy)return;const seq=++sequence;mainBusy=true;loading=!background;requestAbort?.abort();requestAbort=new AbortController();
    if(!background){$('read-status').textContent='筛选中…';$('table').setAttribute('aria-busy','true');$('error').hidden=true;}
    try{const result=await requests.get(url({...currentFilters(),...cursorFor(state.view,state.page,mainCursors),view:state.view,page:state.page,...state.view==='members'?{all:1}:{}}),requestAbort.signal,{background});if(seq!==sequence)return;draw(result);$('error').hidden=true;return true;}
    catch(e){if(e.name!=='AbortError'&&seq===sequence){$('error').textContent=e.message+(renderedContext!==context()?'；当前显示上次成功读取的结果':'');$('error').hidden=false;return false;}}
    finally{if(seq===sequence){loading=false;mainBusy=false;$('read-status').textContent='';$('table').removeAttribute('aria-busy');}}
}
function change(){mainCursors.clear();state.page=1;syncReset();void load();}
for(const id of ['room','group','team'])$(id).addEventListener('change',()=>{state[id]=$(id).value;change();});
const dates=createDatePicker({since:$('since'),until:$('until'),filters:state,onChange:()=>{for(const id of ['since','until'])state[id]=$(id).value?Date.parse($(id).value+'T00:00:00+08:00')+(id==='until'?86400000:0):'';change();}});
let debounce;$('q').addEventListener('input',()=>{clearTimeout(debounce);requestAbort?.abort();debounce=setTimeout(()=>{state.q=$('q').value.trim();change();},300);});
$('reset').addEventListener('click',()=>{state={view:state.view,page:1};for(const id of ['q','room','group','team','since','until'])$(id).value='';dates.sync();change();});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;change();}));
for(const[id,delta]of [['previous',-1],['next',1]])$(id).onclick=()=>{state.page+=delta;void load();};
function makeDetail(row,view){return{filters:{...currentFilters(),[view==='members'?'member':view==='users'?(row.userId?'user':'unknownUser'):'gift']:view==='users'?(row.userId||row.name):row.id},view:view==='members'?'users':view==='users'?'members':'events',page:1,name:row.name,cursors:new Map()};}
async function loadDetail({background=false}={}){
    if(!detail||!$('details').open||background&&detailBusy)return;
    const seq=++detailSequence;detailBusy=true;detailAbort?.abort();detailAbort=new AbortController();const d=detail;
    const context=JSON.stringify([d.view,d.filters,d.page]),same=d.renderedContext===context;
    if(!d.data){signatures.delete($('detail-body'));const skeleton=renderRows({items:[],page:d.page,limit:10},d.view,{hideCount:['members','users'].includes(d.view)});$('detail-table').className=d.view;$('detail-head').innerHTML=skeleton.head;
        $('detail-body').innerHTML=`<tr><td class="empty" colspan="${skeleton.head.match(/<th\b/g).length}">读取中…</td></tr>`;$('detail-page-label').textContent='';}
    $('detail-status').textContent=background?'':'更新中…';if(!background){$('detail-previous').disabled=true;$('detail-next').disabled=true;}
    try{
        const result=await requests.get(url({...d.filters,...cursorFor(d.view,d.page,d.cursors),view:d.view,page:d.page,limit:10}),detailAbort.signal,{background});
        if(seq!==detailSequence||!$('details').open)return;d.data=result;d.renderedContext=context;d.rendered={view:d.view,page:d.page,filters:{...d.filters}};
        $('detail-table').className=d.view;markup(result,d.view,'detail-head','detail-body',context);
        $('detail-page-label').textContent=pageLabel({...result,view:d.view});$('detail-previous').disabled=d.page<=1;$('detail-next').disabled=d.page*result.limit>=result.total||d.view==='events'&&!result.items.length;
        if(result.nextCursor)d.cursors.set(result.page+1,result.nextCursor);$('detail-status').textContent='';return true;
    }catch(e){if(e.name!=='AbortError'&&seq===detailSequence){
        $('detail-status').textContent=d.data?'更新失败，保留已有数据':'';
        if(!d.data){const columns=$('detail-head').querySelectorAll('th').length;$('detail-body').innerHTML=`<tr><td class="empty" colspan="${columns}">暂时无法读取 <button class="detail" data-retry-detail>重试</button></td></tr>`;}
        if(d.data&&!same){Object.assign(d,{...d.rendered,filters:{...d.rendered.filters}});$('detail-title').textContent=d.name+' · '+(d.view==='users'?'送礼用户':d.view==='members'?'成员排行':'礼物记录');$('detail-filter').hidden=d.view==='events';}
        $('detail-previous').disabled=!d.data||d.page<=1;$('detail-next').disabled=!d.data||d.page*d.data.limit>=d.data.total;return false;
    }}finally{if(seq===detailSequence)detailBusy=false;}
}
$('body').addEventListener('click',e=>{const b=e.target.closest('[data-detail]');if(!b||loading||renderedContext!==context())return;const row=data.items[Number(b.dataset.detail)];detail=makeDetail(row,state.view);
    $('detail-title').textContent=row.name+' · '+(detail.view==='users'?'送礼用户':detail.view==='members'?'成员排行':'礼物记录');$('detail-filter').textContent=state.sort==='quantity'?'按礼物数量排序':'按鸡腿排序';$('detail-filter').hidden=detail.view==='events';$('details').showModal();void loadDetail();});
for(const[id,delta]of [['detail-previous',-1],['detail-next',1]])$(id).onclick=()=>{detail.page+=delta;void loadDetail();};
$('detail-body').addEventListener('click',e=>{
    if(e.target.closest('[data-retry-detail]'))return void loadDetail();const b=e.target.closest('[data-detail]');if(!b||!detail.data||detailBusy&&detail.renderedContext!==JSON.stringify([detail.view,detail.filters,detail.page]))return;
    const r=detail.data.items[Number(b.dataset.detail)];detail.filters[detail.view==='users'?(r.userId?'user':'unknownUser'):'member']=detail.view==='users'?(r.userId||r.name):r.id;
    detail.view='events';detail.page=1;detail.cursors.clear();$('detail-title').textContent=detail.name+' · 礼物记录';$('detail-filter').hidden=true;void loadDetail();
});
$('detail-events').onclick=()=>{state={...detail.filters,view:'events',page:1};mainCursors.clear();$('details').close();void load();};
$('close').onclick=()=>$('details').close();$('details').addEventListener('close',()=>{detailAbort?.abort();detailSequence++;detailBusy=false;});
for(const id of ['details','profile-window'])$(id).addEventListener('click',e=>{if(e.target!==$(id))return;const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();});
document.addEventListener('click',e=>{const a=e.target.closest('[data-profile]');if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();$('profile-frame').src='/vote/assets/profile.html?'+new URLSearchParams({user:a.dataset.profile,name:a.dataset.name,member:a.dataset.member});$('profile-window').showModal();});
$('profile-window').addEventListener('close',()=>{$('profile-frame').src='about:blank';});
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===$('profile-frame').contentWindow&&e.data?.type==='yaya-vote-profile-close')$('profile-window').close();});
$('theme').onclick=()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{const s=JSON.parse(localStorage.getItem('yaya_web_settings')||'{}');s.theme=theme;localStorage.setItem('yaya_web_settings',JSON.stringify(s));localStorage.setItem('theme',theme);}catch{}};
for(const[id,key]of [['group','groups'],['team','teams']])for(const name of initial.options?.[key]||[]){const o=document.createElement('option');o.value=name;o.textContent=name;$(id).append(o);}
async function refresh(){
    const poll=++pollSequence;clearTimeout(pollTimer);if(document.hidden||$('profile-window').open){pollTimer=setTimeout(refresh,15000);return;}
    statusAbort?.abort();statusAbort=new AbortController();
    const results=await Promise.allSettled([requests.get('/api/gift/status',statusAbort.signal).then(drawStatus),$('details').open?loadDetail({background:true}):load({background:true})]);
    if(poll!==pollSequence)return;const failed=results.some(r=>r.status==='rejected'||r.value===false);failures=failed?Math.min(2,failures+1):0;pollTimer=setTimeout(refresh,15000*2**failures);
}
draw(initial);pollTimer=setTimeout(refresh,15000);
document.addEventListener('visibilitychange',()=>{if(document.hidden){pollSequence++;clearTimeout(pollTimer);requestAbort?.abort();detailAbort?.abort();statusAbort?.abort();}else void refresh();});
