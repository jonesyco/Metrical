import type { Onset } from "./OnsetDetector";

export const CALIBRATION_BEATS = 8;

/**
 * Round-trip latency estimate: the median delay between each click and the
 * onset of the user's clap/"ta" on it. Covers output latency, input latency
 * and the detector's own bias, so subtracting it puts onsets on the beat grid.
 * Returns null when too few beats were answered to trust the result.
 */
export function estimateLatencyMs(
    onsets: Onset[],
    beatTimes: number[],
    maxOffsetSec = 0.45 // Bluetooth output alone can add ~200 ms
): number | null {
    const offsets: number[] = [];
    for (const beat of beatTimes) {
        let best: number | null = null;
        for (const o of onsets) {
            const off = o.timeSec - beat;
            if (off < -0.1 || off > maxOffsetSec) continue;
            if (best == null || Math.abs(off) < Math.abs(best)) best = off;
        }
        if (best != null) offsets.push(best);
    }

    if (offsets.length < Math.ceil(beatTimes.length / 2)) return null;

    offsets.sort((a, b) => a - b);
    const mid = offsets.length >> 1;
    const med = offsets.length % 2 ? offsets[mid] : (offsets[mid - 1] + offsets[mid]) / 2;
    return Math.round(med * 1000);
}

const LATENCY_KEY = "metrical.latencyMs";
// Read once as a fallback so calibrations saved before the rename still load.
const LEGACY_LATENCY_KEY = "freestyle-trainer.latencyMs";

export function loadLatencyMs(): number | null {
    try {
        const raw = localStorage.getItem(LATENCY_KEY) ?? localStorage.getItem(LEGACY_LATENCY_KEY);
        if (raw == null) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

export function saveLatencyMs(ms: number) {
    try {
        localStorage.setItem(LATENCY_KEY, String(ms));
    } catch {
        // storage unavailable; latency just won't persist
    }
}
