import {randomUUID} from 'node:crypto';
import {tokyoDay} from './conversation-history.mjs';
import {untilAbort} from './chat-budget.mjs';
import {readInteractionSkill} from './interaction-skills.mjs';
import {
  canRefine,checkedRefinement,diaryTagLimit,emptyDiaryBody,endedNag,
  protectedDiaryText,refinementDigest,refinementInterval,refinementRuleVersion,refinementText
} from '../agent/assistant/memory-refinement.mjs';

const pageLimit=20;
const dayMs=86400000;
const priorityWindowDays=7;
const maxWindowDays=30;
const genericTags=new Set(['日常','聊天','记录','日记','今天','生活','杂记','其他','绯月','手记']);
const titleOf=kind=>kind==='diaries'?'日记':'唠叨';
const idOf=(kind,record)=>kind==='diaries'?record.day+'.'+record.part:record.id;
const pathFor=({kind,id})=>kind+'/'+encodeURIComponent(id)+'/refine';
const shorten=(text,n)=>[...String(text??'')].slice(0,n).join('');
const shortLabel=(kind,record,id)=>{
  const day=record?.day||(record?.created_at?tokyoDay(Date.parse(record.created_at)):id.slice(0,10));
  const md=/^\d{4}-\d{2}-\d{2}$/.test(day)?day.slice(5):id.slice(0,10);
  return kind==='diaries'?`日记 ${md}.${record?.part??id.split('.')[1]??1}`:`唠叨 ${md}`;
};

function cooling(receipt,now){
  return Boolean(receipt&&now-Date.parse(receipt.refineDatetime)<refinementInterval);
}

function recordDay(kind,item){
  if(kind==='diaries')return item.day;
  const ts=Date.parse(item.created_at);
  return Number.isFinite(ts)?tokyoDay(ts):'';
}

