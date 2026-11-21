import { gateSQL, gateBindings } from '../chains/rules.mjs';

const reply = (value, status = 200, headers = {}) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
});
const fail = (status, code, message) => reply({ error: { code, message } }, status);

export async function deviceTaskList(request, DB, deviceId) {
  if (request.method !== 'GET') return reply({ error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持GET' } }, 405, { Allow: 'GET' });
  const query = new URL(request.url).searchParams;
  const rawOffset = query.get('offset') ?? '0';
  const scope = query.get('scope');
  if ([...query.keys()].some(key => !['offset','scope'].includes(key) || query.getAll(key).length > 1)
    || !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(Number(rawOffset))
    || (scope !== null && scope !== 'standalone')) {
    return fail(400, 'INVALID_OFFSET', 'offset必须是非负安全整数，scope仅支持standalone');
  }
  const offset = Number(rawOffset);
  const row = await DB.prepare('SELECT device_id, computer_name, alias, created_at FROM devices WHERE device_id = ?').bind(deviceId).first();
  if (!row) return fail(404, 'DEVICE_NOT_FOUND', '设备不存在');
  const { results } = await DB.prepare(`SELECT t.task_id, t.type, l.name, t.status, t.attempt_count,
      t.created_at, t.deadline_at, a.updated_at, a.progress_message,
      CASE WHEN t.status='PENDING' AND l.executor='pc' AND ${gateSQL()} THEN 1 ELSE 0 END claimable
    FROM tasks t JOIN tasklist l ON l.type = t.type LEFT JOIN task_activity a ON a.task_id = t.task_id
    WHERE (t.target_device_id = ? OR (t.dispatch_all=1 AND t.target_device_id IS NULL AND t.status='PENDING' AND l.executor='pc' AND EXISTS(SELECT 1 FROM devices d WHERE d.device_id=? AND d.device_id LIKE 'pc-%')))
      AND (?=0 OR t.chain_node_id IS NULL)
    ORDER BY CASE WHEN t.status IN ('PENDING', 'RUNNING') THEN 0 ELSE 1 END,
      COALESCE(a.updated_at, t.created_at) DESC, t.task_id ASC LIMIT 51 OFFSET ?`)
    .bind(...gateBindings(deviceId), deviceId, deviceId, Number(scope==='standalone'), offset).all();
  return reply({ device: { ...row, display_name: row.alias || row.device_id },
    tasks: results.slice(0, 50).map(({claimable,...task}) => ({ ...task, can_claim: Boolean(claimable) })),
    next_offset: results.length > 50 ? offset + 50 : null });
}
