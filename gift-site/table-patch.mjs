const savedTables=new WeakMap();
function syncNode(node,next){
    if(node.nodeType===3){if(node.nodeValue!==next.nodeValue)node.nodeValue=next.nodeValue;return;}
    for(const a of [...node.attributes])if(!next.hasAttribute(a.name))node.removeAttribute(a.name);
    for(const a of [...next.attributes])if(node.getAttribute(a.name)!==a.value)node.setAttribute(a.name,a.value);
    const current=[...node.childNodes],wanted=[...next.childNodes];
    for(let i=0;i<wanted.length;i++){const a=current[i],b=wanted[i];if(!a)node.append(b);else if(a.nodeType!==b.nodeType||a.nodeName!==b.nodeName)node.replaceChild(b,a);else syncNode(a,b);}
    for(let i=wanted.length;i<current.length;i++)current[i].remove();
}
export function patchRows(body,html,keys,{context='',preserve=true}={}){
    const template=document.createElement('template');template.innerHTML=html;
    const desired=[...template.content.children],saved=savedTables.get(body),same=saved?.context===context;
    const previous=same?saved.rows:new Map(),next=new Map();
    // Adopt first-paint rows so their images and profile links remain mounted.
    if(!saved&&body.children.length===desired.length)for(let i=0;i<keys.length;i++)previous.set(keys[i],{node:body.children[i]});
    const container=body.closest('.table-scroll'),dialog=body.closest('dialog'),scroller=dialog?container:window;
    let anchor,offset;const scroll=dialog?container.scrollTop:window.scrollY,top=dialog?container.getBoundingClientRect().top:0;
    if(same&&preserve&&scroll>0)for(const {node} of previous.values()){const rect=node.getBoundingClientRect();if(rect.bottom>top){anchor=node;offset=rect.top;break;}}
    let cursor=body.firstElementChild;
    desired.forEach((wanted,i)=>{
        const key=keys[i]??'empty',old=previous.get(key),node=old?.node||wanted;
        if(old)syncNode(node,wanted);
        if(node===cursor)cursor=cursor.nextElementSibling;else body.insertBefore(node,cursor);
        next.set(key,{node});
    });
    const retained=new Set([...next.values()].map(x=>x.node));for(const node of [...body.children])if(!retained.has(node))node.remove();
    savedTables.set(body,{context,rows:next});
    if(anchor?.isConnected&&retained.has(anchor)){const delta=anchor.getBoundingClientRect().top-offset;if(delta){if(scroller===window)window.scrollBy(0,delta);else scroller.scrollTop+=delta;}}
}
