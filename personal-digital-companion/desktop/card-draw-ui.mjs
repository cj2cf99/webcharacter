// 抽卡窗口界面：状态来自主进程快照，页面只负责显示和转交操作。
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const api=window.feiyueCardDraw;
const MAX_SIDE=1024; // 参考图保存前缩到长边 1024，少花输入费用
const jst=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const message=error=>String(error?.message??error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');

let S=null,tab='setup',nextAt=0,promptLoaded=false;
const lists={cards:{page:0,top:'',data:null,ticket:0,failed:false},hd:{page:0,top:'',data:null,ticket:0,failed:false}};

function note(text){$('#status').textContent=text;}
async function run(type,args){
  try{return await api.run(type,args);}
  catch(error){note(message(error));throw error;}
}
function bump(el){el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');}

/* ---------- 状态 ---------- */
let refreshing=null,again=false;
function refresh(){
  if(refreshing){again=true;return refreshing;}
  refreshing=(async()=>{
    do{
      again=false;
      const before=S;
      S=await run('state');
      nextAt=performance.now()+S.wait;
      paintState(before);
      if(tab!=='setup')await loadList(tab,false);
    }while(again);
  })().catch(()=>{}).finally(()=>{refreshing=null;});
  return refreshing;
}
function paintState(before){
  if(!promptLoaded){$('#prompt').value=S.prompt;promptLoaded=true;}
  for(const slot of $$('.pic')){
    const url=S.refs[slot.dataset.slot],img=slot.querySelector('img');
    if(url&&img.getAttribute('src')!==url)img.src=url;
    img.hidden=!url;slot.querySelector('.hint').hidden=Boolean(url);slot.querySelector('.clear').hidden=!url;
  }
  drawChips();
  $('#power').setAttribute('aria-checked',S.on);
  $('#queueNum').textContent=S.queued;
  $('#costNow').textContent='$'+S.session.toFixed(3);$('#costAll').textContent='/ $'+S.total.toFixed(3);
  if(before&&before.total!==S.total)bump($('.money'));
  if(before&&S.cards>before.cards)bump($('[data-tab=cards]'));
  if(before&&S.hd>before.hd)bump($('[data-tab=hd]'));
  const chip=$('#keyChip');
  chip.textContent={saved:'🔐 密钥已保存',pending:'🔑 待首次验证',none:'🔑 未填密钥'}[S.key];
  chip.dataset.ok=S.key==='saved';
  $('#banner').hidden=!S.paused;$('#bannerText').textContent=S.paused?'⛔ '+S.paused+'（已暂停）':'';
  if(S.notice&&!before)note(S.notice);
  $('#cardCount').textContent=S.cards;$('#hdCount').textContent=S.hd;
  $('#cleanNum').textContent=S.unchecked;$('#clean').disabled=!S.unchecked;
  paintRing();
}
function paintRing(){
  if(!S)return;
  const ring=$('#ring'),job=S.busy||S.next,left=Math.max(0,nextAt-performance.now());
  ring.classList.toggle('busy',Boolean(S.busy));
  ring.dataset.job=job||''; // 金色 = 本轮或下轮做高清
  ring.title=S.busy?(S.busy==='hd'?'高清重绘中':'抽卡中'):job==='hd'?'下一轮：高清':job?'下一轮：抽卡':'';
  ring.style.setProperty('--p',S.busy?28:job?100-left/S.cycle*100:0);
  $('#ringText').textContent=S.busy||job&&!left?(job==='hd'?'✨':'🎴'):job?Math.ceil(left/1000):'—';
  $('#stateText').textContent=S.paused?'已暂停':S.key==='none'&&(S.on||S.queued)?'等待密钥':S.on?'自动抽卡中':S.queued||S.busy==='hd'?'只做高清':'已停止';
}

/* ---------- 配置 ---------- */
function drawChips(){
  const text=$('#prompt').value.trim();
  for(const slot of $$('.slot')){
    const key=slot.dataset.slot,filled=key==='free'?Boolean(text):Boolean(S?.refs[key]);
    const [label,tone]=filled?['📌 固定','accent']:key==='free'?['可空','muted']:text?['🕊 模型发挥','muted']:['🎲 随机','info'];
    const chip=slot.querySelector('em');chip.textContent=label;chip.dataset.tone=slot.dataset.tone=tone;
  }
}
let savedTimer,promptTimer,dirty=false;
function remembered(){$('#saved').classList.add('on');clearTimeout(savedTimer);savedTimer=setTimeout(()=>$('#saved').classList.remove('on'),2500);}
function flushPrompt(){
  clearTimeout(promptTimer);
  if(!dirty)return;
  dirty=false;
  void run('setPrompt',$('#prompt').value).then(remembered,()=>{dirty=true;});
}
$('#prompt').addEventListener('input',()=>{dirty=true;$('#saved').classList.remove('on');drawChips();clearTimeout(promptTimer);promptTimer=setTimeout(flushPrompt,700);});
$('#prompt').addEventListener('change',flushPrompt);
addEventListener('pagehide',flushPrompt);

/* ---------- 参考图 ---------- */
async function saveRef(slot,data){
  await run('setRef',{slot:slot.dataset.slot,data});
  remembered();await refresh();
}
async function loadPic(slot,file){
  if(!file)return;
  const frame=slot.querySelector('.frame');
  frame.classList.remove('bad');frame.classList.add('loading');
  try{
    // 没有扩展名的文件类型为空，交给解码判断；解不开同样走下面的提示。
    if(file.type&&!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('type');
    const bitmap=await createImageBitmap(file),scale=Math.min(1,MAX_SIDE/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    bitmap.close();
    await saveRef(slot,canvas.toDataURL('image/png'));
  }catch{ // 原来的图保留，提示后可重新选
    void frame.offsetWidth;frame.classList.add('bad');
    const chip=slot.querySelector('em');chip.textContent='✕ 读不了';chip.dataset.tone='danger';
  }finally{frame.classList.remove('loading');}
}
let hovered=null;
for(const slot of $$('.pic')){
  const input=slot.querySelector('input');
  slot.querySelector('.drop').onclick=()=>input.click();
  input.onchange=()=>{void loadPic(slot,input.files[0]);input.value='';};
  slot.querySelector('.clear').onclick=()=>void saveRef(slot,null).catch(()=>{});
  slot.onmouseenter=()=>hovered=slot;slot.onmouseleave=()=>hovered=null;
  slot.ondragover=()=>slot.classList.add('over');
  slot.ondragleave=event=>{if(!slot.contains(event.relatedTarget))slot.classList.remove('over');};
  slot.ondrop=event=>{slot.classList.remove('over');void loadPic(slot,event.dataTransfer.files[0]);};
}
// 允许拖放，同时拖偏了不让窗口直接打开图片
for(const type of ['dragover','drop'])addEventListener(type,event=>event.preventDefault());
// 粘贴到：当前聚焦的槽 → 鼠标所在的槽 → 第一个空槽
addEventListener('paste',event=>{
  if(tab!=='setup'||$('dialog[open]'))return;
  // 提示词框里带文字的粘贴按文字处理。
  if(document.activeElement.id==='prompt'&&event.clipboardData.getData('text'))return;
  // 一次多个文件时先取明确的图片，没有才试类型为空的。
  const files=[...event.clipboardData.files],file=files.find(item=>item.type.startsWith('image/'))??files.find(item=>!item.type);
  if(!file)return;
  const slot=document.activeElement.closest('.pic')||hovered||$$('.pic').find(item=>!S?.refs[item.dataset.slot]);
  if(slot){event.preventDefault();void loadPic(slot,file);}
});

/* ---------- 列表 ---------- */
const BADGE={wait:['可撤回','warn'],queued:['⏳ 排队','warn'],running:['✨ 生成中','info'],done:['✓ 已高清','ok'],fail:['✕ 失败','danger']};
function itemEl(kind,item,index){
  const li=document.createElement('li');
  li.className='card';li.dataset.name=item.name;li.style.setProperty('--i',index);
  const img=document.createElement('img');img.loading='lazy';img.alt=kind==='cards'?'抽卡图':'高清图';img.src=item.url;
  img.onerror=()=>li.classList.add('broken');
  const time=document.createElement('time');time.textContent=jst.format(new Date(item.time));
  li.append(img,time);
  if(kind!=='cards'){li.dataset.tone='accent';return li;}
  const state=item.st==='queued'&&item.undo?'wait':item.st,[label,tone]=BADGE[state]??[];
  li.classList.toggle('sel',item.sel);li.classList.toggle('running',state==='running');
  li.dataset.tone=tone??(item.sel?'accent':'muted');
  const pick=document.createElement('label');pick.className='pick';
  const box=document.createElement('input');box.type='checkbox';box.checked=item.sel;box.disabled=state==='running';box.setAttribute('aria-label','勾选高清化');
  pick.append(box);li.append(pick);
  if(label){const badge=document.createElement('span');badge.className='badge';badge.textContent=label;li.append(badge);}
  if(state==='wait'){const count=document.createElement('span');count.className='count';li.append(count);li.dataset.until=item.until;}
  if(state==='fail'){const retry=document.createElement('button');retry.type='button';retry.className='retry';retry.textContent='↻ 重试';li.append(retry);}
  return li;
}
const emptyItem=text=>{const li=document.createElement('li');li.className='fy-empty';li.textContent=text;return li;};
const signature=data=>JSON.stringify(data.items.map(item=>[item.name,item.sel,item.st,item.undo>0]));
// loading=true：翻页或切页签，显示骨架；false：后台状态刷新，内容没变就不重建。
async function loadList(kind,loading){
  const list=lists[kind],box=$('#'+kind);
  if(!loading&&(list.loading||list.failed))return;
  const ticket=++list.ticket;
  if(loading){
    list.loading=true;list.failed=false;
    box.replaceChildren(...Array.from({length:8},()=>{const li=document.createElement('li');li.className='skeleton';return li;}));
    $('#main').scrollTop=0;
  }
  let data;
  try{data=await api.run('list',{kind,page:list.page,top:kind==='cards'?list.top:''});}
  catch(error){
    if(ticket!==list.ticket)return;
    list.loading=false;list.failed=true;list.data=null;
    const li=emptyItem('加载失败：'+message(error)),retry=document.createElement('button');
    retry.type='button';retry.textContent='↻ 重试';retry.onclick=()=>void loadList(kind,true);
    li.append(retry);box.replaceChildren(li);return;
  }
  if(ticket!==list.ticket)return;
  list.loading=false;list.page=data.page;list.top=data.top;
  for(const item of data.items)item.until=performance.now()+item.undo;
  const same=!loading&&list.data&&signature(list.data)===signature(data);
  list.data=data;
  if(!same){
    box.classList.toggle('still',!loading); // 状态刷新时不重播入场动画
    box.replaceChildren(...(data.items.length?data.items.map((item,i)=>itemEl(kind,item,i)):
      [emptyItem(kind==='cards'?'还没有卡，打开开关抽起来':'还没有高清图，去“挑卡”勾几张')]));
  }
  paintPager(kind,data);
  if(kind==='cards'){$('#fresh').hidden=!data.fresh;$('#fresh').textContent='▲ '+data.fresh+' 张新卡';}
  paintViewer();
}
function paintPager(kind,{page,pages}){
  const el=$('#'+kind+'Pager');
  el.hidden=pages<2;
  const prev=document.createElement('button'),label=document.createElement('span'),next=document.createElement('button');
  prev.type=next.type='button';prev.textContent='‹';next.textContent='›';
  prev.setAttribute('aria-label','较新');next.setAttribute('aria-label','较早');
  label.textContent=(page+1)+' / '+pages;prev.disabled=!page;next.disabled=page>=pages-1;
  prev.onclick=()=>{lists[kind].page=page-1;void loadList(kind,true);};
  next.onclick=()=>{lists[kind].page=page+1;void loadList(kind,true);};
  el.replaceChildren(prev,label,next);
}
function showNewest(kind){Object.assign(lists[kind],{page:0,top:''});}
$('#fresh').onclick=()=>{showNewest('cards');void loadList('cards',true);};

/* ---------- 勾选、大图、清理 ---------- */
async function pick(name,on){
  try{await run('pick',{name,on});}finally{await refresh();}
  if(on&&S.key==='none')askKey();
}
const itemOf=name=>lists.cards.data?.items.find(item=>item.name===name);
$('#cards').addEventListener('change',event=>{
  const name=event.target.closest('.card')?.dataset.name;
  if(name)void pick(name,event.target.checked).catch(()=>{});
});
$('#cards').addEventListener('click',event=>{
  const name=event.target.closest('.card')?.dataset.name;
  if(!name)return;
  if(event.target.matches('.retry'))void run('retry',name).then(refresh).then(()=>{if(S.key==='none')askKey();}).catch(()=>{});
  if(event.target.tagName==='IMG'){const item=itemOf(name);view(item,name);}
});
$('#hd').addEventListener('click',event=>{
  if(event.target.tagName!=='IMG')return;
  const name=event.target.closest('.card').dataset.name;
  view(lists.hd.data.items.find(item=>item.name===name),null);
});
let viewing=null;
function view(item,name){
  viewing=name;
  $('#viewer img').src=item.url;$('#viewer p').textContent=jst.format(new Date(item.time));
  paintViewer();$('#viewer').showModal();
}
function paintViewer(){
  const button=$('#viewPick'),item=viewing&&itemOf(viewing);
  button.hidden=!item;if(!item)return;
  button.textContent=item.sel?'✓ 已勾选':'✨ 勾选高清';
  button.setAttribute('aria-pressed',item.sel);button.disabled=item.st==='running';
}
$('#viewPick').onclick=()=>{const item=itemOf(viewing);if(item)void pick(viewing,!item.sel).catch(()=>{});};

$('#clean').onclick=async()=>{
  const names=await run('unchecked').catch(()=>null);
  if(!names?.length)return;
  $('#confirmNum').textContent=names.length; // 只清确认时清点到的这批
  const box=$('#confirmBox');box.returnValue='';box.showModal();
  box.onclose=async()=>{
    if(box.returnValue!=='ok')return;
    const chosen=new Set(names);
    for(const li of $$('#cards .card'))if(chosen.has(li.dataset.name)&&!li.classList.contains('sel'))li.classList.add('gone');
    $('#clean').disabled=true;
    try{
      const [result]=await Promise.all([run('clean',names),new Promise(done=>setTimeout(done,450))]);
      note(result.failed?result.failed+' 张没能移到回收站，仍保留在原处。':'');
    }catch{/* 原因已显示 */}
    showNewest('cards');lists.cards.data=null; // 强制按最新内容重建当前页
    await refresh();
  };
};

/* ---------- 密钥与开关 ---------- */
function askKey(){
  const box=$('#keyBox');if(box.open)return;
  box.returnValue='';$('#keyInput').value='';box.showModal();
  box.onclose=async()=>{
    const value=$('#keyInput').value;$('#keyInput').value='';
    try{
      if(box.returnValue==='ok'&&value.trim()){await run('setKey',value);note('');}
      else if(S?.on&&S.key==='none')await run('power',false); // 已勾选的保留，填好密钥后照常执行
    }catch{/* 原因已显示 */}
    await refresh();
  };
}
$('#keyCancel').onclick=()=>$('#keyBox').close('no');
$('#keyChip').onclick=()=>{if(S?.key==='none')askKey();};
$('#power').onclick=async()=>{
  if(!S)return;
  const on=!S.on;
  await run('power',on).catch(()=>{});await refresh();
  if(on&&S.key==='none')askKey();
};
$('#resume').onclick=async()=>{
  await run('resume').catch(()=>{});await refresh();
  if(S.key==='none')askKey();
};

/* ---------- 页签与时钟 ---------- */
for(const button of $$('[data-tab]'))button.onclick=()=>{
  flushPrompt();
  tab=button.dataset.tab;
  for(const item of $$('[data-tab]'))item.setAttribute('aria-selected',item===button);
  for(const view of $$('[data-view]'))view.hidden=view.dataset.view!==tab;
  $('#foot').hidden=tab!=='cards';$('#saved').hidden=tab!=='setup';
  $('#main').scrollTop=0;
  if(tab!=='setup'){showNewest(tab);void loadList(tab,true);}
};
setInterval(()=>{
  paintRing();
  let expired=false;
  for(const li of $$('#cards .card[data-until]')){
    const left=Number(li.dataset.until)-performance.now(),count=li.querySelector('.count');
    if(left<=0){delete li.dataset.until;expired=true;continue;}
    if(count){count.textContent=Math.ceil(left/1000);count.style.setProperty('--p',left/5000*100);}
  }
  if(expired)void refresh();
},200);
api.onChanged(()=>void refresh());
drawChips();
void refresh();
