// 权重仅用于本期版面。相关度优先使用具体实体和事件，再看同一关注主题。
const families=topic=>topic.endsWith('社会')?'社会':topic.endsWith('股市')?'市场':'科技';
const signals=[
  /紧急状态|紧急疏散|重大事故|遇难|海啸|熔断|evacuation order|tsunami warning|非常事態|避難(?:指示|命令)/i,
  /全国|生效|实施|暴跌|重挫|暴涨|state of emergency|record plunge|急落/i,
  /开源|首发|量产|部署|新高|地震|open.source|release|earthquake|発売/i
];
function features(item,at) {
  const text=(item.chinese?.title||item.title).normalize('NFKC').toLowerCase();
  const percent=Number(text.match(/(\d+(?:\.\d+)?)\s*%/)?.[1]||0);
  const score=1+(signals[0].test(text)?4:0)+(signals[1].test(text)?2:0)+(signals[2].test(text)?1:0)
    +(families(item.topic)==='市场'?Math.min(3,percent/3):0)+Math.max(0,1-(at-item.publishedAt)/86400000);
  const terms=new Set(text.match(/[a-z][a-z0-9.-]{2,}|[\p{Script=Han}]{2}/gu)||[]);
  for(const [name,aliases] of [['英伟达',/nvidia|英伟达/],['机器人',/robot|机器人|ロボット/],
    ['救援',/rescue|救援|救助/],['开源',/open[- ](?:source|model)|开源|オープンソース/],
    ['央行',/central bank|央行|中央銀行/],['地震',/earthquake|地震/]]){
    if(aliases.test(text))terms.add(name);
  }
  // 滑窗可匹配不同语序中提到的同一专名。
  for(const word of text.match(/[\p{Script=Han}]+/gu)||[]){
    for(let i=0;i+2<word.length;i++)terms.add(word.slice(i,i+3));
  }
  return {item,score,terms,family:families(item.topic)};
}
function overlap(a,b) {
  let hits=0;
  for(const term of a.terms)if(b.terms.has(term))hits++;
  return hits/Math.max(1,Math.min(a.terms.size,b.terms.size));
}
export function arrangeNews(items,at) {
  const rows=items.map(row=>features(row,at));
  for(const row of rows) {
    const related=rows.filter(other=>row!==other&&overlap(row,other)>=0.19);
    row.score+=Math.min(2,new Set(related.map(other=>other.item.source).filter(s=>s&&s!==row.item.source)).size);
  }
  rows.sort((a,b)=>b.score-a.score||b.item.publishedAt-a.item.publishedAt||a.item.url.localeCompare(b.item.url));
  const groups=[];
  for(const row of rows){
    let best=null, bestFit=0;
    for(const group of groups){
      const fit=Math.max(...group.map(other=>{
        const shared=overlap(row,other);
        return (shared>=0.19?4+shared:0)+(row.item.topic===other.item.topic?2:0)+(row.family===other.family?1:0);
      }));
      if(fit>bestFit){bestFit=fit;best=group;}
    }
    if(best)best.push(row);else groups.push([row]);
  }
  return groups.map(group=>{
    // 从本组头条向邻栏排，相同事件优先于相同栏目。
    const remaining=group.slice(1),ordered=[group[0]];
    while(remaining.length){
      const previous=ordered.at(-1);
      const proximity=r=>Math.min(1,overlap(previous,r))*15+(previous.item.topic===r.item.topic?1:0)+r.score/6;
      remaining.sort((a,b)=>proximity(b)-proximity(a));
      ordered.push(remaining.shift());
    }
    return {label:[...new Set(group.map(r=>r.family))].join(' · '),
      rows:ordered.map(row=>{
        const headline=row===rows[0]&&row.score>=3;
        return {item:row.item,family:row.family,headline,size:headline||row.score>=5?'lead':row.score>=3?'wide':'normal'};
      })};
  });
}

export function needsChinese(text,lang=''){
  if(!text?.trim())return false;
  if(/^(ja|ko|en|fr|es|de|ru)(-|$)/i.test(lang))return true;
  if(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text))return true;
  const han=(text.match(/\p{Script=Han}/gu)||[]).length;
  const words=(text.match(/[A-Za-z]{2,}/g)||[]).length;
  return han===0? /\p{L}/u.test(text):words>Math.max(5,han);
}
