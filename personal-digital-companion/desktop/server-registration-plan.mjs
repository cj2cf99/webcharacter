import {normalizeDeadline} from '../agent/tasks/deadline.mjs';

export function businessDate(value,now){
  const jst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(now);
  if(value==='今天')return jst;
  if(value==='明天')return new Date(Date.parse(jst+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const date=value.replace(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/,(_,y,m,d)=>y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0'));
  normalizeDeadline(date+'T00:00:00+09:00');return date;
}

const strip=s=>s.trim().replace(/^[「“](.*)[」”]$/su,'$1');
export function explicitRegistration(text,now){
  const s=text.replace(/^(?:请|帮我|替我)\s*/u,'').trim().replace(/[。！!]$/u,'');
  let m=/^(?:把|将)?(?:名为|名称为)?提醒(?:事项)?[：:\s]*(?:名为|名称为)?(.+?)(?:移动|挪|改|移|推迟|调整)(?:到|至|为)\s*(今天|明天|\d{4}-\d{2}-\d{2}|\d{4}年\d{1,2}月\d{1,2}日?)$/u.exec(s)
    ??/^(?:把|将)([「“].+[」”])(?:这条|的)?提醒(?:移动|挪|改|移|调整)(?:到|至|为)\s*(今天|明天|\d{4}-\d{2}-\d{2}|\d{4}年\d{1,2}月\d{1,2}日?)$/u.exec(s);
  if(m)return {type:'pc.reminders.move',params:{title:strip(m[1]),deadline:businessDate(m[2],now)}};
  m=/^(?:给|为|登记|记录)?长期(?:计划|任务)[：:\s]*(.+?)[，,\s]*(?:登记|记录)?(?:实际)?投入(?:时间|工时)?[：:\s]*(\d+(?:\.\d+)?)\s*(小时|分钟)$/u.exec(s);
  if(m)return {type:'pc.planner.hours',params:{title:strip(m[1]),actualHours:Number(m[2])/(m[3]==='分钟'?60:1)}};
  if(/^(?:登记|记录|记一次|新增)(?:一次|一条)?撸管(?:记录)?$/u.test(s))return {type:'pc.event.create',params:{}};
  m=/^(?:登记|写|新增)(?:一篇)?日记[：:\s]*(?:标题[为是：:\s]*)?[「“]([^「」“”]+)[」”][，,\s]*(?:正文|内容)[为是：:\s]*[「“]([^「」“”]+)[」”]$/su.exec(s);
  if(m)return {type:'pc.diaries.create',params:{title:m[1],content:m[2]}};
  m=/^(?:登记|记|新增)(?:一条)?随手记[：:，,\s]*分类[为是：:\s]*[「“]([^「」“”]+)[」”][，,\s]*(?:正文|内容)[为是：:\s]*[「“]([^「」“”]+)[」”]$/su.exec(s);
  if(m)return {type:'pc.records.create',params:{category:m[1],body:m[2]}};
  m=/^(?:登记|记录|新增)(?:一条)?吃喝(?:记录)?[：:\s]*[「“]([^「」“”]+)[」”]$/su.exec(s);
  if(m)return {type:'pc.food.create',params:{body:m[1]}};
  m=/^(?:创建|新增|登记)(?:一条|一个)?提醒[：:\s]*[「“]([^「」“”]+)[」”](?:[，,\s]*(?:日期|到期|截止)?[为是：:\s]*(今天|明天|\d{4}-\d{2}-\d{2}))?$/u.exec(s);
  if(m)return {type:'pc.reminders.create',params:{title:m[1],...(m[2]?{deadline:businessDate(m[2],now)}:{})}};
  return null;
}

// 仅分隔明确列出的步骤，引号内的分号、换行及“然后”属于正文。
export function serverTaskSteps(text){
  const header=/^(?:严格串行(?:任务链)?|串行(?:任务链)?|任务链)[，,：:\s]*/u.exec(text);
  const source=header?text.slice(header[0].length):text;
  const steps=[];let start=0,endQuote='';
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(endQuote){if(char===endQuote)endQuote='';continue;}
    if('「“"'.includes(char)){endQuote=({'「':'」','“':'”','"':'"'})[char];continue;}
    const delimiter=/^[，,\s]*(?:然后|接着|最后|再(?=登记|记录|新增|创建|把|将|给|移动|写))[，,\s]*/u.exec(source.slice(i));
    const separates=delimiter&&(header||/^(?:登记|记录|新增|创建|把|将|给|写|为|移动)/u.test(source.slice(i+delimiter[0].length)));
    if(separates||header&&/[；;\n]/u.test(char)){
      const part=source.slice(start,i).trim();if(part)steps.push(part);
      i+=separates?delimiter[0].length-1:0;start=i+1;
    }
  }
  const last=source.slice(start).trim();if(last)steps.push(last);
  return (header||steps.length>1?steps:[text]).map(s=>s.replace(/^先(?=登记|新增|记录|创建|把|将|写)/u,''));
}
