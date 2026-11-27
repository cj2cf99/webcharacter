import { splitText } from './bubble-voice-segments.mjs';

// 对练里 A 的台词：换到新台词就自动朗读，可停止和重放。停止只停播放，发音服务由宿主保留到关窗。
export function bindLineVoice(api, { button, status, blocked }) {
  let line = '', turn = '', playing;
  function update() {
    button.hidden = !line;
    button.disabled = !playing && blocked();
    button.textContent = playing ? '停止朗读' : '重放';
    button.dataset.playing = String(Boolean(playing?.source));
  }
  function show(text, error = false) {
    status.textContent = text;
    status.hidden = !text;
    status.dataset.error = String(error);
    update();
  }
  function stop() {
    const run = playing;
    if (!run) return;
    playing = undefined;
    run.source?.stop();
    void run.context.close();
    show('');
  }
  async function play() {
    stop();
    if (!line || blocked()) return;
    const run = playing = { context: new AudioContext() };
    const parts = splitText(line);
    async function load(part) {
      try {
        const result = await api.synthesize(part.text);
        if (playing !== run) return {};
        if (result.error) return { error: result.error };
        const { wav } = result;
        const buffer = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
        return { audio: await run.context.decodeAudioData(buffer) };
      } catch { return { error: '本机语音合成中断，请重放。' }; }
    }
    show('正在准备朗读，可以先继续对话…');
    let next = parts.length ? load(parts[0]) : undefined, failure = '';
    for (let index = 0; index < parts.length; index++) {
      const result = await next;
      if (playing !== run) return;
      if (!result.audio) { failure = result.error ?? '本机语音合成中断，请重放。'; break; }
      const source = run.source = run.context.createBufferSource();
      source.buffer = result.audio;
      source.connect(run.context.destination);
      const ended = new Promise(resolve => { source.onended = resolve; });
      source.start();
      show('正在朗读…');
      if (index + 1 < parts.length) next = load(parts[index + 1]);
      await ended;
      if (playing !== run) return;
    }
    playing = undefined;
    void run.context.close();
    show(failure, Boolean(failure));
  }
  button.addEventListener('click', () => { if (playing) stop(); else void play(); });
  // 录音时停下朗读，避免把绯月的声音录进去。
  window.addEventListener('feiyue-dictation-change', () => { if (blocked()) stop(); update(); });
  window.addEventListener('pagehide', stop);
  update();
  return {
    replay: () => void play(),
    get line() { return line; },
    // 同一轮同一句的重绘不打断、不重播。
    setLine(text, key = '') {
      if (text === line && key === turn) return update();
      stop();
      line = text;
      turn = key;
      show('');
      void play();
    },
  };
}
