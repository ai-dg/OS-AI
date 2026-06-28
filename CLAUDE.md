# OS-AI — AI-Native OS Interface

**Anthropic × Y Combinator Hackathon | 42AI | 24h build**

## What We Are Building
A full-screen black canvas where AI assembles the UI in real time around a user's voice. No windows, no apps, no switching — one screen, one agent, infinite context. Think JARVIS from Iron Man.

This is a **demo**, not a product. Every decision optimises for judge impact in a 5-minute presentation.

**Demo scenario:** Alex Dupont, 16 years old, starts their school day. JARVIS knows their classes, their homework progress, and their teachers. The demo proves the product is real by doing three things a normal OS cannot: it knows your context, it renders adaptive UI for every task type, and it executes on your behalf (sending a real email via Gmail MCP).

## Critical Commands
```bash
npm run dev          # Vite dev server on localhost:5173
npm run build        # tsc -b && vite build → dist/
npm run preview      # Preview prod build locally
npm run typecheck    # tsc -b --noEmit
```

## Tech Stack (authoritative — match this exactly when building new features)
- **Framework:** React 18 + Vite 7 + TypeScript (strict). Path alias `@/` → `src/`.
- **Styling:** **Tailwind CSS v4** via `@tailwindcss/vite` (`@import "tailwindcss"` in `index.css`). Utility classes are the default; use inline `style={{…}}` only for **dynamic** values (computed %, colours from data). No CSS Modules, no styled-components. The aesthetic is cyber-minimalist / ASCII-terminal: `font-mono` everywhere, the **zinc** palette, solid dark fills, sharp 1px borders.
- **Animation:** **Framer Motion v11** (`motion.*`, `initial`/`animate`/`transition`) for widget spawn, stagger, and bar fills. Plain CSS transitions are fine for trivial hovers. Keep it subtle.
- **AI:** Anthropic via **Vercel AI SDK v5** (`ai` + `@ai-sdk/anthropic`). Browser-side provider (`createAnthropic`, `anthropic-dangerous-direct-browser-access` header) — the key ships to the client, acceptable for a local demo only. Model: **`claude-sonnet-4-6`**.
- **AI contract:** Claude returns **one streamed JSON object** (`{ speech, canvas }`) — see Architecture below. This is **NOT** AI-SDK tool calling. `converse.ts` parses the JSON and mutates the canvas store directly.
- **MCP:** Gmail via the `mcp_servers` param on a raw Anthropic Messages API call (`src/ai/gmailMCP.ts`, beta header `mcp-client-2025-04-04`). A mock path spawns hardcoded emails when no OAuth/key is present.
- **Voice:**
  - **TTS** — `src/voice/AudioSynthesisService.ts`: **ElevenLabs** (`@elevenlabs/elevenlabs-js`, `eleven_flash_v2_5`, voice "George") with native `speechSynthesis` fallback. Sentence queue, pipelined synthesis, returns a `{ play, durationMs }` handle so text reveal paces to the audio.
  - **STT** — push-to-talk. `useWhisper.ts` (transformers.js `whisper-tiny.en` in a Web Worker) is the robust path; `useSpeech.ts` (Web Speech API) is the lightweight alternative.
- **State:** **Zustand** — `canvasStore`, `treeStore`, `projectStore` (+ `demoStore` for the scripted school demo). No Redux.
- **Persistence:** localStorage for project state snapshots (key prefix `jarvis_project_`).

## Project Structure
```
src/
  App.tsx                  # Orchestrator: voice → AI → canvas → tree
  main.tsx
  index.css                # @import "tailwindcss" + .canvas-bg dot grid
  canvas/
    Canvas.tsx             # Full-screen black canvas, camera/zoom transform, arrow overlay
    WidgetCanvas.tsx       # Maps the widget store to positioned renderers
    layoutManager.ts       # clampToSafeZone() + layout helpers
  widgets/
    types.ts               # Widget interface + the WidgetType union
    registry.tsx           # WIDGETS map: WidgetType → render fn (inline or imported component)
    dynamicSchema.ts       # Zod schema for the dict-based dynamic canvas format
    DynamicWidgetFactory.tsx
    EmailWidget.tsx
    ImageWidget.tsx
    # NEW (school demo) — each a component imported into registry.tsx:
    TaskList.tsx           # homework overview card (see WIDGETS.md)
    QCMWidget.tsx          # multiple-choice quiz (see WIDGETS.md)
    LessonWidget.tsx       # interactive lesson / SVG drawing (see WIDGETS.md)
    MailCompose.tsx        # compose + attach + send (see WIDGETS.md)
    Dialog.tsx             # yes/no prompt (see WIDGETS.md)
  ai/
    client.ts              # Browser-side Anthropic provider + MODEL constant
    converse.ts            # streamText loop, JSON parse, speech/canvas sync playback
    orchestrate.ts         # dispatch helpers for the legacy `widgets` + dynamic dict formats
    systemPrompt.ts        # JARVIS persona + widget catalog + project context injection
    gmailMCP.ts            # Gmail MCP server config + mock inbox
  voice/
    AudioSynthesisService.ts  # ElevenLabs TTS (+ native fallback)
    useWhisper.ts / whisperWorker.ts  # Whisper STT in a worker
    useSpeech.ts           # Web Speech API STT (alt)
    speech.d.ts
  components/
    Ticker.tsx             # Ephemeral spoken-sentence display
    ResponseBox.tsx        # Live streamed answer text
    ChatBox.tsx
    JarvisOrb.tsx          # Mic indicator / status orb
    ProjectLabel.tsx       # Top-left project name label
    # NEW: DemoControls.tsx — Reset Demo button + voice simulation button
  projects/
    projectStore.ts        # Project folder state — switch, save, restore (useProjectStore)
    # NEW: schoolData.ts   — pre-seeded demo data (Alex, teachers, homework)
  tree/
    ConversationTree.tsx   # SVG node graph at bottom of canvas
  store/
    canvasStore.ts         # Zustand canvas widget state + camera
    treeStore.ts           # Zustand conversation tree state
    # NEW: demoStore.ts    — demo step state machine
.claude/
  docs/                    # Deep-dive specs (this folder)
  commands/                # Claude Code slash commands
```

