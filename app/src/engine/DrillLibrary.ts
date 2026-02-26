import type { Drill, DrillId, SkillKey } from "./Types";

export const DRILLS: Record<DrillId, Drill> = {
    RL1_WORD_ON_BEAT: {
        id: "RL1_WORD_ON_BEAT",
        title: "Rhythm Lock: Word on Beat",
        description: "Say one word on each beat. Keep it simple. Stay musical.",
        durationSec: 30,
        targets: ["flow_continuity", "phrasing_barStart"],
        difficulty: 1,
        cognitiveLoad: 1,
    },

    RL4_LAND_LAST_WORD: {
        id: "RL4_LAND_LAST_WORD",
        title: "Rhythm Lock: Land the Last Word",
        description: "Each bar, land a clear last word right on beat 4.",
        durationSec: 40,
        targets: ["phrasing_barEnd", "phrasing_barStart"],
        difficulty: 3,
        cognitiveLoad: 3,
    },

    AF1_ASSOC_EVERY_2BARS: {
        id: "AF1_ASSOC_EVERY_2BARS",
        title: "Association Flow: New Word Every 2 Bars",
        description: "A new word appears every 2 bars. Keep flowing without stopping.",
        durationSec: 45,
        targets: ["flow_continuity", "phrasing_drift"],
        difficulty: 3,
        cognitiveLoad: 4,
        prompts: { mode: "visual", intervalBeats: 8 }, // 2 bars = 8 beats
    },

    NS1_NO_STOP_20S: {
        id: "NS1_NO_STOP_20S",
        title: "No-Stop Freestyle: 20 Seconds",
        description: "Keep talking the entire time. Momentum > perfection.",
        durationSec: 20,
        targets: ["flow_continuity"],
        difficulty: 2,
        cognitiveLoad: 2,
    },

    NS2_NO_STOP_40S: {
        id: "NS2_NO_STOP_40S",
        title: "No-Stop Freestyle: 40 Seconds",
        description: "Longer push. Stay on rhythm and recover instantly after stumbles.",
        durationSec: 40,
        targets: ["flow_continuity", "phrasing_drift"],
        difficulty: 4,
        cognitiveLoad: 4,
    },
};

export const WARMUP_DRILL: DrillId = "RL1_WORD_ON_BEAT";

export const SKILL_DISPLAY: Record<string, { label: string; tip: string }> = {
    phrasing_barStart: {
        label: "Bar Entries",
        tip: "Start thoughts cleanly near beat 1.",
    },
    phrasing_barEnd: {
        label: "Bar Endings",
        tip: "Land a clear word near beat 4.",
    },
    phrasing_drift: {
        label: "Cadence Drift",
        tip: "Avoid creeping ahead/behind over bars.",
    },
    flow_continuity: {
        label: "Flow Continuity",
        tip: "Reduce long pauses; keep output moving.",
    },
};

export const ALL_SKILLS: SkillKey[] = [
    "phrasing_barStart",
    "phrasing_barEnd",
    "phrasing_drift",
    "flow_continuity",
];