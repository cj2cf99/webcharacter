import {createHash} from 'node:crypto';
import {tokyoDay} from './conversation-history.mjs';
import {cleanMemory} from './personality-diary.mjs';
import {readInteractionSkill} from './interaction-skills.mjs';
import {untilAbort} from './chat-budget.mjs';
import {isPendingQuestion,pendingLimit,questionTarget,questionText as question,sameQuestion} from './pending-questions.mjs';

const dayMs=86400000;
const nextBatch=Symbol('手记核对分批继续');
const stageLabels={extract:'提取手记线索',compare:'比对手记',verify:'核实疑点'};
const digest=s=>createHash('sha256').update(s).digest('hex');
const pageKey=p=>p.day+'.'+p.part;
const segmenter=new Intl.Segmenter('zh',{granularity:'word'});
const words=s=>new Set([...segmenter.segment(s.toLowerCase())].filter(w=>w.isWordLike&&w.segment.length>1).map(w=>w.segment));
async function answerContext(n,write,signal){
  const turns=[];
  for(const t of n.talk){
    let text=t.text;
    if(t.who==='你'&&text.length>280){
      let summary='';
      const chars=Array.from(text);
      for(let i=0;i<chars.length;i+=420){
        const result=await write('condense',{问题:turns.at(-1)?.[1],此前摘要:summary,回答片段:chars.slice(i,i+420).join('')},['text'],signal);
        if(!result.text)throw Error('回答摘要尚未完成');
        summary=result.text;
      }
      text=summary;
    }
    turns.push([t.who,text]);
  }
  return turns;
}

function formatQuestion(n){
  const lines=n.refs.map((r,i)=>(i+1)+'. '+r.page+'　「'+r.quote+'」');
  return ['日记源头　'+n.source_id+'（主篇）',...new Set(n.refs.map(r=>r.page).filter(k=>k!==n.source_id)),
    '矛盾简述　'+n.reason,'手记原文',...lines,'矛盾点',...n.points.map((p,i)=>(i+1)+'. '+p),
    n.questions===1?'想搞清楚的问题':'追问 '+(n.questions-1)+' / 2',n.next].join('\n');
}

