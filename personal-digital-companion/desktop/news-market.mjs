import {tokyoDay} from './conversation-history.mjs';
import {cleanNewsTitle} from './news-layout.mjs';

const hour=3_600_000;
const week=7*24*hour;
const market=/^全球股市/u;
const technology=/科技股/u;
const decline=/(?:大跌|暴跌|重挫|下挫|下跌|跳水|走低|崩了|溃败|进入回调区间|抹去(?:今年|全年|年内)涨幅|回吐(?:今年|全年|年内)涨幅)/u;
const lead=/^(?:\d{1,2}\s*月\s*\d{1,2}\s*日\s*|一觉醒来|深夜|隔夜|周[一二三四五六日天]|当地时间\s*)?(?<scope>全球股市|美股(?:大型)?科技股|美国科技股|美股纳指|美股|美国股市|纳指|纳斯达克(?:综合指数)?)(?<rest>.*)$/u;
const modifiers=/^(?:却|再次|再度|深夜|周[一二三四五六日天]|全线|集体|大幅|盘前|盘中|收盘|盘后|暗盘|\s|,|，)*/u;
const movement=new RegExp('^'+decline.source,'u');
const quote=/^([\p{Script=Han}]{2,8}|[A-Za-z][A-Za-z0-9.-]{1,15})\s*股价(?:盘前|盘中|收盘|盘后)?\s*(?:暴跌|大跌|下跌|重挫|下挫|跌)\s*(?:约|超|逾|近)?\s*(\d+(?:\.\d+)?)\s*%(.*)$/u;
const quotes=/(英伟达|纳指|纳斯达克(?:综合指数)?|标普(?:500)?(?:指数)?|道指|道琼斯(?:指数)?|\b[A-Z][A-Za-z0-9.-]{1,20})\s*(?:\([A-Z0-9.]+\))?\s*(?:股价)?\s*(?:盘前|盘中|收盘|盘后)?\s*(?:重挫|暴跌|大跌|下挫|下跌|狂泻|崩跌|跌幅|跌)\s*(约|近|超过?|逾)?\s*(\d+(?:\.\d+)?)\s*%/gu;
const marketIndex=/纳指|纳斯达克|标普(?:500)?|道指|道琼斯/u;
const alias=name=>/^NVIDIA$/iu.test(name)?'英伟达':/^Anthropic$/iu.test(name)?'Anthropic':
  /^纳斯达克/u.test(name)?'纳指':/^标普/u.test(name)?'标普500':/^道琼斯/u.test(name)?'道指':name;
const quoteValue=value=>Math.round(Number(value)*10)/10;
const metadata=new WeakMap();

function classify(report) {
  if (!report.topic.endsWith('股市')) return null;
  const title=cleanNewsTitle(report.title).normalize('NFKC');
  const text=title.replace(/^[^|]{2,12}(?:热评|评论|快评|观察)\s*\|\s*/u,'');
  const date=text.match(/(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})\s*日/u);
  const weekday=text.match(/^(?:周|星期)([一二三四五六日天])/u)?.[1] ?? '';
  const session=text.match(/盘前|盘中|收盘|盘后|暗盘/u)?.[0];
  const facts=[...text.matchAll(quotes)].map(([,name,qualifier,value])=>({name:alias(name),qualifier,value}));
  const clauses=text.split(/[，,！!；;：:]|(?:之后|过后|未能止住|未能阻止)\s*/u);
  const broad=clauses.find(clause=>{
    const match=clause.trim().match(lead);
    const tail=match?.groups.rest.replace(modifiers,'')??'';
    return movement.test(tail) && !/^(?:[^，。\s]{0,6})(?:吗|之际|风险|将至|预警|\?)/u.test(tail);
  });
  // 有日期与主要指数行情的早报，也可以为同轮市场报道提供证据。
  const datedIndex=date && /^美股.{0,12}[(:]/u.test(text) && facts.some(fact=>fact.name==='纳指');
  const stockAndIndex=facts.some(fact=>fact.name==='英伟达')&&/(?:纳指|纳斯达克).{0,5}(?:抹去|回吐)(?:全年|年内|今年)涨幅/u.test(text);
  const scope=broad?.trim().match(lead)?.groups.scope??'';
  const context={report,text,facts,day:tokyoDay(report.publishedAt),date:date?.slice(1).map(Number).join('/'),weekday,session};
  if (broad || datedIndex || stockAndIndex) return {...context,kind:'core',world:market.test(scope),tech:stockAndIndex||technology.test(scope)};
  if (/^(?:美股(?:纳指)?|纳指)(?:单周|本周|两次).{0,8}(?:大跌|暴跌|重挫|下挫|跳水)/u.test(text)) {
    return {...context,kind:'recap'};
  }
  const single=text.match(quote);
  if (single && /^(?:\s*|[，,。!！]\s*市场(?:恐慌|忧虑|承压|情绪).*)$/u.test(single[3])) {
    return {...context,kind:'quote',name:alias(single[1]),value:quoteValue(single[2])};
  }
  // 同一场次的英伟达报价可以作为股市节点的补充，标题里的推因保留为来源观点。
  const nvidia=text.match(/^英伟达.{0,25}股价\s*(?:暴跌|重挫|下挫|大跌|下跌|跌)\s*(?:约|超|逾|近)?\s*(\d+(?:\.\d+)?)\s*%/u);
  if(nvidia&&!marketIndex.test(text))return {...context,kind:'quote',name:'英伟达',value:quoteValue(nvidia[1])};
  return null;
}

