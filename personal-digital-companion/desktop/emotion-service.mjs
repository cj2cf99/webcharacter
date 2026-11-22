import {createEmotionStore,inclinations} from './emotion-core.mjs';
import {readInteractionSkill} from './interaction-skills.mjs';
import {tokyoDay} from './conversation-history.mjs';
import {cleanMemory} from './personality-diary.mjs';
import {emotionMaterials} from './emotion-prompt.mjs';

const short={type:'string'};
export function fields(properties){
  return {type:'object',properties,required:Object.keys(properties),additionalProperties:false};
}
const phrase={...short,maxLength:180},emotionWord={...short,minLength:1,maxLength:6};
const expressionFields={delta:{enum:[-1,0,1]},positive:emotionWord,negative:emotionWord,
  line:{...phrase,minLength:1},want:phrase,condition:phrase,curiosity:{...short,maxLength:40}};
const noQuote={const:''};
const newDesireAssessment=fields({status:{const:'keep'},quote:noQuote,...expressionFields});
const priorDesireAssessment={oneOf:[
  fields({status:{const:'keep'},quote:noQuote,...expressionFields,want:{const:''},condition:{const:''}}),
  fields({status:{const:'release'},quote:noQuote,...expressionFields}),
  fields({status:{const:'satisfied'},quote:{...phrase,minLength:1},...expressionFields})
]};
const word=v=>typeof v==='string'&&/^[\p{Script=Han}]{1,6}$/u.test(v);
const timeout=code=>code==='TimeoutError'||code==='LOCAL_AI_TIMEOUT';
export function weightedHistory(records){
  return records.slice(0,10).map(({at,mood,strength},i,items)=>({at,mood,strength:strength??null,
    weight:items.length===1?1:i===0?0.5:0.5/(items.length-1)}));
}
export function createEmotionService({profile,model,diary,memory,topics,now=Date.now,skill=readInteractionSkill,log}){
  const store=createEmotionStore(profile,{now}),deferred=new Map();
  let job,timer,controller,closed=false,paused=false,recovering;
  const warn=(stage,error)=>{void log?.({direction:'local',route:'绯月情绪',stage,error});};
  const pending=at=>store.pending([...deferred].filter(([,after])=>after>at).map(([id])=>id));
  function expression(){const {word,grade,line,desire}=store.snapshot();return {word,grade,line,desire:desire?.want};}
  function accept(event){
    if(closed)return;
    try{
      if(store.accept({...event,user:cleanMemory(event.user),reply:cleanMemory(event.reply),title:cleanMemory(event.title)})){
        if(timer){clearTimeout(timer);timer=null;}
        wake();
      }
    }catch{warn('记录待从业务来源补读');}
  }
  function feedback(roundId,receipt){
    if(closed||!roundId)return;
    store.pool.respond(roundId,receipt);
  }
  function chat(turn){
    if(turn.state!=='answer'||turn.imageJob||turn.serverTaskId||turn.emotionSkip||turn.retry&&!turn.interactionId)return;
    accept({kind:'chat',key:'chat/'+(turn.interactionId||turn.id),at:turn.answeredAt??turn.at,publicTerm:turn.publicTerm,user:turn.question,reply:turn.text,prior:turn.emotionPrior});
    feedback(turn.inReplyToInitiative,/^(结束追问|不想再聊这个|这件事到此为止)[。！!]?$/u.test(turn.question?.trim())?'用户结束':'收到用户回应：'+(turn.interactionId??turn.id));
  }
  function taskRows(rows){
    for(const r of rows)if(r.action==='完成花园登记'&&r.task_id?.startsWith('garden-batch:')){
      accept({kind:'work',key:'batch/'+r.task_id.slice(13),at:r.at,title:r.title});
      if(r.detail?.startsWith('绯月本机更新已核验\n'))accept({kind:'gain',key:'upgrade/'+r.task_id,at:r.at,title:'绯月本机更新已核验：'+r.title});
    }else if(/^第 \d+ 次执行成功$|^第 2 次执行失败$/u.test(r.action)){
      accept({kind:'work',key:'task/'+r.task_id,at:r.at,title:r.title});
    }
  }
  function wake(delay=150){
    if(paused||closed||timer||job)return;
    timer=setTimeout(()=>{timer=null;void drain();},delay);timer.unref?.();
  }
  function drain(){
    if(paused||closed||job)return job;
    controller=new AbortController();const {signal}=controller;
    let retry=false,eventId;
    job=(async()=>{
      store.week();
      const e=pending(now());if(!e)return;eventId=e.seq;
      const [appraisal,loop]=await Promise.all([skill('emotionAppraisal'),skill('loveAndReason')]);
      signal.throwIfAborted();
      const s=store.snapshot(),facts=JSON.parse(e.payload);
      const history=diary.emotionalHistory();
      const historyGroup=rows=>weightedHistory(rows).map(({at,mood,strength})=>{
        // 手记使用业务日期，念叨保存带时区的实际发生时刻。
        let day=null;
        if(typeof at==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(at))day=at;
        else{
          const time=typeof at==='number'?at:typeof at==='string'&&/(?:Z|[+-]\d\d:\d\d)$/i.test(at)?Date.parse(at):NaN;
          if(Number.isFinite(time))day=tokyoDay(time);
        }
        return [day,String(mood).slice(0,10),strength];
      });
      const desire=s.desire&&s.desire.id===e.prior&&s.desire.at<=e.at?s.desire:null;
      const context={事件:e.kind,...(e.kind==='chat'?{用户:facts.user,绯月:facts.reply}:{事实:facts.title}),
        当前情绪:s.word,档位:s.grade,事件前欲求:desire&&{want:desire.want,condition:desire.condition},
        本周:inclinations[store.week()-1],喜好:topics?.preferences()??[],手记:historyGroup(history.pages),念叨:historyGroup(history.nags)};
      const eventRule=e.kind==='chat'?'完整交流按实际影响填 delta：关心陪伴 +1，普通指令 0，明确伤害 -1。':
        '本次证据只有事实标题。登记、发布、整理等记录只证明标题明确记载的工作。核对标题具体完成了什么：若没有写明旧欲求所需的能力、对象或效果，quote 填空串，status 填 keep。delta 填 0，curiosity 留空。';
      const instruction=[appraisal.localAi.assess,eventRule,loop.localAi.assessment].join('\n\n');
      const a=await model.memory(emotionMaterials(context),instruction,desire?priorDesireAssessment:newDesireAssessment,signal,
        {name:appraisal.skill,version:appraisal.version,stage:'情绪复盘',boundedOutput:true,backgroundBudget:true,maxTokens:384,aiBudget:45000});
      signal.throwIfAborted();
      if(![-1,0,1].includes(a.delta)||!['keep','release','satisfied'].includes(a.status)||!word(a.positive)||!word(a.negative)||
        !['line','quote','want','condition'].every(k=>typeof a[k]==='string'&&a[k].length<=180)||!a.line.trim()){
        deferred.set(e.seq,Infinity);warn('评价字段无效，保留待评','EMOTION_RESULT_INVALID');return;
      }
      store.settle(e,a,{skill:appraisal.version,loop:loop.version,model:'Qwen3.5 Aggressive 9B',context});
      deferred.delete(e.seq);
      if(topics&&typeof a.curiosity==='string'&&a.curiosity.length>=2&&a.curiosity.length<=40&&facts.user.includes(a.curiosity)){
        try{await topics.remember(a.curiosity,e.key);}
        catch{warn('情绪评价已保存，该专题偏好未写入');}
      }
    })().catch(error=>{
      const code=typeof error?.code==='string'?error.code:error?.name??'EMOTION_EVALUATION_FAILED';
      if(signal.aborted||code==='LOCAL_AI_GPU_DEFERRED'||/忙碌|BUSY|未就绪|NOT_READY|STOPPED/.test(String(error?.message))||eventId===undefined)retry=true;
      else if(timeout(code)&&!deferred.has(eventId)){
        deferred.set(eventId,now()+30000);
        warn('评价超时，稍后重试');
      }else{
        deferred.set(eventId,Infinity);
        warn('这条材料待下次补评',code);
      }
    }).finally(()=>{
      job=null;controller=null;
      if(closed||paused)return;
      const at=now();
      if(pending(at))wake(retry?30000:200);
      else{
        const next=Math.min(...[...deferred.values()].filter(after=>after>at));
        if(Number.isFinite(next))wake(Math.max(200,next-at));
      }
    });return job;
  }
  function recover(){
    if(recovering||closed)return recovering;
    recovering=(async()=>{
      const days=await memory.archiveDays();const since=tokyoDay(store.enabled-86400000);
      for(const day of days.filter(d=>d>=since).sort()){
        if(closed)return;
        const turns=await Promise.resolve().then(()=>memory.read(day)).catch(()=>{warn('当日对话待补读');return [];});
        for(const r of turns){
          if(closed)return;
          if(r.report?.job===r.id||r.imageJob){
            if(!r.report?.serverTaskId&&!r.serverTaskId)accept({kind:'work',key:'image/'+r.id,at:r.answeredAt??r.at,title:r.question});
          }else if(r.interactionId)chat(r);
        }
        if(!closed)taskRows(await Promise.resolve().then(()=>memory.readTasks(day)).catch(()=>{warn('当日任务待补读');return [];}));
      }
    })().catch(()=>warn('部分归档待补读')).finally(()=>{recovering=null;});
    return recovering;
  }
  return {store,expression,feedback,accept,chat,taskRows,drain,recover,wake,interrupt:()=>controller?.abort(),
    async pause(){paused=true;clearTimeout(timer);timer=null;controller?.abort();await job;},
    resume(){paused=false;for(const [id,after] of deferred)if(after===Infinity)deferred.delete(id);wake();},
    async close(){closed=true;clearTimeout(timer);controller?.abort();await Promise.allSettled([job,recovering]);store.close();}};
}
