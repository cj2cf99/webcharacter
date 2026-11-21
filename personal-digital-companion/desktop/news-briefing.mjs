import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

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

export async function fetchNewsImage(url,signal) {
  const {stdout}=await exec('python',['-B',script,'--image',url],{signal,windowsHide:true,timeout:22000,maxBuffer:1100000});
  const jpeg=stdout.trim();
  if(!jpeg.startsWith('/9j/'))throw Error('未取得新闻图片');
  return 'data:image/jpeg;base64,'+jpeg;
}

export function createNewsBriefing(db, now, notify, fetchNews=fetchNewsBriefing) {
  db.exec(`CREATE TABLE IF NOT EXISTS news_seen (key TEXT PRIMARY KEY, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS news_briefing (id INTEGER PRIMARY KEY, lastCheck INTEGER, latest TEXT);`);
  const read = db.prepare('SELECT * FROM news_briefing WHERE id=1');
  const seen = db.prepare('SELECT 1 FROM news_seen WHERE key=?');
  const mark = db.prepare('INSERT OR IGNORE INTO news_seen VALUES(?,?)');
  function edition() {
    const raw=read.get()?.latest;
    return raw?JSON.parse(raw):{at:null,items:[]};
  }
  function saveChinese(at,url,field,original,translated) {
    const current=edition();
    const row=current.items.find(item=>item.url===url);
    if(current.at!==at||!row||row[field]!==original)return;
    row.chinese={...row.chinese,[field]:translated};
    db.prepare('UPDATE news_briefing SET latest=? WHERE id=1').run(JSON.stringify(current));
  }
  function latest() {
    const raw = read.get()?.latest;
    if (!raw) return {state:'answer', text:'还没有收到关注主题的新报道。'};
    const {at, from, items} = JSON.parse(raw);
    const sources = items.map(row=>({title:row.title, url:row.url,
      snippet:[row.source, stamp.format(row.publishedAt)+' JST'].filter(Boolean).join(' · ')}));
    const period=Number.isFinite(from)?stamp.format(from)+' — ':'';
    return {state:'answer', sources, text:period+stamp.format(at)+' JST · 最近一期新闻简报\n\n'+
      items.map((row,i)=>`[${i+1}] ${row.topic} · ${row.title}\n${sources[i].snippet}`).join('\n\n')};
  }
  async function poll(signal, enabled=()=>true) {
    const at = now();
    const floor = at - 3*day;
    const previous=edition();
    const earliest=Math.max(floor,Math.min(previous.at??floor,...Object.values(previous.retryAfter??{})));
    const days=Math.min(3,Math.max(1,Math.ceil((at-earliest)/day)));
    const {items, failed} = await fetchNews(signal,days);
    signal.throwIfAborted();
    if (!enabled()) return '新闻关注已暂停';
    const fresh = [];
    db.exec('BEGIN IMMEDIATE');
    try {
      const current=edition();
      if((Number.isFinite(current.at) && current.at>=at) || (read.get()?.lastCheck??0)>at){
        db.exec('COMMIT');
        return '本次未收录新报道';
      }
      const after=topic=>current.retryAfter?.[topic]??current.at??(floor-1);
      const retryAfter=Object.fromEntries(failed.map(topic=>[topic,Math.max(floor-1,after(topic))]));
      let from=Math.max(floor,current.at??floor);
      db.prepare('DELETE FROM news_seen WHERE at<?').run(floor);
      for (const row of items) {
        if (!row.url || !row.title || !Number.isFinite(row.publishedAt) || row.publishedAt>at ||
            row.publishedAt<floor || row.publishedAt<=after(row.topic)) continue;
        const titleKey = row.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
        if (seen.get(row.url) || (titleKey && seen.get(titleKey))) continue;
        fresh.push(row);
        from=Math.min(from,Math.max(floor,after(row.topic)));
        mark.run(row.url, at);
        if(titleKey)mark.run(titleKey, at);
      }
      db.prepare(`INSERT INTO news_briefing VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET
        lastCheck=excluded.lastCheck, latest=coalesce(excluded.latest,latest)`)
        .run(at, fresh.length?JSON.stringify({at,from,retryAfter,items:fresh}):null);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    if (fresh.length) notify(fresh);
    if (!items.length && failed.length===9) throw Error('本轮九个新闻主题均暂时无法读取');
    const detail = failed.length?'；暂时未能读取'+failed.join('、'):'';
    return (fresh.length?'已收录 '+fresh.length+' 条新报道':'本次未收录新报道')+detail;
  }
  return {latest, edition, saveChinese, poll, last:()=>read.get()?.lastCheck};
}
