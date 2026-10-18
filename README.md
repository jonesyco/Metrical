# 🎤 Metrical

A neuroscience-informed freestyle rap training application that teaches rhythm, flow, and improvisation through structured drills, real-time voice input, and adaptive coaching.

This project combines speech recognition, beat-synchronized feedback, and deliberate practice design to help beginners develop freestyle skills progressively.

## ✨ Core Concept

Metrical acts like a practice coach + drill machine rather than a passive learning app.

The system:
- Runs timed freestyle drills
- Listens to live vocal input
- Aligns speech against a metronome
- Analyzes phrasing and rhythm
- Provides coaching feedback
- Adapts future exercises to the learner

Design inspiration: a battle-hardened hip-hop mentor evolving into a supportive technical coach.

## 🧠 Learning Principles

The training system incorporates research-backed learning techniques:

- **Spaced Repetition** — skills reappear when performance drops
- **Constraint Training** — drills limit cognitive scope to build mastery
- **Cognitive Load Management** — one skill focus per session
- **Immediate Feedback Loops** — real-time rhythm awareness
- **Deliberate Practice** — measurable improvement targets

## 🏗 Architecture Overview

```
Metrical/
├── app/        # React + Vite frontend (practice UI)
├── server/     # Node + Express backend API
└── README.md
```

### Frontend (Browser App)

**Tech stack:**
- React
- TypeScript
- Vite
- Web Audio API (metronome, AudioWorklet syllable-onset detection)
- whisper.cpp via the backend (live partial text + final word timestamps)

**Key systems:**

| Module | Purpose |
|--------|---------|
| PracticeScreen | Main training interface |
| Metronome | Click/beat scheduling on the shared AudioContext clock |
| LiveCapture + OnsetDetector | Mic capture and syllable-onset timing |
| RhythmAnalyzer + DrillScoring | Grid timing, bar structure, continuity, per-drill scores |
| RhymeAnalyzer / TimingAnalyzer | Rhyme density and phrasing from the final transcript |
| Curriculum Engine | Adaptive drill progression |

### Backend (Node/Express)

Provides:
- `/ws/asr`: live partial transcripts (rolling whisper.cpp window)
- `POST /api/transcribe`: word-level transcript of a finished take (16 kHz WAV in)

Session history and skills are stored in the browser (IndexedDB).
Set `WHISPER_CLI` and `WHISPER_MODEL` in `server/.env` to your whisper.cpp build and model.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm
- Chrome or Edge browser (AudioWorklet + MediaRecorder webm/opus)
- A whisper.cpp build (`whisper-cli`) and model for transcription; rhythm scoring works without it

### Installation

**1. Clone and install dependencies**

```bash
git clone https://github.com/jonesyco/Metrical.git
cd Metrical
```

Then:

```bash
cd app
npm install

cd ../server
npm install
```

**2. Run the backend**

```bash
cd server
npm run dev
```

Server runs on: http://localhost:3001

**3. Run the frontend**

In another terminal:

```bash
cd app
npm run dev
```

Open: http://localhost:5173

## 🎧 Microphone Permissions

The app requires microphone access.

When prompted by the browser:
- Allow microphone access
- Use headphones so the click/beat doesn't leak into the mic
- Run **Calibrate Timing** once per audio setup (clap on 8 clicks); Bluetooth adds large, variable latency

## 🎯 Current Features

✅ Metronome or boom-bap beat with count-in
✅ Syllable-level timing against the beat grid (latency-calibrated)
✅ Drill-specific scoring (grid, downbeats, bar endings, continuity, prompt use)
✅ Association drills with on-screen word prompts
✅ Final transcript with word timestamps, phrasing and rhyme density
✅ Light and technical coaching modes
✅ Adaptive curriculum with spaced repetition and unlockable drills
✅ Progress view (skill trends, recent takes)

## 🧩 Planned Features

- Style development tracking
- Free Flow reward mode
- Desktop build (Electron)

## 🧪 Development Notes

### Tests

```bash
cd app && npm test
cd server && npm test
```

### Type Declarations

Custom browser typings live in `app/src/types/`. These `.d.ts` files are automatically included by TypeScript and do not need to be imported.

## 🧱 Design Philosophy

This project treats freestyle rap as a trainable cognitive-motor skill, similar to learning an instrument.

The goal is not automation or lyric generation — but improving:
- timing
- verbal flow
- improvisational confidence
- rhythmic intuition

## 🤝 Contributing

Early experimental project — architecture and APIs may evolve rapidly.

Suggested contribution areas:
- audio timing improvements
- speech segmentation accuracy
- coaching heuristics
- UX for beginner artists

## 📜 License

MIT License (recommended — update if different).

## 🙌 Acknowledgments

Built at the intersection of:
- hip-hop improvisation culture
- cognitive science
- real-time web audio systems
- deliberate practice theory