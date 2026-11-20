import {pcRegistrations} from './pc-types.mjs';
import {registrationOperation,registrationResult} from '../host/main-site-task-adapter.mjs';
import {readPlannerReceipt,executePlannerTask,validatePlannerTask} from './planner-hours.mjs';
import {normalizeDeadline} from './deadline.mjs';
import {encodeJson} from '../execution/json.mjs';

const rejected=message=>Object.assign(Error(message),{code:'PC_REJECTED'});
function named(rows,name,field){
  if(!Array.isArray(rows))throw Error('业务查询暂不可用');
  const found=rows.filter(row=>row[field]===name);
  if(found.length!==1)throw rejected(found.length?'名称重复，请区分后再提交':'未找到指定名称');
  return found[0];
}

async function bindOperation(task,host){
  const {params,type}=task;
  if(type==='pc.planner.hours'){
    const list=await host.reviewReminders();
    if(list.today!==new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date(task.created_at)))
      throw rejected('派发日期已变化，请重新选择长期任务');
    const row=named(list.items?.filter(r=>r.plannerWork),params.title,'title');
    const binding={reminderId:row.id,dispatchId:row.plannerWork.dispatchId,actualHours:params.actualHours,version:row.version,today:list.today};
    validatePlannerTask(binding);return binding;
  }
  if(type==='pc.reminders.move'){
    normalizeDeadline(params.deadline+'T00:00:00+09:00');
    const list=await host.findEditReminders({q:params.title});
    const row=named(list.items,params.title,'title');
    if(row.locked)throw rejected('提醒由来源计划管理，无法移动');
    return {id:row.id,version:row.version,deadline:params.deadline+(row.deadline?.slice(10)??'')};
  }
  if(type==='pc.records.create'){
    const category=named(await host.categories(),params.category,'name');
    return registrationOperation(pcRegistrations[type],{...params,category_id:category.id});
  }
  return registrationOperation(pcRegistrations[type],params);
}

async function moveReminder(host,binding){
  const {id,version,deadline}=binding;
  async function read(){
    const list=await host.findEditReminders({id});
    if(!Array.isArray(list.items))throw Error('提醒回执待核对');
    const row=list.items.find(r=>r.id===id);
    if(!row||row.locked)throw rejected('提醒已变化或不可移动');
    return row;
  }
  const row=await read();
  if(row.deadline!==deadline){
    if(row.version!==version)throw rejected('提醒已变化，请重新提交');
    const response=await host.applyReminderEdit(id,{version,expiresAt:Date.now()+60000,patch:{deadline}});
    if((await read()).deadline!==deadline){
      if(response?.status>=400&&response.status<500)throw rejected(response.error);
      throw Error('移动结果待核对');
    }
  }
  return {record_id:id,deadline};
}

export async function pcOperationKey(db,task){
  if(task.chain?.node_id)return task.chain.node_id;
  return db.prepare(`WITH RECURSIVE origin(id) AS (
    SELECT ? UNION SELECT r.task_id FROM task_recoveries r JOIN origin o ON r.replacement_task_id=o.id
  ) SELECT id FROM origin WHERE NOT EXISTS(SELECT 1 FROM task_recoveries r WHERE r.replacement_task_id=origin.id)`)
    .bind(task.task_id).first('id');
}
export async function readPcResult(db,key){
  const json=await db.prepare('SELECT result_json FROM pc_registration_receipts WHERE operation_id=?').bind(key).first('result_json');
  return json?JSON.parse(json):null;
}

export async function executePcRegistration(env,task,key){
  const db=env.DB,host=env.COMPANION_HOST;
  const read=()=>db.prepare('SELECT binding_json,result_json FROM pc_registration_receipts WHERE operation_id=?').bind(key).first();
  let state=await read();
  if(!state){
    const binding=await bindOperation(task,host);
    await db.prepare('INSERT INTO pc_registration_receipts(operation_id,binding_json) VALUES(?,?) ON CONFLICT DO NOTHING')
      .bind(key,encodeJson(binding)).run();
    state=await read();
  }
  if(state.result_json)return JSON.parse(state.result_json);
  const binding=JSON.parse(state.binding_json);
  let result;
  if(task.type==='pc.reminders.move')result=await moveReminder(host,binding);
  else if(task.type==='pc.planner.hours'){
    result=await readPlannerReceipt(host,binding)??await executePlannerTask(host,binding);
  }else{
    const saved=await host.register({...binding,idempotencyKey:key});
    if(saved.rejected)throw rejected('业务端拒绝登记，状态码 '+saved.rejected);
    result=registrationResult(pcRegistrations[task.type],saved.receipt);
  }
  await db.prepare('UPDATE pc_registration_receipts SET result_json=? WHERE operation_id=? AND result_json IS NULL')
    .bind(encodeJson(result),key).run();
  return readPcResult(db,key);
}
