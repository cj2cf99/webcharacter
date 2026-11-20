import {isPcRegistration,PC_IMAGE_GENERATE} from '../tasks/pc-types.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DEVICE_ID_PATTERN } from '../devices/identity.mjs';
import { encodeJson, copyJson } from './json.mjs';
import { recoverySnapshot, validRecovery } from './recovery-data.mjs';
import { taskReview } from './review.mjs';

// 只供已认证的可信宿主显式调用，不监听网络，不领取或调度其它任务。
export function createTaskExecutor({ databasePath, deviceId, handlers = {}, canExecute = () => true, waitForExecution = async () => {},onReviewChanged } = {}) {
  if (typeof databasePath !== 'string' || !databasePath.trim()) throw new Error('必须指定本地数据库路径');
  if (typeof deviceId !== 'string' || !DEVICE_ID_PATTERN.test(deviceId)) throw new Error('必须指定本机固定PC标识');
  const registered = new Map();
  for (const [type, handler] of Object.entries(handlers)) {
    if (!handler || (handler.risk !== 'L1' && !((isPcRegistration(type)||type===PC_IMAGE_GENERATE) && handler.risk==='L2')) || typeof handler.validate !== 'function' || typeof handler.execute !== 'function') {
      throw new Error('处理函数必须静态声明允许的风险、参数校验和执行方法（L1 或已注册的业务登记、生图操作）');
    }
    registered.set(type, Object.freeze({ risk: handler.risk, validate: handler.validate, execute: handler.execute }));
  }
  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA foreign_keys=ON');
    db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    if(!db.prepare('PRAGMA table_info(local_task_metadata)').all().some(c=>c.name==='claim_request_id'))db.exec('ALTER TABLE local_task_metadata ADD COLUMN claim_request_id TEXT');
    db.exec(`INSERT OR IGNORE INTO local_task_metadata(task_id,name,deadline_at)
      SELECT task_id,type,NULL FROM local_tasks`);
  } catch (error) { db.close(); throw error; }
  const active = new Set();
  const review=taskReview(db,{onChange:onReviewChanged});
  let interrupted = false;

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const rowFor = id => db.prepare('SELECT * FROM local_tasks WHERE task_id=?').get(id);
  function getTask(id) {
    const row = rowFor(id);
    if (!row) return null;
    const { params_json, result_json, ...value } = row;
    const executions = db.prepare('SELECT * FROM executions WHERE task_id=? ORDER BY attempt_no').all(id).map(record => {
      const { result_json, ...rest } = record;
      return { ...rest, result: result_json === null ? null : JSON.parse(result_json) };
    });
    return { ...value, params: JSON.parse(params_json), result: result_json === null ? null : JSON.parse(result_json), executions };
  }
  function validateTask(task) {
    if (!task || typeof task !== 'object' || Array.isArray(task)
      || typeof task.task_id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(task.task_id)) throw new Error('任务标识无效');
    if (task.type === 'disk.query') throw new Error('磁盘查询已按用户要求暂缓');
    const handler = registered.get(task.type);
    if (!handler) throw new Error('任务类型尚未配置处理函数');
    if (task.target_device_id !== deviceId) throw new Error('任务目标不是本机');
    if (!task.params || typeof task.params !== 'object' || Array.isArray(task.params)) throw new Error('参数必须为JSON对象');
    const params = copyJson(task.params);
    // 校验不能改变已领取任务的参数；传副本，执行时再给独立副本。
    handler.validate(copyJson(params));
    return { task_id: task.task_id, type: task.type, target_device_id: deviceId, params };
  }
  function prepare(input) {
    const task = validateTask(input);
    transaction(() => {
      const existing = rowFor(task.task_id);
      const params = encodeJson(task.params);
      if (existing) {
        if (existing.type !== task.type || existing.target_device_id !== deviceId || encodeJson(JSON.parse(existing.params_json)) !== params) throw new Error('同一任务标识不能更换内容');
        return;
      }
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO local_tasks
        (task_id,type,target_device_id,params_json,status,attempt_count,created_at,updated_at)
        VALUES (?,?,?,?,'PENDING',0,?,?)`).run(task.task_id, task.type, deviceId, params, now, now);
    });
    db.prepare(`INSERT INTO local_task_metadata(task_id,name,deadline_at) VALUES(?,?,?)
      ON CONFLICT(task_id) DO NOTHING`).run(task.task_id, input.definition?.name || task.type, input.deadline_at ?? null);
    if(input.claim_request_id)db.prepare('UPDATE local_task_metadata SET claim_request_id=COALESCE(claim_request_id,?) WHERE task_id=?').run(input.claim_request_id,task.task_id);
    return getTask(task.task_id);
  }
  async function execute(input) {
    const task = validateTask(input);
    if (interrupted || !canExecute()) throw Object.assign(new Error('退出检查中，未开始任务'), {code:'INTERRUPTED'});
    if (getRecovery(task.task_id)) throw new Error('任务已有中断处理决定，不能执行原任务');
    if (active.has(task.task_id)) throw new Error('该任务正在本进程执行');
    active.add(task.task_id);
    try {
      prepare(input);
      while (true) {
        await waitForExecution();
        if (interrupted || !canExecute()) throw Object.assign(new Error('任务已中断，保留原记录'), {code:'INTERRUPTED'});
        const attempt = transaction(() => {
          const row = rowFor(task.task_id);
          if (row.status === 'COMPLETED' || row.status === 'FAILED') return null;
          const previous = db.prepare('SELECT status FROM executions WHERE task_id=? ORDER BY attempt_no DESC LIMIT 1').get(task.task_id);
          if (previous?.status === 'RUNNING') throw new Error('上次执行状态待核对，未自动重跑');
          if (row.attempt_count >= 2) throw new Error('执行次数已达上限，需核对本地记录');
          const number = row.attempt_count + 1;
          const executionId = randomUUID();
          const now = new Date().toISOString();
          db.prepare(`UPDATE local_tasks SET status='RUNNING',attempt_count=?,updated_at=?,error=NULL WHERE task_id=?`).run(number, now, task.task_id);
          db.prepare(`INSERT INTO executions (execution_id,task_id,attempt_no,status,started_at) VALUES (?,?,?,'RUNNING',?)`).run(executionId, task.task_id, number, now);
          return { executionId, number, startedAt:now };
        });
        if (!attempt) return getTask(task.task_id);
        onReviewChanged?.(attempt.startedAt);
        let result = null;
        let failure = null;
        try { result = copyJson(await registered.get(task.type).execute(copyJson(task.params), task.task_id)); }
        catch (error) {
          if (interrupted || error?.code === 'INTERRUPTED') throw Object.assign(new Error('任务已中断，结果未知'), {code:'INTERRUPTED'});
          failure = '任务执行失败';
        }
        // 保存失败只针对工具调用；SQLite保存故障绝不被当作工具失败再执行。
        const now = new Date().toISOString();
        transaction(() => {
          const status = failure ? 'FAILED' : 'COMPLETED';
          const taskStatus = failure && attempt.number === 1 ? 'RUNNING' : status;
          const serialized = result === null ? null : encodeJson(result);
          db.prepare('UPDATE executions SET status=?,finished_at=?,result_json=?,error=? WHERE execution_id=?')
            .run(status, now, serialized, failure, attempt.executionId);
          db.prepare('UPDATE local_tasks SET status=?,updated_at=?,result_json=?,error=? WHERE task_id=?')
            .run(taskStatus, now, serialized, failure, task.task_id);
        });
        onReviewChanged?.(attempt.startedAt);
        if(now!==attempt.startedAt)onReviewChanged?.(now);
        if (!failure || attempt.number === 2) return getTask(task.task_id);
      }
    } finally { active.delete(task.task_id); }
  }
  function getRecovery(id) {
    const row=db.prepare('SELECT * FROM local_recoveries WHERE task_id=?').get(id);
    return row ? {payload:JSON.parse(row.payload_json),acknowledged:Boolean(row.acknowledged)} : null;
  }
  function decideRecovery(id, decision) {
    if (active.has(id)) throw new Error('任务仍在本进程执行');
    const prior=getRecovery(id);
    if(prior) {
      if(prior.payload.decision!==decision)throw new Error('已保存不同决定，请先核对原决定');
      return prior;
    }
    const task=getTask(id);
    const payload={device_id:deviceId,decision,replacement_task_id:decision==='redo'?randomUUID():null,snapshot:task?recoverySnapshot(task):null};
    if(!validRecovery(payload,id))throw new Error('只有未知结果的中断任务可处理');
    db.prepare('INSERT INTO local_recoveries(task_id,payload_json) VALUES(?,?)').run(id,encodeJson(payload));
    return getRecovery(id);
  }
  return {
    prepare, validateTask, execute, getTask, getRecovery, decideRecovery, review,
    isRecoveryReplacement(id){
      return Boolean(db.prepare("SELECT 1 FROM local_recoveries WHERE json_extract(payload_json,'$.replacement_task_id')=? LIMIT 1").get(id));
    },
    claimRequestId(id) {
      const row=db.prepare('SELECT claim_request_id FROM local_task_metadata WHERE task_id=?').get(id);
      if(!row)throw new Error('必须先保存本地任务再申请领取');
      const requestId=row.claim_request_id||randomUUID();
      db.prepare('UPDATE local_task_metadata SET claim_request_id=? WHERE task_id=?').run(requestId,id);
      return requestId;
    },
    listTasks() { return db.prepare('SELECT task_id FROM local_tasks ORDER BY created_at,task_id').all().map(row=>({
      ...getTask(row.task_id),metadata:db.prepare('SELECT * FROM local_task_metadata WHERE task_id=?').get(row.task_id)||null,
      recovery:getRecovery(row.task_id),active:active.has(row.task_id),
    })); },
    markUploaded(id) { transaction(()=>{
      const task=db.prepare('SELECT name FROM local_task_metadata WHERE task_id=? AND uploaded=0').get(id);
      if(!task)return;
      review.record({key:'upload:'+id,taskId:id,title:task.name,action:'云端已确认收到本机执行结果'});
      db.prepare('UPDATE local_task_metadata SET uploaded=1 WHERE task_id=?').run(id);
    }); },
    acknowledgeRecovery(id) { transaction(()=>{
      const saved=getRecovery(id), task=db.prepare('SELECT name FROM local_task_metadata WHERE task_id=?').get(id);
      if(!saved||saved.acknowledged)return;
      const next=saved.payload.replacement_task_id;
      review.record({key:'recovery:'+id,taskId:id,title:task.name,action:next?'已确认重做':'已确认放弃原任务',detail:next?'新任务编号：'+next:''});
      db.prepare('UPDATE local_recoveries SET acknowledged=1 WHERE task_id=?').run(id);
    }); },
    discardRejectedRecovery(id) { db.prepare('DELETE FROM local_recoveries WHERE task_id=? AND acknowledged=0').run(id); },
    activeCount() { return active.size; },
    hasUnsettledWork() {
      // 未获领取回执的 PENDING 副本可能已被云端拒绝。待确认的领取由 chainClient 跟踪。
      return Boolean(db.prepare(`SELECT 1 FROM local_tasks t
        JOIN local_task_metadata m USING(task_id)
        LEFT JOIN local_recoveries r USING(task_id)
        WHERE (t.status='RUNNING' AND COALESCE(r.acknowledged,0)=0)
           OR (t.status IN ('COMPLETED','FAILED') AND m.uploaded=0) LIMIT 1`).get());
    },
    interrupt() { interrupted=true; },
    close() { if (active.size) throw new Error('执行尚未完成，不能关闭数据库'); db.close(); },
  };
}
