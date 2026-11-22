import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {readInteractionSkill} from './interaction-skills.mjs';
import {plannedNewsUpdate,supportedNewsTitle} from './news-editor.mjs';

const run=promisify(execFile);
const script=fileURLToPath(new URL('../workflows/comfyui/news_social.py',import.meta.url));
const day=86400000;
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',dateStyle:'short'});
const asText={type:'string'};
const asList={type:'array',items:asText};
const shape=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const schemas={title:shape({title:asText}),reviewTitle:shape({reason:{type:'string',maxLength:36},accept:{enum:['yes','no']}}),
  keywords:shape({groups:{...asList,minItems:1,maxItems:3}})};
export const newsWindSchema=refs=>shape({
  refs:{type:'array',items:{enum:refs},minItems:1,maxItems:4},
  title:{type:'string',maxLength:48},summary:{type:'string',maxLength:150},change:{type:'string',maxLength:60}
});

export async function lookupNewsSocial(platform,groups,to,signal) {
  const {stdout}=await run('python',['-B',script,platform,String(to),JSON.stringify(groups)],{
    signal,windowsHide:true,timeout:50000,maxBuffer:5*1024*1024,encoding:'utf8'
  });
  return JSON.parse(stdout);
}

export function newsTitleEvidence(details) {
  const selected=details.nodes.length>3?[details.nodes[0],...details.nodes.slice(-2)]:details.nodes;
  return selected.map(node=>({date:date.format(node.at)+' JST',title:node.title,
    text:(node.evidence||node.reports.slice(0,3).map(report=>
      [report.chinese?.title||report.title,report.chinese?.excerpt||report.excerpt].filter(Boolean).join('。'))
      .filter(Boolean).join('\n')).slice(0,550)}));
}

export function acceptedNewsReview(review) {
  return review.accept==='yes'&&!/与(?:材料|原文|事实)(?:不符|矛盾)|误(?:写|将|把)|偷换|编造/u.test(review.reason??'');
}

export function newsTitleFeedback(latest) {
  if(plannedNewsUpdate([latest.title,latest.text].join('\n')))
    return '最新消息在宣布计划。标题写「计划」或「将」，保留主体和具体部署内容。';
  return '草稿遗漏末条标题的范围或状态限定，或数字无法核对。改写末条标题的中心进展，允许省去数字，保留计划、暂未、限速等原有限定。';
}

const phaseName={title:'拟新闻标题',reviewTitle:'核验新闻标题',summary:'汇总新闻事实',keywords:'提取社论关键词',
  X:'查 X',Reddit:'查 Reddit',wind:'合并社论风向'};
const platforms=['X','Reddit'];
const sampleRows=data=>platforms.flatMap(platform=>(data.samples[platform]?.posts??[]).slice(0,8).map(post=>({...post,platform})));
function windEdition(data,rows,prior,opinion=null,failed=false) {
  const title=opinion?.title?.trim();
  const safeTitle=title&&!/引发|导致|造成|加剧|证实/u.test(title)?title:'社媒取样记录';
  return {from:data.to-3*day,to:data.to,title:safeTitle,
    summary:opinion?.summary?.trim()||'',change:prior&&rows.some(post=>post.at)?opinion?.change?.trim()||'':'',
    ...(failed?{failed:true}:{}),
    refs:rows.map(({platform,url,at,title})=>({platform,url,at,title})),
    platforms:platforms.map(platform=>({platform,state:data.samples[platform]?.state,code:data.samples[platform]?.code,
      count:(data.samples[platform]?.posts??[]).filter(post=>post.at).length,
      unverified:(data.samples[platform]?.posts??[]).filter(post=>!post.at).length,credits:data.samples[platform]?.credits})),
    groups:data.groups,version:data.version};
}

