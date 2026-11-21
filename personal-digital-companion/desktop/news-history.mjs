import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {isIP} from 'node:net';
import {join} from 'node:path';
import {tokyoDay} from './conversation-history.mjs';
import {cleanNewsTitle, needsChinese} from './news-layout.mjs';

const day = 86_400_000;
const tokyo = new Intl.DateTimeFormat('zh-CN', {
  timeZone:'Asia/Tokyo', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
});
export const newsWindowStart = at => Date.parse(tokyoDay(at)+'T00:00:00+09:00')-6*day;
const key = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}.%+\-−]/gu,'');
const titleOf = report => cleanNewsTitle(report.chinese?.title || report.title);
const originalTitle = report => cleanNewsTitle(report.title);
const trimmed = (text, limit) => [...text].length<=limit ? text : [...text].slice(0,limit-1).join('')+'…';
const archivedSourceKey = url => 'archive:'+createHash('sha256').update(url).digest('hex');

function timestamp(report) {
  // 只采用标题开头的明确日期，避免把正文回顾或预告当作最新进展。
  const title=report.title.normalize('NFKC');
  const match=title.match(/^(?:(\d{4})[-年])?(\d{1,2})[-月](\d{1,2})(?:日|(?=T|\s|$))\s*T?(?:(\d{1,2}):(\d{2})(Z|[+-]\d{2}:?\d{2})?)?/u);
  const offset=match?.[6];
  const otherZone=(offset && !/^\+09:?00$/u.test(offset)) ||
    /美东|美西|北京时间|中国时间|纽约时间|纽约当地|当地时间|格林尼治|协调世界时|\b(?:EST|EDT|ET|PST|PDT|PT|CST|CEST|CET)\b/iu.test(title) ||
    /\b(?:UTC|GMT)\b(?!\s*\+09(?::?00)?\b)/iu.test(title);
  const knownTokyo=/\bJST\b|东京时间|日本时间|\b(?:UTC|GMT)\s*\+09(?::?00)?\b/iu.test(title) ||
    /^\+09:?00$/u.test(offset||'');
  if (match && !otherZone && (knownTokyo || (!match[4] && report.topic.startsWith('日本')))) {
    const [,year,month,date,hour,minute]=match;
    const iso = [year||tokyoDay(report.publishedAt).slice(0,4),month.padStart(2,'0'),date.padStart(2,'0')].join('-');
    const at = Date.parse(iso+'T'+(hour||'0').padStart(2,'0')+':'+(minute||'00')+':00+09:00');
    if (Number.isFinite(at) && tokyoDay(at)===iso && at<=report.publishedAt && at>=report.publishedAt-7*day) {
      return {at,timeKind:hour?'事件时间':'事件日期'};
    }
  }
  return {at:report.publishedAt,timeKind:'报道时间'};
}

// 这些状态在同一明确主体上可以形成前后进展。主体含糊时各自保留。
const phases = [
  [/^(.{2,24}?(?:高速铁路|铁路|地铁|航线|大桥|机场|步道))(?=因|受|主线|全线|北段|南段|东段|西段|先行|部分|暂|紧急|宣布|停|封|恢|重|开|试|今|昨|分)/u,
    /停运|暂停|封闭|停航|封桥|关闭|恢复|重开|重新开放|通车|开放/u],
  [/^(.{2,30}?(?:模型|机器人))(?=正|启|开|发布|推出|补|更新|完|扩|通过|进行|公布|测|上|试)/u,
    /首发|发布|推出|补充|补发|补齐|更新|试跑|复测|测试|扩大|部署|量产|公开/u],
  [/^(.{2,22}?(?:地震|洪灾|山火|暴雨))(?=发生|预警|救|已|应急|致|疏散|震后|灾后|持续|解除)/u,
    /发生|预警|救援|疏散|应急响应|解除|善后|重建/u],
  [/^(.{2,28}?(?:法案|新规|改革方案))(?=公布|发布|拟|获|通过|批准|正式|开|实施|生效|暂缓|修订)/u,
    /公布|发布|通过|批准|实施|生效|暂缓|修订/u]
];

function phase(report) {
  const title = originalTitle(report).replace(/^(?:\d{4}[-年])?\d{1,2}[-月]\d{1,2}日?\s*/u,'');
  for (const [subject, action] of phases) {
    const match = title.match(subject);
    const stage = match && title.slice(match[0].length).match(action)?.[0];
    if (stage) return {subject:key(match[1]),stage};
  }
  return null;
}

function family(topic) {
  return topic.endsWith('社会')?'社会':topic.endsWith('股市')?'市场':'科技';
}

