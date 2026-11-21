import {PC_ID_PATTERN} from '../devices/api.mjs';
import {validateParameters} from '../tasks/parameters.mjs';
import {normalizeDeadline} from '../tasks/deadline.mjs';
import {isSubmissionId} from '../tasks/submissions.mjs';
import {encodeJson} from '../execution/json.mjs';
import {eligibility,heldCount,validId,gateSQL,gateBindings,ancestorsReadySQL} from './rules.mjs';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const fail=(status,code,message)=>reply({error:{code,message}},status);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fields=(v,required,optional=[])=>object(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const MAX_TEMPLATE_NODES=5;
export const publicOperation=({request_json,chain_id,...operation})=>operation;
export async function readChain(DB,id,deviceId,readTasks){
  const chain=await DB.prepare('SELECT * FROM chains WHERE chain_id=?').bind(id).first();if(!chain)return null;
  const {results:rows}=await DB.prepare('SELECT * FROM chain_nodes WHERE chain_id=? ORDER BY position').bind(id).all();
  const held=await heldCount(DB,deviceId??''),deviceExists=Boolean(await DB.prepare('SELECT device_id FROM devices WHERE device_id=?').bind(deviceId??'').first());
  const tasks=await readTasks(DB,rows.map(row=>row.current_task_id));
  const nodesById=new Map(rows.map(row=>[row.node_id,row]));
  const nodes=[];
  for(const row of rows){
    const task=tasks.get(row.current_task_id),reasons={};let ready=true,parent=nodesById.get(row.depends_on);
    while(parent){
      if(tasks.get(parent.current_task_id).status!=='COMPLETED'&&parent.skipped_task_id!==parent.current_task_id){ready=false;break;}
      parent=nodesById.get(parent.depends_on);
    }
    for(const action of ['claim','force','continue','skip'])reasons[action]=await eligibility(DB,task,deviceId,action,{node:{...row,serial_pc:chain.serial_pc,stopped_at:chain.stopped_at},held,deviceExists,ancestorsReady:ready});
    nodes.push({node_id:row.node_id,key:row.node_key,depends_on:row.depends_on,current_task:task,
      skipped:row.skipped_task_id===row.current_task_id,eligibility:Object.fromEntries(Object.entries(reasons).map(([action,list])=>[action,!list.length])),reasons});
  }
  const {results:history}=await DB.prepare('SELECT * FROM task_operations WHERE chain_id=? ORDER BY created_at,request_id').bind(id).all();
  const completed=nodes.every(n=>n.skipped||n.current_task.status==='COMPLETED');
  const blocked=nodes.some(n=>n.eligibility.claim)?[]:[...new Map(nodes.flatMap(n=>n.reasons.claim).map(reason=>[reason.code,reason])).values()];
  return {chain_id:chain.chain_id,name:chain.name,created_at:chain.created_at,status:chain.stopped_at?'STOPPED':completed?'COMPLETED':'ACTIVE',
    ...(chain.serial_pc?{serial_pc:true}:{}),
    ...(chain.temporary_registration===1?{temporary_registration:true}:{}),
    held_count:held,nodes,history:history.map(publicOperation),blocked_reasons:blocked};
}
async function createChain(body,DB,readTasks,ownerId,fromBrowser){
  if(!fields(body,['nodes'],['name','submission_id','temporary_registration','serial_pc'])||!Array.isArray(body.nodes)||!body.nodes.length
    ||(body.temporary_registration!==undefined&&typeof body.temporary_registration!=='boolean')
    ||(body.name!==undefined&&(typeof body.name!=='string'||!body.name.trim()||body.name.length>100)))return fail(400,'INVALID_CHAIN','任务链内容无效');
  const temporary=body.temporary_registration===true;
  const serial=body.serial_pc===true;
  if(body.serial_pc!==undefined&&(typeof body.serial_pc!=='boolean'||serial&&temporary))return fail(400,'INVALID_CHAIN','串行电脑任务链参数无效');
  if(!temporary&&!serial&&body.nodes.length>MAX_TEMPLATE_NODES)return fail(400,'INVALID_CHAIN','任务模板最多五个节点');
  const submissionId=body.submission_id;
  if((fromBrowser||temporary||serial||submissionId!==undefined)&&!isSubmissionId(submissionId))return fail(400,'INVALID_SUBMISSION_ID','请先获取有效的任务提交号');
  if(fromBrowser&&(temporary||serial))return fail(400,'INVALID_CHAIN','网页只能新建普通电脑任务链');
  const keys=new Set(body.nodes.map(n=>n?.key));
  if(keys.size!==body.nodes.length)return fail(400,'INVALID_CHAIN','节点key必须唯一');
  const nodes=[];
  for(const node of body.nodes){
    if(!fields(node,['key','type','target_device_id','params'],['depends_on','deadline_at'])||!validId(node.key)||typeof node.type!=='string'||!object(node.params)
      ||(node.depends_on!=null&&(!keys.has(node.depends_on)||node.depends_on===node.key)))return fail(400,'INVALID_CHAIN','节点或前置关系无效');
    let deadline;try{deadline=normalizeDeadline(node.deadline_at);}catch{return fail(400,'INVALID_DEADLINE','截止时间必须明确时区');}
    const previous=nodes.at(-1)?.key??null;
    if(serial&&Object.hasOwn(node,'depends_on')&&node.depends_on!==previous)return fail(400,'INVALID_CHAIN','串行节点必须依赖紧邻前项');
    nodes.push({...node,depends_on:serial?previous:node.depends_on??null,deadline_at:deadline});
  }
  const name=body.name?.trim()||'任务组';
  const deviceId=nodes.find(node=>node.target_device_id)?.target_device_id;
  let fingerprint;
  if(submissionId!==undefined){
    let requestJson;
    try{requestJson=encodeJson(temporary?{name,nodes,temporary_registration:true}:serial?{name,nodes,serial_pc:true}:{name,nodes});}
    catch{return fail(400,'INVALID_PARAMS','参数必须为有效JSON');}
    const bytes=new TextEncoder().encode(requestJson);
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    fingerprint=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  async function replay(){
    const saved=await DB.prepare(`SELECT c.submission_fingerprint,c.temporary_registration,t.task_id
      FROM task_submissions s
      LEFT JOIN chains c ON c.chain_id=s.submission_id
      LEFT JOIN tasks t ON t.submission_id=s.submission_id
      WHERE s.submission_id=? AND s.owner_id=?`).bind(submissionId,ownerId).first();
    if(!saved||saved.task_id)return fail(409,'SUBMISSION_UNAVAILABLE','提交号不可用于本次任务链');
    if(!saved.submission_fingerprint)return null;
    if(saved.submission_fingerprint!==fingerprint)return fail(409,'SUBMISSION_CONFLICT','该提交号已用于不同的任务链');
    if(temporary&&saved.temporary_registration===0)await DB.prepare(
      'UPDATE chains SET temporary_registration=1 WHERE chain_id=? AND submission_fingerprint=? AND temporary_registration=0',
    ).bind(submissionId,fingerprint).run();
    return reply(await readChain(DB,submissionId,deviceId,readTasks));
  }
  if(submissionId!==undefined){
    const prior=await replay();
    if(prior)return prior;
  }
  const types=encodeJson([...new Set(nodes.map(node=>node.type))]);
  const {results:definitions}=await DB.prepare('SELECT * FROM tasklist WHERE type IN (SELECT value FROM json_each(?))')
    .bind(types).all();
  const definitionByType=new Map(definitions.map(definition=>[definition.type,definition]));
  const prepared=[];
  for(const node of nodes){
    if(node.type==='disk.query')return fail(409,'TYPE_PAUSED','具体任务已暂停');
    const definition=definitionByType.get(node.type);
    if(!definition)return fail(404,'TYPE_NOT_FOUND','任务类型不存在');
    let checked;try{checked=validateParameters(JSON.parse(definition.parameter_spec_json),node.params);}catch{return fail(500,'TYPE_CONFIGURATION_ERROR','类型定义无效');}
    if(checked.configuration)return fail(500,'TYPE_CONFIGURATION_ERROR','类型定义无效');
    if(!checked.valid)return fail(400,'INVALID_PARAMS','参数不符合定义');
    if(serial&&definition.executor!=='pc')return fail(400,'INVALID_TARGET','串行电脑任务链只接受电脑任务');
    if(temporary&&definition.executor!=='cloud')return fail(400,'INVALID_TARGET','临时登记只接受云端任务');
    if(fromBrowser&&definition.executor!=='pc')return fail(400,'INVALID_TARGET','请选择电脑任务模板');
    if(definition.executor==='pc'){
      if(node.target_device_id!=='all'&&(!PC_ID_PATTERN.test(node.target_device_id??'')||!await DB.prepare('SELECT device_id FROM devices WHERE device_id=?').bind(node.target_device_id??'').first()))return fail(400,'INVALID_TARGET','目标必须为已登记PC');
    }else if(node.target_device_id!==null)return fail(400,'INVALID_TARGET','云任务目标必须为空');
    prepared.push({...node,node_id:crypto.randomUUID(),task_id:crypto.randomUUID()});
  }
  const nodesByKey=new Map(prepared.map(node=>[node.key,node]));
  const validated=new Set();
  for(const node of prepared){
    const path=new Set();
    for(let cursor=node;cursor&&!validated.has(cursor.key);cursor=nodesByKey.get(cursor.depends_on)){
      if(path.has(cursor.key))return fail(400,'CYCLIC_CHAIN','前置关系不能循环');
      path.add(cursor.key);
    }
    for(const key of path)validated.add(key);
  }
  const id=submissionId??crypto.randomUUID(),at=new Date().toISOString();
  // 同一提交号即链主键。签发人与占用检查和节点创建同批提交。
  const insert=submissionId===undefined
    ? DB.prepare('INSERT INTO chains(chain_id,name,created_at) VALUES(?,?,?)').bind(id,name,at)
    : DB.prepare(`INSERT INTO chains(chain_id,name,created_at,submission_fingerprint,temporary_registration,serial_pc)
        VALUES ((SELECT s.submission_id FROM task_submissions s WHERE s.submission_id=? AND s.owner_id=?
          AND NOT EXISTS (SELECT 1 FROM tasks WHERE submission_id=s.submission_id)),?,?,?,?,?)`)
      .bind(id,ownerId,name,at,fingerprint,temporary?1:0,serial?1:0);
  const statements=[insert];
  for(const node of prepared)statements.push(DB.prepare("INSERT INTO tasks(task_id,type,target_device_id,dispatch_all,params_json,status,created_at,deadline_at) VALUES(?,?,?,?,?,'PENDING',?,?)").bind(node.task_id,node.type,node.target_device_id==='all'?null:node.target_device_id,Number(node.target_device_id==='all'),encodeJson(node.params),at,node.deadline_at));
  for(const [i,node] of prepared.entries())statements.push(DB.prepare('INSERT INTO chain_nodes(node_id,chain_id,node_key,position,current_task_id) VALUES(?,?,?,?,?)').bind(node.node_id,id,node.key,i,node.task_id));
  for(const node of prepared){
    if(node.depends_on)statements.push(DB.prepare('UPDATE chain_nodes SET depends_on=? WHERE node_id=?').bind(nodesByKey.get(node.depends_on).node_id,node.node_id));
    statements.push(DB.prepare('UPDATE tasks SET chain_node_id=? WHERE task_id=?').bind(node.node_id,node.task_id));
  }
  try{
    await DB.batch(statements);
  }catch(error){
    if(submissionId!==undefined){
      const prior=await replay();
      if(prior)return prior;
    }
    throw error;
  }
  return reply(await readChain(DB,id,deviceId,readTasks),201);
}
async function operationReceipt(DB,id,body,chainId,readTasks){
  const row=await DB.prepare('SELECT * FROM task_operations WHERE request_id=?').bind(id).first();
  if(!row)return null;
  if(row.chain_id!==chainId||row.request_json!==encodeJson(body))return fail(409,'OPERATION_CONFLICT','请求标识已用于不同操作');
  const task=row.new_task_id&&row.to_device_id?(await readTasks(DB,[row.new_task_id])).get(row.new_task_id):null;
  return reply({acknowledged:true,operation:publicOperation(row),claimReceipt:task?{request_id:id,task}:null,
    chain:await readChain(DB,chainId,body.device_id,readTasks)});
}
function ownsRegistration(DB,id,ownerId){
  return DB.prepare('SELECT 1 FROM task_submissions WHERE submission_id=? AND owner_id=?').bind(id,ownerId).first();
}
const browserChainOwner = "COALESCE((SELECT s.owner_id=? FROM task_submissions s WHERE s.submission_id=c.chain_id),c.temporary_registration=0)";
const chainStatusSQL = `CASE WHEN c.stopped_at IS NOT NULL THEN 'STOPPED'
  WHEN NOT EXISTS(SELECT 1 FROM chain_nodes n JOIN tasks t ON t.task_id=n.current_task_id WHERE n.chain_id=c.chain_id
    AND t.status<>'COMPLETED' AND (n.skipped_task_id IS NULL OR n.skipped_task_id<>n.current_task_id))
  THEN 'COMPLETED' ELSE 'ACTIVE' END`;
async function browserChains(url,DB,ownerId){
  const params=url.searchParams;
  const status=params.get('status');
  const after=params.get('after');
  if([...params.keys()].some(key=>!['after','status','device_id'].includes(key)||params.getAll(key).length!==1)
    ||after!==null&&!validId(after)||status!==null&&!['ACTIVE','COMPLETED'].includes(status)){
    return fail(400,'INVALID_QUERY','无效的任务链筛选或分页参数');
  }
  const cursor=after===null?null:await DB.prepare(`SELECT c.created_at FROM chains c WHERE ${browserChainOwner} AND c.chain_id=?`).bind(ownerId,after).first();
  if(after&&!cursor)return fail(400,'INVALID_CURSOR','分页位置已失效，请刷新列表');
  const {results}=await DB.prepare(`WITH matching AS (
      SELECT c.chain_id,c.name,c.created_at,${chainStatusSQL} status FROM chains c WHERE ${browserChainOwner}
        AND (? IS NULL OR (c.created_at,c.chain_id)<(?,?))
    ) SELECT * FROM matching WHERE (? IS NULL OR status=?) ORDER BY created_at DESC,chain_id DESC LIMIT 21`).bind(
    ownerId,cursor?.created_at??null,cursor?.created_at??null,after,status,status).all();
  const chains=results.slice(0,20);
  return reply({chains,next_after:results.length>20?chains.at(-1).chain_id:null});
}
export async function handleChainRequest(request,DB,readTasks,ownerId,{fromBrowser=false}={}){
  const url=new URL(request.url),path=url.pathname;
  if(path!=='/api/chains'&&!path.startsWith('/api/chains/'))return null;
  if(path==='/api/chains'){
    if(request.method==='POST'){let body;try{body=await request.json();}catch{return fail(400,'INVALID_JSON','请求必须为JSON');}return createChain(body,DB,readTasks,ownerId,fromBrowser);}
    if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','仅支持GET/POST');
    if(fromBrowser)return browserChains(url,DB,ownerId);
    const after=url.searchParams.get('after')??'';
    if((after&&!validId(after))||[...url.searchParams.keys()].some(k=>!['after','device_id'].includes(k)))return fail(400,'INVALID_QUERY','分页参数无效');
    const {results}=await DB.prepare(`SELECT c.chain_id,c.name,c.created_at,${chainStatusSQL} status
      FROM chains c WHERE c.chain_id>? AND (c.temporary_registration=0 OR EXISTS(
        SELECT 1 FROM task_submissions s WHERE s.submission_id=c.chain_id AND s.owner_id=?))
      ORDER BY c.chain_id LIMIT 21`).bind(after,ownerId).all();
    const chains=results.slice(0,20);
    return reply({chains,next_after:results.length>20?chains.at(-1).chain_id:null});
  }
  const match=/^\/api\/chains\/([a-zA-Z0-9_-]+)(?:\/(stop)|\/nodes\/([a-zA-Z0-9_-]+)\/decision)?$/.exec(path);
  if(!match)return fail(404,'NOT_FOUND','接口不存在');
  const id=match[1];
  if(fromBrowser&&!await DB.prepare(`SELECT 1 FROM chains c WHERE ${browserChainOwner} AND c.chain_id=?`).bind(ownerId,id).first()){
    return fail(404,'CHAIN_NOT_FOUND','任务组不存在');
  }
  if(!match[2]&&!match[3]){
    if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','仅支持GET');
    const chain=await readChain(DB,id,url.searchParams.get('device_id'),readTasks);
    if(!chain||chain.temporary_registration&&!await ownsRegistration(DB,id,ownerId))return fail(404,'CHAIN_NOT_FOUND','任务组不存在');
    return reply(chain);
  }
  if(request.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','仅支持POST');
  let body;try{body=await request.json();}catch{return fail(400,'INVALID_JSON','请求必须为JSON');}
  const stop=Boolean(match[2]);
  const chain=await DB.prepare('SELECT * FROM chains WHERE chain_id=?').bind(id).first();
  const registration=chain?.temporary_registration===1;
  if(registration&&!await ownsRegistration(DB,id,ownerId))return fail(404,'CHAIN_NOT_FOUND','任务组不存在');
  const required=stop?['request_id']:['action','expected_task_id','request_id'];
  const needsDevice=!registration&&(!fromBrowser||!stop);
  if(needsDevice)required.push('device_id');
  if(!fields(body,required,stop?[]:['new_task_id'])||!validId(body.request_id)
    ||(needsDevice&&(!PC_ID_PATTERN.test(body.device_id??'')
      ||!await DB.prepare('SELECT device_id FROM devices WHERE device_id=?').bind(body.device_id??'').first())))return fail(400,'INVALID_DECISION','决定字段或终端无效');
  if(!stop&&(!['skip','continue','force'].includes(body.action)||registration&&body.action==='force'||!validId(body.expected_task_id)
    ||(body.action==='skip'?body.new_task_id!==undefined:!validId(body.new_task_id)||body.new_task_id===body.expected_task_id)))return fail(400,'INVALID_DECISION','决定或新轮ID无效');
  const cached=await operationReceipt(DB,body.request_id,body,id,readTasks);if(cached)return cached;
  if(!chain)return fail(404,'CHAIN_NOT_FOUND','任务组不存在');
  const at=new Date().toISOString();
  if(stop){
    try{
      await DB.batch([
        DB.prepare("INSERT INTO task_operations(request_id,chain_id,action,to_device_id,created_at,request_json) VALUES(?,?,'stop',?,?,?)").bind(body.request_id,id,body.device_id??null,at,encodeJson(body)),
        DB.prepare('UPDATE chains SET stopped_at=COALESCE(stopped_at,?) WHERE chain_id=?').bind(at,id),
      ]);
    }catch{return await operationReceipt(DB,body.request_id,body,id,readTasks)||fail(409,'OPERATION_CONFLICT','停止操作冲突');}
    return operationReceipt(DB,body.request_id,body,id,readTasks);
  }
  const node=await DB.prepare('SELECT * FROM chain_nodes WHERE node_id=? AND chain_id=?').bind(match[3],id).first();
  if(!node||node.current_task_id!==body.expected_task_id)return fail(409,'OLD_ROUND','节点当前轮已经变化');
  const task=(await readTasks(DB,[node.current_task_id])).get(node.current_task_id);
  if(registration){
    if(chain.stopped_at||task.status!=='FAILED'||node.skipped_task_id===task.task_id){
      return fail(409,'REGISTRATION_BLOCKED','只能处理当前尚未跳过的失败登记');
    }
  }else{
    const reasons=await eligibility(DB,task,body.device_id,body.action);
    if(reasons.length)return fail(409,reasons[0].code,reasons[0].message);
  }
  const statements=[];
  const operationInsert=(condition,params)=>DB.prepare(`INSERT INTO task_operations(request_id,chain_id,action,old_task_id,new_task_id,from_device_id,to_device_id,created_at,request_json)
    SELECT ?,?,?,?,?,?,?,?,? FROM tasks t WHERE t.task_id=? AND ${condition}`)
    .bind(body.request_id,id,body.action,task.task_id,body.new_task_id??null,task.target_device_id,body.device_id??null,at,encodeJson(body),task.task_id,...params);
  const failedCurrent=`t.status='FAILED' AND ${ancestorsReadySQL}
    AND EXISTS(SELECT 1 FROM chain_nodes n JOIN chains c ON c.chain_id=n.chain_id
      WHERE n.node_id=t.chain_node_id AND n.current_task_id=t.task_id AND c.stopped_at IS NULL
        AND n.skipped_task_id IS NOT t.task_id)`;
  if(body.action==='skip'){
    statements.push(operationInsert(failedCurrent,[]));
    statements.push(DB.prepare('UPDATE chain_nodes SET skipped_task_id=current_task_id WHERE node_id=? AND current_task_id=? AND EXISTS(SELECT 1 FROM task_operations WHERE request_id=?)').bind(node.node_id,task.task_id,body.request_id));
  }else if(registration){
    const [cutoff]=gateBindings(null);
    statements.push(DB.prepare(`INSERT INTO tasks(task_id,type,params_json,status,created_at,deadline_at,chain_node_id)
      SELECT ?,t.type,t.params_json,'PENDING',?,t.deadline_at,t.chain_node_id FROM tasks t
      WHERE t.task_id=? AND (t.deadline_at IS NULL OR t.deadline_at>?) AND ${failedCurrent}`)
      .bind(body.new_task_id,at,task.task_id,cutoff));
    statements.push(operationInsert(`${failedCurrent} AND (t.deadline_at IS NULL OR t.deadline_at>?)
      AND EXISTS(SELECT 1 FROM tasks fresh WHERE fresh.task_id=? AND fresh.chain_node_id=t.chain_node_id)`,
    [cutoff,body.new_task_id]));
    statements.push(DB.prepare('UPDATE tasks SET superseded_by_task_id=? WHERE task_id=? AND EXISTS(SELECT 1 FROM task_operations WHERE request_id=?)')
      .bind(body.new_task_id,task.task_id,body.request_id));
    statements.push(DB.prepare('UPDATE chain_nodes SET current_task_id=?,skipped_task_id=NULL WHERE node_id=? AND current_task_id=? AND EXISTS(SELECT 1 FROM task_operations WHERE request_id=?)')
      .bind(body.new_task_id,node.node_id,task.task_id,body.request_id));
  }else{
    const status=body.action==='continue'?"t.status='FAILED'":"t.status IN ('RUNNING','COMPLETED')";
    statements.push(DB.prepare(`INSERT INTO tasks(task_id,type,target_device_id,dispatch_all,params_json,status,created_at,deadline_at,chain_node_id,claim_request_id)
      SELECT ?,t.type,?,t.dispatch_all,t.params_json,'RUNNING',?,t.deadline_at,t.chain_node_id,? FROM tasks t
      WHERE t.task_id=? AND ${status} AND ${gateSQL({replacement:true})}`)
      .bind(body.new_task_id,body.device_id,at,body.request_id,task.task_id,...gateBindings(body.device_id)));
    statements.push(operationInsert(`EXISTS(SELECT 1 FROM tasks fresh WHERE fresh.task_id=? AND fresh.claim_request_id=?)`,[body.new_task_id,body.request_id]));
    statements.push(DB.prepare(`INSERT INTO task_activity(task_id,updated_at,event,progress_message)
      SELECT task_id,?,'claim',NULL FROM tasks WHERE task_id=? AND claim_request_id=?`).bind(at,body.new_task_id,body.request_id));
    statements.push(DB.prepare("UPDATE tasks SET status=CASE WHEN status='RUNNING' THEN 'CANCELLED' ELSE status END,superseded_by_task_id=? WHERE task_id=? AND EXISTS(SELECT 1 FROM task_operations WHERE request_id=?)").bind(body.new_task_id,task.task_id,body.request_id));
    statements.push(DB.prepare('UPDATE chain_nodes SET current_task_id=?,skipped_task_id=NULL WHERE node_id=? AND current_task_id=? AND EXISTS(SELECT 1 FROM task_operations WHERE request_id=?)').bind(body.new_task_id,node.node_id,task.task_id,body.request_id));
  }
  try{await DB.batch(statements);}catch{return await operationReceipt(DB,body.request_id,body,id,readTasks)||fail(409,'OPERATION_CONFLICT','操作冲突，未提交部分修改');}
  return await operationReceipt(DB,body.request_id,body,id,readTasks)||fail(409,'CLAIM_BLOCKED','领取条件已变化，未修改任务');
}
