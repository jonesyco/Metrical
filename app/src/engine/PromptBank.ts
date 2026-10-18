import type { Drill } from "./Types";

export const PROMPT_WORDS: string[] = [
    "money", "city", "night", "fire", "ocean", "crown", "street", "dream", "storm", "mirror",
    "engine", "gold", "shadow", "rocket", "garden", "thunder", "window", "pressure", "island", "diamond",
    "coffee", "planet", "pocket", "ladder", "silence", "camera", "jungle", "winter", "bridge", "castle",
    "phone", "river", "lightning", "chess", "basement", "highway", "paper", "magnet", "summer", "tiger",
    "knife", "volcano", "battery", "satellite", "school", "ghost", "anchor", "pizza", "glacier", "trophy",
    "spider", "concrete", "freedom", "lion", "subway", "galaxy", "hammer", "candle", "desert", "mask",
];

export type ScheduledPrompt = {
    word: string;
    beatIndex: number; // beats after beat 1 of bar 1 when it appears
};

/** Prompts for association drills; empty for drills without visual prompts. */
export function buildPromptSchedule(
    drill: Drill,
    bpm: number,
    rng: () => number = Math.random
): ScheduledPrompt[] {
    const interval = drill.prompts?.intervalBeats;
    if (!interval) return [];

    const totalBeats = Math.floor((drill.durationSec * bpm) / 60);
    const pool = [...PROMPT_WORDS];
    const out: ScheduledPrompt[] = [];

    for (let beat = 0; beat < totalBeats; beat += interval) {
        if (!pool.length) pool.push(...PROMPT_WORDS);
        const idx = Math.floor(rng() * pool.length);
        out.push({ word: pool.splice(idx, 1)[0], beatIndex: beat });
    }
    return out;
}

/** The prompt that should be on screen at `beatIndex` (null before the first). */
export function promptAtBeat(prompts: ScheduledPrompt[], beatIndex: number): ScheduledPrompt | null {
    let current: ScheduledPrompt | null = null;
    for (const p of prompts) {
        if (p.beatIndex <= beatIndex) current = p;
        else break;
    }
    return current;
}

export type HeardWord = { text: string; timeSec: number };

/**
 * Share of prompts the rapper actually said while (or shortly after) they were
 * on screen. Heard words come from the live ASR stream, which arrives a few
 * seconds late, so the window is extended by `asrLagSec`.
 */
export function scorePromptIntegration(params: {
    prompts: ScheduledPrompt[];
    heard: HeardWord[];
    bpm: number;
    startSec: number;
    asrLagSec?: number;
}): { used: number; total: number; rate: number } {
    const { prompts, heard, bpm, startSec, asrLagSec = 4 } = params;
    const spb = 60 / bpm;
    let used = 0;

    prompts.forEach((p, i) => {
        const shownAt = startSec + p.beatIndex * spb;
        const nextAt = i + 1 < prompts.length ? startSec + prompts[i + 1].beatIndex * spb : Infinity;
        const until = Math.min(nextAt, shownAt + 8 * spb) + asrLagSec;
        const hit = heard.some(
            (w) => w.timeSec >= shownAt && w.timeSec <= until && wordsMatch(w.text, p.word)
        );
        if (hit) used++;
    });

    return {
        used,
        total: prompts.length,
        rate: prompts.length ? used / prompts.length : 0,
    };
}

function normalize(w: string): string {
    return w.toLowerCase().replace(/[^a-z]/g, "");
}

/** Loose match so "diamonds" / "diamond's" count for "diamond". */
export function wordsMatch(heard: string, target: string): boolean {
    const a = normalize(heard);
    const b = normalize(target);
    if (!a || !b) return false;
    if (a === b) return true;
    // Allow suffixes ("rockets", "diamond's") but not truncations ("rock").
    const stem = b.length <= 4 ? b : b.slice(0, b.length - 1);
    return a.startsWith(stem);
}
