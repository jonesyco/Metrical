import { describe, expect, it } from "vitest";
import { planDailySession } from "../CurriculumEngine";
import { DRILLS, WARMUP_DRILL } from "../DrillLibrary";
import type { SkillKey } from "../Types";

const now = Date.UTC(2026, 9, 17);

function scores(overrides: Partial<Record<SkillKey, number>>) {
    return {
        at: now,
        scores: {
            phrasing_barStart: 80,
            phrasing_barEnd: 80,
            phrasing_drift: 80,
            flow_continuity: 80,
            ...overrides,
        },
    };
}

describe("planDailySession", () => {
    it("focuses the weakest skill and starts with the warmup", () => {
        const plan = planDailySession({ lastSkills: scores({ phrasing_barEnd: 30 }), reviewItems: [], now });
        expect(plan.focusSkill).toBe("phrasing_barEnd");
        expect(plan.drills[0]).toBe(WARMUP_DRILL);
        expect(plan.recommendedBpm).toBe(76);
    });

    it("prefers a due review over the weakest skill", () => {
        const plan = planDailySession({
            lastSkills: scores({ phrasing_barEnd: 30 }),
            reviewItems: [{ skill: "phrasing_drift", dueAt: now - 1, intervalDays: 1 }],
            now,
        });
        expect(plan.focusSkill).toBe("phrasing_drift");
    });

    it("never schedules a locked drill for a weak focus skill", () => {
        const plan = planDailySession({ lastSkills: scores({ flow_continuity: 20 }), reviewItems: [], now });
        for (const id of plan.drills.slice(0, 2)) {
            expect(DRILLS[id].unlockScore ?? 0).toBeLessThanOrEqual(20);
        }
    });

    it("steps up to harder drills as the focus skill improves", () => {
        const weak = planDailySession({ lastSkills: scores({ flow_continuity: 40 }), reviewItems: [], now });
        const strong = planDailySession({
            lastSkills: scores({ flow_continuity: 75, phrasing_barStart: 90, phrasing_barEnd: 90, phrasing_drift: 90 }),
            reviewItems: [],
            now,
        });
        expect(DRILLS[strong.drills[1]].difficulty).toBeGreaterThan(DRILLS[weak.drills[1]].difficulty);
    });
});
