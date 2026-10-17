import type { DrillId, ReviewItem, SkillKey, SkillSnapshot, PlannedSession } from "./Types";
import { ALL_SKILLS, DRILLS, WARMUP_DRILL } from "./DrillLibrary";


export function planDailySession(params: {
    lastSkills?: SkillSnapshot;
    reviewItems: ReviewItem[];
    now: number;
}): PlannedSession {
    const { lastSkills, reviewItems, now } = params;

    const scores =
        lastSkills?.scores ??
        (Object.fromEntries(ALL_SKILLS.map((s) => [s, 50])) as Record<SkillKey, number>);

    // 1) Determine focus skill:
    // Prefer due review items; else weakest among core skills.
    const due = reviewItems
        .filter((r) => r.dueAt <= now)
        .sort((a, b) => a.dueAt - b.dueAt);

    const focusSkill: SkillKey =
        due[0]?.skill ??
        (Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0] as SkillKey);

    const focusScore = scores[focusSkill] ?? 50;

    // 2) Warmup always starts simple
    const warmup: DrillId = WARMUP_DRILL;

    // 3) Build adaptive candidates for the focus skill
    // Easiest first within each tier, so a tier steps up gradually. The warmup
    // already opens the session, so it's only a focus candidate as a last resort.
    const unlocked = Object.values(DRILLS)
        .filter((drill) => {
            const targetsFocus = drill.targets.includes(focusSkill);
            const unlockScore = drill.unlockScore ?? 0;
            return targetsFocus && focusScore >= unlockScore;
        })
        .sort((a, b) => a.difficulty - b.difficulty || a.cognitiveLoad - b.cognitiveLoad);
    const withoutWarmup = unlocked.filter((d) => d.id !== warmup);
    const candidateDrills = withoutWarmup.length ? withoutWarmup : unlocked;

    const easier = candidateDrills.filter((d) => d.difficulty <= 2);
    const medium = candidateDrills.filter((d) => d.difficulty >= 2 && d.difficulty <= 4);
    const harder = candidateDrills.filter((d) => d.difficulty >= 4);

    // 4) Pick focus drill adaptively
    let focus: DrillId;
    if (focusScore < 45) {
        focus =
            easier[0]?.id ??
            medium[0]?.id ??
            harder[0]?.id ??
            pickDrillForSkill(focusSkill, {
                preferLowerLoad: true,
                maxDifficulty: 2,
                minUnlockScore: focusScore,
            });
    } else if (focusScore < 70) {
        focus =
            medium[0]?.id ??
            easier[0]?.id ??
            harder[0]?.id ??
            pickDrillForSkill(focusSkill, {
                preferLowerLoad: false,
                minUnlockScore: focusScore,
            });
    } else {
        focus =
            harder[0]?.id ??
            medium[0]?.id ??
            easier[0]?.id ??
            pickDrillForSkill(focusSkill, {
                preferLowerLoad: false,
                minUnlockScore: focusScore,
            });
    }

    // 5) Reinforcement: second due skill if available, otherwise confidence win
    const reinforceSkill = due[1]?.skill;

    let reinforce: DrillId;
    if (reinforceSkill) {
        const reinforceScore = scores[reinforceSkill] ?? 50;

        const reinforceCandidates = Object.values(DRILLS).filter((drill) => {
            const targetsSkill = drill.targets.includes(reinforceSkill);
            const unlockScore = drill.unlockScore ?? 0;
            return targetsSkill && reinforceScore >= unlockScore;
        });

        reinforce =
            reinforceCandidates.sort((a, b) => a.difficulty - b.difficulty)[0]?.id ??
            pickDrillForSkill(reinforceSkill, {
                preferLowerLoad: false,
                minUnlockScore: reinforceScore,
            });
    } else {
        reinforce = pickConfidenceWin(scores);
    }

    const drills: DrillId[] = uniq([warmup, focus, reinforce]);

    let recommendedBpm = 82;
    if (focusScore < 45) recommendedBpm = 76;
    else if (focusScore < 70) recommendedBpm = 84;
    else recommendedBpm = 92;

    return {
        id: crypto.randomUUID(),
        createdAt: now,
        drills,
        recommendedBpm,
        focusSkill,
        why: due.length
            ? `Spaced repetition: ${focusSkill} is due for review today.`
            : `Adaptive focus: ${focusSkill} is currently your lowest skill score.`,
    };
}

function pickDrillForSkill(
    skill: SkillKey,
    opts: {
        preferLowerLoad: boolean;
        maxDifficulty?: number;
        minUnlockScore?: number;
    }
): DrillId {
    const candidates = Object.values(DRILLS).filter((d) => {
        if (!d.targets.includes(skill)) return false;

        const unlockScore = d.unlockScore ?? 0;
        if (opts.minUnlockScore != null && unlockScore > opts.minUnlockScore) {
            return false;
        }

        if (opts.maxDifficulty != null && d.difficulty > opts.maxDifficulty) {
            return false;
        }

        return true;
    });

    const fallbackCandidates = candidates.length
        ? candidates
        : Object.values(DRILLS).filter((d) => d.targets.includes(skill));

    const sorted = [...fallbackCandidates].sort((a, b) => {
        const loadCmp = a.cognitiveLoad - b.cognitiveLoad;
        const diffCmp = a.difficulty - b.difficulty;
        return opts.preferLowerLoad ? (loadCmp || diffCmp) : (diffCmp || loadCmp);
    });

    return (sorted[0] ?? DRILLS[WARMUP_DRILL]).id;
}

function pickConfidenceWin(scores: Record<SkillKey, number>): DrillId {
    // pick something that targets weakest but keeps load low
    const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0] as SkillKey;
    const candidates = Object.values(DRILLS).filter(d => d.targets.includes(weakest));
    candidates.sort((a, b) => a.cognitiveLoad - b.cognitiveLoad);
    return (candidates[0] ?? DRILLS[WARMUP_DRILL]).id;
}

function uniq<T>(arr: T[]): T[] {
    const seen = new Set<T>();
    const out: T[] = [];
    for (const a of arr) if (!seen.has(a)) { seen.add(a); out.push(a); }
    return out;
}