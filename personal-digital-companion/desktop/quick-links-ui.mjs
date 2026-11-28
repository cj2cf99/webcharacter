const api=window.quickLinks;

const MAX_NAME_LENGTH=24;
const MAX_NOTE_LENGTH=80;

const form=document.getElementById('linkForm');
const nameInput=document.getElementById('nameInput');
const urlInput=document.getElementById('urlInput');
const noteInput=document.getElementById('noteInput');
const submitBtn=document.getElementById('submitBtn');
const cancelEditBtn=document.getElementById('cancelEditBtn');
const editingBadge=document.getElementById('editingBadge');
const countChip=document.getElementById('countChip');
const toast=document.getElementById('toast');
const linkList=document.getElementById('linkList');
const emptyState=document.getElementById('emptyState');
const loadingState=document.getElementById('loadingState');
const errorState=document.getElementById('errorState');
const errorMessage=document.getElementById('errorMessage');
const retryBtn=document.getElementById('retryBtn');

let links=[];
let maxLinks=10;
let loadState='loading';
let editingId=null;
let dragIndex=null;
let busy=false;
let loadSeq=0;
let toastTimer=null;
let confirmDeleteTimer=null;
let confirmDeleteBtn=null;

const charLength=value=>[...value].length;
const formatError=(err,fallback)=>String(err?.message??'').replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'')||fallback;

function shortName(name){
  const chars=[...name];
  return chars.length>15?`${chars.slice(0,15).join('')}…`:name;
}

function displayUrl(href){
  try{
    const {host,pathname,search,hash}=new URL(href);
    const rest=`${pathname}${search}${hash}`;
    return rest==='/'?host:`${host}${rest}`;
  }catch{
    return href;
  }
}

function normalizeHttpUrl(raw){
  const text=raw.trim();
  if(!text)return null;
  try{
    const parsed=new URL(text);
    if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')return null;
    return parsed.href;
  }catch{
    return null;
  }
}

function showToast(text,tone='info',viewId=null){
  clearTimeout(toastTimer);
  toast.textContent=text;
  toast.dataset.tone=tone;
  if(viewId){
    const view=document.createElement('button');
    view.type='button';
    view.className='toast-view';
    view.textContent='查看';
    view.onclick=()=>revealCard(viewId);
    toast.append(view);
  }
  if(text){
    toastTimer=setTimeout(()=>{toast.textContent='';},viewId?6000:3200);
  }
}

function clearDeleteConfirm(){
  clearTimeout(confirmDeleteTimer);
  if(!confirmDeleteBtn)return;
  confirmDeleteBtn.textContent='删除';
  confirmDeleteBtn.classList.remove('is-confirming');
  confirmDeleteBtn=null;
}

function revealCard(id){
  if(!id)return;
  const card=Array.from(linkList.children).find(el=>el.dataset.id===id);
  if(!card)return;
  card.scrollIntoView({block:'center',behavior:'smooth'});
  card.classList.remove('enter','is-moved');
  void card.offsetWidth;
  card.classList.add('is-moved');
}

function syncActionState(){
  const ready=loadState==='ready';
  const full=links.length>=maxLinks;
  countChip.textContent=`${ready?links.length:'–'} / ${maxLinks}`;
  countChip.dataset.full=String(ready&&full);
  submitBtn.disabled=busy||!ready||(!editingId&&full);
  cancelEditBtn.disabled=busy;
  retryBtn.disabled=busy;
  for(const [index,card] of Array.from(linkList.children).entries()){
    for(const btn of card.querySelectorAll('.row-actions button')){
      const step=btn.dataset.step;
      if(step==='-1')btn.disabled=busy||index===0;
      else if(step==='1')btn.disabled=busy||index===links.length-1;
      else btn.disabled=busy;
    }
  }
}

function setEditing(item,renderOptions){
  clearDeleteConfirm();
  if(!item){
    editingId=null;
    form.reset();
    submitBtn.textContent='登记';
    cancelEditBtn.hidden=true;
    editingBadge.hidden=true;
  }else{
    editingId=item.id;
    nameInput.value=item.name;
    urlInput.value=item.url;
    noteInput.value=item.note||'';
    submitBtn.textContent='保存';
    cancelEditBtn.hidden=false;
    editingBadge.hidden=false;
    editingBadge.textContent=`正在编辑：${shortName(item.name)}`;
    nameInput.focus();
  }
  if(renderOptions!==false)render(renderOptions);
  else syncActionState();
}

function applySnapshot(snapshot,renderOptions){
  maxLinks=Number(snapshot?.maxLinks)||10;
  if(snapshot?.status==='ready'){
    loadState='ready';
    links=Array.isArray(snapshot.links)?snapshot.links:[];
    if(editingId&&!links.some(item=>item.id===editingId))setEditing(null,false);
  }else{
    loadState='error';
    links=[];
    errorMessage.textContent=snapshot?.error||'读取常用链接失败，请检查配置后重试。';
    setEditing(null,false);
  }
  render(renderOptions);
}

