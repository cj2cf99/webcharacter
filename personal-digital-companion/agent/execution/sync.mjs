import { DEVICE_ID_PATTERN } from '../devices/identity.mjs';
import { encodeJson } from './json.mjs';

const terminal = status => status === 'COMPLETED' || status === 'FAILED';
const taskContent = task => ({ task_id: task.task_id, type: task.type, target_device_id: task.target_device_id, params: task.params });
function report(task, deviceId) {
  return {
    device_id: deviceId, status: task.status, attempt_count: task.attempt_count,
    result: task.result, error: task.error, executions: task.executions,
  };
}

// 一次显式同步一个任务；调用方提供已认证请求，不保存凭据，不轮询或调度。
export function createTaskSync({ request, executor, deviceId, pauseBeforeExecute=()=>false } = {}) {
  if (typeof request !== 'function' || !executor || typeof executor.prepare !== 'function'
      || typeof executor.getTask !== 'function' || typeof executor.execute !== 'function') throw new Error('需要已认证请求函数和本地执行器');
  if (typeof deviceId !== 'string' || !DEVICE_ID_PATTERN.test(deviceId)) throw new Error('需要本机PC标识');
  const active = new Set();

  async function call(path, method = 'GET', value) {
    const response = await request(path, {
      method, cache: 'no-store',
      headers: { Accept: 'application/json', ...(value === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(value === undefined ? {} : { body: encodeJson(value) }),
    });
    let body;
    try { body = await response.json(); }
    catch { throw new Error('同步接口未返回有效JSON，保留本地记录'); }
    if (!response.ok) throw Object.assign(new Error('任务同步请求失败，保留本地记录'), { status: response.status, code: body?.error?.code });
    return body;
  }
  function verifyTask(task, id) {
    if (!task || task.task_id !== id || task.target_device_id !== deviceId || typeof task.type !== 'string'
      || !task.params || typeof task.params !== 'object' || Array.isArray(task.params)) throw new Error('云端任务身份或参数不一致，停止同步');
    if (task.type === 'disk.query') throw new Error('磁盘查询已按用户要求暂缓');
  }
  function sameContent(local, remote) {
    if (encodeJson(taskContent(local)) !== encodeJson(taskContent(remote))) throw new Error('本地与云端任务内容冲突，停止同步');
  }
  async function upload(local, id) {
    const payload = report(local, deviceId);
    const response = await call(`/api/tasks/${encodeURIComponent(id)}/result`, 'POST', payload);
    verifyTask(response?.task, id);
    sameContent(local, response.task);
    if(response.archived===true) {
      if(response.acknowledged!==true||!response.task.superseded_by_task_id||encodeJson(response.report)!==encodeJson(payload))throw new Error('旧轮归档回执不一致，保留本地结果');
      return response;
    }
    if (response.acknowledged !== true || encodeJson(report(response.task, deviceId)) !== encodeJson(payload)) {
      throw new Error('回传确认与本地结果不一致，保留本地记录');
    }
    return response;
  }
  async function executeReceipt(claimReceipt) {
    const claimed=claimReceipt?.task,id=claimed?.task_id;
    if(typeof claimReceipt?.request_id!=='string'||!id)throw new Error('缺少有效领取回执');
    verifyTask(claimed,id);
    const remote=await call(`/api/tasks/${encodeURIComponent(id)}`);verifyTask(remote,id);sameContent(claimed,remote);
    let local=executor.getTask(id);if(local)sameContent(local,remote);
    if(local&&terminal(local.status))return upload(local,id);
    if(remote.status!=='RUNNING'||remote.superseded_by_task_id||remote.chain?.current===false||remote.claim_request_id!==claimReceipt.request_id)throw new Error('领取回执已失效，未执行任务');
    if(local?.status==='RUNNING')throw new Error('本地执行结果未知，不能重跑');
    executor.prepare({...remote});
    if(pauseBeforeExecute())return {paused:true};
    const completed=await executor.execute(taskContent(remote));return upload(completed,id);
  }

  async function syncTask(taskId) {
    if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(taskId)) throw new Error('任务标识无效');
    if (active.has(taskId)) throw new Error('该任务正在同步');
    active.add(taskId);
    try {
      const remote = await call(`/api/tasks/${encodeURIComponent(taskId)}`);
      verifyTask(remote, taskId);
      let local = executor.getTask(taskId);
      if (local) sameContent(local, remote);
      if(remote.superseded_by_task_id) {
        if(local&&terminal(local.status))return await upload(local,taskId);
        throw new Error('该任务已被新轮替代，保留旧轮本地记录');
      }
      if (terminal(remote.status)) {
        if (!local) return { acknowledged: true, task: remote };
        if (!terminal(local.status)) throw new Error('云端已结束但本地未结束，状态待核对');
        return await upload(local, taskId);
      }
      if (remote.status !== 'PENDING' && remote.status !== 'RUNNING') throw new Error('云端任务不可执行，未修改本地记录');
      if (remote.status === 'RUNNING' && !local) throw new Error('云端正在执行但本地无记录，执行状态待核对');
      if (remote.status === 'PENDING' && local && (local.status !== 'PENDING' || local.attempt_count !== 0)) {
        throw new Error('云端待执行与本地执行记录冲突，停止同步');
      }
      if (local && terminal(local.status)) return await upload(local, taskId);
      if(local?.status==='RUNNING')throw new Error('上次执行状态待核对，未自动重跑');
      local = executor.prepare({...taskContent(remote),definition:remote.definition,deadline_at:remote.deadline_at});
      const requestId=executor.claimRequestId(taskId);
      const claimed = await call(`/api/tasks/${encodeURIComponent(taskId)}/claim`, 'POST', { device_id: deviceId,request_id:requestId });
      verifyTask(claimed?.task, taskId);
      sameContent(local, claimed.task);
      if (claimed.task.status !== 'RUNNING' || typeof claimed.claimed !== 'boolean') throw new Error('未得到有效领取确认，未执行任务');
      return await executeReceipt(claimed.claimReceipt);
    } finally { active.delete(taskId); }
  }
  return { syncTask,async executeClaimed(claimReceipt) {
    const id=claimReceipt?.task?.task_id;if(typeof id!=='string'||active.has(id))throw new Error('领取回执无效或任务正在执行');
    active.add(id);try{return await executeReceipt(claimReceipt);}finally{active.delete(id);}
  } };
}
