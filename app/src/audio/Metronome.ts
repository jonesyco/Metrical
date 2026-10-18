export type MetronomeSound = "thud" | "click" | "beep" | "wood" | "beat";

export type MetronomeHandle = {
    start: () => void;
    stop: () => void;
    setBpm: (bpm: number) => void;
    getBpm: () => number;
    setVolume: (volume: number) => void;
    getVolume: () => number;
    setSound: (sound: MetronomeSound) => void;
    getSound: () => MetronomeSound;
    getAudioContext: () => AudioContext;
    getAudioContextTime: () => number;
    getBeatTimes: () => number[];
    /**
     * (Re)starts the click so that `bars` bars of count-in play first, and
     * returns the AudioContext time of beat 1 of the first counted bar.
     * Count-in clicks come from the same scheduler as the drill clicks, so the
     * returned time is exactly on the audible grid.
     */
    startWithCountIn: (bars: number) => number;
    getNextBeatTime: (fromTime?: number) => number;
};

type AudioContextCtorType = typeof AudioContext;

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNumber(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

/**
 * Low-frequency "thud" pulse metronome.
 * - accent on beat 1 (downbeat) each bar of 4/4
 * - short envelope to avoid chirp
 */
function scheduleMetronomeSound(
    audioCtx: AudioContext,
    when: number,
    accent: boolean,
    volume: number,
    sound: MetronomeSound
) {
    const safeVolume = clampNumber(volume, 0, 1);

    if (sound === "thud") {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        const f0 = accent ? 95 : 75;
        osc.type = "sine";
        osc.frequency.setValueAtTime(f0, when);
        osc.frequency.exponentialRampToValueAtTime(f0 * 0.62, when + 0.06);

        const peak = (accent ? 0.55 : 0.38) * safeVolume;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(peak, when + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(when);
        osc.stop(when + 0.13);
        return;
    }

    if (sound === "click") {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = "square";
        osc.frequency.setValueAtTime(accent ? 1800 : 1300, when);

        const peak = (accent ? 0.22 : 0.16) * safeVolume;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(peak, when + 0.0015);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.025);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(when);
        osc.stop(when + 0.03);
        return;
    }

    if (sound === "beep") {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(accent ? 1200 : 880, when);

        const peak = (accent ? 0.20 : 0.15) * safeVolume;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(peak, when + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(when);
        osc.stop(when + 0.08);
        return;
    }

    if (sound === "wood") {
        const osc = audioCtx.createOscillator();
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(accent ? 900 : 650, when);

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1400, when);

        const peak = (accent ? 0.26 : 0.19) * safeVolume;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(peak, when + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(when);
        osc.stop(when + 0.055);
    }
}


const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function getNoise(audioCtx: AudioContext): AudioBuffer {
    let buf = noiseBuffers.get(audioCtx);
    if (!buf) {
        buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.25), audioCtx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noiseBuffers.set(audioCtx, buf);
    }
    return buf;
}

function playKick(audioCtx: AudioContext, when: number, volume: number) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, when);
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.9 * volume, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(when);
    osc.stop(when + 0.32);
}

function playNoiseHit(
    audioCtx: AudioContext,
    when: number,
    volume: number,
    opts: { filter: BiquadFilterType; freq: number; peak: number; decay: number }
) {
    const src = audioCtx.createBufferSource();
    src.buffer = getNoise(audioCtx);
    const filter = audioCtx.createBiquadFilter();
    filter.type = opts.filter;
    filter.frequency.setValueAtTime(opts.freq, when);
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(opts.peak * volume, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + opts.decay);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    src.start(when);
    src.stop(when + opts.decay + 0.02);
}

/**
 * One beat of a simple boom-bap loop: kick on 1 and 3 (plus the "and" of 3),
 * snare on 2 and 4, closed hats on every eighth.
 */