async function moveOrder(fromIndex,toIndex,restoreFocusStep=null){
  if(busy||loadState!=='ready')return;
  if(toIndex<0||toIndex>=links.length||fromIndex===toIndex)return;
  clearDeleteConfirm();
  const reordered=[...links];
  const [moved]=reordered.splice(fromIndex,1);
  reordered.splice(toIndex,0,moved);
  busy=true;
  syncActionState();
  try{
    const result=await api.reorder(reordered.map(item=>item.id));
    busy=false;
    applySnapshot(result.snapshot,{moved:moved.id});
    if(restoreFocusStep!==null){
      const card=linkList.children[toIndex];
      const same=card?.querySelector(`[data-step="${restoreFocusStep}"]:not(:disabled)`);
      (same||card?.querySelector('[data-step]:not(:disabled)'))?.focus();
    }
  }catch(err){
    showToast(formatError(err,'调整顺序失败，请重试。'),'warn');
  }finally{
    busy=false;
    syncActionState();
  }
}

function buildCard(item,index,{enter=null,moved=null}){
  const li=document.createElement('li');
  li.className='fy-card';
  li.dataset.id=item.id;
  if(item.id===editingId){
    li.classList.add('is-editing');
    li.dataset.tone='accent';
  }
  if(item.id===moved)li.classList.add('is-moved');
  if(enter==='all'||enter===item.id){
    li.classList.add('enter');
    li.style.setProperty('--i',enter==='all'?index:0);
  }

  let dragAbort=null;
  const resetDrag=()=>{
    li.draggable=false;
    dragAbort?.abort();
    dragAbort=null;
  };

  li.addEventListener('dragstart',e=>{
    if(busy||e.target!==li){e.preventDefault();return;}
    dragIndex=index;
    li.classList.add('is-dragging');
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain',item.id);
  });
  li.addEventListener('dragend',()=>{
    dragIndex=null;
    resetDrag();
    li.classList.remove('is-dragging');
    linkList.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
  });
  li.addEventListener('dragover',e=>{
    if(dragIndex===null||dragIndex===index)return;
    e.preventDefault();
    li.classList.add('drag-over');
  });
  li.addEventListener('dragleave',e=>{
    if(!li.contains(e.relatedTarget))li.classList.remove('drag-over');
  });
  li.addEventListener('drop',e=>{
    li.classList.remove('drag-over');
    if(dragIndex===null||dragIndex===index)return;
    e.preventDefault();
    void moveOrder(dragIndex,index);
  });

  const head=document.createElement('div');
  head.className='fy-head';

  const handle=document.createElement('span');
  handle.className='drag-handle';
  handle.textContent='⋮⋮';
  handle.title='拖动调整顺序';
  handle.addEventListener('pointerdown',()=>{
    if(busy)return;
    resetDrag();
    dragAbort=new AbortController();
    li.draggable=true;
    window.addEventListener('pointerup',resetDrag,{signal:dragAbort.signal});
    window.addEventListener('pointercancel',resetDrag,{signal:dragAbort.signal});
  });

  const badge=document.createElement('span');
  badge.className='order-badge';
  badge.textContent=String(index+1);

  const titleLink=document.createElement('a');
  titleLink.className='link-title';
  titleLink.href=item.url;
  titleLink.textContent=item.name;
  titleLink.title=item.note?`${item.note} (${item.url})`:item.url;
  titleLink.addEventListener('click',e=>{
    e.preventDefault();
    void api.open(item.url).catch(err=>{
      showToast(formatError(err,'打开链接失败，请检查网址是否有效。'),'warn');
    });
  });

  head.append(handle,badge,titleLink);
  if(item.id===editingId){
    const tag=document.createElement('span');
    tag.className='fy-chip';
    tag.textContent='编辑中';
    head.append(tag);
  }

  const actions=document.createElement('div');
  actions.className='row-actions';

  const upBtn=document.createElement('button');
  upBtn.type='button';
  upBtn.className='mini-icon';
  upBtn.textContent='↑';
  upBtn.title='上移';
  upBtn.disabled=busy||index===0;
  upBtn.dataset.step='-1';
  upBtn.onclick=()=>void moveOrder(index,index-1,-1);

  const downBtn=document.createElement('button');
  downBtn.type='button';
  downBtn.className='mini-icon';
  downBtn.textContent='↓';
  downBtn.title='下移';
  downBtn.disabled=busy||index===links.length-1;
  downBtn.dataset.step='1';
  downBtn.onclick=()=>void moveOrder(index,index+1,1);

  const editBtn=document.createElement('button');
  editBtn.type='button';
  editBtn.className='mini-btn';
  editBtn.textContent=item.id===editingId?'取消':'编辑';
  editBtn.disabled=busy;
  editBtn.onclick=()=>{
    if(busy)return;
    setEditing(item.id===editingId?null:item);
  };

  const delBtn=document.createElement('button');
  delBtn.type='button';
  delBtn.className='mini-btn danger';
  delBtn.textContent='删除';
  delBtn.disabled=busy;
  delBtn.onclick=async()=>{
    if(busy)return;
    if(confirmDeleteBtn!==delBtn){
      clearDeleteConfirm();
      confirmDeleteBtn=delBtn;
      delBtn.textContent='确认删除？';
      delBtn.classList.add('is-confirming');
      confirmDeleteTimer=setTimeout(clearDeleteConfirm,3500);
      return;
    }
    clearDeleteConfirm();
    busy=true;
    syncActionState();
    try{
      const result=await api.remove(item.id);
      if(editingId===item.id)setEditing(null,false);
      applySnapshot(result.snapshot);
      showToast(`已删除「${shortName(item.name)}」`);
    }catch(err){
      showToast(formatError(err,'删除失败，请重试。'),'warn');
    }finally{
      busy=false;
      syncActionState();
    }
  };

  actions.append(upBtn,downBtn,editBtn,delBtn);

  const meta=document.createElement('div');
  meta.className='link-meta';
  const urlSpan=document.createElement('span');
  urlSpan.className='link-url';
  urlSpan.textContent=displayUrl(item.url);
  urlSpan.title=item.url;
  meta.append(urlSpan);
  if(item.note){
    const noteSpan=document.createElement('span');
    noteSpan.className='link-note';
    noteSpan.textContent=item.note;
    noteSpan.title=item.note;
    meta.append(noteSpan);
  }

  li.append(head,actions,meta);
  return li;
}

