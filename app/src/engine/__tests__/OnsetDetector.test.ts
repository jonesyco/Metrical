import { describe, expect, it } from "vitest";
import { OnsetDetector } from "../OnsetDetector";

const HOP = 256 / 48000;

function dbToEnergy(db: number) {
    return Math.pow(10, db / 10);
}

/** Feeds an envelope where each burst rises to `burstDb` for `burstSec`. */
function run(bursts: number[], opts: { durationSec: number; burstSec?: number; floorDb?: number; burstDb?: number }) {
    const { durationSec, burstSec = 0.12, floorDb = -60, burstDb = -20 } = opts;
    const det = new OnsetDetector();
    const out: number[] = [];
    for (let t = 0; t < durationSec; t += HOP) {
        const inBurst = bursts.some((b) => t >= b && t < b + burstSec);
        const o = det.push(t, dbToEnergy(inBurst ? burstDb : floorDb));
        if (o) out.push(o.timeSec);
    }
    return out;
}

describe("OnsetDetector", () => {
    it("finds each attack within one hop", () => {
        const bursts = [0.5, 1.0, 1.5, 2.0];
        const onsets = run(bursts, { durationSec: 3 });
        expect(onsets).toHaveLength(4);
        onsets.forEach((t, i) => expect(Math.abs(t - bursts[i])).toBeLessThanOrEqual(HOP));
    });

    it("ignores a steady signal", () => {
        const det = new OnsetDetector();
        let count = 0;
        for (let t = 0; t < 2; t += HOP) {
            const wobble = Math.sin(t * 40) * 2; // ±2 dB
            if (det.push(t, dbToEnergy(-30 + wobble))) count++;
        }
        expect(count).toBe(0);
    });

    it("ignores frame-to-frame flicker in a real noise floor", () => {
        // Matches a real take's noise floor: around -60 dB, hop-to-hop change
        // median ~2.3 dB and 90th percentile ~5.9 dB.
        const countIn = (det: OnsetDetector) => {
            let seed = 7;
            const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
            const gauss = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
            let count = 0;
            for (let t = 0; t < 10; t += HOP) {
                if (det.push(t, dbToEnergy(-60 + gauss() * 2.5))) count++;
            }
            return count;
        };
        // Unsmoothed, floor pinned to the quietest frame: the original behavior.
        expect(countIn(new OnsetDetector({ smoothingFrames: 1, floorFallTauSec: 1e-9 }))).toBeGreaterThan(5);
        expect(countIn(new OnsetDetector())).toBe(0);
    });

    it("does not retrigger inside the refractory window", () => {
        const onsets = run([0.5, 0.53], { durationSec: 1, burstSec: 0.02 });
        expect(onsets).toHaveLength(1);
    });

    it("separates syllables that dip between attacks", () => {
        // Continuous rap: level drops ~15 dB between syllables, never to silence.
        const det = new OnsetDetector();
        const syllables = [0.2, 0.4, 0.6, 0.8, 1.0];
        const out: number[] = [];
        for (let t = 0; t < 1.2; t += HOP) {
            const loud = syllables.some((s) => t >= s && t < s + 0.1);
            const o = det.push(t, dbToEnergy(t < 0.2 ? -60 : loud ? -18 : -33));
            if (o) out.push(o.timeSec);
        }
        expect(out).toHaveLength(syllables.length);
    });
});
