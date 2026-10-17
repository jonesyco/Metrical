import type { Onset } from "./OnsetDetector";
import type { Subdivision } from "./Types";

export type RhythmGrid = {
    bpm: number;
    startSec: number;    // time of beat 1, bar 1 (same clock as the onsets)
    durationSec: number;
    beatsPerBar?: number;
};

export type RhythmMetrics = {
    onsetCount: number;
    syllablesPerBeat: number;

    // Timing against the drill's subdivision grid
    subdivision: Subdivision;
    gridCoverage: number;      // 0-1, share of grid slots with an onset within tolerance
    meanAbsOffsetMs: number;   // over slots that have an onset within half a step
    meanSignedOffsetMs: number; // negative = rushing, positive = dragging
    offsetStdMs: number;
    driftMsPerBar: number;     // trend of signed offsets across bars
    timingScore: number;       // 0-100
    driftScore: number;        // 0-100

    // Bar structure
    bars: number;
    downbeatHitRate: number;     // 0-1, bars with an onset on beat 1
    downbeatMeanAbsMs: number;
    downbeatAccentRate: number;  // 0-1, of downbeat hits, share at/above median onset strength
    landingRate: number;         // 0-1, active bars whose last onset lands on beat 4

    // Continuity
    activeBeatRate: number;      // 0-1, beats with at least one onset
    longestGapBeats: number;
    stops: number;               // silences of 2+ beats
    continuityScore: number;     // 0-100
};

const STOP_GAP_BEATS = 2;