function render(options={}){
  clearDeleteConfirm();
  const ready=loadState==='ready';
  linkList.replaceChildren();
  linkList.hidden=!ready;
  emptyState.hidden=!ready||links.length>0;
  loadingState.hidden=loadState!=='loading';
  errorState.hidden=loadState!=='error';
  if(ready)links.forEach((item,index)=>linkList.append(buildCard(item,index,options)));
  syncActionState();
}

form.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.isComposing){
    e.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(busy||loadState!=='ready')return;
  clearDeleteConfirm();
  const name=nameInput.value.trim();
  const url=normalizeHttpUrl(urlInput.value);
  const note=noteInput.value.trim();

  if(!name){
    showToast('请填写中文名称。','warn');
    nameInput.focus();
    return;
  }
  if(charLength(name)>MAX_NAME_LENGTH){
    showToast(`中文名称最多 ${MAX_NAME_LENGTH} 个字。`,'warn');
    nameInput.focus();
    return;
  }
  if(!url){
    showToast('请输入有效的 http:// 或 https:// 网址。','warn');
    urlInput.focus();
    return;
  }
  if(charLength(note)>MAX_NOTE_LENGTH){
    showToast(`备注最多 ${MAX_NOTE_LENGTH} 个字。`,'warn');
    noteInput.focus();
    return;
  }
  if(!editingId&&links.length>=maxLinks){
    showToast(`最多只能登记 ${maxLinks} 条常用链接，请先删除或编辑已有记录。`,'warn');
    return;
  }

  busy=true;
  syncActionState();
  try{
    if(editingId){
      const result=await api.update(editingId,{name,url,note});
      setEditing(null,false);
      applySnapshot(result.snapshot);
      showToast(
        result.duplicate
          ?`已更新「${shortName(name)}」（提示：该网址与「${shortName(result.duplicate.name)}」重复）`
          :`已更新「${shortName(name)}」`,
        result.duplicate?'warn':'info',
        result.duplicate?.id
      );
    }else{
      const result=await api.create({name,url,note});
      form.reset();
      nameInput.focus();
      applySnapshot(result.snapshot,{enter:result.item?.id});
      showToast(
        result.duplicate
          ?`已登记「${shortName(name)}」（提示：该网址与「${shortName(result.duplicate.name)}」重复）`
          :`已登记「${shortName(name)}」`,
        result.duplicate?'warn':'info',
        result.duplicate?.id
      );
    }
  }catch(err){
    showToast(formatError(err,'保存失败，请重试。'),'warn');
  }finally{
    busy=false;
    syncActionState();
  }
});

cancelEditBtn.addEventListener('click',()=>setEditing(null));
editingBadge.addEventListener('click',()=>revealCard(editingId));

async function loadInitial(useReload=false){
  const seq=++loadSeq;
  busy=true;
  loadState='loading';
  render();
  try{
    if(!api)throw Error('未检测到绯月宿主接口');
    const snapshot=await (useReload?api.reload():api.list());
    if(seq!==loadSeq)return;
    applySnapshot(snapshot,{enter:'all'});
  }catch(err){
    if(seq!==loadSeq)return;
    applySnapshot({status:'error',error:formatError(err,'读取常用链接失败，请重试。'),links:[],maxLinks});
  }finally{
    if(seq===loadSeq){
      busy=false;
      syncActionState();
    }
  }
}

retryBtn.addEventListener('click',()=>void loadInitial(true));

void loadInitial(false);
