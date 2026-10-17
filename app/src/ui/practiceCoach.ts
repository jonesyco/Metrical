import type { RhythmMetrics } from "../engine/RhythmAnalyzer";
import type { PhrasingMetrics } from "../engine/TimingAnalyzer";
import type { RhymeMetrics } from "../engine/RhymeAnalyzer";
import { pocketLabel } from "../engine/DrillScoring";
import type { SkillKey } from "../engine/Types";

export function lightCoach(
    focusSkill: SkillKey,
    focusScore: number,
    m: RhythmMetrics
) {
    const strength =
        m.timingScore >= 70
            ? "Your syllables are sitting tight on the grid. That's real pocket."
            : m.downbeatHitRate >= 0.6
                ? "Your bar entries are coming in more musical than most beginners."
                : m.continuityScore >= 60
                    ? "You kept output moving — that’s the #1 win early."
                    : "You finished the take. Reps are what build the pocket.";

    const focus =
        focusSkill === "phrasing_barEnd"
            ? "Tighten bar endings: land a clear last word near beat 4."
            : focusSkill === "phrasing_drift"
                ? "Your cadence drifts over bars — aim for consistent phrase placement."
                : focusSkill === "phrasing_barStart"
                    ? "Enter bars cleaner — start your thought closer to beat 1."
                    : "Reduce long pauses — keep talking through uncertainty.";

    const next =
        focusScore < 60
            ? "Repeat today’s focus drill tomorrow (spaced repetition)."
            : "Increase difficulty slightly next session (constraint gets tighter).";

    return { strength, focus, next };
}

const GRID_NAMES = { 1: "quarter", 2: "eighth", 3: "triplet", 4: "sixteenth" } as const;

/** Numbers-first feedback for the "technical" coaching mode. */
export function technicalCoach(
    m: RhythmMetrics,
    extras: { phrasing?: PhrasingMetrics; rhyme?: RhymeMetrics } = {}
): string[] {
    const notes: string[] = [];
    const grid = GRID_NAMES[m.subdivision];

    notes.push(
        `Timing: ${m.meanAbsOffsetMs} ms average distance from the ${grid} grid ` +
        `(spread ${m.offsetStdMs} ms), ${Math.round(m.gridCoverage * 100)}% of ${grid} slots hit.`
    );
    notes.push(`Pocket: ${pocketLabel(m.meanSignedOffsetMs)}.`);

    if (Math.abs(m.driftMsPerBar) >= 3) {
        notes.push(
            `Drift: moving ${Math.abs(m.driftMsPerBar)} ms ${m.driftMsPerBar < 0 ? "earlier" : "later"} ` +
            `every bar. Re-anchor on each downbeat.`
        );
    }

    notes.push(
        `Downbeats: ${Math.round(m.downbeatHitRate * 100)}% hit (avg ${m.downbeatMeanAbsMs} ms off), ` +
        `${Math.round(m.downbeatAccentRate * 100)}% accented. Landed beat 4 in ${Math.round(m.landingRate * 100)}% of bars.`
    );

    notes.push(
        `Density: ${m.syllablesPerBeat} syllables/beat (the ${grid} grid holds ${m.subdivision}). ` +
        `${m.stops} stop${m.stops === 1 ? "" : "s"}, longest gap ${m.longestGapBeats} beats.`
    );

    const p = extras.phrasing;
    if (p && p.phraseCount) {
        notes.push(
            `Phrasing: ${p.phraseCount} phrases averaging ${p.avgPhraseBeats.toFixed(1)} beats; ` +
            `phrase starts ${p.phraseStartAccuracy ?? 0}/100, endings ${p.phraseEndAccuracy ?? 0}/100.`
        );
    }

    const r = extras.rhyme;
    if (r && r.contentWords) {
        const chain = r.chains[0] ? ` Longest chain: ${r.chains[0].join(" / ")}.` : "";
        const ends = r.endRhymeRate == null ? "" : `, end rhymes on ${Math.round(r.endRhymeRate * 100)}% of bar pairs`;
        notes.push(`Rhyme: ${Math.round(r.rhymeDensity * 100)}% of content words rhyme${ends}.${chain}`);
    }

    return notes;
}
