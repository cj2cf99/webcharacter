// 本机借用接口：让本机其他程序（如动画生成器）借用绯月的 AI、ComfyUI 与已登记 CLI。
// 与生图一样属于并行工作，不占正式工作名额；借用任务之间按到达顺序逐个执行。结果只留在内存，重启后需按原编号重交。
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
  bad('channel 须为 ai、comfy 或 cli');
};

function runCli(command) {
  const [file, args] = CLI_COMMANDS[command];
  return new Promise((ok, no) => execFile(file, args, {windowsHide: true, timeout: 30000, encoding: 'utf8'},
    (err, stdout, stderr) => err ? no(Error('命令失败：' + (stderr || err.message).slice(0, 200))) : ok({stdout: (stdout || stderr).slice(0, 2000)})));
}

// gemini({prompt, images, aspectRatio}) → {mime, bytes}；upscale({mime, bytes}) → {mime, bytes, width?, height?}
export function createBorrow({gemini, upscale, cli = runCli, now = () => new Date().toISOString()}) {
  const jobs = new Map(), queue = [];
  let running = false;
  const view = job => {
    const {task, ...rest} = job;
    return job.state === 'queued' ? {...rest, queue: {position: queue.indexOf(job) + 1}} : rest;
  };
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
    const done = [...jobs.values()].filter(j => j.finished);
    for (const j of done.slice(0, Math.max(0, done.length - KEEP))) jobs.delete(j.id);
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
      const job = {id: task.id, channel: task.channel, state: 'queued', created: now(), started: null, finished: null, error: null, result: null, task};
      jobs.set(job.id, job); queue.push(job); void pump();
      return {existing: false, job: view(job)};
    },
    get(id) { const job = jobs.get(id); return job ? view(job) : null; },
  };
}
