// 本机借用接口：让本机其他程序（如动画生成器）借用绯月的 AI、ComfyUI 与已登记 CLI。
// 与生图一样属于并行工作，不占正式工作名额；借用任务之间按到达顺序逐个执行。结果只留在内存，重启后需按原编号重交。
// agy 文本通道单独排队，开始前给绯月自身的 agy 调用和额度冷却让位，不阻塞生图与放大。
import {execFile} from 'node:child_process';
import {batchId} from './garden-registration.mjs';

const MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
const KEEP = 30;                                  // 最多保留最近 30 个任务的结果
const MAX_IMAGE = 20 * 1024 * 1024;

// 已登记的只读 CLI；其余一律拒绝
export const CLI_COMMANDS = {'python-version': ['python', ['--version']]};

const bad = message => { throw Object.assign(Error(message), {status: 400}); };
function image(value) {
  if (!value || typeof value !== 'object' || !MIMES.has(value.mime) || typeof value.base64 !== 'string') bad('图片须为 {mime: image/png|jpeg|webp, base64}');
  const bytes = Buffer.from(value.base64, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE) bad('图片为空或超过 20MB');
  return {mime: value.mime, bytes};
}
function pngSize(bytes) {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
  return {};
}
const cleanTask = input => {
  const {id, channel} = input;
  if (typeof id !== 'string' || !batchId.test(id)) bad('需要稳定编号：小写字母、数字、下划线或短横线，最多 80 位');
  if (channel === 'ai') {
    const {kind, prompt, images = [], aspectRatio} = input;
    if (kind !== 'gemini-image') bad('ai 通道目前只支持 kind: gemini-image');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) bad('提示词须为 1～4000 字');
    if (!Array.isArray(images) || images.length > 4) bad('参考图最多 4 张');
    if (aspectRatio !== undefined && !RATIOS.has(aspectRatio)) bad('aspectRatio 不受支持');
    return {id, channel, kind, prompt, images: images.map(image), aspectRatio};
  }
  if (channel === 'comfy') {
    if (input.workflow !== 'upscale') bad('comfy 通道目前只支持 workflow: upscale');
    return {id, channel, workflow: 'upscale', image: image(input.image)};
  }
  if (channel === 'cli') {
    if (!Object.hasOwn(CLI_COMMANDS, input.command)) bad('CLI 只允许已登记命令：' + Object.keys(CLI_COMMANDS).join('、'));
    return {id, channel, command: input.command};
  }
  if (channel === 'agy') {
    const {prompt} = input;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) bad('提示词须为 1～4000 字');
    return {id, channel, prompt};
  }
  bad('channel 须为 ai、comfy、cli 或 agy');
};

function runCli(command) {
  const [file, args] = CLI_COMMANDS[command];
  return new Promise((ok, no) => execFile(file, args, {windowsHide: true, timeout: 30000, encoding: 'utf8'},
    (err, stdout, stderr) => err ? no(Error('命令失败：' + (stderr || err.message).slice(0, 200))) : ok({stdout: (stdout || stderr).slice(0, 2000)})));
}

