import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { recordStream, type RecordingResult } from "../audio/Recorder";
import { startLiveCapture } from "../audio/LiveCapture";
import { transcribeTake } from "../audio/transcribe";
import { DRILLS, SKILL_DISPLAY } from "../engine/DrillLibrary";
import { planDailySession } from "../engine/CurriculumEngine";
import type { FeedbackModel } from "./PracticeScreen.types";
import {
    coachInfoStyle,
    coachLabelStyle,
    coachValueStyle,
    panelStyle,
    panelTitleStyle,
    segmentGroupStyle,
    segmentStyle,
} from "./PracticeScreen.styles";
import { makeWordDeltaEmitter } from "../utils/wordDeltaEmitter";
import { nowMs } from "../utils/time";
import { lightCoach, technicalCoach } from "./practiceCoach";
import { defaultSkills, updateSkillSnapshot } from "../engine/SkillModel";
import { updateReviewSchedule } from "../engine/ReviewScheduler";
import { createWhisperStream, type AsrStatus } from "../audio/WhisperStreamClient";
import type { WhisperStreamHandle } from "../audio/WhisperStreamClient";
import type { AlignedWord, OnsetHit } from "../types/alignedWord";
import { createMetronome, type MetronomeSound } from "../audio/Metronome";

import PracticeHeader from "./components/PracticeHeader";
import SessionControlPanel from "./components/SessionControlPanel";
import DrillsPanel from "./components/DrillsPanel";
import FeedbackPanel from "./components/FeedbackPanel";
import StagePanel from "./components/StagePanel";
import ProgressPanel from "./components/ProgressPanel";
import { alignToGrid } from "../engine/beatAlignment";
import type { Onset } from "../engine/OnsetDetector";
import { analyzeRhythm } from "../engine/RhythmAnalyzer";
import { analyzePhrasing } from "../engine/TimingAnalyzer";
import { analyzeRhymes } from "../engine/RhymeAnalyzer";
import { scoreDrill } from "../engine/DrillScoring";
import {
    buildPromptSchedule,
    promptAtBeat,
    scorePromptIntegration,
    type HeardWord,
    type ScheduledPrompt,
} from "../engine/PromptBank";
import {
    CALIBRATION_BEATS,
    estimateLatencyMs,
    loadLatencyMs,
    saveLatencyMs,
} from "../engine/Calibration";

//import { useWhisperConnection } from "../hooks/useWhisperConnection";
//import ConnectionIndicator from "../ui/ConnectionIndicator";
import {
    getLatestSkills,
    getReviewSchedule,
    listAttemptSummaries,
    listSkillHistory,
    saveAttempt,
    type AttemptSummary,
    saveReviewSchedule,
    saveSkills,
} from "../storage/db";
import type {
    CoachingMode,
    DrillId,
    PlannedSession,
    SkillKey,
    SkillSnapshot,
    Subdivision,
} from "../engine/Types";

const ASR_WS_URL = "ws://localhost:3001/ws/asr";

// Extra capture after the last beat so late (latency-delayed) onsets still land.
const CAPTURE_TAIL_SEC = 0.3;

type TakeCapture = {
    startSec: number;
    onsets: Onset[];
    recording?: RecordingResult;
};

function uuid() {
    return crypto.randomUUID();
}

function waitUntil(ctx: AudioContext, timeSec: number) {
    const delayMs = Math.max(0, (timeSec - ctx.currentTime) * 1000);
    return new Promise((r) => setTimeout(r, delayMs));
}

