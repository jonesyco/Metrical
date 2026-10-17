import { describe, expect, it } from "vitest";
import { analyzeRhythm } from "../RhythmAnalyzer";
import type { Onset } from "../OnsetDetector";

const bpm = 90;
const spb = 60 / bpm;
const start = 10; // arbitrary context time
const durationSec = spb * 4 * 8; // 8 bars

function onsetsAt(beats: number[], offsetSec = 0, strength = 20): Onset[] {
    return beats.map((b) => ({ timeSec: start + b * spb + offsetSec, strengthDb: strength }));
}

const range = (n: number, step = 1) => Array.from({ length: n }, (_, i) => i * step);

describe("analyzeRhythm", () => {
    it("scores perfect quarter notes as perfect", () => {
        const m = analyzeRhythm(onsetsAt(range(32)), { bpm, startSec: start, durationSec }, 1);
        expect(m.gridCoverage).toBe(1);
        expect(m.timingScore).toBe(100);
        expect(m.meanAbsOffsetMs).toBe(0);
        expect(m.downbeatHitRate).toBe(1);
        expect(m.activeBeatRate).toBe(1);
        expect(m.stops).toBe(0);
        expect(m.continuityScore).toBe(100);
        expect(m.landingRate).toBe(1);
    });

    it("reports a consistent late placement as laid back", () => {
        const m = analyzeRhythm(onsetsAt(range(32), 0.03), { bpm, startSec: start, durationSec }, 1);
        expect(m.meanSignedOffsetMs).toBe(30);
        expect(m.offsetStdMs).toBe(0);
        expect(m.timingScore).toBeLessThan(100);
        expect(m.gridCoverage).toBe(1);
    });

    it("detects rushing that grows bar over bar", () => {
        const beats = range(32);
        const onsets = beats.map((b) => ({
            timeSec: start + b * spb - Math.floor(b / 4) * 0.01,
            strengthDb: 20,
        }));
        const m = analyzeRhythm(onsets, { bpm, startSec: start, durationSec }, 1);
        expect(m.driftMsPerBar).toBeCloseTo(-10, 0);
        expect(m.meanSignedOffsetMs).toBeLessThan(0);
    });

    it("counts stops and lowers continuity", () => {
        // Bars 3-4 silent (beats 8..15).
        const beats = range(32).filter((b) => b < 8 || b >= 16);
        const m = analyzeRhythm(onsetsAt(beats), { bpm, startSec: start, durationSec }, 1);
        expect(m.stops).toBe(1);
        expect(m.longestGapBeats).toBe(9);
        expect(m.activeBeatRate).toBe(0.75);
        expect(m.continuityScore).toBe(70);
    });

    it("distinguishes triplets from eighths", () => {
        const triplets = onsetsAt(range(96, 1 / 3));
        const asTriplet = analyzeRhythm(triplets, { bpm, startSec: start, durationSec }, 3);
        const asEighth = analyzeRhythm(triplets, { bpm, startSec: start, durationSec }, 2);
        expect(asTriplet.gridCoverage).toBe(1);
        expect(asTriplet.timingScore).toBe(100);
        expect(asEighth.gridCoverage).toBeLessThan(0.75);
        expect(asEighth.timingScore).toBeLessThan(asTriplet.timingScore);
    });

    it("only counts a landing when the bar's last syllable is on beat 4", () => {
        // Each bar: beats 1..4 plus the "and" of 4 (3.5).
        const beats = range(8).flatMap((bar) => [0, 1, 2, 3, 3.5].map((b) => bar * 4 + b));
        const m = analyzeRhythm(onsetsAt(beats), { bpm, startSec: start, durationSec }, 1);
        expect(m.landingRate).toBe(0);
    });

    it("measures downbeat accents against the median onset strength", () => {
        const onsets = range(32).map((b) => ({
            timeSec: start + b * spb,
            strengthDb: b % 4 === 0 ? 30 : 15,
        }));
        const m = analyzeRhythm(onsets, { bpm, startSec: start, durationSec }, 1);
        expect(m.downbeatAccentRate).toBe(1);
    });

    it("ignores onsets before the count-in ends", () => {
        const early = onsetsAt([-4, -3, -2, -1]);
        const m = analyzeRhythm(early, { bpm, startSec: start, durationSec }, 1);
        expect(m.onsetCount).toBe(0);
        expect(m.timingScore).toBe(0);
    });
});
