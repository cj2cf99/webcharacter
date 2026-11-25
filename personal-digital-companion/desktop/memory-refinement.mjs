import {randomUUID} from 'node:crypto';
import {tokyoDay} from './conversation-history.mjs';
import {untilAbort} from './chat-budget.mjs';
import {readInteractionSkill} from './interaction-skills.mjs';
import {canRefine,checkedRefinement,emptyDiaryBody,endedNag,protectedDiaryText,refinementDigest,refinementInterval,refinementText} from '../agent/assistant/memory-refinement.mjs';
import {nagCorrectionAfterword} from './nag-reply-check.mjs';

const limit=20;
const size=144;
const title=kind=>kind==='diaries'?'日记':'唠叨';
const idOf=(kind,record)=>kind==='diaries'?record.day+'.'+record.part:record.id;
const formatHint=kind=>kind==='diaries'?'diaryWriting':'diaryAudit';
const pathFor=({kind,id})=>kind+'/'+encodeURIComponent(id)+'/refine';
const shorten=(text,n)=>[...String(text??'')].slice(0,n).join('');

function describeChange(before,after){
  const from=[...before],to=[...after];
  let start=0,end=0;
  while(start<from.length&&start<to.length&&from[start]===to[start])start++;
  while(end<from.length-start&&end<to.length-start&&from.at(-1-end)===to.at(-1-end))end++;
  const excerpt=chars=>shorten(chars.slice(start,chars.length-end).join('').trim().replace(/\s+/gu,' '),36);
  const removed=excerpt(from),added=excerpt(to);
  if(!removed&&!added)return '我调整了这段的空白。';
  if(!removed)return '我补入了「'+added+'」。';
  if(!added)return '我删去了「'+removed+'」。';
  return '我把「'+removed+'」改成了「'+added+'」。';
}

function formatSnapshot(kind,format){
  const content=kind==='diaries'?(format.content.split('## 成篇范本')[1]?.split('\n宿主负责')[0]?.trim()??format.content):
    '沿用已有的「开口的时候」「听完以后」评价栏。手记质问保留独立引文与矛盾点。';
  return {version:format.version,content:shorten(content.split('\n').filter(line=>!line.startsWith('- 例如')).join('\n'),260)};
}

function chunks(text){
  const chars=[...text],parts=[];
  for(let start=0;start<chars.length;){
    let end=Math.min(start+size,chars.length);
    if(end<chars.length){
      let boundary=end-1;
      while(boundary>start+size/2&&!/[\s。！？]/u.test(chars[boundary]))boundary--;
      if(boundary>start+size/2)end=boundary+1;
    }
    parts.push({text:chars.slice(start,end).join('')});
    start=end;
  }
  return parts;
}

function diaryParts(body,quotes){
  const keep=[...protectedDiaryText(body),...quotes.flatMap(quote=>quote.split('\n').map(line=>line.trim()).filter(Boolean))];
  const parts=[];
  let editable='';
  for(const line of body.split(/(?<=\n)/u)){
    if(keep.some(quote=>line.includes(quote))){
      parts.push(...chunks(editable),{text:line,fixed:true});editable='';
    }else editable+=line;
  }
  parts.push(...chunks(editable));
  if(parts.at(-1)?.fixed)parts.push({text:'',afterFixed:true});
  return parts;
}

function splitFields(fields,quotes){
  const bodyPrefix=emptyDiaryBody+'\n\n';
  const realBody=fields.body?.startsWith(bodyPrefix)?fields.body.slice(bodyPrefix.length):null;
  const mixedDiary=realBody&&quotes.every(quote=>realBody.includes(quote));
  return Object.entries(fields).flatMap(([field,text])=>{
    const placeholder=mixedDiary&&(field==='body'?bodyPrefix:field==='summary'?emptyDiaryBody+'\n':'');
    const removePlaceholder=placeholder&&text.startsWith(placeholder);
    const rest=removePlaceholder?text.slice(placeholder.length):text;
    const parts=field==='body'?diaryParts(rest,quotes):
      removePlaceholder?[{text:rest,fixed:true}]:chunks(rest);
    if(removePlaceholder)parts.unshift({text:placeholder,removePlaceholder:true});
    if(!parts.length)parts.push({text:''});
    return parts.map((part,index)=>({...part,id:field+'-'+(index+1),field,last:index===parts.length-1}));
  });
}