// gemini({prompt, images, aspectRatio}) → {mime, bytes}；upscale({mime, bytes}) → {mime, bytes, width?, height?}
// agy({prompt, signal}) → {success, response, error}；agyBusy() → null | 'busy' | 'cooldown'
export function createBorrow({gemini, upscale, cli = runCli, agy, agyBusy = () => null, quietMs = 3000, pollMs = 500, now = () => new Date().toISOString()}) {
  const jobs = new Map(), queue = [], agyQueue = [], aborts = new Map();
  let running = false, agyRunning = false;
  const view = job => {
    const {task, ...rest} = job;
    const line = job.channel === 'agy' ? agyQueue : queue;
    return job.state === 'queued' ? {...rest, queue: {position: line.indexOf(job) + 1}} : rest;
  };
  const prune = () => {
    const done = [...jobs.values()].filter(j => j.finished);
    for (const j of done.slice(0, Math.max(0, done.length - KEEP))) jobs.delete(j.id);
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // 连续空闲 quietMs 才开始，避免插在绯月两次调用之间
  async function yieldTurn(job, signal) {
    let free = null;
    while (!signal.aborted) {
      const busy = agyBusy();
      if (busy) { free = null; job.waiting = busy; }
      else { free ??= Date.now(); if (Date.now() - free >= quietMs) break; }
      await sleep(pollMs);
    }
    delete job.waiting;
  }
  async function pumpAgy() {
    if (agyRunning) return;
    agyRunning = true;
    try {
      while (agyQueue.length) {
        const job = agyQueue[0], abort = new AbortController();
        aborts.set(job.id, abort);
        await yieldTurn(job, abort.signal);
        if (!abort.signal.aborted) {
          job.state = 'running'; job.started = now();
          try {
            const r = await agy({prompt: job.task.prompt, signal: abort.signal});
            if (!r.success) throw Error(r.error === 'RESOURCE_EXHAUSTED' ? 'agy 额度已用尽，请稍后再试' : r.error || 'agy 调用失败');
            job.result = {text: String(r.response).slice(0, 20000)}; job.state = 'done';
          } catch (e) { job.state = 'failed'; job.error = String(e?.message || e).slice(0, 300); }
          job.finished = now();
        }
        delete job.task; aborts.delete(job.id);
        const at = agyQueue.indexOf(job);
        if (at >= 0) agyQueue.splice(at, 1);
      }
    } finally { agyRunning = false; }
    prune();
  }
  async function work(job) {
    const t = job.task;
    if (t.channel === 'ai') {
      const r = await gemini({prompt: t.prompt, images: t.images, aspectRatio: t.aspectRatio});
      return {image: {mime: r.mime, base64: Buffer.from(r.bytes).toString('base64'), ...pngSize(Buffer.from(r.bytes))}};
    }
    if (t.channel === 'comfy') {
      const r = await upscale(t.image);
      const size = r.width ? {width: r.width, height: r.height} : pngSize(Buffer.from(r.bytes));
      return {image: {mime: r.mime, base64: Buffer.from(r.bytes).toString('base64'), ...size}};
    }
    return cli(t.command);
  }
  async function pump() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const job = queue[0];
        job.state = 'running'; job.started = now();
        try { job.result = await work(job); job.state = 'done'; }
        catch (e) { job.state = 'failed'; job.error = String(e?.message || e).slice(0, 300); }
        job.finished = now(); delete job.task; queue.shift();
      }
    } finally { running = false; }
    // 只保留最近的结果
    prune();
  }
  return {
    // 同一编号重复提交返回原任务，不重复执行
    submit(input) {
      const old = jobs.get(input?.id);
      if (old) {
        if (old.channel !== input.channel) throw Object.assign(Error('编号已用于另一类借用'), {status: 409});
        return {existing: true, job: view(old)};
      }
      const task = cleanTask(input);
      if (task.channel === 'agy' && !agy) throw Object.assign(Error('本机未安装 agy'), {status: 503});
      const job = {id: task.id, channel: task.channel, state: 'queued', created: now(), started: null, finished: null, error: null, result: null, task};
      jobs.set(job.id, job);
      if (task.channel === 'agy') { agyQueue.push(job); void pumpAgy(); } else { queue.push(job); void pump(); }
      return {existing: false, job: view(job)};
    },
    get(id) { const job = jobs.get(id); return job ? view(job) : null; },
    // 只有 agy 任务可取消：排队的直接移除，执行中的中断并丢弃结果
    cancel(id) {
      const job = jobs.get(id);
      if (!job) return null;
      if (job.channel !== 'agy' || job.finished) throw Object.assign(Error('只能取消未完成的 agy 借用'), {status: 409});
      aborts.get(id)?.abort();
      const at = agyQueue.indexOf(job);
      if (at >= 0 && !aborts.has(id)) agyQueue.splice(at, 1);
      jobs.delete(id);
      return {id, cancelled: true};
    },
    channels: () => ['ai', 'comfy', 'cli', ...(agy ? ['agy'] : [])],
  };
}
