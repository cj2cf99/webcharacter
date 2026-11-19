const page = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>绯月任务链</title><link rel="stylesheet" href="/assets/companion/chains.css">'
  + '<script type="module" src="/assets/companion/chains.js"></script></head>'
  + '<body><header></header><main class="companion-page"><h1>绯月任务链</h1>'
  + '<p id="companion-status" role="status"></p><div id="companion-chains"></div>'
  + '<button type="button" id="companion-more" hidden>加载更多</button></main></body></html>';
export function createChainPage({shell, authorize, script, style}) {
  const response = (body, status, type = 'application/json; charset=utf-8') =>
    new Response(body, {status, headers: {'Content-Type': type, 'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'"}});
  const error = (status, message) => response(JSON.stringify({error: {message}}), status);
  return async function handle(request, env) {
    const url = new URL(request.url), path = url.pathname;
    const html = path === '/companion/chains' || path === '/companion/chains/';
    const asset = path === '/assets/companion/chains.js' ? ['text/javascript', script]
      : path === '/assets/companion/chains.css' ? ['text/css', style] : null;
    const rpc = /^\/api\/companion\/(?:chains(?:\/[A-Za-z0-9_-]+(?:\/stop|\/nodes\/[A-Za-z0-9_-]+\/decision)?)?|tasks\/[A-Za-z0-9_-]+\/(?:receipt|execute))$/.test(path);
    if (!html && !asset && !rpc) return null;
    if (env.COMPANION_ENABLED !== 'true') return error(503, '绯月任务链尚未启用');
    const write = request.method === 'POST' && rpc;
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
    try {
      return await env.SUBSCRIPTIONS_API.fetchOwner(new Request(url, {
        method: request.method, headers, ...(write ? {body: request.body, duplex: 'half'} : {}),
      }), owner.sub);
    } catch { return error(503, '绯月任务服务暂不可用'); }
  };
}
