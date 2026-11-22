import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {cleanNewsTitle,needsChinese} from './news-layout.mjs';
import {createNewsHistory,newsSourceUrl} from './news-history.mjs';
import {describeMarket,followsMarketTrend,marketCoverage,marketGroup,marketSummary,sameMarketUpdate} from './news-market.mjs';
import {createNewsEditorial} from './news-editorial.mjs';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('../workflows/comfyui/news_watch.py', import.meta.url));
const day = 86_400_000;
const stamp = new Intl.DateTimeFormat('zh-CN', {
  timeZone:'Asia/Tokyo', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
});

export async function fetchNewsBriefing(signal, days=3) {
  const {stdout} = await exec('python', ['-B', script, String(days)], {signal, windowsHide:true, timeout:55_000, maxBuffer:8_000_000});
  return JSON.parse(stdout);
}

export async function fetchNewsImage(url,signal,full=false) {
  const {stdout}=await exec('python',['-B',script,full?'--image-full':'--image',url],{signal,windowsHide:true,timeout:26000,maxBuffer:4500000});
  const jpeg=stdout.trim();
  if(!jpeg.startsWith('/9j/'))throw Error('未取得新闻图片');
  return 'data:image/jpeg;base64,'+jpeg;
}

const key=text=>text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}%.+\-−]/gu,'');
const casualty=/[\s，,:：]*(?:已?造成|导致|致)?\s*(\d+)\s*(?:人)?(?:死亡|身亡|死)[\s，,、和及]*(\d+)\s*(?:人)?(?:受伤|伤)\s*[。！!]?$/u;

function headlineKey(title) {
  // 保留主体与伤亡数字，只统一连接词和计数写法。
  return key(title.normalize('NFKC').replace(/^美股(?=纳指|纳斯达克)/u,'').replace(casualty,' $1死$2伤'));
}

function stockMove(title,topic){
  if(!topic.endsWith('股市'))return null;
  const normalized=title.normalize('NFKC');
  const movement=normalized.match(/^([\p{Script=Han}]{2,12}|[a-z][a-z0-9. -]{1,20}?)\s*(?:市值[^,;]*[,;]\s*)?股价\s*(盘中|收盘|单日|本周|单周)?\s*(?:暴|大|急)?(下跌|上涨|跌|涨|重挫|下挫|飙升)\s*(?:超过?|约|逾|近|达)?\s*(\d+(?:\.\d+)?)\s*%/iu);
  if(!movement)return null;
  const [,name,session,direction,percent]=movement;
  const subject=name.trim();
  const period=normalized.match(/(?:\d{1,2}月\d{1,2}[日号]|\d{4}-\d{2}-\d{2})/u)?.[0];
  return {subject:/^NVIDIA$/i.test(subject)?'英伟达':subject,direction:/涨|升/u.test(direction)?'上涨':'下跌',
    percent:Number(percent),period,session};
}

function sameStory(a,b){
  if(Math.abs(a.row.publishedAt-b.row.publishedAt)>day/2)return false;
  if(a.titleKey&&a.titleKey===b.titleKey)return true;
  const x=a.move,y=b.move;
  return a.row.topic===b.row.topic&&x&&y&&key(x.subject)===key(y.subject)&&x.direction===y.direction
    && Math.abs(x.percent-y.percent)<=0.05 && (!x.period||!y.period||x.period===y.period)
    && (!x.session||!y.session||x.session===y.session);
}

function capLoss(title){
  const match=title.normalize('NFKC').match(/市值(?:蒸发|缩水|损失)\s*(?:超过?|约|近|逾)?\s*([\d,.]+)\s*(万亿|亿|万)?\s*(美元|港元|日元|人民币|元)/u);
  if(!match)return null;
  const [,amount,scale,currency]=match;
  return currency+':'+Number(amount.replaceAll(',',''))*({万亿:1e12,亿:1e8,万:1e4}[scale]??1);
}

