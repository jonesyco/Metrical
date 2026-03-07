export type WhisperStreamHandle = {
  start: (stream?: MediaStream) => Promise<void>;
  stop: () => void;
  isRunning: () => boolean;
};

export function createWhisperStream(params: {
  wsUrl: string; // "ws://localhost:3001/ws/asr"
  onPartialText: (text: string) => void;
  onError?: (msg: string) => void;
}): WhisperStreamHandle {
  let ws: WebSocket | null = null;
  let ctx: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let node: AudioWorkletNode | null = null;
  let stream: MediaStream | null = null;

  let running = false;
  let reconnectAttempts = 0;
  let reconnectTimer: number | null = null;

  async function start() {
   if (running) return;
   running = true;
   reconnectAttempts = 0;

   try {
	 ws = new WebSocket(params.wsUrl);
	 console.log("[ASR WS] connecting to", params.wsUrl);
	 ws.binaryType = "arraybuffer";

	 ws.onmessage = (ev) => {
	   try {
		 const msg = JSON.parse(ev.data as string);
		 if (msg.type === "partial") params.onPartialText(msg.text);
		 if (msg.type === "error") params.onError?.(msg.message);
	   } catch {
		 // ignore
	   }
	 };

	 ws.onopen = () => {
	   console.log("[ASR WS] open");
	   reconnectAttempts = 0;
	 };

	 ws.onclose = () => {
	   console.log("[ASR WS] close");
	   attemptReconnect();
	 };

	 ws.onerror = (e) => {
	   console.log("[ASR WS] error", e);
	   params.onError?.("WebSocket error");
	 };

      // mic
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      ctx = new AudioContext();
      // Worklet must be added before creating node
      await ctx.audioWorklet.addModule("/asr-worklet.js");

      source = ctx.createMediaStreamSource(stream);
      node = new AudioWorkletNode(ctx, "asr-processor");

      node.port.onmessage = (ev) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const float32 = ev.data; // Float32Array
        const pcm16 = downsampleFloatTo16kPCM16(float32, ctx!.sampleRate);
        if (pcm16.byteLength > 0) ws.send(pcm16);
      };

      // Connect graph (worklet needs audio flow)
      source.connect(node);
      node.connect(ctx.destination);
    } catch (e) {
      running = false;
      params.onError?.((e as Error).message);
      stop();
    }
  }

  function attemptReconnect() {
    if (!running || reconnectAttempts >= 5) return;
    const backoffMs = Math.min(10000, 1000 * Math.pow(2, reconnectAttempts));
    reconnectAttempts++;
    console.log(`[ASR WS] reconnecting in ${backoffMs}ms (attempt ${reconnectAttempts})`);
    reconnectTimer = window.setTimeout(() => start(), backoffMs);
  }

  function stop() {
    running = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;

    try { ws?.close(); } catch {}
    ws = null;

    try { node?.disconnect(); } catch {}
    node = null;

    try { source?.disconnect(); } catch {}
    source = null;

    try { ctx?.close(); } catch {}
    ctx = null;

    if (stream) {
      for (const t of stream.getTracks()) t.stop();
    }
    stream = null;
  }

  return { start, stop, isRunning: () => running };
}

function downsampleFloatTo16kPCM16(input: Float32Array, inRate: number): ArrayBuffer {
  const outRate = 16000;
  if (inRate === outRate) return floatToPCM16(input);

  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);

  let pos = 0;
  for (let i = 0; i < outLen; i++) {
    const idx = Math.floor(pos);
    const nextIdx = idx + 1;
    const frac = pos - idx;
    const current = input[idx] ?? 0;
    const next = nextIdx < input.length ? (input[nextIdx] ?? 0) : 0;
    out[i] = current * (1 - frac) + next * frac;
    pos += ratio;
  }
  return floatToPCM16(out);
}

function floatToPCM16(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}