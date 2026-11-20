const api=window.conversations,day=document.querySelector('#day'),list=document.querySelector('#turns'),status=document.querySelector('#status');
const clock=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
let generation=0, view='chat';
const older=document.getElementById('older'),refreshLog=document.getElementById('refreshLog');
let nextLogPage=null;
let deciding=false;
const schedule=document.getElementById('schedule'),checkPages=document.getElementById('checkPages');
let targetView,checkPage=0,nextAt=null,countdown,checksRefresh;
const noticeControls=document.getElementById('noticeControls'),noticeDetail=document.getElementById('noticeDetail');
let noticeFilter='unread';
function pagination(data){
  checkPage=data.page;
  checkPages.hidden=data.pages<=1;
  document.getElementById('checkPage').textContent=(checkPage+1)+' / '+data.pages;
  document.getElementById('previousCheck').disabled=checkPage<=0;
  document.getElementById('nextCheckPage').disabled=checkPage+1>=data.pages;
}
function renderNotices(data){
  noticeControls.hidden=false;pagination(data);
  for(const b of noticeControls.querySelectorAll('[data-filter]'))b.setAttribute('aria-pressed',String(b.dataset.filter===data.filter));
  document.getElementById('readAll').disabled=!data.unread;
  list.replaceChildren(...data.events.map(item=>{
    const row=element('section','');row.className='event';
    const button=element('button',item.title+(item.seen?'':' · 未读'));
    button.onclick=async()=>{
      noticeDetail.textContent=item.body;
      if(!item.seen)try{await api.markNoticeRead(item.id);}catch{status.textContent='已读状态保存失败，请重试。';}
    };
    row.append(element('time',new Date(item.at).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo',hour12:false})+' JST'),button);
    return row;
  }));
  status.textContent=data.events.length?'':data.filter==='unread'?'没有未读提醒。':'没有符合条件的提醒。';
}
function remaining(){
  if(!nextAt)return '';
  const minutes=Math.ceil((nextAt-Date.now())/60_000);
  return minutes>0?'还有 '+minutes+' 分钟':'已到计划时间';
}
function renderChecks(data){
  checkPage=data.page;nextAt=data.nextAt;
  schedule.hidden=false;
  const nextLabel=data.first?'等待首次检查':'下一轮事项轮询';
  document.getElementById('nextCheck').textContent=nextAt?nextLabel+' · '+new Date(nextAt).toLocaleString('zh-CN',
    {timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+' JST':'事项轮询未启动';
  const counter=document.getElementById('remaining');
  counter.textContent=remaining();
  countdown=setInterval(()=>{if(!document.hidden)counter.textContent=remaining();},1000);
  document.getElementById('checkState').textContent=[data.running?'正在检查到期事项':data.pending?'提醒检查任务等待空闲执行':'',
    data.nextWeatherAt?'下次天气检查 '+clock.format(data.nextWeatherAt)+' JST':'',
    data.nextTaskAt?'下次任务轮询 '+clock.format(data.nextTaskAt)+' JST':''].filter(Boolean).join(' · ');
  list.replaceChildren(...data.events.map(event=>{
    const row=element('section','');row.className='event';
    const timing=clock.format(event.at)+' JST'+(event.at-event.due>=1000?' · 原定 '+clock.format(event.due):'');
    row.append(element('time',timing),element('h2',event.project+' · '+event.status),element('p',event.detail));
    return row;
  }));
  status.textContent=data.events.length?'':'所选日期还没有提醒检查记录。';
  pagination(data);
}
function element(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
const report=document.getElementById('taskReport'),contents=document.getElementById('reportContents');
const viewer=document.getElementById('pictureViewer'),original=document.getElementById('pictureOriginal');
const phase={generate:'文字生图',img2img:'图生图',edit:'定向编辑',upscale:'高清放大'};
const stamp=value=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo',hour12:false})+' JST';
let reportToken=0,pictureToken=0;
const pictureObservers=new Set();
function clearPictureObservers(){for(const observer of pictureObservers)observer.disconnect();pictureObservers.clear();}
function closePicture(){if(viewer.open)viewer.close();}
viewer.onclose=()=>{
  pictureToken++;original.removeAttribute('src');document.getElementById('pictureCanvas').classList.remove('actual');
  document.getElementById('pictureScale').textContent='原始大小';
  void api.reportFullscreen(false).catch(()=>{});
};
document.getElementById('pictureClose').onclick=closePicture;
document.getElementById('pictureScale').onclick=event=>{
  const actual=document.getElementById('pictureCanvas').classList.toggle('actual');
  event.currentTarget.textContent=actual?'适应屏幕':'原始大小';
};
document.getElementById('reportClose').onclick=()=>report.close();
report.onclose=()=>{if(!report.open){reportToken++;closePicture();clearPictureObservers();contents.replaceChildren();}};
function picture(day,id,step){
  const button=element('button',''),img=element('img','');
  button.type='button';button.className='result-picture';button.title='全屏查看原图';
  img.alt='第 '+step.step+' 步结果';button.append(img);
  const observer=new IntersectionObserver(entries=>{
    if(!entries.some(e=>e.isIntersecting))return;
    observer.disconnect();pictureObservers.delete(observer);
    api.reportImage(day,id,step.step).then(src=>{img.src=src;}).catch(()=>{img.alt='预览未能读取，点击查看原图';});
  },{root:report});pictureObservers.add(observer);observer.observe(button);
  button.onclick=async()=>{
    const token=++pictureToken;
    viewer.showModal();original.alt='正在读取原图…';
    try{
      await api.reportFullscreen(true);
      const src=await api.reportImage(day,id,step.step,true);
      if(viewer.open&&token===pictureToken){original.src=src;original.alt=img.alt;}
    }catch{if(token===pictureToken)original.alt='原图读取失败，请检查对话归档。';}
  };
  return button;
}
function reportButton(date,id,label='查看详情'){
  const button=element('button',label);
  button.onclick=async()=>{
    const token=++reportToken;
    clearPictureObservers();
    contents.textContent='正在读取任务报告…';report.showModal();
    try{
      const {turn,events}=await api.report(date,id);
      if(!report.open||token!==reportToken)return;
      contents.replaceChildren();
      if(turn){
        contents.append(element('h3',turn.question),element('p',turn.text),element('small','编号 '+id+' · '+stamp(turn.at)+' 提交'));
        if(turn.answeredAt)contents.append(element('p',stamp(turn.answeredAt)+' 结束'));
        if(turn.report.workflowVersion)contents.append(element('small','工作流 '+turn.report.workflowVersion));
        for(const s of turn.report.steps){
          const section=element('section','');section.className='event';
          section.append(element('h3','第 '+s.step+' 步 · '+(phase[s.operation]??'图像结果')));
          if(s.started&&s.finished)section.append(element('time',stamp(s.started)+' 至 '+stamp(s.finished)));
          if(s.width&&s.height)section.append(element('p',s.width+' × '+s.height+' 像素'));
          if(s.image){
            section.append(picture(date,id,s));
            const copy=element('button','复制图片路径');
            copy.onclick=async()=>{try{await api.reportImage(date,id,s.step,'copy');copy.textContent='已复制图片路径';}catch{copy.textContent='复制失败，请重试';}};
            section.append(copy);
          }else if(s.error)section.append(element('p',s.error));
          contents.append(section);
        }
      }else{
        contents.append(element('h3',events.at(-1)?.title??'任务记录'),element('small','编号 '+id));
        for(const e of events){
          const section=element('section','');section.className='event';
          section.append(element('time',stamp(e.at)),element('h3',e.action));
          if(e.detail)section.append(element('p',e.detail));
          contents.append(section);
        }
      }
    }catch{if(token===reportToken)contents.textContent='报告读取失败，请返回后重试。';}
  };return button;
}
const imageRefs=new WeakMap();
const previews=new IntersectionObserver(entries=>{
  for(const {target,isIntersecting} of entries){
    if(!isIntersecting)continue;
    previews.unobserve(target);
    const {day,id}=imageRefs.get(target);
    api.image(day,id).then(src=>{if(src)target.src=src;else target.alt='缩略图缺失';}).catch(()=>{target.alt='缩略图读取失败';});
  }
});
function appendImage(row,ref){
  if(!ref?.day||!ref.id)return;
  const button=element('button',''),image=document.createElement('img');
  button.className='image-preview';button.title='打开归档原图';image.alt='截图缩略图';
  imageRefs.set(image,ref);previews.observe(image);button.append(image);
  button.onclick=()=>api.image(ref.day,ref.id,true).then(error=>{if(error)status.textContent='原图无法打开。';}).catch(()=>{status.textContent='原图无法打开。';});
  row.append(button);
  if(ref.route)row.append(element('small',[ref.route,ref.reason].filter(Boolean).join(' · ')));
}
async function decide(input){
  if(deciding)return;
  deciding=true;list.inert=true;
  let receipt;
  try{receipt=await api.decide(input);}catch{receipt='连接中断，请重新查询事项核对结果。';}
  finally{deciding=false;list.inert=false;}
  if(view==='pending'){await load(undefined,'pending');status.textContent=receipt;}
}
function renderPending(data,explicit){
  const sections=[];
  function button(label,run){const b=element('button',label);b.onclick=run;return b;}
  function section(title,expires){
    const s=element('section','');s.className='event';
    s.append(element('h2',title),element('time','有效至 '+clock.format(expires)+' JST'));sections.push(s);return s;
  }
  for(const choice of data.choices){
    const s=section('要修改哪些事项？',choice.expires),selected=new Set();
    s.append(element('p',choice.question));
    const next=button('查看修改方案',()=>decide({action:'select',id:choice.id,ids:[...selected]}));next.disabled=true;
    for(const item of choice.candidates){
      const label=element('label',''),box=element('input','');box.type='checkbox';box.disabled=Boolean(item.locked);
      box.onchange=()=>{if(box.checked)selected.add(item.id);else selected.delete(item.id);next.disabled=selected.size===0;};
      label.className='candidate';label.append(box,document.createTextNode(['#'+item.id,item.title,item.deadline,item.content,item.locked].filter(Boolean).join(' · ')));s.append(label);
    }
    s.append(next,button('放弃本次选择',()=>decide({action:'dismiss',id:choice.id})));
  }
  if(data.entries.length){
    const s=section('修改提醒 · '+data.entries.length+' 项',data.expires);
    for(const item of data.entries){
      s.append(element('h3','#'+item.id+' '+item.title),element('p',item.conflict?'版本已变化，此项会跳过。':item.diff.join('\n')));
    }
    s.append(button('同意这组修改',()=>decide({action:'approve',token:data.token})),button('放弃这组修改',()=>decide({action:'reject',token:data.token})));
  }
  list.replaceChildren(...sections);
  if(explicit)api.reviewed?.(data.choices.length?'':data.token);
  status.textContent=sections.length?'可以先关闭，稍后再决定。':'没有待确认的提醒修改。';
}
function logRow(line){
  const row=element('section','');row.className='event';
  let data;
  try{data=JSON.parse(line);}catch{}
  if(!data||typeof data!=='object'){row.append(element('p',line));return row;}
  const {time,direction,method,route,status:code,duration_ms,local_ms,cloud_ms,error,image,...detail}=data;
  const split=Number.isFinite(local_ms)&&Number.isFinite(cloud_ms);
  const operation=split?detail.operation:undefined;
  if(operation)delete detail.operation;
  const heading=[({send:'发送',receive:'回执',local:'本机操作'})[direction]??direction,method,route,operation].filter(Boolean).join(' · ');
  if(time)row.append(element('time',String(time)));
  if(heading)row.append(element('h2',heading));
  const result=[code&&'HTTP '+code,Number.isFinite(duration_ms)&&(split?'总计 ':'')+duration_ms+' 毫秒',
    split&&'本地思索 '+local_ms+' 毫秒',split&&'云端流程 '+cloud_ms+' 毫秒',error].filter(Boolean).join(' · ');
  if(result)row.append(element('p',result));
  appendImage(row,image);
  if(Object.keys(detail).length)row.append(element('pre',JSON.stringify(detail,null,2)));
  return row;
}
async function load(date,requestedView,explicit=true,cursor=null) {
  const token=++generation;
  targetView=requestedView;
  if(requestedView!=='notices'||!cursor){noticeDetail.textContent='';noticeFilter='unread';}
  noticeControls.hidden=true;
  clearInterval(countdown);clearTimeout(checksRefresh);
  schedule.hidden=true;checkPages.hidden=true;
  if(requestedView==='checks')status.textContent='正在读取检查记录…';
  older.disabled=true;
  if(requestedView==='log')status.textContent='正在读取日志…';
  try{
    const data=await api.read(date,requestedView,cursor);
    if(token!==generation)return;
    if(!cursor)previews.disconnect();
    day.value=data.day;
    view=data.view;
    targetView=view;
    for(const id of ['tasks','chat','checks','notices','pending','log'])document.getElementById(id).setAttribute('aria-pressed',String(id===view));
    day.parentElement.hidden=view==='pending'||view==='notices'||view==='log'&&!data.dated;
    refreshLog.hidden=view!=='log'&&view!=='checks';refreshLog.textContent=view==='checks'?'刷新检查记录':'刷新日志';older.hidden=true;
    if(view==='checks'){renderChecks(data);return;}
    if(view==='notices'){renderNotices(data);return;}
    if(view==='log'){
      if(!cursor)list.replaceChildren();
      list.append(...data.lines.map(logRow));
      nextLogPage=data.next;older.hidden=!nextLogPage;older.disabled=false;
      status.textContent=data.warning??(data.failed?'最近一次日志写入失败。':list.childElementCount?'':'还没有任务收发日志。');
      return;
    }
    if(view==='pending'){renderPending(data,explicit);return;}
    if(view==='tasks'){
      const last=new Map(data.events.map(e=>[e.task_id,e]));
      list.replaceChildren(...data.events.map(event=>{
        const row=element('section','');row.className='event';
        row.append(element('time',clock.format(event.at)+' JST'),element('h2',event.title+' · '+event.action));
        if(event.detail)row.append(element('p',event.detail));
        row.append(element('small','编号 '+event.task_id));
        if(event.task_id&&last.get(event.task_id)===event)row.append(reportButton(data.day,event.task_id));
        return row;
      }));
      status.textContent=data.events.length?'':'当天还没有任务操作记录。';
      return;
    }
    let focus;
    list.replaceChildren(...data.turns.map(turn=>{
      const row=document.createElement('details');
      const summary=document.createElement('summary');
      summary.append(element('time','我 · '+clock.format(turn.at)+' JST'+(turn.retry?' · 手动重试':'')),document.createTextNode(turn.question));
      const speaker=turn.state==='error'?'处理状态':'绯月';
      row.append(summary,element('small',speaker+(turn.answeredAt?' · '+new Date(turn.answeredAt).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo',hour12:false})+' JST':'')),element('p',turn.text));
      appendImage(row,turn.image);
      if(turn.report?.job===turn.id)row.append(reportButton(data.day,turn.id,'查看图像报告'));
      if(turn.failures?.length){
        const errors=element('section','');
        errors.className='failure-log';
        errors.append(element('strong','错误记录（'+turn.failures.length+'）'));
        for(const entry of turn.failures){
          const label=[new Date(entry.at).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo',hour12:false})+' JST',entry.operation,
            entry.attempt?'第 '+entry.attempt+' 次请求':'',entry.phase,entry.durationMs+' ms'].filter(Boolean).join(' · ');
          const codes=[entry.httpStatus&&'HTTP '+entry.httpStatus,entry.code,entry.serviceCode!==entry.code&&entry.serviceCode,entry.ray&&'Ray ID '+entry.ray].filter(Boolean).join(' · ');
          errors.append(element('time',label),element('p',[codes,entry.text].filter(Boolean).join('\n')));
        }
        row.append(errors);
      }
      for(const source of turn.sources??[]){
        const button=element('button',new URL(source.url).hostname+' · '+source.title);
        button.className='source';button.onclick=()=>api.openSource(source.url);
        row.append(button);
      }
      if(turn.id===data.selectedId){row.open=true;focus=row;}
      return row;
    }));
    status.textContent=data.warning??(data.turns.length?'':'当天还没有对话。');
    focus?.scrollIntoView({block:'nearest'});
  }catch{if(token===generation){list.replaceChildren();status.textContent='本地记录读取失败，可重新选择日期或记录类型再试。';}}
}
day.addEventListener('change',()=>{if(day.value)void load(day.value,view);});
for(const id of ['tasks','chat','checks','notices','pending','log'])document.getElementById(id).onclick=()=>load(day.value||undefined,id);
older.onclick=()=>{if(nextLogPage)void load(day.value,'log',true,nextLogPage);};
refreshLog.onclick=()=>load(day.value,view,true,view==='checks'?checkPage:null);
function checkPageAt(page){return load(day.value,view,false,view==='notices'?{page,filter:noticeFilter}:page);}
document.getElementById('previousCheck').onclick=()=>checkPageAt(checkPage-1);
document.getElementById('nextCheckPage').onclick=()=>checkPageAt(checkPage+1);
for(const b of noticeControls.querySelectorAll('[data-filter]'))b.onclick=()=>{
  noticeDetail.textContent='';noticeFilter=b.dataset.filter;void checkPageAt(0);
};
document.getElementById('readAll').onclick=()=>api.markNoticeRead('all').catch(()=>{status.textContent='已读状态保存失败，请重试。';});
api.onChecks?.(()=>{
  if(!['checks','notices'].includes(targetView)||targetView!==view)return;
  clearTimeout(checksRefresh);
  checksRefresh=setTimeout(()=>{if(targetView===view)void checkPageAt(checkPage);},80);
});
api.onPending?.(()=>{if(view==='pending'&&!deciding)void load(undefined,'pending',false);});
api.onTasks?.(()=>{if(targetView==='tasks'&&!report.open)void load(day.value,'tasks',false);});
api.onSelect(()=>load());void load();