export function marketCoverage(report) {
  if (!metadata.has(report)) metadata.set(report,classify(report));
  return metadata.get(report);
}

const ipoName=/\b([A-Z][A-Za-z0-9.-]{2,24})\s*(?:\([A-Z0-9.]+\))?[^，,。！!；;|]{0,13}?(?:\bIPO\b|挂牌|登陆美股|敲钟|上市|首秀)/gu;

export function listedIssuer(reports) {
  const names=new Set();
  for(const {topic,title} of reports){
    if(!topic.endsWith('股市')||/抗议|听证|调查|曝光/u.test(title))continue;
    for(const match of title.normalize('NFKC').matchAll(ipoName)){
      if(!/^(?:ETF|CEO|CFO|IPO|NASDAQ|NYSE|SEC|EPS)$/iu.test(match[1]))names.add(match[1].toLowerCase());
    }
  }
  return names.size===1?[...names][0]:null;
}

export function listingProgress(reports) {
  for(const {title} of reports){
    if(/(?:IPO|上市|挂牌)[^，。]{0,4}(?:次日|第二日|第二个交易日)|(?:次日|第二日).{0,10}(?:破发|跌|收盘)/u.test(title))return 'second';
    if(/(?:发行|IPO).{0,10}定价|确定发行价/u.test(title))return 'price';
    if(/挂牌|登陆美股|上市首日|首秀|上市开盘|敲钟/u.test(title)&&!/即将|计划|预定|拟/u.test(title))return 'debut';
  }
  return '';
}

export function coversListingMarket(report,node,issuer) {
  if(!report.topic.endsWith('股市')||Math.abs(report.publishedAt-node.at)>2*24*hour)return false;
  const title=cleanNewsTitle(report.title).normalize('NFKC');
  const main=title.replace(/^(?:\d\d:\d\d(?::\d\d)?\s*|[【\[][^】\]]+[】\]]\s*)+/u,'');
  if(/抗议|听证|宏观周报/u.test(main))return false;
  const issuerName=new RegExp('\\b'+issuer.replace(/[.*+?^$${}()|[\]\\]/g,'\\$&')+'\\b','iu');
  if(issuerName.test(main)&&/(?:盘中|盘前|股价|IPO|上市|挂牌|首秀)/u.test(main)&&/回落|跌|涨|抛售|抵挡|撑住/u.test(main))return true;
  if(!/^(?:隔夜|周[一二三四五六日天]|黑色星期五[！!：:\s]*)?(?:美股|美国股市|纳指|纳斯达克|全球市场|英伟达|AI概念股)/iu.test(main))return false;
  const calibrated=/纳斯达克/u.test(main)?main.replace(/纳斯达克(?:综合指数)?/gu,'纳指'):main;
  const facts=[...calibrated.matchAll(quotes)];
  const reference=node.reports.flatMap(row=>marketCoverage(row)?.facts??[]);
  if(facts.some(([,name,qualifier,value])=>reference.some(fact=>fact.name===alias(name)&&
    (/(?:超|逾)/u.test(qualifier??'')?Number(fact.value)>Number(value)&&Number(fact.value)-Number(value)<0.4:
      Math.abs(Number(fact.value)-Number(value))<=0.06))))return true;
  const recap=/^(?:美股(?:纳指)?|纳指)(?:单周|本周|两次).{0,10}(?:暴跌|大跌|重挫)/u.test(main);
  return recap&&reference.some(row=>row.name==='纳指');
}

function sameSession(a,b) {
  return (!a.date||!b.date||a.date===b.date) && (!a.weekday||!b.weekday||a.weekday===b.weekday) &&
    (!a.session||!b.session||a.session===b.session);
}

export function describeMarket(reports) {
  const entries=reports.map(marketCoverage).filter(Boolean);
  const core=entries.filter(entry=>entry.kind==='core');
  if (!core.length) return null;
  return {entries,core};
}

