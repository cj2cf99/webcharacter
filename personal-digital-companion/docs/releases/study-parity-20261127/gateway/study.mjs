import {handleAPI} from './study-engine/api.mjs';

const companionPrefix = '/api/companion';
const studyPrefix = companionPrefix + '/study/v1/';
const readRoutes = /^(?:banks(?:\/[\w.-]+(?:\/(?:questions|review))?)?|tags|assets\/[\w.-]+|questions\/[\w.-]+\/comments|sessions\/[\w.-]+(?:\/result)?)$/;
const writeRoutes = /^(?:sessions|sessions\/[\w.-]+\/(?:takeover|pause|resume|finish|reflections)|questions\/[\w.-]+\/comments)$/;
// 题目评论与考后复盘的修改、删除，和网页版同一份数据。
const entryRoute = /^(?:comments|reflections)\/[\w.-]+$/;
const progressRoute = /^sessions\/[\w.-]+\/progress$/;

export const isStudyDesktopPath = path => path.startsWith(studyPrefix);
const fail = (status, code, message) => Response.json({error: {code, message}}, {
  status,
  headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
});

export function handleStudyDesktop(request, env, actor) {
  if (actor?.role !== 'bot') return fail(403, 'ACCESS_DENIED', '需要有效的绯月服务身份');

  const service = env.STUDY_DESKTOP_SERVICE_NAME?.trim();
  const owner = env.STUDY_OWNER_ACCESS_SUB?.trim();
  if (env.API_ENABLED !== 'true' || !service || !owner || !env.APIDB) {
    return fail(503, 'STUDY_NOT_CONFIGURED', '正式考试服务尚未接入');
  }
  if (actor.id !== 'bot:' + service) return fail(403, 'ACCESS_DENIED', '该服务身份未获准接入正式考试');

  const url = new URL(request.url);
  const route = url.pathname.slice(studyPrefix.length);
  const allowed = (request.method === 'GET' && readRoutes.test(route))
    || (request.method === 'POST' && writeRoutes.test(route))
    || (request.method === 'PATCH' && progressRoute.test(route))
    || (['PATCH', 'DELETE'].includes(request.method) && entryRoute.test(route));
  if (!allowed) return fail(404, 'NOT_FOUND', '接口不存在');

  url.pathname = '/api' + url.pathname.slice(companionPrefix.length);
  return handleAPI(new Request(url, request), env.APIDB, owner, {desktopExamOnly: true});
}
