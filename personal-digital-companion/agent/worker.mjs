import { handleDeviceRequest, PC_ID_PATTERN } from './devices/api.mjs';
import { handleTerminalRequest } from './terminals/api.mjs';
import { validateParameters } from './tasks/parameters.mjs';
import { handleTaskAction } from './tasks/actions.mjs';
import { normalizeDeadline } from './tasks/deadline.mjs';
import { handleRecovery } from './tasks/recover.mjs';
import {runProviderChain} from './assistant/provider-chain.mjs';
import {handleAssistantMessage} from './assistant/message.mjs';
import {planRegistration} from './assistant/registration-plan.mjs';
import {handleWeather} from './weather/api.mjs';
import {createBindingAiClient,createBindingVisionClient} from './assistant/cloudflare.mjs';
import {handleScreenQuestion} from './assistant/screen-question.mjs';
import {screenError} from './assistant/screen-errors.mjs';
import {handlePendingRequest} from './devices/pending.mjs';
import {handleChainRequest} from './chains/api.mjs';
import {gateSQL,gateBindings} from './chains/rules.mjs';
import {encodeJson} from './execution/json.mjs';
import {issueTaskSubmission,isSubmissionId} from './tasks/submissions.mjs';
import {authorizeDailyLogToken,handleDailyLogs} from './assistant/daily-logs.mjs';
import {executeCloudRegistration} from './tasks/hu-shi-execution.mjs';

// 单用户开发Bearer边界；本轮不接入独立设备凭据或心跳。
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
});
const error = (status, code, message, headers) => json({ error: { code, message } }, status, headers);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value, keys) => Object.keys(value).every(key => keys.includes(key));

function typeView(row) {
  const { parameter_spec_json, ...rest } = row;
  return { ...rest, parameter_spec: JSON.parse(parameter_spec_json) };
}

function taskView(row) {
  return {
    task_id: row.task_id, type: row.type, target_device_id: row.target_device_id,
    submission_id: row.submission_id ?? null,
    params: JSON.parse(row.params_json), status: row.status, attempt_count: row.attempt_count,
    created_at: row.created_at, result: row.result_json === null ? null : JSON.parse(row.result_json),
    deadline_at: row.deadline_at,
    error: row.error,
    claim_request_id:row.claim_request_id,superseded_by_task_id:row.superseded_by_task_id,
    chain:row.chain_id?{chain_id:row.chain_id,node_id:row.chain_node_id,current:row.current_task_id===row.task_id,current_task_id:row.current_task_id,
      stopped:row.stopped_at!==null,skipped:row.skipped_task_id===row.current_task_id}:null,
    definition: {
      name: row.name, description: row.description, executor: row.executor,
      parameter_spec: JSON.parse(row.parameter_spec_json), procedure: row.procedure, report_spec: row.report_spec,
    },
    target_device: row.target_device_id === null ? null : {
      device_id: row.target_device_id, computer_name: row.computer_name,
      alias: row.alias, display_name: row.alias || row.target_device_id,
    },
  };
}

const taskQuery = `SELECT t.*, l.name, l.description, l.executor, l.parameter_spec_json,
  l.procedure, l.report_spec, d.computer_name, d.alias,n.chain_id,n.current_task_id,n.skipped_task_id,c.stopped_at
  FROM tasks t JOIN tasklist l ON l.type = t.type
  LEFT JOIN devices d ON d.device_id = t.target_device_id
  LEFT JOIN chain_nodes n ON n.node_id=t.chain_node_id LEFT JOIN chains c ON c.chain_id=n.chain_id`;

