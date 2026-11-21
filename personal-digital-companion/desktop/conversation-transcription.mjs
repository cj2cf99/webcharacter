import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {calendarDate,datePattern as calendarDatePattern,tokyoDate} from './calendar-date.mjs';
import {readInteractionSkill} from './interaction-skills.mjs';
import {prepareMainSiteTask} from '../agent/host/main-site-task-adapter.mjs';

const title='对话内容转录';
const labels={organize:'归纳事项',recover:'逐段核对遗漏',classify:'按模板拟稿',review:'集中复核'};
const enumState=new Set(['occurred','planned','interest','idea','uncertain']);
const categories=new Set(['records.create','resources.create']);
const datePattern=/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d)?$/u;
const localTime=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'short'});
const titleTime=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'medium'});
const graphemes=new Intl.Segmenter('zh-CN',{granularity:'grapheme'});
const finalHeart=/(?:❤[\uFE0E\uFE0F]?\s*)+$/u;
const string=value=>typeof value==='string'?value.trim():'';
const list=value=>Array.isArray(value)?value:[];

function schemaFor(schemas,stage){
  function expand(value){
    if(Array.isArray(value))return value.map(expand);
    if(!value||typeof value!=='object')return value;
    const {$ref,...fields}=value;
    const resolved=$ref?schemas.$defs[$ref.split('/').at(-1)]:{};
    return Object.fromEntries(Object.entries({...resolved,...fields}).map(([key,child])=>[key,expand(child)]));
  }
  return expand(schemas[stage]);
}

function organize(output,turns){
  if(!output||!['actions','requests','signals','recentFactIds'].every(key=>Array.isArray(output[key])))
    throw Error('事项格式无效');
  const sources=new Map(turns.map(turn=>[turn.id,turn.text])),ids=new Set();
  function matters(rows){
    return rows.flatMap(row=>{
      if(!string(row?.id)||ids.has(row.id)||!string(row.summary)||!enumState.has(row.state))return [];
      const evidence=list(row.evidence).flatMap(ref=>{
        const text=sources.get(ref?.sourceId),quote=string(ref?.quote);
        return text?[{sourceId:ref.sourceId,quote:quote&&text.includes(quote)?quote:text}]:[];
      });
      if(!evidence.length)return [];
      ids.add(row.id);
      return [{id:row.id,summary:row.summary,subject:row.subject,state:row.state,intent:row.intent,
        timeText:string(row.timeText),conditions:list(row.conditions).map(string).filter(Boolean),evidence}];
    });
  }
  const actions=matters(output.actions),requests=matters(output.requests),signals=matters(output.signals);
  const recentFactIds=output.recentFactIds.filter(id=>actions.some(item=>item.id===id&&item.subject==='user'&&item.state==='occurred'));
  const fixed=[];
  const corrected=turns.some(turn=>/说错了|不是我|更正|开玩笑|并没有/u.test(turn.text));
  for(const turn of turns){
    const occurred=!corrected&&!/[？?]/u.test(turn.text)&&/^(昨天|今天)\s*我(?:刚|早上|中午|晚上)?\s*(跑了[^，。；！？]+|跑步了|吃了[^，。；！？]+|喝了[^，。；！？]+)(?=[，。；！？]|$)/u.exec(turn.text.trim());
    if(occurred){
      const [quote,day,activity]=occurred;
      const type=activity.startsWith('跑')?'hu-shi.exercise.create':'hu-shi.food.create';
      let item=actions.find(item=>item.evidence.some(ref=>ref.sourceId===turn.id&&quote.includes(ref.quote)));
      if(!item){
        item={id:'fact-'+turn.id,summary:quote,subject:'user',state:'occurred',intent:'none',timeText:day,
          conditions:[],evidence:[{sourceId:turn.id,quote}]};actions.push(item);
      }
      recentFactIds.push(item.id);fixed.push({type,matterId:item.id,params:{body:quote}});
    }
    const reminder=/^(今天|明天|后天)\s*提醒我\s*([^，。；！？]+)(?:[，,]([^。；！？]+))?[。！]?$/u.exec(turn.text.trim());
    if(reminder){
      const [quote,day,heading,condition]=reminder;
      const conditions=condition?[condition]:[];
      let item=requests.find(item=>item.evidence.some(ref=>ref.sourceId===turn.id&&quote.includes(ref.quote)));
      if(!item){
        item={id:'reminder-'+turn.id,summary:heading,subject:'user',state:'planned',intent:'explicit',timeText:day,
          conditions,evidence:[{sourceId:turn.id,quote}]};requests.push(item);
      }
      fixed.push({type:'reminders.create',matterId:item.id,params:{title:heading,content:condition,deadline:calendarDate(day,tokyoDate(turn.at))}});
    }
    const url=turn.text.match(/https?:\/\/[^\s，。！？；]+/iu)?.[0];
    const interest=url&&/^我(?:很|挺|比较)?(?:喜欢|对[^。]+感兴趣|想收藏|想保留|想留着)/u.test(turn.text.trim());
    const project=/^我(?:还)?想给([^，。；！？]{1,35}?)(?:新增|增加|加入|加)([^，。；！？]{1,160})[。！]?$/u.exec(turn.text.trim());
    if(interest||project){
      let item=signals.find(item=>item.evidence.some(ref=>ref.sourceId===turn.id));
      if(!item){
        item={id:'signal-'+turn.id,summary:turn.text,subject:'user',state:interest?'interest':'idea',intent:'inferred',timeText:'',
          conditions:[],evidence:[{sourceId:turn.id,quote:turn.text}]};signals.push(item);
      }
      fixed.push({type:interest?'resources.create':'records.create',matterId:item.id,params:interest?
        {title:'感兴趣的网站',body:turn.text,url}:{body:turn.text}});
    }
  }
  return {summary:string(output.summary),actions,requests,signals,recentFactIds:[...new Set(recentFactIds)],fixed};
}

