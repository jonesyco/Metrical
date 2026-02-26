# 🎤 Freestyle Trainer

A neuroscience-informed freestyle rap training application that teaches rhythm, flow, and improvisation through structured drills, real-time voice input, and adaptive coaching.

This project combines speech recognition, beat-synchronized feedback, and deliberate practice design to help beginners develop freestyle skills progressively.

## ✨ Core Concept

Freestyle Trainer acts like a practice coach + drill machine rather than a passive learning app.

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
repo/
├── app/        # React + Vite frontend (practice UI)
├── server/     # Node + Express backend API
└── README.md
```

### Frontend (Browser App)

**Tech stack:**
- React
- TypeScript
- Vite
- Web Audio API (metronome + timing)
- Web Speech API (live transcription)

**Key systems:**

| Module | Purpose |
|--------|---------|
| PracticeScreen | Main training interface |
| LiveSpeech | Real-time speech recognition |
| Metronome | Beat timing + synchronization |
| TimingAnalyzer | Rhythm & phrasing analysis |
| Curriculum Engine | Adaptive drill progression |

### Backend (Node/Express)

Provides:
- Session persistence
- Drill history storage
- Analysis results API
- Future adaptive curriculum logic

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm
- Chrome or Edge browser (required for SpeechRecognition API)

> ⚠️ Firefox currently does not support the Web Speech API.

### Installation

**1. Install dependencies**

From repo root:

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
- Use a standard system microphone (Bluetooth devices may behave inconsistently)

## 🎯 Current Features

✅ Metronome-driven practice drills
✅ Voice recording and transcription
✅ Real-time word detection
✅ Beat-aware training foundation
✅ Coaching feedback generation
✅ Adaptive session structure (early version)

## 🧩 Planned Features

- Beat-synced word ribbon (rhythm HUD)
- Technical coaching mode
- Rhyme density analysis
- Flow consistency scoring
- Style development tracking
- Personalized curriculum engine
- Desktop build (Electron)

## 🧪 Development Notes

### Speech Recognition

Uses the browser Web Speech API:
- `window.SpeechRecognition`
- `window.webkitSpeechRecognition`

Supported primarily in Chromium browsers.

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