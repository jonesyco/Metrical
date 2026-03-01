class AsrProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    // Float32 PCM at the context sample rate (often 48000)
    const channel = input[0];
    this.port.postMessage(channel);
    return true;
  }
}

registerProcessor("asr-processor", AsrProcessor);