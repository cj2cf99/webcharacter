import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {gradeQuestion,publicQuestion,shuffled,validSelection,validStudyQuestionBase} from './study-materials.mjs';

const hour=3_600_000;
const weights=[1,3,5,7];
const at=()=>Date.now();
export const normalizeStudySentence=text=>text.normalize('NFKC').replace(/[\s。！？!?]+$/u,'').trim();
const timed=mode=>mode==='exam'||mode==='strength-exam';
const targets=q=>[q.id,...(q.concepts??[]).map(concept=>concept.id)];
const timeLeft=(s,now)=>Math.max(0,s.remaining-(s.status==='running'?Math.max(0,now-s.started):0));

export function mastery(history){
  const states=new Map();
  for(const evidence of history){
    const perSession=new Map();
    for(const item of evidence){
      if(item.disputed||item.hinted||item.result==='unanswered')continue;
      for(const id of [item.question.id,...(item.concepts??[])]){
        const proof=perSession.get(id)??{wrong:false,right:false,unsure:false};
        proof.wrong ||= item.result==='wrong';
        proof.right ||= item.result==='correct'&&!item.unsure;
        proof.unsure ||= item.unsure;
        perSession.set(id,proof);
      }
    }
    for(const [id,proof] of perSession){
      const state=states.get(id)??{tier:0,streak:0,unsure:false};
      if(proof.wrong){state.tier=Math.min(3,state.tier+1);state.streak=0;state.unsure=false;}
      else if(proof.unsure)state.unsure=true;
      else if(proof.right){if(++state.streak>=3)state.tier=Math.max(0,state.tier-1);state.unsure=false;}
      states.set(id,state);
    }
  }
  return states;
}

export function drawStudy(pool,count,states,reinforce,random=Math.random){
  if(!reinforce)return shuffled(pool,random).slice(0,count);
  const remaining=pool.map(question=>{
    const status=targets(question).map(id=>states.get(id));
    return {question,weight:weights[Math.max(0,...status.map(x=>x?.tier??0))],first:status.some(x=>x?.unsure)};
  });
  const selected=[];
  while(remaining.length&&selected.length<count){
    const preferred=remaining.filter(row=>row.first);
    const candidates=preferred.length?preferred:remaining;
    let draw=random()*candidates.reduce((sum,row)=>sum+row.weight,0);
    const row=candidates.find(value=>(draw-=value.weight)<0)??candidates.at(-1);
    selected.push(row.question);
    remaining.splice(remaining.indexOf(row),1);
  }
  return selected;
}

