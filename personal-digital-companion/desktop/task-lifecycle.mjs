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

const terminal=task=>['COMPLETED','FAILED'].includes(task.status);
export function interruptionDetail(task) {
  const last=task.executions.at(-1), date=last?.finished_at||last?.started_at||task.updated_at;
  const time=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'medium'}).format(new Date(date));
  return `任务：${task.metadata?.name||task.type} (${task.task_id})\n参数：${JSON.stringify(task.params)}\n最后记录：${last?`第${last.attempt_no}次 ${last.status}`:task.status}，${time} JST\n结果未知，可能已产生部分操作。重做可能重复原操作。`;
}
export async function createDesktopTasks({profile,dialog,request,handlerModule,pollerOptions={}}={}) {
  const identity=await getDeviceIdentity(profile);
  let configurationError=null, connection;
  if(request===undefined)try {connection=await loadCloudConnection(profile); request=connection?.request;} catch(error){configurationError=error.message;request=null;}
  const controller=new AbortController();
  const traffic=createTaskTrafficLog(profile);
  if(request) {
    const rawRequest=request;
    request=(path,options)=>new Promise((resolve,reject)=>{
      const local=new AbortController();let timeout;
      const finish=(error,response)=>{clearTimeout(timeout);controller.signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(response);};
      const abort=()=>{local.abort();finish(Object.assign(new Error('应用正在退出，记录保留'),{code:'CANCELLED'}));};
      if(controller.signal.aborted){abort();return;}
      const wait=['/api/assistant/recording-plan','/api/assistant/heartbeat'].includes(path)?240000:path.endsWith('/execute')||path.startsWith('/api/weather/')?15000:5000;
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
    request=traffic.wrap(request);
  }
  const threads=await createThreadHandlers(handlerModule?{module:handlerModule}:{});
  let checking=false,stopped=false,gate=null,release=null,showing=null;
  let heartbeatTimer,heartbeatRequest;
  function startHeartbeat(){
    if(!request||heartbeatTimer)return;
    heartbeatTimer=setInterval(()=>{
      if(checking||stopped||heartbeatRequest)return;
      heartbeatRequest=request('/api/assistant/heartbeat',{method:'POST',cache:'no-store'})
        .catch(()=>{}).finally(()=>{heartbeatRequest=null;});
    },30*60*1000);
    heartbeatTimer.unref();
  }
  const registration=createRegistrationFlow({profile,request,canStart:()=>!checking&&!stopped,log:traffic.write});
  const reminderReview=createReminderReviewFlow({request,canStart:()=>!checking&&!stopped,waitForStart:()=>gate});
  const inFlight=new Set();
  const executor=createTaskExecutor({databasePath:join(profile,'tasks.sqlite'),deviceId:identity.device_id,handlers:threads.handlers,
    canExecute:()=>!stopped,waitForExecution:async()=>{if(gate)await gate;}});
  const sync=request?createTaskSync({request,executor,deviceId:identity.device_id}):null;
  let availableTasks=[];
  const poller=sync?createTaskPoller({...pollerOptions,request,identity,
    canStart:()=>!checking&&!stopped,
    onTasks:tasks=>{availableTasks=tasks;},
  }):null;
  const tell=(message,detail='')=>stopped?Promise.resolve():dialog.showMessageBox({type:'info',title:'任务记录',message,detail,buttons:['确定']});
  const chainClient=createChainClient({profile,request,deviceId:identity.device_id,executor,
    canStart:()=>!checking&&!stopped,canAcquire:()=>inFlight.size<2,
    waitForStart:async()=>{if(gate)await gate;},
    executeClaimed:async receipt=>{
      if(checking||stopped||inFlight.size>=2)throw new Error('本机暂不能开始新任务，领取记录已保存');
      const pending=sync.executeClaimed(receipt);inFlight.add(pending);
      let result;
      try{result=await pending;executor.markUploaded(receipt.task.task_id);}finally{inFlight.delete(pending);}
      void reportFailure(result).catch(()=>{});return result;
    }});
  const chainDialogs=createChainDialogs({dialog,client:chainClient,runTask,request,deviceId:identity.device_id,
    canShow:()=>!checking&&!stopped,supports:task=>Object.hasOwn(threads.handlers,task.type)});
  async function reportFailure(result){
    if(stopped||checking||result.archived||result.task?.status!=='FAILED')return;
    await tell('任务最终失败，本轮已结束',`${result.task.definition?.name||result.task.type}\n已执行两次。${result.task.error||''}`);
    if(!stopped&&!checking&&result.task.chain?.current)await chainDialogs.inspect(result.task.chain.chain_id);
  }
  async function runTask(id) {
    if(checking||stopped)throw new Error('正在检查退出，不能启动任务');
    if(!sync)throw new Error('未配置云端连接，任务未执行');
    const prior=executor.getTask(id);
    if(prior?.status==='RUNNING')throw new Error('本地执行结果未知，请先处理其中断记录');
    if(!prior||!terminal(prior))if(inFlight.size>=2)throw new Error('本机已有两个任务，结束后才能接取');
    if(!prior||!terminal(prior)){
      const response=await request(`/api/tasks/${encodeURIComponent(id)}`,{method:'GET',cache:'no-store'});
      if(!response.ok)throw new Error('任务读取失败');
      const task=await response.json();
      if(checking||stopped)throw new Error('正在退出，未领取任务');
      executor.prepare(task);
      return chainClient.claim(task);
    }
    const pending=(async()=>{const result=await sync.syncTask(id);executor.markUploaded(id);chainClient.forgetTask(id);return result;})();
    inFlight.add(pending);
    let result;try{result=await pending;}finally{inFlight.delete(pending);}
    void reportFailure(result).catch(()=>{});return result;
  }
  async function syncDecision(id) {
    if(stopped||checking)throw new Error('正在退出检查，决定仍待同步');
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
    if(checking||stopped)throw new Error('正在退出检查，未保存新决定');
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
  async function startup() {
    if(stopped||checking)return;
    if(configurationError)await tell(configurationError);
    if(stopped||checking)return;
    let pendingResults=0;
    for(const task of executor.listTasks()) {
      if(stopped)break;
      try {
        if(terminal(task)&&!task.metadata?.uploaded) {if(sync)await runTask(task.task_id);else pendingResults++;}
        else if(request&&task.recovery&&!task.recovery.acknowledged)await syncDecision(task.task_id);
      } catch {if(terminal(task))pendingResults++;}
    }
    if(pendingResults&&!stopped)await tell(`${pendingResults}个任务结果仍待补传`,'本地结果已保留，不会重新执行；可通过“中断任务与补传”再次尝试。');
    if(!stopped)await showPending();
  }
  async function showCloudConnection() {
    const choice = await dialog.showMessageBox({title:'绯月云端连接',type:'info',
      message:connection ? connection.mode : configurationError || '等待发布配置',
      detail:connection?.origin ?? '',
      buttons:request?['测试连接','关闭']:['关闭'],defaultId:0,cancelId:request?1:0});
    if(!request || choice.response!==0)return;
    try {
      const response=await request(connection?.mode==='Access'?'/api/health':'/api/chains',{method:'GET'});
      await tell(response.ok?'云端连接正常':`云端暂不可用（HTTP ${response.status}）`);
    } catch { await tell('无法连到云端，请查看任务日志'); }
  }
  return {identity,executor,runTask,decide,syncDecision,showPending,startup,registration,reminderReview,traffic,showCloudConnection,
    weatherRequest: request,
    chainClient,showTasks:()=>chainDialogs.show(),
    getAvailableTasks:()=>availableTasks.map(task=>({...task})),
    startPolling(){if(!stopped){poller?.start();startHeartbeat();}},
    activeCount:()=>executor.activeCount()+inFlight.size+chainClient.activeCount()+registration.activeCount()+reminderReview.activeCount(),
    beginQuitCheck(){checking=true;if(!gate)gate=new Promise(resolve=>{release=resolve;});},
    cancelQuitCheck(){checking=false;release?.();release=null;gate=null;poller?.kick();},
    async stop(){stopped=true;clearInterval(heartbeatTimer);poller?.stop();executor.interrupt();controller.abort();release?.();release=null;gate=null;
      const closed=!inFlight.size&&!executor.activeCount();if(closed)executor.close();
      await threads.stop();
      await Promise.allSettled([...inFlight]);
      await reminderReview.waitForStop();
      await heartbeatRequest;
      await traffic.flush();
      if(!closed&&!executor.activeCount())executor.close();},
    async retryPending(){await startup();},
  };
}
