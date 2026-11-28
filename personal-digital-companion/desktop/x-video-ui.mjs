// 「X视频管理」：已下载（分页、缩略图懒加载、只归档）、队列与进度、Cookie 和引擎更新。
import {$,button,duration,element,message,problem,short,target} from './x-video-shared.mjs';

const api=window.xVideo,toast=$('#toast'),list=$('#library'),search=$('#search');
const updateDialog=$('#updateDialog'),cookieDialog=$('#cookieDialog'),cookieText=$('#cookieText'),cookieMessage=$('#cookieMessage');
let tab='library',data=null,page=0,reading=0,libraryReading=0,libraryKey='',shown='',queueKey='',confirming='',confirmTimer;
const thumbs=new Map();
const observer=new IntersectionObserver(entries=>{
  for(const entry of entries){
    if(!entry.isIntersecting)continue;
    observer.unobserve(entry.target);
    void loadThumb(entry.target);
  }
},{root:$('#main'),rootMargin:'80px'});
async function loadThumb(box){
  const id=box.dataset.id,key=box.dataset.key||id;
  let source=thumbs.get(key);
  if(!source){
    try{source=await api.thumb(id);}catch{}
    if(source)thumbs.set(key,source);
  }
  box.classList.remove('skeleton');
  const image=box.querySelector('img');
  if(source)image.src=source;
  else image.replaceWith(element('span','thumb-placeholder',box.dataset.kind==='article'?'📄':'🎞'));
}
// 按钮执行期间禁用，结果或错误显示在提示条。
function act(work){
  return async event=>{
    const node=event?.currentTarget;
    if(node)node.disabled=true;
    try{
      const result=await work();
      if(result?.message)toast.textContent=result.message;
    }catch(error){toast.textContent=message(error);}
    finally{if(node)node.disabled=false;void refresh();}
  };
}

