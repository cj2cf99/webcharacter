import {execFile,spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {mkdirSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {valid} from './ai-schema.mjs';
import {promisify} from 'node:util';
import {capTimeoutMs} from './ai-execution-round.mjs';

const run = promisify(execFile);

let cachedAgyPath = null;

const DEFAULT_WSL_DIR = 'E:\\wsl-agy';
const DEFAULT_WSL_DISTRO = 'agy-wsl';
const DEFAULT_WSL_BIN = '/home/agy/.local/bin/agy';
const DEFAULT_WSL_VHDX = join(DEFAULT_WSL_DIR, 'distro', 'ext4.vhdx');

function resolveWslTarget() {
  if (process.env.FEIYUE_AGY_PATH) return null;
  const explicitDistro = process.env.FEIYUE_AGY_WSL_DISTRO?.trim();
  if (explicitDistro && /^(?:0|off|false)$/iu.test(explicitDistro)) return null;
  if (!explicitDistro && !existsSync(DEFAULT_WSL_VHDX)) return null;
  return {
    distro: explicitDistro || DEFAULT_WSL_DISTRO,
    bin: process.env.FEIYUE_AGY_WSL_BIN?.trim() || DEFAULT_WSL_BIN
  };
}

// 优先使用 WSL2 隔离容器（agy-wsl）；若显式传入 FEIYUE_AGY_PATH（含 .mjs 测试替身）则直接运行本地目标。
function agyCommand(args, cwd) {
  const wsl = resolveWslTarget();
  if (wsl) {
    const wslArgs = ['-d', wsl.distro];
    if (cwd) wslArgs.push('--cd', cwd);
    wslArgs.push('--', wsl.bin, ...args);
    return ['wsl.exe', wslArgs];
  }
  const path = findAgyPath();
  return /\.m?js$/iu.test(path) ? [process.execPath, [path, ...args]] : [path, args];
}

// 优雅结束子进程：先关闭 stdin 让 agy 收到 EOF 自行退出（防止 WSL2 侧残留孤儿进程），超时再兜底强杀。
// 默认宽限 6 秒，兼顾正在初始化中的待命进程（约 4~5 秒）初始化完成后读取 EOF 自然退出，避免过早强杀 wsl.exe 造成脱管。
function stopChild(child, graceMs = 6000) {
  if (!child || child.exitCode !== null || child.killed) return;
  try { child.stdin?.end(); } catch {}
  const timer = setTimeout(() => {
    if (child.exitCode === null && !child.killed) {
      try { child.kill(); } catch {}
    }
  }, graceMs);
  timer.unref?.();
  child.once('exit', () => clearTimeout(timer));
}

/**
 * 寻找当前使用的 AGY CLI 标识路径（优先返回 WSL2 隔离容器路径）
 */
export function findAgyPath() {
  if (process.env.FEIYUE_AGY_PATH) return process.env.FEIYUE_AGY_PATH;
  const wsl = resolveWslTarget();
  if (wsl) return `wsl://${wsl.distro}${wsl.bin}`;
  if (cachedAgyPath && existsSync(cachedAgyPath)) return cachedAgyPath;

  const candidates = [
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe') : null,
    join(homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe'),
    'agy.exe',
    'agy'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedAgyPath = candidate;
      return candidate;
    }
  }

  // 默认返回最标准的安装路径，若环境 PATH 中已配置也可直接调用
  return candidates[0] || 'agy';
}

/**
 * 检查 AGY CLI 是否可用及版本号
 */
export async function checkAgyAvailable() {
  const agyPath = findAgyPath();
  try {
    mkdirSync(standbyDir, {recursive: true});
    const [vFile, vArgs] = agyCommand(['--version'], standbyDir);
    const {stdout} = await run(vFile, vArgs, {
      cwd: standbyDir,
      windowsHide: true,
      timeout: 15000,
      encoding: 'utf8'
    });
    const version = stdout.trim();
    return {available: true, path: agyPath, version};
  } catch (error) {
    return {available: false, path: agyPath, error: error.message || String(error)};
  }
}

/**
 * 同步检查 AGY 可执行目标是否存在（WSL2 发行版虚拟盘存在或本地可执行文件存在）
 */
export function isAgyInstalled() {
  if (resolveWslTarget()) return true;
  const agyPath = findAgyPath();
  return existsSync(agyPath);
}

export const RESOURCE_EXHAUSTED_COOLDOWN_MS = 20 * 60_000;
let resourceExhaustedUntil = 0;
let resourceExhaustedTarget = null;
let resourceExhaustedCooldownMs = RESOURCE_EXHAUSTED_COOLDOWN_MS;

function isResourceExhaustedText(value) {
  return /RESOURCE_EXHAUSTED/iu.test(String(value ?? ''));
}

export function isAgyResourceExhausted(now = Date.now()) {
  return now < resourceExhaustedUntil && resourceExhaustedTarget === findAgyPath();
}

export function resetAgyResourceExhausted() {
  resourceExhaustedUntil = 0;
  resourceExhaustedTarget = null;
}

export function setAgyResourceExhaustedCooldownMs(ms = RESOURCE_EXHAUSTED_COOLDOWN_MS) {
  resourceExhaustedCooldownMs = Number.isFinite(ms) && ms > 0 ? ms : RESOURCE_EXHAUSTED_COOLDOWN_MS;
}

function markResourceExhausted() {
  resourceExhaustedTarget = findAgyPath();
  resourceExhaustedUntil = Date.now() + resourceExhaustedCooldownMs;
  const old = spare; spare = null;
  if (old && !old.dead) stopChild(old.child);
}

// ───────── 待命进程 ─────────
// 每次 `agy -p` 冷启动约 8 到 9 秒（实测整次 12 秒、模型自身 3 秒）。stream-json 模式的进程可以常驻，
// 但同一进程的多轮会共享对话上下文，不适合互不相关的任务。所以预热一个备用进程，只用一轮，用完即弃，
// 同时马上预热下一个；备用进程不可用时回到冷启动。在空目录里运行，避免代理工具触到项目文件。
export const standbyDir = process.env.FEIYUE_AGY_WORKDIR
  || (existsSync(DEFAULT_WSL_DIR) ? join(DEFAULT_WSL_DIR, 'temp') : join(tmpdir(), 'feiyue-agy'));
let standbyOn = false, standbyModel = 'gemini-3.8-flash-low', spare = null;

function startSpare(model, extraArgs = []) {
  mkdirSync(standbyDir, {recursive: true});
  const [file, fileArgs] = agyCommand(['-p', '', '--input-format', 'stream-json', '--output-format', 'stream-json', '--model', model, ...extraArgs], standbyDir);
  const child = spawn(file, fileArgs, {windowsHide: true, cwd: standbyDir, stdio: ['pipe', 'pipe', 'pipe']});
  const entry = {child, model, dead: false, waiters: [], lines: []};
  const rl = createInterface({input: child.stdout});
  let errTail = '';
  entry.ready = new Promise(resolve => { entry.markReady = resolve; });
  rl.on('line', line => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.event === 'init') { entry.inited = true; entry.markReady(true); }
    else {
      if (event.event === 'error' && (isResourceExhaustedText(event.error) || isResourceExhaustedText(event.message))) {
        markResourceExhausted();
      }
      for (const waiter of [...entry.waiters]) waiter(event);
    }
  });
  child.stderr?.on('data', chunk => {
    errTail = (errTail + String(chunk)).slice(-512);
    if (isResourceExhaustedText(errTail)) markResourceExhausted();
  });
  const die = () => { entry.dead = true; entry.markReady(false); for (const waiter of [...entry.waiters]) waiter({event: 'exit'}); };
  child.once('exit', die); child.once('error', die);
  child.stdin.on('error', () => {});
  return entry;
}

