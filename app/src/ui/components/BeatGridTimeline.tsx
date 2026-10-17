// src/ui/components/BeatGridTimeline.tsx
import { useEffect, useState } from "react";
import type { OnsetHit } from "../../types/alignedWord";
import type { BeatJudgment } from "../../engine/beatAlignment";

type BeatGridTimelineProps = {
    bpm: number;
    isRunning: boolean;
    /** AudioContext time of beat 1, bar 1; null when idle. */
    startSec: number | null;
    /** Current AudioContext time; the grid and hits share this clock. */
    getNowSec: () => number;
    subdivision: number;
    hits: OnsetHit[];
    beatsPerBar?: number;
    pixelsPerBeat?: number;
    height?: number;
};

const JUDGMENT_COLORS: Record<BeatJudgment, string> = {
    perfect: "rgba(120,255,200,0.95)",
    great: "rgba(120,220,255,0.95)",
    good: "rgba(255,255,255,0.85)",
    early: "rgba(255,200,90,0.95)",
    late: "rgba(255,140,90,0.95)",
    miss: "rgba(255,80,80,0.8)",
};

export default function BeatGridTimeline({
    bpm,
    isRunning,
    startSec,
    getNowSec,
    subdivision,
    hits,
    beatsPerBar = 4,
    pixelsPerBeat = 72,
    height = 72,
}: BeatGridTimelineProps) {
    const [nowSec, setNowSec] = useState(() => getNowSec());

    useEffect(() => {
        if (!isRunning) return;

        let frame = 0;
        const tick = () => {
            setNowSec(getNowSec());
            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [isRunning, getNowSec]);

    const spb = 60 / bpm;
    const nowBeat = isRunning && startSec != null ? (nowSec - startSec) / spb : 0;
    const xForBeat = (beat: number) => `calc(50% + ${(beat - nowBeat) * pixelsPerBeat}px)`;

    const lines = [];
    const visible = 9;
    for (let k = Math.floor(nowBeat - visible); k <= Math.ceil(nowBeat + visible); k++) {
        const beatNumberInBar = ((k % beatsPerBar) + beatsPerBar) % beatsPerBar + 1;
        const isDownbeat = beatNumberInBar === 1;
        lines.push(
            <div key={`b${k}`} style={{ position: "absolute", left: xForBeat(k), top: 0, bottom: 0 }}>
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        width: isDownbeat ? 2 : 1,
                        background: isDownbeat ? "rgba(255,80,80,0.8)" : "rgba(255,255,255,0.18)",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        top: 8,
                        left: 6,
                        fontSize: 12,
                        fontWeight: isDownbeat ? 700 : 500,
                        color: isDownbeat ? "rgba(255,120,120,0.95)" : "rgba(255,255,255,0.5)",
                    }}
                >
                    {k < 0 ? "·" : beatNumberInBar}
                </div>
            </div>
        );
        for (let s = 1; s < subdivision; s++) {
            lines.push(
                <div
                    key={`s${k}.${s}`}
                    style={{
                        position: "absolute",
                        left: xForBeat(k + s / subdivision),
                        top: height * 0.45,
                        bottom: 0,
                        width: 1,
                        background: "rgba(255,255,255,0.08)",
                    }}
                />
            );
        }
    }

    const visibleHits =
        isRunning && startSec != null
            ? hits.filter((h) => Math.abs((h.timeSec - startSec) / spb - nowBeat) <= visible)
            : [];

    return (
        <div
            className="beat-grid-timeline"
            style={{
                position: "relative",
                width: "100%",
                height,
                overflow: "hidden",
                borderRadius: 12,
                background:
                    "linear-gradient(to bottom, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
                border: "1px solid rgba(255,255,255,0.08)",
            }}
        >
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {lines}

                {visibleHits.map((hit) => (
                    <div
                        key={hit.id}
                        title={`${hit.alignment.offsetMs.toFixed(0)}ms • ${hit.alignment.judgment}`}
                        style={{
                            position: "absolute",
                            left: xForBeat((hit.timeSec - startSec!) / spb),
                            top: height * 0.55,
                            width: 10,
                            height: 10,
                            marginLeft: -5,
                            borderRadius: "50%",
                            background: JUDGMENT_COLORS[hit.alignment.judgment],
                            boxShadow: `0 0 10px ${JUDGMENT_COLORS[hit.alignment.judgment]}`,
                        }}
                    />
                ))}
            </div>

            <div
                style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: "50%",
                    width: 2,
                    transform: "translateX(-1px)",
                    background: "rgba(255,255,255,0.95)",
                    boxShadow: "0 0 12px rgba(255,255,255,0.25)",
                    pointerEvents: "none",
                }}
            />

            <div
                style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 6,
                    transform: "translateX(-50%)",
                    fontSize: 11,
                    color: "rgba(255,255,255,0.7)",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    pointerEvents: "none",
                }}
            >
                now
            </div>
        </div>
    );
}
