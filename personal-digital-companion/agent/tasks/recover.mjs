import { validRecovery } from '../execution/recovery-data.mjs';
import { encodeJson } from '../execution/json.mjs';
import { DEADLINE_GRACE_MS } from './deadline.mjs';
import {gateSQL,gateBindings,eligibility} from '../chains/rules.mjs';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const fail=(status,code,message)=>reply({error:{code,message}},status);
export async function handleRecovery(request, DB, id, readTask) {
  let body; try { body=await request.json(); } catch { return fail(400,'INVALID_JSON','请求必须是JSON'); }
  if (!validRecovery(body,id)) return fail(400,'INVALID_RECOVERY','中断决定或执行快照无效');
  const task=await readTask(DB,id);
  if (!task) return fail(404,'TASK_NOT_FOUND','任务不存在');
  if (task.definition.executor !== 'pc' || task.target_device_id !== body.device_id
    || task.type !== body.snapshot.type || encodeJson(task.params) !== encodeJson(body.snapshot.params)) {
    return fail(409,'RECOVERY_CONFLICT','任务归属或原始内容不符');
  }
  const snapshot=encodeJson(body.snapshot);
  async function receipt() {
    const row=await DB.prepare('SELECT * FROM task_recoveries WHERE task_id=?').bind(id).first();
    if (!row) return null;
    if (row.decision!==body.decision || row.replacement_task_id!==body.replacement_task_id || row.snapshot_json!==snapshot) {
      return fail(409,'RECOVERY_CONFLICT','已保存的中断决定不同');
    }
    return reply({acknowledged:true,recovery:{task_id:id,decision:row.decision,replacement_task_id:row.replacement_task_id,
      snapshot:JSON.parse(row.snapshot_json),decided_at:row.decided_at},task:await readTask(DB,id),
      replacement:row.replacement_task_id ? await readTask(DB,row.replacement_task_id) : null});
  }
  const existing=await receipt(); if(existing)return existing;
  if(task.superseded_by_task_id||task.chain?.current===false){
    if(body.decision!=='abandon')return fail(409,'OLD_ROUND','旧轮已被替代，请查看当前链；仅可确认放弃旧轮未知记录');
    await DB.prepare(`INSERT INTO task_recoveries(task_id,decision,replacement_task_id,snapshot_json,decided_at)
      VALUES(?,'abandon',NULL,?,?) ON CONFLICT(task_id) DO NOTHING`).bind(id,snapshot,new Date().toISOString()).run();
    return receipt();
  }
  if(task.status!=='RUNNING' || task.executions.length) return fail(409,'TASK_NOT_INTERRUPTED','任务不是待处理的中断执行');
  const redo=body.decision==='redo', at=new Date().toISOString();
  const cutoff=new Date(Date.now()-DEADLINE_GRACE_MS).toISOString();
  if(redo && task.type==='disk.query')return fail(409,'TYPE_PAUSED','该任务类型已暂停');
  if(redo && task.deadline_at!==null && task.deadline_at<=cutoff)return fail(409,'TASK_DEADLINE_PASSED','截止已满7天，请另行新建任务；原任务未改变');
  if(redo){const reasons=await eligibility(DB,task,body.device_id,'redo');if(reasons.length)return fail(409,reasons[0].code,reasons[0].message);}
  const condition=`t.task_id=? AND t.target_device_id=? AND t.status='RUNNING' AND t.superseded_by_task_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM task_recoveries WHERE task_id=?) ${redo?`AND ${gateSQL({replacement:true})}`:''}`;
  const bind=[id,body.device_id,id,...(redo?gateBindings(body.device_id):[])];
  const statements=[];
  if(redo)statements.push(DB.prepare(`INSERT INTO tasks(task_id,type,target_device_id,dispatch_all,params_json,status,attempt_count,created_at,deadline_at,chain_node_id)
    SELECT ?,t.type,t.target_device_id,t.dispatch_all,t.params_json,'PENDING',0,?,t.deadline_at,t.chain_node_id FROM tasks t WHERE ${condition}`)
    .bind(body.replacement_task_id,at,...bind));
  statements.push(DB.prepare(`INSERT INTO task_recoveries(task_id,decision,replacement_task_id,snapshot_json,decided_at)
    SELECT t.task_id,?,?,?,? FROM tasks t WHERE ${condition}`).bind(body.decision,body.replacement_task_id,snapshot,at,...bind));
  statements.push(DB.prepare(`INSERT INTO task_operations(request_id,chain_id,action,old_task_id,new_task_id,from_device_id,to_device_id,created_at,request_json)
    SELECT ?,n.chain_id,?,?,?,?,?,?,? FROM task_recoveries r LEFT JOIN tasks t ON t.task_id=r.task_id LEFT JOIN chain_nodes n ON n.node_id=t.chain_node_id
    WHERE r.task_id=? AND r.snapshot_json=?`).bind(`recover:${id}`,body.decision,id,body.replacement_task_id,body.device_id,body.device_id,at,encodeJson(body),id,snapshot));
  statements.push(DB.prepare(`UPDATE tasks SET status='CANCELLED',attempt_count=?,superseded_by_task_id=? WHERE task_id=? AND status='RUNNING'
    AND EXISTS(SELECT 1 FROM task_recoveries WHERE task_id=? AND decision=? AND snapshot_json=?)`)
    .bind(body.snapshot.attempt_count,body.replacement_task_id,id,id,body.decision,snapshot));
  if(redo&&task.chain)statements.push(DB.prepare(`UPDATE chain_nodes SET current_task_id=?,skipped_task_id=NULL WHERE node_id=? AND current_task_id=?
    AND EXISTS(SELECT 1 FROM task_recoveries WHERE task_id=? AND replacement_task_id=?)`).bind(body.replacement_task_id,task.chain.node_id,id,id,body.replacement_task_id));
  if(!redo&&task.chain)statements.push(DB.prepare(`UPDATE chain_nodes SET skipped_task_id=? WHERE node_id=? AND current_task_id=? AND chain_id IN (SELECT chain_id FROM chains WHERE serial_pc=0)
    AND EXISTS(SELECT 1 FROM tasks t JOIN task_recoveries r ON r.task_id=t.task_id
      WHERE t.task_id=? AND t.status='CANCELLED' AND t.superseded_by_task_id IS NULL
      AND r.decision='abandon' AND r.snapshot_json=?)`).bind(id,task.chain.node_id,id,id,snapshot));
  try { await DB.batch(statements); } catch { return fail(409,'RECOVERY_CONFLICT','恢复写入冲突，未提交部分修改'); }
  return await receipt() || fail(409,'RECOVERY_CONFLICT','任务状态或截止已变化，原任务未改变');
}