function deterministicIssues(kind,record){
  const issues=[];
  const add=label=>{if(!issues.includes(label))issues.push(label);};
  if(kind==='diaries'){
    const body=String(record.body??'');
    const summary=String(record.summary??'');
    const tags=Array.isArray(record.tags)?record.tags:[];
    const threads=Array.isArray(record.threads)?record.threads:[];
    if(/用户|主任|主人|对方/u.test(body+summary)||/绯月(?!私语|当时回复|后记)/u.test(body))add('修正人称与称呼');
    const dialogueLines=(body.match(/^(?:你说|绯月当时回复|用户原话|老公说)[：:]/gmu)||[]).length;
    if(dialogueLines>=3||(dialogueLines>=2&&body.length>360))add('精简冗长对话');
    const sections=body.match(/【[^】]+】/gu)||[];
    const dupSections=sections.length-new Set(sections).size;
    const bareHeader=/(?:^|\n)[ \t]*【(?:你的日记|花园部署|当日消费|本机行动)】[ \t]*(?:\n[ \t]*)*(?:$|(?=【))/u.test(body);
    if(body.includes(emptyDiaryBody)||dupSections>0||bareHeader||/```|\{"[a-z_]+":|\[object Object\]/i.test(body))add('清理残渣与重复');
    if(/(?:昨天|前天|明天|后天|上周|下周)/u.test(body+threads.map(t=>t.text).join('')))add('锚定具体日期');
    if(!tags.length||tags.length>diaryTagLimit||tags.some(t=>genericTags.has(String(t).trim())))add('精炼页头Tag');
    if(!summary.trim()||/[\r\n]/u.test(summary)||[...summary].length>60)add('精简摘要骨架');
    const unresolved=threads.filter(t=>!t.resolved);
    if(unresolved.length>3||threads.some(t=>[...String(t.text??'')].length>90))add('整理悬念');
    return issues;
  }
  const before=String(record.beforeEvaluation??'');
  const after=String(record.afterEvaluation??'');
  const talk=Array.isArray(record.talk)?record.talk:[];
  const talkText=talk.map(line=>line.text??'').join('\n');
  if(/用户|主任|主人|对方/u.test(before+after)||/绯月(?!私语|后记)/u.test(before+after))add('修正人称与称呼');
  if(talk.length>=4||talkText.length>320)add('精简唠叨问答');
  if(!after.trim()||(record.source!=='audit'&&!before.trim()))add('补齐唠叨评价');
  if(/(?:昨天|前天|明天|后天|上周|下周)/u.test(before+after+talkText))add('锚定具体日期');
  if(/这句我先记下|待复核这轮回应/u.test(after+talkText))add('收束遗留评价');
  return issues;
}

function normalizeDiaryOutput(raw,record,clean){
  const body=clean(raw.body??'').trim();
  const summary=clean(raw.summary??'').replace(/[\r\n]+/gu,' ').trim();
  const seenTag=new Set(),tags=[];
  for(const item of Array.isArray(raw.tags)?raw.tags:[]){
    const text=clean(item).trim();
    if(!text||genericTags.has(text)||[...text].length>50||seenTag.has(text))continue;
    seenTag.add(text);tags.push(text);
    if(tags.length>=diaryTagLimit)break;
  }
  const origByNo=new Map((record.threads??[]).map(t=>[t.no,t]));
  const rawThreads=Array.isArray(raw.threads)?raw.threads:[];
  const keptNos=new Set(),threads=[];
  let nextNo=Math.max(0,...(record.threads??[]).map(t=>t.no??0))+1;
  for(const item of rawThreads){
    const text=clean(typeof item==='string'?item:item?.text??'').trim();
    if(!text)continue;
    const orig=Number.isInteger(item?.no)?origByNo.get(item.no):undefined;
    const no=orig&&!keptNos.has(orig.no)?orig.no:nextNo++;
    keptNos.add(no);
    threads.push({
      no,text:shorten(text,300),
      resolved:orig?Boolean(orig.resolved):Boolean(item?.resolved),
      asked:orig?Boolean(orig.asked):false,
      ...(orig?.at!==undefined?{at:orig.at}:{}),
      ...(orig?.priority!==undefined?{priority:orig.priority}:{})
    });
    if(threads.length>=8)break;
  }
  // 已被念叨过的悬念强制保留原编号和状态，防止历史唠叨断链，同时保持总长度不超过 8。
  for(const orig of record.threads??[]){
    if(!orig?.asked||keptNos.has(orig.no))continue;
    if(threads.length>=8){
      const dropIndex=threads.findIndex(item=>!item.asked);
      if(dropIndex>=0)threads.splice(dropIndex,1);
    }
    threads.push({
      no:orig.no,text:shorten(clean(orig.text).trim()||orig.text,300),
      resolved:Boolean(orig.resolved),asked:true,
      ...(orig.at!==undefined?{at:orig.at}:{}),
      ...(orig.priority!==undefined?{priority:orig.priority}:{})
    });
    keptNos.add(orig.no);
  }
  threads.sort((a,b)=>a.no-b.no);
  return {body,summary,tags,threads};
}

function normalizeNagOutput(raw,record,clean){
  const origTalk=Array.isArray(record.talk)?record.talk:[];
  const allowedTimes=origTalk.map(line=>line.at).filter(Boolean);
  const timeSet=new Set(allowedTimes);
  const fallbackAt=allowedTimes[0]??record.created_at??new Date().toISOString();
  let lastIndex=0;
  const talk=[];
  for(const item of Array.isArray(raw.talk)?raw.talk:[]){
    const who=['绯月','你','结束记录'].includes(item?.who)?item.who:null;
    const text=clean(item?.text??'').trim();
    if(!who||!text)continue;
    let at=typeof item.at==='string'&&timeSet.has(item.at)?item.at:null;
    if(at){
      const idx=allowedTimes.indexOf(at,lastIndex);
      if(idx>=0)lastIndex=idx;
      else at=allowedTimes[lastIndex]??fallbackAt;
    }else{
      at=allowedTimes[Math.min(lastIndex,allowedTimes.length-1)]??fallbackAt;
      if(lastIndex<allowedTimes.length-1)lastIndex++;
    }
    talk.push({who,at,text:shorten(text,12000)});
    if(talk.length>=24)break;
  }
  for(const end of origTalk.filter(line=>line.who==='结束记录')){
    if(!talk.some(line=>line.who==='结束记录'&&line.text===end.text)){
      if(talk.length>=24)talk.pop();
      talk.push({who:'结束记录',at:end.at,text:end.text});
    }
  }
  const fields={afterEvaluation:clean(raw.afterEvaluation??'').trim(),talk:talk.length?talk:origTalk};
  if(record.source!=='audit')fields.beforeEvaluation=clean(raw.beforeEvaluation??'').trim();
  return fields;
}

export function createMemoryRefinement({db,api,model,evidence,clean,cache,readTagPool,now=Date.now,loadSkill=readInteractionSkill}){
  db.exec(`CREATE TABLE IF NOT EXISTS memory_refinements (
    task_id TEXT PRIMARY KEY, active INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS memory_refinements_one ON memory_refinements(active) WHERE active=1;
    CREATE TABLE IF NOT EXISTS memory_refinement_checked (
      kind TEXT NOT NULL, record_id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(kind,record_id));`);
  const active=db.prepare('SELECT data FROM memory_refinements WHERE active=1');
  const history=db.prepare('UPDATE memory_refinements SET active=0,data=? WHERE task_id=? AND active=1');
  const noChange=db.prepare('DELETE FROM memory_refinements WHERE task_id=? AND active=1');
  const checkpoint=db.prepare('UPDATE memory_refinements SET data=? WHERE task_id=? AND active=1');
  const readChecked=db.prepare('SELECT fingerprint FROM memory_refinement_checked WHERE kind=? AND record_id=?');
  const writeChecked=db.prepare('INSERT OR REPLACE INTO memory_refinement_checked VALUES(?,?,?)');
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
    return refinementDigest([refinementRuleVersion,job.skill.version,fields,job.quotes]);
  }

  function checkedMeta(kind,id){
    const raw=readChecked.get(kind,id)?.fingerprint;
    if(!raw)return null;
    try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&parsed.fp)return parsed;}catch{}
    return {fp:raw};
  }

  function saveChecked(kind,id,revision,skillVersion,fp){
    writeChecked.run(kind,id,JSON.stringify({v:refinementRuleVersion,sv:skillVersion,rev:revision,fp}));
  }

  async function complete(job,remote){
    const receipt=remote?.receipt??null;
    const fields=receipt?job.submission.fields:job.previous;
    const revision=receipt?receipt.revision:job.baseRevision;
    const fp=await fingerprint(job,fields);
    const result={kind:job.kind,id:job.id,ruleVersion:refinementRuleVersion,baseRevision:job.baseRevision,
      skillVersion:job.skill.version,issues:job.diagnosis?.issues??[],previous:job.previous,fields,note:receipt?job.note:'',receipt};
    db.exec('BEGIN');
    try{
      const saved=receipt?history.run(JSON.stringify(result),job.taskId):noChange.run(job.taskId);
      if(!saved.changes)throw Error('本机修订任务已变化');
      saveChecked(job.kind,job.id,revision,job.skill.version,fp);
      if(remote)cache?.(job.kind,remote.record);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return receipt?'已重写'+titleOf(job.kind)+' '+job.id:'本轮无需重写';
  }

  async function collectWindow(kind,monthFrom,today,signal){
    const items=[];
    for(let page=0;;page++){
      const list=await api(kind+'?page='+page,undefined,signal);
      signal.throwIfAborted();
      let passedWindow=false;
      for(const item of list.items??[]){
        const day=recordDay(kind,item);
        if(!day)continue;
        if(day<monthFrom){passedWindow=true;break;}
        if(day>today)continue;
        if(kind==='nags'&&!endedNag.has(item.status))continue;
        items.push({kind,id:idOf(kind,item),day,sortKey:kind==='diaries'?`${day}.0.${String(item.part).padStart(4,'0')}`:`${day}.1.${item.created_at??''}.${item.id}`,revision:item.revision});
      }
      if(passedWindow||!(list.items?.length)||(page+1)*pageLimit>=(list.total??0))break;
    }
    return items;
  }

  async function choose(signal){
    const currentNow=now();
    const today=tokyoDay(currentNow);
    const recentFrom=tokyoDay(currentNow-(priorityWindowDays-1)*dayMs);
    const monthFrom=tokyoDay(currentNow-(maxWindowDays-1)*dayMs);
    const [diaries,nags]=await Promise.all([
      collectWindow('diaries',monthFrom,today,signal),
      collectWindow('nags',monthFrom,today,signal)
    ]);
    const all=[...diaries,...nags];
    const recent=all.filter(item=>item.day>=recentFrom).sort((a,b)=>a.sortKey.localeCompare(b.sortKey));
    const older=all.filter(item=>item.day<recentFrom).sort((a,b)=>a.sortKey.localeCompare(b.sortKey));
    const ordered=[...recent,...older];
    if(!ordered.length)return null;
    const skill=await loadSkill('memoryRefinement');
    signal.throwIfAborted();
    for(const candidate of ordered){
      const saved=checkedMeta(candidate.kind,candidate.id);
      if(saved&&saved.v===refinementRuleVersion&&saved.sv===skill.version&&saved.rev===candidate.revision)continue;
      const route={kind:candidate.kind,id:candidate.id};
      let remote;
      try{remote=await api(pathFor(route),undefined,signal);}
      catch(error){
        signal.throwIfAborted();
        if(error.status!==404)throw error;
        continue;
      }
      signal.throwIfAborted();
      if(!canRefine(candidate.kind,remote.record)||cooling(remote.receipt,now()))continue;
      const task={...route,taskId:randomUUID(),skill,ruleVersion:refinementRuleVersion};
      await rebase(task,remote,signal);
      const fp=await fingerprint(task,task.previous);
      signal.throwIfAborted();
      if(saved?.fp===fp){
        saveChecked(candidate.kind,candidate.id,remote.record.revision,skill.version,fp);
        continue;
      }
      db.prepare('INSERT INTO memory_refinements VALUES(?,1,?)').run(task.taskId,JSON.stringify(task));
      return task;
    }
    return null;
  }

  async function rebase(job,remote,signal){
    const {record,quotes}=remote;
    const previous=refinementText(job.kind,record);
    const sources=await evidence?.(job.kind,job.id,record,signal,remote.subject)??[];
    signal.throwIfAborted();
    if(job.submission&&JSON.stringify([previous,sources,quotes])===JSON.stringify([job.previous,job.evidence,job.quotes])){
      job.baseRevision=record.revision;
      job.submission.refineId=randomUUID();
      job.sent=false;
      return;
    }
    const context=job.kind==='diaries'?{
      date:record.day,timezone:'Asia/Tokyo',weather:record.weather??'',mood:record.mood??'',part:record.part
    }:{
      date:tokyoDay(Date.parse(record.created_at)),timezone:'Asia/Tokyo',source:record.source,
      title:record.title,reason:record.reason,status:record.status,mood:record.mood??''
    };
    Object.assign(job,{
      baseRevision:record.revision,
      rawRecord:record,
      previous,
      context,
      evidence:sources,
      quotes:quotes??[],
      direct:Boolean(record.direct),
      diagnosis:null,
      rewritten:null,
      review:null,
      reviewFeedback:'',
      attempts:0,
      note:'',
      submission:null,
      sent:false
    });
  }

  async function think(job,stage,data,signal,tokens){
    signal.throwIfAborted();
    const {skill}=job;
    const schema=skill.schemas?.[stage];
    if(!schema||!skill.localAi?.[stage])throw Error('修订 Skill 缺少阶段说明: '+stage);
    const instruction=[stage==='review'?skill.localAi.reviewRules??'':skill.localAi.rules??shorten(skill.content,260),
      skill.localAi[stage]].filter(Boolean).join('\n');
    const queued=Boolean(model.aiAck);
    const aiCheckpoint=queued?'refine:'+job.taskId+':'+await refinementDigest([stage,refinementRuleVersion,skill.version,job.baseRevision,job.attempts??0,data]):undefined;
    let output;
    try{
      output=await untilAbort(model.memory(JSON.stringify(data),instruction,schema,signal,{
        name:skill.skill,version:skill.version,stage,maxTokens:tokens,
        ...(job.direct?{aiPrivate:true,onDevice:true}:{}),
        ...(queued?{aiCheckpoint,aiRole:stage==='diagnose'||stage==='review'?'assist':'main',aiPriority:stage.startsWith('rewrite')&&job.reviewFeedback?2:1}:{})
      }),signal);
    }catch(error){
      signal.throwIfAborted();
      if(error.code==='LOCAL_AI_TASK_DISCARDED')outputKey=aiCheckpoint;
      if(error.code==='TimeoutError'||error.code==='LOCAL_AI_TIMEOUT')
        throw Object.assign(Error('重写单步超时，已保留进度'),{code:'LOCAL_AI_REFINEMENT_TIMEOUT'});
      throw error;
    }
    signal.throwIfAborted();
    if(!output||typeof output!=='object')throw Error('重写阶段结果格式无效');
    outputKey=aiCheckpoint;
    return output;
  }

  function verifyReceipt(job,remote){
    const {receipt}=remote;
    const {refineId,digest}=job.submission;
    if(receipt?.refineId!==refineId)return false;
    if(receipt.digest!==digest||receipt.revision!==job.baseRevision+1||!Number.isFinite(Date.parse(receipt.refineDatetime)))
      throw Error('服务端修订回执与本机备份不一致');
    return true;
  }

  async function submit(job,signal,progress){
    const label=shortLabel(job.kind,job.rawRecord,job.id);
    progress({stage:'重写 '+label+' · 提交同步',done:4,total:4});
    const path=pathFor(job),remote=await api(path,undefined,signal);
    signal.throwIfAborted();
    if(verifyReceipt(job,remote))return complete(job,remote);
    if(remote.record.revision!==job.baseRevision){
      if(job.sent&&remote.receipt?.revision>job.baseRevision+1)throw Error('最近回执已有更新，本次提交仍待核对');
      if(!canRefine(job.kind,remote.record))throw Error('原记录暂不可重写，已保留本机稿件');
      if(cooling(remote.receipt,now()))return '原记录刚修订过，等待七天冷却';
      await rebase(job,remote,signal);store(job);
      return '记录版本已变化，下轮从同一条重新核对';
    }
    const {refineId,fields}=job.submission;
    job.sent=true;store(job);
    await api(path,{refineId,baseRevision:job.baseRevision,fields},signal);
    signal.throwIfAborted();
    const saved=await api(path,undefined,signal);
    signal.throwIfAborted();
    if(!verifyReceipt(job,saved))throw Error('重写已发送，等待回读核实');
    return complete(job,saved);
  }

  async function run(signal,progress=()=>{}){
    if(running)return {deferred:true};
    running=true;
    let job;
    try{
      signal.throwIfAborted();
      if(!api)return '未配置云端连接，跳过重写';
      job=JSON.parse(active.get()?.data??'null');
      if(job&&(!job.ruleVersion||!job.rawRecord)){
        noChange.run(job.taskId);
        job=null;
      }
      if(!job)job=await choose(signal);
      if(!job)return '本轮没有符合条件的重写';
      if(job.submission)return await submit(job,signal,progress);

      const label=shortLabel(job.kind,job.rawRecord,job.id);
      const materials=(job.evidence??[]).map((source,index)=>({...source,id:'材料'+(index+1),snippet:shorten(source.snippet,160)}));

      // Step 1: 体检问题
      if(!job.diagnosis){
        progress({stage:'重写 '+label+' · 体检问题',done:1,total:4});
        const ruleIssues=deterministicIssues(job.kind,job.rawRecord);
        const aiDiag=await think(job,'diagnose',{
          kind:titleOf(job.kind),id:job.id,context:job.context,record:job.previous,ruleIssues,materials
        },signal,420);
        const aiIssues=Array.isArray(aiDiag.issues)?aiDiag.issues.map(s=>String(s??'').trim()).filter(Boolean):[];
        const merged=[...new Set([...ruleIssues,...aiIssues])].slice(0,5);
        const needsRewrite=merged.length>0||aiDiag.needsRewrite==='yes';
        job.diagnosis={needsRewrite,issues:merged,plan:String(aiDiag.plan??'').trim()};
        store(job);
      }
      if(!job.diagnosis.needsRewrite&&!job.diagnosis.issues.length)return await complete(job,null);

      // Step 2: 整篇重写
      if(!job.rewritten){
        const issueHint=job.diagnosis.issues.slice(0,3).join('/')||'整篇重写';
        progress({stage:'重写 '+label+' · '+issueHint,done:2,total:4});
        const stage=job.kind==='diaries'?'rewriteDiary':'rewriteNag';
        const payload=job.kind==='diaries'?{
          id:job.id,context:job.context,current:job.previous,
          issues:job.diagnosis.issues,plan:job.diagnosis.plan,
          tagPool:(readTagPool?.()??[]).slice(0,80),
          mustKeep:[...protectedDiaryText(job.previous.body),...(job.quotes??[])],
          lockedAskedThreads:(job.previous.threads??[]).filter(t=>t.asked).map(({no,text,resolved})=>({no,text,resolved})),
          materials,reviewFeedback:job.reviewFeedback||undefined
        }:{
          id:job.id,context:job.context,current:job.previous,
          issues:job.diagnosis.issues,plan:job.diagnosis.plan,
          allowedTimes:(job.previous.talk??[]).map(t=>t.at),
          requiredEndRecords:(job.previous.talk??[]).filter(t=>t.who==='结束记录'),
          materials,reviewFeedback:job.reviewFeedback||undefined
        };
        const out=await think(job,stage,payload,signal,job.kind==='diaries'?2800:1800);
        const candidate=job.kind==='diaries'?normalizeDiaryOutput(out,job.rawRecord,clean):normalizeNagOutput(out,job.rawRecord,clean);
        const checked=checkedRefinement(job.kind,job.rawRecord,candidate,job.quotes);
        if(!checked){
          job.attempts=(job.attempts??0)+1;
          job.reviewFeedback='重写稿未通过字段或必留引用/编号校验，请确保保留附件锚点、引用短句、已念叨悬念编号及合法时间戳，且字数和Tag数合规。';
          store(job);
          if(job.attempts>=2){
            noChange.run(job.taskId);
            return '重写稿校验未通过，已放弃本轮留待后续重试';
          }
          return '重写稿待校验补正，已保留体检进度';
        }
        if(JSON.stringify(checked)===JSON.stringify(job.previous))return await complete(job,null);
        job.rewritten={fields:checked,note:shorten(clean(out.note??'').trim()||'已完成整篇重写。',200)};
        store(job);
      }

      // Step 3: 一次性整篇复核
      if(!job.review){
        progress({stage:'重写 '+label+' · 整篇复核',done:3,total:4});
        const review=await think(job,'review',{
          kind:titleOf(job.kind),id:job.id,context:job.context,
          issues:job.diagnosis.issues,original:job.previous,rewritten:job.rewritten.fields,materials
        },signal,240);
        if(!['accept','revise'].includes(review.decision))throw Error('整篇复核结论无效');
        job.review={decision:review.decision,reason:String(review.reason??'').trim()};
        if(job.review.decision==='revise'&&(job.attempts??0)<1){
          job.attempts=(job.attempts??0)+1;
          job.reviewFeedback=job.review.reason||'请按体检问题完整重写并纠正遗漏。';
          job.rewritten=null;
          job.review=null;
          store(job);
          return '整篇复核要求补正，已保留体检结果';
        }
        if(job.review.decision!=='accept'){
          noChange.run(job.taskId);
          return '整篇复核未通过，已放弃本轮留待后续重试';
        }
        job.note=job.rewritten.note;
        job.submission={refineId:randomUUID(),fields:job.rewritten.fields,digest:await refinementDigest(job.rewritten.fields)};
        store(job);
      }

      // Step 4: 提交同步
      return await submit(job,signal,progress);
    }catch(error){
      if(!job||error.code!=='LOCAL_AI_TASK_DISCARDED')throw error;
      noChange.run(job.taskId);acknowledge();
      return '重写任务执行超时，已释放留待后续重试';
    }finally{outputKey=undefined;running=false;}
  }
  return {run};
}
