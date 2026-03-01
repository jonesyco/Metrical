import { useEffect, useState } from "react";

type Props = {
    pulseToken: number; // increment this every beat
    size?: number;      // px
};

export default function VisualMetronome({ pulseToken, size = 22 }: Props) {
    const [on, setOn] = useState(false);

    useEffect(() => {
        // flash briefly each time pulseToken changes
        setOn(true);
        const t = window.setTimeout(() => setOn(false), 110);
        return () => window.clearTimeout(t);
    }, [pulseToken]);

    return (
        <div
            aria-label="Metronome"
            title="Metronome"
            style={{
                width: size,
                height: size,
                borderRadius: "999px",
                background: "rgba(255,0,0,0.35)",
                boxShadow: on ? "0 0 18px rgba(255,0,0,0.95)" : "0 0 0 rgba(255,0,0,0)",
                transform: on ? "scale(1.35)" : "scale(1.0)",
                transition: "transform 80ms ease-out, box-shadow 80ms ease-out",
            }}
        />
    );
}