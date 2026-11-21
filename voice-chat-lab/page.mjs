import { audioFileWav, microphoneWav, openMicrophone } from './mic-capture.mjs';

const byId = id => document.getElementById(id);
const form = byId('composer');
const message = byId('message');
const record = byId('record');
const turns = byId('turns');
const status = byId('status');
const timer = byId('timer');
const schemeInputs = [...document.querySelectorAll('[name=scheme]')];
const names = { gpt: { asr: 'Paraformer', tts: 'GPT-SoVITS' }, sense: { asr: 'SenseVoiceSmall', tts: 'MeloTTS' } };
const activeScheme = () => schemeInputs.find(input => input.checked).value;
let state = 'idle', recording, lastAudio = [], lastDictation, previous, playing;

function update(messageText, error = false) {
  status.textContent = messageText;
  status.dataset.error = String(error);
}

function setState(next) {
  state = next;
  document.querySelector('main').dataset.state = next;
  record.disabled = next !== 'idle' && next !== 'recording';
  byId('record-label').textContent = next === 'recording' ? '停止录音' : '开始录音';
  byId('sample').disabled = next !== 'idle';
  byId('repeat').disabled = next !== 'idle' || !lastAudio.length;
  byId('send').disabled = next !== 'idle' || !message.value.trim();
  schemeInputs.forEach(input => { input.disabled = next !== 'idle'; });
  timer.hidden = next !== 'recording';
}

