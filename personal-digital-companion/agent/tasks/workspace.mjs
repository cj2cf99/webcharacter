const statuses = new Set(['ACTIVE', 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED']);
const pageSize = 30;
const fromTasks = `FROM tasks t JOIN tasklist l ON l.type=t.type
  LEFT JOIN devices d ON d.device_id=t.target_device_id
  LEFT JOIN chain_nodes n ON n.node_id=t.chain_node_id
  LEFT JOIN chains c ON c.chain_id=n.chain_id
  LEFT JOIN task_submissions s ON s.submission_id=COALESCE(t.submission_id,n.chain_id)`;
// Old unowned rows were written by the same single-account service.
const owned = 'COALESCE(s.owner_id=?, t.submission_id IS NULL AND COALESCE(c.temporary_registration,0)=0)';
const activeTask = "(t.status='RUNNING' OR (t.status='PENDING' AND c.stopped_at IS NULL))";
const reply = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store'}});

export async function isWorkspaceTaskVisible(DB, ownerId, id) {
  return Boolean(await DB.prepare(`SELECT t.task_id ${fromTasks} WHERE ${owned} AND t.task_id=?`).bind(ownerId, id).first());
}

export async function taskWorkspaceList(request, DB, ownerId) {
  const query = new URL(request.url).searchParams;
  const status = query.get('status');
  const after = query.get('after');
  if ([...query.keys()].some(name => !['status','after'].includes(name) || query.getAll(name).length !== 1) ||
      status !== null && !statuses.has(status) || after !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(after)) {
    return reply({error:{code:'INVALID_QUERY', message:'无效的任务筛选或分页参数'}}, 400);
  }
  const cursor = after === null ? null : await DB.prepare(
    `SELECT t.created_at ${fromTasks} WHERE ${owned} AND t.chain_node_id IS NULL AND t.task_id=?`).bind(ownerId, after).first();
  if (after && !cursor) return reply({error:{code:'INVALID_CURSOR', message:'分页位置已失效，请刷新列表'}}, 400);
  const {results} = await DB.prepare(`SELECT t.task_id,t.type,l.name,l.executor,t.status,t.created_at,
    n.chain_id,c.name AS chain_name,c.stopped_at IS NOT NULL AS chain_stopped,
    CASE WHEN t.dispatch_all=1 AND t.target_device_id IS NULL THEN 'all' ELSE t.target_device_id END AS target_device_id,
    COALESCE(d.alias,d.computer_name,d.device_id) AS device_name
    ${fromTasks} WHERE ${owned} AND t.chain_node_id IS NULL AND (${status === 'ACTIVE' ? activeTask : '? IS NULL OR t.status=?'})
      AND (? IS NULL OR (t.created_at,t.task_id)<(?,?))
    ORDER BY t.created_at DESC,t.task_id DESC LIMIT ?`).bind(ownerId,
    ...(status === 'ACTIVE' ? [] : [status,status]),cursor?.created_at ?? null,cursor?.created_at ?? null,after,pageSize+1).all();
  const tasks = results.slice(0,pageSize);
  return reply({tasks,next_after:results.length>pageSize ? tasks.at(-1).task_id : null});
}

export async function taskTemplateWorkspace(request, DB, ownerId) {
  const query = new URL(request.url).searchParams;
  const status = query.get('status');
  const after = query.get('after') ?? '';
  if ([...query.keys()].some(name => !['status','after'].includes(name) || query.getAll(name).length !== 1) ||
      status !== null && !['ACTIVE','COMPLETED'].includes(status) || !/^[A-Za-z0-9_.-]{0,128}$/.test(after)) {
    return reply({error:{code:'INVALID_QUERY', message:'无效的模板筛选或分页参数'}},400);
  }
  const usageFilter = status === 'ACTIVE' ? 'AND u.active_count > 0' : status === 'COMPLETED' ? 'AND u.completed_count > 0' : '';
  const {results} = await DB.prepare(`WITH usage AS (
      SELECT t.type, SUM(${activeTask}) active_count, SUM(t.status='COMPLETED') completed_count
      ${fromTasks} WHERE ${owned} AND t.status IN ('PENDING','RUNNING','COMPLETED') GROUP BY t.type
    ) SELECT l.type,l.name,l.description,l.executor,l.parameter_spec_json,
      COALESCE(u.active_count,0) active_count, COALESCE(u.completed_count,0) completed_count
      FROM tasklist l LEFT JOIN usage u ON u.type=l.type
      WHERE l.type<>'disk.query' AND l.type>? ${usageFilter} ORDER BY l.type LIMIT ?`).bind(ownerId,after,pageSize+1).all();
  const tasklist = results.slice(0,pageSize).map(({parameter_spec_json,...row}) => ({
    ...row,parameter_spec:JSON.parse(parameter_spec_json),standalone:row.executor==='pc',
  }));
  return reply({tasklist,next_after:results.length>pageSize ? tasklist.at(-1).type : null});
}
