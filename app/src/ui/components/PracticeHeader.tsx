import type { MetronomeSound } from "../../audio/Metronome";
import { statCard } from "../PracticeScreen.styles";

type PracticeHeaderProps = {
    bpm: number;
    metronomeSound: MetronomeSound;
    beatInBar: number;
    barCount: number;
    alignmentScore: number;
    whisperReady: boolean;
    isRunning: boolean;
};

export default function PracticeHeader({
    bpm,
    metronomeSound,
    beatInBar,
    barCount,
    alignmentScore,
    whisperReady,
    isRunning,
}: PracticeHeaderProps) {
    return (
        <header
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                padding: "8px 16px",
                background: "rgba(7,10,14,0.72)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
        >
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, lineHeight: 1.1 }}>
                Metronomic Articulator Engine
            </h1>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {statCard("BPM", bpm, "rgba(80,200,255,0.35)")}
                {statCard("Sound", metronomeSound, "rgba(180,140,255,0.35)")}
                {statCard("Beat", barCount === 0 ? "in" : `${beatInBar}:${barCount}`, "rgba(255,180,80,0.35)")}
                {statCard("Alignment", `${alignmentScore}%`, "rgba(120,255,200,0.35)")}
                {statCard(
                    "Whisper",
                    whisperReady ? "Online" : "Idle",
                    whisperReady ? "rgba(120,255,200,0.35)" : undefined
                )}
                {statCard(
                    "Status",
                    isRunning ? "REC" : "Ready",
                    isRunning ? "rgba(255,90,90,0.45)" : undefined
                )}
            </div>
        </header>
    );
}
