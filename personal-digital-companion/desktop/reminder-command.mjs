import {calendarDate as dateValue,datePattern} from './calendar-date.mjs';
const names = '提醒事项|事项提醒|事项|提醒|任务|待办';
const field = '循环周期|重复周期|循环|重复|标题|名称|内容|正文|日期|时间';
const verb = '修改为|修改成|调整为|调整到|改为|改成|改到|设为|设成|设置为|换成|推迟到|提前到|移动到|移到|挪到|挪至|移至';
const operation = new RegExp('(?:的?('+field+')\\s*)?('+verb+')\\s*');
const quoted = /^[“「"](.+)[”」"]$/s;
const trim = s=>s.trim().replace(quoted,'$1');
const digit = s => /^\d+$/.test(s)?Number(s):s==='两'?2:s.includes('十')?
  (s[0]==='十'?1:'一二三四五六七八九'.indexOf(s[0])+1)*10+(s.endsWith('十')?0:'一二三四五六七八九'.indexOf(s.at(-1))+1):
  '零一二三四五六七八九'.indexOf(s);
const pad = n=>String(n).padStart(2,'0');
export function timeValue(raw) {
  if(/^(?:全天|无时间|取消时间)$/.test(raw))return '';
  const m=/^(凌晨|上午|早上|中午|下午|晚上)?\s*([零一二两三四五六七八九十\d]+)(?:[:：]([0-5]\d)|[点时](半|[零一二三四五六七八九十\d]+分?)?)$/.exec(raw);
  if(!m)throw Error('请给出明确时间，例如“下午三点”或“15:30”。');
  let hour=digit(m[2]);
  const minute=m[3]?Number(m[3]):m[4]==='半'?30:m[4]?digit(m[4].replace(/分$/,'')):0;
  if(m[1]&&(hour>12||hour<1))throw Error('时段与小时不匹配。');
  if(/下午|晚上/.test(m[1])&&hour<12||m[1]==='中午'&&hour<11)hour+=12;
  if(/凌晨|上午|早上/.test(m[1])&&hour===12)hour=0;
  if(hour<0||hour>23||minute<0||minute>59)throw Error('提醒时间无效。');
  return 'T'+pad(hour)+':'+pad(minute)+':00+09:00';
}
function frequency(raw) {
  if(/^(无|取消|不循环|不重复|一次|仅一次)$/.test(raw))return [null,'不循环'];
  const interval=/^每(?:隔)?(\d+|[一二两三四五六七八九十]+)?天(?:一次)?$/.exec(raw);
  if(interval){
    const n=interval[1]?digit(interval[1]):1;
    if(n>=1&&n<=3650)return [{v:1,mode:'interval',days:n},'完成后每隔 '+n+' 天'];
  }
  const week=/^每(?:周|星期)([一二三四五六日天](?:[、和及](?:(?:周|星期))?[一二三四五六日天])*)$/.exec(raw);
  if(week){
    const weekdays=[...new Set([...week[1].matchAll(/[一二三四五六日天]/g)].map(([v])=>'一二三四五六日'.indexOf(v.replace('天','日'))+1))].sort();
    return [{v:1,mode:'calendar',unit:'week',weekdays},raw];
  }
  const month=/^每月(?:(\d{1,2})[日号]|(最后一天|月末))$/.exec(raw);
  if(month&&(month[2]||Number(month[1])>=1&&Number(month[1])<=31))return [{v:1,mode:'calendar',unit:'month',day:month[2]?'last':Number(month[1])},raw];
  const year=/^每年(\d{1,2})月(\d{1,2})[日号]$/.exec(raw);
  if(year){dateValue('2000-'+pad(year[1])+'-'+pad(year[2]));return [{v:1,mode:'annual',month:+year[1],day:+year[2]},raw];}
  throw Error('请说明循环周期，例如“每天”“每周五”“每月15日”或“不循环”。');
}
function filters(raw,today) {
  let s=raw.trim().replace(/^(?:(?:请|帮我|给我|绯月|看看|查看|查一下|查询|展示|显示|列出|找出|我想看|把|将)[，,\s]*)+/,'');
  const literal=s.match(/[“「"]([^”」"]+)[”」"]/);
  if(literal)s=s.replace(literal[0],'');
  const date=s.match(new RegExp(datePattern));
  if(date)s=s.replace(date[0],'');
  const id=s.match(/(?:编号\s*|#)(\d+)/);
  if(id)s=s.replace(id[0],'');
  s=s.replace(new RegExp(names,'g'),'').replace(/有哪些|有什么|有什么事|哪些|哪几条|所有|全部|相关|我的|关于|有没有|一下|有哪些|[的？?。]/g,'').trim();
  return {q:literal?.[1]??s,day:date?dateValue(date[0],today):'',id:id?Number(id[1]):null};
}
export function isReminderCommand(s) {
  const op=operation.exec(s);
  if(op&&(op[1]||new RegExp(names).test(s)||new RegExp('^(?:'+datePattern+'|上午|下午|晚上|\\d{1,2}[:：])').test(s.slice(op.index+op[0].length))))return true;
  return new RegExp(names).test(s)&&/查|看|列出|展示|显示|哪些|有什么|有没有|调整|改|移到|更新/.test(s);
}
export function parseReminderCommand(input,today) {
  const text=input.trim().replace(/[。！？!?？]+$/,'');
  const first=operation.exec(text);
  if(!first){
    if(/修改|调整|更新|更改/.test(text))throw Error('请说明要改哪一项，例如“把周报的时间改为15:30”。');
    return {filter:filters(text,today)};
  }
  const filter=filters(text.slice(0,first.index),today),changes={};
  const parts=text.slice(first.index).split(new RegExp('[，,；;]\\s*(?=(?:并且|同时|并)?(?:'+field+')\\s*(?:'+verb+'))'));
  for(const part of parts){
    const cmd=part.replace(/^(并且|同时|并)/,'').match(operation);
    if(!cmd||cmd.index!==0)throw Error('请说明每个字段要改成什么。');
    const key=cmd[1],value=trim(part.slice(cmd[0].length));
    if(!value)throw Error('请补充修改后的值。');
    if(key==='标题'||key==='名称')changes.title=value;
    else if(key==='内容'||key==='正文')changes.content=/^(清空|空白)$/.test(value)?'':value;
    else if(/循环|重复/.test(key)) [changes.recurrence,changes.recurrenceText]=frequency(value);
    else {
      const date=value.match(new RegExp('^('+datePattern+')'));
      if(date)changes.date=dateValue(date[1],today);
      const clock=value.slice(date?.[0].length??0).trim();
      if(clock)changes.clock=timeValue(clock);
    }
  }
  return {filter,changes};
}
export function proposal(row,changes) {
  const patch={},diff=[];
  function add(key,before,after,label,displayBefore=before,displayAfter=after){
    if(JSON.stringify(before)===JSON.stringify(after))return;
    patch[key]=after;
    diff.push(label+'：'+(displayBefore||'（空）')+' → '+(displayAfter||'（空）'));
  }
  if('title' in changes)add('title',row.title,changes.title,'标题');
  if('content' in changes)add('content',row.content,changes.content,'内容');
  if('date' in changes||'clock' in changes){
    const date=changes.date??row.deadline?.slice(0,10);
    if(!date)throw Error('此提醒没有日期，请同时指定日期和时间。');
    const deadline=date+(changes.clock??row.deadline?.slice(10)??'');
    add('deadline',row.deadline,deadline,'截止（东京）');
  }
  if('recurrence' in changes){
    if(changes.recurrence&&!(patch.deadline||row.deadline))throw Error('循环提醒需要日期。');
    add('recurrence',row.recurrence,changes.recurrence,'循环',row.recurrenceText??'不循环',changes.recurrenceText);
  }
  return {id:row.id,title:row.title,version:row.version,patch,diff};
}
