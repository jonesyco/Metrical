import { OnsetDetector, type Onset } from "../engine/OnsetDetector";
import { startMic } from "./Recorder";

export type LiveCaptureHandle = {
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    stop: () => void;
};

const loadedModules = new WeakMap<AudioContext, Map<string, Promise<void>>>();

/** Adds an AudioWorklet module to `ctx` once, no matter how often it's requested. */
export function ensureWorkletModule(ctx: AudioContext, url: string): Promise<void> {
    let perCtx = loadedModules.get(ctx);
    if (!perCtx) {
        perCtx = new Map();
        loadedModules.set(ctx, perCtx);
    }
    let p = perCtx.get(url);
    if (!p) {
        p = ctx.audioWorklet.addModule(url);
        perCtx.set(url, p);
    }
    return p;
}

/**
 * Opens the mic inside the metronome's AudioContext and runs onset detection
 * on it. Onset times are on the same clock as the scheduled clicks, so they
 * can be compared directly with the beat grid (minus calibrated latency).
 */
export async function startLiveCapture(
    ctx: AudioContext,
    params: { onOnset: (onset: Onset) => void }
): Promise<LiveCaptureHandle> {
    const stream = await startMic();
    if (ctx.state !== "running") await ctx.resume();

    await ensureWorkletModule(ctx, "/energy-worklet.js");

    const source = ctx.createMediaStreamSource(stream);

    // Cut low rumble and the "thud" metronome bleed before measuring energy.
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 150;

    const energyNode = new AudioWorkletNode(ctx, "energy-processor", {
        processorOptions: { hopSize: 256, framesPerMessage: 4 },
    });

    // Keeps the worklet pulled by the graph without making any sound.
    const sink = ctx.createGain();
    sink.gain.value = 0;

    const detector = new OnsetDetector();
    energyNode.port.onmessage = (ev: MessageEvent<Float64Array>) => {
        const frames = ev.data;
        for (let i = 0; i + 1 < frames.length; i += 2) {
            const onset = detector.push(frames[i], frames[i + 1]);
            if (onset) params.onOnset(onset);
        }
    };

    source.connect(highpass);
    highpass.connect(energyNode);
    energyNode.connect(sink);
    sink.connect(ctx.destination);

    return {
        stream,
        source,
        stop: () => {
            energyNode.port.onmessage = null;
            for (const node of [source, highpass, energyNode, sink]) {
                try { node.disconnect(); } catch { /* already disconnected */ }
            }
            for (const t of stream.getTracks()) t.stop();
        },
    };
}
