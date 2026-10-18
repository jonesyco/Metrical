# Copilot instructions for Metrical

## Build, lint, and test

This repository has two separate Node packages and no root workspace scripts.

| Area | Command | Notes |
| --- | --- | --- |
| Frontend dev server | `cd app && npm run dev` | Vite app on `http://localhost:5173` |
| Frontend lint | `cd app && npm run lint` | Clean baseline; treat new errors as regressions |
| Frontend build | `cd app && npm run build` | Clean baseline |
| Frontend tests | `cd app && npm test` | Vitest; engine tests live in `app/src/engine/__tests__/`. Single file: `npx vitest run src/engine/__tests__/RhythmAnalyzer.test.ts` |
| Backend dev server | `cd server && npm run dev` | Express + WebSocket server expected on `http://localhost:3001` |
| Backend tests / types | `cd server && npm test` / `npm run typecheck` | Vitest, colocated `*.test.ts` |

## High-level architecture

- `app/` is the main product surface. `app/src/ui/PracticeScreen.tsx` is the orchestration hub for a practice session: it opens the mic inside the metronome's AudioContext (`audio/LiveCapture.ts`), runs the count-in, streams to live Whisper, records the take, uploads it for word-level transcription, scores it, updates skill/review state, and renders the session panels.
- `app/src/engine/` is the browser-side training engine. Keep planning, scoring, and progression logic here as pure TypeScript helpers rather than embedding it in React components. The main flow is:
  - `DrillLibrary.ts` defines drills, skill targets, and display metadata.
  - `CurriculumEngine.ts` picks the daily session from current skills and due reviews.
  - `OnsetDetector.ts` finds syllable attacks in the energy frames from `public/energy-worklet.js`; `RhythmAnalyzer.ts` measures them against the beat grid; `DrillScoring.ts` turns that into a per-drill score and observations for the skills the drill targets. **Rhythm scoring comes from onsets, never from transcript timing.**
  - `Calibration.ts` estimates round-trip mic latency (subtracted from every onset); `PromptBank.ts` schedules and scores association prompts.
  - `TimingAnalyzer.ts`/`PhraseAnalyzer.ts`/`PhraseTimingMath.ts` (phrasing) and `RhymeAnalyzer.ts` run on the final transcript's word timestamps and feed coaching only.
  - `SkillModel.ts` and `ReviewScheduler.ts` convert those metrics into persistent progression data.
- `app/src/storage/db.ts` persists everything client-side with IndexedDB (`attempts`, `skills`, `reviews`). There is no backend database yet; progression state lives in the browser.
- `server/` is a thin API/ASR host. `server/src/index.ts` serves health endpoints, `POST /api/transcribe` (16 kHz WAV in, word timestamps out via `asr/WhisperWords.ts`; the browser converts the recording in `audio/wavEncode.ts`), and an HTTP server that also hosts the WebSocket ASR endpoint.
- `server/src/asr/AsrWsServer.ts` accepts PCM16 audio on `/ws/asr`, keeps a rolling audio window, converts it to WAV, and calls `WhisperRunner.ts`, which shells out to `whisper-cli`.

## Key conventions

- **One clock.** The metronome owns the only AudioContext; mic capture, onset detection, and the ASR worklet all run inside it, so onset times compare directly with scheduled beat times. Don't create another AudioContext for anything timing-related.
- Treat the app as a **hybrid transcription pipeline**:
  - live partial text comes from the WebSocket whisper stream (`app/src/audio/WhisperStreamClient.ts` -> `server/src/asr/AsrWsServer.ts`); it arrives seconds late and is for display/prompt matching only
  - the final transcript and word timestamps come from `POST /api/transcribe`; the client treats failure as "no transcript" and still scores rhythm
  Changes to transcription usually need both paths reviewed together.
- The frontend is currently **hard-wired to localhost backend URLs**:
  - `ws://localhost:3001/ws/asr` (`ui/PracticeScreen.tsx`)
  - `http://localhost:3001/api/transcribe` (`audio/transcribe.ts`)
  If you change backend ports or add config, update these call sites together.
- Drill IDs and skill keys are strict shared vocabulary. When adding a drill or a new skill dimension, update the string unions in `app/src/engine/Types.ts` and then wire the change through `DrillLibrary.ts` (every drill needs a `scoring` profile), curriculum selection, `DrillScoring.ts`, review scheduling, and any UI selectors/panels that expose drills or skill labels.
- UI composition is intentionally split between one stateful orchestrator and mostly presentational panels. Keep new business logic near `PracticeScreen.tsx` or the `engine/` and `storage/` layers; keep `app/src/ui/components/` focused on display and control props.
- Browser/audio integration relies on repository-specific support files:
  - `app/public/asr-worklet.js` must stay aligned with `WhisperStreamClient.ts`
  - `app/public/energy-worklet.js` must stay aligned with `LiveCapture.ts` (message format: `Float64Array [t0, e0, t1, e1, ...]`)
  - custom browser typings live in `app/src/types/*.d.ts`
  Avoid replacing these with generic abstractions unless you update the dependent audio pipeline too.
- The app expects microphone access and is designed around Chromium-class browser APIs. Mic constraints keep echo cancellation on but noise suppression/AGC off, because those smear the attack envelope the onset detector relies on.
- The backend ASR path depends on environment variables for `WHISPER_CLI`, `WHISPER_MODEL`, `ASR_WINDOW_SEC`, and `ASR_STEP_MS`. Keep that contract in mind before changing server startup or WebSocket behavior.
