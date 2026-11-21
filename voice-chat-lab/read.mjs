import { splitText } from './read-segments.mjs';

const byId = id => document.getElementById(id);
const form = byId('read-form');
const text = byId('read-text');
const start = byId('read-start');
const stop = byId('read-stop');
const status = byId('read-status');
const current = byId('read-current');
const next = byId('read-next');
const progress = byId('read-progress');
const excerpt = byId('read-excerpt');
const engines = [...form.querySelectorAll('[name=engine]')];
let session;

function showStatus(message, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}

function updateButtons() {
  start.disabled = Boolean(session) || !/[\p{L}\p{N}]/u.test(text.value);
  stop.disabled = !session || session.stopped;
  text.readOnly = Boolean(session);
  engines.forEach(engine => { engine.disabled = Boolean(session); });
}

function seconds(duration) {
  return `${duration.toFixed(1)} 秒`;
}

async function loadClip(run, segment, index) {
  const began = performance.now();
  next.textContent = `第 ${index + 1} 段 · 生成中…`;
  try {
    // V5 Turbo can stop early on a long single line. Retain short sentence boundaries
    // inside the request while the browser still queues one 30–50-character clip.
    const payload = run.engine === 'gpt'
      ? splitText(segment.text, { min: 16, max: 34, target: 30 }).map(part => part.text).join('\n')
      : segment.text;
    const response = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engine: run.engine, text: payload }),
    });
    if (!response.ok) {
      const detail = await response.json();
      throw new Error(detail.error || '本机语音暂不可用。');
    }
    const data = await response.arrayBuffer();
    if (run.stopped) return {};
    const audio = await run.context.decodeAudioData(data);
    if (!run.stopped) next.textContent = `第 ${index + 1} 段 · 已就绪`;
    return { audio, loadTime: (performance.now() - began) / 1000 };
  } catch (error) {
    if (!run.stopped) next.textContent = `第 ${index + 1} 段 · 生成失败`;
    return { error };
  }
}

function playClip(run, audio) {
  return new Promise(resolve => {
    const source = run.context.createBufferSource();
    source.buffer = audio;
    source.connect(run.context.destination);
    const finished = () => {
      source.disconnect();
      run.stopAudio = undefined;
      resolve();
    };
    source.onended = finished;
    source.start();
    run.stopAudio = () => {
      source.onended = null;
      source.stop();
      finished();
    };
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (session || start.disabled) return;
  const segments = splitText(text.value);
  const engine = engines.find(input => input.checked).value;
  const run = { engine, stopped: false };
  session = run;
  updateButtons();
  byId('read-playback').hidden = false;
  progress.max = segments.length;
  progress.value = 0;
  current.textContent = `共 ${segments.length} 段`;
  next.textContent = '';
  excerpt.textContent = '';
  showStatus('正在生成首段，首次可能需要加载模型…');

  let pending, firstWait = 0;
  try {
    run.context = new AudioContext();
    await run.context.resume();
    if (run.stopped) return;
    pending = loadClip(run, segments[0], 0);
    for (let index = 0; index < segments.length && !run.stopped; index++) {
      const clip = await pending;
      if (run.stopped) break;
      if (clip.error) throw new Error(`第 ${index + 1} 段：${clip.error.message}`);
      pending = undefined;
      if (index === 0) firstWait = clip.loadTime;
      const segment = segments[index];
      current.textContent = `第 ${index + 1} / ${segments.length} 段 · ${segment.count} 字 · ${seconds(clip.audio.duration)}`;
      excerpt.textContent = segment.text;
      showStatus(`正在朗读 · 首段等待 ${seconds(firstWait)}`);
      const playback = playClip(run, clip.audio);
      if (index + 1 < segments.length) pending = loadClip(run, segments[index + 1], index + 1);
      else next.textContent = '末段';
      await playback;
      if (!run.stopped) {
        progress.value = index + 1;
        if (pending) showStatus(`接续第 ${index + 2} 段…`);
      }
    }
    if (!run.stopped) {
      next.textContent = '已读完';
      showStatus(`朗读完成 · 首段等待 ${seconds(firstWait)}`);
    }
  } catch (error) {
    if (!run.stopped) showStatus(error.message || '朗读中断，请重试。', true);
  } finally {
    // The local synthesis call can finish independently of playback. Let it
    // settle before permitting a new run so the same model is available.
    await pending;
    await run.context?.close().catch(() => {});
    if (run.stopped) {
      next.textContent = '';
      showStatus('已停止。');
    }
    session = undefined;
    updateButtons();
  }
});

text.addEventListener('input', updateButtons);
stop.addEventListener('click', () => {
  if (!session) return;
  session.stopped = true;
  session.stopAudio?.();
  showStatus('已停止，正在结束当前合成…');
  updateButtons();
});
updateButtons();
