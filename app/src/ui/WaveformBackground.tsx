import { useEffect, useRef } from "react";

type Props = {
  isActive: boolean;
  stream: MediaStream | null;

  // Increment this on each detected word to create a brief “pop” pulse.
  pulseToken: number;

  // Optional word label to float over the waveform.
  label?: string;
};

export default function WaveformBackground({ isActive, stream, pulseToken, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  // Pulse window (ms) set whenever pulseToken changes.
  const pulseUntilRef = useRef<number>(0);

  useEffect(() => {
    // Only initialize audio analysis when active AND we have a stream.
    if (!isActive || !stream) return;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const analyser = ctx.createAnalyser();
    analyserRef.current = analyser;

    // Smoother waveform
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.92;

    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    dataRef.current = new Uint8Array(bufferLength);

    const draw = () => {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      const data = dataRef.current;

      if (!canvas || !analyser || !data) return;

      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      // Resize canvas to match CSS size with DPR
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      //const buf = data as Uint8Array;
      analyser.getByteTimeDomainData(data as Uint8Array);

      // Clear
      ctx2d.clearRect(0, 0, w, h);

      // Pulse state
      const now = performance.now();
      const pulsing = now < pulseUntilRef.current;

      // ---------- NOISE GATE (flat line when quiet) ----------
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / data.length);

      // Tune this: higher = flatter baseline more often
      const GATE = 0.02;

      if (rms < GATE) {
        ctx2d.globalAlpha = 0.20;
        ctx2d.lineWidth = pulsing ? 4 : 2.5;
        ctx2d.strokeStyle = "#39FF14";
        ctx2d.shadowBlur = 18;
        ctx2d.shadowColor = "#39FF14";
        // ctx2d.strokeStyle = "rgba(255,255,255,0.65)";
        ctx2d.beginPath();
        ctx2d.moveTo(0, h / 2);
        ctx2d.lineTo(w, h / 2);
        ctx2d.stroke();

        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // ---------- amplitude / gain (declare BEFORE use) ----------
      // "Volts" is overall gain. Increase slowly (1.4–2.4 recommended)
      const volts = 1.8;
      const baseHeight = 0.22;
      const amp = (pulsing ? 2.0 : 1.2) * volts;

      // Style
      ctx2d.globalAlpha = pulsing ? 0.45 : 0.25;

      // ---------- DECIMATE + SMOOTH (reduces pixelation) ----------
      const step = 6; // 4–10; bigger = smoother
      const points = Math.max(1, Math.floor(data.length / step));
      const sliceW = w / points;

      ctx2d.beginPath();
      for (let p = 0; p < points; p++) {
        const start = p * step;

        let acc = 0;
        for (let j = 0; j < step; j++) {
          acc += (data[start + j] - 128) / 128;
        }
        const v = acc / step;

        const x = p * sliceW;
        const y = h / 2 + v * (h * baseHeight) * amp;

        if (p === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }

      ctx2d.lineWidth = pulsing ? 4 : 2.5;
      ctx2d.strokeStyle = "#39FF14";
      ctx2d.stroke();

      // Optional label
      if (label && label.trim().length > 0) {
        ctx2d.globalAlpha = pulsing ? 0.70 : 0.35;
        ctx2d.font = "700 44px system-ui";
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        ctx2d.fillStyle = "rgba(255,255,255,0.95)";
        ctx2d.fillText(label.toUpperCase(), w / 2, h * 0.35);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      try {
        source.disconnect();
      } catch { }
      try {
        analyser.disconnect();
      } catch { }

      try {
        ctx.close();
      } catch { }

      sourceRef.current = null;
      analyserRef.current = null;
      audioCtxRef.current = null;
      dataRef.current = null;
    };
  }, [isActive, stream, label]);

  // Pulse on each word
  useEffect(() => {
    if (!isActive) return;
    pulseUntilRef.current = performance.now() + 180;
  }, [pulseToken, isActive]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "55vh",
          marginTop: "10vh",
          filter: "blur(0.5px)",
          opacity: 0.9,
        }}
      />
    </div>
  );
}