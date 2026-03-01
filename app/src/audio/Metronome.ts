export type MetronomeHandle = {
  start: () => void;
  stop: () => void;
  setBpm: (bpm: number) => void;
  getBpm: () => number;
  getAudioContextTime: () => number;
  getBeatTimes: () => number[];
  scheduleCountInAndReturnStartTime: (bars: number) => number;
  getNextBeatTime: (fromTime?: number) => number;
};

type AudioContextCtorType = typeof AudioContext;

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Low-frequency "thud" pulse metronome.
 * - accent on beat 1 (downbeat) each bar of 4/4
 * - short envelope to avoid chirp
 */
function scheduleThud(audioCtx: AudioContext, when: number, accent: boolean, volume: number) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  // Low freq thud
  const f0 = accent ? 95 : 75;
  osc.type = "sine";
  osc.frequency.setValueAtTime(f0, when);

  // quick pitch drop gives a kick-drum feel
  osc.frequency.exponentialRampToValueAtTime(f0 * 0.62, when + 0.06);

  // Envelope (very fast attack, short decay)
  const peak = (accent ? 0.55 : 0.38) * volume;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(when);
  osc.stop(when + 0.13);
}

export function createMetronome(initialBpm = 90): MetronomeHandle {
  const AudioContextCtor = (window.AudioContext || (window as any).webkitAudioContext) as AudioContextCtorType;
  const ctx = new AudioContextCtor();

  let bpm = clampInt(initialBpm, 40, 220);
  let isRunning = false;

  // Scheduling
  const lookAheadMs = 25;
  const scheduleAheadSec = 0.25;

  let nextBeatTime = 0;
  let beatIndex = 0; // increments each beat; downbeat is beatIndex % 4 === 0

  const beatTimes: number[] = [];
  let timer: number | null = null;

  function secondsPerBeat() {
    return 60 / bpm;
  }

  function scheduleBeat(time: number, index: number) {
    const isDownbeat = index % 4 === 0;

    // Volume tuning: keep it audible but not piercing.
    // You can expose this later as a UI slider if desired.
    const clickVolume = 0.40;

    scheduleThud(ctx, time, isDownbeat, clickVolume);

    beatTimes.push(time);
    // keep the list from growing forever
    if (beatTimes.length > 1024) beatTimes.splice(0, beatTimes.length - 1024);
  }

  function scheduler() {
    const now = ctx.currentTime;

    // Schedule beats up to now + scheduleAheadSec
    while (nextBeatTime < now + scheduleAheadSec) {
      scheduleBeat(nextBeatTime, beatIndex);
      nextBeatTime += secondsPerBeat();
      beatIndex++;
    }
  }

  function start() {
    if (isRunning) return;
    isRunning = true;

    // Must resume on a user gesture, but calling resume here is OK; if blocked,
    // it will resume once user interacts.
    if (ctx.state !== "running") void ctx.resume();

    // Initialize schedule
    nextBeatTime = ctx.currentTime + 0.05;
    beatIndex = 0;
    beatTimes.length = 0;

    timer = window.setInterval(scheduler, lookAheadMs);
  }

  function stop() {
    isRunning = false;
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  function scheduleCountInAndReturnStartTime(bars: number) {
    // Ensure running so ctx.currentTime advances and scheduling works
    if (!isRunning) start();

    const now = ctx.currentTime;
    const spb = secondsPerBeat();
    const totalBeats = Math.max(0, Math.floor(bars)) * 4;

    // Start count-in slightly in the future
    const firstBeatTime = now + 0.10;

    // Session starts immediately after count-in completes
    const sessionStartTime = firstBeatTime + totalBeats * spb;

    // Pre-schedule count-in thuds (does not interfere with the scheduler;
    // it’s just extra scheduled sound events)
    for (let i = 0; i < totalBeats; i++) {
      const t = firstBeatTime + i * spb;
      const isDownbeat = i % 4 === 0;
      scheduleThud(ctx, t, isDownbeat, 0.14);
    }

    return sessionStartTime;
  }

  function getNextBeatTime(fromTime?: number) {
    const t = fromTime ?? ctx.currentTime;
    const spb = secondsPerBeat();

    // If not started yet, approximate one beat ahead
    if (!isFinite(nextBeatTime) || nextBeatTime <= 0) return t + spb;

    // nextBeatTime is "next scheduled beat timestamp" maintained by scheduler
    return nextBeatTime > t ? nextBeatTime : t + spb;
  }

  return {
    start,
    stop,
    setBpm: (v) => {
      bpm = clampInt(v, 40, 220);
    },
    getBpm: () => bpm,
    getAudioContextTime: () => ctx.currentTime,
    getBeatTimes: () => [...beatTimes],
    scheduleCountInAndReturnStartTime,
    getNextBeatTime,
  };
}