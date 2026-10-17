import type { PhrasingMetrics } from "./TimingAnalyzer";
import type { SkillKey, SkillSnapshot } from "./Types";

export type SkillScores = Record<SkillKey, number>;

export function defaultSkills(): SkillScores {
    return {
        phrasing_barStart: 50,
        phrasing_barEnd: 50,
        phrasing_drift: 50,
        flow_continuity: 50,
    };
}

// Map analysis metrics → skill scores (0-100)
export function skillsFromPhrasingMetrics(m: PhrasingMetrics): Partial<SkillScores> {
    // barStartStrength and barEndControl are already 0-100 in your analyzer
    const driftAbs = Math.abs(m.cadenceDrift ?? 0);
    // drift score: 0 drift -> 100, bigger drift -> lower
    const driftScore = clamp(100 - driftAbs * 400, 0, 100); // 0.25 beats/bar => ~0 score

    // continuity proxy: penalize pauses on beat1 heavily
    const pausePenalty = (m.pausesOnBeat1 ?? 0) * 12;
    const continuity = clamp(80 - pausePenalty, 0, 100);
    const phraseStart = m.phraseStartAccuracy ?? 0;
    const phraseEnd = m.phraseEndAccuracy ?? 0;
    const cadence = m.cadenceStability ?? 0;
    const phraseConsistency = m.phraseLengthConsistency ?? 0;
    return {
        phrasing_barStart: Math.round(
            ((m.barStartStrength ?? 0) * 0.55) + phraseStart * 0.45
        ),

        phrasing_barEnd: Math.round(
            ((m.barEndControl ?? 0) * 0.55) + phraseEnd * 0.45
        ),

        phrasing_drift: Math.round(
            driftScore * 0.35 + cadence * 0.4 + phraseConsistency * 0.25
        ),
        flow_continuity: continuity,
    };
}

export function updateSkillSnapshot(params: {
    previous?: SkillSnapshot;
    observed: Partial<SkillScores>;
    at: number;
}): SkillSnapshot {
    const prevScores = params.previous?.scores ?? defaultSkills();
    const out: SkillScores = { ...prevScores };

    // Simple recency-weighted update
    for (const k of Object.keys(out) as SkillKey[]) {
        if (params.observed[k] == null) continue;
        const obs = params.observed[k]!;
        out[k] = Math.round(0.7 * out[k] + 0.3 * obs);
    }

    return { at: params.at, scores: out };
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}