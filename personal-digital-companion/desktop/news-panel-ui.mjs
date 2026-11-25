import {cleanNewsTitle,needsChinese} from './news-layout.mjs';
import {drawHeatmap} from './news-heatmap.mjs';

const api=window.newsPanel, byId=id=>document.getElementById(id);
const main=document.querySelector('main'), reader=byId('reader'), overview=document.querySelector('.overview');
const hotTop=byId('hot-top'), hotRest=byId('hot-rest'), filters=byId('filters'), refresh=byId('refresh');
const weekMap=byId('week-map'), dayMap=byId('day-map'), weekAtEl=byId('week-at'), dayAtEl=byId('day-at');
const restWeek=byId('rest-week'), restDay=byId('rest-day');
const detail=byId('event-detail'), content=byId('detail-content'), closeButton=byId('close-detail');
const backdrop=byId('detail-backdrop'), overviewTop=byId('overview-top'), detailTop=byId('detail-top');
const photoPanel=byId('photo-panel'), fullPhoto=byId('photo-full'), photoState=byId('photo-state');
const compact=matchMedia('(max-width:700px)'), reducedMotion=matchMedia('(prefers-reduced-motion:reduce)');
const behindDrawer=document.querySelectorAll('.mast, .folio, .overview');
const timeFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const dayFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit'});
const mdFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'});
const hmFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false});
const hour=3600000;
const fold=10, batch=20;
const shown={'rest-week':fold,'rest-day':fold};
const cards=new Map(), pendingTranslations=new Map();
let items=[], selected=null, active='全部', feedNow=Date.now(), overviewScroll=0, generation=0, detailGeneration=0, photoGeneration=0;
let translationQueue=Promise.resolve();
let imageObserver;
let editionBoards,heatFrame;
function layoutHeatmap(immediate=false){
  const draw=()=>{
    heatFrame=null;
    for(const map of [weekMap,dayMap])drawHeatmap(map);
  };
  if(immediate){
    if(heatFrame)cancelAnimationFrame(heatFrame);
    draw();
  }else if(!heatFrame)heatFrame=requestAnimationFrame(draw);
}
const heatObserver=new ResizeObserver(()=>layoutHeatmap());
heatObserver.observe(hotTop);
void document.fonts.ready.then(()=>layoutHeatmap());

function node(tag,cls,text) {
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text)el.textContent=text;
  return el;
}
function button(text,action,cls) {
  const el=node('button',cls,text);
  el.type='button';
  el.addEventListener('click',action);
  return el;
}
function time(at,kind) {
  const dateOnly=kind==='事件日期';
  const el=node('time','',(dateOnly?dayFormat:timeFormat).format(at)+' JST');
  el.dateTime=new Date(at).toISOString();
  if(kind==='报道时间')el.title='报道时间';
  return el;
}
function notice(text,retry) {
  const status=byId('status');
  status.replaceChildren(text);
  status.hidden=!text;
  if(retry)status.append(button('重试',retry,'paper-button'));
}
function family(topic) {
  return topic.endsWith('社会')?'社会':topic.endsWith('股市')?'市场':'科技';
}
function meta(row,tag='div') {
  const el=node(tag,'event-meta');
  el.append(node('small','',row.topic),time(row.at,row.timeKind));
  return el;
}
function translate(id,url,field) {
  const key=url+'\n'+field;
  if(!pendingTranslations.has(key)) {
    const request=translationQueue.then(()=>api.translate(id,url,field));
    translationQueue=request.catch(()=>{});
    pendingTranslations.set(key,request);
    request.then(()=>pendingTranslations.delete(key),()=>pendingTranslations.delete(key));
  }
  return pendingTranslations.get(key);
}

const headlines=new IntersectionObserver(entries=>{
  for(const {target,isIntersecting} of entries) {
    if(!isIntersecting)continue;
    headlines.unobserve(target);
    if(target.isConnected){target.translateHeadline();target.loadTilePhoto();}
  }
},{root:null});