const recoveredTypes={food:'hu-shi.food.create',exercise:'hu-shi.exercise.create',event:'hu-shi.event.create',
  reminder:'reminders.create',note:'records.create',resource:'resources.create'};

function recoverMatters(output,summary,turns){
  if(!output||turns.some(turn=>!output[turn.id]||typeof output[turn.id].title!=='string'||typeof output[turn.id].body!=='string'||
      !['fact','skip',...Object.keys(recoveredTypes)].includes(output[turn.id].kind)))throw Error('逐段核对未覆盖原话');
  for(const turn of turns){
    const {kind:classified,title:heading,body}=output[turn.id];
    const mealFact=classified==='fact'&&/吃喝|饮食|进食|用餐|[早午晚][餐饭]/u.test(heading)&&
      /(?:吃|喝|煮|炒|热|做)了/u.test(turn.text);
    const kind=mealFact?'food':classified;
    if(kind==='skip')continue;
    const occurred=['fact','food','exercise','event'].includes(kind);
    const reminder=kind==='reminder';
    const today=tokyoDate(turn.at);
    const dates=reminder?[...new Set([...turn.text.matchAll(new RegExp(calendarDatePattern+'|今晚|明早|明晚','gu'))]
      .map(([value])=>value))].flatMap(value=>{
        try{
          const date=calendarDate(value==='今晚'?'今天':['明早','明晚'].includes(value)?'明天':value,today);
          return date>=today?[{value,date}]:[];
        }catch{return [];}
      }):[];
    const resolved=new Set(dates.map(item=>item.date)).size===1?dates[0]:null;
    const quantityPattern=/\d+(?:[.,，]\d+)*/gu;
    const suppliedNumbers=new Set(string(body).match(quantityPattern)??[]);
    const hasAllNumbers=!occurred||(turn.text.match(quantityPattern)??[]).every(value=>suppliedNumbers.has(value));
    const draftText=hasAllNumbers&&string(body)||turn.text;
    const diaryText=draftText!==turn.text&&string(heading)?heading+'：'+draftText:draftText;
    const id='recovered-'+turn.id,type=recoveredTypes[kind];
    const entry={id,summary:string(heading)||turn.text,subject:'user',state:occurred?'occurred':reminder?'planned':kind==='resource'?'interest':'idea',
      intent:occurred?'none':'inferred',timeText:resolved?.value??'',conditions:[],diaryText,evidence:[{sourceId:turn.id,quote:turn.text}]};
    if(occurred){summary.actions.push(entry);summary.recentFactIds.push(id);}
    else if(reminder)summary.requests.push(entry);
    else summary.signals.push(entry);
    if(!type)continue;
    let params=kind==='event'?{}:{body:draftText};
    if(reminder)params={title:string(heading),content:draftText,deadline:resolved?.date};
    if(kind==='resource')params={title:string(heading),body:draftText,url:turn.text.match(/https?:\/\/[^\s，。！？；]+/iu)?.[0]};
    summary.fixed.push({type,matterId:id,params});
  }
  return summary;
}