function excerptSummary(row){
  const excerpt=(row.chinese?.excerpt||row.excerpt||'').trim();
  if(!row.chinese?.excerpt&&needsChinese(excerpt,row.lang))return '';
  const titleKey=key(cleanNewsTitle(row.chinese?.title||row.title));
  const sentence=excerpt.match(/^[^\r\n]*?(?:[。！？!?]|\.(?=\s|$)|(?=\r?\n|$))/u)?.[0]?.trim();
  if(!sentence)return '';
  const sentenceKey=key(sentence);
  if(!sentenceKey||sentenceKey.startsWith(titleKey)||titleKey.startsWith(sentenceKey))return '';
  return sentence.length>92?sentence.slice(0,91)+'…':sentence;
}

// 只在阅读时合并，旧期可直接使用，原报道仍按原网址和时间保存。
function storyEntry(row) {
  const title=cleanNewsTitle(row.title);
  return {row,title,titleKey:headlineKey(title),move:stockMove(title,row.topic)};
}

export function briefNews(items,{confirmedNode=false}={}){
  const market=items.length>1&&(confirmedNode?describeMarket(items):marketGroup(items));
  if(market)return [{...market.core[0].report,reports:items,...marketSummary(market)}];
  const groups=[];
  for(const row of items){
    const entry=storyEntry(row);
    const group=groups.find(group=>group.every(other=>sameStory(entry,other)));
    if(group)group.push(entry);
    else groups.push([entry]);
  }
  return groups.map(group=>{
    group.sort((a,b)=>b.row.publishedAt-a.row.publishedAt);
    const {row,move}=group[0];
    const reports=group.map(entry=>entry.row);
    if(group.length>1&&group.every(entry=>entry.move)){
      const losses=new Set(group.map(entry=>capLoss(entry.title)).filter(Boolean));
      const percent=Math.round(move.percent*10)/10;
      return {...row,reports,headline:`${move.subject}股价${move.direction}约${percent}%`,
        summary:losses.size>1?'各篇报道的市值损失数字不一，展开可核对出处。':''};
    }
    return {...row,reports,summary:reports.map(excerptSummary).find(Boolean)||''};
  });
}

