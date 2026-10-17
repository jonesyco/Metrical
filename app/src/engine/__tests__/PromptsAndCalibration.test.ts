import { describe, expect, it } from "vitest";
import { buildPromptSchedule, promptAtBeat, scorePromptIntegration, wordsMatch } from "../PromptBank";
import { estimateLatencyMs } from "../Calibration";
import { DRILLS } from "../DrillLibrary";
import { makeWordDeltaEmitter, newTokensAfterOverlap } from "../../utils/wordDeltaEmitter";

describe("prompts", () => {
    it("schedules one prompt per interval and none for plain drills", () => {
        const p = buildPromptSchedule(DRILLS.AF1_ASSOC_EVERY_2BARS, 96, () => 0);
        // 45 s at 96 bpm = 72 beats, every 8 beats
        expect(p.map((x) => x.beatIndex)).toEqual([0, 8, 16, 24, 32, 40, 48, 56, 64]);
        expect(new Set(p.map((x) => x.word)).size).toBe(p.length);
        expect(buildPromptSchedule(DRILLS.RL1_WORD_ON_BEAT, 96)).toEqual([]);
    });

    it("shows the latest prompt that has appeared", () => {
        const p = [{ word: "a", beatIndex: 0 }, { word: "b", beatIndex: 8 }];
        expect(promptAtBeat(p, -1)).toBeNull();
        expect(promptAtBeat(p, 7)?.word).toBe("a");
        expect(promptAtBeat(p, 8)?.word).toBe("b");
    });

    it("credits prompts heard while on screen (allowing for ASR lag)", () => {
        const prompts = [{ word: "diamond", beatIndex: 0 }, { word: "river", beatIndex: 8 }];
        const r = scorePromptIntegration({
            prompts,
            bpm: 60,
            startSec: 100,
            heard: [
                { text: "Diamonds", timeSec: 103 },
                { text: "river", timeSec: 99 }, // before it appeared
            ],
        });
        expect(r).toEqual({ used: 1, total: 2, rate: 0.5 });
    });

    it("matches simple inflections only", () => {
        expect(wordsMatch("diamond's", "diamond")).toBe(true);
        expect(wordsMatch("rockets", "rocket")).toBe(true);
        expect(wordsMatch("rock", "rocket")).toBe(false);
    });
});

describe("estimateLatencyMs", () => {
    const beats = [1, 2, 3, 4, 5, 6, 7, 8];

    it("returns the median click-to-onset delay", () => {
        const onsets = beats.map((b, i) => ({ timeSec: b + (i === 3 ? 0.2 : 0.06), strengthDb: 20 }));
        expect(estimateLatencyMs(onsets, beats)).toBe(60);
    });

    it("gives up when too few beats were answered", () => {
        expect(estimateLatencyMs([{ timeSec: 1.05, strengthDb: 20 }], beats)).toBeNull();
    });
});

describe("newTokensAfterOverlap", () => {
    it("emits only words after the sliding-window overlap", () => {
        const prev = "yeah I'm on the beat".split(" ");
        const next = "on the beat staying in".split(" ");
        expect(newTokensAfterOverlap(prev, next)).toEqual(["staying", "in"]);
    });

    it("handles a revised final word", () => {
        const prev = "rolling through the bea".split(" ");
        const next = "through the beat tonight".split(" ");
        expect(newTokensAfterOverlap(prev, next)).toEqual(["beat", "tonight"]);
    });

    it("emits nothing when the window text is unchanged", () => {
        const t = "keep it moving".split(" ");
        expect(newTokensAfterOverlap(t, t)).toEqual([]);
    });

    it("rebuilds the sentence once from real sliding-window partials", () => {
        // Recorded from /ws/asr (whisper.cpp tiny.en, 3 s window) on a TTS take.
        const partials = [
            "I came through.",
            "I came through the night with",
            "I came through the night with the light on my",
            "I came through the night with the light on my mind.",
            "came through the night with the light on my mind.",
            "night with the light on my mind. Walking down",
            "mind. Walking down the street.",
            "Walking down the street, feeling like a beat.",
            "down the street, feeling like a beat.",
        ];
        const out: string[] = [];
        const emit = makeWordDeltaEmitter((w) => out.push(w));
        partials.forEach(emit);
        expect(out.join(" ")).toBe(
            "I came through the night with the light on my mind Walking down the street feeling like a beat"
        );
    });

    it("treats unrelated text as new", () => {
        expect(newTokensAfterOverlap(["a", "b"], ["c", "d"])).toEqual(["c", "d"]);
    });
});
