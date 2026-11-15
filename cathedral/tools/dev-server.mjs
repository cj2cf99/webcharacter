// 零依赖静态服务，只绑定 127.0.0.1。根目录为项目根，入口 /site/。不提供 reference/ 与 work/。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 8780);
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.png': 'image/png' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.writeHead(302, { location: '/site/' }).end(); return; }
    let p = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    const rel = p.slice(ROOT.length).replaceAll('\\', '/');
    if (!p.startsWith(ROOT + sep) || !/^\/(site|vendor)\//.test(rel)) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
    if (url.pathname.endsWith('/')) p = join(p, 'index.html');
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 403, { 'content-type': 'text/plain' }).end(String(e.message));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`cathedral: http://localhost:${PORT}/site/`));