function draftCandidates(output,summary,turns,templates){
  if(!output||!Array.isArray(output.candidates)||!Array.isArray(output.notes))throw Error('登记草稿格式无效');
  const matters=new Map([...summary.actions,...summary.requests,...summary.signals].map(item=>[item.id,item]));
  const ids=new Set(),dedupe=new Set();
  const rows=output.candidates.flatMap(candidate=>{
    const id=string(candidate?.id),type=candidate?.type;
    const template=Object.hasOwn(templates,type)?templates[type]:null;
    const related=[...new Set(list(candidate?.matterIds))].filter(key=>matters.has(key));
    if(!template||!id||ids.has(id)||!related.length)return [];
    const key=JSON.stringify([type,related.slice().sort()]);
    if(dedupe.has(key))return [];
    dedupe.add(key);ids.add(id);
    const allowed=new Set([...template.required,...(template.optional??[]),...(template.optionalFromSource??[])]);
    const params={...template.defaults};
    for(const [field,value] of Object.entries(candidate.params??{})){
      if(allowed.has(field)&&field!=='category_id'&&string(value))params[field]=string(value);
    }
    const diaryFallback=type==='diaries.create'&&!params.title;
    if(diaryFallback)params.title=related.map(key=>matters.get(key).summary).join('、');
    const missing=list(candidate.missing).map(string).filter(item=>item&&item!=='category_id'&&!(item==='title'&&params.title));
    const evidence=related.flatMap(key=>matters.get(key).evidence);
    const conditions=new Set(list(candidate.conditions).map(string).filter(Boolean));
    if(params.reflection&&!evidence.some(ref=>ref.quote.includes(params.reflection)))delete params.reflection;
    const timing=related.map(key=>matters.get(key).timeText).filter(Boolean).join('、');
    if(type==='reminders.create'){
      if(!['高','中','低'].includes(params.level))params.level='中';
      const anchors=(summary.fixed??[]).filter(item=>item.type===type&&related.includes(item.matterId));
      if(anchors.length===1){
        const {title:heading,deadline,content}=anchors[0].params;
        if(!params.title&&heading)params.title=heading;
        if(params.deadline?.slice(0,10)!==deadline)params.deadline=deadline;
        if(content&&!params.content?.includes(content))params.content=content;
        if(content&&evidence.some(ref=>ref.quote.includes(content)))conditions.add(content);
      }
      if(params.deadline){
        const day=params.deadline.slice(0,10),date=new Date(day+'T00:00:00Z');
        if(!datePattern.test(params.deadline)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==day){
          delete params.deadline;missing.push('有效提醒时间');
        }
      }
    }
    if(type==='resources.create'&&params.url&&(!/^https?:\/\/[^\s]+$/iu.test(params.url)||!turns.some(turn=>turn.text.includes(params.url)))){
      delete params.url;
    }
    if(type==='resources.create'&&params.url&&params.body===params.url)params.body=evidence.map(ref=>ref.quote).join('\n');
    for(const field of template.required)if(field!=='category_id'&&!string(params[field]))missing.push(field);
    const sources=list(candidate.fieldSources).filter(item=>Object.hasOwn(params,item?.field)&&['explicit','inferred','default'].includes(item.kind));
    if(diaryFallback)sources.push({field:'title',kind:'default',basis:'已有事项归纳'});
    const namedCategory=string(candidate.categoryLabel);
    const explicitCategory=namedCategory&&evidence.some(ref=>ref.quote.includes('分类'+namedCategory)||ref.quote.includes('分类：'+namedCategory));
    return [{id,type,label:template.label,params,categoryLabel:categories.has(type)?(explicitCategory?namedCategory:template.catalogDefaults.category_id):undefined,
      conditions:[...conditions],dependsOn:list(candidate.dependsOn).slice(0,1),
      missing:[...new Set(missing)],sources,evidence,timing,previewNote:template.previewNote,related}];
  });
  for(const {type,matterId,params} of summary.fixed??[]){
    if(rows.some(row=>row.type===type&&row.related.includes(matterId)&&!row.missing.length))continue;
    const matter=matters.get(matterId);
    const template=templates[type];
    const supplied={...template.defaults,...Object.fromEntries(Object.entries(params).filter(([,value])=>value))};
    rows.push({id:'fixed-'+matterId,type,label:template.label,related:[matterId],params:supplied,
      conditions:matter.conditions,dependsOn:[],missing:template.required.filter(field=>field!=='category_id'&&!supplied[field]),
      sources:Object.keys(params).filter(field=>params[field]).map(field=>({field,
        kind:matterId.startsWith('recovered-')&&['title','body','content'].includes(field)?'inferred':'explicit',basis:'用户发言'})),
      evidence:matter.evidence,timing:matter.timeText,categoryLabel:template.catalogDefaults?.category_id});
  }
  for(const row of rows){
    if(row.dependsOn.some(id=>id===row.id||!ids.has(id)))row.missing.push('前置登记');
  }
  // 专项候选不会替代有根据的个人日记。
  const covered=new Set(rows.filter(row=>row.type==='diaries.create'&&!row.missing.length).flatMap(row=>row.related));
  const remaining=summary.recentFactIds.filter(id=>!covered.has(id));
  if(remaining.length){
    const facts=remaining.map(id=>matters.get(id));
    rows.push({id:'local-diary-'+crypto.randomUUID(),type:'diaries.create',label:'个人日记',related:remaining,
      params:{title:facts.map(item=>item.summary).join('、'),
        content:facts.map(item=>item.diaryText??item.draftText??item.evidence.map(ref=>ref.quote).join('')).join('\n')},
      conditions:[],dependsOn:[],missing:[],sources:[{field:'title',kind:'default',basis:'已有事项归纳'}],
      evidence:facts.flatMap(fact=>fact.evidence)});
  }
  return {rows,notes:output.notes.map(string).filter(Boolean)};
}

