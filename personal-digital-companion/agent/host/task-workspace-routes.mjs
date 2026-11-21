// 旧链页面的入口与操作保留，新增浏览器能力按方法开放。
export function isTaskWorkspacePage(path) {
  return /^\/companion\/(?:tasks|chains)\/?$/.test(path);
}

const chainOperations = /^\/api\/(?:chains(?:\/[A-Za-z0-9_-]+(?:\/stop|\/nodes\/[A-Za-z0-9_-]+\/decision)?)?|tasks\/[A-Za-z0-9_-]+\/(?:execute|receipt))$/;
export function isTaskWorkspaceApi(path, method) {
  if (chainOperations.test(path)) return true;
  if (method === 'GET') {
    return ['/api/task-overview', '/api/task-template-overview', '/api/tasklist', '/api/devices', '/api/terminal'].includes(path) ||
      /^\/api\/tasks\/[A-Za-z0-9_-]+$/.test(path);
  }
  if (method === 'PATCH') return /^\/api\/devices\/[A-Za-z0-9_-]+$/.test(path);
  return method === 'POST' && (['/api/task-submissions', '/api/tasks', '/api/terminal/claim'].includes(path) ||
    /^\/api\/tasks\/[A-Za-z0-9_-]+\/cancel$/.test(path));
}