function tileOf(row,heat,side,index,isNew) {
  const article=node('article','event '+side), heading=node('div','event-heading');
  article.dataset.event=row.id;
  article.dataset.reports=heat;
  article.style.setProperty('--i',index);
  if(isNew)article.classList.add('is-new');
  const pending=side==='week'?!row.center:!row.dayText;
  const displayTitle=pending?row.title:(side==='week'?row.center:row.dayText);
  const title=node('span','event-title',displayTitle);
  const lead=node('span','event-lead');
  if(!pending) {
    const lines=side==='week'?(row.weekLines??[]):(row.dayLines??[]);
    for(const [i,[text,at]] of lines.entries()) {
      const line=node('span','tile-line'+(i?' older':''));
      line.append(node('time','',side==='week'?mdFormat.format(at):hmFormat.format(at)),document.createTextNode(text));
      lead.append(line);
    }
    if(!lines.length)lead.hidden=true;
    if(side==='week'&&(row.age??Infinity)<36*hour)article.classList.add('is-fresh');
  } else lead.hidden=true;
  const count=node('span','heat-count',(side==='week'?'周 ':'日 ')+heat+' 篇');
  if(pending)count.append(node('b','pending','待概括'));
  const disclosure=node('span','disclosure','查看');
  disclosure.setAttribute('aria-hidden','true');
  const card={row,article,title,lead,disclosure};
  const toggle=button('',()=>choose(card),'event-toggle');
  toggle.setAttribute('aria-controls',detail.id);
  toggle.setAttribute('aria-expanded',String(selected?.row.id===row.id));
  toggle.title=row.title+' · '+heat+' 篇报道';
  toggle.append(node('span','tile-rank',String(index+1)),meta(row,'span'),title,disclosure,lead,count);
  heading.append(toggle);
  article.append(heading);
  article.translateHeadline=()=>{
    if(pending&&row.titleUrl&&needsChinese(row.title,row.titleLang)) {
      void translate(row.id,row.titleUrl,'title').then(value=>{
        title.textContent=cleanNewsTitle(value);
        toggle.title=title.textContent+' · '+heat+' 篇报道';
        layoutHeatmap();
        if(selected===card&&byId('detail-title'))byId('detail-title').textContent=title.textContent;
      }).catch(()=>{});
    }
  };
  article.loadTilePhoto=()=>{
    if(!row.hasPhoto||article.querySelector('.tile-photo'))return;
    const image=node('img','tile-photo');
    image.alt='';
    image.decoding='async';
    image.addEventListener('load',()=>image.classList.add('is-ready'),{once:true});
    image.addEventListener('error',()=>image.remove(),{once:true});
    toggle.prepend(image);
    void api.image(row.id).then(result=>{
      if(result?.data)image.src=result.data;
      else image.remove();
    }).catch(()=>image.remove());
  };
  card.toggle=toggle;
  cards.set(side+':'+row.id,card);
  return card;
}

function restRowOf(row,key,rank,max) {
  const article=node('article','event rest');
  article.style.setProperty('--i',rank-1);
  article.style.setProperty('--bar',Math.round((row[key]??0)/Math.max(1,max)*100)+'%');
  const ageHours=Math.floor((row.age??0)/hour);
  const folded=Boolean(row.isTopic&&ageHours>=48);
  if(folded)article.classList.add('is-folded');
  if(rank<=3)article.classList.add('is-podium');
  const mark=node('span','mark'+(row.isTopic?(folded?' fold':' topic'):''));
  mark.title=row.isTopic?(folded?'折叠话题':'话题'):'';
  const displayTitle=row.isTopic&&row.center?row.center:row.title;
  const title=node('span','rest-title',displayTitle);
  const disclosure=node('span','disclosure');
  disclosure.hidden=true;
  const card={row,article,title,lead:node('span','event-lead',row.latest===''+row.title?'':row.latest),disclosure};
  const btn=button('',()=>choose(card),'rest-row');
  btn.setAttribute('aria-controls',detail.id);
  btn.setAttribute('aria-expanded',String(selected?.row.id===row.id));
  const progressTip=row.weekLines?.[0]?.[0]||row.latestText||(row.latest!==row.title?row.latest:'');
  btn.title=row.title+(row.isTopic&&progressTip&&progressTip!==row.title?' ▸ '+progressTip:'');
  btn.append(node('span','rank',String(rank)),mark,title,node('b','heat-chip',String(row[key]??0)),
    node('time','',ageHours<24?ageHours+'h':Math.floor(ageHours/24)+'d'));
  card.toggle=btn;
  article.append(btn);
  cards.set('rest:'+row.id,card);
  return card;
}