function sameChange(a,b,sameReport) {
  const delta = Math.abs(a.publishedAt-b.publishedAt);
  if (delta>3*day) return false;
  if (a.topic===b.topic && key(originalTitle(a))===key(originalTitle(b))) {
    if (family(a.topic)!=='市场' || delta<=day/2) return true;
  }
  if (sameReport(a,b)) return true;
  const left=phase(a), right=phase(b);
  if (!left || !right || left.subject!==right.subject || left.stage!==right.stage || delta>day/2) return false;
  // 同一行动涉及不同区段或不同数字时仍是不同进展。
  const qualifiers = report => originalTitle(report).match(/北段|南段|东段|西段|全线|首轮|第二轮|第三轮|\d+(?:\.\d+)?/gu)?.join('|')||'';
  return qualifiers(a)===qualifiers(b);
}

function continues(event, report) {
  const next=phase(report);
  if (!next || Math.abs(event.at-report.publishedAt)>7*day || family(event.topic)!==family(report.topic)) return false;
  const last=phase(event.nodes.at(-1).reports[0]);
  const reopened=/恢复|重开|重新开放|通车|开放/u, closed=/停运|暂停|封闭|停航|封桥|关闭/u;
  if (last && reopened.test(last.stage) && closed.test(next.stage) && report.publishedAt>event.at) return false;
  return event.nodes.some(node=>node.reports.some(prior=>phase(prior)?.subject===next.subject));
}

function addReport(event, report, sameReport) {
  const matched=event.nodes.find(node=>node.reports.every(prior=>sameChange(prior,report,sameReport)));
  if (!matched) {
    event.nodes.push({...timestamp(report),reports:[report]});
    event.nodes.sort((a,b)=>a.at-b.at);
    event.at=event.nodes.at(-1).at;
    return true;
  }
  matched.reports.push(report);
  return false;
}

function excerpt(report) {
  const text = (report.chinese?.excerpt || report.excerpt || '').trim().replace(/\s+/gu,' ');
  if (!text || needsChinese(text,report.chinese?.excerpt?'':report.lang)) return '';
  const check=key(text), title=key(titleOf(report)), original=key(report.title);
  if (!check || check===title || check===original || (!report.bodyExcerpt && (check.startsWith(title)||check.startsWith(original)))) return '';
  return trimmed(text, 280);
}

export function newsDetails(event, brief) {
  const nodes=event.nodes.map(node=>{
    const grouped=brief(node.reports);
    const primary=grouped[0];
    const title=primary?.headline||titleOf(node.reports[0]);
    const conflict=grouped.find(row=>row.summary?.startsWith('各篇报道的市值损失数字不一'))?.summary||'';
    const evidence=conflict || node.reports.map(excerpt).find(Boolean)||'';
    return {...node,title,evidence};
  });
  const latest=nodes.at(-1);
  const reports=nodes.flatMap(node=>node.reports).sort((a,b)=>b.publishedAt-a.publishedAt);
  const updates=nodes.slice(-4).map(node=>{
    const stamp=node.timeKind==='事件日期'?tokyoDay(node.at):tokyo.format(node.at)+' JST';
    return stamp+' · '+node.title.replace(/[。！!？?]+$/u,'')+'。';
  });
  const paragraphs = [
    ...(latest.evidence?[latest.evidence]:[]),
    ...(nodes.length>1?[updates.join(' ')]:[])
  ];
  return {...event,title:latest.title,latest:latest.title,timeKind:latest.timeKind,paragraphs,nodes,reports};
}

function validSummary(text) {
  const size=summarySize(text);
  return size>=50 && size<=200 && /\p{Script=Han}/u.test(text) && !needsChinese(text);
}

const summarySize = text => [...text.replace(/\s/gu,'')].length;

function extractArchive(details) {
  const entries=details.nodes.map(node=>{
    const title=node.title.replace(/[。！!？?]+$/u,'');
    const evidence=(node.evidence.match(/[^。！？]+[。！？]*/gu)||[]).map(sentence=>sentence.trim()).filter(Boolean);
    return {heading:!needsChinese(title)?tokyoDay(node.at)+' '+title+'。':'',evidence,chosen:''};
  });
  const latest=entries.at(-1);
  if (!latest.heading || summarySize(latest.heading)>200 || (entries.length===1&&!latest.evidence.length)) return '';
  let remaining=200;
  // 先给最新进展和较近的时间节点留出标题位置，再追加可放下的事实摘录。
  for (const entry of [...entries].reverse()) {
    const length=summarySize(entry.heading);
    if (!length || length>remaining) continue;
    entry.chosen=entry.heading;
    remaining-=length;
  }
  for (const entry of [...entries].reverse()) {
    if (!entry.chosen) continue;
    for (const sentence of new Set(entry.evidence)) {
      const length=summarySize(sentence);
      if (length>remaining) continue;
      entry.chosen+=sentence;
      remaining-=length;
    }
  }
  const summary=entries.map(entry=>entry.chosen).join('');
  return validSummary(summary)?summary:'';
}

