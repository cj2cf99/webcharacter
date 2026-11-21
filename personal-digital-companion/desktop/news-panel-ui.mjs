import {arrangeNews,needsChinese} from './news-layout.mjs';

const api=window.newsPanel;
const byId=id=>document.getElementById(id);
const node=(tag,cls,txt)=>{
  const element=document.createElement(tag);
  if(cls)element.className=cls;
  if(txt)element.textContent=txt;
  return element;
};
const shortTime=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const editionTime=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
let edition={at:null,items:[]},active='全部',generation=0,worker=Promise.resolve(),engaged=false;
const views=new Map();
function status(message){const el=byId('state');el.textContent=message;el.hidden=!message;}
function button(label,action,cls=''){
  const el=node('button',cls,label);el.type='button';el.addEventListener('click',action);return el;
}
function tile(row,size,family){
  const article=node('article','tile '+size);article.dataset.family=family;
  const story=button('',async()=>{
    engaged=true;
    if(view.loading){view.open=!view.open;paint();return;}
    view.open=!view.open;paint();
    if(!view.open||view.loaded)return;
    const id=generation;view.loading=true;
    try{
      const data=await api.detail(edition.at,row.url);
      if(id!==generation)return;
      row.excerpt=data.excerpt;row.chinese.excerpt=data.chinese;view.loaded=true;
      if(!view.original)translate('excerpt');
    }catch{view.loadError=true;}
    finally{view.loading=false;}
    paint();
  },'story');
  const title=node('strong','headline'),meta=node('span','meta',[row.source,shortTime.format(row.publishedAt)+' JST'].filter(Boolean).join(' · '));
  story.append(node('span','tile-topic',row.topic),title,meta);
  const language=button('',()=>{
    engaged=true;
    view.original=!view.original;
    if(!view.original){translate('title');if(view.open)translate('excerpt');}
    paint();
  },'language');
  const details=node('div','details'),body=node('p'),actions=node('div','actions');
  const source=button('查看报道 ↗',()=>api.source(edition.at,row.url).catch(()=>status('未能打开报道来源。')));
  const retry=button('重试',()=>{
    if(view.loadError){view.loadError=false;view.open=false;story.click();}
    else {view.original=false;translate('title');if(view.open)translate('excerpt');paint();}
  });
  actions.append(source);details.append(body,actions);article.append(story,language,retry,details);
  const view={open:false,original:false,loaded:false,pending:new Set(),failed:new Set(),loadError:false};
  function text(field){
    const raw=row[field]||'';
    if(view.original||!needsChinese(raw,row.lang))return raw;
    if(row.chinese[field])return row.chinese[field];
    return view.failed.has(field)?'中文翻译暂不可用，可切换原文。':'正在本机翻译…';
  }
  function paint(){
    title.textContent=text('title');
    story.setAttribute('aria-expanded',String(view.open));
    details.hidden=!view.open;
    body.textContent=view.loadError?'详情读取失败。':!view.loaded?'正在读取报道详情…':
      (text('excerpt')||'本条仅提供标题，可打开来源阅读。');
    language.hidden=!needsChinese(row.title,row.lang)&&!(view.loaded&&needsChinese(row.excerpt,row.lang));
    language.textContent=view.original?'显示中文':'显示原文';
    language.setAttribute('aria-pressed',String(view.original));
    retry.hidden=!(view.loadError||(!view.original&&view.failed.size));
  }
  function translate(field){
    if(!needsChinese(row[field],row.lang)||row.chinese[field]||view.pending.has(field))return;
    const id=generation;
    view.pending.add(field);view.failed.delete(field);
    worker=worker.then(async()=>{
      if(id!==generation)return;
      try{row.chinese[field]=await api.translate(edition.at,row.url,field);}
      catch{view.failed.add(field);}
      finally{view.pending.delete(field);paint();}
    });
  }
  paint();translate('title');
  return article;
}
function draw(){
  const board=byId('board');
  const groups=arrangeNews(edition.items,edition.at);
  board.replaceChildren();
  for(const group of groups){
    const rows=group.rows.filter(r=>active==='全部'||r.family===active);
    if(!rows.length)continue;
    const section=node('section','cluster'),tiles=node('div','tiles');
    section.append(node('h3','',active==='全部'?group.label:active),tiles);
    for(const {item,size,family,headline} of rows){
      if(!views.has(item.url))views.set(item.url,tile(item,size,family));
      const card=views.get(item.url);
      card.className='tile '+size;
      card.querySelector('.tile-topic').textContent=headline?'头条 · '+item.topic:item.topic;
      tiles.append(card);
    }
    board.append(section);
  }
  status(board.children.length?'':edition.items.length?'本期没有这个分类的报道。':'本机还没有新闻简报，下一轮有新报道时会显示在这里。');
  for(const b of byId('filters').children)b.setAttribute('aria-pressed',String(b.textContent===active));
}
async function load(){
  const id=++generation;const refresh=byId('refresh');refresh.disabled=true;status('正在读取本机简报…');
  try{
    const data=await api.list();
    if(id!==generation)return;
    edition=data;views.clear();engaged=false;
    for(const row of edition.items)row.chinese??={};
    byId('edition').textContent=data.at?editionTime.format(data.at)+' JST':'东京时间 JST';
    byId('count').textContent=data.items.length?data.items.length+' 篇报道':'';
    refresh.textContent='↻';refresh.setAttribute('aria-label','重新读取简报');draw();
    if(data.items.some(row=>needsChinese(row.title,row.lang)&&!row.chinese.title))
      void worker.then(()=>{if(id===generation&&!engaged&&!document.querySelector('main').scrollTop)draw();});
  }catch{status('简报读取失败，可点标题栏刷新重试。');}
  finally{if(id===generation)refresh.disabled=false;}
}
for(const name of ['全部','社会','科技','市场'])byId('filters').append(button(name,()=>{engaged=true;active=name;draw();}));
byId('refresh').onclick=load;
api.onNew(()=>{byId('refresh').textContent='查看新一期 ↻';byId('refresh').setAttribute('aria-label','查看新一期简报');});
void load();
