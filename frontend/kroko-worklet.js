// Kroko audio capture: mono PCM16 at 16 kHz; operates off the UI thread.
class KrokoAudioProcessor extends AudioWorkletProcessor {
 constructor() {
  super();
  this.phase = 0;
  this.previous = 0;
  this.buffer = new Int16Array(1600); // 100ms per Wails frame.
  this.used = 0;
 }
 process(inputs) {
  const input = inputs[0];
  if (!input?.length || !input[0]?.length) return true;
  const channels = input.length;
  const frames = input[0].length;
  const step = sampleRate / 16000;
  // Streaming resampling with fractional interpolation and state across callbacks.
  let p = this.phase;
  while (p < frames) {
   const index = Math.floor(p);
   const fraction = p - index;
   let x = 0;
   for (let ch = 0; ch < channels; ch++) {
    const data = input[ch];
    const a = index === 0 ? this.previous : data[index - 1];
    x += a + (data[index] - a) * fraction;
   }
   x /= channels;
   this.buffer[this.used++] = Math.round(Math.max(-1, Math.min(1, x)) * 32767);
   if (this.used === this.buffer.length) {
    this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
    this.buffer = new Int16Array(1600);
    this.used = 0;
   }
   p += step;
  }
  this.phase = p - frames;
  this.previous = input[0][frames - 1];
  return true;
 }
}
registerProcessor("kroko-audio", KrokoAudioProcessor);