export function createNewsEditorial(db,{now,model,compile,skill=()=>readInteractionSkill('newsEditorial'),lookup=lookupNewsSocial}) {
  db.exec(`CREATE TABLE IF NOT EXISTS news_editorial (topic TEXT NOT NULL, revision INTEGER NOT NULL, phase TEXT NOT NULL,
    data TEXT NOT NULL, PRIMARY KEY(topic,revision));`);
  const byTopic=db.prepare('SELECT * FROM news_editorial WHERE topic=? ORDER BY revision DESC');
  const get=db.prepare('SELECT * FROM news_editorial WHERE topic=? AND revision=?');
  const put=db.prepare('INSERT INTO news_editorial VALUES(?,?,?,?) ON CONFLICT(topic,revision) DO UPDATE SET phase=excluded.phase, data=excluded.data');
  const remove=db.prepare('DELETE FROM news_editorial WHERE topic=?');
  const unpack=row=>({...row,data:JSON.parse(row.data)});
  const winds=data=>[data.wind,...(data.olderWind??[])].filter(Boolean);
  function history(id) {
    return byTopic.all(id).map(unpack).flatMap(row=>winds(row.data)).sort((a,b)=>b.to-a.to);
  }
  function title(id,revision) {
    const row=get.get(id,revision);
    return row&&unpack(row).data.acceptedTitle;
  }
  function summary(id,revision) {
    const row=get.get(id,revision);
    return row&&unpack(row).data.summary;
  }
  function reconcile(kept,duplicate) {
    for(const row of byTopic.all(duplicate).map(unpack)){
      const existing=get.get(kept,row.revision);
      if(existing){
        const {phase,data}=unpack(existing);
        const seen=new Set(winds(data).map(wind=>wind.to));
        data.olderWind=[...(data.olderWind??[]),...winds(row.data).filter(wind=>!seen.has(wind.to))];
        put.run(kept,row.revision,phase,JSON.stringify(data));
      }else put.run(kept,row.revision,row.phase,JSON.stringify(row.data));
    }
    remove.run(duplicate);
  }
  let busy=false;
  async function step({boards,items},getEvent,signal) {
    if(busy)return '本轮编辑正在推进';
    busy=true;
    try {
      const members=[...new Set(Object.values(boards).flatMap(board=>[...board.hot,...board.key]))];
      const active=new Set(Object.values(boards).flatMap(board=>[...board.hot,...board.key].filter(id=>!board.quiet.includes(id))));
      const hot=new Set(Object.values(boards).flatMap(board=>board.hot));
      const indexed=new Map(items.map(item=>[item.id,item]));
      const ongoing=members.flatMap(id=>byTopic.all(id).map(unpack)
        .filter(row=>!['done','failed'].includes(row.phase)&&!(row.data.waitUntil>now()))
        .map(row=>({item:indexed.get(id),row})));
      const current=[...active].map(id=>indexed.get(id)).filter(Boolean);
      const pending=ongoing[0];
      const target=pending??current.filter(item=>hot.has(item.id)).concat(current.filter(item=>!hot.has(item.id)))
        .map(item=>({item,row:get.get(item.id,item.at)})).find(({row})=>!row);
      if(!target)return '榜单编辑与社论风向已更新';
      const {id}=target.item;
      const revision=target.row?.revision??target.item.at;
      const details=getEvent(id);
      if(!details)return '话题状态已更新';
      const existing=pending?.row;
      const selectedSkill=existing?null:await skill();
      signal.throwIfAborted();
      const data=existing?.data??{version:selectedSkill.version,prompts:selectedSkill.localAi,evidence:newsTitleEvidence(details),
        previousTitle:byTopic.all(id).map(unpack).find(row=>row.data.acceptedTitle)?.data.acceptedTitle??details.title,
        social:hot.has(id),attempts:0};
      const phase=existing?.phase??'title';
      delete data.waitUntil;
      const save=next=>{
        if(getEvent(id))put.run(id,revision,next,JSON.stringify(data));
      };
      const checkpoint='news-editorial:'+id+':'+revision+':'+phase;
      const persist=next=>{
        data.attempts=0;
        save(next);
        model?.aiAck?.(checkpoint);
      };
      const currentEvidence=data.evidence.at(-1);
      const input=phase==='title'?{current:currentEvidence,background:data.evidence.slice(0,-1),
        previousTitle:data.previousTitle,feedback:data.feedback}:
        phase==='reviewTitle'?{draft:data.draft,current:currentEvidence}:
        {title:data.acceptedTitle??details.title,evidence:data.evidence};
      function infer(value,schema=schemas[phase]) {
        if(!data.prompts?.[phase])throw Error('编辑技能缺少阶段 '+phase);
        return model.memory(JSON.stringify(value),data.prompts[phase],schema,signal,
          {name:'news-editorial',version:data.version,stage:phase,aiTier:'4',aiPriority:1,
            maxTokens:phase==='wind'?440:phase==='reviewTitle'?384:180,aiCheckpoint:checkpoint});
      }
      save(phase);
      try {
        if(phase==='title'){
          if(!model?.memory){persist('summary');return '标题采用原有可核验进展';}
          const draft=(await infer(input))?.title?.trim().replace(/。$/u,'');
          signal.throwIfAborted();
          if(!supportedNewsTitle(draft,data.evidence)){
            data.feedback=newsTitleFeedback(currentEvidence);
            throw Error('标题缺少有效格式或数据依据');
          }
          data.draft=draft;
          persist('reviewTitle');
        } else if(phase==='reviewTitle'){
          const review=await infer(input);
          signal.throwIfAborted();
          if(!['yes','no'].includes(review?.accept))throw Error('标题复核缺少结论');
          data.review=review;
          const accepted=acceptedNewsReview(review);
          if(accepted)data.acceptedTitle=data.draft;
          if(!accepted&&!data.reviewRetried){
            data.reviewRetried=true;
            data.feedback=review.reason;
            persist('title');
          }else persist('summary');
        } else if(phase==='summary'){
          if(compile&&details.at===revision){
            const value=await compile(details,signal,{name:'news-editorial',stage:phase,version:data.version,
              aiCheckpoint:checkpoint,prompt:data.prompts?.summary});
            signal.throwIfAborted();
            if(value)data.summary=value;
          }
          persist(data.social?'keywords':'done');
        } else if(phase==='keywords'){
          const newest=history(id)[0];
          if(newest&&now()-newest.to<day){
            data.waitUntil=newest.to+day;
            persist('keywords');return '本话题沿用当天风向，下一批稍后准备';
          }
          const result=model?.memory?await infer(input):{groups:[input.title]};
          signal.throwIfAborted();
          const groups=Array.isArray(result?.groups)?result.groups:[];
          data.groups=[...new Set(groups.filter(word=>typeof word==='string').map(word=>word.trim().slice(0,100)).filter(Boolean))].slice(0,3);
          if(!data.groups.length)throw Error('缺少可区分事件的查询词');
          data.to=now();
          data.samples={};
          persist('X');
        } else if(phase==='X'||phase==='Reddit'){
          if(data.samples[phase]?.state==='pending')data.samples[phase]={state:'unknown',code:'SEARCH_RECEIPT_UNKNOWN'};
          else {
            data.samples[phase]={state:'pending'};
            save(phase);
            try {
              const result=await lookup(phase,data.groups,data.to,signal);
              signal.throwIfAborted();
              data.samples[phase]=result;
            } catch(error){
              signal.throwIfAborted();
              data.samples[phase]={state:'unknown',code:error.code??'SEARCH_RECEIPT_UNKNOWN'};
            }
          }
          persist(phase==='X'?'Reddit':'wind');
        } else {
          const rows=sampleRows(data);
          const numbered=rows.map((row,i)=>({ref:String(i+1),platform:row.platform,at:row.at??'待核实',text:row.text.slice(0,220)}));
          const prior=history(id)[0];
          const opinion=rows.length&&model?.memory?await infer({title:input.title,posts:numbered,prior:prior?.summary??''},
            newsWindSchema(numbered.map(row=>row.ref))):null;
          signal.throwIfAborted();
          const refs=[...new Set((Array.isArray(opinion?.refs)?opinion.refs:[]).map(ref=>Number(ref)-1))]
            .filter(index=>Number.isInteger(index)&&rows[index]);
          if(rows.length&&model?.memory&&(!opinion?.summary?.trim()||!refs.length))throw Error('风向归纳没有有效原帖引用');
          data.wind=windEdition(data,refs.length?refs.map(index=>rows[index]):rows,prior,opinion);
          persist('done');
        }
        return phaseName[phase]+' · '+target.item.title;
      } catch(error) {
        signal.throwIfAborted();
        data.attempts++;
        data.failure=error.code??error.message;
        if(data.attempts>=3&&['title','reviewTitle'].includes(phase))persist('summary');
        else if(data.attempts>=3&&phase==='summary'&&data.social)persist('keywords');
        else if(data.attempts>=3&&phase==='wind'){
          data.wind=windEdition(data,sampleRows(data),null,null,true);
          persist('failed');
        }
        else {
          save(data.attempts<3?phase:'failed');
          model?.aiAck?.(checkpoint);
        }
        throw error;
      }
    } finally {busy=false;}
  }
  return {step,history,title,summary,reconcile,remove:id=>remove.run(id)};
}