export function marketGroup(reports) {
  const group=describeMarket(reports);
  if (!group || group.entries.length!==reports.length) return null;
  const {entries,core}=group;
  const first=Math.min(...entries.map(entry=>entry.report.publishedAt));
  const last=Math.max(...entries.map(entry=>entry.report.publishedAt));
  if (last-first>12*hour) return null;
  if (!core.every((a,i)=>core.slice(i+1).every(b=>{
    if (!sameSession(a,b)) return false;
    return a.world===b.world || (a.day===b.day && Math.abs(a.report.publishedAt-b.report.publishedAt)<=8*hour);
  }))) return null;
  for (const entry of entries) {
    if (entry.kind==='core') continue;
    const related=core.filter(row=>!row.world&&row.day===entry.day&&sameSession(row,entry));
    if (entry.kind==='recap' && !related.some(row=>row.facts.some(fact=>fact.name==='纳指'))) return null;
    if (entry.kind==='quote' && !related.some(row=>row.facts.some(fact=>
      fact.name===entry.name&&quoteValue(fact.value)===entry.value))) return null;
  }
  return group;
}

function marketSignals(reports) {
  const names=new Set(), measures=new Set(), headlines=new Set();
  for (const row of reports.map(marketCoverage)) {
    if (row?.kind!=='core'||row.world) continue;
    for (const [,name] of row.text.matchAll(/\b([A-Z][A-Za-z0-9.-]{2,20})[”"“\s]*(?:IPO|敲钟|挂牌|上市|首秀|创纪录IPO|[^，,。！？]{0,8}IPO)/gu)) names.add(name.toLowerCase());
    for (const fact of row.facts) if (!/超|逾/u.test(fact.qualifier??'')) measures.add(fact.name+':'+quoteValue(fact.value));
    if (row.facts.length && row.text.length>=18) headlines.add(row.text.replace(/[\s，,。！？!?]/gu,''));
  }
  return {names,measures,headlines};
}

export function sameMarketUpdate(left,right) {
  const a=describeMarket(left), b=describeMarket(right);
  if (!a||!b || !a.core.every(row=>b.core.every(other=>sameSession(row,other)))) return false;
  const first=Math.min(...[...a.entries,...b.entries].map(row=>row.report.publishedAt));
  const last=Math.max(...[...a.entries,...b.entries].map(row=>row.report.publishedAt));
  if (last-first>48*hour) return false;
  const x=marketSignals(left), y=marketSignals(right);
  return [...x.headlines].some(title=>y.headlines.has(title)) ||
    [...x.measures].filter(measure=>y.measures.has(measure)).length>=2;
}

export function followsMarketTrend(before,after) {
  if (after.at<=before.at || after.at-before.at>week) return false;
  const a=marketSignals(before.reports), b=marketSignals(after.reports);
  // 跨日需要同一上市主体或至少两项一致的行情线索，不能凭涨跌方向串联。
  return [...a.names].some(name=>b.names.has(name)) ||
    [...a.measures].filter(measure=>b.measures.has(measure)).length>=2;
}

export function marketSummary({entries,core}) {
  const world=core.some(row=>row.world), us=core.some(row=>!row.world), tech=core.some(row=>row.tech);
  const headline=world?'全球股市下挫'+(tech?'，美股科技股走低':us?'，美股承压':''):
    tech?'美股科技股集体下挫':'美股下挫';
  const facts=new Map();
  for (const entry of core) {
    for (const fact of entry.facts) {
      if (!facts.has(fact.name)) facts.set(fact.name,[]);
      facts.get(fact.name).push(fact);
    }
  }
  const figures=[], differences=[];
  for (const [name,values] of facts) {
    const direct=[...values].filter(fact=>!/超|逾/u.test(fact.qualifier??''))
      .sort((a,b)=>b.value.length-a.value.length||Number(Boolean(a.qualifier))-Number(Boolean(b.qualifier)))[0]||values[0];
    const reference=Number(direct.value);
    if (!values.every(fact=>{
      const value=Number(fact.value);
      if (!/超|逾/u.test(direct.qualifier??'') && /超|逾/u.test(fact.qualifier??'')) return reference>value;
      const decimals=(fact.value.split('.')[1]||'').length;
      return Math.abs(reference-value)<=0.5*10**-decimals+0.000001;
    })) {
      differences.push(name);
      continue;
    }
    figures.push(name+'跌'+(direct.qualifier||'')+direct.value+'%');
  }
  const angles=[];
  if (core.some(row=>/\bIPO\b|上市/u.test(row.text))) angles.push('大型 IPO 后的市场表现');
  if (core.some(row=>/A股/iu.test(row.text))) angles.push('A 股后续走势');
  if (entries.some(row=>row.kind==='recap')) angles.push('纳指周度跌势或近期抛售回顾');
  const summary=[
    figures.length?'报道提到'+figures.slice(0,4).join('、')+'。':'',
    differences.length?differences.slice(0,2).join('、')+'的跌幅在不同报道中有出入。':'',
    angles.length?'相关分析还讨论了'+angles.join('、')+'。':''
  ].join('');
  return {headline,summary};
}
