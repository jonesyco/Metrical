import type { ReviewItem, SkillKey } from "./Types";

export function updateReviewSchedule(params: {
    existing: ReviewItem[];
    now: number;
    skill: SkillKey;
    performanceScore: number; // 0-100
}): ReviewItem[] {
    const { existing, now, skill, performanceScore } = params;

    const rest = existing.filter(r => r.skill !== skill);
    const prev = existing.find(r => r.skill === skill);

    // If weak, bring back tomorrow. If ok, 3 days. If strong, 7 days.
    const intervalDays =
        performanceScore < 55 ? 1 :
            performanceScore < 70 ? 3 : 7;

    // If already had a longer interval and performance is strong, extend a bit
    const finalDays = prev && performanceScore >= 70 ? Math.max(prev.intervalDays, intervalDays) : intervalDays;

    const dueAt = now + finalDays * 24 * 60 * 60 * 1000;

    return [...rest, { skill, dueAt, intervalDays: finalDays }];
}