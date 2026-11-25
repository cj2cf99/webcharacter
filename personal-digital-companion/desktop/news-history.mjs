import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {isIP} from 'node:net';
import {join} from 'node:path';
import {tokyoDay} from './conversation-history.mjs';
import {cleanNewsTitle, needsChinese, newsImportance} from './news-layout.mjs';
import {createNewsBoards,newsTopicAge} from './news-board.mjs';
import {coversListingMarket,listedIssuer,listingProgress} from './news-market.mjs';
import {marketTimeline,progressHeadline,relatedProgress,reportedProgress} from './news-progress.mjs';

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

// 综合早报、隔夜要闻一类汇总稿只作来源，不单独推进事件，也不拿来当标题。
const roundup=/^[【\[]?(?:\d{1,2}月\d{1,2}日)?\s*(?:早报|晚报|午报|早间要闻|晚间要闻|隔夜要闻|要闻汇总|盘前必读|收评|午评|一周回顾|一周看天下|一周要闻|周报)[】\]：:\s|｜丨]/u;
export const isRoundup = report => roundup.test((report.title||'').normalize('NFKC').trim());
// 汇总稿排到后面，标题和提要优先取具体报道。
const leadFirst = reports => [...reports.filter(report=>!isRoundup(report)),...reports.filter(isRoundup)];

// 标题相似度：去掉栏目包装、媒体后缀、话题标签和「提供者」署名后，比较两字片段的 Dice 系数。
const titleCore = title => cleanNewsTitle(title).normalize('NFKC')
  .replace(/^[^|｜:：丨]{0,12}(?:异动|讯号|快讯|简讯|速递|要闻)\s*[|｜:：丨]\s*/u,'')
  .replace(/#[^#]+#/gu,'').replace(/提供者.*$/u,'')
  .replace(/\s*(?:[-_|｜]+|--)\s*[^-_|｜]{1,20}$/u,'').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
function titleGrams(report) {
  const text=titleCore(report.chinese?.title||report.title||''), grams=new Set();
  for (let i=0;i+1<text.length;i++) grams.add(text.slice(i,i+2));
  return grams;
}
export function titleSimilarity(a,b) {
  const left=titleGrams(a), right=titleGrams(b);
  if (!left.size || !right.size) return 0;
  let shared=0;
  for (const gram of left) if (right.has(gram)) shared++;
  return 2*shared/(left.size+right.size);
}
// 实测正式库：0.55 以上基本是同一事件的不同写法，0.8 以上是同一则消息的转载。
const sameEventSimilarity=0.55, sameNodeSimilarity=0.8;

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
  const leftProgress=reportedProgress(a), rightProgress=reportedProgress(b);
  if(leftProgress&&rightProgress&&leftProgress.subject===rightProgress.subject)
    return relatedProgress(leftProgress,rightProgress,delta)&&leftProgress.stage===rightProgress.stage;
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
  const progress=reportedProgress(report);
  if(progress&&family(event.topic)===family(report.topic)&&
     event.nodes.some(node=>relatedProgress(reportedProgress(node.reports[0]),progress,
       Math.abs(node.at-report.publishedAt))))return true;
  const next=phase(report);
  if (!next || Math.abs(event.at-report.publishedAt)>7*day || family(event.topic)!==family(report.topic)) return false;
  const last=phase(event.nodes.at(-1).reports[0]);
  const reopened=/恢复|重开|重新开放|通车|开放/u, closed=/停运|暂停|封闭|停航|封桥|关闭/u;
  if (last && reopened.test(last.stage) && closed.test(next.stage) && report.publishedAt>event.at) return false;
  return event.nodes.some(node=>node.reports.some(prior=>phase(prior)?.subject===next.subject));
}