// ---- 已下载 ----
function videoCard(item,index){
  const card=element('li','vcard');
  card.style.setProperty('--i',index);
  const isArticle=item.kind==='article';
  const gone=isArticle?item.missing>0:item.missing===item.files.length;
  card.dataset.tone=item.missing?'warn':'ok';
  const first=Math.max(0,item.files.findIndex(file=>!file.missing));
  const play=index=>act(()=>api.play(item.id,index));
  const box=button('', 'thumb-box',play(first),(isArticle?'打开文章 ':'播放 ')+item.name);
  box.dataset.id=item.id;box.dataset.key=item.id+':'+item.finishedAt;box.dataset.kind=item.kind??'video';
  if(item.hasThumb){
    const image=element('img');image.alt=item.name+' 缩略图';box.append(image);
    box.classList.add('skeleton');observer.observe(box);
  }else box.append(element('span','thumb-placeholder',isArticle?'📄':'🎞'));
  const total=item.files.reduce((sum,file)=>sum+file.duration,0);
  box.append(element('span','play-fab',isArticle?'📖':'▶'));
  if(!isArticle&&total)box.append(element('span','thumb-dur',duration(total)));
  if(isArticle)box.append(element('span','thumb-segs','📄 文章'));
  else if(item.files.length>1)box.append(element('span','thumb-segs',item.files.length+' 段'));
  const title=element('h3','vcard-title',item.name);title.title=item.name;
  const meta=element('div','vcard-meta');
  const time=element('time','',short.format(item.finishedAt));time.dateTime=new Date(item.finishedAt).toISOString();
  meta.append(time);
  if(isArticle){
    meta.append(element('span','fy-chip',`${item.repliesCollected??0} 回复 · ${item.mediaCount??0} 媒体`));
    if(item.failedMediaCount){
      const fc=element('span','fy-chip',`⚠ 缺 ${item.failedMediaCount} 媒体`);fc.dataset.tone='warn';meta.append(fc);
    }
  }
  if(item.missing){
    const chip=element('span','fy-chip',gone?(isArticle?'⚠ 文章缺失':'⚠ 文件缺失'):`⚠ 缺 ${item.missing} 段`);chip.dataset.tone='warn';meta.append(chip);
  }
  card.append(box,title,meta);
  if(!isArticle&&item.files.length>1){
    const parts=element('div','seg-pills');
    item.files.forEach((file,i)=>{
      const pill=button('▶ '+(i+1),'',play(i),`播放第 ${i+1} 段`+(file.missing?'（文件缺失）':''));
      if(file.missing)pill.dataset.missing='';
      parts.append(pill);
    });
    card.append(parts);
  }
  const actions=element('div','vcard-actions');
  actions.append(
    button(isArticle?'📖 打开':'▶ 播放','btn-play',play(first)),
    button('📂','',act(()=>api.reveal(item.id)),isArticle?'打开文章目录':'打开所在文件夹'),
    button('📦 归档','btn-archive',act(async()=>{
      card.classList.add('archiving');
      try{return await api.archive(item.id);}
      catch(error){card.classList.remove('archiving');throw error;}
    }),'移入 archive 文件夹并脱离管理'));
  card.append(actions);
  return card;
}
async function showLibrary(skeleton=false){
  const token=++libraryReading;
  if(skeleton){shown='';list.replaceChildren(element('li','skeleton-card'));$('#pager').hidden=true;}
  try{
    const result=await api.library({page,query:search.value});
    if(token!==libraryReading)return;
    page=result.page;
    const content=JSON.stringify([search.value,result]);
    if(content===shown)return;
    shown=content;
    observer.disconnect();
    list.replaceChildren(...result.items.map(videoCard));
    if(!result.items.length)list.append(element('li','fy-empty',result.error?'下载记录暂时无法读取。':search.value.trim()?'没有匹配的记录':'还没有在管的 X 视频或文章'));
    $('#pager').hidden=result.pages<2;
    $('#page').textContent=(result.page+1)+' / '+result.pages;
    $('#newer').disabled=result.page===0;
    $('#older').disabled=result.page>=result.pages-1;
  }catch(error){
    if(token!==libraryReading)return;
    shown='';
    const row=element('li','fy-empty',message(error));
    row.append(button('↻ 重试','',()=>void showLibrary(true)));
    list.replaceChildren(row);$('#pager').hidden=true;
  }
}

