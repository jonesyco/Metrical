import type { BeatAlignmentResult } from "../engine/beatAlignment";

export interface AlignedWord {
    id: string;
    text: string;
    timeMs: number;
    alignment?: BeatAlignmentResult;
}