function titleTopic(value){
  return string(value).replace(/\s+/gu,' ')
    .replace(/(?:\s*·\s*绯月助记|绯月助记-\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})+$/u,'')
    .replace(/[\[\]【】]/gu,'').trim();
}

function formatEntry(draft,format,stamp){
  if(!format)return draft;
  const row={...draft,params:{...draft.params},missing:[...draft.missing],sources:[...draft.sources]};
  const {params}=row,{bodyField,bodyLabel}=format;
  const bodyLabelPattern=new RegExp(`^${bodyLabel}(?:[：:]\\s*|\\n)`,'u');
  let body=string(params[bodyField]).replace(/\r\n?/gu,'\n').replace(finalHeart,'').replace(bodyLabelPattern,'').trim();
  let topic=titleTopic(params.title);

  if(!topic&&row.type==='diaries.create'&&body){
    topic=titleTopic(body);
    row.sources.push({field:'title',kind:'default',basis:'日记正文前十个可见字符'});
  }
  if(row.type==='reminders.create'){
    const conditions=row.conditions.filter(condition=>row.evidence.some(ref=>ref.quote.includes(condition)));
    if(topic&&(!body||conditions.includes(body)))body=topic;
    const additions=conditions.filter(condition=>!body.includes(condition));
    if(!topic&&body){
      topic=titleTopic(body);
      row.sources.push({field:'title',kind:'default',basis:'提醒正文前十个可见字符'});
    }
    if(body&&additions.length)body+='\n\n准备条件\n'+additions.join('\n');
  }

  if(format.title){
    if(topic){
      const summary=[...graphemes.segment(topic)].slice(0,10).map(item=>item.segment).join('').trimEnd();
      params.title=`[${summary}]绯月助记-${stamp}`;
      row.missing=row.missing.filter(field=>field!=='title');
      if(params.title.length>format.titleLimit)row.missing.push('标题超出登记上限');
    }else{
      delete params.title;
      if(!row.missing.includes('title'))row.missing.push('title');
    }
  }
  if(body){
    params[bodyField]=bodyLabel+'\n'+body.replace(finalHeart,'').trimEnd()+'\n❤️';
    row.missing=row.missing.filter(field=>field!==bodyField);
    if(params[bodyField].length>format.bodyLimit)row.missing.push('正文超出登记上限');
  }else{
    delete params[bodyField];
    if(!row.missing.includes(bodyField))row.missing.push(bodyField);
  }
  return row;
}

