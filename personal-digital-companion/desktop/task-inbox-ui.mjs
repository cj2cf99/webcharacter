const byId=id=>document.getElementById(id);
const api=window.taskInbox;
const notice=byId('notice');
const scroll=document.querySelector('main');
const tabs=[byId('local-tab'),byId('cloud-tab')];
const format=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'medium'});
const labels={claim:'接取任务',continue:'继续重做',force:'接管任务',skip:'跳过任务',stop:'停止任务链'};
const states={ACTIVE:'进行中',COMPLETED:'已完成',STOPPED:'已停止',RUNNING:'等待回执',
  PENDING:'待领取',FAILED:'失败',CANCELLED:'已取消',EXPIRED:'已过期',SKIPPED:'已跳过'};
const fields={title:'标题',content:'内容',body:'内容',text:'内容',prompt:'提示词',deadline:'截止日期'};
const lists={
  tasks:{rows:new Set(),key:'task_id',items:'tasks',more:'next_offset',empty:'当前没有待接取或执行中的任务。'},
  chains:{rows:new Set(),key:'chain_id',items:'chains',more:'next_after',empty:'当前没有未结束的任务链。'},
};
let view='local';
let shownTranscript,transcriptPage=0,transcriptDecision=false;
let selection=new Set(),checklist,editingRow;
const working=new Set();
const operationKey=({method,id})=>method==='inspect'?'inspect':method+':'+id;

function putNotice(message=''){
  notice.textContent=message;
  notice.hidden=!message;
}
function stamp(value){
  const date=new Date(value);
  return value&&Number.isFinite(date.getTime())?format.format(date)+' JST':'';
}
async function read(method,value){
  const result=await api[method](value);
  if(result.error)throw Error(result.error);
  return result.value;
}
// 卡片：第一项信息是状态，显示为带色徽标；其余为灰色元信息。
const tone=text=>/失败|已停止|已取消|已过期/.test(text)?'danger':/暂停|重试|等待|不可/.test(text)?'warn':/完成|已核对|已跳过/.test(text)?'ok':/待领取|核对|排队/.test(text)?'accent':'info';
function row(title,info,action){
  const item=document.createElement('li'),body=document.createElement('div');
  const top=document.createElement('div'),name=document.createElement('strong'),meta=document.createElement('small');
  const [state,...rest]=info,chip=document.createElement('span');
  item.className='fy-card';item.dataset.tone=tone(state||'');
  item.style.setProperty('--i',document.querySelectorAll('li.fy-card').length%8);
  top.className='fy-head';name.textContent=title;chip.className='fy-chip';chip.textContent=state||'';
  top.append(name);if(state)top.append(chip);
  meta.textContent=rest.filter(Boolean).join(' · ');
  body.append(top,meta);
  item.append(body);
  if(action)item.append(actionButton(action,title));
  return item;
}
function actionButton(action,title){
  const button=document.createElement('button');
  button.type='button';
  button.textContent=action.text;
  button.setAttribute('aria-label',action.text+' '+title);
  button.dataset.operation=operationKey(action);
  button.disabled=working.has(button.dataset.operation);
  button.addEventListener('click',()=>operate(action));
  return button;
}
async function loadLocal(){
  try{
    const tasks=await read('local');
    byId('local-message').textContent=tasks.length?'':'绯月当前没有正在本机执行的任务。';
    const phase={queued:'排队中',running:'执行中',verifying:'整批核对中',archiving:'保存复盘中',blocked:'已暂停'};
    const stepState={pending:'待执行',checking:'核对基线',applying:'核对写入结果',verified:'已核对'};
    byId('local-items').replaceChildren(...tasks.map(task=>{
      const batch=task.batch;
      if(!batch)return row(task.name||task.type,[task.attempt_count>1?'重试中':'执行中',stamp(task.started_at)]);
      const done=batch.steps.filter(s=>s.state==='verified').length;
      // 正式工作队列：排队的批次显示序号，暂停的显示已暂停。
      const state=batch.state==='queued'&&batch.queue?'排队 #'+batch.queue.position:phase[batch.state];
      const item=row(task.name,[state,done+'/'+batch.steps.length,stamp(task.started_at),batch.error]);
      const steps=document.createElement('ol');
      for(const step of batch.steps){
        const line=document.createElement('li');line.textContent=step.label+' · '+stepState[step.state];line.dataset.state=step.state;steps.append(line);
      }
      item.firstElementChild.append(steps);
      return item;
    }));
  }catch(error){
    byId('local-message').textContent=error.message;
  }
}
const transcriptStates={queued:'排队中',running:'整理中',ready:'待确认',empty:'无登记候选',failed:'待重试',
  approved:'已确认 · 排队中',submitting:'提交中','submit-pending':'提交待处理',done:'已登记',discarded:'已放弃'};
