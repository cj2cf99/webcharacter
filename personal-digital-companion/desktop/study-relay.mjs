import {randomUUID} from 'node:crypto';
import {bankMaterial,cacheStudyImage,languageMaterial,publicQuestion,questionMedia,sceneMaterial,studyAssetIds,studyQuestionBase,studyQuestionId,validSelection} from './study-materials.mjs';
import {pairChoice} from './pair-choice.mjs';

const prefix='/api/study/v1';
const language='/api/language/dialogues';
const scenes='/api/language/scenes';
const segment=value=>{
  if(typeof value!=='string'||!/^[-_a-zA-Z0-9]{1,120}$/u.test(value))throw Error('资料编号无效');
  return value;
};
const sameSelection=(a,b)=>a.length===b.length&&a.every(value=>b.includes(value));
const matchesPatch=(item,patch)=>item&&(!('selected_ids' in patch)||sameSelection(patch.selected_ids,item.selected_ids))&&
  (!('flag' in patch)||patch.flag===item.flagged);

export function createStudyRelay(store,connect,{clock=Date.now,fetchImage}={}){
  function record(id){return store.relayGet(id);}
  async function request(path,operation){
    const client=await connect?.();
    if(!client)throw Error('学习服务尚未连接，可使用已缓存材料或导入文件');
    const response=await client.request(path,operation?{
      method:operation.method??'POST',body:JSON.stringify(operation.body),
      headers:{'Content-Type':'application/json','Idempotency-Key':operation.key},
      signal:AbortSignal.timeout(12_000),
    }:{signal:AbortSignal.timeout(12_000)});
    const body=await response.json().catch(()=>undefined);
    if(!response.ok)throw Object.assign(Error(body?.error?.message??(response.status===401||response.status===403
      ?'学习服务授权未就绪':'学习服务请求失败（'+response.status+'）')),{status:response.status,code:body?.error?.code});
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
  async function catalog(kind){
    if(kind==='language'){
      const [scripts,rows]=await Promise.all([pages(language),pages(scenes)]);
      return [...scripts.map(row=>({id:row.id,title:row.title})),...rows.map(row=>row.scene??row).filter(scene=>!scene.archived)
        .map(scene=>({id:scene.id,title:scene.title,scene:true}))];
    }
    if(kind==='bank')return (await pages(prefix+'/banks')).filter(row=>row.status==='active').map(row=>({id:row.id,title:row.name}));
    throw Error('材料类型无效');
  }
  async function catalogPage(kind,cursor){
    const path={scripts:language,scenes,banks:prefix+'/banks'}[kind];
    if(!path||cursor!=null&&(typeof cursor!=='string'||cursor.length>2048))throw Error('材料目录或游标无效');
    const query=new URLSearchParams(kind==='banks'?{limit:'20'}:{});
    if(cursor)query.set('cursor',cursor);
    const page=await request(path+'?'+query);
    if(!Array.isArray(page?.items)||kind!=='banks'&&page.version!==1)throw Error('来源目录格式无效');
    const items=page.items.map(row=>row.scene??row).filter(row=>kind==='banks'?row.status==='active':!row.archived)
      .map(row=>({id:segment(row.id),title:row.title??row.name,scene:kind==='scenes'}));
    if(items.some(row=>typeof row.title!=='string'||!row.title))throw Error('来源标题无效');
    const next=page.next_cursor??page.cursor??null;
    if(next!=null&&(typeof next!=='string'||!next||next.length>2048||next===cursor))throw Error('来源分页游标无效');
    return {items,next};
  }
  async function download(kind,id,scene=false){
    id=segment(id);
    if(kind==='language'){
      const entry=await request((scene?scenes:language)+'/'+id);
      const body=scene?entry.scene:entry.script;
      if(entry.version!==1||body?.id!==id||body.archived)throw Error('来源材料已变更，请重新选取');
      const m=scene?sceneMaterial(body):languageMaterial(body);
      store.cache([m]);return store.material(m.id);
    }
    if(kind!=='bank')throw Error('材料类型无效');
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
        const evidenceId=done?studyQuestionId(q.bank_id??dto.bank_id,item.question_id??q.id,q.type,q.stem,
          q.options.map(({id,text})=>({id,text})),(q.pairs??[]).map(({id,text})=>({id,text})),question.correct):undefined;
        const base=studyQuestionBase(q.bank_id??dto.bank_id,item.question_id??q.id);
        return {question,evidenceId,base,answer:item.selected_ids,flag:item.flagged,
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
      return {...display,...(!done?patch:undefined),unsure:!!row.unsure?.[item.question.id],canRetry:done&&!!evidenceId&&!!base,
        serverAnswer:patch?.answer!==undefined?item.answer:undefined,serverFlag:patch?.flag!==undefined?item.flag:undefined,
        pending:Boolean(patch),draftAnswer:done?patch?.answer:undefined,doubt:done&&base?store.isDoubt(base):undefined};
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
    for(const item of session.items){
      const id=item.question.id,patch=drafts[id];
      if(!patch)continue;
      const remaining={...patch};
      if('answer' in patch&&sameSelection(patch.answer,item.answer))delete remaining.answer;
      if('flag' in patch&&patch.flag===item.flag)delete remaining.flag;
      if(Object.keys(remaining).length)drafts[id]=remaining;
      else delete drafts[id];
    }
    const evidence=session.status==='completed'?session.items.map(item=>({
      question:{id:item.evidenceId,base:item.base},result:item.result,unsure:!!previous.unsure?.[item.question.id],
      mistaken:item.result==='wrong'?item.answer.filter(id=>!item.question.correct.includes(id)):undefined,
    })):null;
    const keepPosition=previous.position!=null&&previous.position!==previous.session?.current_position;
    const position=keepPosition&&session.status!=='completed'?previous.position:undefined;
    const needsReview=(changes.conflict||previous.reviewDrafts)&&
      (Object.keys(drafts).length>0||position!=null&&position!==session.current_position);
    store.formalReceipt({...previous,session,drafts,position,received:clock(),offline:false,error:null,conflict:false,...changes,reviewDrafts:needsReview},evidence);
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
      if(!item.base)throw Error('此旧回执缺少题目来源，无法调整强化状态');
      store.setDoubt(item.base,Boolean(value));return view(id);
    }
    if(kind==='position')row.position=index;
    else if(kind==='unsure'&&row.session.status!=='completed')row.unsure={...row.unsure,[item.question.id]:Boolean(value)};
    else if(row.session.status==='running'&&writable(row.session)&&['answer','flag'].includes(kind)){
      if(kind==='answer'&&!validSelection(item.question,value))throw Error('作答格式无效');
      row.drafts={...row.drafts,[item.question.id]:{...row.drafts?.[item.question.id],[kind]:value}};
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
      ...('answer' in values?{selected_ids:values.answer}:{}),...('flag' in values?{flag:values.flag}:{})}));
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
  return {catalog,catalogPage,download,open,view,refresh,draft,resolveDraft,send,latest:()=>record('latest')?.id};
}
