import type { AttemptSummary } from "../../storage/db";
import type { SkillSnapshot } from "../../engine/Types";
import { ALL_SKILLS, DRILLS, SKILL_DISPLAY } from "../../engine/DrillLibrary";
import type { DrillId } from "../../engine/Types";
import { metricRowStyle, panelStyle, panelTitleStyle } from "../PracticeScreen.styles";

type ProgressPanelProps = {
    history: SkillSnapshot[];
    attempts: AttemptSummary[];
    /** How many recent takes to list; fewer on short windows. */
    maxRecent?: number;
};

const LINE_COLOR = "rgba(80,200,255,0.95)";
const SPARK_W = 96;
const SPARK_H = 22;
const SPARK_POINTS = 20;

function formatWhen(ts: number) {
    return new Date(ts).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

/** Skill score over time on a fixed 0-100 scale, so slopes are comparable. */
function Sparkline({ label, points }: { label: string; points: { at: number; value: number }[] }) {
    const pad = 4;
    const x = (i: number) =>
        points.length < 2 ? SPARK_W - pad : pad + (i / (points.length - 1)) * (SPARK_W - pad * 2);
    const y = (v: number) => pad + (1 - v / 100) * (SPARK_H - pad * 2);
    const last = points[points.length - 1];

    return (
        <svg width={SPARK_W} height={SPARK_H} role="img" aria-label={`${label} trend`}>
            <line
                x1={pad}
                x2={SPARK_W - pad}
                y1={y(50)}
                y2={y(50)}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
            />
            {points.length > 1 && (
                <polyline
                    points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
                    fill="none"
                    stroke={LINE_COLOR}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            )}
            {last && <circle cx={x(points.length - 1)} cy={y(last.value)} r={4} fill={LINE_COLOR} />}
            {points.map((p, i) => (
                // Invisible, larger hit targets carrying the per-point tooltip.
                <circle key={p.at} cx={x(i)} cy={y(p.value)} r={8} fill="transparent">
                    <title>{`${label}: ${p.value} • ${formatWhen(p.at)}`}</title>
                </circle>
            ))}
        </svg>
    );
}

export default function ProgressPanel({ history, attempts, maxRecent = 4 }: ProgressPanelProps) {
    const recent = history.slice(-SPARK_POINTS);

    return (
        <section
            style={panelStyle}
        >
            <div style={panelTitleStyle}>Progress</div>

            {history.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                    Finish a scored drill to start tracking your skills.
                </div>
            ) : (
                <div style={{ display: "grid", gap: 4 }}>
                    {ALL_SKILLS.map((skill) => {
                        const label = SKILL_DISPLAY[skill]?.label ?? skill;
                        const points = recent.map((s) => ({ at: s.at, value: s.scores[skill] }));
                        return (
                            <div key={skill} style={{ ...metricRowStyle, padding: "3px 10px" }}>
                                <span style={{ flex: 1 }}>{label}</span>
                                <Sparkline label={label} points={points} />
                                <strong style={{ minWidth: 24, textAlign: "right" }}>
                                    {points[points.length - 1]?.value ?? "—"}
                                </strong>
                            </div>
                        );
                    })}
                </div>
            )}

            {attempts.length > 0 && (
                <>
                    <div style={{ ...panelTitleStyle, margin: "10px 0 4px" }}>Recent takes</div>
                    <div style={{ display: "grid", gap: 4 }}>
                        {attempts.slice(0, maxRecent).map((a) => {
                            const title = DRILLS[a.drillId as DrillId]?.title ?? a.drillId;
                            return (
                                <div key={a.id} style={{ ...metricRowStyle, padding: "4px 10px" }}>
                                    <span style={{ lineHeight: 1.25 }}>
                                        {title.split(": ").pop()}
                                        <span style={{ display: "block", fontSize: 11, opacity: 0.6 }}>
                                            {a.bpm} bpm, {formatWhen(a.createdAt)}
                                        </span>
                                    </span>
                                    <strong>{a.score ?? "—"}</strong>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
}
