import {randomUUID} from 'node:crypto';
import {bankMaterial,cacheStudyImage,publicQuestion,questionMedia,studyAssetIds,studyQuestionBase,studyQuestionId,studyServerQuestion,validSelection,validStudyQuestionBase} from './study-materials.mjs';
import {pairChoice} from './pair-choice.mjs';

const prefix='/api/study/v1';
const segment=value=>{
  if(typeof value!=='string'||!/^[-_a-zA-Z0-9]{1,120}$/u.test(value))throw Error('资料编号无效');
  return value;
};
const sameSelection=(a,b)=>a.length===b.length&&a.every(value=>b.includes(value));
const matchesPatch=(item,patch)=>item&&(!('selected_ids' in patch)||sameSelection(patch.selected_ids,item.selected_ids))&&
  (!('flag' in patch)||patch.flag===item.flagged)&&(!('note' in patch)||patch.note===(item.note??''));
// 评论与复盘在绯月里的统一形状。
const entry=row=>({id:row.id,body:row.body,revision:row.revision,time:row.created_at});

export function createStudyRelay(store,connect,{clock=Date.now,fetchImage}={}){
  function record(id){return store.relayGet(id);}
  async function request(path,operation){
    const client=await connect?.();
    if(!client)throw Error('学习服务尚未连接，可使用已缓存材料或导入文件');
    const response=await client.request(path,operation?{
      method:operation.method??'POST',body:JSON.stringify(operation.body),
      headers:{'Content-Type':'application/json','Idempotency-Key':operation.key,
        ...(operation.revision!=null?{'If-Match':String(operation.revision)}:{})},
      signal:AbortSignal.timeout(12_000),
    }:{signal:AbortSignal.timeout(12_000)});
    if(response.status===204)return null;
    const body=await response.json().catch(()=>undefined);
    if(!response.ok){
      const code=body?.error?.code;
      const known={AUTH_REQUIRED:'学习服务授权未就绪',NOT_FOUND:'来源没有此项，可能已移除，请刷新目录',
        CLOUD_UNAVAILABLE:'来源资料暂不可用，请稍后重试',STUDY_NOT_CONFIGURED:'学习服务尚未配置'};
      const message=body?.error?.message??known[code]??([401,403].includes(response.status)?
        '学习服务授权未就绪':'学习服务请求失败（'+response.status+'），请重试');
      throw Object.assign(Error(message),{status:response.status,code});
    }
    if(body===undefined||body===null&&path!==prefix+'/sessions/current')throw Error('学习服务返回了无效数据');
    return body;
  }
  async function pages(path,initial={}){
    const items=[];
    let cursor;
    const seen=new Set();
    do{
      const query=new URLSearchParams({...initial,...(cursor?{cursor}:{})});
      const page=await request(path+'?'+query);
      if(!Array.isArray(page?.items))throw Error('学习服务目录无效');
      items.push(...page.items);
      cursor=page.next_cursor??page.cursor;
      if(cursor&&seen.has(cursor))throw Error('学习服务目录游标重复');
      if(cursor)seen.add(cursor);
    }while(cursor);
    return items;
  }
  async function catalog(){
    return (await pages(prefix+'/banks')).filter(row=>row.status==='active').map(row=>({id:row.id,title:row.name}));
  }
  async function catalogPage(cursor){
    if(cursor!=null&&(typeof cursor!=='string'||cursor.length>2048))throw Error('材料目录或游标无效');
    const query=new URLSearchParams({limit:'10'});
    if(cursor)query.set('cursor',cursor);
    const page=await request(prefix+'/banks?'+query);
    if(!Array.isArray(page?.items))throw Error('来源目录格式无效');
    const items=page.items.filter(row=>row.status==='active').map(row=>({id:segment(row.id),title:row.title??row.name}));
    if(items.some(row=>typeof row.title!=='string'||!row.title))throw Error('来源标题无效');
    const next=page.next_cursor??page.cursor??null;
    if(next!=null&&(typeof next!=='string'||!next||next.length>2048||next===cursor))throw Error('来源分页游标无效');
    return {items,next};
  }
  async function download(id){
    id=segment(id);
    const path=prefix+'/banks/'+id;
    const [bank,questions,tags,review]=await Promise.all([
      request(path),pages(path+'/questions',{status:'active'}),pages(prefix+'/tags'),pages(path+'/review'),
    ]);
    const refs=[...new Set(questions.flatMap(q=>studyAssetIds(q.stem,q.explanation)))];
    const images=[];
    for(const ref of refs){
      if(ref==='.'||ref==='..')continue;
      try{images.push(await cacheStudyImage(await request(prefix+'/assets/'+encodeURIComponent(ref)),fetchImage));}
      catch(error){if(error.status!==404)throw error;}
    }
    const m=bankMaterial({bank_id:id,questions,images},{title:bank.name,
      tags:tags.filter(tag=>(!tag.bank_id||tag.bank_id===id)&&tag.status!=='archived'),
      review,attempts:questions.filter(q=>q.attempted===true).map(q=>({question_id:q.id}))});
    m.attemptsComplete=questions.every(q=>typeof q.attempted==='boolean');
    m.fetchedAt=clock();
    store.cache([m]);return store.material(m.id);
  }
  function identity(){
    let device=record('identity');
    if(!device){
      device={device_id:randomUUID(),instance_id:randomUUID()};
      store.relaySet('identity',device);
    }
    return device;
  }
  function decode(dto){
    if(!dto?.id||dto.mode!=='exam'||!['running','paused','completed'].includes(dto.status)||!Array.isArray(dto.items))
      throw Error('当前云端场次不是可读取的正式考试');
    const done=dto.status==='completed';
    return {...Object.fromEntries(['id','bank_name','status','started_at','finished_at','finish_reason','revision','writer_epoch',
      'writer_device_id','writer_instance_id','current_position','effective_remaining_ms','correct_count','passed'].map(k=>[k,dto[k]])),
      items:dto.items.map(item=>{
        const q=item.snapshot;
        // 运行中只投影题面，兼容较早知序的配对题回执。答案字段不进入存储或界面。
        const order=(indices,rows=[])=>indices.map(id=>rows.find(row=>row.id===id)).filter(Boolean)
          .map(({id,text})=>({id,text}));
        const question=publicQuestion({id:item.id,type:q.type,stem:q.stem,title:q.title,externalId:q.external_id,explanation:done?q.explanation:undefined,
          options:order(item.option_order,q.options),pairs:order(item.pair_order??[],q.pairs),
          media:questionMedia(q.stem,done?q.explanation:'',q.assets)},done);
        if(done)Object.assign(question,{explanation:q.explanation,correct:q.type==='matching'
          ?q.answer_pairs.map(pair=>pairChoice(pair.pair_id,pair.option_id)):q.answer_option_ids});
        const bankId=q.bank_id??dto.bank_id,questionId=item.question_id??q.id;
        const base=[bankId,questionId].every(value=>typeof value==='string'&&value.trim())?studyQuestionBase(bankId,questionId):undefined;
        const evidenceId=done&&base?studyQuestionId(bankId,questionId,q.type,q.stem,
          q.options.map(({id,text})=>({id,text})),(q.pairs??[]).map(({id,text})=>({id,text})),question.correct):undefined;
        return {question,evidenceId,base,answer:item.selected_ids,flag:item.flagged,note:item.note??'',
          reflections:dto.reflections?.filter(row=>row.session_item_id===item.id).map(entry),
          result:done?item.correctness:undefined};
      })};
  }
  const writable=s=>s.writer_device_id===identity().device_id&&s.writer_instance_id===identity().instance_id;
  const positionPending=r=>Number.isInteger(r?.position)&&r.session.status!=='completed'&&
    r.position!==r.session.current_position&&writable(r.session);
  const outstanding=r=>Object.keys(r?.drafts??{}).length>0||Boolean(r?.pending)||positionPending(r);
  function view(id){
    const row=record(id);
    if(!row?.session)throw Error('尚未取回正式考试');
    const s=row.session,done=s.status==='completed';
    const items=s.items.map(item=>{
      const patch=row.drafts?.[item.question.id];
      const {evidenceId,base,...display}=item;
      const hasSource=done&&validStudyQuestionBase(base);
      return {...display,...(!done?patch:undefined),unsure:!!row.unsure?.[item.question.id],canRetry:hasSource&&!!row.material&&!!evidenceId,
        serverAnswer:patch?.answer!==undefined?item.answer:undefined,serverFlag:patch?.flag!==undefined?item.flag:undefined,
        serverNote:patch?.note!==undefined?item.note??'':undefined,draftNote:done?patch?.note:undefined,
        canComment:done&&Boolean(studyServerQuestion(base)),
        pending:Boolean(patch),draftAnswer:done?patch?.answer:undefined,doubt:hasSource?store.isDoubt(base):undefined};
    });
    return {id,material:row.material,title:s.bank_name,mode:'formal',status:s.status,created:s.started_at,finished:s.finished_at,
      position:row.position??s.current_position??0,remaining:s.effective_remaining_ms==null?null:Math.max(0,s.effective_remaining_ms-
        (s.status==='running'?Math.max(0,clock()-row.received):0)),items,reason:s.finish_reason,correct:s.correct_count,passed:s.passed,
      writer:writable(s),pending:outstanding(row),pendingAction:row.pending?.action,conflict:Boolean(row.conflict),
      reviewDrafts:!done&&!!row.reviewDrafts,serverPosition:s.current_position,revision:s.revision,
      error:row.error,offline:Boolean(row.offline)};
  }
  function save(dto,previous={},changes={}){
    const session=decode(dto),drafts={...previous.drafts};
    // 只有场次读取回执带复盘，其他回执沿用已取回的内容。
    if(!dto.reflections){
      const kept=new Map(previous.session?.items.map(item=>[item.question.id,item.reflections]));
      for(const item of session.items)item.reflections=kept.get(item.question.id);
    }
    for(const item of session.items){
      const id=item.question.id,patch=drafts[id];
      if(!patch)continue;
      const remaining={...patch};
      if('answer' in patch&&sameSelection(patch.answer,item.answer))delete remaining.answer;
      if('flag' in patch&&patch.flag===item.flag)delete remaining.flag;
      if('note' in patch&&patch.note===(item.note??''))delete remaining.note;
      if(Object.keys(remaining).length)drafts[id]=remaining;
      else delete drafts[id];
    }
    const evidence=session.status==='completed'?session.items.filter(item=>item.evidenceId&&item.base).map(item=>({
      question:{id:item.evidenceId,base:item.base},result:item.result,unsure:!!previous.unsure?.[item.question.id],
      mistaken:item.result==='wrong'?item.answer.filter(id=>!item.question.correct.includes(id)):undefined,
    })):null;
    const keepPosition=previous.position!=null&&previous.position!==previous.session?.current_position;
    const position=keepPosition&&session.status!=='completed'?previous.position:undefined;
    const needsReview=(changes.conflict||previous.reviewDrafts)&&
      (Object.keys(drafts).length>0||position!=null&&position!==session.current_position);
    store.formalReceipt({...previous,session,drafts,position,received:clock(),offline:false,error:null,...changes,
      conflict:Boolean(changes.conflict)&&(needsReview||!writable(session)),reviewDrafts:needsReview},evidence);
    if(!record('latest')||!previous.session||record('latest').id===session.id)store.relaySet('latest',{id:session.id});
    return view(session.id);
  }
  function saveCurrent(dto,row,changes={}){
    const changed=row?.session&&dto.revision!==row.session.revision&&outstanding(row);
    const conflict=Boolean(dto.status!=='completed'&&(changed||row?.conflict));
    return save(dto,row,{conflict,...changes});
  }
  async function refresh(id){
    const row=record(id);
    try{
      const dto=await request(prefix+'/sessions/'+segment(id));
      if(dto.id!==id)throw Error('知序返回了不同场次，原场次仍保留');
      return saveCurrent(dto,row);
    }catch(error){
      if(!row)throw error;
      store.relaySet(id,{...row,offline:true,error:error.message});
      return view(id);
    }
  }
  function operation(action,path,body,method){
    const key=randomUUID();
    return {action,key,path,method,body};
  }
  async function open(bankId,create=false){
    const intent=record('create');
    if(intent){
      let receipt;
      try{
        receipt=await request(intent.path,intent);
        // An idempotent creation receipt can predate a browser takeover or submission.
        const dto=await request(prefix+'/sessions/'+segment(receipt.id));
        if(dto.id!==receipt.id)throw Error('知序返回了不同场次，原操作仍待核对');
        const result=saveCurrent(dto,record(dto.id),{material:intent.material});
        store.relaySet('create',null);return result;
      }catch(error){
        if(!receipt&&error.status&&error.status<500&&![401,403,408,429].includes(error.status))store.relaySet('create',null);
        if(receipt||error.code!=='OPEN_SESSION')throw error;
      }
    }
    const previous=record('latest')?.id;
    const current=await request(prefix+'/sessions/current').catch(error=>{
      if(previous&&!create&&error.code!=='WEB_PRACTICE_OPEN')return undefined;
      throw error;
    });
    if(current){
      const saved=record(current.id);
      const result=saveCurrent(current,saved,{material:saved?.material??JSON.stringify(['bank',current.bank_id])});
      store.relaySet('latest',{id:current.id});
      return result;
    }
    if(previous&&!create)return refresh(previous);
    if(!create)return null;
    const id=segment(bankId);
    const next={...operation('create',prefix+'/sessions',{bank_id:id,mode:'exam',...identity()}),material:JSON.stringify(['bank',id])};
    store.relaySet('create',next);
    return open();
  }
  function draft(id,index,kind,value){
    const row=record(id),item=row?.session.items[index];
    if(!item)throw Error('找不到正式考试作答');
    if(kind==='doubt'&&row.session.status==='completed'){
      if(!validStudyQuestionBase(item.base))throw Error('此旧回执缺少题目来源，无法调整强化状态');
      store.setDoubt(item.base,Boolean(value));return view(id);
    }
    if(kind==='position')row.position=index;
    else if(kind==='unsure'&&row.session.status!=='completed')row.unsure={...row.unsure,[item.question.id]:Boolean(value)};
    else if(row.session.status==='running'&&writable(row.session)&&['answer','flag'].includes(kind)){
      if(kind==='answer'&&!validSelection(item.question,value))throw Error('作答格式无效');
      row.drafts={...row.drafts,[item.question.id]:{...row.drafts?.[item.question.id],[kind]:value}};
    }
    // 解题笔记暂停时也能写。
    else if(kind==='note'&&row.session.status!=='completed'&&writable(row.session)){
      if(typeof value!=='string'||value.length>20000)throw Error('笔记最多 20000 字');
      row.drafts={...row.drafts,[item.question.id]:{...row.drafts?.[item.question.id],note:value}};
    }
    store.relaySet(id,row);
    return view(id);
  }
  async function resolveDraft(id,choice,revision){
    const latest=await refresh(id);
    const row=record(id);
    if(latest.offline||latest.status==='completed'||latest.revision!==revision)return latest;
    if(!row.reviewDrafts||row.pending||!['server','local'].includes(choice))throw Error('请核对最新回执再选择草稿');
    if(choice==='local'&&!writable(row.session))throw Error('请先接管，再决定本机草稿');
    if(choice==='server'){row.drafts={};row.position=row.session.current_position;}
    store.relaySet(id,{...row,reviewDrafts:false,conflict:false});
    return view(id);
  }
  async function send(id,action){
    if(!['takeover','sync','pause','resume','finish'].includes(action))throw Error('考试操作无效');
    let row=record(id);
    if(!row)throw Error('找不到正式场次');
    if(row.pending){
      const current=await refresh(id);
      row=record(id);
      if(current.offline)return current;
      if(current.status==='completed'){
        store.relaySet(id,{...row,pending:null});
        return view(id);
      }
      try{
        const pendingAction=row.pending.action;
        const dto=await request(row.pending.path,row.pending);
        if(dto.id!==id)throw Error('知序回执场次不符，原操作仍待核对');
        if(dto.revision<row.session.revision){
          store.relaySet(id,{...row,pending:null,conflict:true});
          return view(id);
        }
        const body=row.pending.body;
        if(pendingAction==='sync'&&(dto.current_position!==body.current_position||
          body.item_id&&!matchesPatch(dto.items.find(item=>item.id===body.item_id),body))){
          return save(dto,row,{pending:null,error:'知序回执与本次作答不一致，草稿仍待核对。'});
        }
        const receipt=save(dto,row,{pending:null});
        row=record(id);
        if(action==='sync'&&pendingAction==='sync'&&receipt.pending&&receipt.status==='running')return send(id,'sync');
        if(action===pendingAction||action==='sync')return receipt;
      }catch(error){
        if(!error.status||error.status>=500||[401,403,408,429].includes(error.status)){
          store.relaySet(id,{...row,offline:true,error:error.message});return view(id);
        }
        store.relaySet(id,{...row,pending:null,conflict:[409,412].includes(error.status),error:error.message});
        const latest=await refresh(id);
        if(latest.offline||latest.status==='completed')return latest;
        store.relaySet(id,{...record(id),error:error.message});
        return view(id);
      }
    }
    const fresh=await refresh(id);
    row=record(id);
    const s=row.session;
    if(fresh.offline||s.status==='completed')return fresh;
    if(action!=='takeover'&&(!writable(s)||row.conflict||row.reviewDrafts))return fresh;
    const patch=Object.entries(row.drafts??{}).map(([item_id,values])=>({item_id,
      ...('answer' in values?{selected_ids:values.answer}:{}),...('flag' in values?{flag:values.flag}:{}),
      ...('note' in values?{note:values.note}:{})}));
    const hasPosition=positionPending(row);
    if(action==='sync'&&!patch.length&&!hasPosition)return fresh;
    if(action==='sync'&&s.status==='paused'&&patch[0]&&'selected_ids' in patch[0])throw Error('请先恢复考试，再提交待同步答案');
    const body={expected_revision:s.revision,...identity()};
    if(action!=='takeover')body.writer_epoch=s.writer_epoch;
    if(action==='finish'||action==='pause'){
      if(s.status==='paused'&&patch.some(p=>'selected_ids' in p))throw Error('请先恢复考试，再提交待同步答案');
      if(hasPosition){
        if(!patch.length)patch.push({});
        patch[0].current_position=fresh.position;
      }
      if(patch.length)body.final_patch=patch;
    }
    if(action==='sync')Object.assign(body,patch[0],{current_position:fresh.position});
    const verb=action==='sync'?'progress':action;
    const next=operation(action,prefix+'/sessions/'+segment(id)+'/'+verb,body,action==='sync'?'PATCH':'POST');
    store.relaySet(id,{...row,pending:next});
    return send(id,'sync');
  }
  // 新增、修改或删除一条评论或复盘；返回保存后的条目，删除返回 null。
  async function changeEntry(kind,createPath,extra,{ref,revision,value,remove}){
    const path=ref?prefix+'/'+kind+'/'+segment(ref):createPath;
    const saved=await request(path,{method:remove?'DELETE':ref?'PATCH':'POST',key:randomUUID(),revision:ref?revision:undefined,
      body:remove?undefined:{...(ref?{}:extra),body:value}});
    return remove?null:entry(saved);
  }
  const commentsPath=question=>prefix+'/questions/'+segment(question)+'/comments';
  const comments=async question=>(await pages(commentsPath(question))).map(entry).sort((a,b)=>a.time-b.time);
  const comment=(question,change)=>changeEntry('comments',commentsPath(question),{},change);
  async function reflect(id,index,change){
    const item=record(id)?.session.items[index];
    if(!item||record(id).session.status!=='completed')throw Error('交卷后才能复盘');
    const saved=await changeEntry('reflections',prefix+'/sessions/'+segment(id)+'/reflections',{item_id:item.question.id},change);
    const row=record(id),target=row.session.items[index],rest=(target.reflections??[]).filter(old=>old.id!==(change.ref??saved?.id));
    target.reflections=saved?[...rest,saved].sort((a,b)=>a.time-b.time):rest;
    store.relaySet(id,row);
    return saved;
  }
  return {catalog,catalogPage,download,open,view,refresh,draft,resolveDraft,send,comments,comment,reflect,latest:()=>record('latest')?.id};
}
