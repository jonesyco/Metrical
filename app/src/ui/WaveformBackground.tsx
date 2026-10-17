import { useEffect, useRef } from "react";

type WaveformBackgroundProps = {
  isActive: boolean;
  stream: MediaStream | null;
  pulseToken?: number;
  label?: string;
};

export default function WaveformBackground({
  isActive,
  stream,
  pulseToken = 0,
  label = "",
}: WaveformBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const pulseStrengthRef = useRef(0);

  useEffect(() => {
    pulseStrengthRef.current = isActive ? 1 : 0.35;
  }, [pulseToken, isActive]);

  useEffect(() => {
    if (!stream) {
      cleanupAudio();
      return;
    }

    let cancelled = false;
    const micStream = stream;

    async function setup() {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;

        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.86;

        const source = ctx.createMediaStreamSource(micStream);
        source.connect(analyser);

        const data = new Uint8Array(analyser.fftSize);

        if (cancelled) {
          source.disconnect();
          void ctx.close();
          return;
        }

        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current = source;
        dataArrayRef.current = data;
      } catch (err) {
        console.error("WaveformBackground setup failed:", err);
      }
    }

    void setup();

    return () => {
      cancelled = true;
      cleanupAudio();
    };
  }, [stream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let mounted = true;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (width === 0 || height === 0) return;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      if (!mounted) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const centerY = Math.floor(height * 0.52);
      const time = performance.now() * 0.001;

      ctx.clearRect(0, 0, width, height);

      drawBackground(ctx, width, height);
      drawGrid(ctx, width, height, centerY, time);

      const samples = getWaveSamples(isActive, analyserRef.current, dataArrayRef.current, time);
      drawWaveform(ctx, width, centerY, samples, {
        amplitude: isActive ? 110 : 32,
        lineWidth: isActive ? 2.8 : 1.8,
        stroke: isActive ? "rgba(100, 220, 255, 0.42)" : "rgba(100, 190, 230, 0.22)",
        glow: isActive ? 18 : 0,
      });

      drawWaveform(ctx, width, centerY + 18, samples, {
        amplitude: isActive ? 58 : 16,
        lineWidth: 1.3,
        stroke: "rgba(255, 180, 120, 0.08)",
        glow: 0,
      });

      drawWaveform(ctx, width, centerY - 22, samples, {
        amplitude: isActive ? 44 : 12,
        lineWidth: 1.1,
        stroke: "rgba(255,255,255,0.05)",
        glow: 0,
      });

      drawCenterGlow(ctx, width, height, centerY, pulseStrengthRef.current, isActive);
      drawLabel(ctx, width, height, label, isActive);

      pulseStrengthRef.current = Math.max(
        isActive ? 0.16 : 0.08,
        pulseStrengthRef.current * 0.92
      );

      animationFrameRef.current = window.requestAnimationFrame(draw);
    };

    animationFrameRef.current = window.requestAnimationFrame(draw);

    return () => {
      mounted = false;
      window.removeEventListener("resize", resize);

      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isActive, label, pulseToken]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
        opacity: isActive ? 0.95 : 0.3,
        transition: "opacity 180ms ease",
      }}
    />
  );

  function cleanupAudio() {
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceRef.current = null;
    }

    analyserRef.current = null;
    dataArrayRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "rgba(5, 10, 16, 0.10)");
  bg.addColorStop(0.45, "rgba(5, 10, 16, 0.05)");
  bg.addColorStop(1, "rgba(4, 8, 12, 0.16)");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.55,
    Math.min(width, height) * 0.18,
    width * 0.5,
    height * 0.55,
    Math.max(width, height) * 0.75
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.28)");

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerY: number,
  time: number
) {
  ctx.save();
  ctx.lineWidth = 1;

  const verticalSpacing = 88;
  const horizontalSpacing = 84;
  const drift = (time * 12) % verticalSpacing;

  for (let x = -verticalSpacing; x < width + verticalSpacing; x += verticalSpacing) {
    ctx.strokeStyle = "rgba(130, 190, 220, 0.035)";
    ctx.beginPath();
    ctx.moveTo(x + drift, 0);
    ctx.lineTo(x + drift, height);
    ctx.stroke();
  }

  for (let y = centerY - horizontalSpacing * 4; y <= centerY + horizontalSpacing * 4; y += horizontalSpacing) {
    ctx.strokeStyle =
      y === centerY
        ? "rgba(100, 210, 240, 0.10)"
        : "rgba(130, 190, 220, 0.03)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function getWaveSamples(
  isActive: boolean,
  analyser: AnalyserNode | null,
  dataArray: Uint8Array<ArrayBuffer> | null,
  time: number
) {
  const points: number[] = [];

  if (isActive && analyser && dataArray) {
    analyser.getByteTimeDomainData(dataArray);

    const step = Math.max(1, Math.floor(dataArray.length / 220));
    for (let i = 0; i < dataArray.length; i += step) {
      const normalized = (dataArray[i] - 128) / 128;
      points.push(normalized);
    }
  } else {
    const count = 220;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const wave =
        Math.sin(t * 9 + time * 1.2) * 0.16 +
        Math.sin(t * 21 - time * 0.7) * 0.05 +
        Math.sin(t * 3.4 + time * 0.35) * 0.10;

      points.push(wave * 0.42);
    }
  }

  return smooth(points);
}

function smooth(values: number[]) {
  if (values.length < 3) return values;

  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const prev = values[i - 1] ?? values[i];
    const cur = values[i];
    const next = values[i + 1] ?? values[i];
    out.push(prev * 0.2 + cur * 0.6 + next * 0.2);
  }
  return out;
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  width: number,
  centerY: number,
  values: number[],
  options: {
    amplitude: number;
    lineWidth: number;
    stroke: string;
    glow: number;
  }
) {
  if (!values.length) return;

  ctx.save();
  ctx.beginPath();

  values.forEach((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = centerY + value * options.amplitude;

    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.lineWidth = options.lineWidth;
  ctx.strokeStyle = options.stroke;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = options.glow;
  ctx.shadowColor = options.stroke;
  ctx.stroke();
  ctx.restore();
}

function drawCenterGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerY: number,
  pulseStrength: number,
  isActive: boolean
) {
  const glow = ctx.createRadialGradient(
    width * 0.5,
    centerY,
    0,
    width * 0.5,
    centerY,
    Math.min(width, height) * 0.28
  );

  glow.addColorStop(
    0,
    isActive
      ? `rgba(90, 210, 255, ${0.05 + pulseStrength * 0.06})`
      : "rgba(90, 210, 255, 0.03)"
  );
  glow.addColorStop(1, "rgba(90, 210, 255, 0)");

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  label: string,
  isActive: boolean
) {
  if (!label) return;

  ctx.save();
  ctx.font = "700 12px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = isActive ? "rgba(225, 240, 248, 0.18)" : "rgba(225, 240, 248, 0.10)";
  ctx.fillText(label.toUpperCase(), width * 0.5, height * 0.74);
  ctx.restore();
}