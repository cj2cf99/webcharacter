// 本机实验入口。复用桌宠直连推理模块，独立保存实验运行状态。
import { app, utilityProcess } from 'electron';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBalancedLocalModel } from '../personal-digital-companion/desktop/balanced-local-model.mjs';
import { desktopModelPath } from '../personal-digital-companion/desktop/local-model.mjs';

const folder = dirname(fileURLToPath(import.meta.url));
const assets = resolve(folder, '../work/sensevoice-small');
const sovits = process.env.VOICE_LAB_SOVITS ?? 'G:/selftool/voice/GPT-SoVITS-v5-20261006';
const reference = process.env.VOICE_LAB_REFERENCE ?? 'G:/voicesample/新建文件夹';
const python = join(sovits, 'runtime', 'python.exe');
const port = Number(process.env.VOICE_LAB_PORT ?? 8792);
const host = `127.0.0.1:${port}`;
const origin = `http://${host}`;

mkdirSync(join(assets, 'electron'), { recursive: true });
app.setPath('userData', join(assets, 'electron'));

const model = createBalancedLocalModel({
  utilityProcess,
  modelPath: desktopModelPath(app, resolve(folder, '../personal-digital-companion')),
  localFirst: true,
});

function audioWorker(mode) {
  let child, pending;
  function start() {
    const childProcess = spawn(python, ['-X', 'utf8', '-B', '-u', join(folder, 'audio_worker.py'), mode, assets, sovits, reference], {
      cwd: assets, windowsHide: true, stdio: ['pipe', 'pipe', process.env.VOICE_LAB_DEBUG === '1' ? 'inherit' : 'ignore'],
      env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1',
        GRADIO_ANALYTICS_ENABLED: 'False', OMP_NUM_THREADS: '4' },
    });
    const failed = () => {
      if (child !== childProcess) return;
      child = undefined;
      pending?.finish({ error: '语音进程启动失败或已退出，请重试。' });
    };
    childProcess.once('error', failed);
    childProcess.once('exit', failed);
    childProcess.stdin.on('error', failed);
    createInterface({ input: childProcess.stdout }).on('line', line => {
      try {
        const value = JSON.parse(line);
        if (pending && value.id === pending.id) pending.finish(value);
      } catch { /* 跳过第三方库的原生标准输出。 */ }
    });
    return childProcess;
  }
  return {
    run(value) {
      if (pending) return Promise.resolve({ error: '上一段语音还在处理，请稍候。' });
      child ??= start();
      const process = child;
      return new Promise(resolveResult => {
        const id = crypto.randomUUID();
        const timer = setTimeout(() => {
          child = undefined;
          process.kill();
          pending.finish({ error: '语音处理超时，请重试。' });
        }, 150_000);
        pending = { id, finish(result) {
          clearTimeout(timer);
          pending = undefined;
          resolveResult(result);
        } };
        process.stdin.write(JSON.stringify({ id, ...value }) + '\n');
      });
    },
    close() { child?.kill(); },
  };
}

const asr = audioWorker('asr');
const tts = { sense: audioWorker('melo'), gpt: audioWorker('gpt') };
const files = new Map([
  ['/', [join(folder, 'index.html'), 'text/html; charset=utf-8']],
  ['/read/', [join(folder, 'read.html'), 'text/html; charset=utf-8']],
  ['/read', [join(folder, 'read.html'), 'text/html; charset=utf-8']],
  ['/style.css', [join(folder, 'style.css'), 'text/css; charset=utf-8']],
  ['/page.mjs', [join(folder, 'page.mjs'), 'text/javascript; charset=utf-8']],
  ['/mic-capture.mjs', [join(folder, 'mic-capture.mjs'), 'text/javascript; charset=utf-8']],
  ['/mic-processor.mjs', [join(folder, 'mic-processor.mjs'), 'text/javascript; charset=utf-8']],
  ['/read.mjs', [join(folder, 'read.mjs'), 'text/javascript; charset=utf-8']],
  ['/read-segments.mjs', [join(folder, 'read-segments.mjs'), 'text/javascript; charset=utf-8']],
  ['/sample.mp3', [join(assets, 'zh.mp3'), 'audio/mpeg']],
]);

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'permissions-policy': 'microphone=(self)',
    'content-security-policy': "default-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'" });
  response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readBody(request, limit) {
  const size = Number(request.headers['content-length']);
  if (!Number.isSafeInteger(size) || size < 1 || size > limit) throw httpError(400, '输入为空或超过长度限制。');
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function checkedText(value, limit) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > limit) throw httpError(400, '文字为空或超过长度限制。');
  return value.trim();
}

