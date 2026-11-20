const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(status,message)=>json({error:{message}},status);
const length=s=>Array.from(s).length;
const string=(s,max)=>typeof s==='string'&&length(s)<=max;
const key=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(s);
const date=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&new Date(s+'T12:00:00Z').toJSON()?.startsWith(s);
const info='day,part,revision,summary,tags,mood,weather,updated_at';
const nagInfo='id,revision,created_at,source,source_id,title,reason,status,mood';
const diaryView=r=>({...r,tags:JSON.parse(r.tags),...(r.threads?{threads:JSON.parse(r.threads)}:{})});
const pageId=/^(\d{4}-\d{2}-\d{2})\.(\d{1,6})$/;
const token=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),n=>n.toString(16).padStart(2,'0')).join('');
function validBatch(x){
  return x&&date(x.day)&&key(x.batch)&&string(x.body,5000)&&x.body.trim()&&
    string(x.summary,200)&&string(x.mood,40)&&string(x.weather,200)&&Array.isArray(x.tags)&&
    x.tags.length<=24&&x.tags.every(t=>string(t,50))&&Array.isArray(x.threads)&&x.threads.length<=8&&
    x.threads.every(t=>typeof t==='string'?string(t,300)&&t.trim():typeof t?.asked==='boolean'&&Number.isSafeInteger(t.at)&&string(t.text,300)&&t.text.trim());
}
async function append(db,owner,x){
  if(!validBatch(x))return fail(400,'日记批次无效');
  const fingerprint=await token([x.day,x.body,x.summary,x.tags,x.mood,x.weather,x.threads]);
  const bind=(sql,...args)=>db.prepare(sql).bind(owner,...args);
  const result=async part=>json(diaryView(await bind('SELECT '+info+',body,threads FROM companion_diary WHERE owner=? AND day=? AND part=?',x.day,part).first()));
  for(let retry=0;retry<6;retry++){
    const last=await bind('SELECT * FROM companion_diary WHERE owner=? AND day=? ORDER BY part DESC LIMIT 1',x.day).first();
    const old=await bind('SELECT part,j.value AS digest FROM companion_diary,json_each(batches) j WHERE owner=? AND day=? AND j.key=?',x.day,x.batch).first();
    if(old)return old.digest===fingerprint?result(old.part):fail(409,'批次号已用于其他内容');
    const empty=x.body==='无所事事的一天'&&!x.threads.length;
    if(empty&&last)return result(last.part);
    const grow=last&&length(last.body)+2+length(x.body)<=5000;
    const part=grow?last.part:(last?.part??0)+1;
    const threads=grow?JSON.parse(last.threads):[];
    for(const t of x.threads)threads.push({no:threads.length+1,text:typeof t==='string'?t:t.text,resolved:false,asked:t.asked===true,...(Number.isSafeInteger(t.at)?{at:t.at}:{})});
    const tags=JSON.stringify([...new Set([...x.tags,...(grow?JSON.parse(last.tags):[])])].slice(0,24));
    const batches=JSON.stringify({...grow&&JSON.parse(last.batches),[x.batch]:fingerprint});
    const at=new Date().toISOString();
    const fields=[x.summary,tags,x.mood,x.weather,JSON.stringify(threads),batches,at];
    const write=grow?db.prepare('UPDATE companion_diary SET body=body||char(10)||char(10)||?,summary=?,tags=?,mood=?,weather=?,threads=?,batches=?,updated_at=?,revision=revision+1 WHERE owner=? AND day=? AND part=? AND revision=?')
      .bind(x.body,...fields,owner,x.day,part,last.revision):
      db.prepare('INSERT INTO companion_diary(owner,day,part,revision,body,summary,tags,mood,weather,threads,batches,updated_at) VALUES(?,?,?,1,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(owner,x.day,part,x.body,...fields);
    if((await write.run()).meta.changes)return result(part);
  }
  return fail(409,'日记正在更新，请用原批次重试');
}
async function list(db,owner,url,diary){
  const q=(url.searchParams.get('q')??'').trim(),day=url.searchParams.get('day'),page=Number(url.searchParams.get('page')??0);
  if(!Number.isSafeInteger(page)||page<0||page>100000||q.length>200||day&&!date(day))return fail(400,'查询范围无效');
  const table=diary?'companion_diary':'companion_nags';
  const where=['owner=?'],args=[owner];
  if(day){where.push(diary?'day=?':"date(created_at,'+9 hours')=?");args.push(day);}
  const filter=url.searchParams.get('filter');
  if(filter&&filter.length>100)return fail(400,'筛选项过长');
  if(filter){where.push(diary?'EXISTS(SELECT 1 FROM json_each(tags) WHERE value=?)':'source=?');args.push(filter);}
  if(diary&&q.startsWith('@#')){where.push('EXISTS(SELECT 1 FROM json_each(tags) WHERE instr(lower(value),lower(?))>0)');args.push(q.slice(2));}
  else if(q){where.push('instr(lower('+ (diary?"day||summary||tags||mood":"source||title||reason||status||mood") +'),lower(?))>0');args.push(q.replace(/^@#/u,''));}
  const from=' FROM '+table+' WHERE '+where.join(' AND ');
  const rows=await db.prepare('SELECT '+(diary?info:nagInfo)+from+' ORDER BY '+(diary?'day DESC,part DESC':'created_at DESC,id')+' LIMIT 20 OFFSET ?').bind(...args,page*20).all();
  const total=await db.prepare('SELECT count(*) AS n'+from).bind(...args).first('n');
  return json({items:diary?rows.results.map(diaryView):rows.results,page,total});
}
async function updateThread(db,owner,day,part,no,input){
  if(!Number.isSafeInteger(no)||no<1||!['resolved','asked'].includes(input?.field))return fail(400,'悬念状态无效');
  const field='$['+(no-1)+'].'+input.field;
  const changed=await db.prepare("UPDATE companion_diary SET threads=json_set(threads,?,json('true')),revision=revision+1 WHERE owner=? AND day=? AND part=? AND json_extract(threads,?)=0")
    .bind(field,owner,day,part,field).run();
  if(changed.meta.changes)return json({ok:true});
  const existing=await db.prepare('SELECT json_extract(threads,?) AS value FROM companion_diary WHERE owner=? AND day=? AND part=?')
    .bind(field,owner,day,part).first();
  return existing?.value===1?json({ok:true}):fail(404,'悬念不存在');
}
async function saveNag(db,owner,x){
  if(!x||!key(x.id)||!Number.isSafeInteger(x.revision)||x.revision<1||!['paylog','diary'].includes(x.source)||
     !string(x.source_id,150)||!x.source_id||!string(x.title,300)||!string(x.reason,400)||!string(x.mood,40)||
     x.source==='paylog'&&!date(x.source_day)||x.source==='diary'&&!/^\d{4}-\d{2}-\d{2}\.\d+\/[1-9]\d*$/.test(x.source_id)||
     typeof x.created_at!=='string'||x.created_at!==new Date(x.created_at).toJSON()||!['提问中','等待回应','意外中断','用户结束','已解释','回合结束'].includes(x.status)||
     !Array.isArray(x.talk)||!x.talk.length||x.talk.length>24||!x.talk.every(line=>line&&string(line.text,12000)&&typeof line.at==='string'&&line.at===new Date(line.at).toJSON()&&['绯月','你','结束记录'].includes(line.who)))return fail(400,'念叨记录无效');
  const payload=JSON.stringify(x);
  const saved=await db.prepare(`INSERT INTO companion_nags(owner,id,revision,created_at,source,source_id,title,reason,status,mood,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(owner,id) DO UPDATE SET revision=excluded.revision,status=excluded.status,mood=excluded.mood,payload=excluded.payload
    WHERE companion_nags.revision<excluded.revision AND companion_nags.source=excluded.source AND companion_nags.source_id=excluded.source_id
      AND companion_nags.title=excluded.title AND companion_nags.reason=excluded.reason AND companion_nags.created_at=excluded.created_at AND companion_nags.status NOT IN ('用户结束','已解释','回合结束')
    ON CONFLICT DO NOTHING`)
    .bind(owner,x.id,x.revision,x.created_at,x.source,x.source_id,x.title,x.reason,x.status,x.mood,payload).run();
  if(saved.meta.changes)return json({id:x.id,revision:x.revision});
  const prior=await db.prepare('SELECT payload FROM companion_nags WHERE owner=? AND id=?').bind(owner,x.id).first();
  return prior?.payload===payload?json({id:x.id,revision:x.revision}):fail(409,'来源已提问或记录版本冲突');
}
export async function personalityMemory(request,env,owner){
  const u=new URL(request.url),[kind,id,action,no]=u.pathname.slice('/api/memory/'.length).split('/');
  const db=env.DB;
  if(!['diaries','nags'].includes(kind))return fail(404,'记录不存在');
  const diary=kind==='diaries',parts=pageId.exec(id??'');
  if(request.method==='GET'){
    if(!id)return list(db,owner,u,diary);
    if(diary&&parts&&!action){
      const row=await db.prepare('SELECT '+info+',body,threads FROM companion_diary WHERE owner=? AND day=? AND part=?').bind(owner,parts[1],Number(parts[2])).first();
      if(row)return json(diaryView(row));
    }else if(!diary&&key(id)&&!action){
      const r=await db.prepare('SELECT payload FROM companion_nags WHERE owner=? AND id=?').bind(owner,id).first();if(r)return json(JSON.parse(r.payload));
    }
    return fail(404,'原记录不可用');
  }
  if(request.method!=='POST')return fail(405,'仅支持读取和桌宠提交');
  const raw=await request.text();if(raw.length>350000)return fail(413,'记录过长');
  let body;try{body=JSON.parse(raw);}catch{return fail(400,'内容格式无效');}
  if(!id)return diary?append(db,owner,body):saveNag(db,owner,body);
  if(diary&&parts&&action==='threads')return updateThread(db,owner,parts[1],Number(parts[2]),Number(no),body);
  return fail(404,'接口不存在');
}
