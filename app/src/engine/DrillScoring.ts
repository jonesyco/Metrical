import type { RhythmMetrics } from "./RhythmAnalyzer";
import type { Drill, SkillKey } from "./Types";

export type SkillObservations = Partial<Record<SkillKey, number>>;

export type PromptIntegration = { used: number; total: number; rate: number };

export type DrillResult = {
    /** 0-100, or null when the take had too little audio to judge. */
    score: number | null;
    headline: string;
    details: { label: string; value: string }[];
    /** Only the skills this drill trains; feeds the skill model. */
    observed: SkillObservations;
};

/** Below this many detected syllables we don't trust any metric. */
export const MIN_ONSETS = 4;

const SUBDIVISION_NAMES = { 1: "quarter", 2: "eighth", 3: "triplet", 4: "sixteenth" } as const;

export function scoreDrill(params: {
    drill: Drill;
    rhythm: RhythmMetrics;
    prompts?: PromptIntegration;
}): DrillResult {
    const { drill, rhythm: r, prompts } = params;

    if (r.onsetCount < MIN_ONSETS) {
        return {
            score: null,
            headline: "Didn't pick up enough voice to score this take. Check the mic and go again.",
            details: [{ label: "Syllables detected", value: String(r.onsetCount) }],
            observed: {},
        };
    }

    const skillValues: Record<SkillKey, number> = {
        phrasing_barStart: barStartSkill(r),
        phrasing_barEnd: Math.round(r.landingRate * 100),
        phrasing_drift: r.driftScore,
        flow_continuity: r.continuityScore,
    };

    const observed: SkillObservations = {};
    for (const skill of drill.targets) observed[skill] = skillValues[skill];

    const sub = SUBDIVISION_NAMES[drill.scoring.subdivision];
    let score: number;
    let headline: string;
    const details: { label: string; value: string }[] = [];

    switch (drill.scoring.kind) {
        case "grid":
            score = Math.round(r.gridCoverage * 60 + r.timingScore * 0.4);
            headline = `Hit ${pct(r.gridCoverage)} of the ${sub} grid, ${r.meanAbsOffsetMs} ms off on average.`;
            details.push(
                { label: `${cap(sub)} slots hit`, value: pct(r.gridCoverage) },
                { label: "Timing accuracy", value: `${r.timingScore}/100` }
            );
            break;

        case "barStart":
            score = Math.round(skillValues.phrasing_barStart * 0.75 + r.downbeatAccentRate * 25);
            headline = `Punched beat 1 in ${pct(r.downbeatHitRate)} of bars.`;
            details.push(
                { label: "Downbeats hit", value: pct(r.downbeatHitRate) },
                { label: "Downbeat accuracy", value: `${r.downbeatMeanAbsMs} ms` },
                { label: "Downbeats accented", value: pct(r.downbeatAccentRate) }
            );
            break;

        case "barEnd":
            score = Math.round(r.landingRate * 100);
            headline = `Landed the last word on beat 4 in ${pct(r.landingRate)} of bars.`;
            details.push({ label: "Bars landed on 4", value: pct(r.landingRate) });
            break;

        case "continuity":
            score = r.continuityScore;
            headline = r.stops === 0
                ? "No stops. You kept it moving the whole way."
                : `Active on ${pct(r.activeBeatRate)} of beats with ${r.stops} stop${r.stops === 1 ? "" : "s"}.`;
            details.push(
                { label: "Beats with voice", value: pct(r.activeBeatRate) },
                { label: "Stops (2+ beats)", value: String(r.stops) },
                { label: "Longest gap", value: `${r.longestGapBeats} beats` }
            );
            break;

        case "association":
            if (prompts && prompts.total > 0) {
                score = Math.round(r.continuityScore * 0.6 + prompts.rate * 40);
                headline = `Worked in ${prompts.used} of ${prompts.total} prompts, active on ${pct(r.activeBeatRate)} of beats.`;
                details.push({ label: "Prompts used", value: `${prompts.used} / ${prompts.total}` });
            } else {
                score = r.continuityScore;
                headline = `Active on ${pct(r.activeBeatRate)} of beats.`;
            }
            details.push(
                { label: "Beats with voice", value: pct(r.activeBeatRate) },
                { label: "Stops (2+ beats)", value: String(r.stops) }
            );
            break;
    }

    details.push(
        { label: "Syllables per beat", value: String(r.syllablesPerBeat) },
        { label: "Pocket", value: pocketLabel(r.meanSignedOffsetMs) }
    );

    return { score: clamp100(score), headline, details, observed };
}

function barStartSkill(r: RhythmMetrics): number {
    const timing = clamp100(100 * (1 - r.downbeatMeanAbsMs / 80));
    return clamp100(r.downbeatHitRate * (70 + timing * 0.3));
}

export function pocketLabel(meanSignedMs: number): string {
    if (Math.abs(meanSignedMs) < 15) return "centered";
    return meanSignedMs < 0
        ? `rushing ${Math.abs(meanSignedMs)} ms`
        : `laid back ${meanSignedMs} ms`;
}

function pct(rate: number): string {
    return `${Math.round(rate * 100)}%`;
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function clamp100(n: number): number {
    return Math.max(0, Math.min(100, Math.round(n)));
}
