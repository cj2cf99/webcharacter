import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {getDeviceIdentity} from '../agent/devices/identity.mjs';
import {createTaskExecutor} from '../agent/execution/runner.mjs';
import {createTaskSync} from '../agent/execution/sync.mjs';
import {createThreadHandlers} from '../agent/execution/thread-handlers.mjs';
import {encodeJson} from '../agent/execution/json.mjs';
import {DEADLINE_GRACE_MS} from '../agent/tasks/deadline.mjs';

const terminal=task=>['COMPLETED','FAILED'].includes(task.status);
export function interruptionDetail(task) {
  const last=task.executions.at(-1), date=last?.finished_at||last?.started_at||task.updated_at;
  const time=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'medium'}).format(new Date(date));
  return `任务：${task.metadata?.name||task.type} (${task.task_id})\n参数：${JSON.stringify(task.params)}\n最后记录：${last?`第${last.attempt_no}次 ${last.status}`:task.status}，${time} JST\n结果未知，可能已产生部分操作。重做可能重复原操作。`;
}
async function configuredRequest(profile) {
  let config;
  try {config=JSON.parse(await readFile(join(profile,'task-config.json'),'utf8'));}
  catch(error) {if(error.code==='ENOENT')return null;throw new Error('任务云端配置无效，请检查本地配置文件');}
  let base; try {base=new URL(config.base_url);} catch {throw new Error('任务云端地址无效');}
  if(base.username||base.password||base.search||base.hash||base.pathname!=='/'
    || !(base.protocol==='https:' || (base.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(base.hostname)))
    || typeof config.api_token!=='string'||!config.api_token.trim())throw new Error('任务云端配置无效');
  return (path,options={})=>fetch(new URL(path,base),{...options,redirect:'error',
    headers:{...options.headers,Authorization:`Bearer ${config.api_token}`}});
}
export async function createDesktopTasks({profile,dialog,request,handlerModule}={}) {
  const identity=await getDeviceIdentity(profile);
  let configurationError=null;
  if(request===undefined)try {request=await configuredRequest(profile);} catch(error){configurationError=error.message;request=null;}
  const threads=await createThreadHandlers(handlerModule?{module:handlerModule}:{});
  let checking=false,stopped=false,gate=null,release=null,showing=null;
  const inFlight=new Set();
  const executor=createTaskExecutor({databasePath:join(profile,'tasks.sqlite'),deviceId:identity.device_id,handlers:threads.handlers,
    canExecute:()=>!stopped,waitForExecution:async()=>{if(gate)await gate;}});
  const sync=request?createTaskSync({request,executor,deviceId:identity.device_id}):null;
  const tell=(message,detail='')=>dialog.showMessageBox({type:'info',title:'任务记录',message,detail,buttons:['确定']});
  async function runTask(id) {
    if(checking||stopped)throw new Error('正在检查退出，不能启动任务');
    if(!sync)throw new Error('未配置云端连接，任务未执行');
    const pending=(async()=>{const result=await sync.syncTask(id);executor.markUploaded(id);return result;})();
    inFlight.add(pending);
    try{return await pending;}finally{inFlight.delete(pending);}
  }
  async function syncDecision(id) {
    if(!request)throw new Error('未配置云端连接，决定已保存为待同步');
    const saved=executor.getRecovery(id);
    if(!saved)throw new Error('没有待同步决定');
    const response=await request(`/api/tasks/${encodeURIComponent(id)}/recover`,{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json',Accept:'application/json'},body:encodeJson(saved.payload)});
    let body;try{body=await response.json();}catch{throw new Error('未收到有效回执，决定仍待同步');}
    if(!response.ok) {
      // 明确拒绝意味着服务器未提交；保留原任务，允许用户改为放弃或稍后。
      if(['TASK_DEADLINE_PASSED','TYPE_PAUSED'].includes(body?.error?.code))executor.discardRejectedRecovery(id);
      throw new Error(body?.error?.code==='TASK_DEADLINE_PASSED'?'截止已满7天，原任务未改变；需另行新建任务':'恢复请求未确认，请核对后重试');
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
    executor.acknowledgeRecovery(id);
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
    if(showing)return showing;
    showing=(async()=>{
      for(const task of executor.listTasks()) {
        if(stopped||checking)break;
        if(task.active||terminal(task)||task.status!=='RUNNING'||task.recovery?.acknowledged)continue;
        if(task.recovery) {
          const choice=await dialog.showMessageBox({type:'warning',title:'中断决定待同步',message:'已保存的决定尚未确认',
            detail:interruptionDetail(task),buttons:['稍后','重试同步'],defaultId:0,cancelId:0});
          if(choice.response===1)try {await syncDecision(task.task_id);await tell('决定已同步');}catch(error){await tell(error.message);}
          continue;
        }
        const choice=await dialog.showMessageBox({type:'warning',title:'中断任务',message:'任务结果未知，请选择处理方式',
          detail:interruptionDetail(task),buttons:['稍后','放弃','重做'],defaultId:0,cancelId:0});
        if(![1,2].includes(choice.response))continue;
        if(choice.response===2) {
          const confirm=await dialog.showMessageBox({type:'warning',title:'确认重做',message:'原操作可能已生效，重做可能重复操作',buttons:['取消','确认重做'],defaultId:0,cancelId:0});
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
    if(configurationError)await tell(configurationError);
    for(const task of executor.listTasks()) {
      if(stopped)break;
      try {
        if(sync&&terminal(task)&&!task.metadata?.uploaded) {await runTask(task.task_id);}
        else if(request&&task.recovery&&!task.recovery.acknowledged)await syncDecision(task.task_id);
      } catch { /* 持久记录保留；未知任务稍后有明确提示，完成补传可手动重试。 */ }
    }
    await showPending();
  }
  return {identity,executor,runTask,decide,syncDecision,showPending,startup,
    activeCount:()=>executor.activeCount()+inFlight.size,
    beginQuitCheck(){checking=true;if(!gate)gate=new Promise(resolve=>{release=resolve;});},
    cancelQuitCheck(){checking=false;release?.();release=null;gate=null;},
    async stop(){stopped=true;executor.interrupt();release?.();release=null;gate=null;await threads.stop();
      // 网络请求不阻塞应用退出；数据库由进程关闭，避免尚未完成的异步回执访问已关闭句柄。
      if(!inFlight.size&&!executor.activeCount())executor.close();},
    async retryPending(){await startup();},
  };
}
