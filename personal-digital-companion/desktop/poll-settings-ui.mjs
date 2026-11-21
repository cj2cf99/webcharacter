const api=window.pollSettings,section=document.querySelector('#polls'),feedback=document.querySelector('#feedback');
const format=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const forms=new Map();
function render(rows){
  for(const row of rows){
    let form=forms.get(row.id);
    if(!form){
      form=document.querySelector('#editor').content.firstElementChild.cloneNode(true);
      forms.set(row.id,form);form.dataset.poll=row.id;section.append(form);
      form.querySelector('h2').textContent=row.name;
      form.elements.enabled.checked=row.enabled;
      if(row.id==='diary')form.elements.minutes.max=720;
      if(row.id==='diaryAudit'){
        form.elements.minutes.readOnly=true;
        form.elements.minutes.labels[0].title='自动质问每五小时最多开始一次，从开始时计';
      }
      form.elements.minutes.value=row.minutes;form.elements.maximum.value=row.maximum;
      form.onsubmit=async event=>{
        event.preventDefault();
        const button=form.querySelector('button');button.disabled=true;
        try{
          await api.save(row.id,{enabled:form.elements.enabled.checked,minutes:form.elements.minutes.valueAsNumber,
            maximum:form.elements.maximum.valueAsNumber});
          feedback.textContent=row.name+'设定已保存';
        }catch{feedback.textContent='保存失败，请核对数值后重试。';}
        finally{button.disabled=false;}
      };
    }
    form.querySelector('.state').textContent=[row.running?'执行中':row.queuedAt!==null?'等待执行':'',
      row.misses?'连续推延 '+row.misses+' 次':'',row.nextAt?'下次 '+format.format(row.nextAt)+' JST':''].filter(Boolean).join(' · ');
  }
  const waiting=rows.filter(row=>row.queuedAt!==null).sort((a,b)=>a.queuedAt-b.queuedAt);
  document.querySelector('#empty').hidden=waiting.length>0;
  document.querySelector('#queue').replaceChildren(...waiting.map(row=>{
    const li=document.createElement('li');li.textContent=row.name+' · '+(row.running?'执行中':'待执行')+' · '+format.format(row.queuedAt)+' JST';return li;
  }));
}
api.onChange(render);api.onQueue(()=>document.querySelector('#waiting').focus());
api.get().then(render).catch(()=>{feedback.textContent='轮询设定读取失败，请重新打开。';});
