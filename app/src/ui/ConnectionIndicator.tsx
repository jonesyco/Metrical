type Props = {
    status: "connecting" | "connected" | "disconnected";
};

export default function ConnectionIndicator({ status }: Props) {
    const color =
        status === "connected"
            ? "#3cff7a"
            : status === "connecting"
                ? "#ffc400"
                : "#ff4040";

    const label =
        status === "connected"
            ? "Whisper Connected"
            : status === "connecting"
                ? "Connecting..."
                : "Disconnected";

    return (
        <div
            style={{
                position: "absolute",
                top: 12,
                right: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "#aaa",
            }}
        >
            <div
                style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: color,
                    boxShadow: `0 0 6px ${color}`,
                }}
            />
            {label}
        </div>
    );
}