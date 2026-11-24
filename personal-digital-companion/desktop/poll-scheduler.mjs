const memoryPolls=new Set(['diary','nag','review','diaryAudit','curiosity','refinement']);
const queueRetryMs=15_000;
const diaryAuditContinuationMs=15_000;
const diaryAuditWindowMs=5*60_000;
const diaryAuditWindowKey='diaryAuditWindow';
const types=[
  {id:'tasks',name:'任务轮询',minutes:15},
  {id:'due',name:'到期事项',minutes:20},
  {id:'news',name:'关注新闻简报',minutes:720},
  {id:'newsEditorial',name:'新闻编辑与社论风向',minutes:10},
  {id:'curiosity',name:'此刻所想 · 允许自主看屏',minutes:60},
  {id:'weather',name:'三地天气',minutes:60},
  {id:'aiHeartbeat',name:'AI 接口心跳',minutes:180},
  {id:'diaryAudit',name:'手记质问',minutes:60},
  {id:'nag',name:'绯月念叨',minutes:120},
  {id:'diary',name:'写日记',minutes:720},
  {id:'review',name:'补行动评价',minutes:60},
  {id:'refinement',name:'修订手记与唠叨',minutes:60},
  {id:'inspection',name:'分析专家巡检',minutes:60},
];

const goals={tasks:'检查云端待办并处理可领取任务',due:'检查今日到期和逾期事项',weather:'核对三地天气变化与预警',
  aiHeartbeat:'检查当前云端 AI 接口是否可用',
  diaryAudit:'核对近七天的手记，找出待确认的疑点',curiosity:'按设置观察当前场景并判断是否分享',nag:'核对待续事项并决定本轮主动行动',
  news:'查阅关注主题的公开报道，有新消息时提醒',newsEditorial:'推进一项新闻编辑或社媒查询阶段',diary:'整理未入册的素材并跟进未解悬念',review:'核查待整理专题并补写缺失的行动评价',
  refinement:'逐条核对绯月已保存的手记或唠叨，修订后保存',inspection:'检查最近的本机任务完成与失败记录'};

