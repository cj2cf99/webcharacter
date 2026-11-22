import {cleanNewsTitle} from './news-layout.mjs';
import {describeMarket} from './news-market.mjs';

export function reportedProgress(report) {
  const title=cleanNewsTitle(report.title).normalize('NFKC');
  if(report.topic.endsWith('社会')) {
    const match=title.match(/(?:^|[：:丨|，,])(?:[\p{Script=Han}]{2,8}(?:省|州|自治区))*(?:青海)?([\p{Script=Han}]{2,8}?)市?(?:发生\s*)?(\d+(?:\.\d+)?)\s*级地震/u);
    if(match&&!/余震|再发生/u.test(title)) {
      const [,place,magnitude]=match;
      const stage=/已抵|抵达|未发现|已救出|已转移/u.test(title)?'field':
        /应急响应|集结响应|启动预案|集结待命/u.test(title)?'response':'quake';
      return {subject:'quake:'+place+':'+magnitude,stage};
    }
  }
  if(!report.topic.endsWith('股市')) {
    const quantity=title.match(/(\d+)\s*项人形机器人(?:领域)?(?:行业)?标准/u)?.[1];
    if(quantity&&/工信部|工业和信息化部/u.test(title)&&/发布|印发|出台/u.test(title)&&!/未发布|没有发布/u.test(title))
      return {subject:'miit:humanoid-standards:'+quantity,stage:'published',commentary:/解读|快评|研报/u.test(title)};
  } else if(/黄仁勋/u.test(title)&&/英伟达|NVIDIA/iu.test(title)&&
    /(?:辞任|辞去|卸任|离任|卸下).{0,12}(?:CEO|首席执行官)/iu.test(title)) {
    return {subject:'nvidia:ceo-departure',stage:/辟谣|否认|不实/u.test(title)?'denial':'claim'};
  }
  return null;
}

export function relatedProgress(a,b,delta) {
  if(!a||!b||a.subject!==b.subject)return false;
  if(a.subject.startsWith('miit:')&&(a.commentary||b.commentary))return delta<=7*86400000;
  return delta<=36*3600000;
}

function listingStage(report,issuer) {
  const title=cleanNewsTitle(report.title);
  if(title.toLowerCase().match(/[a-z0-9.-]+/gu)?.includes(issuer)) {
    if(/(?:IPO|上市|挂牌)[^，。；;]{0,5}(?:次日|第二日|第二个交易日)|盘前.{0,5}(?:跌|回落)/u.test(title)&&
       /跌|回落|破发/u.test(title))return 'second';
    if(/登陆美股|上市首(?:日|秀)|挂牌|敲钟|开盘(?:股价)?(?:暴|大)?涨/u.test(title)&&
       !/之后|却|未能|未提振|救不了|跌|跳水|下挫/u.test(title))return 'debut';
    if(/今日上市|上市前|提振AI投资信心/u.test(title)&&!/下挫|暴跌/u.test(title))return 'before';
  }
  if(describeMarket([report])||/美股.{0,12}(?:跳水|暴跌|下挫|重挫)|(?:纳指|纳斯达克).{0,10}(?:跌|回吐)/u.test(title))
    return 'selloff';
  return '';
}

export function marketTimeline(nodes,issuer,timestamp) {
  const classified=new Map(), rest=[];
  for(const node of nodes) {
    for(const report of node.reports) {
      const roundup=/^(?:【[^】]*(?:早报|晚报|要闻|早参)[^】]*】|(?:\d+月\d+日)?隔夜要闻)/u.test(report.title);
      const stage=roundup?'':listingStage(report,issuer);
      if(!stage){rest.push({node,report,roundup});continue;}
      const key=stage==='selloff'?stage+':'+node.at:stage;
      const group=classified.get(key)??[];
      group.push(report);
      classified.set(key,group);
    }
  }
  if(!classified.has('second')||!classified.has('debut')||![...classified.keys()].some(key=>key.startsWith('selloff:')))return nodes;
  const revised=[...classified].map(([key,reports])=>{
    const stage=key.split(':')[0];
    reports.sort((a,b)=>a.publishedAt-b.publishedAt);
    const first=stage==='selloff'?reports.find(row=>describeMarket([row])):null;
    if(first) {
      reports.splice(reports.indexOf(first),1);
      reports.unshift(first);
    }
    return {...timestamp(reports[0]),stage,reports};
  });
  for(const {node,report,roundup} of rest) {
    const local=revised.filter(step=>step.reports.some(row=>node.reports.includes(row)));
    const market=local.filter(step=>step.stage==='selloff');
    const adjacent=market.length?market:local.length?local:revised.filter(step=>step.at<=node.at);
    if(adjacent.length||roundup) {
      const matches=adjacent.length?adjacent:revised;
      const target=matches.reduce((a,b)=>Math.abs(a.at-node.at)<=Math.abs(b.at-node.at)?a:b);
      target.reports.push(report);
    } else revised.push({...node,reports:[report]});
  }
  revised.sort((a,b)=>a.at-b.at);
  return revised;
}

export function progressHeadline(event,issuer) {
  if(issuer&&event.nodes.some(node=>node.stage==='selloff')&&event.nodes.at(-1).stage==='second') {
    const name=issuer[0].toUpperCase()+issuer.slice(1);
    return '美股科技板块承压，'+name+'上市次日回落';
  }
  const last=event.nodes.at(-1);
  const current=last?.reports[0]&&reportedProgress(last.reports[0]);
  if(current?.subject==='nvidia:ceo-departure'&&current.stage==='claim')
    return '有报道指黄仁勋辞任英伟达 CEO，仍待独立核实';
  if(current?.subject.startsWith('miit:humanoid-standards:'))
    return '工信部发布'+current.subject.split(':').at(-1)+'项人形机器人行业标准';
  if(current?.subject.startsWith('quake:')&&event.nodes.length>1) {
    const [,place,magnitude]=current.subject.split(':');
    if(current.stage==='field'&&/救援.{0,8}已抵/u.test(last.reports[0].title))
      return place+magnitude+'级地震，救援人员已抵震中';
    if(current.stage==='response')return place+magnitude+'级地震，当地启动应急响应';
  }
  return '';
}
