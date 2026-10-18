export type SkillKey =
    | "phrasing_barStart"
    | "phrasing_barEnd"
    | "phrasing_drift"
    | "flow_continuity";

export type DrillId =
    | "RL1_WORD_ON_BEAT"
    | "RL2_TWO_WORDS_PER_BEAT"
    | "RL3_TRIPLET_FLOW"
    | "RL4_LAND_LAST_WORD"
    | "RL5_BAR_START_PUNCH"
    | "AF1_ASSOC_EVERY_2BARS"
    | "AF2_ASSOC_EVERY_BAR"
    | "AF3_ASSOC_EVERY_BEAT"
    | "NS1_NO_STOP_20S"
    | "NS2_NO_STOP_40S"
    | "NS3_NO_STOP_60S";

export type CoachingMode = "light" | "technical";

/** Grid slots per beat: 1 = quarters, 2 = eighths, 3 = triplets, 4 = sixteenths. */
export type Subdivision = 1 | 2 | 3 | 4;

/**
 * How a drill's take is judged:
 * - grid: hit every slot of `subdivision` on time
 * - barStart: punch beat 1 of each bar
 * - barEnd: land the last word of each bar on beat 4
 * - continuity: keep producing syllables with no stops
 * - association: continuity plus working the visual prompts in
 */
export type DrillScoringKind = "grid" | "barStart" | "barEnd" | "continuity" | "association";

export type DrillScoring = {
    kind: DrillScoringKind;
    subdivision: Subdivision;
};

export type Drill = {
    id: DrillId;
    title: string;
    description: string;
    durationSec: number;
    targets: SkillKey[];
    difficulty: number; // 1-10
    cognitiveLoad: number; // 1-10
    scoring: DrillScoring;
    prompts?: {
        mode: "visual";
        intervalBeats?: number; // for association drills
    };
    minBpm?: number;
    maxBpm?: number;
    recommendedWhen?: SkillKey[];
    unlockScore?: number;
};

export type SkillSnapshot = {
    at: number;
    scores: Record<SkillKey, number>; // 0-100
};

export type ReviewItem = {
    skill: SkillKey;
    dueAt: number;     // epoch ms
    intervalDays: number;
};

export type PlannedSession = {
    id: string;
    createdAt: number;
    drills: DrillId[];
    recommendedBpm?: number;
    focusSkill: SkillKey;
    why: string;
};