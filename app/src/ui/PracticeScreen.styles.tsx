import type React from "react";

const INK = "#eef4f7";
const LINE = "1px solid rgba(255,255,255,0.08)";

export function statCard(label: string, value: string | number, accent?: string) {
    return (
        <div
            style={{
                minWidth: 76,
                padding: "5px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.09)",
                background: "rgba(255,255,255,0.04)",
                boxShadow: accent ? `0 0 0 1px ${accent} inset` : undefined,
            }}
        >
            <div style={{ fontSize: 10, letterSpacing: 0.6, opacity: 0.62 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.15 }}>{value}</div>
        </div>
    );
}

/** Shell for every side/stage panel. */
export const panelStyle: React.CSSProperties = {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.05)",
    border: LINE,
    boxShadow: "0 12px 32px rgba(0,0,0,0.20)",
};

export const panelTitleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    opacity: 0.62,
    marginBottom: 8,
};

export const fieldLabelStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    fontSize: 12,
    opacity: 0.75,
    marginBottom: 2,
};

export const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#11161c",
    color: INK,
    colorScheme: "dark",
    fontSize: 13,
};

export const preStyle: React.CSSProperties = {
    margin: 0,
    background: "rgba(0,0,0,0.30)",
    color: INK,
    border: LINE,
    padding: 10,
    borderRadius: 10,
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    fontSize: 13,
    lineHeight: 1.45,
};

export const coachInfoStyle: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 10,
    border: LINE,
    background: "rgba(255,255,255,0.03)",
};

export const coachLabelStyle: React.CSSProperties = {
    fontSize: 11,
    opacity: 0.62,
    marginBottom: 1,
};

export const coachValueStyle: React.CSSProperties = {
    fontSize: 13,
    lineHeight: 1.35,
};

export const metricRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 10,
    border: LINE,
    background: "rgba(255,255,255,0.03)",
    fontSize: 13,
};

export function transportButtonStyle(primary: boolean, disabled = false): React.CSSProperties {
    return {
        width: "100%",
        padding: "8px 12px",
        borderRadius: 10,
        border: primary
            ? "1px solid rgba(120,255,200,0.30)"
            : "1px solid rgba(255,255,255,0.10)",
        background: disabled
            ? "rgba(255,255,255,0.04)"
            : primary
                ? "linear-gradient(180deg, rgba(120,255,200,0.20) 0%, rgba(120,255,200,0.09) 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 100%)",
        color: disabled ? "rgba(255,255,255,0.42)" : INK,
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: 0.3,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 6px 16px rgba(0,0,0,0.20)",
    };
}

/** One option of a two-or-three-way toggle. */
export function segmentStyle(active: boolean, disabled = false): React.CSSProperties {
    return {
        flex: 1,
        padding: "5px 8px",
        borderRadius: 8,
        border: active ? "1px solid rgba(120,255,200,0.35)" : "1px solid transparent",
        background: active ? "rgba(120,255,200,0.12)" : "transparent",
        color: disabled ? "rgba(255,255,255,0.35)" : INK,
        fontSize: 12,
        fontWeight: active ? 800 : 600,
        cursor: disabled ? "not-allowed" : "pointer",
    };
}

export const segmentGroupStyle: React.CSSProperties = {
    display: "flex",
    gap: 2,
    padding: 2,
    borderRadius: 10,
    border: LINE,
    background: "rgba(255,255,255,0.03)",
};