async function readTasks(DB, ids) {
  if (!ids.length) return new Map();
  const filter = 'IN (SELECT value FROM json_each(?))';
  const encodedIds = encodeJson(ids);
  const { results: rows } = await DB.prepare(`${taskQuery} WHERE t.task_id ${filter}`).bind(encodedIds).all();
  if (!rows.length) return new Map();
  const [executions, activity, recoveries, archived] = await Promise.all([
    DB.prepare(`SELECT * FROM executions WHERE task_id ${filter} ORDER BY attempt_no`).bind(encodedIds).all(),
    DB.prepare(`SELECT task_id,updated_at,event,progress_message FROM task_activity WHERE task_id ${filter}`).bind(encodedIds).all(),
    DB.prepare(`SELECT * FROM task_recoveries WHERE task_id ${filter}`).bind(encodedIds).all(),
    rows.some(row => row.superseded_by_task_id)
      ? DB.prepare(`SELECT task_id,report_json FROM archived_task_results WHERE task_id ${filter}`).bind(encodedIds).all()
      : { results: [] },
  ]);
  const executionsByTask = Map.groupBy(executions.results, row => row.task_id);
  const activityByTask = new Map(activity.results.map(({ task_id, ...fields }) => [task_id, fields]));
  const recoveryByTask = new Map(recoveries.results.map(row => [row.task_id, row]));
  const archiveByTask = new Map(archived.results.map(row => [row.task_id, row.report_json]));
  return new Map(await Promise.all(rows.map(async row => {
    const id = row.task_id;
    const recovery = recoveryByTask.get(id);
    const report = row.superseded_by_task_id ? archiveByTask.get(id) : null;
    const claimable = row.status === 'PENDING' && row.executor === 'pc' && await DB
      .prepare(`SELECT t.task_id FROM tasks t WHERE t.task_id=? AND ${gateSQL()}`)
      .bind(id, ...gateBindings(row.target_device_id)).first();
    return [id, {
      ...taskView(row),
      can_claim: Boolean(claimable),
      archived_report: report ? JSON.parse(report) : null,
      activity: activityByTask.get(id) ?? null,
      recovery: recovery ? {
        task_id: id, decision: recovery.decision, replacement_task_id: recovery.replacement_task_id,
        snapshot: JSON.parse(recovery.snapshot_json), decided_at: recovery.decided_at,
      } : null,
      executions: (executionsByTask.get(id) ?? []).map(({ result_json, ...execution }) => ({
        ...execution, result: result_json === null ? null : JSON.parse(result_json),
      })),
    }];
  })));
}

async function readTask(DB, id) {
  return (await readTasks(DB, [id])).get(id) ?? null;
}

async function createTask(request, DB, ownerId) {
  let body;
  try { body = await request.json(); }
  catch { return error(400, 'INVALID_JSON', '请求必须是有效JSON'); }
  if (!isObject(body) || !hasOnly(body, ['type', 'target_device_id', 'params', 'deadline_at', 'submission_id']) ||
      typeof body.type !== 'string' || !body.type || !isObject(body.params)) {
    return error(400, 'INVALID_TASK', '仅接受提交号、任务类型、目标设备、JSON参数及可选截止时间');
  }
  if (!isSubmissionId(body.submission_id)) return error(400, 'INVALID_SUBMISSION_ID', '请先获取有效的任务提交号');
  let deadline;
  try { deadline = normalizeDeadline(body.deadline_at); }
  catch { return error(400, 'INVALID_DEADLINE', '截止时间须为有效且明确时区的ISO时间'); }
  const target = body.target_device_id ?? null;
  let params;
  try { params = encodeJson(body.params); }
  catch { return error(400, 'INVALID_PARAMS', '参数必须为有效JSON'); }
  async function replay() {
    const saved = await DB.prepare(`SELECT t.task_id, t.type, t.target_device_id, t.params_json, t.deadline_at
      FROM tasks t JOIN task_submissions s ON s.submission_id = t.submission_id
      WHERE t.submission_id = ? AND s.owner_id = ?`).bind(body.submission_id, ownerId).first();
    if (!saved) return null;
    if (saved.type !== body.type || saved.target_device_id !== target || saved.deadline_at !== deadline
        || encodeJson(JSON.parse(saved.params_json)) !== params) {
      return error(409, 'SUBMISSION_CONFLICT', '该提交号已用于不同的任务内容');
    }
    return json(await readTask(DB, saved.task_id));
  }
  const existing = await replay();
  if (existing) return existing;
  if (body.type === 'disk.query') return error(409, 'TYPE_PAUSED', '该具体任务已暂停');
  const definition = await DB.prepare('SELECT * FROM tasklist WHERE type = ?').bind(body.type).first();
  if (!definition) return error(404, 'TYPE_NOT_FOUND', '任务类型不存在');
  const checked = validateParameters(JSON.parse(definition.parameter_spec_json), body.params);
  if (checked.configuration) return error(500, 'TYPE_CONFIGURATION_ERROR', '任务类型参数定义无效');
  if (!checked.valid) return error(400, 'INVALID_PARAMS', '参数不符合该任务类型定义');
  if (definition.executor === 'pc') {
    if (typeof target !== 'string' || !target) return error(400, 'TARGET_REQUIRED', 'PC任务必须指定目标设备');
    if (!await DB.prepare('SELECT device_id FROM devices WHERE device_id = ?').bind(target).first()) {
      return error(404, 'DEVICE_NOT_FOUND', '目标设备不存在');
    }
    if (!PC_ID_PATTERN.test(target)) return error(400, 'INVALID_TARGET', '网页终端不能执行PC任务');
  } else if (target !== null) {
    return error(400, 'INVALID_TARGET', '云端任务不能指定PC设备');
  }
  const id = crypto.randomUUID();
  // 此条 SQL 同时检查签发记录和占用提交号。并发不能各写一条。
  const now = Date.now();
  const inserted = await DB.prepare(`INSERT INTO tasks
    (task_id, type, target_device_id, params_json, status, attempt_count, created_at, deadline_at, submission_id)
    SELECT ?, ?, ?, ?, 'PENDING', 0, ?, ?, s.submission_id FROM task_submissions s
    WHERE s.submission_id = ? AND s.owner_id = ?
      AND NOT EXISTS (SELECT 1 FROM chains c WHERE c.chain_id=s.submission_id AND c.submission_fingerprint IS NOT NULL)
    ON CONFLICT(submission_id) DO NOTHING`)
    .bind(id, body.type, target, params, new Date(now).toISOString(), deadline, body.submission_id, ownerId).run();
  if (!inserted.meta.changes) {
    return await replay() ?? error(409, 'SUBMISSION_UNAVAILABLE', '提交号未为当前账户签发');
  }
  return json(await readTask(DB, id), 201);
}

