import {createHash,randomInt} from 'node:crypto';
import {pairChoice,splitPairChoice} from './pair-choice.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const list=value=>Array.isArray(value)?value:[];
const key=(...parts)=>JSON.stringify(parts);
const version=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const imageTypes=/^image\/(?:png|jpeg|gif|webp)$/u;
export const studyAssetIds=(...parts)=>[...new Set(parts.join('\n').matchAll(/asset:([\w.-]+)/gu).map(match=>match[1]))];

function imageMime(bytes){
  if(bytes.toString('hex',0,8)==='89504e470d0a1a0a')return 'image/png';
  if(bytes.toString('hex',0,3)==='ffd8ff')return 'image/jpeg';
  if(['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6)))return 'image/gif';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return '';
}

export const studyQuestionBase=(bank,identity)=>key('question',bank,identity);
export function validStudyQuestionBase(base){
  try{
    const parts=JSON.parse(base);
    return Array.isArray(parts)&&parts.length===3&&parts[0]==='question'&&parts.slice(1).every(text);
  }catch{return false;}
}
export function studyQuestionId(bank,identity,type,stem,options,pairs,correct){
  return key(studyQuestionBase(bank,identity),version([type,stem,options,pairs,[...correct].sort()]));
}

export function questionMedia(stem,explanation,assets){
  const byId=new Map(list(assets).filter(Boolean).map(asset=>[asset.id,asset]));
  return studyAssetIds(stem,explanation).map(id=>byId.get(id)).filter(Boolean).flatMap(asset=>{
    const mime=asset.mime_type,body=asset.data_base64;
    return imageTypes.test(mime)&&typeof body==='string'&&/^[A-Za-z0-9+/]+={0,2}$/u.test(body)
      ? [{id:asset.id,url:'data:'+mime+';base64,'+body}] : [];
  });
}

export async function cacheStudyImage(asset,fetcher=fetch){
  if(!asset||asset.data_base64||asset.provider!=='git')return asset;
  let url;
  try{url=new URL(asset.url);}catch{return asset;}
  if(url.origin!=='https://raw.githubusercontent.com'||url.username||url.password||url.search||url.hash)return asset;
  const limit=512_000;
  const signal=AbortSignal.timeout(8_000);
  try{
    const response=await fetcher(url,{signal,redirect:'error',credentials:'omit'});
    const mime=response.headers.get('content-type')?.split(';')[0].trim();
    const reader=response.body?.getReader();
    if(!reader)return asset;
    try{
      if(!response.ok||!imageTypes.test(mime)&&mime!=='application/octet-stream'||Number(response.headers.get('content-length'))>limit)return asset;
      const chunks=[];
      let size=0;
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>limit)return asset;
        chunks.push(value);
      }
      const bytes=Buffer.concat(chunks,size);
      const type=imageMime(bytes);
      if(!type||mime!=='application/octet-stream'&&type!==mime||
        asset.sha256&&createHash('sha256').update(bytes).digest('hex')!==asset.sha256.toLowerCase())return asset;
      return {...asset,mime_type:type,data_base64:bytes.toString('base64')};
    }finally{await reader.cancel().catch(()=>{});}
  }catch{return asset;}
}

const japaneseWords=new Intl.Segmenter('ja',{granularity:'word'});
function languageChunks(turn,script){
  if(Array.isArray(turn.chunks)&&turn.chunks.map(part=>part?.t).join('')===turn.b.ja)
    return [...turn.chunks,...list(turn.distractors)].map(part=>part?.t).filter(text);
  if(script.flow!=='dialogue-first-v1')return [];
  const chunks=[];
  for(const {segment} of japaneseWords.segment(turn.b.ja)){
    if(chunks.length&&/^[\s。、！？!?.,「」『』（）()]+$/u.test(segment))chunks[chunks.length-1]+=segment;
    else chunks.push(segment);
  }
  const count=Math.min(2,Math.max(0,Number(script.settings?.distractors)||0));
  return [...chunks,...['しかし','それでも','むしろ','つまり','だから'].filter(word=>!turn.b.ja.includes(word)).slice(0,count)];
}

export function sceneMaterial(scene){
  if(!text(scene?.id)||!text(scene.title)||!text(scene.setting)||!text(scene.roleA)||!text(scene.roleB)||
    !Number.isSafeInteger(scene.revision)||scene.revision<1)throw Error('语言场景不完整');
  const {title,revision,setting:background,roleA,roleB,goal,relationship,atmosphere,boundaries}=scene;
  return {id:key('scene',scene.id),kind:'language',sceneOnly:true,title,revision,background,roleA,roleB,goal,sceneId:scene.id,
    relationship,atmosphere,boundaries,topics:list(scene.topics).filter(text),turns:[]};
}

export function languageMaterial(script){
  const {id,revision,scene,plan,turns}=script??{};
  if(!text(id)||!Number.isSafeInteger(revision)||revision<1||!text(scene?.title)||!text(plan?.background)||
    !Array.isArray(turns)||!turns.length||turns.length>30||turns.some((turn,i)=>turn?.step!==i+1||!text(turn.a?.ja)||!text(turn.b?.ja)))
    throw Error('语言剧本不完整');
  return {id:key('language',id),kind:'language',title:scene.title,revision,background:plan.background,sceneId:scene.id,
    topic:plan.resolvedTopic,roleA:plan.roles?.A||scene.roleA,roleB:plan.roles?.B||scene.roleB,
    goal:scene.goal,closing:script.closing?.ja,turns:turns.map(turn=>({
      id:key('sentence',id,revision,turn.step),type:'sentence',stem:turn.a.ja,meaning:turn.a.zh,
      answer:turn.b.ja,rewrite:turn.b.zh,intent:turn.intentHintZh,
      chunks:languageChunks(turn,script),
      concepts:list(turn.concepts).filter(concept=>text(concept?.id)&&text(concept.span)&&turn.b.ja.includes(concept.span))
        .map(concept=>({id:key('concept',concept.id),label:concept.explanationZh||concept.id})),
    }))};
}

