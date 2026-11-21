import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {atomicFile,optional} from './memory-archive.mjs';
import {cleanMemory} from './personality-diary.mjs';
import {readInteractionSkill} from './interaction-skills.mjs';
import {fields} from './emotion-service.mjs';
import {loadTopic,writeTopic} from './topic-files.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex').slice(0,24);
const segmenter=new Intl.Segmenter('zh',{granularity:'word'});
const stop=new Set('之前 记得 以后 这个 那个 什么 还有 以前 你们 我们 知道 说过 能不能 怎么 有没有'.split(' '));
function terms(s){return [...new Set([...segmenter.segment(s)].filter(w=>w.isWordLike&&w.segment.length>=2&&!stop.has(w.segment)).map(w=>w.segment.toLowerCase()))].slice(0,6);}
function canCite(fact,origin){return fact.ref!==origin&&!/^(topic|draft)\//.test(fact.ref);}
function materialRef(r){
  if(!r.source)return 'material/'+r.id;
  if(r.source.startsWith('task:'))return 'task/'+r.source.slice(5);
  if(r.source.startsWith('notice:'))return 'notice/'+r.source.slice(7);
  if(/^nag(?:-before|-after)?:/.test(r.source))return 'nag/'+r.source.replace(/^nag(?:-before|-after)?:/,'').replace(/:\d+$/,'');
  return r.source.includes(':')?r.source:'chat/'+r.source;
}
export function createTopicMemory({profile,memory,model,safeStorage,traffic,now=Date.now,skill=readInteractionSkill}){
  const dir=join(memory.root??profile,'专题记忆'),docs=new Map();
  const ready=(async()=>{
    const names=await optional(readdir(dir))??[];
    const ids=new Set(names.map(name=>/^([a-f0-9]{24})\.md(?:\.bak[123]|\.bad)?$/.exec(name)?.[1]).filter(Boolean));
    const catalog=await optional(readFile(join(dir,'目录.md'),'utf8'))??'';
    const titles=new Map([...catalog.matchAll(/^- \[([^\]\r\n]+)\]\(([a-f0-9]{24})\.md\)/gm)].map(m=>[m[2],m[1]]));
    for(const id of titles.keys())ids.add(id);
    for(const id of ids){
      const data=await loadTopic(dir,id,titles.get(id),now);
      if(data)docs.set(id,data);
    }
    if(docs.size)await index();
  })();
  void ready.catch(()=>{});
  function index(){return atomicFile(join(dir,'目录.md'),'# 专题记忆\n\n'+[...docs.values()].map(t=>'- ['+t.title.replace(/[\[\]\r\n]/g,' ')+']('+t.id+'.md) · '+t.status).join('\n')+'\n');}
  let writes=Promise.resolve();
  function modify(id,change){
    const p=writes.then(async()=>{
      await ready;const old=docs.get(id),d=change(old&&structuredClone(old));
      if(!d)return old;
      d.revision=Math.max(old?.revision??0,old?.revisionFloor??0)+1;delete d.revisionFloor;d.updated=now();
      await writeTopic(dir,d,old);
      docs.set(id,d);
      await index();
      return d;
    });writes=p.catch(()=>{});return p;
  }
  async function search(question,signal,{budget=250,cursor=0,exclude='',confirming=false}={}){
    await ready;const words=terms(question),hits=new Map(),gaps=[],until=performance.now()+budget;
    if(!words.length)return {hits:[],gaps,cursor:0,complete:true};
    function hit(ref,raw,at){
      if(exclude===ref||typeof raw!=='string')return;
      const lower=raw.toLowerCase(),found=words.filter(w=>lower.includes(w));
      if(!found.length)return;
      const start=Math.max(0,lower.indexOf(found[0])-28),value={ref,text:cleanMemory(raw.slice(start,start+135)),at,score:found.length};
      if(value.text&&(!hits.has(ref)||hits.get(ref).score<value.score))hits.set(ref,value);
    }
    const work=[],names=[],coverage={};
    function source(name,read){names.push(name);work.push(read);}
    function table(file,sql,mapper){
      const name=file+'/'+sql.match(/FROM (\w+)/i)[1];
      source(name,async(offset=0)=>{
        const path=join(profile,file);if(!existsSync(path)){coverage[name]='无本机副本';return;}
        const db=new DatabaseSync(path,{readOnly:true});
        try{
          const page=db.prepare(sql+' LIMIT 64 OFFSET ?');
          for(;;){
            signal.throwIfAborted();
            const rows=page.all(offset);
            for(const r of rows)await mapper(r);
            if(rows.length<64)return;
            offset+=rows.length;
            if(performance.now()>=until)return offset;
            await new Promise(resolve=>setImmediate(resolve));
          }
        }finally{db.close();}
      });
    }
    if(!confirming)source('专题',async()=>{for(const t of docs.values())if(t.status!=='pending'&&t.summary)hit('topic/'+t.id,t.title+' '+t.summary,t.updated);});
    table('personality-memory.sqlite','SELECT day,id,json FROM pages',r=>{const d=JSON.parse(r.json);hit('diary/'+r.id,d.summary+' '+d.body,r.day);});
    table('personality-memory.sqlite','SELECT id,json FROM nags',r=>{const d=JSON.parse(r.json);hit('nag/'+r.id,[d.title,...d.talk.map(t=>t.text)].join(' '),d.created_at);});
    table('personality-memory.sqlite','SELECT m.id,s.source,s.at,c.content FROM materials m JOIN cleaned c USING(id) LEFT JOIN material_sources s USING(id)',r=>hit(materialRef(r),r.content,r.at));
    table('reminder-checks.sqlite','SELECT * FROM notices',r=>hit('notice/'+r.id,r.title+' '+r.body,r.at));
    table('reminder-checks.sqlite','SELECT * FROM checks',r=>hit('check/'+r.id,[r.project,r.status,r.detail].join(' '),r.at));
    table('reminder-checks.sqlite','SELECT * FROM weather_state',r=>hit('weather/'+r.id,r.value));
    if(!confirming)table('reminder-approvals.sqlite','SELECT id,data FROM drafts WHERE expires>'+Math.floor(now()),async r=>{
      const d=JSON.parse((await safeStorage.decryptStringAsync(Buffer.from(r.data))).result);
      hit('draft/'+r.id,[d.question,...(d.entries||d.candidates||[]).map(e=>e.title)].filter(Boolean).join(' '));
    });
    table('conversations.sqlite','SELECT id,at,payload FROM turns',async r=>{
      const d=JSON.parse((await safeStorage.decryptStringAsync(Buffer.from(r.payload))).result);
      if(!confirming||d.question!==question||exclude)hit('chat/'+r.id,[d.question,d.text].join(' '),r.at);
    });
    table('tasks.sqlite','SELECT task_id,type,status,updated_at FROM local_tasks',r=>hit('task/'+r.task_id,r.type+' '+r.status,r.updated_at));
    table('local-batches.sqlite','SELECT id,title,state,finished FROM batches',r=>hit('batch/'+r.id,r.title+' '+r.state,r.finished));
    source('图像任务',async()=>{
      const path=join(profile,'image-tasks');
      for(const name of await optional(readdir(path))??[])if(/^[a-f0-9]{32}\.json$/.test(name)){
        const d=JSON.parse(await readFile(join(path,name),'utf8'));hit(d.serverTaskId?'task/'+d.serverTaskId:'image/'+d.job,[d.original,d.text].join(' '),d.at);
      }
    });
    for(const day of (await memory.archiveDays()).sort().reverse()){
      source('归档/'+day,async()=>{
        const turns=await memory.read(day),imageRefs=new Map();
        for(const r of turns){
          if(r.report?.job&&r.report.serverTaskId)imageRefs.set(r.report.job,'task/'+r.report.serverTaskId);
          if(confirming&&!exclude&&!r.report&&r.question===question)continue;
          const ref=r.report?.job?(imageRefs.get(r.report.job)??'image/'+r.report.job):'chat/'+(r.interactionId??r.id);
          hit(ref,[r.question,r.text].join(' '),r.at);
        }
        for(const r of await memory.readTasks(day)){
          const ref=r.report?(imageRefs.get(r.task_id)??'image/'+r.task_id):'task/'+r.task_id;
          hit(ref,[r.title,r.action,r.detail].join(' '),r.at);
        }
        if(traffic){let next;do{const page=await traffic(next,day);for(const line of page.lines){
          try{const e=JSON.parse(line);hit(e.task_id?'task/'+e.task_id:'traffic/'+hash(line),[e.route,e.stage,e.result].filter(Boolean).join(' '),e.at);}catch{}
        }next=page.next;signal.throwIfAborted();}while(next);}
      });
    }
    const start=cursor?.name?Math.max(0,names.indexOf(cursor.name)):0;
    let i=start,nextOffset=0;
    for(;i<work.length;i++){
      signal.throwIfAborted();if(i!==start&&performance.now()>=until)break;
      const name=names[i],before=hits.size;
      try{
        nextOffset=await work[i](i===start?cursor?.offset??0:0);
        coverage[name]??=nextOffset?'未读完':hits.size>before?'命中':'已查遍';
        if(nextOffset)break;
      }catch{signal.throwIfAborted();coverage[name]='不可用';gaps.push(name);}
    }
    return {hits:[...hits.values()].sort((a,b)=>b.score-a.score).slice(0,12),gaps,coverage,
      cursor:i<work.length?{name:names[i],offset:nextOffset??0}:0,complete:i>=work.length};
  }
  async function remember(question,origin='',cursor=0){
    question=cleanMemory(question).slice(0,90);
    const keys=terms(question);if(!keys.length)return;
    const id=hash(keys.join('/'));return modify(id,d=>{
      if(d)return origin&&!d.origin?{...d,origin}:null;
      return {id,title:question,status:'pending',tries:0,cursor,evidence:[],origin};
    });
  }
  async function recall(question,signal){
    const hits=await search(question,signal);
    signal.throwIfAborted();
    if(!hits.hits.length&&/还记得|听说过|之前提过|知道.{2,40}吗/u.test(question)&&terms(question).length){
      await remember(question,'',hits.cursor);
    }
    for(const t of docs.values()){
      if(!['unknown','confirmed'].includes(t.status))continue;
      const keywords=terms(t.title);
      if(!keywords.some(w=>question.toLowerCase().includes(w)))continue;
      const fresh=hits.hits.some(h=>canCite(h,t.origin)&&keywords.some(w=>h.text.toLowerCase().includes(w))&&!t.evidence.some(e=>e.ref===h.ref));
      if(fresh)await modify(t.id,d=>d.revision===t.revision?{...d,status:'pending',cursor:0,tries:0,queued:true}:null);
    }
    return hits.hits.slice(0,3);
  }
  async function check(id,signal,round){
    await ready;const old=docs.get(id);if(!old||old.status!=='pending')return '没有待查问题';
    const r=await search(old.title,signal,{budget:1600,cursor:old.cursor,exclude:old.origin,confirming:true});
    const byRef=new Map(r.hits.map(f=>[f.ref,f]));
    for(const fact of old.evidence)if(!byRef.has(fact.ref))byRef.set(fact.ref,fact);
    const evidence=[...byRef.values()].filter(f=>canCite(f,old.origin)).slice(0,12);
    let cited=[];
    let summary='',status='pending',tries=old.tries+Number(r.complete&&![...(old.scanGaps??[]),...r.gaps].length);
    if(evidence.length>=5||tries>=3){
      if(evidence.length){
        const pack=await skill('topicMemory');
        const result=await model.memory(JSON.stringify({问题:old.title,证据:evidence.map((f,i)=>({id:i,text:f.text}))}),pack.localAi.synthesize+' refs 只能填材料给出的 id（从0开始）。材料足以回答问题时 result 填 confirmed，摘取确有根据的一句事实；证据不足填 unknown。',
          fields({result:{enum:['confirmed','unknown']},summary:{type:'string'},refs:{type:'array',items:{type:'integer'}}}),signal,{name:pack.skill,version:pack.version});
        if(result.result==='confirmed'&&result.summary?.trim()&&result.refs?.length&&result.refs.every(i=>Number.isInteger(i)&&evidence[i])){
          summary=result.summary.trim();status='confirmed';cited=[...new Set(result.refs)].map(i=>evidence[i].ref);
        }
      }
      if(status==='pending'&&tries>=3)status='unknown';
    }
    signal.throwIfAborted();
    await modify(id,d=>{
      if(d?.revision!==old.revision)return null;
      const changed=status==='confirmed'&&summary!==d.summary;
      const versions=[...(d.versions??[])];if(changed)versions.push({at:now(),revision:d.revision+1,summary});
      return {...d,queued:status==='pending',lastCheck:now(),cursor:r.cursor,gaps:r.gaps,coverage:{...d.coverage,...r.coverage},evidence,cited,tries,status,summary:summary||d.summary,round,versions,
        scanGaps:r.complete?[]:[...new Set([...(d.scanGaps??[]),...r.gaps])],announced:changed?false:d.announced,confirmedAt:changed?now():d.confirmedAt};
    });
    return summary||'查证进度已保存';
  }
  async function queueCheck(id,round){
    const saved=await modify(id,d=>d?.status==='pending'?{...d,queued:true,round}:null);
    return saved?.status==='pending'&&saved.round===round&&saved.queued===true;
  }
  let asking=false;
  async function recoveryQuestion(excluded=new Set()){
    await ready;
    const t=[...docs.values()].find(d=>d.recoveryHelp==='pending'&&!excluded.has(d.id));
    if(!t)return;
    const prompt=t.needsTitle?'我的一个专题文件和备份都损坏了（'+t.id.slice(0,8)+'）。亲爱的，你记得专题名称或关键词吗？':
      '我的《'+t.title+'》专题和备份都损坏了，我在重新整理。亲爱的，你还记得什么线索吗？';
    return {id:t.id,prompt};
  }
  async function answerRecovery(id,answer){
    const clue=answer?.action==='cancel'?'':cleanMemory(answer?.text);
    if(!clue&&answer?.action!=='cancel')return;
    await modify(id,d=>{
      if(d?.recoveryHelp!=='pending')return null;
      d.recoveryHelp=clue?'answered':'dismissed';
      if(clue){
        if(d.needsTitle)d.title=clue.slice(0,90);
        d.needsTitle=false;d.queued=true;d.status='pending';d.tries=0;d.cursor=0;
        d.recoveryReply=clue;
        d.evidence.push({ref:'user-help/'+d.id,text:clue.slice(0,135),at:now()});
      }
      return d;
    });
  }
  async function offerRecoveryHelp(ask){
    await ready;
    if(asking)return;
    asking=true;
    try{
      const t=await recoveryQuestion();
      if(t)await answerRecovery(t.id,await ask(t.prompt));
    }finally{asking=false;}
  }
  async function runQueued(signal,step){
    await ready;
    // 旧版在第一次查遍后会清除 queued，已领取的轮次仍需接续。
    const t=[...docs.values()].filter(d=>d.status==='pending'&&(d.queued||d.round))
      .sort((a,b)=>(a.lastCheck??0)-(b.lastCheck??0))[0];
    if(t){
      const run=()=>check(t.id,signal,t.round);
      return step?step('本地文档整理','核查专题 '+t.id+'：'+t.title,run):run();
    }
  }
  async function note(fact,action,summary,round,{category}={}){
    const id=hash(action+'/'+fact.ref+(category&&category!==action?'/'+category:''));await modify(id,d=>({...d,id,title:fact.title.slice(0,80),status:action,summary,
      evidence:[{ref:fact.ref,text:fact.title}],history:[...(d?.history??[]),...(d?.summary?[{at:d.updated,summary:d.summary}]:[])],round}));return '专题已保存：'+id;
  }
  const confirmed=()=>[...docs.values()].filter(d=>d.status==='confirmed'&&!d.announced).slice(0,3);
  const announced=(id,revision)=>modify(id,d=>d?.status==='confirmed'&&!d.announced&&
    (d.versions?.at(-1)?.revision??d.revision)===revision?{...d,announced:now()}:null);
  const decisionReceipt=id=>[...docs.values()].find(d=>d.round===id)?.id;
  return {ready,remember,queueCheck,runQueued,offerRecoveryHelp,recoveryQuestion,answerRecovery,confirmed,announced,decisionReceipt,search,recall,check,note,pending:()=>[...docs.values()].filter(d=>d.status==='pending'&&!d.needsTitle).slice(0,3),
    preferences:()=>[...docs.values()].filter(d=>d.status==='preference').slice(-3).map(t=>t.summary),
    facts:day=>[...docs.values()].flatMap(t=>(t.versions??[]).filter(v=>new Date(v.at+9*3600000).toISOString().startsWith(day))
      .map(v=>({id:t.id,title:t.title,revision:v.revision,updated:v.at,summary:v.summary}))),
    close:()=>Promise.all([ready,writes])};
}