export function createNewsBriefing(db, now, notify, fetchNews=fetchNewsBriefing, options={}) {
  db.exec(`CREATE TABLE IF NOT EXISTS news_seen (key TEXT PRIMARY KEY, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS news_briefing (id INTEGER PRIMARY KEY, lastCheck INTEGER, latest TEXT);
    CREATE TABLE IF NOT EXISTS news_poll_state (id INTEGER PRIMARY KEY, retryAfter TEXT NOT NULL);`);
  const read = db.prepare('SELECT * FROM news_briefing WHERE id=1');
  const seen = db.prepare('SELECT 1 FROM news_seen WHERE key=?');
  const mark = db.prepare('INSERT OR IGNORE INTO news_seen VALUES(?,?)');
  const readRetry=db.prepare('SELECT retryAfter FROM news_poll_state WHERE id=1');
  const saveRetry=db.prepare('INSERT INTO news_poll_state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET retryAfter=excluded.retryAfter');
  const editorial=options.editorial&&createNewsEditorial(db,{compile:options.compile,...options.editorial,now});
  const history=createNewsHistory(db,{...options,editorial,now,brief:reports=>briefNews(reports,{confirmedNode:true}),
    describeMarket,marketGroup,sameMarketUpdate,followsMarketTrend,
    marketRole:report=>marketCoverage(report)?.kind,canReconcile:report=>casualty.test(report.title.normalize('NFKC')),
    sameReport:(a,b)=>sameStory(storyEntry(a),storyEntry(b))});
  function edition() {
    const raw=read.get()?.latest;
    return raw?JSON.parse(raw):{at:null,items:[]};
  }
  history.migrate(edition().items);
  function saveChinese(at,url,field,original,translated) {
    history.saveChinese(url,field,original,translated);
    const current=edition();
    const row=current.items.find(item=>item.url===url);
    if(current.at!==at||!row||row[field]!==original)return;
    row.chinese={...row.chinese,[field]:translated};
    db.prepare('UPDATE news_briefing SET latest=? WHERE id=1').run(JSON.stringify(current));
  }
  function latest() {
    const {at,from,items,boards}=history.list();
    if(!items.length)return {state:'answer',text:'最近七天暂无新闻。'};
    const sources = [];
    const entry=boards?.全部;
    const featured=entry?[...entry.hot,...entry.key].map(id=>items.find(row=>row.id===id)):items;
    const stories=featured.map(row=>{
      const detail=history.get(row.id);
      const citations=detail.reports.map(report=>{
        sources.push({title:report.title,url:report.url,
          snippet:[report.source,stamp.format(report.publishedAt)+' JST'].filter(Boolean).join(' · ')});
        return `[${sources.length}]`;
      }).join('');
      return [`${citations} ${row.topic} · ${row.title}`, ...detail.paragraphs].join('\n');
    });
    return {state:'answer',sources,text:stamp.format(from)+' — '+stamp.format(at)+' JST · 最近七天新闻简报\n\n'+stories.join('\n\n')};
  }
  function retry(edition) {
    const state=readRetry.get()?.retryAfter;
    return state?JSON.parse(state):edition.retryAfter??{};
  }
  async function archiveOld(signal) {
    try {
      const {saved,pending,failed}=await history.archive(signal);
      return (saved?'；已归档 '+saved+' 件':'')+(pending?'；待归档 '+pending+' 件':'')
        +(failed?'；'+failed+' 件归档暂不可用，原资料已保留':'');
    } catch(error) {
      signal.throwIfAborted();
      return '；归档暂不可用，原资料已保留';
    }
  }
  async function poll(signal, enabled=()=>true) {
    const at = now();
    const floor = at - 3*day;
    const previous=edition();
    const earliest=Math.max(floor,Math.min(previous.at??floor,...Object.values(retry(previous))));
    const days=Math.min(3,Math.max(1,Math.ceil((at-earliest)/day)));
    let result;
    try {result=await fetchNews(signal,days);}
    catch(error) {
      signal.throwIfAborted();
      if(enabled())await archiveOld(signal);
      throw error;
    }
    const {items,failed}=result;
    signal.throwIfAborted();
    if (!enabled()) return '新闻关注已暂停';
    const fresh = [];
    let changed;
    db.exec('BEGIN IMMEDIATE');
    try {
      const current=edition();
      if((Number.isFinite(current.at) && current.at>=at) || (read.get()?.lastCheck??0)>at){
        db.exec('COMMIT');
        return '本次未收录新报道';
      }
      const retryState=retry(current);
      const after=topic=>retryState[topic]??current.at??(floor-1);
      const retryAfter=Object.fromEntries(failed.map(topic=>[topic,Math.max(floor-1,after(topic))]));
      let from=Math.max(floor,current.at??floor);
      db.prepare('DELETE FROM news_seen WHERE at<?').run(floor);
      for (const row of items) {
        if (!newsSourceUrl(row.url) || typeof row.title!=='string' || !row.title.trim() ||
            typeof row.topic!=='string' || !row.topic || !Number.isFinite(row.publishedAt) || row.publishedAt>at ||
            row.publishedAt<floor || row.publishedAt<=after(row.topic)) continue;
        if (seen.get(row.url)||history.hasReport(row.url)) continue;
        fresh.push(row);
        from=Math.min(from,Math.max(floor,after(row.topic)));
        mark.run(row.url, at);
      }
      changed=history.ingest(fresh,at);
      if(editorial)history.list(true);
      saveRetry.run(JSON.stringify(retryAfter));
      db.prepare(`INSERT INTO news_briefing VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET
        lastCheck=excluded.lastCheck, latest=coalesce(excluded.latest,latest)`)
        .run(at, fresh.length?JSON.stringify({at,from,retryAfter,items:fresh}):null);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    if (fresh.length) notify(changed);
    const archived=await archiveOld(signal);
    if (!items.length && failed.length===9) throw Error('本轮九个新闻主题均暂时无法读取');
    const detail = failed.length?'；暂时未能读取'+failed.join('、'):'';
    return (fresh.length?'已收录 '+fresh.length+' 条新报道':'本次未收录新报道')+detail+archived;
  }
  return {latest, edition, feed:history.list, event:history.get, saveChinese, poll, last:()=>read.get()?.lastCheck,
    editorialStep:editorial&&(async signal=>{
      const result=await editorial.step(history.list(true),history.get,signal);
      signal.throwIfAborted();
      if(/^(?:核验新闻标题|汇总新闻事实|合并社论风向)/u.test(result))notify([]);
      return result;
    }),
    editorialHistory:id=>editorial?.history(id)??[]};
}
