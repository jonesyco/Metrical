import { useEffect, useMemo, useRef, useState } from "react";
import { createMetronome } from "../audio/Metronome";
import { startMic, recordStream } from "../audio/Recorder";
import { analyzePhrasing } from "../engine/TimingAnalyzer";
import type { PhrasingMetrics } from "../engine/TimingAnalyzer";
import { DRILLS, SKILL_DISPLAY } from "../engine/DrillLibrary";
import { planDailySession } from "../engine/CurriculumEngine";
import { skillsFromPhrasingMetrics, updateSkillSnapshot } from "../engine/SkillModel";
import { updateReviewSchedule } from "../engine/ReviewScheduler";
import { createWhisperStream } from "../audio/WhisperStreamClient";
import type { WhisperStreamHandle } from "../audio/WhisperStreamClient";
import WaveformBackground from "./WaveformBackground";
import VisualMetronome from "./VisualMetronome";
import { alignWordToBeatGrid, averageAlignmentScore } from "../engine/beatAlignment";
import type { AlignedWord } from "../types/alignedWord";
import {
    getLatestSkills,
    getReviewSchedule,
    saveAttempt,
    saveReviewSchedule,
    saveSkills,
} from "../storage/db";
import type { DrillId, PlannedSession, SkillKey } from "../engine/Types";

type TranscribeResponse = {
    transcript: string;
    words: { word: string; start: number; end: number }[];
};

function uuid() {
    return crypto.randomUUID();
}

function makeWordDeltaEmitter(onWord: (w: string) => void) {
    let lastTokens: string[] = [];

    return (partialText: string) => {
        const tokens = partialText
            .trim()
            .split(/\s+/)
            .map((t) => t.replace(/[^\w'-]/g, ""))
            .filter(Boolean);

        let common = 0;
        while (
            common < lastTokens.length &&
            common < tokens.length &&
            lastTokens[common] === tokens[common]
        ) {
            common++;
        }

        for (let i = common; i < tokens.length; i++) onWord(tokens[i]);
        lastTokens = tokens;
    };
}

function statCard(label: string, value: string | number, accent?: string) {
    return (
        <div
            style={{
                minWidth: 112,
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.09)",
                background: "rgba(255,255,255,0.04)",
                boxShadow: accent ? `0 0 0 1px ${accent} inset` : undefined,
            }}
        >
            <div
                style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 1.1,
                    opacity: 0.62,
                    marginBottom: 4,
                }}
            >
                {label}
            </div>
            <div
                style={{
                    fontSize: 24,
                    fontWeight: 800,
                    lineHeight: 1.1,
                }}
            >
                {value}
            </div>
        </div>
    );
}