function fallbackSnapshot(matching) {
  const week=matching.filter(r=>(r.weekHeat??r.reportCount??0)>0)
    .sort((a,b)=>(b.weekHeat??b.reportCount??0)-(a.weekHeat??a.reportCount??0)||b.at-a.at)
    .slice(0,5).map(r=>[r.id,r.weekHeat??r.reportCount??0]);
  const day=matching.filter(r=>(r.dayHeat??0)>0)
    .sort((a,b)=>(b.dayHeat??0)-(a.dayHeat??0)||b.at-a.at)
    .slice(0,5).map(r=>[r.id,r.dayHeat??0]);
  return {week,weekAt:feedNow,day,dayAt:feedNow};
}

function renderList() {
  const matching=items.filter(row=>active==='全部'||family(row.topic)===active);
  if(selected&&!matching.some(row=>row.id===selected.row.id))closeDetail(false);
  const byEvent=new Map(matching.map(row=>[row.id,row]));
  const snap=editionBoards?.[active]??fallbackSnapshot(matching);
  hotTop.hidden=!matching.length;
  hotRest.hidden=!matching.length;

  for(const [side,mapEl,atEl,span,pairs,at] of [
    ['week',weekMap,weekAtEl,24,snap.week??[],snap.weekAt??feedNow],
    ['day',dayMap,dayAtEl,8,snap.day??[],snap.dayAt??feedNow]
  ]) {
    const oldIds=new Set([...mapEl.children].map(n=>n.dataset.event));
    const built=pairs.map(([id,heat],i)=>{
      const row=byEvent.get(id);
      if(!row)return null;
      const card=tileOf(row,heat,side,i,oldIds.size>0&&!oldIds.has(id));
      headlines.observe(card.article);
      return card.article;
    }).filter(Boolean);
    mapEl.replaceChildren(...built);
    const left=Math.max(0,span-(feedNow-at)/hour);
    atEl.style.setProperty('--done',((span-left)/span*100).toFixed(0)+'%');
    atEl.replaceChildren(node('i','ring'),document.createTextNode(timeFormat.format(at)+' · '+(left?Math.ceil(left)+'h 后重排':'待重排')));
  }
  layoutHeatmap();

  const topIds=new Set([...(snap.week??[]).map(([id])=>id),...(snap.day??[]).map(([id])=>id)]);
  const rest=matching.filter(r=>!topIds.has(r.id));
  const dayCol=rest.filter(r=>(r.dayHeat??0)>0).sort((a,b)=>(b.dayHeat??0)-(a.dayHeat??0)||b.at-a.at);
  let weekCol=rest.filter(r=>(r.dayHeat??0)===0).sort((a,b)=>(b.weekHeat??b.reportCount??0)-(a.weekHeat??a.reportCount??0)||b.at-a.at);
  let folded=0;
  weekCol=weekCol.filter(r=>!(r.isTopic&&(r.age??0)>=48*hour)||++folded<=30);
  for(const [id,el,list,key] of [['rest-week',restWeek,weekCol,'weekHeat'],['rest-day',restDay,dayCol,'dayHeat']]) {
    const visibleItems=list.slice(0,shown[id]);
    const maxHeat=Math.max(1,...list.map(x=>x[key]??0));
    el.replaceChildren(...visibleItems.map((r,i)=>restRowOf(r,key,i+1,maxHeat).article));
    el.style.setProperty('--rows',Math.max(1,Math.ceil(visibleItems.length/2)));
    const moreBtn=document.querySelector(`.more[data-for="${id}"]`), lessBtn=document.querySelector(`.less[data-for="${id}"]`);
    const left=list.length-shown[id];
    moreBtn.hidden=left<=0;
    moreBtn.textContent='展开 '+Math.min(left,batch)+(left>batch?' / '+left:'')+' 条 ▾';
    lessBtn.hidden=shown[id]<=fold;
    if(!list.length)el.append(node('p','empty','暂无'));
  }

  byId('count').textContent=matching.length+' 件事';
  if(!matching.length)notice(active==='全部'?'近七天还没有已收录的新闻。':'这个栏目近七天没有事件。');
  syncTopButtons();
}

