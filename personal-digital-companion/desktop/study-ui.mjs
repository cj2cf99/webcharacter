import {bindDictation,dictating} from './dictation-ui.mjs';
import {pairChoice,splitPairChoice} from './pair-choice.mjs';

const {run}=window.feiyueStudy;
const nav=document.querySelector('#study-nav'),main=document.querySelector('#study-content');
const actions=document.querySelector('#study-actions'),status=document.querySelector('#study-status'),homeButton=document.querySelector('#home');
const names={script:'照剧本练',free:'自由对练',sentence:'表达强化',practice:'抽题练习',exam:'本地模考','strength-exam':'强化测验',formal:'知序 · 正式考试'};
const outcomes={correct:'答对',wrong:'答错',unanswered:'未答',pending:'待核对'};
const date=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'short'});
let busy=false,session=null,category='language',screen='home',historyOffset=0,filter='all',dictation;
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
async function work(fn,control){
  if(busy||dictating())return;
  busy=true;
  dictation?.update();
  main.setAttribute('aria-busy','true');
  if(control)control.setAttribute('aria-busy','true');
  notice('');
  const pending=setTimeout(()=>notice('处理中…'),300);
  try{await writes;await fn();}catch(error){notice(error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/u,''));}
  finally{
    clearTimeout(pending);
    if(status.textContent==='处理中…')notice('');
    busy=false;
    dictation?.update();
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
function switchScreen(next){
  dictation?.close();dictation=null;
  screen=next;session=null;main.replaceChildren();actions.replaceChildren();
  nav.replaceChildren(tab('语言对练',category==='language'&&next!=='history',()=>openHome('language')),
    tab('题库练习',category==='bank'&&next!=='history',()=>openHome('bank')),tab('复盘记录',next==='history',()=>openHistory(0)));
  main.scrollTop=0;
}
function recordButton(entry){
  const when=entry.finished??entry.started;
  return button(`${entry.title} · ${names[entry.mode]}${when?` · ${date.format(when)} JST`:''}`,
    async()=>showSession(await run(entry.mode==='formal'?'formalView':'view',{id:entry.id})));
}
async function openHome(kind=category,offset=0){
  category=kind;switchScreen('home');
  const data=await run('overview');
  const rows=data.materials.filter(item=>item.kind===kind);
  if(data.active.length||data.formal){
    const more=data.active.map(recordButton);
    if(data.formal)more.push(button('继续或复盘正式考试',async()=>showSession(await run('formalRefresh',{id:data.formal}))));
    main.append(card(obj('h2','继续上次'),row(...more)));
  }
  const controls=row(button('导入 JSON',async()=>{const count=await run('import');if(count){await openHome();notice(`已缓存 ${count} 份材料`);}}),
    button('从来源取材',()=>sourceCatalog(kind)));
  if(kind==='language')controls.append(button('基础剧本',async()=>{
    const count=await run('basic');await openHome(kind);notice(`已载入 ${count} 套基础剧本`);
  }));
  if(kind==='bank')controls.append(button('继续正式场次',async()=>{
    const result=await run('formalOpen',{});
    if(result)showSession(result);else notice('知序没有进行中的正式考试');
  }));
  main.append(card(row(obj('h2',kind==='language'?'场景与剧本':'题库'),controls),rows.length?
    row(...rows.slice(offset,offset+20).map(item=>button(item.title,()=>openMaterial(item)))):empty('暂无本机材料，可导入来源备份或取材。')));
  if(offset)actions.append(button('上一页',()=>openHome(kind,offset-20)));
  if(offset+20<rows.length)actions.append(button('下一页',()=>openHome(kind,offset+20)));
}
async function sourceCatalog(kind,group=kind==='bank'?'banks':'scripts'){
  const pages=[],cursors=[],ids=new Set();
  async function render(index){
    if(!pages[index]){
      const cursor=index?pages[index-1].next:null;
      const page=await run('catalogPage',{kind:group,cursor});
      if(page.next&&(cursors.includes(page.next)||page.next===cursor))throw Error('来源游标重复，请重新打开目录');
      page.items=page.items.filter(item=>!ids.has(item.id)&&ids.add(item.id));
      pages.push(page);cursors.push(cursor);
    }
    switchScreen('sources');
    if(kind==='language')main.append(row(tab('剧本',group==='scripts',()=>sourceCatalog(kind,'scripts')),
      tab('场景',group==='scenes',()=>sourceCatalog(kind,'scenes'))));
    const page=pages[index];
    main.append(card(obj('h2','选择要下载的材料'),page.items.length?row(...page.items.map(item=>button(item.title+(item.scene?' · 场景':''),async()=>{
      const downloaded=await run('download',{kind,id:item.id,scene:item.scene});
      await openMaterial(downloaded);notice('已缓存，断网可练习');
    }))):empty('本页暂无可用材料。')));
    if(index)actions.append(button('上一页',()=>render(index-1)));
    if(page.next)actions.append(button('下一页',()=>render(index+1)));
  }
  await render(0);
}
async function openMaterial(material){
  const entry=await run('material',{id:material.id});
  switchScreen('material');
  const start=options=>async()=>showSession(await run('create',{id:material.id,options}));
  if(entry.kind==='language'){
    if(entry.sceneOnly){
      const topics=select([['','场景默认话题'],...entry.topics.map(topic=>[topic,topic])],'话题');
      main.append(card(obj('h2',entry.title),row(topics,button('自由对练',()=>start({mode:'free',topic:topics.value})(),'primary'))));
      return;
    }
    main.append(card(obj('h2',entry.title),paragraph(`${entry.count} 轮`,'study-note'),
      row(button('照剧本练',start({mode:'script'}),'primary'),button('自由对练',start({mode:'free'})),
        button('抽取薄弱句',start({mode:'sentence',reinforce:true})))));
    return;
  }
  const tags=select([['','全部标签'],...entry.tags.map(tag=>[tag.id,tag.name])],'标签');
  const scope=select([['','全部启用题'],['unseen','未见作答记录'],['review','待复习']],'练习范围');
  const count=obj('input');count.type='number';count.min='1';count.max='70';count.value='10';count.setAttribute('aria-label','抽题数量');
  const reinforce=obj('input');reinforce.type='checkbox';reinforce.checked=true;
  const check=obj('label','');check.append(reinforce,' 反馈强化');
  const configured=mode=>async()=>start({mode,count:Number(count.value),tag:tags.value,scope:scope.value,reinforce:reinforce.checked})();
  main.append(card(obj('h2',entry.title),paragraph(`${entry.count} 道缓存题目`,'study-note'),row(tags,scope,count,check),
    paragraph(entry.attemptsComplete?`已做记录截至 ${date.format(entry.fetchedAt)} JST`:'未见题仅按本机已知记录筛选','study-note'),
    row(button('抽题练习',configured('practice'),'primary'),button('强化测验',configured('strength-exam'))),
    row(button('本地模考 · 60 分钟',start({mode:'exam'})),button('打开知序正式考试',async()=>{
      const [,id]=JSON.parse(material.id);
      if(window.confirm('从知序继续原场次；没有进行中的场次时创建正式考试。继续？'))showSession(await run('formalOpen',{id,create:true}));
    }))));
}
async function openHistory(offset){
  switchScreen('history');historyOffset=offset;
  const rows=await run('history',{offset});
  main.append(card(obj('h2','本机复盘 · JST'),rows.length?row(...rows.map(recordButton)):empty('暂无此页记录。')));
  if(offset)actions.append(button('‹ 较新',()=>openHistory(Math.max(0,historyOffset-20))));
  if(rows.length===20)actions.append(button('较早 ›',()=>openHistory(historyOffset+20)));
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
    await run('download',{kind:'bank',id});result=await run(action,params);
  }
  if(result.retryStatus==='changed'){
    if(!window.confirm(`新版题目：${result.changed.join('、')||'无'}。已排除 ${result.skipped} 项。按当前版本重练？`))return;
    result=await run(action,{...params,accepted:result.versions});
  }
  if(result.retryStatus)throw Error('材料已变化，请重新核对');
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
function showSession(value,reviewIndex){
  if(!value){notice('正式考试暂无回执');return;}
  if(session?.id!==value.id){filter='all';reviewPage=0;}
  if(Number.isInteger(reviewIndex)){filter='all';reviewPage=Math.max(0,Math.floor(reviewIndexes(value).indexOf(reviewIndex)/20));}
  dictation?.close();dictation=null;
  session=value;screen='session';nav.replaceChildren();main.replaceChildren();actions.replaceChildren();
  const {mode,status:state,items,position}=session;
  const formal=mode==='formal',timed=['exam','strength-exam','formal'].includes(mode),done=state==='completed';
  const top=row(obj('strong',names[mode]||mode),obj('span',session.title,'study-note'));
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
      return lines;
    });
    if(position!==session.serverPosition)changes.push(`题号 · 已收 ${session.serverPosition+1} ／ 本机 ${position+1}`);
    main.append(card(obj('h2','核对未同步内容'),...changes.map(line=>paragraph(line)),row(
      button('采用服务器内容',resolveDraft('server')),
      ...(session.writer?[button('保留本机待提交',resolveDraft('local'))]:[]))));
  }
  if(done){renderReview();return;}
  if(session.requested&&items.length<session.requested)main.append(paragraph(`本次 ${items.length} 题，所选范围少于 ${session.requested} 题。`,'study-note'));
  if(session.context){const {background,roleA,roleB,goal}=session.context;
    main.append(card(paragraph([roleA&&`A · ${roleA}`,roleB&&`B · ${roleB}`,background,goal].filter(Boolean).join('\n'))));}
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
  main.append(block);
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
}
function renderSentence(item,block){
  const input=obj('textarea');input.maxLength=1500;input.setAttribute('aria-label','B 的回答');input.placeholder='我是 B …';
  input.value=item.draft??item.answer??'';
  const free=modeIsFree();
  if(free&&session.position){
    const latest=session.items[session.position-1];
    block.prepend(paragraph(`B · ${latest.answer??''}`,'study-note'));
  }
  block.append(input);
  if(free)dictation=bindDictation(input,{blocked:()=>busy});
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
  main.append(card(row(obj('strong',score,'study-score'),passed===undefined?obj('span'):obj('span',passed?'合格':'未合格','fy-chip'),
    reason==='timeout'?obj('span','到时结算','fy-chip'):obj('span')),
    paragraph(formal?'知序交卷回执 · 计分采用服务端已收作答':'历史版本 · 本场开场时的材料','study-note'),
    paragraph(language?(session.context?.goal||session.title):counts,'study-note'),
    ...(target>=0?[button(`下次先练 · 第 ${target+1} ${language?'轮':'题'}`,()=>{
      showSession(session,target);document.getElementById('study-review-'+target)?.scrollIntoView({block:'center'});
    })]:[]),
    ...[summary,session.closing].filter(Boolean).map(text=>paragraph(text))));
  if(session.sourceTurn)actions.append(button('返回来源作答',async()=>{
    const source=session.sourceTurn;
    const snapshot=await run(source.formal?'formalView':'view',{id:source.id});
    showSession(snapshot,source.index);
    document.getElementById('study-review-'+source.index)?.scrollIntoView({block:'center'});
  }));
  if(!language)main.append(row(...[['all','全部'],['correct','答对'],['wrong','答错'],['unanswered','未答']].map(([key,label])=>
    tab(label,filter===key,()=>{filter=key;reviewPage=0;showSession(session);}))));
  const list=obj('div','','fy-list study-stack');
  const indexes=reviewIndexes(session);
  indexes.slice(reviewPage*20,reviewPage*20+20).forEach(index=>{
    const item=items[index];
    const block=questionCard(item);
    block.id='study-review-'+index;
    if(item.unsure)block.append(paragraph('没把握 · 待验证','study-note'));
    if(item.originalResult&&item.originalResult!==item.result)block.append(paragraph('原判 · '+outcomes[item.originalResult]+' ／ 复核 · '+outcomes[item.result]));
    if(item.draftOnly)block.append(paragraph('未提交草稿 · '+item.draft));
    if(mode==='free'&&item.disputed)block.append(paragraph(`反馈复核中 · ${item.disputed}`,'study-note'));
    block.append(feedback(item));
    if(item.draftAnswer)block.append(paragraph(`结算后仍有本机草稿 · ${answerText(item.question,item.draftAnswer)}`,'study-note'));
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
homeButton.onclick=()=>void work(()=>openHome(),homeButton);
void work(()=>openHome());
