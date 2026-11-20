import {eligibility,gateSQL,gateBindings,validId} from './rules.mjs';
import {encodeJson} from '../execution/json.mjs';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const fail=(status,code,message)=>reply({error:{code,message}},status);
export async function claimTask(DB,task,body,readTask){
  if(Object.keys(body).some(k=>!['device_id','request_id'].includes(k))||(body.request_id!==undefined&&!validId(body.request_id)))return fail(400,'INVALID_CLAIM','领取仅接受设备与请求标识');
  const requestId=body.request_id??crypto.randomUUID(),requestJson=encodeJson({task_id:task.task_id,device_id:body.device_id});
  async function receipt(){
    const saved=await DB.prepare('SELECT * FROM task_operations WHERE request_id=?').bind(requestId).first();if(!saved)return null;
    if(saved.action!=='claim'||saved.request_json!==requestJson)return fail(409,'OPERATION_CONFLICT','请求标识已用于其它操作');
    const current=await readTask(DB,task.task_id);return reply({task:current,claimed:true,claimReceipt:{request_id:requestId,task:current}});
  }
  const cached=await receipt();if(cached)return cached;
  const reasons=await eligibility(DB,task,body.device_id,'claim');if(reasons.length)return fail(409,reasons[0].code,reasons[0].message);
  const at=new Date().toISOString();
  try{await DB.batch([
    DB.prepare(`UPDATE tasks AS t SET status='RUNNING',claim_request_id=?,target_device_id=? WHERE t.task_id=? AND (t.target_device_id=? OR (t.target_device_id IS NULL AND t.dispatch_all=1)) AND t.status='PENDING' AND ${gateSQL()}`)
      .bind(requestId,body.device_id,task.task_id,body.device_id,...gateBindings(body.device_id)),
    DB.prepare(`INSERT INTO task_operations(request_id,chain_id,action,old_task_id,from_device_id,to_device_id,created_at,request_json)
      SELECT ?,n.chain_id,'claim',t.task_id,CASE WHEN t.dispatch_all=1 THEN NULL ELSE t.target_device_id END,t.target_device_id,?,? FROM tasks t LEFT JOIN chain_nodes n ON n.node_id=t.chain_node_id
      WHERE t.task_id=? AND t.status='RUNNING' AND t.claim_request_id=?`).bind(requestId,at,requestJson,task.task_id,requestId),
    DB.prepare(`INSERT INTO task_activity(task_id,updated_at,event,progress_message)
      SELECT task_id,?,'claim',NULL FROM tasks WHERE task_id=? AND claim_request_id=? AND status='RUNNING'
      ON CONFLICT(task_id) DO UPDATE SET updated_at=excluded.updated_at,event='claim',progress_message=NULL`).bind(at,task.task_id,requestId),
  ]);}catch{return await receipt()||fail(409,'CLAIM_CONFLICT','领取冲突，未重复领取');}
  return await receipt()||fail(409,'CLAIM_BLOCKED','领取条件已变化，未领取');
}
