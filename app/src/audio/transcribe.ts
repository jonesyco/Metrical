import { blobTo16kWav } from "./wavEncode";
import type { TranscribeResponse } from "../ui/PracticeScreen.types";

const TRANSCRIBE_URL = "http://localhost:3001/api/transcribe";
const TIMEOUT_MS = 30000;

/**
 * Word-level transcript of a finished take, timed from the start of the
 * recording. Returns null (never throws) if the server can't transcribe, so a
 * take is still scored on rhythm alone.
 */
export async function transcribeTake(recording: Blob): Promise<TranscribeResponse | null> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const wav = await blobTo16kWav(recording);
        const form = new FormData();
        form.append("audio", wav, "take.wav");

        const resp = await fetch(TRANSCRIBE_URL, {
            method: "POST",
            body: form,
            signal: controller.signal,
        });
        if (!resp.ok) {
            console.warn("[transcribe]", resp.status, await resp.text());
            return null;
        }
        const data = (await resp.json()) as TranscribeResponse;
        return Array.isArray(data.words) ? data : null;
    } catch (e) {
        console.warn("[transcribe] failed:", e);
        return null;
    } finally {
        window.clearTimeout(timer);
    }
}