function overviewScroller() {return selected&&!compact.matches?overview:main;}
function syncTopButtons() {
  overviewTop.hidden=Boolean(selected&&compact.matches)||overviewScroller().scrollTop<=24;
  detailTop.hidden=!selected||detail.scrollTop<=24;
}
function scrollTop(scroller,heading) {
  heading?.focus({preventScroll:true});
  scroller.scrollTo({top:0,behavior:reducedMotion.matches?'instant':'smooth'});
}
function syncDrawer() {
  const drawer=Boolean(selected&&compact.matches);
  for(const part of behindDrawer)part.inert=drawer;
  backdrop.hidden=!drawer;
  if(drawer&&!detail.contains(document.activeElement))closeButton.focus({preventScroll:true});
  syncTopButtons();
}
function setSelected(card,value) {
  card.toggle.setAttribute('aria-expanded',String(value));
  card.disclosure.textContent=value?'已选':'查看';
}
function choose(card) {
  if(card===selected){closeDetail();return;}
  if(selected)setSelected(selected,false);
  else overviewScroll=main.scrollTop;
  selected=card;
  setSelected(card,true);
  main.classList.add('reading');
  reader.classList.add('is-reading');
  detail.hidden=false;
  renderDetail(card);
  syncDrawer();
  layoutHeatmap(true);
  if(!compact.matches)card.article.scrollIntoView({block:'nearest'});
}
function closeDetail(restoreFocus=true) {
  if(!selected)return;
  const card=selected;
  selected=null;
  detailGeneration++;
  imageObserver?.disconnect();
  void api.cancelContext().catch(()=>{});
  setSelected(card,false);
  detail.hidden=true;
  content.replaceChildren();
  main.classList.remove('reading');
  reader.classList.remove('is-reading');
  syncDrawer();
  layoutHeatmap(true);
  main.scrollTop=overviewScroll;
  if(restoreFocus&&card.toggle.isConnected) {
    card.toggle.focus({preventScroll:true});
    card.article.scrollIntoView({block:'nearest'});
  }
}

function openSource(id,report) {
  const link=node('a','',report.title);
  link.href=report.url;
  link.addEventListener('click',event=>{
    event.preventDefault();
    void api.source(id,report.url).catch(()=>{link.textContent=report.title+'（暂无法打开）';});
  });
  const arrow=node('span','source-arrow',' ↗');
  arrow.setAttribute('aria-hidden','true');
  link.append(arrow);
  return link;
}
function byline(report) {
  const line=node('span','source-byline');
  line.append(report.source?report.source+' · ':'',time(report.publishedAt));
  return line;
}
function sources(event) {
  const section=node('details','source-links'), summary=node('summary'), list=node('ul');
  list.tabIndex=0;
  list.setAttribute('aria-label','报道来源列表');
  summary.append(node('span','','情报来源'),node('span','source-count',event.reports.length+' 篇'));
  section.append(summary,list);
  section.addEventListener('toggle',()=>{
    if(!section.open||list.childElementCount)return;
    list.append(...event.reports.map(report=>{
      const item=node('li');
      item.append(openSource(event.id,report),byline(report));
      return item;
    }));
  });
  return section;
}

