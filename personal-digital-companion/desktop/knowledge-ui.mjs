const api=window.feiyueKnowledge;
const content=document.querySelector('#content'),status=document.querySelector('#status'),search=document.querySelector('#search');
const filter=document.querySelector('#kind-filter'),newButton=document.querySelector('#new'),toolbar=document.querySelector('#toolbar');
const footer=document.querySelector('#actions'),shelfArt=document.querySelector('#shelf-art');
const format=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'});
const kindName={positive:'正向',negative:'负向'};
const shelves={
  positive:{heading:'正向知识',summary:'定义 · 条件 · 做法',icon:'book'},
  negative:{heading:'负向规则',summary:'错因 · 替代做法 · 例外',icon:'rule'},
  pending:{heading:'待我确认',summary:'核对实例，确认后收录',icon:'note'},
  backup:{heading:'备份与恢复',summary:'每周、每月各留一份',icon:'box'},
};
let view='positive',pageNumber=1,request=0,busy=false;

function h(tag,value,classes){
  const el=document.createElement(tag);
  if(value!=null)el.textContent=value;
  if(classes)el.className=classes;
  return el;
}
function button(label,run,primary=false){
  const el=h('button',label,primary?'primary':'');el.type='button';
  el.addEventListener('click',()=>void task(run));return el;
}
function row(...items){const el=h('div',null,'row');el.append(...items);return el;}
function icon(type){
  const mark=h('i',null,'mark mark-'+type);mark.setAttribute('aria-hidden','true');return mark;
}
function cover(type){
  const book=h('span',null,'cover');book.setAttribute('aria-hidden','true');book.append(icon(type));return book;
}
function shelf(){
  const section=h('header',null,'shelf-banner'),caption=h('div',null,'shelf-caption');
  section.dataset.view=view;
  caption.append(h('h2',shelves[view].heading),h('p',shelves[view].summary));
  section.append(caption,shelfArt.content.cloneNode(true));
  return section;
}
function stamp(value){
  const time=h('time',format.format(value)+' JST','fy-meta');
  time.dateTime=new Date(value).toISOString();
  return time;
}
function chip(text,tone){
  const tag=h('span',text,'fy-chip');tag.dataset.tone=tone;return tag;
}
function empty(text){
  const placeholder=h('div',null,'fy-empty');
  placeholder.append(cover(shelves[view].icon),h('p',text));return placeholder;
}
function showContent(page,...actions){
  content.replaceChildren(page);content.scrollTop=0;
  footer.replaceChildren(...actions);footer.hidden=!actions.length;
  if(actions.length&&page.classList.contains('detail')){
    const heading=page.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});
  }
}
function show(message='',error=false){status.textContent=message;status.hidden=!message;status.dataset.error=String(error);}
async function task(run){
  if(busy)return;
  busy=true;show();content.setAttribute('aria-busy','true');
  try{await run();}
  catch(error){show(error.message.replace(/^Error invoking remote method '[^']+': Error: /u,''),true);}
  finally{busy=false;content.setAttribute('aria-busy','false');}
}
function pageChrome(detail=false){
  for(const control of document.querySelectorAll('.catalog-nav button'))control.setAttribute('aria-pressed',String(control.dataset.view===view));
  toolbar.hidden=detail||view==='backup';
  filter.hidden=view!=='pending';newButton.hidden=view==='pending';
}
async function list(){
  pageChrome();
  if(view==='backup')return backups();
  const local=++request;
  const result=await api.run('list',{view,kind:filter.value,query:search.value.trim(),page:pageNumber});
  if(local!==request)return;
  pageNumber=result.page;
  const region=h('section',null,'catalog-page'),catalog=h('ul',null,'fy-list catalog-list');
  region.append(shelf());
  if(result.rows.length)region.append(h('h3',search.value.trim()?'搜索结果':'目录','fy-section'));
  for(const item of result.rows){
    const book=h('li',null,'fy-card'),link=button('',()=>open(item.id,view==='pending'));
    const tone=item.state==='disabled'?'muted':item.state==='pending'||item.kind==='negative'?'warn':'accent';
    const caption=item.state==='disabled'?'已停用':item.state==='pending'?kindName[item.kind]+' · '+item.count+' 次':'第 '+item.revision+' 版';
    book.dataset.kind=item.kind;book.dataset.tone=tone;link.classList.add('catalog-card');link.title=item.title;
    const info=h('span',null,'catalog-info'),head=h('span',null,'fy-head'),arrow=h('span','›','catalog-arrow');
    head.append(h('strong',item.title,'fy-title'),chip(caption,tone));
    info.append(head,stamp(item.updated));arrow.setAttribute('aria-hidden','true');
    link.append(cover(shelves[item.kind].icon),info,arrow); book.append(link);catalog.append(book);
  }
  region.append(result.rows.length?catalog:empty(search.value?'没有符合搜索词的知识。':
    view==='pending'?'暂无待确认卡。':'暂无条目。'));
  const pagination=h('nav',null,'catalog-pagination');
  pagination.setAttribute('aria-label','目录分页');
  const turn=change=>async()=>{
    pageNumber=result.page+change;
    await list();
    const buttons=[...footer.querySelectorAll('button')];
    (buttons[change<0?0:1].disabled?buttons.find(item=>!item.disabled):buttons[change<0?0:1])?.focus();
  };
  const previous=button('‹ 上一页',turn(-1)),next=button('下一页 ›',turn(1));
  previous.disabled=result.page===1;next.disabled=result.page===result.pages;
  const position=h('span',result.page+' / '+result.pages);
  position.setAttribute('aria-label','第 '+result.page+' 页，共 '+result.pages+' 页');
  pagination.append(previous,position,next);
  showContent(region,h('span','共 '+result.total+' 条','fy-meta'),pagination);
}
function label(name,value='',options={}){
  const wrapper=h('label',name),field=h(options.long?'textarea':'input');
  if(options.long)field.rows=options.rows??2;
  field.value=value??'';if(options.max)field.maxLength=options.max;
  wrapper.append(field);return {wrapper,field};
}
function checkbox(name,value=false){
  const wrapper=h('label',null,'inline'),field=h('input');
  field.type='checkbox';field.checked=value;wrapper.append(field,h('span',name));
  return {wrapper,field};
}
function editor(entry={}){
  pageChrome(true);
  const body=entry.body??{},kind=entry.kind??view,isGroup=!!entry.instances;
  const panel=h('section',null,'detail'),form=h('form',null,'editor-paper');
  const header=h('header',null,'editor-heading');
  header.append(cover(shelves[kind].icon),h('h2',entry.id?isGroup?'核对 '+kindName[kind]+'草稿':'编辑 '+kindName[kind]+'条目':'新建 '+kindName[kind]+'条目'),
    button('返回',list));
  panel.append(header);
  if(isGroup&&entry.current&&entry.current.revision!==entry.base){
    const current=h('details');
    const summary=h('summary',null,'row');
    summary.append(h('span','›','fy-caret'),h('span','关联条目已更新至第 '+entry.current.revision+' 版 · 查看对照'));
    current.append(summary,
      h('p',entry.current.body.title,'evidence'),
      h('p',[entry.current.body.definition,entry.current.body.condition,entry.current.body.mistake,
        entry.current.body.reason,entry.current.body.instead,...(entry.current.body.cases??entry.current.body.exceptions??[])
          .map(value=>value.when+' → '+value.do)].filter(Boolean).join('\n'),'evidence'));
    panel.append(current);
  }
  const fields={};
  function field(key,name,options){
    const value=key==='aliases'?body.aliases?.join('、'):body[key];
    const item=label(name,value,options);fields[key]=item.field;item.wrapper.dataset.field=key;form.append(item.wrapper);
  }
  field('title','标题',{max:120});field('aliases','别名（用顿号分隔）',{max:600});
  if(kind==='positive')field('definition','定义',{long:true,max:2000});
  else{
    field('condition','适用条件',{long:true,max:2000});
    field('mistake','错误做法',{long:true,max:2000});
    field('reason','原因',{long:true,max:2000});
    field('instead','替代办法',{long:true,max:2000});
    field('related','关联正向条目编号',{max:80});
    if(entry.related)form.append(button('打开 '+entry.related.body.title,()=>open(entry.related.id,false)));
  }
  const key=kind==='positive'?'cases':'exceptions';
  const cases=h('fieldset'),regions=h('div',null,'stack');
  cases.append(h('legend',kind==='positive'?'条件与做法':'例外及做法'),regions);
  function addCase(value={}){
    const item=h('div',null,'case'),when=label('条件',value.when,{long:true,max:500}),action=label('做法',value.do,{long:true,max:800});
    when.field.dataset.field='when';action.field.dataset.field='do';
    item.append(when.wrapper,action.wrapper,button('移除',()=>item.remove()));
    regions.append(item);
  }
  for(const value of body[key]??[])addCase(value);
  if(kind==='positive'&&!regions.children.length)addCase();
  cases.append(row(button('添加一项',()=>{if(regions.children.length<12)addCase();})));
  form.append(cases);field('source','来源备注',{long:true,max:1600});
  if(entry.id&&!isGroup)form.append(h('small','条目编号 '+entry.id,'fy-meta'));
  const resolved=new Map();
  if(entry.gaps?.length){
    const gaps=h('fieldset');
    gaps.append(h('legend','随此次修订一并结清的缺口'));
    for(const gap of entry.gaps){
      const item=checkbox(gap.title+' · '+gap.count+' 次');
      gaps.append(item.wrapper);resolved.set(gap.id,item.field);
    }
    form.append(gaps);
  }
  const accept=checkbox('已按当前条目核对，并确认以这份草稿修订');
  if(isGroup&&entry.current&&entry.current.revision!==entry.base)form.append(accept.wrapper);
  function fieldValues(){
    return {...Object.fromEntries(Object.entries(fields).map(([id,input])=>[id,input.value])),
      aliases:fields.aliases.value.split(/[、,，\n]/u),[key]:[...regions.children].map(el=>({
        when:el.querySelector('[data-field=when]').value,do:el.querySelector('[data-field=do]').value}))};
  }
  if(isGroup){
    const instancePanel=h('fieldset'),selected=new Map();
    instancePanel.append(h('legend','实例 · '+entry.instances.length+' 次'));
    for(const instance of entry.instances){
      const item=checkbox(format.format(instance.at)+' JST · '+instance.body.point);
      instancePanel.append(item.wrapper,h('p',[instance.body.evidence,instance.body.condition].filter(Boolean).join('\n'),'evidence'));
      selected.set(instance.id,item.field);
    }
    const title=label('另组原因或问题','',{max:120});
    instancePanel.append(title.wrapper,row(button('拆分所选实例',async()=>{
      const result=await api.run('split',{id:entry.id,revision:entry.revision,title:title.field.value,
        instanceIds:[...selected].filter(([,input])=>input.checked).map(([id])=>id)});
      await open(result.original.id,true);show('实例已重新归组。');
    })));
    panel.append(instancePanel);
  }
  async function save(confirm=false,state=entry.state??'active'){
    const args={id:entry.id,revision:entry.revision,kind,body:fieldValues()};
    if(isGroup){
      const result=await api.run('group',{...args,confirm,useCurrent:accept.field.checked});
      if(confirm){await open(result.id,false);show('知识已生效。');}
      else{editor(result);show('草稿已保存。');}
    }else{
      const result=await api.run('save',{...args,state,resolved:[...resolved].filter(([,input])=>input.checked).map(([id])=>id)});
      await open(result.id,false);show(state==='disabled'?'已停用。':'已保存。');
    }
  }
  const actions=[];
  if(entry.updated)actions.push(stamp(entry.updated));
  if(!isGroup&&entry.id)actions.push(button(entry.state==='disabled'?'启用':'停用',
    ()=>save(false,entry.state==='disabled'?'active':'disabled')));
  actions.push(button(isGroup?'保存草稿':'保存',()=>save(),!isGroup));
  if(isGroup&&entry.state==='pending')actions.push(button('确认生效',()=>save(true),true));
  form.addEventListener('submit',event=>event.preventDefault());panel.append(form);showContent(panel,...actions);
}
async function open(id,isGroup){
  const result=await api.run('detail',{id,isGroup});
  view=isGroup?'pending':result.kind;editor(result);
}
function statGrid(values,delta=false){
  if(!values)return h('p','当前库数量未知','fy-meta');
  const stats=h('dl',null,'stat-grid');
  for(const [key,name] of [['positive','正向'],['negative','负向'],['pending','待确认'],['instances','实例']]){
    const metric=h('div'),value=values[key];
    metric.append(h('dt',name),h('dd',delta&&value>0?'+'+value:String(value)));
    stats.append(metric);
  }
  return stats;
}
async function backups(action='backups'){
  const region=h('section',null,'catalog-page'),archive=h('ul',null,'fy-list');
  const items=await api.run(action);
  const tools=row(button('检查备份',()=>backups('backup')),
    button('选择备份文件',async()=>renderPreview(await api.run('previewExternal'))),
    button('导入密钥',async()=>{if(await api.run('importKey')){await backups();show('已导入密钥。');}}),
    button('导出密钥',async()=>{if(await api.run('exportKey'))show('密钥已导出。');}));
  tools.classList.add('archive-tools');
  region.append(shelf(),tools);
  if(items.length)region.append(h('h3','本机档案','fy-section'));
  for(const item of items){
    const name=item.kinds.length>1?'周月备份':item.kinds[0]==='week'?'周备份':'月备份';
    const line=h('li',null,'fy-card archive-card'),head=h('div',null,'fy-head');
    line.dataset.tone=item.kinds.includes('month')?'accent':'info';
    head.append(icon('box'),h('h3',name),stamp(item.at));
    if(item.counts&&!item.keyAvailable)head.append(chip('缺密钥','warn'));
    if(!item.counts)head.append(chip('文件不可读','danger'));
    line.append(head);
    if(item.counts)line.append(statGrid(item.counts));
    const actions=row();actions.classList.add('archive-actions');
    if(item.counts)actions.append(button('预览恢复',()=>preview(item.name)));
    if(item.keyAvailable)actions.append(button('导出备份',async()=>{
      if(await api.run('exportBackup',{name:item.name}))show('备份已导出。');
    }));
    if(actions.children.length)line.append(actions);
    archive.append(line);
  }
  region.append(items.length?archive:empty('暂无可用备份。'));
  showContent(region);
}
async function preview(name){
  renderPreview(await api.run('preview',{name}));
}
function renderPreview(result){
  if(!result)return;
  const panel=h('section',null,'detail'),head=h('header',null,'editor-heading'),comparison=h('div',null,'restore-grid');
  head.append(cover('box'),h('h2','恢复预览'),stamp(result.at));
  for(const [name,values] of [['所选快照',result.backup],['当前知识库',result.current],['恢复后变化',result.difference]]){
    if(name==='恢复后变化'&&!values)continue;
    const card=h('section',null,'restore-card');
    if(name==='恢复后变化')card.classList.add('restore-delta');
    card.append(h('h3',name),statGrid(values,name==='恢复后变化'));comparison.append(card);
  }
  panel.append(head,comparison);
  const confirm=button('确认恢复',async()=>{
    const receipt=await api.run('restore',{token:result.token});
    await backups();show('已恢复。原库已留在 '+receipt.original+'。');
  },true);
  showContent(panel,button('返回备份',()=>backups()),confirm);
}
for(const control of document.querySelectorAll('.catalog-nav button'))control.addEventListener('click',()=>{
  void task(async()=>{view=control.dataset.view;pageNumber=1;await list();});
});
newButton.addEventListener('click',()=>void task(()=>editor({kind:view})));
filter.addEventListener('change',()=>void task(()=>{pageNumber=1;return list();}));
let searchTimer;
search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{
  void task(()=>{pageNumber=1;return list();});
},180);});
api.onSelect(id=>void task(()=>open(id,false)));
void task(async()=>{
  const selected=await api.run('initial');
  if(selected)await open(selected,false);
  else await list();
});
