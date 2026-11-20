import { PC_ID_PATTERN } from './api.mjs';
import {gateSQL,gateBindings} from '../chains/rules.mjs';

const reply = (value, status = 200, headers = {}) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
});
const fail = (status, code, message) => reply({ error: { code, message } }, status);

// 仅从已认证入口调用；只读任务分配，不用于设备心跳。
export async function handlePendingRequest(request, DB) {
  const url = new URL(request.url);
  const match = /^\/api\/devices\/([^/]+)\/pending$/.exec(url.pathname);
  if (!match) return null;
  if (request.method !== 'GET') return reply({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405, { Allow: 'GET' });
  if (!PC_ID_PATTERN.test(match[1])) return fail(400, 'INVALID_DEVICE', '必须指定固定PC标识');
  const after = url.searchParams.get('after');
  if ([...url.searchParams.keys()].some(key => key !== 'after') || url.searchParams.getAll('after').length > 1
      || (after !== null && !/^[a-zA-Z0-9_-]{1,128}$/.test(after))) return fail(400, 'INVALID_CURSOR', '任务游标无效');
  if (!await DB.prepare('SELECT device_id FROM devices WHERE device_id=?').bind(match[1]).first()) {
    return fail(404, 'DEVICE_NOT_FOUND', '设备不存在');
  }
  const { results } = await DB.prepare(`SELECT t.task_id,t.type FROM tasks t JOIN tasklist l ON l.type=t.type
    WHERE (t.target_device_id=? OR (t.dispatch_all=1 AND t.target_device_id IS NULL)) AND t.status='PENDING' AND l.executor='pc' AND t.type<>'disk.query'
      AND ${gateSQL()} AND t.task_id>?
    ORDER BY t.task_id LIMIT 51`).bind(match[1],...gateBindings(match[1]),after ?? '').all();
  const tasks = results.slice(0, 50);
  return reply({ tasks, next_after: results.length > 50 ? tasks.at(-1).task_id : null });
}
