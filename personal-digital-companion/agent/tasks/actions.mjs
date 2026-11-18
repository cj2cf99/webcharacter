import { PC_ID_PATTERN } from '../devices/api.mjs';
import { encodeJson } from '../execution/json.mjs';
import { activityStatement } from './activity.mjs';
import {claimTask} from '../chains/claim.mjs';

const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status, code, message) => reply({ error: { code, message } }, status);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, fields) => object(value) && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const final = status => status === 'COMPLETED' || status === 'FAILED';
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fixedError = '任务执行失败';

function reportValid(body, id) {
  if (!exact(body, ['device_id', 'status', 'attempt_count', 'result', 'error', 'executions'])
    || !final(body.status) || ![1, 2].includes(body.attempt_count)
    || (body.status === 'FAILED' && body.attempt_count !== 2)
    || !Array.isArray(body.executions) || body.executions.length !== body.attempt_count) return false;
  const ids = new Set();
  let previous;
  for (let index = 0; index < body.executions.length; index++) {
    const execution = body.executions[index];
    if (!exact(execution, ['execution_id', 'task_id', 'attempt_no', 'status', 'started_at', 'finished_at', 'result', 'error'])
      || typeof execution.execution_id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(execution.execution_id)
      || ids.has(execution.execution_id) || execution.task_id !== id || execution.attempt_no !== index + 1
      || !final(execution.status) || !timestamp(execution.started_at) || !timestamp(execution.finished_at)
      || execution.finished_at < execution.started_at || (previous && execution.started_at < previous.finished_at)
      || (index < body.executions.length - 1 && execution.status !== 'FAILED')) return false;
    if (execution.status === 'FAILED' ? execution.result !== null || execution.error !== fixedError : execution.error !== null) return false;
    ids.add(execution.execution_id);
    previous = execution;
  }
  if (previous.status !== body.status || body.error !== previous.error || encodeJson(body.result) !== encodeJson(previous.result)) return false;
  // 递归检查所有结果可完整表达为JSON（例如1e400解析成Infinity必须拒绝）。
  encodeJson(body);
  return true;
}

function receipt(value) {
  return encodeJson({ status: value.status, attempt_count: value.attempt_count,
    result: value.result, error: value.error, executions: value.executions });
}

