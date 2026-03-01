import { useEffect, useState } from "react";

type Props = {
    pulseToken: number;      // increments every beat
    isDownbeat: boolean;     // true on beat 1
    beatInBar: number;       // 1..beatsPerBar
    barCount: number;        // 1..N
    size?: number;           // px
};

export default function VisualMetronome({
    pulseToken,
    isDownbeat,
    beatInBar,
    barCount,
    size = 22,
}: Props) {
    const [on, setOn] = useState(false);

    useEffect(() => {
        setOn(true);
        const t = window.setTimeout(() => setOn(false), isDownbeat ? 140 : 110);
        return () => window.clearTimeout(t);
    }, [pulseToken, isDownbeat]);

    const scale = on ? (isDownbeat ? 1.65 : 1.35) : 1.0;
    const blur = on ? (isDownbeat ? 26 : 18) : 0;
    const glow = isDownbeat ? "rgba(255,0,0,1.0)" : "rgba(255,0,0,0.95)";
    const base = isDownbeat ? "rgba(255,0,0,0.45)" : "rgba(255,0,0,0.35)";

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
                aria-label="Metronome"
                title="Metronome"
                style={{
                    width: size,
                    height: size,
                    borderRadius: 999,
                    background: base,
                    boxShadow: on ? `0 0 ${blur}px ${glow}` : "0 0 0 rgba(0,0,0,0)",
                    transform: `scale(${scale})`,
                    transition: "transform 80ms ease-out, box-shadow 80ms ease-out",
                }}
            />
            <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.1 }}>
                <div>
                    <strong>Beat:</strong> {beatInBar}
                </div>
                <div>
                    <strong>Bar:</strong> {barCount}
                </div>
            </div>
        </div>
    );
}