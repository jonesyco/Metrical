import type { MetronomeSound } from "../../audio/Metronome";
import type { CoachingMode } from "../../engine/Types";
import {
    fieldLabelStyle,
    panelStyle,
    panelTitleStyle,
    segmentGroupStyle,
    segmentStyle,
    selectStyle,
    transportButtonStyle,
} from "../PracticeScreen.styles";

type SessionControlPanelProps = {
    isRunning: boolean;
    hasPlan: boolean;
    done: boolean;
    stepIndex: number;
    totalSteps: number;
    status: string;
    canStart: boolean;
    bpm: number;
    metronomeVolume: number;
    metronomeSound: MetronomeSound;
    onMakePlan: () => void;
    onRunCurrentDrill: () => void;
    onBpmChange: (value: number) => void;
    onMetronomeVolumeChange: (value: number) => void;
    onMetronomeSoundChange: (value: MetronomeSound) => void;
    useManualDrill: boolean;
    latencyMs: number | null;
    onCalibrate: () => void;
    coachingMode: CoachingMode;
    onCoachingModeChange: (mode: CoachingMode) => void;
};

export default function SessionControlPanel({
    isRunning,
    hasPlan,
    done,
    stepIndex,
    totalSteps,
    status,
    canStart,
    bpm,
    metronomeVolume,
    metronomeSound,
    onMakePlan,
    onRunCurrentDrill,
    onBpmChange,
    onMetronomeVolumeChange,
    onMetronomeSoundChange,
    useManualDrill,
    latencyMs,
    onCalibrate,
    coachingMode,
    onCoachingModeChange,
}: SessionControlPanelProps) {
    const startDisabled = isRunning || !canStart || done;

    return (
        <section style={panelStyle}>
            <div style={panelTitleStyle}>Session</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {!useManualDrill && (
                    <button
                        onClick={onMakePlan}
                        disabled={isRunning}
                        style={transportButtonStyle(false, isRunning)}
                    >
                        {hasPlan ? "Re-plan today’s session" : "Plan today’s session"}
                    </button>
                )}

                <button
                    onClick={onRunCurrentDrill}
                    disabled={startDisabled}
                    style={transportButtonStyle(true, startDisabled)}
                >
                    {done
                        ? "Session complete"
                        : useManualDrill
                            ? "Start drill"
                            : hasPlan
                                ? `Start drill ${stepIndex + 1} of ${totalSteps}`
                                : "Plan a session to start"}
                </button>
            </div>

            <div
                role="status"
                style={{ fontSize: 12, opacity: 0.8, margin: "8px 0 10px", minHeight: 16 }}
            >
                {status}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label>
                    <div style={fieldLabelStyle}>
                        <span>Tempo</span>
                        <strong>{bpm} BPM</strong>
                    </div>
                    <input
                        type="range"
                        min={70}
                        max={120}
                        value={bpm}
                        onChange={(e) => onBpmChange(Number(e.target.value))}
                        disabled={isRunning}
                        style={{ width: "100%", margin: 0 }}
                    />
                </label>

                <label>
                    <div style={fieldLabelStyle}>
                        <span>Volume</span>
                        <strong>{Math.round(metronomeVolume * 100)}%</strong>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={metronomeVolume}
                        onChange={(e) => onMetronomeVolumeChange(Number(e.target.value))}
                        style={{ width: "100%", margin: 0 }}
                    />
                </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <label style={{ display: "block", minWidth: 0 }}>
                    <div style={fieldLabelStyle}>Click sound</div>
                    <select
                        value={metronomeSound}
                        onChange={(e) => onMetronomeSoundChange(e.target.value as MetronomeSound)}
                        style={selectStyle}
                    >
                        <option value="thud">Thud</option>
                        <option value="click">Click</option>
                        <option value="beep">Beep</option>
                        <option value="wood">Wood</option>
                        <option value="beat">Boom-bap beat (headphones)</option>
                    </select>
                </label>

                <div>
                    <div style={fieldLabelStyle}>Coaching</div>
                    <div style={segmentGroupStyle} role="group" aria-label="Coaching mode">
                        {(["light", "technical"] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => onCoachingModeChange(mode)}
                                aria-pressed={coachingMode === mode}
                                style={segmentStyle(coachingMode === mode)}
                            >
                                {mode === "light" ? "Light" : "Technical"}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginTop: 10,
                    fontSize: 12,
                }}
                title="After the 4-click count-in, clap or say “ta” on each of the next 8 clicks."
            >
                <span>
                    <span style={{ opacity: 0.75 }}>Mic latency </span>
                    <strong>{latencyMs == null ? "not calibrated" : `${latencyMs} ms`}</strong>
                </span>
                <button
                    onClick={onCalibrate}
                    disabled={isRunning}
                    style={{ ...transportButtonStyle(latencyMs == null, isRunning), width: "auto", padding: "5px 10px", fontSize: 12 }}
                >
                    {latencyMs == null ? "Calibrate" : "Recalibrate"}
                </button>
            </div>
            {latencyMs == null && (
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                    Clap on 8 clicks after the count-in so timing scores line up.
                </div>
            )}
        </section>
    );
}