// ---- 队列与进度 ----
function elapsed(task){
  const ms=task.kind==='article'?(data.articleLimit??180_000):data.runLimit;
  const limit=Math.max(1,Math.round(ms/60000)),minutes=Math.max(0,Math.floor((Date.now()+data.skew-task.startedAt)/60000));
  return {text:minutes+'m / '+limit+'m',warn:minutes>=limit*.75};
}
function cancelButton(task){
  const armed=confirming===task.id,isArt=task.kind==='article',kind=isArt?'暂存':'断点';
  return button(armed?'确认取消':'✕',armed?'confirm-cancel':'',async()=>{
    clearTimeout(confirmTimer);
    if(!armed){
      confirming=task.id;
      confirmTimer=setTimeout(()=>{confirming='';drawQueue(true);},3500);
      drawQueue(true);return;
    }
    confirming='';
    await act(async()=>{await api.task('cancel',task.id);return {message:`已取消并清理${kind}：`+task.name};})();
  },armed?`再点一次确认取消并删除${kind}`:`取消任务并删除${kind}`);
}
function lane(task,index){
  if(!task){
    const idle=element('div','lane idle');
    idle.append(element('b','',`#${index+1} 空闲`),element('span','','可并行下载'));
    return idle;
  }
  const node=element('div','lane busy');node.dataset.id=task.id;
  const head=element('div','lane-head');
  head.append(element('span','lane-no',`#${index+1}`+(task.kind==='article'?' · 📄':'')+(task.low?' · 低优先':'')),element('strong','lane-pct'));
  const name=element('div','lane-target'),title=element('strong','',task.name);
  title.title=task.name;name.append(title,element('small','',target(task.url)));
  const bar=element('div','pbar');bar.setAttribute('role','progressbar');bar.setAttribute('aria-label',task.name+' 进度');
  bar.append(element('div','pbar-fill'));
  const foot=element('div','lane-foot');
  foot.append(element('span','lane-stage'),element('span','lane-time'),
    button('⏸','',act(()=>api.task('pause',task.id)),task.kind==='article'?'暂停（继续时重新抓取）':'暂停（保留断点）'),cancelButton(task));
  node.append(head,name,bar,foot);
  return node;
}
// 进度高频变化时只改数字和进度条，避免按钮在点击瞬间被重建。
function paint(){
  if(!data)return;
  for(const node of document.querySelectorAll('.lane.busy')){
    const task=data.tasks.find(row=>row.id===node.dataset.id);
    if(!task)continue;
    const percent=Math.floor(task.progress),time=elapsed(task);
    node.querySelector('.lane-pct').textContent=percent+'%';
    node.querySelector('.pbar-fill').style.setProperty('--pct',percent+'%');
    node.querySelector('.pbar').setAttribute('aria-valuenow',String(percent));
    node.querySelector('.lane-stage').textContent=task.stage??'';
    const clock=node.querySelector('.lane-time');
    clock.textContent=time.text;clock.classList.toggle('warn',time.warn);
  }
}
const labels={
  queued:task=>task.low?['⬇ 队尾 · 最低优先级','warn']:data.update.waiting||data.update.applying?['⏳ 等引擎更新','info']:task.stopping?['⏳ 正在停止上一次','info']:['⏳ 排队','accent'],
  confirm:()=>['⬆ 待确认更新','warn'],
  paused:task=>{
    const span=task.kind==='article'?'3 分钟':'1 小时';
    return task.reason==='timeout'?[`⏱ 超 ${span}暂停 · 最低优先级`,'warn']:task.reason==='exit'?['⏸ 退出时暂停','muted']:['⏸ 已暂停','muted'];
  },
  failed:()=>['✕ 失败','danger'],
};
function pendingRow(task,index,order){
  const [label,tone]=labels[task.state](task);
  const row=element('li','fy-card');row.dataset.tone=tone;row.style.setProperty('--i',index);
  const line=element('div','pending-row');
  const badge=element('span','order-num'+(task.low?' low':''),task.state==='queued'?(task.low?'低':String(order)):task.state==='failed'?'!':'Ⅱ');
  if(task.state==='confirm')badge.textContent='⬆';
  const main=element('div','pending-main'),title=element('div','pending-title'),name=element('strong','',(task.kind==='article'?'📄 ':'')+task.name);
  name.title=task.name;title.append(name,element('span','fy-chip',label));
  const sub=element('div','pending-sub');
  sub.append(element('span','',target(task.url)));
  if(task.progress>0){
    const bar=element('span','mini-bar'),fill=element('i');fill.style.setProperty('--pct',Math.floor(task.progress)+'%');
    bar.append(fill);sub.append(bar,element('span','',`${task.kind==='article'?'进度':'断点'} ${Math.floor(task.progress)}%`));
  }
  main.append(title,sub);
  if(task.error){const error=element('p','pending-error fy-clamp',task.error);error.title=task.error;main.append(error);}
  const actions=element('div','pending-actions');
  const span=task.kind==='article'?'3 分钟':'1 小时';
  if(task.state==='paused'||task.state==='failed')actions.append(button(task.state==='failed'?'↻ 重试':'▶ 继续','',act(()=>resume('resume',task.id)),
    task.low?`以最低优先级继续，重新计时 ${span}`:(task.kind==='article'?'重新抓取':'从断点继续')));
  if(task.state==='queued')actions.append(button('⏸','',act(()=>api.task('pause',task.id)),'暂停'));
  if(task.state==='confirm')actions.append(button('处理更新','',act(async()=>{
    const choice=await ask(data.update,false);
    if(choice)await api.update(choice);
  })));
  actions.append(cancelButton(task));
  line.append(badge,main,actions);row.append(line);
  return row;
}
function drawQueue(force=false){
  if(!data||tab!=='queue')return;
  const running=data.tasks.filter(task=>task.state==='running'),pending=data.tasks.filter(task=>task.state!=='running');
  const key=JSON.stringify([confirming,data.update.waiting||data.update.applying,
    data.tasks.map(task=>[task.id,task.slot,task.state,task.low,task.reason,task.error,task.name,task.stopping,task.state==='running'?0:Math.floor(task.progress)])]);
  if(force||key!==queueKey){
    queueKey=key;
    $('#lanes').replaceChildren(...Array.from({length:data.max},(_,i)=>lane(running.find(task=>task.slot===i),i)));
    let order=0;
    $('#pending').replaceChildren(...pending.map((task,i)=>pendingRow(task,i,task.state==='queued'?++order:0)));
    if(!pending.length)$('#pending').append(element('li','fy-empty','没有等待或暂停的任务'));
    $('#laneCount').textContent=running.length+'/'+data.max;
    $('#pendingCount').textContent=pending.length;
    $('#resumeAll').hidden=pending.filter(task=>task.state==='paused').length<2;
  }
  paint();
}

