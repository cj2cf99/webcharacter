import { canClaim, DEADLINE_GRACE_MS } from './deadline.mjs';
import { ancestorsReadySQL } from '../chains/rules.mjs';
import { encodeJson } from '../execution/json.mjs';
import { executePlannerTask, plannerHoursType, readPlannerReceipt, validatePlannerTask } from './planner-hours.mjs';
import { executeMainSiteTask, isHuShiTaskType, isRegistrationTaskType, prepareMainSiteTask } from '../host/main-site-task-adapter.mjs';

const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status, code, message) => reply({ error: { code, message } }, status);
const uncertain = '主站登记结果待核对，请查看对应分类的记录。';

export async function executeCloudRegistration({ request, env, taskId, ownerId, readTask, writeEntry,
  writeRegistrationEntry, readRegistrationReceipt, receiptOnly = false }) {
  let input;
  try { input = await request.json(); }
  catch { return fail(400, 'INVALID_JSON', '请求必须是 JSON 空对象'); }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) {
    return fail(400, 'INVALID_EXECUTE', '执行仅接受空对象，使用任务保存的参数');
  }

  const DB = env.DB;
  const owned = await DB.prepare(`SELECT t.task_id, c.temporary_registration
    FROM tasks t LEFT JOIN chain_nodes n ON n.node_id=t.chain_node_id
    LEFT JOIN chains c ON c.chain_id=n.chain_id
    JOIN task_submissions s ON s.submission_id=COALESCE(t.submission_id,
      CASE WHEN c.temporary_registration=1 THEN c.chain_id END)
    WHERE t.task_id=? AND s.owner_id=?`).bind(taskId, ownerId).first();
  if (!owned) return fail(404, 'TASK_NOT_FOUND', '任务不存在');
  const temporary = owned.temporary_registration === 1;
  const task = await readTask(DB, taskId);
  const planner = task?.type === plannerHoursType;
  if (!task || task.definition.executor !== 'cloud' || task.target_device_id !== null
    || !(temporary ? planner || isRegistrationTaskType(task.type) : !task.chain && (planner || isHuShiTaskType(task.type)))) {
    return fail(409, 'EXECUTOR_UNAVAILABLE', '此类任务没有接入云端登记');
  }
  if (temporary && !task.chain?.current) return fail(409, 'OLD_ROUND', '任务已切换到新一轮');
  if (['COMPLETED', 'FAILED'].includes(task.status)) return reply(task);
  if (receiptOnly || (temporary || planner) && task.status === 'RUNNING') {
    if (!(temporary || planner) || task.status !== 'RUNNING') return fail(409, 'RECEIPT_NOT_PENDING', '当前节点没有待核对的回执');
    let recovered;
    try {
      if (planner) {
        const found = await readPlannerReceipt(env.COMPANION_HOST, task.params);
        if (!found) return reply(task, 202);
        recovered = encodeJson(found);
      } else {
        if (!readRegistrationReceipt) return reply(task, 202);
        const {path} = prepareMainSiteTask(task);
        const found = await readRegistrationReceipt({path, idempotencyKey: task.chain.node_id, env});
        if (!found) return reply(task, 202);
        recovered = encodeJson(await executeMainSiteTask(task, () => found));
      }
    } catch { return reply(task, 202); }
    const at = new Date().toISOString();
    await DB.batch([
      DB.prepare(`INSERT INTO executions (execution_id,task_id,attempt_no,status,started_at,finished_at,result_json,error)
        SELECT ?,task_id,attempt_count+1,'COMPLETED',?,?,?,NULL FROM tasks WHERE task_id=? AND status='RUNNING'`)
        .bind(crypto.randomUUID(), at, at, recovered, taskId),
      DB.prepare(`INSERT INTO task_activity (task_id,updated_at,event,progress_message)
        SELECT task_id,?,'result',NULL FROM tasks WHERE task_id=? AND status='RUNNING'
        ON CONFLICT(task_id) DO UPDATE SET updated_at=excluded.updated_at,event='result',progress_message=NULL`).bind(at, taskId),
      DB.prepare("UPDATE tasks SET status='COMPLETED',attempt_count=attempt_count+1,result_json=?,error=NULL WHERE task_id=? AND status='RUNNING'")
        .bind(recovered, taskId),
    ]);
    return reply(await readTask(DB, taskId));
  }
  if (task.status === 'RUNNING') return fail(409, 'EXECUTION_NOT_FINISHED', task.activity?.progress_message || '任务正在执行或等待核对');
  if (!canClaim(task)) return fail(409, 'TASK_NOT_AVAILABLE', '任务已取消或超过可执行期限');
  if (planner ? !env.COMPANION_HOST : typeof (temporary ? writeRegistrationEntry : writeEntry) !== 'function') {
    return fail(503, 'RECORDS_NOT_CONFIGURED', '主站登记接口尚未接入');
  }
  try { if (planner) validatePlannerTask(task.params); else prepareMainSiteTask(task); }
  catch { return fail(400, 'INVALID_PARAMS', '任务参数不符合登记模板'); }

  const claim = temporary
    ? await DB.prepare(`UPDATE tasks AS t SET status='RUNNING'
      WHERE t.task_id=? AND t.status='PENDING' AND (t.deadline_at IS NULL OR t.deadline_at>?)
        AND EXISTS(SELECT 1 FROM chain_nodes n JOIN chains c ON c.chain_id=n.chain_id
          WHERE n.node_id=t.chain_node_id AND n.current_task_id=t.task_id AND c.stopped_at IS NULL
            AND n.skipped_task_id IS NOT n.current_task_id
            AND NOT EXISTS(SELECT 1 FROM chain_nodes peer JOIN tasks current ON current.task_id=peer.current_task_id
              WHERE peer.chain_id=n.chain_id AND peer.node_id<>n.node_id
                AND (current.status='RUNNING' OR (current.status='FAILED' AND peer.skipped_task_id IS NOT current.task_id))))
        AND ${ancestorsReadySQL}`).bind(taskId, new Date(Date.now()-DEADLINE_GRACE_MS).toISOString()).run()
    : await DB.prepare("UPDATE tasks SET status='RUNNING' WHERE task_id=? AND status='PENDING'").bind(taskId).run();
  if (!claim.meta.changes) {
    if (temporary) {
      const current = await readTask(DB, taskId);
      if (current?.chain?.current && current.status === 'RUNNING') return reply(current, 202);
      if (current?.chain?.current && ['COMPLETED','FAILED'].includes(current.status)) return reply(current);
      return fail(409, 'REGISTRATION_BLOCKED', '当前节点需等待前置任务或失败处理');
    }
    return fail(409, 'TASK_CHANGED', '任务状态已变化，请重新查询');
  }

  const attempts = [];
  let status = 'RUNNING', result = null, error = null;
  for (let number = 1; number <= 2; number++) {
    const start = new Date().toISOString();
    try {
      result = planner ? await executePlannerTask(env.COMPANION_HOST, task.params) : await executeMainSiteTask(task, operation => temporary
        ? writeRegistrationEntry({ ...operation, env })
        : writeEntry(request, env, operation.path, operation.body, operation.idempotencyKey));
      status = 'COMPLETED';
      error = null;
    } catch (failure) {
      // 仅主站明确拒绝且未写入时可立即再试。失去回执时可能已经写入。
      if (planner && failure?.code === 'PLANNER_REJECTED') {
        status = 'FAILED';
        error = failure.message;
      } else if (failure?.code !== 'RECORDS_REJECTED') {
        error = null;
        break;
      } else {
        status = number === 2 ? 'FAILED' : 'RUNNING';
        error = failure.status === 429 ? '登记冷却中，请稍后再试。' : '主站拒绝登记，请核对内容后再试。';
      }
    }
    attempts.push(DB.prepare(`INSERT INTO executions
      (execution_id, task_id, attempt_no, status, started_at, finished_at, result_json, error)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM tasks WHERE task_id=? AND status='RUNNING'`)
      .bind(crypto.randomUUID(), taskId, number, error ? 'FAILED' : 'COMPLETED',
        start, new Date().toISOString(), result === null ? null : encodeJson(result), error, taskId));
    if (status !== 'RUNNING') break;
  }

  await DB.batch([
    ...attempts,
    DB.prepare(`INSERT INTO task_activity (task_id, updated_at, event, progress_message)
      SELECT task_id,?,?,? FROM tasks WHERE task_id=? AND status='RUNNING'
      ON CONFLICT(task_id) DO UPDATE SET updated_at=excluded.updated_at, event=excluded.event, progress_message=excluded.progress_message`)
      .bind(new Date().toISOString(), status === 'RUNNING' ? 'progress' : 'result', status === 'RUNNING' ? uncertain : null, taskId),
    DB.prepare("UPDATE tasks SET status = ?, attempt_count = ?, result_json = ?, error = ? WHERE task_id = ? AND status = 'RUNNING'")
      .bind(status, attempts.length, result === null ? null : encodeJson(result), error, taskId),
  ]);
  const latest = await readTask(DB, taskId);
  return reply(latest, latest.status === 'RUNNING' ? 202 : 200);
}
