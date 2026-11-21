import {forwardRecordPhoto} from './record-photo.mjs';
import {createWorker} from '../worker.mjs';
import {handleReminderReview} from './reminder-review.mjs';
import {isTaskWorkspaceApi} from './task-workspace-routes.mjs';

const prefix = '/api/companion';
const fail = (status, code, message) => Response.json({error: {code, message}}, {status, headers: {'Cache-Control': 'no-store'}});
export const isCompanionPath = path => path.startsWith(prefix + '/');

async function writeRegistrationEntry({path, body, idempotencyKey, env}) {
  const result = await env.COMPANION_HOST.register({path, body, idempotencyKey});
  if (result?.receipt) return result.receipt;
  if (Number.isInteger(result?.rejected)) throw Object.assign(new Error('登记被拒绝'),
    {code: 'RECORDS_REJECTED', status: result.rejected});
  throw new Error('登记结果待核对');
}

const worker = createWorker({
  authorize: (_request, env) => ({ownerId: env.ownerId}),
  loadRegistrationCategories: env => env.COMPANION_HOST.categories(),
  writeRegistrationEntry,
  writeHuShiEntry: (_request, env, path, body, idempotencyKey) =>
    writeRegistrationEntry({path, body, idempotencyKey, env}),
  readRegistrationReceipt: ({path, idempotencyKey, env}) => env.COMPANION_HOST.lookup(idempotencyKey, path),
});

export async function handleCompanion(request, env, actor, fromMain) {
  if (!actor) return fail(403, 'ACCESS_DENIED', '需要有效的 Access 身份');
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (!fromMain && !['GET', 'HEAD'].includes(request.method)
    && (origin && origin !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')) {
    return fail(403, 'ORIGIN_DENIED', '仅允许同源操作');
  }
  url.pathname = '/api' + url.pathname.slice(prefix.length);
  if (url.pathname.startsWith('/api/memory/') && !fromMain && actor.role !== 'bot') {
    return fail(403, 'ACCESS_DENIED', '桌宠接口仅供服务身份使用');
  }
  const memoryRead=request.method==='GET'&&/^\/api\/memory\/(?:diaries|nags)(?:\/[\w.-]+(?:\/original)?)?$/.test(url.pathname);
  if (fromMain && !memoryRead && !isTaskWorkspaceApi(url.pathname, request.method)) return fail(404, 'NOT_FOUND', '接口不存在');
  if (!env.COMPANION_DB || !env.COMPANION_HOST) return fail(503, 'COMPANION_NOT_CONFIGURED', '绯月服务尚未接入');
  if(url.pathname==='/api/records/photos')return forwardRecordPhoto(request,(bytes,type,name)=>env.COMPANION_HOST.uploadRecordPhoto(bytes,type,name));
  const review = await handleReminderReview(request, env.COMPANION_HOST, url.pathname);
  if (review) return review;
  if (url.pathname === '/api/health' && request.method === 'GET') {
    try {
      await Promise.all([env.COMPANION_DB.prepare('SELECT 1 FROM registration_ai_preference LIMIT 1').first(),
        env.COMPANION_HOST.categories()]);
      return Response.json({ok: true}, {headers: {'Cache-Control': 'no-store'}});
    } catch { return fail(503, 'COMPANION_NOT_CONFIGURED', '绯月服务尚未接入'); }
  }
  return worker.fetch(new Request(url, request), {...env, DB: env.COMPANION_DB,
    REGISTRATION_AI: env.COMPANION_HOST, ownerId: 'companion-owner', companionBrowser: fromMain});
}
