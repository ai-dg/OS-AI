# FLOW

### The OS overlay for the AI era

**No files. No windows. No learning curve.**
A single intelligent interface that handles everything — so you never have to.

> One black screen. You speak. The AI assembles the UI around you in real time.

*Anthropic × Y Combinator Hackathon · 42AI · 24h build*

---

## Quick Start

```bash
npm install

# Copy the template, then fill in your keys (client-side, local demo only):
cp .env.local.example .env.local
# open .env.local and set VITE_ANTHROPIC_API_KEY (+ optional VITE_ELEVENLABS_API_KEY)

npm run dev      # → http://localhost:5173
```

Use **Chrome or Edge**. `VITE_ANTHROPIC_API_KEY` is required; `VITE_ELEVENLABS_API_KEY` is optional (premium neural voice — falls back to the browser voice without it).

**Controls**
- `Space` (hold) — push to talk · `/` — type instead
- `Esc` — clear canvas · `Ctrl+C` — cancel the AI mid-answer
- `Alt+1/2/3` — switch project · click a node — time-travel a past canvas

---

## What it is

A proof-of-concept AI-native OS. You speak; Claude answers two ways at once — **out loud**, and by **assembling the screen**. No static UI, no apps: the interface is built in real time, then cleared for the next intent.

## How it works

```
voice (Whisper, local) → Claude → { speech, canvas } → spoken + drawn, in sync
```

- **One streamed JSON contract**, not tool calls: Claude returns `{ speech, canvas }`. `speech` is spoken sentence-by-sentence; each `|`-segment is locked to one `canvas` action (spawn / zoom / pan / despawn…) on a virtual **spatial canvas** the camera flies over.
- **Voice** — STT: local **Whisper** in a Web Worker (push-to-talk). TTS: **ElevenLabs** neural voice, pre-synthesized during generation for instant, gap-free playback (native voice fallback).
- **Scripted demo** runs on two independent agents — an **intent router** that maps each utterance to a feature, and a **progress tracker** that marks demo steps — so the school-day demo flows in any order.

## Stack

React 18 · Vite · TypeScript · Tailwind v4 · Vercel AI SDK (`@ai-sdk/anthropic`) · Zustand · Framer Motion · Whisper (`@huggingface/transformers`) · ElevenLabs

## Layout

```
src/
  App.tsx            Orchestrator: voice ↔ AI ↔ canvas ↔ tree
  ai/                converse · systemPrompt · intentRouter · progressTracker · lessonTutor
  voice/             useWhisper (STT) · AudioSynthesisService (TTS)
  canvas/ widgets/   spatial canvas + widget registry
  store/ projects/   Zustand state + seeded school data
CLAUDE.md            ← Claude Code reads this first.
```
