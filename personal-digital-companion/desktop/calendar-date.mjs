const tokyo=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
export const tokyoDate=(instant=Date.now())=>tokyo.format(instant);
const offsets={大前天:-3,前天:-2,昨天:-1,昨日:-1,今天:0,今日:0,明天:1,明日:1,后天:2,大后天:3};
const weekPrefix='上上|下下|上|下|本|这',weekUnit='(?:个)?(?:周|星期|礼拜)',weekday='[一二三四五六日天]';
const week=new RegExp('^('+weekPrefix+')'+weekUnit+'('+weekday+')$','u');
const number='(?:\\d{1,3}|[一二两三四五六七八九]?十[一二三四五六七八九]?|[一二两三四五六七八九])';
export const relativePattern='(?:'+Object.keys(offsets).join('|')+'|(?:'+weekPrefix+')'+weekUnit+weekday+'|'+number+'天[前后])';
export const datePattern='(?:'+relativePattern+'|\\d{4}-\\d{2}-\\d{2}|\\d{4}年\\d{1,2}月\\d{1,2}日?)';
const weekdays='一二三四五六日';
function count(text){
  if(/^\d+$/u.test(text))return Number(text);
  const digits='零一二三四五六七八九',s=text.replace('两','二');
  if(!s.includes('十'))return digits.indexOf(s);
  const [t,u]=s.split('十');
  return (t?digits.indexOf(t):1)*10+(u?digits.indexOf(u):0);
}
export function calendarDate(value,today=tokyoDate()){
  const base=new Date(today+'T00:00:00Z');
  let offset=offsets[value];
  const w=week.exec(value);
  if(w){
    const weeks={上上:-2,上:-1,本:0,这:0,下:1,下下:2};
    offset=weeks[w[1]]*7+weekdays.indexOf(w[2].replace('天','日'))-(base.getUTCDay()+6)%7;
  }
  const n=new RegExp('^('+number+')天([前后])$','u').exec(value);
  if(n)offset=count(n[1])*(n[2]==='后'?1:-1);
  if(typeof offset==='number'){
    base.setUTCDate(base.getUTCDate()+offset);
    return base.toISOString().slice(0,10);
  }
  const iso=value.replace(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/u,(_,y,m,d)=>y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0'));
  const date=new Date(iso+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(iso)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==iso)throw Error('请给出有效日期。');
  return iso;
}
export function dateQuestion(text,today=tokyoDate()){
  let question=text.trim().replace(/^(?:(?:宝贝|绯月|请问|那)[，,\s]*)+/u,'').replace(/[呀呢啊吗？?。！!\s]+$/u,'');
  const premise=/^(?:如果|假设|假如)?今天是((?:\d{4}年)?\d{1,2}月\d{1,2}[日号]|\d{4}-\d{2}-\d{2})[，,。\s]+(?:那么|那)?/u.exec(question);
  if(premise)question=question.slice(premise[0].length);
  const match=new RegExp('^('+datePattern+')(?:是|在)?(?:几月几[号日]|几号|哪一天|哪天|什么日期|星期几|周几|礼拜几)$','u').exec(question);
  if(!match)return '';
  try{
    if(premise){
      const base=premise[1].replace(/号$/u,'日');
      today=calendarDate(/^\d{1,2}月/u.test(base)?today.slice(0,4)+'年'+base:base,today);
    }
    const iso=calendarDate(match[1],today);
    return match[1]+'是 '+iso+'，星期'+weekdays[(new Date(iso+'T00:00:00Z').getUTCDay()+6)%7]+'（东京时间）。';
  }catch{return '这个日期在日历上不存在。';}
}

export function calendarContext(text,today){
  const terms=[...new Set(text.match(new RegExp(relativePattern,'gu'))??[])];
  if(!terms.length)return '';
  return '东京实际日期为 '+today+'。按这个基准，'+terms.map(term=>term+'='+calendarDate(term,today)).join('，')+'。用户另给假设日期时按题设计算；引用的正文保留原话。';
}
