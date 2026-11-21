class SpeechCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(Math.round(sampleRate * 8));
    this.minimum = Math.round(sampleRate * 2.5);
    this.pause = Math.round(sampleRate * 0.4);
    this.used = 0;
    this.quiet = 0;
    this.spoke = false;
    this.stopped = false;
    this.port.onmessage = () => {
      this.stopped = true;
      this.flush();
      this.port.postMessage({ type: 'stopped' });
    };
  }

  flush() {
    if (this.used) {
      const samples = this.buffer.slice(0, this.used);
      this.port.postMessage({ type: 'audio', samples }, [samples.buffer]);
    }
    this.used = 0;
    this.quiet = 0;
    this.spoke = false;
  }

  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0]?.[0];
    if (!input?.length) return true;

    let energy = 0;
    for (const sample of input) energy += sample * sample;
    const voiced = energy / input.length >= 0.0001;
    let offset = 0;
    while (offset < input.length) {
      const size = Math.min(input.length - offset, this.buffer.length - this.used);
      this.buffer.set(input.subarray(offset, offset + size), this.used);
      this.used += size;
      offset += size;
      this.spoke ||= voiced;
      this.quiet = voiced ? 0 : this.quiet + size;
      if (this.used === this.buffer.length || (this.spoke && this.used >= this.minimum && this.quiet >= this.pause)) {
        this.flush();
      }
    }
    return true;
  }
}

registerProcessor('speech-capture', SpeechCapture);
