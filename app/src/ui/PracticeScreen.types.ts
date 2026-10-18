// src/ui/PracticeScreen.types.ts
export type TranscribeResponse = {
    transcript: string;
    words: { word: string; start: number; end: number }[];
};

import type { DrillResult } from "../engine/DrillScoring";
import type { RhythmMetrics } from "../engine/RhythmAnalyzer";
import type { RhymeMetrics } from "../engine/RhymeAnalyzer";
import type { PhrasingMetrics } from "../engine/TimingAnalyzer";

export type FeedbackModel = {
    drill: {
        id: string;
        title: string;
        description: string;
        durationSec: number;
    };
    liveTranscript: string;
    /** Whisper transcript of the whole take; null when the server couldn't transcribe. */
    finalTranscript: string | null;
    result: DrillResult;
    rhythm: RhythmMetrics;
    coach: { strength: string; focus: string; next: string };
    technical: string[];
    phrasing?: PhrasingMetrics;
    rhyme: RhymeMetrics;
    learningScience: string;
    skills: Record<string, number>;
    step: { index: number; total: number };
};