import { CLOUDFLARE_MODEL, createBindingAiClient } from './cloudflare.mjs';
import { DIARY_SUMMARY_INSTRUCTIONS } from './diary.mjs';

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_INPUT_LENGTH = 12_000;
const MAX_OUTPUT_LENGTH = 4_000;
const MAX_MODEL_JSON_LENGTH = 60_000; // JSON 转义后的长度可能大于实际正文。
const DAY_MS = 24 * 60 * 60 * 1_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const columns = 'log_date AS date, title, content, generated_at';
const tokenPattern = /^[a-f0-9]{64}$/;
const instructions = `${DIARY_SUMMARY_INSTRUCTIONS}
写成供以后分析引用的简洁日志。保留材料中明确的日期和来源，缺失时不推测。
正文按材料多少决定篇幅。信息较多时可以写到 3000 字或略多，最多 ${MAX_OUTPUT_LENGTH} 字。标题最多 120 字。
仅返回严格 JSON 对象 {"title":"标题","content":"正文"}，无需代码围栏。`;

const reply = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
});
const fail = (status, code, message) => reply({ error: { code, message } }, status);

export async function authorizeDailyLogToken(request, env) {
  const token = env?.DAILY_LOG_API_TOKEN;
  if (typeof token !== 'string' || !tokenPattern.test(token)) {
    throw Object.assign(new Error('日志令牌尚未配置'), { status: 503 });
  }
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') ?? '');
  if (!match) throw Object.assign(new Error('需要日志令牌'), { status: 401 });
  let difference = 0;
  for (let index = 0; index < token.length; index++) {
    difference |= token.charCodeAt(index) ^ match[1].charCodeAt(index);
  }
  if (difference) throw Object.assign(new Error('日志令牌无效'), { status: 401 });
  return { ownerId: 'daily-log-service' };
}

function dateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

async function readContent(request) {
  const reader = request.body?.getReader();
  if (!reader) return { response: fail(400, 'INVALID_JSON', '请求必须是有效 JSON') };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  let body;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        void reader.cancel().catch(() => {});
        return { response: fail(413, 'CONTENT_TOO_LARGE', '请求体最多 64 KiB') };
      }
      text += decoder.decode(value, { stream: true });
    }
    body = JSON.parse(text + decoder.decode());
  } catch {
    return { response: fail(400, 'INVALID_JSON', '请求必须是有效的 UTF-8 JSON') };
  } finally {
    reader.releaseLock();
  }
  if (!body || typeof body !== 'object' || Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, 'content') || typeof body.content !== 'string' || !body.content.trim()) {
    return { response: fail(400, 'INVALID_CONTENT', '只接受非空 content 字符串') };
  }
  const content = body.content.trim();
  if ([...content].length > MAX_INPUT_LENGTH) {
    return { response: fail(413, 'CONTENT_TOO_LARGE', '正文最多 12000 字符') };
  }
  return { content };
}

export async function handleDailyLogs(request, url, env, ownerId) {
  if (request.method === 'GET') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const first = dateValue(from);
    const last = dateValue(to);
    if (url.searchParams.size !== 2 || !Number.isFinite(first) || !Number.isFinite(last) ||
        last < first || last - first >= 366 * DAY_MS) {
      return fail(400, 'INVALID_DATE_RANGE', '仅接受有效 from 和 to 日期，范围最多 366 天');
    }
    const { results } = await env.DB.prepare(`SELECT ${columns} FROM daily_logs
      WHERE owner_id = ? AND log_date BETWEEN ? AND ? ORDER BY log_date`).bind(ownerId, from, to).all();
    return reply({ items: results });
  }

  if (request.method !== 'POST') {
    return reply({ error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 GET 和 POST' } }, 405, { Allow: 'GET, POST' });
  }
  if (url.searchParams.size) return fail(400, 'INVALID_CONTENT', '生成请求只接收正文');
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return fail(415, 'UNSUPPORTED_MEDIA_TYPE', '请使用 application/json');
  }

  const date = new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
  const { content, response } = await readContent(request);
  if (response) return response;

  const existing = () => env.DB.prepare(`SELECT ${columns} FROM daily_logs
    WHERE owner_id = ? AND log_date = ?`).bind(ownerId, date).first();
  const saved = await existing();
  if (saved) return reply({ item: saved });

  let generated;
  try {
    const client = createBindingAiClient(env, { timeoutMs: 90_000 });
    generated = await client.generate({
      version: 1, route: 'text', maxOutputTokens: 8192,
      messages: [{ role: 'system', content: instructions }, { role: 'user', content }],
    }, { signal: request.signal });
  } catch (error) {
    if (error?.code === 'NOT_CONFIGURED' || error?.code === 'CONFIG_ERROR') return fail(503, 'AI_NOT_CONFIGURED', '日志生成模型尚未配置');
    if (error?.code === 'TIMEOUT') return fail(504, 'AI_TIMEOUT', '日志生成超时');
    if (error?.code === 'CANCELLED') return fail(408, 'REQUEST_CANCELLED', '请求已取消');
    if (error?.status === 429 || error?.code === 'RATE_LIMITED') return fail(429, 'AI_RATE_LIMITED', '日志生成暂时限流');
    return fail(502, 'AI_UNAVAILABLE', '日志生成失败');
  }
  if (request.signal.aborted) return fail(408, 'REQUEST_CANCELLED', '请求已取消');

  let output;
  try {
    if (generated?.provider !== 'cloudflare' || generated.model !== CLOUDFLARE_MODEL || generated.finishReason === 'length' ||
        typeof generated.text !== 'string' || generated.text.length > MAX_MODEL_JSON_LENGTH) throw new Error();
    const summary = JSON.parse(generated.text);
    const title = typeof summary?.title === 'string' ? summary.title.trim() : '';
    const text = typeof summary?.content === 'string' ? summary.content.trim() : '';
    if (!title || [...title].length > 120 || !text || [...text].length > MAX_OUTPUT_LENGTH ||
        Object.keys(summary).length !== 2) throw new Error();
    output = { title, text };
  } catch {
    return fail(502, 'INVALID_AI_RESPONSE', '模型未返回有效的日志');
  }

  const inserted = await env.DB.prepare(`INSERT INTO daily_logs (owner_id, log_date, title, content, generated_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_id, log_date) DO NOTHING RETURNING ${columns}`)
    .bind(ownerId, date, output.title, output.text, new Date().toISOString()).first();
  if (inserted) return reply({ item: inserted }, 201);
  const winner = await existing();
  if (!winner) throw new Error('日志保存结果待核对');
  return reply({ item: winner });
}