function withRegistrationDiary(rows,work,turns){
  const entries=turns.filter(turn=>turn.registration===true);
  if(!entries.length)return rows;
  const registered=new Set();
  for(const [index,turn] of turns.entries())if(turn.registration===true)registered.add(`u${index+1}`);
  const isRegistered=ref=>registered.has(ref.sourceId.split('-')[0]);
  const original=work.flatMap(part=>part.turns.filter(isRegistered).map(turn=>({sourceId:turn.sourceId,quote:turn.text})));
  const diaries=rows.filter(row=>row.type==='diaries.create');
  const verified=diaries.filter(row=>!row.missing.length);
  const evidence=[...original];
  const seen=new Set();
  const additional=[];
  for(const row of verified)for(const ref of row.evidence){
    const key=JSON.stringify([ref.sourceId,ref.quote]);
    if(isRegistered(ref)||seen.has(key))continue;
    seen.add(key);evidence.push(ref);additional.push(ref.quote);
  }
  const proposed=verified.find(row=>row.evidence.some(isRegistered));
  const matter=work.flatMap(({summary})=>[...summary.actions,...summary.requests,...summary.signals])
    .find(item=>item.evidence.some(isRegistered));
  const id=diaries[0]?.id??'registration-diary';
  const merged=new Set(diaries.map(row=>row.id));
  const diary={id,type:'diaries.create',label:'个人日记',params:{title:proposed?.params.title||matter?.summary,
    content:[...entries.map(turn=>turn.text.trim()),...additional].join('\n\n')},
    conditions:[],dependsOn:proposed?.dependsOn.filter(parent=>!merged.has(parent))??[],missing:[],evidence,
    sources:[{field:'content',kind:'explicit',basis:'登记模式提交的原文'}]};
  return [diary,...rows.filter(row=>!merged.has(row.id)).map(row=>({...row,
    dependsOn:row.dependsOn.map(parent=>merged.has(parent)?id:parent)}))];
}

