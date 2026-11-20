const types=[
  {id:'tasks',name:'任务轮询',minutes:15},
  {id:'due',name:'到期事项',minutes:20},
  {id:'weather',name:'三地天气',minutes:60},
];

export function createPollScheduler({db,handlers,isBusy,changed,now,setTimer,clearTimer,add,weatherLastAt}){
  db.exec(`CREATE TABLE IF NOT EXISTS local_polls (
    id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, minutes INTEGER NOT NULL, maximum INTEGER NOT NULL,
    misses INTEGER NOT NULL, queuedAt INTEGER)`);
  const legacy=db.prepare('SELECT misses,due FROM checks WHERE misses IS NOT NULL ORDER BY id DESC LIMIT 1').get();
  const insert=db.prepare('INSERT OR IGNORE INTO local_polls VALUES(?,1,?,3,?,?)');
  const save=db.prepare('UPDATE local_polls SET enabled=?,minutes=?,maximum=?,misses=?,queuedAt=? WHERE id=?');
  const jobs=new Map();
  for(const {id,name,minutes} of types){
    if(!handlers[id])continue;
    const misses=id==='due'?legacy?.misses??0:0;
    insert.run(id,minutes,misses,misses>=3?legacy.due:null);
    const row=db.prepare('SELECT * FROM local_polls WHERE id=?').get(id);
    jobs.set(id,{...row,name,enabled:Boolean(row.enabled),nextAt:null,timer:null,running:false,first:true});
  }
  let started=false,closed=false,retry=null,warmUntil=0;
  const abort=new AbortController();
  function persist(j){save.run(+j.enabled,j.minutes,j.maximum,j.misses,j.queuedAt,j.id);}
  const queue=()=>[...jobs.values()].filter(j=>j.queuedAt!==null&&j.enabled).sort((a,b)=>a.queuedAt-b.queuedAt);
  function arm(j,at){
    clearTimer(j.timer);j.nextAt=at;
    j.timer=setTimer(()=>tick(j,at),Math.max(0,at-now()));j.timer?.unref?.();
  }
  function drain(){
    const waiting=queue();
    if(waiting.some(j=>j.running))return true;
    const candidate=waiting.find(j=>!isBusy(j.id)&&(j.id==='tasks'||now()>=warmUntil));
    if(candidate)void execute(candidate,candidate.queuedAt);
    return Boolean(candidate);
  }
  function retryLater(){
    if(closed||!started||retry!==null||!queue().length)return;
    retry=setTimer(()=>{
      retry=null;
      drain();
      retryLater();
    },15_000);
    retry?.unref?.();
  }
  function postpone(j,due,existing=null){
    if(j.queuedAt===null){
      j.misses++;
      if(j.misses>=j.maximum)j.queuedAt=due;
      persist(j);
    }
    const queued=j.queuedAt!==null;
    const status=queued?'待执行':'未执行',detail=queued?'本地任务占用 · 已在等待队列':'本地任务占用 · 连续第 '+j.misses+' 次';
    if(existing===null)add(j.name,status,detail,now(),due);
    else db.prepare('UPDATE checks SET status=?,detail=? WHERE id=?').run(status,detail,existing);
    changed();retryLater();
  }
  async function execute(j,due){
    if(closed||!j.enabled||j.running)return;
    j.first=false;j.running=true;
    const at=now(),id=add(j.name,'检查中',j.queuedAt!==null?'执行本地等待任务':'开始轮询',at,due);
    changed();
    let status='已检查',detail,blocked=false;
    try{
      const result=await handlers[j.id](abort.signal);
      blocked=result?.deferred===true;
      detail=blocked?'执行前被本地任务占用':result;
    }catch(error){status=error.code==='NO_CONNECTION'?'未执行':'查询失败';detail=error.message;}
    if(closed)return;
    j.running=false;
    if(blocked&&j.enabled){postpone(j,due,id);return;}
    db.prepare('UPDATE checks SET status=?,detail=? WHERE id=?').run(blocked?'未执行':status,detail??'本轮完成',id);
    j.queuedAt=null;j.misses=0;persist(j);
    if(!queue().length){clearTimer(retry);retry=null;}
    changed();retryLater();
  }
  function tick(j,due){
    if(closed||!j.enabled)return;
    j.first=false;
    const interval=j.minutes*60_000;
    arm(j,due+(1+Math.max(0,Math.floor((now()-due)/interval)))*interval);
    if(j.running){add(j.name,'未执行','上轮仍在执行',now(),due);changed();return;}
    if(isBusy(j.id)){postpone(j,due);return;}
    if(j.queuedAt!==null){retryLater();changed();return;}
    if(drain()){postpone(j,due);return;}
    void execute(j,due);
  }
  function initial(j){
    const last=j.id==='weather'?weatherLastAt():null;
    const earliest=j.id==='tasks'?now():Math.max(now(),warmUntil);
    return last?Math.max(earliest,Math.min(now(),last)+j.minutes*60_000):earliest;
  }
  function snapshot(){
    return [...jobs.values()].map(({id,name,enabled,minutes,maximum,misses,queuedAt,running,nextAt,first})=>
      ({id,name,enabled,minutes,maximum,misses,queuedAt,running,nextAt,first}));
  }
  function configure(id,input){
    const j=jobs.get(id);
    if(!j||!input||typeof input.enabled!=='boolean'||!Number.isInteger(input.minutes)||input.minutes<10||input.minutes>300||
        !Number.isInteger(input.maximum)||input.maximum<0||input.maximum>100)throw Error('间隔须为 10–300 分钟，最大推延须为 0–100 次，均为整数。');
    const enabledBefore=j.enabled,minutesBefore=j.minutes;
    Object.assign(j,{enabled:input.enabled,minutes:input.minutes,maximum:input.maximum});
    if(!j.enabled){clearTimer(j.timer);j.timer=null;j.nextAt=null;j.queuedAt=null;j.misses=0;}
    else if(j.misses>0&&j.misses>=j.maximum&&j.queuedAt===null)j.queuedAt=now();
    persist(j);
    if(started&&j.enabled&&(!enabledBefore||minutesBefore!==j.minutes)){
      const at=now()+j.minutes*60_000;
      arm(j,enabledBefore&&j.first?Math.min(initial(j),at):at);
    }
    if(!queue().length){clearTimer(retry);retry=null;}
    retryLater();changed();return snapshot();
  }
  return {snapshot,configure,get pending(){return queue().length>0;},get(id){return jobs.get(id);},
    start(){if(started||closed)return;started=true;warmUntil=now()+60_000;
      for(const j of jobs.values())if(j.enabled)arm(j,initial(j));
      retryLater();
    },
    close(){closed=true;for(const j of jobs.values())clearTimer(j.timer);clearTimer(retry);abort.abort();}};
}
