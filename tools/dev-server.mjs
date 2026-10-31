// 零依赖的本地开发服务：静态文件 + 把浏览器里生成的结果写回项目的 work/ 目录
// 用法：node tools/dev-server.mjs [端口]
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = join(ROOT, "work");
const PORT = Number(process.argv[2] || 8768);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".iki": "application/json", ".png": "image/png", ".webp": "image/webp", ".psd": "application/octet-stream", ".css": "text/css",
};

// 只允许写到 work/ 下面，防止路径穿越
function workPath(name) {
  const p = normalize(join(WORK, name));
  if (!p.startsWith(WORK + sep)) throw new Error("bad path");
  return p;
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "POST" && url.pathname === "/save") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const file = workPath(url.searchParams.get("name") || "");
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, Buffer.concat(chunks));
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }
    let p = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (p !== ROOT && !p.startsWith(ROOT + sep)) throw new Error("bad path");
    // 开发服务只提供演示与工具，禁止读取 Git、备份和本地原稿。
    const relative=p.slice(ROOT.length).replaceAll('\\','/');
    if (relative.split('/').some(part=>part.startsWith('.')) || relative.startsWith('/local-backup/') || /\.(psd|zip)$/i.test(relative) || relative==='/白发双马尾黑白裙少女.png') throw new Error('private local file');
    if (url.pathname.endsWith("/")) p = join(p, "index.html");
    const body = await readFile(p);
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch (e) {
    res.writeHead(e.code === "ENOENT" ? 404 : 400, { "content-type": "text/plain" }).end(String(e.message));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`dev server: http://localhost:${PORT}/`));
