class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.offset = 0;
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch && ch.length > 0) {
      const ratio = sampleRate / this.targetSampleRate;
      const out = new Int16Array(Math.ceil((ch.length - this.offset) / ratio));
      let outIndex = 0;
      let position = this.offset;
      for (; position < ch.length; position += ratio) {
        const start = Math.floor(position);
        const end = Math.min(ch.length, Math.floor(position + ratio));
        let sum = 0;
        for (let i = start; i < end; i++) sum += ch[i];
        const s = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
        out[outIndex++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.offset = position - ch.length;
      const pcm = out.slice(0, outIndex);
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PcmProcessor);
