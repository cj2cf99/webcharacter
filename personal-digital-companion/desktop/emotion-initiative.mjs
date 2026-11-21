import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {atomicFile,optional} from './memory-archive.mjs';
import {tokyoDay} from './conversation-history.mjs';
import {readInteractionSkill} from './interaction-skills.mjs';
import {fields} from './emotion-service.mjs';
import {inclinations} from './emotion-core.mjs';
import {initiativeQuery,initiativeSearchLabels,searchInitiative} from './public-search.mjs';

const str={type:'string'},index={type:'integer'};
const types=['clarify','share','company','history','organize','preference','research'];
const row=fields({source:index,sin:{enum:[1,2,3,4,5,6,7]},type:{enum:types},want:{type:'string',maxLength:48},condition:{type:'string',maxLength:60}});
const proposal=fields({entries:{type:'array',items:row,maxItems:5},act:{type:'boolean'}});
const lookupActions=Object.keys(initiativeSearchLabels);
const decision=fields({action:{enum:['ask','speak','organize','preference','research','wait',...lookupActions]},conclusion:str,message:str,next:str});
const philosophy={ref:'personality/philosophy',title:'绯月自身的兴趣：哲学。可以从同一性、时间、选择或意义中提出一个真实好奇，也可以保持安静。'};
const publicInterests=[['identity','个人同一性 自我与记忆'],['time','时间知觉'],['choice','自由意志与选择'],['meaning','意义与日常生活']]
  .map(([id,publicTerm])=>({ref:philosophy.ref+'/'+id,title:'绯月自身的公开兴趣：'+publicTerm,publicTerm}));