export function startAgyStandby(model = 'gemini-3.8-flash-low') {
  standbyOn = true; standbyModel = model;
  if (isAgyResourceExhausted()) return;
  if (!spare || spare.dead || spare.model !== model) spare = startSpare(model);
}

export function stopAgyStandby() {
  standbyOn = false;
  const old = spare; spare = null;
  if (old && !old.dead) stopChild(old.child);
}

export function agyStandbyReady() {
  return Boolean(standbyOn && !isAgyResourceExhausted() && spare && !spare.dead && spare.inited);
}

// 向一个已初始化的 stream-json 进程发一轮，返回 result 事件；失败或进程退出返回 null。
async function sendTurn(entry, prompt, {signal, timeoutMs}) {
  const abort = () => stopChild(entry.child, 300);
  signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, capTimeoutMs(timeoutMs, 60_000));
  try {
    if (!(await entry.ready)) return null;
    const answer = new Promise(resolve => {
      const waiter = event => {
        if (event.event === 'result') { entry.waiters.splice(entry.waiters.indexOf(waiter), 1); resolve(event.result); }
        else if (event.event === 'exit') resolve(null);
      };
      entry.waiters.push(waiter);
    });
    entry.child.stdin.write(JSON.stringify({event: 'user', message: {content: prompt}}) + '\n');
    const result = await answer;
    if (!result || result.status !== 'SUCCESS') {
      if (result && (isResourceExhaustedText(result.error) || isResourceExhaustedText(result.response) || isResourceExhaustedText(result.message))) {
        markResourceExhausted();
      }
      return null;
    }
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

// 领用一个待命进程：若尚在预热中则先等本次预热结束，一旦预热完成并开始使用，立刻预热下一条。
async function claimStandby(model, {signal, timeoutMs} = {}) {
  if (signal?.aborted || isAgyResourceExhausted() || !standbyOn || model !== standbyModel || !spare || spare.dead) return null;
  const entry = spare;
  spare = null;
  let ok = false;
  if (entry.inited) {
    ok = !entry.dead;
  } else {
    const abort = () => stopChild(entry.child, 300);
    signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, capTimeoutMs(timeoutMs, 60_000));
    try {
      ok = Boolean(await entry.ready) && !entry.dead && !signal?.aborted;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  if (!ok) {
    if (!entry.dead) stopChild(entry.child);
    return null;
  }
  if (standbyOn && !isAgyResourceExhausted()) startAgyStandby(model);
  return entry;
}

async function runStandby({prompt, model, signal, timeoutMs}) {
  const entry = await claimStandby(model, {signal, timeoutMs});
  if (!entry) return null;
  try {
    return await sendTurn(entry, prompt, {signal, timeoutMs});
  } finally {
    if (!entry.dead) stopChild(entry.child);
  }
}

// ───────── 进行中计数与借用调用 ─────────
// 绯月自身正在进行的 agy 调用数，借用任务据此让位（预热待命进程不算）。
let activeCalls = 0;
export const agyActiveCalls = () => activeCalls;
async function tracked(task) {
  activeCalls++;
  try { return await task(); } finally { activeCalls--; }
}

// 给借用接口的一次性调用：提示词只经标准输入传入（命令行参数经 wsl.exe -- 会被 shell 展开），
// 不领用待命进程，附带沙盒与禁用斜杠命令参数，不放开任何工具权限。
export async function runAgyIsolated({prompt, model = 'gemini-3.8-flash-low', signal, timeoutMs = 120_000} = {}) {
  if (isAgyResourceExhausted()) return {success: false, error: 'RESOURCE_EXHAUSTED'};
  if (signal?.aborted) return {success: false, error: 'ABORTED'};
  const entry = startSpare(model, ['--sandbox', '--disable-slash-commands']);
  try {
    const result = await sendTurn(entry, prompt, {signal, timeoutMs});
    if (result) return {success: true, response: result.response ?? ''};
    return {success: false, error: signal?.aborted ? 'ABORTED' : isAgyResourceExhausted() ? 'RESOURCE_EXHAUSTED' : 'AGY_CLI_FAILED'};
  } finally {
    if (!entry.dead) stopChild(entry.child);
  }
}

// ───────── 对话会话 ─────────
// 面对面对话要记得前几轮，所以这里保留同一个进程：多轮共享上下文，空闲超时或轮数达上限后回收，
// 进程中途退出则下一轮换新进程（上下文从头开始）。一次只处理一轮，后到的排队。
export function createAgyConversation({model = 'gemini-3.8-flash-low', idleMs = 20 * 60_000, maxTurns = 30} = {}) {
  let entry = null, turns = 0, idleTimer = null, queue = Promise.resolve();
  const drop = () => { clearTimeout(idleTimer); const old = entry; entry = null; turns = 0; if (old && !old.dead) stopChild(old.child); };
  async function turn(prompt, {signal, timeoutMs = 60_000, first} = {}) {
    clearTimeout(idleTimer);
    if (signal?.aborted) return {result: null, fresh: false};
    if (isAgyResourceExhausted()) {
      drop();
      return {result: null, fresh: false, skipped: true, error: 'RESOURCE_EXHAUSTED'};
    }
    if (entry?.dead || turns >= maxTurns) drop();
    const fresh = !entry;
    if (fresh) {
      entry = await claimStandby(model, {signal, timeoutMs});
      if (!entry) {
        if (signal?.aborted || isAgyResourceExhausted()) return {result: null, fresh: true};
        entry = startSpare(model);
      }
      turns = 0;
    }
    const sent = fresh && first ? first + '\n\n' + prompt : prompt;
    turns++;
    const result = await sendTurn(entry, sent, {signal, timeoutMs});
    if (!result) drop();
    else {
      idleTimer = setTimeout(drop, idleMs); idleTimer.unref?.();
      if (standbyOn && (!spare || spare.dead)) startAgyStandby(standbyModel);
    }
    return {result, fresh};
  }
  return {
    // first：新会话第一轮前置的人设说明，之后的轮次不再重复。
    ask(prompt, options = {}) {
      const run = queue.then(() => tracked(() => turn(prompt, options)));
      queue = run.catch(() => {});
      return run;
    },
    get turns() { return turns; },
    get active() { return Boolean(entry && !entry.dead); },
    close: drop
  };
}

// 备用进程不能带 --json-schema，把 Schema 写进提示，自行取出 JSON 并校验。
export function extractJson(text) {
  const raw = String(text ?? '').trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  try { return JSON.parse(raw); } catch {/* 再试花括号块 */}
  const match = raw.match(/\{[\s\S]*\}/u);
  if (match) try { return JSON.parse(match[0]); } catch {/* 无效 */}
  return undefined;
}

/**
 * 调用 agy cli 执行单次 prompt 推理并解析 JSON 输出
 *
 * @param {Object} options
 * @param {string} options.prompt 提示词内容
 * @param {Object|string} [options.schema] 约束输出的 JSON Schema
 * @param {string} [options.model='gemini-3.8-flash-low'] 使用的模型
 * @param {AbortSignal} [options.signal] 取消信号
 * @param {number} [options.timeoutMs=60000] 超时时间
 * @returns {Promise<{success: boolean, response?: string, structuredOutput?: any, durationSeconds?: number, usage?: any, error?: string}>}
 */
export function runAgyPrompt(options) {
  return tracked(() => singlePrompt(options));
}

async function singlePrompt({
  prompt,
  schema,
  model = 'gemini-3.8-flash-low',
  signal,
  timeoutMs = 60000
} = {}) {
  signal?.throwIfAborted?.();
  if (isAgyResourceExhausted()) {
    return {success: false, error: 'RESOURCE_EXHAUSTED', skipped: true};
  }
  if (standbyOn) {
    const schemaText = schema ? (typeof schema === 'string' ? schema : JSON.stringify(schema)) : '';
    const warmPrompt = schema ? prompt + '\n\n只输出一个符合以下 JSON Schema 的 JSON 对象，不要附加说明或代码块。\n' + schemaText : prompt;
    const warm = await runStandby({prompt: warmPrompt, model, signal, timeoutMs});
    if (warm) {
      if (!schema) return {success: true, conversationId: warm.conversation_id, response: warm.response ?? '', durationSeconds: warm.duration_seconds, usage: warm.usage, warm: true};
      const structured = extractJson(warm.response);
      const parsedSchema = typeof schema === 'string' ? (() => { try { return JSON.parse(schema); } catch { return undefined; } })() : schema;
      if (structured !== undefined && (!parsedSchema || valid(structured, parsedSchema)))
        return {success: true, conversationId: warm.conversation_id, response: warm.response ?? '', structuredOutput: structured, durationSeconds: warm.duration_seconds, usage: warm.usage, warm: true};
    } else if (isAgyResourceExhausted()) {
      return {success: false, error: 'RESOURCE_EXHAUSTED'};
    }
  }
  const args = ['-p', prompt, '--output-format', 'json'];

  if (model) {
    args.push('--model', model);
  }

  if (schema) {
    const schemaStr = typeof schema === 'string' ? schema : JSON.stringify(schema);
    args.push('--json-schema', schemaStr);
  }

  try {
    mkdirSync(standbyDir, {recursive: true});
    const [file, fileArgs] = agyCommand(args, standbyDir);
    const {stdout, stderr} = await run(file, fileArgs, {
      cwd: standbyDir,
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      signal,
      encoding: 'utf8'
    });

    const trimmed = stdout.trim();
    if (!trimmed) {
      if (isResourceExhaustedText(stderr)) markResourceExhausted();
      return {
        success: false,
        error: stderr?.trim() || 'AGY_CLI_EMPTY_OUTPUT'
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      // 容错：若 stdout 混合了非 JSON 诊断输出，尝试提取 JSON 块
      const match = trimmed.match(/\{[\s\S]*\}/u);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {}
      }
      if (!parsed) {
        if (isResourceExhaustedText(trimmed) || isResourceExhaustedText(stderr)) markResourceExhausted();
        return {
          success: false,
          error: 'AGY_CLI_PARSE_ERROR',
          rawOutput: trimmed
        };
      }
    }

    if (parsed.status && parsed.status !== 'SUCCESS') {
      const errText = parsed.error || `AGY_CLI_${parsed.status}`;
      if (isResourceExhaustedText(errText) || isResourceExhaustedText(parsed.response) || isResourceExhaustedText(stderr)) {
        markResourceExhausted();
      }
      return {
        success: false,
        error: errText,
        details: parsed
      };
    }

    let structuredOutput = parsed.structured_output;
    // 如果指定了 schema 但 CLI 没有填 structured_output 字段，尝试解析 response
    if (schema && structuredOutput === undefined && parsed.response) {
      try {
        structuredOutput = JSON.parse(parsed.response.trim());
      } catch {}
    }

    if (standbyOn && (!spare || spare.dead)) {
      startAgyStandby(standbyModel);
    }

    return {
      success: true,
      conversationId: parsed.conversation_id,
      response: parsed.response ?? '',
      structuredOutput,
      durationSeconds: parsed.duration_seconds,
      usage: parsed.usage
    };
  } catch (error) {
    if (signal?.aborted) {
      return {success: false, error: 'ABORTED'};
    }
    if (isResourceExhaustedText(error.message) || isResourceExhaustedText(error.stderr)) {
      markResourceExhausted();
    }
    return {
      success: false,
      error: error.code === 'ETIMEDOUT' ? 'TIMEOUT' : (error.message || 'AGY_CLI_FAILED')
    };
  }
}
