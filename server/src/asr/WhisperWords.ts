import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WhisperConfig } from "./WhisperRunner";

export type TimedWord = { word: string; start: number; end: number }; // seconds

export type WordTranscript = { transcript: string; words: TimedWord[] };

/**
 * Transcribes a whole take with word-level timestamps. Runs whisper-cli with
 * one word per segment (`-ml 1 -sow`) and JSON output (`-oj`).
 */
export async function transcribeWavWithWords(
  wavBytes: Buffer,
  cfg: WhisperConfig
): Promise<WordTranscript> {
  const dir = await mkdtemp(join(tmpdir(), "asr-take-"));
  const wavPath = join(dir, "take.wav");
  const outBase = join(dir, "take");

  try {
    await writeFile(wavPath, wavBytes);

    const args = [
      "-m", cfg.modelPath,
      "-f", wavPath,
      "-l", cfg.lang ?? "en",
      "-ml", "1",
      "-sow",
      "-oj",
      "-of", outBase,
      "-np",
      "--threads", "4",
    ];

    await new Promise<void>((resolve, reject) => {
      const p = spawn(cfg.whisperCliPath, args, { windowsHide: true });
      let stderr = "";
      p.stderr.on("data", (d) => (stderr += d.toString("utf8")));
      p.on("error", reject);
      p.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`whisper-cli exited ${code}. stderr:\n${stderr}`));
      });
    });

    const json = JSON.parse(await readFile(`${outBase}.json`, "utf8"));
    return parseWhisperWordJson(json);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

type WhisperJsonSegment = {
  offsets?: { from?: number; to?: number };
  text?: string;
};

/** Converts whisper-cli `-oj` output (one segment per word) into timed words. */
export function parseWhisperWordJson(json: unknown): WordTranscript {
  const segments: WhisperJsonSegment[] =
    (json as { transcription?: WhisperJsonSegment[] })?.transcription ?? [];

  const words: TimedWord[] = [];
  for (const seg of segments) {
    const raw = (seg.text ?? "").trim();
    // Skip non-speech annotations like "[BLANK_AUDIO]" or "(music)".
    if (!raw || /^[[(].*[\])]$/.test(raw)) continue;

    const from = seg.offsets?.from;
    const to = seg.offsets?.to;
    if (typeof from !== "number" || typeof to !== "number") continue;

    // Punctuation sometimes arrives as its own segment; attach it to nothing.
    const word = raw.replace(/^[^\w']+|[^\w']+$/g, "");
    if (!word) continue;

    words.push({ word, start: from / 1000, end: to / 1000 });
  }

  return { transcript: words.map((w) => w.word).join(" "), words };
}
