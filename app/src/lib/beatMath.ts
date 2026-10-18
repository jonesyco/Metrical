// src/lib/beatMath.ts
export function getBeatDurationMs(bpm: number): number {
    return 60000 / bpm;
}

export function getElapsedMs(startTimeMs: number | null, nowMs: number): number {
    if (startTimeMs == null) return 0;
    return Math.max(0, nowMs - startTimeMs);
}

export function getProgressWithinBeat(elapsedMs: number, bpm: number): number {
    const beatDuration = getBeatDurationMs(bpm);
    return (elapsedMs % beatDuration) / beatDuration;
}

export function getCurrentBeatIndex(elapsedMs: number, bpm: number): number {
    const beatDuration = getBeatDurationMs(bpm);
    return Math.floor(elapsedMs / beatDuration);
}

export function getBeatInBar(elapsedMs: number, bpm: number, beatsPerBar = 4): number {
    return (getCurrentBeatIndex(elapsedMs, bpm) % beatsPerBar) + 1;
}