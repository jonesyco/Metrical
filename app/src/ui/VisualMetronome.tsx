import { useEffect, useMemo, useState } from "react";

type VisualMetronomeProps = {
    pulseToken: number;
    isDownbeat: boolean;
    beatInBar: number;
    barCount: number;
    size?: number;
};

export default function VisualMetronome({
    pulseToken,
    isDownbeat,
    beatInBar,
    barCount,
    size = 28,
}: VisualMetronomeProps) {
    const [isPulsing, setIsPulsing] = useState(false);

    useEffect(() => {
        setIsPulsing(true);
        const timeout = window.setTimeout(
            () => setIsPulsing(false),
            isDownbeat ? 210 : 140
        );

        return () => window.clearTimeout(timeout);
    }, [pulseToken, isDownbeat]);

    // Reduced overall footprint so it stays contained inside the stage.
    const stageSize = Math.max(120, size * 3.4);
    const coreSize = Math.max(42, size * 1.8);

    // Keep the pulse ring visually expressive without exceeding its container too much.
    const ringScale = isPulsing ? (isDownbeat ? 1.06 : 1.03) : 0.96;
    const glowOpacity = isPulsing ? (isDownbeat ? 0.42 : 0.24) : 0.08;
    const coreScale = isPulsing ? (isDownbeat ? 1.08 : 1.03) : 1;

    const beatDots = useMemo(() => [1, 2, 3, 4], []);

    return (
        <div
            aria-label={`Beat ${beatInBar}, bar ${barCount}`}
            style={{
                position: "relative",
                width: stageSize,
                height: stageSize,
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
                borderRadius: "50%",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background:
                        "radial-gradient(circle at center, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.025) 50%, transparent 72%)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    boxShadow: "inset 0 0 30px rgba(255,255,255,0.025)",
                }}
            />

            <div
                style={{
                    position: "absolute",
                    width: stageSize * 0.86,
                    height: stageSize * 0.86,
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.055)",
                    opacity: 0.72,
                }}
            />

            <div
                style={{
                    position: "absolute",
                    width: stageSize * 0.66,
                    height: stageSize * 0.66,
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.05)",
                    opacity: 0.68,
                }}
            />

            <div
                style={{
                    position: "absolute",
                    width: stageSize * 0.94,
                    height: stageSize * 0.94,
                    borderRadius: "50%",
                    border: isDownbeat
                        ? "2px solid rgba(255,170,110,0.42)"
                        : "2px solid rgba(100,220,255,0.28)",
                    opacity: glowOpacity,
                    transform: `scale(${ringScale})`,
                    transition:
                        "transform 130ms ease-out, opacity 130ms ease-out, border-color 130ms ease-out",
                    boxShadow: isPulsing
                        ? isDownbeat
                            ? "0 0 26px rgba(255,150,90,0.16)"
                            : "0 0 20px rgba(90,210,255,0.12)"
                        : "none",
                }}
            />

            {beatDots.map((beat, index) => {
                const angle = (-90 + index * 90) * (Math.PI / 180);
                const radius = stageSize * 0.32;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                const isActive = beat === beatInBar;
                const isDotDownbeat = beat === 1;

                return (
                    <div
                        key={beat}
                        style={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            width: isDotDownbeat ? 12 : 9,
                            height: isDotDownbeat ? 12 : 9,
                            borderRadius: "50%",
                            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${isActive ? 1.14 : 1})`,
                            background: isActive
                                ? isDotDownbeat
                                    ? "rgba(255,185,120,0.92)"
                                    : "rgba(120,230,255,0.92)"
                                : "rgba(255,255,255,0.16)",
                            boxShadow: isActive
                                ? isDotDownbeat
                                    ? "0 0 12px rgba(255,170,110,0.34)"
                                    : "0 0 10px rgba(100,220,255,0.28)"
                                : "none",
                            transition:
                                "transform 120ms ease, background 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
                            opacity: isActive ? 1 : 0.58,
                        }}
                    />
                );
            })}

            <div
                style={{
                    position: "relative",
                    width: coreSize,
                    height: coreSize,
                    borderRadius: "50%",
                    background: isDownbeat
                        ? "radial-gradient(circle at 30% 30%, rgba(255,210,170,0.96) 0%, rgba(255,152,94,0.92) 45%, rgba(255,108,68,0.86) 100%)"
                        : "radial-gradient(circle at 30% 30%, rgba(220,248,255,0.94) 0%, rgba(115,222,255,0.92) 45%, rgba(44,180,224,0.84) 100%)",
                    transform: `scale(${coreScale})`,
                    transition:
                        "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
                    boxShadow: isDownbeat
                        ? "0 0 20px rgba(255,150,90,0.28), 0 0 40px rgba(255,120,80,0.10)"
                        : "0 0 18px rgba(80,210,255,0.22), 0 0 34px rgba(50,170,220,0.10)",
                    border: "1px solid rgba(255,255,255,0.18)",
                }}
            />

            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    textAlign: "center",
                }}
            >
                <div
                    style={{
                        fontSize: Math.max(18, size * 0.95),
                        fontWeight: 900,
                        lineHeight: 1,
                        color: "#f4fbff",
                        textShadow: "0 2px 12px rgba(0,0,0,0.28)",
                    }}
                >
                    {beatInBar}
                </div>
                <div
                    style={{
                        marginTop: 5,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: 1.15,
                        opacity: 0.68,
                        color: "#d6e8ee",
                    }}
                >
                    Bar {barCount}
                </div>
            </div>
        </div>
    );
}