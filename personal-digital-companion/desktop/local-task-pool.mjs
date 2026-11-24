import {DatabaseSync} from 'node:sqlite';
import {canonical,compileStep,effectiveChanges,hash,invariant,scopeTargets,targetId,validatePlan} from './garden-registration.mjs';
import {inspectGarden} from './garden-backend.mjs';
import {tokyoDate} from './calendar-date.mjs';

const now=()=>new Date().toISOString();
// 正式工作队列（docs/FORMAL_WORK_QUEUE.md）：hasRoom 判断本地待处理是否还有名额，queueInfo 提供排在前面的本机任务数及当前执行项。
export function createLocalTaskPool({file,garden,record,onProgress=()=>{},onResult=()=>{},canWork=()=>true,
  hasRoom=()=>true,queueInfo=()=>({used:0,limit:20,running:null,tasks:0}),onStart=()=>{},registerReminder}){
  const db=new DatabaseSync(file);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,digest TEXT NOT NULL,source_commit TEXT NOT NULL,title TEXT NOT NULL,created TEXT NOT NULL,state TEXT NOT NULL,payload TEXT,steps TEXT NOT NULL,error TEXT,finished TEXT)");
  // acknowledged：调用方已取回最终回执的时间。补列时历史批次一律视为已取回。
  if(!db.prepare('PRAGMA table_info(batches)').all().some(c=>c.name==='acknowledged')){
    db.exec('ALTER TABLE batches ADD COLUMN acknowledged TEXT');
    db.prepare('UPDATE batches SET acknowledged=COALESCE(finished,created)').run();
  }
  db.exec(`CREATE TABLE IF NOT EXISTS reminder_requests(
    id TEXT PRIMARY KEY,digest TEXT NOT NULL,title TEXT NOT NULL,deadline TEXT NOT NULL,created TEXT NOT NULL,
    state TEXT NOT NULL,after_batch INTEGER NOT NULL,payload TEXT,submission_id TEXT,record_id INTEGER,error TEXT,finished TEXT
  )`);
  // 仅已定稿（review IS NOT NULL）且尚未入队执行的批次才在提交前排队；草稿准备阶段不占号、不阻塞。
  db.exec('CREATE TABLE IF NOT EXISTS garden_turns(id TEXT NOT NULL,base TEXT NOT NULL,draft TEXT NOT NULL,review TEXT,PRIMARY KEY(id,base))');
  const waitingTurn="review IS NOT NULL AND review<>'' AND NOT EXISTS (SELECT 1 FROM batches WHERE batches.id=garden_turns.id AND (garden_turns.base='' OR batches.digest<>garden_turns.base))";
  const firstTurn=db.prepare('SELECT id,base,review FROM garden_turns WHERE '+waitingTurn+' ORDER BY rowid LIMIT 1');
  const findTurn=db.prepare('SELECT * FROM garden_turns WHERE id=? AND base=?');
  const dropTurn=db.prepare('DELETE FROM garden_turns WHERE id=? AND base=?');
  const find=db.prepare('SELECT * FROM batches WHERE id=?');
  const findReminder=db.prepare('SELECT * FROM reminder_requests WHERE id=?');
  const report=row=>row&&({id:row.id,title:row.title,reviewHash:row.digest,commit:row.source_commit,state:row.state,
    steps:JSON.parse(row.steps),created:row.created,finished:row.finished,error:row.error,acknowledged:row.acknowledged??null});
  const RUNNABLE="state IN ('queued','running','verifying','archiving')";
  // 提醒记录入队时已存在的最后一个花园批次顺序号，同一毫秒内也保持两类任务的入队顺序。
  const work=`SELECT id,state,rowid AS batch_order,0 AS reminder_order,'garden' AS kind FROM batches
    UNION ALL SELECT id,state,after_batch,rowid,'reminder' FROM reminder_requests`;
  const ready=db.prepare(`SELECT * FROM (${work}) WHERE ${RUNNABLE} ORDER BY batch_order,reminder_order`);
  const unfinished=db.prepare(`SELECT * FROM (${work}) WHERE state!='done' ORDER BY batch_order,reminder_order`);
  // 未完成的批次附带排队信息：position 为 1 时表示正在执行或下一个执行。
  function withQueue(batch){
    if(!batch||!['queued','running','verifying','archiving'].includes(batch.state))return batch;
    const ahead=ready.all().findIndex(row=>row.id===batch.id&&row.kind===(batch.kind??'garden'));
    const q=queueInfo();
    return {...batch,queue:{position:ahead+q.tasks+1,used:q.used,limit:q.limit,running:q.running}};
  }
  const get=id=>report(find.get(id));
  function getReminder(id){
    const row=findReminder.get(id);
    if(!row)return undefined;
    const step=row.state==='done'?'verified':row.state==='running'||row.submission_id?'applying':'pending';
    return {kind:'reminder',id:row.id,title:row.title,deadline:row.deadline,state:row.state,recordId:row.record_id,
      created:row.created,finished:row.finished,error:row.error,steps:[{label:'登记提醒',state:step}]};
  }
  function list(limit=50,before=Number.MAX_SAFE_INTEGER){
    return db.prepare('SELECT rowid AS cursor,id,title,digest,source_commit,state,created,finished,steps,error,acknowledged FROM batches WHERE rowid<? ORDER BY rowid DESC LIMIT ?').all(before,limit).map(row=>({...report(row),cursor:row.cursor}));
  }
  const update=db.prepare('UPDATE batches SET state=?, steps=?, error=? WHERE id=?');
  function unpack(row){
    const saved=JSON.parse(row.payload);
    return saved.plan?saved:{plan:saved,prior:[],sql:[]};
  }
  let working=null,stopped=false,timer=null,active=null;
  function notify(value){active=value;onProgress(value);}
  function schedule(){
    if(stopped||working||timer)return;
    timer=setTimeout(()=>{timer=null;void tick();},50);timer.unref?.();
  }
  async function processReminder(row){
    const saveState=db.prepare('UPDATE reminder_requests SET state=?,error=? WHERE id=?');
    saveState.run('running',null,row.id);
    notify({title:row.title,stage:'登记提醒',done:0,total:1});
    try{
      if(!registerReminder)throw Error('本机登记服务未配置');
      const input={id:row.id,title:row.title,deadline:row.deadline,content:JSON.parse(row.payload).content};
      const recordId=await registerReminder(input,row.submission_id??undefined,id=>{
        db.prepare('UPDATE reminder_requests SET submission_id=? WHERE id=?').run(id,row.id);
      });
      invariant(Number.isSafeInteger(recordId)&&recordId>0,'提醒回执无效');
      db.prepare("UPDATE reminder_requests SET state='done',payload=NULL,record_id=?,finished=? WHERE id=?").run(recordId,now(),row.id);
    }catch{
      saveState.run('blocked','提醒回执待核对，请恢复原编号',row.id);
    }finally{notify(null);}
    onResult(getReminder(row.id));
  }
  async function processBatch(row){
    const {plan,prior,sql}=unpack(row),steps=JSON.parse(row.steps);
    const full={steps:[...prior,...plan.steps]};
    const save=(state,error=null)=>update.run(state,JSON.stringify(steps),error,row.id);
    function progress(stage){
      notify({title:plan.title,stage,done:steps.filter(s=>s.state==='verified').length,total:steps.length});
    }
    try{
      for(const [i,step] of plan.steps.entries()){
        const receipt=steps[prior.length+i];
        if(receipt.state==='verified')continue;
        if(stopped||!canWork())return;
        if(receipt.state==='pending')receipt.state='checking';
        save('running');
        progress(step.label);
        const rev=plan.revision+i;
        const scope=scopeTargets(step);
        const check=await inspectGarden(garden,plan,step.changes,scope);
        const keyedRelease=step.changes.some(c=>c.table==='deploy'&&!c.before&&c.after?.release_key===plan.id);
        const applied=receipt.state==='applying'&&check.after&&
          (check.revision===rev+1||(keyedRelease&&check.revision>rev+1));
        if(!applied){
          if(stopped||!canWork())return;
          invariant(check.before&&check.revision===rev,'花园基线或目标值已变化，请重新核对目标、版本及清单');
          receipt.state='applying';save('running');
          invariant(typeof sql?.[i]==='string','本机缺少已核准 SQL，请按原批次重新制单');
          await garden.write(sql[i]);
          const actual=await inspectGarden(garden,plan,step.changes,scope);
          invariant(actual.after&&actual.revision===rev+1,'步骤回读不一致，已保留执行现场');
        }
        receipt.state='verified';receipt.at=now();receipt.revision=rev+1;save('running');
        progress(step.label+'已核对');
      }
      if(stopped)return;
      let verifiedAt=row.finished;
      if(!verifiedAt){
        save('verifying');progress('整批回读核对');
        const owners=new Map(full.steps.flatMap(scopeTargets).map(s=>[targetId(s),s]));
        const end=await inspectGarden(garden,plan,effectiveChanges(full),[...owners.values()]);
        invariant(end.after&&end.revision>=plan.revision+plan.steps.length,'整批复核未通过，已保留清单和步骤回执');
        verifiedAt=now();
        db.prepare("UPDATE batches SET state='archiving',finished=? WHERE id=?").run(verifiedAt,row.id);
      }
      progress('保存整批复盘');
      const key='garden-batch:'+row.id;
      await record({key,taskId:key,title:row.title,action:'完成花园登记',at:verifiedAt,
        detail:[...(plan.kind==='desktop-update'&&plan.release==='succeeded'?['绯月本机更新已核验']:[]),plan.result,...steps.map((s,i)=>{
          const scope=full.steps[i].scope;
          const targets=[...scope.projects,...scope.flowers].map(target=>target.name).join(' → ');
          return [targets,s.label+'（花园修订 '+s.revision+'）'].filter(Boolean).join(' · ');
        }),'整批回读一致。批次 '+row.id].join('\n')});
      db.prepare("UPDATE batches SET state='done',payload=NULL,error=NULL WHERE id=?").run(row.id);
    }catch(error){save('blocked',error.message);}
    finally{notify(null);}
    onResult(get(row.id));
  }
  function tick(){
    if(stopped||working)return working;
    if(!canWork()){defer();return;}
    const row=ready.get();
    if(!row)return;
    onStart();
    const job=row.kind==='reminder'?processReminder(findReminder.get(row.id)):processBatch(find.get(row.id));
    working=job.finally(()=>{working=null;if(!stopped)defer();});
    return working;
  }
  function defer(){
    if(!stopped&&!timer){timer=setTimeout(()=>{timer=null;void tick();},750);timer.unref?.();}
  }
  function requireRoom(){
    if(!hasRoom()){const q=queueInfo();throw Object.assign(Error('本地待处理已满（'+q.used+'/'+q.limit+'），请稍后再提交'),{status:429});}
  }
  function claimTurn(id,draft,review,poll=false,base=''){
    const prior=findTurn.get(id,base);
    invariant(!prior || prior.draft===draft,'该编号已有不同草案；请核实原编号，放弃原草案后再重制');
    const batch=get(id);
    if(base){
      if(prior && batch?.reviewHash===prior.review)return {state:'submitted',batch};
      invariant(batch?.state==='blocked'&&batch.reviewHash===base,'续办摘要或原批状态已变化，请查询回执');
    }else if(batch)return {state:'submitted',batch};
    invariant(prior||!poll,'原排队已取消，请重新准备');
    db.prepare('INSERT OR IGNORE INTO garden_turns(id,base,draft) VALUES(?,?,?)').run(id,base,draft);
    if(review){
      invariant(!prior?.review||prior.review===review,'该批已有最终清单，请使用原文件或先取消取号');
      db.prepare('UPDATE garden_turns SET review=? WHERE id=? AND base=?').run(review,id,base);
    }
    const position=review?db.prepare('SELECT count(*) AS n FROM garden_turns WHERE '+waitingTurn+' AND rowid<=(SELECT rowid FROM garden_turns WHERE id=? AND base=?)').get(id,base).n:1;
    const activeBatch=db.prepare("SELECT id FROM batches WHERE "+RUNNABLE+" LIMIT 1").get();
    const ready=(position<=1)&&(!review || !activeBatch || activeBatch.id===id);
    return {state:ready?'ready':'waiting',position:Math.max(1,position),reviewHash:review??prior?.review??null};
  }
  function allowSubmit(plan,digest){
    const head=firstTurn.get();
    invariant(!head||(head.id===plan.id&&head.base===(plan.continues??'')),'请等待当前批次完成最终取号和登记');
    if(head){
      invariant(head.id===plan.id && head.review===digest,'发布须先通过登记队列定稿，并提交已确认的同一摘要');
    }
  }
  function submit(plan,commit,digest){
    validatePlan(plan);invariant(hash(canonical(plan))===digest,'确认摘要无效');
    const old=get(plan.id);
    if(old){invariant(old.reviewHash===digest,'批次编号已对应另一份清单');return {existing:true,batch:old};}
    allowSubmit(plan,digest);
    invariant(!plan.continues,'续办清单必须提交到原批次');
    requireRoom();
    const steps=plan.steps.map(s=>({label:s.label,state:'pending'}));
    db.prepare("INSERT INTO batches(id,digest,source_commit,title,created,state,payload,steps) VALUES(?,?,?,?,?,'queued',?,?)")
      .run(plan.id,digest,commit,plan.title,now(),JSON.stringify({plan,prior:[],sql:plan.steps.map((_,i)=>compileStep(plan,i))}),JSON.stringify(steps));
    schedule();return {existing:false,batch:withQueue(get(plan.id))};
  }
  function submitReminder({id,title,deadline,content}){
    const digest=hash(canonical({title,deadline,content}));
    const old=findReminder.get(id);
    if(old){
      invariant(old.digest===digest,'提醒编号已对应另一份内容');
      return {existing:true,reminder:withQueue(getReminder(id))};
    }
    if(deadline.slice(0,10)<tokyoDate())throw Object.assign(Error('提醒日期不能早于东京今天'),{status:400});
    if(!registerReminder)throw Object.assign(Error('本机登记服务未配置'),{status:503});
    requireRoom();
    db.prepare(`INSERT INTO reminder_requests(id,digest,title,deadline,created,state,after_batch,payload)
      VALUES(?,?,?,?,?,'queued',(SELECT COALESCE(MAX(rowid),0) FROM batches),?)`)
      .run(id,digest,title,deadline,now(),JSON.stringify({content}));
    schedule();return {existing:false,reminder:withQueue(getReminder(id))};
  }
  function retryReminder(id){
    const reminder=getReminder(id);
    if(reminder?.state==='done')return reminder;
    invariant(reminder?.state==='blocked','只有暂停的提醒登记可恢复');
    db.prepare("UPDATE reminder_requests SET state='queued',error=NULL WHERE id=?").run(id);
    schedule();return withQueue(getReminder(id));
  }
  async function revise(plan,commit,digest){
    validatePlan(plan);
    invariant(hash(canonical(plan))===digest,'确认摘要无效');
    const row=find.get(plan.id);
    if(row?.digest===digest)return get(plan.id);
    invariant(row?.state==='blocked'&&!row.finished&&plan.continues===row.digest,'只能用重新确认的清单续办尚未最终核对的暂停批次');
    const saved=unpack(row),receipts=JSON.parse(row.steps);
    invariant(plan.kind===saved.plan.kind,'续办不能改变任务类型');
    const prior=saved.prior.slice();
    for(const [i,step] of saved.plan.steps.entries()){
      const receipt=receipts[prior.length];
      if(receipt.state==='applying'){
        const check=await inspectGarden(garden,plan,step.changes,scopeTargets(step));
        invariant(check.revision===plan.revision,'续办清单基线已变化，请重新核对');
        if(check.before)break;
        // 仅经重新确认的续办可在更新的修订核对目标终值，回执记录实际读回修订。
        invariant(check.after&&check.revision>=saved.plan.revision+i+1,'在途步骤结果仍不明确，须先核实原写入');
        Object.assign(receipt,{state:'verified',revision:check.revision,at:now()});
      }
      if(receipt.state!=='verified')break;
      prior.push(step);
    }
    const nextReceipts=receipts.slice(0,prior.length).map(s=>({...s,commit:s.commit??row.source_commit}));
    for(const s of plan.steps)nextReceipts.push({label:s.label,state:'pending'});
    allowSubmit(plan,digest);
    if(prior.some(s=>s.changes.some(c=>c.table==='deploy'&&!c.before))){
      invariant(!plan.steps.some(s=>s.changes.some(c=>c.table==='deploy'&&!c.before)),'原发布已登记，续办不能重复新增部署');
    }
    const result=db.prepare("UPDATE batches SET digest=?,source_commit=?,title=?,state='queued',payload=?,steps=?,error=NULL WHERE id=? AND state='blocked' AND digest=?")
      .run(digest,commit,plan.title,JSON.stringify({plan,prior,sql:plan.steps.map((_,i)=>compileStep(plan,i))}),JSON.stringify(nextReceipts),row.id,row.digest);
    invariant(result.changes===1,'批次已发生变化，请读取最新回执');
    schedule();return get(plan.id);
  }
  return {claimTurn,cancelTurn(id,draft,base='',unsealedOnly=false){
    const batch=get(id);
    invariant(!batch||(base&&batch.state==='blocked'&&batch.reviewHash===base),'已提交批次请查看原回执');
    const prior=findTurn.get(id,base);
    invariant(!prior||prior.draft===draft,'草案摘要不一致');
    if(unsealedOnly&&prior?.review)return {state:'retained'};
    dropTurn.run(id,base);return {state:'cancelled'};
  },submit,revise,get,list,submitReminder,getReminder,retryReminder,tick,start:schedule,withQueue,get active(){return active;},
    // 占用名额的批次：除 done 外都算，暂停（blocked）的也占名额，直到恢复或续办完成。
    unfinished:()=>unfinished.all().length,
    unacknowledged:()=>db.prepare("SELECT rowid AS cursor,* FROM batches WHERE state IN ('done','blocked') AND acknowledged IS NULL ORDER BY rowid").all().map(row=>({...report(row),cursor:row.cursor})),
    ack(id){
      const batch=get(id);invariant(batch?.state==='done','只能取回已完成批次的回执');
      db.prepare('UPDATE batches SET acknowledged=? WHERE id=? AND acknowledged IS NULL').run(now(),id);
      return get(id);
    },
    pending:()=>unfinished.all().map(row=>row.kind==='reminder'?getReminder(row.id):get(row.id)),
    retry(id,digest){
      const batch=get(id);invariant(batch?.state==='blocked'&&digest===batch.reviewHash,'只能按原确认摘要恢复已暂停批次');
      invariant(!firstTurn.get(),'另一批正在定稿，请在登记完成后按原编号重试');
      db.prepare("UPDATE batches SET state='queued',error=NULL WHERE id=?").run(id);schedule();return get(id);
    },
    async pause(){stopped=true;clearTimeout(timer);timer=null;await working;},
    resume(){stopped=false;schedule();},
    async close(){await this.pause();db.close();},
  };
}
