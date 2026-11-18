import { deviceTaskList } from './task-list.mjs';

export const PC_ID_PATTERN = /^pc-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TERMINAL_ID_PATTERN = /^(?:pc|web)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status) => reply({ error: message }, status);
export const presentDevice = row => ({ ...row, display_name: row.alias || row.device_id });
const present = presentDevice;

function validName(value, max) {
  return typeof value === 'string' && value.trim().length > 0
    && [...value.trim()].length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

async function body(request, field) {
  const value = await request.json();
  if (!value || Array.isArray(value) || typeof value !== 'object'
      || Object.keys(value).length !== 1 || !Object.hasOwn(value, field)) throw new Error('请求字段不正确');
  return value[field];
}

// 只能从已通过身份认证的Worker入口调用；设备ID不是凭据。
export async function handleDeviceRequest(request, DB) {
  const path = new URL(request.url).pathname;
  if (path !== '/api/devices' && !path.startsWith('/api/devices/')) return null;
  if (path === '/api/devices') {
    if (request.method !== 'GET') return fail('不支持的方法', 405);
    const { results } = await DB.prepare(`SELECT d.device_id, d.computer_name, d.alias, d.created_at,
        COALESCE(s.active_count, 0) AS active_count, s.last_task_update
      FROM devices d LEFT JOIN (
        SELECT t.target_device_id, SUM(CASE WHEN t.status IN ('PENDING', 'RUNNING') THEN 1 ELSE 0 END) AS active_count,
          MAX(a.updated_at) AS last_task_update
        FROM tasks t LEFT JOIN task_activity a ON a.task_id = t.task_id GROUP BY t.target_device_id
      ) s ON s.target_device_id = d.device_id ORDER BY d.created_at, d.device_id`).all();
    return reply({ devices: results.map(({ active_count, last_task_update, ...row }) => ({
      ...present(row), task_summary: { active_count, last_task_update },
    })) });
  }
  const taskListMatch = /^\/api\/devices\/([^/]+)\/tasks$/.exec(path);
  if (taskListMatch) {
    if (!TERMINAL_ID_PATTERN.test(taskListMatch[1])) return fail('设备标识格式不正确', 400);
    return deviceTaskList(request, DB, taskListMatch[1]);
  }
  const deviceId = path.slice('/api/devices/'.length);
  if (!TERMINAL_ID_PATTERN.test(deviceId)) return fail('设备标识格式不正确', 400);
  if (!['PUT', 'PATCH'].includes(request.method)) return fail('不支持的方法', 405);
  const existing = await DB.prepare('SELECT device_id, computer_name, alias, created_at FROM devices WHERE device_id = ?').bind(deviceId).first();
  if (request.method === 'PUT') {
    if (!PC_ID_PATTERN.test(deviceId)) return fail('网页终端须经接受登记接口创建', 400);
    let computerName;
    try { computerName = await body(request, 'computer_name'); } catch { return fail('请求必须包含computer_name', 400); }
    if (!validName(computerName, 255)) return fail('电脑名称不正确', 400);
    await DB.prepare(`INSERT INTO devices (device_id, computer_name, alias, created_at) VALUES (?, ?, NULL, ?)
      ON CONFLICT(device_id) DO UPDATE SET computer_name = excluded.computer_name`)
      .bind(deviceId, computerName.trim(), new Date().toISOString()).run();
    const device = await DB.prepare('SELECT device_id, computer_name, alias, created_at FROM devices WHERE device_id = ?').bind(deviceId).first();
    return reply({ device: present(device) }, existing ? 200 : 201);
  }
  if (!existing) return fail('设备不存在', 404);
  let alias;
  try { alias = await body(request, 'alias'); } catch { return fail('请求必须包含alias', 400); }
  if (alias !== null && (typeof alias !== 'string' || (alias.trim() !== '' && !validName(alias, 64))
      || /[\u0000-\u001f\u007f-\u009f]/u.test(alias))) return fail('通用名不正确', 400);
  alias = alias === null ? null : alias.trim() || null;
  if (alias !== null) {
    const duplicate = await DB.prepare('SELECT device_id FROM devices WHERE alias = ? COLLATE NOCASE AND device_id <> ?').bind(alias, deviceId).first();
    if (duplicate) return fail('通用名已被其他设备使用', 409);
  }
  try {
    await DB.prepare('UPDATE devices SET alias = ? WHERE device_id = ?').bind(alias, deviceId).run();
  } catch (error) {
    // 数据库唯一约束兜底；其它错误交给Worker统一隐藏内部细节。
    if (/UNIQUE constraint failed: devices\.alias/i.test(String(error.message))) return fail('通用名已被其他设备使用', 409);
    throw error;
  }
  return reply({ device: present({ ...existing, alias }) });
}
