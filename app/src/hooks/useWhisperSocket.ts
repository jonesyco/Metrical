import { useEffect, useRef, useState } from "react";

export type WhisperConnectionState =
    | "connecting"
    | "connected"
    | "reconnecting"
    | "disconnected";

export function useWhisperSocket(
    url: string,
    onMessage: (ev: MessageEvent) => void
) {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<number | null>(null);

    const [state, setState] =
        useState<WhisperConnectionState>("connecting");

    function connect() {
        setState("connecting");

        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("[Whisper] connected");
            setState("connected");
        };

        ws.onmessage = (ev) => {
            onMessage(ev);
        };

        ws.onerror = () => {
            console.warn("[Whisper] socket error");
        };

        ws.onclose = () => {
            console.warn("[Whisper] disconnected");

            setState("reconnecting");

            reconnectTimer.current = window.setTimeout(() => {
                connect();
            }, 1500);
        };
    }

    useEffect(() => {
        connect();

        return () => {
            if (reconnectTimer.current)
                clearTimeout(reconnectTimer.current);

            wsRef.current?.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url]);

    function send(data: ArrayBuffer | string) {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(data);
    }

    return {
        state,
        send,
        socket: wsRef.current,
    };
}