export function createStudyStore(profile,clock=at,safeStorage){
  if(!safeStorage?.isEncryptionAvailable?.())throw Error('系统保护服务暂不可用，学习资料未打开');
  const db=new DatabaseSync(join(profile,'study.sqlite'));
  const encode=value=>safeStorage.encryptString(JSON.stringify(value));
  const read=row=>row&&JSON.parse(safeStorage.decryptString(Buffer.from(row.body)));
  const sql=statement=>db.prepare(statement);
  const needsFormalHistory=!sql("SELECT 1 FROM sqlite_master WHERE name='formal_history'").get();
  db.exec(`
    PRAGMA busy_timeout=1500;
    CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, title BLOB NOT NULL, kind TEXT NOT NULL, body BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, title BLOB NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, started INTEGER NOT NULL, finished INTEGER, body BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS evidence (session TEXT PRIMARY KEY, finished INTEGER NOT NULL, body BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS doubts (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS relay (id TEXT PRIMARY KEY, body BLOB NOT NULL);
  `);
  function transaction(run){
    db.exec('BEGIN');
    try{run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  }
  const indexFormal=session=>sql('INSERT OR REPLACE INTO formal_history VALUES(?,?,?,?)').run(
    session.id,encode(session.bank_name??'知序正式考试'),session.started_at??null,session.finished_at??null);
  if(needsFormalHistory)transaction(()=>{
    db.exec('CREATE TABLE formal_history (id TEXT PRIMARY KEY,title BLOB NOT NULL,started INTEGER,finished INTEGER)');
    for(const row of sql("SELECT body FROM relay WHERE id NOT IN ('identity','latest','create')").all()){
      const session=read(row)?.session;
      if(session?.status==='completed')indexFormal(session);
    }
  });
  const getMaterial=id=>read(sql('SELECT body FROM materials WHERE id=?').get(id));
  const getSession=id=>read(sql('SELECT body FROM sessions WHERE id=?').get(id));
  const evidenceRows=()=>sql('SELECT body FROM evidence ORDER BY finished,rowid').all().map(read);
  const states=()=>mastery(evidenceRows());
  const doubts=()=>new Set(sql('SELECT id FROM doubts').all().map(row=>row.id));
  const saveEvidence=(id,finished,evidence)=>sql('INSERT INTO evidence VALUES (?,?,?) ON CONFLICT(session) DO UPDATE SET body=excluded.body')
    .run(id,finished,encode(evidence));
  const titleOf=row=>({...row,title:read({body:row.title})});
  function saveSession(s){
    const evidence=s.status==='completed'&&s.mode!=='free'?s.items.map(item=>({
      question:{id:item.question.id,base:item.question.base},concepts:item.evidenceConcepts,result:item.result,unsure:item.unsure,hinted:item.hinted,disputed:item.disputed,
      mistaken:item.result==='wrong'&&item.question.correct?item.answer.filter(choice=>!item.question.correct.includes(choice)):undefined,
    })):null;
    transaction(()=>{
      sql(`INSERT INTO sessions VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,
        finished=excluded.finished,body=excluded.body`).run(s.id,encode(s.title),s.mode,s.status,s.created,s.finished??null,encode(s));
      if(evidence)saveEvidence(s.id,s.finished,evidence);
    });
  }
  function settle(s,reason){
    s.remaining=timed(s.mode)?timeLeft(s,clock()):null;
    s.status='completed';s.reason=reason;s.finished=clock();
    for(const item of s.items){
      if(item.result)continue;
      if(s.mode==='free'&&item.draft&&!item.answer){
        item.answer=item.draft;
        item.draftOnly=true;
      }
      item.result=item.question.type==='sentence'?(item.answer?'pending':'unanswered'):gradeQuestion(item.question,item.answer??[]);
    }
    saveSession(s);
  }
  function findSession(id){
    const s=getSession(id);
    if(!s)throw Error('找不到这场练习');
    if(timed(s.mode)&&s.status==='running'&&!timeLeft(s,clock()))settle(s,'timeout');
    return s;
  }
  function view(s){
    const done=s.status==='completed',exam=timed(s.mode),history=done?evidenceRows():[],status=done?mastery(history):null;
    const related=done&&s.mode!=='free'?variantPool(s.material):[];
    const mistakes=new Map();
    for(const rows of history)for(const proof of rows){
      if(proof.disputed||proof.hinted||!proof.mistaken?.length)continue;
      const counts=mistakes.get(proof.question.id)??new Map();
      for(const id of proof.mistaken)counts.set(id,(counts.get(id)??0)+1);
      mistakes.set(proof.question.id,counts);
    }
    const items=s.items.map((item,index)=>{
      const q=item.question, feedback=done||!exam&&Boolean(item.result)||!exam&&item.hinted;
      if(!done&&index!==s.position){
        const answer=s.mode==='free'&&index===s.position-1?item.answer:item.answer?.length?['answered']:[];
        return {flag:item.flag,answer,result:!exam&&item.result?'answered':undefined};
      }
      const revealed=feedback&&(done||item.result||item.revealed);
      const question=publicQuestion(q,revealed);
      if(q.type==='sentence'){
        if(s.mode==='free')question.stem=item.prompt??(index===0?q.stem:'');
        if(s.mode==='script'&&item.hinted)question.chunks=q.chunks;
        if(s.mode==='script')question.canAssemble=q.chunks.length>0;
        question.meaning=q.meaning;
        if(feedback)question.intent=q.intent;
      }
      if(revealed)Object.assign(question,{correct:q.correct,reference:s.mode==='free'?undefined:q.answer,translation:s.mode==='free'?undefined:q.rewrite,
        explanation:q.explanation,concepts:q.concepts});
      const progress=status?.get(q.id);
      return {question,answer:item.answer,draft:item.draft,draftOnly:item.draftOnly,unsure:item.unsure,flag:item.flag,hinted:item.hinted,
        result:feedback?item.result:undefined,originalResult:item.originalResult,disputed:item.disputed,feedback:done||s.mode!=='free'?item.feedback:undefined,retry:item.retry,
        mastery:progress&&{...progress,weight:weights[progress.tier]},doubt:done&&q.base?isDoubt(q.base):undefined,
        repeated:[...(mistakes.get(q.id)??[])].filter(([,n])=>n>1),hasVariant:Boolean(findVariant(related,q,item.evidenceConcepts))};
    });
    const correct=done?items.filter(item=>item.result==='correct').length:undefined;
    const {id,title,mode,material,status:sessionStatus,position,created,finished,reason,requested,context,summary,closing,sourceTurn}=s;
    return {id,title,mode,material,status:sessionStatus,position,created,finished,reason,requested,context,items,summary,correct,closing,sourceTurn,
      remaining:exam?timeLeft(s,clock()):null,passed:exam&&done?correct*10>=items.length*9:undefined};
  }
  function cache(materials){
    db.exec('BEGIN');
    try{
      const write=sql('INSERT INTO materials VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,kind=excluded.kind,body=excluded.body');
      for(const m of materials){
        const old=getMaterial(m.id);
        if(m.kind==='language'&&old?.revision>m.revision)continue;
        const value=m.merge&&old?{...old,attemptsComplete:false,questions:[...new Map([...old.questions,...m.questions].map(q=>[q.base,q])).values()]}:m;
        write.run(m.id,encode(value.title),m.kind,encode(value));
      }
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function overview(){
    const continueList=sql("SELECT id,title,mode,status,started FROM sessions WHERE status<>'completed' ORDER BY started DESC").all();
    for(const row of continueList)findSession(row.id);
    return {materials:sql('SELECT id,title,kind FROM materials ORDER BY kind,rowid DESC').all().map(titleOf),
      active:sql("SELECT id,title,mode,status,started FROM sessions WHERE status<>'completed' ORDER BY started DESC LIMIT 12").all().map(titleOf)};
  }
  function history(offset=0){
    return sql(`SELECT id,title,mode,status,started,finished FROM sessions WHERE status='completed'
      UNION ALL SELECT id,title,'formal','completed',started,finished FROM formal_history
      ORDER BY finished DESC,id DESC LIMIT 20 OFFSET ?`)
      .all(Number.isSafeInteger(offset)&&offset>=0?offset:0).map(titleOf);
  }
  function material(id){
    const m=getMaterial(id);
    if(!m)throw Error('请先选择学习材料');
    const tags=[...new Set(m.questions?.filter(q=>q.active).flatMap(q=>q.tagIds)??[])];
    for(const tag of m.tags??[])if(!tags.includes(tag.id)&&m.tags.some(child=>child.parent===tag.id&&tags.includes(child.id)))tags.push(tag.id);
    return {id:m.id,title:m.title,kind:m.kind,sceneOnly:m.sceneOnly,topics:m.topics,attemptsComplete:m.attemptsComplete===true,fetchedAt:m.fetchedAt,
      tags:tags.map(id=>m.tags?.find(tag=>tag.id===id)??{id,name:id}),count:(m.questions?.filter(q=>q.active)??m.turns).length};
  }
  const isDoubt=id=>Boolean(sql('SELECT 1 FROM doubts WHERE id=?').get(id));
  function setDoubt(id,value){
    if(value)sql('INSERT OR IGNORE INTO doubts VALUES (?)').run(id);
    else sql('DELETE FROM doubts WHERE id=?').run(id);
  }
  const relaySet=(id,body)=>sql('INSERT OR REPLACE INTO relay VALUES (?,?)').run(id,encode(body));
  function formalReceipt(row,evidence){
    const {session}=row;
    transaction(()=>{
      relaySet(session.id,row);
      if(evidence){
        saveEvidence('formal:'+session.id,session.finished_at??clock(),evidence);
        indexFormal(session);
      }
    });
  }
  function variantPool(materialId){
    const m=getMaterial(materialId);
    if(!m)return [];
    if(m.kind==='language'){
      return sql("SELECT body FROM materials WHERE kind='language'").all().flatMap(row=>{
        const script=read(row);
        return script.turns.map(question=>({question,material:script.id,sceneId:script.sceneId}));
      });
    }
    const excluded=doubts();
    return m.questions.filter(row=>row.active&&!excluded.has(row.base)).map(question=>({question,material:m.id}));
  }
  function findVariant(pool,q,concepts=[]){
    if(q.type==='sentence')return pool.find(({question})=>question.id!==q.id&&
      question.concepts.some(row=>concepts.includes(row.id))&&normalizeStudySentence(question.answer)!==normalizeStudySentence(q.answer));
    return pool.find(({question})=>question.base!==q.base&&question.tagIds.some(id=>q.tagIds.includes(id)));
  }
  function seenQuestions(){
    const seen=new Set();
    for(const rows of evidenceRows())for(const item of rows){
      if(item.result==='unanswered')continue;
      if(item.question.base)seen.add(item.question.base);
      else{
        try{const key=JSON.parse(item.question.id);if(Array.isArray(key))seen.add(key[0]);}catch{}
      }
    }
    for(const row of sql("SELECT body FROM sessions WHERE mode='practice' AND status='running'").all()){
      for(const item of read(row).items)if(item.result&&item.result!=='unanswered')seen.add(item.question.base);
    }
    return seen;
  }
  function create(materialId,{mode,count=10,tag='',scope='',reinforce=false,selected,requested,title,opening,topic,sourceTurn}={}){
    const m=getMaterial(materialId);
    if(!m)throw Error('学习材料暂不可用');
    if(!(m.kind==='language'?['script','free','sentence']:['practice','exam','strength-exam']).includes(mode))throw Error('练习方式无效');
    let pool=m.turns;
    if(m.sceneOnly){
      if(mode!=='free'||!opening)throw Error('此场景需要本机模型开启自由对练');
      pool=Array.from({length:20},(_,index)=>({id:JSON.stringify(['scene-turn',materialId,index]),type:'sentence',stem:index===0?opening:'',chunks:[],concepts:[]}));
    }
    if(m.kind==='bank'){
      const excluded=doubts(), status=states();
      const seen=scope==='unseen'?seenQuestions():null;
      const tags=new Set([tag,...m.tags.filter(row=>row.parent===tag).map(row=>row.id)]);
      pool=m.questions.filter(q=>q.active&&(mode==='exam'||(!tag||q.tagIds.some(id=>tags.has(id)))&&
        (scope!=='unseen'||!m.attempted.includes(q.sourceId)&&!seen.has(q.base))&&
        (scope!=='review'||m.review.includes(q.sourceId)||status.get(q.id)?.tier||status.get(q.id)?.unsure)&&
        (!(reinforce||mode==='strength-exam')||!excluded.has(q.base))));
      const size=mode==='exam'?70:count;
      if(!Number.isSafeInteger(size)||size<1||size>70)throw Error('题数请输入 1 至 70');
      requested=size;
      if(selected)pool=selected;
      pool=drawStudy(pool,size,status,mode==='strength-exam'||mode==='practice'&&reinforce);
    }else if(selected)pool=selected;
    else if(mode==='sentence'){
      if(!Number.isSafeInteger(count)||count<1||count>30)throw Error('句数请输入 1 至 30');
      pool=drawStudy(pool,count,states(),true);
      requested=count;
    }
    if(!pool.length)throw Error('没有符合条件的题目，请调整筛选或更换材料');
    const items=pool.map(question=>{
      const q=structuredClone(question);
      if(q.options&&!q.preserve)q.options=shuffled(q.options);
      if(q.pairs?.length)q.pairs=shuffled(q.pairs);
      if(q.chunks?.length)q.chunks=shuffled(q.chunks);
      return {question:q};
    });
    const now=clock();
    const context=m.kind==='language'?{background:m.background,roleA:m.roleA,roleB:m.roleB,goal:m.goal,closing:m.closing,
      topic:topic??m.topic,sceneOnly:m.sceneOnly,sceneId:m.sceneId}:undefined;
    const s={id:randomUUID(),mode,material:materialId,title:title??m.title,context,items,sourceTurn,position:0,created:now,
      status:'running',started:now,remaining:timed(mode)?hour:null,requested};
    saveSession(s);
    return view(s);
  }
  function operate(id,action,args={}){
    const s=findSession(id);
    const index=args.index??s.position,item=s.items[index],exam=timed(s.mode);
    if(!item||!Number.isSafeInteger(index))throw Error('该作答不存在');
    if(s.status==='completed'){
      if(action==='dispute'&&item.result!=='unanswered'&&item.question.type==='sentence'){
        if(!['variant','dictation'].includes(args.reason))throw Error('请选择疑问原因');
        item.originalResult??=item.result;
        item.originalConcepts??=[...(item.evidenceConcepts??[])];
        item.disputed=args.reason;
      }else if(action==='resolve'&&item.question.type==='sentence'&&item.disputed&&['original','correct'].includes(args.result)){
        item.disputed=null;
        if(args.result==='correct'&&s.mode!=='free'){item.result='correct';item.evidenceConcepts=[];}
        else if(args.result==='original'&&item.originalResult){item.result=item.originalResult;item.evidenceConcepts=item.originalConcepts;}
      }else if(action==='doubt'&&item.question.base){
        setDoubt(item.question.base,args.value);
        return view(s);
      }else return view(s);
      saveSession(s);
      return view(s);
    }
    if(action==='position'){
      if(s.mode==='free'&&index>0&&!item.prompt)throw Error('请先完成当前一轮');
      if(s.mode==='script'&&s.items.slice(0,index).some(turn=>!turn.result))throw Error('请先完成前面的轮次');
      s.position=index;
    }else if(action==='pause'&&exam&&s.status==='running'){
      s.remaining=timeLeft(s,clock());s.status='paused';s.started=null;
    }else if(action==='resume'&&s.status==='paused'){
      s.status='running';s.started=clock();
    }else if(action==='finish'){
      if(s.mode==='free'){
        const current=s.items[s.position];
        s.items=s.items.slice(0,s.position+(current.draft?1:0));
        s.position=Math.max(0,s.items.length-1);
        s.summary=`已记录 ${s.items.length} 轮，表达反馈待核对。`;
      }
      settle(s,'manual');
      return view(s);
    }else if(s.status==='running'){
      if(action==='flag'&&exam)item.flag=Boolean(args.value);
      else if(action==='unsure'&&index===s.position)item.unsure=Boolean(args.value);
      else if(['hint','assemble'].includes(action)&&!exam&&s.mode!=='free'&&!item.result){
        item.hinted=true;item.revealed ||= action==='hint';
      }
      else if(action==='answer'||action==='retry'||action==='draft'){
        const sentence=item.question.type==='sentence';
        const value=sentence&&typeof args.value==='string'?args.value.trim():args.value;
        if(sentence?typeof value!=='string'||value.length>1500:!validSelection(item.question,value))throw Error('作答格式无效');
        if(action==='draft'&&!item.result&&!exam)item.draft=value;
        if(action==='retry'&&item.result&&!exam&&s.mode!=='free'){
          item.retry={answer:value,result:sentence?(normalizeStudySentence(value)===normalizeStudySentence(item.question.answer)?'correct':'pending'):gradeQuestion(item.question,value)};
        }
        if(action==='answer'&&!item.result&&s.mode!=='free'){
          item.answer=value;delete item.draft;
          if(!exam){
            const exact=sentence&&normalizeStudySentence(value)===normalizeStudySentence(item.question.answer);
            item.result=sentence?(value?(exact?'correct':args.verdict??'pending'):'unanswered'):gradeQuestion(item.question,value);
            if(sentence&&value){
              item.feedback=args.feedback;
              item.evidenceConcepts=item.question.concepts.filter(concept=>exact||args.concepts?.includes(concept.id)).map(concept=>concept.id);
            }
          }
        }
      }
    }
    saveSession(s);
    return view(s);
  }
  function freeCommit(id,index,answer,reply){
    const s=findSession(id),item=s.items[index];
    if(s.mode!=='free'||s.status!=='running'||index!==s.position||!item||item.result)return view(s);
    item.answer=answer;delete item.draft;item.result=answer?'pending':'unanswered';item.feedback=reply.feedback;
    if(reply.done||index===s.items.length-1){
      s.items=s.items.slice(0,index+1);s.summary=reply.summary;s.closing=reply.next;
      settle(s,'manual');
    }else{
      s.items[index+1].prompt=reply.next;s.position=index+1;saveSession(s);
    }
    return view(s);
  }
  function verificationQuestions(s,index){
    const item=s.items[index];
    if(s.mode!=='free'||s.status!=='completed'||!item?.answer||item.draftOnly||item.disputed)return [];
    const prompt=normalizeStudySentence(item.prompt??item.question.stem);
    if(!prompt)return [];
    // 只使用本场实际出现的提问。引用同一场景的已缓存剧本，无明确对应时保留原句待验证。
    const pool=variantPool(s.material).filter(({sceneId})=>sceneId&&sceneId===s.context.sceneId);
    if(!s.context.sceneOnly)pool.unshift({question:item.question,material:s.material});
    const choices=new Map();
    for(const entry of pool){
      const q=entry.question;
      if(q.answer&&normalizeStudySentence(q.stem)===prompt&&!choices.has(q.id))choices.set(q.id,entry);
    }
    return [...choices.values()];
  }
  function replayCurrent(materialId,originals,sourceTurn,accepted){
    const material=getMaterial(materialId);
    if(!material)return {retryStatus:'missing',materialId};
    const byBase=new Map((material.questions??material.turns).map(q=>[q.base??q.id,q]));
    const selected=[],changed=[];
    for(const old of originals){
      let current=byBase.get(old.base??old.id);
      if(!current&&material.kind==='language'){
        const [,script,,step]=JSON.parse(old.id);
        const candidate=material.turns[step-1];
        if(candidate&&JSON.parse(candidate.id)[1]===script)current=candidate;
      }
      if(!current||current.active===false||current.base&&isDoubt(current.base))continue;
      if(current.id!==old.id){
        const changes=[];
        if(old.type!==current.type)changes.push('题型');
        if(old.stem!==current.stem)changes.push('题干');
        const rows=values=>JSON.stringify((values??[]).map(({id,text})=>[id,text]).sort(([a],[b])=>a.localeCompare(b)));
        if(rows(old.options)!==rows(current.options))changes.push('选项');
        if(rows(old.pairs)!==rows(current.pairs))changes.push('配对');
        if(old.answer!==current.answer||JSON.stringify([...(old.correct??[])].sort())!==JSON.stringify([...(current.correct??[])].sort()))changes.push('参考答案');
        changed.push((current.title??current.stem)+'（'+(changes.join('、')||'材料修订')+'）');
      }
      selected.push(current);
    }
    if(!selected.length)throw Error('原题已停用、标疑或移除，仍可回看历史作答');
    const versions=selected.map(q=>q.id);
    const skipped=originals.length-selected.length;
    if((changed.length||skipped)&&JSON.stringify(accepted)!==JSON.stringify(versions))
      return {retryStatus:'changed',changed,skipped,versions};
    return create(materialId,{mode:material.kind==='language'?'sentence':'practice',selected,count:selected.length,sourceTurn});
  }
  function formalRetry(id,index,accepted){
    const record=read(sql('SELECT body FROM relay WHERE id=?').get(id));
    const item=record?.session.items[index];
    if(record?.session.status!=='completed'||!record.material||!item?.evidenceId||!validStudyQuestionBase(item.base))throw Error('这份记录仅可回看');
    return replayCurrent(record.material,[{...item.question,id:item.evidenceId,base:item.base}],{id,index,formal:true},accepted);
  }
  function next(id,index,kind,ref,accepted){
    const s=findSession(id);
    if(kind==='script'&&s.mode==='free')return create(s.material,{mode:'script'});
    if(s.status!=='completed')throw Error('请先结束本场再复练');
    const q=s.items[index]?.question;
    if(!q)throw Error('找不到原作答');
    if(kind==='wrong'){
      const chosen=s.items.filter(item=>['wrong','unanswered','pending'].includes(item.result)||item.unsure).map(item=>item.question);
      if(!chosen.length)throw Error('这场没有待复练的题目');
      return replayCurrent(s.material,chosen,{id,index},accepted);
    }
    if(kind==='verify'){
      const choice=verificationQuestions(s,index).find(({question})=>question.id===ref);
      if(!choice)throw Error('这个原句暂无可验证材料，疑点保留在本场');
      return replayCurrent(choice.material,[choice.question],{id,index},accepted);
    }
    const choice=kind==='variant'?findVariant(variantPool(s.material),q,s.items[index].evidenceConcepts):{question:q,material:s.material};
    if(!choice)throw Error('暂无变式，原题验证记录仍可查看');
    return replayCurrent(choice.material,[choice.question],{id,index},accepted);
  }
  return {cache,overview,history,material,create,view:id=>view(findSession(id)),findSession,operate,next,freeCommit,
    scene:id=>{const m=getMaterial(id);return m?.sceneOnly?m:null;},
    scenes:()=>sql("SELECT body FROM materials WHERE kind='language' ORDER BY rowid DESC").all().map(read)
      .filter(m=>m.sceneOnly).map(({id,title,topics})=>({id,title,topics})),
    freeFinish:(id,reply)=>{
      const s=findSession(id);
      s.items=s.items.slice(0,s.position);s.position=Math.max(0,s.position-1);s.summary=reply.summary;s.closing=reply.next;
      settle(s,'manual');
      return view(s);
    },
    scriptOptions:(id,index)=>verificationQuestions(findSession(id),index).map(({question:q})=>({id:q.id,label:q.intent||q.stem})),
    relayGet:id=>read(sql('SELECT body FROM relay WHERE id=?').get(id)),
    relaySet,formalReceipt,formalRetry,
    isDoubt,setDoubt,
    close:()=>db.close()};
}
