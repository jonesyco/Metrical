import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import { attachAsrWebSocket } from "./asr/AsrWsServer";
import { transcribeWavWithWords } from "./asr/WhisperWords";

import multer from "multer";


const app = express();
app.use(cors());
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));
const upload = multer({ storage: multer.memoryStorage() });

app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "metrical-server" });
});

/**
 * Final transcription for a finished take. Expects a 16 kHz mono PCM16 WAV
 * (the browser converts the recording before upload) and returns word-level
 * timestamps in seconds from the start of the file.
 */
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

    if (!process.env.WHISPER_CLI || !process.env.WHISPER_MODEL) {
        return res.status(503).json({ error: "WHISPER_CLI / WHISPER_MODEL not configured" });
    }

    try {
        const result = await transcribeWavWithWords(req.file.buffer, {
            whisperCliPath: process.env.WHISPER_CLI,
            modelPath: process.env.WHISPER_MODEL,
            lang: "en",
        });
        res.json(result);
    } catch (e) {
        console.error("[transcribe] failed:", e);
        res.status(500).json({ error: (e as Error).message });
    }
});

const server = http.createServer(app);

attachAsrWebSocket(server, {
  whisperCliPath: process.env.WHISPER_CLI!,
  modelPath: process.env.WHISPER_MODEL!,
  windowSec: Number(process.env.ASR_WINDOW_SEC ?? 3),
  stepMs: Number(process.env.ASR_STEP_MS ?? 650),
  sampleRate: 16000,
});

const PORT = Number(process.env.PORT ?? 3001);
server.listen(PORT, () => console.log(`HTTP+WS listening on ${PORT}`));