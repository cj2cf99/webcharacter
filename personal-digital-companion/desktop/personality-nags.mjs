import {untilAbort} from './chat-budget.mjs';
import {createDiaryAudit} from './diary-audit.mjs';
import {readInteractionSkill} from './interaction-skills.mjs';
import {createHash} from 'node:crypto';
import {tokyoDay} from './conversation-history.mjs';
import {cleanMemory} from './personality-diary.mjs';
import {answeredQuestion,isPendingQuestion,pendingLimit,questionReminder,questionTarget,questionText} from './pending-questions.mjs';

const dayMs=86400000;
const game=/游戏|遊戲|ゲーム|娱乐|娛樂|娯楽|gaming|entertainment/i;
const refund=/退款|返金|退费|refund/i;
const unknown=s=>!s||/未知|其他|不明|未分类|未分類|unknown|other/i.test(s);
const brief=(s,n)=>Array.from(cleanMemory(s)).slice(0,n).join('');
const iso=at=>new Date(at).toISOString();

export function createPersonalityNags({store,emotion,initiative,show,idle,canContinue=()=>true,notify=()=>{},changed=()=>{},onAnswered,questionImage,now=Date.now,random=Math.random}){
  let active=null,syncJob=null,stopped=false,working=false;
  const lifetime=new AbortController();
  const pendingQuestions=()=>store.nags().filter(isPendingQuestion)
    .sort((a,b)=>(b.priority??3)-(a.priority??3)||a.created_at?.localeCompare(b.created_at)||a.id.localeCompare(b.id));
  const pending=()=>pendingQuestions()[0];
  for(const n of store.nags().filter(isPendingQuestion)){
    if(n.status==='提问中'){n.status='意外中断';n.interruptions++;}
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
  async function think(stage,data,fields,signal){
    const skill=await readInteractionSkill('basicNag');signal.throwIfAborted();
    const prompt=skill.localAi?.[stage];if(!prompt)throw Error('念叨技能缺少阶段 '+stage);
    const priority=stage==='open'?' score 表示绯月现在有多想弄清：1 为稍有好奇，3 为值得关心，5 为关系、处境或安排上特别重要。':'';
    return store.think(data,prompt+priority,fields,signal,{name:skill.skill,version:skill.version});
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
    const pool=archive.filter(n=>answeredQuestion(n)&&n.source!=='nag'&&n.remaining&&!known.has('nag/'+n.id))
      .map(n=>({source:'nag',source_id:n.id,title:n.remaining,reason:'念叨里还有待核实的下文',stats:'',priority:3}));
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
  function ended(n){return n.questions>=3||n.turns>=Math.min(6,n.limit??6);}
  async function complete(n,status,signal){
    await onAnswered?.(n,signal);
    signal.throwIfAborted();
    finish(n,status);
  }
  function finish(n,status){
    n.status=status;
    if(status==='用户结束')talk(n,'结束记录','老公闷闷的不理我了');
    if(status==='回合结束')n.remaining=n.next||n.title;
    save(n);
    if(n.localInitiativeRound)emotion?.feedback(n.localInitiativeRound,status);
  }
  async function appraise(n,text,signal){
    const v=await think('reply',JSON.stringify({事项:n.title,问题:n.next,解释:brief(text,550),本机现场:n.localContext,此前情绪:n.mood,当前心情:emotion?.expression()}),
      ['reply','evaluation','mood','next'],signal);
    signal.throwIfAborted();
    if(!v.reply||!v.evaluation||!v.mood||typeof v.next!=='string')throw Error('回应尚未生成');
    return v;
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
  async function pollAudit(signal){
    if(working||active||audit.active||!idle())return {deferred:true};
    if(pendingQuestions().length>=pendingLimit)return {detail:remind()};
    working=true;
    try{
      const result=await audit.prepare(signal);
      if(result.n&&queue(result.n))return {detail:'已新增 1 个手记质问'};
      if(!result.deferred&&pending())remind();
      if(result.n)return {detail:'已拟出手记质问，本轮未能加入待确认'};
      return result.detail??result;
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
      if(pool.length){
        const source=pool[Math.floor(random()*pool.length)];
        progress({stage:'准备一个待确认问题'});
        const v=await think('open',JSON.stringify([source.title,source.reason,source.stats,emotion?.expression()]),['question','evaluation','mood','score'],signal);
        signal.throwIfAborted();
        const mood=emotion?.expression().word??v.mood;
        if(!v.evaluation||!mood||!questionText(v.question))throw Error('没有取得可用的念叨问题');
        if(/^[1-5]$/u.test(v.score)&&source.source!=='diary')source.priority=Number(v.score);
        if(enqueue(source,{prompt:v.question,evaluation:v.evaluation,mood}))return {detail:'已新增 1 个待确认问题'};
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
        await complete(n,heard.next.trim()?'回合结束':'已解释',signal);return '已按上次留下的解释收尾';
      }
      talk(n,'绯月',heard.reply);setFollowUp(n,next);save(n);
    }
    signal.throwIfAborted();
    if(!idle()||!canContinue())return {deferred:true};
    const sceneImage=n.source==='curiosity'&&await questionImage?.(n);
    signal.throwIfAborted();
    const session={id:n.id,audit:true,prompt:[n.localContext,n.next].filter(Boolean).join('\n'),sceneImage,signal,controller:new AbortController(),visible,leave,reply};
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
        active=null;return {text:result,done:true};
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
        await complete(n,v.next.trim()?'回合结束':'已解释',session.controller.signal);active=null;
        return {text:v.reply,done:true};
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
    return next&&!n.talk.some(t=>t.who==='绯月'&&t.text===next)?next:'';
  }
  function setFollowUp(n,next){n.next=next;n.questions++;n.turns++;talk(n,'绯月',next);}
  async function completeTopic(n,signal){
    await complete(n,'已解释',signal);
    return '线索已记下，我会继续整理专题。';
  }
  return {assessPending,poll,pollAudit,resume,enqueue,remind,recoverAudit:audit.recover,pending,pendingQuestions,flush:sync,async close(){
    audit.close();active?.leave('interrupted');stopped=true;lifetime.abort();await syncJob;
  }};
}