export function createDiaryAudit({store,show,idle,canContinue,save,protectReply,lookupReply,now=Date.now,random=Math.random,loadSkill=()=>readInteractionSkill('diaryAudit')}){
  let active=null,working=false,state;
  function stopRun(){
    if(state.run){delete state.run;store.saveAuditState(state);}
  }
  function recordAttempt(pages,stage,question=''){
    state.run.attempt={pages:[...new Set(pages)],stage,question};
    store.saveAuditState(state);
  }
  function preparationFailure(error){
    if(error.code==='LOCAL_AI_ROUND_PAUSED')return error;
    const {pages,stage,question}=state.run?.attempt??{pages:[],stage:'同步待核查资料'};
    const failure=Error(`质询准备失败 · ${stage} · 对象：${pages.join('、')||'尚未确定'} · 质问：${question||'尚未生成'} · 原因：${error.message}`);
    if(error.name!=='TimeoutError'&&!['TimeoutError','LOCAL_AI_TIMEOUT','LOCAL_AI_LOAD_TIMEOUT','LOCAL_AI_OUTPUT_BUDGET','LOCAL_AI_CONTEXT_BUDGET'].includes(error.code))stopRun();
    return failure;
  }
  async function writer(signal,aiPriority,aiCurrentPriority,{limit=Infinity,progress}={}){
    const skill=await untilAbort(loadSkill(),signal);
    let calls=0;
    return async(stage,data,fields,signal,steps)=>{
      signal.throwIfAborted();
      const input=JSON.stringify(data),key=steps&&digest(stage+'\n'+input);
      if(key&&steps[key])return steps[key];
      if(calls>=limit)throw nextBatch;
      calls++;
      progress?.({stage:stageLabels[stage]});
      const prompt=skill.localAi[stage]+(stage==='compare'?' refs 的第一项必须是「主篇可选」为 true 的材料，其余可作为旁证。':'');
      const result=await untilAbort(store.think(input,prompt,fields,signal,{name:skill.skill,version:skill.version,stage,
        aiPriority,aiCurrentPriority,boundedOutput:true,backgroundBudget:!aiPriority,maxTokens:stage==='compare'?950:460}),signal);
      signal.throwIfAborted();
      if(key){
        steps[key]=result;store.saveAuditState(state);
      }
      return result;
    };
  }
  async function discover(write,signal){
    const used=new Set(store.nags().map(questionTarget));
    const today=tokyoDay(now()),from=tokyoDay(now()-6*dayMs);
    const pages=store.pages(from).filter(p=>p.day<=today&&p.body.trim()&&p.body!=='无所事事的一天');
    if(!pages.some(p=>!used.has('audit/'+pageKey(p))))return;
    const run=state.run;
    const quotes=[];
    for(const p of pages){
      signal.throwIfAborted();
      const page=pageKey(p);
      recordAttempt([page],'提取手记线索');
      const chars=Array.from(p.body);
      for(let i=0;i<chars.length;i+=440){
        signal.throwIfAborted();
        const block=chars.slice(Math.max(0,i-60),i+440).join('');
        let excerpts;
        if(block.length<=100)excerpts=[block];
        else{
          const v=await write('extract',block,['a','b','c'],signal,run.steps);
          excerpts=Object.values(v).filter(s=>s&&block.includes(s));
          // Even an unsuccessful extraction must leave real source material for comparison.
          if(!excerpts.length)excerpts=block.match(/[\s\S]{1,90}/gu)??[];
        }
        for(const quote of excerpts)if(!quotes.some(r=>r.page===page&&r.quote===quote))quotes.push({page,quote});
      }
    }
    const terms=quotes.map(q=>words(q.quote)),candidates=[],groups=new Set();
    for(let i=0;i<quotes.length;i+=4){
      const indices=quotes.slice(i,i+4).map((_,j)=>i+j);
      const topic=new Set(indices.flatMap(j=>[...terms[j]]));
      const related=terms.map((ts,j)=>({j,score:[...ts].filter(t=>topic.has(t)).length})).filter(v=>!indices.includes(v.j))
        .sort((a,b)=>b.score-a.score||Math.abs(i-a.j)-Math.abs(i-b.j)).slice(0,4);
      indices.push(...related.map(v=>v.j));
      const key=indices.slice().sort((a,b)=>a-b).join(',');
      if(groups.has(key))continue;
      groups.add(key);
      const inputs=indices.map(j=>({...quotes[j],主篇可选:!used.has('audit/'+quotes[j].page)}))
        .sort((a,b)=>Number(b.主篇可选)-Number(a.主篇可选)).map((r,k)=>({no:k+1,...r}));
      if(!inputs[0].主篇可选)continue;
      recordAttempt(inputs.map(r=>r.page),'比对手记');
      const v=await write('compare',inputs,['score','refs','summary','points','question','keywords'],signal,run.steps);
      if(v.score==='0')continue;
      const refs=v.refs.trim().split(/[，,\s、]+/u).filter(Boolean).map(s=>inputs[Number(s)-1]);
      const ask=question(v.question);
      if(ask)recordAttempt(refs.length&&refs.every(Boolean)?refs.map(r=>r.page):inputs.map(r=>r.page),'核对拟问依据',ask);
      if(!/^[1-5]$/u.test(v.score)||!refs.length||refs.some(r=>!r)||!ask||!v.summary||!v.points)throw Error('质问缺少有效的原文依据，留待重核');
      if(used.has('audit/'+refs[0].page))continue;
      const points=v.points.split(/\n|[；;]/u).map(s=>s.replace(/^\s*\d+[.、)）]\s*/u,'').trim()).filter(Boolean);
      if(!points.length)throw Error('质问缺少矛盾点');
      candidates.push({score:Number(v.score),refs:[...new Set(refs)].map(({page,quote})=>({page,quote})),points,ask,reason:v.summary,keywords:v.keywords});
    }
    for(const item of candidates.sort((a,b)=>b.score-a.score)){
      const terms=item.keywords.split(/[，,、\s]+/u).filter(t=>t.length>=2&&t.length<=32).slice(0,3);
      recordAttempt(item.refs.map(r=>r.page),'验证拟问',item.ask);
      signal.throwIfAborted();
      const context=await untilAbort(store.auditAssociations(terms,signal),signal);
      const v=await write('verify',{引文:item.refs,矛盾:item.reason,拟问:item.ask,本机线索:context},['keep','question'],signal,run.steps);
      if(v.keep==='0')continue;
      const ask=question(v.question)||item.ask;
      if(v.keep!=='1')throw Error('日记复核结果不完整');
      const source_id=item.refs[0].page,at=new Date(run.startedAt).toISOString();
      return {source:'audit',source_id,id:'audit-'+digest(source_id),created_at:at,revision:0,title:ask,reason:item.reason,priority:item.score,
        refs:item.refs,points:item.points,next:ask,questions:1,interruptions:0,status:'等待回应',mood:'',
        talk:[{who:'绯月',at,text:ask}]};
    }
  }
  const line=(n,who,text)=>n.talk.push({who,text,at:new Date(now()).toISOString()});
  function mood(n){
    if(n.mood)return;
    const today=tokyoDay(now());
    const current=store.pages(today).filter(p=>p.day===today&&p.mood).sort((a,b)=>b.part-a.part)[0];
    n.mood=current?.mood||['牵挂','好奇','平静','惦念'][Math.floor(random()*4)];
  }
  function pause(n){
    n.status='意外中断';save(n);
    return {text:'回答已留在本机，可以从「待确认」继续。',done:true};
  }
  async function advance(n,write,signal,thread){
    if(!thread&&!canContinue())return pause(n);
    const turns=thread?undefined:await answerContext(n,write,signal);
    const input={矛盾:n.reason,主问题:n.title,问答:turns,同线依据:thread?.context};
    const {keywords}=await write('keywords',input,['keywords'],signal);
    const terms=keywords.split(/[，,、\s]+/u).filter(Boolean);
    const hits=await untilAbort(store.auditAssociations(terms,signal),signal);
    signal.throwIfAborted();
    if(hits.length)input.本机线索=hits.slice(0,3);
    if(!thread&&!canContinue())return pause(n);
    let closingStatus='回合结束';
    if(n.questions<3){
      const v=await write('reply',input,['complete','next'],signal);
      signal.throwIfAborted();
      if(thread&&!thread.isOpen())return;
      if(!thread&&!canContinue())return pause(n);
      if(!['1','0'].includes(v.complete))throw Error('回答完整度尚未判明');
      if(v.complete==='1')closingStatus='已解释';
      else{
        const next=question(v.next);
        if(!next)throw Error('未取得有效追问');
        if(!n.talk.some(t=>t.who==='绯月'&&sameQuestion(t.text,next))){
          n.next=next;n.questions++;line(n,'绯月',next);if(!thread)save(n);
          return {text:next};
        }
      }
    }
    if(thread&&!thread.isOpen())return;
    if(thread&&!thread.stillLatest())return {text:'我听见了，我再看看你刚补的这句。'};
    mood(n);
    const answers=Array.from(n.talk.filter(t=>t.who==='你').map(t=>cleanMemory(t.text)).join('\n'));
    const closing=closingStatus==='回合结束'?'\n还有细节待确认。':'';
    const feeling='\n我带着这份'+n.mood+'把这件事记在这里。';
    const room=600-Array.from('你说「」'+closing+feeling).length;
    const excerpt=answers.length>room?'…'+answers.slice(1-room).join(''):answers.join('');
    const text='你说「'+excerpt+'」'+closing+feeling;
    n.status=closingStatus;n.afterEvaluation=text;if(!thread)save(n);
    return {text,done:true,finished:true};
  }
  function knowledgeOutcome(n,checked){
    if(!checked?.private||!checked.answer)return null;
    if(checked.state==='apply'){
      n.status='已解释';save(n);
      return {text:checked.answer,knowledgePrivate:true,done:true,finished:true};
    }
    return {text:checked.answer,knowledgePrivate:true};
  }
  async function showQuestion(n,signal){
    const controller=new AbortController();
    const replySignal=controller.signal;
    const session={id:n.id,audit:true,signal,prompt:formatQuestion(n),
      visible(){delete n.notBefore;n.status='提问中';save(n);},
      leave(reason){
        if(active!==session)return;
        active=null;controller.abort();
        if(reason==='refuse'){
          mood(n);n.status='用户结束';n.afterEvaluation='我带着'+n.mood+'把这件事记到这里。老公选择不再回答。';
          line(n,'结束记录','拒绝回答');
        }else n.status=reason==='later'?'等待回应':'意外中断';
        save(n);
      },
      async reply(raw){
        if(active!==session)throw Error('这次气泡已关闭');
        const text=store.nagText?await untilAbort(store.nagText(n,raw,replySignal),replySignal):cleanMemory(raw);
        replySignal.throwIfAborted();
        if(!text||(!store.nagText&&Array.from(text).length>3000))return {text:'请输入文字回答。',invalid:true};
        const privateCorrection=await protectReply?.(n,text,replySignal);
        if(privateCorrection)return privateCorrection;
        const checked=await lookupReply?.(n,text,replySignal);
        const assessed=knowledgeOutcome(n,checked);
        if(assessed){if(assessed.done)active=null;return assessed;}
        line(n,'你',text);save(n);
        const result=await advance(n,await writer(replySignal),replySignal);
        if(result.done)active=null;
        return result;
      }};
    active=session;
    try{
      if(!await untilAbort(show(session),signal)){if(active===session)active=null;return {deferred:true};}
    }catch(error){if(active===session)active=null;throw error;}
    return {detail:'本次质问：'+n.title};
  }
  async function prepare(signal,progress=()=>{}){
    if(working||active||!idle()||!canContinue())return {deferred:true};
    state=store.auditState();
    delete state.checked;
    working=true;
    try{
      signal.throwIfAborted();
      if(!state.run){
        state.run={startedAt:now(),steps:{},refresh:true};
        recordAttempt([],'同步待核查资料');
      }
      if(state.run.refresh){
        try{await untilAbort(store.refresh(signal),signal);}
        catch(error){
          signal.throwIfAborted();
          if(!store.pages(tokyoDay(now()-6*dayMs)).length)throw error;
        }
        delete state.run.refresh;
        store.saveAuditState(state);
      }
      if(store.nags().filter(isPendingQuestion).length>=pendingLimit)return {detail:'待确认已满'};
      const n=await discover(await writer(signal,undefined,undefined,{limit:2,progress}),signal);
      stopRun();
      return n?{n}:{detail:'近七天手记没有新的关键疑点'};
    }catch(error){
      if(signal.aborted)throw error;
      if(error===nextBatch)return {nextBatch:true,detail:'已保存 '+Object.keys(state.run.steps).length+' 步'};
      throw preparationFailure(error);
    }finally{working=false;}
  }
  async function resume(n,signal){
    if(working||active||!idle()||!canContinue())return {deferred:true};
    working=true;
    try{
      signal.throwIfAborted();
      if(n.talk.at(-1)?.who==='你'){
        const result=await advance(n,await writer(signal),signal);
        if(result.done){
          if(isPendingQuestion(n))return {deferred:true,detail:result.text};
          return result.text;
        }
      }
      signal.throwIfAborted();
      if(!idle()||!canContinue())return {deferred:true};
      return await showQuestion(n,signal);
    }finally{working=false;}
  }
  return {prepare,resume,recover:()=>Boolean(store.auditState().run),get active(){return Boolean(active);},
    detachThread:id=>{if(active?.id===id)active.leave('later');},
    async threadAnswer(n,signal,priority,stillLatest,context,isOpen,currentPriority){
      const checked=await lookupReply?.(n,n.talk.at(-1)?.text,signal,{priority,context});
      if(!isOpen())return;
      const assessed=knowledgeOutcome(n,checked);
      if(assessed)return assessed;
      return advance(n,await writer(signal,priority,currentPriority),signal,{stillLatest,context,isOpen});
    },
    close(){active?.leave('interrupted');}};
}
