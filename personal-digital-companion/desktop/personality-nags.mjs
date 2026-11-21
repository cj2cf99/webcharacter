import {untilAbort} from './chat-budget.mjs';
import {createDiaryAudit} from './diary-audit.mjs';
import {createHash} from 'node:crypto';
import {tokyoDay} from './conversation-history.mjs';
import {cleanMemory} from './personality-diary.mjs';

const dayMs=86400000;
const openStates=['提问中','等待回应','意外中断'];
const game=/游戏|遊戲|ゲーム|娱乐|娛樂|娯楽|gaming|entertainment/i;
const refund=/退款|返金|退费|refund/i;
const unknown=s=>!s||/未知|其他|不明|未分类|未分類|unknown|other/i.test(s);
const sourceKey=(source,id)=>source+'/'+id;
const brief=(s,n)=>Array.from(cleanMemory(s)).slice(0,n).join('');
const iso=at=>new Date(at).toISOString();

export function createPersonalityNags({store,show,idle,canContinue=()=>true,onInterrupted=()=>{},changed=()=>{},now=Date.now,random=Math.random}){
  let active=null,syncJob=null,stopped=false;
  const lifetime=new AbortController();
  const pending=()=>store.nags().find(n=>openStates.includes(n.status)&&(n.source!=='audit'||audit.eligible(n)));
  for(const n of store.nags())if(n.status==='提问中'){
    n.status='意外中断';n.interruptions++;store.saveNag(n);
  }
  let resync=false;
  function sync(signal){
    if(syncJob){if(!signal)resync=true;return untilAbort(syncJob,signal);}
    const combined=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;
    if(!stopped)syncJob=(async()=>{do{combined.throwIfAborted();resync=false;await store.syncNags(combined);}while(resync&&!stopped);})().catch(()=>{}).finally(()=>{syncJob=null;});
    return syncJob;
  }
  function save(n){store.saveNag(n);changed();void sync();}
  const audit=createDiaryAudit({store,show,idle,canContinue,save,changed,onInterrupted:()=>onInterrupted('diaryAudit'),now,random});
  function talk(n,who,text){n.talk.push({who,text,at:iso(now())});}
  async function candidates(signal){
    const day=i=>tokyoDay(now()-i*dayMs),known=new Set(store.nags().map(n=>sourceKey(n.source,n.source_id)));
    const pool=[];
    const cited=new Set(store.nags().filter(n=>n.source==='audit').flatMap(n=>n.refs.map(r=>r.page)));
    for(const p of store.pages(day(6)).filter(p=>p.day>=day(6)&&p.day<=day(0))){
      if(cited.has(p.day+'.'+p.part))continue;
      for(const t of p.threads){
        const id=p.day+'.'+p.part+'/'+t.no;
        if(!t.asked&&!t.resolved&&!known.has(sourceKey('diary',id))&&!store.handledThread(id))pool.push({source:'diary',source_id:id,title:t.text,reason:'日记中的未解悬念',stats:''});
      }
    }
    const byId=new Map();
    let cursor='',complete=true;
    const cursors=new Set();
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
    const records=[...byId.values()];
    const sorted=records.filter(r=>r.spendDate>=day(1)&&r.spendDate<=day(0)&&!known.has(sourceKey('paylog',r.id))).sort((a,b)=>b.amount-a.amount);
    const expenses=[];
    for(const r of sorted){
      let probable=false,fun=game.test([r.category,r.tag?.name].join(' '));
      if(!fun&&unknown(r.category)){
        const type=await store.think(brief([r.merchant,r.description].join(' '),300),'这笔消费有明确游戏或娱乐倾向吗？只填 是 或 否。',['answer'],signal);
        probable=fun=type.answer==='是';
      }
      if(!fun&&r.amount<3500)continue;
      const explanations=await store.explanations?.(r,day(0),day(1));
      let explained=false;
      for(let i=0;i<(explanations?.length??0);i+=3){
        const prior=await store.think(JSON.stringify({账目:[r.id,r.spendDate,r.amount,r.merchant,r.description],用户原话:explanations.slice(i,i+3)}),'这些用户原话是否明确解释这笔具体消费？不确定写否。',['answer'],signal);
        if(prior.answer==='是'){explained=true;break;}
      }
      if(explained)continue;
      function stats(start,end){
        const rows=records.filter(v=>v.category===r.category&&v.spendDate>=start&&v.spendDate<=end);
        return start+' 至 '+end+' '+rows.length+' 笔、'+rows.reduce((s,v)=>s+Number(v.amount),0)+' 日元';
      }
      expenses.push({source:'paylog',source_id:r.id,source_day:r.spendDate,title:brief(r.description||r.merchant||r.category||'用途待确认',240),
        reason:[r.amount+' 日元',r.amount>=3500?'大额消费':'',fun?(probable?'游戏或娱乐（推测）':'游戏或娱乐'):''].filter(Boolean).join(' · '),
        stats:(r.category||'未分类')+'：'+stats(day(7),day(1))+'；'+stats(day(14),day(8))+(complete?'':'（资料不全）')});
      if(expenses.length===5)break;
    }
    return pool.concat(expenses);
  }
  function ended(n){return n.questions>=3||n.turns>=Math.min(6,n.limit??6);}
  function finish(n,status){
    n.status=status;
    if(status==='用户结束')talk(n,'结束记录','老公闷闷的不理我了');
    if(status==='回合结束')n.remaining=n.next||n.title;
    save(n);
  }
  async function appraise(n,text,signal){
    const v=await store.think(JSON.stringify({事项:n.title,问题:n.next,解释:brief(text,550),此前情绪:n.mood}),
      '记录听完后的评价和情绪。reply 直接回应。确实仍需补充时 next 填一个新问题，已清楚则留空。',['reply','evaluation','mood','next'],signal);
    signal.throwIfAborted();
    if(!v.reply||!v.evaluation||!v.mood)throw Error('回应尚未生成');
    return v;
  }
  async function poll(signal,{manual=false,progress=()=>{},step}={}){
    if(active||!idle())return {deferred:true};
    await sync(signal);
    signal.throwIfAborted();
    let n=pending();
    if(n?.source==='audit')return manual?audit.poll(signal,{manual}):'手记质问正在待确认';
    if(manual&&!n)return '没有待续事项';
    if(!manual&&n?.status!=='意外中断'&&now()-(store.last('nag-shown')??0)<2*3600000)return {detail:'本轮名额已使用',nextAt:store.last('nag-shown')+2*3600000};
    if(!n){
      progress({stage:'核对待续事项'});
      await store.refresh?.(signal);
      n=pending();
      if(n?.source==='audit')return '手记质问正在待确认';
      if(!n){
        const pool=await candidates(signal);
        if(!pool.length)return '没有待问事项';
        const source=pool[Math.floor(random()*pool.length)];
        n={...source,id:'nag-'+createHash('sha256').update(sourceKey(source.source,source.source_id)).digest('hex'),created_at:iso(now()),
          revision:0,talk:[],turns:0,questions:0,interruptions:0,status:'提问中'};
      }
    }
    if(!manual&&n.source==='diary'){
      const lastShown=n.talk.findLast(t=>t.who==='绯月');
      const shownAt=Date.parse(lastShown?.at);
      if((Number.isFinite(shownAt)&&tokyoDay(shownAt)===tokyoDay(now()))||!store.claimThread(n.source_id))return '这个悬念今天已处理';
    }
    if(n.talk.at(-1)?.who==='你'){
      progress({stage:'整理上次的回应'});
      const heard=await appraise(n,n.talk.at(-1).text,signal);
      n.afterEvaluation=heard.evaluation;n.mood=heard.mood;
      if(!heard.next||ended(n)){
        n.next=heard.next;finish(n,heard.next?'回合结束':'已解释');return '已按上次留下的解释收尾';
      }
      n.next=heard.next;n.recoveredQuestion=true;
    }
    if(n.turns>=Math.min(6,n.limit??6)){finish(n,'回合结束');return '本次念叨已收尾';}
    const first=!n.revision;
    if(first){
      progress({stage:'想一句提问'});
      const v=await store.think(JSON.stringify([n.title,n.reason,n.stats]),'为这一个事项写一句自然的提问，并记录开口前的评价和情绪。',['question','evaluation','mood'],signal);
      if(!v.question||!v.mood||!v.evaluation)throw Error('念叨提问未生成');
      Object.assign(n,{next:v.question,before:v.mood,mood:v.mood,beforeEvaluation:v.evaluation});
    }
    if(n.interruptions>=2&&!n.limit)n.limit=Math.min(6,n.turns+3);
    const prompt=(n.interruptions>=2?'这次一起说完就好。':'')+n.next;
    signal.throwIfAborted();if(!idle())return {deferred:true};
    const session={controller:new AbortController()};
    function visible(){
      if(active!==session)return;
      if(first)n.created_at=iso(now());
      if(first||n.recoveredQuestion)n.questions++;
      delete n.recoveredQuestion;
      n.turns++;n.status='提问中';talk(n,'绯月',prompt);store.mark('nag-shown',now());save(n);
    }
    function leave(reason){
      if(active!==session)return;
      active=null;session.controller.abort();
      if(reason==='button'){finish(n,'用户结束');return;}
      n.status=reason==='idle'?'等待回应':'意外中断';
      if(reason!=='idle')n.interruptions++;
      save(n);if(reason!=='idle')onInterrupted();
    }
    async function reply(input){
      const text=store.nagText?await store.nagText(n,input,session.controller.signal):cleanMemory(input);
      if(!text||(!store.nagText&&Array.from(text).length>3000))return {text:'请把这次的解释控制在 3000 字以内。'};
      talk(n,'你',text);save(n);
      const v=await appraise(n,text,session.controller.signal);
      n.afterEvaluation=v.evaluation;n.mood=v.mood;
      talk(n,'绯月',v.reply);n.next=v.next;
      if(!v.next||ended(n)){
        active=null;finish(n,v.next?'回合结束':'已解释');
        return {text:v.reply,done:true};
      }
      return {text:v.reply+'\n'+v.next,shown(){
        n.questions++;n.turns++;talk(n,'绯月',v.next);save(n);
      }};
    }
    active=session;
    try{const displayed=await show({prompt,visible,leave,reply,signal});
      if(!displayed){active=null;return {deferred:true};}
    }catch(error){active=null;throw error;}
    return '只问了这一件：'+n.title;
  }
  return {poll,pollAudit:audit.poll,recoverAudit:audit.recover,pending,flush:sync,async close(){audit.close();stopped=true;lifetime.abort();active?.controller.abort();await syncJob;}};
}