const text=(s,n)=>typeof s==='string'&&s.trim().length>0&&s.length<=n;
export function createInitiative({emotion,root,speak,memory,localNags,topics,search=searchInitiative,now=Date.now,model,load=readInteractionSkill}){
  const store=emotion.store,pool=store.pool;
  async function choose(nags,signal,idle,threads,step){
    await topics?.ready;signal.throwIfAborted();
    const at=now(),last=pool.recent();
    const uncertain=pool.unsettled();
    if(uncertain){
      const {id,decision:d,observation}=uncertain,day=tokyoDay(observation.at);
      const nag=d.action==='ask'&&localNags?.().find(n=>n.localInitiativeRound===id&&n.talk?.some(t=>t.who==='绯月'));
      let receipt=nag?.id;
      if(d.action==='speak'){
        for(const date of new Set([day,tokyoDay(observation.at+86400000)])){
          receipt=(await memory.read(date)).find(t=>t.id===id&&t.initiative)?.id;
          if(receipt)break;
        }
      }else if(d.action!=='ask')receipt=topics?.decisionReceipt(id);
      const interruptedLookup=!receipt&&lookupActions.includes(d.action);
      if(!receipt&&!interruptedLookup)return {detail:'上次主动行动等待核实'};
      if(interruptedLookup)receipt='上次公开查询中断，没有本机保存回执';
      if(d.topicShare)await topics.announced(d.topicShare.id,d.topicShare.revision);
      const answered=nag&&(['用户结束','已解释','回合结束'].includes(nag.status)||nag.talk.some(t=>t.who==='你'));
      const adopt=['ask','speak'].includes(d.action)&&!answered;
      const status=interruptedLookup?'deferred':uncertain.trigger&&adopt?'feedback':'done';
      const path=join(root,'决策复盘',day,id+'.json'),raw=await optional(readFile(path,'utf8'));
      const audit=raw?JSON.parse(raw):{id,observation,decision:d};
      await atomicFile(path,JSON.stringify({...audit,status,receipt,endedAt:at},null,2)+'\n');
      pool.finish(id,status,receipt,{adopt});
    }
    const waiting=pool.feedback();
    if(waiting){
      const nag=waiting.decision.action==='ask'&&localNags?.().find(n=>n.localInitiativeRound===waiting.id&&
        ['用户结束','已解释','回合结束'].includes(n.status)&&n.talk?.some(t=>t.who==='绯月'));
      if(nag)pool.respond(waiting.id,nag.status);
      else return {detail:'等待上次指定欲望的回应'};
    }
    if(last&&at-last.observation.at<7200000)return {detail:'本轮名额已使用',nextAt:last.observation.at+7200000};
    const id=randomUUID(),current=store.snapshot();
    const refs=new Map();
    function add(f){
      if(f?.ref?.startsWith('diary/')&&threads?.handledThread(f.ref.slice(6)))return;
      if(f?.ref&&!refs.has(f.ref))refs.set(f.ref,f);
    }
    for(const n of nags)add({ref:n.source+'/'+n.source_id,title:[n.title,n.reason,n.stats].filter(Boolean).join(' · '),ask:n});
    for(const f of store.recentFacts())add({ref:f.ref,title:f.text,publicTerm:f.publicTerm});
    for(const t of topics?.pending?.()??[])add({ref:'topic/'+t.id,title:t.title,topic:t.id});
    for(const t of topics?.confirmed?.()??[]){
      const revision=t.versions?.length>1?t.versions.at(-1).revision:null;
      const ref='topic/'+t.id+(revision?'/v'+revision:'');
      add({ref,title:t.title+'：'+t.summary,share:t});
    }
    for(const pending of pool.waiting())add(store.fact(pending.source));
    const previousFocus=last?.decision?.next;
    const week=store.week();
    if(week===3){
      for(const fact of publicInterests){
        if(!pool.candidate({source:fact.ref,type:'research'}))continue;
        add(fact);
        break;
      }
    }
    if(!refs.size)add(philosophy);
    function actionsFor(fact){
      const actions=['wait','organize'];
      if(week===3&&topics?.note&&initiativeQuery(fact.publicTerm))actions.push(...lookupActions);
      if(fact.ask)actions.push('ask');
      else if(fact.topic)actions.push('research');
      else actions.push('speak','preference');
      return actions;
    }
    function requiredAction(type,actions){
      if(type==='clarify')return actions.includes('ask')?'ask':'speak';
      if(type==='research')return actions.includes('web')&&!actions.includes('research')?'web':'research';
      return ['share','company','history'].includes(type)?'speak':type;
    }
    function feasibleAction(row){
      const fact=refs.get(row.source);if(!fact)return null;
      const actions=actionsFor(fact),required=requiredAction(row.type,actions);
      return actions.includes(required)?required:null;
    }
    const forced=pool.forced(row=>{
      if(!refs.has(row.source))add(store.fact(row.source));
      return Boolean(feasibleAction(row));
    });
    if(!refs.size)add({ref:'personality/philosophy',title:'绯月自身的兴趣：哲学。可以从同一性、时间、选择或意义中提出一个真实好奇，也可以保持安静。'});
    const all=[...refs.values()],start=(last?.observation?.cursor??0)%Math.max(1,all.length);
    const slice=[...all.slice(start),...all.slice(0,start)].slice(0,last?.status==='stopped'?Math.max(1,Math.floor((last.observation.facts?.length??4)/2)):5);
    if(forced&&!slice.some(s=>s.ref===forced.row.source))slice.unshift(refs.get(forced.row.source));
    const facts=slice.map(({ref,title},i)=>({i,ref,title:title.slice(0,90)}));
    if(!facts.length)return {detail:'没有可核实的主动素材'};
    const observation={at,cursor:(start+slice.length)%all.length,previous:last?.id??null,focus:previousFocus,
      desire:current.desire?{want:current.desire.want,condition:current.desire.condition}:null,week:inclinations[store.week()-1],facts};
    const path=join(root,'决策复盘',tokyoDay(at),id+'.json');
    const audit={id,observation,status:'observed'};
    const save=()=>atomicFile(path,JSON.stringify(audit,null,2)+'\n');
    async function occupied(){
      audit.status='名额已使用';audit.endedAt=now();await save();
      return {detail:'本轮名额已使用'};
    }
    let dispatched=false;
    try{
      await save();
      const [skill,loop]=await Promise.all([load('initiativeDecision'),load('loveAndReason')]);
      audit.versions={initiative:skill.version,loop:loop.version,model:'Qwen3.5 Aggressive 9B'};
      const analyze=async(input,instruction,schema)=>{
        const phase=schema.properties.entries?'propose':'decide';
        audit[phase]={at:now(),input};await save();
        const answer=await model.memory(JSON.stringify(input),instruction,schema,signal,{name:skill.skill,version:skill.version});
        audit[phase].endedAt=now();return answer;
      };
      const allowedProposal=structuredClone(proposal);
      allowedProposal.properties.entries.items.properties.source={enum:facts.map(f=>f.i)};
      const p=await analyze({focus:previousFocus,desire:observation.desire,week:observation.week,
        series:inclinations,facts:facts.map(({i,title})=>({i,title})),forced:forced?.row.want},skill.localAi.propose+' 绯月天生持续喜欢哲学。已有具体想法先顾它；没有头绪时，先尝试对材料提出一个哲学角度，没兴趣仍可选择等待。',allowedProposal);
      signal.throwIfAborted();
      audit.proposal=p;
      if(!Array.isArray(p.entries)||p.entries.length>5||typeof p.act!=='boolean')throw Error('候选输出不完整');
      let selected=p.act&&p.entries.length?0:-1;
      const entries=p.entries.map(e=>{
        const fact=slice[e.source];if(!Number.isInteger(e.source)||!fact||!types.includes(e.type)||!Number.isInteger(e.sin)||e.sin<1||e.sin>7||!text(e.want,120)||!text(e.condition,120))throw Error('欲望缺少来源或满足条件');
        return {...e,source:fact.ref};
      });
      // 没有具体意图时，见底的心情才提供一次针对现有材料的整理机会。
      let chosen=forced?.row??pool.candidate(entries[selected]);
      if(!chosen&&!entries.length&&current.grade===-5){
        chosen=pool.waiting().find(feasibleAction);
        if(!chosen){
          for(const f of slice){
            if(f.ask||f.topic||f.share)continue;
            const tidy={source:f.ref,type:'organize',sin:6,want:'整理这条记录',condition:'已保存带出处的摘记'};
            chosen=pool.candidate(tidy);
            if(chosen){selected=entries.push(tidy)-1;break;}
          }
        }
      }
      audit.selected=chosen?.id??null;
      if(!chosen){
        if(!idle())throw Error('前台已占用名额');
        if(!pool.prepare(id,entries,-1,observation))return await occupied();
        pool.finish(id,'wait','没有选中欲望');audit.status='wait';await save();return {detail:'这轮先安静待着'};
      }
      const fact=refs.get(chosen.source);
      if(chosen.source.startsWith('diary/')&&threads&&!threads.claimThread(chosen.source.slice(6))){
        return {detail:'这个悬念今天已处理'};
      }
      const action=feasibleAction(chosen);
      const actions=action==='web'?['wait',...lookupActions]:action?['wait',action]:['wait'];
      const input={intent:chosen.want,condition:chosen.condition,forced:Boolean(forced),fact:fact.title,actions,mood:emotion.expression(),preferences:topics?.preferences?.(),previousFocus};
      if(action==='web')input.publicLookup={topic:fact.publicTerm,choices:initiativeSearchLabels};
      const allowedDecision=structuredClone(decision);allowedDecision.properties.action={enum:actions};
      const lookupGuide=action==='web'?' 按用途选来源：普通人对某事的看法用 x，媒体社论用 editorial，视觉参考用 images，事实与背景资料用 web。只查给定公开主题。':'';
      const d=await analyze(input,loop.localAi.nextStep+' '+skill.localAi.decide+' 具体行动优先。情绪影响表达，现实条件不具备才等待。ask/speak 的 message 是一句实际要说的话，整理写有出处的摘记。'+lookupGuide,allowedDecision);
      signal.throwIfAborted();audit.decision=d;audit.decisionInput=input;
      if(!actions.includes(d.action)||!text(d.conclusion,180)||!text(d.next,180)||typeof d.message!=='string'||d.message.length>180)throw Error('决定缺少依据或超出可用动作');

      if(!idle())throw Error('前台已占用名额');
      if(['ask','speak','preference'].includes(d.action)&&!text(d.message,180))throw Error('缺少提问或表达');
      if(!pool.prepare(id,entries,forced||d.action==='wait'?-1:selected,observation))return await occupied();
      if(d.action==='wait'){pool.finish(id,'wait',d.conclusion);audit.status='wait';await save();return {detail:'留待下次：'+d.next};}
      const topicShare=d.action==='speak'&&fact.share?{id:fact.share.id,revision:fact.share.versions?.at(-1)?.revision??fact.share.revision}:null;
      if(!pool.dispatch(id,chosen.id,forced?.trigger,topicShare?{...d,topicShare}:d))throw Error('主动名额已占用');
      dispatched=true;
      audit.status='dispatching';await save();if(signal.aborted||!idle()){pool.finish(id,'deferred','派发前中断');dispatched=false;signal.throwIfAborted();return {detail:'前台已占用名额'};}
      const finish=async(ok,detail)=>{
        const adopt=ok&&['ask','speak'].includes(d.action);
        pool.finish(id,ok?(forced&&adopt?'feedback':'done'):'deferred',detail,{adopt});
        const settled=pool.record(id);
        audit.status=settled.status;audit.receipt=settled.result;audit.endedAt=now();await save();
      };
      if(d.action==='ask')return {roundId:id,source:fact.ask,message:d.message,evaluation:d.conclusion,finish};
      if(d.action==='speak'){
        const shown=await speak(id,fact.share?fact.share.summary:d.message,signal);
        if(shown&&topicShare)await topics.announced(topicShare.id,topicShare.revision);
        await finish(shown,shown?'已展示':'未展示');
      }else if(lookupActions.includes(d.action)){
        const label=initiativeSearchLabels[d.action];
        const run=async()=>{
          const fail=message=>{throw Object.assign(Error(message),{code:'PUBLIC_LOOKUP'});};
          if(store.week()!==3||!initiativeQuery(fact.publicTerm))fail('公开查证条件已变化');
          const result=await search(fact.publicTerm,signal,{mode:d.action,model});
          signal.throwIfAborted();
          if(!idle())fail('本轮查询被打断');
          if(!result?.sources?.length)fail(result?.text||'没有可核对的公开来源');
          return topics.note({ref:fact.ref,title:fact.publicTerm+' · '+label},'web',result.text,id,{category:d.action});
        };
        let detail;
        try{detail=step?await step('自主查阅'+label,fact.publicTerm,run):await run();}
        catch(err){
          const reason=signal.aborted?'本轮查询被打断':err.code==='PUBLIC_LOOKUP'?err.message:label+'查询或保存失败';
          await finish(false,reason);signal.throwIfAborted();
          return {detail:reason,nextAt:at+7200000};
        }
        await finish(true,detail);
        return {detail:label+'已保存 · '+detail,nextAt:at+7200000};
      }else if(d.action==='research'){
        const queued=await topics.queueCheck(fact.topic,id);
        const detail=queued?'已登记到下一个空闲复盘名额':'该专题已结束本次核查';
        await finish(queued,detail);return {detail,nextAt:at+7200000};
      }else{
        const saveNote=()=>topics.note(fact,d.action,d.message||d.conclusion,id);
        const result=step?await step('本地文档整理','根据 '+fact.ref+' 保存'+(d.action==='preference'?'偏好':'摘记'),saveNote):await saveNote();
        await finish(true,result);
        return {detail:result,nextAt:at+7200000};
      }
      return {detail:d.conclusion,nextAt:at+7200000};
    }catch(e){
      const settled=dispatched&&pool.record(id)?.status;
      audit.status=dispatched?(settled==='dispatching'?'待核实':settled):signal.aborted?'中断':'未完成';
      audit.endedAt=now();audit.error=String(e.message).slice(0,120);
      if(!dispatched){observation.cursor=start;pool.stopped(id,observation,audit.status);pool.finish(id,'stopped',audit.status);}
      await save();if(signal.aborted)throw e;return {detail:'本轮主动行动'+audit.status};
    }
  }
  return {choose};
}
