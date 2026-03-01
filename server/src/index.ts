import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import { attachAsrWebSocket } from "./asr/AsrWsServer";

import multer from "multer";


const app = express();
app.use(cors());
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));
const upload = multer({ storage: multer.memoryStorage() });

app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "freestyle-trainer-server" });
});

/**
 * MOCK transcription endpoint.
 * Accepts audio file and returns a fake transcript + fake word timestamps.
 * Replace this with real STT later (e.g., Whisper).
 */
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

    // In a real version you’d run STT on req.file.buffer.
    // For now, return predictable mock data so the pipeline works.
    const transcript = "yeah uh I’m practicing bars on the beat staying in the pocket";
    const words = transcript.split(" ").map((w, i) => ({
        word: w,
        start: i * 0.25,
        end: i * 0.25 + 0.18,
    }));

    res.json({
        transcript,
        words,
    });
});

const port = process.env.PORT ? Number(process.env.PORT) : 8787;
const server = http.createServer(app);

attachAsrWebSocket(server, {
  whisperCliPath: process.env.WHISPER_CLI!,
  modelPath: process.env.WHISPER_MODEL!,
  windowSec: Number(process.env.ASR_WINDOW_SEC ?? 3),
  stepMs: Number(process.env.ASR_STEP_MS ?? 650),
  sampleRate: 16000,
});

const PORT = Number(process.env.Port ?? 3001);
server.listen(PORT, () => console.log(`HTTP+WS listening on ${PORT}`));