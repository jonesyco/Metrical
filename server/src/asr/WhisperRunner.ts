import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type WhisperConfig = {
  whisperCliPath: string;
  modelPath: string;
  lang?: string; // "en"
};

export async function runWhisperOnWav(
  wavBytes: Buffer,
  cfg: WhisperConfig
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "asr-"));
  const wavPath = join(dir, "chunk.wav");

  try {
    await writeFile(wavPath, wavBytes);

    // whisper-cli prints text to stdout (we parse it)
    const args = [
      "-m",
      cfg.modelPath,
      "-f",
      wavPath,
      "-l",
      cfg.lang ?? "en",
      "--no-timestamps",
      "--print-progress",
      "0",
      "--threads",
      "4",
    ];

    const text = await new Promise<string>((resolve, reject) => {
      const p = spawn(cfg.whisperCliPath, args, { windowsHide: true });

      let stdout = "";
      let stderr = "";

      p.stdout.on("data", (d) => (stdout += d.toString("utf8")));
      p.stderr.on("data", (d) => (stderr += d.toString("utf8")));

      p.on("error", reject);
      p.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`whisper-cli exited ${code}. stderr:\n${stderr}`));
          return;
        }
        // stdout contains lines; last meaningful line is often the transcript
        resolve(extractTranscript(stdout));
      });
    });

    return text.trim();
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function extractTranscript(stdout: string): string {
  // whisper-cli output varies by build; this heuristic grabs the last non-empty line
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Remove progress-like lines if present
  const cleaned = lines.filter(
    (l) => !l.startsWith("whisper_print_timings") && !l.startsWith("ggml_")
  );

  return (cleaned[cleaned.length - 1] ?? "").replace(/^\[.*?\]\s*/, "");
}