## Architecture — Read This First
The app is driven by a **single JSON contract** between Claude and the canvas — **not** tool calling.

`converse.ts` calls `streamText(...)`, streams the response, pulls the `speech` field out live for the ticker, then `JSON.parse`s the full buffer. Claude's primary format:

```json
{
  "speech": "Loading your view.|Here is the first item.|And the second.",
  "canvas": [
    { "action": "despawn", "id": "*" },
    { "action": "spawn", "type": "text-block", "id": "ctx", "x": 10, "y": 20, "w": 40, "h": 30, "data": { "title": "…", "body": "…" } },
    { "action": "zoom",  "targetId": "ctx", "scale": 1.4 }
  ]
}
```

- `speech` is **first** and uses `|` to mark segment boundaries. **One segment per canvas action**, played in lock-step: segment *i* is spoken (paced to its ElevenLabs clip duration) while `canvas[i]` paints. This keeps voice and UI in sync with no gaps.
- `x, y, w, h` are **percentages** (plain numbers, no `%`). Each canvas action is executed via `useCanvasStore.getState().spawn / despawn / zoomCamera`.
- Two **secondary** formats also exist and are auto-detected in `converse.ts`: a legacy declarative `widgets` array and a dict-based **dynamic** format (Zod-validated in `dynamicSchema.ts`, dispatched by `orchestrate.ts`).
- **Scripted demo steps** (the school flow) don't go through Claude at all — `demoStore` calls `useCanvasStore.getState().spawn(...)` directly with pre-authored widget data. Live free-form questions go through `converse`. Both end up in the same canvas store.

Widget type names: Claude emits friendly names (`text-block`, `bullet-list`, `stat-card`, `code-block`); `converse.ts`/`orchestrate.ts` map them to internal `WidgetType` values (`card`, `bullets`, `stat`, `code`) before spawning.

## State Shape
```ts
// store/canvasStore.ts (Zustand)
{
  widgets: Record<string, Widget>,
  order: string[],                  // render order, last = top
  cameraMode: "idle" | "zoom" | "spotlight",
  cameraTargetId: string | null,
  cameraZoomScale: number,
  // spawn / despawn / clear / zoomCamera / spotlightCamera / resetCamera / snapshot / restore
}

// store/demoStore.ts (NEW)
{
  currentStep: number,              // 0–8
  voiceButtonLabel: string | null,  // next phrase shown on the simulate button
  isComplete: boolean,
  advance: () => void,
  reset: () => void,
  onQCMComplete: (answers: Record<number, number>) => void,
  onMailSent: () => void,
  handleDialogAction: (action: string) => void,
}

// projects/projectStore.ts (useProjectStore)
{
  activeProjectId: 'history' | 'maths' | 'english',
  projects: Record<string, SchoolProject>,
  getActiveContext: () => string,   // injected into the system prompt
  setActiveProject: (id) => void,
  reset: () => void,
}
```

## New Data Types (School Demo)
Defined in `src/projects/schoolData.ts`. See PROJECTS.md / SCHOOL_DATA.md for the full seed.

```ts
interface Teacher { name: string; email: string; subject: string }
type HomeworkType = 'qcm' | 'lesson' | 'essay'
interface Homework { id: string; type: HomeworkType; title: string; dueDate: string; dueLabel: string; data: QCMData | LessonData | EssayData }
interface QCMData { subject: string; questions: QCMQuestion[]; answers: Record<number, number> }
interface LessonData { subject: string; beats: LessonBeat[]; currentBeat: number }
interface EssayData { subject: string; submitted: boolean; submittedAt?: string }
interface SchoolProject { id: string; name: string; teacher: Teacher; homeworks: Homework[]; history: ModelMessage[]; canvasState: Widget[]; tree: unknown[]; activeNodeId: string | null }
```

