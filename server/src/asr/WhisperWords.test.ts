import { describe, expect, it } from "vitest";
import { parseWhisperWordJson } from "./WhisperWords";

describe("parseWhisperWordJson", () => {
  it("turns one-word segments into timed words", () => {
    const json = {
      transcription: [
        { offsets: { from: 0, to: 320 }, text: " Yeah," },
        { offsets: { from: 320, to: 610 }, text: " I'm" },
        { offsets: { from: 610, to: 640 }, text: "." },
        { offsets: { from: 700, to: 1100 }, text: " rolling" },
      ],
    };
    expect(parseWhisperWordJson(json)).toEqual({
      transcript: "Yeah I'm rolling",
      words: [
        { word: "Yeah", start: 0, end: 0.32 },
        { word: "I'm", start: 0.32, end: 0.61 },
        { word: "rolling", start: 0.7, end: 1.1 },
      ],
    });
  });

  it("drops non-speech annotations and malformed segments", () => {
    const json = {
      transcription: [
        { offsets: { from: 0, to: 3000 }, text: " [BLANK_AUDIO]" },
        { offsets: { from: 0, to: 100 }, text: " (music)" },
        { text: " orphan" },
      ],
    };
    expect(parseWhisperWordJson(json)).toEqual({ transcript: "", words: [] });
  });

  it("tolerates unexpected shapes", () => {
    expect(parseWhisperWordJson(null).words).toEqual([]);
    expect(parseWhisperWordJson({}).words).toEqual([]);
  });
});
