import {PC_ID_PATTERN} from '../devices/api.mjs';
import {validateParameters} from '../tasks/parameters.mjs';
import {normalizeDeadline} from '../tasks/deadline.mjs';
import {encodeJson} from '../execution/json.mjs';
import {eligibility,heldCount,validId,gateSQL,gateBindings,ancestorsReadySQL} from './rules.mjs';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const fail=(status,code,message)=>reply({error:{code,message}},status);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fields=(v,required,optional=[])=>object(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
export const publicOperation=({request_json,chain_id,...operation})=>operation;
export async function readChain(DB,id,deviceId,readTask){
  const chain=await DB.prepare('SELECT * FROM chains WHERE chain_id=?').bind(id).first();if(!chain)return null;
  const {results:rows}=await DB.prepare('SELECT * FROM chain_nodes WHERE chain_id=? ORDER BY position').bind(id).all();
  const held=await heldCount(DB,deviceId??''),deviceExists=Boolean(await DB.prepare('SELECT device_id FROM devices WHERE device_id=?').bind(deviceId??'').first());
  const tasks=new Map();for(const row of rows)tasks.set(row.node_id,await readTask(DB,row.current_task_id));
  const nodes=[];
  for(const row of rows){
    const task=tasks.get(row.node_id),reasons={};let ready=true,parent=rows.find(n=>n.node_id===row.depends_on);
    while(parent){if(tasks.get(parent.node_id).status!=='COMPLETED'&&parent.skipped_task_id!==parent.current_task_id)ready=false;parent=rows.find(n=>n.node_id===parent.depends_on);}
    for(const action of ['claim','force','continue','skip'])reasons[action]=await eligibility(DB,task,deviceId,action,{node:{...row,stopped_at:chain.stopped_at},held,deviceExists,ancestorsReady:ready});
    nodes.push({node_id:row.node_id,key:row.node_key,depends_on:row.depends_on,current_task:task,
      skipped:row.skipped_task_id===row.current_task_id,eligibility:Object.fromEntries(Object.entries(reasons).map(([action,list])=>[action,!list.length])),reasons});
  }
  const {results:history}=await DB.prepare('SELECT * FROM task_operations WHERE chain_id=? ORDER BY created_at,request_id').bind(id).all();
  const completed=nodes.every(n=>n.skipped||n.current_task.status==='COMPLETED');
  const blocked=nodes.some(n=>n.eligibility.claim)?[]:[...new Map(nodes.flatMap(n=>n.reasons.claim).map(reason=>[reason.code,reason])).values()];
  return {chain_id:chain.chain_id,name:chain.name,created_at:chain.created_at,status:chain.stopped_at?'STOPPED':completed?'COMPLETED':'ACTIVE',
    held_count:held,nodes,history:history.map(publicOperation),blocked_reasons:blocked};
}
async function createChain(body,DB,readTask){
  if(!fields(body,['nodes'],['name'])||!Array.isArray(body.nodes)||body.nodes.length<1||body.nodes.length>5
    ||(body.name!==undefined&&(typeof body.name!=='string'||!body.name.trim()||body.name.length>100)))return fail(400,'INVALID_CHAIN','每组仅允许1至5个节点');
  const keys=new Set(body.nodes.map(n=>n?.key));
  if(keys.size!==body.nodes.length)return fail(400,'INVALID_CHAIN','节点key必须唯一');
  const prepared=[];
  for(const node of body.nodes){
    if(!fields(node,['key','type','target_device_id','params'],['depends_on','deadline_at'])||!validId(node.key)||typeof node.type!=='string'||!object(node.params)
      ||(node.depends_on!=null&&(!keys.has(node.depends_on)||node.depends_on===node.key)))return fail(400,'INVALID_CHAIN','节点或前置关系无效');
    if(node.type==='disk.query')return fail(409,'TYPE_PAUSED','具体任务已暂停');
    const definition=await DB.prepare('SELECT * FROM tasklist WHERE type=?').bind(node.type).first();
    if(!definition)return fail(404,'TYPE_NOT_FOUND','任务类型不存在');
    let checked;try{checked=validateParameters(JSON.parse(definition.parameter_spec_json),node.params);}catch{return fail(500,'TYPE_CONFIGURATION_ERROR','类型定义无效');}
    if(checked.configuration)return fail(500,'TYPE_CONFIGURATION_ERROR','类型定义无效');
    if(!checked.valid)return fail(400,'INVALID_PARAMS','参数不符合定义');
    if(definition.executor==='pc'){
      if(!PC_ID_PATTERN.test(node.target_device_id??'')||!await DB.prepare('SELECT device_id FROM devices WHERE device_id=?').bind(node.target_device_id??'').first())return fail(400,'INVALID_TARGET','目标必须为已登记PC');
    }else if(node.target_device_id!==null)return fail(400,'INVALID_TARGET','云任务目标必须为空');
    let deadline;try{deadline=normalizeDeadline(node.deadline_at);}catch{return fail(400,'INVALID_DEADLINE','截止时间必须明确时区');}
    prepared.push({...node,node_id:crypto.randomUUID(),task_id:crypto.randomUUID(),deadline});
  }
  for(const node of prepared){const seen=new Set();let cursor=node;while(cursor){if(seen.has(cursor.key))return fail(400,'CYCLIC_CHAIN','前置关系不能循环');seen.add(cursor.key);cursor=prepared.find(n=>n.key===cursor.depends_on);}}
  const id=crypto.randomUUID(),at=new Date().toISOString();
  const statements=[DB.prepare('INSERT INTO chains(chain_id,name,created_at) VALUES(?,?,?)').bind(id,body.name?.trim()||'任务组',at)];
  for(const node of prepared)statements.push(DB.prepare("INSERT INTO tasks(task_id,type,target_device_id,params_json,status,created_at,deadline_at) VALUES(?,?,?,?,'PENDING',?,?)").bind(node.task_id,node.type,node.target_device_id,encodeJson(node.params),at,node.deadline));
  for(const [i,node] of prepared.entries())statements.push(DB.prepare('INSERT INTO chain_nodes(node_id,chain_id,node_key,position,current_task_id) VALUES(?,?,?,?,?)').bind(node.node_id,id,node.key,i,node.task_id));
  for(const node of prepared){
    statements.push(DB.prepare('UPDATE chain_nodes SET depends_on=? WHERE node_id=?').bind(prepared.find(n=>n.key===node.depends_on)?.node_id??null,node.node_id));
    statements.push(DB.prepare('UPDATE tasks SET chain_node_id=? WHERE task_id=?').bind(node.node_id,node.task_id));
  }
  await DB.batch(statements);return reply(await readChain(DB,id,prepared.find(n=>n.target_device_id)?.target_device_id,readTask),201);
}
async function operationReceipt(DB,id,body,chainId,readTask){
  const row=await DB.prepare('SELECT * FROM task_operations WHERE request_id=?').bind(id).first();
  if(!row)return null;
  if(row.chain_id!==chainId||row.request_json!==encodeJson(body))return fail(409,'OPERATION_CONFLICT','请求标识已用于不同操作');
  const task=row.new_task_id?await readTask(DB,row.new_task_id):null;
  return reply({acknowledged:true,operation:publicOperation(row),claimReceipt:task?{request_id:id,task}:null,
    chain:await readChain(DB,chainId,body.device_id,readTask)});
}
export async function handleChainRequest(request,DB,readTask){
  const url=new URL(request.url),path=url.pathname;
  if(path!=='/api/chains'&&!path.startsWith('/api/chains/'))return null;
  if(path==='/api/chains'){
    if(request.method==='POST'){let body;try{body=await request.json();}catch{return fail(400,'INVALID_JSON','请求必须为JSON');}return createChain(body,DB,readTask);}
    if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','仅支持GET/POST');
    const after=url.searchParams.get('after')??'';
    if((after&&!validId(after))||[...url.searchParams.keys()].some(k=>!['after','device_id'].includes(k)))return fail(400,'INVALID_QUERY','分页参数无效');
    const {results}=await DB.prepare(`SELECT c.chain_id,c.name,c.created_at,CASE WHEN c.stopped_at IS NOT NULL THEN 'STOPPED'
      WHEN NOT EXISTS(SELECT 1 FROM chain_nodes n JOIN tasks t ON t.task_id=n.current_task_id WHERE n.chain_id=c.chain_id
        AND t.status<>'COMPLETED' AND (n.skipped_task_id IS NULL OR n.skipped_task_id<>n.current_task_id)) THEN 'COMPLETED' ELSE 'ACTIVE' END status
      FROM chains c WHERE c.chain_id>? ORDER BY c.chain_id LIMIT 21`).bind(after).all();
    const chains=results.slice(0,20);
    return reply({chains,next_after:results.length>20?chains.at(-1).chain_id:null});
  }
  const match=/^\/api\/chains\/([a-zA-Z0-9_-]+)(?:\/(stop)|\/nodes\/([a-zA-Z0-9_-]+)\/decision)?$/.exec(path);
  if(!match)return fail(404,'NOT_FOUND','接口不存在');
  const id=match[1];
  if(!match[2]&&!match[3]){
    if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','仅支持GET');
    const chain=await readChain(DB,id,url.searchParams.get('device_id'),readTask);return chain?reply(chain):fail(404,'CHAIN_NOT_FOUND','任务组不存在');
  }
  if(request.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','仅支持POST');
  let body;try{body=await request.json();}catch{return fail(400,'INVALID_JSON','请求必须为JSON');}
  const stop=Boolean(match[2]);
  if(!fields(body,stop?['device_id','request_id']:['action','expected_task_id','device_id','request_id'],stop?[]:['new_task_id'])
    ||!validId(body.request_id)||!PC_ID_PATTERN.test(body.device_id??'')
    ||!await DB.prepare('SELECT device_id FROM devices WHERE device_id=?').bind(body.device_id??'').first())return fail(400,'INVALID_DECISION','决定字段或终端无效');
  if(!stop&&(!['skip','continue','force'].includes(body.action)||!validId(body.expected_task_id)
    ||(body.action==='skip'?body.new_task_id!==undefined:!validId(body.new_task_id)||body.new_task_id===body.expected_task_id)))return fail(400,'INVALID_DECISION','决定或新轮ID无效');
  const cached=await operationReceipt(DB,body.request_id,body,id,readTask);if(cached)return cached;
  const chain=await DB.prepare('SELECT * FROM chains WHERE chain_id=?').bind(id).first();if(!chain)return fail(404,'CHAIN_NOT_FOUND','任务组不存在');
  const at=new Date().toISOString();
  if(stop){
    await DB.batch([
      DB.prepare("INSERT INTO task_operations(request_id,chain_id,action,to_device_id,created_at,request_json) VALUES(?,?,'stop',?,?,?)").bind(body.request_id,id,body.device_id,at,encodeJson(body)),
      DB.prepare('UPDATE chains SET stopped_at=COALESCE(stopped_at,?) WHERE chain_id=?').bind(at,id),
    ]);
    return operationReceipt(DB,body.request_id,body,id,readTask);
  }
  const node=await DB.prepare('SELECT * FROM chain_nodes WHERE node_id=? AND chain_id=?').bind(match[3],id).first();
  if(!node||node.current_task_id!==body.expected_task_id)return fail(409,'OLD_ROUND','节点当前轮已经变化');
  const task=await readTask(DB,node.current_task_id),reasons=await eligibility(DB,task,body.device_id,body.action);
  if(reasons.length)return fail(409,reasons[0].code,reasons[0].message);
  const statements=[];
  const operationInsert=(condition,params)=>DB.prepare(`INSERT INTO task_operations(request_id,chain_id,action,old_task_id,new_task_id,from_device_id,to_device_id,created_at,request_json)
    SELECT ?,?,?,?,?,?,?,?,? FROM tasks t WHERE t.task_id=? AND ${condition}`)
    .bind(body.request_id,id,body.action,task.task_id,body.new_task_id??null,task.target_device_id,body.device_id,at,encodeJson(body),task.task_id,...params);
  if(body.action==='skip'){
    statements.push(operationInsert(`t.status='FAILED' AND ${ancestorsReadySQL} AND EXISTS(SELECT 1 FROM chain_nodes n JOIN chains c ON c.chain_id=n.chain_id WHERE n.node_id=t.chain_node_id AND n.current_task_id=t.task_id AND c.stopped_at IS NULL)`,[]));
    statements.push(DB.prepare('UPDATE chain_nodes SET skipped_task_id=current_task_id WHERE node_id=? AND current_task_id=? AND EXISTS(SELECT 1 FROM task_operations WHERE request_id=?)').bind(node.node_id,task.task_id,body.request_id));
  }else{
    const status=body.action==='continue'?"t.status='FAILED'":"t.status IN ('RUNNING','COMPLETED')";
    statements.push(DB.prepare(`INSERT INTO tasks(task_id,type,target_device_id,params_json,status,created_at,deadline_at,chain_node_id,claim_request_id)
      SELECT ?,t.type,?,t.params_json,'RUNNING',?,t.deadline_at,t.chain_node_id,? FROM tasks t
      WHERE t.task_id=? AND ${status} AND ${gateSQL({replacement:true})}`)
      .bind(body.new_task_id,body.device_id,at,body.request_id,task.task_id,...gateBindings(body.device_id)));
    statements.push(operationInsert(`EXISTS(SELECT 1 FROM tasks fresh WHERE fresh.task_id=? AND fresh.claim_request_id=?)`,[body.new_task_id,body.request_id]));
    statements.push(DB.prepare(`INSERT INTO task_activity(task_id,updated_at,event,progress_message)
      SELECT task_id,?,'claim',NULL FROM tasks WHERE task_id=? AND claim_request_id=?`).bind(at,body.new_task_id,body.request_id));
    statements.push(DB.prepare("UPDATE tasks SET status=CASE WHEN status='RUNNING' THEN 'CANCELLED' ELSE status END,superseded_by_task_id=? WHERE task_id=? AND EXISTS(SELECT 1 FROM task_operations WHERE request_id=?)").bind(body.new_task_id,task.task_id,body.request_id));
    statements.push(DB.prepare('UPDATE chain_nodes SET current_task_id=?,skipped_task_id=NULL WHERE node_id=? AND current_task_id=? AND EXISTS(SELECT 1 FROM task_operations WHERE request_id=?)').bind(body.new_task_id,node.node_id,task.task_id,body.request_id));
  }
  try{await DB.batch(statements);}catch{return await operationReceipt(DB,body.request_id,body,id,readTask)||fail(409,'OPERATION_CONFLICT','操作冲突，未提交部分修改');}
  return await operationReceipt(DB,body.request_id,body,id,readTask)||fail(409,'CLAIM_BLOCKED','领取条件已变化，未修改任务');
}
