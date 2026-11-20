// 独立发送给浏览器的模块源码，保留正则和换行转义，避免依赖 Worker 打包器的作用域。
export const memoryScript=String.raw`
  const el=id=>document.getElementById(id);
  const node=(tag,text,cls)=>{
    const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;
  };
  const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
  const stamp=v=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(new Date(v))+' JST';
  const localDay=v=>new Date(Date.parse(v)+32400000).toISOString().slice(0,10);
  const base='/api/companion/memory/';
  let filter='',page=0,total=0,listToken=0,readToken=0,originToken=0,timer,day='';
  const type=()=>location.hash==='#nag'?'nags':'diaries';
  async function fetchJson(url){
    const res=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
    if(!res.ok)throw Error(res.status===404?'找不到这条原记录。':'读取失败（HTTP '+res.status+'）');
    return res.json();
  }
  function failed(container,error,retry){
    container.replaceChildren(node('p',error.message||'读取失败。','empty'),button('重试',retry));
  }
  function renderDiary(container,r,focus){
    container.append(node('h2',r.day+' · 第 '+r.part+' 篇'),node('p',r.summary),node('div',[r.mood,r.weather,...r.tags.map(t=>'@#'+t)].join('　'),'badges'));
    const sections=new Map();
    for(const paragraph of r.body.split(/\n\s*\n/)){
      const lines=paragraph.split('\n').filter(Boolean);
      const label=/^【(你的日记|花园部署|当日消费)】$/.exec(lines[0])?.[1];
      let parent=container;
      if(label){
        lines.shift();
        if(!lines.some(line=>line.trim()))continue;
        parent=sections.get(label);
        if(!parent){parent=node('section');parent.append(node('h3',label));sections.set(label,parent);container.append(parent);}
      }
      for(const line of lines)parent.append(node('p',line,line.startsWith('绯月私语：')?'thought':'exchange'));
    }
    for(const thread of r.threads){
      const block=node('section',null,'open-thread'+(thread.no===focus?' thread-focus':''));
      block.append(node('b','悬念 '+thread.no+' · '+(thread.resolved?'已解':'未解')+(thread.asked?' · 已问':'')),node('p',thread.text));
      container.append(block);
      if(thread.no===focus)requestAnimationFrame(()=>block.scrollIntoView({block:'nearest'}));
    }
  }
  const sourceName=s=>({audit:'手记质问',diary:'悬念',paylog:'消费'})[s]??s;
  async function origin(n){
    const token=++originToken,box=el('originBody'),dialog=el('origin');
    if(!dialog.open)dialog.showModal();
    box.replaceChildren(node('p','正在查找原记录…'));
    try{
      if(n.source==='audit'){
        const page=await fetchJson(base+'diaries/'+encodeURIComponent(n.source_id));
        if(token===originToken){box.replaceChildren();renderDiary(box,page);}return;
      }
      if(n.source==='diary'){
        const [id,sequence]=n.source_id.split('/');
        const r=await fetchJson(base+'diaries/'+encodeURIComponent(id));
        if(token!==originToken)return;
        if(!r.threads.some(t=>t.no===Number(sequence)))throw Error('原篇中找不到这个悬念序号。');
        box.replaceChildren();renderDiary(box,r,Number(sequence));return;
      }
      // 优先定位当时的消费日。若账目后来改期，按同一个源编号查当前快照。
      for(const sourceDay of [...new Set([n.source_day,''])]){
        const cursors=new Set();let cursor='';
        do{
          const params=new URLSearchParams({limit:'100'});
          if(sourceDay){params.set('from',sourceDay);params.set('to',sourceDay);}
          if(cursor)params.set('cursor',cursor);
          const result=await fetchJson('/api/v1/expenses?'+params);
          if(token!==originToken)return;
          const data=result.data,r=data.records.find(row=>row.id===n.source_id);
          if(r){
            box.replaceChildren(node('h2',r.description||r.merchant||'消费账目'),node('p','Paylog · '+r.id),node('p',r.spendDate+'　'+r.amount+' 日元'),node('p',[r.category,r.tag?.name,r.merchant,r.description].filter(Boolean).join('　')));
            if(r.sourceMissing)box.append(node('p','该账目在当前快照中标记为来源缺失。'));
            return;
          }
          cursor=data.nextCursor;
          if(cursor&&cursors.has(cursor))throw Error('消费来源分页异常。');
          cursors.add(cursor);
        }while(cursor);
      }
      throw Error('当前消费快照中找不到原编号 '+n.source_id+'。');
    }catch(error){if(token===originToken)failed(box,error,()=>origin(n));}
  }
  async function read(id,kind){
    const token=++readToken,container=el('article'),dialog=el('reader');
    el('readerLabel').textContent=kind==='diaries'?'绯月的日记':'绯月的小唠叨';
    if(!dialog.open)dialog.showModal();container.replaceChildren(node('p','正在翻页…'));
    try{
      const r=await fetchJson(base+kind+'/'+encodeURIComponent(id));
      if(token!==readToken)return;
      container.replaceChildren();if(kind==='diaries'){renderDiary(container,r);return;}
      container.append(node('h2',r.title),node('p',[r.status,r.reason,r.stats].filter(Boolean).join('\n')),button(r.source==='audit'?'查看主篇 →':'查看原记录 →',()=>origin(r)));
      if(r.source==='audit'){
        container.append(node('h3','手记原文'),...r.refs.map((v,i)=>node('p',(i+1)+'. '+v.page+'　「'+v.quote+'」')),
          node('h3','矛盾点'),...r.points.map((v,i)=>node('p',(i+1)+'. '+v)));
      }else container.append(node('h3','开口的时候'),node('p',[r.before,r.beforeEvaluation].filter(Boolean).join(' · ')));
      for(const line of r.talk)container.append(node('p',stamp(line.at)+'　'+line.who+'\n'+line.text,'exchange'));
      if(r.afterEvaluation)container.append(node('h3','听完以后'),node('p',r.mood+' · '+r.afterEvaluation));
    }catch(error){if(token===readToken)failed(container,error,()=>read(id,kind));}
  }
  let month=localDay(new Date().toISOString()).slice(0,7),knownDays=new Set();
  function calendar(){
    const start=new Date(month+'-01T00:00:00Z'),last=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
    const grid=el('calendar');grid.replaceChildren();el('month').value=month;
    for(let i=0;i<(start.getUTCDay()+6)%7;i++)grid.append(node('i'));
    for(let i=1;i<=last;i++){
      const date=month+'-'+String(i).padStart(2,'0'),b=button(String(i),()=>changeDate(date));
      b.className='cal-date'+(knownDays.has(date)?' known':'');b.setAttribute('aria-label',date);
      b.setAttribute('aria-pressed',String(day===date));grid.append(b);
    }
  }
  el('month').onchange=e=>{if(e.target.value){month=e.target.value;calendar();}};
  function stepMonth(offset){
    const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+offset);month=d.toISOString().slice(0,7);calendar();
  }
  el('earlier').onclick=()=>stepMonth(-1);el('later').onclick=()=>stepMonth(1);
  async function list(){
    const kind=type(),diary=kind==='diaries',token=++listToken,rows=el('rows');
    rows.replaceChildren(node('p','正在翻阅索引…','empty'));
    el('prev').disabled=el('next').disabled=true;
    for(const [id,current] of [['diaryTab',diary],['nagTab',!diary]]){if(current)el(id).setAttribute('aria-current','page');else el(id).removeAttribute('aria-current');}
    const params=new URLSearchParams({page,q:el('search').value.trim()});if(day)params.set('day',day);if(filter)params.set('filter',filter);
    try{
      const data=await fetchJson(base+kind+'?'+params);
      if(token!==listToken)return;
      rows.replaceChildren();total=data.total;knownDays=new Set(data.items.map(r=>diary?r.day:localDay(r.created_at)));calendar();
      const choices=diary?[...new Set([filter,...data.items.flatMap(r=>r.tags)].filter(Boolean))]:['paylog','diary','audit'];
      el('filter').replaceChildren(new Option(diary?'全部标签':'全部来源',''),...choices.map(v=>new Option(diary?v:sourceName(v),v)));
      el('filter').value=filter;
      el('archiveSummary').textContent=diary?'日记':'小唠叨';
      el('listCaption').textContent=(day?day+' · ':'')+total+(diary?' 篇日记':' 条小唠叨');
      for(const r of data.items){
        const date=diary?r.day:localDay(r.created_at),id=diary?r.day+'.'+r.part:r.id;
        const entry=node('a',null,'entry');entry.href='#'+(diary?'diary':'nag');entry.onclick=e=>{e.preventDefault();read(id,kind);};
        const stampNode=node('span',null,'stamp');stampNode.append(node('b',date.slice(-2)),node('small',date.slice(5,7)+' 月'));
        const content=node('span');content.append(node('strong',diary?r.summary:r.title),node('span',diary?[date,'第 '+r.part+' 篇',r.mood,r.weather].join(' · '):[stamp(r.created_at),sourceName(r.source),r.status,r.mood].join(' · '),'meta'),node('span',diary?r.tags.map(t=>'@#'+t).join(' '):r.reason,'synopsis'));
        entry.append(stampNode,content,node('span','›','chevron'));rows.append(entry);
      }
      if(!total)rows.append(node('p','没有找到相符的记录。','empty'));
      el('prev').disabled=page===0;el('next').disabled=(page+1)*20>=total;
      el('pageInfo').textContent=(page+1)+' / '+Math.max(1,Math.ceil(total/20));
    }catch(error){if(token===listToken)failed(rows,error,list);}
  }
  for(const b of document.querySelectorAll('[data-dismiss]'))b.onclick=()=>b.closest('dialog').close();
  el('origin').onclose=()=>{if(!el('origin').open)++originToken;};
  el('reader').onclose=()=>{if(!el('reader').open)++readToken;};
  function changeDate(value){day=value;if(day)month=day.slice(0,7);el('mobileDate').value=day;page=0;list();}
  el('mobileDate').onchange=e=>changeDate(e.target.value);
  el('clearDate').onclick=()=>changeDate('');
  el('filter').onchange=e=>{filter=e.target.value;page=0;list();};
  el('search').oninput=()=>{++listToken;clearTimeout(timer);timer=setTimeout(()=>{page=0;list();},180);};
  el('prev').onclick=()=>{if(page>0){page--;list();}};el('next').onclick=()=>{if((page+1)*20<total){page++;list();}};
  window.addEventListener('hashchange',()=>{filter='';el('search').value='';changeDate('');});
  list();
`;