function opinionOf(event) {
  const group=node('details','news-wind');
  const cursor=node('div');
  group.append(node('summary','','社论风向 · X / Reddit · 最近 72 小时'),cursor);
  let loading=false,ready=false;
  const read=async()=>{
    if(ready||loading)return;
    loading=true;
    cursor.replaceChildren(node('p','queued','正在读取已保存的社论风向…'));
    try {
      const periods=await api.wind(event.id);
      const list=node('ol','timeline wind-history');
      for(const [index,period] of periods.entries()){
        const item=node('li'), fold=node('details');
        fold.open=index===0;
        const heading=node('summary');
        heading.append(time(period.to),node('strong','',period.title));
        fold.append(heading,node('p','coverage',timeFormat.formatRange(period.from,period.to)+' JST'));
        if(period.change)fold.append(node('p','wind-change',period.change));
        if(period.summary)fold.append(node('p','',period.summary));
        if(period.failed)fold.append(node('p','coverage','本期归纳未通过核对，仍可查看已取得的原帖。'));
        for(const provider of period.platforms) {
          const detail=provider.state==='ok'?provider.count+' 条已核时'+(provider.unverified?' · '+provider.unverified+' 条时间待核实':''):
            provider.state==='unknown'?'查询回执待核实':'暂未取得样本';
          fold.append(node('p','coverage',provider.platform+' · '+detail+
            (Number.isInteger(provider.credits)?' · '+provider.credits+' 点':'')+(provider.code?' · '+provider.code:'')));
        }
        const sources=node('div','wind-references');
        for(const source of period.refs) {
          sources.append(openSource(event.id,{url:source.url,title:source.platform+' · '+source.title+
            (source.at?'':' · 时间待核实')}));
        }
        fold.append(sources);
        const keywords=node('details','wind-queries');
        keywords.append(node('summary','','查询关键词'),node('p','',period.groups.join(' · ')));
        fold.append(keywords);
        item.append(fold);
        list.append(item);
      }
      cursor.replaceChildren(periods.length?list:node('p','coverage','尚无已保存的风向。'));
      ready=true;
    }catch {
      cursor.replaceChildren(node('p','coverage','风向暂时无法读取。'),button('重试',read,'paper-button'));
    }finally {loading=false;}
  };
  group.addEventListener('toggle',()=>{if(group.open)void read();});
  return group;
}
function nodeSources(id,reports) {
  const group=node('details');
  group.append(node('summary','',reports.length+' 篇来源'));
  group.addEventListener('toggle',()=>{
    if(!group.open||group.childElementCount>1)return;
    for(const report of reports) {
      const source=node('div','source');
      const title=node('p','',report.chinese?.title||report.title);
      const body=node('p','',report.chinese?.excerpt||report.excerpt);
      source.append(byline(report),title);
      if(report.excerpt)source.append(body);
      const foreign=needsChinese(report.title,report.lang)||needsChinese(report.excerpt,report.lang);
      if(foreign) {
        let original=false;
        let chinese={...report.chinese};
        const paint=()=>{
          toggle.textContent=original?'显示中文':'显示原文';
          toggle.setAttribute('aria-pressed',String(original));
          title.textContent=original?report.title:chinese.title||report.title;
          body.textContent=original?report.excerpt:chinese.excerpt||report.excerpt;
        };
        const toggle=button('',()=>{original=!original;paint();},'paper-button');
        source.append(toggle);
        paint();
        for(const field of ['title','excerpt']) {
          if(!chinese[field]&&needsChinese(report[field],report.lang)) {
            void translate(id,report.url,field).then(value=>{chinese[field]=value;paint();}).catch(()=>{});
          }
        }
      }
      group.append(source);
    }
  });
  return group;
}
function timelineOf(event) {
  const list=node('ol','timeline');
  for(const step of event.nodes) {
    const item=node('li'), stamp=time(step.at,step.timeKind);
    if(step.timeKind!=='事件时间')stamp.append(' · '+step.timeKind);
    const heading=node('strong','',step.title);
    if(step.was) {
      const badge=node('span','corrected-badge','已更正');
      badge.title=Object.entries(step.was).map(([k,v])=>(k==='title'?'原标题：':'原摘要：')+v).join('\n');
      heading.append(badge);
    }
    item.append(stamp,heading);
    if(step.evidence)item.append(node('p','',step.evidence));
    item.append(nodeSources(event.id,step.reports));
    list.append(item);
  }
  return list;
}
function photoMessage(text) {
  photoState.textContent=text;
  photoState.hidden=!text;
}
async function enlargePhoto(id,thumbnail) {
  const token=++photoGeneration;
  fullPhoto.src=thumbnail.data;
  fullPhoto.alt=thumbnail.credit+' 的新闻配图';
  byId('photo-credit').textContent=thumbnail.credit;
  photoMessage('正在读取大图…');
  photoPanel.showModal();
  try {
    const result=await api.image(id,true);
    if(token!==photoGeneration||!photoPanel.open)return;
    if(!result?.data)throw Error();
    fullPhoto.src=result.data;
    photoMessage('');
  } catch {
    if(token===photoGeneration&&photoPanel.open)photoMessage('大图暂不可用。');
  }
}
function addPhoto(section,id,token) {
  const figure=node('figure','news-photo'), thumbnail=node('img');
  thumbnail.width=192;
  thumbnail.height=128;
  thumbnail.decoding='async';
  const credit=node('figcaption');
  let result;
  const trigger=button('',()=>void enlargePhoto(id,result),'news-photo-button');
  trigger.setAttribute('aria-label','放大新闻配图');
  trigger.setAttribute('aria-haspopup','dialog');
  trigger.disabled=true;
  const cue=node('span','photo-zoom','放大');
  cue.setAttribute('aria-hidden','true');
  trigger.append(thumbnail,cue);
  figure.append(trigger,credit);
  const observer=new IntersectionObserver(entries=>{
    if(!entries.some(entry=>entry.isIntersecting))return;
    observer.disconnect();
    void api.image(id).then(photo=>{
      if(token!==detailGeneration||!figure.isConnected)return;
      if(!photo?.data){figure.remove();return;}
      result=photo;
      thumbnail.alt=photo.credit+' 的新闻配图';
      credit.textContent=photo.credit;
      thumbnail.addEventListener('error',()=>figure.remove(),{once:true});
      thumbnail.addEventListener('load',()=>{trigger.disabled=false;},{once:true});
      thumbnail.src=photo.data;
    }).catch(()=>figure.remove());
  },{root:detail});
  section.append(figure);
  observer.observe(figure);
  imageObserver=observer;
}