function scheduleBeatPattern(
    audioCtx: AudioContext,
    when: number,
    beatInBar: number,
    volume: number,
    spb: number
) {
    const v = clampNumber(volume, 0, 1);
    const hat = { filter: "highpass" as const, freq: 7000, peak: 0.18, decay: 0.04 };
    const snare = { filter: "bandpass" as const, freq: 1800, peak: 0.6, decay: 0.16 };

    if (beatInBar === 0 || beatInBar === 2) playKick(audioCtx, when, v);
    if (beatInBar === 1 || beatInBar === 3) playNoiseHit(audioCtx, when, v, snare);
    if (beatInBar === 2) playKick(audioCtx, when + spb / 2, v * 0.8);

    playNoiseHit(audioCtx, when, v, hat);
    playNoiseHit(audioCtx, when + spb / 2, v * 0.7, hat);
}

export function createMetronome(initialBpm = 90): MetronomeHandle {
    const AudioContextCtor = (window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: AudioContextCtorType }).webkitAudioContext) as AudioContextCtorType;
    const ctx = new AudioContextCtor();

    let bpm = clampInt(initialBpm, 40, 220);
    let volume = 0.4;
    let sound: MetronomeSound = "thud";
    let isRunning = false;

    // Scheduling
    const lookAheadMs = 25;
    const scheduleAheadSec = 0.25;

    // Time of beat index 0; every beat is gridStartTime + index * spb.
    let gridStartTime = 0;
    let nextBeatTime = 0;
    let beatIndex = 0; // increments each beat; downbeat is beatIndex % 4 === 0

    const beatTimes: number[] = [];
    let timer: number | null = null;

    function secondsPerBeat() {
        return 60 / bpm;
    }

    function scheduleBeat(time: number, index: number) {
        const isDownbeat = index % 4 === 0;

        if (sound === "beat") scheduleBeatPattern(ctx, time, index % 4, volume, secondsPerBeat());
        else scheduleMetronomeSound(ctx, time, isDownbeat, volume, sound);

        beatTimes.push(time);
        if (beatTimes.length > 1024) beatTimes.splice(0, beatTimes.length - 1024);
    }

    function scheduler() {
        const now = ctx.currentTime;

        // Schedule beats up to now + scheduleAheadSec
        while (nextBeatTime < now + scheduleAheadSec) {
            scheduleBeat(nextBeatTime, beatIndex);
            beatIndex++;
            nextBeatTime = gridStartTime + beatIndex * secondsPerBeat();
        }
    }

    function startAt(firstBeatTime: number) {
        isRunning = true;

        // Must resume on a user gesture, but calling resume here is OK; if blocked,
        // it will resume once user interacts.
        if (ctx.state !== "running") void ctx.resume();

        gridStartTime = firstBeatTime;
        nextBeatTime = firstBeatTime;
        beatIndex = 0;
        beatTimes.length = 0;

        timer = window.setInterval(scheduler, lookAheadMs);
        scheduler();
    }

    function start() {
        if (isRunning) return;
        startAt(ctx.currentTime + 0.05);
    }

    function stop() {
        isRunning = false;
        if (timer !== null) window.clearInterval(timer);
        timer = null;
    }

    function startWithCountIn(bars: number) {
        stop();
        const firstBeatTime = ctx.currentTime + 0.1;
        startAt(firstBeatTime);
        return firstBeatTime + Math.max(0, Math.floor(bars)) * 4 * secondsPerBeat();
    }

    function getNextBeatTime(fromTime?: number) {
        const t = fromTime ?? ctx.currentTime;
        const spb = secondsPerBeat();

        if (!isRunning) return t + spb;
        if (t < gridStartTime) return gridStartTime;

        const k = Math.floor((t - gridStartTime) / spb) + 1;
        return gridStartTime + k * spb;
    }

    return {
        start,
        stop,
        setBpm: (v) => {
            const next = clampInt(v, 40, 220);
            if (isRunning && next !== bpm) {
                // Re-anchor the grid so already-elapsed beats keep their times.
                gridStartTime = nextBeatTime - beatIndex * (60 / next);
            }
            bpm = next;
        },
        getBpm: () => bpm,
        setVolume: (v) => {
            volume = clampNumber(v, 0, 1);
        },
        getVolume: () => volume,
        setSound: (v) => {
            sound = v;
        },
        getSound: () => sound,
        getAudioContext: () => ctx,
        getAudioContextTime: () => ctx.currentTime,
        getBeatTimes: () => [...beatTimes],
        startWithCountIn,
        getNextBeatTime,
    };
}