// ---- 公共状态 ----
async function refresh(){
  const token=++reading;
  try{
    const next=await api.snapshot();
    if(token!==reading)return;
    data={...next,skew:next.now-Date.now()};
    const banner=$('#banner'),text=problem(data);
    banner.hidden=!text;
    if(banner.textContent!==text)banner.textContent=text;
    const {update,cookie}=data;
    const state=update.applying?'正在更新 yt-dlp，完成后自动继续下载…'
      :update.waiting?`已同意更新，等待 ${data.occupied} 个下载结束…`:update.error;
    $('#updateBar').hidden=!state;
    $('#updateState').textContent=state;
    $('#updateStop').hidden=!update.waiting;
    const dot=$('#updateDot');
    dot.hidden=!(update.available||update.applying||update.error);
    dot.dataset.tone=update.applying?'accent':'warn';
    $('#updateButton').title='检查 yt-dlp 更新'+(update.current?'（当前 '+update.current+'）':'');
    $('#updateButton').disabled=update.applying||update.waiting||update.checking;
    $('#cookieDot').dataset.tone=cookie.savedAt?'ok':'warn';
    $('#cookieButton').title=cookie.savedAt?'登录 Cookie 已导入（'+short.format(cookie.savedAt)+'）':'未导入登录 Cookie，仅能下载公开视频；长文归档需先导入登录 Cookie';
    $('#libraryCount').textContent=data.libraryCount;
    $('#queueCount').textContent=data.tasks.length;
    $('#queueDot').hidden=!data.occupied;
    drawQueue();
    // 只有成品记录变化才重读列表，进度刷新不动缩略图。
    const key=data.libraryRevision+':'+data.error;
    if(key!==libraryKey){libraryKey=key;if(tab==='library')void showLibrary();}
  }catch(error){toast.textContent=message(error);}
}
function select(next){
  tab=next;
  for(const node of document.querySelectorAll('[role=tab]'))node.setAttribute('aria-selected',String(node.dataset.tab===tab));
  $('#libraryView').hidden=tab!=='library';
  $('#queueView').hidden=tab!=='queue';
  $('#searchWrap').hidden=tab!=='library';
  $('#main').scrollTop=0;
  if(tab==='library')void showLibrary(true);else drawQueue(true);
}
async function takeTab(){
  const wanted=await api.takeTab().catch(()=>null);
  if(wanted&&wanted!==tab)select(wanted);
}