// 归属校验仍在开发Bearer之后；device_id不是设备认证凭据。
export async function handleTaskAction(request, DB, id, action, readTask) {
  let body;
  try { body = await request.json(); } catch { return fail(400, 'INVALID_JSON', '请求必须是有效JSON'); }
  if (action === 'cancel') {
    if (!exact(body, [])) return fail(400, 'INVALID_CANCEL', '取消请求仅接受空JSON对象');
    const existing = await readTask(DB, id);
    if (!existing) return fail(404, 'TASK_NOT_FOUND', '任务不存在');
    if (existing.status === 'CANCELLED') return reply({ cancelled: true, task: existing });
    if (existing.status !== 'PENDING') return fail(409, 'TASK_NOT_PENDING', '只能取消未领取任务');
    await DB.prepare("UPDATE tasks SET status = 'CANCELLED' WHERE task_id = ? AND status = 'PENDING'").bind(id).run();
    const cancelled = await readTask(DB, id);
    return cancelled.status === 'CANCELLED' ? reply({ cancelled: true, task: cancelled }) : fail(409, 'TASK_NOT_PENDING', '任务已领取或结束，未取消');
  }
  if (!object(body) || typeof body.device_id !== 'string' || !PC_ID_PATTERN.test(body.device_id)) {
    return fail(400, 'INVALID_DEVICE', '必须指定固定PC设备标识');
  }
  const task = await readTask(DB, id);
  if (!task) return fail(404, 'TASK_NOT_FOUND', '任务不存在');
  if (task.definition.executor !== 'pc' || task.target_device_id !== body.device_id
    || !task.target_device?.device_id) return fail(409, 'TARGET_MISMATCH', '任务目标与执行设备不符');
  if (action === 'progress') {
    if (!exact(body, ['device_id', 'message']) || typeof body.message !== 'string' || !body.message.trim()
      || [...body.message.trim()].length > 200 || /[\u0000-\u001f\u007f-\u009f]/u.test(body.message)) {
      return fail(400, 'INVALID_PROGRESS', '进度说明须为1至200个字符且不含控制字符');
    }
    if (task.status !== 'RUNNING') return fail(409, 'TASK_NOT_RUNNING', '只有执行中的任务可更新进度');
    const at = new Date().toISOString();
    const message = body.message.trim();
    const updated = await activityStatement(DB, { taskId: id, deviceId: body.device_id, at, event: 'progress', message }).run();
    if (updated.meta.changes !== 1) return fail(409, 'TASK_NOT_RUNNING', '任务状态已变化，未更新进度');
    return reply({ task_id: id, updated_at: at, progress_message: message });
  }
  if (action === 'claim') {
    return claimTask(DB,task,body,readTask);
  }
  let valid;
  try { valid = reportValid(body, id); } catch { valid = false; }
  if (!valid) return fail(400, 'INVALID_RESULT', '结果、执行次数或尝试记录不符合任务规则');
  if(task.superseded_by_task_id){
    if(final(task.status)&&receipt(task)!==receipt(body))return fail(409,'RESULT_CONFLICT','旧轮已有不同终态');
    const serialized=encodeJson(body);
    await DB.prepare(`INSERT INTO archived_task_results(task_id,report_json,received_at) VALUES(?,?,?) ON CONFLICT(task_id) DO NOTHING`)
      .bind(id,serialized,new Date().toISOString()).run();
    const saved=await DB.prepare('SELECT report_json FROM archived_task_results WHERE task_id=?').bind(id).first();
    if(saved.report_json!==serialized)return fail(409,'RESULT_CONFLICT','旧轮归档结果冲突');
    return reply({acknowledged:true,archived:true,task:await readTask(DB,id),report:JSON.parse(saved.report_json)});
  }
  if (final(task.status)) {
    if (receipt(task) !== receipt(body)) return fail(409, 'RESULT_CONFLICT', '已保存的终态与本次报告不同');
    await activityStatement(DB, { taskId: id, deviceId: body.device_id, at: new Date().toISOString(), event: 'result', finished: true }).run();
    return reply({ acknowledged: true, task: await readTask(DB, id) });
  }
  if (task.status !== 'RUNNING') return fail(409, 'TASK_NOT_RUNNING', '任务尚未领取或已结束');
  const statements = body.executions.map(execution => DB.prepare(`INSERT INTO executions
    (execution_id, task_id, attempt_no, status, started_at, finished_at, result_json, error)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS
    (SELECT 1 FROM tasks WHERE task_id = ? AND target_device_id = ? AND status = 'RUNNING')`)
    .bind(execution.execution_id, id, execution.attempt_no, execution.status, execution.started_at, execution.finished_at,
      execution.result === null ? null : encodeJson(execution.result), execution.error, id, body.device_id));
  // 先写仍为RUNNING的活动记录，再更新终态；任一步失败整批回滚。
  statements.push(activityStatement(DB, { taskId: id, deviceId: body.device_id, at: new Date().toISOString(), event: 'result' }));
  statements.push(DB.prepare(`UPDATE tasks SET status = ?, attempt_count = ?, result_json = ?, error = ?
    WHERE task_id = ? AND target_device_id = ? AND status = 'RUNNING'`)
    .bind(body.status, body.attempt_count, body.result === null ? null : encodeJson(body.result), body.error, id, body.device_id));
  const written = await DB.batch(statements);
  let saved = await readTask(DB, id);
  if (receipt(saved) !== receipt(body)) return fail(409, 'RESULT_CONFLICT', '任务状态或结果已变化');
  if (written.at(-1).meta.changes === 0) {
    // 另一个同内容报告已提交：完整核对后按终态补传刷新，不复制执行记录。
    await activityStatement(DB, { taskId: id, deviceId: body.device_id, at: new Date().toISOString(), event: 'result', finished: true }).run();
    saved = await readTask(DB, id);
  }
  return reply({ acknowledged: true, task: saved });
}
