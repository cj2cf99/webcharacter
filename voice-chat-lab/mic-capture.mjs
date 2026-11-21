const asrRate = 16000;

function encodePcm(samples) {
  const wav = new Uint8Array(44 + 2 * samples.length);
  const view = new DataView(wav.buffer);
  const fourCC = (offset, text) => wav.set(new TextEncoder().encode(text), offset);
  fourCC(0, 'RIFF');
  view.setUint32(4, wav.length - 8, true);
  fourCC(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, asrRate, true);
  view.setUint32(28, asrRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  fourCC(36, 'data');
  view.setUint32(40, wav.length - 44, true);
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + 2 * index, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return wav;
}

export async function audioFileWav(blob) {
  const audio = await new OfflineAudioContext(1, 1, asrRate).decodeAudioData(await blob.arrayBuffer());
  const mono = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel);
    for (let index = 0; index < samples.length; index++) mono[index] += samples[index] / audio.numberOfChannels;
  }
  return encodePcm(mono);
}

export async function microphoneWav(samples, sampleRate) {
  if (sampleRate === asrRate) return encodePcm(samples);
  const output = new OfflineAudioContext(1, Math.round(samples.length * asrRate / sampleRate), asrRate);
  const buffer = output.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  const source = output.createBufferSource();
  source.buffer = buffer;
  source.connect(output.destination);
  source.start();
  const resampled = await output.startRendering();
  return encodePcm(resampled.getChannelData(0));
}

export async function openMicrophone(onAudio, onInterrupted) {
  let stream, context, node, source, deadline;
  let finished = false, stopping = false, resolveFlush;
  const flushed = new Promise(resolve => { resolveFlush = resolve; });

  function close(gotTail = false) {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    source?.disconnect();
    node?.disconnect();
    node?.port.close();
    stream?.getTracks().forEach(track => track.stop());
    void context?.close().catch(() => {});
    resolveFlush(gotTail);
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
    context = new AudioContext();
    await Promise.all([context.resume(), context.audioWorklet.addModule('/mic-processor.mjs')]);
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'speech-capture', { channelCount: 1, channelCountMode: 'explicit' });
    node.port.onmessage = ({ data }) => {
      if (data.type === 'stopped') close(true);
      if (data.type === 'audio' && data.samples.length >= Math.ceil(context.sampleRate * 0.1)) {
        onAudio(data.samples, context.sampleRate);
      }
    };
    node.onprocessorerror = () => {
      close();
      onInterrupted();
    };
    for (const track of stream.getAudioTracks()) {
      if (track.readyState === 'ended') throw new Error('麦克风已断开。');
      track.addEventListener('ended', onInterrupted, { once: true });
    }
    // The processor leaves its output silent and retains a live rendering connection.
    source.connect(node).connect(context.destination);
  } catch (error) {
    close();
    throw error;
  }

  return {
    stop() {
      if (!finished && !stopping) {
        stopping = true;
        deadline = setTimeout(close, 750);
        node.port.postMessage('stop');
      }
      return flushed;
    },
    close,
  };
}