function writeMarkdown(root, details, summary) {
  const folder=join(root,tokyoDay(details.at));
  const file=join(folder,details.id+'.md');
  const temporary=file+'.'+process.pid+'.tmp';
  const entities={'&':'&amp;','<':'&lt;','>':'&gt;'};
  const line=text=>String(text||'').replace(/[\r\n]+/gu,' ').replace(/[&<>]/gu,char=>entities[char])
    .replace(/[\\\[\]`]/gu,'\\$&');
  const startDay=tokyoDay(details.nodes[0].at), endDay=tokyoDay(details.at);
  const content=['# '+line(details.title),'','进展日期（JST） '+(startDay===endDay?endDay:startDay+' 至 '+endDay),
    '',line(summary),'','## 消息来源',...details.reports.map(report=>{
      const url=newsSourceUrl(report.url);
      return ['- '+line(report.source||report.title),tokyo.format(report.publishedAt)+' JST',
        ...(url?['<'+url.href+'>']:[])].join(' · ');
    }),''].join('\n');
  mkdirSync(folder,{recursive:true});
  try {
    writeFileSync(temporary,content,{encoding:'utf8',flush:true});
    renameSync(temporary,file);
  } finally {
    try {unlinkSync(temporary);} catch (error) {if(error.code!=='ENOENT') throw error;}
  }
}

export function createNewsHistory(db,{now,archiveDir,sameReport,brief,compile}) {
  db.exec('CREATE TABLE IF NOT EXISTS news_events(id TEXT PRIMARY KEY,at INTEGER NOT NULL,version INTEGER NOT NULL,content TEXT NOT NULL,archiveAttempt INTEGER NOT NULL DEFAULT 0);'
    +'CREATE INDEX IF NOT EXISTS news_events_at ON news_events(at,id);'
    +'CREATE TABLE IF NOT EXISTS news_event_urls(url TEXT PRIMARY KEY,event_id TEXT NOT NULL);'
    +'CREATE INDEX IF NOT EXISTS news_event_urls_id ON news_event_urls(event_id);'
    +'CREATE TABLE IF NOT EXISTS news_history_migration(id INTEGER PRIMARY KEY);');
  const get=db.prepare('SELECT * FROM news_events WHERE id=?');
  const matching=db.prepare('SELECT * FROM news_events WHERE at>=? ORDER BY at DESC,id');
  const old=db.prepare('SELECT * FROM news_events WHERE at<? ORDER BY archiveAttempt,at,id');
  const countOld=db.prepare('SELECT count(*) AS total FROM news_events WHERE at<?');
  const save=db.prepare('INSERT INTO news_events(id,at,version,content) VALUES(?,?,1,?) ON CONFLICT(id) DO UPDATE SET '
    +'at=excluded.at,version=news_events.version+1,content=excluded.content');
  const attempted=db.prepare('UPDATE news_events SET archiveAttempt=? WHERE id=? AND version=?');
  const source=db.prepare('SELECT event_id FROM news_event_urls WHERE url=?');
  const remember=db.prepare('INSERT INTO news_event_urls VALUES(?,?)');
  const rememberArchived=db.prepare("INSERT OR IGNORE INTO news_event_urls VALUES(?,'archived')");
  const deleteUrls=db.prepare('DELETE FROM news_event_urls WHERE event_id=?');
  const drop=db.prepare('DELETE FROM news_events WHERE id=?');
  const read=row=>row&&JSON.parse(row.content);
  const eventDetails=event=>newsDetails(event,brief);
  const hasReport=url=>Boolean(source.get(url)||source.get(archivedSourceKey(url)));

  // 调用方与 RSS 游标在同一事务内更新事件和来源索引。
  function ingest(items, at) {
    const active=matching.all(Math.min(newsWindowStart(at),...items.map(row=>row.publishedAt))).map(read);
    const changes=new Map(), touched=new Map();
    for (const row of [...items].sort((a,b)=>a.publishedAt-b.publishedAt)) {
      if (!newsSourceUrl(row.url) || typeof row.title!=='string' ||
          typeof row.topic!=='string' || !Number.isFinite(row.publishedAt) || hasReport(row.url)) continue;
      let event=active.find(event=>event.nodes.some(node=>node.reports.every(prior=>sameChange(prior,row,sameReport))));
      if (!event) {
        const related=active.filter(candidate=>continues(candidate,row));
        if (related.length===1) event=related[0];
      }
      if (!event) {
        event={id:randomUUID(),topic:row.topic,at:row.publishedAt,nodes:[]};
        active.push(event);
      }
      if (addReport(event,row,sameReport)) changes.set(event.id,event);
      touched.set(event.id,event);
      remember.run(row.url,event.id);
    }
    for (const event of touched.values()) save.run(event.id,event.at,JSON.stringify(event));
    return [...changes.values()].map(eventDetails).sort((a,b)=>b.at-a.at);
  }

  function migrate(items) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('SELECT 1 FROM news_history_migration WHERE id=1').get()) {
        ingest(items.filter(row=>Number.isFinite(row.publishedAt)),now());
        db.exec('INSERT INTO news_history_migration VALUES(1)');
      }
      db.exec('COMMIT');
    } catch(error) {db.exec('ROLLBACK');throw error;}
  }

  function list() {
    const at=now(), from=newsWindowStart(at);
    return {at,from,pendingArchive:countOld.get(from).total,
      items:matching.all(from).map(read).filter(event=>event.at<=at).map(event=>{
        const latest=event.nodes.at(-1), report=latest.reports[0];
        const group=brief(latest.reports)[0];
        const title=group?.headline||titleOf(report);
        return {id:event.id,topic:event.topic,at:event.at,timeKind:latest.timeKind,title,
          latest:trimmed(group?.summary||latest.reports.map(excerpt).find(Boolean)||title,100),
          titleUrl:group?.headline||report.chinese?.title?'':report.url,titleLang:report.lang};
      })};
  }

  function saveChinese(url,field,original,value) {
    const id=source.get(url)?.event_id, event=id&&read(get.get(id));
    const row=event?.nodes.flatMap(node=>node.reports).find(report=>report.url===url);
    if (!row || (field!=='title'&&field!=='excerpt') || row[field]!==original) return;
    row.chinese={...row.chinese,[field]:value};
    save.run(event.id,event.at,JSON.stringify(event));
  }

  async function archive(signal) {
    if (!archiveDir) return {saved:0,pending:0,failed:0};
    const cutoff=newsWindowStart(now());
    let saved=0, slow=0, failed=0;
    for (const row of old.all(cutoff)) {
      signal.throwIfAborted();
      const details=eventDetails(read(row));
      let summary=extractArchive(details);
      if (!summary && compile && slow<2) {
        slow++;
        attempted.run(now(),row.id,row.version);
        summary=await compile(details,signal).catch(()=>{
          signal.throwIfAborted();
          return '';
        });
      }
      if (!summary || !validSummary(summary)) continue;
      signal.throwIfAborted();
      db.exec('BEGIN IMMEDIATE');
      try {
        if (get.get(row.id)?.version===row.version) {
          try {writeMarkdown(archiveDir,details,summary);}
          catch {
            db.exec('ROLLBACK');
            failed++;
            continue;
          }
          for (const report of details.reports) rememberArchived.run(archivedSourceKey(report.url));
          deleteUrls.run(row.id);
          drop.run(row.id);
          saved++;
        }
        db.exec('COMMIT');
      } catch(error) {db.exec('ROLLBACK');throw error;}
    }
    return {saved,pending:countOld.get(cutoff).total,failed};
  }
  return {ingest,migrate,list,saveChinese,archive,hasReport,get:id=>{
    const event=read(get.get(id));
    return event&&eventDetails(event);
  }};
}

export function newsSourceUrl(value) {
  if (typeof value!=='string' || value.length>2048) return null;
  try {
    const url=new URL(value);
    const host=url.hostname.replace(/\.$/u,'');
    const fragment=url.hash.slice(1);
    const fragmentQuery=fragment.slice(fragment.indexOf('?')+1);
    const fragmentKeys=/(?:=|%3d)/iu.test(fragmentQuery)?new URLSearchParams(fragmentQuery).keys():[];
    if (url.protocol!=='https:' || url.username || url.password || url.port ||
        !host.includes('.') || isIP(host) || host.endsWith('.localhost') || host.endsWith('.local') ||
        [...url.searchParams.keys(),...fragmentKeys].some(key=>/token|secret|signature|credential|api.?key|password|session/iu.test(key))) return null;
    return url;
  } catch {return null;}
}
