import { describe, expect, it } from "vitest";
import { scoreDrill } from "../DrillScoring";
import { analyzeRhythm } from "../RhythmAnalyzer";
import { DRILLS } from "../DrillLibrary";
import type { Onset } from "../OnsetDetector";

const bpm = 90;
const spb = 60 / bpm;

function take(beats: number[], durationSec: number) {
    const onsets: Onset[] = beats.map((b) => ({ timeSec: b * spb, strengthDb: 20 }));
    return { onsets, grid: { bpm, startSec: 0, durationSec } };
}

const range = (n: number, step = 1) => Array.from({ length: n }, (_, i) => i * step);

describe("scoreDrill", () => {
    it("refuses to score a near-silent take", () => {
        const drill = DRILLS.RL1_WORD_ON_BEAT;
        const { onsets, grid } = take([0, 1], drill.durationSec);
        const result = scoreDrill({ drill, rhythm: analyzeRhythm(onsets, grid, 1) });
        expect(result.score).toBeNull();
        expect(result.observed).toEqual({});
    });

    it("only reports skills the drill targets", () => {
        const drill = DRILLS.RL5_BAR_START_PUNCH; // targets phrasing_barStart only
        const { onsets, grid } = take(range(52), drill.durationSec);
        const result = scoreDrill({ drill, rhythm: analyzeRhythm(onsets, grid, 1) });
        expect(Object.keys(result.observed)).toEqual(["phrasing_barStart"]);
    });

    it("rewards eighths on the two-words-per-beat drill", () => {
        const drill = DRILLS.RL2_TWO_WORDS_PER_BEAT;
        const beats = Math.floor(drill.durationSec / spb);
        const eighths = take(range(beats * 2, 0.5), drill.durationSec);
        const quarters = take(range(beats), drill.durationSec);
        const good = scoreDrill({ drill, rhythm: analyzeRhythm(eighths.onsets, eighths.grid, 2) });
        const half = scoreDrill({ drill, rhythm: analyzeRhythm(quarters.onsets, quarters.grid, 2) });
        expect(good.score).toBe(100);
        expect(half.score!).toBeLessThan(good.score!);
    });

    it("blends prompt use into association scores", () => {
        const drill = DRILLS.AF1_ASSOC_EVERY_2BARS;
        const beats = Math.floor(drill.durationSec / spb);
        const { onsets, grid } = take(range(beats * 2, 0.5), drill.durationSec);
        const rhythm = analyzeRhythm(onsets, grid, 4);
        const all = scoreDrill({ drill, rhythm, prompts: { used: 8, total: 8, rate: 1 } });
        const none = scoreDrill({ drill, rhythm, prompts: { used: 0, total: 8, rate: 0 } });
        expect(all.score).toBe(100);
        expect(none.score).toBe(60);
    });
});
