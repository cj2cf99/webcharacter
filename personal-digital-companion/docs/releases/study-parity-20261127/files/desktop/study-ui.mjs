import {bindDictation,dictating} from './dictation-ui.mjs';
import {pairChoice,splitPairChoice} from './pair-choice.mjs';
import {bindLineVoice} from './study-voice.mjs';

const {run}=window.feiyueStudy;
const nav=document.querySelector('#study-nav'),main=document.querySelector('#study-content');
const actions=document.querySelector('#study-actions'),status=document.querySelector('#study-status'),homeButton=document.querySelector('#home');
const names={script:'照剧本练',free:'自由对练',sentence:'表达强化',practice:'抽题练习',exam:'本地模考','strength-exam':'强化测验',formal:'知序 · 正式考试'};
const outcomes={correct:'答对',wrong:'答错',unanswered:'未答',pending:'待核对'};
const date=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'short'});
const labels={language:'语言对练',bank:'题库练习',history:'复盘记录'};
const icons={language:'💬',bank:'📚',history:'🕘',script:'📜',free:'💬',sentence:'✏️',
  practice:'🎯',exam:'⏱️','strength-exam':'💪',formal:'🏛️'};
const tones={correct:'ok',wrong:'danger',unanswered:'warn',pending:'info'};
const languageModes=['script','sentence','free'];
let busy=false,session=null,category='language',screen='home',historyOffset=0,filter='all';
// 当前页面上的语音录入框；笔记输入的待保存动作。
const boxes=[];
let flushNote=()=>{};
// 最近停留的非场次页面，场次页返回到这里。
let page;
// 从当前页面一路复练开出的场次，返回时先回来源作答。
const retried=new Set();
let writes=Promise.resolve(),deadline=null;
let reviewPage=0;
const obj=(tag,text='',css='')=>{const node=document.createElement(tag);node.textContent=text;node.className=css;return node;};
function button(text,click,css=''){
  const node=obj('button',text,css);
  node.type='button';
  node.onclick=()=>void work(click,node);
  return node;
}
const row=(...nodes)=>{const node=obj('div','','study-row');node.append(...nodes);return node;};
const card=(...nodes)=>{const node=obj('section','','fy-card study-card study-stack');node.append(...nodes);return node;};
const paragraph=(text,css)=>obj('p',text,css);
const notice=text=>{status.textContent=text;};
const empty=text=>obj('p',text,'fy-empty');
const withIcon=(node,icon)=>{node.dataset.icon=icon;return node;};
const grid=(nodes,css='study-grid')=>{
  const node=obj('div','',css);
  nodes.forEach((child,index)=>child.style.setProperty('--i',index));
  node.append(...nodes);return node;
};
function hero(icon,title,...extra){
  const mark=obj('span',icon,'study-hero-icon');mark.setAttribute('aria-hidden','true');
  const head=obj('div','','study-hero-text');head.append(obj('h2',title));
  const node=obj('section','','study-hero');node.append(mark,head);
  for(const child of extra)(child.classList.contains('fy-chip')?head:node).append(child);
  return node;
}
function tile(icon,title,click,meta){
  const control=withIcon(button('',click,'study-tile'),icon);
  control.append(obj('span',title,'study-tile-title'));
  if(meta)control.dataset.meta=meta;
  return control;
}
const mode=(icon,label,click,css='')=>withIcon(button(label,click,'study-mode '+css),icon);
function field(label,control){
  const node=obj('label','','study-field');node.append(obj('span',label),control);return node;
}
// A 的台词自动朗读与重放，按钮跨重绘复用。
const speakButton=obj('button','','study-speak');speakButton.type='button';
const speakStatus=obj('small','','study-note');speakStatus.setAttribute('role','status');speakStatus.hidden=true;
const speech=bindLineVoice(window.feiyueStudy,{button:speakButton,status:speakStatus,blocked:dictating});
const voiceSelect=obj('select','','study-voice');voiceSelect.setAttribute('aria-label','对练音色');voiceSelect.title='对练音色';
voiceSelect.onchange=()=>void run('chooseVoice',{name:voiceSelect.value}).then(()=>speech.replay()).catch(error=>notice(error.message));
async function loadVoices(){
  try{
    const {list,current}=await run('voices');
    voiceSelect.replaceChildren(...list.map(name=>{const option=obj('option',name);option.value=name;return option;}));
    voiceSelect.value=current;
  }catch{notice('音色列表读取失败，请检查音色目录和 voices.json。');}
}
function listen(input,options={}){boxes.push(bindDictation(input,{blocked:()=>busy,...options}));}
const updateDictation=()=>boxes.forEach(box=>box.update());
const closeDictation=()=>boxes.splice(0).forEach(box=>box.close());
async function work(fn,control){
  if(busy||dictating())return;
  busy=true;
  updateDictation();
  flushNote();
  main.setAttribute('aria-busy','true');
  if(control)control.setAttribute('aria-busy','true');
  notice('');
  const pending=setTimeout(()=>notice('处理中…'),300);
  try{await writes;await fn();}catch(error){notice(error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/u,''));}
  finally{
    clearTimeout(pending);
    if(status.textContent==='处理中…')notice('');
    busy=false;
    updateDictation();
    main.setAttribute('aria-busy','false');
    control?.removeAttribute('aria-busy');
  }
}
function select(items,label){
  const field=obj('select');field.setAttribute('aria-label',label);
  for(const [value,title] of items){const option=obj('option',title);option.value=value;field.append(option);}
  return field;
}
function tab(text,active,click){const control=button(text,click);control.setAttribute('aria-pressed',String(active));return control;}
function renderNav(owner,back){
  const tabs=obj('div','','fy-seg');
  for(const [key,open] of [['language',()=>openHome('language')],['bank',()=>openHome('bank')],['history',()=>openHistory(0)]]){
    const control=withIcon(button('',open),icons[key]);
    control.setAttribute('aria-pressed',String(owner===key));control.title=labels[key];
    control.append(obj('span',labels[key]));tabs.append(control);
  }
  nav.replaceChildren(tabs);
  if(owner==='bank'||screen==='session'&&category==='bank'){
    const link=withIcon(button('',()=>run('openKnowledge'),'study-link'),'📖');
    link.title='打开网页知识库';link.setAttribute('aria-label',link.title);link.append(obj('span','知识库'));
    nav.append(link);
  }
  if(back){
    const control=button(back.label,back.go,'study-back');control.title=back.title;
    nav.prepend(control);
  }
}
const homePage=(kind,offset=0)=>({owner:kind,name:labels[kind],go:()=>openHome(kind,offset)});
function switchScreen(next,here,parent){
  speech.setLine('');
  closeDictation();
  screen=next;session=null;page=here;retried.clear();main.replaceChildren();actions.replaceChildren();
  renderNav(here.owner,parent&&{label:'返回',title:'返回'+parent.name,go:parent.go});
  main.scrollTop=0;
}
function recordButton(entry,from){
  const when=entry.finished??entry.started;
  return tile(icons[entry.mode],entry.title,async()=>{
    // 正式场次读一次回执，网页端写的复盘一起带回；断网时仍显示缓存。
    const value=await run(entry.mode==='formal'?'formalRefresh':'view',{id:entry.id});
    if(value&&from)page=from;
    showSession(value);
  },`${names[entry.mode]}${when?` · ${date.format(when)} JST`:''}`);
}
async function openHome(kind=category,offset=0){
  category=kind;switchScreen('home',homePage(kind,offset));
  const data=await run('overview');
  const rows=data.materials.filter(item=>item.kind===kind);
  const controls=row(button('导入 JSON',async()=>{const count=await run('import');if(count){await openHome();notice(`已缓存 ${count} 份材料`);}}));
  if(kind==='bank')controls.append(button('从来源取材',()=>sourceCatalog()));
  if(kind==='language')controls.prepend(button('✨ 生成对话',()=>openGenerate(),'primary'));
  if(kind==='language')controls.append(button('基础剧本',async()=>{
    const count=await run('basic');await openHome(kind);notice(`已载入 ${count} 套基础剧本`);
  }));
  if(kind==='bank')controls.append(button('继续正式场次',async()=>{
    const result=await run('formalOpen',{});
    if(result)showSession(result);else notice('知序没有进行中的正式考试');
  }));
  main.append(hero(icons[kind],kind==='language'?'场景与剧本':'题库',
    obj('span',`本机 ${rows.length} 份`,'fy-chip'),controls));
  if(data.active.length||data.formal){
    // 能续练的只有题库场次，返回时回到题库练习主页。
    const from=homePage('bank');
    const more=data.active.map(entry=>recordButton(entry,from));
    if(data.formal)more.push(tile(icons.formal,'继续或复盘正式考试',async()=>{
      const value=await run('formalRefresh',{id:data.formal});
      if(value)page=from;
      showSession(value);
    }));
    for(const control of more)control.dataset.tone='warn';
    main.append(obj('h3','继续上次','fy-section'),grid(more));
  }
  main.append(rows.length?grid(rows.slice(offset,offset+20).map(item=>{
    const scene=kind==='language'&&item.id.startsWith('["scene"');
    return tile(kind==='bank'?icons.bank:scene?'🎭':icons.script,item.title,()=>openMaterial(item),
      kind==='bank'?'题库':scene?'场景':'剧本');
  })):empty(kind==='language'?'暂无本机材料，可生成对话、载入基础剧本或导入 JSON。':'暂无本机材料，可导入来源备份或取材。'));
  if(offset)actions.append(button('上一页',()=>openHome(kind,offset-20)));
  if(offset+20<rows.length)actions.append(button('下一页',()=>openHome(kind,offset+20)));
}
async function sourceCatalog(){
  const pages=[],cursors=[],ids=new Set(),parent=page;
  async function render(index){
    if(!pages[index]){
      const cursor=index?pages[index-1].next:null;
      const result=await run('catalogPage',{cursor});
      if(result.next&&(cursors.includes(result.next)||result.next===cursor))throw Error('来源游标重复，请重新打开目录');
      result.items=result.items.filter(item=>!ids.has(item.id)&&ids.add(item.id));
      pages.push(result);cursors.push(cursor);
    }
    switchScreen('sources',{owner:'bank',name:'来源目录',go:()=>render(index)},parent);
    const {items,next}=pages[index];
    main.append(hero('☁️','选择要下载的题库'),items.length?grid(items.map(item=>tile(icons.bank,item.title,async()=>{
      const downloaded=await run('download',{id:item.id});
      await openMaterial(downloaded);notice('已缓存，断网可练习');
    }))):empty('本页暂无可用材料。'));
    if(index)actions.append(button('上一页',()=>render(index-1)));
    if(next)actions.append(button('下一页',()=>render(index+1)));
  }
  await render(0);
}
const levels=['N1','N2','N3','N4','N5'];
async function openGenerate(){
  const scenes=await run('scenes');
  switchScreen('generate',{owner:'language',name:'生成对话'},homePage('language'));
  const textField=(label,placeholder)=>{const node=obj('input');node.type='text';node.maxLength=500;node.placeholder=placeholder;node.setAttribute('aria-label',label);return node;};
  const scene=select([['','＋ 新场景'],...scenes.map(item=>[item.id,item.title])],'场景');
  const title=textField('新场景名称','例：午休时在茶水间闲聊');
  const topic=textField('本次话题','本次话题（可留空）');
  const topics=obj('datalist');topics.id='study-topics';topic.setAttribute('list',topics.id);
  const level=select(levels.map(name=>[name,name]),'语言等级');
  const ability=select([['business','商务表达'],['standard','日常表达']],'表达类型');
  const steps=obj('input');steps.type='number';steps.min='1';steps.max='30';steps.value='20';steps.setAttribute('aria-label','对话步数');
  const waiting=obj('div','','study-generating');waiting.hidden=true;
  waiting.append(obj('span','','study-spinner'),obj('span','正在规划并编写对话 · AGY CLI → 半岛 → Gemini → DeepSeek'));
  const submit=button('生成',async()=>{
    waiting.hidden=false;
    try{
      const result=await run('generate',{sceneId:scene.value,title:title.value,topic:topic.value,level:level.value,ability:ability.value,steps:Number(steps.value)});
      await openMaterial({id:result.materialId},homePage('language'));
      notice(`已由 ${result.providers.join(' / ')} 生成并缓存到本机`);
    }finally{waiting.hidden=true;}
  },'primary');
  const titleField=field('新场景名称',title),options=obj('div','','study-fields');
  options.append(field('语言等级',level),field('表达类型',ability),field('对话步数',steps));
  main.append(hero('✨','生成对话'),card(field('场景',scene),titleField,field('本次话题',topic),topics,options,row(submit),waiting));
  listen(title,{language:'zh'});listen(topic,{language:'zh'});
  scene.onchange=()=>{
    const chosen=scenes.find(item=>item.id===scene.value);
    titleField.hidden=Boolean(chosen);
    topics.replaceChildren(...(chosen?.topics??[]).map(name=>{const option=obj('option');option.value=name;return option;}));
    topic.value='';
  };
}
async function openMaterial(material,parent=page){
  const entry=await run('material',{id:material.id});
  category=entry.kind;
  switchScreen('material',{owner:entry.kind,name:entry.title,go:()=>openMaterial(material,parent)},parent);
  const start=options=>async()=>showSession(await run('create',{id:material.id,options}));
  if(entry.kind==='language'){
    if(entry.sceneOnly){
      const topics=select([['','场景默认话题'],...entry.topics.map(topic=>[topic,topic])],'话题');
      main.append(hero('🎭',entry.title,obj('span','场景','fy-chip')),card(field('话题',topics)),
        grid([mode(icons.free,'自由对练',()=>start({mode:'free',topic:topics.value})(),'primary')],'study-modes'));
      return;
    }
    main.append(hero(icons.script,entry.title,obj('span',`${entry.count} 轮`,'fy-chip')),grid([
      mode(icons.script,'照剧本练',start({mode:'script'}),'primary'),mode(icons.free,'自由对练',start({mode:'free'})),
      mode(icons.sentence,'抽取薄弱句',start({mode:'sentence',reinforce:true}))],'study-modes'));
    return;
  }
  const tags=select([['','全部标签'],...entry.tags.map(tag=>[tag.id,tag.name])],'标签');
  const scope=select([['','全部启用题'],['unseen','未见作答记录'],['review','待复习']],'练习范围');
  const count=obj('input');count.type='number';count.min='1';count.max='70';count.value='10';count.setAttribute('aria-label','抽题数量');
  const reinforce=obj('input');reinforce.type='checkbox';reinforce.checked=true;
  const check=obj('label','','study-check');check.append(reinforce,' 反馈强化');
  const configured=kind=>async()=>start({mode:kind,count:Number(count.value),tag:tags.value,scope:scope.value,reinforce:reinforce.checked})();
  const fields=obj('div','','study-fields');
  fields.append(field('标签',tags),field('练习范围',scope),field('抽题数量',count),check);
  main.append(hero(icons.bank,entry.title,obj('span',`${entry.count} 道缓存题目`,'fy-chip')),
    card(fields,paragraph(entry.attemptsComplete?`已做记录截至 ${date.format(entry.fetchedAt)} JST`:'未见题仅按本机已知记录筛选','study-note')),
    grid([mode(icons.practice,'抽题练习',configured('practice'),'primary'),mode(icons['strength-exam'],'强化测验',configured('strength-exam')),
      mode(icons.exam,'本地模考 · 60 分钟',start({mode:'exam'})),mode(icons.formal,'打开知序正式考试',async()=>{
        const [,id]=JSON.parse(material.id);
        if(window.confirm('从知序继续原场次；没有进行中的场次时创建正式考试。继续？'))showSession(await run('formalOpen',{id,create:true}));
      })],'study-modes'));
}
async function openHistory(offset){
  switchScreen('history',{owner:'history',name:labels.history,go:()=>openHistory(offset)});historyOffset=offset;
  const rows=await run('history',{offset});
  main.append(hero(icons.history,'本机复盘 · JST'),rows.length?grid(rows.map(entry=>recordButton(entry))):empty('暂无此页记录。'));
  if(offset)actions.append(button('‹ 较新',()=>openHistory(Math.max(0,historyOffset-20))));
  if(rows.length===20)actions.append(button('较早 ›',()=>openHistory(historyOffset+20)));
}
async function openSource(source){
  const snapshot=await run(source.formal?'formalView':'view',{id:source.id});
  showSession(snapshot,source.index);
  document.getElementById('study-review-'+source.index)?.scrollIntoView({block:'center'});
}
function sessionBack(value){
  const source=retried.has(value.id)?value.sourceTurn:null;
  const target=source?{name:'来源作答',go:()=>openSource(source)}:page;
  // 语言场次不续练：返回即结束本场。
  if(languageModes.includes(value.mode)&&value.status!=='completed')
    return {label:'结束并返回',title:'结束本场并返回'+target.name,go:async()=>{await run('leave');await target.go();}};
  return {label:source?'返回来源作答':'返回',title:'返回'+target.name,go:target.go};
}
function command(action,args={}){return run('operate',{id:session.id,action,args:{index:session.position,...args}});}
function formalDraft(kind,value){return run('formalDraft',{id:session.id,index:session.position,kind,value});}
function formalSend(action){return run('formalSend',{id:session.id,action});}
function resolveDraft(choice){return async()=>showSession(await run('formalResolve',{id:session.id,revision:session.revision,choice}));}
function retry(kind,index,ref){return async()=>{
  const action=session.mode==='formal'?'formalRetry':'next';
  const params={id:session.id,index,kind,ref};
  let result=await run(action,params);
  if(result.retryStatus==='missing'){
    const [type,id]=JSON.parse(result.materialId);
    if(type!=='bank')throw Error('请先重新取回原材料');
    if(!window.confirm('本机缺少该题库。现在取回材料再练？'))return;
    await run('download',{id});result=await run(action,params);
  }
  if(result.retryStatus==='changed'){
    if(!window.confirm(`新版题目：${result.changed.join('、')||'无'}。已排除 ${result.skipped} 项。按当前版本重练？`))return;
    result=await run(action,{...params,accepted:result.versions});
  }
  if(result.retryStatus)throw Error('材料已变化，请重新核对');
  if(result.sourceTurn)retried.add(result.id);
  showSession(result);
};}
function fieldCheck(label,checked,onChange,disabled=false){
  const input=obj('input');input.type='checkbox';input.checked=checked;input.disabled=disabled;
  const control=obj('label');control.append(input,' '+label);
  input.onchange=()=>void work(()=>onChange(input.checked),input);
  return control;
}
function media(node,question){
  for(const asset of question.media??[]){const image=obj('img');image.src=asset.url;image.loading='lazy';image.alt='题目附图';node.append(image);}
  if(question.missingImages)node.append(paragraph(`${question.missingImages} 张图片暂不可用`,'study-note'));
}
function answerText(question,value){
  if(typeof value==='string')return value;
  return (value??[]).map(id=>{
    const label=key=>question.options?.find(option=>option.id===key)?.text??key;
    if(question.type!=='matching')return label(id);
    const [pair,option]=splitPairChoice(id);
    return `${question.pairs.find(item=>item.id===pair)?.text??pair} → ${label(option)}`;
  }).join('、');
}
function questionCard(item){
  const q=item.question;
  const block=card(obj('h2',q.title||'绯月 · A'),paragraph(q.stem,'study-prompt'));
  if(q.type==='sentence')block.classList.add('study-talk');
  if(q.externalId)block.append(paragraph(q.externalId,'study-note'));
  media(block,q);
  return block;
}
function objective(item,live,locked){
  const q=item.question,group=obj('div'),selected=new Set(item.draft??item.answer??[]);
  const save=()=>{
    if(!live&&item.result)return;
    const {id,position:index,mode}=session,value=[...selected];
    writes=writes.then(()=>mode==='formal'?run('formalDraft',{id,index,kind:'answer',value}):
      run('operate',{id,action:live?'answer':'draft',args:{index,value}})).then(result=>{
      if(session?.id!==id)return;
      session=result;
      const indicator=document.querySelector('[data-sync]');
      if(indicator&&result.pending)indicator.textContent='尚待提交';
      const active=main.querySelector('[aria-current=true]');
      if(active)active.dataset.answered=String(value.length>0);
    }).catch(error=>notice(error.message));
  };
  if(q.type==='matching'){
    for(const pair of q.pairs){
      const field=select([['','未选'],...q.options.map(option=>[option.id,option.text])],pair.text);
      field.disabled=locked;
      const current=[...selected].find(value=>splitPairChoice(value)[0]===pair.id);
      if(current)field.value=splitPairChoice(current)[1];
      field.onchange=()=>{
        for(const value of selected)if(splitPairChoice(value)[0]===pair.id)selected.delete(value);
        if(field.value)selected.add(pairChoice(pair.id,field.value));
        save();
      };
      const control=obj('label',pair.text,'study-option');control.append(field);group.append(control);
    }
  }else for(const option of q.options){
    const input=obj('input');input.type=q.type==='single'?'radio':'checkbox';input.name='study-choice';input.checked=selected.has(option.id);input.disabled=locked;
    input.onchange=()=>{if(q.type==='single')selected.clear();if(input.checked)selected.add(option.id);else selected.delete(option.id);save();};
    const control=obj('label','','study-option');control.append(input,document.createTextNode(option.text));group.append(control);
  }
  return {group,value:()=>[...selected]};
}
function reviewIndexes(value){
  const indexes=value.items.map((_,index)=>index).filter(i=>filter==='all'||value.items[i].result===filter);
  if(value.mode==='free'){
    const marked=i=>Boolean(value.items[i].unsure&&value.items[i].answer&&!value.items[i].draftOnly);
    indexes.sort((a,b)=>Number(marked(b))-Number(marked(a)));
  }
  return indexes;
}
// 考试中的解题笔记：停顿后保存，任何按钮操作和关窗前先交出未保存内容。
function noteBox(item,locked){
  const {id,position:index,mode}=session;
  const input=obj('textarea','','study-memo');input.maxLength=20000;input.value=item.note??'';input.disabled=locked;
  input.placeholder='判断依据、犹豫点或排除过程…';input.setAttribute('aria-label','本次解题笔记');
  let timer=null;
  const flush=()=>{
    if(timer===null)return;
    clearTimeout(timer);timer=null;
    const value=input.value;
    const request=(mode==='formal'?run('formalDraft',{id,index,kind:'note',value}):run('operate',{id,action:'note',args:{index,value}}))
      .then(result=>{
        if(session?.id!==id)return;
        session=result;
        const indicator=document.querySelector('[data-sync]');
        if(indicator&&result.pending)indicator.textContent='尚待提交';
      }).catch(error=>notice(error.message));
    writes=Promise.all([writes,request]);
  };
  input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(flush,500);});
  input.addEventListener('blur',flush);
  flushNote=flush;
  const node=field('📝 本次解题笔记（可选）',input);
  return {node,bind:()=>listen(input,{language:'zh'})};
}
// 考后复盘与题目评论共用：列出、就地新增或修改、删除。
function thread({label,add,rows,change,keep=()=>{}}){
  const box=obj('div','','study-thread');
  const update=next=>{rows=next;keep(rows);draw();};
  function editor(entry){
    const input=obj('textarea','','study-memo');input.maxLength=20000;input.value=entry?.body??'';
    input.setAttribute('aria-label',label);
    const holder=obj('div','','study-stack');
    holder.append(input,row(button('保存',async()=>{
      const saved=await change({ref:entry?.id,revision:entry?.revision,value:input.value});
      update(entry?rows.map(old=>old.id===entry.id?saved:old):[...rows,saved]);
    },'primary'),button('取消',()=>draw())));
    return holder;
  }
  function card(entry){
    const node=obj('div','','study-entry');
    node.append(paragraph(entry.body),row(obj('small',`${date.format(entry.time)} JST`,'study-note'),
      button('编辑',()=>draw(entry.id)),button('删除',async()=>{
        if(!window.confirm(`删除这条${label}？`))return;
        await change({ref:entry.id,revision:entry.revision,remove:true});
        update(rows.filter(old=>old.id!==entry.id));
      })));
    return node;
  }
  function draw(editing){
    const adding=editing==='';
    box.replaceChildren(obj('h3',rows.length?`${label} · ${rows.length}`:label),
      ...rows.map(entry=>editing===entry.id?editor(entry):card(entry)),adding?editor():button(add,()=>draw('')));
    const input=box.querySelector('textarea');
    if(input){listen(input,{language:'zh'});input.focus();}
  }
  draw();
  return box;
}
// 评论存在知序线上题目上，点开才读取。
function commentsEntry(index){
  const {id}=session,holder=obj('div');
  holder.append(button('💬 题目评论',async()=>{
    const rows=await run('comments',{id,index});
    holder.replaceChildren(thread({label:'题目评论',add:'＋ 添加评论',rows,change:change=>run('comment',{id,index,...change})}));
  }));
  return holder;
}
function showSession(value,reviewIndex){
  if(!value){notice('正式考试暂无回执');return;}
  const entered=session?.id!==value.id,previous=session?.status;
  if(entered){filter='all';reviewPage=0;}
  if(Number.isInteger(reviewIndex)){filter='all';reviewPage=Math.max(0,Math.floor(reviewIndexes(value).indexOf(reviewIndex)/20));}
  closeDictation();flushNote=()=>{};
  const finished=value.status==='completed';
  const current=finished?null:value.items[value.position]?.question;
  // 刚结束的自由对练还有 A 的道别句；翻看旧记录时不自动朗读。
  const farewell=finished&&value.mode==='free'&&session?.id===value.id&&(session.status!=='completed'||speech.line===value.closing);
  const line=farewell?value.closing??'':current?.type==='sentence'?current.stem??'':'';
  speech.setLine(line,`${value.id}:${finished?'end':value.position}`);
  session=value;screen='session';main.replaceChildren();actions.replaceChildren();
  category=languageModes.includes(value.mode)?'language':'bank';
  // 同一场内的重绘保留导航，避免页签动画反复播放。
  if(entered||value.status!==previous)renderNav(page.owner==='history'?'history':category,sessionBack(value));
  const {mode,status:state,items,position}=session;
  const formal=mode==='formal',timed=['exam','strength-exam','formal'].includes(mode),done=state==='completed';
  const top=row(withIcon(obj('strong',names[mode]||mode,'fy-chip study-mode-chip'),icons[mode]),obj('span',session.title,'study-title'));
  top.classList.add('study-top');
  deadline=timed&&!done&&state==='running'?performance.now()+session.remaining:null;
  if(timed&&!done){const clock=obj('span','','study-clock');clock.id='study-clock';top.append(clock);}
  if(state==='paused')top.append(obj('span','已暂停','fy-chip'));
  if(formal){
    const sync=obj('span',session.reason==='timeout'?'已超时':session.pending?'尚待提交':session.offline?'等待重连':'已接收','fy-chip');
    sync.dataset.sync='true';top.append(sync);
  }
  main.append(top);
  if(formal&&(session.error||session.conflict))main.append(paragraph(session.conflict?'正式场次已变更，请重新接管或核对草稿。':session.error,'study-note'));
  if(formal&&session.reviewDrafts){
    const changes=items.flatMap((item,i)=>{
      const lines=[];
      if(item.serverAnswer!==undefined)lines.push(`第 ${i+1} 题 · 已收 ${answerText(item.question,item.serverAnswer)||'未答'} ／ 草稿 ${answerText(item.question,item.answer)||'未答'}`);
      if(item.serverFlag!==undefined)lines.push(`第 ${i+1} 题标记 · 已收 ${item.serverFlag?'是':'否'} ／ 本机 ${item.flag?'是':'否'}`);
      if(item.serverNote!==undefined)lines.push(`第 ${i+1} 题笔记 · 已收 ${item.serverNote||'无'} ／ 本机 ${item.note||'无'}`);
      return lines;
    });
    if(position!==session.serverPosition)changes.push(`题号 · 已收 ${session.serverPosition+1} ／ 本机 ${position+1}`);
    main.append(card(obj('h2','核对未同步内容'),...changes.map(line=>paragraph(line)),row(
      button('采用服务器内容',resolveDraft('server')),
      ...(session.writer?[button('保留本机待提交',resolveDraft('local'))]:[]))));
  }
  if(done){
    if(line){main.append(card(paragraph(`A · ${line}`,'study-prompt'),row(speakButton,voiceSelect,speakStatus)));void loadVoices();}
    renderReview();
    if(entered)main.scrollTop=0;
    return;
  }
  if(session.requested&&items.length<session.requested)main.append(paragraph(`本次 ${items.length} 题，所选范围少于 ${session.requested} 题。`,'study-note'));
  if(session.context){const {background,roleA,roleB,goal}=session.context;
    const roles=row(...[roleA&&`A · ${roleA}`,roleB&&`B · ${roleB}`].filter(Boolean).map(text=>obj('span',text,'fy-chip')));
    main.append(card(roles,...[background&&paragraph(background),goal&&paragraph(`🎯 ${goal}`,'study-note')].filter(Boolean)));}
  const item=items[position];
  if(!item)return;
  if(mode!=='free'){
    const pager=obj('div','','study-pager');
    items.forEach((candidate,index)=>{
      const control=button(`${index+1}${candidate.flag?'·':''}`,async()=>showSession(await (formal?
        formalDraft('position',index):command('position',{index}))));
      control.setAttribute('aria-current',String(position===index));control.dataset.answered=String(Boolean(candidate.result||candidate.answer?.length));
      if(mode==='script'&&index>position&&items.slice(position,index).some(before=>!before.result))control.disabled=true;
      pager.append(control);
    });
    main.append(pager);
  }
  const block=questionCard(item);
  if(line){block.append(row(speakButton,voiceSelect,speakStatus));void loadVoices();}
  const locked=state==='paused'||formal&&!session.writer;
  if(item.question.type==='sentence')renderSentence(item,block);
  else{
    const answer=objective(item,timed,locked);
    block.append(answer.group);
    if(!timed&&!locked)block.append(button(item.result?'再试一次':'提交并查看解析',async()=>showSession(await command(item.result?'retry':'answer',{value:answer.value()})),'primary'));
  }
  block.append(fieldCheck('没把握',item.unsure,async value=>showSession(await (formal?formalDraft('unsure',value):command('unsure',{value}))),locked));
  if(timed)block.append(fieldCheck('待检查',item.flag,async value=>showSession(await (formal?formalDraft('flag',value):command('flag',{value}))),locked));
  if(item.result||item.hinted&&item.question.reference)block.append(feedback(item));
  if(item.canComment)block.append(commentsEntry(position));
  const memo=timed?noteBox(item,formal&&!session.writer):null;
  if(memo)block.append(memo.node);
  main.append(block);
  memo?.bind();
  if(formal){
    actions.append(button('读取回执',async()=>showSession(await run('formalRefresh',{id:session.id}))));
    if(!session.writer)actions.append(button('接管',async()=>{if(window.confirm('接管后，原窗口无法继续写入。继续？'))showSession(await formalSend('takeover'));}));
    if(session.writer){
      if(state==='running'||session.pending)actions.append(button('提交待同步作答',async()=>showSession(await formalSend('sync'))));
      actions.append(button(locked?'恢复':'暂停',async()=>showSession(await formalSend(locked?'resume':'pause'))),
        button('交卷',async()=>{if(window.confirm('交回正式作答，结束知序场次？'))showSession(await formalSend('finish'));},'primary'));
    }
  }else if(mode!=='free'){
    if(timed)actions.append(button(locked?'恢复计时':'暂停',async()=>showSession(await command(locked?'resume':'pause'))));
    if(position+1<items.length&&(!['script','sentence'].includes(mode)||item.result))actions.append(button('下一题 ›',async()=>showSession(await command('position',{index:position+1}))));
    actions.append(button(timed?'交卷':'结束并复盘',async()=>{
      if(!timed||window.confirm('交卷后将显示成绩和解析。现在交卷？'))showSession(await command('finish'));
    },timed?'primary':''));
  }
  updateClock(session.remaining);
  if(entered)main.scrollTop=0;
}
function renderSentence(item,block){
  const input=obj('textarea');input.maxLength=1500;input.setAttribute('aria-label','B 的回答');input.placeholder='我是 B …';
  input.value=item.draft??item.answer??'';
  const free=modeIsFree();
  if(free&&session.position){
    const latest=session.items[session.position-1];
    block.prepend(paragraph(`B · ${latest.answer??''}`,'study-reply'));
  }
  block.append(input);
  if(free)listen(input);
  const {id,position:index}=session;
  function saveDraft(){
    if(item.result)return;
    // 每次输入即交给宿主，关窗时不依赖失焦事件。
    const request=run('operate',{id,action:'draft',args:{index,value:input.value}}).catch(error=>notice(error.message));
    writes=Promise.all([writes,request]);
  }
  input.addEventListener('input',saveDraft);
  const commandFor=finish=>run('free',{id,index,value:input.value,finish});
  if(free){
    block.append(row(button('回复 A',async()=>showSession(await commandFor(false)),'primary'),
      button('结束并总结',async()=>showSession(await commandFor(true))),session.context?.sceneOnly?
        button('选择文字剧本',()=>openHome('language')):button('切换文字剧本',retry('script',session.position))));
    actions.append(button('保存并结束',async()=>showSession(await command('finish'))));
  }else{
    if(item.question.canAssemble&&!item.hinted&&!item.result)
      block.append(button('打开拼词辅助',async()=>showSession(await command('assemble'))));
    if(item.question.chunks?.length&&item.hinted&&!item.result){
      const chunks=obj('details');chunks.append(obj('summary','拼词辅助'));
      chunks.open=true;
      const keys=row(...item.question.chunks.map(chunk=>button(chunk,()=>{
        if(input.value.length+chunk.length<=input.maxLength){input.value+=chunk;saveDraft();}
      })));
      chunks.append(keys);block.append(chunks);
    }
    block.append(row(button(item.result?'再试一次':'提交 B 的回答',async()=>showSession(await command(item.result?'retry':'answer',{value:input.value})),'primary'),
      ...(!item.result?[button('查看参考句',async()=>showSession(await command('hint'))),button('跳过',async()=>showSession(await command('answer',{value:''})))]:[])));
  }
}
const modeIsFree=()=>session.mode==='free';
function feedback(item){
  const q=item.question;
  const data=[item.result&&outcomes[item.result],!item.draftOnly&&item.answer?.length&&`原答 · ${answerText(q,item.answer)}`,
    q.reference&&`参考句 · ${q.reference}`,q.correct?.length&&`答案 · ${answerText(q,q.correct)}`,
    q.explanation?.replace(/\[\[option:([^\]]+)\]\]/gu,(_,id)=>answerText(q,[id])),item.feedback,
    item.retry&&`本次订正 · ${outcomes[item.retry.result]}`].filter(Boolean);
  return paragraph(data.join('\n'),'study-note');
}
function renderReview(){
  const {mode,items,correct,passed,summary,reason}=session;
  const formal=mode==='formal',language=['script','sentence','free'].includes(mode);
  const score=language?`${items.filter(item=>item.answer&&!item.draftOnly).length} / ${items.length} 轮`:`${correct??0} / ${items.length} 答对`;
  const weakIndex=items.findIndex(item=>item.unsure&&!item.disputed&&!item.draftOnly&&(mode!=='free'||item.answer));
  const target=weakIndex>=0?weakIndex:items.findIndex(item=>!item.disputed&&['wrong','unanswered'].includes(item.result));
  const counts=['correct','wrong','unanswered'].map(key=>outcomes[key]+' '+items.filter(item=>item.result===key).length).join(' · ');
  const part=items.length?(language?items.filter(item=>item.answer&&!item.draftOnly).length:correct??0)/items.length:0;
  const ring=obj('div','','study-ring');ring.setAttribute('aria-hidden','true');
  ring.style.setProperty('--p',part);ring.append(obj('span',`${Math.round(part*100)}%`));
  main.append(card(row(ring,obj('strong',score,'study-score'),passed===undefined?obj('span'):obj('span',passed?'合格':'未合格','fy-chip'),
    reason==='timeout'?obj('span','到时结算','fy-chip'):obj('span')),
    paragraph(formal?'知序交卷回执 · 计分采用服务端已收作答':'历史版本 · 本场开场时的材料','study-note'),
    paragraph(language?(session.context?.goal||session.title):counts,'study-note'),
    ...(target>=0?[button(`下次先练 · 第 ${target+1} ${language?'轮':'题'}`,()=>{
      showSession(session,target);document.getElementById('study-review-'+target)?.scrollIntoView({block:'center'});
    })]:[]),
    ...[summary,session.closing].filter(Boolean).map(text=>paragraph(text))));
  if(!language)main.append(row(...[['all','全部'],['correct','答对'],['wrong','答错'],['unanswered','未答']].map(([key,label])=>
    tab(label,filter===key,()=>{filter=key;reviewPage=0;showSession(session);}))));
  // 从列表打开的复练记录，返回键回列表，来源作答单独给入口。
  const source=session.sourceTurn;
  if(source&&!retried.has(session.id))actions.append(button('返回来源作答',()=>openSource(source)));
  const list=obj('div','','fy-list study-stack');
  const indexes=reviewIndexes(session);
  indexes.slice(reviewPage*20,reviewPage*20+20).forEach(index=>{
    const item=items[index];
    const block=questionCard(item);
    block.id='study-review-'+index;
    if(item.result)block.dataset.tone=tones[item.result];
    if(item.unsure)block.append(paragraph('没把握 · 待验证','study-note'));
    if(item.originalResult&&item.originalResult!==item.result)block.append(paragraph('原判 · '+outcomes[item.originalResult]+' ／ 复核 · '+outcomes[item.result]));
    if(item.draftOnly)block.append(paragraph('未提交草稿 · '+item.draft));
    if(mode==='free'&&item.disputed)block.append(paragraph(`反馈复核中 · ${item.disputed}`,'study-note'));
    block.append(feedback(item));
    if(item.draftAnswer)block.append(paragraph(`结算后仍有本机草稿 · ${answerText(item.question,item.draftAnswer)}`,'study-note'));
    if(item.note)block.append(paragraph(`📝 交卷笔记\n${item.note}`,'study-entry'));
    if(item.draftNote)block.append(paragraph(`结算后仍有本机笔记草稿 · ${item.draftNote}`,'study-note'));
    if(!language){
      const {id}=session;
      block.append(thread({label:'考后复盘',add:'✍️ 添加考后复盘',rows:item.reflections??[],
        keep:rows=>{item.reflections=rows;},change:change=>run('reflect',{id,index,...change})}));
      if(item.canComment)block.append(commentsEntry(index));
    }
    if(formal){
      if(item.canRetry)block.append(button('本地重练',retry('original',index)));else block.append(paragraph('历史回执仅可回看','study-note'));
      if(item.doubt!==undefined)block.append(row(button(item.doubt?'恢复强化':'题目有疑问',async()=>showSession(
        await run('formalDraft',{id:session.id,index,kind:'doubt',value:!item.doubt})))));
      list.append(block);return;
    }
    const controls=row();
    if(mode==='free'&&item.answer&&!item.draftOnly&&!item.disputed){
      controls.append(button('验证这个表达',async()=>{
        const choices=await run('verifyOptions',{id:session.id,index});
        if(!choices.length){notice('无可用考点材料，表达留待验证。');return;}
        const picker=select(choices.map(choice=>[choice.id,choice.label]),'选择能验证原句的小题');
        block.append(row(picker,button('开始验证',async()=>retry('verify',index,picker.value)())));
      }));
    }else if(mode!=='free'){
      controls.append(button('再练原题',retry('original',index)));
      if(item.hasVariant)controls.append(button(language?'换题验证':'同标签再练',retry('variant',index)));
      else if(item.mastery||item.result==='wrong'||item.unsure)block.append(paragraph('换题待验证','study-note'));
    }
    if(item.mastery)block.append(paragraph(`原题${item.mastery.streak>=3?'已掌握':`独立答对 ${item.mastery.streak} / 3`} · 权重 ${item.mastery.weight}`,'study-note'));
    if(item.repeated?.length)block.append(paragraph('反复误选 · '+item.repeated.map(([id,n])=>`${answerText(item.question,[id])}（${n} 次）`).join('、'),'study-note'));
    if(language&&item.answer&&!item.draftOnly){
      if(item.disputed)controls.append(button('恢复原判',async()=>showSession(await command('resolve',{index,result:'original'}))),
        ...(mode!=='free'?[button('改判成立',async()=>showSession(await command('resolve',{index,result:'correct'})))]:[]));
      else for(const [why,label] of [['dictation','听写有误'],['variant','这句也成立']])
        controls.append(button(label,async()=>showSession(await command('dispute',{index,reason:why}))));
    }else if(item.question.type!=='sentence')controls.append(button(item.doubt?'恢复强化':'题目有疑问',async()=>showSession(await command('doubt',{index,value:!item.doubt}))));
    if(controls.childNodes.length)block.append(controls);
    list.append(block);
  });
  main.append(list.childNodes.length?list:empty('没有符合此项的作答。'));
  if(reviewPage)actions.append(button('上一页',()=>{reviewPage--;showSession(session);}));
  if((reviewPage+1)*20<indexes.length)actions.append(button('下一页',()=>{reviewPage++;showSession(session);}));
  if(!formal&&mode!=='free'&&items.some(item=>item.result==='wrong'||item.result==='unanswered'||item.result==='pending'||item.unsure))
    actions.append(button('重练待复习项',retry('wrong',0),'primary'));
}
function updateClock(ms){
  const clock=document.querySelector('#study-clock');
  if(!clock||ms==null)return;
  const total=Math.max(0,Math.ceil(ms/1000));
  clock.textContent=`${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
}
setInterval(()=>{
  if(screen!=='session'||busy||deadline===null)return;
  const remaining=Math.max(0,deadline-performance.now());
  updateClock(remaining);
  if(!remaining&&!session.offline){
    deadline=null;
    void work(async()=>showSession(await run(session.mode==='formal'?'formalRefresh':'view',{id:session.id})));
  }
},1000);
window.addEventListener('pagehide',()=>flushNote());
homeButton.onclick=()=>void work(()=>openHome(),homeButton);
void work(()=>openHome());
