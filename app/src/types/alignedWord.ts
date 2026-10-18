import type { BeatAlignmentResult } from "../engine/beatAlignment";

export interface AlignedWord {
    id: string;
    text: string;
    timeMs: number;
    alignment?: BeatAlignmentResult;
}

/** A detected syllable onset judged against the drill's grid. */
export interface OnsetHit {
    id: string;
    timeSec: number; // AudioContext time, latency-corrected
    alignment: BeatAlignmentResult;
}