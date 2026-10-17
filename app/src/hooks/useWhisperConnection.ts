import { useEffect, useState } from "react";

export type WhisperStatus =
    | "connecting"
    | "connected"
    | "disconnected";

export function useWhisperConnection(url: string) {
    const [status, setStatus] = useState<WhisperStatus>("connecting");
    const [socket, setSocket] = useState<WebSocket | null>(null);

    useEffect(() => {
        const ws = new WebSocket(url);

        ws.onopen = () => {
            setSocket(ws);
            setStatus("connected");
        };

        ws.onclose = () => {
            setStatus("disconnected");
        };

        ws.onerror = () => {
            setStatus("disconnected");
        };

        return () => {
            ws.close();
        };
    }, [url]);

    return { socket, status };
}