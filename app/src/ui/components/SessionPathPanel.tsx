import { DRILLS, SKILL_DISPLAY } from "../../engine/DrillLibrary";
import type { DrillId, PlannedSession } from "../../engine/Types";

type SessionPathPanelProps = {
    plan: PlannedSession | null;
    stepIndex: number;
    done: boolean;
};

/** Today's planned drills; the current one is highlighted and described. */
export default function SessionPathPanel({
    plan,
    stepIndex,
    done,
}: SessionPathPanelProps) {
    if (!plan) {
        return (
            <div style={{ fontSize: 13, opacity: 0.78 }}>
                Your plan shows up here: a warmup, a drill for your weakest skill, and a reinforcement drill.
            </div>
        );
    }

    return (
        <>
            <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 8 }} title={plan.why}>
                Focus: <strong>{SKILL_DISPLAY[plan.focusSkill]?.label ?? plan.focusSkill}</strong>
            </div>

            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                {plan.drills.map((id, idx) => {
                    const drill = DRILLS[id as DrillId];
                    const isCurrent = idx === stepIndex && !done;
                    const isDone = idx < stepIndex;

                    return (
                        <li
                            key={`${id}-${idx}`}
                            aria-current={isCurrent ? "step" : undefined}
                            style={{
                                padding: "6px 10px",
                                borderRadius: 10,
                                border: isCurrent
                                    ? "1px solid rgba(120,255,200,0.45)"
                                    : "1px solid rgba(255,255,255,0.08)",
                                background: isCurrent
                                    ? "rgba(120,255,200,0.08)"
                                    : "rgba(255,255,255,0.03)",
                                opacity: isDone ? 0.52 : 1,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 8,
                                    fontSize: 13,
                                }}
                            >
                                <strong>
                                    {isDone ? "✓ " : `${idx + 1}. `}
                                    {drill.title.split(": ").pop()}
                                </strong>
                                <span style={{ opacity: 0.65 }}>{drill.durationSec}s</span>
                            </div>

                            {isCurrent && (
                                <div style={{ fontSize: 12, opacity: 0.74, marginTop: 2 }}>
                                    {drill.description}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
        </>
    );
}
