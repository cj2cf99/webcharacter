import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('../workflows/comfyui/news_watch.py', import.meta.url));
const day = 86_400_000;
const stamp = new Intl.DateTimeFormat('zh-CN', {
  timeZone:'Asia/Tokyo', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
});

export async function fetchNewsBriefing(signal) {
  const {stdout} = await exec('python', ['-B', script], {signal, windowsHide:true, timeout:55_000, maxBuffer:512_000});
  return JSON.parse(stdout);
}

export function createNewsBriefing(db, now, notify, fetchNews=fetchNewsBriefing) {
  db.exec(`CREATE TABLE IF NOT EXISTS news_seen (key TEXT PRIMARY KEY, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS news_briefing (id INTEGER PRIMARY KEY, lastCheck INTEGER, latest TEXT);`);
  const read = db.prepare('SELECT * FROM news_briefing WHERE id=1');
  const seen = db.prepare('SELECT 1 FROM news_seen WHERE key=?');
  const mark = db.prepare('INSERT OR IGNORE INTO news_seen VALUES(?,?)');
  function latest() {
    const raw = read.get()?.latest;
    if (!raw) return {state:'answer', text:'还没有收到关注主题的新报道。'};
    const {at, items} = JSON.parse(raw);
    const sources = items.map(row=>({title:row.title, url:row.url,
      snippet:[row.source, stamp.format(row.publishedAt)+' JST'].filter(Boolean).join(' · ')}));
    return {state:'answer', sources, text:stamp.format(at)+' JST · 最近一期新闻简报\n\n'+
      items.map((row,i)=>`[${i+1}] ${row.topic} · ${row.title}\n${sources[i].snippet}`).join('\n\n')};
  }
  async function poll(signal, enabled=()=>true) {
    const {items, failed} = await fetchNews(signal);
    signal.throwIfAborted();
    if (!enabled()) return '新闻关注已暂停';
    const at = now();
    const fresh = [], counts = new Map(), observed = new Set();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM news_seen WHERE at<?').run(at-3*day);
      for (const row of items) {
        if (!row.title || !Number.isFinite(row.publishedAt) || row.publishedAt>at || row.publishedAt<at-day) continue;
        const titleKey = row.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
        const duplicate = seen.get(row.url) || seen.get(titleKey);
        observed.add(row.url);
        observed.add(titleKey);
        if (duplicate || (counts.get(row.topic)??0)>=2) continue;
        fresh.push(row);
        mark.run(row.url, at);
        mark.run(titleKey, at);
        counts.set(row.topic,(counts.get(row.topic)??0)+1);
      }
      for (const key of observed) mark.run(key, at);
      db.prepare(`INSERT INTO news_briefing VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET
        lastCheck=excluded.lastCheck, latest=coalesce(excluded.latest,latest)`)
        .run(at, fresh.length?JSON.stringify({at,items:fresh}):null);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    if (fresh.length) notify(fresh);
    if (!items.length && failed.length===9) throw Error('本轮九个新闻主题均暂时无法读取');
    const detail = failed.length?'；暂时未能读取'+failed.join('、'):'';
    return (fresh.length?'已收录 '+fresh.length+' 条新报道':'本次未收录新报道')+detail;
  }
  return {latest, poll, last:()=>read.get()?.lastCheck};
}