async function transcribe(data,model,skill,save,signal){
  const {turns}=data,templates=skill.templates.templates;
  const stamp=titleTime.format(turns[0].at);
  for(const turn of turns)turn.tokyo=localTime.format(turn.at)+' JST';
  const text=turns.flatMap(({text,tokyo,reply},index)=>text.split(/\r?\n/u).map(string).filter(Boolean).map((paragraph,part)=>({
    sourceId:`u${index+1}${part?'-'+(part+1):''}`,speaker:'user',text:paragraph,tokyo,...(!part&&reply?{reply:reply.slice(0,360)}:{})})));
  function run(call,stage,input,maxTokens){
    let schema=schemaFor(skill.schemas,stage);
    if(stage==='recover')schema={type:'object',additionalProperties:false,required:input.reviewIds,
      properties:Object.fromEntries(input.reviewIds.map(id=>[id,schema]))};
    if(stage==='classify'&&input.organized.recentFactIds.length)schema.properties.candidates.minItems=1;
    return call(JSON.stringify(input),{schema,instruction:skill.localAi[stage],
      skill:{name:skill.skill,version:skill.version},maxTokens}).then(result=>{
      if(result?.error)throw Error(result.error);
      return result;
    });
  }
  return model.withWorkSession(data.id,signal,async call=>{
    if(!data.work.length){
      let part=[],size=0;
      for(const entry of text){
        if(size+entry.text.length>3000&&part.length){data.work.push({turns:part});part=[];size=0;}
        part.push(entry);size+=entry.text.length;
      }
      if(part.length)data.work.push({turns:part});
    }
    const menu=Object.entries(templates).map(([type,t])=>({type,useWhen:t.useWhen,required:t.required,
      defaults:t.defaults,catalogDefaults:t.catalogDefaults}));
    for(const [index,part] of data.work.entries()){
      signal.throwIfAborted();
      const basis=part.turns.map(entry=>({...entry,id:entry.sourceId,at:turns[Number(entry.sourceId.slice(1).split('-')[0])-1].at}));
      if(!part.summary){
        save('organize');
        part.summary=organize(await run(call,'organize',{turns:part.turns},1450),basis);
        save('organize');
      }
      const {summary}=part;
      if(!part.recovered&&summary.actions.length+summary.requests.length+summary.signals.length===0){
        save('recover');
        const recoveryBudget=Math.min(2400,500+part.turns.reduce((size,turn)=>size+Math.max(95,turn.text.length),0));
        const recovered=await run(call,'recover',{turns:part.turns,reviewIds:basis.map(turn=>turn.id)},recoveryBudget);
        part.summary=recoverMatters(recovered,summary,basis);
        part.recovered=true;save('recover');
      }
      if(summary.actions.length+summary.requests.length+summary.signals.length===0){part.result={rows:[],notes:[]};continue;}
      if(!part.drafted){
        save('classify');
        const proposed=part.recovered?{candidates:[],notes:[]}:
          await run(call,'classify',{turns:part.turns,organized:summary,templates:menu},1900);
        part.drafted=draftCandidates(proposed,summary,basis,templates);
        save('classify');
      }
      if(!part.result){
        save('review');
        const candidates=part.recovered?part.drafted.rows.map(({id,type,params,evidence,missing})=>({id,type,
          sourceIds:[...new Set(evidence.map(ref=>ref.sourceId))],params,missing})):
          part.drafted.rows;
        const review=await run(call,'review',part.recovered?{turns:part.turns,candidates}:{turns:part.turns,organized:summary,candidates},700);
        if(!Array.isArray(review?.issues))throw Error('复核格式无效');
        let draft=part.drafted;
        const missing=review.issues.filter(issue=>issue.kind==='missing'&&issue.target==='matter'&&
          !draft.rows.some(row=>row.related.includes(issue.id)));
        const blocking=review.issues.filter(issue=>issue.target==='candidate'&&issue.kind!=='missing');
        if(part.recovered){
          for(const row of draft.rows)if(blocking.some(issue=>issue.id===row.id))row.missing.push('内容待核对');
        }else if((missing.length||blocking.length)&&signal.aborted===false){
          const affected=new Set([...missing.map(issue=>issue.id),...draft.rows.filter(row=>blocking.some(issue=>issue.id===row.id)).flatMap(row=>row.related)]);
          const focused=Object.fromEntries(['actions','requests','signals'].map(key=>[key,summary[key].filter(item=>affected.has(item.id))]));
          focused.recentFactIds=summary.recentFactIds.filter(id=>affected.has(id));
          focused.fixed=summary.fixed.filter(item=>affected.has(item.matterId));
          const revised=draftCandidates(await run(call,'classify',{turns:part.turns,organized:focused,templates:menu,
            feedback:[...missing,...blocking]},1450),focused,basis,templates);
          const checked=await run(call,'review',{turns:part.turns,organized:focused,candidates:revised.rows},500);
          if(!Array.isArray(checked?.issues))throw Error('补正复核格式无效');
          draft={rows:[...draft.rows.filter(row=>!blocking.some(issue=>issue.id===row.id)),...revised.rows],notes:[...draft.notes,...revised.notes]};
          for(const row of revised.rows)if(checked.issues.some(issue=>issue.target==='candidate'&&issue.id===row.id))row.missing.push('内容待核对');
        }
        for(const row of draft.rows)for(const issue of review.issues.filter(item=>item.target==='candidate'&&item.id===row.id&&item.kind==='missing')){
          row.missing.push(string(issue.detail)||'内容待补充');
        }
        const keys=new Map(draft.rows.map((row,position)=>[row.id,`${index+1}-${position+1}`]));
        part.result={rows:draft.rows.map((row,position)=>({...row,id:`${index+1}-${position+1}`,
          dependsOn:row.dependsOn.map(id=>keys.get(id)??'missing')})),notes:draft.notes};
        save('review');
      }
    }
    const drafts=withRegistrationDiary(data.work.flatMap(part=>part.result.rows),data.work,turns);
    const rows=drafts.map(row=>formatEntry(row,templates[row.type].format,stamp));
    const unique=new Set();
    const kept=rows.filter(row=>{
      const key=JSON.stringify([row.type,row.evidence.map(ref=>ref.sourceId+':'+ref.quote).sort(),row.params]);
      if(unique.has(key))return false;
      unique.add(key);return true;
    });
    const byKey=new Map(kept.map(row=>[row.id,row]));
    for(const row of kept){
      const checked=new Set([row.id]);
      let parent=row.dependsOn[0];
      while(parent){
        const target=byKey.get(parent);
        if(!target||checked.has(parent)||target.missing.length){row.missing.push('有效的前置登记');break;}
        checked.add(parent);parent=target.dependsOn[0];
      }
    }
    return {rows:kept,notes:[...new Set(data.work.flatMap(part=>part.result.notes))],
    summaries:data.work.map(part=>part.summary)};
  });
}

