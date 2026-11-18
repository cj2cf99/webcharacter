import { encodeJson } from './json.mjs';
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
const at = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export function recoverySnapshot(task) {
  const {task_id,type,target_device_id,params,status,attempt_count,result,error,executions} = task;
  return {task_id,type,target_device_id,params,status,attempt_count,result,error,executions};
}
export function validRecovery(body, taskId) {
  try {
    if (!exact(body, ['device_id','decision','replacement_task_id','snapshot'])
      || !['abandon','redo'].includes(body.decision)
      || (body.decision === 'abandon' ? body.replacement_task_id !== null : !id(body.replacement_task_id) || body.replacement_task_id === taskId)) return false;
    const s = body.snapshot;
    if (!exact(s, ['task_id','type','target_device_id','params','status','attempt_count','result','error','executions'])
      || s.task_id !== taskId || s.target_device_id !== body.device_id || typeof s.type !== 'string'
      || !s.params || typeof s.params !== 'object' || Array.isArray(s.params)
      || s.status !== 'RUNNING' || ![1,2].includes(s.attempt_count)
      || !Array.isArray(s.executions) || s.executions.length !== s.attempt_count || s.result !== null) return false;
    const ids = new Set(); let previous;
    for (let i=0; i<s.executions.length; i++) {
      const e=s.executions[i];
      if (!exact(e,['execution_id','task_id','attempt_no','status','started_at','finished_at','result','error'])
        || !id(e.execution_id) || ids.has(e.execution_id) || e.task_id !== taskId || e.attempt_no !== i+1
        || !at(e.started_at) || (previous && e.started_at < previous.finished_at) || e.result !== null) return false;
      if (e.status === 'RUNNING') {
        if (i !== s.executions.length-1 || e.finished_at !== null || e.error !== null) return false;
      } else if (e.status === 'FAILED') {
        if (!at(e.finished_at) || e.finished_at < e.started_at || e.error !== '任务执行失败' || e.attempt_no !== 1) return false;
      } else return false;
      previous=e; ids.add(e.execution_id);
    }
    if (s.error !== previous.error) return false;
    encodeJson(body); return true;
  } catch { return false; }
}
