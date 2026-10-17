import { describe, expect, it } from "vitest";
import { analyzeRhymes, rhymeKey } from "../RhymeAnalyzer";
import { encodeWavPcm16 } from "../../audio/wavEncode";

function words(text: string, secPerWord = 0.3) {
    return text.split(" ").map((w, i) => ({ word: w, start: i * secPerWord, end: i * secPerWord + 0.25 }));
}

describe("rhymeKey", () => {
    it.each([
        ["night", "light"],
        ["time", "rhyme"],
        ["flame", "game"],
        ["nights", "fight"],
        ["day", "say"],
        ["fly", "high"],
    ])("%s rhymes with %s", (a, b) => {
        expect(rhymeKey(a)).toBe(rhymeKey(b));
    });

    it.each([
        ["night", "nice"],
        ["time", "team"],
        ["flow", "flame"],
    ])("%s does not rhyme with %s", (a, b) => {
        expect(rhymeKey(a)).not.toBe(rhymeKey(b));
    });
});

describe("analyzeRhymes", () => {
    it("measures density over content words and groups chains", () => {
        const m = analyzeRhymes({ words: words("I came through the night with the light on my mind tonight") });
        expect(m.chains[0].sort()).toEqual(["light", "night", "tonight"]);
        expect(m.rhymingWords).toBe(3);
        expect(m.rhymeDensity).toBeCloseTo(3 / m.contentWords, 2);
    });

    it("does not count a repeated word as a rhyme", () => {
        const m = analyzeRhymes({ words: words("money money money") });
        expect(m.rhymingWords).toBe(0);
    });

    it("scores end rhymes across consecutive bars", () => {
        // 120 bpm -> 2 s bars; four words per bar at 0.5 s.
        const m = analyzeRhymes({
            words: words("walking down the street feeling like a beat never gonna stop", 0.5),
            bpm: 120,
        });
        // bar 1 ends "street", bar 2 "beat" (rhyme), bar 3 "stop" (no rhyme)
        expect(m.endRhymeRate).toBe(0.5);
    });
});

describe("encodeWavPcm16", () => {
    it("writes a valid mono 16-bit header and clamps samples", () => {
        const buf = encodeWavPcm16(new Float32Array([0, 1, -1, 2]), 16000);
        const v = new DataView(buf);
        expect(buf.byteLength).toBe(44 + 8);
        expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
        expect(v.getUint32(24, true)).toBe(16000);
        expect(v.getUint16(34, true)).toBe(16);
        expect(v.getInt16(46, true)).toBe(0x7fff);
        expect(v.getInt16(48, true)).toBe(-0x8000);
        expect(v.getInt16(50, true)).toBe(0x7fff);
    });
});