export async function prepareConversationBatch(rows,request,now=Date.now){
  if(!request)throw Error('尚未配置登记连接，已确认清单保留在本机');
  const response=await request('/api/assistant/recording-plan',{method:'GET',cache:'no-store'});
  if(!response.ok)throw Error('登记模板暂不可读取，稍后可用原清单重试');
  const {catalog,categories:recordCategories,resourceCategories}=await response.json();
  const definitions=new Map(list(catalog).map(item=>[item.type,item]));
  const missing=[],nodes=[];
  for(const row of rows){
    const definition=definitions.get(row.type),params={...row.params};
    if(row.categoryLabel){
      const directory=row.type==='resources.create'?resourceCategories:recordCategories;
      const category=list(directory).find(item=>item.name===row.categoryLabel);
      if(!category){missing.push({id:row.id,message:'目录中暂未找到「'+row.categoryLabel+'」'});continue;}
      params.category_id=category.id;
    }
    if(params.deadline&&(params.deadline.slice(0,10)<tokyoDate(now())||
      params.deadline.includes('T')&&Date.parse(params.deadline+'+09:00')<=now())){
      missing.push({id:row.id,message:'提醒日期已过，请另行确认新日期'});continue;
    }
    try{
      prepareMainSiteTask({task_id:row.id,type:row.type,params,target_device_id:null,
        definition:{...definition,executor:'cloud'}});
    }catch{
      missing.push({id:row.id,message:'当前登记模板尚无法接收这些字段'});continue;
    }
    nodes.push({key:row.id,type:row.type,params,target_device_id:null,...(row.dependsOn.length?{depends_on:row.dependsOn[0]}:{})});
  }
  return {missing,plan:{pending:[],chain:{name:title,nodes}}};
}

