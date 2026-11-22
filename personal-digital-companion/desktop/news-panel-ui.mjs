import {cleanNewsTitle,needsChinese,newsHighlights} from './news-layout.mjs';
import {drawHeatmap} from './news-heatmap.mjs';

const api=window.newsPanel, byId=id=>document.getElementById(id);
const main=document.querySelector('main'), reader=byId('reader'), overview=document.querySelector('.overview');
const board=byId('event-list'), filters=byId('filters'), more=byId('more-events'), refresh=byId('refresh');
const hotBoard=byId('hot-list'), keyBoard=byId('key-list');
const digest=byId('digest-columns'), quietBoard=byId('quiet-board'), quietList=byId('quiet-list');
const detail=byId('event-detail'), content=byId('detail-content'), closeButton=byId('close-detail');
const backdrop=byId('detail-backdrop'), overviewTop=byId('overview-top'), detailTop=byId('detail-top');
const photoPanel=byId('photo-panel'), fullPhoto=byId('photo-full'), photoState=byId('photo-state');
const compact=matchMedia('(max-width:700px)'), reducedMotion=matchMedia('(prefers-reduced-motion:reduce)');
const behindDrawer=document.querySelectorAll('.mast, .folio, .overview');
const timeFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const dayFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit'});
const cards=new Map(), pendingTranslations=new Map();
let items=[], selected=null, active='全部', limit=0, overviewScroll=0, generation=0, detailGeneration=0, photoGeneration=0;
let translationQueue=Promise.resolve();
let imageObserver;
let editionBoards,heatFrame;
function layoutHeatmap(){
  if(heatFrame||!editionBoards)return;
  heatFrame=requestAnimationFrame(()=>{
    heatFrame=null;
    for(const map of [digest,board])drawHeatmap(map);
  });
}
const heatObserver=new ResizeObserver(layoutHeatmap);
heatObserver.observe(digest);
heatObserver.observe(board);

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

