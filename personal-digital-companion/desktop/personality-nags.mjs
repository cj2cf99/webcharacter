import {diaryQuestionBudgetMs,untilAbort} from './chat-budget.mjs';
import {createDiaryAudit} from './diary-audit.mjs';
import {readInteractionSkill} from './interaction-skills.mjs';
import {createHash} from 'node:crypto';
import {deferredNagReply,explicitRoleCorrection,nagReplyKey as replyKey,reusedLongReply} from './nag-reply-check.mjs';
import {tokyoDay} from './conversation-history.mjs';
import {cleanMemory} from './personality-diary.mjs';
import {answeredQuestion,emptyFollowUp,isPendingQuestion,pendingLimit,questionReminder,questionTarget,questionText,sameQuestion} from './pending-questions.mjs';

const dayMs=86400000;
const game=/游戏|遊戲|ゲーム|娱乐|娛樂|娯楽|gaming|entertainment/i;
const refund=/退款|返金|退费|refund/i;
const unknown=s=>!s||/未知|其他|不明|未分类|未分類|unknown|other/i.test(s);
const brief=(s,n)=>Array.from(cleanMemory(s)).slice(0,n).join('');
const iso=at=>new Date(at).toISOString();
const citationLength=150;
const replyBudget=25000;
const replyStatus=value=>value.deferred||value.next.trim()?'回合结束':'已解释';

function repeatsQuestion(text,questions){
  const key=replyKey(text);
  const clauses=text.split(/[。！？?!，,；;：:\r\n]/u).map(replyKey);
  return questions.some(question=>question&&(key===question||clauses.includes(question)||(question.length>=12&&key.includes(question))));
}

function diaryCitationLines(reading){
  return reading.split(/(?<=[。！？?!；;])|\r?\n/u).flatMap(line=>{
    if(Array.from(line).length<=citationLength)return [line];
    return line.split(/(?<=[，,、：:])/u).flatMap(part=>{
      const characters=Array.from(part);
      const sections=[];
      for(let start=0;start<characters.length;start+=citationLength){
        sections.push(characters.slice(start,start+citationLength).join(''));
      }
      return sections;
    });
  }).map(line=>line.trim()).filter(Boolean);
}