async function authorizeDevelopment(request,env) {
  if(typeof env.API_TOKEN!=='string'||!env.API_TOKEN.trim()||request.headers.get('Authorization')!==`Bearer ${env.API_TOKEN}`)throw Object.assign(new Error('未认证'),{status:401});
  return {ownerId:'development'};
}
export function createWorker({authorize=authorizeDevelopment,createAiClient=createBindingAiClient,createVisionClient=createBindingVisionClient,
  authorizeDailyLogs=authorizeDailyLogToken,writeHuShiEntry,writeRegistrationEntry,readRegistrationReceipt,loadRegistrationCategories,
  weatherOptions,sameOriginWrites=false}={}) {return {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const screen=path==='/api/assistant/screen-question';
    const dailyLogs=path==='/api/daily-logs';
    if (path !== '/api' && !path.startsWith('/api/')) return error(404, 'NOT_FOUND', '接口不存在');
    if(dailyLogs&&url.protocol!=='https:')return error(403,'HTTPS_REQUIRED','每日日志只通过 HTTPS 调用');
    const authorizeRequest=dailyLogs?authorizeDailyLogs:authorize;
    let identity;
    try {
      if(typeof authorizeRequest!=='function')return screen?screenError('AUTH_NOT_CONFIGURED'):error(503,'AUTH_NOT_CONFIGURED','身份验证尚未配置');
      if(screen&&authorize===authorizeDevelopment&&(typeof env?.API_TOKEN!=='string'||!env.API_TOKEN.trim()))return screenError('AUTH_NOT_CONFIGURED');
      identity=await authorizeRequest(request,env);
      if(typeof identity?.ownerId!=='string'||!identity.ownerId)return screen?screenError('UNAUTHORIZED'):error(401,'UNAUTHORIZED','需要有效认证');
    }catch(e){
      if(screen)return screenError(e?.status===401?'UNAUTHORIZED':e?.status===403?'FORBIDDEN':e?.status===503?'AUTH_NOT_CONFIGURED':'INTERNAL_ERROR');
      if(dailyLogs&&e?.status===503)return error(503,'AUTH_NOT_CONFIGURED','日志身份验证尚未配置');
      return error([401,403,503].includes(e?.status)?e.status:401,'UNAUTHORIZED','需要有效认证');
    }
    if(sameOriginWrites&&!['GET','HEAD','OPTIONS'].includes(request.method)
      &&(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return screen?screenError('SAME_ORIGIN_REQUIRED'):error(403,'SAME_ORIGIN_REQUIRED','仅允许同源写请求');
    if(screen){try{return await handleScreenQuestion(request,createVisionClient,env);}catch{return screenError('INTERNAL_ERROR');}}
    try {
      if(path.startsWith('/api/weather/'))return await handleWeather(request,env,weatherOptions);
      if(!env.DB)return error(503,'DATABASE_NOT_CONFIGURED',dailyLogs?'日志数据库尚未配置':'任务数据库尚未配置');
      if(path==='/api/assistant/heartbeat'){
        if(request.method!=='POST')return error(405,'METHOD_NOT_ALLOWED','仅支持 POST',{Allow:'POST'});
        const {value,code,ai}=await runProviderChain({env,ownerId:identity.ownerId,signal:request.signal,heartbeat:true});
        return value?json({...value,ai}):json({error:{code},ai},code==='CANCELLED'?408:503);
      }
      if(dailyLogs)return await handleDailyLogs(request,url,env,identity.ownerId);
      const chainResponse=await handleChainRequest(request,env.DB,readTasks,identity.ownerId);if(chainResponse)return chainResponse;
      if(path==='/api/assistant/message')return await handleAssistantMessage(request,env.DB,createAiClient,env,identity.ownerId);
      if(path==='/api/assistant/recording-plan')return await planRegistration(request,env,identity.ownerId,createAiClient,loadRegistrationCategories);
      const terminalResponse = await handleTerminalRequest(request, env.DB);
      if (terminalResponse) return terminalResponse;
      const pendingResponse=await handlePendingRequest(request,env.DB);
      if(pendingResponse)return pendingResponse;
      const deviceResponse = await handleDeviceRequest(request, env.DB);
      if (deviceResponse) return deviceResponse;
      if (path === '/api/tasklist') {
        if (request.method !== 'GET') return error(405, 'METHOD_NOT_ALLOWED', '仅支持GET', { Allow: 'GET' });
        const { results } = await env.DB.prepare("SELECT * FROM tasklist WHERE type <> 'disk.query' ORDER BY type").all();
        return json({ tasklist: results.map(typeView) });
      }
      if (path === '/api/task-submissions') {
        if (request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED', '仅支持POST', { Allow: 'POST' });
        return json(await issueTaskSubmission(env.DB, identity.ownerId), 201);
      }
      if (path === '/api/tasks') {
        if (request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED', '仅支持POST', { Allow: 'POST' });
        return await createTask(request, env.DB, identity.ownerId);
      }
      const actionMatch = /^\/api\/tasks\/([^/]+)\/(claim|result|progress|cancel|recover|execute|receipt)$/.exec(path);
      if (actionMatch) {
        if (request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED', '仅支持POST', { Allow: 'POST' });
        let id;
        try { id = decodeURIComponent(actionMatch[1]); } catch { return error(400, 'INVALID_TASK_ID', '任务标识无效'); }
        if (actionMatch[2] === 'recover') return await handleRecovery(request, env.DB, id, readTask);
        if (actionMatch[2] === 'execute' || actionMatch[2] === 'receipt') {
          return await executeCloudRegistration({request,env,taskId:id,ownerId:identity.ownerId,readTask,
            writeEntry:writeHuShiEntry,writeRegistrationEntry,readRegistrationReceipt,receiptOnly:actionMatch[2]==='receipt'});
        }
        return await handleTaskAction(request, env.DB, id, actionMatch[2], readTask);
      }
      const taskMatch = /^\/api\/tasks\/([^/]+)$/.exec(path);
      if (taskMatch) {
        if (request.method !== 'GET') return error(405, 'METHOD_NOT_ALLOWED', '仅支持GET', { Allow: 'GET' });
        const task = await readTask(env.DB, decodeURIComponent(taskMatch[1]));
        return task ? json(task) : error(404, 'TASK_NOT_FOUND', '任务不存在');
      }
      return error(404, 'NOT_FOUND', '接口不存在');
    } catch {
      // 不返回SQL、令牌或内部异常；结果未知时调用方不能视为任务已执行。
      return error(500, 'INTERNAL_ERROR', '处理失败，请稍后重试');
    }
  },
};}
export default createWorker();