export default function PracticeScreen() {
    const met = useMemo(() => {
        const instance = createMetronome(90);
        instance.setVolume(0.4);
        instance.setSound("thud");
        return instance;
    }, []);
    const getNowSec = useCallback(() => met.getAudioContextTime(), [met]);

    const [bpm, setBpm] = useState(90);
    const [metronomeVolume, setMetronomeVolume] = useState(0.4);

    const [metronomeSound, setMetronomeSound] = useState<MetronomeSound>("thud");
    const [pulseToken, setPulseToken] = useState(0);
    const [lastLiveWord, setLastLiveWord] = useState("");
    const [micStream, setMicStream] = useState<MediaStream | null>(null);
    const [sessionStartSec, setSessionStartSec] = useState<number | null>(null);
    const [alignedWords, setAlignedWords] = useState<AlignedWord[]>([]);
    const [hits, setHits] = useState<OnsetHit[]>([]);
    const [alignmentScore, setAlignmentScore] = useState(0);
    const [syllableCount, setSyllableCount] = useState(0);
    const [asrStatus, setAsrStatus] = useState<AsrStatus>("idle");
    const [latencyMs, setLatencyMs] = useState<number | null>(() => loadLatencyMs());
    const [prompts, setPrompts] = useState<ScheduledPrompt[]>([]);
    const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
    const [viewportWidth, setViewportWidth] = useState<number>(window.innerWidth);
    const [viewportHeight, setViewportHeight] = useState<number>(window.innerHeight);

    const [status, setStatus] = useState("Ready");
    const [isRunning, setIsRunning] = useState(false);

    const [plan, setPlan] = useState<PlannedSession | null>(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [selectedDrillId, setSelectedDrillId] = useState<DrillId>("RL1_WORD_ON_BEAT");
    const [useManualDrill, setUseManualDrill] = useState(false);

    const [lastFeedback, setLastFeedback] = useState<FeedbackModel | null>(null);
    const [coachingMode, setCoachingMode] = useState<CoachingMode>("light");
    const [centerView, setCenterView] = useState<"stage" | "feedback">("stage");
    const [skillHistory, setSkillHistory] = useState<SkillSnapshot[]>([]);
    const [recentAttempts, setRecentAttempts] = useState<AttemptSummary[]>([]);

    const liveWordLogRef = useRef<string[]>([]);
    const heardWordsRef = useRef<HeardWord[]>([]);
    const hitScoreRef = useRef({ sum: 0, count: 0 });

    const beatsPerBar = 4;

    const [metroPulseToken, setMetroPulseToken] = useState(0);
    const [beatInBar, setBeatInBar] = useState(1);
    const [barCount, setBarCount] = useState(1);

    useEffect(() => {
        const handleResize = () => {
            setViewportWidth(window.innerWidth);
            setViewportHeight(window.innerHeight);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        met.setBpm(bpm);
    }, [bpm, met]);

    useEffect(() => {
        met.setVolume(metronomeVolume);
    }, [metronomeVolume, met]);

    useEffect(() => {
        met.setSound(metronomeSound);
    }, [metronomeSound, met]);

    // Visual beat/bar counter, derived from the same grid the clicks play on.
    useEffect(() => {
        if (sessionStartSec == null) return;

        let cancelled = false;
        let timer: number | null = null;
        const spb = 60 / bpm;

        const tick = () => {
            if (cancelled) return;

            const now = met.getAudioContextTime();
            const k = Math.floor((now - sessionStartSec) / spb + 1e-6) + 1; // next beat; negative = count-in
            const delayMs = Math.max(0, (sessionStartSec + k * spb - now) * 1000);

            timer = window.setTimeout(() => {
                if (cancelled) return;

                if (k < 0) {
                    setBeatInBar(k + beatsPerBar + 1);
                    setBarCount(0);
                } else {
                    setBeatInBar((k % beatsPerBar) + 1);
                    setBarCount(Math.floor(k / beatsPerBar) + 1);
                }
                setMetroPulseToken((t) => t + 1);
                setCurrentPrompt(promptAtBeat(prompts, k)?.word ?? null);

                tick();
            }, delayMs);
        };

        tick();

        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [sessionStartSec, met, bpm, prompts]);

    const whisperRef = useRef<WhisperStreamHandle | null>(null);
    const emitPartialRef = useRef<((t: string) => void) | null>(null);

    useEffect(() => {
        // Words are display/prompt material only; their arrival time trails the
        // speech by the ASR window, so rhythm is judged from onsets instead.
        emitPartialRef.current = makeWordDeltaEmitter((w) => {
            liveWordLogRef.current.push(w);
            heardWordsRef.current.push({ text: w, timeSec: met.getAudioContextTime() });
            setLastLiveWord(w);
            setPulseToken((t) => t + 1);
            setAlignedWords((prev) => [
                ...prev.slice(-31),
                { id: uuid(), text: w, timeMs: met.getAudioContextTime() * 1000 },
            ]);
        });
    }, [met]);

    useEffect(() => {
        whisperRef.current = createWhisperStream({
            wsUrl: ASR_WS_URL,
            onPartialText: (text) => emitPartialRef.current?.(text),
            onStatus: setAsrStatus,
        });

        return () => {
            whisperRef.current?.stop();
            whisperRef.current = null;
        };
    }, []);

    const refreshProgress = useCallback(async () => {
        const [history, attempts] = await Promise.all([listSkillHistory(), listAttemptSummaries()]);
        setSkillHistory(history);
        setRecentAttempts(attempts);
    }, []);

    useEffect(() => {
        void refreshProgress();
    }, [refreshProgress]);

    async function makePlan() {
        const now = nowMs();
        const lastSkills = await getLatestSkills();
        const reviews = await getReviewSchedule();
        const p = planDailySession({ lastSkills, reviewItems: reviews, now });
        setPlan(p);
        if (p.recommendedBpm) setBpm(p.recommendedBpm);
        setStepIndex(0);
        setLastFeedback(null);
        setStatus("Planned session ✅");
    }

    function resetLiveState() {
        setAlignedWords([]);
        setHits([]);
        setAlignmentScore(0);
        setSyllableCount(0);
        hitScoreRef.current = { sum: 0, count: 0 };
        liveWordLogRef.current = [];
        heardWordsRef.current = [];
        setLastLiveWord("");
        setPulseToken(0);
        setBeatInBar(1);
        setBarCount(0);
        setMetroPulseToken(0);
        setCurrentPrompt(null);
    }

    /**
     * Count-in, then capture `durationSec` of mic audio on the metronome's
     * clock. Returns latency-corrected onsets and (optionally) the recording.
     */
    async function captureTake(params: {
        label: string;
        durationSec: number;
        subdivision: Subdivision;
        latencySec: number;
        withAsr: boolean;
        withRecorder: boolean;
    }): Promise<TakeCapture | null> {
        const ctx = met.getAudioContext();
        const stepSec = 60 / bpm / params.subdivision;
        const onsets: Onset[] = [];
        let gridStartSec = Infinity;

        setStatus(`Mic… (${params.label})`);

        let capture;
        try {
            capture = await startLiveCapture(ctx, {
                onOnset: (raw) => {
                    const o = { timeSec: raw.timeSec - params.latencySec, strengthDb: raw.strengthDb };
                    onsets.push(o);
                    if (o.timeSec < gridStartSec - stepSec / 2) return;

                    const alignment = alignToGrid(o.timeSec * 1000, gridStartSec * 1000, stepSec * 1000);
                    hitScoreRef.current.sum += alignment.score;
                    hitScoreRef.current.count += 1;
                    setAlignmentScore(Math.round(hitScoreRef.current.sum / hitScoreRef.current.count));
                    setSyllableCount(hitScoreRef.current.count);
                    setHits((prev) => [...prev.slice(-63), { id: uuid(), timeSec: o.timeSec, alignment }]);
                },
            });
        } catch (e) {
            setStatus(`Mic unavailable: ${(e as Error).message}`);
            return null;
        }

        const recorder = params.withRecorder ? recordStream(capture.stream) : null;

        try {
            setMicStream(capture.stream);
            setIsRunning(true);

            if (params.withAsr && whisperRef.current && !whisperRef.current.isRunning()) {
                await whisperRef.current.start(ctx, capture.source);
            }

            setStatus(`Count-in… (${params.label})`);
            const startSec = met.startWithCountIn(1);
            gridStartSec = startSec;
            setSessionStartSec(startSec);

            await waitUntil(ctx, startSec);
            recorder?.start();
            setStatus(`Recording… ${params.label}`);

            await waitUntil(ctx, startSec + params.durationSec + CAPTURE_TAIL_SEC);

            const recording = recorder ? await recorder.stop() : undefined;
            return { startSec, onsets, recording };
        } finally {
            whisperRef.current?.stop();
            met.stop();
            capture.stop();
            setMicStream(null);
            setIsRunning(false);
            setSessionStartSec(null);
        }
    }

    async function runCurrentDrill() {
        const drillId = useManualDrill
            ? selectedDrillId
            : plan
                ? (plan.drills[stepIndex] as DrillId)
                : null;

        if (!drillId) return;

        const drill = DRILLS[drillId];
        if (!drill) return;

        setLastFeedback(null);
        setCenterView("stage");
        resetLiveState();

        const drillPrompts = buildPromptSchedule(drill, bpm);
        setPrompts(drillPrompts);

        const take = await captureTake({
            label: drill.title,
            durationSec: drill.durationSec,
            subdivision: drill.scoring.subdivision,
            latencySec: (latencyMs ?? 0) / 1000,
            withAsr: true,
            withRecorder: true,
        });
        if (!take) return;

        setStatus("Transcribing…");
        const final = take.recording ? await transcribeTake(take.recording.blob) : null;

        setStatus("Scoring…");

        const rhythm = analyzeRhythm(
            take.onsets,
            { bpm, startSec: take.startSec, durationSec: drill.durationSec, beatsPerBar },
            drill.scoring.subdivision
        );
        const promptResult = drillPrompts.length
            ? scorePromptIntegration({
                prompts: drillPrompts,
                bpm,
                startSec: take.startSec,
                // Final words carry real timestamps; live ones arrive seconds late.
                ...(final
                    ? {
                        heard: final.words.map((w) => ({ text: w.word, timeSec: take.startSec + w.start })),
                        asrLagSec: 0.5,
                    }
                    : { heard: heardWordsRef.current }),
            })
            : undefined;
        const result = scoreDrill({ drill, rhythm, prompts: promptResult });
        const liveTranscript = liveWordLogRef.current.join(" ");

        // Word timestamps are relative to the recording, which starts on beat 1.
        const phrasing = final?.words.length
            ? analyzePhrasing({ bpm, durationSec: drill.durationSec, words: final.words, sessionStartSec: 0 }).metrics
            : undefined;
        const rhyme = final
            ? analyzeRhymes({ words: final.words, bpm, beatsPerBar })
            : analyzeRhymes({ words: liveWordLogRef.current.map((w) => ({ word: w, start: 0, end: 0 })) });

        const completedAt = nowMs();
        await saveAttempt({
            id: uuid(),
            createdAt: completedAt,
            bpm,
            drillId,
            durationMs: drill.durationSec * 1000,
            audioBlob: take.recording!.blob,
            transcript: final?.transcript ?? liveTranscript,
            words: final?.words,
            metrics: { ...rhythm, score: result.score, phrasing, rhyme },
            onsets: take.onsets.map((o) => ({
                timeSec: Math.round((o.timeSec - take.startSec) * 1000) / 1000,
                strengthDb: Math.round(o.strengthDb * 10) / 10,
            })),
            latencyMs,
        });

        const prev = await getLatestSkills();
        const observedSkills = Object.keys(result.observed) as SkillKey[];
        let nextSkills = prev ?? { at: completedAt, scores: defaultSkills() };

        if (observedSkills.length) {
            nextSkills = updateSkillSnapshot({
                previous: prev,
                observed: result.observed,
                at: completedAt,
            });
            await saveSkills(nextSkills);

            let reviews = await getReviewSchedule();
            for (const skill of observedSkills) {
                reviews = updateReviewSchedule({
                    existing: reviews,
                    now: completedAt,
                    skill,
                    performanceScore: nextSkills.scores[skill],
                });
            }
            await saveReviewSchedule(reviews);
        }

        const inPlan = !useManualDrill && plan != null;
        const focusSkill: SkillKey = inPlan ? plan.focusSkill : drill.targets[0];
        const trains = drill.targets.map((s) => SKILL_DISPLAY[s]?.label ?? s).join(", ");

        setLastFeedback({
            drill,
            liveTranscript,
            finalTranscript: final?.transcript ?? null,
            result,
            rhythm,
            coach: lightCoach(focusSkill, nextSkills.scores[focusSkill], rhythm),
            technical: technicalCoach(rhythm, { phrasing, rhyme }),
            phrasing,
            rhyme,
            learningScience: inPlan
                ? `${plan.why} Focus: ${SKILL_DISPLAY[plan.focusSkill]?.label ?? plan.focusSkill}.`
                : `Manual drill. Trains: ${trains}.`,
            skills: nextSkills.scores,
            step: inPlan
                ? { index: stepIndex + 1, total: plan.drills.length }
                : { index: 1, total: 1 },
        });
        setCenterView("feedback");

        setStatus(result.score == null ? "Saved (not scored) ⚠️" : "Saved ✅");
        if (inPlan) setStepIndex((i) => Math.min(i + 1, plan.drills.length));
        void refreshProgress();
    }

    async function calibrate() {
        setCenterView("stage");
        resetLiveState();
        setPrompts([]);

        const take = await captureTake({
            label: "Calibration",
            durationSec: CALIBRATION_BEATS * (60 / bpm),
            subdivision: 1,
            latencySec: 0,
            withAsr: false,
            withRecorder: false,
        });
        if (!take) return;

        const spb = 60 / bpm;
        const beatTimes = Array.from({ length: CALIBRATION_BEATS }, (_, k) => take.startSec + k * spb);
        const ms = estimateLatencyMs(take.onsets, beatTimes);

        if (ms == null) {
            setStatus("Calibration failed: not enough claps heard. Try again closer to the mic.");
            return;
        }
        saveLatencyMs(ms);
        setLatencyMs(ms);
        setStatus(`Calibrated ✅ ${ms} ms latency`);
    }

    const activeDrillId: DrillId | null = useManualDrill
        ? selectedDrillId
        : plan
            ? (plan.drills[Math.min(stepIndex, plan.drills.length - 1)] as DrillId)
            : null;

    const currentDrill = activeDrillId ? DRILLS[activeDrillId] : null;

    const done = plan && !useManualDrill ? stepIndex >= plan.drills.length : false;

    const currentCoach = lastFeedback?.coach;
    const currentFocusLabel = plan
        ? SKILL_DISPLAY[plan.focusSkill]?.label ?? plan.focusSkill
        : "Awaiting plan";

    const appBg = isRunning
        ? "radial-gradient(circle at top, rgba(33,179,210,0.16), transparent 32%), linear-gradient(180deg, #0b1116 0%, #090c10 100%)"
        : "radial-gradient(circle at top, rgba(255,255,255,0.05), transparent 28%), linear-gradient(180deg, #0b1116 0%, #090c10 100%)";

    // Below this width the columns stack and the page scrolls normally.
    const isStackedLayout = viewportWidth < 1100;
    const isNarrowStage = viewportWidth < 900;
    const showFeedback = centerView === "feedback" && lastFeedback !== null && !isRunning;
    // Short windows: the side coach shows just the hint (the full coaching is in Feedback).
    const compactCoach = !isStackedLayout && viewportHeight < 760;

    const columnStyle: CSSProperties = {
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 0,
        overflowY: isStackedLayout ? "visible" : "auto",
    };

    return (
        <div
            style={{
                height: isStackedLayout ? "auto" : "100dvh",
                minHeight: "100dvh",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                background: appBg,
                color: "#eef4f7",
                fontFamily: "system-ui",
                overflow: isStackedLayout ? "visible" : "hidden",
                isolation: "isolate",
            }}
        >
            <PracticeHeader
                bpm={bpm}
                metronomeSound={metronomeSound}
                beatInBar={beatInBar}
                barCount={barCount}
                alignmentScore={alignmentScore}
                whisperReady={asrStatus === "open"}
                isRunning={isRunning}
            />

            <div
                style={{
                    flex: 1,
                    minHeight: 0,
                    display: "grid",
                    gridTemplateColumns: isStackedLayout
                        ? "minmax(0, 1fr)"
                        : "minmax(260px, 300px) minmax(0, 1fr) minmax(260px, 320px)",
                    gap: 12,
                    padding: 12,
                    boxSizing: "border-box",
                }}
            >
                <aside style={columnStyle}>
                    <SessionControlPanel
                        isRunning={isRunning}
                        hasPlan={!!plan}
                        canStart={useManualDrill ? !!selectedDrillId : !!plan}
                        done={done}
                        stepIndex={stepIndex}
                        totalSteps={plan?.drills.length ?? 0}
                        status={status}
                        bpm={bpm}
                        metronomeVolume={metronomeVolume}
                        metronomeSound={metronomeSound}
                        onMakePlan={makePlan}
                        onRunCurrentDrill={runCurrentDrill}
                        onBpmChange={setBpm}
                        onMetronomeVolumeChange={setMetronomeVolume}
                        onMetronomeSoundChange={setMetronomeSound}
                        useManualDrill={useManualDrill}
                        latencyMs={latencyMs}
                        onCalibrate={calibrate}
                        coachingMode={coachingMode}
                        onCoachingModeChange={setCoachingMode}
                    />

                    <DrillsPanel
                        plan={plan}
                        stepIndex={stepIndex}
                        done={done}
                        selectedDrillId={selectedDrillId}
                        onSelectDrill={setSelectedDrillId}
                        useManualDrill={useManualDrill}
                        onToggleManual={setUseManualDrill}
                        isRunning={isRunning}
                    />
                </aside>

                <main style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
                    <div
                        style={{ ...segmentGroupStyle, alignSelf: "center", width: 260 }}
                        role="tablist"
                        aria-label="Center view"
                    >
                        <button
                            role="tab"
                            aria-selected={!showFeedback}
                            onClick={() => setCenterView("stage")}
                            style={segmentStyle(!showFeedback)}
                        >
                            Stage
                        </button>
                        <button
                            role="tab"
                            aria-selected={showFeedback}
                            onClick={() => setCenterView("feedback")}
                            disabled={lastFeedback === null || isRunning}
                            style={segmentStyle(showFeedback, lastFeedback === null || isRunning)}
                        >
                            {lastFeedback?.result.score != null
                                ? `Feedback (${lastFeedback.result.score})`
                                : "Feedback"}
                        </button>
                    </div>

                    {showFeedback && lastFeedback ? (
                        <FeedbackPanel
                            feedback={lastFeedback}
                            coachingMode={coachingMode}
                            isNarrow={isNarrowStage}
                        />
                    ) : (
                        <StagePanel
                            isRunning={isRunning}
                            micStream={micStream}
                            pulseToken={pulseToken}
                            lastLiveWord={lastLiveWord}
                            currentDrill={currentDrill}
                            planReady={!!plan}
                            done={done}
                            isStackedLayout={isStackedLayout}
                            beatInBar={beatInBar}
                            beatsPerBar={beatsPerBar}
                            barCount={barCount}
                            alignmentScore={alignmentScore}
                            metroPulseToken={metroPulseToken}
                            alignedWords={alignedWords}
                            sessionStartSec={sessionStartSec}
                            getNowSec={getNowSec}
                            hits={hits}
                            currentPrompt={currentPrompt}
                            bpm={bpm}
                        />
                    )}
                </main>

                <aside style={columnStyle}>
                    <section style={panelStyle}>
                        <div style={{ ...panelTitleStyle, display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span>Coach</span>
                            <span style={{ fontWeight: 600 }}>
                                Focus: <strong style={{ opacity: 1 }}>{currentFocusLabel}</strong>
                            </span>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

                            <div style={coachInfoStyle}>
                                <div style={coachLabelStyle}>Hint</div>
                                <div style={coachValueStyle}>
                                    {currentCoach?.focus ?? "Enter bars cleanly and stay rhythmically consistent."}
                                </div>
                            </div>

                            {!compactCoach && (
                                <>
                                    <div style={coachInfoStyle}>
                                        <div style={coachLabelStyle}>Strength</div>
                                        <div style={coachValueStyle}>
                                            {currentCoach?.strength ?? "Finish a drill to hear what’s working."}
                                        </div>
                                    </div>

                                    <div style={coachInfoStyle}>
                                        <div style={coachLabelStyle}>Next move</div>
                                        <div style={coachValueStyle}>
                                            {currentCoach?.next ?? "Start a drill and let the engine listen to your phrasing."}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    <section style={panelStyle}>
                        <div style={panelTitleStyle}>Live</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 6 }}>
                            <div style={coachInfoStyle}>
                                <div style={coachLabelStyle}>Syllables</div>
                                <strong style={{ fontSize: 16 }}>{syllableCount}</strong>
                            </div>
                            <div style={coachInfoStyle}>
                                <div style={coachLabelStyle}>Words</div>
                                <strong style={{ fontSize: 16 }}>{alignedWords.length}</strong>
                            </div>
                            <div style={{ ...coachInfoStyle, minWidth: 0 }}>
                                <div style={coachLabelStyle}>Last word</div>
                                <strong
                                    style={{
                                        fontSize: 16,
                                        display: "block",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {lastLiveWord || "—"}
                                </strong>
                            </div>
                        </div>
                    </section>

                    <ProgressPanel
                        history={skillHistory}
                        attempts={recentAttempts}
                        maxRecent={isStackedLayout || viewportHeight >= 820 ? 4 : viewportHeight >= 720 ? 2 : 1}
                    />
                </aside>
            </div>
        </div>
    );
}