const server = createServer(async (request, response) => {
  try {
    if (request.headers.host !== host) throw httpError(403, '请使用本机测试地址。');
    const url = new URL(request.url, origin);
    if (request.method === 'GET' && files.has(url.pathname)) {
      const [file, type] = files.get(url.pathname);
      send(response, 200, await readFile(file), type);
      return;
    }
    if (request.method !== 'POST') throw httpError(404, '未找到该页面。');
    if (request.headers.origin !== origin) throw httpError(403, '只接受本页发起的请求。');
    if (url.pathname === '/api/transcribe') {
      const engine = url.searchParams.get('engine');
      if (!Object.hasOwn(tts, engine) || request.headers['content-type'] !== 'audio/wav') throw httpError(400, '无效的听写请求。');
      const wav = await readBody(request, 961_024);
      const { id, ...result } = await asr.run({ engine, audio: wav.toString('base64') });
      send(response, result.error ? 503 : 200, result);
      return;
    }
    if (url.pathname !== '/api/chat' && url.pathname !== '/api/speak') throw httpError(404, '未找到该接口。');
    const payload = JSON.parse(await readBody(request, 12_000));
    const text = checkedText(payload?.text, url.pathname === '/api/chat' ? 500 : 1200);
    if (url.pathname === '/api/speak') {
      if (!Object.hasOwn(tts, payload.engine)) throw httpError(400, '请选择语音方案。');
      const { error, wav, loadMs, inferenceMs } = await tts[payload.engine].run({ text });
      if (error) throw httpError(503, error);
      response.setHeader('x-load-ms', String(loadMs));
      response.setHeader('x-inference-ms', String(inferenceMs));
      send(response, 200, Buffer.from(wav, 'base64'), 'audio/wav');
      return;
    }
    const previous = payload.previous ? {
      用户: checkedText(payload.previous.user, 500), 绯月: checkedText(payload.previous.reply, 1200),
    } : undefined;
    const controller = new AbortController();
    response.once('close', () => { if (!response.writableEnded) controller.abort(); });
    const result = await model.analyze(text, { hint: 'direct', replyMode: 'speech', previous, signal: controller.signal,
      skillInstruction: { response: '用一到三句自然的中文口语，顺着丈夫当下说的话回应，适合直接朗读。只输出绯月的台词。' } });
    if (result.kind !== 'chat' || !result.reply?.trim()) {
      throw httpError(503, `绯月的本地直连暂未返回回复（${result.error ?? 'EMPTY_REPLY'}），请重试。`);
    }
    send(response, 200, { reply: result.reply.trim() });
  } catch (error) {
    if (response.destroyed) return;
    const status = error.status ?? (error instanceof SyntaxError ? 400 : error.code === 'ENOENT' ? 404 : 500);
    if (status === 500) console.error(error);
    send(response, status, { error: error.status ? error.message : '请求未完成，请检查本机服务后重试。' });
  }
});

server.on('error', error => { console.error(error.message); app.exit(1); });
void app.whenReady().then(() => {
  server.listen(port, '127.0.0.1', () => console.log(`语音对比实验台 ${origin}/`));
});
app.on('before-quit', () => {
  server.close();
  asr.close();
  Object.values(tts).forEach(worker => worker.close());
  void model.close();
});
process.on('SIGINT', () => app.quit());
process.on('SIGTERM', () => app.quit());