const fieldNames={...fields,reflection:'感想',url:'网址',level:'级别',conditions:'准备条件',categoryLabel:'分类'};
function node(tag,value){const element=document.createElement(tag);if(value)element.textContent=value;return element;}
async function loadTranscripts(){
  const items=await read('transcripts');
  byId('transcripts').hidden=!items.length&&!shownTranscript;
  byId('transcript-items').hidden=Boolean(shownTranscript);
  if(!shownTranscript){
    byId('transcript-items').replaceChildren(...items.map(item=>{
      const card=row('对话内容转录',[item.needsReview?'待核查':transcriptStates[item.state],stamp(item.at),item.stage,item.count?`${item.count} 项`:'']);
      const button=node('button','查看结果');button.type='button';button.onclick=()=>void showTranscript(item.id).catch(error=>putNotice(error.message));
      card.append(button);return card;
    }));
  }else{
    const match=items.find(item=>item.id===shownTranscript);
    if(match&&checklist&&match.state!==checklist.state&&!transcriptDecision)await showTranscript(shownTranscript);
  }
}
async function showTranscript(id){
  const entering=shownTranscript!==id;
  shownTranscript=id;
  if(entering){transcriptPage=0;selection=new Set();editingRow=undefined;}
  const data=await read('transcript',id);
  if(shownTranscript!==id)return;
  if((entering||checklist?.state!==data.state)&&data.state==='ready')
    selection=new Set(data.result.rows.filter(item=>!item.missing.length&&!item.prepareError).map(item=>item.id));
  checklist=data;
  renderTranscript();
}
async function editTranscriptRow(data,item,container,begin){
  const key={id:data.id,rowId:item.id};
  try{
    const {fields}=await read('transcriptEdit',key);
    if(!container.isConnected||editingRow||transcriptDecision)return;
    if(!fields.length){putNotice('这条记录没有可修改的字段。');return;}
    editingRow=item.id;
    const controls=byId('transcript-detail').querySelectorAll('button,input[type=checkbox]');
    const enabled=[...controls].filter(control=>!control.disabled);
    for(const control of enabled)control.disabled=true;
    const editor=node('form');editor.className='transcript-editor';
    const error=node('small');error.setAttribute('role','alert');
    let deadlineInputs;
    for(const {key:field,value,required,limit} of fields){
      if(field==='deadline'){
        const timing=node('div');timing.className='transcript-deadline';
        const [day,clock]=String(value??'').split('T');
        const date=node('input'),time=node('input');
        date.type='date';date.required=required;date.value=day;
        time.type='time';time.value=clock??'';
        const dateLabel=node('label','日期（JST）'),timeLabel=node('label','时分（可选）');
        dateLabel.append(date);timeLabel.append(time);timing.append(dateLabel,timeLabel);editor.append(timing);
        deadlineInputs={date,time};
        continue;
      }
      const label=node('label',fieldNames[field]||field);
      const input=node(['body','content','reflection'].includes(field)?'textarea':field==='level'?'select':'input');
      input.name=field;input.required=required;
      if(field==='level')for(const option of ['高','中','低'])input.append(new Option(option,option));
      if(limit)input.maxLength=limit;
      input.value=value??(field==='level'?'中':'');
      label.append(input);editor.append(label);
    }
    const actions=node('div');actions.className='transcript-tools';
    const save=node('button','保存修改');save.type='submit';
    const cancel=node('button','取消');cancel.type='button';
    const close=()=>{editingRow=undefined;editor.remove();for(const control of enabled)control.disabled=false;begin.focus();};
    cancel.onclick=close;
    actions.append(save,cancel);editor.append(error,actions);begin.after(editor);
    editor.querySelector('input,textarea,select')?.focus();
    editor.onsubmit=async event=>{
      event.preventDefault();
      save.disabled=cancel.disabled=true;
      error.textContent='';
      try{
        const values=Object.fromEntries(new FormData(editor));
        if(deadlineInputs){
          const {date,time}=deadlineInputs;
          values.deadline=date.value+(time.value?'T'+time.value:'');
        }
        await read('transcriptEdit',{...key,values});
        if(!container.isConnected)return;
        close();
        await showTranscript(data.id);
        putNotice('修改已保存。');
      }catch(failure){error.textContent=failure.message;}
      finally{save.disabled=cancel.disabled=false;}
    };
  }catch(error){putNotice(error.message);}
}
function renderTranscript(){
  const data=checklist,body=byId('transcript-detail');
  if(!data||data.id!==shownTranscript)return;
  editingRow=undefined;
  byId('transcripts').hidden=false;body.hidden=false;byId('transcript-items').hidden=true;
  byId('local-message').hidden=true;byId('local-items').hidden=true;
  const button=(label,fn,id)=>{
    const value=node('button',label);value.type='button';if(id)value.id=id;
    value.disabled=transcriptDecision;value.onclick=fn;return value;
  };
  const bar=node('div');bar.className='transcript-tools';
  bar.append(button('返回',()=>{
    shownTranscript=undefined;checklist=null;body.hidden=true;
    byId('local-message').hidden=false;byId('local-items').hidden=false;
    void loadTranscripts().catch(error=>putNotice(error.message));
  }),
    node('strong',data.needsReview?'待核查':transcriptStates[data.state]||data.state));
  if(data.durationMs!=null)bar.append(node('small',`${Math.round(data.durationMs/1000)} 秒`));
  if(['failed','submit-pending'].includes(data.state))bar.append(button('重试',()=>void transcriptAction('transcriptRetry',data.id)));
  body.replaceChildren(bar);
  if(data.error)body.append(node('p',data.error));
  if(data.steps?.length){
    const activity=node('details');activity.append(node('summary','AI 分析与转录 · '+data.steps.length+' 步'));
    activity.addEventListener('toggle',()=>{
      if(!activity.open||activity.childElementCount>1)return;
      for(const [index,step] of data.steps.entries()){
        const part=node('details');
        const stage=step.id.includes('classify')?'转录':'分析';
        part.append(node('summary',(index+1)+' · '+stage+' · '+({done:'完成',split:'已拆小',failed:'失败',waiting:'等待',running:'处理中',unknown:'上次结果未知'}[step.state]??step.state)));
        part.append(node('pre',JSON.stringify({输入:step.input,调用记录:step.attempts,有效输出:step.output,错误:step.error},null,2)));
        activity.append(part);
      }
    });
    body.append(activity);
  }
  if(!data.result)return;
  const notes=node('details');notes.append(node('summary','查看整理摘要'));
  for(const [key,label] of [['actions','已发生'],['requests','可能的委托'],['signals','登记线索']]){
    const matters=data.result.summaries.flatMap(summary=>summary[key]);
    if(matters.length)notes.append(node('p',label+' · '+matters.map(item=>[item.summary,...item.conditions].join('，')).join('；')));
  }
  for(const summary of data.result.summaries)if(summary.summary&&!summary.actions.length&&!summary.requests.length&&!summary.signals.length)
    notes.append(node('p',summary.summary));
  for(const note of data.result.notes)notes.append(node('p',note));
  body.append(notes);
  const rows=data.result.rows,form=node('ul');form.className='fy-list';
  const statuses=new Map((data.receipts??[]).map(item=>[item.key,item]));
  const ready=data.state==='ready';
  const available=rows.filter(item=>!item.missing.length);
  const nextPage=Math.max(0,Math.ceil(rows.length/20)-1);
  transcriptPage=Math.min(nextPage,transcriptPage);
  const actions=node('div');actions.className='transcript-tools';
  const selected=button('生成已选',()=>{
    if(selection.size)void transcriptAction('transcriptDecision',{id:data.id,selected:[...selection]});
  },'transcript-selected');
  const sync=()=>{selected.textContent=`生成已选（${selection.size}）`;selected.disabled=transcriptDecision||!selection.size;};
  for(const item of rows.slice(transcriptPage*20,(transcriptPage+1)*20)){
    const receipt=statuses.get(item.id);
    const card=row(item.params.title||item.label,[receipt?states[receipt.status]??receipt.status:item.missing.length?'待补充':item.params.title?item.label:'',
      receipt?.recordId&&'记录 '+receipt.recordId]);
    if(ready){
      const box=node('input');box.type='checkbox';box.dataset.type=item.type;box.checked=selection.has(item.id);
      box.disabled=Boolean(item.missing.length)||transcriptDecision;box.setAttribute('aria-label','生成 '+(item.params.title||item.label));
      box.onchange=()=>{if(box.checked)selection.add(item.id);else selection.delete(item.id);sync();};
      card.prepend(box);
    }
    const center=card.querySelector('div');
    if(ready&&item.type!=='hu-shi.event.create'){
      const edit=button('修改',()=>void editTranscriptRow(data,item,center,edit));
      edit.className='transcript-edit';
      center.append(edit);
    }
    for(const [key,value] of Object.entries({...item.params,categoryLabel:item.categoryLabel})){
      if(!value||key==='title')continue;
      const info=node('p',(fieldNames[key]||key)+' · '+(key==='deadline'?String(value).replace('T',' ')+' JST':value));
      info.className='transcript-text';center.append(info);
    }
    for(const message of [item.conditions.length?'准备条件 · '+item.conditions.join('、'):'',
      item.dependsOn.length?'前置登记 · '+item.dependsOn.map(id=>{const row=rows.find(other=>other.id===id);return row?.params.title||row?.label||id;}).join('、'):'',
      item.missing.length?'待补 · '+item.missing.map(key=>fieldNames[key]||key).join('、'):'',item.prepareError,item.previewNote,item.timing&&'原话时间 · '+item.timing,receipt?.error])if(message)center.append(node('small',message));
    const proof=node('details');proof.append(node('summary','查看来源'));
    for(const ref of item.evidence)proof.append(node('p',ref.quote));
    for(const source of item.sources)proof.append(node('small',(fieldNames[source.field]||source.field)+' · '+({explicit:'原话',inferred:'推定',default:'默认',manual:'用户修改'}[source.kind])+ ' · '+source.basis));
    center.append(proof);form.append(card);
  }
  body.append(form);
  if(nextPage){const page=node('div');page.className='transcript-tools';
    const previous=button('‹',()=>{transcriptPage--;renderTranscript();});previous.disabled=transcriptPage===0;
    const next=button('›',()=>{transcriptPage++;renderTranscript();});next.disabled=transcriptPage===nextPage;
    page.append(previous,node('span',`${transcriptPage+1} / ${nextPage+1}`),next);body.append(page);}
  if(ready){
    const all=button('全部生成',()=>void transcriptAction('transcriptDecision',{id:data.id,selected:available.map(item=>item.id)}),'transcript-all');
    all.disabled=transcriptDecision||!available.length;
    actions.append(all,button('全部不生成',()=>void transcriptAction('transcriptDecision',{id:data.id,selected:[]}),'transcript-none'),selected);
    sync();body.append(actions);
  }
}
async function transcriptAction(method,value){
  if(transcriptDecision)return;
  transcriptDecision=true;renderTranscript();putNotice();
  try{await read(method,value);}
  catch(error){putNotice(error.message);}
  finally{transcriptDecision=false;if(shownTranscript)await showTranscript(shownTranscript).catch(error=>putNotice(error.message));}
}
function taskRow(task){
  const running=task.status==='RUNNING';
  return row(task.name||task.type,[
    running?'执行中':task.can_claim?'待领取':'暂不可领取',
    stamp(task.updated_at||task.created_at),task.progress_message,
  ],task.can_claim&&!running?{text:'接取',method:'claim',id:task.task_id}:null);
}
function chainRow(chain){
  const item=document.createElement('li'),card=document.createElement('details');
  const summary=document.createElement('summary'),title=document.createElement('strong');
  const state=document.createElement('span'),created=document.createElement('small');
  const steps=document.createElement('div');
  item.className='fy-card chain-item';item.dataset.tone='accent';
  card.dataset.chainId=chain.chain_id;
  title.textContent=chain.name||'任务链';
  state.className='chain-state';
  state.textContent=states[chain.status]||states.ACTIVE;
  created.textContent=stamp(chain.created_at);
  summary.append(title,state,created);
  card.append(summary,steps);
  item.append(card);
  let loading=false,loaded=false;
  card.addEventListener('toggle',async()=>{
    if(!card.open||loading||loaded)return;
    loading=true;
    steps.textContent='正在读取任务链…';
    if(scroll.getBoundingClientRect().bottom-summary.getBoundingClientRect().bottom<110)
      summary.scrollIntoView({block:'start'});
    try{
      const detail=await read('detail',chain.chain_id);
      state.textContent=states[detail.status]||detail.status;
      title.textContent=detail.name||title.textContent;
      const rows=document.createElement('ol');
      rows.className='chain-steps';
      const names=new Map(detail.nodes.map(node=>[node.node_id,node.name]));
      for(const node of detail.nodes){
        const dependency=names.get(node.depends_on);
        const step=row(node.name,[states[node.status]||node.status,dependency&&'前置 '+dependency,node.progress],
          node.can_claim?{text:'接取',method:'claim',id:node.task_id}:null);
        const parameters=document.createElement('dl');
        for(const [key,value] of Object.entries(node.params||{})){
          if(value==null||value==='')continue;
          const name=document.createElement('dt'),content=document.createElement('dd');
          name.textContent=fields[key]||key;
          content.textContent=typeof value==='object'?JSON.stringify(value):String(value);
          parameters.append(name,content);
        }
        if(parameters.childElementCount)step.firstElementChild.append(parameters);
        rows.append(step);
      }
      steps.replaceChildren(rows,actionButton({text:'处理任务链',method:'inspect',id:chain.chain_id},title.textContent));
      loaded=true;
    }catch(error){steps.textContent=error.message+' · 重新展开可重试';}
    finally{loading=false;}
  });
  return item;
}
async function loadList(name,append=false){
  const list=lists[name],message=byId(name+'-message'),more=byId(name+'-more');
  const turn=(list.turn??0)+1;
  list.turn=turn;
  if(!append){list.rows.clear();list.next=null;byId(name+'-items').replaceChildren();}
  message.textContent='正在读取…';
  more.disabled=true;
  if(!append)more.hidden=true;
  try{
    const page=await read(name,list.next);
    if(list.turn!==turn)return;
    if(name==='tasks'){
      byId('tasks-scope').textContent=page.standalone?'指定本机或派给任一电脑':'旧版云端清单可能包含任务链节点';
    }
    const container=byId(name+'-items');
    for(const item of page[list.items]){
      const id=item[list.key];
      if(list.rows.has(id))continue;
      list.rows.add(id);
      container.append((name==='tasks'?taskRow:chainRow)(item));
    }
    list.next=page[list.more];
    more.hidden=list.next==null;
    message.textContent=list.rows.size?'':(list.next==null?list.empty:'本页暂无结果，可加载下一页。');
  }catch(error){
    if(list.turn===turn)message.textContent=error.message;
  }finally{
    if(list.turn===turn)more.disabled=false;
  }
}
async function loadReceipts(){
  const receipts=await read('receipts');
  byId('receipts').hidden=!receipts.length;
  byId('receipt-items').replaceChildren(...receipts.map(item=>row(item.title||labels[item.action]||'任务操作',
    ['等待核对原回执'],{text:'核对回执',method:'resume',id:item.request_id})));
}
async function refresh(){
  if(view==='local')return Promise.all([loadLocal(),loadTranscripts().catch(error=>putNotice(error.message))]);
  await Promise.all([loadList('tasks'),loadList('chains'),loadReceipts().catch(error=>putNotice(error.message))]);
}
function syncButtons(){
  document.querySelectorAll('[data-operation]').forEach(button=>button.disabled=working.has(button.dataset.operation));
}
async function operate(action){
  const {method,id}=action,key=operationKey(action);
  if(working.has(key))return;
  working.add(key);
  syncButtons();
  putNotice(method==='claim'?'正在接取任务…':method==='resume'?'正在核对原回执…':'');
  try{
    await read(method,id);
    putNotice(method==='claim'?'已执行并收到云端回执。':method==='resume'?'已核对原回执。':'');
  }catch(error){
    putNotice(error.message);
  }finally{
    working.delete(key);
    syncButtons();
    await Promise.all([loadList('tasks'),loadList('chains'),loadReceipts().catch(error=>putNotice(error.message)),loadLocal()]);
  }
}
function select(name){
  if(name===view)return;
  view=name;
  for(const tab of tabs){
    const active=tab.id===view+'-tab';
    tab.setAttribute('aria-selected',String(active));
    tab.tabIndex=active?0:-1;
    byId(tab.getAttribute('aria-controls')).hidden=!active;
  }
  scroll.scrollTop=0;
  void refresh();
}
for(const tab of tabs){
  tab.addEventListener('click',()=>select(tab.getAttribute('aria-controls')));
  tab.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const target=event.key==='Home'?tabs[0]:event.key==='End'?tabs[1]:tabs.find(other=>other!==tab);
    select(target.getAttribute('aria-controls'));target.focus();
  });
}
byId('refresh').addEventListener('click',async()=>{
  const button=byId('refresh');if(!working.size)putNotice();
  button.setAttribute('aria-busy','true');
  try{await refresh();}finally{setTimeout(()=>button.removeAttribute('aria-busy'),300);}
});
for(const name of Object.keys(lists))byId(name+'-more').addEventListener('click',()=>void loadList(name,true));
void refresh();
api.onTranscript(id=>{select('local');void showTranscript(id).catch(error=>putNotice(error.message));});
