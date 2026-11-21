import {createHash} from 'node:crypto';
import {tokyoDay} from './conversation-history.mjs';
import {cleanMemory} from './personality-diary.mjs';
import {readInteractionSkill} from './interaction-skills.mjs';

const hour=3600000;
const digest=s=>createHash('sha256').update(s).digest('hex');
const pageKey=p=>p.day+'.'+p.part;
const open=n=>['提问中','等待回应','意外中断'].includes(n.status);
const question=s=>{
  const text=s?.trim();
  if(!text||/[\n]/u.test(text)||/[？?]./u.test(text))return '';
  return text.replace(/[。？！!?]+$/u,'')+'？';
};
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

export function createDiaryAudit({emotion,store,show,idle,canContinue,save,changed,now=Date.now,random=Math.random,loadSkill=()=>readInteractionSkill('diaryAudit')}){
  let active=null;
  async function writer(){
    const skill=await loadSkill();
    return (stage,data,fields,signal)=>store.think(JSON.stringify(data),skill.localAi[stage],fields,signal,{name:skill.skill,version:skill.version});
  }
  async function discover(write,signal){
    // Reference identity follows the Tokyo day and part even after the diary is appended to.
    const used=new Set(store.nags().flatMap(n=>n.source==='audit'?n.refs.map(r=>r.page):n.source==='diary'?[n.source_id.split('/')[0].replace(/\.0+(?=\d)/u,'.')]:[]));
    const today=tokyoDay(now()),from=tokyoDay(now()-6*24*hour);
    const pages=store.pages(from).filter(p=>p.day<=today&&!used.has(pageKey(p))&&p.body.trim()&&p.body!=='无所事事的一天');
    if(!pages.length)return;
    const scan=digest(JSON.stringify(pages.map(p=>[pageKey(p),p.body])));
    if(store.auditScan()===scan)return;
    const quotes=[];
    for(const p of pages){
      const chars=Array.from(p.body);
      for(let i=0;i<chars.length;i+=440){
        const block=chars.slice(Math.max(0,i-60),i+440).join('');
        let excerpts;
        if(block.length<=100)excerpts=[block];
        else{
          const v=await write('extract',block,['a','b','c'],signal);
          excerpts=Object.values(v).filter(s=>s&&block.includes(s));
          // Even an unsuccessful extraction must leave real source material for comparison.
          if(!excerpts.length)excerpts=block.match(/[\s\S]{1,90}/gu)??[];
        }
        for(const quote of excerpts)if(!quotes.some(r=>r.page===pageKey(p)&&r.quote===quote))quotes.push({page:pageKey(p),quote});
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
      const inputs=indices.map((j,k)=>({no:k+1,...quotes[j]}));
      const v=await write('compare',inputs,['score','refs','summary','points','question','keywords'],signal);
      if(v.score==='0')continue;
      const refs=v.refs.trim().split(/[，,\s、]+/u).filter(Boolean).map(s=>inputs[Number(s)-1]);
      const ask=question(v.question);
      if(!/^[1-5]$/u.test(v.score)||!refs.length||refs.some(r=>!r)||!ask||!v.summary||!v.points)throw Error('质问缺少有效的原文依据，留待重核');
      const points=v.points.split(/\n|[；;]/u).map(s=>s.replace(/^\s*\d+[.、)）]\s*/u,'').trim()).filter(Boolean);
      if(!points.length)throw Error('质问缺少矛盾点');
      candidates.push({score:Number(v.score),refs:[...new Set(refs)].map(({page,quote})=>({page,quote})),points,ask,reason:v.summary,keywords:v.keywords});
    }
    for(const item of candidates.sort((a,b)=>b.score-a.score)){
      const terms=item.keywords.split(/[，,、\s]+/u).filter(t=>t.length>=2&&t.length<=32).slice(0,3);
      const context=await store.auditAssociations(terms,signal);
      const v=await write('verify',{引文:item.refs,矛盾:item.reason,拟问:item.ask,本机线索:context},['keep','question'],signal);
      if(v.keep==='0')continue;
      const ask=question(v.question)||item.ask;
      if(v.keep!=='1')throw Error('日记复核结果不完整');
      const source_id=item.refs[0].page,at=new Date(now()).toISOString();
      return {source:'audit',source_id,id:'audit-'+digest(source_id),created_at:at,revision:1,title:ask,reason:item.reason,
        refs:item.refs,points:item.points,next:ask,questions:1,interruptions:0,status:'等待回应',mood:'',
        talk:[{who:'绯月',at,text:ask}]};
    }
    // A local explanation may change. Only memoize a scan that found no initial candidate.
    if(!candidates.length)store.markAuditScan(scan);
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
    return {text:'你的回答已记下，等手头的任务结束再接着聊。',done:true};
  }
  async function advance(n,write,signal){
    if(!canContinue())return pause(n);
    const turns=await answerContext(n,write,signal);
    const input={矛盾:n.reason,主问题:n.title,问答:turns};
    const {keywords}=await write('keywords',input,['keywords'],signal);
    const terms=keywords.split(/[，,、\s]+/u).filter(Boolean);
    const hits=await store.auditAssociations(terms,signal);
    signal.throwIfAborted();
    if(hits.length)input.本机线索=hits.slice(0,3);
    if(!canContinue())return pause(n);
    let closingStatus='回合结束';
    if(n.questions<3){
      const v=await write('reply',input,['complete','next'],signal);
      signal.throwIfAborted();
      if(!canContinue())return pause(n);
      if(!['1','0'].includes(v.complete))throw Error('回答完整度尚未判明');
      if(v.complete==='1')closingStatus='已解释';
      else{
        const next=question(v.next);
        if(!next)throw Error('未取得有效追问');
        if(!n.talk.some(t=>t.who==='绯月'&&t.text===next)){
          n.next=next;n.questions++;line(n,'绯月',next);save(n);
          return {text:next};
        }
      }
    }
    mood(n);save(n);
    const v=await write('write',{主问题:n.title,问答:turns,情绪:n.mood,结束方式:closingStatus},['text'],signal);
    signal.throwIfAborted();
    if(!canContinue())return pause(n);
    if(!v.text)throw Error('念叨收笔尚未完成');
    n.status=closingStatus;n.afterEvaluation=v.text;save(n);
    return {text:v.text,done:true};
  }
  async function poll(signal,{manual=false}={}){
    if(active||!idle()||!canContinue())return {deferred:true};
    let n=store.nags().find(open);
    if(!n&&!manual){
      await store.refresh(signal);
      n=store.nags().find(open);
    }
    if(n&&n.source!=='audit'||!n&&manual)return '没有待续的手记质问';
    if(!manual&&n?.notBefore>now())return {detail:'手记质问已留在待确认',nextAt:n.notBefore};
    const write=await writer();
    if(!n){
      n=await discover(write,signal);
      if(!n)return '近七天手记没有新的关键疑点';
      signal.throwIfAborted();
      await store.reserveAudit(n,signal);
      changed();
    }
    if(n.talk.at(-1).who==='你'){
      const result=await advance(n,write,signal);
      if(result.done)return result.text;
    }
    signal.throwIfAborted();
    if(!idle()||!canContinue())return {deferred:true};
    const controller=new AbortController();
    const session={audit:true,signal,prompt:formatQuestion(n),
      visible(){n.status='提问中';n.notBefore=now()+hour;save(n);},
      leave(reason){
        if(active!==session)return;
        active=null;controller.abort();
        if(reason==='refuse'){
          mood(n);n.status='用户结束';n.afterEvaluation='我带着'+n.mood+'把这件事记到这里。老公选择不再回答。';
          line(n,'结束记录','拒绝回答');
        }else{
          n.status=reason==='later'||reason==='idle'?'等待回应':'意外中断';
          if(n.status==='等待回应')n.notBefore=now()+hour;
        }
        save(n);
      },
      async reply(raw){
        if(active!==session)throw Error('这次气泡已关闭');
        const text=store.nagText?await store.nagText(n,raw,controller.signal):cleanMemory(raw);
        if(!text||(!store.nagText&&Array.from(text).length>3000))return {text:'请输入文字回答。',invalid:true};
        line(n,'你',text);delete n.notBefore;save(n);
        const result=await advance(n,write,controller.signal);
        if(result.text&&!result.invalid)emotion?.chat({id:n.id+'/'+n.talk.length,state:'answer',at:now(),question:text,text:result.text});
        if(result.done)active=null;
        else {n.notBefore=now()+hour;save(n);}
        return result;
      }};
    active=session;
    try{
      if(!await show(session)){if(active===session)active=null;return {deferred:true};}
    }catch(error){if(active===session)active=null;throw error;}
    return {detail:'本次质问：'+n.title,nextAt:n.notBefore};
  }
  return {poll,close(){active?.leave('interrupted');}};
}
