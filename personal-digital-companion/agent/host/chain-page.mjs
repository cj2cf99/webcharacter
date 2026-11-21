import {isTaskWorkspaceApi, isTaskWorkspacePage} from './task-workspace-routes.mjs';

const filters = (id, label) => `<div class="companion-filters" id="${id}" role="group" aria-label="${label}">
  <button type="button" data-scope="ACTIVE" aria-pressed="false">执行中</button>
  <button type="button" data-scope="COMPLETED" aria-pressed="false">已完成</button>
  <button type="button" data-scope="" aria-pressed="true">全部</button>
</div>`;
const sectionTop = (title, stateId, stateLabel, refreshId, createId, createLabel) => `<div class="companion-section-top">
  <div class="companion-section-heading">
    <h2>${title}</h2>
    <div class="companion-actions">
      ${createId ? `<button type="button" id="${createId}" class="t-btn" data-static-action="create">${createLabel}</button>` : ''}
      <button type="button" id="${refreshId}" class="t-btn" data-static-action="refresh">刷新</button>
    </div>
  </div>
  ${stateId ? filters(stateId,stateLabel) : ''}
</div>`;

const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>绯月任务管理</title><link rel="stylesheet" href="/assets/companion/chains.css">
<script type="module" src="/assets/companion/chains.js"></script></head>
<body><header></header><main class="companion-page">
  <h1>绯月任务管理</h1>
  <div class="companion-workspace">
  <nav class="companion-tabs" aria-label="任务分类">
    <button type="button" data-companion-view="chains" aria-controls="chain-panel" aria-pressed="true">任务链</button>
    <button type="button" data-companion-view="tasks" aria-controls="task-panel" aria-pressed="false">单条任务</button>
    <button type="button" data-companion-view="templates" aria-controls="template-panel" aria-pressed="false">任务模板</button>
    <button type="button" data-companion-view="terminals" aria-controls="terminal-panel" aria-pressed="false">终端管理</button>
  </nav>
  <div class="companion-content">
  <section id="chain-panel" aria-label="任务链">
    ${sectionTop('任务链','chain-state','任务链状态','chain-refresh','chain-new','新建任务链')}
    <p id="chain-feedback" class="companion-status" role="status"></p>
    <div id="companion-chains" class="companion-list"></div>
    <p id="companion-status" class="companion-status" role="status"></p>
    <button type="button" id="companion-more" hidden>加载更多</button>
  </section>
  <section id="task-panel" aria-label="单条任务" hidden>
    ${sectionTop('单条任务','task-state','单条任务状态','task-refresh','task-new','新建任务')}
    <p id="task-feedback" class="companion-status" role="status"></p>
    <div id="task-list" class="companion-list"></div><p id="task-status" class="companion-status" role="status"></p>
    <button type="button" id="task-more" hidden>加载更多</button>
  </section>
  <section id="template-panel" aria-label="任务模板" hidden>
    ${sectionTop('任务模板','template-state','模板使用状态','template-refresh')}
    <div id="task-templates" class="companion-list"></div><p id="template-status" class="companion-status" role="status"></p>
    <button type="button" id="template-more" hidden>加载更多</button>
  </section>
  <section id="terminal-panel" aria-label="任务终端管理" hidden>
    ${sectionTop('任务终端管理',null,null,'terminal-refresh')}
    <p id="terminal-binding" class="companion-status"></p>
    <div id="terminal-list" class="companion-list"></div>
    <p id="terminal-status" class="companion-status" role="status"></p>
  </section>
  </div></div>
  <dialog id="task-create" aria-labelledby="task-create-title">
    <form id="task-form"><div class="companion-heading"><h2 id="task-create-title">新建单条任务</h2><button type="button" id="task-create-close" aria-label="关闭">×</button></div>
      <label>任务模板<select id="task-type" required></select></label>
      <div id="task-target-field" hidden>
        <label>目标设备<select id="task-target" aria-describedby="task-target-message"></select></label>
        <small id="task-target-message" class="companion-field-message" hidden></small>
      </div>
      <div id="task-fields"></div>
      <p id="task-create-status" class="companion-status" role="status"></p>
      <div class="companion-tools"><button type="submit" class="companion-primary" id="task-create-submit">创建任务</button></div>
    </form>
  </dialog>
  <dialog id="chain-create" aria-labelledby="chain-create-title">
    <form id="chain-form">
      <div class="companion-heading"><h2 id="chain-create-title">新建任务链</h2><button type="button" id="chain-create-close" aria-label="关闭">×</button></div>
      <fieldset id="chain-create-fields">
        <label>任务链名称<input id="chain-name" required maxlength="100" placeholder="整理今天的记录"></label>
        <div id="chain-steps"></div>
        <div class="companion-tools"><button type="button" id="chain-add-step">＋ 添加任务</button><small id="chain-step-count"></small></div>
      </fieldset>
      <p id="chain-create-status" class="companion-status" role="status"></p>
      <div class="companion-tools"><button type="submit" class="companion-primary" id="chain-create-submit">创建任务链</button></div>
    </form>
  </dialog>
</main></body></html>`;
export function createChainPage({shell, authorize, script, style}) {
  const response = (body, status, type = 'application/json; charset=utf-8') =>
    new Response(body, {status, headers: {'Content-Type': type, 'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'"}});
  const error = (status, message) => response(JSON.stringify({error: {message}}), status);
  return async function handle(request, env) {
    const url = new URL(request.url), path = url.pathname;
    const html = isTaskWorkspacePage(path);
    const asset = path === '/assets/companion/chains.js' ? ['text/javascript', script]
      : path === '/assets/companion/chains.css' ? ['text/css', style] : null;
    const prefix = '/api/companion/';
    const rpc = path.startsWith(prefix) && isTaskWorkspaceApi('/api/' + path.slice(prefix.length), request.method);
    if (!html && !asset && !rpc) return null;
    if (env.COMPANION_ENABLED !== 'true') return error(503, '绯月任务管理尚未启用');
    const write = ['POST','PATCH'].includes(request.method) && rpc;
    if (!['GET', 'HEAD'].includes(request.method) && !write) return error(405, '请求方法不支持');
    if (write && (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')) {
      return error(403, '仅允许本站操作');
    }
    let owner;
    try { owner = await authorize(request, env); } catch (e) { return error(e.status ?? 403, '访问未授权'); }
    if (!owner?.sub) return error(403, '访问未授权');
    const head = request.method === 'HEAD';
    if (html) return response(head ? null : shell(page, path, env), 200, 'text/html; charset=utf-8');
    if (asset) return response(head ? null : asset[1], 200, asset[0] + '; charset=utf-8');
    if (head) return error(405, '请求方法不支持');
    const headers = new Headers();
    if (write) headers.set('Content-Type', 'application/json');
    if (path === prefix + 'terminal') {
      const cookie = (request.headers.get('Cookie') || '').split(';')
        .map(value => value.trim()).filter(value => value.startsWith('companion_terminal=')).join('; ');
      if (cookie) headers.set('Cookie',cookie);
    }
    try {
      return await env.SUBSCRIPTIONS_API.fetchOwner(new Request(url, {
        method: request.method, headers, ...(write ? {body: request.body, duplex: 'half'} : {}),
      }), owner.sub);
    } catch { return error(503, '绯月任务服务暂不可用'); }
  };
}
