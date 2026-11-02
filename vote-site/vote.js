(() => {
'use strict';
const $=id=>document.getElementById(id),fmt=v=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:6,useGrouping:false}).format(Number(v)||0),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scoreNumber=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:6,useGrouping:false}),scoreFmt=v=>scoreNumber.format(Number(v)||0);
function profileName(name,value,member=false){const id=String(value??'').trim(),label=esc(name);return /^\d{1,32}$/.test(id)?`<a class="name profile-link" href="/profile/${id}" data-profile-id="${id}" data-profile-member="${member?'1':'0'}" aria-label="查看 ${label} 的用户主页">${label}</a>`:`<span class="name">${label}</span>`;}
function userIdentity(row){const avatar=String(row.avatar||''),initial=Array.from(String(row.name||'?'))[0]||'?',id=String(row.userId??'').trim(),linked=/^\d{1,32}$/.test(id),tag=linked?'a':'span',attributes=linked?` href="/profile/${id}" data-profile-id="${id}" data-profile-member="0" data-profile-name="${esc(row.name)}" aria-label="查看 ${esc(row.name)} 的用户主页（头像）"`:' aria-hidden="true"';return `<div class="user-identity"><${tag} class="user-avatar${linked?' profile-link':''}"${attributes}><span aria-hidden="true">${esc(initial)}</span>${/^https:\/\//.test(avatar)?`<img src="${esc(avatar)}" alt="" width="34" height="34" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}</${tag}><div class="user-identity-text">${profileName(row.name,row.userId)}<span class="sub">${esc(row.userId||'未提供')}</span></div></div>`;}
const teamClasses={SII:'sii',NII:'nii',HII:'hii',X:'x',B:'b',E:'e',G:'g',NIII:'niii',Z:'z',C:'c',K:'k',CII:'cii',GII:'gii',IDFT:'idft','预备生':'prep'};
function teamCard(row){const team=String(row.team||'').trim(),color=teamClasses[team.toUpperCase().replace(/^TEAM\s+/,'')];return team?`<span class="team-tag${row.teamInactive?' inactive':color?' team-colored team-'+color:''}">${esc(team)}</span>`:'';}
const state={source:'',group:'',team:'',q:'',view:'members',page:1,member:'',memberName:'',user:'',userName:'',loading:false,revision:0,rows:[],detail:{mode:'member',member:'',user:'',name:'',page:1,q:'',rows:[]}};
const day=t=>new Date(t).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
const clock=t=>new Date(t).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
const responses=new Map();let pollTimer,failureCount=0,activeRequest,initialReady=false,renderedView,mainSignature,mainContext,detailSignature,detailContext;
const tableRows=new WeakMap();
function requestUrl(route,filters={}){const query=new URLSearchParams(Object.entries(filters).filter(([,v])=>v!==''));query.sort();return '/api/vote/'+route+'?'+query;}
function syncNode(node,next){
if(node.nodeType===3){if(node.nodeValue!==next.nodeValue)node.nodeValue=next.nodeValue;return;}
for(const attribute of [...node.attributes])if(!next.hasAttribute(attribute.name))node.removeAttribute(attribute.name);
for(const attribute of [...next.attributes])if(node.getAttribute(attribute.name)!==attribute.value)node.setAttribute(attribute.name,attribute.value);
const current=[...node.childNodes],wanted=[...next.childNodes];
for(let i=0;i<wanted.length;i++){const before=current[i],after=wanted[i];if(!before)node.append(after);else if(before.nodeType!==after.nodeType||before.nodeName!==after.nodeName)node.replaceChild(after,before);else syncNode(before,after);}
for(let i=wanted.length;i<current.length;i++)current[i].remove();
}
function patchTableRows(body,descriptors,{adopt=false,preserve=false}={}){
const previous=tableRows.get(body)||new Map(),next=new Map(),existing=adopt?[...body.children]:[];
let anchor,offset,scroller;
if(preserve){const dialog=body.closest('dialog'),container=body.closest('.table-scroll');scroller=dialog?container:window;const top=dialog?container.getBoundingClientRect().top:0;
if((dialog?container.scrollTop:window.scrollY)>0)for(const {node} of previous.values()){const rect=node.getBoundingClientRect();if(rect.bottom>top){anchor=node;offset=rect.top;break;}}}
const parse=html=>{const template=document.createElement('template');template.innerHTML=html;return template.content.firstElementChild;};
let cursor=body.firstElementChild;
descriptors.forEach(({key,html},index)=>{
let saved=previous.get(key);if(!saved&&existing[index])saved={node:existing[index],html};
if(!saved)saved={node:parse(html),html};else if(saved.html!==html){syncNode(saved.node,parse(html));saved.html=html;}
const node=saved.node;if(node!==cursor)body.insertBefore(node,cursor);else cursor=cursor.nextElementSibling;
next.set(key,saved);
});
const retained=new Set([...next.values()].map(saved=>saved.node));for(const node of [...body.children])if(!retained.has(node))node.remove();
tableRows.set(body,next);
if(anchor?.isConnected&&retained.has(anchor)){const delta=anchor.getBoundingClientRect().top-offset;if(delta){if(scroller===window)window.scrollBy(0,delta);else scroller.scrollTop+=delta;}}
}
async function api(route,filters={}){
const url=requestUrl(route,filters),cached=responses.get(url);
const controller=new AbortController();activeRequest=controller;let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller.abort()},12000);
try{const r=await fetch(url,{cache:'no-store',headers:cached?{'If-None-Match':cached.etag}:{},signal:controller.signal});
if(r.status===304&&cached)return cached.content;if(!r.ok)throw Error('读取失败，请稍后刷新');const data=await r.json();if(!data.success)throw Error(data.message||'读取失败');
const etag=r.headers.get('ETag');if(etag){if(responses.size>=48)responses.delete(responses.keys().next().value);responses.set(url,{etag,content:data.content});}return data.content;
}catch(e){if(timedOut){const error=Error('读取超时，正在重试');error.name='TimeoutError';throw error;}if(controller.signal.aborted){const error=Error('Request canceled');error.name='AbortError';throw error;}throw e;}finally{clearTimeout(timeout);if(activeRequest===controller)activeRequest=null;}}
function filters(){return{source:state.source,group:state.group,team:state.team,q:state.q,member:state.member,user:state.user};}
let renderedTeams;
function teamOptions(teams=[]){const signature=JSON.stringify(teams);if(signature===renderedTeams)return;renderedTeams=signature;$('team').innerHTML='<option value="">全部队伍</option>'+teams.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');$('team').value=state.team;}
function selection(){const values=[];if(state.member)values.push(state.memberName);if(state.user)values.push(state.userName);$('active-filter').hidden=!values.length;$('selection-text').textContent=values.join(' · ');}
function setPage(label,previous,next,data){const pages=Math.max(1,Math.ceil(data.total/data.limit));$(label).textContent=`第 ${data.page} / ${pages} 页 · 共 ${fmt(data.total)} ${label==='detail-page-label'&&state.detail.mode==='user'?'位成员':state.view==='events'&&label==='page-label'?'笔':'人'}`;$(previous).disabled=data.page<=1;$(next).disabled=data.page>=pages;}
function setText(id,value){const node=$(id),text=String(value);if(node.textContent!==text)node.textContent=text;}
function statusView(s){setText('live-label',s.error?'连接异常':s.liveError||s.activeRoomsUnavailable?'部分重试中':'');}
function summaryView(s){setText('room-score',scoreFmt(s.sources.find(x=>x.source==='room')?.score||0));setText('live-score',scoreFmt(s.sources.find(x=>x.source==='live')?.score||0));setText('total-score',scoreFmt(s.score));}
function rowsView(data,{adopt=false}={}){
const context=JSON.stringify([state.view,state.page,filters()]),signature=JSON.stringify([context,data]);if(signature===mainSignature)return;
state.rows=data.items;const events=state.view==='events',members=state.view==='members';const table=$('table-head').closest('table');table.classList.toggle('member-columns',members);table.classList.toggle('members-ranking',members);table.classList.toggle('event-records',events);table.classList.toggle('users-ranking',!members&&!events);$('page-label').closest('.pagination').hidden=state.view==='members';
if(!adopt&&renderedView!==state.view){$('table-head').innerHTML=events?'<tr><th class="time-column">时间</th><th class="user-column">投分用户</th><th class="person-column">成员</th><th class="source-column">来源</th><th class="number score-heading">分数</th><th class="action-column"></th></tr>':'<tr><th class="rank-column">排名</th><th class="person-column">'+(members?'成员':'投分用户')+'</th>'+(members?'<th class="group-column">分团</th><th class="team-column">队伍</th>':'')+'<th class="number">房间</th><th class="number">直播间</th><th class="number score-heading">分数</th><th class="action-column"></th></tr>';
}renderedView=state.view;
const markup=data.items.map((r,i)=>events?`<tr><td class="time">${clock(r.time)}<span class="sub">${day(r.time)}</span></td><td>${userIdentity({name:r.userName,userId:r.userId,avatar:r.userAvatar})}</td><td>${profileName(r.memberName,r.memberId,true)}</td><td><span class="source ${r.source==='live'?'live':''}">${r.source==='live'?'直播间':'房间'}</span></td><td class="number score">${scoreFmt(r.score)}</td><td class="action-column"><button class="detail-link" data-row="${i}">明细</button></td></tr>`:`<tr><td class="rank ${state.page===1&&i<3?'top':''}">${(state.page-1)*data.limit+i+1}</td><td>${members?profileName(r.name,r.id,true):userIdentity(r)}</td>${members?`<td class="group-cell">${esc(r.group)}</td><td class="team-cell">${teamCard(r)}</td>`:''}<td class="number">${scoreFmt(r.roomScore)}</td><td class="number">${scoreFmt(r.liveScore)}</td><td class="number score">${scoreFmt(r.score)}</td><td class="action-column"><button class="detail-link" data-row="${i}">明细</button></td></tr>`);
const descriptors=markup.length?markup.map((html,i)=>({key:JSON.stringify([state.view,events?data.items[i].key:members?data.items[i].id:data.items[i].userId||data.items[i].id]),html})):[{key:'empty',html:`<tr><td colspan="${members?8:6}" class="empty">暂无符合条件的投分记录</td></tr>`}];
patchTableRows($('table-body'),descriptors,{adopt,preserve:context===mainContext});setPage('page-label','previous','next',data);mainContext=context;mainSignature=signature;
}
function detailsView(data){
const context=JSON.stringify([state.detail.mode,state.detail.member,state.detail.user,state.detail.page,state.detail.q,filters()]),signature=JSON.stringify([context,data]);if(signature===detailSignature)return;
const d=state.detail,isUser=d.mode==='user';d.rows=data.items;$('detail-body').closest('table').classList.toggle('member-columns',isUser);$('detail-group-heading').hidden=!isUser;$('detail-team-heading').hidden=!isUser;
const markup=data.items.map((r,i)=>`<tr><td class="rank ${data.page===1&&i<3?'top':''}">${(data.page-1)*data.limit+i+1}</td><td>${isUser?profileName(r.name,r.id,true):userIdentity(r)}</td>${isUser?`<td class="group-cell">${esc(r.group)}</td><td class="team-cell">${teamCard(r)}</td>`:''}<td class="number">${scoreFmt(r.roomScore)}</td><td class="number">${scoreFmt(r.liveScore)}</td><td class="number score">${scoreFmt(r.score)}</td><td class="number">${fmt(r.count)}</td><td class="action-column"><button class="detail-link" data-detail-row="${i}">明细</button></td></tr>`);
const descriptors=markup.length?markup.map((html,i)=>({key:JSON.stringify([isUser?'members':'users',isUser?data.items[i].id:data.items[i].userId||data.items[i].id]),html})):[{key:'empty',html:`<tr><td colspan="${isUser?9:7}" class="empty">暂无符合条件的${isUser?'成员':'投分用户'}</td></tr>`}];
patchTableRows($('detail-body'),descriptors,{preserve:context===detailContext});setPage('detail-page-label','detail-previous','detail-next',data);detailContext=context;detailSignature=signature;
}
async function refresh(){clearTimeout(pollTimer);if(state.loading||document.hidden||navigator.onLine===false)return;state.loading=true;const revision=state.revision;try{
const detail=$('details').open?{...(state.detail.mode==='user'?{detailUser:state.detail.user}:{detailMember:state.detail.member}),detailQ:state.detail.q,detailPage:state.detail.page}:{};
const result=await api('dashboard',{...filters(),view:state.view,page:state.page,limit:20,...(state.view==='members'?{all:1}:{}),...detail});if(revision!==state.revision)return;
statusView(result.status);summaryView(result.summary);teamOptions(result.teams);rowsView(result.data);selection();if($('details').open&&result.detail)detailsView(result.detail);$('error').hidden=true;failureCount=0;
}catch(e){if(e.name!=='AbortError'){failureCount=Math.min(3,failureCount+1);if(revision===state.revision){$('error').textContent=(e.name==='TimeoutError'?'读取超时，正在重试':e.message)+'，已显示的记录会保留。';$('error').hidden=false;$('live-label').textContent='更新中断';}}}
finally{state.loading=false;if(!document.hidden&&navigator.onLine!==false){if(revision!==state.revision)void refresh();else pollTimer=setTimeout(()=>void refresh(),Math.min(30000,5000*2**failureCount));}}}
function changed(reset=true){if(reset)state.page=1;state.revision++;activeRequest?.abort();selection();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===state.view));void refresh();}
function showRecords(member,user,memberName,userName){$('details').close();state.member=member||'';state.user=user||'';state.memberName=memberName||'';state.userName=userName||'';state.q='';$('search').value='';state.view='events';changed();}
function openDetails(row,mode){detailSignature=null;detailContext=null;tableRows.delete($('detail-body'));const isUser=mode==='user';state.detail={mode,member:isUser?state.member:row.id,user:isUser?(row.userId||row.id):state.user,name:row.name,memberName:isUser?state.memberName:row.name,userName:isUser?row.name:state.userName,page:1,q:'',rows:[]};$('detail-title').textContent=row.name+(isUser?' · 成员投分排行':' · 投分明细');$('detail-person-heading').textContent=isUser?'成员':'投分用户';$('detail-group-heading').hidden=!isUser;$('detail-team-heading').hidden=!isUser;$('detail-search').value='';$('detail-search').placeholder=isUser?'搜索成员':'搜索投分用户 / ID';$('detail-search').setAttribute('aria-label',isUser?'搜索该用户投分的成员':'搜索该成员的投分用户');$('detail-body').innerHTML=`<tr><td colspan="${isUser?9:7}" class="empty">加载中…</td></tr>`;$('details').showModal();changed(false);}
$('table-body').addEventListener('click',event=>{const b=event.target.closest('[data-row]');if(!b)return;const row=state.rows[Number(b.dataset.row)];if(state.view==='members')openDetails(row,'member');else if(state.view==='users')openDetails(row,'user');else showRecords(state.member,row.userId,state.memberName,row.userName);});
$('detail-body').addEventListener('click',event=>{const b=event.target.closest('[data-detail-row]');if(!b)return;const d=state.detail,row=d.rows[Number(b.dataset.detailRow)];if(d.mode==='user')showRecords(row.id,d.user,row.name,d.name);else showRecords(d.member,row.userId||row.id,d.name,row.name)});
$('all-records').addEventListener('click',()=>{const d=state.detail;showRecords(d.member,d.user,d.memberName,d.userName)});$('close-detail').addEventListener('click',()=>$('details').close());
$('details').addEventListener('close',()=>{state.revision++;});
$('details').addEventListener('click',e=>{if(e.target===$('details')){const r=$('details').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('details').close();}});
$('source').addEventListener('change',()=>{state.source=$('source').value;changed()});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;changed()}));
let searchTimer,detailTimer;$('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.q=$('search').value.trim();changed()},250)});$('group').addEventListener('change',()=>{state.group=$('group').value;state.team='';$('team').value='';changed()});$('team').addEventListener('change',()=>{state.team=$('team').value;changed()});$('detail-search').addEventListener('input',()=>{clearTimeout(detailTimer);detailTimer=setTimeout(()=>{state.detail.q=$('detail-search').value.trim();state.detail.page=1;changed(false)},250)});
$('clear-filter').addEventListener('click',()=>{state.member='';state.user='';changed()});$('previous').addEventListener('click',()=>{state.page--;changed(false)});$('next').addEventListener('click',()=>{state.page++;changed(false)});$('detail-previous').addEventListener('click',()=>{state.detail.page--;changed(false)});$('detail-next').addEventListener('click',()=>{state.detail.page++;changed(false)});
$('theme-toggle').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{const settings=JSON.parse(localStorage.getItem('yaya_web_settings')||'{}');settings.theme=theme;localStorage.setItem('yaya_web_settings',JSON.stringify(settings));localStorage.setItem('theme',theme)}catch{}});

document.addEventListener('error',event=>{const image=event.target;if(image instanceof HTMLImageElement&&image.parentElement?.classList.contains('user-avatar'))image.remove()},true);
const profileDialog=$('profile-window'),profileFrame=$('profile-frame');
document.addEventListener('click',event=>{const link=event.target.closest('a[data-profile-id]');if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();const query=new URLSearchParams({user:link.dataset.profileId,name:link.dataset.profileName||link.textContent,member:link.dataset.profileMember,v:'20261025-1'});profileFrame.src='/vote/assets/profile.html?'+query;profileDialog.showModal()});
profileDialog.addEventListener('close',()=>{profileFrame.src='about:blank'});
profileDialog.addEventListener('click',event=>{if(event.target!==profileDialog)return;const r=profileDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)profileDialog.close()});
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===profileFrame.contentWindow&&event.data?.type==='yaya-vote-profile-close')profileDialog.close()});
try{const seed=document.getElementById('vote-initial-data');if(seed){const payload=JSON.parse(seed.textContent),initial=payload.content||payload;if(Array.isArray(initial?.data?.items)&&Array.isArray(initial?.summary?.sources)){
rowsView(initial.data,{adopt:!!document.querySelector('table.members-ranking')});renderedTeams=JSON.stringify(initial.teams||[]);initialReady=true;
if(payload.etag)responses.set(requestUrl('dashboard',{...filters(),view:'members',page:1,limit:20,all:1}),{etag:payload.etag,content:initial});
}seed.remove();}}catch{}

document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(pollTimer);activeRequest?.abort();}else void refresh()});window.addEventListener('offline',()=>{clearTimeout(pollTimer);activeRequest?.abort();});window.addEventListener('online',()=>void refresh());window.addEventListener('pagehide',()=>{clearTimeout(pollTimer);activeRequest?.abort();});window.addEventListener('pageshow',event=>{if(event.persisted)void refresh()});if(initialReady)pollTimer=setTimeout(()=>void refresh(),5000);else void refresh();
})();
