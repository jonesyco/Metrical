import type { DrillId, ReviewItem, SkillKey, SkillSnapshot, PlannedSession } from "./Types";
import { ALL_SKILLS, DRILLS, WARMUP_DRILL } from "./DrillLibrary";


export function planDailySession(params: {
    lastSkills?: SkillSnapshot;
    reviewItems: ReviewItem[];
    now: number;
}): PlannedSession {
    const { lastSkills, reviewItems, now } = params;

    const scores = lastSkills?.scores ?? Object.fromEntries(ALL_SKILLS.map(s => [s, 50])) as Record<SkillKey, number>;

    // 1) Determine focus skill:
    // Prefer due review items; else weakest among core skills.
    const due = reviewItems.filter(r => r.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
    const focusSkill: SkillKey =
        due[0]?.skill ??
        (Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0] as SkillKey);

    // 2) Warmup always rhythm-y
    const warmup: DrillId = WARMUP_DRILL;

    // 3) Focus drill: choose a drill that targets focusSkill, lowest cognitive load that is still effective
    const focus = pickDrillForSkill(focusSkill, { preferLowerLoad: true });

    // 4) Reinforcement: pick either another due skill drill or a confidence win
    const reinforceSkill = due[1]?.skill;
    const reinforce = reinforceSkill
        ? pickDrillForSkill(reinforceSkill, { preferLowerLoad: false })
        : pickConfidenceWin(scores);

    const drills: DrillId[] = uniq([warmup, focus, reinforce]);

    return {
        id: crypto.randomUUID(),
        createdAt: now,
        drills,
        focusSkill,
        why: due.length
            ? `Spaced repetition: ${focusSkill} is due for review today.`
            : `Adaptive focus: ${focusSkill} is currently your lowest skill score.`,
    };
}

function pickDrillForSkill(skill: SkillKey, opts: { preferLowerLoad: boolean }): DrillId {
    const candidates = Object.values(DRILLS).filter(d => d.targets.includes(skill));
    const sorted = candidates.sort((a, b) => {
        const loadCmp = (a.cognitiveLoad - b.cognitiveLoad);
        const diffCmp = (a.difficulty - b.difficulty);
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