## Non-Negotiable Rules
1. **Never break the demo loop.** If Claude returns malformed JSON, `converse.ts` already falls back to a `text-block` widget with the raw text — never a blank screen or error. Preserve that.
2. **Black only.** Background is `#080808` (set in `index.css`). No white backgrounds. Widget cards use solid dark zinc fills with 1px `zinc-800`/low-alpha-white borders.
3. **Positions in percent.** All widget `x/y/w/h` are `%` of the canvas, plain numbers. Never `px` in widget data. **Reserved zone: `y + h ≤ 74`** — the bottom 26% is system UI (tree, controls, orb). Keep coordinates between 5 and 90.
4. **One font.** `font-mono` (`'JetBrains Mono', 'Fira Code', monospace`) everywhere. Scale: 10px labels, ~13px body (`text-xs`), 24px headings, 48px stat numbers.
5. **Animation via Framer Motion**, kept short (~200–400ms, ease-out). Project-switch wipe is the scan-line described in ANIMATIONS.md.
6. **No visible browser chrome.** `overflow: hidden` on body. No scrollbars on the canvas. No outlines.
7. **localStorage key prefix:** `jarvis_project_` — never read/write other keys.
8. **Reset Demo must be perfect.** `demoStore.reset()` returns to step 0 with a clean canvas (`canvasStore.clear()`) and fresh `schoolData`. No artifacts, no stale widgets.
9. **Progress is computed, not stored raw.** QCM = answered/total; lesson = currentBeat/totalBeats; essay = binary. See `computeProgress()` in `schoolData.ts`.
10. **Add a widget the existing way.** New type → add to the `WidgetType` union in `widgets/types.ts`, add a renderer in `widgets/registry.tsx` (inline fn, or a component file imported in like `EmailWidget`/`ImageWidget`), and add a catalog entry to `ai/systemPrompt.ts` if Claude should be able to spawn it.

## Key Files to Know
| File | What it does |
|---|---|
| `src/ai/converse.ts` | streamText loop, JSON parse, speech↔canvas sync playback, fallback |
| `src/ai/client.ts` | Browser-side Anthropic provider + `MODEL` |
| `src/ai/orchestrate.ts` | Dispatch for legacy `widgets` + dynamic dict formats; type-name mapping |
| `src/ai/systemPrompt.ts` | JARVIS persona + widget catalog + project context injection |
| `src/ai/gmailMCP.ts` | Gmail MCP server config (+ mock inbox) |
| `src/widgets/registry.tsx` | `WIDGETS` map — every renderer (Tailwind + Framer Motion) |
| `src/store/canvasStore.ts` | Canvas widget + camera state |
| `src/projects/projectStore.ts` | Project switch / save / restore (`useProjectStore`) |
| `src/projects/schoolData.ts` | Pre-seeded demo data — Alex, teachers, QCM, lesson beats |
| `src/store/demoStore.ts` | Demo step state machine — `currentStep`, `advance()`, `reset()` |
| `src/voice/AudioSynthesisService.ts` | ElevenLabs TTS (+ native fallback), audio-paced playback |

## See Also
- `.claude/docs/WIDGETS.md` — widget specs incl. new QCM, Lesson, TaskList, MailCompose, Dialog
- `.claude/docs/AI_CONTRACT.md` — the JSON contract, `converse.ts` pipeline, Gmail MCP
- `.claude/docs/PROJECTS.md` — school project folder system, switch animation spec
- `.claude/docs/DEMO_SCRIPT.md` — 8-step scripted demo with voice labels and fallback states
- `.claude/docs/ANIMATIONS.md` — every transition spec (Framer Motion + Tailwind)
- `.claude/docs/SCHOOL_DATA.md` — full pre-seeded data reference for Alex's school day
- `.claude/docs/BUILD_PLAN.md` — implementation order for the school demo

## Committing
When making commits, follow `.claude/commit-policy.md` — Conventional Commits format, no co-author lines, ask before committing autonomously.

## Setup
```bash
npm install
printf 'VITE_ANTHROPIC_API_KEY=sk-ant-...\nVITE_ELEVENLABS_API_KEY=...\n' > .env.local
npm run dev   # → http://localhost:5173
```
Use **Chrome or Edge** — the demo relies on Web Audio + (optionally) the Web Speech API.

This project uses the [ECC plugin](https://github.com/affaan-m/ECC) for Claude Code:
```bash
/plugin install ecc@ecc
/reload-plugins
```

## Key Commands
- `/ecc:cost-tracking` — view token usage and spend for this project
- `/code-review` — review current diff for bugs and improvements
- `/plan` — plan a feature before implementing
- `/ecc:save-session` — save session context before compacting