function addReport(event, report, matched) {
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

function combinedExcerpts(reports) {
  const seen=new Set(), selected=[];
  for (const report of reports) {
    const text=excerpt(report), textKey=key(text);
    if (!textKey || seen.has(report.source||report.url) ||
        selected.some(row=>row.key.includes(textKey)||textKey.includes(row.key))) continue;
    seen.add(report.source||report.url);
    selected.push({text,key:textKey});
    if (selected.length===3) break;
  }
  return selected.map(row=>row.text);
}

export function newsDetails(event, brief) {
  const issuer=event.nodes.some(node=>node.stage)?listedIssuer(event.nodes.flatMap(node=>node.reports)):null;
  const nodes=event.nodes.map(node=>{
    const excerpts=combinedExcerpts(node.reports);
    if(node.fixed)return {...node,title:node.fixed.title,evidence:node.fixed.evidence,excerpts};
    const grouped=brief(leadFirst(node.reports));
    const primary=grouped[0];
    const subject=issuer&&issuer[0].toUpperCase()+issuer.slice(1);
    const recognized=progressHeadline({...event,nodes:[node]},null);
    const stageTitle=subject&&({
      before:subject+'上市前的市场动向',
      debut:subject+'登陆美股'+(node.reports.some(row=>/开盘.{0,8}涨/u.test(row.title))?'，报道指开盘走高':''),
      selloff:primary?.headline||'美股下挫，科技板块承压',
      second:subject+'上市次日回落'
    })[node.stage];
    const title=stageTitle||recognized||primary?.headline||titleOf(leadFirst(node.reports)[0]);
    const digest=primary?.headline?primary.summary:'';
    const evidence=/仍待独立核实/u.test(recognized)
      ?'现有报道保留在下方，收录材料中尚无可独立核实的正式公告。'
      :[digest,...excerpts].filter(Boolean).join(' ');
    return {...node,title,evidence,excerpts};
  });
  const latest=nodes.at(-1);
  const reports=nodes.flatMap(node=>node.reports).sort((a,b)=>b.publishedAt-a.publishedAt);
  const paragraphs=nodes.length===1?[latest.evidence].filter(Boolean):nodes.slice(-3).map(node=>{
    const stamp=node.timeKind==='报道时间'?'首见 '+tokyo.format(node.at)+' JST':tokyoDay(node.at)+' JST';
    return stamp+' · '+node.title.replace(/[。！!？?]+$/u,'')+'。'+node.evidence;
  });
  const fallbackTitle=progressHeadline(event,issuer)||latest.title;
  const twoPart=event.main?(event.latest&&event.latest!==event.main?event.main+'，'+event.latest:event.main):fallbackTitle;
  return {...event,title:twoPart,latest:latest.title,timeKind:latest.timeKind,paragraphs,nodes,reports};
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
  const development=details.wind?['','## 新闻发展时间线',...details.nodes.map(node=>
    '- '+tokyoDay(node.at)+' JST · '+line(node.title)+' '+line(node.evidence))]:[];
  const opinion=details.wind?.length?['','## 社论风向',...details.wind.flatMap(row=>[
    '- '+tokyo.format(row.to)+' JST · '+line(row.title),line(row.summary),line(row.change),
    ...row.refs.flatMap(ref=>{
      const url=newsSourceUrl(ref.url);
      return url?['  - '+line(ref.platform)+(ref.at?'':' · 原帖时间待核实')+' · <'+url.href+'>']:[];
    })
  ])]:[];
  const content=['# '+line(details.title),'','进展日期（JST） '+(startDay===endDay?endDay:startDay+' 至 '+endDay),
    '',line(summary),...development,...opinion,'','## 消息来源',...details.reports.map(report=>{
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

export function createNewsHistory(db,{now,archiveDir,sameReport,brief,compile,describeMarket,marketGroup,sameMarketUpdate,followsMarketTrend,marketRole,canReconcile,editorial}) {
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
  const moveUrls=db.prepare('UPDATE news_event_urls SET event_id=? WHERE event_id=?');
  const drop=db.prepare('DELETE FROM news_events WHERE id=?');
  const read=row=>row&&JSON.parse(row.content);
  const boards=editorial&&createNewsBoards(db);
  const eventDetails=event=>{
    const details=newsDetails(event,brief);
    if(editorial){
      if(!event.main)details.title=editorial.title(event.id,event.at)??details.title;
      const summary=editorial.summary(event.id,event.at);
      if(summary)details.paragraphs=[summary];
    }
    return details;
  };
  function finalizeNodes(event) {
    if(event.nodes.every(node=>node.fixed))return event;
    const details=newsDetails(event,brief);
    event.nodes.forEach((node,index)=>{
      if(!node.fixed)node.fixed={title:details.nodes[index].title,evidence:details.nodes[index].evidence};
    });
    return event;
  }
  const expired=(event,at)=>newsTopicAge(event.at,event.nodes.at(-1).timeKind,at)>=7*day;
  const archiveRows=at=>editorial?old.all(at-7*day+1).filter(row=>expired(read(row),at)):old.all(newsWindowStart(at));
  const hasReport=url=>Boolean(source.get(url)||source.get(archivedSourceKey(url)));

  function sameNode(left,right,acrossEditions=false) {
    const a=reportedProgress(left[0]),b=reportedProgress(right[0]);
    if(a&&b&&a.subject===b.subject)
      return a.stage===b.stage&&relatedProgress(a,b,Math.abs(left[0].publishedAt-right[0].publishedAt));
    return left.every(a=>right.every(b=>sameChange(a,b,sameReport))) ||
      (left[0].topic.endsWith('股市') && right[0].topic.endsWith('股市') &&
        (marketGroup([...left,...right]) || (acrossEditions&&sameMarketUpdate(left,right))));
  }

  function bestMatch(matches,reports) {
    if (matches.length<=1) return matches[0];
    if (!reports.some(marketRole)) return matches[0];
    const sameUpdate=matches.filter(row=>sameMarketUpdate(row.node.reports,reports));
    if (sameUpdate.length===1) return sameUpdate[0];
    if (sameUpdate.length>1) return;
    // 没标明交易日的评论优先并入有多个独立来源支持的主报道。
    const ranked=matches.map(match=>({match,sources:new Set(match.node.reports
      .filter(report=>marketRole(report)==='core').map(report=>report.source||report.url)).size}))
      .sort((a,b)=>b.sources-a.sources);
    if (ranked[0].sources>ranked[1].sources && ranked[0].sources>=3) return ranked[0].match;
  }

  function updateMarket(event,node) {
    if (!node.reports[0].topic.endsWith('股市')) return;
    const group=describeMarket(node.reports);
    if (!group) return;
    const first=group.core.reduce((a,b)=>a.report.publishedAt<=b.report.publishedAt?a:b);
    Object.assign(node,timestamp(first.report));
    const us=group.core.find(row=>!row.world&&row.report.topic==='美国股市');
    if (us) event.topic=us.report.topic;
    event.nodes.sort((a,b)=>a.at-b.at);
    event.at=event.nodes.at(-1).at;
  }

  // 单节点重复稿可以合并。已有时间线保留，由正常收录逐步补充来源。
  function reconcile(active,touched,changes,fresh=new Set()) {
    const removed=new Set();
    function combine(event,duplicate,newProgress) {
      if(boards?.holds(duplicate.id)&&!boards.holds(event.id)){
        const to=duplicate.id,from=event.id;
        if(changes.delete(from)||changes.has(to))changes.set(to,event);
        event.id=to;
        duplicate.id=from;
      }
      boards?.reconcile(event.id,duplicate.id);
      editorial?.reconcile(event.id,duplicate.id);
      moveUrls.run(event.id,duplicate.id);
      drop.run(duplicate.id);
      removed.add(duplicate.id);
      if (changes.delete(duplicate.id) && (newProgress||!get.get(event.id))) changes.set(event.id,event);
      touched.delete(duplicate.id);
      touched.set(event.id,event);
    }

    const candidates=active.filter(event=>event.nodes.length===1).flatMap(event=>{
      const node=event.nodes[0], roles=node.reports.map(marketRole);
      if (!roles.some(Boolean) && !node.reports.some(canReconcile)) return [];
      return [{event,node,anchor:roles.includes('core')}];
    }).sort((a,b)=>Number(b.anchor)-Number(a.anchor)||a.event.at-b.event.at);
    const kept=[];
    function mergeNode(candidate,acrossEditions) {
      const targets=kept.filter(prior=>sameNode(prior.node.reports,candidate.node.reports,acrossEditions));
      const target=bestMatch(targets,candidate.node.reports);
      if (!target) return false;
      const {event,node}=target;
      if (candidate.node.at<node.at) {
        node.at=candidate.node.at;
        node.timeKind=candidate.node.timeKind;
      }
      node.reports.push(...candidate.node.reports);
      event.at=node.at;
      updateMarket(event,node);
      combine(event,candidate.event,false);
      return true;
    }
    for (const candidate of candidates) if (!mergeNode(candidate,false)) kept.push(candidate);
    // 先用近时报道各自形成一组，再用相同标题或行情数据核对隔天转载。
    const groups=kept.splice(0).sort((a,b)=>a.node.at-b.node.at);
    for (const group of groups) if (!group.anchor || !mergeNode(group,true)) kept.push(group);

    const series=active.filter(event=>!removed.has(event.id) &&
      event.nodes.some(node=>node.reports.some(report=>marketRole(report)==='core')))
      .sort((a,b)=>a.nodes[0].at-b.nodes[0].at);
    const threads=[];
    for (const candidate of series) {
      const matches=threads.filter(event=>event.at<candidate.nodes[0].at &&
        event.nodes.some(node=>followsMarketTrend(node,candidate.nodes[0])));
      if (matches.length!==1) {threads.push(candidate);continue;}
      const event=matches[0];
      event.nodes.push(...candidate.nodes);
      event.at=candidate.at;
      combine(event,candidate,true);
    }
    // 规则都没认出的单节点新事件，按标题相似度并入两天内同类的已有事件。
    // 只处理 fresh 里的事件，已刊出的历史不因规则升级而重排。行情稿模板化，只按转载合并。
    for (const candidate of active.filter(event=>fresh.has(event.id)&&!removed.has(event.id)&&event.nodes.length===1)
      .sort((a,b)=>a.at-b.at)) {
      const reports=candidate.nodes[0].reports, market=family(candidate.topic)==='市场';
      let best=null;
      for (const event of active) {
        if (event===candidate || removed.has(event.id) || family(event.topic)!==family(candidate.topic) ||
            Math.abs(event.at-candidate.at)>2*day) continue;
        for (const node of event.nodes) for (const prior of node.reports) for (const report of reports) {
          const score=titleSimilarity(prior,report);
          if (score>(best?.score??0)) best={event,node,score};
        }
      }
      if (!best || best.score<(market?sameNodeSimilarity:sameEventSimilarity)) continue;
      const {event,node}=best;
      // 转载、12 小时内的改写和汇总稿补进最像的节点；隔得更久的相似报道作为新的进展节点。
      const sameNode=best.score>=sameNodeSimilarity || reports.every(isRoundup) ||
        Math.abs(candidate.nodes[0].at-node.at)<=day/2;
      if (sameNode) node.reports.push(...reports);
      else {
        event.nodes.push(candidate.nodes[0]);
        event.nodes.sort((a,b)=>a.at-b.at);
      }
      const advanced=event.at<event.nodes.at(-1).at;
      event.at=event.nodes.at(-1).at;
      combine(event,candidate,advanced);
    }
    if(!editorial)return;
    // 明确地点、动作或当事主体后，保留已有榜单编号，把同一次进展的来源放回同一个节点。
    const subjects=new Map();
    const known=active.filter(event=>!removed.has(event.id)).sort((a,b)=>
      Number(boards.holds(b.id))-Number(boards.holds(a.id))||a.at-b.at);
    for(const event of known) {
      const progress=reportedProgress(event.nodes[0].reports[0]);
      if(!progress)continue;
      const prior=subjects.get(progress.subject)??[];
      const target=prior.find(row=>family(row.topic)===family(event.topic)&&
        relatedProgress(reportedProgress(row.nodes[0].reports[0]),progress,Math.abs(row.nodes[0].at-event.nodes[0].at)));
      if(!target){subjects.set(progress.subject,[...prior,event]);continue;}
      for(const node of event.nodes) {
        const peer=target.nodes.find(candidate=>sameNode(candidate.reports,node.reports));
        if(!peer){target.nodes.push(node);continue;}
        if(node.at<peer.at){peer.at=node.at;peer.timeKind=node.timeKind;}
        peer.reports.push(...node.reports);
      }
      target.nodes.sort((a,b)=>a.at-b.at);
      const advanced=target.at<target.nodes.at(-1).at;
      target.at=target.nodes.at(-1).at;
      combine(target,event,advanced);
    }
    // 同一发行主体的上市阶段在原话题续写。各类跟盘评论补到当期节点。
    const listings=new Map();
    for(const candidate of active) {
      if(removed.has(candidate.id)||!candidate.topic.endsWith('股市'))continue;
      const issuer=listedIssuer(candidate.nodes.flatMap(node=>node.reports));
      if(!issuer)continue;
      const group=listings.get(issuer)??[];
      group.push(candidate);
      listings.set(issuer,group);
    }
    const episodes=[];
    for(const [issuer,group] of listings){
      if(group.length<2||!group.some(event=>event.nodes.some(node=>listingProgress(node.reports))))continue;
      group.sort((a,b)=>Number(boards.holds(b.id))-Number(boards.holds(a.id))||a.at-b.at);
      const event=group[0];
      episodes.push({issuer,event});
      for(const candidate of group.slice(1)){
        if(candidate===event)continue;
        let progressed=false;
        for(const node of candidate.nodes){
          const stage=listingProgress(node.reports);
          const near=[...event.nodes].sort((a,b)=>Math.abs(a.at-node.at)-Math.abs(b.at-node.at));
          const same=near.find(item=>Math.abs(item.at-node.at)<=2*day&&stage&&stage===listingProgress(item.reports));
          const target=same||(!stage&&near[0]);
          if(target)target.reports.push(...node.reports);
          else{event.nodes.push(node);progressed=true;}
        }
        event.nodes.sort((a,b)=>a.at-b.at);
        event.at=event.nodes.at(-1).at;
        combine(event,candidate,progressed);
      }
    }
    for(const candidate of active){
      if(removed.has(candidate.id)||candidate.nodes.length!==1||episodes.some(row=>row.event===candidate))continue;
      const node=candidate.nodes[0];
      const matches=episodes.flatMap(({issuer,event})=>{
        const peers=event.nodes.filter(step=>node.reports.every(report=>coversListingMarket(report,step,issuer)));
        if(!peers.length)return [];
        const nearest=peers.reduce((a,b)=>Math.abs(a.at-node.at)<=Math.abs(b.at-node.at)?a:b);
        return [{event,node:nearest}];
      });
      if(matches.length!==1)continue;
      const target=matches[0];
      target.node.reports.push(...node.reports);
      combine(target.event,candidate,false);
    }
    for(const [issuer,group] of listings)for(const event of group) {
      if(removed.has(event.id))continue;
      const nodes=marketTimeline(event.nodes,issuer,timestamp);
      if(JSON.stringify(nodes)===JSON.stringify(event.nodes))continue;
      event.nodes=nodes;
      event.at=nodes.at(-1).at;
      if(changes.has(event.id)&&event.at<=get.get(event.id)?.at)changes.delete(event.id);
      touched.set(event.id,event);
    }
  }

  // 调用方与 RSS 游标在同一事务内更新事件和来源索引。
  function ingest(items, at) {
    const start=editorial?at-8*day:newsWindowStart(at);
    const active=matching.all(Math.min(start,...items.map(row=>row.publishedAt))).map(read)
      .filter(event=>!editorial||!expired(event,at));
    const changes=new Map(), touched=new Map(), fresh=new Set();
    for (const row of [...items].sort((a,b)=>a.publishedAt-b.publishedAt)) {
      if (!newsSourceUrl(row.url) || typeof row.title!=='string' ||
          typeof row.topic!=='string' || !Number.isFinite(row.publishedAt) || hasReport(row.url)) continue;
      const targets=active.flatMap(event=>event.nodes.filter(node=>sameNode(node.reports,[row],true)).map(node=>({event,node})));
      const match=bestMatch(targets,[row]);
      let event=match?.event;
      if (!event) {
        const related=active.filter(candidate=>continues(candidate,row));
        if (related.length===1) event=related[0];
      }
      if (!event) {
        event={id:randomUUID(),topic:row.topic,at:row.publishedAt,nodes:[]};
        active.push(event);
        fresh.add(event.id);
      }
      if (addReport(event,row,match?.node)) changes.set(event.id,event);
      else updateMarket(event,match.node);
      touched.set(event.id,event);
      remember.run(row.url,event.id);
    }
    if (touched.size) reconcile(active,touched,changes,fresh);
    for (const event of touched.values()) {
      finalizeNodes(event);
      save.run(event.id,event.at,JSON.stringify(event));
    }
    return [...changes.values()].map(eventDetails).sort((a,b)=>b.at-a.at);
  }

  function migrate(items) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('SELECT 1 FROM news_history_migration WHERE id=1').get()) {
        ingest(items.filter(row=>Number.isFinite(row.publishedAt)),now());
        db.exec('INSERT INTO news_history_migration VALUES(1)');
      }
      if (!db.prepare('SELECT 1 FROM news_history_migration WHERE id=2').get()) {
        const touched=new Map();
        reconcile(matching.all(newsWindowStart(now())).map(read),touched,new Map());
        for (const event of touched.values()) save.run(event.id,event.at,JSON.stringify(event));
        db.exec('INSERT INTO news_history_migration VALUES(2)');
      }
      if(editorial&&!db.prepare('SELECT 1 FROM news_history_migration WHERE id=3').get()){
        const at=now(),touched=new Map();
        const recent=matching.all(at-8*day).map(read).filter(event=>event.at<=at&&!expired(event,at));
        reconcile(recent,touched,new Map());
        for(const event of touched.values())save.run(event.id,event.at,JSON.stringify(event));
        db.exec('INSERT INTO news_history_migration VALUES(3)');
      }
      if(editorial&&!db.prepare('SELECT 1 FROM news_history_migration WHERE id=4').get()){
        const at=now(),touched=new Map();
        const recent=matching.all(at-8*day).map(read).filter(event=>event.at<=at&&!expired(event,at));
        reconcile(recent,touched,new Map());
        for(const event of touched.values())save.run(event.id,event.at,JSON.stringify(event));
        db.exec('INSERT INTO news_history_migration VALUES(4)');
      }
      // 2026-11-25 用户确认：现存七日内的单节点事件按标题相似度一次性重并，之后只处理新收录。
      if(!db.prepare('SELECT 1 FROM news_history_migration WHERE id=5').get()){
        const at=now(),touched=new Map();
        const recent=matching.all(editorial?at-8*day:newsWindowStart(at)).map(read)
          .filter(event=>event.at<=at&&(!editorial||!expired(event,at)));
        reconcile(recent,touched,new Map(),new Set(recent.filter(event=>event.nodes.length===1).map(event=>event.id)));
        for(const event of touched.values())save.run(event.id,event.at,JSON.stringify(event));
        db.exec('INSERT INTO news_history_migration VALUES(5)');
      }
      // 迁移 6：节点定稿并冻结现有整句标题作为 main，不重新生成。
      if(!db.prepare('SELECT 1 FROM news_history_migration WHERE id=6').get()){
        const at=now();
        const recent=matching.all(editorial?at-8*day:newsWindowStart(at)).map(read)
          .filter(event=>event.at<=at&&(!editorial||!expired(event,at)));
        for(const event of recent){
          const prev=JSON.stringify(event);
          finalizeNodes(event);
          if(!event.main){
            const current=eventDetails(event).title;
            if(current)event.main=current;
          }
          if(JSON.stringify(event)!==prev)save.run(event.id,event.at,JSON.stringify(event));
        }
        db.exec('INSERT INTO news_history_migration VALUES(6)');
      }
      db.exec('COMMIT');
    } catch(error) {db.exec('ROLLBACK');throw error;}
  }

  function list(persist=false) {
    const at=now(), from=newsWindowStart(at), dayFrom=at-36*3600000;
    const topicsMap=boards?.allTopics?.();
    const items=matching.all(editorial?at-8*day:from).map(read)
      .filter(event=>event.at<=at&&(!editorial||!expired(event,at))).map(event=>{
        const latest=event.nodes.at(-1), report=leadFirst(latest.reports)[0];
        const group=brief(leadFirst(latest.reports))[0];
        const issuer=event.nodes.some(node=>node.stage)?listedIssuer(event.nodes.flatMap(node=>node.reports)):null;
        const main=progressHeadline(event,issuer);
        const fallback=main||group?.headline||titleOf(report);
        const twoPart=event.main?(event.latest&&event.latest!==event.main?event.main+'，'+event.latest:event.main):null;
        const title=twoPart??editorial?.title(event.id,event.at)??fallback;
        const reports=event.nodes.flatMap(node=>node.reports);
        const weekFrom=editorial?at-7*day:from;
        const weekly=reports.filter(report=>report.publishedAt>=weekFrom&&report.publishedAt<=at);
        const daily=reports.filter(report=>report.publishedAt>=dayFrom&&report.publishedAt<=at);
        const weekHeat=new Set(weekly.map(r=>r.url)).size;
        const dayHeat=new Set(daily.map(r=>r.url)).size;
        const age=newsTopicAge(event.at,latest.timeKind,at);
        const topicRow=topicsMap?.get(event.id);
        const reportBriefs=new Map(topicRow?.reports??[]);
        const details=event.nodes.some(n=>!n.fixed)?newsDetails(event,brief):null;
        const weekLines=event.nodes.slice(-2).reverse().map((node,idx)=>{
          const fallbackNodeTitle=node.fixed?.title??details?.nodes[event.nodes.length-1-idx]?.title??titleOf(leadFirst(node.reports)[0]);
          return [node.brief||fallbackNodeTitle,node.at];
        });
        const sortedReports=[...reports].sort((a,b)=>b.publishedAt-a.publishedAt);
        const dayLines=sortedReports.slice(0,2).map(r=>[reportBriefs.get(r.url)||titleOf(r),r.publishedAt]);
        return {id:event.id,topic:event.topic,at:event.at,timeKind:latest.timeKind,title,
          main:event.main||'',latestText:event.latest||'',
          weekHeat,dayHeat,age,
          isTopic:Boolean(topicRow),center:topicRow?.center||'',dayText:topicRow?.day||'',
          weekLines,dayLines,
          ...(editorial?{reportCount:weekHeat,hasPhoto:reports.some(row=>row.imageUrl)}:{}),
          days:new Set(weekly.map(report=>tokyoDay(report.publishedAt))).size,
          publishers:new Set(weekly.map(report=>report.source).filter(Boolean)).size,
          importance:Math.max(newsImportance(title),...reports.map(report=>newsImportance(report.title))),
          latest:trimmed((/仍待独立核实/u.test(main)?'任职变动尚待独立核实。':'')||
            group?.summary||latest.reports.map(excerpt).find(Boolean)||title,100),
          titleUrl:title!==fallback||main||group?.headline||report.chinese?.title?'':report.url,titleLang:report.lang};
      });
    const builtBoards=boards?boards.build(items,at,persist):undefined;
    if(builtBoards&&persist) {
      const freshTopics=boards.allTopics();
      for(const item of items) {
        const row=freshTopics.get(item.id);
        item.isTopic=Boolean(row);
        item.center=row?.center||'';
        item.dayText=row?.day||'';
      }
    }
    return {at,from,pendingArchive:editorial?archiveRows(at).length:countOld.get(from).total,items,
      ...(builtBoards?{boards:builtBoards}:{})};
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
    const at=now();
    const rows=archiveRows(at);
    let saved=0, slow=0, failed=0;
    for (const row of rows) {
      signal.throwIfAborted();
      const details=eventDetails(read(row));
      let summary=editorial?.summary(row.id,row.at);
      if(!summary||!validSummary(summary))summary=extractArchive(details);
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
          if(editorial)details.wind=editorial.history(row.id);
          try {writeMarkdown(archiveDir,details,summary);}
          catch {
            db.exec('ROLLBACK');
            failed++;
            continue;
          }
          for (const report of details.reports) rememberArchived.run(archivedSourceKey(report.url));
          deleteUrls.run(row.id);
          editorial?.remove(row.id);
          boards?.removeTopic(row.id);
          drop.run(row.id);
          saved++;
        }
        db.exec('COMMIT');
      } catch(error) {db.exec('ROLLBACK');throw error;}
    }
    return {saved,pending:editorial?archiveRows(at).length:countOld.get(newsWindowStart(at)).total,failed};
  }
  function saveNodeBrief(id,nodeAt,briefText) {
    const event=read(get.get(id));
    if(!event)return;
    const node=event.nodes.find(n=>n.at===nodeAt)||event.nodes.at(-1);
    if(!node||node.brief)return;
    node.brief=briefText;
    save.run(event.id,event.at,JSON.stringify(event));
  }
  function saveTitle(id,{main,latest}) {
    const event=read(get.get(id));
    if(!event)return;
    if(main&&!event.main)event.main=main;
    if(latest!==undefined)event.latest=latest;
    save.run(event.id,event.at,JSON.stringify(event));
  }
  function applyCorrections(id,corrections) {
    const event=read(get.get(id));
    if(!event||!Array.isArray(corrections))return;
    let changed=false;
    for(const {index,field,text} of corrections) {
      if(!text||!['title','evidence','main'].includes(field))continue;
      if(field==='main') {
        if(event.main&&event.main!==text){event.was=event.was||event.main;event.main=text;changed=true;}
        continue;
      }
      const node=event.nodes[index];
      if(!node)continue;
      finalizeNodes(event);
      const oldVal=node.fixed?.[field];
      if(oldVal&&oldVal!==text){
        node.was={...node.was,[field]:oldVal};
        node.fixed[field]=text;
        changed=true;
      }
    }
    if(changed)save.run(event.id,event.at,JSON.stringify(event));
  }
  return {ingest,migrate,list,saveChinese,archive,hasReport,
    saveNodeBrief,saveTitle,applyCorrections,
    getTopic:id=>boards?.getTopic(id)??null,
    saveTopic:(id,patch)=>boards?.saveTopic(id,patch),
    get:id=>{
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
