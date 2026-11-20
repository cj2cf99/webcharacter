const api=window.conversations,day=document.querySelector('#day'),list=document.querySelector('#turns'),status=document.querySelector('#status');
const clock=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
let generation=0, view='chat';
const older=document.getElementById('older'),refreshLog=document.getElementById('refreshLog');
let nextLogPage=null;
let deciding=false;
function element(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
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
  older.disabled=true;
  if(requestedView==='log'||cursor)status.textContent='正在读取日志…';
  try{
    const data=await api.read(date,requestedView,cursor);
    if(token!==generation)return;
    if(!cursor)previews.disconnect();
    day.value=data.day;
    view=data.view;
    for(const id of ['tasks','chat','pending','log'])document.getElementById(id).setAttribute('aria-pressed',String(id===view));
    day.parentElement.hidden=view==='pending'||view==='log'&&!data.dated;
    refreshLog.hidden=view!=='log';older.hidden=true;
    if(view==='log'){
      if(!cursor)list.replaceChildren();
      list.append(...data.lines.map(logRow));
      nextLogPage=data.next;older.hidden=!nextLogPage;older.disabled=false;
      status.textContent=data.warning??(data.failed?'最近一次日志写入失败。':list.childElementCount?'':'还没有任务收发日志。');
      return;
    }
    if(view==='pending'){renderPending(data,explicit);return;}
    if(view==='tasks'){
      list.replaceChildren(...data.events.map(event=>{
        const row=element('section','');row.className='event';
        row.append(element('time',clock.format(event.at)+' JST'),element('h2',event.title+' · '+event.action));
        if(event.detail)row.append(element('p',event.detail));
        row.append(element('small','编号 '+event.task_id));return row;
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
for(const id of ['tasks','chat','pending','log'])document.getElementById(id).onclick=()=>load(day.value||undefined,id);
older.onclick=()=>{if(nextLogPage)void load(day.value,'log',true,nextLogPage);};
refreshLog.onclick=()=>load(day.value,'log');
api.onPending?.(()=>{if(view==='pending'&&!deciding)void load(undefined,'pending',false);});
api.onSelect(()=>load());void load();