// ---- 引擎更新 ----
let asking=false;
// 返回用户的选择：apply、skip 或空（取消）。
async function ask({current,latest},manual){
  if(asking||!data)return '';
  $('#updateText').textContent=`当前 ${current} → 最新 ${latest}。只有同意后才会更新。`;
  const lock=$('#updateLock');
  lock.hidden=!data.occupied;
  lock.textContent=data.occupied?`有 ${data.occupied} 个下载正在进行，同意后会等它们结束再更新。`:'';
  $('#updateSkip').hidden=manual;
  asking=true;updateDialog.showModal();
  const choice=await new Promise(done=>{
    for(const node of updateDialog.querySelectorAll('[data-choice]'))node.onclick=()=>done(node.dataset.choice);
    updateDialog.oncancel=event=>{event.preventDefault();done('');};
  });
  asking=false;updateDialog.close();
  return choice;
}
async function resume(action,id){
  const result=await api.task(action,id);
  if(result?.status!=='update')return;
  await refresh();
  const choice=await ask(result,false);
  if(!choice)return {message:'已取消，任务保持暂停。'};
  await api.task(action,id,choice);
}
$('#updateButton').onclick=async event=>{
  const node=event.currentTarget;
  node.disabled=true;node.setAttribute('aria-busy','true');
  toast.textContent='正在检查 yt-dlp 版本…';
  try{
    const update=await api.checkUpdate();
    await refresh();
    if(update.available){
      toast.textContent='';
      const choice=await ask(update,true);
      if(choice)await api.update(choice);
    }
    else toast.textContent='yt-dlp 已是最新版本（'+update.current+'）。';
  }catch(error){toast.textContent=message(error);}
  finally{node.removeAttribute('aria-busy');node.disabled=false;void refresh();}
};
$('#updateStop').onclick=act(async()=>{await api.update('cancel');return {message:'已取消本次更新，继续按原版本下载。'};});

// ---- Cookie ----
function cookieResult(text,tone){cookieMessage.hidden=!text;cookieMessage.textContent=text;cookieMessage.dataset.tone=tone;}
function cookieStatus(){
  const at=data?.cookie.savedAt;
  $('#cookieStatus').textContent=at?'已加密保存（'+short.format(at)+' 导入）':'尚未导入，仅能下载公开视频；长文归档需先导入登录 Cookie。';
  $('#cookieClear').disabled=!at;
}
$('#cookieButton').onclick=()=>{cookieText.value='';cookieResult('','');cookieStatus();cookieDialog.showModal();};
$('#cookieClose').onclick=()=>cookieDialog.close();
cookieDialog.onclose=()=>{cookieText.value='';};
async function cookieAction(work,done){
  try{
    const result=await work();
    if(result===null)return;
    cookieText.value='';
    await refresh();cookieStatus();
    cookieResult(done,'ok');
  }catch(error){cookieResult(message(error),'danger');}
}
$('#cookieSave').onclick=()=>void cookieAction(()=>api.importCookies(cookieText.value),'校验通过，已加密保存。');
$('#cookieFile').onclick=()=>void cookieAction(()=>api.importCookieFile(),'文件校验通过，已加密保存。导出的 txt 含登录信息，请自行删除。');
$('#cookieClear').onclick=()=>void cookieAction(()=>api.clearCookies(),'已清空本机保存的 Cookie。');

for(const node of document.querySelectorAll('[role=tab]'))node.onclick=()=>select(node.dataset.tab);
$('#newer').onclick=()=>{page--;void showLibrary(true);};
$('#older').onclick=()=>{page++;void showLibrary(true);};
let typing;
search.oninput=()=>{clearTimeout(typing);typing=setTimeout(()=>{page=0;void showLibrary();},200);};
$('#resumeAll').onclick=act(()=>resume('resume-all'));
api.onChanged(()=>void refresh());
api.onTab(()=>void takeTab());
// 回到窗口时重读，发现被外部移走的文件。
window.addEventListener('focus',()=>{void refresh();if(tab==='library')void showLibrary();});
setInterval(()=>{if(tab==='queue')paint();},1000);
await takeTab();
await refresh();