function contextFor(record){
  return {date:record.day??tokyoDay(Date.parse(record.created_at)),timezone:'Asia/Tokyo',source:record.source,reason:record.reason,
    title:record.title,dialogue:record.talk?.map(({who,at,text})=>({who,at,text:shorten(text,150)}))};
}

function briefContext(context){
  const {dialogue,...rest}=context;
  if(!dialogue)return rest;
  const limit=dialogue.length>8?55:100;
  return {...rest,dialogue:dialogue.map(line=>({...line,text:shorten(line.text,limit)}))};
}

function tidyDiaryPart(text,last){
  const deduplicated=text.split('\n').map(line=>{
    if(/[「」“”]/u.test(line))return line;
    const sentences=line.split(/(?<=。)/u);
    return sentences.filter((sentence,index)=>!index||!sentence.endsWith('。')||
      sentence.trim()!==sentences[index-1].trim()).join('');
  }).join('\n');
  if(!last)return deduplicated;
  const bare=/(?:^|\n)[ \t]*(?:【(?:你的日记|花园部署|当日消费|热点新闻|本机行动)】|来源摘记[:：]|当时的评价[:：]|绯月私语[:：])[ \t]*(?:\n[ \t]*)*$/u;
  let result=deduplicated;
  while(bare.test(result))result=result.replace(bare,'');
  return result;
}

function cooling(receipt,now){
  return Boolean(receipt&&now-Date.parse(receipt.refineDatetime)<refinementInterval);
}