export function analyzeRhythm(
    onsetsIn: Onset[],
    grid: RhythmGrid,
    subdivision: Subdivision
): RhythmMetrics {
    const beatsPerBar = grid.beatsPerBar ?? 4;
    const spb = 60 / grid.bpm;
    const step = spb / subdivision;
    const barDur = spb * beatsPerBar;
    const start = grid.startSec;
    const end = start + grid.durationSec;

    const slotTol = Math.min(0.08, step * 0.35);
    const beatTol = Math.min(0.08, spb * 0.35);

    const onsets = onsetsIn
        .filter((o) => o.timeSec >= start - step / 2 && o.timeSec < end)
        .sort((a, b) => a.timeSec - b.timeSec);
    const times = onsets.map((o) => o.timeSec);

    const totalBeats = Math.max(1, Math.floor(grid.durationSec / spb + 1e-9));
    const bars = Math.max(1, Math.floor(grid.durationSec / barDur + 1e-9));

    // --- Grid timing: nearest onset to each slot ---
    const totalSlots = totalBeats * subdivision;
    let covered = 0;
    const slotOffsets: { bar: number; offsetMs: number }[] = [];
    for (let s = 0; s < totalSlots; s++) {
        const slotTime = start + s * step;
        const nearest = nearestTime(times, slotTime);
        if (nearest == null) continue;
        const off = nearest - slotTime;
        if (Math.abs(off) <= step / 2) {
            slotOffsets.push({ bar: Math.floor((s * step) / barDur), offsetMs: off * 1000 });
        }
        if (Math.abs(off) <= slotTol) covered++;
    }

    const absOffsets = slotOffsets.map((o) => Math.abs(o.offsetMs));
    const signed = slotOffsets.map((o) => o.offsetMs);
    const meanAbsOffsetMs = mean(absOffsets);
    const meanSignedOffsetMs = mean(signed);
    const offsetStdMs = stddev(signed);
    const driftMsPerBar = slope(slotOffsets.map((o) => o.bar), signed);

    // Random placement averages step/4 off the grid; that maps to a score of 0.
    const stepMs = step * 1000;
    const timingScore = slotOffsets.length
        ? clamp100(100 * (1 - meanAbsOffsetMs / (stepMs / 4)))
        : 0;
    const driftScore = slotOffsets.length
        ? clamp100(
            100 -
            Math.abs(meanSignedOffsetMs) * 0.8 -
            Math.abs(driftMsPerBar) * 3 -
            offsetStdMs * 0.6
        )
        : 0;

    // --- Bars: downbeats, accents, landings ---
    const strengths = onsets.map((o) => o.strengthDb);
    const medianStrength = median(strengths);
    let downbeatHits = 0;
    let accented = 0;
    const downbeatAbs: number[] = [];
    let activeBars = 0;
    let landed = 0;

    for (let b = 0; b < bars; b++) {
        const barStart = start + b * barDur;
        const nearestIdx = nearestIndex(times, barStart);
        if (nearestIdx != null && Math.abs(times[nearestIdx] - barStart) <= beatTol) {
            downbeatHits++;
            downbeatAbs.push(Math.abs(times[nearestIdx] - barStart) * 1000);
            if (onsets[nearestIdx].strengthDb >= medianStrength) accented++;
        }

        // Onsets that belong to this bar (the next downbeat belongs to the next bar).
        const inBar = times.filter((t) => t >= barStart - beatTol && t < barStart + barDur - beatTol);
        if (inBar.length) {
            activeBars++;
            const last = inBar[inBar.length - 1];
            const beat4 = barStart + (beatsPerBar - 1) * spb;
            if (Math.abs(last - beat4) <= beatTol) landed++;
        }
    }

    // --- Continuity ---
    let activeBeats = 0;
    for (let k = 0; k < totalBeats; k++) {
        const from = start + k * spb - beatTol;
        const to = from + spb;
        if (times.some((t) => t >= from && t < to)) activeBeats++;
    }
    const activeBeatRate = activeBeats / totalBeats;

    const marks = [start, ...times.filter((t) => t >= start), end];
    let longestGap = 0;
    let stops = 0;
    for (let i = 1; i < marks.length; i++) {
        const gapBeats = (marks[i] - marks[i - 1]) / spb;
        longestGap = Math.max(longestGap, gapBeats);
        if (gapBeats >= STOP_GAP_BEATS) stops++;
    }
    const continuityScore = clamp100(activeBeatRate * 100 - stops * 5);

    return {
        onsetCount: onsets.length,
        syllablesPerBeat: round2(onsets.length / totalBeats),
        subdivision,
        gridCoverage: round2(covered / totalSlots),
        meanAbsOffsetMs: Math.round(meanAbsOffsetMs),
        meanSignedOffsetMs: Math.round(meanSignedOffsetMs),
        offsetStdMs: Math.round(offsetStdMs),
        driftMsPerBar: round2(driftMsPerBar),
        timingScore,
        driftScore,
        bars,
        downbeatHitRate: round2(downbeatHits / bars),
        downbeatMeanAbsMs: Math.round(mean(downbeatAbs)),
        downbeatAccentRate: downbeatHits ? round2(accented / downbeatHits) : 0,
        landingRate: activeBars ? round2(landed / activeBars) : 0,
        activeBeatRate: round2(activeBeatRate),
        longestGapBeats: round2(longestGap),
        stops,
        continuityScore,
    };
}

function nearestIndex(sorted: number[], t: number): number | null {
    if (!sorted.length) return null;
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] < t) lo = mid + 1;
        else hi = mid;
    }
    if (lo > 0 && Math.abs(sorted[lo - 1] - t) <= Math.abs(sorted[lo] - t)) return lo - 1;
    return lo;
}

function nearestTime(sorted: number[], t: number): number | null {
    const i = nearestIndex(sorted, t);
    return i == null ? null : sorted[i];
}

function mean(values: number[]): number {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stddev(values: number[]): number {
    if (values.length <= 1) return 0;
    const m = mean(values);
    return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

function median(values: number[]): number {
    if (!values.length) return 0;
    const s = [...values].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function slope(xs: number[], ys: number[]): number {
    const n = xs.length;
    if (n < 2) return 0;
    const xm = mean(xs);
    const ym = mean(ys);
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
        num += (xs[i] - xm) * (ys[i] - ym);
        den += (xs[i] - xm) ** 2;
    }
    return den ? num / den : 0;
}

function clamp100(n: number): number {
    return Math.max(0, Math.min(100, Math.round(n)));
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
