const api=window.conversations,day=document.querySelector('#day'),list=document.querySelector('#turns'),status=document.querySelector('#status');
const clock=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
let generation=0, view='chat';
const refreshLog=document.getElementById('refreshLog');
const short=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
// 多数只看最新几条：对话和任务复盘每页 6 条（当天数据已读入，只渲染当前页）；检查、提醒、日志由主进程分页。
const PAGE=6;
let local=null,logCursors=[null],logIndex=0;
let deciding=false;
let pendingReceipt='';
const schedule=document.getElementById('schedule'),checkPages=document.getElementById('checkPages');
let targetView,checkPage=0,nextAt=null,countdown,checksRefresh;
const noticeControls=document.getElementById('noticeControls'),noticeDetail=document.getElementById('noticeDetail');
let noticeFilter='unread';
const threadTabs=document.getElementById('threadTabs');
const threadButtons=[...threadTabs.querySelectorAll('[data-category]')];
const briefTime=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const tokyoDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'});
let threadData,openedThread,threadRefresh;
function button(label,action){
  const node=element('button',label);
  node.type='button';
  node.onclick=async()=>{
    node.disabled=true;
    try{await action();}
    catch(error){status.textContent=error.message||'操作失败，请重试。';}
    finally{node.disabled=false;}
  };
  return node;
}
function threadCard(row,data,shown=false){
  const tone=row.closed!==null?'muted':row.error?'danger':row.pending?'info':'accent';
  const cardNode=card('details',tone);
  const time=row.latest&&tokyoDay.format(row.latest)===data.day?briefTime.format(row.latest):'最新 '+short.format(row.latest);
  const state=row.closed!==null?'已结束':row.rounds>100?'只读':row.error?'可重试':row.pending?'等绯月回':'等你回';
  const summary=element('summary','','thread-summary');
  const title=row.title||row.preview?.text?.slice(0,28)||'新对话';
  summary.append(head(title,chip(state,row.closed!==null?'ok':tone),element('time',time)));
  if(row.preview?.text&&row.preview.text!==title)summary.append(element('p',row.preview.text,'fy-clamp'));
  if(row.sourceLabel)summary.append(element('small',row.sourceLabel,'fy-meta'));
  const detail=element('div','','thread-detail');
  cardNode.append(summary,detail);cardNode.dataset.thread=row.id;
  let reading=0;
  async function fill(){
    const token=++reading;
    openedThread=row.id;
    detail.replaceChildren(element('p','正在读取发言…','fy-meta'));
    try{
      const value=await api.thread(row.id);
      if(token!==reading||!cardNode.open||!cardNode.isConnected)return;
      const source=element('details','','thread-source');
      source.append(element('summary',value.source?.label||'来源'));
      source.append(element('p',[value.origin,value.source?.reference,value.source?.excerpt||(!value.source?.url?'来源未保存':'')].filter(Boolean).join('\n')));
      if(value.source?.url)source.append(button('打开原件',()=>api.openSource(value.source.url)));
      const talk=element('section','','thread-talk');
      for(const message of value.messages){
        const entry=element('article','','thread-message');entry.dataset.who=message.who;
        entry.append(element('small',message.who+' · '+stamp(message.at),'fy-meta'),element('p',message.text));
        if(message.transcriptId)entry.append(button('查看待确认卡',()=>api.threadDraft(value.id,message.transcriptId)));
        for(const ref of message.sources??[])if(ref.url)entry.append(button(ref.title||'打开来源',()=>api.openSource(ref.url)));
        talk.append(entry);
      }
      const actions=element('div','','thread-actions');
      if(value.closed===null||value.rounds>100)actions.append(button('继续聊天',()=>api.openThread(value.id)));
      if(value.error&&value.closed===null&&value.rounds<=100)actions.append(button('重试',()=>api.retryThread(value.id)));
      if(value.organizationId)actions.append(button('查看整理进度',()=>api.threadDraft(value.id,value.organizationId)));
      if(value.closed===null&&value.rounds<=100){
        const note=element('form','','thread-note');
        const text=element('textarea','');
        text.rows=2;text.maxLength=2000;text.placeholder='留言给绯月…';text.setAttribute('aria-label','简单回复');text.required=true;
        const send=element('button','发送便签');send.type='submit';
        const feedback=element('small','','fy-meta');feedback.setAttribute('role','status');
        const quick=button('简单回复',()=>{note.hidden=!note.hidden;if(!note.hidden)text.focus();});
        let key;
        note.hidden=true;
        note.append(text,send,feedback);
        text.oninput=()=>{key=undefined;};
        note.onsubmit=async event=>{
          event.preventDefault();if(!text.value.trim()||send.disabled)return;
          send.disabled=true;
          try{
            const receipt=await api.note(value.id,{text:text.value,messageId:key??=crypto.randomUUID()});
            if(!receipt.accepted)throw Error('便签未能提交');
            text.value='';key=undefined;feedback.textContent='已留言，回复后可在这里查看。';
          }catch(error){feedback.textContent=error.message;}
          finally{send.disabled=false;}
        };
        actions.append(quick,note);
      }
      detail.replaceChildren(source,talk,actions);
    }catch{
      if(token===reading&&cardNode.open)detail.replaceChildren(button('读取失败 · 重试',fill));
    }
  }
  cardNode.ontoggle=()=>{if(cardNode.open)void fill();else if(openedThread===row.id)openedThread=null;};
  cardNode.open=shown;
  return cardNode;
}
function drawThreads(data){
  threadData=data;
  document.getElementById('questionCount').textContent=data.counts.question??0;
  document.getElementById('activeCount').textContent=data.counts.ordinary??0;
  for(const tab of threadButtons)tab.setAttribute('aria-pressed',String(tab.dataset.category===data.category));
  const rows=data.rows.map((row,index)=>stagger(threadCard(row,data,row.id===(data.target??openedThread)),index));
  for(const entry of data.special){
    const item=card('section','accent');
    item.append(head(entry.title||'绯月专聊',chip(entry.status,'accent')),button('打开专聊',()=>api.resumeAudit(entry.id)));
    rows.push(item);
  }
  if(data.target&&!data.rows.some(row=>row.id===data.target)){
    const target=card('section','accent');
    const loading=element('p','正在定位对话…','fy-meta');
    target.append(loading);rows.unshift(target);
    void api.thread(data.target).then(value=>{
      if(target.isConnected&&value)target.replaceWith(threadCard(value,data,true));
    }).catch(()=>{loading.textContent='这条对话暂时无法读取。';});
  }
  if(data.legacy.length){
    const old=card('details','muted');
    old.append(element('summary','旧对话记录（'+data.legacy.length+'）'));
    const contents=element('div','','thread-detail');
    let page=0;
    function drawLegacy(){
      contents.replaceChildren(...data.legacy.slice(page*PAGE,(page+1)*PAGE).map(turn=>legacyCard(turn,data.day)));
      if(page>0)contents.append(button('较新',()=>{page--;drawLegacy();}));
      if((page+1)*PAGE<data.legacy.length)contents.append(button('较早',()=>{page++;drawLegacy();}));
    }
    old.addEventListener('toggle',()=>{if(old.open&&!contents.childElementCount)drawLegacy();});
    old.append(contents);rows.push(old);
  }
  list.replaceChildren(...rows);
  setPager(data.page,data.pages);
  status.textContent=rows.length?'':{questions:'没有待确认的提问。',active:'没有进行中的对话。',history:'当天还没有对话。'}[data.category];
}
function setPager(page,pages,more=page+1<pages){
  checkPages.hidden=page===0&&!more;
  document.getElementById('checkPage').textContent=pages?(page+1)+' / '+pages:'第 '+(page+1)+' 页';
  document.getElementById('previousCheck').disabled=page<=0;
  document.getElementById('nextCheckPage').disabled=!more;
}
function pagination(data){checkPage=data.page;setPager(data.page,data.pages);}
// 本地分页：rows 是建卡片的函数，只为当前页建 DOM（图片缩略图也随之按需读取）。
function showLocal(rows,page=0){local={rows,page};drawLocal();}
function drawLocal(){
  const pages=Math.max(1,Math.ceil(local.rows.length/PAGE));
  local.page=Math.max(0,Math.min(local.page,pages-1));
  previews.disconnect();
  list.replaceChildren(...local.rows.slice(local.page*PAGE,(local.page+1)*PAGE).map((make,i)=>stagger(make(),i)));
  setPager(local.page,pages);
}
function stagger(node,i){node.style.setProperty('--i',i);return node;}
function card(tag,tone){const node=document.createElement(tag);node.className='fy-card';if(tone)node.dataset.tone=tone;return node;}
function chip(text,tone){const node=element('span',text,'fy-chip');if(tone)node.dataset.tone=tone;return node;}
function head(title,...extra){const node=element('div','','fy-head');node.append(element('h2',title),...extra.filter(Boolean));return node;}
const statusTone=text=>/失败|错误|异常/.test(text)?'danger':/未执行|中断|等待|忙|跳过/.test(text)?'warn':/已|完成|成功/.test(text)?'ok':'info';
function renderNotices(data){
  noticeControls.hidden=false;pagination(data);
  for(const b of noticeControls.querySelectorAll('[data-filter]'))b.setAttribute('aria-pressed',String(b.dataset.filter===data.filter));
  document.getElementById('readAll').disabled=!data.unread;
  list.replaceChildren(...data.events.map((item,i)=>{
    const button=stagger(card('button',item.seen?'muted':'accent'),i);
    button.type='button';button.classList.add('notice');
    if(item.seen)button.dataset.seen='';else button.append(element('span','','fy-dot'));
    button.append(element('span',item.title,'fy-title'),element('time',short.format(item.at)));
    button.title=item.seen?'已读':'未读';
    button.onclick=async()=>{
      noticeDetail.textContent=item.title+'\n'+item.body;
      if(!item.seen)try{await api.markNoticeRead(item.id);}catch{status.textContent='已读状态保存失败，请重试。';}
    };
    return button;
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
  list.replaceChildren(...data.events.map((event,i)=>{
    const tone=statusTone(event.status),row=stagger(card('section',tone),i);
    const timing=clock.format(event.at)+(event.at-event.due>=1000?' · 原定 '+clock.format(event.due):'');
    row.append(head(event.project,chip(event.status,tone),element('time',timing)));
    if(event.detail)row.append(element('p',event.detail,'fy-meta fy-clamp'));
    return row;
  }));
  status.textContent=data.events.length?'':'所选日期还没有提醒检查记录。';
  pagination(data);
}
function element(tag,text,className){const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;}
// 同一毫秒内按原时间线的逆序展示，最新回执保留详情入口。
const newestFirst=events=>events.toReversed().sort((a,b)=>b.at-a.at);
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
      const {turn,events,reviews,reviewWarning}=await api.report(date,id);
      if(!report.open||token!==reportToken)return;
      contents.replaceChildren();
      if(reviews?.length){
        const section=element('section','');section.className='fy-card task-reviews';section.dataset.tone='accent';
        section.append(element('h3','绯月的评价'));
        for(const item of reviews){
          if(reviews.length>1)section.append(element('time',stamp(item.at)));
          section.append(element('p',item.review));
        }
        contents.append(section);
      }
      if(turn){
        contents.append(element('h3',turn.question),element('p',turn.text),element('small','编号 '+id+' · '+stamp(turn.at)+' 提交'));
        if(turn.answeredAt)contents.append(element('p',stamp(turn.answeredAt)+' 结束'));
        if(turn.report.workflowVersion)contents.append(element('small','工作流 '+turn.report.workflowVersion));
        if(turn.report.tour){
          const {destination,outfit,pose,location,camera}=turn.report.tour;
          contents.append(element('p',destination+' · '+(location?'实景参考 · '+location.title:'本机合成背景')),
            element('small','服装：'+outfit.title+'（'+outfit.author+'） · 姿势：'+pose.title+'（'+pose.author+'）'));
          if(camera)contents.append(element('small','镜头：'+camera.title+'（'+camera.author+'）'));
        }
        for(const s of turn.report.steps){
          const section=element('section','');section.className='fy-card';
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
        for(const e of newestFirst(events)){
          const section=element('section','');section.className='fy-card';
          section.append(element('time',stamp(e.at)),element('h3',e.action));
          if(e.detail)section.append(element('p',e.detail));
          contents.append(section);
        }
      }
      if(reviewWarning)contents.append(element('small',reviewWarning));
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
  if(targetView==='pending'){
    pendingReceipt=receipt;
    await load(undefined,'pending');
  }
}
function appendQuestionCitation(card,question){
  const source=question.citation;
  if(!source)return;
  card.append(element('p','来源 · '+source.reference,'fy-meta'));
  if(source.excerpt)card.append(element('blockquote',source.label+'\n'+source.excerpt,'question-quote'));
  if(!source.canExpand){
    if(!source.excerpt)card.append(element('p','本机暂无对应手记。','fy-meta'));
    return;
  }
  const details=element('details','','question-citation');
  const summary=element('summary','');
  const caret=element('span','›','fy-caret');
  caret.setAttribute('aria-hidden','true');
  summary.append(caret,document.createTextNode('查看来源上下文'));
  const content=element('div','');
  let loading=false,loaded=false;
  details.append(summary,content);
  details.ontoggle=async()=>{
    if(!details.open||loading||loaded)return;
    loading=true;
    content.textContent='正在读取来源…';
    try{
      const result=await api.questionCitation(question.id);
      if(!result?.body&&!result?.quote)throw Error();
      content.replaceChildren();
      if(result.quote&&result.quote!==source.excerpt)content.append(element('blockquote',result.label+'\n'+result.quote,'question-quote'));
      if(result.body)content.append(element('small','来源手记','fy-meta'),element('p',result.body));
      loaded=true;
    }catch{content.textContent='暂时无法读取来源，收起后可重新展开。';}
    finally{loading=false;}
  };
  card.append(details);
}
function renderPending(data,explicit){
  const sections=[];
  function button(label,run){const b=element('button',label);b.onclick=run;return b;}
  function section(title,expires){
    const s=stagger(card('section','warn'),sections.length);
    s.append(head(title,chip('⏳ '+clock.format(expires).slice(0,5)+' 前','warn')));sections.push(s);return s;
  }
  for(const [index,question] of (data.questions??[]).entries()){
    const s=stagger(card('section','accent'),sections.length);
    const resume=button(question.privateChat?(question.active?'回到专聊':question.title):'回答',async()=>{
      resume.disabled=true;
      try{status.textContent=await api.resumeAudit(question.id);}catch(error){status.textContent=error.message;}
      finally{resume.disabled=false;}
    });
    s.append(head(question.kind??'绯月的质问',index===0&&!question.privateChat?chip('最想知道','accent'):null,
      chip(question.status,question.status==='意外中断'?'warn':'info')));
    if(question.privateChat){
      const portrait=element('img');
      portrait.src='./feiyue-faces/waiting-b.png';portrait.alt='';
      resume.classList.add('private-chat-invite');
      resume.prepend(portrait);
      if(question.active&&question.stage)s.append(element('p',question.stage,'fy-clamp'));
    }else{
      s.append(element('p',question.title,'fy-clamp'));
      appendQuestionCitation(s,question);
    }
    s.append(resume);
    sections.push(s);
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
  if(sections.length)pendingReceipt='';
  status.textContent=pendingReceipt||(data.questions?.length?'绯月有 '+data.questions.length+' 个问题等你回答。':sections.length?'可以先关闭，稍后再决定。':'没有待确认的事项。');
}
function logRow(line){
  const row=card('section','muted');
  let data;
  try{data=JSON.parse(line);}catch{}
  if(!data||typeof data!=='object'){row.append(element('p',line,'fy-clamp'));return row;}
  if(data.category==='绯月自主行动'){
    const time=clock.format(new Date(data.started_at));
    row.append(head(data.category+' · '+data.route,chip(data.stage,'accent'),element('time',time+(data.stage==='未执行'?' JST 调度检查':' JST 开始'))),
      element('p',data.goal));
    if(data.stage!=='开始'){
      const elapsed=Number.isFinite(data.duration_ms)?(data.duration_ms/1000).toFixed(1)+' 秒':'耗时未知';
      row.append(element('p',[data.finished_at!=null?stamp(data.finished_at)+' 结束':'结束时间未知',elapsed].join(' · '),'fy-meta'),element('p',data.result));
    }
    const more=element('details','');
    more.append(element('summary','行动编号'),element('p',data.action_id+(data.parent_id?' · 所属轮询 '+data.parent_id:'')));
    row.append(more);return row;
  }
  const {time,direction,method,route,status:code,duration_ms,local_ms,cloud_ms,error,image,...detail}=data;
  const split=Number.isFinite(local_ms)&&Number.isFinite(cloud_ms);
  const operation=split?detail.operation:undefined;
  if(operation)delete detail.operation;
  const heading=[({send:'发送',receive:'回执',local:'本机操作'})[direction]??direction,method,route,operation].filter(Boolean).join(' · ');
  row.dataset.tone=error||code>=400?'danger':direction==='send'?'info':direction==='receive'?'ok':'accent';
  const at=time&&new Date(time);
  row.append(head(heading||'记录',(code||error)&&chip(error?'✕ '+error:String(code),row.dataset.tone),
    at&&Number.isFinite(at.getTime())?element('time',clock.format(at)):time&&element('time',String(time))));
  const result=[Number.isFinite(duration_ms)&&(split?'总计 ':'')+duration_ms+' ms',
    split&&'本地 '+local_ms+' ms',split&&'云端 '+cloud_ms+' ms'].filter(Boolean).join(' · ');
  if(result)row.append(element('p',result,'fy-meta'));
  appendImage(row,image);
  if(Object.keys(detail).length){
    const more=element('details',''),summary=element('summary','');
    summary.append(element('span','›','fy-caret'),document.createTextNode(' 明细'));summary.className='fy-meta';
    more.append(summary,element('pre',JSON.stringify(detail,null,2)));
    if(detail.ai_step_id&&api.aiStep){
      const snapshot=element('details','');
      snapshot.append(element('summary','AI 调用快照'));
      snapshot.ontoggle=async()=>{
        if(!snapshot.open||snapshot.childElementCount>1)return;
        const output=element('pre','正在读取…');snapshot.append(output);
        try{
          const data=await api.aiStep(detail.ai_step_id);
          output.textContent=data?JSON.stringify(data,null,2):'快照未找到';
        }catch{output.textContent='快照读取失败，关闭后可重试。';snapshot.addEventListener('toggle',()=>{if(!snapshot.open)output.remove();},{once:true});}
      };
      more.append(snapshot);
    }
    row.append(more);
  }
  return row;
}
function legacyCard(turn,date){
  const row=card('details',turn.state==='error'?'danger':turn.failures?.length?'warn':'accent');
  const summary=document.createElement('summary'),answer=element('div','','answer');
  summary.append(element('span','›','fy-caret'),element('time','我 · '+clock.format(turn.at)+(turn.retry?' · 手动重试':'')),element('span',turn.question,'q fy-clamp'));
  const speaker=turn.state==='error'?'处理状态':'绯月';
  answer.append(element('small',speaker+(turn.answeredAt?' · '+clock.format(turn.answeredAt):'')),element('p',turn.text));
  appendImage(answer,turn.image);
  if(turn.report?.job===turn.id)answer.append(reportButton(date,turn.id,'查看图像报告'));
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
    answer.append(errors);
  }
  for(const source of turn.sources??[]){
    let url;
    try{url=new URL(source?.url);}catch{continue;}
    if(!['http:','https:'].includes(url.protocol))continue;
    const button=element('button',url.hostname+' · '+(source.title??'来源'));
    button.className='source';button.onclick=()=>api.openSource(source.url);
    if(source.preview?.startsWith('data:image/')){
      const img=document.createElement('img');img.loading='lazy';img.width=144;img.alt=source.title;img.src=source.preview;
      button.prepend(img);
    }
    answer.append(button);
  }
  row.append(summary,answer);
  return row;
}
async function load(date,requestedView,explicit=true,cursor=null) {
  const token=++generation;
  if(requestedView!=='pending')pendingReceipt='';
  targetView=requestedView;
  if(requestedView!=='notices'||!cursor){noticeDetail.textContent='';noticeFilter='unread';}
  if(requestedView!=='log'||!cursor){logCursors=[null];logIndex=0;}
  noticeControls.hidden=true;
  clearInterval(countdown);clearTimeout(checksRefresh);
  schedule.hidden=true;checkPages.hidden=true;
  refreshLog.setAttribute('aria-busy','true');
  if(requestedView==='checks')status.textContent='正在读取检查记录…';
  if(requestedView==='log')status.textContent='正在读取日志…';
  try{
    const data=await api.read(date,requestedView,cursor);
    if(token!==generation)return;
    previews.disconnect();
    day.value=data.day;
    view=data.view;
    targetView=view;
    for(const id of ['tasks','chat','checks','notices','pending','log'])document.getElementById(id).setAttribute('aria-pressed',String(id===view));
    threadTabs.hidden=!data.category;
    if(!data.category)threadData=null;
    day.parentElement.hidden=view==='pending'||view==='notices'||view==='log'&&!data.dated||Boolean(data.category&&data.category!=='history');
    refreshLog.hidden=view!=='log'&&view!=='checks';refreshLog.title=view==='checks'?'刷新检查记录':'刷新日志';
    if(view==='checks'){renderChecks(data);return;}
    if(view==='notices'){renderNotices(data);return;}
    if(view==='log'){
      list.replaceChildren(...data.lines.map((line,i)=>stagger(logRow(line),i)));
      if(data.next)logCursors[logIndex+1]=data.next;
      setPager(logIndex,0,Boolean(data.next));
      status.textContent=data.warning??(data.failed?'最近一次日志写入失败。':list.childElementCount?'':'还没有任务收发日志。');
      return;
    }
    if(view==='pending'){renderPending(data,explicit);return;}
    if(data.category){drawThreads(data);return;}
    if(view==='tasks'){
      const shown=new Set();
      showLocal(newestFirst(data.events).map(event=>{
        const first=event.task_id&&!shown.has(event.task_id);
        if(first)shown.add(event.task_id);
        return ()=>{
          const tone=statusTone(event.action),row=card('section',tone);
          row.append(head(event.title,chip(event.action,tone),element('time',clock.format(event.at))));
          if(event.detail)row.append(element('p',event.detail,'fy-clamp'));
          row.append(element('small','编号 '+event.task_id,'fy-meta'));
          if(first)row.append(reportButton(data.day,event.task_id));
          return row;
        };
      }));
      status.textContent=data.events.length?'':'当天还没有任务操作记录。';
      return;
    }
    let focus=null;
    const rows=data.turns.map(turn=>()=>{
      const row=legacyCard(turn,data.day);
      if(turn.id===data.selectedId){row.open=true;focus=row;}
      return row;
    });
    const selected=data.turns.findIndex(turn=>turn.id===data.selectedId);
    showLocal(rows,selected<0?0:Math.floor(selected/PAGE));
    status.textContent=data.warning??(data.turns.length?'':'当天还没有对话。');
    focus?.scrollIntoView({block:'nearest'});
  }catch{if(token===generation){list.replaceChildren();status.textContent='本地记录读取失败，可重新选择日期或记录类型再试。';}}
  finally{
    if(token===generation){refreshLog.removeAttribute('aria-busy');status.classList.toggle('fy-empty',!list.childElementCount);}
  }
}
day.addEventListener('change',()=>{if(day.value)void load(day.value,view,true,threadData?{category:'history',page:0}:null);});
for(const id of ['tasks','chat','checks','notices','pending','log'])document.getElementById(id).onclick=()=>load(day.value||undefined,id);
for(const tab of threadButtons)tab.onclick=()=>{
  openedThread=null;
  void load(day.value,'chat',true,{category:tab.dataset.category,page:0});
};
document.getElementById('newThread').onclick=()=>api.newThread().catch(error=>{status.textContent=error.message;});
refreshLog.onclick=()=>load(day.value,view,true,view==='checks'?checkPage:null);
function checkPageAt(page){return load(day.value,view,false,view==='notices'?{page,filter:noticeFilter}:page);}
function turnPage(step){
  if(view==='chat'&&threadData){
    openedThread=null;void load(day.value,'chat',false,{category:threadData.category,page:threadData.page+step});return;
  }
  if(view==='chat'||view==='tasks'){local.page+=step;drawLocal();list.parentElement.scrollTop=0;return;}
  if(view==='log'){
    const index=logIndex+step,cursor=logCursors[index];
    if(index<0||(index>0&&!cursor))return;
    void load(day.value,'log',true,cursor);
    logIndex=index;return; // load 在首个 await 前已重置游标，这里随后记下新页号
  }
  void checkPageAt(checkPage+step);
}
document.getElementById('previousCheck').onclick=()=>turnPage(-1);
document.getElementById('nextCheckPage').onclick=()=>turnPage(1);
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
api.onThreads?.(()=>{
  if(view!=='chat'||!threadData)return;
  clearTimeout(threadRefresh);
  threadRefresh=setTimeout(()=>{
    if(view==='chat'&&threadData&&!list.querySelector('.thread-note:focus-within'))
      void load(day.value,'chat',false,{category:threadData.category,page:threadData.page,target:openedThread});
  },350);
});
api.onSelect(()=>load());void load();