export function createMemoryRefinement({db,api,model,evidence,clean,cache,readLocalNags,writeLocalNag,isLocalNag,now=Date.now,loadSkill=readInteractionSkill}){
  db.exec(`CREATE TABLE IF NOT EXISTS memory_refinements (
    task_id TEXT PRIMARY KEY, active INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS memory_refinements_one ON memory_refinements(active) WHERE active=1;
    CREATE TABLE IF NOT EXISTS memory_refinement_checked (
      kind TEXT NOT NULL, record_id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(kind,record_id));
    CREATE TABLE IF NOT EXISTS memory_refinement_scan (
      id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);`);
  const active=db.prepare('SELECT data FROM memory_refinements WHERE active=1');
  const history=db.prepare('UPDATE memory_refinements SET active=0,data=? WHERE task_id=? AND active=1');
  const noChange=db.prepare('DELETE FROM memory_refinements WHERE task_id=? AND active=1');
  const checkpoint=db.prepare('UPDATE memory_refinements SET data=? WHERE task_id=? AND active=1');
  const readChecked=db.prepare('SELECT fingerprint FROM memory_refinement_checked WHERE kind=? AND record_id=?');
  const writeChecked=db.prepare('INSERT OR REPLACE INTO memory_refinement_checked VALUES(?,?,?)');
  const readScan=db.prepare('SELECT data FROM memory_refinement_scan WHERE id=1');
  const writeScan=db.prepare('INSERT OR REPLACE INTO memory_refinement_scan VALUES(1,?)');
  const saveLocalHistory=db.prepare('INSERT INTO memory_refinements VALUES(?,0,?)');
  let running=false;
  let outputKey;

  function acknowledge(){
    model.aiAck?.(outputKey);
    outputKey=undefined;
  }

  function store(job){
    if(!checkpoint.run(JSON.stringify(job),job.taskId).changes)throw Error('本机修订任务已变化');
    acknowledge();
  }

  async function fingerprint(job,fields){
    return refinementDigest([fields,job.format.version,job.skill.version,job.evidence,job.quotes]);
  }

  function correctedNagFields(record,correction){
    const previous=refinementText('nags',record);
    if(!correction||previous.afterEvaluation.includes(correction))return null;
    const afterEvaluation=[previous.afterEvaluation,correction].filter(Boolean).join('\n');
    return checkedRefinement('nags',record,{...previous,afterEvaluation});
  }

  async function reviseLocalNag(signal,progress){
    for(const record of readLocalNags?.()??[]){
      const fields=correctedNagFields(record,nagCorrectionAfterword(record,clean));
      if(!fields)continue;
      const receipt={refineId:randomUUID(),revision:record.revision+1,refineDatetime:new Date(now()).toISOString(),
        digest:await refinementDigest(fields)};
      signal.throwIfAborted();
      progress({stage:'补记本机唠叨'});
      db.exec('BEGIN');
      try{
        const updated=writeLocalNag(record,{...record,afterEvaluation:fields.afterEvaluation,revision:receipt.revision});
        if(updated)saveLocalHistory.run(receipt.refineId,JSON.stringify({kind:'nags',id:record.id,baseRevision:record.revision,
          previous:refinementText('nags',record),fields,note:'我按原话补了一条本机更正。',receipt,localOnly:true}));
        db.exec('COMMIT');
        if(updated)return '已修订本机唠叨 '+record.id;
      }catch(error){db.exec('ROLLBACK');throw error;}
    }
    return '';
  }

  async function complete(job,remote){
    const receipt=remote?.receipt??null;
    const fields=receipt?job.submission.fields:job.previous;
    const checked=await fingerprint(job,fields);
    const result={kind:job.kind,id:job.id,baseRevision:job.baseRevision,skillVersion:job.skill.version,
      previous:job.previous,fields,note:receipt?job.note:'',receipt};
    db.exec('BEGIN');
    try{
      const saved=receipt?history.run(JSON.stringify(result),job.taskId):noChange.run(job.taskId);
      if(!saved.changes)throw Error('本机修订任务已变化');
      writeChecked.run(job.kind,job.id,checked);
      if(remote)cache?.(job.kind,remote.record);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return receipt?'已修订'+title(job.kind)+' '+job.id:'本轮无改动';
  }

  async function choose(signal){
    const scan=JSON.parse(readScan.get()?.data??'{"next":"diaries","diaries":{"page":0,"offset":0},"nags":{"page":0,"offset":0}}');
    const kind=scan.next,from=scan[kind];
    const list=await api(kind+'?page='+from.page,undefined,signal);
    signal.throwIfAborted();
    const page=list.items.slice(from.offset);
    const offset=page.findIndex(item=>kind==='diaries'||endedNag.has(item.status)&&!isLocalNag?.(item.id));
    scan.next=kind==='diaries'?'nags':'diaries';
    if(offset<0||from.offset+offset+1>=list.items.length){
      scan[kind]=(from.page+1)*limit<list.total?{page:from.page+1,offset:0}:{page:0,offset:0};
    }else scan[kind]={page:from.page,offset:from.offset+offset+1};
    if(offset<0){writeScan.run(JSON.stringify(scan));return null;}
    const id=idOf(kind,page[offset]),route={kind,id};
    let remote;
    try{remote=await api(pathFor(route),undefined,signal);}
    catch(error){
      signal.throwIfAborted();
      // 旧服务尚无修订入口，记录在列表读取后被删除也会返回 404。
      if(error.status!==404)throw error;
      writeScan.run(JSON.stringify(scan));
      return null;
    }
    signal.throwIfAborted();
    if(!canRefine(kind,remote.record)||cooling(remote.receipt,now())){
      writeScan.run(JSON.stringify(scan));return null;
    }
    const skill=await loadSkill('memoryRefinement');
    const format=await loadSkill(formatHint(kind));
    const task={...route,taskId:randomUUID(),skill,format:formatSnapshot(kind,format)};
    await rebase(task,remote,signal);
    const checked=await fingerprint(task,task.previous);
    signal.throwIfAborted();
    if(readChecked.get(kind,id)?.fingerprint===checked){writeScan.run(JSON.stringify(scan));return null;}
    db.exec('BEGIN');
    try{
      db.prepare('INSERT INTO memory_refinements VALUES(?,1,?)').run(task.taskId,JSON.stringify(task));
      writeScan.run(JSON.stringify(scan));
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return task;
  }

  async function rebase(job,remote,signal){
    const {record,quotes}=remote;
    const previous=refinementText(job.kind,record),context=contextFor(record);
    const correction=job.kind==='nags'&&record.source!=='audit'?nagCorrectionAfterword(record,clean):'';
    const sources=correction?[]:await evidence?.(job.kind,job.id,record,signal,remote.subject)??[];
    signal.throwIfAborted();
    if(job.submission&&JSON.stringify([previous,context,sources,quotes])===
        JSON.stringify([job.previous,job.context,job.evidence,job.quotes])){
      job.baseRevision=record.revision;
      job.submission.refineId=randomUUID();
      job.sent=false;
      return;
    }
    if(job.plan||job.submission){
      job.previousDraft={baseRevision:job.baseRevision,previous:job.previous,plan:job.plan,drafts:job.drafts,reviews:job.reviews};
    }
    Object.assign(job,{baseRevision:record.revision,previous,parts:splitFields(previous,quotes??[]),context,evidence:sources,quotes,correction,
      plan:null,drafts:{},reviews:[],partPlans:{},partReviews:{},note:'',submission:null,sent:false});
  }

  async function think(job,stage,data,signal,tokens){
    signal.throwIfAborted();
    const {skill,format}=job;
    const base=skill.schemas?.[stage];
    if(!base||!skill.localAi?.[stage])throw Error('修订 Skill 缺少阶段说明');
    const partLength=stage==='draft'?[...data.part.text].length:0;
    const schema=stage==='draft'?{...base,properties:{...base.properties,
      text:{...base.properties.text,maxLength:Math.max(72,partLength+55)},
      note:{...base.properties.note,maxLength:48}}}:stage==='review'?
      {...base,properties:{...base.properties,decision:{enum:['accept','revise']}}}:base;
    const draftField=data.part?.field;
    const queued=Boolean(model.aiAck);
    const originalDates=queued&&draftField&&draftField!=='summary'?
      [...new Set(data.part.text.match(/(?:周|星期|礼拜)[一二三四五六日天]|[0-9]{1,2}月[0-9]{1,2}[日号]|[0-9]{4}-[0-9]{2}-[0-9]{2}/gu)??[])]:[];
    const deduplicated=queued&&draftField?.endsWith('Evaluation')&&!data.materials?.length?
      tidyDiaryPart(data.part.text,false):null;
    const aiFallback=deduplicated&&deduplicated!==data.part.text?{text:deduplicated.trim(),note:'我合并了相邻的重复语句。'}:undefined;
    if(queued&&draftField==='summary')Object.assign(schema.properties.text,{maxLength:64,pattern:'^[^\\r\\n]+$'});
    const formatRule=draftField==='summary'?'只写一行简短摘要。禁止换行、栏目、日期抬头或重复正文。':
      draftField==='body'?'只编辑给定正文片段。沿用有效栏目，禁止生成整篇日记的日期抬头、摘要、天气、情绪或标签。':
      '当前文种格式：'+shorten(format.content,220);
    const instruction=[stage==='review'?skill.localAi.reviewRules??'':skill.localAi.rules??shorten(skill.content,220),skill.localAi[stage],
      stage==='review'?'复核结论只允许 accept 或 revise。':'',formatRule].filter(Boolean).join('\n');
    const modelData=queued&&draftField==='summary'?{原摘要:data.part.text,当前正文:shorten(data.revisedBody,320)}:data;
    const aiCheckpoint=queued?'refine:'+job.taskId+':'+await refinementDigest([stage,skill.version,format.version,job.baseRevision,modelData]):undefined;
    let output;
    try{
      output=await untilAbort(model.memory(JSON.stringify(modelData),instruction,schema,signal,
        {name:skill.skill,version:skill.version,stage,maxTokens:tokens,...(queued?{aiCheckpoint,aiReview:stage==='draft',aiRole:stage==='review'||stage==='plan'?'assist':'main',aiPriority:stage==='draft'&&data.review?2:1,aiFallback,
          ...(originalDates.length?{aiKeep:{text:originalDates}}:{})}:{})}),signal);
    }catch(error){
      signal.throwIfAborted();
      if(error.code==='LOCAL_AI_TASK_DISCARDED')outputKey=aiCheckpoint;
      if(error.code==='TimeoutError'||error.code==='LOCAL_AI_TIMEOUT')
        throw Object.assign(Error('本机修订单步超时，已保留进度'),{code:'LOCAL_AI_REFINEMENT_TIMEOUT'});
      throw error;
    }
    signal.throwIfAborted();
    if(!output||!schema.required.every(key=>typeof output[key]==='string'&&
        (!schema.properties[key].enum||schema.properties[key].enum.includes(output[key]))&&
        (!schema.properties[key].maxLength||[...output[key]].length<=schema.properties[key].maxLength)))throw Error('修订阶段结果格式无效');
    outputKey=aiCheckpoint;
    return Object.fromEntries(schema.required.map(key=>[key,output[key]]));
  }

  function useFormat(job,format){
    job.previousDraft={baseRevision:job.baseRevision,previous:job.previous,plan:job.plan,drafts:job.drafts,reviews:job.reviews};
    job.format=formatSnapshot(job.kind,format);
    Object.assign(job,{plan:null,drafts:{},reviews:[],partPlans:{},partReviews:{},submission:null,note:''});
    store(job);
  }

  function verifyReceipt(job,remote){
    const {receipt}=remote;
    const {refineId,digest}=job.submission;
    if(receipt?.refineId!==refineId)return false;
    if(receipt.digest!==digest||receipt.revision!==job.baseRevision+1||!Number.isFinite(Date.parse(receipt.refineDatetime)))
      throw Error('服务端修订回执与本机备份不一致');
    return true;
  }

  function cancelRemoteIfPrivate(job){
    if(job.kind!=='nags'||!isLocalNag?.(job.id))return false;
    history.run(JSON.stringify({kind:job.kind,id:job.id,baseRevision:job.baseRevision,
      previous:job.previous,fields:job.submission?.fields,localOnly:true,cancelled:true}),job.taskId);
    return true;
  }

  async function submit(job,signal,progress){
    progress({stage:'核对修订回执'});
    if(cancelRemoteIfPrivate(job))return '这条唠叨改为仅本机，已停止远端修订';
    const path=pathFor(job),remote=await api(path,undefined,signal);
    signal.throwIfAborted();
    if(cancelRemoteIfPrivate(job))return '这条唠叨改为仅本机，已停止远端修订';
    if(verifyReceipt(job,remote))return complete(job,remote);
    if(remote.record.revision!==job.baseRevision){
      if(job.sent&&remote.receipt?.revision>job.baseRevision+1)throw Error('最近回执已有更新，本次提交仍待核对');
      if(!canRefine(job.kind,remote.record))throw Error('原记录暂不可修订，已保留本机稿件');
      if(cooling(remote.receipt,now()))return '原记录刚修订过，本机保留稿件等待七天限频';
      await rebase(job,remote,signal);store(job);
      return '记录版本已变化，下轮从同一条继续核对';
    }
    if(!job.sent){
      const format=await loadSkill(formatHint(job.kind));
      signal.throwIfAborted();
      if(format.version!==job.format.version){
        useFormat(job,format);
        return '文种格式已更新，下轮接着修订同一条';
      }
    }
    progress({stage:'提交已复核的修订'});
    if(cancelRemoteIfPrivate(job))return '这条唠叨改为仅本机，已停止远端修订';
    const {refineId,fields}=job.submission;
    job.sent=true;store(job);
    await api(path,{refineId,baseRevision:job.baseRevision,fields},signal);
    signal.throwIfAborted();
    const saved=await api(path,undefined,signal);
    signal.throwIfAborted();
    if(!verifyReceipt(job,saved))throw Error('修订已发送，等待回读核实');
    return complete(job,saved);
  }

  async function run(signal,progress=()=>{}){
    if(running)return {deferred:true};
    running=true;
    let job;
    try{
      signal.throwIfAborted();
      const local=await reviseLocalNag(signal,progress);
      if(local)return local;
      if(!api)return '本轮没有符合条件的本机修订';
      job=JSON.parse(active.get()?.data??'null');
      if(!job)job=await choose(signal);
      if(!job)return '本轮没有符合条件的修订';
      if(cancelRemoteIfPrivate(job))return '这条唠叨改为仅本机，已停止远端修订';
      if(job.submission&&job.sent)return await submit(job,signal,progress);
      const format=await loadSkill(formatHint(job.kind));
      signal.throwIfAborted();
      if(format.version!==job.format.version)useFormat(job,format);
      if(job.submission)return await submit(job,signal,progress);
      if(job.correction){
        const fields=correctedNagFields({...job.context,...job.previous},job.correction);
        if(fields){
          job.note='我按原话补了一条更正，保留了当时的发言。';
          job.submission={refineId:randomUUID(),fields,digest:await refinementDigest(fields)};
          store(job);
          return await submit(job,signal,progress);
        }
      }
      if(job.parts.some(part=>!part.fixed&&!job.drafts[part.id]&&[...part.text].length>size)){
        job.parts=job.parts.flatMap(part=>{
          if(part.fixed||job.drafts[part.id]||[...part.text].length<=size)return [part];
          const pieces=chunks(part.text);
          return pieces.map((piece,index)=>({...part,...piece,id:part.id+'.'+(index+1),last:part.last&&index===pieces.length-1}));
        });
        store(job);
      }
      const parts=job.parts;
      const long=parts.reduce((total,part)=>total+[...part.text].length,0)>650||parts.length>8;
      const record={...briefContext(job.context),kind:title(job.kind),id:job.id};
      const materials=job.evidence.map((source,index)=>({...source,id:'材料'+(index+1),snippet:shorten(source.snippet,120)}));
      if(!job.plan){
        progress({stage:'核对'+title(job.kind)+' '+job.id});
        const overview=long?parts.slice(0,6):parts;
        job.plan=await think(job,'plan',{record,materials,totalParts:parts.length,
          parts:overview.map(({id,text,fixed})=>({id,text:long?shorten(text,55):text,fixed}))},signal,270);
        store(job);
      }
      const hasFormatCleanup=parts.some(part=>part.removePlaceholder||
        !part.fixed&&part.field==='body'&&tidyDiaryPart(part.text,part.last)!==part.text);
      if(!long&&!hasFormatCleanup&&Object.values(job.plan).every(value=>!value.trim()))return await complete(job);
      for(let index=0;index<parts.length;index++){
        const part=parts[index];
        if(job.drafts[part.id])continue;
        if(part.removePlaceholder){
          job.drafts[part.id]={text:'',note:'我移除了已有正文的空日记占位。'};store(job);continue;
        }
        if(part.fixed){job.drafts[part.id]={text:part.text,note:''};store(job);continue;}
        const note=job.reviews.at(-1)?.reason;
        const extend=part.last&&['body','afterEvaluation'].includes(part.field);
        let plan=job.plan;
        if(long){
          job.partPlans??={};
          if(!job.partPlans[part.id]){
            progress({stage:'分段核对 '+title(job.kind),done:index,total:parts.length});
            job.partPlans[part.id]=await think(job,'plan',{record,materials:extend?materials:[],parts:[part],overall:job.plan},signal,270);
            store(job);
          }
          plan=job.partPlans[part.id];
        }
        progress({stage:'拟稿 '+title(job.kind),done:index,total:parts.length});
        const revisedBody=part.field==='summary'?
          shorten(parts.filter(item=>item.field==='body').map(item=>job.drafts[item.id].text).join(''),620):undefined;
        const tokens=Math.max(140,Math.ceil([...part.text].length*1.45)+110);
        const inputPart=part.field==='body'?{...part,text:tidyDiaryPart(part.text,part.last)}:part;
        const draft=await think(job,'draft',{record,part:inputPart,plan:{...plan,additions:extend?plan.additions:''},
          materials:extend?materials:[],extend,revisedBody,previous:shorten(parts[index-1]?.text,100),review:note},signal,tokens);
        let text=draft.text.trim()===inputPart.text.trim()?inputPart.text:clean(draft.text);
        if(part.field==='body'){
          const headers=/^\s*【(?:摘要|天气|情绪|标签)】/mu;
          if(headers.test(text)&&!headers.test(part.text)){
            acknowledge();
            throw Error('正文段落带入了篇首字段，已保留其他进度');
          }
          text=tidyDiaryPart(text,part.last);
        }
        if(part.field==='summary'&&(/[\r\n]/u.test(text)||/^【.+?】/u.test(text))){
          acknowledge();
          throw Error('摘要须为一行文字，已保留正文稿件');
        }
        const unchanged=text.trim()===part.text.trim();
        const wrapped=text?(part.afterFixed?'\n\n':part.text.match(/^\s*/u)[0])+text+part.text.match(/\s*$/u)[0]:text;
        const alteredByHost=inputPart.text!==part.text||clean(draft.text)!==text;
        const changeNote=alteredByHost?'':clean(draft.note);
        job.drafts[part.id]={text:unchanged?part.text:wrapped,note:unchanged?'':changeNote||describeChange(clean(part.text),text)};
        store(job);
      }
      const proposed=Object.fromEntries(Object.keys(job.previous).map(field=>[field,
        parts.filter(part=>part.field===field).map(part=>job.drafts[part.id].text).join('')]));
      const fields=checkedRefinement(job.kind,{...record,...job.previous,source:record.source},proposed,job.quotes);
      if(!fields){
        const part=parts.find(item=>job.drafts[item.id].text!==item.text);
        if(part)delete job.drafts[part.id];
        job.reviews.push({decision:'revise',part:part?.id,reason:'修订稿超限或改动了必须保留的原话和引用'});
        store(job);return '修订稿待补正，已保留其他段落';
      }
      if(JSON.stringify(fields)===JSON.stringify(job.previous))return await complete(job);
      const changed=parts.filter(part=>job.drafts[part.id].text!==part.text);
      if(long){
        job.partReviews??={};
        for(const part of changed){
          const draft=job.drafts[part.id];
          if(job.partReviews[part.id]?.text===draft.text)continue;
          progress({stage:'复核完整改动段落'});
          const review=await think(job,'review',{record,materials,
            parts:[{id:part.id,old:part.text,next:draft.text,note:draft.note}]},signal,140);
          job.partReviews[part.id]={...review,text:draft.text};
          if(review.decision!=='accept'){
            job.reviews.push(review);delete job.drafts[part.id];
            delete job.partReviews[part.id];store(job);
            return '段落待补正，已保留其他段落';
          }
          store(job);
        }
      }
      const reviewDigest=await refinementDigest(fields);
      let review=job.reviews.at(-1);
      if(review?.digest!==reviewDigest||!['accept','revise'].includes(review?.decision)){
        progress({stage:'复核修订稿'});
        const overview=long?changed.slice(0,8):parts;
        const budget=long?55:200;
        const out=await think(job,'review',{record,materials,plan:job.plan,reviewedParts:long?changed.length:0,
          parts:overview.map(part=>({id:part.id,old:shorten(part.text,budget),next:shorten(job.drafts[part.id].text,budget),note:job.drafts[part.id].note}))},signal,140);
        review={...out,digest:reviewDigest};
        job.reviews.push(review);store(job);
      }
      if(review.decision==='revise'){
        const redo=changed.find(part=>part.id===review.part)??changed[0];
        delete job.drafts[redo.id];store(job);return '复核发现待修正内容，已保留其他段落';
      }
      job.note=[...new Set(Object.values(job.drafts).map(draft=>draft.note).filter(Boolean))].join('\n');
      job.submission={refineId:randomUUID(),fields,digest:reviewDigest};
      store(job);
      return await submit(job,signal,progress);
    }catch(error){
      if(!job||error.code!=='LOCAL_AI_TASK_DISCARDED')throw error;
      await complete(job,null);acknowledge();
      return '修订任务执行超时，已丢弃';
    }finally{outputKey=undefined;running=false;}
  }
  return {run};
}
