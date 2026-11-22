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
const missingDependency='有效的前置登记';
const pastDeadline=(deadline,now)=>deadline.slice(0,10)<tokyoDate(now)
  ||deadline.includes('T')&&Date.parse(deadline+'+09:00')<=now;

function checkDependencies(rows){
  const byKey=new Map(rows.map(row=>[row.id,row]));
  for(const row of rows)row.missing=row.missing.filter(item=>item!==missingDependency);
  for(const row of rows){
    const checked=new Set([row.id]);
    let parent=row.dependsOn[0];
    while(parent){
      const target=byKey.get(parent);
      if(!target||checked.has(parent)||target.missing.length){row.missing.push(missingDependency);break;}
      checked.add(parent);parent=target.dependsOn[0];
    }
  }
}

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

function organize(output,turns,strict=false){
  if(!output||!['actions','requests','signals','recentFactIds'].every(key=>Array.isArray(output[key])))
    throw Error('事项格式无效');
  const sources=new Map(turns.map(turn=>[turn.id,turn.text])),ids=new Set();
  function matters(rows){
    return rows.flatMap(row=>{
      if(!string(row?.id)||ids.has(row.id)||!string(row.summary)||!enumState.has(row.state))return [];
      const evidence=list(row.evidence).flatMap(ref=>{
        const text=sources.get(ref?.sourceId),quote=string(ref?.quote);
        return text&&(!strict||quote&&text.includes(quote))?[{sourceId:ref.sourceId,quote:quote&&text.includes(quote)?quote:text}]:[];
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
    checkDependencies(kept);
    return {rows:kept,notes:[...new Set(data.work.flatMap(part=>part.result.notes))],
    summaries:data.work.map(part=>part.summary)};
  });
}

const budgetFailure=error=>/LOCAL_AI_(?:BATCH_BUDGET|CONTEXT_BUDGET|OUTPUT_BUDGET|RESULT_INVALID)/u.test(error.code??error.message);
const adaptiveUnderflow='LOCAL_AI_ADAPTIVE_OUTPUT_BUDGET';
function threadSections(text,limit=620){
  const parts=[];
  let rest=Array.from(text);
  while(rest.length>limit){
    let end=limit;
    while(end>Math.floor(limit/2)&&!/[。！？，；\r\n]/u.test(rest[end-1]))end--;
    if(end<=Math.floor(limit/2))end=limit;
    parts.push(rest.slice(0,end).join(''));rest=rest.slice(end);
  }
  if(rest.length)parts.push(rest.join(''));
  return parts;
}
function candidateSignature(row){
  const {title,...params}=row.params;
  return JSON.stringify([row.type,title?.replace(/^\[([^\]]*)\]绯月助记-.*$/u,'$1'),params,row.evidence.map(item=>item.quote).toSorted()]);
}

async function transcribeThread(job,model,skill,save){
  const templates=skill.templates.templates;
  const menu=Object.entries(templates).map(([type,t])=>({type,useWhen:t.useWhen,required:t.required,defaults:t.defaults}));
  const history=job.history.slice(-4).map(({who,at,text})=>({speaker:who,text:text.slice(0,110),tokyo:localTime.format(at)+' JST'}));
  const turns=job.turns.flatMap(({id,at,text,handled,reference,backgroundRegistration})=>threadSections(text)
    .map((part,index)=>({sourceId:id+'-'+index,speaker:'user',text:part,tokyo:localTime.format(at)+' JST',at,
      handled:handled&&!backgroundRegistration||reference})));
  let calls=0;
  async function step(key,stage,input,instruction,maxTokens,validate){
    const attempt=job.steps[key]??={id:job.id+'-'+key,input,state:'waiting',attempts:[]};
    if(attempt.state==='done')return attempt.output;
    if(attempt.state==='split')throw Object.assign(Error(attempt.error),{code:attempt.error});
    if(calls>=2)throw Object.assign(Error('等待下一个整理时隙'),{code:'THREAD_STAGE_YIELD'});
    calls++;
    const priorAttempts=(attempt.attempts??=[]).slice(attempt.manualFrom??0);
    const fullOutputBudget=priorAttempts.some(item=>item.error===adaptiveUnderflow);
    const call={at:Date.now(),state:'running',fullOutputBudget};
    (attempt.attempts??=[]).push(call);
    const signal=AbortSignal.timeout(55000);
    attempt.state='running';save(stage);
    try{
      const output=await model.memory(JSON.stringify(attempt.input),instruction,schemaFor(skill.schemas,stage),signal,
        {name:skill.skill,version:skill.version,stage,aiPriority:4,aiBudget:45000,aiTier:'4',boundedOutput:true,backgroundBudget:true,
          adaptiveOutput:stage,fullOutputBudget,maxTokens});
      call.raw=output;
      if(!output||output.error)throw Object.assign(Error(output?.error??'模型未返回结果'),{code:output?.error});
      attempt.output=validate(output);call.state=attempt.state='done';delete attempt.error;save(stage);return attempt.output;
    }catch(error){
      if(error.code==='LOCAL_AI_GPU_DEFERRED'){
        call.state=attempt.state='waiting';call.error=error.code;save(stage);throw error;
      }
      call.state=attempt.state=error.code==='LOCAL_AI_BATCH_BUDGET'?'split':'failed';attempt.error=call.error=error.code??error.message;
      error.stepsExhausted=attempt.attempts.slice(attempt.manualFrom??0).filter(item=>item.state==='failed'||item.state==='unknown').length>=3;
      save(stage);throw error;
    }
  }
  function splitRows(summary,items){
    const ids=new Set(items.map(item=>item.id));
    return {...summary,...Object.fromEntries(['actions','requests','signals'].map(key=>[key,summary[key].filter(item=>ids.has(item.id))])),
      recentFactIds:summary.recentFactIds.filter(id=>ids.has(id)),fixed:summary.fixed.filter(item=>ids.has(item.matterId))};
  }
  async function draft(key,material,basis,summary,reference){
    const items=[...summary.actions,...summary.requests,...summary.signals];
    if(!items.length)return {rows:[],notes:[]};
    const types=new Set(summary.fixed.map(item=>item.type));
    const available=types.size===items.length?menu.filter(entry=>types.has(entry.type)||entry.type==='diaries.create'):menu;
    const name=key+'-classify';
    try{
      return await step(name,'classify',{turns:material,history:reference,organized:summary,templates:available},
        skill.localAi.classify+' 每项核对本批证据，保留状态和日期。选择适用的最少登记项，理由和缺项简写。历史只用于指代。',2048,
        output=>draftCandidates(output,summary,basis,templates));
    }catch(error){
      if(!budgetFailure(error)||items.length===1&&!reference.length)throw error;
      job.steps[name].state='split';save('classify');
      const middle=Math.ceil(items.length/2);
      const revised=[];
      for(const [index,part] of [items.slice(0,middle),items.slice(middle)].entries()){
        if(!part.length)continue;
        const keep=splitRows(summary,part);
        const evidence=new Set(part.flatMap(item=>item.evidence.map(ref=>ref.sourceId)));
        revised.push(await draft(name+index,material.filter(item=>evidence.has(item.sourceId)),basis.filter(item=>evidence.has(item.id)),keep,[]));
      }
      return {rows:revised.flatMap(part=>part.rows),notes:revised.flatMap(part=>part.notes)};
    }
  }
  async function analyze(key,material,reference){
    const basis=material.filter(item=>!item.handled).map(({sourceId:id,at,text})=>({id,at,text}));
    const name=key+'-organize';
    let summary;
    try{
      summary=await step(name,'organize',{turns:material,history:reference},
        skill.localAi.organize+' history 只作参考。候选只能引用 turns 的新发言及其 sourceId。已由入口处理的 handled=true 只作背景。证据尽量引用短原话。',1550,
        output=>organize(output,basis,true));
    }catch(error){
      if(!budgetFailure(error)||material.length===1&&!reference.length&&Array.from(material[0].text).length<=200)throw error;
      job.steps[name].state='split';save('organize');
      const pieces=material.length>1?material:threadSections(material[0].text,Math.ceil(Array.from(material[0].text).length/2))
        .map((text,index)=>({...material[0],sourceId:material[0].sourceId+'-'+index,text}));
      const middle=Math.ceil(pieces.length/2);
      const results=[];
      for(const [index,part] of [pieces.slice(0,middle),pieces.slice(middle)].entries())
        if(part.length)results.push(...await analyze(name+index,part,[]));
      return results;
    }
    return [{summary,...await draft(key,material,basis,summary,reference)}];
  }
  const batches=[];
  let current=[],length=0;
  for(const turn of turns){
    if(current.length&&(length+turn.text.length>1100||current.length>=4)){
      batches.push(current);current=[];length=0;
    }
    current.push(turn);length+=turn.text.length;
  }
  if(current.length)batches.push(current);
  const work=[];
  for(const [index,batch] of batches.entries())work.push(...await analyze(String(index),batch,history));
  const stamp=titleTime.format(job.turns[0].at);
  const notes=[...new Set(work.flatMap(part=>part.notes))];
  const rows=work.flatMap(({rows},index)=>{
    const keys=new Map(rows.map((row,position)=>[row.id,index+'-'+position]));
    return rows.map(row=>({...row,id:keys.get(row.id),dependsOn:row.dependsOn.map(key=>keys.get(key)??'missing')}));
  });
  const explicit=job.turns.filter(turn=>turn.registration);
  if(explicit.length){
    const original=explicit.map(turn=>turn.text).join('\n\n');
    const existing=rows.filter(row=>row.type==='diaries.create');
    const preferred=existing[0];
    const diary={id:preferred?.id??'registration-diary',type:'diaries.create',label:'个人日记',params:{content:original,title:preferred?.params.title},
      conditions:[],dependsOn:[],missing:[],evidence:explicit.map(turn=>({sourceId:turn.id,quote:turn.text})),
      sources:[{field:'content',kind:'explicit',basis:'登记模式提交的原文'}]};
    const removed=new Set(existing.map(row=>row.id));
    for(const row of rows)row.dependsOn=[...new Set(row.dependsOn.map(id=>removed.has(id)?diary.id:id))];
    rows.splice(0,rows.length,diary,...rows.filter(row=>!removed.has(row.id)));
  }
  const formatted=rows.map(row=>formatEntry(row,templates[row.type].format,stamp));
  checkDependencies(formatted);
  return {rows:formatted,notes,summaries:work.map(part=>part.summary)};
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
    if(params.deadline&&pastDeadline(params.deadline,now())){
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
  changed=()=>{},notify=()=>{},log,loadSkill=()=>readInteractionSkill('conversationTranscription'),now=Date.now}){
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
    const summary={stage:job.stage,durationMs:job.durationMs,count:job.result?.rows.length??0,yieldedAt:job.yieldedAt,
      needsReview:job.needsReview,thread:job.line?.thread,cleanupAt:job.cleanupAt};
    write.run(id,state,at,safeStorage.encryptString(JSON.stringify(data)),JSON.stringify(summary));job.state=state;
  };
  const waiting=db.prepare(`SELECT * FROM transcriptions WHERE state IN ('queued','approved')
    AND (?=0 OR state='queued' AND json_extract(summary,'$.thread') IS NOT NULL)
    ORDER BY state<>'approved',
    CASE WHEN ?=1 THEN json_extract(summary,'$.yieldedAt') IS NULL ELSE json_extract(summary,'$.yieldedAt') IS NOT NULL END,
    coalesce(json_extract(summary,'$.yieldedAt'),at),at LIMIT 1`);
  const workers=new Map();
  let timer=null,closed=false,threadFinished=()=>{};
  for(const row of db.prepare("SELECT * FROM transcriptions WHERE state IN ('open','running','submitting')").all()){
    const job=decode(row);
    for(const step of Object.values(job.steps??{}))if(step.state==='running'){
      step.state='unknown';
      if(step.attempts?.at(-1)?.state==='running')step.attempts.at(-1).state='unknown';
    }
    const claim=job.claims?.at(-1);
    if(claim&&!claim.endedAt){claim.endedAt=now();claim.result='上次退出时未完成，已恢复原步骤';}
    job.closedAt??=now();save(job,row.state==='submitting'?'approved':'queued');
  }
  function status(job){return {id:job.id,state:job.state,at:job.at,stage:job.stage,error:job.error,
    durationMs:job.durationMs,count:job.result?.rows.length??0,needsReview:job.needsReview};}
  function cleanOldSnapshots(){
    for(const row of db.prepare(`SELECT * FROM transcriptions WHERE state IN ('empty','done','discarded')
      AND json_extract(summary,'$.cleanupAt')<=? LIMIT 10`).all(now())){
      const job=decode(row);
      for(const step of Object.values(job.steps??{})){
        delete step.input;delete step.output;
        for(const attempt of step.attempts??[])delete attempt.raw;
      }
      delete job.turns;delete job.history;delete job.cleanupAt;save(job,job.state);
    }
  }
  function setRetention(job){if(job.line)job.cleanupAt=now()+7*86400000;}
  function removeDuplicates(job){
    const previous=db.prepare(`SELECT * FROM transcriptions WHERE id<>? AND state IN ('ready','approved','submitting','submit-pending','done')
      AND json_extract(summary,'$.thread')=?`).all(job.id,job.line.thread);
    const seen=new Set(previous.flatMap(row=>decode(row).signatures??[]));
    const filtered=job.result.rows.filter(row=>{
      if(row.dependsOn.length||job.result.rows.some(other=>other.dependsOn.includes(row.id)))return true;
      const key=candidateSignature(row);
      if(seen.has(key))return false;
      seen.add(key);return true;
    });
    job.result.rows=filtered;job.signatures=filtered.map(candidateSignature);
  }
  function available(){
    return workers.size<2&&![...workers.values()].some(worker=>worker.exclusive);
  }
  function kick(ms=0){
    if(closed||timer||!available()||!waiting.get(Number(workers.size>0),Number(workers.has(0))))return;
    timer=setTimeout(()=>{timer=null;pump();},ms);timer.unref?.();
  }
  async function execute(job,worker){
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
        if(['completed','stopped'].includes(result.status))setRetention(job);
        save(job,result.status==='completed'?'done':result.status==='stopped'?'discarded':'submit-pending');
      }catch(error){job.error=error.message;save(job,'submit-pending');}
      changed();return;
    }
    worker.active={id:job.id,title,stage:'正在准备本机模型'};
    save(job,'running');changed();
    try{
      const skill=await loadSkill();
      const signal=AbortSignal.timeout(skill.localAi.policy.timeBudgetMs);
      const progress=phase=>{
        job.stage=worker.active.stage=labels[phase];save(job,'running');changed();
      };
      job.result=job.line?await transcribeThread(job,model,skill,progress):await transcribe(job,model,skill,progress,signal);
      job.durationMs=now()-job.closedAt;job.error=undefined;
      if(job.line)removeDuplicates(job);
      if(!job.result.rows.length)setRetention(job);
      save(job,job.result.rows.length?'ready':'empty');
      if(job.line)threadFinished(job.line);
      if(job.result.rows.length)try{notify(status(job));}catch{/* 任务管理仍可查看已保存的结果。 */}
    }catch(error){
      if(error.code==='THREAD_STAGE_YIELD'||error.code===adaptiveUnderflow&&!error.stepsExhausted){
        job.yieldedAt=now();save(job,'queued');return;
      }
      job.error=error.message;job.durationMs=now()-job.closedAt;
      job.needsReview=job.line&&error.stepsExhausted===true;
      job.retryAt=job.line&&!job.needsReview?now()+60000:undefined;
      save(job,error.code==='LOCAL_AI_BUSY'&&!job.line?'queued':'failed');
    }finally{worker.active=null;changed();}
  }
  function pump(){
    if(closed||!available())return;
    const lane=workers.has(0)?1:0;
    const job=decode(waiting.get(Number(workers.size>0),lane));
    if(!job)return;
    const exclusive=job.state==='approved'||!job.line||!model.aiSnapshot;
    if(!canStart(job.state,Boolean(job.line))||exclusive&&model.isBusy?.()){kick(300);return;}
    const worker={exclusive,active:null};
    const claim={worker:lane+1,startedAt:now(),stage:job.stage??'准备整理'};
    if(job.line)(job.claims??=[]).push(claim);
    workers.set(lane,worker);
    worker.promise=execute(job,worker).finally(()=>{
      if(job.line){
        claim.endedAt=now();claim.result=job.state;
        save(job,job.state);
        void log?.({direction:'local',category:'绯月自主行动',route:title,goal:claim.stage,
          stage:job.state==='failed'?'失败':job.state==='queued'?'交接':'完成',
          result:job.state,action_id:job.id+'/'+claim.startedAt+'/'+claim.worker,worker:claim.worker,
          started_at:claim.startedAt,finished_at:claim.endedAt,duration_ms:claim.endedAt-claim.startedAt});
      }
      workers.delete(lane);changed();kick(150);
    });
    kick();
  }
  function allowedId(id){if(typeof id!=='string'||!/^[\w-]{1,128}$/u.test(id))throw Error('作业编号无效');}
  return {
    onThreadFinished(callback){threadFinished=callback;},
    canCollectThread:()=>!closed&&available()&&!model.isBusy?.()&&!model.aiSnapshot?.().running&&canStart('queued',true),
    fromThread(batch){
      cleanOldSnapshots();
      const prior=get(batch.id);
      if(prior){
        if(prior.result)threadFinished(batch);
        else if(prior.state==='failed'&&!prior.needsReview&&prior.retryAt<=now()){
          prior.yieldedAt=now();save(prior,'queued');changed();kick();
        }
        return;
      }
      const {turns,history,...line}=batch;
      save({id:line.id,at:line.at,closedAt:now(),turns,history,line,steps:{}},'queued');changed();kick();
    },
    async referencedReminder({id,at,text,title,deadline,revise,messageId}){
      const {templates:{templates}}=await loadSkill();
      const prior=get(id);
      if(prior){
        if(!revise||prior.lastRevision===messageId)return;
        if(prior.state!=='ready')throw Error('这张提醒卡已进入登记，请从提醒入口修改');
        prior.result.rows[0].params.deadline=deadline;prior.lastRevision=messageId;save(prior,'ready');changed();
        return;
      }
      const type='reminders.create';
      const row=formatEntry({id:'reference',type,label:'事项提醒',params:{title,content:text,deadline},
        conditions:[],dependsOn:[],missing:[],evidence:[{sourceId:id,quote:text}],
        sources:[{field:'deadline',kind:'explicit',basis:'引用原话的东京日期'}]},templates[type].format,titleTime.format(at));
      save({id,at,closedAt:now(),lastRevision:messageId,result:{rows:[row],notes:[],summaries:[]}},'ready');
      changed();
    },
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
      const steps=Object.values(job.steps??{}).map(({id,state,error,attempts,input,output})=>({id,state,error,attempts,input,output}));
      return {...status(job),result:job.result,selected:job.selected,receipts:job.receipts,steps,claims:job.claims};
    },
    async edit({id,rowId,values}={}){
      allowedId(id);
      const {templates:{templates}}=await loadSkill();
      const job=get(id);
      const row=job?.state==='ready'&&job.result.rows.find(item=>item.id===rowId);
      if(!row)throw Error('只有待确认的记录可以修改，请重新打开清单');
      const template=templates[row.type];
      if(!template)throw Error('未找到这条记录的登记模板');
      const required=template.required.map(key=>key==='category_id'?'categoryLabel':key);
      const names=[...new Set([...required,...(template.optional??[]),...(template.optionalFromSource??[])])];
      const fields=names.map(key=>({key,required:required.includes(key),value:key==='categoryLabel'?row.categoryLabel:row.params[key],
        limit:key==='title'?template.format?.titleLimit:key===template.format?.bodyField?template.format.bodyLimit:undefined}));
      if(values===undefined)return {fields};
      if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(key=>!names.includes(key)))
        throw Error('修改包含不支持的字段');
      const changedFields=[];
      for(const field of fields){
        const {key,limit}=field;
        if(!Object.hasOwn(values,key)||values[key]===(field.value??''))continue;
        if(typeof values[key]!=='string')throw Error('字段内容无效');
        const value=values[key].trim();
        if(!value&&field.required)throw Error('请填写必填字段');
        if(limit&&value.length>limit)throw Error('修改后的文字超出登记上限');
        if(key==='deadline'){
          const day=value.slice(0,10),date=new Date(day+'T00:00:00Z');
          if(!datePattern.test(value)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==day)
            throw Error('提醒日期或时间无效');
          if(pastDeadline(value,now()))throw Error('请填写尚未到期的提醒时间（JST）');
        }
        if(key==='level'&&value&&!['高','中','低'].includes(value))throw Error('请选择有效级别');
        if(key==='url'&&value&&!/^https?:\/\/[^\s]+$/iu.test(value))throw Error('请填写有效的 HTTP 或 HTTPS 网址');
        if(key==='categoryLabel')row.categoryLabel=value;
        else if(value)row.params[key]=value;
        else delete row.params[key];
        changedFields.push(key);
      }
      if(changedFields.length){
        const fixes={title:'标题超出登记上限',deadline:'有效提醒时间',[template.format?.bodyField]:'正文超出登记上限'};
        row.missing=row.missing.filter(item=>!changedFields.some(key=>item===key||item===fixes[key]));
        row.sources=row.sources.filter(item=>!changedFields.includes(item.field));
        row.sources.push(...changedFields.map(field=>({field,kind:'manual',basis:'确认前手动编辑'})));
        delete row.prepareError;
        checkDependencies(job.result.rows);
        save(job,'ready');changed();
      }
      return status(job);
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
      job.selected=selected;job.error=undefined;
      if(!selected.length)setRetention(job);
      save(job,selected.length?'approved':'discarded');changed();kick();return status(job);
    },
    retry(id){
      allowedId(id);const job=get(id);
      if(!job||!['failed','submit-pending'].includes(job.state))throw Error('这条作业当前无需重试');
      job.error=undefined;job.needsReview=undefined;job.yieldedAt=now();
      for(const step of Object.values(job.steps??{}))if(step.state==='failed'||step.state==='unknown')step.manualFrom=step.attempts?.length??0;
      save(job,job.state==='failed'?'queued':'approved');changed();kick();
    },
    start(){cleanOldSnapshots();kick();},get active(){return [...workers.values()].find(worker=>worker.active)?.active??null;},
    get busy(){return workers.size>0;},settled:()=>Promise.allSettled([...workers.values()].map(worker=>worker.promise)),
    formalCount:()=>db.prepare("SELECT count(*) AS total FROM transcriptions WHERE state IN ('queued','running','approved','submitting')").get().total,
    async close(){closed=true;clearTimeout(timer);await Promise.allSettled([...workers.values()].map(worker=>worker.promise));db.close();},
  };
}
