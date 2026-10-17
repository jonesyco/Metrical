import WaveformBackground from "../WaveformBackground";
import VisualMetronome from "../VisualMetronome";
import BeatGridTimeline from "./BeatGridTimeline";
import type { AlignedWord, OnsetHit } from "../../types/alignedWord";
import type { Drill } from "../../engine/Types";

type StagePanelProps = {
    isRunning: boolean;
    micStream: MediaStream | null;
    pulseToken: number;
    lastLiveWord: string;
    currentDrill: Drill | null;
    planReady: boolean;
    done: boolean;
    isStackedLayout: boolean;
    beatInBar: number;
    beatsPerBar: number;
    barCount: number;
    alignmentScore: number;
    metroPulseToken: number;
    alignedWords: AlignedWord[];
    sessionStartSec: number | null;
    getNowSec: () => number;
    hits: OnsetHit[];
    currentPrompt: string | null;
    bpm: number;
};

const pillStyle = {
    padding: "5px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: 12,
} as const;

export default function StagePanel({
    isRunning,
    micStream,
    pulseToken,
    lastLiveWord,
    currentDrill,
    planReady,
    done,
    isStackedLayout,
    beatInBar,
    beatsPerBar,
    barCount,
    alignmentScore,
    metroPulseToken,
    alignedWords,
    sessionStartSec,
    getNowSec,
    hits,
    currentPrompt,
    bpm,
}: StagePanelProps) {
    const lastHit = hits.length > 0 ? hits[hits.length - 1] : null;

    // The metronome dial scales with the available height so the stage never overflows.
    const dialSize = isStackedLayout ? "min(70vw, 300px)" : "min(32vh, 340px)";

    const title = done
        ? "Session complete"
        : currentDrill
            ? currentDrill.title
            : planReady
                ? "Session ready"
                : "Plan a session or pick a drill";

    const description = done
        ? "Re-plan for another round, or switch to a single drill."
        : currentDrill
            ? currentDrill.description
            : "Then press start: a one-bar count-in leads into the drill.";

    return (
        <section
            style={{
                position: "relative",
                flex: 1,
                minHeight: isStackedLayout ? 520 : 0,
                borderRadius: 20,
                padding: "16px 16px 18px",
                border: "1px solid rgba(255,255,255,0.08)",
                background:
                    "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.03) 100%)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "radial-gradient(circle at center, rgba(80,200,255,0.10), transparent 34%)",
                    pointerEvents: "none",
                }}
            />

            <WaveformBackground
                isActive={isRunning}
                stream={micStream}
                pulseToken={pulseToken}
                label={lastLiveWord}
            />

            <div
                style={{
                    position: "relative",
                    zIndex: 1,
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "space-evenly",
                    gap: 10,
                }}
            >
                <div style={{ textAlign: "center", maxWidth: 640 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h2>
                    <div style={{ fontSize: 13, opacity: 0.72, marginTop: 2 }}>{description}</div>
                </div>

                <div
                    aria-live="polite"
                    style={{
                        minHeight: 44,
                        display: "flex",
                        alignItems: "center",
                    }}
                >
                    {currentPrompt && isRunning && (
                        <div
                            style={{
                                padding: "4px 20px",
                                borderRadius: 14,
                                background: "rgba(255,200,90,0.12)",
                                border: "1px solid rgba(255,200,90,0.35)",
                                fontSize: 28,
                                fontWeight: 900,
                                letterSpacing: 1,
                            }}
                        >
                            {currentPrompt}
                        </div>
                    )}
                </div>

                <div style={{ width: "100%", maxWidth: 820 }}>
                    <BeatGridTimeline
                        bpm={bpm}
                        isRunning={isRunning}
                        startSec={sessionStartSec}
                        getNowSec={getNowSec}
                        subdivision={currentDrill?.scoring.subdivision ?? 1}
                        hits={hits}
                        beatsPerBar={4}
                        pixelsPerBeat={72}
                        height={56}
                    />
                </div>

                <div
                    style={{
                        position: "relative",
                        width: dialSize,
                        height: dialSize,
                        flexShrink: 0,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        overflow: "hidden",
                        background:
                            "radial-gradient(circle at center, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.025) 58%, transparent 72%)",
                        boxShadow: isRunning
                            ? "0 0 70px rgba(80,200,255,0.18), inset 0 0 60px rgba(255,255,255,0.035)"
                            : "inset 0 0 60px rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.09)",
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            inset: "4%",
                            borderRadius: "50%",
                            border: "1px solid rgba(255,255,255,0.08)",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            inset: "11%",
                            borderRadius: "50%",
                            border: "1px solid rgba(255,255,255,0.07)",
                        }}
                    />
                    <VisualMetronome
                        pulseToken={metroPulseToken}
                        isDownbeat={beatInBar === 1}
                        beatInBar={beatInBar}
                        barCount={barCount}
                        size={36}
                    />
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    <div style={pillStyle}>Beat {beatInBar} of {beatsPerBar}</div>
                    <div style={pillStyle}>{barCount === 0 ? "Count-in" : `Bar ${barCount}`}</div>
                    <div style={pillStyle}>Alignment {alignmentScore}%</div>
                    {lastHit && (
                        <div style={pillStyle}>
                            Last syllable {lastHit.alignment.offsetMs < 0 ? "early" : "late"}{" "}
                            {Math.abs(lastHit.alignment.offsetMs).toFixed(0)} ms, {lastHit.alignment.judgment}
                        </div>
                    )}
                </div>

                <div
                    style={{
                        minHeight: 40,
                        maxWidth: "100%",
                        padding: "6px 16px",
                        borderRadius: 999,
                        background: alignedWords.length ? "rgba(0,0,0,0.45)" : "transparent",
                        border: alignedWords.length ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
                        color: "white",
                        fontWeight: 800,
                        fontSize: 20,
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        boxSizing: "border-box",
                    }}
                >
                    {alignedWords.slice(-5).map((word, i, arr) => {
                        const isNewest = i === arr.length - 1;
                        return (
                            <span
                                key={word.id}
                                style={{
                                    textTransform: "uppercase",
                                    transition: "opacity 120ms ease",
                                    fontWeight: isNewest ? 900 : 700,
                                    opacity: isNewest ? 1 : 0.6,
                                }}
                            >
                                {word.text}
                            </span>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
