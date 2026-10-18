import { SKILL_DISPLAY } from "../../engine/DrillLibrary";
import type { CoachingMode } from "../../engine/Types";
import type { FeedbackModel } from "../PracticeScreen.types";
import { metricRowStyle, panelTitleStyle, preStyle } from "../PracticeScreen.styles";

type FeedbackPanelProps = {
    feedback: FeedbackModel;
    coachingMode: CoachingMode;
    isNarrow: boolean;
};

const headingStyle = { ...panelTitleStyle, margin: "14px 0 6px" };

export default function FeedbackPanel({ feedback, coachingMode, isNarrow }: FeedbackPanelProps) {
    const { result } = feedback;

    return (
        <section
            style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: 16,
                borderRadius: 20,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.20)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 4,
                }}
            >
                <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1 }}>
                    {result.score ?? "—"}
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Drill {feedback.step.index} of {feedback.step.total}: {feedback.drill.title}
                    </div>
                    <div style={{ fontSize: 15, marginTop: 2 }}>{result.headline}</div>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: isNarrow ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)",
                    columnGap: 20,
                }}
            >
                <div>
                    <div style={headingStyle}>This take</div>
                    <div style={{ display: "grid", gap: 6 }}>
                        {result.details.map((d) => (
                            <div key={d.label} style={metricRowStyle}>
                                <span>{d.label}</span>
                                <strong>{d.value}</strong>
                            </div>
                        ))}
                        {feedback.rhyme.contentWords > 0 && (
                            <div style={metricRowStyle}>
                                <span>Rhyme density</span>
                                <strong>{Math.round(feedback.rhyme.rhymeDensity * 100)}%</strong>
                            </div>
                        )}
                    </div>

                    <div style={headingStyle}>
                        {coachingMode === "technical" ? "Coach, technical" : "Coach"}
                    </div>
                    {coachingMode === "technical" ? (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.45 }}>
                            {feedback.technical.map((note) => (
                                <li key={note}>{note}</li>
                            ))}
                        </ul>
                    ) : (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.45 }}>
                            <li><strong>Strength:</strong> {feedback.coach.strength}</li>
                            <li><strong>Focus:</strong> {feedback.coach.focus}</li>
                            <li><strong>Next:</strong> {feedback.coach.next}</li>
                        </ul>
                    )}
                    <p style={{ fontSize: 12, opacity: 0.7, margin: "8px 0 0" }}>{feedback.learningScience}</p>
                </div>

                <div>
                    <div style={headingStyle}>Skills</div>
                    <div style={{ display: "grid", gap: 6 }}>
                        {Object.entries(feedback.skills).map(([skill, value]) => (
                            <div key={skill} style={metricRowStyle}>
                                <span>
                                    {SKILL_DISPLAY[skill]?.label ?? skill}
                                    {skill in result.observed ? (
                                        <span style={{ opacity: 0.6 }}> (trained)</span>
                                    ) : null}
                                </span>
                                <strong>{value}</strong>
                            </div>
                        ))}
                    </div>

                    <div style={headingStyle}>
                        {feedback.finalTranscript != null
                            ? "Transcript"
                            : "Transcript (live only, server transcription unavailable)"}
                    </div>
                    <pre style={{ ...preStyle, maxHeight: 140, overflowY: "auto" }}>
                        {(feedback.finalTranscript ?? feedback.liveTranscript) || "(no words heard)"}
                    </pre>

                    <details style={{ marginTop: 10 }}>
                        <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.75 }}>
                            Raw rhythm metrics
                        </summary>
                        <pre style={{ ...preStyle, marginTop: 6 }}>
                            {JSON.stringify(feedback.rhythm, null, 2)}
                        </pre>
                    </details>
                </div>
            </div>
        </section>
    );
}