async function renderDetail(card,keepScroll=false) {
  imageObserver?.disconnect();
  const token=++detailGeneration, row=card.row, previousTop=detail.scrollTop;
  const title=node('h3','',card.title.textContent);
  title.id='detail-title';
  title.tabIndex=-1;
  const lead=node('p','latest');
  const latest=card.lead.textContent;
  lead.append(node('b','','最新进展'),latest);
  lead.hidden=!latest;
  const section=node('section','event-summary');
  const timeline=node('section','timeline-panel');
  timeline.setAttribute('aria-live','polite');
  timeline.append(node('p','queued','正在读取详情…'));
  content.replaceChildren(meta(row),title,lead,section,timeline);
  if(!keepScroll)detail.scrollTop=0;
  syncTopButtons();
  try {
    const event=await api.detail(row.id);
    if(token!==detailGeneration)return;
    if(event.was) {
      const badge=node('span','corrected-badge','已更正');
      badge.title='原主线：'+event.was;
      title.append(badge);
    }
    const copy=node('div','status-copy');
    copy.append(node('h4','','现状'));
    const coverageStart=dayFormat.format(event.coverageFrom), coverageEnd=dayFormat.format(event.coverageTo);
    if(coverageStart!==coverageEnd)
      copy.append(node('p','coverage','收录报道 '+dayFormat.formatRange(event.coverageFrom,event.coverageTo)+' · JST'));
    const paragraphs=event.paragraphs.map(text=>node('p','',text));
    if(event.paragraphs.includes(latest))lead.hidden=true;
    copy.append(...paragraphs);
    section.append(copy);
    if(event.hasImage)addPhoto(section,row.id,token);
    timeline.replaceChildren(node('h4','','发展时间线'),timelineOf(event),
      ...(editionBoards&&api.wind?[opinionOf(event)]:[]),sources(event));
    if(keepScroll)detail.scrollTop=previousTop;
    if(event.canEnrich) {
      const progress=node('p','queued','正在补充现状…');
      copy.append(progress);
      void api.context(row.id).then(text=>{
        if(token!==detailGeneration)return;
        if(text)copy.insertBefore(node('p','',text),paragraphs[0]||progress);
        progress.remove();
        if(!text&&!paragraphs.length)copy.append(node('p','','来源暂未提供更多可读的详情。'));
      }).catch(()=>{
        if(token===detailGeneration)progress.textContent=paragraphs.length?'':'暂未读到更多详情。';
      });
    } else if(!paragraphs.length)copy.append(node('p','','来源暂未提供更多可读的详情。'));
  } catch {
    if(token===detailGeneration)timeline.replaceChildren(node('p','queued','详情暂时无法读取。'),
      button('重试',()=>renderDetail(card),'paper-button'));
  }
}

