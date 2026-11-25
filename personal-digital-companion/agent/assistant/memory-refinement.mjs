export const refinementInterval=7*24*60*60*1000;
export const refinementRuleVersion='rewrite-v1';
export const diaryTagLimit=10;
export const endedNag=new Set(['用户结束','已解释','回合结束']);
export const diaryOriginalKey='@refineOriginal';
export const diaryReceiptKey='@refineReceipt';
export const nagRefinementKey='_refinement';
export const emptyDiaryBody='无所事事的一天';
export const diaryThreadLimit=4;

export function appendDiaryBody(prior,body){
  return prior===emptyDiaryBody?body:prior+'\n\n'+body;
}

export async function refinementDigest(value){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function normalizedThreads(list){
  return Array.isArray(list)?list.map((t,i)=>typeof t==='string'?
    {no:i+1,text:t,resolved:false,asked:false}:
    {
      no:Number.isInteger(t.no)?t.no:i+1,text:t.text,resolved:Boolean(t.resolved),asked:Boolean(t.asked),
      ...(Number.isSafeInteger(t.at)?{at:t.at}:{}),
      ...(Number.isInteger(t.priority)?{priority:t.priority}:{})
    }):[];
}

function normalizedTalk(list){
  return Array.isArray(list)?list.map(line=>({who:line.who,at:line.at,text:line.text})):[];
}

export function refinementText(kind,record){
  if(kind==='diaries'){
    return {
      body:record.body,
      summary:record.summary,
      tags:Array.isArray(record.tags)?record.tags:[],
      threads:normalizedThreads(record.threads)
    };
  }
  const afterEvaluation=record.afterEvaluation??'';
  const talk=normalizedTalk(record.talk);
  return record.source==='audit'?{afterEvaluation,talk}:{beforeEvaluation:record.beforeEvaluation??'',afterEvaluation,talk};
}

export function canRefine(kind,record){
  if(kind==='diaries'){
    const body=record.body?.trim();
    return Boolean(body&&body!==emptyDiaryBody);
  }
  return endedNag.has(record.status)&&Boolean(record.talk?.some(line=>line.text?.trim())||
    record.beforeEvaluation?.trim()||record.afterEvaluation?.trim());
}

// 仅保留附件原文锚点；普通对话行允许重写精简。
export function protectedDiaryText(body){
  return [...new Set(Array.from(String(body??'').matchAll(/〔附件原文 [a-f0-9]{32}〕/gu),match=>match[0]))];
}

function sameKeys(expected,input){
  return Boolean(input&&typeof input==='object'&&!Array.isArray(input)&&
    Object.keys(input).length===Object.keys(expected).length&&
    Object.keys(expected).every(field=>Object.hasOwn(input,field)));
}

function validTags(tags){
  if(!Array.isArray(tags)||tags.length>diaryTagLimit)return null;
  const seen=new Set(),clean=[];
  for(const item of tags){
    if(typeof item!=='string')return null;
    const text=item.trim();
    if(!text||[...text].length>50||seen.has(text))return null;
    seen.add(text);clean.push(text);
  }
  return clean;
}

function validThreads(threads,originalThreads){
  if(!Array.isArray(threads)||threads.length>8)return null;
  const seenNo=new Set(),clean=[];
  for(const item of threads){
    if(!item||typeof item!=='object'||Array.isArray(item))return null;
    if(!Number.isInteger(item.no)||item.no<1||seenNo.has(item.no))return null;
    if(typeof item.text!=='string'||!item.text.trim()||[...item.text].length>300)return null;
    if(typeof item.resolved!=='boolean'||typeof item.asked!=='boolean')return null;
    if(item.at!==undefined&&!Number.isSafeInteger(item.at))return null;
    if(item.priority!==undefined&&(!Number.isInteger(item.priority)||item.priority<1||item.priority>5))return null;
    seenNo.add(item.no);
    clean.push({
      no:item.no,text:item.text.trim(),resolved:item.resolved,asked:item.asked,
      ...(item.at!==undefined?{at:item.at}:{}),
      ...(item.priority!==undefined?{priority:item.priority}:{})
    });
  }
  // 已被拿来念叨过的悬念必须保留原编号与状态，防止历史唠叨关联断链。
  for(const orig of originalThreads??[]){
    if(!orig?.asked)continue;
    const kept=clean.find(item=>item.no===orig.no);
    if(!kept||!kept.asked||kept.resolved!==Boolean(orig.resolved))return null;
  }
  return clean;
}

function validTalk(talk,originalTalk){
  if(!Array.isArray(talk)||!talk.length||talk.length>24)return null;
  const allowedTimes=new Set((originalTalk??[]).map(line=>line?.at).filter(Boolean));
  const clean=[];
  let prevAt='';
  for(const line of talk){
    if(!line||typeof line!=='object'||Array.isArray(line))return null;
    if(!['绯月','你','结束记录'].includes(line.who))return null;
    if(typeof line.text!=='string'||!line.text.trim()||[...line.text].length>12000)return null;
    if(typeof line.at!=='string'||line.at!==new Date(line.at).toJSON())return null;
    if(allowedTimes.size&&!allowedTimes.has(line.at))return null;
    if(prevAt&&line.at<prevAt)return null;
    prevAt=line.at;
    clean.push({who:line.who,at:line.at,text:line.text.trim()});
  }
  const origEnds=(originalTalk??[]).filter(line=>line?.who==='结束记录');
  for(const end of origEnds){
    if(!clean.some(line=>line.who==='结束记录'&&line.text===end.text))return null;
  }
  return clean;
}

export function refinementFields(kind,record,input){
  const previous=refinementText(kind,record);
  if(!sameKeys(previous,input))return null;
  const length=value=>[...value].length;
  if(kind==='diaries'){
    if(typeof input.body!=='string'||typeof input.summary!=='string')return null;
    const tags=validTags(input.tags);
    const threads=validThreads(input.threads,record.threads);
    if(!tags||!threads)return null;
    const fields={body:input.body,summary:input.summary,tags,threads};
    if(!canRefine(kind,fields)||length(fields.body)>5000||length(fields.summary)>200||
      fields.summary.includes('\r')||fields.summary.includes('\n'))return null;
    return fields;
  }
  const talk=validTalk(input.talk,record.talk);
  if(!talk)return null;
  const fields={};
  if(record.source!=='audit'){
    if(typeof input.beforeEvaluation!=='string'||length(input.beforeEvaluation)>12000)return null;
    fields.beforeEvaluation=input.beforeEvaluation;
  }
  if(typeof input.afterEvaluation!=='string'||length(input.afterEvaluation)>(record.source==='audit'?600:12000))return null;
  fields.afterEvaluation=input.afterEvaluation;
  fields.talk=talk;
  return fields;
}

export function checkedRefinement(kind,record,input,quotes=[]){
  const fields=refinementFields(kind,record,input);
  if(!fields||kind==='diaries'&&[...protectedDiaryText(record.body),...quotes].some(quote=>!fields.body.includes(quote)))return null;
  return fields;
}