export function createPollScheduler({db,handlers,isBusy,changed,now,setTimer,clearTimer,add,audit,onIdleResult,weatherLastAt,lastRun=()=>null,beginAiRound}){
  db.exec(`CREATE TABLE IF NOT EXISTS local_polls (
    id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, minutes INTEGER NOT NULL, maximum INTEGER NOT NULL,
    misses INTEGER NOT NULL, queuedAt INTEGER);
    CREATE TABLE IF NOT EXISTS idle_poll_resume(id TEXT PRIMARY KEY, at INTEGER NOT NULL)`);
  const legacy=db.prepare('SELECT misses,due FROM checks WHERE misses IS NOT NULL ORDER BY id DESC LIMIT 1').get();
  const insert=db.prepare('INSERT OR IGNORE INTO local_polls VALUES(?,?,?,?,?,?)');
  const save=db.prepare('UPDATE local_polls SET enabled=?,minutes=?,maximum=?,misses=?,queuedAt=? WHERE id=?');
  const readTime=db.prepare('SELECT at FROM idle_poll_resume WHERE id=?');
  const saveTime=db.prepare('INSERT OR REPLACE INTO idle_poll_resume VALUES(?,?)');
  const jobs=new Map();
  for(const {id,name,minutes} of types){
    if(!handlers[id])continue;
    const misses=id==='due'?legacy?.misses??0:0;
    insert.run(id,Number(id!=='curiosity'),minutes,id==='news'?1:3,misses,misses>=3?legacy.due:null);
    const row=db.prepare('SELECT * FROM local_polls WHERE id=?').get(id);
    const resumeAt=readTime.get(id)?.at??0;
    jobs.set(id,{...row,name,enabled:Boolean(row.enabled),resumeAt,nextAt:null,timer:null,running:false,first:true});
  }
  let started=false,closed=false,retry=null,warmUntil=0;
  let auditWindowStart=readTime.get(diaryAuditWindowKey)?.at??0;
  const abort=new AbortController();
  let aiRound;
  function releaseRoundIfIdle(){
    if(aiRound&&![...jobs.values()].some(j=>memoryPolls.has(j.id)&&j.enabled&&(j.running||j.continuing||j.queuedAt!==null))){
      aiRound.release();aiRound=null;
    }
  }
  let pausedAt=null,retryAt=null,retryRemaining=queueRetryMs;
  // 暂停中也能新建截止时间，只顺延该倒计时实际经历的暂停部分。
  function frozenDeadline(due,createdAt=0,at=now()){
    return pausedAt!==null&&due>pausedAt?due+Math.max(0,at-Math.max(pausedAt,createdAt)):due;
  }
  const warmDeadline=()=>frozenDeadline(warmUntil,warmUntil-60_000);
  function clearRetryIfEmpty(){
    if(queue().length)return;
    clearTimer(retry);retry=null;retryRemaining=queueRetryMs;
  }
  function setExecutionBusy(busy){
    if(closed||busy===(pausedAt!==null))return;
    const at=now();
    if(busy){
      pausedAt=at;
      for(const j of jobs.values()){
        clearTimer(j.timer);j.timer=null;
        if(j.nextAt!==null)j.remaining=Math.max(0,j.nextAt-at);
      }
      if(retry!==null){clearTimer(retry);retry=null;retryRemaining=Math.max(0,retryAt-at);}
    }else{
      warmUntil=frozenDeadline(warmUntil,warmUntil-60_000,at);
      for(const j of jobs.values())if(j.resumeAt>pausedAt){
        j.resumeAt=frozenDeadline(j.resumeAt,j.resumeSetAt,at);
        saveTime.run(j.id,j.resumeAt);
      }
      pausedAt=null;
      for(const j of jobs.values())if(j.enabled&&j.nextAt!==null)arm(j,at+j.remaining);
      retryLater();
    }
    if(started)changed();
  }
  function persist(j){save.run(+j.enabled,j.minutes,j.maximum,j.misses,j.queuedAt,j.id);}
  const queue=()=>[...jobs.values()].filter(j=>j.queuedAt!==null&&j.enabled).sort((a,b)=>a.queuedAt-b.queuedAt);
  function arm(j,at){
    clearTimer(j.timer);j.nextAt=at;j.remaining=Math.max(0,at-now());
    if(pausedAt!==null){j.timer=null;return;}
    j.timer=setTimer(()=>tick(j,at),Math.max(0,at-now()));j.timer?.unref?.();
  }
  function armAudit(j,at,delay){
    j.resumeSetAt=at;
    j.resumeAt=at+delay;
    saveTime.run(j.id,j.resumeAt);
    arm(j,j.resumeAt);
  }
  function clearAuditWindow(){
    if(!auditWindowStart)return;
    db.prepare('DELETE FROM idle_poll_resume WHERE id=?').run(diaryAuditWindowKey);
    auditWindowStart=0;
  }
  function drain(){
    if(pausedAt!==null)return false;
    const waiting=queue();
    const at=now();
    const ready=j=>!j.running&&j.resumeAt<=at&&!isBusy(j.id)&&(j.id==='tasks'||at>=warmUntil);
    const inspection=waiting.find(j=>j.id==='inspection'&&ready(j));
    if(inspection)void execute(inspection,inspection.queuedAt);
    const work=waiting.filter(j=>j.id!=='inspection');
    if(work.some(j=>j.running))return true;
    const candidate=work.find(ready);
    if(candidate)void execute(candidate,candidate.queuedAt);
    return Boolean(candidate);
  }
  function retryLater(){
    if(closed||!started||pausedAt!==null||retry!==null||!queue().length)return;
    retryAt=now()+retryRemaining;
    retry=setTimer(()=>{
      retry=null;retryRemaining=queueRetryMs;
      drain();
      retryLater();
    },retryRemaining);
    retry?.unref?.();
  }
  function postpone(j,due,existing=null){
    if(j.queuedAt===null){
      j.misses++;
      if(['diary','nag','review','diaryAudit','refinement'].includes(j.id)||j.misses>=j.maximum)j.queuedAt=due;
      persist(j);
    }
    const queued=j.queuedAt!==null;
    const status=queued?'待执行':'未执行',detail=queued?'本地任务占用 · 已在等待队列':'本地任务占用 · 连续第 '+j.misses+' 次';
    if(existing===null){
      add(j.name,status,detail,now(),due);
      audit?.skip(j.name,goals[j.id],detail,due);
    }
    else db.prepare('UPDATE checks SET status=?,detail=? WHERE id=?').run(status,detail,existing);
    changed();retryLater();
  }
  async function execute(j,due){
    if(closed||!j.enabled||j.running)return;
    const at=now();
    if(j.resumeAt>at)return;
    if(j.id==='diaryAudit'){
      const nextWindow=auditWindowStart+j.minutes*60_000;
      if(auditWindowStart&&at>=auditWindowStart+diaryAuditWindowMs&&at<nextWindow){
        j.continuing=false;j.queuedAt=null;j.misses=0;persist(j);
        armAudit(j,at,nextWindow-at);
        clearRetryIfEmpty();releaseRoundIfIdle();changed();
        return;
      }
      if(!auditWindowStart||at>=nextWindow){
        auditWindowStart=at;
        saveTime.run(diaryAuditWindowKey,at);
      }
    }
    j.first=false;j.running=true;
    j.continuing=false;
    const id=add(j.name,'检查中',j.queuedAt!==null?'执行本地等待任务':'开始轮询',at,due);
    changed();
    let status='已检查',detail,blocked=false,idleStarted=false,continueAudit=false;
    const idle=memoryPolls.has(j.id);
    if(idle)aiRound??=beginAiRound?.();
    const goal=goals[j.id];
    const action=audit?.begin(j.name,goal,undefined,at);
    try{
      const signal=idle&&aiRound?AbortSignal.any([abort.signal,aiRound.signal]):abort.signal;
      const result=await handlers[j.id](signal,action?.step,goal);
      blocked=result?.deferred===true&&!result.roundPaused;
      continueAudit=j.id==='diaryAudit'&&result?.nextBatch===true;
      if(continueAudit)status='本批完成';
      if(result?.roundPaused)status='已暂停';
      idleStarted=result?.started===true;
      detail=result?.detail??(typeof result==='string'?result:undefined);
      if(!closed&&j.enabled&&!signal.aborted&&!blocked&&!continueAudit&&['nag','diary','diaryAudit','news'].includes(j.id)){
        const anchor=lastRun(j.id);
        const next=result?.nextAt??(anchor&&anchor+j.minutes*60000);
        if(next>now())arm(j,next);
      }
    }catch(error){status=error.code==='NO_CONNECTION'?'未执行':'查询失败';detail=error.message;}
    if(closed)return;
    const finishedAt=now();
    if(idle&&(aiRound?.paused||status==='已暂停')){
      status='已暂停';blocked=false;continueAudit=false;
      detail??='本轮 4B 执行预算已到，待下一轮继续';
      if(j.enabled){
        const delay=j.minutes*60_000;
        if(j.id==='diaryAudit')armAudit(j,finishedAt,delay);
        else arm(j,finishedAt+delay);
      }
      for(const pending of jobs.values()){
        if(!pending.enabled||!memoryPolls.has(pending.id)||pending.running||(!pending.continuing&&pending.queuedAt===null))continue;
        const wasContinuing=pending.continuing;
        pending.continuing=false;
        pending.queuedAt=null;pending.misses=0;persist(pending);
        if(wasContinuing)armAudit(pending,finishedAt,pending.minutes*60_000);
        else if(pending.nextAt===null||(pausedAt===null?pending.nextAt<=finishedAt:pending.remaining===0))
          arm(pending,finishedAt+pending.minutes*60_000);
      }
    }
    if(blocked)detail??=idleStarted?'等待下次轮询':'执行前被本地任务占用';
    if(typeof detail!=='string'||!detail.trim())detail='本轮未提供结果回执';
    const windowEnded=continueAudit&&finishedAt+diaryAuditContinuationMs>=auditWindowStart+diaryAuditWindowMs;
    if(continueAudit&&j.enabled)detail+=windowEnded?'，下个轮询周期继续':'，下批从原进度继续';
    const outcome=blocked?(idleStarted?'已暂停':'推延'):status;
    action?.finish(outcome,detail,finishedAt);
    j.running=false;
    if(idle&&!continueAudit&&(!blocked||idleStarted)){
      onIdleResult?.({id:j.id,status:outcome,detail,durationMs:Math.max(0,finishedAt-at)});
    }
    if(blocked&&j.enabled){
      postpone(j,due,id);
      releaseRoundIfIdle();
      return;
    }
    if(continueAudit&&j.enabled){
      j.continuing=!windowEnded;
      const delay=windowEnded?Math.max(diaryAuditContinuationMs,auditWindowStart+j.minutes*60_000-finishedAt):diaryAuditContinuationMs;
      armAudit(j,finishedAt,delay);
    }else if(j.id==='diaryAudit')clearAuditWindow();
    db.prepare('UPDATE checks SET status=?,detail=? WHERE id=?').run(blocked?'未执行':status,detail,id);
    j.queuedAt=null;j.misses=0;persist(j);
    clearRetryIfEmpty();
    releaseRoundIfIdle();changed();retryLater();
  }
  function tick(j,due){
    if(closed||pausedAt!==null||!j.enabled)return;
    j.first=false;
    const interval=j.minutes*60_000;
    arm(j,due+(1+Math.max(0,Math.floor((now()-due)/interval)))*interval);
    if(j.running){add(j.name,'未执行','上轮仍在执行',now(),due);audit?.skip(j.name,goals[j.id],'上轮仍在执行',due);changed();return;}
    // 心跳仍静默按固定周期检查，退出或重启时跳过，不补跑。
    if(j.id==='aiHeartbeat'){
      if(!isBusy(j.id))void execute(j,due);
      else changed();
      return;
    }
    if(isBusy(j.id)){postpone(j,due);return;}
    if(j.id==='inspection'){void execute(j,j.queuedAt??due);return;}
    if(j.queuedAt!==null){retryLater();changed();return;}
    if(drain()){postpone(j,due);return;}
    void execute(j,due);
  }
  function initial(j){
    if(j.id==='aiHeartbeat')return now()+j.minutes*60_000;
    // 避免手记核对从同一分钟耗尽共享预算，导致修订每轮都排不到。
    if(j.id==='refinement')return Math.max(now(),warmDeadline())+11*60_000;
    const last=j.id==='weather'?weatherLastAt():lastRun(j.id);
    const earliest=j.id==='tasks'?now():Math.max(now(),warmDeadline());
    return last?Math.max(earliest,Math.min(now(),last)+j.minutes*60_000):earliest;
  }
  function snapshot(){
    return [...jobs.values()].map(({id,name,enabled,minutes,maximum,misses,queuedAt,running,nextAt,first,remaining})=>
      ({id,name,enabled,minutes,maximum,misses,queuedAt,running,nextAt:pausedAt!==null&&nextAt!==null?now()+remaining:nextAt,first,paused:pausedAt!==null}));
  }
  function configure(id,input){
    const j=jobs.get(id);
    const maximum=id==='aiHeartbeat'?j?.maximum:input?.maximum;
    if(!j||!input||typeof input.enabled!=='boolean'||!Number.isInteger(input.minutes)||input.minutes<10||input.minutes>(['diary','news'].includes(id)?720:300)||
        !Number.isInteger(maximum)||maximum<0||maximum>100)throw Error('间隔须为 10–300 分钟，最大推延须为 0–100 次，均为整数。');
    const enabledBefore=j.enabled,minutesBefore=j.minutes;
    Object.assign(j,{enabled:input.enabled,minutes:input.minutes,maximum});
    if(!j.enabled){clearTimer(j.timer);j.timer=null;j.nextAt=null;j.queuedAt=null;j.misses=0;j.continuing=false;}
    else if(j.misses>0&&j.misses>=j.maximum&&j.queuedAt===null)j.queuedAt=now();
    persist(j);
    if(started&&j.enabled&&(!enabledBefore||minutesBefore!==j.minutes)){
      const at=now()+j.minutes*60_000;
      arm(j,Math.max(frozenDeadline(j.resumeAt,j.resumeSetAt),enabledBefore&&j.first?Math.min(initial(j),at):at));
    }
    clearRetryIfEmpty();
    releaseRoundIfIdle();retryLater();changed();return snapshot();
  }
  function enqueue(id){
    const j=jobs.get(id);if(closed||id==='aiHeartbeat'||!j?.enabled||frozenDeadline(j.resumeAt,j.resumeSetAt)>now())return;
    const added=j.queuedAt===null;
    j.queuedAt??=now();persist(j);retryLater();
    if(added&&started)changed();
  }
  return {snapshot,configure,enqueue,setExecutionBusy,get paused(){return pausedAt!==null;},get pending(){return queue().length>0;},get(id){return jobs.get(id);},
    readQueue:()=>queue().map(({name,queuedAt,running})=>({name,queuedAt,running})),
    start(){if(started||closed)return;started=true;warmUntil=now()+60_000;
      for(const j of jobs.values())if(j.enabled)arm(j,Math.max(frozenDeadline(j.resumeAt,j.resumeSetAt),initial(j)));
      retryLater();
    },
    close(){closed=true;for(const j of jobs.values())clearTimer(j.timer);clearTimer(retry);abort.abort();aiRound?.release();aiRound=null;}};
}
