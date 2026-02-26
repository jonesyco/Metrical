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

export function createMetronome(initialBpm = 90): MetronomeHandle {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextCtor();

    let bpm = initialBpm;
    let isRunning = false;

    // Scheduling
    const lookAheadMs = 25;
    const scheduleAheadSec = 0.25;

    let nextBeatTime = 0;
    let beatIndex = 0;

    const beatTimes: number[] = [];

    let timer: number | null = null;

    function secondsPerBeat() {
        return 60 / bpm;
    }

    function click(time: number, isDownbeat: boolean) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "square";
        osc.frequency.value = isDownbeat ? 1000 : 750;

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.3, time + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(time);
        osc.stop(time + 0.04);
    }

    function scheduler() {
        const now = ctx.currentTime;
        while (nextBeatTime < now + scheduleAheadSec) {
            const isDownbeat = beatIndex % 4 === 0;
            click(nextBeatTime, isDownbeat);

            beatTimes.push(nextBeatTime);

            nextBeatTime += secondsPerBeat();
            beatIndex++;
        }
    }

    function start() {
        if (isRunning) return;
        isRunning = true;

        if (ctx.state !== "running") void ctx.resume();

        // initialize schedule
        nextBeatTime = ctx.currentTime + 0.05;
        beatIndex = 0;
        beatTimes.length = 0;

        timer = window.setInterval(scheduler, lookAheadMs);
    }

    function stop() {
        isRunning = false;
        if (timer) window.clearInterval(timer);
        timer = null;
    }

    function scheduleCountInAndReturnStartTime(bars: number) {
        // Ensure running so ctx.currentTime is advancing.
        if (!isRunning) start();

        // Next downbeat time (approx): align to next beat boundary.
        const now = ctx.currentTime;
        const spb = secondsPerBeat();
        const firstBeatTime = now + 0.10;
        const totalBeats = bars * 4;

        // We will treat the first beat in this count-in as beatIndex=0 downbeat.
        // Session start will be the downbeat immediately AFTER count-in completes.
        const sessionStartTime = firstBeatTime + totalBeats * spb;

        // Pre-schedule count-in clicks (so UI can sync if needed)
        for (let i = 0; i < totalBeats; i++) {
            const t = firstBeatTime + i * spb;
            click(t, i % 4 === 0);
        }

        return sessionStartTime;
    }

    return {
        start,
        stop,
        setBpm: (v) => (bpm = Math.max(40, Math.min(220, Math.round(v)))),
        getBpm: () => bpm,
        getAudioContextTime: () => ctx.currentTime,
        getBeatTimes: () => [...beatTimes],
        scheduleCountInAndReturnStartTime,
        getNextBeatTime: (fromTime?: number) => {
            const t = fromTime ?? ctx.currentTime;
            // nextBeatTime is the scheduler’s next scheduled beat timestamp
            // If scheduler hasn't run yet, approximate one beat ahead
            if (!isFinite(nextBeatTime) || nextBeatTime <= 0) return t + secondsPerBeat();
            return nextBeatTime > t ? nextBeatTime : (t + secondsPerBeat());
        },
    };
}