# JARVIS — AI-Native OS Interface
**Anthropic × Y Combinator Hackathon | 42AI | 24h**

> One black screen. You speak. The AI assembles the UI around you in real time.

---

## Quick Start

```bash
npm install
# Add your Anthropic API key:
echo "VITE_ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
# → http://localhost:5173
```

**Controls:**
- `Space` — push to talk
- `D` — demo mode (arrow keys to advance steps)
- `Cmd+1/2/3` — switch projects (Email / Code / Hackathon)
- `Escape` — clear canvas

---

## What This Is

A proof-of-concept for an AI-native OS interface. The user speaks; Claude responds with both:
1. **Speech** — streamed word-by-word to the ticker
2. **Canvas commands** — JSON instructions that spawn/despawn/zoom widgets on a black canvas

No static UI. No windows. No apps. The interface is assembled in real time by the AI.

---

## Project Structure

```
src/
  canvas/         Canvas.jsx — full-screen root, zoom, particles
  widgets/        One file per widget type + WidgetRenderer.jsx
  ai/             claudeClient.js, systemPrompt.js, streamParser.js
  projects/       projectStore.js — 3 pre-seeded demo projects
  voice/          VoiceInput.jsx, MicIndicator.jsx
  tree/           ConversationTree.jsx — SVG node graph
  components/     Ticker.jsx, ProjectLabel.jsx
.claude/
  docs/           Deep-dive specs (WIDGETS, AI_CONTRACT, PROJECTS, ANIMATIONS, DEMO_SCRIPT, TREE)
  commands/       Slash commands: /new-widget, /demo-check, /debug-canvas
CLAUDE.md         ← Claude Code reads this first. Start here.
```

---

## Key Concept: The JSON Contract

Claude always responds with:
```json
{
  "speech": "What streams to the ticker",
  "canvas": [
    { "action": "spawn", "type": "email-ui", "id": "e1", "x": 30, "y": 25, "w": 38, "h": 16, "data": { ... } },
    { "action": "zoom", "targetId": "e1", "scale": 1.5 }
  ]
}
```

## Environment Variables
```
VITE_ANTHROPIC_API_KEY=   # Required — your Anthropic API key
```

---

## Demo Projects (pre-seeded)

| `Cmd+` | Project | Context |
|---|---|---|
| `1` | Email & Comms | Gmail MCP active, email-ui widgets |
| `2` | Code Review | Technical mode, code-block widgets |
| `3` | Hackathon Pitch | Vision mode, stat-cards + bullets |

---

## For Claude Code Users
Open this repo in Claude Code. The `CLAUDE.md` at root gives full architectural context. Sub-docs in `.claude/docs/` load automatically when you work in the relevant directories. Use slash commands:
- `/new-widget` — scaffold a new widget type end to end
- `/demo-check` — run the full pre-demo readiness checklist
- `/debug-canvas` — diagnose Claude API → canvas render issues