export function createConversationTranscription({profile,safeStorage,model,registration,prepareBatch,canStart=()=>true,
  changed=()=>{},notify=()=>{},loadSkill=()=>readInteractionSkill('conversationTranscription'),now=Date.now}){
  const db=new DatabaseSync(join(profile,'conversation-transcription.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS transcriptions (
    id TEXT PRIMARY KEY, state TEXT NOT NULL, at INTEGER NOT NULL, payload BLOB NOT NULL, summary TEXT NOT NULL DEFAULT '{}')`);
  if(!db.prepare('PRAGMA table_info(transcriptions)').all().some(column=>column.name==='summary'))
    db.exec("ALTER TABLE transcriptions ADD COLUMN summary TEXT NOT NULL DEFAULT '{}'");
  const read=db.prepare('SELECT * FROM transcriptions WHERE id=?');
  const write=db.prepare(`INSERT INTO transcriptions VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    state=excluded.state,at=excluded.at,payload=excluded.payload,summary=excluded.summary`);
  const decode=row=>row&&{...JSON.parse(safeStorage.decryptString(Buffer.from(row.payload))),id:row.id,state:row.state,at:row.at};
  const get=id=>decode(read.get(id));
  const save=(job,state)=>{
    const {id,at,state:prior,...data}=job;
    const summary={stage:job.stage,durationMs:job.durationMs,count:job.result?.rows.length??0};
    write.run(id,state,at,safeStorage.encryptString(JSON.stringify(data)),JSON.stringify(summary));job.state=state;
  };
  const waiting=db.prepare("SELECT * FROM transcriptions WHERE state IN ('queued','approved') ORDER BY at LIMIT 1");
  let active=null,running=null,timer=null,closed=false;
  for(const row of db.prepare("SELECT * FROM transcriptions WHERE state IN ('open','running','submitting')").all()){
    const job=decode(row);
    job.closedAt??=now();save(job,row.state==='submitting'?'approved':'queued');
  }
  function status(job){return {id:job.id,state:job.state,at:job.at,stage:job.stage,error:job.error,
    durationMs:job.durationMs,count:job.result?.rows.length??0};}
  function kick(ms=0){
    if(closed||timer||running||!waiting.get())return;
    timer=setTimeout(()=>{timer=null;pump();},ms);timer.unref?.();
  }
  async function execute(job){
    if(job.state==='approved'){
      save(job,'submitting');changed();
      try{
        const prepared=job.plan?{plan:job.plan}:await prepareBatch(job.result.rows.filter(row=>job.selected.includes(row.id)));
        if(prepared.missing?.length){
          for(const item of prepared.missing){
            const row=job.result.rows.find(row=>row.id===item.id);
            row.prepareError=item.message;
          }
          save(job,'ready');changed();return;
        }
        job.plan=prepared.plan;save(job,'submitting');
        const result=await registration.submitBatch(job.id,job.plan,job.submissionId,id=>{
          job.submissionId=id;save(job,'submitting');
        });
        job.receipts=result.chain?.nodes.map(({current_task:task,key,skipped})=>({key,
          status:skipped?'SKIPPED':task?.status,recordId:task?.result?.record_id,error:task?.error}));
        job.error=result.status==='needs_decision'?'有项目失败，可从原登记链继续、跳过或停止。':undefined;
        save(job,result.status==='completed'?'done':result.status==='stopped'?'discarded':'submit-pending');
      }catch(error){job.error=error.message;save(job,'submit-pending');}
      changed();return;
    }
    active={id:job.id,title,stage:'正在准备本机模型'};
    save(job,'running');changed();
    try{
      const skill=await loadSkill();
      const signal=AbortSignal.timeout(skill.localAi.policy.timeBudgetMs);
      job.result=await transcribe(job,model,skill,phase=>{
        job.stage=active.stage=labels[phase];save(job,'running');changed();
      },signal);
      job.durationMs=now()-job.closedAt;job.error=undefined;
      save(job,job.result.rows.length?'ready':'empty');
      if(job.result.rows.length)try{notify(status(job));}catch{/* 任务管理仍可查看已保存的结果。 */}
    }catch(error){
      job.error=error.message;job.durationMs=now()-job.closedAt;
      save(job,error.code==='LOCAL_AI_BUSY'?'queued':'failed');
    }finally{active=null;changed();}
  }
  function pump(){
    if(closed||running)return;
    const job=decode(waiting.get());
    if(!job)return;
    if(!canStart(job.state)||model.isBusy?.()){kick(300);return;}
    running=execute(job).finally(()=>{running=null;changed();kick(150);});
  }
  function allowedId(id){if(typeof id!=='string'||!/^[\w-]{1,128}$/u.test(id))throw Error('作业编号无效');}
  return {
    turn(id,turn){
      if(closed)return;
      const job=get(id)??{id,at:turn.at,turns:[],work:[],state:'open'};
      if(job.state!=='open')return;
      if(!job.turns.some(item=>item.id===turn.id)){job.turns.push(turn);save(job,'open');}
    },
    reply(id,turnId,reply){
      if(closed)return;
      const job=get(id),turn=job?.turns.find(item=>item.id===turnId);
      if(turn&&job.state==='open'&&string(reply)){turn.reply=reply;save(job,'open');}
    },
    seal(id){
      if(closed)return;
      const job=get(id);if(job?.state!=='open')return;
      job.closedAt=now();save(job,'queued');changed();kick();
    },
    list(){return db.prepare(`SELECT id,state,at,summary FROM transcriptions WHERE state NOT IN ('open','discarded')
      ORDER BY state IN ('done','empty'),at DESC LIMIT 50`).all().map(({summary,...row})=>({...row,...JSON.parse(summary)}));},
    detail(id){
      allowedId(id);const job=get(id);if(!job||job.state==='open')throw Error('找不到这条转录');
      return {...status(job),result:job.result,selected:job.selected,receipts:job.receipts};
    },
    decide({id,selected}={}){
      allowedId(id);const job=get(id);
      if(!job||!Array.isArray(selected)||new Set(selected).size!==selected.length)throw Error('当前清单不可确认，请重新打开');
      if(job.state!=='ready'){
        if(job.selected?.length===selected.length&&selected.every(key=>job.selected.includes(key)))return status(job);
        throw Error('当前清单不可确认，请重新打开');
      }
      const rows=job.result.rows.filter(row=>selected.includes(row.id));
      if(rows.length!==selected.length||rows.some(row=>row.missing.length||row.dependsOn.some(parent=>!selected.includes(parent))))
        throw Error('选择含缺项，或尚未勾选对应前置登记');
      job.selected=selected;job.error=undefined;save(job,selected.length?'approved':'discarded');changed();kick();return status(job);
    },
    retry(id){
      allowedId(id);const job=get(id);
      if(!job||!['failed','submit-pending'].includes(job.state))throw Error('这条作业当前无需重试');
      job.error=undefined;save(job,job.state==='failed'?'queued':'approved');changed();kick();
    },
    start:kick,get active(){return active;},get busy(){return Boolean(running);},settled:()=>running,
    formalCount:()=>db.prepare("SELECT count(*) AS total FROM transcriptions WHERE state IN ('queued','running','approved','submitting')").get().total,
    async close(){closed=true;clearTimeout(timer);await running;db.close();},
  };
}
