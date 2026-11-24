export const refinementInterval=7*24*60*60*1000;
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

export function refinementText(kind,record){
  if(kind==='diaries')return {body:record.body,summary:record.summary};
  const afterEvaluation=record.afterEvaluation??'';
  return record.source==='audit'?{afterEvaluation}:{beforeEvaluation:record.beforeEvaluation??'',afterEvaluation};
}

export function canRefine(kind,record){
  if(kind==='diaries'){
    const body=record.body?.trim();
    return Boolean(body&&body!==emptyDiaryBody);
  }
  return endedNag.has(record.status)&&Boolean(record.talk?.some(line=>line.text?.trim())||
    record.beforeEvaluation?.trim()||record.afterEvaluation?.trim());
}

// 手记的原话和已有附件锚点须可在当前正文直接查到。
export function protectedDiaryText(body){
  return [...new Set([
    ...body.split('\n').filter(line=>/^\s*(?:你说|老公说|用户原话|绯月当时回复|来源摘记)\s*[：:「]/u.test(line)).map(line=>line.trim()),
    ...Array.from(body.matchAll(/〔附件原文 [a-f0-9]{32}〕/gu),match=>match[0])
  ])];
}

function sameFields(expected,input){
  return input&&Object.keys(input).length===Object.keys(expected).length&&
    Object.keys(expected).every(field=>typeof input[field]==='string');
}

export function refinementFields(kind,record,input){
  const previous=refinementText(kind,record);
  if(!sameFields(previous,input))return null;
  const fields=Object.fromEntries(Object.keys(previous).map(field=>[field,input[field]]));
  const length=value=>[...value].length;
  if(kind==='diaries'){
    const extraLines=fields.summary.split('\n').slice(1);
    if(!canRefine(kind,fields)||length(fields.body)>5000||length(fields.summary)>200||fields.summary.includes('\r')||
      extraLines.some(line=>!/^(?:你的日记|花园部署|当日消费)：\S/u.test(line)))return null;
  }else if(Object.entries(fields).some(([key,value])=>length(value)>(record.source==='audit'&&key==='afterEvaluation'?600:12000))){
    return null;
  }
  return fields;
}

export function checkedRefinement(kind,record,input,quotes=[]){
  const fields=refinementFields(kind,record,input);
  if(!fields||kind==='diaries'&&[...protectedDiaryText(record.body),...quotes].some(quote=>!fields.body.includes(quote)))return null;
  return fields;
}
