import {PC_ID_PATTERN} from '../devices/api.mjs';
import {DEADLINE_GRACE_MS} from '../tasks/deadline.mjs';
export const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
export const why=(code,message)=>({code,message});
export async function heldCount(DB,deviceId){return (await DB.prepare("SELECT COUNT(*) n FROM tasks WHERE target_device_id=? AND status='RUNNING'").bind(deviceId).first()).n;}
export async function nodeInfo(DB,taskId) {
  return DB.prepare(`SELECT n.*,c.stopped_at FROM tasks t JOIN chain_nodes n ON n.node_id=t.chain_node_id
    JOIN chains c ON c.chain_id=n.chain_id WHERE t.task_id=?`).bind(taskId).first();
}
// 最多五层，SQL直接检查当前祖先轮；已领取任务回报不经过此领取守卫。
export const ancestorsReadySQL=`NOT EXISTS (
  WITH RECURSIVE parents(node_id,depends_on,current_task_id,skipped_task_id) AS (
    SELECT n.node_id,n.depends_on,n.current_task_id,n.skipped_task_id FROM chain_nodes own
      JOIN chain_nodes n ON n.node_id=own.depends_on WHERE own.node_id=t.chain_node_id
    UNION ALL SELECT n.node_id,n.depends_on,n.current_task_id,n.skipped_task_id
      FROM chain_nodes n JOIN parents p ON n.node_id=p.depends_on
  ) SELECT 1 FROM parents p JOIN tasks parent ON parent.task_id=p.current_task_id
    WHERE parent.status<>'COMPLETED' AND (p.skipped_task_id IS NULL OR p.skipped_task_id<>p.current_task_id)
)`;
export function gateSQL({replacement=false}={}) {
  return `t.superseded_by_task_id IS NULL AND t.type<>'disk.query'
    AND (t.deadline_at IS NULL OR t.deadline_at>?)
    AND (t.chain_node_id IS NULL OR EXISTS(SELECT 1 FROM chain_nodes n JOIN chains c ON c.chain_id=n.chain_id
      WHERE n.node_id=t.chain_node_id AND n.current_task_id=t.task_id AND c.stopped_at IS NULL))
    AND ${ancestorsReadySQL}
    AND (SELECT COUNT(*) FROM tasks held WHERE held.target_device_id=? AND held.status='RUNNING'
      ${replacement?"AND held.task_id<>t.task_id":''})<2`;
}
export function gateBindings(deviceId){return [new Date(Date.now()-DEADLINE_GRACE_MS).toISOString(),deviceId];}
export async function eligibility(DB,task,deviceId,action='claim',context=null) {
  const reasons=[];
  if(!PC_ID_PATTERN.test(deviceId??'')||!(context?context.deviceExists:await DB.prepare('SELECT device_id FROM devices WHERE device_id=?').bind(deviceId??'').first()))reasons.push(why('INVALID_DEVICE','请选择已登记PC'));
  if(task.definition.executor!=='pc')reasons.push(why('EXECUTOR_UNAVAILABLE','当前未接入云端执行器'));
  const node=context?context.node:await nodeInfo(DB,task.task_id);
  if(task.superseded_by_task_id||(node&&node.current_task_id!==task.task_id))reasons.push(why('OLD_ROUND','该任务已不是当前轮'));
  if(node?.stopped_at)reasons.push(why('CHAIN_STOPPED','任务组已停止新领取'));
  const ready=context?context.ancestorsReady:await DB.prepare(`SELECT t.task_id FROM tasks t WHERE t.task_id=? AND ${ancestorsReadySQL}`).bind(task.task_id).first();
  if(!ready)reasons.push(why('DEPENDENCY_PENDING','等待前置节点成功或用户跳过'));
  if(action==='skip') {
    if(!node||task.status!=='FAILED')reasons.push(why('NOT_FAILED','只能跳过当前轮最终失败的节点'));
    return reasons;
  }
  if(task.type==='disk.query')reasons.push(why('TYPE_PAUSED','该具体任务已暂停'));
  if(task.deadline_at!==null&&task.deadline_at!==undefined&&Date.now()>=Date.parse(task.deadline_at)+DEADLINE_GRACE_MS)reasons.push(why('TASK_DEADLINE_PASSED','截止已满7天，不可接取'));
  if(action==='claim'){
    if(task.target_device_id!==deviceId)reasons.push(why('TARGET_MISMATCH','普通领取仅限原目标PC'));
    if(task.status!=='PENDING')reasons.push(why(task.status==='RUNNING'?'ALREADY_CLAIMED':task.status==='FAILED'?'FAILED_AWAITING_DECISION':'TASK_FINISHED',task.status==='RUNNING'?'已经被领取':task.status==='FAILED'?'最终失败，等待继续、停止或跳过':'任务已结束'));
  } else if(action==='continue') {
    if(!node||task.status!=='FAILED')reasons.push(why('NOT_FAILED','只有当前失败节点可继续新一轮'));
  } else if(!['RUNNING','COMPLETED'].includes(task.status))reasons.push(why('FORCE_NOT_AVAILABLE','强制接取仅适用于执行中或已完成任务'));
  const held=context?context.held:await heldCount(DB,deviceId??'');
  const replaceOwn=action==='force'&&task.status==='RUNNING'&&task.target_device_id===deviceId?1:0;
  if(held-replaceOwn>=2)reasons.push(why('CAPACITY_FULL','当前终端已持有两个未结束任务'));
  return reasons;
}
