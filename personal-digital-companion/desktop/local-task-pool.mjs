import {DatabaseSync} from 'node:sqlite';
import {canonical,compileStep,effectiveChanges,hash,invariant,scopeTargets,targetId,validatePlan} from './garden-registration.mjs';
import {inspectGarden} from './garden-backend.mjs';

const now=()=>new Date().toISOString();
// 正式工作队列（docs/FORMAL_WORK_QUEUE.md）：hasRoom 判断本地待处理是否还有名额，queueInfo 提供排在前面的本机任务数及当前执行项。
export function createLocalTaskPool({file,garden,record,onProgress=()=>{},onResult=()=>{},canWork=()=>true,
  hasRoom=()=>true,queueInfo=()=>({used:0,limit:20,running:null,tasks:0}),onStart=()=>{}}){
  const db=new DatabaseSync(file);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,digest TEXT NOT NULL,source_commit TEXT NOT NULL,title TEXT NOT NULL,created TEXT NOT NULL,state TEXT NOT NULL,payload TEXT,steps TEXT NOT NULL,error TEXT,finished TEXT)");
  // acknowledged：调用方已取回最终回执的时间。补列时历史批次一律视为已取回。
  if(!db.prepare('PRAGMA table_info(batches)').all().some(c=>c.name==='acknowledged')){
    db.exec('ALTER TABLE batches ADD COLUMN acknowledged TEXT');
    db.prepare('UPDATE batches SET acknowledged=COALESCE(finished,created)').run();
  }
  const find=db.prepare('SELECT * FROM batches WHERE id=?');
  const report=row=>row&&({id:row.id,title:row.title,reviewHash:row.digest,commit:row.source_commit,state:row.state,
    steps:JSON.parse(row.steps),created:row.created,finished:row.finished,error:row.error,acknowledged:row.acknowledged??null});
  const RUNNABLE="state IN ('queued','running','verifying','archiving')";
  // 未完成的批次附带排队信息：position 为 1 时表示正在执行或下一个执行。
  function withQueue(batch){
    if(!batch||!['queued','running','verifying','archiving'].includes(batch.state))return batch;
    const ahead=db.prepare('SELECT count(*) AS n FROM batches WHERE '+RUNNABLE+' AND rowid<(SELECT rowid FROM batches WHERE id=?)').get(batch.id).n;
    const q=queueInfo();
    return {...batch,queue:{position:ahead+q.tasks+1,used:q.used,limit:q.limit,running:q.running}};
  }
  const get=id=>report(find.get(id));
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
        if(!(receipt.state==='applying'&&check.after&&check.revision===rev+1)){
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
        detail:[plan.result,...steps.map((s,i)=>{
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
    const row=db.prepare("SELECT * FROM batches WHERE state IN ('queued','running','verifying','archiving') ORDER BY rowid LIMIT 1").get();
    if(!row)return;
    onStart();
    working=processBatch(row).finally(()=>{working=null;if(!stopped)defer();});
    return working;
  }
  function defer(){
    if(!stopped&&!timer){timer=setTimeout(()=>{timer=null;void tick();},750);timer.unref?.();}
  }
  function submit(plan,commit,digest){
    validatePlan(plan);invariant(hash(canonical(plan))===digest,'确认摘要无效');
    const old=get(plan.id);
    if(old){invariant(old.reviewHash===digest,'批次编号已对应另一份清单');return {existing:true,batch:old};}
    invariant(!plan.continues,'续办清单必须提交到原批次');
    if(!hasRoom()){const q=queueInfo();throw Object.assign(Error('本地待处理已满（'+q.used+'/'+q.limit+'），请稍后再提交'),{status:429});}
    const steps=plan.steps.map(s=>({label:s.label,state:'pending'}));
    db.prepare("INSERT INTO batches(id,digest,source_commit,title,created,state,payload,steps) VALUES(?,?,?,?,?,'queued',?,?)")
      .run(plan.id,digest,commit,plan.title,now(),JSON.stringify({plan,prior:[],sql:plan.steps.map((_,i)=>compileStep(plan,i))}),JSON.stringify(steps));
    schedule();return {existing:false,batch:withQueue(get(plan.id))};
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
    const result=db.prepare("UPDATE batches SET digest=?,source_commit=?,title=?,state='queued',payload=?,steps=?,error=NULL WHERE id=? AND state='blocked' AND digest=?")
      .run(digest,commit,plan.title,JSON.stringify({plan,prior,sql:plan.steps.map((_,i)=>compileStep(plan,i))}),JSON.stringify(nextReceipts),row.id,row.digest);
    invariant(result.changes===1,'批次已发生变化，请读取最新回执');
    schedule();return get(plan.id);
  }
  return {submit,revise,get,list,tick,start:schedule,withQueue,get active(){return active;},
    // 占用名额的批次：除 done 外都算，暂停（blocked）的也占名额，直到恢复或续办完成。
    unfinished:()=>db.prepare("SELECT count(*) AS n FROM batches WHERE state!='done'").get().n,
    unacknowledged:()=>db.prepare("SELECT rowid AS cursor,* FROM batches WHERE state IN ('done','blocked') AND acknowledged IS NULL ORDER BY rowid").all().map(row=>({...report(row),cursor:row.cursor})),
    ack(id){
      const batch=get(id);invariant(batch?.state==='done','只能取回已完成批次的回执');
      db.prepare('UPDATE batches SET acknowledged=? WHERE id=? AND acknowledged IS NULL').run(now(),id);
      return get(id);
    },
    pending:()=>db.prepare("SELECT id,title,digest,source_commit,state,created,finished,steps,error FROM batches WHERE state!='done' ORDER BY rowid").all().map(report),
    retry(id,digest){
      const batch=get(id);invariant(batch?.state==='blocked'&&digest===batch.reviewHash,'只能按原确认摘要恢复已暂停批次');
      db.prepare("UPDATE batches SET state='queued',error=NULL WHERE id=?").run(id);schedule();return get(id);
    },
    async pause(){stopped=true;clearTimeout(timer);timer=null;await working;},
    resume(){stopped=false;schedule();},
    async close(){await this.pause();db.close();},
  };
}
