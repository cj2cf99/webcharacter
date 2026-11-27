import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

function speechWorker({ python, script, runtime, cache, mode, device = 'auto', senseVoiceModel, keepWarm }) {
  let child, pending, exited, idleTimer;

  function close(message = '语音操作已结束。') {
    clearTimeout(idleTimer);
    const process = child;
    child = undefined;
    process?.kill();
    pending?.finish({ error: message });
    return exited;
  }

  function start() {
    mkdirSync(cache, { recursive: true });
    const worker = spawn(python, ['-X', 'utf8', '-B', '-u', script, mode, runtime, cache], {
      cwd: cache, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1',
        GRADIO_ANALYTICS_ENABLED: 'False', OMP_NUM_THREADS: '4', FEIYUE_TTS_DEVICE: device,
        ...(senseVoiceModel?{FEIYUE_SENSEVOICE_MODEL:senseVoiceModel}:{}) },
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
    const worker = child;
    clearTimeout(idleTimer);
    return new Promise(resolveResult => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => close('本机语音处理超时，请重试。'), 150_000);
      pending = { id, finish(result) {
        clearTimeout(timeout);
        pending = undefined;
        if (mode === 'asr' && !keepWarm && child === worker) idleTimer = setTimeout(() => close(), 5 * 60_000).unref();
        resolveResult(result);
      } };
      child.stdin.write(JSON.stringify({ id, ...payload }) + '\n');
    });
  }

  return { run, close };
}

export function createBubbleVoice({ root, profile, ttsDevice = 'auto' }) {
  const runtime = resolve(process.env.FEIYUE_SOVITS_PATH ?? 'G:/selftool/voice/GPT-SoVITS-v5-20261006');
  const voices = resolve(process.env.FEIYUE_VOICE_ROOT ?? 'G:/voicesample');
  // voices.json 把用途（default / study）指到音色目录名；每次读取，改配置即时生效。
  const voiceConfig = join(voices, 'voices.json');
  const readConfig = () => JSON.parse(readFileSync(voiceConfig, 'utf8').replace(/^\uFEFF/u, ''));
  function voiceFolder(use) {
    try {
      const name = readConfig()[use];
      if (typeof name === 'string' && name) return join(voices, name);
    } catch { /* 与缺少用途一起按配置无效处理。 */ }
  }
  // 可选音色：正好含一个 WAV 和一个 TXT 的子目录。
  function listVoices() {
    return readdirSync(voices, { withFileTypes: true }).filter(entry => {
      if (!entry.isDirectory()) return false;
      const files = readdirSync(join(voices, entry.name)).map(name => name.toLowerCase());
      return ['.wav', '.txt'].every(end => files.filter(name => name.endsWith(end)).length === 1);
    }).map(entry => entry.name);
  }
  const noVoice = use => ({ error: `请在 ${join(voices, 'voices.json')} 填写 ${use} 对应的音色目录名。` });
  const python = join(runtime, 'runtime', 'python.exe');
  const script = resolve(root, 'desktop/bubble-voice-worker.py');
  const cache = resolve(profile, ttsDevice === 'gpu' ? 'private-voice-runtime' : 'voice-runtime');
  const enabled = process.platform === 'win32' && existsSync(python) && existsSync(script);
  // 安装版根目录旁没有模型，沿用公共模型目录。
  const localModel = join(root,'../work/sensevoice-small/model');
  const senseVoiceModel = resolve(process.env.FEIYUE_SENSEVOICE_MODEL ??
    (existsSync(join(localModel,'model.pt')) ? localModel : 'G:/selftool/WebCharacter/work/sensevoice-small/model'));
  const canTranscribe=language=>enabled&&(language!=='ja'||existsSync(join(senseVoiceModel,'model.pt')));
  const asr = speechWorker({ python, script, runtime, cache, mode: 'asr', senseVoiceModel, keepWarm: ttsDevice==='gpu' });
  const tts = speechWorker({ python, script, runtime, cache, mode: 'tts', device: ttsDevice });
  let preheating;
  return {
    enabled,
    canTranscribe,
    voices(use = 'default') { return { list: listVoices(), current: readConfig()[use] }; },
    chooseVoice(use, name) {
      if (!listVoices().includes(name)) throw Error('这个音色目录不可用。');
      writeFileSync(voiceConfig, JSON.stringify({ ...readConfig(), [use]: name }, null, 2) + '\n');
      return name;
    },
    preheat() {
      if (!enabled) return { error: '本机听写环境未就绪。' };
      return preheating ??= asr.run({ preheat: true }).finally(() => { preheating = undefined; });
    },
    preheatSpeaking() {
      if (!enabled) return { error: '本机 GPT-SoVITS 运行环境未就绪。' };
      const voice = voiceFolder('default');
      return voice ? tts.run({ preheat: true, voice }) : noVoice('default');
    },
    async transcribe(wav,language='zh') {
      if (!canTranscribe(language)) return { error: language==='ja'?'本机日语听写模型未就绪。':'本机 GPT-SoVITS 运行环境未就绪。' };
      if (!(wav instanceof Uint8Array) || wav.byteLength < 3244 || wav.byteLength > 256044) return { error: '录音段格式无效。' };
      if (preheating) {
        const warmed = await preheating;
        if (!warmed.ready) return { error: warmed.error };
      }
      const result = await asr.run({ audio: Buffer.from(wav).toString('base64'),...(language==='ja'?{language}:{}) });
      return result.error ? { error: result.error } : { text: result.text };
    },
    // use 决定音色和朗读语言：日常中文用 default，日语对练用 study。
    async render(text, use = 'default') {
      if (!enabled) return { error: '本机 GPT-SoVITS 运行环境未就绪。' };
      if (typeof text !== 'string' || text.length > 1200) return { error: '朗读段长度无效。' };
      const segments = splitText(text, { min: 16, max: 34, target: 30 });
      const count = segments.reduce((total, part) => total + part.count, 0);
      if (count < 1 || count > 50) return { error: '朗读段长度无效。' };
      const voice = voiceFolder(use);
      if (!voice) return noVoice(use);
      const result = await tts.run({ text: segments.map(part => part.text).join('\n'), voice,
        language: use === 'study' ? 'ja' : 'zh' });
      return result.error ? { error: result.error } : { wav: Uint8Array.from(Buffer.from(result.wav, 'base64')) };
    },
    stopRecording: () => asr.close(),
    stopSpeaking: () => tts.close(),
    close() { return Promise.allSettled([asr.close(), tts.close()]); },
  };
}
