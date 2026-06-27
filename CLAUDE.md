# OS-AI — AI-Native OS Interface

**Anthropic × Y Combinator Hackathon | 42AI | 24h build**

## What We Are Building
A full-screen black canvas where AI assembles the UI in real time around a user's voice. No windows, no apps, no switching — one screen, one agent, infinite context. Think JARVIS from Iron Man.

This is a **demo**, not a product. Every decision optimises for judge impact in a 4-minute presentation.

## Critical Commands
```bash
npm run dev          # Vite dev server on localhost:5173
npm run build        # Production build → dist/
npm run preview      # Preview prod build locally
```

## Tech Stack
- **Framework:** React 18 + Vite
- **Styling:** Plain CSS (no Tailwind — absolute positioning is core to the widget system)
- **AI:** Anthropic API (`claude-sonnet-4-6`) via `fetch` with streaming
- **MCP:** Gmail via `mcp_servers` param in API call (`https://gmailmcp.googleapis.com/mcp/v1`)
- **State:** Single top-level React state object — no Redux, no Zustand
- **Persistence:** localStorage for project state snapshots
- **Animations:** CSS transitions only — no GSAP, no Framer Motion

## Project Structure
```
src/
  canvas/         # Full-screen black canvas, particle bg, zoom system
  widgets/        # One file per widget type
  ai/             # Claude API call, JSON parser, streaming handler
  projects/       # Project folder state — history, canvas, tree per project
  voice/          # Web Speech API, mic indicator
  tree/           # Conversation tree SVG node graph
  components/     # Ticker, project label
public/
.claude/
  docs/           # Deep-dive specs loaded on demand
  commands/       # Claude Code slash commands
```

## Architecture — Read This First
The entire app is driven by a **single JSON contract** between Claude and the canvas:

```json
{
  "speech": "Here are your latest emails...",
  "canvas": [
    { "action": "spawn", "type": "email-ui", "id": "email-1", "x": 20, "y": 30, "w": 35, "h": 40, "data": { ... } },
    { "action": "zoom",  "targetId": "email-1", "scale": 1.6 },
    { "action": "despawn", "id": "old-widget-id" }
  ]
}
```

- `x`, `y`, `w`, `h` are **percentages** of canvas dimensions
- `speech` streams immediately to the ticker; `canvas` renders after full JSON is received
- Every widget has a unique `id` used by zoom, highlight, and despawn commands

## State Shape
```js
{
  activeProjectId: 'email',
  projects: {
    email:   { name: 'Email & Comms',     context: '...', history: [], canvasState: [], tree: [] },
    code:    { name: 'Code Review',        context: '...', history: [], canvasState: [], tree: [] },
    hackathon: { name: 'Hackathon Pitch', context: '...', history: [], canvasState: [], tree: [] },
  }
}
```

## Non-Negotiable Rules
1. **Never break the demo loop.** If Claude API returns malformed JSON, fall back to a `text-block` widget with the raw speech — never a blank screen or error.
2. **Black only.** Background is `#080808`. No white backgrounds anywhere. Widget cards use `rgba(255,255,255,0.05)` bg with `rgba(255,255,255,0.08)` border.
3. **Positions in percent.** All widget x/y/w/h values are `%` of canvas. Never `px` in widget data.
4. **One font.** Use `'JetBrains Mono', 'Fira Code', monospace` everywhere. Size scale: 10px labels, 14px body, 24px headings, 48px stat numbers.
5. **Transitions are always 300ms ease-out.** No exceptions. Project switch wipe is 250ms.
6. **No visible browser chrome.** `overflow: hidden` on body. No scrollbars. No outlines.
7. **localStorage key prefix:** `jarvis_project_` — never read/write other keys.

## Key Files to Know
| File | What it does |
|---|---|
| `src/ai/claudeClient.js` | Anthropic API call with streaming + MCP config |
| `src/ai/systemPrompt.js` | Claude's full instruction set + widget catalog |
| `src/canvas/Canvas.jsx` | Root canvas component, zoom handler, particle bg |
| `src/widgets/WidgetRenderer.jsx` | Renders any widget type from a data object |
| `src/projects/projectStore.js` | All project state logic — switch, save, restore |
| `src/tree/ConversationTree.jsx` | SVG node graph at bottom of canvas |

## See Also
- `.claude/docs/WIDGETS.md` — full widget type specs and data schemas
- `.claude/docs/PROJECTS.md` — project folder system, switch animation spec
- `.claude/docs/AI_CONTRACT.md` — Claude system prompt and full JSON schema
- `.claude/docs/DEMO_SCRIPT.md` — 7-step demo mode and keyboard shortcuts
- `.claude/docs/ANIMATIONS.md` — every transition spec in one place
## Setup

This project uses the [ECC plugin](https://github.com/affaan-m/ECC) for Claude Code. To get started:

```bash
/plugin install ecc@ecc
/reload-plugins
```

## Project Overview

<!-- TODO: describe what this project does -->

## Key Commands

- `/ecc:cost-tracking` — view token usage and spend for this project
- `/code-review` — review current diff for bugs and improvements
- `/plan` — plan a feature before implementing
- `/ecc:save-session` — save session context before compacting