export function bankMaterial(file,{title,tags=[],review=[],attempts=[]}={}){
  if(!text(file?.bank_id)||!Array.isArray(file.questions))throw Error('知序题库文件无效');
  const questions=new Map();
  for(const q of file.questions){
    if(!q||!text(q.id||q.external_id))throw Error('题库包含无效题目编号');
    const identity=q.id||key(file.source_key??'import',q.external_id);
    const base=studyQuestionBase(file.bank_id,identity);
    if(q.status!=='active'){questions.set(base,{base,active:false});continue;}
    if(!text(q.stem)||!['single','multiple','matching'].includes(q.type))throw Error('题库包含无效题目');
    const options=list(q.options).map(option=>({id:option?.id,text:option?.text}));
    const pairs=list(q.pairs).map(pair=>({id:pair?.id,text:pair?.text}));
    const validRows=rows=>rows.every(row=>text(row.id)&&text(row.text))&&new Set(rows.map(row=>row.id)).size===rows.length;
    const matching=q.type==='matching';
    const correct=matching?list(q.answer_pairs).map(row=>text(row?.pair_id)&&text(row?.option_id)?pairChoice(row.pair_id,row.option_id):'')
      :list(q.answer_option_ids);
    if(options.length<2||!validRows(options)||!validRows(pairs)||!correct.length||
      !validSelection({type:q.type,options,pairs},correct)||matching&&correct.length!==pairs.length)throw Error('题库含无效选项或答案');
    const tagIds=list(q.tag_ids).filter(text);
    const media=questionMedia(q.stem,q.explanation,file.images);
    questions.set(base,{id:studyQuestionId(file.bank_id,identity,q.type,q.stem,options,pairs,correct),base,sourceId:identity,externalId:q.external_id,
      type:q.type,title:q.title||q.external_id||'知序原题',stem:q.stem,explanation:q.explanation??'',options,pairs,
      correct,tagIds,media,preserve:q.shuffle_policy==='preserve',active:true});
  }
  return {id:key('bank',file.bank_id),kind:'bank',title:title||file.bank_name||file.bank_id,
    tags:tags.filter(tag=>text(tag?.id)).map(tag=>({id:tag.id,name:tag.name||tag.id,parent:tag.parent_id})),
    review:review.filter(row=>row?.state!=='mastered').map(row=>row.question_id),
    attempted:attempts.map(row=>row?.question_id),questions:[...questions.values()]};
}

export function importStudyMaterials(document){
  const backups=document?.fixed??document;
  if(Array.isArray(backups?.scripts))return [...backups.scripts.map(languageMaterial),
    ...list(backups.scenes).filter(scene=>!scene?.archived).map(sceneMaterial)];
  if(document?.scene&&document?.turns)return [languageMaterial(document)];
  if(document?.setting&&document?.roleA&&!document.archived)return [sceneMaterial(document)];
  if(document?.format_version==='1.0'&&Array.isArray(document.questions))return [{...bankMaterial(document),merge:true}];
  // 知序管理备份的实表按题库拆分。仅提取练习需要的数据。
  const data=document?.content?.tables??document?.tables;
  if(Array.isArray(data?.banks)&&Array.isArray(data.questions))return data.banks.filter(bank=>bank.status==='active').map(bank=>bankMaterial({
    bank_id:bank.id,questions:data.questions.filter(q=>q.bank_id===bank.id),images:data.assets,
  },{title:bank.name,tags:list(data.tags).filter(tag=>!tag.bank_id||tag.bank_id===bank.id),review:list(data.review_state),attempts:list(data.attempts)}));
  throw Error('请选择语言学习剧本、已下载的固定对话备份或知序题库 JSON');
}

export function shuffled(rows,random=Math.random){
  const result=[...rows];
  for(let i=result.length-1;i>0;i--){
    const j=random===Math.random?randomInt(i+1):Math.floor(random()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}

export function gradeQuestion(question,answer){
  const selected=new Set(answer);
  return selected.size===0?'unanswered':selected.size===question.correct.length&&question.correct.every(id=>selected.has(id))?'correct':'wrong';
}

export function validSelection(question,answer){
  if(!Array.isArray(answer)||answer.some(value=>typeof value!=='string')||new Set(answer).size!==answer.length)return false;
  if(question.type!=='matching')return (question.type!=='single'||answer.length<=1)&&answer.every(id=>question.options.some(option=>option.id===id));
  const pairs=new Set();
  return answer.every(value=>{
    const [pair,option]=splitPairChoice(value);
    if(pairs.has(pair)||!question.pairs.some(row=>row.id===pair)||!question.options.some(row=>row.id===option))return false;
    pairs.add(pair);
    return true;
  });
}

export function publicQuestion(question,reveal=false){
  const {id,title,type,stem,options,pairs,media,externalId}=question;
  const refs=new Set(studyAssetIds(stem,reveal?question.explanation:''));
  const images=(media??[]).filter(asset=>refs.delete(asset.id));
  return {id,title,type,stem,options,pairs,externalId,media:images,missingImages:refs.size};
}
