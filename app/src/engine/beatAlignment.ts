export type BeatJudgment =
    | "perfect"
    | "great"
    | "good"
    | "early"
    | "late"
    | "miss";

export interface BeatAlignmentResult {
    wordTimeMs: number;
    nearestGridTimeMs: number;
    offsetMs: number; // negative = early, positive = late
    absOffsetMs: number;
    judgment: BeatJudgment;
    score: number; // 0..100
    subdivisionIndex: number;
}

export interface BeatAlignmentConfig {
    bpm: number;
    subdivision: 4; // 4 = quarter, 8 = eighth, 16 = sixteenth
    startTimeMs: number; // session/metronome start timestamp from performance.now()
}

export function getSubdivisionDurationMs(
    bpm: number,
    subdivision: 4 | 8 | 16
): number {
    const quarterNoteMs = 60000 / bpm;

    switch (subdivision) {
        case 4:
            return quarterNoteMs;
        case 8:
            return quarterNoteMs / 2;
        case 16:
            return quarterNoteMs / 4;
        default:
            return quarterNoteMs;
    }
}

export function judgeOffset(absOffsetMs: number): BeatJudgment {
    if (absOffsetMs <= 35) return "perfect";
    if (absOffsetMs <= 65) return "great";
    if (absOffsetMs <= 100) return "good";
    if (absOffsetMs <= 140) return "early"; // or late, direction handled separately
    if (absOffsetMs <= 180) return "late";  // fallback label zone
    return "miss";
}

export function scoreOffset(absOffsetMs: number): number {
    if (absOffsetMs >= 180) return 0;
    const normalized = 1 - absOffsetMs / 180;
    return Math.round(normalized * 100);
}

export function alignWordToBeatGrid(
    wordTimeMs: number,
    config: BeatAlignmentConfig
): BeatAlignmentResult {
    const stepMs = getSubdivisionDurationMs(config.bpm, config.subdivision);
    return alignToGrid(wordTimeMs, config.startTimeMs, stepMs);
}

/** Aligns a time to any evenly spaced grid (e.g. triplets: stepMs = beatMs / 3). */
export function alignToGrid(
    wordTimeMs: number,
    startTimeMs: number,
    stepMs: number
): BeatAlignmentResult {
    const elapsedMs = Math.max(0, wordTimeMs - startTimeMs);

    const nearestSubdivisionIndex = Math.round(elapsedMs / stepMs);
    const nearestGridElapsedMs = nearestSubdivisionIndex * stepMs;
    const nearestGridTimeMs = startTimeMs + nearestGridElapsedMs;

    const offsetMs = wordTimeMs - nearestGridTimeMs;
    const absOffsetMs = Math.abs(offsetMs);

    let judgment = judgeOffset(absOffsetMs);

    if (judgment === "early" || judgment === "late") {
        judgment = offsetMs < 0 ? "early" : "late";
    }

    return {
        wordTimeMs,
        nearestGridTimeMs,
        offsetMs,
        absOffsetMs,
        judgment,
        score: scoreOffset(absOffsetMs),
        subdivisionIndex: nearestSubdivisionIndex,
    };
}

export function averageAlignmentScore(results: BeatAlignmentResult[]): number {
    if (!results.length) return 0;
    const total = results.reduce((sum, r) => sum + r.score, 0);
    return Math.round(total / results.length);
}