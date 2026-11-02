// Match the application's message/flip date panel, using the gift page theme.
const dayMs=86400000,pad=n=>String(n).padStart(2,'0');
const dateValue=(year,month,day)=>{const d=new Date(Date.UTC(year,month,day));return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fromTime=time=>new Date(Number(time)+8*3600000).toISOString().slice(0,10);
export function createDatePicker({since,until,filters={},onChange}){
    if(filters.since)since.value=fromTime(filters.since);
    if(filters.until)until.value=fromTime(Number(filters.until)-dayMs);
    const wrapper=document.createElement('div');wrapper.className='gift-date-wrapper';
    since.before(wrapper);wrapper.append(since,until);
    wrapper.insertAdjacentHTML('beforeend',`<button type="button" class="gift-date-trigger" aria-expanded="false" aria-controls="gift-calendar" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/></svg><span>全部日期</span></button><div id="gift-calendar" class="gift-date-popup" role="dialog" aria-label="选择日期范围" hidden><div class="flip-date-panel"><div class="flip-date-field-row"><button type="button" class="flip-date-field-card" data-field="since"><span class="flip-date-field-card-label">起始日期</span><span class="flip-date-field-card-value"></span></button><button type="button" class="flip-date-field-card" data-field="until"><span class="flip-date-field-card-label">结束日期</span><span class="flip-date-field-card-value"></span></button></div><div class="flip-calendar-shell"><div class="flip-calendar-header"><div class="flip-calendar-nav-group"><button type="button" class="flip-calendar-nav flip-calendar-nav-year" data-shift="-12" aria-label="上一年">«</button><button type="button" class="flip-calendar-nav" data-shift="-1" aria-label="上个月">‹</button></div><div class="flip-calendar-title" aria-live="polite"></div><div class="flip-calendar-nav-group"><button type="button" class="flip-calendar-nav" data-shift="1" aria-label="下个月">›</button><button type="button" class="flip-calendar-nav flip-calendar-nav-year" data-shift="12" aria-label="下一年">»</button></div></div><div class="flip-calendar-weekdays">${['一','二','三','四','五','六','日'].map(d=>`<span>${d}</span>`).join('')}</div><div class="flip-calendar-grid"></div><div class="flip-calendar-footer"><button type="button" data-clear>清除</button><button type="button" data-today>今天</button><button type="button" data-done>完成</button></div></div></div></div>`);
    const trigger=wrapper.querySelector('.gift-date-trigger'),popup=wrapper.querySelector('.gift-date-popup'),grid=wrapper.querySelector('.flip-calendar-grid');
    let active='since',year,month;
    const input=()=>active==='since'?since:until;
    function setMonth(value){[year,month]=value.split('-').map(Number);month--;}
    function sync(){
        const start=since.value,end=until.value;
        trigger.querySelector('span').textContent=start&&end?`${start.replaceAll('-','/')} – ${end.replaceAll('-','/')}`:start?`${start.replaceAll('-','/')} 起`:end?`至 ${end.replaceAll('-','/')}`:'全部日期';
        trigger.classList.toggle('is-active',!!(start||end));
        for(const card of wrapper.querySelectorAll('[data-field]')){
            card.classList.toggle('is-active',card.dataset.field===active);
            card.querySelector('.flip-date-field-card-value').textContent=(card.dataset.field==='since'?start:end).replaceAll('-','/')||'请选择';
        }
        if(!popup.hidden)render();
    }
    function render(){
        wrapper.querySelector('.flip-calendar-title').textContent=`${year}年${pad(month+1)}月`;
        const offset=(new Date(Date.UTC(year,month,1)).getUTCDay()+6)%7,now=today();
        grid.replaceChildren();
        for(let i=0;i<42;i++){
            const value=dateValue(year,month,i-offset+1),button=document.createElement('button');
            button.type='button';button.className='flip-calendar-day';button.dataset.date=value;button.textContent=Number(value.slice(-2));button.setAttribute('aria-label',value);
            button.classList.toggle('is-muted',Number(value.slice(5,7))!==month+1);
            button.classList.toggle('is-selected',value===since.value||value===until.value);
            button.classList.toggle('is-in-range',!!(since.value&&until.value&&value>=since.value&&value<=until.value));
            button.classList.toggle('is-today',value===now);button.setAttribute('aria-pressed',String(value===input().value));
            grid.append(button);
        }
    }
    function close(){popup.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus({preventScroll:true});}
    function select(value){
        input().value=value;
        if(since.value&&until.value&&since.value>until.value)[since.value,until.value]=[until.value,since.value];
        if(active==='since'){active='until';setMonth(until.value||value);sync();wrapper.querySelector('[data-field="until"]').focus({preventScroll:true});}else{sync();close();}
        onChange();
    }
    trigger.onclick=()=>{if(!popup.hidden){close();return;}active=since.value&&!until.value?'until':'since';setMonth(input().value||since.value||today());popup.hidden=false;trigger.setAttribute('aria-expanded','true');sync();wrapper.querySelector(`[data-field="${active}"]`).focus({preventScroll:true});};
    popup.onclick=event=>{
        const button=event.target.closest('button');if(!button)return;
        if(button.dataset.field){active=button.dataset.field;setMonth(input().value||since.value||today());sync();}
        else if(button.dataset.shift){const d=new Date(Date.UTC(year,month+Number(button.dataset.shift),1));year=d.getUTCFullYear();month=d.getUTCMonth();render();}
        else if(button.dataset.date)select(button.dataset.date);
        else if(button.hasAttribute('data-today'))select(today());
        else if(button.hasAttribute('data-clear')){input().value='';sync();onChange();}
        else if(button.hasAttribute('data-done'))close();
    };
    grid.onkeydown=event=>{
        const value=event.target.dataset.date;if(!value)return;
        const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(!delta)return;
        event.preventDefault();const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+delta);const next=d.toISOString().slice(0,10);setMonth(next);render();grid.querySelector(`[data-date="${next}"]`).focus();
    };
    document.addEventListener('pointerdown',event=>{if(!popup.hidden&&!wrapper.contains(event.target)){popup.hidden=true;trigger.setAttribute('aria-expanded','false');}});
    wrapper.addEventListener('keydown',event=>{if(event.key==='Escape'&&!popup.hidden){event.preventDefault();close();}});
    sync();return{sync};
}