function showNewsUpdate(pending) {
  const label=pending?'读取新增新闻':'刷新简报';
  refresh.toggleAttribute('data-pending',pending);
  refresh.setAttribute('aria-label',label);
  refresh.title=label;
}

async function load() {
  const token=++generation;
  refresh.disabled=true;
  notice('正在读取近七天事件…');
  try {
    const feed=await api.list();
    if(token!==generation)return;
    const current=selected?.row.id;
    headlines.disconnect();
    cards.clear();
    items=feed.items;
    feedNow=feed.at??Date.now();
    editionBoards=feed.boards;
    byId('edition').textContent=dayFormat.formatRange(feed.from,feed.at)+' · JST';
    byId('pending-archive').textContent='待归档 '+feed.pendingArchive+' 件';
    byId('pending-archive').hidden=!feed.pendingArchive;
    notice('');
    renderList();
    const matchedCard=current&&([...cards.values()].find(c=>c.row.id===current));
    if(matchedCard) {
      selected=matchedCard;
      setSelected(selected,true);
      renderDetail(selected,true);
    }
    showNewsUpdate(false);
  } catch {
    if(token===generation)notice('简报暂时无法读取。',load);
  } finally {
    if(token===generation)refresh.disabled=false;
  }
}

filters.addEventListener('click',event=>{
  if(event.target.tagName!=='BUTTON')return;
  active=event.target.textContent;
  shown['rest-week']=shown['rest-day']=fold;
  for(const option of filters.children)option.setAttribute('aria-pressed',String(option.textContent===active));
  notice('');
  renderList();
});
document.querySelectorAll('.more').forEach(btn=>btn.addEventListener('click',()=>{shown[btn.dataset.for]+=batch;renderList();}));
document.querySelectorAll('.less').forEach(btn=>btn.addEventListener('click',()=>{shown[btn.dataset.for]=fold;renderList();}));
refresh.addEventListener('click',load);
closeButton.addEventListener('click',()=>closeDetail());
backdrop.addEventListener('click',()=>closeDetail());
for(const scroller of [main,overview,detail])scroller.addEventListener('scroll',syncTopButtons,{passive:true});
overviewTop.addEventListener('click',()=>scrollTop(overviewScroller(),byId('overview-title')));
detailTop.addEventListener('click',()=>scrollTop(detail,byId('detail-title')));
compact.addEventListener('change',()=>{
  syncDrawer();
  layoutHeatmap();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!photoPanel.open)closeDetail();});
photoPanel.addEventListener('close',()=>{
  photoGeneration++;
  if(!photoPanel.open)fullPhoto.removeAttribute('src');
});
byId('archive').addEventListener('click',()=>void api.archive().catch(()=>notice('无法打开本机归档目录。')));
api.onNew(readNow=>{
  if(readNow){void load();return;}
  showNewsUpdate(true);
});
void load();
