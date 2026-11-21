import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { splitText } from './bubble-voice-segments.mjs';

export function installBubbleMicrophonePolicy(session, allowed) {
  session.setPermissionRequestHandler((contents, permission, reply, details) => reply(Boolean(
    permission === 'media' && details?.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'
    && allowed(contents, details),
  )));
  session.setPermissionCheckHandler?.((contents, permission, _origin, details) => Boolean(
    permission === 'media' && details?.mediaType === 'audio' && allowed(contents, details),
  ));
}

function speechWorker({ python, script, runtime, reference, cache, mode, device = 'auto' }) {
  let child, pending, exited;

  function close(message = '语音操作已结束。') {
    const process = child;
    child = undefined;
    process?.kill();
    pending?.finish({ error: message });
    return exited;
  }

  function start() {
    mkdirSync(cache, { recursive: true });
    const worker = spawn(python, ['-X', 'utf8', '-B', '-u', script, mode, runtime, reference, cache], {
      cwd: cache, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1',
        GRADIO_ANALYTICS_ENABLED: 'False', OMP_NUM_THREADS: '4', FEIYUE_TTS_DEVICE: device },
    });
    const failed = () => { if (child === worker) close('本机语音进程未就绪，请重试。'); };
    worker.on('error', failed);
    worker.on('exit', failed);
    exited = new Promise(resolveExit => worker.once('close', resolveExit));
    worker.stdin.on('error', failed);
    createInterface({ input: worker.stdout }).on('line', line => {
      if (child !== worker || !pending) return;
      try {
        const result = JSON.parse(line);
        if (result.id === pending.id) pending.finish(result);
      } catch { /* 第三方库可能在标准输出打印运行信息。 */ }
    });
    return worker;
  }

  async function run(payload) {
    if (pending) return { error: '上一段语音正在处理。' };
    try { child ??= start(); }
    catch { return { error: '语音工作目录或运行环境未就绪。' }; }
    return new Promise(resolveResult => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => close('本机语音处理超时，请重试。'), 150_000);
      pending = { id, finish(result) {
        clearTimeout(timeout);
        pending = undefined;
        resolveResult(result);
      } };
      child.stdin.write(JSON.stringify({ id, ...payload }) + '\n');
    });
  }

  return { run, close };
}

export function createBubbleVoice({ root, profile, ttsDevice = 'auto' }) {
  const runtime = resolve(process.env.FEIYUE_SOVITS_PATH ?? 'G:/selftool/voice/GPT-SoVITS-v5-20261006');
  const reference = resolve(process.env.FEIYUE_VOICE_REFERENCE ?? 'G:/voicesample/新建文件夹');
  const python = join(runtime, 'runtime', 'python.exe');
  const script = resolve(root, 'desktop/bubble-voice-worker.py');
  const cache = resolve(profile, ttsDevice === 'gpu' ? 'private-voice-runtime' : 'voice-runtime');
  const enabled = process.platform === 'win32' && existsSync(python) && existsSync(script);
  const asr = speechWorker({ python, script, runtime, reference, cache, mode: 'asr' });
  const tts = speechWorker({ python, script, runtime, reference, cache, mode: 'tts', device: ttsDevice });
  return {
    enabled,
    async transcribe(wav) {
      if (!enabled) return { error: '本机 GPT-SoVITS 运行环境未就绪。' };
      if (!(wav instanceof Uint8Array) || wav.byteLength < 3244 || wav.byteLength > 256044) return { error: '录音段格式无效。' };
      const result = await asr.run({ audio: Buffer.from(wav).toString('base64') });
      return result.error ? { error: result.error } : { text: result.text };
    },
    async render(text) {
      if (!enabled) return { error: '本机 GPT-SoVITS 运行环境未就绪。' };
      if (typeof text !== 'string' || text.length > 1200) return { error: '朗读段长度无效。' };
      const segments = splitText(text, { min: 16, max: 34, target: 30 });
      const count = segments.reduce((total, part) => total + part.count, 0);
      if (count < 1 || count > 50) return { error: '朗读段长度无效。' };
      const result = await tts.run({ text: segments.map(part => part.text).join('\n') });
      return result.error ? { error: result.error } : { wav: Uint8Array.from(Buffer.from(result.wav, 'base64')) };
    },
    stopRecording: () => asr.close(),
    stopSpeaking: () => tts.close(),
    close() { return Promise.allSettled([asr.close(), tts.close()]); },
  };
}