async function request(path, body, type = 'application/json') {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': type }, body });
  if (!response.ok) {
    const { error } = await response.json();
    throw new Error(error);
  }
  return response;
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(2)} 秒`;
}

async function recognize(engine, wav) {
  const response = await request(`/api/transcribe?engine=${engine}`, wav, 'audio/wav');
  return response.json();
}

function appendText(draft, addition) {
  return [draft.trimEnd(), addition].filter(Boolean).join('\n');
}

async function transcribe(loadAudio, repeat = false) {
  const engine = activeScheme();
  const name = names[engine].asr;
  setState('transcribing');
  update(`${name} 转写中… 首次会加载模型。`);
  try {
    lastAudio = await loadAudio();
    const parts = [];
    let inferenceMs = 0, loadMs = 0;
    for (const wav of lastAudio) {
      const result = await recognize(engine, wav);
      if (result.text) parts.push(result.text);
      inferenceMs += result.inferenceMs;
      loadMs += result.loadMs;
    }
    if (!parts.length) {
      update(`${name} 没听到可转写的内容。`, true);
      return;
    }
    const draft = repeat && lastDictation?.after === message.value ? lastDictation.before : message.value;
    const after = appendText(draft, parts.join('\n'));
    message.value = after;
    lastDictation = { before: draft, after };
    update(`${name} · 转写 ${seconds(inferenceMs)}${loadMs >= 250 ? ` · 加载 ${seconds(loadMs)}` : ''}`);
    message.focus();
  } catch (error) {
    update(error.message || '转写未完成，请重试。', true);
  } finally {
    setState('idle');
  }
}

function appendLiveText(run, text) {
  const draft = message.value;
  run.edited ||= draft !== run.after;
  const caret = document.activeElement === message && [message.selectionStart, message.selectionEnd, message.selectionDirection];
  const scroll = message.scrollTop;
  run.after = appendText(draft, text);
  message.value = run.after;
  if (caret) {
    message.setSelectionRange(...caret);
    message.scrollTop = scroll;
  }
  run.transcribed++;
}

function queueAudio(run, samples, sampleRate) {
  run.queue = run.queue.then(async () => {
    if (run.abandoned) return;
    const wav = await microphoneWav(samples, sampleRate);
    if (run.abandoned) return;
    run.audio.push(wav);
    const result = await recognize(run.engine, wav);
    if (!run.abandoned && result.text) appendLiveText(run, result.text);
  }).catch(() => { run.failed++; }).then(() => {
    if (!run.stopping && !run.abandoned) {
      const failure = run.failed ? ` · ${run.failed} 段待重试` : '';
      update(`录音中 · 已转写 ${run.transcribed} 段${failure}`, Boolean(run.failed));
    }
  });
}

async function finishRecording(run, interrupted = false) {
  if (recording !== run || run.stopping) return;
  run.stopping = true;
  clearInterval(run.tick);
  setState('transcribing');
  update('录音已停止，正在处理最后的音频…');
  const flushed = await run.capture.stop();
  await run.queue;
  if (run.abandoned) return;
  if (run.audio.length) {
    lastAudio = run.audio;
    lastDictation = run.transcribed && !run.edited ? { before: run.before, after: run.after } : undefined;
  }
  recording = undefined;
  setState('idle');
  const notice = [interrupted ? '麦克风中断' : '', flushed ? '' : '末段未收齐',
    run.failed ? `${run.failed} 段转写失败，可重转写` : ''].filter(Boolean);
  if (notice.length) update(`${notice.join(' · ')}。已保留识别文字。`, true);
  else if (run.transcribed) update(`${names[run.engine].asr} · 已转写 ${run.transcribed} 段`);
  else update('没听到可转写的内容。', true);
}

record.addEventListener('click', async () => {
  if (state === 'recording') {
    void finishRecording(recording);
    return;
  }
  if (state !== 'idle') return;
  setState('permission');
  playing?.pause();
  update('正在打开麦克风…');
  const run = { engine: activeScheme(), queue: Promise.resolve(), audio: [], transcribed: 0, failed: 0 };
  recording = run;
  try {
    run.capture = await openMicrophone((samples, rate) => queueAudio(run, samples, rate), () => { void finishRecording(run, true); });
    if (run.abandoned) {
      run.capture.close();
      return;
    }
    run.before = run.after = message.value;
    const started = performance.now();
    timer.textContent = '00:00';
    setState('recording');
    update('录音中 · 正在听写…');
    run.tick = setInterval(() => {
      const duration = Math.floor((performance.now() - started) / 1000);
      const minutes = String(Math.floor(duration / 60)).padStart(2, '0');
      const seconds = String(duration % 60).padStart(2, '0');
      timer.textContent = `${minutes}:${seconds}`;
    }, 200);
  } catch {
    if (run.abandoned) return;
    recording = undefined;
    setState('idle');
    update('麦克风无法使用。请检查浏览器权限，或直接打字。', true);
  }
});

byId('sample').addEventListener('click', () => transcribe(async () => {
  const response = await fetch('/sample.mp3');
  if (!response.ok) throw new Error('测试样音暂不可用，可以用麦克风录音。');
  return [await audioFileWav(await response.blob())];
}));
byId('repeat').addEventListener('click', () => transcribe(() => lastAudio, true));
message.addEventListener('input', () => setState(state));
message.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing && !byId('send').disabled) {
    event.preventDefault();
    form.requestSubmit();
  }
});

function appendBubble(text, label, isUser = false) {
  byId('welcome').hidden = true;
  const bubble = document.createElement('article');
  bubble.className = isUser ? 'bubble user' : 'bubble';
  const meta = document.createElement('span');
  meta.className = 'bubble-meta';
  meta.textContent = label;
  const content = document.createElement('p');
  content.textContent = text;
  bubble.append(meta, content);
  turns.append(bubble);
  bubble.parentElement.parentElement.scrollTop = bubble.parentElement.parentElement.scrollHeight;
  return bubble;
}

async function playVoice(entry, engine) {
  if (state !== 'idle' && state !== 'chat') return;
  const name = names[engine].tts;
  try {
    if (!entry.audio) {
      setState('speaking');
      entry.info.textContent = '合成中…';
      update(`${name} 合成中… 首次会加载模型。`);
      const response = await request('/api/speak', JSON.stringify({ text: entry.text, engine }));
      entry.audio = new Audio(URL.createObjectURL(await response.blob()));
      entry.detail = `${name} · ${seconds(Number(response.headers.get('x-inference-ms')))}`;
      entry.button.textContent = `重听 ${name}`;
    }
    playing?.pause();
    playing = entry.audio;
    playing.currentTime = 0;
    entry.info.textContent = entry.detail;
    await playing.play();
    update(entry.info.textContent);
  } catch (error) {
    if (!entry.audio) entry.info.textContent = '合成失败';
    update(entry.audio ? `自动播放受限，请点击「重听 ${name}」。` : `${name}：${error.message}`, true);
  } finally {
    setState('idle');
  }
}

function voiceButtons(bubble, text, preferred) {
  const controls = document.createElement('div');
  controls.className = 'voice-controls';
  const info = document.createElement('small');
  const choices = [preferred, preferred === 'gpt' ? 'sense' : 'gpt'];
  const entries = choices.map(engine => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `听 ${names[engine].tts}`;
    const entry = { button, text, info };
    button.addEventListener('click', () => { if (state === 'idle') void playVoice(entry, engine); });
    controls.append(button);
    return entry;
  });
  controls.append(info);
  bubble.append(controls);
  bubble.parentElement.parentElement.scrollTop = bubble.parentElement.parentElement.scrollHeight;
  return entries[0];
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (state !== 'idle' || !message.value.trim()) return;
  const text = message.value.trim();
  if ([...text].length > 500) {
    update('听写草稿已保留。对话一次最多发送 500 字，请先保留要发的一段。', true);
    return;
  }
  const engine = activeScheme();
  playing?.pause();
  setState('chat');
  update('绯月正在思索…');
  try {
    const response = await request('/api/chat', JSON.stringify({ text, previous }));
    const { reply } = await response.json();
    previous = { user: text, reply };
    if (message.value.trim() === text) message.value = '';
    appendBubble(text, '我', true);
    const bubble = appendBubble(reply, '绯月');
    await playVoice(voiceButtons(bubble, reply, engine), engine);
  } catch (error) {
    update(error.message, true);
  } finally {
    setState('idle');
  }
});

window.addEventListener('pagehide', () => {
  if (!recording) return;
  recording.abandoned = true;
  clearInterval(recording.tick);
  recording.capture?.close();
  recording = undefined;
  setState('idle');
  update('边说边转写，停止后可修改再发送。');
});
setState('idle');
