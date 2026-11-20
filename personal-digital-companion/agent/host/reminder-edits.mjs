// 在主站已有的账户可见视图内查询，写入沿用主站的条件 PATCH。
const source = `SELECT r.seq,r.title,r.content,r.deadline,r.level,r.regDatetime,r.recurrence,r.isFinished,
  r.planner_dispatch_id,EXISTS(SELECT 1 FROM reminder_links l WHERE l.target_todo_id=CAST(r.seq AS TEXT)) AS billing
  FROM reminders r WHERE r.isFinished=0`;
const fail = (status, message) => { throw Object.assign(Error(message), {status}); };
async function version(row) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([
    row.seq,row.regDatetime,row.title,row.content,row.deadline,row.level,row.recurrence,row.planner_dispatch_id,row.billing
  ])));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}
export function createReminderEdits({visible,today,present,patch,now=Date.now}) {
  return {
    async find({q='',day='',id=null}={}) {
      if(typeof q!=='string'||q.length>200||day&&!/^\d{4}-\d{2}-\d{2}$/.test(day)||id!==null&&(!Number.isSafeInteger(id)||id<1))fail(400,'查询条件无效。');
      const date=today();
      const result=await visible(date).prepare(source+
        " AND (?='' OR instr(r.title,?)>0 OR instr(r.content,?)>0) AND (?='' OR substr(r.deadline,1,10)=?) AND (? IS NULL OR r.seq=?) ORDER BY r.deadline,r.seq LIMIT 101")
        .bind(q,q,q,day,day,id,id).all();
      if(result.results.length>100)fail(422,'匹配超过 100 项，请加上名称或日期缩小范围。');
      return {items:await Promise.all(result.results.map(async row=>{
        const shown=present(row,date);
        return {id:row.seq,title:row.title,content:row.content??'',deadline:row.deadline,recurrence:shown.recurrence,
          recurrenceText:shown.recurrenceText,locked:row.planner_dispatch_id?'长期计划管理':row.billing?'缴费计划管理':'',version:await version(row)};
      }))};
    },
    async apply(id,input) {
      if(!Number.isSafeInteger(id)||id<1||!input||!Number.isSafeInteger(input.expiresAt)||!input.patch||
        !Object.keys(input.patch).length||Object.keys(input.patch).some(k=>!['title','content','deadline','recurrence'].includes(k)))fail(400,'修改字段无效。');
      const date=today(),row=await visible(date).prepare(source+' AND r.seq=?').bind(id).first();
      if(!row||row.billing||row.planner_dispatch_id||await version(row)!==input.version)fail(409,'事项已变化或由来源管理，请重新查询。');
      const remaining=input.expiresAt-now();
      if(remaining<=0||remaining>3600000)fail(409,'确认已到期，请重新提出修改。');
      const response=await patch(row,input.patch,date);
      if(!response.ok)fail(response.status,(await response.json()).error??'更新失败。');
      return {accepted:true};
    },
  };
}

export async function handleReminderEdits(request,host,path) {
  const match=/^\/api\/reminder-edits(?:\/([1-9]\d*))?$/.exec(path);
  if(!match)return null;
  const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  try {
    if(request.method!=='POST')return reply({error:{message:'需要 POST。'}},405);
    const input=await request.json().catch(()=>null);
    if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:{message:'请求无效。'}},400);
    const value=match[1]?await host.applyReminderEdit(Number(match[1]),input):await host.findEditReminders(input);
    return value.error?reply({error:{message:value.error}},value.status):reply(value);
  }catch{return reply({error:{message:'提醒服务尚未就绪，请稍后查询核对。'}},503);}
}