export function createPersonalityNags({store,emotion,initiative,show,idle,canContinue=()=>true,notify=()=>{},changed=()=>{},onAnswered,questionImage,now=Date.now,random=Math.random}){
  let active=null,syncJob=null,stopped=false,working=false;
  const lifetime=new AbortController();
  const pendingQuestions=()=>store.nags().filter(isPendingQuestion)
    .sort((a,b)=>(b.priority??3)-(a.priority??3)||a.created_at?.localeCompare(b.created_at)||a.id.localeCompare(b.id));
  const pending=()=>pendingQuestions()[0];
  for(const n of store.nags().filter(isPendingQuestion)){
    const last=n.talk?.at(-1);
    if(n.source!=='audit'&&n.questions>1&&last?.who==='绯月'&&last.text===n.next&&emptyFollowUp(n.next)&&
      n.talk.at(-2)?.who==='绯月'&&n.talk.at(-3)?.who==='你'){
      n.talk.pop();n.next='';n.questions--;n.turns--;n.status='已解释';
    }else if(n.status==='提问中'){n.status='意外中断';n.interruptions++;}
    else if(n.localQuestion)continue;
    n.localQuestion=true;delete n.notBefore;store.saveNag(n);
  }
  let resync=false;
  function sync(signal){
    if(syncJob){if(!signal)resync=true;return untilAbort(syncJob,signal);}
    const combined=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;
    if(!stopped)syncJob=(async()=>{do{combined.throwIfAborted();resync=false;await store.syncNags(combined);}while(resync&&!stopped);})().catch(()=>{}).finally(()=>{syncJob=null;});
    return syncJob;
  }
  function save(n){n.localQuestion=true;store.saveNag(n);changed();if(answeredQuestion(n)&&!n.localOnly)void sync();}
  const audit=createDiaryAudit({store,show,idle,canContinue,save,now,random});
  function talk(n,who,text){n.talk.push({who,text,at:iso(now())});}
  async function think(stage,data,fields,signal,aiPriority,aiCurrentPriority,selected){
    const skill=selected??await readInteractionSkill('basicNag');signal.throwIfAborted();
    const prompt=skill.localAi?.[stage];if(!prompt)throw Error('念叨技能缺少阶段 '+stage);
    const guidance=stage==='open'?' question 写明希望他回答或核实的一件具体事，可用自然的请求语气。若只是关心、分享或事情已核实，question 填空字符串 ""。score 表示绯月现在有多想弄清：1 为稍有好奇，3 为值得关心，5 为关系、处境或安排上特别重要。':'';
    return store.think(data,prompt+guidance,fields,signal,{name:skill.skill,version:skill.version,stage,
      aiReview:stage==='open',aiTier:stage==='reply'?'4':'2',aiBudget:stage==='reply'?replyBudget:undefined,aiPriority,aiCurrentPriority,
      ...(stage==='reply'?{boundedOutput:true,maxTokens:384}:{})});
  }
  const assessments=new Map();
  async function verdict(stage,data,signal){
    if(!initiative)return (await think(stage,data,['answer'],signal)).answer;
    const key=createHash('sha256').update(stage+'\n'+data).digest('hex');
    const cached=store.verdict(key);if(cached)return cached;
    if(assessments.size<100)assessments.set(key,{stage,data});
    return null;
  }
  async function assessPending(signal){
    for(const [key,{stage,data}] of [...assessments].slice(0,3)){
      const {answer}=await think(stage,data,['answer'],signal);signal.throwIfAborted();
      if(['是','否'].includes(answer)){store.verdict(key,answer);assessments.delete(key);}
    }
  }
  async function candidates(signal){
    const archive=store.nags();
    const day=i=>tokyoDay(now()-i*dayMs),known=new Set(archive.map(questionTarget));
    const pool=archive.flatMap(n=>{
      if(!answeredQuestion(n)||n.source==='nag'||known.has('nag/'+n.id))return [];
      const question=questionText(n.remaining);
      const key=replyKey(question);
      // 旧记录曾将复述用户原话、或已发出的追问写成待续事项。
      if(!key||n.talk.some(t=>['绯月','你'].includes(t.who)&&replyKey(t.text)===key))return [];
      return [{source:'nag',source_id:n.id,title:question,reason:'念叨里还有待核实的下文',stats:'',priority:3}];
    });
    for(const p of store.pages(day(6)).filter(p=>p.day>=day(6)&&p.day<=day(0))){
      for(const t of p.threads.slice(0,3)){
        const id=p.day+'.'+p.part+'/'+t.no;
        if(!t.asked&&!t.resolved&&!known.has('diary/'+id))pool.push({source:'diary',source_id:id,title:t.text,reason:'日记中的未解悬念',stats:'',priority:t.priority??3});
      }
    }
    const byId=new Map();
    let cursor='',complete=true;
    const cursors=new Set();
    try{
      do{
        const query=new URLSearchParams({from:day(14),to:day(0),cursor});
        const p=await store.api('expenses?'+query,undefined,signal);
        if(!Array.isArray(p.records))throw Error('消费来源未返回账目');
        complete=complete&&p.complete===true;
        for(const r of p.records)if(r.id&&Number(r.amount)>0&&!refund.test([r.category,r.description,r.tag?.name].join(' ')))byId.set(r.id,r);
        cursor=p.nextCursor||'';
        if(cursor&&cursors.has(cursor))throw Error('消费分页游标重复');
        cursors.add(cursor);
      }while(cursor);
    }catch(error){signal.throwIfAborted();if(!pool.length)throw error;return pool;}
    const records=[...byId.values()];
    const sorted=records.filter(r=>r.spendDate>=day(1)&&r.spendDate<=day(0)&&!known.has('paylog/'+r.id)).sort((a,b)=>b.amount-a.amount);
    const expenses=[];
    for(const r of sorted){
      let probable=false,fun=game.test([r.category,r.tag?.name].join(' '));
      if(!fun&&unknown(r.category)){
        const type=await verdict('classifyExpense',brief([r.merchant,r.description].join(' '),300),signal);
        probable=fun=type==='是';
      }
      if(!fun&&r.amount<3500)continue;
      const explanations=await store.explanations?.(r,day(0),day(1));
      let explained=false;
      for(let i=0;i<(explanations?.length??0);i+=3){
        const prior=await verdict('explained',JSON.stringify({账目:[r.id,r.spendDate,r.amount,r.merchant,r.description],用户原话:explanations.slice(i,i+3)}),signal);
        if(prior===null||prior==='是'){explained=true;break;}
      }
      if(explained)continue;
      function stats(start,end){
        const rows=records.filter(v=>v.category===r.category&&v.spendDate>=start&&v.spendDate<=end);
        return start+' 至 '+end+' '+rows.length+' 笔、'+rows.reduce((s,v)=>s+Number(v.amount),0)+' 日元';
      }
      expenses.push({source:'paylog',source_id:r.id,source_day:r.spendDate,title:brief(r.description||r.merchant||r.category||'用途待确认',240),
        reason:[r.amount+' 日元',r.amount>=3500?'大额消费':'',fun?(probable?'游戏或娱乐（推测）':'游戏或娱乐'):''].filter(Boolean).join(' · '),
        stats:(r.category||'未分类')+'：'+stats(day(7),day(1))+'；'+stats(day(14),day(8))+(complete?'':'（资料不全）'),priority:3});
      if(expenses.length===5)break;
    }
    return pool.concat(expenses);
  }
  function pickCandidate(pool){
    const start=Math.floor(random()*pool.length);
    for(let offset=0;offset<pool.length;offset++){
      const source=pool[(start+offset)%pool.length];
      if(source.source!=='diary')return {source};
      const citation=store.questionCitation?.(source,true);
      const reading=cleanMemory(citation?.quote);
      if(!reading)continue;
      const body=cleanMemory(citation.body);
      const position=body.indexOf(reading);
      // 已绑定的原话有时会在回顾中再次引用，不能因此丢弃其中的后续答复。
      const later=position<0?'':body.slice(position+reading.length).trim();
      return {source,reading,later};
    }
  }
  async function diaryOpening({source,reading,later},signal){
    const skill=await readInteractionSkill('basicNag');
    signal.throwIfAborted();
    const lines=diaryCitationLines(reading);
    const data={原题:source.title,出处:lines.map((原文,index)=>({行:index+1,原文})),同篇后文:later||undefined};
    const options={name:skill.skill,version:skill.version,boundedOutput:true,maxTokens:220,aiBudget:diaryQuestionBudgetMs};
    const check=await store.think(JSON.stringify(data),
      '先在 target 简短写出原题所问的一个答复项，再用原文和后文核对它。state 填 answered（已有答复）、open（材料明确说这个答复项还缺）、unrelated（材料没有涉及或无法确认）。只因材料里没有答案，就归 unrelated；不能把没提到的题当成未解。其他事项有缺口也归 unrelated。后文已有答复时填 answered。例：问资料去哪儿找，原文只说更新已验或只是关心，归 unrelated；写了资料在哪个页面归 answered；明确说资料页面还不清楚才归 open。问是否同行，已约好同行就归 answered，即使开门时间未知。answered 时 answer 写真实答复内容，否定答复也算。open 时 answer 留空，line 写说明该答复项还缺的行号整数。没有答复内容也没有原题缺项时归 unrelated。只做答案核对，别改写题目。',
      ['target','state','answer','line'],signal,{...options,stage:'diaryOpeningCheck',citationCount:lines.length});
    signal.throwIfAborted();
    const original=lines[Number(check.line)-1];
    if(check.state!=='open'||check.answer||!check.target||!original)return;
    const evidence=original;
    const draft=await store.think(JSON.stringify({已核对的待答信息:check.target,相关出处:evidence}),
      '用绯月的口吻直接问对方这项已核对的待答信息。一句问话或自然请托即可，保留自然句尾，省略称呼。出处已经单独显示，问话无需逐字重复出处。只问指定的待答信息。',
      ['question'],signal,{...options,stage:'diaryOpeningWrite'});
    signal.throwIfAborted();
    const question=questionText(draft.question?.replace(/^绯月[，,:：、]\s*/u,''));
    if(question&&question.length<=64)return {question,evidence,evaluation:'想听你补充手记里还没答复的这一项。',mood:'关心'};
  }
  function ended(n){return n.questions>=3||n.turns>=Math.min(6,n.limit??6);}
  async function complete(n,status,signal){
    await onAnswered?.(n,signal);
    signal.throwIfAborted();
    finish(n,status);
  }
  function finish(n,status){
    n.status=status;
    if(status==='用户结束')talk(n,'结束记录','老公闷闷的不理我了');
    if(status==='回合结束'){
      if(n.next)n.remaining=n.next;
      else delete n.remaining;
    }
    save(n);
    if(n.localInitiativeRound)emotion?.feedback(n.localInitiativeRound,status);
  }
  async function appraise(n,text,signal,thread){
    const {最新发言:latest,目的:purpose,...history}=thread?.context??{};
    const currentQuestion=replyKey(n.next);
    const inHistory=currentQuestion&&history.之前发言?.some(turn=>turn.发言者==='绯月'&&replyKey(turn.原话)===currentQuestion);
    const input={最新发言:latest??[{发言者:'你',原话:brief(text,550)}],事项:thread?.context?undefined:n.title,旧问题:inHistory?undefined:n.next,本机现场:n.localContext,
      此前情绪:n.mood,当前心情:emotion?.expression(),同线依据:thread?.context&&{...history,目的:replyKey(purpose)===currentQuestion?undefined:purpose}};
    const questions=[n.next,n.talk[0]?.who==='绯月'?n.talk[0].text:undefined,
      ...n.talk.filter(t=>t.who==='绯月'&&/[？?]\s*$/u.test(t.text)).map(t=>t.text)].map(replyKey);
    const userLines=[...input.最新发言.map(t=>t.原话),...n.talk.filter(t=>t.who==='你').map(t=>t.text)].map(replyKey).filter(Boolean);
    const latestText=input.最新发言.map(t=>t.原话).join('\n');
    const latestKey=replyKey(latestText),replyContexts=new Map();
    for(const [index,turn] of n.talk.entries()){
      if(turn.who!=='绯月')continue;
      const key=replyKey(turn.text),previous=n.talk[index-1];
      if(key.length>=12&&!replyContexts.get(key)){
        replyContexts.set(key,previous?.who==='你'&&replyKey(previous.text)===latestKey);
      }
    }
    const skill=await readInteractionSkill('basicNag');
    const deadline=AbortSignal.timeout(replyBudget),wait=AbortSignal.any([signal,deadline]);
    let mood=n.mood||'平静';
    for(let attempt=0;attempt<2;attempt++){
      signal.throwIfAborted();
      if(deadline.aborted)break;
      const data=attempt?{改写要求:'上一稿复述或串场。先接住刚说的具体事实或顾虑，一句就够，不引入旧话题。',最新发言:input.最新发言}:input;
      let v;
      try{
        v=await untilAbort(think('reply',JSON.stringify(data),['evaluation','mood','reply','next'],wait,
          thread?.priority,thread?.currentPriority,skill),wait);
      }catch(error){
        signal.throwIfAborted();
        if(attempt&&(deadline.aborted||['LOCAL_AI_TIMEOUT','LOCAL_AI_OUTPUT_BUDGET','LOCAL_AI_TIER_WAIT'].includes(error.code)))break;
        throw error;
      }
      signal.throwIfAborted();
      if(!v.reply?.trim()||!v.evaluation||!v.mood||typeof v.next!=='string'){
        if(attempt)break;
        throw Error('回应尚未生成');
      }
      mood=v.mood;
      const key=replyKey(v.reply);
      const role=explicitRoleCorrection(latestText,v.reply);
      if(role)return {reply:role,evaluation:'已按你的原话核对人物归属。',mood,next:''};
      if(!key||repeatsQuestion(v.reply,questions)||userLines.includes(key)||
        !replyContexts.get(key)&&(replyContexts.has(key)||
          key.length>=45&&reusedLongReply(key,latestText,thread?.archive??store.nags(),n.id)))continue;
      const next=questionText(v.next);
      return {...v,next:next&&!repeatsQuestion(next,questions)&&!userLines.includes(replyKey(next))&&
        !explicitRoleCorrection(latestText,next)?next:''};
    }
    return {reply:deferredNagReply,evaluation:'已保存原话，待复核这轮回应。',mood,next:'',deferred:true};
  }
  function remind(added=false){
    const queue=pendingQuestions(),preferred=queue[0];
    const message=questionReminder(queue.length,added);
    if(message)notify(message,preferred?.id);
    return message;
  }
  function enqueue(source,{prompt=source.title,evaluation='',mood='',announce=true}={}){
    if(pendingQuestions().length>=pendingLimit){if(announce)remind();return false;}
    const next=questionText(prompt);
    if(!next)return false;
    const id='nag-'+createHash('sha256').update(questionTarget(source)).digest('hex');
    const n={...source,id,title:source.title.slice(0,300),created_at:iso(now()),revision:0,talk:[],turns:1,questions:1,interruptions:0,
      status:'等待回应',next,mood,before:mood,beforeEvaluation:evaluation};
    talk(n,'绯月',next);
    return queue(n,announce);
  }
  function queue(n,announce=true){
    if(!store.queueQuestion(n))return false;
    changed();
    if(announce)remind(true);
    return true;
  }
  async function pollAudit(signal,progress){
    if(working||active||audit.active||!idle())return {deferred:true};
    if(pendingQuestions().length>=pendingLimit)return {detail:remind()};
    working=true;
    try{
      const result=await audit.prepare(signal,progress);
      if(result.n&&queue(result.n))return {detail:'已新增 1 个手记质问'};
      if(!result.deferred&&pending())remind();
      if(result.n)return {detail:'已拟出手记质问，本轮未能加入待确认'};
      return result.deferred?result:result.detail??result;
    }finally{working=false;}
  }
  async function poll(signal,{progress=()=>{},step}={}){
    if(working||active||audit.active||!idle())return {deferred:true};
    if(pendingQuestions().length>=pendingLimit)return {detail:remind()};
    working=true;
    try{
      await sync(signal);
      progress({stage:'核对待续事项'});
      try{await store.refresh?.(signal);}catch{signal.throwIfAborted();}
      if(pendingQuestions().length>=pendingLimit)return {detail:remind()};
      let pool=[];
      try{pool=await candidates(signal);}catch(error){signal.throwIfAborted();if(!initiative&&!pending())throw error;}
      const candidate=pickCandidate(pool);
      if(candidate){
        const {source,reading}=candidate;
        progress({stage:'准备一个待确认问题'});
        const v=reading?await diaryOpening(candidate,signal):source.source==='nag'?
          {question:source.title,evaluation:source.reason,mood:'关心'}:
          await think('open',JSON.stringify([source.title,source.reason,source.stats,emotion?.expression()]),['question','evaluation','mood','score'],signal);
        signal.throwIfAborted();
        if(v?.question?.trim()&&!emptyFollowUp(v.question)){
          const mood=emotion?.expression().word??v.mood;
          if(!v.evaluation||!mood||!questionText(v.question))throw Error('没有取得可用的念叨问题');
          if(/^[1-5]$/u.test(v.score)&&source.source!=='diary')source.priority=Number(v.score);
          if(enqueue(reading?{...source,localQuestionEvidence:v.evidence}:source,{prompt:v.question,evaluation:v.evaluation,mood}))return {detail:'已新增 1 个待确认问题'};
        }
      }
      if(pending())return {detail:remind()};
      if(initiative){
        emotion.store.pool.closeSources(store.nags().map(questionTarget));
        return await initiative.choose([],signal,idle,undefined,step);
      }
      return '没有待问事项';
    }finally{working=false;}
  }
  async function resume(id,signal){
    const pending=pendingQuestions();
    if(working||active||audit.active||!idle()||!canContinue())return {deferred:true};
    const n=pending.find(row=>row.id===id);
    if(!n)return '这条质问已经结束。';
    working=true;
    try{return await (n.source==='audit'?audit.resume(n,signal):resumeNag(n,signal));}
    finally{working=false;}
  }
  async function resumeNag(n,signal){
    signal.throwIfAborted();
    if(n.talk.at(-1)?.who==='你'){
      if(n.source==='topic')return completeTopic(n,signal);
      const heard=await appraise(n,n.talk.at(-1).text,signal);
      n.afterEvaluation=heard.evaluation;n.mood=heard.mood;delete n.localMoodStrength;
      const next=followUp(n,heard);
      if(!next||ended(n)){
        talk(n,'绯月',heard.reply);n.next=questionText(heard.next);
        await complete(n,replyStatus(heard),signal);
        return heard.deferred?heard.reply:'已按上次留下的解释收尾';
      }
      talk(n,'绯月',heard.reply);setFollowUp(n,next);save(n);
    }
    signal.throwIfAborted();
    if(!idle()||!canContinue())return {deferred:true};
    const sceneImage=n.source==='curiosity'&&await questionImage?.(n);
    signal.throwIfAborted();
    const citation=store.questionCitation?.(n);
    const cited=citation?.excerpt&&citation.label+'：'+citation.excerpt;
    const reference=citation?.reference&&'来源 · '+citation.reference;
    const session={id:n.id,audit:true,prompt:[n.localContext,reference,cited,n.next].filter(Boolean).join('\n'),sceneImage,signal,controller:new AbortController(),visible,leave,reply};
    function visible(){
      if(active!==session)return;
      n.status='提问中';save(n);
    }
    function leave(reason){
      if(active!==session)return;
      active=null;session.controller.abort();
      if(reason==='refuse'){finish(n,'用户结束');return;}
      n.status=reason==='later'||reason==='idle'?'等待回应':'意外中断';
      if(n.status==='意外中断')n.interruptions++;
      save(n);
    }
    async function reply(input){
      const text=store.nagText?await store.nagText(n,input,session.controller.signal):cleanMemory(input);
      if(!text||(!store.nagText&&Array.from(text).length>3000))return {text:'请把这次的解释控制在 3000 字以内。'};
      talk(n,'你',text);save(n);
      if(n.source==='topic'){
        const result=await completeTopic(n,session.controller.signal);
        active=null;return {text:result,done:true,finished:true};
      }
      const v=await appraise(n,text,session.controller.signal);
      if(!canContinue()){
        n.status='意外中断';save(n);active=null;
        return {text:'回答已留在本机，可以从「待确认」继续。',done:true};
      }
      n.afterEvaluation=v.evaluation;n.mood=v.mood;delete n.localMoodStrength;
      const next=followUp(n,v);
      talk(n,'绯月',v.reply);n.next=questionText(v.next);
      if(!next||ended(n)){
        await complete(n,replyStatus(v),session.controller.signal);active=null;
        return {text:v.reply,done:true,finished:true};
      }
      setFollowUp(n,next);save(n);
      return {text:v.reply+'\n'+next};
    }
    active=session;
    try{const displayed=await show(session);
      if(!displayed){active=null;return {deferred:true};}
    }catch(error){active=null;throw error;}
    return '已打开质问气泡。';
  }
  function followUp(n,v){
    const next=questionText(v.next);
    return next&&!n.talk.some(t=>t.who==='绯月'&&sameQuestion(t.text,next))?next:'';
  }
  function setFollowUp(n,next){n.next=next;n.questions++;n.turns++;talk(n,'绯月',next);}
  async function completeTopic(n,signal){
    await complete(n,'已解释',signal);
    return '线索已记下，我会继续整理专题。';
  }
  async function threadAnswer(line,messages,{signal,priority,currentPriority,context,stillLatest,isOpen}){
    if(active?.id===line.id)active.leave('later');
    audit.detachThread(line.id);
    const archive=store.nags(),n=archive.find(row=>row.id===line.id);
    if(!n)throw Error('原质问暂时无法读取');
    const key=messages[0].id;
    if(n.localThreadReceipts?.[key])return n.localThreadReceipts[key];
    if(!isPendingQuestion(n))throw Error('原质问已经收尾');
    const text=messages.filter(message=>!message.legacyPending).map(message=>message.text).join('\n');
    const last=n.talk.at(-1);
    if(!text&&messages[0].legacyPending&&last?.who==='你'&&last.threadMessage!==key){
      last.threadMessage=key;
      save(n);
    }
    if(!n.talk.some(t=>t.threadMessage===key)){
      const cleaned=store.nagText?await store.nagText(n,text,signal):cleanMemory(text);
      if(!cleaned)throw Error('请输入文字解释');
      if(!isOpen())return;
      talk(n,'你',cleaned);n.talk.at(-1).threadMessage=key;save(n);
    }
    const receipt=reply=>{(n.localThreadReceipts??={})[key]=reply;save(n);return reply;};
    if(n.source==='audit'){
      const outcome=await audit.threadAnswer(n,signal,priority,stillLatest,context,isOpen,currentPriority);
      if(!outcome||!isOpen())return;
      if(outcome.done&&!outcome.finished)throw Error(outcome.text);
      return receipt({reply:outcome.text+(outcome.finished?'\n我先把手记收到这里啦。':''),next:outcome.finished?'结束':'追问'});
    }
    if(n.source==='topic'&&stillLatest()){
      await onAnswered?.(n,signal);
      signal.throwIfAborted();
      if(!stillLatest())return isOpen()?receipt({reply:'线索已记下，我再看看你刚补的这句。',next:'回应'}):undefined;
      const result={reply:'线索已记下，我会继续整理专题。这个话题先聊到这里啦。',next:'结束'};
      (n.localThreadReceipts??={})[key]=result;
      finish(n,'已解释');
      return result;
    }
    const v=await appraise(n,text,signal,{priority,currentPriority,context,archive});
    if(!isOpen())return;
    n.afterEvaluation=v.evaluation;n.mood=v.mood;delete n.localMoodStrength;
    const next=followUp(n,v);
    talk(n,'绯月',v.reply);n.next=questionText(v.next);
    if((!next||ended(n))&&stillLatest()){
      const result={reply:v.deferred?v.reply:v.reply+'\n这件事我先记到这里啦。',next:'结束'};
      await onAnswered?.(n,signal);
      signal.throwIfAborted();
      if(!stillLatest())return isOpen()?receipt({reply:v.reply,next:'回应'}):undefined;
      (n.localThreadReceipts??={})[key]=result;
      finish(n,replyStatus(v));
      return result;
    }
    if(next)setFollowUp(n,next);
    return receipt({reply:[v.reply,next].filter(Boolean).join('\n'),next:next?'追问':'回应'});
  }
  function threadEnd(id){
    if(active?.id===id)active.leave('later');
    audit.detachThread(id);
    const n=store.nags().find(row=>row.id===id);
    if(!n||!isPendingQuestion(n))return;
    finish(n,'用户结束');
  }
  return {assessPending,poll,pollAudit,resume,enqueue,remind,recoverAudit:audit.recover,pending,pendingQuestions,threadAnswer,threadEnd,flush:sync,async close(){
    audit.close();active?.leave('interrupted');stopped=true;lifetime.abort();await syncJob;
  }};
}
