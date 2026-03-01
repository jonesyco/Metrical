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

// function isLiveSpeechSupported() {
//     return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
// }

function makeWordDeltaEmitter(onWord: (w: string) => void) {
    let lastTokens: string[] = [];

    return (partialText: string) => {
        const tokens = partialText
            .trim()
            .split(/\s+/)
            .map(t => t.replace(/[^\w'-]/g, ""))
            .filter(Boolean);

        // common-prefix diff
        let common = 0;
        while (common < lastTokens.length && common < tokens.length && lastTokens[common] === tokens[common]) {
            common++;
        }
        for (let i = common; i < tokens.length; i++) onWord(tokens[i]);
        lastTokens = tokens;
    };
}

export default function PracticeScreen() {
    const met = useMemo(() => createMetronome(90), []);
    const [bpm, setBpm] = useState(90);
    const [liveRibbon, setLiveRibbon] = useState<string[]>([]);
    const [pulseToken, setPulseToken] = useState(0);
    const [lastLiveWord, setLastLiveWord] = useState<string>("");
    const [micStream, setMicStream] = useState<MediaStream | null>(null);
    //const [flashOn, setFlashOn] = useState(false);

    //const flashTimerRef = useRef<number | null>(null);

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
    const [metroPulseToken, setMetroPulseToken] = useState(0);
    const metroTimerRef = useRef<number | null>(null);

    useEffect(() => {
        met.setBpm(bpm);
    }, [bpm, met]);

    useEffect(() => {
        // Only run while a session is active (met is started during drills)
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
                setMetroPulseToken((t) => t + 1);
                tick(); // schedule the next beat pulse
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

    // 1) Build the emitter once
    useEffect(() => {
        emitPartialRef.current = makeWordDeltaEmitter((w) => {
            liveWordLogRef.current.push(w);
            setLastLiveWord(w);
            setPulseToken((t) => t + 1);
            setLiveRibbon((prev) => [...prev, w].slice(-4));
        });
    }, []);

    // 2) Create the whisper stream once
    useEffect(() => {
        console.log("createWhisperStream:", createWhisperStream);

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
        setLiveRibbon([]); // clear ribbon at start
        liveWordLogRef.current = [];
        setLastLiveWord("");
        setPulseToken(0);
        setStatus(`Mic… (${drill.title})`);

        // 1) Get mic stream (for recording upload + metronome permission chain)
        const stream = await startMic();
        streamRef.current = stream;
        setMicStream(stream);

        const recorder = recordStream(stream);

        // 2) Start session systems
        setIsRunning(true);
        met.start();
        setStatus(`Count-in… (${drill.title})`);

        // 3) Schedule downbeat
        const sessionStartTime = met.scheduleCountInAndReturnStartTime(1);
        const durationSec = drill.durationSec;
        const stopTime = sessionStartTime + durationSec;

        // 4) Start Whisper streaming ASAP (after AudioContext is running)
        //    Do this BEFORE waiting for downbeat so Whisper has time to "warm up".
        if (whisperRef.current && !whisperRef.current.isRunning()) {
            console.log("Starting Whisper stream now");
            try {
                await whisperRef.current.start(stream);
            } catch (e) {
                console.log("Whisper stream start failed:", e);
                // continue drill even if ribbon fails
            }
        }

        // 5) Wait until downbeat, then start recording
        const startDelayMs = Math.max(
            0,
            (sessionStartTime - met.getAudioContextTime()) * 1000
        );
        await new Promise((r) => setTimeout(r, startDelayMs));

        recorder.start();
        setStatus(`Recording… ${drill.title}`);

        // 6) Wait until stop time, then stop recording
        const stopDelayMs = Math.max(0, (stopTime - met.getAudioContextTime()) * 1000);
        await new Promise((r) => setTimeout(r, stopDelayMs));

        const rec = await recorder.stop();

        // 7) Stop Whisper streaming + clear ribbon (or keep it if you prefer)
        if (whisperRef.current?.isRunning()) {
            console.log("Stopping Whisper stream now");
            whisperRef.current.stop();
        }

        setStatus("Transcribing…");
        setTimeout(() => met.stop(), 250);

        // 8) Upload to server (your existing STT endpoint)
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

        // 9) Save attempt
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

        // 10) Update skills
        const prev = await getLatestSkills();
        const observed = skillsFromPhrasingMetrics(analysis.metrics);
        const nextSkills = updateSkillSnapshot({ previous: prev, observed, at: Date.now() });
        await saveSkills(nextSkills);

        // 11) Update review schedule
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

        // 12) Coaching feedback
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

        // 13) Advance
        setIsRunning(false);
        setStatus("Saved ✅");
        setStepIndex((i) => Math.min(i + 1, plan.drills.length));
    }

    function cleanupMic() {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setMicStream(null);
    }

    useEffect(() => () => cleanupMic(), []);


    const currentDrill = plan ? DRILLS[plan.drills[Math.min(stepIndex, plan.drills.length - 1)] as DrillId] : null;
    const done = plan ? stepIndex >= plan.drills.length : false;

    return (
        <div style={{ maxWidth: 980, margin: "24px auto", padding: 16, fontFamily: "system-ui", position: "relative", zIndex: 1 }}>
            <WaveformBackground
                isActive={isRunning}
                stream={micStream}
                pulseToken={pulseToken}
                label={lastLiveWord}
            />
            <h1>Freestyle Trainer</h1>

            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <label>
                    BPM: <strong>{bpm}</strong>
                    <input
                        type="range"
                        min={70}
                        max={120}
                        value={bpm}
                        onChange={(e) => setBpm(Number(e.target.value))}
                        style={{ width: 260, display: "block" }}
                        disabled={isRunning}
                    />
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <VisualMetronome pulseToken={metroPulseToken} size={22} />
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Beat</div>
                </div>
                <button onClick={makePlan} disabled={isRunning} style={{ padding: "10px 14px", fontWeight: 700 }}>
                    Plan Today’s Session
                </button>

                <button
                    onClick={runCurrentDrill}
                    disabled={isRunning || !plan || done}
                    style={{ padding: "10px 14px", fontWeight: 700 }}
                >
                    {plan ? (done ? "Session Complete" : `Start Drill ${stepIndex + 1} / ${plan.drills.length}`) : "Start"}
                </button>

                <div>
                    <strong>Status:</strong> {status}
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                        Whisper: {whisperRef.current ? "initialized" : "not initialized"}
                    </div>
                </div>
            </div>

            {plan && (
                <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div>
                            <strong>Today’s Focus:</strong> {SKILL_DISPLAY[plan.focusSkill]?.label ?? plan.focusSkill}
                            <div style={{ fontSize: 13, opacity: 0.8 }}>{plan.why}</div>
                        </div>
                        <div style={{ fontSize: 13, opacity: 0.8 }}>
                            {currentDrill && !done ? (
                                <>
                                    <strong>Up next:</strong> {currentDrill.title} ({currentDrill.durationSec}s)
                                </>
                            ) : (
                                <strong>Done</strong>
                            )}
                        </div>
                    </div>

                    <ol style={{ marginTop: 10 }}>
                        {plan.drills.map((id, idx) => (
                            <li key={id} style={{ opacity: idx < stepIndex ? 0.5 : 1 }}>
                                <strong>{DRILLS[id as DrillId].title}</strong> — {DRILLS[id as DrillId].description}
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {liveRibbon.length > 0 && (
                <div
                    style={{
                        position: "fixed",
                        top: 18,
                        left: "50%",
                        transform: "translateX(-50%)",
                        padding: "10px 16px",
                        borderRadius: 999,
                        background: "rgba(0,0,0,0.65)",
                        color: "white",
                        fontWeight: 800,
                        fontSize: 22,
                        letterSpacing: 1,
                        //opacity: flashOn ? 1 : 0,
                        opacity: 1,
                        transition: "opacity 120ms ease",
                        pointerEvents: "none",
                        zIndex: 9999,
                        display: "flex",
                        gap: 10,
                        alignItems: "baseline",
                        whiteSpace: "nowrap",
                        backdropFilter: "blur(6px)",
                    }}
                >
                    {liveRibbon.map((w, i) => {
                        const isNewest = i === liveRibbon.length - 1;
                        return (
                            <span
                                key={`${w}-${i}`}
                                style={{
                                    textTransform: "uppercase",
                                    opacity: isNewest ? 1 : 0.55,
                                    transform: isNewest ? "scale(1.06)" : "scale(1.0)",
                                    transition: "transform 120ms ease, opacity 120ms ease",
                                }}
                            >
                                {w}
                            </span>
                        );
                    })}
                </div>
            )}

            {lastFeedback !== null && (
                <div style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
                    <h2>Feedback</h2>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                        Drill {lastFeedback.step.index} / {lastFeedback.step.total}: <strong>{lastFeedback.drill.title}</strong>
                    </div>

                    <h3>Transcript (Batch / Saved)</h3>
                    <pre style={{ background: "#f7f7f7", color: "#111", border: "1px solid #e2e2e2", padding: 12, borderRadius: 10, overflowX: "auto", fontSize: 14, lineHeight: 1.5 }}>
                        {lastFeedback.transcript || "(empty)"}
                    </pre>

                    <h3>Transcript (Live / Ribbon)</h3>
                    <pre style={{ background: "#f7f7f7", color: "#111", border: "1px solid #e2e2e2", padding: 12, borderRadius: 10, overflowX: "auto", fontSize: 14, lineHeight: 1.5 }}>
                        {lastFeedback.liveTranscript || "(empty)"}
                    </pre>

                    <h3>Coach (Light)</h3>
                    <ul>
                        <li><strong>Strength:</strong> {lastFeedback.coach.strength}</li>
                        <li><strong>Focus:</strong> {lastFeedback.coach.focus}</li>
                        <li><strong>Next:</strong> {lastFeedback.coach.next}</li>
                    </ul>

                    <h3>Learning Science</h3>
                    <p>{lastFeedback.learningScience}</p>

                    <h3>Metrics</h3>
                    <pre
                        style={{
                            background: "#f7f7f7",
                            color: "var(--text-primary, #111)",
                            border: "1px solid #e2e2e2",        // ✅ force readable text
                            padding: 12,
                            borderRadius: 10,
                            overflowX: "auto",
                            fontSize: 13,
                            lineHeight: 1.4,
                        }}
                    >
                        {JSON.stringify(lastFeedback.metrics, null, 2)}
                    </pre>

                    <h3>Skill Scores</h3>
                    <pre
                        style={{
                            background: "#f7f7f7",
                            color: "var(--text-primary, #111)",
                            border: "1px solid #e2e2e2",       // ✅ force readable text
                            padding: 12,
                            borderRadius: 10,
                            overflowX: "auto",
                            fontSize: 13,
                            lineHeight: 1.4,
                        }}
                    >
                        {JSON.stringify(lastFeedback.skills, null, 2)}
                    </pre>
                </div>
            )}

            {plan && done && (
                <div style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
                    <h2>Session Complete ✅</h2>
                    <p>Next: unlock Free Flow mode (reward) — we’ll add it after Technical toggle.</p>
                </div>
            )}
        </div>
    );
}

function lightCoach(
    focusSkill: SkillKey,
    focusScore: number,
    m: PhrasingMetrics) {
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