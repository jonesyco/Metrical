export type SkillKey =
    | "phrasing_barStart"
    | "phrasing_barEnd"
    | "phrasing_drift"
    | "flow_continuity";

export type DrillId =
    | "RL1_WORD_ON_BEAT"
    | "RL4_LAND_LAST_WORD"
    | "AF1_ASSOC_EVERY_2BARS"
    | "NS1_NO_STOP_20S"
    | "NS2_NO_STOP_40S";

export type CoachingMode = "light" | "technical";

export type Drill = {
    id: DrillId;
    title: string;
    description: string;
    durationSec: number;
    targets: SkillKey[];
    difficulty: number; // 1-10
    cognitiveLoad: number; // 1-10
    prompts?: {
        mode: "visual";
        intervalBeats?: number; // for association drills
    };
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
    focusSkill: SkillKey;
    why: string;
};