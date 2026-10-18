// Emits short-time energy frames timestamped on the AudioContext clock.
// Message payload: Float64Array [t0, e0, t1, e1, ...] where t is the
// context time (sec) of the first sample in the hop and e its mean square.
class EnergyProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.hop = options?.processorOptions?.hopSize ?? 256;
    this.framesPerMessage = options?.processorOptions?.framesPerMessage ?? 4;
    this.acc = 0;
    this.n = 0;
    this.hopStartFrame = 0;
    this.pending = [];
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      if (this.n === 0) this.hopStartFrame = currentFrame + i;
      const s = channel[i];
      this.acc += s * s;
      this.n++;

      if (this.n === this.hop) {
        this.pending.push(this.hopStartFrame / sampleRate, this.acc / this.hop);
        this.acc = 0;
        this.n = 0;

        if (this.pending.length >= this.framesPerMessage * 2) {
          this.port.postMessage(new Float64Array(this.pending));
          this.pending = [];
        }
      }
    }
    return true;
  }
}

registerProcessor("energy-processor", EnergyProcessor);
