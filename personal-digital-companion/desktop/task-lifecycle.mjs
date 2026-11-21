import {pcRegistrations,PC_IMAGE_GENERATE} from '../agent/tasks/pc-types.mjs';
import {join} from 'node:path';
import {getDeviceIdentity} from '../agent/devices/identity.mjs';
import {createTaskExecutor} from '../agent/execution/runner.mjs';
import {createTaskSync} from '../agent/execution/sync.mjs';
import {createThreadHandlers} from '../agent/execution/thread-handlers.mjs';
import {encodeJson} from '../agent/execution/json.mjs';
import {DEADLINE_GRACE_MS} from '../agent/tasks/deadline.mjs';
import {createTaskPoller} from './task-poller.mjs';
import {createChainClient} from './chain-client.mjs';
import {createChainDialogs} from './chain-dialogs.mjs';
import {createRegistrationFlow} from './registration-flow.mjs';
import {createReminderReviewFlow} from './reminder-review-flow.mjs';
import {createTaskTrafficLog} from './task-traffic-log.mjs';
import {loadCloudConnection} from './cloud-connection.mjs';
import {restartWork} from './restart-work.mjs';
import {tokyoDay} from './conversation-history.mjs';
import {setTimeout as delay} from 'node:timers/promises';

const terminal=task=>['COMPLETED','FAILED'].includes(task.status);
export function interruptionDetail(task) {
  const last=task.executions.at(-1), date=last?.finished_at||last?.started_at||task.updated_at;
  const time=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'medium'}).format(new Date(date));
  return `任务：${task.metadata?.name||task.type} (${task.task_id})\n参数：${JSON.stringify(task.params)}\n最后记录：${last?`第${last.attempt_no}次 ${last.status}`:task.status}，${time} JST\n结果未知，可能已产生部分操作。重做可能重复原操作。`;
}
export async function createDesktopTasks({profile,dialog,request,handlerModule,pollerOptions={},memory,generateImage,openImage,desktopBusy=()=>false,onAutomaticProgress=()=>{},
  hasRoom=()=>true,beforeExecute=async()=>{}}={}) {
  // 正式工作队列（docs/FORMAL_WORK_QUEUE.md）：hasRoom 为本地待处理是否还有名额；beforeExecute 在每个任务开始执行前等待正在执行的登记批次并让闲时工作暂停。
  const identity=await getDeviceIdentity(profile);
  let configurationError=null, connection;
  if(request===undefined)try {connection=await loadCloudConnection(profile); request=connection?.request;} catch(error){configurationError=error.message;request=null;}
  const controller=new AbortController();
  const traffic=createTaskTrafficLog(profile,{memory});
  let heartbeatCall;
  let outstanding=0,draining=false,resuming=null;
  const continuation=restartWork(profile);
  const defer=(kind,id,data)=>{if(!draining)return false;continuation.add(kind,id,data);return true;};
  if(request) {
    const rawRequest=request;
    request=(path,options)=>new Promise((resolve,reject)=>{
      const local=new AbortController();let timeout;
      const finish=(error,response)=>{clearTimeout(timeout);controller.signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(response);};
      const abort=()=>{local.abort();finish(Object.assign(new Error('应用正在退出，记录保留'),{code:'CANCELLED'}));};
      if(controller.signal.aborted){abort();return;}
      const wait=['/api/assistant/recording-plan','/api/assistant/heartbeat','/api/assistant/provider-test'].includes(path)?240000:path==='/api/records/photos'?60000:path.endsWith('/execute')||path.startsWith('/api/weather/')?15000:5000;
      timeout=setTimeout(()=>{local.abort();finish(Object.assign(new Error('连接超时，记录仍保留'),{code:'TIMEOUT'}));},wait);
      controller.signal.addEventListener('abort',abort,{once:true});
      Promise.resolve().then(()=>{
        if(local.signal.aborted)throw new Error('请求已取消');
        const signal=options?.signal?AbortSignal.any([local.signal,options.signal]):local.signal;
        return rawRequest(path,{...options,signal});
      }).then(async response=>{
        // 超时覆盖完整响应体，避免只收到HTTP头后卡住退出/启动恢复。
        const body=await response.arrayBuffer();
        return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,statusText:response.statusText,headers:response.headers});
      }).then(response=>finish(null,response),()=>finish(new Error('任务云端连接失败，记录保留')));
    });
    const logged=traffic.wrap(request);
    // 心跳没有业务回执，退出时由同一个 controller 取消，不占重启等待计数。
    heartbeatCall=()=>logged('/api/assistant/heartbeat',{method:'POST',cache:'no-store'});
    request=async(...args)=>{outstanding++;try{return await logged(...args);}finally{outstanding--;}};
  }
  const threads=await createThreadHandlers(handlerModule?{module:handlerModule}:{});
  if(generateImage)threads.handlers[PC_IMAGE_GENERATE]={
    risk:'L2',
    validate(params){
      if(Object.keys(params).length!==1||typeof params.prompt!=='string'||!params.prompt.trim()||params.prompt.length>2000)throw Error('生图描述需为 1 至 2000 字。');
    },
    execute:({prompt},taskId)=>generateImage(prompt,taskId)
  };
  if(request&&!handlerModule)for(const type of Object.keys(pcRegistrations))threads.handlers[type]={
    risk:'L2',
    validate(params){
      if(type==='pc.exercise.create'&&(Object.keys(params).length!==1||typeof params.body!=='string'||!params.body.trim()||params.body.length>4000))throw Error('运动正文无效');
    },
    async execute(_params,id){
      const claim=executor.claimRequestId(id);
      try{
        const response=await request('/api/tasks/'+encodeURIComponent(id)+(type==='pc.exercise.create'?'/pc-exercise':'/pc-registration'),{method:'POST',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({device_id:identity.device_id,request_id:claim})});
        if(response.status===422)throw Object.assign(Error('业务端拒绝本次登记'),{code:'BUSINESS_REJECTED'});
        if(!response.ok)throw Error('未获得登记回执');
        const result=await response.json();
        if(!result.record_id||(type==='pc.exercise.create'&&!Number.isSafeInteger(result.created_at)))throw Error('业务回执无效');
        return result;
      }catch(e){if(e.code==='BUSINESS_REJECTED')throw e;throw Object.assign(Error('业务登记等待核对'),{code:'INTERRUPTED'});}
    }
  };
  let checking=false,stopped=false,gate=null,release=null,showing=null;
  const inFlight=new Set();
  const operations=new Set();
  let executionTail=Promise.resolve(),executing=0;
  function trackOperation(work){
    const pending=work();operations.add(pending);
    return pending.finally(()=>operations.delete(pending));
  }
  const canStart=()=>!checking&&!stopped&&!draining;
  let heartbeatTimer,heartbeatRequest;
  function startHeartbeat(){
    if(!heartbeatCall||heartbeatTimer)return;
    heartbeatTimer=setInterval(()=>{
      if(!canStart()||heartbeatRequest)return;
      heartbeatRequest=heartbeatCall()
        .catch(()=>{}).finally(()=>{heartbeatRequest=null;});
    },30*60*1000);
    heartbeatTimer.unref();
  }
  let archiveWrites=Promise.resolve();
  let latestArchive;
  function archiveDay(at){
    const day=tokyoDay(new Date(at));
    latestArchive=archiveWrites.then(()=>memory.saveTasks(day,executor.review.read(day)));
    archiveWrites=latestArchive.catch(()=>traffic.write({direction:'local',route:'记忆归档',error:'TASK_ARCHIVE_FAILED'}));
    return latestArchive;
  }
  const executor=createTaskExecutor({databasePath:join(profile,'tasks.sqlite'),deviceId:identity.device_id,handlers:threads.handlers,
    onReviewChanged:memory?archiveDay:undefined,
    canExecute:()=>!stopped,waitForExecution:async()=>{if(gate)await gate;}});
  const record=executor.review.record;
  async function recordLocalBatch(event){
    const previous=latestArchive;
    record(event);
    // 复盘已落盘但日记归档前进程退出时，补写同一天的快照。
    if(memory)await (latestArchive===previous?archiveDay(event.at):latestArchive);
  }
  const registration=createRegistrationFlow({profile,request,canEnter:canStart,canStart:()=>!checking&&!stopped,
    pauseChain:id=>defer('registration',id),log:traffic.write,record});
  const reminderReview=createReminderReviewFlow({request,canStart,waitForStart:()=>gate,
    pauseItem:item=>defer('reminder',item.id,item),record});
  const sync=request?createTaskSync({request,executor,deviceId:identity.device_id,pauseBeforeExecute:()=>draining}):null;
  let availableTasks=[],automaticTask=null;
  function tasksIdle({allowPendingRequests=false}={}){
    if(!canStart()||activeCount()||operations.size||resuming)return false;
    if(outstanding&&!allowPendingRequests)return false;
    if(continuation.entries().length||chainClient.pending().length||executor.hasUnsettledWork())return false;
    return !registration.hasSaved()&&!reminderReview.hasUnknown();
  }
  // 有空位就接：不再等绯月空闲；结果未知的旧记录仍会阻止接新任务，服务器每台两个名额不变。
  const canPoll=()=>canStart()&&!desktopBusy()&&!resuming&&!continuation.entries().length&&!chainClient.pending().length
    &&!executor.hasUnsettledWork()&&!reminderReview.hasUnknown()&&inFlight.size<2&&hasRoom();
  // 自动接取：领取确认后即返回（claimed），执行在本机串行队列里继续，轮询接着看下一项。
  const claimWaiters=new Map();
  const poller=sync?createTaskPoller({...pollerOptions,request,identity,
    canStart:canPoll,
    onTasks:async tasks=>{
      availableTasks=tasks;
      for(const task of tasks){
        if(!canPoll())break;
        if(!Object.hasOwn(threads.handlers,task.type)||executor.isRecoveryReplacement(task.task_id))continue;
        const title=task.name||task.metadata?.name||(task.type===PC_IMAGE_GENERATE?'生成图片':Object.hasOwn(pcRegistrations,task.type)?'执行登记':task.type);
        automaticTask={id:task.task_id,title};
        onAutomaticProgress({title,stage:'正在领取'});
        const claimed=new Promise(resolve=>claimWaiters.set(task.task_id,resolve));
        const run=runTask(task.task_id,true).then(()=>'ended',error=>{
          if(error.status===404||error.status===409)return 'skip';
          void traffic.write({direction:'local',route:'自动接取',task_id:task.task_id,error:error.message});
          return 'stop';
        });
        let outcome;
        try{outcome=await Promise.race([claimed.then(()=>'claimed'),run]);}
        finally{claimWaiters.delete(task.task_id);automaticTask=null;if(outcome!=='claimed')onAutomaticProgress(null);}
        if(outcome==='stop'||outcome==='ended')break;
      }
    },
  }):null;
  const tell=(message,detail='')=>stopped?Promise.resolve():dialog.showMessageBox({type:'info',title:'任务记录',message,detail,buttons:['确定']});
  async function reportCompletion(task,title,uploaded){
    if(stopped)return;
    const image=task.type===PC_IMAGE_GENERATE&&task.result?.archived?task.result:null;
    const detail=[uploaded?'云端已确认收到结果。':'本机结果已保存，云端回执待确认。'];
    if(image)detail.push('成图已归档 · '+image.width+' × '+image.height+' PNG');
    detail.push('任务编号：'+task.task_id);
    const canOpen=Boolean(image&&openImage);
    const choice=await dialog.showMessageBox({type:'info',title:'绯月 · 自动任务汇报',
      message:'我完成了「'+title+'」。',detail:detail.join('\n'),buttons:canOpen?['查看成图','知道了']:['知道了'],cancelId:canOpen?1:0});
    if(canOpen&&choice.response===0&&!stopped){
      try{await openImage(image.job_id);}catch(error){await tell('成图未能打开',error.message);}
    }
  }
  const chainClient=createChainClient({profile,request,deviceId:identity.device_id,executor,record,
    canStart,canFinishReceipt:()=>!checking&&!stopped,pauseClaim:id=>defer('claim',id),canAcquire:()=>inFlight.size<2,
    waitForStart:async()=>{if(gate)await gate;},
    executeClaimed:async receipt=>{
      if(checking||stopped||inFlight.size>=2)throw new Error('本机暂不能开始新任务，领取记录已保存');
      const auto=automaticTask?.id===receipt.task.task_id?automaticTask:null,automatic=Boolean(auto);
      claimWaiters.get(receipt.task.task_id)?.();
      // 逐个执行：等前一个本机任务结束，再等正在执行的登记批次，然后开始。
      const previous=executionTail;let release;
      executionTail=new Promise(resolve=>{release=resolve;});
      const pending=(async()=>{
        try{
          await previous;await beforeExecute();
          if(automatic)onAutomaticProgress({title:auto.title,stage:receipt.task.type===PC_IMAGE_GENERATE?'等待生图结果':'正在本机执行'});
          executing++;
          try{return await sync.executeClaimed(receipt);}finally{executing--;}
        }finally{release();}
      })();
      inFlight.add(pending);
      let result;
      let completed,uploaded=false;
      try{
        result=await pending;
        if(result.paused)return result;
        executor.markUploaded(receipt.task.task_id);
        if(!result.archived&&result.acknowledged&&result.task.status==='COMPLETED'){completed=result.task;uploaded=true;}
      }catch(error){
        const local=executor.getTask(receipt.task.task_id);
        if(local?.status==='COMPLETED')completed=local;
        throw error;
      }finally{
        inFlight.delete(pending);
        if(automatic)onAutomaticProgress(null);
        if(automatic&&completed){
          const title=completed.definition?.name||auto.title;
          void reportCompletion(completed,title,uploaded).catch(()=>traffic.write({direction:'local',route:'自动任务完成汇报',error:'未能显示回执'}));
        }
      }
      void reportFailure(result).catch(()=>{});return result;
    }});
  const chainDialogs=createChainDialogs({dialog,client:chainClient,runTask,
    canShow:canStart,supports:task=>Object.hasOwn(threads.handlers,task.type)});
  const taskInbox={
    local:()=>executor.runningTasks(),
    async tasks(offset){
      if(!request)throw Error('未配置云端连接');
      offset??=0;
      if(!Number.isSafeInteger(offset)||offset<0)throw Error('任务分页无效');
      const path=`/api/devices/${identity.device_id}/tasks?offset=${offset}`;
      const options={method:'GET',cache:'no-store'};
      let response=await request(path+'&scope=standalone',options),standalone=true;
      if(response.status===400&&(await response.json().catch(()=>null))?.error?.code==='INVALID_OFFSET'){
        standalone=false;
        response=await request(path,options);
      }
      if(response.status===404)throw Error('本机还没有云端任务清单，请在首次获取任务后刷新。');
      if(!response.ok)throw Error(`云端任务读取失败（HTTP ${response.status}）`);
      const page=await response.json();
      if(!Array.isArray(page?.tasks))throw Error('云端任务清单格式无效');
      const tasks=page.tasks.filter(task=>['PENDING','RUNNING'].includes(task.status));
      return {standalone,tasks:tasks.map(task=>({...task,can_claim:task.can_claim&&Object.hasOwn(threads.handlers,task.type)
        &&!executor.isRecoveryReplacement(task.task_id)})),next_offset:tasks.length===page.tasks.length?page.next_offset:null};
    },
    async chains(after){
      const page=await chainClient.list(after);
      if(!Array.isArray(page?.chains))throw Error('云端任务链清单格式无效');
      return {...page,chains:page.chains.filter(chain=>chain.status==='ACTIVE')};
    },
    async detail(id){
      const chain=await chainClient.get(id);
      return {name:chain.name,status:chain.status,nodes:chain.nodes.map(node=>{
        const task=node.current_task;
        return {node_id:node.node_id,depends_on:node.depends_on,task_id:task.task_id,
          name:task.definition?.name||task.type,status:node.skipped?'SKIPPED':task.status,params:task.params,
          progress:task.error||task.activity?.progress_message,
          can_claim:node.eligibility?.claim&&Object.hasOwn(threads.handlers,task.type)
            &&!executor.isRecoveryReplacement(task.task_id)};
      })};
    },
    receipts:()=>chainClient.pending(),
    claim:runTask,
    inspect:chainDialogs.inspect,
    resume:chainClient.resume,
  };
  async function reportFailure(result){
    if(stopped||checking||result.archived||result.task?.status!=='FAILED')return;
    await tell('任务最终失败，本轮已结束',`${result.task.definition?.name||result.task.type}\n已执行两次。${result.task.error||''}`);
    if(!stopped&&!checking&&result.task.chain?.current)await chainDialogs.inspect(result.task.chain.chain_id);
  }
  function runTask(id,automatic=false){return trackOperation(()=>runTaskOperation(id,automatic));}
  async function runTaskOperation(id,automatic) {
    if(!canStart())throw new Error('正在重启或退出，暂缓启动任务');
    if(!sync)throw new Error('未配置云端连接，任务未执行');
    const prior=executor.getTask(id);
    if(prior?.status==='RUNNING')throw new Error('本地执行结果未知，请先处理其中断记录');
    if(!prior||!terminal(prior))if(inFlight.size>=2)throw new Error('本机已有两个任务，结束后才能接取');
    if(!prior||!terminal(prior)){
      const response=await request(`/api/tasks/${encodeURIComponent(id)}`,{method:'GET',cache:'no-store'});
      if(!response.ok)throw Object.assign(new Error('任务读取失败'),{status:response.status});
      const task=await response.json();
      if(defer('task',id))return {paused:true};
      if(checking||stopped)throw new Error('正在退出，未领取任务');
      if(automatic&&!canPoll())return {paused:true};
      if(task.status!=='PENDING')throw Object.assign(Error('该任务已被领取或结束'),{status:409});
      if(task.target_device_id==='all')executor.validateTask({...task,target_device_id:identity.device_id});
      else executor.prepare(task);
      return chainClient.claim(task);
    }
    const pending=(async()=>{const result=await sync.syncTask(id);executor.markUploaded(id);chainClient.forgetTask(id);return result;})();
    inFlight.add(pending);
    let result;try{result=await pending;}finally{inFlight.delete(pending);}
    void reportFailure(result).catch(()=>{});return result;
  }
  function syncDecision(id){return trackOperation(()=>syncDecisionOperation(id));}
  async function syncDecisionOperation(id) {
    if(!canStart())throw new Error('正在退出检查，决定仍待同步');
    if(!request)throw new Error('未配置云端连接，决定已保存为待同步');
    const saved=executor.getRecovery(id);
    if(!saved)throw new Error('没有待同步决定');
    const response=await request(`/api/tasks/${encodeURIComponent(id)}/recover`,{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json',Accept:'application/json'},body:encodeJson(saved.payload)});
    if(stopped)throw new Error('应用正在退出，决定仍待同步');
    let body;try{body=await response.json();}catch{throw new Error('未收到有效回执，决定仍待同步');}
    if(stopped)throw new Error('应用正在退出，决定仍待同步');
    if(!response.ok) {
      // 明确拒绝意味着服务器未提交；保留原任务，允许用户改为放弃或稍后。
      const code=body?.error?.code;
      if(['TASK_DEADLINE_PASSED','TYPE_PAUSED','OLD_ROUND','DEPENDENCY_PENDING','CAPACITY_FULL','CHAIN_STOPPED'].includes(code))executor.discardRejectedRecovery(id);
      const messages={TASK_DEADLINE_PASSED:'截止已满7天，原任务未改变；需另行新建任务',OLD_ROUND:'旧轮已被替代，可放弃旧轮记录；如需重做请到当前任务链选择',
        DEPENDENCY_PENDING:'前置尚未满足，未重做；可以稍后处理或放弃',CAPACITY_FULL:'当前两个名额已满，未重做',CHAIN_STOPPED:'任务组已停止新领取，未重做'};
      throw new Error(messages[code]||'恢复请求未确认，请核对后重试');
    }
    const r=body.recovery,p=saved.payload,t=body.task;
    if(body.acknowledged!==true || !r || r.task_id!==id || r.decision!==p.decision || r.replacement_task_id!==p.replacement_task_id
      || encodeJson(r.snapshot)!==encodeJson(p.snapshot) || !t || t.task_id!==id || t.status!=='CANCELLED'
      || t.type!==p.snapshot.type || t.target_device_id!==identity.device_id || encodeJson(t.params)!==encodeJson(p.snapshot.params))throw new Error('恢复回执不一致，决定仍待同步');
    if(p.decision==='redo') {
      const replacement=body.replacement;
      if(!replacement || replacement.task_id!==p.replacement_task_id || replacement.type!==t.type
        || replacement.target_device_id!==identity.device_id || encodeJson(replacement.params)!==encodeJson(t.params)
        || replacement.deadline_at!==t.deadline_at)throw new Error('新任务回执不一致，决定仍待同步');
    } else if(body.replacement!==null)throw new Error('恢复回执不一致，决定仍待同步');
    if(stopped)throw new Error('应用正在退出，决定仍待同步');
    executor.acknowledgeRecovery(id);
    chainClient.forgetTask(id);
    return body;
  }
  async function decide(id,decision) {
    if(!canStart())throw new Error('正在退出检查，未保存新决定');
    const task=executor.listTasks().find(t=>t.task_id===id);
    if(!task)throw new Error('本地任务不存在');
    if(decision==='redo' && !task.recovery && task.metadata?.deadline_at
      && Date.now()>=Date.parse(task.metadata.deadline_at)+DEADLINE_GRACE_MS)throw new Error('截止已满7天，请另行新建任务；原任务未改变');
    executor.decideRecovery(id,decision);
    return await syncDecision(id);
  }
  async function showPending() {
    if(stopped||checking)return;
    if(showing)return showing;
    showing=(async()=>{
      for(const task of executor.listTasks()) {
        if(stopped||checking)break;
        if(task.recovery?.acknowledged) {
          if(task.recovery.payload.decision==='redo') {
            const id=task.recovery.payload.replacement_task_id,local=executor.getTask(id);
            if(!local || local.status==='PENDING') {
              const choice=await dialog.showMessageBox({type:'info',title:'重做任务待执行',message:'重做任务已创建',
                detail:`${task.metadata?.name||task.type}\n新任务：${id}\n${JSON.stringify(task.params)}`,
                buttons:['稍后','继续执行'],defaultId:0,cancelId:0});
              if(stopped||checking)return;
              if(choice.response===1)try {await runTask(id);}catch(error){await tell(error.message);}
            }
          }
          continue;
        }
        if(task.active||terminal(task)||task.status!=='RUNNING')continue;
        if(task.recovery) {
          const choice=await dialog.showMessageBox({type:'warning',title:'中断决定待同步',message:'已保存的决定尚未确认',
            detail:interruptionDetail(task),buttons:['稍后','重试同步'],defaultId:0,cancelId:0});
          if(stopped||checking)return;
          if(choice.response===1)try {const result=await syncDecision(task.task_id);await tell('决定已同步',result.replacement?'重做任务已保留，可再次打开“中断任务与补传”继续执行。':'');}catch(error){await tell(error.message);}
          continue;
        }
        const choice=await dialog.showMessageBox({type:'warning',title:'中断任务',message:'任务结果未知，请选择处理方式',
          detail:`${interruptionDetail(task)}\n若这是当前链节点，放弃会视为跳过并允许后续继续；已被接管的旧轮只确认历史。`,buttons:['稍后','放弃','重做'],defaultId:0,cancelId:0});
        if(stopped||checking)return;
        if(![1,2].includes(choice.response))continue;
        if(choice.response===2) {
          const confirm=await dialog.showMessageBox({type:'warning',title:'确认重做',message:'原操作可能已生效，重做可能重复操作',buttons:['取消','确认重做'],defaultId:0,cancelId:0});
          if(stopped||checking)return;
          if(confirm.response!==1)continue;
        }
        try {
          const result=await decide(task.task_id,choice.response===1?'abandon':'redo');
          if(result.replacement) {
            if(Object.hasOwn(threads.handlers,result.replacement.type))await runTask(result.replacement.task_id);
            else await tell('新任务已创建并保留待执行','当前未配置此类型处理函数。');
          }
        } catch(error){await tell(error.message);}
      }
    })();
    try{return await showing;}finally{showing=null;}
  }
  async function startup(remindersReady = true) {
    if(stopped||checking)return;
    const pauseErrors=await resumePaused();
    if(stopped||checking)return;
    let pendingResults=0;
    for(const task of executor.listTasks()) {
      if(stopped)break;
      try {
        if(terminal(task)&&!task.metadata?.uploaded) {if(sync)await runTask(task.task_id);else pendingResults++;}
        else if(request&&task.recovery&&!task.recovery.acknowledged)await syncDecision(task.task_id);
      } catch {if(terminal(task))pendingResults++;}
    }
    if(!(await remindersReady)||stopped||checking)return;
    for(const detail of pauseErrors)await tell('暂停的任务仍待核对',detail);
    if(configurationError)await tell(configurationError);
    if(pendingResults&&!stopped)await tell(`${pendingResults}个任务结果仍待补传`,'本地结果已保留，不会重新执行；可通过“中断任务与补传”再次尝试。');
    if(!stopped)await showPending();
  }
  async function testLocalAi(localModel) {
    const started = performance.now();
    let result;
    try {
      void localModel.start();
      result = await localModel.analyze('你好，绯月。',{hint:'auto',signal:controller.signal});
    } catch {
      result = {error:'LOCAL_AI_INFERENCE_FAILED'};
    }
    if (stopped) return;
    const reply = result?.kind === 'chat' && typeof result.reply === 'string' ? result.reply.trim() : '';
    const error = result?.error ?? (reply ? undefined : 'LOCAL_AI_NO_REPLY');
    const duration = Math.round(performance.now()-started);
    const model=localModel.snapshot?.().model??'Qwen3.5';
    await traffic.write({direction:'local',route:'本地 AI',stage:'连接测试',model,duration_ms:duration,error});
    if (stopped) return;
    const reasons = {
      LOCAL_AI_BUSY:'本地 AI 正在处理请求，稍后可重试。',
      LOCAL_AI_TIMEOUT:'等待本地模型响应超时。',
      LOCAL_AI_MODEL_MISSING:'未找到本地模型权重。',
      LOCAL_AI_DEPENDENCY_MISSING:'本地推理库缺失。',
      LOCAL_AI_NO_REPLY:'模型未给出可用的回复。'
    };
    await dialog.showMessageBox({title:'本地 AI 连接测试',type:error?'warning':'info',
      message:error?'本地 AI 测试未通过':'本地 AI 响应正常',
      detail:[model+' · '+duration+' 毫秒',error?(reasons[error]??'本地模型无法响应。')+'（'+error+'）':reply].join('\n'),
      buttons:['确定']});
  }
  let activeProviderTest;
  async function testCloudAi(){
    const title='AI 轮询测试';
    let message='未能取得完整的服务器测试结果',detail='',success=false,error;
    try{
      if(!request)throw Object.assign(Error(),{code:'NOT_CONFIGURED'});
      const response=await request('/api/assistant/provider-test',{method:'POST',cache:'no-store'});
      const result=await response.json().catch(()=>null);
      const attempts=result?.ai?.attempts;
      const valid=Array.isArray(attempts)&&attempts.length>0&&attempts.length<=16&&attempts.every(a=>
        typeof a?.provider==='string'&&/^[a-z][a-z0-9-]{0,31}$/.test(a.provider)&&typeof a.code==='string'&&a.code.length>0);
      const last=valid?attempts.at(-1):null;
      if(response.ok&&result?.status==='success'&&last?.code==='OK'&&last.provider===result.provider&&last.model===result.model&&
        typeof result.model==='string'&&/^[@a-z0-9_./:-]{1,96}$/i.test(result.model)){
        success=true;message='成功 · '+result.provider;detail=result.model;
        if(last.reply_check==='matched'&&typeof result.answer==='string'&&result.answer.length<=256)detail+='\n'+result.answer+'（东京时间）';
      }else if(response.status===503&&result?.status==='all_failed'&&result.error?.code==='ALL_PROVIDERS_FAILED'&&valid&&attempts.every(a=>a.code!=='OK')){
        message='已测试的 AI 接口全部失败';detail=attempts.map(a=>a.provider).join('、');error='ALL_PROVIDERS_FAILED';
      }else error='INCOMPLETE_TEST_RECEIPT';
    }catch(e){error=e?.code==='NOT_CONFIGURED'?'NOT_CONFIGURED':e?.code==='TIMEOUT'?'TIMEOUT':'CONNECTION_ERROR';}
    await traffic.write({direction:'local',route:'AI 轮询测试',stage:'测试结束',result:success?'success':error==='ALL_PROVIDERS_FAILED'?'all_failed':'incomplete',error});
    if(!stopped)await dialog.showMessageBox({title,type:success?'info':'warning',message,detail,buttons:['确定']});
  }
  async function showCloudConnection(localModel) {
    const buttons=[];
    if(request)buttons.push('测试云端连接');
    const localIndex=buttons.length;
    if(localModel)buttons.push('测试本地 AI');
    const testIndex=buttons.length;
    buttons.push('AI 轮询测试');
    const cancelId=buttons.length;
    buttons.push('关闭');
    const choice = await dialog.showMessageBox({title:'绯月连接测试',type:'info',
      message:connection ? connection.mode : configurationError || '等待发布配置',
      detail:connection?.origin ?? '',buttons,defaultId:0,cancelId});
    if(stopped)return;
    if(choice.response===testIndex){
      activeProviderTest??=testCloudAi().finally(()=>{activeProviderTest=undefined;});
      return activeProviderTest;
    }
    if(localModel && choice.response===localIndex)return testLocalAi(localModel);
    if(!request || choice.response!==0)return;
    try {
      const response=await request(connection?.mode==='Access'?'/api/health':'/api/chains',{method:'GET'});
      await tell(response.ok?'云端连接正常':`云端暂不可用（HTTP ${response.status}）`);
    } catch { await tell('无法连到云端，请查看任务日志'); }
  }
  function resumePaused(){
    if(resuming)return resuming;
    resuming=(async()=>{
      const errors=[];
      for(const [key,job] of continuation.entries()){
        if(!canStart())break;
        try{
          if(job.kind==='task')await runTask(job.id);
          else if(job.kind==='claim'){
            if(chainClient.pending().some(op=>op.request_id===job.id))await chainClient.resume(job.id);
          }else if(job.kind==='registration'){
            if(await registration.savedId()===job.id)await registration.resume();
          }else if(job.kind==='reminder')await reminderReview.resume(job.data);
          else throw Error('未知的恢复记录。');
          if(!draining)continuation.done(key);
        }catch(error){errors.push(error.message);}
      }
      return errors;
    })().finally(()=>{resuming=null;});
    return resuming;
  }
  async function drainForRestart(){
    draining=true;
    const registrationResult=registration.current();
    // 已发出的指令继续处理回执。不要启用退出 gate，否则在途回执会与等待重启互锁。
    if(registrationResult)await registrationResult.catch(()=>{});
    while(outstanding||operations.size||inFlight.size||chainClient.activeCount()||executor.activeCount()||reminderReview.activeCount())await delay(40);
    await registration.verifyForRestart();
    if(registrationResult){
      const id=await registration.savedId();
      if(id)defer('registration',id);
    }
    await reminderReview.reconcile();
    if(chainClient.unacknowledged()||reminderReview.hasUnknown()||executor.listTasks().some(task=>
      (terminal(task)&&!task.metadata?.uploaded)||(task.status==='RUNNING'&&!task.recovery?.acknowledged)))
      throw Error('仍有任务结果或回执未确认，请在任务菜单核对后再重启。');
  }
  function activeCount(){return executor.activeCount()+inFlight.size+chainClient.activeCount()+registration.activeCount()+reminderReview.activeCount();}
  return {identity,executor,recordLocalBatch,runTask,supportsTask:type=>Object.hasOwn(threads.handlers,type),decide,syncDecision,showPending,startup,registration,reminderReview,traffic,showCloudConnection,
    drainForRestart,cancelRestart(){draining=false;},
    checkTerminalRestore(){
      if(continuation.entries().some(([,entry])=>['task','claim'].includes(entry.kind)))
        throw Error('仍有原终端的待恢复任务，请先在「中断任务与补传」处理。');
    },
    weatherRequest: request,
    chainClient,taskInbox,
    getAvailableTasks:()=>availableTasks.map(task=>({...task})),
    startPolling({managed=false}={}){if(!stopped){if(!managed)poller?.start();startHeartbeat();}},
    canPoll,tasksIdle,
    // 正式工作计数：已接取未结束的本机任务（含等待执行的），以及其中正在执行的个数。
    formalCount:()=>inFlight.size,executingCount:()=>executing,
    // 自动接取在领取确认后即返回；需要等执行结束时（测试、退出前）用它等待本机任务全部完成。
    settled:async()=>{while(inFlight.size||operations.size)await delay(20);},
    pollOnce(){
      if(!poller)throw Object.assign(Error('云端连接未配置'),{code:'NO_CONNECTION'});
      return poller.scanOnce();
    },
    activeCount,
    beginQuitCheck(){checking=true;if(!gate)gate=new Promise(resolve=>{release=resolve;});},
    cancelQuitCheck(){checking=false;release?.();release=null;gate=null;},
    async stop(){stopped=true;clearInterval(heartbeatTimer);poller?.stop();executor.interrupt();controller.abort();release?.();release=null;gate=null;
      const closed=!inFlight.size&&!executor.activeCount()&&!registration.activeCount()&&!reminderReview.activeCount()&&!chainClient.activeCount();
      if(closed)executor.close();
      await threads.stop();
      await Promise.allSettled([...inFlight]);
      await Promise.allSettled([registration.waitForStop(),reminderReview.waitForStop()]);
      await heartbeatRequest;
      await archiveWrites;
      await traffic.flush();
      if(!closed&&!executor.activeCount())executor.close();},
    async retryPending(){await startup();},
  };
}
