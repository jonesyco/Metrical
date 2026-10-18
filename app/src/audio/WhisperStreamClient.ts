import { ensureWorkletModule } from "./LiveCapture";

export type AsrStatus = "idle" | "connecting" | "open" | "closed";

export type WhisperStreamHandle = {
  /** Streams `source` (which must belong to `ctx`) to the ASR server. */
  start: (ctx: AudioContext, source: AudioNode) => Promise<void>;
  stop: () => void;
  isRunning: () => boolean;
};

export function createWhisperStream(params: {
  wsUrl: string; // "ws://localhost:3001/ws/asr"
  onPartialText: (text: string) => void;
  onError?: (msg: string) => void;
  onStatus?: (status: AsrStatus) => void;
}): WhisperStreamHandle {
  let ws: WebSocket | null = null;
  let node: AudioWorkletNode | null = null;
  let sink: GainNode | null = null;
  let sampleRate = 48000;

  let running = false;
  let reconnectAttempts = 0;
  let reconnectTimer: number | null = null;

  function connect() {
    params.onStatus?.("connecting");
    const socket = new WebSocket(params.wsUrl);
    socket.binaryType = "arraybuffer";
    ws = socket;

    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "partial") params.onPartialText(msg.text);
        if (msg.type === "error") params.onError?.(msg.message);
      } catch {
        // ignore non-JSON frames
      }
    };

    socket.onopen = () => {
      reconnectAttempts = 0;
      params.onStatus?.("open");
    };

    socket.onclose = () => {
      if (ws !== socket) return;
      params.onStatus?.("closed");
      attemptReconnect();
    };

    socket.onerror = () => {
      params.onError?.("WebSocket error");
    };
  }

  async function start(ctx: AudioContext, source: AudioNode) {
    if (running) return;
    running = true;
    reconnectAttempts = 0;
    sampleRate = ctx.sampleRate;

    try {
      connect();

      await ensureWorkletModule(ctx, "/asr-worklet.js");
      node = new AudioWorkletNode(ctx, "asr-processor");

      node.port.onmessage = (ev) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const pcm16 = downsampleFloatTo16kPCM16(ev.data as Float32Array, sampleRate);
        if (pcm16.byteLength > 0) ws.send(pcm16);
      };

      // Worklet needs to be pulled by the graph; route it through a muted gain.
      sink = ctx.createGain();
      sink.gain.value = 0;
      source.connect(node);
      node.connect(sink);
      sink.connect(ctx.destination);
    } catch (e) {
      params.onError?.((e as Error).message);
      stop();
    }
  }

  function attemptReconnect() {
    if (!running || reconnectAttempts >= 5) return;
    const backoffMs = Math.min(10000, 1000 * Math.pow(2, reconnectAttempts));
    reconnectAttempts++;
    reconnectTimer = window.setTimeout(() => {
      if (running) connect();
    }, backoffMs);
  }

  function stop() {
    running = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;

    const socket = ws;
    ws = null;
    try { socket?.close(); } catch { /* already closed */ }

    if (node) node.port.onmessage = null;
    try { node?.disconnect(); } catch { /* already disconnected */ }
    node = null;

    try { sink?.disconnect(); } catch { /* already disconnected */ }
    sink = null;

    params.onStatus?.("idle");
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