export default function PracticeScreen() {
    const met = useMemo(() => createMetronome(90), []);
    const [bpm, setBpm] = useState(90);
    const [pulseToken, setPulseToken] = useState(0);
    const [lastLiveWord, setLastLiveWord] = useState("");
    const [micStream, setMicStream] = useState<MediaStream | null>(null);
    const metronomeStartTimeRef = useRef<number | null>(null);
    const [alignedWords, setAlignedWords] = useState<AlignedWord[]>([]);
    const [alignmentScore, setAlignmentScore] = useState(0);
    const [viewportWidth, setViewportWidth] = useState<number>(window.innerWidth);

    const [status, setStatus] = useState("Ready");
    const [isRunning, setIsRunning] = useState(false);

    const [plan, setPlan] = useState<PlannedSession | null>(null);
    const [stepIndex, setStepIndex] = useState(0);

    type FeedbackModel = {
        drill: {
            id: string;
            title: string;
            description: string;
            durationSec: number;
        };
        liveTranscript: string;
        transcript: string;
        metrics: Record<string, unknown>;
        coach: { strength: string; focus: string; next: string };
        learningScience: string;
        skills: Record<string, number>;
        step: { index: number; total: number };
    };

    const [lastFeedback, setLastFeedback] = useState<FeedbackModel | null>(null);

    const streamRef = useRef<MediaStream | null>(null);
    const liveWordLogRef = useRef<string[]>([]);

    const beatsPerBar = 4;

    const [metroPulseToken, setMetroPulseToken] = useState(0);
    const [beatInBar, setBeatInBar] = useState(1);
    const [barCount, setBarCount] = useState(1);

    const metroTimerRef = useRef<number | null>(null);
    const beatCounterRef = useRef<number>(0);

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        met.setBpm(bpm);
    }, [bpm, met]);

    useEffect(() => {
        if (!isRunning) {
            if (metroTimerRef.current) window.clearTimeout(metroTimerRef.current);
            metroTimerRef.current = null;
            return;
        }

        let cancelled = false;

        const tick = () => {
            if (cancelled) return;

            const now = met.getAudioContextTime();
            const next = met.getNextBeatTime(now);
            const delayMs = Math.max(0, (next - now) * 1000);

            metroTimerRef.current = window.setTimeout(() => {
                if (cancelled) return;

                beatCounterRef.current += 1;

                const beat = ((beatCounterRef.current - 1) % beatsPerBar) + 1;
                const bar = Math.floor((beatCounterRef.current - 1) / beatsPerBar) + 1;

                setBeatInBar(beat);
                setBarCount(bar);
                setMetroPulseToken((t) => t + 1);

                tick();
            }, delayMs);
        };

        tick();

        return () => {
            cancelled = true;
            if (metroTimerRef.current) window.clearTimeout(metroTimerRef.current);
            metroTimerRef.current = null;
        };
    }, [isRunning, met, bpm]);

    const whisperRef = useRef<WhisperStreamHandle | null>(null);
    const emitPartialRef = useRef<((t: string) => void) | null>(null);

    useEffect(() => {
        emitPartialRef.current = makeWordDeltaEmitter((w) => {
            liveWordLogRef.current.push(w);
            setLastLiveWord(w);
            setPulseToken((t) => t + 1);

            const now = performance.now();
            const startTimeMs = metronomeStartTimeRef.current;

            const alignment =
                startTimeMs != null
                    ? alignWordToBeatGrid(now, {
                        bpm,
                        subdivision: 4,
                        startTimeMs,
                    })
                    : undefined;

            const nextWord: AlignedWord = {
                id: crypto.randomUUID(),
                text: w,
                timeMs: now,
                alignment,
            };

            setAlignedWords((prev) => {
                const next = [...prev, nextWord];
                const scored = next
                    .map((word) => word.alignment)
                    .filter((value): value is NonNullable<typeof value> => value != null);

                setAlignmentScore(averageAlignmentScore(scored));
                return next;
            });
        });
    }, [bpm]);

    useEffect(() => {
        whisperRef.current = createWhisperStream({
            wsUrl: "ws://localhost:3001/ws/asr",
            onPartialText: (text) => emitPartialRef.current?.(text),
        });

        return () => {
            whisperRef.current?.stop();
            whisperRef.current = null;
        };
    }, []);

    async function makePlan() {
        const now = Date.now();
        const lastSkills = await getLatestSkills();
        const reviews = await getReviewSchedule();
        const p = planDailySession({ lastSkills, reviewItems: reviews, now });
        setPlan(p);
        setStepIndex(0);
        setLastFeedback(null);
        setStatus("Planned session ✅");
    }

    async function runCurrentDrill() {
        if (!plan) return;

        const drillId = plan.drills[stepIndex] as DrillId;
        const drill = DRILLS[drillId];
        if (!drill) return;

        setLastFeedback(null);
        setAlignedWords([]);
        setAlignmentScore(0);
        liveWordLogRef.current = [];
        setLastLiveWord("");
        setPulseToken(0);
        setStatus(`Mic… (${drill.title})`);

        const stream = await startMic();
        streamRef.current = stream;
        setMicStream(stream);

        const recorder = recordStream(stream);

        setIsRunning(true);
        met.start();
        setStatus(`Count-in… (${drill.title})`);

        const sessionStartTime = met.scheduleCountInAndReturnStartTime(1);
        const durationSec = drill.durationSec;
        const stopTime = sessionStartTime + durationSec;

        const startDelayMs = Math.max(
            0,
            (sessionStartTime - met.getAudioContextTime()) * 1000
        );

        metronomeStartTimeRef.current = performance.now() + startDelayMs;
        setAlignedWords([]);
        setAlignmentScore(0);

        if (whisperRef.current && !whisperRef.current.isRunning()) {
            try {
                await whisperRef.current.start(stream);
            } catch (e) {
                console.log("Whisper stream start failed:", e);
            }
        }

        await new Promise((r) => setTimeout(r, startDelayMs));

        recorder.start();
        setStatus(`Recording… ${drill.title}`);

        const stopDelayMs = Math.max(0, (stopTime - met.getAudioContextTime()) * 1000);
        await new Promise((r) => setTimeout(r, stopDelayMs));

        const rec = await recorder.stop();

        if (whisperRef.current?.isRunning()) {
            whisperRef.current.stop();
        }

        setStatus("Transcribing…");
        setTimeout(() => met.stop(), 250);

        beatCounterRef.current = 0;
        setBeatInBar(1);
        setBarCount(1);
        setMetroPulseToken(0);

        const form = new FormData();
        form.append("audio", rec.blob, "take.webm");

        const resp = await fetch("http://localhost:3001/api/transcribe", {
            method: "POST",
            body: form,
        });
        const data = (await resp.json()) as TranscribeResponse;

        const analysis = analyzePhrasing({
            bpm,
            durationSec,
            words: data.words || [],
            sessionStartSec: 0,
        });

        const attemptId = uuid();
        await saveAttempt({
            id: attemptId,
            createdAt: Date.now(),
            bpm,
            drillId,
            durationMs: durationSec * 1000,
            audioBlob: rec.blob,
            transcript: data.transcript,
            words: data.words,
            metrics: analysis.metrics,
        });

        const prev = await getLatestSkills();
        const observed = skillsFromPhrasingMetrics(analysis.metrics);
        const nextSkills = updateSkillSnapshot({ previous: prev, observed, at: Date.now() });
        await saveSkills(nextSkills);

        const existingReviews = await getReviewSchedule();
        const focusSkill = plan.focusSkill as SkillKey;
        const perf = nextSkills.scores[focusSkill] ?? 50;

        const nextReviews = updateReviewSchedule({
            existing: existingReviews,
            now: Date.now(),
            skill: focusSkill,
            performanceScore: perf,
        });
        await saveReviewSchedule(nextReviews);

        setLastFeedback({
            drill,
            transcript: data.transcript,
            liveTranscript: liveWordLogRef.current.join(" "),
            metrics: analysis.metrics,
            coach: lightCoach(plan.focusSkill, nextSkills.scores[plan.focusSkill], analysis.metrics),
            learningScience: `${plan.why} Focus: ${SKILL_DISPLAY[plan.focusSkill]?.label ?? plan.focusSkill}.`,
            skills: nextSkills.scores,
            step: { index: stepIndex + 1, total: plan.drills.length },
        });

        setIsRunning(false);
        setStatus("Saved ✅");
        metronomeStartTimeRef.current = null;
        setStepIndex((i) => Math.min(i + 1, plan.drills.length));
    }

    function cleanupMic() {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setMicStream(null);
    }

    useEffect(() => () => cleanupMic(), []);

    const currentDrill = plan
        ? DRILLS[plan.drills[Math.min(stepIndex, plan.drills.length - 1)] as DrillId]
        : null;

    const done = plan ? stepIndex >= plan.drills.length : false;

    const lastAlignedWord =
        alignedWords.length > 0 ? alignedWords[alignedWords.length - 1] : null;

    const currentCoach = lastFeedback?.coach;
    const currentFocusLabel = plan
        ? SKILL_DISPLAY[plan.focusSkill]?.label ?? plan.focusSkill
        : "Awaiting plan";

    const appBg = isRunning
        ? "radial-gradient(circle at top, rgba(33,179,210,0.16), transparent 32%), linear-gradient(180deg, #0b1116 0%, #090c10 100%)"
        : "radial-gradient(circle at top, rgba(255,255,255,0.05), transparent 28%), linear-gradient(180deg, #0b1116 0%, #090c10 100%)";

    const isStackedLayout = viewportWidth < 1220;
    const isNarrowStage = viewportWidth < 900;

    return (
        <div
            style={{
                minHeight: "100vh",
                width: "100%",
                position: "relative",
                background: appBg,
                color: "#eef4f7",
                fontFamily: "system-ui",
                overflowX: "hidden",
                isolation: "isolate",
            }}
        >
            {/* <WaveformBackground
                isActive={isRunning}
                stream={micStream}
                pulseToken={pulseToken}
                label={lastLiveWord}
            /> */}

            <div
                style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 30,
                    backdropFilter: "blur(10px)",
                    background: "rgba(7,10,14,0.72)",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                }}
            >
                <div
                    style={{
                        width: "100%",
                        padding: "14px 24px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 18,
                        flexWrap: "wrap",
                        boxSizing: "border-box",
                    }}
                >
                    <div>
                        <div
                            style={{
                                fontSize: 12,
                                textTransform: "uppercase",
                                letterSpacing: 1.6,
                                opacity: 0.62,
                                marginBottom: 3,
                            }}
                        >
                            Performance Engine
                        </div>
                        <div
                            style={{
                                fontSize: 28,
                                fontWeight: 900,
                                lineHeight: 1,
                            }}
                        >
                            Metronomic Articulator Engine
                        </div>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                            alignItems: "stretch",
                        }}
                    >
                        {statCard("BPM", bpm, "rgba(80,200,255,0.35)")}
                        {statCard("Beat", `${beatInBar}:${barCount}`, "rgba(255,180,80,0.35)")}
                        {statCard("Alignment", `${alignmentScore}%`, "rgba(120,255,200,0.35)")}
                        {statCard(
                            "Whisper",
                            whisperRef.current ? "Online" : "Init",
                            whisperRef.current ? "rgba(120,255,200,0.35)" : undefined
                        )}
                        {statCard("Status", isRunning ? "REC" : "Idle", isRunning ? "rgba(255,90,90,0.45)" : undefined)}
                    </div>
                </div>
            </div>

            <div
                style={{
                    width: "100%",
                    minHeight: "calc(100vh - 92px)",
                    padding: "24px",
                    position: "relative",
                    zIndex: 20,
                    boxSizing: "border-box",
                }}
            >
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: isStackedLayout
                            ? "1fr"
                            : "minmax(280px, 20vw) minmax(760px, 1fr) minmax(280px, 20vw)",
                        gap: 24,
                        alignItems: "start",
                        width: "100%",
                        minHeight: "calc(100vh - 140px)",
                    }}
                >
                    <aside
                        style={{
                            position: isStackedLayout ? "relative" : "sticky",
                            top: isStackedLayout ? undefined : 108,
                            display: "flex",
                            flexDirection: "column",
                            gap: 18,
                            minHeight: isStackedLayout ? undefined : "calc(100vh - 160px)",
                        }}
                    >
                        <section
                            style={{
                                padding: 18,
                                borderRadius: 22,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                boxShadow: "0 18px 50px rgba(0,0,0,0.24)",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 12,
                                    textTransform: "uppercase",
                                    letterSpacing: 1.4,
                                    opacity: 0.62,
                                    marginBottom: 10,
                                }}
                            >
                                Session
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <button
                                    onClick={makePlan}
                                    disabled={isRunning}
                                    style={transportButtonStyle(false)}
                                >
                                    Plan Today’s Session
                                </button>

                                <button
                                    onClick={runCurrentDrill}
                                    disabled={isRunning || !plan || done}
                                    style={transportButtonStyle(true, isRunning || !plan || done)}
                                >
                                    {plan ? (done ? "Session Complete" : `Start Drill ${stepIndex + 1} / ${plan.drills.length}`) : "Start"}
                                </button>
                            </div>

                            <div
                                style={{
                                    marginTop: 16,
                                    paddingTop: 14,
                                    borderTop: "1px solid rgba(255,255,255,0.08)",
                                    fontSize: 14,
                                }}
                            >
                                <div style={{ marginBottom: 6 }}>
                                    <strong>Status:</strong> {status}
                                </div>
                                <div style={{ opacity: 0.78 }}>
                                    <strong>Focus:</strong> {currentFocusLabel}
                                </div>
                                <div style={{ marginTop: 10 }}>
                                    <label style={{ display: "block", fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                                        Tempo Control
                                    </label>
                                    <div style={{ marginBottom: 6, fontWeight: 700 }}>{bpm} BPM</div>
                                    <input
                                        type="range"
                                        min={70}
                                        max={120}
                                        value={bpm}
                                        onChange={(e) => setBpm(Number(e.target.value))}
                                        style={{ width: "100%" }}
                                        disabled={isRunning}
                                    />
                                </div>
                            </div>
                        </section>

                        <section
                            style={{
                                padding: 18,
                                borderRadius: 22,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                boxShadow: "0 18px 50px rgba(0,0,0,0.20)",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 12,
                                    textTransform: "uppercase",
                                    letterSpacing: 1.4,
                                    opacity: 0.62,
                                    marginBottom: 10,
                                }}
                            >
                                Today’s Path
                            </div>

                            {plan ? (
                                <>
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontWeight: 800, marginBottom: 4 }}>
                                            {SKILL_DISPLAY[plan.focusSkill]?.label ?? plan.focusSkill}
                                        </div>
                                        <div style={{ fontSize: 13, opacity: 0.78 }}>{plan.why}</div>
                                    </div>

                                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        {plan.drills.map((id, idx) => {
                                            const drill = DRILLS[id as DrillId];
                                            const isCurrent = idx === stepIndex && !done;
                                            const isDone = idx < stepIndex;
                                            return (
                                                <div
                                                    key={`${id}-${idx}`}
                                                    style={{
                                                        padding: 12,
                                                        borderRadius: 16,
                                                        border: isCurrent
                                                            ? "1px solid rgba(120,255,200,0.45)"
                                                            : "1px solid rgba(255,255,255,0.08)",
                                                        background: isCurrent
                                                            ? "rgba(120,255,200,0.08)"
                                                            : "rgba(255,255,255,0.03)",
                                                        opacity: isDone ? 0.52 : 1,
                                                        boxShadow: isCurrent
                                                            ? "0 0 0 1px rgba(120,255,200,0.14) inset"
                                                            : undefined,
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            gap: 8,
                                                            alignItems: "center",
                                                            marginBottom: 5,
                                                        }}
                                                    >
                                                        <strong style={{ fontSize: 14 }}>{drill.title}</strong>
                                                        <span
                                                            style={{
                                                                fontSize: 11,
                                                                padding: "4px 8px",
                                                                borderRadius: 999,
                                                                background: "rgba(255,255,255,0.07)",
                                                                opacity: 0.78,
                                                            }}
                                                        >
                                                            {drill.durationSec}s
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: 13, opacity: 0.74 }}>
                                                        {drill.description}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                <div style={{ fontSize: 14, opacity: 0.78 }}>
                                    Build a daily plan to populate today’s drill path.
                                </div>
                            )}
                        </section>
                    </aside>

                    <main
                        style={{
                            minHeight: isStackedLayout ? undefined : "calc(100vh - 160px)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 24,
                        }}
                    >
                        <section
                            style={{
                                position: "relative",
                                minHeight: isStackedLayout ? 560 : "70vh",
                                borderRadius: 30,
                                padding: "28px 24px 32px",
                                border: "1px solid rgba(255,255,255,0.08)",
                                background:
                                    "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.03) 100%)",
                                boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
                                overflow: "hidden",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
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
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minHeight: isStackedLayout ? 500 : "100%",
                                    gap: 18,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 12,
                                        textTransform: "uppercase",
                                        letterSpacing: 1.6,
                                        opacity: 0.62,
                                    }}
                                >
                                    Stage
                                </div>

                                <div
                                    style={{
                                        fontSize: 18,
                                        fontWeight: 800,
                                        textAlign: "center",
                                        opacity: 0.92,
                                    }}
                                >
                                    {currentDrill && !done ? currentDrill.title : plan ? "Session Ready" : "Awaiting Session Plan"}
                                </div>

                                <div
                                    style={{
                                        fontSize: 13,
                                        opacity: 0.72,
                                        textAlign: "center",
                                        maxWidth: 560,
                                    }}
                                >
                                    {currentDrill && !done
                                        ? currentDrill.description
                                        : "Plan a session, then start the next drill to enter live timing mode."}
                                </div>

                                <div
                                    style={{
                                        position: "relative",
                                        width: isNarrowStage ? 300 : 380,
                                        height: isNarrowStage ? 300 : 380,
                                        minWidth: isNarrowStage ? 300 : 380,
                                        minHeight: isNarrowStage ? 300 : 380,
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
                                            inset: 12,
                                            borderRadius: "50%",
                                            border: "1px solid rgba(255,255,255,0.08)",
                                        }}
                                    />
                                    <div
                                        style={{
                                            position: "absolute",
                                            inset: 38,
                                            borderRadius: "50%",
                                            border: "1px solid rgba(255,255,255,0.07)",
                                        }}
                                    />
                                    <div
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            display: "grid",
                                            placeItems: "center",
                                        }}
                                    >
                                        <VisualMetronome
                                            pulseToken={metroPulseToken}
                                            isDownbeat={beatInBar === 1}
                                            beatInBar={beatInBar}
                                            barCount={barCount}
                                            size={42}
                                        />
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: "flex",
                                        gap: 12,
                                        flexWrap: "wrap",
                                        justifyContent: "center",
                                    }}
                                >
                                    <div
                                        style={{
                                            padding: "10px 14px",
                                            borderRadius: 999,
                                            background: "rgba(255,255,255,0.05)",
                                            border: "1px solid rgba(255,255,255,0.08)",
                                            fontSize: 13,
                                        }}
                                    >
                                        Beat {beatInBar} of {beatsPerBar}
                                    </div>
                                    <div
                                        style={{
                                            padding: "10px 14px",
                                            borderRadius: 999,
                                            background: "rgba(255,255,255,0.05)",
                                            border: "1px solid rgba(255,255,255,0.08)",
                                            fontSize: 13,
                                        }}
                                    >
                                        Bar {barCount}
                                    </div>
                                    <div
                                        style={{
                                            padding: "10px 14px",
                                            borderRadius: 999,
                                            background: "rgba(255,255,255,0.05)",
                                            border: "1px solid rgba(255,255,255,0.08)",
                                            fontSize: 13,
                                        }}
                                    >
                                        Alignment {alignmentScore}%
                                    </div>
                                </div>

                                {alignedWords.length > 0 && (
                                    <>
                                        <div
                                            style={{
                                                marginTop: 4,
                                                padding: "12px 18px",
                                                borderRadius: 999,
                                                background: "rgba(0,0,0,0.45)",
                                                color: "white",
                                                fontWeight: 800,
                                                fontSize: 22,
                                                letterSpacing: 1,
                                                display: "flex",
                                                gap: 10,
                                                alignItems: "baseline",
                                                whiteSpace: "nowrap",
                                                backdropFilter: "blur(10px)",
                                                border: "1px solid rgba(255,255,255,0.08)",
                                                boxShadow: "0 18px 40px rgba(0,0,0,0.24)",
                                                maxWidth: "100%",
                                                overflowX: "auto",
                                            }}
                                        >
                                            {alignedWords.slice(-4).map((word, i, arr) => {
                                                const isNewest = i === arr.length - 1;
                                                const judgment = word.alignment?.judgment;

                                                const style =
                                                    judgment === "perfect"
                                                        ? {
                                                            opacity: 1,
                                                            transform: "scale(1.1)",
                                                            textShadow: "0 0 10px rgba(255,255,255,0.45)",
                                                        }
                                                        : judgment === "great"
                                                            ? {
                                                                opacity: 0.95,
                                                                transform: "scale(1.06)",
                                                                textShadow: "0 0 8px rgba(255,255,255,0.28)",
                                                            }
                                                            : judgment === "good"
                                                                ? {
                                                                    opacity: 0.85,
                                                                    transform: "scale(1.02)",
                                                                }
                                                                : judgment === "early"
                                                                    ? {
                                                                        opacity: 0.8,
                                                                        transform: "translateY(-3px)",
                                                                    }
                                                                    : judgment === "late"
                                                                        ? {
                                                                            opacity: 0.8,
                                                                            transform: "translateY(3px)",
                                                                        }
                                                                        : {
                                                                            opacity: 0.55,
                                                                            transform: "scale(1)",
                                                                        };

                                                return (
                                                    <span
                                                        key={word.id}
                                                        title={
                                                            word.alignment
                                                                ? `${word.alignment.offsetMs.toFixed(0)}ms • ${word.alignment.judgment}`
                                                                : "unscored"
                                                        }
                                                        style={{
                                                            textTransform: "uppercase",
                                                            transition:
                                                                "transform 120ms ease, opacity 120ms ease, text-shadow 120ms ease",
                                                            fontWeight: isNewest ? 900 : 700,
                                                            ...style,
                                                        }}
                                                    >
                                                        {word.text}
                                                    </span>
                                                );
                                            })}
                                        </div>

                                        {lastAlignedWord?.alignment && (
                                            <div
                                                style={{
                                                    padding: "7px 12px",
                                                    borderRadius: 999,
                                                    background: "rgba(255,255,255,0.06)",
                                                    border: "1px solid rgba(255,255,255,0.08)",
                                                    fontSize: 12,
                                                    letterSpacing: 0.5,
                                                }}
                                            >
                                                {lastAlignedWord.alignment.offsetMs < 0 ? "Early" : "Late"}{" "}
                                                {Math.abs(lastAlignedWord.alignment.offsetMs).toFixed(0)}ms •{" "}
                                                {lastAlignedWord.alignment.judgment}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </section>

                        {lastFeedback !== null && (
                            <section
                                style={{
                                    padding: 18,
                                    borderRadius: 22,
                                    background: "rgba(255,255,255,0.05)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    boxShadow: "0 18px 50px rgba(0,0,0,0.20)",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 12,
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                        marginBottom: 14,
                                    }}
                                >
                                    <h2 style={{ margin: 0 }}>Feedback</h2>
                                    <div style={{ fontSize: 13, opacity: 0.78 }}>
                                        Drill {lastFeedback.step.index} / {lastFeedback.step.total}:{" "}
                                        <strong>{lastFeedback.drill.title}</strong>
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: isNarrowStage ? "1fr" : "1fr 1fr",
                                        gap: 16,
                                    }}
                                >
                                    <div>
                                        <h3>Transcript (Batch / Saved)</h3>
                                        <pre style={preStyle}>
                                            {lastFeedback.transcript || "(empty)"}
                                        </pre>
                                    </div>

                                    <div>
                                        <h3>Transcript (Live / Ribbon)</h3>
                                        <pre style={preStyle}>
                                            {lastFeedback.liveTranscript || "(empty)"}
                                        </pre>
                                    </div>
                                </div>

                                <h3>Coach (Light)</h3>
                                <ul>
                                    <li><strong>Strength:</strong> {lastFeedback.coach.strength}</li>
                                    <li><strong>Focus:</strong> {lastFeedback.coach.focus}</li>
                                    <li><strong>Next:</strong> {lastFeedback.coach.next}</li>
                                </ul>

                                <h3>Learning Science</h3>
                                <p>{lastFeedback.learningScience}</p>

                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: isNarrowStage ? "1fr" : "1fr 1fr",
                                        gap: 16,
                                    }}
                                >
                                    <div>
                                        <h3>Metrics</h3>
                                        <pre style={preStyle}>
                                            {JSON.stringify(lastFeedback.metrics, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <h3>Skill Scores</h3>
                                        <pre style={preStyle}>
                                            {JSON.stringify(lastFeedback.skills, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            </section>
                        )}

                        {plan && done && (
                            <section
                                style={{
                                    padding: 18,
                                    borderRadius: 22,
                                    background: "rgba(120,255,200,0.08)",
                                    border: "1px solid rgba(120,255,200,0.18)",
                                    boxShadow: "0 18px 50px rgba(0,0,0,0.20)",
                                }}
                            >
                                <h2 style={{ marginTop: 0 }}>Session Complete ✅</h2>
                                <p style={{ marginBottom: 0 }}>
                                    Next: unlock Free Flow mode (reward) — we’ll add it after Technical toggle.
                                </p>
                            </section>
                        )}
                    </main>

                    <aside
                        style={{
                            position: isStackedLayout ? "relative" : "sticky",
                            top: isStackedLayout ? undefined : 108,
                            display: "flex",
                            flexDirection: "column",
                            gap: 18,
                            minHeight: isStackedLayout ? undefined : "calc(100vh - 160px)",
                        }}
                    >
                        <section
                            style={{
                                padding: 18,
                                borderRadius: 22,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                boxShadow: "0 18px 50px rgba(0,0,0,0.20)",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 12,
                                    textTransform: "uppercase",
                                    letterSpacing: 1.4,
                                    opacity: 0.62,
                                    marginBottom: 10,
                                }}
                            >
                                Coach
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div style={coachInfoStyle}>
                                    <div style={coachLabelStyle}>Current Focus</div>
                                    <div style={coachValueStyle}>{currentFocusLabel}</div>
                                </div>

                                <div style={coachInfoStyle}>
                                    <div style={coachLabelStyle}>Live Hint</div>
                                    <div style={coachValueStyle}>
                                        {currentCoach?.focus ?? "Enter bars cleanly and stay rhythmically consistent."}
                                    </div>
                                </div>

                                <div style={coachInfoStyle}>
                                    <div style={coachLabelStyle}>Strength</div>
                                    <div style={coachValueStyle}>
                                        {currentCoach?.strength ?? "Build a session plan to generate coaching feedback."}
                                    </div>
                                </div>

                                <div style={coachInfoStyle}>
                                    <div style={coachLabelStyle}>Next Move</div>
                                    <div style={coachValueStyle}>
                                        {currentCoach?.next ?? "Start a drill and let the engine observe your phrasing."}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section
                            style={{
                                padding: 18,
                                borderRadius: 22,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                boxShadow: "0 18px 50px rgba(0,0,0,0.20)",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 12,
                                    textTransform: "uppercase",
                                    letterSpacing: 1.4,
                                    opacity: 0.62,
                                    marginBottom: 10,
                                }}
                            >
                                Live Metrics
                            </div>

                            <div style={{ display: "grid", gap: 10 }}>
                                <div style={metricRowStyle}>
                                    <span>Current Drill</span>
                                    <strong>{currentDrill?.title ?? "—"}</strong>
                                </div>
                                <div style={metricRowStyle}>
                                    <span>Last Live Word</span>
                                    <strong>{lastLiveWord || "—"}</strong>
                                </div>
                                <div style={metricRowStyle}>
                                    <span>Ribbon Words</span>
                                    <strong>{alignedWords.length}</strong>
                                </div>
                                <div style={metricRowStyle}>
                                    <span>Alignment</span>
                                    <strong>{alignmentScore}%</strong>
                                </div>
                                <div style={metricRowStyle}>
                                    <span>Whisper</span>
                                    <strong>{whisperRef.current ? "initialized" : "not initialized"}</strong>
                                </div>
                            </div>
                        </section>
                    </aside>
                </div>
            </div>
        </div>
    );
}

const preStyle: React.CSSProperties = {
    background: "#f7f7f7",
    color: "#111",
    border: "1px solid #e2e2e2",
    padding: 12,
    borderRadius: 10,
    overflowX: "auto",
    fontSize: 13,
    lineHeight: 1.45,
};

const coachInfoStyle: React.CSSProperties = {
    padding: 12,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
};

const coachLabelStyle: React.CSSProperties = {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    opacity: 0.62,
    marginBottom: 6,
};

const coachValueStyle: React.CSSProperties = {
    fontSize: 14,
    lineHeight: 1.45,
};

const metricRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    fontSize: 13,
};

function transportButtonStyle(primary: boolean, disabled = false): React.CSSProperties {
    return {
        width: "100%",
        padding: "12px 14px",
        borderRadius: 14,
        border: primary
            ? "1px solid rgba(120,255,200,0.30)"
            : "1px solid rgba(255,255,255,0.10)",
        background: disabled
            ? "rgba(255,255,255,0.04)"
            : primary
                ? "linear-gradient(180deg, rgba(120,255,200,0.20) 0%, rgba(120,255,200,0.09) 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 100%)",
        color: disabled ? "rgba(255,255,255,0.42)" : "#eef4f7",
        fontWeight: 800,
        letterSpacing: 0.4,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 10px 24px rgba(0,0,0,0.20)",
    };
}

function lightCoach(
    focusSkill: SkillKey,
    focusScore: number,
    m: PhrasingMetrics
) {
    const strength =
        (m.barStartStrength ?? 0) >= 60
            ? "Your bar entries are coming in more musical than most beginners."
            : "You kept output moving — that’s the #1 win early.";

    const focus =
        focusSkill === "phrasing_barEnd"
            ? "Tighten bar endings: land a clear last word near beat 4."
            : focusSkill === "phrasing_drift"
                ? "Your cadence drifts over bars — aim for consistent phrase placement."
                : focusSkill === "phrasing_barStart"
                    ? "Enter bars cleaner — start your thought closer to beat 1."
                    : "Reduce long pauses — keep talking through uncertainty.";

    const next =
        focusScore < 60
            ? "Repeat today’s focus drill tomorrow (spaced repetition)."
            : "Increase difficulty slightly next session (constraint gets tighter).";

    return { strength, focus, next };
}