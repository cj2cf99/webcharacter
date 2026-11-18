import { TERMINAL_ID_PATTERN, presentDevice } from '../devices/api.mjs';

export const TERMINAL_COOKIE = 'companion_terminal';
const selectDevice = 'SELECT device_id, computer_name, alias, created_at FROM devices WHERE device_id = ?';
const reply = (value, status = 200, headers = {}) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
});
const fail = (status, code, message, headers) => reply({ error: { code, message } }, status, headers);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function cookieHeader(request, id) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${TERMINAL_COOKIE}=${id ? encodeURIComponent(id) : ''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${id ? 31536000 : 0}${secure}`;
}

async function current(request, DB) {
  const values = (request.headers.get('Cookie') || '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith(`${TERMINAL_COOKIE}=`))
    .map(part => part.slice(TERMINAL_COOKIE.length + 1));
  if (!values.length) return { terminal: null, stale: false };
  let id;
  try { id = values.length === 1 ? decodeURIComponent(values[0]) : ''; }
  catch { id = ''; }
  if (!TERMINAL_ID_PATTERN.test(id)) return { terminal: null, stale: true };
  const row = await DB.prepare(selectDevice).bind(id).first();
  return { terminal: row ? presentDevice(row) : null, stale: !row };
}

async function readObject(request) {
  try {
    const value = await request.json();
    return object(value) ? value : null;
  } catch { return null; }
}

// Worker认证之后调用；cookie只有关联用途，不能证明已登录或有PC执行权限。
export async function handleTerminalRequest(request, DB) {
  const path = new URL(request.url).pathname;
  if (path !== '/api/terminal' && !path.startsWith('/api/terminal/')) return null;
  if (!['/api/terminal', '/api/terminal/register', '/api/terminal/claim'].includes(path)) {
    return fail(404, 'NOT_FOUND', '接口不存在');
  }
  const method = path === '/api/terminal' ? 'GET' : 'POST';
  if (request.method !== method) return fail(405, 'METHOD_NOT_ALLOWED', `仅支持${method}`, { Allow: method });
  if (method === 'GET') {
    const { terminal, stale } = await current(request, DB);
    return reply({ terminal, registration_required: !terminal }, 200,
      stale ? { 'Set-Cookie': cookieHeader(request, null) } : {});
  }
  const body = await readObject(request);
  if (path === '/api/terminal/register') {
    if (!body || body.accepted !== true || Object.keys(body).some(key => !['accepted', 'browser_label'].includes(key))) {
      return fail(400, 'ACCEPTANCE_REQUIRED', '明确接受后才能登记新终端');
    }
    let label = '网页终端';
    if (Object.hasOwn(body, 'browser_label')) {
      if (typeof body.browser_label !== 'string' || !body.browser_label.trim()
        || [...body.browser_label.trim()].length > 255 || /[\u0000-\u001f\u007f-\u009f]/u.test(body.browser_label)) {
        return fail(400, 'INVALID_LABEL', '浏览器说明必须为1至255个字符且不含控制字符');
      }
      label = body.browser_label.trim();
    }
    const { terminal } = await current(request, DB);
    if (terminal) return reply({ terminal }, 200);
    const row = { device_id: `web-${crypto.randomUUID()}`, computer_name: label, alias: null, created_at: new Date().toISOString() };
    await DB.prepare('INSERT INTO devices (device_id, computer_name, alias, created_at) VALUES (?, ?, NULL, ?)')
      .bind(row.device_id, row.computer_name, row.created_at).run();
    return reply({ terminal: presentDevice(row) }, 201, { 'Set-Cookie': cookieHeader(request, row.device_id) });
  }
  if (!body || Object.keys(body).length !== 1 || typeof body.device_id !== 'string'
    || !TERMINAL_ID_PATTERN.test(body.device_id)) {
    return fail(400, 'INVALID_TERMINAL', '必须指定已有终端的固定标识');
  }
  const row = await DB.prepare(selectDevice).bind(body.device_id).first();
  if (!row) return fail(404, 'TERMINAL_NOT_FOUND', '终端不存在');
  return reply({ terminal: presentDevice(row) }, 200, { 'Set-Cookie': cookieHeader(request, row.device_id) });
}