function cardOf(row) {
  const article=node('article','event'), heading=node('div','event-heading');
  article.dataset.event=row.id;
  const title=node('span','event-title',row.title), lead=node('span','event-lead',row.latest===row.title?'':row.latest);
  if(!lead.textContent)lead.hidden=true;
  const disclosure=node('span','disclosure','查看');
  disclosure.setAttribute('aria-hidden','true');
  const card={row,article,title,lead,disclosure};
  const toggle=button('',()=>choose(card),'event-toggle');
  toggle.setAttribute('aria-controls',detail.id);
  toggle.setAttribute('aria-expanded','false');
  toggle.append(meta(row,'span'),title,disclosure,lead);
  if(row.reportCount) {
    article.dataset.reports=row.reportCount;
    toggle.append(node('span','heat-count',row.reportCount+' 篇'));
    toggle.title=row.title+' · '+row.reportCount+' 篇报道';
  }
  heading.append(toggle);
  article.append(heading);
  article.translateHeadline=()=>{
    if(row.titleUrl && needsChinese(row.title,row.titleLang)) {
      void translate(row.id,row.titleUrl,'title').then(value=>{
        title.textContent=cleanNewsTitle(value);
        if(row.reportCount)toggle.title=title.textContent+' · '+row.reportCount+' 篇报道';
        layoutHeatmap();
        if(selected===card && byId('detail-title'))byId('detail-title').textContent=title.textContent;
      }).catch(()=>{});
    }
  };
  article.loadTilePhoto=()=>{
    if(!row.hasPhoto||!article.closest('[data-heatmap]')||article.querySelector('.tile-photo'))return;
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
  return card;
}

function renderList() {
  const matching=items.filter(row=>active==='全部'||family(row.topic)===active);
  if(selected&&!matching.some(row=>row.id===selected.row.id))closeDetail(false);
  const membership=editionBoards?.[active];
  let quiet=[];
  const {hot,key,rest}=membership?(()=>{
    const rows=new Map(matching.map(row=>[row.id,row]));
    const held=new Set([...membership.hot,...membership.key]);
    const paused=new Set(membership.quiet);
    quiet=membership.quiet.map(id=>rows.get(id)).filter(Boolean);
    const visible=ids=>ids.filter(id=>!paused.has(id)).map(id=>rows.get(id)).filter(Boolean);
    return {hot:visible(membership.hot),key:visible(membership.key),rest:matching.filter(row=>!held.has(row.id))};
  })():newsHighlights(matching);
  const selectedPosition=rest.findIndex(row=>row.id===selected?.row.id);
  if(selectedPosition>=0)limit=Math.max(limit,selectedPosition+1);
  const render=(target,rows)=>target.replaceChildren(...rows.map(row=>{
    if(!cards.has(row.id)) {
      const card=cardOf(row);
      cards.set(row.id,card);
      headlines.observe(card.article);
    }
    return cards.get(row.id).article;
  }));
  render(hotBoard,hot);
  render(keyBoard,key);
  render(quietList,quiet);
  render(board,rest.slice(0,limit));
  quietBoard.hidden=!quiet.length;
  byId('quiet-count').textContent=quiet.length+' 个话题';
  byId('heat-key').hidden=!membership||!(hot.length+key.length);
  [digest,board].forEach(root=>root.toggleAttribute('data-heatmap',Boolean(membership)));
  [hotBoard,keyBoard].forEach(root=>root.toggleAttribute('data-heat-group',Boolean(membership)));
  digest.dataset.count=hot.length+key.length;
  layoutHeatmap();
  hotBoard.parentElement.hidden=!hot.length;
  keyBoard.parentElement.hidden=!key.length;
  byId('count').textContent=matching.length+' 件事';
  more.hidden=rest.length<=limit;
  more.setAttribute('aria-expanded',String(limit>0));
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
    item.append(stamp,node('strong','',step.title));
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
    editionBoards=feed.boards;
    byId('edition').textContent=dayFormat.formatRange(feed.from,feed.at)+' · JST';
    byId('pending-archive').textContent='待归档 '+feed.pendingArchive+' 件';
    byId('pending-archive').hidden=!feed.pendingArchive;
    notice('');
    renderList();
    if(current&&cards.has(current)) {
      selected=cards.get(current);
      setSelected(selected,true);
      renderDetail(selected,true);
    }
    refresh.textContent='↻';
    refresh.setAttribute('aria-label','刷新简报');
  } catch {
    if(token===generation)notice('简报暂时无法读取。',load);
  } finally {
    if(token===generation)refresh.disabled=false;
  }
}

filters.addEventListener('click',event=>{
  if(event.target.tagName!=='BUTTON')return;
  active=event.target.textContent;
  limit=0;
  quietBoard.open=false;
  for(const option of filters.children)option.setAttribute('aria-pressed',String(option.textContent===active));
  notice('');
  renderList();
});
more.addEventListener('click',()=>{limit+=20;renderList();});
refresh.addEventListener('click',load);
closeButton.addEventListener('click',()=>closeDetail());
backdrop.addEventListener('click',()=>closeDetail());
for(const scroller of [main,overview,detail])scroller.addEventListener('scroll',syncTopButtons,{passive:true});
overviewTop.addEventListener('click',()=>scrollTop(overviewScroller(),byId('overview-title')));
detailTop.addEventListener('click',()=>scrollTop(detail,byId('detail-title')));
compact.addEventListener('change',syncDrawer);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!photoPanel.open)closeDetail();});
photoPanel.addEventListener('close',()=>{
  photoGeneration++;
  if(!photoPanel.open)fullPhoto.removeAttribute('src');
});
byId('archive').addEventListener('click',()=>void api.archive().catch(()=>notice('无法打开本机归档目录。')));
api.onNew(()=>{
  refresh.textContent='有更新 ↻';
  refresh.setAttribute('aria-label','读取新增新闻');
});
void load();
